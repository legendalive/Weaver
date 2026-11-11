/* =========================================================
Weaver — js/panels/main-novel.js
Step 13 + Step 14: Main Novel panel.
Read-only AND virtualized (same spacer technique as the
Manuscript) so massive canon text stays instant.
Live word count badge in the header.
Recheck: cut selected text back into the Manuscript.
jumpNovelToBlock for Hierarchy navigation.
V4: Recheck captures a return "seam" (project.recheckSlot).
Listens for 'weaver-novel-jump' to scroll to a landing spot.
V4.1 HARDENED RECHECK (perf-bounded):
- Sticky, offset-based selection capture on selectionchange.
  Button taps, focus shifts and re-renders cannot lose it.
- Multi-page selections survive scrolling: pruning is relaxed
  while selecting, but HARD-CAPPED at SEL_MAX_MOUNTED nodes so
  even a whole-book drag can never mount the whole book.
- Selection snapshot is debounced (once per settled drag),
  never copied per animation frame.
- Recheck cuts by exact offsets, with a text-search fallback.
========================================================= */
import { el, clear, toast, confirmDialog } from '../utils/dom.js';
import { getState, touchProject, subscribe } from '../core/state.js';
import {
  wordCount, buildBlockIndex, windowBounds, headingPrefix, blockAtOffset,
} from '../utils/text.js';
import { renderManuscript, flushManuscriptSync } from './manuscript.js';

const MAX_MOUNTED = 300;          // ceiling at rest
const SEL_MAX_MOUNTED = 1200;     // ceiling while a selection is live
const SCROLL_THRESHOLD = 300;
const SEAM_CTX = 120;
const SNAPSHOT_DELAY = 200;

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
let pendingJumpOffset = null;

/* ---------- Selection state ----------
   novelSel = { start, end, text } in RAW-TEXT offsets.
   Sticky: collapsing the live selection does not clear it.
   liveActive = a non-collapsed selection currently inside
   this panel (relaxes the prune ceiling, never removes it). */
let novelSel = null;
let liveActive = false;
let selBound = false;
let selTick = false;
let snapTimer = null;

if (typeof document !== 'undefined') {
  document.addEventListener('weaver-novel-jump', (e) => {
    pendingJumpOffset = (e && e.detail && typeof e.detail.offset === 'number')
      ? e.detail.offset
      : null;
  });
}

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
  wordCountEl = el('span', {
    class: 'badge badge-accent mn-word-count',
    style: { whiteSpace: 'nowrap', flex: 'none' },
    text: '0 words',
  });
  header.insertBefore(wordCountEl, actions);

  bodyEl.addEventListener('scroll', onScroll);

  if (!novelBound) {
    novelBound = true;
    subscribe((state, change) => {
      if (change.novel && state.view === 'workspace') renderMainNovel();
    });
  }
  if (!selBound) {
    selBound = true;
    document.addEventListener('selectionchange', () => {
      if (selTick) return;
      selTick = true;
      requestAnimationFrame(() => { selTick = false; captureSelection(); });
    });
  }
  renderMainNovel();
}

/* =========================================================
   SELECTION → RAW OFFSET MAPPING
   ========================================================= */
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function getNodes() {
  return Array.from(wrapEl.children).filter((n) => n !== topSpacer && n !== bottomSpacer);
}

function nodeBlockStart(node) {
  let acc = nMounted.from;
  for (const n of getNodes()) {
    if (n === node) return acc;
    acc += Number(n.dataset.bcount || 1);
  }
  return null;
}

function lenOf(c) {
  if (c.nodeType === 3) return c.data.length;
  if (c.nodeName === 'BR') return 1;
  let s = 0;
  for (const g of c.childNodes) s += lenOf(g);
  return s;
}

/* Offset inside a block node, counting <br> as one newline. */
function offsetWithin(blockNode, targetNode, targetOffset) {
  if (targetNode === blockNode) {
    let acc = 0;
    for (let i = 0; i < Math.min(targetOffset, blockNode.childNodes.length); i++) {
      acc += lenOf(blockNode.childNodes[i]);
    }
    return acc;
  }
  let acc = 0;
  const walk = (n) => {
    for (const c of n.childNodes) {
      if (c === targetNode) {
        if (c.nodeType === 3) return acc + targetOffset;
        let a = acc;
        for (let i = 0; i < Math.min(targetOffset, c.childNodes.length); i++) a += lenOf(c.childNodes[i]);
        return a;
      }
      if (c.nodeType === 3) acc += c.data.length;
      else if (c.nodeName === 'BR') acc += 1;
      else { const r = walk(c); if (r != null) return r; }
    }
    return null;
  };
  const r = walk(blockNode);
  return r == null ? 0 : r;
}

function rawOffsetFor(node, off) {
  if (!wrapEl || !node) return null;
  const elem = node.nodeType === 3 ? node.parentElement : node;
  if (!elem || !wrapEl.contains(elem)) return null;
  const blockNode = elem.closest('.mn-block');
  if (!blockNode || !wrapEl.contains(blockNode)) return null;
  const first = nodeBlockStart(blockNode);
  if (first == null || !nIndex[first]) return null;
  const b = nIndex[first];
  const prefix = b.level ? headingPrefix(b.level).length : 0;
  const within = offsetWithin(blockNode, node, off);
  const count = Number(blockNode.dataset.bcount || 1);
  const last = nIndex[Math.min(first + count - 1, nIndex.length - 1)];
  return clamp(b.s + prefix + within, b.s, last ? last.e : b.e);
}

/* Snapshot the selected text ONCE, after the drag settles.
   Never runs per animation frame. */
function scheduleSnapshot() {
  clearTimeout(snapTimer);
  snapTimer = setTimeout(() => {
    snapTimer = null;
    if (!novelSel) return;
    const t = (getState().project && getState().project.mainNovel.text) || '';
    novelSel.text = t.slice(novelSel.start, novelSel.end);
  }, SNAPSHOT_DELAY);
}

function captureSelection() {
  if (!wrapEl) return;
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) { liveActive = false; return; }

  const inNovel = wrapEl.contains(sel.anchorNode) || wrapEl.contains(sel.focusNode);
  if (!sel.isCollapsed && !inNovel) { novelSel = null; liveActive = false; return; }
  if (sel.isCollapsed) { liveActive = false; return; }   // keep sticky offsets

  const a = rawOffsetFor(sel.anchorNode, sel.anchorOffset);
  const f = rawOffsetFor(sel.focusNode, sel.focusOffset);
  if (a == null && f == null) return;

  let start = a != null ? a : (novelSel ? novelSel.start : null);
  let end = f != null ? f : (novelSel ? novelSel.end : null);
  if (start == null || end == null) return;
  if (start > end) { const t = start; start = end; end = t; }
  if (end <= start) return;

  const prev = novelSel;
  const same = prev && prev.start === start && prev.end === end;
  novelSel = { start, end, text: same ? prev.text : '' };
  liveActive = true;
  if (!same) scheduleSnapshot();
}

function clearNovelSelection() {
  clearTimeout(snapTimer);
  snapTimer = null;
  novelSel = null;
  liveActive = false;
  const sel = document.getSelection();
  if (sel) sel.removeAllRanges();
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
  if (!project) {
    lastNovelText = null; lastNovelProjectId = null; novelSel = null;
    return;
  }

  if (project.id !== lastNovelProjectId) {
    lastNovelProjectId = project.id;
    lastNovelText = null;
    novelSel = null;
  }

  const text = project.mainNovel.text || '';
  if (wordCountEl) wordCountEl.textContent = `${wordCount(text).toLocaleString()} words`;
  nIndex = buildBlockIndex(text);

  if (!text.trim()) {
    topSpacer.after(el('div', { class: 'empty-state' }, [
      el('p', { text: 'Your finalized manuscript will appear here.' }),
      el('p', {
        class: 'launch-empty-hint',
        text: 'Use "Accept highlighted" or "Accept whole" in the Manuscript panel to push text here.',
      }),
    ]));
    nMounted = { from: 0, to: 0 };
    lastNovelText = text;
    pendingJumpOffset = null;
    novelSel = null;
    bodyEl.scrollTop = 0;
    return;
  }

  const maxSent = getState().settings.general.sentencesPerPage ?? 15;
  let start;
  let scrollMode;
  if (pendingJumpOffset != null) {
    start = Math.max(0, Math.min(blockAtOffset(nIndex, pendingJumpOffset), nIndex.length - 1));
    scrollMode = 'top';
    pendingJumpOffset = null;
  } else if (startBlock != null) {
    start = Math.max(0, Math.min(startBlock, nIndex.length - 1));
    scrollMode = 'top';
  } else if (lastNovelText === null) {
    start = 0;
    scrollMode = 'top';
  } else if (text !== prevText && text.startsWith(prevText)) {
    const appendedFrom = Math.min(buildBlockIndex(prevText).length, nIndex.length - 1);
    let s = appendedFrom;
    let budget = 0;
    while (s > 0 && budget < maxSent) { s--; budget += nIndex[s].sentences; }
    start = s;
    scrollMode = 'bottom';
  } else {
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

/* ---------- Virtualized scroll ----------
   Pruning always runs; only the CEILING changes while a
   selection is live. The book is never fully mounted. */
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
  const cap = liveActive ? SEL_MAX_MOUNTED : MAX_MOUNTED;
  if (nodes.length <= cap) return;
  const removeCount = nodes.length - cap;
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
  const cap = liveActive ? SEL_MAX_MOUNTED : MAX_MOUNTED;
  if (nodes.length <= cap) return;
  const removeCount = nodes.length - cap;
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

/* ---------- Recheck (offset-exact) ---------- */
export async function recheck() {
  flushManuscriptSync();
  const project = getState().project;
  if (!project) return;
  const novelText = project.mainNovel.text || '';

  let start = null;
  let end = null;

  const live = document.getSelection();
  if (live && !live.isCollapsed && wrapEl &&
      (wrapEl.contains(live.anchorNode) || wrapEl.contains(live.focusNode))) {
    const a = rawOffsetFor(live.anchorNode, live.anchorOffset);
    const f = rawOffsetFor(live.focusNode, live.focusOffset);
    if (a != null && f != null) { start = Math.min(a, f); end = Math.max(a, f); }
  }
  if ((start == null || end == null || end <= start) && novelSel) {
    start = novelSel.start;
    end = novelSel.end;
  }

  let selectedText = '';
  if (start != null && end != null && end > start) {
    start = clamp(start, 0, novelText.length);
    end = clamp(end, 0, novelText.length);
    selectedText = novelText.slice(start, end);
  }
  if (!selectedText.trim() && novelSel && novelSel.text) {
    const idx = novelText.indexOf(novelSel.text);
    if (idx >= 0) { start = idx; end = idx + novelSel.text.length; selectedText = novelSel.text; }
  }
  if (!selectedText.trim()) {
    toast('Select some text in the Main Novel to recheck.', 'info');
    return;
  }

  const idx = start;

  if (project.recheckSlot) {
    const ok = await confirmDialog({
      title: 'Replace pending return slot?',
      message: 'A previous Recheck is still waiting to be accepted back. Rechecking now replaces its return address — that earlier text will stay where it is. Continue?',
      confirmLabel: 'Replace',
      danger: false,
    });
    if (!ok) return;
  }

  const before = novelText.slice(Math.max(0, idx - SEAM_CTX), idx);
  const after = novelText.slice(idx + selectedText.length, idx + selectedText.length + SEAM_CTX);
  const snippet = selectedText.trim().replace(/\s+/g, ' ').slice(0, 60);

  let newNovel = novelText.slice(0, idx) + novelText.slice(idx + selectedText.length);
  newNovel = newNovel.replace(/\n{3,}/g, '\n\n').trim();
  project.mainNovel.text = newNovel;
  project.recheckSlot = { before, after, snippet, takenAt: Date.now() };

  const msText = project.manuscript.text || '';
  project.manuscript.text = msText ? msText + '\n' + selectedText : selectedText;

  clearNovelSelection();
  touchProject({ novel: true });
  toast('Moved to Manuscript — it will return to its place when you accept.', 'success');
  renderMainNovel();
  renderManuscript();
}
