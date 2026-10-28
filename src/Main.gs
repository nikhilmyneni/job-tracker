// ---------- Web app ----------
function doGet() {
  try { PropertiesService.getUserProperties().setProperty('appUrl', ScriptApp.getService().getUrl()); } catch (e) {}
  return HtmlService.createTemplateFromFile('index').evaluate()
    .setTitle('Job Tracker')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

function appUrl_() {
  return PropertiesService.getUserProperties().getProperty('appUrl') || ScriptApp.getService().getUrl() || '';
}

// ---------- Called from the page (google.script.run) ----------
/** Everything the page shows. The Gemini key itself never goes back to the browser. */
function getState() {
  const s = readSettings_();
  const data = loadData_();
  const pub = Object.assign({}, s, { geminiKey: '', hasKey: !!s.geminiKey });
  const last = PropertiesService.getUserProperties().getProperty('lastRunAt');
  return {
    settings: pub,
    applications: data.applications,
    jobs: data.jobs.map(j => { const o = Object.assign({}, j, { has_resume: !!j.resume }); delete o.resume; return o; }),
    log: data.log.slice(0, 15),
    cv: data.cv,
    lastRunAt: last ? new Date(Number(last)).toISOString() : '',
    automationOn: hasTrigger_(),
    email: Session.getEffectiveUser().getEmail(),
  };
}

/** input: settings from the form. An empty key keeps the saved one; clearKey removes it. */
function saveSettings(input) {
  const cur = readSettings_();
  const next = Object.assign({}, cur, input || {});
  next.geminiKey = input && input.clearKey ? '' : (input && String(input.geminiKey || '').trim()) || cur.geminiKey;
  writeSettings_(next);
  const s = readSettings_();
  if (s.enabled) installTrigger_(); else removeTrigger_();
  return getState();
}

function saveCv(text) {
  const data = loadData_();
  data.cv = String(text || '').slice(0, MAX_CV);
  saveData_(data);
  return getState();
}

function runNow() {
  const out = runUpdate_(false);
  return { text: out.text, state: getState() };
}

/** The resume for one job: the saved one, or a fresh one from Gemini when there is none or regenerate is set. */
function getResume(jobId, regenerate) {
  const data = loadData_();
  const job = data.jobs.find(j => j.id === jobId);
  if (!job) throw new Error('That job is no longer in your list.');
  if (job.resume && !regenerate) return { resume: job.resume, company: job.company, role: job.role };
  const s = readSettings_();
  if (!s.geminiKey) throw new Error('Add a free Gemini API key in Settings first.');
  if (!data.cv) throw new Error('Paste your CV in Settings first.');
  job.resume = writeResume_(data, s, job);
  job.resume_at = new Date().toISOString();
  saveData_(data);
  return { resume: job.resume, company: job.company, role: job.role };
}

/** Mark applied also adds it to your applications. */
function setJobStatus(jobId, status) {
  if (JOB_STATUSES.indexOf(status) < 0) throw new Error('Unknown status.');
  const data = loadData_();
  const job = data.jobs.find(j => j.id === jobId);
  if (!job) throw new Error('That job is no longer in your list.');
  job.status = status;
  if (status === 'Applied') {
    upsertApplication_(data.applications, { company: job.company, role: job.role, stage: 'Applied', date: ymd_(new Date()), channel: 'Recommended job', link: job.link },
      { appsNew: 0, appsChanged: [] });
  }
  saveData_(data);
  return getState();
}

/** For applications that never sent an email (Easy Apply, walk-ins, referrals). */
function addApplication(a) {
  a = a || {};
  if (!String(a.company || '').trim()) throw new Error('Company is needed.');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(a.applied_on || '')) ? a.applied_on : ymd_(new Date());
  const data = loadData_();
  upsertApplication_(data.applications, { company: a.company, role: a.role, stage: 'Applied', date, channel: String(a.channel || 'Company site').slice(0, 40) },
    { appsNew: 0, appsChanged: [] });
  saveData_(data);
  return getState();
}

function setApplicationStatus(id, status) {
  if (STATUSES.indexOf(status) < 0) throw new Error('Unknown status.');
  const data = loadData_();
  const app = data.applications.find(a => a.id === id);
  if (!app) throw new Error('That application is no longer in your list.');
  app.status = status;
  if (STAGES.indexOf(status) > STAGES.indexOf(app.furthest)) app.furthest = status;
  app.last_update = ymd_(new Date());
  saveData_(data);
  return getState();
}

function deleteApplication(id) {
  const data = loadData_();
  data.applications = data.applications.filter(a => a.id !== id);
  saveData_(data);
  return getState();
}

function removeAutomation() {
  removeTrigger_();
  const s = readSettings_();
  s.enabled = false;
  writeSettings_(s);
  return getState();
}

// ---------- Trigger ----------
function hasTrigger_() { return ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'hourlyCheck'); }
function installTrigger_() { if (!hasTrigger_()) ScriptApp.newTrigger('hourlyCheck').timeBased().everyHours(1).create(); }
function removeTrigger_() { ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'hourlyCheck') ScriptApp.deleteTrigger(t); }); }

/** Runs every hour as the user; does real work only at the chosen hour on chosen days, once per day. */
function hourlyCheck() {
  const s = readSettings_();
  if (!s.enabled) return;
  const now = new Date();
  const hour = Number(Utilities.formatDate(now, tz_(), 'H'));
  const day = Utilities.formatDate(now, tz_(), 'EEE'); // Mon, Tue, ...
  const today = ymd_(now);
  if (!s.days[day] || hour !== s.hour) return;
  const props = PropertiesService.getUserProperties();
  if (props.getProperty('lastScheduledDay') === today) return;
  props.setProperty('lastScheduledDay', today);
  runUpdate_(true);
}

// ---------- Main update ----------
function runUpdate_(scheduled) {
  const lock = LockService.getUserLock();
  if (!lock.tryLock(5000)) return { text: 'Another update is already running.' };
  const s = readSettings_();
  const data = loadData_();
  const result = { appsNew: 0, appsChanged: [], jobsNew: [], due: [], notes: [] };
  try {
    const props = PropertiesService.getUserProperties();
    const last = props.getProperty('lastRunAt');
    const after = last ? new Date(Number(last) - 2 * 864e5) : sinceDate_(s);
    const afterStr = Utilities.formatDate(after, 'UTC', 'yyyy/MM/dd');
    const seen = new Set(data.seen);

    syncApplications_(data, s, afterStr, seen, result);
    markGhosted_(data.applications, new Date(), result);

    if (s.jobsPerDay > 0) {
      if (!s.geminiKey) result.notes.push('Job matching is off. Add a free Gemini key in Settings to turn it on.');
      else if (!data.cv) result.notes.push('Paste your CV in Settings to get job matches.');
      else findJobs_(data, s, afterStr, seen, result);
    }
    expireJobs_(data.jobs, data.applications, ymd_(new Date()));
    collectDue_(data.applications, result);

    data.seen = Array.from(seen);
    const text = summaryText_(result);
    log_(data, (scheduled ? 'Scheduled update: ' : 'Manual update: ') + text.replace(/\n/g, ' | '));
    saveData_(data);
    props.setProperty('lastRunAt', String(Date.now()));
    if (s.emailSummary && scheduled) sendSummary_(result);
    return { text };
  } catch (e) {
    log_(data, 'Error: ' + (e && e.message ? e.message : e));
    try { saveData_(data); } catch (e2) {}
    throw e;
  } finally {
    lock.releaseLock();
  }
}
