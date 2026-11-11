// The "plate" layout system: every page is a box with the design's aspect ratio
// (1449:2576), filling its section like object-fit: cover, centred.
export const PLATE_ASPECT = 1449 / 2576;
// Extra scale so the ±3% scroll parallax never exposes an edge.
export const OVERSCAN = 1.06;
// Text and buttons live between 14% and 86% of the plate width.
const SAFE = 0.72;

export const L = {
  framed: false,
  frameW: 0,
  frameH: 0,
  pageH: 0,
  plateW: 0,
  plateH: 0,
  plateX: 0,
  plateY: 0,
  narrow: false,
  radius: 0,
};

const root = document.documentElement;

function smallViewportHeight() {
  try {
    if (window.CSS && CSS.supports('height', '100svh')) {
      const p = document.createElement('div');
      p.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:100svh;visibility:hidden;pointer-events:none';
      document.body.appendChild(p);
      const h = p.getBoundingClientRect().height;
      p.remove();
      if (h > 100) return Math.round(h);
    }
  } catch (e) { /* older webviews */ }
  return window.innerHeight;
}

export function computeLayout() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const framed = vw > 600;
  let frameW;
  let frameH;
  let radius = 0;
  if (framed) {
    const margin = vh > 720 ? 24 : 0;
    frameH = vh - margin * 2;
    frameW = Math.min(440, Math.round(frameH * PLATE_ASPECT));
    radius = margin ? 24 : 0;
  } else {
    frameW = vw;
    frameH = smallViewportHeight();
  }
  const W = frameW;
  const H = frameH;
  let plateW = Math.max(W, H * PLATE_ASPECT) * OVERSCAN;
  let narrow = false;
  if (W / plateW < SAFE) {
    plateW = W / SAFE;
    narrow = plateW / PLATE_ASPECT < H * OVERSCAN;
  }
  const plateH = plateW / PLATE_ASPECT;
  Object.assign(L, {
    framed,
    frameW,
    frameH,
    pageH: H,
    plateW,
    plateH,
    plateX: (W - plateW) / 2,
    plateY: (H - plateH) / 2,
    narrow,
    radius,
  });
  root.classList.toggle('is-framed', framed);
  root.classList.toggle('is-narrow', narrow);
  const s = root.style;
  s.setProperty('--vh', vh * 0.01 + 'px');
  s.setProperty('--page-h', H + 'px');
  s.setProperty('--frame-w', frameW + 'px');
  s.setProperty('--frame-h', frameH + 'px');
  s.setProperty('--frame-r', radius + 'px');
  s.setProperty('--plate-w', plateW.toFixed(2) + 'px');
  s.setProperty('--plate-h', plateH.toFixed(2) + 'px');
  s.setProperty('--plate-x', L.plateX.toFixed(2) + 'px');
  s.setProperty('--plate-y', L.plateY.toFixed(2) + 'px');
  return L;
}

/** Convert a point in plate % to frame (viewport) px for the settled page. */
export function plateToFrame(xPct, yPct) {
  return { x: L.plateX + (xPct / 100) * L.plateW, y: L.plateY + (yPct / 100) * L.plateH };
}

/** Pick the plate image width to request for this screen. */
export function imageWidth(widths) {
  const need = L.plateW * Math.min(window.devicePixelRatio || 1, 3);
  for (const w of widths) if (w >= need * 0.92) return w;
  return widths[widths.length - 1];
}

let lastW = 0;
let lastH = 0;
/** Re-layout on real size changes only (ignore the mobile URL bar). */
export function onLayoutChange(cb) {
  lastW = window.innerWidth;
  lastH = window.innerHeight;
  let t = 0;
  const handler = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const framed = w > 600;
    const significant = w !== lastW || (framed && h !== lastH) || Math.abs(h - lastH) > 160;
    if (!significant) return;
    clearTimeout(t);
    t = setTimeout(() => {
      lastW = w;
      lastH = h;
      computeLayout();
      cb();
    }, 120);
  };
  window.addEventListener('resize', handler);
  window.addEventListener('orientationchange', handler);
}
