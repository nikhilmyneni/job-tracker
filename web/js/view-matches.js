/**
 * Job matches: openings from job-alert emails and company boards, scored against your CV and keywords
 * (core.matchScore). A filter card on top, the list on the left, the selected job's details on the right
 * (a dialog on phones).
 */
import { h, busy, icon, pageHead, ago, extLink, isHttp, chipInput, openDialog, toast, errText } from './ui.js';
import { filterJobs, MIN_MATCHES } from './core.js';

let show = 'New', selectedId = null;
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
  const body = rows.length ? h('div', { class: 'matches' }, list, detail)
    : all.length && show === 'New' ? empty(`No matches at ${s.minMatch}% or more`, 'Lower the minimum match, change the filters, or add keywords you’re strong in.')
      : show !== 'New' ? empty(`Nothing ${show.toLowerCase()} yet`, show === 'Saved' ? 'Save a match to come back to it here.' : 'Jobs you mark show up here.')
        : !data.cv ? empty('Add your CV first', 'Matches are scored against the skills in your CV. Add it in Profile and CV, then sync.')
          : empty('No matches yet', 'New openings arrive with each sync: from job-alert emails (with Gmail connected) and the companies you follow.');

  root.replaceChildren(pageHead('Job matches', `${data.jobs.filter(j => j.status === 'New').length} new · scored against your CV and keywords`, tabs), filters, body);
  if (rows.length && !isPhone()) { drawDetail(); const j = rows.find(x => x.id === selectedId); if (j) act.loadJobDetails(j).then(() => { if (selectedId === j.id) drawDetail(); }).catch(() => {}); }
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
