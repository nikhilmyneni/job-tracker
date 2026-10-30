/**
 * The tailored resume as a real PDF, made in the browser with no library: text set in the PDF core fonts (Times), so
 * it's selectable and reads cleanly for applicant tracking systems. Same four layouts and navy accent as the sheet on
 * screen (view-tailor.js renderSheet). Pure, no DOM: resumePdf(resume, template) → Uint8Array.
 */
import { CODES, TIMES_ROMAN, TIMES_BOLD, TIMES_ITALIC } from './pdf-fonts.js';
import { dateRange } from './core.js';

const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN_X = 52, TOP = 50, BOTTOM = 48;
const FONT = { R: 'F1', B: 'F2', I: 'F3' };
const WIDTHS = {};
[['R', TIMES_ROMAN], ['B', TIMES_BOLD], ['I', TIMES_ITALIC]].forEach(([f, list]) => { WIDTHS[f] = new Map(CODES.map((c, i) => [c, list[i]])); });
const COLOR = { ink: [0.078, 0.09, 0.122], text: [0.17, 0.184, 0.22], muted: [0.357, 0.384, 0.44], accent: [0.114, 0.227, 0.431], rule: [0.79, 0.81, 0.86], tint: [0.953, 0.961, 0.976] };
const BASE = { body: 10, small: 8.7, head: 8.6, name: 23, headline: 10.3 };
let SIZE = Object.assign({}, BASE), gapK = 1;
const GAP = (n) => n * gapK;
/** Type at k times its base size; spacing grows (or shrinks) faster, so a short resume breathes instead of leaving a blank page. */
function scaleTo(k) { SIZE = Object.fromEntries(Object.entries(BASE).map(([key, v]) => [key, v * k])); gapK = k * k * k; }
const LEAD = 1.32;

// ---------- characters: WinAnsi codes, with stand-ins for what the core fonts lack ----------
const UNI = { '…': 133, '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '–': 150, '—': 151, '·': 183 };
function codes(s) {
  const out = [];
  for (const ch of String(s || '').replace(/₹\s*/g, 'Rs. ').replace(/[‐‑‒−]/g, '-').replace(/\s+/g, ' ')) {
    const cp = ch.codePointAt(0);
    const c = cp >= 32 && cp <= 126 ? cp : UNI[ch] || (WIDTHS.R.has(cp) ? cp : null);
    if (c !== null) out.push(c);
  }
  return out;
}
const measure = (s, f, size) => codes(s).reduce((n, c) => n + (WIDTHS[f].get(c) || 250), 0) * size / 1000;
const pdfString = (s) => '(' + codes(s).map(c => (c === 40 || c === 41 || c === 92 ? '\\' + String.fromCharCode(c) : c > 126 ? '\\' + c.toString(8).padStart(3, '0') : String.fromCharCode(c))).join('') + ')';
const n2 = (x) => (Math.round(x * 100) / 100).toString();
const rgb = (c, op) => `${n2(c[0])} ${n2(c[1])} ${n2(c[2])} ${op}`;

// ---------- pages ----------
function makeDoc() {
  const pages = [[]];
  const doc = {
    y: PAGE_H - TOP,
    get ops() { return pages[pages.length - 1]; },
    pages,
    /** Room for h more points on this page, or a new page. */
    need(h) { if (doc.y - h < BOTTOM) { pages.push([]); doc.y = PAGE_H - TOP; } },
    text(x, y, s, f, size, color) { if (s) doc.ops.push(`BT /${FONT[f]} ${n2(size)} Tf ${rgb(COLOR[color], 'rg')} ${n2(x)} ${n2(y)} Td ${pdfString(s)} Tj ET`); },
    line(x1, y1, x2, y2, w, color) { doc.ops.push(`${rgb(COLOR[color], 'RG')} ${n2(w)} w ${n2(x1)} ${n2(y1)} m ${n2(x2)} ${n2(y2)} l S`); },
    rect(x, y, w, h, color) { return `${rgb(COLOR[color], 'rg')} ${n2(x)} ${n2(y)} ${n2(w)} ${n2(h)} re f`; },
  };
  return doc;
}

/** Runs of text ({text, f, color}) wrapped into lines no wider than maxW; each line is a list of placed pieces. */
function wrap(runs, size, maxW) {
  const words = [];
  runs.forEach(r => String(r.text || '').split(/(\s+)/).forEach(part => {
    if (!part) return;
    if (/^\s+$/.test(part)) { if (words.length) words[words.length - 1].space = true; return; }
    words.push({ text: part, f: r.f, color: r.color, space: false });
  }));
  const lines = [[]];
  let x = 0;
  words.forEach((w, i) => {
    const ww = measure(w.text, w.f, size);
    const gap = i && words[i - 1].space ? measure(' ', w.f, size) : 0;
    if (lines[lines.length - 1].length && x + gap + ww > maxW) { lines.push([]); x = 0; }
    const line = lines[lines.length - 1];
    const lead = line.length ? gap : 0;
    line.push({ text: w.text, f: w.f, color: w.color, x: x + lead });
    x += lead + ww;
  });
  return lines.filter(l => l.length).map(l => Object.assign(l, { width: l.reduce((m, p) => Math.max(m, p.x + measure(p.text, p.f, size)), 0) }));
}

function drawLines(doc, lines, x, size, align = 'left', x1 = x) {
  lines.forEach(l => {
    doc.need(size * LEAD);
    doc.y -= size * LEAD;
    const left = align === 'center' ? (x + x1 - l.width) / 2 : x;
    l.forEach(p => doc.text(left + p.x, doc.y + size * 0.28, p.text, p.f, size, p.color));
  });
}

// ---------- the resume ----------
function header(doc, r, template, x0, x1) {
  const c = r.contact || {};
  const center = template === 'standard' || template === 'combination';
  const bar = template === 'student';
  const tx = bar ? x0 + 11 : x0;
  const top = doc.y;
  const nameSize = template === 'senior' ? SIZE.name + 3 : SIZE.name;
  drawLines(doc, wrap([{ text: c.fullName || 'Your name', f: 'B', color: 'ink' }], nameSize, x1 - tx), tx, nameSize, center ? 'center' : 'left', x1);
  if (c.headline) { doc.y -= GAP(1); drawLines(doc, wrap([{ text: c.headline, f: 'R', color: 'accent' }], SIZE.headline, x1 - tx), tx, SIZE.headline, center ? 'center' : 'left', x1); }
  const bits = [c.email, c.phone, c.location, c.linkedin, c.github, c.website].filter(Boolean);
  const runs = bits.flatMap((b, i) => [i ? { text: '  |  ', f: 'R', color: 'rule' } : null, { text: b.replace(/\s+/g, ' '), f: 'R', color: 'muted' }].filter(Boolean));
  if (runs.length) { doc.y -= GAP(2); drawLines(doc, wrap(runs, SIZE.small, x1 - tx), tx, SIZE.small, center ? 'center' : 'left', x1); }
  doc.y -= GAP(8);
  if (bar) doc.ops.push(doc.rect(x0, doc.y + 4, 3, top - doc.y - 2, 'accent'));
  else if (template === 'senior') { doc.line(x0, doc.y, x1, doc.y, 0.8, 'accent'); doc.line(x0, doc.y - 2.4, x1, doc.y - 2.4, 0.8, 'accent'); doc.y -= 2.4; }
  else doc.line(x0, doc.y, x1, doc.y, 1.2, 'accent');
  doc.y -= GAP(4);
}

function section(doc, title, x0, x1, first) {
  doc.need(SIZE.head * 2 + SIZE.body * LEAD * 2); // keep a heading with at least its first lines
  doc.y -= GAP(first ? 10 : 17);
  const t = title.toUpperCase(), w = measure(t, 'B', SIZE.head);
  doc.text(x0, doc.y, t, 'B', SIZE.head, 'accent');
  doc.line(x0 + w + 7, doc.y + SIZE.head * 0.34, x1, doc.y + SIZE.head * 0.34, 0.55, 'rule');
  doc.y -= GAP(4);
}

function bullets(doc, list, x0, x1) {
  (list || []).filter(Boolean).forEach(b => {
    const ind = SIZE.body * 1.1;
    const lines = wrap([{ text: b, f: 'R', color: 'text' }], SIZE.body, x1 - x0 - ind);
    doc.need(SIZE.body * LEAD);
    const y0 = doc.y - SIZE.body * LEAD;
    doc.text(x0 + 2, y0 + SIZE.body * 0.28, '•', 'R', SIZE.body, 'accent');
    drawLines(doc, lines, x0 + ind, SIZE.body);
    doc.y -= GAP(0.6);
  });
}

function entry(doc, what, where, when, list, x0, x1) {
  const dateW = when ? measure(when, 'R', SIZE.small) + 12 : 0;
  const lines = wrap([{ text: what, f: 'B', color: 'ink' }, where ? { text: ', ' + where, f: 'I', color: 'muted' } : null].filter(Boolean), SIZE.body, x1 - x0 - dateW);
  doc.need(SIZE.body * LEAD * 2);
  doc.y -= GAP(3);
  const firstY = doc.y - SIZE.body * LEAD;
  drawLines(doc, lines, x0, SIZE.body);
  if (when) doc.text(x1 - measure(when, 'R', SIZE.small), firstY + SIZE.body * 0.28, when, 'R', SIZE.small, 'accent');
  bullets(doc, list, x0, x1);
}

function skills(doc, groups, x0, x1, stacked) {
  const labelW = stacked ? 0 : Math.max(...groups.map(g => measure(g.category, 'B', SIZE.body))) + 12;
  groups.forEach(g => {
    const runs = g.items.flatMap((it, i) => [i ? { text: ' · ', f: 'R', color: 'rule' } : null, { text: it.replace(/\s+/g, ' '), f: 'R', color: 'text' }].filter(Boolean));
    if (stacked) {
      drawLines(doc, wrap([{ text: g.category, f: 'B', color: 'ink' }], SIZE.body, x1 - x0), x0, SIZE.body);
      drawLines(doc, wrap(runs, SIZE.body, x1 - x0), x0, SIZE.body);
      doc.y -= GAP(4);
    } else {
      doc.need(SIZE.body * LEAD);
      doc.text(x0, doc.y - SIZE.body * LEAD + SIZE.body * 0.28, g.category, 'B', SIZE.body, 'ink');
      drawLines(doc, wrap(runs, SIZE.body, x1 - x0 - labelW), x0 + labelW, SIZE.body);
      doc.y -= GAP(1);
    }
  });
}

const ORDER = {
  standard: ['summary', 'skills', 'experience', 'projects', 'education', 'certifications'],
  student: ['summary', 'education', 'projects', 'skills', 'experience', 'certifications'],
  combination: ['summary', 'experience', 'projects', 'education'],
  senior: ['summary', 'experience', 'skills', 'projects', 'education', 'certifications'],
};

function sections(doc, r, keys, x0, x1, stacked) {
  let first = true;
  const sec = (title, draw) => { section(doc, title, x0, x1, first); first = false; draw(); };
  keys.forEach(k => {
    if (k === 'summary' && r.summary) sec('Profile', () => drawLines(doc, wrap([{ text: r.summary, f: 'R', color: 'text' }], SIZE.body, x1 - x0), x0, SIZE.body));
    if (k === 'skills' && (r.skills || []).length) sec('Skills', () => skills(doc, r.skills, x0, x1, stacked));
    if (k === 'experience' && (r.experience || []).length) sec('Experience', () => r.experience.forEach(e => entry(doc, e.title, [e.company, e.location].filter(Boolean).join(', '), dateRange(e), e.bullets, x0, x1)));
    if (k === 'projects' && (r.projects || []).length) sec('Projects', () => r.projects.forEach(p => entry(doc, p.name, p.tech, dateRange(p), p.bullets, x0, x1)));
    if (k === 'education' && (r.education || []).length) sec('Education', () => r.education.forEach(e => entry(doc,
      [e.degree, e.field].filter(Boolean).join(', ') || e.school, e.degree || e.field ? e.school : '', dateRange(e), [e.gpa && `GPA ${e.gpa}`, ...(e.details || [])], x0, x1)));
    if (k === 'certifications' && (r.certifications || []).length) sec('Certifications', () => bullets(doc, r.certifications.map(x => [x.name, x.issuer].filter(Boolean).join(' — ')), x0, x1));
  });
}

/** The PDF file's bytes. */
export function resumePdf(r, template = 'standard') {
  const t = ORDER[template] ? template : 'standard';
  // Fit the page: the largest size (up to 1.25×) that still fits one page; if even 0.9× doesn't, it runs onto a second.
  const usable = PAGE_H - TOP - BOTTOM;
  const fits = (k) => { const d = layout(r, t, k); return d.pages.length === 1 && d.used <= usable; };
  let lo = 0.9, hi = 1.25;
  if (fits(hi)) lo = hi;
  else if (fits(lo)) { for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; } }
  const doc = layout(r, t, lo);
  scaleTo(1);
  return assemble(doc.pages, r.contact && r.contact.fullName);
}

function layout(r, t, k) {
  scaleTo(k);
  const doc = makeDoc();
  const x0 = MARGIN_X, x1 = PAGE_W - MARGIN_X;
  header(doc, r, t, x0, x1);
  if (t === 'combination') {
    // A tinted side column (skills, certifications) beside the main one; the tint is laid under the side's text.
    const sideW = (x1 - x0) * 0.31, gap = 18, top = doc.y;
    const at = doc.ops.length;
    doc.y = top - 6;
    sections(doc, r, ['skills', 'certifications'], x0 + 9, x0 + sideW - 9, true);
    const sideBottom = doc.y - 8;
    doc.ops.splice(at, 0, doc.rect(x0, sideBottom, sideW, top - sideBottom, 'tint'));
    doc.y = top;
    sections(doc, r, ORDER.combination, x0 + sideW + gap, x1, false);
  } else sections(doc, r, ORDER[t], x0, x1, false);
  doc.used = PAGE_H - TOP - doc.y;
  return doc;
}

function assemble(pages, author) {
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };
  const catalog = add(''), tree = add('');
  const fonts = ['Times-Roman', 'Times-Bold', 'Times-Italic'].map(b => add(`<< /Type /Font /Subtype /Type1 /BaseFont /${b} /Encoding /WinAnsiEncoding >>`));
  const kids = pages.map(ops => {
    const body = ops.join('\n');
    const content = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
    return add(`<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${content} 0 R /Resources << /Font << /F1 ${fonts[0]} 0 R /F2 ${fonts[1]} 0 R /F3 ${fonts[2]} 0 R >> >> >>`);
  });
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${tree} 0 R >>`;
  objs[tree - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  const info = add(`<< /Title ${pdfString((author ? author + ' – ' : '') + 'Resume')} /Author ${pdfString(author || '')} /Producer (Job Hunter) >>`);
  let out = '%PDF-1.4\n%âãÏÓ\n';
  const offsets = objs.map((o, i) => { const at = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}
