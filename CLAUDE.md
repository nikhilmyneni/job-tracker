# Job Tracker: context for Claude Code

## What this is
A free job-application tracker that is a **static website running entirely in the browser**
(`web/`, plain HTML/CSS/ES modules, no build step). Users sign in with Google. The page then
talks straight to Gmail (read-only), to a hidden Drive **appDataFolder** file where all their data
lives, and, if they added a key, to a free AI provider (Gemini, Groq or OpenRouter). There's no
server. It's hosted for free on Vercel (root directory `web`).

Flow: sign in → first-run **setup wizard** (roles, level, job type, pay, locations, skip list,
CV upload, AI keys, routine) → dashboard. Everything from setup can be changed in Settings.

Target users: Indian freshers (first job / paid internships). One shared site. The Google OAuth
app is published but unverified, so users see the unverified screen and there's a 100-user cap.

## Hard constraints (don't break these)
- **Free.** No servers, no paid APIs, no paid services. Static hosting only.
- **Gmail is read-only** (`gmail.readonly`). Never send, delete, label or modify mail. There's no outgoing mail at all.
- **Narrow scopes:** `gmail.readonly`, `drive.appdata`, `openid`, `email`, `profile`. No full Drive, no Docs.
- **No data leaves the user's browser** except to Google (Gmail, the Drive app folder) and to the
  AI provider whose key the user added. No analytics, no telemetry, no CDNs. pdf.js and jsPDF are
  vendored in `web/vendor/`. The CSP in `index.html` is the allow-list: keep it tight when adding an origin.
- **Secrets:** the access token lives in memory only. AI keys live only in the user's Drive app
  data. Nothing personal goes in localStorage.
- **Resume honesty.** Resumes use only facts from the user's CV text. Never invent experience,
  employers, numbers, skills, tools or certifications. Skill gaps go in "Skill to pick up",
  never on the resume. Every AI resume goes through `cleanResume`.
- **Works without an AI key.** Classification falls back to `ruleClassify`. Job matching and
  resumes are off, with a note.
- **Untrusted text** (emails, AI output, CV) goes into the DOM with `h()` / `textContent` only, never `innerHTML`.
- **Never commit personal data** (CVs, keys, real emails, screenshots) to the repo or tests.

## Browser realities
- Google Identity Services token client: tokens last about 1 hour. When one expires,
  `NeedSignIn` shows a *Continue* banner; re-auth needs a click, because popups need a user gesture.
  `G.preload()` loads GIS early for the same reason.
- Updates only happen while the page is open: **Update now**, or automatically on open when the
  last run is older than `autoUpdateHours`. `navigator.locks` keeps it to one tab at a time.
- Gmail API: `threads.list` + `threads.get` (`format=full`), 4 at a time. Keep per-run work bounded
  (`MAX_THREADS`, `MAX_ALERT_THREADS`, batches of 12 / 4 for AI).
- AI free tiers change often. Don't hard-code "the best" model: defaults are aliases
  (`gemini-flash-latest`), and **Test key** lists the models the key can use right now. On a 429
  or 5xx, `ask()` retries, then falls back to the next provider.

## Layout (`web/`)
- `index.html` (CSP, screens), `styles.css`, `config.js` (public OAuth client id), `sw.js` (caches
  only our own files), `manifest.webmanifest`, `icon.svg`, `vercel.json` (headers).
- `js/core.js`: **pure** logic: constants, settings and prefs (`normalizeSettings`, `prefsText`),
  the data shape, Gmail body decoding, the classifier, applications (`upsertApplication`,
  `markGhosted`, `expireJobs`, `collectDue`), job prompts and `pickJobs`, the resume prompt,
  `cleanResume`, `resumeBlocks` / `applyResumeEdits`, and the dashboard numbers.
- `js/docx.js`: **pure** ZIP read/write, DOCX → text (CV import), resume → DOCX.
- `js/ai.js`: providers, `ask()` with fallback, `listModels()`, `parseJsonLoose()`.
- `js/google.js`: sign-in, Gmail, Drive app data (`job-tracker.json`, `cv-original.*`).
- `js/update.js`: `runUpdate()` and `writeResume()`.
- `js/files.js`: CV import (pdf.js / DOCX / TXT), resume → PDF (jsPDF, WinAnsi-safe text via `pdfSafe`), downloads.
- `js/app.js` (boot and actions), `dashboard.js`, `settings.js`, `onboarding.js` (wizard plus the
  shared field blocks), `resume-view.js` (A4 sheet; edits read back through `data-path`), `ui.js`, `demo.js`.
- `tests/core.test.mjs`: Node tests for core, docx and ai. `npm test` and `npm run check` must pass before any push.
- `scripts/serve.js` (local server on :5173), `scripts/check.js`.
- `docs/SETUP.md`: users and owner (Google Cloud + Vercel). Keep it in sync with behaviour changes.
  `docs/ROADMAP.md`: ideas.

## Data (one Drive app-data file per user, `job-tracker.json`)
`{version: 2, settings, applications[], jobs[], seen[] (≤5000), log[] (newest first, ≤300), cv, cvFile, lastRunAt}`.
- `settings`: onboarded, name, city, prefs {roles[], level, jobType, paidOnly, minPay,
  locations[], relocate, avoid[]}, jobsPerUpdate, autoUpdateHours, sinceDays, ai[{provider, key, model}].
  To add a setting, update `defaultSettings` + `normalizeSettings` (+ `prefsText` if the scorer
  should use it), the block in `onboarding.js`, and the docs.
- **Application:** id, company, role, channel, applied_on, status, furthest, last_update,
  next_step, email_link, key (`company|role` lowercased).
- **Job:** id, found_on, fit, company, role, location, pay, why, skill_gap, apply_by, link,
  details, status (New/Applied/Skipped/Expired), key, resume (cleaned JSON), resume_at.
- **Statuses:** Applied, Screening, Interview, Offer, Rejected, Withdrawn, Ghosted. Furthest stage never moves backwards.

## Workflow
- `npm run dev`, then open http://localhost:5173/?demo (sample data) or `/?demo=setup` (the wizard).
  A real sign-in needs the client id in `web/config.js`, with `http://localhost:5173` as an authorized origin.
- Edit `web/`, then run `npm test` and `npm run check`. When you add or rename a file in `web/js`,
  update the `SHELL` list in `sw.js` and bump `CACHE`.
- Deploy: push to `main`, and Vercel builds `web/`.

## Style
Plain ES2020+ modules, no frameworks, no npm packages in `web/` (vendored libraries only).
User-facing text is short, friendly and in plain English.
