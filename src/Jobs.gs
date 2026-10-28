// ---------- Recommended jobs (from the user's job-alert emails) ----------
function findJobs_(data, s, afterStr, seen, result) {
  const threads = GmailApp.search(`after:${afterStr} (${ALERT_SENDERS}) (job OR jobs OR hiring OR internship OR opening OR recommended OR matches)`, 0, 25);
  const alerts = [];
  threads.forEach(t => t.getMessages().forEach(m => {
    const id = 'alert:' + m.getId();
    if (seen.has(id)) return;
    alerts.push({ id, from: m.getFrom(), subject: m.getSubject(), body: clip_(m.getPlainBody(), 7000) });
  }));
  if (!alerts.length) { result.notes.push('No new job-alert emails. Turn on job alerts on LinkedIn, Naukri and Internshala for more matches.'); return; }

  // 1) Extract job listings from the alert emails
  let listings = [];
  for (let i = 0; i < alerts.length; i += 4) {
    const batch = alerts.slice(i, i + 4);
    const out = gemini_(s, 'Extract every individual job or internship listing from these job-alert emails. Return a JSON array of ' +
      '{"company":"","role":"","location":"","pay":"","link":"<the listing URL from the email, or empty>","details":"<one or two lines from the email about the job>"}. ' +
      'Skip ads, courses and anything that is not a specific opening.\n\n' +
      batch.map((a, j) => `### Alert ${j}\nFrom: ${a.from}\nSubject: ${a.subject}\n${a.body}`).join('\n\n'), true);
    if (Array.isArray(out)) listings = listings.concat(out);
    batch.forEach(a => seen.add(a.id));
  }
  // de-duplicate against existing jobs and applications
  const existing = new Set(data.jobs.map(j => j.key).concat(data.applications.map(a => a.key)));
  const uniq = {};
  listings.forEach(l => {
    if (!l || !l.company || !l.role) return;
    const key = (String(l.company).trim() + '|' + String(l.role).trim()).toLowerCase();
    if (!existing.has(key) && !uniq[key]) uniq[key] = Object.assign({ key }, l);
  });
  const candidates = Object.keys(uniq).map(k => uniq[k]).slice(0, 40);
  if (!candidates.length) return;

  // 2) Score against the CV and preferences
  const cv = clip_(data.cv, 9000);
  const scored = gemini_(s, 'You match job openings to a candidate. Be strict and honest.\n' +
    `Candidate CV:\n${cv}\n\nPreferred locations: ${s.locations}\nPreferences: ${s.prefs}\n\n` +
    'For each opening return {"n": <number>, "fit": 1-5, "why": "<one sentence tying it to the CV>", "skill_gap": "<one skill to pick up, or None>", "apply_by": "<YYYY-MM-DD if stated, else empty>", "keep": true|false}. ' +
    'keep=false for roles that clash with the preferences, need far more experience, are unpaid internships (if the preferences say paid only), or look like training institutes charging fees.\n\n' +
    candidates.map((c, i) => `${i}. ${c.company} — ${c.role} — ${c.location || ''} — ${c.pay || ''} — ${c.details || ''}`).join('\n'), true);
  const picks = (Array.isArray(scored) ? scored : [])
    .filter(x => x && x.keep && Number(x.fit) >= 3 && candidates[Number(x.n)])
    .sort((a, b) => Number(b.fit) - Number(a.fit))
    .slice(0, s.jobsPerDay);

  const today = ymd_(new Date());
  let resumesMade = 0;
  picks.forEach(x => {
    const c = candidates[Number(x.n)];
    const job = {
      id: newId_(), found_on: today, fit: Number(x.fit), company: String(c.company).trim(), role: String(c.role).trim(),
      location: c.location || '', pay: c.pay || '', why: x.why || '', skill_gap: x.skill_gap || 'None',
      apply_by: /^\d{4}-\d{2}-\d{2}$/.test(String(x.apply_by || '')) ? x.apply_by : '',
      link: isHttpUrl_(c.link) ? c.link : '', details: clip_(c.details, 400), resume_url: '', status: 'New', key: c.key,
    };
    data.jobs.push(job);
    if (s.makeResumes && resumesMade < MAX_RESUMES_PER_RUN) {
      try { job.resume_url = makeResume_(data, s, job); resumesMade++; } catch (e) { log_(data, `Resume for ${job.company} failed: ${e.message}`); }
    }
    result.jobsNew.push(`${job.company} – ${job.role} (fit ${job.fit}/5)`);
  });
  result.resumes += resumesMade;
}
