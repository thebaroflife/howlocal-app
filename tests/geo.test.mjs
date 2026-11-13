import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  haversineMi,
  destination,
  formatMiles,
  hexToMeters,
  metersToHex,
  hexSpiral,
  lookupZip,
  M_PER_MI,
} from "../js/geo.js";
import { seeded } from "./helpers.mjs";

test("distance between two known Los Angeles points is right", () => {
  // City Hall to the Santa Monica Pier is a little under 15 miles in a straight line.
  const mi = haversineMi(34.0537, -118.2428, 34.01, -118.496);
  assert.ok(mi > 14.6 && mi < 15.0, `got ${mi}`);
});

test("moving a point by N miles lands N miles away", () => {
  for (const [bearing, miles] of [[0, 1], [90, 10], [200, 25], [315, 50]]) {
    const [lat, lon] = destination(34.05, -118.25, bearing, miles);
    const back = haversineMi(34.05, -118.25, lat, lon);
    assert.ok(Math.abs(back - miles) / miles < 0.01, `bearing ${bearing}: ${back} vs ${miles}`);
  }
});

test("miles are written the way people read them", () => {
  assert.equal(formatMiles(0.04), "Under 0.1 mi");
  assert.equal(formatMiles(0.84), "0.8 mi");
  assert.equal(formatMiles(9.96), "10.0 mi");
  assert.equal(formatMiles(23.4), "23 mi");
  assert.equal(formatMiles(NaN), "");
});

test("grid cells convert to meters and back", () => {
  for (let q = -6; q <= 6; q++) {
    for (let r = -6; r <= 6; r++) {
      const [x, y] = hexToMeters(q, r, 800);
      assert.deepEqual(metersToHex(x, y, 800), [q, r]);
    }
  }
});

test("the spiral visits each cell once, ring by ring", () => {
  const cells = [...hexSpiral(3)];
  assert.equal(cells.length, 1 + 6 + 12 + 18);
  assert.equal(new Set(cells.map((c) => c.join(","))).size, cells.length);
  assert.deepEqual(cells[0], [0, 0]);
  // ring 1 cells are exactly one cell-spacing from the center
  for (const [q, r] of cells.slice(1, 7)) {
    const [x, y] = hexToMeters(q, r, 800);
    assert.ok(Math.abs(Math.hypot(x, y) - 800 * Math.sqrt(3)) < 1e-6);
  }
});

test("search cells leave no gaps inside the radius", () => {
  const rng = seeded(42);
  const size = 800;
  for (const radiusMi of [1, 3, 7]) {
    const radiusM = radiusMi * M_PER_MI;
    const maxRing = Math.ceil((radiusM + size) / (size * 1.5));
    const centers = [...hexSpiral(maxRing)]
      .map(([q, r]) => hexToMeters(q, r, size))
      .filter(([x, y]) => Math.hypot(x, y) - size < radiusM);
    for (let i = 0; i < 4000; i++) {
      const d = Math.sqrt(rng()) * radiusM;
      const a = rng() * 2 * Math.PI;
      const px = d * Math.cos(a);
      const py = d * Math.sin(a);
      const covered = centers.some(([x, y]) => Math.hypot(px - x, py - y) <= size + 1e-6);
      assert.ok(covered, `uncovered point at ${px.toFixed(0)}, ${py.toFixed(0)} for ${radiusMi} mi`);
    }
  }
});

test("ZIP lookup reads the bundled table", async () => {
  const table = JSON.parse(readFileSync(new URL("../data/zips/9.json", import.meta.url)));
  globalThis.__HL_DATA__ = { "data/zips/9.json": table };
  const hit = await lookupZip("90012");
  assert.equal(hit.city, "Los Angeles");
  assert.equal(hit.state, "CA");
  assert.ok(Math.abs(hit.lat - 34.06) < 0.05 && Math.abs(hit.lon + 118.24) < 0.05);
  assert.equal(await lookupZip("99999"), null, "unknown ZIP");
  assert.equal(await lookupZip("9001"), null, "too short");
  assert.equal(await lookupZip("abcde"), null, "not digits");
  await assert.rejects(() => lookupZip("10001"), (err) => err.code === "not-bundled");
  delete globalThis.__HL_DATA__;
});

test("every ZIP file is complete and well formed", () => {
  let total = 0;
  for (let d = 0; d <= 9; d++) {
    const table = JSON.parse(readFileSync(new URL(`../data/zips/${d}.json`, import.meta.url)));
    for (const [zip, row] of Object.entries(table)) {
      assert.match(zip, new RegExp(`^${d}\\d{4}$`));
      assert.ok(row[0] >= -15 && row[0] <= 72 && row[1] >= -180 && row[1] <= 180, `${zip} has odd coordinates`);
      assert.ok(!["AA", "AE", "AP"].includes(row[3]), `${zip} is a military mail code`);
      total += 1;
    }
  }
  assert.ok(total > 40000, `only ${total} ZIPs`);
});
