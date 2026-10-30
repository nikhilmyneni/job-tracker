/**
 * AI is built in: the page calls our /api/ai function (useSharedAi), which uses the site's own free keys.
 * Users never add keys. askWith() runs on the server (api/ai.js): providers are tried in order, and when one
 * is out of quota (429) or down, the next runs. So this file must not touch window or the DOM.
 */
export const PROVIDERS = {
  gemini: {
    label: 'Google Gemini',
    defaultModel: 'gemini-flash-latest',
  },
  groq: {
    label: 'Groq',
    defaultModel: 'openai/gpt-oss-120b',
  },
  openrouter: {
    label: 'OpenRouter',
    defaultModel: '',
  },
};

export class AiError extends Error {
  constructor(msg, retryable) { super(msg); this.retryable = !!retryable; }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Parses a model's text as JSON, also when it is wrapped in prose or code fences, or as {items:[...]}. */
export function parseJsonLoose(text) {
  let v = null;
  const t = String(text || '').trim();
  try { v = JSON.parse(t); } catch (e) {
    const m = t.match(/[[{][\s\S]*[\]}]/);
    if (m) { try { v = JSON.parse(m[0]); } catch (e2) { v = null; } }
  }
  if (v && !Array.isArray(v) && typeof v === 'object') {
    const arrays = Object.values(v).filter(Array.isArray);
    if (arrays.length === 1 && Object.keys(v).length === 1) return arrays[0];
  }
  return v;
}

const CALL_MS = 20000; // one provider call; the whole askWith stays under the function's 60 s

async function callOnce(p, prompt, json) {
  let res;
  const signal = AbortSignal.timeout(CALL_MS);
  try {
    if (p.provider === 'gemini') {
      const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } };
      if (json) body.generationConfig.responseMimeType = 'application/json';
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(p.model)}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': p.key }, body: JSON.stringify(body), signal,
      });
    } else {
      const url = p.provider === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
      const content = json ? prompt + '\n\nReply with JSON only, no prose and no code fences.' : prompt;
      const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + p.key };
      if (p.provider === 'openrouter') headers['X-Title'] = 'Job Hunter';
      res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ model: p.model, temperature: 0.2, messages: [{ role: 'user', content }] }), signal });
    }
  } catch (e) {
    throw new AiError(`${PROVIDERS[p.provider].label}: ${e && e.name === 'TimeoutError' ? 'took too long' : 'network error'}`, true);
  }
  let raw;
  try { raw = await res.text(); } catch (e) { throw new AiError(`${PROVIDERS[p.provider].label}: took too long`, true); }
  if (!res.ok) {
    let msg = raw;
    try { const j = JSON.parse(raw); msg = (j.error && (j.error.message || j.error)) || raw; } catch (e) {}
    throw new AiError(`${PROVIDERS[p.provider].label} error ${res.status}: ${String(msg).slice(0, 200)}`, res.status === 429 || res.status >= 500);
  }
  const data = JSON.parse(raw);
  const text = p.provider === 'gemini'
    ? (((data.candidates || [])[0] || {}).content || { parts: [] }).parts.map(x => x.text || '').join('')
    : (((data.choices || [])[0] || {}).message || {}).content || '';
  return json ? parseJsonLoose(text) : text;
}

// The built-in AI: set by the app (a function that calls /api/ai).
let shared = null;
export function useSharedAi(caller) { shared = caller; }
export const hasAi = () => !!shared;

/** Runs a prompt on the built-in AI. task names the job for the server's allow-list (classify, extract, score, cv). */
export async function ask(settings, prompt, json, onNote, task = 'classify') {
  if (!shared) throw new AiError('AI isn’t available right now.', false);
  return shared(task, prompt, json);
}

/** Runs a prompt on the first provider in list that works. Retries a busy provider twice, then falls back. */
export async function askWith(list, prompt, json, onNote, budgetMs = 50000) {
  let last;
  const end = Date.now() + budgetMs;
  for (let i = 0; i < list.length; i++) {
    for (let attempt = 0; attempt < 3; attempt++) {
      // Out of time: stop rather than run past the function's limit (the page then uses the rules).
      if (Date.now() + 5000 > end) throw last || new AiError('The AI took too long.', true);
      try { return await callOnce(list[i], prompt, json); } catch (e) {
        last = e;
        if (!e.retryable) break;
        if (attempt < 2) await sleep(Math.min(3000 * (attempt + 1), Math.max(0, end - Date.now() - 5000)));
      }
    }
    if (i + 1 < list.length && onNote) onNote(`${last.message}. Trying ${PROVIDERS[list[i + 1].provider].label}.`);
  }
  throw last;
}
