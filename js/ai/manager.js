/* =========================================================
Weaver — js/ai/manager.js
Step 19 + V3.4b: 4-Tier Fallback Manager + Weaver AI Proxy.
Pro users are served by the Weaver AI proxy (owner's keys, zero
setup). Everyone else — or if the proxy is unavailable — falls
back to user-configured provider keys.
========================================================= */
import groq from './providers/groq.js';
import openrouter from './providers/openrouter.js';
import gemini from './providers/gemini.js';
import mistral from './providers/mistral.js';
import { selectBestModel } from './model-router.js';
import { getState } from '../core/state.js';
import { isPro } from '../core/entitlements.js';
import { getSupabaseClient } from '../core/supabase.js';
import { forEachSSEData } from './providers/sse.js';

const PROVIDER_MAP = { groq, openrouter, gemini, mistral };
const PROXY_URL = 'https://hiqmvhkwuvvgalqxxtbc.functions.supabase.co/ai-proxy';

function getProviderConfigs() {
  return getState().settings.ai.providers;
}
function getFallbackOrder() {
  return getState().settings.ai.fallbackOrder || ['groq', 'openrouter', 'gemini', 'mistral'];
}

export async function getAvailableProviders() {
  const configs = getProviderConfigs();
  const order = getFallbackOrder();
  return order
    .map(id => PROVIDER_MAP[id])
    .filter(p => p && configs[p.id]?.key && configs[p.id]?.enabled);
}

/* ---------- V3.4: Weaver AI proxy (owner's keys) ---------- */
async function getProxyToken() {
  try {
    const client = await getSupabaseClient();
    const { data } = await client.auth.getSession();
    return (data && data.session) ? data.session.access_token : '';
  } catch (e) { return ''; }
}

async function streamViaProxy({ messages, onToken, signal }) {
  const token = await getProxyToken();
  if (!token) throw new Error('You need to be signed in to use Weaver AI.');
  const gen = getState().settings.ai;
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({
      messages,
      temperature: gen.temperature ?? 0.85,
      maxTokens: gen.maxTokens ?? 2048,
    }),
  });
  if (!res.ok) {
    let msg = 'Weaver AI request failed.';
    try { const d = await res.json(); if (d && d.error) msg = d.error; } catch (e) {}
    if (res.status === 402) msg = 'AI needs Weaver Pro. Upgrade in Settings.';
    throw new Error(msg);
  }
  let full = '';
  await forEachSSEData(res, (json) => {
    const text = (json && json.choices && json.choices[0] && json.choices[0].delta)
      ? json.choices[0].delta.content : null;
    if (text) {
      full += text;
      if (onToken) onToken(text, full);
    }
  });
  return full;
}

export async function streamChatWithFallback(opts) {
  const { messages, onToken, onProviderSwitch, signal } = opts;

  /* V3.4: Pro users go through the Weaver proxy first (owner's keys). */
  if (isPro()) {
    try {
      if (onProviderSwitch) {
        onProviderSwitch({ provider: 'weaver', providerLabel: 'Weaver AI', model: 'proxy' });
      }
      return await streamViaProxy({ messages, onToken, signal });
    } catch (err) {
      console.warn('[AI Manager] Weaver proxy failed:', err.message, '— trying your own keys if configured.');
      /* fall through to user-configured providers */
    }
  }

  const available = await getAvailableProviders();
  if (!available.length) {
    if (isPro()) {
      throw new Error('Weaver AI is briefly unavailable. Please try again in a moment.');
    }
    throw new Error('No AI providers configured. Please add an API key in Settings.');
  }

  let lastError = null;
  for (const provider of available) {
    const apiKey = getProviderConfigs()[provider.id].key;
    try {
      const models = await provider.listModels(apiKey);
      if (!models || !models.length) {
        throw new Error(`No models available from ${provider.label}.`);
      }
      const bestModel = selectBestModel(models);
      if (!bestModel) {
        throw new Error(`Could not select a valid model for ${provider.label}.`);
      }
      if (onProviderSwitch) {
        onProviderSwitch({ provider: provider.id, providerLabel: provider.label, model: bestModel.id });
      }
      const gen = getState().settings.ai;
      const fullText = await provider.streamChat({
        apiKey,
        model: bestModel.id,
        messages,
        temperature: gen.temperature ?? 0.85,
        maxTokens: gen.maxTokens ?? 2048,
        signal,
        onToken,
      });
      return fullText;
    } catch (err) {
      console.warn(`[AI Manager] ${provider.label} failed: ${err.message}. Trying next provider...`);
      lastError = err;
    }
  }
  throw new Error(`All AI providers failed. Last error: ${lastError?.message || 'Unknown error'}`);
}

export async function testAllProviders() {
  const configs = getProviderConfigs();
  const results = {};
  for (const provider of Object.values(PROVIDER_MAP)) {
    const key = configs[provider.id]?.key;
    if (!key) {
      results[provider.id] = { ok: false, message: 'No API key provided.' };
      continue;
    }
    results[provider.id] = await provider.testKey(key);
  }
  return results;
}
