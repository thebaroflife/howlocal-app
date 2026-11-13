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

## Rules for every post

- **Facts are checked on the web before a post is made**, and the pages used go in `sources`.
  Check that the place is still open. Use only facts a source states (founded year, what it's known for).
- **No invented rankings or reviews.** "Which is better" is the viewers' call.
- **No photos taken from other sites** (Google, Yelp, Instagram, the business's own site). They belong
  to whoever took them. Real photos only if the account owner shot them or the business sent them.
- Chains are left out, same as in the app.
- Names, kinds and addresses come from the app's listings (`data/places/`).

## Making posts

```
node social/suggest.mjs              # ideas for matchups, from the listings
node social/suggest.mjs Burbank      # ideas in one city
```

1. Pick an idea and check both places on the web.
2. Add the post to `posts.json` (copy an existing one: `id`, `format`, `hook`, `places`, `cta`,
   `caption`, `hashtags`, `sources`). Hook lines: 24 characters at most.
3. Render:

   ```
   node social/render.mjs               # every post in posts.json
   node social/render.mjs burbank-bakeries
   ```

   Each post becomes `social/out/<id>.mp4` (1080x1920, 30 fps, 10 seconds) and `<id>-cover.png`.
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
