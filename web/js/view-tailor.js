/**
 * Resume tailor: the job description with your skills highlighted, suggested edits you accept or undo (only ever
 * reordering, rewording or bringing forward what your CV says; "Add skill" needs you to confirm), a live one-page
 * preview in ResumeFold's four layouts, and downloads (ResumeFold, PDF, Word, LaTeX). Saved with the job.
 */
import { h, busy, icon, pageHead, extLink, isHttp, toast, errText } from './ui.js';
import { TEMPLATES, tailorSuggestions, applySuggestions, tailorScore, highlightJd, termsIn, dateRange, RESUMEFOLD_URL } from './core.js';

export function renderTailor(ctx, root, jobId) {
  const { data, act } = ctx;
  const job = jobId && data.jobs.find(j => j.id === jobId);
  if (!job) { renderPicker(ctx, root); return; }
  if (!data.cv) {
    root.replaceChildren(pageHead('Resume tailor', `${job.role} · ${job.company}`),
      h('div', { class: 'empty-block' }, h('h2', {}, 'Add your CV first'), h('p', {}, 'Tailoring starts from your CV. Add it in Profile and CV, then come back.')));
    return;
  }
  const saved = job.tailored || {};
  const list = (v) => (Array.isArray(v) ? v : []);
  const t = { accepted: list(saved.accepted), confirmed: list(saved.confirmed), template: saved.template in TEMPLATES ? saved.template : 'standard',
    extra: list(saved.extra).filter(x => x && x.id === 'summary' && x.patch && typeof x.patch.value === 'string') };
  const base = act.baseResume();
  const save = () => act.saveTailored(job, t).catch(e => toast(errText(e), true));

  // ---------- the three columns ----------
  const jdCol = h('section', { class: 'tl-col tl-jd', 'aria-labelledby': 'jd-h' });
  const midCol = h('section', { class: 'tl-col tl-mid', 'aria-label': 'Match and suggested edits' });
  const preview = h('section', { class: 'tl-col tl-preview', 'aria-labelledby': 'pv-h' });

  const draw = () => {
    const all = [...tailorSuggestions(base, job, data.cv, data.settings.keywords), ...t.extra];
    const accepted = all.filter(s => t.accepted.includes(s.id));
    const { resume, changed } = applySuggestions(base, accepted);
    const baseScore = tailorScore(base, job, data.settings.keywords).score;
    const now = tailorScore(resume, job, data.settings.keywords);
    t.resume = resume;

    // (a) the job description
    const have = termsIn(resume.summary + '\n' + data.cv + '\n' + resume.skills.flatMap(s => s.items).join(', '), data.settings.keywords);
    const jd = job.jd || job.details || '';
    jdCol.replaceChildren(
      h('h2', { class: 'panel-title', id: 'jd-h' }, 'The job'),
      h('p', { class: 'legend' }, h('span', { class: 'kw' }, 'On your CV'), ' ', h('span', { class: 'kw kw-miss' }, 'Not on your CV')),
      jd ? h('div', { class: 'jd-text' }, ...highlightJd(jd, have, data.settings.keywords).map(p => (p.kind ? h('mark', { class: 'hl hl-' + p.kind, title: p.kind === 'have' ? 'On your CV' : 'Not on your CV' }, p.text) : p.text)))
        : h('p', { class: 'empty' }, 'No description came with this job. Open the posting to read it.'),
      isHttp(job.link) ? extLink(job.link, 'Open posting', 'btn btn-quiet btn-sm') : '');

    // (b) the score and the edits
    const delta = now.score - baseScore;
    const card = h('div', { class: 'score-card' },
      h('p', { class: 'score-card-k' }, 'JD match'),
      h('p', { class: 'score-card-v' }, now.score + '%'),
      h('p', { class: 'score-card-s' }, delta > 0 ? `from ${baseScore}% on your base CV` : 'on your base CV'),
      h('div', { class: 'meter-track' }, h('i')));
    card.querySelector('.meter-track i').style.width = now.score + '%';
    const scoreWith = (s) => tailorScore(applySuggestions(base, [...accepted, s]).resume, job, data.settings.keywords).score - now.score;
    const cards = all.map(s => {
      const on = t.accepted.includes(s.id);
      const pts = on ? 0 : scoreWith(s);
      const ok = h('input', { type: 'checkbox', checked: t.confirmed.includes(s.id), onchange: () => { t.confirmed = ok.checked ? [...t.confirmed, s.id] : t.confirmed.filter(x => x !== s.id); accept.disabled = !ok.checked; } });
      const accept = h('button', { type: 'button', class: on ? 'btn btn-sm btn-quiet' : 'btn btn-sm btn-primary', disabled: !on && s.warn && !t.confirmed.includes(s.id),
        onclick: () => { t.accepted = on ? t.accepted.filter(x => x !== s.id) : [...t.accepted, s.id]; save(); draw(); } }, on ? 'Accepted — undo' : 'Accept');
      return h('li', { class: 'sug' + (on ? ' sug-on' : '') },
        h('div', { class: 'sug-top' }, h('span', { class: 'pill ' + (s.kind === 'Add skill' ? 'pill-orange' : 'pill-blue') }, s.kind), pts > 0 ? h('span', { class: 'sug-pts' }, `+${pts} pts`) : ''),
        h('b', {}, s.title), h('p', {}, s.text),
        s.warn && !on ? h('p', { class: 'sug-warn' }, icon('alert'), h('span', {}, s.warn)) : '',
        s.warn && !on ? h('label', { class: 'inline small' }, ok, ' I can talk about this in an interview') : '',
        accept);
    });
    const aiBtn = act.canReword() && !t.extra.some(x => x.id === 'summary') ? h('button', { type: 'button', class: 'btn btn-quiet btn-sm', onclick: (e) => busy(e.currentTarget, 'Rewording…', async () => {
      const s = await act.rewordSummary(job, resume);
      if (!s) { toast('The AI’s wording added things your CV doesn’t say, so it was left out.'); return; }
      t.extra = [...t.extra, s]; save(); draw();
    }) }, 'Suggest a reworded summary (AI)') : '';
    midCol.replaceChildren(card,
      h('h2', { class: 'panel-title' }, 'Suggested edits'),
      h('p', { class: 'panel-sub' }, 'Only reordering, rewording, or bringing forward what your CV already says.'),
      cards.length ? h('ul', { class: 'sugs' }, ...cards) : h('p', { class: 'empty' }, 'Nothing to change: your CV already lines up with this job.'),
      aiBtn);

    // (c) preview and downloads
    const tabs = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Layout' }, ...Object.entries(TEMPLATES).map(([k, label]) =>
      h('button', { type: 'button', role: 'radio', 'aria-checked': String(t.template === k), onclick: () => { t.template = k; save(); draw(); } }, label)));
    const sheet = renderSheet(resume, t.template, changed);
    const status = h('div', { class: 'status', role: 'status' });
    const btn = (label, ic, fn) => { const b = h('button', { type: 'button', class: 'btn btn-quiet btn-sm', onclick: () => busy(b, 'Preparing…', fn, status) }, icon(ic), h('span', {}, label)); return b; };
    preview.replaceChildren(
      h('div', { class: 'pv-head' }, h('h2', { class: 'panel-title', id: 'pv-h' }, 'Your resume'), tabs),
      h('div', { class: 'sheet-box' }, sheet),
      h('div', { class: 'pv-acts' },
        h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: (e) => busy(e.currentTarget, 'Preparing…', async () => {
          await act.exportResumeFold(job, resume, t.template);
          status.className = 'status ok';
          status.replaceChildren('Downloaded. In ResumeFold, open Review → Import JSON and pick the file. ', extLink(RESUMEFOLD_URL, 'Open ResumeFold'));
        }, status) }, icon('external'), h('span', {}, 'Open in ResumeFold')),
        btn('PDF', 'file', async () => act.printResume(job, sheet)),
        btn('Word', 'file', async () => act.downloadResume(job, resume, 'docx')),
        btn('LaTeX', 'file', async () => act.downloadResume(job, resume, 'tex'))),
      status,
      h('p', { class: 'hint' }, job.tailored && job.tailored.at ? 'Saved with this job.' : 'Your edits are saved with this job.'));
  };

  root.replaceChildren(
    pageHead(job.role, [job.company, job.location].filter(Boolean).join(' · '),
      h('a', { class: 'btn btn-quiet', href: '/app/matches' }, 'Back to matches')),
    act.baseIsRough() ? h('div', { class: 'notice' }, icon('file'),
      h('p', {}, h('b', {}, 'Your CV was read with simple rules.'), ' Some sections may be split oddly. The AI can read it into proper sections.'),
      h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: (e) => busy(e.currentTarget, 'Reading…', async () => { await act.readCvWithAi(); renderTailor(ctx, root, jobId); }) }, 'Read it with AI')) : '',
    h('div', { class: 'tailor' }, jdCol, midCol, preview));
  draw();
  if (!job.jd) act.loadJobDetails(job).then(() => { if (job.jd) draw(); }).catch(() => {});
}

function renderPicker(ctx, root) {
  const { data } = ctx;
  const jobs = data.jobs.filter(j => j.status !== 'Skipped' && j.status !== 'Expired')
    .sort((a, b) => Number(!!b.tailored) - Number(!!a.tailored) || (b.score ?? 0) - (a.score ?? 0)).slice(0, 12);
  root.replaceChildren(pageHead('Resume tailor', 'Pick a job to tailor your resume for it'),
    jobs.length ? h('ul', { class: 'pick' }, ...jobs.map(j => h('li', {}, h('a', { href: `/app/tailor/${encodeURIComponent(j.id)}` },
      h('b', {}, j.role), h('span', {}, [j.company, j.tailored ? 'tailored' : (j.score != null ? j.score + '% match' : '')].filter(Boolean).join(' · ')))))) :
      h('div', { class: 'empty-block' }, h('h2', {}, 'No jobs to tailor for yet'), h('p', {}, 'Open Job matches after your next sync, then choose Tailor resume on any job.')));
}

/** The one-page sheet in one of the four layouts. changed marks accepted edits so they stand out. */
export function renderSheet(r, template, changed = new Set()) {
  const c = r.contact || {};
  const sec = (title, ...body) => h('section', { class: 'rs-sec' }, h('h3', {}, title), ...body);
  const bullets = (list) => (list || []).filter(Boolean).length ? h('ul', {}, ...list.filter(Boolean).map(b => h('li', {}, b))) : '';
  const line = (left, right, chg) => h('p', { class: 'rs-line' + (chg ? ' chg' : '') }, h('b', {}, left), right ? h('span', {}, right) : '');
  const parts = {
    summary: r.summary ? sec('Summary', h('p', { class: changed.has('summary') ? 'chg' : '' }, r.summary)) : '',
    skills: (r.skills || []).length ? sec('Skills', ...r.skills.map(s => h('p', { class: 'rs-skills' + (changed.has('skills') ? ' chg' : '') }, h('b', {}, s.category + ': '),
      ...s.items.flatMap((it, i) => [i ? ', ' : '', changed.has('skill:' + it.toLowerCase()) ? h('mark', { class: 'chg' }, it) : it])))) : '',
    experience: (r.experience || []).length ? sec('Experience', ...r.experience.map(e => h('div', { class: 'rs-entry' + (changed.has('bullets:' + e.id) ? ' chg' : '') },
      line([e.title, e.company].filter(Boolean).join(', '), dateRange(e)), bullets(e.bullets)))) : '',
    projects: (r.projects || []).length ? sec('Projects', ...r.projects.map(p => h('div', { class: 'rs-entry' + (changed.has('project:' + p.id) || changed.has('bullets:' + p.id) ? ' chg' : '') },
      line([p.name, p.tech].filter(Boolean).join(' — '), dateRange(p)), bullets(p.bullets)))) : '',
    education: (r.education || []).length ? sec('Education', ...r.education.map(e => h('div', { class: 'rs-entry' },
      line([e.degree, e.field, e.school].filter(Boolean).join(', '), dateRange(e)), bullets([e.gpa && `GPA ${e.gpa}`, ...(e.details || [])])))) : '',
    certifications: (r.certifications || []).length ? sec('Certifications', bullets(r.certifications.map(x => [x.name, x.issuer].filter(Boolean).join(', ')))) : '',
  };
  const ORDER = {
    standard: ['summary', 'skills', 'experience', 'projects', 'education', 'certifications'],
    student: ['summary', 'education', 'projects', 'skills', 'experience', 'certifications'],
    combination: ['summary', 'experience', 'projects', 'education'],
    senior: ['summary', 'experience', 'skills', 'projects', 'education', 'certifications'],
  }[template] || [];
  const head = h('header', { class: 'rs-head' }, h('h2', {}, c.fullName || 'Your name'),
    c.headline ? h('p', { class: 'rs-headline' + (changed.has('headline') ? ' chg' : '') }, c.headline) : '',
    h('p', { class: 'rs-contact' }, [c.email, c.phone, c.location, c.linkedin, c.github, c.website].filter(Boolean).join('  ·  ')));
  const body = template === 'combination'
    ? h('div', { class: 'rs-cols' }, h('div', { class: 'rs-side' }, parts.skills, parts.certifications), h('div', {}, ...ORDER.map(k => parts[k])))
    : h('div', {}, ...ORDER.map(k => parts[k]));
  return h('article', { class: 'sheet t-' + template, 'aria-label': 'Resume preview' }, head, body);
}
