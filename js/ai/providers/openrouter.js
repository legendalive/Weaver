/* =========================================================
   Weaver — js/ai/providers/openrouter.js
   Step 16: OpenRouter adapter.
   Contract: listModels / testKey / streamChat.
   Free-tier filter: prompt & completion pricing both zero.
   ========================================================= */

import { forEachSSEData } from './sse.js';

const BASE = 'https://openrouter.ai/api/v1';

function extraHeaders() {
  return {
    'HTTP-Referer': location.origin,
    'X-Title': 'Weaver',
  };
}

async function err(res) {
  const e = await res.json().catch(() => null);
  return new Error(e?.error?.message || `OpenRouter HTTP ${res.status}`);
}

const openrouter = {
  id: 'openrouter',
  label: 'OpenRouter',
  keyUrl: 'https://openrouter.ai/settings/keys',

  /* Runtime discovery — free models only, zero hardcoding. */
  async listModels(apiKey) {
    const headers = { ...extraHeaders() };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const res = await fetch(`${BASE}/models`, { headers });
    if (!res.ok) throw await err(res);
    const json = await res.json();
    return (json.data || [])
      .filter((m) => {
        const p = m.pricing || {};
        return parseFloat(p.prompt || '0') === 0 && parseFloat(p.completion || '0') === 0;
      })
      .map((m) => ({
        id: m.id,
        name: m.name || m.id,
        created: m.created || 0,
        contextLength: m.context_length || null,
        free: true,
        meta: m,
      }));
  },

  async testKey(apiKey) {
    try {
      const res = await fetch(`${BASE}/key`, {
        headers: { Authorization: `Bearer ${apiKey}`, ...extraHeaders() },
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
        ...extraHeaders(),
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

export default openrouter;
