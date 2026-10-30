/**
 * Sends the email alerts through Brevo's free plan (300 a day) from the owner's verified sender address.
 * Env: BREVO_API_KEY, ALERTS_FROM (the verified address), optional ALERTS_FROM_NAME. Plain fetch, no packages.
 * Job text comes from company job boards, so it's escaped everywhere and only http(s) links are kept.
 */
export const mailReady = () => !!(process.env.BREVO_API_KEY && process.env.ALERTS_FROM);

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = (u) => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? String(u) : '');

/** The alert email for these jobs: {subject, html, text}. appUrl opens the matches; unsubUrl stops the emails. */
export function jobsEmail(jobs, { appUrl, unsubUrl }) {
  const n = jobs.length;
  const subject = `${n} new job${n === 1 ? '' : 's'} for you on Job Hunter`;
  const line = (j) => [j.company, j.location].filter(Boolean).join(' · ') + (j.score != null ? ` · ${j.score}% match` : '');
  const rows = jobs.map(j => {
    const link = safeUrl(j.link) || appUrl;
    return `<tr><td style="padding:12px 0;border-bottom:1px solid #e6e8ee">
      <a href="${esc(link)}" style="color:#1f3f9c;font-weight:600;font-size:16px;text-decoration:none">${esc(j.role)}</a>
      <div style="color:#555;font-size:14px;margin-top:2px">${esc(line(j))}</div>
      ${j.why ? `<div style="color:#777;font-size:13px;margin-top:2px">${esc(j.why)}</div>` : ''}</td></tr>`;
  }).join('');
  const html = `<!doctype html><html><body style="margin:0;background:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:#222">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <h1 style="font-size:20px;margin:0 0 4px">${esc(subject)}</h1>
  <p style="color:#555;font-size:14px;margin:0 0 12px">Picked from the companies you follow, matched to your roles and skills.</p>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff;border-radius:12px;padding:0 16px">${rows}</table>
  <p style="margin:20px 0"><a href="${esc(appUrl)}" style="background:#2f5bd3;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Open Job Hunter</a></p>
  <p style="color:#888;font-size:12px">You get this because you turned on email alerts in Job Hunter. <a href="${esc(unsubUrl)}" style="color:#888">Stop these emails</a>.</p>
</div></body></html>`;
  const text = [subject, '', ...jobs.map(j => `${j.role}\n${line(j)}\n${safeUrl(j.link) || appUrl}\n`), `Open Job Hunter: ${appUrl}`, `Stop these emails: ${unsubUrl}`].join('\n');
  return { subject, html, text };
}

export async function sendMail({ to, subject, html, text, unsubUrl }) {
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: process.env.ALERTS_FROM_NAME || 'Job Hunter', email: process.env.ALERTS_FROM },
      to: [{ email: to }], subject, htmlContent: html, textContent: text,
      headers: unsubUrl ? { 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined,
    }),
  });
  if (!r.ok) throw new Error(`email error ${r.status}: ${(await r.text().catch(() => '')).slice(0, 160)}`);
}
