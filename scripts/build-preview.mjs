// Builds dist/preview.html: the whole app in one self-contained file with sample cards,
// for places that can't load outside data or extra files (such as a page published inside Claude).
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

// 1. Bundle the app's JavaScript, swapping in the preview settings.
const bundle = await build({
  entryPoints: [join(root, "js", "app.js")],
  bundle: true,
  format: "iife",
  target: "es2022",
  write: false,
  logLevel: "warning",
  plugins: [
    {
      name: "preview-config",
      setup(b) {
        b.onResolve({ filter: /(^|\/)config\.js$/ }, () => ({ path: join(root, "preview", "config.js") }));
      },
    },
  ],
});
const js = bundle.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

// 2. Inline the fonts into the stylesheet.
const css = read("css/app.css").replace(/url\("\.\.\/assets\/fonts\/([^"]+)"\)/g, (_, file) => {
  const b64 = readFileSync(join(root, "assets", "fonts", file)).toString("base64");
  return `url("data:font/woff2;base64,${b64}")`;
});

// 3. Inline the data the preview needs: sample cards and the West Coast ZIP table.
const data = {
  "data/sample-places.json": JSON.parse(read("data/sample-places.json")),
  "data/zips/9.json": JSON.parse(read("data/zips/9.json")),
};
// Keep the JSON safe to sit inside a script tag.
const lineBreaks = new RegExp(`[${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}]`, "g");
const dataJson = JSON.stringify(data).replace(/</g, "\\u003c").replace(lineBreaks, "");

// 4. Stitch it into the page.
let html = read("index.html");
const swap = (from, to) => {
  if (!html.includes(from)) throw new Error(`build-preview: expected to find ${from}`);
  html = html.replace(from, () => to);
};
swap("<title>HowLocal</title>", "<title>HowLocal Swipe Preview</title>");
swap('<link rel="manifest" href="manifest.webmanifest">\n', "");
swap('<link rel="icon" type="image/png" href="assets/favicon.png">\n', "");
swap('<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">\n', "");
swap('<link rel="stylesheet" href="css/app.css">', `<style>\n${css}</style>`);
swap(
  '<script type="module" src="js/app.js"></script>',
  `<script>window.__HL_DATA__ = ${dataJson};</script>\n<script>\n${js}</script>`,
);

mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist", "preview.html"), html);
console.log(`dist/preview.html  ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);
