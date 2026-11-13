# HowLocal swipe app — implementation plan (v1)

**Status:** Approved and built (2026-11-12).
**Goal:** A simple Tinder-style app that shows independent shops and restaurants near a ZIP code. Swipe right to save, swipe left to hide for good.

---

## Build status (2026-11-12, version 1.1)

- **The app shows real places.** Listings now ship with the app instead of being looked up live (see "Change after the first real test" below).
- **Covers Southern California for now:** about 28,700 independent shops and food spots, refreshed on the 1st of each month by a free job in this repository.
- **Tested.** 49 logic tests pass. Phone-size browser runs pass 54 checks with stand-in listings, 13 checks with the real listings, and 46 on the preview build.
- **Preview in Claude:** "HowLocal Swipe Preview", a private page that shows made-up sample cards.
- **Code location:** this repository (`thebaroflife/howlocal-app`). Nothing here touches any other site or repository.
- **Hosting:** GitHub Pages, served from the `main` branch.
- **Ground rules:** spend no money. Later goals: cut running costs, then ship to the Apple and Google app stores.

### Change after the first real test

The first test on a phone showed "Places didn't load". The free public map servers were overloaded, and their usage rules don't allow an app like this to lean on them. Approved fix: **build the listings into the app.**

- A GitHub Actions job (`refresh-listings.yml`) downloads the Southern California OpenStreetMap extract, keeps named shops and food spots, applies the app's own rules, and writes small listing files to `data/places/`.
- The app reads only its own files. No outside server is asked for anything while someone swipes, so there is nothing to overload and nothing to pay for.
- A ZIP outside the covered area is turned away with a message. Other regions can be added to the job later.
- Regional chains: besides brand tags and a list of national names, any name with 10 or more locations in the region is treated as a chain. Shared family-shop names such as "La Michoacana" are kept.
- Wide searches work outward from the center and mix in a few places at a time from random spots farther out.

Other changes from the plan below, made during the build:

- "Hide" is worded as "Pass" in the app.
- The start screen asks only for ZIP and distance. The food and shops filter is in the search-area sheet.
- The Claude preview is one self-contained file made by `scripts/build-preview.mjs` with `preview/config.js`. It carries ZIP codes starting with 9 only.
- Areas a person has fully swiped are remembered for two weeks and skipped, which keeps daily use fast.
- Support files added: `scripts/serve.mjs`, `scripts/setup-assets.mjs`, `scripts/build-icons.py`, `tests/helpers.mjs`, and for the listings `scripts/extract-places.py`, `scripts/build-places.mjs`, `scripts/tiles-lib.mjs`, `tests/real.smoke.mjs`.
- The app credits its maker on the start screen and in About: "Built by OYO, on his own."

Sections 4 and 7 below are the original plan. Where they mention live lookups from the phone or the free map servers, the change above replaces them.

---

## 1. Decisions in this plan

| # | Decision | Why |
|---|---|---|
| 1 | **Web app that installs to the home screen** (not an App Store app yet) | Works on any phone today, no Apple/Google developer accounts, can be wrapped for the stores later |
| 2 | **Listings from OpenStreetMap** (free, open map data) | No account, no API key, no bill. It also tags chains, so the app can show independents only |
| 3 | **No photos or ratings in v1** | Open map data doesn't have them. Cards use category art instead. Paid options are in section 8 |
| 4 | **No accounts.** Saved and hidden lists live on the phone | Keeps v1 basic. Sync across devices comes later |
| 5 | **Code in a new GitHub repo, hosted free on GitHub Pages** | Your GitHub (thebaroflife) is already linked. The app needs its own web address to pull live listings |
| 6 | **A private preview inside Claude with sample cards** | Lets you feel the swipe on your phone right away. Pages inside Claude are sandboxed and cannot load outside listings, so the preview uses clearly labeled sample businesses |

---

## 2. What the user sees

1. **Start** — HowLocal logo, ZIP field, radius slider (1–50 miles, default 5), and a choice of Food & drink, Shops, or Both. "Use my location" as an alternative to typing a ZIP (hosted version only).
2. **Swipe** — one business card at a time. Drag it or tap the ✕ / ♥ buttons. Tap the card for details. One-step **Undo**.
3. **Saved** — the places swiped right, with address, hours, phone, website and a Directions link.
4. **Settings** — change ZIP, radius or categories; reset hidden places (asks first); data credit.

Each card shows: name, type (for example "Thai restaurant" or "Bookstore"), distance, and address, hours and website when the data has them.

---

## 3. Swipe rules

- **Right = save.** Goes to the Saved list and never comes back into the deck.
- **Left = hide.** Never shown again on that phone, even after changing ZIP or radius or reopening the app.
- **Undo** reverses only the most recent swipe.
- Removing a place from Saved hides it too.
- The only way to bring hidden places back is "Reset hidden places" in Settings.
- Each business is tracked by its map-data ID, so the same place is recognized no matter where you search from.

---

## 4. How listings are found

- The ZIP is turned into a map point using a ZIP table bundled with the app (all US ZIPs, no outside service).
- The phone asks the public OpenStreetMap query service for named shops and food spots in small areas: closest first, mixed with random picks across the chosen radius, so a 50-mile setting doesn't only show the nearest few blocks.
- **Included:** restaurants, cafes, bakeries, dessert, bars, and retail shops (clothing, books, gifts, records, plants, toys, bikes and similar).
- **Left out by default:** anything tagged as a chain or brand; gas stations, car repair, banks; vape, tobacco, cannabis and adult shops. Easy to change.
- Results are kept on the phone for a day so repeat visits are fast and light on the free servers.
- Footer credit "© OpenStreetMap contributors" (required by the data license).

---

## 5. Files

Everything is new. Plain HTML, CSS and JavaScript: no framework, no build step, no backend, no API keys.

```
[NEW] index.html                  app shell: start, swipe, saved, settings
[NEW] css/app.css                 HowLocal theme (navy / yellow / white, Poppins), cards, swipe motion
[NEW] js/config.js                data source (live or sample), service addresses, defaults
[NEW] js/app.js                   startup and screen switching
[NEW] js/deck.js                  card stack, drag and tap swipes, undo
[NEW] js/places.js                fetch listings, drop chains, de-duplicate, order batches
[NEW] js/categories.js            map tags -> label, icon, color
[NEW] js/geo.js                   ZIP lookup, distance math, search-area picking
[NEW] js/store.js                 saved list, hidden list, settings, one-day cache
[NEW] js/ui.js                    details sheet, saved list, settings, messages
[NEW] data/zips/0.json ... 9.json ZIP -> coordinates, split by first digit
[NEW] data/sample-places.json     labeled sample cards for the in-Claude preview
[NEW] assets/                     logo.svg plus home-screen icons made from your logo
[NEW] manifest.webmanifest        home-screen install details
[NEW] scripts/build-zips.mjs      one-time generator for the ZIP table
[NEW] tests/*.test.mjs            logic tests
[NEW] tests/ui.smoke.mjs          phone-size browser run with screenshots
[NEW] README.md                   how to run it, host it, and what's next
[NEW] task.md                     build checklist
```

`[MODIFY]` none. `[DELETE]` none.

---

## 6. Testing

- **Logic tests:** a hidden place never reappears (across ZIP changes, radius changes and reloads); a saved place never reappears; undo; chain filter; distance stays inside the radius; no duplicates.
- **Phone-size browser run:** swipe by drag and by button, saved list, settings. Screenshots sent to you.
- **Live listings:** see the first risk below.

---

## 7. Limits and risks

1. **Live listings can't be tested from my workspace.** The map service refuses connections from it, so the first real-data test happens when you open the hosted app on your phone. Error and retry screens are built in, and I'll fix anything that shows up.
2. **Data quality varies.** OpenStreetMap is volunteer-maintained: some places lack hours or addresses, and a few closed businesses may linger.
3. **Free map servers are for prototypes.** Their guidance is roughly 10,000 requests a day, and public-facing apps are expected to move to their own copy of the data. Fine for testing; needs a pre-built data file or a paid source before a real launch.
4. **GitHub's free hosting is for prototypes too.** It needs a public repo on the free plan and isn't meant for running a business. Launch should move to a regular web host on your own domain.
5. **Saves are per phone.** Clearing browser data clears them.

---

## 8. Later (not in v1)

- **Photos and ratings via Google Places.** Needs your Google Cloud account with a card on file. Search calls: 1,000–5,000 free a month depending on detail level, then $32–$40 per 1,000. Photos: 1,000 free a month, then $7 per 1,000. Google has no chain filter.
- **Yelp** is paid only, with plans reported from about $229 a month.
- **Featured spots:** cards for places HowLocal has spotlighted on TikTok, plus a way for owners to add photos and offers. This is the "promote the business" side.
- Accounts and sync, App Store / Play Store wrapper, own domain.

---

## 9. What I need from you

1. **Approval** of this plan.
2. For the live version: an **empty public GitHub repo** (suggested name `howlocal-app`), then its name. I push the code; you switch on Pages in the repo settings. If Claude's GitHub access is limited to selected repos, the new one has to be added to that list.

The preview inside Claude needs nothing from you.

---

## Sources

- [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
- [Overpass API manual: usage of the public servers](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)
- [OpenStreetMap wiki: Overpass API public instances](https://wiki.openstreetmap.org/wiki/Overpass_API)
- [GitHub Docs: GitHub Pages plans](https://docs.github.com/en/enterprise-server@3.8/pages/getting-started-with-github-pages)
- [GitHub Docs: What is GitHub Pages (limits)](https://help.github.com/articles/what-is-github-pages)
- [TechCrunch: Yelp API pricing (2024)](https://techcrunch.com/2024/08/02/yelps-lack-of-transparency-around-api-charges-angers-developers)
