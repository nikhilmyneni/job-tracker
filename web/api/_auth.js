/**
 * Shared by the functions in web/api (Vercel doesn't serve files starting with "_"): checks that a request comes
 * from a signed-in Job Hunter user, and keeps a per-user daily allowance. In memory per warm instance only:
 * there's no database, so the allowance is best effort.
 */
import { GOOGLE_CLIENT_ID } from '../config.js';

const verified = new Map();

/** The Google user id behind a "Bearer <access token>" header, if the token was issued to our OAuth client. */
export async function userFrom(req) {
  const me = await userInfo(req);
  return me ? me.sub : null;
}

/** {sub, email} behind the token (email is there because sign-in asks for the email scope), or null. */
export async function userInfo(req) {
  const token = String((req.headers && req.headers.authorization) || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const hit = verified.get(token);
  if (hit && hit.exp > Date.now()) return { sub: hit.sub, email: hit.email };
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(token));
    if (!r.ok) return null;
    const t = await r.json();
    if ((t.aud !== GOOGLE_CLIENT_ID && t.azp !== GOOGLE_CLIENT_ID) || !(Number(t.expires_in) > 0) || !t.sub) return null;
    const email = t.email && String(t.email_verified) !== 'false' ? String(t.email) : '';
    if (verified.size > 2000) verified.clear();
    verified.set(token, { sub: t.sub, email, exp: Date.now() + Number(t.expires_in) * 1000 });
    return { sub: t.sub, email };
  } catch (e) { return null; }
}

/** A daily counter per user (resets at midnight UTC). allow(sub) is false once today's limit is used up. */
export function allowance(limit) {
  const counts = new Map();
  let day = '';
  return (sub) => {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== day) { counts.clear(); day = today; }
    const n = (counts.get(sub) || 0) + 1;
    counts.set(sub, n);
    return n <= limit;
  };
}
