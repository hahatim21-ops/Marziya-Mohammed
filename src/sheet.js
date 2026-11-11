// One bottom-sheet component: location sheets (Nikah / Reception) and the
// "Save the Dates" sheet. Slides up, traps focus, closes on X, swipe down,
// backdrop tap or Escape, and locks page scroll while open.
import { gsap } from 'gsap';
import { CONFIG } from './config.js';
import { ENV } from './env.js';
import { asset } from './stack.js';
import { googleCalendarUrl, icsPath, mapsEmbedUrl, mapsOpenUrl } from './calendar.js';

const rootEl = document.getElementById('sheet-root');
const html = document.documentElement;
const S = CONFIG.strings;
let lenis = null;
let current = null;
const cache = new Map();
const listeners = new Set();

export function initSheets(opts) {
  lenis = opts.lenis;
}
export function onSheetClose(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const ICONS = {
  close: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  pin: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>',
  cal: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M4 6.5h16v13H4zM4 10h16M8 4v4M16 4v4"/></svg>',
};

function h(tag, cls, html_) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html_ != null) n.innerHTML = html_;
  return n;
}

function calOptions(ev) {
  const wrap = h('div', 'cal-opts');
  const g = h('a', 'cal-opt', S.googleCalendar);
  g.href = googleCalendarUrl(ev);
  g.target = '_blank';
  g.rel = 'noopener';
  const i = h('a', 'cal-opt', S.appleOutlook);
  i.href = asset(icsPath(ev.id));
  i.setAttribute('download', `${ev.id}.ics`);
  i.type = 'text/calendar';
  wrap.append(g, i);
  return wrap;
}

function buildLocation(ev) {
  const sheet = h('div', 'sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-labelledby', `sheet-title-${ev.id}`);
  sheet.tabIndex = -1;
  const drag = h('div', 'sheet-drag');
  drag.append(h('div', 'sheet-handle'));
  const close = h('button', 'sheet-close', ICONS.close);
  close.type = 'button';
  close.setAttribute('aria-label', S.close);
  const body = h('div', 'sheet-body');
  const title = h('h2', 'sheet-title', '');
  title.id = `sheet-title-${ev.id}`;
  title.textContent = ev.title;
  const venue = h('p', 'sheet-venue');
  venue.textContent = ev.venue;
  const when = h('p', 'sheet-when');
  when.textContent = ev.when;
  const map = h('div', 'sheet-map');
  map.append(h('div', 'map-loading', 'Loading map…'));
  const actions = h('div', 'sheet-actions');
  const open = h('a', 'sheet-btn primary', `${ICONS.pin}<span></span>`);
  open.querySelector('span').textContent = S.openInMaps;
  open.href = mapsOpenUrl(ev);
  open.target = '_blank';
  open.rel = 'noopener';
  const add = h('button', 'sheet-btn secondary', `${ICONS.cal}<span></span>`);
  add.type = 'button';
  add.querySelector('span').textContent = S.addToCalendar;
  add.setAttribute('aria-expanded', 'false');
  const opts = calOptions(ev);
  opts.classList.add('cal-inline');
  add.addEventListener('click', () => {
    const on = !opts.classList.contains('is-open');
    opts.classList.toggle('is-open', on);
    add.setAttribute('aria-expanded', String(on));
  });
  actions.append(open, add, opts);
  body.append(title, venue, when, map, actions);
  sheet.append(drag, close, body);
  return {
    sheet, close, body, drag,
    onFirstOpen() {
      const f = document.createElement('iframe');
      f.title = `Map: ${ev.venue}`;
      f.loading = 'lazy';
      f.referrerPolicy = 'no-referrer-when-downgrade';
      f.src = mapsEmbedUrl(ev);
      f.allowFullscreen = true;
      f.addEventListener('load', () => { const l = map.querySelector('.map-loading'); if (l) l.remove(); });
      map.append(f);
    },
  };
}

function buildDates() {
  const sheet = h('div', 'sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-labelledby', 'sheet-title-dates');
  sheet.tabIndex = -1;
  const drag = h('div', 'sheet-drag');
  drag.append(h('div', 'sheet-handle'));
  const close = h('button', 'sheet-close', ICONS.close);
  close.type = 'button';
  close.setAttribute('aria-label', S.close);
  const body = h('div', 'sheet-body');
  const title = h('h2', 'sheet-title');
  title.id = 'sheet-title-dates';
  title.textContent = S.saveTheDates;
  body.append(title);
  const list = h('div', 'cal-list');
  for (const ev of CONFIG.events) {
    const g = h('div', 'cal-group');
    const t = h('h3');
    t.textContent = ev.title;
    const p = h('p');
    p.textContent = `${ev.when} · ${ev.venue}`;
    g.append(t, p, calOptions(ev));
    list.append(g);
  }
  const both = h('a', 'sheet-btn secondary', `${ICONS.cal}<span></span>`);
  both.querySelector('span').textContent = S.bothEvents;
  both.href = asset(icsPath('both'));
  both.setAttribute('download', 'marziya-mohammed-umar.ics');
  const actions = h('div', 'sheet-actions');
  actions.append(both);
  body.append(list, actions);
  sheet.append(drag, close, body);
  return { sheet, close, body, drag };
}

function focusables(node) {
  return Array.from(node.querySelectorAll('a[href], button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])'))
    .filter((n) => n.offsetParent !== null || n === document.activeElement);
}

function open(key, build, returnTo) {
  if (current) closeNow();
  let entry = cache.get(key);
  if (!entry) {
    entry = build();
    entry.backdrop = h('div', 'sheet-backdrop');
    entry.backdrop.setAttribute('aria-hidden', 'true');
    entry.backdrop.style.touchAction = 'none';
    cache.set(key, entry);
    wire(entry);
  }
  if (!entry.opened && entry.onFirstOpen) entry.onFirstOpen();
  entry.opened = true;
  entry.returnTo = returnTo || document.activeElement;
  rootEl.append(entry.backdrop, entry.sheet);
  current = entry;
  html.classList.add('is-sheet-open');
  if (lenis) lenis.stop();
  const d = ENV.reducedMotion ? 0.01 : 0.6;
  gsap.fromTo(entry.backdrop, { opacity: 0 }, { opacity: 1, duration: ENV.reducedMotion ? 0.01 : 0.4, ease: 'sine.out' });
  gsap.fromTo(entry.sheet, { yPercent: 100, y: 0 }, { yPercent: 0, duration: d, ease: 'power3.out' });
  entry.body.scrollTop = 0;
  requestAnimationFrame(() => entry.close.focus({ preventScroll: true }));
  document.addEventListener('keydown', onKey, true);
}

function closeNow() {
  const entry = current;
  if (!entry) return;
  current = null;
  document.removeEventListener('keydown', onKey, true);
  gsap.killTweensOf([entry.sheet, entry.backdrop]);
  entry.sheet.remove();
  entry.backdrop.remove();
  html.classList.remove('is-sheet-open');
  if (lenis) lenis.start();
}

export function closeSheet() {
  const entry = current;
  if (!entry) return;
  current = null;
  document.removeEventListener('keydown', onKey, true);
  const d = ENV.reducedMotion ? 0.01 : 0.45;
  gsap.to(entry.backdrop, { opacity: 0, duration: d, ease: 'sine.in' });
  gsap.to(entry.sheet, {
    yPercent: 100, duration: d, ease: 'power3.in',
    onComplete: () => {
      entry.sheet.remove();
      entry.backdrop.remove();
      gsap.set(entry.sheet, { y: 0 });
    },
  });
  html.classList.remove('is-sheet-open');
  if (lenis) lenis.start();
  const rt = entry.returnTo;
  if (rt && rt.focus) rt.focus({ preventScroll: true });
  listeners.forEach((cb) => cb());
}

function onKey(e) {
  if (!current) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    closeSheet();
    return;
  }
  if (e.key === 'Tab') {
    const f = focusables(current.sheet);
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!current.sheet.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  }
}

function wire(entry) {
  entry.close.addEventListener('click', closeSheet);
  entry.backdrop.addEventListener('click', closeSheet);
  // swipe down to close: from the handle/header anywhere, or from the body when it is scrolled to the top
  let startY = 0;
  let dy = 0;
  let t0 = 0;
  let dragging = false;
  const down = (e) => {
    if (e.button != null && e.button !== 0) return;
    const fromBody = entry.body.contains(e.target);
    if (fromBody && entry.body.scrollTop > 0) return;
    if (e.target.closest('a, button, iframe')) return;
    dragging = true;
    startY = e.clientY;
    dy = 0;
    t0 = performance.now();
  };
  const move = (e) => {
    if (!dragging) return;
    dy = Math.max(0, e.clientY - startY);
    if (dy > 4) gsap.set(entry.sheet, { y: dy });
  };
  const up = () => {
    if (!dragging) return;
    dragging = false;
    const v = dy / Math.max(1, performance.now() - t0);
    if (dy > 90 || (v > 0.6 && dy > 24)) closeSheet();
    else gsap.to(entry.sheet, { y: 0, duration: 0.3, ease: 'power3.out' });
  };
  entry.sheet.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

export function openLocationSheet(eventId, returnTo) {
  const ev = CONFIG.events.find((e) => e.id === eventId);
  if (!ev) return;
  open('loc-' + eventId, () => buildLocation(ev), returnTo);
}

export function openDatesSheet(returnTo) {
  open('dates', buildDates, returnTo);
}

export function isSheetOpen() {
  return !!current;
}
