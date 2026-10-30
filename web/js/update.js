/**
 * One update: read new application emails and job alerts from Gmail, check company job boards, classify, match jobs.
 * Changes `data` in place; the caller saves it.
 */
import * as C from './core.js';
import * as G from './google.js';
import { ask, hasAi } from './ai.js';
import { fetchBoards } from './sources.js';

const SORT_BATCH = 20, SORT_PARALLEL = 2;

/**
 * report(text, fraction) shows progress on the page (fraction 0–1, or undefined when unknown).
 * refresh() redraws the dashboard, so applications appear while the rest is still being sorted.
 * gmail: read application emails (false when Gmail isn't connected, or only the job search is due).
 * jobs: look for new openings (company boards, plus job-alert emails when alerts is true, i.e. Gmail is connected).
 */
export async function runUpdate(data, me, report, refresh = () => {}, { gmail = true, jobs = true, alerts = gmail } = {}) {
  const s = data.settings;
  const result = C.newResult();
  const seen = new Set(data.seen);
  const now = new Date();
  // Gmail is read from where it was last read, so connecting it later still looks back sinceDays.
  // Data read the older way looks back the full sinceDays once, and reads its application emails again
  // (job-alert ids and job ids stay seen), to pick up what the older search and rules missed.
  const rescan = gmail && data.gmailScan !== C.GMAIL_SCAN;
  if (rescan && !data.gmailRescan) { // once: a re-read longer than one sync carries on from where it got to
    [...seen].forEach(id => { if (/^[0-9a-f]{12,20}$/.test(id)) seen.delete(id); });
    data.gmailRescan = true;
  }
  const after = data.gmailRunAt && !rescan ? new Date(new Date(data.gmailRunAt).getTime() - 2 * 864e5) : new Date(now.getTime() - s.sinceDays * 864e5);
  const afterStr = C.gmailDate(after);
  const note = (t) => { result.notes.push(t); };

  // Emails left for next time (over this sync's limit): Gmail keeps being read from the same point until they're done.
  const left = gmail ? await syncApplications(data, me, afterStr, seen, result, report, note, refresh) : 0;
  C.markGhosted(data.applications, now, result);
  refresh();

  if (jobs && s.jobsPerUpdate > 0) {
    if (!data.cv) result.notes.push('Add your CV in Profile and CV, so openings can be scored against your skills.');
    await findJobs(data, me, afterStr, seen, result, report, note, alerts);
  }
  C.expireJobs(data.jobs, data.applications, C.ymd(now));
  C.collectDue(data.applications, result);

  data.seen = [...seen];
  data.lastRunAt = now.toISOString();
  if (gmail && !left) { data.gmailRunAt = data.lastRunAt; data.gmailScan = C.GMAIL_SCAN; data.gmailRescan = false; }
  if (jobs) data.jobsRunAt = data.lastRunAt;
  const text = C.summaryText(result);
  C.addLog(data, 'Update: ' + text.replace(/\n/g, ' | '), now);
  C.trimData(data);
  return { result, text };
}

/**
 * Messages matching q that haven't been read yet, skipping ones the user sent, sorted oldest first.
 * At most max are read: the oldest ones (so a backlog is worked through in order), or with newest, the latest ones.
 * Returns {emails, left}: left is how many unread matches are waiting for the next sync.
 */
async function newMessages(q, max, me, seen, idPrefix, bodyLen, onRead, newest = false) {
  const found = (await G.searchMessages(q, C.MAX_LISTED)).filter(m => !seen.has(idPrefix + m.id)); // newest first
  const todo = newest ? found.slice(0, max) : found.slice(-max);
  let got = 0;
  // 4 at a time: Gmail limits reads per user per minute, and google.js slows down further when it says so.
  const msgs = await G.pool(todo, 4, async (r) => { const m = await G.getMessage(r.id); onRead(++got, todo.length); return m; });
  const out = [];
  const mine = String(me || '').toLowerCase();
  msgs.forEach(m => {
    const id = idPrefix + m.id;
    const from = C.headerValue(m.payload, 'From');
    if (mine && from.toLowerCase().indexOf(mine) >= 0) { seen.add(id); return; }
    out.push({
      id, from, subject: C.headerValue(m.payload, 'Subject'), date: new Date(Number(m.internalDate) || Date.now()),
      body: C.clip(C.bodyFromPayload(m.payload) || m.snippet || '', bodyLen), link: G.threadLink(m.threadId, me),
    });
  });
  return { emails: out.sort((a, b) => a.date - b.date), left: found.length - todo.length };
}

/**
 * One batch → {updates, review}: application updates, and emails that look like one but couldn't be matched.
 * By AI, or (if that fails or there's no key) by keyword rules.
 */
async function classifyBatch(s, batch, note) {
  let all = null;
  if (hasAi(s)) {
    try {
      const out = await ask(s, C.classifyPrompt(batch), true, () => {}, 'classify');
      all = (Array.isArray(out) ? out : []).map(u => Object.assign({ email: batch[Number(u.n)] }, u)).filter(u => u.email);
      // The AI sometimes leaves an email out of its answer: those are sorted by the rules instead of being lost.
      const answered = new Set(all.map(u => u.email));
      batch.filter(e => !answered.has(e)).forEach(e => all.push(Object.assign({ email: e }, C.ruleClassify(e))));
    } catch (e) {
      note(`AI couldn't sort some emails (${e.message}). Used keyword rules for those.`);
    }
  }
  if (!all) all = batch.map(e => Object.assign({ email: e }, C.ruleClassify(e)));
  return {
    updates: all.filter(u => u.is_application_update && u.company),
    review: all.filter(u => u.needs_review || (u.is_application_update && !u.company)),
  };
}

async function syncApplications(data, me, afterStr, seen, result, report, note, refresh) {
  report('Reading your application emails…', 0.02);
  const { emails, left } = await newMessages(C.appSearch(afterStr), C.MAX_EMAILS, me, seen, '', 1000,
    (n, total) => report(`Reading your application emails… ${n} of ${total}`, 0.02 + 0.28 * n / total));
  if (left) note(`${left} older emails are still to read. The next sync carries on with them.`);
  if (!emails.length) return left;
  const s = data.settings;
  const batches = [];
  for (let i = 0; i < emails.length; i += SORT_BATCH) batches.push(emails.slice(i, i + SORT_BATCH));
  // Batches run a few at a time, but are applied oldest first so a later email always wins.
  for (let i = 0; i < batches.length; i += SORT_PARALLEL) {
    const group = batches.slice(i, i + SORT_PARALLEL);
    const from = i * SORT_BATCH + 1, to = Math.min(emails.length, (i + group.length) * SORT_BATCH);
    const label = `Sorting emails ${from}–${to} of ${emails.length}…`, frac = 0.3 + 0.5 * (from - 1) / emails.length;
    report(label, frac);
    // A slow AI answer can take up to a minute: say so, so the bar doesn't look stuck.
    const started = Date.now();
    const slow = setInterval(() => report(`${label} The AI is slow right now (${Math.round((Date.now() - started) / 1000)}s). If it doesn't answer, keyword rules take over.`, frac), 10000);
    const outs = await Promise.all(group.map(b => classifyBatch(s, b, note))).finally(() => clearInterval(slow));
    outs.flatMap(o => o.updates).sort((a, b) => a.email.date - b.email.date).forEach(u => C.upsertApplication(data.applications, {
      company: u.company, role: u.role, stage: u.stage, next_step: u.next_step, next_at: u.next_at, next_kind: u.next_kind, round: u.round,
      date: C.ymd(u.email.date), channel: C.channelFromSender(u.email.from), link: u.email.link,
    }, result, data.removed));
    outs.flatMap(o => o.review).forEach(u => { if (C.addReview(data, u.email, u)) result.review++; });
    group.flat().forEach(e => seen.add(e.id));
    refresh();
  }
  return left;
}

async function findJobs(data, me, afterStr, seen, result, report, note, gmail) {
  const s = data.settings;
  let listings = [];

  // Job-alert emails need the AI to pull the openings out of them; company boards don't.
  const readAlerts = gmail && hasAi(s);
  if (readAlerts) report('Reading job-alert emails…', 0.82);
  const alerts = readAlerts ? (await newMessages(C.alertSearch(afterStr), C.MAX_ALERT_EMAILS, me, seen, 'alert:', 7000, () => {}, true)).emails : [];
  for (let i = 0; i < alerts.length; i += 4) {
    const batch = alerts.slice(i, i + 4);
    report(`Finding openings in job alerts ${i + 1}–${i + batch.length} of ${alerts.length}…`, 0.84);
    try {
      const out = await ask(s, C.extractPrompt(batch), true, () => {}, 'extract');
      if (Array.isArray(out)) listings = listings.concat(out.map(l => Object.assign({}, l, { source: 'Job alert email' })));
      batch.forEach(a => seen.add(a.id));
    } catch (e) {
      note(`AI couldn't read some job alerts (${e.message}). They'll be tried again next time.`);
    }
  }

  const companies = C.searchCompanies(s);
  if (companies.length) {
    report('Checking company job boards…', 0.88);
    const boards = await fetchBoards(companies, s.prefs.roles, (t) => report(t, 0.9));
    boards.notes.forEach(note);
    const fromBoards = C.boardCandidates(boards.listings, s.prefs, seen);
    fromBoards.forEach(l => seen.add(l.id)); // scored once; not offered again unless it's picked
    listings = listings.concat(fromBoards);
  }
  if (!alerts.length && !companies.length) {
    result.notes.push(gmail ? 'No new job-alert emails. Turn on job alerts on LinkedIn, Naukri, Internshala or Indeed, or follow companies in Settings.'
      : 'Follow some companies in Settings, or connect Gmail to read your job alerts, to get matches.');
  }

  const candidates = C.newCandidates(listings, data.jobs, data.applications, 120);
  if (!candidates.length) return;
  report(`Scoring ${candidates.length} openings against your CV…`, 0.96);
  C.pickByScore(candidates, data, s.jobsPerUpdate, C.ymd(new Date())).forEach(job => {
    data.jobs.push(job);
    result.jobsNew.push(`${job.company} – ${job.role} (${job.score}%)`);
  });
}

/** The CV as ResumeFold's Resume JSON (not tailored: ResumeFold does that). Made once per CV and kept. */
export async function cvForResumeFold(data) {
  const r = C.cleanResumeFold(await ask(data.settings, C.resumeFoldPrompt(data.cv), true, () => {}, 'cv'));
  if (!r) throw new Error('The AI could not read your CV into ResumeFold’s format. Try again.');
  return r;
}
