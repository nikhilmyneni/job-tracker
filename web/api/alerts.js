/**
 * Vercel function: your email-alerts switch (opt-in). Signed-in Job Hunter users only (Google token).
 *   GET     → { on, email, lastRun, jobs }   jobs found while the app was closed, for the app to add
 *   PUT     { profile }  → turn on, or update what matching uses (see _alerts.js: no CV, nothing from Gmail)
 *   POST    { ack: [ids] } → those jobs are in the app now
 *   DELETE  → turn off and delete everything kept for you
 *   GET ?unsub=<token>  → the "Stop these emails" link: a page with a button (mail scanners open links on their own)
 *   POST ?unsub=<token> → that button, or a mail app's one-click unsubscribe: turns alerts off (the token is signed)
 */
import { storeReady, pipeline, parse } from './_store.js';
import { mailReady } from './_mail.js';
import { userInfo } from './_auth.js';
import { K, cleanProfile, dropAll, unsubSub } from './_alerts.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const page = (res, code, title, text, extra = '') => {
  res.status(code);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
    `<body style="font-family:Arial,sans-serif;max-width:480px;margin:48px auto;padding:0 16px;color:#222"><h1 style="font-size:22px">${title}</h1><p>${text}</p>${extra}` +
    `<p><a href="/app/settings">Open Job Hunter</a></p></body>`);
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || {};
  if (q.unsub) {
    const sub = unsubSub(q.unsub);
    if (!sub || !storeReady()) { page(res, 403, 'Link not valid', 'This link didn’t work. You can turn email alerts off in Job Hunter’s Settings.'); return; }
    if (req.method === 'GET') {
      page(res, 200, 'Stop job emails?', 'Job Hunter will stop emailing you new jobs and delete what it kept to find them.',
        `<form method="post" action="/api/alerts?unsub=${esc(encodeURIComponent(q.unsub))}"><button type="submit" style="font-size:16px;padding:10px 16px;border-radius:8px;border:0;background:#2f5bd3;color:#fff">Stop the emails</button></form>`);
      return;
    }
    await dropAll(sub);
    page(res, 200, 'Emails stopped', 'You won’t get job emails from Job Hunter any more, and what was kept for them has been deleted.');
    return;
  }
  if (!storeReady()) { res.status(503).json({ error: 'Email alerts aren’t set up on this site yet.' }); return; }
  const me = await userInfo(req);
  if (!me) { res.status(401).json({ error: 'Sign in again.' }); return; }
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  try {
    if (req.method === 'GET') {
      const [p, found, sent] = await pipeline([['GET', K.profile(me.sub)], ['GET', K.found(me.sub)], ['GET', K.sent(me.sub)]]);
      const profile = parse(p);
      res.status(200).json({ on: !!profile, email: (profile && profile.email) || me.email, lastRun: sent || '', jobs: parse(found, []) });
    } else if (req.method === 'PUT') {
      if (!mailReady()) { res.status(503).json({ error: 'Email alerts aren’t set up on this site yet.' }); return; }
      if (!me.email) { res.status(400).json({ error: 'Your Google account didn’t share an email address.' }); return; }
      const profile = cleanProfile(b.profile, me.email);
      await pipeline([['SADD', K.subs, me.sub], ['SET', K.profile(me.sub), JSON.stringify(profile)]]);
      res.status(200).json({ on: true, email: profile.email });
    } else if (req.method === 'POST') {
      const ack = new Set((Array.isArray(b.ack) ? b.ack : []).map(String));
      const [found] = await pipeline([['GET', K.found(me.sub)]]);
      await pipeline([['SET', K.found(me.sub), JSON.stringify(parse(found, []).filter(j => !ack.has(String(j.id))))]]);
      res.status(200).json({ ok: true });
    } else if (req.method === 'DELETE') {
      await dropAll(me.sub);
      res.status(200).json({ on: false });
    } else res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(502).json({ error: 'Email alerts couldn’t be reached. Try again in a minute.' });
  }
}
