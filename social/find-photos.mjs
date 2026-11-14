// Finds free, openly licensed photos of the businesses in social/posts.json, for the TikTok videos.
// Two sources, both allowed by the README's rules (openly licensed, credit shown on the photo):
//   - Wikimedia Commons: photos taken within 150 m of the spot, plus a search by the business name.
//   - Mapillary street-level photos (CC BY-SA 4.0) within 60 m, newest first, no 360° panoramas.
// Downloads up to 4 candidates per business into social/candidates/<post>/ with candidates.json
// (credit, license, source, distance), so a person can look at them and pick the right one.
// Runs in GitHub Actions (.github/workflows/find-photos.yml); needs MAPILLARY_TOKEN for Mapillary.
//   node social/find-photos.mjs                 every post
//   node social/find-photos.mjs id1 id2         only these posts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "candidates");
const UA = "HowLocalBot/1.0 (https://github.com/thebaroflife/howlocal-app)";
const OK_LICENSES = /^(CC0|Public domain|CC BY(-SA)? [1-4]\.0|CC BY(-SA)? 2\.5|GFDL)/i;
const TOKEN = process.env.MAPILLARY_TOKEN || "";
const PER_PLACE = 4;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (html) => String(html || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const slug = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

function meters(a, b, c, d) {
  const R = 6371000, r = Math.PI / 180;
  const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
}

async function json(url) {
  for (let i = 0; i < 3; i++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) { await sleep(2000 * (i + 1)); continue; }
    throw new Error(`${url.host} answered ${res.status}`);
  }
  throw new Error(`${url.host} kept failing`);
}

async function commonsInfo(titles) {
  if (!titles.length) return [];
  const api = new URL("https://commons.wikimedia.org/w/api.php");
  for (const [k, v] of Object.entries({ action: "query", titles: titles.join("|"), prop: "imageinfo|coordinates", iiprop: "url|extmetadata|mime", iiurlwidth: "1280", format: "json" })) api.searchParams.set(k, v);
  const data = await json(api);
  return Object.values(data.query?.pages || {}).filter((p) => p.imageinfo && /image\/(jpeg|png)/.test(p.imageinfo[0].mime));
}

async function fromCommons(place) {
  const titles = new Set();
  const geo = new URL("https://commons.wikimedia.org/w/api.php");
  for (const [k, v] of Object.entries({ action: "query", list: "geosearch", gscoord: `${place.lat}|${place.lon}`, gsradius: "150", gsnamespace: "6", gslimit: "20", format: "json" })) geo.searchParams.set(k, v);
  for (const g of (await json(geo)).query?.geosearch || []) titles.add(g.title);
  const name = place.name.replace(/[^\p{L}\p{N}'& ]/gu, " ").trim();
  const search = new URL("https://commons.wikimedia.org/w/api.php");
  for (const [k, v] of Object.entries({ action: "query", list: "search", srsearch: `"${name}"`, srnamespace: "6", srlimit: "10", format: "json" })) search.searchParams.set(k, v);
  for (const s of (await json(search)).query?.search || []) titles.add(s.title);
  const pages = await commonsInfo([...titles].slice(0, 30));
  return pages
    .map((p) => {
      const ii = p.imageinfo[0];
      const m = ii.extmetadata || {};
      const license = strip(m.LicenseShortName?.value);
      const c = p.coordinates?.[0];
      return {
        source: "commons",
        commons: p.title,
        url: ii.thumburl || ii.url,
        credit: strip(m.Artist?.value) || "unknown",
        license,
        page: ii.descriptionurl,
        meters: c ? meters(place.lat, place.lon, c.lat, c.lon) : null,
        nameMatch: p.title.toLowerCase().includes(name.toLowerCase().split(" ")[0]),
        ok: OK_LICENSES.test(license),
      };
    })
    .filter((x) => x.ok)
    .sort((a, b) => (b.nameMatch - a.nameMatch) || ((a.meters ?? 999) - (b.meters ?? 999)));
}

async function fromMapillary(place) {
  if (!TOKEN) return [];
  const d = 0.0006;
  const url = new URL("https://graph.mapillary.com/images");
  url.searchParams.set("access_token", TOKEN);
  url.searchParams.set("fields", "id,thumb_1024_url,captured_at,creator,geometry,is_pano");
  url.searchParams.set("bbox", [place.lon - d, place.lat - d, place.lon + d, place.lat + d].join(","));
  url.searchParams.set("limit", "100");
  const data = await json(url);
  const cutoff = Date.now() - 8 * 365 * 864e5;
  return (data.data || [])
    .filter((i) => i.thumb_1024_url && !i.is_pano && i.captured_at > cutoff)
    .map((i) => {
      const [lon, lat] = i.geometry.coordinates;
      return {
        source: "mapillary",
        id: i.id,
        url: i.thumb_1024_url,
        credit: `${i.creator?.username || "a contributor"} on Mapillary`,
        license: "CC BY-SA 4.0",
        page: `https://www.mapillary.com/app/?pKey=${i.id}`,
        meters: meters(place.lat, place.lon, lat, lon),
        year: new Date(i.captured_at).getUTCFullYear(),
      };
    })
    .filter((x) => x.meters <= 60)
    .sort((a, b) => a.meters - b.meters || b.year - a.year)
    // spread the picks out: no two within 8 m of each other
    .filter((x, i, all) => all.slice(0, i).every((y) => Math.abs(y.meters - x.meters) > 8));
}

const posts = JSON.parse(readFileSync(join(here, "posts.json"), "utf8"));
const only = process.argv.slice(2);
const summary = {};
for (const post of posts.filter((p) => !only.length || only.includes(p.id))) {
  const dir = join(out, post.id);
  mkdirSync(dir, { recursive: true });
  const list = [];
  for (const place of post.places) {
    let found = [];
    try { found.push(...(await fromCommons(place)).slice(0, PER_PLACE)); } catch (e) { console.log(`${place.name}: Commons ${e.message}`); }
    try { found.push(...(await fromMapillary(place)).slice(0, PER_PLACE)); } catch (e) { console.log(`${place.name}: Mapillary ${e.message}`); }
    let n = 0;
    for (const c of found) {
      const file = `${slug(place.name)}-${c.source}-${++n}.jpg`;
      try {
        const res = await fetch(c.url, { headers: { "User-Agent": UA } });
        if (!res.ok) continue;
        writeFileSync(join(dir, file), Buffer.from(await res.arrayBuffer()));
        list.push({ place: place.name, file, ...c, url: undefined });
      } catch {}
      await sleep(400);
    }
    summary[`${post.id} / ${place.name}`] = found.length;
    console.log(`${post.id} / ${place.name}: ${found.length} candidates`);
    await sleep(800);
  }
  writeFileSync(join(dir, "candidates.json"), `${JSON.stringify(list, null, 2)}\n`);
}
writeFileSync(join(out, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
