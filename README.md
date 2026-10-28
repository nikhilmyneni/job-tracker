# Job Tracker: free web app

A free, hassle-free job application tracker for freshers. It's one web page, and it runs entirely in your own Google account:

- **Tracks applications from Gmail** (read-only): applied → test → interview → offer / rejected, plus "Ghosted" after 21 days of silence
- **Recommends jobs** from your LinkedIn / Naukri / Internshala / Indeed alert emails, scored against your CV *(free Gemini key)*
- **Tailored one-page resume** for any recommended job, on request. It opens in your browser, you can edit it there, and save it as PDF. Nothing is stored in Drive *(free Gemini key)*
- **Daily summary email** on the days and at the time you choose, with a pause switch
- **One page** with counts, reply rate, best channel, recommended jobs, a stage funnel, applications per week, reply rate per channel, all applications (sortable, editable) and settings

No subscription, no server, no sheet, no app to install. → **User guide: [docs/SETUP.md](docs/SETUP.md)**

## Develop

```bash
npm install          # installs clasp (Google's Apps Script CLI)
npm test             # tests for the pure logic
npm run check        # syntax check of src/*.gs and the page script
npx clasp login      # once
cp .clasp.json.example .clasp.json   # paste your standalone script's id
npm run push         # upload src/ to the Apps Script project
```

Then deploy it as a web app (Execute as: user accessing, access: anyone with a Google account). See the owner steps in [docs/SETUP.md](docs/SETUP.md). Run logs are under **Recent activity** on the page (or `npm run logs`).

See [CLAUDE.md](CLAUDE.md) for architecture and constraints, and [docs/ROADMAP.md](docs/ROADMAP.md) for ideas.

## Privacy

Your data stays in your Google account. Gmail is read-only. If you add a Gemini key, short email snippets and your CV text are sent to Google's Gemini API to sort emails, match jobs and write resumes. On the free tier, Google may use that data to improve its products.

## License

MIT
