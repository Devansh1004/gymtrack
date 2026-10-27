import express from 'express';
import compression from 'compression';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import * as store from './store.js';
import * as backup from './backup.js';
import * as push from './push.js';
import { tick } from './scheduler.js';
import { sanitizePlan, sanitizeTasks, sanitizeSettings, sanitizeLogPatch } from './validate.js';
import { zonedNow, dowOf, addDays, computeScore, applyLogPatch } from '../shared/logic.js';

const scrypt = promisify(crypto.scrypt);
const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = +process.env.PORT || 3000;
const INVITE = process.env.INVITE_CODE || '';
const MAX_USERS = +process.env.MAX_USERS || 6;

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
async function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${(await scrypt(pin, salt, 32)).toString('hex')}`;
}
async function checkPin(pin, stored) {
  const [salt, h] = stored.split(':');
  return crypto.timingSafeEqual(await scrypt(pin, salt, 32), Buffer.from(h, 'hex'));
}
const shortDevice = (v) => String(v || 'Device').replace(/[^\w .+-]/g, '').slice(0, 40) || 'Device';

/* ---- brute-force guard: 6 wrong PINs from one IP+username => 10 min lock ---- */
const fails = new Map();
const locked = (k) => {
  const f = fails.get(k);
  if (!f) return false;
  if (f.until && f.until <= Date.now()) { fails.delete(k); return false; }
  return f.n >= 6;
};
const fail = (k) => {
  const f = fails.get(k) || { n: 0, until: 0 };
  if (++f.n >= 6) f.until = Date.now() + 10 * 60_000;
  fails.set(k, f);
};

function startSession(user, device) {
  const token = crypto.randomBytes(24).toString('base64url');
  user.sessions.push({ h: sha(token), device: shortDevice(device), created: Date.now() });
  if (user.sessions.length > 12) user.sessions.splice(0, user.sessions.length - 12);
  store.save(user);
  return token;
}

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const hh = t && sha(t);
  const user = hh && store.allUsers().find((u) => u.sessions.some((s) => s.h === hh));
  if (!user) return res.status(401).json({ error: 'login' });
  req.user = user;
  next();
}

const pubLog = ({ notified, ...rest }) => rest;
const devices = (u) => u.subs.map((s) => ({ id: s.id, device: s.device, added: s.added }));
function publicState(user) {
  const cutoff = addDays(zonedNow(user.settings.tz).date, -180);
  const logs = {};
  for (const [d, l] of Object.entries(user.logs)) if (d >= cutoff) logs[d] = pubLog(l);
  return { user: user.name, created: user.created, settings: user.settings, plan: user.plan, tasks: user.tasks, logs, devices: devices(user), vapid: push.publicKey() };
}

/* ---- app ---- */
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(compression());
app.use(express.json({ limit: '200kb' }));
app.use((req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); next(); });
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Keep-alive endpoint for the external cron. Also catches the scheduler up after a cold start.
let lastTick = 0, ticking = false;
async function runTick() {
  if (ticking) return;
  ticking = true; lastTick = Date.now();
  try { await tick(); } finally { ticking = false; }
}
app.get('/ping', (req, res) => {
  res.set('Cache-Control', 'no-store').type('text/plain').send('ok');
  if (Date.now() - lastTick > 45_000) runTick();
});

app.get('/api/config', (req, res) => res.json({ inviteRequired: !!INVITE }));

app.post('/api/signup', wrap(async (req, res) => {
  const name = String(req.body?.username || '').toLowerCase();
  const pin = String(req.body?.pin || '');
  if (!/^[a-z0-9]{2,20}$/.test(name)) return res.status(400).json({ error: 'Username: 2-20 letters/numbers, no spaces' });
  if (!/^\d{4,8}$/.test(pin)) return res.status(400).json({ error: 'PIN: 4 to 8 digits' });
  if (INVITE && req.body?.invite !== INVITE) return res.status(403).json({ error: 'Invite code is wrong' });
  if (store.getUser(name)) return res.status(409).json({ error: 'That username is already taken' });
  if (store.allUsers().length >= MAX_USERS) return res.status(403).json({ error: 'User limit reached' });
  const user = store.createUser(name, await hashPin(pin));
  res.json({ token: startSession(user, req.body?.device), user: name });
}));

app.post('/api/login', wrap(async (req, res) => {
  const name = String(req.body?.username || '').toLowerCase();
  const key = `${req.ip}|${name}`;
  if (locked(key)) return res.status(429).json({ error: 'Too many wrong attempts. Try again in 10 minutes.' });
  const user = store.getUser(name);
  if (!user || !(await checkPin(String(req.body?.pin || ''), user.pin))) {
    fail(key);
    return res.status(401).json({ error: 'Wrong username or PIN' });
  }
  fails.delete(key);
  res.json({ token: startSession(user, req.body?.device), user: name });
}));

app.use('/api', auth);

app.post('/api/logout', (req, res) => {
  const t = (req.headers.authorization || '').slice(7);
  const u = req.user;
  u.sessions = u.sessions.filter((s) => s.h !== sha(t));
  const ep = req.body?.endpoint;
  if (ep) u.subs = u.subs.filter((s) => s.sub.endpoint !== ep); // logged-out device stops getting pings
  store.save(u);
  res.json({ ok: true });
});

app.get('/api/state', (req, res) => res.json(publicState(req.user)));

app.put('/api/settings', (req, res) => {
  req.user.settings = sanitizeSettings(req.body || {}, req.user.settings);
  store.save(req.user);
  res.json({ settings: req.user.settings });
});
app.put('/api/plan', (req, res) => {
  req.user.plan = sanitizePlan(req.body);
  store.save(req.user);
  res.json({ ok: true });
});
app.put('/api/tasks', (req, res) => {
  req.user.tasks = sanitizeTasks(req.body);
  store.save(req.user);
  res.json({ ok: true });
});

app.patch('/api/log/:date', (req, res) => {
  const { date } = req.params;
  const today = zonedNow(req.user.settings.tz).date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > addDays(today, 1) || date < addDays(today, -400)) return res.status(400).json({ error: 'bad date' });
  const log = (req.user.logs[date] ||= { done: {}, workout: {} });
  applyLogPatch(log, sanitizeLogPatch(req.body));
  log.score = computeScore(req.user, log, dowOf(date)).score;
  store.save(req.user);
  res.json({ log: pubLog(log) });
});

app.post('/api/push/subscribe', (req, res) => {
  const sub = req.body?.subscription;
  const ep = sub?.endpoint;
  if (typeof ep !== 'string' || !ep.startsWith('https://') || ep.length > 700 || !sub.keys?.p256dh || !sub.keys?.auth) return res.status(400).json({ error: 'bad subscription' });
  const id = sha(ep).slice(0, 10);
  for (const u of store.allUsers()) { // a browser belongs to one account at a time
    const before = u.subs.length;
    u.subs = u.subs.filter((s) => s.id !== id);
    if (u !== req.user && u.subs.length !== before) store.save(u);
  }
  req.user.subs.push({ id, device: shortDevice(req.body.device), added: Date.now(), sub: { endpoint: ep, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) } } });
  if (req.user.subs.length > 8) req.user.subs.shift();
  store.save(req.user);
  res.json({ id, devices: devices(req.user) });
});
app.delete('/api/push/:id', (req, res) => {
  req.user.subs = req.user.subs.filter((s) => s.id !== req.params.id);
  store.save(req.user);
  res.json({ devices: devices(req.user) });
});
app.post('/api/push/test', wrap(async (req, res) => {
  const n = await push.sendToUser(req.user, { title: 'Test ✅', body: 'Notifications are working. No more excuses.', tag: 'test', data: {} });
  res.json({ devices: n });
}));

app.get('/api/export', (req, res) => {
  const { pin, sessions, subs, ...rest } = req.user;
  res.set('Content-Disposition', `attachment; filename="${req.user.name}-gym-data.json"`).json(rest);
});

app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));

/* ---- static React build ---- */
app.use(express.static(DIST, {
  index: false,
  setHeaders: (res, p) => res.setHeader('Cache-Control', p.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache'),
}));
app.get('*', (req, res) => {
  const f = path.join(DIST, 'index.html');
  if (!fs.existsSync(f)) return res.status(503).type('text/plain').send('Frontend not built yet. Run: npm run build');
  res.set('Cache-Control', 'no-cache').sendFile(f);
});
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({ error: 'server error' });
});

/* ---- boot ---- */
async function main() {
  store.onChange((f) => backup.markDirty(f));
  try { const n = await backup.restore(); if (n) console.log(`Restored ${n} file(s) from GitHub backup`); }
  catch (e) { console.error('GitHub restore failed:', e.message); }
  console.log(`Loaded ${store.loadAll()} user(s)`);
  push.init();
  app.listen(PORT, '0.0.0.0', () => console.log(`Gym app on :${PORT}  (backup: ${backup.enabled ? 'GitHub' : 'off'})`));
  // run exactly on minute boundaries
  setTimeout(() => { runTick(); setInterval(runTick, 60_000); }, 60_000 - (Date.now() % 60_000) + 300);
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, async () => {
      store.flushAll();
      await Promise.race([backup.flush(), new Promise((r) => setTimeout(r, 6000))]);
      process.exit(0);
    });
  }
}
main();
