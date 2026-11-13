// Suggests the next 1 vs 1 matchups from the app's own listings: two places of the same kind,
// in the same city, within a mile and a bit of each other, both with an address, hours and a
// website (a good sign the listing is current). Places already posted (social/used.json) are skipped.
//   node social/suggest.mjs                 a few ideas from across the region
//   node social/suggest.mjs Pasadena        only that city
// Every suggestion still has to be checked on the web (open? facts right?) before it goes in posts.json.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePlace } from "../js/places.js";
import { haversineMi } from "../js/geo.js";

const here = dirname(fileURLToPath(import.meta.url));
const base = join(here, "..", "data", "places");
const index = JSON.parse(readFileSync(join(base, "index.json"), "utf8"));
const used = new Set((existsSync(join(here, "used.json")) ? JSON.parse(readFileSync(join(here, "used.json"), "utf8")) : []).map((u) => u.osm));
const wantCity = process.argv[2] || "";

const places = [];
for (const [row, cols] of Object.entries(index.rows)) {
  for (const col of cols) for (const r of JSON.parse(readFileSync(join(base, row, `${col}.json`), "utf8"))) places.push(decodePlace(r));
}
const city = (p) => (p.addr.includes(", ") ? p.addr.split(", ").pop() : "");
const good = places.filter((p) => p.addr && p.hours && p.web && city(p) && !used.has(p.osm) && (!wantCity || city(p) === wantCity));

const groups = new Map();
for (const p of good) {
  const key = `${city(p)}|${p.label}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(p);
}
const ideas = [];
for (const [key, list] of groups) {
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const miles = haversineMi(list[i].lat, list[i].lon, list[j].lat, list[j].lon);
      if (miles < 1.5 && list[i].nk !== list[j].nk) ideas.push({ key, a: list[i], b: list[j], miles });
    }
  }
}
// One idea per city and kind, cities spread out.
const seen = new Set();
const picks = ideas.sort(() => Math.random() - 0.5).filter((x) => !seen.has(x.key) && seen.add(x.key)).slice(0, 15);
for (const { key, a, b, miles } of picks) {
  const [c, label] = key.split("|");
  console.log(`${c}, ${label}: ${a.name} (${a.addr}) vs ${b.name} (${b.addr}), ${miles.toFixed(1)} mi apart  [${a.osm} / ${b.osm}]`);
}
if (!picks.length) console.log("No matchups found. Try another city, or none left that haven't been posted.");
