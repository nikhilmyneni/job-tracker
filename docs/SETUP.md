# Job Tracker: guide

A free website that tracks your job applications from Gmail, finds jobs that fit your CV, and writes a tailored one-page resume for each one. It runs in your browser. Your data stays in a hidden app folder in your own Google Drive.

---

## For users (about 3 minutes)

1. Open the Job Tracker site and click **Sign in with Google**.
2. Google shows a "Google hasn't verified this app" screen. Click **Advanced → Go to Job Tracker**, then tick **both** boxes (read Gmail, and Job Tracker's own app data in Drive) and click **Continue**.
3. Answer the setup questions: the roles you want, level, pay, locations, things to skip, and your CV (upload a PDF or Word file, or paste the text).
4. **Optional but recommended:** add a free AI key. It makes email sorting more accurate, turns on job matching, and writes tailored resumes.
   - **Google Gemini** (recommended): aistudio.google.com/apikey → *Create API key*.
   - **Groq** (fast backup): console.groq.com/keys.
   - **OpenRouter** (many free models): openrouter.ai/settings/keys, then pick a model ending in `:free`.

   Click **Test key** to check it and pick a model. Add more than one key and Job Tracker switches to the next when one runs out of free quota.
5. Click **Start**. The first update reads your Gmail from the last 30–120 days, which can take a minute.

**Install it like an app:** in Chrome or Edge, use the install icon in the address bar. On a phone, use *Add to Home screen*.

### Everyday use
- **Updates:** Job Tracker has no server, so it updates while the site is open: by itself every 6, 12 or 24 hours (your choice), or whenever you click **Update now**.
- **Recommended jobs:** each one has a fit score from 1 to 5, why it fits, a skill to pick up, and **Apply now**.
  - **Make resume** writes a one-page resume for that job, using only facts from your CV.
  - You can click any text on the resume to edit it. Then use **Download PDF**, **Download Word**, or **Print**, and **Save edits** to keep your changes.
  - **Mark applied** adds the job to your applications, and **Skip** hides it.
- **Applications:** statuses update from your email (applied → test → interview → offer / rejected). An application is marked *Ghosted* after 21 days of silence. You can change a status by hand, remove an application, or **Add application** for ones that never sent an email.
- **Settings:** change any answer from setup, upload a new CV, download your saved CV file, or manage your AI keys.

### Privacy
- Gmail is **read-only**. Job Tracker never sends, deletes or changes your email.
- Your data (applications, jobs, resumes, CV, settings and AI keys) is in a hidden folder that only Job Tracker can open. You can see and remove it in Google Drive → Settings → Manage apps.
- The person who runs the site can't see your data. There's no server, no analytics and no tracking.
- With an AI key, short email snippets and your CV text go to that AI provider and nowhere else. Free tiers may use what you send to improve their models, so don't add a key if you're not OK with that.
- **Settings → Your data** has *Export my data* and *Delete all my data*. To remove access entirely, go to myaccount.google.com/permissions → Job Tracker → Remove access.

---

## For the owner (one time, about 15 minutes)

You need a Google account, a free Vercel account and this repo on GitHub.

### 1. Google Cloud project
1. Open console.cloud.google.com → **New project** → name it *Job Tracker*.
2. **APIs & Services → Library**: enable the **Gmail API** and the **Google Drive API**.
3. **APIs & Services → OAuth consent screen** (Google Auth Platform):
   - User type **External**. App name *Job Tracker*, your support email, and your developer contact email.
   - **Data access / Scopes**: add `.../auth/gmail.readonly`, `.../auth/drive.appdata`, `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`.
   - **Audience**: click **Publish app** (In production). Don't submit it for verification. Users then see the unverified screen, and the app is limited to **100 users**. Going beyond that needs Google's verification plus a paid security assessment for the Gmail scope.
4. **Credentials → Create credentials → OAuth client ID → Web application**.
   - **Authorized JavaScript origins**: `http://localhost:5173`, and later your Vercel URL (for example `https://job-tracker-yourname.vercel.app`).
   - No redirect URIs are needed.
   - Copy the **Client ID** into `web/config.js` (`GOOGLE_CLIENT_ID`). It's public, not a secret.

### 2. Try it locally
```bash
npm run dev            # http://localhost:5173  (demo: http://localhost:5173/?demo)
npm test               # logic tests
npm run check          # syntax check
```

### 3. Deploy on Vercel (free)
1. vercel.com → **Add New → Project** → import the GitHub repo.
2. Set **Root Directory** to `web`, Framework Preset to **Other**, and leave the build command empty. Then click **Deploy**.
3. Add the Vercel URL to the OAuth client's **Authorized JavaScript origins** (step 1.4).
4. Every push to `main` deploys automatically.

If you use a custom domain, add it to the authorized origins too.
