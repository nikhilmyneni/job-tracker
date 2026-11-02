/**
 * The guided Apply flow, the same from Home, Jobs for you and the resume page:
 *   1. your resume for this job is ready (download it)
 *   2. apply on the company's site (opens the posting; remembered as apply_clicked)
 *   3. "Done applying?" → it goes on your board as Applied
 * Coming back to this tab after opening the posting asks step 3 again. Nothing is ever applied for you.
 */
import { h, busy, icon, isHttp, openDialog, toast, errText } from './ui.js';
import { tailorSuggestions, applySuggestions, atsScore, matchLabel } from './core.js';

/** Your resume for this job: your saved choices on the resume page, or else every safe change (never "Add a skill"). */
export function readyResume(ctx, job) {
  const { data, act } = ctx;
  const base = act.baseResume();
  const all = tailorSuggestions(base, job, data.cv, data.settings.keywords, data.settings.prefs.roles);
  const t = job.tailored || {};
  const accepted = Array.isArray(t.accepted) ? all.filter(s => t.accepted.includes(s.id)) : all.filter(s => !s.warn);
  return { resume: applySuggestions(base, accepted).resume, template: t.template || 'standard', changes: accepted.length };
}

/** Opens the Apply panel for a job. onDone runs after "Yes, I applied". */
export function openApply(ctx, job, onDone = () => {}) {
  const { data, act } = ctx;
  const step = (n, title, ...body) => h('li', { class: 'ap-step', dataset: { step: n } },
    h('span', { class: 'ap-num', 'aria-hidden': 'true' }, n), h('div', { class: 'ap-body' }, h('h3', {}, title), ...body));

  // 1. The resume
  let resumeStep;
  if (!data.cv) {
    resumeStep = step(1, 'Add your CV first', h('p', {}, 'We make a resume for each job from your CV.'),
      h('a', { class: 'btn btn-quiet', href: '/app/profile', onclick: () => close() }, 'Add my CV'));
  } else {
    const { resume, template, changes } = readyResume(ctx, job);
    const fit = matchLabel(atsScore(resume, job, data.settings.keywords).score).label;
    const status = h('div', { class: 'status', role: 'status' });
    const dl = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => busy(dl, 'Preparing…', async () => {
      await act.downloadResume(job, resume, 'pdf', template);
      status.className = 'status ok'; status.textContent = 'Downloaded. Upload this file when the site asks for your resume.';
    }, status) }, icon('download'), h('span', {}, 'Download my resume (PDF)'));
    resumeStep = step(1, 'Your resume for this job is ready',
      h('p', {}, `How well it fits: ${fit}.`, changes ? ` ${changes} change${changes === 1 ? '' : 's'} made for this job. ` : ' ',
        h('a', { href: `/app/tailor/${encodeURIComponent(job.id)}`, onclick: () => close() }, changes ? 'See or edit them' : 'Make it fit better')),
      dl, status);
  }

  // 2. The company's site
  let opened = false;
  const siteStep = step(2, `Apply on ${job.company || 'the company'}’s site`,
    isHttp(job.link)
      ? h('a', { class: 'btn btn-quiet', href: job.link, target: '_blank', rel: 'noopener noreferrer', onclick: () => { opened = true; act.markApplyClicked(job).catch(() => {}); } },
        icon('external'), h('span', {}, 'Open the job page'))
      : h('p', {}, 'This job didn’t come with a link. Search for it on the company’s careers page.'),
    h('p', { class: 'hint' }, 'Fill in the form there and upload the resume above. Applying is always your click.'));

  // 3. Done?
  const yes = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => busy(yes, 'Saving…', async () => {
    await act.setJobStatus(job, 'Applied');
    close(); toast(`Added to My applications. We’ll track ${job.company || 'it'} for you.`); onDone();
  }) }, 'Yes, I applied');
  const doneStep = step(3, 'Done applying?', h('div', { class: 'row' }, yes,
    h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => close() }, 'Not yet')));

  const close = openDialog(`${job.role}${job.company ? ' · ' + job.company : ''}`, h('ol', { class: 'ap-steps' }, resumeStep, siteStep, doneStep));
  const dialog = document.getElementById('dialog');
  dialog.classList.add('dialog-sheet');
  // Back from the job page: ask the last step.
  const back = () => {
    if (document.visibilityState !== 'visible' || !opened || !dialog.open) return;
    doneStep.classList.add('ap-ask'); yes.focus();
  };
  document.addEventListener('visibilitychange', back);
  dialog.addEventListener('close', () => { document.removeEventListener('visibilitychange', back); dialog.classList.remove('dialog-sheet'); }, { once: true });
}

/** "Did you apply?" answers from Home: yes puts it on the board; not yet forgets the click. */
export async function answerApplied(ctx, job, yes) {
  try {
    if (yes) { await ctx.act.setJobStatus(job, 'Applied'); toast(`Added to My applications.`); }
    else await ctx.act.forgetApplyClick(job);
  } catch (e) { toast(errText(e), true); }
}
