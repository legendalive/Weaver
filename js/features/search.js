/* =========================================================
   Weaver — js/features/search.js
   Step 27.5: Word/phrase search across Manuscript + Main Novel.
   - Case-insensitive phrase matching on stored text.
   - Next/Prev jump the virtual window to the hit's block and
     paint a temporary <mark> (sync-transparent, re-render-safe).
   - Order: Manuscript matches, then Main Novel matches, wrap.
   ========================================================= */

import { el, clear } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { getState, subscribe } from '../core/state.js';
import { buildBlockIndex, blockAtOffset } from '../utils/text.js';
import { jumpManuscriptToBlock } from '../panels/manuscript.js';
import { jumpNovelToBlock } from '../panels/main-novel.js';

const STYLE_ID = 'search-style';
const CSS = `
.ws-bar{display:flex;align-items:center;gap:4px;width:230px;
  background:var(--surface-2);border:1px solid var(--border);
  border-radius:var(--radius-md);padding:3px 6px;}
.ws-bar .input{border:none;background:transparent;box-shadow:none;
  padding:2px 4px;flex:1;min-width:0;font-size:.8rem;}
.ws-bar .input:focus{outline:none;}
.ws-badge{font-family:var(--font-mono);font-size:.66rem;color:var(--faint);flex:none;}
.ws-badge.is-novel{color:var(--accent);}
.ws-bar .btn{padding:2px 5px;font-size:.8rem;line-height:1;}
mark.ws-hit{background:rgba(224,168,60,.35);color:inherit;border-radius:2px;}
@media (max-width:860px){ .ws-bar{display:none;} }
`;

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
}

const MAX_MATCHES = 2000;

let bar = null;
let input = null;
let badge = null;
let query = '';
let msHits = [];
let nvHits = [];
let pos = -1;
let debounce = null;

function total() { return msHits.length + nvHits.length; }

/* ---------- Match computation ---------- */
function findHits(text, q) {
  const hits = [];
  if (!q || !text) return hits;
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  let i = lower.indexOf(ql);
  while (i >= 0 && hits.length < MAX_MATCHES) {
    hits.push(i);
    i = lower.indexOf(ql, i + ql.length);
  }
  return hits;
}

function recompute() {
  const project = getState().project;
  if (!project) { msHits = []; nvHits = []; return; }
  msHits = findHits(project.manuscript.text || '', query);
  nvHits = findHits(project.mainNovel.text || '', query);
  pos = total() ? 0 : -1;
}

/* ---------- Marking (sync-transparent) ---------- */
function clearMarks() {
  document.querySelectorAll('mark.ws-hit').forEach((m) => {
    m.replaceWith(document.createTextNode(m.textContent));
  });
}

function markFirstIn(panelSel, q) {
  const panel = document.querySelector(panelSel);
  if (!panel) return null;
  const body = panel.querySelector('.panel-body');
  if (!body) return null;
  const ql = q.toLowerCase();
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const idx = node.data.toLowerCase().indexOf(ql);
    if (idx < 0) continue;
    const startNode = node.splitText(idx);
    const endNode = startNode.splitText(ql.length);
    const mark = document.createElement('mark');
    mark.className = 'ws-hit';
    startNode.parentNode.insertBefore(mark, startNode);
    mark.appendChild(startNode);
    void endNode;
    return mark;
  }
  return null;
}

/* ---------- Navigation ---------- */
function updateBadge() {
  if (!badge) return;
  if (!query || pos < 0) { badge.textContent = ''; badge.classList.remove('is-novel'); return; }
  const inNovel = pos >= msHits.length;
  badge.textContent = `${pos + 1}/${total()}`;
  badge.classList.toggle('is-novel', inNovel);
  badge.title = inNovel ? 'Current hit in Main Novel' : 'Current hit in Manuscript';
}

function goto(k) {
  const t = total();
  if (!query || !t) return;
  pos = ((k % t) + t) % t;
  const inNovel = pos >= msHits.length;
  const off = inNovel ? nvHits[pos - msHits.length] : msHits[pos];

  const project = getState().project;
  const text = inNovel ? (project.mainNovel.text || '') : (project.manuscript.text || '');
  const blocks = buildBlockIndex(text);
  const bi = blockAtOffset(blocks, off);

  clearMarks();
  if (inNovel) jumpNovelToBlock(bi);
  else jumpManuscriptToBlock(bi);

  const mark = markFirstIn(
    inNovel ? '.panel[data-panel="novel"]' : '.panel[data-panel="manuscript"]',
    query
  );
  if (mark) mark.scrollIntoView({ block: 'center' });
  updateBadge();
}

/* ---------- UI ---------- */
function buildBar() {
  input = el('input', {
    class: 'input', type: 'text',
    placeholder: 'Search manuscript & novel…',
  });
  badge = el('span', { class: 'ws-badge' });

  const prev = el('button', { class: 'btn btn-ghost', title: 'Previous match (Shift+Enter)', text: '‹', onclick: () => goto(pos - 1) });
  const next = el('button', { class: 'btn btn-ghost', title: 'Next match (Enter)', text: '›', onclick: () => goto(pos + 1) });
  const clr = el('button', { class: 'btn btn-ghost btn-icon', title: 'Clear search', onclick: () => { input.value = ''; onInput(); } }, [icon('x', 'icon-sm')]);

  input.addEventListener('input', onInput);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); goto(e.shiftKey ? pos - 1 : pos + 1); }
    if (e.key === 'Escape') { input.value = ''; onInput(); input.blur(); }
  });

  return el('div', { class: 'ws-bar', dataset: { wsBound: '1' } }, [
    icon('file-text', 'icon-sm'), input, badge, prev, next, clr,
  ]);
}

function onInput() {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    query = (input.value || '').trim();
    clearMarks();
    if (!query) { msHits = []; nvHits = []; pos = -1; updateBadge(); return; }
    recompute();
    updateBadge();
    if (total()) goto(0);
  }, 250);
}

function bind() {
  const host = document.querySelector('.topbar-left');
  if (!host) return;
  const old = host.querySelector('.ws-bar');
  if (old && old.dataset.wsBound) return;
  if (old) old.remove();
  host.appendChild(buildBar());
}

export function initSearch() {
  ensureStyle();
  bind();
  subscribe((state, change) => {
    if (state.view !== 'workspace') return;
    if (change.view || (change.project && !change.silent)) {
      query = ''; msHits = []; nvHits = []; pos = -1;
      bind();
      updateBadge();
    }
  });
}
