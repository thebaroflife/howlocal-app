// One-time generator for data/zips/<first digit>.json
// Source: the "zipcodes" npm package (dev dependency only; nothing is fetched at runtime).
// Output shape: { "90012": [lat, lon, "City", "ST"], ... }
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import zipcodes from "zipcodes";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "data", "zips");
mkdirSync(outDir, { recursive: true });

const buckets = Array.from({ length: 10 }, () => ({}));
let kept = 0;

for (const [zip, rec] of Object.entries(zipcodes.codes)) {
  if (!/^\d{5}$/.test(zip)) continue; // skips Canadian codes
  const lat = Number(rec.latitude);
  const lon = Number(rec.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) continue;
  if (["AA", "AE", "AP"].includes(rec.state)) continue; // military mail codes, not places
  if (lat < -15 || lat > 72) continue; // outside the US and its territories
  buckets[Number(zip[0])][zip] = [
    Math.round(lat * 1000) / 1000,
    Math.round(lon * 1000) / 1000,
    String(rec.city || "").trim(),
    String(rec.state || "").trim(),
  ];
  kept += 1;
}

buckets.forEach((bucket, digit) => {
  const sorted = Object.fromEntries(Object.entries(bucket).sort(([a], [b]) => a.localeCompare(b)));
  const file = join(outDir, `${digit}.json`);
  writeFileSync(file, JSON.stringify(sorted));
  console.log(`${digit}.json  ${Object.keys(sorted).length} ZIPs`);
});
console.log(`total ${kept} ZIPs`);
