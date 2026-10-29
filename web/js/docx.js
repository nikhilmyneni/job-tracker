/**
 * Word (.docx) CV import, with no libraries.
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
