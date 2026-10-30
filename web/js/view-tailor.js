/**
 * Resume tailor: the job description with your skills highlighted, suggested edits you accept or undo (only ever
 * reordering, rewording or bringing forward what your CV says; "Add skill" needs you to confirm), a live one-page
 * preview in ResumeFold's four layouts, and downloads (ResumeFold, PDF, Word, LaTeX). Saved with the job.
 */
import { h, busy, icon, pageHead, extLink, isHttp, toast, errText } from './ui.js';
import { HEADINGS, ORDER } from './pdf.js';
import { TEMPLATES, skillLabel, contactLink, bulletText, matchLabel, atsScore, tailorSuggestions, applySuggestions, tailorScore, highlightJd, termsIn, dateRange, RESUMEFOLD_URL } from './core.js';

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
    const all = [...tailorSuggestions(base, job, data.cv, data.settings.keywords, data.settings.prefs.roles), ...t.extra];
    const accepted = all.filter(s => t.accepted.includes(s.id));
    const { resume, changed } = applySuggestions(base, accepted);
    const baseScore = atsScore(base, job, data.settings.keywords).score;
    const now = atsScore(resume, job, data.settings.keywords);
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
      h('p', { class: 'score-card-k' }, 'ATS score'),
      h('p', { class: 'score-card-v' }, matchLabel(now.score).label),
      h('p', { class: 'score-card-s' }, matchLabel(now.score).label !== matchLabel(baseScore).label ? `up from ${matchLabel(baseScore).label} on your base CV` : delta > 0 ? 'better than your base CV' : 'on your base CV'),
      h('div', { class: 'meter-track' }, h('i')),
      h('p', { class: 'score-card-s' }, now.keywords.total ? `${now.keywords.found} of the job’s ${now.keywords.total} keywords are in your resume.` : 'The job lists no skills to compare.'),
      h('ul', { class: 'ats-checks' }, ...now.checks.map(x => h('li', { class: x.ok ? 'ok' : 'no' }, h('span', { 'aria-hidden': 'true' }, x.ok ? '✓' : '✗'), h('span', { class: 'visually-hidden' }, x.ok ? 'Done: ' : 'Missing: '), x.text))));
    card.querySelector('.meter-track i').style.width = now.score + '%';
    const scoreWith = (s) => atsScore(applySuggestions(base, [...accepted, s]).resume, job, data.settings.keywords).score - now.score;
    const cards = all.map(s => {
      const on = t.accepted.includes(s.id);
      const pts = on ? 0 : scoreWith(s);
      const ok = h('input', { type: 'checkbox', checked: t.confirmed.includes(s.id), onchange: () => { t.confirmed = ok.checked ? [...t.confirmed, s.id] : t.confirmed.filter(x => x !== s.id); accept.disabled = !ok.checked; } });
      const accept = h('button', { type: 'button', class: on ? 'btn btn-sm btn-quiet' : 'btn btn-sm btn-primary', disabled: !on && s.warn && !t.confirmed.includes(s.id),
        onclick: () => { t.accepted = on ? t.accepted.filter(x => x !== s.id) : [...t.accepted, s.id]; save(); draw(); } }, on ? 'Accepted — undo' : 'Accept');
      return h('li', { class: 'sug' + (on ? ' sug-on' : '') },
        h('div', { class: 'sug-top' }, h('span', { class: 'pill ' + (s.kind === 'Add skill' ? 'pill-orange' : 'pill-blue') }, s.kind), pts > 0 ? h('span', { class: 'sug-pts' }, 'Raises your ATS score') : ''),
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
    const safe = all.filter(s => !s.warn && !t.accepted.includes(s.id));
    const acceptAll = safe.length > 1 ? h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => { t.accepted = [...t.accepted, ...safe.map(s => s.id)]; save(); draw(); } }, `Accept all ${safe.length} safe edits`) : '';
    midCol.replaceChildren(card,
      h('div', { class: 'pv-head' }, h('h2', { class: 'panel-title' }, 'Suggested edits'), acceptAll),
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
          await act.downloadResume(job, resume, 'pdf', t.template);
        }, status) }, icon('download'), h('span', {}, 'Download PDF')),
        h('button', { type: 'button', class: 'btn btn-quiet btn-sm', onclick: (e) => busy(e.currentTarget, 'Preparing…', async () => {
          await act.exportResumeFold(job, resume, t.template);
          status.className = 'status ok';
          status.replaceChildren('Downloaded. In ResumeFold, open Review → Import JSON and pick the file. ', extLink(RESUMEFOLD_URL, 'Open ResumeFold'));
        }, status) }, icon('external'), h('span', {}, 'Open in ResumeFold')),
        btn('Word', 'file', async () => act.downloadResume(job, resume, 'docx')),
        btn('LaTeX', 'file', async () => act.downloadResume(job, resume, 'tex'))),
      status,
      h('p', { class: 'hint' }, job.tailored && job.tailored.at ? 'Saved with this job.' : 'Your edits are saved with this job.'));
  };

  root.replaceChildren(
    pageHead(job.role, [job.company, job.location].filter(Boolean).join(' · '),
      h('a', { class: 'btn btn-quiet', href: '/app/tailor' }, job.source === 'Pasted' ? 'Paste another' : 'Other jobs')),
    act.baseIsRough() ? h('div', { class: 'notice' }, icon('file'),
      h('p', {}, h('b', {}, 'Your CV was read with simple rules.'), ' Some sections may be split oddly. The AI can read it into proper sections.'),
      h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: (e) => busy(e.currentTarget, 'Reading…', async () => { await act.readCvWithAi(); renderTailor(ctx, root, jobId); }) }, 'Read it with AI')) : '',
    h('div', { class: 'tailor' }, jdCol, midCol, preview));
  draw();
  if (!job.jd) act.loadJobDetails(job).then(() => { if (job.jd) draw(); }).catch(() => {});
}

/** Paste any job description to tailor your resume for it (it's kept as a Saved job). */
function pasteForm(ctx) {
  const role = h('input', { type: 'text', placeholder: 'e.g. SOC Analyst', autocomplete: 'off' });
  const company = h('input', { type: 'text', placeholder: 'Optional', autocomplete: 'off' });
  const jd = h('textarea', { rows: 8, spellcheck: false, placeholder: 'Paste the whole job description here.' });
  const status = h('div', { class: 'status', role: 'status' });
  const go = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => busy(go, 'Reading…', () => ctx.act.tailorPasted({ role: role.value, company: company.value, jd: jd.value }), status) }, 'Tailor my resume');
  const field = (label, control) => h('label', { class: 'field' }, h('span', { class: 'field-lbl' }, label), control);
  return h('section', { class: 'panel stack', 'aria-labelledby': 'paste-h' },
    h('div', {}, h('h2', { class: 'panel-title', id: 'paste-h' }, 'Paste a job description'),
      h('p', { class: 'panel-sub' }, 'From anywhere: a company site, LinkedIn, a WhatsApp forward. You get your resume tailored to it, as a PDF.')),
    h('div', { class: 'two' }, field('Role', role), field('Company', company)),
    field('Job description', jd),
    h('div', { class: 'save-bar' }, go, status));
}

function renderPicker(ctx, root) {
  const { data } = ctx;
  const jobs = data.jobs.filter(j => j.status !== 'Skipped' && j.status !== 'Expired')
    .sort((a, b) => Number(!!b.tailored) - Number(!!a.tailored) || (b.score ?? 0) - (a.score ?? 0)).slice(0, 12);
  if (!data.cv) {
    root.replaceChildren(pageHead('Resume tailor', ''),
      h('div', { class: 'empty-block' }, h('h2', {}, 'Add your CV first'), h('p', {}, 'Tailoring starts from your CV. Add it in Profile and CV, then come back.')));
    return;
  }
  root.replaceChildren(pageHead('Resume tailor', 'Paste a job description, or pick one of your matches'),
    pasteForm(ctx),
    jobs.length ? h('h2', { class: 'panel-title' }, 'Or pick a job') : '',
    jobs.length ? h('ul', { class: 'pick' }, ...jobs.map(j => h('li', {}, h('a', { href: `/app/tailor/${encodeURIComponent(j.id)}` },
      h('b', {}, j.role), h('span', {}, [j.company, j.tailored ? 'tailored' : (j.score != null ? matchLabel(j.score).label + ' match' : '')].filter(Boolean).join(' · ')))))) :
      '');
}

/**
 * The one-page sheet in one of ResumeFold's four layouts, matching the PDF download (js/pdf.js): ResumeFold's section
 * names and order, title / dates then company / location rows, "Category: items" skills. changed marks accepted edits.
 */
export function renderSheet(r, template, changed = new Set()) {
  const c = r.contact || {};
  const upper = template === 'standard' || template === 'combination';
  const sec = (key, ...body) => h('section', { class: 'rs-sec' }, h('h3', {}, upper ? HEADINGS[key].toUpperCase() : HEADINGS[key]), ...body);
  const bullets = (list) => { const l = (list || []).map(bulletText).filter(Boolean); return l.length ? h('ul', { class: 'rs-bullets' }, ...l.map(b => h('li', {}, b))) : ''; };
  const row = (left, right, cls = '') => h('div', { class: 'rs-row ' + cls }, h('span', { class: 'rs-l' }, ...[].concat(left)), right ? h('span', { class: 'rs-r' }, right) : '');
  const items = (s) => s.items.flatMap((it, i) => [i ? ', ' : '', changed.has('skill:' + it.toLowerCase()) ? h('mark', { class: 'chg' }, it) : it]);
  const parts = {
    summary: r.summary ? sec('summary', h('p', { class: 'rs-summary' + (changed.has('summary') ? ' chg' : '') }, r.summary)) : '',
    experience: (r.experience || []).length ? sec('experience', ...r.experience.map(e => h('div', { class: 'rs-entry' + (changed.has('bullets:' + e.id) ? ' chg' : '') },
      row(h('b', {}, e.title || ''), dateRange(e)), e.company || e.location ? row(h('i', {}, e.company || ''), e.location || '') : '', bullets(e.bullets)))) : '',
    education: (r.education || []).length ? sec('education', ...r.education.map(e => {
      const degree = [[e.degree, e.field].filter(Boolean).join(' in '), e.gpa && (/[a-z%]/i.test(e.gpa) ? e.gpa : `GPA ${e.gpa}`)].filter(Boolean).join(', ');
      return h('div', { class: 'rs-entry' }, row(h('b', {}, e.school || degree), dateRange(e)), e.school && degree ? row(h('i', {}, degree), e.location || '') : '', bullets(e.details));
    })) : '',
    skills: (r.skills || []).length ? sec('skills', h('div', { class: 'rs-skills' + (changed.has('skills') ? ' chg' : '') },
      ...r.skills.map(s => h('p', {}, skillLabel(s) ? h('b', {}, `${skillLabel(s)}: `) : '', ...items(s))))) : '',
    projects: (r.projects || []).length ? sec('projects', ...r.projects.map(p => h('div', { class: 'rs-entry' + (changed.has('project:' + p.id) || changed.has('bullets:' + p.id) ? ' chg' : '') },
      row([h('b', {}, p.name || ''), p.tech ? h('i', {}, ` | ${p.tech}`) : ''], dateRange(p)), bullets(p.bullets)))) : '',
    certifications: (r.certifications || []).length ? sec('certifications', ...r.certifications.map(x => row([h('b', {}, x.name || ''), x.issuer ? `, ${x.issuer}` : ''], dateRange(x), 'rs-cert'))) : '',
  };
  const contact = [c.email, c.phone, c.location, c.website, c.linkedin, c.github].filter(Boolean);
  const head = h('header', { class: 'rs-head' }, h('h2', {}, c.fullName || 'Your name'),
    template !== 'student' && c.headline ? h('p', { class: 'rs-headline' + (changed.has('headline') ? ' chg' : '') }, c.headline) : '',
    // Email, phone and links are clickable, as in the PDF (only mailto:, tel: and https: ever become links).
    h('p', { class: 'rs-contact' }, ...contact.flatMap((x, i) => [i ? '  ·  ' : '', contactLink(x) ? h('a', { href: contactLink(x), target: '_blank', rel: 'noopener noreferrer' }, x) : x])));
  return h('article', { class: 'sheet t-' + template, 'aria-label': 'Resume preview' }, head, h('div', { class: 'rs-body' }, ...ORDER.map(k => parts[k])));
}
