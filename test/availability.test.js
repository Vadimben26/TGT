// Offline test with mocked Taykus + Google Calendar responses.  Run: npm test
import assert from 'node:assert/strict';
import { computeAvailability, localToDate } from '../lib/availability.js';

const now = localToDate('2026-11-18T05:30'); // Wed 18 Nov, 05:30 Madrid (min notice -> 08:30)

// Taykus mock: same shape as padelzone.taykus.com/api/publicbookings/list
function taykusDay(day) {
  const mk = (id, name, times) => ({ id, name, timeTable: times.map(t => ({ id, start: `${day}T${t}:00`, durations: [90], errors: {}, sstart: t })) });
  return { ok: true, model: { multipleResources: [], errorMsg: null, list: [
    mk(18, 'Pista 1 Amstel Oro 0.0', ['09:00', '12:00', '13:30', '15:30']),
    mk(19, 'Pista 2 Tecnocasa', ['09:00', '09:15', '12:00', '18:00', '21:00']),
  ] } };
}

// Lazslo: busy-only calendar (meeting 11:30-13:00 on 18 Nov + weekly class every Wed 18:00-19:00)
const ICS_LAZSLO = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:1
DTSTART:20261118T103000Z
DTEND:20261118T120000Z
SUMMARY:Meeting
END:VEVENT
BEGIN:VEVENT
UID:2
DTSTART:20261111T170000Z
DTEND:20261111T180000Z
RRULE:FREQ=WEEKLY
SUMMARY:Class
END:VEVENT
END:VCALENDAR`;

// Carlos: "Dispo" windows only on 18 Nov 08:30-11:00 Madrid
const ICS_CARLOS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:3
DTSTART:20261118T073000Z
DTEND:20261118T100000Z
SUMMARY:Dispo
END:VEVENT
END:VCALENDAR`;

const fetchMock = async (url, opts = {}) => {
  if (url.includes('taykus')) {
    const day = JSON.parse(opts.body).date.slice(0, 10);
    return { ok: true, status: 200, json: async () => taykusDay(day) };
  }
  if (url === 'ics://lazslo') return { ok: true, status: 200, text: async () => ICS_LAZSLO };
  if (url === 'ics://carlos') return { ok: true, status: 200, text: async () => ICS_CARLOS };
  return { ok: false, status: 404 };
};

// 1) Both calendars connected
let r = await computeAvailability({ now, fetchImpl: fetchMock, env: { CAL_LAZSLO: 'ics://lazslo', CAL_CARLOS: 'ics://carlos', LAZSLO_WHATSAPP: '+34 600 000 000' } });
const day1 = r.slots.filter(s => s.date === '2026-11-18');
const fmt = s => `${s.coach} ${s.start} ${s.durations.map(d => d.minutes + 'min').join('/')} [${s.courts.length}]`;
console.log(day1.map(fmt));

const L = day1.filter(s => s.coach === 'lazslo').map(s => s.start);
const C = day1.filter(s => s.coach === 'carlos').map(s => s.start);
// Lazslo: 09:00 ok; 12:00 overlaps meeting -> no; 13:30 ok; 15:30 ok; 18:00 overlaps weekly class -> no;
// 21:00 -> only 60 min fits before end of working hours (22:00)
assert.deepEqual(L, ['09:00', '13:30', '15:30', '21:00']);
const dur = (coach, start) => day1.find(s => s.coach === coach && s.start === start).durations.map(d => d.minutes);
assert.deepEqual(dur('lazslo', '09:00'), [60, 90]);
assert.deepEqual(dur('lazslo', '21:00'), [60]);
assert.equal(day1.find(s => s.coach === 'lazslo' && s.start === '21:00').durations[0].end, '22:00');
// Carlos: only inside Dispo 08:30-11:00 -> 09:00 (09:15 excluded by 30-min grid)
assert.deepEqual(C, ['09:00']);
assert.equal(day1.find(s => s.coach === 'lazslo' && s.start === '09:00').courts.length, 2);
assert.equal(r.whatsapp, '34600000000');
assert.equal(r.errors.length, 0);
// min notice: nothing before 10:00 on day 1 would apply if now were later
const r2 = await computeAvailability({ now: localToDate('2026-11-18T08:00'), fetchImpl: fetchMock, env: { CAL_LAZSLO: 'ics://lazslo' } });
assert.ok(!r2.slots.some(s => s.date === '2026-11-18' && s.start === '09:00'), 'min notice respected');
// weekly class repeats next Wednesday 25 Nov
assert.ok(!r.slots.some(s => s.coach === 'lazslo' && s.date === '2026-11-25' && s.start === '18:00'));

// 2) Carlos not connected -> no Carlos slots, coach flagged as not connected
assert.equal(r2.coaches.find(c => c.id === 'carlos').connected, false);
assert.ok(!r2.slots.some(s => s.coach === 'carlos'));

// 3) Taykus down -> error reported, no crash
const r3 = await computeAvailability({ now, fetchImpl: async (u, o) => (u.includes('taykus') ? { ok: false, status: 503 } : fetchMock(u, o)), env: { CAL_LAZSLO: 'ics://lazslo' } });
assert.equal(r3.slots.length, 0);
assert.ok(r3.errors.some(e => e.source === 'taykus'));

console.log('All tests passed ✓');
