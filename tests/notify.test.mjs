// The notification texts after a sync (pure part of web/js/notify.js).
import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = globalThis.window || {};
const { notificationsFor } = await import('../web/js/notify.js');

test('one change, many changes, new jobs; first-sync rows are not news', () => {
  const one = notificationsFor({ changes: [{ company: 'Kestrel', role: 'SOC Analyst', from: 'Applied', to: 'Screening' }, { company: 'New Co', from: '', to: 'Applied' }] }, []);
  assert.deepEqual(one, [{ title: 'Kestrel: Assessment', body: 'SOC Analyst moved from Applied to Assessment.', url: '/app', tag: 'status' }]);
  const many = notificationsFor({ changes: [{ company: 'A', from: 'Applied', to: 'Interview' }, { company: 'B', from: 'Interview', to: 'Offer' }] }, []);
  assert.equal(many[0].title, '2 applications changed');
  const jobs = notificationsFor({ changes: [] }, [{ role: 'SOC Analyst', company: 'K', fit: 4 }, { role: 'Intern', company: 'N', fit: 5 }]);
  assert.deepEqual(jobs, [{ title: '2 new job matches', body: 'Best: Intern at N (100%)', url: '/app/matches', tag: 'jobs' }]);
});
