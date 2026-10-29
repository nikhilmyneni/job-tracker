// google.js's request helper: slows down and retries when Gmail rate-limits, with fetch and storage faked.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map([['jh-session', JSON.stringify({ token: 't', tokenExp: Date.now() + 3600e3, gmail: true })]]);
globalThis.sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
let replies = [];
globalThis.fetch = async () => replies.shift()();
const res = (status, body, headers = {}) => () => ({ ok: status < 400, status, json: async () => body, headers: { get: (k) => headers[k] ?? null } });
const limited = res(403, { error: { message: "Quota exceeded for quota metric 'Total Query Cost'", errors: [{ reason: 'rateLimitExceeded' }] } }, { 'Retry-After': '0.01' });

const G = await import('../web/js/google.js');
G.resumeSession();

test('rate-limited twice, then it answers: the waits are reported and the result comes through', async () => {
  const waits = [];
  G.whenSlowedDown((s) => waits.push(s));
  replies = [limited, res(429, {}, { 'Retry-After': '0.01' }), res(200, { threads: [{ id: 'a' }, { id: 'b' }] })];
  assert.deepEqual(await G.searchThreads('q', 10), ['a', 'b']);
  assert.deepEqual(waits, [0.01, 0.01]);
});
test('still limited after every retry: a plain message, not a raw quota error', async () => {
  replies = Array(5).fill(limited);
  await assert.rejects(G.searchThreads('q', 10), /Gmail is limiting how fast emails can be read/);
});
test('other errors are not retried', async () => {
  replies = [res(404, { error: { message: 'Not found' } })];
  await assert.rejects(G.searchThreads('q', 10), /Google error 404: Not found/);
});
