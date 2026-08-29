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

By default, the source files are read from
`wwwroot\assets\IMAGES_PDF_PPT_EXCEL\POPULATION PROJECTION\GIS files NHM`.
To use another extracted directory, pass its path as the first argument.

Generate the browser-ready GeoJSON used by the Population Projection map:

```powershell
python .codex-work\convert_nhm_gis.py
```

The exporter reads the same default source directory and writes the district,
block, village, subcentre, medical-facility, and index files to
`wwwroot\assets\data\nhm-gis`.

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
`dbo.NhmGisBlocks`. Village polygons are matched to the supplied block
boundaries first. A location-code prefix is used only when a source village
polygon falls outside every supplied block boundary:

```powershell
dotnet run --project Scripts\NhmGisImporter\NhmGisImporter.csproj -- --sync-village-blocks
```

Verify the committed village assignments without changing data:

```powershell
dotnet run --project Scripts\NhmGisImporter\NhmGisImporter.csproj -- --verify-village-blocks
```

The import is transactional. Re-running it refreshes only these five NHM GIS
data tables and records a new completed import in `dbo.NhmGisImportLog`.
