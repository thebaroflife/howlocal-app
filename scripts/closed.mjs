// Drops places that have closed, before the listing files are built.
// Two sources: data/closed-overrides.json (spots checked by hand, with a source) and Overture Maps'
// list of places marked closed (scripts/overture-closed.py), matched by name within a short walk.
import { nameKey } from "../js/categories.js";
import { haversineMi } from "../js/geo.js";

const NEAR_MI = 0.05; // about 80 m
const MAX_SHARE = 0.15; // if more than this would go, something is off: keep everything

function sameName(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 8 && long.includes(short);
}

// Grid of closed places, so each listed place only checks its neighbors.
function grid(closed) {
  const cells = new Map();
  for (const c of closed) {
    const key = `${Math.round(c.lat * 100)}/${Math.round(c.lon * 100)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push({ ...c, nk: nameKey(c.name) });
  }
  return cells;
}

// Returns { kept, dropped: [{ place, why }] }.
export function dropClosed(places, { overrides = [], closed = [] } = {}) {
  const byId = new Map(overrides.map((o) => [o.osm, o]));
  const cells = grid(closed);
  const dropped = [];
  const kept = [];
  for (const p of places) {
    const o = byId.get(p.id) || byId.get(p.osm);
    if (o) {
      dropped.push({ place: p, why: `checked by hand: ${o.why}` });
      continue;
    }
    let hit = null;
    const r = Math.round(p.lat * 100);
    const c = Math.round(p.lon * 100);
    for (let dr = -1; dr <= 1 && !hit; dr++)
      for (let dc = -1; dc <= 1 && !hit; dc++)
        for (const x of cells.get(`${r + dr}/${c + dc}`) || [])
          if (sameName(p.nk, x.nk) && haversineMi(p.lat, p.lon, x.lat, x.lon) <= NEAR_MI) {
            hit = x;
            break;
          }
    if (hit) dropped.push({ place: p, why: `Overture marks it ${hit.status.replace("_", " ")}` });
    else kept.push(p);
  }
  const fromOverture = dropped.filter((d) => d.why.startsWith("Overture")).length;
  if (fromOverture > places.length * MAX_SHARE) {
    // Too many to be believable: keep Overture's matches, still apply the hand-checked list.
    const handOnly = dropped.filter((d) => !d.why.startsWith("Overture"));
    return { kept: places.filter((p) => !handOnly.some((d) => d.place === p)), dropped: handOnly, ignoredOverture: fromOverture };
  }
  return { kept, dropped, ignoredOverture: 0 };
}
