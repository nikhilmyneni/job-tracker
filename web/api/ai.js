/**
 * Vercel function (free plan): the built-in AI, so users don't need their own key.
 * The site owner's free keys live in environment variables (GROQ_API_KEY, GEMINI_API_KEY; optional GROQ_MODEL,
 * GEMINI_MODEL, AI_DAILY_LIMIT). Only signed-in Job Hunter users can call it: the Google access token must have
 * been issued to our OAuth client. The text passes straight through to the AI provider and back. Nothing is
 * stored or logged.
 *   POST /api/ai  { task: 'classify'|'extract'|'cv', prompt, json }  →  { result }
 */
import { askWith, PROVIDERS } from '../js/ai.js';
import { userFrom, allowance } from './_auth.js';

const TASKS = new Set(['classify', 'extract', 'cv']);
const MAX_PROMPT = 40000;
const allow = allowance(Number(process.env.AI_DAILY_LIMIT) || 80);

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
  const sub = await userFrom(req);
  if (!sub) { res.status(401).json({ error: 'Sign in again to use the built-in AI.' }); return; }
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  if (!TASKS.has(b.task) || typeof b.prompt !== 'string' || !b.prompt || b.prompt.length > MAX_PROMPT) { res.status(400).json({ error: 'bad request' }); return; }
  if (!allow(sub)) { res.status(429).json({ error: 'Today’s free AI allowance is used up. It resets at midnight (UTC); everything else keeps working.' }); return; }
  try {
    res.status(200).json({ result: await askWith(list, b.prompt, !!b.json) });
  } catch (e) {
    res.status(e && e.retryable ? 503 : 502).json({ error: 'The AI didn’t answer. Try again in a minute.' });
  }
}
