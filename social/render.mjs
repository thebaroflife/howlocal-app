// Turns the posts in social/posts.json into ready-to-upload TikTok videos.
//   node social/render.mjs                 every post
//   node social/render.mjs pasadena-burgers one post
// Writes social/out/<id>.mp4 (1080x1920, 30 fps, 10 s, H.264 with a silent sound track so
// TikTok's own music can be added), social/out/<id>-cover.png, and social/out/captions.md.
// Places used are added to social/used.json so they aren't picked again too soon.
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../scripts/serve.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const out = join(here, "out");
mkdirSync(out, { recursive: true });

const FPS = 30;
const SECONDS = 10;
const PORT = 8131;
const CHROME = process.env.CHROME_PATH || "/usr/bin/google-chrome";

const posts = JSON.parse(readFileSync(join(here, "posts.json"), "utf8"));
const only = process.argv.slice(2);
const todo = only.length ? posts.filter((p) => only.includes(p.id)) : posts;
if (!todo.length) throw new Error(`No post called ${only.join(", ")}`);

// Short checks so a post never goes out with a missing fact or a hook that runs off the screen.
for (const p of todo) {
  const problems = [];
  if (!["versus", "spotlight", "list"].includes(p.format)) problems.push(`unknown format ${p.format}`);
  if (!p.places?.length || p.places.some((pl) => !pl.name || !pl.street || !pl.city)) problems.push("a place is missing its name or address");
  if (!p.sources?.length) problems.push("no sources: every fact must be checked on the web first");
  if (p.hook.some((line) => line.length > 24)) problems.push("a hook line is longer than 24 characters");
  if ((p.caption + p.hashtags.join(" ")).length > 2000) problems.push("caption too long");
  if (problems.length) throw new Error(`${p.id}: ${problems.join("; ")}`);
}

function encoder(file) {
  const ff = spawn(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
      "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
      "-shortest",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS),
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      file,
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const done = new Promise((resolve, reject) => ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))));
  return { ff, done };
}

const server = await startServer({ port: PORT, dir: root });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"] });
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
page.on("pageerror", (err) => {
  throw err;
});
await page.goto(`http://127.0.0.1:${PORT}/social/template.html`, { waitUntil: "networkidle0" });

const usedFile = join(here, "used.json");
const used = existsSync(usedFile) ? JSON.parse(readFileSync(usedFile, "utf8")) : [];
const today = new Date().toISOString().slice(0, 10);

for (const post of todo) {
  const started = Date.now();
  const layout = await page.evaluate((p) => window.build(p), post);
  if (layout.overflow) throw new Error(`${post.id}: the layout runs off the screen`);
  const file = join(out, `${post.id}.mp4`);
  const { ff, done } = encoder(file);
  for (let i = 0; i < FPS * SECONDS; i++) {
    await page.evaluate((t) => window.seek(t), i / FPS);
    const jpg = await page.screenshot({ type: "jpeg", quality: 92 });
    if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await done;
  await page.evaluate(() => window.seek(6));
  await page.screenshot({ path: join(out, `${post.id}-cover.png`) });
  for (const pl of post.places) {
    if (!used.some((u) => u.osm === pl.osm && u.post === post.id)) used.push({ osm: pl.osm, name: pl.name, post: post.id, date: today });
  }
  console.log(`${post.id}.mp4  ${((Date.now() - started) / 1000).toFixed(0)} s`);
}

writeFileSync(usedFile, `${JSON.stringify(used, null, 2)}\n`);

const captions = todo
  .map((p, i) => `## ${i + 1}. ${p.id}.mp4\n\n${p.caption}\n\n${p.hashtags.join(" ")}\n\nChecked: ${p.sources.join(" , ")}\n`)
  .join("\n");
writeFileSync(join(out, "captions.md"), `# HowLocal TikTok posts\n\nUpload each video, paste its caption, and add a sound from TikTok's library.\n\n${captions}`);

await browser.close();
server.close();
