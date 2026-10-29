/**
 * Browser notifications after a sync: a status changed, or new matches arrived.
 * There's no push server, so they only fire while Job Hunter is open (a tab or the installed app).
 */
import { STATUS_LABEL } from './core.js';

export const notifySupported = () => 'Notification' in window;
export const notifyAllowed = () => notifySupported() && Notification.permission === 'granted';

/** Asks the browser for permission. Must run from a click. Returns true when allowed. */
export async function askToNotify() {
  if (!notifySupported()) throw new Error('This browser can’t show notifications.');
  if (Notification.permission === 'denied') throw new Error('Notifications are blocked for this site. Allow them in your browser’s site settings, then try again.');
  return (await Notification.requestPermission()) === 'granted';
}

async function show(title, body, url, tag) {
  const opts = { body, tag, icon: '/icon.svg', badge: '/icon.svg', data: { url } };
  const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
  if (reg) await reg.showNotification(title, opts);
  else new Notification(title, opts).onclick = () => { window.focus(); location.href = url; };
}

/** The notification texts for one sync's result (pure, so it can be tested). */
export function notificationsFor(result, jobs) {
  const out = [];
  const ch = result.changes.filter(c => c.from); // new rows from the first sync aren't news
  if (ch.length === 1) {
    const c = ch[0];
    out.push({ title: `${c.company}: ${STATUS_LABEL[c.to] || c.to}`, body: c.role ? `${c.role} moved from ${STATUS_LABEL[c.from] || c.from} to ${STATUS_LABEL[c.to] || c.to}.` : `Moved from ${STATUS_LABEL[c.from] || c.from} to ${STATUS_LABEL[c.to] || c.to}.`, url: '/app', tag: 'status' });
  } else if (ch.length > 1) {
    out.push({ title: `${ch.length} applications changed`, body: ch.slice(0, 3).map(c => `${c.company}: ${STATUS_LABEL[c.to] || c.to}`).join(' · ') + (ch.length > 3 ? ' …' : ''), url: '/app', tag: 'status' });
  }
  if (jobs.length) {
    const best = jobs.slice().sort((a, b) => b.fit - a.fit)[0];
    out.push({ title: `${jobs.length} new job match${jobs.length === 1 ? '' : 'es'}`, body: `Best: ${best.role} at ${best.company} (${Math.round(best.fit * 20)}%)`, url: '/app/matches', tag: 'jobs' });
  }
  return out;
}

export async function notifySync(settings, result, newJobs) {
  if (!settings.notify || !notifyAllowed()) return;
  for (const n of notificationsFor(result, newJobs)) {
    try { await show(n.title, n.body, n.url, n.tag); } catch (e) { /* the page still shows the update */ }
  }
}
