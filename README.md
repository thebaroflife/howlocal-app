# HowLocal

Swipe through the independent shops and restaurants near you. Right to save a spot, left to pass.

**Live site:** https://thebaroflife.github.io/howlocal-app/

A simple web app for phones. No accounts, no backend, no API keys, nothing to pay for.
Built by OYO, on his own ([oyom.ai](https://oyom.ai/)).

## What it does

- Enter a ZIP code (or use your location) and pick a distance from 1 to 50 miles.
- One business card at a time. **Swipe right** to save it, **swipe left** to pass.
- A passed place never comes back, even after you change ZIP or distance or reopen the app.
- One-step **Undo** for the last swipe.
- **Saved** list with address, hours, phone, website and directions.
- Independents only: chains are filtered out.
- Installs to the home screen: "Get the app" walks through it on iPhone and Android, and the
  installed app opens without a connection.
- **Try mode** for other websites: `?try=1` gives 10 free swipes, then asks people to get the app.
  `?get=1` opens the install steps. oyom.ai shows HowLocal this way (`docs/oyom-tab-spec.md`).

## Where it works

**Southern California for now**: San Luis Obispo and Kern counties down to the Mexican border.
A ZIP outside that area is turned away with a message. More regions can be added in
`.github/workflows/refresh-listings.yml`.

## Where the listings come from

The listings ship with the app, as small files in `data/places/`. The app reads only its own files:
nothing is asked of outside servers while someone is swiping.

The files are built from [OpenStreetMap](https://www.openstreetmap.org/copyright), a free map that
volunteers keep up. It has names, types, and often addresses and hours, but **no photos or ratings**,
and some listings are incomplete or out of date. Coverage is strong in the cities and thin in some
outlying areas. The app credits "OpenStreetMap contributors" as the data license requires.

### How the listings are refreshed

The **Refresh listings** job (GitHub Actions, free for public repos) runs on the 1st of each month,
and whenever the build rules change. It can also be started by hand from the repo's Actions tab.

1. Downloads the Southern California map extract from Geofabrik.
2. `scripts/extract-places.py` pulls out every named shop and food or drink spot.
3. `scripts/build-places.mjs` applies the app's own rules, drops chains and duplicates, and writes
   the listing files: one small file per map square about 1.4 miles tall, plus `index.json`.
4. Commits `data/places/` and republishes the site.

### What counts as a chain

- Anything tagged with a brand in the map data.
- A list of national chain names in `js/categories.js`.
- Any name with **10 or more locations** in the region (`CHAIN_AT` in `scripts/tiles-lib.mjs`),
  except names many unrelated family shops share, like "La Michoacana" or "Donuts".

Small local groups with fewer than 10 locations stay in.

### How the deck is dealt

The app covers the search circle with small cells and works outward from the center, so every place
in range is dealt exactly once. On wide searches it also borrows a few places at a time from random
cells farther out, so a 50-mile search isn't only the closest blocks. Areas that were fully swiped
are skipped for two weeks.

## Run it on your computer

```
npm install
npm run serve        # http://localhost:8080
```

`npm install` is only needed for the tests and build scripts. The app itself is plain files:
open it from any static web host.

To rebuild the listings yourself (needs Python 3 and `pip install osmium`):

```
curl -L -o region.osm.pbf https://download.geofabrik.de/north-america/us/california/socal-latest.osm.pbf
python3 scripts/extract-places.py region.osm.pbf raw-places.jsonl
node scripts/build-places.mjs raw-places.jsonl data/places "Southern California"
```

## Tests

```
npm test             # logic: distance math, filters, never-show-again, undo, listing files, search coverage
npm run test:ui      # drives the app in a phone-size headless Chrome and saves screenshots
npm run test:real    # the same browser, against the real listing files
npm run test:try     # try mode, the install steps, the app inside another site, offline opening
```

`test:ui` serves a made-up neighborhood in place of the listing files, so its results never change
with the data. Both browser tests need Chrome; set `CHROME_PATH` if it isn't at `/usr/bin/google-chrome`.
To run them against the live site: `SITE_URL=https://thebaroflife.github.io/howlocal-app/ npm run test:ui`
(or `test:real`).

## Files

| Path | What it is |
|---|---|
| `index.html`, `css/app.css` | The page and its styles |
| `js/app.js` | Startup and screen logic |
| `js/deck.js` | The card stack and swipe gestures |
| `js/places.js` | Reading, cleaning and ordering listings |
| `js/categories.js` | Which map tags count as a spot, with labels, colors and icons |
| `js/geo.js` | Distance math, the search grid, ZIP lookup |
| `js/store.js` | Saved list, passed list and settings (kept on the device) |
| `js/ui.js` | Cards, details sheet, forms and messages |
| `js/config.js` | Settings: where the listings are, default distance |
| `data/places/` | The listings: `index.json` and one file per map square |
| `data/zips/` | US ZIP code table, split by first digit |
| `preview/config.js`, `data/sample-places.json` | Settings and made-up cards for the preview build |
| `scripts/extract-places.py`, `scripts/build-places.mjs`, `scripts/tiles-lib.mjs` | The listings build |
| `scripts/` (others) | One-time generators (ZIP table, icons, fonts) and the preview build |
| `.github/workflows/refresh-listings.yml` | The monthly listings refresh |
| `js/install.js`, `sw.js` | Install steps, try mode count, offline opening |
| `docs/oyom-tab-spec.md` | How oyom.ai shows HowLocal (built in oyom.ai's own repo) |
| `social/` | TikTok post maker: see `social/README.md` |
| `tests/` | Logic tests and the browser tests |

## Hosting

The app is static, so any static host works. This repo is set up for GitHub Pages:
serve the `main` branch from the repository root. Every push updates the site.

`npm run build:preview` makes `dist/preview.html`, a single self-contained file with sample
cards, for places that can't load outside data.

## Known limits

- Southern California only, for now.
- No photos or ratings (not in the open data).
- Listings are as fresh as the last monthly refresh, and as complete as the open map is for that area.
- ZIP codes are placed at the middle of their area. For very large ZIPs that can be far from the
  shops; "Use my location" or a wider distance fixes it.
- GitHub's free hosting is meant for prototypes, not for running a business. Launch on a regular host.
- Saved and passed lists live in the browser on one device. Clearing browser data clears them.

## Next steps

- A second open data source to fill in thin areas.
- Photos and ratings from a places service.
- Featured spots and a way for owners to add photos and offers.
- Accounts so lists follow you across devices.
- App Store and Play Store builds by wrapping this web app (Apple $99 a year, Google Play $25 once).
  Fill in `CONFIG.stores` and the "Get the app" screen shows store buttons.

## Credits

- Map data © OpenStreetMap contributors, available under the Open Database License.
  Regional extract by Geofabrik.
- Poppins typeface, SIL Open Font License (`assets/fonts/Poppins-LICENSE.txt`).
- ZIP code table generated from the `zipcodes` npm package.
