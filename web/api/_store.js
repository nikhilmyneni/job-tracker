/**
 * Upstash Redis over its REST API (free tier), used only by the opt-in email alerts. Set up from Vercel's Storage tab,
 * which adds KV_REST_API_URL and KV_REST_API_TOKEN (UPSTASH_REDIS_REST_URL / _TOKEN work too). Plain fetch, no packages.
 */
const base = () => (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const token = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

export const storeReady = () => !!(base() && token());

/** Several commands in one request, e.g. [['GET', 'k'], ['SET', 'k', 'v']] → their results in order. */
export async function pipeline(cmds) {
  if (!cmds.length) return [];
  const r = await fetch(base() + '/pipeline', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' }, body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error('store error ' + r.status);
  const out = await r.json();
  return out.map(x => { if (x && x.error) throw new Error('store error: ' + x.error); return x ? x.result : null; });
}

export const cmd = async (...args) => (await pipeline([args]))[0];

/** A stored JSON value, or fallback when it's missing or unreadable. */
export function parse(v, fallback = null) {
  if (v == null) return fallback;
  try { return JSON.parse(v); } catch (e) { return fallback; }
}
