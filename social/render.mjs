// Turns the posts in social/posts.json into ready-to-upload TikTok videos.
//   node social/render.mjs                 every post
//   node social/render.mjs pasadena-burgers one post
// Writes social/out/<id>.mp4 (1080x1920, 30 fps, 12 s, H.264 with the HowLocal voice on its sound
// track and nothing else, so TikTok's own music can be added on top), social/out/<id>-cover.png,
// and social/out/captions.md. Places used are added to social/used.json so they aren't picked
// again too soon.
// The voice (Jeremy, Nov 23) says the area in the first seconds and asks "What neighborhood should
// we do next?" mid-video. It's free and runs here (social/voice.py). HOWLOCAL_VOICE=off renders
// the old silent track instead; only for when the voice can't be installed, and say so in the batch note.
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
const SECONDS = 12;
const PORT = 8131;
const CHROME = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const VOICE = process.env.HOWLOCAL_VOICE !== "off";
const PYTHON = process.env.HOWLOCAL_PYTHON || "python3";
// When the voice speaks: the area, said by 5 s, then the comment ask in the middle of the video.
const INTRO_AT = 0.3;
const INTRO_BY = 5;
const ASK = "What neighborhood should we do next?";
const ASK_AT = 6;

const posts = JSON.parse(readFileSync(join(here, "posts.json"), "utf8"));
const only = process.argv.slice(2);
const todo = only.length ? posts.filter((p) => only.includes(p.id)) : posts;
if (!todo.length) throw new Error(`No post called ${only.join(", ")}`);

// Photos and logos: every one must say where it came from.
//   { "name": "philippe-storefront" }                        openly licensed, from social/media/credits.json
//   { "file": "private/x.jpg", "kind": "own" }               shot by the HowLocal account owner
//   { "file": "private/x.jpg", "kind": "business", "credit": "Martino's Bakery" }   sent by the business
// Logos only come from the business itself: { "file": "private/x-logo.png", "kind": "business" }.
// social/private/ stays out of the public repo: those pictures were shared for HowLocal's posts only.
const creditsFile = join(here, "media", "credits.json");
const credits = existsSync(creditsFile) ? JSON.parse(readFileSync(creditsFile, "utf8")) : {};
function resolvePicture(pic, what, problems) {
  if (!pic) return null;
  if (pic.name) {
    const c = credits[pic.name];
    if (!c) return problems.push(`${what} "${pic.name}" hasn't been fetched yet (social/photos.json)`), null;
    return { file: `media/${pic.name}.jpg`, kind: "cc", credit: c.credit, license: c.license };
  }
  if (!["own", "business"].includes(pic.kind)) return problems.push(`${what}: say whose it is (kind "own" or "business")`), null;
  if (pic.kind === "business" && what === "photo" && !pic.credit) problems.push(`${what}: a business photo needs a credit`);
  if (!existsSync(join(here, pic.file))) return problems.push(`${what}: ${pic.file} is missing`), null;
  return pic;
}

// Short checks so a post never goes out with a missing fact or a hook that runs off the screen.
for (const p of todo) {
  const problems = [];
  for (const pl of p.places || []) {
    pl.photo = resolvePicture(pl.photo, "photo", problems);
    if (pl.logo && pl.logo.kind !== "business") problems.push(`logo for ${pl.name}: logos only come from the business`);
    pl.logo = resolvePicture(pl.logo, "logo", problems);
  }
  if (!["versus", "spotlight", "list"].includes(p.format)) problems.push(`unknown format ${p.format}`);
  if (!p.places?.length || p.places.some((pl) => !pl.name || !pl.street || !pl.city)) problems.push("a place is missing its name or address");
  if (!p.sources?.length) problems.push("no sources: every fact must be checked on the web first");
  if (p.hook.some((line) => line.length > 24)) problems.push("a hook line is longer than 24 characters");
  if ((p.caption + p.hashtags.join(" ")).length > 2000) problems.push("caption too long");
  if (p.say !== undefined && (typeof p.say !== "string" || !p.say.trim())) problems.push('"say" must be the sentence the voice opens with');
  if (problems.length) throw new Error(`${p.id}: ${problems.join("; ")}`);
}

// The voice's first sentence: the post's own "say" when it has one, otherwise the hook read out
// ("San Pedro pizza: pick one" -> "San Pedro pizza. Pick one."). It must name the neighborhood or
// city. A "Must-try on <street>" hook gets the city added; a series post should set "say".
function sayLine(post) {
  if (post.say) return post.say.trim();
  const place = post.places[0];
  if (post.series) return `${place.city}. How local are you to this?`;
  let line = post.hook.join(" ").replace(/:\s*/g, ". ").replace(/\s+/g, " ").trim();
  if (post.format === "spotlight" && !line.toLowerCase().includes(place.city.toLowerCase())) line += `, in ${place.city}`;
  line = line.replace(/([.?!]) ([a-z])/g, (_, mark, c) => `${mark} ${c.toUpperCase()}`);
  return /[.?!]$/.test(line) ? line : `${line}.`;
}

const voiceDir = join(out, "voice");
if (VOICE) {
  mkdirSync(voiceDir, { recursive: true });
  const jobs = todo.map((p) => ({
    id: p.id,
    seconds: SECONDS,
    lines: [
      { text: sayLine(p), at: INTRO_AT, by: INTRO_BY },
      { text: ASK, at: ASK_AT },
    ],
  }));
  writeFileSync(join(voiceDir, "lines.json"), JSON.stringify(jobs, null, 2));
  console.log("Voice:");
  const code = await new Promise((resolve) => spawn(PYTHON, [join(here, "voice.py"), join(voiceDir, "lines.json")], { stdio: "inherit" }).on("close", resolve).on("error", () => resolve(-1)));
  if (code !== 0) {
    throw new Error("The voice couldn't be made (see above). Install it with: pip install --break-system-packages kokoro-onnx==0.6.1 . Only if that can't work: HOWLOCAL_VOICE=off node social/render.mjs ... (silent videos; say so in the batch note).");
  }
}

function encoder(file, voice) {
  // The voice is mono: copy it to both sides at full level (a plain upmix would make it 3 dB quieter).
  const sound = voice ? ["-i", voice, "-filter:a", "pan=stereo|c0=c0|c1=c0"] : ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"];
  const ff = spawn(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
      ...sound,
      "-map", "0:v:0", "-map", "1:a:0",
      "-shortest",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS),
      "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
      "-movflags", "+faststart",
      file,
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const done = new Promise((resolve, reject) => ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))));
  return { ff, done };
}

const server = await startServer({ port: PORT, dir: root });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    ...(process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`] : []),
  ],
});
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
  const { ff, done } = encoder(file, VOICE ? join(voiceDir, `${post.id}.wav`) : null);
  for (let i = 0; i < FPS * SECONDS; i++) {
    await page.evaluate((t) => window.seek(t), i / FPS);
    const jpg = await page.screenshot({ type: "jpeg", quality: 92 });
    if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await done;
  await page.evaluate(() => window.seek(8));
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
const soundNote = VOICE
  ? "add a sound from TikTok's library, and keep the video's own sound turned up: it carries the HowLocal voice"
  : "add a sound from TikTok's library";
writeFileSync(join(out, "captions.md"), `# HowLocal TikTok posts\n\nUpload each video, paste its caption, ${soundNote}.\n\n${captions}`);

await browser.close();
server.close();
