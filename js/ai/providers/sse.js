/* =========================================================
   Weaver — js/ai/providers/sse.js
   Step 16: shared Server-Sent-Events reader for OpenAI-style
   streaming endpoints (Groq, OpenRouter, Mistral).
   Calls onJSON(parsed) for every `data:` payload; stops at
   `data: [DONE]` or stream end. Keep-alives are ignored.
   ========================================================= */

export async function forEachSSEData(response, onJSON) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      if (payload === '[DONE]') return;
      try {
        onJSON(JSON.parse(payload));
      } catch {
        /* ignore malformed keep-alive chunks */
      }
    }
  }
}
