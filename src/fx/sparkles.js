// Chandelier twinkles (4-point star glints), a crystal light sweep masked to the
// chandeliers, and slow breathing glows at the chandelier glow centres.

let glintSprite = null;
let glowSprite = null;

function makeGlint() {
  const s = 96;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const x = c.getContext('2d');
  const m = s / 2;
  const core = x.createRadialGradient(m, m, 0, m, m, s * 0.22);
  core.addColorStop(0, 'rgba(255,250,238,1)');
  core.addColorStop(0.35, 'rgba(255,244,222,0.75)');
  core.addColorStop(1, 'rgba(255,244,222,0)');
  x.fillStyle = core;
  x.fillRect(0, 0, s, s);
  // two thin cross flares
  const flare = (horizontal) => {
    const g = horizontal ? x.createLinearGradient(0, m, s, m) : x.createLinearGradient(m, 0, m, s);
    g.addColorStop(0, 'rgba(255,244,222,0)');
    g.addColorStop(0.5, 'rgba(255,248,232,0.95)');
    g.addColorStop(1, 'rgba(255,244,222,0)');
    x.fillStyle = g;
    if (horizontal) x.fillRect(0, m - 0.9, s, 1.8);
    else x.fillRect(m - 0.9, 0, 1.8, s);
  };
  flare(true);
  flare(false);
  return c;
}

function makeGlow() {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,214,160,1)');
  g.addColorStop(0.45, 'rgba(255,200,140,0.45)');
  g.addColorStop(1, 'rgba(255,190,120,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, s, s);
  return c;
}

export function getGlowSprite() {
  if (!glowSprite) glowSprite = makeGlow();
  return glowSprite;
}

export function createSparkles(data, { reduced, asset }) {
  if (!glintSprite) glintSprite = makeGlint();
  const glow = getGlowSprite();
  const pts = data.sparkles || [];
  const glows = (data.glows || []).map((g, i) => ({ x: g[0], y: g[1], r: g[2], period: 4 + (i % 3) * 0.9 + Math.random(), phase: Math.random() * 6.28 }));
  const target = Math.min(18, pts.length);
  const live = [];
  let mask = null;
  let off = null;
  let octx = null;
  if (data.crystal && !reduced) {
    const i = new Image();
    i.decoding = 'async';
    i.onload = () => {
      mask = i;
      off = document.createElement('canvas');
      off.width = i.naturalWidth;
      off.height = i.naturalHeight;
      octx = off.getContext('2d');
    };
    i.src = asset(data.crystal);
  }
  const sweepEvery = 6;
  const sweepDur = 2.2;
  const sweepOffset = Math.random() * sweepEvery;

  function spawn(t) {
    const p = pts[(Math.random() * pts.length) | 0];
    live.push({ x: p[0], y: p[1], t0: t, dur: 0.9 + Math.random() * 0.7, size: 10 + Math.random() * 12, rot: Math.random() * 0.4 });
  }

  return {
    draw(ctx, w, h, t) {
      const k = w / 500; // sizes are tuned for a ~500px-wide plate
      // breathing glows
      for (const g of glows) {
        const a = reduced ? 0.25 : 0.15 + 0.2 * (0.5 + 0.5 * Math.sin((t / g.period) * Math.PI * 2 + g.phase));
        const r = (g.r / 100) * w;
        ctx.globalAlpha = a;
        ctx.drawImage(glow, (g.x / 100) * w - r, (g.y / 100) * h - r, r * 2, r * 2);
      }
      if (reduced) { ctx.globalAlpha = 1; return; }
      // crystal sweep: a soft vertical band travelling across, masked to the crystals
      if (mask && octx) {
        const ph = ((t + sweepOffset) % sweepEvery) / sweepDur;
        if (ph < 1) {
          const ow = off.width;
          const oh = off.height;
          const cx = -0.2 * ow + ph * 1.4 * ow;
          octx.globalCompositeOperation = 'source-over';
          octx.clearRect(0, 0, ow, oh);
          const g = octx.createLinearGradient(cx - ow * 0.12, 0, cx + ow * 0.12, 0);
          g.addColorStop(0, 'rgba(255,240,215,0)');
          g.addColorStop(0.5, 'rgba(255,244,225,0.9)');
          g.addColorStop(1, 'rgba(255,240,215,0)');
          octx.fillStyle = g;
          octx.fillRect(0, 0, ow, oh);
          octx.globalCompositeOperation = 'destination-in';
          octx.drawImage(mask, 0, 0);
          const env = Math.sin(ph * Math.PI);
          ctx.globalAlpha = 0.85 * env;
          ctx.drawImage(off, 0, 0, w, h);
        }
      }
      // twinkles
      while (live.length < target && pts.length) spawn(t - Math.random() * 0.3);
      for (let i = live.length - 1; i >= 0; i--) {
        const g = live[i];
        const p = (t - g.t0) / g.dur;
        if (p >= 1 || p < 0) { live.splice(i, 1); continue; }
        const s = Math.sin(p * Math.PI);
        const size = g.size * k * s * 1.6;
        ctx.globalAlpha = Math.min(1, s * 1.2);
        ctx.save();
        ctx.translate((g.x / 100) * w, (g.y / 100) * h);
        ctx.rotate(g.rot + (p * Math.PI) / 4);
        ctx.drawImage(glintSprite, -size / 2, -size / 2, size, size);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },
  };
}
