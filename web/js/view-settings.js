/** Profile and CV (who you are and what you want) and Settings (routine, job sources, notifications, your data). */
import { h, busy, pageHead, holdButton, fmtDateTime, chipInput, toast, errText } from './ui.js';
import { mySkills, cvSections, SKILL_VOCAB } from './core.js';
import { youBlock, wantBlock, whereBlock, avoidBlock, routineBlock, cvBlock, companiesBlock } from './onboarding.js';
import { downloadBlob } from './files.js';
import { notifySupported, notifyAllowed } from './notify.js';

const panel = (title, intro, ...body) => h('section', { class: 'panel' }, h('h2', { class: 'panel-title' }, title), intro ? h('p', { class: 'panel-sub' }, intro) : '', ...body);

function saveBar(label, collect, ctx) {
  const status = h('div', { class: 'status', role: 'status' });
  const btn = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => busy(btn, 'Saving…', async () => {
    const d = JSON.parse(JSON.stringify(ctx.data.settings));
    collect(d);
    if (!d.prefs.roles.length) throw new Error('Add at least one role you want.');
    await ctx.act.saveSettings(d);
    toast('Saved');
  }) }, label); // no status line: the screen redraws on save, so busy() shows errors as a toast
  return h('div', { class: 'save-bar' }, btn, status);
}

export function renderProfile(ctx, root) {
  const { data, act } = ctx;
  const s = data.settings;
  const blocks = [youBlock(s), wantBlock(s), whereBlock(s), avoidBlock(s)];
  const cv = cvBlock(data.cv, data.cvFile, data.cvFile ? { onDownload: () => act.downloadCv() } : {});
  const cvStatus = h('div', { class: 'status', role: 'status' });
  const saveCv = h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => busy(saveCv, 'Saving…', async () => {
    const d = {}; cv.collect(d);
    await act.saveCv(d.cv, d.cvUpload);
    cvStatus.className = 'status ok'; cvStatus.textContent = 'CV saved';
  }, cvStatus) }, 'Save CV');
  root.replaceChildren(pageHead('Profile and CV', 'Used to score openings and to tailor resumes'),
    h('div', { class: 'cols' },
      panel('About you and the jobs you want', '', ...blocks.map(b => b.el), saveBar('Save preferences', (d) => blocks.forEach(b => b.collect(d)), ctx)),
      h('div', { class: 'stack-lg' },
        skillsPanel(ctx),
        panel('Your CV', 'Your default CV. Resumes are only ever built from this text.', cv.el, h('div', { class: 'save-bar' }, saveCv, cvStatus)),
        sectionsPanel(data.cv))));
}

export function renderSettings(ctx, root) {
  const { data, act } = ctx;
  const s = data.settings;
  const routine = routineBlock(s, { email: ctx.me && ctx.me.email }), companies = companiesBlock(s.companies, { demo: ctx.demo });
  const exportBtn = h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => {
    const copy = JSON.parse(JSON.stringify(data));
    downloadBlob(new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' }), 'job-hunter-export.json');
  } }, 'Export my data (.json)');
  const del = holdButton('Hold to delete all my data', () => act.deleteAll(), { done: 'Deleting…' });
  del.classList.add('btn-danger');
  root.replaceChildren(pageHead('Settings', ''),
    h('div', { class: 'cols' },
      h('div', { class: 'stack-lg' },
        panel('Routine', 'When your Gmail sync and job search run on their own, and what they bring.', routine.el, saveBar('Save routine', (d) => routine.collect(d), ctx)),
        panel('Companies to follow', 'Their open jobs are checked on every sync, alongside your job-alert emails.', companies.el, saveBar('Save companies', (d) => companies.collect(d), ctx))),
      h('div', { class: 'stack-lg' },
        notifyPanel(ctx),
        panel('Your data', `Saved in a hidden app folder in ${ctx.me ? ctx.me.email + '’s' : 'your'} Google Drive. Only Job Hunter can open it.`,
          h('div', { class: 'row' }, exportBtn, del)),
        panel('Recent activity', '', h('ul', { class: 'log' }, ...(data.log.length ? data.log.slice(0, 12) : [{ at: '', msg: 'Nothing yet.' }])
          .map(l => h('li', {}, l.at ? h('time', {}, fmtDateTime(l.at)) : '', h('span', {}, l.msg))))))));
}

function notifyPanel(ctx) {
  const { data, act } = ctx;
  const on = data.settings.notify && notifyAllowed();
  const status = h('div', { class: 'status', role: 'status' });
  const btn = h('button', { type: 'button', class: on ? 'btn btn-quiet' : 'btn btn-primary', onclick: () => busy(btn, on ? 'Turning off…' : 'Asking…', () => (on ? act.disableNotifications() : act.enableNotifications()), status) },
    on ? 'Turn off notifications' : 'Turn on notifications');
  const alerts = h('p', { class: 'hint' });
  if (data.settings.emailAlerts) {
    alerts.textContent = 'Email alerts: on.';
    act.alertsStatus().then(r => { alerts.textContent = r.on ? `Email alerts: on, to ${r.email}${r.lastRun ? `. Last looked on ${r.lastRun}` : ''}.` : 'Email alerts: off.'; }).catch(() => {});
  } else alerts.textContent = 'Email alerts: off. Turn them on in Routine.';
  return panel('Notifications', notifySupported()
    ? (on ? 'On. You’ll get one when an application changes status or new matches arrive, while Job Hunter is open.' : 'Get one when an application changes status or new matches arrive, while Job Hunter is open (a tab, or the installed app).')
    : 'This browser can’t show notifications.', notifySupported() ? h('div', { class: 'save-bar' }, btn, status) : '', alerts);
}

/** The skills matching uses: read from your CV; add ones it missed, remove ones that aren't really yours. */
function skillsPanel(ctx) {
  let t;
  const chips = chipInput(mySkills(ctx.data), { placeholder: '+ add a skill', label: 'Your skills', max: 60,
    search: (q, have) => { const x = q.trim().toLowerCase(); return x ? SKILL_VOCAB.filter(v => v.toLowerCase().includes(x) && !have.some(hv => hv.toLowerCase() === v.toLowerCase())).slice(0, 8) : []; },
    onChange: (list) => { clearTimeout(t); t = setTimeout(() => ctx.act.saveSkills(list).catch(e => toast(errText(e), true)), 600); } });
  return panel('Your skills', 'Read from your CV and used to score every opening. Add any it missed; remove any that aren’t really yours.', chips.el);
}

/** What was read under each heading of the CV, so you can see it was understood. */
function sectionsPanel(cv) {
  const sec = cvSections(cv);
  const names = { summary: 'Summary', education: 'Education', experience: 'Experience', projects: 'Projects', skills: 'Skills', certifications: 'Certifications', leadership: 'Leadership and activities' };
  const found = Object.keys(names).filter(k => sec[k].length);
  if (!cv) return '';
  return panel('What we read from your CV', found.length ? 'Each heading we found, with what’s under it.' : 'No headings found. Headings like Education, Projects and Skills help.',
    ...found.map(k => h('details', { class: 'cv-sec' }, h('summary', {}, names[k], h('span', { class: 'col-count' }, sec[k].length)),
      h('ul', {}, ...sec[k].slice(0, 30).map(l => h('li', {}, l))))));
}
