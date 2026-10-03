/* =========================================================
   Weaver — js/panels/ai-output.js
   Step 22: AI Output actions — Accept / Rewrite / Discard.
   - Acts on the ACTIVE block (click to select) or the newest.
   - Accept: block text -> Main Novel (once per block).
   - Rewrite: resend identical prompt + context.
   - Discard: abort if streaming, remove block.
   ========================================================= */

import { el, toast } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { getState, touchProject } from '../core/state.js';
import { getAiBlocks, rerunBlock } from '../features/scribe.js';

const STYLE_ID = 'ai-output-style';
const CSS = `
.ai-block{cursor:pointer;}
.ai-block.is-active{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent);}
.ai-block.is-accepted{opacity:.72;}
`;

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
}

let bound = false;

export function initAiOutput() {
  ensureStyle();
  if (bound) return;
  bound = true;

  /* Click any block to make it the active target */
  document.addEventListener('click', (e) => {
    const body = e.target.closest('.panel[data-panel="ai"] .panel-body');
    if (!body) return;
    const blockEl = e.target.closest('.ai-block');
    if (!blockEl) return;
    if (e.target.closest('button')) return; // ignore stop-button clicks
    setActive(blockEl);
  });
}

function setActive(blockEl) {
  document.querySelectorAll('.ai-block.is-active').forEach((n) => {
    if (n !== blockEl) n.classList.remove('is-active');
  });
  blockEl.classList.add('is-active');
}

function targetBlock() {
  const blocks = getAiBlocks().filter((b) => b.el.isConnected);
  if (!blocks.length) return null;
  return blocks.find((b) => b.el.classList.contains('is-active')) || blocks[blocks.length - 1];
}

/* ---------- Accept ---------- */
export function acceptAiBlock() {
  const block = targetBlock();
  if (!block) { toast('No AI output to accept yet.', 'info'); return; }
  if (!block.done) { toast('Wait for generation to finish (or stop it) first.', 'info'); return; }
  if (block.accepted) { toast('This block was already accepted.', 'info'); return; }

  const project = getState().project;
  if (!project) return;
  const text = (block.full || '').trim();
  if (!text) { toast('Nothing to accept in this block.', 'info'); return; }

  const novel = project.mainNovel.text || '';
  project.mainNovel.text = novel ? novel + '\n\n' + text : text;
  block.accepted = true;
  block.el.classList.add('is-accepted');
  block.badge.textContent = (block.provider ? `${block.provider.providerLabel} · ` : '') + 'accepted';
  touchProject({ novel: true });
  toast('Generation accepted into Main Novel.', 'success');
}

/* ---------- Rewrite ---------- */
export function rewriteAiBlock() {
  const block = targetBlock();
  if (!block) { toast('No AI output to rewrite yet.', 'info'); return; }
  block.accepted = false;
  block.el.classList.remove('is-accepted');
  setActive(block.el);
  rerunBlock(block);
  toast('Resending prompt + context to Scribe…', 'info');
}

/* ---------- Discard ---------- */
export function discardAiBlock() {
  const block = targetBlock();
  if (!block) { toast('No AI output to discard.', 'info'); return; }
  if (block.controller && !block.done) block.controller.abort();

  const registry = getAiBlocks();
  const idx = registry.indexOf(block);
  if (idx >= 0) registry.splice(idx, 1);
  block.el.remove();

  const body = document.querySelector('.panel[data-panel="ai"] .panel-body');
  if (body && !registry.length) {
    body.appendChild(el('div', { class: 'empty-state' }, [
      icon('sparkles', 'icon-lg'),
      el('p', { text: 'AI generations will appear here.' }),
    ]));
  }
  toast('Block discarded.', 'success');
}
