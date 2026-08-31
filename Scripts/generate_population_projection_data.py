"""Build the browser data model for the Population Projection page.

The source workbooks are never modified. This script reads the authoritative
Block worksheet from every district workbook and writes a compact, indexed
JSON file for fast filtering in the browser. The Block_overview helper sheet
is intentionally ignored because it may contain stale cached values.
"""

from __future__ import annotations

import json
import math
import posixpath
import re
import zipfile
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "wwwroot" / "assets" / "IMAGES_PDF_PPT_EXCEL" / "POPULATION PROJECTION" / "Odisha_Block_Population_Projection"
OUTPUT_PATH = ROOT / "wwwroot" / "assets" / "data" / "population-data.json"

YEARS = [2025, 2026, 2027, 2028, 2029, 2030, 2031]
AGE_GROUPS = [
    "All ages", "0-4", "5-9", "10-14", "15-19", "20-24", "25-29",
    "30-34", "35-39", "40-44", "45-49", "50-54", "55-59", "60-64",
    "65-69", "70-74", "75-79", "80+",
]
CATEGORIES = ["Overall", "Rural", "Urban", "ST", "Literate", "Illiterate"]
GENDERS = ["Male", "Female"]

MAP_KEYS = {
    "Angul": "ANUGUL",
    "Anugul": "ANUGUL",
    "Balangir": "BOLANGIR",
    "Baleshwar": "BALESWAR",
    "Bargarh": "BARAGARH",
    "Baudh": "BOUDH",
    "Bhadrak": "BHADRAK",
    "Cuttack": "CUTTACK",
    "Debagarh": "DEOGARH",
    "Dhenkanal": "DHENKANAL",
    "Gajapati": "GAJAPATI",
    "Ganjam": "GANJAM",
    "Jagatsinghapur": "JAGATSINGHPUR",
    "Jajapur": "JAJPUR",
    "Jharsuguda": "JHARSUGUDA",
    "Kalahandi": "KALAHANDI",
    "Kandhamal": "KANDHAMAL",
    "Kendrapara": "KENDRAPADA",
    "Kendujhar": "KEONJHAR",
    "Khorda": "KHURDA",
    "Koraput": "KORAPUT",
    "Malkangiri": "MALKANGIRI",
    "Mayurbhanj": "MAYURBHANJ",
    "Nabarangapur": "NABARANGPUR",
    "Nayagarh": "NAYAGARH",
    "Nuapada": "NUAPADA",
    "Puri": "PURI",
    "Rayagada": "RAYAGADA",
    "Sambalpur": "SAMBALPUR",
    "Subarnapur": "SONEPUR",
    "Sundargarh": "SUNDARGARH",
}

NS = {
    "x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "p": "http://schemas.openxmlformats.org/package/2006/relationships",
}
CELL_REF = re.compile(r"([A-Z]+)(\d+)")

YEAR_INDEX = {value: index for index, value in enumerate(YEARS)}
AGE_INDEX = {value: index for index, value in enumerate(AGE_GROUPS)}
CATEGORY_INDEX = {value: index for index, value in enumerate(CATEGORIES)}
GENDER_INDEX = {value: index for index, value in enumerate(GENDERS)}
VALUE_COUNT = len(YEARS) * len(AGE_GROUPS) * len(CATEGORIES) * len(GENDERS)


def q(namespace: str, tag: str) -> str:
    return f"{{{NS[namespace]}}}{tag}"


def relationships_part(source_part: str) -> str:
    part = PurePosixPath(source_part)
    return str(part.parent / "_rels" / f"{part.name}.rels")


def relationships(zf: zipfile.ZipFile, source_part: str) -> dict[str, str]:
    root = ET.fromstring(zf.read(relationships_part(source_part)))
    source_parent = PurePosixPath(source_part).parent
    return {
        node.attrib["Id"]: posixpath.normpath(str(source_parent / node.attrib["Target"]))
        for node in root.findall("p:Relationship", NS)
    }


def read_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    part = "xl/sharedStrings.xml"
    if part not in zf.namelist():
        return []
    root = ET.fromstring(zf.read(part))
    return [
        "".join((text.text or "") for text in item.iter(q("x", "t")))
        for item in root.findall("x:si", NS)
    ]


def cell_column(reference: str) -> int:
    match = CELL_REF.fullmatch(reference)
    if not match:
        return -1
    result = 0
    for character in match.group(1):
        result = result * 26 + ord(character) - 64
    return result


def cell_value(cell: ET.Element, shared_strings: list[str]):
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        inline = cell.find("x:is", NS)
        return "" if inline is None else "".join((text.text or "") for text in inline.iter(q("x", "t")))

    raw = cell.findtext("x:v", default=None, namespaces=NS)
    if raw is None:
        return None
    if cell_type == "s":
        return shared_strings[int(raw)]
    if cell_type in {"str", "e"}:
        return raw
    number = float(raw)
    return int(number) if number.is_integer() else number


def value_offset(year: int, age_group: str, category: str, gender: str) -> int:
    return (
        (((YEAR_INDEX[year] * len(AGE_GROUPS)) + AGE_INDEX[age_group]) * len(CATEGORIES)
        + CATEGORY_INDEX[category]) * len(GENDERS)
        + GENDER_INDEX[gender]
    )


def round_population(value: float) -> int:
    return int(math.floor(value + 0.5))


def worksheet_part(zf: zipfile.ZipFile, sheet_name: str) -> str:
    workbook = ET.fromstring(zf.read("xl/workbook.xml"))
    workbook_relationships = relationships(zf, "xl/workbook.xml")
    for sheet in workbook.findall("x:sheets/x:sheet", NS):
        if sheet.attrib.get("name") == sheet_name:
            return workbook_relationships[sheet.attrib[q("r", "id")]]
    raise ValueError(f"{sheet_name} worksheet is missing")


def read_sheet_rows(
    zf: zipfile.ZipFile,
    sheet_name: str,
    shared_strings: list[str],
) -> dict[int, dict[int, object]]:
    rows: dict[int, dict[int, object]] = {}
    with zf.open(worksheet_part(zf, sheet_name)) as source:
        for _, row in ET.iterparse(source, events=("end",)):
            if row.tag != q("x", "row"):
                continue
            row_number = int(row.attrib.get("r", "0"))
            values = {}
            for cell in row.findall("x:c", NS):
                column = cell_column(cell.attrib.get("r", ""))
                value = cell_value(cell, shared_strings)
                if column > 0 and value is not None:
                    values[column] = value
            if values:
                rows[row_number] = values
            row.clear()
    return rows


def require_number(value, path: Path, sheet: str, row: int, column: int) -> float:
    if not isinstance(value, (int, float)):
        raise ValueError(
            f"Nonnumeric population at {path.name} / {sheet} "
            f"row {row}, column {column}"
        )
    return float(value)


def district_name_from_path(path: Path) -> str:
    return re.sub(r"\d+$", "", path.stem).strip()


def read_district_overall(
    path: Path,
    rows: dict[int, dict[int, object]],
) -> list[float]:
    values = [0.0] * VALUE_COUNT
    year_row = rows.get(1, {})
    gender_row = rows.get(2, {})

    for year_index, year in enumerate(YEARS):
        base_column = 2 + year_index * 2
        if int(year_row.get(base_column, 0)) != year:
            raise ValueError(f"Unexpected District year header in {path.name}: {year}")
        for gender_index, gender in enumerate(GENDERS):
            column = base_column + gender_index
            if str(gender_row.get(column, "")).strip() != gender:
                raise ValueError(
                    f"Unexpected District gender header in {path.name}: "
                    f"row 2, column {column}"
                )
            for age_index, age_group in enumerate(AGE_GROUPS):
                row_number = 3 + age_index
                row = rows.get(row_number, {})
                if str(row.get(1, "")).strip() != age_group:
                    raise ValueError(
                        f"Unexpected District age group in {path.name}: row {row_number}"
                    )
                values[value_offset(year, age_group, "Overall", gender)] = require_number(
                    row.get(column), path, "District", row_number, column
                )
    return values


def read_workbook(path: Path) -> tuple[str, list[dict], list[float], int]:
    with zipfile.ZipFile(path) as zf:
        shared_strings = read_shared_strings(zf)
        block_rows = read_sheet_rows(zf, "Block", shared_strings)
        district_rows = read_sheet_rows(zf, "District", shared_strings)

    district_name = district_name_from_path(path)
    district_overall = read_district_overall(path, district_rows)
    block_header_rows = sorted(
        row_number
        for row_number, row in block_rows.items()
        if isinstance(row.get(1), str) and row.get(2) == YEARS[0]
    )
    if not block_header_rows:
        raise ValueError(f"No block sections found in {path.name} / Block")

    blocks = []
    district_values = [0.0] * VALUE_COUNT
    for header_row_number in block_header_rows:
        header_row = block_rows[header_row_number]
        category_row = block_rows.get(header_row_number + 1, {})
        gender_row = block_rows.get(header_row_number + 2, {})
        block_name = str(header_row[1]).strip()
        values = [0.0] * VALUE_COUNT

        for year_index, year in enumerate(YEARS):
            year_column = 2 + year_index * len(CATEGORIES) * len(GENDERS)
            if int(header_row.get(year_column, 0)) != year:
                raise ValueError(
                    f"Unexpected Block year header in {path.name} / {block_name}: {year}"
                )
            for category_index, category in enumerate(CATEGORIES):
                category_column = year_column + category_index * len(GENDERS)
                if str(category_row.get(category_column, "")).strip() != category:
                    raise ValueError(
                        f"Unexpected category in {path.name} / {block_name}: "
                        f"row {header_row_number + 1}, column {category_column}"
                    )
                for gender_index, gender in enumerate(GENDERS):
                    column = category_column + gender_index
                    if str(gender_row.get(column, "")).strip() != gender:
                        raise ValueError(
                            f"Unexpected gender in {path.name} / {block_name}: "
                            f"row {header_row_number + 2}, column {column}"
                        )
                    for age_index, age_group in enumerate(AGE_GROUPS):
                        row_number = header_row_number + 3 + age_index
                        row = block_rows.get(row_number, {})
                        if str(row.get(1, "")).strip() != age_group:
                            raise ValueError(
                                f"Unexpected age group in {path.name} / {block_name}: "
                                f"row {row_number}"
                            )
                        offset = value_offset(year, age_group, category, gender)
                        values[offset] = require_number(
                            row.get(column), path, "Block", row_number, column
                        )

        for year in YEARS:
            for age_group in AGE_GROUPS:
                for gender in GENDERS:
                    overall = values[value_offset(year, age_group, "Overall", gender)]
                    rural = values[value_offset(year, age_group, "Rural", gender)]
                    urban = values[value_offset(year, age_group, "Urban", gender)]
                    if not math.isclose(overall, rural + urban, rel_tol=1e-9, abs_tol=0.05):
                        raise ValueError(
                            f"Overall does not equal Rural + Urban in {path.name} / "
                            f"{block_name} / {year} / {age_group} / {gender}"
                        )

        for index, value in enumerate(values):
            district_values[index] += value
        blocks.append({"name": block_name, "values": [round_population(value) for value in values]})

    # District-level Overall values come from the workbook's District sheet.
    # Category-specific district values come from summing the Block sheet,
    # because the District sheet contains only Overall by age and gender.
    for year in YEARS:
        for age_group in AGE_GROUPS:
            for gender in GENDERS:
                offset = value_offset(year, age_group, "Overall", gender)
                district_values[offset] = district_overall[offset]

    rows_read = len(blocks) * VALUE_COUNT

    return district_name, blocks, district_values, rows_read


def main() -> None:
    workbook_paths = sorted(SOURCE_DIR.glob("*.xlsx"), key=lambda path: path.name.lower())
    if len(workbook_paths) != 30:
        raise ValueError(f"Expected 30 workbooks, found {len(workbook_paths)}")

    state_values = [0.0] * VALUE_COUNT
    districts = []
    total_rows = 0
    total_blocks = 0

    for path in workbook_paths:
        district_name, blocks, district_values, rows_read = read_workbook(path)
        map_key = MAP_KEYS.get(district_name)
        if not map_key:
            raise ValueError(f"No GIS district mapping configured for {district_name}")

        for index, value in enumerate(district_values):
            state_values[index] += value

        districts.append({
            "name": district_name,
            "mapKey": map_key,
            "workbook": path.name,
            "values": [round_population(value) for value in district_values],
            "blocks": blocks,
        })
        total_rows += rows_read
        total_blocks += len(blocks)

    districts.sort(key=lambda district: district["name"])
    model = {
        "version": 2,
        "source": {
            "label": "Odisha Block Population Projection workbooks",
            "worksheets": ["District", "Block"],
            "workbooks": len(workbook_paths),
            "rows": total_rows,
            "districts": len(districts),
            "districtBlockPairs": total_blocks,
            "unit": "persons",
        },
        "dimensions": {
            "years": YEARS,
            "ageGroups": AGE_GROUPS,
            "categories": CATEGORIES,
            "genders": GENDERS,
            "order": ["year", "ageGroup", "category", "gender"],
        },
        "state": {
            "name": "Odisha",
            "values": [round_population(value) for value in state_values],
        },
        "districts": districts,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(model, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(json.dumps({
        "output": str(OUTPUT_PATH),
        "bytes": OUTPUT_PATH.stat().st_size,
        "districts": len(districts),
        "districtBlockPairs": total_blocks,
        "rows": total_rows,
        "valuesPerSeries": VALUE_COUNT,
    }, indent=2))


if __name__ == "__main__":
    main()
