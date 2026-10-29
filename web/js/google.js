/**
 * Google sign-in (Identity Services token client), the app's hidden Drive folder, and Gmail read-only.
 * Sign-in asks only for name, email and the Drive app folder (no warning screen). Gmail is a separate,
 * optional step (connectGmail) that adds gmail.readonly on top, so only that step shows Google's
 * "unverified app" screen.
 * The access token lives in memory, plus this tab's sessionStorage so a reload keeps you signed in.
 * It's gone when the tab closes, after about an hour, or on sign-out. Nothing here talks to anything but Google.
 */
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const SCOPES = [DRIVE_SCOPE, 'openid', 'email', 'profile'];
const DATA_NAME = 'job-tracker.json';

export class NeedSignIn extends Error {}

export class GmailNotConnected extends Error {}

let client = null, token = '', tokenExp = 0, waiting = null, gmail = false;
const SESSION_KEY = 'jh-session';

function remember() {
  try { if (token) sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token, tokenExp, gmail })); else sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* storage blocked: memory only */ }
}

/** After a reload: picks the token back up from this tab, if it's still valid. No popup. */
export function resumeSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    if (s && typeof s.token === 'string' && Number(s.tokenExp) > Date.now()) { token = s.token; tokenExp = Number(s.tokenExp); gmail = s.gmail === true; return true; }
  } catch (e) { /* ignore */ }
  token = ''; tokenExp = 0; gmail = false; remember();
  return false;
}

/** Loads Google's sign-in script early, so the sign-in popup opens right on the click. */
export function preload() {
  if (!document.querySelector('script[data-gis]')) {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.dataset.gis = '1';
    document.head.appendChild(s);
  }
}

function gis() {
  preload();
  return new Promise((resolve, reject) => {
    const started = Date.now();
    (function check() {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) return resolve(window.google.accounts.oauth2);
      if (Date.now() - started > 15000) return reject(new Error('Google sign-in did not load. Check your connection or ad blocker, then reload.'));
      setTimeout(check, 100);
    })();
  });
}

function tokenClient(oauth2, clientId) {
  if (!client) {
    client = oauth2.initTokenClient({
      client_id: clientId, scope: SCOPES.join(' '), include_granted_scopes: true,
      callback: (r) => waiting && waiting.resolve(r), error_callback: (e) => waiting && waiting.reject(e),
    });
  }
  return client;
}

function request(c, opts) {
  return new Promise((resolve, reject) => { waiting = { resolve, reject }; c.requestAccessToken(opts); }).finally(() => { waiting = null; });
}

function keep(oauth2, r) {
  token = r.access_token;
  tokenExp = Date.now() + (Number(r.expires_in) || 3600) * 1000 - 60e3;
  gmail = oauth2.hasGrantedAllScopes(r, GMAIL_SCOPE); // earlier Gmail consent comes back with include_granted_scopes
  remember();
}

/** Opens Google's sign-in popup: name, email and the Drive app folder only. Must run from a click. */
export async function signIn(clientId, { hint, consent } = {}) {
  const oauth2 = await gis();
  const r = await request(tokenClient(oauth2, clientId), { prompt: consent ? 'consent' : '', login_hint: hint || undefined });
  if (r.error) throw new Error(r.error_description || r.error);
  if (!oauth2.hasGrantedAllScopes(r, DRIVE_SCOPE)) {
    throw new Error('Job Hunter needs the box for its own app data in Drive ticked. That’s where your data is saved. Sign in again and allow it.');
  }
  keep(oauth2, r);
  return token;
}

/** Adds read-only Gmail access (the step that shows Google's unverified-app screen). Must run from a click. */
export async function connectGmail(clientId, { hint } = {}) {
  const oauth2 = await gis();
  const r = await request(tokenClient(oauth2, clientId), { prompt: '', scope: GMAIL_SCOPE, login_hint: hint || undefined });
  if (r.error) throw new Error(r.error === 'access_denied' ? 'Gmail wasn’t connected. You can try again any time.' : (r.error_description || r.error));
  if (!oauth2.hasGrantedAllScopes(r, GMAIL_SCOPE)) throw new Error('Tick the box to let Job Hunter read your job emails, then try again.');
  keep(oauth2, r);
  return true;
}

export const gmailConnected = () => gmail;

export function signedIn() { return !!token && Date.now() < tokenExp; }
/** The current access token (for our own /api/ai check); throws NeedSignIn when it has expired. */
export function accessToken() { if (!signedIn()) throw new NeedSignIn('Your Google session ended. Click Continue to sign in again.'); return token; }

export async function signOut() {
  const t = token;
  token = ''; tokenExp = 0; gmail = false; remember();
  if (t) { try { (await gis()).revoke(t, () => {}); } catch (e) {} }
}

/** fetch with the token. A 401 or an expired token means the user has to click Continue again. */
async function gfetch(url, opts = {}) {
  if (!signedIn()) throw new NeedSignIn('Your Google session ended. Click Continue to sign in again.');
  const res = await fetch(url, Object.assign({}, opts, { headers: Object.assign({ Authorization: 'Bearer ' + token }, opts.headers || {}) }));
  if (res.status === 401) { token = ''; remember(); throw new NeedSignIn('Your Google session ended. Click Continue to sign in again.'); }
  if (!res.ok) {
    let msg = '';
    try { const j = await res.json(); msg = (j.error && j.error.message) || ''; } catch (e) {}
    throw new Error(`Google error ${res.status}${msg ? ': ' + msg : ''}`);
  }
  return res;
}
const gjson = async (url, opts) => (await gfetch(url, opts)).json();

export async function profile() {
  const p = await gjson('https://www.googleapis.com/oauth2/v3/userinfo');
  return { email: p.email || '', name: p.name || '', picture: p.picture || '' };
}

// ---------- Gmail (read-only) ----------
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';

export async function searchThreads(q, max) {
  if (!gmail) throw new GmailNotConnected('Connect Gmail to read your job emails.');
  const j = await gjson(`${GMAIL}/threads?maxResults=${max}&q=${encodeURIComponent(q)}`);
  return (j.threads || []).map(t => t.id);
}

export const getThread = (id) => gjson(`${GMAIL}/threads/${id}?format=full`);

/** Runs fn over items, n at a time. */
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

export const threadLink = (threadId, email) => `https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}#all/${threadId}`;

// ---------- Drive app data (hidden folder only this app can see) ----------
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

async function findFile(name) {
  const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and trashed=false`);
  const j = await gjson(`${DRIVE}?spaces=appDataFolder&q=${q}&fields=files(id,name,size,modifiedTime)&pageSize=10`);
  return (j.files || [])[0] || null;
}

async function createFile(name, blob) {
  const meta = new Blob([JSON.stringify({ name, parents: ['appDataFolder'] })], { type: 'application/json' });
  const form = new FormData();
  form.append('metadata', meta);
  form.append('file', blob);
  return gjson(`${UPLOAD}?uploadType=multipart&fields=id,name,size,modifiedTime`, { method: 'POST', body: form });
}

const updateFile = (id, blob) => gjson(`${UPLOAD}/${id}?uploadType=media&fields=id,name,size,modifiedTime`, {
  method: 'PATCH', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob,
});

let dataFileId = '';

/** The saved data, or null for a new user. */
export async function loadData() {
  const f = await findFile(DATA_NAME);
  if (!f) { dataFileId = ''; return null; }
  dataFileId = f.id;
  return (await gfetch(`${DRIVE}/${f.id}?alt=media`)).json();
}

export async function saveData(data) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  if (dataFileId) { try { await updateFile(dataFileId, blob); return; } catch (e) { if (!/404/.test(e.message)) throw e; } }
  dataFileId = (await createFile(DATA_NAME, blob)).id;
}

/** Saves the original CV file, replacing the previous one. Returns {id, name, mime, size, at}. */
export async function saveCvFile(file, previousId) {
  const name = 'cv-original' + ((file.name.match(/\.[a-z0-9]{1,5}$/i) || [''])[0].toLowerCase());
  const saved = await createFile(name, file);
  if (previousId && previousId !== saved.id) { try { await gfetch(`${DRIVE}/${previousId}`, { method: 'DELETE' }); } catch (e) {} }
  return { id: saved.id, name: file.name.slice(0, 120), mime: file.type || '', size: file.size, at: new Date().toISOString() };
}

export const downloadFile = async (id) => (await gfetch(`${DRIVE}/${id}?alt=media`)).blob();

/** Deletes everything this app stored in Drive. */
export async function deleteAllData() {
  const j = await gjson(`${DRIVE}?spaces=appDataFolder&fields=files(id)&pageSize=100`);
  await Promise.all((j.files || []).map(f => gfetch(`${DRIVE}/${f.id}`, { method: 'DELETE' })));
  dataFileId = '';
}

