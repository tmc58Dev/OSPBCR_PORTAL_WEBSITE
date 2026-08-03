# NHM GIS database importer

This utility loads the five shapefile layers extracted from `GIS files NHM.rar`
into the `OSPBCR_PORTAL` SQL Server database. Attribute columns retain their
source values, and shapes are stored as SQL Server `geometry` values with SRID
4326.

Destination tables:

- `dbo.NhmGisDistricts`
- `dbo.NhmGisBlocks`
- `dbo.NhmGisVillages`
- `dbo.NhmGisSubcentres`
- `dbo.NhmGisMedicalFacilities`
- `dbo.NhmGisImportLog` (import audit records)

Run the import from the repository root:

```powershell
dotnet run --project Scripts\NhmGisImporter\NhmGisImporter.csproj
```

By default, the extracted files are read from
`.codex-work\gis-source\GIS files NHM`. To use another extracted directory,
pass its path as the first argument.

Inspect the target tables without changing data:

```powershell
dotnet run --project Scripts\NhmGisImporter\NhmGisImporter.csproj -- --inspect
```

Synchronize `dbo.NhmGisBlocks.DistrictCode` from the district table without
re-importing the shapefiles:

```powershell
dotnet run --project Scripts\NhmGisImporter\NhmGisImporter.csproj -- --sync-block-district-codes
```

Synchronize each village's block and district attributes from
`dbo.NhmGisBlocks`. Location-code prefixes are used when available; remaining
villages are matched against the block boundary polygons:

```powershell
dotnet run --project Scripts\NhmGisImporter\NhmGisImporter.csproj -- --sync-village-blocks
```

Verify the committed village assignments without changing data:

```powershell
dotnet run --project Scripts\NhmGisImporter\NhmGisImporter.csproj -- --verify-village-blocks
```

The import is transactional. Re-running it refreshes only these five NHM GIS
data tables and records a new completed import in `dbo.NhmGisImportLog`.
