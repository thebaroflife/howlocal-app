// Finds listings, cleans them up, and hands them to the deck in a sensible order.
import { classify, nameKey, isChainName } from "./categories.js";
import {
  M_PER_MI,
  haversineMi,
  offsetLatLon,
  destination,
  hexToMeters,
  metersToHex,
  hexSpiral,
  tileOf,
  loadData,
} from "./geo.js";

const DAY_MS = 86400000;
const BASE_CELL_M = 800; // search-cell radius in dense areas, in meters
const STALL_AFTER = 24; // searched cells in a row with nothing new before the feed pauses
const FAR_TASTE = 5; // places borrowed at a time from a random cell farther out
const SPENT_DAYS = 14; // how long a fully swiped cell is skipped
const SAME_PLACE_MI = 0.1;

export class FeedError extends Error {
  constructor(kind, detail = "") {
    super(`Could not load places (${kind})`);
    this.name = "FeedError";
    this.kind = kind; // "network"
    this.detail = detail; // which file failed and how, for troubleshooting
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

// A Wikimedia Commons file named by the map data, from the wikimedia_commons or image tag.
export function commonsFile(t) {
  const direct = String(t.wikimedia_commons || "").trim();
  if (/^File:/i.test(direct)) return `File:${direct.slice(5).trim()}`;
  const image = String(t.image || "").trim();
  const page = /^https?:\/\/commons\.wikimedia\.org\/wiki\/(File:[^?#]+)/i.exec(image);
  if (page) return decodeURIComponent(page[1]).replace(/_/g, " ");
  const upload = /^https?:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/i.exec(image);
  if (upload) return `File:${decodeURIComponent(upload[1]).replace(/_/g, " ")}`;
  return "";
}

// Turns a raw map element into a place the app can show, or null if it should be skipped
// (no name, no location, a chain, or not a shop or food spot).
export function normalizeElement(el) {
  const t = (el && el.tags) || {};
  const name = String(t.name || "").split(";")[0].trim(); // some listings carry several spellings
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
    // Used only while building the listing files, to look up a real photo (scripts/photos.mjs).
    photoFile: commonsFile(t),
    wikidata: /^Q\d+$/.test(String(t.wikidata || "")) ? t.wikidata : "",
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

/* ---- Listing files ----
   scripts/build-places.mjs stores each place as a short list to keep the files small:
   [id, name, lat, lon, kind, group, label, address, hours, phone, website, perks, photo]
   photo is [picture URL, photographer, license] for an openly licensed photo of the place. */

const OSM_TYPES = { n: "node", w: "way", r: "relation" };

export function encodePlace(p) {
  const row = [
    p.id,
    p.name,
    p.lat,
    p.lon,
    p.kind === "food" ? "f" : "s",
    p.group,
    p.label,
    p.addr || "",
    p.hours || "",
    p.phone || "",
    p.web || "",
    (p.perks || []).join("|"),
    p.photo && p.photo.url ? [p.photo.url, p.photo.credit, p.photo.license] : "",
  ];
  while (row.length > 7 && row[row.length - 1] === "") row.pop();
  return row;
}

export function decodePlace(row) {
  const id = String(row[0]);
  return {
    id,
    osm: `${OSM_TYPES[id[0]] || "node"}/${id.slice(1)}`,
    name: row[1],
    nk: nameKey(row[1]),
    lat: row[2],
    lon: row[3],
    kind: row[4] === "f" ? "food" : "shop",
    group: row[5],
    label: row[6],
    addr: row[7] || "",
    hours: row[8] || "",
    phone: row[9] || "",
    web: row[10] || "",
    perks: row[11] ? row[11].split("|") : [],
    ...(Array.isArray(row[12]) ? { photo: { url: row[12][0], credit: row[12][1], license: row[12][2] } } : {}),
  };
}

/* ---- Listings that ship with the app ----
   The listing files in data/places are built ahead of time from OpenStreetMap (see scripts/).
   Nothing is asked of outside servers while the app runs: it only reads its own files. */

const describeFailure = (err) => (err && err.status ? `answered ${err.status}` : "couldn't be loaded");

export class TileSource {
  constructor({ base = "data/places", load = loadData } = {}) {
    this.id = "tiles";
    this.wholeRadius = false;
    this.cacheable = false; // the browser already keeps these files
    this.base = base;
    this.load = load;
    this.index = null; // which squares of the map have listings, and when they were built
    this.cols = new Map(); // row -> Set of columns
    this.tiles = new Map(); // "row/col" -> promise of that square's places
  }

  async ready() {
    if (!this.index) {
      try {
        const index = await this.load(`${this.base}/index.json`);
        if (!index || !index.rows || !index.tile) throw new Error("unreadable index");
        this.cols = new Map(Object.entries(index.rows).map(([row, cols]) => [Number(row), new Set(cols)]));
        this.index = index;
      } catch (err) {
        throw new FeedError("network", `the listings index ${describeFailure(err)}`);
      }
    }
    return this.index;
  }

  // The squares that have listings and touch a circle around a point.
  #span(lat, lon, radiusM) {
    const deg = this.index.tile;
    const dLat = radiusM / 111320;
    const dLon = radiusM / (111320 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
    const [row0, col0] = tileOf(lat - dLat, lon - dLon, deg);
    const [row1, col1] = tileOf(lat + dLat, lon + dLon, deg);
    const keys = [];
    for (let row = row0; row <= row1; row++) {
      const cols = this.cols.get(row);
      if (!cols) continue;
      for (let col = col0; col <= col1; col++) if (cols.has(col)) keys.push([row, col]);
    }
    return keys;
  }

  #tile(row, col) {
    const key = `${row}/${col}`;
    if (!this.tiles.has(key)) {
      const pending = this.load(`${this.base}/${key}.json`)
        .then((rows) => (rows || []).map(decodePlace))
        .catch((err) => {
          // A square that is gone means the listings were refreshed while the app was open:
          // it has nothing to show, and the rest of the search carries on.
          if (err && err.status === 404) return [];
          this.tiles.delete(key); // let a later try fetch it again
          throw new FeedError("network", `listing file ${key} ${describeFailure(err)}`);
        });
      this.tiles.set(key, pending);
    }
    return this.tiles.get(key);
  }

  async fetchCell(lat, lon, radiusM) {
    await this.ready();
    const lists = await Promise.all(this.#span(lat, lon, radiusM).map(([row, col]) => this.#tile(row, col)));
    const out = [];
    for (const list of lists) {
      for (const p of list) if (haversineMi(lat, lon, p.lat, p.lon) * M_PER_MI <= radiusM) out.push({ ...p });
    }
    return out;
  }

  // Quick check, with nothing to load: could any listing be within radiusM of the point?
  // Call ready() first. The feed uses this to step over empty stretches (ocean, desert) for free.
  has(lat, lon, radiusM) {
    return this.#span(lat, lon, radiusM).length > 0;
  }

  // True if there are any listings within radiusMi of the point.
  async covers(lat, lon, radiusMi) {
    await this.ready();
    return this.has(lat, lon, radiusMi * M_PER_MI);
  }

  // Whether the point is inside the listed region at all, with some slack at the edges.
  // Call ready() first.
  inRegion(lat, lon) {
    const box = this.index && this.index.bbox; // south, west, north, east
    if (!box) return true;
    const slack = 0.25;
    return lat >= box[0] - slack && lat <= box[2] + slack && lon >= box[1] - slack && lon <= box[3] + slack;
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
   Covers the search circle with a honeycomb of small cells and works outward from the center,
   one cell at a time, so every place in range is dealt exactly once. On wide searches it also
   borrows a few places at a time from random cells farther out, so a 100-mile search isn't just
   the closest few blocks. Never returns a place that was saved, passed, or already handed out. */

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
    this.emptyStreak = 0; // searches in a row that turned up nothing new
    this.done = false;
    this.owner = new Map(); // place id -> the cell that dealt it
    this.left = new Map(); // cell -> dealt places not swiped yet
    this.cellInfo = new Map();
    this.dealt = 0; // places handed out in this session
    this.known = 0; // places or cells passed over because they were already swiped

    // What this phone already learned about the area: how dense it is, and which cells are used up.
    this.areaKey = ["area", source.id, center.lat.toFixed(3), center.lon.toFixed(3), this.kinds.join("+")].join("|");
    this.area = (cacheMs && store.cacheGet(this.areaKey, 30 * DAY_MS)) || { d: 0, spent: {} };
  }

  get buffered() {
    return this.near.length + this.far.length;
  }

  // Many searches in a row found nothing new, so the outward search waits until something turns up
  // or resume() is called.
  get stalled() {
    return !this.done && this.emptyStreak >= STALL_AFTER;
  }

  // Returns up to n fresh places. `done` means the whole circle has been searched;
  // `stalled` means several searches in a row found nothing new (call resume() to keep going).
  async take(n, maxSearches = 3) {
    let searches = 0;
    while (this.buffered < n && !this.done && !this.stalled && searches < maxSearches) {
      await this.#searchNext();
      searches += 1;
    }
    // A wide search shouldn't deal only the closest blocks: keep a few farther places on hand.
    for (let tries = 0; tries < 2 && this.far.length < 3 && this.#wide && !this.done; tries++) {
      try {
        await this.#taste();
      } catch {
        break; // optional extra: the places are still reached when the search works its way out
      }
    }
    const places = [];
    while (places.length < n && this.buffered) places.push(this.#draw());
    this.dealt += places.length;
    return { places, done: this.done && !this.buffered, stalled: this.stalled && !this.buffered };
  }

  resume() {
    this.emptyStreak = 0;
  }

  // True when a finished search found no listings at all, as opposed to only places already swiped.
  get bare() {
    return this.done && !this.buffered && this.dealt === 0 && this.known === 0;
  }

  // Tell the feed a dealt place was saved or passed. Once every place a cell dealt has been
  // swiped, the cell is remembered as used up, so later visits skip it instead of asking again.
  swiped(place) {
    const key = this.owner.get(place.id);
    if (key === undefined) return;
    const left = Math.max(0, (this.left.get(key) || 0) - 1);
    this.left.set(key, left);
    // A cell that was only sampled from (see #taste) may still hold places nobody has seen.
    if (left === 0 && this.visited.has(key)) this.#markSpent(this.cellInfo.get(key));
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

  // True when the search circle is much bigger than one cell, so far-off cells are worth mixing in.
  get #wide() {
    return this.cellM > 0 && this.radiusM > this.cellM * 4;
  }

  // Borrows a few places from a random cell farther out. The cell is not marked as searched:
  // the rest of its places are dealt when the outward search reaches it.
  async #taste() {
    const cell = this.#pickFar();
    if (!cell) return;
    const [clat, clon] = offsetLatLon(this.center.lat, this.center.lon, cell.x, cell.y);
    const places = await this.#load(clat, clon, this.cellM);
    this.#accept(places, this.far, { cell, limit: FAR_TASTE });
  }

  // Searches the next cell on the way out from the center.
  async #searchNext() {
    const { lat, lon } = this.center;
    if (typeof this.source.ready === "function") await this.source.ready();

    if (!this.cellM) {
      // Small circles (and the sample source) are answered in a single search.
      if (this.source.wholeRadius || this.radiusM <= BASE_CELL_M * 1.2) {
        const places = await this.#load(lat, lon, this.radiusM);
        this.cellM = this.radiusM;
        this.done = true;
        this.#accept(places, this.near, { nearestFirst: !!this.source.wholeRadius });
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
        const home = { key: "0,0", x: 0, y: 0, inside: true };
        this.#accept(probe, this.near, { cell: home });
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
      cell = this.#nextNear();
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
    this.#accept(places, this.near, { cell });
    this.#settle(cell);
  }

  // A searched cell with nothing left to swipe is used up.
  #settle(cell) {
    if ((this.left.get(cell.key) || 0) === 0) this.#markSpent(cell);
  }

  #cell(q, r) {
    const key = `${q},${r}`;
    if (this.visited.has(key)) return null;
    const [x, y] = hexToMeters(q, r, this.cellM);
    const dist = Math.hypot(x, y);
    if (dist - this.cellM >= this.radiusM) return null; // entirely outside the circle
    if (this.#isSpent(key)) {
      this.visited.add(key);
      this.known += 1;
      return null;
    }
    if (typeof this.source.has === "function") {
      // Nothing is listed anywhere near this cell, so there is nothing to search.
      const [clat, clon] = offsetLatLon(this.center.lat, this.center.lon, x, y);
      if (!this.source.has(clat, clon, this.cellM)) {
        this.visited.add(key);
        return null;
      }
    }
    return { key, x, y, inside: dist + this.cellM <= this.radiusM };
  }

  #nextNear() {
    for (;;) {
      const step = this.spiral.next();
      if (step.done) return null;
      const cell = this.#cell(step.value[0], step.value[1]);
      if (cell) return cell;
    }
  }

  // A random cell that still has something to show, at least a fifth of the way out.
  #pickFar() {
    for (let tries = 0; tries < 12; tries++) {
      const dist = this.radiusM * (0.2 + 0.8 * this.rng()); // even by distance, so it leans toward the center
      const angle = this.rng() * 2 * Math.PI;
      const [q, r] = metersToHex(dist * Math.cos(angle), dist * Math.sin(angle), this.cellM);
      const cell = this.#cell(q, r);
      if (cell) return cell;
    }
    return null;
  }

  async #load(lat, lon, radiusM) {
    const key = [this.source.id, lat.toFixed(4), lon.toFixed(4), Math.round(radiusM), this.kinds.join("+")].join("|");
    const keep = this.cacheMs && this.source.cacheable !== false;
    if (keep) {
      const hit = this.store.cacheGet(key, this.cacheMs);
      if (hit) return hit;
    }
    const places = await this.source.fetchCell(lat, lon, radiusM, this.kinds, this.center);
    if (keep) this.store.cacheSet(key, places);
    return places;
  }

  // Filters a batch down to places that are in range, wanted, and not seen before, and queues them.
  // `cell` is the cell they came from; `limit` takes only that many, picked at random (a taste).
  // Returns how many were new.
  #accept(places, queue, { nearestFirst = false, cell = null, limit = Infinity } = {}) {
    const taste = Number.isFinite(limit);
    const fresh = [];
    for (const p of taste ? shuffle([...places], this.rng) : places) {
      if (fresh.length >= limit) break;
      const dist = haversineMi(this.center.lat, this.center.lon, p.lat, p.lon);
      if (dist > this.radiusMi) continue;
      if (!this.kinds.includes(p.kind)) continue;
      if (this.issued.has(p.id) || this.#issuedNearby(p)) continue;
      if (this.store.isSeen(p)) {
        this.known += 1;
        continue;
      }
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
    if (fresh.length) this.emptyStreak = 0;
    else if (!taste) this.emptyStreak += 1; // an empty taste says nothing about the search itself
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
