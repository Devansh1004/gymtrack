import React, { useState } from 'react';
import * as api from './api.js';
import { ROASTS, NAGS, pickLine } from '../shared/logic.js';
import { Seg, Switch } from './ui.jsx';

const TZS = ['Asia/Kolkata', 'UTC', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York'];

export default function Settings({ app }) {
  const { data, act, pstate, enable, disable, logout, toast } = app;
  const s = data.settings;
  const [sample, setSample] = useState('');
  const [height, setHeight] = useState(s.height ?? '');
  const thisDev = (() => { try { return localStorage.getItem('gym.dev'); } catch { return null; } })();

  const showSample = (lv) => setSample(lv ? pickLine(Math.random() < 0.7 ? ROASTS[lv] : NAGS[lv], null, { n: 3, score: 42, title: 'Creatine' }) : 'Roasts are off. You will only get neutral reminders.');
  async function test() {
    try { const r = await api.testPush(); toast(r.devices ? `Test sent to ${r.devices} device${r.devices === 1 ? '' : 's'}` : 'No device is registered yet'); } catch (e) { toast(e.message); }
  }
  async function exportJson() {
    try {
      const url = URL.createObjectURL(await api.exportData());
      const a = Object.assign(document.createElement('a'), { href: url, download: `${data.user}-gym-data.json` });
      a.click(); URL.revokeObjectURL(url);
    } catch (e) { toast(e.message); }
  }
  async function removeDev(id) {
    try { act.setDevices((await api.removeDevice(id)).devices); } catch (e) { toast(e.message); }
  }

  return (
    <>
      <section className="card">
        <div className="card-h"><h2>Notifications</h2><Switch on={s.notify} label="Notifications" onChange={(v) => act.setSettings({ notify: v })} /></div>
        <p className="mute small">This switch applies to all your devices. Each device still needs to be enabled separately.</p>
        {!pstate.supported && <p className="bad-t">This browser does not support push notifications. On Android, use Chrome.</p>}
        {pstate.supported && (
          <div className="row wrap">
            {pstate.subscribed
              ? <button className="btn ghost sm" onClick={disable}>Turn off on this device</button>
              : <button className="btn sm" onClick={enable} disabled={pstate.perm === 'denied'}>Turn on for this device</button>}
            <button className="btn ghost sm" onClick={test}>Send test notification</button>
          </div>
        )}
        {pstate.perm === 'denied' && <p className="bad-t small" style={{ marginTop: 8 }}>The browser has blocked notifications for this site. Allow them in the site settings, then come back.</p>}
        {data.devices.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <h3>Registered devices</h3>
            {data.devices.map((d) => (
              <div className="row" key={d.id} style={{ minHeight: 40 }}>
                <span className="grow">{d.device}{d.id === thisDev && <span className="pill" style={{ marginLeft: 6 }}>this device</span>}</span>
                <button className="btn bad sm" onClick={() => removeDev(d.id)}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card col">
        <h2 style={{ margin: 0, fontSize: 16 }}>Roast level</h2>
        <Seg value={s.roast} onChange={(v) => { act.setSettings({ roast: v }); showSample(v); }} options={[{ v: 0, l: 'Off' }, { v: 1, l: 'Mild' }, { v: 2, l: 'Medium' }, { v: 3, l: 'Savage' }]} />
        {sample && <div className="banner roast" role="status">{sample}</div>}
        <div className="grid2">
          <label className="f">Daily summary time
            <input className="inp" type="time" value={s.roastTime} onChange={(e) => e.target.value && act.setSettings({ roastTime: e.target.value })} />
          </label>
          <label className="f">Nag after a miss
            <select className="inp" value={s.nagAfter} onChange={(e) => act.setSettings({ nagAfter: +e.target.value })}>
              <option value={0}>Never</option>
              {[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>After {m} min</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="card col">
        <h2 style={{ margin: 0, fontSize: 16 }}>How the score is calculated</h2>
        <label className="f">Workout counts for {s.workoutWeight}%, tasks for {100 - s.workoutWeight}%
          <input type="range" min="0" max="100" step="5" value={s.workoutWeight} onChange={(e) => act.setSettings({ workoutWeight: +e.target.value })} />
        </label>
        <label className="f">Minimum score to keep the streak: {s.streakMin}%
          <input type="range" min="10" max="100" step="5" value={s.streakMin} onChange={(e) => act.setSettings({ streakMin: +e.target.value })} />
        </label>
        <p className="mute small" style={{ margin: 0 }}>On days that only have a workout or only have tasks, the whole score comes from that one part.</p>
      </section>

      <section className="card col">
        <h2 style={{ margin: 0, fontSize: 16 }}>Profile</h2>
        <div className="grid2">
          <label className="f">Height (cm)
            <input className="inp" inputMode="decimal" value={height} placeholder="--" onChange={(e) => { setHeight(e.target.value); act.setSettings({ height: e.target.value === '' ? null : parseFloat(e.target.value) || null }); }} />
          </label>
          <label className="f">Timezone
            <input className="inp" list="tzlist" value={s.tz} onChange={(e) => act.setSettings({ tz: e.target.value })} />
            <datalist id="tzlist">{TZS.map((z) => <option key={z} value={z} />)}</datalist>
          </label>
        </div>
      </section>

      <section className="card row wrap">
        <button className="btn ghost sm" onClick={exportJson}>Export data (JSON)</button>
        <button className="btn bad sm" onClick={logout}>Log out ({data.user})</button>
      </section>
    </>
  );
}
