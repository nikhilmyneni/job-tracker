/** The dashboard: headline, tiles, recommended jobs, charts, channels, applications. */
import { $, h, busy, pill, emptyRow, extLink, isHttp, weeklyChart, errText, toast } from './ui.js';
import { STATUSES, summary, funnel, bySource, weekly } from './core.js';
import { hasAi } from './ai.js';

let sortCol = 'applied_on', sortDir = -1;

export function renderDashboard(ctx) {
  const { data } = ctx;
  const apps = data.applications, sum = summary(apps), src = bySource(apps);
  const best = src.filter(r => r.sent >= 2)[0];
  $('takeaway').replaceChildren(h('b', {}, sum.responses), ` of ${sum.total} applications got a reply.`,
    ...(best ? [' ', h('b', {}, best.channel), ` is your best channel, with a ${best.rate}% reply rate.`] : []));
  $('tiles').replaceChildren(...[
    ['Applications sent', sum.total, 'All time'], ['Still in play', sum.active, 'Applied, screening or interviewing'],
    ['Reply rate', sum.rate + '%', 'Got past "applied"'], ['Interviews', sum.interviews, 'Reached an interview round'],
    ['Offers', sum.offers, 'Received'],
  ].map(([l, n, s]) => h('div', { class: 'card' }, h('div', { class: 'lbl' }, l), h('div', { class: 'num' }, n), h('div', { class: 'sub' }, s))));
  renderJobs(ctx);
  renderFunnel(apps);
  weeklyChart($('weekly'), weekly(apps));
  $('sources-body').replaceChildren(...(src.length ? src.map(r => h('tr', {}, h('td', {}, r.channel), h('td', {}, r.sent), h('td', {}, r.replies), h('td', {}, r.rate + '%'))) : [emptyRow(4, 'No applications yet.')]));
  renderApps(ctx);
}

export function renderJobs(ctx) {
  const { data, act } = ctx;
  const body = $('jobs-body'), want = $('jobs-status').value;
  const canResume = hasAi(data.settings) && !!data.cv;
  const rows = data.jobs.filter(j => !want || j.status === want)
    .sort((a, b) => b.fit - a.fit || String(b.found_on).localeCompare(String(a.found_on)));
  if (!rows.length) {
    body.replaceChildren(emptyRow(10, want === 'New'
      ? (hasAi(data.settings) ? 'No new jobs yet. New matches arrive with your next update.' : 'Add a free AI key in Settings to get job matches from your job-alert emails.')
      : 'Nothing here.'));
    return;
  }
  body.replaceChildren(...rows.map(j => {
    const acts = h('div', { class: 'acts' });
    if (j.status === 'New' && isHttp(j.link)) acts.append(extLink(j.link, 'Apply now ↗', 'btn'));
    if (j.resume || canResume) acts.append(h('button', { class: 'btn ghost', type: 'button', onclick: () => act.openResume(j) }, j.resume ? 'Open resume' : 'Make resume'));
    if (j.status === 'New') {
      const ap = h('button', { class: 'link', type: 'button', onclick: () => busy(ap, '…', () => act.setJobStatus(j, 'Applied')) }, 'Mark applied');
      const sk = h('button', { class: 'link', type: 'button', onclick: () => busy(sk, '…', () => act.setJobStatus(j, 'Skipped')) }, 'Skip');
      acts.append(h('div', {}, ap, ' · ', sk));
    }
    return h('tr', {},
      h('td', {}, j.fit), h('td', {}, j.company),
      h('td', {}, isHttp(j.link) ? extLink(j.link, j.role) : j.role),
      h('td', { class: 'hide-sm' }, j.location), h('td', {}, j.pay), h('td', { class: 'hide-sm' }, j.why),
      h('td', { class: 'hide-sm' }, j.skill_gap), h('td', {}, j.apply_by),
      h('td', {}, pill(j.status, j.status === 'Applied' ? 'Applied-job' : j.status)), h('td', {}, acts));
  }));
}

function renderFunnel(apps) {
  const box = $('funnel');
  if (!apps.length) { box.replaceChildren(h('div', { class: 'empty' }, 'No applications yet.')); return; }
  box.replaceChildren(...funnel(apps).map(r => {
    const bar = h('div', { class: 'bar' + (r.stage === 'Offer' ? ' ok' : '') });
    requestAnimationFrame(() => { bar.style.width = r.share + '%'; });
    return h('div', { class: 'frow' }, h('span', {}, r.stage), h('div', { class: 'track' }, bar),
      h('span', { class: 'fval' }, r.n, h('span', {}, ` · ${r.share}%`)));
  }));
}

export function renderApps(ctx) {
  const { data, act } = ctx;
  const body = $('apps-body'), q = $('apps-search').value.trim().toLowerCase(), want = $('apps-filter').value;
  document.querySelectorAll('#apps-head th[data-col]').forEach(th => {
    if (th.dataset.col === sortCol) th.setAttribute('aria-sort', sortDir > 0 ? 'ascending' : 'descending'); else th.removeAttribute('aria-sort');
  });
  const rows = data.applications
    .filter(a => !want || a.status === want)
    .filter(a => !q || ['company', 'role', 'channel', 'status', 'next_step'].some(k => String(a[k] || '').toLowerCase().includes(q)))
    .sort((a, b) => sortDir * String(a[sortCol] || '').localeCompare(String(b[sortCol] || '')));
  if (!rows.length) { body.replaceChildren(emptyRow(7, data.applications.length ? 'No applications match.' : 'No applications yet. Click Update now, or add one below.')); return; }
  body.replaceChildren(...rows.map(a => {
    const sel = h('select', { 'aria-label': 'Status for ' + a.company, onchange: async () => {
      sel.disabled = true;
      try { await act.setApplicationStatus(a, sel.value); } catch (e) { toast(errText(e), true); sel.disabled = false; }
    } }, ...STATUSES.map(st => h('option', { value: st, selected: st === a.status }, st)));
    const del = h('button', { class: 'link', type: 'button', onclick: async () => {
      if (!confirm(`Remove ${a.company}${a.role ? ' – ' + a.role : ''}?`)) return;
      try { await act.deleteApplication(a); } catch (e) { toast(errText(e), true); }
    } }, 'Remove');
    return h('tr', {},
      h('td', {}, a.company),
      h('td', {}, isHttp(a.email_link) ? h('a', { href: a.email_link, target: '_blank', rel: 'noopener noreferrer', title: 'Open the email in Gmail' }, a.role || '(role not stated)') : a.role),
      h('td', { class: 'hide-sm' }, a.channel), h('td', {}, a.applied_on), h('td', {}, sel),
      h('td', { class: 'hide-sm' }, a.next_step), h('td', {}, del));
  }));
}

/** One-time wiring for the dashboard's filters, sorting and add form. */
export function wireDashboard(ctx) {
  STATUSES.forEach(st => $('apps-filter').append(h('option', {}, st)));
  $('jobs-status').addEventListener('change', () => renderJobs(ctx));
  $('apps-search').addEventListener('input', () => renderApps(ctx));
  $('apps-filter').addEventListener('change', () => renderApps(ctx));
  $('apps-head').addEventListener('click', (e) => {
    const th = e.target.closest('th[data-col]'); if (!th) return;
    if (th.dataset.col === sortCol) sortDir = -sortDir; else { sortCol = th.dataset.col; sortDir = sortCol === 'applied_on' ? -1 : 1; }
    renderApps(ctx);
  });
  $('add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    busy(btn, 'Adding…', async () => {
      await ctx.act.addApplication({ company: $('add-company').value, role: $('add-role').value, channel: $('add-channel').value, applied_on: $('add-date').value });
      e.target.reset();
    });
  });
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => weeklyChart($('weekly'), weekly(ctx.data.applications)), 150); });
}
