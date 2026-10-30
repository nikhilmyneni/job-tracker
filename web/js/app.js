/** Job Hunter app: sign-in, routing between screens, syncing, and every action that changes your data (then saves it to your Drive). */
import { GOOGLE_CLIENT_ID } from '../config.js';
import * as C from './core.js';
import * as G from './google.js';
import { runUpdate, cvForResumeFold } from './update.js';
import { jobDescription } from './sources.js';
import { hasAi, useSharedAi, AiError, ask } from './ai.js';
import { $, h, busy, toast, errText, setLabel } from './ui.js';
import { runWizard } from './onboarding.js';
import { renderApplications } from './view-applications.js';
import { renderMatches } from './view-matches.js';
import { renderTailor } from './view-tailor.js';
import { renderProfile, renderSettings } from './view-settings.js';
import { demoData, DEMO_ME, DEMO_FOLD } from './demo.js';
import { downloadBlob } from './files.js';
import { resumeDocx } from './docx.js';
import { resumePdf } from './pdf.js';
import { readTtf } from './ttf.js';
import { askToNotify, notifySync } from './notify.js';

const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const ctx = { data: null, me: null, demo: DEMO, act: {} };

// ---------- screens and routes ----------
function show(name) {
  ['signin', 'loading', 'wizard', 'app'].forEach(n => { $('screen-' + n).hidden = n !== name; });
  if (ctx.me) $('account-name').textContent = ctx.me.email;
  drawGmailState();
}

const ROUTES = [
  [/^\/app\/?$/, 'applications', renderApplications],
  [/^\/app\/matches\/?$/, 'matches', renderMatches],
  [/^\/app\/tailor(?:\/([^/]+))?\/?$/, 'tailor', renderTailor],
  [/^\/app\/profile\/?$/, 'profile', renderProfile],
  [/^\/app\/settings\/?$/, 'settings', renderSettings],
];
function route() {
  const path = location.pathname;
  return ROUTES.find(([re]) => re.test(path)) || ROUTES[0];
}

/** Draws the current screen. keepFocus: a background redraw (sync progress) shouldn't move focus. */
// In the demo, Gmail starts connected on the sample dashboard and not connected in the setup demo.
let demoGmail = params.get('demo') !== 'setup';
const gmailOn = () => (DEMO ? demoGmail : G.gmailConnected());

/** The sidebar card: Gmail connected (read-only), or a Connect button. */
function drawGmailState() {
  const on = gmailOn();
  $('gmail-state').textContent = on ? 'Gmail connected' : 'Gmail not connected';
  $('gmail-sub').textContent = on ? 'Read-only' : 'Applications only update when you add them';
  $('connect-gmail').hidden = on;
}

function render(keepFocus) {
  if (!ctx.data || $('screen-app').hidden) return;
  const [re, name, fn] = route();
  const m = location.pathname.match(re);
  document.querySelectorAll('[data-route]').forEach(a => { if (a.dataset.route === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  const n = ctx.data.jobs.filter(j => j.status === 'New').length;
  $('nav-matches').hidden = !n; $('nav-matches').textContent = n;
  $('nav-matches').setAttribute('aria-label', `${n} new`);
  const root = $('content');
  // On desktop only the content column scrolls (the sidebar stays put); on phones the page does.
  const scroll = root.scrollTop || window.scrollY;
  fn(ctx, root, m && m[1] ? decodeURIComponent(m[1]) : undefined);
  document.title = (root.querySelector('h1') ? root.querySelector('h1').textContent + ' – ' : '') + 'Job Hunter';
  const to = keepFocus ? scroll : 0;
  if (!keepFocus) { const t = root.querySelector('h1'); if (t) t.focus({ preventScroll: true }); }
  root.scrollTop = to; window.scrollTo(0, to);
}

function go(href) {
  const u = new URL(href, location.href);
  if (DEMO) u.searchParams.set('demo', params.get('demo') || '');
  history.pushState(null, '', u.pathname + u.search);
  render();
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="/app"]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
  if (!ctx.data || $('screen-app').hidden) return;
  e.preventDefault(); go(a.getAttribute('href'));
});
window.addEventListener('popstate', () => render());

// ---------- scores ----------
const scoreOf = (job) => {
  const m = C.matchScore(job, C.mySkills(ctx.data), ctx.data.settings.keywords, ctx.data.settings.prefs.roles, ctx.data.settings.prefs.roleRange);
  return { score: m.score, fit: Math.max(1, Math.round(m.score / 20)), matched: m.matched.slice(0, 12), missing: m.missing.slice(0, 8), skill_gap: m.missing[0] || 'None', title_only: !!m.titleOnly };
};
/** After your skills or keywords change, every match is scored again. */
function rescore() { ctx.data.jobs.forEach(j => Object.assign(j, scoreOf(j))); }

// ---------- the built-in AI ----------
/** Calls /api/ai (the built-in AI) with your Google token, so only signed-in users can use it. */
async function sharedAi(task, prompt, json) {
  const token = G.accessToken();
  let res;
  try {
    // Never wait forever: past this, the sync sorts the batch with keyword rules instead.
    res = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ task, prompt, json }), signal: AbortSignal.timeout(65000) });
  } catch (e) { throw new AiError(e && e.name === 'TimeoutError' ? 'the AI took too long' : 'Built-in AI: network error', true); }
  const j = await res.json().catch(() => ({}));
  if (res.status === 401) { showReconnect(true); throw new G.NeedSignIn(j.error || 'Sign in again.'); }
  if (!res.ok) throw new AiError(j.error || `Built-in AI error ${res.status}`, res.status >= 500);
  return j.result;
}

// ResumeFold's resume font (Source Sans 3), loaded once for PDFs; if it can't load, the PDF falls back to Helvetica.
let fontsLoading = null;
function resumeFonts() {
  if (!fontsLoading) {
    const one = (f) => fetch(`/vendor/fonts/source-sans-3-${f}.ttf`).then(r => { if (!r.ok) throw new Error('font'); return r.arrayBuffer(); }).then(readTtf);
    fontsLoading = Promise.all(['regular', 'bold', 'italic'].map(one)).then(([R, B, I]) => ({ R, B, I })).catch(() => { fontsLoading = null; return null; });
  }
  return fontsLoading;
}

// ---------- email alerts (opt-in; the server is api/alerts.js) ----------
async function alertsApi(method, body) {
  const res = await fetch('/api/alerts', { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + G.accessToken() }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (res.status === 401) { showReconnect(true); throw new G.NeedSignIn(j.error || 'Sign in again.'); }
  if (!res.ok) throw new Error(j.error || `Email alerts error ${res.status}`);
  return j;
}
const myTimeZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'; } catch (e) { return 'Asia/Kolkata'; } };
/** Sends the server what matching needs (when alerts are on), or deletes it (when they've just been turned off). */
async function syncAlerts(wasOn) {
  if (DEMO) return;
  if (ctx.data.settings.emailAlerts) await alertsApi('PUT', { profile: C.alertProfile(ctx.data, myTimeZone()) });
  else if (wasOn) await alertsApi('DELETE');
}
/** Jobs the server found while the app was closed: added as New, then the server forgets them. */
async function pickUpAlerts() {
  if (DEMO || !ctx.data.settings.emailAlerts) return;
  try {
    const r = await alertsApi('GET');
    if (!r.on) { ctx.data.settings.emailAlerts = false; await persist(); return; } // stopped from the email's link
    const n = C.mergeAlertJobs(ctx.data, r.jobs);
    if (r.jobs && r.jobs.length) await alertsApi('POST', { ack: r.jobs.map(j => j.id) });
    if (n) { rescore(); await persist(); render(true); toast(`${n} new job${n === 1 ? '' : 's'} found while you were away.`); }
  } catch (e) { /* tried; the jobs wait on the server for next time */ }
}

// ---------- saving ----------
function showReconnect(on) { $('reconnect').hidden = !on; }

async function guarded(fn) {
  try { return await fn(); } catch (e) {
    if (e instanceof G.NeedSignIn) { showReconnect(true); throw new Error('Your Google session ended. Click Continue at the top, then try again.'); }
    throw e;
  }
}

async function persist() {
  C.trimData(ctx.data);
  if (!DEMO) await guarded(() => G.saveData(ctx.data));
}

// ---------- actions ----------
const today = () => C.ymd(new Date());
Object.assign(ctx.act, {
  async saveSettings(d) {
    const wasOn = ctx.data.settings.emailAlerts;
    ctx.data.settings = C.normalizeSettings(Object.assign({}, d, { onboarded: true }));
    rescore(); // the role range and your keywords change scores
    let alertErr = null;
    if (wasOn || ctx.data.settings.emailAlerts) {
      try { await syncAlerts(wasOn); } catch (e) { alertErr = e; if (!wasOn) ctx.data.settings.emailAlerts = false; }
    }
    await persist(); render(true);
    if (alertErr) throw new Error('Saved, but email alerts couldn’t be turned on: ' + errText(alertErr));
  },
  async saveCv(text, file) {
    const changed = String(text || '') !== ctx.data.cv;
    if (file && !DEMO) ctx.data.cvFile = await guarded(() => G.saveCvFile(file, ctx.data.cvFile && ctx.data.cvFile.id));
    else if (file) ctx.data.cvFile = { id: 'demo', name: file.name, mime: file.type, size: file.size, at: new Date().toISOString() };
    ctx.data.cv = String(text || '').slice(0, C.MAX_CV);
    if (changed) rescore();
    await persist(); render(true);
    if (changed && ctx.data.settings.emailAlerts) syncAlerts(true).catch(() => {}); // new skills for the alerts
  },
  async downloadCv() {
    const f = ctx.data.cvFile;
    if (!f) return;
    if (DEMO) { toast('Demo: no real file to download.'); return; }
    try { downloadBlob(await guarded(() => G.downloadFile(f.id)), f.name); } catch (e) { toast(errText(e), true); }
  },
  /** The resume tailoring starts from: the CV as the AI read it (if it has, for this CV), else as read by rules. */
  baseResume() {
    const d = ctx.data;
    const r = d.cvFold && d.cvFoldHash === C.foldKey(d.cv) ? d.cvFold : C.resumeFromCv(d.cv, { skills: C.mySkills(d), hint: ctx.me && ctx.me.name });
    // The name you confirmed in setup (Profile) wins over the one read from the CV's header.
    const name = C.tidyName(d.settings.name || r.contact.fullName, [ctx.me && ctx.me.name, ctx.me && ctx.me.email]);
    return name ? Object.assign({}, r, { contact: Object.assign({}, r.contact, { fullName: name }) }) : r;
  },
  baseIsRough: () => !(ctx.data.cvFold && ctx.data.cvFoldHash === C.foldKey(ctx.data.cv)),
  /** The AI reads the CV into proper sections, once per CV (facts copied, never rewritten). */
  async readCvWithAi() {
    const d = ctx.data;
    if (DEMO) { await sleep(700); d.cvFold = DEMO_FOLD; d.cvFoldHash = C.foldKey(d.cv); return; }
    if (!hasAi(d.settings)) throw new Error('The AI isn’t available right now. The rules-based version still works.');
    d.cvFold = await cvForResumeFold(d); d.cvFoldHash = C.foldKey(d.cv);
    await persist();
  },
  canReword: () => hasAi(ctx.data.settings),
  /** An AI-reworded summary as a suggestion, or null when it says something the CV doesn't. */
  async rewordSummary(job, resume) {
    const d = ctx.data;
    const out = await ask(d.settings, C.rewordPrompt(resume.summary, d.cv, job), true, () => {}, 'cv');
    const text = String((out && out.summary) || '').trim().slice(0, 800);
    if (!C.honestRewrite(text, d.cv, d.settings.keywords).ok) return null;
    return { id: 'summary', kind: 'Reword', title: 'A summary for this job', text, patch: { op: 'summary', value: text } };
  },
  /** Saves a pasted job description as a job (status Saved) and opens the tailor for it. */
  async tailorPasted(input) {
    const job = C.pastedJob(input, C.ymd(new Date()));
    if (!job) throw new Error('Paste the job description first (a few lines at least).');
    Object.assign(job, scoreOf(job));
    ctx.data.jobs.push(job);
    C.addLog(ctx.data, `Pasted a job to tailor for: ${job.role}${job.company ? ' at ' + job.company : ''}`);
    await persist();
    go('/app/tailor/' + encodeURIComponent(job.id));
  },
  /** Tailoring choices are saved with the job (the resume itself is rebuilt from them). */
  async saveTailored(job, t) {
    const ids = (v) => (Array.isArray(v) ? v.map(String).slice(0, 40) : []);
    job.tailored = { accepted: ids(t.accepted), confirmed: ids(t.confirmed), template: t.template in C.TEMPLATES ? t.template : 'standard',
      extra: (Array.isArray(t.extra) ? t.extra : []).slice(0, 3), at: new Date().toISOString() };
    await persist();
  },
  /** The tailored resume as ResumeFold's JSON (with the job and layout filled in), to import there. */
  async exportResumeFold(job, resume, template) {
    const desc = DEMO ? job.details : (job.jd || await jobDescription(job));
    const file = C.resumeFoldFor(resume, job, desc, template);
    downloadBlob(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }), file.meta.exportSettings.filename + '.json');
    job.resumefold_at = new Date().toISOString();
    await persist();
  },
  /** The resume as a file, named like Sai_Nikhil_Myneni_Resume_Diffzene_Cyber_Security_Intern.pdf. */
  async downloadResume(job, resume, kind, template = 'standard') {
    const name = C.resumeFileBase(resume.contact.fullName, job.company, job.role);
    if (kind === 'pdf') downloadBlob(new Blob([resumePdf(resume, template, await resumeFonts())], { type: 'application/pdf' }), name + '.pdf');
    else if (kind === 'docx') downloadBlob(new Blob([resumeDocx(resume)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), name + '.docx');
    else downloadBlob(new Blob([C.resumeLatex(resume)], { type: 'application/x-tex' }), name + '.tex');
  },
  /** The job matches screen: filters and your keywords are saved with your settings. */
  async saveMatchView(view, keywords, minMatch) {
    const s = ctx.data.settings;
    s.matchView = Object.assign({}, s.matchView, view);
    if (keywords) s.keywords = keywords;
    if (minMatch != null) s.minMatch = minMatch;
    ctx.data.settings = C.normalizeSettings(s);
    rescore();
    await persist(); render(true);
    // Keywords and the minimum match also steer the email alerts.
    if ((keywords || minMatch != null) && ctx.data.settings.emailAlerts) syncAlerts(true).catch(() => {});
  },
  /** A job's full description (fetched once, kept with the job), and its score again with it. */
  async loadJobDetails(job) {
    if (job.jd || DEMO) return job;
    const text = await jobDescription(job);
    if (text && text !== job.details) {
      job.jd = C.clip(text, 8000);
      Object.assign(job, scoreOf(job));
      await persist();
    }
    return job;
  },
  /** Your skills, as matching sees them: the CV's, plus ones you add, minus ones you remove. */
  async saveSkills(list) {
    const fromCv = C.termsIn(ctx.data.cv);
    const want = new Set(list.map(x => x.toLowerCase()));
    ctx.data.skillsAdded = list.filter(x => ![...fromCv].some(c => c.toLowerCase() === x.toLowerCase()));
    ctx.data.skillsRemoved = [...fromCv].filter(c => !want.has(c.toLowerCase()));
    rescore();
    await persist(); render(true);
    if (ctx.data.settings.emailAlerts) syncAlerts(true).catch(() => {});
  },
  async setJobStatus(job, status) {
    job.status = status;
    if (status === 'Applied') C.upsertApplication(ctx.data.applications, { company: job.company, role: job.role, stage: 'Applied', date: today(), channel: job.source || 'Recommended job', posting: job.link }, C.newResult());
    await persist(); render(true);
  },
  async addApplication(a) {
    if (!String(a.company || '').trim()) throw new Error('Add the company name.');
    C.upsertApplication(ctx.data.applications, { company: a.company, role: a.role, stage: 'Applied', date: C.isYmd(a.applied_on) ? a.applied_on : today(), channel: String(a.channel || '').trim().slice(0, 40) || 'Company site' }, C.newResult());
    await persist(); render(true);
  },
  async setApplicationStatus(app, status) { C.setApplicationStatus(app, status, today()); await persist(); render(true); },
  /** Archive or bring back one or more applications. */
  async archiveApplications(list, on) {
    list.forEach(a => C.setArchived(a, on, today()));
    await persist(); render(true);
    toast(on ? `Moved ${list.length} to the Archive.` : `${list.length === 1 ? 'It’s' : 'They’re'} back on the board.`);
  },
  /** Manual correction from the card's dialog. */
  async editApplication(app, e) {
    if (e.status !== app.status) C.setApplicationStatus(app, e.status, today());
    const role = String(e.role || '').trim().slice(0, 120);
    if (role !== app.role) { app.role = role; app.key = (app.company + '|' + role).toLowerCase(); }
    app.next_step = String(e.next_step || '').trim().slice(0, 200);
    app.next_at = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(e.next_at) ? e.next_at : '';
    app.next_kind = app.next_at ? (e.next_kind === 'deadline' ? 'deadline' : 'interview') : '';
    await persist(); render(true);
  },
  /** An email from "needs a look": add it as an application (fix), or dismiss it (null). */
  async resolveReview(r, fix) {
    if (fix) {
      if (!String(fix.company || '').trim()) throw new Error('Add the company name.');
      C.upsertApplication(ctx.data.applications, { company: fix.company, stage: fix.stage, date: r.date, channel: C.channelFromSender(r.from), link: r.link }, C.newResult());
    }
    ctx.data.review = ctx.data.review.filter(x => x.id !== r.id);
    ctx.data.reviewDone = (ctx.data.reviewDone || []).concat(r.id).slice(-500);
    await persist(); render(true);
  },
  async enableNotifications() {
    if (!await askToNotify()) throw new Error('Notifications weren’t allowed.');
    ctx.data.settings.notify = true;
    await persist(); render(true);
    toast('Notifications on. You’ll hear about status changes and new matches while Job Hunter is open.');
  },
  async disableNotifications() { ctx.data.settings.notify = false; await persist(); render(true); },
  async deleteApplication(app) { return ctx.act.deleteApplications([app]); },
  /** Removes applications (one, or a selection); emails from before today won't bring them back. */
  async deleteApplications(list) {
    const n = C.removeApplications(ctx.data, list, today());
    await persist(); render(true);
    toast(`Removed ${n} application${n === 1 ? '' : 's'}.`);
  },
  async deleteAll() {
    if (DEMO) { toast('Demo: nothing to delete.'); return; }
    if (ctx.data.settings.emailAlerts) await alertsApi('DELETE').catch(() => {}); // what the alerts server kept, too
    await guarded(() => G.deleteAllData());
    await G.signOut();
    location.href = '/';
  },
  updateNow: () => updateNow(),
  alertsStatus: () => (DEMO ? Promise.resolve({ on: ctx.data.settings.emailAlerts, email: ctx.me.email, lastRun: '' }) : alertsApi('GET')),
  gmailOn,
  /** Adds read-only Gmail access (Google shows its unverified-app screen here), then syncs. Must run from a click. */
  async connectGmail() {
    if (DEMO) { await sleep(500); demoGmail = true; drawGmailState(); render(true); toast('Demo: Gmail connected.'); return; }
    await G.connectGmail(GOOGLE_CLIENT_ID, { hint: ctx.me && ctx.me.email });
    drawGmailState(); render(true);
    if (ctx.data.settings.onboarded) updateNow();
  },
  /** A pasted email → a guess {company, role, stage, …}: rules first, then the AI if it's available. */
  async readPastedEmail(text) {
    const p = C.parsePastedEmail(text);
    if (!p.subject && !p.body) throw new Error('Paste the email’s text first.');
    const e = { id: 'paste:' + C.textHash(text), from: p.from, subject: p.subject, body: p.body, date: new Date(), link: '' };
    let guess = C.ruleClassify(e);
    if (hasAi()) {
      try {
        const out = await ask(ctx.data.settings, C.classifyPrompt([e]), true, () => {}, 'classify');
        const u = (Array.isArray(out) ? out : [])[0];
        if (u && (u.is_application_update || u.company)) guess = u;
      } catch (err) { /* keyword rules are fine */ }
    }
    return { company: guess.company || C.companyFromSender(p.from || ''), role: guess.role || '', stage: C.STATUSES.includes(guess.stage) ? guess.stage : 'Applied',
      next_step: guess.next_step || '', next_at: guess.next_at || '', next_kind: guess.next_kind || '', round: guess.round || '', channel: C.channelFromSender(p.from || ''), looksLikeOne: !!(guess.is_application_update || guess.company) };
  },
  async addFromEmail(f) {
    if (!String(f.company || '').trim()) throw new Error('Add the company name.');
    C.upsertApplication(ctx.data.applications, { company: f.company, role: f.role, stage: f.stage, next_step: f.next_step, next_at: f.next_at, next_kind: f.next_kind, round: f.round, date: C.isYmd(f.date) ? f.date : today(), channel: f.channel || 'Email' }, C.newResult());
    await persist(); render(true);
  },
});

// ---------- syncing ----------
function syncBanner(on, title, detail, frac) {
  const el = $('sync');
  el.hidden = !on;
  if (!on) return;
  if (title) $('sync-title').textContent = title;
  $('sync-detail').textContent = detail || '';
  if (frac != null) $('sync-fill').style.transform = `scaleX(${Math.max(0.04, Math.min(1, frac))})`;
}

/** Sync now (also used for the automatic sync). One tab at a time. */
/** Sync now runs everything; the schedule passes only the parts that are due ({gmail, jobs}). */
async function updateNow(parts = { gmail: true, jobs: true }) {
  const btn = () => $('sync-now');
  const work = async () => {
    if (btn()) { btn().disabled = true; setLabel(btn().lastChild, 'Syncing…'); }
    const first = !ctx.data.lastRunAt;
    const gmail = parts.gmail && G.gmailConnected();
    syncBanner(true, !gmail ? 'Looking for new jobs' : !ctx.data.gmailRunAt ? 'Loading your applications' : 'Syncing with Gmail', 'Starting…', 0.03);
    try {
      if (DEMO) { for (const [t, f] of [['Reading your application emails…', 0.3], ['Sorting emails 1–20 of 20…', 0.7], ['Checking company job boards…', 0.9]]) { syncBanner(true, null, t, f); await sleep(600); } toast('Demo sync done. Sign in to run it on your own Gmail.'); return; }
      const before = new Set(ctx.data.jobs.map(j => j.id));
      const out = await guarded(() => runUpdate(ctx.data, ctx.me.email, (t, f) => syncBanner(true, null, t, f), () => render(true), { gmail, jobs: parts.jobs, alerts: G.gmailConnected() }));
      await persist();
      render(true);
      if (!first) notifySync(ctx.data.settings, out.result, ctx.data.jobs.filter(j => !before.has(j.id)));
      const n = out.result.appsChanged.length, j = out.result.jobsNew.length;
      toast(`Synced. ${n} application update${n === 1 ? '' : 's'}, ${j} new match${j === 1 ? '' : 'es'}.` + (out.result.notes.length ? ' ' + out.result.notes[out.result.notes.length - 1] : ''));
    } catch (e) {
      toast('Sync stopped: ' + errText(e), true);
      C.addLog(ctx.data, 'Error: ' + errText(e));
    } finally {
      syncBanner(false);
      if (btn()) { btn().disabled = false; setLabel(btn().lastChild, 'Sync now'); }
    }
  };
  if (navigator.locks) {
    await navigator.locks.request('job-hunter-sync', { ifAvailable: true }, async (lock) => {
      if (!lock) { toast('A sync is already running in another tab.'); return; }
      await work();
    });
  } else await work();
}

// The schedule: on open, and every minute while the page is open, run whatever part is due (a failed try waits 10 min).
let lastAutoTry = 0;
function runScheduled() {
  if (DEMO || !ctx.data || !G.signedIn() || Date.now() - lastAutoTry < C.MIN_UPDATE_GAP_MIN * 60e3) return;
  const due = C.scheduleDue(ctx.data, new Date());
  const gmail = due.gmail && G.gmailConnected();
  if (!gmail && !due.jobs) return;
  lastAutoTry = Date.now();
  updateNow({ gmail, jobs: due.jobs });
}
setInterval(runScheduled, 60e3);

// ---------- start ----------
async function enter() {
  if (!ctx.data.settings.onboarded) {
    show('wizard');
    runWizard($('screen-wizard'), { data: ctx.data, me: ctx.me, demo: DEMO, finish: finishWizard, connectGmail: () => ctx.act.connectGmail(), gmailOn });
    return;
  }
  // Quiet applications move to the Archive even between syncs.
  if (!DEMO && C.archiveQuiet(ctx.data.applications, new Date(), ctx.data.settings.archiveDays)) persist().catch(() => {});
  show('app'); render();
  runScheduled();
  pickUpAlerts();
}

async function finishWizard(d) {
  const { cv, cvUpload } = d;
  delete d.cv; delete d.cvFile; delete d.cvUpload;
  ctx.data.settings = C.normalizeSettings(Object.assign(d, { onboarded: true }));
  if (cvUpload && !DEMO) ctx.data.cvFile = await guarded(() => G.saveCvFile(cvUpload, ctx.data.cvFile && ctx.data.cvFile.id));
  ctx.data.cv = String(cv || '').slice(0, C.MAX_CV);
  if (!ctx.data.startedOn) ctx.data.startedOn = C.ymd(new Date());
  C.addLog(ctx.data, 'Set up Job Hunter');
  await persist();
  if (ctx.data.settings.emailAlerts) await syncAlerts(false).catch(() => { ctx.data.settings.emailAlerts = false; toast('Email alerts couldn’t be turned on. Try again in Settings.', true); });
  show('app'); render();
  if (!DEMO) updateNow();
}

async function loadAccount() {
  const me = await G.profile();
  if (ctx.me && ctx.data && me.email !== ctx.me.email) { location.reload(); return false; } // switched account: start clean
  ctx.me = me;
  G.setHint(me.email);
  if (!ctx.data) ctx.data = C.normalizeData(await G.loadData());
  // A name saved letter by letter from the CV ("S A I …"): put back into words with your Google name's help.
  const tidy = C.tidyName(ctx.data.settings.name, [me.name, me.email]);
  if (tidy !== ctx.data.settings.name) { ctx.data.settings.name = tidy; persist().catch(() => {}); }
  return true;
}

async function signInFlow(btn) {
  const status = $('signin-status');
  await busy(btn, 'Signing in…', async () => {
    await G.signIn(GOOGLE_CLIENT_ID, { hint: (ctx.me && ctx.me.email) || G.lastHint() });
    if (!await loadAccount()) return;
    showReconnect(false);
    if ($('screen-app').hidden) await enter();
  }, status);
}

/** Desktop sidebar: an icon rail by default that slides out on hover; the button keeps it open. A display preference. */
function wireSidebar() {
  const shell = $('screen-app'), btn = $('side-toggle');
  const set = (collapsed) => {
    shell.classList.toggle('side-collapsed', collapsed);
    btn.setAttribute('aria-pressed', String(collapsed));
    btn.setAttribute('aria-label', collapsed ? 'Keep the sidebar open' : 'Collapse the sidebar');
    btn.title = collapsed ? 'Keep the sidebar open' : 'Collapse the sidebar';
  };
  // Collapsed is the default (it opens on hover); "Keep the sidebar open" is remembered on this device.
  let collapsed = true;
  try { collapsed = localStorage.getItem('jh-side') !== 'open'; } catch (e) { /* fine */ }
  set(collapsed);
  btn.addEventListener('click', () => {
    const collapsed = !shell.classList.contains('side-collapsed');
    set(collapsed);
    try { localStorage.setItem('jh-side', collapsed ? 'collapsed' : 'open'); } catch (e) { /* fine */ }
    if (collapsed) btn.blur(); // let it tuck away now, instead of staying open while focused
  });
}

async function boot() {
  $('reconnect-btn').addEventListener('click', () => signInFlow($('reconnect-btn')));
  wireSidebar();
  $('connect-gmail').addEventListener('click', (e) => busy(e.currentTarget, 'Connecting…', () => ctx.act.connectGmail()));
  $('sign-out').addEventListener('click', async () => {
    if (DEMO) { location.href = '/'; return; }
    await G.signOut(); location.href = '/';
  });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('/sw.js').catch(() => {});

  if (DEMO) {
    useSharedAi(async () => { throw new AiError('Demo: the AI runs once you sign in.', false); });
    $('demo-banner').hidden = false;
    ctx.me = DEMO_ME;
    ctx.data = demoData(params.get('demo') === 'setup');
    enter();
    return;
  }
  G.preload();
  G.whenSignedOutElsewhere(() => { location.href = '/'; });
  useSharedAi(sharedAi);
  G.whenSlowedDown((secs) => { if (!$('sync').hidden) syncBanner(true, null, `Gmail asked us to slow down. Carrying on in ${secs}s…`); });
  const btn = $('signin-btn');
  btn.addEventListener('click', () => signInFlow(btn));
  if (!GOOGLE_CLIENT_ID) {
    show('signin'); btn.disabled = true;
    $('signin-status').textContent = 'Not set up yet: the site owner needs to add a Google OAuth client ID in config.js (see docs/SETUP.md).';
    return;
  }
  // Reloaded within the hour, or opened in a new tab while another Job Hunter tab is signed in: carry on without a popup.
  if (G.resumeSession() || await G.fromOtherTabs()) {
    show('loading');
    try { if (await loadAccount()) { await enter(); return; } } catch (e) { /* fall through to the sign-in screen */ }
  }
  show('signin');
  // Signed in earlier in this tab: say why it's asking again (Google's sign-ins last about an hour). One click carries on.
  if (G.lastHint()) $('signin-status').textContent = `Your sign-in ended (they last about an hour). Sign in again to carry on as ${G.lastHint()}.`;
}

boot();
