import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeElement,
  dedupe,
  buildQuery,
  cleanUrl,
  OverpassSource,
  SampleSource,
  PlaceFeed,
  FeedError,
} from "../js/places.js";
import { Store, safeStorage } from "../js/store.js";
import { haversineMi } from "../js/geo.js";
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

test("the map query asks for independent, named places near a point", () => {
  const q = buildQuery(34.05, -118.25, 800, ["food", "shop"]);
  assert.ok(q.startsWith("[out:json][timeout:20];("));
  assert.ok(q.includes('["name"][!"brand"][!"brand:wikidata"](around:800,34.05000,-118.25000);'));
  assert.ok(q.includes('nwr["amenity"~"^(restaurant|cafe|fast_food|bar|pub|ice_cream|biergarten)$"]'));
  assert.ok(q.includes("books") && q.includes("bakery"));
  assert.ok(q.endsWith(");out center 400;"));
  const foodOnly = buildQuery(34.05, -118.25, 800, ["food"]);
  assert.ok(!foodOnly.includes("books") && foodOnly.includes("bakery"));
  const shopOnly = buildQuery(34.05, -118.25, 800, ["shop"]);
  assert.ok(!shopOnly.includes("amenity") && shopOnly.includes("books") && !shopOnly.includes("bakery"));
});

/* ---- talking to the map servers ---- */

const reply = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const cafe = (id, name) => ({ type: "node", id, lat: 34.05, lon: -118.25 + id / 1000, tags: { name, amenity: "cafe" } });

test("a busy server is skipped and the next one is used", async () => {
  const seen = [];
  const source = new OverpassSource({
    endpoints: ["https://one.example/api", "https://two.example/api"],
    fetchImpl: async (url, init) => {
      seen.push([url, init]);
      return url.includes("one") ? reply(429, {}) : reply(200, { elements: [cafe(1, "Cafe Uno"), cafe(2, "Cafe Dos")] });
    },
  });
  const places = await source.fetchCell(34.05, -118.25, 800, ["food"]);
  assert.equal(places.length, 2);
  assert.equal(seen.length, 2);
  assert.equal(seen[1][1].method, "POST");
  assert.ok(decodeURIComponent(seen[1][1].body).startsWith("data=[out:json]"));
  await source.fetchCell(34.05, -118.25, 800, ["food"]);
  assert.ok(seen[2][0].includes("two"), "remembers which server answered");
});

test("when no server answers, the error says why", async () => {
  const busy = new OverpassSource({ endpoints: ["https://one.example", "https://two.example"], fetchImpl: async (url) => reply(url.includes("one") ? 504 : 429, {}) });
  await assert.rejects(
    () => busy.fetchCell(34, -118, 800, ["food"]),
    (e) => e instanceof FeedError && e.kind === "busy" && e.detail === "one.example answered 504; two.example answered 429",
  );
  const rejected = new OverpassSource({ endpoints: ["https://one.example"], fetchImpl: async () => reply(400, {}) });
  await assert.rejects(() => rejected.fetchCell(34, -118, 800, ["food"]), (e) => e.kind === "network" && e.detail === "one.example answered 400");
  const garbled = new OverpassSource({ endpoints: ["https://one.example"], fetchImpl: async () => ({ status: 200, ok: true, json: async () => { throw new SyntaxError("not json"); } }) });
  await assert.rejects(() => garbled.fetchCell(34, -118, 800, ["food"]), (e) => e.kind === "network" && /couldn't read/.test(e.detail));
  const down = new OverpassSource({ endpoints: ["https://one.example"], fetchImpl: async () => { throw new TypeError("Failed to fetch"); } });
  await assert.rejects(() => down.fetchCell(34, -118, 800, ["food"]), (e) => e.kind === "network");
  const slow = new OverpassSource({
    endpoints: ["https://one.example"],
    timeoutMs: 20,
    fetchImpl: (_url, { signal }) =>
      new Promise((_, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))),
  });
  await assert.rejects(() => slow.fetchCell(34, -118, 800, ["food"]), (e) => e.kind === "timeout");
  const gaveUp = new OverpassSource({ endpoints: ["https://one.example"], fetchImpl: async () => reply(200, { elements: [], remark: "runtime error: Query timed out" }) });
  await assert.rejects(() => gaveUp.fetchCell(34, -118, 800, ["food"]), (e) => e.kind === "busy");
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

test("an empty area stops searching instead of looping forever", async () => {
  const world = makeWorld({ count: 0 });
  const feed = feedFor(world, newStore(), { radiusMi: 25 });
  const out = await feed.take(10, 50);
  assert.equal(out.places.length, 0);
  assert.equal(out.stalled, true);
  assert.ok(world.source.calls <= 9, `made ${world.source.calls} searches`);
  feed.resume();
  await feed.take(10, 50);
  assert.ok(world.source.calls > 9, "keeps looking only when asked");
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
