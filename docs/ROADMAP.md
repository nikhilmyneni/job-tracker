# Roadmap (ideas, not commitments)

## Next: make the first version solid
- [ ] First real run on a test account: consent screen shows only the 5 scopes, Update now fills applications, `job-tracker.json` appears in Drive → Manage apps, resume PDF/Word downloads, silent re-sign-in after an hour
- [ ] Better rule-based fallback (more Indian ATS senders: HirePro, Mettl, HackerEarth, Naukri RMS, Darwinbox, Workday)
- [x] Standalone website (no Apps Script): own URL, Google sign-in, installable
- [x] First-run setup wizard for preferences; everything editable in Settings
- [x] CV upload (PDF / Word / text) read in the browser
- [x] Resume downloads as PDF and Word, with edits
- [x] Several free AI providers with automatic fallback, plus a live model list per key
- [x] "Mark applied" and manual "Add application"

## Better job sources (still free)
- [ ] Greenhouse / Lever public job-board APIs for companies the user follows
- [ ] Optional free job APIs where the provider allows browser calls

## Better resumes
- [ ] Export a ResumeFold JSON alongside each resume so users can fine-tune at delta-dog.github.io/resumefold
- [ ] Cover-note draft per job (download only, never sent)
- [ ] A second resume template (two-column skills)

## Notifications (no server, so limited)
- [ ] Browser notification after an update finds something new (while the app is open)
- [ ] Deadline reminders inside the app (apply-by within 2 days, assessment pending for 3+ days)

## Distribution
- [x] One shared site (unverified OAuth app: 100-user cap)
- [ ] Google app verification if it outgrows 100 users (needs a paid Gmail-scope security assessment)
- [ ] Short video / GIF of setup
