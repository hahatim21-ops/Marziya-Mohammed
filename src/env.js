// Runtime flags shared by every module.
const params = new URLSearchParams(location.search);

const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

export const ENV = {
  params,
  debug: params.get('debug'), // '1' = outlines, 'plates' = asset debug page
  fxOff: params.get('fx') === '0',
  reducedMotion: params.get('motion') === 'reduce' || !!(mq && mq.matches),
  lowEnd: (navigator.hardwareConcurrency || 8) <= 4,
  // ?now=2026-12-04T10:00:00%2B05:30 mocks the clock (countdown QA)
  nowOffset: 0,
  revealAll: params.get('reveal') === 'all', // QA: show every line immediately
  skipIntro: params.get('open') === '1', // QA: start with the cover already open
  noMusic: params.get('music') === '0', // QA: never touch audio
  dpr: Math.min(window.devicePixelRatio || 1, 2),
};

const mockNow = params.get('now');
if (mockNow) {
  const t = Date.parse(mockNow);
  if (!Number.isNaN(t)) ENV.nowOffset = t - Date.now();
}

export function now() {
  return Date.now() + ENV.nowOffset;
}

if (ENV.reducedMotion) document.documentElement.classList.add('reduced-motion');
if (ENV.fxOff) document.documentElement.classList.add('fx-off');
