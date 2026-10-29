/**
 * CV files in (PDF, Word, text), all read in the browser, and file downloads.
 * pdf.js is served from our own site (web/vendor), never from a CDN.
 */
import { MAX_CV } from './core.js';
import { docxToText } from './docx.js';

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
