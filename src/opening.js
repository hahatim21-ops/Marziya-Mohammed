// Page 01: loader, the embossed cover with its die-cut oval window, and the
// book-cover swing (hinged on the LEFT edge) copied from the reference reel.
import { gsap } from 'gsap';
import { MANIFEST, asset, byId } from './stack.js';
import { L } from './layout.js';
import { ENV } from './env.js';
import { CONFIG } from './config.js';
import { startMusic } from './music.js';
import monogram from './generated/monogram-paths.json';

const root = document.documentElement;
const coverEl = document.getElementById('cover');
const loaderEl = document.getElementById('loader');
const leaf = coverEl.querySelector('.cover-leaf');
const front = coverEl.querySelector('.cover-front');
const coverPlate = coverEl.querySelector('.cover-plate');
const coverImg = coverEl.querySelector('.cover-img');
const backImg = coverEl.querySelector('.cover-back-img');
const backFace = coverEl.querySelector('.cover-back');
const sheen = coverEl.querySelector('.cover-sheen');
const shade = coverEl.querySelector('.cover-shade');
const shadow = coverEl.querySelector('.cover-shadow');
const ring = coverEl.querySelector('.cover-ring');
const winShadow = coverEl.querySelector('.cover-window-shadow');
const edgeShadow = coverEl.querySelector('.cover-edge-shadow');
const label = coverEl.querySelector('.tap-label');
const hint = document.getElementById('scroll-hint');

let idle = [];
let opened = false;

function decode(img) {
  if (img.complete && img.naturalWidth) return img.decode ? img.decode().catch(() => {}) : Promise.resolve();
  return new Promise((res) => {
    img.addEventListener('load', () => (img.decode ? img.decode().catch(() => {}).then(res) : res()), { once: true });
    img.addEventListener('error', res, { once: true });
  });
}

function buildLoader() {
  const svg = loaderEl.querySelector('svg');
  svg.setAttribute('viewBox', `0 0 ${monogram.w} ${monogram.h}`);
  const ns = 'http://www.w3.org/2000/svg';
  const paths = monogram.paths.map((d) => {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
    return p;
  });
  if (ENV.reducedMotion) {
    paths.forEach((p) => { p.style.fill = 'rgba(246,233,220,.9)'; p.style.stroke = 'none'; });
    return gsap.timeline();
  }
  const tl = gsap.timeline();
  paths.forEach((p, i) => {
    const len = p.getTotalLength ? p.getTotalLength() : 2000;
    gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
    tl.to(p, { strokeDashoffset: 0, duration: 1.6, ease: 'power1.inOut' }, i * 0.12);
  });
  tl.to(paths, { fill: 'rgba(246,233,220,0.22)', duration: 0.8, ease: 'sine.out' }, '-=0.6');
  return tl;
}

/** Position the cover parts for the current layout. */
export function layoutCover() {
  const o = MANIFEST.cover.oval;
  const cx = L.plateX + (o.cx / 100) * L.plateW;
  const cy = L.plateY + (o.cy / 100) * L.plateH;
  coverEl.style.setProperty('--ring-x', cx + 'px');
  coverEl.style.setProperty('--ring-y', cy + 'px');
  coverEl.style.setProperty('--ring-w', (2 * o.rx / 100) * L.plateW + 'px');
  coverEl.style.setProperty('--ring-h', (2 * o.ry / 100) * L.plateH + 'px');
  // the die-cut hole is the cream oval inset by ~2px of the 941px-wide cover
  const inset = (2 / 941) * L.plateW;
  coverEl.style.setProperty('--win-w', (2 * o.rx / 100) * L.plateW - 2 * inset + 'px');
  coverEl.style.setProperty('--win-h', (2 * o.ry / 100) * L.plateH - 2 * inset + 'px');
  coverPlate.style.transformOrigin = `${o.cx}% ${o.cy}%`;
  const inner = byId.p01 && byId.p01.inner;
  if (inner) inner.style.transformOrigin = `${cx}px ${cy}px`;
}

function startIdle() {
  if (ENV.reducedMotion) {
    gsap.set(label, { opacity: 1 });
    return;
  }
  idle.push(gsap.fromTo(label, { opacity: 0.45 }, { opacity: 1, duration: 0.9, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
  idle.push(gsap.fromTo(coverPlate, { scale: 1 }, { scale: 1.008, duration: 2.5, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
  const sweep = gsap.timeline({ repeat: -1, repeatDelay: 2.9, delay: 0.8 });
  sweep.fromTo(sheen, { backgroundPosition: '130% 0' }, { backgroundPosition: '-30% 0', duration: 1.6, ease: 'sine.inOut' });
  idle.push(sweep);
  const rip = gsap.timeline({ repeat: -1, repeatDelay: 0.6, delay: 0.4 });
  rip.fromTo(ring, { scale: 1, opacity: 0.55 }, { scale: 1.28, opacity: 0, duration: 1.8, ease: 'sine.out' });
  idle.push(rip);
}

function stopIdle() {
  idle.forEach((t) => t.kill());
  idle = [];
}

function tapRipple(x, y) {
  const r = document.createElement('div');
  r.className = 'tap-ripple';
  r.style.left = x + 'px';
  r.style.top = y + 'px';
  coverEl.appendChild(r);
  gsap.fromTo(r, { scale: 1, opacity: 0.9 }, { scale: 9, opacity: 0, duration: 0.9, ease: 'power2.out', onComplete: () => r.remove() });
}

function showScrollHint(lenis) {
  hint.querySelector('.sh-text').textContent = CONFIG.strings.scroll;
  gsap.to(hint, { opacity: 1, duration: 0.8, ease: 'sine.out' });
  let hidden = false;
  const hide = () => {
    if (hidden) return;
    hidden = true;
    gsap.to(hint, { opacity: 0, duration: 0.5, onComplete: () => { hint.style.display = 'none'; } });
  };
  if (lenis) lenis.on('scroll', ({ scroll }) => { if (scroll > 8) hide(); });
  const sc = L.framed ? document.getElementById('scroller') : window;
  sc.addEventListener('scroll', () => hide(), { passive: true, once: true });
}

/**
 * @param {{ lenis: any, onOpenStart: Function, onOpened: Function, onUnlock: Function }} opts
 */
export function initOpening(opts) {
  label.textContent = CONFIG.strings.tapToOpen;
  coverEl.setAttribute('aria-label', `${CONFIG.strings.tapToOpen} the invitation`);
  coverImg.crossOrigin = 'anonymous';
  coverImg.src = asset(MANIFEST.cover.front);
  backImg.src = asset(MANIFEST.cover.back);
  layoutCover();
  // nothing under the closed cover is reachable (keyboard, screen readers)
  const scroller = document.getElementById('scroller');
  scroller.inert = true;

  const inner = byId.p01;
  // with the cover closed the inner page waits slightly enlarged and dimmed
  if (!ENV.reducedMotion) gsap.set(inner.inner, { scale: 1.025 });
  gsap.set(inner.dim, { opacity: 0.08 });

  const loaderTl = buildLoader();
  const t0 = performance.now();
  const ready = Promise.all([decode(coverImg), decode(inner.img)]);
  const timeout = new Promise((r) => setTimeout(r, 3000));
  Promise.race([ready, timeout]).then(() => {
    const minShow = ENV.skipIntro ? 0 : 1100;
    const wait = Math.max(0, minShow - (performance.now() - t0));
    setTimeout(() => {
      root.classList.remove('is-loading');
      gsap.to(loaderEl, {
        opacity: 0, duration: ENV.skipIntro ? 0 : 0.7, ease: 'sine.inOut',
        onComplete: () => { loaderTl.kill(); loaderEl.remove(); },
      });
      startIdle();
      if (opts.onCoverShown) opts.onCoverShown();
      if (ENV.skipIntro) open(null, true);
    }, wait);
  });

  const onTap = (e) => {
    if (opened) return;
    if (e.type === 'keydown') {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
    }
    open(e, false);
  };
  coverEl.addEventListener('click', onTap);
  coverEl.addEventListener('keydown', onTap);

  function open(e, instant) {
    if (opened) return;
    opened = true;
    // 0.00: music must start inside this same handler, synchronously
    if (!instant) startMusic();
    stopIdle();
    if (!instant && navigator.vibrate) { try { navigator.vibrate(10); } catch (err) { /* ignore */ } }
    if (opts.onOpenStart) opts.onOpenStart();
    const rect = coverEl.getBoundingClientRect();
    if (e && e.clientX != null && e.type !== 'keydown') tapRipple(e.clientX - rect.left, e.clientY - rect.top);
    else tapRipple(rect.width / 2, rect.height * 0.47);

    const finish = () => {
      scroller.inert = false;
      coverEl.remove();
      if (opts.onOpened) opts.onOpened();
    };
    const unlock = () => {
      if (opts.onUnlock) opts.onUnlock();
      showScrollHint(opts.lenis);
    };

    if (instant) {
      gsap.set(inner.inner, { scale: 1 });
      gsap.set(inner.dim, { opacity: 0 });
      finish();
      unlock();
      return;
    }

    if (ENV.reducedMotion) {
      const tl = gsap.timeline();
      tl.to(label, { opacity: 0, duration: 0.2 }, 0);
      tl.to(coverEl, { opacity: 0, duration: 0.8, ease: 'none' }, 0);
      tl.to(inner.dim, { opacity: 0, duration: 0.8 }, 0);
      tl.add(finish, 0.8);
      tl.add(unlock, 0.9);
      return;
    }

    const state = { a: 0 };
    const tl = gsap.timeline();
    tl.to(label, { opacity: 0, duration: 0.2, ease: 'sine.out' }, 0);
    tl.to(ring, { opacity: 0, duration: 0.2 }, 0);
    // 0.00–0.15 the cover lifts
    tl.to(leaf, { scale: 1.012, duration: 0.15, ease: 'power1.out' }, 0);
    tl.to(winShadow, { boxShadow: 'inset 0px 14px 26px rgba(0, 0, 0, 0.5)', duration: 0.15 }, 0);
    tl.to([winShadow, edgeShadow], { opacity: 0, duration: 0.35, ease: 'sine.out' }, 0.15);
    // 0.15–1.95 swing open, hinged on the left, right edge toward the viewer.
    // The visible half (0→90°) eases out like the reel: ~55° at +0.8s, ~75° at
    // +1.2s, a thin sliver (~87°) at +1.6s; the edge-on remainder to 180° is instant.
    const swing = (p) => (p < 0.97 ? 0.5 * (1 - (1 - p / 0.97) ** 2) : 0.5 + 0.5 * ((p - 0.97) / 0.03));
    tl.to(state, {
      a: 180, duration: 1.8, ease: swing,
      onUpdate: () => {
        const a = state.a;
        gsap.set(leaf, { rotationY: -a });
        const past = a > 90;
        front.style.visibility = past ? 'hidden' : '';
        backFace.style.visibility = past ? 'visible' : 'hidden';
        const s = Math.sin((Math.min(a, 90) * Math.PI) / 180);
        shade.style.opacity = String(0.45 * s * s);
        // moving shadow across the inner page, peaking around 60–75°
        const peak = 68;
        let f = a <= peak ? a / peak : 1 - (a - peak) / 24;
        f = Math.max(0, Math.min(1, f));
        f = f * f * (3 - 2 * f);
        shadow.style.width = 65 * f + '%';
        shadow.style.opacity = String(0.6 * f);
      },
    }, 0.15);
    tl.to(leaf, { scale: 1, duration: 1.0, ease: 'sine.inOut' }, 0.15);
    // inner page settles
    tl.to(inner.inner, { scale: 1, duration: 1.8, ease: 'power2.out' }, 0.15);
    tl.to(inner.dim, { opacity: 0, duration: 1.8, ease: 'sine.out' }, 0.15);
    // 2.00 remove the cover, light sweep across the embossed M&U, petals begin
    tl.add(() => {
      finish();
      const sw = inner.ui.sweep;
      gsap.fromTo(sw, { opacity: 1, backgroundPosition: '100% 0' }, {
        backgroundPosition: '0% 0', duration: 1.5, ease: 'sine.inOut',
        onComplete: () => gsap.set(sw, { opacity: 0 }),
      });
    }, 2.0);
    // 2.40 unlock scrolling
    tl.add(unlock, 2.4);
    window.__openTl = tl; // QA: lets screenshots seek to exact times
  }

  return { layout: layoutCover, get opened() { return opened; } };
}
