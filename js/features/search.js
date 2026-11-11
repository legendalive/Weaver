/* =========================================================
Weaver — js/features/search.js
V4.2: Search, rebuilt for both viewports.

WHY
- Search was display:none at ≤860px — phone users had no way
  to find a name or phrase in a 100k-word book.
- Desktop marked the FIRST match in the mounted DOM, not the
  match you jumped to, so the highlight lied after hit #1.
- Text nodes were never normalised after unmarking, so repeat
  searches fragmented nodes and silently missed matches.

NOW
- Desktop: collapsing magnifier → input + count + list toggle
  + ‹ › + clear, with a browsable results dropdown.
- Phone: full results sheet (bottom half, text stays visible
  above it), reached from ⋯ → Search or Ctrl/Cmd+F.
- Every result shows its panel (draft = cool blue, canon =
  gold) and its nearest chapter heading, with a live snippet.
- Jumping marks the EXACT hit by ordinal, reveals it in the
  visible region, and switches panel/expand state as needed.
- Marks stay transient and sync-safe; nodes are normalised.
========================================================= */
import { el, clear } from '../utils/dom.js';
import { getState, setUI, subscribe } from '../core/state.js';
import { buildBlockIndex, blockAtOffset, extractHeadings } from '../utils/text.js';
import { jumpManuscriptToBlock } from '../panels/manuscript.js';
import { jumpNovelToBlock } from '../panels/main-novel.js';

const STYLE_ID = 'search-style';
const MAX_MATCHES = 2000;
const MAX_ROWS = 150;
const DEBOUNCE = 220;

const CSS = `
:root{
  --ws-ms:#7eb8da;          /* Manuscript = working draft (cool) */
  --ws-ms-soft:rgba(126,184,218,.13);
  --ws-nv:#e0a83c;          /* Main Novel = canon (gold) */
  --ws-nv-soft:rgba(224,168,60,.13);
}

/* ---------- desktop collapsing bar ---------- */
.topbar{position:relative;}
.ws-bar{
  display:inline-flex;align-items:center;justify-content:center;
  width:34px;height:34px;box-sizing:border-box;flex:none;
  background:transparent;border:1px solid transparent;border-radius:var(--radius-md);
  color:var(--muted);cursor:pointer;transition:color .15s ease,background .15s ease;
}
.ws-bar:hover{color:var(--text);background:var(--surface-2);}
.ws-bar .ws-input,.ws-bar .ws-count,.ws-bar .btn{display:none;}
.ws-bar.is-open{
  position:absolute;left:6px;right:6px;top:50%;transform:translateY(-50%);
  z-index:62;width:auto;height:40px;cursor:default;
  display:flex;align-items:center;justify-content:flex-start;gap:4px;padding:0 8px;
  background:var(--surface-2);border:1px solid var(--border-strong);
  box-shadow:0 6px 22px rgba(0,0,0,.45);color:var(--text);
}
.ws-bar.is-open .ws-input{
  display:block;flex:1;min-width:0;height:100%;border:none;background:transparent;
  box-shadow:none;padding:0 6px;font-size:.86rem;color:var(--text);
}
.ws-bar.is-open .ws-input:focus{outline:none;box-shadow:none;}
.ws-bar.is-open .ws-count{display:inline-flex;}
.ws-bar.is-open .btn{display:inline-flex;}
.ws-bar .btn{padding:2px 7px;font-size:.82rem;line-height:1;height:28px;flex:none;}
.ws-count{
  align-items:center;font-family:var(--font-mono);font-size:.66rem;
  color:var(--faint);flex:none;white-space:nowrap;
}
.ws-count.is-novel{color:var(--ws-nv);}
.ws-count.is-manuscript{color:var(--ws-ms);}
.ws-count.is-none{color:var(--danger);}

/* ---------- shared result rows ---------- */
.ws-list{
  overflow-y:auto;display:flex;flex-direction:column;gap:5px;padding:8px;
  scrollbar-width:thin;scrollbar-color:#3a3a40 transparent;
}
.ws-list::-webkit-scrollbar{width:9px;}
.ws-list::-webkit-scrollbar-track{background:#0f0f11;border-radius:8px;}
.ws-list::-webkit-scrollbar-thumb{
  background:linear-gradient(180deg,#3a3a40,#2b2b30);
  border-radius:8px;border:2px solid #0f0f11;
}
.ws-list::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,#e0a83c,#b9822a);}
.ws-row{
  display:flex;flex-direction:column;gap:3px;width:100%;text-align:left;
  padding:8px 10px;border:1px solid var(--border);border-left:3px solid var(--border-strong);
  border-radius:var(--radius-sm);background:var(--surface-2);cursor:pointer;
  transition:border-color .13s ease,background .13s ease,transform .08s ease;
}
.ws-row:hover{background:var(--surface-3);transform:translateX(2px);}
.ws-row.is-manuscript{border-left-color:var(--ws-ms);}
.ws-row.is-novel{border-left-color:var(--ws-nv);}
.ws-row.is-active{background:var(--accent-soft);border-color:rgba(224,168,60,.5);}
.ws-row.is-active.is-manuscript{background:var(--ws-ms-soft);border-color:rgba(126,184,218,.5);}
.ws-row-top{display:flex;align-items:center;gap:7px;min-width:0;}
.ws-tag{
  flex:none;font-family:var(--font-mono);font-size:.56rem;letter-spacing:.09em;
  text-transform:uppercase;padding:2px 7px;border-radius:999px;border:1px solid;
}
.ws-tag.is-manuscript{color:var(--ws-ms);border-color:rgba(126,184,218,.45);background:var(--ws-ms-soft);}
.ws-tag.is-novel{color:var(--ws-nv);border-color:rgba(224,168,60,.45);background:var(--ws-nv-soft);}
.ws-chapter{
  flex:1;min-width:0;font-size:.66rem;color:var(--faint);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.ws-num{flex:none;font-family:var(--font-mono);font-size:.6rem;color:var(--faint);}
.ws-snip{font-size:.78rem;line-height:1.5;color:var(--muted);overflow-wrap:anywhere;}
.ws-snip mark{background:rgba(224,168,60,.28);color:var(--text);border-radius:3px;padding:0 2px;font-weight:600;}
.ws-empty{padding:22px 14px;text-align:center;color:var(--faint);font-size:.8rem;line-height:1.6;}
.ws-more{padding:8px 12px;font-size:.7rem;color:var(--faint);text-align:center;font-family:var(--font-mono);}

/* ---------- desktop dropdown ---------- */
.ws-drop{
  position:fixed;z-index:63;display:none;flex-direction:column;
  background:var(--surface);border:1px solid var(--border-strong);
  border-radius:var(--radius-lg);box-shadow:0 18px 50px rgba(0,0,0,.6);
  overflow:hidden;animation:ws-in .14s ease;
}
.ws-drop.is-open{display:flex;}
@keyframes ws-in{from{opacity:0;transform:translateY(-6px);}to{opacity:1;transform:none;}}
.ws-drop-head{
  display:flex;align-items:center;gap:8px;padding:9px 12px;
  border-bottom:1px solid var(--border);flex:none;
}
.ws-drop-title{font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:650;}
.ws-drop .ws-list{max-height:min(52vh,420px);}

/* ---------- filter chips ---------- */
.ws-chips{display:flex;gap:5px;margin-left:auto;}
.ws-chip{
  padding:3px 10px;border-radius:999px;border:1px solid var(--border);
  background:transparent;color:var(--faint);font-size:.68rem;font-weight:600;cursor:pointer;
  transition:color .13s ease,border-color .13s ease,background .13s ease;
}
.ws-chip:hover{color:var(--text);}
.ws-chip.is-on{background:var(--accent-soft);border-color:rgba(224,168,60,.5);color:var(--accent);}

/* ---------- mobile sheet ---------- */
.ws-scrim{
  position:fixed;inset:0;z-index:94;display:none;
  background:rgba(5,5,6,.5);backdrop-filter:blur(2px);
}
.ws-scrim.is-open{display:block;animation:ws-fade .16s ease;}
@keyframes ws-fade{from{opacity:0;}to{opacity:1;}}
.ws-sheet{
  position:fixed;left:0;right:0;bottom:0;z-index:95;
  height:56vh;display:none;flex-direction:column;
  background:var(--surface);border-top:1px solid var(--border-strong);
  border-radius:16px 16px 0 0;box-shadow:0 -14px 44px rgba(0,0,0,.6);
  padding-bottom:env(safe-area-inset-bottom,0px);
}
.ws-sheet.is-open{display:flex;animation:ws-up .2s cubic-bezier(.2,.8,.3,1);}
@keyframes ws-up{from{transform:translateY(100%);}to{transform:none;}}
.ws-grab{width:38px;height:4px;border-radius:999px;background:var(--border-strong);margin:8px auto 2px;flex:none;}
.ws-sheet-head{display:flex;align-items:center;gap:8px;padding:6px 12px 8px;flex:none;}
.ws-sheet-head .ws-input{
  flex:1;min-width:0;padding:9px 12px;border-radius:999px;
  border:1px solid var(--border-strong);background:var(--surface-2);
  color:var(--text);font-size:.88rem;
}
.ws-sheet-head .ws-input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft);}
.ws-sheet-meta{
  display:flex;align-items:center;gap:8px;padding:0 12px 8px;flex:none;
  border-bottom:1px solid var(--border);
}
.ws-sheet .ws-list{flex:1;min-height:0;}
.ws-sheet-foot{
  display:flex;align-items:center;gap:8px;padding:8px 12px;flex:none;
  border-top:1px solid var(--border);background:var(--surface-2);
}
.ws-sheet-foot .btn{flex:1;justify-content:center;}
.ws-foot-count{
  flex:none;min-width:74px;text-align:center;
  font-family:var(--font-mono);font-size:.72rem;color:var(--muted);
}

/* ---------- in-text marks ---------- */
mark.ws-hit{
  background:rgba(224,168,60,.4);color:inherit;border-radius:2px;
  box-shadow:0 0 0 2px rgba(224,168,60,.22);
}
.ws-hit-block{
  background:rgba(224,168,60,.1);border-radius:4px;
  box-shadow:inset 3px 0 0 var(--accent);
}

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

/* ---------- state ---------- */
let bar = null, input = null, countEl = null, drop = null, dropList = null;
let sheet = null, scrim = null, sheetInput = null, sheetList = null, sheetCount = null, footCount = null;
let chipSets = [];
let query = '';
let filter = 'all';
let hits = { manuscript: [], novel: [] };
let meta = { manuscript: null, novel: null };
let allResults = [];
let pos = -1;
let debounce = null;
let dropOpen = false;

function isMobile() { return window.matchMedia('(max-width:860px)').matches; }
function sheetOpen() { return !!(sheet && sheet.classList.contains('is-open')); }
function panelLabel(k) { return k === 'manuscript' ? 'Manuscript' : 'Main Novel'; }
function panelSel(k) { return `.panel[data-panel="${k === 'manuscript' ? 'manuscript' : 'novel'}"]`; }

function shown() {
  return filter === 'all' ? allResults : allResults.filter((r) => r.panel === filter);
}

/* ---------- magnifier (independent of the icon registry) ---------- */
function magnifier(cls) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('round', 'round');
  if (cls) svg.setAttribute('class', cls);
  const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c.setAttribute('cx', '11'); c.setAttribute('cy', '11'); c.setAttribute('r', '7.5');
  const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  l.setAttribute('x1', '20.5'); l.setAttribute('y1', '20.5');
  l.setAttribute('x2', '16.4'); l.setAttribute('y2', '16.4');
  svg.append(c, l);
  return svg;
}

/* ---------- matching ---------- */
function findHits(text, q) {
  const out = [];
  if (!q || !text) return out;
  const hay = text.toLowerCase();
  const needle = q.toLowerCase();
  let i = hay.indexOf(needle);
  while (i >= 0 && out.length < MAX_MATCHES) {
    out.push(i);
    i = hay.indexOf(needle, i + needle.length);
  }
  return out;
}

function recompute() {
  hits = { manuscript: [], novel: [] };
  meta = { manuscript: null, novel: null };
  allResults = [];
  pos = -1;
  const project = getState().project;
  if (!project || !query) return;
  for (const key of ['manuscript', 'novel']) {
    const text = key === 'manuscript'
      ? (project.manuscript.text || '')
      : (project.mainNovel.text || '');
    const arr = findHits(text, query);
    hits[key] = arr;
    if (!arr.length) continue;
    const blocks = buildBlockIndex(text);
    meta[key] = { text, blocks, headings: extractHeadings(text, blocks) };
    for (const off of arr) allResults.push({ panel: key, off });
  }
  if (shown().length) pos = 0;
}

function headingFor(r) {
  const m = meta[r.panel];
  if (!m) return '';
  const bi = blockAtOffset(m.blocks, r.off);
  let title = '';
  for (const h of m.headings) {
    if (h.index <= bi) title = h.title;
    else break;
  }
  return title;
}

function snippetFor(r) {
  const m = meta[r.panel];
  const s = Math.max(0, r.off - 44);
  const e = Math.min(m.text.length, r.off + query.length + 66);
  const flat = (x) => x.replace(/\s+/g, ' ');
  return {
    pre: (s > 0 ? '…' : '') + flat(m.text.slice(s, r.off)).replace(/^#+\s*/, ''),
    hit: flat(m.text.slice(r.off, r.off + query.length)),
    post: flat(m.text.slice(r.off + query.length, e)) + (e < m.text.length ? '…' : ''),
  };
}

/* ---------- marking (exact ordinal, sync-safe) ---------- */
function clearMarks() {
  const touched = new Set();
  document.querySelectorAll('mark.ws-hit').forEach((m) => {
    const parent = m.parentNode;
    m.replaceWith(document.createTextNode(m.textContent));
    if (parent) touched.add(parent);
  });
  touched.forEach((p) => { try { p.normalize(); } catch (e) {} });
  document.querySelectorAll('.ws-hit-block').forEach((n) => n.classList.remove('ws-hit-block'));
}

function markNth(sel, q, n) {
  const body = document.querySelector(sel + ' .panel-body');
  if (!body) return null;
  const needle = q.toLowerCase();
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  let node, seen = 0;
  while ((node = walker.nextNode())) {
    let idx = node.data.toLowerCase().indexOf(needle);
    while (idx >= 0) {
      if (seen === n) {
        const startNode = node.splitText(idx);
        startNode.splitText(needle.length);
        const mark = document.createElement('mark');
        mark.className = 'ws-hit';
        startNode.parentNode.insertBefore(mark, startNode);
        mark.appendChild(startNode);
        return mark;
      }
      seen++;
      idx = node.data.toLowerCase().indexOf(needle, idx + needle.length);
    }
  }
  return null;
}

/* Cross-line queries can't be marked inline — light the block instead. */
function markBlockFallback(sel) {
  const node = document.querySelector(sel + ' .panel-body .ms-block, ' + sel + ' .panel-body .mn-block');
  if (!node) return null;
  node.classList.add('ws-hit-block');
  return node;
}

function revealMark(node, sel) {
  const body = document.querySelector(sel + ' .panel-body');
  if (!body || !node) return;
  const bRect = body.getBoundingClientRect();
  const nRect = node.getBoundingClientRect();
  const frac = (isMobile() && sheetOpen()) ? 0.14 : 0.40;
  body.scrollTop += (nRect.top - bRect.top) - body.clientHeight * frac;
}

function ensurePanelVisible(key) {
  if (isMobile()) {
    const pills = document.querySelectorAll('.panel-pills .pill');
    const i = key === 'manuscript' ? 0 : 1;
    if (pills[i]) pills[i].click();
    return;
  }
  const exp = getState().ui.expandedPanel;
  if (exp && exp !== key) setUI({ expandedPanel: key });
}

/* ---------- navigation ---------- */
function goto(index) {
  const list = shown();
  if (!list.length) return;
  pos = ((index % list.length) + list.length) % list.length;
  const r = list[pos];
  const project = getState().project;
  if (!project) return;

  const text = r.panel === 'manuscript'
    ? (project.manuscript.text || '')
    : (project.mainNovel.text || '');
  const blocks = buildBlockIndex(text);
  if (!blocks.length) return;
  const bi = blockAtOffset(blocks, r.off);
  const winStart = blocks[bi].s;
  let ordinal = 0;
  for (const h of hits[r.panel]) if (h >= winStart && h < r.off) ordinal++;

  clearMarks();
  ensurePanelVisible(r.panel);
  if (r.panel === 'manuscript') jumpManuscriptToBlock(bi);
  else jumpNovelToBlock(bi);

  requestAnimationFrame(() => {
    const sel = panelSel(r.panel);
    const node = markNth(sel, query, ordinal) || markBlockFallback(sel);
    revealMark(node, sel);
    paintActiveRow();
    paintCounts();
  });
}

function step(delta) {
  if (!shown().length) return;
  goto(pos + delta);
}

/* ---------- counts ---------- */
function paintCounts() {
  const list = shown();
  const total = list.length;
  const label = !query ? '' : (total ? `${pos + 1}/${total}` : '0/0');
  const cur = total && pos >= 0 ? list[pos].panel : null;
  for (const node of [countEl, sheetCount, footCount]) {
    if (!node) continue;
    node.textContent = node === sheetCount
      ? (query ? (total ? `${total} match${total === 1 ? '' : 'es'}` : 'No matches') : 'Type to search')
      : label;
    node.classList.remove('is-novel', 'is-manuscript', 'is-none');
    if (query && !total) node.classList.add('is-none');
    else if (cur) node.classList.add(cur === 'novel' ? 'is-novel' : 'is-manuscript');
  }
  if (countEl && cur) countEl.title = `Match ${pos + 1} of ${total} · ${panelLabel(cur)}`;
}

/* ---------- result rows ---------- */
function resultRow(r, i) {
  const sn = snippetFor(r);
  const chapter = headingFor(r);
  const snip = el('div', { class: 'ws-snip' }, [
    document.createTextNode(sn.pre),
    el('mark', { text: sn.hit }),
    document.createTextNode(sn.post),
  ]);
  return el('button', {
    class: `ws-row is-${r.panel}` + (i === pos ? ' is-active' : ''),
    dataset: { wsRow: String(i) },
    onclick: () => {
      goto(i);
      if (!isMobile()) setDropOpen(false);
    },
  }, [
    el('div', { class: 'ws-row-top' }, [
      el('span', { class: `ws-tag is-${r.panel}`, text: r.panel === 'manuscript' ? 'Draft' : 'Canon' }),
      el('span', { class: 'ws-chapter', text: chapter || panelLabel(r.panel) }),
      el('span', { class: 'ws-num', text: `#${i + 1}` }),
    ]),
    snip,
  ]);
}

function paintList(host) {
  if (!host) return;
  clear(host);
  const list = shown();
  if (!query) {
    host.appendChild(el('div', {
      class: 'ws-empty',
      text: 'Search across your Manuscript and Main Novel. Results show the chapter they live in.',
    }));
    return;
  }
  if (!list.length) {
    host.appendChild(el('div', {
      class: 'ws-empty',
      text: filter === 'all'
        ? `No matches for “${query}”.`
        : `No matches in the ${panelLabel(filter)}. Try “All”.`,
    }));
    return;
  }
  const cap = Math.min(list.length, MAX_ROWS);
  for (let i = 0; i < cap; i++) host.appendChild(resultRow(list[i], i));
  if (list.length > cap) {
    host.appendChild(el('div', {
      class: 'ws-more',
      text: `Showing first ${cap} of ${list.length} — refine your search to narrow it down.`,
    }));
  }
}

function paintActiveRow() {
  for (const host of [dropList, sheetList]) {
    if (!host) continue;
    host.querySelectorAll('.ws-row').forEach((n) => {
      n.classList.toggle('is-active', Number(n.dataset.wsRow) === pos);
    });
    const active = host.querySelector('.ws-row.is-active');
    if (active && host.contains(active)) {
      const hRect = host.getBoundingClientRect();
      const aRect = active.getBoundingClientRect();
      if (aRect.top < hRect.top || aRect.bottom > hRect.bottom) {
        host.scrollTop += (aRect.top - hRect.top) - host.clientHeight * 0.35;
      }
    }
  }
}

function paintAll() {
  paintList(dropList);
  paintList(sheetList);
  paintCounts();
  paintChips();
}

/* ---------- filter chips ---------- */
function buildChips() {
  const wrap = el('div', { class: 'ws-chips' });
  const defs = [['all', 'All'], ['manuscript', 'Draft'], ['novel', 'Canon']];
  const btns = defs.map(([key, label]) => el('button', {
    class: 'ws-chip' + (key === filter ? ' is-on' : ''),
    text: label,
    onclick: () => {
      filter = key;
      const list = shown();
      pos = list.length ? 0 : -1;
      paintAll();
      if (list.length) goto(0);
    },
  }, []));
  btns.forEach((b, i) => { b.dataset.wsFilter = defs[i][0]; wrap.appendChild(b); });
  chipSets.push(btns);
  return wrap;
}

function paintChips() {
  for (const set of chipSets) {
    for (const b of set) b.classList.toggle('is-on', b.dataset.wsFilter === filter);
  }
}

/* ---------- query plumbing ---------- */
function applyQuery(value, { jump = true } = {}) {
  query = (value || '').trim();
  if (input && input.value !== value) input.value = value;
  if (sheetInput && sheetInput.value !== value) sheetInput.value = value;
  clearMarks();
  recompute();
  paintAll();
  if (!query) { setDropOpen(false); return; }
  if (shown().length && jump) goto(0);
  if (!isMobile()) setDropOpen(shown().length > 0);
}

function onInput(value) {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    applyQuery(value);
    if (bar) bar.classList.toggle('is-open', true);
  }, DEBOUNCE);
}

function clearSearch() {
  clearTimeout(debounce);
  applyQuery('');
  if (input) input.value = '';
  if (sheetInput) sheetInput.value = '';
}

/* ---------- desktop bar + dropdown ---------- */
function setDropOpen(open) {
  dropOpen = open;
  if (!drop) return;
  drop.classList.toggle('is-open', open && !isMobile());
  if (open) positionDrop();
}

function positionDrop() {
  if (!drop || !bar) return;
  const topbar = document.querySelector('.topbar');
  const r = (topbar || bar).getBoundingClientRect();
  const width = Math.min(560, window.innerWidth - 24);
  drop.style.top = Math.round(r.bottom + 6) + 'px';
  drop.style.left = Math.round(Math.max(12, Math.min(r.left, window.innerWidth - width - 12))) + 'px';
  drop.style.width = width + 'px';
}

function buildDrop() {
  if (drop) return drop;
  dropList = el('div', { class: 'ws-list' });
  drop = el('div', { class: 'ws-drop' }, [
    el('div', { class: 'ws-drop-head' }, [
      el('span', { class: 'ws-drop-title', text: 'Results' }),
      buildChips(),
    ]),
    dropList,
  ]);
  document.body.appendChild(drop);
  paintList(dropList);
  return drop;
}

function buildBar() {
  input = el('input', {
    class: 'input ws-input', type: 'text', placeholder: 'Search manuscript & novel…',
    value: query,
  });
  countEl = el('span', { class: 'ws-count' });
  const listBtn = el('button', {
    class: 'btn btn-ghost', title: 'Show result list', text: '☰',
    onclick: () => { buildDrop(); setDropOpen(!dropOpen); },
  });
  const prev = el('button', {
    class: 'btn btn-ghost', title: 'Previous match (Shift+Enter)', text: '‹',
    onclick: () => step(-1),
  });
  const next = el('button', {
    class: 'btn btn-ghost', title: 'Next match (Enter)', text: '›',
    onclick: () => step(1),
  });
  const clr = el('button', {
    class: 'btn btn-ghost', title: 'Clear search (Esc)', text: '×',
    onclick: () => { clearSearch(); if (input) input.blur(); if (bar) bar.classList.remove('is-open'); },
  });

  input.addEventListener('input', () => onInput(input.value));
  input.addEventListener('focus', () => {
    if (bar) bar.classList.add('is-open');
    if (query && shown().length) { buildDrop(); setDropOpen(true); }
  });
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (!query && bar && !bar.contains(document.activeElement)) bar.classList.remove('is-open');
    }, 140);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); buildDrop(); setDropOpen(true); step(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    else if (e.key === 'Escape') {
      e.preventDefault();
      if (dropOpen) setDropOpen(false);
      else { clearSearch(); input.blur(); if (bar) bar.classList.remove('is-open'); }
    }
  });

  bar = el('div', {
    class: 'ws-bar' + (query ? ' is-open' : ''),
    dataset: { wsBound: '1' },
    title: 'Search (Ctrl/Cmd+F)',
  }, [magnifier('icon'), input, countEl, listBtn, prev, next, clr]);

  bar.addEventListener('click', () => {
    if (!bar.classList.contains('is-open')) {
      bar.classList.add('is-open');
      setTimeout(() => input.focus(), 20);
    }
  });
  return bar;
}

/* ---------- mobile sheet ---------- */
function buildSheet() {
  if (sheet) return sheet;
  sheetInput = el('input', {
    class: 'ws-input', type: 'search', placeholder: 'Search your book…', value: query,
  });
  sheetCount = el('span', { class: 'ws-count' });
  footCount = el('span', { class: 'ws-foot-count' });
  sheetList = el('div', { class: 'ws-list' });

  sheetInput.addEventListener('input', () => onInput(sheetInput.value));
  sheetInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
    if (e.key === 'Escape') { e.preventDefault(); closeMobileSearch(); }
  });

  const closeBtn = el('button', {
    class: 'btn btn-ghost btn-icon btn-sm', title: 'Close search', 'aria-label': 'Close search',
    text: '×', onclick: () => closeMobileSearch(),
  });

  scrim = el('div', { class: 'ws-scrim', onclick: () => closeMobileSearch() });
  sheet = el('div', { class: 'ws-sheet', role: 'dialog', 'aria-label': 'Search' }, [
    el('div', { class: 'ws-grab' }),
    el('div', { class: 'ws-sheet-head' }, [magnifier('icon'), sheetInput, closeBtn]),
    el('div', { class: 'ws-sheet-meta' }, [sheetCount, buildChips()]),
    sheetList,
    el('div', { class: 'ws-sheet-foot' }, [
      el('button', { class: 'btn btn-sm', text: '‹ Prev', onclick: () => step(-1) }),
      footCount,
      el('button', { class: 'btn btn-sm', text: 'Next ›', onclick: () => step(1) }),
    ]),
  ]);
  document.body.append(scrim, sheet);
  paintList(sheetList);
  return sheet;
}

export function openMobileSearch() {
  ensureStyle();
  buildSheet();
  scrim.classList.add('is-open');
  sheet.classList.add('is-open');
  paintAll();
  setTimeout(() => { sheetInput.focus(); sheetInput.select(); }, 80);
}

export function closeMobileSearch() {
  if (sheet) sheet.classList.remove('is-open');
  if (scrim) scrim.classList.remove('is-open');
}

/* ---------- ⋯ More-sheet entry (no workspace.js edit needed) ---------- */
function injectMoreEntry() {
  const host = document.querySelector('.tb-more-sheet');
  if (!host || host.querySelector('[data-ws-search-entry]')) return;
  const row = el('button', {
    class: 'btn btn-sm',
    dataset: { wsSearchEntry: '1' },
    onclick: () => { host.classList.remove('is-open'); openMobileSearch(); },
  }, [magnifier('icon-sm'), el('span', { text: 'Search' })]);
  host.insertBefore(row, host.firstChild);
}

function bindMoreEntry() {
  const more = document.querySelector('.tb-more');
  if (!more || more.dataset.wsSearchBound) return;
  more.dataset.wsSearchBound = '1';
  more.addEventListener('click', () => requestAnimationFrame(injectMoreEntry));
}

/* ---------- bind / lifecycle ---------- */
function bind() {
  const host = document.querySelector('.topbar-left');
  if (host) {
    const old = host.querySelector('.ws-bar');
    if (!old || !old.dataset.wsBound) {
      if (old) old.remove();
      host.appendChild(buildBar());
    } else {
      bar = old;
      input = old.querySelector('.ws-input');
      countEl = old.querySelector('.ws-count');
    }
  }
  bindMoreEntry();
  paintCounts();
}

function resetAll() {
  clearTimeout(debounce);
  clearMarks();
  query = '';
  filter = 'all';
  hits = { manuscript: [], novel: [] };
  meta = { manuscript: null, novel: null };
  allResults = [];
  pos = -1;
  setDropOpen(false);
  closeMobileSearch();
  if (input) input.value = '';
  if (sheetInput) sheetInput.value = '';
  if (bar) bar.classList.remove('is-open');
  paintAll();
}

export function initSearch() {
  ensureStyle();
  buildDrop();
  bind();

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'f' || e.key === 'F')) {
      const st = getState();
      if (st.view !== 'workspace' || !st.project) return;
      e.preventDefault();
      if (isMobile()) openMobileSearch();
      else {
        if (bar) bar.classList.add('is-open');
        if (input) { input.focus(); input.select(); }
      }
    }
  });

  window.addEventListener('resize', () => {
    if (dropOpen) positionDrop();
    if (!isMobile()) closeMobileSearch();
  });

  document.addEventListener('click', (e) => {
    if (!dropOpen || !drop) return;
    if (drop.contains(e.target) || (bar && bar.contains(e.target))) return;
    setDropOpen(false);
  });

  subscribe((state, change) => {
    if (state.view !== 'workspace') {
      if (change.view) resetAll();
      return;
    }
    if (change.view) { resetAll(); bind(); }
    else if (change.project && !change.silent) { clearMarks(); recompute(); paintAll(); }
  });
}
