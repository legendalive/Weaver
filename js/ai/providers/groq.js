/* =========================================================
   Weaver — js/ai/providers/groq.js
   Step 16: Groq adapter (OpenAI-compatible endpoints).
   Contract: listModels / testKey / streamChat.
   ========================================================= */

import { forEachSSEData } from './sse.js';

const BASE = 'https://api.groq.com/openai/v1';

async function err(res) {
  const e = await res.json().catch(() => null);
  return new Error(e?.error?.message || `Groq HTTP ${res.status}`);
}

const groq = {
  id: 'groq',
  label: 'Groq',
  keyUrl: 'https://console.groq.com/keys',

  /* Runtime discovery — no hardcoded models. Groq inference
     runs on free-tier quotas, so every listed model qualifies. */
  async listModels(apiKey) {
    const res = await fetch(`${BASE}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw await err(res);
    const json = await res.json();
    return (json.data || [])
      .filter((m) => !m.deprecated)
      .map((m) => ({
        id: m.id,
        name: m.id,
        created: m.created || 0,
        contextLength: m.context_window || null,
        free: true,
        meta: m,
      }));
  },

  async testKey(apiKey) {
    try {
      const res = await fetch(`${BASE}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) return { ok: true, message: 'Connection successful.' };
      const e = await res.json().catch(() => null);
      return { ok: false, message: e?.error?.message || `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, message: e.message || 'Network error.' };
    }
  },

  async streamChat({ apiKey, model, messages, temperature = 0.85, maxTokens = 2048, signal, onToken }) {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, messages, stream: true, temperature, max_tokens: maxTokens }),
    });
    if (!res.ok) throw await err(res);

    let full = '';
    await forEachSSEData(res, (json) => {
      const delta = json.choices?.[0]?.delta?.content;
      if (delta) {
        full += delta;
        if (onToken) onToken(delta, full);
      }
    });
    return full;
  },
};

export default groq;
