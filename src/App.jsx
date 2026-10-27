import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from './api.js';
import { createSync } from './sync.js';
import { pushSupported, getSub, enablePush, deviceName } from './webpush.js';
import { zonedNow, computeScore, dowOf, applyLogPatch } from '../shared/logic.js';
import { Icon } from './ui.jsx';
import Login from './Login.jsx';
import Today from './Today.jsx';
import Plan from './Plan.jsx';
import Tasks from './Tasks.jsx';
import Progress from './Progress.jsx';
import Settings from './Settings.jsx';

const CACHE = 'gym.cache';
const loadCache = () => { try { return api.getToken() ? JSON.parse(localStorage.getItem(CACHE)) : null; } catch { return null; } };
const saveCache = (d) => { try { localStorage.setItem(CACHE, JSON.stringify(d)); } catch { /* full/private */ } };
const KEY_RE = /^[A-Za-z0-9]{3,16}@(?:\d\d:\d\d)?$/;

// Opened from a "Done" button on a notification: /?done=key1,key2&d=2026-10-28
function readDoneParam() {
  const q = new URLSearchParams(location.search);
  const d = q.get('done');
  if (!d) return null;
  const date = q.get('d') || '';
  history.replaceState(null, '', '/');
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? { keys: d.split(',').filter((k) => KEY_RE.test(k)), date } : null;
}

function useClock(tz) {
  const [now, setNow] = useState(() => zonedNow(tz));
  useEffect(() => {
    const tick = () => setNow((p) => { const n = zonedNow(tz); return n.date === p.date && n.hhmm === p.hhmm ? p : n; });
    tick();
    const t = setInterval(tick, 15000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, [tz]);
  return now;
}

const TABS = [['today', 'Today'], ['plan', 'Workout'], ['tasks', 'Tasks'], ['progress', 'Progress'], ['settings', 'Settings']];

export default function App() {
  const [authed, setAuthed] = useState(!!api.getToken());
  const [data, setData] = useState(loadCache);
  const [sync, setSync] = useState('ok');
  const [tab, setTab] = useState('today');
  const [viewDate, setViewDate] = useState(null);
  const [toastMsg, setToastMsg] = useState('');
  const [pstate, setPstate] = useState({ supported: pushSupported(), perm: pushSupported() ? Notification.permission : 'unsupported', subscribed: false });
  const dataRef = useRef(data);
  dataRef.current = data;
  const S = useRef(null);
  if (!S.current) S.current = createSync(setSync);
  const pendingDone = useRef(null);
  if (pendingDone.current === null) pendingDone.current = readDoneParam() || false;
  const toastTimer = useRef(0);

  const now = useClock(data?.settings?.tz);
  const toast = useCallback((m) => { setToastMsg(m); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToastMsg(''), 3200); }, []);
  const update = useCallback((fn) => { const n = fn(dataRef.current); dataRef.current = n; setData(n); saveCache(n); return n; }, []);

  const act = useMemo(() => ({
    setSettings(patch) { update((d) => ({ ...d, settings: { ...d.settings, ...patch } })); S.current.queue('settings', () => api.putSettings(dataRef.current.settings), 700); },
    setPlan(plan) { update((d) => ({ ...d, plan })); S.current.queue('plan', () => api.putPlan(dataRef.current.plan), 900); },
    setTasks(tasks) { update((d) => ({ ...d, tasks })); S.current.queue('tasks', () => api.putTasks(dataRef.current.tasks), 900); },
    patchLog(date, patch) {
      const p = { ...patch };
      for (const f of ['weight', 'height']) if (f in p && !(typeof p[f] === 'number' && Number.isFinite(p[f]))) p[f] = null;
      update((d) => {
        const old = d.logs[date] || { done: {}, workout: {} };
        const log = applyLogPatch({ ...old, done: { ...old.done }, workout: { ...old.workout } }, p);
        log.score = computeScore(d, log, dowOf(date)).score;
        return { ...d, logs: { ...d.logs, [date]: log } };
      });
      S.current.log(date, p);
    },
    setDevices(devices) { update((d) => ({ ...d, devices })); },
  }), [update]);

  const refreshPush = useCallback(async () => {
    if (!pushSupported()) return;
    const sub = await getSub().catch(() => null);
    setPstate({ supported: true, perm: Notification.permission, subscribed: !!sub });
  }, []);

  const applyDone = useCallback((keys, date) => {
    if (!keys?.length) return;
    act.patchLog(date, { done: Object.fromEntries(keys.map((k) => [k, true])) });
    toast('Marked as done ✅');
  }, [act, toast]);

  const load = useCallback(async () => {
    try {
      const s = await api.getState();
      update(() => s);
      if (pendingDone.current) { const p = pendingDone.current; pendingDone.current = false; applyDone(p.keys, p.date); }
      if (pushSupported() && Notification.permission === 'granted') { // keep this device registered after login / server restore
        const sub = await getSub();
        if (sub) { const r = await api.subscribe(sub.toJSON(), deviceName()); try { localStorage.setItem('gym.dev', r.id); } catch { /* ignore */ } act.setDevices(r.devices); }
      }
      refreshPush();
    } catch (e) { if (e.status !== 401) toast('Could not reach the server. Showing saved data.'); }
  }, [update, applyDone, act, refreshPush, toast]);

  useEffect(() => { api.setOnUnauth(() => { setAuthed(false); setData(null); }); }, []);
  useEffect(() => { if (authed) load(); }, [authed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!authed) return undefined;
    const vis = () => {
      if (document.visibilityState === 'hidden') S.current.flush();
      else if (S.current.idle()) load();
    };
    const msg = (ev) => { if (ev.data?.type === 'done') applyDone(ev.data.keys, ev.data.date); };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('pagehide', S.current.flush);
    navigator.serviceWorker?.addEventListener('message', msg);
    return () => { document.removeEventListener('visibilitychange', vis); window.removeEventListener('pagehide', S.current.flush); navigator.serviceWorker?.removeEventListener('message', msg); };
  }, [authed, load, applyDone]);

  async function enable() {
    try {
      const r = await enablePush(dataRef.current.vapid);
      try { localStorage.setItem('gym.dev', r.id); } catch { /* ignore */ }
      act.setDevices(r.devices);
      await refreshPush();
      toast('Notifications turned on for this device ✅');
    } catch (e) { toast(e.message || 'Could not turn on notifications'); refreshPush(); }
  }
  async function disable() {
    try {
      const sub = await getSub();
      if (sub) await sub.unsubscribe();
      const id = localStorage.getItem('gym.dev');
      if (id) act.setDevices((await api.removeDevice(id)).devices);
    } catch { /* ignore */ }
    refreshPush();
  }
  async function logout() {
    S.current.flush();
    const sub = await getSub().catch(() => null);
    try { await api.logout(sub?.endpoint); } catch { /* offline: token just gets dropped locally */ }
    api.setToken('');
    try { localStorage.removeItem(CACHE); } catch { /* ignore */ }
    setAuthed(false); setData(null); setTab('today'); setViewDate(null);
  }

  if (!authed) return <Login onAuthed={() => setAuthed(true)} />;
  if (!data) return <div className="boot">Loading…</div>;

  const app = {
    data, now, act, toast, load, logout, pstate, enable, disable, viewDate, setViewDate,
    goto: (t, d) => { if (d !== undefined) setViewDate(d); setTab(t); window.scrollTo(0, 0); },
  };
  const syncText = sync === 'err' ? 'Not saving, retrying…' : sync === 'saving' ? 'Saving…' : 'Saved';

  return (
    <>
      <main className="app">
        <div className="bar"><h1>{data.user}</h1><span className={'sync' + (sync === 'err' ? ' err' : '')} aria-live="polite">{syncText}</span></div>
        {tab === 'today' && <Today app={app} />}
        {tab === 'plan' && <Plan app={app} />}
        {tab === 'tasks' && <Tasks app={app} />}
        {tab === 'progress' && <Progress app={app} />}
        {tab === 'settings' && <Settings app={app} />}
      </main>
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
      <nav className="nav" aria-label="Main">
        <div>
          {TABS.map(([k, l]) => (
            <button key={k} aria-current={tab === k ? 'page' : undefined} onClick={() => { if (k === 'today') setViewDate(null); setTab(k); window.scrollTo(0, 0); }}>
              <Icon n={k === 'today' ? 'today' : k} /><span>{l}</span>
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
