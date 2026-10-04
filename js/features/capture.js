/* =========================================================
   Weaver — js/features/capture.js
   Step 27.6 FINAL: highlight anywhere in the three panels ->
   floating "+ Config" capture with AI description.
   - Smart context: sentence-aligned ±600 chars, nearest
     heading, bible roster (names only).
   - "Retry wider" doubles the window; collapsed Context
     disclosure allows peek/edit (closed by default).
   - Output gate: preview -> Use this -> editable description.
   - Saves via saveEffectiveConfig (series-aware).
   ========================================================= */

import { el, toast, modal } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { getState } from '../core/state.js';
import { getEffectiveConfig, saveEffectiveConfig } from '../core/storage.js';
import { streamChatWithFallback } from '../ai/manager.js';

const STYLE_ID = 'capture-style';
const CSS = `
.cap-fab{position:fixed;z-index:96;display:flex;align-items:center;gap:5px;
  padding:5px 10px;border-radius:999px;background:var(--accent);color:#17130a;
  border:none;font-size:.7rem;font-weight:600;box-shadow:var(--shadow-2);cursor:pointer;}
.cap-fab[hidden]{display:none;}
.cap-preview{min-height:36px;padding:8px;border:1px dashed var(--border);
  border-radius:var(--radius-sm);font-size:.78rem;color:var(--muted);
  white-space:pre-wrap;background:var(--surface-2);}
.cap-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;}
.cap-ctx-toggle{font-size:.7rem;color:var(--faint);text-align:left;
  max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
`;

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
}

const SECTIONS = [
  { key: 'characters', label: 'Characters' },
  { key: 'settings', label: 'Settings & Places' },
  { key: 'plotArcs', label: 'Plot Arcs' },
  { key: 'worldRules', label: 'World Rules & Physics' },
  { key: 'items', label: 'Item Catalog' },
];

let fab = null;
let selText = '';
let lastPanelKey = null;
let lastBlockText = '';
let tick = false;

function entryId() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'e_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function hideFab() { if (fab) fab.hidden = true; }

/* ---------- Selection observer ---------- */
function onSel() {
  const sel = document.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) { hideFab(); return; }
  const anchor = sel.anchorNode;
  const node = anchor && (anchor.nodeType === 3 ? anchor.parentElement : anchor);
  const body = node && node.closest ? node.closest('.panel-body') : null;
  if (!body) { hideFab(); return; }

  const panel = body.closest('.panel');
  lastPanelKey = panel ? panel.dataset.panel : null;
  selText = sel.toString().trim();
  if (!selText) { hideFab(); return; }

  if (lastPanelKey === 'ai') {
    const blk = node.closest('.ai-block');
    lastBlockText = blk ? blk.textContent : '';
  }

  const rect = sel.getRangeAt(0).getBoundingClientRect();
  fab.style.top = Math.max(8, rect.top - 40) + 'px';
  fab.style.left = Math.min(window.innerWidth - 110, Math.max(8, rect.left + rect.width / 2 - 45)) + 'px';
  fab.hidden = false;
}

/* ---------- Smart context building ---------- */
function findBack(source, pos, radius) {
  const lo = Math.max(0, pos - radius);
  let best = -1;
  for (const sep of ['. ', '! ', '? ', '\n']) {
    const i = source.lastIndexOf(sep, pos - 1);
    if (i >= lo && i > best) best = i;
  }
  return best < 0 ? lo : best + 1;
}

function findFwd(source, pos, radius) {
  const hi = Math.min(source.length, pos + radius);
  let best = -1;
  for (const sep of ['. ', '! ', '? ', '\n']) {
    const i = source.indexOf(sep, pos);
    if (i >= 0 && i < hi && i > best) best = i;
  }
  return best < 0 ? hi : best + 1;
}

function sourceText() {
  const project = getState().project;
  if (lastPanelKey === 'manuscript') return (project && project.manuscript.text) || '';
  if (lastPanelKey === 'novel') return (project && project.mainNovel.text) || '';
  return lastBlockText || selText;
}

function buildContext(radius) {
  const source = sourceText();
  const idx = source.indexOf(selText);
  if (idx < 0) return { win: selText, heading: '' };

  const s = findBack(source, idx, radius);
  const e = findFwd(source, idx + selText.length, radius);
  const win = source.slice(s, e).trim();

  let heading = '';
  const hIdx = source.lastIndexOf('\n#', idx);
  if (hIdx >= 0) {
    const nl = source.indexOf('\n', hIdx + 1);
    heading = source.slice(hIdx + 1, nl < 0 ? source.length : nl).trim();
  } else if (source.startsWith('#')) {
    const nl = source.indexOf('\n');
    heading = source.slice(0, nl < 0 ? source.length : nl).trim();
  }
  return { win, heading };
}

function rosterLine() {
  const project = getState().project;
  if (!project) return '';
  const cfg = getEffectiveConfig(project);
  const tags = { characters: 'CHAR', settings: 'PLACE', plotArcs: 'PLOT', worldRules: 'RULE', items: 'ITEM' };
  const parts = [];
  for (const k of Object.keys(tags)) {
    for (const e of (cfg[k] || [])) if (e.name) parts.push(`${tags[k]}:${e.name}`);
  }
  return parts.slice(0, 40).join(', ');
}

/* ---------- Capture modal ---------- */
function openCapture() {
  hideFab();
  const project = getState().project;
  if (!project) return;

  let radius = 600;
  let heading = '';
  let currentWin = '';
  let ctxEdited = false;

  const sectionSelect = el('select', { class: 'select' },
    SECTIONS.map((s) => el('option', { value: s.key, text: s.label })));
  const nameInput = el('input', {
    class: 'input', value: selText.slice(0, 80), placeholder: 'Entry name…',
  });
  const descTa = el('textarea', {
    class: 'textarea', rows: '4', placeholder: 'Description (or let Scribe draft it)…',
  });
  const preview = el('div', { class: 'cap-preview', text: 'AI description will appear here.' });
  const ctxTa = el('textarea', { class: 'textarea', rows: '4', hidden: true });
  const ctxToggle = el('button', { class: 'btn btn-ghost btn-sm cap-ctx-toggle' });
  const useBtn = el('button', {
    class: 'btn btn-sm', text: 'Use this', hidden: true,
    onclick: () => { descTa.value = preview.textContent; },
  });

  function refreshContext() {
    const c = buildContext(radius);
    currentWin = c.win;
    heading = c.heading;
    if (!ctxEdited) ctxTa.value = currentWin;
    ctxToggle.textContent =
      `Context (auto${ctxEdited ? ', edited' : ''}, ±${radius}) — ${currentWin.slice(0, 60).replace(/\s+/g, ' ')}…`;
  }
  refreshContext();

  ctxToggle.onclick = () => { ctxTa.hidden = !ctxTa.hidden; };
  ctxTa.addEventListener('input', () => { ctxEdited = true; refreshContext(); });

  async function runDescribe() {
    describeBtn.disabled = true;
    retryBtn.disabled = true;
    useBtn.hidden = true;
    preview.textContent = '';
    const roster = rosterLine();
    const ctxText = ctxEdited ? ctxTa.value : currentWin;
    try {
      await streamChatWithFallback({
        messages: [
          {
            role: 'system',
            content: "You are a concise reference writer for a novel's project bible. Reply with one or two sentences (max 45 words), definition-style, present tense. No preamble, no explanations.",
          },
          {
            role: 'user',
            content:
              `Term: "${nameInput.value.trim() || selText}"` +
              (heading ? `\nNearest section heading: ${heading}` : '') +
              `\nContext it appears in:\n"""\n${ctxText}\n"""` +
              (roster ? `\nKnown project entries (names only): ${roster}` : '') +
              `\nWrite the concise bible entry for this term.`,
          },
        ],
        onToken: (d, full) => { preview.textContent = full; },
      });
      useBtn.hidden = false;
    } catch (e) {
      preview.textContent = '⚠ ' + e.message;
    }
    describeBtn.disabled = false;
    retryBtn.disabled = false;
  }

  const describeBtn = el('button', {
    class: 'btn btn-sm', text: '✨ Describe with Scribe', onclick: runDescribe,
  });
  const retryBtn = el('button', {
    class: 'btn btn-sm', text: 'Retry wider', title: 'Double the context window and re-run',
    onclick: () => { radius = Math.min(radius * 2, 4000); ctxEdited = false; refreshContext(); runDescribe(); },
  });

  const m = modal({
    title: 'Add to Config Bible',
    body: [
      el('div', { class: 'field' }, [el('span', { class: 'field-label', text: 'Section' }), sectionSelect]),
      el('div', { class: 'field' }, [el('span', { class: 'field-label', text: 'Name' }), nameInput]),
      el('div', { class: 'field' }, [el('span', { class: 'field-label', text: 'Description' }), descTa]),
      el('div', { class: 'cap-row' }, [describeBtn, retryBtn, useBtn]),
      preview,
      ctxToggle,
      ctxTa,
    ],
    footer: [
      el('button', { class: 'btn', text: 'Cancel', onclick: () => m.close() }),
      el('button', {
        class: 'btn btn-primary', text: 'Save to Bible',
        onclick: () => {
          const name = nameInput.value.trim();
          if (!name) { toast('Give the entry a name.', 'info'); return; }
          const cfg = JSON.parse(JSON.stringify(getEffectiveConfig(project)));
          const key = sectionSelect.value;
          if (!Array.isArray(cfg[key])) cfg[key] = [];
          cfg[key].push({ id: entryId(), name, body: descTa.value.trim() });
          saveEffectiveConfig(project, cfg);
          m.close();
          const label = (SECTIONS.find((s) => s.key === key) || {}).label || key;
          toast(`Added "${name}" to ${label}.`, 'success');
        },
      }),
    ],
  });
}

/* ---------- Init ---------- */
export function initCapture() {
  ensureStyle();
  fab = el('button', {
    class: 'cap-fab', hidden: true, title: 'Add selection to Config Bible',
    onclick: openCapture,
  }, [icon('plus', 'icon-sm'), 'Config']);
  document.body.appendChild(fab);

  document.addEventListener('selectionchange', () => {
    if (tick) return;
    tick = true;
    requestAnimationFrame(() => { tick = false; onSel(); });
  });
  document.addEventListener('scroll', hideFab, true);
  window.addEventListener('resize', hideFab);
}
