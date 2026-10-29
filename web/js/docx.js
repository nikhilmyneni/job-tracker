/**
 * Word (.docx) in and out, with no libraries.
 * A .docx is a ZIP of XML files: we read word/document.xml for CV text,
 * and write a minimal document (stored ZIP, no compression) for resumes.
 */
import { resumeBlocks } from './core.js';

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

// ---------- resume → DOCX ----------
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const run = (text, rPr) => `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
const para = (pPr, runs) => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${runs}</w:p>`;

/** Resume → document.xml, same blocks as the on-screen sheet. sizes in half-points. */
export function resumeDocumentXml(r) {
  const out = resumeBlocks(r).map(b => {
    switch (b.t) {
      case 'name': return para('<w:jc w:val="center"/><w:spacing w:after="20"/>', run(b.text, '<w:sz w:val="40"/>'));
      case 'headline': return para('<w:jc w:val="center"/><w:spacing w:after="20"/>', run(b.text, '<w:i/><w:sz w:val="21"/>'));
      case 'contact': return para('<w:jc w:val="center"/><w:spacing w:after="80"/>', run(b.text, '<w:color w:val="444444"/><w:sz w:val="18"/>'));
      case 'section': return para('<w:spacing w:before="160" w:after="60"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="111111"/></w:pBdr>', run(b.text.toUpperCase(), '<w:b/><w:sz w:val="21"/>'));
      case 'skill': return para('<w:spacing w:after="20"/>', (b.label ? run(b.label + ': ', '<w:b/>') : '') + run(b.text));
      case 'line': return para('<w:tabs><w:tab w:val="right" w:pos="9638"/></w:tabs><w:spacing w:before="80" w:after="0"/>',
        run(b.text, '<w:b/>') + (b.right ? `<w:r><w:tab/></w:r>${run(b.right, '<w:i/><w:color w:val="555555"/>')}` : ''));
      case 'italic': return para('<w:spacing w:after="0"/>', run(b.text, '<w:i/>'));
      case 'bullet': return para('<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:spacing w:after="10"/>', run(b.text));
      default: return para('<w:spacing w:after="40"/>', run(b.text));
    }
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + out +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="680" w:right="900" w:bottom="680" w:left="900" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>' +
    '</w:body></w:document>';
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/><w:sz w:val="20"/><w:color w:val="111111"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="252" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`;
const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="300" w:hanging="200"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>';
const ROOT_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
const DOC_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>';

/** Resume → .docx bytes. */
export function resumeToDocx(r) {
  return zipStore([
    { name: '[Content_Types].xml', data: CONTENT_TYPES },
    { name: '_rels/.rels', data: ROOT_RELS },
    { name: 'word/document.xml', data: resumeDocumentXml(r) },
    { name: 'word/styles.xml', data: STYLES },
    { name: 'word/numbering.xml', data: NUMBERING },
    { name: 'word/_rels/document.xml.rels', data: DOC_RELS },
  ]);
}
