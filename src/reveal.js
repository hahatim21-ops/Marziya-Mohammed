// Line-by-line reveals of the text overlays cut from the original designs.
import { gsap } from 'gsap';
import { ENV } from './env.js';
import { asset } from './stack.js';

const STAGGER = 0.18;
const GLOW_PEAK = 'drop-shadow(0px 0px 18px rgba(255, 238, 214, 0.95))';
const GLOW_ZERO = 'drop-shadow(0px 0px 0px rgba(255, 238, 214, 0))';

function glowBloom(tl, el, at, dark) {
  if (ENV.fxOff) return;
  if (dark) {
    // dark ink on cream: the overlay's alpha hugs the letters, so a soft cream
    // drop-shadow reads as a gentle bloom
    const rest = 'drop-shadow(0px 0px 6px rgba(255, 246, 236, 0.35))';
    tl.fromTo(el, { filter: GLOW_ZERO }, { filter: GLOW_PEAK, duration: 0.55, ease: 'sine.out' }, at);
    tl.to(el, { filter: rest, duration: 1.1, ease: 'sine.inOut' }, at + 0.55);
    return;
  }
  // light glowing text: the overlay carries the design's own halo, so a
  // drop-shadow would outline the whole halo. Instead screen a blurred copy in
  // which contrast() has crushed everything but the bright letters.
  const b = document.createElement('img');
  b.className = 'ov-bloom';
  b.alt = '';
  b.src = el.currentSrc || el.src;
  for (const k of ['left', 'top', 'width', 'height']) b.style[k] = el.style[k];
  el.after(b);
  tl.fromTo(b, { opacity: 0, '--bloom': '0px' }, { opacity: 0.95, '--bloom': '18px', duration: 0.55, ease: 'sine.out' }, at);
  tl.to(b, { opacity: 0.3, '--bloom': '6px', duration: 1.1, ease: 'sine.inOut' }, at + 0.55);
}

function shimmer(line, plate) {
  const s = document.createElement('div');
  s.className = 'shimmer';
  const [x, y, w, h] = line.rect;
  Object.assign(s.style, { left: x + '%', top: y + '%', width: w + '%', height: h + '%' });
  const url = `url(${line.el.currentSrc || line.el.src})`;
  s.style.webkitMaskImage = url;
  s.style.maskImage = url;
  plate.appendChild(s);
  return s;
}

/** Duration a line "occupies" before the next one should start. */
export function lineOccupancy(type) {
  return occupancy(type);
}
function occupancy(type) {
  if (ENV.reducedMotion) return STAGGER;
  if (type === 'script') return 1.0;
  if (type === 'arabic') return 1.1;
  if (type === 'amp') return 0.45;
  return STAGGER;
}

/**
 * Reveal one line. Returns its timeline. `dark` = dark text on a light plate.
 */
export function revealLine(line, plate, dark) {
  const el = line.el;
  const tl = gsap.timeline();
  if (line.revealed) return tl;
  line.revealed = true;
  if (ENV.reducedMotion) {
    tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'none' });
    return tl;
  }
  const type = line.type;
  if (type === 'caps') {
    tl.fromTo(el, { opacity: 0, y: 14, filter: 'blur(8px)' },
      { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.9, ease: 'power3.out', clearProps: 'filter' });
  } else if (type === 'italic') {
    el.classList.add('is-wipe');
    gsap.set(el, { '--wipe': '100%' });
    tl.fromTo(el, { opacity: 0, y: 12, filter: 'blur(6px)' },
      { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.9, ease: 'power3.out', clearProps: 'filter' }, 0);
    tl.to(el, { '--wipe': '0%', duration: 0.9, ease: 'power2.out' }, 0);
    tl.add(() => el.classList.remove('is-wipe'));
  } else if (type === 'script') {
    const dur = Math.min(1.6, Math.max(1.3, 1.0 + line.rect[2] / 140));
    el.classList.add('is-wipe');
    gsap.set(el, { '--wipe': '100%', opacity: 1 });
    tl.to(el, { '--wipe': '0%', duration: dur, ease: 'power1.inOut' }, 0);
    tl.add(() => el.classList.remove('is-wipe'), dur);
    glowBloom(tl, el, dur - 0.25, dark);
  } else if (type === 'arabic') {
    el.classList.add('is-wipe-rtl');
    gsap.set(el, { '--wipe': '0%', opacity: 1 });
    tl.to(el, { '--wipe': '100%', duration: 1.6, ease: 'power1.inOut' }, 0);
    tl.add(() => el.classList.remove('is-wipe-rtl'), 1.6);
    if (!ENV.fxOff) {
      tl.add(() => {
        const s = shimmer(line, el.parentNode);
        gsap.fromTo(s, { opacity: 1, backgroundPosition: '100% 0' }, {
          backgroundPosition: '0% 0', duration: 1.4, ease: 'sine.inOut',
          onComplete: () => s.remove(),
        });
      }, 1.55);
    }
  } else if (type === 'amp') {
    tl.fromTo(el, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.9, ease: 'back.out(1.6)' }, 0);
    glowBloom(tl, el, 0.35, dark);
  } else {
    tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.6 });
  }
  return tl;
}

/** Reveal a list of lines in reading order. Returns the master timeline. */
export function revealLines(lines, plate, dark, startDelay = 0) {
  const master = gsap.timeline({ delay: startDelay });
  let t = 0;
  for (const line of lines) {
    if (line.revealed) continue;
    master.add(revealLine(line, plate, dark), t);
    t += occupancy(line.type);
  }
  return master;
}

/** QA helper: show lines instantly. */
export function showLinesNow(lines) {
  for (const l of lines) {
    l.revealed = true;
    l.el.classList.remove('is-wipe', 'is-wipe-rtl');
    gsap.set(l.el, { opacity: 1, y: 0, scale: 1, clearProps: 'filter' });
  }
}

export { asset };
