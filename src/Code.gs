/**
 * Job Tracker — free Google Sheets + Gmail edition
 * ------------------------------------------------
 * Everything runs inside the user's own Google account:
 *  - reads their Gmail (read-only) for application updates and job-alert emails
 *  - keeps Applications / Recommended jobs / Dashboard tabs up to date
 *  - (optional, free Gemini key) picks the best job matches for their CV and
 *    writes a tailored one-page resume PDF for each into their Google Drive
 *  - emails them a short summary on the days and at the time they choose
 *
 * Nothing is sent anywhere except Google's own services (Gmail, Drive, Sheets)
 * and, only if a Gemini key is added, Google's Gemini API.
 * The script never sends, deletes, labels or archives any email except the
 * one summary email it sends to the user themselves.
 */

// ---------- Names ----------
const SH = {
  dash: 'Dashboard',
  jobs: 'Recommended jobs',
  apps: 'Applications',
  settings: 'Settings',
  profile: 'My CV',
  log: 'Log',
  state: '_state',
};
const APP_HEADERS = ['Company', 'Role', 'Channel', 'Applied on', 'Status', 'Furthest stage', 'Last update', 'Next step', 'Email', 'key'];
const JOB_HEADERS = ['Found on', 'Fit (1-5)', 'Company', 'Role', 'Location', 'Pay', 'Why it fits', 'Skill to pick up', 'Apply by', 'Apply', 'Resume', 'Status', 'key'];
const STAGES = ['Applied', 'Screening', 'Interview', 'Offer'];
const STATUSES = ['Applied', 'Screening', 'Interview', 'Offer', 'Rejected', 'Withdrawn', 'Ghosted'];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = ['6 AM', '7 AM', '8 AM', '9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM', '6 PM', '7 PM', '8 PM', '9 PM', '10 PM', '11 PM'];
const MAX_THREADS = 80;          // per Gmail query per run
const MAX_RESUMES_PER_RUN = 10;  // keeps each run well inside the 6-minute limit
const GHOST_DAYS = 21;

// ---------- Menu ----------
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Job Tracker')
    .addItem('1. Set up (first time)', 'setup')
    .addItem('Update now', 'runNow')
    .addItem('Make resume for selected job', 'resumeForSelectedRow')
    .addSeparator()
    .addItem('Pause / resume daily updates', 'togglePause')
    .addItem('Remove automation', 'removeAutomation')
    .addToUi();
}

// ---------- Setup ----------
function setup() {
  const ss = SpreadsheetApp.getActive();
  const ui = SpreadsheetApp.getUi();
  buildSettings_(ss);
  buildProfile_(ss);
  buildSheet_(ss, SH.apps, APP_HEADERS, [180, 220, 120, 95, 100, 110, 95, 260, 70, 10]);
  buildSheet_(ss, SH.jobs, JOB_HEADERS, [95, 70, 170, 220, 140, 130, 280, 220, 90, 70, 110, 90, 10]);
  buildLog_(ss);
  buildState_(ss);
  buildDashboard_(ss);
  setValidations_(ss);
  installTrigger_();
  ss.setActiveSheet(ss.getSheetByName(SH.settings));
  ui.alert('Job Tracker is set up ✓',
    'Next:\n\n' +
    '1. Paste your CV text into the "My CV" tab.\n' +
    '2. Check the Settings tab (days, time, jobs per day).\n' +
    '3. Optional but recommended: paste a free Gemini API key in Settings to turn on job matching and tailored resumes (get one at aistudio.google.com/apikey).\n' +
    '4. Click Job Tracker → Update now to fill the tracker the first time.\n\n' +
    'After that it runs by itself on the days and time you picked.',
    ui.ButtonSet.OK);
}

function buildSettings_(ss) {
  const sh = getOrCreate_(ss, SH.settings);
  if (sh.getRange('A1').getValue() === 'Setting') return; // keep the user's values on re-run
  sh.clear();
  const sinceDate = new Date(Date.now() - 120 * 864e5);
  const rows = [
    ['Setting', 'Your choice', 'Notes'],
    ['Daily updates on', true, 'Untick to pause everything (no Gmail reading, no emails).'],
    ['Update time', '8 PM', 'Your local time (this sheet\'s time zone: File → Settings).'],
    ['Mon', true, 'Tick the days you want updates and the summary email.'],
    ['Tue', true, ''],
    ['Wed', true, ''],
    ['Thu', true, ''],
    ['Fri', true, ''],
    ['Sat', true, ''],
    ['Sun', true, ''],
    ['New jobs per day', '5', '0 turns job matching and resumes off.'],
    ['Email me a summary', true, 'A short email after each update.'],
    ['Make tailored resumes', true, 'One-page PDF per recommended job, saved to Drive → "Job Tracker Resumes". Needs a Gemini key.'],
    ['Search Gmail since', sinceDate, 'Only used for the first update.'],
    ['Preferred locations', 'Hyderabad, Remote, anywhere in India', 'In order of preference.'],
    ['Job preferences', 'Fresher roles (0–1 year). Paid internships only. Skip sales/telecalling.', 'Roles you want, things to skip.'],
    ['Gemini API key', '', 'Free: aistudio.google.com/apikey → Create API key → paste here. Without it the tracker still works (rule-based), but job matching and resumes are off.'],
    ['Gemini model', 'gemini-2.5-flash', 'Leave as is unless it stops working.'],
    ['Last update', '', 'Filled in automatically.'],
  ];
  sh.getRange(1, 1, rows.length, 3).setValues(rows);
  sh.getRange('A1:C1').setFontWeight('bold').setBackground('#f1f3f4');
  sh.getRange('A2:A' + rows.length).setFontWeight('bold');
  sh.setColumnWidth(1, 190); sh.setColumnWidth(2, 300); sh.setColumnWidth(3, 520);
  sh.getRange('C2:C' + rows.length).setFontColor('#5f6368').setWrap(true);
  sh.getRange('B14').setNumberFormat('yyyy-mm-dd');
  sh.setFrozenRows(1);
}

function buildProfile_(ss) {
  const sh = getOrCreate_(ss, SH.profile);
  if (sh.getRange('A1').getValue()) return;
  sh.getRange('A1').setValue('Paste your full CV text in the box below (copy everything from your CV PDF or Word file). Include your name, email, phone, LinkedIn, education, projects, skills and certifications.')
    .setFontWeight('bold').setWrap(true);
  sh.getRange('A2').setValue('').setWrap(true).setVerticalAlignment('top').setBackground('#fffde7');
  sh.setColumnWidth(1, 900);
  sh.setRowHeight(1, 40);
  sh.setRowHeight(2, 700);
}

function buildSheet_(ss, name, headers, widths) {
  const sh = getOrCreate_(ss, name);
  if (sh.getRange(1, 1).getValue() === headers[0]) return;
  sh.clear();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#f1f3f4');
  sh.setFrozenRows(1);
  widths.forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.hideColumns(headers.length); // the key column
}

function buildLog_(ss) {
  const sh = getOrCreate_(ss, SH.log);
  if (sh.getRange('A1').getValue() === 'Time') return;
  sh.getRange('A1:B1').setValues([['Time', 'What happened']]).setFontWeight('bold');
  sh.setColumnWidth(1, 160); sh.setColumnWidth(2, 700);
}

function buildState_(ss) {
  const sh = getOrCreate_(ss, SH.state);
  sh.hideSheet();
}

function buildDashboard_(ss) {
  const sh = getOrCreate_(ss, SH.dash);
  sh.clear();
  sh.getCharts().forEach(c => sh.removeChart(c));
  const A = `'${SH.apps}'`, J = `'${SH.jobs}'`;
  const rows = [
    ['Job Tracker', ''],
    ['', ''],
    ['Applications sent', `=COUNTA(${A}!A2:A)`],
    ['Still in play', `=COUNTIF(${A}!E2:E,"Applied")+COUNTIF(${A}!E2:E,"Screening")+COUNTIF(${A}!E2:E,"Interview")`],
    ['Got a reply', `=COUNTA(${A}!A2:A)-COUNTIF(${A}!F2:F,"Applied")`],
    ['Reply rate', `=IFERROR(B5/B3,0)`],
    ['Reached interview', `=COUNTIF(${A}!F2:F,"Interview")+COUNTIF(${A}!F2:F,"Offer")`],
    ['Offers', `=COUNTIF(${A}!F2:F,"Offer")`],
    ['New recommended jobs', `=COUNTIF(${J}!L2:L,"New")`],
    ['Best channel', ''], // filled below, once the channel table rows are known
    ['Status', 'Count'],
  ];
  STATUSES.forEach(s => rows.push([s, `=COUNTIF(${A}!E2:E,"${s}")`]));
  sh.getRange(1, 1, rows.length, 2).setValues(rows);
  sh.getRange('A1').setFontSize(20).setFontWeight('bold');
  sh.getRange('A3:A10').setFontWeight('bold');
  sh.getRange('B3:B10').setFontSize(14).setHorizontalAlignment('left');
  sh.getRange('B6').setNumberFormat('0%');
  sh.getRange('A11:B11').setFontWeight('bold').setBackground('#f1f3f4');
  sh.setColumnWidth(1, 200); sh.setColumnWidth(2, 120); sh.setColumnWidth(3, 110); sh.setColumnWidth(4, 110);
  const header = (r, cells) => sh.getRange(r, 1, 1, cells.length).setValues([cells]).setFontWeight('bold').setBackground('#f1f3f4');
  const chartAt = (type, range, title, row) => sh.insertChart(sh.newChart().setChartType(type).addRange(range)
    .setOption('title', title).setOption('legend', { position: 'none' })
    .setPosition(row, 6, 0, 0).setOption('width', 520).setOption('height', 300).build());
  chartAt(Charts.ChartType.BAR, sh.getRange(11, 1, STATUSES.length + 1, 2), 'Applications by status', 3);

  // Where applications stop: how many reached each stage or went further
  const fTop = rows.length + 2;
  header(fTop, ['Stage reached', 'Applications', 'Share of sent']);
  sh.getRange(fTop + 1, 1, STAGES.length, 3).setValues(STAGES.map((st, i) => [st,
    i === 0 ? `=COUNTA(${A}!A2:A)` : '=' + STAGES.slice(i).map(x => `COUNTIF(${A}!F2:F,"${x}")`).join('+'),
    `=IFERROR(B${fTop + 1 + i}/B${fTop + 1},0)`]));
  sh.getRange(fTop + 1, 3, STAGES.length, 1).setNumberFormat('0%');
  chartAt(Charts.ChartType.BAR, sh.getRange(fTop, 1, STAGES.length + 1, 2), 'Where applications stop', fTop);

  // Which channels get replies (room for 15 channels)
  const cTop = fTop + STAGES.length + 2, c1 = cTop + 1, c2 = cTop + 15;
  const ch = (col) => `${col}${c1}:${col}${c2}`;
  header(cTop, ['Channel', 'Sent', 'Replies', 'Reply rate']);
  sh.getRange(c1, 1, 1, 4).setValues([[
    `=IFERROR(SORT(UNIQUE(FILTER(${A}!C2:C,${A}!C2:C<>""))),"")`,
    `=ARRAYFORMULA(IF(${ch('A')}="","",COUNTIF(${A}!C2:C,${ch('A')})))`,
    `=ARRAYFORMULA(IF(${ch('A')}="","",COUNTIFS(${A}!C2:C,${ch('A')},${A}!F2:F,"<>Applied")))`,
    `=ARRAYFORMULA(IF(${ch('A')}="","",IFERROR(${ch('C')}/${ch('B')},0)))`,
  ]]);
  sh.getRange(c1, 4, 15, 1).setNumberFormat('0%');
  // Best channel: highest reply rate among channels used at least twice
  const best = `SORT(FILTER({${ch('A')},${ch('D')},${ch('B')}},ISNUMBER(${ch('B')})*(${ch('B')}>=2)),2,FALSE,3,FALSE)`;
  sh.getRange('B10').setFormula(`=IFERROR(INDEX(${best},1,1)&" ("&TEXT(INDEX(${best},1,2),"0%")&" reply rate)","Not enough data yet")`);

  // Applications per week (Mon–Sun), empty weeks as zero. Last block, so it can grow downwards.
  const wTop = c2 + 2, D = `${A}!D2:D`;
  const monday = (x) => `(INT(${x})-WEEKDAY(${x},3))`;
  header(wTop, ['Week of (Mon)', 'Applications']);
  sh.getRange(wTop + 1, 1, 1, 2).setValues([[
    `=IF(COUNT(${D})=0,"",SEQUENCE((${monday(`MAX(${D})`)}-${monday(`MIN(${D})`)})/7+1,1,${monday(`MIN(${D})`)},7))`,
    `=ARRAYFORMULA(IF(A${wTop + 1}:A="","",COUNTIFS(${D},">="&A${wTop + 1}:A,${D},"<"&(A${wTop + 1}:A+7))))`,
  ]]);
  sh.getRange(`A${wTop + 1}:A`).setNumberFormat('yyyy-mm-dd');
  chartAt(Charts.ChartType.COLUMN, sh.getRange(`A${wTop}:B`), 'Applications per week', wTop);
  ss.setActiveSheet(sh); ss.moveActiveSheet(1);
  [SH.jobs, SH.apps, SH.settings, SH.profile, SH.log].forEach((n, i) => {
    const s = ss.getSheetByName(n); if (s) { ss.setActiveSheet(s); ss.moveActiveSheet(i + 2); }
  });
}

function setValidations_(ss) {
  const set = ss.getSheetByName(SH.settings);
  set.getRange('B2').insertCheckboxes();
  set.getRange('B4:B10').insertCheckboxes();
  set.getRange('B12:B13').insertCheckboxes();
  set.getRange('B3').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(HOURS, true).build());
  set.getRange('B11').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['0', '3', '5', '10', '15'], true).build());
  const apps = ss.getSheetByName(SH.apps);
  apps.getRange('E2:E').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(true).build());
  apps.getRange('F2:F').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STAGES, true).setAllowInvalid(true).build());
  const jobs = ss.getSheetByName(SH.jobs);
  jobs.getRange('L2:L').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['New', 'Applied', 'Skipped', 'Expired'], true).setAllowInvalid(true).build());
  // Colour statuses
  const rules = [];
  const add = (sh, col, text, bg, fg) => rules.push({ sh, r: SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(text).setBackground(bg).setFontColor(fg).setRanges([sh.getRange(col + '2:' + col)]).build() });
  add(apps, 'E', 'Offer', '#e6f4ea', '#137333');
  add(apps, 'E', 'Interview', '#e8f0fe', '#1967d2');
  add(apps, 'E', 'Rejected', '#fce8e6', '#c5221f');
  add(apps, 'E', 'Ghosted', '#f1f3f4', '#5f6368');
  add(jobs, 'L', 'New', '#e8f0fe', '#1967d2');
  [apps, jobs].forEach(sh => sh.setConditionalFormatRules(rules.filter(x => x.sh === sh).map(x => x.r)));
}

function installTrigger_() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'hourlyCheck') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('hourlyCheck').timeBased().everyHours(1).create();
}

function removeAutomation() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  SpreadsheetApp.getUi().alert('Automation removed. Your data stays in the sheet. Run "Set up" again to turn it back on.');
}

function togglePause() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SH.settings);
  const cell = sh.getRange('B2');
  cell.setValue(!cell.getValue());
  SpreadsheetApp.getUi().alert(cell.getValue() ? 'Daily updates are ON.' : 'Daily updates are PAUSED.');
}

// ---------- Scheduling ----------
/** Runs every hour; does real work only at the chosen hour on chosen days, once per day. */
function hourlyCheck() {
  const ss = SpreadsheetApp.getActive();
  const s = readSettings_(ss);
  if (!s.enabled) return;
  const tz = ss.getSpreadsheetTimeZone();
  const now = new Date();
  const hour = Number(Utilities.formatDate(now, tz, 'H'));
  const day = Utilities.formatDate(now, tz, 'EEE'); // Mon, Tue, ...
  const today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  if (!s.days[day]) return;
  if (hour !== s.hour) return;
  const props = PropertiesService.getDocumentProperties();
  if (props.getProperty('lastScheduledDay') === today) return;
  props.setProperty('lastScheduledDay', today);
  runUpdate_(ss, s, true);
}

function runNow() {
  const ss = SpreadsheetApp.getActive();
  const s = readSettings_(ss);
  const summary = runUpdate_(ss, s, false);
  SpreadsheetApp.getUi().alert('Update finished', summary.text, SpreadsheetApp.getUi().ButtonSet.OK);
}

// ---------- Settings ----------
function readSettings_(ss) {
  const sh = ss.getSheetByName(SH.settings);
  if (!sh) throw new Error('Run Job Tracker → Set up first.');
  const v = sh.getRange('A1:B19').getValues();
  const map = {};
  v.forEach(([k, val]) => { if (k) map[String(k).trim()] = val; });
  const hourTxt = String(map['Update time'] || '8 PM');
  const m = hourTxt.match(/^(\d{1,2})\s*(AM|PM)$/i);
  let hour = 20;
  if (m) { hour = Number(m[1]) % 12; if (m[2].toUpperCase() === 'PM') hour += 12; }
  const days = {};
  DAY_NAMES.forEach(d => { days[d] = map[d] === true; });
  const n = Number(map['New jobs per day']);
  return {
    enabled: map['Daily updates on'] === true,
    hour,
    hourTxt,
    days,
    jobsPerDay: [0, 3, 5, 10, 15].indexOf(n) >= 0 ? n : 5,
    emailSummary: map['Email me a summary'] === true,
    makeResumes: map['Make tailored resumes'] === true,
    since: map['Search Gmail since'] instanceof Date ? map['Search Gmail since'] : new Date(Date.now() - 120 * 864e5),
    locations: String(map['Preferred locations'] || ''),
    prefs: String(map['Job preferences'] || ''),
    geminiKey: String(map['Gemini API key'] || '').trim(),
    geminiModel: String(map['Gemini model'] || 'gemini-2.5-flash').trim(),
  };
}

function setLastUpdate_(ss) {
  ss.getSheetByName(SH.settings).getRange('B19').setValue(new Date());
}

// ---------- Main update ----------
function runUpdate_(ss, s, scheduled) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(5000)) return { text: 'Another update is already running.' };
  const result = { appsNew: 0, appsChanged: [], jobsNew: [], resumes: 0, due: [], notes: [] };
  try {
    const props = PropertiesService.getDocumentProperties();
    const last = props.getProperty('lastRunAt');
    const after = last ? new Date(Number(last) - 2 * 864e5) : s.since;
    const afterStr = Utilities.formatDate(after, 'UTC', 'yyyy/MM/dd');
    const seen = loadSeen_(ss);

    syncApplications_(ss, s, afterStr, seen, result);
    markGhosted_(ss, result);

    if (s.jobsPerDay > 0) {
      if (!s.geminiKey) result.notes.push('Job matching is off — add a free Gemini key in Settings to turn it on.');
      else if (!cvText_(ss)) result.notes.push('Paste your CV into the "My CV" tab to get job matches.');
      else findJobs_(ss, s, afterStr, seen, result);
    }
    expireJobs_(ss);
    collectDue_(ss, result);

    saveSeen_(ss, seen);
    props.setProperty('lastRunAt', String(Date.now()));
    setLastUpdate_(ss);
    const text = summaryText_(result);
    log_(ss, (scheduled ? 'Scheduled update: ' : 'Manual update: ') + text.replace(/\n/g, ' | '));
    if (s.emailSummary && scheduled) sendSummary_(ss, result);
    return { text };
  } catch (e) {
    log_(ss, 'Error: ' + (e && e.message ? e.message : e));
    throw e;
  } finally {
    lock.releaseLock();
  }
}

// ---------- Applications from Gmail ----------
const APP_QUERY = '("thank you for applying" OR "thanks for applying" OR "application received" OR "received your application" OR "your application" OR "application status" OR interview OR shortlisted OR assessment OR "online test" OR "coding test" OR unfortunately OR "not moving forward" OR "regret to inform" OR "not been selected" OR "offer letter" OR "pleased to offer" OR withdrawn) -category:promotions -category:social';
const ALERT_SENDERS = 'from:linkedin.com OR from:naukri.com OR from:naukri.in OR from:internshala.com OR from:indeed.com OR from:foundit.in OR from:instahyre.com OR from:wellfound.com OR from:glassdoor.com OR from:apna.co OR from:unstop.com OR from:cutshort.io OR from:hirist.tech';

function syncApplications_(ss, s, afterStr, seen, result) {
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
  updates.forEach(u => upsertApplication_(ss, u, result));
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

function upsertApplication_(ss, u, result) {
  const sh = ss.getSheetByName(SH.apps);
  const data = sh.getDataRange().getValues();
  const company = String(u.company).trim();
  const role = String(u.role || '').trim();
  const stage = STATUSES.indexOf(u.stage) >= 0 ? u.stage : 'Applied';
  const date = u.email.date;
  const key = (company + '|' + role).toLowerCase();
  const keyNoRole = company.toLowerCase() + '|';
  let rowIdx = -1;
  for (let r = 1; r < data.length; r++) {
    const k = String(data[r][9]);
    if (k === key || (!role && k.indexOf(keyNoRole) === 0) || (role && k === keyNoRole)) { rowIdx = r; break; }
  }
  const link = SpreadsheetApp.newRichTextValue().setText('Open').setLinkUrl(u.email.link).build();
  if (rowIdx < 0) {
    const furthest = STAGES.indexOf(stage) >= 0 ? stage : 'Applied';
    sh.appendRow([company, role, channelFromSender_(u.email.from), date, stage, furthest, date, u.next_step || '', '', key]);
    sh.getRange(sh.getLastRow(), 9).setRichTextValue(link);
    sh.getRange(sh.getLastRow(), 4, 1, 1).setNumberFormat('yyyy-mm-dd');
    sh.getRange(sh.getLastRow(), 7, 1, 1).setNumberFormat('yyyy-mm-dd');
    result.appsNew++;
    result.appsChanged.push(`${company}${role ? ' – ' + role : ''}: ${stage}`);
    return;
  }
  const row = rowIdx + 1;
  const cur = data[rowIdx];
  const prevFurthest = String(cur[5]);
  const furthest = STAGES.indexOf(stage) > STAGES.indexOf(prevFurthest) ? stage : prevFurthest;
  if (role && !cur[1]) sh.getRange(row, 2).setValue(role);
  sh.getRange(row, 5, 1, 4).setValues([[stage, furthest, date, u.next_step || (['Rejected', 'Withdrawn', 'Offer'].indexOf(stage) >= 0 ? '' : cur[7])]]);
  sh.getRange(row, 7).setNumberFormat('yyyy-mm-dd');
  sh.getRange(row, 9).setRichTextValue(link);
  if (role && !cur[1]) sh.getRange(row, 10).setValue(key);
  if (String(cur[4]) !== stage) result.appsChanged.push(`${company}${(role || cur[1]) ? ' – ' + (role || cur[1]) : ''}: ${cur[4]} → ${stage}`);
}

function channelFromSender_(from) {
  const f = from.toLowerCase();
  const map = { naukri: 'Naukri', linkedin: 'LinkedIn', internshala: 'Internshala', indeed: 'Indeed', hirepro: 'HirePro', wellfound: 'Wellfound', instahyre: 'Instahyre', foundit: 'foundit', unstop: 'Unstop', greenhouse: 'Company site', lever: 'Company site', workday: 'Company site' };
  for (const k in map) if (f.indexOf(k) >= 0) return map[k];
  return 'Company site';
}

function markGhosted_(ss, result) {
  const sh = ss.getSheetByName(SH.apps);
  const data = sh.getDataRange().getValues();
  const cutoff = Date.now() - GHOST_DAYS * 864e5;
  for (let r = 1; r < data.length; r++) {
    const last = data[r][6] instanceof Date ? data[r][6].getTime() : 0;
    if (data[r][4] === 'Applied' && last && last < cutoff) {
      sh.getRange(r + 1, 5).setValue('Ghosted');
      result.appsChanged.push(`${data[r][0]}: no reply for ${GHOST_DAYS}+ days → Ghosted`);
    }
  }
}

// ---------- Recommended jobs ----------
function findJobs_(ss, s, afterStr, seen, result) {
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
  const jobsSh = ss.getSheetByName(SH.jobs);
  const existing = new Set(jobsSh.getDataRange().getValues().slice(1).map(r => String(r[12])));
  ss.getSheetByName(SH.apps).getDataRange().getValues().slice(1).forEach(r => existing.add(String(r[9])));
  const uniq = {};
  listings.forEach(l => {
    if (!l || !l.company || !l.role) return;
    const key = (String(l.company).trim() + '|' + String(l.role).trim()).toLowerCase();
    if (!existing.has(key) && !uniq[key]) uniq[key] = Object.assign({ key }, l);
  });
  const candidates = Object.keys(uniq).map(k => uniq[k]).slice(0, 40);
  if (!candidates.length) return;

  // 2) Score against the CV and preferences
  const cv = clip_(cvText_(ss), 9000);
  const scored = gemini_(s, 'You match job openings to a candidate. Be strict and honest.\n' +
    `Candidate CV:\n${cv}\n\nPreferred locations: ${s.locations}\nPreferences: ${s.prefs}\n\n` +
    'For each opening return {"n": <number>, "fit": 1-5, "why": "<one sentence tying it to the CV>", "skill_gap": "<one skill to pick up, or None>", "apply_by": "<YYYY-MM-DD if stated, else empty>", "keep": true|false}. ' +
    'keep=false for roles that clash with the preferences, need far more experience, are unpaid internships (if the preferences say paid only), or look like training institutes charging fees.\n\n' +
    candidates.map((c, i) => `${i}. ${c.company} — ${c.role} — ${c.location || ''} — ${c.pay || ''} — ${c.details || ''}`).join('\n'), true);
  const picks = (Array.isArray(scored) ? scored : [])
    .filter(x => x && x.keep && Number(x.fit) >= 3 && candidates[Number(x.n)])
    .sort((a, b) => Number(b.fit) - Number(a.fit))
    .slice(0, s.jobsPerDay)
    .map(x => Object.assign({}, candidates[Number(x.n)], { fit: Number(x.fit), why: x.why || '', skill_gap: x.skill_gap || 'None', apply_by: x.apply_by || '' }));

  const tz = ss.getSpreadsheetTimeZone();
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  let resumesMade = 0;
  picks.forEach(p => {
    jobsSh.appendRow([today, p.fit, p.company, p.role, p.location || '', p.pay || '', p.why, p.skill_gap, p.apply_by, '', '', 'New', p.key]);
    const row = jobsSh.getLastRow();
    if (/^https?:\/\//.test(String(p.link || ''))) jobsSh.getRange(row, 10).setRichTextValue(SpreadsheetApp.newRichTextValue().setText('Apply ↗').setLinkUrl(p.link).build());
    if (s.makeResumes && resumesMade < MAX_RESUMES_PER_RUN) {
      try {
        const url = makeResume_(ss, s, p);
        if (url) { jobsSh.getRange(row, 11).setRichTextValue(SpreadsheetApp.newRichTextValue().setText('Download resume').setLinkUrl(url).build()); resumesMade++; }
      } catch (e) { log_(ss, `Resume for ${p.company} failed: ${e.message}`); }
    }
    result.jobsNew.push(`${p.company} – ${p.role} (fit ${p.fit}/5)`);
  });
  result.resumes += resumesMade;
}

function expireJobs_(ss) {
  const sh = ss.getSheetByName(SH.jobs);
  const data = sh.getDataRange().getValues();
  // application keys are company|role; a roleless one (company|) counts for any role at that company
  const apps = new Set(ss.getSheetByName(SH.apps).getDataRange().getValues().slice(1).map(r => String(r[9])));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let r = 1; r < data.length; r++) {
    if (data[r][11] !== 'New') continue;
    const company = String(data[r][2]).trim().toLowerCase();
    if (apps.has(String(data[r][12])) || apps.has(company + '|')) { sh.getRange(r + 1, 12).setValue('Applied'); continue; }
    const by = data[r][8] instanceof Date ? data[r][8] : (/^\d{4}-\d{2}-\d{2}$/.test(String(data[r][8])) ? new Date(String(data[r][8])) : null);
    if (by && by < today) sh.getRange(r + 1, 12).setValue('Expired');
  }
}

function collectDue_(ss, result) {
  ss.getSheetByName(SH.apps).getDataRange().getValues().slice(1).forEach(r => {
    if ((r[4] === 'Screening' || r[4] === 'Interview' || r[4] === 'Offer') && r[7]) result.due.push(`${r[0]}: ${r[7]}`);
  });
}

// ---------- Tailored resume (Google Doc → PDF in Drive) ----------
function resumeForSelectedRow() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getActiveSheet();
  const ui = SpreadsheetApp.getUi();
  if (sh.getName() !== SH.jobs) { ui.alert('Open the "Recommended jobs" tab and click on a job row first.'); return; }
  const row = sh.getActiveRange().getRow();
  if (row < 2) { ui.alert('Click on a job row first.'); return; }
  const s = readSettings_(ss);
  if (!s.geminiKey) { ui.alert('Add a free Gemini API key in Settings first.'); return; }
  if (!cvText_(ss)) { ui.alert('Paste your CV into the "My CV" tab first.'); return; }
  const v = sh.getRange(row, 1, 1, JOB_HEADERS.length).getValues()[0];
  const url = makeResume_(ss, s, { company: v[2], role: v[3], location: v[4], details: v[6] });
  if (url) {
    sh.getRange(row, 11).setRichTextValue(SpreadsheetApp.newRichTextValue().setText('Download resume').setLinkUrl(url).build());
    ui.alert('Resume ready ✓', 'Saved to Google Drive → "Job Tracker Resumes". The link is in the Resume column.', ui.ButtonSet.OK);
  }
}

function makeResume_(ss, s, job) {
  const cv = clip_(cvText_(ss), 12000);
  const r = gemini_(s, 'Write a one-page, ATS-friendly resume for this candidate, tailored to the job below.\n' +
    'STRICT HONESTY: use ONLY facts from the CV. Never invent experience, employers, dates, numbers, skills, tools or certifications. ' +
    'Tailor by choosing, ordering and wording true facts toward the job, using the job\'s wording only for things the candidate really has. Leave out date of birth, nationality and photos.\n' +
    'Return JSON: {"name":"","headline":"<target role + 2-3 true focus areas>","contact":["email","phone","city","links"...],' +
    '"summary":"<3-4 lines>","skills":[{"group":"","items":[""]}],' +
    '"experience":[{"title":"","org":"","dates":"","bullets":[""]}],' +
    '"projects":[{"name":"","tech":"","dates":"","bullets":[""]}],' +
    '"education":[{"school":"","degree":"","dates":"","details":""}],' +
    '"certifications":[""],"extras":[""]}. Keep it to one page: at most 4 skill groups, 3 projects with up to 4 bullets each, short bullets. Empty arrays for sections the CV does not support.\n\n' +
    `JOB: ${job.company} — ${job.role} — ${job.location || ''}\n${job.details || ''}\n\nCV:\n${cv}`, true);
  if (!r || !r.name) throw new Error('Gemini did not return a resume');

  const doc = DocumentApp.create(`Resume – ${job.company} – ${job.role}`);
  const body = doc.getBody();
  body.setMarginTop(36).setMarginBottom(36).setMarginLeft(46).setMarginRight(46);
  const base = {}; base[DocumentApp.Attribute.FONT_FAMILY] = 'Georgia'; base[DocumentApp.Attribute.FONT_SIZE] = 10; base[DocumentApp.Attribute.FOREGROUND_COLOR] = '#111111';
  body.setAttributes(base);
  const para = (text, opts) => {
    const p = body.appendParagraph(text || '');
    p.setSpacingBefore(opts && opts.before || 0).setSpacingAfter(opts && opts.after || 0).setLineSpacing(1.05);
    if (opts && opts.center) p.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    if (opts && opts.size) p.editAsText().setFontSize(opts.size);
    if (opts && opts.bold) p.editAsText().setBold(true);
    if (opts && opts.italic) p.editAsText().setItalic(true);
    if (opts && opts.color) p.editAsText().setForegroundColor(opts.color);
    return p;
  };
  const heading = (t) => {
    const p = para(t.toUpperCase(), { before: 9, after: 3, size: 10.5, bold: true });
    p.editAsText().setForegroundColor('#111111');
    body.appendHorizontalRule();
    return p;
  };
  const bullet = (t) => {
    const li = body.appendListItem(t);
    li.setGlyphType(DocumentApp.GlyphType.BULLET).setSpacingAfter(1).setLineSpacing(1.05).setIndentStart(14).setIndentFirstLine(4);
    li.editAsText().setFontSize(10).setBold(false).setItalic(false);
    return li;
  };
  const line = (left, right) => {
    left = String(left || '');
    right = String(right || '');
    const p = para(left + (right ? '   ' + right : ''), { before: 5 });
    const t = p.editAsText();
    if (left) t.setBold(0, left.length - 1, true);
    if (right) t.setItalic(left.length + 3, left.length + 2 + right.length, true).setForegroundColor(left.length + 3, left.length + 2 + right.length, '#555555');
    return p;
  };

  body.getChild(0).asParagraph().setText(r.name);
  const first = body.getChild(0).asParagraph();
  first.setAlignment(DocumentApp.HorizontalAlignment.CENTER).editAsText().setFontSize(20).setBold(false);
  first.setSpacingAfter(2);
  if (r.headline) para(r.headline, { center: true, italic: true, size: 10.5, after: 2 });
  if (r.contact && r.contact.length) para(r.contact.filter(Boolean).join('  •  '), { center: true, size: 9, color: '#444444', after: 4 });
  if (r.summary) { heading('Summary'); para(r.summary, { after: 2 }); }
  if (r.skills && r.skills.length) {
    heading('Skills');
    r.skills.forEach(g => { const grp = String(g.group || ''); const t = `${grp}: ${(g.items || []).join(', ')}`; const p = para(t, { after: 1 }); if (grp) p.editAsText().setBold(0, grp.length, true); });
  }
  if (r.experience && r.experience.length) {
    heading('Experience');
    r.experience.forEach(x => { line(`${x.title}${x.org ? ', ' + x.org : ''}`, x.dates); (x.bullets || []).forEach(bullet); });
  }
  if (r.projects && r.projects.length) {
    heading('Projects');
    r.projects.forEach(x => { line(`${x.name}${x.tech ? ' — ' + x.tech : ''}`, x.dates); (x.bullets || []).forEach(bullet); });
  }
  if (r.education && r.education.length) {
    heading('Education');
    r.education.forEach(x => { line(x.school || '', x.dates); if (x.degree) para(x.degree, { italic: true }); if (x.details) para(x.details); });
  }
  if (r.certifications && r.certifications.length) { heading('Certifications'); r.certifications.forEach(bullet); }
  if (r.extras && r.extras.length) { heading('Activities'); r.extras.forEach(bullet); }
  doc.saveAndClose();

  const folder = resumeFolder_();
  const safe = (x) => String(x || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const pdf = DriveApp.getFileById(doc.getId()).getAs('application/pdf').setName(`${safe(r.name)}_Resume_${safe(job.company)}_${safe(job.role)}.pdf`);
  const file = folder.createFile(pdf);
  DriveApp.getFileById(doc.getId()).setTrashed(true);
  return file.getUrl();
}

function resumeFolder_() {
  const props = PropertiesService.getDocumentProperties();
  const id = props.getProperty('resumeFolderId');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const f = DriveApp.createFolder('Job Tracker Resumes');
  props.setProperty('resumeFolderId', f.getId());
  return f;
}

// ---------- Gemini ----------
function gemini_(s, prompt, json) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(s.geminiModel)}:generateContent`;
  const payload = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } };
  if (json) payload.generationConfig.responseMimeType = 'application/json';
  let res;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), headers: { 'x-goog-api-key': s.geminiKey }, muteHttpExceptions: true });
    const code = res.getResponseCode();
    if (code === 429 || code >= 500) { Utilities.sleep(4000 * (attempt + 1)); continue; }
    break;
  }
  const code = res.getResponseCode();
  if (code !== 200) throw new Error(`Gemini error ${code}: ${clip_(res.getContentText(), 300)}`);
  const data = JSON.parse(res.getContentText());
  const text = (((data.candidates || [])[0] || {}).content || {}).parts ? data.candidates[0].content.parts.map(p => p.text || '').join('') : '';
  if (!json) return text;
  try { return JSON.parse(text); } catch (e) {
    const m = text.match(/[\[{][\s\S]*[\]}]/);
    return m ? JSON.parse(m[0]) : null;
  }
}

// ---------- Summary email ----------
function summaryText_(r) {
  const lines = [];
  lines.push(r.appsChanged.length ? `Application updates:\n- ${r.appsChanged.join('\n- ')}` : 'No new application updates.');
  if (r.jobsNew.length) lines.push(`New recommended jobs (${r.resumes} with a tailored resume):\n- ${r.jobsNew.join('\n- ')}`);
  if (r.due.length) lines.push(`Waiting on you:\n- ${r.due.join('\n- ')}`);
  if (r.notes.length) lines.push(r.notes.join('\n'));
  return lines.join('\n\n');
}

function sendSummary_(ss, r) {
  if (!r.appsChanged.length && !r.jobsNew.length && !r.due.length) return; // nothing worth an email
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const list = (title, items) => items.length ? `<h3 style="margin:16px 0 6px;font:600 15px Arial">${title}</h3><ul style="margin:0;padding-left:18px;font:14px Arial">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : '';
  const html = `<div style="font:14px Arial;color:#111">` +
    list('Application updates', r.appsChanged) +
    list(`New recommended jobs${r.resumes ? ` (${r.resumes} with a tailored resume)` : ''}`, r.jobsNew) +
    list('Waiting on you', r.due) +
    (r.notes.length ? `<p style="color:#5f6368">${r.notes.map(esc).join('<br>')}</p>` : '') +
    `<p style="margin-top:18px"><a href="${ss.getUrl()}">Open your Job Tracker</a></p></div>`;
  const subject = `Job Tracker: ${r.appsChanged.length} update${r.appsChanged.length === 1 ? '' : 's'}, ${r.jobsNew.length} new job${r.jobsNew.length === 1 ? '' : 's'}`;
  MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), subject, htmlBody: html, name: 'Job Tracker' });
}

// ---------- Helpers ----------
function getOrCreate_(ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); }
function clip_(t, n) { t = String(t || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n'); return t.length > n ? t.slice(0, n) + '…' : t; }
function cvText_(ss) { const sh = ss.getSheetByName(SH.profile); return sh ? String(sh.getRange('A2').getValue() || '').trim() : ''; }

function loadSeen_(ss) {
  const sh = ss.getSheetByName(SH.state);
  const n = sh.getLastRow();
  return new Set(n ? sh.getRange(1, 1, n, 1).getValues().map(r => String(r[0])).filter(Boolean) : []);
}
function saveSeen_(ss, seen) {
  const sh = ss.getSheetByName(SH.state);
  const ids = Array.from(seen).slice(-5000);
  sh.clear();
  if (ids.length) sh.getRange(1, 1, ids.length, 1).setValues(ids.map(i => [i]));
}
function log_(ss, msg) {
  const sh = ss.getSheetByName(SH.log);
  if (!sh) return;
  sh.insertRowAfter(1);
  sh.getRange(2, 1, 1, 2).setValues([[new Date(), msg]]);
  if (sh.getLastRow() > 300) sh.deleteRows(301, sh.getLastRow() - 300);
}
