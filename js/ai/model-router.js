/* =========================================================
   Weaver — js/ai/model-router.js
   Step 18 + Patch: Dynamic model router.
   - Blacklists models requiring TOS (orpheus) or deprecated (2.5).
   - Boosts latest creative models (gemini-3, gemini-2.0, qwen).
   ========================================================= */

function scoreModel(model) {
  let score = 0;
  const id = (model.id || '').toLowerCase();
  const name = (model.name || '').toLowerCase();
  const combined = `${id} ${name}`;

  // Creative / Instruct / Story keywords (high bonus)
  const creativeKeywords = [
    'instruct', 'chat', 'story', 'writer', 'creative', 'mytho', 'lumimaid',
    'airoboros', 'midnight', 'miqu', 'noromaid', 'dolphin', 'openhermes',
    'wizard', 'zephyr', 'nous', 'capricorn', 'mahou', 'psyfighter', 'hermes',
    'roleplay', 'rp', 'fiction', 'novel', 'command-r', 
    'gemini-3', 'gemini-2.0', '3.8', '2.0-flash', 'qwen', 'llama-3'
  ];
  for (const kw of creativeKeywords) {
    if (combined.includes(kw)) score += 500;
  }

  // Penalize non-text, highly specialized, or API-problematic models
  const penalizeKeywords = [
    'orpheus', '2.5-flash', 'gemini-2.5', 'code', 'math', 'embed', 'vision', 
    'audio', 'moderation', 'speech', 'tts', 'whisper', 'rerank', 'guard'
  ];
  for (const kw of penalizeKeywords) {
    if (combined.includes(kw)) score -= 1000;
  }

  // Context length bonus (up to 200 points for 200k context)
  if (model.contextLength) {
    score += Math.min(model.contextLength / 1000, 200);
  }

  // Recency bonus
  if (model.created) {
    score += (model.created / 1e8); 
  }

  return score;
}

export function selectBestModel(models) {
  if (!models || !models.length) return null;
  let best = null;
  let bestScore = -Infinity;
  for (const m of models) {
    const s = scoreModel(m);
    if (s > bestScore) {
      bestScore = s;
      best = m;
    }
  }
  return best;
}

export function sortModelsByFitness(models) {
  if (!models) return [];
  return [...models].sort((a, b) => scoreModel(b) - scoreModel(a));
}
