import { zonedNow, slotsFor, workoutFor, computeScore, toMin, pickLine, ROASTS, NAGS, PRAISE } from '../shared/logic.js';
import * as store from './store.js';
import { sendToUser } from './push.js';

// A reminder missed by a sleeping server is still sent if it is at most this many minutes late.
const CATCHUP = 20;
const EOD_WINDOW = 45;

export async function tick(date = new Date()) {
  for (const user of store.allUsers()) {
    try { await tickUser(user, date); } catch (e) { console.error('tick', user.name, e); }
  }
}

async function tickUser(user, date) {
  const s = user.settings;
  if (!s.notify || !user.subs.length) return;
  const now = zonedNow(s.tz, date);
  const log = user.logs[now.date];
  const fired = log?.notified || {};
  const done = log?.done || {};
  const out = [];
  const marks = [];
  const level = s.roast;

  // 1) timed task reminders (grouped per time) + one nag per missed slot
  const due = new Map();
  const nags = [];
  for (const sl of slotsFor(user.tasks, now.dow)) {
    if (!sl.time || done[sl.key]) continue;
    const diff = now.minutes - toMin(sl.time);
    if (diff >= 0 && diff <= CATCHUP && !fired['t:' + sl.key]) {
      if (!due.has(sl.time)) due.set(sl.time, []);
      due.get(sl.time).push(sl);
      marks.push('t:' + sl.key);
    } else if (level > 0 && s.nagAfter > 0 && diff >= s.nagAfter && diff <= s.nagAfter + CATCHUP && !fired['n:' + sl.key]) {
      nags.push(sl);
      marks.push('n:' + sl.key);
    }
  }
  for (const [time, list] of due) {
    const one = list.length === 1 ? list[0] : null;
    out.push({
      title: one ? `${one.icon} ${one.title}` : `⏰ ${time}: ${list.length} things to do`,
      body: one
        ? `Time for ${one.title}${one.amount ? ` (${one.amount})` : ''}. Do it and tick it off ✅`
        : list.map((x) => x.title).join(' • '),
      tag: `t-${now.date}-${time}`,
      data: { done: list.map((x) => x.key), date: now.date },
    });
  }
  for (const sl of nags) {
    out.push({ title: `😏 ${sl.title}`, body: pickLine(NAGS[level], null, { title: sl.title }), tag: `n-${now.date}-${sl.key}`, data: { done: [sl.key], date: now.date } });
  }

  // 2) workout reminder + nag
  const wp = workoutFor(user.plan, now.dow);
  const sc = computeScore(user, log, now.dow);
  if (wp?.time && sc.workout.done < sc.workout.total) {
    const diff = now.minutes - toMin(wp.time);
    if (diff >= 0 && diff <= CATCHUP && !fired.w) {
      const names = wp.exercises.slice(0, 3).map((e) => e.name).join(', ');
      out.push({ title: `🏋️ ${wp.name || 'Workout'} time`, body: `${wp.exercises.length} exercises: ${names}${wp.exercises.length > 3 ? '...' : ''}. Time to lift.`, tag: `w-${now.date}`, data: { date: now.date } });
      marks.push('w');
    } else if (level > 0 && s.nagAfter > 0 && diff >= s.nagAfter && diff <= s.nagAfter + CATCHUP && !fired.wn) {
      out.push({ title: '😏 Workout', body: pickLine(NAGS[level], null, { title: wp.name || 'Workout' }), tag: `wn-${now.date}`, data: { date: now.date } });
      marks.push('wn');
    }
  }

  // 3) end of day: roast the leftovers, or praise a clean sheet
  const eodDiff = now.minutes - toMin(s.roastTime);
  if (eodDiff >= 0 && eodDiff <= EOD_WINDOW && !fired.eod && sc.score !== null) {
    const missed = slotsFor(user.tasks, now.dow).filter((x) => !done[x.key]).map((x) => x.title);
    if (wp && sc.workout.done < sc.workout.total) missed.unshift('Workout');
    if (sc.score >= 100) {
      out.push({ title: '🏆 Perfect day', body: pickLine(PRAISE, null, { score: sc.score }), tag: `eod-${now.date}`, data: { date: now.date } });
    } else if (level > 0) {
      const line = pickLine(ROASTS[level], null, { n: missed.length, score: sc.score });
      const list = missed.slice(0, 4).join(', ') + (missed.length > 4 ? ` +${missed.length - 4} more` : '');
      out.push({ title: `😏 Today's score: ${sc.score}%`, body: `${line}\nPending: ${list}`, tag: `eod-${now.date}`, data: { date: now.date } });
    } else {
      out.push({ title: `Today's score: ${sc.score}%`, body: `${sc.tasks.done}/${sc.tasks.total} tasks, ${sc.workout.done}/${sc.workout.total} sets done.`, tag: `eod-${now.date}`, data: { date: now.date } });
    }
    marks.push('eod');
  }

  if (!marks.length) return;
  const l = (user.logs[now.date] ||= { done: {}, workout: {} });
  l.notified = { ...(l.notified || {}), ...Object.fromEntries(marks.map((m) => [m, 1])) };
  if (marks.includes('eod')) l.score = sc.score;
  for (const [d, x] of Object.entries(user.logs)) if (d !== now.date && x.notified) delete x.notified; // keep files small
  store.save(user);
  for (const n of out) await sendToUser(user, n);
}
