// The built-in AI function (web/api/ai.js), with fetch faked: no network, no real keys.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GOOGLE_CLIENT_ID } from '../web/config.js';

process.env.AI_DAILY_LIMIT = '2';
const calls = [];
globalThis.fetch = async (url, opts = {}) => {
  calls.push(String(url));
  const json = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
  if (String(url).startsWith('https://oauth2.googleapis.com/tokeninfo')) {
    const tok = new URL(url).searchParams.get('access_token');
    if (tok === 'good') return json(200, { aud: GOOGLE_CLIENT_ID, sub: 'user-1', expires_in: '3000' });
    if (tok === 'other-app') return json(200, { aud: 'someone-else.apps.googleusercontent.com', sub: 'user-2', expires_in: '3000' });
    return json(400, { error: 'invalid_token' });
  }
  if (String(url).includes('api.groq.com')) return json(200, { choices: [{ message: { content: '[{"n":0,"ok":true}]' } }] });
  return json(500, {});
};
const { default: handler, providersFromEnv } = await import('../web/api/ai.js');
const call = (req) => new Promise(resolve => {
  const res = { code: 0, status(c) { this.code = c; return this; }, setHeader() {}, json(b) { resolve({ code: this.code, body: b }); } };
  handler(Object.assign({ method: 'POST', headers: {}, body: {} }, req), res);
});
const ok = { headers: { authorization: 'Bearer good' }, body: { task: 'classify', prompt: 'hi', json: true } };

test('not set up: 503 until the owner adds a key', async () => {
  delete process.env.GROQ_API_KEY; delete process.env.GEMINI_API_KEY;
  assert.equal((await call(ok)).code, 503);
  process.env.GROQ_API_KEY = 'test-groq-key';
  assert.deepEqual(providersFromEnv().map(p => p.provider), ['groq']);
});
test('only signed-in Job Hunter users', async () => {
  assert.equal((await call({ body: ok.body })).code, 401);
  assert.equal((await call({ headers: { authorization: 'Bearer bad' }, body: ok.body })).code, 401);
  assert.equal((await call({ headers: { authorization: 'Bearer other-app' }, body: ok.body })).code, 401);
});
test('only known tasks and sane prompts', async () => {
  assert.equal((await call({ headers: ok.headers, body: { task: 'chat', prompt: 'hi' } })).code, 400);
  assert.equal((await call({ headers: ok.headers, body: { task: 'classify', prompt: 'x'.repeat(40001) } })).code, 400);
  assert.equal((await call({ method: 'GET' })).code, 405);
});
test('answers, then stops at the daily allowance', async () => {
  const a = await call(ok);
  assert.equal(a.code, 200); assert.deepEqual(a.body.result, [{ n: 0, ok: true }]);
  assert.equal((await call(ok)).code, 200);
  assert.equal((await call(ok)).code, 429);
  assert.equal(calls.filter(u => u.includes('tokeninfo') && u.includes('good')).length, 1); // the token check is cached
});
