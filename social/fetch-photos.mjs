// Downloads openly licensed photos listed in social/photos.json from Wikimedia Commons into
// social/media/, and records who took each one and under which license in social/media/credits.json.
// Runs in GitHub Actions (.github/workflows/fetch-photos.yml). Only licenses that allow reuse in a
// video with a credit line are accepted.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const media = join(here, "media");
mkdirSync(media, { recursive: true });
const UA = "HowLocalBot/1.0 (https://github.com/thebaroflife/howlocal-app)";
const OK_LICENSES = /^(CC0|Public domain|CC BY(-SA)? [1-4]\.0|CC BY(-SA)? 2\.5|GFDL)/i;

const wanted = JSON.parse(readFileSync(join(here, "photos.json"), "utf8"));
const creditsFile = join(media, "credits.json");
const credits = existsSync(creditsFile) ? JSON.parse(readFileSync(creditsFile, "utf8")) : {};
const strip = (html) => String(html || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const { name, commons } of wanted) {
  const target = join(media, `${name}.jpg`);
  if (existsSync(target) && credits[name]) continue;
  const api = new URL("https://commons.wikimedia.org/w/api.php");
  for (const [k, v] of Object.entries({ action: "query", titles: commons, prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "1280", format: "json" })) api.searchParams.set(k, v);
  const info = await (await fetch(api, { headers: { "User-Agent": UA } })).json();
  const page = Object.values(info.query.pages)[0];
  const ii = page.imageinfo && page.imageinfo[0];
  if (!ii) {
    console.log(`skip ${name}: ${commons} not found`);
    continue;
  }
  const license = strip(ii.extmetadata.LicenseShortName?.value);
  if (!OK_LICENSES.test(license)) {
    console.log(`skip ${name}: license "${license}" isn't one we reuse`);
    continue;
  }
  const res = await fetch(ii.thumburl, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${name}: download answered ${res.status}`);
  writeFileSync(target, Buffer.from(await res.arrayBuffer()));
  credits[name] = {
    commons,
    credit: strip(ii.extmetadata.Artist?.value) || "unknown",
    license,
    source: ii.descriptionurl,
  };
  console.log(`got ${name}: ${credits[name].credit}, ${license}`);
  await sleep(1500);
}
writeFileSync(creditsFile, `${JSON.stringify(credits, null, 2)}\n`);
