// Writes public/calendar/{nikah,reception,both}.ics from src/config.js.
// Runs automatically before `npm run build` and `npm run dev`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../src/config.js';
import { buildIcs } from '../src/calendar.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'calendar');
mkdirSync(out, { recursive: true });
for (const ev of CONFIG.events) writeFileSync(join(out, `${ev.id}.ics`), buildIcs([ev]));
writeFileSync(join(out, 'both.ics'), buildIcs(CONFIG.events));
console.log('calendar: wrote', CONFIG.events.map((e) => e.id).join(', '), '+ both');
