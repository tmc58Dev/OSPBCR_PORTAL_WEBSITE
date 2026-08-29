using System.Buffers.Binary;
using System.Data;
using System.Globalization;
using System.Text;
using System.Text.Json;
using Microsoft.Data.SqlClient;

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

var repositoryRoot = FindRepositoryRoot(AppContext.BaseDirectory);
var defaultSource = Path.Combine(
    repositoryRoot,
    "wwwroot", "assets", "IMAGES_PDF_PPT_EXCEL", "POPULATION PROJECTION", "GIS files NHM");
var sourceDirectory = Path.GetFullPath(args.FirstOrDefault(argument => !argument.StartsWith("--", StringComparison.Ordinal)) ?? defaultSource);
var inspectOnly = args.Contains("--inspect", StringComparer.OrdinalIgnoreCase);
var syncBlockDistrictCodes = args.Contains("--sync-block-district-codes", StringComparer.OrdinalIgnoreCase);
var syncVillageBlocks = args.Contains("--sync-village-blocks", StringComparer.OrdinalIgnoreCase);
var verifyVillageBlocks = args.Contains("--verify-village-blocks", StringComparer.OrdinalIgnoreCase);

if (!Directory.Exists(sourceDirectory))
{
    throw new DirectoryNotFoundException($"The extracted NHM GIS directory was not found: {sourceDirectory}");
}

var connectionString = GetConnectionString(repositoryRoot);
await using var connection = new SqlConnection(connectionString);
await connection.OpenAsync();

var layers = LayerDefinitions.All;
if (verifyVillageBlocks)
{
    await PrintVillageBlockVerificationAsync(connection);
    return;
}

if (syncBlockDistrictCodes)
{
    await using var syncTransaction = (SqlTransaction)await connection.BeginTransactionAsync();
    try
    {
        await ExecuteAsync(connection, syncTransaction, LayerDefinitions.SyncBlockDistrictCodesSql);
        await syncTransaction.CommitAsync();
    }
    catch
    {
        await syncTransaction.RollbackAsync();
        throw;
    }

    await using var verification = connection.CreateCommand();
    verification.CommandText = """
        SELECT COUNT_BIG(*) AS BlockCount,
               SUM(CASE WHEN blocks.DistrictCode IS NULL THEN CAST(1 AS BIGINT) ELSE 0 END) AS MissingDistrictCodes,
               COUNT_BIG(DISTINCT blocks.DistrictCode) AS DistrictCodeCount,
               SUM(CASE WHEN blocks.DistrictCode <> districts.DistrictCode THEN CAST(1 AS BIGINT) ELSE 0 END) AS IncorrectDistrictCodes,
               SUM(CASE WHEN blocks.Shape IS NOT NULL AND blocks.Shape.STIsValid() = 0 THEN CAST(1 AS BIGINT) ELSE 0 END) AS InvalidGeometries,
               (SELECT column_id FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.NhmGisBlocks') AND name = N'DistrictName') AS DistrictNameOrdinal,
               (SELECT column_id FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.NhmGisBlocks') AND name = N'DistrictCode') AS DistrictCodeOrdinal,
               (SELECT column_id FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.NhmGisBlocks') AND name = N'Shape') AS ShapeOrdinal
        FROM dbo.NhmGisBlocks blocks
        INNER JOIN dbo.NhmGisDistricts districts
            ON CASE UPPER(LTRIM(RTRIM(blocks.DistrictName)))
                   WHEN N'BARAGARH' THEN N'BARGARH'
                   WHEN N'KENDRAPADA' THEN N'KENDRAPARA'
                   WHEN N'NABARANGPUR' THEN N'NAWARANGPUR'
                   ELSE UPPER(LTRIM(RTRIM(blocks.DistrictName)))
               END = UPPER(LTRIM(RTRIM(districts.DistrictName)));
        """;
    await using var result = await verification.ExecuteReaderAsync();
    await result.ReadAsync();
    Console.WriteLine($"dbo.NhmGisBlocks: {result.GetInt64(0):N0} rows; {result.GetInt64(1):N0} missing codes; {result.GetInt64(2):N0} district codes; {result.GetInt64(3):N0} incorrect codes; {result.GetInt64(4):N0} invalid geometries");
    Console.WriteLine($"Column order: DistrictName #{result.GetInt32(5)}, DistrictCode #{result.GetInt32(6)}, Shape #{result.GetInt32(7)}");
    return;
}

if (syncVillageBlocks)
{
    var assignments = VillageBlockMatcher.Build(sourceDirectory);
    await using var villageSyncTransaction = (SqlTransaction)await connection.BeginTransactionAsync();
    try
    {
        await SyncVillageBlocksAsync(connection, villageSyncTransaction, assignments);
        await villageSyncTransaction.CommitAsync();
    }
    catch
    {
        await villageSyncTransaction.RollbackAsync();
        throw;
    }

    await PrintVillageBlockVerificationAsync(connection);
    return;
}

if (inspectOnly)
{
    Console.WriteLine($"Database: {connection.Database}");
    foreach (var layer in layers)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = $"""
            IF OBJECT_ID(N'dbo.{layer.TableName}', N'U') IS NULL
                SELECT CAST(-1 AS BIGINT) AS TotalRows, CAST(0 AS BIGINT) AS GeometryRows,
                       CAST(0 AS BIGINT) AS InvalidGeometries, NULL AS MinimumSrid, NULL AS MaximumSrid;
            ELSE
                SELECT COUNT_BIG(*) AS TotalRows, COUNT_BIG(Shape) AS GeometryRows,
                       COALESCE(SUM(CASE WHEN Shape IS NOT NULL AND Shape.STIsValid() = 0 THEN CAST(1 AS BIGINT) ELSE 0 END), 0) AS InvalidGeometries,
                       MIN(CASE WHEN Shape IS NOT NULL THEN Shape.STSrid END) AS MinimumSrid,
                       MAX(CASE WHEN Shape IS NOT NULL THEN Shape.STSrid END) AS MaximumSrid
                FROM dbo.[{layer.TableName}];
            """;
        await using var reader = await command.ExecuteReaderAsync();
        await reader.ReadAsync();
        var count = reader.GetInt64(0);
        if (count < 0)
        {
            Console.WriteLine($"dbo.{layer.TableName}: not present");
            continue;
        }

        var geometryCount = reader.GetInt64(1);
        var invalidCount = reader.GetInt64(2);
        var srid = reader.IsDBNull(3) ? "n/a" : reader.GetInt32(3) == reader.GetInt32(4) ? reader.GetInt32(3).ToString(CultureInfo.InvariantCulture) : $"{reader.GetInt32(3)}-{reader.GetInt32(4)}";
        Console.WriteLine($"dbo.{layer.TableName}: {count:N0} rows; {geometryCount:N0} geometries; {invalidCount:N0} invalid; SRID {srid}");
    }
    return;
}

await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();
try
{
    await ExecuteAsync(connection, transaction, LayerDefinitions.CreateSchemaSql);

    foreach (var layer in layers)
    {
        var sourcePath = Path.Combine(sourceDirectory, layer.SourceBaseName);
        var attributes = DbfReader.Read(sourcePath + ".dbf");
        var shapes = ShapefileReader.Read(sourcePath + ".shp");
        if (attributes.Count != shapes.Count)
        {
            throw new InvalidDataException($"{layer.SourceBaseName} has {attributes.Count} DBF records but {shapes.Count} shapes.");
        }

        await ImportLayerAsync(connection, transaction, layer, attributes, shapes);
        Console.WriteLine($"dbo.{layer.TableName}: imported {attributes.Count:N0} rows");
    }

    await ExecuteAsync(connection, transaction, LayerDefinitions.SyncBlockDistrictCodesSql);
    var villageAssignments = VillageBlockMatcher.Build(sourceDirectory);
    await SyncVillageBlocksAsync(connection, transaction, villageAssignments);
    await ExecuteAsync(connection, transaction, LayerDefinitions.FinalizeSql);
    await transaction.CommitAsync();
}
catch
{
    await transaction.RollbackAsync();
    throw;
}

Console.WriteLine($"NHM GIS import committed to {connection.Database}.");

static async Task ImportLayerAsync(
    SqlConnection connection,
    SqlTransaction transaction,
    LayerDefinition layer,
    IReadOnlyList<IReadOnlyDictionary<string, object?>> rows,
    IReadOnlyList<Shape?> shapes)
{
    var stageName = $"#Stage{layer.TableName}";
    var stageColumns = string.Join(",\n", layer.Columns.Select(column => $"[{column.DatabaseName}] {column.SqlType} NULL"));
    await ExecuteAsync(connection, transaction, $"""
        DELETE FROM dbo.[{layer.TableName}];
        CREATE TABLE {stageName}
        (
            SourceRecordNumber INT NOT NULL,
            {stageColumns},
            ShapeWkt NVARCHAR(MAX) NULL
        );
        """);

    var table = new DataTable();
    table.Columns.Add("SourceRecordNumber", typeof(int));
    foreach (var column in layer.Columns)
    {
        table.Columns.Add(column.DatabaseName, column.ClrType);
    }
    table.Columns.Add("ShapeWkt", typeof(string));

    const int batchSize = 500;
    for (var index = 0; index < rows.Count; index++)
    {
        var dataRow = table.NewRow();
        dataRow["SourceRecordNumber"] = index + 1;
        foreach (var column in layer.Columns)
        {
            rows[index].TryGetValue(column.SourceName, out var value);
            dataRow[column.DatabaseName] = ConvertValue(value, column.ClrType);
        }
        dataRow["ShapeWkt"] = shapes[index]?.ToWkt() ?? (object)DBNull.Value;
        table.Rows.Add(dataRow);

        if (table.Rows.Count == batchSize || index == rows.Count - 1)
        {
            using var bulkCopy = new SqlBulkCopy(connection, SqlBulkCopyOptions.CheckConstraints, transaction)
            {
                DestinationTableName = stageName,
                BatchSize = batchSize,
                BulkCopyTimeout = 300
            };
            foreach (DataColumn column in table.Columns)
            {
                bulkCopy.ColumnMappings.Add(column.ColumnName, column.ColumnName);
            }
            await bulkCopy.WriteToServerAsync(table);
            table.Clear();
        }
    }

    var finalColumns = string.Join(", ", layer.Columns.Select(column => $"[{column.DatabaseName}]"));
    await ExecuteAsync(connection, transaction, $"""
        INSERT INTO dbo.[{layer.TableName}] (SourceRecordNumber, {finalColumns}, Shape)
        SELECT SourceRecordNumber, {finalColumns},
               CASE WHEN ShapeWkt IS NULL THEN NULL ELSE geometry::STGeomFromText(ShapeWkt, 4326).MakeValid() END
        FROM {stageName};
        DROP TABLE {stageName};
        """, 600);
}

static async Task SyncVillageBlocksAsync(
    SqlConnection connection,
    SqlTransaction transaction,
    IReadOnlyList<VillageBlockAssignment> assignments)
{
    await ExecuteAsync(connection, transaction, """
        IF OBJECT_ID(N'dbo.NhmGisVillages', N'U') IS NULL OR OBJECT_ID(N'dbo.NhmGisBlocks', N'U') IS NULL
            THROW 50010, 'The NHM GIS village and block tables must exist before village block assignments can be synchronized.', 1;

        CREATE TABLE #VillageBlockAssignments
        (
            SourceRecordNumber INT NOT NULL PRIMARY KEY,
            BlockSourceRecordNumber INT NOT NULL
        );
        """);

    var table = new DataTable();
    table.Columns.Add("SourceRecordNumber", typeof(int));
    table.Columns.Add("BlockSourceRecordNumber", typeof(int));
    foreach (var assignment in assignments)
    {
        table.Rows.Add(assignment.SourceRecordNumber, assignment.BlockSourceRecordNumber);
    }

    using (var bulkCopy = new SqlBulkCopy(connection, SqlBulkCopyOptions.CheckConstraints, transaction)
    {
        DestinationTableName = "#VillageBlockAssignments",
        BatchSize = 1000,
        BulkCopyTimeout = 300
    })
    {
        bulkCopy.ColumnMappings.Add("SourceRecordNumber", "SourceRecordNumber");
        bulkCopy.ColumnMappings.Add("BlockSourceRecordNumber", "BlockSourceRecordNumber");
        await bulkCopy.WriteToServerAsync(table);
    }

    await ExecuteAsync(connection, transaction, LayerDefinitions.SyncVillageBlocksSql, 600);
}

static async Task PrintVillageBlockVerificationAsync(SqlConnection connection)
{
    await using var verification = connection.CreateCommand();
    verification.CommandTimeout = 300;
    verification.CommandText = """
        SELECT COUNT_BIG(*) AS VillageCount,
               SUM(CASE WHEN villages.BlockCode IS NULL OR villages.BlockName IS NULL OR villages.DistrictCode IS NULL OR villages.DistrictName IS NULL THEN CAST(1 AS BIGINT) ELSE 0 END) AS MissingAssignments,
               SUM(CASE WHEN matching.BlockId IS NULL THEN CAST(1 AS BIGINT) ELSE 0 END) AS IncorrectAssignments,
               SUM(CASE WHEN villages.Shape IS NOT NULL AND matching.BlockShape IS NOT NULL
                              AND villages.Shape.STIntersects(matching.BlockShape) = 0
                        THEN CAST(1 AS BIGINT) ELSE 0 END) AS SpatiallyDisjointAssignments,
               (SELECT COUNT_BIG(*) FROM (SELECT BlockCode, BlockName FROM dbo.NhmGisVillages GROUP BY BlockCode, BlockName) assignedBlocks) AS AssignedBlockCount,
               SUM(CASE WHEN villages.Shape IS NOT NULL AND villages.Shape.STIsValid() = 0 THEN CAST(1 AS BIGINT) ELSE 0 END) AS InvalidGeometries,
               (SELECT column_id FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.NhmGisVillages') AND name = N'VillageType') AS VillageTypeOrdinal,
               (SELECT column_id FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.NhmGisVillages') AND name = N'LocationName') AS LocationNameOrdinal,
               (SELECT column_id FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.NhmGisVillages') AND name = N'BlockCode') AS BlockCodeOrdinal,
               (SELECT column_id FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.NhmGisVillages') AND name = N'BlockName') AS BlockNameOrdinal,
               (SELECT column_id FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.NhmGisVillages') AND name = N'DistrictCode') AS DistrictCodeOrdinal,
               (SELECT column_id FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.NhmGisVillages') AND name = N'DistrictName') AS DistrictNameOrdinal
        FROM dbo.NhmGisVillages villages
        OUTER APPLY
        (
            SELECT TOP (1) blocks.BlockId, blocks.Shape AS BlockShape
            FROM dbo.NhmGisBlocks blocks
            WHERE blocks.BlockCode = villages.BlockCode AND blocks.BlockName = villages.BlockName
              AND blocks.DistrictCode = villages.DistrictCode AND blocks.DistrictName = villages.DistrictName
        ) matching;
        """;
    await using var result = await verification.ExecuteReaderAsync();
    await result.ReadAsync();
    Console.WriteLine($"dbo.NhmGisVillages: {result.GetInt64(0):N0} rows; {result.GetInt64(1):N0} missing assignments; {result.GetInt64(2):N0} incorrect assignments; {result.GetInt64(3):N0} spatially disjoint source polygons; {result.GetInt64(4):N0} blocks; {result.GetInt64(5):N0} invalid geometries");
    Console.WriteLine($"Column order: VillageType #{result.GetInt32(6)}, LocationName #{result.GetInt32(7)}, BlockCode #{result.GetInt32(8)}, BlockName #{result.GetInt32(9)}, DistrictCode #{result.GetInt32(10)}, DistrictName #{result.GetInt32(11)}");
}

static object ConvertValue(object? value, Type targetType)
{
    if (value is null || value is DBNull || value is string text && string.IsNullOrWhiteSpace(text))
    {
        return DBNull.Value;
    }

    if (targetType == typeof(string))
    {
        return Convert.ToString(value, CultureInfo.InvariantCulture)?.Trim() ?? (object)DBNull.Value;
    }
    if (targetType == typeof(int))
    {
        return Convert.ToInt32(value, CultureInfo.InvariantCulture);
    }
    if (targetType == typeof(decimal))
    {
        return Convert.ToDecimal(value, CultureInfo.InvariantCulture);
    }
    throw new NotSupportedException($"Unsupported target type {targetType.Name}.");
}

static async Task ExecuteAsync(SqlConnection connection, SqlTransaction transaction, string sql, int timeout = 120)
{
    await using var command = connection.CreateCommand();
    command.Transaction = transaction;
    command.CommandTimeout = timeout;
    command.CommandText = sql;
    await command.ExecuteNonQueryAsync();
}

static string GetConnectionString(string repositoryRoot)
{
    var environmentValue = Environment.GetEnvironmentVariable("OSPBCR_PORTAL_DATABASE_CONNECTION");
    if (!string.IsNullOrWhiteSpace(environmentValue))
    {
        return environmentValue;
    }

    var settingsPath = Path.Combine(repositoryRoot, "appsettings.json");
    using var settings = JsonDocument.Parse(File.ReadAllText(settingsPath));
    return settings.RootElement
        .GetProperty("ConnectionStrings")
        .GetProperty("OSPBCR_PORTAL")
        .GetString()
        ?? throw new InvalidOperationException("ConnectionStrings:OSPBCR_PORTAL is empty.");
}

static string FindRepositoryRoot(string startingPath)
{
    var directory = new DirectoryInfo(startingPath);
    while (directory is not null)
    {
        if (File.Exists(Path.Combine(directory.FullName, "OSPBCR_PORTAL.csproj")))
        {
            return directory.FullName;
        }
        directory = directory.Parent;
    }
    throw new DirectoryNotFoundException("Could not locate the OSPBCR_PORTAL repository root.");
}

internal sealed record ColumnDefinition(string DatabaseName, string SourceName, string SqlType, Type ClrType);
internal sealed record LayerDefinition(string SourceBaseName, string TableName, IReadOnlyList<ColumnDefinition> Columns);

internal static class LayerDefinitions
{
    private static ColumnDefinition Text(string databaseName, string sourceName, int length) =>
        new(databaseName, sourceName, $"NVARCHAR({length})", typeof(string));
    private static ColumnDefinition Integer(string databaseName, string sourceName) =>
        new(databaseName, sourceName, "INT", typeof(int));
    private static ColumnDefinition Number(string databaseName, string sourceName) =>
        new(databaseName, sourceName, "DECIMAL(18,8)", typeof(decimal));

    public static readonly IReadOnlyList<LayerDefinition> All =
    [
        new("district boundary", "NhmGisDistricts",
        [
            Text("DistrictName", "DISTRICT", 100), Integer("BlockCount", "COUNT"), Integer("DistrictCode", "CODE")
        ]),
        new("block boundary", "NhmGisBlocks",
        [
            Number("Area", "AREA"), Number("Perimeter", "PERIMETER"), Text("BlockCode", "T_CODE", 20),
            Text("BlockName", "T_NAME", 150), Text("DistrictName", "DISTRICT", 100)
        ]),
        new("village layer", "NhmGisVillages",
        [
            Number("Area", "AREA"), Number("Perimeter", "PERIMETER"), Integer("OriginalVillageNumber", "ORIVIL_"),
            Integer("OriginalVillageId", "ORIVIL_ID"), Text("StateCode", "SCODE", 20), Text("LocationCode", "LCODE", 40),
            Text("LocationName", "LOCATION", 200), Text("VillageType", "V_TYPE", 60)
        ]),
        new("subcentre odisha", "NhmGisSubcentres",
        [
            Integer("SourceId", "ID"), Text("DistrictName", "D_NAME", 100), Text("BlockName", "BLOCK", 150),
            Text("SubcentreName", "SUBCENTER", 200), Integer("SourceCode", "CODE"), Number("Longitude", "X_COODI"),
            Number("Latitude", "Y_COODI"), Text("Institution", "INST", 250), Integer("Pvtg", "PVTG"),
            Integer("PmJanman", "PM_JANMAN")
        ]),
        new("medical facility", "NhmGisMedicalFacilities",
        [
            Text("DistrictName", "DIST_NAME", 100), Text("BlockName", "BLOCK_NAME", 150), Text("MedicalCategory", "MED_CATEGO", 100),
            Text("LocationName", "LOCATION", 200), Text("VillageType", "V_TYPE", 60), Integer("SourceCode", "CODE_N"),
            Integer("Tribal", "TRIBAL"), Integer("FacilityType", "TYPE"), Text("Mhu", "MHU", 100), Text("Mhu1", "MHU1", 100),
            Text("Bb", "BB", 100), Text("Bsu", "BSU", 100), Text("Dwh", "DWH", 100), Integer("ChcRanking", "CHC_RANKIN"),
            Integer("SerialNumber", "SLNO"), Number("Longitude", "X_COODINAT"), Number("Latitude", "Y_COODINAT"),
            Text("Fru146Bsu", "FRU_146BSU", 100), Text("Institution", "INST", 250), Integer("Fiber", "FIBER"),
            Integer("Fiber3Km", "FIBER_3KM"), Integer("Fiber5Km", "FIBER_5KM"), Integer("Fru94_2022", "FRU94_2022"),
            Integer("Nbsu", "NBSU"), Integer("Nrc", "NRC"), Integer("BlockHeadquarters", "BLK_HQ")
        ])
    ];

    public const string CreateSchemaSql = """
        IF OBJECT_ID(N'dbo.NhmGisDistricts', N'U') IS NULL
            CREATE TABLE dbo.NhmGisDistricts
            (
                DistrictId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_NhmGisDistricts PRIMARY KEY,
                SourceRecordNumber INT NOT NULL, DistrictName NVARCHAR(100) NULL, BlockCount INT NULL,
                DistrictCode INT NULL, Shape geometry NULL
            );
        IF OBJECT_ID(N'dbo.NhmGisBlocks', N'U') IS NULL
            CREATE TABLE dbo.NhmGisBlocks
            (
                BlockId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_NhmGisBlocks PRIMARY KEY,
                SourceRecordNumber INT NOT NULL, Area DECIMAL(18,8) NULL, Perimeter DECIMAL(18,8) NULL,
                BlockCode NVARCHAR(20) NULL, BlockName NVARCHAR(150) NULL, DistrictName NVARCHAR(100) NULL,
                DistrictCode INT NULL, Shape geometry NULL
            );
        IF OBJECT_ID(N'dbo.NhmGisVillages', N'U') IS NULL
            CREATE TABLE dbo.NhmGisVillages
            (
                VillageId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_NhmGisVillages PRIMARY KEY,
                SourceRecordNumber INT NOT NULL, Area DECIMAL(18,8) NULL, Perimeter DECIMAL(18,8) NULL,
                OriginalVillageNumber INT NULL, OriginalVillageId INT NULL, StateCode NVARCHAR(20) NULL,
                LocationCode NVARCHAR(40) NULL, VillageType NVARCHAR(60) NULL, LocationName NVARCHAR(200) NULL,
                BlockCode NVARCHAR(20) NULL, BlockName NVARCHAR(150) NULL, DistrictCode INT NULL,
                DistrictName NVARCHAR(100) NULL, Shape geometry NULL
            );
        IF OBJECT_ID(N'dbo.NhmGisSubcentres', N'U') IS NULL
            CREATE TABLE dbo.NhmGisSubcentres
            (
                SubcentreId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_NhmGisSubcentres PRIMARY KEY,
                SourceRecordNumber INT NOT NULL, SourceId INT NULL, DistrictName NVARCHAR(100) NULL, BlockName NVARCHAR(150) NULL,
                SubcentreName NVARCHAR(200) NULL, SourceCode INT NULL, Longitude DECIMAL(18,8) NULL, Latitude DECIMAL(18,8) NULL,
                Institution NVARCHAR(250) NULL, Pvtg INT NULL, PmJanman INT NULL, Shape geometry NULL
            );
        IF OBJECT_ID(N'dbo.NhmGisMedicalFacilities', N'U') IS NULL
            CREATE TABLE dbo.NhmGisMedicalFacilities
            (
                MedicalFacilityId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_NhmGisMedicalFacilities PRIMARY KEY,
                SourceRecordNumber INT NOT NULL, DistrictName NVARCHAR(100) NULL, BlockName NVARCHAR(150) NULL,
                MedicalCategory NVARCHAR(100) NULL, LocationName NVARCHAR(200) NULL, VillageType NVARCHAR(60) NULL,
                SourceCode INT NULL, Tribal INT NULL, FacilityType INT NULL, Mhu NVARCHAR(100) NULL, Mhu1 NVARCHAR(100) NULL,
                Bb NVARCHAR(100) NULL, Bsu NVARCHAR(100) NULL, Dwh NVARCHAR(100) NULL, ChcRanking INT NULL,
                SerialNumber INT NULL, Longitude DECIMAL(18,8) NULL, Latitude DECIMAL(18,8) NULL, Fru146Bsu NVARCHAR(100) NULL,
                Institution NVARCHAR(250) NULL, Fiber INT NULL, Fiber3Km INT NULL, Fiber5Km INT NULL, Fru94_2022 INT NULL,
                Nbsu INT NULL, Nrc INT NULL, BlockHeadquarters INT NULL, Shape geometry NULL
            );
        IF OBJECT_ID(N'dbo.NhmGisImportLog', N'U') IS NULL
            CREATE TABLE dbo.NhmGisImportLog
            (
                ImportId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_NhmGisImportLog PRIMARY KEY,
                SourceArchive NVARCHAR(260) NOT NULL, ImportedAt DATETIMEOFFSET(0) NOT NULL,
                DistrictCount INT NOT NULL, BlockCount INT NOT NULL, VillageCount INT NOT NULL,
                SubcentreCount INT NOT NULL, MedicalFacilityCount INT NOT NULL
            );
        IF COL_LENGTH(N'dbo.NhmGisBlocks', N'DistrictCode') IS NULL
            ALTER TABLE dbo.NhmGisBlocks ADD DistrictCode INT NULL;
        """;

    public const string FinalizeSql = """
        UPDATE blocks
        SET DistrictCode = districts.DistrictCode
        FROM dbo.NhmGisBlocks blocks
        INNER JOIN dbo.NhmGisDistricts districts
            ON CASE UPPER(LTRIM(RTRIM(blocks.DistrictName)))
                   WHEN N'BARAGARH' THEN N'BARGARH'
                   WHEN N'KENDRAPADA' THEN N'KENDRAPARA'
                   WHEN N'NABARANGPUR' THEN N'NAWARANGPUR'
                   ELSE UPPER(LTRIM(RTRIM(blocks.DistrictName)))
               END = UPPER(LTRIM(RTRIM(districts.DistrictName)));

        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.NhmGisDistricts') AND name = N'UX_NhmGisDistricts_DistrictCode')
            CREATE UNIQUE INDEX UX_NhmGisDistricts_DistrictCode ON dbo.NhmGisDistricts(DistrictCode) WHERE DistrictCode IS NOT NULL;
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.NhmGisBlocks') AND name = N'IX_NhmGisBlocks_DistrictName_BlockName')
            CREATE INDEX IX_NhmGisBlocks_DistrictName_BlockName ON dbo.NhmGisBlocks(DistrictName, BlockName);
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.NhmGisBlocks') AND name = N'IX_NhmGisBlocks_DistrictCode_BlockName')
            CREATE INDEX IX_NhmGisBlocks_DistrictCode_BlockName ON dbo.NhmGisBlocks(DistrictCode, BlockName);
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.NhmGisVillages') AND name = N'IX_NhmGisVillages_LocationCode')
            CREATE INDEX IX_NhmGisVillages_LocationCode ON dbo.NhmGisVillages(LocationCode);
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.NhmGisSubcentres') AND name = N'IX_NhmGisSubcentres_DistrictName_BlockName')
            CREATE INDEX IX_NhmGisSubcentres_DistrictName_BlockName ON dbo.NhmGisSubcentres(DistrictName, BlockName);
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.NhmGisMedicalFacilities') AND name = N'IX_NhmGisMedicalFacilities_DistrictName_BlockName')
            CREATE INDEX IX_NhmGisMedicalFacilities_DistrictName_BlockName ON dbo.NhmGisMedicalFacilities(DistrictName, BlockName);

        INSERT INTO dbo.NhmGisImportLog
            (SourceArchive, ImportedAt, DistrictCount, BlockCount, VillageCount, SubcentreCount, MedicalFacilityCount)
        SELECT N'GIS files NHM.rar', SYSDATETIMEOFFSET(),
               (SELECT COUNT(*) FROM dbo.NhmGisDistricts), (SELECT COUNT(*) FROM dbo.NhmGisBlocks),
               (SELECT COUNT(*) FROM dbo.NhmGisVillages), (SELECT COUNT(*) FROM dbo.NhmGisSubcentres),
               (SELECT COUNT(*) FROM dbo.NhmGisMedicalFacilities);
        """;

    public const string SyncBlockDistrictCodesSql = """
        IF OBJECT_ID(N'dbo.NhmGisBlocks', N'U') IS NULL OR OBJECT_ID(N'dbo.NhmGisDistricts', N'U') IS NULL
            THROW 50000, 'The NHM GIS district and block tables must exist before district codes can be synchronized.', 1;

        IF EXISTS
        (
            SELECT UPPER(LTRIM(RTRIM(DistrictName)))
            FROM dbo.NhmGisDistricts
            GROUP BY UPPER(LTRIM(RTRIM(DistrictName)))
            HAVING COUNT(*) <> 1
        )
            THROW 50001, 'District names are not unique in dbo.NhmGisDistricts.', 1;

        IF EXISTS
        (
            SELECT 1
            FROM dbo.NhmGisBlocks blocks
            LEFT JOIN dbo.NhmGisDistricts districts
                ON CASE UPPER(LTRIM(RTRIM(blocks.DistrictName)))
                       WHEN N'BARAGARH' THEN N'BARGARH'
                       WHEN N'KENDRAPADA' THEN N'KENDRAPARA'
                       WHEN N'NABARANGPUR' THEN N'NAWARANGPUR'
                       ELSE UPPER(LTRIM(RTRIM(blocks.DistrictName)))
                   END = UPPER(LTRIM(RTRIM(districts.DistrictName)))
            WHERE districts.DistrictId IS NULL
        )
            THROW 50002, 'At least one block district name does not match dbo.NhmGisDistricts.', 1;

        IF COL_LENGTH(N'dbo.NhmGisBlocks', N'DistrictCode') IS NULL
        BEGIN
            CREATE TABLE dbo.NhmGisBlocks_Rebuild
            (
                BlockId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_NhmGisBlocks_Rebuild PRIMARY KEY,
                SourceRecordNumber INT NOT NULL,
                Area DECIMAL(18,8) NULL,
                Perimeter DECIMAL(18,8) NULL,
                BlockCode NVARCHAR(20) NULL,
                BlockName NVARCHAR(150) NULL,
                DistrictName NVARCHAR(100) NULL,
                DistrictCode INT NULL,
                Shape geometry NULL
            );

            SET IDENTITY_INSERT dbo.NhmGisBlocks_Rebuild ON;
            INSERT INTO dbo.NhmGisBlocks_Rebuild
                (BlockId, SourceRecordNumber, Area, Perimeter, BlockCode, BlockName, DistrictName, DistrictCode, Shape)
            SELECT blocks.BlockId, blocks.SourceRecordNumber, blocks.Area, blocks.Perimeter, blocks.BlockCode,
                   blocks.BlockName, blocks.DistrictName, districts.DistrictCode, blocks.Shape
            FROM dbo.NhmGisBlocks blocks
            INNER JOIN dbo.NhmGisDistricts districts
                ON CASE UPPER(LTRIM(RTRIM(blocks.DistrictName)))
                       WHEN N'BARAGARH' THEN N'BARGARH'
                       WHEN N'KENDRAPADA' THEN N'KENDRAPARA'
                       WHEN N'NABARANGPUR' THEN N'NAWARANGPUR'
                       ELSE UPPER(LTRIM(RTRIM(blocks.DistrictName)))
                   END = UPPER(LTRIM(RTRIM(districts.DistrictName)));
            SET IDENTITY_INSERT dbo.NhmGisBlocks_Rebuild OFF;

            DROP TABLE dbo.NhmGisBlocks;
            EXEC sys.sp_rename N'dbo.NhmGisBlocks_Rebuild', N'NhmGisBlocks';
            EXEC sys.sp_rename N'dbo.PK_NhmGisBlocks_Rebuild', N'PK_NhmGisBlocks', N'OBJECT';
        END;

        EXEC sys.sp_executesql N'
            UPDATE blocks
            SET DistrictCode = districts.DistrictCode
            FROM dbo.NhmGisBlocks blocks
            INNER JOIN dbo.NhmGisDistricts districts
                ON CASE UPPER(LTRIM(RTRIM(blocks.DistrictName)))
                       WHEN N''BARAGARH'' THEN N''BARGARH''
                       WHEN N''KENDRAPADA'' THEN N''KENDRAPARA''
                       WHEN N''NABARANGPUR'' THEN N''NAWARANGPUR''
                       ELSE UPPER(LTRIM(RTRIM(blocks.DistrictName)))
                   END = UPPER(LTRIM(RTRIM(districts.DistrictName)));

            IF EXISTS (SELECT 1 FROM dbo.NhmGisBlocks WHERE DistrictCode IS NULL)
                THROW 50003, ''DistrictCode synchronization left one or more blocks without a district code.'', 1;

            IF NOT EXISTS
            (
                SELECT 1 FROM sys.indexes
                WHERE object_id = OBJECT_ID(N''dbo.NhmGisBlocks'')
                  AND name = N''IX_NhmGisBlocks_DistrictName_BlockName''
            )
                CREATE INDEX IX_NhmGisBlocks_DistrictName_BlockName ON dbo.NhmGisBlocks(DistrictName, BlockName);

            IF NOT EXISTS
            (
                SELECT 1 FROM sys.indexes
                WHERE object_id = OBJECT_ID(N''dbo.NhmGisBlocks'')
                  AND name = N''IX_NhmGisBlocks_DistrictCode_BlockName''
            )
                CREATE INDEX IX_NhmGisBlocks_DistrictCode_BlockName ON dbo.NhmGisBlocks(DistrictCode, BlockName);
        ';
        """;

    public const string SyncVillageBlocksSql = """
        IF (SELECT COUNT_BIG(*) FROM #VillageBlockAssignments) <> (SELECT COUNT_BIG(*) FROM dbo.NhmGisVillages)
            THROW 50011, 'Village assignment count does not match dbo.NhmGisVillages.', 1;

        IF EXISTS
        (
            SELECT 1
            FROM dbo.NhmGisVillages villages
            LEFT JOIN #VillageBlockAssignments assignments ON assignments.SourceRecordNumber = villages.SourceRecordNumber
            WHERE assignments.SourceRecordNumber IS NULL
        )
            THROW 50012, 'At least one village has no derived block assignment.', 1;

        IF EXISTS
        (
            SELECT 1
            FROM #VillageBlockAssignments assignments
            LEFT JOIN dbo.NhmGisBlocks blocks ON blocks.SourceRecordNumber = assignments.BlockSourceRecordNumber
            WHERE blocks.BlockId IS NULL
        )
            THROW 50013, 'At least one derived block code is absent from dbo.NhmGisBlocks.', 1;

        DECLARE @NeedsVillageRebuild BIT = CASE
            WHEN COL_LENGTH(N'dbo.NhmGisVillages', N'BlockCode') IS NULL THEN 1
            WHEN COL_LENGTH(N'dbo.NhmGisVillages', N'BlockName') IS NULL THEN 1
            WHEN COL_LENGTH(N'dbo.NhmGisVillages', N'DistrictCode') IS NULL THEN 1
            WHEN COL_LENGTH(N'dbo.NhmGisVillages', N'DistrictName') IS NULL THEN 1
            WHEN (SELECT column_id FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.NhmGisVillages') AND name = N'VillageType') <> 9 THEN 1
            WHEN (SELECT column_id FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.NhmGisVillages') AND name = N'LocationName') <> 10 THEN 1
            WHEN (SELECT column_id FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.NhmGisVillages') AND name = N'BlockCode') <> 11 THEN 1
            WHEN (SELECT column_id FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.NhmGisVillages') AND name = N'BlockName') <> 12 THEN 1
            WHEN (SELECT column_id FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.NhmGisVillages') AND name = N'DistrictCode') <> 13 THEN 1
            WHEN (SELECT column_id FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.NhmGisVillages') AND name = N'DistrictName') <> 14 THEN 1
            ELSE 0 END;

        IF @NeedsVillageRebuild = 1
        BEGIN
            CREATE TABLE dbo.NhmGisVillages_Rebuild
            (
                VillageId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_NhmGisVillages_Rebuild PRIMARY KEY,
                SourceRecordNumber INT NOT NULL,
                Area DECIMAL(18,8) NULL,
                Perimeter DECIMAL(18,8) NULL,
                OriginalVillageNumber INT NULL,
                OriginalVillageId INT NULL,
                StateCode NVARCHAR(20) NULL,
                LocationCode NVARCHAR(40) NULL,
                VillageType NVARCHAR(60) NULL,
                LocationName NVARCHAR(200) NULL,
                BlockCode NVARCHAR(20) NULL,
                BlockName NVARCHAR(150) NULL,
                DistrictCode INT NULL,
                DistrictName NVARCHAR(100) NULL,
                Shape geometry NULL
            );

            SET IDENTITY_INSERT dbo.NhmGisVillages_Rebuild ON;
            INSERT INTO dbo.NhmGisVillages_Rebuild
                (VillageId, SourceRecordNumber, Area, Perimeter, OriginalVillageNumber, OriginalVillageId,
                 StateCode, LocationCode, VillageType, LocationName, BlockCode, BlockName, DistrictCode, DistrictName, Shape)
            SELECT villages.VillageId, villages.SourceRecordNumber, villages.Area, villages.Perimeter,
                   villages.OriginalVillageNumber, villages.OriginalVillageId, villages.StateCode, villages.LocationCode,
                   villages.VillageType, villages.LocationName, blocks.BlockCode, blocks.BlockName,
                   blocks.DistrictCode, blocks.DistrictName, villages.Shape
            FROM dbo.NhmGisVillages villages
            INNER JOIN #VillageBlockAssignments assignments ON assignments.SourceRecordNumber = villages.SourceRecordNumber
            INNER JOIN dbo.NhmGisBlocks blocks ON blocks.SourceRecordNumber = assignments.BlockSourceRecordNumber;
            SET IDENTITY_INSERT dbo.NhmGisVillages_Rebuild OFF;

            DROP TABLE dbo.NhmGisVillages;
            EXEC sys.sp_rename N'dbo.NhmGisVillages_Rebuild', N'NhmGisVillages';
            EXEC sys.sp_rename N'dbo.PK_NhmGisVillages_Rebuild', N'PK_NhmGisVillages', N'OBJECT';
        END
        ELSE
        BEGIN
            EXEC sys.sp_executesql N'
                UPDATE villages
                SET BlockCode = blocks.BlockCode,
                    BlockName = blocks.BlockName,
                    DistrictCode = blocks.DistrictCode,
                    DistrictName = blocks.DistrictName
                FROM dbo.NhmGisVillages villages
                INNER JOIN #VillageBlockAssignments assignments ON assignments.SourceRecordNumber = villages.SourceRecordNumber
                INNER JOIN dbo.NhmGisBlocks blocks ON blocks.SourceRecordNumber = assignments.BlockSourceRecordNumber;
            ';
        END;

        IF (SELECT COUNT_BIG(*) FROM dbo.NhmGisVillages) <> (SELECT COUNT_BIG(*) FROM #VillageBlockAssignments)
            THROW 50014, 'Village table rebuild changed the number of village rows.', 1;

        EXEC sys.sp_executesql N'
            IF EXISTS
            (
                SELECT 1
                FROM dbo.NhmGisVillages villages
                WHERE NOT EXISTS
                (
                    SELECT 1
                    FROM dbo.NhmGisBlocks blocks
                    WHERE blocks.BlockCode = villages.BlockCode
                      AND blocks.BlockName = villages.BlockName
                      AND blocks.DistrictCode = villages.DistrictCode
                      AND blocks.DistrictName = villages.DistrictName
                )
            )
                THROW 50015, ''Village block or district attributes do not match dbo.NhmGisBlocks.'', 1;

            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N''dbo.NhmGisVillages'') AND name = N''IX_NhmGisVillages_LocationCode'')
                CREATE INDEX IX_NhmGisVillages_LocationCode ON dbo.NhmGisVillages(LocationCode);
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N''dbo.NhmGisVillages'') AND name = N''IX_NhmGisVillages_BlockCode_LocationName'')
                CREATE INDEX IX_NhmGisVillages_BlockCode_LocationName ON dbo.NhmGisVillages(BlockCode, LocationName);
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N''dbo.NhmGisVillages'') AND name = N''IX_NhmGisVillages_DistrictCode_BlockCode'')
                CREATE INDEX IX_NhmGisVillages_DistrictCode_BlockCode ON dbo.NhmGisVillages(DistrictCode, BlockCode);
        ';
        """;
}

internal static class DbfReader
{
    public static IReadOnlyList<IReadOnlyDictionary<string, object?>> Read(string path)
    {
        using var stream = File.OpenRead(path);
        using var reader = new BinaryReader(stream);
        var header = reader.ReadBytes(32);
        var recordCount = BinaryPrimitives.ReadInt32LittleEndian(header.AsSpan(4, 4));
        var headerLength = BinaryPrimitives.ReadUInt16LittleEndian(header.AsSpan(8, 2));
        var recordLength = BinaryPrimitives.ReadUInt16LittleEndian(header.AsSpan(10, 2));
        var fields = new List<DbfField>();

        while (stream.Position < headerLength - 1)
        {
            var descriptor = reader.ReadBytes(32);
            if (descriptor.Length < 32 || descriptor[0] == 0x0d)
            {
                break;
            }
            var terminator = Array.IndexOf(descriptor, (byte)0, 0, 11);
            var nameLength = terminator < 0 ? 11 : terminator;
            fields.Add(new DbfField(Encoding.ASCII.GetString(descriptor, 0, nameLength), (char)descriptor[11], descriptor[16], descriptor[17]));
        }

        stream.Position = headerLength;
        var encoding = Encoding.GetEncoding(1252);
        var rows = new List<IReadOnlyDictionary<string, object?>>(recordCount);
        for (var recordIndex = 0; recordIndex < recordCount; recordIndex++)
        {
            var record = reader.ReadBytes(recordLength);
            if (record.Length != recordLength)
            {
                throw new EndOfStreamException($"Unexpected end of DBF file {path} at record {recordIndex + 1}.");
            }

            var values = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            var position = 1;
            foreach (var field in fields)
            {
                var text = encoding.GetString(record, position, field.Length).Trim();
                position += field.Length;
                object? value = string.IsNullOrEmpty(text) ? null : text;
                if (value is not null && field.Type is 'N' or 'F')
                {
                    value = field.DecimalCount == 0
                        ? int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var integer) ? integer : text
                        : decimal.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var number) ? number : text;
                }
                values[field.Name] = value;
            }
            rows.Add(values);
        }
        return rows;
    }

    private sealed record DbfField(string Name, char Type, int Length, int DecimalCount);
}

internal abstract record Shape
{
    public abstract string ToWkt();
}

internal sealed record PointShape(double X, double Y) : Shape
{
    public override string ToWkt() => FormattableString.Invariant($"POINT ({X:G17} {Y:G17})");
}

internal sealed record PolygonShape(IReadOnlyList<IReadOnlyList<Coordinate>> Parts) : Shape
{
    public override string ToWkt()
    {
        var rings = Parts.Where(part => part.Count >= 4).ToList();
        if (rings.Count == 0)
        {
            throw new InvalidDataException("Polygon contains no usable rings.");
        }

        var exteriors = rings.Where(ring => SignedArea(ring) < 0).ToList();
        var holes = rings.Where(ring => SignedArea(ring) >= 0).ToList();
        if (exteriors.Count == 0)
        {
            var largest = rings.MaxBy(ring => Math.Abs(SignedArea(ring)))!;
            exteriors.Add(largest);
            holes = rings.Where(ring => !ReferenceEquals(ring, largest)).ToList();
        }

        var polygons = exteriors.Select(exterior => new List<IReadOnlyList<Coordinate>> { exterior }).ToList();
        foreach (var hole in holes)
        {
            var containing = exteriors
                .Select((exterior, index) => new { Index = index, Area = Math.Abs(SignedArea(exterior)), Contains = PointInRing(hole[0], exterior) })
                .Where(candidate => candidate.Contains)
                .MinBy(candidate => candidate.Area);
            if (containing is null)
            {
                polygons.Add([hole]);
            }
            else
            {
                polygons[containing.Index].Add(hole);
            }
        }

        var polygonTexts = polygons.Select(polygon => $"({string.Join(",", polygon.Select(RingText))})").ToList();
        return polygonTexts.Count == 1
            ? $"POLYGON {polygonTexts[0]}"
            : $"MULTIPOLYGON ({string.Join(",", polygonTexts)})";
    }

    private static string RingText(IReadOnlyList<Coordinate> ring) =>
        $"({string.Join(",", ring.Select(point => FormattableString.Invariant($"{point.X:G17} {point.Y:G17}")))})";

    private static double SignedArea(IReadOnlyList<Coordinate> ring)
    {
        double area = 0;
        for (var index = 0; index < ring.Count - 1; index++)
        {
            area += ring[index].X * ring[index + 1].Y - ring[index + 1].X * ring[index].Y;
        }
        return area / 2;
    }

    private static bool PointInRing(Coordinate point, IReadOnlyList<Coordinate> ring)
    {
        var inside = false;
        var previous = ring[^1];
        foreach (var current in ring)
        {
            if ((previous.Y > point.Y) != (current.Y > point.Y))
            {
                var crossingX = (current.X - previous.X) * (point.Y - previous.Y) / (current.Y - previous.Y) + previous.X;
                if (point.X < crossingX)
                {
                    inside = !inside;
                }
            }
            previous = current;
        }
        return inside;
    }
}

internal readonly record struct Coordinate(double X, double Y);

internal readonly record struct ShapeBounds(double MinimumX, double MinimumY, double MaximumX, double MaximumY)
{
    public bool Contains(Coordinate point) =>
        MinimumX <= point.X && point.X <= MaximumX && MinimumY <= point.Y && point.Y <= MaximumY;

    public bool Intersects(ShapeBounds other) =>
        MinimumX <= other.MaximumX && other.MinimumX <= MaximumX &&
        MinimumY <= other.MaximumY && other.MinimumY <= MaximumY;
}

internal sealed record VillageBlockAssignment(int SourceRecordNumber, int BlockSourceRecordNumber);

internal static class VillageBlockMatcher
{
    public static IReadOnlyList<VillageBlockAssignment> Build(string sourceDirectory)
    {
        var blockBasePath = Path.Combine(sourceDirectory, "block boundary");
        var blockRows = DbfReader.Read(blockBasePath + ".dbf");
        var blockShapes = ShapefileReader.Read(blockBasePath + ".shp");
        var blocks = blockRows.Zip(blockShapes, (row, shape) => new { row, shape })
            .Select((item, index) =>
        {
            var blockCode = Value(item.row, "T_CODE");
            return item.shape is PolygonShape polygon && !string.IsNullOrWhiteSpace(blockCode)
                ? new BlockBoundary(index + 1, blockCode, polygon, Bounds(polygon))
                : null;
        }).Where(block => block is not null).Cast<BlockBoundary>().ToList();
        var blocksByCode = blocks
            .GroupBy(block => block.BlockCode, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.ToList(), StringComparer.OrdinalIgnoreCase);

        var villageBasePath = Path.Combine(sourceDirectory, "village layer");
        var villageRows = DbfReader.Read(villageBasePath + ".dbf");
        var villageShapes = ShapefileReader.Read(villageBasePath + ".shp");
        if (villageRows.Count != villageShapes.Count)
        {
            throw new InvalidDataException("Village DBF and shapefile record counts differ.");
        }

        var assignments = new List<VillageBlockAssignment>(villageRows.Count);
        var spatialMatches = 0;
        var codeFallbacks = 0;
        for (var index = 0; index < villageRows.Count; index++)
        {
            var locationCode = Value(villageRows[index], "LCODE");
            BlockBoundary? block = null;
            List<BlockBoundary>? codeCandidates = null;
            if (locationCode.Length >= 6)
            {
                blocksByCode.TryGetValue(locationCode[..6], out codeCandidates);
            }

            if (villageShapes[index] is PolygonShape villagePolygon)
            {
                var preferredBlock = codeCandidates?.Count == 1 ? codeCandidates[0] : null;
                block = BestSpatialMatch(villagePolygon, blocks, preferredBlock);
                if (block is not null)
                {
                    spatialMatches++;
                }
            }

            if (block is null && codeCandidates is { Count: > 0 })
            {
                block = codeCandidates[0];
                codeFallbacks++;
            }

            if (block is null)
            {
                throw new InvalidDataException($"Village source record {index + 1} ({Value(villageRows[index], "LOCATION")}) could not be matched to a block.");
            }
            assignments.Add(new VillageBlockAssignment(index + 1, block.SourceRecordNumber));
        }

        Console.WriteLine($"Village/block matching: {spatialMatches:N0} spatial matches; {codeFallbacks:N0} source-code fallbacks; 0 unmatched");
        return assignments;
    }

    private static BlockBoundary? BestSpatialMatch(
        PolygonShape village,
        IReadOnlyList<BlockBoundary> blocks,
        BlockBoundary? preferredBlock)
    {
        var villageBounds = Bounds(village);
        var candidates = blocks.Where(block => block.Bounds.Intersects(villageBounds)).ToList();
        if (candidates.Count == 0)
        {
            return null;
        }

        var scores = ScoreCandidates(village, villageBounds, candidates, 5);
        if (scores.Count == 0 || scores[0].Score == 0)
        {
            return null;
        }
        if (scores.Count > 1 &&
            (scores[0].Score == scores[1].Score || scores[1].Score >= scores[0].Score * 0.8))
        {
            scores = ScoreCandidates(village, villageBounds, candidates, 11);
        }

        var bestScore = scores[0].Score;
        var bestCandidates = scores.Where(result => result.Score == bestScore).ToList();
        var preferredResult = preferredBlock is null
            ? null
            : bestCandidates.FirstOrDefault(result =>
                result.Block.SourceRecordNumber == preferredBlock.SourceRecordNumber);
        return preferredResult?.Block ?? bestCandidates[0].Block;
    }

    private static List<BlockMatchScore> ScoreCandidates(
        PolygonShape village,
        ShapeBounds villageBounds,
        IReadOnlyList<BlockBoundary> candidates,
        int gridSize)
    {
        var samplePoints = InteriorSamplePoints(village, villageBounds, gridSize);
        return candidates
            .Select(candidate => new BlockMatchScore(
                candidate,
                samplePoints.Count(point => Contains(candidate.Shape, point))))
            .OrderByDescending(result => result.Score)
            .ThenBy(result => result.Block.SourceRecordNumber)
            .ToList();
    }

    private static IReadOnlyList<Coordinate> InteriorSamplePoints(
        PolygonShape village,
        ShapeBounds bounds,
        int gridSize)
    {
        var points = RepresentativePoints(village).Where(point => Contains(village, point)).ToList();
        if (bounds.MaximumX <= bounds.MinimumX || bounds.MaximumY <= bounds.MinimumY)
        {
            return points;
        }

        var stepX = (bounds.MaximumX - bounds.MinimumX) / gridSize;
        var stepY = (bounds.MaximumY - bounds.MinimumY) / gridSize;
        for (var row = 0; row < gridSize; row++)
        {
            var y = bounds.MinimumY + (row + 0.5) * stepY;
            for (var column = 0; column < gridSize; column++)
            {
                var point = new Coordinate(bounds.MinimumX + (column + 0.5) * stepX, y);
                if (Contains(village, point))
                {
                    points.Add(point);
                }
            }
        }
        return points;
    }

    private static string Value(IReadOnlyDictionary<string, object?> row, string name) =>
        row.TryGetValue(name, out var value)
            ? Convert.ToString(value, CultureInfo.InvariantCulture)?.Trim() ?? string.Empty
            : string.Empty;

    private static ShapeBounds Bounds(PolygonShape polygon)
    {
        var points = polygon.Parts.SelectMany(part => part).ToList();
        return new ShapeBounds(points.Min(point => point.X), points.Min(point => point.Y), points.Max(point => point.X), points.Max(point => point.Y));
    }

    private static IReadOnlyList<Coordinate> RepresentativePoints(PolygonShape polygon)
    {
        var largestRing = polygon.Parts.MaxBy(part => part.Count)!;
        var count = largestRing.Count > 1 && largestRing[0] == largestRing[^1] ? largestRing.Count - 1 : largestRing.Count;
        var mean = new Coordinate(
            largestRing.Take(count).Average(point => point.X),
            largestRing.Take(count).Average(point => point.Y));
        var bounds = Bounds(polygon);
        var boundsCentre = new Coordinate((bounds.MinimumX + bounds.MaximumX) / 2, (bounds.MinimumY + bounds.MaximumY) / 2);
        var segmentMidpoint = new Coordinate((largestRing[0].X + largestRing[1].X) / 2, (largestRing[0].Y + largestRing[1].Y) / 2);
        return [mean, boundsCentre, segmentMidpoint];
    }

    private static bool Contains(PolygonShape polygon, Coordinate point)
    {
        var containingRingCount = polygon.Parts.Count(ring => PointInRing(point, ring));
        return containingRingCount % 2 == 1;
    }

    private static bool PointInRing(Coordinate point, IReadOnlyList<Coordinate> ring)
    {
        var inside = false;
        var previous = ring[^1];
        foreach (var current in ring)
        {
            if ((previous.Y > point.Y) != (current.Y > point.Y))
            {
                var crossingX = (current.X - previous.X) * (point.Y - previous.Y) / (current.Y - previous.Y) + previous.X;
                if (point.X < crossingX)
                {
                    inside = !inside;
                }
            }
            previous = current;
        }
        return inside;
    }

    private sealed record BlockMatchScore(BlockBoundary Block, int Score);
    private sealed record BlockBoundary(int SourceRecordNumber, string BlockCode, PolygonShape Shape, ShapeBounds Bounds);
}

internal static class ShapefileReader
{
    public static IReadOnlyList<Shape?> Read(string path)
    {
        using var stream = File.OpenRead(path);
        using var reader = new BinaryReader(stream);
        if (reader.ReadBytes(100).Length != 100)
        {
            throw new InvalidDataException($"Invalid shapefile header: {path}");
        }

        var shapes = new List<Shape?>();
        while (stream.Position < stream.Length)
        {
            var recordHeader = reader.ReadBytes(8);
            if (recordHeader.Length == 0)
            {
                break;
            }
            if (recordHeader.Length != 8)
            {
                throw new EndOfStreamException($"Incomplete shapefile record header in {path}.");
            }

            var contentLength = BinaryPrimitives.ReadInt32BigEndian(recordHeader.AsSpan(4, 4)) * 2;
            var content = reader.ReadBytes(contentLength);
            if (content.Length != contentLength)
            {
                throw new EndOfStreamException($"Incomplete shapefile record in {path}.");
            }

            var shapeType = BinaryPrimitives.ReadInt32LittleEndian(content.AsSpan(0, 4));
            shapes.Add(shapeType switch
            {
                0 => null,
                1 => new PointShape(ReadDouble(content, 4), ReadDouble(content, 12)),
                5 => ReadPolygon(content),
                _ => throw new NotSupportedException($"Shape type {shapeType} in {path} is not supported.")
            });
        }
        return shapes;
    }

    private static PolygonShape ReadPolygon(byte[] content)
    {
        var partCount = BinaryPrimitives.ReadInt32LittleEndian(content.AsSpan(36, 4));
        var pointCount = BinaryPrimitives.ReadInt32LittleEndian(content.AsSpan(40, 4));
        var starts = new int[partCount + 1];
        for (var index = 0; index < partCount; index++)
        {
            starts[index] = BinaryPrimitives.ReadInt32LittleEndian(content.AsSpan(44 + index * 4, 4));
        }
        starts[^1] = pointCount;

        var pointsOffset = 44 + partCount * 4;
        var parts = new List<IReadOnlyList<Coordinate>>(partCount);
        for (var partIndex = 0; partIndex < partCount; partIndex++)
        {
            var part = new List<Coordinate>(starts[partIndex + 1] - starts[partIndex]);
            for (var pointIndex = starts[partIndex]; pointIndex < starts[partIndex + 1]; pointIndex++)
            {
                var offset = pointsOffset + pointIndex * 16;
                part.Add(new Coordinate(ReadDouble(content, offset), ReadDouble(content, offset + 8)));
            }
            parts.Add(part);
        }
        return new PolygonShape(parts);
    }

    private static double ReadDouble(byte[] content, int offset) =>
        BitConverter.Int64BitsToDouble(BinaryPrimitives.ReadInt64LittleEndian(content.AsSpan(offset, 8)));
}
