// The alerts store over Redis's own protocol (REDIS_URL), against a tiny fake Redis server on localhost.
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { readReply, respPipeline } from '../web/api/_store.js';

const kv = new Map(), sets = new Map();
const bulk = (v) => (v == null ? '$-1\r\n' : `$${Buffer.byteLength(String(v))}\r\n${v}\r\n`);
function reply(args, state) {
  const [c, ...a] = args;
  const C = String(c).toUpperCase();
  if (C === 'AUTH') { state.authed = a[a.length - 1] === 's3cret'; return state.authed ? '+OK\r\n' : '-WRONGPASS invalid password\r\n'; }
  if (!state.authed) return '-NOAUTH Authentication required.\r\n';
  if (C === 'GET') return bulk(kv.get(a[0]));
  if (C === 'SET') { kv.set(a[0], a[1]); return '+OK\r\n'; }
  if (C === 'DEL') { a.forEach(k => { kv.delete(k); sets.delete(k); }); return `:${a.length}\r\n`; }
  if (C === 'SADD') { const s = sets.get(a[0]) || new Set(); a.slice(1).forEach(x => s.add(x)); sets.set(a[0], s); return ':1\r\n'; }
  if (C === 'SMEMBERS') { const m = [...(sets.get(a[0]) || [])]; return `*${m.length}\r\n` + m.map(bulk).join(''); }
  return '-ERR unknown command\r\n';
}
const server = net.createServer(sock => {
  const state = { authed: false };
  let buf = Buffer.alloc(0);
  sock.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    let r, out = '';
    while ((r = readReply(buf))) { out += reply(r[0], state); buf = buf.subarray(r[1]); }
    // Send the answer in two pieces, to check replies split across packets are put back together.
    const b = Buffer.from(out), half = Math.floor(b.length / 2);
    sock.write(b.subarray(0, half)); setTimeout(() => sock.write(b.subarray(half)), 5);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
test.after(() => server.close());

test('commands run in one go after signing in with the password from the URL', async () => {
  const url = `redis://default:s3cret@127.0.0.1:${port}`;
  const out = await respPipeline(url, [['SET', 'k', JSON.stringify({ a: 'ünïcode ✓' })], ['GET', 'k'], ['GET', 'missing'], ['SADD', 's', 'u1', 'u2'], ['SMEMBERS', 's']]);
  assert.equal(out[0], 'OK');
  assert.deepEqual(JSON.parse(out[1]), { a: 'ünïcode ✓' });
  assert.equal(out[2], null);
  assert.deepEqual(out[4].sort(), ['u1', 'u2']);
});

test('a wrong password is an error, not a silent empty answer', async () => {
  await assert.rejects(respPipeline(`redis://default:nope@127.0.0.1:${port}`, [['GET', 'k']]), /WRONGPASS/);
});

test('replies are parsed whole or not at all', () => {
  assert.equal(readReply(Buffer.from('$5\r\nhel')), null);
  assert.deepEqual(readReply(Buffer.from('*2\r\n$1\r\na\r\n:7\r\n')), [['a', 7], 15]);
});
