/** Applications: everything you've applied to, kept up to date from Gmail. */
import { h, busy, icon, pageHead, ago, openDialog, isHttp, toast, errText } from './ui.js';
import { STATUSES, summary, bySource } from './core.js';

let sortCol = 'applied_on', sortDir = -1, query = '';

export function renderApplications(ctx, root) {
  const { data, act } = ctx;
  const apps = data.applications, sum = summary(apps);
  const sync = h('button', { type: 'button', class: 'btn btn-primary', id: 'sync-now', onclick: () => act.updateNow() }, icon('refresh'), h('span', {}, 'Sync now'));
  const add = h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => addDialog(ctx) }, icon('plus'), h('span', {}, 'Add manually'));
  const search = h('input', { type: 'search', class: 'search', placeholder: 'Search company, role or next step', 'aria-label': 'Search applications', value: query,
    oninput: () => { query = search.value; drawTable(); } });

  const stats = h('section', { class: 'stats', 'aria-label': 'Totals' }, ...[
    ['Total', sum.total, 'applications sent'], ['Active', sum.active, 'still in play'],
    ['Interviews', sum.interviews, 'reached a round'], ['Offers', sum.offers, 'received'],
  ].map(([k, v, s]) => h('div', { class: 'stat' }, h('p', { class: 'stat-k' }, k), h('p', { class: 'stat-v' }, v), h('p', { class: 'stat-s' }, s))));

  const tbody = h('tbody');
  const head = h('tr', {}, ...[['company', 'Company'], ['role', 'Role'], ['channel', 'Channel'], ['applied_on', 'Applied'], ['status', 'Status'], ['next_step', 'Next step']]
    .map(([k, l]) => h('th', { scope: 'col', 'aria-sort': k === sortCol ? (sortDir > 0 ? 'ascending' : 'descending') : null },
      h('button', { type: 'button', class: 'th-sort', onclick: () => { if (k === sortCol) sortDir = -sortDir; else { sortCol = k; sortDir = k === 'applied_on' ? -1 : 1; } renderApplications(ctx, root); } }, l))),
    h('th', {}, h('span', { class: 'visually-hidden' }, 'Actions')));
  const drawTable = () => {
    const q = query.trim().toLowerCase();
    const rows = apps.filter(a => !q || ['company', 'role', 'channel', 'status', 'next_step'].some(k => String(a[k] || '').toLowerCase().includes(q)))
      .sort((a, b) => sortDir * String(a[sortCol] || '').localeCompare(String(b[sortCol] || '')));
    if (!rows.length) {
      tbody.replaceChildren(h('tr', {}, h('td', { colSpan: 7, class: 'empty' }, apps.length ? 'No applications match that search.' : 'No applications yet. Sync now reads your Gmail, or add one by hand.')));
      return;
    }
    tbody.replaceChildren(...rows.map(a => {
      const sel = h('select', { class: 'select-sm', 'aria-label': 'Status for ' + a.company, onchange: async () => {
        sel.disabled = true;
        try { await act.setApplicationStatus(a, sel.value); } catch (e) { toast(errText(e), true); sel.disabled = false; }
      } }, ...STATUSES.map(st => h('option', { value: st, selected: st === a.status }, st)));
      return h('tr', {},
        h('td', {}, h('span', { class: 'cell-co' }, h('span', { class: 'ini' }, (a.company || '?').charAt(0).toUpperCase()), h('b', {}, a.company))),
        h('td', {}, isHttp(a.email_link) ? h('a', { href: a.email_link, target: '_blank', rel: 'noopener noreferrer', title: 'Open the email in Gmail' }, a.role || 'Role not stated') : (a.role || 'Role not stated')),
        h('td', {}, a.channel), h('td', { class: 'num' }, a.applied_on), h('td', {}, sel), h('td', { class: 'muted' }, a.next_step || ''),
        h('td', {}, h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Remove ${a.company}`, onclick: async () => {
          if (!confirm(`Remove ${a.company}${a.role ? ' – ' + a.role : ''}?`)) return;
          try { await act.deleteApplication(a); } catch (e) { toast(errText(e), true); }
        } }, icon('x'))));
    }));
  };
  drawTable();

  const src = bySource(apps);
  root.replaceChildren(
    pageHead('Applications', data.lastRunAt ? `Last synced from Gmail ${ago(data.lastRunAt)}` : 'Not synced yet', search, sync, add),
    stats,
    h('section', { class: 'panel', 'aria-labelledby': 'apps-title' },
      h('h2', { id: 'apps-title', class: 'panel-title' }, 'All applications'),
      h('div', { class: 'table-box' }, h('table', { class: 'table' }, h('thead', {}, head), tbody))),
    h('section', { class: 'panel panel-narrow', 'aria-labelledby': 'src-title' },
      h('h2', { id: 'src-title', class: 'panel-title' }, 'Which channels get replies'),
      src.length ? h('div', { class: 'table-box' }, h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Channel'), h('th', { class: 'num' }, 'Sent'), h('th', { class: 'num' }, 'Replies'), h('th', { class: 'num' }, 'Reply rate'))),
        h('tbody', {}, ...src.map(r => h('tr', {}, h('td', {}, r.channel), h('td', { class: 'num' }, r.sent), h('td', { class: 'num' }, r.replies), h('td', { class: 'num' }, r.rate + '%'))))))
        : h('p', { class: 'empty' }, 'Reply rates show up once you have applications.')));
}

function addDialog(ctx) {
  const f = (label, input) => h('label', { class: 'field' }, h('span', { class: 'field-lbl' }, label), input);
  const company = h('input', { required: true, autocomplete: 'off' });
  const role = h('input', { autocomplete: 'off' });
  const channel = h('input', { placeholder: 'LinkedIn, Naukri, company site…', autocomplete: 'off' });
  const date = h('input', { type: 'date', value: new Date().toISOString().slice(0, 10) });
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

