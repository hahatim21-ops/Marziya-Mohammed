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
import { revealLine, lineOccupancy, showLinesNow } from './reveal.js';
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
    if (ENV.revealAll) {
      pages.forEach((p) => { if (p.lines.length) { showLinesNow(p.lines); revealed.add(p.id); ui.onPageReveal(p, null, true); } });
    } else {
      createLineTriggers();
    }
    if (ENV.debug === '1') import('./debug.js').then((m) => m.overlayDebug(pages));
    ScrollTrigger.refresh();
  };

  // Continuous scroll: each line reveals once as it comes up into view. Lines that
  // arrive together are queued in reading order (scripts take ~1s before the next).
  const createLineTriggers = () => {
    for (const page of pages) {
      if (!page.data || page.id === 'p05') continue; // page 05 is scroll-driven (pageui.js)
      const dark = page.data.polarity === 'dark';
      page.revealAt = 0;
      for (const line of page.lines) {
        ScrollTrigger.create({
          trigger: line.el,
          start: 'top 86%',
          once: true,
          onEnter: () => {
            loadPage(page);
            waitImages([line.el], 2500).then(() => {
              const nowS = performance.now() / 1000;
              const at = Math.max(nowS, page.revealAt);
              page.revealAt = at + lineOccupancy(line.type);
              gsap.delayedCall(at - nowS, () => {
                revealLine(line, page.plate, dark);
                if (!revealed.has(page.id)) {
                  revealed.add(page.id);
                  ui.onPageReveal(page, null);
                }
              });
            });
          },
        });
      }
    }
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
    onFillStart: () => {
      fx.startPetals();
      fx.drizzle(18, 2.2);
    },
    onOpened: () => {
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
