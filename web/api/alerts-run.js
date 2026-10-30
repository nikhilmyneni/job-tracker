/**
 * Vercel function: the hourly email-alerts search, called by the GitHub Actions workflow
 * (.github/workflows/job-alerts.yml) with "Authorization: Bearer <CRON_SECRET>". See _alerts.js.
 *   POST /api/alerts-run  → { users, due, done, emailed }
 */
import { timingSafeEqual } from 'node:crypto';
import { storeReady } from './_store.js';
import { runAlerts } from './_alerts.js';

function authorized(req) {
  const want = Buffer.from('Bearer ' + (process.env.CRON_SECRET || ''));
  const got = Buffer.from(String((req.headers && req.headers.authorization) || ''));
  return !!process.env.CRON_SECRET && want.length === got.length && timingSafeEqual(want, got);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST' && req.method !== 'GET') { res.status(405).json({ error: 'method not allowed' }); return; }
  if (!authorized(req)) { res.status(401).json({ error: 'not allowed' }); return; }
  if (!storeReady()) { res.status(503).json({ error: 'storage not set up' }); return; }
  const host = String((req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '');
  const origin = /^[a-z0-9.-]+(:\d+)?$/i.test(host) ? `${/^localhost(:|$)/.test(host) ? 'http' : 'https'}://${host}` : '';
  try {
    res.status(200).json(await runAlerts({ origin }));
  } catch (e) {
    res.status(502).json({ error: 'run failed: ' + String(e && e.message).slice(0, 200) });
  }
}
