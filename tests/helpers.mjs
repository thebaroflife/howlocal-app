// Shared test helpers: a repeatable random source, a fake browser storage, and a made-up town.
import { haversineMi, destination, M_PER_MI } from "../js/geo.js";
import { normalizeElement } from "../js/places.js";

// Small seeded random number generator so every test run is identical.
export function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Behaves like window.localStorage and survives "reloads" (new Store instances) within a test.
export function fakeStorage({ quota = Infinity } = {}) {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      const size = [...map.entries()].reduce((n, [key, val]) => n + (key === k ? 0 : val.length), 0) + String(v).length;
      if (size > quota) throw new Error("QuotaExceededError");
      map.set(k, String(v));
    },
    removeItem: (k) => map.delete(k),
  };
}

export const CENTER = { lat: 34.05, lon: -118.25, city: "Los Angeles" };

const KINDS = [
  { amenity: "restaurant", cuisine: "thai" },
  { amenity: "cafe", cuisine: "coffee_shop" },
  { amenity: "fast_food", cuisine: "tacos" },
  { shop: "books" },
  { shop: "clothes" },
  { shop: "bakery" },
];

// A made-up town: `count` independent places scattered within `spreadMi` of the center.
// fetchCell answers like the real map service: everything within radiusM of the asked point.
export function makeWorld({ count = 400, spreadMi = 4, seed = 7, center = CENTER } = {}) {
  const rng = seeded(seed);
  const elements = [];
  for (let i = 0; i < count; i++) {
    const [lat, lon] = destination(center.lat, center.lon, rng() * 360, Math.sqrt(rng()) * spreadMi);
    elements.push({ type: "node", id: 1000 + i, lat, lon, tags: { name: `Place ${i}`, ...KINDS[i % KINDS.length] } });
  }
  const places = elements.map(normalizeElement);
  const source = {
    id: "world",
    wholeRadius: false,
    calls: 0,
    failEvery: 0, // when set, every Nth search fails like a dropped connection
    async fetchCell(lat, lon, radiusM) {
      source.calls += 1;
      if (source.failEvery && source.calls % source.failEvery === 0) {
        const err = new Error("offline");
        err.name = "FeedError";
        throw err;
      }
      return places.filter((p) => haversineMi(lat, lon, p.lat, p.lon) * M_PER_MI <= radiusM).map((p) => ({ ...p }));
    },
  };
  const within = (radiusMi, c = center) => places.filter((p) => haversineMi(c.lat, c.lon, p.lat, p.lon) <= radiusMi);
  return { source, places, within };
}

// Pulls places from a feed until it reports done (or stalls), like a user swiping through everything.
export async function drain(feed, onPlace = () => {}, { resume = true, limit = 5000 } = {}) {
  const got = [];
  for (let guard = 0; guard < limit; guard++) {
    const { places, done, stalled } = await feed.take(10);
    for (const p of places) {
      got.push(p);
      onPlace(p);
    }
    if (done) break;
    if (stalled) {
      if (!resume) break;
      feed.resume();
    }
  }
  return got;
}
