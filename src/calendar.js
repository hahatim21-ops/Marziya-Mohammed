// Calendar helpers. Pure functions (no DOM) so tools/build_calendar.mjs can reuse them.
import { CONFIG } from './config.js';

const pad = (n) => String(n).padStart(2, '0');

/** ISO string with offset -> 'YYYYMMDDTHHMMSSZ' (UTC). */
export function utcStamp(iso) {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

export function mapsSearchUrl(ev) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.mapsQuery)}`;
}

/** Link for "Open in Google Maps": the client's pasted pin wins over the search. */
export function mapsOpenUrl(ev) {
  return ev.mapsUrl && /^https?:\/\//.test(ev.mapsUrl) ? ev.mapsUrl : mapsSearchUrl(ev);
}

/** Embeddable map (no API key). Short links cannot be embedded, so always use the query. */
export function mapsEmbedUrl(ev) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(ev.mapsQuery)}&z=16&output=embed`;
}

export function eventTitle(ev) {
  return `${ev.title} · ${CONFIG.calendar.titlePrefix.replace(/\s*·\s*$/, '')}`;
}

export function googleCalendarUrl(ev) {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: eventTitle(ev),
    dates: `${utcStamp(ev.start)}/${utcStamp(ev.end)}`,
    details: `${CONFIG.calendar.details}\n${ev.when}\nMap: ${mapsOpenUrl(ev)}`,
    location: ev.venue,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

function icsEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** RFC 5545 line folding at 75 octets. */
function fold(line) {
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    if (bytes + b > 74) {
      out.push(cur);
      cur = ' ' + ch;
      bytes = 1 + b;
    } else {
      cur += ch;
      bytes += b;
    }
  }
  out.push(cur);
  return out.join('\r\n');
}

export function buildIcs(events, stamp = utcStamp(new Date().toISOString())) {
  const days = CONFIG.calendar.reminderDaysBefore || 1;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Marziya & Mohammed Umar//Wedding Invitation//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  for (const ev of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.id}-${utcStamp(ev.start)}@marziya-mohammed-umar`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${utcStamp(ev.start)}`,
      `DTEND:${utcStamp(ev.end)}`,
      `SUMMARY:${icsEscape(eventTitle(ev))}`,
      `LOCATION:${icsEscape(ev.venue)}`,
      `DESCRIPTION:${icsEscape(`${CONFIG.calendar.details}\n${ev.when}\nMap: ${mapsOpenUrl(ev)}`)}`,
      `URL:${mapsOpenUrl(ev)}`,
      'BEGIN:VALARM',
      `TRIGGER:-P${days}D`,
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape(`Tomorrow: ${ev.title}`)}`,
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function icsPath(id) {
  return `calendar/${id}.ics`;
}
