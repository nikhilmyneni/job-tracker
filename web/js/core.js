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
export const ALERT_SENDERS = 'from:linkedin.com OR from:naukri.com OR from:naukri.in OR from:internshala.com OR from:indeed.com OR from:foundit.in OR from:instahyre.com OR from:wellfound.com OR from:glassdoor.com OR from:apna.co OR from:unstop.com OR from:cutshort.io OR from:hirist.tech';

export const appSearch = (afterStr) => `after:${afterStr} ${APP_QUERY} -{${ALERT_SENDERS.replace(/ OR /g, ' ')}}`;
export const alertSearch = (afterStr) => `after:${afterStr} (${ALERT_SENDERS}) (job OR jobs OR hiring OR internship OR opening OR recommended OR matches)`;

// ---------- Small helpers ----------
export const clip = (t, n) => { t = String(t || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n'); return t.length > n ? t.slice(0, n) + '…' : t; };
export const pad2 = (n) => String(n).padStart(2, '0');
/** yyyy-mm-dd in the browser's local time. */
export const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
/** yyyy/mm/dd for Gmail's after: search. */
export const gmailDate = (d) => `${d.getUTCFullYear()}/${pad2(d.getUTCMonth() + 1)}/${pad2(d.getUTCDate())}`;
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
  return { version: 2, settings: defaultSettings(), applications: [], jobs: [], seen: [], log: [], cv: '', cvFile: null, lastRunAt: '' };
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

/** Whether opening the app should start an update by itself. */
export function autoUpdateDue(data, now) {
  const h = data.settings.autoUpdateHours;
  if (!h || !data.settings.onboarded) return false;
  if (!data.lastRunAt) return true;
  return now.getTime() - new Date(data.lastRunAt).getTime() >= h * 3600e3;
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

/** Listings not already in jobs or applications, one per company|role, at most 40. */
export function newCandidates(listings, jobs, apps) {
  const existing = new Set(jobs.map(j => j.key).concat(apps.map(a => a.key)));
  const uniq = new Map();
  (Array.isArray(listings) ? listings : []).forEach(l => {
    if (!l || !l.company || !l.role) return;
    const key = (String(l.company).trim() + '|' + String(l.role).trim()).toLowerCase();
    if (!existing.has(key) && !uniq.has(key)) uniq.set(key, Object.assign({}, l, { key }));
  });
  return [...uniq.values()].slice(0, 40);
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
      };
    });
}

// ---------- Resume ----------
export function resumePrompt(cv, job) {
  return 'Write a one-page, ATS-friendly resume for this candidate, tailored to the job below.\n' +
    'STRICT HONESTY: use ONLY facts from the CV. Never invent experience, employers, dates, numbers, skills, tools or certifications. ' +
    'Tailor by choosing, ordering and wording true facts toward the job, using the job\'s wording only for things the candidate really has. Leave out date of birth, nationality and photos.\n' +
    'Return JSON: {"name":"","headline":"<target role + 2-3 true focus areas>","contact":["email","phone","city","links"...],' +
    '"summary":"<3-4 lines>","skills":[{"group":"","items":[""]}],' +
    '"experience":[{"title":"","org":"","dates":"","bullets":[""]}],' +
    '"projects":[{"name":"","tech":"","dates":"","bullets":[""]}],' +
    '"education":[{"school":"","degree":"","dates":"","details":""}],' +
    '"certifications":[""],"extras":[""]}. Keep it to one page: at most 4 skill groups, 3 projects with up to 4 bullets each, short bullets. Empty arrays for sections the CV does not support.\n\n' +
    `JOB: ${job.company} — ${job.role} — ${job.location || ''}\n${job.details || ''}\n\nCV:\n${clip(cv, 12000)}`;
}

/** Keeps only the fields the page draws, as plain strings and short arrays. Null when there is no name. */
export function cleanResume(r) {
  if (!r || typeof r !== 'object') return null;
  const str = (v, n) => (v == null || typeof v === 'object' ? '' : String(v).trim()).slice(0, n || 300);
  const list = (v, max, fn) => (Array.isArray(v) ? v : []).map(fn).filter(Boolean).slice(0, max);
  const strs = (v, max, n) => list(v, max, x => str(x, n));
  const name = str(r.name, 80);
  if (!name) return null;
  return {
    name,
    headline: str(r.headline, 160),
    contact: strs(r.contact, 6, 120),
    summary: str(r.summary, 700),
    skills: list(r.skills, 4, g => {
      const items = strs(g && g.items, 14, 40);
      return items.length ? { group: str(g.group, 40), items } : null;
    }),
    experience: list(r.experience, 4, x => x && (x.title || x.org) ? { title: str(x.title, 100), org: str(x.org, 100), dates: str(x.dates, 40), bullets: strs(x.bullets, 4, 260) } : null),
    projects: list(r.projects, 3, x => x && x.name ? { name: str(x.name, 100), tech: str(x.tech, 120), dates: str(x.dates, 40), bullets: strs(x.bullets, 4, 260) } : null),
    education: list(r.education, 3, x => x && x.school ? { school: str(x.school, 120), degree: str(x.degree, 120), dates: str(x.dates, 40), details: str(x.details, 200) } : null),
    certifications: strs(r.certifications, 6, 140),
    extras: strs(r.extras, 4, 200),
  };
}

/**
 * The resume as an ordered list of blocks, used by the on-screen sheet, the PDF and the Word file,
 * so all three show the same thing. path says where an edited block's text goes back to.
 */
export function resumeBlocks(r) {
  const b = [{ t: 'name', text: r.name, path: ['name'] }];
  if (r.headline) b.push({ t: 'headline', text: r.headline, path: ['headline'] });
  if (r.contact.length) b.push({ t: 'contact', text: r.contact.join('  •  '), path: ['contact'] });
  const sec = (title) => b.push({ t: 'section', text: title });
  if (r.summary) { sec('Summary'); b.push({ t: 'para', text: r.summary, path: ['summary'] }); }
  if (r.skills.length) {
    sec('Skills');
    r.skills.forEach((g, i) => b.push({ t: 'skill', label: g.group, text: g.items.join(', '), path: ['skills', i] }));
  }
  const entries = (title, key, left, right, rest) => {
    if (!r[key].length) return;
    sec(title);
    r[key].forEach((x, i) => {
      b.push({ t: 'line', text: left(x), right: right(x), path: [key, i, 'line'] });
      rest(x, i);
    });
  };
  const bullets = (key) => (x, i) => x.bullets.forEach((t, j) => b.push({ t: 'bullet', text: t, path: [key, i, 'bullets', j] }));
  entries('Experience', 'experience', x => x.title + (x.org ? ', ' + x.org : ''), x => x.dates, bullets('experience'));
  entries('Projects', 'projects', x => x.name + (x.tech ? ' — ' + x.tech : ''), x => x.dates, bullets('projects'));
  entries('Education', 'education', x => x.school, x => x.dates, (x, i) => {
    if (x.degree) b.push({ t: 'italic', text: x.degree, path: ['education', i, 'degree'] });
    if (x.details) b.push({ t: 'para', text: x.details, path: ['education', i, 'details'] });
  });
  if (r.certifications.length) { sec('Certifications'); r.certifications.forEach((t, i) => b.push({ t: 'bullet', text: t, path: ['certifications', i] })); }
  if (r.extras.length) { sec('Activities'); r.extras.forEach((t, i) => b.push({ t: 'bullet', text: t, path: ['extras', i] })); }
  return b;
}

/** Puts edited block text back into a copy of the resume. edits: [{path, text}] in block order. */
export function applyResumeEdits(r, edits) {
  const out = JSON.parse(JSON.stringify(r));
  edits.forEach(({ path, text }) => {
    if (!path) return;
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    const [k, i, f, j] = path;
    if (k === 'name' || k === 'headline' || k === 'summary') out[k] = t;
    else if (k === 'contact') out.contact = t.split(/\s*•\s*/).filter(Boolean);
    else if (k === 'skills') out.skills[i].items = t.split(/\s*,\s*/).filter(Boolean);
    else if (k === 'certifications' || k === 'extras') out[k][i] = t;
    else if (f === 'bullets') out[k][i].bullets[j] = t;
    else if (k === 'education' && (f === 'degree' || f === 'details')) out.education[i][f] = t;
    else if (f === 'line') {
      const x = out[k][i];
      if (k === 'experience') { const m = t.split(/,\s*/); x.title = m.shift() || ''; x.org = m.join(', '); }
      else if (k === 'projects') { const m = t.split(/\s+—\s+/); x.name = m.shift() || ''; x.tech = m.join(' — '); }
      else x.school = t;
    }
  });
  ['certifications', 'extras'].forEach(k => { out[k] = out[k].filter(Boolean); });
  ['experience', 'projects'].forEach(k => out[k].forEach(x => { x.bullets = x.bullets.filter(Boolean); }));
  return cleanResume(out) || r;
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
