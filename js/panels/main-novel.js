/* =========================================================
   Weaver — js/panels/main-novel.js
   Step 13 + Step 14: Main Novel panel.
   - Read-only AND virtualized (same spacer technique as the
     Manuscript) so massive canon text stays instant.
   - Live word count badge in the header.
   - Recheck: cut selected text back into the Manuscript.
   - jumpNovelToBlock for Hierarchy navigation.
   ========================================================= */

import { el, clear, toast } from '../utils/dom.js';
import { getState, touchProject, subscribe } from '../core/state.js';
import {
  wordCount, buildBlockIndex, windowBounds, headingPrefix,
} from '../utils/text.js';
import { renderManuscript, flushManuscriptSync } from './manuscript.js';

const MAX_MOUNTED = 300;
const SCROLL_THRESHOLD = 300;

let panelEl = null;
let bodyEl = null;
let wrapEl = null;
let wordCountEl = null;
let novelBound = false;

let nIndex = [];
let nMounted = { from: 0, to: 0 };
let lastNovelText = null;
let lastNovelProjectId = null;
let topSpacer = null;
let bottomSpacer = null;

export function mountMainNovel(panel) {
  panelEl = panel;
  bodyEl = panel.querySelector('.panel-body');
  clear(bodyEl);

  wrapEl = el('div', { class: 'mn-scroll' });
  topSpacer = el('div', { class: 'ms-spacer' });
  bottomSpacer = el('div', { class: 'ms-spacer' });
  wrapEl.append(topSpacer, bottomSpacer);
  bodyEl.appendChild(wrapEl);

  const header = panel.querySelector('.panel-header');
  const actions = panel.querySelector('.panel-actions');
  wordCountEl = el('span', { class: 'badge badge-accent mn-word-count', text: '0 words' });
  header.insertBefore(wordCountEl, actions);

  bodyEl.addEventListener('scroll', onScroll);

  if (!novelBound) {
    novelBound = true;
    subscribe((state, change) => {
      if (change.novel && state.view === 'workspace') renderMainNovel();
    });
  }

  renderMainNovel();
}

/* ---------- Render (windowed, read-only) ---------- */
export function renderMainNovel(startBlock = null) {
  if (!wrapEl) return;

  const prevText = lastNovelText;
  const prevScroll = bodyEl.scrollTop;
  const prevFrom = nMounted.from;

  clearNodes();
  topSpacer.style.height = '0px';
  bottomSpacer.style.height = '0px';

  const project = getState().project;
  if (!project) { lastNovelText = null; lastNovelProjectId = null; return; }

  // A different project means a fresh document: forget prior state.
  if (project.id !== lastNovelProjectId) {
    lastNovelProjectId = project.id;
    lastNovelText = null;
  }

  const text = project.mainNovel.text || '';
  if (wordCountEl) wordCountEl.textContent = `${wordCount(text).toLocaleString()} words`;

  nIndex = buildBlockIndex(text);
  if (!text.trim()) {
    topSpacer.after(el('div', { class: 'empty-state' }, [
      el('p', { text: 'Your finalized manuscript will appear here.' }),
      el('p', {
        class: 'launch-empty-hint',
        text: 'Use "Accept as is" in the Manuscript panel to push text here.',
      }),
    ]));
    nMounted = { from: 0, to: 0 };
    lastNovelText = text;
    bodyEl.scrollTop = 0;
    return;
  }

  const maxSent = getState().settings.general.sentencesPerPage ?? 15;
  let start;
  let scrollMode;

  if (startBlock != null) {
    // Explicit jump (Hierarchy): go there, from the top of the window.
    start = Math.max(0, Math.min(startBlock, nIndex.length - 1));
    scrollMode = 'top';
  } else if (lastNovelText === null) {
    // First render of this project.
    start = 0;
    scrollMode = 'top';
  } else if (text !== prevText && text.startsWith(prevText)) {
    // APPEND detected (Accept / AI Accept): show the newly added tail.
    const appendedFrom = Math.min(buildBlockIndex(prevText).length, nIndex.length - 1);
    let s = appendedFrom;
    let budget = 0;
    while (s > 0 && budget < maxSent) { s--; budget += nIndex[s].sentences; }
    start = s;
    scrollMode = 'bottom';
  } else {
    // Removal or other edit (Recheck): keep the reader in place.
    start = Math.min(prevFrom, nIndex.length - 1);
    scrollMode = 'preserve';
  }

  const { end } = windowBounds(nIndex, start, maxSent);
  const to = Math.max(end, start + 1);
  const { frag } = buildFragment(start, to, text);
  bottomSpacer.before(frag);
  nMounted = { from: start, to };
  lastNovelText = text;

  if (scrollMode === 'bottom') bodyEl.scrollTop = bodyEl.scrollHeight;
  else if (scrollMode === 'preserve') bodyEl.scrollTop = Math.min(prevScroll, bodyEl.scrollHeight);
  else bodyEl.scrollTop = 0;
}

export function jumpNovelToBlock(blockIndex) {
  renderMainNovel(blockIndex);
}

function clearNodes() {
  Array.from(wrapEl.children).forEach((n) => {
    if (n !== topSpacer && n !== bottomSpacer) n.remove();
  });
}

function getNodes() {
  return Array.from(wrapEl.children).filter((n) => n !== topSpacer && n !== bottomSpacer);
}

/* Groups mounted blocks into paragraph/heading nodes. Each node
   records how many blocks it consumed (dataset.bcount) so pruning
   keeps the block-window math exact. */
function buildFragment(from, to, text) {
  const frag = document.createDocumentFragment();
  const nodes = [];
  let para = null;
  let paraCount = 0;

  const flush = () => {
    if (para) { para.dataset.bcount = String(paraCount); nodes.push(para); }
    para = null;
    paraCount = 0;
  };

  for (let i = from; i < to; i++) {
    const b = nIndex[i];
    const raw = text.slice(b.s, b.e).replace(/\n$/, '');
    if (b.level) {
      flush();
      const node = el('div', {
        class: `mn-block mn-h${b.level}`,
        dataset: { bcount: '1' },
        text: raw.slice(headingPrefix(b.level).length),
      });
      frag.appendChild(node);
      nodes.push(node);
    } else if (!raw.trim()) {
      flush();
    } else {
      if (!para) {
        para = el('div', { class: 'mn-block' });
        frag.appendChild(para);
        paraCount = 1;
      } else {
        para.appendChild(document.createElement('br'));
        paraCount += 1;
      }
      para.appendChild(document.createTextNode(raw));
    }
  }
  flush();
  return { frag, nodes };
}

/* ---------- Virtualized scroll (scroll-height-delta math) ---------- */
function onScroll() {
  if (!bodyEl || !nIndex.length) return;
  const { scrollTop, scrollHeight, clientHeight } = bodyEl;
  const nearBottom = scrollTop + clientHeight >= scrollHeight - SCROLL_THRESHOLD;
  const nearTop = scrollTop <= SCROLL_THRESHOLD;

  if (nearBottom && nMounted.to < nIndex.length) {
    const maxSent = getState().settings.general.sentencesPerPage ?? 15;
    const { end } = windowBounds(nIndex, nMounted.to, maxSent);
    if (end > nMounted.to) {
      const text = getState().project.mainNovel.text || '';
      const { frag } = buildFragment(nMounted.to, end, text);
      bottomSpacer.before(frag);
      nMounted.to = end;
      pruneTop();
    }
  }

  if (nearTop && nMounted.from > 0) {
    const maxSent = getState().settings.general.sentencesPerPage ?? 15;
    let start = nMounted.from;
    let budget = 0;
    while (start > 0 && budget < maxSent) {
      start--;
      budget += nIndex[start].sentences;
    }
    if (start < nMounted.from) {
      const text = getState().project.mainNovel.text || '';
      const oldHeight = bodyEl.scrollHeight;
      const oldTop = bodyEl.scrollTop;
      const { frag } = buildFragment(start, nMounted.from, text);
      topSpacer.after(frag);
      bodyEl.scrollTop = oldTop + (bodyEl.scrollHeight - oldHeight);
      nMounted.from = start;
      pruneBottom();
    }
  }
}

function pruneTop() {
  const nodes = getNodes();
  if (nodes.length <= MAX_MOUNTED) return;
  const removeCount = nodes.length - MAX_MOUNTED;
  const oldHeight = bodyEl.scrollHeight;
  const oldTop = bodyEl.scrollTop;
  let blocksRemoved = 0;
  for (let i = 0; i < removeCount; i++) {
    blocksRemoved += Number(nodes[i].dataset.bcount || 1);
    nodes[i].remove();
  }
  topSpacer.style.height = (parseFloat(topSpacer.style.height || 0) + (oldHeight - bodyEl.scrollHeight)) + 'px';
  bodyEl.scrollTop = oldTop;
  nMounted.from += blocksRemoved;
}

function pruneBottom() {
  const nodes = getNodes();
  if (nodes.length <= MAX_MOUNTED) return;
  const removeCount = nodes.length - MAX_MOUNTED;
  const oldHeight = bodyEl.scrollHeight;
  let blocksRemoved = 0;
  for (let i = 0; i < removeCount; i++) {
    const node = nodes[nodes.length - 1 - i];
    blocksRemoved += Number(node.dataset.bcount || 1);
    node.remove();
  }
  bottomSpacer.style.height = (parseFloat(bottomSpacer.style.height || 0) + (oldHeight - bodyEl.scrollHeight)) + 'px';
  nMounted.to -= blocksRemoved;
}

/* ---------- Recheck ---------- */
export function recheck() {
  flushManuscriptSync();

  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) {
    toast('Select some text in the Main Novel to recheck.', 'info');
    return;
  }

  const selectedText = sel.toString();
  if (!selectedText.trim()) return;

  const project = getState().project;
  if (!project) return;

  const novelText = project.mainNovel.text || '';
  const idx = novelText.indexOf(selectedText);
  if (idx === -1) {
    toast('Could not find selected text.', 'danger');
    return;
  }

  let newNovel = novelText.slice(0, idx) + novelText.slice(idx + selectedText.length);
  newNovel = newNovel.replace(/\n{3,}/g, '\n\n').trim();
  project.mainNovel.text = newNovel;

  const msText = project.manuscript.text || '';
  project.manuscript.text = msText ? msText + '\n\n' + selectedText : selectedText;

  touchProject({ novel: true });
  toast('Moved to Manuscript for revision.', 'success');

  renderMainNovel();
  renderManuscript();
  sel.removeAllRanges();
}
