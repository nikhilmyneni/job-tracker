# Job Hunter: guide

A free website for freshers that keeps every job application in one place from your Gmail (read-only),
finds openings that fit your CV, and helps you tailor a one-page resume. It runs in your browser, and your
data stays in a hidden app folder in your own Google Drive.

---

## For users (about 3 minutes)

1. Open the site and click **Sign in with Google**. This only shares your name and email, and gives Job Hunter
   a hidden folder in your Drive for your data.
2. Setup starts with your CV: drop a PDF, Word or text file, or paste the text. Job Hunter fills in the next
   questions from it (name, city, roles, level, locations). Check them, then add pay, places and things to skip.
3. **Connect Gmail (optional).** It lets your applications track themselves. Google shows a "Google hasn't
   verified this app" screen here: click **Advanced → Go to Job Hunter**, tick the box to read your email, and
   click **Continue**. Skip it and you can connect later, or paste application emails yourself.
4. Follow any companies you like, then click **Start**. With Gmail connected, the first sync reads the last
   30–120 days and applications appear as they're sorted.

There's nothing else to set up: the AI is built in and free.

**Install it like an app:** in Chrome or Edge, use the install icon in the address bar. On a phone, use *Add to Home screen*.

### Everyday use
- **Syncing:** there's no background server, so Job Hunter syncs while it's open: as soon as you sign in,
  then every 6, 12 or 24 hours (your choice), or when you click **Sync now**.
- **Applications:** Board, Table or Timeline. Drag a card to another column, or tap it to fix the status,
  role, next step or interview time. "N emails need a look" lists emails it couldn't match.
- **Job matches:** openings from your job-alert emails, the companies you follow and Adzuna, scored by how much of
  what they ask for is on your CV. Filter by place, experience, internships and minimum match; add your own keywords;
  open a job to see what matches and what's missing. **Tailor resume** prepares your CV and the job for ResumeFold.
- **Notifications:** turn them on to hear about status changes and new matches while Job Hunter is open.
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

### 3. Adzuna job search (free key, kept on the server)
1. Create a free developer account at developer.adzuna.com and copy the **app_id** and **app_key**.
2. In Vercel, add `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` (optional `ADZUNA_DAILY_LIMIT`, searches per user per day,
   default 30). Redeploy. Locally, put them in `.env.local`.
3. Adzuna's terms ask you to credit them: Job Hunter shows "Jobs by Adzuna" on every Adzuna listing.

### 4. Try it locally
```bash
npm run dev            # http://localhost:5173  (app: /app, demo: /app?demo, setup: /app?demo=setup)
npm test               # logic tests
npm run check          # syntax check
```

### 5. Deploy on Vercel (free)
1. vercel.com → **Add New → Project** → import the GitHub repo.
2. Set **Root Directory** to `web`, Framework Preset to **Other**, and leave the build command empty. Then click **Deploy**.
3. Add the Vercel URL to the OAuth client's **Authorized JavaScript origins** (step 1.4).
4. Every push to `main` deploys automatically.

If you use a custom domain, add it to the authorized origins and the Branding page too.
