// Shared by the data build and the tests: turns a list of places into listing tiles.
import { tileOf } from "../js/geo.js";
import { encodePlace } from "../js/places.js";
import { nameKey } from "../js/categories.js";

export const TILE_DEG = 0.02; // about 1.4 miles north to south

// Big chains are dropped by their brand tag. Regional chains often have none, so a name with
// this many locations in the region is treated as a chain too.
export const CHAIN_AT = 10;

// Names that many unrelated family shops share. These are not chains.
const SHARED_NAMES = new Set(
  [
    "La Michoacana", "Donuts", "Donut", "Donut Shop", "Cafeteria", "Taqueria", "Tacos", "Panaderia", "Carniceria",
    "Bakery", "Cafe", "Coffee Shop", "Restaurant", "Pizza", "Market", "Flowers", "Florist", "Gift Shop",
    "Snack Bar", "Thrift Store", "Jewelry",
  ].map(nameKey),
);

export function dropLocalChains(places, at = CHAIN_AT) {
  const tally = new Map();
  for (const p of places) tally.set(p.nk, (tally.get(p.nk) || 0) + 1);
  return places.filter((p) => tally.get(p.nk) < at || SHARED_NAMES.has(p.nk));
}

// Returns { index, files }: `files` maps "row/col" to that tile's encoded places.
export function buildTiles(places, { deg = TILE_DEG, generated, region, source }) {
  const files = new Map();
  const rows = {};
  const bbox = [90, 180, -90, -180]; // south, west, north, east
  for (const p of places) {
    const [row, col] = tileOf(p.lat, p.lon, deg);
    const key = `${row}/${col}`;
    if (!files.has(key)) {
      files.set(key, []);
      (rows[row] ||= []).push(col);
    }
    files.get(key).push(p);
    bbox[0] = Math.min(bbox[0], p.lat);
    bbox[1] = Math.min(bbox[1], p.lon);
    bbox[2] = Math.max(bbox[2], p.lat);
    bbox[3] = Math.max(bbox[3], p.lon);
  }
  for (const cols of Object.values(rows)) cols.sort((a, b) => a - b);
  // Stable order inside each file keeps refreshes small and comparable.
  for (const [key, list] of files) {
    list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    files.set(key, list.map(encodePlace));
  }
  const index = {
    v: 1,
    tile: deg,
    generated,
    region,
    source,
    count: places.length,
    bbox: bbox.map((n) => Math.round(n * 1e4) / 1e4),
    rows,
  };
  return { index, files };
}
