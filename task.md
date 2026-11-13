# HowLocal build checklist

Plan: `implementation_plan.md` (approved 2026-11-12). Rule for this build: free services only.

- [x] 1. Project setup: tooling, brand fonts, icons from the logo
- [x] 2. ZIP table (`data/zips/0.json` to `9.json`): 41,906 US ZIPs
- [x] 3. Core logic with tests: geo, categories, store, places (40 tests passing)
- [x] 4. Screens: start, swipe deck, saved, details, search area
- [x] 5. Phone-size browser run with screenshots (48 checks passing)
- [/] 6. Preview build with sample cards, published in Claude (44 checks passing on the build)
- [/] 7. GitHub repo `howlocal-app` and free Pages hosting
- [/] 8. README and plan status

Small changes from the plan, made during the build:
- Added `preview/config.js` and `scripts/build-preview.mjs`: the Claude preview is built as one self-contained file.
- Added `scripts/serve.mjs`, `scripts/setup-assets.mjs`, `scripts/build-icons.py` and `tests/helpers.mjs` as support files.
- The start screen asks only for ZIP and distance. The food and shops filter is in the search-area sheet.
- "Hide" is worded as "Pass" throughout.
