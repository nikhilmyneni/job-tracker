/**
 * Jobs for you: openings from company job boards and job-alert emails, scored against your CV.
 * Calm by default: a title, For you / Saved / Applied, one Filter button, then one column of job cards with Apply.
 * Filters open in a sheet; a job's details open in a drawer. The old table survives as "Compact view" under ⋯.
 */
import { h, busy, icon, pageHead, ago, extLink, isHttp, chipInput, openDialog, toast, errText } from './ui.js';
import { filterJobs, roleKind, fieldHint, matchLabel, SHOW_LEVELS, showOf } from './core.js';
import { openApply, readyResume } from './apply.js';

let show = 'New';
// Compact view (the table): a display preference on this device, off by default.
let compact = (() => { try { return localStorage.getItem('jh-matches') === 'table'; } catch (e) { return false; } })();
const SHOWS = { New: ['New'], Saved: ['Saved'], Applied: ['Applied'], Hidden: ['Skipped', 'Expired'] };
const TAB_LABEL = { New: 'For you', Saved: 'Saved', Applied: 'Applied' };
const isPhone = () => matchMedia('(max-width: 900px)').matches;

const scoreOf = (j) => (j.score ?? Math.round((Number(j.fit) || 0) * 20));
const level = (sc) => { const m = matchLabel(sc); return h('span', { class: `lvl lvl-${m.tone}` }, `${m.label} fit`); };
const posted = (j) => (j.posted ? 'posted ' + ago(j.posted + 'T09:00:00') : j.found_on ? 'found ' + ago(j.found_on + 'T09:00:00') : '');
const pay = (j) => (j.pay && !/not listed/i.test(j.pay) ? j.pay : '');
const gapOf = (j) => (j.skill_gap && j.skill_gap !== 'None' ? j.skill_gap : (j.missing || [])[0] || '');
const whyOf = (j) => j.why || ((j.matched || []).length ? 'On your CV: ' + j.matched.slice(0, 4).join(', ') + '.' : '');

export function renderMatches(ctx, root) {
  const { data, act } = ctx;
  const s = data.settings, v = s.matchView;
  const redraw = () => renderMatches(ctx, root);
  const all = data.jobs.filter(j => SHOWS[show].includes(j.status));
  const rows = filterJobs(all, Object.assign({}, v, { minMatch: show === 'New' ? s.minMatch : 0, hideApplied: show === 'Applied' ? false : v.hideApplied }), data.applications)
    .sort((a, b) => scoreOf(b) - scoreOf(a) || String(b.found_on).localeCompare(String(a.found_on)));

  // ---------- the head: title, For you / Saved / Applied, Filter, ⋯ ----------
  const tabs = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Show' }, ...Object.keys(TAB_LABEL).map(k =>
    h('button', { type: 'button', role: 'radio', 'aria-checked': String(show === k), onclick: () => { show = k; redraw(); } }, TAB_LABEL[k])));
  const active = [v.location, showOf(s.minMatch) !== 'all', !v.internships, !v.hideApplied, v.experience === 'any', s.keywords.length].filter(Boolean).length;
  const filterBtn = h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => filterSheet(ctx, redraw) }, icon('filter'), h('span', {}, active ? `Filter (${active})` : 'Filter'));
  const more = h('details', { class: 'menu menu-right' }, h('summary', { class: 'icon-btn', 'aria-label': 'More' }, icon('more')),
    h('div', { class: 'menu-list' },
      h('button', { type: 'button', onclick: () => { show = 'Hidden'; redraw(); } }, 'Hidden jobs'),
      isPhone() ? '' : h('button', { type: 'button', onclick: () => { compact = !compact; try { localStorage.setItem('jh-matches', compact ? 'table' : 'cards'); } catch (e) { /* fine */ } redraw(); } },
        compact ? 'Card view' : 'Compact view (table)')));
  const newCount = data.jobs.filter(j => j.status === 'New').length;
  const sub = show === 'Hidden' ? h('span', {}, 'Jobs you hid. ', h('button', { type: 'button', class: 'link', onclick: () => { show = 'New'; redraw(); } }, 'Back to jobs for you'))
    : `${newCount} job${newCount === 1 ? '' : 's'} picked for you from your CV`;

  // ---------- the list ----------
  const empty = (title, text, action) => h('div', { class: 'empty-block' }, h('h2', {}, title), h('p', {}, text), action || '');
  const body = rows.length
    ? (compact && !isPhone() ? jobsTable(ctx, rows, redraw) : h('ul', { class: 'jobs' }, ...rows.map(j => h('li', {}, jobCard(ctx, j, redraw)))))
    : all.length && show === 'New' ? empty('No jobs with these filters', 'Show all jobs, or change the place.', h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => filterSheet(ctx, redraw) }, 'Change filters'))
      : show === 'Saved' ? empty('Nothing saved yet', 'Tap Save on a job to keep it here for later.')
        : show === 'Applied' ? empty('No applied jobs yet', 'When you apply to a job here, it shows up in this list and in My applications.')
          : show === 'Hidden' ? empty('No hidden jobs', 'Jobs you mark “Not for me” go here.')
            : !data.cv ? empty('Add your CV first', 'We find jobs that fit the skills in your CV.', h('a', { class: 'btn btn-primary', href: '/app/profile' }, 'Add my CV'))
              : empty('No jobs yet', 'We look for new jobs every day. They’ll show up here.');

  root.replaceChildren(pageHead('Jobs for you', sub, filterBtn, more), h('div', { class: 'jobs-top' }, tabs), body);
}

/** One job: role and company, place · pay · posted, the fit and why, then Apply, Save and ⋯. Tap it for details. */
function jobCard(ctx, j, redraw) {
  const { act, data } = ctx;
  const hint = fieldHint(roleKind(j.role, data.settings.prefs.roles));
  const set = (status, msg) => (e) => busy(e.currentTarget, '…', async () => { await act.setJobStatus(j, status); toast(msg); redraw(); });
  const open = () => jobDrawer(ctx, j, redraw);
  return h('article', { class: 'job' },
    h('button', { type: 'button', class: 'job-open', 'aria-label': `${j.role} at ${j.company}: details`, onclick: open }),
    h('div', { class: 'job-head' }, h('h3', {}, j.role), level(scoreOf(j))),
    h('p', { class: 'job-co' }, h('b', {}, j.company), ' · ', [j.location, pay(j), posted(j)].filter(Boolean).join(' · ')),
    whyOf(j) || hint ? h('p', { class: 'job-why' }, hint ? h('span', { class: 'hint-chip' }, hint) : '', whyOf(j)) : '',
    h('div', { class: 'job-acts' },
      j.status === 'Applied' ? h('span', { class: 'pill pill-green' }, icon('check'), ' Applied')
        : h('button', { type: 'button', class: 'btn btn-primary', onclick: () => openApply(ctx, j, redraw) }, 'Apply'),
      j.status === 'Saved' ? h('button', { type: 'button', class: 'btn btn-quiet', onclick: set('New', 'Removed from Saved') }, 'Saved ✓')
        : j.status === 'New' ? h('button', { type: 'button', class: 'btn btn-quiet', onclick: set('Saved', 'Saved for later') }, icon('bookmark'), h('span', {}, 'Save')) : '',
      h('details', { class: 'menu' }, h('summary', { class: 'icon-btn', 'aria-label': 'More for this job' }, icon('more')),
        h('div', { class: 'menu-list' },
          h('a', { href: `/app/tailor/${encodeURIComponent(j.id)}` }, 'Make my resume fit'),
          isHttp(j.link) ? extLink(j.link, 'Open the job page') : '',
          j.status !== 'Skipped' ? h('button', { type: 'button', onclick: set('Skipped', 'Hidden. Find it under ⋯ → Hidden jobs.') }, 'Not for me')
            : h('button', { type: 'button', onclick: set('New', 'Back in Jobs for you') }, 'Show it again')))));
}

/** A job's details: a drawer on the right (a full screen on phones). */
function jobDrawer(ctx, j, redraw) {
  const { act } = ctx;
  const draw = () => {
    const text = j.jd || j.details || '';
    return [
      h('p', { class: 'job-co' }, h('b', {}, j.company), ' · ', [j.location, pay(j), posted(j)].filter(Boolean).join(' · ')),
      h('div', { class: 'drawer-fit' }, level(scoreOf(j)), whyOf(j) ? h('p', {}, whyOf(j)) : ''),
      gapOf(j) ? h('p', { class: 'hint' }, `Skill to learn for this job: ${gapOf(j)}`) : '',
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { close(); openApply(ctx, j, redraw); } }, 'Apply'),
        h('a', { class: 'btn btn-quiet', href: `/app/tailor/${encodeURIComponent(j.id)}`, onclick: () => close() }, 'Make my resume fit')),
      h('h3', { class: 'jd-h' }, 'About the job'),
      h('p', { class: 'jd' }, text || 'No description came with this job. Open the job page to read it.'),
      isHttp(j.link) ? extLink(j.link, 'Open the job page', 'link') : '',
    ];
  };
  const box = h('div', { class: 'stack' }, ...draw());
  const close = openDialog(j.role, box);
  const d = document.getElementById('dialog');
  d.classList.add('dialog-drawer');
  d.addEventListener('close', () => d.classList.remove('dialog-drawer'), { once: true });
  if (!j.jd) act.loadJobDetails(j).then(() => { if (d.open) box.replaceChildren(...draw()); }).catch(() => {});
}

/** Filters, in a sheet: place, which fits to show, internships, applied jobs, experience, must-have words. */
function filterSheet(ctx, redraw) {
  const { data, act } = ctx;
  const s = data.settings, v = s.matchView;
  const field = (label, control, hint) => h('label', { class: 'field' }, h('span', { class: 'field-lbl' }, label), control, hint ? h('span', { class: 'hint' }, hint) : '');
  const places = [...new Set(['', ...s.prefs.locations.filter(p => p !== 'Anywhere in India'), 'Remote'])];
  const place = h('select', {}, ...places.map(p => h('option', { value: p, selected: p === v.location }, p || 'Anywhere')));
  if (v.location && !places.includes(v.location)) place.append(h('option', { value: v.location, selected: true }, v.location));
  const fits = h('select', {}, ...Object.entries(SHOW_LEVELS).map(([k, l]) => h('option', { value: k, selected: k === showOf(s.minMatch) }, l.label)));
  const box = (label, on) => { const i = h('input', { type: 'checkbox', checked: on }); return [i, h('label', { class: 'inline' }, i, ' ', label)]; };
  const [intern, internRow] = box('Show internships too', !!v.internships);
  const [applied, appliedRow] = box('Show jobs I already applied to', !v.hideApplied);
  const [anyExp, anyExpRow] = box('Show jobs that need more experience', v.experience === 'any');
  const words = chipInput(s.keywords, { placeholder: '+ add a word', label: 'Must-have words', max: 20 });
  const status = h('div', { class: 'status', role: 'status' });
  const apply = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => busy(apply, 'Saving…', async () => {
    await act.saveMatchView({ location: place.value, internships: intern.checked, hideApplied: !applied.checked, experience: anyExp.checked ? 'any' : 'fresher' },
      words.get ? words.get() : s.keywords, SHOW_LEVELS[fits.value].min);
    close(); redraw();
  }, status) }, 'Show jobs');
  const close = openDialog('Filter jobs', h('div', { class: 'stack' },
    field('Place', place), field('Show', fits, 'How closely a job should fit your CV.'),
    h('div', { class: 'filters-toggles' }, internRow, appliedRow, anyExpRow),
    h('details', { class: 'more' }, h('summary', {}, 'More filters'),
      field('Must-have words', words.el, 'Jobs that mention these come first. They count as skills you have.')),
    h('div', { class: 'save-bar' }, apply, status)));
  const d = document.getElementById('dialog');
  d.classList.add('dialog-sheet');
  d.addEventListener('close', () => d.classList.remove('dialog-sheet'), { once: true });
}

/** Compact view (power users): one row per job. */
function jobsTable(ctx, rows, redraw) {
  const { data, act } = ctx;
  const th = (t, cls) => h('th', { scope: 'col', class: cls || '' }, t);
  const head = h('tr', {}, th('Fit'), th('Role'), th('Company'), th('Place'), th('Pay'), th('Why it fits', 'col-wide'), th('Skill to learn'), h('th', {}, h('span', { class: 'visually-hidden' }, 'Actions')));
  const body = rows.map(j => {
    const pdf = h('button', { type: 'button', class: 'btn btn-quiet btn-sm', onclick: () => busy(pdf, 'Preparing…', async () => {
      if (!data.cv) throw new Error('Add your CV in Profile first.');
      const { resume, template } = readyResume(ctx, j);
      await act.downloadResume(j, resume, 'pdf', template);
    }) }, h('span', {}, 'Resume'), icon('download'));
    return h('tr', {},
      h('td', {}, level(scoreOf(j))),
      h('td', { class: 'col-role' }, j.role),
      h('td', {}, h('b', {}, j.company)),
      h('td', {}, j.location || '—'),
      h('td', { class: 'muted' }, pay(j) || '—'),
      h('td', { class: 'col-wide' }, whyOf(j) || '—'),
      h('td', {}, gapOf(j) || '—'),
      h('td', {}, h('div', { class: 'row-acts' },
        j.status === 'Applied' ? h('span', { class: 'pill pill-green' }, 'Applied') : h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => openApply(ctx, j, redraw) }, 'Apply'),
        pdf)));
  });
  return h('div', { class: 'table-wrap' }, h('div', { class: 'table-box panel jobs-table' }, h('table', { class: 'table' }, h('thead', {}, head), h('tbody', {}, ...body))));
}
