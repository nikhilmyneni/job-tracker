# Job Tracker: free Google Sheets edition

A free, hassle-free job application tracker for freshers. It lives entirely in your own Google account:

- **Tracks applications from Gmail** (read-only): applied → test → interview → offer / rejected, plus "Ghosted" after 21 days of silence
- **Recommends jobs** from your LinkedIn / Naukri / Internshala / Indeed alert emails, scored against your CV *(free Gemini key)*
- **Tailored one-page resume PDF** for each recommended job, saved to your Google Drive *(free Gemini key)*
- **Daily summary email** on the days and at the time you choose, with a pause switch
- **Dashboard tab** with counts, reply rate and a status chart

No subscription, no server, no app to install. → **User guide: [docs/SETUP.md](docs/SETUP.md)**

## Develop

```bash
npm install          # installs clasp (Google's Apps Script CLI)
npm test             # tests for the pure logic
npm run check        # syntax check of src/Code.gs
npx clasp login      # once
cp .clasp.json.example .clasp.json   # paste your sheet's script id
npm run push         # upload src/ to the bound Apps Script project
```

Then in the sheet: **Job Tracker → 1. Set up**, then **Update now**. Logs are in the **Log** tab (or `npm run logs`).

See [CLAUDE.md](CLAUDE.md) for architecture and constraints, and [docs/ROADMAP.md](docs/ROADMAP.md) for ideas.

## Privacy

Your data stays in your Google account. Gmail is read-only. If you add a Gemini key, short email snippets and your CV text are sent to Google's Gemini API to sort emails, match jobs and write resumes. On the free tier, Google may use that data to improve its products.

## License

MIT
