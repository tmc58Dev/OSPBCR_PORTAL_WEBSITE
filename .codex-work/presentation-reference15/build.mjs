import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const ROOT = "D:/VINAY/PROJECTS/OSPBCR_PORTAL";
const BUILD = `${ROOT}/.codex-work/presentation-reference15`;
const ASSETS = `${ROOT}/.codex-work/presentation-assets`;
const WEB = `${ROOT}/wwwroot`;
const OUTPUT = `${WEB}/assets/IMAGES_PDF_PPT_EXCEL/OUTPUTS/OSPBCR_Portal_Professional_Website_and_Database_Presentation.pptx`;
const PREVIEW_DIR = `${BUILD}/final-preview`;
const LAYOUT_DIR = `${BUILD}/final-layout`;

const C = {
  ink: "#161614",
  sage: "#748165",
  sageLight: "#CAD6CA",
  blue: "#8E9FE5",
  cream: "#F0E4C2",
  ivory: "#FCF9F3",
  muted: "#5F655A",
};

const FONT = "Cambria";

async function bytes(filePath) {
  const data = await fs.readFile(filePath);
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}

async function writeBlob(filePath, blob) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
}

function shapeByName(slide, name) {
  const shape = slide.shapes.items.find((item) => item.name === name);
  if (!shape) throw new Error(`Missing inherited shape ${name}`);
  return shape;
}

function imageByName(slide, name) {
  const image = slide.images.items.find((item) => item.name === name);
  if (!image) throw new Error(`Missing inherited image ${name}`);
  return image;
}

function tableByName(slide, name) {
  const table = slide.tables.items.find((item) => item.name === name);
  if (!table) throw new Error(`Missing inherited table ${name}`);
  return table;
}

function styleText(shape, text, { size = 21, bold = false, color = C.ink, align = "left", valign = "top", position } = {}) {
  shape.text = text;
  shape.text.style = {
    typeface: FONT,
    fontSize: size,
    bold,
    color,
    alignment: align,
    verticalAlignment: valign,
  };
  if (position) shape.position = position;
  return shape;
}

function addText(slide, text, position, { size = 16, bold = false, color = C.muted, align = "left", valign = "middle", name = "added-text" } = {}) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    name,
    position,
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  shape.text = text;
  shape.text.style = {
    typeface: FONT,
    fontSize: size,
    bold,
    color,
    alignment: align,
    verticalAlignment: valign,
  };
  return shape;
}

async function addImage(slide, filePath, position, alt, { fit = "contain", geometry = "rect", borderRadius = 0 } = {}) {
  return slide.images.add({
    blob: await bytes(filePath),
    contentType: "image/png",
    alt,
    fit,
    position,
    geometry,
    borderRadius,
  });
}

async function replaceImage(slide, inheritedName, filePath, alt, fit = "contain") {
  const image = imageByName(slide, inheritedName);
  const frame = image.frame;
  const geometry = image.geometry;
  const borderRadius = image.borderRadius;
  const rotation = image.rotation;
  const flipHorizontal = image.flipHorizontal;
  const flipVertical = image.flipVertical;
  const lockAspectRatio = image.lockAspectRatio;
  image.replace({
    blob: await bytes(filePath),
    contentType: "image/png",
    alt,
    fit,
  });
  image.frame = frame;
  image.fit = fit;
  image.crop = { left: 0, top: 0, right: 0, bottom: 0 };
  image.geometry = geometry;
  image.borderRadius = borderRadius;
  image.rotation = rotation;
  image.flipHorizontal = flipHorizontal;
  image.flipVertical = flipVertical;
  image.lockAspectRatio = lockAspectRatio;
  return image;
}

async function placeUniqueImageInInheritedZone(slide, inheritedName, filePath, alt) {
  const inherited = imageByName(slide, inheritedName);
  const geometry = inherited.geometry || "roundRect";
  const borderRadius = inherited.borderRadius || "rounded-2xl";
  inherited.frame = { left: 0, top: 0, width: 1, height: 1 };
  inherited.alt = "Inactive source-template image";
  inherited.lockAspectRatio = false;
  return addImage(
    slide,
    filePath,
    { left: 573, top: 136, width: 342, height: 214 },
    alt,
    { fit: "contain", geometry, borderRadius },
  );
}

function setBulletList(shape, items, { size = 19, color = C.ink } = {}) {
  shape.text.set(items.map((item) => ({
    bulletCharacter: "",
    marginLeft: 0,
    indent: 0,
    spaceAfter: 9,
    runs: [`•\u00A0\u00A0${item}`],
  })));
  shape.text.style = {
    typeface: FONT,
    fontSize: size,
    bold: false,
    color,
    alignment: "left",
    verticalAlignment: "top",
  };
}

function addNotes(slide, sources, speaker = "") {
  const lines = [];
  if (speaker) lines.push(speaker, "");
  lines.push("[Sources]", ...sources.map((source) => `- ${source}`));
  slide.speakerNotes.textFrame.setText(lines);
  slide.speakerNotes.setVisible(true);
}

const presentation = await PresentationFile.importPptx(
  await FileBlob.load(`${BUILD}/template-starter.pptx`),
);

if (presentation.slides.items.length !== 15) {
  throw new Error(`Expected 15 starter slides; found ${presentation.slides.items.length}`);
}

// Slide 1 — title.
{
  const slide = presentation.slides.items[0];
  styleText(
    shapeByName(slide, "Google Shape;1227;p25"),
    "Odisha State Population-Based\nCancer Registry Portal",
    { size: 44, bold: true, color: C.ink, valign: "bottom" },
  );
  styleText(
    shapeByName(slide, "Google Shape;1228;p25"),
    "A public-health information and registry platform for Odisha",
    { size: 21, bold: false, color: C.ink, valign: "middle" },
  );

  const logoRoot = `${WEB}/assets/IMAGES_PDF_PPT_EXCEL/logos`;
  await addImage(slide, `${logoRoot}/odisha govt-Photoroom.png`, { left: 75, top: 410, width: 125, height: 54 }, "Government of Odisha logo");
  await addImage(slide, `${logoRoot}/NISER Logo.png`, { left: 215, top: 410, width: 54, height: 54 }, "NISER logo");
  await addImage(slide, `${logoRoot}/tmc-Photoroom.png`, { left: 285, top: 410, width: 75, height: 54 }, "Tata Memorial Centre logo");

  addNotes(slide, [
    `${BUILD}/reference-source.pptx`,
    `${logoRoot}/odisha govt-Photoroom.png`,
    `${logoRoot}/NISER Logo.png`,
    `${logoRoot}/tmc-Photoroom.png`,
    `${ROOT}/Views/Shared/navbar.html`,
  ]);
}

// Slide 2 — reason for development.
{
  const slide = presentation.slides.items[1];
  const S = (name) => shapeByName(slide, name);
  styleText(S("Google Shape;1250;p27"), "02 | Why a centralized portal is needed", { size: 36, bold: true, valign: "middle" });

  const blocks = [
    ["Google Shape;1259;p27", "01", "Google Shape;1260;p27", "Trusted information", "Google Shape;1252;p27", "Public users and professionals need consistent, institution-backed cancer information."],
    ["Google Shape;1256;p27", "02", "Google Shape;1258;p27", "Statewide visibility", "Google Shape;1253;p27", "District and registry views make coverage and activity across Odisha easier to understand."],
    ["Google Shape;1255;p27", "03", "Google Shape;1261;p27", "Digital access", "Google Shape;1251;p27", "Reports, training material and circulars can be reached without an office visit."],
    ["Google Shape;1257;p27", "04", "Google Shape;1262;p27", "Better decisions", "Google Shape;1254;p27", "Structured registry and population data support research, planning and follow-up."],
  ];
  for (const [numName, num, headName, head, bodyName, body] of blocks) {
    styleText(S(numName), num, { size: 26, bold: true, color: C.sage, valign: "middle" });
    styleText(S(headName), head, { size: 24, bold: true, valign: "middle" });
    styleText(S(bodyName), body, { size: 19, bold: false, valign: "top" });
  }
  addText(slide, "Source: local OSPBCR portal pages, services and registry-data profile", { left: 75, top: 505, width: 700, height: 20 }, { size: 14, color: C.muted, valign: "middle", name: "local-source-caption" });
  addNotes(slide, [
    `${ROOT}/Program.cs`,
    `${ROOT}/Views/Home`,
    `${ROOT}/Summary of DB/.database-summary-work/database-profile.json`,
    `${BUILD}/reference-source.pptx`,
  ]);
}

// Slide 3 — uses.
{
  const slide = presentation.slides.items[2];
  const S = (name) => shapeByName(slide, name);
  styleText(S("Google Shape;1793;p43"), "03 | How the portal is used", { size: 36, bold: true, valign: "middle" });

  styleText(S("Google Shape;1797;p43"), "Public & communities", { size: 24, bold: true, valign: "middle" });
  styleText(S("Google Shape;1794;p43"), "Understand the registry, follow current updates and reach reliable reports, circulars and awareness resources.", { size: 19, bold: false });

  styleText(S("Google Shape;1798;p43"), "Researchers & clinicians", { size: 24, bold: true, valign: "middle" });
  styleText(S("Google Shape;1795;p43"), "Explore district, population, cancer-site and age-group views for analysis, comparison and evidence building.", { size: 19, bold: false });

  styleText(S("Google Shape;1799;p43"), "Programme & CMS teams", { size: 24, bold: true, valign: "middle" });
  styleText(S("Google Shape;1796;p43"), "Publish localized content, manage resources and use district intelligence to support training, outreach and administration.", { size: 19, bold: false });

  addNotes(slide, [
    `${ROOT}/Views/Home`,
    `${ROOT}/Views/Admin`,
    `${ROOT}/Program.cs`,
    `${BUILD}/reference-source.pptx`,
  ]);
}

// Slide 4 — advantages.
{
  const slide = presentation.slides.items[3];
  const S = (name) => shapeByName(slide, name);
  styleText(S("Google Shape;1775;p41"), "04 | The advantages of one connected platform", { size: 36, bold: true, valign: "middle" });

  const table = tableByName(slide, "Google Shape;1776;p41");
  const values = [
    ["Benefit", "What it delivers"],
    ["One source", "News, data and resources together"],
    ["Faster access", "Pages and downloads available anytime"],
    ["Clear reach", "District coverage is visible"],
    ["CMS control", "Authorized teams publish updates"],
    ["Digital record", "SQL, JSON and managed files"],
  ];
  for (let r = 0; r < values.length; r += 1) {
    for (let c = 0; c < values[r].length; c += 1) {
      const cell = table.getCell(r, c);
      cell.value = values[r][c];
      cell.text.style = {
        typeface: FONT,
        fontSize: r === 0 ? 17 : 15,
        bold: r === 0 || c === 0,
        color: C.ink,
        verticalAlignment: "middle",
      };
    }
  }

  styleText(S("Google Shape;1778;p41"), "Professional value", { size: 24, bold: true, valign: "middle" });
  styleText(S("Google Shape;1777;p41"), "Public information, research views and publishing workflows share one institutional experience—improving clarity, trust and communication.", { size: 19, bold: false });
  styleText(S("Google Shape;1780;p41"), "Planning value", { size: 24, bold: true, valign: "middle" });
  styleText(S("Google Shape;1779;p41"), "District statistics, projections and cancer-burden resources can support outreach, training and evidence-informed decisions.", { size: 19, bold: false });

  addNotes(slide, [
    `${ROOT}/Program.cs`,
    `${ROOT}/Views/Home`,
    `${ROOT}/Views/Admin`,
    `${BUILD}/reference-source.pptx`,
  ]);
}

// Slide 5 — home.
{
  const slide = presentation.slides.items[4];
  await replaceImage(slide, "Google Shape;1318;p33", `${ASSETS}/home.png`, "OSPBCR Portal home page", "cover");
  styleText(
    shapeByName(slide, "Google Shape;1319;p33"),
    "05 | Home — the portal’s central entry point",
    { size: 23, bold: true, align: "center", valign: "middle" },
  );
  addNotes(slide, [
    `${ASSETS}/home.png`,
    `${ROOT}/Views/Home/home.html`,
    `${BUILD}/reference-source.pptx`,
  ]);
}

const pageSlides = [
  {
    output: 6,
    title: "06 | About OSPBCR",
    bullets: [
      "Introduces the registry mission and public-health mandate",
      "Explains objectives and institutional partner roles",
      "Presents team, gallery and circular context",
      "Establishes credible organizational background",
      "Helps citizens, collaborators and researchers",
    ],
    image: "about-content.png",
    alt: "About OSPBCR page overview",
    sources: [`${ROOT}/Views/Home/about.html`],
  },
  {
    output: 7,
    title: "07 | Training & Resources",
    bullets: [
      "Supports district training and continuing learning",
      "Summarizes activities and participant information",
      "Provides district-wise PDFs and learning material",
      "Speeds access for field teams",
      "Helps registry staff, trainers and programme managers",
    ],
    image: "training-resources.png",
    alt: "Training and training materials pages",
    sources: [`${ROOT}/Views/Home/trainings.html`, `${ROOT}/Views/Home/training-materials.html`],
  },
  {
    output: 9,
    title: "09 | Population Projection",
    bullets: [
      "Provides projected denominators by district and year",
      "Supports district and demographic filtering",
      "Presents comparative charts and tables",
      "Adds context for incidence-rate analysis",
      "Helps researchers, planners and analysts",
    ],
    image: "population-dashboard.png",
    alt: "Population projection dashboard",
    sources: [`${ROOT}/wwwroot/assets/data/population-data.json`, `${ROOT}/Views/Home/population-projection.html`],
  },
  {
    output: 10,
    title: "10 | Cancer Statistics",
    bullets: [
      "Turns registry data into incidence and mortality views",
      "Supports cancer-site and age-group analysis",
      "Provides district and demographic filters",
      "Uses API-backed visual summaries",
      "Helps clinicians, researchers and decision-makers",
    ],
    image: "home-overview.png",
    alt: "Portal cancer analytics and registry overview",
    sources: [`${ROOT}/Program.cs`, `${ROOT}/Views/Home/cancer-burden.html`],
  },
  {
    output: 11,
    title: "11 | News & Circulars",
    bullets: [
      "Keeps the public informed about current registry activity",
      "Publishes news and trending updates",
      "Provides Odisha circulars and notices",
      "Supports English, Hindi and Odia content",
      "Helps public users, media and partner institutions",
    ],
    image: "trending.png",
    alt: "Trending news and updates page",
    sources: [`${ROOT}/Views/Home/trending.html`, `${ROOT}/Views/Home/about.html`],
  },
  {
    output: 12,
    title: "12 | Reports & Downloads",
    bullets: [
      "Brings official downloadable material together",
      "Provides training PDFs",
      "Organizes district cancer-burden resources",
      "Offers Odisha circulars with previews",
      "Helps field teams, researchers and administrators",
    ],
    image: "cancer-resources.png",
    alt: "Cancer burden PDF and resource library",
    sources: [`${ROOT}/Views/Home/cancer-burden.html`, `${ROOT}/Views/Home/training-materials.html`],
  },
  {
    output: 13,
    title: "13 | CMS Administration",
    bullets: [
      "Gives authorized staff controlled publishing tools",
      "Uses role-based login and a focused dashboard",
      "Creates, edits and removes news and resources",
      "Supports localized text and managed uploads",
      "Helps content editors and portal administrators",
    ],
    image: "admin-dashboard.png",
    alt: "OSPBCR CMS administration dashboard",
    sources: [`${ROOT}/Views/Admin`, `${ROOT}/Program.cs`],
  },
];

for (const item of pageSlides) {
  const slide = presentation.slides.items[item.output - 1];
  styleText(shapeByName(slide, "Google Shape;1289;p30"), item.title, { size: 35, bold: true, valign: "middle" });
  setBulletList(shapeByName(slide, "Google Shape;1290;p30"), item.bullets, { size: 19 });
  await placeUniqueImageInInheritedZone(slide, "Google Shape;1291;p30", `${ASSETS}/${item.image}`, item.alt);
  addNotes(slide, [
    `${ASSETS}/${item.image}`,
    ...item.sources,
    `${BUILD}/reference-source.pptx`,
  ]);
}

// Slide 8 — interactive map.
{
  const slide = presentation.slides.items[7];
  const S = (name) => shapeByName(slide, name);
  styleText(S("Google Shape;1680;p36"), "08 | Interactive Map & District Coverage", { size: 36, bold: true, valign: "middle" });
  styleText(S("Google Shape;1682;p36"), "30 districts", { size: 22, bold: true, valign: "middle" });
  styleText(S("Google Shape;1683;p36"), "Facilities & sources", { size: 22, bold: true, valign: "middle" });
  styleText(S("Google Shape;1684;p36"), "Case status", { size: 22, bold: true, valign: "middle" });
  styleText(S("Google Shape;1685;p36"), "District statistics", { size: 22, bold: true, valign: "middle" });
  styleText(S("Google Shape;1681;p36"), "Users can compare district readiness, facilities and case information from one map-led view.", { size: 16, bold: false, color: C.muted, valign: "middle" });
  await replaceImage(slide, "Google Shape;1690;p36", `${ASSETS}/map-dashboard.png`, "Interactive Odisha district map dashboard", "contain");
  addNotes(slide, [
    `${ASSETS}/map-dashboard.png`,
    `${WEB}/assets/svg/Odisha_districts_map.svg`,
    `${WEB}/assets/data/Orissa.geojson`,
    `${ROOT}/Program.cs`,
    `${BUILD}/reference-source.pptx`,
  ]);
}

// Slide 14 — website and database architecture.
{
  const slide = presentation.slides.items[13];
  const S = (name) => shapeByName(slide, name);
  styleText(S("Google Shape;1715;p38"), "14 | Website and database architecture", { size: 36, bold: true, valign: "middle" });

  const codes = [
    ["Google Shape;1719;p38", "WEB"],
    ["Google Shape;1733;p38", "UI"],
    ["Google Shape;1734;p38", "API"],
    ["Google Shape;1717;p38", "CMS"],
    ["Google Shape;1716;p38", "REG"],
    ["Google Shape;1735;p38", "CMS"],
    ["Google Shape;1736;p38", "JSON"],
    ["Google Shape;1718;p38", "FILE"],
  ];
  for (const [name, text] of codes) {
    styleText(S(name), text, { size: 15, bold: false, color: C.ivory, align: "center", valign: "middle" });
  }

  styleText(S("Google Shape;1720;p38"), "ASP.NET Core web", { size: 18, bold: false, align: "right", valign: "middle" });
  styleText(S("Google Shape;1729;p38"), "Public pages", { size: 18, bold: false, align: "right", valign: "middle" });
  styleText(S("Google Shape;1730;p38"), "Registry APIs", { size: 18, bold: false, align: "right", valign: "middle" });
  styleText(S("Google Shape;1724;p38"), "CMS & admin", { size: 18, bold: false, align: "right", valign: "middle" });

  styleText(S("Google Shape;1725;p38"), "Setu_Odisha SQL", { size: 18, bold: false, valign: "middle" });
  styleText(S("Google Shape;1731;p38"), "OSPBCR_PORTAL SQL", { size: 18, bold: false, valign: "middle" });
  styleText(S("Google Shape;1732;p38"), "App_Data JSON", { size: 18, bold: false, valign: "middle" });
  styleText(S("Google Shape;1726;p38"), "Managed uploads", { size: 18, bold: false, valign: "middle" });
  styleText(S("Google Shape;1721;p38"), "OSPBCR\nPORTAL", { size: 20, bold: true, align: "center", valign: "middle" });

  addText(slide, "Setu_Odisha: 56 tables • 61,266 rows • 144 MB  |  CMS: SQL tables + JSON and managed upload stores", { left: 75, top: 500, width: 810, height: 24 }, { size: 15, color: C.muted, align: "center", valign: "middle", name: "database-profile-caption" });
  addNotes(slide, [
    `${ROOT}/Program.cs`,
    `${ROOT}/Summary of DB/.database-summary-work/database-profile.json`,
    `${ROOT}/Services`,
    `${ROOT}/App_Data`,
    `${WEB}/uploads`,
    `${BUILD}/reference-source.pptx`,
  ], "The architecture view summarizes the local application registrations and local database profile. Counts reflect the available profile snapshot.");
}

// Slide 15 — conclusion.
{
  const slide = presentation.slides.items[14];
  const S = (name) => shapeByName(slide, name);
  styleText(S("Google Shape;1793;p43"), "15 | A digital foundation for cancer intelligence", { size: 36, bold: true, valign: "middle" });

  styleText(S("Google Shape;1797;p43"), "Accessible by design", { size: 24, bold: true, valign: "middle" });
  styleText(S("Google Shape;1794;p43"), "Reliable information, interactive maps and downloadable resources are easy to reach across Odisha.", { size: 19, bold: false });

  styleText(S("Google Shape;1798;p43"), "Data with purpose", { size: 24, bold: true, valign: "middle" });
  styleText(S("Google Shape;1795;p43"), "Registry, district and population views support awareness, research, planning and public-health action.", { size: 19, bold: false });

  styleText(S("Google Shape;1799;p43"), "Built to evolve", { size: 24, bold: true, valign: "middle" });
  styleText(S("Google Shape;1796;p43"), "Role-based publishing and structured storage make the portal manageable today and ready for future integrations.", { size: 19, bold: false });

  addText(slide, "A trusted digital platform can turn registry information into wider understanding and better decisions.", { left: 125, top: 494, width: 760, height: 22 }, { size: 16, bold: false, color: C.sage, align: "center", valign: "middle", name: "closing-statement" });
  addText(slide, "Visual theme adapted from Slidesgo; template resources credited to Flaticon and Freepik.", { left: 125, top: 520, width: 760, height: 14 }, { size: 11, bold: false, color: C.muted, align: "center", valign: "middle", name: "template-attribution" });
  addNotes(slide, [
    `${ROOT}`, 
    `${ROOT}/Program.cs`,
    `${ROOT}/Summary of DB/.database-summary-work/database-profile.json`,
    `${BUILD}/reference-source.pptx`,
  ]);
}

await fs.mkdir(PREVIEW_DIR, { recursive: true });
await fs.mkdir(LAYOUT_DIR, { recursive: true });
await fs.mkdir(path.dirname(OUTPUT), { recursive: true });

for (const [index, slide] of presentation.slides.items.entries()) {
  const stem = `slide-${String(index + 1).padStart(2, "0")}`;
  const png = await presentation.export({ slide, format: "png", scale: 1 });
  await writeBlob(`${PREVIEW_DIR}/${stem}.png`, png);
  const layout = await slide.export({ format: "layout" });
  await fs.writeFile(`${LAYOUT_DIR}/${stem}.layout.json`, await layout.text());
}

const montage = await presentation.export({ format: "webp", montage: true, scale: 1 });
await writeBlob(`${BUILD}/final-montage.webp`, montage);

const pptx = await PresentationFile.exportPptx(presentation);
await pptx.save(OUTPUT);

const inspect = await presentation.inspect({
  kind: "slide,textbox,image,table,notes,layout",
  maxChars: 200000,
});
await fs.writeFile(`${BUILD}/final-inspect.ndjson`, inspect.ndjson || "", "utf8");

console.log(OUTPUT);
