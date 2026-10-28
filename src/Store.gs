/**
 * Job Tracker: free web-app edition. Storage and settings.
 * ------------------------------------------------
 * Runs as the person using the web app, inside their own Google account.
 * Applications, jobs, seen email ids, the log and the CV live in one JSON file
 * in their Drive ("Job Tracker" folder). Settings live in their UserProperties.
 * Nothing goes anywhere else, except Gemini calls when they added a key.
 */

// ---------- Constants ----------
const STAGES = ['Applied', 'Screening', 'Interview', 'Offer'];
const STATUSES = ['Applied', 'Screening', 'Interview', 'Offer', 'Rejected', 'Withdrawn', 'Ghosted'];
const JOB_STATUSES = ['New', 'Applied', 'Skipped', 'Expired'];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const JOBS_PER_DAY = [0, 3, 5, 10, 15];
const MAX_THREADS = 80;          // per Gmail query per run
const MAX_RESUMES_PER_RUN = 10;  // keeps each run well inside the 6-minute limit
const GHOST_DAYS = 21;
const MAX_SEEN = 5000, MAX_LOG = 300, MAX_JOBS = 1000, MAX_CV = 20000;
const FOLDER_NAME = 'Job Tracker';
const DATA_FILE_NAME = 'Job Tracker data.json';

// ---------- Settings (UserProperties) ----------
function defaultSettings_() {
  const days = {};
  DAY_NAMES.forEach(d => { days[d] = true; });
  return {
    enabled: false,
    hour: 20,
    days,
    jobsPerDay: 5,
    emailSummary: true,
    makeResumes: true,
    since: '', // yyyy-mm-dd; empty means 120 days back
    locations: 'Hyderabad, Remote, anywhere in India',
    prefs: 'Fresher roles (0–1 year). Paid internships only. Skip sales/telecalling.',
    geminiKey: '',
    geminiModel: 'gemini-2.5-flash',
  };
}

/** Fills gaps with defaults and drops anything invalid. */
function normalizeSettings_(raw) {
  const d = defaultSettings_();
  const r = raw && typeof raw === 'object' ? raw : {};
  const hour = Number(r.hour);
  const jobs = Number(r.jobsPerDay);
  const days = {};
  DAY_NAMES.forEach(n => { days[n] = r.days && typeof r.days[n] === 'boolean' ? r.days[n] : d.days[n]; });
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : d.hour,
    days,
    jobsPerDay: JOBS_PER_DAY.indexOf(jobs) >= 0 ? jobs : d.jobsPerDay,
    emailSummary: typeof r.emailSummary === 'boolean' ? r.emailSummary : d.emailSummary,
    makeResumes: typeof r.makeResumes === 'boolean' ? r.makeResumes : d.makeResumes,
    since: /^\d{4}-\d{2}-\d{2}$/.test(String(r.since || '')) ? String(r.since) : '',
    locations: typeof r.locations === 'string' ? r.locations.slice(0, 300) : d.locations,
    prefs: typeof r.prefs === 'string' ? r.prefs.slice(0, 500) : d.prefs,
    geminiKey: typeof r.geminiKey === 'string' ? r.geminiKey.trim() : '',
    geminiModel: typeof r.geminiModel === 'string' && r.geminiModel.trim() ? r.geminiModel.trim() : d.geminiModel,
  };
}

function readSettings_(props) {
  props = props || PropertiesService.getUserProperties();
  let raw = {};
  try { raw = JSON.parse(props.getProperty('settings') || '{}'); } catch (e) {}
  return normalizeSettings_(raw);
}

function writeSettings_(s, props) {
  props = props || PropertiesService.getUserProperties();
  props.setProperty('settings', JSON.stringify(normalizeSettings_(s)));
}

/** Where the first Gmail search starts. */
function sinceDate_(s) {
  return s.since ? new Date(s.since + 'T00:00:00') : new Date(Date.now() - 120 * 864e5);
}

// ---------- Data file (Drive JSON) ----------
function emptyData_() {
  return { version: 1, applications: [], jobs: [], seen: [], log: [], cv: '' };
}

function folder_() {
  const props = PropertiesService.getUserProperties();
  const id = props.getProperty('folderId');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const f = DriveApp.createFolder(FOLDER_NAME);
  props.setProperty('folderId', f.getId());
  return f;
}

function dataFile_() {
  const props = PropertiesService.getUserProperties();
  const id = props.getProperty('dataFileId');
  if (id) { try { const f = DriveApp.getFileById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const f = folder_().createFile(DATA_FILE_NAME, JSON.stringify(emptyData_()), 'application/json');
  props.setProperty('dataFileId', f.getId());
  return f;
}

function loadData_() {
  try {
    return Object.assign(emptyData_(), JSON.parse(dataFile_().getBlob().getDataAsString()));
  } catch (e) {
    return emptyData_();
  }
}

function saveData_(data) {
  data.seen = data.seen.slice(-MAX_SEEN);
  data.log = data.log.slice(0, MAX_LOG);
  data.jobs = data.jobs.slice(-MAX_JOBS);
  dataFile_().setContent(JSON.stringify(data));
}

/** Newest first. */
function log_(data, msg) {
  data.log.unshift({ at: new Date().toISOString(), msg: String(msg) });
}

// ---------- Small helpers ----------
function tz_() { return Session.getScriptTimeZone() || 'Asia/Kolkata'; }
function ymd_(date) { return Utilities.formatDate(date, tz_(), 'yyyy-MM-dd'); }
function clip_(t, n) { t = String(t || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n'); return t.length > n ? t.slice(0, n) + '…' : t; }
function newId_() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function isHttpUrl_(u) { return /^https?:\/\//.test(String(u || '')); }
