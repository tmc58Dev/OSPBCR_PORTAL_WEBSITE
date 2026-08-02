from __future__ import annotations

import json
import math
import re
import struct
from collections import Counter, defaultdict
from pathlib import Path


SOURCE = Path(r"D:\VINAY\PROJECTS\OSPBCR_PORTAL\.codex-work\gis-source\GIS files NHM")
OUTPUT = Path(r"D:\VINAY\PROJECTS\OSPBCR_PORTAL\wwwroot\assets\data\nhm-gis")


def read_dbf(path: Path):
    with path.open("rb") as stream:
        header = stream.read(32)
        record_count = struct.unpack("<I", header[4:8])[0]
        header_length, record_length = struct.unpack("<HH", header[8:12])
        fields = []

        while stream.tell() < header_length - 1:
            descriptor = stream.read(32)
            if not descriptor or descriptor[0] == 0x0D:
                break
            name = descriptor[:11].split(b"\0", 1)[0].decode("latin1")
            fields.append((name, chr(descriptor[11]), descriptor[16], descriptor[17]))

        stream.seek(header_length)
        rows = []
        for _ in range(record_count):
            record = stream.read(record_length)
            if len(record) < record_length:
                break
            if record[:1] == b"*":
                rows.append(None)
                continue

            position = 1
            row = {}
            for name, field_type, size, decimals in fields:
                raw_value = record[position:position + size]
                position += size
                text_value = raw_value.decode("cp1252", "replace").strip()

                if field_type in {"N", "F"} and text_value:
                    try:
                        value = float(text_value) if decimals else int(text_value)
                    except ValueError:
                        value = text_value
                else:
                    value = text_value
                row[name] = value
            rows.append(row)
        return rows


def read_shapes(path: Path):
    with path.open("rb") as stream:
        header = stream.read(100)
        shape_type = struct.unpack("<i", header[32:36])[0]

        while True:
            record_header = stream.read(8)
            if len(record_header) < 8:
                break
            _, length_words = struct.unpack(">2i", record_header)
            content = stream.read(length_words * 2)
            if len(content) < 4:
                yield None
                continue

            record_type = struct.unpack("<i", content[:4])[0]
            if record_type == 0:
                yield None
            elif record_type == 1:
                x, y = struct.unpack("<2d", content[4:20])
                yield {"type": "Point", "coordinates": [x, y]}
            elif record_type == 5:
                number_of_parts, number_of_points = struct.unpack("<2i", content[36:44])
                parts_offset = 44
                points_offset = parts_offset + number_of_parts * 4
                starts = list(struct.unpack(
                    f"<{number_of_parts}i",
                    content[parts_offset:points_offset]
                ))
                starts.append(number_of_points)
                points = [
                    list(struct.unpack("<2d", content[points_offset + index * 16:points_offset + (index + 1) * 16]))
                    for index in range(number_of_points)
                ]
                yield [points[starts[index]:starts[index + 1]] for index in range(number_of_parts)]
            else:
                raise ValueError(f"Unsupported shape type {record_type} in {path.name} (file type {shape_type})")


def perpendicular_distance(point, start, end):
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    if dx == 0 and dy == 0:
        return math.hypot(point[0] - start[0], point[1] - start[1])
    numerator = abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0])
    return numerator / math.hypot(dx, dy)


def simplify_line(points, tolerance):
    if len(points) <= 2:
        return points
    start, end = points[0], points[-1]
    maximum_distance = 0
    split_index = 0
    for index in range(1, len(points) - 1):
        distance = perpendicular_distance(points[index], start, end)
        if distance > maximum_distance:
            maximum_distance = distance
            split_index = index
    if maximum_distance > tolerance:
        first = simplify_line(points[:split_index + 1], tolerance)
        second = simplify_line(points[split_index:], tolerance)
        return first[:-1] + second
    return [start, end]


def simplify_ring(ring, tolerance):
    if len(ring) < 4:
        return None
    if ring[0] == ring[-1]:
        ring = ring[:-1]
    if len(ring) < 3:
        return None

    # Rotate away from a coincident start/end before applying Douglas-Peucker.
    anchor = min(range(len(ring)), key=lambda index: (ring[index][0], ring[index][1]))
    rotated = ring[anchor:] + ring[:anchor]
    simplified = simplify_line(rotated + [rotated[0]], tolerance)
    if simplified[0] != simplified[-1]:
        simplified.append(simplified[0])
    if len(simplified) < 4:
        return None
    return [[round(point[0], 5), round(point[1], 5)] for point in simplified]


def signed_area(ring):
    return sum(
        ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1]
        for index in range(len(ring) - 1)
    ) / 2


def point_in_ring(point, ring):
    x, y = point
    inside = False
    previous = ring[-1]
    for current in ring:
        x1, y1 = previous
        x2, y2 = current
        if (y1 > y) != (y2 > y):
            crossing_x = (x2 - x1) * (y - y1) / (y2 - y1) + x1
            if x < crossing_x:
                inside = not inside
        previous = current
    return inside


def parts_bounds(parts):
    xs = [point[0] for part in parts for point in part]
    ys = [point[1] for part in parts for point in part]
    return min(xs), min(ys), max(xs), max(ys)


def point_in_parts(point, parts):
    return sum(1 for ring in parts if point_in_ring(point, ring)) % 2 == 1


def representative_points(parts):
    largest_ring = max(parts, key=len)
    min_x, min_y, max_x, max_y = parts_bounds(parts)
    mean_x = sum(point[0] for point in largest_ring[:-1]) / max(1, len(largest_ring) - 1)
    mean_y = sum(point[1] for point in largest_ring[:-1]) / max(1, len(largest_ring) - 1)
    first, second = largest_ring[0], largest_ring[1]
    return [
        [mean_x, mean_y],
        [(min_x + max_x) / 2, (min_y + max_y) / 2],
        [(first[0] + second[0]) / 2, (first[1] + second[1]) / 2]
    ]


def spatial_match(parts, candidates):
    points = representative_points(parts)
    for candidate in candidates:
        min_x, min_y, max_x, max_y = candidate["bounds"]
        if not any(min_x <= point[0] <= max_x and min_y <= point[1] <= max_y for point in points):
            continue
        if any(point_in_parts(point, candidate["parts"]) for point in points):
            return candidate
    return None


def polygon_geometry(parts, tolerance):
    rings = [simplify_ring(part, tolerance) for part in parts]
    rings = [ring for ring in rings if ring]
    if not rings:
        return None

    exteriors = [ring for ring in rings if signed_area(ring) < 0]
    holes = [ring for ring in rings if signed_area(ring) >= 0]

    if not exteriors:
        largest = max(rings, key=lambda ring: abs(signed_area(ring)))
        exteriors = [largest]
        holes = [ring for ring in rings if ring is not largest]

    polygons = [[exterior] for exterior in exteriors]
    for hole in holes:
        containing = [
            (index, abs(signed_area(exterior)))
            for index, exterior in enumerate(exteriors)
            if point_in_ring(hole[0], exterior)
        ]
        if containing:
            polygon_index = min(containing, key=lambda item: item[1])[0]
            polygons[polygon_index].append(hole)
        else:
            polygons.append([hole])

    if len(polygons) == 1:
        return {"type": "Polygon", "coordinates": polygons[0]}
    return {"type": "MultiPolygon", "coordinates": polygons}


def slugify(value):
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def feature_collection(features):
    return {"type": "FeatureCollection", "features": features}


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as stream:
        json.dump(value, stream, ensure_ascii=False, separators=(",", ":"))


def convert_layer(name, property_names, tolerance=0):
    rows = read_dbf(SOURCE / f"{name}.dbf")
    shapes = list(read_shapes(SOURCE / f"{name}.shp"))
    features = []
    for row, shape in zip(rows, shapes):
        if not row or not shape:
            continue
        geometry = shape if isinstance(shape, dict) else polygon_geometry(shape, tolerance)
        if not geometry:
            continue
        properties = {key: row.get(key, "") for key in property_names}
        features.append({"type": "Feature", "properties": properties, "geometry": geometry})
    return features


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)

    districts = convert_layer("district boundary", ["DISTRICT", "CODE"], tolerance=0.00045)
    blocks = convert_layer("block boundary", ["T_CODE", "T_NAME", "DISTRICT"], tolerance=0.00035)
    subcentres = convert_layer("subcentre odisha", ["D_NAME", "BLOCK", "SUBCENTER", "CODE"])
    medical_facilities = convert_layer(
        "medical facility",
        ["DIST_NAME", "BLOCK_NAME", "MED_CATEGO", "LOCATION", "INST"]
    )

    write_json(OUTPUT / "districts.geojson", feature_collection(districts))
    write_json(OUTPUT / "blocks.geojson", feature_collection(blocks))
    write_json(OUTPUT / "subcentres.geojson", feature_collection(subcentres))
    write_json(OUTPUT / "medical-facilities.geojson", feature_collection(medical_facilities))

    block_lookup = {
        str(feature["properties"]["T_CODE"]).zfill(6): {
            "district": str(feature["properties"]["DISTRICT"]).strip(),
            "block": str(feature["properties"]["T_NAME"]).strip()
        }
        for feature in blocks
    }
    block_rows = read_dbf(SOURCE / "block boundary.dbf")
    block_shapes = list(read_shapes(SOURCE / "block boundary.shp"))
    spatial_blocks = [
        {
            "district": str(row.get("DISTRICT", "")).strip(),
            "block": str(row.get("T_NAME", "")).strip(),
            "parts": parts,
            "bounds": parts_bounds(parts)
        }
        for row, parts in zip(block_rows, block_shapes)
        if row and parts
    ]
    district_rows = read_dbf(SOURCE / "district boundary.dbf")
    district_shapes = list(read_shapes(SOURCE / "district boundary.shp"))
    spatial_districts = [
        {
            "district": str(row.get("DISTRICT", "")).strip(),
            "block": "",
            "parts": parts,
            "bounds": parts_bounds(parts)
        }
        for row, parts in zip(district_rows, district_shapes)
        if row and parts
    ]
    village_rows = read_dbf(SOURCE / "village layer.dbf")
    village_shapes = read_shapes(SOURCE / "village layer.shp")
    villages_by_district = defaultdict(list)
    unmatched = Counter()

    for row, parts in zip(village_rows, village_shapes):
        if not row or not parts:
            continue
        local_code = str(row.get("LCODE", "")).strip()
        block_info = block_lookup.get(local_code[:6])
        if not block_info:
            matched_area = spatial_match(parts, spatial_blocks) or spatial_match(parts, spatial_districts)
            if matched_area:
                block_info = {
                    "district": matched_area["district"],
                    "block": matched_area["block"]
                }
            else:
                unmatched[local_code[:6] or "missing"] += 1
                continue
        geometry = polygon_geometry(parts, tolerance=0.00018)
        if not geometry:
            continue
        district = block_info["district"]
        villages_by_district[district].append({
            "type": "Feature",
            "properties": {
                "LCODE": local_code,
                "LOCATION": row.get("LOCATION", ""),
                "V_TYPE": row.get("V_TYPE", ""),
                "BLOCK": block_info["block"],
                "DISTRICT": district
            },
            "geometry": geometry
        })

    district_files = {}
    for district, features in sorted(villages_by_district.items()):
        filename = f"villages-{slugify(district)}.geojson"
        write_json(OUTPUT / filename, feature_collection(features))
        district_files[district] = {"file": filename, "count": len(features)}

    metadata = {
        "source": "GIS files NHM.rar",
        "counts": {
            "districts": len(districts),
            "blocks": len(blocks),
            "villages": sum(len(features) for features in villages_by_district.values()),
            "subcentres": len(subcentres),
            "medicalFacilities": len(medical_facilities),
            "unmatchedVillages": sum(unmatched.values())
        },
        "villageFiles": district_files
    }
    write_json(OUTPUT / "index.json", metadata)
    print(json.dumps(metadata["counts"], indent=2))
    if unmatched:
        print("Unmatched village block prefixes:", dict(unmatched.most_common()))


if __name__ == "__main__":
    main()
