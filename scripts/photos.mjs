// Finds openly licensed photos for places, at build time (GitHub Actions; never in the app).
// A place gets a photo when the map data links it to one: a Wikimedia Commons file, or a Wikidata
// item with an image. Only licenses that allow reuse with a credit line are kept.
const UA = "HowLocalBot/1.0 (https://github.com/thebaroflife/howlocal-app)";
const OK = /^(CC0|Public domain|CC BY(-SA)? ([1-4]\.0|2\.5))/i;
const strip = (html) => String(html || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

async function getJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) return res.json();
    if (res.status !== 429 && res.status < 500) throw new Error(`${url.hostname} answered ${res.status}`);
    await sleep(5000 * (i + 1));
  }
  throw new Error(`${url.hostname} kept refusing`);
}

// Wikidata items -> their main image file name.
async function wikidataImages(ids) {
  const out = new Map();
  for (const batch of chunks([...new Set(ids)], 50)) {
    const url = new URL("https://www.wikidata.org/w/api.php");
    for (const [k, v] of Object.entries({ action: "wbgetentities", ids: batch.join("|"), props: "claims", format: "json" })) url.searchParams.set(k, v);
    const data = await getJson(url);
    for (const [id, entity] of Object.entries(data.entities || {})) {
      const claim = entity.claims && entity.claims.P18 && entity.claims.P18[0];
      const file = claim && claim.mainsnak && claim.mainsnak.datavalue && claim.mainsnak.datavalue.value;
      if (file) out.set(id, `File:${file}`);
    }
    await sleep(800);
  }
  return out;
}

// Commons files -> picture URL, photographer and license.
async function commonsInfo(files) {
  const out = new Map();
  for (const batch of chunks([...new Set(files)], 50)) {
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    for (const [k, v] of Object.entries({ action: "query", titles: batch.join("|"), prop: "imageinfo", iiprop: "url|extmetadata|mime", iiurlwidth: "900", format: "json" })) url.searchParams.set(k, v);
    const data = await getJson(url);
    const renamed = new Map((data.query.normalized || []).map((n) => [n.to, n.from]));
    for (const page of Object.values(data.query.pages || {})) {
      const info = page.imageinfo && page.imageinfo[0];
      if (!info || !/^image\/(jpeg|png|webp)$/.test(info.mime || "")) continue;
      const meta = info.extmetadata || {};
      const license = strip(meta.LicenseShortName && meta.LicenseShortName.value);
      if (!OK.test(license)) continue;
      const credit = strip(meta.Artist && meta.Artist.value).slice(0, 60) || "Wikimedia Commons";
      const photo = { url: info.thumburl || info.url, credit, license };
      out.set(page.title, photo);
      if (renamed.has(page.title)) out.set(renamed.get(page.title), photo);
    }
    await sleep(800);
  }
  return out;
}

// Adds .photo to every place that has one. Returns how many got one.
export async function addPhotos(places) {
  const byWikidata = await wikidataImages(places.filter((p) => !p.photoFile && p.wikidata).map((p) => p.wikidata));
  for (const p of places) if (!p.photoFile && p.wikidata && byWikidata.has(p.wikidata)) p.photoFile = byWikidata.get(p.wikidata);
  const info = await commonsInfo(places.filter((p) => p.photoFile).map((p) => p.photoFile));
  let found = 0;
  for (const p of places) {
    const photo = p.photoFile && info.get(p.photoFile);
    if (photo) {
      p.photo = photo;
      found += 1;
    }
  }
  return found;
}
