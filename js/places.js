// Finds listings, cleans them up, and hands them to the deck in a sensible order.
import { classify, nameKey, isChainName, FOOD_AMENITIES, FOOD_SHOPS, RETAIL_SHOPS } from "./categories.js";
import {
  M_PER_MI,
  haversineMi,
  offsetLatLon,
  destination,
  hexToMeters,
  metersToHex,
  hexSpiral,
  loadData,
} from "./geo.js";

const DAY_MS = 86400000;
const BASE_CELL_M = 800; // search-cell radius in dense areas, in meters
const STALL_AFTER = 8; // searched cells in a row with nothing new
const SPENT_DAYS = 14; // how long a fully swiped cell is skipped
const SAME_PLACE_MI = 0.1;

export class FeedError extends Error {
  constructor(kind, detail = "") {
    super(`Could not load places (${kind})`);
    this.name = "FeedError";
    this.kind = kind; // "busy" | "timeout" | "network"
    this.detail = detail; // what each server said, for troubleshooting
  }
}

/* ---- Cleaning one OpenStreetMap element ---- */

// Map data is typed in by volunteers, so links are only kept if they are plain web addresses.
export function cleanUrl(raw) {
  let s = String(raw || "").trim().split(/[;\s]/)[0];
  if (!s) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
}

function address(t) {
  const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
  return [street, t["addr:city"]].filter(Boolean).join(", ");
}

function perks(t) {
  const out = [];
  if (t.outdoor_seating === "yes") out.push("Outdoor seating");
  if (t.takeaway === "yes" || t.takeaway === "only") out.push("Takeout");
  if (t.delivery === "yes") out.push("Delivery");
  if (t["diet:vegan"] === "yes" || t["diet:vegan"] === "only") out.push("Vegan options");
  else if (t["diet:vegetarian"] === "yes" || t["diet:vegetarian"] === "only") out.push("Vegetarian options");
  if (t.wheelchair === "yes") out.push("Wheelchair accessible");
  if (t.internet_access === "wlan" || t.internet_access === "yes") out.push("Wi-Fi");
  return out.slice(0, 3);
}

// Turns a raw map element into a place the app can show, or null if it should be skipped
// (no name, no location, a chain, or not a shop or food spot).
export function normalizeElement(el) {
  const t = (el && el.tags) || {};
  const name = String(t.name || "").trim();
  if (!name) return null;
  const lat = Number(el.lat ?? el.center?.lat);
  const lon = Number(el.lon ?? el.center?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (t.brand || t["brand:wikidata"] || isChainName(name)) return null;
  const c = classify(t);
  if (!c) return null;
  return {
    id: `${String(el.type || "n")[0]}${el.id}`,
    osm: `${el.type}/${el.id}`,
    name,
    nk: nameKey(name),
    lat: Math.round(lat * 1e6) / 1e6,
    lon: Math.round(lon * 1e6) / 1e6,
    kind: c.kind,
    cat: c.cat,
    group: c.group,
    label: c.label,
    addr: address(t),
    hours: String(t.opening_hours || "").trim(),
    phone: String(t.phone || t["contact:phone"] || "").split(";")[0].trim(),
    web: cleanUrl(t.website || t["contact:website"]),
    perks: perks(t),
  };
}

const richness = (p) => (p.addr ? 2 : 0) + (p.hours ? 1 : 0) + (p.web ? 1 : 0) + (p.phone ? 1 : 0);

// The same business is often mapped twice (a point and a building). Keep the fuller listing.
export function dedupe(places) {
  const byName = new Map();
  const ids = new Set();
  const out = [];
  for (const p of places) {
    if (ids.has(p.id)) continue;
    ids.add(p.id);
    const group = byName.get(p.nk) || [];
    const twin = group.find((o) => haversineMi(o.lat, o.lon, p.lat, p.lon) < SAME_PLACE_MI);
    if (!twin) {
      group.push(p);
      byName.set(p.nk, group);
      out.push(p);
    } else if (richness(p) > richness(twin)) {
      out[out.indexOf(twin)] = p;
      group[group.indexOf(twin)] = p;
    }
  }
  return out;
}

/* ---- Live source: OpenStreetMap through the public Overpass servers ---- */

export function buildQuery(lat, lon, radiusM, kinds, limit = 400) {
  const around = `(around:${Math.round(radiusM)},${lat.toFixed(5)},${lon.toFixed(5)})`;
  const independent = `["name"][!"brand"][!"brand:wikidata"]`;
  const parts = [];
  if (kinds.includes("food")) {
    parts.push(`nwr["amenity"~"^(${FOOD_AMENITIES.join("|")})$"]${independent}${around};`);
    parts.push(`nwr["shop"~"^(${FOOD_SHOPS.join("|")})$"]${independent}${around};`);
  }
  if (kinds.includes("shop")) {
    parts.push(`nwr["shop"~"^(${RETAIL_SHOPS.join("|")})$"]${independent}${around};`);
  }
  // "out center" gives points their own coordinates and gives buildings a center point.
  return `[out:json][timeout:20];(${parts.join("")});out center ${limit};`;
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return String(url);
  }
}

export class OverpassSource {
  constructor({ endpoints, timeoutMs = 25000, fetchImpl } = {}) {
    this.id = "osm";
    this.wholeRadius = false;
    this.endpoints = endpoints || [];
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl || ((...args) => fetch(...args));
    this.preferred = 0; // index of the last server that answered
  }

  async fetchCell(lat, lon, radiusM, kinds) {
    const body = `data=${encodeURIComponent(buildQuery(lat, lon, radiusM, kinds))}`;
    let kind = "network";
    const notes = []; // what each server said, shown under the error message
    for (let i = 0; i < this.endpoints.length; i++) {
      const index = (this.preferred + i) % this.endpoints.length;
      const host = hostOf(this.endpoints[index]);
      const control = new AbortController();
      const timer = setTimeout(() => control.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(this.endpoints[index], {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body,
          signal: control.signal,
        });
        if (res.status === 429 || res.status === 503 || res.status === 504) {
          kind = "busy";
          notes.push(`${host} answered ${res.status}`);
          continue;
        }
        if (!res.ok) {
          kind = "network";
          notes.push(`${host} answered ${res.status}`);
          continue;
        }
        let json = null;
        try {
          json = await res.json();
        } catch (err) {
          if (err && err.name === "AbortError") throw err;
        }
        if (!json || !Array.isArray(json.elements)) {
          kind = "network";
          notes.push(`${host} sent a reply the app couldn't read`);
          continue;
        }
        if (json.remark && !json.elements.length) {
          kind = "busy"; // the server gave up partway through
          notes.push(`${host} ran out of time`);
          continue;
        }
        this.preferred = index;
        return dedupe(json.elements.map(normalizeElement).filter(Boolean));
      } catch (err) {
        const timedOut = !!err && err.name === "AbortError";
        kind = timedOut ? "timeout" : "network";
        notes.push(`${host} ${timedOut ? "took too long" : "couldn't be reached"}`);
      } finally {
        clearTimeout(timer);
      }
    }
    throw new FeedError(kind, notes.join("; "));
  }
}

/* ---- Sample source: made-up cards for the preview that runs inside Claude ---- */

export class SampleSource {
  constructor() {
    this.id = "sample";
    this.wholeRadius = true; // answers for the whole search circle in one go
  }

  async fetchCell(_lat, _lon, _radiusM, _kinds, center) {
    const rows = (await loadData("data/sample-places.json")) || [];
    return rows
      .map((row, i) => {
        const [lat, lon] = destination(center.lat, center.lon, row.bearing, row.miles);
        const tags = { ...row.tags, name: row.name };
        if (center.city && tags["addr:street"]) tags["addr:city"] = center.city;
        const place = normalizeElement({ type: "node", id: i, lat, lon, tags });
        if (!place) return null;
        return { ...place, id: `sample-${i}`, osm: "", sample: true };
      })
      .filter(Boolean);
  }
}

/* ---- The feed ----
   Covers the search circle with a honeycomb of small cells and asks for one cell at a time:
   nearest cells first, mixed with random cells farther out, so a 50-mile search isn't just the
   closest few blocks. Never returns a place that was saved, passed, or already handed out. */

function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export class PlaceFeed {
  constructor({ source, store, center, radiusMi, kinds, rng = Math.random, cacheMs = 0, now = Date.now }) {
    this.source = source;
    this.store = store;
    this.center = center;
    this.radiusMi = radiusMi;
    this.radiusM = radiusMi * M_PER_MI;
    this.kinds = [...kinds].sort();
    this.rng = rng;
    this.cacheMs = cacheMs;
    this.now = now;

    this.near = [];
    this.far = [];
    this.issued = new Set(); // ids handed out in this session
    this.issuedNames = new Map(); // nameKey -> [[lat, lon]]
    this.visited = new Set(); // "q,r" cells already searched
    this.cellM = 0; // cell radius, set by the first search
    this.spiral = null;
    this.pending = null; // a cell whose search failed and should be retried
    this.turn = 0;
    this.emptyStreak = 0;
    this.done = false;
    this.stalled = false;
    this.owner = new Map(); // place id -> the cell that dealt it
    this.left = new Map(); // cell -> dealt places not swiped yet
    this.cellInfo = new Map();

    // What this phone already learned about the area: how dense it is, and which cells are used up.
    this.areaKey = ["area", source.id, center.lat.toFixed(3), center.lon.toFixed(3), this.kinds.join("+")].join("|");
    this.area = (cacheMs && store.cacheGet(this.areaKey, 30 * DAY_MS)) || { d: 0, spent: {} };
  }

  get buffered() {
    return this.near.length + this.far.length;
  }

  // Returns up to n fresh places. `done` means the whole circle has been searched;
  // `stalled` means several searches in a row found nothing new (call resume() to keep going).
  async take(n, maxSearches = 3) {
    let searches = 0;
    while (this.buffered < n && !this.done && !this.stalled && searches < maxSearches) {
      await this.#searchNext();
      searches += 1;
    }
    const places = [];
    while (places.length < n && this.buffered) places.push(this.#draw());
    return { places, done: this.done && !this.buffered, stalled: this.stalled && !this.buffered };
  }

  resume() {
    this.stalled = false;
    this.emptyStreak = 0;
  }

  // Tell the feed a dealt place was saved or passed. Once every place a cell dealt has been
  // swiped, the cell is remembered as used up, so later visits skip it instead of asking again.
  swiped(place) {
    const key = this.owner.get(place.id);
    if (key === undefined) return;
    const left = Math.max(0, (this.left.get(key) || 0) - 1);
    this.left.set(key, left);
    if (left === 0) this.#markSpent(this.cellInfo.get(key));
  }

  // Undo of the above.
  unswiped(place) {
    const key = this.owner.get(place.id);
    if (key === undefined) return;
    this.left.set(key, (this.left.get(key) || 0) + 1);
    if (this.area.spent[this.#spentKey(key)]) {
      delete this.area.spent[this.#spentKey(key)];
      this.#saveArea();
    }
  }

  #draw() {
    if (this.near.length && this.far.length) return (this.rng() < 0.7 ? this.near : this.far).shift();
    return (this.near.length ? this.near : this.far).shift();
  }

  async #searchNext() {
    const { lat, lon } = this.center;

    if (!this.cellM) {
      // Small circles (and the sample source) are answered in a single search.
      if (this.source.wholeRadius || this.radiusM <= BASE_CELL_M * 1.2) {
        const places = await this.#load(lat, lon, this.radiusM);
        this.cellM = this.radiusM;
        this.done = true;
        this.#accept(places, this.near, !!this.source.wholeRadius);
        return;
      }
      // First visit to this area: one small search at the center tells us how dense it is.
      let probe = null;
      if (!this.area.d) {
        probe = await this.#load(lat, lon, BASE_CELL_M);
        this.area.d = probe.length >= 30 ? BASE_CELL_M : probe.length >= 8 ? BASE_CELL_M * 2 : BASE_CELL_M * 4;
        this.#saveArea();
      }
      this.cellM = Math.min(this.radiusM, this.area.d);
      this.spiral = hexSpiral(Math.ceil((this.radiusM + this.cellM) / (this.cellM * 1.5)));
      if (probe) {
        const home = { key: "0,0", x: 0, y: 0, far: false, inside: true };
        this.#accept(probe, this.near, false, home);
        if (this.cellM === BASE_CELL_M) {
          this.spiral.next(); // the probe was cell 0,0
          this.visited.add("0,0");
          this.#settle(home);
        }
        return;
      }
    }

    let cell = this.pending;
    if (!cell) {
      const wantFar = this.radiusM > this.cellM * 4 && this.turn % 2 === 1;
      this.turn += 1;
      cell = wantFar ? this.#pickFar() : null;
      if (!cell) cell = this.#nextNear();
      if (!cell) {
        this.done = true;
        return;
      }
      this.pending = cell;
    }
    const [clat, clon] = offsetLatLon(lat, lon, cell.x, cell.y);
    const places = await this.#load(clat, clon, this.cellM);
    this.pending = null;
    this.visited.add(cell.key);
    this.#accept(places, cell.far ? this.far : this.near, false, cell);
    this.#settle(cell);
  }

  // A searched cell with nothing left to swipe is used up.
  #settle(cell) {
    if ((this.left.get(cell.key) || 0) === 0) this.#markSpent(cell);
  }

  #cell(q, r, far) {
    const key = `${q},${r}`;
    if (this.visited.has(key)) return null;
    const [x, y] = hexToMeters(q, r, this.cellM);
    const dist = Math.hypot(x, y);
    if (dist - this.cellM >= this.radiusM) return null; // entirely outside the circle
    if (this.#isSpent(key)) {
      this.visited.add(key);
      return null;
    }
    return { key, x, y, far, inside: dist + this.cellM <= this.radiusM };
  }

  #nextNear() {
    for (;;) {
      const step = this.spiral.next();
      if (step.done) return null;
      const cell = this.#cell(step.value[0], step.value[1], false);
      if (cell) return cell;
    }
  }

  #pickFar() {
    for (let tries = 0; tries < 6; tries++) {
      const dist = this.radiusM * this.rng(); // leans toward the center
      const angle = this.rng() * 2 * Math.PI;
      const [q, r] = metersToHex(dist * Math.cos(angle), dist * Math.sin(angle), this.cellM);
      const cell = this.#cell(q, r, true);
      if (cell) return cell;
    }
    return null;
  }

  async #load(lat, lon, radiusM) {
    const key = [this.source.id, lat.toFixed(4), lon.toFixed(4), Math.round(radiusM), this.kinds.join("+")].join("|");
    if (this.cacheMs) {
      const hit = this.store.cacheGet(key, this.cacheMs);
      if (hit) return hit;
    }
    const places = await this.source.fetchCell(lat, lon, radiusM, this.kinds, this.center);
    if (this.cacheMs) this.store.cacheSet(key, places);
    return places;
  }

  // Filters a batch down to places that are in range, wanted, and not seen before. Returns how many were new.
  #accept(places, queue, nearestFirst = false, cell = null) {
    const fresh = [];
    for (const p of places) {
      const dist = haversineMi(this.center.lat, this.center.lon, p.lat, p.lon);
      if (dist > this.radiusMi) continue;
      if (!this.kinds.includes(p.kind)) continue;
      if (this.issued.has(p.id) || this.#issuedNearby(p) || this.store.isSeen(p)) continue;
      this.issued.add(p.id);
      const spots = this.issuedNames.get(p.nk);
      if (spots) spots.push([p.lat, p.lon]);
      else this.issuedNames.set(p.nk, [[p.lat, p.lon]]);
      if (cell) this.owner.set(p.id, cell.key);
      fresh.push({ ...p, dist });
    }
    if (cell) {
      this.cellInfo.set(cell.key, cell);
      this.left.set(cell.key, (this.left.get(cell.key) || 0) + fresh.length);
    }
    if (nearestFirst) fresh.sort((a, b) => a.dist - b.dist);
    else shuffle(fresh, this.rng);
    queue.push(...fresh);
    this.emptyStreak = fresh.length ? 0 : this.emptyStreak + 1;
    if (this.emptyStreak >= STALL_AFTER && !this.done) this.stalled = true;
    return fresh.length;
  }

  #issuedNearby(p) {
    const spots = this.issuedNames.get(p.nk);
    return !!spots && spots.some(([lat, lon]) => haversineMi(lat, lon, p.lat, p.lon) < SAME_PLACE_MI);
  }

  #spentKey(key) {
    return `${Math.round(this.cellM)}:${key}`;
  }

  // A used-up cell is stored as [when, reach]. Reach 0 means the whole cell was inside the search
  // circle; otherwise it is the circle's radius at the time, and a wider search looks again.
  #isSpent(key) {
    const mark = this.area.spent[this.#spentKey(key)];
    if (!Array.isArray(mark) || this.now() - mark[0] >= SPENT_DAYS * DAY_MS) return false;
    return mark[1] === 0 || this.radiusM <= mark[1] + 1;
  }

  #markSpent(cell) {
    if (!cell) return;
    const cutoff = this.now() - SPENT_DAYS * DAY_MS;
    for (const [k, mark] of Object.entries(this.area.spent)) {
      if (!Array.isArray(mark) || mark[0] < cutoff) delete this.area.spent[k];
    }
    this.area.spent[this.#spentKey(cell.key)] = [this.now(), cell.inside ? 0 : Math.round(this.radiusM)];
    this.#saveArea();
  }

  #saveArea() {
    if (this.cacheMs) this.store.cacheSet(this.areaKey, this.area);
  }
}
