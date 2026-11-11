// Builds the stacked pages from the generated manifest and wires the
// card-stack scroll (pin + slide over), parallax and the idle Ken Burns.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import manifest from './generated/manifest.json';
import { L, imageWidth } from './layout.js';
import { ENV } from './env.js';

export const MANIFEST = manifest;
export const pages = []; // ordered: p01 (inner page) .. p06
export const byId = {};

const BASE = import.meta.env.BASE_URL || '/';
export const asset = (p) => BASE + p.replace(/^\//, '');

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

function makeSection(id, index, srText) {
  const sec = el('section', 'page', { id: 'page-' + id, 'data-page': id });
  sec.style.zIndex = String(index + 1);
  const inner = el('div', 'page-inner');
  const fill = el('div', 'plate-fill', { 'aria-hidden': 'true' });
  const par = el('div', 'plate-par');
  const kb = el('div', 'plate-kb');
  const plate = el('div', 'plate', { 'aria-hidden': 'true' });
  const dim = el('div', 'page-dim');
  kb.appendChild(plate);
  par.appendChild(kb);
  inner.append(fill, par, dim);
  sec.appendChild(inner);
  if (srText) {
    const sr = el('div', 'sr-only');
    sr.textContent = srText;
    sec.appendChild(sr);
  }
  const page = { id, index, sec, inner, fill, par, kb, plate, dim, lines: [], ui: {}, loaded: false, fx: null };
  pages.push(page);
  byId[id] = page;
  return page;
}

export function buildStack(stackEl) {
  const W = imageWidth(manifest.widths);
  const cover = manifest.cover;

  // --- page 01: the inner page seen through the cover window
  const p1 = makeSection('p01', 0, 'Wedding invitation of Marziya and Mohammed Umar. M&U monogram.');
  const img1 = el('img', 'plate-img', { alt: '', decoding: 'async', fetchpriority: 'high' });
  img1.src = asset(cover.inner);
  p1.plate.appendChild(img1);
  p1.img = img1;
  const [mx, my, mw, mh] = cover.monogram;
  const sweep = el('div', 'mono-sweep');
  placePct(sweep, mx, my, mw, mh);
  sweep.dataset.mask = asset(cover.monogramMask);
  p1.plate.appendChild(sweep);
  p1.ui.sweep = sweep;
  const fill1 = el('img', '', { alt: '' });
  fill1.dataset.src = asset(cover.inner);
  p1.fill.appendChild(fill1);
  stackEl.appendChild(p1.sec);
  p1.loaded = true;

  // --- pages 02..06
  manifest.order.forEach((id, i) => {
    const m = manifest.pages[id];
    const page = makeSection(id, i + 1, m.sr);
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
    const fillImg = el('img', '', { alt: '' });
    fillImg.dataset.src = srcFor(m.plate, 1080);
    page.fill.appendChild(fillImg);
    stackEl.appendChild(page.sec);
    if (id === 'p05') {
      const spacer = el('div', 'page-spacer', { 'aria-hidden': 'true' });
      stackEl.appendChild(spacer);
      page.spacer = spacer;
    }
  });
  if (ENV.revealAll) {
    enableLoading();
    pages.forEach(loadPage);
  }
  return pages;
}

// Nothing but the cover parts and the page-02 plate (preloaded in <head>) loads
// before the guest taps; after that, pages load about one page ahead.
let loadingEnabled = false;
export function enableLoading() {
  loadingEnabled = true;
  const sw = byId.p01 && byId.p01.ui.sweep;
  if (sw && sw.dataset.mask) sw.style.webkitMaskImage = sw.style.maskImage = `url(${sw.dataset.mask})`;
  if (L.narrow) loadFills();
}
function loadFills() {
  for (const p of pages) {
    const f = p.fill.querySelector('img');
    if (f && f.dataset.src && !f.src && (p.loaded || p.id === 'p01')) f.src = f.dataset.src;
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
  if (L.narrow) loadFills();
  return page.ready;
}

export function updateSizes() {
  if (L.narrow && loadingEnabled) loadFills();
  for (const p of pages) if (p.loaded && p.img.srcset) p.img.sizes = Math.round(L.plateW) + 'px';
}

// ---------------------------------------------------------------- scroll

const listeners = { active: [], visible: [] };
export const onActive = (cb) => listeners.active.push(cb);
export const onVisible = (cb) => listeners.visible.push(cb);
export let activeIndex = 0;

export function createStackTriggers() {
  const n = pages.length;
  const rm = ENV.reducedMotion;
  pages.forEach((page, i) => {
    const next = pages[i + 1];
    // pin each page while the next one slides over it
    if (next) {
      ScrollTrigger.create({
        trigger: page.sec,
        start: 'top top',
        endTrigger: next.sec,
        end: 'top top',
        pin: true,
        pinSpacing: false,
        anticipatePin: 0,
      });
      // the outgoing page recedes
      const tl = gsap.timeline({
        scrollTrigger: { trigger: next.sec, start: 'top bottom', end: 'top top', scrub: true },
      });
      tl.fromTo(page.inner, { scale: 1, borderRadius: 0 }, { scale: rm ? 1 : 0.92, borderRadius: 18, ease: 'none' }, 0);
      tl.fromTo(page.dim, { opacity: 0 }, { opacity: 0.5, ease: 'none' }, 0);
    }

    // gentle parallax tied to scroll (applied to the whole plate so overlays move with it)
    if (!rm) {
      const settledAt = i === 0 ? 0.5 : next ? (page.spacer ? 0.25 : 0.5) : 1;
      gsap.fromTo(page.par, { y: () => -0.03 * L.pageH }, {
        y: () => (next ? 0.03 : 0) * L.pageH,
        ease: 'none',
        immediateRender: false,
        scrollTrigger: {
          trigger: page.sec,
          start: 'top bottom',
          endTrigger: next ? next.sec : page.sec,
          end: next ? 'top top' : 'top top',
          scrub: true,
          invalidateOnRefresh: true,
        },
      });
      gsap.set(page.par, { y: 0 });
      page.settledAt = settledAt;
    }

    // visibility (for effects, Ken Burns, lazy loading)
    ScrollTrigger.create({
      trigger: page.sec,
      start: 'top bottom',
      endTrigger: next ? next.sec : page.sec,
      end: next ? 'top top' : 'bottom top',
      onToggle: (self) => {
        page.visible = self.isActive;
        listeners.visible.forEach((cb) => cb(page, self.isActive));
        if (self.isActive) {
          loadPage(page);
          loadPage(pages[i + 1]);
        }
      },
    });

    // "settled": the page is (almost) fully in view
    ScrollTrigger.create({
      trigger: page.sec,
      start: 'top 45%',
      endTrigger: next ? next.sec : page.sec,
      end: next ? 'top 45%' : 'bottom top',
      onToggle: (self) => {
        if (self.isActive) {
          activeIndex = i;
          listeners.active.forEach((cb) => cb(page, i));
          loadPage(pages[i + 1]);
        }
      },
    });
  });
  void n;
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
