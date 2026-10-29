/**
 * Resume tailor. For now: pick a job, then hand your CV (as ResumeFold's JSON, with this job filled in) to
 * ResumeFold, which tailors it. The in-app editor comes next.
 */
import { h, busy, icon, pageHead, extLink, isHttp } from './ui.js';
import { RESUMEFOLD_URL } from './core.js';

export function renderTailor(ctx, root, jobId) {
  const { data, act } = ctx;
  const job = jobId && data.jobs.find(j => j.id === jobId);
  if (!job) {
    const recent = data.jobs.filter(j => j.status !== 'Skipped').slice(-6).reverse();
    root.replaceChildren(pageHead('Resume tailor', 'Pick a job to tailor your CV for it'),
      recent.length ? h('ul', { class: 'pick' }, ...recent.map(j => h('li', {}, h('a', { href: `/app/tailor/${encodeURIComponent(j.id)}`, 'data-link': '' },
        h('b', {}, j.role), h('span', {}, j.company))))) :
        h('div', { class: 'empty-block' }, h('h2', {}, 'No jobs to tailor for yet'), h('p', {}, 'Open Job matches after your next sync, then choose Tailor resume on any job.')));
    return;
  }
  const status = h('div', { class: 'status', role: 'status' });
  const go = h('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: () => busy(go, 'Preparing your file…', async () => {
    await act.exportResumeFold(job);
    status.className = 'status ok';
    status.replaceChildren('Downloaded. In ResumeFold, open Review, choose Import JSON and pick the file. ', extLink(RESUMEFOLD_URL, 'Open ResumeFold'));
  }, status) }, icon('file'), h('span', {}, 'Open in ResumeFold'));
  root.replaceChildren(
    pageHead(job.role, `${job.company}${job.location ? ' · ' + job.location : ''}`, isHttp(job.link) ? extLink(job.link, 'Open posting', 'btn btn-quiet') : ''),
    h('section', { class: 'panel panel-narrow' },
      h('h2', { class: 'panel-title' }, 'Tailor in ResumeFold'),
      h('ol', { class: 'how-list' },
        h('li', {}, 'Job Hunter turns your CV into ResumeFold’s format, adds this job’s description and downloads the file. Nothing is rewritten.'),
        h('li', {}, 'In ResumeFold, go to Review and choose Import JSON.'),
        h('li', {}, 'Use its keyword match against this job, pick a layout and export your PDF or Word file.')),
      go, status));
}
