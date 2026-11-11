// Lighthouse (mobile) against a running server, using Playwright's Chromium.
//   node tools/lighthouse.mjs [url]
import { chromium } from 'playwright';
import lighthouse from 'lighthouse';
import { writeFileSync, mkdirSync } from 'node:fs';

const url = process.argv[2] || 'http://localhost:4173/';
const port = 9333;
const browser = await chromium.launch({ args: [`--remote-debugging-port=${port}`, '--mute-audio'] });
try {
  const res = await lighthouse(url, { port, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'], formFactor: 'mobile' });
  const r = res.lhr;
  mkdirSync('qa-shots', { recursive: true });
  writeFileSync('qa-shots/lighthouse.json', res.report);
  for (const [k, c] of Object.entries(r.categories)) console.log(k.padEnd(16), Math.round(c.score * 100));
  for (const k of ['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index', 'total-byte-weight']) console.log('  ', k.padEnd(26), r.audits[k].displayValue);
  const low = Object.values(r.audits).filter((a) => a.score !== null && a.score < 0.9 && !['informative', 'notApplicable', 'manual'].includes(a.scoreDisplayMode));
  console.log('below 0.9:', low.map((a) => `${a.id}${a.displayValue ? ' (' + a.displayValue + ')' : ''}`).join(' | '));
} finally {
  await browser.close();
}
