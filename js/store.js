// Everything the app remembers on this phone: the saved list, the hidden list, settings, and a small cache.
import { haversineMi } from "./geo.js";

const KEY = {
  settings: "hl.settings",
  saved: "hl.saved",
  hidden: "hl.hidden",
  cacheIndex: "hl.cache.index",
  cache: "hl.cache.",
};
const SAME_PLACE_MI = 0.1; // same name within ~160 m counts as the same business
const MAX_CACHE_ENTRIES = 40;
const round5 = (n) => Math.round(n * 1e5) / 1e5;

// localStorage with a safety net: if the browser refuses storage, values live in memory for the session.
export function safeStorage(candidate) {
  let ls = null;
  try {
    ls = candidate ?? globalThis.localStorage;
    ls.setItem("hl.probe", "1");
    ls.removeItem("hl.probe");
  } catch {
    ls = null;
  }
  const mem = new Map();
  return {
    persistent: !!ls,
    get(key) {
      try {
        const raw = ls ? ls.getItem(key) : mem.get(key);
        return raw == null ? null : JSON.parse(raw);
      } catch {
        return null;
      }
    },
    set(key, value) {
      const raw = JSON.stringify(value);
      if (!ls) {
        mem.set(key, raw);
        return true;
      }
      try {
        ls.setItem(key, raw);
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      try {
        if (ls) ls.removeItem(key);
        else mem.delete(key);
      } catch {
        /* nothing to do */
      }
    },
  };
}

export class Store {
  constructor(storage = safeStorage(), { now = Date.now } = {}) {
    this.storage = storage;
    this.persistent = storage.persistent;
    this.now = now;
    this.saved = new Map(); // id -> place, plus savedAt
    this.hidden = new Map(); // id -> [id, nameKey, lat, lon]
    for (const p of storage.get(KEY.saved) || []) if (p && p.id) this.saved.set(p.id, p);
    for (const t of storage.get(KEY.hidden) || []) if (Array.isArray(t) && t[0]) this.hidden.set(t[0], t);
    this.#reindex();
  }

  /* ---- settings ---- */

  get settings() {
    return this.storage.get(KEY.settings);
  }

  setSettings(settings) {
    this.storage.set(KEY.settings, settings);
  }

  /* ---- saved and hidden ---- */

  get savedCount() {
    return this.saved.size;
  }

  get hiddenCount() {
    return this.hidden.size;
  }

  savedList() {
    return [...this.saved.values()].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  }

  // True if this business was already saved or hidden, by id or by same name at the same spot.
  isSeen(place) {
    if (this.saved.has(place.id) || this.hidden.has(place.id)) return true;
    const spots = this.names.get(place.nk);
    if (!spots) return false;
    return spots.some(([lat, lon]) => haversineMi(lat, lon, place.lat, place.lon) < SAME_PLACE_MI);
  }

  save(place) {
    const { dist, ...rest } = place;
    this.saved.set(place.id, { ...rest, savedAt: this.now() });
    this.#index(place.nk, place.lat, place.lon);
    this.#persistSaved();
  }

  hide(place) {
    this.hidden.set(place.id, [place.id, place.nk, round5(place.lat), round5(place.lon)]);
    this.#index(place.nk, place.lat, place.lon);
    this.#persistHidden();
  }

  // Removing a saved place also hides it, so it doesn't come back into the deck.
  unsave(id) {
    const place = this.saved.get(id);
    if (!place) return null;
    this.saved.delete(id);
    this.hidden.set(id, [id, place.nk, round5(place.lat), round5(place.lon)]);
    this.#persistSaved();
    this.#persistHidden();
    return place;
  }

  // Reverses one swipe: { type: "save" | "pass", place }.
  undo(action) {
    if (!action || !action.place) return;
    if (action.type === "save") {
      this.saved.delete(action.place.id);
      this.#persistSaved();
    } else {
      this.hidden.delete(action.place.id);
      this.#persistHidden();
    }
    this.#reindex();
  }

  resetHidden() {
    this.hidden.clear();
    this.#persistHidden();
    this.#reindex();
  }

  #persistSaved() {
    this.storage.set(KEY.saved, [...this.saved.values()]);
  }

  #persistHidden() {
    this.storage.set(KEY.hidden, [...this.hidden.values()]);
  }

  #index(nk, lat, lon) {
    if (!nk) return;
    const list = this.names.get(nk);
    if (list) list.push([lat, lon]);
    else this.names.set(nk, [[lat, lon]]);
  }

  #reindex() {
    this.names = new Map();
    for (const p of this.saved.values()) this.#index(p.nk, p.lat, p.lon);
    for (const t of this.hidden.values()) this.#index(t[1], t[2], t[3]);
  }

  /* ---- small cache with oldest-first cleanup ---- */

  cacheGet(key, maxAgeMs) {
    const entry = this.storage.get(KEY.cache + key);
    if (!entry || this.now() - entry.t > maxAgeMs) return null;
    return entry.v;
  }

  cacheSet(key, value) {
    const entry = { t: this.now(), v: value };
    let index = (this.storage.get(KEY.cacheIndex) || []).filter((k) => k !== key);
    index.push(key);
    while (index.length > MAX_CACHE_ENTRIES) this.storage.remove(KEY.cache + index.shift());
    if (!this.storage.set(KEY.cache + key, entry)) {
      // Storage is full: drop the whole cache and try once more.
      for (const k of index) this.storage.remove(KEY.cache + k);
      index = [key];
      if (!this.storage.set(KEY.cache + key, entry)) index = [];
    }
    this.storage.set(KEY.cacheIndex, index);
  }

  clearCache() {
    for (const k of this.storage.get(KEY.cacheIndex) || []) this.storage.remove(KEY.cache + k);
    this.storage.remove(KEY.cacheIndex);
  }
}
