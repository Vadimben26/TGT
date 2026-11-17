// ============================================================
//  TGT — configuration
//  Everything Lazslo / Vadim may need to change lives here.
//  Secrets (calendar links, WhatsApp number) live in environment
//  variables, NOT in this file — see README.md.
// ============================================================

export default {
  timezone: 'Europe/Madrid',

  // How many days ahead the site shows
  daysAhead: 7,

  // Don't show slots starting sooner than this (Lazslo needs time to book)
  minNoticeHours: 3,

  // Only show court start times on this grid (Taykus offers every 15 min)
  slotStepMinutes: 30,

  // Club & Taykus
  club: {
    name: 'Padelzone 2.0',
    taykusBase: 'https://padelzone.taykus.com',
    bookingTypeId: 12,        // "Reserva Pista" on padelzone.taykus.com/bookings/12
    lessonDurations: [60, 90], // lesson lengths offered (minutes)
  },

  // Lesson prices — € per hour, PER PERSON, by number of players
  prices: {
    perHourPerPerson: { 1: 50, 2: 30, 3: 25, 4: 20 },
    firstLessonDiscount: 0.30,   // -30% on a student's first lesson
  },

  // Coaches.
  // calendarEnv = name of the environment variable that holds the coach's
  // Google Calendar "Secret address in iCal format".
  // workingHours is only used if the coach does NOT put "Dispo" events in
  // their calendar (see README). Format: day 0 = Sunday … 6 = Saturday.
  coaches: [
    {
      id: 'lazslo',
      name: 'Lazslo Bauer',
      initials: 'LB',
      color: '#d7f04a',
      role: 'Coach · organiser of the monthly IE Segovia tournament',
      calendarEnv: 'CAL_LAZSLO',
      workingHours: { 0: null, 1: ['09:00', '22:00'], 2: ['09:00', '22:00'], 3: ['09:00', '22:00'], 4: ['09:00', '22:00'], 5: ['09:00', '22:00'], 6: ['09:00', '22:00'] },
    },
    {
      id: 'carlos',
      name: 'Carlos Escridano',
      initials: 'CE',
      color: '#ffb547',
      role: 'Coach',
      calendarEnv: 'CAL_CARLOS',   // ← add Carlos's iCal link in this env variable
      workingHours: { 0: null, 1: ['09:00', '22:00'], 2: ['09:00', '22:00'], 3: ['09:00', '22:00'], 4: ['09:00', '22:00'], 5: ['09:00', '22:00'], 6: ['09:00', '22:00'] },
    },
  ],

  // Monthly tournament — Lazslo edits this each month.
  tournament: {
    nextDate: null,          // e.g. '2026-12-19'  (null = "date announced soon")
    checkIn: null,           // e.g. '15:30'
    feePerPair: null,        // e.g. 30   (null = not shown)
    levels: ['Advanced', 'Intermediate'],
    pairsPerLevel: 8,
  },
};
