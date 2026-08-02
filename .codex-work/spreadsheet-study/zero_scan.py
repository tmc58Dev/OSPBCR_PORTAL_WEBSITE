from __future__ import annotations

import json
import posixpath
import zipfile
from collections import Counter, defaultdict
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree as ET

FOLDER = Path(r"D:\VINAY\PROJECTS\OSPBCR_PORTAL\wwwroot\assets\IMAGES_PDF_PPT_EXCEL\POPULATION PROJECTION\Odisha_Block_Population_Projection")
NS = {
    "x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "p": "http://schemas.openxmlformats.org/package/2006/relationships",
}

def q(ns, tag): return f"{{{NS[ns]}}}{tag}"

def rels(zf, source):
    p = PurePosixPath(source)
    rp = str(p.parent / "_rels" / f"{p.name}.rels")
    root = ET.fromstring(zf.read(rp))
    return {n.attrib["Id"]: posixpath.normpath(str(p.parent / n.attrib["Target"])) for n in root.findall("p:Relationship", NS)}

def strings(zf):
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    return ["".join((t.text or "") for t in si.iter(q("x", "t"))) for si in root.findall("x:si", NS)]

def value(cell, shared):
    raw = cell.findtext("x:v", default=None, namespaces=NS)
    if raw is None: return None
    if cell.attrib.get("t") == "s": return shared[int(raw)]
    try:
        n = float(raw)
        return int(n) if n.is_integer() else n
    except ValueError: return raw

totals = Counter()
by_file = Counter()
zero_blocks = defaultdict(set)
for path in sorted(FOLDER.glob("*.xlsx")):
    with zipfile.ZipFile(path) as zf:
        shared = strings(zf)
        wb = ET.fromstring(zf.read("xl/workbook.xml"))
        wb_rels = rels(zf, "xl/workbook.xml")
        part = next(wb_rels[s.attrib[q("r", "id")]] for s in wb.findall("x:sheets/x:sheet", NS) if s.attrib.get("name") == "Block_overview")
        root = ET.fromstring(zf.read(part))
        for row in root.findall("x:sheetData/x:row", NS)[1:]:
            vals = [value(c, shared) for c in row.findall("x:c", NS)[:7]]
            if len(vals) == 7 and vals[6] == 0:
                district, block, year, age, category, gender, _ = vals
                totals[("Category", category)] += 1
                totals[("Gender", gender)] += 1
                totals[("Age_Group", age)] += 1
                totals[("Year", year)] += 1
                by_file[path.name] += 1
                zero_blocks[category].add((district, block))

print(json.dumps({
    "total_zeroes": sum(by_file.values()),
    "by_category": {str(k[1]): v for k, v in totals.items() if k[0] == "Category"},
    "by_gender": {str(k[1]): v for k, v in totals.items() if k[0] == "Gender"},
    "by_year": {str(k[1]): v for k, v in totals.items() if k[0] == "Year"},
    "zero_block_counts_by_category": {k: len(v) for k, v in zero_blocks.items()},
    "st_zero_blocks": sorted([list(v) for v in zero_blocks.get("ST", set())]),
}, indent=2))
