# Job Hunter: guide

A free website for freshers that keeps every job application in one place from your Gmail (read-only),
finds openings that fit your CV, and helps you tailor a one-page resume. It runs in your browser, and your
data stays in a hidden app folder in your own Google Drive.

---

## For users (about 3 minutes)

1. Open the site and click **Sign in with Google**. This only shares your name and email, and gives Job Hunter
   a hidden folder in your Drive for your data.
2. Setup is three steps. **Upload your CV** (a PDF, Word or text file, or paste the text). **Check what we found**: your name,
   city, the jobs you want, fresher job or internship, and where (your city, Remote and anywhere in India to start).
   **Get new jobs by email?** Yes or No thanks. Then you're on Home.
3. Job Hunter already searches about 40 companies hiring in India (start-ups and MNCs like Accenture, Cisco, Adobe,
   Salesforce, Citi and Visa) every day at 9. Change the routine, companies and skip list any time in Settings.
4. **Connect Gmail (optional)** from the card on Home. It lets your applications track themselves. Google shows a
   "Google hasn't verified this app" screen: click **Advanced → Go to Job Hunter**, tick the box to read your email, and
   click **Continue**. The first check reads the last 30–120 days and applications appear as they're sorted.

There's nothing else to set up: the AI is built in and free.

**Install it like an app:** in Chrome or Edge, use the install icon in the address bar. On a phone, use *Add to Home screen*.

### Everyday use
- **Syncing:** set your routine in setup or **Settings → Routine**: the days, when Gmail is read, and when new jobs
  should be ready (on your device's clock), plus the role range and how many new jobs a day. There's no background
  server, so Job Hunter syncs while it's open: if it was closed at those times, it catches up as soon as you open it.
  **Check my emails** runs everything straight away. Each job search reads the best postings in full and leaves out ones that
  need 2+ years, are unpaid, ask for a fee, or are bulk "Dear Candidate" invites; at least half your picks are your core
  roles when there are good ones. **Which jobs to show** can also be *Also a stretch*: other roles where you'd only need one more skill. On the day you sign up, Job Hunter also looks for jobs every two hours
  while it's open, until you have that day's matches.
- **Email alerts (optional):** say yes in setup, or turn on *Email me when new jobs are ready* in **Settings → Routine**. At your
  "New jobs ready by" time, Job Hunter looks through the companies you follow even while it's closed and emails you the
  new jobs (and they're waiting in Jobs for you next time you open it). It keeps only what matching needs, never your
  CV or Gmail; turning it off, or *Stop these emails* in an alert, deletes it.
- **Home:** what to do next: new jobs to apply to, "Did you apply?" for job pages you opened, interviews and tests coming up,
  and how many applications are waiting.
- **Applying:** press **Apply** on any job. Step 1 downloads your resume made for that job, step 2 opens the job page, and
  step 3 asks "Done applying?": say yes and it goes on My applications. Nothing is ever sent for you.
- **Old applications:** applications with no change for 30 days (Settings → Routine: 14, 30, 60 days or never) move to
  **Old applications**, off the board. A new email about one brings it back, or click **Bring back**. You can move one there by hand too.
- **My applications:** Board, Table or Timeline. Drag a card to another column, or tap it to fix the status,
  role, next step or interview time. "We need your help with N emails" lists emails it couldn't match.
- **Jobs for you:** openings from your job-alert emails and the companies you follow, with how well each fits your CV
  in words and where it came from (a company's site, LinkedIn, Indeed, Naukri…). Search by company or source; **Filter** sets the place, which fits to show, internships, experience and your must-have words; tap a job
  to read it. **Resume for a job** (⋯ → Make my resume fit, or paste any job ad) shows how well your resume fits, and
  **Make the safe changes** moves up and shows what your CV already says. *See each change* lets you undo any one (adding a
  skill your CV doesn't show needs you to confirm it's true); *Show the job ad* highlights its skills against your CV. Four layouts. Download it as PDF (saved straight away as Your_Name_Resume_Company_Role.pdf); Word, LaTeX and ResumeFold are under More formats. Your choices are saved with the job.
- **Notifications:** turn them on to hear about status changes and new jobs while Job Hunter is open.
- **Profile and CV:** check the skills read from your CV (add or remove any) and what was read under each heading.
- **Profile and CV / Settings:** change any answer from setup, upload a new CV, follow companies, or manage your data.

### Privacy
- Gmail is **read-only**. Job Hunter never sends, deletes or changes your email.
- Your data (applications, jobs, CV and settings) is in a hidden folder that only Job Hunter can open. You can
  see and remove it in Google Drive → Settings → Manage apps.
- The built-in AI sends short email snippets, job details and CV text through Job Hunter's AI function to Groq
  (Google Gemini as a backup), only to get the answer. Nothing is stored or logged. Free AI tiers may use what's
  sent to improve their models.
- No analytics, ads, trackers or cookies.
- **Settings → Your data** has *Export my data* and *Delete all my data*. To remove access entirely, go to
  myaccount.google.com/permissions → Job Hunter → Remove access.

---

## For the owner (one time, about 20 minutes)

You need a Google account, a free Vercel account and this repo on GitHub.

### 1. Google Cloud project
1. Open console.cloud.google.com → **New project** → name it *Job Hunter*.
2. **APIs & Services → Library**: enable the **Gmail API** and the **Google Drive API**.
3. **APIs & Services → OAuth consent screen** (Google Auth Platform):
   - User type **External**. App name *Job Hunter*, your support email, and your developer contact email.
   - **Branding**: home page `https://<your-site>/`, privacy policy `https://<your-site>/privacy.html`, authorized domain `<your-site>`.
   - **Data access / Scopes**: add `.../auth/gmail.readonly`, `.../auth/drive.appdata`, `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`.
   - **Audience**: click **Publish app** (In production).
   - **Verification Center**: submit **brand verification** (free: name, logo, home page, privacy policy). Once
     it's approved, sign-in (which only asks for name, email and the Drive app folder) shows no warning.
   - Don't submit the Gmail scope for verification: it needs a paid security assessment. Users who choose
     **Connect Gmail** see the unverified screen, and Gmail is limited to **100 users**.
4. **Credentials → Create credentials → OAuth client ID → Web application**.
   - **Authorized JavaScript origins**: `http://localhost:5173` and your Vercel URL. No redirect URIs.
   - Copy the **Client ID** into `web/config.js` (`GOOGLE_CLIENT_ID`). It's public, not a secret.

### 2. The built-in AI (free keys, kept on the server)
1. Create a free **Groq** key at console.groq.com/keys, and a free **Gemini** key at aistudio.google.com/apikey (the backup).
2. In Vercel: **Project → Settings → Environment Variables**, add `GROQ_API_KEY` and `GEMINI_API_KEY`.
   Optional: `AI_DAILY_LIMIT` (AI calls per user per day, default 80), `GROQ_MODEL`, `GEMINI_MODEL`. Redeploy.
3. For local testing, put the same `NAME=value` lines in `.env.local` in the repo root. It's gitignored; never commit keys.

Only signed-in Job Hunter users can use it: `web/api/ai.js` checks that the Google token was issued to your client id.

### 3. Try it locally
```bash
npm run dev            # http://localhost:5173  (app: /app, demo: /app?demo, setup: /app?demo=setup)
npm test               # logic tests
npm run check          # syntax check
```

### 4. Deploy on Vercel (free)
1. vercel.com → **Add New → Project** → import the GitHub repo.
2. Set **Root Directory** to `web`, Framework Preset to **Other**, and leave the build command empty. Then click **Deploy**.
3. Add the Vercel URL to the OAuth client's **Authorized JavaScript origins** (step 1.4).
4. Every push to `main` deploys automatically.

### 5. Email alerts (optional, free)
Without these, the *Email me when new jobs are ready* switch says alerts aren't set up, and everything else works.
1. **Storage:** Vercel → your project → **Storage → Create**, a free **Redis** (adds `REDIS_URL`) or **Upstash**
   (adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`), connected to the project for Production. Either works.
2. **Email:** sign up at brevo.com (free: 300 emails a day). **Senders, domains & IPs → Senders → Add a sender** and
   verify the address the alerts will come from. Then **SMTP & API → API keys → Generate**.
   In Vercel add `BREVO_API_KEY` and `ALERTS_FROM` (that verified address), and optionally `ALERTS_FROM_NAME`.
3. **Secrets:** make two long random strings (for example with `openssl rand -hex 32`). In Vercel add
   `CRON_SECRET` and `ALERTS_SECRET`. In GitHub: **repo → Settings → Secrets and variables → Actions → New repository
   secret**, `CRON_SECRET` with the same value.
4. Redeploy. The workflow `.github/workflows/job-alerts.yml` then calls the site every hour (about 720 free minutes a
   month of the 2,000 GitHub gives private repos). To try it at once: **Actions → Job alerts → Run workflow**.
5. Locally, put the same lines in `.env.local` and run
   `curl -X POST -H "Authorization: Bearer <CRON_SECRET>" http://localhost:5173/api/alerts-run`.

If you use a custom domain, add it to the authorized origins and the Branding page too.
