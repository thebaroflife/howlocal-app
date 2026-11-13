// Picks a Mapillary street photo that looks at a place (build time, GitHub Actions only).
// Mapillary photos are CC BY-SA 4.0. Their picture links expire, so only the photo's id is kept;
// a fresh link is asked for when the photo is shown.
const API = "https://graph.mapillary.com/images";
const NEAR_DEG = 0.0004; // about 40 m around the place
const MAX_M = 35; // camera no farther than this from the place
const MIN_M = 4; // nor standing on top of it
const MAX_TURN = 35; // camera pointing within this many degrees of the place
const MAX_AGE_YEARS = 6; // older street photos may show a different business
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rad = (d) => (d * Math.PI) / 180;

export function metersBetween(lat1, lon1, lat2, lon2) {
  const x = rad(lon2 - lon1) * Math.cos(rad((lat1 + lat2) / 2));
  const y = rad(lat2 - lat1);
  return Math.hypot(x, y) * 6371000;
}

export function bearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const turn = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

// Scores one Mapillary image for a place; null when it doesn't look at it.
export function score(place, img) {
  if (img.is_pano) return null;
  const geo = img.computed_geometry || img.geometry;
  const heading = img.computed_compass_angle ?? img.compass_angle;
  if (!geo || heading == null) return null;
  const [lon, lat] = geo.coordinates;
  const m = metersBetween(lat, lon, place.lat, place.lon);
  if (m < MIN_M || m > MAX_M) return null;
  const off = turn(heading, bearing(lat, lon, place.lat, place.lon));
  if (off > MAX_TURN) return null;
  const ageYears = (Date.now() - Number(img.captured_at || 0)) / 3.15e10;
  if (ageYears > MAX_AGE_YEARS) return null;
  // Facing it squarely, fairly close, and recent wins.
  return off / MAX_TURN + Math.abs(m - 15) / 30 + Math.min(ageYears, 10) / 8;
}

export class Gone extends Error {}

async function getJson(url, token, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { Authorization: `OAuth ${token}` } });
    if (res.ok) return res.json();
    if (res.status === 404) throw new Gone("photo removed");
    if (res.status !== 429 && res.status < 500) throw new Error(`Mapillary answered ${res.status}`);
    await sleep(3000 * (i + 1));
  }
  throw new Error("Mapillary kept refusing");
}

// A fresh picture link for a photo already picked (links last about 30 days).
export async function freshLink(id, token) {
  const data = await getJson(new URL(`https://graph.mapillary.com/${id}?fields=thumb_1024_url`), token);
  return data.thumb_1024_url || "";
}

// Best street photo for a place: { id, url, credit, taken } or null.
export async function streetPhoto(place, token, fields = "") {
  const url = new URL(API);
  url.searchParams.set("bbox", [place.lon - NEAR_DEG, place.lat - NEAR_DEG, place.lon + NEAR_DEG, place.lat + NEAR_DEG].map((n) => n.toFixed(6)).join(","));
  url.searchParams.set("fields", "id,computed_geometry,geometry,computed_compass_angle,compass_angle,captured_at,is_pano,creator,thumb_1024_url" + (fields ? "," + fields : ""));
  url.searchParams.set("limit", "100");
  const data = await getJson(url, token);
  let best = null;
  for (const img of data.data || []) {
    const s = score(place, img);
    if (s != null && img.thumb_1024_url && (!best || s < best.s)) best = { s, img };
  }
  if (!best) return null;
  const { img } = best;
  return {
    id: String(img.id),
    url: img.thumb_1024_url,
    credit: (img.creator && img.creator.username) || "Mapillary",
    taken: img.captured_at ? new Date(Number(img.captured_at)).toISOString().slice(0, 10) : "",
    ...(fields ? { extra: img } : {}),
  };
}
