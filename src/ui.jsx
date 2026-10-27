import React from 'react';

const PATHS = {
  today: <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l3 3 5-6" /></>,
  plan: <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />,
  tasks: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>,
  progress: <path d="M4 20V11M10 20V4M16 20v-6M2 20.5h20" />,
  settings: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>,
};
export function Icon({ n, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[n]}
    </svg>
  );
}

// The daily score, drawn as a weight plate. Rim colour follows the 25/20/15/10 kg plate palette.
export function Plate({ pct }) {
  const has = pct !== null && pct !== undefined;
  const v = has ? Math.max(0, Math.min(100, pct)) : 0;
  const C = 2 * Math.PI * 52;
  const col = !has ? 'var(--line)' : v >= 100 ? 'var(--blue)' : v >= 70 ? 'var(--green)' : v >= 40 ? 'var(--yellow)' : 'var(--red)';
  return (
    <div className="plate" role="img" aria-label={has ? `Score ${v} percent` : 'Rest day'}>
      <svg viewBox="0 0 140 140" aria-hidden="true">
        <circle cx="70" cy="70" r="66" className="p-edge" />
        <circle cx="70" cy="70" r="52" fill="none" stroke="var(--line)" strokeWidth="13" />
        {has && v > 0 && (
          <circle cx="70" cy="70" r="52" fill="none" stroke={col} strokeWidth="13" strokeLinecap="round"
            strokeDasharray={`${(C * v) / 100} ${C}`} transform="rotate(-90 70 70)" style={{ transition: 'stroke-dasharray .6s ease' }} />
        )}
      </svg>
      <div className="p-num"><b>{has ? v : '–'}</b><span>{has ? 'score' : 'rest day'}</span></div>
    </div>
  );
}

export function Seg({ value, options, onChange }) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)}>{o.l}</button>
      ))}
    </div>
  );
}

export function Switch({ on, onChange, label }) {
  return <button type="button" className="sw" role="switch" aria-checked={!!on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function Stepper({ value, min = 1, max = 20, onChange, label }) {
  return (
    <div className="step" role="group" aria-label={label}>
      <button type="button" aria-label="Decrease" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <span>{value}</span>
      <button type="button" aria-label="Increase" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}
