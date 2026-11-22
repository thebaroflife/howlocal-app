# HowLocal TikTok posts

Short videos for the HowLocal TikTok account, drawn in HowLocal's own style and rendered for free
on any computer with Chrome and ffmpeg. No paid tools, no AI-generated pictures.

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

## Rules for every post

- **Facts are checked on the web before a post is made**, and the pages used go in `sources`.
  Check that the place is still open. Use only facts a source states (founded year, what it's known for).
- **No invented rankings or reviews.** "Which is better" is the viewers' call.
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

   Each post becomes `social/out/<id>.mp4` (1080x1920, 30 fps, 12 seconds) and `<id>-cover.png`.
   `social/out/captions.md` has every caption ready to paste. Places used are logged in `used.json`.
4. Upload in TikTok, paste the caption, add a sound from TikTok's library (the videos have a silent
   track so any sound can go on top).

`social/out/` isn't saved in the repo; the videos are delivered separately.

## Files

| File | What it is |
|---|---|
| `template.html` | The look and motion of each format |
| `render.mjs` | Steps the template frame by frame and encodes the video |
| `suggest.mjs` | Finds matchup ideas in the listings |
| `posts.json` | The posts, with their checked facts and sources |
| `used.json` | Places already posted, so they aren't repeated too soon |
| `series.json` | The order of spots for How Local Are You To This?! |
| `photos.json`, `fetch-photos.mjs`, `media/` | Openly licensed photos and their credits |
