// PDF text items → lines (the pure part of web/js/files.js).
import test from 'node:test';
import assert from 'node:assert/strict';
const { pdfItemsToText } = await import('../web/js/files.js');
const it = (s, x, y, w, h = 10) => ({ str: s, transform: [h, 0, 0, h, x, y], width: w });

test('same baseline joins with spaces at gaps; big jumps make paragraphs', () => {
  const t = pdfItemsToText([it('NIKHIL', 100, 800, 50, 18), it('MYNENI', 155, 800, 52, 18), it('nikhil@mail.in', 100, 770, 90), it('|', 195, 770, 4), it('Hyderabad', 205, 770, 50),
    it('EDUCATION', 100, 720, 60, 12), it('B.Tech', 100, 705, 30), it('CSE', 133, 705, 20)]);
  assert.equal(t, 'NIKHIL MYNENI\nnikhil@mail.in | Hyderabad\n\nEDUCATION\nB.Tech CSE');
});
test('letters drawn one by one: wider gaps are the word breaks', () => {
  const letters = 'NIKHIL'.split('').map((c, i) => it(c, 100 + i * 12, 800, 8, 16)).concat('MYNENI'.split('').map((c, i) => it(c, 190 + i * 12, 800, 8, 16)));
  assert.equal(pdfItemsToText(letters), 'NIKHIL MYNENI');
});
