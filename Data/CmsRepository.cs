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

            IF OBJECT_ID(N'dbo.NewsCardAttachments', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.NewsCardAttachments
                (
                    NewsCardAttachmentId INT IDENTITY(1,1) NOT NULL
                        CONSTRAINT PK_NewsCardAttachments PRIMARY KEY,
                    NewsCardId INT NOT NULL,
                    StoredPath NVARCHAR(500) NOT NULL,
                    RelativePath NVARCHAR(1000) NOT NULL,
                    ContentType NVARCHAR(200) NOT NULL,
                    FileSize BIGINT NOT NULL,
                    SortOrder INT NOT NULL,
                    CONSTRAINT FK_NewsCardAttachments_NewsCard FOREIGN KEY (NewsCardId)
                        REFERENCES dbo.NewsCards(NewsCardId) ON DELETE CASCADE,
                    CONSTRAINT UX_NewsCardAttachments_StoredPath UNIQUE (NewsCardId, StoredPath),
                    CONSTRAINT UX_NewsCardAttachments_SortOrder UNIQUE (NewsCardId, SortOrder)
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

            IF OBJECT_ID(N'dbo.CancerBurdenResources', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.CancerBurdenResources
                (
                    CancerBurdenResourceId INT IDENTITY(1,1) NOT NULL
                        CONSTRAINT PK_CancerBurdenResources PRIMARY KEY,
                    District NVARCHAR(100) NOT NULL,
                    Title NVARCHAR(250) NOT NULL,
                    Description NVARCHAR(2000) NOT NULL,
                    TitleHi NVARCHAR(250) NOT NULL CONSTRAINT DF_CancerBurdenResources_TitleHi DEFAULT (N''),
                    DescriptionHi NVARCHAR(2000) NOT NULL CONSTRAINT DF_CancerBurdenResources_DescriptionHi DEFAULT (N''),
                    TitleOr NVARCHAR(250) NOT NULL CONSTRAINT DF_CancerBurdenResources_TitleOr DEFAULT (N''),
                    DescriptionOr NVARCHAR(2000) NOT NULL CONSTRAINT DF_CancerBurdenResources_DescriptionOr DEFAULT (N''),
                    PdfPath NVARCHAR(500) NOT NULL,
                    PreviewPath NVARCHAR(500) NOT NULL,
                    CreatedBy INT NULL,
                    CreatedAt DATETIMEOFFSET(0) NOT NULL
                        CONSTRAINT DF_CancerBurdenResources_CreatedAt DEFAULT (SYSDATETIMEOFFSET()),
                    UpdatedBy INT NULL,
                    UpdatedAt DATETIMEOFFSET(0) NOT NULL
                        CONSTRAINT DF_CancerBurdenResources_UpdatedAt DEFAULT (SYSDATETIMEOFFSET())
                );
                CREATE INDEX IX_CancerBurdenResources_District
                    ON dbo.CancerBurdenResources(District, Title);
            END;

            IF COL_LENGTH(N'dbo.CancerBurdenResources', N'TitleHi') IS NULL
                EXEC(N'ALTER TABLE dbo.CancerBurdenResources ADD TitleHi NVARCHAR(250) NOT NULL
                    CONSTRAINT DF_CancerBurdenResources_TitleHi DEFAULT (N'''') WITH VALUES;');
            IF COL_LENGTH(N'dbo.CancerBurdenResources', N'DescriptionHi') IS NULL
                EXEC(N'ALTER TABLE dbo.CancerBurdenResources ADD DescriptionHi NVARCHAR(2000) NOT NULL
                    CONSTRAINT DF_CancerBurdenResources_DescriptionHi DEFAULT (N'''') WITH VALUES;');
            IF COL_LENGTH(N'dbo.CancerBurdenResources', N'TitleOr') IS NULL
                EXEC(N'ALTER TABLE dbo.CancerBurdenResources ADD TitleOr NVARCHAR(250) NOT NULL
                    CONSTRAINT DF_CancerBurdenResources_TitleOr DEFAULT (N'''') WITH VALUES;');
            IF COL_LENGTH(N'dbo.CancerBurdenResources', N'DescriptionOr') IS NULL
                EXEC(N'ALTER TABLE dbo.CancerBurdenResources ADD DescriptionOr NVARCHAR(2000) NOT NULL
                    CONSTRAINT DF_CancerBurdenResources_DescriptionOr DEFAULT (N'''') WITH VALUES;');

            EXEC(N'UPDATE dbo.CancerBurdenResources
            SET TitleHi = CASE WHEN NULLIF(LTRIM(RTRIM(TitleHi)), N'''') IS NULL THEN Title ELSE TitleHi END,
                DescriptionHi = CASE WHEN NULLIF(LTRIM(RTRIM(DescriptionHi)), N'''') IS NULL THEN Description ELSE DescriptionHi END,
                TitleOr = CASE WHEN NULLIF(LTRIM(RTRIM(TitleOr)), N'''') IS NULL THEN Title ELSE TitleOr END,
                DescriptionOr = CASE WHEN NULLIF(LTRIM(RTRIM(DescriptionOr)), N'''') IS NULL THEN Description ELSE DescriptionOr END;');

            IF NOT EXISTS
            (
                SELECT 1
                FROM dbo.CancerBurdenResources
                WHERE PdfPath = N'/assets/IMAGES_PDF_PPT_EXCEL/CANCER BURDEN/PDF/Mayurbhanj factsheet_3 Jul 2026.pdf'
            )
            BEGIN
                INSERT INTO dbo.CancerBurdenResources
                    (District, Title, Description, PdfPath, PreviewPath, CreatedAt, UpdatedAt)
                VALUES
                (
                    N'Mayurbhanj',
                    N'Mayurbhanj Cancer Burden Factsheet',
                    N'District cancer burden factsheet for Mayurbhanj, updated 3 July 2026.',
                    N'/assets/IMAGES_PDF_PPT_EXCEL/CANCER BURDEN/PDF/Mayurbhanj factsheet_3 Jul 2026.pdf',
                    N'/assets/IMAGES_PDF_PPT_EXCEL/CANCER BURDEN/PREVIEW IMAGE/Mayurbhanj.jpg',
                    TODATETIMEOFFSET(DATETIME2FROMPARTS(2026, 7, 3, 0, 0, 0, 0, 0), '+05:30'),
                    TODATETIMEOFFSET(DATETIME2FROMPARTS(2026, 7, 3, 0, 0, 0, 0, 0), '+05:30')
                );
            END;

            IF OBJECT_ID(N'dbo.OdishaCirculars', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.OdishaCirculars
                (
                    OdishaCircularId INT IDENTITY(1,1) NOT NULL
                        CONSTRAINT PK_OdishaCirculars PRIMARY KEY,
                    District NVARCHAR(100) NOT NULL,
                    Title NVARCHAR(250) NOT NULL,
                    Description NVARCHAR(2000) NOT NULL,
                    TitleHi NVARCHAR(250) NOT NULL CONSTRAINT DF_OdishaCirculars_TitleHi DEFAULT (N''),
                    DescriptionHi NVARCHAR(2000) NOT NULL CONSTRAINT DF_OdishaCirculars_DescriptionHi DEFAULT (N''),
                    TitleOr NVARCHAR(250) NOT NULL CONSTRAINT DF_OdishaCirculars_TitleOr DEFAULT (N''),
                    DescriptionOr NVARCHAR(2000) NOT NULL CONSTRAINT DF_OdishaCirculars_DescriptionOr DEFAULT (N''),
                    PdfPath NVARCHAR(500) NOT NULL,
                    PreviewPath NVARCHAR(500) NOT NULL,
                    CreatedBy INT NULL,
                    CreatedAt DATETIMEOFFSET(0) NOT NULL
                        CONSTRAINT DF_OdishaCirculars_CreatedAt DEFAULT (SYSDATETIMEOFFSET()),
                    UpdatedBy INT NULL,
                    UpdatedAt DATETIMEOFFSET(0) NOT NULL
                        CONSTRAINT DF_OdishaCirculars_UpdatedAt DEFAULT (SYSDATETIMEOFFSET())
                );
                CREATE INDEX IX_OdishaCirculars_District
                    ON dbo.OdishaCirculars(District, Title);
                CREATE UNIQUE INDEX UX_OdishaCirculars_PdfPath
                    ON dbo.OdishaCirculars(PdfPath);
            END;

            IF COL_LENGTH(N'dbo.OdishaCirculars', N'TitleHi') IS NULL
                EXEC(N'ALTER TABLE dbo.OdishaCirculars ADD TitleHi NVARCHAR(250) NOT NULL
                    CONSTRAINT DF_OdishaCirculars_TitleHi DEFAULT (N'''') WITH VALUES;');
            IF COL_LENGTH(N'dbo.OdishaCirculars', N'DescriptionHi') IS NULL
                EXEC(N'ALTER TABLE dbo.OdishaCirculars ADD DescriptionHi NVARCHAR(2000) NOT NULL
                    CONSTRAINT DF_OdishaCirculars_DescriptionHi DEFAULT (N'''') WITH VALUES;');
            IF COL_LENGTH(N'dbo.OdishaCirculars', N'TitleOr') IS NULL
                EXEC(N'ALTER TABLE dbo.OdishaCirculars ADD TitleOr NVARCHAR(250) NOT NULL
                    CONSTRAINT DF_OdishaCirculars_TitleOr DEFAULT (N'''') WITH VALUES;');
            IF COL_LENGTH(N'dbo.OdishaCirculars', N'DescriptionOr') IS NULL
                EXEC(N'ALTER TABLE dbo.OdishaCirculars ADD DescriptionOr NVARCHAR(2000) NOT NULL
                    CONSTRAINT DF_OdishaCirculars_DescriptionOr DEFAULT (N'''') WITH VALUES;');

            EXEC(N'UPDATE dbo.OdishaCirculars
            SET TitleHi = CASE WHEN NULLIF(LTRIM(RTRIM(TitleHi)), N'''') IS NULL THEN Title ELSE TitleHi END,
                DescriptionHi = CASE WHEN NULLIF(LTRIM(RTRIM(DescriptionHi)), N'''') IS NULL THEN Description ELSE DescriptionHi END,
                TitleOr = CASE WHEN NULLIF(LTRIM(RTRIM(TitleOr)), N'''') IS NULL THEN Title ELSE TitleOr END,
                DescriptionOr = CASE WHEN NULLIF(LTRIM(RTRIM(DescriptionOr)), N'''') IS NULL THEN Description ELSE DescriptionOr END;');

            IF NOT EXISTS (SELECT 1 FROM dbo.OdishaCirculars)
            BEGIN
                ;WITH CircularSeed (District, Title, Description, PdfPath, PreviewPath) AS
                (
                SELECT * FROM (VALUES
                    (N'Balangir', N'Balangir Odisha State Circular', N'Odisha State circular for Balangir district.', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PDF/Balangir.pdf', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PREVIEW IMAGE/Balangir.png'),
                    (N'Balasore', N'Balasore Odisha State Circular', N'Odisha State circular for Balasore district.', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PDF/Balasore.pdf', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PREVIEW IMAGE/Balasore.png'),
                    (N'Bargarh', N'Bargarh Odisha State Circular', N'Odisha State circular for Bargarh district.', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PDF/Bargarh.pdf', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PREVIEW IMAGE/Bargarh.png'),
                    (N'Bhadrak', N'Bhadrak Odisha State Circular', N'Odisha State circular for Bhadrak district.', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PDF/Bhadrak.pdf', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PREVIEW IMAGE/Bhadrak.png'),
                    (N'Boudh', N'Boudh Odisha State Circular', N'Odisha State circular for Boudh district.', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PDF/Boudh.pdf', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PREVIEW IMAGE/Boudh.png'),
                    (N'Cuttack', N'Cuttack Odisha State Circular', N'Odisha State circular for Cuttack district.', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PDF/CUTTACK.PDF', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PREVIEW IMAGE/CUTTACK.png'),
                    (N'Deogarh', N'Deogarh Odisha State Circular', N'Odisha State circular for Deogarh district.', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PDF/Deogarh.pdf', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PREVIEW IMAGE/Deogarh.png'),
                    (N'Dhenkanal', N'Dhenkanal Odisha State Circular', N'Odisha State circular for Dhenkanal district.', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PDF/Dhenkanal.pdf', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PREVIEW IMAGE/Dhenkanal.png'),
                    (N'Gajapati', N'Gajapati Odisha State Circular', N'Odisha State circular for Gajapati district.', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PDF/Gajapati.pdf', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PREVIEW IMAGE/Gajapati.png'),
                    (N'Ganjam', N'Ganjam Odisha State Circular', N'Odisha State circular for Ganjam district.', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PDF/Ganjam.pdf', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PREVIEW IMAGE/Ganjam.png'),
                    (N'Jagatsinghpur', N'Jagatsinghpur Odisha State Circular', N'Odisha State circular for Jagatsinghpur district.', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PDF/Jagatsinghpur.pdf', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PREVIEW IMAGE/Jagatsinghpur.png'),
                    (N'Jajpur', N'Jajpur Odisha State Circular', N'Odisha State circular for Jajpur district.', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PDF/Jajpur.pdf', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PREVIEW IMAGE/Jajpur.png'),
                    (N'Kalahandi', N'Kalahandi Odisha State Circular', N'Odisha State circular for Kalahandi district.', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PDF/Kalahandi.pdf', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PREVIEW IMAGE/Kalahandi.png'),
                    (N'Kendrapada', N'Kendrapada Odisha State Circular', N'Odisha State circular for Kendrapada district.', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PDF/Kendrapada.pdf', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PREVIEW IMAGE/Kendrapada.png'),
                    (N'Keonjhar', N'Keonjhar Odisha State Circular', N'Odisha State circular for Keonjhar district.', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PDF/Keonjhar.pdf', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PREVIEW IMAGE/Keonjhar.png'),
                    (N'Koraput', N'Koraput Odisha State Circular (2)', N'Additional Odisha State circular for Koraput district.', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PDF/Koraput (2).pdf', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PREVIEW IMAGE/Koraput (2).png'),
                    (N'Koraput', N'Koraput Odisha State Circular', N'Odisha State circular for Koraput district.', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PDF/Koraput.pdf', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PREVIEW IMAGE/Koraput.png'),
                    (N'Malkangiri', N'Malkangiri Odisha State Circular', N'Odisha State circular for Malkangiri district.', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PDF/Malkangiri.pdf', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PREVIEW IMAGE/Malkangiri.png'),
                    (N'Mayurbhanj', N'Mayurbhanj Odisha State Circular', N'Odisha State circular for Mayurbhanj district.', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PDF/MAYURBHANJ.pdf', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PREVIEW IMAGE/MAYURBHANJ.png'),
                    (N'Nabarangpur', N'Nabarangpur Odisha State Circular', N'Odisha State circular for Nabarangpur district.', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PDF/Nabarangpur.pdf', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PREVIEW IMAGE/Nabarangpur.png'),
                    (N'Nayagarh', N'Nayagarh Odisha State Circular', N'Odisha State circular for Nayagarh district.', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PDF/Nayagarh.pdf', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PREVIEW IMAGE/Nayagarh.png'),
                    (N'Puri', N'Puri Odisha State Circular', N'Odisha State circular for Puri district.', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PDF/Puri.pdf', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PREVIEW IMAGE/Puri.png'),
                    (N'Rayagada', N'Rayagada Odisha State Circular', N'Odisha State circular for Rayagada district.', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PDF/Rayagada.pdf', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PREVIEW IMAGE/Rayagada.png'),
                    (N'Sambalpur', N'Sambalpur Odisha State Circular', N'Odisha State circular for Sambalpur district.', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PDF/Sambalpur.pdf', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PREVIEW IMAGE/Sambalpur.png'),
                    (N'Subarnapur', N'Subarnapur Odisha State Circular', N'Odisha State circular for Subarnapur district.', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PDF/Subarnapur.pdf', N'/assets/IMAGES_PDF_PPT_EXCEL/ABOUT US PAGE/Odisha Circular/PREVIEW IMAGE/Subarnapur.png')
                ) SeedRows (District, Title, Description, PdfPath, PreviewPath)
                )
                INSERT INTO dbo.OdishaCirculars
                    (District, Title, Description, PdfPath, PreviewPath, CreatedAt, UpdatedAt)
                SELECT District, Title, Description, PdfPath, PreviewPath,
                       SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET()
                FROM CircularSeed;
            END;

            IF OBJECT_ID(N'dbo.SiteMetrics', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.SiteMetrics
                (
                    MetricName NVARCHAR(80) NOT NULL CONSTRAINT PK_SiteMetrics PRIMARY KEY,
                    MetricValue BIGINT NOT NULL CONSTRAINT DF_SiteMetrics_MetricValue DEFAULT (0),
                    UpdatedAt DATETIMEOFFSET(0) NOT NULL
                        CONSTRAINT DF_SiteMetrics_UpdatedAt DEFAULT (SYSDATETIMEOFFSET()),
                    CONSTRAINT CK_SiteMetrics_MetricValue CHECK (MetricValue >= 0)
                );
            END;

            IF NOT EXISTS (SELECT 1 FROM dbo.SiteMetrics WHERE MetricName = N'WebsiteVisits')
            BEGIN
                INSERT INTO dbo.SiteMetrics (MetricName, MetricValue)
                VALUES (N'WebsiteVisits', 0);
            END;
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
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            while (await reader.ReadAsync(cancellationToken))
            {
                ReadNewsRow(reader, cards);
            }
        }
        await ReadNewsAttachmentsAsync(connection, cards, null, cancellationToken);
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
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            while (await reader.ReadAsync(cancellationToken))
            {
                ReadNewsRow(reader, cards);
            }
        }
        await ReadNewsAttachmentsAsync(connection, cards, id, cancellationToken);
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
            await ReplaceAttachmentsAsync(connection, transaction, id, card.Attachments, cancellationToken);
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
            await ReplaceAttachmentsAsync(connection, transaction, card.Id, card.Attachments, cancellationToken);
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
                   t.TextNote, t.Footer,
                   (SELECT COUNT(*) FROM dbo.NewsCardAttachments a WHERE a.NewsCardId = n.NewsCardId) AS AttachmentCount,
                   n.UpdatedAt
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
                reader.GetInt32(8),
                reader.GetFieldValue<DateTimeOffset>(9)));
        }
        return result;
    }

    public async Task<long> GetWebsiteVisitCountAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT MetricValue FROM dbo.SiteMetrics WHERE MetricName = N'WebsiteVisits';";
        return Convert.ToInt64(await command.ExecuteScalarAsync(cancellationToken));
    }

    public async Task<long> IncrementWebsiteVisitCountAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            UPDATE dbo.SiteMetrics WITH (UPDLOCK, ROWLOCK)
            SET MetricValue = MetricValue + 1,
                UpdatedAt = SYSDATETIMEOFFSET()
            OUTPUT INSERTED.MetricValue
            WHERE MetricName = N'WebsiteVisits';
            """;
        return Convert.ToInt64(await command.ExecuteScalarAsync(cancellationToken));
    }

    public async Task<IReadOnlyList<CancerBurdenRecord>> GetCancerBurdenRecordsAsync(
        CancellationToken cancellationToken = default)
    {
        var result = new List<CancerBurdenRecord>();
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = CancerBurdenSelectSql +
            " ORDER BY District, Title, CancerBurdenResourceId;";
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            result.Add(ReadCancerBurdenRecord(reader));
        }
        return result;
    }

    public async Task<CancerBurdenRecord?> GetCancerBurdenRecordAsync(
        int id,
        CancellationToken cancellationToken = default)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = CancerBurdenSelectSql +
            " WHERE CancerBurdenResourceId = @CancerBurdenResourceId;";
        command.Parameters.AddWithValue("@CancerBurdenResourceId", id);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? ReadCancerBurdenRecord(reader) : null;
    }

    public Task<int> CountCancerBurdenRecordsAsync(CancellationToken cancellationToken = default) =>
        ExecuteCountAsync("SELECT COUNT(*) FROM dbo.CancerBurdenResources;", cancellationToken);

    public async Task<int> CreateCancerBurdenRecordAsync(
        CancerBurdenRecord record,
        CancellationToken cancellationToken = default)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO dbo.CancerBurdenResources
                (District, Title, Description, TitleHi, DescriptionHi, TitleOr, DescriptionOr,
                 PdfPath, PreviewPath, CreatedBy, CreatedAt, UpdatedBy, UpdatedAt)
            OUTPUT INSERTED.CancerBurdenResourceId
            VALUES
                (@District, @Title, @Description, @TitleHi, @DescriptionHi, @TitleOr, @DescriptionOr,
                 @PdfPath, @PreviewPath,
                 @CreatedBy, SYSDATETIMEOFFSET(), @UpdatedBy, SYSDATETIMEOFFSET());
            """;
        AddCancerBurdenParameters(command, record);
        return Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken));
    }

    public async Task<bool> UpdateCancerBurdenRecordAsync(
        CancerBurdenRecord record,
        CancellationToken cancellationToken = default)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            UPDATE dbo.CancerBurdenResources
            SET District = @District,
                Title = @Title,
                Description = @Description,
                TitleHi = @TitleHi,
                DescriptionHi = @DescriptionHi,
                TitleOr = @TitleOr,
                DescriptionOr = @DescriptionOr,
                PdfPath = @PdfPath,
                PreviewPath = @PreviewPath,
                UpdatedBy = @UpdatedBy,
                UpdatedAt = SYSDATETIMEOFFSET()
            WHERE CancerBurdenResourceId = @CancerBurdenResourceId;
            """;
        AddCancerBurdenParameters(command, record);
        command.Parameters.AddWithValue("@CancerBurdenResourceId", record.Id);
        return await command.ExecuteNonQueryAsync(cancellationToken) == 1;
    }

    public async Task<bool> DeleteCancerBurdenRecordAsync(
        int id,
        CancellationToken cancellationToken = default)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            DELETE FROM dbo.CancerBurdenResources
            WHERE CancerBurdenResourceId = @CancerBurdenResourceId;
            """;
        command.Parameters.AddWithValue("@CancerBurdenResourceId", id);
        return await command.ExecuteNonQueryAsync(cancellationToken) == 1;
    }

    public async Task<IReadOnlyList<OdishaCircularRecord>> GetOdishaCircularRecordsAsync(
        CancellationToken cancellationToken = default)
    {
        var result = new List<OdishaCircularRecord>();
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = OdishaCircularSelectSql + " ORDER BY District, Title, OdishaCircularId;";
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            result.Add(ReadOdishaCircularRecord(reader));
        }
        return result;
    }

    public async Task<OdishaCircularRecord?> GetOdishaCircularRecordAsync(
        int id,
        CancellationToken cancellationToken = default)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = OdishaCircularSelectSql + " WHERE OdishaCircularId = @OdishaCircularId;";
        command.Parameters.AddWithValue("@OdishaCircularId", id);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? ReadOdishaCircularRecord(reader) : null;
    }

    public Task<int> CountOdishaCircularRecordsAsync(CancellationToken cancellationToken = default) =>
        ExecuteCountAsync("SELECT COUNT(*) FROM dbo.OdishaCirculars;", cancellationToken);

    public async Task<int> CreateOdishaCircularRecordAsync(
        OdishaCircularRecord record,
        CancellationToken cancellationToken = default)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO dbo.OdishaCirculars
                (District, Title, Description, TitleHi, DescriptionHi, TitleOr, DescriptionOr,
                 PdfPath, PreviewPath, CreatedBy, CreatedAt, UpdatedBy, UpdatedAt)
            OUTPUT INSERTED.OdishaCircularId
            VALUES
                (@District, @Title, @Description, @TitleHi, @DescriptionHi, @TitleOr, @DescriptionOr,
                 @PdfPath, @PreviewPath,
                 @CreatedBy, SYSDATETIMEOFFSET(), @UpdatedBy, SYSDATETIMEOFFSET());
            """;
        AddOdishaCircularParameters(command, record);
        return Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken));
    }

    public async Task<bool> UpdateOdishaCircularRecordAsync(
        OdishaCircularRecord record,
        CancellationToken cancellationToken = default)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            UPDATE dbo.OdishaCirculars
            SET District = @District,
                Title = @Title,
                Description = @Description,
                TitleHi = @TitleHi,
                DescriptionHi = @DescriptionHi,
                TitleOr = @TitleOr,
                DescriptionOr = @DescriptionOr,
                PdfPath = @PdfPath,
                PreviewPath = @PreviewPath,
                UpdatedBy = @UpdatedBy,
                UpdatedAt = SYSDATETIMEOFFSET()
            WHERE OdishaCircularId = @OdishaCircularId;
            """;
        AddOdishaCircularParameters(command, record);
        command.Parameters.AddWithValue("@OdishaCircularId", record.Id);
        return await command.ExecuteNonQueryAsync(cancellationToken) == 1;
    }

    public async Task<bool> DeleteOdishaCircularRecordAsync(
        int id,
        CancellationToken cancellationToken = default)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM dbo.OdishaCirculars WHERE OdishaCircularId = @OdishaCircularId;";
        command.Parameters.AddWithValue("@OdishaCircularId", id);
        return await command.ExecuteNonQueryAsync(cancellationToken) == 1;
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

    private static void AddCancerBurdenParameters(SqlCommand command, CancerBurdenRecord record)
    {
        command.Parameters.AddWithValue("@District", record.District);
        command.Parameters.AddWithValue("@Title", record.Title);
        command.Parameters.AddWithValue("@Description", record.Description);
        command.Parameters.AddWithValue("@TitleHi", record.TitleHi);
        command.Parameters.AddWithValue("@DescriptionHi", record.DescriptionHi);
        command.Parameters.AddWithValue("@TitleOr", record.TitleOr);
        command.Parameters.AddWithValue("@DescriptionOr", record.DescriptionOr);
        command.Parameters.AddWithValue("@PdfPath", record.PdfPath);
        command.Parameters.AddWithValue("@PreviewPath", record.PreviewPath);
        command.Parameters.Add("@CreatedBy", SqlDbType.Int).Value =
            record.CreatedById is null ? DBNull.Value : record.CreatedById.Value;
        command.Parameters.Add("@UpdatedBy", SqlDbType.Int).Value =
            record.UpdatedById is null ? DBNull.Value : record.UpdatedById.Value;
    }

    private static CancerBurdenRecord ReadCancerBurdenRecord(SqlDataReader reader) => new()
    {
        Id = reader.GetInt32(reader.GetOrdinal("CancerBurdenResourceId")),
        District = reader.GetString(reader.GetOrdinal("District")),
        Title = reader.GetString(reader.GetOrdinal("Title")),
        Description = reader.GetString(reader.GetOrdinal("Description")),
        TitleHi = reader.GetString(reader.GetOrdinal("TitleHi")),
        DescriptionHi = reader.GetString(reader.GetOrdinal("DescriptionHi")),
        TitleOr = reader.GetString(reader.GetOrdinal("TitleOr")),
        DescriptionOr = reader.GetString(reader.GetOrdinal("DescriptionOr")),
        PdfPath = reader.GetString(reader.GetOrdinal("PdfPath")),
        PreviewPath = reader.GetString(reader.GetOrdinal("PreviewPath")),
        CreatedById = reader.IsDBNull(reader.GetOrdinal("CreatedBy"))
            ? null
            : reader.GetInt32(reader.GetOrdinal("CreatedBy")),
        CreatedAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("CreatedAt")),
        UpdatedById = reader.IsDBNull(reader.GetOrdinal("UpdatedBy"))
            ? null
            : reader.GetInt32(reader.GetOrdinal("UpdatedBy")),
        UpdatedAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("UpdatedAt"))
    };

    private static void AddOdishaCircularParameters(SqlCommand command, OdishaCircularRecord record)
    {
        command.Parameters.AddWithValue("@District", record.District);
        command.Parameters.AddWithValue("@Title", record.Title);
        command.Parameters.AddWithValue("@Description", record.Description);
        command.Parameters.AddWithValue("@TitleHi", record.TitleHi);
        command.Parameters.AddWithValue("@DescriptionHi", record.DescriptionHi);
        command.Parameters.AddWithValue("@TitleOr", record.TitleOr);
        command.Parameters.AddWithValue("@DescriptionOr", record.DescriptionOr);
        command.Parameters.AddWithValue("@PdfPath", record.PdfPath);
        command.Parameters.AddWithValue("@PreviewPath", record.PreviewPath);
        command.Parameters.Add("@CreatedBy", SqlDbType.Int).Value =
            record.CreatedById is null ? DBNull.Value : record.CreatedById.Value;
        command.Parameters.Add("@UpdatedBy", SqlDbType.Int).Value =
            record.UpdatedById is null ? DBNull.Value : record.UpdatedById.Value;
    }

    private static OdishaCircularRecord ReadOdishaCircularRecord(SqlDataReader reader) => new()
    {
        Id = reader.GetInt32(reader.GetOrdinal("OdishaCircularId")),
        District = reader.GetString(reader.GetOrdinal("District")),
        Title = reader.GetString(reader.GetOrdinal("Title")),
        Description = reader.GetString(reader.GetOrdinal("Description")),
        TitleHi = reader.GetString(reader.GetOrdinal("TitleHi")),
        DescriptionHi = reader.GetString(reader.GetOrdinal("DescriptionHi")),
        TitleOr = reader.GetString(reader.GetOrdinal("TitleOr")),
        DescriptionOr = reader.GetString(reader.GetOrdinal("DescriptionOr")),
        PdfPath = reader.GetString(reader.GetOrdinal("PdfPath")),
        PreviewPath = reader.GetString(reader.GetOrdinal("PreviewPath")),
        CreatedById = reader.IsDBNull(reader.GetOrdinal("CreatedBy"))
            ? null
            : reader.GetInt32(reader.GetOrdinal("CreatedBy")),
        CreatedAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("CreatedAt")),
        UpdatedById = reader.IsDBNull(reader.GetOrdinal("UpdatedBy"))
            ? null
            : reader.GetInt32(reader.GetOrdinal("UpdatedBy")),
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

    private static async Task ReadNewsAttachmentsAsync(
        SqlConnection connection,
        IDictionary<int, NewsCard> cards,
        int? newsCardId,
        CancellationToken cancellationToken)
    {
        if (cards.Count == 0)
        {
            return;
        }

        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT NewsCardAttachmentId, NewsCardId, StoredPath, RelativePath, ContentType, FileSize
            FROM dbo.NewsCardAttachments
            """ + (newsCardId.HasValue ? " WHERE NewsCardId = @NewsCardId" : "") +
            " ORDER BY NewsCardId, SortOrder;";
        if (newsCardId.HasValue)
        {
            command.Parameters.AddWithValue("@NewsCardId", newsCardId.Value);
        }

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var ownerId = reader.GetInt32(reader.GetOrdinal("NewsCardId"));
            if (!cards.TryGetValue(ownerId, out var card))
            {
                continue;
            }

            card.Attachments.Add(new NewsCardAttachment
            {
                Id = reader.GetInt32(reader.GetOrdinal("NewsCardAttachmentId")),
                StoredPath = reader.GetString(reader.GetOrdinal("StoredPath")),
                RelativePath = reader.GetString(reader.GetOrdinal("RelativePath")),
                ContentType = reader.GetString(reader.GetOrdinal("ContentType")),
                FileSize = reader.GetInt64(reader.GetOrdinal("FileSize"))
            });
        }
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

    private static async Task ReplaceAttachmentsAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        int newsCardId,
        IEnumerable<NewsCardAttachment> attachments,
        CancellationToken cancellationToken)
    {
        await using (var deleteCommand = connection.CreateCommand())
        {
            deleteCommand.Transaction = transaction;
            deleteCommand.CommandText = "DELETE FROM dbo.NewsCardAttachments WHERE NewsCardId = @NewsCardId;";
            deleteCommand.Parameters.AddWithValue("@NewsCardId", newsCardId);
            await deleteCommand.ExecuteNonQueryAsync(cancellationToken);
        }

        var items = attachments
            .Where(attachment =>
                !string.IsNullOrWhiteSpace(attachment.StoredPath) &&
                !string.IsNullOrWhiteSpace(attachment.RelativePath))
            .ToList();
        for (var index = 0; index < items.Count; index++)
        {
            var attachment = items[index];
            await using var insertCommand = connection.CreateCommand();
            insertCommand.Transaction = transaction;
            insertCommand.CommandText = """
                INSERT INTO dbo.NewsCardAttachments
                    (NewsCardId, StoredPath, RelativePath, ContentType, FileSize, SortOrder)
                VALUES
                    (@NewsCardId, @StoredPath, @RelativePath, @ContentType, @FileSize, @SortOrder);
                """;
            insertCommand.Parameters.AddWithValue("@NewsCardId", newsCardId);
            insertCommand.Parameters.AddWithValue("@StoredPath", attachment.StoredPath);
            insertCommand.Parameters.AddWithValue("@RelativePath", attachment.RelativePath);
            insertCommand.Parameters.AddWithValue("@ContentType", attachment.ContentType);
            insertCommand.Parameters.AddWithValue("@FileSize", attachment.FileSize);
            insertCommand.Parameters.AddWithValue("@SortOrder", index);
            await insertCommand.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    private const string CancerBurdenSelectSql = """
        SELECT CancerBurdenResourceId, District, Title, Description,
               TitleHi, DescriptionHi, TitleOr, DescriptionOr, PdfPath, PreviewPath,
               CreatedBy, CreatedAt, UpdatedBy, UpdatedAt
        FROM dbo.CancerBurdenResources
        """;

    private const string OdishaCircularSelectSql = """
        SELECT OdishaCircularId, District, Title, Description,
               TitleHi, DescriptionHi, TitleOr, DescriptionOr, PdfPath, PreviewPath,
               CreatedBy, CreatedAt, UpdatedBy, UpdatedAt
        FROM dbo.OdishaCirculars
        """;

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
