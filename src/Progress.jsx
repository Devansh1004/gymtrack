import React from 'react';
import { addDays, computeScore, dayScore, dowOf, firstDay, fmtDate, streaks } from '../shared/logic.js';

const band = (v) => (v === null ? '' : v >= 100 ? 'b' : v >= 70 ? 'g' : v >= 40 ? 'y' : 'r');
const colorOf = (v) => (v >= 100 ? 'var(--blue)' : v >= 70 ? 'var(--green)' : v >= 40 ? 'var(--yellow)' : 'var(--red)');
const avg = (a) => { const x = a.filter((v) => v !== null); return x.length ? Math.round(x.reduce((s, v) => s + v, 0) / x.length) : null; };

function Bars({ items, min }) {
  const W = 320, H = 110, top = 6, bot = 18, bw = (W - 8) / items.length, ch = H - top - bot;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily score for the last 30 days">
      <line x1="4" x2={W - 4} y1={top + ch * (1 - min / 100)} y2={top + ch * (1 - min / 100)} stroke="var(--line)" strokeDasharray="3 3" />
      {items.map((it, i) => {
        const x = 4 + i * bw + 1;
        if (it.v === null) return <rect key={it.date} x={x} y={H - bot - 2} width={bw - 2} height="2" fill="var(--line)" />;
        const h = Math.max(2, (ch * it.v) / 100);
        return <rect key={it.date} x={x} y={H - bot - h} width={bw - 2} height={h} rx="2" fill={colorOf(it.v)}><title>{`${it.date}: ${it.v}%`}</title></rect>;
      })}
      <text x="4" y={H - 4} fontSize="10" fill="var(--mute)">{items[0].date.slice(5)}</text>
      <text x={W - 4} y={H - 4} fontSize="10" fill="var(--mute)" textAnchor="end">{items[items.length - 1].date.slice(5)}</text>
    </svg>
  );
}

function Line({ pts }) {
  if (pts.length < 2) return <p className="mute small">Log your weight on at least 2 days to see the chart.</p>;
  const W = 320, H = 120, P = 12;
  const x0 = pts[0].t, x1 = pts[pts.length - 1].t;
  let y0 = Math.min(...pts.map((p) => p.w)), y1 = Math.max(...pts.map((p) => p.w));
  if (y1 - y0 < 1) { y0 -= 0.5; y1 += 0.5; }
  const X = (t) => P + ((W - 2 * P) * (t - x0)) / (x1 - x0 || 1);
  const Y = (w) => H - P - ((H - 2 * P) * (w - y0)) / (y1 - y0);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)} ${Y(p.w).toFixed(1)}`).join(' ');
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Weight trend">
      <path d={d} fill="none" stroke="var(--blue)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p) => <circle key={p.date} cx={X(p.t)} cy={Y(p.w)} r="3" fill="var(--blue)"><title>{`${p.date}: ${p.w} kg`}</title></circle>)}
      <text x={P} y="11" fontSize="10" fill="var(--mute)">{y1.toFixed(1)} kg</text>
      <text x={P} y={H - 2} fontSize="10" fill="var(--mute)">{y0.toFixed(1)} kg</text>
    </svg>
  );
}

export default function Progress({ app }) {
  const { data, now, goto } = app;
  const today = now.date;
  const st = streaks(data, today);
  const start = firstDay(data);
  const scoreAt = (d) => (d < start ? null : dayScore(data, d));
  const items = Array.from({ length: 30 }, (_, i) => { const date = addDays(today, i - 29); return { date, v: scoreAt(date) }; });
  const a7 = avg(items.slice(-7).map((i) => i.v));
  const a30 = avg(items.map((i) => i.v));
  const pts = Object.entries(data.logs).filter(([d, l]) => l.weight && d >= addDays(today, -90)).sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, l]) => ({ date, t: Date.parse(date), w: l.weight }));
  const delta = pts.length > 1 ? pts[pts.length - 1].w - pts[0].w : null;
  const rows = Array.from({ length: 14 }, (_, i) => addDays(today, -i)).filter((d) => d >= start);

  return (
    <>
      <div className="tiles">
        <div className="tile"><b>{st.current} {st.current === 1 ? 'day' : 'days'}</b><span className="mute small">Current streak (best {st.best})</span></div>
        <div className="tile"><b>{a7 ?? '–'}{a7 !== null && '%'}</b><span className="mute small">7-day average</span></div>
        <div className="tile"><b>{a30 ?? '–'}{a30 !== null && '%'}</b><span className="mute small">30-day average</span></div>
        <div className="tile"><b>{pts.length ? `${pts[pts.length - 1].w} kg` : '–'}</b><span className="mute small">{delta === null ? 'Latest weight' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)} kg in 90 days`}</span></div>
      </div>

      <section className="card"><div className="card-h"><h2>Daily score, 30 days</h2></div><Bars items={items} min={data.settings.streakMin} /><p className="mute small" style={{ margin: '6px 0 0' }}>Dotted line = score needed to keep the streak ({data.settings.streakMin}%).</p></section>
      <section className="card"><div className="card-h"><h2>Weight, 90 days</h2></div><Line pts={pts} /></section>

      <section className="card">
        <div className="card-h"><h2>Last 14 days</h2></div>
        {rows.map((d) => {
          const l = data.logs[d];
          const sc = computeScore(data, l, dowOf(d));
          const v = scoreAt(d);
          return (
            <button key={d} className="hrow" onClick={() => goto('today', d === today ? null : d)}>
              <span className={'score-pill ' + band(v)}>{v === null ? '–' : `${v}%`}</span>
              <span className="grow"><b>{fmtDate(d)}</b><span className="mute small" style={{ display: 'block' }}>{sc.tasks.total ? `tasks ${sc.tasks.done}/${sc.tasks.total}` : 'no tasks'}{sc.workout.total ? ` · sets ${sc.workout.done}/${sc.workout.total}` : ''}</span></span>
              {l?.weight && <span className="mute small">{l.weight} kg</span>}
            </button>
          );
        })}
      </section>
    </>
  );
}
