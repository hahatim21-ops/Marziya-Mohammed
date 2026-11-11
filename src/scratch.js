// Velvet scratch card over the date on page 04.
import { gsap } from 'gsap';
import { CONFIG } from './config.js';
import { ENV } from './env.js';
import { MANIFEST, asset } from './stack.js';

const BRUSH = 26; // CSS px radius
const REVEAL_AT = 0.55;

function loadImg(src) {
  return new Promise((res) => {
    const i = new Image();
    i.decoding = 'async';
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * @param {HTMLElement} box   positioned container (the plaque)
 * @param {{ lenis:any, onReveal:Function, onStart?:Function }} opts
 */
export function createScratch(box, opts) {
  const canvas = document.createElement('canvas');
  const flecks = document.createElement('canvas');
  flecks.style.cssText = 'position:absolute;left:-10%;top:0;width:120%;height:170%;pointer-events:none;border-radius:0';
  const hint = document.createElement('div');
  hint.className = 'scratch-hint';
  hint.setAttribute('aria-hidden', 'true');
  hint.innerHTML = '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17V7.5a1.8 1.8 0 0 1 3.6 0V15"/><path d="M15.6 13.5a1.8 1.8 0 0 1 3.6 0V16"/><path d="M19.2 14.5a1.8 1.8 0 0 1 3.6 0v3.8c0 4.6-2.8 8-7.2 8h-.6c-2.6 0-4.3-1.1-5.6-3.2L6.6 18a1.7 1.7 0 0 1 2.7-2l2.7 3"/></svg>';
  const a11y = document.createElement('button');
  a11y.type = 'button';
  a11y.className = 'sr-only scratch-reveal-btn';
  a11y.textContent = CONFIG.strings.revealDate;
  box.append(canvas, flecks, hint, a11y);
  box.setAttribute('aria-hidden', 'false');

  const ctx = canvas.getContext('2d');
  const fctx = flecks.getContext('2d');
  const tex = document.createElement('canvas');
  const mask = document.createElement('canvas');
  const mctx = mask.getContext('2d');
  const probe = document.createElement('canvas');
  probe.width = 48;
  probe.height = 28;
  const pctx = probe.getContext('2d', { willReadFrequently: true });

  let W = 0; let H = 0; let dpr = 1;
  let velvet = null;
  let revealed = false;
  let drawing = false;
  let last = null;
  let raf = 0;
  let visible = false;
  let sheenT = 0;
  let lastCheck = 0;
  let particles = [];
  let fontReady = false;
  let maskReady = false;

  function renderTexture() {
    tex.width = W * dpr;
    tex.height = H * dpr;
    const t = tex.getContext('2d');
    t.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = Math.min(28, H / 2.4);
    roundRect(t, 0, 0, W, H, r);
    t.save();
    t.clip();
    t.fillStyle = '#4A0D14';
    t.fillRect(0, 0, W, H);
    if (velvet) {
      const s = Math.max(W / velvet.width, H / velvet.height) * 1.15;
      const iw = velvet.width * s;
      const ih = velvet.height * s;
      t.drawImage(velvet, (W - iw) / 2, (H - ih) / 2, iw, ih);
    }
    // fine grain
    const g = t.createImageData(Math.ceil(W * dpr), Math.ceil(H * dpr));
    for (let i = 0; i < g.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 26;
      g.data[i] = n > 0 ? 255 : 0;
      g.data[i + 1] = n > 0 ? 230 : 0;
      g.data[i + 2] = n > 0 ? 230 : 0;
      g.data[i + 3] = Math.abs(n);
    }
    const gc = document.createElement('canvas');
    gc.width = g.width;
    gc.height = g.height;
    gc.getContext('2d').putImageData(g, 0, 0);
    t.save();
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.globalAlpha = 0.5;
    t.drawImage(gc, 0, 0);
    t.restore();
    // soft vignette
    const v = t.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(20,0,4,0.45)');
    t.fillStyle = v;
    t.fillRect(0, 0, W, H);
    t.restore();
    // double hairline rim
    t.lineWidth = 1;
    t.strokeStyle = 'rgba(176, 82, 96, 0.9)';
    roundRect(t, 0.5, 0.5, W - 1, H - 1, r);
    t.stroke();
    t.strokeStyle = 'rgba(227, 199, 154, 0.6)';
    roundRect(t, 5.5, 5.5, W - 11, H - 11, Math.max(4, r - 5));
    t.stroke();
    // "Scratch here" with a subtle emboss
    const fs = Math.round(Math.min(H * 0.26, W * 0.13));
    t.font = `${fs}px 'Pinyon Script', cursive`;
    t.textAlign = 'center';
    t.textBaseline = 'middle';
    const ty = H * 0.6;
    t.fillStyle = 'rgba(255, 236, 228, 0.35)';
    t.fillText(CONFIG.strings.scratchHere, W / 2 - 1, ty - 1);
    t.fillStyle = 'rgba(15, 0, 3, 0.55)';
    t.fillText(CONFIG.strings.scratchHere, W / 2 + 1, ty + 1);
    t.fillStyle = 'rgba(246, 233, 220, 0.85)';
    t.fillText(CONFIG.strings.scratchHere, W / 2, ty);
  }

  function resetMask() {
    mask.width = W * dpr;
    mask.height = H * dpr;
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mctx.fillStyle = '#000';
    roundRect(mctx, 0, 0, W, H, Math.min(28, H / 2.4));
    mctx.fill();
  }

  function size() {
    const r = box.getBoundingClientRect();
    // getBoundingClientRect includes the plate's Ken Burns scale; use layout size instead
    W = box.offsetWidth || r.width;
    H = box.offsetHeight || r.height;
    dpr = ENV.dpr;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    flecks.width = Math.round(W * 1.2 * dpr * 0.75);
    flecks.height = Math.round(H * 1.7 * dpr * 0.75);
    if (revealed) return;
    // keep what was already scratched when re-sizing
    let old = null;
    if (maskReady) {
      old = document.createElement('canvas');
      old.width = mask.width;
      old.height = mask.height;
      old.getContext('2d').drawImage(mask, 0, 0);
    }
    renderTexture();
    resetMask();
    maskReady = true;
    if (old) {
      mctx.save();
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      mctx.globalCompositeOperation = 'destination-in';
      mctx.drawImage(old, 0, 0, mask.width, mask.height);
      mctx.restore();
    }
    draw();
  }

  function draw() {
    if (revealed) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tex, 0, 0);
    if (!ENV.reducedMotion) {
      // slow diagonal sheen, like light moving over velvet
      const p = (sheenT % 7) / 7;
      const x = -W * 0.6 + p * W * 2.2;
      const g = ctx.createLinearGradient((x - W * 0.35) * dpr, 0, (x + W * 0.35) * dpr, H * dpr * 0.6);
      g.addColorStop(0, 'rgba(255,190,200,0)');
      g.addColorStop(0.5, 'rgba(255,200,205,0.13)');
      g.addColorStop(1, 'rgba(255,190,200,0)');
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawFlecks(dt) {
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.clearRect(0, 0, flecks.width, flecks.height);
    if (!particles.length) return;
    const k = flecks.width / (W * 1.2);
    for (const p of particles) {
      p.vy += 900 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.rot += p.vr * dt;
      fctx.save();
      fctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
      fctx.translate((p.x + W * 0.1) * k, p.y * k);
      fctx.rotate(p.rot);
      fctx.fillStyle = p.c;
      fctx.fillRect(-p.s * k / 2, -p.s * k / 4, p.s * k, p.s * k / 2);
      fctx.restore();
    }
    particles = particles.filter((p) => p.life > 0 && p.y < H * 1.7);
  }

  let lastT = 0;
  function loop(t) {
    raf = 0;
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0.016;
    lastT = t;
    sheenT += dt;
    draw();
    drawFlecks(dt);
    if (drawing && t - lastCheck > 200) {
      lastCheck = t;
      check();
    }
    if ((visible && !revealed) || particles.length) raf = requestAnimationFrame(loop);
    else lastT = 0;
  }
  function kick() {
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function local(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }

  function scratchTo(p) {
    mctx.save();
    mctx.globalCompositeOperation = 'destination-out';
    mctx.lineCap = 'round';
    mctx.lineJoin = 'round';
    mctx.lineWidth = BRUSH * 2;
    mctx.beginPath();
    if (last) mctx.moveTo(last.x, last.y);
    else mctx.moveTo(p.x - 0.01, p.y);
    mctx.lineTo(p.x, p.y);
    mctx.stroke();
    mctx.restore();
    if (!ENV.reducedMotion && particles.length < 120) {
      const n = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) {
        particles.push({
          x: p.x + (Math.random() - 0.5) * BRUSH, y: p.y + (Math.random() - 0.5) * BRUSH * 0.6,
          vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 60,
          s: 2 + Math.random() * 3, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12,
          life: 0.8 + Math.random() * 0.5,
          c: Math.random() < 0.5 ? '#6E1422' : '#4A0D14',
        });
      }
    }
    last = p;
  }

  function cleared() {
    pctx.clearRect(0, 0, probe.width, probe.height);
    pctx.drawImage(mask, 0, 0, probe.width, probe.height);
    const d = pctx.getImageData(0, 0, probe.width, probe.height).data;
    let total = 0; let gone = 0;
    // ignore the rounded corners: sample an inset ellipse-ish region
    for (let y = 1; y < probe.height - 1; y++) {
      for (let x = 1; x < probe.width - 1; x++) {
        total++;
        if (d[(y * probe.width + x) * 4 + 3] < 128) gone++;
      }
    }
    return gone / total;
  }

  function check() {
    if (revealed) return;
    const c = cleared();
    box.dataset.cleared = c.toFixed(3);
    if (c >= REVEAL_AT) reveal();
  }

  function reveal(instant) {
    if (revealed) return;
    revealed = true;
    drawing = false;
    box.style.pointerEvents = 'none';
    hint.remove();
    a11y.remove();
    const d = instant ? 0.01 : ENV.reducedMotion ? 0.4 : 0.6;
    gsap.to(canvas, { opacity: 0, duration: d, ease: 'sine.inOut', onComplete: () => { canvas.remove(); } });
    box.dataset.revealed = '1';
    if (opts.lenis) opts.lenis.start();
    opts.onReveal && opts.onReveal(instant);
  }

  // pointer mechanics
  canvas.addEventListener('pointerdown', (e) => {
    if (revealed) return;
    e.preventDefault();
    if (ENV.reducedMotion) { reveal(); return; }
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    drawing = true;
    last = null;
    if (opts.lenis) opts.lenis.stop();
    if (opts.onStart) opts.onStart();
    gsap.to(hint, { opacity: 0, duration: 0.3 });
    scratchTo(local(e));
    kick();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ce of evs.length ? evs : [e]) scratchTo(local(ce));
    kick();
  });
  const end = () => {
    if (!drawing) return;
    drawing = false;
    last = null;
    if (opts.lenis) opts.lenis.start();
    check();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('lostpointercapture', end);
  // block native scrolling/zoom gestures that start on the card
  canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  a11y.addEventListener('click', () => reveal());

  let texRequested = false;
  const loadTexture = () => {
    if (texRequested) return;
    texRequested = true;
    Promise.all([
      loadImg(asset(MANIFEST.cover.velvet)).then((i) => { velvet = i; }),
      document.fonts && document.fonts.load ? document.fonts.load("40px 'Pinyon Script'", CONFIG.strings.scratchHere).then(() => { fontReady = true; }).catch(() => {}) : Promise.resolve(),
    ]).then(() => { if (!revealed) size(); });
  };
  size();
  void fontReady;

  return {
    resize: size,
    setVisible(v) {
      visible = v;
      if (v) { loadTexture(); kick(); }
    },
    reveal: () => reveal(),
    get revealed() { return revealed; },
  };
}
