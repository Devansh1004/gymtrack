import * as api from './api.js';

// Debounced, retrying saver. Taps are applied to the UI instantly; the server gets them ~0.5s later, merged.
const mergeP = (a = {}, b = {}) => ({ ...a, ...b, done: { ...a.done, ...b.done }, workout: { ...a.workout, ...b.workout } });

export function createSync(onStatus) {
  const timers = new Map();
  const jobs = new Map();
  const pendingLogs = {};
  let inflight = 0;
  let failing = false;
  const status = () => onStatus(failing ? 'err' : timers.size || inflight ? 'saving' : 'ok');

  async function sendLog(date) {
    const p = pendingLogs[date];
    if (!p) return;
    delete pendingLogs[date];
    try { await api.patchLog(date, p); } catch (e) { pendingLogs[date] = mergeP(p, pendingLogs[date]); throw e; }
  }
  function run(key) {
    timers.delete(key);
    inflight++;
    return Promise.resolve()
      .then(jobs.get(key))
      .then(() => { failing = false; }, (e) => { if (e.status !== 401) { failing = true; schedule(key, jobs.get(key), 4000); } })
      .finally(() => { inflight--; status(); });
  }
  function schedule(key, fn, delay = 600) {
    clearTimeout(timers.get(key));
    jobs.set(key, fn);
    timers.set(key, setTimeout(() => run(key), delay));
    status();
  }
  return {
    queue: schedule,
    log(date, patch) {
      pendingLogs[date] = mergeP(pendingLogs[date], patch);
      schedule('log:' + date, () => sendLog(date), 500);
    },
    flush() { for (const [k, t] of [...timers]) { clearTimeout(t); run(k); } },
    idle: () => timers.size === 0 && inflight === 0,
  };
}
