import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeElement,
  dedupe,
  cleanUrl,
  encodePlace,
  decodePlace,
  TileSource,
  SampleSource,
  PlaceFeed,
  FeedError,
} from "../js/places.js";
import { Store, safeStorage } from "../js/store.js";
import { haversineMi, M_PER_MI } from "../js/geo.js";
import { FOOD_AMENITIES } from "../js/categories.js";
import { buildTiles, dropLocalChains } from "../scripts/tiles-lib.mjs";
import { seeded, fakeStorage, makeWorld, drain, CENTER } from "./helpers.mjs";

const newStore = (disk = fakeStorage()) => new Store(safeStorage(disk));
const ids = (list) => list.map((p) => p.id).sort();

/* ---- cleaning map data ---- */

test("a map element becomes a clean place", () => {
  const p = normalizeElement({
    type: "way",
    id: 42,
    center: { lat: 34.0501234567, lon: -118.2501234567 },
    tags: {
      name: " Siam Sunset Kitchen ",
      amenity: "restaurant",
      cuisine: "thai",
      "addr:housenumber": "123",
      "addr:street": "Main St",
      "addr:city": "Culver City",
      opening_hours: "Mo-Fr 11:00-21:00",
      phone: "+1 310 555 0100; +1 310 555 0101",
      website: "siamsunset.example",
      outdoor_seating: "yes",
      takeaway: "yes",
    },
  });
  assert.equal(p.id, "w42");
  assert.equal(p.osm, "way/42");
  assert.equal(p.name, "Siam Sunset Kitchen");
  assert.equal(p.label, "Thai restaurant");
  assert.equal(p.kind, "food");
  assert.equal(p.addr, "123 Main St, Culver City");
  assert.equal(p.phone, "+1 310 555 0100");
  assert.equal(p.web, "https://siamsunset.example/");
  assert.deepEqual(p.perks, ["Outdoor seating", "Takeout"]);
  assert.equal(p.lat, 34.050123);
});

test("chains, nameless places and non-spots are dropped", () => {
  const base = { type: "node", id: 1, lat: 34, lon: -118 };
  assert.equal(normalizeElement({ ...base, tags: { amenity: "cafe" } }), null, "no name");
  assert.equal(normalizeElement({ ...base, tags: { name: "Corner Cafe", amenity: "cafe", brand: "Corner Cafe" } }), null, "brand tag");
  assert.equal(normalizeElement({ ...base, tags: { name: "X", amenity: "cafe", "brand:wikidata": "Q1" } }), null, "brand id");
  assert.equal(normalizeElement({ ...base, tags: { name: "Starbucks", amenity: "cafe" } }), null, "chain by name");
  assert.equal(normalizeElement({ ...base, tags: { name: "Quick Lube", shop: "car_repair" } }), null, "not a spot");
  assert.equal(normalizeElement({ type: "way", id: 2, tags: { name: "No Location", amenity: "cafe" } }), null, "no coordinates");
  assert.ok(normalizeElement({ ...base, tags: { name: "Corner Cafe", amenity: "cafe" } }));
});

test("only plain web links are kept", () => {
  assert.equal(cleanUrl("example.com/menu"), "https://example.com/menu");
  assert.equal(cleanUrl("http://example.com"), "http://example.com/");
  assert.equal(cleanUrl("javascript:alert(1)"), "");
  assert.equal(cleanUrl("data:text/html,hi"), "");
  assert.equal(cleanUrl(""), "");
  assert.equal(cleanUrl("https://a.example; https://b.example"), "https://a.example/");
});

test("a business mapped twice shows once, keeping the fuller listing", () => {
  const bare = normalizeElement({ type: "node", id: 1, lat: 34.05, lon: -118.25, tags: { name: "Joe's Pizza", amenity: "restaurant" } });
  const full = normalizeElement({ type: "way", id: 2, center: { lat: 34.05003, lon: -118.25002 }, tags: { name: "Joes Pizza", amenity: "restaurant", "addr:street": "Main St", opening_hours: "24/7" } });
  const other = normalizeElement({ type: "node", id: 3, lat: 34.09, lon: -118.3, tags: { name: "Joe's Pizza", amenity: "restaurant" } });
  const out = dedupe([bare, full, other, bare]);
  assert.deepEqual(ids(out), ["n3", "w2"]);
});

test("a name with several spellings keeps the first one", () => {
  const p = normalizeElement({ type: "node", id: 9, lat: 34, lon: -118, tags: { name: "Friends of the Library;Friends of the Library Bookstore", shop: "books" } });
  assert.equal(p.name, "Friends of the Library");
});

/* ---- listing files that ship with the app ---- */

// Serves the made-up town as listing files, the way the hosted app reads them.
function tileWorld(world, { deg } = {}) {
  const { index, files } = buildTiles(world.places, { deg, generated: "2026-01-01", region: "Test Town", source: "test" });
  const state = { index, files, loads: [], down: false };
  state.load = async (path) => {
    state.loads.push(path);
    if (state.down) throw Object.assign(new Error("down"), { status: 503 });
    if (path === "data/places/index.json") return JSON.parse(JSON.stringify(index));
    const m = /^data\/places\/(-?\d+\/-?\d+)\.json$/.exec(path);
    if (!m || !files.has(m[1])) throw Object.assign(new Error("missing"), { status: 404 });
    return JSON.parse(JSON.stringify(files.get(m[1])));
  };
  return state;
}

test("a place survives being written to a listing file and read back", () => {
  const full = normalizeElement({
    type: "way",
    id: 42,
    center: { lat: 34.05, lon: -118.25 },
    tags: { name: "Siam Sunset", amenity: "restaurant", cuisine: "thai", "addr:street": "Main St", opening_hours: "24/7", phone: "310 555 0100", website: "siam.example", takeaway: "yes", delivery: "yes" },
  });
  const bare = normalizeElement({ type: "node", id: 7, lat: 34.06, lon: -118.26, tags: { name: "Paper Moon", shop: "books" } });
  for (const p of [full, bare]) {
    const { cat, ...expected } = p; // the raw map category isn't needed once the label is known
    assert.deepEqual(decodePlace(JSON.parse(JSON.stringify(encodePlace(p)))), expected);
  }
  assert.equal(encodePlace(bare).length, 7, "empty details are left off the end");
});

test("listing files give back exactly the places near a point", async () => {
  const world = makeWorld({ count: 600, spreadMi: 6 });
  const tiles = tileWorld(world);
  const source = new TileSource({ load: tiles.load });
  for (const [lat, lon, radiusMi] of [[CENTER.lat, CENTER.lon, 0.5], [CENTER.lat + 0.03, CENTER.lon - 0.04, 2], [CENTER.lat, CENTER.lon, 5]]) {
    const got = await source.fetchCell(lat, lon, radiusMi * M_PER_MI);
    const want = world.places.filter((p) => haversineMi(lat, lon, p.lat, p.lon) <= radiusMi);
    assert.deepEqual(ids(got), ids(want));
  }
  assert.equal(new Set(tiles.loads).size, tiles.loads.length, "each file is read once");
  assert.equal(tiles.index.count, 600);
  assert.equal([...tiles.files.values()].reduce((n, list) => n + list.length, 0), 600, "every place is in exactly one file");
});

test("the app knows where it has listings and where it doesn't", async () => {
  const tiles = tileWorld(makeWorld({ count: 300, spreadMi: 3 }));
  const source = new TileSource({ load: tiles.load });
  assert.equal(await source.covers(CENTER.lat, CENTER.lon, 1), true);
  assert.equal(await source.covers(CENTER.lat + 0.2, CENTER.lon, 5), false, "14 miles north, searching 5");
  assert.equal(await source.covers(CENTER.lat + 0.2, CENTER.lon, 25), true, "a wide enough search reaches them");
  assert.equal(await source.covers(40.75, -73.99, 50), false, "New York");
  assert.deepEqual(await source.fetchCell(40.75, -73.99, 5000), []);
  assert.equal(source.index.region, "Test Town");
  assert.equal(source.inRegion(CENTER.lat, CENTER.lon), true);
  assert.equal(source.inRegion(CENTER.lat + 0.2, CENTER.lon), true, "just past the last listing still counts as the region");
  assert.equal(source.inRegion(40.75, -73.99), false, "New York is outside it");
});

test("a listing file that fails to load says which one, and can be retried", async () => {
  const tiles = tileWorld(makeWorld({ count: 300, spreadMi: 3 }));
  const source = new TileSource({ load: tiles.load });
  tiles.down = true;
  await assert.rejects(() => source.fetchCell(CENTER.lat, CENTER.lon, 800), (e) => e instanceof FeedError && e.detail === "the listings index answered 503");
  tiles.down = false;
  await source.ready();
  tiles.down = true;
  await assert.rejects(() => source.fetchCell(CENTER.lat, CENTER.lon, 800), (e) => e instanceof FeedError && /^listing file -?\d+\/-?\d+ answered 503$/.test(e.detail));
  tiles.down = false;
  assert.ok((await source.fetchCell(CENTER.lat, CENTER.lon, 800)).length > 0, "works again once the files load");
});

test("swiping through listing files shows every place in range exactly once", async () => {
  const world = makeWorld({ count: 700, spreadMi: 5 });
  const source = new TileSource({ load: tileWorld(world).load });
  const got = await drain(new PlaceFeed({ source, store: newStore(), center: CENTER, radiusMi: 3, kinds: ["food", "shop"], rng: seeded(9), cacheMs: 3600e3 }));
  assert.equal(new Set(got.map((p) => p.id)).size, got.length);
  assert.deepEqual(ids(got), ids(world.within(3)));
});

test("empty stretches of the map are stepped over without stalling", async () => {
  // Everything is in one neighborhood 9 miles east; the 12-mile search starts over open desert.
  const town = { lat: CENTER.lat, lon: CENTER.lon + 9 / 57.3, city: "" };
  const world = makeWorld({ count: 150, spreadMi: 1.5, center: town });
  const tiles = tileWorld(world);
  const source = new TileSource({ load: tiles.load });
  const feed = new PlaceFeed({ source, store: newStore(), center: CENTER, radiusMi: 12, kinds: ["food", "shop"], rng: seeded(4) });
  const got = await drain(feed, () => {}, { resume: false });
  assert.deepEqual(ids(got), ids(world.within(12, CENTER)), "found the far neighborhood without being asked to keep looking");
  assert.equal(feed.done, true);
  const files = new Set(tiles.loads.filter((p) => !p.endsWith("index.json")));
  assert.ok(files.size <= tiles.files.size, "only squares with listings were read");
});

test("a listing file removed by a refresh counts as empty instead of breaking the search", async () => {
  const world = makeWorld({ count: 300, spreadMi: 2 });
  const tiles = tileWorld(world);
  const [goneKey, goneRows] = [...tiles.files.entries()][0];
  tiles.files.delete(goneKey); // the index still lists this square
  const source = new TileSource({ load: tiles.load });
  const got = await drain(new PlaceFeed({ source, store: newStore(), center: CENTER, radiusMi: 2, kinds: ["food", "shop"], rng: seeded(5) }));
  const missing = new Set(goneRows.map((row) => row[0]));
  assert.deepEqual(ids(got), ids(world.within(2).filter((p) => !missing.has(p.id))));
});

test("a name with many locations is treated as a chain, except names many family shops share", () => {
  const at = (name, i) => normalizeElement({ type: "node", id: 1000 + i, lat: 34 + i / 50, lon: -118, tags: { name, amenity: "restaurant" } });
  const places = [
    ...Array.from({ length: 12 }, (_, i) => at("Mega Grill", i)),
    ...Array.from({ length: 12 }, (_, i) => at("La Michoacana", 100 + i)),
    ...Array.from({ length: 3 }, (_, i) => at("Three Sisters Cafe", 200 + i)),
    at("One Of A Kind", 300),
  ];
  const kept = dropLocalChains(places);
  assert.equal(kept.filter((p) => p.name === "Mega Grill").length, 0);
  assert.equal(kept.filter((p) => p.name === "La Michoacana").length, 12);
  assert.equal(kept.filter((p) => p.name === "Three Sisters Cafe").length, 3);
  assert.equal(kept.length, 16);
});

test("the map-file reader and the app agree on what counts as food and drink", () => {
  const py = readFileSync(new URL("../scripts/extract-places.py", import.meta.url), "utf8");
  const set = /FOOD = \{([^}]*)\}/.exec(py)[1].match(/"([a-z_]+)"/g).map((s) => s.slice(1, -1));
  assert.deepEqual([...set].sort(), [...FOOD_AMENITIES].sort());
});

/* ---- the feed: what the deck is dealt ---- */

function feedFor(world, store, extra = {}) {
  return new PlaceFeed({ source: world.source, store, center: CENTER, radiusMi: 3, kinds: ["food", "shop"], rng: seeded(3), ...extra });
}

test("swiping through an area shows every place in range exactly once", async () => {
  const world = makeWorld();
  for (const radiusMi of [0.5, 1, 3]) {
    const got = await drain(feedFor(world, newStore(), { radiusMi }));
    assert.equal(new Set(got.map((p) => p.id)).size, got.length, "no duplicates");
    assert.ok(got.every((p) => p.dist <= radiusMi), "nothing outside the radius");
    assert.deepEqual(ids(got), ids(world.within(radiusMi)), `complete at ${radiusMi} mi`);
  }
});

test("a passed place never comes back: new session, new radius, new ZIP", async () => {
  const world = makeWorld();
  const disk = fakeStorage();
  const store = newStore(disk);
  const passed = new Set();
  const saved = new Set();
  let n = 0;
  await drain(feedFor(world, store, { radiusMi: 2 }), (p) => {
    n += 1;
    if (n % 3 === 0) { store.save(p); saved.add(p.id); }
    else if (n % 3 === 1) { store.hide(p); passed.add(p.id); }
  });
  assert.ok(passed.size > 20 && saved.size > 20);

  const sessions = [
    { radiusMi: 2 },
    { radiusMi: 4 },
    { radiusMi: 3, center: { lat: CENTER.lat + 0.02, lon: CENTER.lon - 0.02, city: "" } },
  ];
  for (const extra of sessions) {
    const later = await drain(feedFor(world, newStore(disk), extra)); // newStore(disk) = app reopened
    assert.ok(later.length > 0);
    for (const p of later) {
      assert.ok(!passed.has(p.id), `${p.name} was passed and came back`);
      assert.ok(!saved.has(p.id), `${p.name} was saved and came back`);
    }
  }
});

test("undoing a pass puts the place back in play", async () => {
  const world = makeWorld({ count: 60, spreadMi: 1 });
  const store = newStore();
  const first = (await feedFor(world, store, { radiusMi: 1 }).take(1)).places[0];
  store.hide(first);
  assert.ok(!(await drain(feedFor(world, store, { radiusMi: 1 }))).some((p) => p.id === first.id));
  store.undo({ type: "pass", place: first });
  assert.ok((await drain(feedFor(world, store, { radiusMi: 1 }))).some((p) => p.id === first.id));
});

test("the food and shop filter is respected", async () => {
  const world = makeWorld();
  const food = await drain(feedFor(world, newStore(), { kinds: ["food"], radiusMi: 1 }));
  const shops = await drain(feedFor(world, newStore(), { kinds: ["shop"], radiusMi: 1 }));
  assert.ok(food.length && food.every((p) => p.kind === "food"));
  assert.ok(shops.length && shops.every((p) => p.kind === "shop"));
  assert.equal(food.length + shops.length, world.within(1).length);
});

test("a failed search is retried, not skipped", async () => {
  const world = makeWorld();
  const feed = feedFor(world, newStore(), { radiusMi: 2 });
  const got = [];
  let failures = 0;
  world.source.failEvery = 2; // every other search drops
  for (let i = 0; i < 2000; i++) {
    try {
      const { places, done, stalled } = await feed.take(10);
      got.push(...places);
      if (done) break;
      if (stalled) feed.resume();
    } catch {
      failures += 1;
    }
  }
  assert.ok(failures > 3, "the test did exercise failures");
  assert.deepEqual(ids(got), ids(world.within(2)));
});

test("nearby places come before far ones overall, with some far ones mixed in", async () => {
  const world = makeWorld({ count: 3000, spreadMi: 12, seed: 11 });
  const feed = feedFor(world, newStore(), { radiusMi: 10 });
  const first = [];
  while (first.length < 150) first.push(...(await feed.take(10)).places);
  const avg = (list) => list.reduce((s, p) => s + p.dist, 0) / list.length;
  const everything = world.within(10).map((p) => haversineMi(CENTER.lat, CENTER.lon, p.lat, p.lon));
  const overall = everything.reduce((s, d) => s + d, 0) / everything.length;
  assert.ok(avg(first) < overall * 0.75, `first cards average ${avg(first).toFixed(2)} mi vs ${overall.toFixed(2)} overall`);
  assert.ok(first.some((p) => p.dist > 4), "a wide search includes farther places early");
});

test("a wide search mixes in farther places from the very first cards", async () => {
  // A dense downtown: the closest half mile alone could fill the first sixty cards.
  const world = makeWorld({ count: 6000, spreadMi: 8, seed: 21 });
  for (const seed of [1, 2, 3, 4, 5]) {
    const feed = feedFor(world, newStore(), { radiusMi: 8, rng: seeded(seed) });
    const first = [];
    while (first.length < 30) first.push(...(await feed.take(10)).places);
    const farOnes = first.slice(0, 30).filter((p) => p.dist > 1.5).length;
    assert.ok(farOnes >= 3, `seed ${seed}: ${farOnes} of the first 30 cards were more than 1.5 miles out`);
    assert.ok(first.slice(0, 30).filter((p) => p.dist <= 1).length >= 12, `seed ${seed}: most early cards are still close by`);
  }
});

test("an empty area stops searching instead of looping forever", async () => {
  const world = makeWorld({ count: 0 });
  const feed = feedFor(world, newStore(), { radiusMi: 25 });
  const out = await feed.take(10, 500);
  assert.equal(out.places.length, 0);
  assert.equal(out.stalled, true);
  assert.ok(world.source.calls <= 28, `made ${world.source.calls} searches`);
  const paused = world.source.calls;
  feed.resume();
  await feed.take(10, 500);
  assert.ok(world.source.calls > paused, "keeps looking only when asked");
});

test("a search that finds nothing at all is told apart from a deck swiped to the end", async () => {
  const empty = feedFor(makeWorld({ count: 0 }), newStore(), { radiusMi: 0.5 });
  await drain(empty);
  assert.equal(empty.bare, true, "nothing is listed here");

  const world = makeWorld({ count: 60, spreadMi: 1 });
  const disk = fakeStorage();
  const store = newStore(disk);
  const first = feedFor(world, store, { radiusMi: 1, cacheMs: 3600e3 });
  await drain(first, (p) => {
    store.hide(p);
    first.swiped(p);
  });
  assert.equal(first.bare, false, "this session dealt cards");
  const back = feedFor(world, newStore(disk), { radiusMi: 1, cacheMs: 3600e3 });
  assert.equal((await drain(back)).length, 0);
  assert.equal(back.bare, false, "everything here was already swiped, which is not the same as nothing listed");
});

test("used-up areas are remembered, so coming back is quick", async () => {
  const world = makeWorld({ count: 500, spreadMi: 3 });
  const disk = fakeStorage();
  let clock = 1_000_000;
  const mk = () => {
    const store = new Store(safeStorage(disk), { now: () => clock });
    const feed = feedFor(world, store, { radiusMi: 2, cacheMs: 3600e3, now: () => clock });
    return { store, feed };
  };
  const one = mk();
  await drain(one.feed, (p) => {
    one.store.hide(p);
    one.feed.swiped(p);
  });
  const firstVisit = world.source.calls;
  assert.ok(firstVisit >= 5);

  clock += 2 * 86400e3; // two days later: the listing cache has expired
  world.source.calls = 0;
  const again = await drain(mk().feed);
  assert.equal(again.length, 0);
  assert.equal(world.source.calls, 0, "nothing is asked again for a fully swiped area");

  world.source.calls = 0; // a wider search looks at the edge cells again and finds the new ring
  const wider = await drain(feedFor(world, new Store(safeStorage(disk), { now: () => clock }), { radiusMi: 2.6, cacheMs: 3600e3, now: () => clock }));
  assert.deepEqual(ids(wider), ids(world.within(2.6).filter((p) => haversineMi(CENTER.lat, CENTER.lon, p.lat, p.lon) > 2)));

  clock += 30 * 86400e3; // a month later everything is checked again for new places
  world.source.calls = 0;
  await drain(mk().feed);
  assert.ok(world.source.calls >= firstVisit / 2);
});

test("undoing a swipe keeps its area open for the next visit", async () => {
  const world = makeWorld({ count: 300, spreadMi: 2 });
  const disk = fakeStorage();
  const store = newStore(disk);
  const feed = feedFor(world, store, { radiusMi: 1.5, cacheMs: 3600e3 });
  let last = null;
  await drain(feed, (p) => {
    store.hide(p);
    feed.swiped(p);
    last = p;
  });
  store.undo({ type: "pass", place: last });
  feed.unswiped(last);
  const next = await drain(feedFor(world, newStore(disk), { radiusMi: 1.5, cacheMs: 3600e3 }));
  assert.deepEqual(next.map((p) => p.id), [last.id]);
});

/* ---- preview sample cards ---- */

test("sample cards are marked, in range, and nearest first", async () => {
  globalThis.__HL_DATA__ = { "data/sample-places.json": JSON.parse(readFileSync(new URL("../data/sample-places.json", import.meta.url))) };
  const store = newStore();
  const feed = new PlaceFeed({ source: new SampleSource(), store, center: CENTER, radiusMi: 5, kinds: ["food", "shop"], rng: seeded(1) });
  const got = await drain(feed);
  assert.equal(got.length, 24);
  assert.ok(got.every((p) => p.sample && p.id.startsWith("sample-") && p.dist <= 5));
  assert.ok(got.every((p) => /sample|demo|example|placeholder/i.test(p.name)), "every sample name says it is one");
  for (let i = 1; i < got.length; i++) assert.ok(got[i].dist >= got[i - 1].dist);
  const all = await drain(new PlaceFeed({ source: new SampleSource(), store, center: CENTER, radiusMi: 50, kinds: ["food", "shop"] }));
  assert.equal(all.length, 36);
  store.hide(got[0]);
  const moved = await drain(new PlaceFeed({ source: new SampleSource(), store, center: { lat: 40.7, lon: -74, city: "New York" }, radiusMi: 5, kinds: ["food", "shop"] }));
  assert.ok(!moved.some((p) => p.id === got[0].id), "a passed sample stays passed after changing ZIP");
  delete globalThis.__HL_DATA__;
});
