from __future__ import annotations

import json
import math
import struct
from pathlib import Path
import argparse


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
SOURCE = REPOSITORY_ROOT / "App_Data" / "GIS files NHM"
OUTPUT = REPOSITORY_ROOT / "wwwroot" / "assets" / "data" / "nhm-gis"


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


def polygon_geometry(parts, tolerance):
    rings = []
    for part in parts:
        ring = simplify_ring(part, tolerance)
        if not ring and tolerance:
            # Very small but valid source polygons can collapse at the web-map
            # simplification tolerance. Preserve their original geometry.
            ring = simplify_ring(part, 0)
        rings.append(ring)
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
    global SOURCE, OUTPUT
    parser = argparse.ArgumentParser(description="Convert the NHM shapefiles to browser-ready GeoJSON.")
    parser.add_argument("source", nargs="?", type=Path, default=SOURCE)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    arguments = parser.parse_args()
    SOURCE = arguments.source.resolve()
    OUTPUT = arguments.output.resolve()

    required_files = [
        "district boundary.dbf", "district boundary.shp",
        "block boundary.dbf", "block boundary.shp",
        "subcentre odisha.dbf", "subcentre odisha.shp",
        "medical facility.dbf", "medical facility.shp"
    ]
    missing_files = [name for name in required_files if not (SOURCE / name).is_file()]
    if missing_files:
        raise FileNotFoundError(f"Missing NHM GIS source files in {SOURCE}: {', '.join(missing_files)}")

    OUTPUT.mkdir(parents=True, exist_ok=True)
    for stale_village_file in OUTPUT.glob("villages-*.geojson"):
        stale_village_file.unlink()

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

    metadata = {
        "source": "GIS files NHM",
        "counts": {
            "districts": len(districts),
            "blocks": len(blocks),
            "subcentres": len(subcentres),
            "medicalFacilities": len(medical_facilities)
        }
    }
    write_json(OUTPUT / "index.json", metadata)
    print(json.dumps(metadata["counts"], indent=2))


if __name__ == "__main__":
    main()
