# Roadmap (ideas, not commitments)

## Next: make the first version solid
- [ ] First real run on a test account: verify OAuth scopes (`gmail.readonly` with GmailApp, `drive.file` for the Doc → PDF resume), per-user trigger timing, summary email, resume PDF look
- [ ] Better rule-based fallback (more Indian ATS senders: HirePro, Mettl, HackerEarth, Naukri RMS, Darwinbox, Workday)
- [x] Settings in the web page: day chips, time picker, pause toggle
- [x] "Mark applied" on Recommended jobs, which adds the application
- [x] Manual "Add application" for jobs that never emailed (LinkedIn Easy Apply, Naukri)

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
- [x] One shared web-app link (unverified apps: 100-user cap)
- [ ] Google app verification if it outgrows 100 users (needs a paid Gmail-scope security assessment)
- [ ] Short video / GIF of setup
