from __future__ import annotations

import json
import math
import re
import statistics
import zipfile
from collections import Counter, defaultdict
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree as ET


FOLDER = Path(r"D:\VINAY\PROJECTS\OSPBCR_PORTAL\wwwroot\assets\IMAGES_PDF_PPT_EXCEL\POPULATION PROJECTION\Odisha_Block_Population_Projection")
OUTPUT = Path(r"D:\VINAY\PROJECTS\OSPBCR_PORTAL\.codex-work\spreadsheet-study\analysis.json")

NS = {
    "x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "p": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def q(ns: str, tag: str) -> str:
    return f"{{{NS[ns]}}}{tag}"


def resolve_part(source_part: str, target: str) -> str:
    if target.startswith("/"):
        return target.lstrip("/")
    return str(PurePosixPath(source_part).parent.joinpath(target))


def rels_part(part: str) -> str:
    p = PurePosixPath(part)
    return str(p.parent / "_rels" / f"{p.name}.rels")


def read_xml(zf: zipfile.ZipFile, part: str) -> ET.Element:
    return ET.fromstring(zf.read(part))


def read_relationships(zf: zipfile.ZipFile, source_part: str) -> dict[str, str]:
    rp = rels_part(source_part)
    if rp not in zf.namelist():
        return {}
    root = read_xml(zf, rp)
    return {
        node.attrib["Id"]: resolve_part(source_part, node.attrib["Target"])
        for node in root.findall("p:Relationship", NS)
        if "Id" in node.attrib and "Target" in node.attrib
    }


def shared_strings(zf: zipfile.ZipFile) -> list[str]:
    part = "xl/sharedStrings.xml"
    if part not in zf.namelist():
        return []
    root = read_xml(zf, part)
    values = []
    for si in root.findall("x:si", NS):
        values.append("".join((t.text or "") for t in si.iter(q("x", "t"))))
    return values


CELL_RE = re.compile(r"([A-Z]+)(\d+)")


def col_number(cell_ref: str) -> int:
    m = CELL_RE.fullmatch(cell_ref)
    if not m:
        return -1
    n = 0
    for ch in m.group(1):
        n = n * 26 + ord(ch) - 64
    return n


def cell_value(cell: ET.Element, strings: list[str]):
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        inline = cell.find("x:is", NS)
        return "" if inline is None else "".join((t.text or "") for t in inline.iter(q("x", "t")))
    v = cell.find("x:v", NS)
    raw = None if v is None else v.text
    if raw is None:
        return None
    if cell_type == "s":
        try:
            return strings[int(raw)]
        except (ValueError, IndexError):
            return raw
    if cell_type in {"str", "e"}:
        return raw
    if cell_type == "b":
        return raw == "1"
    try:
        number = float(raw)
        return int(number) if number.is_integer() else number
    except ValueError:
        return raw


def sheet_metadata(zf: zipfile.ZipFile, part: str) -> dict:
    root = read_xml(zf, part)
    dim = root.find("x:dimension", NS)
    auto_filter = root.find("x:autoFilter", NS)
    merge_cells = root.find("x:mergeCells", NS)
    validations = root.find("x:dataValidations", NS)
    pane = root.find("x:sheetViews/x:sheetView/x:pane", NS)
    sheet_view = root.find("x:sheetViews/x:sheetView", NS)
    hidden_rows = 0
    hidden_cols = []
    formula_count = 0
    error_count = 0
    error_values = Counter()
    styled_cells = Counter()
    cell_count = 0
    for row in root.findall("x:sheetData/x:row", NS):
        if row.attrib.get("hidden") == "1":
            hidden_rows += 1
        for cell in row.findall("x:c", NS):
            cell_count += 1
            if cell.attrib.get("s") is not None:
                styled_cells[cell.attrib.get("s")] += 1
            if cell.find("x:f", NS) is not None:
                formula_count += 1
            if cell.attrib.get("t") == "e":
                error_count += 1
                v = cell.find("x:v", NS)
                error_values[None if v is None else v.text] += 1
    cols = root.find("x:cols", NS)
    if cols is not None:
        for col in cols.findall("x:col", NS):
            if col.attrib.get("hidden") == "1":
                hidden_cols.append({"min": int(col.attrib["min"]), "max": int(col.attrib["max"])})
    validation_items = []
    if validations is not None:
        for dv in validations.findall("x:dataValidation", NS):
            validation_items.append({
                "type": dv.attrib.get("type"),
                "sqref": dv.attrib.get("sqref"),
                "formula1": (dv.findtext("x:formula1", default=None, namespaces=NS)),
                "formula2": (dv.findtext("x:formula2", default=None, namespaces=NS)),
            })
    rels = read_relationships(zf, part)
    table_parts = []
    for tp in root.findall("x:tableParts/x:tablePart", NS):
        rid = tp.attrib.get(q("r", "id"))
        target = rels.get(rid)
        if target and target in zf.namelist():
            tr = read_xml(zf, target)
            table_parts.append({
                "name": tr.attrib.get("name"),
                "displayName": tr.attrib.get("displayName"),
                "ref": tr.attrib.get("ref"),
                "totalsRowShown": tr.attrib.get("totalsRowShown"),
                "autoFilter": (tr.find("x:autoFilter", NS).attrib.get("ref") if tr.find("x:autoFilter", NS) is not None else None),
                "columns": [c.attrib.get("name") for c in tr.findall("x:tableColumns/x:tableColumn", NS)],
            })
    return {
        "part": part,
        "dimension": None if dim is None else dim.attrib.get("ref"),
        "cell_count": cell_count,
        "formula_count": formula_count,
        "error_count": error_count,
        "error_values": dict(error_values),
        "merged_ranges": [] if merge_cells is None else [m.attrib.get("ref") for m in merge_cells.findall("x:mergeCell", NS)],
        "data_validations": validation_items,
        "auto_filter": None if auto_filter is None else auto_filter.attrib.get("ref"),
        "tables": table_parts,
        "hidden_rows": hidden_rows,
        "hidden_columns": hidden_cols,
        "freeze_pane": None if pane is None else dict(pane.attrib),
        "show_grid_lines": None if sheet_view is None else sheet_view.attrib.get("showGridLines", "1") != "0",
        "style_id_counts": dict(styled_cells),
    }


def parse_block_overview(zf: zipfile.ZipFile, part: str, strings: list[str]) -> dict:
    headers = []
    unique_ordered = defaultdict(list)
    unique_seen = defaultdict(set)
    blanks = Counter()
    type_counts = defaultdict(Counter)
    rows = 0
    row_keys = set()
    duplicate_keys = 0
    full_rows = set()
    duplicate_full_rows = 0
    block_counts = Counter()
    population_values = []
    nonnumeric_population = Counter()
    first_row = None
    last_row = None
    header_style_ids = {}
    max_row_number = 0

    with zf.open(part) as source:
        for event, elem in ET.iterparse(source, events=("end",)):
            if elem.tag != q("x", "row"):
                continue
            row_number = int(elem.attrib.get("r", "0"))
            max_row_number = max(max_row_number, row_number)
            values = [None] * 7
            for cell in elem.findall("x:c", NS):
                ref = cell.attrib.get("r", "")
                col = col_number(ref)
                if 1 <= col <= 7:
                    values[col - 1] = cell_value(cell, strings)
                    if row_number == 1:
                        header_style_ids[ref] = cell.attrib.get("s")
            if row_number == 1:
                headers = values
            elif any(v is not None for v in values):
                rows += 1
                if first_row is None:
                    first_row = values.copy()
                last_row = values.copy()
                for i, value in enumerate(values):
                    header = headers[i] if i < len(headers) and headers[i] is not None else f"Column_{i+1}"
                    if value is None or value == "":
                        blanks[header] += 1
                    else:
                        type_counts[header][type(value).__name__] += 1
                        normalized = value
                        if normalized not in unique_seen[header]:
                            unique_seen[header].add(normalized)
                            unique_ordered[header].append(normalized)
                key = tuple(values[:6])
                if key in row_keys:
                    duplicate_keys += 1
                else:
                    row_keys.add(key)
                full = tuple(values)
                if full in full_rows:
                    duplicate_full_rows += 1
                else:
                    full_rows.add(full)
                if values[1] is not None:
                    block_counts[str(values[1])] += 1
                pop = values[6]
                if isinstance(pop, (int, float)) and not isinstance(pop, bool):
                    population_values.append(float(pop))
                elif pop is not None:
                    nonnumeric_population[str(pop)] += 1
            elem.clear()

    district_values = unique_ordered.get("District", [])
    block_values = unique_ordered.get("Block", [])
    year_values = unique_ordered.get("Year", [])
    age_values = unique_ordered.get("Age_Group", [])
    category_values = unique_ordered.get("Category", [])
    gender_values = unique_ordered.get("Gender", [])
    expected_per_block = len(year_values) * len(age_values) * len(category_values) * len(gender_values)
    incomplete_blocks = {
        block: count
        for block, count in block_counts.items()
        if expected_per_block and count != expected_per_block
    }
    expected_total = len(block_values) * expected_per_block

    return {
        "headers": headers,
        "header_style_ids": header_style_ids,
        "data_rows": rows,
        "max_row_number": max_row_number,
        "first_row": first_row,
        "last_row": last_row,
        "unique_values": dict(unique_ordered),
        "unique_counts": {k: len(v) for k, v in unique_ordered.items()},
        "blank_counts": dict(blanks),
        "type_counts": {k: dict(v) for k, v in type_counts.items()},
        "duplicate_key_rows": duplicate_keys,
        "duplicate_full_rows": duplicate_full_rows,
        "block_row_counts": dict(block_counts),
        "expected_rows_per_block_from_observed_options": expected_per_block,
        "expected_total_rows_from_observed_options": expected_total,
        "incomplete_blocks": incomplete_blocks,
        "nonnumeric_population": dict(nonnumeric_population),
        "population": {
            "count": len(population_values),
            "min": min(population_values) if population_values else None,
            "max": max(population_values) if population_values else None,
            "sum": math.fsum(population_values),
            "negative_count": sum(1 for v in population_values if v < 0),
            "zero_count": sum(1 for v in population_values if v == 0),
            "mean": statistics.fmean(population_values) if population_values else None,
        },
        "district_values": district_values,
    }


def analyze_file(path: Path) -> dict:
    with zipfile.ZipFile(path) as zf:
        strings = shared_strings(zf)
        workbook_root = read_xml(zf, "xl/workbook.xml")
        workbook_rels = read_relationships(zf, "xl/workbook.xml")
        sheets = []
        overview_part = None
        for index, node in enumerate(workbook_root.findall("x:sheets/x:sheet", NS)):
            name = node.attrib.get("name")
            rid = node.attrib.get(q("r", "id"))
            part = workbook_rels.get(rid)
            meta = sheet_metadata(zf, part) if part else {"part": None}
            item = {
                "index": index,
                "name": name,
                "state": node.attrib.get("state", "visible"),
                **meta,
            }
            sheets.append(item)
            if name == "Block_overview":
                overview_part = part
        defined_names = []
        dn_root = workbook_root.find("x:definedNames", NS)
        if dn_root is not None:
            for dn in dn_root.findall("x:definedName", NS):
                defined_names.append({
                    "name": dn.attrib.get("name"),
                    "localSheetId": dn.attrib.get("localSheetId"),
                    "hidden": dn.attrib.get("hidden"),
                    "formula": dn.text,
                })
        overview = parse_block_overview(zf, overview_part, strings) if overview_part else None
        return {
            "file": path.name,
            "size_bytes": path.stat().st_size,
            "zip_entries": len(zf.namelist()),
            "shared_string_count": len(strings),
            "sheets": sheets,
            "defined_names": defined_names,
            "block_overview": overview,
        }


def main():
    files = sorted(FOLDER.glob("*.xlsx"), key=lambda p: p.name.lower())
    workbooks = [analyze_file(path) for path in files]
    union_options = defaultdict(list)
    union_seen = defaultdict(set)
    option_sets_by_file = defaultdict(dict)
    total_rows = 0
    all_blocks = []
    for wb in workbooks:
        ov = wb["block_overview"]
        if not ov:
            continue
        total_rows += ov["data_rows"]
        all_blocks.extend(ov["unique_values"].get("Block", []))
        for header, values in ov["unique_values"].items():
            option_sets_by_file[header][wb["file"]] = values
            for value in values:
                marker = (type(value).__name__, str(value))
                if marker not in union_seen[header]:
                    union_seen[header].add(marker)
                    union_options[header].append(value)
    option_variations = {}
    for header, by_file in option_sets_by_file.items():
        canonical = None
        groups = defaultdict(list)
        for filename, values in by_file.items():
            marker = json.dumps(values, ensure_ascii=False, sort_keys=False)
            groups[marker].append(filename)
            if canonical is None:
                canonical = values
        option_variations[header] = [
            {"values": json.loads(marker), "files": names}
            for marker, names in groups.items()
        ]
    sheet_signatures = Counter()
    overview_signatures = Counter()
    for wb in workbooks:
        sheet_signatures[tuple((s["name"], s["state"], s.get("dimension")) for s in wb["sheets"])] += 1
        ov_sheet = next((s for s in wb["sheets"] if s["name"] == "Block_overview"), {})
        overview_signatures[(
            tuple(wb["block_overview"]["headers"]) if wb["block_overview"] else None,
            tuple((t["name"], t["ref"], tuple(t["columns"])) for t in ov_sheet.get("tables", [])),
            tuple(m for m in ov_sheet.get("merged_ranges", [])),
            tuple((v["type"], v["sqref"], v["formula1"]) for v in ov_sheet.get("data_validations", [])),
        )] += 1
    block_duplicates = [name for name, count in Counter(all_blocks).items() if count > 1]
    result = {
        "folder": str(FOLDER),
        "file_count": len(files),
        "total_block_overview_data_rows": total_rows,
        "union_options": dict(union_options),
        "union_option_counts": {k: len(v) for k, v in union_options.items()},
        "option_variations": option_variations,
        "total_distinct_block_names": len(set(all_blocks)),
        "duplicate_block_names_across_districts": block_duplicates,
        "sheet_signature_count": len(sheet_signatures),
        "overview_signature_count": len(overview_signatures),
        "workbooks": workbooks,
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "file_count": result["file_count"],
        "total_rows": total_rows,
        "union_option_counts": result["union_option_counts"],
        "total_distinct_block_names": result["total_distinct_block_names"],
        "duplicate_block_names_across_districts": block_duplicates,
        "sheet_signature_count": result["sheet_signature_count"],
        "overview_signature_count": result["overview_signature_count"],
        "analysis_path": str(OUTPUT),
    }, indent=2))


if __name__ == "__main__":
    main()
