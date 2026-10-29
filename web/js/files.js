/**
 * CV files in (PDF, Word, text), all read in the browser, and file downloads.
 * pdf.js is served from our own site (web/vendor), never from a CDN.
 */
import { MAX_CV } from './core.js';
import { docxToText } from './docx.js';

export const CV_MAX_BYTES = 5 * 1024 * 1024;
export const CV_ACCEPT = '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';

// ---------- CV in ----------
/**
 * pdf.js text items → lines, using where each item sits on the page: items on the same baseline join into one
 * line (with a space where there's a visible gap), and a bigger vertical jump starts a new paragraph.
 * Two-column layouts read left column first only when the columns don't share baselines.
 */
export function pdfItemsToText(items) {
  const runs = items.filter(it => it && typeof it.str === 'string' && it.str.length && Array.isArray(it.transform))
    .map(it => ({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0, h: Math.abs(it.transform[3]) || it.height || 10 }));
  if (!runs.length) return '';
  runs.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const r of runs) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line.y - r.y) <= Math.max(2, Math.min(line.h, r.h) * 0.45)) line.items.push(r);
    else lines.push({ y: r.y, h: r.h, items: [r] });
  }
  let out = '', prevY = null, prevH = 0;
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    const solid = line.items.filter(it => it.s.trim());
    // Letter-spaced headings ("K A R T H I K"): every letter is its own item, so only the wider gaps are word breaks.
    const spaced = solid.length >= 4 && solid.filter(it => it.s.trim().length === 1).length / solid.length > 0.7;
    let wordGap = Infinity;
    if (spaced) {
      const gaps = solid.slice(1).map((it, i) => it.x - (solid[i].x + solid[i].w)).sort((a, b) => a - b);
      const med = gaps[Math.floor(gaps.length / 2)];
      wordGap = Math.max(med * 1.6, med + line.h * 0.12);
    }
    let text = '', end = null, sawSpace = false;
    for (const it of line.items) {
      if (spaced && !it.s.trim()) { sawSpace = true; continue; }
      const gap = end === null ? 0 : it.x - end;
      if (spaced) { if (end !== null && (gap > wordGap)) text += ' '; }
      else if (end !== null && gap > it.h * 0.18 && !/\s$/.test(text) && !/^\s/.test(it.s)) text += gap > it.h * 2.5 ? '   ' : ' ';
      text += spaced ? it.s.trim() : it.s;
      end = it.x + it.w;
    }
    if (spaced && !/ /.test(text) && sawSpace) text = line.items.map(it => (it.s.trim() ? it.s.trim() : ' ')).join('').replace(/ {2,}/g, ' ');
    if (prevY !== null) out += prevY - line.y > Math.max(prevH, line.h) * 1.9 ? '\n\n' : '\n';
    out += text.replace(/\s+$/, '');
    prevY = line.y; prevH = line.h;
  }
  return out;
}

async function pdfToText(bytes) {
  const pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, disableFontFace: true }).promise;
  const pages = [];
  for (let i = 1; i <= Math.min(doc.numPages, 6); i++) pages.push(pdfItemsToText((await (await doc.getPage(i)).getTextContent()).items));
  await doc.destroy();
  return pages.join('\n\n');
}

/** A File → {text, warning}. Throws with a friendly message when it can't be read. */
export async function readCvFile(file) {
  if (file.size > CV_MAX_BYTES) throw new Error('That file is over 5 MB. Try a smaller PDF or paste the text.');
  const name = file.name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text;
  if (name.endsWith('.pdf') || file.type === 'application/pdf') text = await pdfToText(bytes);
  else if (name.endsWith('.docx')) text = await docxToText(bytes);
  else if (name.endsWith('.txt') || file.type.startsWith('text/')) text = new TextDecoder().decode(bytes);
  else if (name.endsWith('.doc')) throw new Error('Old .doc files can’t be read. Save it as .docx or PDF, or paste the text.');
  else throw new Error('Please upload a PDF, a Word (.docx) or a .txt file.');
  text = text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_CV);
  const warning = text.length < 200
    ? 'Very little text came out. If this is a scanned PDF, paste your CV text instead.'
    : '';
  return { text, warning };
}

// ---------- downloads ----------
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
