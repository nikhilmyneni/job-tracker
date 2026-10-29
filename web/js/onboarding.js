/**
 * First-run setup: one question per step. The same field blocks make up the Preferences part of Settings.
 */
import { h, chipInput, segmented, busy, errText, extLink } from './ui.js';
import { LEVELS, JOB_TYPES, JOBS_PER_UPDATE, AUTO_UPDATE_HOURS, SINCE_DAYS } from './core.js';
import { PROVIDERS, listModels } from './ai.js';
import { readCvFile, CV_ACCEPT } from './files.js';

const ROLE_SUGGESTIONS = ['SOC Analyst', 'Security Analyst', 'Penetration Tester', 'Cloud Security', 'Security Engineer', 'GRC Analyst', 'Network Engineer', 'Software Developer'];
const PLACE_SUGGESTIONS = ['Hyderabad', 'Bengaluru', 'Pune', 'Chennai', 'Mumbai', 'Delhi NCR', 'Remote', 'Anywhere in India'];
const AVOID_SUGGESTIONS = ['Sales', 'Telecalling', 'Unpaid internships', 'Training institutes that charge fees', 'Night shifts', 'Bond / service agreement'];
const autoLabel = (n) => (n ? `Every ${n} hours` : 'Only when I click');

const field = (label, control, hint) => h('label', { class: 'field' }, h('span', { class: 'field-lbl' }, label), control, hint ? h('span', { class: 'hint' }, hint) : '');
const check = (checked, text) => { const i = h('input', { type: 'checkbox', checked }); return { el: h('label', { class: 'inline' }, i, ' ', text), get: () => i.checked }; };

// ---------- field blocks (each returns {el, collect(draft)}) ----------
export function youBlock(s) {
  const name = h('input', { type: 'text', value: s.name, autocomplete: 'name', maxLength: 80 });
  const city = h('input', { type: 'text', value: s.city, placeholder: 'e.g. Hyderabad', maxLength: 60 });
  return {
    el: h('div', { class: 'stack' }, field('Your name', name), field('Where you live now', city)),
    collect: (d) => { d.name = name.value.trim(); d.city = city.value.trim(); },
  };
}

export function wantBlock(s) {
  const roles = chipInput(s.prefs.roles, { placeholder: 'Add a role and press Enter', suggestions: ROLE_SUGGESTIONS, label: 'Target roles' });
  const level = segmented(LEVELS, s.prefs.level, 'Level');
  const type = segmented(JOB_TYPES, s.prefs.jobType, 'Job type');
  const paid = check(s.prefs.paidOnly, 'Paid roles only');
  const minPay = h('input', { type: 'text', value: s.prefs.minPay, placeholder: 'e.g. 3 LPA or ₹15,000/month (optional)', maxLength: 40 });
  return {
    el: h('div', { class: 'stack' }, field('Roles you want', roles.el, 'Pick a few, or type your own.'),
      field('Level', level.el), field('Job type', type.el), paid.el, field('Minimum pay', minPay)),
    collect: (d) => Object.assign(d.prefs, { roles: roles.get(), level: level.get(), jobType: type.get(), paidOnly: paid.get(), minPay: minPay.value.trim() }),
  };
}

export function whereBlock(s) {
  const places = chipInput(s.prefs.locations, { placeholder: 'Add a city and press Enter', suggestions: PLACE_SUGGESTIONS, label: 'Locations' });
  const relocate = check(s.prefs.relocate, 'Open to relocating for the right job');
  return {
    el: h('div', { class: 'stack' }, field('Preferred locations, most wanted first', places.el), relocate.el),
    collect: (d) => Object.assign(d.prefs, { locations: places.get(), relocate: relocate.get() }),
  };
}

export function avoidBlock(s) {
  const avoid = chipInput(s.prefs.avoid, { placeholder: 'Add something to skip', suggestions: AVOID_SUGGESTIONS, label: 'Skip list', max: 15 });
  return {
    el: h('div', { class: 'stack' }, field('Jobs with these get skipped', avoid.el)),
    collect: (d) => { d.prefs.avoid = avoid.get(); },
  };
}

export function routineBlock(s) {
  const jobs = segmented(Object.fromEntries(JOBS_PER_UPDATE.map(n => [n, n ? String(n) : 'Off'])), s.jobsPerUpdate, 'New jobs per update');
  const auto = segmented(Object.fromEntries(AUTO_UPDATE_HOURS.map(n => [n, autoLabel(n)])), s.autoUpdateHours, 'Auto update');
  const since = segmented(Object.fromEntries(SINCE_DAYS.map(n => [n, `${n} days`])), s.sinceDays, 'First search');
  return {
    el: h('div', { class: 'stack' },
      field('New job matches per update', jobs.el),
      field('Update automatically when I open the app', auto.el, 'Job Tracker has no server, so it updates while it’s open.'),
      field('First time, look back through Gmail for', since.el)),
    collect: (d) => { d.jobsPerUpdate = Number(jobs.get()); d.autoUpdateHours = Number(auto.get()); d.sinceDays = Number(since.get()); },
  };
}

/** CV: upload a file or paste text. collect sets d.cv and d.cvUpload (the File, if a new one was picked). */
export function cvBlock(cvText, cvFile, opts = {}) {
  const ta = h('textarea', { spellcheck: false, placeholder: 'Paste your CV text here, or upload a file above.' });
  ta.value = cvText || '';
  const status = h('div', { class: 'status', role: 'status' });
  let picked = null;
  const input = h('input', { type: 'file', accept: CV_ACCEPT, class: 'visually-hidden', id: 'cv-file-' + Math.random().toString(36).slice(2, 7) });
  input.addEventListener('change', async () => {
    const f = input.files[0];
    if (!f) return;
    status.className = 'status'; status.textContent = `Reading ${f.name}…`;
    try {
      const { text, warning } = await readCvFile(f);
      ta.value = text; picked = f;
      status.className = warning ? 'status warn' : 'status';
      status.textContent = warning || `Read ${f.name}. Check the text below and fix anything that came out wrong.`;
    } catch (e) { status.className = 'status err'; status.textContent = errText(e); }
    input.value = '';
  });
  const existing = cvFile ? h('span', { class: 'hint' }, `Saved file: ${cvFile.name}`, opts.onDownload ? [' · ', h('button', { type: 'button', class: 'link', onclick: opts.onDownload }, 'Download')] : '') : '';
  return {
    el: h('div', { class: 'stack' },
      h('div', { class: 'upload' }, h('label', { class: 'btn ghost', for: input.id }, 'Upload CV (PDF, Word or .txt)'), input, existing),
      status, ta,
      h('p', { class: 'hint' }, 'Resumes are written only from this text. Nothing is made up.')),
    collect: (d) => { d.cv = ta.value.trim(); d.cvUpload = picked || d.cvUpload || null; },
    textarea: ta,
  };
}

/** AI keys. Shows the saved ones masked; "Test key" lists the models the key can use right now. */
export function aiBlock(aiList, opts = {}) {
  const byProvider = Object.fromEntries((aiList || []).map(a => [a.provider, a]));
  const order = Object.keys(PROVIDERS);
  const firstPick = (aiList && aiList[0] && aiList[0].provider) || 'gemini';
  const rows = order.map(p => {
    const info = PROVIDERS[p], saved = byProvider[p];
    const key = h('input', { type: 'password', autocomplete: 'off', placeholder: saved ? `Saved (…${saved.key.slice(-4)}). Leave empty to keep it` : 'Paste your free key', 'aria-label': info.label + ' key' });
    const model = h('select', { 'aria-label': info.label + ' model' });
    const setModels = (list, sel) => {
      const cur = sel || model.value || (saved && saved.model) || info.defaultModel;
      const all = [...new Set([cur, ...list].filter(Boolean))];
      model.replaceChildren(...(all.length ? all : ['']).map(m => h('option', { value: m, selected: m === cur }, m || 'Test your key to pick a model')));
    };
    setModels([]);
    const status = h('span', { class: 'status' });
    const test = h('button', { type: 'button', class: 'btn ghost small', onclick: () => busy(test, 'Testing…', async () => {
      const k = key.value.trim() || (saved && saved.key);
      if (!k) throw new Error('Paste a key first.');
      const models = opts.demo ? [info.defaultModel || 'demo-model:free', 'demo-model-2'] : await listModels(p, k);
      if (!models.length) throw new Error('This key works, but no usable models came back.');
      setModels(models, models.includes(model.value) ? model.value : (models.includes(info.defaultModel) ? info.defaultModel : models[0]));
      status.className = 'status ok'; status.textContent = `Key works ✓ ${models.length} models`;
    }, status) }, 'Test key');
    const first = h('input', { type: 'radio', name: 'ai-first-' + (opts.id || 'x'), value: p, checked: p === firstPick });
    const remove = saved ? h('button', { type: 'button', class: 'link', onclick: () => { byProvider[p] = null; key.value = ''; key.placeholder = 'Removed. Paste a key to add it back'; } }, 'Remove key') : '';
    return {
      p, first,
      el: h('div', { class: 'ai-row' + (p === 'gemini' ? ' recommended' : '') },
        h('div', { class: 'ai-head' }, h('b', {}, info.label), p === 'gemini' ? h('span', { class: 'pill s-New' }, 'Recommended') : '',
          h('label', { class: 'inline small' }, first, ' Try first')),
        h('p', { class: 'hint' }, info.note, ' Get a key: ', extLink(info.keyUrl, info.keyHint)),
        h('div', { class: 'ai-ctl' }, key, model, test), status, remove),
      collect: () => {
        const k = key.value.trim() || (byProvider[p] && byProvider[p].key) || '';
        return k ? { provider: p, key: k, model: model.value || info.defaultModel } : null;
      },
    };
  });
  return {
    el: h('div', { class: 'stack' }, ...rows.map(r => r.el),
      h('p', { class: 'hint' }, 'Add one key, or more as backups: when one runs out of free quota, the next is used. Keys stay in your own Google Drive and go only to that provider.')),
    collect: (d) => {
      const list = rows.map(r => r.collect()).filter(Boolean);
      const firstP = (rows.find(r => r.first.checked) || {}).p;
      d.ai = list.sort((a, b) => (b.provider === firstP) - (a.provider === firstP));
    },
  };
}

// ---------- the wizard ----------
const STEPS = [
  { title: 'Hi! Let’s set up your job search', intro: 'Seven quick questions. You can change any answer later in Settings.', block: (d) => youBlock(d) },
  { title: 'What are you looking for?', block: (d) => wantBlock(d) },
  { title: 'Where would you like to work?', block: (d) => whereBlock(d) },
  { title: 'Anything to skip?', intro: 'Matching jobs with these are left out.', block: (d) => avoidBlock(d) },
  { title: 'Add your CV', intro: 'Upload your CV or paste its text. It’s used to score jobs and write tailored resumes.', block: (d) => cvBlock(d.cv, d.cvFile) },
  { title: 'Turn on AI (free, optional)', intro: 'With a free AI key, Job Tracker sorts your emails more accurately, finds job matches and writes tailored resumes. Without one, it still tracks applications using keyword rules.', block: (d, ctx) => aiBlock(d.ai, { demo: ctx.demo, id: 'wiz' }) },
  { title: 'Your routine', block: (d) => routineBlock(d) },
];

/** Renders the wizard into root. ctx.finish(draft) saves and starts the app. */
export function runWizard(root, ctx) {
  const d = JSON.parse(JSON.stringify(ctx.data.settings));
  d.cv = ctx.data.cv; d.cvFile = ctx.data.cvFile; d.cvUpload = null;
  if (!d.name && ctx.me && ctx.me.name) d.name = ctx.me.name;
  let i = 0, cur = null;
  const total = STEPS.length + 1;
  const draw = () => {
    const done = i === STEPS.length;
    const back = h('button', { type: 'button', class: 'btn ghost', disabled: i === 0, onclick: () => { if (cur) cur.collect(d); i--; draw(); } }, 'Back');
    const status = h('div', { class: 'status', role: 'status' });
    let body, next;
    if (!done) {
      const st = STEPS[i];
      cur = st.block(d, ctx);
      body = [h('h1', { class: 'wiz-title', tabIndex: -1 }, st.title), st.intro ? h('p', { class: 'wiz-intro' }, st.intro) : '', cur.el];
      next = h('button', { type: 'button', class: 'btn', onclick: () => {
        cur.collect(d);
        if (i === 1 && !d.prefs.roles.length) { status.className = 'status err'; status.textContent = 'Add at least one role you want.'; return; }
        i++; draw();
      } }, i === 5 && !(d.ai || []).length ? 'Skip for now' : 'Next');
      if (i === 5) cur.el.addEventListener('input', () => { next.textContent = 'Next'; });
    } else {
      cur = null;
      const p = d.prefs;
      const row = (k, v) => h('div', { class: 'sum-row' }, h('span', {}, k), h('b', {}, v || '—'));
      body = [h('h1', { class: 'wiz-title', tabIndex: -1 }, 'All set. Here’s your plan'),
        h('div', { class: 'card sum' },
          row('Roles', p.roles.join(', ')), row('Level', LEVELS[p.level]), row('Job type', JOB_TYPES[p.jobType]),
          row('Pay', (p.paidOnly ? 'Paid only' : 'Unpaid OK') + (p.minPay ? `, at least ${p.minPay}` : '')),
          row('Locations', p.locations.join(', ') + (p.relocate ? ' · open to relocating' : '')),
          row('Skip', p.avoid.join(', ')), row('CV', d.cv ? `${d.cv.length.toLocaleString()} characters${d.cvUpload ? ' · ' + d.cvUpload.name : ''}` : 'Not added yet'),
          row('AI', (d.ai || []).length ? d.ai.map(a => PROVIDERS[a.provider].label).join(' → ') : 'Off (keyword rules only)'),
          row('Updates', `${autoLabel(d.autoUpdateHours)} · ${d.jobsPerUpdate || 'no'} new jobs each time`)),
        h('p', { class: 'hint' }, 'Start reads your Gmail (read-only) from the last ' + d.sinceDays + ' days. That can take a minute.')];
      next = h('button', { type: 'button', class: 'btn', onclick: () => busy(next, 'Saving…', () => ctx.finish(d), status) }, 'Start');
    }
    root.replaceChildren(h('div', { class: 'wizard' },
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 1, 'aria-valuemax': total, 'aria-valuenow': i + 1 },
        h('div', { class: 'progress-bar' })),
      h('div', { class: 'step-count' }, `Step ${i + 1} of ${total}`),
      ...body, status, h('div', { class: 'wiz-nav' }, back, next)));
    root.querySelector('.progress-bar').style.width = ((i + 1) / total * 100) + '%';
    const t = root.querySelector('.wiz-title'); if (t) t.focus();
  };
  draw();
}
