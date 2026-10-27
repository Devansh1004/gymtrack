// Server-renders every screen with realistic data to catch crashes. Run: npm test
import { createServer } from 'vite';
import React from 'react';
import { renderToString } from 'react-dom/server';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
let failed = 0;
try {
  const { zonedNow } = await vite.ssrLoadModule('/shared/logic.js');
  const now = zonedNow('Asia/Kolkata');
  const mods = {
    Today: (await vite.ssrLoadModule('/src/Today.jsx')).default,
    Plan: (await vite.ssrLoadModule('/src/Plan.jsx')).default,
    Tasks: (await vite.ssrLoadModule('/src/Tasks.jsx')).default,
    Progress: (await vite.ssrLoadModule('/src/Progress.jsx')).default,
    Settings: (await vite.ssrLoadModule('/src/Settings.jsx')).default,
    Login: (await vite.ssrLoadModule('/src/Login.jsx')).default,
  };
  const allDays = [0, 1, 2, 3, 4, 5, 6];
  const ex = [{ id: 'e1', name: 'Bench Press', sets: 4, reps: '8-10', weight: 60, note: 'slow negatives' }, { id: 'e2', name: 'Fly', sets: 3, reps: '12', weight: '', note: '' }];
  const plan = Object.fromEntries(allDays.map((d) => [d, { name: 'Push', time: '18:00', exercises: ex }]));
  const mk = (date, i) => ({ done: { 'cre@09:00': 1 }, workout: { e1: 4, e2: i % 3 }, weight: 70 + i / 4, score: 40 + i * 3 });
  const logs = {};
  for (let i = 0; i < 20; i++) { const d = new Date(Date.parse(now.date) - i * 864e5).toISOString().slice(0, 10); logs[d] = mk(d, i); }
  const data = {
    user: 'tester', created: '2026-09-01', vapid: 'x',
    settings: { tz: 'Asia/Kolkata', notify: true, roast: 3, roastTime: '00:01', nagAfter: 45, workoutWeight: 40, streakMin: 70, height: 178 },
    plan,
    tasks: [
      { id: 'cre', title: 'Creatine', amount: '5 g', icon: '🧪', times: ['09:00'], days: allDays, enabled: true },
      { id: 'wat', title: 'Water', icon: '💧', times: ['10:00', '12:00', '14:00'], days: allDays, enabled: true },
      { id: 'goal', title: 'Protein 120g', icon: '🎯', times: [], days: [1, 2], enabled: false },
    ],
    logs, devices: [{ id: 'd1', device: 'Android Chrome', added: 0 }],
  };
  const noop = () => {};
  const act = { setSettings: noop, setPlan: noop, setTasks: noop, patchLog: noop, setDevices: noop };
  const app = (over = {}) => ({ data, now, act, toast: noop, load: noop, logout: noop, enable: noop, disable: noop, goto: noop, viewDate: null, setViewDate: noop, pstate: { supported: true, perm: 'default', subscribed: false }, ...over });
  const cases = [
    ['Today (roast shown)', 'Today', app()],
    ['Today (empty data)', 'Today', app({ data: { ...data, plan: {}, tasks: [], logs: {} } })],
    ['Today (past day)', 'Today', app({ viewDate: Object.keys(logs)[3] })],
    ['Plan', 'Plan', app()],
    ['Plan (empty)', 'Plan', app({ data: { ...data, plan: {} } })],
    ['Tasks', 'Tasks', app()],
    ['Tasks (empty)', 'Tasks', app({ data: { ...data, tasks: [] } })],
    ['Progress', 'Progress', app()],
    ['Progress (no logs)', 'Progress', app({ data: { ...data, logs: {} } })],
    ['Settings', 'Settings', app()],
    ['Settings (no push)', 'Settings', app({ pstate: { supported: false, perm: 'unsupported', subscribed: false } })],
  ];
  for (const [name, comp, props] of cases) {
    try {
      const html = renderToString(React.createElement(mods[comp], { app: props }));
      if (html.length < 50) throw new Error('empty render');
      console.log('ok  ', name, `(${html.length} bytes)`);
    } catch (e) { failed++; console.error('FAIL', name, '\n', e); }
  }
  try { renderToString(React.createElement(mods.Login, { onAuthed: noop })); console.log('ok   Login'); } catch (e) { failed++; console.error('FAIL Login', e); }
} finally { await vite.close(); }
if (failed) { console.error(`\n${failed} render test(s) failed`); process.exit(1); }
console.log('\nall screens render');
