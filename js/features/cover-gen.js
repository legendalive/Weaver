/* =========================================================
Weaver — js/features/cover-gen.js
V4: AI Cover Generation.
Uses Config Bible + Plot Builder as prompt context.
Streams cover concepts via the existing ai-proxy (Scribe
provider chain). Renders image prompts + style suggestions
the owner can feed into any image generator.
Pro-gated. Self-styled module.
========================================================= */
import { el, clear, toast, modal } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { getState } from '../core/state.js';
import { getEffectiveConfig } from '../core/storage.js';
import { streamChatWithFallback } from '../ai/manager.js';
import { isPro, isKnownFree } from '../core/entitlements.js';

const STYLE_ID = 'cover-gen-style';
const CSS = `
.cg-wrap{display:flex;flex-direction:column;gap:14px;}
.cg-prompt-box{padding:12px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-2);font-family:var(--font-mono);font-size:.78rem;line-height:1.6;color:var(--muted);white-space:pre-wrap;max-height:180px;overflow-y:auto;}
.cg-output{display:flex;flex-direction:column;gap:12px;}
.cg-card{padding:14px;border:1px solid var(--border-strong);border-radius:var(--radius-md);background:var(--surface-2);}
.cg-card-head{font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);font-weight:650;margin-bottom:6px;}
.cg-card-body{font-size:.85rem;line-height:1.65;color:var(--text);white-space:pre-wrap;}
.cg-card-actions{display:flex;gap:6px;margin-top:8px;}
.cg-hint{font-size:.72rem;color:var(--faint);line-height:1.5;}
.cg-streaming::after{content:'▍';color:var(--accent);animation:cg-blink 1s steps(2) infinite;}
@keyframes cg-blink{50%{opacity:0;}}
`;

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
}

/* ---------- Prompt compiler ---------- */
function compileCoverPrompt(project) {
  const cfg = getEffectiveConfig(project);
  const plot = project.plot || {};
  const parts = [];

  parts.push(`BOOK: "${project.bookTitle || project.name || 'Untitled'}"`);
  if (project.seriesName) parts.push(`SERIES: ${project.seriesName}`);

  if (plot.premise && plot.premise.trim()) {
    parts.push(`\nPREMISE:\n${plot.premise.trim().slice(0, 600)}`);
  }

  const chars = (cfg.characters || []).slice(0, 5);
  if (chars.length) {
    parts.push('\nKEY CHARACTERS:');
    for (const c of chars) {
      parts.push(`- ${c.name}: ${(c.body || '').slice(0, 120)}`);
    }
  }

  const settings = (cfg.settings || []).slice(0, 3);
  if (settings.length) {
    parts.push('\nKEY SETTINGS:');
    for (const s of settings) {
      parts.push(`- ${s.name}: ${(s.body || '').slice(0, 100)}`);
    }
  }

  if (cfg.generalProse && cfg.generalProse.trim()) {
    parts.push(`\nPROSE STYLE: ${cfg.generalProse.trim().slice(0, 200)}`);
  }

  return parts.join('\n');
}

const SYSTEM_PROMPT = `You are a professional book cover designer and art director. Given a novel's details, generate THREE distinct cover concepts. For each concept provide:
1. CONCEPT TITLE (2-3 words)
2. VISUAL DESCRIPTION (what the viewer sees — composition, colors, mood, typography placement)
3. IMAGE GENERATION PROMPT (a single detailed prompt ready to paste into Midjourney, DALL-E, or Stable Diffusion)
4. STYLE TAGS (3-5 keywords: e.g. "dark fantasy, oil painting, moody")

Format each concept clearly with numbered headers. Be specific about color palettes, composition, and mood. Avoid generic descriptions. Output ONLY the three concepts, no preamble.`;

/* ---------- UI ---------- */
export function openCoverGenerator() {
  ensureStyle();
  const project = getState().project;
  if (!project) { toast('Open a project first.', 'info'); return; }

  if (isKnownFree()) {
    toast('Cover generation is a Pro feature. Upgrade in Settings.', 'info');
    return;
  }

  const compiled = compileCoverPrompt(project);
  const promptBox = el('div', { class: 'cg-prompt-box', text: compiled });
  const outputHost = el('div', { class: 'cg-output' });
  const generateBtn = el('button', {
    class: 'btn btn-primary',
    onclick: () => runGeneration(compiled, outputHost, generateBtn),
  }, [icon('sparkles', 'icon-sm'), el('span', { text: 'Generate Cover Concepts' })]);

  const m = modal({
    title: 'Cover Generation',
    size: 'lg',
    body: [
      el('div', { class: 'cg-wrap' }, [
        el('p', { class: 'cg-hint', text: 'Based on your Config Bible and Plot Builder. Copy any image prompt below into Midjourney, DALL-E, or your preferred image generator.' }),
        el('div', { class: 'field' }, [
          el('span', { class: 'field-label', text: 'Story Context Sent to AI' }),
          promptBox,
        ]),
        generateBtn,
        outputHost,
      ]),
    ],
    footer: [el('button', { class: 'btn btn-primary', text: 'Done', onclick: () => m.close() })],
  });
}

async function runGeneration(compiled, host, btn) {
  clear(host);
  btn.disabled = true;
  btn.textContent = 'Generating…';

  const streamingCard = el('div', { class: 'cg-card cg-streaming' }, [
    el('div', { class: 'cg-card-head', text: 'AI Response' }),
    el('div', { class: 'cg-card-body', text: '' }),
  ]);
  host.appendChild(streamingCard);
  const bodyEl = streamingCard.querySelector('.cg-card-body');

  let full = '';
  try {
    await streamChatWithFallback({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: compiled },
      ],
      onToken: (_delta, accumulated) => {
        full = accumulated;
        bodyEl.textContent = full;
      },
    });
  } catch (e) {
    bodyEl.textContent = '⚠ ' + e.message;
    toast('Cover generation failed: ' + e.message, 'danger');
  } finally {
    streamingCard.classList.remove('cg-streaming');
    btn.disabled = false;
    btn.textContent = 'Regenerate';

    /* Add copy buttons for each numbered concept */
    if (full.trim()) {
      const concepts = full.split(/\n(?=\d+\.)/).filter((s) => s.trim());
      if (concepts.length > 1) {
        const actionsRow = el('div', { class: 'cg-card-actions' });
        actionsRow.appendChild(el('button', {
          class: 'btn btn-sm',
          text: 'Copy All',
          onclick: () => {
            navigator.clipboard.writeText(full).then(
              () => toast('All concepts copied.', 'success'),
              () => toast('Could not copy.', 'danger')
            );
          },
        }));
        streamingCard.appendChild(actionsRow);
      }
    }
  }
}
