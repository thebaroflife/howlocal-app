import test from "node:test";
import assert from "node:assert/strict";
import { dropClosed } from "../scripts/closed.mjs";
import { nameKey } from "../js/categories.js";

const spot = (id, name, lat, lon) => ({ id, osm: `node/${id.slice(1)}`, name, nk: nameKey(name), lat, lon });

test("hand-checked closures are dropped by listing id", () => {
  const places = [spot("n1", "106 Seafood Underground", 33.9396, -118.3505), spot("n2", "New Pizza 8", 33.935, -118.3434)];
  const { kept, dropped } = dropClosed(places, { overrides: [{ osm: "n1", why: "closed" }] });
  assert.deepEqual(kept.map((p) => p.id), ["n2"]);
  assert.equal(dropped[0].place.id, "n1");
});

test("Overture closures match by name within a short walk only", () => {
  const places = [
    spot("n1", "Lucky Corner Cafe", 34.1, -118.1),
    spot("n2", "Lucky Corner Cafe", 34.2, -118.1), // same name, 7 miles away: stays
    spot("n3", "Sunny Tacos", 34.1001, -118.1001), // different name nearby: stays
    spot("n4", "The Golden Spoon Diner", 34.3, -118.3),
    ...Array.from({ length: 20 }, (_, i) => spot(`n${10 + i}`, `Filler ${i}`, 35 + i, -119)),
  ];
  const closed = [
    { name: "Lucky Corner Cafe", lat: 34.1002, lon: -118.1001, status: "permanently_closed" },
    { name: "Golden Spoon Diner", lat: 34.3003, lon: -118.3, status: "temporarily_closed" },
  ];
  const { kept, dropped } = dropClosed(places, { closed });
  assert.deepEqual(dropped.map((d) => d.place.id).sort(), ["n1", "n4"]);
  assert.ok(kept.some((p) => p.id === "n2") && kept.some((p) => p.id === "n3"));
  assert.match(dropped.find((d) => d.place.id === "n4").why, /temporarily closed/);
});

test("an implausible number of Overture matches is ignored", () => {
  const places = Array.from({ length: 10 }, (_, i) => spot(`n${i}`, `Spot Number ${i}`, 34 + i * 0.1, -118));
  const closed = places.slice(0, 5).map((p) => ({ name: p.name, lat: p.lat, lon: p.lon, status: "permanently_closed" }));
  const { kept, dropped, ignoredOverture } = dropClosed(places, { closed, overrides: [{ osm: "n9", why: "closed" }] });
  assert.equal(ignoredOverture, 5);
  assert.deepEqual(dropped.map((d) => d.place.id), ["n9"]);
  assert.equal(kept.length, 9);
});
