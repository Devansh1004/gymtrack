// Optional backup of data/*.json to a PRIVATE GitHub repo, so data survives Render's ephemeral disk.
// Enabled only when GITHUB_TOKEN and GITHUB_REPO ("owner/repo") are set.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from './store.js';

const TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const DIR = (process.env.BACKUP_DIR || 'gym-data').replace(/^\/+|\/+$/g, '');
const EVERY = Math.max(1, +process.env.BACKUP_EVERY_MIN || 5) * 60_000;
export const enabled = !!(TOKEN && REPO);

const shas = new Map();   // file -> blob sha on GitHub
const sent = new Map();   // file -> hash of content last pushed (skip no-op commits)
const pending = new Set();
let timer = null;

const API = process.env.GITHUB_API || 'https://api.github.com'; // overridable for tests
const gh = (p, opt = {}) =>
  fetch(`${API}/repos/${REPO}/contents/${p}`, {
    ...opt,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'gym-consistency',
      ...(opt.headers || {}),
    },
  });
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

// Throttled: first change starts a timer, everything changed until then goes out together.
export function markDirty(file) {
  if (!enabled) return;
  pending.add(file);
  if (!timer) timer = setTimeout(flush, EVERY);
}

async function put(file) {
  const text = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
  const h = md5(text);
  if (sent.get(file) === h) return;
  const body = { message: `backup ${file}`, content: Buffer.from(text).toString('base64'), branch: BRANCH };
  if (shas.has(file)) body.sha = shas.get(file);
  const url = `${DIR}/${file}`;
  let r = await gh(url, { method: 'PUT', body: JSON.stringify(body) });
  if (r.status === 409 || r.status === 422) { // stale/missing sha: look it up and retry once
    const g = await gh(`${url}?ref=${BRANCH}`);
    if (g.ok) { body.sha = (await g.json()).sha; r = await gh(url, { method: 'PUT', body: JSON.stringify(body) }); }
  }
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 160)}`);
  shas.set(file, (await r.json()).content.sha);
  sent.set(file, h);
}

export async function flush() {
  if (!enabled) return;
  clearTimeout(timer);
  timer = null;
  const files = [...pending];
  pending.clear();
  for (const f of files) {
    try { await put(f); } catch (e) {
      console.error('backup failed:', f, e.message);
      pending.add(f);
      if (!timer) timer = setTimeout(flush, 5 * 60_000);
    }
  }
}

// On boot: copy files that are missing locally (fresh Render disk) from the repo.
export async function restore() {
  if (!enabled) return 0;
  const r = await gh(`${DIR}?ref=${BRANCH}`);
  if (r.status === 404) return 0;
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 160)}`);
  let n = 0;
  for (const it of await r.json()) {
    if (it.type !== 'file' || !it.name.endsWith('.json')) continue;
    shas.set(it.name, it.sha);
    const local = path.join(DATA_DIR, it.name);
    if (fs.existsSync(local)) continue;
    const g = await gh(`${DIR}/${it.name}?ref=${BRANCH}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
    if (!g.ok) continue;
    const text = await g.text();
    fs.writeFileSync(local, text, { mode: 0o600 });
    sent.set(it.name, md5(text));
    n++;
  }
  return n;
}
