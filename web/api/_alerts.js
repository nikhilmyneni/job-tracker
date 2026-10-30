/**
 * The opt-in email alerts, shared by api/alerts.js (your switch) and api/alerts-run.js (the hourly search).
 * Stored per Google account, only while alerts are on: the email address, what matching needs (roles, locations,
 * skill names, keywords, followed companies, times) and the ids of jobs already sent. No CV text, nothing from Gmail.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import * as C from '../js/core.js';
import { fetchBoards, useApiOrigin, vetPostings } from '../js/sources.js';
import { pipeline, cmd, parse } from './_store.js';
import { mailReady, jobsEmail, sendMail } from './_mail.js';

export const K = {
  subs: 'alerts:subs',
  profile: (s) => 'alerts:p:' + s, seen: (s) => 'alerts:seen:' + s, found: (s) => 'alerts:new:' + s, sent: (s) => 'alerts:sent:' + s,
};
export const MAX_SEEN = 3000, MAX_FOUND = 50;

/** Only the fields matching needs, through the same checks as the app's settings. The email comes from the token. */
export function cleanProfile(raw, email) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const given = r.settings && typeof r.settings === 'object' ? r.settings : {};
  const s = C.normalizeSettings(Object.assign({}, given, { onboarded: true }));
  let tz = String(r.tz || '').slice(0, 64);
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch (e) { tz = 'Asia/Kolkata'; }
  const skills = (Array.isArray(r.skills) ? r.skills : []).map(x => String(x).trim().slice(0, 40)).filter(Boolean).slice(0, 80);
  return {
    email: String(email), tz, skills, at: new Date().toISOString(),
    settings: { prefs: s.prefs, keywords: s.keywords, minMatch: s.minMatch, jobsPerUpdate: s.jobsPerUpdate, schedule: s.schedule, companies: s.companies, autoCompanies: s.autoCompanies },
  };
}

const sign = (sub) => createHmac('sha256', process.env.ALERTS_SECRET || '').update('unsub:' + sub).digest('hex').slice(0, 32);
/** The one-click unsubscribe token for an email: "<sub>.<signature>". */
export const unsubToken = (sub) => `${sub}.${sign(sub)}`;
/** The sub inside a valid unsubscribe token, or null. */
export function unsubSub(token) {
  const [sub, sig] = String(token || '').split('.');
  if (!process.env.ALERTS_SECRET || !sub || !sig || !/^[0-9A-Za-z_-]{1,64}$/.test(sub)) return null;
  const want = Buffer.from(sign(sub)), got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? sub : null;
}

export const dropAll = (sub) => pipeline([['SREM', K.subs, sub], ['DEL', K.profile(sub), K.seen(sub), K.found(sub), K.sent(sub)]]);

/**
 * One hourly run: for everyone whose "New jobs ready by" time has passed today (their time zone), check the companies
 * they follow plus the built-in list (each board read once for all of them), keep the new matches for the app, and email them.
 * Stops starting new people after budgetMs; they're picked up next hour. force runs people who already ran today
 * (for testing from the workflow). The counts say why nothing was sent: no boards, no listings, none matched, or an email error.
 */
export async function runAlerts({ now = new Date(), origin = '', budgetMs = 40000, force = false } = {}) {
  const start = Date.now();
  const subs = (await cmd('SMEMBERS', K.subs)) || [];
  if (!subs.length) return { users: 0, due: 0, emailed: 0 };
  const vals = await pipeline(subs.flatMap(s => [['GET', K.profile(s)], ['GET', K.sent(s)]]));
  const due = [];
  subs.forEach((sub, i) => {
    const p = parse(vals[2 * i]);
    if (!p || !p.settings || !p.email) return;
    const d = C.alertDue(p, force ? '' : vals[2 * i + 1] || '', now);
    if (d.due) due.push({ sub, p, day: d.day });
  });
  if (!due.length) return { users: subs.length, due: 0, emailed: 0 };

  // Each followed board once, for everyone due now.
  const boards = new Map(), roles = new Set();
  due.forEach(u => {
    C.searchCompanies(u.p.settings).forEach(c => boards.set(C.companyKey(c), c));
    u.p.settings.prefs.roles.forEach(r => roles.add(r));
  });
  if (origin) useApiOrigin(origin);
  const { listings, notes } = await fetchBoards([...boards.values()], C.searchWords([...roles], now.getTime() / 864e5), () => {});

  const appUrl = (origin || 'https://jobs4you.vercel.app') + '/app/matches';
  let emailed = 0, done = 0, candidates = 0, found = 0, mailError = '', bestBelow = 0;
  const leftOut = { seen: 0, role: 0, senior: 0, internOnly: 0, fullTimeOnly: 0, skipList: 0, location: 0, belowMinMatch: 0, experience: 0, unpaid: 0, fee: 0, bulkInvite: 0 };
  for (const u of due) {
    if (Date.now() - start > budgetMs) break;
    const [seenRaw, foundRaw] = await pipeline([['GET', K.seen(u.sub)], ['GET', K.found(u.sub)]]);
    const seen = new Set(parse(seenRaw, []));
    const mine = new Set(C.searchCompanies(u.p.settings).map(c => `ats:${C.companyKey(c)}:`));
    const theirs = listings.filter(l => [...mine].some(pre => String(l.id).startsWith(pre)));
    const data = { settings: u.p.settings, cv: '', skillsAdded: u.p.skills, skillsRemoved: [] };
    const cands = C.boardCandidates(theirs, u.p.settings.prefs, seen);
    cands.forEach(l => seen.add(l.id)); // scored once, as in the app
    const jobs = await vetPostings(cands, data, u.p.settings.jobsPerUpdate, u.day, (why, j, score) => { leftOut[why]++; if (score > bestBelow) bestBelow = score; });
    candidates += cands.length; found += jobs.length;
    // Counts only (never anyone's settings), so a run's log shows which filter leaves jobs out.
    theirs.forEach(l => { const why = seen.has(l.id) && !cands.includes(l) ? 'seen' : C.rejectReason(l, u.p.settings.prefs); if (why) leftOut[why]++; });
    const waiting = [...jobs, ...parse(foundRaw, [])].slice(0, MAX_FOUND);
    await pipeline([
      ['SET', K.seen(u.sub), JSON.stringify([...seen].slice(-MAX_SEEN))],
      ['SET', K.found(u.sub), JSON.stringify(waiting)],
      ['SET', K.sent(u.sub), u.day],
    ]);
    if (jobs.length && !mailReady()) mailError = 'BREVO_API_KEY or ALERTS_FROM is not set';
    if (jobs.length && mailReady()) {
      const unsubUrl = `${origin || 'https://jobs4you.vercel.app'}/api/alerts?unsub=${encodeURIComponent(unsubToken(u.sub))}`;
      try { await sendMail(Object.assign({ to: u.p.email, unsubUrl }, jobsEmail(jobs, { appUrl, unsubUrl }))); emailed++; } catch (e) { mailError = String(e.message).slice(0, 200); /* the jobs still wait in the app */ }
    }
    done++;
  }
  return { users: subs.length, due: due.length, done, boards: boards.size, listings: listings.length, boardErrors: notes.slice(0, 5), leftOut, bestBelow, candidates, found, emailed, mailError };
}
