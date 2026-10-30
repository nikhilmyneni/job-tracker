# Job Hunter: context for Claude Code

## What this is
A free job-hunting web app for Indian freshers that runs **in the browser** (`web/`, plain
HTML/CSS/ES modules, no build step), hosted free on Vercel (root directory `web`). Users sign in with
Google. The page talks straight to Gmail (read-only), to a hidden Drive **appDataFolder** file where
all their data lives, and to public company job boards. The AI is **built in**: users never add keys.
The only server code is small Vercel functions in `web/api/` (free plan): `ai.js` (the built-in AI, using
the owner's free Groq + Gemini keys from environment variables) and `workday.js` (a job source without CORS).
`_auth.js` is the signed-in check and daily allowance (Vercel doesn't serve files starting with `_`).

- `/`: the landing page (`index.html`, readable by search engines).
- `/app`, `/app/matches`, `/app/tailor[/<jobId>]`, `/app/profile`, `/app/settings`: the app
  (`app.html`; Vercel rewrites `/app/*` to it, and `scripts/serve.js` does the same locally).

Flow: sign in → first-run **setup wizard**, CV first (drop a file or paste; `profileFromCv` then fills in name,
city, roles, level and locations), then roles, level, job type, pay, locations (city search from the first letter,
`placeMatches`), skip list, **Connect Gmail (optional)**, companies to follow, routine → Applications (Board / Table / Timeline). Everything from setup can be changed in
Profile and CV or Settings.

The Google OAuth app is published but unverified. **Sign-in asks only for non-sensitive scopes** (openid, email,
profile, drive.appdata), so it shows no warning once the brand is verified. Gmail is a separate, optional step
(`G.connectGmail()` adds `gmail.readonly` with incremental auth); only that step shows Google's unverified screen
and counts toward the 100-user cap. Without Gmail, users add applications by hand or **paste an email**
(`parsePastedEmail` → rules → AI), and syncs only check company job boards (`runUpdate(..., { gmail: false })`).

## Hard constraints (don't break these)
- **Free.** No paid APIs or services. Server code only as free Vercel functions, and only when a
  source can't be called from the browser.
- **Gmail is read-only** (`gmail.readonly`). Never send, delete, label or modify mail. There's no outgoing mail at all.
- **Narrow scopes:** sign-in `drive.appdata`, `openid`, `email`, `profile`; plus `gmail.readonly` only when the user connects Gmail. No full Drive, no Docs.
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
- **Rules first, AI second.** Matching never needs the AI: `matchScore` is a weighted keyword overlap (title ×2,
  your keywords ×1.5, a fifth from the title's fit with your roles) over `SKILL_VOCAB` + aliases, your skills
  (`mySkills`: CV skills + added − removed) and your keywords. If the AI is down, over today's allowance or not set
  up, sorting falls back to `ruleClassify`; only reading job-alert emails and the ResumeFold conversion pause. `api/ai.js` only serves signed-in users (token audience = our client id), only the
  tasks classify/extract/cv, prompts ≤ 40k characters, `AI_DAILY_LIMIT` calls per user per day.
- **Untrusted text** (emails, AI output, CV, job boards) goes into the DOM with `h()` / `textContent` only, never `innerHTML`.
- **Never commit personal data** (CVs, keys, real emails, screenshots) to the repo or tests.
- **Job sources:** only official public APIs and the user's own alert emails. No scraping of sites whose terms forbid it.

## Browser realities
- Google Identity Services token client: tokens last about 1 hour. `G.resumeSession()` picks the
  token back up after a reload. When it expires, `NeedSignIn` shows a *Continue* banner; re-auth
  needs a click, because popups need a user gesture. `G.preload()` loads GIS early for the same reason.
- Syncs only happen while the page is open (there's no server holding Gmail access, by design). The routine
  (`settings.schedule`: on, days, `gmailAt`, `jobsAt`, on the device's clock) says when: `scheduleDue()` runs each part
  once after its latest time on a chosen day, so a time missed while the page was closed runs on the next open. Checked on
  open and every minute; a failed automatic try waits `MIN_UPDATE_GAP_MIN`. **Sync now** runs both. `navigator.locks` keeps it to one tab.
- Gmail API: `messages.list` (every page, up to `MAX_LISTED`) + `messages.get` (`format=full`) for unread ones only, 4 at a time. Up to `MAX_EMAILS` per sync, oldest first; the rest wait for the next sync (`gmailRunAt` only moves once none are left). Gmail limits reads per user per minute:
  on a 429 or a 403 rate/quota error, `gfetch` waits (Retry-After, else 8/15/30/60 s) and retries, and the sync bar says so. Keep per-run work bounded
  (`MAX_EMAILS`, `MAX_ALERT_EMAILS`, `MAX_BOARD_CANDIDATES`; AI batches of 20, two at a time,
  applied oldest first so the dashboard fills in as it goes).
- AI free tiers change often. Don't hard-code "the best" model: defaults are in `PROVIDERS` and can be
  overridden with `GROQ_MODEL` / `GEMINI_MODEL`. On a 429 or 5xx, `askWith()` retries, then falls back to the next provider.

## Layout (`web/`)
- `index.html` + `css/landing.css` + `js/landing.js`: landing. `app.html` + `css/app.css`: the app.
  `css/tokens.css`: shared fonts, colours, buttons, chips. `privacy.html`.
- `config.js` (public OAuth client id), `sw.js` (caches only our own files; `npm run check` fails if
  a `js/` file is missing from `SHELL`), `manifest.webmanifest`, `icon.svg`, `vercel.json` (rewrites, headers),
  `package.json` (`type: module` for the functions), `robots.txt`, `sitemap.xml`.
- `api/ai.js`: the built-in AI (see the constraints). `api/_auth.js`: shared token check and allowance. `api/workday.js`: reads a company's public Workday board
  (Workday has no CORS). Host, site and path are validated.
- `js/core.js`: **pure** logic: constants, settings and prefs, the data shape, Gmail body decoding,
  the classifier, applications, job prompts, matching (`termsIn`, `mySkills`, `matchScore`, `pickByScore`,
  `filterJobs`), CV sections (`cvSections`), job boards (`parseCareerUrl`,
  `listingsFromBoard`, `matchesPrefs`, `boardCandidates`), the ResumeFold hand-off
  (`resumeFoldPrompt`, `cleanResumeFold`, `resumeFoldFor`), the resume tailor (`TEMPLATES`, `pastedJob` for a pasted description, `resumeFromCv` by rules,
  `tailorSuggestions` / `applySuggestions` / `tailorScore`, `highlightJd`, `honestRewrite` for AI summaries, `resumeLatex`),
  and the dashboard numbers.
- `js/sources.js`: fetches job boards and full job descriptions. `js/docx.js`: **pure** ZIP + DOCX → text, and the resume as a .docx (`resumeDocx`).
- `js/ai.js`: `PROVIDERS`, `askWith()` (shared with the server, so no DOM in this file), `useSharedAi()` / `ask()` for the page, `parseJsonLoose()`.
- `js/google.js`: sign-in, Gmail, Drive app data (`job-tracker.json`, `cv-original.*`).
- `js/update.js`: `runUpdate()` and `cvForResumeFold()`. `js/files.js`: CV import (pdf.js / DOCX / TXT), downloads.
- `js/notify.js`: browser notifications after a sync (status changes, new matches), only while the app is open; `notificationsFor()` is pure.
- `js/app.js`: boot, routing, sync, actions. Screens: `view-applications.js` (+ `view-board.js`: board, timeline, edit dialog), `view-matches.js`,
  `view-tailor.js`, `view-settings.js` (Profile and Settings). `onboarding.js`: the wizard plus the shared
  field blocks. `ui.js`: `h()`, `busy`, `holdButton`, `setLabel`, `icon`, `pageHead`, chips, dialogs. `demo.js`.
- `tests/`: Node tests: `core`, `match`, `files` (PDF lines), `notify`, `api` (the AI function), `google` (rate-limit retries, paging) and `tailor` (suggestions, LaTeX, .docx), with fetch faked. `npm test` and `npm run check` must pass before any push.
- `scripts/serve.js` (local server on :5173, with the /app rewrites and /api functions), `scripts/check.js`.
- `docs/SETUP.md`: users and owner (Google Cloud + Vercel). Keep it in sync with behaviour changes. `docs/ROADMAP.md`: ideas.

## Data (one Drive app-data file per user, `job-tracker.json`)
`{version: 2, settings, applications[], jobs[], seen[] (≤5000), log[] (newest first, ≤300), cv, cvFile, cvFold, cvFoldHash, review[] (≤50), reviewDone[], lastRunAt, gmailRunAt, gmailScan, jobsRunAt}`.
`gmailRunAt` is when Gmail was last read (so connecting it later still looks back `sinceDays`); it only moves once every matching email is read. `gmailScan` 2 marks data read the per-message way (older data looks back `sinceDays` once).
- `settings`: onboarded, name, city, prefs {roles[], level, jobType, paidOnly, minPay,
  locations[], relocate, roleRange (core/related: `roleFits`), avoid[]}, schedule {on, days[] (0 = Sun), gmailAt, jobsAt}, jobsPerUpdate (per day), sinceDays, notify, keywords[], minMatch (0–90),
  matchView {location, experience, internships, hideApplied}, companies[{ats, slug, name, host?, site?}].
  To add a setting, update `defaultSettings` + `normalizeSettings`
  (+ `prefsText` if the scorer should use it), the block in `onboarding.js`, and the docs.
- **Application:** id, company, role, channel, applied_on, status, furthest, last_update,
  next_step, next_at (`YYYY-MM-DD[THH:MM]`), next_kind (interview/deadline), round, email_link, posting_link,
  history[{on, status, by: email/you/quiet}] (≤30), key (`company|role` lowercased). `nextLabel()` makes the card pill.
- **review:** emails that look like an application update but couldn't be matched ("N emails need a look"); `addReview()`.
- **Job:** id, found_on, posted, score (0–100), fit (score/20), matched[], missing[], company, role, location, pay, why,
  skill_gap, apply_by, link, details, jd (full description, fetched when opened), status (New/Saved/Applied/Skipped/Expired),
  key, source ('Pasted' for one pasted into the tailor), ref (board + id, for the full description), resumefold_at, tailored {accepted[], confirmed[], template, extra[] (an AI summary that
  passed `honestRewrite`), at} (the tailored resume is rebuilt from these).
- `skillsAdded[]`, `skillsRemoved[]`: your edits to the skills read from the CV (Profile).
- `cvFold`: the CV as ResumeFold's Resume JSON, made once per CV (`cvFoldHash`).
- **Statuses:** Applied, Screening, Interview, Offer, Rejected, Withdrawn, Ghosted (shown as `STATUS_LABEL`: Screening = "Assessment",
  Ghosted = "No reply"). Board columns are `BOARD`. Furthest stage never moves backwards.

## Workflow
- `npm run dev`, then open http://localhost:5173/ (landing), `/app?demo` (sample data) or `/app?demo=setup` (the wizard).
  A real sign-in needs the client id in `web/config.js`, with `http://localhost:5173` as an authorized origin.
- Edit `web/`, then run `npm test` and `npm run check`.
- Design: tokens in `css/tokens.css` (the brief's palette and fonts; a pitch-dark theme under `prefers-color-scheme: dark`;
  colours only through tokens). Desktop sidebar is an icon rail by default and slides out on hover or focus; its button keeps it open
  (`wireSidebar`, `.side-collapsed`; the choice is a display pref in localStorage). Phones get a bottom tab bar; every screen must work at 390px. Check screens with the
  `design-taste-frontend` inspector (`--app` for app screens).
- Deploy: push to `main`, and Vercel builds `web/`.

## Style
Plain ES2020+ modules, no frameworks, no npm packages in `web/` (vendored libraries only).
User-facing text is short, friendly and in plain English.
