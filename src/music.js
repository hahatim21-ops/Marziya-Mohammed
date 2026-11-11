// Background music. play() is called synchronously inside the cover tap handler,
// which iOS Safari and in-app browsers require. iOS ignores audio.volume, so the
// fade runs through Web Audio (MediaElementSource -> Gain -> destination).
import { CONFIG } from './config.js';
import { asset } from './stack.js';
import { ENV } from './env.js';

const audio = document.getElementById('audio');
const btn = document.getElementById('music');
const tip = btn.querySelector('.music-tip');
const cfg = CONFIG.music;

let ctx = null;
let gain = null;
let started = false; // the guest opened the cover
let muted = false; // the guest muted it
let playing = false;
let hiddenPause = false;

/** Fade the floating button in once the cover is out of the way. */
export function showMusicButton() {
  if (ENV.noMusic) return;
  btn.hidden = false;
  requestAnimationFrame(() => btn.classList.add('is-shown'));
}

export const MUSIC = {
  get playing() { return playing; },
  get muted() { return muted; },
  get gain() { return gain ? gain.gain.value : audio.volume; },
};
window.__music = MUSIC; // QA hook

function typeFor(src) {
  if (src.endsWith('.m4a')) return 'audio/mp4';
  if (src.endsWith('.mp3')) return 'audio/mpeg';
  return '';
}

export function initMusic() {
  for (const s of cfg.sources) {
    const el = document.createElement('source');
    el.src = asset(s);
    const t = typeFor(s);
    if (t) el.type = t;
    audio.appendChild(el);
  }
  btn.setAttribute('aria-label', CONFIG.strings.musicLabel);
  tip.textContent = CONFIG.strings.tapToPlay;
  btn.addEventListener('click', toggle);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', () => { if (playing) fadeTo(0, 0.2, () => audio.pause()); });
  audio.addEventListener('loadedmetadata', () => {
    if (cfg.startAt && audio.currentTime < cfg.startAt) {
      try { audio.currentTime = cfg.startAt; } catch (e) { /* ignore */ }
    }
  }, { once: true });
}

let preloaded = false;
/** Start buffering the track once the cover is on screen (not before it, so the
 * cover never competes with 2 MB of audio on a slow connection). */
export function preloadMusic() {
  if (preloaded || ENV.noMusic) return;
  preloaded = true;
  const go = () => { if (!started) { audio.preload = 'auto'; try { audio.load(); } catch (e) { /* ignore */ } } };
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 2500 });
  else setTimeout(go, 1200);
}

function ensureGraph() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch (e) { /* ignore */ }
  try {
    ctx = new AC();
    const src = ctx.createMediaElementSource(audio);
    gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain).connect(ctx.destination);
  } catch (e) {
    ctx = null;
    gain = null;
  }
}

function fadeTo(v, seconds, done) {
  if (gain && ctx) {
    const t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(v, t + seconds);
  } else {
    // fallback: element volume (ignored on iOS, fine elsewhere)
    const from = audio.volume;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / (seconds * 1000));
      audio.volume = from + (v - from) * k;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  if (done) setTimeout(done, seconds * 1000 + 30);
}

function setUi() {
  btn.classList.toggle('is-playing', playing && !muted);
  btn.classList.toggle('is-muted', muted);
  btn.setAttribute('aria-pressed', String(playing && !muted));
}

function play(fadeSeconds) {
  ensureGraph();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  if (!gain) audio.volume = 0;
  let p;
  try {
    p = audio.play();
  } catch (e) {
    p = Promise.reject(e);
  }
  playing = true;
  btn.classList.remove('needs-tap');
  fadeTo(cfg.volume, fadeSeconds);
  setUi();
  if (p && p.catch) {
    p.catch(() => {
      playing = false;
      btn.classList.add('needs-tap');
      setUi();
    });
  }
}

/** Call synchronously from the cover tap handler. */
export function startMusic() {
  if (started || ENV.noMusic) return;
  started = true;
  play(cfg.fadeInMs / 1000);
}

function toggle() {
  if (!started) started = true;
  if (!playing || btn.classList.contains('needs-tap')) {
    muted = false;
    play(1.2);
    return;
  }
  if (muted) {
    muted = false;
    play(1.2);
  } else {
    muted = true;
    fadeTo(0, 0.5, () => { if (muted) audio.pause(); });
    setUi();
  }
}

function onVisibility() {
  if (!started) return;
  if (document.hidden) {
    if (playing && !muted && !audio.paused) {
      hiddenPause = true;
      fadeTo(0, 0.35, () => { if (document.hidden) audio.pause(); });
    }
  } else if (hiddenPause && !muted) {
    hiddenPause = false;
    play(1.2);
  }
}
