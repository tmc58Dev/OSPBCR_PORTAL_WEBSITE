using System.Data;
using Microsoft.Data.SqlClient;
using OSPBCR_PORTAL.Data;
using OSPBCR_PORTAL.Models;

namespace OSPBCR_PORTAL.Services;

public sealed class RegistryDataService(
    ISqlConnectionFactory connectionFactory,
    ILogger<RegistryDataService> logger) : IRegistryDataService
{
    public async Task<DatabaseHealthDto> GetHealthAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
            await using var command = connection.CreateCommand();

            command.CommandText = """
                SELECT
                    DB_NAME() AS DatabaseName,
                    @@SERVERNAME AS ServerName,
                    COUNT(*) AS TableCount
                FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_TYPE = 'BASE TABLE';
                """;

            await using var reader = await command.ExecuteReaderAsync(cancellationToken);

            if (!await reader.ReadAsync(cancellationToken))
            {
                return new DatabaseHealthDto(false, null, null, null, "No database metadata was returned.");
            }

            return new DatabaseHealthDto(
                true,
                ReadString(reader, "DatabaseName"),
                ReadString(reader, "ServerName"),
                Convert.ToInt32(reader["TableCount"]),
                null);
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Database health check failed.");
            return new DatabaseHealthDto(false, null, null, null, exception.Message);
        }
    }

    public async Task<IReadOnlyList<DistrictStatusDto>> GetDistrictStatusAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var tables = await LoadSchemaAsync(connection, cancellationToken);
        var table = FindBestTable(tables, DistrictColumns, "form", "patient", "case", "entry", "record", "status");
        var districtLookup = await LoadDistrictLookupAsync(connection, tables, cancellationToken);

        if (table is null)
        {
            return [];
        }

        var districtColumn = FindColumn(table, DistrictNameColumns) ?? FindColumn(table, DistrictIdColumns);
        var targetColumn = FindColumn(table, TargetColumns);
        var submittedColumn = FindColumn(table, SubmittedColumns);
        var pendingColumn = FindColumn(table, PendingColumns);
        var completionColumn = FindColumn(table, CompletionColumns);

        if (districtColumn is null)
        {
            return [];
        }

        if (submittedColumn is null && targetColumn is null && pendingColumn is null && completionColumn is null)
        {
            return await QueryGroupedDistrictStatusAsync(connection, table, districtColumn, districtLookup, cancellationToken);
        }

        var sql = $"""
            SELECT TOP (500)
                {ColumnOrDefault(districtColumn, "District", "N''")} AS District,
                {ColumnOrDefault(targetColumn, "Target", "0")} AS Target,
                {ColumnOrDefault(submittedColumn, "Submitted", "0")} AS Submitted,
                {ColumnOrDefault(pendingColumn, "Pending", "0")} AS Pending,
                {ColumnOrDefault(completionColumn, "Completion", "0")} AS Completion
            FROM {QuoteTable(table)}
            WHERE {QuoteColumn(districtColumn)} IS NOT NULL
            ORDER BY {QuoteColumn(districtColumn)};
            """;

        var values = await QueryAsync(connection, sql, reader => new DistrictStatusDto(
            ResolveDistrictName(ReadString(reader, "District"), districtLookup),
            ReadInt64(reader, "Target"),
            ReadInt64(reader, "Submitted"),
            ReadInt64(reader, "Pending"),
            ReadDecimal(reader, "Completion")), cancellationToken);

        return values.Where(value => !string.IsNullOrWhiteSpace(value.District)).ToList();
    }

    public async Task<IReadOnlyList<DistrictStatisticsDto>> GetDistrictStatisticsAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        const string sql = """
            WITH RegistryCounts AS
            (
                SELECT
                    LTRIM(RTRIM(CONVERT(nvarchar(100), patient.District))) AS DistrictId,
                    COUNT_BIG(*) AS CancerCases,
                    SUM(
                        CASE
                            WHEN TRY_CONVERT(
                                int,
                                LTRIM(RTRIM(tumour.YearDateOfDiagnosis))) = 2025
                                THEN CONVERT(bigint, 1)
                            ELSE CONVERT(bigint, 0)
                        END) AS IncidentCancerCases,
                    SUM(
                        CASE
                            WHEN COALESCE(
                                TRY_CONVERT(
                                    int,
                                    NULLIF(LTRIM(RTRIM(patient.YearDateOfDeath)), '')),
                                YEAR(
                                    TRY_CONVERT(
                                        date,
                                        NULLIF(LTRIM(RTRIM(patient.DateOfDeath)), '')))) = 2025
                                THEN CONVERT(bigint, 1)
                            ELSE CONVERT(bigint, 0)
                        END) AS MortalityCancerCases
                FROM dbo.TumourTable tumour
                INNER JOIN dbo.PatientTable patient
                    ON patient.REGNO = tumour.PATIENTIDTUMOURTABLE
                WHERE LOWER(LTRIM(RTRIM(tumour.RECS))) = 'true'
                GROUP BY LTRIM(RTRIM(CONVERT(nvarchar(100), patient.District)))
            )
            SELECT
                LTRIM(RTRIM(district.DistrictName)) AS District,
                CONVERT(bigint, 0) AS Population,
                COALESCE(registry.CancerCases, 0) AS CancerCases,
                COALESCE(registry.IncidentCancerCases, 0) AS IncidentCancerCases,
                COALESCE(registry.MortalityCancerCases, 0) AS MortalityCancerCases
            FROM dbo.DistrictList district
            LEFT JOIN RegistryCounts registry
                ON registry.DistrictId =
                   LTRIM(RTRIM(CONVERT(nvarchar(100), district.DistrictId)))
            WHERE NULLIF(LTRIM(RTRIM(district.DistrictName)), '') IS NOT NULL
            ORDER BY district.DistrictName;
            """;

        var values = await QueryAsync(connection, sql, reader => new DistrictStatisticsDto(
            ReadString(reader, "District"),
            ReadInt64(reader, "Population"),
            ReadInt64(reader, "CancerCases"),
            ReadInt64(reader, "IncidentCancerCases"),
            ReadInt64(reader, "MortalityCancerCases")), cancellationToken);

        return values.Where(value => !string.IsNullOrWhiteSpace(value.District)).ToList();
    }

    public async Task<IReadOnlyList<FacilityDto>> GetFacilitiesAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        var tables = await LoadSchemaAsync(connection, cancellationToken);
        var table = FindBestTable(tables, FacilityNameColumns, "hospital", "facility", "institution", "source", "patient");
        var districtLookup = await LoadDistrictLookupAsync(connection, tables, cancellationToken);

        if (table is null)
        {
            return [];
        }

        var facilityColumn = FindColumn(table, FacilityNameColumns);
        var districtColumn = FindColumn(table, DistrictNameColumns) ?? FindColumn(table, DistrictIdColumns);
        var typeColumn = FindColumn(table, FacilityTypeColumns);
        var caseColumn = FindColumn(table, CancerCaseColumns);

        if (facilityColumn is null)
        {
            return [];
        }

        if (caseColumn is null)
        {
            var groupSql = $"""
                SELECT TOP (500)
                    {ColumnOrDefault(districtColumn, "District", "N''")} AS District,
                    {QuoteColumn(facilityColumn)} AS Hospital,
                    {ColumnOrDefault(typeColumn, "Type", "N''")} AS Type,
                    COUNT_BIG(*) AS Cases
                FROM {QuoteTable(table)}
                WHERE {QuoteColumn(facilityColumn)} IS NOT NULL
                GROUP BY {GroupByColumns(districtColumn, facilityColumn, typeColumn)}
                ORDER BY {QuoteColumn(facilityColumn)};
                """;

            var groupedValues = await QueryAsync(connection, groupSql, reader => new FacilityDto(
                ResolveDistrictName(ReadString(reader, "District"), districtLookup),
                ReadString(reader, "Hospital"),
                ReadString(reader, "Type"),
                ReadInt64(reader, "Cases")), cancellationToken);

            return groupedValues.Where(value => !string.IsNullOrWhiteSpace(value.Hospital)).ToList();
        }

        var sql = $"""
            SELECT TOP (500)
                {ColumnOrDefault(districtColumn, "District", "N''")} AS District,
                {QuoteColumn(facilityColumn)} AS Hospital,
                {ColumnOrDefault(typeColumn, "Type", "N''")} AS Type,
                {QuoteColumn(caseColumn)} AS Cases
            FROM {QuoteTable(table)}
            WHERE {QuoteColumn(facilityColumn)} IS NOT NULL
            ORDER BY {QuoteColumn(facilityColumn)};
            """;

        var values = await QueryAsync(connection, sql, reader => new FacilityDto(
            ResolveDistrictName(ReadString(reader, "District"), districtLookup),
            ReadString(reader, "Hospital"),
            ReadString(reader, "Type"),
            ReadInt64(reader, "Cases")), cancellationToken);

        return values.Where(value => !string.IsNullOrWhiteSpace(value.Hospital)).ToList();
    }

    public async Task<IReadOnlyList<CancerSiteIncidenceDto>> GetCancerSiteIncidenceAsync(
        int year,
        int? sex,
        string? district,
        CancellationToken cancellationToken = default)
    {
        const string sql = """
            WITH NormalizedTumours AS
            (
                SELECT
                    LTRIM(RTRIM(tumour.REGNO)) AS RegNo,
                    UPPER(
                        LEFT(
                            REPLACE(
                                REPLACE(LTRIM(RTRIM(tumour.ICD10)), '.', ''),
                                ' ',
                                ''),
                            3))
                        AS Icd10
                FROM dbo.TumourTable tumour
                INNER JOIN dbo.PatientTable patient
                    ON LTRIM(RTRIM(patient.REGNO)) =
                       LTRIM(RTRIM(tumour.REGNO))
                INNER JOIN dbo.DistrictList district
                    ON LTRIM(RTRIM(CONVERT(nvarchar(100), district.DistrictId))) =
                       LTRIM(RTRIM(CONVERT(nvarchar(100), patient.District)))
                WHERE TRY_CONVERT(int, LTRIM(RTRIM(tumour.YearDateOfDiagnosis))) = @Year
                  AND LOWER(LTRIM(RTRIM(tumour.RECS))) = 'true'
                  AND NULLIF(LTRIM(RTRIM(tumour.REGNO)), '') IS NOT NULL
                  AND (@Sex IS NULL OR patient.Sex = @Sex)
                  AND (@District IS NULL OR LTRIM(RTRIM(district.DistrictName)) = @District)
            ),
            IcdLookup AS
            (
                SELECT
                    UPPER(LTRIM(RTRIM(Code))) AS Icd10,
                    MAX(NULLIF(LTRIM(RTRIM(Value)), '')) AS CancerSite
                FROM dbo.ICD10Group
                GROUP BY UPPER(LTRIM(RTRIM(Code)))
            )
            SELECT TOP (5)
                tumour.Icd10,
                lookup.CancerSite,
                COUNT_BIG(DISTINCT tumour.RegNo) AS CaseCount
            FROM NormalizedTumours tumour
            INNER JOIN IcdLookup lookup
                ON lookup.Icd10 = tumour.Icd10
            WHERE tumour.Icd10 LIKE 'C[0-9][0-9]'
            GROUP BY tumour.Icd10, lookup.CancerSite
            ORDER BY CaseCount DESC, tumour.Icd10;
            """;

        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.Parameters.Add("@Year", SqlDbType.Int).Value = year;
        command.Parameters.Add("@Sex", SqlDbType.Int).Value =
            sex.HasValue ? sex.Value : DBNull.Value;
        command.Parameters.Add("@District", SqlDbType.NVarChar, 100).Value =
            district is null ? DBNull.Value : district;

        var values = new List<CancerSiteIncidenceDto>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        while (await reader.ReadAsync(cancellationToken))
        {
            values.Add(new CancerSiteIncidenceDto(
                ReadString(reader, "Icd10"),
                ReadString(reader, "CancerSite"),
                ReadInt64(reader, "CaseCount")));
        }

        return values;
    }

    public async Task<IReadOnlyList<CancerSiteMortalityDto>> GetCancerSiteMortalityAsync(
        int year,
        int? sex,
        string? district,
        CancellationToken cancellationToken = default)
    {
        const string sql = """
            WITH NormalizedTumours AS
            (
                SELECT
                    LTRIM(RTRIM(tumour.REGNO)) AS RegNo,
                    UPPER(
                        LEFT(
                            REPLACE(
                                REPLACE(LTRIM(RTRIM(tumour.ICD10)), '.', ''),
                                ' ',
                                ''),
                            3))
                        AS Icd10
                FROM dbo.TumourTable tumour
                INNER JOIN dbo.PatientTable patient
                    ON LTRIM(RTRIM(patient.REGNO)) =
                       LTRIM(RTRIM(tumour.REGNO))
                INNER JOIN dbo.DistrictList district
                    ON LTRIM(RTRIM(CONVERT(nvarchar(100), district.DistrictId))) =
                       LTRIM(RTRIM(CONVERT(nvarchar(100), patient.District)))
                WHERE YEAR(
                    TRY_CONVERT(
                        date,
                        NULLIF(LTRIM(RTRIM(patient.DateOfDeath)), ''))) = @Year
                  AND LOWER(LTRIM(RTRIM(tumour.RECS))) = 'true'
                  AND NULLIF(LTRIM(RTRIM(tumour.REGNO)), '') IS NOT NULL
                  AND (@Sex IS NULL OR patient.Sex = @Sex)
                  AND (@District IS NULL OR LTRIM(RTRIM(district.DistrictName)) = @District)
            ),
            IcdLookup AS
            (
                SELECT
                    UPPER(LTRIM(RTRIM(Code))) AS Icd10,
                    MAX(NULLIF(LTRIM(RTRIM(Value)), '')) AS CancerSite
                FROM dbo.ICD10Group
                GROUP BY UPPER(LTRIM(RTRIM(Code)))
            )
            SELECT TOP (5)
                tumour.Icd10,
                lookup.CancerSite,
                COUNT_BIG(DISTINCT tumour.RegNo) AS DeathCount
            FROM NormalizedTumours tumour
            INNER JOIN IcdLookup lookup
                ON lookup.Icd10 = tumour.Icd10
            WHERE tumour.Icd10 LIKE 'C[0-9][0-9]'
            GROUP BY tumour.Icd10, lookup.CancerSite
            ORDER BY DeathCount DESC, tumour.Icd10;
            """;

        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.Parameters.Add("@Year", SqlDbType.Int).Value = year;
        command.Parameters.Add("@Sex", SqlDbType.Int).Value =
            sex.HasValue ? sex.Value : DBNull.Value;
        command.Parameters.Add("@District", SqlDbType.NVarChar, 100).Value =
            district is null ? DBNull.Value : district;

        var values = new List<CancerSiteMortalityDto>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        while (await reader.ReadAsync(cancellationToken))
        {
            values.Add(new CancerSiteMortalityDto(
                ReadString(reader, "Icd10"),
                ReadString(reader, "CancerSite"),
                ReadInt64(reader, "DeathCount")));
        }

        return values;
    }

    private static async Task<IReadOnlyList<TableSchema>> LoadSchemaAsync(
        SqlConnection connection,
        CancellationToken cancellationToken)
    {
        const string sql = """
            SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA NOT IN ('sys', 'INFORMATION_SCHEMA')
            ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION;
            """;

        var schemas = new Dictionary<string, TableSchema>(StringComparer.OrdinalIgnoreCase);

        await using var command = connection.CreateCommand();
        command.CommandText = sql;

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        while (await reader.ReadAsync(cancellationToken))
        {
            var schemaName = ReadString(reader, "TABLE_SCHEMA");
            var tableName = ReadString(reader, "TABLE_NAME");
            var key = $"{schemaName}.{tableName}";

            if (!schemas.TryGetValue(key, out var table))
            {
                table = new TableSchema(schemaName, tableName, []);
                schemas.Add(key, table);
            }

            table.Columns.Add(new ColumnSchema(
                ReadString(reader, "COLUMN_NAME"),
                ReadString(reader, "DATA_TYPE")));
        }

        return schemas.Values.ToList();
    }

    private static TableSchema? FindBestTable(
        IEnumerable<TableSchema> tables,
        IReadOnlySet<string> requiredColumnNames,
        params string[] tableNameHints)
    {
        return tables
            .Select(table => new
            {
                Table = table,
                Score =
                    (FindColumn(table, requiredColumnNames) is not null ? 1000 : 0) +
                    table.Columns.Count(column => AllKnownColumns.Contains(Normalize(column.Name))) * 10 +
                    tableNameHints.Count(hint => Normalize(table.Name).Contains(Normalize(hint))) * 25
            })
            .Where(item => item.Score >= 1000)
            .OrderByDescending(item => item.Score)
            .ThenBy(item => item.Table.Schema)
            .ThenBy(item => item.Table.Name)
            .Select(item => item.Table)
            .FirstOrDefault();
    }

    private static async Task<IReadOnlyDictionary<string, string>> LoadDistrictLookupAsync(
        SqlConnection connection,
        IReadOnlyList<TableSchema> tables,
        CancellationToken cancellationToken)
    {
        var districtTable = tables
            .Select(table => new
            {
                Table = table,
                IdColumn = FindColumn(table, DistrictIdColumns)
                    ?? (Normalize(table.Name).Contains("district") ? FindColumn(table, GenericIdColumns) : null),
                NameColumn = FindColumn(table, DistrictNameColumns)
                    ?? (Normalize(table.Name).Contains("district") ? FindColumn(table, GenericNameColumns) : null),
                Score = Normalize(table.Name).Contains("district") ? 100 : 0
            })
            .Where(item => item.IdColumn is not null && item.NameColumn is not null)
            .OrderByDescending(item => item.Score)
            .ThenBy(item => item.Table.Schema)
            .ThenBy(item => item.Table.Name)
            .FirstOrDefault();

        if (districtTable is null)
        {
            return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }

        var sql = $"""
            SELECT DISTINCT TOP (500)
                {QuoteColumn(districtTable.IdColumn!)} AS DistrictId,
                {QuoteColumn(districtTable.NameColumn!)} AS DistrictName
            FROM {QuoteTable(districtTable.Table)}
            WHERE {QuoteColumn(districtTable.IdColumn!)} IS NOT NULL
              AND {QuoteColumn(districtTable.NameColumn!)} IS NOT NULL;
            """;

        var lookup = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        await using var command = connection.CreateCommand();
        command.CommandText = sql;

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        while (await reader.ReadAsync(cancellationToken))
        {
            var id = ReadString(reader, "DistrictId");
            var name = ReadString(reader, "DistrictName");

            if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(name))
            {
                continue;
            }

            lookup[id.Trim()] = name.Trim();
            lookup[name.Trim()] = name.Trim();
        }

        return lookup;
    }

    private static ColumnSchema? FindColumn(TableSchema table, IReadOnlySet<string> possibleNames)
    {
        return table.Columns.FirstOrDefault(column => possibleNames.Contains(Normalize(column.Name)));
    }

    private static async Task<IReadOnlyList<DistrictStatusDto>> QueryGroupedDistrictStatusAsync(
        SqlConnection connection,
        TableSchema table,
        ColumnSchema districtColumn,
        IReadOnlyDictionary<string, string> districtLookup,
        CancellationToken cancellationToken)
    {
        var sql = $"""
            SELECT TOP (500)
                {QuoteColumn(districtColumn)} AS District,
                CAST(0 AS bigint) AS Target,
                COUNT_BIG(*) AS Submitted,
                CAST(0 AS bigint) AS Pending,
                CAST(0 AS decimal(18, 2)) AS Completion
            FROM {QuoteTable(table)}
            WHERE {QuoteColumn(districtColumn)} IS NOT NULL
            GROUP BY {QuoteColumn(districtColumn)}
            ORDER BY {QuoteColumn(districtColumn)};
            """;

        var values = await QueryAsync(connection, sql, reader => new DistrictStatusDto(
            ResolveDistrictName(ReadString(reader, "District"), districtLookup),
            ReadInt64(reader, "Target"),
            ReadInt64(reader, "Submitted"),
            ReadInt64(reader, "Pending"),
            ReadDecimal(reader, "Completion")), cancellationToken);

        return values.Where(value => !string.IsNullOrWhiteSpace(value.District)).ToList();
    }

    private static async Task<IReadOnlyList<DistrictStatisticsDto>> QueryGroupedDistrictStatisticsAsync(
        SqlConnection connection,
        TableSchema table,
        ColumnSchema districtColumn,
        IReadOnlyDictionary<string, string> districtLookup,
        CancellationToken cancellationToken)
    {
        var sql = $"""
            SELECT TOP (500)
                {QuoteColumn(districtColumn)} AS District,
                CAST(0 AS bigint) AS Population,
                COUNT_BIG(*) AS CancerCases,
                COUNT_BIG(*) AS IncidentCancerCases,
                CAST(0 AS bigint) AS MortalityCancerCases
            FROM {QuoteTable(table)}
            WHERE {QuoteColumn(districtColumn)} IS NOT NULL
            GROUP BY {QuoteColumn(districtColumn)}
            ORDER BY {QuoteColumn(districtColumn)};
            """;

        var values = await QueryAsync(connection, sql, reader => new DistrictStatisticsDto(
            ResolveDistrictName(ReadString(reader, "District"), districtLookup),
            ReadInt64(reader, "Population"),
            ReadInt64(reader, "CancerCases"),
            ReadInt64(reader, "IncidentCancerCases"),
            ReadInt64(reader, "MortalityCancerCases")), cancellationToken);

        return values.Where(value => !string.IsNullOrWhiteSpace(value.District)).ToList();
    }

    private static async Task<IReadOnlyList<T>> QueryAsync<T>(
        SqlConnection connection,
        string sql,
        Func<IDataRecord, T> map,
        CancellationToken cancellationToken)
    {
        var values = new List<T>();

        await using var command = connection.CreateCommand();
        command.CommandText = sql;

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        while (await reader.ReadAsync(cancellationToken))
        {
            values.Add(map(reader));
        }

        return values;
    }

    private static string ColumnOrDefault(ColumnSchema? column, string alias, string defaultValue)
    {
        return column is null ? defaultValue : QuoteColumn(column);
    }

    private static string GroupByColumns(params ColumnSchema?[] columns)
    {
        var selectedColumns = columns
            .Where(column => column is not null)
            .Select(column => QuoteColumn(column!))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return selectedColumns.Length == 0 ? "()" : string.Join(", ", selectedColumns);
    }

    private static string QuoteTable(TableSchema table)
    {
        return $"{QuoteName(table.Schema)}.{QuoteName(table.Name)}";
    }

    private static string QuoteColumn(ColumnSchema column)
    {
        return QuoteName(column.Name);
    }

    private static string QuoteName(string value)
    {
        return $"[{value.Replace("]", "]]")}]";
    }

    private static string ReadString(IDataRecord reader, string name)
    {
        var value = reader[name];
        return value == DBNull.Value ? string.Empty : Convert.ToString(value) ?? string.Empty;
    }

    private static string ResolveDistrictName(string district, IReadOnlyDictionary<string, string> districtLookup)
    {
        return districtLookup.TryGetValue(district.Trim(), out var name) ? name : district;
    }

    private static long ReadInt64(IDataRecord reader, string name)
    {
        var value = reader[name];

        if (value == DBNull.Value)
        {
            return 0;
        }

        if (value is string text)
        {
            return long.TryParse(text.Replace(",", string.Empty), out var number) ? number : 0;
        }

        return Convert.ToInt64(value);
    }

    private static decimal ReadDecimal(IDataRecord reader, string name)
    {
        var value = reader[name];

        if (value == DBNull.Value)
        {
            return 0;
        }

        if (value is string text)
        {
            return decimal.TryParse(text.Replace(",", string.Empty), out var number) ? number : 0;
        }

        return Convert.ToDecimal(value);
    }

    private static string Normalize(string value)
    {
        return new string(value.Where(char.IsLetterOrDigit).Select(char.ToLowerInvariant).ToArray());
    }

    private static readonly IReadOnlySet<string> DistrictNameColumns = Set(
        "district", "districtname", "district_name", "distname", "dist_name", "dist");

    private static readonly IReadOnlySet<string> DistrictIdColumns = Set(
        "districtid", "district_id", "distid", "dist_id", "distcode", "districtcode", "district_code");

    private static readonly IReadOnlySet<string> DistrictColumns = DistrictNameColumns
        .Concat(DistrictIdColumns)
        .ToHashSet(StringComparer.OrdinalIgnoreCase);

    private static readonly IReadOnlySet<string> GenericIdColumns = Set(
        "id", "code", "masterid", "master_id");

    private static readonly IReadOnlySet<string> GenericNameColumns = Set(
        "name", "title", "description");

    private static readonly IReadOnlySet<string> TargetColumns = Set(
        "target", "targetpopulation", "target_population", "populationtarget", "population_target");

    private static readonly IReadOnlySet<string> SubmittedColumns = Set(
        "submitted", "formssubmitted", "forms_submitted", "submittedforms", "submitted_forms", "totalforms", "total_forms", "entries", "records");

    private static readonly IReadOnlySet<string> PendingColumns = Set(
        "pending", "pendingreview", "pendingreviews", "pending_review", "pending_reviews");

    private static readonly IReadOnlySet<string> CompletionColumns = Set(
        "completion", "completionpercent", "completionpercentage", "completion_percent", "completion_percentage");

    private static readonly IReadOnlySet<string> PopulationColumns = Set(
        "population", "population2025", "population_2025", "targetpopulation", "target_population");

    private static readonly IReadOnlySet<string> CancerCaseColumns = Set(
        "cases", "casecount", "case_count", "cancercases", "cancer_cases", "totalcases", "total_cases", "patientcount", "patient_count");

    private static readonly IReadOnlySet<string> IncidentCaseColumns = Set(
        "incidentcases", "incident_cases", "incidentcancercases", "incident_cancer_cases", "incidence", "incidencecases");

    private static readonly IReadOnlySet<string> MortalityCaseColumns = Set(
        "mortalitycases", "mortality_cases", "mortalitycancercases", "mortality_cancer_cases", "deaths", "deathcount");

    private static readonly IReadOnlySet<string> FacilityNameColumns = Set(
        "hospital", "hospitalname", "hospital_name", "facility", "facilityname", "facility_name", "institution", "institutionname", "institution_name", "datasource", "data_source");

    private static readonly IReadOnlySet<string> FacilityTypeColumns = Set(
        "type", "facilitytype", "facility_type", "hospitaltype", "hospital_type", "category");

    private static readonly IReadOnlySet<string> AllKnownColumns = DistrictColumns
        .Concat(TargetColumns)
        .Concat(SubmittedColumns)
        .Concat(PendingColumns)
        .Concat(CompletionColumns)
        .Concat(PopulationColumns)
        .Concat(CancerCaseColumns)
        .Concat(IncidentCaseColumns)
        .Concat(MortalityCaseColumns)
        .Concat(FacilityNameColumns)
        .Concat(FacilityTypeColumns)
        .ToHashSet(StringComparer.OrdinalIgnoreCase);

    private static IReadOnlySet<string> Set(params string[] names)
    {
        return names.Select(Normalize).ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    private sealed record TableSchema(string Schema, string Name, List<ColumnSchema> Columns);

    private sealed record ColumnSchema(string Name, string DataType);
}
