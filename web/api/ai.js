/**
 * Vercel function (free plan): the built-in AI, so users don't need their own key.
 * The site owner's free keys live in environment variables (GROQ_API_KEY, GEMINI_API_KEY; optional GROQ_MODEL,
 * GEMINI_MODEL, AI_DAILY_LIMIT). Only signed-in Job Hunter users can call it: the Google access token must have
 * been issued to our OAuth client. The text passes straight through to the AI provider and back. Nothing is
 * stored or logged.
 *   POST /api/ai  { task: 'classify'|'extract'|'score'|'cv', prompt, json }  →  { result }
 */
import { askWith, PROVIDERS } from '../js/ai.js';
import { GOOGLE_CLIENT_ID } from '../config.js';

const TASKS = new Set(['classify', 'extract', 'score', 'cv']);
const MAX_PROMPT = 40000;
const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT) || 80;

// Per warm instance only (no database): a verified-token cache and today's call counts per user.
const verified = new Map();
const counts = new Map();
let countsDay = '';

async function whoIs(token) {
  const hit = verified.get(token);
  if (hit && hit.exp > Date.now()) return hit.sub;
  const r = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(token));
  if (!r.ok) return null;
  const t = await r.json();
  if ((t.aud !== GOOGLE_CLIENT_ID && t.azp !== GOOGLE_CLIENT_ID) || !(Number(t.expires_in) > 0) || !t.sub) return null;
  if (verified.size > 2000) verified.clear();
  verified.set(token, { sub: t.sub, exp: Date.now() + Number(t.expires_in) * 1000 });
  return t.sub;
}

function useAllowance(sub) {
  const day = new Date().toISOString().slice(0, 10);
  if (day !== countsDay) { counts.clear(); countsDay = day; }
  const n = (counts.get(sub) || 0) + 1;
  counts.set(sub, n);
  return n <= DAILY_LIMIT;
}

export function providersFromEnv(env = process.env) {
  const list = [];
  if (env.GROQ_API_KEY) list.push({ provider: 'groq', key: env.GROQ_API_KEY, model: env.GROQ_MODEL || PROVIDERS.groq.defaultModel });
  if (env.GEMINI_API_KEY) list.push({ provider: 'gemini', key: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || PROVIDERS.gemini.defaultModel });
  return list;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const list = providersFromEnv();
  if (!list.length) { res.status(503).json({ error: 'The built-in AI isn’t set up on this site yet.' }); return; }
  const token = String((req.headers && req.headers.authorization) || '').replace(/^Bearer\s+/i, '');
  const sub = token && await whoIs(token).catch(() => null);
  if (!sub) { res.status(401).json({ error: 'Sign in again to use the built-in AI.' }); return; }
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  if (!TASKS.has(b.task) || typeof b.prompt !== 'string' || !b.prompt || b.prompt.length > MAX_PROMPT) { res.status(400).json({ error: 'bad request' }); return; }
  if (!useAllowance(sub)) { res.status(429).json({ error: 'Today’s free AI allowance is used up. It resets at midnight (UTC), or add your own free key in Settings.' }); return; }
  try {
    res.status(200).json({ result: await askWith(list, b.prompt, !!b.json) });
  } catch (e) {
    res.status(e && e.retryable ? 503 : 502).json({ error: 'The AI didn’t answer. Try again in a minute.' });
  }
}
