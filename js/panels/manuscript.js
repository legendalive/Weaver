/* =========================================================
   Weaver — js/panels/manuscript.js
   Step 11-14 + Step 21 Patch: Manuscript editor.
   - Adds visual tracking (gold tint) for blocks selected for Scribe.
   ========================================================= */

import { el, clear, toast } from '../utils/dom.js';
import { getState, touchProject, flushSave } from '../core/state.js';
import {
  buildBlockIndex, windowBounds, spliceBlocks, headingPrefix,
} from '../utils/text.js';

const SYNC_DELAY = 800;
const MAX_MOUNTED = 300;
const SCROLL_THRESHOLD = 300;

const CE_MODE = (() => {
  const d = document.createElement('div');
  d.setAttribute('contenteditable', 'plaintext-only');
  return d.contentEditable === 'plaintext-only' ? 'plaintext-only' : 'true';
})();

let panelEl = null;
let bodyEl = null;
let blocksWrap = null;
let toolbarBtns = {};
let index = [];
let mounted = { from: 0, to: 0 };
let syncTimer = null;
let syncProjectId = null;
let selectionInfo = null;
let docBound = false;
let selTick = false;

let topSpacer = null;
let bottomSpacer = null;

export function getManuscriptSelection() { return selectionInfo; }

/* ---------- Mount ---------- */
export function mountManuscript(panel) {
  panelEl = panel;
  bodyEl = panel.querySelector('.panel-body');
  clear(bodyEl);
  blocksWrap = el('div', { class: 'ms-scroll' });
  bodyEl.appendChild(blocksWrap);

  topSpacer = el('div', { class: 'ms-spacer' });
  bottomSpacer = el('div', { class: 'ms-spacer' });
  blocksWrap.append(topSpacer, bottomSpacer);

  const actions = panel.querySelector('.panel-actions');
  const expandBtn = actions.querySelector('button');
  const tb = el('div', { class: 'ms-toolbar' });
  toolbarBtns = {};
  for (const [label, level] of [['H1', 1], ['H2', 2], ['H3', 3], ['¶', 0]]) {
    const b = el('button', {
      class: 'btn btn-ghost btn-sm ms-tb-btn',
      title: level ? `Heading ${level}` : 'Body text',
      dataset: { level: String(level) },
      text: label,
      onclick: () => applyHeading(level),
    });
    toolbarBtns[level] = b;
    tb.appendChild(b);
  }
  actions.insertBefore(tb, expandBtn);

  blocksWrap.addEventListener('input', () => { clearBundledBlocks(); scheduleSync(); });
  blocksWrap.addEventListener('keydown', onKeydown);
  blocksWrap.addEventListener('paste', onPaste);
  bodyEl.addEventListener('scroll', onScroll);

  if (!docBound) {
    docBound = true;
    document.addEventListener('selectionchange', () => {
      if (selTick) return;
      selTick = true;
      requestAnimationFrame(() => { selTick = false; onSelectionChange(); });
    });
    const persist = () => { flushManuscriptSync(); flushSave(); };
    window.addEventListener('beforeunload', persist);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persist();
    });
  }

  renderManuscript();
}

/* ---------- Render (windowed) ---------- */
export function renderManuscript(startBlock = null) {
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
  const maxSent = getState().settings.general.sentencesPerPage ?? 15;
    const resume = startBlock == null ? (project.manuscript.viewStart || 0) : startBlock;
  const start = Math.max(0, Math.min(resume, index.length - 1));
  const { end } = windowBounds(index, start, maxSent);
  mountRange(start, Math.max(end, start + 1), text);
  bodyEl.scrollTop = 0;
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

function mountRange(from, to, text) {
  mounted = { from, to };
  const frag = document.createDocumentFragment();
  for (let i = from; i < to; i++) frag.appendChild(blockNode(index[i], text));
  clearBlocksOnly();
  topSpacer.after(frag);
}

function blockNode(block, text) {
  const raw = text.slice(block.s, block.e).replace(/\n$/, '');
  const level = block.level;
  const bodyText = level ? raw.slice(headingPrefix(level).length) : raw;
  const node = el('div', {
    class: 'ms-block' + (level ? ` ms-h${level}` : ''),
    contenteditable: CE_MODE,
    dataset: { level: String(level) },
    spellcheck: 'true',
  });
  setBody(node, bodyText);
  return node;
}

/* ---------- Body <-> node helpers ---------- */
function setBody(node, str) {
  clear(node);
  const lines = str.split('\n');
  lines.forEach((line, i) => {
    if (i) node.appendChild(document.createElement('br'));
    if (line) node.appendChild(document.createTextNode(line));
  });
}

function bodyString(node) {
  let out = '';
  const walk = (n) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) out += c.data;
      else if (c.nodeName === 'BR') out += '\n';
      else walk(c);
    }
  };
  walk(node);
  return out;
}

function nodeToString(node) {
  const lv = Number(node.dataset.level || 0);
  return (lv ? headingPrefix(lv) : '') + bodyString(node);
}

function getBlockNodes() {
  return Array.from(blocksWrap.children).filter((n) => n !== topSpacer && n !== bottomSpacer);
}

function blockOf(node) {
  if (!node) return null;
  const elem = node.nodeType === 3 ? node.parentElement : node;
  return elem ? elem.closest('.ms-block') : null;
}

/* ---------- Caret math ---------- */
function lenOf(c) {
  if (c.nodeType === 3) return c.data.length;
  if (c.nodeName === 'BR') return 1;
  let s = 0;
  for (const g of c.childNodes) s += lenOf(g);
  return s;
}

function textOffsetIn(node, anchorNode, anchorOffset) {
  if (anchorNode === node) {
    let acc = 0;
    for (let i = 0; i < Math.min(anchorOffset, node.childNodes.length); i++) acc += lenOf(node.childNodes[i]);
    return acc;
  }
  let acc = 0;
  const walk = (n) => {
    for (const c of n.childNodes) {
      if (c === anchorNode) {
        if (c.nodeType === 3) return acc + anchorOffset;
        let a = acc;
        for (let i = 0; i < Math.min(anchorOffset, c.childNodes.length); i++) a += lenOf(c.childNodes[i]);
        return a;
      }
      if (c.nodeType === 3) acc += c.data.length;
      else if (c.nodeName === 'BR') acc += 1;
      else { const r = walk(c); if (r != null) return r; }
    }
    return null;
  };
  const r = walk(node);
  return r == null ? 0 : r;
}

function placeCaretAtOffset(node, off) {
  node.focus();
  let acc = 0;
  let target = null;
  let targetOff = 0;
  const walk = (n) => {
    for (let i = 0; i < n.childNodes.length; i++) {
      const c = n.childNodes[i];
      if (target) return;
      if (c.nodeType === 3) {
        if (acc + c.data.length >= off) { target = c; targetOff = off - acc; return; }
        acc += c.data.length;
      } else if (c.nodeName === 'BR') {
        if (acc === off) { target = n; targetOff = i; return; }
        acc += 1;
      } else { walk(c); }
    }
  };
  walk(node);
  if (!target) { target = node; targetOff = node.childNodes.length; }
  const range = document.createRange();
  range.setStart(target, targetOff);
  range.collapse(true);
  const sel = document.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

/* ---------- Editing operations ---------- */
function onKeydown(e) {
  const node = e.target.closest('.ms-block');
  if (!node) return;
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    splitBlock(node);
  } else if (e.key === 'Backspace') {
    const sel = document.getSelection();
    if (sel && sel.isCollapsed && textOffsetIn(node, sel.anchorNode, sel.anchorOffset) === 0) {
      const prev = node.previousElementSibling;
      if (!prev || prev === topSpacer) { e.preventDefault(); return; }
      e.preventDefault();
      mergeInto(prev, node);
    }
  }
}

function splitBlock(node) {
  const sel = document.getSelection();
  const off = sel ? textOffsetIn(node, sel.anchorNode, sel.anchorOffset) : 0;
  const full = bodyString(node);
  setBody(node, full.slice(0, off));
  const nn = el('div', { class: 'ms-block', contenteditable: CE_MODE, dataset: { level: '0' } });
  setBody(nn, full.slice(off));
  node.after(nn);
  placeCaretAtOffset(nn, 0);
  scheduleSync();
}

function mergeInto(prev, node) {
  const prevBody = bodyString(prev);
  const caret = prevBody.length;
  setBody(prev, prevBody + bodyString(node));
  node.remove();
  placeCaretAtOffset(prev, caret);
  scheduleSync();
}

function onPaste(e) {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text/plain');
  if (!text) return;
  const sel = document.getSelection();
  const node = blockOf(sel ? sel.anchorNode : null);
  if (!node) return;

  let off = sel ? textOffsetIn(node, sel.anchorNode, sel.anchorOffset) : 0;
  let body = bodyString(node);
  if (sel && !sel.isCollapsed) {
    const endNode = blockOf(sel.focusNode);
    if (endNode === node) {
      const endOff = textOffsetIn(node, sel.focusNode, sel.focusOffset);
      const [a, b] = off <= endOff ? [off, endOff] : [endOff, off];
      body = body.slice(0, a) + body.slice(b);
      off = a;
    }
  }

  const before = body.slice(0, off);
  const after = body.slice(off);
  const lines = text.replace(/\r\n?/g, '\n').split('\n');

  if (lines.length === 1) {
    setBody(node, before + lines[0] + after);
    placeCaretAtOffset(node, (before + lines[0]).length);
  } else {
    setBody(node, before + lines[0]);
    let cursor = node;
    for (let i = 1; i < lines.length - 1; i++) {
      const nn = el('div', { class: 'ms-block', contenteditable: CE_MODE, dataset: { level: '0' } });
      setBody(nn, lines[i]);
      cursor.after(nn);
      cursor = nn;
    }
    const lastBody = lines[lines.length - 1] + after;
    const nn = el('div', { class: 'ms-block', contenteditable: CE_MODE, dataset: { level: '0' } });
    setBody(nn, lastBody);
    cursor.after(nn);
    placeCaretAtOffset(nn, lines[lines.length - 1].length);
  }
  scheduleSync();
}

/* ---------- Heading toolbar ---------- */
function applyHeading(level) {
  const sel = document.getSelection();
  const node = blockOf(sel ? sel.anchorNode : null);
  if (!node || !blocksWrap || !blocksWrap.contains(node)) return;
  node.dataset.level = String(level);
  node.classList.remove('ms-h1', 'ms-h2', 'ms-h3');
  if (level) node.classList.add(`ms-h${level}`);
  refreshToolbar(node);
  scheduleSync();
}

function refreshToolbar(activeNode) {
  const lv = activeNode ? Number(activeNode.dataset.level || 0) : -1;
  for (const [level, btn] of Object.entries(toolbarBtns)) {
    btn.classList.toggle('is-selected', Number(level) === lv);
  }
}

/* ---------- Selection capture + Visual Tracking ---------- */
function clearBundledBlocks() {
  document.querySelectorAll('.ms-block.is-bundled').forEach(n => n.classList.remove('is-bundled'));
}

function onSelectionChange() {
  if (!blocksWrap) return;
  const sel = document.getSelection();
  const project = getState().project;
  
  // Clear previous visual tracking
  clearBundledBlocks();

  if (!sel || !project) { selectionInfo = null; refreshToolbar(null); return; }

  const a = blockOf(sel.anchorNode);
  const focusBlock = blockOf(sel.focusNode);
  if (!a || !blocksWrap.contains(a)) { selectionInfo = null; refreshToolbar(null); return; }
  refreshToolbar(sel.isCollapsed ? a : focusBlock);

  // Apply visual tracking (gold tint) to selected blocks
  if (!sel.isCollapsed && focusBlock && blocksWrap.contains(focusBlock)) {
    const nodes = getBlockNodes();
    for (const node of nodes) {
      if (sel.containsNode(node, true) || node.contains(sel.anchorNode) || node.contains(sel.focusNode)) {
        node.classList.add('is-bundled');
      }
    }
  }

  if (sel.isCollapsed || !focusBlock || !blocksWrap.contains(focusBlock)) {
    selectionInfo = null;
    return;
  }

  const nodes = getBlockNodes();
  const ia = nodes.indexOf(a);
  const ib = nodes.indexOf(focusBlock);
  let first, last, firstOff, lastOff;
  if (ia <= ib) {
    first = a; last = focusBlock;
    firstOff = textOffsetIn(a, sel.anchorNode, sel.anchorOffset);
    lastOff = textOffsetIn(focusBlock, sel.focusNode, sel.focusOffset);
  } else {
    first = focusBlock; last = a;
    firstOff = textOffsetIn(focusBlock, sel.focusNode, sel.focusOffset);
    lastOff = textOffsetIn(a, sel.anchorNode, sel.anchorOffset);
  }
  const fi = mounted.from + nodes.indexOf(first);
  const li = mounted.from + nodes.indexOf(last);
  if (fi >= index.length || li >= index.length) { selectionInfo = null; return; }

  const pre = (i) => (index[i].level ? headingPrefix(index[i].level).length : 0);
  const start = index[fi].s + pre(fi) + firstOff;
  const end = index[li].s + pre(li) + lastOff;
  const text = (project.manuscript.text || '').slice(start, end);
  selectionInfo = text ? { text, start, end } : null;
}

/* ---------- Sync ---------- */
function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(flushManuscriptSync, SYNC_DELAY);
}

export function flushManuscriptSync() {
  clearTimeout(syncTimer);
  syncTimer = null;
  const project = getState().project;
  if (!project || !blocksWrap || project.id !== syncProjectId) return;
  const nodes = getBlockNodes();
  if (!nodes.length) return;

   const strings = nodes.map(nodeToString);
  const oldText = project.manuscript.text || '';
  project.manuscript.viewStart = mounted.from;
  const newText = spliceBlocks(oldText, index, mounted.from, Math.min(mounted.to, index.length), strings);
  if (newText === oldText) return;

  project.manuscript.text = newText;
  index = buildBlockIndex(newText);
  mounted.to = mounted.from + nodes.length;
  touchProject({ silent: true });
}

/* ---------- Paging Engine (Virtualization) ---------- */
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

/* ---------- Accept as Is ---------- */
export function acceptAsIs() {
  flushManuscriptSync();
  const project = getState().project;
  if (!project) return;
  const nodes = getBlockNodes();
  if (!nodes.length) { toast('Nothing to accept.', 'info'); return; }

  const textToPush = nodes.map(nodeToString).join('\n');
  const currentNovel = project.mainNovel.text || '';
  project.mainNovel.text = currentNovel ? currentNovel + '\n\n' + textToPush : textToPush;
  touchProject({ novel: true });
  toast('Accepted to Main Novel.', 'success');
}
