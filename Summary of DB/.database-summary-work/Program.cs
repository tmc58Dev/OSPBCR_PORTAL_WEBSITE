using System.Data;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;

static async Task<List<Dictionary<string, object?>>> QueryAsync(
    SqlConnection connection,
    string sql,
    int timeoutSeconds = 120)
{
    await using var command = connection.CreateCommand();
    command.CommandText = sql;
    command.CommandTimeout = timeoutSeconds;
    await using var reader = await command.ExecuteReaderAsync();
    var rows = new List<Dictionary<string, object?>>();
    while (await reader.ReadAsync())
    {
        var row = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < reader.FieldCount; i++)
        {
            var value = reader.IsDBNull(i) ? null : reader.GetValue(i);
            row[reader.GetName(i)] = value switch
            {
                DateTime date => date.ToString("yyyy-MM-ddTHH:mm:ss"),
                DateTimeOffset dto => dto.ToString("O"),
                byte[] bytes => $"[binary {bytes.Length} bytes]",
                _ => value
            };
        }
        rows.Add(row);
    }
    return rows;
}

static string QuoteName(string value) => $"[{value.Replace("]", "]]")}]";

static bool IsTextType(string typeName) =>
    typeName is "varchar" or "nvarchar" or "char" or "nchar" or "text" or "ntext";

static bool IsNumericType(string typeName) =>
    typeName is "tinyint" or "smallint" or "int" or "bigint" or "decimal" or "numeric"
        or "money" or "smallmoney" or "float" or "real";

static bool IsDateType(string typeName) =>
    typeName is "date" or "datetime" or "datetime2" or "smalldatetime" or "datetimeoffset" or "time";

static bool IsSensitiveColumn(string tableName, string columnName)
{
    var normalized = Regex.Replace(columnName, "[^a-z0-9]", "", RegexOptions.IgnoreCase).ToLowerInvariant();
    string[] sensitiveTerms =
    [
        "patientname", "firstname", "middlename", "lastname", "father", "mother", "spouse",
        "address", "village", "street", "landmark", "phone", "mobile", "email", "aadhaar",
        "aadhar", "pan", "passport", "voter", "ration", "uhid", "mrn", "regno", "patientid",
        "contact", "pin", "postal", "dob", "dateofbirth", "deathdate", "dateofdeath",
        "nationalid", "password", "securitystamp", "concurrencystamp", "filepath",
        "reviewedby", "deoname", "lastmodifiedby", "updatedby", "record1", "record2",
        "remarks", "notes", "reviewhistory", "casefile", "recordid", "filenumber",
        "tumourid", "sourceid", "registrationnumber"
    ];
    var sensitiveTable = tableName.Contains("Patient", StringComparison.OrdinalIgnoreCase)
        || tableName.Contains("Duplicate", StringComparison.OrdinalIgnoreCase)
        || tableName.Equals("AspNetUsers", StringComparison.OrdinalIgnoreCase);
    return sensitiveTerms.Any(normalized.Contains)
        || (sensitiveTable && normalized is "id" or "name" or "personname" or "username" or "normalizedusername");
}

var workspace = Directory.GetParent(AppContext.BaseDirectory)!.Parent!.Parent!.Parent!.Parent!.FullName;
var settingsPath = Path.Combine(workspace, "appsettings.json");
using var settingsDoc = JsonDocument.Parse(await File.ReadAllTextAsync(settingsPath));
var connectionString = settingsDoc.RootElement
    .GetProperty("ConnectionStrings")
    .GetProperty("DefaultConnection")
    .GetString() ?? throw new InvalidOperationException("DefaultConnection is missing.");

var builder = new SqlConnectionStringBuilder(connectionString)
{
    Encrypt = SqlConnectionEncryptOption.Optional,
    TrustServerCertificate = true
};

await using var connection = new SqlConnection(builder.ConnectionString);
await connection.OpenAsync();

var result = new Dictionary<string, object?>();
result["generated_at"] = DateTimeOffset.Now.ToString("O");
result["database"] = (await QueryAsync(connection, """
    SELECT
        DB_NAME() AS database_name,
        @@SERVERNAME AS server_name,
        d.create_date,
        d.compatibility_level,
        d.collation_name,
        d.recovery_model_desc,
        d.user_access_desc,
        d.state_desc,
        d.is_read_only,
        CAST(SUM(mf.size) * 8.0 / 1024 AS decimal(18,2)) AS allocated_size_mb
    FROM sys.databases d
    JOIN sys.master_files mf ON mf.database_id = d.database_id
    WHERE d.database_id = DB_ID()
    GROUP BY d.create_date, d.compatibility_level, d.collation_name,
             d.recovery_model_desc, d.user_access_desc, d.state_desc, d.is_read_only;
    """)).Single();

result["tables"] = await QueryAsync(connection, """
    SELECT
        s.name AS schema_name,
        t.name AS table_name,
        t.create_date,
        t.modify_date,
        CAST(COALESCE(pr.row_count, 0) AS bigint) AS row_count,
        COALESCE(cols.column_count, 0) AS column_count,
        CAST(ep.value AS nvarchar(4000)) AS description
    FROM sys.tables t
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    OUTER APPLY (
        SELECT SUM(p.rows) AS row_count
        FROM sys.partitions p
        WHERE p.object_id = t.object_id AND p.index_id IN (0,1)
    ) pr
    OUTER APPLY (
        SELECT COUNT(*) AS column_count
        FROM sys.columns c
        WHERE c.object_id = t.object_id
    ) cols
    LEFT JOIN sys.extended_properties ep
      ON ep.major_id = t.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
    WHERE t.is_ms_shipped = 0
    ORDER BY s.name, t.name;
    """);

result["columns"] = await QueryAsync(connection, """
    SELECT
        s.name AS schema_name,
        t.name AS table_name,
        c.column_id AS ordinal_position,
        c.name AS column_name,
        ty.name AS data_type,
        CASE
            WHEN c.max_length = -1 THEN -1
            WHEN ty.name IN ('nvarchar','nchar') THEN c.max_length / 2
            ELSE c.max_length
        END AS max_length,
        c.precision,
        c.scale,
        c.is_nullable,
        c.is_identity,
        ic.seed_value,
        ic.increment_value,
        c.is_computed,
        cc.definition AS computed_definition,
        dc.definition AS default_definition,
        c.collation_name,
        CAST(ep.value AS nvarchar(4000)) AS description,
        CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS is_primary_key,
        pk.key_ordinal AS primary_key_ordinal,
        CASE WHEN uq.column_id IS NOT NULL THEN 1 ELSE 0 END AS is_unique_key,
        CASE WHEN fk.parent_column_id IS NOT NULL THEN 1 ELSE 0 END AS is_foreign_key,
        OBJECT_SCHEMA_NAME(fk.referenced_object_id) AS referenced_schema,
        OBJECT_NAME(fk.referenced_object_id) AS referenced_table,
        COL_NAME(fk.referenced_object_id, fk.referenced_column_id) AS referenced_column
    FROM sys.tables t
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    JOIN sys.columns c ON c.object_id = t.object_id
    JOIN sys.types ty ON ty.user_type_id = c.user_type_id
    LEFT JOIN sys.identity_columns ic ON ic.object_id = c.object_id AND ic.column_id = c.column_id
    LEFT JOIN sys.computed_columns cc ON cc.object_id = c.object_id AND cc.column_id = c.column_id
    LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
    LEFT JOIN sys.extended_properties ep
      ON ep.major_id = t.object_id AND ep.minor_id = c.column_id AND ep.name = 'MS_Description'
    LEFT JOIN (
        SELECT ic.object_id, ic.column_id, ic.key_ordinal
        FROM sys.indexes i
        JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
        WHERE i.is_primary_key = 1
    ) pk ON pk.object_id = c.object_id AND pk.column_id = c.column_id
    LEFT JOIN (
        SELECT DISTINCT ic.object_id, ic.column_id
        FROM sys.indexes i
        JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
        WHERE i.is_unique = 1 AND i.is_primary_key = 0
    ) uq ON uq.object_id = c.object_id AND uq.column_id = c.column_id
    LEFT JOIN sys.foreign_key_columns fk
      ON fk.parent_object_id = c.object_id AND fk.parent_column_id = c.column_id
    WHERE t.is_ms_shipped = 0
    ORDER BY s.name, t.name, c.column_id;
    """);

result["foreign_keys"] = await QueryAsync(connection, """
    SELECT
        fk.name AS foreign_key_name,
        OBJECT_SCHEMA_NAME(fk.parent_object_id) AS child_schema,
        OBJECT_NAME(fk.parent_object_id) AS child_table,
        pc.name AS child_column,
        fkc.constraint_column_id AS column_ordinal,
        OBJECT_SCHEMA_NAME(fk.referenced_object_id) AS parent_schema,
        OBJECT_NAME(fk.referenced_object_id) AS parent_table,
        rc.name AS parent_column,
        fk.delete_referential_action_desc AS on_delete,
        fk.update_referential_action_desc AS on_update,
        fk.is_disabled,
        fk.is_not_trusted
    FROM sys.foreign_keys fk
    JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
    JOIN sys.columns pc ON pc.object_id = fkc.parent_object_id AND pc.column_id = fkc.parent_column_id
    JOIN sys.columns rc ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
    WHERE fk.is_ms_shipped = 0
    ORDER BY child_schema, child_table, fk.name, fkc.constraint_column_id;
    """);

result["indexes"] = await QueryAsync(connection, """
    SELECT
        s.name AS schema_name,
        t.name AS table_name,
        i.name AS index_name,
        i.type_desc,
        i.is_primary_key,
        i.is_unique,
        i.is_unique_constraint,
        i.is_disabled,
        i.has_filter,
        i.filter_definition,
        STRING_AGG(
            QUOTENAME(c.name) +
            CASE WHEN ic.is_descending_key = 1 THEN ' DESC' ELSE ' ASC' END +
            CASE WHEN ic.is_included_column = 1 THEN ' INCLUDE' ELSE '' END,
            ', '
        ) WITHIN GROUP (ORDER BY ic.key_ordinal, ic.index_column_id) AS columns
    FROM sys.tables t
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    JOIN sys.indexes i ON i.object_id = t.object_id
    LEFT JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    LEFT JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE t.is_ms_shipped = 0 AND i.index_id > 0
    GROUP BY s.name, t.name, i.name, i.type_desc, i.is_primary_key, i.is_unique,
             i.is_unique_constraint, i.is_disabled, i.has_filter, i.filter_definition
    ORDER BY s.name, t.name, i.is_primary_key DESC, i.is_unique DESC, i.name;
    """);

result["checks"] = await QueryAsync(connection, """
    SELECT
        OBJECT_SCHEMA_NAME(cc.parent_object_id) AS schema_name,
        OBJECT_NAME(cc.parent_object_id) AS table_name,
        cc.name AS constraint_name,
        COL_NAME(cc.parent_object_id, cc.parent_column_id) AS column_name,
        cc.definition,
        cc.is_disabled,
        cc.is_not_trusted
    FROM sys.check_constraints cc
    WHERE cc.is_ms_shipped = 0
    ORDER BY schema_name, table_name, cc.name;
    """);

result["objects"] = await QueryAsync(connection, """
    SELECT
        s.name AS schema_name,
        o.name AS object_name,
        o.type_desc,
        o.create_date,
        o.modify_date,
        OBJECT_SCHEMA_NAME(tr.parent_id) AS parent_schema,
        OBJECT_NAME(tr.parent_id) AS parent_object,
        m.definition,
        m.is_schema_bound
    FROM sys.objects o
    JOIN sys.schemas s ON s.schema_id = o.schema_id
    LEFT JOIN sys.sql_modules m ON m.object_id = o.object_id
    LEFT JOIN sys.triggers tr ON tr.object_id = o.object_id
    WHERE o.is_ms_shipped = 0
      AND o.type IN ('V','P','FN','IF','TF','FS','FT','TR')
    ORDER BY o.type_desc, s.name, o.name;
    """);

result["object_parameters"] = await QueryAsync(connection, """
    SELECT
        OBJECT_SCHEMA_NAME(p.object_id) AS schema_name,
        OBJECT_NAME(p.object_id) AS object_name,
        p.parameter_id,
        p.name AS parameter_name,
        TYPE_NAME(p.user_type_id) AS data_type,
        p.max_length,
        p.precision,
        p.scale,
        p.is_output
    FROM sys.parameters p
    JOIN sys.objects o ON o.object_id = p.object_id
    WHERE o.is_ms_shipped = 0
      AND o.type IN ('P','FN','IF','TF','FS','FT')
    ORDER BY schema_name, object_name, p.parameter_id;
    """);

result["object_dependencies"] = await QueryAsync(connection, """
    SELECT DISTINCT
        OBJECT_SCHEMA_NAME(d.referencing_id) AS referencing_schema,
        OBJECT_NAME(d.referencing_id) AS referencing_object,
        d.referenced_schema_name,
        d.referenced_entity_name,
        o.type_desc AS referencing_type
    FROM sys.sql_expression_dependencies d
    JOIN sys.objects o ON o.object_id = d.referencing_id
    WHERE o.is_ms_shipped = 0
      AND d.referenced_entity_name IS NOT NULL
    ORDER BY referencing_schema, referencing_object, d.referenced_schema_name, d.referenced_entity_name;
    """);

result["table_constraints"] = await QueryAsync(connection, """
    SELECT
        tc.TABLE_SCHEMA AS schema_name,
        tc.TABLE_NAME AS table_name,
        tc.CONSTRAINT_NAME AS constraint_name,
        tc.CONSTRAINT_TYPE AS constraint_type
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
    WHERE tc.TABLE_SCHEMA NOT IN ('sys','INFORMATION_SCHEMA')
    ORDER BY tc.TABLE_SCHEMA, tc.TABLE_NAME, tc.CONSTRAINT_TYPE, tc.CONSTRAINT_NAME;
    """);

var targetedChecks = new Dictionary<string, object?>();
targetedChecks["business_key_duplicates"] = await QueryAsync(connection, """
    SELECT 'PatientTable.REGNO' AS key_name,
           COUNT_BIG(*) AS duplicate_groups,
           COALESCE(SUM(group_count - 1), 0) AS excess_rows
    FROM (
        SELECT COUNT_BIG(*) AS group_count
        FROM dbo.PatientTable
        WHERE NULLIF(LTRIM(RTRIM(REGNO)), '') IS NOT NULL
        GROUP BY LTRIM(RTRIM(REGNO))
        HAVING COUNT_BIG(*) > 1
    ) d
    UNION ALL
    SELECT 'TumourTable.TUMOURID',
           COUNT_BIG(*),
           COALESCE(SUM(group_count - 1), 0)
    FROM (
        SELECT COUNT_BIG(*) AS group_count
        FROM dbo.TumourTable
        WHERE NULLIF(LTRIM(RTRIM(TUMOURID)), '') IS NOT NULL
        GROUP BY LTRIM(RTRIM(TUMOURID))
        HAVING COUNT_BIG(*) > 1
    ) d
    UNION ALL
    SELECT 'SourceTable.SOURCEID',
           COUNT_BIG(*),
           COALESCE(SUM(group_count - 1), 0)
    FROM (
        SELECT COUNT_BIG(*) AS group_count
        FROM dbo.SourceTable
        WHERE NULLIF(LTRIM(RTRIM(SOURCEID)), '') IS NOT NULL
        GROUP BY LTRIM(RTRIM(SOURCEID))
        HAVING COUNT_BIG(*) > 1
    ) d
    UNION ALL
    SELECT 'VillageList.VillageId',
           COUNT_BIG(*),
           COALESCE(SUM(group_count - 1), 0)
    FROM (
        SELECT COUNT_BIG(*) AS group_count
        FROM dbo.VillageList
        WHERE NULLIF(LTRIM(RTRIM(VillageId)), '') IS NOT NULL
        GROUP BY LTRIM(RTRIM(VillageId))
        HAVING COUNT_BIG(*) > 1
    ) d;
    """, 300);

targetedChecks["logical_link_coverage"] = await QueryAsync(connection, """
    WITH PatientKeys AS
    (
        SELECT DISTINCT LTRIM(RTRIM(REGNO)) AS key_value
        FROM dbo.PatientTable
        WHERE NULLIF(LTRIM(RTRIM(REGNO)), '') IS NOT NULL
    ),
    TumourKeys AS
    (
        SELECT DISTINCT LTRIM(RTRIM(TUMOURID)) AS key_value
        FROM dbo.TumourTable
        WHERE NULLIF(LTRIM(RTRIM(TUMOURID)), '') IS NOT NULL
    )
    SELECT
        'TumourTable.PATIENTIDTUMOURTABLE -> PatientTable.REGNO' AS relationship,
        COUNT_BIG(*) AS child_rows,
        SUM(CASE WHEN NULLIF(LTRIM(RTRIM(t.PATIENTIDTUMOURTABLE)), '') IS NULL THEN 1 ELSE 0 END) AS missing_child_key,
        SUM(CASE WHEN p.key_value IS NOT NULL THEN 1 ELSE 0 END) AS matched_rows,
        SUM(CASE WHEN NULLIF(LTRIM(RTRIM(t.PATIENTIDTUMOURTABLE)), '') IS NOT NULL
                  AND p.key_value IS NULL THEN 1 ELSE 0 END) AS orphan_rows
    FROM dbo.TumourTable t
    LEFT JOIN PatientKeys p ON p.key_value = LTRIM(RTRIM(t.PATIENTIDTUMOURTABLE))
    UNION ALL
    SELECT
        'TumourTable.REGNO -> PatientTable.REGNO',
        COUNT_BIG(*),
        SUM(CASE WHEN NULLIF(LTRIM(RTRIM(t.REGNO)), '') IS NULL THEN 1 ELSE 0 END),
        SUM(CASE WHEN p.key_value IS NOT NULL THEN 1 ELSE 0 END),
        SUM(CASE WHEN NULLIF(LTRIM(RTRIM(t.REGNO)), '') IS NOT NULL
                  AND p.key_value IS NULL THEN 1 ELSE 0 END)
    FROM dbo.TumourTable t
    LEFT JOIN PatientKeys p ON p.key_value = LTRIM(RTRIM(t.REGNO))
    UNION ALL
    SELECT
        'SourceTable.TUMOURIDSOURCETABLE -> TumourTable.TUMOURID',
        COUNT_BIG(*),
        SUM(CASE WHEN NULLIF(LTRIM(RTRIM(s.TUMOURIDSOURCETABLE)), '') IS NULL THEN 1 ELSE 0 END),
        SUM(CASE WHEN t.key_value IS NOT NULL THEN 1 ELSE 0 END),
        SUM(CASE WHEN NULLIF(LTRIM(RTRIM(s.TUMOURIDSOURCETABLE)), '') IS NOT NULL
                  AND t.key_value IS NULL THEN 1 ELSE 0 END)
    FROM dbo.SourceTable s
    LEFT JOIN TumourKeys t ON t.key_value = LTRIM(RTRIM(s.TUMOURIDSOURCETABLE))
    UNION ALL
    SELECT
        'SourceTable.REGNO -> PatientTable.REGNO',
        COUNT_BIG(*),
        SUM(CASE WHEN NULLIF(LTRIM(RTRIM(s.REGNO)), '') IS NULL THEN 1 ELSE 0 END),
        SUM(CASE WHEN p.key_value IS NOT NULL THEN 1 ELSE 0 END),
        SUM(CASE WHEN NULLIF(LTRIM(RTRIM(s.REGNO)), '') IS NOT NULL
                  AND p.key_value IS NULL THEN 1 ELSE 0 END)
    FROM dbo.SourceTable s
    LEFT JOIN PatientKeys p ON p.key_value = LTRIM(RTRIM(s.REGNO));
    """, 300);

targetedChecks["relationship_cardinality"] = await QueryAsync(connection, """
    WITH PatientTumours AS
    (
        SELECT p.REGNO, COUNT_BIG(t.Id) AS child_count
        FROM dbo.PatientTable p
        LEFT JOIN dbo.TumourTable t
          ON LTRIM(RTRIM(t.PATIENTIDTUMOURTABLE)) = LTRIM(RTRIM(p.REGNO))
        GROUP BY p.REGNO
    ),
    TumourSources AS
    (
        SELECT t.TUMOURID, COUNT_BIG(s.Id) AS child_count
        FROM dbo.TumourTable t
        LEFT JOIN dbo.SourceTable s
          ON LTRIM(RTRIM(s.TUMOURIDSOURCETABLE)) = LTRIM(RTRIM(t.TUMOURID))
        GROUP BY t.TUMOURID
    ),
    TumourFiles AS
    (
        SELECT t.TUMOURID, COUNT_BIG(f.Id) AS child_count
        FROM dbo.TumourTable t
        LEFT JOIN dbo.PatientFile f
          ON LTRIM(RTRIM(f.TumourId)) = LTRIM(RTRIM(t.TUMOURID))
        GROUP BY t.TUMOURID
    )
    SELECT 'PatientTable -> TumourTable' AS relationship,
           COUNT_BIG(*) AS parent_rows,
           SUM(CASE WHEN child_count = 0 THEN 1 ELSE 0 END) AS parents_without_children,
           SUM(CASE WHEN child_count = 1 THEN 1 ELSE 0 END) AS parents_with_one_child,
           SUM(CASE WHEN child_count > 1 THEN 1 ELSE 0 END) AS parents_with_multiple_children,
           MAX(child_count) AS max_children
    FROM PatientTumours
    UNION ALL
    SELECT 'TumourTable -> SourceTable',
           COUNT_BIG(*),
           SUM(CASE WHEN child_count = 0 THEN 1 ELSE 0 END),
           SUM(CASE WHEN child_count = 1 THEN 1 ELSE 0 END),
           SUM(CASE WHEN child_count > 1 THEN 1 ELSE 0 END),
           MAX(child_count)
    FROM TumourSources
    UNION ALL
    SELECT 'TumourTable -> PatientFile',
           COUNT_BIG(*),
           SUM(CASE WHEN child_count = 0 THEN 1 ELSE 0 END),
           SUM(CASE WHEN child_count = 1 THEN 1 ELSE 0 END),
           SUM(CASE WHEN child_count > 1 THEN 1 ELSE 0 END),
           MAX(child_count)
    FROM TumourFiles;
    """, 300);

targetedChecks["patient_file_link"] = await QueryAsync(connection, """
    WITH TumourKeys AS
    (
        SELECT DISTINCT LTRIM(RTRIM(TUMOURID)) AS key_value
        FROM dbo.TumourTable
        WHERE NULLIF(LTRIM(RTRIM(TUMOURID)), '') IS NOT NULL
    )
    SELECT
        COUNT_BIG(*) AS file_rows,
        SUM(CASE WHEN NULLIF(LTRIM(RTRIM(f.TumourId)), '') IS NULL THEN 1 ELSE 0 END) AS missing_tumour_key,
        SUM(CASE WHEN t.key_value IS NOT NULL THEN 1 ELSE 0 END) AS matched_rows,
        SUM(CASE WHEN NULLIF(LTRIM(RTRIM(f.TumourId)), '') IS NOT NULL
                  AND t.key_value IS NULL THEN 1 ELSE 0 END) AS orphan_rows
    FROM dbo.PatientFile f
    LEFT JOIN TumourKeys t ON t.key_value = LTRIM(RTRIM(f.TumourId));
    """, 300);

targetedChecks["geography_integrity"] = await QueryAsync(connection, """
    SELECT 'DistrictList.StateId -> StateList.StateId' AS relationship,
           COUNT_BIG(*) AS child_rows,
           SUM(CASE WHEN s.Id IS NULL THEN 1 ELSE 0 END) AS orphan_rows
    FROM dbo.DistrictList d
    LEFT JOIN dbo.StateList s ON LTRIM(RTRIM(s.StateId)) = LTRIM(RTRIM(d.StateId))
    UNION ALL
    SELECT 'BlockList.DistrictId -> DistrictList.DistrictId',
           COUNT_BIG(*),
           SUM(CASE WHEN d.Id IS NULL THEN 1 ELSE 0 END)
    FROM dbo.BlockList b
    LEFT JOIN dbo.DistrictList d ON LTRIM(RTRIM(d.DistrictId)) = LTRIM(RTRIM(b.DistrictId))
    UNION ALL
    SELECT 'VillageList.BlockId -> BlockList.BlockId',
           COUNT_BIG(*),
           SUM(CASE WHEN b.Id IS NULL THEN 1 ELSE 0 END)
    FROM dbo.VillageList v
    LEFT JOIN dbo.BlockList b ON LTRIM(RTRIM(b.BlockId)) = LTRIM(RTRIM(v.BlockId))
    UNION ALL
    SELECT 'Centres.VillageId -> VillageList.VillageId',
           COUNT_BIG(*),
           SUM(CASE WHEN NULLIF(LTRIM(RTRIM(c.VillageId)), '') IS NOT NULL AND v.Id IS NULL THEN 1 ELSE 0 END)
    FROM dbo.Centres c
    LEFT JOIN dbo.VillageList v ON LTRIM(RTRIM(v.VillageId)) = LTRIM(RTRIM(c.VillageId));
    """, 300);

targetedChecks["date_quality"] = await QueryAsync(connection, """
    SELECT 'PatientTable.DateOfBirth' AS field_name,
           COUNT_BIG(*) AS populated_rows,
           SUM(CASE WHEN TRY_CONVERT(date, DateOfBirth) IS NULL THEN 1 ELSE 0 END) AS nonconvertible_rows
    FROM dbo.PatientTable
    WHERE NULLIF(LTRIM(RTRIM(DateOfBirth)), '') IS NOT NULL
    UNION ALL
    SELECT 'PatientTable.DateOfDeath',
           COUNT_BIG(*),
           SUM(CASE WHEN TRY_CONVERT(date, DateOfDeath) IS NULL THEN 1 ELSE 0 END)
    FROM dbo.PatientTable
    WHERE NULLIF(LTRIM(RTRIM(DateOfDeath)), '') IS NOT NULL
    UNION ALL
    SELECT 'TumourTable.DateOfDiagnosis',
           COUNT_BIG(*),
           SUM(CASE WHEN TRY_CONVERT(date, DateOfDiagnosis) IS NULL THEN 1 ELSE 0 END)
    FROM dbo.TumourTable
    WHERE NULLIF(LTRIM(RTRIM(DateOfDiagnosis)), '') IS NOT NULL
    UNION ALL
    SELECT 'PatientTable.YearDateOfBirth',
           COUNT_BIG(*),
           SUM(CASE WHEN TRY_CONVERT(int, YearDateOfBirth) IS NULL
                      OR TRY_CONVERT(int, YearDateOfBirth) NOT BETWEEN 1800 AND YEAR(GETDATE()) THEN 1 ELSE 0 END)
    FROM dbo.PatientTable
    WHERE NULLIF(LTRIM(RTRIM(YearDateOfBirth)), '') IS NOT NULL
    UNION ALL
    SELECT 'TumourTable.YearDateOfDiagnosis',
           COUNT_BIG(*),
           SUM(CASE WHEN TRY_CONVERT(int, YearDateOfDiagnosis) IS NULL
                      OR TRY_CONVERT(int, YearDateOfDiagnosis) NOT BETWEEN 1800 AND YEAR(GETDATE()) THEN 1 ELSE 0 END)
    FROM dbo.TumourTable
    WHERE NULLIF(LTRIM(RTRIM(YearDateOfDiagnosis)), '') IS NOT NULL;
    """, 300);

targetedChecks["coded_value_quality"] = await QueryAsync(connection, """
    SELECT
        'TumourTable.ICD10' AS field_name,
        COUNT_BIG(*) AS populated_rows,
        SUM(CASE WHEN UPPER(LEFT(REPLACE(REPLACE(LTRIM(RTRIM(ICD10)),'.',''),' ',''),3))
                       NOT LIKE 'C[0-9][0-9]' THEN 1 ELSE 0 END) AS invalid_format_rows,
        SUM(CASE WHEN lookup.Code IS NULL THEN 1 ELSE 0 END) AS unmapped_rows
    FROM dbo.TumourTable t
    LEFT JOIN dbo.ICD10Group lookup
      ON UPPER(LTRIM(RTRIM(lookup.Code))) =
         UPPER(LEFT(REPLACE(REPLACE(LTRIM(RTRIM(t.ICD10)),'.',''),' ',''),3))
    WHERE NULLIF(LTRIM(RTRIM(t.ICD10)), '') IS NOT NULL;
    """, 300);

targetedChecks["duplicate_workflow"] = await QueryAsync(connection, """
    SELECT
        COUNT_BIG(*) AS total_rows,
        SUM(CASE WHEN NULLIF(LTRIM(RTRIM(Decision)), '') IS NULL THEN 1 ELSE 0 END) AS pending_decision_rows,
        SUM(CASE WHEN NULLIF(LTRIM(RTRIM(ReviewedBy)), '') IS NULL THEN 1 ELSE 0 END) AS unreviewed_rows,
        MIN(DuplicateFoundDate) AS earliest_found,
        MAX(DuplicateFoundDate) AS latest_found
    FROM dbo.PossibleDuplicates;
    """);

result["targeted_checks"] = targetedChecks;

var tables = (List<Dictionary<string, object?>>)result["tables"]!;
var columns = (List<Dictionary<string, object?>>)result["columns"]!;
var profiles = new List<Dictionary<string, object?>>();

foreach (var table in tables)
{
    var schema = Convert.ToString(table["schema_name"])!;
    var name = Convert.ToString(table["table_name"])!;
    var rowCount = Convert.ToInt64(table["row_count"] ?? 0);
    var tableColumns = columns
        .Where(c => string.Equals(Convert.ToString(c["schema_name"]), schema, StringComparison.OrdinalIgnoreCase)
                 && string.Equals(Convert.ToString(c["table_name"]), name, StringComparison.OrdinalIgnoreCase))
        .ToList();

    var tableProfile = new Dictionary<string, object?>
    {
        ["schema_name"] = schema,
        ["table_name"] = name,
        ["catalog_row_count"] = rowCount
    };

    try
    {
        var exact = await QueryAsync(connection,
            $"SELECT COUNT_BIG(*) AS exact_row_count FROM {QuoteName(schema)}.{QuoteName(name)};", 300);
        tableProfile["exact_row_count"] = exact[0]["exact_row_count"];
    }
    catch (Exception ex)
    {
        tableProfile["exact_row_count_error"] = ex.Message;
    }

    var columnProfiles = new List<Dictionary<string, object?>>();
    foreach (var column in tableColumns)
    {
        var columnName = Convert.ToString(column["column_name"])!;
        var typeName = Convert.ToString(column["data_type"])!.ToLowerInvariant();
        var profile = new Dictionary<string, object?>
        {
            ["column_name"] = columnName,
            ["sensitive"] = IsSensitiveColumn(name, columnName)
        };

        if (typeName is "image" or "binary" or "varbinary" or "timestamp" or "rowversion"
            or "xml" or "geography" or "geometry" or "hierarchyid")
        {
            profile["analysis_note"] = "Value profiling skipped for large/complex binary or spatial type.";
            columnProfiles.Add(profile);
            continue;
        }

        var quoted = QuoteName(columnName);
        var textMetrics = IsTextType(typeName)
            ? $", SUM(CASE WHEN {quoted} IS NOT NULL AND LTRIM(RTRIM(CONVERT(nvarchar(max), {quoted}))) = N'' THEN 1 ELSE 0 END) AS blank_count"
            : ", CAST(NULL AS bigint) AS blank_count";
        var rangeMetrics = IsNumericType(typeName) || IsDateType(typeName)
            ? $", MIN({quoted}) AS min_value, MAX({quoted}) AS max_value"
            : ", CAST(NULL AS nvarchar(1)) AS min_value, CAST(NULL AS nvarchar(1)) AS max_value";
        var distinctMetric = rowCount <= 500000 && typeName is not "text" and not "ntext"
            ? $", COUNT_BIG(DISTINCT {quoted}) AS distinct_count"
            : ", CAST(NULL AS bigint) AS distinct_count";

        try
        {
            var stats = await QueryAsync(connection, $"""
                SELECT
                    SUM(CASE WHEN {quoted} IS NULL THEN 1 ELSE 0 END) AS null_count
                    {textMetrics}
                    {distinctMetric}
                    {rangeMetrics}
                FROM {QuoteName(schema)}.{QuoteName(name)};
                """, 300);
            foreach (var item in stats[0])
            {
                profile[item.Key] = item.Value;
            }

            if (!IsSensitiveColumn(name, columnName) && rowCount <= 250000 && typeName is not "text" and not "ntext")
            {
                profile["representative_values"] = await QueryAsync(connection, $"""
                    SELECT TOP (3)
                        LEFT(CONVERT(nvarchar(4000), {quoted}), 80) AS value,
                        COUNT_BIG(*) AS frequency
                    FROM {QuoteName(schema)}.{QuoteName(name)}
                    WHERE {quoted} IS NOT NULL
                    GROUP BY {quoted}
                    ORDER BY COUNT_BIG(*) DESC, MIN(CONVERT(nvarchar(4000), {quoted}));
                    """, 300);
            }
            else if (IsSensitiveColumn(name, columnName))
            {
                profile["representative_values"] = "[masked: sensitive field]";
            }
            else
            {
                profile["representative_values"] = "[omitted: table exceeds profiling threshold]";
            }
        }
        catch (Exception ex)
        {
            profile["analysis_error"] = ex.Message;
        }
        columnProfiles.Add(profile);
    }
    tableProfile["columns"] = columnProfiles;
    profiles.Add(tableProfile);
}

result["profiles"] = profiles;

var outputPath = args.Length > 0
    ? Path.GetFullPath(args[0])
    : Path.Combine(workspace, ".database-summary-work", "database-profile.json");
Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);
await File.WriteAllTextAsync(outputPath, JsonSerializer.Serialize(result, new JsonSerializerOptions
{
    WriteIndented = true
}));
Console.WriteLine(outputPath);
