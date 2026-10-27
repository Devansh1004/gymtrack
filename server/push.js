import webpush from 'web-push';
import * as store from './store.js';

let pub = '';
let sender = (sub, payload, opts) => webpush.sendNotification(sub, payload, opts);
export const setSender = (fn) => { sender = fn; }; // tests

// VAPID keys: env vars win (recommended on Render). Otherwise generated once and kept in data/_vapid.json.
export function init() {
  let keys = null;
  if (process.env.VAPID_PUBLIC && process.env.VAPID_PRIVATE) {
    keys = { publicKey: process.env.VAPID_PUBLIC, privateKey: process.env.VAPID_PRIVATE };
  } else {
    const raw = store.readRaw('_vapid.json');
    if (raw) keys = JSON.parse(raw);
    else {
      keys = webpush.generateVAPIDKeys();
      store.writeRaw('_vapid.json', JSON.stringify(keys));
      console.log('Generated new VAPID keys (set VAPID_PUBLIC / VAPID_PRIVATE env vars to make them permanent).');
    }
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', keys.publicKey, keys.privateKey);
  pub = keys.publicKey;
}
export const publicKey = () => pub;

// Sends to every device of the user; drops devices the browser says are gone (404/410).
export async function sendToUser(user, payload) {
  const body = JSON.stringify(payload);
  const dead = new Set();
  await Promise.all(user.subs.map(async (s) => {
    try { await sender(s.sub, body, { TTL: 3600, urgency: 'high' }); }
    catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) dead.add(s.id);
      else console.error('push error', user.name, e.statusCode || e.message);
    }
  }));
  if (dead.size) { user.subs = user.subs.filter((s) => !dead.has(s.id)); store.save(user); }
  return user.subs.length;
}
