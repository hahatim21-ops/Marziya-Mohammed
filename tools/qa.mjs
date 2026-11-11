// Playwright QA: screenshots per build stage and automated checks.
//   node tools/qa.mjs <scenario[,scenario...]> [baseUrl] [outDir]
//   BROWSER=webkit node tools/qa.mjs music
// Scenarios: plates, cover, opening, pages, scratch, dates, events, countdown,
//            align, music, a11y, perf, all
import { chromium, webkit } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const scenario = process.argv[2] || 'all';
const BASE = (process.argv[3] || 'http://localhost:5173').replace(/\/$/, '');
const OUT = process.argv[4] || join(ROOT, 'qa-shots');
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'iphone', width: 390, height: 844, dpr: 3, mobile: true },
  { name: 'android', width: 360, height: 780, dpr: 3, mobile: true },
  { name: 'desktop', width: 1440, height: 900, dpr: 1, mobile: false },
];
const results = [];
const ok = (name, pass, info = '') => {
  results.push({ name, pass, info });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  - ' + info : ''}`);
};

async function newPage(browser, vp, extra = {}) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr,
    isMobile: !!vp.mobile && browser.browserType().name() !== 'firefox',
    hasTouch: !!vp.mobile,
    ...extra,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  [pageerror ${vp.name}]`, e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log(`  [console ${vp.name}]`, m.text()); });
  return { ctx, page };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitCover(page) {
  await page.waitForSelector('#loader', { state: 'detached', timeout: 15000 });
}

// NOTE: evaluate() callbacks must not return GSAP/Lenis objects: Playwright would try
// to serialise their huge object graphs and crash the renderer. Always use a block body.
async function scrollToY(page, y) {
  await page.evaluate((yy) => {
    const l = window.__lenis;
    if (l) l.scrollTo(yy, { immediate: true, force: true });
    else window.scrollTo(0, yy);
  }, y);
}

async function pageH(page) {
  return page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--page-h')));
}

// Scroll offset that centres a page in the viewport (or, for page 05, reaches a given
// progress of its scroll-driven sequence: start 'top 72%', end 'top 2%').
async function yFor(page, id, p05progress) {
  return page.evaluate(({ id, pr }) => {
    const sec = document.getElementById('page-' + id);
    const vh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--page-h'));
    if (pr != null) return Math.max(0, sec.offsetTop - (0.72 - 0.70 * pr) * vh);
    return Math.max(0, sec.offsetTop - (vh - sec.offsetHeight) / 2);
  }, { id, pr: p05progress == null ? null : p05progress });
}
async function gotoPage(page, id, wait = 2500, p05progress) {
  const y = await yFor(page, id, p05progress);
  await scrollToY(page, Math.max(0, y - 300));
  await sleep(250);
  await scrollToY(page, y);
  await sleep(wait);
  return y;
}

// ---------------------------------------------------------------- scenarios

async function plates(browser) {
  const { ctx, page } = await newPage(browser, { name: 'desktop', width: 1300, height: 900, dpr: 1 });
  await page.goto(`${BASE}/?debug=plates`);
  await page.waitForLoadState('networkidle');
  await sleep(800);
  await page.screenshot({ path: join(OUT, 'plates.png'), fullPage: true });
  await ctx.close();
}

async function cover(browser, tag = '') {
  for (const vp of VIEWPORTS) {
    const { ctx, page } = await newPage(browser, vp);
    await page.goto(BASE + '/');
    await sleep(300);
    await page.screenshot({ path: join(OUT, `loader-${vp.name}${tag}.png`) });
    await waitCover(page);
    await sleep(600);
    await page.screenshot({ path: join(OUT, `cover-${vp.name}${tag}.png`) });
    const st = await page.evaluate(() => ({
      locked: document.documentElement.classList.contains('is-locked'),
      y: window.scrollY,
    }));
    ok(`${vp.name}: scroll locked before tap, at the top`, st.locked && st.y === 0);
    if (!(vp.mobile && browser.browserType().name() === 'webkit')) { // no wheel in mobile WebKit
      await page.mouse.wheel(0, 900);
      await sleep(400);
      const y2 = await page.evaluate(() => (window.__lenis ? window.__lenis.scroll : window.scrollY));
      ok(`${vp.name}: wheel does not scroll before the tap`, y2 === 0, `scroll=${y2}`);
    }
    await ctx.close();
  }
}

async function opening(browser, tag = '') {
  for (const vp of VIEWPORTS) {
    const { ctx, page } = await newPage(browser, vp);
    await page.goto(BASE + '/');
    await waitCover(page);
    await sleep(300);
    await page.mouse.click(vp.width / 2, vp.height * 0.5);
    await page.waitForFunction(() => !!window.__openTl);
    await page.evaluate(() => { window.__openTl.pause(); });
    for (const t of [0.3, 0.8, 1.2, 1.6, 2.2, 3.0, 3.8]) {
      // seek with events on, so onUpdate (the swing) and the 2.0s callback run
      await page.evaluate((tt) => { window.__openTl.seek(tt, false); }, t);
      await sleep(60);
      await page.screenshot({ path: join(OUT, `open-${vp.name}-${t.toFixed(1)}s${tag}.png`) });
    }
    await page.evaluate(() => { window.__openTl.play(); });
    await sleep(1600);
    const unlocked = await page.evaluate(() => !document.documentElement.classList.contains('is-locked'));
    ok(`${vp.name}: unlocked after opening`, unlocked);
    await page.screenshot({ path: join(OUT, `open-${vp.name}-done${tag}.png`) });
    await ctx.close();
  }
}

async function pages(browser, tag = '') {
  for (const vp of VIEWPORTS) {
    const { ctx, page } = await newPage(browser, vp);
    await page.goto(BASE + '/?open=1');
    await waitCover(page);
    await sleep(800);
    await page.screenshot({ path: join(OUT, `page-${vp.name}-p01${tag}.png`) });
    const stops = [['p02', 'p02'], ['p03', 'p03'], ['p04', 'p04'], ['p05a', 'p05', 0.45], ['p05b', 'p05', 1], ['p06', 'p06']];
    for (const [name, id, pr] of stops) {
      await gotoPage(page, id, 3600, pr);
      await page.screenshot({ path: join(OUT, `page-${vp.name}-${name}${tag}.png`) });
    }
    // the seam between two designs
    const yb = await page.evaluate(() => document.getElementById('page-p03').offsetTop - innerHeight * 0.45);
    await scrollToY(page, yb);
    await sleep(800);
    await page.screenshot({ path: join(OUT, `page-${vp.name}-transition${tag}.png`) });
    const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    ok(`${vp.name}: no horizontal scroll`, !hscroll);
    await ctx.close();
  }
}

async function scratch(browser) {
  const vp = VIEWPORTS[0];
  const { ctx, page } = await newPage(browser, { ...vp, mobile: false });
  await page.goto(BASE + '/?open=1');
  await waitCover(page);
  await sleep(600);
  await gotoPage(page, 'p04', 2500);
  const box = await page.locator('.scratch canvas').first().boundingBox();
  const y0 = await page.evaluate(() => window.__lenis.scroll);
  await page.screenshot({ path: join(OUT, 'scratch-before.png') });
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  let cleared = 0;
  let revealedEarly = false;
  for (let row = 0; row < 8 && cleared < 0.55; row++) {
    const yy = box.y + 12 + (row / 7) * (box.height - 24);
    const fromX = row % 2 ? box.x + box.width - 10 : box.x + 10;
    const toX = row % 2 ? box.x + 10 : box.x + box.width - 10;
    await page.mouse.move(fromX, yy, { steps: 4 });
    await page.mouse.move(toX, yy, { steps: 14 });
    await sleep(230);
    const st = await page.evaluate(() => ({ c: document.querySelector('.scratch').dataset.cleared || '0', r: document.querySelector('.scratch').dataset.revealed === '1' }));
    cleared = parseFloat(st.c);
    if (st.r && cleared < 0.5) revealedEarly = true;
    if (row === 2) await page.screenshot({ path: join(OUT, 'scratch-mid.png') });
  }
  const y1 = await page.evaluate(() => window.__lenis.scroll);
  await page.mouse.up();
  await sleep(300);
  const revealed = await page.evaluate(() => document.querySelector('.scratch').dataset.revealed === '1');
  ok('scratch: reveals at ~55%', revealed && !revealedEarly && cleared >= 0.5, `cleared=${cleared}`);
  ok('scratch: page did not scroll while scratching', Math.abs(y1 - y0) < 1, `delta=${y1 - y0}`);
  await sleep(1500);
  await page.screenshot({ path: join(OUT, 'scratch-after.png') });
  await ctx.close();
}

async function dates(browser) {
  const vp = VIEWPORTS[0];
  const { ctx, page } = await newPage(browser, vp);
  await page.goto(BASE + '/?open=1');
  await waitCover(page);
  await gotoPage(page, 'p04', 2500);
  // keyboard path: the visually hidden "Reveal the date" button
  await page.locator('.scratch-reveal-btn').focus();
  await page.keyboard.press('Enter');
  await sleep(1800);
  await page.locator('.save-dates').click({ force: true }); // inside the slowly scaling plate
  await sleep(1000);
  await page.screenshot({ path: join(OUT, 'dates-sheet.png') });
  const links = await page.$$eval('.sheet .cal-opt', (as) => as.map((a) => a.getAttribute('href')));
  const g = links.filter((h) => h.startsWith('https://calendar.google.com'));
  const ics = links.filter((h) => h.endsWith('.ics'));
  ok('dates: Nikah Google link (14:30Z-16:30Z)', g.some((h) => h.includes('20261203T143000Z%2F20261203T163000Z')));
  ok('dates: Reception Google link (15:00Z-18:00Z)', g.some((h) => h.includes('20261204T150000Z%2F20261204T180000Z')));
  ok('dates: .ics links for both events', ics.length === 2, ics.join(' '));
  const focusIn = await page.evaluate(() => !!document.activeElement.closest('.sheet'));
  ok('dates: focus moves into the sheet', focusIn);
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
  const trapped = await page.evaluate(() => !!document.activeElement.closest('.sheet'));
  ok('dates: focus is trapped in the sheet', trapped);
  await page.keyboard.press('Escape');
  await sleep(700);
  const back = await page.evaluate(() => !!document.activeElement && document.activeElement.classList.contains('save-dates'));
  ok('dates: Escape closes and returns focus', back);
  for (const [id, s, e] of [['nikah', '20261203T143000Z', '20261203T163000Z'], ['reception', '20261204T150000Z', '20261204T180000Z']]) {
    const res = await page.request.get(`${BASE}/calendar/${id}.ics`);
    const txt = await res.text();
    ok(`ics ${id}: UTC times + 1-day reminder`, txt.includes(`DTSTART:${s}`) && txt.includes(`DTEND:${e}`) && txt.includes('TRIGGER:-P1D'));
  }
  await ctx.close();
}

async function events(browser) {
  const vp = VIEWPORTS[0];
  const { ctx, page } = await newPage(browser, vp);
  await page.goto(BASE + '/?open=1');
  await waitCover(page);
  await sleep(600);
  await gotoPage(page, 'p05', 2500, 0.45);
  const vis = async () => page.evaluate(() => {
    const ops = (ids) => ids.map((id) => +getComputedStyle(document.querySelector(`[data-line="${id}"]`)).opacity);
    const btns = Array.from(document.querySelectorAll('.loc-btn')).map((b) => +(+getComputedStyle(b).opacity).toFixed(2));
    return { a: ops(['e1', 'e2', 'e3', 'e4', 'e5']), b: ops(['e6', 'e7', 'e8', 'e9']), btns };
  });
  const A = await vis();
  ok('events: phase A shows Nikah only', A.a.every((o) => o > 0.9) && A.b.every((o) => o < 0.05) && A.btns[0] > 0.9 && A.btns[1] < 0.05, JSON.stringify(A));
  await page.screenshot({ path: join(OUT, 'events-phaseA.png') });
  await page.locator('.loc-btn').first().click({ force: true });
  await sleep(1200);
  await page.screenshot({ path: join(OUT, 'events-sheet-nikah.png') });
  const iframe = await page.locator('.sheet iframe').getAttribute('src');
  ok('events: Nikah map embed', !!iframe && iframe.includes('output=embed') && iframe.includes('Akash'), iframe);
  const openHref = await page.locator('.sheet .sheet-btn.primary').getAttribute('href');
  ok('events: Open in Google Maps link', openHref.startsWith('https://www.google.com/maps/search/?api=1&query=Akash'), openHref);
  await page.keyboard.press('Escape');
  await sleep(800);
  await sleep(600);
  const hint = await page.evaluate(() => +getComputedStyle(document.querySelector('.float-hint')).opacity);
  ok('events: hint after closing sheet', hint > 0.5);
  await gotoPage(page, 'p05', 2500, 1);
  const B = await vis();
  ok('events: further scroll shows Reception + second button', B.a.every((o) => o > 0.9) && B.b.every((o) => o > 0.9) && B.btns[1] > 0.9, JSON.stringify(B));
  // no button overlaps any text line
  const overlaps = await page.evaluate(() => {
    const out = [];
    const lines = Array.from(document.querySelectorAll('#page-p05 .ov'));
    for (const b of document.querySelectorAll('.loc-btn')) {
      const r = b.getBoundingClientRect();
      for (const l of lines) {
        const id = l.dataset.line;
        const box = window.__manifest.pages.p05.lines.find((x) => x.id === id).box;
        const plate = l.parentElement.getBoundingClientRect();
        const t = plate.top + box[1] / 100 * plate.height;
        const bt = t + box[3] / 100 * plate.height;
        if (r.bottom > t && r.top < bt) out.push(id);
      }
    }
    return out;
  });
  ok('events: buttons do not overlap any text', overlaps.length === 0, overlaps.join(','));
  await page.screenshot({ path: join(OUT, 'events-phaseB.png') });
  await page.locator('.loc-btn').nth(1).click({ force: true });
  await sleep(1200);
  await page.screenshot({ path: join(OUT, 'events-sheet-reception.png') });
  await page.locator('.sheet .sheet-btn.secondary').click();
  await sleep(300);
  const gcal = await page.locator('.sheet .cal-inline a').first().getAttribute('href');
  ok('events: Reception Google Calendar dates', gcal.includes('20261204T150000Z%2F20261204T180000Z'));
  await page.locator('.sheet-close').click();
  await sleep(700);
  await gotoPage(page, 'p05', 2500, 0.45);
  const A2 = await vis();
  ok('events: scrolling back up hides Reception again', A2.b.every((o) => o < 0.05) && A2.btns[1] < 0.05, JSON.stringify(A2));
  await ctx.close();
}

async function countdown(browser) {
  const vp = VIEWPORTS[0];
  const cases = [
    ['before', '2026-11-11T12:00:00%2B05:30', /^\d/],
    ['bigday', '2026-12-03T21:00:00%2B05:30', /big day/i],
    ['after', '2026-12-06T10:00:00%2B05:30', /thank you/i],
  ];
  for (const [name, now, re] of cases) {
    const { ctx, page } = await newPage(browser, vp);
    await page.goto(`${BASE}/?open=1&now=${now}`);
    await waitCover(page);
    await gotoPage(page, 'p04', 3000);
    const txt = await page.evaluate(() => {
      const c = document.querySelector('.countdown');
      const m = c.querySelector('.cd-message');
      return m && !m.hidden ? m.textContent : Array.from(c.querySelectorAll('.cd-num')).map((n) => n.lastChild.textContent.trim()).join(':');
    });
    let pass = re.test(txt);
    if (name === 'before') pass = pass && txt.startsWith('22:');
    ok(`countdown: ${name}`, pass, txt);
    await page.screenshot({ path: join(OUT, `countdown-${name}.png`) });
    await ctx.close();
  }
}

async function align(browser) {
  // Every line shown on its clean plate, effects off, rendered at the design's native
  // size through the same %-positioned DOM the site uses; diffed against the original.
  const manifest = JSON.parse(readFileSync(join(ROOT, 'public/img/manifest.json'), 'utf8'));
  const { ctx, page } = await newPage(browser, { name: 'align', width: 1449, height: 2576, dpr: 1, mobile: false });
  for (const id of manifest.order) {
    await page.goto(`${BASE}/?debug=align&page=${id}&fx=0`);
    await page.waitForFunction(() => window.__alignReady === true, null, { timeout: 15000 });
    await page.screenshot({ path: join(OUT, `align-${id}.png`) });
  }
  await ctx.close();
  const out = execFileSync('python', [join(ROOT, 'tools', 'align_check.py'), OUT], { encoding: 'utf8' });
  for (const line of out.trim().split(/\r?\n/)) {
    const [id, mad, edge] = line.split(' ');
    ok(`alignment ${id}: MAD < 2/255`, parseFloat(mad) < 2, `MAD=${mad} worst-overlay-edge=${edge}`);
  }
}

async function music(browser) {
  const vp = VIEWPORTS[0];
  const name = browser.browserType().name();
  const { ctx, page } = await newPage(browser, vp);
  await page.goto(BASE + '/');
  await waitCover(page);
  await page.mouse.click(vp.width / 2, vp.height / 2);
  // the position as soon as playback starts must be the configured start point
  const startCfg = await page.evaluate(() => window.__music.startAt);
  await page.waitForFunction(() => { const a = document.getElementById('audio'); return !a.paused && a.currentTime > 0; }, null, { timeout: 8000 });
  const firstT = await page.evaluate(() => document.getElementById('audio').currentTime);
  ok(`music (${name}): starts at the configured ${startCfg} s`, Math.abs(firstT - startCfg) < 0.35, `first position=${firstT.toFixed(3)} s`);
  await sleep(300);
  const g1 = await page.evaluate(() => window.__music.gain);
  await sleep(2400);
  const g2 = await page.evaluate(() => window.__music.gain);
  ok(`music (${name}): fades in 0 to 0.6`, g1 < 0.3 && g2 > 0.55, `gain@0.5s=${g1.toFixed(2)} gain@2.9s=${g2.toFixed(2)}`);
  const st = await page.evaluate(() => {
    const a = document.getElementById('audio');
    const b = document.getElementById('music');
    return { paused: a.paused, t: a.currentTime, src: a.currentSrc, btn: b.className, pressed: b.getAttribute('aria-pressed') };
  });
  ok(`music (${name}): playing after tap`, !st.paused && st.t > 0.3, JSON.stringify(st));

  await page.locator('#music').click();
  await sleep(800);
  const muted = await page.evaluate(() => ({ paused: document.getElementById('audio').paused, pressed: document.getElementById('music').getAttribute('aria-pressed') }));
  ok(`music (${name}): mute works`, muted.paused && muted.pressed === 'false', JSON.stringify(muted));
  await page.locator('#music').click();
  await sleep(500);
  const setHidden = (h) => page.evaluate((hh) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hh });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hh ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, h);
  await setHidden(true);
  await sleep(800);
  const bg = await page.evaluate(() => document.getElementById('audio').paused);
  ok(`music (${name}): pauses in background`, bg);
  await setHidden(false);
  await sleep(800);
  const fg = await page.evaluate(() => document.getElementById('audio').paused);
  ok(`music (${name}): resumes when visible`, !fg);
  await ctx.close();
}

async function a11y(browser) {
  const vp = VIEWPORTS[0];
  {
    const { ctx, page } = await newPage(browser, { ...vp, mobile: false });
    await page.goto(BASE + '/?music=0');
    await waitCover(page);
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => document.activeElement.id);
    await page.keyboard.press('Enter');
    await sleep(4200); // swing + burgundy fill, unlock at 3.55 s
    const open = await page.evaluate(() => !document.getElementById('cover') && !document.documentElement.classList.contains('is-locked'));
    ok('a11y: cover opens with the keyboard', f === 'cover' && open, `focused=${f}`);
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage(browser, vp, { reducedMotion: 'reduce' });
    await page.goto(BASE + '/?music=0');
    await waitCover(page);
    await page.mouse.click(vp.width / 2, vp.height / 2);
    await sleep(1400);
    const st = await page.evaluate(() => ({
      gone: !document.getElementById('cover'),
      unlocked: !document.documentElement.classList.contains('is-locked'),
      rm: document.documentElement.classList.contains('reduced-motion'),
    }));
    ok('a11y: reduced motion cross-fades the cover', st.gone && st.unlocked && st.rm, JSON.stringify(st));
    await gotoPage(page, 'p03', 2600);
    const lines = await page.$$eval('#page-p03 .ov', (els) => els.map((e) => +getComputedStyle(e).opacity));
    ok('a11y: reduced motion still reveals lines', lines.every((o) => o > 0.95), lines.join(','));
    await page.screenshot({ path: join(OUT, 'reduced-p03.png') });
    await gotoPage(page, 'p04', 1500);
    await page.locator('.scratch canvas').first().click();
    await sleep(800);
    const rev = await page.evaluate(() => document.querySelector('.scratch').dataset.revealed === '1');
    ok('a11y: reduced motion scratch card clears on tap', rev);
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage(browser, vp);
    await page.goto(BASE + '/?music=0');
    const sr = await page.$$eval('section.page > .sr-only', (els) => els.map((e) => e.textContent.length));
    ok('a11y: screen-reader text on all 6 sections', sr.length === 6 && sr.every((n) => n > 10), sr.join(','));
    await ctx.close();
  }
}

async function perf(browser) {
  // first view weight (until the cover is ready) and frame rate while scrolling with 4x CPU throttling
  const vp = VIEWPORTS[0];
  const { ctx, page } = await newPage(browser, vp);
  const urls = {};
  const sizes = {};
  const client = await ctx.newCDPSession(page);
  await client.send('Network.enable');
  client.on('Network.responseReceived', (e) => { urls[e.requestId] = e.response.url; });
  client.on('Network.loadingFinished', (e) => { sizes[e.requestId] = e.encodedDataLength; });
  await page.goto(BASE + '/');
  await waitCover(page);
  await sleep(1500);
  let bytes = 0;
  let audioBytes = 0;
  for (const id in sizes) {
    if (/\.(mp3|m4a)(\?|$)/.test(urls[id] || '')) audioBytes += sizes[id];
    else bytes += sizes[id];
  }
  ok('perf: first view under 1.5 MB (excluding audio)', bytes < 1.5 * 1024 * 1024, `${(bytes / 1024).toFixed(0)} KB (+ ${(audioBytes / 1024).toFixed(0)} KB audio preloaded after first paint)`);
  // frame rate: without audio (the headless audio device can crash the renderer under throttling)
  await page.goto(BASE + '/?music=0');
  await waitCover(page);
  await page.mouse.click(vp.width / 2, vp.height / 2);
  await sleep(1000);
  await sleep(3200);
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const H = await pageH(page);
  const fps = await page.evaluate(async (h) => {
    const times = [];
    let last = performance.now();
    let running = true;
    const tick = (t) => { times.push(t - last); last = t; if (running) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const l = window.__lenis;
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => { l.scrollTo((i + 1) * h, { duration: 1.4, force: true, onComplete: r }); });
      await new Promise((r) => setTimeout(r, 300));
    }
    running = false;
    times.sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    return { avgFps: Math.round(1000 / avg), p95ms: Math.round(times[Math.floor(times.length * 0.95)]), frames: times.length };
  }, H);
  await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  ok('perf: scroll frame rate, 4x CPU throttle (headless software GL)', fps.avgFps > 40, JSON.stringify(fps));
  await ctx.close();
}

// ---------------------------------------------------------------- main
const run = async () => {
  const which = scenario.split(',');
  const has = (s) => which.includes(s) || which.includes('all');
  const browserName = process.env.BROWSER || 'chromium';
  const bt = browserName === 'webkit' ? webkit : chromium;
  // --mute-audio: the headless audio device here is flaky; playback state is still observable
  const browser = await bt.launch({ args: browserName === 'chromium' ? ['--autoplay-policy=user-gesture-required', '--mute-audio'] : [] });
  const tag = browserName === 'webkit' ? '-webkit' : '';
  try {
    if (has('plates')) await plates(browser);
    if (has('cover')) await cover(browser, tag);
    if (has('opening')) await opening(browser, tag);
    if (has('pages')) await pages(browser, tag);
    if (has('scratch')) await scratch(browser);
    if (has('dates')) await dates(browser);
    if (has('events')) await events(browser);
    if (has('countdown')) await countdown(browser);
    if (has('align')) await align(browser);
    if (has('music')) await music(browser);
    if (has('a11y')) await a11y(browser);
    if (has('perf') && browserName === 'chromium') await perf(browser);
  } finally {
    await browser.close();
  }
  writeFileSync(join(OUT, `results-${scenario.replace(/,/g, '+')}${tag}.json`), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exitCode = failed.length ? 1 : 0;
};
run();
