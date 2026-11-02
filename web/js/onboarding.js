/**
 * First-run setup in three steps (CV, check what we found, job emails). The field blocks also make up Profile and Settings.
 */
import { h, chipInput, segmented, busy, errText, extLink, icon } from './ui.js';
import { LEVELS, JOB_TYPES, JOBS_PER_UPDATE, DAYS, ROLE_RANGES, SINCE_DAYS, ARCHIVE_DAYS, ATS, COMPANY_SUGGESTIONS, INDIA_BOARDS, companyKey, normalizeCompany, parseCareerUrl, placeMatches, placesFor, profileFromCv, applyCvProfile } from './core.js';
import { fetchBoard } from './sources.js';
import { readCvFile, CV_ACCEPT } from './files.js';

const ROLE_SUGGESTIONS = ['SOC Analyst', 'Security Analyst', 'Penetration Tester', 'Cloud Security', 'Security Engineer', 'GRC Analyst', 'Network Engineer', 'Software Developer'];
const PLACE_SUGGESTIONS = ['Hyderabad', 'Bengaluru', 'Pune', 'Chennai', 'Mumbai', 'Delhi NCR', 'Remote', 'Anywhere in India'];
const AVOID_SUGGESTIONS = ['Sales', 'Telecalling', 'Unpaid internships', 'Training institutes that charge fees', 'Night shifts', 'Bond / service agreement'];
const WEEK = [1, 2, 3, 4, 5, 6, 0]; // Mon first
/** "Every day at 07:00", "Mon–Fri at 07:00"… for the summary. */
export function scheduleLabel(sc) {
  if (!sc.on || !sc.days.length) return 'Only when I click Check my emails';
  const days = sc.days.length === 7 ? 'Every day' : sc.days.join() === '1,2,3,4,5' ? 'Weekdays' : WEEK.filter(n => sc.days.includes(n)).map(n => DAYS[n]).join(', ');
  return `${days}: Gmail at ${sc.gmailAt}, new jobs by ${sc.jobsAt}`;
}
const group = (label, control, hint) => h('div', { class: 'field', role: 'group', 'aria-label': label }, h('span', { class: 'field-lbl' }, label), control, hint ? h('span', { class: 'hint' }, hint) : '');

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

export function routineBlock(s, { email = '' } = {}) {
  const sc = s.schedule;
  const alerts = h('input', { type: 'checkbox', class: 'switch', role: 'switch', checked: s.emailAlerts, 'aria-label': 'Email me when new jobs are ready' });
  const alertsText = h('span', {}, s.emailAlerts ? 'On' : 'Off');
  alerts.addEventListener('change', () => { alertsText.textContent = alerts.checked ? 'On' : 'Off'; });
  const on = h('input', { type: 'checkbox', class: 'switch', role: 'switch', checked: sc.on, 'aria-label': 'Daily updates' });
  const onText = h('span', {}, sc.on ? 'On' : 'Off');
  const days = WEEK.map(n => h('button', { type: 'button', class: 'day', 'aria-pressed': String(sc.days.includes(n)), 'data-day': n,
    onclick: (e) => e.currentTarget.setAttribute('aria-pressed', String(e.currentTarget.getAttribute('aria-pressed') !== 'true')) }, DAYS[n]));
  const gmailAt = h('input', { type: 'time', value: sc.gmailAt, step: 300, 'aria-label': 'Gmail sync at' });
  const jobsAt = h('input', { type: 'time', value: sc.jobsAt, step: 300, 'aria-label': 'New jobs ready by' });
  const timed = h('div', { class: 'stack' },
    group('Days', h('div', { class: 'days' }, ...days)),
    h('div', { class: 'two' },
      field('Gmail sync at', gmailAt),
      field('New jobs ready by', jobsAt)),
    h('p', { class: 'hint' }, 'On this device’s clock. Job Hunter works inside this page, so if it’s closed at that time, it catches up as soon as you open it.'));
  const showTimed = () => { onText.textContent = on.checked ? 'On' : 'Off'; timed.hidden = !on.checked; };
  on.addEventListener('change', showTimed); showTimed();
  const range = segmented(ROLE_RANGES, s.prefs.roleRange, 'Which jobs to show');
  const jobs = segmented(Object.fromEntries(JOBS_PER_UPDATE.map(n => [n, n ? String(n) : 'Off'])), s.jobsPerUpdate, 'New jobs per day');
  const since = segmented(Object.fromEntries(SINCE_DAYS.map(n => [n, `${n} days`])), s.sinceDays, 'First search');
  const archive = segmented(Object.fromEntries(ARCHIVE_DAYS.map(n => [n, n ? `${n} days` : 'Never'])), s.archiveDays, 'Archive after');
  return {
    el: h('div', { class: 'stack' },
      h('label', { class: 'switch-row' }, h('span', { class: 'field-lbl' }, 'Daily updates'), on, onText),
      timed,
      h('div', { class: 'field' },
        h('label', { class: 'switch-row' }, h('span', { class: 'field-lbl' }, 'Email me when new jobs are ready'), alerts, alertsText),
        h('span', { class: 'hint' }, `Job Hunter looks for jobs at your “ready by” time even when it’s closed, and emails them${email ? ' to ' + email : ''}. `,
          'For this it keeps your roles, places, skill names and followed companies on its server (never your CV or Gmail). ',
          h('a', { href: '/privacy.html#alerts', target: '_blank', rel: 'noopener' }, 'What’s kept'))),
      group('Which jobs to show', range.el, 'Only jobs named like your roles, or close ones too.'),
      group('New jobs per day', jobs.el),
      group('First time, look back through Gmail for', since.el),
      group('Move to the Archive after no change for', archive.el, 'Quiet applications leave the board. A new email brings one back.')),
    collect: (d) => {
      const picked = days.filter(b => b.getAttribute('aria-pressed') === 'true').map(b => Number(b.dataset.day));
      d.schedule = { on: on.checked && picked.length > 0, days: picked.length ? picked : sc.days, gmailAt: gmailAt.value || sc.gmailAt, jobsAt: jobsAt.value || sc.jobsAt };
      d.prefs = Object.assign({}, d.prefs, { roleRange: range.get() });
      d.jobsPerUpdate = Number(jobs.get()); d.sinceDays = Number(since.get()); d.archiveDays = Number(archive.get());
      d.emailAlerts = alerts.checked;
    },
  };
}

/**
 * CV: drop a file on the zone (its contents lean toward the file as you drag, like kitchen's "Magnetic Drop Zone"),
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
    zone.style.setProperty('--dx', (dx * 8).toFixed(1) + 'px'); zone.style.setProperty('--dy', (dy * 6).toFixed(1) + 'px');
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
  const auto = h('input', { type: 'checkbox', class: 'switch', role: 'switch', checked: opts.auto !== false, 'aria-label': 'Also search Job Hunter’s company list' });
  const autoRow = h('div', { class: 'field' },
    h('label', { class: 'switch-row' }, h('span', { class: 'field-lbl' }, `Also search ${INDIA_BOARDS.length} companies hiring in India`), auto),
    h('span', { class: 'hint' }, 'On by default, so you get jobs without following anyone: ' + INDIA_BOARDS.slice(0, 8).map(c => c.name).join(', ') + ' and more. Add any others below.'));
  const box = h('ul', { class: 'fade-list', 'aria-label': 'Companies you follow' });
  const sugg = h('div', { class: 'chip-sugg' });
  const input = h('input', { type: 'url', placeholder: 'Paste a careers page link, e.g. jobs.lever.co/cred', 'aria-label': 'Careers page link', 'aria-describedby': 'co-hint' });
  const status = h('div', { class: 'status', role: 'status' });
  const draw = () => {
    box.replaceChildren(...(cur.length ? cur.map((c, i) => h('li', {},
      h('span', { class: 'ini' }, c.name.charAt(0).toUpperCase()), h('span', { class: 'co-name' }, h('b', {}, c.name), h('small', {}, ATS[c.ats])),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Stop following ' + c.name, onclick: () => { cur.splice(i, 1); draw(); } }, icon('x')))) :
      [h('li', { class: 'muted' }, 'None of your own yet. The list above and your job-alert emails still bring in jobs.')]));
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
    el: h('div', { class: 'stack' }, autoRow, box, h('div', { class: 'inline-form' }, input, add),
      h('p', { class: 'hint', id: 'co-hint' }, 'Works with Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee and Workday career pages.'), status, sugg),
    collect: (d) => { d.companies = cur.slice(); d.autoCompanies = auto.checked; },
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
      h('li', {}, 'Skip it and you still get jobs for you, a resume for each, and you can add or paste applications yourself.')),
    warn = h('div', { class: 'heads-up' },
      h('p', {}, h('b', {}, 'Google will show a warning.'), ' Reading Gmail needs a permission Google only fully verifies after a paid review, which a free tool can’t afford. When you see “Google hasn’t verified this app”:'),
      h('ol', {}, h('li', {}, 'Choose ', h('b', {}, 'Advanced'), ', then ', h('b', {}, 'Go to Job Hunter'), '.'), h('li', {}, 'Tick the box to let it read your email.'), h('li', {}, 'Choose ', h('b', {}, 'Continue'), '.'))),
    btn, status);
  if (ctx.gmailOn && ctx.gmailOn()) done(!ctx.demo);
  return { el, collect: () => {} };
}

// ---------- the wizard: three steps ----------
// 1. your CV, 2. check what we found, 3. job emails yes or no. Everything else starts at a good default
// (skip list, companies, routine, Gmail look-back, old applications) and can be changed in Settings. Gmail is a card on Home.
const LOOKING_FOR = { fresher: 'A fresher job', intern: 'An internship', both: 'Either' };
const TYPE_FOR = { fresher: 'fulltime', intern: 'internship', both: 'both' };

/** Step 2: name, city, roles, what you're looking for, places, paid only. */
function checkBlock(d, fromCv) {
  const name = h('input', { type: 'text', value: d.name, autocomplete: 'name', maxLength: 80 });
  const city = h('input', { type: 'text', value: d.city, placeholder: 'e.g. Hyderabad', maxLength: 60 });
  const roles = chipInput(d.prefs.roles, { placeholder: 'Add a role and press Enter', suggestions: [...new Set([...fromCv, ...ROLE_SUGGESTIONS])], label: 'Jobs you want', max: 6 });
  const looking = segmented(LOOKING_FOR, d.prefs.level in LOOKING_FOR ? d.prefs.level : 'both', 'Looking for');
  const places = chipInput(d.prefs.locations, { placeholder: 'Start typing a city', suggestions: PLACE_SUGGESTIONS, label: 'Places', search: (q, have) => placeMatches(q, have) });
  const paid = check(d.prefs.paidOnly, 'Paid jobs only');
  // Typing your city fills in the places, until you change them yourself.
  let placesTouched = false;
  places.el.addEventListener('input', () => { placesTouched = true; });
  places.el.addEventListener('click', (e) => { if (e.target.closest('button')) placesTouched = true; });
  return {
    el: h('div', { class: 'stack' },
      h('div', { class: 'two' }, field('Your name', name), field('City you live in', city)),
      field('Jobs you want', roles.el, 'Pick up to three, or type your own.'),
      group('Looking for', looking.el),
      field('Where you’d like to work', places.el),
      paid.el),
    collect: (dd) => {
      dd.name = name.value.trim(); dd.city = city.value.trim();
      const lv = looking.get();
      Object.assign(dd.prefs, { roles: roles.get(), level: lv, jobType: TYPE_FOR[lv], paidOnly: paid.get() });
      const picked = places.get();
      dd.prefs.locations = !placesTouched && dd.city ? placesFor(dd.city) : picked.length ? picked : placesFor(dd.city);
    },
  };
}

/** Step 3: email new jobs? Asked, never turned on for you. */
function alertsBlock(ctx) {
  return {
    el: h('div', { class: 'stack' },
      h('ul', { class: 'ticks-list' },
        h('li', {}, 'Once a day, at about 9 in the morning. Change the time and days in Settings.'),
        h('li', {}, 'Even when Job Hunter is closed.'),
        h('li', {}, 'One click in any email turns them off.')),
      h('p', { class: 'hint' }, 'For this, Job Hunter keeps your roles, places, skill names and email address on its server, never your CV or Gmail. ',
        h('a', { href: '/privacy.html#alerts', target: '_blank', rel: 'noopener' }, 'What’s kept')),
      ctx.demo ? h('p', { class: 'hint' }, 'In the demo, nothing is emailed.') : ''),
    collect: () => {},
  };
}

const FROM_CV = 'We filled this in from your CV. Change anything that isn’t right.';
const STEPS = [
  { id: 'cv', title: 'Upload your CV', intro: 'We use it to find jobs that fit you and to make a resume for each one.', block: (d, ctx, w) => cvBlock(d.cv, d.cvFile, { onRead: w.onCvRead }) },
  { id: 'check', title: 'Check what we found', intro: (d, w) => (w.fromCv ? FROM_CV : 'Tell us a little about the jobs you want.'), block: (d, ctx, w) => checkBlock(d, w.profile.roles) },
  { id: 'alerts', title: 'Get new jobs by email?', intro: 'We can email you jobs that fit you, so you don’t miss any.', block: (d, ctx) => alertsBlock(ctx) },
];

/** Renders the wizard into root. ctx.finish(draft) saves and starts the app. */
export function runWizard(root, ctx) {
  const d = JSON.parse(JSON.stringify(ctx.data.settings));
  d.cv = ctx.data.cv; d.cvFile = ctx.data.cvFile; d.cvUpload = null;
  if (!ctx.data.settings.onboarded) Object.assign(d, { autoCompanies: true });
  // The CV fills in later answers once, and only the ones still at their defaults.
  const w = { fromCv: false, profile: { roles: [], found: {} } };
  const hint = ctx.me && !ctx.demo ? ctx.me.name : '';
  w.onCvRead = (text) => { w.profile = profileFromCv(text, new Date(), { hint }); applyCvProfile(d, w.profile); w.fromCv = true; };
  if (d.cv) w.profile = profileFromCv(d.cv, new Date(), { hint });
  let i = 0, cur = null;
  const total = STEPS.length;
  const draw = () => {
    const st = STEPS[i];
    const status = h('div', { class: 'status', role: 'status' });
    const back = h('button', { type: 'button', class: 'btn btn-quiet', disabled: i === 0, onclick: () => { cur.collect(d); i--; draw(); } }, 'Back');
    cur = st.block(d, ctx, w);
    const intro = typeof st.intro === 'function' ? st.intro(d, w) : st.intro;
    const finish = (alerts) => (e) => busy(e.currentTarget, 'Starting…', () => { d.emailAlerts = alerts && !ctx.demo; return ctx.finish(d); }, status);
    let acts;
    if (st.id === 'alerts') {
      acts = [h('button', { type: 'button', class: 'btn btn-quiet', onclick: finish(false) }, 'No thanks'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: finish(true) }, 'Yes, email me')];
    } else {
      const next = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => {
        cur.collect(d);
        if (st.id === 'cv') {
          if (d.cv && !w.fromCv) w.onCvRead(d.cv); // pasted text, not a file
          if (!d.name && ctx.me && ctx.me.name) d.name = ctx.me.name;
        }
        if (st.id === 'check' && !d.prefs.roles.length) { status.className = 'status err'; status.textContent = 'Add at least one job you want.'; return; }
        i++; draw();
      } }, st.id === 'cv' && !d.cv ? 'Skip for now' : 'Next');
      if (st.id === 'cv') {
        if (!d.cv) next.className = 'btn btn-quiet';
        ['click', 'input', 'drop'].forEach(ev => cur.el.addEventListener(ev, () => { if (cur.textarea && cur.textarea.value.trim()) { next.textContent = 'Next'; next.className = 'btn btn-primary'; } }));
      }
      acts = [next];
    }
    root.replaceChildren(h('div', { class: 'wizard' },
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 1, 'aria-valuemax': total, 'aria-valuenow': i + 1 },
        h('div', { class: 'progress-bar' })),
      h('div', { class: 'step-count' }, `Step ${i + 1} of ${total}`),
      h('h1', { class: 'wiz-title', tabIndex: -1 }, st.title), intro ? h('p', { class: 'wiz-intro' }, intro) : '', cur.el,
      status, h('div', { class: 'wiz-nav' }, back, h('div', { class: 'row' }, ...acts))));
    root.querySelector('.progress-bar').style.width = ((i + 1) / total * 100) + '%';
    const t = root.querySelector('.wiz-title'); if (t) t.focus();
  };
  draw();
}
