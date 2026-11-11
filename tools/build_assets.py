"""Generate every runtime image asset from source/ into public/img/.

    python tools/build_assets.py            # everything
    python tools/build_assets.py --only p04 # one text page (plus manifest)
    python tools/build_assets.py --no-lama  # OpenCV inpainting fallback

Re-runnable. The source/ folder is never modified. If a higher-resolution
01-cover.png is dropped into source/, the cover pipeline scales with it.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(__file__))
from masks import detect_page, detect_line, ellipse, pct_box_to_px, bbox_of, luminance  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'source')
OUT = os.path.join(ROOT, 'public', 'img')
GEN = os.path.join(ROOT, 'src', 'generated')
WIDTHS = [1080, 1449]
WEBP = dict(quality=82, alpha_quality=85, method=6)

# ---------------------------------------------------------------- helpers

def save_webp(img, path, width=None, **kw):
    im = img if isinstance(img, Image.Image) else Image.fromarray(img)
    if width and im.width != width:
        h = round(im.height * width / im.width)
        im = im.resize((width, h), Image.LANCZOS)
    opts = dict(WEBP)
    opts.update(kw)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, 'WEBP', **opts)
    return im.size


def pct(v, total):
    return round(v / total * 100.0, 4)


def rect_pct(x0, x1, y0, y1, W, H):
    return [pct(x0, W), pct(y0, H), pct(x1 - x0, W), pct(y1 - y0, H)]


def gauss(mask, sigma):
    k = int(sigma * 6) | 1
    return cv2.GaussianBlur(mask, (k, k), sigma)


# ---------------------------------------------------------------- inpainting

_lama = None


def get_lama():
    global _lama
    if _lama is None:
        from simple_lama_inpainting import SimpleLama
        _lama = SimpleLama()
    return _lama


def inpaint(rgb, mask, use_lama=True, scale=0.5):
    """Inpaint `mask` (uint8 0/255) in horizontal bands with context.

    LaMa runs at half resolution: at full resolution it reconstructs faint
    ghosts of the erased letters; at 0.5x the fills are clean. Fine grain
    matched to the surrounding paper is added back inside the mask.
    """
    H, W = mask.shape
    out = rgb.copy()
    rows = np.where(mask.any(1))[0]
    if len(rows) == 0:
        return out
    bands = []
    start = prev = rows[0]
    for r in rows[1:]:
        if r - prev > 160:
            bands.append((start, prev + 1))
            start = r
        prev = r
    bands.append((start, prev + 1))
    rng = np.random.default_rng(11)
    for (a, b) in bands:
        ctx = 240
        y0, y1 = max(0, a - ctx), min(H, b + ctx)
        crop = rgb[y0:y1]
        m = mask[y0:y1]
        if use_lama:
            lama = get_lama()
            cs = cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
            ms = (cv2.resize(m, (cs.shape[1], cs.shape[0]), interpolation=cv2.INTER_AREA) > 0).astype(np.uint8) * 255
            res = np.array(lama(Image.fromarray(cs), Image.fromarray(ms)).convert('RGB'))[: cs.shape[0], : cs.shape[1]]
            res = cv2.resize(res, (crop.shape[1], crop.shape[0]), interpolation=cv2.INTER_CUBIC)
        else:
            res = cv2.inpaint(crop, m, 9, cv2.INPAINT_TELEA)
            blur = cv2.GaussianBlur(res, (0, 0), 2.0)
            res = np.where(m[..., None] > 0, blur, res)
        # grain matched to a ring just outside the mask
        ring = (cv2.dilate(m, ellipse(25)) > 0) & (m == 0)
        cf = crop.astype(np.float32)
        hf = cf - cv2.GaussianBlur(cf, (0, 0), 1.2)
        gstd = float(np.std(hf[ring])) if ring.any() else 2.0
        noise = cv2.GaussianBlur(rng.normal(0, 1, m.shape).astype(np.float32), (0, 0), 0.6)
        noise *= gstd / max(1e-3, float(np.std(noise)))
        res = np.clip(res.astype(np.float32) + noise[..., None] * 0.9, 0, 255).astype(np.uint8)
        sel = m > 0
        out[y0:y1][sel] = res[sel]
    return out


# ---------------------------------------------------------------- text pages

def build_text_page(page, use_lama, manifest, fx_only=False):
    pid = page['id']
    rgb = np.array(Image.open(os.path.join(SRC, page['src'])).convert('RGB'))
    H, W = rgb.shape[:2]
    s = W / 1449.0
    light = page['polarity'] == 'light'
    cores = detect_page(rgb, page)
    if fx_only and pid in manifest['pages']:
        build_fx(pid, rgb, page, cores, manifest)
        return None

    # per-line erase regions (what gets inpainted)
    erase = {}
    for line in page['lines']:
        core = cores[line['id']]
        if light:
            g = line.get('glow', 26 if line['type'] in ('script', 'italic') else 18)
            e = cv2.dilate(core, ellipse(int(2 * g * s) + 1))
        else:
            e = cv2.dilate(core, ellipse(int(11 * s) | 1))
        for (rx0, rx1, ry0, ry1) in line.get('exclude', []):
            X0, X1, Y0, Y1 = pct_box_to_px([rx0, rx1, ry0, ry1], W, H, 0)
            # keep the glow off excluded objects (candles, flowers) but never cut the core
            e[Y0:Y1, X0:X1] = core[Y0:Y1, X0:X1]
        erase[line['id']] = e
    union = np.zeros((H, W), np.uint8)
    for e in erase.values():
        union |= e
    # text removed from the page entirely (inpainted, never shown as an overlay)
    removed = np.zeros((H, W), np.uint8)
    for item in page.get('erase', []):
        core = detect_line(rgb, item, page['polarity'], W, H, s)
        g = 18 if light else 0
        removed |= cv2.dilate(core, ellipse(int(2 * g * s) + 1)) if g else cv2.dilate(core, ellipse(int(11 * s) | 1))
    lines_union = union.copy()  # only these pixels are cut back in as overlays
    union = union | removed

    # ownership: every erased pixel belongs to its nearest line core
    ids = [l['id'] for l in page['lines']]
    dists = []
    for lid in ids:
        inv = np.where(cores[lid] > 0, 0, 255).astype(np.uint8)
        dists.append(cv2.distanceTransform(inv, cv2.DIST_L2, 5))
    owner = np.argmin(np.stack(dists, 0), 0)
    own = {lid: ((owner == i) & (lines_union > 0)).astype(np.uint8) * 255 for i, lid in enumerate(ids)}

    clean = inpaint(rgb, union, use_lama)
    pdir = os.path.join(OUT, pid)
    os.makedirs(pdir, exist_ok=True)
    for w in WIDTHS:
        save_webp(clean, os.path.join(pdir, 'plate-%d.webp' % w), w)
    save_webp(rgb, os.path.join(OUT, 'orig', '%s-1080.webp' % pid), 1080, quality=80)
    Image.fromarray(clean).save(os.path.join(ROOT, 'tools', '.cache', '%s-clean.png' % pid)) if os.path.isdir(os.path.join(ROOT, 'tools', '.cache')) else None

    feather = 5.0 * s
    lines_out = []
    for line in page['lines']:
        lid = line['id']
        o = own[lid]
        grow = cv2.dilate(o, ellipse(int(4 * feather) | 1)).astype(np.float32) / 255.0
        soft = gauss(grow, feather)
        # feather only outward into untouched plate (where clean == original)
        soft = np.where((union > 0) & (o == 0), 0.0, soft)
        alpha = np.maximum(soft, o.astype(np.float32) / 255.0)
        alpha8 = np.clip(alpha * 255 + 0.5, 0, 255).astype(np.uint8)
        bb = bbox_of(alpha8 > 1)
        x0, x1, y0, y1 = bb
        rgba = np.dstack([rgb[y0:y1, x0:x1], alpha8[y0:y1, x0:x1]])
        cb = bbox_of(cores[lid])
        for w in WIDTHS:
            f = w / W
            ow = max(1, round((x1 - x0) * f))
            oh = max(1, round((y1 - y0) * f))
            im = Image.fromarray(rgba, 'RGBA')
            if f != 1:
                im = im.resize((ow, oh), Image.LANCZOS)
            save_webp(im, os.path.join(pdir, '%s-%d.webp' % (lid, w)))
        lines_out.append({
            'id': lid, 'type': line['type'], 'text': line['text'],
            'phase': line.get('phase'),
            'rect': rect_pct(x0, x1, y0, y1, W, H),
            'box': rect_pct(cb[0], cb[1], cb[2], cb[3], W, H),
            'src': 'img/%s/%s-{w}.webp' % (pid, lid),
        })
    manifest['pages'][pid] = {
        'plate': 'img/%s/plate-{w}.webp' % pid,
        'orig': 'img/orig/%s-1080.webp' % pid,
        'polarity': page['polarity'],
        'sr': page['sr'],
        'lines': lines_out,
        'fx': 'img/fx-%s.json' % pid,
    }
    build_fx(pid, rgb, page, cores, manifest)
    return clean


# ---------------------------------------------------------------- effects

# Hand-defined curtain polygons (in % of plate) after viewing each image.
CURTAINS = {
    'p02': [
        [(0, 0), (100, 0), (100, 33), (88, 40), (82, 30), (70, 26), (64, 18), (36, 18), (30, 26), (18, 30), (12, 40), (0, 42)],
    ],
    'p03': [
        [(0, 0), (100, 0), (100, 62), (93, 55), (90, 30), (78, 22), (60, 13), (50, 11), (40, 13), (22, 22), (10, 30), (7, 55), (0, 62)],
    ],
    'p04': [
        [(0, 0), (100, 0), (100, 45), (92, 42), (86, 30), (70, 24), (66, 18), (34, 18), (30, 24), (14, 30), (8, 42), (0, 45)],
    ],
    'p05': [
        [(0, 0), (100, 0), (100, 52), (94, 54), (92, 72), (8, 72), (6, 54), (0, 52)],
    ],
    'p06': [
        [(0, 0), (100, 0), (100, 40), (92, 40), (86, 30), (72, 22), (66, 17), (34, 17), (28, 22), (14, 30), (8, 40), (0, 40)],
    ],
}

# Zones where chandeliers hang: no candle detection here.
CHANDELIER_ZONES = {
    'p02': [(0, 32, 0, 33), (68, 100, 0, 33), (36, 64, 0, 14)],
    'p03': [(0, 30, 0, 20), (70, 100, 0, 20), (36, 64, 0, 8)],
    'p04': [(0, 30, 0, 35), (70, 100, 0, 35), (36, 64, 0, 16)],
    'p05': [(0, 26, 0, 25), (74, 100, 0, 25), (36, 64, 0, 11)],
    'p06': [(0, 30, 0, 32), (70, 100, 0, 32), (36, 64, 0, 15)],
}

# Chandelier sway: each chandelier is a few rectangles (x0, x1, y0, y1 in %) that stop
# above the urns and flowers, hanging from the top of the plate, with its own phase.
SWAY = {
    'p02': [([(0, 28, 0, 16), (0, 24, 16, 31)], 0.0), ([(72, 100, 0, 16), (76, 100, 16, 33)], 2.1), ([(38, 62, 0, 13)], 4.0)],
    'p03': [([(0, 27, 0, 19)], 0.0), ([(73, 100, 0, 20)], 2.1), ([(40, 60, 0, 7)], 4.0)],
    'p04': [([(0, 30, 0, 17), (0, 21, 17, 34)], 0.0), ([(70, 100, 0, 17), (79, 100, 17, 35)], 2.1), ([(40, 60, 0, 15)], 4.0)],
    'p05': [([(0, 22, 0, 25)], 0.0), ([(78, 100, 0, 25)], 2.1), ([(42, 60, 0, 10)], 4.0)],
    'p06': [([(0, 28, 0, 14), (0, 21, 14, 31)], 0.0), ([(72, 100, 0, 14), (77, 100, 14, 32)], 2.1), ([(40, 60, 0, 13)], 4.0)],
}

# Areas where bright highlights are not candles (the couple's clothing on page 03).
NO_CANDLE = {
    'p03': [(25, 76, 58, 100)],
}


def poly_mask(polys, W, H):
    m = np.zeros((H, W), np.uint8)
    for poly in polys:
        pts = np.array([[x / 100.0 * W, y / 100.0 * H] for x, y in poly], np.int32)
        cv2.fillPoly(m, [pts], 255)
    return m


def build_fx(pid, rgb, page, cores, manifest):
    H, W = rgb.shape[:2]
    s = W / 1449.0
    L = luminance(rgb)
    R, G, B = [rgb[..., i].astype(np.int32) for i in range(3)]
    fx = {}

    # chandelier sparkle points (top 42%)
    top = int(0.42 * H)
    thr_s = min(245.0, float(np.percentile(L[:top], 99.3)))
    bright = ((L[:top] > thr_s)).astype(np.uint8) * 255
    n, lab, stats, cents = cv2.connectedComponentsWithStats(bright, 8)
    cand = []
    for i in range(1, n):
        a = stats[i, 4]
        if 2 * s * s <= a <= 60 * s * s:
            cx, cy = cents[i]
            cand.append((float(L[int(cy), int(cx)]) + a * 0.2, cx, cy, a))
    cand.sort(reverse=True)
    picked = []
    mind = 14 * s
    for v, cx, cy, a in cand:
        if all((cx - px) ** 2 + (cy - py) ** 2 > mind * mind for _, px, py, _ in picked):
            picked.append((v, cx, cy, a))
        if len(picked) >= 150:
            break
    fx['sparkles'] = [[pct(cx, W), pct(cy, H)] for _, cx, cy, _ in picked]

    # chandelier glow centres
    small = cv2.resize(L[:top], (W // 8, top // 8), interpolation=cv2.INTER_AREA)
    blur = cv2.GaussianBlur(small, (0, 0), 6)
    thr = max(np.percentile(blur, 88), 150)
    gm = (blur > thr).astype(np.uint8) * 255
    n, lab, stats, cents = cv2.connectedComponentsWithStats(gm, 8)
    glows = []
    for i in range(1, n):
        a = stats[i, 4] * 64
        if a > 4000 * s * s:
            cx, cy = cents[i] * 8
            r = np.sqrt(a / np.pi)
            glows.append([pct(cx, W), pct(cy, H), pct(r * 1.6, W)])
    glows.sort(key=lambda g: -g[2])
    fx['glows'] = glows[:6]

    # crystal mask (top 45%): bright chandelier pixels
    ctop = int(0.45 * H)
    cm = np.zeros((H, W), np.float32)
    cm[:ctop] = np.clip((L[:ctop] - 185) / 60.0, 0, 1)
    cm[:ctop] *= np.clip((ctop - np.arange(ctop)[:, None]) / (0.04 * H), 0, 1)
    # keep crystals only (exclude text, flowers): require chandelier zones
    zone = np.zeros((H, W), np.uint8)
    for (x0, x1, y0, y1) in CHANDELIER_ZONES[pid]:
        X0, X1, Y0, Y1 = pct_box_to_px([x0, x1, y0, y1], W, H, 0)
        zone[Y0:Y1, X0:X1] = 255
    zone = gauss(zone.astype(np.float32) / 255.0, 20 * s)
    cm *= zone
    cw = 360
    ch = round(H * cw / W)
    cmi = cv2.resize(cm, (cw, ch), interpolation=cv2.INTER_AREA)
    a8 = np.clip(cmi * 255, 0, 255).astype(np.uint8)
    rgba = np.dstack([np.full_like(a8, 255)] * 3 + [a8])
    save_webp(rgba, os.path.join(OUT, pid, 'crystal.webp'), quality=70, alpha_quality=70)
    fx['crystal'] = 'img/%s/crystal.webp' % pid

    # candle flames (below 25%)
    y25 = int(0.25 * H)
    flame = ((R >= 250) & (G >= 200)).astype(np.uint8) * 255
    flame[:y25] = 0
    for (x0, x1, y0, y1) in CHANDELIER_ZONES[pid] + NO_CANDLE.get(pid, []):
        X0, X1, Y0, Y1 = pct_box_to_px([x0, x1, y0, y1], W, H, 0)
        flame[Y0:Y1, X0:X1] = 0
    textzone = np.zeros((H, W), np.uint8)
    for lid, c in cores.items():
        textzone |= c
    flame[cv2.dilate(textzone, ellipse(int(30 * s) | 1)) > 0] = 0
    for k in page.get('keep', []):
        X0, X1, Y0, Y1 = pct_box_to_px(k['box'], W, H, 1.0)
        flame[Y0:Y1, X0:X1] = 0
    n, lab, stats, cents = cv2.connectedComponentsWithStats(flame, 8)
    flames = []
    for i in range(1, n):
        x, y, w, h, a = stats[i]
        if not (15 * s * s <= a <= 700 * s * s):
            continue
        # flames are compact, upright blobs; step-edge highlights and floor
        # reflections are long and thin
        if w > 0.025 * W or h > 0.03 * H:
            continue
        if not (0.5 <= h / max(1, w) <= 2.6) or a / float(w * h) < 0.35:
            continue
        # a flame is much brighter than the area around it (rules out bright walls)
        pad = int(max(w, h) * 1.5 + 6 * s)
        X0, X1, Y0, Y1 = max(0, x - pad), min(W, x + w + pad), max(0, y - pad), min(H, y + h + pad)
        blob = lab[Y0:Y1, X0:X1] == i
        ring = ~cv2.dilate(blob.astype(np.uint8), ellipse(int(4 * s) | 1)).astype(bool)
        if L[Y0:Y1, X0:X1][blob].mean() - np.median(L[Y0:Y1, X0:X1][ring]) < 28:
            continue
        cx, cy = cents[i]
        flames.append((a, [pct(cx, W), pct(cy, H), pct(w, W), pct(h, H)]))
    flames.sort(key=lambda f: -f[0])
    fx['candles'] = [f[1] for f in flames[:40]]

    # curtain mask
    cur = poly_mask(CURTAINS[pid], W, H)
    block = np.zeros((H, W), np.uint8)
    block |= cv2.dilate(textzone, ellipse(int(60 * s) | 1))
    for k in page.get('keep', []):
        X0, X1, Y0, Y1 = pct_box_to_px(k['box'], W, H, 2.0)
        block[Y0:Y1, X0:X1] = 255
    chand = (L > 200).astype(np.uint8) * 255
    chand[int(0.5 * H):] = 0
    block |= cv2.dilate(chand, ellipse(int(25 * s) | 1))
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    if page['polarity'] == 'dark':
        flowers = ((hsv[..., 1] > 110) & (hsv[..., 2] < 200)).astype(np.uint8) * 255
    else:
        flowers = ((hsv[..., 1] > 120) & (hsv[..., 2] > 60) & (R - G > 80) & (L < 120)).astype(np.uint8) * 0
        flowers |= ((L > 170)).astype(np.uint8) * 255  # urns, candles, cream flowers
    flowers = cv2.morphologyEx(flowers, cv2.MORPH_OPEN, ellipse(5))
    block |= cv2.dilate(flowers, ellipse(int(30 * s) | 1))
    cur[block > 0] = 0
    curf = gauss(cur.astype(np.float32) / 255.0, 30 * s / 2.0)
    curf = np.where(block > 0, 0, curf)
    cwm = 362
    chm = round(H * cwm / W)
    save_webp(np.clip(cv2.resize(curf, (cwm, chm), interpolation=cv2.INTER_AREA) * 255, 0, 255).astype(np.uint8),
              os.path.join(OUT, pid, 'curtain.webp'), quality=80)
    fx['curtain'] = 'img/%s/curtain.webp' % pid

    if pid == 'p05':
        yy = np.arange(H)[:, None] / H
        fl = np.clip((yy - 0.735) / 0.03, 0, 1) * np.ones((1, W))
        side = (L > 170).astype(np.uint8) * 255
        fl *= 1 - gauss(cv2.dilate(side, ellipse(31)).astype(np.float32) / 255.0, 12) * 0.7
        save_webp(np.clip(cv2.resize(fl.astype(np.float32), (cwm, chm), interpolation=cv2.INTER_AREA) * 255, 0, 255).astype(np.uint8),
                  os.path.join(OUT, pid, 'floor.webp'), quality=80)
        fx['floor'] = 'img/%s/floor.webp' % pid

    fx['sway'] = [{'rects': [list(r) for r in rects], 'phase': ph, 'bottom': max(r[3] for r in rects)} for rects, ph in SWAY.get(pid, [])]

    with open(os.path.join(OUT, 'fx-%s.json' % pid), 'w') as f:
        json.dump(fx, f, separators=(',', ':'))
    manifest['pages'][pid]['fxData'] = {k: v for k, v in fx.items()}


# ---------------------------------------------------------------- cover

def build_cover(manifest):
    path = os.path.join(SRC, '01-cover.png')
    rgb = np.array(Image.open(path).convert('RGB'))
    H, W = rgb.shape[:2]
    s = W / 941.0
    R, G, B = [rgb[..., i].astype(np.int32) for i in range(3)]
    cream = ((R > 200) & (G > 185) & (B > 175)).astype(np.uint8) * 255
    n, lab, stats, _ = cv2.connectedComponentsWithStats(cream, 8)
    big = 1 + int(np.argmax(stats[1:, 4]))
    comp = (lab == big).astype(np.uint8) * 255
    cnts, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    cnt = max(cnts, key=cv2.contourArea)
    (cx, cy), (d1, d2), ang = cv2.fitEllipse(cnt)
    # fitEllipse returns full axes; normalise so rx is the horizontal one
    if ang > 45 and ang < 135:
        d1, d2 = d2, d1
        ang -= 90
    rx, ry = d1 / 2.0, d2 / 2.0
    print('cover oval: centre (%.1f, %.1f) = (%.2f%%, %.2f%%), rx %.1f (%.2f%%W), ry %.1f (%.2f%%H), angle %.2f'
          % (cx, cy, cx / W * 100, cy / H * 100, rx, rx / W * 100, ry, ry / H * 100, ang))

    def ellipse_mask(inset, ss=4):
        m = np.zeros((H * ss, W * ss), np.uint8)
        cv2.ellipse(m, (int(round(cx * ss)), int(round(cy * ss))),
                    (int(round((rx - inset) * ss)), int(round((ry - inset) * ss))), ang, 0, 360, 255, -1, cv2.LINE_AA)
        return cv2.resize(m, (W, H), interpolation=cv2.INTER_AREA)

    hole = ellipse_mask(2 * s)
    cover_rgba = np.dstack([rgb, 255 - hole])
    cdir = os.path.join(OUT, 'cover')
    os.makedirs(cdir, exist_ok=True)
    save_webp(cover_rgba, os.path.join(cdir, 'cover-front.webp'), quality=84, alpha_quality=90)

    # inner page: cream paper + original oval content feathered at the edge.
    # The oval's lighting (and the frame's shadow) is flattened first, so the
    # oval does not leave a ghost on the plain page once the cover is open.
    inside_m = (ellipse_mask(0) > 127).astype(np.float32)
    dist = cv2.distanceTransform((inside_m > 0).astype(np.uint8), cv2.DIST_L2, 5)
    rgbf = rgb.astype(np.float32)
    sig = 40 * s
    den = cv2.GaussianBlur(inside_m, (0, 0), sig) + 1e-4
    low = np.dstack([cv2.GaussianBlur(rgbf[..., c] * inside_m, (0, 0), sig) / den for c in range(3)])
    core = dist > 45 * s
    base = np.median(low[core], axis=0)
    flat = np.clip(rgbf * (base[None, None, :] / np.maximum(low, 1)), 0, 255)
    hf = rgbf - cv2.GaussianBlur(rgbf, (0, 0), 1.5)
    gstd = float(np.std(hf[core & (luminance(rgb) < 242)]))
    rng = np.random.default_rng(7)
    noise = rng.normal(0, 1, (H, W)).astype(np.float32)
    grain = cv2.GaussianBlur(noise, (0, 0), 0.7) * gstd * 1.6 + cv2.GaussianBlur(rng.normal(0, 1, (H, W)).astype(np.float32), (0, 0), 5) * gstd * 0.8
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    vd = np.sqrt(((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H / 2) / (H * 0.62)) ** 2)
    vig = 1 - 0.07 * np.clip((vd - 0.62) / 0.5, 0, 1) ** 1.5
    pap = np.clip((base[None, None, :] + grain[..., None]) * vig[..., None], 0, 255)
    a = np.clip((dist - 10 * s) / (30 * s), 0, 1)
    a = a * a * (3 - 2 * a)
    inner = pap * (1 - a[..., None]) + flat * a[..., None]
    inner = np.clip(inner, 0, 255).astype(np.uint8)
    save_webp(inner, os.path.join(cdir, 'inner-page.webp'), quality=84)

    # monogram mask (for the light sweep) and outline (for the loader)
    Lm = luminance(rgb)
    bgl = cv2.GaussianBlur(Lm, (0, 0), 12 * s)
    mono = (((Lm - bgl) > 10) & (dist > 22 * s)).astype(np.uint8) * 255
    mono = cv2.morphologyEx(mono, cv2.MORPH_OPEN, ellipse(3))
    mono = cv2.morphologyEx(mono, cv2.MORPH_CLOSE, ellipse(int(5 * s) | 1))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mono, 8)
    keep = np.zeros(n, bool)
    for i in range(1, n):
        if stats[i, 4] > 120 * s * s:
            keep[i] = True
    mono = keep[lab].astype(np.uint8) * 255
    mono_soft = gauss(cv2.dilate(mono, ellipse(int(9 * s) | 1)).astype(np.float32), 3.0 * s)
    mb = bbox_of(mono)
    pad = int(14 * s)
    mx0, mx1, my0, my1 = max(0, mb[0] - pad), min(W, mb[1] + pad), max(0, mb[2] - pad), min(H, mb[3] + pad)
    ma = np.clip(mono_soft[my0:my1, mx0:mx1], 0, 255).astype(np.uint8)
    save_webp(np.dstack([np.full_like(ma, 255)] * 3 + [ma]), os.path.join(cdir, 'monogram-mask.webp'), quality=80, alpha_quality=80)
    # letter mask for the burgundy "ink" fill: the embossed letter faces are brighter
    # than the textured paper. Work at 3x for smooth edges, add the shadow side that
    # touches each face, then grow ~2.5px to cover the bevel.
    up = 3
    big = cv2.resize(rgb, (W * up, H * up), interpolation=cv2.INTER_CUBIC)
    Ls = cv2.GaussianBlur(luminance(big), (0, 0), 1.6 * up)
    inside_big = cv2.resize((dist > 22 * s).astype(np.uint8) * 255, (W * up, H * up), interpolation=cv2.INTER_NEAREST) > 0
    paper_l = float(np.median(Ls[inside_big]))
    fm = ((Ls > paper_l + 7) & inside_big).astype(np.uint8) * 255
    fm = cv2.morphologyEx(fm, cv2.MORPH_OPEN, ellipse(2 * up + 1))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(fm, 8)
    keep = np.zeros(n, bool)
    keep[1:] = stats[1:, 4] > 120 * up * up * s * s
    fm = keep[lab].astype(np.uint8) * 255
    dark = ((Ls < paper_l - 6) & inside_big).astype(np.uint8) * 255
    fm = np.maximum(fm, cv2.bitwise_and(dark, cv2.dilate(fm, ellipse(3 * up + 1))))
    fm = cv2.morphologyEx(fm, cv2.MORPH_CLOSE, ellipse(2 * up + 1))
    fm = cv2.dilate(fm, ellipse(int(2 * up * s) | 1))
    face = (cv2.resize(fm, (W, H), interpolation=cv2.INTER_AREA) > 128).astype(np.uint8) * 255
    # The lower half of each stroke is its unlit bottom bevel, about as bright as
    # the paper; the letter ends where its cast shadow begins. Fill from the bright
    # face down (within a downward cone) to the start of that shadow.
    Lf = cv2.GaussianBlur(luminance(rgb), (0, 0), 0.8)
    shadow = (((Lf < paper_l - 16) & (dist > 22 * s))).astype(np.uint8) * 255

    def cone(k, down):
        ker = np.zeros((2 * k + 1, 2 * k + 1), np.uint8)
        for r in range(k + 1):
            ker[k - r if down else k + r, k - r // 2:k + r // 2 + 1] = 1
        return ker
    kb = int(round(11 * s))
    bevel = cv2.bitwise_and(cv2.dilate(face, cone(kb, True)), cv2.dilate(shadow, cone(kb, False)))
    bevel[shadow > 0] = 0
    fm = np.maximum(face, bevel)
    fm = cv2.morphologyEx(fm, cv2.MORPH_OPEN, ellipse(3))
    fm = cv2.morphologyEx(fm, cv2.MORPH_CLOSE, ellipse(int(5 * s) | 1))
    # smooth edges: supersample, grow ~1px, soft but crisp edge
    up = 4
    big = cv2.resize(fm, (W * up, H * up), interpolation=cv2.INTER_LINEAR)
    big = (big > 128).astype(np.uint8) * 255
    big = cv2.dilate(big, ellipse(int(2 * up * s) | 1))
    big = cv2.GaussianBlur(big.astype(np.float32), (0, 0), 0.5 * up)
    fm = cv2.resize(big, (W, H), interpolation=cv2.INTER_AREA)
    fa = np.clip(fm[my0:my1, mx0:mx1], 0, 255).astype(np.uint8)
    save_webp(np.dstack([np.full_like(fa, 255)] * 3 + [fa]), os.path.join(cdir, 'monogram-fill.webp'), quality=82, alpha_quality=90)
    # SVG outline for the loader (traced from the actual monogram, not retyped)
    sm = cv2.morphologyEx(mono, cv2.MORPH_CLOSE, ellipse(int(3 * s) | 1))
    cnts, _ = cv2.findContours(sm[my0:my1, mx0:mx1], cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    paths = []
    for c in sorted(cnts, key=cv2.contourArea, reverse=True):
        if cv2.contourArea(c) < 150 * s * s:
            continue
        c = cv2.approxPolyDP(c, 0.9 * s, True)
        pts = c[:, 0, :]
        d = 'M' + ' L'.join('%.0f %.0f' % (p[0], p[1]) for p in pts) + ' Z'
        paths.append(d)
    with open(os.path.join(GEN, 'monogram-paths.json'), 'w') as f:
        json.dump({'w': mx1 - mx0, 'h': my1 - my0, 'paths': paths}, f)

    # back of the cover: deep burgundy paper
    bw, bh = 600, round(600 * H / W)
    n1 = rng.normal(0, 1, (bh, bw)).astype(np.float32)
    tex = cv2.GaussianBlur(n1, (0, 0), 0.7) * 3 + cv2.GaussianBlur(rng.normal(0, 1, (bh, bw)).astype(np.float32), (0, 0), 14) * 5
    yy2, xx2 = np.mgrid[0:bh, 0:bw].astype(np.float32)
    shade = 1 - 0.18 * (((xx2 / bw) - 0.3) ** 2 + ((yy2 / bh) - 0.4) ** 2)
    backc = np.array([0x4A, 0x0D, 0x14], np.float32)
    back = np.clip(backc[None, None] * shade[..., None] + tex[..., None] * np.array([1.0, 0.35, 0.4]), 0, 255).astype(np.uint8)
    save_webp(back, os.path.join(cdir, 'cover-back.webp'), quality=78)

    # velvet texture for the scratch card: bottom 25% of the cover, darkened 10%
    vel = (rgb[int(0.75 * H):].astype(np.float32) * 0.9).astype(np.uint8)
    save_webp(vel, os.path.join(cdir, 'velvet.webp'), quality=80)

    # share image 1200x630
    build_og(rgb, cx, cy, rx, ry)
    build_icons(rgb, cx, cy, rx, ry)

    manifest['cover'] = {
        'w': W, 'h': H,
        'oval': {'cx': pct(cx, W), 'cy': pct(cy, H), 'rx': pct(rx, W), 'ry': pct(ry, H), 'angle': round(ang, 3)},
        'monogram': rect_pct(mx0, mx1, my0, my1, W, H),
        'front': 'img/cover/cover-front.webp', 'inner': 'img/cover/inner-page.webp',
        'back': 'img/cover/cover-back.webp', 'velvet': 'img/cover/velvet.webp',
        'monogramMask': 'img/cover/monogram-mask.webp',
        'monogramFill': 'img/cover/monogram-fill.webp',
        'burgundy': '#7A1626',
    }


def build_og(rgb, cx, cy, rx, ry):
    H, W = rgb.shape[:2]
    frame_h = 2 * ry + 0.07 * H
    sc = 560.0 / frame_h
    im = Image.fromarray(rgb).resize((round(W * sc), round(H * sc)), Image.LANCZOS)
    a = np.array(im)
    ccy = int(cy * sc)
    y0 = max(0, ccy - 315)
    a = a[y0:y0 + 630]
    if a.shape[0] < 630:
        a = np.pad(a, ((0, 630 - a.shape[0]), (0, 0), (0, 0)), mode='reflect')
    cw = a.shape[1]
    ccx = int(cx * sc)
    canvas = np.zeros((630, 1200, 3), np.uint8)
    left = 600 - ccx
    canvas[:, max(0, left):left + cw] = a[:, max(0, -left):max(0, -left) + min(cw, 1200 - max(0, left))]
    # extend by mirroring outward
    lw = max(0, left)
    if lw > 0:
        strip = a[:, :lw][:, ::-1]
        canvas[:, :lw] = strip[:, -lw:] if strip.shape[1] >= lw else np.pad(strip, ((0, 0), (lw - strip.shape[1], 0), (0, 0)), mode='reflect')
    rw = 1200 - (left + cw)
    if rw > 0:
        strip = a[:, -rw:][:, ::-1]
        canvas[:, 1200 - rw:] = strip
    # soften the seams
    for x in [lw, 1200 - rw]:
        if 0 < x < 1200:
            x0, x1 = max(0, x - 24), min(1200, x + 24)
            canvas[:, x0:x1] = cv2.GaussianBlur(canvas[:, x0:x1], (0, 0), 3)
    yy, xx = np.mgrid[0:630, 0:1200].astype(np.float32)
    v = 1 - 0.35 * np.clip(np.abs(xx - 600) / 600 - 0.35, 0, 1)
    canvas = np.clip(canvas * v[..., None], 0, 255).astype(np.uint8)
    q = 86
    while True:
        Image.fromarray(canvas).save(os.path.join(OUT, 'og.jpg'), 'JPEG', quality=q, optimize=True, progressive=True)
        if os.path.getsize(os.path.join(OUT, 'og.jpg')) < 290_000 or q < 50:
            break
        q -= 6


def build_icons(rgb, cx, cy, rx, ry):
    H, W = rgb.shape[:2]
    side = int(2 * ry * 1.12)
    x0 = int(cx - side / 2)
    y0 = int(cy - side / 2)
    pad = max(0, -x0, x0 + side - W)
    src = np.pad(rgb, ((0, 0), (pad, pad), (0, 0)), mode='reflect') if pad else rgb
    crop = src[y0:y0 + side, x0 + pad:x0 + pad + side]
    im = Image.fromarray(crop)
    idir = os.path.join(OUT, 'icons')
    os.makedirs(idir, exist_ok=True)
    for sz in [512, 192, 180, 32, 16]:
        im.resize((sz, sz), Image.LANCZOS).save(os.path.join(idir, 'icon-%d.png' % sz), optimize=True)


# ---------------------------------------------------------------- audio

def build_audio():
    adir = os.path.join(ROOT, 'public', 'audio')
    os.makedirs(adir, exist_ok=True)
    mp3 = os.path.join(adir, 'alfaaz.mp3')
    shutil.copyfile(os.path.join(SRC, 'music.mp3'), mp3)
    m4a = os.path.join(adir, 'alfaaz.m4a')
    if shutil.which('ffmpeg'):
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', mp3, '-vn', '-c:a', 'aac', '-b:a', '96k',
                        '-movflags', '+faststart', m4a], check=True)
    else:
        print('ffmpeg not found: skipping .m4a')


# ---------------------------------------------------------------- page joins

def _edge_colours(path):
    a = np.array(Image.open(path).convert('RGB')).astype(np.float32)
    n = max(2, int(0.012 * a.shape[0]))
    return [int(v) for v in a[:n].reshape(-1, 3).mean(0)], [int(v) for v in a[-n:].reshape(-1, 3).mean(0)]


def add_edges(manifest):
    """Average colour of each page's top and bottom edge; the site fades the two
    edges that meet into their shared midpoint, so pages join without overlapping."""
    if manifest.get('cover'):
        t, b = _edge_colours(os.path.join(OUT, 'cover', 'inner-page.webp'))
        manifest['cover']['edges'] = {'top': t, 'bottom': b}
    for pid in manifest.get('order', []):
        path = os.path.join(OUT, pid, 'plate-1080.webp')
        if os.path.exists(path):
            t, b = _edge_colours(path)
            manifest['pages'][pid]['edges'] = {'top': t, 'bottom': b}


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', help='comma-separated page ids (p02..p06, cover, audio)')
    ap.add_argument('--no-lama', action='store_true')
    ap.add_argument('--fx-only', action='store_true', help='only regenerate effect point maps')
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(GEN, exist_ok=True)
    cfg = json.load(open(os.path.join(ROOT, 'tools', 'pages.json')))
    mpath = os.path.join(OUT, 'manifest.json')
    manifest = json.load(open(mpath)) if os.path.exists(mpath) else {}
    manifest.setdefault('pages', {})
    manifest['plate'] = cfg['plate']
    manifest['widths'] = WIDTHS
    only = set(args.only.split(',')) if args.only else None
    use_lama = not args.no_lama
    if use_lama and not args.fx_only and (not only or any(k.startswith('p0') for k in only)):
        try:
            get_lama()
        except Exception as e:  # pragma: no cover
            print('LaMa unavailable (%s); falling back to OpenCV' % e)
            use_lama = False

    if not only or 'cover' in only:
        build_cover(manifest)
    for page in cfg['pages']:
        if only and page['id'] not in only:
            continue
        print('page', page['id'])
        build_text_page(page, use_lama, manifest, fx_only=args.fx_only)
    if not only or 'audio' in only:
        build_audio()

    manifest['order'] = [p['id'] for p in cfg['pages']]
    add_edges(manifest)
    # cache-busting stamp for every image URL (changes on every asset build)
    import time
    manifest['v'] = time.strftime('%Y%m%d%H%M%S')
    with open(mpath, 'w') as f:
        json.dump(manifest, f, indent=1)
    with open(os.path.join(GEN, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, separators=(',', ':'))
    print('wrote', mpath)


if __name__ == '__main__':
    main()
