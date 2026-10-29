# Job Tracker

A free job-application tracker for freshers, built as a website that runs entirely in your browser:

- **Tracks applications from Gmail** (read-only): applied → test → interview → offer / rejected. It marks "Ghosted" after 21 days of silence.
- **Sets up around you:** a short first-run setup collects your roles, level, pay, locations, skip list and CV. You can change any of it later.
- **Recommends jobs** from your LinkedIn / Naukri / Internshala / Indeed alert emails, scored 1–5 against your CV and preferences.
- **Tailored one-page resume** for any job, on request. You can edit it in the browser and download it as **PDF** or **Word**.
- **Upload your CV** as PDF, Word or text, all read in the browser.
- **Free AI with backups:** your own Gemini, Groq or OpenRouter key. When one runs out of quota, the next one takes over.
- **Dashboard:** reply rate, best channel, stage funnel, applications per week, and reply rate per channel.
- **Installable** as an app on desktop and phone.

No server, no subscription. Your data lives in a hidden app folder in your own Google Drive. The guide is in **[docs/SETUP.md](docs/SETUP.md)**.

## Develop

```bash
npm run dev      # http://localhost:5173  (demo with made-up data: /?demo, setup wizard: /?demo=setup)
npm test         # Node tests for the pure logic (web/js/core.js, docx.js, ai.js)
npm run check    # syntax check
```

Plain HTML, CSS and ES modules in `web/`, with no build step. pdf.js and jsPDF are vendored in `web/vendor/` (see `VERSIONS.txt`). It deploys as a static site, on Vercel with root directory `web`. See [CLAUDE.md](CLAUDE.md) for architecture and constraints, and [docs/ROADMAP.md](docs/ROADMAP.md) for ideas.

## Privacy

Gmail is read-only. Data goes only between your browser, Google (Gmail and your Drive's app folder) and, if you add a key, that AI provider. Free AI tiers may use what you send to improve their models.

## License

MIT. Vendored libraries keep their own licenses: pdf.js is Apache-2.0 and jsPDF is MIT.
