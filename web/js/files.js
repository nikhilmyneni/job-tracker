/**
 * CV files in (PDF, Word, text) and resume files out (PDF, Word). All in the browser.
 * pdf.js and jsPDF are served from our own site (web/vendor), never from a CDN.
 */
import { resumeBlocks, resumeFileBase, MAX_CV } from './core.js';
import { docxToText, resumeToDocx } from './docx.js';

export const CV_MAX_BYTES = 5 * 1024 * 1024;
export const CV_ACCEPT = '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';

// ---------- CV in ----------
async function pdfToText(bytes) {
  const pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, disableFontFace: true }).promise;
  const pages = [];
  for (let i = 1; i <= Math.min(doc.numPages, 6); i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    pages.push(tc.items.map(it => (it.str || '') + (it.hasEOL ? '\n' : '')).join(''));
  }
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

export function resumeDocxBlob(r) {
  return new Blob([resumeToDocx(r)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

export const resumeFilename = (r, job, ext) => `${resumeFileBase(r.name, job.company, job.role)}.${ext}`;

// ---------- resume → PDF (jsPDF, real selectable text) ----------
let jspdfP = null;
function loadJsPdf() {
  if (window.jspdf) return Promise.resolve(window.jspdf.jsPDF);
  if (!jspdfP) {
    jspdfP = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = new URL('../vendor/jspdf/jspdf.umd.min.js', import.meta.url).href;
      s.onload = () => resolve(window.jspdf.jsPDF);
      s.onerror = () => { jspdfP = null; reject(new Error('Couldn’t load the PDF maker. Check your connection and try again.')); };
      document.head.appendChild(s);
    });
  }
  return jspdfP;
}

// The PDF's built-in Times font only has Latin-1 plus a few extras (WinAnsi).
const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
export function pdfSafe(text) {
  return String(text || '').replace(/₹\s?/g, 'Rs. ').replace(/[‐‑‒]/g, '-').replace(/ /g, ' ')
    .split('').map(ch => {
      if (ch.charCodeAt(0) < 256 || WIN_ANSI_EXTRA.includes(ch)) return ch;
      const plain = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '');
      return plain && plain.charCodeAt(0) < 256 ? plain : '';
    }).join('');
}

const PAGE_W = 210, PAGE_H = 297, MX = 16, MY = 12, CW = PAGE_W - 2 * MX;
const PT = 0.3528; // mm per point

/** Lays the blocks out at a given size. draw=false only measures. Returns the height used (mm). */
function layout(doc, blocks, size, draw) {
  let y = MY;
  const lh = (s) => s * PT * 1.3;
  const font = (style, s) => { doc.setFont('times', style); doc.setFontSize(s); };
  const lines = (text, width) => doc.splitTextToSize(pdfSafe(text), width);
  const newPageIfNeeded = (h) => { if (draw && y + h > PAGE_H - MY) { doc.addPage(); y = MY; } };
  blocks.forEach((b, idx) => {
    if (b.t === 'name') {
      font('normal', size * 2); const h = lh(size * 2);
      if (draw) doc.text(pdfSafe(b.text), PAGE_W / 2, y + h * 0.8, { align: 'center' });
      y += h;
    } else if (b.t === 'headline' || b.t === 'contact') {
      const s = b.t === 'contact' ? size * 0.86 : size;
      font(b.t === 'headline' ? 'italic' : 'normal', s);
      const ls = lines(b.text, CW);
      if (draw) { doc.setTextColor(b.t === 'contact' ? 68 : 17); ls.forEach((l, i) => doc.text(l, PAGE_W / 2, y + lh(s) * (i + 0.8), { align: 'center' })); doc.setTextColor(17); }
      y += ls.length * lh(s) + (b.t === 'contact' ? 1.5 : 0.3);
    } else if (b.t === 'section') {
      y += size * PT * 0.9;
      font('bold', size); newPageIfNeeded(lh(size) + 2);
      if (draw) { doc.text(pdfSafe(b.text.toUpperCase()), MX, y + lh(size) * 0.8, { charSpace: 0.15 }); doc.setLineWidth(0.3); doc.line(MX, y + lh(size) + 0.4, PAGE_W - MX, y + lh(size) + 0.4); }
      y += lh(size) + 1.6;
    } else if (b.t === 'line') {
      y += idx > 0 && blocks[idx - 1].t !== 'section' ? 1.2 : 0;
      font('italic', size); const rw = b.right ? doc.getTextWidth(pdfSafe(b.right)) + 4 : 0;
      font('bold', size); const ls = lines(b.text, CW - rw);
      newPageIfNeeded(ls.length * lh(size));
      if (draw) {
        ls.forEach((l, i) => doc.text(l, MX, y + lh(size) * (i + 0.8)));
        if (b.right) { font('italic', size); doc.setTextColor(85); doc.text(pdfSafe(b.right), PAGE_W - MX, y + lh(size) * 0.8, { align: 'right' }); doc.setTextColor(17); }
      }
      y += ls.length * lh(size);
    } else if (b.t === 'bullet') {
      font('normal', size); const ls = lines(b.text, CW - 5);
      newPageIfNeeded(ls.length * lh(size));
      if (draw) { doc.text('•', MX + 1, y + lh(size) * 0.8); ls.forEach((l, i) => doc.text(l, MX + 5, y + lh(size) * (i + 0.8))); }
      y += ls.length * lh(size) + 0.3;
    } else if (b.t === 'skill') {
      const label = b.label ? pdfSafe(b.label + ': ') : '';
      font('bold', size); const lw = label ? doc.getTextWidth(label) + 0.8 : 0;
      font('normal', size);
      const first = doc.splitTextToSize(pdfSafe(b.text), CW - lw);
      const rest = first.length > 1 ? doc.splitTextToSize(first.slice(1).join(' '), CW) : [];
      const n = 1 + rest.length;
      newPageIfNeeded(n * lh(size));
      if (draw) {
        if (label) { font('bold', size); doc.text(label, MX, y + lh(size) * 0.8); font('normal', size); }
        doc.text(first[0] || '', MX + lw, y + lh(size) * 0.8);
        rest.forEach((l, i) => doc.text(l, MX, y + lh(size) * (i + 1.8)));
      }
      y += n * lh(size) + 0.4;
    } else {
      font(b.t === 'italic' ? 'italic' : 'normal', size); const ls = lines(b.text, CW);
      newPageIfNeeded(ls.length * lh(size));
      if (draw) ls.forEach((l, i) => doc.text(l, MX, y + lh(size) * (i + 0.8)));
      y += ls.length * lh(size) + 0.5;
    }
  });
  return y;
}

/** Resume → PDF Blob on one A4 page when it fits (type shrinks from 10.5pt to 8.5pt). */
export async function resumePdfBlob(r, JsPdf) {
  const JS = JsPdf || await loadJsPdf();
  const blocks = resumeBlocks(r);
  const probe = new JS({ unit: 'mm', format: 'a4' });
  let size = 10.5;
  while (size > 8.5 && layout(probe, blocks, size, false) > PAGE_H - MY) size -= 0.25;
  const doc = new JS({ unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: `${r.name} – Resume`, creator: 'Job Tracker' });
  doc.setTextColor(17);
  layout(doc, blocks, size, true);
  return doc.output('blob');
}
