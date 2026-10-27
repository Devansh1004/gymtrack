import React, { useEffect, useState } from 'react';
import * as api from './api.js';

export default function Login({ onAuthed }) {
  const [mode, setMode] = useState('login');
  const [u, setU] = useState('');
  const [pin, setPin] = useState('');
  const [invite, setInvite] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState({});
  useEffect(() => { api.config().then(setCfg).catch(() => {}); }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const r = await (mode === 'login' ? api.login(u.trim(), pin) : api.signup(u.trim(), pin, invite));
      api.setToken(r.token);
      try { localStorage.removeItem('gym.cache'); } catch { /* ignore */ }
      onAuthed();
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  }

  return (
    <form className="login" onSubmit={submit}>
      <h1>Gym<br />consistency</h1>
      <p className="tag">Daily score. Daily accountability. Excuses not included.</p>
      <label className="f">Username
        <input className="inp" value={u} onChange={(e) => setU(e.target.value)} autoCapitalize="none" autoComplete="username" required />
      </label>
      <label className="f">PIN (4 to 8 digits)
        <input className="inp" type="password" inputMode="numeric" pattern="\d{4,8}" value={pin} onChange={(e) => setPin(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
      </label>
      {mode === 'signup' && cfg.inviteRequired && (
        <label className="f">Invite code
          <input className="inp" value={invite} onChange={(e) => setInvite(e.target.value)} required />
        </label>
      )}
      <div className="err" role="alert">{err}</div>
      <button className="btn" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}</button>
      <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setErr(''); }}>
        {mode === 'login' ? 'Create a new account' : 'Already have an account? Log in'}
      </button>
    </form>
  );
}
