/* Street view photos for the details sheet (Mapillary, CC BY-SA 4.0), built by scripts/street.mjs.
   Only squares listed in the index are fetched, so places without a photo cost nothing. */
import { CONFIG } from "./config.js";
import { tileOf } from "./geo.js";

let indexPromise = null;
const tiles = new Map(); // "row/col" -> promise of { placeId: pick }

export const streetOn = () => !!CONFIG.streetPath;

function index() {
  if (!indexPromise) {
    indexPromise = fetch(`${CONFIG.streetPath}/index.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => (data && Array.isArray(data.tiles) ? { deg: data.tile, tiles: new Set(data.tiles) } : null))
      .catch(() => null);
  }
  return indexPromise;
}

// { id, url, credit, year, page } or null.
export async function streetPhotoFor(place) {
  if (!streetOn() || !place || place.sample || !Number.isFinite(place.lat)) return null;
  const idx = await index();
  if (!idx) return null;
  const key = tileOf(place.lat, place.lon, idx.deg).join("/");
  if (!idx.tiles.has(key)) return null;
  if (!tiles.has(key)) {
    tiles.set(
      key,
      fetch(`${CONFIG.streetPath}/${key}.json`)
        .then((res) => (res.ok ? res.json() : {}))
        .catch(() => ({})),
    );
  }
  const pick = (await tiles.get(key))[place.id];
  if (!pick || !pick[1]) return null;
  const [id, url, credit, year] = pick;
  return { id, url, credit: credit || "Mapillary", year: year || "", page: `https://www.mapillary.com/app/?pKey=${encodeURIComponent(id)}` };
}
