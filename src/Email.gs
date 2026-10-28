// ---------- Summary email (only ever to the user themselves) ----------
function summaryText_(r) {
  const lines = [];
  lines.push(r.appsChanged.length ? `Application updates:\n- ${r.appsChanged.join('\n- ')}` : 'No new application updates.');
  if (r.jobsNew.length) lines.push(`New recommended jobs (open the tracker for a tailored resume):\n- ${r.jobsNew.join('\n- ')}`);
  if (r.due.length) lines.push(`Waiting on you:\n- ${r.due.join('\n- ')}`);
  if (r.notes.length) lines.push(r.notes.join('\n'));
  return lines.join('\n\n');
}

function sendSummary_(r) {
  if (!r.appsChanged.length && !r.jobsNew.length && !r.due.length) return; // nothing worth an email
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const list = (title, items) => items.length ? `<h3 style="margin:16px 0 6px;font:600 15px Arial">${title}</h3><ul style="margin:0;padding-left:18px;font:14px Arial">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : '';
  const html = `<div style="font:14px Arial;color:#111">` +
    list('Application updates', r.appsChanged) +
    list('New recommended jobs', r.jobsNew) +
    list('Waiting on you', r.due) +
    (r.notes.length ? `<p style="color:#5f6368">${r.notes.map(esc).join('<br>')}</p>` : '') +
    `<p style="margin-top:18px"><a href="${esc(appUrl_())}">Open your Job Tracker</a></p></div>`;
  const subject = `Job Tracker: ${r.appsChanged.length} update${r.appsChanged.length === 1 ? '' : 's'}, ${r.jobsNew.length} new job${r.jobsNew.length === 1 ? '' : 's'}`;
  MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), subject, htmlBody: html, name: 'Job Tracker' });
}

