# Job Tracker: free web app (Gmail + Drive)

100% free. One link, everything on one page. It runs as **you**, inside your own Google account. No sheet, no server, no app to install.

On the days and at the time you pick, it:
- reads your Gmail (read-only) and updates your applications: applied → test → interview → offer / rejected. It marks "Ghosted" after 21 days of silence.
- picks the best new jobs from your job-alert emails (LinkedIn, Naukri, Internshala, Indeed…) for your CV
- emails you a short summary

When you ask for one, it writes a tailored one-page resume for any recommended job. The resume opens right in your browser, so you can tweak it and save it as PDF.

The page shows your totals, reply rate, best channel, recommended jobs, where applications stop, applications per week, reply rate per channel, all your applications and your settings.

---

## For users (about 2 minutes)

1. Open the Job Tracker link you were given and sign in with Google.
2. Allow access. You'll first see Google's "unverified app" screen (see below).
3. In **Settings**, paste your CV text and click **Save CV**.
4. Optional but recommended: get a free Gemini key at **aistudio.google.com/apikey** → *Create API key*. Paste it in Settings to turn on job matching and tailored resumes.
5. Pick your days and time, switch **Daily updates** on, click **Save settings**, then **Update now** once. From then on it runs by itself.

Bookmark the link. It's your dashboard.

## The "Google hasn't verified this app" screen

You'll see it once, because Job Tracker isn't a published Google app. Click **Advanced → Go to Job Tracker (unsafe) → Allow**. The code runs only in your account:
- It reads Gmail (never changes it).
- It creates files only in a **Job Tracker** folder in your Drive.
- The only email it sends is your summary, to you.

The person who runs the link **can't see your data**.

## Where your data lives

- **Applications, jobs, CV, log:** `Job Tracker/Job Tracker data.json` in your Drive.
- **Resumes:** nothing goes to Drive. A resume you made is kept inside the data file, so it opens again straight away. You save the PDF yourself, wherever you like.
- **Settings and Gemini key:** your private script settings (Google's UserProperties), which only your account can read.
- **Turning it off:** **Remove automation** in Settings. To delete everything, also delete the Drive folder and remove the app at myaccount.google.com/permissions.

## Good to know

- **Without a Gemini key** it still tracks applications using keyword rules, which are less accurate. Job matching and resumes stay off.
- **Gemini free tier:** Google may use what you send to improve its products. That includes snippets of job emails and your CV. Don't add the key if you're not OK with that.
- **More job matches:** turn on job alerts on LinkedIn, Naukri and Internshala for your target roles. Those emails are where it finds jobs.
- **Resumes** are built only from your CV. It never invents skills or experience. Click **Make resume** on a job. It takes about 20 seconds, then opens as an A4 page.
  - You can click any text to fix it, then **Save as PDF / Print** → choose *Save as PDF*.
  - Your edits aren't stored, so save the PDF before closing.
  - **Write again** makes a fresh version.
  - Check each one before sending.
- **Missed an application?** Use **Add application** under All applications, or change a status from its drop-down.

---

## For the owner (one time)

1. `npm install`, then `npx clasp login`.
2. At **script.google.com → New project**, name it *Job Tracker*. Copy its id (Project Settings → Script ID), then copy `.clasp.json.example` to `.clasp.json` and paste the id there.
3. `npm run push`.
4. In the Apps Script editor: **Deploy → New deployment → Web app**. Set *Execute as: **User accessing the web app***, *Who has access: **Anyone with a Google account***. Copy the `/exec` URL and share it.
5. After a code change: `npm run push`, then **Deploy → Manage deployments → Edit → New version**. Everyone gets it on their next visit and their next scheduled run.

**Limit:** Google lets an unverified app that reads Gmail have at most **100 users**. Going beyond that needs Google's app verification plus a paid security assessment for the Gmail scope.
