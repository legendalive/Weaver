/* =========================================================
   Weaver — js/panels/manuscript.js
   Step 12 + Step 14: Manuscript panel.
   - Editable, virtualized (spacer) windowed rendering.
   - Sentence-safe paging via windowBounds.
   - Debounced silent sync of edits back into project text.
   - Accept as is push into Main Novel.
   - Hierarchy jump via window reset.
   ========================================================= */

import { el, clear, toast } from '../utils/dom.js';
import { getState, touchProject, subscribe } from '../core/state.js';
import {
  wordCount, buildBlockIndex, windowBounds, headingPrefix,
} from '../utils/text.js';

const MAX_MOUNTED = 300;
const SCROLL_THRESHOLD = 300;
const SYNC_DELAY = 400;

let panelEl = null;
let bodyEl = null;
let blocksWrap = null;
let wordCountEl = null;
let topSpacer = null;
let bottomSpacer = null;

let index = [];
let mounted = { from: 0, to: 0 };
let syncTimer = null;
let syncProjectId = null;
let selectionInfo = null;
let docBound = false;

export function mountManuscript(panel) {
  panelEl = panel;
  bodyEl = panel.querySelector('.panel-body');
  clear(bodyEl);

  blocksWrap = el('div', { class: 'ms-scroll' });
  topSpacer = el('div', { class: 'ms-spacer' });
  bottomSpacer = el('div', { class: 'ms-spacer' });
  blocksWrap.append(topSpacer, bottomSpacer);
  bodyEl.appendChild(blocksWrap);

  const header = panel.querySelector('.panel-header');
  const actions = panel.querySelector('.panel-actions');
  wordCountEl = el('span', { class: 'badge badge-accent ms-word-count', text: '0 words' });
  header.insertBefore(wordCountEl, actions);

  bodyEl.addEventListener('scroll', onScroll);

  if (!docBound) {
    docBound = true;
    document.addEventListener('selectionchange', onSelectionChange);
  }

  renderManuscript();
}

/* ---------- Render (windowed, editable) ---------- */
export function renderManuscript(startBlock = 0) {
  if (!blocksWrap) return;
  clearTimeout(syncTimer);
  syncTimer = null;
  selectionInfo = null;

  clearBlocksOnly();
  topSpacer.style.height = '0px';
  bottomSpacer.style.height = '0px';

  const project = getState().project;
  if (!project) return;
  syncProjectId = project.id;

  const text = project.manuscript.text || '';
  index = buildBlockIndex(text);
  if (wordCountEl) wordCountEl.textContent = `${wordCount(text).toLocaleString()} words`;

  const maxSent = getState().settings.general.sentencesPerPage ?? 15;
  const start = Math.max(0, Math.min(startBlock, index.length - 1));
  const { end } = windowBounds(index, start, maxSent);
  mountRange(start, Math.max(end, start + 1), text);
  bodyEl.scrollTop = 0;
}

function mountRange(from, to, text) {
  const frag = document.createDocumentFragment();
  for (let i = from; i < to; i++) frag.appendChild(blockNode(index[i], text));
  bottomSpacer.before(frag);
  mounted = { from, to };
}

/* ---------- Hierarchy jump ---------- */
export function jumpManuscriptToBlock(blockIndex) {
  flushManuscriptSync();
  renderManuscript(blockIndex);
}

function clearBlocksOnly() {
  Array.from(blocksWrap.children).forEach((n) => {
    if (n !== topSpacer && n !== bottomSpacer) n.remove();
  });
}

function getBlockNodes() {
  return Array.from(blocksWrap.children).filter((n) => n !== topSpacer && n !== bottomSpacer);
}

function blockNode(b, text) {
  const raw = text.slice(b.s, b.e).replace(/\n$/, '');
  if (b.level) {
    return el('div', {
      class: `ms-block ms-h${b.level}`,
      contenteditable: 'true',
      dataset: { level: String(b.level) },
      text: raw.slice(headingPrefix(b.level).length),
      oninput: onBlockInput,
    });
  }
  return el('div', {
    class: 'ms-block',
    contenteditable: 'true',
    dataset: { level: '0' },
    text: raw,
    oninput: onBlockInput,
  });
}

/* ---------- Editing sync (debounced, silent) ---------- */
function onBlockInput() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncProject, SYNC_DELAY);
}

export function flushManuscriptSync() {
  clearTimeout(syncTimer);
  syncTimer = null;
  syncProject();
}

function syncProject() {
  const project = getState().project;
  if (!project || project.id !== syncProjectId) return;
  const nodes = getBlockNodes();
  const lines = nodes.map((n) => {
    const level = Number(n.dataset.level || 0);
    const t = n.textContent.replace(/\s+$/, '');
    return level ? headingPrefix(level) + t : t;
  });
  const newText = lines.join('\n\n');
  if (newText !== project.manuscript.text) {
    project.manuscript.text = newText;
    touchProject({ silent: true });
  }
  if (wordCountEl) wordCountEl.textContent = `${wordCount(newText).toLocaleString()} words`;
}

/* ---------- Selection tracking (for Scribe later) ---------- */
function onSelectionChange() {
  const sel = document.getSelection();
  if (!sel || sel.isCollapsed) { selectionInfo = null; return; }
  const node = sel.anchorNode;
  if (!node || !blocksWrap || !blocksWrap.contains(node)) { selectionInfo = null; return; }
  selectionInfo = { text: sel.toString() };
}

export function getSelectionInfo() {
  return selectionInfo;
}

/* ---------- Virtualized scroll (scroll-height-delta math) ---------- */
function onScroll() {
  if (!bodyEl || !index.length) return;
  const { scrollTop, scrollHeight, clientHeight } = bodyEl;
  const nearBottom = scrollTop + clientHeight >= scrollHeight - SCROLL_THRESHOLD;
  const nearTop = scrollTop <= SCROLL_THRESHOLD;

  if (nearBottom && mounted.to < index.length) {
    const maxSent = getState().settings.general.sentencesPerPage ?? 15;
    const { end } = windowBounds(index, mounted.to, maxSent);
    if (end > mounted.to) {
      appendBlocks(mounted.to, end);
      pruneTop();
    }
  }

  if (nearTop && mounted.from > 0) {
    const maxSent = getState().settings.general.sentencesPerPage ?? 15;
    let start = mounted.from;
    let budget = 0;
    while (start > 0 && budget < maxSent) {
      start--;
      budget += index[start].sentences;
    }
    if (start < mounted.from) {
      prependBlocks(start, mounted.from);
      pruneBottom();
    }
  }
}

function appendBlocks(from, to) {
  const text = getState().project.manuscript.text || '';
  const frag = document.createDocumentFragment();
  for (let i = from; i < to; i++) frag.appendChild(blockNode(index[i], text));
  bottomSpacer.before(frag);
  mounted.to = to;
}

function prependBlocks(from, to) {
  const text = getState().project.manuscript.text || '';
  const oldHeight = bodyEl.scrollHeight;
  const oldTop = bodyEl.scrollTop;
  const frag = document.createDocumentFragment();
  for (let i = from; i < to; i++) frag.appendChild(blockNode(index[i], text));
  topSpacer.after(frag);
  bodyEl.scrollTop = oldTop + (bodyEl.scrollHeight - oldHeight);
  mounted.from = from;
}

function pruneTop() {
  const nodes = getBlockNodes();
  if (nodes.length <= MAX_MOUNTED) return;
  const removeCount = nodes.length - MAX_MOUNTED;
  const oldHeight = bodyEl.scrollHeight;
  const oldTop = bodyEl.scrollTop;
  for (let i = 0; i < removeCount; i++) nodes[i].remove();
  topSpacer.style.height = (parseFloat(topSpacer.style.height || 0) + (oldHeight - bodyEl.scrollHeight)) + 'px';
  bodyEl.scrollTop = oldTop;
  mounted.from += removeCount;
}

function pruneBottom() {
  const nodes = getBlockNodes();
  if (nodes.length <= MAX_MOUNTED) return;
  const removeCount = nodes.length - MAX_MOUNTED;
  const oldHeight = bodyEl.scrollHeight;
  for (let i = 0; i < removeCount; i++) nodes[nodes.length - 1 - i].remove();
  bottomSpacer.style.height = (parseFloat(bottomSpacer.style.height || 0) + (oldHeight - bodyEl.scrollHeight)) + 'px';
  mounted.to -= removeCount;
}

/* ---------- Accept as is ---------- */
export function acceptAsIs() {
  flushManuscriptSync();
  const project = getState().project;
  if (!project) return;
  const text = (project.manuscript.text || '').trim();
  if (!text) { toast('Nothing to accept yet.', 'info'); return; }
  const novel = project.mainNovel.text || '';
  project.mainNovel.text = novel ? novel + '\n\n' + text : text;
  touchProject({ novel: true });
  toast('Pushed into Main Novel.', 'success');
}
