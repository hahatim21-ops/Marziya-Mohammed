import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/latin-600.css';
import '@fontsource/pinyon-script/latin-400.css';
import './styles.css';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { ENV } from './env.js';
import { computeLayout, onLayoutChange, L } from './layout.js';
import {
  buildStack, createStackTriggers, pages, byId, onActive, onVisible,
  startKenBurns, pauseKenBurns, initBackdrop, updateSizes, loadPage, enableLoading,
} from './stack.js';
import { initOpening } from './opening.js';
import { initMusic, showMusicButton, preloadMusic } from './music.js';
import { revealLines, showLinesNow } from './reveal.js';
import { initPageUI } from './pageui.js';
import { initFx } from './fx/index.js';

gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ ignoreMobileResize: true });

const root = document.documentElement;

if (ENV.debug === 'plates') {
  import('./debug.js').then((m) => m.platesPage());
} else if (ENV.debug === 'align') {
  import('./debug.js').then((m) => m.alignPage(ENV.params.get('page') || 'p02'));
} else {
  boot();
}

function waitImages(imgs, ms) {
  const all = Promise.all(imgs.map((img) => {
    if (img.complete && img.naturalWidth) return img.decode ? img.decode().catch(() => {}) : null;
    return new Promise((r) => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); });
  }));
  return Promise.race([all, new Promise((r) => setTimeout(r, ms))]);
}

function boot() {
  computeLayout();
  const scrollerEl = document.getElementById('scroller');
  const stackEl = document.getElementById('stack');
  window.scrollTo(0, 0);
  scrollerEl.scrollTop = 0;

  buildStack(stackEl);

  const lenis = new Lenis(L.framed
    ? { wrapper: scrollerEl, content: stackEl, syncTouch: false, autoRaf: false }
    : { syncTouch: false, autoRaf: false });
  if (L.framed) ScrollTrigger.defaults({ scroller: scrollerEl });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();
  window.__lenis = lenis;

  initMusic();

  // Everything below the cover (scroll triggers, effects, page UI) is set up in
  // idle time after the cover shows, or at the latest when the guest taps.
  let ui = null;
  let fx = null;
  const revealed = new Set();
  const setupStack = () => {
    if (ui) return;
    createStackTriggers();
    initBackdrop();
    ui = initPageUI({ lenis });
    fx = initFx({ lenis });
    // Ken Burns + effects only on visible pages
    onVisible((page, on) => {
      if (on) startKenBurns(page); else pauseKenBurns(page);
      fx.setVisible(page, on);
    });
    onActive((page) => revealPage(page));
    if (ENV.revealAll) {
      pages.forEach((p) => { if (p.lines.length) { showLinesNow(p.lines); revealed.add(p.id); ui.onPageReveal(p, null, true); } });
    }
    if (ENV.debug === '1') import('./debug.js').then((m) => m.overlayDebug(pages));
    ScrollTrigger.refresh();
  };

  // line reveals once each page has settled
  const revealPage = (page) => {
    if (page.id === 'p01' || revealed.has(page.id)) return;
    revealed.add(page.id);
    loadPage(page);
    const lines = page.id === 'p05' ? page.lines.filter((l) => l.phase === 'A') : page.lines;
    waitImages(lines.map((l) => l.el), 2500).then(() => {
      const dark = page.data.polarity === 'dark';
      const tl = revealLines(lines, page.plate, dark, 0.1);
      ui.onPageReveal(page, tl);
    });
  };
  const opening = initOpening({
    lenis,
    onCoverShown: () => {
      preloadMusic();
      const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 300));
      idle(setupStack, { timeout: 1200 });
    },
    onOpenStart: () => {
      setupStack();
      enableLoading();
      loadPage(pages[1]);
      loadPage(pages[2]);
    },
    onOpened: () => {
      fx.startPetals();
      showMusicButton();
    },
    onUnlock: () => {
      root.classList.remove('is-locked');
      lenis.start();
      ScrollTrigger.refresh();
    },
  });

  onLayoutChange(() => {
    if (L.framed !== root.classList.contains('was-framed')) { /* mode flips are handled by reload below */ }
    updateSizes();
    opening.layout();
    ScrollTrigger.refresh();
    if (fx) fx.resize();
    if (ui) ui.resize();
  });
  root.classList.toggle('was-framed', L.framed);
  let lastFramed = L.framed;
  window.addEventListener('resize', () => {
    if ((window.innerWidth > 600) !== lastFramed) {
      lastFramed = !lastFramed;
      location.reload();
    }
  });

  // always start at the cover
  requestAnimationFrame(() => {
    window.scrollTo(0, 0);
    scrollerEl.scrollTop = 0;
    lenis.scrollTo(0, { immediate: true, force: true });
    ScrollTrigger.refresh();
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) location.reload();
  });
  void byId;
}
