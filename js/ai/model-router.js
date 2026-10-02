/* =========================================================
   Weaver — js/ai/model-router.js
   Step 18: Dynamic model router.
   - Zero hardcoded model strings.
   - Scores discovered models for creative-writing fitness
     using name heuristics, context length, and recency.
   - selectBestModel(models) returns the highest-scoring
     candidate (or the newest if no creative signals are found).
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
    'roleplay', 'rp', 'fiction', 'novel', 'command-r'
  ];
  for (const kw of creativeKeywords) {
    if (combined.includes(kw)) score += 500;
  }

  // Penalize non-text or highly specialized models
  const penalizeKeywords = [
    'code', 'math', 'embed', 'vision', 'audio', 'moderation',
    'speech', 'tts', 'whisper', 'rerank'
  ];
  for (const kw of penalizeKeywords) {
    if (combined.includes(kw)) score -= 1000;
  }

  // Context length bonus (up to 200 points for 200k context)
  if (model.contextLength) {
    score += Math.min(model.contextLength / 1000, 200);
  }

  // Recency bonus (timestamp is usually in seconds, e.g., 1700000000)
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
