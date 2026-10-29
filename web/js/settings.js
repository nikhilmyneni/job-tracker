/** Settings: the same blocks as the setup wizard, plus CV, AI keys, your data and recent activity. */
import { $, h, busy, fmtDateTime } from './ui.js';
import { youBlock, wantBlock, whereBlock, avoidBlock, routineBlock, cvBlock, aiBlock } from './onboarding.js';
import { downloadBlob } from './files.js';

const section = (title, intro, ...body) => h('section', { class: 'card set-sec' }, h('h3', { class: 'title' }, title), intro ? h('p', { class: 'note' }, intro) : '', ...body);

export function renderSettings(ctx) {
  const { data, act } = ctx;
  const s = data.settings;
  const blocks = [youBlock(s), wantBlock(s), whereBlock(s), avoidBlock(s)];
  const routine = routineBlock(s);
  const ai = aiBlock(s.ai, { demo: ctx.demo, id: 'set' });
  const cv = cvBlock(data.cv, data.cvFile, data.cvFile ? { onDownload: () => act.downloadCv() } : {});

  const prefStatus = h('div', { class: 'status', role: 'status' });
  const savePrefs = h('button', { class: 'btn', type: 'button', onclick: () => busy(savePrefs, 'Saving…', async () => {
    const d = JSON.parse(JSON.stringify(s));
    blocks.forEach(b => b.collect(d)); routine.collect(d); ai.collect(d);
    if (!d.prefs.roles.length) throw new Error('Add at least one role you want.');
    await act.saveSettings(d);
    prefStatus.className = 'status ok'; prefStatus.textContent = 'Saved ✓';
  }, prefStatus) }, 'Save preferences');

  const cvStatus = h('div', { class: 'status', role: 'status' });
  const saveCv = h('button', { class: 'btn ghost', type: 'button', onclick: () => busy(saveCv, 'Saving…', async () => {
    const d = {}; cv.collect(d);
    await act.saveCv(d.cv, d.cvUpload);
    cvStatus.className = 'status ok'; cvStatus.textContent = 'CV saved ✓';
  }, cvStatus) }, 'Save CV');

  const exportBtn = h('button', { class: 'btn ghost', type: 'button', onclick: () => {
    const copy = JSON.parse(JSON.stringify(data));
    copy.settings.ai = copy.settings.ai.map(a => ({ provider: a.provider, model: a.model, key: '(not exported)' }));
    downloadBlob(new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' }), 'job-tracker-export.json');
  } }, 'Export my data (.json)');
  const delBtn = h('button', { class: 'btn danger', type: 'button', onclick: () => {
    if (!confirm('Delete everything Job Tracker saved in your Google Drive (applications, jobs, CV, settings, keys)? This can’t be undone.')) return;
    busy(delBtn, 'Deleting…', () => act.deleteAll());
  } }, 'Delete all my data');

  $('settings-body').replaceChildren(
    h('div', { class: 'cols2' },
      section('About you and the jobs you want', 'Used to score job matches.', ...blocks.map(b => b.el)),
      h('div', { class: 'stack' },
        section('Your CV', 'Upload a new file or edit the text.', cv.el, h('div', { class: 'controls' }, saveCv), cvStatus),
        section('Routine', '', routine.el))),
    section('AI (free keys)', 'Used to sort emails, match jobs and write resumes.', ai.el),
    h('div', { class: 'controls sticky-save' }, savePrefs, prefStatus),
    h('div', { class: 'cols2' },
      section('Your data', `Stored in a private app folder in ${ctx.me ? ctx.me.email + '’s' : 'your'} Google Drive. Only Job Tracker can see it.`,
        h('div', { class: 'controls' }, exportBtn, delBtn)),
      section('Recent activity', '', h('ul', { class: 'log' }, ...(data.log.length ? data.log.slice(0, 15) : [{ at: '', msg: 'Nothing yet.' }])
        .map(l => h('li', {}, l.at ? fmtDateTime(l.at) + ': ' : '', l.msg))))));
}

