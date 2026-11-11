# Marziya & Mohammed Umar: wedding invitation

A mobile-first, single-page invitation. The cover swings open, then five designed
pages follow in one scroll. The invitation text comes straight from the original
designs in `source/` and is never retyped.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
npm run preview    # serve dist/ on http://localhost:4173
```

The npm scripts call `node node_modules/...` directly, because the `&` in the
folder name breaks npm's `.bin` shims on Windows.

## Edit the content

Everything editable is in **`src/config.js`**: dates, times, venues, Google Maps
pins (`mapsUrl`), music, and every UI string. The calendar files in
`public/calendar/` are regenerated from it on every `dev` and `build`
(or run `npm run calendar`).

## Regenerate the images

The plates, text overlays, cover parts, effect maps, share image and icons are
all generated from `source/` (never modified) into `public/img/`:

```bash
python -m pip install pillow numpy scipy opencv-python-headless torch fire
python -m pip install --no-deps simple-lama-inpainting
npm run assets                       # everything (~3-4 min on CPU)
python tools/build_assets.py --only p05     # one page
python tools/build_assets.py --fx-only      # only the effect point maps
```

Line boxes and per-line tweaks live in `tools/pages.json`. To use a sharper cover,
drop a higher-resolution `01-cover.png` into `source/` and run `npm run assets`.

## QA

```bash
node tools/qa.mjs all                         # against the dev server
node tools/qa.mjs all http://localhost:4173   # against the production build
BROWSER=webkit node tools/qa.mjs opening,music,a11y
node tools/lighthouse.mjs                     # Lighthouse (mobile) on :4173
```

Screenshots and results land in `qa-shots/`. See `NOTES.md` for decisions,
measurements and the debug URL parameters.

## Deploy

Live at **https://marziya-mohammed.vercel.app**. The Vercel project
`marziya-mohammed` is connected to
[hahatim21-ops/Marziya-Mohammed](https://github.com/hahatim21-ops/Marziya-Mohammed):
every push to `main` builds and deploys to production automatically. Pushes to other
branches get preview URLs. Settings are in `vercel.json`; the share-image URLs use the
production domain (`VERCEL_PROJECT_PRODUCTION_URL`), so a custom domain added in
Vercel is picked up on the next deploy.

To change content: edit `src/config.js`, commit and push.

Still to do:
1. Paste the exact Google Maps pins into `mapsUrl` in `src/config.js` and push.
2. Send the link to yourself on WhatsApp to check the preview card.
3. Test on an iPhone and an Android phone, including inside WhatsApp and Instagram.
