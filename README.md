# HowLocal

Swipe through the independent shops and restaurants near you. Right to save a spot, left to pass.

A simple web app for phones. No accounts, no backend, no API keys, nothing to pay for.

## What it does

- Enter a ZIP code (or use your location) and pick a distance from 1 to 50 miles.
- One business card at a time. **Swipe right** to save it, **swipe left** to pass.
- A passed place never comes back, even after you change ZIP or distance or reopen the app.
- One-step **Undo** for the last swipe.
- **Saved** list with address, hours, phone, website and directions.
- Independents only: chains are filtered out.
- Installs to the home screen from the browser's Share menu ("Add to Home Screen").

## Where the listings come from

Listings are fetched live, from the phone, from [OpenStreetMap](https://www.openstreetmap.org/copyright)
through its free public query servers. That data is volunteer-maintained: it has names, types, and often
addresses and hours, but **no photos or ratings**, and some listings are incomplete or out of date.
The app credits "OpenStreetMap contributors" as the data license requires.

The app covers a search circle with small cells and asks for one cell at a time: nearest first,
mixed with random cells farther out. Results are reused on the phone for a day, and areas you have
fully swiped are skipped for two weeks, so the app stays light on the free servers.

## Run it on your computer

```
npm install
npm run serve        # http://localhost:8080
```

`npm install` is only needed for the tests and build scripts. The app itself is plain files:
open it from any static web host.

## Tests

```
npm test             # logic: distance math, filters, never-show-again, undo, search coverage
npm run test:ui      # drives the app in a phone-size headless Chrome and saves screenshots
```

The browser test serves a made-up neighborhood in place of the map servers, so it runs offline.
It needs Chrome; set `CHROME_PATH` if it isn't at `/usr/bin/google-chrome`.

## Files

| Path | What it is |
|---|---|
| `index.html`, `css/app.css` | The page and its styles |
| `js/app.js` | Startup and screen logic |
| `js/deck.js` | The card stack and swipe gestures |
| `js/places.js` | Fetching, cleaning and ordering listings |
| `js/categories.js` | Which map tags count as a spot, with labels, colors and icons |
| `js/geo.js` | Distance math, the search grid, ZIP lookup |
| `js/store.js` | Saved list, passed list, settings and cache (kept on the device) |
| `js/ui.js` | Cards, details sheet, forms and messages |
| `js/config.js` | Settings: data servers, default distance, cache time |
| `data/zips/` | US ZIP code table, split by first digit |
| `preview/config.js`, `data/sample-places.json` | Settings and made-up cards for the preview build |
| `scripts/` | One-time generators (ZIP table, icons, fonts) and the preview build |
| `tests/` | Logic tests and the browser test |

## Hosting

The app is static, so any static host works. This repo is set up for GitHub Pages:
serve the `main` branch from the repository root. Every push updates the site.

`npm run build:preview` makes `dist/preview.html`, a single self-contained file with sample
cards, for places that can't load outside data.

## Known limits

- No photos or ratings (not in the open data).
- The free public map servers are meant for light use. Fine for testing and a small audience;
  a public launch should move to a pre-built data file or a paid places service.
- GitHub's free hosting is meant for prototypes, not for running a business. Launch on a regular host.
- Saved and passed lists live in the browser on one device. Clearing browser data clears them.

## Next steps

- Photos and ratings from a places service.
- Featured spots and a way for owners to add photos and offers.
- Accounts so lists follow you across devices.
- App Store and Play Store builds by wrapping this web app.

## Credits

- Map data © OpenStreetMap contributors, available under the Open Database License.
- Poppins typeface, SIL Open Font License (`assets/fonts/Poppins-LICENSE.txt`).
- ZIP code table generated from the `zipcodes` npm package.
