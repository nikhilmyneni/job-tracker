/**
 * One update: read new application emails and job alerts from Gmail, classify, match jobs.
 * Changes `data` in place; the caller saves it.
 */
import * as C from './core.js';
import * as G from './google.js';
import { ask, hasAi } from './ai.js';

/** report(text) shows progress on the page. */
export async function runUpdate(data, me, report) {
  const s = data.settings;
  const result = C.newResult();
  const seen = new Set(data.seen);
  const now = new Date();
  const after = data.lastRunAt ? new Date(new Date(data.lastRunAt).getTime() - 2 * 864e5) : new Date(now.getTime() - s.sinceDays * 864e5);
  const afterStr = C.gmailDate(after);
  const note = (t) => { result.notes.push(t); report(t); };

  await syncApplications(data, me, afterStr, seen, result, report, note);
  C.markGhosted(data.applications, now, result);

  if (s.jobsPerUpdate > 0) {
    if (!hasAi(s)) result.notes.push('Job matching is off. Add a free AI key in Settings to turn it on.');
    else if (!data.cv) result.notes.push('Add your CV in Settings to get job matches.');
    else await findJobs(data, me, afterStr, seen, result, report, note);
  }
  C.expireJobs(data.jobs, data.applications, C.ymd(now));
  C.collectDue(data.applications, result);

  data.seen = [...seen];
  data.lastRunAt = now.toISOString();
  const text = C.summaryText(result);
  C.addLog(data, 'Update: ' + text.replace(/\n/g, ' | '), now);
  C.trimData(data);
  return { result, text };
}

/** New messages from the threads matching q, skipping ones already seen and ones the user sent. */
async function newMessages(q, max, me, seen, idPrefix, bodyLen) {
  const ids = await G.searchThreads(q, max);
  const threads = await G.pool(ids, 4, G.getThread);
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
  return out;
}

async function syncApplications(data, me, afterStr, seen, result, report, note) {
  report('Reading application emails…');
  const emails = await newMessages(C.appSearch(afterStr), C.MAX_THREADS, me, seen, '', 1500);
  if (!emails.length) return;
  const s = data.settings;
  const updates = [];
  for (let i = 0; i < emails.length; i += 12) {
    const batch = emails.slice(i, i + 12);
    report(`Sorting emails ${i + 1}–${i + batch.length} of ${emails.length}…`);
    let done = false;
    if (hasAi(s)) {
      try {
        const out = await ask(s, C.classifyPrompt(batch), true, report);
        (Array.isArray(out) ? out : []).forEach(u => {
          const e = batch[Number(u.n)];
          if (e && u.is_application_update && u.company) updates.push(Object.assign({ email: e }, u));
        });
        done = true;
      } catch (e) {
        note(`AI couldn't sort some emails (${e.message}). Used keyword rules for those.`);
      }
    }
    if (!done) batch.forEach(e => { const u = C.ruleClassify(e); if (u.is_application_update) updates.push(Object.assign({ email: e }, u)); });
  }
  emails.forEach(e => seen.add(e.id));
  updates.sort((a, b) => a.email.date - b.email.date).forEach(u => C.upsertApplication(data.applications, {
    company: u.company, role: u.role, stage: u.stage, next_step: u.next_step,
    date: C.ymd(u.email.date), channel: C.channelFromSender(u.email.from), link: u.email.link,
  }, result));
}

async function findJobs(data, me, afterStr, seen, result, report, note) {
  report('Reading job-alert emails…');
  const alerts = await newMessages(C.alertSearch(afterStr), C.MAX_ALERT_THREADS, me, seen, 'alert:', 7000);
  if (!alerts.length) { result.notes.push('No new job-alert emails. Turn on job alerts on LinkedIn, Naukri and Internshala for more matches.'); return; }
  const s = data.settings;
  let listings = [];
  for (let i = 0; i < alerts.length; i += 4) {
    const batch = alerts.slice(i, i + 4);
    report(`Finding openings in alerts ${i + 1}–${i + batch.length} of ${alerts.length}…`);
    try {
      const out = await ask(s, C.extractPrompt(batch), true, report);
      if (Array.isArray(out)) listings = listings.concat(out);
      batch.forEach(a => seen.add(a.id));
    } catch (e) {
      note(`AI couldn't read some job alerts (${e.message}). They'll be tried again next time.`);
    }
  }
  const candidates = C.newCandidates(listings, data.jobs, data.applications);
  if (!candidates.length) return;
  report(`Scoring ${candidates.length} openings against your CV…`);
  let scored;
  try { scored = await ask(s, C.scorePrompt(data.cv, s, candidates), true, report); } catch (e) {
    note(`AI couldn't score the openings (${e.message}).`);
    return;
  }
  C.pickJobs(scored, candidates, s.jobsPerUpdate, C.ymd(new Date())).forEach(job => {
    data.jobs.push(job);
    result.jobsNew.push(`${job.company} – ${job.role} (fit ${job.fit}/5)`);
  });
}

/** A resume for one job, from the AI, built only from the CV. */
export async function writeResume(data, job, report) {
  const r = C.cleanResume(await ask(data.settings, C.resumePrompt(data.cv, job), true, report));
  if (!r) throw new Error('The AI did not return a resume. Try again.');
  return r;
}
