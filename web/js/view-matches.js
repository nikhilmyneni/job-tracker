/** Job matches: openings from job-alert emails, company boards and job APIs, best fit first. */
import { h, busy, icon, pageHead, ago, extLink, isHttp, pill } from './ui.js';
import { hasAi } from './ai.js';

let show = 'New';

export function renderMatches(ctx, root) {
  const { data, act } = ctx;
  const filter = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Show' }, ...['New', 'Saved', 'Applied', 'Skipped'].map(v =>
    h('button', { type: 'button', role: 'radio', 'aria-checked': String(show === v), onclick: () => { show = v; renderMatches(ctx, root); } }, v)));
  const rows = data.jobs.filter(j => j.status === show || (show === 'Skipped' && j.status === 'Expired'))
    .sort((a, b) => b.fit - a.fit || String(b.found_on).localeCompare(String(a.found_on)));
  const list = rows.length ? h('ul', { class: 'jobs' }, ...rows.map(j => {
    const score = Math.round(Number(j.fit) * 20);
    const acts = h('div', { class: 'job-acts' },
      isHttp(j.link) ? extLink(j.link, 'Open posting', 'btn btn-sm btn-quiet') : '',
      h('a', { class: 'btn btn-sm btn-primary', href: `/app/tailor/${encodeURIComponent(j.id)}`, 'data-link': '' }, 'Tailor resume'));
    if (j.status === 'New' || j.status === 'Saved') {
      const ap = h('button', { type: 'button', class: 'btn btn-sm btn-quiet', onclick: () => busy(ap, 'Saving…', () => act.setJobStatus(j, 'Applied')) }, 'Mark applied');
      const sk = h('button', { type: 'button', class: 'btn btn-sm btn-quiet', onclick: () => busy(sk, '…', () => act.setJobStatus(j, 'Skipped')) }, 'Not for me');
      acts.append(ap, sk);
    }
    return h('li', { class: 'job' },
      h('span', { class: 'score' + (score >= 80 ? ' score-hi' : ''), 'aria-label': `Match ${score}%` }, score),
      h('div', { class: 'job-body' },
        h('h3', {}, j.role), h('p', { class: 'job-meta' }, [j.company, j.location, j.found_on ? 'found ' + ago(j.found_on + 'T09:00:00') : ''].filter(Boolean).join(' · ')),
        j.why ? h('p', { class: 'job-why' }, j.why) : '',
        h('p', { class: 'chips-row' }, j.skill_gap && j.skill_gap !== 'None' ? h('span', { class: 'kw kw-miss' }, '+ ' + j.skill_gap) : '', h('span', { class: 'job-src' }, j.source || 'Job alert email'), j.pay ? pill(j.pay, '') : ''),
        acts));
  })) : h('div', { class: 'empty-block' },
    h('h2', {}, show === 'New' ? 'No new matches yet' : `Nothing ${show.toLowerCase()} yet`),
    h('p', {}, !hasAi(data.settings) ? 'Scoring is paused because the AI isn’t available right now.'
      : !data.cv ? 'Add your CV in Profile and CV, then sync.'
        : 'New openings arrive with each sync. Add companies to follow in Settings for more.'));
  root.replaceChildren(pageHead('Job matches', `${data.jobs.filter(j => j.status === 'New').length} new · scored against your CV and preferences`, filter), list);
}
