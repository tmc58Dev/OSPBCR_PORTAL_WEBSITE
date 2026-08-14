using System.Text.Json;
using Microsoft.Data.SqlClient;

var cs = "Server=.;Database=master;User ID=sa;Password=db853;Encrypt=False;TrustServerCertificate=True";
await using var connection = new SqlConnection(cs);
await connection.OpenAsync();

const string sql = """
SET NOCOUNT ON;

SELECT TABLE_CATALOG, TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, DATA_TYPE
FROM (
    SELECT * FROM Setu_Odisha.INFORMATION_SCHEMA.COLUMNS
    UNION ALL
    SELECT * FROM OSPBCR_PORTAL.INFORMATION_SCHEMA.COLUMNS
) AS columns_across_databases
WHERE TABLE_NAME IN ('VillageList', 'BlockList', 'DistrictList', 'NhmGisVillages', 'NhmGisBlocks', 'NhmGisDistricts')
ORDER BY TABLE_CATALOG, TABLE_NAME, ORDINAL_POSITION;

SELECT 'Setu_Odisha' AS DatabaseName,
       (SELECT COUNT_BIG(*) FROM Setu_Odisha.dbo.VillageList) AS VillageCount,
       (SELECT COUNT_BIG(*) FROM Setu_Odisha.dbo.BlockList) AS BlockCount,
       (SELECT COUNT_BIG(*) FROM Setu_Odisha.dbo.DistrictList) AS DistrictCount
UNION ALL
SELECT 'OSPBCR_PORTAL',
       (SELECT COUNT_BIG(*) FROM OSPBCR_PORTAL.dbo.NhmGisVillages),
       (SELECT COUNT_BIG(*) FROM OSPBCR_PORTAL.dbo.NhmGisBlocks),
       (SELECT COUNT_BIG(*) FROM OSPBCR_PORTAL.dbo.NhmGisDistricts);

WITH s AS (
    SELECT CONVERT(nvarchar(100), v.VillageId) AS VillageId,
           NULLIF(LTRIM(RTRIM(v.VillageName)), '') AS VillageName,
           CONVERT(nvarchar(100), v.BlockId) AS BlockId,
           NULLIF(LTRIM(RTRIM(b.BlockName)), '') AS BlockName,
           CONVERT(nvarchar(100), v.DistrictId) AS DistrictId,
           NULLIF(LTRIM(RTRIM(d.DistrictName)), '') AS DistrictName,
           UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(v.VillageName,''), ' ', ''), '-', ''), '.', ''), '''', ''), '(', ''), ')', ''), '/', '')) AS VillageKey,
           UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(b.BlockName,''), ' ', ''), '-', ''), '.', ''), '''', ''), '(', ''), ')', ''), '/', '')) AS BlockKey,
           UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(d.DistrictName,''), ' ', ''), '-', ''), '.', ''), '''', ''), '(', ''), ')', ''), '/', '')) AS DistrictKey,
           ROW_NUMBER() OVER (PARTITION BY UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(d.DistrictName,''), ' ', ''), '-', ''), '.', ''), '''', ''), '(', ''), ')', ''), '/', '')), UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(b.BlockName,''), ' ', ''), '-', ''), '.', ''), '''', ''), '(', ''), ')', ''), '/', '')), UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(v.VillageName,''), ' ', ''), '-', ''), '.', ''), '''', ''), '(', ''), ')', ''), '/', '')) ORDER BY v.Id) AS MatchOrdinal
    FROM Setu_Odisha.dbo.VillageList v
    LEFT JOIN Setu_Odisha.dbo.BlockList b ON CONVERT(nvarchar(100), b.BlockId) = CONVERT(nvarchar(100), v.BlockId)
    LEFT JOIN Setu_Odisha.dbo.DistrictList d ON CONVERT(nvarchar(100), d.DistrictId) = CONVERT(nvarchar(100), v.DistrictId)
),
p AS (
    SELECT CONVERT(nvarchar(100), v.LocationCode) AS VillageId,
           CONVERT(nvarchar(100), v.OriginalVillageId) AS OriginalVillageId,
           NULLIF(LTRIM(RTRIM(v.LocationName)), '') AS VillageName,
           CONVERT(nvarchar(100), v.BlockCode) AS BlockId,
           NULLIF(LTRIM(RTRIM(v.BlockName)), '') AS BlockName,
           CONVERT(nvarchar(100), v.DistrictCode) AS DistrictId,
           NULLIF(LTRIM(RTRIM(v.DistrictName)), '') AS DistrictName,
           UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(v.LocationName,''), ' ', ''), '-', ''), '.', ''), '''', ''), '(', ''), ')', ''), '/', '')) AS VillageKey,
           UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(v.BlockName,''), ' ', ''), '-', ''), '.', ''), '''', ''), '(', ''), ')', ''), '/', '')) AS BlockKey,
           UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(v.DistrictName,''), ' ', ''), '-', ''), '.', ''), '''', ''), '(', ''), ')', ''), '/', '')) AS DistrictKey,
           ROW_NUMBER() OVER (PARTITION BY UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(v.DistrictName,''), ' ', ''), '-', ''), '.', ''), '''', ''), '(', ''), ')', ''), '/', '')), UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(v.BlockName,''), ' ', ''), '-', ''), '.', ''), '''', ''), '(', ''), ')', ''), '/', '')), UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(v.LocationName,''), ' ', ''), '-', ''), '.', ''), '''', ''), '(', ''), ')', ''), '/', '')) ORDER BY v.VillageId) AS MatchOrdinal
    FROM OSPBCR_PORTAL.dbo.NhmGisVillages v
),
s2 AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY VillageKey ORDER BY DistrictKey, BlockKey, VillageId) AS VillageOrdinal
    FROM s
),
p2 AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY VillageKey ORDER BY DistrictKey, BlockKey, VillageId) AS VillageOrdinal
    FROM p
)
SELECT s.VillageId AS SetuVillageId, p.VillageId AS PortalLocationCode, p.OriginalVillageId AS PortalOriginalVillageId,
       s.VillageName AS SetuVillageName, p.VillageName AS PortalVillageName,
       s.BlockId AS SetuBlockId, s.BlockName AS SetuBlockName,
       p.BlockId AS PortalBlockId, p.BlockName AS PortalBlockName,
       s.DistrictId AS SetuDistrictId, s.DistrictName AS SetuDistrictName,
       p.DistrictId AS PortalDistrictId, p.DistrictName AS PortalDistrictName,
       CASE WHEN s.VillageId IS NULL THEN 'Only in OSPBCR_PORTAL'
            WHEN p.VillageId IS NULL THEN 'Only in Setu_Odisha'
            WHEN s.BlockKey <> p.BlockKey OR s.DistrictKey <> p.DistrictKey
              THEN 'Different'
            ELSE 'Same' END AS OverallStatus,
       CONCAT_WS('; ',
         CASE WHEN s.VillageId IS NULL THEN 'Missing from Setu_Odisha' END,
         CASE WHEN p.VillageId IS NULL THEN 'Missing from OSPBCR_PORTAL' END,
         CASE WHEN s.VillageId IS NOT NULL AND p.VillageId IS NOT NULL AND ISNULL(s.VillageName, '') COLLATE Latin1_General_100_BIN2 <> ISNULL(p.VillageName, '') COLLATE Latin1_General_100_BIN2 THEN 'Village text/case differs' END,
         CASE WHEN s.VillageId IS NOT NULL AND p.VillageId IS NOT NULL AND s.BlockKey <> p.BlockKey THEN 'Block assignment/name differs' END,
         CASE WHEN s.VillageId IS NOT NULL AND p.VillageId IS NOT NULL AND s.DistrictKey <> p.DistrictKey THEN 'District assignment/name differs' END
       ) AS DifferenceDetails
FROM s2 s FULL OUTER JOIN p2 p ON p.VillageKey = s.VillageKey AND p.VillageOrdinal = s.VillageOrdinal
ORDER BY COALESCE(s.DistrictName, p.DistrictName), COALESCE(s.BlockName, p.BlockName), COALESCE(s.VillageName, p.VillageName);
""";

await using var command = new SqlCommand(sql, connection) { CommandTimeout = 300 };
await using var reader = await command.ExecuteReaderAsync();
var resultSets = new List<List<Dictionary<string, object?>>>();
do
{
    var rows = new List<Dictionary<string, object?>>();
    while (await reader.ReadAsync())
    {
        var row = new Dictionary<string, object?>();
        for (var i = 0; i < reader.FieldCount; i++)
            row[reader.GetName(i)] = reader.IsDBNull(i) ? null : reader.GetValue(i);
        rows.Add(row);
    }
    resultSets.Add(rows);
} while (await reader.NextResultAsync());

var output = Path.Combine(AppContext.BaseDirectory, "database-comparison.json");
await File.WriteAllTextAsync(output, JsonSerializer.Serialize(resultSets, new JsonSerializerOptions { WriteIndented = false }));
Console.WriteLine(output);
Console.WriteLine(string.Join(", ", resultSets.Select((rows, index) => $"set{index + 1}={rows.Count}")));
