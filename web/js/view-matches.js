/**
 * Job matches: openings from job-alert emails and company boards, scored against your CV and keywords
 * (core.matchScore). A filter card on top, then either a table (desktop: one row per job, with apply and a ready
 * tailored resume) or the list with the selected job's details beside it (a dialog on phones).
 */
import { h, busy, icon, pageHead, ago, extLink, isHttp, chipInput, openDialog, toast, errText } from './ui.js';
import { filterJobs, MIN_MATCHES, roleKind, tailorSuggestions, applySuggestions } from './core.js';
import { renderSheet } from './view-tailor.js';

let show = 'New', selectedId = null;
// Table or cards on desktop: a display preference, kept on this device.
let layout = (() => { try { return localStorage.getItem('jh-matches') || 'table'; } catch (e) { return 'table'; } })();
const JOB_STATUS = { New: 'New', Saved: 'Saved', Applied: 'Applied', Skipped: 'Not for me', Expired: 'Expired' };
const SHOWS = { New: ['New'], Saved: ['Saved'], Applied: ['Applied'], Hidden: ['Skipped', 'Expired'] };
const isPhone = () => matchMedia('(max-width: 900px)').matches;

const scoreOf = (j) => (j.score ?? Math.round((Number(j.fit) || 0) * 20));
const posted = (j) => (j.posted ? 'posted ' + ago(j.posted + 'T09:00:00') : j.found_on ? 'found ' + ago(j.found_on + 'T09:00:00') : '');
const credit = (j) => h('span', { class: 'job-src' }, 'From ' + (j.source || 'a job-alert email'));

export function renderMatches(ctx, root) {
  const { data, act } = ctx;
  const s = data.settings, v = s.matchView;
  const save = (view, keywords, min) => act.saveMatchView(view, keywords, min).catch(e => toast(errText(e), true));

  // ---------- the filter card ----------
  const keywords = chipInput(s.keywords, { placeholder: '+ add keyword', label: 'Your keywords', max: 20, onChange: (list) => save({}, list) });
  const places = [...new Set(['', ...s.prefs.locations.filter(p => p !== 'Anywhere in India'), 'Remote'])];
  const location = h('select', { 'aria-label': 'Location', onchange: () => save({ location: location.value }) },
    ...places.map(p => h('option', { value: p, selected: p === v.location }, p || 'Any location')));
  if (v.location && !places.includes(v.location)) location.append(h('option', { value: v.location, selected: true }, v.location));
  const experience = h('select', { 'aria-label': 'Experience', onchange: () => save({ experience: experience.value }) },
    h('option', { value: 'fresher', selected: v.experience !== 'any' }, 'Fresher (0–1 yrs)'), h('option', { value: 'any', selected: v.experience === 'any' }, 'Any experience'));
  const toggle = (label, key) => { const i = h('input', { type: 'checkbox', checked: !!v[key], onchange: () => save({ [key]: i.checked }) }); return h('label', { class: 'inline' }, i, ' ', label); };
  const minVal = h('output', { class: 'min-val' }, s.minMatch + '%');
  const min = h('input', { type: 'range', min: 0, max: 90, step: 10, value: s.minMatch, 'aria-label': 'Minimum match', 'aria-valuetext': s.minMatch + '%',
    oninput: () => { minVal.textContent = min.value + '%'; min.setAttribute('aria-valuetext', min.value + '%'); },
    onchange: () => save({}, null, MIN_MATCHES.includes(Number(min.value)) ? Number(min.value) : s.minMatch) });
  const tabs = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Show' }, ...Object.keys(SHOWS).map(k =>
    h('button', { type: 'button', role: 'radio', 'aria-checked': String(show === k), onclick: () => { show = k; renderMatches(ctx, root); } }, k)));
  const views = isPhone() ? '' : h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Layout' }, ...[['table', 'Table'], ['cards', 'Cards']].map(([k, l]) =>
    h('button', { type: 'button', role: 'radio', 'aria-checked': String(layout === k), onclick: () => {
      layout = k; try { localStorage.setItem('jh-matches', k); } catch (e) { /* fine */ } renderMatches(ctx, root);
    } }, l)));
  const filters = h('section', { class: 'panel filters', 'aria-label': 'Filters' },
    h('div', { class: 'filters-kw' }, h('span', { class: 'field-lbl' }, 'Keywords'), keywords.el,
      h('p', { class: 'hint' }, 'Words you want in a job. They count as skills you have, and weigh more.')),
    h('div', { class: 'filters-row' },
      h('label', { class: 'field' }, h('span', { class: 'field-lbl' }, 'Location'), location),
      h('label', { class: 'field' }, h('span', { class: 'field-lbl' }, 'Experience'), experience),
      h('div', { class: 'field' }, h('span', { class: 'field-lbl' }, 'Minimum match'), h('div', { class: 'min-row' }, min, minVal)),
      h('div', { class: 'filters-toggles' }, toggle('Include internships', 'internships'), toggle('Hide jobs I’ve applied to', 'hideApplied'))));

  // ---------- the list and the detail ----------
  const all = data.jobs.filter(j => SHOWS[show].includes(j.status));
  const rows = filterJobs(all, Object.assign({}, v, { minMatch: show === 'New' ? s.minMatch : 0, hideApplied: show === 'Applied' ? false : v.hideApplied }), data.applications)
    .sort((a, b) => scoreOf(b) - scoreOf(a) || String(b.found_on).localeCompare(String(a.found_on)));
  if (!rows.some(j => j.id === selectedId)) selectedId = rows[0] ? rows[0].id : null;
  const detail = h('aside', { class: 'job-detail', 'aria-live': 'polite' });
  const drawDetail = () => {
    const j = rows.find(x => x.id === selectedId);
    detail.replaceChildren(...(j ? jobDetail(ctx, j, () => renderMatches(ctx, root)) : []));
  };
  const select = (j) => {
    selectedId = j.id;
    list.querySelectorAll('.job-card').forEach(c => c.setAttribute('aria-current', String(c.dataset.id === j.id)));
    if (isPhone()) { openDialog(j.role, ...jobDetail(ctx, j, () => renderMatches(ctx, root), true)); return; }
    drawDetail();
    act.loadJobDetails(j).then(() => { if (selectedId === j.id) drawDetail(); }).catch(() => {});
  };
  const list = h('ul', { class: 'job-list' }, ...rows.map(j => h('li', {}, jobCard(j, select, j.id === selectedId))));

  const empty = (title, text) => h('div', { class: 'empty-block' }, h('h2', {}, title), h('p', {}, text));
  const asTable = layout === 'table' && !isPhone();
  const body = rows.length ? (asTable ? jobsTable(ctx, rows, () => renderMatches(ctx, root)) : h('div', { class: 'matches' }, list, detail))
    : all.length && show === 'New' ? empty(`No matches at ${s.minMatch}% or more`, 'Lower the minimum match, change the filters, or add keywords you’re strong in.')
      : show !== 'New' ? empty(`Nothing ${show.toLowerCase()} yet`, show === 'Saved' ? 'Save a match to come back to it here.' : 'Jobs you mark show up here.')
        : !data.cv ? empty('Add your CV first', 'Matches are scored against the skills in your CV. Add it in Profile and CV, then sync.')
          : empty('No matches yet', 'New openings arrive with each sync: from job-alert emails (with Gmail connected) and the companies you follow.');

  root.replaceChildren(pageHead('Job matches', `${data.jobs.filter(j => j.status === 'New').length} new · scored against your CV and keywords`, tabs, views), filters, body);
  if (rows.length && !isPhone() && !asTable) { drawDetail(); const j = rows.find(x => x.id === selectedId); if (j) act.loadJobDetails(j).then(() => { if (selectedId === j.id) drawDetail(); }).catch(() => {}); }
}

function jobCard(j, select, current) {
  const sc = scoreOf(j);
  return h('button', { type: 'button', class: 'job-card', dataset: { id: j.id }, 'aria-current': String(current), onclick: () => select(j) },
    h('span', { class: 'score' + (sc >= 80 ? ' score-hi' : ''), 'aria-label': `${sc}% match` }, sc),
    h('span', { class: 'job-card-body' },
      h('b', {}, j.role),
      h('span', { class: 'job-meta' }, [j.company, j.location, posted(j)].filter(Boolean).join(' · ')),
      h('span', { class: 'chips-row' }, ...(j.matched || []).slice(0, 4).map(m => h('span', { class: 'kw' }, m)),
        ...(j.missing || []).slice(0, 3).map(m => h('span', { class: 'kw kw-miss' }, '+ ' + m))),
      h('span', { class: 'job-card-src' }, j.source || 'Job alert email')));
}

function jobDetail(ctx, j, redraw, inDialog) {
  const { act } = ctx;
  const sc = scoreOf(j);
  const set = (status, msg) => async () => {
    try { await act.setJobStatus(j, status); toast(msg); if (inDialog) document.getElementById('dialog').close(); redraw(); } catch (e) { toast(errText(e), true); }
  };
  const text = j.jd || j.details || '';
  const summary = h('p', { class: 'jd' }, text.length > 900 ? text.slice(0, 900) + '…' : text || 'No description came with this job. Open the posting to read it.');
  const more = text.length > 900 ? h('button', { type: 'button', class: 'link', onclick: () => { summary.textContent = text; more.remove(); } }, 'Show the whole description') : '';
  return [
    inDialog ? '' : h('h2', { class: 'jd-title' }, j.role),
    h('p', { class: 'job-meta' }, [j.company, j.location, j.pay, posted(j)].filter(Boolean).join(' · ')),
    h('div', { class: 'meter', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': sc, 'aria-label': 'Match' },
      h('div', { class: 'meter-top' }, h('b', {}, sc + '%'), h('span', {}, 'match with your CV')),
      h('div', { class: 'meter-track' }, h('i'))),
    (j.matched || []).length ? h('div', {}, h('h3', { class: 'jd-h' }, 'On your CV'), h('p', { class: 'chips-row' }, ...j.matched.map(m => h('span', { class: 'kw' }, m)))) : '',
    (j.missing || []).length ? h('div', {}, h('h3', { class: 'jd-h' }, 'Asked for, not on your CV'), h('p', { class: 'chips-row' }, ...j.missing.map(m => h('span', { class: 'kw kw-miss' }, '+ ' + m)))) : '',
    h('div', {}, h('h3', { class: 'jd-h' }, 'About the job'), summary, more),
    h('div', { class: 'jd-acts' },
      h('a', { class: 'btn btn-primary', href: `/app/tailor/${encodeURIComponent(j.id)}`, 'data-link': '', onclick: () => { if (inDialog) document.getElementById('dialog').close(); } }, 'Tailor resume for this job'),
      isHttp(j.link) ? extLink(j.link, 'Open posting', 'btn btn-quiet') : '',
      j.status === 'Saved' ? h('button', { type: 'button', class: 'btn btn-quiet', onclick: set('New', 'Moved back to New') }, 'Unsave')
        : h('button', { type: 'button', class: 'btn btn-quiet', onclick: set('Saved', 'Saved') }, icon('bookmark'), h('span', {}, 'Save')),
      j.status !== 'Applied' ? h('button', { type: 'button', class: 'btn btn-quiet', onclick: (e) => busy(e.currentTarget, 'Saving…', set('Applied', 'Added to your applications')) }, 'Mark applied') : '',
      j.status !== 'Skipped' ? h('button', { type: 'button', class: 'btn btn-quiet', onclick: set('Skipped', 'Hidden') }, 'Not for me') : ''),
    h('p', { class: 'hint' }, credit(j)),
  ].map(x => { if (x && x.classList && x.classList.contains('meter')) x.querySelector('i').style.width = sc + '%'; return x; });
}

/** Your resume tailored to this job: your saved choices in the tailor, or else every safe edit (never "Add skill"). */
function readyResume(ctx, j) {
  const { data, act } = ctx;
  const base = act.baseResume();
  const all = tailorSuggestions(base, j, data.cv, data.settings.keywords);
  const t = j.tailored || {};
  const accepted = Array.isArray(t.accepted) ? all.filter(s => t.accepted.includes(s.id)) : all.filter(s => !s.warn);
  return { resume: applySuggestions(base, accepted).resume, template: t.template || 'standard' };
}

/** The table layout: one row per job, with what fits, what to pick up, and apply / resume / tailor at hand. */
function jobsTable(ctx, rows, redraw) {
  const { data, act } = ctx;
  const roles = data.settings.prefs.roles;
  const th = (t, cls) => h('th', { scope: 'col', class: cls || '' }, t);
  const head = h('tr', {}, th('Fit', 'num'), th('Match', 'num'), th('Type'), th('Company'), th('Role'), th('Location'), th('Pay'),
    th('Why it fits', 'col-wide'), th('Skill to pick up'), th('Apply by'), th('Status'), h('th', {}, h('span', { class: 'visually-hidden' }, 'Actions')));
  const body = rows.map(j => {
    const sc = scoreOf(j), fit = Math.max(1, Math.round(sc / 20));
    const status = h('select', { class: 'select-sm', 'aria-label': `Status for ${j.role} at ${j.company}`, onchange: async () => {
      status.disabled = true;
      try { await act.setJobStatus(j, status.value); toast(status.value === 'Applied' ? 'Added to your applications' : 'Saved'); redraw(); } catch (e) { toast(errText(e), true); status.disabled = false; }
    } }, ...Object.entries(JOB_STATUS).map(([v, l]) => h('option', { value: v, selected: v === j.status }, l)));
    const pdf = h('button', { type: 'button', class: 'btn btn-quiet btn-sm', onclick: () => busy(pdf, 'Preparing…', async () => {
      if (!data.cv) throw new Error('Add your CV in Profile and CV first.');
      const { resume, template } = readyResume(ctx, j);
      await act.printResume(j, renderSheet(resume, template));
    }) }, h('span', {}, 'Resume PDF'), icon('download'));
    const kind = roleKind(j.role, roles);
    return h('tr', {},
      h('td', { class: 'num' }, h('span', { class: 'fit fit-' + fit, title: `Fit ${fit} of 5` }, fit)),
      h('td', { class: 'num' }, h('span', { class: 'score score-sm' + (sc >= 80 ? ' score-hi' : ''), 'aria-label': `${sc}% match` }, sc + '%')),
      h('td', {}, h('span', { class: 'pill ' + (kind === 'Core' ? 'pill-blue' : kind === 'Stretch' ? 'pill-orange' : '') }, kind)),
      h('td', {}, h('b', {}, j.company)),
      h('td', { class: 'col-role' }, isHttp(j.link) ? h('a', { href: j.link, target: '_blank', rel: 'noopener noreferrer' }, j.role) : j.role),
      h('td', {}, j.location || '—'),
      h('td', { class: 'muted' }, j.pay || 'Not listed'),
      h('td', { class: 'col-wide' }, j.why || ((j.matched || []).length ? 'On your CV: ' + j.matched.slice(0, 4).join(', ') + '.' : '—')),
      h('td', {}, j.skill_gap && j.skill_gap !== 'None' ? j.skill_gap : (j.missing || [])[0] || 'None'),
      h('td', { class: 'num' }, j.apply_by || '—'),
      h('td', {}, status),
      h('td', {}, h('div', { class: 'row-acts' },
        isHttp(j.link) ? h('a', { class: 'btn btn-primary btn-sm', href: j.link, target: '_blank', rel: 'noopener noreferrer' }, h('span', {}, 'Apply'), icon('external')) : '',
        pdf,
        h('a', { class: 'link small', href: `/app/tailor/${encodeURIComponent(j.id)}` }, j.tailored ? 'Edit tailored resume' : 'Tailor'))));
  });
  return h('div', { class: 'table-wrap' }, h('div', { class: 'table-box panel jobs-table' }, h('table', { class: 'table' }, h('thead', {}, head), h('tbody', {}, ...body))));
}
