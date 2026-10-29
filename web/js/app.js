/** Job Tracker: boot, sign-in, and every action that changes your data (then saves it to your Drive). */
import { GOOGLE_CLIENT_ID } from '../config.js';
import * as C from './core.js';
import * as G from './google.js';
import { runUpdate, writeResume } from './update.js';
import { hasAi, PROVIDERS } from './ai.js';
import { $, h, busy, toast, errText, fmtDateTime } from './ui.js';
import { renderDashboard, wireDashboard } from './dashboard.js';
import { runWizard } from './onboarding.js';
import { renderSettings } from './settings.js';
import { openResume, wireResumeView } from './resume-view.js';
import { demoData, DEMO_ME, DEMO_RESUME } from './demo.js';
import { downloadBlob } from './files.js';

const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const ctx = {
  data: null, me: null, demo: DEMO, act: {},
  canWrite: () => hasAi(ctx.data.settings) && !!ctx.data.cv,
};

// ---------- screens ----------
function show(name) {
  ['signin', 'wizard', 'app'].forEach(n => { $('screen-' + n).hidden = n !== name; });
  $('topbar-app').hidden = name !== 'app';
  $('account').hidden = !ctx.me;
  if (ctx.me) { $('account-name').textContent = ctx.me.email; $('account-initial').textContent = (ctx.me.name || ctx.me.email || '?').trim().charAt(0).toUpperCase(); }
}

function showTab(tab) {
  $('view-dashboard').hidden = tab !== 'dashboard';
  $('view-settings').hidden = tab !== 'settings';
  document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-current', String(b.dataset.tab === tab)));
  if (tab === 'settings') renderSettings(ctx);
  window.scrollTo(0, 0);
}

function renderMeta() {
  const s = ctx.data.settings, d = ctx.data;
  const ai = C.normalizeSettings(s).ai.map(a => PROVIDERS[a.provider].label);
  $('meta').textContent = [
    d.lastRunAt ? `Last update ${fmtDateTime(d.lastRunAt)}` : 'Not updated yet',
    s.autoUpdateHours ? `updates by itself every ${s.autoUpdateHours}h while open` : 'updates when you click',
    ai.length ? `AI: ${ai.join(' → ')}` : 'AI off (keyword rules)',
  ].join(' · ');
}

function renderAll() {
  renderMeta();
  renderDashboard(ctx);
  if (!$('view-settings').hidden) renderSettings(ctx);
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
    ctx.data.settings = C.normalizeSettings(Object.assign({}, d, { onboarded: true }));
    await persist(); renderAll();
  },
  async saveCv(text, file) {
    if (file && !DEMO) ctx.data.cvFile = await guarded(() => G.saveCvFile(file, ctx.data.cvFile && ctx.data.cvFile.id));
    else if (file) ctx.data.cvFile = { id: 'demo', name: file.name, mime: file.type, size: file.size, at: new Date().toISOString() };
    ctx.data.cv = String(text || '').slice(0, C.MAX_CV);
    await persist(); renderAll();
  },
  async downloadCv() {
    const f = ctx.data.cvFile;
    if (!f) return;
    if (DEMO) { toast('Demo: no real file to download.'); return; }
    try { downloadBlob(await guarded(() => G.downloadFile(f.id)), f.name); } catch (e) { toast(errText(e), true); }
  },
  async getResume(job, regenerate, report) {
    if (job.resume && !regenerate) return job.resume;
    let r;
    if (DEMO) { await sleep(900); r = DEMO_RESUME; } else {
      if (!hasAi(ctx.data.settings)) throw new Error('Add a free AI key in Settings first.');
      if (!ctx.data.cv) throw new Error('Add your CV in Settings first.');
      r = await writeResume(ctx.data, job, report);
    }
    job.resume = r; job.resume_at = new Date().toISOString();
    await persist(); renderDashboard(ctx);
    return r;
  },
  openResume(job) { return openResume(job, ctx); },
  async saveResumeEdits(job, r) { job.resume = r; job.resume_at = new Date().toISOString(); await persist(); },
  async setJobStatus(job, status) {
    job.status = status;
    if (status === 'Applied') C.upsertApplication(ctx.data.applications, { company: job.company, role: job.role, stage: 'Applied', date: today(), channel: 'Recommended job', link: job.link }, C.newResult());
    await persist(); renderAll();
  },
  async addApplication(a) {
    if (!String(a.company || '').trim()) throw new Error('Company is needed.');
    C.upsertApplication(ctx.data.applications, { company: a.company, role: a.role, stage: 'Applied', date: C.isYmd(a.applied_on) ? a.applied_on : today(), channel: String(a.channel || '').trim().slice(0, 40) || 'Company site' }, C.newResult());
    await persist(); renderAll();
  },
  async setApplicationStatus(app, status) { C.setApplicationStatus(app, status, today()); await persist(); renderAll(); },
  async deleteApplication(app) { ctx.data.applications = ctx.data.applications.filter(a => a !== app); await persist(); renderAll(); },
  async deleteAll() {
    if (DEMO) { toast('Demo: nothing to delete.'); return; }
    await guarded(() => G.deleteAllData());
    await G.signOut();
    location.reload();
  },
});

/** Update now (also used for the automatic update). One tab at a time. */
async function updateNow() {
  const btn = $('update-now'), status = $('update-status');
  const work = async () => {
    btn.disabled = true; status.className = 'status'; status.hidden = false;
    try {
      if (DEMO) { status.textContent = 'Demo: reading Gmail…'; await sleep(900); status.textContent = 'Demo update done. Sign in to run it on your own Gmail.'; return; }
      const out = await guarded(() => runUpdate(ctx.data, ctx.me.email, (t) => { status.textContent = t; }));
      await persist();
      renderAll();
      status.className = 'status ok';
      status.textContent = `Done. ${out.result.appsChanged.length} application update${out.result.appsChanged.length === 1 ? '' : 's'}, ${out.result.jobsNew.length} new job${out.result.jobsNew.length === 1 ? '' : 's'}.` +
        (out.result.notes.length ? ' ' + out.result.notes[out.result.notes.length - 1] : '');
    } catch (e) {
      status.className = 'status err'; status.textContent = 'Update stopped: ' + errText(e);
      C.addLog(ctx.data, 'Error: ' + errText(e));
    } finally { btn.disabled = false; }
  };
  if (navigator.locks) {
    await navigator.locks.request('job-tracker-update', { ifAvailable: true }, async (lock) => {
      if (!lock) { status.hidden = false; status.textContent = 'An update is already running in another tab.'; return; }
      await work();
    });
  } else await work();
}

// ---------- start ----------
async function enter() {
  if (!ctx.data.settings.onboarded) {
    show('wizard');
    runWizard($('screen-wizard'), { data: ctx.data, me: ctx.me, demo: DEMO, finish: finishWizard });
    return;
  }
  show('app'); showTab('dashboard'); renderAll();
  if (!DEMO && C.autoUpdateDue(ctx.data, new Date())) updateNow();
}

async function finishWizard(d) {
  const { cv, cvUpload } = d;
  delete d.cv; delete d.cvFile; delete d.cvUpload;
  ctx.data.settings = C.normalizeSettings(Object.assign(d, { onboarded: true }));
  if (cvUpload && !DEMO) ctx.data.cvFile = await guarded(() => G.saveCvFile(cvUpload, ctx.data.cvFile && ctx.data.cvFile.id));
  ctx.data.cv = String(cv || '').slice(0, C.MAX_CV);
  C.addLog(ctx.data, 'Set up Job Tracker');
  await persist();
  show('app'); showTab('dashboard'); renderAll();
  if (!DEMO) updateNow();
}

async function signInFlow(btn) {
  const status = $('signin-status');
  await busy(btn, 'Signing in…', async () => {
    await G.signIn(GOOGLE_CLIENT_ID, { hint: ctx.me && ctx.me.email });
    const me = await G.profile();
    if (ctx.me && ctx.data && me.email !== ctx.me.email) { location.reload(); return; } // switched account: start clean
    ctx.me = me;
    if (!ctx.data) ctx.data = C.normalizeData(await G.loadData());
    showReconnect(false);
    await enter();
  }, status);
}

function boot() {
  wireDashboard(ctx);
  wireResumeView();
  document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('update-now').addEventListener('click', updateNow);
  $('reconnect-btn').addEventListener('click', () => signInFlow($('reconnect-btn')));
  $('sign-out').addEventListener('click', async () => {
    if (DEMO) { location.href = location.pathname; return; }
    await G.signOut(); location.reload();
  });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});

  if (DEMO) {
    $('demo-banner').hidden = false;
    ctx.me = DEMO_ME;
    ctx.data = demoData(params.get('demo') === 'setup');
    enter();
    return;
  }
  show('signin');
  G.preload();
  const btn = $('signin-btn');
  if (!GOOGLE_CLIENT_ID) {
    btn.disabled = true;
    $('signin-status').textContent = 'Not set up yet: the site owner needs to add a Google OAuth client ID in config.js (see docs/SETUP.md).';
    return;
  }
  btn.addEventListener('click', () => signInFlow(btn));
}

boot();
