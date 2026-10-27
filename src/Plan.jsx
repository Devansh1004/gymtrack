import React, { useState } from 'react';
import { DAYS, DAY_ORDER } from '../shared/logic.js';
import { EXERCISES, TEMPLATES, uid } from '../shared/defaults.js';
import { Stepper } from './ui.jsx';

const blank = () => ({ id: uid(), name: '', sets: 3, reps: '10', weight: '', note: '' });
const withIds = (list) => list.map((e) => ({ ...e, id: uid() }));

export default function Plan({ app }) {
  const { data, act, now } = app;
  const [day, setDay] = useState(now.dow);
  const d = data.plan[day] || { name: '', time: '', exercises: [] };
  const save = (nd) => act.setPlan({ ...data.plan, [day]: nd });
  const setEx = (i, p) => save({ ...d, exercises: d.exercises.map((e, j) => (j === i ? { ...e, ...p } : e)) });
  const move = (i, dir) => {
    const a = [...d.exercises];
    [a[i], a[i + dir]] = [a[i + dir], a[i]];
    save({ ...d, exercises: a });
  };
  const del = (i) => save({ ...d, exercises: d.exercises.filter((_, j) => j !== i) });
  const applyTemplate = (key) => { const t = TEMPLATES[key]; save({ ...d, name: d.name || t.name, exercises: [...d.exercises, ...withIds(t.exercises)] }); };
  const copyFrom = (src) => { const s = data.plan[src]; if (s) save({ name: s.name, time: s.time, exercises: withIds(s.exercises) }); };
  const clearDay = () => { if (window.confirm("Remove this day's whole workout?")) { const p = { ...data.plan }; delete p[day]; act.setPlan(p); } };
  const copySources = DAY_ORDER.filter((x) => x !== day && data.plan[x]?.exercises?.length);

  return (
    <>
      <div className="days" role="group" aria-label="Choose a day" style={{ marginBottom: 12 }}>
        {DAY_ORDER.map((x) => (
          <button key={x} className={'day' + (data.plan[x]?.exercises?.length ? ' has' : '')} aria-pressed={day === x} onClick={() => setDay(x)}>{DAYS[x]}</button>
        ))}
      </div>

      <section className="card">
        <div className="grid2">
          <label className="f">Day name
            <input className="inp" value={d.name} maxLength={40} placeholder="Chest + Triceps" onChange={(e) => save({ ...d, name: e.target.value })} />
          </label>
          <label className="f">Reminder time
            <input className="inp" type="time" value={d.time} onChange={(e) => save({ ...d, time: e.target.value })} />
          </label>
        </div>
        <p className="mute small" style={{ marginTop: 8, marginBottom: 0 }}>Leave the time empty to skip the workout reminder on this day.</p>
      </section>

      {!d.exercises.length && <p className="mute" style={{ margin: '4px 2px 12px' }}>{DAYS[day]} is a rest day for now. Add an exercise or start from a template below.</p>}

      {d.exercises.map((e, i) => (
        <div className="exc" key={e.id}>
          <div className="row">
            <input className="inp grow" list="exlist" value={e.name} maxLength={50} placeholder="Exercise name" aria-label="Exercise name" onChange={(ev) => setEx(i, { name: ev.target.value })} />
            <button className="ico" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
            <button className="ico" aria-label="Move down" disabled={i === d.exercises.length - 1} onClick={() => move(i, 1)}>↓</button>
            <button className="ico bad-t" aria-label="Remove exercise" onClick={() => del(i)}>✕</button>
          </div>
          <div className="grid3">
            <label className="f">Sets<Stepper value={e.sets} label="Sets" onChange={(v) => setEx(i, { sets: v })} /></label>
            <label className="f">Reps<input className="inp" value={e.reps} maxLength={12} placeholder="10 or 8-12" onChange={(ev) => setEx(i, { reps: ev.target.value })} /></label>
            <label className="f">Weight (kg)<input className="inp" inputMode="decimal" value={e.weight ?? ''} placeholder="--" onChange={(ev) => setEx(i, { weight: ev.target.value })} /></label>
          </div>
          <input className="inp sm" value={e.note || ''} maxLength={80} placeholder="Note (tempo, rest, form...)" aria-label="Note" onChange={(ev) => setEx(i, { note: ev.target.value })} />
        </div>
      ))}
      <datalist id="exlist">{EXERCISES.map((x) => <option key={x} value={x} />)}</datalist>

      <button className="btn full" onClick={() => save({ ...d, exercises: [...d.exercises, blank()] })}>+ Add exercise</button>

      <section className="card" style={{ marginTop: 14 }}>
        <h3>Start from a template</h3>
        <div className="row wrap">
          {Object.keys(TEMPLATES).map((k) => <button key={k} className="btn ghost sm" onClick={() => applyTemplate(k)}>{k}</button>)}
        </div>
        {copySources.length > 0 && (
          <>
            <h3 style={{ marginTop: 14 }}>Copy from another day</h3>
            <div className="row wrap">
              {copySources.map((x) => <button key={x} className="btn ghost sm" onClick={() => copyFrom(x)}>{DAYS[x]}</button>)}
            </div>
          </>
        )}
        {(d.exercises.length > 0 || d.name) && <button className="btn bad sm" style={{ marginTop: 14 }} onClick={clearDay}>Make this a rest day</button>}
      </section>
    </>
  );
}
