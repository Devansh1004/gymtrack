// Tests the GitHub backup/restore logic against a fake GitHub API. Run: npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const remote = new Map(); // path -> { text, sha }
const calls = [];
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = decodeURIComponent(u.pathname.replace(/^\/repos\/me\/data\/contents\//, ''));
  let body = '';
  for await (const c of req) body += c;
  calls.push(`${req.method} ${p}`);
  const send = (code, obj, raw) => { res.writeHead(code, { 'Content-Type': raw ? 'text/plain' : 'application/json' }); res.end(raw ?? JSON.stringify(obj)); };
  if (req.headers.authorization !== 'Bearer tok') return send(401, { message: 'bad creds' });
  if (req.method === 'PUT') {
    const b = JSON.parse(body);
    const cur = remote.get(p);
    if (cur && b.sha !== cur.sha) return send(422, { message: 'sha wrong' });
    const text = Buffer.from(b.content, 'base64').toString();
    const sha = crypto.createHash('sha1').update(text + Math.random()).digest('hex');
    remote.set(p, { text, sha });
    return send(200, { content: { sha } });
  }
  const dir = [...remote.entries()].filter(([k]) => k.startsWith(p + '/'));
  if (!remote.has(p) && !dir.length) return send(404, { message: 'Not Found' });
  if (remote.has(p)) return u.searchParams.has('ref') && String(req.headers.accept).includes('raw') ? send(200, null, remote.get(p).text) : send(200, { sha: remote.get(p).sha });
  return send(200, dir.map(([k, v]) => ({ type: 'file', name: k.split('/').pop(), sha: v.sha })));
});
await new Promise((r) => server.listen(0, r));

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-bk-'));
Object.assign(process.env, { GITHUB_TOKEN: 'tok', GITHUB_REPO: 'me/data', GITHUB_API: `http://localhost:${server.address().port}`, BACKUP_DIR: 'gym-data' });
const D = process.env.DATA_DIR;
const load = (tag) => import(`../server/backup.js?${tag}`);
let n = 0;
const ok = (m) => console.log('ok  ', m, ++n && '');

const b1 = await load('a');
assert.equal(b1.enabled, true);
fs.writeFileSync(path.join(D, 'amit.json'), '{"name":"amit","v":1}');
b1.markDirty('amit.json');
await b1.flush();
assert.equal(remote.get('gym-data/amit.json').text, '{"name":"amit","v":1}'); ok('first backup creates the file');

fs.writeFileSync(path.join(D, 'amit.json'), '{"name":"amit","v":2}');
b1.markDirty('amit.json');
await b1.flush();
assert.equal(remote.get('gym-data/amit.json').text, '{"name":"amit","v":2}'); ok('second backup updates using the stored sha');

const before = calls.length;
b1.markDirty('amit.json');
await b1.flush();
assert.equal(calls.length, before); ok('unchanged file is not re-committed');

const b2 = await load('b'); // fresh process: no sha cached, file already exists remotely
fs.writeFileSync(path.join(D, 'amit.json'), '{"name":"amit","v":3}');
b2.markDirty('amit.json');
await b2.flush();
assert.equal(remote.get('gym-data/amit.json').text, '{"name":"amit","v":3}'); ok('stale/missing sha is recovered automatically');

fs.rmSync(path.join(D, 'amit.json')); // Render wiped the disk
const b3 = await load('c');
assert.equal(await b3.restore(), 1);
assert.equal(fs.readFileSync(path.join(D, 'amit.json'), 'utf8'), '{"name":"amit","v":3}'); ok('restore rebuilds a wiped disk');

fs.writeFileSync(path.join(D, 'amit.json'), '{"name":"amit","v":"local-newer"}');
assert.equal(await (await load('d')).restore(), 0);
assert.equal(fs.readFileSync(path.join(D, 'amit.json'), 'utf8'), '{"name":"amit","v":"local-newer"}'); ok('restore never overwrites existing local files');

process.env.GITHUB_TOKEN = 'wrong';
const b4 = await load('e');
fs.writeFileSync(path.join(D, 'amit.json'), '{"changed":1}');
b4.markDirty('amit.json');
await b4.flush(); // must not throw
ok('bad token only logs an error and retries later');

server.close();
console.log(`\nall ${n} backup tests passed`);
process.exit(0);
