/* =========================================================
   Weaver — js/features/scribe.js
   Step 21: Scribe — prompt bundling + token-efficient bible
   compiler + live streaming into the AI Output panel.
   - Desktop: rebuilds the top-bar prompt bar (conflict-free).
   - Mobile: floating action button + prompt sheet.
   - compileBible(): priority-budgeted compact payload.
   - Block registry for Step 22 (Accept/Rewrite/Discard).
   ========================================================= */

import { el, clear, toast, modal } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { getState, subscribe } from '../core/state.js';
import { getEffectiveConfig } from '../core/storage.js';
import { getManuscriptSelection } from '../panels/manuscript.js';
import { streamChatWithFallback } from '../ai/manager.js';

const STYLE_ID = 'scribe-style';
const CSS = `
.scribe-fab{position:fixed;right:16px;bottom:16px;z-index:80;display:none;
  width:52px;height:52px;border-radius:50%;background:var(--accent);color:#17130a;
  border:none;align-items:center;justify-content:center;box-shadow:var(--shadow-2);cursor:pointer;}
@media (max-width:860px){ .scribe-fab{display:flex; } }
.panel[data-panel="ai"] .panel-body{padding:12px;display:flex;flex-direction:column;gap:10px;}
.ai-block{display:flex;flex-direction:column;gap:8px;padding:12px;
  border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-2);}
.ai-block-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.ai-block-body{font-family:var(--font-prose);
  font-size:calc(.95rem * var(--font-scale,1));line-height:1.7;
  white-space:pre-wrap;overflow-wrap:break-word;}
.ai-block.is-streaming .ai-block-body::after{content:'▍';color:var(--accent);
  animation:scribe-blink 1s steps(2) infinite;}
@keyframes scribe-blink{50%{opacity:0;}}
.ai-block.is-error{border-color:var(--danger);}
.scribe-sheet-hint{font-size:.74rem;color:var(--faint);}
`;

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
}

const BIBLE_BUDGET = 6000;  // chars (~1.5k tokens) hard cap
const CONTEXT_CAP = 8000;   // chars of highlighted text
const SECTION_TAGS = {
  characters: 'CHAR', settings: 'PLACE', plotArcs: 'PLOT',
  worldRules: 'RULE', items: 'ITEM',
};

let fab = null;
const blocks = [];

export function getAiBlocks() { return blocks; }

function cap(s, n) { return s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s; }
function flat(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

/* ---------- Token-efficient bible compiler ---------- */
export function compileBible(cfg, contextText, budget = BIBLE_BUDGET) {
  const ctx = (contextText || '').toLowerCase();
  const wordSet = new Set(ctx.split(/[^a-z0-9']+/).filter((w) => w.length > 2));
  const out = [];
  let used = 0;
  const push = (line) => {
    if (!line || used + line.length > budget) return;
    out.push(line);
    used += line.length + 1;
  };

  const directives = flat(cfg.generalAiInstructions);
  if (directives) push('[DIRECTIVES] ' + cap(directives, 1200));
  const style = flat(cfg.generalProse);
  if (style) push('[STYLE] ' + cap(style, 600));

  const roster = [];
  for (const key of Object.keys(SECTION_TAGS)) {
    const matched = [];
    for (const e of (cfg[key] || [])) {
      const name = (e.name || '').trim();
      const nameLc = name.toLowerCase();
      const hit = nameLc && (
        ctx.includes(nameLc) ||
        nameLc.split(/\s+/).some((w) => w.length > 2 && wordSet.has(w))
      );
      if (hit) matched.push(e);
      else if (name) roster.push(`${SECTION_TAGS[key]}:${name}`);
    }
    for (const e of matched) {
      push(`[${SECTION_TAGS[key]}] ${e.name}: ${cap(flat(e.body), 250)}`);
    }
  }
  if (roster.length) push(cap('[ROSTER] ' + roster.join(', '), Math.max(0, budget - used)));
  return out.join('\n');
}

function buildMessages(compiled, context, prompt) {
  let system = 'You are Scribe, an elite ghostwriter collaborating on a novel. ' +
    'Respond in polished, publication-ready prose. Never contradict the project bible. ' +
    'Follow style directives strictly.';
  if (compiled) system += `\n\nPROJECT BIBLE (compact):\n${compiled}`;

  const parts = [];
  if (context) parts.push(`HIGHLIGHTED MANUSCRIPT TEXT:\n"""\n${cap(context, CONTEXT_CAP)}\n"""`);
  parts.push(`INSTRUCTION:\n${prompt}`);
  parts.push('Reply with the requested prose only — no meta commentary.');
  return [
    { role: 'system', content: system },
    { role: 'user', content: parts.join('\n\n') },
  ];
}

/* ---------- AI Output blocks ---------- */
function createBlock(prompt, context) {
  const body = document.querySelector('.panel[data-panel="ai"] .panel-body');
  if (!body) return null;
  const empty = body.querySelector('.empty-state');
  if (empty) empty.remove();

  const badge = el('span', { class: 'badge badge-accent', text: 'connecting…' });
  const stopBtn = el('button', {
    class: 'btn btn-ghost btn-icon btn-sm', title: 'Stop generation',
  }, [icon('x', 'icon-sm')]);
  const head = el('div', { class: 'ai-block-head' }, [badge, stopBtn]);
  const textEl = el('div', { class: 'ai-block-body' });
  const blockEl = el('div', { class: 'ai-block is-streaming' }, [head, textEl]);
  body.appendChild(blockEl);
  body.scrollTop = body.scrollHeight;

  const block = {
    id: 'b' + Date.now() + Math.random().toString(36).slice(2, 6),
    el: blockEl, badge, textEl, stopBtn,
    prompt, context, provider: null, full: '', controller: null, done: false,
  };
  stopBtn.onclick = () => { if (block.controller) block.controller.abort(); };
  blocks.push(block);
  return block;
}

function streamInto(block) {
  const project = getState().project;
  if (!project) return;
  const cfg = getEffectiveConfig(project);
  const compiled = compileBible(cfg, `${block.context} ${block.prompt}`);
  const messages = buildMessages(compiled, block.context, block.prompt);

  block.controller = new AbortController();
  block.done = false;
  block.full = '';
  block.el.classList.add('is-streaming');
  block.el.classList.remove('is-error');
  clear(block.textEl);
  block.badge.textContent = 'connecting…';
  block.stopBtn.hidden = false;

  streamChatWithFallback({
    messages,
    signal: block.controller.signal,
    onProviderSwitch: (info) => {
      block.provider = info;
      block.badge.textContent = `${info.providerLabel} · ${info.model}`;
    },
    onToken: (delta, full) => {
      block.full = full;
      block.textEl.textContent = full;
      const body = block.el.parentElement;
      if (body) body.scrollTop = body.scrollHeight;
    },
  }).then(() => {
    block.done = true;
    block.el.classList.remove('is-streaming');
    block.stopBtn.hidden = true;
  }).catch((err) => {
    block.done = true;
    block.el.classList.remove('is-streaming');
    block.stopBtn.hidden = true;
    if (err.name === 'AbortError') {
      block.badge.textContent = (block.provider ? `${block.provider.providerLabel} · ` : '') + 'stopped';
    } else {
      block.el.classList.add('is-error');
      block.badge.textContent = 'error';
      block.textEl.textContent = '⚠ ' + err.message;
      toast('Scribe generation failed: ' + err.message, 'danger');
    }
  });
}

export function runScribePrompt(prompt) {
  const p = (prompt || '').trim();
  if (!p) { toast('Type an instruction for Scribe first.', 'info'); return; }
  if (!getState().project) return;
  const sel = getManuscriptSelection();
  const context = sel ? sel.text : '';
  const block = createBlock(p, context);
  if (!block) return;
  streamInto(block);
}

export function rerunBlock(block) { streamInto(block); }

/* ---------- Prompt bar (desktop) + FAB/sheet (mobile) ---------- */
function buildBar() {
  const input = el('input', {
    class: 'input', type: 'text',
    placeholder: 'Scribe: write, continue, describe, rewrite…',
  });
  const send = el('button', {
    class: 'btn btn-ghost btn-icon', title: 'Send to Scribe',
  }, [icon('send')]);
  const bar = el('div', { class: 'scribe-bar', dataset: { scribeBound: '1' } }, [input, send]);
  const fire = () => { runScribePrompt(input.value); input.value = ''; };
  send.addEventListener('click', fire);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') fire(); });
  return bar;
}

function bindDesktop() {
  const old = document.querySelector('.scribe-bar');
  if (old && !old.dataset.scribeBound) old.replaceWith(buildBar());
}

function openPromptSheet() {
  const sel = getManuscriptSelection();
  const ta = el('textarea', {
    class: 'textarea', rows: '4',
    placeholder: 'e.g. Rewrite the highlighted passage in third person, past tense…',
  });
  const hint = el('p', {
    class: 'scribe-sheet-hint',
    text: sel
      ? `Bundling ${sel.text.length.toLocaleString()} characters of highlighted Manuscript text with this prompt.`
      : 'No text highlighted — Scribe will follow the instruction using the project bible only.',
  });
  const m = modal({
    title: 'Scribe',
    body: [hint, ta],
    footer: [
      el('button', { class: 'btn', text: 'Cancel', onclick: () => m.close() }),
      el('button', {
        class: 'btn btn-primary', text: 'Generate',
        onclick: () => { const v = ta.value; m.close(); runScribePrompt(v); },
      }),
    ],
  });
  setTimeout(() => ta.focus(), 60);
}

export function initScribe() {
  ensureStyle();
  if (!fab) {
    fab = el('button', {
      class: 'scribe-fab', title: 'Scribe', 'aria-label': 'Open Scribe',
      onclick: openPromptSheet,
    }, [icon('feather', 'icon-lg')]);
    document.body.appendChild(fab);
  }
  bindDesktop();
  subscribe((state, change) => {
    if (state.view !== 'workspace') return;
    if (change.view || (change.project && !change.silent)) bindDesktop();
  });
}
