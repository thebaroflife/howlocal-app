"""Pulls named shops and food spots out of an OpenStreetMap extract (.osm.pbf).

Usage:
    pip install osmium
    python scripts/extract-places.py region.osm.pbf raw-places.jsonl

Writes one JSON object per line: {"type", "id", "lat", "lon", "tags"}.
This step only narrows millions of map objects down to candidates. Which of them the app
shows, and how they are labeled, is decided by scripts/build-places.mjs with the app's own rules.
"""
import json
import sys

import osmium

FOOD = {"restaurant", "cafe", "fast_food", "bar", "pub", "ice_cream", "biergarten"}

# The only tags the app reads.
KEEP = (
    "name",
    "amenity",
    "shop",
    "cuisine",
    "brand",
    "brand:wikidata",
    "wikidata",
    "wikimedia_commons",
    "image",
    "addr:housenumber",
    "addr:street",
    "addr:city",
    "opening_hours",
    "phone",
    "contact:phone",
    "website",
    "contact:website",
    "outdoor_seating",
    "takeaway",
    "delivery",
    "diet:vegan",
    "diet:vegetarian",
    "wheelchair",
    "internet_access",
)


def main(src, out):
    kept = 0
    # with_locations() remembers every point's coordinates so buildings can be given a center.
    processor = (
        osmium.FileProcessor(src)
        .with_locations(storage="sparse_mem_array")
        .with_filter(osmium.filter.KeyFilter("amenity", "shop"))
    )
    with open(out, "w", encoding="utf-8") as f:
        for obj in processor:
            if obj.is_node():
                if not obj.location.valid():
                    continue
                kind, lat, lon = "node", obj.location.lat, obj.location.lon
            elif obj.is_way():
                points = [(n.location.lat, n.location.lon) for n in obj.nodes if n.location.valid()]
                if not points:
                    continue
                lats = [p[0] for p in points]
                lons = [p[1] for p in points]
                kind, lat, lon = "way", (min(lats) + max(lats)) / 2, (min(lons) + max(lons)) / 2
            else:
                continue

            tags = {tag.k: tag.v for tag in obj.tags}
            if not tags.get("name"):
                continue
            if tags.get("amenity") not in FOOD and "shop" not in tags:
                continue

            record = {
                "type": kind,
                "id": obj.id,
                "lat": round(lat, 6),
                "lon": round(lon, 6),
                "tags": {key: tags[key] for key in KEEP if key in tags},
            }
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
            kept += 1
    print(f"extract-places: wrote {kept} candidate places to {out}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: python scripts/extract-places.py region.osm.pbf raw-places.jsonl")
    main(sys.argv[1], sys.argv[2])
