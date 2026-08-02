from __future__ import annotations

import json
import posixpath
import re
import zipfile
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree as ET

FOLDER = Path(r"D:\VINAY\PROJECTS\OSPBCR_PORTAL\wwwroot\assets\IMAGES_PDF_PPT_EXCEL\POPULATION PROJECTION\Odisha_Block_Population_Projection")
NS = {
    "x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "p": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def q(ns, tag):
    return f"{{{NS[ns]}}}{tag}"


def resolve(source, target):
    if target.startswith("/"):
        return target.lstrip("/")
    return posixpath.normpath(str(PurePosixPath(source).parent / target))


def relationships(zf, source):
    p = PurePosixPath(source)
    relpart = str(p.parent / "_rels" / f"{p.name}.rels")
    if relpart not in zf.namelist():
        return {}
    root = ET.fromstring(zf.read(relpart))
    return {r.attrib["Id"]: resolve(source, r.attrib["Target"]) for r in root.findall("p:Relationship", NS)}


def shared_strings(zf):
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    return ["".join((t.text or "") for t in si.iter(q("x", "t"))) for si in root.findall("x:si", NS)]


def value(cell, strings):
    t = cell.attrib.get("t")
    if t == "inlineStr":
        inline = cell.find("x:is", NS)
        return "" if inline is None else "".join((n.text or "") for n in inline.iter(q("x", "t")))
    raw = cell.findtext("x:v", default=None, namespaces=NS)
    if raw is None:
        return None
    if t == "s":
        return strings[int(raw)]
    if t in {"str", "e"}:
        return raw
    try:
        number = float(raw)
        return int(number) if number.is_integer() else number
    except ValueError:
        return raw


def main():
    result = []
    khorda_visible = []
    for path in sorted(FOLDER.glob("*.xlsx")):
        with zipfile.ZipFile(path) as zf:
            wb = ET.fromstring(zf.read("xl/workbook.xml"))
            wb_rels = relationships(zf, "xl/workbook.xml")
            overview_part = None
            for s in wb.findall("x:sheets/x:sheet", NS):
                if s.attrib.get("name") == "Block_overview":
                    overview_part = wb_rels[s.attrib[q("r", "id")]]
                    break
            sr = ET.fromstring(zf.read(overview_part))
            srels = relationships(zf, overview_part)
            tables = []
            for tp in sr.findall("x:tableParts/x:tablePart", NS):
                part = srels[tp.attrib[q("r", "id")]]
                tr = ET.fromstring(zf.read(part))
                af = tr.find("x:autoFilter", NS)
                filter_columns = []
                if af is not None:
                    for fc in af.findall("x:filterColumn", NS):
                        entry = {"colId": fc.attrib.get("colId")}
                        filters = fc.find("x:filters", NS)
                        if filters is not None:
                            entry["values"] = [f.attrib.get("val") for f in filters.findall("x:filter", NS)]
                            entry["blank"] = filters.attrib.get("blank")
                        custom = fc.find("x:customFilters", NS)
                        if custom is not None:
                            entry["custom"] = [dict(c.attrib) for c in custom.findall("x:customFilter", NS)]
                        filter_columns.append(entry)
                tables.append({
                    "part": part,
                    "name": tr.attrib.get("name"),
                    "displayName": tr.attrib.get("displayName"),
                    "ref": tr.attrib.get("ref"),
                    "columns": [c.attrib.get("name") for c in tr.findall("x:tableColumns/x:tableColumn", NS)],
                    "filter_columns": filter_columns,
                })
            result.append({"file": path.name, "tables": tables})
            if path.name == "Khorda.xlsx":
                strings = shared_strings(zf)
                for row in sr.findall("x:sheetData/x:row", NS):
                    if row.attrib.get("r") != "1" and row.attrib.get("hidden") != "1":
                        vals = [None] * 7
                        for cell in row.findall("x:c", NS):
                            match = re.match(r"([A-Z]+)", cell.attrib.get("r", ""))
                            if match and len(match.group(1)) == 1:
                                idx = ord(match.group(1)) - 65
                                if 0 <= idx < 7:
                                    vals[idx] = value(cell, strings)
                        khorda_visible.append({"row": int(row.attrib.get("r", "0")), "values": vals})
    print(json.dumps({"workbooks": result, "khorda_visible_rows": khorda_visible}, indent=2))


if __name__ == "__main__":
    main()
