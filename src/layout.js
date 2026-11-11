// Layout: two geometries share the 1449:2576 design aspect.
//  - The intro (cover + inner page) fills the screen like object-fit: cover, so the
//    cover's die-cut window lines up with the inner page.
//  - The design pages (02..06) are shown whole at the column's width and flow one
//    after another in a single continuous scroll, each blending into the previous
//    one over a soft seam (no pinning, no overlap of content).
export const PLATE_ASPECT = 1449 / 2576;
export const SEAM = 0.08; // share of a page height that blends into the previous page

export const L = {
  framed: false,
  frameW: 0,
  frameH: 0,
  pageH: 0, // viewport (frame) height: the intro section and fixed layers
  plateW: 0, // design pages: full column width
  plateH: 0,
  coverW: 0, // intro / cover plate (cover-fit)
  coverH: 0,
  coverX: 0,
  coverY: 0,
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
  const coverW = Math.max(W, H * PLATE_ASPECT);
  const coverH = coverW / PLATE_ASPECT;
  Object.assign(L, {
    framed,
    frameW,
    frameH,
    pageH: H,
    plateW: W,
    plateH: W / PLATE_ASPECT,
    coverW,
    coverH,
    coverX: (W - coverW) / 2,
    coverY: (H - coverH) / 2,
    radius,
  });
  root.classList.toggle('is-framed', framed);
  const s = root.style;
  const px = (v) => v.toFixed(2) + 'px';
  s.setProperty('--vh', vh * 0.01 + 'px');
  s.setProperty('--page-h', H + 'px');
  s.setProperty('--frame-w', frameW + 'px');
  s.setProperty('--frame-h', frameH + 'px');
  s.setProperty('--frame-r', radius + 'px');
  s.setProperty('--plate-w', px(L.plateW));
  s.setProperty('--plate-h', px(L.plateH));
  s.setProperty('--seam', px(L.plateH * SEAM));
  s.setProperty('--cover-w', px(coverW));
  s.setProperty('--cover-h', px(coverH));
  s.setProperty('--cover-x', px(L.coverX));
  s.setProperty('--cover-y', px(L.coverY));
  return L;
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
