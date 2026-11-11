"""Text-line mask detection for the invitation plates.

Light text on dark plates (04/05/06): white top-hat on luminance, low saturation.
Dark text on light plates (02/03): black-hat on the green channel (text is
burgundy, so it is much darker in G than the cream background).

Every mask is limited to connected components that look like text strokes and
whose centre lies inside the (unexpanded) line box, so chandeliers, candles,
flowers and step lines that poke into a box are ignored.
"""
import cv2
import numpy as np


def pct_box_to_px(box, W, H, pad_pct=0.0, pad_y=None):
    """pad_pct is in % of plate width; pad_y (optional) in % of plate width too."""
    x0, x1, y0, y1 = box
    px = pad_pct / 100.0
    py = (pad_pct if pad_y is None else pad_y) / 100.0
    X0 = int(round((x0 / 100.0 - px) * W))
    X1 = int(round((x1 / 100.0 + px) * W))
    Y0 = int(round(y0 / 100.0 * H - py * W))
    Y1 = int(round(y1 / 100.0 * H + py * W))
    return max(0, X0), min(W, X1), max(0, Y0), min(H, Y1)


def ellipse(k):
    k = int(k) | 1
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))


def luminance(rgb):
    r, g, b = rgb[..., 0].astype(np.float32), rgb[..., 1].astype(np.float32), rgb[..., 2].astype(np.float32)
    return 0.299 * r + 0.587 * g + 0.114 * b


def detect_line(rgb, line, polarity, W, H, scale):
    """Return (core_mask, region) for one line. core_mask is full-image uint8 0/255."""
    ltype = line['type']
    stroke_k = 41 if ltype in ('script', 'amp', 'arabic') else 25
    stroke_k = int(stroke_k * scale) | 1
    margin = stroke_k + 8
    bx0, bx1, by0, by1 = pct_box_to_px(line['box'], W, H, 0)
    ex0, ex1, ey0, ey1 = pct_box_to_px(line['box'], W, H, line.get('padx', 1.5), line.get('pady', 1.5))
    # analysis window (bigger than the expanded box, so morphology has context)
    ax0, ax1 = max(0, ex0 - margin), min(W, ex1 + margin)
    ay0, ay1 = max(0, ey0 - margin), min(H, ey1 + margin)
    crop = rgb[ay0:ay1, ax0:ax1]
    full = np.zeros((H, W), np.uint8)

    if polarity == 'light':
        L = luminance(crop)
        L8 = np.clip(L, 0, 255).astype(np.uint8)
        top = cv2.morphologyEx(L8, cv2.MORPH_TOPHAT, ellipse(stroke_k)).astype(np.float32)
        hsv = cv2.cvtColor(crop, cv2.COLOR_RGB2HSV)
        sat = hsv[..., 1].astype(np.float32)
        thr = line.get('thr', 38)
        m = (top > thr) & (L > line.get('minL', 150)) & (sat < line.get('maxSat', 120))
    else:
        G = crop[..., 1]
        black = cv2.morphologyEx(G, cv2.MORPH_BLACKHAT, ellipse(stroke_k)).astype(np.float32)
        thr = line.get('thr', 40)
        m = black > thr

    m = m.astype(np.uint8) * 255
    # restrict to the expanded box
    if not line.get('loose'):
        win = np.zeros_like(m)
        win[ey0 - ay0:ey1 - ay0, ex0 - ax0:ex1 - ax0] = 255
        m = cv2.bitwise_and(m, win)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, ellipse(3))

    # corridor zone: where a hairline swash threads through foliage, keep only the
    # dark pixels along a hand-traced path of the stroke (in % of the plate)
    cor = line.get('corridor')
    if cor:
        tx = int(cor['zoneX'] / 100.0 * W) - ax0
        if tx > 0:
            path = np.zeros_like(m)
            pts = np.array([[p[0] / 100.0 * W - ax0, p[1] / 100.0 * H - ay0] for p in cor['pts']], np.int32)
            cv2.polylines(path, [pts], False, 255, int(cor['width'] * scale) | 1, cv2.LINE_AA)
            zone = np.zeros_like(m)
            zone[:, :tx] = 255
            m[(zone > 0) & (path < 128)] = 0

    # component filtering
    n, lab, stats, cents = cv2.connectedComponentsWithStats(m, 8)
    keep = np.zeros(n, bool)
    bh = (by1 - by0)
    min_area = max(4, int(line.get('minArea', 6) * scale * scale))
    for i in range(1, n):
        x, y, w, h, a = stats[i]
        cx, cy = cents[i]
        gx, gy = cx + ax0, cy + ay0
        if a < min_area:
            continue
        # centre must be inside the unexpanded box (with a little slack)
        slack_x = line.get('slackx', 1.0) / 100.0 * W
        slack_y = line.get('slacky', 0.25) * bh
        if not (bx0 - slack_x <= gx <= bx1 + slack_x and by0 - slack_y <= gy <= by1 + slack_y):
            continue
        # step-edge highlights: thin, long, horizontal
        if h < 0.3 * bh and w > 4 * h and a > 30 * scale * scale:
            continue
        # text strokes are not huge solid blobs
        if h > bh * line.get('maxH', 1.8):
            continue
        fill = a / float(w * h)
        if a > 400 * scale * scale and fill > line.get('maxFill', 0.75):
            continue
        if polarity == 'dark' and 'maxCompG' in line:
            g = crop[..., 1][lab == i]
            if np.percentile(g, 10) > line['maxCompG']:
                continue
        keep[i] = True
    # drop tiny specks that are far from any kept component (noise)
    km = keep[lab]
    if km.any():
        near = cv2.dilate(km.astype(np.uint8) * 255, ellipse(int(14 * scale)))
        for i in range(1, n):
            if keep[i]:
                continue
            x, y, w, h, a = stats[i]
            if a >= 2 and near[lab == i].mean() > 200 and h <= bh * 1.2:
                cx, cy = cents[i]
                gx, gy = cx + ax0, cy + ay0
                if bx0 - 0.01 * W <= gx <= bx1 + 0.01 * W and by0 - 0.3 * bh <= gy <= by1 + 0.3 * bh:
                    keep[i] = True
    core = (keep[lab]).astype(np.uint8) * 255
    for (rx0, rx1, ry0, ry1) in line.get('exclude', []):
        X0, X1, Y0, Y1 = pct_box_to_px([rx0, rx1, ry0, ry1], W, H, 0)
        core[max(0, Y0 - ay0):max(0, Y1 - ay0), max(0, X0 - ax0):max(0, X1 - ax0)] = 0
    full[ay0:ay1, ax0:ax1] = core
    return full


def bbox_of(mask):
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1


def detect_page(rgb, page):
    """Detect every line of a page. Masks are mutually exclusive, in reading order."""
    H, W = rgb.shape[:2]
    scale = W / 1449.0
    out = {}
    claimed = np.zeros((H, W), np.uint8)
    for line in page['lines']:
        m = detect_line(rgb, line, page['polarity'], W, H, scale)
        if claimed.any():
            m[cv2.dilate(claimed, ellipse(5)) > 0] = 0
            # remove specks left over after the subtraction
            n, lab, stats, _ = cv2.connectedComponentsWithStats(m, 8)
            for i in range(1, n):
                if stats[i, 4] < 12 * scale * scale:
                    m[lab == i] = 0
        out[line['id']] = m
        claimed |= m
    return out
