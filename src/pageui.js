// Live UI that sits inside the plates: page 04 scratch card, countdown and
// "Save the Dates"; page 05 one-location-at-a-time; page 06 "View again".
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CONFIG } from './config.js';
import { ENV } from './env.js';
import { L } from './layout.js';
import { byId, placePct, onVisible, loadPage } from './stack.js';
import { createScratch } from './scratch.js';
import { createCountdown } from './countdown.js';
import { initSheets, openLocationSheet, openDatesSheet, onSheetClose } from './sheet.js';
import { revealLines } from './reveal.js';
import { fxApi } from './fx/index.js';

const S = CONFIG.strings;
const PIN = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>';
const CAL = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M4 6.5h16v13H4zM4 10h16M8 4v4M16 4v4"/></svg>';

function pill(html, label) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'pill';
  b.innerHTML = `${html}<span></span><i class="pill-ring" aria-hidden="true"></i>`;
  b.querySelector('span').textContent = label;
  return b;
}

/** A line's element plus its glow-bloom copy, if it has one. */
function withBloom(lines) {
  const out = [];
  for (const l of lines) {
    out.push(l.el);
    const n = l.el.nextElementSibling;
    if (n && n.classList.contains('ov-bloom')) out.push(n);
  }
  return out;
}

function show(el, d = 0.7, delay = 0) {
  el.style.visibility = 'visible';
  return gsap.to(el, { opacity: 1, duration: ENV.reducedMotion ? 0.3 : d, delay, ease: 'sine.out' });
}
function hide(el, d = 0.35) {
  return gsap.to(el, { opacity: 0, duration: d, ease: 'sine.in', onComplete: () => { el.style.visibility = 'hidden'; } });
}

export function initPageUI({ lenis }) {
  initSheets({ lenis });
  const api = {};
  const parts = {};

  // ------------------------------------------------------------ page 04
  const p4 = byId.p04;
  {
    const plate = p4.plate;
    const box = document.createElement('div');
    box.className = 'scratch';
    placePct(box, 22, 45.6, 56, 15);
    const glow = document.createElement('div');
    glow.className = 'date-glow';
    placePct(glow, 14, 41, 72, 24);
    const cd = document.createElement('div');
    cd.className = 'countdown';
    placePct(cd, 15, 75.5, 70, 8);
    const save = pill(CAL, S.saveTheDates);
    save.classList.add('save-dates');
    placePct(save, 50, 88);
    plate.append(glow, box, cd, save);
    // the plate is aria-hidden for the images; the UI must stay reachable
    plate.removeAttribute('aria-hidden');
    p4.img.setAttribute('aria-hidden', 'true');

    const countdown = createCountdown(cd);
    const scratch = createScratch(box, {
      lenis,
      onReveal: (instant) => {
        if (navigator.vibrate) { try { navigator.vibrate(25); } catch (e) { /* ignore */ } }
        if (!instant && !ENV.reducedMotion) {
          const r = box.getBoundingClientRect();
          fxApi.burst(r.left + r.width / 2, r.top + r.height / 2, 26);
          gsap.fromTo(glow, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'sine.out', yoyo: true, repeat: 1, repeatDelay: 0.3 });
        }
        countdown.pulse();
        show(save, 0.8, instant ? 0 : 0.5);
      },
    });
    save.addEventListener('click', () => openDatesSheet(save));
    onVisible((page, on) => { if (page === p4) scratch.setVisible(on); });
    parts.p04 = { countdown, scratch, cd, save };
  }

  // ------------------------------------------------------------ page 05
  const p5 = byId.p05;
  {
    const plate = p5.plate;
    plate.removeAttribute('aria-hidden');
    p5.img.setAttribute('aria-hidden', 'true');
    const b1 = pill(PIN, S.tapForLocation);
    b1.classList.add('loc-btn');
    b1.setAttribute('aria-label', `${S.tapForLocation}: ${CONFIG.events[0].title}`);
    placePct(b1, 50, 44.6);
    const b2 = pill(PIN, S.tapForLocation);
    b2.classList.add('loc-btn');
    b2.setAttribute('aria-label', `${S.tapForLocation}: ${CONFIG.events[1].title}`);
    placePct(b2, 50, 74.5);
    const scrollFor = document.createElement('div');
    scrollFor.className = 'scroll-for';
    scrollFor.innerHTML = '<span></span><span class="arr" aria-hidden="true">↓</span>';
    scrollFor.firstChild.textContent = S.scrollForReception;
    placePct(scrollFor, 50, 82);
    plate.append(b1, b2, scrollFor);

    const nikah = p5.lines.filter((l) => l.phase === 'A');
    const recep = p5.lines.filter((l) => l.phase === 'B');
    let phaseB = false;
    let phaseAReady = false;
    let hintTimer = 0;
    let hintShown = false;
    let b1Opened = false;

    const showHint = () => {
      if (phaseB || hintShown) return;
      hintShown = true;
      show(scrollFor, 0.8);
    };
    b1.addEventListener('click', () => {
      b1Opened = true;
      clearTimeout(hintTimer);
      openLocationSheet('nikah', b1);
    });
    b2.addEventListener('click', () => openLocationSheet('reception', b2));
    onSheetClose(() => { if (b1Opened && !phaseB) showHint(); });

    api.p05AReady = () => {
      if (phaseAReady) return;
      phaseAReady = true;
      show(b1, 0.8);
      hintTimer = setTimeout(() => { if (!b1Opened) showHint(); }, 4000);
    };

    let recepTl = null;
    const enterB = () => {
      if (phaseB) return;
      phaseB = true;
      clearTimeout(hintTimer);
      hide(scrollFor, 0.3);
      gsap.to(nikah.map((l) => l.el), { opacity: 0.55, duration: 0.8, ease: 'sine.inOut', overwrite: 'auto' });
      gsap.to(withBloom(nikah).filter((e) => e.classList.contains('ov-bloom')), { opacity: 0.2, duration: 0.8, overwrite: 'auto' });
      gsap.to(b1, { opacity: 0.6, duration: 0.8 });
      const fresh = recep.filter((l) => !l.revealed);
      if (fresh.length) {
        recepTl = revealLines(recep, plate, false, 0.15);
        recepTl.add(() => show(b2, 0.8), '+=0.1');
      } else {
        gsap.to(recep.map((l) => l.el), { opacity: 1, duration: 0.6, overwrite: 'auto' });
        gsap.to(withBloom(recep).filter((e) => e.classList.contains('ov-bloom')), { opacity: 0.3, duration: 0.6, overwrite: 'auto' });
        show(b2, 0.6, 0.3);
      }
    };
    const leaveB = () => {
      if (!phaseB) return;
      phaseB = false;
      if (recepTl) { recepTl.progress(1); recepTl = null; }
      gsap.to(withBloom(recep), { opacity: 0, duration: 0.35, overwrite: 'auto' });
      hide(b2, 0.3);
      gsap.to(nikah.map((l) => l.el), { opacity: 1, duration: 0.5, overwrite: 'auto' });
      gsap.to(withBloom(nikah).filter((e) => e.classList.contains('ov-bloom')), { opacity: 0.3, duration: 0.5, overwrite: 'auto' });
      if (phaseAReady) gsap.to(b1, { opacity: 1, duration: 0.5 });
    };
    // pin page 05 for ~2 viewport heights; phase B in the middle of that run
    ScrollTrigger.create({
      trigger: p5.sec,
      start: 'top top',
      end: () => '+=' + 2 * L.pageH,
      onUpdate: (self) => {
        const p = self.progress;
        if (p >= 0.45 && !phaseB) {
          if (!phaseAReady) {
            // the guest scrolled very fast: settle phase A first
            nikah.forEach((l) => { l.revealed = true; gsap.set(l.el, { opacity: 1, y: 0, clearProps: 'filter' }); });
            api.p05AReady();
          }
          enterB();
        } else if (p < 0.3 && phaseB) {
          leaveB();
        }
      },
      onLeaveBack: () => leaveB(),
    });
    parts.p05 = { b1, b2, scrollFor, get phaseB() { return phaseB; } };
  }

  // ------------------------------------------------------------ page 06
  const p6 = byId.p06;
  {
    const plate = p6.plate;
    plate.removeAttribute('aria-hidden');
    p6.img.setAttribute('aria-hidden', 'true');
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'view-again';
    again.innerHTML = '<span aria-hidden="true">↺&nbsp;</span><span></span>';
    again.lastChild.textContent = S.viewAgain;
    placePct(again, 50, 89.5);
    again.style.opacity = '0';
    plate.append(again);
    again.addEventListener('click', () => {
      lenis.scrollTo(0, { duration: ENV.reducedMotion ? 0.01 : 3.2, easing: (t) => 1 - Math.pow(1 - t, 3), force: true });
    });
    parts.p06 = { again };
  }

  // reveal hooks (called once a page's lines start revealing)
  api.onPageReveal = (page, tl, instant) => {
    if (page.id === 'p04') {
      const cd = parts.p04.cd;
      if (instant) gsap.set(cd, { opacity: 1 });
      else gsap.to(cd, { opacity: 1, duration: 1.0, delay: 0.5, ease: 'sine.out' });
    }
    if (page.id === 'p05') {
      if (instant) {
        api.p05AReady();
      } else if (tl) {
        tl.add(() => api.p05AReady(), '+=0.15');
      }
    }
    if (page.id === 'p06') {
      gsap.to(parts.p06.again, { opacity: 1, duration: 1, delay: instant ? 0 : 2.2 });
      fxApi.setPetalDensity(1.8);
    }
  };
  api.resize = () => {
    parts.p04.countdown.resize();
    parts.p04.scratch.resize();
  };
  api.parts = parts;
  void loadPage;
  return api;
}
