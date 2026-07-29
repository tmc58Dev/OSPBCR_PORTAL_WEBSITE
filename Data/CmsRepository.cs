using System.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.SqlClient;
using OSPBCR_PORTAL.Models;

namespace OSPBCR_PORTAL.Data;

public sealed class CmsRepository(
    IOspbcrPortalConnectionFactory connectionFactory,
    IPasswordHasher<CmsUser> passwordHasher) : ICmsRepository
{
    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            IF OBJECT_ID(N'dbo.CmsUsers', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.CmsUsers
                (
                    UserId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CmsUsers PRIMARY KEY,
                    Username NVARCHAR(80) NOT NULL,
                    PasswordHash NVARCHAR(500) NOT NULL,
                    Role NVARCHAR(20) NOT NULL,
                    IsActive BIT NOT NULL CONSTRAINT DF_CmsUsers_IsActive DEFAULT (1),
                    CreatedAt DATETIMEOFFSET(0) NOT NULL CONSTRAINT DF_CmsUsers_CreatedAt DEFAULT (SYSDATETIMEOFFSET()),
                    UpdatedAt DATETIMEOFFSET(0) NOT NULL CONSTRAINT DF_CmsUsers_UpdatedAt DEFAULT (SYSDATETIMEOFFSET()),
                    CONSTRAINT CK_CmsUsers_Role CHECK (Role IN (N'Admin', N'User'))
                );
                CREATE UNIQUE INDEX UX_CmsUsers_Username ON dbo.CmsUsers(Username);
            END;

            IF OBJECT_ID(N'dbo.NewsCards', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.NewsCards
                (
                    NewsCardId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_NewsCards PRIMARY KEY,
                    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_NewsCards_Status DEFAULT (N'Published'),
                    CreatedBy INT NOT NULL,
                    CreatedAt DATETIMEOFFSET(0) NOT NULL CONSTRAINT DF_NewsCards_CreatedAt DEFAULT (SYSDATETIMEOFFSET()),
                    UpdatedBy INT NOT NULL,
                    UpdatedAt DATETIMEOFFSET(0) NOT NULL CONSTRAINT DF_NewsCards_UpdatedAt DEFAULT (SYSDATETIMEOFFSET()),
                    CONSTRAINT CK_NewsCards_Status CHECK (Status IN (N'Published', N'Draft')),
                    CONSTRAINT FK_NewsCards_CreatedBy FOREIGN KEY (CreatedBy) REFERENCES dbo.CmsUsers(UserId),
                    CONSTRAINT FK_NewsCards_UpdatedBy FOREIGN KEY (UpdatedBy) REFERENCES dbo.CmsUsers(UserId)
                );
            END;

            IF OBJECT_ID(N'dbo.NewsCardTranslations', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.NewsCardTranslations
                (
                    NewsCardId INT NOT NULL,
                    LanguageCode CHAR(2) NOT NULL,
                    Title NVARCHAR(MAX) NOT NULL,
                    PublishDate DATE NOT NULL,
                    ImagePath NVARCHAR(500) NOT NULL,
                    TextNote NVARCHAR(MAX) NOT NULL,
                    Footer NVARCHAR(MAX) NOT NULL,
                    CONSTRAINT PK_NewsCardTranslations PRIMARY KEY (NewsCardId, LanguageCode),
                    CONSTRAINT FK_NewsCardTranslations_NewsCard FOREIGN KEY (NewsCardId)
                        REFERENCES dbo.NewsCards(NewsCardId) ON DELETE CASCADE,
                    CONSTRAINT CK_NewsCardTranslations_Language CHECK (LanguageCode IN ('en', 'hi', 'or'))
                );
                CREATE INDEX IX_NewsCardTranslations_PublishDate
                    ON dbo.NewsCardTranslations(LanguageCode, PublishDate DESC);
            END;

            IF EXISTS
            (
                SELECT 1
                FROM sys.columns
                WHERE object_id = OBJECT_ID(N'dbo.NewsCardTranslations')
                  AND name = N'Title'
                  AND max_length <> -1
            )
                ALTER TABLE dbo.NewsCardTranslations ALTER COLUMN Title NVARCHAR(MAX) NOT NULL;

            IF EXISTS
            (
                SELECT 1
                FROM sys.columns
                WHERE object_id = OBJECT_ID(N'dbo.NewsCardTranslations')
                  AND name = N'TextNote'
                  AND max_length <> -1
            )
                ALTER TABLE dbo.NewsCardTranslations ALTER COLUMN TextNote NVARCHAR(MAX) NOT NULL;

            IF EXISTS
            (
                SELECT 1
                FROM sys.columns
                WHERE object_id = OBJECT_ID(N'dbo.NewsCardTranslations')
                  AND name = N'Footer'
                  AND max_length <> -1
            )
                ALTER TABLE dbo.NewsCardTranslations ALTER COLUMN Footer NVARCHAR(MAX) NOT NULL;

            IF OBJECT_ID(N'dbo.NewsCardImages', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.NewsCardImages
                (
                    NewsCardImageId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_NewsCardImages PRIMARY KEY,
                    NewsCardId INT NOT NULL,
                    ImagePath NVARCHAR(500) NOT NULL,
                    SortOrder INT NOT NULL,
                    CONSTRAINT FK_NewsCardImages_NewsCard FOREIGN KEY (NewsCardId)
                        REFERENCES dbo.NewsCards(NewsCardId) ON DELETE CASCADE,
                    CONSTRAINT UX_NewsCardImages_Path UNIQUE (NewsCardId, ImagePath),
                    CONSTRAINT UX_NewsCardImages_SortOrder UNIQUE (NewsCardId, SortOrder)
                );
            END;

            ;WITH LegacyImages AS
            (
                SELECT t.NewsCardId, t.ImagePath,
                       MIN(CASE t.LanguageCode WHEN 'en' THEN 1 WHEN 'hi' THEN 2 ELSE 3 END) AS LanguageOrder
                FROM dbo.NewsCardTranslations t
                WHERE NULLIF(LTRIM(RTRIM(t.ImagePath)), N'') IS NOT NULL
                GROUP BY t.NewsCardId, t.ImagePath
            ),
            NumberedImages AS
            (
                SELECT NewsCardId, ImagePath,
                       ROW_NUMBER() OVER
                       (
                           PARTITION BY NewsCardId
                           ORDER BY LanguageOrder, ImagePath
                       ) - 1 AS SortOrder
                FROM LegacyImages
            )
            INSERT INTO dbo.NewsCardImages (NewsCardId, ImagePath, SortOrder)
            SELECT legacy.NewsCardId, legacy.ImagePath, legacy.SortOrder
            FROM NumberedImages legacy
            WHERE NOT EXISTS
            (
                SELECT 1
                FROM dbo.NewsCardImages existing
                WHERE existing.NewsCardId = legacy.NewsCardId
            );
            """;
        await command.ExecuteNonQueryAsync(cancellationToken);

        await using var existsCommand = connection.CreateCommand();
        existsCommand.CommandText = "SELECT COUNT(1) FROM dbo.CmsUsers WHERE Username = N'admin';";
        var exists = Convert.ToInt32(await existsCommand.ExecuteScalarAsync(cancellationToken)) > 0;
        if (exists)
        {
            return;
        }

        var admin = new CmsUser { Username = "admin", Role = CmsRoles.Admin, IsActive = true };
        admin.PasswordHash = passwordHasher.HashPassword(admin, "admin");
        await using var seedCommand = connection.CreateCommand();
        seedCommand.CommandText = """
            INSERT INTO dbo.CmsUsers (Username, PasswordHash, Role, IsActive, CreatedAt, UpdatedAt)
            VALUES (@Username, @PasswordHash, @Role, 1, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
            """;
        seedCommand.Parameters.AddWithValue("@Username", admin.Username);
        seedCommand.Parameters.AddWithValue("@PasswordHash", admin.PasswordHash);
        seedCommand.Parameters.AddWithValue("@Role", admin.Role);
        await seedCommand.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<CmsUser?> FindUserByUsernameAsync(string username, CancellationToken cancellationToken = default)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT TOP (1) UserId, Username, PasswordHash, Role, IsActive, CreatedAt, UpdatedAt
            FROM dbo.CmsUsers
            WHERE Username = @Username;
            """;
        command.Parameters.AddWithValue("@Username", username);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? ReadUser(reader) : null;
    }

    public async Task<IReadOnlyList<CmsUser>> GetUsersAsync(CancellationToken cancellationToken = default)
    {
        var result = new List<CmsUser>();
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT UserId, Username, PasswordHash, Role, IsActive, CreatedAt, UpdatedAt
            FROM dbo.CmsUsers
            ORDER BY CASE WHEN Role = N'Admin' THEN 0 ELSE 1 END, Username;
            """;
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            result.Add(ReadUser(reader));
        }
        return result;
    }

    public Task<int> CountUsersAsync(CancellationToken cancellationToken = default) =>
        ExecuteCountAsync("SELECT COUNT(*) FROM dbo.CmsUsers;", cancellationToken);

    public async Task<int> CreateUserAsync(CmsUser user, CancellationToken cancellationToken = default)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO dbo.CmsUsers (Username, PasswordHash, Role, IsActive, CreatedAt, UpdatedAt)
            OUTPUT INSERTED.UserId
            VALUES (@Username, @PasswordHash, @Role, @IsActive, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
            """;
        AddUserParameters(command, user);
        return Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken));
    }

    public async Task<bool> UpdateUserAsync(CmsUser user, string? newPasswordHash, CancellationToken cancellationToken = default)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            UPDATE dbo.CmsUsers
            SET Username = @Username,
                Role = @Role,
                IsActive = @IsActive,
                PasswordHash = COALESCE(@PasswordHash, PasswordHash),
                UpdatedAt = SYSDATETIMEOFFSET()
            WHERE UserId = @UserId;
            """;
        command.Parameters.AddWithValue("@UserId", user.Id);
        command.Parameters.AddWithValue("@Username", user.Username);
        command.Parameters.AddWithValue("@Role", user.Role);
        command.Parameters.AddWithValue("@IsActive", user.IsActive);
        command.Parameters.Add("@PasswordHash", SqlDbType.NVarChar, 500).Value =
            newPasswordHash is null ? DBNull.Value : newPasswordHash;
        return await command.ExecuteNonQueryAsync(cancellationToken) == 1;
    }

    public async Task<bool> DeleteUserAsync(int id, CancellationToken cancellationToken = default)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            DELETE FROM dbo.CmsUsers
            WHERE UserId = @UserId
              AND NOT EXISTS (SELECT 1 FROM dbo.NewsCards WHERE CreatedBy = @UserId OR UpdatedBy = @UserId);
            """;
        command.Parameters.AddWithValue("@UserId", id);
        return await command.ExecuteNonQueryAsync(cancellationToken) == 1;
    }

    public async Task<IReadOnlyList<NewsCard>> GetNewsCardsAsync(CancellationToken cancellationToken = default)
    {
        var cards = new Dictionary<int, NewsCard>();
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = NewsSelectSql +
            " ORDER BY n.UpdatedAt DESC, n.NewsCardId DESC, i.SortOrder, t.LanguageCode;";
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            ReadNewsRow(reader, cards);
        }
        return cards.Values.ToList();
    }

    public Task<int> CountNewsCardsAsync(CancellationToken cancellationToken = default) =>
        ExecuteCountAsync("SELECT COUNT(*) FROM dbo.NewsCards;", cancellationToken);

    public async Task<NewsCard?> GetNewsCardAsync(int id, CancellationToken cancellationToken = default)
    {
        var cards = new Dictionary<int, NewsCard>();
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = NewsSelectSql +
            " WHERE n.NewsCardId = @NewsCardId ORDER BY i.SortOrder, t.LanguageCode;";
        command.Parameters.AddWithValue("@NewsCardId", id);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            ReadNewsRow(reader, cards);
        }
        return cards.Values.SingleOrDefault();
    }

    public async Task<int> CreateNewsCardAsync(NewsCard card, CancellationToken cancellationToken = default)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(cancellationToken);
        try
        {
            await using var cardCommand = connection.CreateCommand();
            cardCommand.Transaction = transaction;
            cardCommand.CommandText = """
                INSERT INTO dbo.NewsCards (Status, CreatedBy, CreatedAt, UpdatedBy, UpdatedAt)
                OUTPUT INSERTED.NewsCardId
                VALUES (@Status, @CreatedBy, SYSDATETIMEOFFSET(), @UpdatedBy, SYSDATETIMEOFFSET());
                """;
            cardCommand.Parameters.AddWithValue("@Status", card.Status);
            cardCommand.Parameters.AddWithValue("@CreatedBy", card.CreatedById);
            cardCommand.Parameters.AddWithValue("@UpdatedBy", card.UpdatedById);
            var id = Convert.ToInt32(await cardCommand.ExecuteScalarAsync(cancellationToken));
            await ReplaceImagesAsync(connection, transaction, id, card.ImagePaths, cancellationToken);
            await UpsertTranslationsAsync(connection, transaction, id, card.Translations.Values, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return id;
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    public async Task<bool> UpdateNewsCardAsync(NewsCard card, CancellationToken cancellationToken = default)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(cancellationToken);
        try
        {
            await using var cardCommand = connection.CreateCommand();
            cardCommand.Transaction = transaction;
            cardCommand.CommandText = """
                UPDATE dbo.NewsCards
                SET Status = @Status, UpdatedBy = @UpdatedBy, UpdatedAt = SYSDATETIMEOFFSET()
                WHERE NewsCardId = @NewsCardId;
                """;
            cardCommand.Parameters.AddWithValue("@Status", card.Status);
            cardCommand.Parameters.AddWithValue("@UpdatedBy", card.UpdatedById);
            cardCommand.Parameters.AddWithValue("@NewsCardId", card.Id);
            if (await cardCommand.ExecuteNonQueryAsync(cancellationToken) != 1)
            {
                await transaction.RollbackAsync(cancellationToken);
                return false;
            }
            await ReplaceImagesAsync(connection, transaction, card.Id, card.ImagePaths, cancellationToken);
            await UpsertTranslationsAsync(connection, transaction, card.Id, card.Translations.Values, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return true;
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    public async Task<bool> DeleteNewsCardAsync(int id, CancellationToken cancellationToken = default)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM dbo.NewsCards WHERE NewsCardId = @NewsCardId;";
        command.Parameters.AddWithValue("@NewsCardId", id);
        return await command.ExecuteNonQueryAsync(cancellationToken) == 1;
    }

    public async Task<IReadOnlyList<PublicNewsCard>> GetPublishedNewsAsync(
        string language,
        CancellationToken cancellationToken = default)
    {
        var languageCode = language.Equals("all", StringComparison.OrdinalIgnoreCase)
            ? null
            : language;
        var result = new List<PublicNewsCard>();
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT n.NewsCardId, t.LanguageCode, t.Title, t.PublishDate, t.ImagePath,
                   STRING_AGG(CAST(i.ImagePath AS NVARCHAR(MAX)), N'|')
                       WITHIN GROUP (ORDER BY i.SortOrder) AS ImagePaths,
                   t.TextNote, t.Footer, n.UpdatedAt
            FROM dbo.NewsCards n
            INNER JOIN dbo.NewsCardTranslations t ON t.NewsCardId = n.NewsCardId
            LEFT JOIN dbo.NewsCardImages i ON i.NewsCardId = n.NewsCardId
            WHERE n.Status = N'Published'
              AND (@LanguageCode IS NULL OR t.LanguageCode = @LanguageCode)
            GROUP BY n.NewsCardId, t.LanguageCode, t.Title, t.PublishDate, t.ImagePath,
                     t.TextNote, t.Footer, n.UpdatedAt
            ORDER BY t.PublishDate DESC, n.UpdatedAt DESC, n.NewsCardId DESC,
                     CASE t.LanguageCode WHEN 'en' THEN 1 WHEN 'hi' THEN 2 ELSE 3 END;
            """;
        command.Parameters.Add("@LanguageCode", SqlDbType.Char, 2).Value =
            languageCode is null ? DBNull.Value : languageCode;
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var legacyImagePath = reader.GetString(4);
            var imagePaths = reader.IsDBNull(5)
                ? new List<string> { legacyImagePath }
                : reader.GetString(5)
                    .Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();
            result.Add(new PublicNewsCard(
                reader.GetInt32(0),
                reader.GetString(1).Trim(),
                reader.GetString(2),
                DateOnly.FromDateTime(reader.GetDateTime(3)).ToString("dd/MM/yyyy"),
                imagePaths.FirstOrDefault() ?? legacyImagePath,
                imagePaths,
                reader.GetString(6),
                reader.GetString(7),
                reader.GetFieldValue<DateTimeOffset>(8)));
        }
        return result;
    }

    private async Task<int> ExecuteCountAsync(string sql, CancellationToken cancellationToken)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        return Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken));
    }

    private static void AddUserParameters(SqlCommand command, CmsUser user)
    {
        command.Parameters.AddWithValue("@Username", user.Username);
        command.Parameters.AddWithValue("@PasswordHash", user.PasswordHash);
        command.Parameters.AddWithValue("@Role", user.Role);
        command.Parameters.AddWithValue("@IsActive", user.IsActive);
    }

    private static CmsUser ReadUser(SqlDataReader reader) => new()
    {
        Id = reader.GetInt32(reader.GetOrdinal("UserId")),
        Username = reader.GetString(reader.GetOrdinal("Username")),
        PasswordHash = reader.GetString(reader.GetOrdinal("PasswordHash")),
        Role = reader.GetString(reader.GetOrdinal("Role")),
        IsActive = reader.GetBoolean(reader.GetOrdinal("IsActive")),
        CreatedAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("CreatedAt")),
        UpdatedAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("UpdatedAt"))
    };

    private static void ReadNewsRow(SqlDataReader reader, IDictionary<int, NewsCard> cards)
    {
        var id = reader.GetInt32(reader.GetOrdinal("NewsCardId"));
        if (!cards.TryGetValue(id, out var card))
        {
            card = new NewsCard
            {
                Id = id,
                Status = reader.GetString(reader.GetOrdinal("Status")),
                CreatedById = reader.GetInt32(reader.GetOrdinal("CreatedBy")),
                CreatedByName = reader.GetString(reader.GetOrdinal("CreatedByName")),
                CreatedAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("CreatedAt")),
                UpdatedById = reader.GetInt32(reader.GetOrdinal("UpdatedBy")),
                UpdatedByName = reader.GetString(reader.GetOrdinal("UpdatedByName")),
                UpdatedAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("UpdatedAt"))
            };
            cards[id] = card;
        }

        var language = reader.GetString(reader.GetOrdinal("LanguageCode")).Trim();
        var cardImageOrdinal = reader.GetOrdinal("CardImagePath");
        if (!reader.IsDBNull(cardImageOrdinal))
        {
            var cardImagePath = reader.GetString(cardImageOrdinal);
            if (!card.ImagePaths.Contains(cardImagePath, StringComparer.OrdinalIgnoreCase))
            {
                card.ImagePaths.Add(cardImagePath);
            }
        }
        card.Translations[language] = new NewsCardTranslation
        {
            LanguageCode = language,
            Title = reader.GetString(reader.GetOrdinal("Title")),
            PublishDate = DateOnly.FromDateTime(reader.GetDateTime(reader.GetOrdinal("PublishDate"))),
            ImagePath = reader.GetString(reader.GetOrdinal("ImagePath")),
            TextNote = reader.GetString(reader.GetOrdinal("TextNote")),
            Footer = reader.GetString(reader.GetOrdinal("Footer"))
        };
    }

    private static async Task ReplaceImagesAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        int newsCardId,
        IEnumerable<string> imagePaths,
        CancellationToken cancellationToken)
    {
        await using (var deleteCommand = connection.CreateCommand())
        {
            deleteCommand.Transaction = transaction;
            deleteCommand.CommandText = "DELETE FROM dbo.NewsCardImages WHERE NewsCardId = @NewsCardId;";
            deleteCommand.Parameters.AddWithValue("@NewsCardId", newsCardId);
            await deleteCommand.ExecuteNonQueryAsync(cancellationToken);
        }

        var paths = imagePaths
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        for (var index = 0; index < paths.Count; index++)
        {
            await using var insertCommand = connection.CreateCommand();
            insertCommand.Transaction = transaction;
            insertCommand.CommandText = """
                INSERT INTO dbo.NewsCardImages (NewsCardId, ImagePath, SortOrder)
                VALUES (@NewsCardId, @ImagePath, @SortOrder);
                """;
            insertCommand.Parameters.AddWithValue("@NewsCardId", newsCardId);
            insertCommand.Parameters.AddWithValue("@ImagePath", paths[index]);
            insertCommand.Parameters.AddWithValue("@SortOrder", index);
            await insertCommand.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    private static async Task UpsertTranslationsAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        int newsCardId,
        IEnumerable<NewsCardTranslation> translations,
        CancellationToken cancellationToken)
    {
        foreach (var translation in translations)
        {
            await using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = """
                UPDATE dbo.NewsCardTranslations
                SET Title = @Title, PublishDate = @PublishDate, ImagePath = @ImagePath,
                    TextNote = @TextNote, Footer = @Footer
                WHERE NewsCardId = @NewsCardId AND LanguageCode = @LanguageCode;
                IF @@ROWCOUNT = 0
                BEGIN
                    INSERT INTO dbo.NewsCardTranslations
                        (NewsCardId, LanguageCode, Title, PublishDate, ImagePath, TextNote, Footer)
                    VALUES
                        (@NewsCardId, @LanguageCode, @Title, @PublishDate, @ImagePath, @TextNote, @Footer);
                END;
                """;
            command.Parameters.AddWithValue("@NewsCardId", newsCardId);
            command.Parameters.AddWithValue("@LanguageCode", translation.LanguageCode);
            command.Parameters.Add("@Title", SqlDbType.NVarChar, -1).Value = translation.Title;
            command.Parameters.AddWithValue("@PublishDate", translation.PublishDate.ToDateTime(TimeOnly.MinValue));
            command.Parameters.AddWithValue("@ImagePath", translation.ImagePath);
            command.Parameters.Add("@TextNote", SqlDbType.NVarChar, -1).Value = translation.TextNote;
            command.Parameters.Add("@Footer", SqlDbType.NVarChar, -1).Value = translation.Footer;
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    private const string NewsSelectSql = """
        SELECT n.NewsCardId, n.Status, n.CreatedBy, creator.Username AS CreatedByName,
               n.CreatedAt, n.UpdatedBy, updater.Username AS UpdatedByName, n.UpdatedAt,
               t.LanguageCode, t.Title, t.PublishDate, t.ImagePath, t.TextNote, t.Footer,
               i.ImagePath AS CardImagePath
        FROM dbo.NewsCards n
        INNER JOIN dbo.CmsUsers creator ON creator.UserId = n.CreatedBy
        INNER JOIN dbo.CmsUsers updater ON updater.UserId = n.UpdatedBy
        INNER JOIN dbo.NewsCardTranslations t ON t.NewsCardId = n.NewsCardId
        LEFT JOIN dbo.NewsCardImages i ON i.NewsCardId = n.NewsCardId
        """;
}
