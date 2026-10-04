/* =========================================================
   Weaver — js/features/scribe.js
   Step 21 + patches (v7): Scribe bundling + ALWAYS-VISIBLE
   quick prompts (pill row directly below the Scribe input).
   ========================================================= */

import { el, clear, toast, modal } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { getState, subscribe } from '../core/state.js';
import { getEffectiveConfig } from '../core/storage.js';
import {
  getManuscriptSelection,
  clearManuscriptSelection,
} from '../panels/manuscript.js';
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
.ms-block.is-bundled{background:rgba(224, 168, 60, 0.12);box-shadow:inset 3px 0 0 var(--accent);border-radius:4px;}
.scribe-bar{width:min(430px,38vw);display:flex;flex-direction:column;gap:4px;}
.scribe-row{display:flex;align-items:center;gap:6px;width:100%;}
.scribe-row .input{flex:1;min-width:0;}
.scribe-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;
  border:1px solid rgba(224,168,60,.5);background:var(--accent-soft);color:var(--accent);
  border-radius:999px;font-size:.68rem;font-family:var(--font-mono);cursor:pointer;flex:none;}
.scribe-chip[hidden]{display:none;}
.scribe-qp-row{display:flex;flex-wrap:wrap;gap:4px;}
.scribe-qp-row{flex-wrap:nowrap;width:100%;}
.scribe-qp-row .btn{font-size:.66rem;padding:2px 10px;border-radius:999px;
  flex:1 1 0;min-width:0;max-width:none;
  border:1px solid var(--border-strong);background:var(--surface-2);}
.scribe-qp-row .btn > span{display:block;min-width:0;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;}
.scribe-qp-row .btn:hover{border-color:rgba(224,168,60,.55);color:var(--accent);}
@media (max-width:860px){ .scribe-bar{display:none;} }
`;

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
}

const BIBLE_BUDGET = 6000;
const CONTEXT_CAP = 8000;

const STOP_WORDS = new Set(['the','a','an','and','or','but','of','to','in','on','at','by','for','with','from','as','is','was','were','be','been','being','his','her','its','their','your','our','my','it','he','she','they','you','we','that','this','these','those','there','here','when','then','than','so','if','else','not','no','yes','into','over','under','after','before','about','through','during','without','within','upon','will','would','shall','should','can','could','may','might','must','do','does','did','done','has','have','had','one','two','three']);

const SECTION_TAGS = {
  characters: 'CHAR', settings: 'PLACE', plotArcs: 'PLOT',
  worldRules: 'RULE', items: 'ITEM',
};

let fab = null;
let chip = null;
let chipText = null;
let chipBound = false;
let qpRowEl = null;
const blocks = [];

export function getAiBlocks() { return blocks; }

function cap(s, n) { return s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s; }
function flat(s) { return (s || '').replace(/\s+/g, ' ').trim(); }
function quickPrompts() {
  return (getState().settings.general.quickPrompts || []).filter((p) => (p || '').trim());
}

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
        (nameLc.length > 3 && ctx.includes(nameLc)) ||
        nameLc.split(/\s+/).some((w) => w.length > 3 && !STOP_WORDS.has(w) && wordSet.has(w))
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

/* ---------- Simplified, robust prompt ---------- */
function buildMessages(compiled, context, prompt) {
  let system =
    'You are Scribe, a professional ghostwriter for a novel.\n' +
    'RULES:\n' +
    '1. Do exactly what the TASK INSTRUCTION asks, nothing more.\n' +
    '2. If SOURCE TEXT is provided, rewrite/transform ONLY that text.\n' +
    '3. If no SOURCE TEXT is provided, write NEW content per the instruction; use the PROJECT BIBLE only for names/facts/style consistency — never quote or retell it.\n' +
    '4. If the instruction needs source text but none is provided, ask ONE short clarifying question.\n' +
    '5. Start your answer directly with prose. Never open with a greeting, interjection, sound effect, or standalone exclamation (e.g. "Ah!", "Hwæt!", "Yes!").\n' +
    '6. Output only the prose (or the one clarifying question). No preamble, no explanations.';
  if (compiled) system += `\n\nPROJECT BIBLE (compact reference):\n${compiled}`;

  const parts = [`TASK INSTRUCTION:\n${prompt}`];
  if (context) {
    parts.push(`SOURCE TEXT (verbatim):\n"""\n${cap(context, CONTEXT_CAP)}\n"""`);
    parts.push('Apply the TASK INSTRUCTION to the SOURCE TEXT above.');
  } else {
    parts.push('No SOURCE TEXT is provided with this request.');
  }
  return [
    { role: 'system', content: system },
    { role: 'user', content: parts.join('\n\n') },
  ];
}

/* ---------- Context chip ---------- */
function updateChip() {
  if (!chip) return;
  const sel = getManuscriptSelection();
  const t = sel ? sel.text : '';
  chip.hidden = !t;
  if (t) chipText.textContent = `${t.length.toLocaleString()} ch`;
}
/* ---------- FAB visibility (inline, cascade-proof) ---------- */
function positionFab() {
  if (!fab) return;
  fab.style.display = window.matchMedia('(max-width: 860px)').matches ? 'flex' : 'none';
  fab.style.zIndex = '120';
}

/* ---------- Quick prompts (always-visible pill row) ---------- */
function renderQuickRow() {
  if (!qpRowEl) return;
  clear(qpRowEl);
  for (const p of quickPrompts()) {
        qpRowEl.appendChild(el('button', {
      class: 'btn btn-ghost', title: p,
      onclick: () => runScribePrompt(p),
    }, [el('span', { text: p })]));
  }
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
    prompt, context,
    provider: null, full: '', controller: null, done: false,
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
    if ((block.full || '').trim().length < 12) {
      toast('Very short output — try Rewrite or a clearer instruction.', 'info');
    }
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

/* ---------- Send: consume the bundle ---------- */
export function runScribePrompt(prompt) {
  const p = (prompt || '').trim();
  if (!p) { toast('Type an instruction for Scribe first.', 'info'); return; }
  if (!getState().project) return;

  const sel = getManuscriptSelection();
  const context = sel ? sel.text : '';

  const block = createBlock(p, context);
  if (!block) return;

  clearManuscriptSelection();
  updateChip();

  streamInto(block);
}

export function rerunBlock(block) { streamInto(block); }

/* ---------- Prompt bar (desktop) + FAB/sheet (mobile) ---------- */
function buildBar() {
  chipText = el('span', { text: '' });
  chip = el('button', {
    class: 'scribe-chip', hidden: true,
    title: 'Highlighted text bundled with your next prompt — click to clear',
    onclick: () => { clearManuscriptSelection(); updateChip(); },
  }, [icon('file-text', 'icon-sm'), chipText, icon('x', 'icon-sm')]);

  const input = el('input', {
    class: 'input', type: 'text',
    placeholder: 'Scribe: write, continue, describe, rewrite…',
  });
  const send = el('button', {
    class: 'btn btn-ghost btn-icon', title: 'Send to Scribe',
  }, [icon('send')]);

  const row = el('div', { class: 'scribe-row' }, [chip, input, send]);
  qpRowEl = el('div', { class: 'scribe-qp-row' });
  renderQuickRow();

  const bar = el('div', { class: 'scribe-bar', dataset: { scribeBound: '1' } }, [row, qpRowEl]);
  const fire = () => { runScribePrompt(input.value); input.value = ''; };
  send.addEventListener('click', fire);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') fire(); });
  updateChip();
  return bar;
}

function bindDesktop() {
  const old = document.querySelector('.scribe-bar');
  if (old && !old.dataset.scribeBound) old.replaceWith(buildBar());
}

function openPromptSheet() {
  const selAtOpen = getManuscriptSelection();
  const ta = el('textarea', {
    class: 'textarea', rows: '4',
    placeholder: 'e.g. Rewrite the highlighted passage in third person, past tense…',
  });
  const hint = el('p', {
    class: 'scribe-sheet-hint',
    text: selAtOpen
      ? `Bundling ${selAtOpen.text.length.toLocaleString()} characters of highlighted Manuscript text with this prompt.`
      : 'No text highlighted — Scribe will follow the instruction using the project bible only.',
  });
  const clearBtn = el('button', {
    class: 'btn btn-sm', text: 'Clear context', hidden: !selAtOpen,
    onclick: () => {
      clearManuscriptSelection();
      updateChip();
      hint.textContent = 'No text highlighted — Scribe will follow the instruction using the project bible only.';
      clearBtn.hidden = true;
    },
  });

  const qpRow = el('div', { class: 'scribe-qp-row' });
  for (const p of quickPrompts()) {
        qpRow.appendChild(el('button', {
      class: 'btn btn-sm', title: p,
      onclick: () => { m.close(); runScribePrompt(p); },
    }, [el('span', { text: p })]));
  }

  const m = modal({
    title: 'Scribe',
    body: quickPrompts().length ? [hint, qpRow, ta] : [hint, ta],
    footer: [
      el('button', { class: 'btn', text: 'Cancel', onclick: () => m.close() }),
      clearBtn,
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
    window.addEventListener('resize', positionFab);
  }
  positionFab();
  if (!chipBound) {
    chipBound = true;
    let tick = false;
    document.addEventListener('selectionchange', () => {
      if (tick) return;
      tick = true;
      requestAnimationFrame(() => { tick = false; updateChip(); });
    });
  }
  bindDesktop();
  subscribe((state, change) => {
    if (change.settings) { renderQuickRow(); return; }
    if (state.view !== 'workspace') return;
    if (change.view || (change.project && !change.silent)) bindDesktop();
  });
}
