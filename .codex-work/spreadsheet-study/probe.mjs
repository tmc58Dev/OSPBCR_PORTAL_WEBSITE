import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const folder = "D:/VINAY/PROJECTS/OSPBCR_PORTAL/wwwroot/assets/IMAGES_PDF_PPT_EXCEL/POPULATION PROJECTION/Odisha_Block_Population_Projection";
const filename = process.argv[2] || "Anugul.xlsx";
const filePath = path.join(folder, filename);
const input = await FileBlob.load(filePath);
const workbook = await SpreadsheetFile.importXlsx(input);

const overview = await workbook.inspect({
  kind: "workbook,sheet,table,definedName,drawing",
  maxChars: 12000,
  tableMaxRows: 10,
  tableMaxCols: 12,
  tableMaxCellChars: 120,
});
console.log(overview.ndjson);

const sheet = workbook.worksheets.getItem("Block_overview");
const used = sheet.getUsedRange();
console.log(JSON.stringify({
  sheetName: sheet.name,
  usedAddress: used?.address,
  rowCount: used?.rowCount,
  columnCount: used?.columnCount,
  tables: sheet.tables?.items?.map((t) => ({ name: t.name, showHeaders: t.showHeaders, showFilterButton: t.showFilterButton })) ?? [],
  charts: sheet.charts?.items?.map((c) => ({ name: c.name, title: c.title, type: c.type })) ?? [],
  shapes: sheet.shapes?.items?.map((s) => ({ name: s.name, text: s.text })) ?? [],
}, null, 2));

const key = await workbook.inspect({
  kind: "table,formula,computedStyle",
  sheetId: "Block_overview",
  range: "A1:Z30",
  maxChars: 20000,
  tableMaxRows: 30,
  tableMaxCols: 26,
  tableMaxCellChars: 200,
  options: { maxResults: 300 },
});
console.log(key.ndjson);

await fs.mkdir("previews", { recursive: true });
const preview = await workbook.render({ sheetName: "Block_overview", range: "A1:Z30", scale: 1, format: "png" });
await fs.writeFile(`previews/${path.parse(filename).name}.png`, new Uint8Array(await preview.arrayBuffer()));
