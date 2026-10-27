/* =========================================================
Weaver — js/features/search.js
V3.3a: collapsing search. At rest = a single magnifying-glass
icon button; on click it expands to overlay the topbar; when
emptied (clear / Escape / blur-with-no-text) it collapses back
to the icon. Search logic (match, ‹ › nav, mark, jump) is
unchanged. Magnifier is inline SVG so it never depends on the
icon set.
========================================================= */
import { el, clear } from '../utils/dom.js';
import { getState, subscribe } from '../core/state.js';
import { buildBlockIndex, blockAtOffset } from '../utils/text.js';
import { jumpManuscriptToBlock } from '../panels/manuscript.js';
import { jumpNovelToBlock } from '../panels/main-novel.js';

const STYLE_ID = 'search-style';
const CSS = `.topbar{position:relative;} .ws-bar{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;box-sizing:border-box;background:transparent;border:1px solid transparent;border-radius:var(--radius-md);cursor:pointer;flex:none;color:var(--muted);} .ws-bar:hover{color:var(--text);background:var(--surface-2);} .ws-bar .input,.ws-bar .ws-badge,.ws-bar .btn{display:none;} .ws-bar .icon{flex:none;} .ws-bar.is-open{position:absolute;left:6px;right:6px;top:50%;transform:translateY(-50%);z-index:60;width:auto;height:40px;display:flex;align-items:center;justify-content:flex-start;gap:4px;padding:0 8px;cursor:default;background:var(--surface-2);border:1px solid var(--border);color:var(--text);} .ws-bar.is-open .input{display:block;flex:1;min-width:0;border:none;background:transparent;box-shadow:none;padding:0 6px;height:100%;font-size:.85rem;color:var(--text);} .ws-bar.is-open .input:focus{outline:none;} .ws-bar.is-open .ws-badge{display:inline;} .ws-bar.is-open .btn{display:inline-flex;} .ws-badge{font-family:var(--font-mono);font-size:.66rem;color:var(--faint);flex:none;} .ws-badge.is-novel{color:var(--accent);} .ws-bar .btn{padding:2px 6px;font-size:.8rem;line-height:1;height:28px;flex:none;} .topbar-center{min-width:0;} .topbar-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;} .topbar-sub{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;} mark.ws-hit{background:rgba(224,168,60,.35);color:inherit;border-radius:2px;} @media (max-width:860px){ .ws-bar{display:none;} }`;

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

/* Magnifying glass as inline SVG (independent of the icon set). */
function magnifier(cls) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (cls) svg.setAttribute('class', cls);
  const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c.setAttribute('cx', '11'); c.setAttribute('cy', '11'); c.setAttribute('r', '8');
  const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  l.setAttribute('x1', '21'); l.setAttribute('y1', '21');
  l.setAttribute('x2', '16.65'); l.setAttribute('y2', '16.65');
  svg.appendChild(c); svg.appendChild(l);
  return svg;
}

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

/* ---------- Open / collapse ---------- */
function setOpen(open) {
  if (bar) bar.classList.toggle('is-open', open);
}
function openSearch() {
  setOpen(true);
  setTimeout(() => { if (input) input.focus(); }, 30);
}

/* ---------- UI ---------- */
function buildBar() {
  input = el('input', { class: 'input', type: 'text', placeholder: 'Search…' });
  badge = el('span', { class: 'ws-badge' });
  const prev = el('button', { class: 'btn btn-ghost', title: 'Previous match (Shift+Enter)', text: '\u2039', onclick: () => goto(pos - 1) });
  const next = el('button', { class: 'btn btn-ghost', title: 'Next match (Enter)', text: '\u203A', onclick: () => goto(pos + 1) });
  const clr = el('button', {
    class: 'btn btn-ghost', title: 'Clear search', text: '\u00D7',
    onclick: () => { input.value = ''; onInput(); },
  });

  input.addEventListener('input', onInput);
  input.addEventListener('focus', () => setOpen(true));
  input.addEventListener('blur', () => { if (!(input.value || '').trim()) setOpen(false); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); goto(e.shiftKey ? pos - 1 : pos + 1); }
    if (e.key === 'Escape') { input.value = ''; onInput(); input.blur(); setOpen(false); }
  });

  bar = el('div', { class: 'ws-bar', dataset: { wsBound: '1' }, title: 'Search' }, [
    magnifier('icon'), input, badge, prev, next, clr,
  ]);
  bar.addEventListener('click', () => {
    if (!bar.classList.contains('is-open')) openSearch();
  });
  return bar;
}

function onInput() {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    query = (input.value || '').trim();
    setOpen(Boolean(query));
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
