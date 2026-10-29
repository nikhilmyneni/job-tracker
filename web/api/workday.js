/**
 * Vercel function (free plan): reads a company's public Workday job board for the browser, because Workday
 * doesn't allow other sites to read it directly. It only talks to *.myworkdayjobs.com, keeps no logs or data,
 * and never sees anything about the user: just the board, a role to search for, or one job's path.
 *   GET /api/workday?host=<tenant>.wd5.myworkdayjobs.com&site=<site>&q=<role>   → { total, jobPostings }
 *   GET /api/workday?host=…&site=…&path=/job/<…>                                 → { jobPostingInfo }
 */
const HOST_RE = /^([a-z0-9-]{1,60})\.wd\d{1,3}\.myworkdayjobs\.com$/;
const SITE_RE = /^[A-Za-z0-9_-]{1,80}$/;
const PATH_RE = /^\/job\/[A-Za-z0-9\-_.~%/]{1,300}$/;

export default async function handler(req, res) {
  const { host = '', site = '', q = '', path = '' } = req.query || {};
  const m = HOST_RE.exec(String(host));
  if (req.method !== 'GET' || !m || !SITE_RE.test(String(site)) || String(q).length > 80 || (path && (!PATH_RE.test(String(path)) || /\.\.|%2e|%2f/i.test(String(path))))) {
    res.status(400).json({ error: 'bad request' });
    return;
  }
  const base = `https://${host}/wday/cxs/${m[1]}/${site}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = path
      ? await fetch(base + path, { headers: { Accept: 'application/json' }, signal: ctl.signal, redirect: 'error' })
      : await fetch(base + '/jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, signal: ctl.signal, redirect: 'error',
        body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: String(q) }),
      });
    if (!r.ok) { res.status(r.status === 404 ? 404 : 502).json({ error: `workday ${r.status}` }); return; }
    const j = await r.json();
    const out = path
      ? { jobPostingInfo: { title: j.jobPostingInfo && j.jobPostingInfo.title, jobDescription: j.jobPostingInfo && j.jobPostingInfo.jobDescription } }
      : { total: j.total || 0, jobPostings: (j.jobPostings || []).map(x => ({ title: x.title, externalPath: x.externalPath, locationsText: x.locationsText, postedOn: x.postedOn })) };
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600');
    res.status(200).json(out);
  } catch (e) {
    res.status(504).json({ error: 'workday did not answer' });
  } finally { clearTimeout(timer); }
}
