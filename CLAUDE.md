# Job Tracker (free edition): context for Claude Code

## What this is
A free job-application tracker that runs entirely in the user's own Google account: a
standalone Apps Script **web app** (`src/*.gs` + `src/*.html`), deployed once by the owner
with *Execute as: user accessing* and *Access: anyone with a Google account*. Each visitor
authorizes it and the code runs as them. It reads their Gmail (read-only), keeps their
applications current, picks recommended jobs from job-alert emails, writes tailored one-page
resume PDFs to their Drive, and emails them a daily summary. Optional AI comes from the free
Gemini API, using a key the user pastes into Settings on the page.

Target users: Indian freshers (first job / paid internships). Distribution: one shared web-app
link. Unverified apps with `gmail.readonly` are capped at 100 users.

## Hard constraints (don't break these)
- **Free for users.** No servers, no paid APIs, no paid Google Workspace features.
  Only Apps Script (HtmlService), Gmail, Drive, Docs, MailApp, and the Gemini API free tier
  (the user's own key).
- **Gmail is read-only.** Never send, delete, label, archive or modify mail. The only
  outgoing mail is the summary to the user's own address (`MailApp`).
- **No data leaves the user's account** except calls to Gemini when they added a key.
  No analytics, no telemetry, no third-party endpoints. The page loads no CDN scripts or
  fonts, and charts are hand-drawn SVG. The owner never sees users' data.
- **Resume honesty.** Resumes use only facts from the user's CV text. Never invent
  experience, employers, numbers, skills, tools or certifications. Skill gaps go in the
  "Skill to pick up" column, never on the resume.
- **Works without a Gemini key.** It falls back to rule-based classification
  (`ruleClassify_`). Job matching and resumes are skipped, with a note in the summary.
- **Hassle-free setup.** No setup step: the Drive folder and data file are created on first
  use, and saving settings installs or removes the trigger. Users only paste their CV, pick
  settings, and optionally add a key.
- **Never commit personal data** (CVs, keys, real emails) to the repo or tests.

## Apps Script realities
- V8 runtime. Consumer accounts: 6 min max per execution, 90 min/day total trigger
  runtime, about 100 MailApp recipients/day, 20k UrlFetch calls/day. Keep per-run work
  bounded (`MAX_THREADS`, `MAX_RESUMES_PER_RUN`).
- One installable trigger per user: `hourlyCheck` runs every hour as that user. It does
  the real work only at their chosen hour, on chosen days, once per day (`lastScheduledDay`).
- Everything is per user: `PropertiesService.getUserProperties()`, `LockService.getUserLock()`.
  Never use Script/Document properties for user data.
- Users see the "Google hasn't verified this app" screen once. That's expected.
- Web-app returns (`google.script.run`) must be plain JSON: store dates as `yyyy-mm-dd` or
  ISO strings, never Date objects. The Gemini key never goes back to the browser (`getState`).
- `appsscript.json` lists OAuth scopes explicitly. If you add a Google service, add its
  scope there too. Prefer the narrowest scope that works. GmailApp read calls should
  work with `gmail.readonly`, and Drive with `drive.file` (we only touch files we create);
  verify in a real run whenever Gmail or Drive code changes.

## Layout
- `src/Store.gs`: constants, settings (UserProperties, `normalizeSettings_`), the Drive JSON
  data file (`loadData_` / `saveData_`), log, helpers.
- `src/Sync.gs`: Gmail application sync, `ruleClassify_`, and pure updates on the
  applications list (`upsertApplication_`, `markGhosted_`, `expireJobs_`, `collectDue_`).
- `src/Jobs.gs`: job matching from alert emails. `src/Resume.gs`: Doc → PDF resume.
  `src/Gemini.gs`: Gemini client. `src/Email.gs`: summary text and email.
- `src/Main.gs`: `doGet`, the functions the page calls (`getState`, `saveSettings`, `saveCv`,
  `runNow`, `makeResume`, `setJobStatus`, `addApplication`, `setApplicationStatus`,
  `deleteApplication`, `removeAutomation`), the trigger, and `runUpdate_`.
- `src/index.html` + `styles.html` + `app.html`: the single page (included with
  `<?!= include('name'); ?>`). Plain JS. Build DOM with `h()` / `textContent`, never `innerHTML`
  with data.
- `src/appsscript.json`: manifest (time zone, V8, `webapp`, scopes).
- `tests/*.test.js`: Node tests for the pure functions. The `vm` harness loads all `src/*.gs`.
  `npm test` and `npm run check` (`scripts/check.js`) must pass before any push.
- `docs/SETUP.md`: the guide (users + owner). Keep it in sync with behaviour changes.
- `docs/ROADMAP.md`: ideas, not commitments.

## Data
One Drive file per user, `Job Tracker/Job Tracker data.json`:
`{version, applications[], jobs[], seen[] (≤5000), log[] (newest first, ≤300), cv}`.
Settings in UserProperties `settings` (JSON). Add a setting: update `defaultSettings_`,
`normalizeSettings_`, the Settings form in `index.html`/`app.html`, and the docs.

Application: id, company, role, channel, applied_on, status, furthest, last_update,
next_step, email_link, key (`company|role` lowercased).
Job: id, found_on, fit (1-5), company, role, location, pay, why, skill_gap, apply_by, link,
details, resume_url, status (New/Applied/Skipped/Expired), key.
Statuses: Applied, Screening, Interview, Offer, Rejected, Withdrawn, Ghosted. Furthest
stage never moves backwards.

## Workflow
- Edit `src/`, run `npm test` and `npm run check`.
- Deploy: `npx clasp login` once, then copy `.clasp.json.example` to `.clasp.json` with the
  standalone script's id and run `npm run push`. Then **Deploy → Manage deployments → Edit →
  New version** so the shared `/exec` link picks it up (the `/dev` link always runs the latest code).
- Test with a test Google account: open the link, then **Update now**. Read **Recent
  activity** on the page, or `npm run logs`.

## Style
Plain ES2019+ JS (Apps Script V8). No build step, no npm packages inside `src/`.
User-facing text is short, friendly and in plain English.
