// Computes bookable lesson slots = coach free (Google Calendar) AND a court free (Taykus).
import ical from 'node-ical';
import config from '../config.js';

const TZ = config.timezone;

/* ---------- time helpers (Europe/Madrid <-> absolute Date) ---------- */
function tzParts(d) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
  }).formatToParts(d);
  const g = t => p.find(x => x.type === t).value;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(g('weekday'));
  return { y: +g('year'), m: +g('month'), d: +g('day'), h: +g('hour'), mi: +g('minute'), s: +g('second'), wd };
}
function tzOffsetMin(d) {
  const p = tzParts(d);
  return (Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - d.getTime()) / 60000;
}
/** "2026-11-18T09:00:00" (Madrid wall clock) -> Date */
export function localToDate(str) {
  const [a, b = '00:00'] = str.split('T');
  const [y, m, d] = a.split('-').map(Number);
  const [h, mi] = b.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - tzOffsetMin(new Date(guess)) * 60000;
  const off2 = tzOffsetMin(new Date(t));
  t = guess - off2 * 60000;
  return new Date(t);
}
const pad = n => String(n).padStart(2, '0');
const hhmm = d => { const p = tzParts(d); return `${pad(p.h)}:${pad(p.mi)}`; };
const ymd = d => { const p = tzParts(d); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; };

/** list of "YYYY-MM-DD" (Madrid) for today + n-1 days */
export function nextDays(n, now = new Date()) {
  const p = tzParts(now);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(p.y, p.m - 1, p.d + i));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  });
}

/* ---------- Taykus: free courts ---------- */
export async function fetchCourtsForDay(day, fetchImpl = fetch) {
  const { taykusBase, bookingTypeId } = config.club;
  const res = await fetchImpl(`${taykusBase}/api/publicbookings/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ date: `${day} 00:00:00`, bookingTypeId, customerId: null }),
  });
  if (!res.ok) throw new Error(`Taykus HTTP ${res.status}`);
  const j = await res.json();
  if (!j.ok || !j.model || !Array.isArray(j.model.list)) throw new Error(`Taykus error: ${j.errorMsg || 'unexpected format'}`);
  // -> [{ court, start: Date, minutes }]
  const out = [];
  for (const court of j.model.list) {
    for (const t of court.timeTable || []) {
      if (t.errors && Object.keys(t.errors).length) continue;
      // longest free duration Taykus offers from this start (online bookings are 90 min)
      const minutes = Math.max(0, ...(t.durations || []));
      if (!minutes) continue;
      out.push({ court: court.name, courtId: court.id, start: localToDate(t.start), minutes });
    }
  }
  return out;
}

/* ---------- Google Calendar (iCal secret address) ---------- */
const AVAIL_RE = /\b(dispo|disponible|available|availability|libre)\b/i;

export function expandEvents(data, from, to) {
  const out = [];
  for (const ev of Object.values(data)) {
    if (!ev || ev.type !== 'VEVENT' || !ev.start) continue;
    if (ev.status === 'CANCELLED') continue;
    const transparent = String(ev.transparency || '').toUpperCase() === 'TRANSPARENT';
    const summary = typeof ev.summary === 'string' ? ev.summary : (ev.summary && ev.summary.val) || '';
    const allDay = ev.datetype === 'date';
    const end0 = ev.end || new Date(ev.start.getTime() + (allDay ? 86400000 : 0));
    const dur = end0.getTime() - ev.start.getTime();
    const push = (s, e) => { if (e > from && s < to) out.push({ start: s, end: e, summary, transparent, allDay }); };

    if (ev.rrule) {
      const exdates = new Set(Object.values(ev.exdate || {}).map(d => new Date(d).toISOString().slice(0, 16)));
      const overrides = ev.recurrences || {};
      const overrideKeys = new Set(Object.values(overrides).map(r => r.recurrenceid && new Date(r.recurrenceid).toISOString().slice(0, 16)));
      // rrule returns "floating" dates whose hour can be shifted by the timezone offset,
      // so we only trust the calendar DAY of each occurrence and re-apply the event's
      // Madrid wall-clock start time (this also keeps the right hour across DST changes).
      const wall = allDay ? '00:00' : hhmm(ev.start);
      const occ = ev.rrule.between(new Date(from.getTime() - dur - 2 * 86400000), new Date(to.getTime() + 2 * 86400000), true);
      for (const o of occ) {
        const day = `${o.getUTCFullYear()}-${pad(o.getUTCMonth() + 1)}-${pad(o.getUTCDate())}`;
        const s = localToDate(`${day}T${wall}`);
        const k = s.toISOString().slice(0, 16);
        if (exdates.has(k) || overrideKeys.has(k)) continue;
        push(s, new Date(s.getTime() + dur));
      }
      for (const r of Object.values(overrides)) {
        if (r.status === 'CANCELLED' || !r.start) continue;
        push(r.start, r.end || new Date(r.start.getTime() + dur));
      }
    } else {
      push(ev.start, end0);
    }
  }
  return out;
}

export async function fetchCoachEvents(url, from, to, fetchImpl = fetch) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Calendar HTTP ${res.status}`);
  const text = await res.text();
  const data = ical.sync.parseICS(text);
  return expandEvents(data, from, to);
}

/** is coach free on [s,e)? */
export function coachFree(coach, events, s, e) {
  const overlaps = (a, b) => a.start < e && a.end > s;
  const avail = events.filter(x => AVAIL_RE.test(x.summary));
  const busy = events.filter(x => !AVAIL_RE.test(x.summary) && !x.transparent);
  if (busy.some(overlaps)) return false;
  if (avail.length) return avail.some(a => a.start <= s && a.end >= e);
  // fallback: working hours
  const p = tzParts(s);
  const wh = coach.workingHours && coach.workingHours[p.wd];
  if (!wh) return false;
  const day = ymd(s);
  const whStart = localToDate(`${day}T${wh[0]}`), whEnd = localToDate(`${day}T${wh[1]}`);
  return s >= whStart && e <= whEnd;
}

/* ---------- main ---------- */
export async function computeAvailability({ now = new Date(), fetchImpl = fetch, env = process.env } = {}) {
  const days = nextDays(config.daysAhead, now);
  const from = localToDate(`${days[0]}T00:00`);
  const to = localToDate(`${days[days.length - 1]}T23:59`);
  const errors = [];

  // courts
  const courtResults = await Promise.allSettled(days.map(d => fetchCourtsForDay(d, fetchImpl)));
  const courtSlots = [];
  courtResults.forEach((r, i) => {
    if (r.status === 'fulfilled') courtSlots.push(...r.value);
    else errors.push({ source: 'taykus', day: days[i], message: String(r.reason && r.reason.message || r.reason) });
  });

  // coaches
  const coachesOut = [];
  const coachEvents = {};
  await Promise.all(config.coaches.map(async c => {
    const url = env[c.calendarEnv];
    const info = { id: c.id, name: c.name, initials: c.initials, color: c.color, role: c.role, connected: false };
    if (url) {
      try { coachEvents[c.id] = await fetchCoachEvents(url, from, to, fetchImpl); info.connected = true; }
      catch (e) { errors.push({ source: 'calendar', coach: c.id, message: String(e.message || e) }); }
    }
    coachesOut.push(info);
  }));
  coachesOut.sort((a, b) => config.coaches.findIndex(c => c.id === a.id) - config.coaches.findIndex(c => c.id === b.id));

  // combine
  const minStart = new Date(now.getTime() + config.minNoticeHours * 3600000);
  const step = config.slotStepMinutes;
  const map = new Map();
  for (const cs of courtSlots) {
    if (cs.start < minStart) continue;
    const p = tzParts(cs.start);
    if ((p.h * 60 + p.mi) % step !== 0) continue;
    for (const c of config.coaches) {
      const ev = coachEvents[c.id];
      if (!ev) continue;
      // which lesson lengths fit: court free long enough AND coach free for that length
      const fits = config.club.lessonDurations.filter(m =>
        m <= cs.minutes && coachFree(c, ev, cs.start, new Date(cs.start.getTime() + m * 60000)));
      if (!fits.length) continue;
      const key = `${c.id}|${cs.start.toISOString()}`;
      if (!map.has(key)) map.set(key, { coach: c.id, date: ymd(cs.start), start: hhmm(cs.start), startISO: cs.start.toISOString(), durations: {}, courts: [] });
      const slot = map.get(key);
      slot.courts.push(cs.court);
      for (const m of fits) (slot.durations[m] ||= []).push(cs.court);
    }
  }
  // durations: { "60": [courts], "90": [courts] } -> [{ minutes, end, courts }]
  const slots = [...map.values()].map(s => ({
    ...s,
    durations: Object.entries(s.durations).map(([m, courts]) => ({
      minutes: +m, end: hhmm(new Date(new Date(s.startISO).getTime() + m * 60000)), courts,
    })).sort((a, b) => a.minutes - b.minutes),
  })).sort((a, b) => a.startISO.localeCompare(b.startISO) || a.coach.localeCompare(b.coach));

  return {
    updatedAt: now.toISOString(),
    days,
    prices: config.prices,
    club: { name: config.club.name, lessonDurations: config.club.lessonDurations, courts:[...new Set(courtSlots.map(c => c.court))].length || null },
    coaches: coachesOut,
    slots,
    tournament: config.tournament,
    whatsapp: (env.LAZSLO_WHATSAPP || '').replace(/[^\d]/g, '') || null,
    errors,
  };
}
