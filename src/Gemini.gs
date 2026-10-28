// ---------- Gemini (free tier, the user's own key) ----------
function gemini_(s, prompt, json) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(s.geminiModel)}:generateContent`;
  const payload = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } };
  if (json) payload.generationConfig.responseMimeType = 'application/json';
  let res;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), headers: { 'x-goog-api-key': s.geminiKey }, muteHttpExceptions: true });
    const code = res.getResponseCode();
    if (code === 429 || code >= 500) { Utilities.sleep(4000 * (attempt + 1)); continue; }
    break;
  }
  const code = res.getResponseCode();
  if (code !== 200) throw new Error(`Gemini error ${code}: ${clip_(res.getContentText(), 300)}`);
  const data = JSON.parse(res.getContentText());
  const text = (((data.candidates || [])[0] || {}).content || {}).parts ? data.candidates[0].content.parts.map(p => p.text || '').join('') : '';
  if (!json) return text;
  try { return JSON.parse(text); } catch (e) {
    const m = text.match(/[\[{][\s\S]*[\]}]/);
    return m ? JSON.parse(m[0]) : null;
  }
}

