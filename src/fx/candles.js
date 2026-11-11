// Candle flicker (noise-driven, not a keyframe loop) and, on page 05, a slow
// reflection shimmer on the floor.

let flameSprite = null;
function makeFlame() {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,190,110,0.55)');
  g.addColorStop(0.3, 'rgba(255,175,95,0.32)');
  g.addColorStop(1, 'rgba(255,160,80,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, s, s);
  return c;
}

// smooth 1D value noise in [0,1]
function makeNoise(seed) {
  const n = 64;
  const v = new Float32Array(n);
  let s = seed * 9301 + 49297;
  for (let i = 0; i < n; i++) { s = (s * 9301 + 49297) % 233280; v[i] = s / 233280; }
  return (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = v[((i % n) + n) % n];
    const b = v[(((i + 1) % n) + n) % n];
    const u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  };
}

export function createCandles(data, { reduced, lowEnd, asset, floor }) {
  if (!flameSprite) flameSprite = makeFlame();
  const cap = lowEnd ? 15 : 40;
  const flames = (data.candles || []).slice(0, cap).map((c, i) => ({
    x: c[0], y: c[1], w: c[2], h: c[3],
    n1: makeNoise(i * 13 + 1), n2: makeNoise(i * 7 + 3), n3: makeNoise(i * 3 + 11),
    speed: 2.2 + Math.random() * 1.6,
  }));
  let fmask = null;
  let off = null;
  let octx = null;
  if (floor && data.floor && !reduced) {
    const i = new Image();
    i.onload = () => {
      fmask = i;
      off = document.createElement('canvas');
      off.width = i.naturalWidth;
      off.height = i.naturalHeight;
      octx = off.getContext('2d');
    };
    i.src = asset(data.floor);
  }

  return {
    draw(ctx, w, h, t) {
      for (const f of flames) {
        const fw = (f.w / 100) * w;
        const r = Math.max(10, fw * 3);
        let o = 0.8;
        let s = 1;
        let jx = 0;
        let jy = 0;
        if (!reduced) {
          const tt = t * f.speed;
          o = 0.55 + 0.45 * f.n1(tt);
          s = 0.92 + 0.16 * f.n2(tt * 0.8);
          jx = (f.n3(tt * 1.3) - 0.5);
          jy = (f.n3(tt * 1.3 + 17) - 0.5);
        }
        const rr = r * s;
        ctx.globalAlpha = o;
        ctx.drawImage(flameSprite, (f.x / 100) * w - rr + jx, (f.y / 100) * h - rr * 1.1 + jy, rr * 2, rr * 2);
      }
      ctx.globalAlpha = 1;
      if (fmask && octx) {
        const ow = off.width;
        const oh = off.height;
        octx.globalCompositeOperation = 'source-over';
        octx.clearRect(0, 0, ow, oh);
        // slow horizontal waves of light
        for (let b = 0; b < 3; b++) {
          const ph = ((t * 0.05 + b / 3) % 1);
          const y = oh * (0.74 + ph * 0.3);
          const g = octx.createLinearGradient(0, y - oh * 0.02, 0, y + oh * 0.02);
          g.addColorStop(0, 'rgba(255,200,170,0)');
          g.addColorStop(0.5, `rgba(255,205,175,${0.35 * Math.sin(ph * Math.PI)})`);
          g.addColorStop(1, 'rgba(255,200,170,0)');
          octx.fillStyle = g;
          octx.beginPath();
          for (let x = 0; x <= ow; x += 6) {
            const yy = y + Math.sin(x * 0.04 + t * 0.6 + b) * oh * 0.004;
            if (x === 0) octx.moveTo(x, yy - oh * 0.02); else octx.lineTo(x, yy - oh * 0.02);
          }
          octx.lineTo(ow, y + oh * 0.03);
          octx.lineTo(0, y + oh * 0.03);
          octx.closePath();
          octx.fill();
        }
        octx.globalCompositeOperation = 'destination-in';
        octx.drawImage(fmask, 0, 0);
        ctx.globalAlpha = 0.55;
        ctx.drawImage(off, 0, 0, w, h);
        ctx.globalAlpha = 1;
      }
    },
  };
}
