/**
 * Company job boards: public listings, read straight from each board's open API (Workday through our /api/workday).
 * Nothing personal is sent: only the company's board name and, for Workday, a role to search for.
 */
import * as C from './core.js';

const TIMEOUT_MS = 20000;

// Where "/api/…" lives: the page itself in the browser; on the server (the email alerts) the site's own address.
let apiOrigin = '';
export function useApiOrigin(origin) { apiOrigin = String(origin || ''); }

async function getJson(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  if (apiOrigin && url.startsWith('/')) url = apiOrigin + url;
  try {
    const res = await fetch(url, { signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new Error(res.status === 404 ? 'board not found' : `error ${res.status}`);
    return await res.json();
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'took too long' : e.message);
  } finally { clearTimeout(t); }
}

/** One company's open jobs as listings. Workday is searched once per target role (up to 3). */
export async function fetchBoard(c, roles) {
  if (c.ats !== 'workday') return C.listingsFromBoard(c, await getJson(C.boardRequest(c)));
  const qs = (roles.length ? roles.slice(0, 3) : ['']);
  const seen = new Set(), out = [];
  for (const q of qs) {
    C.listingsFromBoard(c, await getJson(C.boardRequest(c, q))).forEach(l => { if (!seen.has(l.id)) { seen.add(l.id); out.push(l); } });
  }
  return out;
}

/** Every company's listings, 4 boards at a time. A board that fails becomes a note, not an error. */
export async function fetchBoards(companies, roles, report) {
  const all = [], notes = [];
  let done = 0;
  const queue = companies.slice();
  const worker = async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      try { all.push(...await fetchBoard(c, roles)); } catch (e) { notes.push(`Couldn't read ${c.name}'s job board (${e.message}).`); }
      report(`Checking company job boards ${++done} of ${companies.length}…`);
    }
  };
  await Promise.all([0, 1, 2, 3, 4, 5].map(worker)); // 6 boards at a time: the built-in list is about 40
  return { listings: all, notes };
}

/** A safe HTML → text: DOMParser never runs scripts or loads anything. */
const htmlText = (html) => C.htmlToText(String(html || ''));
const decodeEntities = C.decodeEntities; // no DOMParser: this also runs on the server (email alerts)

/** The full job description, fetched when you ask for it (for ResumeFold). Falls back to what we already have. */
export async function jobDescription(job) {
  const r = job.ref;
  const fallback = [job.role && `${job.role} at ${job.company}`, job.location, job.details].filter(Boolean).join('\n');
  if (!r || !r.ats) return fallback;
  const s = encodeURIComponent(r.slug), id = encodeURIComponent(r.id);
  try {
    switch (r.ats) {
      case 'greenhouse': return htmlText(decodeEntities((await getJson(`https://boards-api.greenhouse.io/v1/boards/${s}/jobs/${id}`)).content)) || fallback;
      case 'lever': {
        const j = await getJson(`https://api.lever.co/v0/postings/${s}/${id}`);
        return [j.descriptionPlain, ...(j.lists || []).map(l => `${l.text}\n${htmlText(l.content)}`), j.additionalPlain].filter(Boolean).join('\n\n') || fallback;
      }
      case 'ashby': {
        const j = (await getJson(C.boardRequest(r))).jobs || [];
        const hit = j.find(x => String(x.id) === r.id);
        return (hit && hit.descriptionPlain) || fallback;
      }
      case 'smartrecruiters': {
        const sec = ((await getJson(`https://api.smartrecruiters.com/v1/companies/${s}/postings/${id}`)).jobAd || {}).sections || {};
        return ['jobDescription', 'qualifications', 'additionalInformation'].map(k => sec[k] && htmlText(sec[k].text)).filter(Boolean).join('\n\n') || fallback;
      }
      case 'workday': {
        const j = await getJson(`/api/workday?host=${encodeURIComponent(r.host)}&site=${encodeURIComponent(r.site)}&path=${encodeURIComponent(r.id)}`);
        return htmlText(j.jobPostingInfo && j.jobPostingInfo.jobDescription) || fallback;
      }
    }
  } catch (e) { /* use what we have */ }
  return fallback;
}

/**
 * Step 4 of a job search: read the best candidates' full postings, drop the ones that aren't for you (2+ years, unpaid,
 * a fee, a bulk invite), then pick the n best by their real descriptions. onDrop(reason, job) is told about each drop.
 */
export async function vetPostings(candidates, data, n, today, onDrop = () => {}) {
  const seenKeys = new Set();
  const pre = C.pickByScore(candidates, data, Math.max(n * 3, 30), today)
    .filter(j => { const k = `${j.company}|${j.role}`.toLowerCase(); if (seenKeys.has(k)) return false; seenKeys.add(k); return true; }); // the same job posted twice
  const kept = [];
  let i = 0;
  await Promise.all([0, 1, 2, 3].map(async () => {
    while (i < pre.length) {
      const j = pre[i++];
      const text = await jobDescription(j);
      const why = C.postingProblem(text, data.settings.prefs, j);
      if (why) onDrop(why, j); else kept.push(Object.assign({}, j, { details: text }));
    }
  }));
  const picked = C.pickByScore(kept, data, n, today);
  // Read and fine, but under your minimum match: told with its score, so a run can say how close the best one came.
  const s = data.settings, skills = C.mySkills(data);
  kept.forEach(k => { if (!picked.some(p => p.key === k.key && p.link === k.link)) onDrop('belowMinMatch', k, C.matchScore(k, skills, s.keywords, s.prefs.roles, s.prefs.roleRange).score); });
  picked.forEach(p => { const k = kept.find(x => x.key === p.key && x.link === p.link); if (k) p.jd = C.clip(k.details, 8000); });
  return picked;
}
