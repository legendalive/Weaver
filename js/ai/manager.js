/* =========================================================
   Weaver — js/ai/manager.js
   Step 19: 4-Tier Fallback Manager.
   Orchestrates the AI providers (Groq -> OpenRouter -> Gemini -> Mistral).
   Automatically discovers models, selects the best creative model,
   and silently fails over to the next provider on any API error.
   ========================================================= */

import groq from './providers/groq.js';
import openrouter from './providers/openrouter.js';
import gemini from './providers/gemini.js';
import mistral from './providers/mistral.js';
import { selectBestModel } from './model-router.js';
import { getState } from '../core/state.js';

const PROVIDER_MAP = { groq, openrouter, gemini, mistral };

/* Returns a map of provider configs from settings */
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

/**
 * Attempts to stream a chat completion across the fallback chain.
 * @param {Object} opts - { messages, onToken, onProviderSwitch, signal }
 * @returns {Promise<string>} - The full generated text.
 */
export async function streamChatWithFallback(opts) {
  const { messages, onToken, onProviderSwitch, signal } = opts;
  const available = await getAvailableProviders();

  if (!available.length) {
    throw new Error('No AI providers configured. Please add an API key in Settings.');
  }

  let lastError = null;

  for (const provider of available) {
    const apiKey = getProviderConfigs()[provider.id].key;
    
    try {
      // 1. Discover models live from the provider
      const models = await provider.listModels(apiKey);
      if (!models || !models.length) {
        throw new Error(`No models available from ${provider.label}.`);
      }

      // 2. Select best model for creative writing
      const bestModel = selectBestModel(models);
      if (!bestModel) {
        throw new Error(`Could not select a valid model for ${provider.label}.`);
      }

      // 3. Notify UI of provider/model switch (used in Step 22 to show badges)
      if (onProviderSwitch) {
        onProviderSwitch({ 
          provider: provider.id, 
          providerLabel: provider.label, 
          model: bestModel.id 
        });
      }

      // 4. Attempt to stream
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

      // Success! Return the result.
      return fullText;

    } catch (err) {
      console.warn(`[AI Manager] ${provider.label} failed: ${err.message}. Trying next provider...`);
      lastError = err;
      // Continue loop to try the next provider
    }
  }

  // All providers failed
  throw new Error(`All AI providers failed. Last error: ${lastError?.message || 'Unknown error'}`);
}

export async function testAllProviders() {
  // Helper for Settings UI (Step 20) to run a batch test
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
