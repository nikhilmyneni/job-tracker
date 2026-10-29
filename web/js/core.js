/**
 * Job Hunter: pure logic shared by the page and the Node tests.
 * No DOM, no network. Everything here works on plain objects.
 */

// ---------- Constants ----------
export const STAGES = ['Applied', 'Screening', 'Interview', 'Offer'];
export const STATUSES = ['Applied', 'Screening', 'Interview', 'Offer', 'Rejected', 'Withdrawn', 'Ghosted'];
export const JOB_STATUSES = ['New', 'Applied', 'Skipped', 'Expired'];
export const JOBS_PER_UPDATE = [0, 3, 5, 10, 15];
export const AUTO_UPDATE_HOURS = [0, 6, 12, 24]; // 0 = only when I click Update now
export const SINCE_DAYS = [30, 60, 120];
export const LEVELS = { fresher: 'Fresher (0–1 year)', intern: 'Internship', both: 'Fresher jobs or internships' };
export const JOB_TYPES = { fulltime: 'Full-time', internship: 'Internship', both: 'Full-time or internship' };
export const AI_PROVIDERS = ['gemini', 'groq', 'openrouter'];
export const GHOST_DAYS = 21;
export const MAX_THREADS = 80, MAX_ALERT_THREADS = 25;
export const MAX_SEEN = 5000, MAX_LOG = 300, MAX_JOBS = 1000, MAX_CV = 20000;

export const APP_QUERY = '("thank you for applying" OR "thanks for applying" OR "application received" OR "received your application" OR "your application" OR "application status" OR interview OR shortlisted OR assessment OR "online test" OR "coding test" OR unfortunately OR "not moving forward" OR "regret to inform" OR "not been selected" OR "offer letter" OR "pleased to offer" OR withdrawn) -category:promotions -category:social';
export const ALERT_SENDERS = 'from:linkedin.com OR from:naukri.com OR from:naukri.in OR from:internshala.com OR from:indeed.com OR from:foundit.in OR from:instahyre.com OR from:wellfound.com OR from:glassdoor.com OR from:apna.co OR from:unstop.com OR from:cutshort.io OR from:hirist.tech OR from:shine.com OR from:timesjobs.com OR from:monsterindia.com';

export const appSearch = (afterStr) => `after:${afterStr} ${APP_QUERY} -{${ALERT_SENDERS.replace(/ OR /g, ' ')}}`;
export const alertSearch = (afterStr) => `after:${afterStr} (${ALERT_SENDERS}) (job OR jobs OR hiring OR internship OR opening OR recommended OR matches)`;

// ---------- Small helpers ----------
export const clip = (t, n) => { t = String(t || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n'); return t.length > n ? t.slice(0, n) + '…' : t; };
export const pad2 = (n) => String(n).padStart(2, '0');
/** yyyy-mm-dd in the browser's local time. */
export const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
/** yyyy/mm/dd for Gmail's after: search. */
export const gmailDate = (d) => `${d.getUTCFullYear()}/${pad2(d.getUTCMonth() + 1)}/${pad2(d.getUTCDate())}`;
/** A short, stable fingerprint of a text (to know when the CV changed). Not for security. */
export function textHash(t) {
  let x = 5381;
  for (const ch of String(t || '')) x = ((x * 33) ^ ch.codePointAt(0)) >>> 0;
  return x.toString(36) + ':' + String(t || '').length;
}
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const isHttpUrl = (u) => /^https?:\/\//.test(String(u || ''));
export const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
export const safeName = (x) => String(x || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
export const resumeFileBase = (name, company, role) => `${safeName(name) || 'Resume'}_Resume_${safeName(company)}_${safeName(role)}`;

// ---------- Settings ----------
export function defaultSettings() {
  return {
    onboarded: false,
    name: '',
    city: '',
    prefs: {
      roles: [],
      level: 'fresher',
      jobType: 'both',
      paidOnly: true,
      minPay: '',
      locations: ['Hyderabad', 'Remote', 'Anywhere in India'],
      relocate: true,
      avoid: ['Sales', 'Telecalling', 'Unpaid internships', 'Training institutes that charge fees'],
    },
    jobsPerUpdate: 5,
    autoUpdateHours: 12,
    sinceDays: 120,
    companies: [], // company job boards to check: [{ats, slug, name, host?, site?}]
    ai: [], // [{provider: 'gemini'|'groq'|'openrouter', key, model}], tried in this order
  };
}

const strList = (v, max, len) => (Array.isArray(v) ? v : [])
  .map(x => (typeof x === 'string' ? x.trim().slice(0, len) : '')).filter(Boolean)
  .filter((x, i, a) => a.findIndex(y => y.toLowerCase() === x.toLowerCase()) === i).slice(0, max);

/** Fills gaps with defaults and drops anything invalid. */
export function normalizeSettings(raw) {
  const d = defaultSettings();
  const r = raw && typeof raw === 'object' ? raw : {};
  const p = r.prefs && typeof r.prefs === 'object' ? r.prefs : {};
  const pick = (v, list, def) => (list.indexOf(Number(v)) >= 0 ? Number(v) : def);
  const str = (v, n, def) => (typeof v === 'string' ? v.trim().slice(0, n) : def);
  return {
    onboarded: r.onboarded === true,
    name: str(r.name, 80, d.name),
    city: str(r.city, 60, d.city),
    prefs: {
      roles: Array.isArray(p.roles) ? strList(p.roles, 12, 60) : d.prefs.roles,
      level: p.level in LEVELS ? p.level : d.prefs.level,
      jobType: p.jobType in JOB_TYPES ? p.jobType : d.prefs.jobType,
      paidOnly: typeof p.paidOnly === 'boolean' ? p.paidOnly : d.prefs.paidOnly,
      minPay: str(p.minPay, 40, d.prefs.minPay),
      locations: Array.isArray(p.locations) ? strList(p.locations, 10, 60) : d.prefs.locations,
      relocate: typeof p.relocate === 'boolean' ? p.relocate : d.prefs.relocate,
      avoid: Array.isArray(p.avoid) ? strList(p.avoid, 15, 80) : d.prefs.avoid,
    },
    jobsPerUpdate: pick(r.jobsPerUpdate, JOBS_PER_UPDATE, d.jobsPerUpdate),
    autoUpdateHours: pick(r.autoUpdateHours, AUTO_UPDATE_HOURS, d.autoUpdateHours),
    sinceDays: pick(r.sinceDays, SINCE_DAYS, d.sinceDays),
    companies: (Array.isArray(r.companies) ? r.companies : []).map(normalizeCompany).filter(Boolean)
      .filter((c, i, all) => all.findIndex(b => companyKey(b) === companyKey(c)) === i).slice(0, MAX_COMPANIES),
    ai: (Array.isArray(r.ai) ? r.ai : [])
      .filter(a => a && AI_PROVIDERS.indexOf(a.provider) >= 0 && typeof a.key === 'string' && a.key.trim())
      .map(a => ({ provider: a.provider, key: a.key.trim().slice(0, 300), model: str(a.model, 100, '') }))
      .filter((a, i, all) => all.findIndex(b => b.provider === a.provider) === i),
  };
}

/** The preferences as plain lines for the job-scoring prompt. */
export function prefsText(s) {
  const p = s.prefs;
  const lines = [
    `Target roles: ${p.roles.length ? p.roles.join(', ') : 'any entry-level role that fits the CV'}`,
    `Level: ${LEVELS[p.level]}`,
    `Job type: ${JOB_TYPES[p.jobType]}`,
    `Pay: ${p.paidOnly ? 'paid only' : 'unpaid is OK'}${p.minPay ? `, at least ${p.minPay}` : ''}`,
    `Locations in order of preference: ${p.locations.length ? p.locations.join(', ') : 'any'}${p.relocate ? ' (open to relocating)' : ' (not open to relocating)'}`,
  ];
  if (s.city) lines.push(`Currently based in: ${s.city}`);
  if (p.avoid.length) lines.push(`Avoid: ${p.avoid.join(', ')}`);
  return lines.join('\n');
}

// ---------- Data file ----------
export function emptyData() {
  return { version: 2, settings: defaultSettings(), applications: [], jobs: [], seen: [], log: [], cv: '', cvFile: null, cvFold: null, cvFoldHash: '', lastRunAt: '' };
}

export function normalizeData(raw) {
  const d = emptyData();
  const r = raw && typeof raw === 'object' ? raw : {};
  const arr = (v) => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []);
  return {
    version: 2,
    settings: normalizeSettings(r.settings),
    applications: arr(r.applications),
    jobs: arr(r.jobs),
    seen: Array.isArray(r.seen) ? r.seen.map(String) : [],
    log: arr(r.log),
    cv: typeof r.cv === 'string' ? r.cv.slice(0, MAX_CV) : d.cv,
    cvFile: r.cvFile && typeof r.cvFile === 'object' && r.cvFile.id ? r.cvFile : null,
    cvFold: r.cvFold && typeof r.cvFold === 'object' ? r.cvFold : null,
    cvFoldHash: typeof r.cvFoldHash === 'string' ? r.cvFoldHash : '',
    lastRunAt: typeof r.lastRunAt === 'string' ? r.lastRunAt : '',
  };
}

/** Caps the lists before saving. */
export function trimData(data) {
  data.seen = data.seen.slice(-MAX_SEEN);
  data.log = data.log.slice(0, MAX_LOG);
  data.jobs = data.jobs.slice(-MAX_JOBS);
  return data;
}

export function addLog(data, msg, now) {
  data.log.unshift({ at: (now || new Date()).toISOString(), msg: String(msg) });
}

export const MIN_UPDATE_GAP_MIN = 10;
/**
 * Whether to start an update by itself. On sign-in (onOpen) it runs unless the last one was minutes ago;
 * while the page stays open it runs again every autoUpdateHours. 0 = only when you click.
 */
export function autoUpdateDue(data, now, onOpen) {
  const h = data.settings.autoUpdateHours;
  if (!h || !data.settings.onboarded) return false;
  if (!data.lastRunAt) return true;
  const age = now.getTime() - new Date(data.lastRunAt).getTime();
  return age >= (onOpen ? MIN_UPDATE_GAP_MIN * 60e3 : h * 3600e3);
}

// ---------- Gmail message bodies ----------
/** Gmail's base64url → UTF-8 text. */
export function decodeBase64Url(s) {
  const b64 = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = typeof atob === 'function' ? atob(b64 + '==='.slice((b64.length + 3) % 4)) : Buffer.from(b64, 'base64').toString('binary');
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

export function htmlToText(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Plain text of a Gmail message payload: text/plain if any, else text/html stripped. */
export function bodyFromPayload(payload) {
  const parts = [];
  const walk = (p) => { if (!p) return; parts.push(p); (p.parts || []).forEach(walk); };
  walk(payload);
  const plain = parts.find(p => p.mimeType === 'text/plain' && p.body && p.body.data);
  if (plain) return decodeBase64Url(plain.body.data);
  const html = parts.find(p => p.mimeType === 'text/html' && p.body && p.body.data);
  return html ? htmlToText(decodeBase64Url(html.body.data)) : '';
}

export const headerValue = (payload, name) => {
  const h = ((payload && payload.headers) || []).find(x => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
};

// ---------- Classifying application emails ----------
export function classifyPrompt(batch) {
  return 'You sort job-application emails for a job seeker. For each email below, decide if it is about a job or internship THEY APPLIED TO ' +
    '(confirmation, assessment/test invite, interview invite or reminder, rejection, offer/selection, withdrawal). ' +
    'Job alerts, newsletters, recommendations, courses, banking, shopping and anything else are NOT application updates.\n' +
    'Return a JSON array, one object per email: {"n": <email number>, "is_application_update": true|false, "company": "", "role": "", ' +
    '"stage": "Applied"|"Screening"|"Interview"|"Offer"|"Rejected"|"Withdrawn", "next_step": "<short action for the candidate, or empty>"}.\n' +
    'Rules: assessment or online test invite = Screening; interview invite or reminder = Interview; selection or offer = Offer. Use the real employer name, not the job board. Role empty if not stated.\n\n' +
    batch.map((e, i) => `### Email ${i}\nFrom: ${e.from}\nDate: ${e.date.toISOString().slice(0, 10)}\nSubject: ${e.subject}\n${e.body}`).join('\n\n');
}

export function ruleClassify(e) {
  const t = (e.subject + ' ' + e.body).toLowerCase();
  let stage = null;
  if (/unfortunately|not moving forward|regret to inform|not been selected|other candidates|not to take your application forward/.test(t)) stage = 'Rejected';
  else if (/offer letter|pleased to offer|you have been selected|congratulations/.test(t)) stage = 'Offer';
  else if (/interview/.test(t)) stage = 'Interview';
  else if (/assessment|online test|coding test|shortlisted/.test(t)) stage = 'Screening';
  else if (/withdrawn/.test(t)) stage = 'Withdrawn';
  else if (/thank(s| you) for applying|application (has been )?received|received your application|your application/.test(t)) stage = 'Applied';
  if (!stage) return { is_application_update: false };
  const company = companyFromSender(e.from);
  const rm = e.subject.match(/(?:for|–|-)\s+(?:the\s+)?(.+?)\s+(?:position|role|job|opening|internship)/i) || e.subject.match(/application for\s+(.+)$/i);
  return { is_application_update: !!company, company, role: rm ? rm[1].trim() : '', stage, next_step: stage === 'Screening' ? 'Complete the assessment' : stage === 'Interview' ? 'Prepare for / schedule the interview' : '' };
}

export function companyFromSender(from) {
  const name = (from.match(/^"?([^"<]+?)"?\s*</) || [])[1];
  const domain = (from.match(/@([^>\s]+)/) || [])[1] || '';
  const generic = /^(careers?|jobs?|recruit(ing|ment)?|talent|hr|no-?reply|notifications?|team)$/i;
  if (name && !generic.test(name.trim()) && !/no-?reply/i.test(name)) return name.replace(/\b(careers?|recruiting|talent acquisition|hiring team|jobs)\b/ig, '').trim();
  const parts = domain.split('.').filter(p => !/^(mail|careers?|jobs|email|no-?reply|recruiting|myworkday|greenhouse|lever|com|in|co|io|org|net|ai)$/i.test(p));
  return parts.length ? parts[parts.length - 1].replace(/^\w/, c => c.toUpperCase()) : '';
}

export function channelFromSender(from) {
  const f = from.toLowerCase();
  const map = { naukri: 'Naukri', linkedin: 'LinkedIn', internshala: 'Internshala', indeed: 'Indeed', hirepro: 'HirePro', wellfound: 'Wellfound', instahyre: 'Instahyre', foundit: 'foundit', unstop: 'Unstop', greenhouse: 'Company site', lever: 'Company site', workday: 'Company site' };
  for (const k in map) if (f.indexOf(k) >= 0) return map[k];
  return 'Company site';
}

// ---------- Applications list ----------
export const newResult = () => ({ appsNew: 0, appsChanged: [], jobsNew: [], due: [], notes: [] });

/** u: {company, role, stage, next_step, date: 'yyyy-mm-dd', channel, link} */
export function upsertApplication(apps, u, result) {
  const company = String(u.company || '').trim();
  if (!company) return null;
  const role = String(u.role || '').trim();
  const stage = STATUSES.indexOf(u.stage) >= 0 ? u.stage : 'Applied';
  const key = (company + '|' + role).toLowerCase();
  const keyNoRole = company.toLowerCase() + '|';
  const cur = apps.find(a => a.key === key || (!role && a.key.indexOf(keyNoRole) === 0) || (role && a.key === keyNoRole));
  if (!cur) {
    const app = {
      id: newId(), company, role, channel: u.channel || 'Company site', applied_on: u.date, status: stage,
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

export function setApplicationStatus(app, status, today) {
  if (STATUSES.indexOf(status) < 0) throw new Error('Unknown status.');
  app.status = status;
  if (STAGES.indexOf(status) > STAGES.indexOf(app.furthest)) app.furthest = status;
  app.last_update = today;
}

export function markGhosted(apps, now, result) {
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
export function expireJobs(jobs, apps, today) {
  const keys = new Set(apps.map(a => a.key));
  jobs.forEach(j => {
    if (j.status !== 'New') return;
    if (keys.has(j.key) || keys.has(String(j.company).trim().toLowerCase() + '|')) { j.status = 'Applied'; return; }
    if (isYmd(j.apply_by) && j.apply_by < today) j.status = 'Expired';
  });
}

export function collectDue(apps, result) {
  apps.forEach(a => {
    if (['Screening', 'Interview', 'Offer'].indexOf(a.status) >= 0 && a.next_step) result.due.push(`${a.company}: ${a.next_step}`);
  });
}

export function summaryText(r) {
  const lines = [];
  lines.push(r.appsChanged.length ? `Application updates:\n- ${r.appsChanged.join('\n- ')}` : 'No new application updates.');
  if (r.jobsNew.length) lines.push(`New recommended jobs:\n- ${r.jobsNew.join('\n- ')}`);
  if (r.due.length) lines.push(`Waiting on you:\n- ${r.due.join('\n- ')}`);
  if (r.notes.length) lines.push(r.notes.join('\n'));
  return lines.join('\n\n');
}

// ---------- Recommended jobs ----------
export function extractPrompt(batch) {
  return 'Extract every individual job or internship listing from these job-alert emails. Return a JSON array of ' +
    '{"company":"","role":"","location":"","pay":"","link":"<the listing URL from the email, or empty>","details":"<one or two lines from the email about the job>"}. ' +
    'Skip ads, courses and anything that is not a specific opening.\n\n' +
    batch.map((a, j) => `### Alert ${j}\nFrom: ${a.from}\nSubject: ${a.subject}\n${a.body}`).join('\n\n');
}

/** Listings not already in jobs or applications, one per company|role, at most max. */
export function newCandidates(listings, jobs, apps, max = 40) {
  const existing = new Set(jobs.map(j => j.key).concat(apps.map(a => a.key)));
  const uniq = new Map();
  (Array.isArray(listings) ? listings : []).forEach(l => {
    if (!l || !l.company || !l.role) return;
    const key = (String(l.company).trim() + '|' + String(l.role).trim()).toLowerCase();
    if (!existing.has(key) && !uniq.has(key)) uniq.set(key, Object.assign({}, l, { key }));
  });
  return [...uniq.values()].slice(0, max);
}

export function scorePrompt(cv, s, candidates) {
  return 'You match job openings to a candidate. Be strict and honest.\n' +
    `Candidate CV:\n${clip(cv, 9000)}\n\nCandidate preferences:\n${prefsText(s)}\n\n` +
    'For each opening return {"n": <number>, "fit": 1-5, "why": "<one sentence tying it to the CV>", "skill_gap": "<one skill to pick up, or None>", "apply_by": "<YYYY-MM-DD if stated, else empty>", "keep": true|false}. ' +
    'keep=false for roles that clash with the preferences or the avoid list, need far more experience, are unpaid when the candidate wants paid only, or look like training institutes charging fees.\n\n' +
    candidates.map((c, i) => `${i}. ${c.company} — ${c.role} — ${c.location || ''} — ${c.pay || ''} — ${c.details || ''}`).join('\n');
}

/** Turns Gemini's scores into new job rows: kept, fit 3+, best first, at most n. */
export function pickJobs(scored, candidates, n, today) {
  return (Array.isArray(scored) ? scored : [])
    .filter(x => x && x.keep && Number(x.fit) >= 3 && candidates[Number(x.n)])
    .sort((a, b) => Number(b.fit) - Number(a.fit))
    .slice(0, n)
    .map(x => {
      const c = candidates[Number(x.n)];
      return {
        id: newId(), found_on: today, fit: Number(x.fit), company: String(c.company).trim(), role: String(c.role).trim(),
        location: c.location || '', pay: c.pay || '', why: x.why || '', skill_gap: x.skill_gap || 'None',
        apply_by: isYmd(x.apply_by) ? x.apply_by : '', link: isHttpUrl(c.link) ? c.link : '',
        details: clip(c.details, 400), status: 'New', key: c.key,
        source: c.source || 'Job alert email', ref: c.ref || null,
      };
    });
}

// ---------- Dashboard numbers ----------
export function summary(apps) {
  const total = apps.length;
  const responses = apps.filter(a => a.furthest !== 'Applied').length;
  return {
    total, responses,
    active: apps.filter(a => ['Applied', 'Screening', 'Interview'].includes(a.status)).length,
    rate: total ? Math.round(responses / total * 100) : 0,
    interviews: apps.filter(a => ['Interview', 'Offer'].includes(a.furthest)).length,
    offers: apps.filter(a => a.furthest === 'Offer').length,
  };
}

export const funnel = (apps) => STAGES.map((stage, i) => {
  const n = apps.filter(a => STAGES.indexOf(a.furthest) >= i).length;
  return { stage, n, share: apps.length ? Math.round(n / apps.length * 100) : 0 };
});

export function bySource(apps) {
  const m = new Map();
  apps.forEach(a => {
    const r = m.get(a.channel) || { channel: a.channel, sent: 0, replies: 0 };
    r.sent++; if (a.furthest !== 'Applied') r.replies++;
    m.set(a.channel, r);
  });
  return [...m.values()].map(r => ({ ...r, rate: Math.round(r.replies / r.sent * 100) }))
    .sort((x, y) => y.rate - x.rate || y.sent - x.sent);
}

/** Applications per Monday-start week, with empty weeks as zero. */
export function weekly(apps) {
  const monday = (s) => { const d = new Date(String(s).slice(0, 10) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d; };
  const counts = new Map();
  apps.filter(a => /^\d{4}-\d{2}-\d{2}/.test(a.applied_on || '')).forEach(a => {
    const k = monday(a.applied_on).toISOString().slice(0, 10); counts.set(k, (counts.get(k) || 0) + 1);
  });
  const keys = [...counts.keys()].sort();
  const out = [];
  if (!keys.length) return out;
  for (let d = new Date(keys[0] + 'T00:00:00Z'); d <= new Date(keys[keys.length - 1] + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 7)) {
    const k = d.toISOString().slice(0, 10); out.push({ week: k, n: counts.get(k) || 0 });
  }
  return out;
}

// ---------- Job boards (company career pages) ----------
// Boards that let a browser read their public listings directly. Workday goes through our /api/workday function.
export const ATS = {
  greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby', smartrecruiters: 'SmartRecruiters',
  workable: 'Workable', recruitee: 'Recruitee', workday: 'Workday',
};
/** Ready-made companies that hire in India (boards checked Oct 2026). */
export const COMPANY_SUGGESTIONS = [
  { ats: 'greenhouse', slug: 'zscaler', name: 'Zscaler' },
  { ats: 'greenhouse', slug: 'razorpaysoftwareprivatelimited', name: 'Razorpay' },
  { ats: 'greenhouse', slug: 'groww', name: 'Groww' },
  { ats: 'greenhouse', slug: 'druva', name: 'Druva' },
  { ats: 'lever', slug: 'cred', name: 'CRED' },
  { ats: 'lever', slug: 'meesho', name: 'Meesho' },
  { ats: 'lever', slug: 'zeta', name: 'Zeta' },
  { ats: 'ashby', slug: 'sarvam', name: 'Sarvam AI' },
  { ats: 'workday', slug: 'nvidia', host: 'nvidia.wd5.myworkdayjobs.com', site: 'NVIDIAExternalCareerSite', name: 'NVIDIA' },
];
export const MAX_COMPANIES = 40, MAX_BOARD_CANDIDATES = 40;

const SLUG_RE = /^[A-Za-z0-9._-]{1,80}$/;
export const WD_HOST_RE = /^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/;
const titleCase = (s) => String(s).replace(/[-_.]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export function normalizeCompany(c) {
  if (!c || !(c.ats in ATS) || !SLUG_RE.test(String(c.slug || ''))) return null;
  const out = { ats: c.ats, slug: String(c.slug), name: (typeof c.name === 'string' && c.name.trim().slice(0, 60)) || titleCase(c.slug) };
  if (c.ats === 'workday') {
    const m = WD_HOST_RE.exec(String(c.host || ''));
    if (!m || !SLUG_RE.test(String(c.site || ''))) return null;
    Object.assign(out, { slug: m[1], host: String(c.host), site: String(c.site) });
  }
  return out;
}
export const companyKey = (c) => `${c.ats}:${c.slug}${c.site ? ':' + c.site : ''}`.toLowerCase();

/**
 * A careers-page link → {ats, slug, name} (plus host and site for Workday).
 * Returns {unsupported: true, host} for sites we can't read, or null when it isn't a link at all.
 */
export function parseCareerUrl(input) {
  const raw = String(input || '').trim();
  let u;
  try { u = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw); } catch (e) { return null; }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (!host.includes('.')) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  const first = parts[0] || '';
  const pick = (ats, slug) => normalizeCompany({ ats, slug }) || { unsupported: true, host };
  if (/^(job-)?boards(\.eu)?\.greenhouse\.io$/.test(host)) return pick('greenhouse', first === 'embed' ? u.searchParams.get('for') : first);
  if (host === 'jobs.lever.co') return pick('lever', first);
  if (host === 'jobs.ashbyhq.com') return pick('ashby', first);
  if (host === 'careers.smartrecruiters.com' || host === 'jobs.smartrecruiters.com') return pick('smartrecruiters', first);
  if (host === 'apply.workable.com') return pick('workable', first);
  const rec = /^([a-z0-9-]+)\.recruitee\.com$/.exec(host);
  if (rec) return pick('recruitee', rec[1]);
  const wd = WD_HOST_RE.exec(host);
  if (wd) {
    let p = parts;
    if (p[0] === 'wday' && p[1] === 'cxs') p = p.slice(3);
    if (/^[a-z]{2}-[A-Z]{2}$/.test(p[0] || '')) p = p.slice(1);
    return normalizeCompany({ ats: 'workday', slug: wd[1], host, site: p[0] }) || { unsupported: true, host };
  }
  return { unsupported: true, host };
}

/** The URL that lists a board's open jobs. q is only used by Workday, which searches on its side. */
export function boardRequest(c, q) {
  const s = encodeURIComponent(c.slug);
  switch (c.ats) {
    case 'greenhouse': return `https://boards-api.greenhouse.io/v1/boards/${s}/jobs`;
    case 'lever': return `https://api.lever.co/v0/postings/${s}?mode=json`;
    case 'ashby': return `https://api.ashbyhq.com/posting-api/job-board/${s}?includeCompensation=true`;
    case 'smartrecruiters': return `https://api.smartrecruiters.com/v1/companies/${s}/postings?limit=100`;
    case 'workable': return `https://apply.workable.com/api/v1/widget/accounts/${s}`;
    case 'recruitee': return `https://${s}.recruitee.com/api/offers/`;
    case 'workday': return `/api/workday?host=${encodeURIComponent(c.host)}&site=${encodeURIComponent(c.site)}&q=${encodeURIComponent(String(q || '').slice(0, 80))}`;
  }
  return '';
}

const plain = (t, n) => clip(String(t || '').replace(/\s+/g, ' ').trim(), n);
const joinBits = (...xs) => xs.flat().filter(x => x && typeof x === 'string').join(' · ');

/** A board's JSON → listings {id, company, role, location, remote, pay, link, details, source, ref}. */
export function listingsFromBoard(c, json) {
  const j = json || {};
  const L = (id, role, location, link, extra = {}) => ({
    id: `ats:${companyKey(c)}:${id}`, company: c.name, role: String(role || '').trim(), location: String(location || '').trim(),
    remote: !!extra.remote, pay: extra.pay || '', link: isHttpUrl(link) ? link : '', details: plain(extra.details, 300),
    source: ATS[c.ats], ref: Object.assign({ id: String(id) }, c),
  });
  const arr = (v) => (Array.isArray(v) ? v : []);
  switch (c.ats) {
    case 'greenhouse': return arr(j.jobs).map(x => L(x.id, x.title, x.location && x.location.name, x.absolute_url));
    case 'lever': return arr(json).map(x => {
      const cat = x.categories || {};
      return L(x.id, x.text, joinBits(arr(cat.allLocations).length ? cat.allLocations.join(', ') : cat.location, x.country === 'IN' ? 'India' : ''), x.hostedUrl,
        { remote: x.workplaceType === 'remote', details: joinBits(cat.commitment, cat.team, x.descriptionPlain) });
    });
    case 'ashby': return arr(j.jobs).filter(x => x.isListed !== false).map(x => {
      const country = x.address && x.address.postalAddress && x.address.postalAddress.addressCountry;
      const comp = x.compensation && x.compensation.compensationTierSummary;
      return L(x.id, x.title, joinBits([x.location, ...arr(x.secondaryLocations).map(s => s.location)].filter(Boolean).join(', '), country), x.jobUrl,
        { remote: !!x.isRemote || x.workplaceType === 'Remote', pay: comp || '', details: joinBits(x.employmentType, x.department, x.descriptionPlain) });
    });
    case 'smartrecruiters': return arr(j.content).map(x => {
      const loc = x.location || {};
      return L(x.id, x.name, loc.fullLocation || joinBits(loc.city, loc.country === 'in' ? 'India' : loc.country), `https://jobs.smartrecruiters.com/${encodeURIComponent(c.slug)}/${encodeURIComponent(x.id)}`,
        { remote: !!loc.remote, details: joinBits(x.typeOfEmployment && x.typeOfEmployment.label, x.experienceLevel && x.experienceLevel.label) });
    });
    case 'workable': return arr(j.jobs).map(x => L(x.shortcode, x.title, joinBits(x.city, x.country), x.url || x.shortlink,
      { remote: !!x.telecommuting, details: joinBits(x.employment_type, x.department, x.experience) }));
    case 'recruitee': return arr(j.offers).map(x => L(x.id, x.title, x.location || joinBits(x.city, x.country), x.careers_url,
      { remote: !!x.remote, details: joinBits(x.employment_type_code, x.department) }));
    case 'workday': return arr(j.jobPostings).map(x => L(x.externalPath, x.title,
      /^\d+ locations?$/i.test(x.locationsText || '') ? (String(x.externalPath || '').split('/')[2] || '').replace(/-/g, ' ') + ` (+${parseInt(x.locationsText, 10) - 1} more)` : x.locationsText,
      x.externalPath ? `https://${c.host}/${c.site}${x.externalPath}` : '', { details: x.postedOn }));
  }
  return [];
}

// Pre-filter before the AI scores anything, so big boards (hundreds of jobs) stay cheap.
const GENERIC_WORDS = new Set(['analyst', 'engineer', 'developer', 'intern', 'internship', 'associate', 'specialist', 'trainee', 'executive',
  'junior', 'graduate', 'fresher', 'entry', 'level', 'and', 'of', 'the', 'for', 'in', 'a', 'an', 'role', 'jobs', 'job']);
const ROLE_SYNONYMS = {
  penetration: ['penetration', 'pentest', 'vapt', 'offensive', 'red team', 'ethical hack'],
  pentester: ['penetration', 'pentest', 'vapt', 'offensive', 'red team'],
  soc: ['soc', 'security operations', 'incident response', 'threat', 'detection'],
  grc: ['grc', 'governance', 'risk', 'compliance', 'audit'],
  cloud: ['cloud', 'aws', 'azure', 'gcp', 'devsecops'],
  security: ['security', 'cyber', 'infosec', 'soc', 'appsec'],
  cyber: ['cyber', 'security', 'infosec'],
  software: ['software', 'sde', 'developer', 'backend', 'frontend', 'full stack', 'fullstack'],
  network: ['network', 'noc'],
  data: ['data', 'analytics'],
};
const SENIOR_RE = /\b(senior|sr|staff|principal|lead|manager|director|head|vp|vice president|architect|chief|ii|iii|iv|expert)\b/i;
const INTERN_RE = /\b(intern|internship|trainee|apprentice)\b/i;
const INDIA_RE = /\b(india|bengaluru|bangalore|hyderabad|pune|mumbai|chennai|delhi|gurgaon|gurugram|noida|kolkata|ahmedabad|kochi|coimbatore|jaipur|chandigarh|indore|thiruvananthapuram|trivandrum|visakhapatnam|vizag|bhubaneswar|mysuru|mysore|thane)\b/i;
const FOREIGN_RE = /\b(us|usa|united states|canada|uk|united kingdom|london|europe|emea|germany|france|netherlands|ireland|poland|spain|portugal|singapore|australia|japan|brazil|mexico|latam|americas|new york|san francisco|seattle|toronto|dubai|uae|israel|philippines|bulgaria|sweden)\b/i;
const CITY_ALIASES = {
  bengaluru: ['bengaluru', 'bangalore'], bangalore: ['bengaluru', 'bangalore'],
  'delhi ncr': ['delhi', 'gurgaon', 'gurugram', 'noida'], delhi: ['delhi', 'gurgaon', 'gurugram', 'noida'],
  mumbai: ['mumbai', 'bombay', 'thane'], vizag: ['visakhapatnam', 'vizag'], trivandrum: ['thiruvananthapuram', 'trivandrum'],
};
const hasWord = (text, term) => new RegExp('\\b' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(text);

/** Per target role, the title words that count as a match (with a few synonyms). */
export function roleTerms(roles) {
  return roles.map(r => {
    const words = String(r).toLowerCase().split(/[^a-z0-9+#]+/).filter(Boolean);
    const specific = words.filter(w => !GENERIC_WORDS.has(w));
    return [...new Set((specific.length ? specific : words).flatMap(w => ROLE_SYNONYMS[w] || [w]))];
  }).filter(t => t.length);
}

/** Whether a board listing is worth scoring, from its title and location alone. */
export function matchesPrefs(l, prefs) {
  const title = String(l.role || '').toLowerCase();
  if (!title) return false;
  const terms = roleTerms(prefs.roles);
  if (terms.length && !terms.some(ts => ts.some(t => hasWord(title, t)))) return false;
  if (SENIOR_RE.test(title)) return false;
  if ((prefs.jobType === 'internship' || prefs.level === 'intern') && !INTERN_RE.test(title)) return false;
  if (prefs.jobType === 'fulltime' && /\bintern(ship)?\b/i.test(title)) return false;
  if (prefs.avoid.some(a => a.split(/\s+/).length <= 2 && hasWord(title, a.toLowerCase()))) return false;

  const loc = String(l.location || '').toLowerCase();
  if (!loc || /^\d+ locations?$/.test(loc)) return true; // unknown: let the AI decide
  const wants = prefs.locations.map(x => x.toLowerCase());
  const anyIndia = !wants.length || prefs.relocate || wants.includes('anywhere in india');
  if (INDIA_RE.test(loc) && (anyIndia || wants.some(w => (CITY_ALIASES[w] || [w]).some(a => hasWord(loc, a))))) return true;
  const remote = l.remote || /\b(remote|work from home|wfh|anywhere)\b/.test(loc);
  return remote && !FOREIGN_RE.test(loc) && (!wants.length || wants.includes('remote') || wants.includes('anywhere in india'));
}

/** New board listings worth scoring: matching, not seen before, at most n, taken in turn from each company. */
export function boardCandidates(listings, prefs, seen, n = MAX_BOARD_CANDIDATES) {
  const byCompany = new Map();
  listings.forEach(l => {
    if (seen.has(l.id) || !matchesPrefs(l, prefs)) return;
    const list = byCompany.get(l.company) || []; list.push(l); byCompany.set(l.company, list);
  });
  const out = [], lists = [...byCompany.values()];
  for (let i = 0; out.length < n && lists.some(x => x.length > i); i++) lists.forEach(x => { if (x[i] && out.length < n) out.push(x[i]); });
  return out;
}

// ---------- ResumeFold hand-off ----------
// ResumeFold (delta-dog.github.io/resumefold, MIT, runs in the browser) does the tailoring. We give it the CV as its
// Resume JSON (Review → Import JSON) with the job filled in, so its keyword match works against that job.
export const RESUMEFOLD_URL = 'https://delta-dog.github.io/resumefold/build/';
const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** Any date-ish text → "YYYY-MM" (or "" when it can't tell). "Present" → "". */
export function toYearMonth(s) {
  const t = String(s || '').trim().toLowerCase();
  if (YM_RE.test(t)) return t;
  let m = /^(\d{4})[-/.](\d{1,2})/.exec(t);
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${m[1]}-${pad2(+m[2])}`;
  m = /^(\d{1,2})[-/.](\d{4})$/.exec(t);
  if (m && +m[1] >= 1 && +m[1] <= 12) return `${m[2]}-${pad2(+m[1])}`;
  m = /([a-z]{3})[a-z]*[.,]?\s*'?(\d{4})/.exec(t);
  if (m && MONTHS[m[1]]) return `${m[2]}-${pad2(MONTHS[m[1]])}`;
  m = /\b(19|20)\d{2}\b/.exec(t);
  return m ? `${m[0]}-01` : '';
}

export function resumeFoldPrompt(cv) {
  return 'Convert this CV into JSON for a resume builder. Do NOT tailor, rewrite or improve anything: copy the facts as written. ' +
    'Never add experience, employers, dates, numbers, skills, tools or certifications that are not in the CV. Leave out date of birth, nationality and photos.\n' +
    'Dates are "YYYY-MM" (use "-01" when only the year is known, "" when unknown); set current=true for ongoing roles.\n' +
    'Return JSON: {"contact":{"fullName":"","headline":"","email":"","phone":"","location":"","website":"","linkedin":"","github":""},"summary":"",' +
    '"experience":[{"title":"","company":"","location":"","start":"","end":"","current":false,"bullets":[""]}],' +
    '"education":[{"school":"","degree":"","field":"","location":"","start":"","end":"","gpa":"","details":[""]}],' +
    '"skills":[{"category":"","items":[""]}],"projects":[{"name":"","link":"","tech":"","start":"","end":"","bullets":[""]}],' +
    '"certifications":[{"name":"","issuer":"","date":"","link":""}]}\n\nCV:\n' + clip(cv, 12000);
}

/** Makes AI output safe for ResumeFold's schema: strings only, ids added, dates as YYYY-MM. */
export function cleanResumeFold(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
  if (!r) return null;
  const s = (v, n = 300) => (typeof v === 'string' ? v.trim().slice(0, n) : typeof v === 'number' ? String(v) : '');
  const list = (v, n = 30, len = 400) => (Array.isArray(v) ? v.map(x => s(x, len)).filter(Boolean).slice(0, n) : []);
  const rows = (v, prefix, fn) => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object').slice(0, 30).map((x, i) => Object.assign({ id: `${prefix}${i + 1}` }, fn(x))) : []);
  const c = r.contact && typeof r.contact === 'object' ? r.contact : {};
  const out = {
    contact: Object.fromEntries(['fullName', 'headline', 'email', 'phone', 'location', 'website', 'linkedin', 'github'].map(k => [k, s(c[k], 200)])),
    summary: s(r.summary, 2000),
    experience: rows(r.experience, 'exp', x => {
      const current = x.current === true || /present|current|now/i.test(String(x.end || ''));
      return { title: s(x.title), company: s(x.company), location: s(x.location), start: toYearMonth(x.start), end: current ? '' : toYearMonth(x.end), current, bullets: list(x.bullets) };
    }),
    education: rows(r.education, 'edu', x => ({ school: s(x.school), degree: s(x.degree), field: s(x.field), location: s(x.location), start: toYearMonth(x.start), end: toYearMonth(x.end), gpa: s(x.gpa, 40), details: list(x.details) })),
    skills: rows(r.skills, 'skill', x => ({ category: s(x.category, 80), items: list(x.items, 40, 80) })).filter(x => x.items.length),
    projects: rows(r.projects, 'proj', x => ({ name: s(x.name), link: isHttpUrl(x.link) ? s(x.link, 300) : '', tech: s(x.tech), start: toYearMonth(x.start), end: toYearMonth(x.end), bullets: list(x.bullets) })),
    certifications: rows(r.certifications, 'cert', x => ({ name: s(x.name), issuer: s(x.issuer), date: toYearMonth(x.date), link: isHttpUrl(x.link) ? s(x.link, 300) : '' })).filter(x => x.name),
  };
  return out.contact.fullName || out.experience.length || out.education.length ? out : null;
}

/** The file to import into ResumeFold: the CV plus this job, so ResumeFold can tailor against it. */
export function resumeFoldFor(base, job, description) {
  const r = JSON.parse(JSON.stringify(base));
  r.meta = {
    analysis: {
      jobTitle: String(job.role || '').slice(0, 200), company: String(job.company || '').slice(0, 200),
      jobDescription: String(description || job.details || '').slice(0, 30000), keywords: '', keywordsMode: 'suggested', addedSkills: [], source: 'draft',
    },
    exportSettings: { filename: resumeFileBase(r.contact.fullName, job.company, job.role) },
    template: 'standard', paper: 'a4',
  };
  return r;
}
