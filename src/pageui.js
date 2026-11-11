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
  // Scroll-driven and reversible. As page 05 rises into view the Nikah lines fade
  // in one after another, then its location button; scrolling on fades in the
  // Reception lines, then the second button. Each button sits in the clear gap
  // under its block and is sized to that gap, so nothing touches any text.
  const p5 = byId.p05;
  {
    const plate = p5.plate;
    plate.removeAttribute('aria-hidden');
    p5.img.setAttribute('aria-hidden', 'true');
    const nikah = p5.lines.filter((l) => l.phase === 'A');
    const recep = p5.lines.filter((l) => l.phase === 'B');
    const boxOf = (id) => p5.lines.find((l) => l.id === id).box; // [x, y, w, h] in %
    const nikahBottom = boxOf('e5')[1] + boxOf('e5')[3];
    const recepTop = boxOf('e6')[1];
    const recepBottom = boxOf('e9')[1] + boxOf('e9')[3];
    const b1Y = (nikahBottom + recepTop) / 2;
    const b2Y = recepBottom + (recepTop - nikahBottom) / 2;

    const b1 = pill(PIN, S.tapForLocation);
    b1.classList.add('loc-btn');
    b1.setAttribute('aria-label', `${S.tapForLocation}: ${CONFIG.events[0].title}`);
    placePct(b1, 50, b1Y);
    const b2 = pill(PIN, S.tapForLocation);
    b2.classList.add('loc-btn');
    b2.setAttribute('aria-label', `${S.tapForLocation}: ${CONFIG.events[1].title}`);
    placePct(b2, 50, b2Y);
    plate.append(b1, b2);
    gsap.set([b1, b2], { xPercent: -50, yPercent: -50, autoAlpha: 0 });

    const sizeButtons = () => {
      const gap = ((recepTop - nikahBottom) / 100) * L.plateH;
      const h = Math.round(Math.max(30, Math.min(40, gap * 0.62)));
      for (const b of [b1, b2]) {
        b.style.minHeight = h + 'px';
        b.style.fontSize = (h < 36 ? 11 : 12) + 'px';
      }
    };
    sizeButtons();

    // "Scroll for the Reception": a quiet hint pinned to the bottom of the screen
    const hint = document.createElement('div');
    hint.className = 'float-hint';
    hint.setAttribute('aria-hidden', 'true');
    hint.innerHTML = '<span></span><span class="arr">↓</span>';
    hint.firstChild.textContent = S.scrollForReception;
    document.getElementById('frame').appendChild(hint);

    let b1Opened = false;
    b1.addEventListener('click', () => { b1Opened = true; openLocationSheet('nikah', b1); });
    b2.addEventListener('click', () => openLocationSheet('reception', b2));

    const fadeIn = (t, targets, at, dur) => {
      t.fromTo(targets, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: dur, ease: 'sine.out' }, at);
    };
    let progress = 0;
    if (!ENV.revealAll) {
      const seq = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
      nikah.forEach((l, i) => fadeIn(seq, l.el, 0.02 + i * 0.045, 0.1));
      fadeIn(seq, b1, 0.32, 0.08);
      recep.forEach((l, i) => fadeIn(seq, l.el, 0.55 + i * 0.05, 0.1));
      fadeIn(seq, b2, 0.84, 0.08);
      seq.to({}, { duration: 0.08 }, 0.92);
      ScrollTrigger.create({
        trigger: p5.sec,
        start: 'top 72%',
        end: 'top 2%',
        scrub: ENV.reducedMotion ? true : 0.6,
        animation: seq,
        onUpdate: (self) => { progress = self.progress; updateHint(); },
        onToggle: () => updateHint(),
      });
      p5.lines.forEach((l) => { l.revealed = true; });
    } else {
      gsap.set([b1, b2], { autoAlpha: 1 });
    }

    // show the hint when the guest pauses (or closes the Nikah sheet) between the two blocks
    let idleTimer = 0;
    let hintOn = false;
    const setHint = (on) => {
      if (on === hintOn) return;
      hintOn = on;
      gsap.to(hint, { opacity: on ? 1 : 0, duration: on ? 0.8 : 0.3, ease: 'sine.out' });
    };
    const between = () => progress > 0.4 && progress < 0.5;
    function updateHint() {
      clearTimeout(idleTimer);
      if (!between()) { setHint(false); return; }
      idleTimer = setTimeout(() => { if (between()) setHint(true); }, b1Opened ? 300 : 2200);
    }
    onSheetClose(() => updateHint());
    parts.p05 = { b1, b2, hint, sizeButtons, get progress() { return progress; } };
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
    if (page.id === 'p06') {
      gsap.to(parts.p06.again, { opacity: 1, duration: 1, delay: instant ? 0 : 2.2 });
      fxApi.setPetalDensity(1.8);
    }
  };
  api.resize = () => {
    parts.p05.sizeButtons();
    parts.p04.countdown.resize();
    parts.p04.scratch.resize();
  };
  api.parts = parts;
  void loadPage;
  return api;
}
