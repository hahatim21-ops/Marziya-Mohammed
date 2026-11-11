// ALL editable content lives here: dates, venues, map links, music and UI strings.
// The invitation text itself is part of the images in source/ and is never retyped.

export const CONFIG = {
  monogram: 'M&U',
  countdownTarget: '2026-12-03T20:00:00+05:30', // Nikah, "after Isha" assumed 8:00 PM IST
  strings: {
    tapToOpen: 'Tap to open',
    scroll: 'Scroll',
    bigDay: 'The big day is here',
    thankYou: 'Thank you for celebrating with us',
    thankYouAfter: '2026-12-05T00:00:00+05:30',
    tapForLocation: 'Tap for location',
    scrollForReception: 'Scroll for the Reception',
    scratchHere: 'Scratch here',
    revealDate: 'Reveal the date',
    saveTheDates: 'Save the Dates',
    openInMaps: 'Open in Google Maps',
    addToCalendar: 'Add to Calendar',
    googleCalendar: 'Google Calendar',
    appleOutlook: 'Apple / Outlook (.ics)',
    bothEvents: 'Both events (.ics)',
    viewAgain: 'View again',
    musicLabel: 'Music on/off',
    tapToPlay: 'Tap to play music',
    close: 'Close',
    countdownLabels: ['Days', 'Hours', 'Minutes', 'Seconds'],
  },
  music: {
    sources: ['/audio/alfaaz.m4a', '/audio/alfaaz.mp3'],
    startAt: 2.11, // seconds into the track where the music starts (and loops back to)
    volume: 0.6,
    fadeInMs: 2500,
  },
  events: [
    {
      id: 'nikah',
      title: 'Nikah',
      when: '03 December 2026 · After Namaz-e-Isha',
      start: '2026-12-03T20:00:00+05:30', // assumption: Isha ≈ 8:00 PM
      end: '2026-12-03T22:00:00+05:30', // assumption
      venue: 'Akash Masjid, Ghas Gali, Agripada',
      mapsQuery: 'Akash Masjid, Ghas Gali, Agripada, Mumbai',
      mapsUrl: '', // paste the exact Google Maps pin (maps.app.goo.gl/...) here
    },
    {
      id: 'reception',
      title: 'Reception',
      when: '04 December 2026 · 8:30 PM onwards',
      start: '2026-12-04T20:30:00+05:30',
      end: '2026-12-04T23:30:00+05:30', // assumption
      venue: 'Bay View, Islam Gymkhana, Marine Drive',
      mapsQuery: 'Bay View, Islam Gymkhana, Netaji Subhash Chandra Bose Road, Marine Lines, Mumbai',
      mapsUrl: '', // paste the exact Google Maps pin here
    },
  ],
  calendar: {
    titlePrefix: 'Marziya & Mohammed Umar · ',
    details: 'Wedding of Marziya & Mohammed Umar. Hosted by Mr & Mrs Saba & Faisal Motiwala.',
    reminderDaysBefore: 1,
  },
};
