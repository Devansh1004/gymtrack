// Tiny file-backed store: one JSON text file per user in DATA_DIR (e.g. data/devansh.json).
import fs from 'node:fs';
import path from 'node:path';
import { zonedNow } from '../shared/logic.js';
import { DEFAULT_SETTINGS, defaultTasks } from '../shared/defaults.js';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const users = new Map();
const timers = new Map();
let changed = () => {};
export const onChange = (fn) => { changed = fn; };

const fileOf = (name) => path.join(DATA_DIR, `${name}.json`);

export function loadAll() {
  users.clear();
  for (const f of fs.readdirSync(DATA_DIR)) {
    if (!f.endsWith('.json') || f.startsWith('_')) continue;
    try {
      const u = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
      if (u?.name) users.set(u.name, u);
    } catch (e) { console.error('bad data file', f, e.message); }
  }
  return users.size;
}
export const getUser = (name) => users.get(name);
export const allUsers = () => [...users.values()];

export function createUser(name, pin) {
  const u = {
    name, pin, created: zonedNow(DEFAULT_SETTINGS.tz).date,
    sessions: [], subs: [],
    settings: { ...DEFAULT_SETTINGS }, plan: {}, tasks: defaultTasks(), logs: {},
  };
  users.set(name, u);
  writeNow(u);
  return u;
}

function writeNow(u) {
  clearTimeout(timers.get(u.name));
  timers.delete(u.name);
  const f = fileOf(u.name);
  fs.writeFileSync(f + '.tmp', JSON.stringify(u), { mode: 0o600 });
  fs.renameSync(f + '.tmp', f);
  changed(`${u.name}.json`);
}
// Debounced save: many quick taps -> one disk write.
export function save(u) {
  clearTimeout(timers.get(u.name));
  timers.set(u.name, setTimeout(() => writeNow(u), 250));
}
export function flushAll() {
  for (const name of [...timers.keys()]) { const u = users.get(name); if (u) writeNow(u); }
}

export function readRaw(file) {
  try { return fs.readFileSync(path.join(DATA_DIR, file), 'utf8'); } catch { return null; }
}
export function writeRaw(file, text) {
  fs.writeFileSync(path.join(DATA_DIR, file), text, { mode: 0o600 });
  changed(file);
}
