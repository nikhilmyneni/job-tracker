# Job Hunter

A free job-hunting web app for freshers in India, live at https://jobs4you.vercel.app:

- **Tracks applications from Gmail** (read-only) on a board: applied → assessment → interview → offer / rejected,
  with interview times and deadlines, and "No reply" after 21 days of silence.
- **Sets up from your CV:** drop your CV and the setup fills in your name, city, roles, level and locations.
  Change anything later.
- **Finds openings** from your job-alert emails (LinkedIn, Naukri, Internshala, Indeed, Wellfound, foundit…) and
  the career pages of companies you follow (Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee,
  Workday), scored against your CV.
- **Tailored resumes** through ResumeFold, on request, built only from your CV.
- **AI built in and free:** nothing to set up.
- **Notifications** for status changes and new matches, a pitch-dark theme that follows your system, works on
  phones, installable as an app.

Your data lives in a hidden app folder in your own Google Drive. The guide is in **[docs/SETUP.md](docs/SETUP.md)**.

## Develop

```bash
npm run dev      # http://localhost:5173  (app: /app, sample data: /app?demo, setup: /app?demo=setup)
npm test         # Node tests (core, files, notifications, the AI function)
npm run check    # syntax check, and that the service worker caches every module
```

Plain HTML, CSS and ES modules in `web/`, with no build step. pdf.js and the fonts are vendored in `web/vendor/`
(see `VERSIONS.txt`). It deploys on Vercel with root directory `web`; `web/api/` holds two small functions
(the built-in AI, and Workday job boards). Their keys go in Vercel environment variables, or `.env.local` locally.
See [CLAUDE.md](CLAUDE.md) for architecture and constraints, and [docs/ROADMAP.md](docs/ROADMAP.md) for ideas.

## Privacy

Gmail is read-only. Your data stays in your browser and your own Google Drive. The built-in AI passes text
through to Groq (Gemini as a backup) and keeps nothing; free AI tiers may use what's sent to improve their models.
No analytics, ads or cookies.

## License

MIT. Vendored libraries keep their own licenses: pdf.js is Apache-2.0, and the fonts are under the SIL Open Font License.
