// Street view photos for the details sheet (GitHub Actions, with MAPILLARY_TOKEN; never in the app).
// Finds a recent Mapillary photo facing each listed place, and renews picture links, which expire
// after about 30 days. Runs on the 1st and 15th. Writes:
//   data/street/index.json        which listing squares have street photos
//   data/street/<row>/<col>.json  { placeId: [mapillaryId, pictureUrl, photographer, year] }
//   data/street/state.json        when each place was last looked up (not used by the app)
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { decodePlace } from "../js/places.js";
import { tileOf } from "../js/geo.js";
import { streetPhoto, freshLink, Gone } from "./mapillary.mjs";

const token = process.env.MAPILLARY_TOKEN;
if (!token) throw new Error("MAPILLARY_TOKEN is not set");
const BUDGET_MS = Number(process.env.BUDGET_MIN || 300) * 60000; // stop starting new lookups after this
const RECHECK_DAYS = 180; // look again for places without a photo (or with an old pick) after this
const WORKERS = Number(process.env.WORKERS || 12);
const OUT = "data/street";
const today = new Date().toISOString().slice(0, 10);
const daysSince = (d) => (Date.now() - Date.parse(d)) / 864e5;
const started = Date.now();

const readJson = async (file, fallback) => {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
};

// Every listed place, with the listing square it lives in.
const index = await readJson("data/places/index.json", null);
if (!index) throw new Error("data/places/index.json is missing");
const places = [];
for (const [row, cols] of Object.entries(index.rows)) {
  for (const col of cols) {
    for (const r of await readJson(`data/places/${row}/${col}.json`, [])) {
      const p = decodePlace(r);
      places.push({ ...p, tile: tileOf(p.lat, p.lon, index.tile).join("/") }); // the square the app will look in
    }
  }
}

// What earlier runs found.
const state = await readJson(`${OUT}/state.json`, { checked: {} });
const picks = new Map(); // placeId -> [mapillaryId, url, credit, year]
const oldIndex = await readJson(`${OUT}/index.json`, { tiles: [] });
for (const tile of oldIndex.tiles) for (const [id, pick] of Object.entries(await readJson(`${OUT}/${tile}.json`, {}))) picks.set(id, pick);

const stats = { places: places.length, searched: 0, found: 0, renewed: 0, removed: 0, skipped: 0, errors: 0 };
const jobs = places.map((p) => async () => {
  const checked = state.checked[p.id];
  const fresh = checked && daysSince(checked) < RECHECK_DAYS;
  const pick = picks.get(p.id);
  if (fresh && !pick) return;
  if (Date.now() - started > BUDGET_MS) {
    stats.skipped += 1; // keeps its old pick (if any) until the next run
    return;
  }
  try {
    if (fresh && pick) {
      pick[1] = await freshLink(pick[0], token);
      if (!pick[1]) throw new Gone("no link");
      stats.renewed += 1;
      return;
    }
    stats.searched += 1;
    const got = await streetPhoto(p, token);
    state.checked[p.id] = today;
    if (got) {
      picks.set(p.id, [got.id, got.url, got.credit, got.taken.slice(0, 4)]);
      stats.found += 1;
    } else picks.delete(p.id);
  } catch (err) {
    if (err instanceof Gone) {
      picks.delete(p.id);
      delete state.checked[p.id]; // look for another one next time
      stats.removed += 1;
    } else {
      stats.errors += 1;
      if (stats.errors <= 5) console.log(`street: ${p.name}: ${err.message}`);
      if (stats.errors > 500) throw new Error("too many Mapillary errors, stopping without saving");
    }
  }
});

// A few lookups at a time.
let next = 0;
let done = 0;
await Promise.all(
  Array.from({ length: WORKERS }, async () => {
    while (next < jobs.length) {
      await jobs[next++]();
      if (++done % 5000 === 0) console.log(`street: ${done} of ${jobs.length} places`, JSON.stringify(stats));
    }
  }),
);

// Write the squares again from scratch (places that left the listings drop out).
const listed = new Map(places.map((p) => [p.id, p.tile]));
const byTile = new Map();
for (const [id, pick] of picks) {
  const tile = listed.get(id);
  if (!tile || !pick[1]) continue;
  if (!byTile.has(tile)) byTile.set(tile, {});
  byTile.get(tile)[id] = pick;
}
for (const id of Object.keys(state.checked)) if (!listed.has(id)) delete state.checked[id];
await rm(OUT, { recursive: true, force: true });
for (const [tile, rows] of byTile) {
  await mkdir(`${OUT}/${tile.split("/")[0]}`, { recursive: true });
  await writeFile(`${OUT}/${tile}.json`, JSON.stringify(rows));
}
await mkdir(OUT, { recursive: true });
const tiles = [...byTile.keys()].sort();
await writeFile(
  `${OUT}/index.json`,
  JSON.stringify({ v: 1, tile: index.tile, updated: today, source: "Mapillary contributors (CC BY-SA 4.0)", count: [...byTile.values()].reduce((n, t) => n + Object.keys(t).length, 0), tiles }),
);
await writeFile(`${OUT}/state.json`, JSON.stringify(state));
console.log("street: done", JSON.stringify(stats), `${tiles.length} squares with street photos`);
