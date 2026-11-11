// Live countdown to the Nikah. Digits roll up/out and in from below.
import { gsap } from 'gsap';
import { CONFIG } from './config.js';
import { ENV, now } from './env.js';
import { L } from './layout.js';

export function createCountdown(container) {
  const S = CONFIG.strings;
  const target = Date.parse(CONFIG.countdownTarget);
  const after = Date.parse(S.thankYouAfter);
  const cells = [];
  const wrap = document.createElement('div');
  wrap.className = 'cd-cells';
  wrap.style.cssText = 'display:flex;width:100%;height:100%';
  container.setAttribute('role', 'timer');
  container.setAttribute('aria-live', 'off');
  for (let i = 0; i < 4; i++) {
    const cell = document.createElement('div');
    cell.className = 'cd-cell';
    const num = document.createElement('span');
    num.className = 'cd-num';
    const cur = document.createElement('span');
    cur.textContent = '00';
    num.appendChild(cur);
    const lab = document.createElement('span');
    lab.className = 'cd-label';
    lab.textContent = S.countdownLabels[i];
    cell.append(num, lab);
    wrap.appendChild(cell);
    cells.push({ num, cur, value: null });
  }
  const msg = document.createElement('div');
  msg.className = 'cd-message';
  msg.hidden = true;
  container.append(wrap, msg);
  const sr = document.createElement('span');
  sr.className = 'sr-only';
  container.appendChild(sr);

  function setCell(c, v, animate) {
    const text = String(v).padStart(2, '0');
    if (c.value === text) return;
    const first = c.value === null;
    c.value = text;
    if (first || !animate || ENV.reducedMotion) {
      c.cur.textContent = text;
      return;
    }
    const old = c.cur;
    old.classList.add('cd-old');
    const nu = document.createElement('span');
    nu.textContent = text;
    c.num.appendChild(nu);
    c.cur = nu;
    gsap.to(old, { yPercent: -100, opacity: 0, duration: 0.4, ease: 'power2.in', onComplete: () => old.remove() });
    gsap.fromTo(nu, { yPercent: 100, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.4, ease: 'power2.out' });
  }

  let mode = '';
  function tick(animate = true) {
    const t = now();
    if (t >= after) {
      if (mode !== 'thanks') { mode = 'thanks'; wrap.style.visibility = 'hidden'; msg.hidden = false; msg.textContent = S.thankYou; sr.textContent = S.thankYou; }
      return;
    }
    if (t >= target) {
      if (mode !== 'day') { mode = 'day'; wrap.style.visibility = 'hidden'; msg.hidden = false; msg.textContent = S.bigDay; sr.textContent = S.bigDay; }
      return;
    }
    if (mode !== 'count') { mode = 'count'; wrap.style.visibility = ''; msg.hidden = true; }
    let s = Math.floor((target - t) / 1000);
    const d = Math.floor(s / 86400); s -= d * 86400;
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60); s -= m * 60;
    [d, h, m, s].forEach((v, i) => setCell(cells[i], v, animate));
    sr.textContent = `${d} days, ${h} hours, ${m} minutes until the Nikah`;
  }

  function sizeFonts() {
    container.style.setProperty('--cd-num', Math.round(L.plateW * 0.072) + 'px');
    container.style.setProperty('--cd-label', Math.max(8.5, L.plateW * 0.0185).toFixed(1) + 'px');
    container.style.setProperty('--cd-msg', Math.round(L.plateW * 0.075) + 'px');
  }
  sizeFonts();
  tick(false);
  let timer = 0;
  const start = () => {
    if (timer) return;
    tick(true);
    // align to the next whole second
    timer = setTimeout(function loop() {
      tick(true);
      timer = setTimeout(loop, 1000 - (now() % 1000) + 5);
    }, 1000 - (now() % 1000) + 5);
  };
  const stop = () => { clearTimeout(timer); timer = 0; };
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  start();

  return {
    el: container,
    resize: sizeFonts,
    pulse() {
      if (ENV.reducedMotion) return;
      gsap.fromTo(container, { scale: 1 }, { scale: 1.08, duration: 0.28, ease: 'power2.out', yoyo: true, repeat: 1 });
      gsap.fromTo(container, { textShadow: '0 0 0px rgba(255,220,180,0)' }, { textShadow: '0 0 18px rgba(255,220,180,.9)', duration: 0.3, yoyo: true, repeat: 1 });
    },
    get mode() { return mode; },
  };
}
