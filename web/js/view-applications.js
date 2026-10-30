/** Applications: everything you've applied to, kept up to date from Gmail. Board, table or timeline. */
import { h, busy, icon, pageHead, ago, openDialog, isHttp, toast, errText, copyButton } from './ui.js';
import { STATUSES, STATUS_LABEL, summary, bySource, ymd, inPlay } from './core.js';
import { renderBoard, renderTimeline, editDialog, removeBtn } from './view-board.js';
import { notifySupported, notifyAllowed } from './notify.js';

const VIEWS = ['Board', 'Table', 'Timeline'];
let view = (() => { try { return VIEWS.includes(localStorage.getItem('jh-apps-view')) ? localStorage.getItem('jh-apps-view') : 'Board'; } catch (e) { return 'Board'; } })();
let sortCol = 'applied_on', sortDir = -1, query = '';
const picked = new Set(); // applications ticked in the table (by id), for removing several at once

export function renderApplications(ctx, root) {
  const { data, act } = ctx;
  const apps = data.applications, sum = summary(apps);
  const sync = h('button', { type: 'button', class: 'btn btn-primary', id: 'sync-now', onclick: () => act.updateNow() }, icon('refresh'), h('span', {}, 'Sync now'));
  const add = h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => addDialog(ctx) }, icon('plus'), h('span', {}, 'Add manually'));
  const paste = h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => pasteDialog(ctx) }, icon('mail'), h('span', {}, 'Paste an email'));
  const gmail = act.gmailOn();
  const body = h('div', { class: 'apps-body' });
  const search = h('input', { type: 'search', class: 'search', placeholder: 'Search company, role or next step', 'aria-label': 'Search applications', value: query,
    oninput: () => { query = search.value; drawBody(); } });

  const matching = () => {
    const q = query.trim().toLowerCase();
    return apps.filter(a => !q || ['company', 'role', 'channel', 'status', 'next_step'].some(k => String(k === 'status' ? STATUS_LABEL[a.status] : a[k] || '').toLowerCase().includes(q)));
  };
  const drawBody = () => {
    const list = matching();
    if (!apps.length) {
      body.replaceChildren(h('div', { class: 'empty-block' }, h('h2', {}, gmail && data.gmailRunAt ? 'No applications found yet' : 'Your applications will appear here'),
        h('p', {}, !gmail ? 'Connect Gmail and they’ll be found for you, or paste an application email, or add one by hand.'
          : data.gmailRunAt ? 'Nothing in your Gmail looked like an application. Add one by hand, or sync again after you apply somewhere.' : 'Sync now reads your Gmail (read-only) and sorts every application email it finds.')));
      return;
    }
    body.replaceChildren(view === 'Board' ? renderBoard(ctx, list) : view === 'Timeline' ? renderTimeline(list) : table(ctx, list));
  };

  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'View' }, ...VIEWS.map(v => h('button', {
    type: 'button', role: 'tab', 'aria-selected': String(v === view), onclick: () => {
      view = v; try { localStorage.setItem('jh-apps-view', v); } catch (e) { /* fine */ }
      tabs.querySelectorAll('[role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.textContent === v)));
      drawBody();
    },
  }, v)));
  drawBody();

  const stats = h('section', { class: 'stats', 'aria-label': 'Totals' }, ...[
    ['Total', sum.total, 'applications sent'], ['Active', sum.active, 'still in play'],
    ['Interviews', sum.interviews, 'reached a round'], ['Offers', sum.offers, 'received'],
  ].map(([k, v, s]) => h('div', { class: 'stat' }, h('p', { class: 'stat-k' }, k), h('p', { class: 'stat-v' }, v), h('p', { class: 'stat-s' }, s))));

  const review = data.review.length ? h('div', { class: 'notice notice-orange' }, icon('alert'),
    h('p', {}, h('b', {}, `${data.review.length} email${data.review.length === 1 ? '' : 's'} need${data.review.length === 1 ? 's' : ''} a look.`), ' They seem to be about an application, but the company or stage wasn’t clear.'),
    h('button', { type: 'button', class: 'btn btn-sm btn-quiet', onclick: () => reviewDialog(ctx) }, 'Review')) : '';

  const askNotify = notifySupported() && !(data.settings.notify && notifyAllowed()) && !ctx.demo && !dismissedNotify() ? h('div', { class: 'notice' }, icon('bell'),
    h('p', {}, h('b', {}, 'Get notified when a status changes.'), ' And when new matches arrive, while Job Hunter is open.'),
    h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: (e) => busy(e.currentTarget, 'Asking…', () => act.enableNotifications()) }, 'Turn on'),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Not now', onclick: () => { try { localStorage.setItem('jh-notify-later', '1'); } catch (e) { /* fine */ } askNotify.remove(); } }, icon('x'))) : '';

  const connect = !gmail ? h('div', { class: 'notice' }, icon('mail'),
    h('p', {}, h('b', {}, 'Connect Gmail to track applications by themselves.'), ' Job Hunter reads your application emails (read-only) and moves each one along the board. Google will show an “unverified app” screen: choose Advanced, then Go to Job Hunter.'),
    h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: (e) => busy(e.currentTarget, 'Connecting…', () => act.connectGmail()) }, 'Connect Gmail')) : '';

  const src = bySource(apps);
  root.replaceChildren(
    pageHead('Applications', !gmail ? 'Gmail not connected' : data.gmailRunAt ? `Last synced from Gmail ${ago(data.gmailRunAt)}` : 'Not synced yet', search, sync, paste, add),
    connect, review, askNotify, stats,
    h('section', { class: 'apps', 'aria-label': 'Your applications' }, tabs, body),
    src.length ? h('section', { class: 'panel panel-narrow', 'aria-labelledby': 'src-title' },
      h('h2', { id: 'src-title', class: 'panel-title' }, 'Which channels get replies'),
      h('div', { class: 'table-box' }, h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Channel'), h('th', { class: 'num' }, 'Sent'), h('th', { class: 'num' }, 'Replies'), h('th', { class: 'num' }, 'Reply rate'))),
        h('tbody', {}, ...src.map(r => h('tr', {}, h('td', {}, r.channel), h('td', { class: 'num' }, r.sent), h('td', { class: 'num' }, r.replies), h('td', { class: 'num' }, r.rate + '%'))))))) : '');
}

const dismissedNotify = () => { try { return localStorage.getItem('jh-notify-later') === '1'; } catch (e) { return false; } };

function table(ctx, list) {
  const { act } = ctx;
  const ids = new Set(ctx.data.applications.map(a => a.id));
  [...picked].forEach(id => { if (!ids.has(id)) picked.delete(id); });
  const redraw = () => box.replaceWith(table(ctx, list));
  const pick = (a, on) => { if (on) picked.add(a.id); else picked.delete(a.id); redraw(); };
  const visible = list.filter(a => a.id);
  const all = h('input', { type: 'checkbox', 'aria-label': 'Select all shown', checked: visible.length > 0 && visible.every(a => picked.has(a.id)),
    onchange: () => { visible.forEach(a => (all.checked ? picked.add(a.id) : picked.delete(a.id))); redraw(); } });
  const playing = visible.filter(inPlay);
  const chosen = ctx.data.applications.filter(a => picked.has(a.id));
  const bar = h('div', { class: 'bulk-bar', role: 'region', 'aria-label': 'Selected applications' },
    h('span', {}, chosen.length ? `${chosen.length} selected` : 'Tick applications to remove several at once.'),
    playing.some(a => !picked.has(a.id)) ? h('button', { type: 'button', class: 'btn btn-quiet btn-sm', onclick: () => { playing.forEach(a => picked.add(a.id)); redraw(); } }, `Select all in play (${playing.length})`) : '',
    chosen.length ? h('button', { type: 'button', class: 'btn btn-quiet btn-sm', onclick: () => { picked.clear(); redraw(); } }, 'Clear') : '',
    chosen.length ? removeBtn(() => act.deleteApplications(chosen).then(() => picked.clear()), `Remove ${chosen.length}`, `Remove ${chosen.length} application${chosen.length === 1 ? '' : 's'}?`) : '');
  const head = h('tr', {}, h('th', { class: 'cell-pick' }, all), ...[['company', 'Company'], ['role', 'Role'], ['channel', 'Channel'], ['applied_on', 'Applied'], ['status', 'Status'], ['next_step', 'Next step']]
    .map(([k, l]) => h('th', { scope: 'col', 'aria-sort': k === sortCol ? (sortDir > 0 ? 'ascending' : 'descending') : null },
      h('button', { type: 'button', class: 'th-sort', onclick: (e) => { if (k === sortCol) sortDir = -sortDir; else { sortCol = k; sortDir = k === 'applied_on' ? -1 : 1; } e.currentTarget.closest('.table-wrap').replaceWith(table(ctx, list)); } }, l))),
    h('th', {}, h('span', { class: 'visually-hidden' }, 'Edit')));
  const rows = list.slice().sort((a, b) => sortDir * String(a[sortCol] || '').localeCompare(String(b[sortCol] || '')));
  const tbody = h('tbody', {}, ...(rows.length ? rows.map(a => {
    const tick = h('input', { type: 'checkbox', 'aria-label': `Select ${a.company}${a.role ? ' – ' + a.role : ''}`, checked: picked.has(a.id), onchange: () => pick(a, tick.checked) });
    const sel = h('select', { class: 'select-sm', 'aria-label': 'Status for ' + a.company, onchange: async () => {
      sel.disabled = true;
      try { await act.setApplicationStatus(a, sel.value); } catch (e) { toast(errText(e), true); sel.disabled = false; }
    } }, ...STATUSES.map(st => h('option', { value: st, selected: st === a.status }, STATUS_LABEL[st])));
    return h('tr', { class: picked.has(a.id) ? 'row-picked' : '' },
      h('td', { class: 'cell-pick' }, tick),
      h('td', {}, h('span', { class: 'cell-co' }, h('span', { class: 'ini' }, (a.company || '?').charAt(0).toUpperCase()), h('b', {}, a.company))),
      h('td', {}, isHttp(a.posting_link) ? h('a', { href: a.posting_link, target: '_blank', rel: 'noopener noreferrer', title: 'Open the job posting' }, a.role || 'Role not stated') : (a.role || 'Role not stated'),
        isHttp(a.email_link) ? h('a', { href: a.email_link, target: '_blank', rel: 'noopener noreferrer', class: 'cell-link', 'aria-label': `Open the latest ${a.company} email in Gmail` }, icon('mail')) : ''),
      h('td', {}, a.channel), h('td', { class: 'num' }, a.applied_on), h('td', {}, sel), h('td', { class: 'muted' }, a.next_step || ''),
      h('td', {}, h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Edit ${a.company}`, onclick: () => editDialog(ctx, a) }, icon('file'))));
  }) : [h('tr', {}, h('td', { colSpan: 8, class: 'empty' }, 'No applications match that search.'))]));
  const box = h('div', { class: 'table-wrap' }, bar, h('div', { class: 'table-box panel' }, h('table', { class: 'table' }, h('thead', {}, head), tbody)));
  return box;
}

function addDialog(ctx) {
  const f = (label, input) => h('label', { class: 'field' }, h('span', { class: 'field-lbl' }, label), input);
  const company = h('input', { required: true, autocomplete: 'off' });
  const role = h('input', { autocomplete: 'off' });
  const channel = h('input', { placeholder: 'LinkedIn, Naukri, company site…', autocomplete: 'off' });
  const date = h('input', { type: 'date', value: ymd(new Date()) });
  const status = h('div', { class: 'status', role: 'status' });
  const save = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Add application');
  const form = h('form', { class: 'stack', onsubmit: (e) => {
    e.preventDefault();
    busy(save, 'Adding…', async () => {
      await ctx.act.addApplication({ company: company.value, role: role.value, channel: channel.value, applied_on: date.value });
      close(); toast('Application added');
    }, status);
  } }, f('Company', company), f('Role', role), f('Where you applied', channel), f('Applied on', date), status, h('div', { class: 'row-end' }, save));
  const close = openDialog('Add an application', form);
  company.focus();
}

/** Emails that couldn't be matched: open them in Gmail, add them as an application, or dismiss. */
function reviewDialog(ctx) {
  const { data, act } = ctx;
  const list = h('ul', { class: 'review' });
  const draw = () => {
    if (!data.review.length) { close(); toast('All caught up'); return; }
    list.replaceChildren(...data.review.map(r => {
      const company = h('input', { value: r.company, 'aria-label': 'Company', placeholder: 'Company' });
      const stage = h('select', { 'aria-label': 'Stage' }, ...STATUSES.map(s => h('option', { value: s, selected: s === r.stage }, STATUS_LABEL[s])));
      const addBtn = h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => busy(addBtn, 'Adding…', async () => {
        await act.resolveReview(r, { company: company.value, stage: stage.value }); draw();
      }) }, 'Add');
      return h('li', {},
        h('div', { class: 'review-subj' }, h('b', {}, r.subject || '(no subject)'), h('span', {}, `${r.from} · ${r.date}`),
          /@/.test(r.from) ? copyButton((r.from.match(/[^\s<>"]+@[^\s<>"]+/) || [r.from])[0], 'Copy address') : ''),
        h('div', { class: 'review-ctl' }, company, stage, addBtn,
          h('button', { type: 'button', class: 'btn btn-sm btn-quiet', onclick: async () => { await act.resolveReview(r, null); draw(); } }, 'Not an application'),
          isHttp(r.link) ? h('a', { href: r.link, target: '_blank', rel: 'noopener noreferrer', class: 'icon-btn', 'aria-label': 'Open in Gmail' }, icon('external')) : ''));
    }));
  };
  const close = openDialog('Emails that need a look', list);
  draw();
}

/** No Gmail? Paste an application email: it's read (rules, then the AI), you check the guess, then add it. */
function pasteDialog(ctx) {
  const { act } = ctx;
  const f = (label, input) => h('label', { class: 'field' }, h('span', { class: 'field-lbl' }, label), input);
  const text = h('textarea', { placeholder: 'Open the email, select all of it (with the subject and sender if you can), copy, and paste it here.', 'aria-label': 'Email text' });
  const status = h('div', { class: 'status', role: 'status' });
  const step2 = h('div', { class: 'stack', hidden: true });
  const read = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => busy(read, 'Reading…', async () => {
    const g = await act.readPastedEmail(text.value);
    const company = h('input', { value: g.company, autocomplete: 'off', required: true });
    const role = h('input', { value: g.role, autocomplete: 'off' });
    const stage = h('select', {}, ...STATUSES.map(s => h('option', { value: s, selected: s === g.stage }, STATUS_LABEL[s])));
    const step = h('input', { value: g.next_step, autocomplete: 'off' });
    const date = h('input', { type: 'date', value: ymd(new Date()) });
    const msg = h('div', { class: 'status', role: 'status' });
    const add = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => busy(add, 'Adding…', async () => {
      await act.addFromEmail(Object.assign({}, g, { company: company.value, role: role.value, stage: stage.value, next_step: step.value, date: date.value }));
      close(); toast('Application added');
    }, msg) }, 'Add application');
    step2.replaceChildren(
      h('p', { class: g.looksLikeOne ? 'hint' : 'status warn' }, g.looksLikeOne ? 'Here’s what it says. Fix anything that’s wrong.' : 'This doesn’t look like an application email, but you can still add it.'),
      f('Company', company), f('Role', role), f('Status', stage), f('Next step', step), f('Email date', date), msg, h('div', { class: 'row-end' }, add));
    step2.hidden = false; read.hidden = true; text.readOnly = true;
    company.focus();
  }, status) }, 'Read it');
  const close = openDialog('Paste an application email', h('div', { class: 'stack' }, text, status, h('div', { class: 'row-end' }, read), step2));
  text.focus();
}
