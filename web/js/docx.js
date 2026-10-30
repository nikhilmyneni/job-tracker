/**
 * Word (.docx), with no libraries: CV import (reading), and the tailored resume (writing).
 * A .docx is a ZIP of XML files: we read word/document.xml and turn its paragraphs into lines.
 * zipStore writes a ZIP (used by the tests to build sample files).
 */
// ---------- ZIP ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** files: [{name, data: string|Uint8Array}] → ZIP bytes (stored, no compression). */
export function zipStore(files) {
  const enc = new TextEncoder();
  const chunks = [], central = [];
  let offset = 0;
  files.forEach(f => {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true); local.setUint32(14, crc, true); local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true); local.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(local.buffer), name, data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true);
    cen.setUint16(28, name.length, true); cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + data.length;
  });
  const cenSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true); end.setUint32(16, offset, true);
  const all = chunks.concat(central, [new Uint8Array(end.buffer)]);
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let p = 0; all.forEach(c => { out.set(c, p); p += c.length; });
  return out;
}

async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Reads one file out of a ZIP (stored or deflated). Null when it isn't there. */
export async function unzipFile(bytes, wanted) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let e = bytes.length - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('This file is not a valid .docx.');
  const count = v.getUint16(e + 10, true);
  let p = v.getUint32(e + 16, true);
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extra = v.getUint16(p + 30, true), comment = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (name === wanted) {
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      const data = bytes.subarray(start, start + size);
      if (method === 0) return data;
      if (method === 8) return inflateRaw(data);
      throw new Error('This .docx uses an unusual compression. Save it again from Word, or paste the text.');
    }
    p += 46 + nameLen + extra + comment;
  }
  return null;
}

// ---------- DOCX → text ----------
const unescapeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** word/document.xml → lines of text; list paragraphs become "• " lines. */
export function docxXmlToText(xml) {
  const body = (String(xml).match(/<w:body[^>]*>([\s\S]*)<\/w:body>/) || [, String(xml)])[1];
  return body.split(/<\/w:p>/).map(p => {
    const text = (p.match(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>|<w:tab\/>|<w:br\/>/g) || [])
      .map(t => (t === '<w:tab/>' ? '\t' : t === '<w:br/>' ? '\n' : unescapeXml(t.replace(/<[^>]+>/g, '')))).join('');
    if (!text.trim()) return '';
    return (/<w:numPr>/.test(p) ? '• ' : '') + text.trim();
  }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export async function docxToText(bytes) {
  const doc = await unzipFile(bytes, 'word/document.xml');
  if (!doc) throw new Error('No text found in this .docx.');
  return docxXmlToText(new TextDecoder().decode(doc));
}

// ---------- resume → .docx ----------
const xmlEsc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const run = (text, props = '') => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r>`;
const para = (runs, pPr = '') => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${runs}</w:p>`;
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ym = (s) => { const [y, m] = String(s || '').split('-'); return y ? (m ? `${MONTHS[Number(m) - 1]} ${y}` : y) : ''; };
const range = (e) => [ym(e.start), e.current ? 'Present' : ym(e.end || e.date)].filter(Boolean).join(' – ');

/** The resume's word/document.xml: one A4 page, headings with a rule under them, real bullet lists. */
export function resumeDocumentXml(r) {
  const c = r.contact || {};
  const out = [];
  const heading = (t) => out.push(para(run(t, '<w:b/><w:sz w:val="22"/><w:color w:val="0F1730"/>'), '<w:spacing w:before="200" w:after="60"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="C9D0E0"/></w:pBdr>'));
  const line = (left, right) => out.push(para(run(left, '<w:b/>') + (right ? run('\t' + right) : ''), '<w:tabs><w:tab w:val="right" w:pos="9638"/></w:tabs><w:spacing w:before="80" w:after="20"/>'));
  const bullets = (list) => (list || []).filter(Boolean).forEach(b => out.push(para(run(b), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:spacing w:after="20"/>')));
  out.push(para(run(c.fullName, '<w:b/><w:sz w:val="36"/>'), '<w:spacing w:after="20"/>'));
  if (c.headline) out.push(para(run(c.headline, '<w:color w:val="39425C"/>')));
  out.push(para(run([c.email, c.phone, c.location, c.linkedin, c.github, c.website].filter(Boolean).join(' | '), '<w:sz w:val="18"/>'), '<w:spacing w:after="80"/>'));
  if (r.summary) { heading('Summary'); out.push(para(run(r.summary))); }
  if ((r.skills || []).length) { heading('Skills'); r.skills.forEach(s => out.push(para(run(s.category + ': ', '<w:b/>') + run(s.items.join(', '))))); }
  if ((r.experience || []).length) { heading('Experience'); r.experience.forEach(e => { line([e.title, e.company].filter(Boolean).join(', '), range(e)); bullets(e.bullets); }); }
  if ((r.projects || []).length) { heading('Projects'); r.projects.forEach(p => { line([p.name, p.tech].filter(Boolean).join(' — '), range(p)); bullets(p.bullets); }); }
  if ((r.education || []).length) { heading('Education'); r.education.forEach(e => { line([e.degree, e.field, e.school].filter(Boolean).join(', '), range(e)); bullets([e.gpa && (/[a-z%]/i.test(e.gpa) ? e.gpa : `GPA ${e.gpa}`), ...(e.details || [])]); }); }
  if ((r.certifications || []).length) { heading('Certifications'); bullets(r.certifications.map(x => [x.name, x.issuer, ym(x.date)].filter(Boolean).join(', '))); }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${out.join('')}` +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="1000" w:bottom="850" w:left="1000" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>';
}

/** The resume as a .docx file (bytes). */
export function resumeDocx(r) {
  return zipStore([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>' },
    { name: 'word/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/><w:sz w:val="20"/><w:color w:val="111111"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="252" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>` },
    { name: 'word/numbering.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="300" w:hanging="200"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>` },
    { name: 'word/document.xml', data: resumeDocumentXml(r) },
  ]);
}
