/**
 * The tailored resume as a real PDF, made in the browser with no library, in ResumeFold's layouts (Standard, Student,
 * Combination, Senior), following ResumeFold's own PDF export: its section names and order, the title / dates and
 * company / location rows, "•" bullets, rules and spacing. Text is set in ResumeFold's font, Source Sans 3, embedded from
 * the same font files ResumeFold uses (vendor/fonts, read with js/ttf.js), so it's selectable and reads cleanly for
 * applicant tracking systems. Without the font files (e.g. in tests) it falls back to Helvetica, a PDF core font.
 * Type and spacing scale a little to fill one page without blank space. Pure, no DOM:
 * resumePdf(resume, template, fonts?) where fonts = {R, B, I} from readTtf().
 */
import { CODES, HELVETICA, HELVETICA_BOLD, HELVETICA_OBLIQUE } from './pdf-fonts.js';
import { dateRange, skillLabel, contactLink, bulletText } from './core.js';

const PAGE_W = 595.28, PAGE_H = 841.89;
const MARGIN_Y = 36, MARGIN_X = 44.64; // ResumeFold "normal" margins (0.5in / 0.62in)
const FONT = { R: 'F1', B: 'F2', I: 'F3' };
const CORE_WIDTHS = {};
[['R', HELVETICA], ['B', HELVETICA_BOLD], ['I', HELVETICA_OBLIQUE]].forEach(([f, list]) => { CORE_WIDTHS[f] = new Map(CODES.map((c, i) => [c, list[i]])); });
let WIDTHS = CORE_WIDTHS;
/** Measures with the embedded fonts' widths (codes 32–255 the font has), or the core Helvetica ones. */
function useFonts(fonts) {
  if (!fonts) { WIDTHS = CORE_WIDTHS; return; }
  WIDTHS = {};
  ['R', 'B', 'I'].forEach(f => { WIDTHS[f] = new Map(fonts[f].widths.map((w, i) => [32 + i, w]).filter(([c]) => c <= 126 || fonts[f].has.has(c))); });
}
const COLOR = { ink: [0.067, 0.067, 0.067], muted: [0.23, 0.22, 0.2] }; // ResumeFold: ink #111111 (accent "none"), muted
// ResumeFold's section names; Standard and Combination set them in capitals.
export const HEADINGS = { summary: 'Summary', experience: 'Work Experience', education: 'Education', skills: 'Skills', projects: 'Projects', certifications: 'Certifications' };
export const ORDER = ['summary', 'experience', 'education', 'skills', 'projects', 'certifications']; // ResumeFold's default order
const STYLE = {
  standard: { name: 2.2, align: 'center', headline: true, upper: true, head: 1, rule: 'line', entryGap: 6, liGap: 1.6, lead: 0, headGap: 9 },
  student: { name: 2.3, align: 'center', headline: false, upper: false, head: 1.15, rule: 'line', entryGap: 4, liGap: 0.8, lead: -0.04, headGap: 6 },
  combination: { name: 2.3, align: 'left', headline: true, upper: true, head: 1, rule: 'bar', entryGap: 6, liGap: 1.6, lead: 0, headGap: 6, headRule: 1.6 },
  senior: { name: 2.5, align: 'left', headline: true, italicHeadline: true, upper: false, head: 1.25, rule: 'line', entryGap: 9, liGap: 1.6, lead: 0.05, headGap: 12 },
};

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
const measure = (s, f, size) => codes(s).reduce((n, c) => n + (WIDTHS[f].get(c) || 278), 0) * size / 1000;
const pdfString = (s) => '(' + codes(s).map(c => (c === 40 || c === 41 || c === 92 ? '\\' + String.fromCharCode(c) : c > 126 ? '\\' + c.toString(8).padStart(3, '0') : String.fromCharCode(c))).join('') + ')';
const n2 = (x) => (Math.round(x * 100) / 100).toString();
const rgb = (c, op) => `${n2(c[0])} ${n2(c[1])} ${n2(c[2])} ${op}`;

// ---------- pages ----------
function makeDoc() {
  const pages = [[]], links = [[]];
  const doc = {
    links,
    y: PAGE_H - MARGIN_Y,
    get ops() { return pages[pages.length - 1]; },
    pages,
    /** Room for h more points on this page, or a new page. */
    need(h) { if (doc.y - h < MARGIN_Y) { pages.push([]); links.push([]); doc.y = PAGE_H - MARGIN_Y; } },
    /** A clickable area on this page that opens uri. */
    link(x, y, w, h, uri) { links[links.length - 1].push({ rect: [x, y, x + w, y + h], uri }); },
    text(x, y, s, f, size, color) { if (s) doc.ops.push(`BT /${FONT[f]} ${n2(size)} Tf ${rgb(COLOR[color], 'rg')} ${n2(x)} ${n2(y)} Td ${pdfString(s)} Tj ET`); },
    line(x1, y1, x2, y2, w) { doc.ops.push(`${rgb(COLOR.ink, 'RG')} ${n2(w)} w ${n2(x1)} ${n2(y1)} m ${n2(x2)} ${n2(y2)} l S`); },
    bar(x, y, w, h) { doc.ops.push(`${rgb(COLOR.ink, 'rg')} ${n2(x)} ${n2(y)} ${n2(w)} ${n2(h)} re f`); },
  };
  return doc;
}

/** Runs of text ({text, f, color}) wrapped into lines no wider than maxW; each line is a list of placed pieces. */
function wrap(runs, size, maxW) {
  const words = [];
  runs.forEach(r => String(r.text || '').split(/(\s+)/).forEach(part => {
    if (!part) return;
    if (/^\s+$/.test(part)) { if (words.length) words[words.length - 1].space = true; return; }
    // A single word wider than the whole line (a long link) is broken into pieces that fit.
    let rest = part;
    while (measure(rest, r.f, size) > maxW && rest.length > 1) {
      let n = rest.length - 1;
      while (n > 1 && measure(rest.slice(0, n), r.f, size) > maxW) n--;
      words.push({ text: rest.slice(0, n), f: r.f, color: r.color, link: r.link, space: false });
      rest = rest.slice(n);
    }
    words.push({ text: rest, f: r.f, color: r.color, link: r.link, space: false });
  }));
  const lines = [[]];
  let x = 0;
  words.forEach((w, i) => {
    const ww = measure(w.text, w.f, size);
    const gap = i && words[i - 1].space ? measure(' ', w.f, size) : 0;
    if (lines[lines.length - 1].length && x + gap + ww > maxW) { lines.push([]); x = 0; }
    const line = lines[lines.length - 1];
    const lead = line.length ? gap : 0;
    line.push({ text: w.text, f: w.f, color: w.color, link: w.link, x: x + lead });
    x += lead + ww;
  });
  return lines.filter(l => l.length).map(l => Object.assign(l, { width: l.reduce((m, p) => Math.max(m, p.x + measure(p.text, p.f, size)), 0) }));
}

// ---------- one layout pass at a given scale ----------
function layout(r, t, k) {
  const st = STYLE[t];
  const size = 10.5 * k, lead = 1.32 + st.lead, gap = (n) => n * k * k * k; // spacing grows faster than type
  const small = size * 0.95, x0 = MARGIN_X, x1 = PAGE_W - MARGIN_X;
  const doc = makeDoc();
  const lineH = (s) => s * lead;
  const draw = (lines, s, x = x0, align = 'left') => lines.forEach(l => {
    doc.need(lineH(s));
    doc.y -= lineH(s);
    const left = align === 'center' ? (x0 + x1 - l.width) / 2 : x;
    l.forEach(p => {
      doc.text(left + p.x, doc.y + s * 0.25, p.text, p.f, s, p.color);
      if (p.link) doc.link(left + p.x, doc.y + s * 0.05, measure(p.text, p.f, s), s * 1.05, p.link);
    });
  });
  const para = (runs, s, align) => draw(wrap(runs, s, x1 - x0), s, x0, align);

  /** A row: left runs, and right text (dates, location) aligned right; wraps to two lines if they don't fit with 12pt between. */
  const row = (left, right) => {
    const rw = right ? measure(right, 'R', small) : 0;
    const lines = wrap(left, size, right ? x1 - x0 - rw - 12 : x1 - x0);
    doc.need(lineH(size) * lines.length);
    const firstY = doc.y - lineH(size);
    draw(lines, size);
    if (right) doc.text(x1 - rw, firstY + size * 0.25, right, 'R', small, 'muted');
  };
  const bullets = (list) => (list || []).map(bulletText).filter(Boolean).forEach(b => {
    const lines = wrap([{ text: b, f: 'R', color: 'ink' }], size, x1 - x0 - 12);
    doc.need(lineH(size));
    doc.text(x0 + 2, doc.y - lineH(size) + size * 0.25, '•', 'R', size, 'ink');
    draw(lines, size, x0 + 12);
    doc.y -= gap(st.liGap);
  });

  // Header
  const c = r.contact || {};
  draw(wrap([{ text: c.fullName || 'Your name', f: 'B', color: 'ink' }], size * st.name, x1 - x0), size * st.name, x0, st.align);
  if (st.headline && c.headline) {
    doc.y -= gap(2);
    para([{ text: c.headline, f: st.italicHeadline ? 'I' : 'R', color: 'muted' }], size * 1.05, st.align);
  }
  const contact = [c.email, c.phone, c.location, c.website, c.linkedin, c.github].filter(Boolean);
  if (contact.length) {
    doc.y -= gap(3);
    para(contact.flatMap((x, i) => [i ? { text: '  ·  ', f: 'R', color: 'ink' } : null, { text: String(x).replace(/\s+/g, ' '), f: 'R', color: 'ink', link: contactLink(x) }].filter(Boolean)), size * 0.92, st.align);
  }
  if (st.headRule) { doc.y -= gap(6); doc.line(x0, doc.y, x1, doc.y, st.headRule); }
  doc.y -= gap(st.headGap) - gap(9); // the first section's 9pt gap below adds the rest

  // Sections
  const heading = (key) => {
    const s = size * st.head, label = st.upper ? HEADINGS[key].toUpperCase() : HEADINGS[key];
    doc.need(lineH(s) + lineH(size) * 3); // keep a heading with its first lines
    doc.y -= gap(9) + lineH(s);
    doc.text(x0, doc.y + s * 0.25, label, 'B', s, 'ink');
    if (st.rule === 'line') { doc.y -= gap(2); doc.line(x0, doc.y, x1, doc.y, 0.6); }
    else { doc.y -= gap(3); doc.bar(x0, doc.y - 2, 26, 2); doc.y -= 2; }
    doc.y -= gap(5);
  };
  const entry = (draw1) => { draw1(); doc.y -= gap(st.entryGap); };
  ORDER.forEach(key => {
    if (key === 'summary' && r.summary) { heading(key); para([{ text: r.summary, f: 'R', color: 'ink' }], size); doc.y -= gap(2); }
    if (key === 'experience' && (r.experience || []).length) {
      heading(key);
      r.experience.forEach(e => entry(() => {
        row([{ text: e.title, f: 'B', color: 'ink' }], dateRange(e));
        if (e.company || e.location) row([{ text: e.company || '', f: 'I', color: 'ink' }], e.location || '');
        bullets(e.bullets);
      }));
    }
    if (key === 'education' && (r.education || []).length) {
      heading(key);
      r.education.forEach(e => entry(() => {
        const degree = [[e.degree, e.field].filter(Boolean).join(' in '), e.gpa && (/[a-z%]/i.test(e.gpa) ? e.gpa : `GPA ${e.gpa}`)].filter(Boolean).join(', ');
        row([{ text: e.school || degree, f: 'B', color: 'ink' }], dateRange(e));
        if (e.school && degree) row([{ text: degree, f: 'I', color: 'ink' }], e.location || '');
        bullets(e.details);
      }));
    }
    if (key === 'skills' && (r.skills || []).length) {
      heading(key);
      r.skills.forEach(g => { para([skillLabel(g) ? { text: `${skillLabel(g)}: `, f: 'B', color: 'ink' } : null, { text: (g.items || []).join(', '), f: 'R', color: 'ink' }].filter(Boolean), size); doc.y -= gap(1.8); });
    }
    if (key === 'projects' && (r.projects || []).length) {
      heading(key);
      r.projects.forEach(p => entry(() => {
        row([{ text: p.name || '', f: 'B', color: 'ink' }, p.tech ? { text: ` | ${p.tech}`, f: 'I', color: 'ink' } : null].filter(Boolean), dateRange(p));
        bullets(p.bullets);
      }));
    }
    if (key === 'certifications' && (r.certifications || []).length) {
      heading(key);
      r.certifications.forEach(x => { row([{ text: x.name || '', f: 'B', color: 'ink' }, x.issuer ? { text: `, ${x.issuer}`, f: 'R', color: 'ink' } : null].filter(Boolean), dateRange(x)); doc.y -= gap(2); });
    }
  });
  doc.used = PAGE_H - MARGIN_Y - doc.y;
  return doc;
}

/** The PDF file's bytes. Picks the largest scale (up to about 12pt) that keeps one page; if even 9.7pt doesn't fit, it runs on. */
export function resumePdf(r, template = 'standard', fonts = null) {
  const t = STYLE[template] ? template : 'standard';
  useFonts(fonts);
  const usable = PAGE_H - 2 * MARGIN_Y;
  const fits = (k) => { const d = layout(r, t, k); return d.pages.length === 1 && d.used <= usable; };
  let lo = 0.92, hi = 1.15;
  if (fits(hi)) lo = hi;
  else if (fits(lo)) { for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; } }
  const doc = layout(r, t, lo);
  const out = assemble(doc.pages, r.contact && r.contact.fullName, fonts, doc.links);
  useFonts(null);
  return out;
}

const latin1 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return s; };

function assemble(pages, author, embedded, links = []) {
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };
  const catalog = add(''), tree = add('');
  const fonts = embedded
    // ResumeFold's Source Sans 3, embedded whole (each file is a small Latin subset), as TrueType with WinAnsi widths.
    ? [['R', 'SourceSans3-Regular'], ['B', 'SourceSans3-Bold'], ['I', 'SourceSans3-Italic']].map(([f, name]) => {
      const t = embedded[f], data = latin1(t.bytes);
      const file = add(`<< /Length ${data.length} /Length1 ${data.length} >>\nstream\n${data}\nendstream`);
      const desc = add(`<< /Type /FontDescriptor /FontName /${name} /Flags ${32 + (t.italic ? 64 : 0)} /FontBBox [${t.bbox.join(' ')}] /ItalicAngle ${n2(t.italicAngle)} ` +
        `/Ascent ${t.ascent} /Descent ${t.descent} /CapHeight ${t.capHeight} /StemV ${t.weight >= 600 ? 140 : 80} /FontFile2 ${file} 0 R >>`);
      return add(`<< /Type /Font /Subtype /TrueType /BaseFont /${name} /FirstChar 32 /LastChar 255 /Widths [${t.widths.join(' ')}] /Encoding /WinAnsiEncoding /FontDescriptor ${desc} 0 R >>`);
    })
    : ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique'].map(b => add(`<< /Type /Font /Subtype /Type1 /BaseFont /${b} /Encoding /WinAnsiEncoding >>`));
  const kids = pages.map((ops, i) => {
    const body = ops.join('\n');
    const content = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
    // Clickable contact details: link annotations that open the email, phone or web address.
    const annots = (links[i] || []).map(l => add(`<< /Type /Annot /Subtype /Link /Rect [${l.rect.map(n2).join(' ')}] /Border [0 0 0] /A << /S /URI /URI ${pdfString(l.uri)} >> >>`));
    return add(`<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${content} 0 R${annots.length ? ` /Annots [${annots.map(a => a + ' 0 R').join(' ')}]` : ''} /Resources << /Font << /F1 ${fonts[0]} 0 R /F2 ${fonts[1]} 0 R /F3 ${fonts[2]} 0 R >> >> >>`);
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
