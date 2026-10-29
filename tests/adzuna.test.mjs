// The Adzuna function (web/api/adzuna.js), with fetch faked: no network, no real keys.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GOOGLE_CLIENT_ID } from '../web/config.js';

const calls = [];
globalThis.fetch = async (url) => {
  const u = String(url); calls.push(u);
  const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
  if (u.startsWith('https://oauth2.googleapis.com/tokeninfo')) return new URL(u).searchParams.get('access_token') === 'good'
    ? json(200, { aud: GOOGLE_CLIENT_ID, sub: 'u1', expires_in: '3000' }) : json(400, {});
  if (u.startsWith('https://api.adzuna.com/')) return json(200, { results: [
    { id: 11, title: 'SOC <strong>Analyst</strong>', company: { display_name: 'Kestrel' }, location: { display_name: 'Hyderabad, Telangana' }, description: 'Monitor SIEM', redirect_url: 'https://www.adzuna.in/land/ad/11', created: '2026-10-25T08:00:00Z', salary_min: 400000, salary_max: 550000, contract_time: 'full_time' },
    { id: 12, title: 'Bad link', redirect_url: 'javascript:alert(1)' }] });
  return json(500, {});
};
const { default: handler, trimResult } = await import('../web/api/adzuna.js');
const call = (query, auth = 'good') => new Promise(resolve => {
  const res = { code: 0, status(c) { this.code = c; return this; }, setHeader() {}, json(b) { resolve({ code: this.code, body: b }); } };
  handler({ method: 'GET', headers: auth ? { authorization: 'Bearer ' + auth } : {}, query }, res);
});

test('not set up until the owner adds the keys', async () => {
  delete process.env.ADZUNA_APP_ID; delete process.env.ADZUNA_APP_KEY;
  assert.equal((await call({ what: 'SOC Analyst' })).code, 503);
  process.env.ADZUNA_APP_ID = 'id'; process.env.ADZUNA_APP_KEY = 'key';
});
test('signed-in users only, sane searches only', async () => {
  assert.equal((await call({ what: 'SOC Analyst' }, '')).code, 401);
  assert.equal((await call({ what: 'SOC Analyst' }, 'bad')).code, 401);
  assert.equal((await call({ what: '' })).code, 400);
  assert.equal((await call({ what: 'x'.repeat(61) })).code, 400);
  assert.equal((await call({ what: 'a<script>' })).code, 400);
});
test('results are trimmed, unsafe links dropped, repeat searches cached, "Remote" not sent as a place', async () => {
  const r = await call({ what: 'SOC Analyst', where: 'Remote' });
  assert.equal(r.code, 200);
  assert.deepEqual(r.body.results, [{ id: '11', title: 'SOC Analyst', company: 'Kestrel', location: 'Hyderabad, Telangana', description: 'Monitor SIEM',
    link: 'https://www.adzuna.in/land/ad/11', posted: '2026-10-25', salary: '₹4–5.5 LPA', contract: 'full time' }]);
  const sent = calls.filter(u => u.startsWith('https://api.adzuna.com/'));
  assert.equal(new URL(sent[0]).searchParams.get('where'), null);
  await call({ what: 'soc analyst', where: 'remote' });
  assert.equal(calls.filter(u => u.startsWith('https://api.adzuna.com/')).length, 1); // served from the cache
});
test('trimResult without salary', () => {
  assert.equal(trimResult({ id: 1, title: 'X', redirect_url: 'https://a.example' }).salary, '');
});
