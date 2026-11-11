// Falling rose petals: one fixed Canvas 2D layer above the plates, below the UI.

const COLORS = [
  ['#9A1A2E', '#7D1022', '#4E0814'],
  ['#74101F', '#5A0B18', '#33040C'],
  ['#FFF4E8', '#F3E3D3', '#CDB8A4'],
];

function makeSprite(colors, shape) {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const x = c.getContext('2d');
  x.translate(s / 2, s / 2);
  x.beginPath();
  if (shape === 0) {
    // classic rounded petal with a notch
    x.moveTo(0, 26);
    x.bezierCurveTo(-26, 10, -22, -24, -4, -26);
    x.quadraticCurveTo(0, -20, 4, -26);
    x.bezierCurveTo(22, -24, 26, 10, 0, 26);
  } else if (shape === 1) {
    x.moveTo(0, 27);
    x.bezierCurveTo(-20, 18, -24, -20, 0, -27);
    x.bezierCurveTo(24, -20, 20, 18, 0, 27);
  } else {
    x.moveTo(-2, 26);
    x.bezierCurveTo(-28, 4, -14, -26, 6, -24);
    x.bezierCurveTo(26, -18, 22, 14, -2, 26);
  }
  x.closePath();
  const g = x.createRadialGradient(-6, -8, 2, 0, 0, 30);
  g.addColorStop(0, colors[0]);
  g.addColorStop(0.6, colors[1]);
  g.addColorStop(1, colors[2]);
  x.fillStyle = g;
  x.fill();
  // soft vein and edge shading
  x.globalAlpha = 0.25;
  x.strokeStyle = colors[2];
  x.lineWidth = 1;
  x.beginPath();
  x.moveTo(0, 22);
  x.quadraticCurveTo(-2, 0, 1, -18);
  x.stroke();
  return c;
}

export function createPetals(canvas) {
  const ctx = canvas.getContext('2d');
  const sprites = [];
  COLORS.forEach((col, i) => { sprites.push(makeSprite(col, i % 3)); sprites.push(makeSprite(col, (i + 1) % 3)); });
  let W = 0;
  let H = 0;
  let k = 1;
  const petals = [];
  let density = 1;
  let ramp = 0;
  let started = false;
  let drizzle = []; // scheduled small petals: { at, x, size }
  let clock = 0;
  const phone = Math.min(window.innerWidth, 440) <= 440;
  const base = phone ? 13 : 16;

  function resize() {
    const r = canvas.getBoundingClientRect();
    k = Math.min(window.devicePixelRatio || 1, 1.5);
    W = r.width;
    H = r.height;
    canvas.width = Math.round(W * k);
    canvas.height = Math.round(H * k);
  }
  resize();

  function make(y, burst) {
    const size = 10 + Math.random() * 11;
    return {
      x: Math.random() * W,
      y,
      vx: 0,
      vy: 30 + Math.random() * 30,
      sway: 14 + Math.random() * 22,
      swayF: 0.6 + Math.random() * 0.8,
      ph: Math.random() * 6.28,
      rot: Math.random() * 6.28,
      vr: (Math.random() - 0.5) * 1.6,
      flip: Math.random() * 6.28,
      flipS: 1.2 + Math.random() * 2.2,
      size,
      img: sprites[(Math.random() * sprites.length) | 0],
      burst: !!burst,
      age: 0,
    };
  }

  return {
    start() {
      started = true;
      ramp = 0;
    },
    resize,
    setDensity(d) { density = d; },
    /** n small petals drifting down over `seconds`, spread over the middle of the screen. */
    drizzle(n, seconds) {
      for (let i = 0; i < n; i++) {
        drizzle.push({ at: clock + (i / n) * seconds + Math.random() * 0.25, x: W * (0.1 + Math.random() * 0.8), y: H * (0.02 + Math.random() * 0.5), size: 6 + Math.random() * 6 });
      }
    },
    burst(cx, cy, n) {
      const r = canvas.getBoundingClientRect();
      const x0 = cx - r.left;
      const y0 = cy - r.top;
      for (let i = 0; i < n; i++) {
        const p = make(y0, true);
        const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
        const sp = 140 + Math.random() * 220;
        p.x = x0 + (Math.random() - 0.5) * 30;
        p.y = y0 + (Math.random() - 0.5) * 20;
        p.vx = Math.cos(a) * sp;
        p.vy = Math.sin(a) * sp;
        p.img = sprites[(i % 2 === 0 ? 0 : 4) + ((Math.random() * 2) | 0)];
        petals.push(p);
      }
    },
    update(t, dt) {
      clock += dt;
      if (drizzle.length) {
        const due = drizzle.filter((d) => d.at <= clock);
        drizzle = drizzle.filter((d) => d.at > clock);
        for (const d of due) {
          // appear in place (fading in) so they are seen drifting past the monogram
          const p = make(d.y);
          p.x = d.x;
          p.size = d.size;
          p.vy = 55 + Math.random() * 35;
          p.sway = 10 + Math.random() * 16;
          p.fadeIn = 0.6;
          petals.push(p);
        }
      }
      if (started) ramp = Math.min(1, ramp + dt / 9);
      const target = Math.round(base * density * (0.15 + 0.85 * ramp * ramp));
      const ambient = petals.filter((p) => !p.burst).length;
      if (started && ambient < target && Math.random() < dt * 3) petals.push(make(-30));
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.clearRect(0, 0, W, H);
      for (let i = petals.length - 1; i >= 0; i--) {
        const p = petals[i];
        p.age += dt;
        if (p.burst) {
          p.vy += 320 * dt;
          p.vx *= 1 - 1.6 * dt;
          if (p.vy > 55) { p.vy = 55; }
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        } else {
          p.y += p.vy * dt;
          p.x += Math.sin(p.age * p.swayF + p.ph) * p.sway * dt;
        }
        p.rot += p.vr * dt;
        p.flip += p.flipS * dt;
        if (p.y > H + 40 || p.x < -60 || p.x > W + 60) {
          petals.splice(i, 1);
          continue;
        }
        const sx = Math.cos(p.flip);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(sx < 0 ? Math.min(-0.12, sx) : Math.max(0.12, sx), 1);
        ctx.globalAlpha = p.fadeIn ? 0.92 * Math.min(1, p.age / p.fadeIn) : 0.92;
        const s = p.size;
        ctx.drawImage(p.img, -s / 2, -s / 2, s, s);
        ctx.restore();
      }
    },
  };
}
