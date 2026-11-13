// Phone-size browser run. Drives the real app in headless Chrome with a made-up neighborhood
// standing in for the listing files, checks the swipe rules end to end, and saves screenshots.
//   npm run test:ui            (hosted app, js modules)
//   npm run test:ui -- preview (single-file preview build with sample cards)
//   SITE_URL=https://example.github.io/howlocal-app/ npm run test:ui   (the live site, same fixture data)
// For a run against the real listings, see tests/real.smoke.mjs.
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../scripts/serve.mjs";
import { destination, tileOf } from "../js/geo.js";
import { normalizeElement, dedupe, decodePlace } from "../js/places.js";
import { buildTiles } from "../scripts/tiles-lib.mjs";
import { seeded } from "./helpers.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const MODE = process.argv.includes("preview") ? "preview" : "live";
const CHROME = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const PORT = MODE === "preview" ? 8124 : 8123;
const SITE = MODE === "live" ? process.env.SITE_URL || "" : ""; // test the deployed site instead of local files
const LABEL = SITE ? "hosted" : MODE;
const shots = join(here, "screens");
mkdirSync(shots, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${ok || !detail ? "" : `  (${detail})`}`);
}

/* ---- a made-up neighborhood around ZIP 90012, served in place of the real listing files ---- */

const TOWN_CENTER = { lat: 34.061, lon: -118.238 };
const KINDS = [
  { amenity: "restaurant", cuisine: "thai" },
  { amenity: "cafe", cuisine: "coffee_shop" },
  { amenity: "fast_food", cuisine: "tacos" },
  { shop: "books" },
  { amenity: "restaurant", cuisine: "pizza" },
  { shop: "clothes" },
  { shop: "bakery" },
  { amenity: "bar" },
  { shop: "florist" },
  { shop: "music" },
];
function buildTown() {
  const rng = seeded(5);
  const town = [];
  for (let i = 0; i < 70; i++) {
    const [lat, lon] = destination(TOWN_CENTER.lat, TOWN_CENTER.lon, rng() * 360, 0.05 + Math.sqrt(rng()) * 1.4);
    const tags = { name: `Fixture Spot ${String(i + 1).padStart(2, "0")}`, ...KINDS[i % KINDS.length] };
    if (i % 2 === 0) Object.assign(tags, { "addr:housenumber": String(100 + i), "addr:street": "Fixture St", "addr:city": "Los Angeles" });
    if (i % 3 === 0) tags.opening_hours = "Mo-Fr 11:00-21:00; Sa-Su 10:00-22:00";
    if (i % 4 === 0) tags.website = `https://fixture${i}.example`;
    if (i % 5 === 0) tags.outdoor_seating = "yes";
    town.push({ type: "node", id: 5000 + i, lat, lon, tags });
  }
  const [lat, lon] = destination(TOWN_CENTER.lat, TOWN_CENTER.lon, 45, 0.1);
  town.push({ type: "node", id: 9001, lat, lon, tags: { name: "Fixture Brand Coffee", amenity: "cafe", brand: "Fixture Brand" } });
  town.push({ type: "node", id: 9002, lat, lon, tags: { name: "Starbucks", amenity: "cafe" } });
  town.push({ type: "node", id: 9003, lat, lon, tags: { amenity: "cafe" } });
  town.push({ type: "node", id: 9004, lat, lon, tags: { name: "Fixture Lube", shop: "car_repair" } });
  town.push({ type: "node", id: 9005, lat, lon, tags: { name: "Fixture Twin Deli", shop: "deli" } });
  town.push({ type: "way", id: 9006, center: { lat: lat + 0.0001, lon }, tags: { name: "Fixture Twin Deli", shop: "deli", "addr:street": "Twin Ave" } });
  town.push({ type: "node", id: 9007, lat, lon, tags: { name: "A Very Long Fixture Name For A Family Restaurant And Bakery Café", amenity: "restaurant" } });
  return town;
}
// Run the town through the same steps as the real data build: the app's rules, then tiles.
const listing = buildTiles(dedupe(buildTown().map(normalizeElement).filter(Boolean)), {
  generated: "2026-01-01",
  region: "Fixture Town",
  source: "test fixture",
});
const tiles = { calls: 0, mode: "ok" };
function answer(req, which, row, col) {
  tiles.calls += 1;
  if (tiles.mode === "down") return req.respond({ status: 500, contentType: "text/plain", body: "down" });
  const body = which === "index" ? listing.index : listing.files.get(`${row}/${col}`);
  if (!body) return req.respond({ status: 404, contentType: "text/plain", body: "no such tile" });
  return req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

// Stand-in street view photos: every listed place gets one, served from a made-up address.
const street = { index: { v: 1, tile: listing.index.tile, tiles: [] }, files: new Map(), served: 0 };
for (const rows of listing.files.values()) {
  for (const p of rows.map(decodePlace)) {
    const key = tileOf(p.lat, p.lon, listing.index.tile).join("/");
    if (!street.files.has(key)) street.files.set(key, {});
    street.files.get(key)[p.id] = [`m${p.id}`, `https://street.example/${encodeURIComponent(p.id)}.svg`, "fixture_driver", "2025"];
  }
}
street.index.tiles = [...street.files.keys()];
const STREET_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="40"><rect width="64" height="40" fill="#8aa"/></svg>';

/* ---- page helpers ---- */

const CSP_FOR_PREVIEW =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'";

const server = SITE
  ? null
  : await startServer({
      port: PORT,
      dir: MODE === "preview" ? join(root, "dist") : root,
      headers: MODE === "preview" ? { "Content-Security-Policy": CSP_FOR_PREVIEW } : {},
    });
const URL_BASE = SITE || `http://127.0.0.1:${PORT}/${MODE === "preview" ? "preview.html" : ""}`;
const ORIGIN = `${new URL(URL_BASE).origin}/`;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    ...(SITE && process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`] : []),
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
  // The loading-problem step answers 500 on purpose; the browser logs each of those as an error.
  // 500s come from the loading-problem step; ERR_FAILED from the blocked map service.
  if (msg.type() === "error" && !/status of 500|net::ERR_FAILED/.test(msg.text())) problems.push(`console error: ${msg.text()}`);
});
const outside = [];
// Requests go straight to the network (or the stand-ins below), not through the offline helper.
await page.setBypassServiceWorker(true);
await page.setRequestInterception(true);
page.on("request", (req) => {
  const url = req.url();
  const tile = MODE === "live" && url.startsWith(ORIGIN) ? /\/data\/places\/(?:(index)|(-?\d+)\/(-?\d+))\.json$/.exec(url) : null;
  if (tile) return answer(req, tile[1], tile[2], tile[3]);
  const st = MODE === "live" && url.startsWith(ORIGIN) ? /\/data\/street\/(?:(index)|(-?\d+\/-?\d+))\.json$/.exec(url) : null;
  if (st) {
    const body = st[1] ? street.index : street.files.get(st[2]);
    return req.respond(body ? { status: 200, contentType: "application/json", body: JSON.stringify(body) } : { status: 404, contentType: "text/plain", body: "none" });
  }
  if (url.startsWith("https://street.example/")) {
    street.served += 1;
    return req.respond({ status: 200, contentType: "image/svg+xml", body: STREET_SVG });
  }
  if (url.startsWith(ORIGIN) || url.startsWith("data:") || url.startsWith("blob:")) return req.continue();
  // The street-map service is the one outside address the app may use. Blocked here, so this run
  // also checks that cards still work without maps.
  if (url.startsWith("https://tiles.openfreemap.org/")) return req.abort();
  outside.push(url);
  return req.abort();
});

const shot = (name) => page.screenshot({ path: join(shots, `${LABEL}-${name}.png`) });
const text = (sel) => page.$eval(sel, (el) => el.textContent.trim()).catch(() => null);
const visible = (sel) => page.$eval(sel, (el) => !el.hidden && el.getClientRects().length > 0).catch(() => false);
const topName = () => text('.card[data-pos="0"] .card__name');
const waitCard = () => page.waitForSelector('.card[data-pos="0"]', { timeout: 8000 });
const settle = () => sleep(520);

async function dragTop(dx, { hold = false } = {}) {
  const box = await (await page.$('.card[data-pos="0"]')).boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height * 0.45;
  await page.touchscreen.touchStart(x, y);
  for (let i = 1; i <= 10; i++) {
    await page.touchscreen.touchMove(x + (dx * i) / 10, y + i);
    await sleep(18);
  }
  if (hold) return;
  await page.touchscreen.touchEnd();
}

async function submitArea(prefix, zip) {
  await page.$eval(`#${prefix}-zip`, (el) => {
    el.value = "";
  });
  await page.type(`#${prefix}-zip`, zip);
  await page.$eval(`#${prefix}-zip`, (el) => el.form.requestSubmit());
}

/* ---- the run ---- */

try {
  await page.goto(URL_BASE, { waitUntil: "networkidle0" });
  await page.evaluate(() => document.fonts.ready);

  // 1. First run: the start screen
  check("start screen shows on first run", await visible("#view-start"));
  check("no sideways scroll on start", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check("brand font loaded", await page.evaluate(() => document.fonts.check('800 20px "Poppins"')));
  if (MODE === "live") {
    check("start screen says what area is covered", /^Covers Fixture Town for now\./.test((await text("#start-credit")) || ""), await text("#start-credit"));
  }
  check("start screen credits the maker", /Built by OYO, on his own\./.test((await text(".start__foot")) || ""));
  check("start screen fits without scrolling", await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1));
  await shot("01-start");

  await submitArea("start", "123");
  check("short ZIP is rejected with a message", (await text("#start-zip-msg")) === "Enter a 5-digit ZIP code.");
  if (MODE === "live") {
    await submitArea("start", "00000");
    await sleep(300);
    check("unknown ZIP is rejected with a message", /isn't in our list/.test((await text("#start-zip-msg")) || ""));
  } else {
    await submitArea("start", "10001");
    await sleep(300);
    check("preview explains its ZIP limit", /preview only knows ZIP codes that start with 9/.test((await text("#start-zip-msg")) || ""));
  }

  // 2. Start swiping
  await submitArea("start", "90012");
  await waitCard();
  await settle();
  check("deck appears after entering a ZIP", await visible("#view-swipe"));
  check("area chip shows the ZIP and radius", (await text("#area-chip-zip")) === "90012" && (await text("#area-chip-radius")) === "5 mi");
  check("three cards are stacked", (await page.$$(".card")).length === 3);
  check("no sideways scroll on deck", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await shot("02-deck");

  // 3. Swipe right by touch = save
  const first = await topName();
  await dragTop(150, { hold: true });
  await shot("03-dragging-right");
  check("SAVE stamp shows while dragging right", await page.$eval('.card[data-pos="0"] .stamp--save', (el) => Number(getComputedStyle(el).opacity) > 0.9));
  await page.touchscreen.touchEnd();
  await settle();
  check("swipe right saves the place", (await text("#saved-count")) === "1");
  check("the next card comes up", (await topName()) !== first);

  // 4. A small drag springs back and saves nothing
  const second = await topName();
  await dragTop(40);
  await settle();
  check("a short drag springs back", (await topName()) === second && (await text("#saved-count")) === "1");

  // 5. Pass with the button, then undo, then pass again with the keyboard
  await page.click("#btn-pass");
  await settle();
  check("pass button removes the card", (await topName()) !== second);
  check("undo is offered after a swipe", await page.$eval("#btn-undo", (el) => !el.disabled));
  await page.click("#btn-undo");
  await settle();
  check("undo brings the card back", (await topName()) === second);
  check("undo works once", await page.$eval("#btn-undo", (el) => el.disabled));
  await page.keyboard.press("ArrowLeft");
  await settle();
  check("left arrow passes", (await topName()) !== second);

  // 6. Swipe left by touch = pass
  const third = await topName();
  await dragTop(-150, { hold: true });
  check("PASS stamp shows while dragging left", await page.$eval('.card[data-pos="0"] .stamp--pass', (el) => Number(getComputedStyle(el).opacity) > 0.9));
  await page.touchscreen.touchEnd();
  await settle();
  check("swipe left passes without saving", (await topName()) !== third && (await text("#saved-count")) === "1");

  // 7. Tap for details, save from the sheet
  const fourth = await topName();
  const box = await (await page.$('.card[data-pos="0"]')).boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForSelector(".sheet.is-open", { timeout: 3000 });
  await settle();
  check("tapping a card opens its details", (await text("#sheet-title")) === fourth);
  if (MODE === "live") {
    await page.waitForSelector(".details__street:not([hidden]) img", { timeout: 5000 }).catch(() => {});
    const cap = (await text(".details__street figcaption")) || "";
    const ownerHref = await page.$eval(".details__owner a", (a) => a.href).catch(() => "");
    const ownerUrl = ownerHref ? new URL(ownerHref) : null;
    check("details link to the owner form with the business filled in", !!ownerUrl && ownerUrl.hostname === "docs.google.com" && ownerUrl.searchParams.get("entry.2013697468") === fourth, ownerHref.slice(0, 120));
    check("details show the street view, credited", /Street view from 2025\. Photo: fixture_driver on Mapillary, CC BY-SA 4\.0/.test(cap) && street.served > 0, cap);
  }
  await shot("04-details");
  await page.click(".details .btn--yellow");
  await settle();
  check("saving from details works", (await text("#saved-count")) === "2" && (await topName()) !== fourth);

  // 8. Saved list
  await page.click("#tab-saved");
  await settle();
  const savedNames = await page.$$eval(".saved-row__name", (els) => els.map((e) => e.textContent));
  check("saved list has both places, newest first", savedNames.length === 2 && savedNames[0] === fourth && savedNames[1] === first, savedNames.join(" | "));
  await shot("05-saved");
  await page.click(".saved-row");
  await page.waitForSelector(".sheet.is-open");
  await settle();
  if (MODE === "live") {
    const maps = await page.$$eval(".details__maps a", (els) => els.map((a) => [a.textContent.trim(), a.href]));
    check("directions open in Apple Maps first on an iPhone", maps[0] && maps[0][0] === "Apple Maps" && /maps\.apple\.com\/\?daddr=-?[\d.]+,-?[\d.]+/.test(maps[0][1]), JSON.stringify(maps[0]));
    check("Google Maps is offered too", maps[1] && maps[1][0] === "Google Maps" && /google\.com\/maps\/dir\/\?api=1&destination=-?[\d.]+,-?[\d.]+/.test(maps[1][1]), JSON.stringify(maps[1]));
    const osm = await page.$eval(".details__source a", (a) => a.href);
    check("listing source link is present", /^https:\/\/www\.openstreetmap\.org\/(node|way)\/\d+$/.test(osm), osm);
  } else {
    check("sample listings have no directions link", (await page.$(".details__maps")) === null);
    check("sample listings say they are samples", /made-up sample listing/.test((await text(".details__source")) || ""));
  }
  await page.click(".details button.btn--line");
  await settle();
  check("removing from saved works", (await page.$$(".saved-row")).length === 1 && (await text("#saved-count")) === "1");

  // 9. Search area sheet: narrow to 1 mile
  await page.click("#tab-discover");
  await settle();
  await page.click("#area-chip");
  await page.waitForSelector(".sheet.is-open");
  await settle();
  await shot("06-search-area");
  check("search sheet counts passed places", /passed on 3 places/.test((await text(".panel")) || ""), await text(".panel__section .panel__text"));
  await page.$eval("#area-radius", (el) => {
    el.value = "1";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  check("radius label follows the slider", (await text("#area-radius-out")) === "1 mile");
  await page.$eval("#area-zip", (el) => el.form.requestSubmit());
  await waitCard();
  await settle();
  check("area chip shows the new radius", (await text("#area-chip-radius")) === "1 mi");

  // 10. Reload: settings and lists persist, and nothing saved or passed ever returns
  const gone = [first, second, third, fourth];
  await page.reload({ waitUntil: "networkidle0" });
  await waitCard();
  await settle();
  check("after reload the app opens on the deck", (await visible("#view-swipe")) && !(await visible("#view-start")));
  check("after reload the saved count is kept", (await text("#saved-count")) === "1");
  const seen = [];
  for (let i = 0; i < 400; i++) {
    const name = await topName();
    if (!name) {
      await sleep(250);
      if (!(await topName()) && (await visible("#deck-state")) && !(await page.$(".deck-msg--busy"))) break;
      continue;
    }
    seen.push(name);
    await page.click("#btn-pass");
    await sleep(60);
  }
  await settle();
  check("swiped through a full radius", seen.length >= (MODE === "live" ? 10 : 5), `${seen.length} cards`);
  check("no card is ever shown twice", new Set(seen).size === seen.length);
  check("saved and passed places never come back", gone.every((n) => !seen.includes(n)), gone.filter((n) => seen.includes(n)).join(" | "));
  if (MODE === "live") {
    check("chains and non-spots are never shown", !seen.some((n) => /Brand Coffee|Starbucks|Lube/.test(n)));
    check("a business mapped twice shows once", seen.filter((n) => n === "Fixture Twin Deli").length <= 1);
  } else {
    check("every preview card is a labeled sample", seen.every((n) => /sample|demo|example|placeholder/i.test(n)));
  }
  check("an end-of-deck message appears", /That's everything within 1 mile/.test((await text(".deck-msg__title")) || ""), await text(".deck-msg__title"));
  check("swipe buttons are off when the deck is empty", await page.$eval("#btn-save", (el) => el.disabled));
  await shot("07-end-of-deck");

  // 11. Widen from the end-of-deck message
  await page.click(".deck-msg .btn--yellow");
  await waitCard();
  await settle();
  check("widening the search deals new cards", (await text("#area-chip-radius")) === "2 mi" && !!(await topName()));
  check("widened deck still hides everything already swiped", !gone.concat(seen).includes(await topName()));

  // 12. Bring back passed places
  await page.click("#area-chip");
  await page.waitForSelector(".sheet.is-open");
  await settle();
  await page.click(".panel__section .btn--ghost");
  await settle();
  await shot("08-confirm");
  await page.click(".panel .btn--yellow");
  await waitCard();
  await settle();
  const after = [];
  for (let i = 0; i < 12; i++) {
    after.push(await topName());
    await page.click("#btn-pass");
    await sleep(120);
  }
  check("passed places return only after asking for them", after.some((n) => seen.includes(n) || n === second || n === third));
  check("saved places stay out of the deck", !after.includes(first));

  // 13. Listing files that fail to load: a clear message, and trying again works.
  //     Then a ZIP outside the listed area is turned away with a reason.
  if (MODE === "live") {
    tiles.mode = "down";
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".deck-msg__note", { timeout: 8000 });
    await settle();
    check("a loading problem shows a clear message", (await text(".deck-msg__title")) === "Places didn't load", await text(".deck-msg__title"));
    check("the message says what failed", /listings index answered 500/.test((await text(".deck-msg__note")) || ""), await text(".deck-msg__note"));
    await shot("09-load-problem");
    tiles.mode = "ok";
    await page.click(".deck-msg .btn--yellow");
    await waitCard();
    check("try again recovers", !!(await topName()));

    await page.click("#area-chip");
    await page.waitForSelector(".sheet.is-open");
    await settle();
    await submitArea("area", "10001");
    await page.waitForFunction(() => /outside it/.test(document.querySelector("#area-zip-msg")?.textContent || ""), { timeout: 8000 });
    check("a ZIP outside the listed area is turned away with a reason", (await text("#area-zip-msg")) === "HowLocal covers Fixture Town for now, and that ZIP is outside it.", await text("#area-zip-msg"));
    await shot("09b-outside-area");
    await submitArea("area", "90019"); // six miles west: still the same region, but nothing within 2 miles
    await page.waitForFunction(() => /Nothing is listed/.test(document.querySelector("#area-zip-msg")?.textContent || ""), { timeout: 8000 });
    check("a ZIP with nothing in range says so", (await text("#area-zip-msg")) === "Nothing is listed within 2 miles of that ZIP yet. Try a wider distance.", await text("#area-zip-msg"));
    await page.keyboard.press("Escape");
    await settle();
    check("the listing files were actually read", tiles.calls > 3, `${tiles.calls} reads`);
  }

  // 14. Short screens (small phone with browser bars)
  await page.setViewport({ width: 360, height: 560, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.click("#area-chip");
  await page.waitForSelector(".sheet.is-open");
  await settle();
  await page.$eval("#area-radius", (el) => {
    el.value = "10"; // wide enough that unswiped places remain
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await submitArea("area", "90012");
  await waitCard();
  await settle();
  const fits = await page.evaluate(() => {
    const card = document.querySelector('.card[data-pos="0"]');
    const rect = (sel) => card.querySelector(sel).getBoundingClientRect();
    const body = rect(".card__body");
    const name = rect(".card__name");
    const where = rect(".card__where");
    return { ok: name.bottom <= where.top + 1 && where.bottom <= body.bottom + 1, card: card.getBoundingClientRect().height };
  });
  check("card content fits on a short screen", fits.ok, `card ${Math.round(fits.card)}px`);
  await shot("10-short-screen");
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
