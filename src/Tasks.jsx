import React, { useState } from 'react';
import { DAYS2, DAY_ORDER, toMin } from '../shared/logic.js';
import { PRESETS, newTask } from '../shared/defaults.js';
import { Switch } from './ui.jsx';

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function TaskCard({ t, open, onOpen, onChange, onDelete }) {
  const [rng, setRng] = useState({ from: '08:00', to: '22:00', every: 2 });
  const set = (p) => onChange({ ...t, ...p });
  const gen = () => {
    const a = toMin(rng.from), b = toMin(rng.to), step = Math.max(15, Math.round(rng.every * 60));
    const out = [];
    for (let m = a; m <= b && out.length < 24; m += step) out.push(hhmm(m));
    if (out.length) set({ times: out });
  };
  const daysText = t.days.length === 7 ? 'daily' : t.days.length ? DAY_ORDER.filter((x) => t.days.includes(x)).map((x) => DAYS2[x]).join(' ') : 'no days';

  return (
    <div className={'tcard' + (t.enabled ? '' : ' off')}>
      <button className="thead" aria-expanded={open} onClick={onOpen}>
        <span className="big">{t.icon}</span>
        <span className="grow">
          <b>{t.title || 'New task'}</b>{t.amount && <span className="mute small"> · {t.amount}</span>}
          <span className="mute small" style={{ display: 'block' }}>{t.times.length ? [...t.times].sort().join(' · ') : 'anytime'} — {daysText}</span>
        </span>
        <span className="mute">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="col" style={{ marginTop: 10 }}>
          <div className="row">
            <input className="inp" style={{ width: 64, textAlign: 'center' }} value={t.icon} maxLength={4} aria-label="Emoji" onChange={(e) => set({ icon: e.target.value })} />
            <input className="inp grow" value={t.title} maxLength={40} placeholder="Name (Creatine, Water...)" aria-label="Name" onChange={(e) => set({ title: e.target.value })} />
          </div>
          <label className="f">Amount / detail
            <input className="inp" value={t.amount} maxLength={30} placeholder="5 g, 1 scoop, 500 ml" onChange={(e) => set({ amount: e.target.value })} />
          </label>

          <div className="f">Reminder times (leave empty for an all-day goal with no notification)
            <div className="chips">
              {t.times.map((tm, i) => (
                <span className="chip" key={i}>
                  <input type="time" value={tm} aria-label={`Time ${i + 1}`} onChange={(e) => set({ times: t.times.map((x, j) => (j === i ? e.target.value : x)) })} />
                  <button aria-label="Remove time" onClick={() => set({ times: t.times.filter((_, j) => j !== i) })}>✕</button>
                </span>
              ))}
              <button className="btn ghost sm" onClick={() => set({ times: [...t.times, '12:00'] })}>+ time</button>
            </div>
          </div>

          <div className="f">Repeat every N hours (e.g. water)
            <div className="row wrap">
              <input className="inp sm" type="time" style={{ width: 128 }} value={rng.from} aria-label="Start" onChange={(e) => setRng({ ...rng, from: e.target.value })} />
              <span>to</span>
              <input className="inp sm" type="time" style={{ width: 128 }} value={rng.to} aria-label="End" onChange={(e) => setRng({ ...rng, to: e.target.value })} />
              <span>every</span>
              <input className="inp sm" type="number" min="0.25" step="0.25" style={{ width: 70 }} value={rng.every} aria-label="Hours" onChange={(e) => setRng({ ...rng, every: +e.target.value || 1 })} />
              <span>hours</span>
              <button className="btn sm" onClick={gen}>Generate times</button>
            </div>
          </div>

          <div className="f">On these days
            <div className="days">
              {DAY_ORDER.map((x) => (
                <button key={x} className="day" aria-pressed={t.days.includes(x)} onClick={() => set({ days: t.days.includes(x) ? t.days.filter((y) => y !== x) : [...t.days, x].sort() })}>{DAYS2[x]}</button>
              ))}
              <button className="btn ghost sm" onClick={() => set({ days: [0, 1, 2, 3, 4, 5, 6] })}>Daily</button>
            </div>
          </div>

          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="row">Active <Switch on={t.enabled} label="Active" onChange={(v) => set({ enabled: v })} /></span>
            <button className="btn bad sm" onClick={onDelete}>Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Tasks({ app }) {
  const { data, act } = app;
  const [openId, setOpenId] = useState(null);
  const add = (p) => { const t = newTask(p); act.setTasks([...data.tasks, t]); setOpenId(t.id); };

  return (
    <>
      <section className="card">
        <div className="card-h"><h2>Daily tasks</h2><span className="pill">{data.tasks.length}</span></div>
        {!data.tasks.length && <p className="mute">No tasks yet. Add a preset below or create your own.</p>}
        {data.tasks.map((t) => (
          <TaskCard key={t.id} t={t} open={openId === t.id} onOpen={() => setOpenId(openId === t.id ? null : t.id)}
            onChange={(nt) => act.setTasks(data.tasks.map((x) => (x.id === t.id ? nt : x)))}
            onDelete={() => { if (window.confirm(`Delete "${t.title || 'this task'}"?`)) act.setTasks(data.tasks.filter((x) => x.id !== t.id)); }} />
        ))}
      </section>

      <section className="card">
        <h3>Quick add</h3>
        <div className="row wrap">
          {PRESETS.map((p) => <button key={p.title} className="btn ghost sm" onClick={() => add(p)}>{p.icon} {p.title}</button>)}
          <button className="btn sm" onClick={() => add({})}>+ Custom task</button>
        </div>
      </section>
    </>
  );
}
