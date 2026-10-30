/**
 * Just enough of a TrueType font file to embed it in a PDF: names, metrics, and the width of each WinAnsi character
 * (via the font's cmap and hmtx tables). Used for ResumeFold's resume font, Source Sans 3 (vendor/fonts). Pure, no DOM.
 */

// WinAnsi codes 128–159 are not Unicode; everything else (32–126, 160–255) is.
const WIN_ANSI_HIGH = { 128: 0x20ac, 130: 0x201a, 131: 0x0192, 132: 0x201e, 133: 0x2026, 134: 0x2020, 135: 0x2021, 136: 0x02c6, 137: 0x2030, 138: 0x0160,
  139: 0x2039, 140: 0x0152, 142: 0x017d, 145: 0x2018, 146: 0x2019, 147: 0x201c, 148: 0x201d, 149: 0x2022, 150: 0x2013, 151: 0x2014, 152: 0x02dc, 153: 0x2122,
  154: 0x0161, 155: 0x203a, 156: 0x0153, 158: 0x017e, 159: 0x0178 };
export const winAnsiToUnicode = (code) => (code >= 128 && code <= 159 ? WIN_ANSI_HIGH[code] || 0 : code);

/** Parses a TrueType file (ArrayBuffer or Uint8Array). Returns what a PDF font needs, with widths for codes 32–255. */
export function readTtf(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = {};
  const n = v.getUint16(4);
  for (let i = 0; i < n; i++) {
    const at = 12 + i * 16;
    const tag = String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
    tables[tag] = { offset: v.getUint32(at + 8), length: v.getUint32(at + 12) };
  }
  const need = (t) => { if (!tables[t]) throw new Error(`font has no ${t} table`); return tables[t].offset; };
  const head = need('head'), hhea = need('hhea'), maxp = need('maxp'), hmtx = need('hmtx'), cmap = need('cmap');
  const unitsPerEm = v.getUint16(head + 18);
  const bbox = [v.getInt16(head + 36), v.getInt16(head + 38), v.getInt16(head + 40), v.getInt16(head + 42)];
  const numHMetrics = v.getUint16(hhea + 34), numGlyphs = v.getUint16(maxp + 4);
  let ascent = v.getInt16(hhea + 4), descent = v.getInt16(hhea + 6), capHeight = ascent * 0.7, weight = 400, italic = false;
  if (tables['OS/2']) {
    const os2 = tables['OS/2'].offset, version = v.getUint16(os2);
    weight = v.getUint16(os2 + 4);
    italic = !!(v.getUint16(os2 + 62) & 1);
    ascent = v.getInt16(os2 + 68); descent = v.getInt16(os2 + 70);
    if (version >= 2) capHeight = v.getInt16(os2 + 88);
  }
  let italicAngle = 0;
  if (tables.post) italicAngle = v.getInt32(tables.post.offset + 4) / 65536;
  const advance = (g) => v.getUint16(hmtx + 4 * Math.min(g, numHMetrics - 1));

  // cmap: a Unicode subtable, format 4 (BMP) or 12.
  const glyphOf = cmapLookup(v, cmap);
  const scale = 1000 / unitsPerEm;
  const widths = [], has = new Set();
  for (let code = 32; code <= 255; code++) {
    const u = winAnsiToUnicode(code), g = u ? glyphOf(u) : 0;
    if (g && g < numGlyphs) has.add(code);
    widths.push(Math.round(advance(g || 0) * scale));
  }
  let name = 'Font';
  if (tables.name) name = postScriptName(v, bytes, tables.name.offset) || name;
  return {
    name: name.replace(/[^A-Za-z0-9-]/g, ''), bytes, widths, has, weight, italic, italicAngle,
    ascent: Math.round(ascent * scale), descent: Math.round(descent * scale), capHeight: Math.round(capHeight * scale),
    bbox: bbox.map(x => Math.round(x * scale)),
  };
}

function cmapLookup(v, cmap) {
  const count = v.getUint16(cmap + 2);
  let best = null;
  for (let i = 0; i < count; i++) {
    const platform = v.getUint16(cmap + 4 + i * 8), enc = v.getUint16(cmap + 6 + i * 8), off = cmap + v.getUint32(cmap + 8 + i * 8);
    const format = v.getUint16(off);
    if ((platform === 3 && (enc === 1 || enc === 10)) || platform === 0) {
      if (format === 12) { best = { format, off }; break; }
      if (format === 4 && !best) best = { format, off };
    }
  }
  if (!best) throw new Error('font has no Unicode cmap');
  const o = best.off;
  if (best.format === 12) {
    const groups = v.getUint32(o + 12);
    return (u) => {
      for (let i = 0; i < groups; i++) {
        const g = o + 16 + i * 12, start = v.getUint32(g), end = v.getUint32(g + 4);
        if (u >= start && u <= end) return v.getUint32(g + 8) + (u - start);
      }
      return 0;
    };
  }
  const segX2 = v.getUint16(o + 6), ends = o + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
  return (u) => {
    for (let i = 0; i < segX2; i += 2) {
      const end = v.getUint16(ends + i);
      if (u > end) continue;
      const start = v.getUint16(starts + i);
      if (u < start) return 0;
      const delta = v.getInt16(deltas + i), range = v.getUint16(ranges + i);
      if (!range) return (u + delta) & 0xffff;
      const g = v.getUint16(ranges + i + range + 2 * (u - start));
      return g ? (g + delta) & 0xffff : 0;
    }
    return 0;
  };
}

/** The font's PostScript name (name ID 6), from a Windows (UTF-16) or Mac (Latin) record. */
function postScriptName(v, bytes, name) {
  const count = v.getUint16(name + 2), strings = name + v.getUint16(name + 4);
  for (let i = 0; i < count; i++) {
    const r = name + 6 + i * 12;
    if (v.getUint16(r + 6) !== 6) continue;
    const platform = v.getUint16(r), len = v.getUint16(r + 8), off = strings + v.getUint16(r + 10);
    let s = '';
    if (platform === 3 || platform === 0) for (let k = 0; k < len; k += 2) s += String.fromCharCode(v.getUint16(off + k));
    else for (let k = 0; k < len; k++) s += String.fromCharCode(bytes[off + k]);
    if (s) return s;
  }
  return '';
}
