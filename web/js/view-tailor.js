/**
 * Resume for a job: one focused column. How well your resume fits this job (in words) and one "Make the safe changes"
 * button; the live one-page preview in ResumeFold's four layouts; Download PDF and Apply. The details sit behind
 * toggles: each change (only ever reordering, rewording or bringing forward what your CV says; "Add a skill" needs you to
 * confirm), why the score is what it is, and the job ad with your skills highlighted. Saved with the job.
 */
import { h, busy, icon, pageHead, extLink, isHttp, toast, errText } from './ui.js';
import { HEADINGS, ORDER } from './pdf.js';
import { TEMPLATES, EDIT_KIND, skillLabel, contactLink, bulletText, matchLabel, atsScore, tailorSuggestions, applySuggestions, highlightJd, termsIn, dateRange, RESUMEFOLD_URL } from './core.js';
import { openApply } from './apply.js';

const LAYOUT_HINT = { standard: 'Works for most jobs', student: 'Compact, fits more', combination: 'Left-aligned, bold lines', senior: 'Roomy, more space' };
const needCv = (root, sub) => root.replaceChildren(pageHead('Resume for a job', sub),
  h('div', { class: 'empty-block' }, h('h2', {}, 'Add your CV first'), h('p', {}, 'We make each resume from your CV. Add it, then come back.'),
    h('a', { class: 'btn btn-primary', href: '/app/profile' }, 'Add my CV')));

export function renderTailor(ctx, root, jobId) {
  const { data, act } = ctx;
  const job = jobId && data.jobs.find(j => j.id === jobId);
  if (!job) { renderPicker(ctx, root); return; }
  if (!data.cv) { needCv(root, `${job.role} · ${job.company}`); return; }
  const saved = job.tailored || {};
  const list = (v) => (Array.isArray(v) ? v : []);
  const t = { accepted: list(saved.accepted), confirmed: list(saved.confirmed), template: saved.template in TEMPLATES ? saved.template : 'standard',
    extra: list(saved.extra).filter(x => x && x.id === 'summary' && x.patch && typeof x.patch.value === 'string') };
  const base = act.baseResume();
  const save = () => act.saveTailored(job, t).catch(e => toast(errText(e), true));
  const opened = { changes: false, why: false, jd: false }; // which toggles are open, kept across redraws
  const page = h('div', { class: 'rf' });

  const draw = () => {
    const kw = data.settings.keywords;
    const all = [...tailorSuggestions(base, job, data.cv, kw, data.settings.prefs.roles), ...t.extra];
    const accepted = all.filter(s => t.accepted.includes(s.id));
    const { resume, changed } = applySuggestions(base, accepted);
    const now = atsScore(resume, job, kw);
    const safe = all.filter(s => !s.warn && !t.accepted.includes(s.id));
    const after = safe.length ? atsScore(applySuggestions(base, [...accepted, ...safe]).resume, job, kw).score : now.score;
    t.resume = resume;
    const toggle = (key, title, ...body) => {
      const d = h('details', { class: 'rf-more', open: opened[key] }, h('summary', {}, title), h('div', { class: 'rf-more-body' }, ...body));
      d.addEventListener('toggle', () => { opened[key] = d.open; });
      return d;
    };

    // 1. How well it fits, and the one button
    const word = matchLabel(now.score), next = matchLabel(after);
    const fit = h('section', { class: 'rf-fit', 'aria-label': 'How well your resume fits' },
      h('div', { class: 'rf-fit-text' },
        h('p', { class: 'rf-fit-k' }, 'How well your resume fits this job'),
        h('p', { class: 'rf-fit-v' }, h('span', { class: `lvl lvl-${word.tone}` }, word.label),
          safe.length && next.label !== word.label ? h('span', { class: 'rf-fit-next' }, '→ ', h('span', { class: `lvl lvl-${next.tone}` }, next.label), ' after the safe changes') : ''),
        h('p', { class: 'hint' }, safe.length ? `${safe.length} safe change${safe.length === 1 ? '' : 's'}: moving up and showing what your CV already says. Nothing made up.`
          : accepted.length ? `${accepted.length} change${accepted.length === 1 ? '' : 's'} made for this job. Saved with it.` : 'Your CV already lines up with this job.')),
      safe.length ? h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { t.accepted = [...t.accepted, ...safe.map(x => x.id)]; save(); draw(); toast('Done. Your resume is ready.'); } },
        'Make the safe changes') : '');

    // 2. Behind toggles: each change, why this score, the job ad
    const cards = all.map(x => {
      const on = t.accepted.includes(x.id);
      const ok = h('input', { type: 'checkbox', checked: t.confirmed.includes(x.id), onchange: () => { t.confirmed = ok.checked ? [...t.confirmed, x.id] : t.confirmed.filter(y => y !== x.id); accept.disabled = !ok.checked; } });
      const accept = h('button', { type: 'button', class: on ? 'btn btn-sm btn-quiet' : 'btn btn-sm btn-primary', disabled: !on && x.warn && !t.confirmed.includes(x.id),
        onclick: () => { t.accepted = on ? t.accepted.filter(y => y !== x.id) : [...t.accepted, x.id]; save(); draw(); } }, on ? 'Undo' : 'Use this');
      return h('li', { class: 'sug' + (on ? ' sug-on' : '') },
        h('div', { class: 'sug-top' }, h('span', { class: 'pill ' + (x.kind === 'Add skill' ? 'pill-orange' : 'pill-blue') }, EDIT_KIND[x.kind] || x.kind), on ? h('span', { class: 'sug-pts' }, '✓ Used') : ''),
        h('b', {}, x.title), h('p', {}, x.text),
        x.warn && !on ? h('p', { class: 'sug-warn' }, icon('alert'), h('span', {}, x.warn)) : '',
        x.warn && !on ? h('label', { class: 'inline small' }, ok, ' This is true and I can talk about it in an interview') : '',
        accept);
    });
    const aiBtn = act.canReword() && !t.extra.some(x => x.id === 'summary') ? h('button', { type: 'button', class: 'btn btn-quiet btn-sm', onclick: (e) => busy(e.currentTarget, 'Writing…', async () => {
      const x = await act.rewordSummary(job, resume);
      if (!x) { toast('The suggested wording added things your CV doesn’t say, so we left it out.'); return; }
      t.extra = [...t.extra, x]; opened.changes = true; save(); draw();
    }) }, 'Suggest better wording for my summary') : '';
    const have = termsIn(resume.summary + '\n' + data.cv + '\n' + resume.skills.flatMap(x => x.items).join(', '), kw);
    const jd = job.jd || job.details || '';
    const details = h('div', { class: 'rf-toggles' },
      toggle('changes', all.length ? `See each change (${all.length})` : 'See each change',
        cards.length ? h('ul', { class: 'sugs' }, ...cards) : h('p', { class: 'empty' }, 'Nothing to change: your CV already lines up with this job.'), aiBtn),
      toggle('why', 'Why this score',
        h('p', {}, now.keywords.total ? `${now.keywords.found} of the ${now.keywords.total} skills this job asks for are in your resume.` : 'This job doesn’t list skills to compare.'),
        h('ul', { class: 'ats-checks' }, ...now.checks.map(x => h('li', { class: x.ok ? 'ok' : 'no' }, h('span', { 'aria-hidden': 'true' }, x.ok ? '✓' : '✗'), h('span', { class: 'visually-hidden' }, x.ok ? 'Done: ' : 'Missing: '), x.text)))),
      toggle('jd', 'Show the job ad',
        h('p', { class: 'legend' }, h('span', { class: 'kw' }, 'On your CV'), ' ', h('span', { class: 'kw kw-miss' }, 'Not on your CV')),
        jd ? h('div', { class: 'jd-text' }, ...highlightJd(jd, have, kw).map(p => (p.kind ? h('mark', { class: 'hl hl-' + p.kind, title: p.kind === 'have' ? 'On your CV' : 'Not on your CV' }, p.text) : p.text)))
          : h('p', { class: 'empty' }, 'No description came with this job. Open the job page to read it.'),
        isHttp(job.link) ? extLink(job.link, 'Open the job page', 'link') : ''));

    // 3. The layout and the preview
    const layouts = h('div', { class: 'rf-layouts', role: 'radiogroup', 'aria-label': 'Layout' }, ...Object.entries(TEMPLATES).map(([k, label]) =>
      h('button', { type: 'button', role: 'radio', 'aria-checked': String(t.template === k), onclick: () => { t.template = k; save(); draw(); } },
        h('b', {}, label), h('span', {}, LAYOUT_HINT[k]))));

    // 4. The actions: Download PDF, Apply, more formats
    const status = h('div', { class: 'status', role: 'status' });
    const fmt = (label, fn) => h('button', { type: 'button', onclick: (e) => { const b = e.currentTarget; b.closest('details').open = false; busy(b, 'Preparing…', fn, status); } }, label);
    const acts = h('div', { class: 'rf-acts' },
      h('button', { type: 'button', class: 'btn btn-primary', onclick: (e) => busy(e.currentTarget, 'Preparing…', () => act.downloadResume(job, resume, 'pdf', t.template), status) },
        icon('download'), h('span', {}, 'Download PDF')),
      job.status === 'Applied' ? h('span', { class: 'pill pill-green' }, icon('check'), ' Applied')
        : h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => openApply(ctx, job, () => renderTailor(ctx, root, jobId)) }, 'Apply'),
      h('details', { class: 'menu menu-up' }, h('summary', { class: 'btn btn-quiet' }, 'More formats'),
        h('div', { class: 'menu-list' },
          fmt('Word (.docx)', () => act.downloadResume(job, resume, 'docx')),
          fmt('LaTeX (.tex)', () => act.downloadResume(job, resume, 'tex')),
          fmt('ResumeFold (to edit there)', async () => {
            await act.exportResumeFold(job, resume, t.template);
            status.className = 'status ok';
            status.replaceChildren('Downloaded. In ResumeFold, open Review → Import JSON and pick the file. ', extLink(RESUMEFOLD_URL, 'Open ResumeFold'));
          }))),
      status);

    page.replaceChildren(fit, details,
      h('section', { class: 'rf-sheet', 'aria-label': 'Your resume' }, layouts, h('div', { class: 'sheet-box' }, renderSheet(resume, t.template, changed))),
      acts);
  };

  root.replaceChildren(
    pageHead(job.role, [job.company, job.location].filter(Boolean).join(' · '),
      h('a', { class: 'btn btn-quiet', href: '/app/tailor' }, job.source === 'Pasted' ? 'Paste another job' : 'Other jobs')),
    act.baseIsRough() ? h('div', { class: 'notice rf-notice' }, icon('file'),
      h('p', {}, h('b', {}, 'Some parts of your CV may be split oddly.'), ' We can read it again more carefully, into proper sections.'),
      h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: (e) => busy(e.currentTarget, 'Reading…', async () => { await act.readCvWithAi(); renderTailor(ctx, root, jobId); }) }, 'Improve how we read my CV')) : '',
    page);
  draw();
  if (!job.jd) act.loadJobDetails(job).then(() => { if (job.jd && page.isConnected) draw(); }).catch(() => {});
}

/** Paste any job ad to get your resume made for it (it's kept as a Saved job). */
function pasteForm(ctx) {
  const role = h('input', { type: 'text', placeholder: 'e.g. SOC Analyst', autocomplete: 'off' });
  const company = h('input', { type: 'text', placeholder: 'Optional', autocomplete: 'off' });
  const jd = h('textarea', { rows: 8, spellcheck: false, placeholder: 'Paste the whole job ad here: from a company site, LinkedIn or a WhatsApp forward.' });
  const status = h('div', { class: 'status', role: 'status' });
  const go = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => busy(go, 'Reading…', () => ctx.act.tailorPasted({ role: role.value, company: company.value, jd: jd.value }), status) }, 'Make my resume');
  const field = (label, control) => h('label', { class: 'field' }, h('span', { class: 'field-lbl' }, label), control);
  return h('section', { class: 'panel stack', 'aria-labelledby': 'paste-h' },
    h('div', {}, h('h2', { class: 'panel-title', id: 'paste-h' }, 'Paste a job ad'),
      h('p', { class: 'panel-sub' }, 'You get your resume made for it, ready to download as a PDF.')),
    field('Job ad', jd),
    h('div', { class: 'two' }, field('Role', role), field('Company', company)),
    h('div', { class: 'save-bar' }, go, status));
}

function renderPicker(ctx, root) {
  const { data } = ctx;
  if (!data.cv) { needCv(root, ''); return; }
  const jobs = data.jobs.filter(j => j.status !== 'Skipped' && j.status !== 'Expired')
    .sort((a, b) => Number(!!b.tailored) - Number(!!a.tailored) || (b.score ?? 0) - (a.score ?? 0)).slice(0, 20);
  const item = (j) => h('li', {}, h('a', { href: `/app/tailor/${encodeURIComponent(j.id)}` },
    h('b', {}, j.role), h('span', {}, [j.company, j.tailored ? 'resume made' : (j.score != null ? matchLabel(j.score).label + ' fit' : '')].filter(Boolean).join(' · '))));
  const ul = h('ul', { class: 'pick' }, ...jobs.slice(0, 5).map(item));
  const more = jobs.length > 5 ? h('button', { type: 'button', class: 'link', onclick: () => { ul.replaceChildren(...jobs.map(item)); more.remove(); } }, `Show ${jobs.length - 5} more`) : '';
  root.replaceChildren(pageHead('Resume for a job', 'Paste a job ad, or pick one of your jobs. We make your resume fit it, from your CV.'),
    h('div', { class: 'rf' }, pasteForm(ctx),
      jobs.length ? h('h2', { class: 'panel-title' }, 'Or pick one of your jobs') : '', jobs.length ? ul : '', more));
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
