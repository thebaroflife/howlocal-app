# HowLocal build checklist

Plan: `implementation_plan.md` (approved 2026-11-12). Rule for this build: free services only.

- [x] 1. Project setup: tooling, brand fonts, icons from the logo
- [x] 2. ZIP table (`data/zips/0.json` to `9.json`): 41,906 US ZIPs
- [x] 3. Core logic with tests: geo, categories, store, places (40 tests passing)
- [x] 4. Screens: start, swipe deck, saved, details, search area
- [x] 5. Phone-size browser run with screenshots (48 checks passing)
- [x] 6. Preview build with sample cards, published in Claude (44 checks passing on the build)
- [x] 7. GitHub repo `howlocal-app` and free Pages hosting: live at https://thebaroflife.github.io/howlocal-app/ (browser run against the live site: 48 checks passing, with stand-in listings)
- [x] 8. README and plan status
- [ ] 9. First test with real listings on a phone. The map servers can't be reached from the build workspace, so this is the one thing not yet verified.

Small changes from the plan, made during the build:
- Added `preview/config.js` and `scripts/build-preview.mjs`: the Claude preview is built as one self-contained file.
- Added `scripts/serve.mjs`, `scripts/setup-assets.mjs`, `scripts/build-icons.py` and `tests/helpers.mjs` as support files.
- The start screen asks only for ZIP and distance. The food and shops filter is in the search-area sheet.
- "Hide" is worded as "Pass" throughout.
