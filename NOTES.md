# Build notes

Decisions made while building, where the brief left room or where following it
literally would have looked worse. Everything editable lives in `src/config.js`.

## Content assumptions (all editable in `src/config.js`)
- **Nikah time:** "after Namaz-e-Isha" is treated as **8:00 PM IST**; the countdown targets `2026-12-03T20:00:00+05:30`.
- **End times** (for calendars): Nikah 8:00–10:00 PM, Reception 8:30–11:30 PM IST. Both are guesses.
- **Map pins:** `mapsUrl` is empty for both events, so "Open in Google Maps" uses a search link built from `mapsQuery`. Paste the exact `maps.app.goo.gl/...` pins into `mapsUrl` before sending. The embedded map always uses the query, because short links can't be embedded.
- Page 04 has no `@BESPOKEDESIGNS._` credit in the source image, so there is nothing to keep there.
- **Music** starts 2.13 s into the track (`music.startAt`) and loops back to that point, not to 0.

## Asset pipeline (`tools/build_assets.py`)
- **Inpainting:** LaMa runs at **half resolution**. At full resolution it rebuilt faint ghosts of the erased letters. At 0.5× the fills are clean, and fine grain matched to the surrounding paper is added back. OpenCV Telea/NS were tried and left visible blotches (`--no-lama` still falls back to them).
- **Per-line fixes** in `tools/pages.json` (all checked visually):
  - The Bismillah's left hook and the left swash of the "M" in "Mohammed" run into flowers. The swash uses a hand-traced corridor (`corridor`) so foliage isn't erased with it. A few leaf pixels that touch the swash are still erased; they come back when the line reveals.
  - "SCRATCH TO REVEAL" and "Motiwala's" have exclusion boxes for an adjacent candle and for flower specks.
  - The script glows on page 05 ("Nikah", "Reception") reach about 60 px, so their erase masks are wider (`glow: 64`). Otherwise the clean plate showed a haze.
- **Alignment proof:** with every overlay shown on its clean plate at native size, MAD vs. the original is 1.55–1.91 / 255 on all five pages, with no extra error along overlay edges (`node tools/qa.mjs align`). The remaining difference is WebP compression.
- **Inner page:** the oval's lighting and the frame's inner shadow are flattened before the oval is feathered into the plain paper, so no oval "ghost" is left once the cover opens.
- **Loader monogram:** the outline is traced from the real embossed M&U (`src/generated/monogram-paths.json`), not typeset.
- **Candle detection** needs compact, upright blobs that are clearly brighter than their surroundings. The glowing step edges and the bride's dress are excluded.
- Re-run everything with `npm run assets` (about 3–4 minutes on CPU). Use `--only p05` for one page, or `--fx-only` to regenerate just the effect maps.

## Opening
- **Burgundy monogram fill (v2):** the letter mask covers the whole embossed letter. The bright upper face is found by luminance; the lower, unlit half of each stroke is filled down to where the letter's cast shadow starts. Earlier versions left a white rim along the bottom of every stroke. 38 small petals fall across the screen during the fill.
- *(previous)* **Burgundy monogram fill:** as the cover swings clear (1.5 s), burgundy ink (`#7A1626`) rises through the embossed M&U from the bottom up over 2.2 s, multiplied over the embossing so the relief still shows, while small petals drift down across it. The letter mask (`monogram-fill.webp`) comes from the letter faces, which are brighter than the textured paper, worked at 3× for smooth edges. Scrolling unlocks when the fill completes (3.55 s).
- **Swing curve:** the brief says `power2.inOut` to 180°, but that passes 90° (the cover disappears) after only about 1 s. The storyboard shows ≈60° at +0.8 s, ≈75° at +1.2 s and a thin sliver at +1.6 s. The visible half (0→90°) therefore uses `power2.out` over 0.15–1.9 s (≈55°/74°/87° at those checkpoints); the edge-on remainder to 180° is instant and invisible.
- The hinge is the visible left edge of the screen, not the off-screen edge of the over-scanned plate.
- With the cover closed, the inner page waits at scale 1.025 and brightness 0.92, then settles while the cover swings, as specified.
- Content under the closed cover is `inert`, so the first Tab lands on the cover.
- **Die-cut shadow:** the brief puts `filter: drop-shadow(...)` on the cover front. In WebKit (Safari, and every iOS in-app browser) a filter on a face inside a 3D-rotating parent renders as a flat colour, and `backface-visibility` stops working. The shadow is instead an inset shadow on an ellipse exactly at the window, plus a soft strip on the 6px right-edge peek. Both sit under the cover, deepen during the lift and fade as the cover swings. The front and back faces are swapped explicitly at 90°. Both Chromium and WebKit now match the storyboard frames.

## Layout: one continuous scroll (changed on request, 12 Nov 2026)
- The original brief's card stack (each page pinned while the next slides over it) was replaced, at the client's request, with **one continuous, seamless scroll** like zainab-mohammed.vercel.app: no pinning and no pages sliding over each other.
- The intro (inner page with the M&U) fills the screen like `object-fit: cover`, so the cover's die-cut window still lines up. Each design page is then shown **whole, at the column's width** (9:16 at 1449×2576), one after another.
- **Joins (no overlap):** pages sit edge to edge; nothing overlaps anything. Where two pages meet, the last 5% of the upper page and the first 5% of the lower page both fade into the same colour (the midpoint of their measured edge colours, `edges` in the manifest), so one design flows into the next. The intro stays pure cream to the bottom of the screen; page 02 fades in from that cream.
- The 14–86% safe area is automatic now, since the full plate width is always visible.
- On desktop the column is its own scroll container (Lenis wrapper and ScrollTrigger scroller). Resizing a window across 600 px reloads the page, so the two scroll modes never mix.

## Reveals
- With continuous scroll, **each line reveals once as it comes up into view** (its top passes 86% of the screen height). Lines that arrive together are queued in reading order: a script line occupies about 1 s before the next line starts, other lines stagger 0.18 s.
- **Glow bloom:** on the dark, glowing pages the overlay carries the design's own halo, so a `drop-shadow` outlined the whole halo as a cloud. The bloom there is a blurred copy, run through `contrast()` (which keeps only the bright letters) and screen-blended. The cream pages use the soft cream `drop-shadow` as written, because their overlays hug the letters.
- **Page 05 credit removed** at the client's request (`erase` in `tools/pages.json`); the other pages keep it. The erased area never belongs to an overlay.
- **Page 05 buttons** sit in the bands that are free of any text glow (measured as original minus clean plate): 41.5–46.5% (between "AGRIPADA" and the "Reception" glow) and 70.5–77% (below "BAY VIEW ISLAM GYMKHANA"). Each pill is sized to fit its band with air above and below. The lines fade by opacity only, so a part-faded glow never shows as a patch.
- **Page 05** is driven by scroll position and fully reversible: as the page rises from 72% to 2% of the screen height, the Nikah lines fade in one by one, then its "Tap for location" button, then (scrolling on) the Reception lines, then the second button. Scrolling back up fades them out in reverse, so the two locations never appear together until the guest scrolls for the second. Each button sits in the measured empty gap below its block (between "AGRIPADA" and "Reception", and below "BAY VIEW ISLAM GYMKHANA") and is sized to that gap, so it never touches text (checked in QA). A small "Scroll for the Reception" hint appears at the bottom of the screen if the guest pauses between the two blocks.

## Effects and performance
- Background effects (curtain sway, twinkles, crystal sweep, glows, candles, floor shimmer) **hold their last frame while the page is actively scrolling** and resume once it stops. Petals and dust keep moving. The scroll gets the whole frame budget, and the effects are too subtle for the pause to show.
- Ken Burns is a CSS animation, so it runs on the compositor with no JavaScript per frame. It runs only on visible pages.
- **Chandeliers sway** like slow pendulums hanging from the top of the page: hand-placed rectangles per page (`SWAY` in `build_assets.py`) that stop above the urns and flowers, each with its own phase, about 2–3 px at phone size. It runs in the same WebGL pass as the curtains, at up to 2× resolution so the crystals stay crisp, and on its own clock, so it never jumps when it pauses during a scroll.
- **Every visible page** gets its own WebGL renderer (at most 3 at once; off-screen ones are released), so chandeliers move on all pages, not just the one in the middle. The sway keeps running while scrolling.
- Image URLs carry the asset-build stamp (`?v=` from `manifest.v`), so rebuilt images are never served stale from a browser cache. It is transparent outside the curtain mask, so the crisp `<img>` shows everywhere else. It falls back to the static image if WebGL is missing, under reduced motion, or if the frame rate stays below 45 fps for 2 s while it is animating.
- **Loading:** before the tap only the cover parts, the page-02 plate (preloaded in `<head>`) and the label font load (**565 KB**). Everything else loads about one page ahead after the tap. The 2.2 MB music track starts buffering only once the cover is on screen, rather than at first paint, so it never competes with the cover on a slow connection.
- **Lighthouse (mobile, production build):** Performance 97–98, Accessibility 100, Best Practices 100, LCP 0.8 s, CLS ≤ 0.007. SEO is low on purpose (`noindex` and a `robots.txt` that disallows everything).
- **Frame rate:** 57–60 fps while scrolling at DPR 3 with the GPU. With 4× CPU throttling, headless Chromium measured 20–35 fps, and these runs are noisy: native touch scrolling stays on the compositor thread, but the scroll-linked tweens (page recede, parallax) update at that rate. In default headless mode Chromium renders with SwiftShader (CPU) and reports much lower numbers, which say nothing about phone GPUs. **Check on a real mid-range Android.**

## Music
- `play()` is called synchronously in the cover's tap handler. The fade runs through Web Audio (MediaElementSource → Gain), ramping 0 → 0.6 over 2.5 s, which was verified in WebKit and Chromium. Where supported, `navigator.audioSession.type = 'playback'` keeps iOS from silencing Web Audio with the ring/silent switch.
- If `play()` is rejected, the button switches to a "tap to play" state.
- The music button fades in after the cover has gone.

## QA helpers (URL parameters)
`?debug=plates` (asset debug page), `?debug=1` (text boxes, sparkle/candle points, curtain mask, safe area),
`?debug=align&page=p03` (one plate at native size with every overlay), `?fx=0` (effects off),
`?reveal=all` (all lines shown), `?open=1` (skip the opening), `?now=2026-12-03T21:00:00%2B05:30` (mock clock),
`?music=0`, `?motion=reduce`.

## Not verifiable here
- WhatsApp and Instagram in-app browsers, a real iPhone and a real Android phone: test after deploying.
- The WhatsApp preview card (`og.jpg`, 1200×630): send the live link to yourself to check it.
