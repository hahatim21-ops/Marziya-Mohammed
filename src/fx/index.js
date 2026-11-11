// Background motion: one shared requestAnimationFrame loop drives every effect,
// only for pages in or near the viewport. Everything pauses when the tab is hidden.
import { ENV } from '../env.js';
import { L } from '../layout.js';
import { pages, onActive, asset } from '../stack.js';
import { CurtainRenderer } from './curtains.js';
import { createSparkles } from './sparkles.js';
import { createCandles } from './candles.js';
import { createPetals } from './petals.js';
import { createDust } from './dust.js';

const systems = new Set();
let raf = 0;
let lastT = 0;
let running = false;

// frame-rate watchdog for the WebGL curtains
let slowFor = 0;
let curtainsDisabled = false;
let lenisRef = null;
let stillFor = 1;

function frame(t) {
  raf = 0;
  const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 1 / 60;
  lastT = t;
  // While the page is scrolling, background effects hold their last frame so the
  // scroll gets the whole frame budget; petals and dust keep moving.
  const scrolling = !!(lenisRef && (lenisRef.isScrolling || Math.abs(lenisRef.velocity) > 0.3));
  stillFor = scrolling ? 0 : stillFor + dt;
  const animateBackground = stillFor > 0.12;
  // frame-rate watchdog, measured while the page is still (scrolling has its own cost)
  if (animateBackground && !curtainsDisabled && anyRendererActive()) {
    if (dt > 1 / 45) slowFor += dt; else slowFor = Math.max(0, slowFor - dt * 0.5);
    if (slowFor > 2) {
      curtainsDisabled = true;
      for (const r of renderers.values()) r.disable('low fps');
    }
  }
  for (const s of systems) {
    if (s.background && !animateBackground) continue;
    s.update(t / 1000, dt);
  }
  if (running && systems.size) raf = requestAnimationFrame(frame);
  else lastT = 0;
}
function kick() {
  if (!running || raf || document.hidden) return;
  raf = requestAnimationFrame(frame);
}
function addSystem(s) { systems.add(s); kick(); }
function removeSystem(s) { systems.delete(s); }

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastT = 0;
  } else kick();
});

// One WebGL renderer (curtain sway + chandelier sway) per visible design page, so
// every chandelier on screen moves. At most MAX_GL contexts are kept alive.
const renderers = new Map(); // page -> CurtainRenderer
const MAX_GL = 3;
let glOk = true;
let useGL = false;
function anyRendererActive() {
  for (const r of renderers.values()) if (r.active) return true;
  return false;
}
function rendererFor(page) {
  let r = renderers.get(page);
  if (r || !useGL || !glOk || curtainsDisabled) return r || null;
  if (renderers.size >= MAX_GL) {
    // release the renderer of a page that is off screen
    for (const [p, old] of renderers) {
      if (!p.visible) { old.destroy(); removeSystem(old); renderers.delete(p); break; }
    }
    if (renderers.size >= MAX_GL) return null;
  }
  r = new CurtainRenderer();
  if (!r.ok) { glOk = false; return null; }
  renderers.set(page, r);
  addSystem(r);
  return r;
}

let petals = null;
let dust = null;

const noop = () => {};
export const fxApi = {
  burst: noop,
  setPetalDensity: noop,
  drizzle: noop,
};

class PageFx {
  get background() { return true; }

  constructor(page) {
    this.page = page;
    this.data = page.data.fxData || {};
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'fx-canvas';
    page.plate.insertBefore(this.canvas, page.fxLayer);
    this.ctx = this.canvas.getContext('2d');
    this.parts = [];
    const reduced = ENV.reducedMotion;
    this.parts.push(createSparkles(this.data, { reduced, asset }));
    this.parts.push(createCandles(this.data, { reduced, lowEnd: ENV.lowEnd, asset, floor: page.id === 'p05' }));
    this.resize();
    this.staticDrawn = false;
  }
  resize() {
    // soft glows and glints do not need more than 1x
    const k = 1;
    this.w = Math.round(L.plateW * k);
    this.h = Math.round(L.plateH * k);
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.staticDrawn = false;
  }
  update(t, dt) {
    const c = this.ctx;
    if (ENV.reducedMotion) {
      if (this.staticDrawn) return;
      this.staticDrawn = true;
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, this.w, this.h);
    c.globalCompositeOperation = 'lighter';
    for (const p of this.parts) p.draw(c, this.w, this.h, t, dt);
  }
}

export function initFx(opts = {}) {
  lenisRef = opts.lenis || null;
  if (ENV.fxOff) {
    return { setVisible: noop, startPetals: noop, drizzle: noop, resize: noop };
  }
  running = true;
  const pageFx = new Map();
  const reduced = ENV.reducedMotion;

  if (!reduced) {
    useGL = true;
    petals = createPetals(document.getElementById('petals'));
    dust = createDust(document.getElementById('dust'));
    fxApi.burst = (x, y, n) => { petals.burst(x, y, n); addSystem(petals); };
    fxApi.setPetalDensity = (d) => petals.setDensity(d);
    fxApi.drizzle = (n, sec) => { petals.drizzle(n, sec); addSystem(petals); };
    onActive((page) => {
      petals.setDensity(page.id === 'p06' ? 1.8 : 1);
    });
  }

  const api = {
    setVisible(page, on) {
      if (!page.data) return; // the inner page has no background effects
      let fx = pageFx.get(page);
      if (on) {
        if (!fx) {
          fx = new PageFx(page);
          pageFx.set(page, fx);
        }
        addSystem(fx);
      } else if (fx) {
        removeSystem(fx);
      }
      if (on) {
        const r = rendererFor(page);
        if (r) { r.attach(page); r.resume(); }
      } else {
        const r = renderers.get(page);
        if (r) r.pause();
      }
    },
    drizzle(n, sec) { fxApi.drizzle(n, sec); },
    startPetals() {
      if (!petals) return;
      petals.start();
      addSystem(petals);
      addSystem(dust);
    },
    resize() {
      for (const fx of pageFx.values()) fx.resize();
      if (petals) petals.resize();
      if (dust) dust.resize();
      for (const r of renderers.values()) r.resize();
    },
  };
  void pages;
  return api;
}
