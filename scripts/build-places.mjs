// Turns the raw candidates from extract-places.py into the listing files the app reads:
//   data/places/index.json            what is covered and when it was built
//   data/places/<row>/<col>.json      the places in one small square of the map
//
// Usage: node scripts/build-places.mjs raw-places.jsonl [data/places] ["Region name"]
//
// The app's own rules decide what is kept (js/places.js and js/categories.js):
// named, independent shops and food spots, with chains and duplicates removed.
import { createReadStream, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { normalizeElement, dedupe } from "../js/places.js";
import { buildTiles, dropLocalChains, CHAIN_AT, TILE_DEG } from "./tiles-lib.mjs";
import { addPhotos } from "./photos.mjs";
import { dropClosed } from "./closed.mjs";

const [src, outDir = "data/places", region = "California"] = process.argv.slice(2);
if (!src) {
  console.error('usage: node scripts/build-places.mjs raw-places.jsonl [data/places] ["Region name"]');
  process.exit(1);
}

let read = 0;
const kept = [];
const lines = createInterface({ input: createReadStream(src, "utf8"), crlfDelay: Infinity });
for await (const line of lines) {
  if (!line.trim()) continue;
  read += 1;
  let element;
  try {
    element = JSON.parse(line);
  } catch {
    continue;
  }
  const place = normalizeElement(element);
  if (place) kept.push(place);
}

const unique = dedupe(kept);
const chainless = dropLocalChains(unique);

// Closed spots: the hand-checked list, plus Overture's closed places when CLOSED_FILE is given.
const readJson = (file, fallback) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
};
const overture = process.env.CLOSED_FILE ? readJson(process.env.CLOSED_FILE, null) : null;
if (process.env.CLOSED_FILE && !overture) console.warn("build-places: no Overture closed list; using the hand-checked list only");
const shut = dropClosed(chainless, {
  overrides: readJson("data/closed-overrides.json", []),
  closed: (overture && overture.closed) || [],
});
const places = shut.kept;
console.log(
  `build-places: dropped ${shut.dropped.length} closed places` +
    (overture ? ` (Overture ${overture.release})` : "") +
    (shut.ignoredOverture ? `; ignored ${shut.ignoredOverture} Overture matches as too many` : ""),
);
for (const d of shut.dropped.slice(0, 15)) console.log(`  closed: ${d.place.name} (${d.why})`);

// Real photos, when the map data links a place to an openly licensed one (PHOTOS=1, in GitHub Actions).
let withPhotos = 0;
if (process.env.PHOTOS === "1") {
  try {
    withPhotos = await addPhotos(places);
  } catch (err) {
    console.warn(`build-places: photo lookup stopped (${err.message}); building without photos`);
  }
}
const { index, files } = buildTiles(places, {
  deg: TILE_DEG,
  generated: new Date().toISOString().slice(0, 10),
  region,
  source: "OpenStreetMap contributors (ODbL), from a Geofabrik extract",
});

// A build that finds almost nothing means the download or the extract went wrong: keep the old files.
if (places.length < 200 && !process.env.ALLOW_SMALL) {
  console.error(`build-places: only ${places.length} places found; refusing to replace the listings.`);
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
let biggest = 0;
let bytes = 0;
for (const [key, list] of files) {
  const [row, col] = key.split("/");
  mkdirSync(join(outDir, row), { recursive: true });
  const body = JSON.stringify(list);
  writeFileSync(join(outDir, row, `${col}.json`), body);
  biggest = Math.max(biggest, body.length);
  bytes += body.length;
}
writeFileSync(join(outDir, "index.json"), JSON.stringify(index));

const kinds = { food: 0, shop: 0 };
for (const p of places) kinds[p.kind] += 1;
console.log(`build-places: ${read} candidates read`);
console.log(`build-places: ${kept.length} passed the app's rules, ${unique.length} after removing duplicates`);
console.log(`build-places: ${unique.length - places.length} more dropped as regional chains (${CHAIN_AT}+ locations), leaving ${places.length}`);
console.log(`build-places: ${kinds.food} food and drink, ${kinds.shop} shops`);
console.log(`build-places: ${withPhotos} with a real photo (${places.filter((p) => p.photoFile).length} linked to one)`);
console.log(`build-places: ${files.size} tiles, ${(bytes / 1048576).toFixed(1)} MB total, largest ${(biggest / 1024).toFixed(0)} KB`);
console.log(`build-places: covers ${index.bbox.join(", ")} (south, west, north, east)`);
