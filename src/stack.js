// Builds the pages from the generated manifest as one continuous scroll: the
// intro (inner page) fills the screen, then each design page follows at full
// width, blending into the previous one over a soft seam (see styles.css).
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import manifest from './generated/manifest.json';
import { L, imageWidth } from './layout.js';
import { ENV } from './env.js';

export const MANIFEST = manifest;
window.__manifest = manifest; // QA hook
export const pages = []; // ordered: p01 (inner page) .. p06
export const byId = {};

const BASE = import.meta.env.BASE_URL || '/';
// images carry the asset-build stamp, so a rebuilt image is never served stale
const V = manifest.v ? `?v=${manifest.v}` : '';
export const asset = (p) => BASE + p.replace(/^\//, '') + (/\.(webp|png|jpg|json)$/.test(p) ? V : '');
// CSS masks/backgrounds that point at images use the same stamp
document.documentElement.style.setProperty('--cover-mask', `url(${asset('img/cover/cover-front.webp')})`);
document.documentElement.style.setProperty('--velvet-img', `url(${asset('img/cover/velvet.webp')})`);

function el(tag, cls, attrs) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

function srcFor(tpl, w) {
  return asset(tpl.replace('{w}', String(w)));
}

export function placePct(node, x, y, w, h) {
  node.style.left = x + '%';
  node.style.top = y + '%';
  if (w != null) node.style.width = w + '%';
  if (h != null) node.style.height = h + '%';
}

function makeSection(id, index, kind, srText) {
  const sec = el('section', `page page-${kind}`, { id: 'page-' + id, 'data-page': id });
  sec.style.zIndex = String(index + 1);
  const inner = el('div', 'page-inner');
  const kb = el('div', 'plate-kb');
  const plate = el('div', 'plate', { 'aria-hidden': 'true' });
  const dim = el('div', 'page-dim');
  kb.appendChild(plate);
  inner.append(kb, dim);
  sec.appendChild(inner);
  if (srText) {
    const sr = el('div', 'sr-only');
    sr.textContent = srText;
    sec.appendChild(sr);
  }
  const page = { id, index, sec, inner, kb, plate, dim, lines: [], ui: {}, loaded: false, fx: null };
  pages.push(page);
  byId[id] = page;
  return page;
}

export function buildStack(stackEl) {
  const W = imageWidth(manifest.widths);
  const cover = manifest.cover;

  // --- page 01: the inner page seen through the cover window
  const p1 = makeSection('p01', 0, 'intro', 'Wedding invitation of Marziya and Mohammed Umar. M&U monogram.');
  const img1 = el('img', 'plate-img', { alt: '', decoding: 'async', fetchpriority: 'high' });
  img1.src = asset(cover.inner);
  p1.plate.appendChild(img1);
  p1.img = img1;
  const [mx, my, mw, mh] = cover.monogram;
  // burgundy "ink" filling the embossed monogram (opening.js animates it)
  const fill = el('div', 'mono-fill');
  placePct(fill, mx, my, mw, mh);
  fill.dataset.mask = asset(cover.monogramFill);
  const ink = el('div', 'mono-ink');
  ink.style.setProperty('--ink', cover.burgundy || '#7A1626');
  fill.appendChild(ink);
  p1.plate.appendChild(fill);
  p1.ui.fill = fill;
  p1.ui.ink = ink;
  const sweep = el('div', 'mono-sweep');
  placePct(sweep, mx, my, mw, mh);
  sweep.dataset.mask = asset(cover.monogramMask);
  p1.plate.appendChild(sweep);
  p1.ui.sweep = sweep;
  stackEl.appendChild(p1.sec);
  p1.loaded = true;

  // --- pages 02..06
  manifest.order.forEach((id, i) => {
    const m = manifest.pages[id];
    const page = makeSection(id, i + 1, 'design', m.sr);
    page.data = m;
    const img = el('img', 'plate-img', { alt: '', decoding: 'async' });
    img.dataset.srcset = manifest.widths.map((w) => `${srcFor(m.plate, w)} ${w}w`).join(', ');
    img.dataset.src = srcFor(m.plate, W);
    page.img = img;
    page.plate.appendChild(img);
    const fx = el('div', 'fx-layer');
    page.plate.appendChild(fx);
    page.fxLayer = fx;
    for (const line of m.lines) {
      const o = el('img', 'ov ov-' + line.type, { alt: '', decoding: 'async', 'data-line': line.id });
      const [x, y, w, h] = line.rect;
      placePct(o, x, y, w, h);
      o.dataset.src = srcFor(line.src, W);
      page.plate.appendChild(o);
      page.lines.push({ ...line, el: o });
    }
    stackEl.appendChild(page.sec);
  });
  setJoins();
  if (ENV.revealAll) {
    enableLoading();
    pages.forEach(loadPage);
  }
  return pages;
}

// Where two pages meet, both edges fade into the midpoint of their edge colours.
// The cream intro stays pure cream: page 02 fades in from that cream.
function setJoins() {
  const rgb = (c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  const mid = (a, b) => a.map((v, i) => Math.round((v + b[i]) / 2));
  for (let i = 1; i < pages.length; i++) {
    const prev = pages[i - 1];
    const page = pages[i];
    const prevBottom = prev.id === 'p01' ? manifest.cover.edges && manifest.cover.edges.bottom : prev.data && prev.data.edges && prev.data.edges.bottom;
    const top = page.data && page.data.edges && page.data.edges.top;
    if (!prevBottom || !top) continue;
    const c = prev.id === 'p01' ? prevBottom : mid(prevBottom, top);
    page.sec.style.setProperty('--join-top', rgb(c));
    if (prev.id !== 'p01') prev.sec.style.setProperty('--join-bottom', rgb(c));
  }
  pages[pages.length - 1].sec.classList.add('is-last');
}

// Nothing but the cover parts and the page-02 plate (preloaded in <head>) loads
// before the guest taps; after that, pages load about one page ahead.
let loadingEnabled = false;
export function enableLoading() {
  loadingEnabled = true;
  const p1 = byId.p01;
  if (!p1) return;
  for (const n of [p1.ui.sweep, p1.ui.fill]) {
    if (n && n.dataset.mask) n.style.webkitMaskImage = n.style.maskImage = `url(${n.dataset.mask})`;
  }
}

/** Start downloading a page's plate and overlays. Returns a promise for the plate. */
export function loadPage(page) {
  if (!page || page.loaded || !loadingEnabled) return page && page.ready;
  page.loaded = true;
  const img = page.img;
  img.sizes = Math.round(L.plateW) + 'px';
  img.srcset = img.dataset.srcset;
  img.src = img.dataset.src;
  page.ready = img.decode ? img.decode().catch(() => {}) : Promise.resolve();
  for (const line of page.lines) line.el.src = line.el.dataset.src;
  return page.ready;
}

export function updateSizes() {
  for (const p of pages) if (p.loaded && p.img.srcset) p.img.sizes = Math.round(L.plateW) + 'px';
}

// ---------------------------------------------------------------- scroll

const listeners = { active: [], visible: [] };
export const onActive = (cb) => listeners.active.push(cb);
export const onVisible = (cb) => listeners.visible.push(cb);
export let activeIndex = 0;

export function createStackTriggers() {
  pages.forEach((page, i) => {
    // in or near the viewport: effects, Ken Burns, lazy loading
    ScrollTrigger.create({
      trigger: page.sec,
      start: 'top bottom',
      end: 'bottom top',
      onToggle: (self) => {
        page.visible = self.isActive;
        listeners.visible.forEach((cb) => cb(page, self.isActive));
        if (self.isActive) {
          loadPage(page);
          loadPage(pages[i + 1]);
        }
      },
    });
    // the page under the middle of the screen
    ScrollTrigger.create({
      trigger: page.sec,
      start: 'top 50%',
      end: 'bottom 50%',
      onToggle: (self) => {
        if (self.isActive) {
          activeIndex = i;
          listeners.active.forEach((cb) => cb(page, i));
          loadPage(pages[i + 1]);
        }
      },
    });
  });
}

// idle Ken Burns on visible pages only. A CSS animation runs on the compositor,
// so it costs nothing on the main thread while the guest scrolls.
export function startKenBurns(page) {
  if (ENV.reducedMotion) return;
  page.kb.classList.add('kb-on');
  page.kb.style.animationPlayState = 'running';
}
export function pauseKenBurns(page) {
  page.kb.style.animationPlayState = 'paused';
}

// desktop: blurred enlargement of the current page behind the column
export function initBackdrop() {
  const imgs = Array.from(document.querySelectorAll('#backdrop .bd-img'));
  let cur = 0;
  let curSrc = '';
  const set = (src) => {
    if (!src || src === curSrc) return;
    curSrc = src;
    const nextImg = imgs[1 - cur];
    nextImg.onload = () => {
      imgs[cur].classList.remove('is-on');
      nextImg.classList.add('is-on');
      cur = 1 - cur;
    };
    nextImg.src = src;
  };
  set(asset(MANIFEST.cover.front));
  onActive((page) => {
    if (!L.framed) return;
    if (page.id === 'p01') set(asset(MANIFEST.cover.inner));
    else set(srcFor(page.data.plate, 1080));
  });
  return { set: (src) => set(src) };
}

/** Scroll offset (in the scroller) at which a page's top sits at the top of the screen. */
export function pageTop(page) {
  return page.sec.offsetTop;
}
