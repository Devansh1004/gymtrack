import React, { useMemo, useState } from 'react';
import { addDays, computeScore, dowOf, fmtDate, pickLine, ROASTS, PRAISE, slotsFor, streaks, toMin, workoutFor } from '../shared/logic.js';
import { Plate } from './ui.jsx';

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function BodyCard({ date, log, data, act }) {
  const [w, setW] = useState(log.weight ?? '');
  const [h, setH] = useState(log.height ?? '');
  const [n, setN] = useState(log.note ?? '');
  return (
    <section className="card">
      <div className="card-h"><h2>Body log</h2></div>
      <div className="grid2">
        <label className="f">Weight (kg)
          <input className="inp" inputMode="decimal" value={w} placeholder="--" onChange={(e) => { setW(e.target.value); act.patchLog(date, { weight: e.target.value === '' ? null : parseFloat(e.target.value) }); }} />
        </label>
        <label className="f">Height (cm)
          <input className="inp" inputMode="decimal" value={h} placeholder={data.settings.height ? String(data.settings.height) : '--'} onChange={(e) => { setH(e.target.value); act.patchLog(date, { height: e.target.value === '' ? null : parseFloat(e.target.value) }); }} />
        </label>
      </div>
      <label className="f" style={{ marginTop: 10 }}>Note
        <input className="inp" value={n} maxLength={200} placeholder="Sleep, mood, anything" onChange={(e) => { setN(e.target.value); act.patchLog(date, { note: e.target.value }); }} />
      </label>
    </section>
  );
}

export default function Today({ app }) {
  const { data, now, act, viewDate, setViewDate, pstate, enable } = app;
  const date = viewDate || now.date;
  const isToday = date === now.date;
  const dow = dowOf(date);
  const log = data.logs[date] || { done: {}, workout: {} };
  const slots = slotsFor(data.tasks, dow);
  const wk = workoutFor(data.plan, dow);
  const sc = computeScore(data, log, dow);
  const st = useMemo(() => streaks(data, now.date), [data.logs, data.settings, data.tasks, data.plan, data.created, now.date]); // eslint-disable-line react-hooks/exhaustive-deps
  const level = data.settings.roast;
  const pending = sc.tasks.total - sc.tasks.done + (sc.workout.total && sc.workout.done < sc.workout.total ? 1 : 0);

  let line = null;
  if (sc.score === 100) line = { cls: 'good', text: pickLine(PRAISE, date, { score: 100 }) };
  else if (sc.score !== null && level > 0 && (!isToday || now.minutes >= toMin(data.settings.roastTime))) line = { cls: 'roast', text: pickLine(ROASTS[level], date, { n: pending, score: sc.score }) };

  const showNotifBanner = isToday && data.settings.notify && pstate.supported && !pstate.subscribed;
  const setAllSets = (e, done) => act.patchLog(date, { workout: { [e.id]: done ? e.sets : 0 } });

  return (
    <>
      <div className="datenav">
        <button className="ico" aria-label="Previous day" onClick={() => setViewDate(addDays(date, -1))}>‹</button>
        <b>{isToday ? 'Today, ' : ''}{fmtDate(date)}</b>
        <button className="ico" aria-label="Next day" disabled={date >= now.date} onClick={() => setViewDate(addDays(date, 1) >= now.date ? null : addDays(date, 1))}>›</button>
      </div>

      {showNotifBanner && (
        <div className="banner">
          <p style={{ marginBottom: 8 }}>{pstate.perm === 'denied' ? "Notifications are blocked. Allow them in your browser's site settings to get reminders." : 'Reminders are off on this device. Turn them on, or nobody will stop you from skipping.'}</p>
          {pstate.perm !== 'denied' && <button className="btn sm" onClick={enable}>Turn on notifications</button>}
        </div>
      )}

      <section className="card hero">
        <Plate pct={sc.score} />
        <div className="stats">
          <div className="stat">Streak <b>{plural(st.current, 'day')}</b></div>
          <div className="stat">Best <b>{plural(st.best, 'day')}</b></div>
          <div className="stat">Tasks <b>{sc.tasks.done}/{sc.tasks.total}</b></div>
          <div className="stat">Sets <b>{sc.workout.done}/{sc.workout.total}</b></div>
        </div>
      </section>

      {line && <div className={'banner ' + line.cls} role="status">{line.text}</div>}

      {!wk && !slots.length && <section className="card"><p>Nothing is scheduled for this day. Enjoy the rest day, or add something in the Workout and Tasks tabs.</p></section>}

      {wk && (
        <section className="card">
          <div className="card-h"><h2>{wk.name || 'Workout'}</h2><span className="pill">{wk.time || 'no reminder'}</span></div>
          {wk.exercises.map((e) => {
            const n = Math.min(log.workout[e.id] || 0, e.sets);
            const hasW = e.weight !== null && e.weight !== '' && e.weight !== undefined;
            return (
              <div className="ex" key={e.id}>
                <div className="ex-top">
                  <b>{e.name}</b>
                  <span className="mute small">{e.sets} × {e.reps || '–'}{hasW ? ` · ${e.weight} kg` : ''}</span>
                </div>
                {e.note && <div className="mute small">{e.note}</div>}
                <div className="sets">
                  {Array.from({ length: e.sets }, (_, i) => (
                    <button key={i} className={'set' + (i < n ? ' on' : '')} aria-label={`Set ${i + 1}`} aria-pressed={i < n} onClick={() => act.patchLog(date, { workout: { [e.id]: n === i + 1 ? i : i + 1 } })}>{i + 1}</button>
                  ))}
                  <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => setAllSets(e, n < e.sets)}>{n < e.sets ? 'All done' : 'Reset'}</button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {slots.length > 0 && (
        <section className="card">
          <div className="card-h"><h2>Tasks</h2><span className="pill">{sc.tasks.done}/{sc.tasks.total}</span></div>
          {slots.map((s) => {
            const on = !!log.done[s.key];
            const late = isToday && s.time && !on && now.minutes > toMin(s.time) + 30;
            return (
              <button key={s.key} className={'task' + (on ? ' on' : '') + (late ? ' late' : '')} aria-pressed={on} onClick={() => act.patchLog(date, { done: { [s.key]: !on } })}>
                <span className="chk">{on ? '✓' : ''}</span>
                <span><span className="t-title">{s.icon} {s.title}</span>{s.amount && <span className="mute small"> · {s.amount}</span>}</span>
                <span className="t-time">{s.time || 'anytime'}</span>
              </button>
            );
          })}
        </section>
      )}

      <BodyCard key={date} date={date} log={log} data={data} act={act} />
    </>
  );
}
