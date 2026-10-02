/* =========================================================
   Weaver — js/ai/providers/gemini.js
   Step 17: Google Gemini adapter.
   Translates OpenAI-style messages to Gemini's contents format.
   Contract: listModels / testKey / streamChat.
   ========================================================= */

import { forEachSSEData } from './sse.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

async function err(res) {
  const e = await res.json().catch(() => null);
  return new Error(e?.error?.message || `Gemini HTTP ${res.status}`);
}

const gemini = {
  id: 'gemini',
  label: 'Google Gemini',
  keyUrl: 'https://aistudio.google.com/app/apikey',

  /* Runtime discovery — filters for models supporting generateContent. */
  async listModels(apiKey) {
    const res = await fetch(`${BASE}/models?key=${apiKey}`);
    if (!res.ok) throw await err(res);
    const json = await res.json();
    return (json.models || [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => ({
        id: m.name.replace('models/', ''),
        name: m.displayName || m.name,
        created: 0,
        contextLength: m.inputTokenLimit || null,
        free: true, // Standard API keys get generous free tiers
        meta: m,
      }));
  },

  async testKey(apiKey) {
    try {
      const res = await fetch(`${BASE}/models?key=${apiKey}`);
      if (res.ok) return { ok: true, message: 'Connection successful.' };
      const e = await res.json().catch(() => null);
      return { ok: false, message: e?.error?.message || `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, message: e.message || 'Network error.' };
    }
  },

  async streamChat({ apiKey, model, messages, temperature = 0.85, maxTokens = 2048, signal, onToken }) {
    // Translate OpenAI messages -> Gemini contents
    let systemInstruction = null;
    const contents = [];
    
    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = { parts: [{ text: msg.content }] };
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
    }

    const body = {
      contents,
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    };
    if (systemInstruction) body.systemInstruction = systemInstruction;

    const res = await fetch(
      `${BASE}/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
      {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) throw await err(res);

    let full = '';
    await forEachSSEData(res, (json) => {
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        full += text;
        if (onToken) onToken(text, full);
      }
    });
    return full;
  },
};

export default gemini;
