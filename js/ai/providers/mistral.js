/* =========================================================
   Weaver — js/ai/providers/mistral.js
   Step 17: Mistral AI adapter (OpenAI-compatible endpoints).
   Contract: listModels / testKey / streamChat.
   ========================================================= */

import { forEachSSEData } from './sse.js';

const BASE = 'https://api.mistral.ai/v1';

async function err(res) {
  const e = await res.json().catch(() => null);
  return new Error(e?.message || e?.error?.message || `Mistral HTTP ${res.status}`);
}

const mistral = {
  id: 'mistral',
  label: 'Mistral AI',
  keyUrl: 'https://console.mistral.ai/api-keys/',

  /* Runtime discovery — lists all models available to the key. */
  async listModels(apiKey) {
    const res = await fetch(`${BASE}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw await err(res);
    const json = await res.json();
    return (json.data || []).map((m) => ({
      id: m.id,
      name: m.name || m.id,
      created: m.created || 0,
      contextLength: null,
      free: true, // Treat all as available (Mistral uses trial credits)
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
      return { ok: false, message: e?.message || e?.error?.message || `HTTP ${res.status}` };
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
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature,
        max_tokens: maxTokens,
      }),
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

export default mistral;
