import fs from "node:fs/promises";
import path from "node:path";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const W = 1280;
const H = 720;
const ROOT = "D:/VINAY/PROJECTS/OSPBCR_PORTAL";
const BUILD = `${ROOT}/.codex-work/presentation-build`;
const ASSETS = `${ROOT}/.codex-work/presentation-assets`;
const OUT = `${ROOT}/wwwroot/assets/IMAGES_PDF_PPT_EXCEL/OUTPUTS/OSPBCR_Portal_Complete_Website_and_Database_Overview.pptx`;

const C = {
  canvas: "#FFFFFF",
  ink: "#071A2D",
  muted: "#566575",
  panel: "#EEF3F6",
  panel2: "#F7F9FB",
  rule: "#BCC7D1",
  blue: "#0077A8",
  blue2: "#0B4F7B",
  teal: "#00A6A6",
  cyan: "#69D2E7",
  orange: "#F28C28",
  green: "#1B8A6B",
  red: "#C44B5A",
  white: "#FFFFFF",
  black: "#000000",
};

const FONT = "Arial";
const presentation = Presentation.create({ slideSize: { width: W, height: H } });

async function writeBlob(filePath, blob) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
}

async function readImageBlob(filePath) {
  const bytes = await fs.readFile(filePath);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function addBox(slide, x, y, w, h, fill = C.panel, line = "none", radius = true, name = "box") {
  return slide.shapes.add({
    geometry: radius ? "roundRect" : "rect",
    name,
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: line === "none"
      ? { style: "solid", fill: "none", width: 0 }
      : { style: "solid", fill: line, width: 1 },
  });
}

function addText(slide, text, x, y, w, h, options = {}) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    name: options.name || "text",
    position: { left: x, top: y, width: w, height: h },
    fill: options.fill || "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  shape.text = text;
  shape.text.style = {
    fontSize: options.fontSize || 18,
    bold: options.bold || false,
    color: options.color || C.ink,
    alignment: options.align || "left",
    verticalAlignment: options.valign || "top",
    typeface: FONT,
  };
  return shape;
}

function addRule(slide, x, y, w, color = C.rule, width = 1) {
  return slide.shapes.add({
    geometry: "straightConnector1",
    position: { left: x, top: y, width: w, height: 0 },
    fill: "none",
    line: { style: "solid", fill: color, width },
  });
}

function addArrow(slide, x, y, w, h = 0, color = C.blue, width = 2) {
  return slide.shapes.add({
    geometry: "straightConnector1",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style: "solid", fill: color, width },
    head: { type: "arrow", width: "med", length: "med" },
  });
}

async function addImage(slide, fileName, x, y, w, h, options = {}) {
  const filePath = path.isAbsolute(fileName) ? fileName : `${ASSETS}/${fileName}`;
  if (options.backing !== false) addBox(slide, x, y, w, h, C.panel2, C.rule, true, "image-backing");
  slide.images.add({
    blob: await readImageBlob(filePath),
    contentType: "image/png",
    alt: options.alt || fileName,
    fit: options.fit || "cover",
    position: { left: x, top: y, width: w, height: h },
    geometry: "roundRect",
  });
}

function addFooter(slide, number, label = "OSPBCR portal technical overview") {
  addRule(slide, 42, 666, 1196, C.rule, 1);
  addText(slide, label, 42, 675, 750, 20, { fontSize: 12, color: C.muted, valign: "middle" });
  addText(slide, String(number).padStart(2, "0"), 1180, 675, 58, 20, { fontSize: 12, color: C.muted, align: "right", valign: "middle" });
}

function addSlideTitle(slide, number, title, eyebrow = "SYSTEM WALKTHROUGH") {
  addText(slide, eyebrow, 42, 32, 420, 24, { fontSize: 13, bold: true, color: C.blue });
  addText(slide, title, 42, 70, 1196, 48, { fontSize: 36, bold: true, color: C.ink });
  addRule(slide, 42, 136, 1196, C.rule, 1);
  addFooter(slide, number);
}

function addNotes(slide, sources, speaker = "") {
  const lines = [];
  if (speaker) lines.push(speaker, "");
  lines.push("[Sources]", ...sources.map(source => `- ${source}`));
  slide.speakerNotes.textFrame.setText(lines);
  slide.speakerNotes.setVisible(true);
}

function metric(slide, x, y, w, h, value, label, accent = C.blue, detail = "") {
  addBox(slide, x, y, w, h, C.panel, "none", true, `metric-${label}`);
  addBox(slide, x, y, 8, h, accent, "none", false, "metric-accent");
  addText(slide, value, x + 28, y + 28, w - 52, 70, { fontSize: 48, bold: true, color: C.ink });
  addText(slide, label, x + 28, y + 104, w - 52, 34, { fontSize: 22, bold: true, color: accent });
  if (detail) addText(slide, detail, x + 28, y + 148, w - 52, h - 166, { fontSize: 16, color: C.muted });
}

function miniHeading(slide, text, x, y, w, color = C.blue) {
  addText(slide, text.toUpperCase(), x, y, w, 22, { fontSize: 13, bold: true, color });
}

function bulletList(slide, items, x, y, w, h, options = {}) {
  const prefix = options.check ? "✓  " : "•  ";
  addText(slide, items.map(item => prefix + item).join("\n"), x, y, w, h, {
    fontSize: options.fontSize || 18,
    color: options.color || C.ink,
  });
}

function diagramNode(slide, x, y, w, h, title, body, accent = C.blue, options = {}) {
  addBox(slide, x, y, w, h, options.fill || C.panel2, options.line || C.rule, true, `node-${title}`);
  addBox(slide, x, y, 8, h, accent, "none", false, "node-accent");
  addText(slide, title, x + 24, y + 16, w - 42, 32, { fontSize: options.titleSize || 22, bold: true, color: C.ink });
  addText(slide, body, x + 24, y + 54, w - 42, h - 64, { fontSize: options.bodySize || 16, color: C.muted });
}

function addTable(slide, values, x, y, w, h, widths = null, fontSize = 16) {
  const table = slide.tables.add({
    rows: values.length,
    columns: values[0].length,
    left: x,
    top: y,
    width: w,
    height: h,
    values,
    ...(widths ? { columnWidths: widths } : {}),
  });
  table.styleOptions = { headerRow: true, bandedRows: true };
  table.borders.assign({ style: "solid", fill: C.rule, width: 1 });
  for (let c = 0; c < values[0].length; c += 1) {
    table.getCell(0, c).fill = C.blue2;
    table.getCell(0, c).text.style = { fontSize, bold: true, color: C.white, typeface: FONT };
  }
  for (let r = 1; r < values.length; r += 1) {
    for (let c = 0; c < values[0].length; c += 1) {
      table.getCell(r, c).fill = r % 2 === 0 ? C.panel2 : C.white;
      table.getCell(r, c).text.style = { fontSize, color: C.ink, typeface: FONT };
    }
  }
  return table;
}

// 1 — Cover, preserving the Codex Grid cover/image split silhouette.
{
  const slide = presentation.slides.add();
  slide.background.fill = C.canvas;
  await addImage(slide, "home-overview.png", 660, 0, 620, 720, { alt: "OSPBCR public website home page", backing: false });
  addBox(slide, 0, 0, 660, 720, C.white, "none", false, "cover-left");
  addBox(slide, 42, 54, 118, 8, C.teal, "none", false, "cover-accent");
  addText(slide, "ODISHA STATE POPULATION-BASED CANCER REGISTRY", 42, 86, 540, 28, { fontSize: 14, bold: true, color: C.blue });
  addText(slide, "Complete Website\n& Database Overview", 42, 155, 560, 190, { fontSize: 58, bold: true, color: C.ink });
  addText(slide, "Public portal • Interactive analytics • CMS • APIs • SQL data model", 42, 382, 535, 74, { fontSize: 22, color: C.muted });
  addText(slide, "Technical walkthrough of the current project snapshot", 42, 564, 520, 36, { fontSize: 16, bold: true, color: C.blue2 });
  addText(slide, "13 August 2026", 42, 610, 250, 28, { fontSize: 16, color: C.muted });
  addNotes(slide, [
    "Local project source: D:/VINAY/PROJECTS/OSPBCR_PORTAL",
    "Local screenshot: http://localhost:5136/home.html, captured 2026-08-13",
  ], "Introduce the portal as one system with three connected experiences: public information, analytics, and managed content.");
}

// 2 — Portal at a glance (Codex Grid metric-led layout).
{
  const slide = presentation.slides.add();
  slide.background.fill = C.canvas;
  addSlideTitle(slide, 2, "Public information, registry analytics, and publishing—one portal");
  addText(slide, "The project combines a multilingual public site, live registry APIs, a role-based CMS, and three persistence layers.", 42, 162, 1120, 56, { fontSize: 22, color: C.muted });
  metric(slide, 42, 255, 374, 350, "12", "Public API routes", C.blue, "8 registry endpoints plus 4 content endpoints serve maps, charts, news, and downloadable resources.");
  metric(slide, 453, 255, 374, 350, "3", "Published languages", C.teal, "English, Hindi, and Odia are supported for news and managed PDF resources.");
  metric(slide, 864, 255, 374, 350, "2 + 1", "Persistence pattern", C.orange, "Two SQL Server databases are complemented by a JSON-backed district training store.");
  addNotes(slide, [
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Controllers/RegistryController.cs",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Controllers/ContentController.cs",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Models/CmsModels.cs",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Services/DistrictTrainingStore.cs",
  ]);
}

// 3 — Information architecture.
{
  const slide = presentation.slides.add();
  slide.background.fill = C.canvas;
  addSlideTitle(slide, 3, "Public navigation follows the registry information journey");
  const columns = [
    { x: 42, title: "Understand", accent: C.blue, items: ["Home", "About Us", "Our Team", "Data Sources"] },
    { x: 345, title: "Explore", accent: C.teal, items: ["Interactive Map", "Population Projection", "Cancer Burden"] },
    { x: 648, title: "Learn", accent: C.orange, items: ["Trainings", "Training Materials", "Trending News"] },
    { x: 951, title: "Operate", accent: C.green, items: ["SETU application", "CMS Login", "Language switcher"] },
  ];
  for (const col of columns) {
    addBox(slide, col.x, 185, 270, 420, C.panel2, C.rule, true, `ia-${col.title}`);
    addBox(slide, col.x, 185, 270, 12, col.accent, "none", false, "ia-accent");
    addText(slide, col.title, col.x + 24, 225, 222, 38, { fontSize: 25, bold: true, color: col.accent });
    col.items.forEach((item, index) => {
      addText(slide, `${String(index + 1).padStart(2, "0")}  ${item}`, col.x + 24, 296 + index * 62, 220, 34, { fontSize: 18, bold: index === 0, color: C.ink });
      if (index < col.items.length - 1) addRule(slide, col.x + 24, 342 + index * 62, 220, C.rule, 1);
    });
  }
  addNotes(slide, [
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Views/Shared/navbar.html",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Views/Home/*.html",
  ]);
}

// 4 — Home page.
{
  const slide = presentation.slides.add();
  slide.background.fill = C.canvas;
  addSlideTitle(slide, 4, "The home page guides users into the registry");
  await addImage(slide, "home.png", 42, 174, 720, 438, { alt: "OSPBCR home page hero" });
  miniHeading(slide, "Home page responsibilities", 806, 185, 370);
  bulletList(slide, [
    "Introduces the Odisha State PBCR mission and statewide scope",
    "Promotes the interactive map and About section as primary actions",
    "Summarizes registry objectives and operational workflow",
    "Surfaces latest CMS-published news",
    "Highlights institutional collaboration",
  ], 806, 230, 390, 280, { fontSize: 19, check: true });
  addBox(slide, 806, 532, 390, 80, C.panel, "none", true, "home-note");
  addText(slide, "Shared navbar, footer, design system, and i18n scripts keep the public pages visually and behaviorally consistent.", 830, 550, 345, 52, { fontSize: 16, color: C.muted });
  addNotes(slide, [
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Views/Home/home.html",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/wwwroot/assets/js/pages/home.js",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Views/Shared/navbar.html",
    "Local screenshot: http://localhost:5136/home.html, captured 2026-08-13",
  ]);
}

// 5 — Map.
{
  const slide = presentation.slides.add();
  slide.background.fill = C.canvas;
  addSlideTitle(slide, 5, "The map turns registry records into district evidence");
  await addImage(slide, "map-dashboard.png", 42, 174, 700, 438, { alt: "Interactive map and district statistics" });
  miniHeading(slide, "Data delivered to the page", 786, 184, 400);
  diagramNode(slide, 786, 220, 410, 96, "District statistics", "Cases, 2025 incidence, and 2025 mortality by district.", C.blue, { titleSize: 20, bodySize: 16 });
  diagramNode(slide, 786, 330, 410, 96, "Facilities", "Hospital / source-centre records with district and case totals.", C.teal, { titleSize: 20, bodySize: 16 });
  diagramNode(slide, 786, 440, 410, 144, "Cancer distributions", "Top five cancer sites and pediatric / geriatric groupings, filterable by year, sex, and district.", C.orange, { titleSize: 20, bodySize: 16 });
  addNotes(slide, [
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Views/Home/map.html",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Controllers/RegistryController.cs",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Services/RegistryDataService.cs",
    "Local screenshot: http://localhost:5136/map.html, captured 2026-08-13",
  ]);
}

// 6 — Population and GIS.
{
  const slide = presentation.slides.add();
  slide.background.fill = C.canvas;
  addSlideTitle(slide, 6, "Population projection adds GIS context for PBCR planning");
  await addImage(slide, "population-dashboard.png", 42, 174, 710, 438, { alt: "Population projection GIS dashboard" });
  miniHeading(slide, "GIS archive view", 790, 180, 390);
  const stats = [
    ["30", "districts"], ["314", "blocks"], ["52,945", "villages"], ["6,692", "health locations"],
  ];
  stats.forEach((item, i) => {
    const x = 790 + (i % 2) * 205;
    const y = 220 + Math.floor(i / 2) * 130;
    addBox(slide, x, y, 185, 108, C.panel, "none", true, "gis-stat");
    addText(slide, item[0], x + 18, y + 18, 150, 44, { fontSize: 32, bold: true, color: i % 2 === 0 ? C.blue : C.teal });
    addText(slide, item[1], x + 18, y + 67, 150, 24, { fontSize: 16, color: C.muted });
  });
  addText(slide, "Users can drill from Odisha → district → block and toggle boundary layers. Population statistics and an age pyramid appear in the same page.", 790, 493, 390, 98, { fontSize: 18, color: C.ink });
  addNotes(slide, [
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Views/Home/population-projection.html",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/wwwroot/assets/js/pages/population-projection.js",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Scripts/NhmGisImporter/README.md",
    "Local screenshot: http://localhost:5136/population-projection.html, captured 2026-08-13",
  ], "The GIS archive display counts are page-specific and may differ from the Setu_Odisha reference-table counts shown later.");
}

// 7 — News.
{
  const slide = presentation.slides.add();
  slide.background.fill = C.canvas;
  addSlideTitle(slide, 7, "Trending news is a multilingual CMS publishing surface");
  await addImage(slide, "trending.png", 42, 174, 710, 438, { alt: "Trending news page with language and date controls" });
  miniHeading(slide, "Reader experience", 790, 184, 390);
  bulletList(slide, [
    "English, Hindi, and Odia language selection",
    "Ascending or descending publication-date sorting",
    "Multi-image carousel for each news card",
    "Preview modal for the full item",
    "Automatic appearance of published CMS changes",
  ], 790, 228, 390, 250, { fontSize: 19, check: true });
  addBox(slide, 790, 504, 390, 108, C.panel, "none", true, "news-contract");
  addText(slide, "Public contract", 812, 522, 160, 26, { fontSize: 17, bold: true, color: C.blue });
  addText(slide, "GET /api/content/news?language=en", 812, 558, 340, 28, { fontSize: 17, bold: true, color: C.ink });
  addNotes(slide, [
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Views/Home/trending.html",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/wwwroot/assets/js/pages/trending.js",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Controllers/ContentController.cs",
    "Local screenshot: http://localhost:5136/trending.html, captured 2026-08-13",
  ]);
}

// 8 — Training, materials and burden.
{
  const slide = presentation.slides.add();
  slide.background.fill = C.canvas;
  addSlideTitle(slide, 8, "Training and cancer-burden resources support operations");
  await addImage(slide, "training-resources.png", 42, 178, 570, 318, { alt: "Training page executive summary and participant table" });
  await addImage(slide, "cancer-resources.png", 668, 178, 570, 318, { alt: "Cancer burden district PDF browser" });
  miniHeading(slide, "Training ecosystem", 42, 520, 250, C.orange);
  addText(slide, "District and private-hospital training summaries, galleries, participant counts, downloadable reports, and standalone reference manuals.", 42, 548, 548, 74, { fontSize: 17, color: C.ink });
  miniHeading(slide, "District evidence", 668, 520, 250, C.teal);
  addText(slide, "Cancer-burden factsheets and preview images are filtered by district and localized through the content API.", 668, 548, 548, 74, { fontSize: 17, color: C.ink });
  addNotes(slide, [
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Views/Home/trainings.html",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Views/Home/training-materials.html",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Views/Home/cancer-burden.html",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Controllers/ContentController.cs",
    "Local screenshots: http://localhost:5136/trainings.html and /cancer-burden.html, captured 2026-08-13",
  ]);
}

// 9 — About/data/team.
{
  const slide = presentation.slides.add();
  slide.background.fill = C.canvas;
  addSlideTitle(slide, 9, "About, data sources, and team pages establish credibility");
  await addImage(slide, "about-content.png", 42, 174, 665, 438, { alt: "About OSPBCR page" });
  const topics = [
    ["Registry purpose", "Mission, objectives, regional clusters, and operational model", C.blue],
    ["Collaboration", "Government of Odisha, NISER, Tata Memorial Centre, and partner institutions", C.teal],
    ["Data sources", "Participating hospitals and diagnostic organisations with outbound references", C.orange],
    ["People", "Leadership and project-team profiles sourced from the local asset library", C.green],
  ];
  topics.forEach((t, i) => diagramNode(slide, 752, 174 + i * 108, 444, 98, t[0], t[1], t[2], { titleSize: 19, bodySize: 15 }));
  addNotes(slide, [
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Views/Home/about.html",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Views/Home/data-sources.html",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Views/Home/team.html",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/wwwroot/assets/js/pages/team.js",
    "Local screenshot: http://localhost:5136/about.html, captured 2026-08-13",
  ]);
}

// 10 — CMS access.
{
  const slide = presentation.slides.add();
  slide.background.fill = C.canvas;
  addSlideTitle(slide, 10, "CMS access is protected by cookie authentication and roles");
  await addImage(slide, "admin-login.png", 42, 174, 700, 438, { alt: "OSPBCR CMS login screen" });
  miniHeading(slide, "Access controls", 786, 184, 390);
  bulletList(slide, [
    "Admin and User roles gate management actions",
    "Login is limited to 10 attempts per minute",
    "HttpOnly cookie with SameSite=Lax",
    "Eight-hour sliding session lifetime",
    "Anti-forgery validation on state-changing forms",
    "Dedicated access-denied and logout routes",
  ], 786, 228, 410, 300, { fontSize: 18, check: true });
  addBox(slide, 786, 526, 410, 86, "#FFF3E6", "none", true, "security-note");
  addText(slide, "Production hardening: remove the bootstrap default credential and store secrets outside appsettings.json.", 808, 541, 366, 60, { fontSize: 16, bold: true, color: "#8A4C08" });
  addNotes(slide, [
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Program.cs",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Controllers/AccountController.cs",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Controllers/AdminController.cs",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Data/CmsRepository.cs",
    "Local screenshot: http://localhost:5136/Account/Login, captured 2026-08-13",
  ]);
}

// 11 — CMS dashboard.
{
  const slide = presentation.slides.add();
  slide.background.fill = C.canvas;
  addSlideTitle(slide, 11, "One CMS dashboard controls all public content");
  await addImage(slide, "admin-dashboard.png", 42, 174, 790, 438, { alt: "OSPBCR content management dashboard" });
  miniHeading(slide, "Current local snapshot", 870, 184, 330);
  const current = [["1", "authorized user"], ["1", "news card"], ["6", "training PDFs"], ["1", "burden PDF"], ["25", "state circulars"]];
  current.forEach((v, i) => {
    addRule(slide, 870, 233 + i * 70, 326, i === 0 ? C.blue : C.rule, i === 0 ? 3 : 1);
    addText(slide, v[0], 870, 246 + i * 70, 60, 36, { fontSize: 27, bold: true, color: i % 2 ? C.teal : C.blue });
    addText(slide, v[1], 942, 251 + i * 70, 244, 30, { fontSize: 17, color: C.ink });
  });
  addNotes(slide, [
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Views/Admin/Dashboard.cshtml",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Controllers/AdminController.cs",
    "Local screenshot: http://localhost:5136/Admin/Dashboard, captured 2026-08-13",
  ], "The displayed totals are the running local database and JSON-store snapshot captured on 13 August 2026.");
}

// 12 — Publishing flow; connectors are created before nodes.
{
  const slide = presentation.slides.add();
  slide.background.fill = C.canvas;
  addSlideTitle(slide, 12, "Publishing follows a controlled five-stage path");
  const xs = [42, 286, 530, 774, 1018];
  for (let i = 0; i < 4; i += 1) addArrow(slide, xs[i] + 196, 337, 46, 0, C.blue, 2);
  const steps = [
    ["01", "Author", "Create or edit multilingual text and attach media.", C.blue],
    ["02", "Validate", "Model rules, anti-forgery, MIME, size, and file signatures.", C.teal],
    ["03", "Persist", "SQL tables, JSON store, and managed uploads are updated.", C.orange],
    ["04", "Expose", "ContentController localizes records into public JSON contracts.", C.green],
    ["05", "Render", "Page JavaScript fetches data and updates cards, filters, and sliders.", C.blue2],
  ];
  steps.forEach((s, i) => {
    addBox(slide, xs[i], 235, 200, 260, C.panel2, C.rule, true, `publish-${s[1]}`);
    addText(slide, s[0], xs[i] + 20, 255, 52, 42, { fontSize: 25, bold: true, color: s[3] });
    addText(slide, s[1], xs[i] + 20, 318, 160, 36, { fontSize: 24, bold: true, color: C.ink });
    addText(slide, s[2], xs[i] + 20, 374, 160, 96, { fontSize: 16, color: C.muted });
  });
  addBox(slide, 42, 535, 1176, 82, C.panel, "none", true, "publish-result");
  addText(slide, "Result", 66, 556, 90, 28, { fontSize: 18, bold: true, color: C.blue });
  addText(slide, "Published changes are visible without rebuilding the public pages; Draft news cards remain private to the CMS.", 168, 554, 1024, 48, { fontSize: 18, color: C.ink });
  addNotes(slide, [
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Controllers/AdminController.cs",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Services/ManagedFileStorage.cs",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Data/CmsRepository.cs",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Controllers/ContentController.cs",
  ]);
}

// 13 — Architecture diagram.
{
  const slide = presentation.slides.add();
  slide.background.fill = C.canvas;
  addSlideTitle(slide, 13, "ASP.NET Core combines MVC APIs with static public pages");
  // Connectors first.
  addArrow(slide, 295, 288, 75, 0, C.blue);
  addArrow(slide, 610, 288, 75, 0, C.blue);
  addArrow(slide, 925, 288, 75, 0, C.blue);
  addArrow(slide, 848, 355, 0, 95, C.teal);
  addArrow(slide, 1080, 355, 0, 95, C.orange);
  diagramNode(slide, 42, 205, 252, 170, "Browser", "Static HTML pages\nBootstrap + custom CSS\nJavaScript modules\nLeaflet maps + i18n", C.blue);
  diagramNode(slide, 370, 205, 240, 170, "ASP.NET Core", ".NET 10 web host\nMVC / API controllers\nRouting + static assets\nDependency injection", C.teal);
  diagramNode(slide, 685, 205, 240, 170, "Services", "RegistryDataService\nCmsRepository\nManagedFileStorage\nDistrictTrainingStore", C.orange);
  diagramNode(slide, 1000, 205, 238, 170, "SQL access", "Microsoft.Data.SqlClient\nNamed connection factories\nParameterized queries", C.green);
  diagramNode(slide, 685, 450, 326, 150, "Setu_Odisha", "Operational cancer registry, geography, facilities, coding lists, users, and file metadata.", C.teal);
  diagramNode(slide, 1030, 450, 208, 150, "Portal content", "OSPBCR_PORTAL SQL\n+ App_Data JSON\n+ wwwroot/uploads", C.orange, { titleSize: 20, bodySize: 15 });
  addNotes(slide, [
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/OSPBCR_PORTAL.csproj",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Program.cs",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Data/SqlConnectionFactory.cs",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Services/*.cs",
  ]);
}

// 14 — Request pipeline timeline.
{
  const slide = presentation.slides.add();
  slide.background.fill = C.canvas;
  addSlideTitle(slide, 14, "The request pipeline layers transport, resilience, and identity");
  addRule(slide, 62, 350, 1130, C.ink, 2);
  const points = [
    [74, "HTTPS", "Redirect + HSTS\nin production"],
    [280, "Static files", "CSS, JavaScript,\nimages, GeoJSON"],
    [486, "Routing", "Root and named\nredirects + MVC"],
    [692, "Cancellation", "Client aborts map\nto status 499"],
    [898, "Rate limit", "Fixed-window policy\nprotects login"],
    [1104, "Identity", "Cookie auth +\nrole authorization"],
  ];
  points.forEach((p, i) => {
    addBox(slide, p[0], 342, 16, 16, i % 2 ? C.teal : C.blue, "none", true, "timeline-dot");
    addText(slide, p[1], p[0] - 6, 274, 168, 32, { fontSize: 20, bold: true, color: C.ink });
    addText(slide, p[2], p[0] - 6, 382, 168, 66, { fontSize: 16, color: C.muted });
  });
  addBox(slide, 42, 520, 1196, 98, C.panel, "none", true, "pipeline-note");
  addText(slide, "Special handling", 66, 541, 180, 28, { fontSize: 18, bold: true, color: C.blue });
  addText(slide, "GeoJSON receives application/geo+json; Home HTML is served directly with no-cache headers during development; upload requests allow a 525 MB multipart body before file-specific validation.", 250, 538, 952, 64, { fontSize: 17, color: C.ink });
  addNotes(slide, ["D:/VINAY/PROJECTS/OSPBCR_PORTAL/Program.cs"]);
}

// 15 — Public APIs table, preserving Codex Grid table evidence layout.
{
  const slide = presentation.slides.add();
  slide.background.fill = C.canvas;
  addSlideTitle(slide, 15, "Twelve anonymous GET routes power the public portal");
  addText(slide, "The API surface is read-only for the public site; CMS mutations remain behind authenticated MVC actions.", 42, 157, 1160, 38, { fontSize: 19, color: C.muted });
  const values = [
    ["Route group", "Endpoint", "Purpose", "Inputs"],
    ["Registry", "/api/registry/health", "Database connectivity and metadata", "—"],
    ["Registry", "/district-status • /district-statistics", "District workload, cases, incidence, mortality", "—"],
    ["Registry", "/facilities", "Facility/source-centre case totals", "—"],
    ["Registry", "/cancer-site-incidence • mortality", "Top cancer sites", "year, sex, district"],
    ["Registry", "/cancer-age-incidence • mortality", "Pediatric and geriatric distributions", "year, sex, district"],
    ["Content", "/api/content/news", "Published multilingual news cards", "language"],
    ["Content", "/training-pdfs", "Localized district training reports", "language"],
    ["Content", "/cancer-burden-pdfs", "Localized burden factsheets", "language"],
    ["Content", "/odisha-circulars", "Localized district circulars", "language"],
  ];
  addTable(slide, values, 42, 214, 1196, 418, [150, 360, 450, 236], 14);
  addNotes(slide, [
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Controllers/RegistryController.cs",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Controllers/ContentController.cs",
  ]);
}

// 16 — Database overview.
{
  const slide = presentation.slides.add();
  slide.background.fill = C.canvas;
  addSlideTitle(slide, 16, "Setu_Odisha is the registry database behind analytics");
  addText(slide, "Profile snapshot generated 24 July 2026 • SQL Server database • FULL recovery • ONLINE", 42, 157, 1100, 34, { fontSize: 19, color: C.muted });
  const metrics = [
    ["56", "tables", C.blue], ["61,266", "catalog rows", C.teal], ["344", "columns", C.orange], ["144 MB", "allocated", C.green],
  ];
  metrics.forEach((m, i) => {
    const x = 42 + i * 303;
    addBox(slide, x, 220, 270, 172, C.panel, "none", true, "db-metric");
    addText(slide, m[0], x + 22, 252, 230, 62, { fontSize: 43, bold: true, color: m[2] });
    addText(slide, m[1], x + 22, 326, 230, 30, { fontSize: 19, bold: true, color: C.ink });
  });
  miniHeading(slide, "Largest and most important table groups", 42, 432, 520);
  addText(slide, "Clinical core", 42, 478, 170, 30, { fontSize: 20, bold: true, color: C.blue });
  addText(slide, "PatientTable • TumourTable • SourceTable • PatientFile", 42, 516, 350, 56, { fontSize: 16, color: C.ink });
  addText(slide, "Geography", 452, 478, 170, 30, { fontSize: 20, bold: true, color: C.teal });
  addText(slide, "StateList • DistrictList • BlockList • VillageList • Centres", 452, 516, 330, 64, { fontSize: 16, color: C.ink });
  addText(slide, "Reference coding", 822, 478, 210, 30, { fontSize: 20, bold: true, color: C.orange });
  addText(slide, "ICD10Group • HistologyList • PrimarySiteList • diagnosis, stage, treatment and status lists", 822, 516, 390, 72, { fontSize: 17, color: C.ink });
  addNotes(slide, ["D:/VINAY/PROJECTS/OSPBCR_PORTAL/Summary of DB/.database-summary-work/database-profile.json"], "Counts reflect the local database profile generated on 24 July 2026.");
}

// 17 — Clinical core data model; connectors first.
{
  const slide = presentation.slides.add();
  slide.background.fill = C.canvas;
  addSlideTitle(slide, 17, "Patients, tumours, sources, and files form the clinical core");
  addArrow(slide, 306, 320, 78, 0, C.blue);
  addArrow(slide, 626, 320, 78, 0, C.teal);
  addArrow(slide, 946, 320, 78, 0, C.orange);
  diagramNode(slide, 42, 205, 264, 264, "PatientTable", "1,450 rows • 36 columns\n\nIdentity, demographics, residence, birth/death dates, vital status, audit fields.", C.blue, { titleSize: 24, bodySize: 16 });
  diagramNode(slide, 384, 205, 242, 264, "TumourTable", "1,455 rows • 33 columns\n\nDiagnosis date, age, site, histology, behaviour, ICD-10, stage, and treatment.", C.teal, { titleSize: 24, bodySize: 16 });
  diagramNode(slide, 704, 205, 242, 264, "SourceTable", "1,455 rows • 12 columns\n\nSource type, source centre, case-file number, and linkage to the tumour.", C.orange, { titleSize: 24, bodySize: 16 });
  diagramNode(slide, 1024, 205, 214, 264, "PatientFile", "1,349 rows\n\nFile name, path, content type, size, upload date, and tumour key.", C.green, { titleSize: 22, bodySize: 16 });
  addBox(slide, 42, 510, 1196, 108, C.panel, "none", true, "model-cardinality");
  addText(slide, "Logical cardinality", 66, 531, 190, 28, { fontSize: 18, bold: true, color: C.blue });
  addText(slide, "Patient → Tumour: 1,443 single-tumour patients, 6 multiple-tumour patients • Tumour → Source: exactly one source for every tumour • Tumour → File: 310 no-file, 1,009 one-file, 136 multiple-file tumours", 260, 526, 948, 72, { fontSize: 17, color: C.ink });
  addNotes(slide, [
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Summary of DB/.database-summary-work/database-profile.json",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Services/RegistryDataService.cs",
  ]);
}

// 18 — Geography and coding model.
{
  const slide = presentation.slides.add();
  slide.background.fill = C.canvas;
  addSlideTitle(slide, 18, "Geography and coding tables provide analysis dimensions");
  addArrow(slide, 242, 310, 65, 0, C.teal);
  addArrow(slide, 507, 310, 65, 0, C.teal);
  addArrow(slide, 772, 310, 65, 0, C.teal);
  const geo = [
    [42, "StateList", "1 state", C.blue], [307, "DistrictList", "30 districts", C.teal], [572, "BlockList", "317 blocks", C.orange], [837, "VillageList", "53,782 villages", C.green],
  ];
  geo.forEach(g => diagramNode(slide, g[0], 235, 200, 150, g[1], g[2], g[3], { titleSize: 21, bodySize: 19 }));
  diagramNode(slide, 1052, 235, 186, 150, "Centres", "31 registry centres linked to villages", C.blue2, { titleSize: 21, bodySize: 16 });
  miniHeading(slide, "Clinical coding dimensions", 42, 440, 360);
  const codes = [
    ["PrimarySiteList", "401"], ["HistologyList", "557"], ["ICD10Group", "87"], ["TreatmentList", "19"], ["Diagnosis / stage / grade / behaviour", "several"],
  ];
  codes.forEach((c, i) => {
    const x = 42 + (i % 3) * 395;
    const y = 478 + Math.floor(i / 3) * 70;
    addText(slide, c[0], x, y, 290, 28, { fontSize: 17, bold: true, color: C.ink });
    addText(slide, c[1], x + 296, y, 76, 28, { fontSize: 17, bold: true, color: i % 2 ? C.teal : C.blue, align: "right" });
  });
  addNotes(slide, ["D:/VINAY/PROJECTS/OSPBCR_PORTAL/Summary of DB/.database-summary-work/database-profile.json"]);
}

// 19 — CMS schema.
{
  const slide = presentation.slides.add();
  slide.background.fill = C.canvas;
  addSlideTitle(slide, 19, "OSPBCR_PORTAL uses a compact content schema");
  addArrow(slide, 280, 267, 72, 0, C.blue);
  addArrow(slide, 600, 242, 72, 0, C.teal);
  addArrow(slide, 600, 335, 72, 0, C.teal);
  diagramNode(slide, 42, 205, 238, 166, "CmsUsers", "Username, password hash, Admin/User role, active flag, created and updated timestamps.", C.blue, { titleSize: 23, bodySize: 15 });
  diagramNode(slide, 352, 205, 248, 166, "NewsCards", "Published/Draft status plus created-by and updated-by user references.", C.teal, { titleSize: 23, bodySize: 15 });
  diagramNode(slide, 672, 165, 274, 146, "News translations", "NewsCardTranslations • Composite key: NewsCardId + en/hi/or. Title, date, note, and footer.", C.orange, { titleSize: 19, bodySize: 14 });
  diagramNode(slide, 672, 330, 274, 124, "NewsCardImages", "Ordered reusable image paths with cascade delete.", C.green, { titleSize: 20, bodySize: 15 });
  diagramNode(slide, 980, 165, 258, 146, "Cancer burden PDFs", "CancerBurdenResources • District, localized copy, PDF/preview paths, and audit metadata.", C.blue2, { titleSize: 18, bodySize: 13 });
  diagramNode(slide, 980, 330, 258, 124, "OdishaCirculars", "Same localized PDF-resource pattern with a unique PDF path.", C.orange, { titleSize: 20, bodySize: 14 });
  addBox(slide, 42, 505, 1196, 112, C.panel, "none", true, "cms-storage-note");
  addText(slide, "Separate store", 66, 529, 160, 26, { fontSize: 18, bold: true, color: C.blue });
  addText(slide, "District training PDFs use App_Data/district-training-pdfs.json with GUID keys. The hosted CmsDatabaseInitializer creates and upgrades SQL tables at startup and seeds initial records when required.", 230, 523, 978, 72, { fontSize: 17, color: C.ink });
  addNotes(slide, [
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Data/CmsRepository.cs",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Services/CmsDatabaseInitializer.cs",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Services/DistrictTrainingStore.cs",
  ]);
}

// 20 — File storage.
{
  const slide = presentation.slides.add();
  slide.background.fill = C.canvas;
  addSlideTitle(slide, 20, "Files are validated and stored under controlled public paths");
  addArrow(slide, 290, 310, 78, 0, C.blue);
  addArrow(slide, 610, 310, 78, 0, C.teal);
  addArrow(slide, 930, 310, 78, 0, C.orange);
  diagramNode(slide, 42, 220, 248, 210, "Upload form", "News: multiple WebP images\nResources: PDF + preview image\nOptional replacement on edit", C.blue, { titleSize: 23, bodySize: 17 });
  diagramNode(slide, 368, 220, 242, 210, "Validate", "Extension + MIME\nMagic-byte signature\n5 MB image cap\n25 MB PDF cap", C.teal, { titleSize: 23, bodySize: 17 });
  diagramNode(slide, 688, 220, 242, 210, "Save", "Sanitized category\nGUID filename\nCreateNew semantics\nAsync stream copy", C.orange, { titleSize: 23, bodySize: 17 });
  diagramNode(slide, 1008, 220, 230, 210, "Reference", "Public /uploads/{category}/{guid.ext} path stored in SQL or JSON.", C.green, { titleSize: 23, bodySize: 17 });
  addBox(slide, 42, 484, 570, 132, C.panel, "none", true, "file-delete");
  addText(slide, "Safe deletion", 66, 505, 170, 28, { fontSize: 20, bold: true, color: C.blue });
  addText(slide, "Only paths under /uploads/ are eligible. The resolved full path must remain beneath the managed upload root before deletion.", 66, 544, 520, 56, { fontSize: 17, color: C.ink });
  addBox(slide, 668, 484, 570, 132, C.panel, "none", true, "file-static");
  addText(slide, "Bundled assets", 692, 505, 190, 28, { fontSize: 20, bold: true, color: C.teal });
  addText(slide, "Long-lived manuals, factsheets, gallery media, logos, and GIS files are served directly from wwwroot/assets.", 692, 544, 520, 56, { fontSize: 17, color: C.ink });
  addNotes(slide, [
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Services/ManagedFileStorage.cs",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Controllers/AdminController.cs",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/wwwroot/assets",
  ]);
}

// 21 — Quality findings.
{
  const slide = presentation.slides.add();
  slide.background.fill = C.canvas;
  addSlideTitle(slide, 21, "Strong link integrity, with a focused quality backlog");
  addText(slide, "Positive signals", 42, 168, 300, 34, { fontSize: 23, bold: true, color: C.green });
  bulletList(slide, [
    "All 1,455 tumour rows match a patient through both tested logical keys",
    "All 1,455 source rows match a tumour and a patient",
    "All 1,349 PatientFile rows match a tumour",
    "Profiled birth, death, and diagnosis dates are convertible",
    "No duplicate patient REGNO, tumour TUMOURID, or source SOURCEID groups",
  ], 42, 220, 560, 255, { fontSize: 17, check: true });
  addText(slide, "Priority backlog", 668, 168, 300, 34, { fontSize: 23, bold: true, color: C.red });
  const risks = [
    ["310", "Village rows with orphan BlockId links"],
    ["66", "Duplicate VillageId groups / excess rows"],
    ["37", "Possible-duplicate records still unreviewed"],
    ["2 + 11", "ICD-10 values with invalid format + unmapped code"],
  ];
  risks.forEach((r, i) => {
    addBox(slide, 668, 218 + i * 78, 570, 64, i % 2 ? C.panel2 : C.panel, "none", true, "risk-row");
    addText(slide, r[0], 690, 230 + i * 78, 100, 36, { fontSize: 25, bold: true, color: C.red });
    addText(slide, r[1], 806, 233 + i * 78, 408, 34, { fontSize: 16, color: C.ink });
  });
  addBox(slide, 42, 524, 1196, 94, "#FFF3E6", "none", true, "hardening-row");
  addText(slide, "Application hardening", 66, 546, 210, 28, { fontSize: 18, bold: true, color: "#8A4C08" });
  addText(slide, "Move database credentials to environment-backed secrets, remove the default CMS password seed, and align the 525 MB global multipart limit with the stricter file-type limits.", 282, 541, 925, 62, { fontSize: 17, color: C.ink });
  addNotes(slide, [
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Summary of DB/.database-summary-work/database-profile.json",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Program.cs",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/appsettings.json",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Data/CmsRepository.cs",
  ], "Do not disclose local credentials. Discuss these as deployment controls, not as end-user functionality.");
}

// 22 — Close with operating model.
{
  const slide = presentation.slides.add();
  slide.background.fill = C.canvas;
  addText(slide, "OPERATING MODEL", 42, 42, 240, 24, { fontSize: 13, bold: true, color: C.blue });
  addText(slide, "The portal is ready to operate as one governed information system", 42, 90, 1120, 108, { fontSize: 50, bold: true, color: C.ink });
  addText(slide, "Keep the public experience, content operations, and registry data lifecycle synchronized.", 42, 216, 1040, 44, { fontSize: 22, color: C.muted });
  const actions = [
    ["01", "Govern content", "Use Draft/Published status, roles, localized copy, and managed files consistently.", C.blue],
    ["02", "Protect deployment", "Externalize secrets, rotate bootstrap access, back up both SQL databases and App_Data/uploads.", C.teal],
    ["03", "Improve data quality", "Resolve village hierarchy exceptions, review possible duplicates, and normalize ICD-10 values.", C.orange],
    ["04", "Monitor the service", "Track database health, API errors, file-storage capacity, and CMS publishing activity.", C.green],
  ];
  actions.forEach((a, i) => {
    const x = 42 + (i % 2) * 598;
    const y = 310 + Math.floor(i / 2) * 146;
    addBox(slide, x, y, 556, 120, C.panel2, C.rule, true, "closing-action");
    addText(slide, a[0], x + 22, y + 20, 54, 32, { fontSize: 22, bold: true, color: a[3] });
    addText(slide, a[1], x + 90, y + 18, 420, 32, { fontSize: 22, bold: true, color: C.ink });
    addText(slide, a[2], x + 90, y + 58, 432, 48, { fontSize: 16, color: C.muted });
  });
  addRule(slide, 42, 650, 1196, C.rule, 1);
  addText(slide, "OSPBCR • Public portal + Registry analytics + Content management", 42, 667, 930, 22, { fontSize: 13, color: C.muted });
  addText(slide, "22", 1180, 667, 58, 22, { fontSize: 13, color: C.muted, align: "right" });
  addNotes(slide, [
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL",
    "D:/VINAY/PROJECTS/OSPBCR_PORTAL/Summary of DB/.database-summary-work/database-profile.json",
  ], "Close by emphasizing that the portal is not only a website: it is a governed publication and analytics layer over the cancer-registry data lifecycle.");
}

async function main() {
  const previewDir = `${BUILD}/previews`;
  await fs.mkdir(previewDir, { recursive: true });
  await fs.mkdir(path.dirname(OUT), { recursive: true });

  for (const [index, slide] of presentation.slides.items.entries()) {
    const stem = `slide-${String(index + 1).padStart(2, "0")}`;
    await writeBlob(`${previewDir}/${stem}.png`, await presentation.export({ slide, format: "png", scale: 1 }));
    const layout = await slide.export({ format: "layout" });
    await fs.writeFile(`${previewDir}/${stem}.layout.json`, await layout.text());
  }

  await writeBlob(`${BUILD}/deck-montage.webp`, await presentation.export({ format: "webp", montage: true, scale: 1 }));
  const pptx = await PresentationFile.exportPptx(presentation);
  await pptx.save(OUT);
  console.log(`Created ${OUT}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
