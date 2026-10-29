/**
 * Vercel function (free plan): searches Adzuna's India job listings, so the Adzuna key stays on the server
 * (ADZUNA_APP_ID, ADZUNA_APP_KEY; optional ADZUNA_DAILY_LIMIT). Only signed-in Job Hunter users. It only ever
 * sends Adzuna a role and a place to search for; nothing about the user. Results must be credited to Adzuna.
 *   GET /api/adzuna?what=<role>&where=<city>  →  { results: [{ id, title, company, location, description, link, posted, salary, contract }] }
 */
import { userFrom, allowance } from './_auth.js';

const allow = allowance(Number(process.env.ADZUNA_DAILY_LIMIT) || 30);
const cache = new Map(); // "what|where" → { at, results }, shared by everyone on this instance for 30 minutes
const FRESH_MS = 30 * 60e3;

export function trimResult(x) {
  const n = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);
  const lo = n(x.salary_min), hi = n(x.salary_max);
  const lpa = (v) => (v / 1e5).toFixed(v % 1e5 ? 1 : 0);
  return {
    id: String(x.id || ''), title: String(x.title || '').replace(/<[^>]+>/g, '').slice(0, 200),
    company: String((x.company && x.company.display_name) || '').slice(0, 120),
    location: String((x.location && x.location.display_name) || '').slice(0, 120),
    description: String(x.description || '').replace(/<[^>]+>/g, '').slice(0, 1500),
    link: /^https:\/\//.test(String(x.redirect_url || '')) ? String(x.redirect_url) : '',
    posted: /^\d{4}-\d{2}-\d{2}/.test(String(x.created || '')) ? String(x.created).slice(0, 10) : '',
    salary: lo && hi ? `₹${lpa(lo)}–${lpa(hi)} LPA` : lo ? `₹${lpa(lo)} LPA+` : '',
    contract: [x.contract_time, x.contract_type].filter(Boolean).join(', ').replace(/_/g, ' '),
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.status(405).json({ error: 'GET only' }); return; }
  const id = process.env.ADZUNA_APP_ID, key = process.env.ADZUNA_APP_KEY;
  if (!id || !key) { res.status(503).json({ error: 'Adzuna isn’t set up on this site yet.' }); return; }
  const sub = await userFrom(req);
  if (!sub) { res.status(401).json({ error: 'Sign in again to search Adzuna.' }); return; }
  const q = req.query || {};
  const what = String(q.what || '').trim(), where = String(q.where || '').trim();
  if (!what || what.length > 60 || where.length > 40 || /[^\p{L}\p{N} .,&+#/()-]/u.test(what + where)) { res.status(400).json({ error: 'bad request' }); return; }
  const k = (what + '|' + where).toLowerCase();
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < FRESH_MS) { res.status(200).json({ results: hit.results }); return; }
  if (!allow(sub)) { res.status(429).json({ error: 'Today’s Adzuna searches are used up. They reset at midnight (UTC).' }); return; }
  const url = new URL('https://api.adzuna.com/v1/api/jobs/in/search/1');
  Object.entries({ app_id: id, app_key: key, what, results_per_page: '20', max_days_old: '21', sort_by: 'date', 'content-type': 'application/json' })
    .forEach(([a, b]) => url.searchParams.set(a, b));
  if (where && !/^(anywhere in india|india|remote)$/i.test(where)) url.searchParams.set('where', where);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) { res.status(r.status === 429 ? 429 : 502).json({ error: r.status === 429 ? 'Adzuna is busy. Try again later.' : `Adzuna error ${r.status}` }); return; }
    const results = ((await r.json()).results || []).map(trimResult).filter(x => x.title && x.link);
    if (cache.size > 500) cache.clear();
    cache.set(k, { at: Date.now(), results });
    res.status(200).json({ results });
  } catch (e) {
    res.status(504).json({ error: 'Adzuna didn’t answer.' });
  } finally { clearTimeout(timer); }
}
