// Gold dust: tiny blurred bokeh specks drifting slowly upward (screen blend via CSS).

export function createDust(canvas) {
  const ctx = canvas.getContext('2d');
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 32;
  const sx = sprite.getContext('2d');
  const g = sx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,226,170,1)');
  g.addColorStop(0.4, 'rgba(240,200,140,0.55)');
  g.addColorStop(1, 'rgba(230,190,130,0)');
  sx.fillStyle = g;
  sx.fillRect(0, 0, 32, 32);

  let W = 0;
  let H = 0;
  const specks = [];
  function resize() {
    const r = canvas.getBoundingClientRect();
    W = r.width;
    H = r.height;
    canvas.width = Math.round(W);
    canvas.height = Math.round(H);
  }
  resize();
  const n = 20 + Math.round(Math.random() * 10);
  for (let i = 0; i < n; i++) {
    specks.push({
      x: Math.random() * W, y: Math.random() * H,
      r: 2 + Math.random() * 5,
      vy: -(5 + Math.random() * 10), ph: Math.random() * 6.28, f: 0.2 + Math.random() * 0.4,
      o: 0.2 + Math.random() * 0.4, tw: 0.3 + Math.random() * 0.6,
    });
  }
  return {
    resize,
    update(t, dt) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      for (const s of specks) {
        s.y += s.vy * dt;
        s.x += Math.sin(t * s.f + s.ph) * 6 * dt;
        if (s.y < -10) { s.y = H + 10; s.x = Math.random() * W; }
        ctx.globalAlpha = s.o * (0.65 + 0.35 * Math.sin(t * s.tw + s.ph));
        const d = s.r * 2;
        ctx.drawImage(sprite, s.x - s.r, s.y - s.r, d, d);
      }
      ctx.globalAlpha = 1;
    },
  };
}
