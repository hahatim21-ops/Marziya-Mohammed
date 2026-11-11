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
  if (animateBackground && curtains && curtains.active && !curtainsDisabled) {
    if (dt > 1 / 45) slowFor += dt; else slowFor = Math.max(0, slowFor - dt * 0.5);
    if (slowFor > 2) {
      curtainsDisabled = true;
      curtains.disable('low fps');
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

let curtains = null;
let petals = null;
let dust = null;

const noop = () => {};
export const fxApi = {
  burst: noop,
  setPetalDensity: noop,
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
    return { setVisible: noop, startPetals: noop, resize: noop };
  }
  running = true;
  const pageFx = new Map();
  const reduced = ENV.reducedMotion;

  if (!reduced) {
    curtains = new CurtainRenderer();
    if (!curtains.ok) curtains = null;
    petals = createPetals(document.getElementById('petals'));
    dust = createDust(document.getElementById('dust'));
    fxApi.burst = (x, y, n) => { petals.burst(x, y, n); addSystem(petals); };
    fxApi.setPetalDensity = (d) => petals.setDensity(d);
    onActive((page) => {
      petals.setDensity(page.id === 'p06' ? 1.8 : 1);
      if (curtains && !curtainsDisabled && page.data) curtains.attach(page);
      else if (curtains && page.id === 'p01') curtains.detach();
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
      if (curtains && !on && curtains.page === page) curtains.pause();
      if (curtains && on && curtains.page === page) curtains.resume();
    },
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
      if (curtains) curtains.resize();
    },
  };
  if (curtains) addSystem(curtains);
  void pages;
  return api;
}
