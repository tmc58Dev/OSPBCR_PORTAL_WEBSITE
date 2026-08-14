import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = path.resolve("../..");
const comparisonCsv = await fs.readFile(path.join(root, ".codex-work", "comparison.csv"), "utf8");
const countsCsv = await fs.readFile(path.join(root, ".codex-work", "counts.csv"), "utf8");
const schemaCsv = await fs.readFile(path.join(root, ".codex-work", "schema.csv"), "utf8");
const differenceCountsCsv = await fs.readFile(path.join(root, ".codex-work", "difference-counts.csv"), "utf8");

const workbook = await Workbook.fromCSV(comparisonCsv, { sheetName: "Village Comparison" });
await workbook.fromCSV(countsCsv, { sheetName: "Source Counts" });
await workbook.fromCSV(schemaCsv, { sheetName: "Compared Schema" });
await workbook.fromCSV(differenceCountsCsv, { sheetName: "Difference Counts" });
const comparison = workbook.worksheets.getItem("Village Comparison");
const counts = workbook.worksheets.getItem("Source Counts");
const schema = workbook.worksheets.getItem("Compared Schema");
const differenceCounts = workbook.worksheets.getItem("Difference Counts");
const summary = workbook.worksheets.add("Summary");

for (const sheet of [comparison, counts, schema, differenceCounts, summary]) sheet.showGridLines = false;

const lastRow = comparison.getUsedRange(true).rowCount;
const header = comparison.getRange("A1:O1");
header.format = { fill: "#0F4C5C", font: { bold: true, color: "#FFFFFF" }, wrapText: true, verticalAlignment: "center" };
header.format.rowHeight = 34;
comparison.freezePanes.freezeRows(1);
comparison.freezePanes.freezeColumns(3);
header.format.font = { name: "Aptos Display", size: 10, bold: true, color: "#FFFFFF" };
for (const col of ["A","B","C","D","E","F","G","H","I","J","K","L","M","N"]) comparison.getRange(`${col}:${col}`).format.columnWidth = 18;
comparison.getRange("O:O").format.columnWidth = 34;

for (const [sheet, range] of [[counts, "A1:D3"], [schema, "A1:F46"], [differenceCounts, "A1:B3"]]) {
  sheet.getRange(range).format.font = { name: "Aptos", size: 10 };
  sheet.getRange(range.split(":")[0].replace(/[0-9]+$/, "1") + ":" + range.split(":")[1].replace(/[0-9]+$/, "1")).format = {
    fill: "#0F4C5C", font: { name: "Aptos Display", bold: true, color: "#FFFFFF" }
  };
  sheet.getRange(range).format.autofitColumns();
  sheet.freezePanes.freezeRows(1);
}
counts.tables.add("A1:D3", true, "SourceCountsTable").style = "TableStyleMedium2";
schema.tables.add("A1:F46", true, "ComparedSchemaTable").style = "TableStyleMedium2";
differenceCounts.tables.add("A1:B3", true, "DifferenceCountsTable").style = "TableStyleMedium2";

summary.getRange("A1:F1").merge();
summary.getRange("A1").values = [["Village / Block / District Database Comparison"]];
summary.getRange("A1:F1").format = { fill: "#0F4C5C", font: { name: "Aptos Display", size: 16, bold: true, color: "#FFFFFF" }, verticalAlignment: "center" };
summary.getRange("A1:F1").format.rowHeight = 30;
summary.getRange("A3:B3").values = [["Metric", "Count"]];
summary.getRange("A4:A10").values = [["Total comparison rows"],["Same village-to-block/district mapping"],["Different block/district mapping"],["Only in Setu_Odisha"],["Only in OSPBCR_PORTAL"],["Block assignment/name differs"],["District assignment/name differs"]];
summary.getRange("B4:B10").formulas = [
  [`=COUNTA('Village Comparison'!$N$2:$N$${lastRow})`],
  [`=COUNTIF('Village Comparison'!$N$2:$N$${lastRow},"Same")`],
  [`=COUNTIF('Village Comparison'!$N$2:$N$${lastRow},"Different")`],
  [`=COUNTIF('Village Comparison'!$N$2:$N$${lastRow},"Only in Setu_Odisha")`],
  [`=COUNTIF('Village Comparison'!$N$2:$N$${lastRow},"Only in OSPBCR_PORTAL")`],
  ["='Difference Counts'!B2"],
  ["='Difference Counts'!B3"],
];
summary.getRange("D3:F3").values = [["Database", "Villages", "Blocks"]];
summary.getRange("D4:F5").formulas = [
  ["='Source Counts'!A2", "='Source Counts'!B2", "='Source Counts'!C2"],
  ["='Source Counts'!A3", "='Source Counts'!B3", "='Source Counts'!C3"],
];
summary.getRange("A3:B3").format = { fill: "#1F7A8C", font: { bold: true, color: "#FFFFFF" } };
summary.getRange("D3:F3").format = { fill: "#1F7A8C", font: { bold: true, color: "#FFFFFF" } };
summary.getRange("A3:B10").format.borders = { preset: "inside", style: "thin", color: "#D1D5DB" };
summary.getRange("D3:F5").format.borders = { preset: "inside", style: "thin", color: "#D1D5DB" };
summary.getRange("B4:B10").format.numberFormat = "#,##0";
summary.getRange("E4:F5").format.numberFormat = "#,##0";
summary.getRange("A12:F14").merge(true);
summary.getRange("A12").values = [["Method: villages are paired by a normalized village name (case, spaces, hyphens, periods, apostrophes, parentheses, and slashes ignored). Repeated names are paired deterministically by district/block order. Block and district differences compare normalized names; the two databases use unrelated identifier systems, so code differences are shown but not classified as errors."]];
summary.getRange("A12:F14").format = { fill: "#E8F1F2", font: { color: "#334155", italic: true }, wrapText: true, verticalAlignment: "top", borders: { preset: "outside", style: "thin", color: "#94A3B8" } };
summary.getRange("A:F").format.columnWidth = 21;
summary.getRange("A12:F14").format.rowHeight = 30;
summary.freezePanes.freezeRows(1);

const outputDir = path.join(root, "outputs", "019fef8f-69cb-7461-b52a-64b8ac927e7d");
await fs.mkdir(outputDir, { recursive: true });
const previews = path.join(outputDir, "previews");
await fs.mkdir(previews, { recursive: true });

for (const [sheetName, range, file] of [
  ["Summary", "A1:F14", "summary.png"],
  ["Village Comparison", "A1:O20", "comparison.png"],
  ["Source Counts", "A1:D3", "counts.png"],
  ["Compared Schema", "A1:F20", "schema.png"],
  ["Difference Counts", "A1:B3", "difference-counts.png"],
]) {
  const image = await workbook.render({ sheetName, range, scale: 1.2, format: "png" });
  await fs.writeFile(path.join(previews, file), new Uint8Array(await image.arrayBuffer()));
}

const summaryInspect = await workbook.inspect({ kind: "table", range: "Summary!A1:F14", include: "values,formulas", tableMaxRows: 20, tableMaxCols: 8, maxChars: 6000 });
console.log(summaryInspect.ndjson);
const errors = await workbook.inspect({ kind: "match", range: "Summary!A1:F14", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 100 }, summary: "final formula error scan" });
console.log(errors.ndjson);

const output = await SpreadsheetFile.exportXlsx(workbook);
const outputPath = path.join(outputDir, "Village_Block_District_DB_Comparison.xlsx");
await output.save(outputPath);
console.log(outputPath);
