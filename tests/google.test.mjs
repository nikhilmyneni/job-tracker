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
  replies = [limited, res(429, {}, { 'Retry-After': '0.01' }), res(200, { messages: [{ id: 'a', threadId: 't' }, { id: 'b', threadId: 't' }] })];
  assert.deepEqual((await G.searchMessages('q', 10)).map(m => m.id), ['a', 'b']);
  assert.deepEqual(waits, [0.01, 0.01]);
});
test('still limited after every retry: a plain message, not a raw quota error', async () => {
  replies = Array(5).fill(limited);
  await assert.rejects(G.searchMessages('q', 10), /Gmail is limiting how fast emails can be read/);
});
test('other errors are not retried', async () => {
  replies = [res(404, { error: { message: 'Not found' } })];
  await assert.rejects(G.searchMessages('q', 10), /Google error 404: Not found/);
});

test('search follows every page of results, up to the limit', async () => {
  replies = [res(200, { messages: [{ id: 'a', threadId: 't1' }], nextPageToken: 'p2' }), res(200, { messages: [{ id: 'b', threadId: 't2' }], nextPageToken: 'p3' }), res(200, { messages: [{ id: 'c', threadId: 't3' }] })];
  assert.deepEqual((await G.searchMessages('q', 10)).map(m => m.id), ['a', 'b', 'c']);
  replies = [res(200, { messages: [{ id: 'a', threadId: 't1' }, { id: 'b', threadId: 't1' }], nextPageToken: 'p2' })];
  assert.equal((await G.searchMessages('q', 2)).length, 2);
});
