// Phone-size browser run for the free try (?try=1), the "Get the app" steps (?get=1),
// the app shown inside another site's page, and opening without a connection.
// Uses the real listing files.
//   npm run test:try
//   SITE_URL=https://example.github.io/howlocal-app/ npm run test:try   (the live site; skips the offline step)
import puppeteer from "puppeteer-core";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../scripts/serve.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const CHROME = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const PORT = 8126;
const SITE = process.env.SITE_URL || "";
const LABEL = SITE ? "hosted-try" : "try";
const shots = join(here, "screens");
mkdirSync(shots, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${ok || !detail ? "" : `  (${detail})`}`);
}

const server = SITE ? null : await startServer({ port: PORT, dir: root });
const BASE = SITE || `http://127.0.0.1:${PORT}/`;
// A page on another address stands in for oyom.ai/howlocal and shows the app in a frame.
const partnerDir = mkdtempSync(join(tmpdir(), "hl-partner-"));
writeFileSync(
  join(partnerDir, "index.html"),
  `<!doctype html><title>Partner</title><body style="margin:0;background:#3448FF"><iframe src="${BASE}?try=1" title="HowLocal" allow="geolocation" style="border:0;width:390px;height:760px;margin:20px"></iframe></body>`,
);
const partner = await startServer({ port: 8128, dir: partnerDir });
const PARTNER = "http://localhost:8128/";
const LIMIT = 10;

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const PIXEL = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const PHONE = { width: 390, height: 760, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

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

const problems = [];
async function fresh(userAgent = IPHONE, viewport = PHONE) {
  const context = await browser.createBrowserContext(); // empty storage, like a new visitor
  const page = await context.newPage();
  await page.emulate({ viewport, userAgent });
  page.on("pageerror", (err) => problems.push(`page error: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(msg.text())) problems.push(`console error: ${msg.text()}`);
  });
  return { context, page };
}

const text = (where, sel) => where.$eval(sel, (el) => el.textContent.trim()).catch(() => null);
const topName = (where) => text(where, '.card[data-pos="0"] .card__name');
const waitCard = (where) => where.waitForSelector('.card[data-pos="0"]', { timeout: 15000 });

async function enterZip(where, prefix, zip) {
  await where.$eval(`#${prefix}-zip`, (el) => {
    el.value = "";
  });
  await where.type(`#${prefix}-zip`, zip);
  await where.$eval(`#${prefix}-zip`, (el) => el.form.requestSubmit());
}

async function passCards(where, count) {
  for (let i = 0; i < count; i++) {
    await waitCard(where);
    await where.click("#btn-pass");
    await sleep(160);
  }
}

const gateShown = (where) =>
  where.waitForFunction(() => document.querySelector(".deck-msg__title")?.textContent === "Keep swiping in the app", { timeout: 8000 });

try {
  /* 1. The free try, opened on its own */
  {
    const { page } = await fresh();
    await page.goto(`${BASE}?try=1`, { waitUntil: "networkidle0" });
    await enterZip(page, "start", "90012");
    await waitCard(page);
    await sleep(500);
    check("try mode says how many free swipes are left", (await text(page, "#preview-note")) === `${LIMIT} free swipes left`, await text(page, "#preview-note"));
    await page.screenshot({ path: join(shots, `${LABEL}-01-counting.png`) });
    await passCards(page, LIMIT - 1);
    check("the count goes down with each swipe", (await text(page, "#preview-note")) === "1 free swipe left", await text(page, "#preview-note"));
    await passCards(page, 1);
    await gateShown(page);
    await sleep(400);
    check("after the free swipes, the app asks people to get it", true);
    check("no more cards can be swiped", await page.$eval("#btn-pass", (b) => b.disabled) && (await page.$$(".card")).length === 0);
    check("undo can't sneak an extra card", await page.$eval("#btn-undo", (b) => b.disabled));
    await page.screenshot({ path: join(shots, `${LABEL}-02-limit.png`) });

    await page.reload({ waitUntil: "networkidle0" });
    await gateShown(page);
    check("a reload doesn't reset the free swipes", true);

    await page.click("#area-chip");
    await page.waitForSelector(".sheet.is-open");
    await sleep(400);
    await enterZip(page, "area", "92101");
    await sleep(1500);
    check("changing the ZIP doesn't reset them either", (await text(page, ".deck-msg__title")) === "Keep swiping in the app" && (await page.$$(".card")).length === 0);

    await page.click(".deck-msg .btn--yellow");
    await page.waitForSelector(".getapp", { timeout: 3000 });
    await sleep(400);
    const steps = await page.$$eval(".getapp__step", (els) => els.map((e) => e.textContent.trim()));
    check("on an iPhone, Get the app shows the home screen steps", steps.length === 3 && /Add to Home Screen/.test(steps[1]), steps.join(" | "));
    check("the steps credit the maker", /Built by OYO, on his own\./.test((await text(page, ".getapp")) || ""));
    await page.screenshot({ path: join(shots, `${LABEL}-03-get-app-iphone.png`) });
  }

  /* 2. Inside another site's page, the way oyom.ai shows it */
  {
    const { context, page } = await fresh(IPHONE, { ...PHONE, width: 430, height: 900 });
    await page.goto(PARTNER, { waitUntil: "networkidle0" });
    const frame = page.frames().find((f) => f.url().includes("try=1"));
    check("the app loads inside the partner page", !!frame);
    await enterZip(frame, "start", "90034");
    await waitCard(frame);
    check("real places show inside the partner page", !!(await topName(frame)));
    await page.screenshot({ path: join(shots, `${LABEL}-04-in-partner-page.png`) });
    await passCards(frame, LIMIT);
    await gateShown(frame);
    const opened = context.waitForTarget((t) => t.url().includes("get=1"), { timeout: 5000 });
    await frame.click(".deck-msg .btn--yellow");
    const tab = await opened.catch(() => null);
    check("Get the app opens HowLocal on its own, where it can be installed", !!tab && tab.url().startsWith(BASE), tab && tab.url());
    check("nothing tries to install from inside the partner page", !(await frame.$(".getapp")));
    if (tab) {
      const own = await tab.page();
      await own.waitForSelector(".getapp", { timeout: 8000 });
      check("the new tab opens straight to the install steps", true);
      check("the address is cleaned up after opening them", await own.evaluate(() => location.search === ""));
    }
  }

  /* 3. The install steps on Android and on a computer */
  {
    const { page } = await fresh(PIXEL);
    await page.goto(`${BASE}?get=1`, { waitUntil: "networkidle0" });
    await page.waitForSelector(".getapp", { timeout: 5000 });
    await sleep(400);
    const steps = await page.$$eval(".getapp__step", (els) => els.map((e) => e.textContent.trim()));
    check("on Android, Get the app shows Chrome's steps", steps.length === 3 && /three dots/.test(steps[0]), steps.join(" | "));
    await page.screenshot({ path: join(shots, `${LABEL}-05-get-app-android.png`) });

    const desk = await fresh("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", { width: 1200, height: 900 });
    await desk.page.goto(`${BASE}?get=1`, { waitUntil: "networkidle0" });
    await desk.page.waitForSelector(".getapp", { timeout: 5000 });
    check("on a computer, it gives the link to open on a phone", (await text(desk.page, ".getapp__link")) === BASE, await text(desk.page, ".getapp__link"));

    const plain = await fresh();
    await plain.page.goto(BASE, { waitUntil: "networkidle0" });
    await enterZip(plain.page, "start", "90012");
    await waitCard(plain.page);
    await passCards(plain.page, LIMIT + 2);
    check("the app at its own address has no swipe limit", !!(await topName(plain.page)) && (await plain.page.$eval("#preview-note", (n) => n.hidden)));
    await plain.page.click("#area-chip");
    await plain.page.waitForSelector(".sheet.is-open");
    await sleep(400);
    check("the search sheet offers Get the app", /Get HowLocal on your phone/.test((await text(plain.page, ".panel")) || ""));
  }

  /* 4. Opening without a connection (local only: the test needs to switch the server off) */
  if (!SITE) {
    const { page } = await fresh();
    await page.goto(BASE, { waitUntil: "networkidle0" });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload({ waitUntil: "networkidle0" });
    check("the offline helper is running", await page.evaluate(() => !!navigator.serviceWorker.controller));
    await enterZip(page, "start", "90012");
    await waitCard(page);
    await sleep(800);
    const before = await topName(page);
    await page.setOfflineMode(true);
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitCard(page);
    await sleep(500);
    check("with no connection, the app still opens and deals cards", !!(await topName(page)), `before: ${before}`);
    check("the brand font still loads offline", await page.evaluate(() => document.fonts.check('800 20px "Poppins"')));
    await page.screenshot({ path: join(shots, `${LABEL}-06-offline.png`) });
  }
} catch (err) {
  check(`run completed (${err.message.split("\n")[0]})`, false);
}

check("no script errors", problems.length === 0, problems.slice(0, 3).join(" | "));

await browser.close();
if (server && server.listening) server.close();
partner.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${LABEL}: ${results.length - failed.length} of ${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
