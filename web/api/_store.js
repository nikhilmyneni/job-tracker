/**
 * The small store used only by the opt-in email alerts. Either of Vercel's free Redis options works, no packages:
 * - Redis (Storage tab → Redis): REDIS_URL, a redis:// or rediss:// address, spoken to over a plain connection.
 * - Upstash (Storage tab → Upstash): KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_*), over its REST API.
 */
import net from 'node:net';
import tls from 'node:tls';

const restBase = () => (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const restToken = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const redisUrl = () => process.env.REDIS_URL || process.env.KV_URL || '';

export const storeReady = () => !!((restBase() && restToken()) || redisUrl());

/** Several commands in one go, e.g. [['GET', 'k'], ['SET', 'k', 'v']] → their results in order. */
export async function pipeline(cmds) {
  if (!cmds.length) return [];
  if (restBase() && restToken()) return restPipeline(cmds);
  return respPipeline(redisUrl(), cmds);
}

export const cmd = async (...args) => (await pipeline([args]))[0];

/** A stored JSON value, or fallback when it's missing or unreadable. */
export function parse(v, fallback = null) {
  if (v == null) return fallback;
  try { return JSON.parse(v); } catch (e) { return fallback; }
}

async function restPipeline(cmds) {
  const r = await fetch(restBase() + '/pipeline', {
    method: 'POST', headers: { Authorization: 'Bearer ' + restToken(), 'Content-Type': 'application/json' }, body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error('store error ' + r.status);
  const out = await r.json();
  return out.map(x => { if (x && x.error) throw new Error('store error: ' + x.error); return x ? x.result : null; });
}

// ---------- Redis's own protocol (RESP), just what the alerts need ----------
const encode = (args) => {
  const parts = args.map(a => Buffer.from(String(a), 'utf8'));
  return Buffer.concat([Buffer.from(`*${parts.length}\r\n`), ...parts.flatMap(p => [Buffer.from(`$${p.length}\r\n`), p, Buffer.from('\r\n')])]);
};

/** Reads one reply from buf at i. Returns [value, nextIndex], or null when more bytes are needed. */
export function readReply(buf, i = 0) {
  const eol = buf.indexOf('\r\n', i);
  if (eol < 0) return null;
  const type = String.fromCharCode(buf[i]), line = buf.toString('utf8', i + 1, eol), next = eol + 2;
  if (type === '+') return [line, next];
  if (type === '-') return [new Error(line), next];
  if (type === ':') return [Number(line), next];
  if (type === '$') {
    const n = Number(line);
    if (n < 0) return [null, next];
    if (buf.length < next + n + 2) return null;
    return [buf.toString('utf8', next, next + n), next + n + 2];
  }
  if (type === '*') {
    const n = Number(line);
    if (n < 0) return [null, next];
    const out = [];
    let at = next;
    for (let k = 0; k < n; k++) {
      const r = readReply(buf, at);
      if (!r) return null;
      out.push(r[0]); at = r[1];
    }
    return [out, at];
  }
  throw new Error('store error: unexpected reply');
}

/** Opens a connection, signs in (from the URL), runs the commands, closes. One connection per call: alerts are rare. */
export function respPipeline(url, cmds, timeoutMs = 10000) {
  const u = new URL(url);
  const auth = u.password ? [['AUTH', ...(u.username && u.username !== 'default' ? [decodeURIComponent(u.username)] : []), decodeURIComponent(u.password)]] : [];
  const db = u.pathname && u.pathname.length > 1 ? [['SELECT', u.pathname.slice(1)]] : [];
  const all = [...auth, ...db, ...cmds];
  const skip = auth.length + db.length;
  return new Promise((resolve, reject) => {
    const opts = { host: u.hostname, port: Number(u.port) || 6379 };
    const sock = u.protocol === 'rediss:' ? tls.connect(Object.assign({ servername: u.hostname }, opts)) : net.connect(opts);
    let buf = Buffer.alloc(0);
    const replies = [];
    const done = (err, val) => { clearTimeout(timer); sock.destroy(); if (err) reject(err); else resolve(val); };
    const timer = setTimeout(() => done(new Error('store error: timed out')), timeoutMs);
    sock.on(u.protocol === 'rediss:' ? 'secureConnect' : 'connect', () => sock.write(Buffer.concat(all.map(encode))));
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      try {
        let r;
        while (replies.length < all.length && (r = readReply(buf))) { replies.push(r[0]); buf = buf.subarray(r[1]); }
      } catch (e) { done(e); return; }
      if (replies.length === all.length) {
        const bad = replies.find(x => x instanceof Error);
        done(bad ? new Error('store error: ' + bad.message) : null, replies.slice(skip));
      }
    });
    sock.on('error', (e) => done(new Error('store error: ' + e.message)));
  });
}
