"""Build the browser data model for the Population Projection page.

The source workbooks are never modified. This script reads the normalized
Block_overview worksheet from every district workbook and writes a compact,
indexed JSON file for fast filtering in the browser.
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


def block_overview_part(zf: zipfile.ZipFile) -> str:
    workbook = ET.fromstring(zf.read("xl/workbook.xml"))
    workbook_relationships = relationships(zf, "xl/workbook.xml")
    for sheet in workbook.findall("x:sheets/x:sheet", NS):
        if sheet.attrib.get("name") == "Block_overview":
            return workbook_relationships[sheet.attrib[q("r", "id")]]
    raise ValueError("Block_overview worksheet is missing")


def read_workbook(path: Path) -> tuple[str, list[dict], list[float], int]:
    with zipfile.ZipFile(path) as zf:
        shared_strings = read_shared_strings(zf)
        sheet_part = block_overview_part(zf)
        block_values: dict[str, list[float]] = {}
        block_offsets: dict[str, set[int]] = {}
        district_name = ""
        rows_read = 0

        with zf.open(sheet_part) as source:
            for _, row in ET.iterparse(source, events=("end",)):
                if row.tag != q("x", "row"):
                    continue
                row_number = int(row.attrib.get("r", "0"))
                if row_number == 1:
                    row.clear()
                    continue

                values = [None] * 7
                for cell in row.findall("x:c", NS):
                    column = cell_column(cell.attrib.get("r", ""))
                    if 1 <= column <= 7:
                        values[column - 1] = cell_value(cell, shared_strings)

                if any(value is not None for value in values):
                    district, block, year, age_group, category, gender, population = values
                    if not all((district, block, year, age_group, category, gender)):
                        raise ValueError(f"Incomplete filter key at {path.name} row {row_number}")
                    if not isinstance(population, (int, float)):
                        raise ValueError(f"Nonnumeric population at {path.name} row {row_number}")

                    district_name = str(district)
                    block_name = str(block)
                    data = block_values.setdefault(block_name, [0.0] * VALUE_COUNT)
                    populated_offsets = block_offsets.setdefault(block_name, set())
                    offset = value_offset(int(year), str(age_group), str(category), str(gender))
                    if offset in populated_offsets:
                        raise ValueError(f"Duplicate filter key at {path.name} row {row_number}")
                    data[offset] = float(population)
                    populated_offsets.add(offset)
                    rows_read += 1
                row.clear()

    district_values = [0.0] * VALUE_COUNT
    blocks = []
    for name, values in block_values.items():
        if len(block_offsets[name]) != VALUE_COUNT:
            raise ValueError(
                f"Unexpected populated value count for {district_name} / {name}: "
                f"{len(block_offsets[name])} of {VALUE_COUNT}"
            )
        for index, value in enumerate(values):
            district_values[index] += value
        blocks.append({"name": name, "values": [round_population(value) for value in values]})

    expected_rows = len(blocks) * VALUE_COUNT
    if rows_read != expected_rows:
        raise ValueError(f"{path.name}: expected {expected_rows} rows but read {rows_read}")

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
        "version": 1,
        "source": {
            "label": "Odisha Block Population Projection workbooks",
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
