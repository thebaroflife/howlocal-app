// Phone-size browser run against the REAL listing files in data/places (no stand-ins).
// It checks that real places load, how much has to be downloaded, and saves screenshots.
//   npm run test:real
//   SITE_URL=https://example.github.io/howlocal-app/ npm run test:real   (the live site)
import puppeteer from "puppeteer-core";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../scripts/serve.mjs";
import { isChainName } from "../js/categories.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const CHROME = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const PORT = 8125;
const SITE = process.env.SITE_URL || "";
const LABEL = SITE ? "hosted-real" : "real";
const shots = join(here, "screens");
mkdirSync(shots, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${detail ? `  (${detail})` : ""}`);
}

const server = SITE ? null : await startServer({ port: PORT, dir: root });
const URL_BASE = SITE || `http://127.0.0.1:${PORT}/`;
const ORIGIN = `${new URL(URL_BASE).origin}/`;
const region = SITE ? null : JSON.parse(readFileSync(join(root, "data/places/index.json"), "utf8")).region;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    ...(process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`] : []),
  ],
});
const page = await browser.newPage();
await page.emulate({
  viewport: { width: 390, height: 760, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
});

const problems = [];
page.on("pageerror", (err) => problems.push(`page error: ${err.message}`));
page.on("console", (msg) => {
  if (msg.type() === "error") problems.push(`console error: ${msg.text()}`);
});
const outside = [];
let mapRequests = 0;
const listing = { files: 0, bytes: 0 };
// Requests go straight to the network (or the stand-ins below), not through the offline helper.
await page.setBypassServiceWorker(true);
await page.setRequestInterception(true);
page.on("request", (req) => {
  const url = req.url();
  if (url.startsWith(ORIGIN) || url.startsWith("data:") || url.startsWith("blob:")) return req.continue();
  if (url.startsWith("https://tiles.openfreemap.org/")) {
    mapRequests += 1;
    return req.continue();
  }
  outside.push(url);
  return req.abort();
});
page.on("response", async (res) => {
  if (!/\/data\/places\//.test(res.url())) return;
  listing.files += 1;
  try {
    listing.bytes += (await res.buffer()).length;
  } catch {
    /* the page moved on before the body was read */
  }
});

const shot = (name) => page.screenshot({ path: join(shots, `${LABEL}-${name}.png`) });
const text = (sel) => page.$eval(sel, (el) => el.textContent.trim()).catch(() => null);
const topName = () => text('.card[data-pos="0"] .card__name');
const waitCard = () => page.waitForSelector('.card[data-pos="0"]', { timeout: 15000 });
const settle = () => sleep(520);

async function submitArea(prefix, zip, radius) {
  if (radius) {
    await page.$eval(`#${prefix}-radius`, (el, value) => {
      el.value = String(value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, radius);
  }
  await page.$eval(`#${prefix}-zip`, (el) => {
    el.value = "";
  });
  await page.type(`#${prefix}-zip`, zip);
  await page.$eval(`#${prefix}-zip`, (el) => el.form.requestSubmit());
}

async function openSearch() {
  await page.click("#area-chip");
  await page.waitForSelector(".sheet.is-open");
  await settle();
}

async function passCards(count) {
  const names = [];
  for (let i = 0; i < count; i++) {
    await waitCard();
    names.push(await topName());
    await page.click("#btn-pass");
    await sleep(140);
  }
  return names;
}

try {
  await page.goto(URL_BASE, { waitUntil: "networkidle0" });
  await page.evaluate(() => document.fonts.ready);
  const credit = (await text("#start-credit")) || "";
  check("start screen names the covered area", /^Covers .+ for now\./.test(credit) && (!region || credit.includes(region)), credit);
  const covered = (/^Covers (.+) for now\./.exec(credit) || [])[1] || "";

  // 1. Downtown Los Angeles, 5 miles
  let started = Date.now();
  await submitArea("start", "90012");
  await waitCard();
  const firstCardMs = Date.now() - started;
  await settle();
  check("real places load for 90012", !!(await topName()), `first card after ${firstCardMs} ms`);
  check("the first deck needs only a small download", listing.files <= 30 && listing.bytes < 400_000, `${listing.files} files, ${Math.round(listing.bytes / 1024)} KB`);
  await shot("01-deck-90012");

  const names = await passCards(30);
  await page.waitForSelector('.card[data-pos="0"] .card__media.has-map, .card[data-pos="0"] .card__media.has-photo', { timeout: 20000 }).catch(() => {});
  check("cards show the real street map", !!(await page.$('.card[data-pos="0"] .card__media.has-map, .card[data-pos="0"] .card__media.has-photo')), `${mapRequests} map requests`);
  await shot("01b-card-with-map");
  check("thirty different places in a row", new Set(names).size === 30 && names.every(Boolean));
  check("no chains among them", !names.some((n) => isChainName(n)), names.filter((n) => isChainName(n)).join(" | "));
  console.log(`       e.g. ${names.slice(0, 8).join(" | ")}`);

  await waitCard();
  const box = await (await page.$('.card[data-pos="0"]')).boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForSelector(".sheet.is-open", { timeout: 3000 });
  await settle();
  const osm = await page.$eval(".details__source a", (a) => a.href).catch(() => "");
  check("details credit the map listing", /^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/.test(osm), osm);
  await page.waitForSelector(".details__map canvas", { timeout: 15000 }).catch(() => {});
  await sleep(1500);
  check("details show a map with the place pinned", !!(await page.$(".details__map canvas")) && !!(await page.$(".details__map .maplibregl-marker")));
  await shot("02-details");
  await page.keyboard.press("Escape");
  await settle();

  // 2. Reload: the swiped places stay away
  await page.reload({ waitUntil: "networkidle0" });
  await waitCard();
  await settle();
  const again = await passCards(30);
  check("passed places stay away after a reload", !again.some((n) => names.includes(n)), again.filter((n) => names.includes(n)).join(" | "));

  // 3. The widest search still starts quickly
  listing.files = 0;
  listing.bytes = 0;
  await openSearch();
  started = Date.now();
  await submitArea("area", "90012", 50);
  await waitCard();
  const wideMs = Date.now() - started;
  await settle();
  check("a 50-mile search starts quickly", wideMs < 6000, `${wideMs} ms, ${listing.files} more files, ${Math.round(listing.bytes / 1024)} KB`);
  const wide = await passCards(20);
  const repeats = wide.filter((n) => names.includes(n) || again.includes(n));
  check("a 50-mile search keeps dealing new places", new Set(wide).size >= 19 && wide.every(Boolean), `${new Set(wide).size} different; seen before by name: ${repeats.join(" | ") || "none"}`);
  const far = await page.$$eval(".card .card__dist, .card [class*=dist]", (els) => els.map((e) => e.textContent.trim())).catch(() => []);
  console.log(`       distances on deck: ${far.join(", ") || "n/a"}`);
  await shot("03-deck-50-miles");

  // 4. Another city in the region
  await openSearch();
  await submitArea("area", "92101", 3);
  await waitCard();
  await settle();
  check("San Diego has listings too", !!(await topName()), await topName());
  await shot("04-deck-92101");

  // Northern California too, now that the listings cover the whole state
  await openSearch();
  await submitArea("area", "94110", 3);
  await waitCard();
  await settle();
  check("San Francisco has listings too", !!(await topName()), await topName());
  await shot("04b-deck-94110");

  // 5. Outside the region, and a spot with nothing close by
  await openSearch();
  await submitArea("area", "10001");
  await page.waitForFunction(() => /outside it/.test(document.querySelector("#area-zip-msg")?.textContent || ""), { timeout: 8000 });
  check("a New York ZIP is turned away with a reason", (await text("#area-zip-msg")) === `HowLocal covers ${covered} for now, and that ZIP is outside it.`, await text("#area-zip-msg"));
  await shot("05-outside");
  await page.keyboard.press("Escape");
  await settle();
} catch (err) {
  check(`run completed (${err.message.split("\n")[0]})`, false);
  await shot("99-failure").catch(() => {});
}

check("no script errors", problems.length === 0, problems.slice(0, 3).join(" | "));
check("nothing was requested from outside the app", outside.length === 0, [...new Set(outside)].slice(0, 3).join(" | "));

await browser.close();
if (server) server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${LABEL}: ${results.length - failed.length} of ${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
