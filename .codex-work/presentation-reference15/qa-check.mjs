import fs from "node:fs/promises";
import path from "node:path";

const dir = "D:/VINAY/PROJECTS/OSPBCR_PORTAL/.codex-work/presentation-reference15/final-layout";
const files = (await fs.readdir(dir)).filter((name) => name.endsWith(".json")).sort();
const nonCambria = [];
const outOfBounds = [];
const textOverlaps = [];

function overlapArea(a, b) {
  const w = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  const h = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  return w * h;
}

for (const file of files) {
  const layout = JSON.parse(await fs.readFile(path.join(dir, file), "utf8"));
  const slide = layout.slide.slide;
  const width = layout.slide.frame.width;
  const height = layout.slide.frame.height;
  const textElements = (layout.elements || []).filter((element) =>
    typeof element.text === "string" && element.text.trim() && Array.isArray(element.bbox),
  );

  for (const element of textElements) {
    const face = element.resolvedTextStyle?.typeface;
    if (face && face !== "Cambria") {
      nonCambria.push({ slide, name: element.name, face, text: element.textPreview });
    }
    const [left, top, w, h] = element.bbox;
    if (left < -0.5 || top < -0.5 || left + w > width + 0.5 || top + h > height + 0.5) {
      outOfBounds.push({ slide, name: element.name, bbox: element.bbox, text: element.textPreview });
    }
  }

  for (let i = 0; i < textElements.length; i += 1) {
    for (let j = i + 1; j < textElements.length; j += 1) {
      const area = overlapArea(textElements[i].bbox, textElements[j].bbox);
      if (area > 1) {
        textOverlaps.push({ slide, a: textElements[i].name, b: textElements[j].name, area });
      }
    }
  }
}

const notesText = await fs.readFile("D:/VINAY/PROJECTS/OSPBCR_PORTAL/.codex-work/presentation-reference15/final-inspect.ndjson", "utf8");
const sourceBlocks = (notesText.match(/\[Sources\]/g) || []).length;

console.log(JSON.stringify({
  slides: files.length,
  sourceBlocks,
  nonCambriaVisibleText: nonCambria.length,
  outOfBoundsVisibleText: outOfBounds.length,
  textTextOverlaps: textOverlaps.length,
  nonCambria,
  outOfBounds,
  textOverlaps,
}, null, 2));
