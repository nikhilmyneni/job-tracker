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
 * gmail: false when Gmail isn't connected; then only the company job boards are checked.
 */
export async function runUpdate(data, me, report, refresh = () => {}, { gmail = true } = {}) {
  const s = data.settings;
  const result = C.newResult();
  const seen = new Set(data.seen);
  const now = new Date();
  // Gmail is read from where it was last read, so connecting it later still looks back sinceDays.
  const after = data.gmailRunAt ? new Date(new Date(data.gmailRunAt).getTime() - 2 * 864e5) : new Date(now.getTime() - s.sinceDays * 864e5);
  const afterStr = C.gmailDate(after);
  const note = (t) => { result.notes.push(t); };

  if (gmail) await syncApplications(data, me, afterStr, seen, result, report, note, refresh);
  C.markGhosted(data.applications, now, result);
  refresh();

  if (s.jobsPerUpdate > 0) {
    if (!hasAi(s)) result.notes.push('Job matching is paused because the AI isn’t available right now.');
    else if (!data.cv) result.notes.push('Add your CV in Settings to get job matches.');
    else await findJobs(data, me, afterStr, seen, result, report, note, gmail);
  }
  C.expireJobs(data.jobs, data.applications, C.ymd(now));
  C.collectDue(data.applications, result);

  data.seen = [...seen];
  data.lastRunAt = now.toISOString();
  if (gmail) data.gmailRunAt = data.lastRunAt;
  const text = C.summaryText(result);
  C.addLog(data, 'Update: ' + text.replace(/\n/g, ' | '), now);
  C.trimData(data);
  return { result, text };
}

/** New messages from the threads matching q, oldest first, skipping ones already seen and ones the user sent. */
async function newMessages(q, max, me, seen, idPrefix, bodyLen, onThread) {
  const ids = await G.searchThreads(q, max);
  let got = 0;
  const threads = await G.pool(ids, 8, async (id) => { const t = await G.getThread(id); onThread(++got, ids.length); return t; });
  const out = [];
  const mine = String(me || '').toLowerCase();
  threads.forEach(t => (t.messages || []).forEach(m => {
    const id = idPrefix + m.id;
    if (seen.has(id)) return;
    const from = C.headerValue(m.payload, 'From');
    if (mine && from.toLowerCase().indexOf(mine) >= 0) { seen.add(id); return; }
    out.push({
      id, from, subject: C.headerValue(m.payload, 'Subject'), date: new Date(Number(m.internalDate) || Date.now()),
      body: C.clip(C.bodyFromPayload(m.payload) || m.snippet || '', bodyLen), link: G.threadLink(t.id, me),
    });
  }));
  return out.sort((a, b) => a.date - b.date);
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
  const emails = await newMessages(C.appSearch(afterStr), C.MAX_THREADS, me, seen, '', 1000,
    (n, total) => report(`Reading your application emails… ${n} of ${total}`, 0.02 + 0.28 * n / total));
  if (!emails.length) return;
  const s = data.settings;
  const batches = [];
  for (let i = 0; i < emails.length; i += SORT_BATCH) batches.push(emails.slice(i, i + SORT_BATCH));
  // Batches run a few at a time, but are applied oldest first so a later email always wins.
  for (let i = 0; i < batches.length; i += SORT_PARALLEL) {
    const group = batches.slice(i, i + SORT_PARALLEL);
    const from = i * SORT_BATCH + 1, to = Math.min(emails.length, (i + group.length) * SORT_BATCH);
    report(`Sorting emails ${from}–${to} of ${emails.length}…`, 0.3 + 0.5 * (from - 1) / emails.length);
    const outs = await Promise.all(group.map(b => classifyBatch(s, b, note)));
    outs.flatMap(o => o.updates).sort((a, b) => a.email.date - b.email.date).forEach(u => C.upsertApplication(data.applications, {
      company: u.company, role: u.role, stage: u.stage, next_step: u.next_step, next_at: u.next_at, next_kind: u.next_kind, round: u.round,
      date: C.ymd(u.email.date), channel: C.channelFromSender(u.email.from), link: u.email.link,
    }, result));
    outs.flatMap(o => o.review).forEach(u => { if (C.addReview(data, u.email, u)) result.review++; });
    group.flat().forEach(e => seen.add(e.id));
    refresh();
  }
}

async function findJobs(data, me, afterStr, seen, result, report, note, gmail) {
  const s = data.settings;
  let listings = [];

  if (gmail) report('Reading job-alert emails…', 0.82);
  const alerts = gmail ? await newMessages(C.alertSearch(afterStr), C.MAX_ALERT_THREADS, me, seen, 'alert:', 7000, () => {}) : [];
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

  if (s.companies.length) {
    report('Checking company job boards…', 0.88);
    const boards = await fetchBoards(s.companies, s.prefs.roles, (t) => report(t, 0.9));
    boards.notes.forEach(note);
    const fromBoards = C.boardCandidates(boards.listings, s.prefs, seen);
    fromBoards.forEach(l => seen.add(l.id)); // scored once; not offered again unless it's picked
    listings = listings.concat(fromBoards);
  }
  if (!alerts.length && !s.companies.length) {
    result.notes.push(gmail ? 'No new job-alert emails. Turn on job alerts on LinkedIn, Naukri, Internshala or Indeed, or follow companies in Settings.'
      : 'Follow some companies in Settings, or connect Gmail to read your job alerts, to get matches.');
  }

  const candidates = C.newCandidates(listings, data.jobs, data.applications, 60);
  if (!candidates.length) return;
  report(`Scoring ${candidates.length} openings against your CV…`, 0.94);
  let scored;
  try { scored = await ask(s, C.scorePrompt(data.cv, s, candidates), true, () => {}, 'score'); } catch (e) {
    note(`AI couldn't score the openings (${e.message}).`);
    return;
  }
  C.pickJobs(scored, candidates, s.jobsPerUpdate, C.ymd(new Date())).forEach(job => {
    data.jobs.push(job);
    result.jobsNew.push(`${job.company} – ${job.role} (fit ${job.fit}/5)`);
  });
}

/** The CV as ResumeFold's Resume JSON (not tailored: ResumeFold does that). Made once per CV and kept. */
export async function cvForResumeFold(data) {
  const r = C.cleanResumeFold(await ask(data.settings, C.resumeFoldPrompt(data.cv), true, () => {}, 'cv'));
  if (!r) throw new Error('The AI could not read your CV into ResumeFold’s format. Try again.');
  return r;
}
