// The opt-in email alerts (web/api/alerts.js, alerts-run.js, _alerts.js, _mail.js), with fetch faked:
// an in-memory store stands in for Upstash, and Brevo and the job board are fakes. Made-up data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GOOGLE_CLIENT_ID } from '../web/config.js';
import * as C from '../web/js/core.js';

Object.assign(process.env, {
  KV_REST_API_URL: 'https://store.test', KV_REST_API_TOKEN: 'store-token', BREVO_API_KEY: 'brevo-key',
  ALERTS_FROM: 'alerts@example.com', CRON_SECRET: 'cron-secret', ALERTS_SECRET: 'unsub-secret',
});

const kv = new Map(), sets = new Map(), mails = [], boardCalls = [];
const json = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
function redis([c, ...a]) {
  switch (c) {
    case 'GET': return kv.has(a[0]) ? kv.get(a[0]) : null;
    case 'SET': kv.set(a[0], a[1]); return 'OK';
    case 'DEL': a.forEach(k => kv.delete(k)); return a.length;
    case 'SADD': { const s = sets.get(a[0]) || new Set(); a.slice(1).forEach(x => s.add(x)); sets.set(a[0], s); return 1; }
    case 'SREM': { const s = sets.get(a[0]); if (s) a.slice(1).forEach(x => s.delete(x)); return 1; }
    case 'SMEMBERS': return [...(sets.get(a[0]) || [])];
  }
  return null;
}
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith('https://oauth2.googleapis.com/tokeninfo')) {
    const tok = new URL(u).searchParams.get('access_token');
    if (tok === 'good') return json(200, { aud: GOOGLE_CLIENT_ID, sub: 'user1', email: 'test.person@example.com', email_verified: 'true', expires_in: '3000' });
    if (tok === 'other-app') return json(200, { aud: 'someone-else', sub: 'user2', expires_in: '3000' });
    return json(400, {});
  }
  if (u === 'https://store.test/pipeline') return json(200, JSON.parse(opts.body).map(cmd => ({ result: redis(cmd) })));
  if (u === 'https://api.brevo.com/v3/smtp/email') { mails.push(JSON.parse(opts.body)); return json(201, { messageId: 'x' }); }
  if (/^https:\/\/boards-api\.greenhouse\.io\/v1\/boards\/[^/]+\/jobs\/\d+$/.test(u)) { // one posting's full description
    return json(200, { content: '&lt;p&gt;Monitor SIEM alerts in Splunk. 0-1 years of experience. Stipend paid.&lt;/p&gt;' });
  }
  if (u.startsWith('https://boards-api.greenhouse.io/v1/boards/')) {
    boardCalls.push(u);
    return json(200, { jobs: [
      { id: 1, title: 'SOC Analyst', location: { name: 'Hyderabad' }, absolute_url: 'https://boards.greenhouse.io/kestrel/jobs/1' },
      { id: 2, title: 'Sales Executive', location: { name: 'Hyderabad' }, absolute_url: 'https://boards.greenhouse.io/kestrel/jobs/2' },
    ] });
  }
  return json(404, {});
};

const { default: alerts } = await import('../web/api/alerts.js');
const { default: run } = await import('../web/api/alerts-run.js');
const A = await import('../web/api/_alerts.js');
const { jobsEmail } = await import('../web/api/_mail.js');
const call = (handler, req) => new Promise(resolve => {
  const res = { code: 0, headers: {}, status(c) { this.code = c; return this; }, setHeader(k, v) { this.headers[k] = v; },
    json(b) { resolve({ code: this.code, body: b }); }, end(s) { resolve({ code: this.code, html: s }); } };
  handler(Object.assign({ method: 'GET', headers: {}, query: {}, body: {} }, req), res);
});
const auth = { authorization: 'Bearer good' };

function settingsFor(company) {
  const s = C.normalizeSettings({ onboarded: true, prefs: { roles: ['SOC Analyst'], locations: ['Hyderabad'], avoid: ['Sales'] }, minMatch: 0, jobsPerUpdate: 5,
    schedule: { on: true, days: [0, 1, 2, 3, 4, 5, 6], gmailAt: '07:00', jobsAt: '09:00' }, companies: [{ ats: 'greenhouse', slug: company, name: 'Kestrel' }], autoCompanies: false });
  return { settings: s, cv: 'Secret CV text: Splunk, SIEM, Python', skillsAdded: [], skillsRemoved: [], jobs: [] };
}

test('only signed-in Job Hunter users can change their alerts', async () => {
  assert.equal((await call(alerts, {})).code, 401);
  assert.equal((await call(alerts, { headers: { authorization: 'Bearer other-app' } })).code, 401);
});

test('turning on keeps only what matching needs, with the email from Google, never the CV', async () => {
  const data = settingsFor('kestrel');
  const profile = C.alertProfile(data, 'Asia/Kolkata');
  profile.email = 'attacker@example.com'; profile.cv = data.cv; // ignored
  const r = await call(alerts, { method: 'PUT', headers: auth, body: { profile } });
  assert.equal(r.code, 200);
  const stored = JSON.parse(kv.get(A.K.profile('user1')));
  assert.equal(stored.email, 'test.person@example.com');
  assert.equal(stored.cv, undefined);
  assert.ok(!JSON.stringify(stored).includes('Secret CV text'));
  assert.deepEqual(stored.skills.sort(), ['Python', 'SIEM', 'Splunk']);
  assert.ok(sets.get(A.K.subs).has('user1'));
});

test('the hourly run needs the secret', async () => {
  assert.equal((await call(run, { method: 'POST' })).code, 401);
  assert.equal((await call(run, { method: 'POST', headers: { authorization: 'Bearer wrong-secret' } })).code, 401);
});

test('before your time: nothing. After it: matching jobs kept for the app and one email; once a day', async () => {
  const early = await A.runAlerts({ now: new Date('2026-10-30T02:00:00Z'), origin: 'https://jobs4you.vercel.app' }); // 07:30 IST
  assert.equal(early.due, 0); assert.equal(mails.length, 0);
  const r = await A.runAlerts({ now: new Date('2026-10-30T04:00:00Z'), origin: 'https://jobs4you.vercel.app' }); // 09:30 IST
  assert.equal(r.due, 1); assert.equal(r.emailed, 1);
  const found = JSON.parse(kv.get(A.K.found('user1')));
  assert.deepEqual(found.map(j => j.role), ['SOC Analyst']); // Sales is on the skip list
  assert.equal(mails[0].to[0].email, 'test.person@example.com');
  assert.match(mails[0].subject, /^New match: SOC Analyst at Kestrel$/);
  assert.match(mails[0].htmlContent, /SOC Analyst/);
  const again = await A.runAlerts({ now: new Date('2026-10-30T05:00:00Z'), origin: 'https://jobs4you.vercel.app' });
  assert.equal(again.due, 0); assert.equal(mails.length, 1);
});

test('next day: nothing new means no email; a board shared by two people is read once', async () => {
  sets.get(A.K.subs).add('user3');
  kv.set(A.K.profile('user3'), JSON.stringify(Object.assign(A.cleanProfile(C.alertProfile(settingsFor('kestrel'), 'Asia/Kolkata'), 'other@example.com'))));
  boardCalls.length = 0;
  const r = await A.runAlerts({ now: new Date('2026-10-31T04:00:00Z'), origin: 'https://jobs4you.vercel.app' });
  assert.equal(r.due, 2);
  assert.equal(boardCalls.length, 1);
  assert.equal(mails.length, 2); // user3's first email; user1 has seen these jobs already
  assert.equal(mails[1].to[0].email, 'other@example.com');
});

test('the app picks up waiting jobs, acknowledges them, and they are not added twice', async () => {
  const g = await call(alerts, { headers: auth });
  assert.equal(g.body.on, true); assert.equal(g.body.jobs.length, 1);
  const data = settingsFor('kestrel');
  assert.equal(C.mergeAlertJobs(data, g.body.jobs), 1);
  assert.equal(C.mergeAlertJobs(data, g.body.jobs), 0);
  await call(alerts, { method: 'POST', headers: auth, body: { ack: g.body.jobs.map(j => j.id) } });
  assert.equal((await call(alerts, { headers: auth })).body.jobs.length, 0);
});

test('unsubscribe: a link shows a button; only the button (POST) with a valid signature stops the emails', async () => {
  const token = A.unsubToken('user3');
  assert.equal((await call(alerts, { method: 'POST', query: { unsub: 'user3.0000' } })).code, 403);
  const page = await call(alerts, { method: 'GET', query: { unsub: token } });
  assert.match(page.html, /<form method="post"/);
  assert.ok(sets.get(A.K.subs).has('user3')); // a mail scanner opening the link changes nothing
  await call(alerts, { method: 'POST', query: { unsub: token } });
  assert.ok(!sets.get(A.K.subs).has('user3'));
  assert.equal(kv.has(A.K.profile('user3')), false);
});

test('turning off deletes everything kept', async () => {
  await call(alerts, { method: 'DELETE', headers: auth });
  ['profile', 'seen', 'found', 'sent'].forEach(k => assert.equal(kv.has(A.K[k]('user1')), false, k));
  assert.equal((await call(alerts, { headers: auth })).body.on, false);
});

test('the email escapes job text and keeps only http(s) links', () => {
  const m = jobsEmail([{ role: '<script>x</script>', company: 'A & B', link: 'javascript:alert(1)', score: 80 }], { appUrl: 'https://jobs4you.vercel.app/app/matches', unsubUrl: 'https://jobs4you.vercel.app/api/alerts?unsub=x' });
  assert.ok(!m.html.includes('<script>'));
  assert.match(m.html, /&lt;script&gt;/);
  assert.match(m.html, /A &amp; B/);
  assert.ok(!m.html.includes('javascript:'));
});

test('alertDue follows the profile’s time zone and days', () => {
  const p = A.cleanProfile(C.alertProfile(settingsFor('kestrel'), 'Asia/Kolkata'), 'x@example.com');
  p.settings.schedule.days = [1, 2, 3, 4, 5]; // weekdays
  assert.equal(C.alertDue(p, '', new Date('2026-10-30T04:00:00Z')).due, true); // Fri 09:30 IST
  assert.equal(C.alertDue(p, '', new Date('2026-10-31T04:00:00Z')).due, false); // Sat
  assert.equal(C.alertDue(Object.assign({}, p, { tz: 'America/New_York' }), '', new Date('2026-10-30T04:00:00Z')).due, false); // 00:00 there
  assert.equal(A.cleanProfile({ tz: 'Not/AZone' }, 'x@example.com').tz, 'Asia/Kolkata');
});

test('force runs again today and the result says why nothing was emailed', async () => {
  await call(alerts, { method: 'PUT', headers: auth, body: { profile: C.alertProfile(settingsFor('kestrel'), 'Asia/Kolkata') } });
  const now = new Date('2026-11-02T04:00:00Z');
  const first = await A.runAlerts({ now, origin: 'https://jobs4you.vercel.app' });
  assert.equal(first.due, 1);
  assert.equal(first.found, 1); // turning alerts off earlier deleted what was sent, so it's new again
  assert.equal(first.boards, 1); assert.ok(first.listings >= 2); assert.equal(first.mailError, '');
  assert.equal((await A.runAlerts({ now, origin: 'https://jobs4you.vercel.app' })).due, 0); // once a day
  const forced = await A.runAlerts({ now, origin: 'https://jobs4you.vercel.app', force: true }); // unless forced
  assert.equal(forced.due, 1);
  assert.equal(forced.candidates, 0); assert.equal(forced.found, 0); assert.equal(forced.emailed, 0); // never sent twice
});

test('force runs even before your time or on a day you didn’t pick', async () => {
  await call(alerts, { method: 'PUT', headers: auth, body: { profile: C.alertProfile(settingsFor('kestrel'), 'Asia/Kolkata') } });
  const early = new Date('2026-11-03T01:00:00Z'); // 06:30 IST, before 09:00
  assert.equal((await A.runAlerts({ now: early, origin: 'https://jobs4you.vercel.app' })).due, 0);
  assert.equal((await A.runAlerts({ now: early, origin: 'https://jobs4you.vercel.app', force: true })).due, 1);
});
