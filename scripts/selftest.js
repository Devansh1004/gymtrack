// Logic + scheduler tests. Run: npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-test-'));
const L = await import('../shared/logic.js');
const store = await import('../server/store.js');
const push = await import('../server/push.js');
const { tick } = await import('../server/scheduler.js');
const V = await import('../server/validate.js');

let n = 0;
const t = (name, fn) => Promise.resolve(fn()).then(() => { n++; console.log('ok  ', name); }, (e) => { console.error('FAIL', name, '\n', e); process.exitCode = 1; });
const at = (date, hhmm) => new Date(`${date}T${hhmm}:00+05:30`); // IST wall-clock -> instant

await t('zonedNow converts to IST', () => {
  const z = L.zonedNow('Asia/Kolkata', new Date('2026-10-28T16:30:00Z'));
  assert.deepEqual([z.date, z.hhmm, z.dow], ['2026-10-28', '22:00', 3]);
  const m = L.zonedNow('Asia/Kolkata', new Date('2026-10-28T18:40:00Z')); // crosses midnight in IST
  assert.deepEqual([m.date, m.hhmm], ['2026-10-29', '00:10']);
  assert.equal(L.zonedNow('Not/AZone', new Date('2026-10-28T16:30:00Z')).hhmm, '22:00'); // falls back to IST
});

const base = () => ({
  settings: { workoutWeight: 40, streakMin: 70, roast: 2, nagAfter: 45, roastTime: '22:00', tz: 'Asia/Kolkata', notify: true },
  plan: { 3: { name: 'Push', time: '18:00', exercises: [{ id: 'ex1', name: 'Bench', sets: 4, reps: '8' }, { id: 'ex2', name: 'Fly', sets: 2, reps: '12' }] } },
  tasks: [
    { id: 'cre', title: 'Creatine', amount: '5 g', icon: '🧪', times: ['09:00'], days: [0, 1, 2, 3, 4, 5, 6], enabled: true },
    { id: 'wat', title: 'Water', icon: '💧', times: ['10:00', '12:00'], days: [0, 1, 2, 3, 4, 5, 6], enabled: true },
  ],
  logs: {}, created: '2026-10-01',
});

await t('score: weights and missing categories', () => {
  const u = base();
  assert.equal(L.computeScore(u, undefined, 3).score, 0);
  const log = { done: { 'cre@09:00': 1, 'wat@10:00': 1, 'wat@12:00': 1 }, workout: { ex1: 4, ex2: 2 } };
  assert.equal(L.computeScore(u, log, 3).score, 100);
  const half = { done: { 'cre@09:00': 1 }, workout: { ex1: 3 } }; // tasks 1/3, workout 3/6
  assert.equal(L.computeScore(u, half, 3).score, Math.round((0.5 * 0.4 + (1 / 3) * 0.6) * 100));
  assert.equal(L.computeScore(u, { done: { 'cre@09:00': 1 } }, 1).score, 33); // Monday: no workout -> tasks only
  assert.equal(L.computeScore({ ...u, tasks: [], plan: {} }, undefined, 1).score, null); // nothing scheduled
  assert.equal(L.computeScore(u, { workout: { ex1: 99 } }, 3).workout.done, 4); // over-count is capped
});

await t('applyLogPatch merges and deletes', () => {
  const l = L.applyLogPatch({}, { done: { a: true }, workout: { e: 2 }, weight: 70.5, note: 'hi' });
  assert.deepEqual([l.done.a, l.workout.e, l.weight, l.note], [1, 2, 70.5, 'hi']);
  L.applyLogPatch(l, { done: { a: false }, workout: { e: 0 }, weight: null, note: '' });
  assert.deepEqual([l.done, l.workout, 'weight' in l, 'note' in l], [{}, {}, false, false]);
});

await t('streak counts good days, skips rest days, today in progress never breaks', () => {
  const u = base();
  u.plan = {};
  u.tasks = [{ id: 'cre', title: 'C', times: ['09:00'], days: [1, 2, 3, 4, 5], enabled: true }]; // weekdays only
  u.created = '2026-10-19'; // Monday
  for (const d of ['2026-10-19', '2026-10-20', '2026-10-21']) u.logs[d] = { done: { 'cre@09:00': 1 } };
  // Thu 22 + Fri 23 missed, weekend off, Mon 26 + Tue 27 done
  u.logs['2026-10-26'] = { done: { 'cre@09:00': 1 } };
  u.logs['2026-10-27'] = { done: { 'cre@09:00': 1 } };
  const s = L.streaks(u, '2026-10-28'); // Wed today, not done yet
  assert.deepEqual(s, { current: 2, best: 3 });
});

await t('validators clean bad input', () => {
  const tasks = V.sanitizeTasks([{ id: 'x', title: '  Creatine ', times: ['09:00', '25:99', '09:00', '07:30'], days: [1, 1, 9, 'a'], icon: '🧪🧪🧪🧪' }, { id: 'x', title: '' }]);
  assert.deepEqual(tasks[0].times, ['07:30', '09:00']);
  assert.deepEqual(tasks[0].days, [1]);
  assert.equal(tasks[0].icon, '🧪🧪🧪');
  assert.notEqual(tasks[1].id, 'x'); // duplicate id replaced
  const plan = V.sanitizePlan({ 3: { name: 'x', time: 'bad', exercises: [{ id: 'abc', name: 'Bench', sets: 99, reps: '8', weight: '7.5' }] }, 9: { exercises: [] } });
  assert.equal(plan[3].exercises[0].sets, 20);
  assert.equal(plan[3].exercises[0].weight, 7.5);
  assert.equal(plan[3].time, '');
  assert.equal(plan[9], undefined);
  assert.deepEqual(V.sanitizeLogPatch({ done: { 'abc@09:00': 1, '../x': 1 }, weight: 9999, note: 'n' }), { done: { 'abc@09:00': true }, weight: 400, note: 'n' });
});

/* ---- scheduler ---- */
const sent = [];
push.setSender(async (sub, body) => { sent.push(JSON.parse(body)); });
const user = store.createUser('tester', 'x:y');
Object.assign(user, base(), { name: 'tester', pin: 'x:y', sessions: [], subs: [{ id: 's1', device: 'T', added: 0, sub: { endpoint: 'https://e', keys: { p256dh: 'a', auth: 'b' } } }] });
const D = '2026-10-28'; // Wednesday
const run = async (hhmm) => { sent.length = 0; await tick(at(D, hhmm)); return [...sent]; };

await t('reminder fires once at its time', async () => {
  assert.equal((await run('08:59')).length, 0);
  const a = await run('09:00');
  assert.equal(a.length, 1);
  assert.match(a[0].title, /Creatine/);
  assert.deepEqual(a[0].data.done, ['cre@09:00']);
  assert.equal((await run('09:00')).length, 0); // same minute again: deduped
  assert.equal((await run('09:01')).length, 0);
});
await t('late server still catches up within window, not beyond', async () => {
  const a = await run('10:12'); // woke up 12 min late for the 10:00 water
  assert.equal(a.length, 1);
  assert.match(a[0].title, /Water/);
  assert.equal((await run('12:30')).length, 0); // 30 min late: dropped
});
await t('nag after missed slot (once)', async () => {
  const a = await run('09:45'); // creatine still not done, 45 min after 09:00
  assert.equal(a.length, 1);
  assert.match(a[0].title, /Creatine/);
  assert.equal((await run('09:46')).length, 0);
});
await t('done tasks are not reminded', async () => {
  user.logs[D].done['wat@12:00'] = 1;
  assert.equal((await run('12:00')).length, 0);
});
await t('workout reminder at its time', async () => {
  const a = await run('18:00');
  assert.equal(a.length, 1);
  assert.match(a[0].title, /Push/);
});
await t('end-of-day roast lists pending items and stores score', async () => {
  const a = await run('22:00');
  assert.equal(a.length, 1);
  assert.match(a[0].title, /Today's score: \d+%/);
  assert.match(a[0].body, /Pending: .*Workout/);
  assert.equal(typeof user.logs[D].score, 'number');
  assert.equal((await run('22:01')).length, 0);
});
await t('perfect day gets praise; roast off gets neutral summary; notify off sends nothing', async () => {
  const D2 = '2026-10-29'; // Thursday, no workout
  const go = async (hhmm) => { sent.length = 0; await tick(at(D2, hhmm)); return [...sent]; };
  user.logs[D2] = { done: { 'cre@09:00': 1, 'wat@10:00': 1, 'wat@12:00': 1 }, workout: {} };
  const a = await go('22:00');
  assert.match(a[0].title, /Perfect/);
  const D3 = '2026-10-30';
  user.settings.roast = 0;
  sent.length = 0; await tick(at(D3, '22:00'));
  assert.match(sent[0].title, /^Today's score: 0%/);
  user.settings.notify = false;
  sent.length = 0; await tick(at('2026-10-31', '09:00'));
  assert.equal(sent.length, 0);
});
await t('dead subscriptions are pruned', async () => {
  user.settings.notify = true; user.settings.roast = 2;
  push.setSender(async () => { const e = new Error('gone'); e.statusCode = 410; throw e; });
  await tick(at('2026-11-01', '09:00'));
  assert.equal(user.subs.length, 0);
});

store.flushAll();
console.log(process.exitCode ? '\nSOME TESTS FAILED' : `\nall ${n} tests passed`);
