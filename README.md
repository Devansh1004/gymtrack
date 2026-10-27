# Gym Consistency

A daily tracker for gym sets, water, protein, creatine and anything else you want to be consistent about. Every item gets its own time, a notification at that time, and a roast when you skip it.

- React PWA (installs on your phone) plus a small Node server
- Data lives in one JSON text file per user (`data/<username>.json`), no database
- Web Push notifications that arrive even when the app is closed (the server checks every minute)
- Automatic backup to a private GitHub repo, so free hosting cannot wipe your data

## Features

| Screen | What it does |
|---|---|
| **Today** | Score plate, streak, today's exercises (tick set by set), tasks, weight / height / note. Past days can be edited too |
| **Workout** | Exercises, sets, reps, weight, notes and order for each day Mon to Sun. Push / Pull / Legs / Full body templates and "copy from another day" |
| **Tasks** | Water, creatine, protein, anything: any number of times, on any days. An "every N hours" generator for things like water |
| **Progress** | Streak, 7 and 30 day averages, score chart, weight chart, last 14 days |
| **Settings** | Roast level (Off / Mild / Medium / Savage), summary time, nag delay, score formula, devices, export, log out |

**Score** = workout sets done % x workout weight + tasks done % x the rest. The split is a slider in Settings (default 40/60). On a day that only has a workout or only has tasks, the score comes from that part alone.

**Notifications:** at each timed task, at workout time, one nag some minutes after a miss, and an end-of-day summary at your chosen time that lists what is still pending. Notifications have a "Done" button.

## Run locally

```bash
npm install
npm run build
npm run vapid          # prints push keys; put them in .env (or skip: they are auto-generated)
npm start              # http://localhost:3000
```

Development: run `npm run dev:server` in one terminal and `npm run dev:client` in another (http://localhost:5173).
Push notifications need HTTPS. They work on `localhost`, but to test on a phone you need to deploy.

Tests: `npm test`

## Deploy (Render, free)

### 1. Put the code on GitHub
1. Create a new GitHub repo for the code (public or private).
2. In this folder: `git init && git add . && git commit -m "gym app" && git branch -M main && git remote add origin <repo-url> && git push -u origin main`

### 2. A separate PRIVATE repo and token for data backup
Render's free disk **is wiped on every restart and deploy**, so data is backed up to GitHub.
1. Create another repo named `gym-data` and make it **Private** (it holds PIN hashes and device keys).
2. GitHub > Settings > Developer settings > Personal access tokens > **Fine-grained tokens** > Generate new token.
   - Repository access: **Only select repositories**, then pick `gym-data` only
   - Repository permissions: **Contents: Read and write**
3. Copy the token (it is shown only once).

### 3. VAPID keys
Run `npm run vapid` on your computer. It prints `VAPID_PUBLIC` and `VAPID_PRIVATE`. You will add both to Render. If these keys ever change, every device has to turn notifications on again.

### 4. Create the Render service
1. On render.com: **New > Web Service** and pick your code repo.
2. Settings: Runtime **Node**, Build Command `npm install --include=dev && npm run build`, Start Command `npm start`, Instance Type **Free**.
   (The repo has a `render.yaml`, so a Blueprint deploy works too.)
3. Environment variables:

| Key | Value |
|---|---|
| `VAPID_PUBLIC`, `VAPID_PRIVATE` | from step 3 |
| `GITHUB_TOKEN` | the token from step 2 |
| `GITHUB_REPO` | `your-username/gym-data` |
| `INVITE_CODE` | any secret word, so strangers cannot sign up |

4. Deploy. You get a URL like `https://gym-consistency.onrender.com`. The logs should show `Gym app on :...  (backup: GitHub)`.

### 5. Keep the server awake with a cron ping
A free Render service **sleeps after 15 minutes without traffic**, and a sleeping server cannot send notifications. Ping it every 5 minutes:
1. Create a free account on cron-job.org (or use UptimeRobot).
2. Create a cronjob: URL `https://<your-app>.onrender.com/ping`, schedule **every 5 minutes**.
3. Save it. The response should be `ok`.

Notes:
- Use `/ping` (a request to `/robots.txt` does not wake the service).
- One always-on free service uses about 744 hours in a 31-day month and the limit is 750, so do not run a second free web service on the same account.
- Render can restart the service at any time. Thanks to the backup, the data is restored from GitHub on boot. Changes are backed up within about 5 minutes and again right before shutdown, so in the worst case you lose a few minutes of data.

### 6. Use it on your phone
1. Open the app URL in Chrome on Android and create an account (with the invite code).
2. Menu (⋮) > **Add to Home screen / Install app**.
3. Open the app > **Settings > Turn on for this device** > Allow. Then tap **Send test notification**.
4. Repeat on every other phone or PC. Notifications go to every device that is logged in and enabled. Logging out stops notifications on that device.

## Customize

- **Roast lines:** `ROASTS`, `NAGS` and `PRAISE` in `shared/logic.js`. `{n}` is the pending count, `{score}` the score, `{title}` the task name.
- **Default tasks, templates, presets:** `shared/defaults.js`
- **Catch-up window:** `CATCHUP` in `server/scheduler.js` (default 20 minutes). If the server wakes up late, it still sends reminders that are at most this many minutes overdue.

## Troubleshooting

| Problem | What to do |
|---|---|
| No notifications | Did you tap "Turn on for this device"? Are Chrome's notifications allowed in the phone settings? Is battery saver stopping Chrome? Try "Send test notification" |
| Notifications arrive late | Is the cron ping running? Check the history on cron-job.org. A sleeping server sends overdue reminders as soon as it wakes (up to 20 minutes late) |
| "Permission was not granted" | Chrome > Site settings > Notifications > Allow |
| Data gone after a redeploy | Are `GITHUB_TOKEN` and `GITHUB_REPO` correct? Look for `backup failed` or `Restored N file(s)` in the logs |
| Forgot a PIN | Remove the user's file `data/<user>.json` (also from the GitHub backup) and sign up again, or use a new username |
| VAPID keys changed | On each device, turn notifications off in Settings and on again |

## Security

This is meant for you and a couple of friends. PINs are hashed with scrypt, 6 wrong attempts lock a username and IP for 10 minutes, and `INVITE_CODE` keeps signup closed. Keep the backup repo private.
