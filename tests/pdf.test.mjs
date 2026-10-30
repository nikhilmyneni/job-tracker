// The resume PDF writer (web/js/pdf.js): a valid file, real text, every layout, long resumes onto a second page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resumePdf } from '../web/js/pdf.js';
import { DEMO_FOLD } from '../web/js/demo.js';

const latin = (bytes) => Array.from(bytes, b => String.fromCharCode(b)).join('');

function checkXref(s) {
  const at = Number(s.match(/startxref\n(\d+)/)[1]);
  assert.equal(s.slice(at, at + 4), 'xref');
  const [, count] = s.slice(at).match(/xref\n0 (\d+)/);
  const rows = s.slice(at).split('\n').slice(3, 2 + Number(count));
  rows.forEach((row, i) => { const off = Number(row.slice(0, 10)); assert.equal(s.slice(off, off + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`, `object ${i + 1}`); });
}

test('every layout makes a valid PDF with the resume as real text', () => {
  for (const t of ['standard', 'student', 'combination', 'senior']) {
    const s = latin(resumePdf(DEMO_FOLD, t));
    assert.ok(s.startsWith('%PDF-1.4'));
    assert.ok(s.trimEnd().endsWith('%%EOF'));
    checkXref(s);
    assert.ok(s.includes('(Test) Tj') && s.includes('(Person) Tj'), t); // each word is placed on its own
    assert.ok(/\((WORK EXPERIENCE|Work Experience)\) Tj/.test(s), t); // ResumeFold's heading, in capitals for Standard and Combination
    assert.ok(s.includes('/BaseFont /Helvetica-Bold'), t);
  }
});

test('special characters are encoded, unknown ones dropped, rupees spelled out', () => {
  const r = JSON.parse(JSON.stringify(DEMO_FOLD));
  r.summary = 'Saved \u20b920k \u2014 \u201ctuned\u201d alerts (C:\\logs) \u{1F600} done';
  const s = latin(resumePdf(r));
  assert.ok(s.includes('(Saved) Tj'));
  assert.ok(s.includes('(Rs. 20k) Tj'));
  assert.ok(s.includes('(\\227) Tj'), 'em dash as WinAnsi 151');
  assert.ok(s.includes('(\\(C:\\\\logs\\)) Tj'), '( \\ ) escaped');
  assert.ok(!s.includes('\u{1F600}'));
});

test('a long resume flows onto a second page', () => {
  const r = JSON.parse(JSON.stringify(DEMO_FOLD));
  r.experience = Array.from({ length: 12 }, (_, i) => Object.assign({}, r.experience[0], { id: 'e' + i, bullets: Array(4).fill('Reviewed firewall and VPN logs daily and flagged unusual logins to the team lead, with notes.') }));
  const s = latin(resumePdf(r));
  assert.ok(s.includes('/Count 2'));
  checkXref(s);
});

test('a short resume is set larger to fill the page; a long one smaller to keep one page', () => {
  const size = (r) => Number(latin(resumePdf(r)).match(/\/F1 ([\d.]+) Tf[^\n]*\(Cyber\)/)?.[1] || 0);
  const short = JSON.parse(JSON.stringify(DEMO_FOLD));
  const long = JSON.parse(JSON.stringify(DEMO_FOLD));
  long.experience = Array.from({ length: 5 }, (_, i) => Object.assign({}, long.experience[0], { id: 'x' + i, bullets: Array(3).fill('Reviewed firewall and VPN logs daily and flagged unusual logins to the team lead.') }));
  const s = latin(resumePdf(long));
  assert.ok(s.includes('/Count 1'), 'still one page');
  assert.ok(size(short) > size(long), `${size(short)} > ${size(long)}`);
});
