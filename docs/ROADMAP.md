# Roadmap (ideas, not commitments)

## Next: make the first version solid
- [ ] First real run on a test account: verify OAuth scopes (`gmail.readonly` with GmailApp), trigger timing, summary email, resume PDF look
- [ ] Better rule-based fallback (more Indian ATS senders: HirePro, Mettl, HackerEarth, Naukri RMS, Darwinbox, Workday)
- [ ] Settings sidebar (HtmlService) instead of editing cells: day chips, time picker, pause toggle
- [ ] "Mark as applied" checkbox on Recommended jobs, which creates the Applications row by hand
- [ ] Manual "Add application" for jobs that never emailed (LinkedIn Easy Apply, Naukri)

## Better job sources (still free)
- [ ] Greenhouse / Lever public job-board APIs for a list of companies the user follows
- [ ] Jooble API (free key) as an optional source
- [ ] Fetch the listing page (UrlFetchApp) where allowed, for a fuller job description before tailoring

## Better resumes
- [ ] HTML → PDF resume template (HtmlService + Drive conversion) for a ResumeFold-like look
- [ ] Export a ResumeFold JSON alongside each PDF so users can fine-tune at delta-dog.github.io/resumefold
- [ ] Cover-note draft per job (as a Google Doc, never sent automatically)

## Notifications
- [ ] Optional Telegram bot message instead of / besides email (user's own bot token)
- [ ] Deadline reminders (apply-by within 2 days, assessment pending for 3+ days)

## Distribution
- [ ] Template sheet with a `/copy` link and a short landing page (e.g. under psquad.codes)
- [ ] Short video / GIF of setup
