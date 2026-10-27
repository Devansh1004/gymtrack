// Used by BOTH server and client: one source of truth for dates, scoring and message lines.

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAYS2 = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon-first display order
export const DEFAULT_TZ = 'Asia/Kolkata';

/* ---------- dates ---------- */
const fmts = new Map();
function fmtFor(tz) {
  let f = fmts.get(tz);
  if (!f) {
    const o = { hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
    try { f = new Intl.DateTimeFormat('en-CA', { ...o, timeZone: tz }); }
    catch { f = new Intl.DateTimeFormat('en-CA', { ...o, timeZone: DEFAULT_TZ }); }
    fmts.set(tz, f);
  }
  return f;
}
export const dowOf = (date) => new Date(date + 'T00:00:00Z').getUTCDay();
export function addDays(date, n) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const toMin = (hhmm) => { const [h, m] = hhmm.split(':'); return +h * 60 + +m; };
export function zonedNow(tz = DEFAULT_TZ, d = new Date()) {
  const p = {};
  for (const { type, value } of fmtFor(tz).formatToParts(d)) p[type] = value;
  const hh = p.hour === '24' ? '00' : p.hour;
  const date = `${p.year}-${p.month}-${p.day}`;
  return { date, hhmm: `${hh}:${p.minute}`, minutes: +hh * 60 + +p.minute, dow: dowOf(date) };
}
export function fmtDate(date) {
  const d = new Date(date + 'T00:00:00Z');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/* ---------- schedule + score ---------- */
// A "slot" = one task at one time on a given weekday. Tasks without times are one "anytime" slot.
export function slotsFor(tasks, dow) {
  const out = [];
  for (const t of tasks || []) {
    if (t.enabled === false || !t.days?.includes(dow)) continue;
    const times = t.times?.length ? t.times : [''];
    for (const time of times) out.push({ key: `${t.id}@${time}`, id: t.id, title: t.title, amount: t.amount, icon: t.icon, time });
  }
  return out.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
}
export const workoutFor = (plan, dow) => {
  const d = plan?.[dow];
  return d && d.exercises?.length ? d : null;
};

export function computeScore({ plan, tasks, settings }, log, dow) {
  const slots = slotsFor(tasks, dow);
  const w = workoutFor(plan, dow);
  const done = log?.done || {};
  const wk = log?.workout || {};
  let tDone = 0;
  for (const s of slots) if (done[s.key]) tDone++;
  let wTot = 0, wDone = 0;
  if (w) for (const e of w.exercises) { wTot += e.sets; wDone += Math.min(wk[e.id] || 0, e.sets); }
  const tp = slots.length ? tDone / slots.length : null;
  const wp = wTot ? wDone / wTot : null;
  let s;
  if (tp === null && wp === null) s = null;
  else if (tp === null) s = wp;
  else if (wp === null) s = tp;
  else { const ww = (settings?.workoutWeight ?? 40) / 100; s = wp * ww + tp * (1 - ww); }
  return {
    score: s === null ? null : Math.round(s * 100),
    tasks: { done: tDone, total: slots.length },
    workout: { done: wDone, total: wTot },
  };
}

// Same merge rules on server and client so optimistic UI == stored data.
export function applyLogPatch(log, p) {
  log.done ||= {};
  log.workout ||= {};
  if (p.done) for (const [k, v] of Object.entries(p.done)) { if (v) log.done[k] = 1; else delete log.done[k]; }
  if (p.workout) for (const [k, v] of Object.entries(p.workout)) { if (v > 0) log.workout[k] = v; else delete log.workout[k]; }
  for (const f of ['weight', 'height', 'note']) {
    if (f in p) { if (p[f] === null || p[f] === '') delete log[f]; else log[f] = p[f]; }
  }
  return log;
}

export function dayScore(user, date) {
  const l = user.logs?.[date];
  if (l && l.score !== undefined) return l.score;
  return computeScore(user, l, dowOf(date)).score;
}

// Earliest day we have data for (account creation, or an older backfilled log).
export function firstDay(user) {
  let f = user.created || '9999-12-31';
  for (const d of Object.keys(user.logs || {})) if (d < f) f = d;
  return f;
}

// Streak = consecutive scheduled days with score >= streakMin. Rest days are skipped; today in progress never breaks it.
export function streaks(user, today) {
  const min = user.settings?.streakMin ?? 70;
  const f0 = firstDay(user);
  const first = f0 > addDays(today, -400) ? f0 : addDays(today, -400);
  let run = 0, best = 0;
  for (let d = first; d <= today; d = addDays(d, 1)) {
    const s = dayScore(user, d);
    if (s === null) continue;
    if (d === today && s < min) continue;
    if (s >= min) run++; else run = 0;
    if (run > best) best = run;
  }
  return { current: run, best };
}

/* ---------- message lines. {n} = pending count, {score} = score %, {title} = task ---------- */
export const ROASTS = {
  1: [
    'A bit slow today, {n} things left undone. Tomorrow, for real? 💪',
    'Score {score}%. No worries, we get back on track tomorrow.',
    '{n} items still pending. There is still time, just a small push!',
    'Show your body some love, {n} things are pending 🙂',
    'Almost there... {n} tasks left. One last effort?',
  ],
  2: [
    'You will not build a body without consistency 🙃',
    '{n} things skipped. Wow, what discipline.',
    'Score {score}%. Motivation is not just for Mondays, you need it every day.',
    'The protein shaker is wondering where its owner went.',
    "Today's plan: start tomorrow. Tomorrow's plan: start the day after. 👏",
    '{n} pending. A lot of effort today... mostly spent finding excuses.',
    "Your body: 'I want gains too.' You: 'Let's see tomorrow.'",
    "When you look in the mirror tomorrow, you'll remember what you skipped today.",
  ],
  3: [
    'Did nothing productive today. Proud of you though. Sort of. 🫡',
    'Score {score}%. Even your gym membership feels sorry for you.',
    '{n} tasks skipped. Your consistency is flakier than public WiFi.',
    'Your creatine tub has become a dust collector. Congratulations. 🏆',
    'No gains are coming, but your supply of excuses is a lifetime one.',
    'Still no lifting today? The heaviest thing in your house is your excuse.',
    "You didn't even drink water. Your body is dehydrated, and maybe your brain already was.",
    'You show Netflix this much consistency. Show some to the gym. {n} pending!',
  ],
};
export const NAGS = {
  1: ['{title} is overdue. Do it now, it only takes two minutes!', '{title} is still pending. It is a small thing, just do it 🙂'],
  2: ['{title} still not done. No problem, your body will wait... probably.', '{title}? Is the "starting tomorrow" plan running again? 🙃'],
  3: ['{title} not done. Too busy... on Instagram? 😌', 'New record: ignoring {title}. Well done. 👏'],
};
export const PRAISE = [
  'Perfect {score}% today! Show the same tomorrow 🔥',
  'Full marks. Even your body is happy today 💪',
  'A clean sheet all day. You earned it, well done! 👏',
];

const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export function pickLine(pool, seed, vars = {}) {
  const i = seed == null ? Math.floor(Math.random() * pool.length) : hashStr(String(seed)) % pool.length;
  return pool[i].replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}
