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
- [x] 9. First test with real listings on a phone: places didn't load. The free public map servers are overloaded, and their usage rules don't allow an app like this to lean on them. Approved fix (2026-11-12): build the listings into the app.

## Listings built into the app (approved 2026-11-12)

- [x] 10. Data build: `scripts/extract-places.py` pulls shops and food spots from the Southern California OpenStreetMap extract; `scripts/build-places.mjs` applies the app's own rules and writes `data/places/` tiles
- [x] 11. GitHub Actions job `refresh-listings.yml`: runs the data build monthly and on demand, commits the result
- [x] 12. App reads the tiles (`TileSource`); live map-server lookups removed; messages for ZIPs outside the covered area and for spots with nothing in range
- [x] 13. Tests: 49 logic tests, browser run with stand-in tiles (54 checks), browser run with real listings (13 checks), preview build (46 checks)
- [x] 14. README, plan and status notes updated
- [x] 15. Wide searches mix in places from farther out; empty stretches of the map are skipped at no cost
- [x] 16. Maker credit on the start screen and in About: "Built by OYO, on his own."

## Next phase (proposed 2026-11-12, waiting for approval)

Plan: section 10 of `implementation_plan.md`.

- [ ] 17. Try mode (`?try=1`): 10 cards, then the "Get the app" screen
- [ ] 18. Install to the home screen done properly: install steps, `sw.js`, manifest details; store links ready for later
- [ ] 19. Spec for the oyom.ai menu item and `/howlocal` page, handed to that site's weekly update
- [ ] 20. TikTok post builder in `social/` and a first sample batch
- [ ] 21. Tests and notes for all of the above

Small changes from the plan, made during the build:
- Added `preview/config.js` and `scripts/build-preview.mjs`: the Claude preview is built as one self-contained file.
- Added `scripts/serve.mjs`, `scripts/setup-assets.mjs`, `scripts/build-icons.py` and `tests/helpers.mjs` as support files.
- The start screen asks only for ZIP and distance. The food and shops filter is in the search-area sheet.
- "Hide" is worded as "Pass" throughout.
