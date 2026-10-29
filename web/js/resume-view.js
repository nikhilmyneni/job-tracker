/** The resume overlay: an editable A4 sheet, with PDF / Word downloads and print. */
import { $, h, busy, errText, toast } from './ui.js';
import { resumeBlocks, applyResumeEdits, resumeFileBase } from './core.js';
import { resumePdfBlob, resumeDocxBlob, downloadBlob } from './files.js';

const A4_PX = 297 / 25.4 * 96;
let cur = null; // {job, resume, ctx}
let lastFocus = null;

/** Draws the resume as blocks; every editable piece carries its path so edits can be read back. */
function renderSheet(r) {
  const sheet = $('rv-sheet');
  const el = (b) => {
    const path = b.path ? JSON.stringify(b.path) : undefined;
    switch (b.t) {
      case 'name': return h('h1', { dataset: { path } }, b.text);
      case 'headline': return h('p', { class: 'r-head', dataset: { path } }, b.text);
      case 'contact': return h('p', { class: 'r-contact', dataset: { path } }, b.text);
      case 'section': return h('h2', { contentEditable: 'false' }, b.text);
      case 'skill': return h('p', {}, b.label ? h('b', { contentEditable: 'false' }, b.label + ': ') : '', h('span', { dataset: { path } }, b.text));
      case 'line': return h('div', { class: 'r-line' }, h('b', { dataset: { path } }, b.text), b.right ? h('i', { contentEditable: 'false' }, b.right) : '');
      case 'bullet': return h('div', { class: 'r-bullet', dataset: { path } }, b.text);
      case 'italic': return h('p', {}, h('i', { dataset: { path } }, b.text));
      default: return h('p', { dataset: { path } }, b.text);
    }
  };
  sheet.className = 'sheet';
  sheet.contentEditable = 'true';
  sheet.replaceChildren(...resumeBlocks(r).map(el));
  let pt = 10.5;
  sheet.style.fontSize = pt + 'pt';
  while (sheet.scrollHeight > A4_PX + 1 && pt > 8.5) { pt -= 0.25; sheet.style.fontSize = pt + 'pt'; }
  $('rv-note').textContent = sheet.scrollHeight > A4_PX + 1
    ? 'A bit longer than one page. Click any text to trim it before downloading.'
    : 'Click any text to edit it. Downloads include your edits.';
}

/** The resume with whatever the user typed on the sheet. */
function currentResume() {
  const edits = [...$('rv-sheet').querySelectorAll('[data-path]')].map(n => ({ path: JSON.parse(n.dataset.path), text: n.textContent }));
  return applyResumeEdits(cur.resume, edits);
}

const setButtons = (on) => ['rv-pdf', 'rv-docx', 'rv-print', 'rv-save'].forEach(id => { $(id).disabled = !on; });

export async function openResume(job, ctx, regenerate) {
  cur = { job, resume: null, ctx };
  if (!regenerate) lastFocus = document.activeElement;
  $('resume-view').hidden = false;
  document.body.classList.add('modal-open');
  $('rv-title').textContent = `Resume · ${job.company} – ${job.role}`;
  const sheet = $('rv-sheet');
  sheet.className = 'sheet busy'; sheet.contentEditable = 'false';
  sheet.replaceChildren(job.resume && !regenerate ? 'Opening…' : 'Writing your resume for this job… (about 20 seconds)');
  setButtons(false); $('rv-again').disabled = true;
  $('rv-close').focus();
  try {
    const r = await ctx.act.getResume(job, !!regenerate, (t) => { if (cur && cur.job === job) sheet.replaceChildren(t); });
    if (!cur || cur.job !== job) return;
    cur.resume = r;
    renderSheet(r);
    setButtons(true);
  } catch (e) {
    if (cur && cur.job === job) sheet.replaceChildren(errText(e));
  } finally {
    if (cur && cur.job === job) $('rv-again').disabled = !ctx.canWrite();
  }
}

function closeResume() {
  cur = null;
  $('resume-view').hidden = true;
  document.body.classList.remove('modal-open');
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

export function wireResumeView() {
  $('rv-close').addEventListener('click', closeResume);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('resume-view').hidden) closeResume(); });
  $('rv-again').addEventListener('click', () => {
    if (cur && confirm('Write this resume again? The current one, and any saved edits, will be replaced.')) openResume(cur.job, cur.ctx, true);
  });
  const ready = () => !!(cur && cur.resume);
  $('rv-pdf').addEventListener('click', () => ready() && busy($('rv-pdf'), 'Making PDF…', async () => {
    const r = currentResume();
    downloadBlob(await resumePdfBlob(r), resumeFileBase(r.name, cur.job.company, cur.job.role) + '.pdf');
  }));
  $('rv-docx').addEventListener('click', () => {
    if (!ready()) return;
    const r = currentResume();
    downloadBlob(resumeDocxBlob(r), resumeFileBase(r.name, cur.job.company, cur.job.role) + '.docx');
  });
  $('rv-print').addEventListener('click', () => {
    if (!ready()) return;
    const title = document.title;
    document.title = resumeFileBase(cur.resume.name, cur.job.company, cur.job.role);
    window.print();
    setTimeout(() => { document.title = title; }, 1000);
  });
  $('rv-save').addEventListener('click', () => ready() && busy($('rv-save'), 'Saving…', async () => {
    const r = currentResume();
    await cur.ctx.act.saveResumeEdits(cur.job, r);
    cur.resume = r;
    toast('Edits saved ✓');
  }));
}
