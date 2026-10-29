# Job Hunter: context for Claude Code

## What this is
A free job-hunting web app for Indian freshers that runs **in the browser** (`web/`, plain
HTML/CSS/ES modules, no build step), hosted free on Vercel (root directory `web`). Users sign in with
Google. The page talks straight to Gmail (read-only), to a hidden Drive **appDataFolder** file where
all their data lives, and to public company job boards. The AI is **built in**: users never add keys.
The only server code is small Vercel functions in `web/api/` (free plan): `ai.js` (the built-in AI, using
the owner's free Groq + Gemini keys from environment variables) and `workday.js` (a job source without CORS).

- `/`: the landing page (`index.html`, readable by search engines).
- `/app`, `/app/matches`, `/app/tailor[/<jobId>]`, `/app/profile`, `/app/settings`: the app
  (`app.html`; Vercel rewrites `/app/*` to it, and `scripts/serve.js` does the same locally).

Flow: sign in → first-run **setup wizard**, CV first (drop a file or paste; `profileFromCv` then fills in name,
city, roles, level and locations), then roles, level, job type, pay, locations (city search from the first letter,
`placeMatches`), skip list, companies to follow, routine → Applications (Board / Table / Timeline). Everything from setup can be changed in
Profile and CV or Settings.

The Google OAuth app is published but unverified, so users see the unverified screen and there's a 100-user cap.

## Hard constraints (don't break these)
- **Free.** No paid APIs or services. Server code only as free Vercel functions, and only when a
  source can't be called from the browser.
- **Gmail is read-only** (`gmail.readonly`). Never send, delete, label or modify mail. There's no outgoing mail at all.
- **Narrow scopes:** `gmail.readonly`, `drive.appdata`, `openid`, `email`, `profile`. No full Drive, no Docs.
- **No user data is stored anywhere but the user's browser and Drive.** It goes to Google (Gmail, the
  Drive app folder) and, for AI tasks, through `api/ai.js` to Groq/Gemini. That function passes text straight
  through: no storage, no logs. Job boards and `api/workday.js` only ever get a company's board name and a role. No analytics, no telemetry, no CDNs: fonts and pdf.js are vendored in
  `web/vendor/`. The CSP in each HTML page is the allow-list: keep it tight when adding an origin.
- **Secrets:** the access token lives in memory plus this tab's sessionStorage (so a reload keeps you
  signed in; gone when the tab closes or after about an hour). The AI keys are the owner's, only in Vercel
  environment variables (`.env.local` locally, gitignored). Nothing personal goes in localStorage.
- **Resume honesty.** Resumes use only facts from the user's CV text. Never invent experience,
  employers, numbers, skills, tools or certifications. The CV → ResumeFold conversion copies facts
  without rewriting, and goes through `cleanResumeFold`.
- **Rules first, AI second.** If the built-in AI is down, over today's allowance or not set up, sorting falls
  back to `ruleClassify` and setup still reads the CV with `profileFromCv`; job scoring and the CV conversion
  pause, with a note. `api/ai.js` only serves signed-in users (token audience = our client id), only the
  tasks classify/extract/score/cv, prompts ≤ 40k characters, `AI_DAILY_LIMIT` calls per user per day.
- **Untrusted text** (emails, AI output, CV, job boards) goes into the DOM with `h()` / `textContent` only, never `innerHTML`.
- **Never commit personal data** (CVs, keys, real emails, screenshots) to the repo or tests.
- **Job sources:** only official public APIs and the user's own alert emails. No scraping of sites whose terms forbid it.

## Browser realities
- Google Identity Services token client: tokens last about 1 hour. `G.resumeSession()` picks the
  token back up after a reload. When it expires, `NeedSignIn` shows a *Continue* banner; re-auth
  needs a click, because popups need a user gesture. `G.preload()` loads GIS early for the same reason.
- Syncs only happen while the page is open: on sign-in (unless the last one was under 10 minutes
  ago), every `autoUpdateHours` while open, or **Sync now**. `navigator.locks` keeps it to one tab.
- Gmail API: `threads.list` + `threads.get` (`format=full`), 8 at a time. Keep per-run work bounded
  (`MAX_THREADS`, `MAX_ALERT_THREADS`, `MAX_BOARD_CANDIDATES`; AI batches of 20, two at a time,
  applied oldest first so the dashboard fills in as it goes).
- AI free tiers change often. Don't hard-code "the best" model: defaults are in `PROVIDERS` and can be
  overridden with `GROQ_MODEL` / `GEMINI_MODEL`. On a 429 or 5xx, `askWith()` retries, then falls back to the next provider.

## Layout (`web/`)
- `index.html` + `css/landing.css` + `js/landing.js`: landing. `app.html` + `css/app.css`: the app.
  `css/tokens.css`: shared fonts, colours, buttons, chips. `privacy.html`.
- `config.js` (public OAuth client id), `sw.js` (caches only our own files; `npm run check` fails if
  a `js/` file is missing from `SHELL`), `manifest.webmanifest`, `icon.svg`, `vercel.json` (rewrites, headers),
  `package.json` (`type: module` for the functions), `robots.txt`, `sitemap.xml`.
- `api/ai.js`: the built-in AI (see the constraints). `api/workday.js`: reads a company's public Workday board
  (Workday has no CORS). Host, site and path are validated.
- `js/core.js`: **pure** logic: constants, settings and prefs, the data shape, Gmail body decoding,
  the classifier, applications, job prompts and `pickJobs`, job boards (`parseCareerUrl`,
  `listingsFromBoard`, `matchesPrefs`, `boardCandidates`), the ResumeFold hand-off
  (`resumeFoldPrompt`, `cleanResumeFold`, `resumeFoldFor`), and the dashboard numbers.
- `js/sources.js`: fetches job boards and full job descriptions. `js/docx.js`: **pure** ZIP + DOCX → text.
- `js/ai.js`: `PROVIDERS`, `askWith()` (shared with the server, so no DOM in this file), `useSharedAi()` / `ask()` for the page, `parseJsonLoose()`.
- `js/google.js`: sign-in, Gmail, Drive app data (`job-tracker.json`, `cv-original.*`).
- `js/update.js`: `runUpdate()` and `cvForResumeFold()`. `js/files.js`: CV import (pdf.js / DOCX / TXT), downloads.
- `js/notify.js`: browser notifications after a sync (status changes, new matches), only while the app is open; `notificationsFor()` is pure.
- `js/app.js`: boot, routing, sync, actions. Screens: `view-applications.js` (+ `view-board.js`: board, timeline, edit dialog), `view-matches.js`,
  `view-tailor.js`, `view-settings.js` (Profile and Settings). `onboarding.js`: the wizard plus the shared
  field blocks. `ui.js`: `h()`, `busy`, `holdButton`, `setLabel`, `icon`, `pageHead`, chips, dialogs. `demo.js`.
- `tests/`: Node tests: `core`, `files` (PDF lines), `notify`, `api` (the AI function, with fetch faked). `npm test` and `npm run check` must pass before any push.
- `scripts/serve.js` (local server on :5173, with the /app rewrites and /api functions), `scripts/check.js`.
- `docs/SETUP.md`: users and owner (Google Cloud + Vercel). Keep it in sync with behaviour changes. `docs/ROADMAP.md`: ideas.

## Data (one Drive app-data file per user, `job-tracker.json`)
`{version: 2, settings, applications[], jobs[], seen[] (≤5000), log[] (newest first, ≤300), cv, cvFile, cvFold, cvFoldHash, review[] (≤50), reviewDone[], lastRunAt}`.
- `settings`: onboarded, name, city, prefs {roles[], level, jobType, paidOnly, minPay,
  locations[], relocate, avoid[]}, jobsPerUpdate, autoUpdateHours, sinceDays, notify, companies[{ats, slug, name, host?, site?}].
  To add a setting, update `defaultSettings` + `normalizeSettings`
  (+ `prefsText` if the scorer should use it), the block in `onboarding.js`, and the docs.
- **Application:** id, company, role, channel, applied_on, status, furthest, last_update,
  next_step, next_at (`YYYY-MM-DD[THH:MM]`), next_kind (interview/deadline), round, email_link, posting_link,
  history[{on, status, by: email/you/quiet}] (≤30), key (`company|role` lowercased). `nextLabel()` makes the card pill.
- **review:** emails that look like an application update but couldn't be matched ("N emails need a look"); `addReview()`.
- **Job:** id, found_on, fit, company, role, location, pay, why, skill_gap, apply_by, link,
  details, status (New/Saved/Applied/Skipped/Expired), key, source, ref (board + id, for the full description), resumefold_at.
- `cvFold`: the CV as ResumeFold's Resume JSON, made once per CV (`cvFoldHash`).
- **Statuses:** Applied, Screening, Interview, Offer, Rejected, Withdrawn, Ghosted (shown as `STATUS_LABEL`: Screening = "Assessment",
  Ghosted = "No reply"). Board columns are `BOARD`. Furthest stage never moves backwards.

## Workflow
- `npm run dev`, then open http://localhost:5173/ (landing), `/app?demo` (sample data) or `/app?demo=setup` (the wizard).
  A real sign-in needs the client id in `web/config.js`, with `http://localhost:5173` as an authorized origin.
- Edit `web/`, then run `npm test` and `npm run check`.
- Design: tokens in `css/tokens.css` (the brief's palette and fonts; a pitch-dark theme under `prefers-color-scheme: dark`;
  colours only through tokens). Phones get a bottom tab bar; every screen must work at 390px. Check screens with the
  `design-taste-frontend` inspector (`--app` for app screens).
- Deploy: push to `main`, and Vercel builds `web/`.

## Style
Plain ES2020+ modules, no frameworks, no npm packages in `web/` (vendored libraries only).
User-facing text is short, friendly and in plain English.
