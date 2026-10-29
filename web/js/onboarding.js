/**
 * First-run setup: one question per step. The same field blocks make up the Preferences part of Settings.
 */
import { h, chipInput, segmented, busy, errText, extLink, icon } from './ui.js';
import { LEVELS, JOB_TYPES, JOBS_PER_UPDATE, AUTO_UPDATE_HOURS, SINCE_DAYS, ATS, COMPANY_SUGGESTIONS, companyKey, normalizeCompany, parseCareerUrl, placeMatches, profileFromCv, applyCvProfile } from './core.js';
import { fetchBoard } from './sources.js';
import { readCvFile, CV_ACCEPT } from './files.js';

const ROLE_SUGGESTIONS = ['SOC Analyst', 'Security Analyst', 'Penetration Tester', 'Cloud Security', 'Security Engineer', 'GRC Analyst', 'Network Engineer', 'Software Developer'];
const PLACE_SUGGESTIONS = ['Hyderabad', 'Bengaluru', 'Pune', 'Chennai', 'Mumbai', 'Delhi NCR', 'Remote', 'Anywhere in India'];
const AVOID_SUGGESTIONS = ['Sales', 'Telecalling', 'Unpaid internships', 'Training institutes that charge fees', 'Night shifts', 'Bond / service agreement'];
const autoLabel = (n) => (n ? `On sign-in, then every ${n}h` : 'Only when I click');

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

export function wantBlock(s, fromCv = []) {
  const roles = chipInput(s.prefs.roles, { placeholder: 'Add a role and press Enter', suggestions: [...new Set([...fromCv, ...ROLE_SUGGESTIONS])], label: 'Target roles' });
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
  const places = chipInput(s.prefs.locations, { placeholder: 'Start typing a city', suggestions: PLACE_SUGGESTIONS, label: 'Locations', search: (q, have) => placeMatches(q, have) });
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
      field('Sync with Gmail', auto.el, 'Syncs as soon as you sign in, then again while the page stays open.'),
      field('First time, look back through Gmail for', since.el)),
    collect: (d) => { d.jobsPerUpdate = Number(jobs.get()); d.autoUpdateHours = Number(auto.get()); d.sinceDays = Number(since.get()); },
  };
}

/**
 * CV: drop a file on the zone (it leans toward the file as you drag, like kitchen's "Magnetic Drop Zone"),
 * browse for one, or paste the text. collect sets d.cv and d.cvUpload (the File, if new).
 * opts.onRead(text) runs after a file is read, so the wizard can fill in the next questions.
 */
export function cvBlock(cvText, cvFile, opts = {}) {
  const ta = h('textarea', { spellcheck: false, placeholder: 'Or paste your CV text here.', 'aria-label': 'CV text' });
  ta.value = cvText || '';
  const status = h('div', { class: 'status', role: 'status' });
  let picked = null;
  const input = h('input', { type: 'file', accept: CV_ACCEPT, class: 'visually-hidden', id: 'cv-file-' + Math.random().toString(36).slice(2, 7) });
  const read = async (f) => {
    if (!f) return;
    status.className = 'status'; status.textContent = `Reading ${f.name}…`;
    try {
      const { text, warning } = await readCvFile(f);
      ta.value = text; picked = f;
      fileLine.replaceChildren(icon('file'), h('span', {}, h('b', {}, f.name), ` · ${Math.max(1, Math.round(f.size / 1024))} KB`));
      fileLine.hidden = false;
      status.className = warning ? 'status warn' : 'status ok';
      status.textContent = warning || 'Read it. Check the text below and fix anything that came out wrong.';
      paste.open = true;
      if (opts.onRead) opts.onRead(text);
    } catch (e) { status.className = 'status err'; status.textContent = errText(e); }
  };
  input.addEventListener('change', () => { read(input.files[0]); input.value = ''; });

  const zone = h('div', { class: 'drop' },
    icon('upload'),
    h('p', { class: 'drop-title' }, 'Drop your CV here'),
    h('p', { class: 'drop-sub' }, 'PDF, Word (.docx) or .txt, up to 5 MB. It’s read in your browser.'),
    h('label', { class: 'btn btn-primary', for: input.id }, 'Choose a file'),
    input);
  // Magnetic pull: the zone leans a few pixels toward the dragged file and lights up.
  let depth = 0;
  const lean = (e) => {
    const r = zone.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / r.width, dy = (e.clientY - (r.top + r.height / 2)) / r.height;
    zone.style.setProperty('--dx', (dx * 10).toFixed(1) + 'px'); zone.style.setProperty('--dy', (dy * 10).toFixed(1) + 'px');
  };
  zone.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; zone.classList.add('over'); });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; lean(e); });
  zone.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; zone.classList.remove('over'); } });
  zone.addEventListener('drop', (e) => { e.preventDefault(); depth = 0; zone.classList.remove('over'); read(e.dataTransfer.files[0]); });

  const fileLine = h('p', { class: 'file-line', hidden: true });
  if (cvFile) {
    fileLine.replaceChildren(icon('file'), h('span', {}, 'Saved file: ', h('b', {}, cvFile.name)),
      opts.onDownload ? h('button', { type: 'button', class: 'link', onclick: opts.onDownload }, 'Download') : '');
    fileLine.hidden = false;
  }
  const paste = h('details', { class: 'paste', open: !!ta.value && !cvFile }, h('summary', {}, 'Check or edit the text'), ta);
  return {
    el: h('div', { class: 'stack' }, zone, fileLine, status, paste,
      h('p', { class: 'hint' }, 'Resumes are only ever built from this text. Nothing is made up.')),
    collect: (d) => { d.cv = ta.value.trim(); d.cvUpload = picked || d.cvUpload || null; },
    textarea: ta,
    open: () => { paste.open = true; },
  };
}

/**
 * Companies to follow: paste a careers-page link (Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee
 * or Workday), or pick a suggestion. Each one is checked before it's added. The list fades at its edge when it scrolls.
 */
export function companiesBlock(list, opts = {}) {
  let cur = (list || []).slice();
  const box = h('ul', { class: 'fade-list', 'aria-label': 'Companies you follow' });
  const sugg = h('div', { class: 'chip-sugg' });
  const input = h('input', { type: 'url', placeholder: 'Paste a careers page link, e.g. jobs.lever.co/cred', 'aria-label': 'Careers page link', 'aria-describedby': 'co-hint' });
  const status = h('div', { class: 'status', role: 'status' });
  const draw = () => {
    box.replaceChildren(...(cur.length ? cur.map((c, i) => h('li', {},
      h('span', { class: 'ini' }, c.name.charAt(0).toUpperCase()), h('span', { class: 'co-name' }, h('b', {}, c.name), h('small', {}, ATS[c.ats])),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Stop following ' + c.name, onclick: () => { cur.splice(i, 1); draw(); } }, icon('x')))) :
      [h('li', { class: 'muted' }, 'None yet. Job-alert emails still bring in matches.')]));
    const have = new Set(cur.map(companyKey));
    sugg.replaceChildren(...COMPANY_SUGGESTIONS.filter(c => !have.has(companyKey(c))).map(c =>
      h('button', { type: 'button', class: 'chip-add', onclick: () => { cur.push(normalizeCompany(c)); draw(); } }, '+ ' + c.name)));
  };
  const add = h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => busy(add, 'Checking…', async () => {
    const c = parseCareerUrl(input.value);
    if (!c) throw new Error('That doesn’t look like a link.');
    if (c.unsupported) throw new Error(`${c.host} can’t be read from here. Use the company’s Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee or Workday page, or turn on job alerts for it.`);
    if (cur.some(x => companyKey(x) === companyKey(c))) throw new Error(`${c.name} is already on your list.`);
    const n = opts.demo ? 12 : (await fetchBoard(c, [])).length;
    cur.push(c); input.value = ''; draw();
    status.className = 'status ok'; status.textContent = `Added ${c.name}: ${n} open job${n === 1 ? '' : 's'} right now.`;
  }, status) }, 'Add');
  draw();
  return {
    el: h('div', { class: 'stack' }, box, h('div', { class: 'inline-form' }, input, add),
      h('p', { class: 'hint', id: 'co-hint' }, 'Works with Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee and Workday career pages.'), status, sugg),
    collect: (d) => { d.companies = cur.slice(); },
  };
}

/** Connect Gmail (optional): what it reads, and Google's warning walked through before you see it. */
export function gmailBlock(ctx) {
  const status = h('div', { class: 'status', role: 'status' });
  // before: Gmail was already allowed for this app in your Google account (an earlier sign-in), so Google
  // includes it again without asking. Say so, and how to take it back, instead of claiming you just connected it.
  const done = (before) => {
    status.className = 'status ok';
    status.replaceChildren(before
      ? ['Gmail is already connected (read-only): you allowed it for Job Hunter before, and Google remembers. To take that back, remove Job Hunter at ',
        h('a', { href: 'https://myaccount.google.com/permissions', target: '_blank', rel: 'noopener noreferrer' }, 'myaccount.google.com/permissions'), '.']
      : 'Gmail connected (read-only). Your applications will load when you start.');
    btn.hidden = true; warn.hidden = true;
    el.dispatchEvent(new Event('input')); // lets the wizard turn "Skip for now" into "Next"
  };
  const btn = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => busy(btn, 'Connecting…', async () => { await ctx.connectGmail(); done(false); }, status) }, 'Connect Gmail');
  let warn;
  const el = h('div', { class: 'stack' },
    h('ul', { class: 'ticks-list' },
      h('li', {}, 'It looks for application and job-alert emails and reads only those.'),
      h('li', {}, 'Read-only: it can’t send, delete, label or change anything.'),
      h('li', {}, 'Skip it and you can still get job matches, tailor resumes, and add or paste applications yourself.')),
    warn = h('div', { class: 'heads-up' },
      h('p', {}, h('b', {}, 'Google will show a warning.'), ' Reading Gmail needs a permission Google only fully verifies after a paid review, which a free tool can’t afford. When you see “Google hasn’t verified this app”:'),
      h('ol', {}, h('li', {}, 'Choose ', h('b', {}, 'Advanced'), ', then ', h('b', {}, 'Go to Job Hunter'), '.'), h('li', {}, 'Tick the box to let it read your email.'), h('li', {}, 'Choose ', h('b', {}, 'Continue'), '.'))),
    btn, status);
  if (ctx.gmailOn && ctx.gmailOn()) done(!ctx.demo);
  return { el, collect: () => {} };
}

// ---------- the wizard ----------
const FROM_CV = 'Filled in from your CV. Change anything that isn’t right.';
const STEPS = [
  { id: 'cv', title: 'Start with your CV', intro: 'Job Hunter reads it to fill in the next questions, score openings and tailor resumes.', block: (d, ctx, w) => cvBlock(d.cv, d.cvFile, { onRead: w.onCvRead }) },
  { id: 'you', title: 'About you', intro: (d, w) => (!w.fromCv ? 'You can change any answer later.' : w.profile.found.name && w.profile.found.city ? FROM_CV
    : w.profile.found.name ? 'Your name is from your CV. Add the city you live in now.' : 'Your name wasn’t clear in the CV, so please check it.'), block: (d) => youBlock(d) },
  { id: 'want', title: 'What are you looking for?', intro: (d, w) => (w.fromCv ? (w.profile.roles.length ? 'Roles that match your CV. Add or remove any.' : 'Your CV didn’t point clearly to a role, so pick a few.') : ''), block: (d, ctx, w) => wantBlock(d, w.profile.roles) },
  { id: 'where', title: 'Where would you like to work?', block: (d) => whereBlock(d) },
  { id: 'avoid', title: 'Anything to skip?', intro: 'Openings with these are left out.', block: (d) => avoidBlock(d) },
  { id: 'gmail', title: 'Connect Gmail (optional)', intro: 'So your applications track themselves: confirmations, tests, interviews, offers and rejections, straight from your inbox.', block: (d, ctx) => gmailBlock(ctx) },
  { id: 'companies', title: 'Companies to follow (optional)', intro: 'Job Hunter already reads your job-alert emails from LinkedIn, Naukri, Indeed, Internshala, Wellfound and foundit. Add company career pages for more.', block: (d, ctx) => companiesBlock(d.companies, { demo: ctx.demo }) },
  { id: 'routine', title: 'Your routine', block: (d) => routineBlock(d) },
];

/** Renders the wizard into root. ctx.finish(draft) saves and starts the app. */
export function runWizard(root, ctx) {
  const d = JSON.parse(JSON.stringify(ctx.data.settings));
  d.cv = ctx.data.cv; d.cvFile = ctx.data.cvFile; d.cvUpload = null;
  // The CV fills in later answers once, and only the ones still at their defaults.
  const w = { fromCv: false, profile: { roles: [], found: {} } };
  const hint = ctx.me && !ctx.demo ? ctx.me.name : '';
  w.onCvRead = (text) => { w.profile = profileFromCv(text, new Date(), { hint }); applyCvProfile(d, w.profile); w.fromCv = true; };
  if (d.cv) w.profile = profileFromCv(d.cv, new Date(), { hint });
  let i = 0, cur = null;
  const total = STEPS.length + 1;
  const draw = () => {
    const done = i === STEPS.length;
    const back = h('button', { type: 'button', class: 'btn btn-quiet', disabled: i === 0, onclick: () => { if (cur) cur.collect(d); i--; draw(); } }, 'Back');
    const status = h('div', { class: 'status', role: 'status' });
    let body, next;
    if (!done) {
      const st = STEPS[i];
      cur = st.block(d, ctx, w);
      const intro = typeof st.intro === 'function' ? st.intro(d, w) : st.intro;
      body = [h('h1', { class: 'wiz-title', tabIndex: -1 }, st.title), intro ? h('p', { class: 'wiz-intro' }, intro) : '', cur.el];
      next = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => {
        cur.collect(d);
        if (st.id === 'cv') {
          if (d.cv && !w.fromCv) w.onCvRead(d.cv); // pasted text, not a file
          if (!d.name && ctx.me && ctx.me.name) d.name = ctx.me.name;
        }
        if (st.id === 'want' && !d.prefs.roles.length) { status.className = 'status err'; status.textContent = 'Add at least one role you want.'; return; }
        i++; draw();
      } }, (st.id === 'companies' && !(d.companies || []).length) || (st.id === 'cv' && !d.cv) || (st.id === 'gmail' && !(ctx.gmailOn && ctx.gmailOn())) ? 'Skip for now' : 'Next');
      if (st.id === 'companies' || st.id === 'cv' || st.id === 'gmail') ['click', 'input', 'drop'].forEach(ev => cur.el.addEventListener(ev, () => {
        if (st.id !== 'gmail' || (ctx.gmailOn && ctx.gmailOn())) { next.textContent = 'Next'; next.className = 'btn btn-primary'; }
      }));
      if (next.textContent === 'Skip for now') next.className = 'btn btn-quiet';
    } else {
      cur = null;
      const p = d.prefs;
      const row = (k, v) => h('div', { class: 'sum-row' }, h('span', {}, k), h('b', {}, v || '—'));
      body = [h('h1', { class: 'wiz-title', tabIndex: -1 }, 'All set. Here’s your plan'),
        h('div', { class: 'sum' },
          row('Roles', p.roles.join(', ')), row('Level', LEVELS[p.level]), row('Job type', JOB_TYPES[p.jobType]),
          row('Pay', (p.paidOnly ? 'Paid only' : 'Unpaid OK') + (p.minPay ? `, at least ${p.minPay}` : '')),
          row('Locations', p.locations.join(', ') + (p.relocate ? ' · open to relocating' : '')),
          row('Skip', p.avoid.join(', ')), row('CV', d.cv ? `${d.cv.length.toLocaleString()} characters${d.cvUpload ? ' · ' + d.cvUpload.name : ''}` : 'Not added yet'),
          row('Gmail', ctx.gmailOn && ctx.gmailOn() ? 'Connected (read-only)' : 'Not connected. You can connect it any time'),
          row('Companies', (d.companies || []).map(c => c.name).join(', ') || 'None yet'),
                    row('Updates', `${autoLabel(d.autoUpdateHours)} · ${d.jobsPerUpdate || 'no'} new jobs each time`)),
        h('p', { class: 'hint' }, ctx.gmailOn && ctx.gmailOn() ? 'Start reads your Gmail (read-only) from the last ' + d.sinceDays + ' days. Applications appear as they’re sorted.' : 'Start checks the companies you follow for openings.')];
      next = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => busy(next, 'Saving…', () => ctx.finish(d), status) }, 'Start');
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
