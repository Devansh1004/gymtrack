import { deviceName } from './webpush.js';

const KEY = 'gym.token';
export const getToken = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
export const setToken = (t) => { try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch { /* private mode */ } };
let onUnauth = () => {};
export const setOnUnauth = (fn) => { onUnauth = fn; };

async function call(method, url, body, keep = false) {
  const t = getToken();
  const r = await fetch(url, {
    method,
    keepalive: keep,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401 && t && !url.includes('/login')) { setToken(''); onUnauth(); }
  const text = await r.text();
  let j = null;
  try { j = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!r.ok) { const e = new Error(j?.error || `Server error (${r.status})`); e.status = r.status; throw e; }
  return j;
}

export const config = () => call('GET', '/api/config');
export const login = (username, pin) => call('POST', '/api/login', { username, pin, device: deviceName() });
export const signup = (username, pin, invite) => call('POST', '/api/signup', { username, pin, invite, device: deviceName() });
export const logout = (endpoint) => call('POST', '/api/logout', { endpoint });
export const getState = () => call('GET', '/api/state');
export const putSettings = (s) => call('PUT', '/api/settings', s);
export const putPlan = (p) => call('PUT', '/api/plan', p);
export const putTasks = (t) => call('PUT', '/api/tasks', t);
export const patchLog = (date, patch) => call('PATCH', `/api/log/${date}`, patch, true);
export const subscribe = (subscription, device) => call('POST', '/api/push/subscribe', { subscription, device });
export const removeDevice = (id) => call('DELETE', `/api/push/${id}`);
export const testPush = () => call('POST', '/api/push/test', {});

export async function exportData() {
  const r = await fetch('/api/export', { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!r.ok) throw new Error('Export failed');
  return r.blob();
}
