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
  await Promise.all([0, 1, 2, 3].map(worker));
  return { listings: all, notes };
}

/** A safe HTML → text: DOMParser never runs scripts or loads anything. */
const htmlText = (html) => C.htmlToText(String(html || ''));
const decodeEntities = (s) => new DOMParser().parseFromString(String(s || ''), 'text/html').documentElement.textContent;

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
