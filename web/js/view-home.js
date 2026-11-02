/**
 * Home: what to do next, in order. New jobs to apply to, interviews and tests coming up, "Did you apply?" for jobs
 * whose page you opened, applications waiting to hear back, and a few set-up cards until they're done.
 * Built from homeFeed (core.js); applying goes through the shared Apply panel (apply.js).
 */
import { h, busy, icon, pageHead, ago } from './ui.js';
import { homeFeed, matchLabel, nextLabel, roleKind, fieldHint } from './core.js';
import { openApply, answerApplied } from './apply.js';

export function renderHome(ctx, root) {
  const { data, act } = ctx;
  const feed = homeFeed(data);
  const first = String(data.settings.name || (ctx.me && ctx.me.name) || '').split(/\s+/)[0];
  const redraw = () => renderHome(ctx, root);
  const sec = (title, sub, ...body) => h('section', { class: 'home-sec' }, h('div', { class: 'home-sec-head' }, h('h2', {}, title), sub || ''), ...body);
  const level = (sc) => { const m = matchLabel(sc); return h('span', { class: `lvl lvl-${m.tone}` }, `${m.label} fit`); };

  // 1. New jobs
  const jobCard = (j) => h('li', { class: 'home-job' },
    h('div', { class: 'home-job-text' },
      h('b', {}, j.role), h('span', {}, [j.company, j.location, j.pay && !/not listed/i.test(j.pay) ? j.pay : ''].filter(Boolean).join(' · ')),
      h('span', { class: 'home-job-why' }, level(j.score), fieldHint(roleKind(j.role, data.settings.prefs.roles)) ? h('span', { class: 'hint-chip' }, fieldHint(roleKind(j.role, data.settings.prefs.roles))) : '',
        j.why ? h('span', { class: 'clip' }, j.why) : '')),
    h('div', { class: 'home-job-acts' },
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => openApply(ctx, j, redraw) }, 'Apply'),
      h('a', { class: 'btn btn-quiet', href: `/app/tailor/${encodeURIComponent(j.id)}` }, 'See resume')));
  const jobs = feed.newCount
    ? sec(`${feed.newCount} new job${feed.newCount === 1 ? '' : 's'} for you`, h('a', { class: 'link', href: '/app/matches' }, 'See all'),
      h('ul', { class: 'home-jobs' }, ...feed.newJobs.map(jobCard)))
    : sec('Jobs for you', '', h('div', { class: 'home-empty' }, icon('search'),
      h('p', {}, data.cv ? (data.jobsRunAt ? 'No new jobs right now. We look again at your daily time, and you’ll see them here.' : 'We’re finding jobs that fit your CV. This takes a minute or two.')
        : 'Add your CV and we’ll find jobs that fit it.'),
      data.cv ? h('a', { class: 'btn btn-quiet', href: '/app/matches' }, 'See all jobs') : h('a', { class: 'btn btn-primary', href: '/app/profile' }, 'Add my CV')));

  // 2. Did you apply?
  const asked = feed.didYouApply.length ? sec('Did you apply?', h('span', { class: 'hint' }, 'You opened these job pages'),
    h('ul', { class: 'home-list' }, ...feed.didYouApply.map(j => h('li', {},
      h('div', { class: 'home-list-text' }, h('b', {}, j.role), h('span', {}, [j.company, 'opened ' + ago(j.apply_clicked)].filter(Boolean).join(' · '))),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: (e) => busy(e.currentTarget, 'Saving…', () => answerApplied(ctx, j, true).then(redraw)) }, 'Yes, I applied'),
        h('button', { type: 'button', class: 'btn btn-sm btn-quiet', onclick: (e) => busy(e.currentTarget, '…', () => answerApplied(ctx, j, false).then(redraw)) }, 'Not yet')))))) : '';

  // 3. Coming up
  const coming = feed.comingUp.length ? sec('Coming up', '', h('ul', { class: 'home-list' }, ...feed.comingUp.map(a => {
    const n = nextLabel(a);
    return h('li', {}, h('span', { class: `pill pill-${n.tone || 'blue'}` }, n.text || 'Soon'),
      h('div', { class: 'home-list-text' }, h('b', {}, a.company), h('span', {}, [a.role, a.next_step].filter(Boolean).join(' · '))),
      h('a', { class: 'btn btn-sm btn-quiet', href: '/app/applications' }, 'Open'));
  }))) : '';

  // 4. Waiting to hear back
  const waiting = feed.waiting || feed.review ? sec('Your applications', '',
    h('div', { class: 'home-tiles' },
      h('a', { class: 'home-tile', href: '/app/applications' }, h('b', {}, String(feed.waiting)), h('span', {}, `waiting to hear back`)),
      feed.review ? h('a', { class: 'home-tile home-tile-warn', href: '/app/applications' }, h('b', {}, String(feed.review)), h('span', {}, `email${feed.review === 1 ? '' : 's'} we need your help with`)) : '')) : '';

  // 5. Set up, until done
  const gmail = act.gmailOn();
  const setup = [
    !data.cv && ['Add your CV', 'So we can find jobs that fit you and make a resume for each.', h('a', { class: 'btn btn-sm btn-primary', href: '/app/profile' }, 'Add my CV')],
    !gmail && ['Track your applications by themselves', 'Connect Gmail (read-only) and we’ll keep each application up to date from your emails.',
      h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: (e) => busy(e.currentTarget, 'Connecting…', () => act.connectGmail().then(redraw)) }, 'Connect Gmail')],
    !data.settings.emailAlerts && !ctx.demo && ['Get new jobs by email', 'Once a day, at a time you choose, even when this page is closed.', h('a', { class: 'btn btn-sm btn-quiet', href: '/app/settings' }, 'Turn on')],
  ].filter(Boolean);
  const setupSec = setup.length ? sec('Finish setting up', '', h('ul', { class: 'home-setup' }, ...setup.map(([t, s, b]) => h('li', {}, h('div', {}, h('b', {}, t), h('p', {}, s)), b)))) : '';

  root.replaceChildren(
    pageHead(first ? `Hi ${first}` : 'Home', data.lastRunAt ? `Up to date · checked ${ago(data.lastRunAt)}` : 'Here’s what to do next'),
    h('div', { class: 'home' }, jobs, asked, coming, waiting, setupSec));
}
