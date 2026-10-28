# Job Tracker — free version (Google Sheets + Gmail)

100% free. Runs inside your own Google account. No Claude subscription, no server, no app to install.

What it does on the days and time you pick:
- reads your Gmail (read-only) and updates your applications: applied → test → interview → offer / rejected, and marks "Ghosted" after 21 days of silence
- picks the best new jobs from your job-alert emails (LinkedIn, Naukri, Internshala, Indeed…) for your CV
- makes a tailored one-page resume PDF for each, saved in your Google Drive
- emails you a short summary

---

## For the person sharing it (one time, ~3 minutes)

1. Go to sheets.new to make a blank Google Sheet. Name it **Job Tracker**.
2. **Extensions → Apps Script.** Delete what's there, paste all of `Code.gs`, click **Save**.
3. Back in the sheet, reload the page. A **Job Tracker** menu appears. Click **Job Tracker → 1. Set up**. Allow access when Google asks (see the note below).
4. **Clear your own data** before sharing: empty the "My CV" box and the Gemini key in Settings, and delete any rows in Applications / Recommended jobs.
5. **Share → General access → "Anyone with the link" → Viewer.** Copy the link and change the end from `/edit…` to `/copy`.
   Example: `https://docs.google.com/spreadsheets/d/XXXXX/copy`
   That link makes everyone their **own private copy**, with the script inside. Nobody can see anyone else's data.

## For friends (about 2 minutes)

1. Open the `/copy` link → **Make a copy**.
2. In your copy: **Job Tracker → 1. Set up** → allow access.
3. Paste your CV text into the **My CV** tab.
4. **Settings** tab: tick your days, pick a time and jobs per day.
5. Optional but recommended: get a free Gemini key at **aistudio.google.com/apikey** → *Create API key* → paste it in Settings. This turns on job matching and tailored resumes.
6. **Job Tracker → Update now** once. From then on it runs by itself.

Change anything later in the Settings tab. To pause it, untick "Daily updates on" or use **Job Tracker → Pause / resume**.

## The "Google hasn't verified this app" screen

You'll see it once during setup, because the script is your own copy and not a published app. Click **Advanced → Go to Job Tracker (unsafe) → Allow**. The script only runs in your account. It reads Gmail and creates files in your own Drive, and the only email it sends is your summary, to you.

## Good to know

- **Without a Gemini key** it still tracks applications using keyword rules, which are less accurate. Job matching and resumes stay off.
- **Gemini free tier:** Google may use what you send to improve its products, which includes snippets of job emails and your CV. Don't add the key if you're not OK with that.
- **More job matches:** turn on job alerts on LinkedIn, Naukri and Internshala for your target roles. Those emails are where it finds jobs.
- **Resumes** are built only from your CV. It never invents skills or experience. Check each one before sending, and edit the PDF's source if needed (resumes are made as Google Docs, then saved as PDF).
- **Making one resume:** open Recommended jobs, click a row, then **Job Tracker → Make resume for selected job**.
- **Turning it off:** **Job Tracker → Remove automation**. Your data stays in the sheet.
