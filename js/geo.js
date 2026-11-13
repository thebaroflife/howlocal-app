// Distance math, the search grid, and ZIP lookup.

export const M_PER_MI = 1609.344;
const R_EARTH_M = 6371008.8;
const SQRT3 = Math.sqrt(3);
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

export function haversineMi(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return (2 * R_EARTH_M * Math.asin(Math.min(1, Math.sqrt(a)))) / M_PER_MI;
}

// Move a point east/north by a distance in meters (accurate enough out to ~60 miles).
export function offsetLatLon(lat, lon, eastM, northM) {
  return [lat + deg(northM / R_EARTH_M), lon + deg(eastM / (R_EARTH_M * Math.cos(rad(lat))))];
}

export function destination(lat, lon, bearingDeg, miles) {
  const m = miles * M_PER_MI;
  return offsetLatLon(lat, lon, m * Math.sin(rad(bearingDeg)), m * Math.cos(rad(bearingDeg)));
}

export function formatMiles(mi) {
  if (!Number.isFinite(mi)) return "";
  if (mi < 0.1) return "Under 0.1 mi";
  if (mi < 10) return `${mi.toFixed(1)} mi`;
  return `${Math.round(mi)} mi`;
}

/* ---- Search grid ----
   The search area is covered with a honeycomb of cells. `size` is the cell radius in meters:
   circles of that radius centered on this grid leave no gaps. */

export function hexToMeters(q, r, size) {
  return [size * SQRT3 * (q + r / 2), size * 1.5 * r];
}

export function metersToHex(x, y, size) {
  const fq = ((SQRT3 / 3) * x - y / 3) / size;
  const fr = ((2 / 3) * y) / size;
  const fs = -fq - fr;
  let q = Math.round(fq);
  let r = Math.round(fr);
  const s = Math.round(fs);
  const dq = Math.abs(q - fq);
  const dr = Math.abs(r - fr);
  const ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return [q || 0, r || 0];
}

const HEX_DIRS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

// Cells in rings outward from the center: ring 0 is [0, 0], ring k has 6k cells.
export function* hexSpiral(maxRing = Infinity) {
  yield [0, 0];
  for (let k = 1; k <= maxRing; k++) {
    let q = HEX_DIRS[4][0] * k;
    let r = HEX_DIRS[4][1] * k;
    for (let side = 0; side < 6; side++) {
      for (let step = 0; step < k; step++) {
        yield [q, r];
        q += HEX_DIRS[side][0];
        r += HEX_DIRS[side][1];
      }
    }
  }
}

/* ---- Bundled data ---- */

const dataCache = new Map();

// Loads a JSON file that ships with the app.
// The single-file preview build inlines its files under globalThis.__HL_DATA__ instead.
export function loadData(path) {
  if (!dataCache.has(path)) {
    const inline = globalThis.__HL_DATA__;
    let pending;
    if (inline && path in inline) pending = Promise.resolve(inline[path]);
    else if (inline) pending = Promise.resolve(null);
    else {
      pending = fetch(path).then((res) => {
        if (!res.ok) throw new Error(`Could not load ${path}`);
        return res.json();
      });
    }
    dataCache.set(
      path,
      pending.catch((err) => {
        dataCache.delete(path);
        throw err;
      }),
    );
  }
  return dataCache.get(path);
}

// Returns { zip, lat, lon, city, state }, or null when the ZIP isn't in the table.
// Throws an error with code "not-bundled" when this build doesn't carry that part of the table.
export async function lookupZip(zip) {
  if (!/^\d{5}$/.test(zip)) return null;
  const table = await loadData(`data/zips/${zip[0]}.json`);
  if (table === null) {
    const err = new Error("ZIP table not bundled");
    err.code = "not-bundled";
    throw err;
  }
  const row = table[zip];
  if (!row) return null;
  return { zip, lat: row[0], lon: row[1], city: row[2] || "", state: row[3] || "" };
}
