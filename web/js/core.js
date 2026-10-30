/**
 * Job Hunter: pure logic shared by the page and the Node tests.
 * No DOM, no network. Everything here works on plain objects.
 */

// ---------- Constants ----------
export const STAGES = ['Applied', 'Screening', 'Interview', 'Offer'];
export const STATUSES = ['Applied', 'Screening', 'Interview', 'Offer', 'Rejected', 'Withdrawn', 'Ghosted'];
export const JOB_STATUSES = ['New', 'Applied', 'Skipped', 'Expired'];
export const JOBS_PER_UPDATE = [0, 3, 5, 10, 15];
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; // Date.getDay() order
export const ROLE_RANGES = { core: 'Just my roles', related: 'My roles + related ones I’d fit', stretch: 'Also stretch roles (one skill away)' };
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const SINCE_DAYS = [30, 60, 120];
export const MIN_MATCHES = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
export const LEVELS = { fresher: 'Fresher (0–1 year)', intern: 'Internship', both: 'Fresher jobs or internships' };
export const JOB_TYPES = { fulltime: 'Full-time', internship: 'Internship', both: 'Full-time or internship' };
export const GHOST_DAYS = 21;
// Emails read per sync (the rest are read on the next one, oldest first), job-alert emails, and how far a search lists.
// 3: per message, every match, job sites' employers, Promotions for job sites (2 lacked the last two; 1 read 80 threads).
export const GMAIL_SCAN = 3;
export const MAX_EMAILS = 300, MAX_ALERT_EMAILS = 25, MAX_LISTED = 2000;
export const MAX_SEEN = 5000, MAX_LOG = 300, MAX_JOBS = 1000, MAX_CV = 20000;

// Job sites and application systems: their confirmations often land in Promotions, so that tab is searched for them only.
const APPLY_SENDERS = 'from:linkedin.com from:naukri.com from:internshala.com from:indeed.com from:foundit.in from:instahyre.com from:wellfound.com from:unstop.com from:cutshort.io from:hirist.tech from:apna.co from:shine.com from:myworkday.com from:greenhouse.io from:lever.co from:ashbyhq.com from:smartrecruiters.com from:workablemail.com from:icims.com from:successfactors.com from:taleo.net from:hirepro.in from:superset.com';
export const APP_QUERY = `("thank you for applying" OR "thanks for applying" OR "application received" OR "received your application" OR "your application" OR "application for" OR "applied for" OR "application was sent" OR "application has been" OR "application status" OR "update on your application" OR "thank you for your interest" OR "your candidacy" OR "next steps" OR "next round" OR interview OR shortlisted OR assessment OR "online test" OR "coding test" OR "aptitude test" OR "technical round" OR "hr round" OR hackerrank OR hackerearth OR codility OR mettl OR unfortunately OR "not moving forward" OR "regret to inform" OR "not been selected" OR "not selected" OR "offer letter" OR "pleased to offer" OR "joining date" OR withdrawn OR "successfully applied" OR "applied successfully" OR "application submitted" OR "under review" OR "we have received" OR "you applied" OR "applied to" OR candidature) -category:social (-category:promotions OR {${APPLY_SENDERS}})`;
export const ALERT_SENDERS = 'from:linkedin.com OR from:naukri.com OR from:naukri.in OR from:internshala.com OR from:indeed.com OR from:foundit.in OR from:instahyre.com OR from:wellfound.com OR from:glassdoor.com OR from:apna.co OR from:unstop.com OR from:cutshort.io OR from:hirist.tech OR from:shine.com OR from:timesjobs.com OR from:monsterindia.com';

// Job sites' own application emails ("Your application was sent to…") count, so only their alert-only senders are left out.
export const ALERT_ONLY = 'jobalerts-noreply@linkedin.com jobs-listings@linkedin.com';
export const appSearch = (afterStr) => `after:${afterStr} ${APP_QUERY} -{${ALERT_ONLY.split(' ').map(a => 'from:' + a).join(' ')}}`;
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
      roleRange: 'related',
      avoid: ['Sales', 'Telecalling', 'Unpaid internships', 'Training institutes that charge fees'],
    },
    jobsPerUpdate: 5,
    // When syncs run on their own (this device's clock). The page does the work, so a time missed while it's closed runs on the next open.
    schedule: { on: true, days: [0, 1, 2, 3, 4, 5, 6], gmailAt: '07:00', jobsAt: '09:00' },
    sinceDays: 120,
    notify: false, // browser notifications after a sync
    emailAlerts: false, // opt-in: the server looks for jobs while the app is closed and emails them (api/alerts.js)
    keywords: [], // your own words to look for in job posts (they count as skills you have, and weigh more)
    minMatch: 40, // new matches below this score are left out
    matchView: { location: '', experience: 'fresher', internships: true, hideApplied: true }, // the job matches screen's filters
    companies: [], // company job boards you follow: [{ats, slug, name, host?, site?}]
    autoCompanies: true, // also search INDIA_BOARDS, so matches come without following anyone
  };
}

const strList = (v, max, len) => (Array.isArray(v) ? v : [])
  .map(x => (typeof x === 'string' ? x.trim().slice(0, len) : '')).filter(Boolean)
  .filter((x, i, a) => a.findIndex(y => y.toLowerCase() === x.toLowerCase()) === i).slice(0, max);

/** Fills gaps with defaults and drops anything invalid. */
function normalizeSchedule(v, oldHours, d) {
  if (!v || typeof v !== 'object') return Object.assign({}, d, { on: oldHours !== 0 }); // older files: "only when I click" = off
  const days = Array.isArray(v.days) ? [...new Set(v.days.map(Number).filter(n => n >= 0 && n <= 6))].sort() : d.days;
  return { on: v.on !== false, days, gmailAt: TIME_RE.test(v.gmailAt) ? v.gmailAt : d.gmailAt, jobsAt: TIME_RE.test(v.jobsAt) ? v.jobsAt : d.jobsAt };
}

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
      roleRange: p.roleRange in ROLE_RANGES ? p.roleRange : d.prefs.roleRange,
      avoid: Array.isArray(p.avoid) ? strList(p.avoid, 15, 80) : d.prefs.avoid,
    },
    jobsPerUpdate: pick(r.jobsPerUpdate, JOBS_PER_UPDATE, d.jobsPerUpdate),
    schedule: normalizeSchedule(r.schedule, r.autoUpdateHours, d.schedule),
    sinceDays: pick(r.sinceDays, SINCE_DAYS, d.sinceDays),
    notify: r.notify === true,
    emailAlerts: r.emailAlerts === true,
    autoCompanies: r.autoCompanies !== false,
    keywords: Array.isArray(r.keywords) ? strList(r.keywords, 20, 40) : d.keywords,
    minMatch: MIN_MATCHES.indexOf(Number(r.minMatch)) >= 0 ? Number(r.minMatch) : d.minMatch,
    matchView: (() => { const v = r.matchView && typeof r.matchView === 'object' ? r.matchView : {}; return { location: str(v.location, 60, ''), experience: v.experience === 'any' ? 'any' : 'fresher', internships: v.internships !== false, hideApplied: v.hideApplied !== false }; })(),
    companies: (Array.isArray(r.companies) ? r.companies : []).map(normalizeCompany).filter(Boolean)
      .filter((c, i, all) => all.findIndex(b => companyKey(b) === companyKey(c)) === i).slice(0, MAX_COMPANIES),
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
  return { version: 2, settings: defaultSettings(), applications: [], jobs: [], seen: [], log: [], cv: '', cvFile: null, cvFold: null, cvFoldHash: '', review: [], reviewDone: [], skillsAdded: [], skillsRemoved: [], lastRunAt: '', gmailRunAt: '', gmailScan: GMAIL_SCAN, gmailRescan: false, jobsRunAt: '', startedOn: '', removed: [] };
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
    review: arr(r.review).slice(0, MAX_REVIEW),
    reviewDone: Array.isArray(r.reviewDone) ? r.reviewDone.map(String).slice(-500) : [],
    skillsAdded: strList(r.skillsAdded, 40, 40),
    skillsRemoved: strList(r.skillsRemoved, 80, 40),
    lastRunAt: typeof r.lastRunAt === 'string' ? r.lastRunAt : '',
    // When job boards were last checked (older files did it on every run).
    jobsRunAt: typeof r.jobsRunAt === 'string' ? r.jobsRunAt : (typeof r.lastRunAt === 'string' ? r.lastRunAt : ''),
    // GMAIL_SCAN: how Gmail is read now. Older data reads its application emails again once, with the better search and rules.
    gmailScan: r.gmailScan === GMAIL_SCAN ? GMAIL_SCAN : 1,
    startedOn: isYmd(r.startedOn) ? r.startedOn : '', // the day you finished setup
    removed: arr(r.removed).filter(x => typeof x.key === 'string' && isYmd(x.on)).slice(-MAX_REMOVED), // applications you removed: {key, on}
    gmailRescan: r.gmailRescan === true, // a re-read is under way (its seen ids were cleared once)
    // When Gmail was last read. Older files read Gmail on every run, so their lastRunAt counts.
    gmailRunAt: typeof r.gmailRunAt === 'string' ? r.gmailRunAt : (typeof r.lastRunAt === 'string' && !('gmailRunAt' in r) ? r.lastRunAt : ''),
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

export const FIRST_DAY_GAP_H = 2; // on the day you sign up, the job search runs this often until you have a day's matches
/**
 * A match score in words: shown instead of the number everywhere. tone is for colour (top, hi, mid, low).
 * Ambitious 90+ (the top tier), Excellent 80–89, Good 65–79, Fair 50–64, Poor under 50.
 */
export const MATCH_LEVELS = [[90, 'Ambitious', 'top'], [80, 'Excellent', 'hi'], [65, 'Good', 'hi'], [50, 'Fair', 'mid'], [0, 'Poor', 'low']];
export function matchLabel(score) {
  const s = Number(score) || 0;
  const [, label, tone] = MATCH_LEVELS.find(([min]) => s >= min);
  return { label, tone };
}

export const MIN_UPDATE_GAP_MIN = 10; // automatic syncs that fail aren't retried sooner than this

/** The latest scheduled time at or before now (on a chosen day), or null. at is "HH:MM" on this device's clock. */
export function lastSlot(days, at, now) {
  const [hh, mm] = at.split(':').map(Number);
  for (let k = 0; k < 8; k++) {
    const d = new Date(now.getTime()); d.setDate(d.getDate() - k); d.setHours(hh, mm, 0, 0);
    if (d <= now && days.includes(d.getDay())) return d;
  }
  return null;
}

/**
 * Which parts of a sync are due now: {gmail, jobs}. Each is due when it hasn't run since its latest scheduled time,
 * so a time missed while the page was closed runs on the next open. The very first run is always due.
 * On the day you sign up (startedOn), the job search also runs every FIRST_DAY_GAP_H hours until it has found
 * jobsPerUpdate matches that day, so you don't wait for tomorrow's time to see any.
 */
export function scheduleDue(data, now) {
  const s = data.settings, sc = s.schedule;
  if (!s.onboarded) return { gmail: false, jobs: false };
  const due = (last, at) => {
    if (!last) return true;
    if (!sc.on) return false;
    const slot = lastSlot(sc.days, at, now);
    return !!slot && new Date(last) < slot;
  };
  const today = ymd(now);
  const foundToday = data.jobs.filter(j => j.found_on === today && j.source !== 'Pasted').length;
  const firstDay = sc.on && data.startedOn === today && foundToday < s.jobsPerUpdate &&
    now.getTime() - new Date(data.jobsRunAt).getTime() >= FIRST_DAY_GAP_H * 3600e3;
  return { gmail: due(data.gmailRunAt, sc.gmailAt), jobs: s.jobsPerUpdate > 0 && (due(data.jobsRunAt, sc.jobsAt) || firstDay) };
}

// ---------- Email alerts (opt-in; the server side is web/api/_alerts.js) ----------
/**
 * What the alerts server keeps for you: only what matching needs. Skill names, never the CV; nothing from Gmail.
 * tz is this device's time zone, so "New jobs ready by" means your time.
 */
export function alertProfile(data, tz) {
  const s = data.settings;
  return {
    settings: { prefs: s.prefs, keywords: s.keywords, minMatch: s.minMatch, jobsPerUpdate: s.jobsPerUpdate, schedule: s.schedule, companies: s.companies, autoCompanies: s.autoCompanies },
    skills: mySkills(data).slice(0, 80), tz: String(tz || 'Asia/Kolkata'),
  };
}

/** {due, day}: whether the alert search should run now for this profile (its time zone), and the local day. */
export function alertDue(profile, sentDay, now) {
  let parts;
  try {
    parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: profile.tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
      .formatToParts(now).map(p => [p.type, p.value]));
  } catch (e) { return { due: false, day: '' }; }
  const day = `${parts.year}-${parts.month}-${parts.day}`, time = `${parts.hour}:${parts.minute}`;
  const s = profile.settings, sc = s.schedule;
  const due = sc.on && s.jobsPerUpdate > 0 && sc.days.includes(DAYS.indexOf(parts.weekday)) && time >= sc.jobsAt && sentDay !== day;
  return { due, day };
}

/** Jobs the alerts server found while the app was closed, added as New (keeping where each was found; skipping ones already here). Returns how many. */
export function mergeAlertJobs(data, jobs) {
  const ids = new Set(data.jobs.map(j => j.id)), keys = new Set(data.jobs.map(j => j.key).filter(Boolean));
  let n = 0;
  (Array.isArray(jobs) ? jobs : []).forEach(j => {
    if (!j || typeof j !== 'object' || !j.id || ids.has(j.id) || (j.key && keys.has(j.key))) return;
    data.jobs.push(Object.assign({}, j, { status: 'New' }));
    ids.add(j.id); if (j.key) keys.add(j.key); n++;
  });
  return n;
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
    '"stage": "Applied"|"Screening"|"Interview"|"Offer"|"Rejected"|"Withdrawn", "next_step": "<short action for the candidate, or empty>", ' +
    '"next_at": "<YYYY-MM-DDTHH:MM of the interview slot or the test deadline if the email states one, else empty>", "next_kind": "interview"|"deadline"|"", ' +
    '"round": "<e.g. Round 2, HR round, or empty>", "needs_review": true|false}.\n' +
    'Rules: assessment or online test invite = Screening; interview invite or reminder = Interview; selection or offer = Offer. Use the real employer name, not the job board. Role empty if not stated. ' +
    'Set needs_review=true (with is_application_update=false) for an email that is clearly about one of their applications but where you cannot tell the company or what happened.\n\n' +
    batch.map((e, i) => `### Email ${i}\nFrom: ${e.from}\nDate: ${e.date.toISOString().slice(0, 10)}\nSubject: ${e.subject}\n${e.body}`).join('\n\n');
}

// Job sites that send confirmations on the employer's behalf; their sender name is never the company.
const JOB_SITE_RE = /linkedin|naukri|internshala|indeed|foundit|instahyre|wellfound|glassdoor|apna\.co|unstop|cutshort|hirist|shine\.com|timesjobs|monsterindia|superset/i;
const NAME = "([A-Z0-9][\\w&.,'()\\- ]{1,60}?)";
const COMPANY_RES = [
  new RegExp('(?:application|resume|profile|candidature)\\s+(?:was|has been|is)?\\s*(?:sent|submitted|shared|forwarded)\\s+to\\s+' + NAME + '(?=\\s*(?:[.!,\\n]|$| for | has | is ))'),
  new RegExp('(?:applied|applying)\\s+(?:to|at|with)\\s+' + NAME + '(?=\\s*(?:[.!,\\n]|$| for | has | is ))'),
  new RegExp('\\b(?:at|to)\\s+' + NAME + '\\s+(?:has been|was|is)\\s+(?:sent|submitted|received|viewed)'),
  new RegExp('(?:role|position|job|internship|opening)\\s+at\\s+' + NAME + '(?=\\s*(?:[.!,\\n]|$| has | is | was ))'),
  new RegExp('^' + NAME + '\\s+(?:has\\s+)?(?:received|viewed|reviewed|shortlisted)\\s+your\\s+application', 'm'),
];
/**
 * The employer (and role, when it says) named in a job site's email: "Your application was sent to Acme",
 * "You applied to SOC Analyst at Acme". Returns {company, role}; company is '' when none is named.
 */
export function jobSiteParts(text) {
  const t = String(text || '').replace(/\r/g, '');
  for (const re of COMPANY_RES) {
    const m = t.match(re);
    if (!m) continue;
    let c = m[1], role = '';
    const at = c.lastIndexOf(' at ');
    if (at > 0) { role = c.slice(0, at).trim(); c = c.slice(at + 4); }
    c = c.replace(/[\s,.-]+$/, '').replace(/(?:\s+(?:Pvt|Private|Ltd|Limited|Inc|LLP)\.?)+$/i, '').replace(/[\s,.-]+$/, '').trim();
    if (c.length >= 2 && !JOB_SITE_RE.test(c) && !/^(the|a|an|this|your|our|you)$/i.test(c)) return { company: c, role: role.slice(0, 80) };
  }
  return { company: '', role: '' };
}

export function ruleClassify(e) {
  const t = (e.subject + ' ' + e.body).toLowerCase();
  let stage = null;
  if (/unfortunately|not moving forward|regret to inform|not been selected|other candidates|not to take your application forward/.test(t)) stage = 'Rejected';
  else if (/offer letter|pleased to offer|you have been selected|congratulations/.test(t)) stage = 'Offer';
  else if (/interview/.test(t)) stage = 'Interview';
  else if (/assessment|online test|coding test|shortlisted/.test(t)) stage = 'Screening';
  else if (/withdrawn/.test(t)) stage = 'Withdrawn';
  else if (/thank(s| you) for applying|application (has been )?received|received your application|your application|successfully applied|applied successfully|application (was |has been )?(sent|submitted)|you applied|applied to/.test(t)) stage = 'Applied';
  const looksRelated = /\b(application|applied|interview|assessment|shortlist(ed)?|offer|candidature)\b/i.test(e.subject);
  if (!stage) return { is_application_update: false, needs_review: looksRelated };
  // A job site's email names the employer in its text; its sender is the job site.
  const parts = JOB_SITE_RE.test(e.from) ? jobSiteParts(e.subject + '\n' + e.body) : { company: companyFromSender(e.from), role: '' };
  const company = parts.company;
  const rm = e.subject.match(/(?:for|–|-)\s+(?:the\s+)?(.+?)\s+(?:position|role|job|opening|internship)(?:\s+at\b|$|\s)/i) || e.subject.match(/application for\s+(.+?)(?:\s+at\s+.+)?$/i);
  return { is_application_update: !!company, needs_review: !company, company, role: parts.role || (rm ? rm[1].trim() : ''), stage, next_step: stage === 'Screening' ? 'Complete the assessment' : stage === 'Interview' ? 'Prepare for / schedule the interview' : '' };
}

export function companyFromSender(from) {
  const name = (from.match(/^"?([^"<]+?)"?\s*</) || [])[1];
  const domain = (from.match(/@([^>\s]+)/) || [])[1] || '';
  const generic = /^(careers?|jobs?|recruit(ing|ment|ers?)?|talent( team| acquisition)?|hr( team)?|hiring( team)?|campus( hiring| team)?|people( team)?|no-?reply|notifications?|team)$/i;
  if (name && !generic.test(name.trim()) && !/no-?reply/i.test(name)) return name.replace(/\b(careers?|recruit(ing|ment|ers?)|talent( acquisition| team)?|hiring( team)?|hr( team)?|campus( hiring| team)?|people( team)?|jobs|team)\b/ig, '').replace(/\s{2,}/g, ' ').replace(/[\s,|·-]+$/, '').trim();
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
export const newResult = () => ({ appsNew: 0, appsChanged: [], changes: [], jobsNew: [], due: [], review: 0, notes: [] });

const isNextAt = (v) => /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(String(v || ''));
const addHistory = (app, on, status, by) => {
  app.history = (Array.isArray(app.history) ? app.history : []).concat({ on, status, by }).slice(-30);
};

/** u: {company, role, stage, next_step, next_at, next_kind, round, date: 'yyyy-mm-dd', channel, link (the email), posting (the job ad)} */
export const MAX_REMOVED = 500;
const IN_PLAY = ['Applied', 'Screening', 'Interview'];
export const inPlay = (a) => IN_PLAY.includes(a.status);

/** Removes these applications and remembers them, so an email about one from before today doesn't bring it back. */
export function removeApplications(data, list, today) {
  const gone = new Set(list);
  data.removed = (data.removed || []).concat(list.map(a => ({ key: a.key || `${a.company}|${a.role || ''}`.toLowerCase(), on: today }))).slice(-MAX_REMOVED);
  data.applications = data.applications.filter(a => !gone.has(a));
  return list.length;
}

/** Whether an email dated `date` is about an application you removed after that date. */
function wasRemoved(removed, company, role, date) {
  const key = (company + '|' + role).toLowerCase(), co = company.toLowerCase() + '|';
  return removed.some(r => date <= r.on && (r.key === key || (!role && r.key.indexOf(co) === 0) || r.key === co));
}

export function upsertApplication(apps, u, result, removed = []) {
  const company = String(u.company || '').trim();
  if (!company) return null;
  if (u.date && wasRemoved(removed, company, String(u.role || '').trim(), u.date)) return null;
  const role = String(u.role || '').trim();
  const stage = STATUSES.indexOf(u.stage) >= 0 ? u.stage : 'Applied';
  const key = (company + '|' + role).toLowerCase();
  const keyNoRole = company.toLowerCase() + '|';
  const cur = apps.find(a => a.key === key || (!role && a.key.indexOf(keyNoRole) === 0) || (role && a.key === keyNoRole));
  if (!cur) {
    const app = {
      id: newId(), company, role, channel: u.channel || 'Company site', applied_on: u.date, status: stage,
      furthest: STAGES.indexOf(stage) >= 0 ? stage : 'Applied', last_update: u.date, next_step: u.next_step || '', email_link: u.link || '', key,
      posting_link: isHttpUrl(u.posting) ? u.posting : '',
    };
    setNext(app, u);
    addHistory(app, u.date, stage, 'email');
    apps.push(app);
    result.appsNew++;
    result.appsChanged.push(`${company}${role ? ' – ' + role : ''}: ${stage}`);
    result.changes.push({ company, role, from: '', to: stage });
    return app;
  }
  if (role && !cur.role) { cur.role = role; cur.key = key; }
  // An email older than what's already recorded, or from before your own last change, doesn't move the status
  // (Gmail can be read again from further back; your corrections win).
  const mine = (Array.isArray(cur.history) ? cur.history : []).filter(x => x.by === 'you').pop();
  if ((cur.last_update && u.date < cur.last_update) || (mine && u.date <= mine.on)) {
    if (u.link && !cur.email_link) cur.email_link = u.link;
    return cur;
  }
  const prev = cur.status;
  if (STAGES.indexOf(stage) > STAGES.indexOf(cur.furthest)) cur.furthest = stage;
  cur.status = stage;
  cur.last_update = u.date;
  cur.next_step = u.next_step || (['Rejected', 'Withdrawn', 'Offer'].indexOf(stage) >= 0 ? '' : cur.next_step);
  if (u.link) cur.email_link = u.link;
  if (isHttpUrl(u.posting) && !cur.posting_link) cur.posting_link = u.posting;
  setNext(cur, u);
  if (prev !== stage) {
    addHistory(cur, u.date, stage, 'email');
    result.appsChanged.push(`${cur.company}${cur.role ? ' – ' + cur.role : ''}: ${prev} → ${stage}`);
    result.changes.push({ company: cur.company, role: cur.role, from: prev, to: stage });
  }
  return cur;
}

/** The next interview slot or deadline, when the email gave one. A closed application has none. */
function setNext(app, u) {
  if (['Rejected', 'Withdrawn', 'Offer'].indexOf(app.status) >= 0) { app.next_at = ''; app.next_kind = ''; app.round = ''; return; }
  if (isNextAt(u.next_at)) {
    app.next_at = u.next_at;
    app.next_kind = u.next_kind === 'deadline' ? 'deadline' : 'interview';
    app.round = String(u.round || '').trim().slice(0, 40);
  }
}

export function setApplicationStatus(app, status, today) {
  if (STATUSES.indexOf(status) < 0) throw new Error('Unknown status.');
  if (app.status !== status) addHistory(app, today, status, 'you');
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
      addHistory(a, ymd(now), 'Ghosted', 'quiet');
      result.changes.push({ company: a.company, role: a.role, from: 'Applied', to: 'Ghosted' });
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

// ---------- A pasted email (when Gmail isn't connected) ----------
/**
 * Text copied from an email → {from, subject, body} for the classifier. Reads "From:" / "Subject:" lines when
 * they're there; otherwise the first line is the subject and the first line with an address is the sender.
 */
export function parsePastedEmail(text) {
  const t = String(text || '').replace(/\r/g, '').trim();
  const lines = t.split('\n');
  const head = (name) => { const l = lines.slice(0, 20).find(x => new RegExp('^\\s*' + name + '\\s*:', 'i').test(x)); return l ? l.replace(/^[^:]*:\s*/, '').trim() : ''; };
  let subject = head('subject'), from = head('from');
  if (!subject) subject = (lines.find(l => l.trim()) || '').trim().slice(0, 200);
  if (!from) from = (lines.slice(0, 8).find(l => /[^\s@<]+@[^\s@>]+\.[a-z]{2,}/i.test(l)) || '').trim().slice(0, 200);
  return { from, subject, body: clip(t, 4000) };
}

// ---------- Board, next steps, timeline ----------
/** How a status is shown. "Screening" is stored, "Assessment" is what people call it. */
export const STATUS_LABEL = { Applied: 'Applied', Screening: 'Assessment', Interview: 'Interview', Offer: 'Offer', Rejected: 'Rejected', Withdrawn: 'Withdrawn', Ghosted: 'No reply' };
/** Board columns and the statuses each one holds; dropping a card on a column sets its first status. */
export const BOARD = [
  { id: 'Applied', label: 'Applied', statuses: ['Applied', 'Ghosted'] },
  { id: 'Screening', label: 'Assessment', statuses: ['Screening'] },
  { id: 'Interview', label: 'Interview', statuses: ['Interview'] },
  { id: 'Offer', label: 'Offer', statuses: ['Offer'] },
  { id: 'Rejected', label: 'Rejected', statuses: ['Rejected', 'Withdrawn'] },
];
export const boardColumn = (status) => (BOARD.find(c => c.statuses.indexOf(status) >= 0) || BOARD[0]).id;

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The pill on a card: "Round 2 · Tue 3 Nov, 11:00" for an interview slot, "Due Fri" (or "Due 12 Nov",
 * "Due today", "Overdue") for a deadline, else the short next step. Empty when there's nothing to do.
 */
export function nextLabel(app, now = new Date()) {
  if (['Rejected', 'Withdrawn', 'Offer'].indexOf(app.status) >= 0) return { text: '', tone: '' };
  if (isNextAt(app.next_at)) {
    const [d, t] = String(app.next_at).split('T');
    const at = new Date(d + 'T' + (t || '23:59') + ':00');
    const days = Math.round((new Date(d + 'T00:00:00') - new Date(ymd(now) + 'T00:00:00')) / 864e5);
    const day = `${WEEKDAY[at.getDay()]} ${at.getDate()} ${MONTH[at.getMonth()]}`;
    if (app.next_kind === 'deadline') {
      if (days < 0) return { text: 'Overdue', tone: 'red' };
      if (days === 0) return { text: 'Due today', tone: 'orange' };
      return { text: days < 7 ? `Due ${WEEKDAY[at.getDay()]}` : `Due ${at.getDate()} ${MONTH[at.getMonth()]}`, tone: 'orange' };
    }
    if (days >= 0) return { text: `${app.round || 'Interview'} · ${day}${t ? ', ' + t : ''}`, tone: 'blue' };
  }
  if (app.status === 'Ghosted') return { text: `No reply for ${GHOST_DAYS}+ days`, tone: '' };
  return { text: app.next_step ? clip(app.next_step, 40) : '', tone: app.status === 'Screening' ? 'orange' : app.status === 'Interview' ? 'blue' : '' };
}

/** Every status change as an event, newest first: {on, company, role, status, by, app}. */
export function timeline(apps) {
  const out = [];
  apps.forEach(a => {
    const h = Array.isArray(a.history) && a.history.length ? a.history
      : [{ on: a.applied_on, status: 'Applied', by: 'email' }].concat(a.status !== 'Applied' ? [{ on: a.last_update, status: a.status, by: 'email' }] : []);
    h.forEach(e => { if (isYmd(e.on)) out.push({ on: e.on, company: a.company, role: a.role, status: e.status, by: e.by || 'email', app: a }); });
  });
  return out.sort((x, y) => y.on.localeCompare(x.on));
}

/** Emails that look like an application update but couldn't be matched; shown under "N emails need a look". */
export const MAX_REVIEW = 200;
export function addReview(data, e, guess) {
  if (data.review.some(r => r.id === e.id) || (data.reviewDone || []).indexOf(e.id) >= 0) return false;
  data.review.unshift({ id: e.id, from: String(e.from || '').slice(0, 200), subject: String(e.subject || '').slice(0, 200), date: ymd(e.date), link: e.link || '',
    company: String((guess && guess.company) || companyFromSender(e.from) || '').slice(0, 80), stage: (guess && STATUSES.indexOf(guess.stage) >= 0) ? guess.stage : 'Applied' });
  data.review = data.review.slice(0, MAX_REVIEW);
  return true;
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


// ---------- Dashboard numbers ----------
export function summary(apps) {
  const total = apps.length;
  const responses = apps.filter(a => a.furthest !== 'Applied').length;
  return {
    total, responses,
    active: apps.filter(inPlay).length,
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
/**
 * Searched for everyone (unless switched off), so matches come without following anyone: companies (start-ups and
 * large companies) with public job boards that list jobs in India, each checked to answer on 2026-10-30. Amazon, Google,
 * Microsoft, TCS, Infosys and Wipro have no public listing API (their own sites only), so they aren't here. Following a company adds it on top.
 */
export const INDIA_BOARDS = [
  ...COMPANY_SUGGESTIONS,
  ...[['databricks', 'Databricks'], ['rubrik', 'Rubrik'], ['okta', 'Okta'], ['mongodb', 'MongoDB'], ['stripe', 'Stripe'], ['twilio', 'Twilio'],
    ['elastic', 'Elastic'], ['cloudflare', 'Cloudflare'], ['hackerrank', 'HackerRank'], ['inmobi', 'InMobi'], ['gitlab', 'GitLab'],
    ['coinbase', 'Coinbase'], ['airbnb', 'Airbnb'], ['purestorage', 'Pure Storage']].map(([slug, name]) => ({ ats: 'greenhouse', slug, name })),
  { ats: 'lever', slug: 'paytm', name: 'Paytm' },
  { ats: 'ashby', slug: 'notion', name: 'Notion' },
  { ats: 'smartrecruiters', slug: 'Freshworks', name: 'Freshworks' },
  // Large companies on Workday (searched by your roles; India jobs kept by your locations)
  ...[['accenture.wd103', 'AccentureCareers', 'Accenture'], ['salesforce.wd12', 'External_Career_Site', 'Salesforce'], ['adobe.wd5', 'external_experienced', 'Adobe'],
    ['intel.wd1', 'External', 'Intel'], ['mastercard.wd1', 'CorporateCareers', 'Mastercard'], ['pwc.wd3', 'Global_Experienced_Careers', 'PwC'],
    ['target.wd5', 'targetcareers', 'Target'], ['hp.wd5', 'ExternalCareerSite', 'HP'], ['cisco.wd5', 'Cisco_Careers', 'Cisco'],
    ['crowdstrike.wd5', 'crowdstrikecareers', 'CrowdStrike'], ['citi.wd5', '2', 'Citi'], ['micron.wd1', 'External', 'Micron'],
    ['workday.wd5', 'Workday', 'Workday'], ['visa.wd5', 'Visa', 'Visa']]
    .map(([h, site, name]) => ({ ats: 'workday', slug: h.split('.')[0], host: h + '.myworkdayjobs.com', site, name })),
];
/** The boards a job search reads: the ones you follow, plus the built-in list when autoCompanies is on. */
export function searchCompanies(s) {
  const out = new Map();
  [...(s.companies || []), ...(s.autoCompanies === false ? [] : INDIA_BOARDS)].forEach(c => { if (!out.has(companyKey(c))) out.set(companyKey(c), c); });
  return [...out.values()];
}
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
const GENERIC_WORDS = new Set(['analyst', 'engineer', 'developer', 'tester', 'consultant', 'intern', 'internship', 'associate', 'specialist', 'trainee', 'executive',
  'junior', 'graduate', 'fresher', 'entry', 'level', 'and', 'of', 'the', 'for', 'in', 'a', 'an', 'role', 'jobs', 'job']);
const ROLE_SYNONYMS = {
  penetration: ['penetration', 'pentest', 'vapt', 'offensive', 'red team', 'ethical hack'],
  pentester: ['penetration', 'pentest', 'vapt', 'offensive', 'red team'],
  soc: ['soc', 'security operations', 'incident response', 'threat', 'detection'],
  grc: ['grc', 'governance', 'risk', 'compliance', 'audit'],
  cloud: ['cloud', 'aws', 'azure', 'gcp', 'devsecops'],
  security: ['security', 'cyber', 'infosec', 'soc', 'appsec'],
  cyber: ['cyber', 'security', 'infosec'],
  cybersecurity: ['cybersecurity', 'cyber', 'security', 'infosec'],
  infosec: ['infosec', 'information security', 'security', 'cyber'],
  appsec: ['appsec', 'application security', 'product security', 'security'],
  devsecops: ['devsecops', 'security', 'devops'],
  vapt: ['vapt', 'penetration', 'pentest', 'vulnerability', 'offensive'],
  ethical: ['ethical hack', 'penetration', 'pentest', 'offensive'],
  hacker: ['hack', 'penetration', 'pentest', 'offensive'],
  threat: ['threat', 'detection', 'soc', 'incident'],
  incident: ['incident', 'soc', 'detection', 'response'],
  forensics: ['forensic', 'dfir', 'incident'],
  vulnerability: ['vulnerability', 'vapt', 'security'],
  information: ['information', 'infosec', 'security'],
  software: ['software', 'sde', 'developer', 'backend', 'frontend', 'full stack', 'fullstack'],
  network: ['network', 'noc'],
  data: ['data', 'analytics'],
};
const SENIOR_RE = /\b(senior|sr|staff|principal|lead|leader|manager|director|head|vp|vice president|architect|chief|cto|ciso|cio|ii|iii|iv|expert)\b/i;
// Sales and calling jobs are never a fresher-tech match, whatever their title mentions (left out like your skip list).
const SALES_RE = /\b(account executive|account manager|sales|business development|bdr|sdr|telecall\w*|tele-?caller|inside sales|pre-?sales|customer success manager|recruiter)\b/i;
const INTERN_RE = /\b(intern|internship|trainee|apprentice)\b/i;
const INDIA_RE = /\b(india|bengaluru|bangalore|hyderabad|pune|mumbai|chennai|delhi|gurgaon|gurugram|noida|kolkata|ahmedabad|kochi|coimbatore|jaipur|chandigarh|indore|thiruvananthapuram|trivandrum|visakhapatnam|vizag|bhubaneswar|mysuru|mysore|thane)\b/i;
const FOREIGN_RE = /\b(us|usa|united states|canada|uk|united kingdom|london|europe|emea|germany|france|netherlands|ireland|poland|spain|portugal|singapore|australia|japan|brazil|mexico|latam|americas|new york|san francisco|seattle|toronto|dubai|uae|israel|philippines|bulgaria|sweden|maryland|virginia|washington|california|texas|massachusetts|illinois|colorado|north carolina|new jersey|oregon|arizona|florida|ohio|pennsylvania|michigan|minnesota|utah|vancouver|berlin|amsterdam|paris|dublin|munich|tokyo|sydney|melbourne|costa rica|colombia|argentina|chile|malaysia|indonesia|vietnam|thailand|korea|china|taiwan|hong kong|south africa|kenya|nigeria|egypt|saudi|qatar|romania|czech|hungary|italy|switzerland|austria|belgium|denmark|norway|finland)\b/i;
const CITY_ALIASES = {
  bengaluru: ['bengaluru', 'bangalore'], bangalore: ['bengaluru', 'bangalore'],
  'delhi ncr': ['delhi', 'gurgaon', 'gurugram', 'noida'], delhi: ['delhi', 'gurgaon', 'gurugram', 'noida'],
  mumbai: ['mumbai', 'bombay', 'thane'], vizag: ['visakhapatnam', 'vizag'], trivandrum: ['thiruvananthapuram', 'trivandrum'],
};
// Short words (SOC, QA, ML, SDE) must be whole words, so "SOC" doesn't match "Social"; longer ones may run on
// ("engineer" → "engineering").
const hasWord = (text, term) => new RegExp('\\b' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + (term.length <= 4 ? 's?\\b' : '')).test(text);

/** Per target role, the title words that count as a match (with a few synonyms). */
export function roleTerms(roles) {
  return roles.map(r => {
    const words = String(r).toLowerCase().split(/[^a-z0-9+#]+/).filter(Boolean);
    const specific = words.filter(w => !GENERIC_WORDS.has(w));
    return [...new Set((specific.length ? specific : words).flatMap(w => ROLE_SYNONYMS[w] || [w]))];
  }).filter(t => t.length);
}

/**
 * Whether a job title fits your roles. 'core': every specific word of one of your roles is in the title
 * ("Cloud Security Intern" fits "Cloud Security"). 'related': any of them or a close synonym is.
 */
export function roleFits(title, roles, range = 'related') {
  const t = String(title || '').toLowerCase();
  // core: every specific word of a role is there, as itself or a close synonym ("Cybersecurity Analyst" fits
  // "Cyber Security Analyst"; "SOC Analyst" fits "Security Operations Analyst").
  if (range === 'core') return roles.some(r => {
    const words = String(r).toLowerCase().split(/[^a-z0-9+#]+/).filter(Boolean);
    const specific = words.filter(w => !GENERIC_WORDS.has(w));
    return (specific.length ? specific : words).every(w => (ROLE_SYNONYMS[w] || [w]).some(x => hasWord(t, x)));
  });
  return roleTerms(roles).some(ts => ts.some(w => hasWord(t, w)));
}

/** Core (your roles), Related (their close relatives) or Stretch (anything else) for a job title. */
export function roleKind(title, roles) {
  if (!roles.length) return 'Related';
  return roleFits(title, roles, 'core') ? 'Core' : roleFits(title, roles, 'related') ? 'Related' : 'Stretch';
}

/**
 * The words Workday boards are searched with today: your first role, plus two that change each day from your other
 * roles and their synonyms, so the results don't repeat. day is any whole number that goes up by one a day.
 */
export function searchWords(roles, day) {
  const pool = [...new Set([...roles.slice(1), ...roleTerms(roles).flat().filter(w => w.length > 3)].map(String))].filter(w => w.toLowerCase() !== String(roles[0] || '').toLowerCase());
  const k = pool.length ? Math.abs(Math.floor(day)) % pool.length : 0;
  return [roles[0], pool[k], pool[(k + 1) % pool.length]].filter((w, i, a) => w && a.indexOf(w) === i).slice(0, 3);
}

/** Whether a board listing is worth scoring, from its title and location alone. */
export const matchesPrefs = (l, prefs) => !rejectReason(l, prefs);

/** Why a listing is left out ('' when it's kept): role, senior, internOnly, fullTimeOnly, skipList or location. */
export function rejectReason(l, prefs) {
  const title = String(l.role || '').toLowerCase();
  if (!title) return 'role';
  if (prefs.roleRange !== 'stretch' && roleTerms(prefs.roles).length && !roleFits(title, prefs.roles, prefs.roleRange)) return 'role';
  if (SENIOR_RE.test(title)) return 'senior';
  if ((prefs.jobType === 'internship' || prefs.level === 'intern') && !INTERN_RE.test(title)) return 'internOnly';
  if (prefs.jobType === 'fulltime' && /\bintern(ship)?\b/i.test(title)) return 'fullTimeOnly';
  if (SALES_RE.test(title) || prefs.avoid.some(a => a.split(/\s+/).length <= 2 && hasWord(title, a.toLowerCase()))) return 'skipList';

  const loc = String(l.location || '').toLowerCase();
  if (!loc || /^\d+ locations?$/.test(loc)) return ''; // unknown: let the score decide
  const wants = prefs.locations.map(x => x.toLowerCase());
  const anyIndia = !wants.length || prefs.relocate || wants.includes('anywhere in india');
  if (INDIA_RE.test(loc) && (anyIndia || wants.some(w => (CITY_ALIASES[w] || [w]).some(a => hasWord(loc, a))))) return '';
  const remote = l.remote || /\b(remote|work from home|wfh|anywhere)\b/.test(loc);
  return remote && !FOREIGN_RE.test(loc) && (!wants.length || wants.includes('remote') || wants.includes('anywhere in india')) ? '' : 'location';
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
export function resumeFoldFor(base, job, description, template = 'standard') {
  const r = JSON.parse(JSON.stringify(base));
  r.meta = {
    analysis: {
      jobTitle: String(job.role || '').slice(0, 200), company: String(job.company || '').slice(0, 200),
      jobDescription: String(description || job.details || '').slice(0, 30000), keywords: '', keywordsMode: 'suggested', addedSkills: [], source: 'draft',
    },
    exportSettings: { filename: resumeFileBase(r.contact.fullName, job.company, job.role) },
    template: template in TEMPLATES ? template : 'standard', paper: 'a4',
  };
  return r;
}

// ---------- Profile from the CV (no AI needed) ----------
/** Indian cities people search jobs in, plus the two non-city choices. Used for location suggestions. */
export const PLACES = ['Remote', 'Anywhere in India', 'Hyderabad', 'Bengaluru', 'Pune', 'Chennai', 'Mumbai', 'Navi Mumbai', 'Thane', 'Delhi', 'New Delhi', 'Gurugram', 'Noida',
  'Greater Noida', 'Faridabad', 'Ghaziabad', 'Delhi NCR', 'Kolkata', 'Ahmedabad', 'Gandhinagar', 'Vadodara', 'Surat', 'Rajkot', 'Jaipur', 'Udaipur', 'Jodhpur', 'Lucknow',
  'Kanpur', 'Noida Extension', 'Varanasi', 'Prayagraj', 'Agra', 'Dehradun', 'Chandigarh', 'Mohali', 'Panchkula', 'Ludhiana', 'Amritsar', 'Jalandhar', 'Shimla', 'Jammu',
  'Srinagar', 'Indore', 'Bhopal', 'Gwalior', 'Jabalpur', 'Raipur', 'Bhilai', 'Nagpur', 'Nashik', 'Aurangabad', 'Kolhapur', 'Solapur', 'Goa', 'Panaji', 'Margao', 'Mangaluru',
  'Mysuru', 'Hubballi', 'Belagavi', 'Davanagere', 'Manipal', 'Kochi', 'Thiruvananthapuram', 'Kozhikode', 'Thrissur', 'Kollam', 'Coimbatore', 'Madurai', 'Tiruchirappalli',
  'Salem', 'Tiruppur', 'Vellore', 'Hosur', 'Puducherry', 'Visakhapatnam', 'Vijayawada', 'Guntur', 'Tirupati', 'Nellore', 'Kakinada', 'Rajahmundry', 'Kurnool', 'Anantapur',
  'Warangal', 'Karimnagar', 'Nizamabad', 'Khammam', 'Secunderabad', 'Bhubaneswar', 'Cuttack', 'Rourkela', 'Patna', 'Gaya', 'Ranchi', 'Jamshedpur', 'Dhanbad', 'Guwahati',
  'Shillong', 'Siliguri', 'Durgapur', 'Asansol', 'Imphal', 'Agartala', 'Aizawl', 'Gangtok'];
const CITY_ALIAS_IN_CV = { bangalore: 'Bengaluru', bombay: 'Mumbai', gurgaon: 'Gurugram', vizag: 'Visakhapatnam', trivandrum: 'Thiruvananthapuram', mysore: 'Mysuru', mangalore: 'Mangaluru', cochin: 'Kochi', calcutta: 'Kolkata', madras: 'Chennai', pondicherry: 'Puducherry', baroda: 'Vadodara' };

/** Places matching what's typed: names starting with it first, then names containing it. */
export function placeMatches(q, taken = [], n = 8) {
  const t = String(q || '').trim().toLowerCase();
  if (!t) return [];
  const have = new Set(taken.map(x => x.toLowerCase()));
  const alias = Object.entries(CITY_ALIAS_IN_CV).filter(([k]) => k.startsWith(t)).map(([, v]) => v);
  const starts = PLACES.filter(p => p.toLowerCase().startsWith(t) || p.toLowerCase().split(/\s+/).some(w => w.startsWith(t)));
  const inside = t.length < 2 ? [] : PLACES.filter(p => !starts.includes(p) && p.toLowerCase().includes(t));
  return [...new Set([...starts, ...alias, ...inside])].filter(p => !have.has(p.toLowerCase())).slice(0, n);
}

// What a CV says → which roles to suggest. Order matters only for ties.
const ROLE_SIGNALS = [
  ['SOC Analyst', /\b(soc|siem|splunk|wazuh|qradar|sentinel|elk|incident response|threat hunting|log analysis|blue team)\b/gi],
  ['Penetration Tester', /\b(penetration|pentest\w*|vapt|burp|owasp|metasploit|ceh|oscp|bug bount\w+|red team|kali)\b/gi],
  ['Cloud Security', /\b(cloud security|aws|azure|gcp|iam|devsecops|terraform|kubernetes)\b/gi],
  ['GRC Analyst', /\b(grc|iso ?27001|nist|compliance|risk assessment|audit|gdpr|soc ?2|pci)\b/gi],
  ['Network Engineer', /\b(ccna|ccnp|routing|switching|network engineer|tcp\/ip|firewall|cisco|lan|wan|vlan)\b/gi],
  ['Security Analyst', /\b(cyber ?security|information security|infosec|security analyst|vulnerabilit\w+|nmap|wireshark)\b/gi],
  ['Software Developer', /\b(react|node\.?js|javascript|typescript|java|spring|django|flask|full ?stack|frontend|backend|web developer|rest api)\b/gi],
  ['Data Analyst', /\b(data analy\w+|power ?bi|tableau|excel|pandas|sql|statistics|dashboards?)\b/gi],
  ['ML Engineer', /\b(machine learning|deep learning|tensorflow|pytorch|nlp|computer vision|scikit-learn|llm)\b/gi],
];
const ROLE_SUGGESTIONS_ALL = ['SOC Analyst', 'Security Analyst', 'Penetration Tester', 'Cloud Security', 'Security Engineer', 'GRC Analyst', 'Network Engineer', 'Software Developer', 'Data Analyst', 'ML Engineer'];
const SKILL_WORDS = ['Python', 'Java', 'JavaScript', 'TypeScript', 'C++', 'C', 'Go', 'Bash', 'PowerShell', 'SQL', 'Linux', 'Windows Server', 'AWS', 'Azure', 'GCP',
  'Docker', 'Kubernetes', 'Terraform', 'Git', 'React', 'Node.js', 'Django', 'Flask', 'Spring', 'HTML', 'CSS', 'MongoDB', 'MySQL', 'PostgreSQL', 'Nmap', 'Wireshark',
  'Burp Suite', 'Metasploit', 'Splunk', 'Wazuh', 'QRadar', 'Sentinel', 'SIEM', 'IDS/IPS', 'Firewall', 'TCP/IP', 'OWASP', 'VAPT', 'IAM', 'ISO 27001', 'NIST',
  'Incident Response', 'Threat Hunting', 'Vulnerability Assessment', 'Power BI', 'Tableau', 'Excel', 'Pandas', 'TensorFlow', 'PyTorch', 'Machine Learning', 'CCNA'];

/** "N I K H I L" → "NIKHIL" (CVs with letter-spaced headings), and tidy whitespace. */
export function tidyCvText(t) {
  return String(t || '').replace(/\r/g, '')
    .replace(/\b(?:[A-Za-z] ){2,}[A-Za-z]\b/g, m => m.replace(/ /g, ''))
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n');
}

const NOT_A_NAME = /\b(resume|résumé|curriculum|vitae|cv|profile|summary|objective|contact|address|email|e-mail|phone|mobile|tel|education|skills|experience|projects?|internships?|certifications?|achievements|declaration|b\.?\s?tech|b\.?e|m\.?tech|mca|bca|bsc|msc|engineer|developer|analyst|student|intern|graduate|fresher|university|college|institute|school|india|linkedin|github|portfolio)\b/i;
const caseName = (s) => (s === s.toUpperCase() || s === s.toLowerCase() ? s.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, c => c.toUpperCase()) : s);

const HEADINGS = ['career objective', 'objective', 'summary', 'professional summary', 'profile', 'about me', 'education', 'academic', 'skills', 'technical skills',
  'experience', 'work experience', 'projects', 'certifications', 'internships', 'internship', 'achievements', 'contact', 'personal details', 'declaration', 'languages', 'hobbies'];
const isHeading = (line) => {
  const sq = line.toLowerCase().replace(/[^a-z]/g, '');
  return HEADINGS.some(hd => sq === hd.replace(/ /g, '') || (sq.startsWith(hd.replace(/ /g, '')) && line.length < 40 && line === line.toUpperCase()));
};

/** "karthikreddyanumula" + ["karthik", "anumula"] → "Karthik Reddy Anumula" (the leftovers become words too). */
/**
 * A name written letter by letter ("S A I N I K H I L M Y N E N I", as some CV templates do) put back into words.
 * hints are your Google account name and email: their words show where one name ends and the next begins
 * ("Nikhil" → "Sai Nikhil Myneni"). Names that aren't letter-spaced come back as they are.
 */
export function tidyName(name, hints = []) {
  const n = String(name || '').trim();
  if (!/^(?:\p{L}\s){3,}\p{L}$/u.test(n)) return n;
  const squashed = n.replace(/\s+/g, '');
  const nameWords = hints.filter(h => h && !String(h).includes('@')).flatMap(h => String(h).toLowerCase().split(/[^\p{L}]+/u)).filter(w => w.length >= 3);
  const emailWords = hints.filter(h => String(h).includes('@')).flatMap(h => String(h).split('@')[0].toLowerCase().split(/[^a-z]+/)).filter(w => w.length >= 3);
  const split = splitByTokens(squashed, [...new Set(nameWords)].sort((a, b) => b.length - a.length).concat(emailWords), true);
  if (split) return split;
  return squashed.charAt(0).toUpperCase() + squashed.slice(1).toLowerCase();
}

function splitByTokens(squashed, tokens, keepOrder = false) {
  const s = squashed.toLowerCase();
  const hits = [];
  const list = tokens.filter(t => t.length >= 3);
  // keepOrder: try the tokens as given (your name's words before email chunks like "nikhilmyneni"), else longest first.
  (keepOrder ? list : list.sort((a, b) => b.length - a.length)).forEach(t => {
    const i = s.indexOf(t);
    if (i >= 0 && !hits.some(h => i < h[1] && i + t.length > h[0])) hits.push([i, i + t.length]);
  });
  if (!hits.length) return '';
  hits.sort((a, b) => a[0] - b[0]);
  const parts = [];
  let at = 0;
  hits.forEach(([a, b]) => { if (a > at) parts.push(s.slice(at, a)); parts.push(s.slice(a, b)); at = b; });
  if (at < s.length) parts.push(s.slice(at));
  if (parts.length < 2 || parts.length > 4 || parts.some(p => p.length < 2)) return '';
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

/** The person's name from the top of the CV, above the first section heading. */
function nameFromHeader(lines, hint, clues) {
  const top = [];
  for (const l of lines.slice(0, 12)) { if (isHeading(l)) break; top.push(l); }
  const words = (s) => s.split(/\s+/).filter(Boolean);
  const head = top.join(' ').toLowerCase().replace(/\s+/g, ' ');
  const squashedHead = head.replace(/[^a-z]/g, '');
  if (hint) {
    const hw = words(String(hint).toLowerCase()).filter(w => w.length > 1);
    if (hw.length >= 2 && hw.every(w => head.includes(w) || squashedHead.includes(w.replace(/[^a-z]/g, '')))) return String(hint).trim();
  }
  for (const line of top) {
    for (const seg of line.split(/\s*[|•·,;:]\s*|\s{3,}|\t/)) {
      const s = seg.trim().replace(/^(name\s*[-:]?\s*)/i, '');
      const w = words(s);
      if (w.length === 1 && /^\p{L}{6,40}$/u.test(s) && !NOT_A_NAME.test(s)) {
        const split = splitByTokens(s, clues); // letters that ran together: use the email / LinkedIn to find the breaks
        if (split) return split;
        continue;
      }
      if (w.length < 2 || w.length > 4 || s.length > 40) continue;
      if (!w.every(x => /^\p{L}[\p{L}.'-]*$/u.test(x)) || NOT_A_NAME.test(s)) continue;
      return caseName(s);
    }
  }
  return '';
}

/**
 * What the CV says about you, read with rules (no AI): name, contact, city, suggested roles, level, skills.
 * found tells which parts really came from the CV. hint: the Google account name, used when the CV contains it.
 */
export function profileFromCv(text, now = new Date(), { hint } = {}) {
  const t = tidyCvText(text);
  const lines = t.split('\n').map(l => l.trim()).filter(Boolean);
  const all = t.toLowerCase();
  const email = (t.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/) || [''])[0];
  const phone = ((t.match(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/) || [''])[0]).replace(/\s+/g, ' ').trim();
  const linkedin = (t.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+/i) || [''])[0];
  const github = (t.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_-]+/i) || [''])[0];
  const clues = [email.split('@')[0], linkedin.split('/in/')[1] || '', github.split('.com/')[1] || '', hint || '']
    .join(' ').toLowerCase().split(/[^a-z]+/).filter(x => x.length >= 3);
  const name = tidyName(nameFromHeader(lines, hint, clues), [hint, ...clues]); // letter-spaced headers put back into words

  // City: the contact lines at the top first, then anywhere.
  const findCity = (s) => {
    let best = null;
    PLACES.slice(2).concat(Object.keys(CITY_ALIAS_IN_CV)).forEach(p => {
      const i = s.search(new RegExp('\\b' + p.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b'));
      if (i >= 0 && (!best || i < best.i)) best = { i, p: CITY_ALIAS_IN_CV[p] || p };
    });
    return best ? best.p : '';
  };
  const city = findCity(lines.slice(0, 8).join('\n').toLowerCase()) || findCity(all);

  // Roles: a role named outright (objective, headline) counts most; otherwise it needs at least two signals.
  const said = ROLE_SUGGESTIONS_ALL.filter(r => new RegExp('\\b' + r.toLowerCase().replace(/\s+/g, '\\s+') + 's?\\b').test(all));
  const scores = ROLE_SIGNALS.map(([role, re]) => [role, new Set((t.match(re) || []).map(m => m.toLowerCase())).size + (said.includes(role) ? 5 : 0)])
    .filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
  const roles = scores.slice(0, 3).map(([r]) => r);

  const years = [...t.matchAll(/\b(20\d{2})\b/g)].map(m => Number(m[1])).filter(y => y <= now.getFullYear() + 6);
  const studying = /\b(pursuing|expected|currently studying|final[- ]year|pre-final|third[- ]year|(?:2nd|3rd|4th) year)\b/i.test(t) || (years.length && Math.max(...years) > now.getFullYear());
  const skills = SKILL_WORDS.filter(w => new RegExp('(^|[^a-z0-9+#])' + w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9+#])').test(all));
  return { name, email, phone, linkedin, github, city, roles, level: studying ? 'both' : 'fresher', skills, found: { name: !!name, city: !!city, roles: roles.length > 0 } };
}

/** Fills the setup answers from the CV, but only where you haven't answered yet. */
export function applyCvProfile(d, p) {
  const def = defaultSettings();
  if (!d.name && p.name) d.name = p.name;
  if (!d.city && p.city) d.city = p.city;
  if (!d.prefs.roles.length && p.roles.length) d.prefs.roles = p.roles.slice();
  if (p.level && d.prefs.level === def.prefs.level) d.prefs.level = p.level;
  if (p.city && JSON.stringify(d.prefs.locations) === JSON.stringify(def.prefs.locations)) d.prefs.locations = [p.city, 'Remote', 'Anywhere in India'].filter((x, i, a) => a.indexOf(x) === i);
  return d;
}

// ---------- Matching: weighted keyword overlap (no AI) ----------
/** Skills and tools job posts ask for. Canonical name first; aliases map other spellings onto it. */
export const SKILL_VOCAB = [
  // security
  'SIEM', 'SOC', 'Splunk', 'QRadar', 'Microsoft Sentinel', 'Wazuh', 'ELK', 'EDR', 'XDR', 'CrowdStrike', 'IDS/IPS', 'Firewall', 'WAF', 'VPN', 'Zero Trust',
  'Incident Response', 'Threat Hunting', 'Threat Intelligence', 'Malware Analysis', 'Digital Forensics', 'Log Analysis', 'Vulnerability Assessment',
  'Penetration Testing', 'Burp Suite', 'Metasploit', 'Nmap', 'Wireshark', 'Nessus', 'OpenVAS', 'Kali Linux', 'OWASP', 'Web Application Security',
  'API Security', 'Network Security', 'Cloud Security', 'Application Security', 'Endpoint Security', 'IAM', 'Active Directory', 'PKI', 'Cryptography',
  'MITRE ATT&CK', 'ISO 27001', 'NIST', 'SOC 2', 'PCI DSS', 'GDPR', 'Risk Assessment', 'GRC', 'Compliance', 'Security Audit', 'DevSecOps', 'CEH', 'OSCP',
  'CompTIA Security+', 'CISSP', 'Bug Bounty', 'Phishing', 'DLP',
  // networking and systems
  'TCP/IP', 'DNS', 'DHCP', 'Routing', 'Switching', 'VLAN', 'CCNA', 'Linux', 'Windows Server', 'Unix', 'Shell Scripting', 'Virtualization', 'VMware',
  // cloud and devops
  'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'Ansible', 'Jenkins', 'CI/CD', 'Git', 'GitHub Actions', 'Prometheus', 'Grafana',
  // languages
  'Python', 'Java', 'JavaScript', 'TypeScript', 'C', 'C++', 'C#', 'Go', 'Rust', 'Ruby', 'PHP', 'Kotlin', 'Swift', 'Bash', 'PowerShell', 'SQL', 'R', 'Scala',
  // web and data
  'HTML', 'CSS', 'React', 'Angular', 'Vue', 'Next.js', 'Node.js', 'Express', 'Django', 'Flask', 'FastAPI', 'Spring Boot', '.NET', 'REST APIs', 'GraphQL',
  'Microservices', 'MongoDB', 'MySQL', 'PostgreSQL', 'Redis', 'Kafka', 'Spark', 'Hadoop', 'Airflow', 'ETL', 'Data Analysis', 'Data Visualization',
  'Power BI', 'Tableau', 'Excel', 'Pandas', 'NumPy', 'Statistics', 'Machine Learning', 'Deep Learning', 'NLP', 'Computer Vision', 'TensorFlow',
  'PyTorch', 'scikit-learn', 'LLMs', 'Android', 'iOS', 'Flutter', 'React Native', 'Selenium', 'Manual Testing', 'Automation Testing', 'JIRA', 'Agile',
  // ways of working
  'Communication', 'Teamwork', 'Problem Solving', 'Documentation',
];
const SKILL_ALIASES = {
  'SIEM': ['security information and event management'], 'SOC': ['security operations center', 'security operations centre'],
  'Microsoft Sentinel': ['azure sentinel', 'sentinel'], 'ELK': ['elastic stack', 'elasticsearch', 'kibana'], 'IDS/IPS': ['intrusion detection', 'intrusion prevention'],
  'Penetration Testing': ['pentest', 'pentesting', 'pen testing', 'penetration tester', 'vapt'], 'Vulnerability Assessment': ['vulnerability scanning', 'vulnerability management'],
  'Kali Linux': ['kali'], 'Web Application Security': ['web app security', 'web security'], 'IAM': ['identity and access management'],
  'Active Directory': [], 'MITRE ATT&CK': ['mitre att&ck', 'mitre attack', 'att&ck'], 'ISO 27001': ['iso/iec 27001', 'iso27001'],
  'SOC 2': ['soc2'], 'PCI DSS': ['pci-dss'], 'CEH': ['certified ethical hacker'], 'CompTIA Security+': ['security+', 'security plus'],
  'Digital Forensics': ['forensics', 'dfir'], 'Threat Intelligence': ['cyber threat intelligence'], 'TCP/IP': ['networking fundamentals'],
  'Windows Server': ['windows server administration'], 'Shell Scripting': ['shell script', 'bash scripting'], 'GCP': ['google cloud'], 'AWS': ['amazon web services'],
  'Azure': ['microsoft azure'], 'Kubernetes': ['k8s'], 'CI/CD': ['ci cd', 'continuous integration'], 'JavaScript': ['es6'],
  'TypeScript': [], 'Go': ['golang'], 'Node.js': ['nodejs', 'node js'], 'Next.js': ['nextjs'], 'Spring Boot': ['springboot'], '.NET': ['dotnet', 'asp.net'],
  'REST APIs': ['rest api', 'restful'], 'PostgreSQL': ['postgres'], 'Machine Learning': [], 'Deep Learning': [],
  'NLP': ['natural language processing'], 'scikit-learn': ['sklearn'], 'LLMs': ['llm', 'large language models', 'generative ai', 'genai'],
  'Data Analysis': ['data analytics', 'data analyst'], 'Data Visualization': ['dashboards', 'dashboarding'], 'Excel': ['ms excel', 'advanced excel'],
  'Automation Testing': ['test automation'], 'Problem Solving': ['problem-solving', 'analytical skills'], 'Communication': ['communication skills'],
  'Teamwork': ['team player', 'collaboration'],
};
const SKILL_KEYS = new Map();
SKILL_VOCAB.forEach(s => { SKILL_KEYS.set(s.toLowerCase(), s); (SKILL_ALIASES[s] || []).forEach(a => SKILL_KEYS.set(a.toLowerCase(), s)); });
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const termRe = (t) => new RegExp('(^|[^a-z0-9+#])' + esc(t.toLowerCase()) + '(?=$|[^a-z0-9+#])');
// Short or ambiguous names only count written exactly that way ("SOC", "Go", "R", "C"), never as an ordinary word.
const EXACT = new Set(['C', 'R', 'Go', 'Rust', 'Swift', 'SOC', 'Excel', 'Spark', 'Express', 'Agile', 'Vue', 'Communication', 'Teamwork', 'Documentation']);

/** The canonical skills found in a text, plus any extra phrases (your own keywords) that appear in it. */
export function termsIn(text, extra = []) {
  const raw = String(text || '');
  const t = raw.toLowerCase();
  const found = new Set();
  for (const [k, canon] of SKILL_KEYS) {
    if (EXACT.has(canon) && k === canon.toLowerCase()) {
      if (new RegExp('(^|[^A-Za-z0-9+#])' + esc(canon) + '(?=$|[^A-Za-z0-9+#])').test(raw)) found.add(canon);
    } else if (termRe(k).test(t)) found.add(canon);
  }
  extra.forEach(x => { const s = String(x || '').trim(); if (s && termRe(s).test(t)) found.add(SKILL_KEYS.get(s.toLowerCase()) || s); });
  // "Web Application Security" already says "Application Security": keep the longer one.
  [...found].forEach(f => { if ([...found].some(g => g !== f && g.toLowerCase().includes(f.toLowerCase()) && g.length > f.length + 2)) found.delete(f); });
  return found;
}

/** Your skills: the ones found in your CV, plus the ones you added, minus the ones you removed. */
export function mySkills(data) {
  const removed = new Set((data.skillsRemoved || []).map(s => s.toLowerCase()));
  const out = new Map();
  [...termsIn(data.cv), ...(data.skillsAdded || [])].forEach(s => { const k = String(s).toLowerCase(); if (!removed.has(k) && !out.has(k)) out.set(k, s); });
  return [...out.values()];
}

/**
 * How well a job fits, as a weighted keyword overlap. Skills asked for in the title count double; your own
 * keywords count 1.5×. Returns {score 0–100, matched[], missing[]}: matched are asked for and on your CV (or in
 * your keywords), missing are asked for and not. A job that names no skills gets a middling score from its title.
 */
const SCORED_ASKS = 10;
export function matchScore(job, skills, keywords = [], roles = [], range = 'related') {
  const have = new Set([...skills, ...keywords].map(s => String(s).toLowerCase()));
  const kw = new Set(keywords.map(s => String(s).toLowerCase()));
  const extra = [...skills, ...keywords];
  const inTitle = termsIn(job.role, extra), inBody = termsIn([job.details, job.jd].filter(Boolean).join('\n'), extra);
  const asked = [...new Set([...inTitle, ...inBody])];
  const w = (t) => (inTitle.has(t) ? 2 : 1) * (kw.has(t.toLowerCase()) ? 1.5 : 1);
  const titleFit = roles.length ? (roleFits(job.role, roles, range) ? 1 : 0) : 0.5;
  // Nothing to compare (many boards list only a title): a middling score from the title; titleOnly lets a fitting title through.
  if (!asked.length) return { score: Math.round(30 + 25 * titleFit), matched: [], missing: [], titleOnly: titleFit === 1 };
  const matched = asked.filter(t => have.has(t.toLowerCase())).sort((a, b) => w(b) - w(a));
  const missing = asked.filter(t => !have.has(t.toLowerCase())).sort((a, b) => w(b) - w(a));
  // Only the asks that come first count toward the score (the title's, then the description's first SCORED_ASKS):
  // postings put requirements before their long list of nice-to-haves, which shouldn't sink a fresher's score.
  const body = [job.details, job.jd].filter(Boolean).join('\n').toLowerCase();
  const at = (t) => { const m = body.match(termRe(t)); return m ? m.index : Infinity; };
  const counted = asked.slice().sort((a, b) => Number(inTitle.has(b)) - Number(inTitle.has(a)) || at(a) - at(b)).slice(0, SCORED_ASKS);
  const total = counted.reduce((n, t) => n + w(t), 0), got = counted.filter(t => have.has(t.toLowerCase())).reduce((n, t) => n + w(t), 0);
  // A handful of asks is noisy, so the title's fit with your target roles carries a fifth of the score.
  const score = Math.round(80 * got / total + 20 * titleFit);
  return { score: Math.max(0, Math.min(100, score)), matched, missing };
}

/** The job matches screen's filters. view: {location, experience, internships, hideApplied, minMatch}. */
export function filterJobs(jobs, view, apps = []) {
  const applied = new Set(apps.map(a => a.key));
  const loc = String(view.location || '').toLowerCase();
  const aliases = loc ? (CITY_ALIASES[loc] || [loc]) : [];
  return jobs.filter(j => {
    if ((j.score ?? j.fit * 20) < (view.minMatch || 0) && !j.title_only) return false; // title-only jobs: see pickByScore
    if (view.hideApplied && (j.status === 'Applied' || applied.has(j.key) || applied.has(String(j.company).trim().toLowerCase() + '|'))) return false;
    if (!view.internships && /\b(intern|internship|trainee|apprentice)\b/i.test(j.role)) return false;
    if (view.experience === 'fresher' && SENIOR_RE.test(j.role)) return false;
    if (loc) {
      const l = String(j.location || '').toLowerCase();
      if (loc === 'remote' ? !/remote|work from home|wfh|anywhere/.test(l) : !aliases.some(a => l.includes(a))) return false;
    }
    return true;
  });
}

/** Best new openings by score: at least minMatch, at most n, as job rows. */
export function pickByScore(candidates, data, n, today) {
  const s = data.settings, skills = mySkills(data), roles = s.prefs.roles;
  const scored = candidates.map(c => Object.assign({ c, kind: roleKind(c.role, roles) }, matchScore(c, skills, s.keywords, roles, s.prefs.roleRange)))
    .filter(x => x.score >= s.minMatch || x.titleOnly) // a title that fits your roles, with no description to score, still counts
    .filter(x => x.kind !== 'Stretch' || (x.matched.length >= 2 && x.missing.length <= 1)) // Stretch: only one skill to learn
    .sort((a, b) => b.score - a.score);
  // At least half the picks are Core whenever there are good Core jobs; the rest go by score.
  const take = scored.filter(x => x.kind === 'Core').slice(0, Math.ceil(n / 2));
  scored.forEach(x => { if (take.length < n && !take.includes(x)) take.push(x); });
  return take.sort((a, b) => b.score - a.score)
    .map(({ c, score, matched, missing, titleOnly }) => ({
      id: newId(), found_on: today, fit: Math.max(1, Math.round(score / 20)), score, matched: matched.slice(0, 12), missing: missing.slice(0, 8),
      company: String(c.company).trim(), role: String(c.role).trim(), location: c.location || '', pay: c.pay || '',
      why: matched.length ? `On your CV: ${matched.slice(0, 4).join(', ')}.` : '', skill_gap: missing[0] || 'None',
      apply_by: '', posted: isYmd(c.posted) ? c.posted : '', link: isHttpUrl(c.link) ? c.link : '',
      details: clip(c.details, 600), status: 'New', title_only: !!titleOnly, key: c.key, source: c.source || 'Job alert email', ref: c.ref || null,
    }));
}

/**
 * A job from a description you pasted (to tailor your resume for it). The role falls back to the description's
 * first short line. Scores are added by the caller. Returns null when there's no description.
 */
export function pastedJob({ role = '', company = '', jd = '', link = '' }, today) {
  const text = String(jd || '').replace(/\r/g, '').trim();
  if (text.length < 40) return null;
  const firstLine = text.split('\n').map(l => l.trim()).find(l => l && l.length <= 80) || '';
  const r = String(role || '').trim().slice(0, 120) || firstLine.replace(/^(job title|role|position)\s*[:\-]\s*/i, '').slice(0, 120) || 'Pasted job';
  const c = String(company || '').trim().slice(0, 80);
  return {
    id: newId(), found_on: today, posted: '', company: c, role: r, location: '', pay: '', why: '', apply_by: '',
    link: isHttpUrl(link) ? link : '', details: clip(text, 600), jd: clip(text, 8000), status: 'Saved',
    key: `${c}|${r}`.toLowerCase(), source: 'Pasted', ref: null,
  };
}

// ---------- Checking a posting (its full description) ----------
const EXP_RE = /(\d{1,2})\s*(?:\+|plus)?\s*(?:(?:-|–|to)\s*\d{1,2}\s*)?\+?\s*years?['’]?\s*(?:of\s+)?(?:relevant\s+|professional\s+|work\s+|industry\s+|hands-on\s+|prior\s+)?(?:experience|exp\b)/gi;
/** The fewest years of experience a description asks for (the most lenient mention), or null when it doesn't say. */
export function minYears(text) {
  let min = null;
  for (const m of String(text || '').matchAll(EXP_RE)) { const y = Number(m[1]); if (y <= 30 && (min === null || y < min)) min = y; }
  return min;
}
/**
 * Why a posting isn't for a fresher looking for paid work ('' when it's fine), from its full description:
 * experience (2+ years), unpaid (when you want paid work), fee (asks you to pay), bulkInvite ("Dear Candidate" mass mails),
 * location (the board gave no place and the description doesn't put it in India or remote).
 */
export function postingProblem(text, prefs = {}, job = {}) {
  const t = String(text || '');
  // The board didn't say where (or just "3 Locations"): the description has to place it in India, or remote.
  const loc = String(job.location || '').trim();
  if ('location' in job && (!loc || /^\d+ locations?$/i.test(loc)) && t && !INDIA_RE.test(t) && !/\bremote\b/i.test(t)) return 'location';
  if (/\bdear candidates?\b/i.test(t)) return 'bulkInvite';
  if (/\b(?:registration|training|joining|processing|security|onboarding)\s+(?:fees?|charges?|deposit)\b|\bpay\s+(?:a|the|an)\s+(?:\w+\s+)?fee\b|\brefundable\s+deposit\b/i.test(t)) return 'fee';
  if (prefs.paidOnly !== false && /\bunpaid\b|\bno\s+stipend\b|\bwithout\s+(?:any\s+)?stipend\b|\bstipend\s*[:\-]?\s*(?:nil|none|not\s+provided)\b/i.test(t)) return 'unpaid';
  const y = minYears(t);
  if (y !== null && y >= 2) return 'experience';
  return '';
}
export const PROBLEM_TEXT = { location: 'not in India', experience: 'needs 2+ years', unpaid: 'unpaid', fee: 'asks for a fee', bulkInvite: 'a bulk “Dear Candidate” invite' };

/** HTML entities to text, without a browser (job boards send descriptions with their HTML escaped). */
export function decodeEntities(s) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', bull: '•' };
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
    return named[e.toLowerCase()] ?? m;
  });
}

// ---------- The CV in sections ----------
const SECTION_OF = [
  ['summary', /^(career objective|objective|summary|professional summary|profile|about me)$/],
  ['education', /^(education|academic( details| qualifications| background)?|qualifications)$/],
  ['experience', /^((work |professional )?experience|employment( history)?|internships?|work history)$/],
  ['projects', /^((academic |personal |key )?projects?)$/],
  ['skills', /^((technical |key |core )?skills|technical proficiency|tools( and technologies)?|technologies)$/],
  ['certifications', /^(certifications?|certificates|courses|trainings?|licenses( and certifications)?)$/],
  ['leadership', /^(leadership|extra[- ]?curricular( activities)?|positions of responsibility|activities|volunteering|achievements|awards)$/],
];
/** The CV split under its headings: {summary, education, experience, projects, skills, certifications, leadership} as lines. */
export function cvSections(text) {
  const out = { summary: [], education: [], experience: [], projects: [], skills: [], certifications: [], leadership: [] };
  let cur = null;
  tidyCvText(text).split('\n').map(l => l.trim()).filter(Boolean).forEach(l => {
    const key = l.toLowerCase().replace(/[:•|]+$/, '').replace(/\s+/g, ' ').trim();
    const hit = l.length <= 45 && SECTION_OF.find(([, re]) => re.test(key) || re.test(key.replace(/[^a-z ]/g, '')));
    if (hit) { cur = hit[0]; return; }
    if (cur) out[cur].push(l.replace(/^[•\-–*·▪●]\s*/, ''));
  });
  return out;
}

// ---------- Resume tailor ----------
// A resume is ResumeFold's Resume shape (contact, summary, experience[], education[], skills[], projects[],
// certifications[]), so it opens in ResumeFold as is. Tailoring only reorders, rewords or brings forward what the
// CV already says; adding a skill the CV doesn't show is its own suggestion that you have to confirm.

export const TEMPLATES = { standard: 'Standard', student: 'Student', combination: 'Combination', senior: 'Senior' };
const YEAR_RE = /\b(19|20)\d{2}\b/;
const isEntryHead = (l) => l.length <= 140 && (YEAR_RE.test(l) || /\s[|–—]\s|\s-\s|:\s*$/.test(l) || /\b(present|current)\b/i.test(l));
const splitHead = (l) => {
  const parts = l.split(/\s*(?:[|–—]|\s-\s|,|:)\s*/).map(x => x.trim()).filter(Boolean);
  const dates = parts.filter(p => YEAR_RE.test(p) || /present|current/i.test(p));
  const words = parts.filter(p => !dates.includes(p));
  return { a: words[0] || l, b: words.slice(1).join(', '), dates: dates.join(' – ') };
};
const datesOf = (s) => {
  const ys = String(s || '').split(/\s*(?:–|—|-|to)\s*/i);
  const current = /present|current|now/i.test(s);
  return { start: toYearMonth(ys[0]), end: current ? '' : toYearMonth(ys[1] || ''), current };
};
/** Lines under a heading → entries: a line that looks like a title (dates, "|", " – ") starts one; the rest are its bullets. */
function entries(lines) {
  const out = [];
  lines.forEach(l => {
    if (!out.length || isEntryHead(l)) out.push({ head: l, bullets: [] });
    else out[out.length - 1].bullets.push(l);
  });
  return out;
}

/** The CV as a structured resume, by rules (no AI). Used when the AI hasn't read the CV yet, or isn't available. */
export function resumeFromCv(cv, opts = {}) {
  const sec = cvSections(cv), p = profileFromCv(cv, new Date(), { hint: opts.hint });
  const skills = opts.skills || [...termsIn(cv)];
  const r = {
    contact: { fullName: p.name, headline: '', email: p.email, phone: p.phone, location: p.city, website: '', linkedin: p.linkedin, github: p.github },
    summary: sec.summary.join(' ').slice(0, 1200),
    experience: entries(sec.experience).map((e, i) => { const h = splitHead(e.head), d = datesOf(h.dates);
      return { id: 'exp' + (i + 1), title: h.a, company: h.b, location: '', start: d.start, end: d.end, current: d.current, bullets: e.bullets }; }),
    education: entries(sec.education).map((e, i) => { const h = splitHead(e.head), d = datesOf(h.dates);
      return { id: 'edu' + (i + 1), school: h.b || h.a, degree: h.b ? h.a : '', field: '', location: '', start: d.start, end: d.end, gpa: '', details: e.bullets }; }),
    skills: skills.length ? [{ id: 'skill1', category: 'Skills', items: skills.slice(0, 40) }] : [],
    projects: entries(sec.projects).map((e, i) => { const h = splitHead(e.head), d = datesOf(h.dates);
      return { id: 'proj' + (i + 1), name: h.a, link: '', tech: h.b, start: d.start, end: d.end, bullets: e.bullets }; }),
    certifications: sec.certifications.map((l, i) => ({ id: 'cert' + (i + 1), name: l.slice(0, 200), issuer: '', date: toYearMonth((l.match(YEAR_RE) || [''])[0]), link: '' })),
  };
  return cleanResumeFold(r) || r;
}

/** Everything a resume says, as plain text (for scoring and checks). */
export function resumeText(r) {
  const x = [r.contact && r.contact.headline, r.summary];
  (r.experience || []).forEach(e => x.push(e.title, e.company, ...(e.bullets || [])));
  (r.projects || []).forEach(p => x.push(p.name, p.tech, ...(p.bullets || [])));
  (r.education || []).forEach(e => x.push(e.degree, e.field, e.school, ...(e.details || [])));
  (r.skills || []).forEach(s => x.push(s.category, (s.items || []).join(', ')));
  (r.certifications || []).forEach(c => x.push(c.name, c.issuer));
  return x.filter(Boolean).join('\n');
}

/** How well a resume covers what the job asks for (the same matchScore as Job matches). */
export function tailorScore(r, job, keywords = []) {
  return matchScore({ role: job.role, details: job.jd || job.details }, [...termsIn(resumeText(r), keywords)], keywords, []);
}

/**
 * An estimate of how an applicant tracking system would rate this resume for this job: three quarters from the job's
 * keywords found in the resume (tailorScore), one quarter from what ATS software looks for in the format.
 * Returns {score, keywords: {found, total, missing[]}, checks: [{ok, text}]}; show it in words (matchLabel).
 */
export function atsScore(r, job, keywords = []) {
  const kw = tailorScore(r, job, keywords);
  const text = resumeText(r), c = r.contact || {};
  const entries = [...(r.experience || []), ...(r.projects || []), ...(r.education || [])];
  const bulletCount = [...(r.experience || []), ...(r.projects || [])].reduce((n, e) => n + (e.bullets || []).filter(Boolean).length, 0);
  const checks = [
    { ok: !!(c.email && c.phone), text: 'Email and phone at the top' },
    { ok: (r.education || []).length > 0 && (r.skills || []).length > 0, text: 'Standard sections: Education and Skills' },
    { ok: !!job.role && roleFits(text, [job.role], 'core'), text: 'The job title appears in your resume' },
    { ok: entries.length > 0 && entries.every(e => e.start || e.end || e.current), text: 'A date on every entry' },
    { ok: bulletCount >= 3, text: 'Bullet points that show what you did' },
    { ok: String(r.summary || '').length >= 60, text: 'A short summary at the top' },
  ];
  const format = 100 * checks.filter(x => x.ok).length / checks.length;
  const found = kw.matched.length, total = kw.matched.length + kw.missing.length;
  return { score: Math.round(0.75 * kw.score + 0.25 * format), keywords: { found, total, missing: kw.missing.slice(0, 8) }, checks };
}

/** The job description in pieces, each marked 'have' (on your CV), 'miss' (asked for, not on it) or '' (plain text). */
export function highlightJd(text, have, keywords = []) {
  const t = String(text || '');
  const haveSet = new Set([...have].map(x => x.toLowerCase()));
  const keys = [];
  for (const [k, canon] of SKILL_KEYS) keys.push([k, canon]);
  keywords.forEach(k => keys.push([String(k).toLowerCase(), k]));
  const lower = t.toLowerCase(), hits = [];
  keys.forEach(([k, canon]) => {
    if (!k || (EXACT.has(canon) && k === canon.toLowerCase())) {
      const re = new RegExp('(^|[^A-Za-z0-9+#])(' + esc(canon) + ')(?=$|[^A-Za-z0-9+#])', 'g');
      for (let m; (m = re.exec(t));) hits.push([m.index + m[1].length, m[2].length, canon]);
      return;
    }
    const re = new RegExp('(^|[^a-z0-9+#])(' + esc(k) + ')(?=$|[^a-z0-9+#])', 'g');
    for (let m; (m = re.exec(lower));) hits.push([m.index + m[1].length, m[2].length, canon]);
  });
  hits.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const out = [];
  let at = 0;
  hits.forEach(([i, n, canon]) => {
    if (i < at) return; // overlaps a longer, earlier match
    if (i > at) out.push({ text: t.slice(at, i), kind: '' });
    out.push({ text: t.slice(i, i + n), kind: haveSet.has(canon.toLowerCase()) ? 'have' : 'miss', term: canon });
    at = i + n;
  });
  if (at < t.length) out.push({ text: t.slice(at), kind: '' });
  return out;
}

const hitsIn = (text, asked) => asked.filter(a => termsIn(text, [a]).has(a)).length;

/**
 * Suggested edits for this job, best first. Each: {id, kind, title, text, patch, warn?}. Kinds: 'Reorder' and 'Reword'
 * change only order or wording of what's there; 'Surface' adds to your skills something your CV already shows;
 * 'Add skill' adds something it doesn't (only if you can talk about it), so it carries a warning.
 */
export function tailorSuggestions(base, job, cv, keywords = []) {
  const jd = [job.role, job.jd || job.details].join('\n');
  const asked = [...termsIn(jd, keywords)];
  const inResume = termsIn(resumeText(base), keywords), inCv = termsIn(cv, keywords);
  const skillItems = (base.skills || []).flatMap(s => s.items || []);
  const has = (t) => skillItems.some(i => i.toLowerCase() === t.toLowerCase());
  const out = [];
  // Lead the skills with what's asked for.
  const askedInSkills = skillItems.filter(i => asked.some(a => a.toLowerCase() === i.toLowerCase()));
  if (askedInSkills.length && askedInSkills.some((t, i) => skillItems.indexOf(t) !== i)) {
    out.push({ id: 'skills-order', kind: 'Reorder', title: 'Lead with the skills this job asks for', text: `Put ${askedInSkills.slice(0, 4).join(', ')} first in your skills.`, patch: { op: 'skillsFirst', terms: askedInSkills } });
  }
  // Skills the CV shows (in a project, a course…) but the skills list doesn't name.
  asked.filter(t => inCv.has(t) && !has(t)).slice(0, 5).forEach(t => out.push({ id: 'surface:' + t, kind: 'Surface', title: `Add ${t} to your skills`, text: `Your CV already shows ${t}; listing it makes it easy to spot.`, patch: { op: 'addSkill', term: t } }));
  // The project that fits best goes first.
  const projects = base.projects || [];
  if (projects.length > 1) {
    const scored = projects.map((p, i) => ({ i, n: hitsIn([p.name, p.tech, ...(p.bullets || [])].join(' '), asked) }));
    const best = scored.slice().sort((a, b) => b.n - a.n || a.i - b.i)[0];
    if (best.n > 0 && best.i !== 0) out.push({ id: 'project-first', kind: 'Reorder', title: `Move "${projects[best.i].name}" to the top`, text: `It shows ${best.n} thing${best.n === 1 ? '' : 's'} this job asks for.`, patch: { op: 'projectFirst', index: best.i } });
  }
  // Within each role and project, bullets that mention the job's skills go first.
  const bulletsToMove = [...(base.experience || []), ...projects].some(e => { const b = e.bullets || []; const first = b.findIndex(x => hitsIn(x, asked)); return first > 0; });
  if (bulletsToMove) out.push({ id: 'bullets-order', kind: 'Reorder', title: 'Lead each entry with its most relevant point', text: 'Bullets that mention what this job asks for move to the top of their entry.', patch: { op: 'bulletsFirst', terms: asked } });
  // The headline names the role you're applying for, with true focus areas from your skills.
  const focus = asked.filter(t => inResume.has(t)).slice(0, 3);
  const headline = [job.role, focus.join(', ')].filter(Boolean).join(' · ').slice(0, 120);
  if (job.role && headline !== (base.contact && base.contact.headline)) out.push({ id: 'headline', kind: 'Reword', title: 'Headline for this role', text: `“${headline}”`, patch: { op: 'headline', value: headline } });
  // Asked for, nowhere in the CV.
  asked.filter(t => !inCv.has(t) && !has(t)).slice(0, 3).forEach(t => out.push({ id: 'add:' + t, kind: 'Add skill', title: `Add ${t}`, text: `The job asks for ${t}, and your CV doesn't mention it.`, warn: 'Only add this if you can talk about it in an interview.', patch: { op: 'addSkill', term: t } }));
  return out;
}

/** Applies accepted suggestions to a copy of base. Returns {resume, changed}: changed marks what to highlight in the preview. */
export function applySuggestions(base, accepted) {
  const r = JSON.parse(JSON.stringify(base));
  const changed = new Set();
  const lower = (x) => String(x).toLowerCase();
  accepted.forEach(s => {
    const p = s.patch || {};
    if (p.op === 'addSkill') {
      if (!r.skills.length) r.skills.push({ id: 'skill1', category: 'Skills', items: [] });
      if (!r.skills.some(g => g.items.some(i => lower(i) === lower(p.term)))) { r.skills[0].items.unshift(p.term); changed.add('skill:' + lower(p.term)); }
    } else if (p.op === 'skillsFirst') {
      const want = new Set(p.terms.map(lower));
      r.skills.forEach(g => { g.items = [...g.items.filter(i => want.has(lower(i))), ...g.items.filter(i => !want.has(lower(i)))]; });
      r.skills.sort((a, b) => b.items.filter(i => want.has(lower(i))).length - a.items.filter(i => want.has(lower(i))).length);
      changed.add('skills');
    } else if (p.op === 'projectFirst' && r.projects[p.index]) {
      r.projects.unshift(r.projects.splice(p.index, 1)[0]);
      changed.add('project:' + r.projects[0].id);
    } else if (p.op === 'bulletsFirst') {
      [...r.experience, ...r.projects].forEach(e => {
        const hit = (x) => hitsIn(x, p.terms) > 0;
        const before = e.bullets.join('\n');
        e.bullets = [...e.bullets.filter(hit), ...e.bullets.filter(x => !hit(x))];
        if (e.bullets.join('\n') !== before) changed.add('bullets:' + e.id);
      });
    } else if (p.op === 'headline') {
      r.contact.headline = p.value; changed.add('headline');
    } else if (p.op === 'summary') {
      r.summary = p.value; changed.add('summary');
    }
  });
  return { resume: r, changed };
}

/** An AI-reworded summary is only offered if it brings in no skill or tool the CV doesn't already show. */
export function honestRewrite(text, cv, keywords = []) {
  const allowed = termsIn(cv, keywords);
  const added = [...termsIn(text, keywords)].filter(t => !allowed.has(t));
  return { ok: !added.length && String(text || '').trim().length > 20, added };
}

export function rewordPrompt(summary, cv, job) {
  return 'Rewrite this resume summary for the job below, in 2–3 short sentences. STRICT: use ONLY facts, skills and tools that appear in the CV. ' +
    'Do not add anything the CV does not say. You may reorder and reword, and use the job\'s wording only for things the CV shows. ' +
    'Return JSON {"summary": ""}.\n\nJob: ' + clip([job.role, job.company, job.jd || job.details].filter(Boolean).join('\n'), 3000) +
    '\n\nCurrent summary: ' + (summary || '(none)') + '\n\nCV:\n' + clip(cv, 8000);
}

// LaTeX: a plain article-class resume (compiles with any TeX install or Overleaf).
const texEsc = (s) => String(s || '').replace(/\\/g, '\\textbackslash{}').replace(/([#$%&_{}])/g, '\\$1').replace(/~/g, '\\textasciitilde{}').replace(/\^/g, '\\textasciicircum{}');
const ym = (s) => { const [y, m] = String(s || '').split('-'); return y ? (m ? `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]} ${y}` : y) : ''; };
export const dateRange = (e) => [ym(e.start), e.current ? 'Present' : ym(e.end || e.date)].filter(Boolean).join(' – ');

export function resumeLatex(r) {
  const c = r.contact || {};
  const L = ['\\documentclass[10pt]{article}', '\\usepackage[a4paper,margin=1.6cm]{geometry}', '\\usepackage[hidelinks]{hyperref}', '\\usepackage{enumitem}',
    '\\setlist[itemize]{leftmargin=1.2em,itemsep=1pt,topsep=2pt}', '\\pagestyle{empty}', '\\setlength{\\parindent}{0pt}',
    '\\renewcommand{\\section}[1]{\\vspace{8pt}{\\large\\bfseries #1}\\\\[-6pt]\\rule{\\linewidth}{0.4pt}\\\\[2pt]}', '\\begin{document}',
    `{\\LARGE\\bfseries ${texEsc(c.fullName)}}\\\\`];
  if (c.headline) L.push(`${texEsc(c.headline)}\\\\`);
  L.push([c.email, c.phone, c.location, c.linkedin, c.github, c.website].filter(Boolean).map(texEsc).join(' \\textbar{} ') + '\\\\');
  const items = (list) => (list && list.length ? ['\\begin{itemize}', ...list.map(b => `\\item ${texEsc(b)}`), '\\end{itemize}'] : []);
  const head = (left, right) => `\\textbf{${texEsc(left)}}${right ? ` \\hfill ${texEsc(right)}` : ''}\\\\`;
  if (r.summary) L.push('\\section{Summary}', texEsc(r.summary));
  if ((r.skills || []).length) L.push('\\section{Skills}', ...r.skills.map(s => `\\textbf{${texEsc(s.category)}:} ${texEsc(s.items.join(', '))}\\\\`));
  if ((r.experience || []).length) { L.push('\\section{Experience}'); r.experience.forEach(e => L.push(head([e.title, e.company].filter(Boolean).join(', '), dateRange(e)), ...items(e.bullets))); }
  if ((r.projects || []).length) { L.push('\\section{Projects}'); r.projects.forEach(p => L.push(head([p.name, p.tech].filter(Boolean).join(' — '), dateRange(p)), ...items(p.bullets))); }
  if ((r.education || []).length) { L.push('\\section{Education}'); r.education.forEach(e => L.push(head([e.degree, e.field, e.school].filter(Boolean).join(', '), dateRange(e)), ...items([e.gpa && `GPA ${e.gpa}`, ...(e.details || [])].filter(Boolean)))); }
  if ((r.certifications || []).length) L.push('\\section{Certifications}', ...items(r.certifications.map(c2 => [c2.name, c2.issuer, ym(c2.date)].filter(Boolean).join(', '))));
  L.push('\\end{document}', '');
  return L.join('\n');
}
