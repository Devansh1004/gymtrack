import { uid } from '../shared/defaults.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const clean = (v) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim();
const str = (v, max) => Array.from(clean(v)).slice(0, max).join('');
const num = (v, lo, hi, def = null) => {
  if (v === null || v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
};
const okId = (v) => (typeof v === 'string' && /^[a-z0-9]{3,16}$/i.test(v) ? v : uid());
const uniqueId = (v, seen) => { let id = okId(v); if (seen.has(id)) id = uid(); seen.add(id); return id; };

export function sanitizePlan(p) {
  const out = {};
  for (let d = 0; d < 7; d++) {
    const day = p?.[d];
    if (!day || typeof day !== 'object') continue;
    const seen = new Set();
    const exercises = (Array.isArray(day.exercises) ? day.exercises : []).slice(0, 30).map((e) => ({
      id: uniqueId(e?.id, seen),
      name: str(e?.name, 50) || 'Exercise',
      sets: Math.round(num(e?.sets, 1, 20, 3)),
      reps: str(e?.reps, 12),
      weight: num(e?.weight, 0, 1000, null) === null ? null : Math.round(num(e.weight, 0, 1000) * 100) / 100,
      note: str(e?.note, 80),
    }));
    const name = str(day.name, 40);
    if (!exercises.length && !name) continue;
    out[d] = { name, time: HHMM.test(day.time) ? day.time : '', exercises };
  }
  return out;
}

export function sanitizeTasks(arr) {
  const seen = new Set();
  return (Array.isArray(arr) ? arr : []).slice(0, 60).map((t) => ({
    id: uniqueId(t?.id, seen),
    title: str(t?.title, 40) || 'Task',
    amount: str(t?.amount, 30),
    icon: str(t?.icon, 3) || '✅',
    times: [...new Set((Array.isArray(t?.times) ? t.times : []).filter((x) => HHMM.test(x)))].sort().slice(0, 24),
    days: [...new Set((Array.isArray(t?.days) ? t.days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort(),
    enabled: t?.enabled !== false,
  }));
}

export function sanitizeSettings(b, cur) {
  const o = { ...cur };
  if ('tz' in b) { try { new Intl.DateTimeFormat('en-CA', { timeZone: String(b.tz) }); o.tz = String(b.tz); } catch { /* keep old */ } }
  if ('notify' in b) o.notify = !!b.notify;
  if ('roast' in b) o.roast = Math.round(num(b.roast, 0, 3, cur.roast));
  if ('roastTime' in b && HHMM.test(b.roastTime)) o.roastTime = b.roastTime;
  if ('nagAfter' in b) o.nagAfter = Math.round(num(b.nagAfter, 0, 240, cur.nagAfter));
  if ('workoutWeight' in b) o.workoutWeight = Math.round(num(b.workoutWeight, 0, 100, cur.workoutWeight));
  if ('streakMin' in b) o.streakMin = Math.round(num(b.streakMin, 10, 100, cur.streakMin));
  if ('height' in b) o.height = num(b.height, 80, 250, null);
  return o;
}

export function sanitizeLogPatch(b) {
  const p = {};
  if (b?.done && typeof b.done === 'object') {
    p.done = {};
    for (const [k, v] of Object.entries(b.done).slice(0, 200)) if (/^[A-Za-z0-9]{3,16}@(?:\d\d:\d\d)?$/.test(k)) p.done[k] = !!v;
  }
  if (b?.workout && typeof b.workout === 'object') {
    p.workout = {};
    for (const [k, v] of Object.entries(b.workout).slice(0, 60)) if (/^[A-Za-z0-9]{3,16}$/.test(k)) p.workout[k] = Math.round(num(v, 0, 20, 0));
  }
  if (b && 'weight' in b) p.weight = num(b.weight, 20, 400, null);
  if (b && 'height' in b) p.height = num(b.height, 80, 250, null);
  if (b && 'note' in b) p.note = str(b.note, 200) || null;
  return p;
}
