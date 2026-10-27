// Service worker: shows push notifications, opens the app on tap, caches the app shell for offline.
const CACHE = 'gym-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin || u.pathname.startsWith('/api') || u.pathname === '/ping') return;
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r).then((res) => { const c = res.clone(); caches.open(CACHE).then((x) => x.put('/', c)); return res; }).catch(() => caches.match('/')));
  } else if (u.pathname.startsWith('/assets/')) {
    e.respondWith(caches.match(r).then((hit) => hit || fetch(r).then((res) => { const c = res.clone(); caches.open(CACHE).then((x) => x.put(r, c)); return res; })));
  }
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch { d = { title: 'Gym', body: e.data ? e.data.text() : '' }; }
  const canDone = d.data && d.data.done && d.data.done.length;
  e.waitUntil(self.registration.showNotification(d.title || 'Gym', {
    body: d.body || '',
    tag: d.tag,
    renotify: !!d.tag,
    icon: '/icon-192.png',
    badge: '/badge.png',
    vibrate: [120, 60, 120],
    data: d.data || {},
    actions: canDone ? [{ action: 'done', title: '✅ Done' }] : [],
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const d = e.notification.data || {};
  const markDone = e.action === 'done' && d.done && d.done.length;
  const url = markDone ? `/?done=${encodeURIComponent(d.done.join(','))}&d=${d.date}` : '/';
  e.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) {
        await c.focus();
        if (markDone) c.postMessage({ type: 'done', keys: d.done, date: d.date });
        return;
      }
    }
    await clients.openWindow(url);
  })());
});
