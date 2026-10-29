/**
 * AI providers, each with the user's own free key. Calls go straight from the browser to the provider.
 * Providers are tried in the user's order; when one is out of quota (429) or down, the next one runs.
 */
export const PROVIDERS = {
  gemini: {
    label: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyHint: 'aistudio.google.com/apikey → Create API key',
    defaultModel: 'gemini-flash-latest',
    note: 'Best quality on the free tier and a very long context. Google may use free-tier data to improve its products.',
  },
  groq: {
    label: 'Groq',
    keyUrl: 'https://console.groq.com/keys',
    keyHint: 'console.groq.com/keys → Create API key',
    defaultModel: 'openai/gpt-oss-120b',
    note: 'Very fast, with a large daily free allowance per model. A good backup when Gemini runs out.',
  },
  openrouter: {
    label: 'OpenRouter',
    keyUrl: 'https://openrouter.ai/settings/keys',
    keyHint: 'openrouter.ai/settings/keys → Create key (pick a model ending in :free)',
    defaultModel: '',
    note: 'One key for many free models (names ending in :free). Low daily limit on a free account.',
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

async function callOnce(p, prompt, json) {
  let res;
  try {
    if (p.provider === 'gemini') {
      const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } };
      if (json) body.generationConfig.responseMimeType = 'application/json';
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(p.model)}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': p.key }, body: JSON.stringify(body),
      });
    } else {
      const url = p.provider === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
      const content = json ? prompt + '\n\nReply with JSON only, no prose and no code fences.' : prompt;
      const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + p.key };
      if (p.provider === 'openrouter') headers['X-Title'] = 'Job Hunter';
      res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ model: p.model, temperature: 0.2, messages: [{ role: 'user', content }] }) });
    }
  } catch (e) {
    throw new AiError(`${PROVIDERS[p.provider].label}: network error`, true);
  }
  const raw = await res.text();
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

/** The providers that have a key, in the user's order. */
export function activeProviders(settings) {
  return (settings.ai || []).filter(p => p.key && PROVIDERS[p.provider] && (p.model || PROVIDERS[p.provider].defaultModel))
    .map(p => ({ provider: p.provider, key: p.key, model: p.model || PROVIDERS[p.provider].defaultModel }));
}

export const hasAi = (settings) => activeProviders(settings).length > 0;

/**
 * Runs a prompt on the first provider that works. Retries a busy provider twice, then falls back.
 * onNote(text) reports fallbacks so the page can show them.
 */
export async function ask(settings, prompt, json, onNote) {
  const list = activeProviders(settings);
  if (!list.length) throw new AiError('Add a free AI key in Settings first.', false);
  let last;
  for (let i = 0; i < list.length; i++) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await callOnce(list[i], prompt, json); } catch (e) {
        last = e;
        if (!e.retryable) break;
        if (attempt < 2) await sleep(3000 * (attempt + 1));
      }
    }
    if (i + 1 < list.length && onNote) onNote(`${last.message}. Trying ${PROVIDERS[list[i + 1].provider].label}.`);
  }
  throw last;
}

/** Models this key can use now (free ones for OpenRouter), for the Settings picker. */
export async function listModels(provider, key) {
  if (provider === 'gemini') {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
    if (!res.ok) throw new AiError(`Key not accepted (${res.status}).`);
    const j = await res.json();
    return (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace(/^models\//, '')).filter(n => /gemini/.test(n) && !/embedding|image|tts|audio|live/.test(n)).sort();
  }
  const url = provider === 'groq' ? 'https://api.groq.com/openai/v1/models' : 'https://openrouter.ai/api/v1/models';
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + key } });
  if (!res.ok) throw new AiError(`Key not accepted (${res.status}).`);
  const j = await res.json();
  let ids = (j.data || []).map(m => m.id);
  if (provider === 'openrouter') ids = ids.filter(id => /:free$/.test(id));
  if (provider === 'groq') ids = ids.filter(id => !/whisper|tts|guard|playai|orpheus/i.test(id));
  return ids.sort();
}
