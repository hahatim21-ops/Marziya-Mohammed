// ?debug=plates : every clean plate and every plate with all overlays, beside the original.
// ?debug=1      : outlines text boxes, sparkle/candle points, curtain mask and the safe area.
import manifest from './generated/manifest.json';
import { asset } from './stack.js';

export function platesPage() {
  const root = document.documentElement;
  root.className = 'debug-plates';
  document.body.innerHTML = '';
  const style = document.createElement('style');
  style.textContent = `
    html.debug-plates, html.debug-plates body { overflow: auto !important; height: auto; background: #1a1012; color: #eee; font: 13px/1.4 system-ui, sans-serif; }
    .dp-wrap { padding: 16px; }
    .dp-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 0 0 28px; max-width: 1200px; }
    .dp-row h2 { grid-column: 1 / -1; margin: 8px 0 0; font-size: 16px; }
    .dp-cell figcaption { margin: 4px 0; opacity: .7; }
    .dp-plate { position: relative; width: 100%; aspect-ratio: 1449 / 2576; background: #000; overflow: hidden; }
    .dp-plate > img { position: absolute; }
    .dp-plate > img.bg { inset: 0; width: 100%; height: 100%; }
    .dp-toggle { margin-bottom: 12px; }
  `;
  document.head.appendChild(style);
  const wrap = document.createElement('div');
  wrap.className = 'dp-wrap';
  wrap.innerHTML = '<h1 style="margin:0 0 6px">Plate debug</h1><p class="dp-toggle">Original · clean plate (text erased) · clean plate + all overlays</p>';
  document.body.appendChild(wrap);

  const mk = (cls, src) => { const i = document.createElement('img'); i.className = cls; i.src = src; i.alt = ''; return i; };
  // cover
  const c = manifest.cover;
  const crow = document.createElement('section');
  crow.className = 'dp-row';
  crow.innerHTML = '<h2>01 cover</h2>';
  for (const [cap, layers] of [['cover-front (window cut out)', [c.inner, c.front]], ['inner-page', [c.inner]], ['cover-back / velvet', [c.back]]]) {
    const fig = document.createElement('figure');
    fig.className = 'dp-cell';
    fig.style.margin = '0';
    const p = document.createElement('div');
    p.className = 'dp-plate';
    layers.forEach((l) => p.appendChild(mk('bg', asset(l))));
    fig.appendChild(p);
    const fc = document.createElement('figcaption');
    fc.textContent = cap;
    fig.appendChild(fc);
    crow.appendChild(fig);
  }
  wrap.appendChild(crow);

  for (const id of manifest.order) {
    const m = manifest.pages[id];
    const row = document.createElement('section');
    row.className = 'dp-row';
    row.innerHTML = `<h2>${id}</h2>`;
    const cells = [
      ['original', [mk('bg', asset(m.orig))]],
      ['clean plate', [mk('bg', asset(m.plate.replace('{w}', '1080')))]],
      ['clean + overlays', [mk('bg', asset(m.plate.replace('{w}', '1080')))].concat(m.lines.map((l) => {
        const i = mk('', asset(l.src.replace('{w}', '1080')));
        Object.assign(i.style, { left: l.rect[0] + '%', top: l.rect[1] + '%', width: l.rect[2] + '%', height: l.rect[3] + '%' });
        return i;
      }))],
    ];
    for (const [cap, imgs] of cells) {
      const fig = document.createElement('figure');
      fig.className = 'dp-cell';
      fig.style.margin = '0';
      const p = document.createElement('div');
      p.className = 'dp-plate';
      imgs.forEach((i) => p.appendChild(i));
      fig.appendChild(p);
      const fc = document.createElement('figcaption');
      fc.textContent = cap;
      fig.appendChild(fc);
      row.appendChild(fig);
    }
    wrap.appendChild(row);
  }
}

export function overlayDebug(pages) {
  for (const page of pages) {
    const plate = page.plate;
    const safe = document.createElement('div');
    safe.className = 'dbg-safe';
    plate.appendChild(safe);
    if (!page.data) continue;
    for (const l of page.data.lines) {
      const b = document.createElement('div');
      b.className = 'dbg-box';
      const [x, y, w, h] = l.box;
      Object.assign(b.style, { left: x + '%', top: y + '%', width: w + '%', height: h + '%' });
      b.innerHTML = `<span>${l.id}</span>`;
      plate.appendChild(b);
    }
    const fx = page.data.fxData || {};
    for (const [x, y] of fx.sparkles || []) {
      const p = document.createElement('div');
      p.className = 'dbg-pt';
      p.style.left = x + '%';
      p.style.top = y + '%';
      plate.appendChild(p);
    }
    for (const [x, y] of fx.candles || []) {
      const p = document.createElement('div');
      p.className = 'dbg-pt candle';
      p.style.left = x + '%';
      p.style.top = y + '%';
      plate.appendChild(p);
    }
    if (fx.curtain) {
      const m = document.createElement('img');
      m.className = 'dbg-mask';
      m.src = asset(fx.curtain);
      m.style.filter = 'sepia(1) hue-rotate(60deg) saturate(4)';
      plate.appendChild(m);
    }
  }
}

/** ?debug=align&page=p02 : one plate at native size with every overlay shown (QA). */
export function alignPage(id) {
  const m = manifest.pages[id];
  const root = document.documentElement;
  root.className = 'debug-align';
  document.body.innerHTML = '';
  const st = document.createElement('style');
  st.textContent = 'html.debug-align, html.debug-align body { margin:0; overflow:hidden; background:#000; }' +
    '.al-plate { position:relative; width:1449px; height:2576px; }' +
    '.al-plate img { position:absolute; display:block; }';
  document.head.appendChild(st);
  const plate = document.createElement('div');
  plate.className = 'al-plate';
  const imgs = [];
  const bg = document.createElement('img');
  bg.src = asset(m.plate.replace('{w}', '1449'));
  Object.assign(bg.style, { left: 0, top: 0, width: '100%', height: '100%' });
  plate.appendChild(bg);
  imgs.push(bg);
  for (const l of m.lines) {
    const i = document.createElement('img');
    i.src = asset(l.src.replace('{w}', '1449'));
    Object.assign(i.style, { left: l.rect[0] + '%', top: l.rect[1] + '%', width: l.rect[2] + '%', height: l.rect[3] + '%' });
    plate.appendChild(i);
    imgs.push(i);
  }
  document.body.appendChild(plate);
  Promise.all(imgs.map((i) => i.decode().catch(() => {}))).then(() => { window.__alignReady = true; });
}
