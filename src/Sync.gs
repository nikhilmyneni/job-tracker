// ---------- Applications from Gmail (read-only) ----------
const APP_QUERY = '("thank you for applying" OR "thanks for applying" OR "application received" OR "received your application" OR "your application" OR "application status" OR interview OR shortlisted OR assessment OR "online test" OR "coding test" OR unfortunately OR "not moving forward" OR "regret to inform" OR "not been selected" OR "offer letter" OR "pleased to offer" OR withdrawn) -category:promotions -category:social';
const ALERT_SENDERS = 'from:linkedin.com OR from:naukri.com OR from:naukri.in OR from:internshala.com OR from:indeed.com OR from:foundit.in OR from:instahyre.com OR from:wellfound.com OR from:glassdoor.com OR from:apna.co OR from:unstop.com OR from:cutshort.io OR from:hirist.tech';

function syncApplications_(data, s, afterStr, seen, result) {
  const threads = GmailApp.search(`after:${afterStr} ${APP_QUERY} -{${ALERT_SENDERS.replace(/ OR /g, ' ')}}`, 0, MAX_THREADS);
  const me = Session.getEffectiveUser().getEmail().toLowerCase();
  const emails = [];
  threads.forEach(t => t.getMessages().forEach(m => {
    const id = m.getId();
    if (seen.has(id)) return;
    if (m.getFrom().toLowerCase().indexOf(me) >= 0) { seen.add(id); return; }
    emails.push({ id, from: m.getFrom(), subject: m.getSubject(), date: m.getDate(), body: clip_(m.getPlainBody(), 1500), link: t.getPermalink() });
  }));
  if (!emails.length) return;

  let updates;
  if (s.geminiKey) {
    updates = [];
    for (let i = 0; i < emails.length; i += 12) {
      const batch = emails.slice(i, i + 12);
      const out = gemini_(s, classifyPrompt_(batch), true);
      (Array.isArray(out) ? out : []).forEach(u => {
        const e = batch[Number(u.n)];
        if (e && u.is_application_update && u.company) updates.push(Object.assign({ email: e }, u));
      });
    }
  } else {
    updates = emails.map(e => Object.assign({ email: e }, ruleClassify_(e))).filter(u => u.is_application_update);
  }
  emails.forEach(e => seen.add(e.id));
  updates.sort((a, b) => a.email.date - b.email.date);
  updates.forEach(u => upsertApplication_(data.applications, {
    company: u.company, role: u.role, stage: u.stage, next_step: u.next_step,
    date: ymd_(u.email.date), channel: channelFromSender_(u.email.from), link: u.email.link,
  }, result));
}

function classifyPrompt_(batch) {
  return 'You sort job-application emails for a job seeker. For each email below, decide if it is about a job or internship THEY APPLIED TO ' +
    '(confirmation, assessment/test invite, interview invite or reminder, rejection, offer/selection, withdrawal). ' +
    'Job alerts, newsletters, recommendations, courses, banking, shopping and anything else are NOT application updates.\n' +
    'Return a JSON array, one object per email: {"n": <email number>, "is_application_update": true|false, "company": "", "role": "", ' +
    '"stage": "Applied"|"Screening"|"Interview"|"Offer"|"Rejected"|"Withdrawn", "next_step": "<short action for the candidate, or empty>"}.\n' +
    'Rules: assessment or online test invite = Screening; interview invite or reminder = Interview; selection or offer = Offer. Use the real employer name, not the job board. Role empty if not stated.\n\n' +
    batch.map((e, i) => `### Email ${i}\nFrom: ${e.from}\nDate: ${e.date.toISOString().slice(0, 10)}\nSubject: ${e.subject}\n${e.body}`).join('\n\n');
}

function ruleClassify_(e) {
  const t = (e.subject + ' ' + e.body).toLowerCase();
  let stage = null;
  if (/unfortunately|not moving forward|regret to inform|not been selected|other candidates|not to take your application forward/.test(t)) stage = 'Rejected';
  else if (/offer letter|pleased to offer|you have been selected|congratulations/.test(t)) stage = 'Offer';
  else if (/interview/.test(t)) stage = 'Interview';
  else if (/assessment|online test|coding test|shortlisted/.test(t)) stage = 'Screening';
  else if (/withdrawn/.test(t)) stage = 'Withdrawn';
  else if (/thank(s| you) for applying|application (has been )?received|received your application|your application/.test(t)) stage = 'Applied';
  if (!stage) return { is_application_update: false };
  const company = companyFromSender_(e.from);
  const rm = e.subject.match(/(?:for|–|-)\s+(?:the\s+)?(.+?)\s+(?:position|role|job|opening|internship)/i) || e.subject.match(/application for\s+(.+)$/i);
  return { is_application_update: !!company, company, role: rm ? rm[1].trim() : '', stage, next_step: stage === 'Screening' ? 'Complete the assessment' : stage === 'Interview' ? 'Prepare for / schedule the interview' : '' };
}

function companyFromSender_(from) {
  const name = (from.match(/^"?([^"<]+?)"?\s*</) || [])[1];
  const domain = (from.match(/@([^>\s]+)/) || [])[1] || '';
  const generic = /^(careers?|jobs?|recruit(ing|ment)?|talent|hr|no-?reply|notifications?|team)$/i;
  if (name && !generic.test(name.trim()) && !/no-?reply/i.test(name)) return name.replace(/\b(careers?|recruiting|talent acquisition|hiring team|jobs)\b/ig, '').trim();
  const parts = domain.split('.').filter(p => !/^(mail|careers?|jobs|email|no-?reply|recruiting|myworkday|greenhouse|lever|com|in|co|io|org|net|ai)$/i.test(p));
  return parts.length ? parts[parts.length - 1].replace(/^\w/, c => c.toUpperCase()) : '';
}

function channelFromSender_(from) {
  const f = from.toLowerCase();
  const map = { naukri: 'Naukri', linkedin: 'LinkedIn', internshala: 'Internshala', indeed: 'Indeed', hirepro: 'HirePro', wellfound: 'Wellfound', instahyre: 'Instahyre', foundit: 'foundit', unstop: 'Unstop', greenhouse: 'Company site', lever: 'Company site', workday: 'Company site' };
  for (const k in map) if (f.indexOf(k) >= 0) return map[k];
  return 'Company site';
}

// ---------- Pure updates on the applications list ----------
/** u: {company, role, stage, next_step, date: 'yyyy-mm-dd', channel, link} */
function upsertApplication_(apps, u, result) {
  const company = String(u.company || '').trim();
  if (!company) return null;
  const role = String(u.role || '').trim();
  const stage = STATUSES.indexOf(u.stage) >= 0 ? u.stage : 'Applied';
  const key = (company + '|' + role).toLowerCase();
  const keyNoRole = company.toLowerCase() + '|';
  const cur = apps.find(a => a.key === key || (!role && a.key.indexOf(keyNoRole) === 0) || (role && a.key === keyNoRole));
  if (!cur) {
    const app = {
      id: newId_(), company, role, channel: u.channel || 'Company site', applied_on: u.date, status: stage,
      furthest: STAGES.indexOf(stage) >= 0 ? stage : 'Applied', last_update: u.date, next_step: u.next_step || '', email_link: u.link || '', key,
    };
    apps.push(app);
    result.appsNew++;
    result.appsChanged.push(`${company}${role ? ' – ' + role : ''}: ${stage}`);
    return app;
  }
  const prev = cur.status;
  if (STAGES.indexOf(stage) > STAGES.indexOf(cur.furthest)) cur.furthest = stage;
  if (role && !cur.role) { cur.role = role; cur.key = key; }
  cur.status = stage;
  cur.last_update = u.date;
  cur.next_step = u.next_step || (['Rejected', 'Withdrawn', 'Offer'].indexOf(stage) >= 0 ? '' : cur.next_step);
  if (u.link) cur.email_link = u.link;
  if (prev !== stage) result.appsChanged.push(`${cur.company}${cur.role ? ' – ' + cur.role : ''}: ${prev} → ${stage}`);
  return cur;
}

function markGhosted_(apps, now, result) {
  const cutoff = now.getTime() - GHOST_DAYS * 864e5;
  apps.forEach(a => {
    const last = a.last_update ? new Date(a.last_update + 'T00:00:00').getTime() : 0;
    if (a.status === 'Applied' && last && last < cutoff) {
      a.status = 'Ghosted';
      result.appsChanged.push(`${a.company}: no reply for ${GHOST_DAYS}+ days → Ghosted`);
    }
  });
}

/** New jobs become Applied when that company|role (or a roleless application there) exists, Expired after apply-by. */
function expireJobs_(jobs, apps, today) {
  const keys = new Set(apps.map(a => a.key));
  jobs.forEach(j => {
    if (j.status !== 'New') return;
    if (keys.has(j.key) || keys.has(String(j.company).trim().toLowerCase() + '|')) { j.status = 'Applied'; return; }
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(j.apply_by || '')) && j.apply_by < today) j.status = 'Expired';
  });
}

function collectDue_(apps, result) {
  apps.forEach(a => {
    if (['Screening', 'Interview', 'Offer'].indexOf(a.status) >= 0 && a.next_step) result.due.push(`${a.company}: ${a.next_step}`);
  });
}
