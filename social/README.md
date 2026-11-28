# HowLocal TikTok posts

Short videos for the HowLocal TikTok account, drawn in HowLocal's own style and rendered for free
on any computer with Chrome, ffmpeg and Python (for the voice). No paid tools, no AI-generated pictures.

## Formats

| Format | What it shows | Ask in the caption |
|---|---|---|
| `versus` | Two shops or restaurants of the same kind in the same area | "Comment A or B" |
| `list` | Two or three spots in one area | "Which one first?" |
| `spotlight` | One must-try place with three checked facts | "Would you try it?" |

The winner of a matchup (most votes in the comments) can get its own `spotlight` later.

## Series: How Local Are You To This?! (Jeremy, Nov 18)

**Every daily batch also makes 2 series posts**, on top of the usual 5 ($0, same post maker).
Muse checks them and schedules them with the batch.

- **What it shows:** one hot spot from our own lists, the most iconic first. The series title is the
  hook, then the spot's real photo (same photo rules as every post) or its map card, its one best
  checked fact, and the closing challenge.
- **How to make one:** a `spotlight` post with
  - `"id": "series-<id of the spot's first post>"` and `"series": "How Local Are You To This?!"`
  - `"hook": ["How Local Are You", "To This?!"]`
  - the place copied from its first post, with `facts` cut to its single best fact
  - `"cta": ["How local are YOU to this?", "Drop your zip in the comments"]`
  - `"say": "<neighborhood>. How local are you to this?"` for the voice (see "The voice" below)
  - a caption that starts "How Local Are You To This?!" and ends "How local are YOU to this? Drop your zip 👇",
    hashtags starting with `#howlocalareyoutothis` and ending with `#howlocal`.
- **Which spots:** the next two in `series.json` (`queue`) that don't have a `series-` post yet. A spot
  already featured keeps its checked facts, photo and sources from its first post (still confirm it's
  open). The `used.json` repeat rule doesn't apply to the series. A spot that first ran in a 1 vs 1 post
  is queued as `<post id>/<place slug>` (e.g. `hollywood-hot-dogs/pinks-hot-dogs`) and its series post is
  `series-<post id>-<place slug>`, with that place's one fact as its fact. When the queue runs low, add the next
  hot spots to it (the businesses already featured first, then the plan shops from the outreach list),
  checked like any new post.
- **Delivery:** in the day's Drive folder as `S1 - <id>.mp4` and `S2 - <id>.mp4` (upload-sized like the
  others), their captions in the same `Captions YYYY-MM-DD` doc under the heading
  "Series: How Local Are You To This?!" (each with the line "Series: How Local Are You To This?!" for
  the posting note), and both listed in the Sync doc batch note. First two (Philippe, The Donut Hole)
  went in the 2026-11-18 folder.

## Better, still free (Jeremy via Muse, Nov 27)

Jeremy's word: keep the videos coming, make them better, keep them 100% free. From the Nov 28 batch on:

1. **Voice up.** The voice track is turned up to about -19.5 dB mean over the whole video (it was
   about -24 to -25 dB), with a limiter holding every peak at -1.5 dBFS, so it stays on top of the
   TikTok sound Muse adds low at upload. `voice.py` does it and prints each post's level.
2. **Hook in the first 2 seconds.** Lead with the neighborhood and the strongest checked fact
   ("The oldest deli in LA is hiding in Fairfax"), with the question on screen from frame 1: the
   hook's yellow second line asks it ("pick one", "books or records?"). The voice starts at 0.1 s.
   The fact must come from the post's `sources`, like every fact.
3. **A/B endings.** A 1 vs 1 (or list) post closes on a spoken choice, not an open question:
   "<A> or <B>? Drop your zip." `render.mjs` builds it from the place names; set `"ask"` when a name
   reads badly or a shorter choice works better (`"ask": "Books or records? Drop your zip."`). Keep
   `cta[1]` the same kind of choice ("Diner or pub first?").
4. **Loop the ending.** From 11.2 s everything under the header clears away, so the last frames
   show the opening line exactly like the first frame and the replay at 12 s has no jump.
5. **The series stays daily.** When the Sync doc names the winning zip (most zip comments) on a
   series post, the next batch's S1 caption opens with a shout-out to that zip ("Shout-out to
   90012 for the most zips yesterday!"). Only the zip, never a commenter's name or handle.
6. **Facebook copies with music** (Jeremy's follow-up). Facebook can't add a sound at upload the way
   TikTok does, so every render also writes `<id>-fb.mp4`: the same video with HowLocal's own music
   bed low under the voice. The bed is an upbeat 120 BPM groove that `voice.py` makes from sine
   waves and noise, the same under every post: free, no license, nobody can claim it. It sits about
   -30 dB between the lines and 6 dB lower while the voice speaks. Deliver each one next to its
   video in the day's Drive folder, same name plus `-fb` (`S1 - <id>-fb.mp4`); Muse's nightly mirror
   posts the `-fb` file to Facebook. TikTok keeps the plain file and its trending sound. New
   batches only: the 17 silent backlog Reels already on Facebook stay as they are.

## The voice (Jeremy, Nov 23)

Every video speaks twice, for TikTok's Local Feed: the neighborhood or city from the first frames
(starts at 0.1 s, done by 5 s), then the comment ask at 6 s (done by 11 s, before the loop): a 1 vs 1
or list post asks **"<A> or <B>? Drop your zip."** (Nov 27), a spotlight or series post asks
**"What neighborhood should we do next?"**. Jeremy approved the voice on Nov 23 on one condition:
production stays free. The voice is Kokoro (open source, `af_heart`), made on the same machine by
`voice.py`: no account, no paid tool, $0 per video.

- **Setup, once per machine:** `pip install --break-system-packages kokoro-onnx==0.6.1`. The model
  files (about 350 MB) download on the first render into `~/.cache/howlocal-voice` and are checked
  against fixed hashes.
- **The first sentence** is the post's `"say"` or, without one, its hook read out ("San Pedro pizza:
  pick one" becomes "San Pedro pizza. Pick one."); a "Must-try on <street>" hook gets ", in <city>"
  added. It must name the neighborhood or city and end before 5 s (the render stops if it runs long).
  **Series posts set `"say"`** with the neighborhood, e.g. `"say": "Fairfax Avenue. How local are you
  to this?"`; without it the voice only says the city.
- **The closing ask** of a 1 vs 1 or list post says the place names (see "Better, still free" 3);
  a post's own `"ask"` replaces it on any post. It must end by 11 s (the render stops if it runs long).
- **Check the names:** the render prints each line's sounds, including the business names in the
  ask. If a name comes out wrong, add it to `say_like` in `voice.json`: a respelling ("San Pedro" →
  "San Peedro") or exact sounds between slashes ("Sepulveda" → "/səpˈʌlvədə/").
- **Upload:** when adding the TikTok sound, keep the video's own sound turned up; it carries the voice.
- `HOWLOCAL_VOICE=off node social/render.mjs ...` makes the old silent videos. Only if the voice
  can't be installed, and say so in the batch note.

## Rules for every post

- **Facts are checked on the web before a post is made**, and the pages used go in `sources`.
  Check that the place is still open. Use only facts a source states (founded year, what it's known for).
- **No invented rankings or reviews.** "Which is better" is the viewers' call.
- **Proofread every line** (Jeremy, Nov 27, all platforms). Captions, hooks, card facts, CTAs, the
  spoken lines and the captions doc's notes need correct spelling, punctuation and grammar:
  professional, always. A playful misspelling or grammar bend only when it is clearly on purpose for
  fun (the series name "How Local Are You To This?!" stays as it is). Read each caption back before
  it goes to Muse. Watch for two sentences joined by only a comma, and for lists that switch subject
  halfway ("is known for its moles, won an award, and his children took over").
- **Paragraphs, never a wall of text** (Jeremy, Nov 27, all platforms; goes with the grammar rule).
  A short one-liner stays one line. Anything longer is split into short paragraphs with a blank line
  between them (`\n\n` in the `caption` in `posts.json`), so it reads clean on a phone:
  - 1 vs 1 or list: one paragraph per place, then the question on its own line (a "Both in ..." or
    "0.2 mi apart" line goes with the question).
  - Spotlight: one paragraph per fact sentence, then the question.
  - Series: "How Local Are You To This?!", then the fact (one paragraph per sentence), then
    "How local are YOU to this? Drop your zip 👇". A winning-zip shout-out goes first, on its own line.

  The hashtags stay below the caption as their own block. `render.mjs` stops when a caption over 120
  characters has no blank line in it, or when one paragraph runs over 320 characters. In the captions
  doc, each paragraph is its own paragraph with an empty one between them (a bare newline disappears
  in HTML), so Muse's copy into TikTok and Facebook keeps the breaks.
- **Photos and logos, three allowed sources** (photos on Google, Yelp, Instagram or a business's site
  belong to whoever took them, so they aren't copied):
  1. **Shot by the account owner** on the phone: put them in `social/private/` and use
     `"photo": { "file": "private/x.jpg", "kind": "own" }`.
  2. **Sent by the business** (photos and its logo), with its OK to post them:
     `"photo": { "file": "private/x.jpg", "kind": "business", "credit": "Name" }`,
     `"logo": { "file": "private/x-logo.png", "kind": "business" }`.
  3. **Openly licensed** on Wikimedia Commons or Mapillary (street-level, CC BY-SA 4.0): add it to
     `photos.json` (`"commons": "File:..."` or `"mapillary": "<image id>"`); the Fetch photos job downloads
     it with its credit, then use `"photo": { "name": "..." }`. The credit line shows on the photo.
     To find candidates, run the **Find photos** workflow (Actions tab, or
     `gh workflow run find-photos.yml -f posts="<ids>"`); it saves them in `social/candidates/<post>/`.
     Only use one that clearly shows that business.
- **Real photo whenever a free one exists** (Jeremy, Nov 14): a business with a free, openly licensed photo
  that clearly shows it gets that photo. If there is none, the card keeps the generic map look in the
  business's own colors with its checked facts. Mixed posts (one photo, one map) are fine.
  The app itself stays generic (map cards) until a business gives permission for its own photos and logo.
  `social/private/` is never saved in the public repo.
- **Each business's own colors** go on its card: `"brand": { "a": stripe color, "b": second stripe,
  "ink": text color, "paper": card color, "on": icon color on "a", "source": where the colors came from }`.
  Take them from the business's sign or website. The HowLocal frame (navy, yellow awning, wordmark,
  A/B badges) stays the same on every post.
- Chains are left out, same as in the app.
- Names, kinds and addresses come from the app's listings (`data/places/`).

## Making posts

```
node social/suggest.mjs              # ideas for matchups, from the listings
node social/suggest.mjs Burbank      # ideas in one city
```

1. Pick an idea and check both places on the web.
2. Add the post to `posts.json` (copy an existing one: `id`, `format`, `hook`, `places`, `cta`,
   `caption`, `hashtags`, `sources`). Hook lines: 24 characters at most. A 1 vs 1 post can set
   `"apart"` (e.g. "a few doors apart") when the distance label from the map points would be wrong,
   such as two shops with other storefronts between them.
3. Render:

   ```
   node social/render.mjs               # every post in posts.json
   node social/render.mjs burbank-bakeries
   ```

   Each post becomes `social/out/<id>.mp4` (1080x1920, 30 fps, 12 seconds, with the voice as its only
   sound), `<id>-fb.mp4` (the Facebook copy, music bed under the voice) and `<id>-cover.png`.
   `social/out/captions.md` has every caption ready to paste. Places used are logged in `used.json`.
4. Upload in TikTok, paste the caption, add a sound from TikTok's library on top, and keep the
   video's own sound (the voice) turned up. On Facebook the `-fb` copy goes up as it is.

`social/out/` isn't saved in the repo; the videos are delivered separately.

## Files

| File | What it is |
|---|---|
| `template.html` | The look and motion of each format |
| `render.mjs` | Steps the template frame by frame and encodes the video |
| `voice.py`, `voice.json` | The free voice: makes each post's spoken track; name fixes in `say_like` |
| `suggest.mjs` | Finds matchup ideas in the listings |
| `posts.json` | The posts, with their checked facts and sources |
| `used.json` | Places already posted, so they aren't repeated too soon |
| `series.json` | The order of spots for How Local Are You To This?! |
| `photos.json`, `fetch-photos.mjs`, `media/` | Openly licensed photos and their credits |
