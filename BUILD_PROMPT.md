# Build prompt: Marziya & Mohammed Umar Wedding Invitation Website

You are building a mobile-first, single-page wedding invitation website. Guests will mostly open it from a WhatsApp link on their phones. The site opens with a cover that swings open in 3D, copied from a reference reel. After that it is a single vertical scroll through five designed pages, with motion in every background, line-by-line text reveals, a scratch card, a countdown, venue maps and music.

Read this whole file before writing any code. Then build in the stages listed in section 15, checking your work with screenshots after each stage.

---

## 1. Files in this folder

```
source/                  ORIGINAL DESIGNS. Never modify these files.
  01-cover.png           941x1670. Burgundy embossed cover with cream oval and "M&U" monogram
  02-bismillah.jpg       1449x2576. Bismillah calligraphy + grandparents' blessings
  03-names.jpg           1449x2576. Parents' invitation line + "Marziya & Mohammed Umar"
  04-scratch-date.jpg    1449x2576. "Scratch to reveal the date" + "3rd & 4th December" + "Countdown"
  05-events.jpg          1449x2576. Nikah + Reception details
  06-regards.jpg         1449x2576. "Regards, Motiwala's"
  music.mp3              "Alfaaz" by Hamza Malik x Zain Zohaib, 3:05, 115 kbps
reference/
  opening-storyboard.png 7 frames of the reference reel's opening, with timings
BUILD_PROMPT.md          this file
```

The reference reel is https://www.instagram.com/reel/Ddq1K23oelL/ (by sugarinvite.mk). You cannot watch it, so use `reference/opening-storyboard.png` and the description in section 5.

**Key constraint: the invitation text is part of the images.** The client wants the designs used exactly as they are. Do not retype, redraw or "fix" any invitation text (including spelling) in HTML or fonts. To animate the text line by line anyway, you will cut each line out of the original image into its own transparent overlay. You will also make a "clean plate" of each background with that text erased (section 4). Live HTML text is used only for UI: buttons, the countdown digits, hints, the map sheet and screen-reader text.

---

## 2. Tech stack

- **Build:** Vite with vanilla JS (ES modules). No framework. Output is static files in `dist/`.
- **Animation:** GSAP (core + ScrollTrigger). **Lenis** for smooth wheel scrolling, with `syncTouch: false` so phones keep native touch scrolling, which works more reliably in WhatsApp and Instagram in-app browsers.
- **Background effects:** raw WebGL (one small shader) for the curtain sway; Canvas 2D for sparkles, petals and dust; CSS for glows.
- **Fonts (UI only):** self-hosted with `@fontsource`: *Cormorant Garamond* 500/600 for caps and numbers, *Pinyon Script* for script accents.
- **Asset pipeline:** Python 3 with Pillow, numpy, scipy and opencv-python-headless. Optionally use `simple-lama-inpainting` (LaMa) for better clean plates (section 4.2).
- **QA:** Playwright (Chromium + WebKit) for screenshots and automated checks.

Suggested structure:

```
tools/pages.json         page and line definitions (seed it from section 6)
tools/build_assets.py    generates everything in public/img from source/
public/img/...           generated plates, overlays, cover parts, fx point maps
public/audio/alfaaz.mp3  (+ optional .m4a)
public/calendar/*.ics
src/config.js            ALL editable content: dates, venues, map links, music, strings
src/main.js  src/opening.js  src/stack.js  src/reveal.js  src/scratch.js
src/countdown.js  src/sheet.js  src/calendar.js  src/music.js
src/fx/{curtains,sparkles,candles,petals,dust}.js
src/styles.css
index.html
```

**Palette:** burgundy `#5B0F1A`, deep wine `#2B0509`, wine `#7A1626`, cream `#F6E9DC`, champagne gold `#E3C79A`, warm glow `rgba(255,214,160,0.6)`.

---

## 3. Layout system: the "plate"

Every page is a **plate**: a box with the design's exact aspect ratio, 1449:2576. The cover's 941:1670 is effectively the same. The plate holds the background (clean plate image or WebGL canvas), the effect layers, and the text overlays, all positioned in **percent of the plate**. Because they share one transformed container, overlays always stay aligned with the background, even during zoom and parallax.

- Each page section is `100svh` tall (fall back to a `--vh` variable from `innerHeight` for older webviews). Set `ScrollTrigger.config({ ignoreMobileResize: true })` so the URL bar showing or hiding does not cause jumps.
- The plate fills its section like `object-fit: cover`, anchored at the centre.
- **Safe area:** all text and buttons sit between 14% and 86% of plate width. If a very narrow screen would crop into that, switch to fitting the safe area to the screen width. Fill any leftover space with a blurred copy of the same plate.
- **Desktop and tablet** (viewport wider than 600px): show the site in a centred phone-width column (max 440px wide, full height, 24px rounded corners when there's room). Behind it, show a blurred (40px), darkened (about 55%) enlargement of the current page's plate, cross-fading as pages change. The music button and map sheet stay inside the column.
- Always start at the cover: set `history.scrollRestoration = 'manual'` and scroll to 0 on load.

---

## 4. Asset pipeline (`tools/build_assets.py`)

Generate everything from `source/` into `public/img/` and make it re-runnable. Use `tools/pages.json` (section 6) for line names and approximate boxes, and refine every box from the actual pixels.

### 4.1 Text masks
For each text line in `pages.json`:
1. Expand the approximate box by about 1.5% and detect the text pixels in it:
   - **Light text on dark backgrounds** (pages 04, 05, 06): cream/white text with a soft glow. Detect pixels much brighter than the local background (for example, luminance above the local median plus 40, low saturation). Make a **core mask**, and a **glow mask** dilated about 16–22px at full resolution so the glow halo is included.
   - **Dark text on light backgrounds** (pages 02, 03): burgundy/brown text on cream. Detect pixels much darker and redder than the local background. Dilate about 3px. There is no glow.
2. Ignore chandeliers, candles, flowers and step lines that fall inside a box. Keep only connected components that look like text strokes, and check the result visually.
3. Save the tight bounding box of each mask back into a generated `public/img/manifest.json`, as x/y/w/h in % of the plate.

### 4.2 Clean plates (the background with the text erased)
- Combine all of a page's text masks (glow masks for light-text pages) into one inpaint mask and inpaint it.
- **Preferred:** LaMa via `pip install simple-lama-inpainting`, which downloads its model on first run. It fills curtain folds, steps and glow far better than OpenCV.
- **Fallback:** `cv2.inpaint(img, mask, 9, cv2.INPAINT_TELEA)`, then a light Gaussian blur inside the mask only.
- **Do NOT erase:** the `@BESPOKEDESIGNS._` credit (it stays in the plate on every page), and on page 04 the date lines "3RD & 4TH" and "DECEMBER", which must remain in the plate under the scratch card.
- Render each clean plate on its own and inspect it. Before a line is revealed, the guest sees the clean plate, so obvious smears are not acceptable. Adjust masks or switch methods until it looks natural.

### 4.3 Text overlays
For each line: RGBA crop of the **original** image, where alpha is the line's mask (glow-inclusive for light text) feathered with a 4–6px Gaussian. When every overlay is shown on top of the clean plate, the result must match the original image (checked in QA, section 16).

### 4.4 Cover parts (page 01)
The cream oval measures **x 191–735, y 415–1168 px** of 941×1670: centre (49.2%, 47.4%), horizontal radius 28.9% of width, vertical radius 22.5% of height. Detect it precisely: take the largest connected component of cream pixels (R>200, G>185, B>175), then `cv2.fitEllipse` on its contour.
- `cover-front.webp` (with alpha): the cover with the cream oval **cut out**, transparent and anti-aliased, inset about 2px. The burgundy double-line oval frame stays on the cover. This is the die-cut window.
- `inner-page.webp`: the full plate in cream paper. Use a base colour sampled from the median of the oval's paper, plus fine grain and a soft vignette. Composite the **whole original oval content** (paper + embossed "M&U") at exactly the same position, feathered about 20px at the ellipse edge. With the cover closed, the M&U is seen through the window. After opening, it sits in the same place on a plain cream page, just like the reel.
- `cover-back.webp`: plain deep burgundy paper with a subtle texture, used as the back face of the cover.
- `velvet.webp`: a crop of the cover's embossed burgundy swirl area away from the oval (for example the bottom 25%), darkened about 10%. It is the scratch-card texture.
- The cover is only 941px wide. If the client later drops a higher-resolution `01-cover.png` into `source/`, the pipeline must just work.

### 4.5 Effect point maps (per page → `fx-<page>.json`)
- **Chandelier sparkle points:** in the top ~42% of each plate, find small, very bright local maxima (luminance above 245, blob area 2–60px). Keep up to 150 per page, in % coordinates.
- **Chandelier glow centres:** centroids of the large bright masses in the top 42% (usually left, centre and right clusters).
- **Crystal mask:** a greyscale mask of the bright chandelier pixels in the top 45%, used to mask a moving light sweep.
- **Candle flames:** warm, bright blobs (R≥250, G≥200, area 15–700px) anywhere below 25% height. Store centre and size. Cap at 40 per page.
- **Curtain mask:** greyscale mask of the curtain fabric. Use hand-defined polygons per page after viewing the images, feathered 30px. It must be **zero** over every text box, chandeliers, flowers, urns and candles. Pages 02/03 have cream curtains at the sides and top. Pages 04/05/06 have burgundy curtains, mostly the top 0–60%.
- **Floor mask** (page 05): the reflective floor below about 74%.

### 4.6 Optimisation
- Plates and overlays: WebP (quality ~82, alpha quality ~85), widths 1080 and 1449, served with `srcset`.
- Preload the cover parts and the page-02 plate. Lazy-load the rest about one page ahead.
- Share image: generate `og.jpg` at 1200×630, under 300KB. Put the cover's oval and frame centred, with burgundy embossed texture extended to the sides.
- Favicon and app icon: the M&U oval on burgundy, 512px square, plus the standard sizes.

---

## 5. Page 01: cover and opening (copy the reference)

**What the reference does** (see `reference/opening-storyboard.png`):
1. A full-screen embossed cover with a die-cut **oval window**. The couple's names already show **through** the window, because they are printed on the inner card underneath.
2. The guest taps.
3. The cover **swings open like a book cover hinged on its LEFT edge**. It turns in 3D toward the viewer over **about 1.8s**: the oval squashes, the cover narrows to a thin sliver at the left, and then it is gone. A soft shadow passes across the inner card as it turns.
4. The inner card **never moves**. What was seen through the window is now on a plain page. Scrolling begins.

**Our version:** the window shows the **M&U monogram** on cream paper (`inner-page.webp`), and `cover-front.webp` sits on top.

**Loader:** until the cover and inner page are decoded (max 3s), show the M&U outline drawing itself in cream on deep burgundy. Then fade it to the cover.

**Idle state (before the tap):**
- Page scroll is locked. Keep `overflow:hidden` on `html` and call `lenis.stop()`.
- Light play on the embossed cover: a diagonal light band sweeps across every ~4.5s (soft-light blend, opacity ~0.35). The cover "breathes" between scale 1 and 1.008 over 5s.
- `filter: drop-shadow(0 6px 12px rgba(0,0,0,.35))` on the cover front, so the die-cut edge casts a shadow into the window onto the inner page.
- The inner page peeks about 6px along the right edge, as in the reel, hinting that the cover opens.
- **"TAP TO OPEN"** label at about 86% height: Cormorant Garamond caps, letter-spacing 0.35em, 12–13px, cream. Opacity pulses 0.45↔1 every 1.8s. A thin cream ring ripples out from the oval centre every 2.4s.

**On tap** (pointerup/click anywhere on the cover, or Enter/Space). Build it as one GSAP timeline:

| Time | What happens |
|---|---|
| 0.00 | **Start the music inside this same handler, synchronously** (section 12). Hide the label (0.2s). Ripple from the tap point. `navigator.vibrate?.(10)`. |
| 0.00–0.15 | Cover "lifts": scale 1→1.012, shadow deepens. |
| 0.15–1.95 | Cover `rotateY(0 → -180deg)`, `transform-origin: 0% 50%`, parent `perspective: 1800px`, `transform-style: preserve-3d`, front and back faces with `backface-visibility: hidden`. Ease `power2.inOut`. The right edge swings **toward** the viewer and off to the left. A darkening layer on the cover face goes from opacity 0 to 0.45 as the angle nears 90°. |
| 0.15–1.95 | **Moving shadow on the inner page:** a left-anchored gradient `rgba(40,0,8,.55)→transparent`. Its width animates 0%→65%→0% and opacity 0→0.6→0, peaking at 60–75° of rotation. |
| 0.15–1.95 | Inner page settles: scale 1.025→1, brightness 0.92→1. |
| 2.00 | Remove the cover from the DOM. A light sweep passes across the embossed M&U. Petals begin, very sparse at first. |
| 2.40 | Unlock scrolling. Show a "SCROLL" hint at the bottom (a fine vertical line with a travelling dot, plus small caps). Hide it on the first scroll. |

The **inner page is the first scroll section**. The Bismillah page follows.

With `prefers-reduced-motion`, replace the 3D swing with a 0.8s cross-fade.

---

## 6. Pages and text lines (seed for `tools/pages.json`)

Boxes are **approximate** y-ranges in % of plate height, with x roughly 12–88%. Refine them from pixels (section 4.1). The text is shown here only for naming and screen-reader content. It is **not** to be re-typeset.

Reveal types (section 8): **caps** = small serif capitals; **script** = large calligraphic script; **italic** = italic serif lines; **arabic** = Arabic calligraphy.

**Page 02: Bismillah** (`02-bismillah.jpg`, dark text on light)

| id | text | y% | type |
|---|---|---|---|
| b1 | Bismillah calligraphy (Arabic) | 32.0–38.5 | arabic |
| b2 | IN THE NAME OF ALLAH, | 40.8–42.6 | caps |
| b3 | THE MOST BENEFICIAL , THE MOST | 43.6–45.8 | caps |
| b4 | MERCIFUL | 46.6–48.5 | caps |
| b5 | WITH THE BLESSINGS OF | 52.0–54.0 | caps |
| b6 | Late Jamal Abdullah & Late | 56.5–59.6 | italic |
| b7 | Hawabibi Jamal | 60.8–63.9 | italic |
| b8 | Late Siddik Merchant & Sofiya | 65.0–68.2 | italic |
| b9 | Siddik Merchant | 69.3–72.4 | italic |

The credit at ~83% stays in the plate.

**Page 03: Names** (`03-names.jpg`, dark text on light)

| id | text | y% | type |
|---|---|---|---|
| n1 | MR & MRS SABA & FAISAL MOTIWALA | 24.2–25.9 | caps |
| n2 | CORDIALLY INVITE YOU FOR THE WEDDING | 26.5–28.1 | caps |
| n3 | CEREMONY OF THEIR DAUGHTER | 28.6–30.3 | caps |
| n4 | Marziya | 32.0–42.4 | script |
| n5 | & | 42.6–47.8 | script (scale-in) |
| n6 | Mohammed Umar | 48.8–54.0 | script |
| n7 | ( S/O TASKEEN & FAROOQ MEMON ) | 55.4–57.1 | caps |

The credit at ~95.5% stays in the plate. Marziya's descender reaches toward the "&", so keep the masks separate.

**Page 04: Scratch + countdown** (`04-scratch-date.jpg`, light glowing text)

| id | text | y% | type |
|---|---|---|---|
| s1 | SCRATCH TO REVEAL | 36.5–39.0 | caps |
| s2 | THE DATE ! | 40.4–42.7 | caps |
| (plate) | 3RD & 4TH / DECEMBER | 47.4–58.8 | **kept in plate, under the scratch card** |
| s3 | COUNTDOWN UNTIL THE BIG | 66.6–69.5 | caps |
| s4 | DAY ! | 70.8–73.0 | caps |

Live UI: scratch card at x 22–78%, y 45.6–60.6%. Countdown at y 75.5–83.5%. "Save the Dates" button at y 86–90%.

**Page 05: Events** (`05-events.jpg`, light glowing text). Two phases, see section 9.

| id | text | y% | type | phase |
|---|---|---|---|---|
| e1 | Nikah | 15.3–21.6 | script | A |
| e2 | 03 DECEMBER 2026 | 24.1–27.0 | caps | A |
| e3 | AFTER NAMAZ E ISHA | 30.3–32.6 | caps | A |
| e4 | AKASH MASJID, GHAS GALI | 35.5–37.9 | caps | A |
| e5 | AGRIPADA | 39.2–41.3 | caps | A |
| e6 | Reception | 48.9–56.1 | script | B |
| e7 | 04 DECEMBER 2026 | 57.6–60.6 | caps | B |
| e8 | 8:30 PM ONWARDS | 62.5–64.8 | caps | B |
| e9 | BAY VIEW ISLAM GYMKHANA | 67.3–69.7 | caps | B |

Live UI: Nikah "Tap for location" button centred at y ≈ 44.6%. Reception button centred at y ≈ 74.5%. The credit at ~93.5% stays in the plate.

**Page 06: Regards** (`06-regards.jpg`, light glowing text)

| id | text | y% | type |
|---|---|---|---|
| r1 | Regards, | 39.2–43.3 | italic |
| r2 | Motiwala's | 45.0–52.2 | script |

The credit at ~59% stays in the plate.

**Screen-reader text:** add a visually hidden block per section containing that page's full text, exactly as written above.

---

## 7. Scroll experience: stacked pages

Section order: **inner page (M&U) → 02 Bismillah → 03 Names → 04 Scratch → 05 Events (pinned, two phases) → 06 Regards**.

- **Card-stack transition:** each page is pinned while the next one slides up over it (ScrollTrigger, scrubbed). The outgoing page scales 1→0.92, its brightness drops 1→0.5, and it gains about 18px rounded corners. The incoming page has a soft shadow on its top edge.
- **Inside each plate:** gentle parallax tied to scroll (translateY −3%→+3%), plus a slow idle Ken Burns zoom (scale 1→1.035 over 18s, alternating). Apply both to the plate container, so overlays move with the background.
- No scroll-snap. It conflicts with pinning, and Lenis gives the smooth feel.

---

## 8. Text reveal system

Each line overlay starts hidden, so the clean plate shows. Each line animates in **once** when its page has settled in view (about 55% visible or the stack transition is complete). Lines are staggered by 0.18s in reading order.

- **caps:** opacity 0→1, translateY 14px→0, `blur(8px)→0`, 0.9s, `power3.out`.
- **script:** a feathered left-to-right mask wipe, like handwriting: animate `mask-position` of a soft linear-gradient mask over 1.3–1.6s. As it finishes, a warm glow blooms (drop-shadow 0→18px cream, then settles at 6px).
- **italic:** fade-up with blur like caps, plus a short left-to-right wipe (0.9s).
- **arabic (Bismillah):** a **right-to-left** wipe over 1.6s, following the direction of Arabic, then a faint golden shimmer passes once across it.
- The "&" on page 03 scales 0.85→1 with a fade and glow between the two names.
- Reduced motion: plain 0.4s fades, no blur and no wipes.

---

## 9. Page-specific behaviour

### 9.1 Page 04: velvet scratch card + countdown
**Scratch card** (Canvas 2D over the date area, x 22–78%, y 45.6–60.6% of the plate):
- **Look:** burgundy velvet, using `velvet.webp` as the texture, plus fine noise grain and a slow diagonal sheen moving across like light on velvet. The shape is a rounded plaque (about 28px radius) with a **double hairline rim** echoing the cover's oval frame: an outer line in light burgundy and an inner line in champagne at 60%.
- Centred on the plaque: "Scratch here" in Pinyon Script, cream at 85%, with a subtle embossed effect (1px light offset up-left, 1px dark offset down-right). Above it, a small looping hint: a finger icon swiping left and right.
- **Mechanics:** pointer events. `destination-out` brush with a radius of about 26 CSS px (scale for devicePixelRatio, cap DPR at 2). Interpolate between pointer samples so strokes are continuous. Tiny burgundy velvet flecks fall from the brush point.
- Set `touch-action: none` on the canvas. Call `lenis.stop()` on pointerdown and `lenis.start()` on pointerup/cancel, so scratching never scrolls the page.
- **Progress:** every ~200ms, sample alpha on a downscaled grid. At **55% cleared**, fade out the rest (0.6s).
- **On reveal:** burst of rose petals (burgundy and cream) from the plaque centre with gravity. Warm glow pulse over the date (screen-blended radial gradient). `navigator.vibrate?.(25)`. The countdown digits do one celebratory pulse, and the "Save the Dates" button fades in.
- **Accessibility:** a visually hidden "Reveal the date" button that clears the card. Reduced motion: the card fades out on tap.

**Countdown** (live UI, y 75.5–83.5%, centred, max 70% of plate width, clear of the candles at the sides):
- Target: **`2026-12-03T20:00:00+05:30`** (Nikah; "after Isha" is treated as 8:00 PM IST, editable in config).
- Four cells: DAYS · HOURS · MINUTES · SECONDS, separated by thin champagne dividers.
- Numbers: Cormorant Garamond 500, cream, `text-shadow: 0 0 12px rgba(255,220,180,.7)` to match the glowing text in the design. Labels: small caps, letter-spacing 0.2em.
- Digit change: old digit rolls up and fades while the new one rolls in from below (0.4s).
- Visible from the start: it reveals in with the page's text and ticks every second.
- After the target: show "The big day is here". After `2026-12-05`: show "Thank you for celebrating with us". Both strings live in config.

**"Save the Dates" button:** opens a small sheet (same style as section 11) listing both events, each with **Google Calendar** and **Apple / Outlook (.ics)** options.

### 9.2 Page 05: one location at a time
The client's rule: **do not reveal both locations together.** The guest taps once to see the first location, and only after scrolling further does the second appear.

Pin page 05 for about **2 viewport heights** of scrolling:
- **Phase A, on entry:** Nikah lines e1–e5 reveal. Then the **"Tap for location"** button fades in under "AGRIPADA" (y ≈ 44.6%). Reception lines e6–e9 stay hidden; the clean plate shows there.
  - Button style: pill, burgundy glass (`backdrop-filter: blur(8px)`, `rgba(43,5,9,.55)`), 1px champagne border, a map-pin icon, and "Tap for location" in Cormorant Garamond caps 12px letter-spaced 0.2em. A soft champagne ring pulses around it every 2s.
  - Tap opens the **location sheet for the Nikah** (section 11).
  - After the sheet is closed, or after 4s without a tap, show a small hint: "Scroll for the Reception ↓".
- **Phase B, scrolling down through the pin (progress about 0.45→0.8):** Nikah lines dim slightly (opacity → 0.55). Reception lines e6–e9 reveal (script wipe for "Reception", then the caps). Then the second **"Tap for location"** button appears (y ≈ 74.5%) and opens the **Reception sheet**.
- The floor below about 74% gets a subtle animated reflection shimmer: a slow horizontal wave of light masked to the floor.

### 9.3 Page 06: Regards
"Regards," then "Motiwala's" reveal (script wipe plus glow bloom). Petal density rises gently for a closing feel. At the very bottom, add a small, quiet "↺ View again" link that scrolls back to the inner page. It does not show the cover again.

---

## 10. Background motion ("effects over still images")

Run every effect only on sections in or near the viewport (IntersectionObserver), from one shared `requestAnimationFrame` loop. Pause everything when the tab is hidden.

1. **Curtain sway (WebGL):** render the clean plate as a texture and displace it gently inside the curtain mask:
   `uv.x += sin(uv.y*18.0 + t*0.8 + uv.x*6.0) * 0.0025 * mask * smoothstep(0.0, 1.0, uv.y)`
   This sways more toward the curtain bottoms, as if the curtains hang from the top. Add a slow light sheen moving across the folds (±4% brightness inside the mask). Keep the amplitude subtle, about 2–4px. Cap the canvas at DPR 1.5. If WebGL is missing, reduced motion is on, or FPS stays below 45 for 2s, fall back to the static image.
2. **Chandelier twinkles:** from the sparkle points, about 18 at a time animate a 4-point star glint (soft core plus two thin cross flares). Size 10–22px, scale 0→1→0 with rotate 0→45° over 0.9–1.6s, colour `#FFF4DE`, `mix-blend-mode: screen`. Use random points and timing.
3. **Crystal light sweep:** every ~6s a soft vertical band of light travels horizontally across the chandeliers, masked by the crystal mask, so the crystals glitter in sequence.
4. **Chandelier glow breathing:** radial glows at the glow centres, opacity 0.15↔0.35 over 4–6s, screen blend.
5. **Candle flicker:** for each flame, a radial glow (`rgba(255,190,110,.55)`→transparent, about 6× the flame width) with organic flicker driven by noise, not a fixed keyframe loop: opacity 0.55–1, scale 0.92–1.08, ±0.5px jitter. Screen blend. Use at most 15 per page on low-end devices (`hardwareConcurrency <= 4`).
6. **Falling rose petals:** one fixed Canvas 2D layer above the plates and below the UI. 10–16 petals on phones. Use 3–4 pre-rendered petal sprites with soft shading, in burgundy `#7D1022`, deep `#5A0B18` and cream `#F3E3D3`. They fall at 30–60 px/s with sinusoidal sway, rotate, and flip in 3D (scaleX = cos(phase)). Bursts on scratch reveal; denser on the last page.
7. **Gold dust:** 20–30 tiny blurred bokeh specks drifting slowly upward, opacity 0.2–0.6, screen blend.

With reduced motion: no sway, petals, twinkles or dust. Keep static glows.

---

## 11. Location sheet and calendar

**Location sheet** (one component, used for each event):
- Slides up from the bottom: translateY 100%→0, 0.6s `power3.out`. Backdrop: `rgba(20,2,6,.55)` with a 6px blur.
- Style: deep burgundy velvet gradient (`#4A0D14 → #2B0509`), 1px champagne hairline at the top, 24px top corners, drag handle. Inside: the event title in Pinyon Script ("Nikah" / "Reception"), then the venue in caps, then the date and time.
- **Map:** a lazy-loaded Google Maps iframe (only on first open), 100% wide, about 40vh tall, 16px corners. Use `https://maps.google.com/maps?q=<encoded query>&z=16&output=embed`, which needs no API key.
- Buttons: **"Open in Google Maps"** (primary, champagne) and **"Add to Calendar"** (secondary, opens Google / Apple-Outlook choices).
- Close with the X, a swipe down, a tap on the backdrop, or Escape. Lock page scroll while open (`lenis.stop()`). Trap focus while open and return it to the button on close.

**Map links:**
- Each event has `mapsUrl` in config, empty for now. If it is empty, build a search link: `https://www.google.com/maps/search/?api=1&query=<encoded query>`.
- If the client pastes a `maps.app.goo.gl` share link into `mapsUrl`, use it for the "Open in Google Maps" button. Keep using the query for the embed, because short links cannot be embedded.

**Calendar:**
- Google links: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=...&dates=...&details=...&location=...`
  - Nikah: `20261203T143000Z/20261203T163000Z` (8:00–10:00 PM IST)
  - Reception: `20261204T150000Z/20261204T180000Z` (8:30–11:30 PM IST)
- Generate `public/calendar/nikah.ics`, `reception.ics` and `both.ics` with UTC times and a reminder 1 day before. Serve them with `Content-Type: text/calendar` (add a `_headers` file for Netlify).
- All end times are assumptions and must be editable in config.

---

## 12. Music

- Copy `source/music.mp3` to `public/audio/alfaaz.mp3`. Also make a 96 kbps AAC `.m4a` with ffmpeg, and list both as `<source>`s.
- Preload after first paint. The track loops. `startAt` (seconds) is set in config, default 0.
- **Start inside the cover tap handler, synchronously:** `audio.play()` must be called directly in the pointerup/click handler, or iOS Safari and in-app browsers will block it. iOS ignores `audio.volume`, so fade in with the Web Audio API: create the `AudioContext` in the same tap, then MediaElementSource → GainNode → destination, and ramp the gain 0→0.6 over 2.5s.
- **Floating music button:** bottom-right, 44px, burgundy glass with a champagne ring. Three small equalizer bars animate while playing. Tapping toggles mute. Use `aria-pressed` and the label "Music on/off". If `play()` was rejected, show it in a "tap to play" state.
- Fade out and pause on `visibilitychange` → hidden. Resume on visible, unless the guest muted it.

---

## 13. `src/config.js` (the single place for editable content)

```js
export const CONFIG = {
  monogram: 'M&U',
  countdownTarget: '2026-12-03T20:00:00+05:30',   // Nikah, "after Isha" assumed 8:00 PM IST
  strings: {
    tapToOpen: 'Tap to open',
    scroll: 'Scroll',
    bigDay: 'The big day is here',
    thankYou: 'Thank you for celebrating with us',
    thankYouAfter: '2026-12-05T00:00:00+05:30',
    tapForLocation: 'Tap for location',
    scrollForReception: 'Scroll for the Reception',
  },
  music: { sources: ['/audio/alfaaz.m4a', '/audio/alfaaz.mp3'], startAt: 0, volume: 0.6, fadeInMs: 2500 },
  events: [
    { id: 'nikah', title: 'Nikah', when: '03 December 2026 · After Namaz-e-Isha',
      start: '2026-12-03T20:00:00+05:30', end: '2026-12-03T22:00:00+05:30',
      venue: 'Akash Masjid, Ghas Gali, Agripada',
      mapsQuery: 'Akash Masjid, Ghas Gali, Agripada, Mumbai', mapsUrl: '' },
    { id: 'reception', title: 'Reception', when: '04 December 2026 · 8:30 PM onwards',
      start: '2026-12-04T20:30:00+05:30', end: '2026-12-04T23:30:00+05:30',
      venue: 'Bay View, Islam Gymkhana, Marine Drive',
      mapsQuery: 'Bay View, Islam Gymkhana, Netaji Subhash Chandra Bose Road, Marine Lines, Mumbai', mapsUrl: '' },
  ],
};
```

---

## 14. Page head, privacy and sharing

- `<title>`: "Marziya & Mohammed Umar · Wedding Invitation"
- Description: "Nikah · 3 December 2026 | Reception · 4 December 2026 | Mumbai"
- Open Graph and Twitter tags using `og.jpg`. `theme-color` `#3B0810`.
- `<meta name="robots" content="noindex, nofollow">`: it's a private invitation.
- `lang="en"`, `viewport-fit=cover`, and respect `env(safe-area-inset-*)` for the music button and sheets.

---

## 15. Build stages (check after every stage)

After each stage, run the dev server, take Playwright screenshots at **390×844** (iPhone), **360×780** (Android) and **1440×900** (desktop), and look at them yourself before moving on. Fix what looks wrong; don't just check that the code runs.

1. **Assets:** pipeline, manifest and clean plates. Add a debug page (`?debug=plates`) that shows each clean plate and each plate with all overlays, side by side with the original.
2. **Cover + opening:** compare screenshots at 0.3s, 0.8s, 1.2s, 1.6s and 2.2s after the tap against `reference/opening-storyboard.png`. The hinge must be on the left, the inner page must never move, and the window must line up with the M&U exactly.
3. **Stacked scroll + text reveals** for all pages.
4. **Background effects:** curtains, twinkles, crystal sweep, glows, candles, petals, dust.
5. **Scratch card + countdown + Save the Dates.** Simulate a scratch drag in Playwright and confirm it reveals at 55% and the page doesn't scroll while scratching.
6. **Events page:** the two phases, both sheets, maps and calendar links.
7. **Music:** starts on the cover tap in WebKit, mute works, pauses when the tab is hidden.
8. **Final QA (section 16), then deploy (section 17).**

Only ask the client a question if you are genuinely blocked. Otherwise make a sensible choice and note it in a `NOTES.md`.

---

## 16. QA checklist

- [ ] **Alignment proof:** with `?fx=0` (effects off), once every line is revealed, each plate screenshot matches the original image at the same size: mean absolute difference under 2/255, and no visible edges around overlays.
- [ ] Clean plates show no obvious smears where text was.
- [ ] `?debug=1` overlay outlines the text boxes, sparkle/candle points, curtain mask and safe area. Off by default.
- [ ] The opening matches the storyboard: left hinge, swings toward the viewer, moving shadow, about 1.8s.
- [ ] Scroll is locked until the cover is opened, and every reload starts on the cover.
- [ ] Every text line reveals once, in reading order, and never pops in before its page settles.
- [ ] Page 05 never shows both locations together: Reception lines and the second button appear only in phase B.
- [ ] Countdown is correct with a mocked clock: before the target, after the target, and after 5 Dec.
- [ ] Calendar links and .ics files have the right UTC times.
- [ ] Map embed loads, and "Open in Google Maps" opens the right place.
- [ ] Music starts on the tap (WebKit), the fade works, mute works, and it pauses in the background.
- [ ] Reduced-motion mode works and keyboard users can open the cover, reveal the date and use the sheets.
- [ ] No horizontal scrolling and no jumps when the mobile URL bar hides.
- [ ] Lighthouse mobile performance ≥ 85. First view under 1.5 MB excluding audio. Smooth 60fps scrolling on a mid-range Android, which you can approximate with 4× CPU throttling.
- [ ] Works inside the WhatsApp and Instagram in-app browsers (test on a real phone after deploying).

---

## 17. Deploy

- `npm run build` creates `dist/`.
- Deploy to **Netlify** (`npx netlify deploy --prod --dir=dist`, or drag `dist/` onto app.netlify.com/drop) or **Vercel** (`npx vercel --prod`). Include the `_headers` file for the .ics content type.
- Give the client the live URL. Remind them to:
  1. paste the exact Google Maps pins into `mapsUrl` in `src/config.js`,
  2. send the link to themselves on WhatsApp to check the preview card,
  3. test on an iPhone and an Android phone.
