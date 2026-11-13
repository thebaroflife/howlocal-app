// Copies the brand typeface (Poppins, SIL Open Font License) out of node_modules into assets/fonts
// so the app serves its own fonts and makes no third-party font requests.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "@fontsource", "poppins");
const out = join(root, "assets", "fonts");
mkdirSync(out, { recursive: true });

const weights = [500, 600, 800];
const subsets = ["latin", "latin-ext"];
for (const w of weights) {
  for (const s of subsets) {
    const name = `poppins-${s}-${w}-normal.woff2`;
    copyFileSync(join(src, "files", name), join(out, name));
    console.log("copied", name);
  }
}
for (const lic of ["LICENSE", "LICENSE.md", "OFL.txt"]) {
  if (existsSync(join(src, lic))) {
    copyFileSync(join(src, lic), join(out, "Poppins-LICENSE.txt"));
    console.log("copied license from", lic);
    break;
  }
}
