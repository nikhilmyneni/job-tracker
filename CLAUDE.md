# Job Tracker (free edition): context for Claude Code

## What this is
A free job-application tracker that lives entirely in the user's own Google account:
a Google Sheet with a bound Apps Script (`src/Code.gs`). It reads Gmail (read-only),
keeps an Applications tab current, picks recommended jobs from job-alert emails, writes
tailored one-page resume PDFs to Google Drive, and emails a daily summary. Optional AI
comes from the free Gemini API, using a key the user pastes into the Settings tab.

Target users: Indian freshers (first job / paid internships). Distribution: a Google
Sheets `/copy` link, so each user gets a private copy of sheet + script.

## Hard constraints (don't break these)
- **Free for users.** No servers, no paid APIs, no paid Google Workspace features.
  Only Apps Script, Sheets, Gmail, Drive, Docs, MailApp, and the Gemini API free tier
  (the user's own key).
- **Gmail is read-only.** Never send, delete, label, archive or modify mail. The only
  outgoing mail is the summary to the user's own address (`MailApp`).
- **No data leaves the user's account** except calls to Gemini when they added a key.
  No analytics, no telemetry, no third-party endpoints.
- **Resume honesty.** Resumes use only facts from the user's CV text. Never invent
  experience, employers, numbers, skills, tools or certifications. Skill gaps go in the
  "Skill to pick up" column, never on the resume.
- **Works without a Gemini key.** It falls back to rule-based classification
  (`ruleClassify_`). Job matching and resumes are skipped, with a note in the summary.
- **Hassle-free setup.** Everything is created by the `setup()` menu item. Users only
  paste their CV, tick settings, and optionally add a key.
- **Never commit personal data** (CVs, keys, real emails) to the repo or tests.

## Apps Script realities
- V8 runtime. Consumer accounts: 6 min max per execution, 90 min/day total trigger
  runtime, about 100 MailApp recipients/day, 20k UrlFetch calls/day. Keep per-run work
  bounded (`MAX_THREADS`, `MAX_RESUMES_PER_RUN`).
- One installable trigger: `hourlyCheck` runs every hour. It does the real work only at
  the user's chosen hour, on chosen days, once per day (`lastScheduledDay` property).
- State: processed Gmail message ids live in the hidden `_state` sheet (capped at 5000).
  `lastRunAt` and `resumeFolderId` live in DocumentProperties.
- Users copy the script, so they see the "Google hasn't verified this app" screen once.
  That's expected, and there's no need to publish or verify the app.
- `appsscript.json` lists OAuth scopes explicitly. If you add a Google service, add its
  scope there too. Prefer the narrowest scope that works. GmailApp read calls should
  work with `gmail.readonly`; verify in a real run whenever Gmail code changes.

## Layout
- `src/Code.gs`: everything (menu, setup, scheduling, Gmail sync, job matching, resume
  doc → PDF, Gemini client, summary email, helpers). Split into more `.gs` files if it
  grows; Apps Script loads all of them into one global scope.
- `src/appsscript.json`: manifest (time zone, V8, scopes).
- `tests/*.test.js`: Node tests for the pure functions, run with a tiny `vm` harness.
  `npm test` must pass before any push.
- `docs/SETUP.md`: the user-facing guide (owner + friends). Keep it in sync with
  behaviour changes.
- `docs/ROADMAP.md`: ideas, not commitments.

## Sheets created by `setup()`
Dashboard (formulas + chart) · Recommended jobs · Applications · Settings · My CV · Log
· `_state` (hidden). Settings live in fixed rows A1:B19 and are read by label in
`readSettings_`. If you add a setting, append a row and update both `buildSettings_`
and `readSettings_`, plus the docs.

Applications columns: Company, Role, Channel, Applied on, Status, Furthest stage, Last
update, Next step, Email (link), key (hidden, `company|role` lowercased).
Recommended jobs columns: Found on, Fit (1-5), Company, Role, Location, Pay, Why it fits,
Skill to pick up, Apply by, Apply (link), Resume (link), Status, key (hidden).
Statuses: Applied, Screening, Interview, Offer, Rejected, Withdrawn, Ghosted. Furthest
stage never moves backwards.

## Workflow
- Edit `src/`, run `npm test` and `npm run check`.
- Deploy to a real sheet: `npx clasp login` once, copy `.clasp.json.example` to
  `.clasp.json` with the sheet's script id (Extensions → Apps Script → Project Settings),
  then `npm run push`. Test in the sheet with **Job Tracker → Update now** and read the
  Log tab or `npm run logs`.
- Use a test Google account for manual runs where possible.

## Style
Plain ES2019+ JS (Apps Script V8). No build step, no npm packages inside `src/`.
User-facing text is short, friendly and in plain English.
