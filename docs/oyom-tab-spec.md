# HowLocal on oyom.ai: spec for oyom.ai's weekly update

**Approved by the owner on 2026-11-12.** A $0 change: no new services, no new spending.

**Rule:** HowLocal and oyom.ai stay separate. This change lives only in the oyom.ai repository and
ships with oyom.ai's own Sunday update. oyom.ai only links to HowLocal and shows it in a frame from
HowLocal's own address. Nothing in oyom.ai copies HowLocal's code, and nothing in the HowLocal
repository changes oyom.ai.

## What to add

### 1. Menu item

- In the Menu panel, add **HowLocal** after "Mini Game", linking to `/howlocal`.
- Optional: the same item in the top bar list, after "Mini game".

### 2. Footer link

- Under **Company**, add **HowLocal app**, linking to `/howlocal`.

### 3. The page: `/howlocal`

Use oyom.ai's own page layout, header and footer. From top to bottom:

1. **Heading:** "HowLocal: swipe through local spots"
2. **Two short lines:**
   "Find independent shops and restaurants near your ZIP code. Swipe right to save a spot, left to pass, and it never comes back."
   "All of California for now. Built by OYO, on his own."
3. **The app in a phone frame**, centered:

   ```html
   <iframe
     src="https://thebaroflife.github.io/howlocal-app/?try=1"
     title="HowLocal app"
     allow="geolocation"
     loading="lazy"
     style="border:0; width:100%; max-width:390px; height:760px; border-radius:28px; background:#101A2E"
   ></iframe>
   ```

   - `?try=1` gives visitors 10 free swipes, then the app asks them to get it. That limit lives in
     the HowLocal app: oyom.ai doesn't need to do anything for it.
   - On phones narrower than 420px, let the frame fill the width and keep the 760px height.
   - The frame's own screens use HowLocal's navy, yellow and white. Don't restyle them.
4. **"Get the app" button** under the frame, linking to
   `https://thebaroflife.github.io/howlocal-app/?get=1` (opens in a new tab). It shows the steps to
   put HowLocal on a phone's home screen. When HowLocal is in the App Store and Google Play, this
   becomes two store buttons; the HowLocal side will say so in its notes.
5. **Credit line** at the bottom of the section: "Built by OYO, on his own."

Page title: "HowLocal: find local shops and restaurants by swiping | OYOM.ai".
Description: "Swipe through independent shops and restaurants near your ZIP code. Free. Built by OYO."

## Checks before shipping

- If oyom.ai sends a Content-Security-Policy header with `frame-src` or `child-src`, add
  `https://thebaroflife.github.io`.
- oyom.ai's own `X-Frame-Options: SAMEORIGIN` is fine: it controls who can frame oyom.ai, not what
  oyom.ai can frame.
- Load `/howlocal` on a phone-size screen: the frame shows the HowLocal start screen, a ZIP like
  90012 deals cards, and the Get the app button opens the steps in a new tab.
- Changelog line for customers: "New: HowLocal, a free app OYO built for finding local shops and
  restaurants, now has its own page."
- Don't name any AI services on the page (oyom.ai's existing rule).

## Questions

HowLocal's code, notes and status: https://github.com/thebaroflife/howlocal-app
