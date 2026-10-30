/**
 * Sends the email alerts through Brevo's free plan (300 a day) from the owner's verified sender address.
 * Env: BREVO_API_KEY, ALERTS_FROM (the verified address), optional ALERTS_FROM_NAME. Plain fetch, no packages.
 * Job text comes from company job boards, so it's escaped everywhere and only http(s) links are kept.
 */
import { matchLabel } from '../js/core.js';

export const mailReady = () => !!(process.env.BREVO_API_KEY && process.env.ALERTS_FROM);

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = (u) => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? String(u) : '');

/**
 * The alert email for these jobs: {subject, html, text}. appUrl opens the matches; unsubUrl stops the emails.
 * Built for email clients: tables and inline styles only, web-safe fonts (Georgia for headings), a hidden preview line.
 */
export function jobsEmail(jobs, { appUrl, unsubUrl, now = new Date() }) {
  const n = jobs.length;
  const base = String(appUrl).replace(/\/app\/matches$/, '');
  const top = jobs[0] || {};
  const subject = n === 1 ? `New match: ${top.role} at ${top.company}` : `${n} new matches for you, starting with ${top.role} at ${top.company}`;
  const day = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
  const where = (j) => [j.company, j.location, /^not listed$/i.test(String(j.pay || '').trim()) ? '' : j.pay].filter(Boolean).join('  ·  ');
  const gap = (j) => (j.skill_gap && j.skill_gap !== 'None' ? j.skill_gap : '');
  const ink = '#14171f', body = '#3a404c', muted = '#6b7280', navy = '#1d3a6e', line = '#e6e9f0';
  const sans = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif", serif = "Georgia,'Times New Roman',serif";
  const button = (href, label, filled) => `<a href="${esc(href)}" style="display:inline-block;margin:6px 8px 0 0;padding:9px 16px;border-radius:8px;font:600 13px/1 ${sans};text-decoration:none;${filled
    ? `background:${navy};color:#ffffff;border:1px solid ${navy}` : `background:#ffffff;color:${navy};border:1px solid #c8d0e0`}">${esc(label)}</a>`;
  const card = (j) => {
    const apply = safeUrl(j.link) || appUrl, tailor = `${base}/app/tailor/${encodeURIComponent(j.id || '')}`;
    return `<tr><td style="padding:0 0 14px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid ${line};border-radius:12px;background:#ffffff"><tr>
<td width="90" valign="top" style="padding:18px 0 18px 18px">
  <div style="width:78px;padding:8px 0;border-radius:10px;background:${matchLabel(j.score).tone === 'hi' ? navy : '#eef2fb'};color:${matchLabel(j.score).tone === 'hi' ? '#ffffff' : navy};font:700 12px/1.2 ${sans};text-align:center">${esc(matchLabel(j.score).label)}<br><span style="font-weight:500;font-size:10px;opacity:.85">match</span></div>
</td>
<td valign="top" style="padding:16px 18px 18px 14px">
  <a href="${esc(apply)}" style="font:600 17px/1.3 ${serif};color:${ink};text-decoration:none">${esc(j.role)}</a>
  <div style="font:13px/1.5 ${sans};color:${muted};margin-top:3px">${esc(where(j))}</div>
  ${j.why ? `<div style="font:14px/1.5 ${sans};color:${body};margin-top:8px">${esc(j.why)}</div>` : ''}
  ${gap(j) ? `<div style="margin-top:8px"><span style="display:inline-block;padding:3px 9px;border-radius:999px;background:#fff4e8;color:#9a3b0c;font:600 12px/1.4 ${sans}">Skill to pick up: ${esc(gap(j))}</span></div>` : ''}
  <div style="margin-top:8px">${button(apply, 'View & apply', true)}${button(tailor, 'Tailor resume', false)}</div>
</td></tr></table>
</td></tr>`;
  };
  const preview = esc(n === 1 ? `${top.role} at ${top.company}: ${matchLabel(top.score).label} match.` : `${top.role} at ${top.company} (${matchLabel(top.score).label} match) and ${n - 1} more, picked from company job boards.`);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#eef1f6">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preview}&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef1f6"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px">
  <tr><td style="background:${navy};border-radius:14px 14px 0 0;padding:18px 24px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
      <td style="font:700 19px/1 ${serif};color:#ffffff;letter-spacing:0.2px">Job Hunter</td>
      <td align="right" style="font:500 12px/1 ${sans};color:#c9d3ea">${esc(day)}</td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#f8f9fc;padding:28px 24px 10px;border-left:1px solid ${line};border-right:1px solid ${line}">
    <div style="font:600 25px/1.25 ${serif};color:${ink}">${n === 1 ? 'A new job picked for you' : `${n} new jobs picked for you`}</div>
    <div style="font:14px/1.6 ${sans};color:${muted};margin-top:6px">Matched to your roles, places and skills, and checked: fresher-level, paid, in India. Applying is always your click.</div>
  </td></tr>
  <tr><td style="background:#f8f9fc;padding:16px 24px 6px;border-left:1px solid ${line};border-right:1px solid ${line}">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${jobs.map(card).join('')}</table>
  </td></tr>
  <tr><td align="center" style="background:#f8f9fc;padding:4px 24px 28px;border-left:1px solid ${line};border-right:1px solid ${line};border-radius:0 0 14px 14px;border-bottom:1px solid ${line}">
    ${button(appUrl, 'See all your matches', true)}
  </td></tr>
  <tr><td align="center" style="padding:18px 24px 0;font:12px/1.6 ${sans};color:#8a909c">
    You get this because email alerts are on in Job Hunter. Your tailored resume is one click away in the app.<br>
    <a href="${esc(base + '/app/settings')}" style="color:#6b7280">Manage alerts</a> &nbsp;·&nbsp; <a href="${esc(unsubUrl)}" style="color:#6b7280">Stop these emails</a>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
  const text = [subject, '', ...jobs.map(j => [`${j.role} (${matchLabel(j.score).label} match)`, where(j), j.why, gap(j) && `Skill to pick up: ${gap(j)}`, `Apply: ${safeUrl(j.link) || appUrl}`].filter(Boolean).join('\n') + '\n'),
    `All your matches: ${appUrl}`, `Stop these emails: ${unsubUrl}`].join('\n');
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
