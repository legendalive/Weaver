/* =========================================================
Weaver — js/views/workspace.js
v2 Stage 7: BLANK-PROOF workspace + mobile panel fix.
V3.3a: Plot button. V3.3c: Plot opens Plot Reference.
V3.8: mobile panel pills (one full-height panel at a time,
remember-last, AI attention dot).
V4: Accept split footer · Cover button · Focus button ·
Recheck return-slot tooltips · mobile topbar declutter.

V4.4 PANEL SEAMS (fix):
The global sheet targets `.resizer`, but this view renders
`.panel-resizer` — so on desktop the separators had NO width
and NO background. Manuscript|Novel only appeared divided
because of toolbar/prose contrast; Novel|AI had no edge at all.
Both separators are now real 10px grooved columns with a
hairline rule, a dashed grip, hover/drag glow, keyboard
resizing (← → / Shift / Home) and ARIA separator semantics.
The Novel→AI seam is gold-ruled and the AI panel gets a soft
gold edge wash, marking the boundary into the generative zone.
========================================================= */
import { el, clear, weaverLogo } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import {
  getState, setUI, closeProject, flushSave, subscribe, updateSettings,
} from '../core/state.js';
import * as msApi from '../panels/manuscript.js';
import * as nvApi from '../panels/main-novel.js';
import * as aiApi from '../panels/ai-output.js';
import * as hrApi from '../features/hierarchy.js';
import * as rzApi from '../core/resizers.js';
import { openSettings } from '../features/settings.js';
import { openGuide } from '../features/guide.js';
import { exportProject } from '../features/export.js';
import { openConfigBible } from '../features/config-bible.js';
import { togglePlotReference } from '../features/plot-reference.js';
import { openSupport } from '../features/support.js';
import { autoSync } from '../features/cloud.js';

/* ---------- defensive resolution ---------- */
function pick(api, names) {
  for (const n of names) if (typeof api[n] === 'function') return api[n];
  return null;
}
const mountManuscript = pick(msApi, ['mountManuscript', 'initManuscript', 'mount', 'setup', 'init']);
const renderManuscript = pick(msApi, ['renderManuscript', 'render']);
const acceptAsIs = pick(msApi, ['acceptAsIs', 'accept', 'acceptBlock', 'acceptManuscript', 'acceptSelection']);
const acceptWhole = pick(msApi, ['acceptWhole']);
const mountNovel = pick(nvApi, ['mountMainNovel', 'initMainNovel', 'mount', 'init']);
const renderNovel = pick(nvApi, ['renderMainNovel', 'render']);
const recheckFn = pick(nvApi, ['recheck']);
const initAi = pick(aiApi, ['initAiOutput', 'init', 'mount']);
const acceptAi = pick(aiApi, ['acceptAiBlock']);
const rewriteAi = pick(aiApi, ['rewriteAiBlock']);
const discardAi = pick(aiApi, ['discardAiBlock']);
const toggleHier = pick(hrApi, ['toggleHierarchyDrawer', 'toggleHierarchy', 'toggle']);
const bindRz = pick(rzApi, ['bindResizers', 'initResizers']);
const refreshRz = pick(rzApi, ['refreshLayout', 'refresh']);

const MISSING = [];
if (!mountManuscript) MISSING.push('manuscript mount (mountManuscript/initManuscript)');
if (!renderManuscript) MISSING.push('manuscript render (renderManuscript)');
if (!mountNovel) MISSING.push('main-novel mount (mountMainNovel)');
if (!renderNovel) MISSING.push('main-novel render (renderMainNovel)');
if (MISSING.length) console.warn('[Workspace] unresolved panel functions:', MISSING.join('; '));

function safe(label, fn, ...args) {
  if (typeof fn !== 'function') return false;
  try { fn(...args); return true; }
  catch (e) { console.warn(`[Workspace] ${label} failed:`, e); return false; }
}

const STYLE_ID = 'workspace-style';
const CSS = `
/* =========================================================
   PANEL SEAMS — the real, visible panel boundaries.
   ========================================================= */
.panel-resizer{
  position:relative;flex:none;width:10px;align-self:stretch;
  cursor:col-resize;touch-action:none;z-index:5;
  background:linear-gradient(90deg,
    rgba(0,0,0,.60) 0%,
    rgba(0,0,0,.22) 38%,
    rgba(255,255,255,.035) 50%,
    rgba(0,0,0,.22) 62%,
    rgba(0,0,0,.60) 100%);
  transition:background .18s ease;
}
.resizer-line{
  pointer-events:none;position:absolute;
  left:50%;top:0;bottom:0;width:1px;transform:translateX(-50%);
  background:var(--border-strong);
  transition:background .18s ease,box-shadow .18s ease,width .18s ease;
}
.panel-resizer::after{
  content:'';position:absolute;left:50%;top:50%;
  width:2px;height:26px;transform:translate(-50%,-50%);border-radius:2px;
  background:repeating-linear-gradient(180deg,var(--faint) 0 2px,transparent 2px 6px);
  opacity:.75;
  transition:background .18s ease,height .18s ease,opacity .18s ease;
}
/* Novel → AI: gold rule marks the entry into the generative zone. */
.panel-resizer[data-resizer-after="novel"] .resizer-line{
  background:linear-gradient(180deg,
    var(--border-strong) 0%,
    rgba(224,168,60,.62) 20%,
    rgba(224,168,60,.62) 80%,
    var(--border-strong) 100%);
}
.panel-resizer[data-resizer-after="novel"]::after{
  background:repeating-linear-gradient(180deg,rgba(224,168,60,.85) 0 2px,transparent 2px 6px);
}
.panel-resizer:hover{
  background:linear-gradient(90deg,rgba(0,0,0,.55),rgba(224,168,60,.12) 50%,rgba(0,0,0,.55));
}
.panel-resizer:hover .resizer-line,
.panel-resizer.is-dragging .resizer-line{
  background:var(--accent);box-shadow:0 0 10px rgba(224,168,60,.55);
}
.panel-resizer:hover::after,
.panel-resizer.is-dragging::after{
  height:42px;opacity:1;
  background:repeating-linear-gradient(180deg,var(--accent) 0 2px,transparent 2px 6px);
}
.panel-resizer.is-dragging{
  background:linear-gradient(90deg,rgba(0,0,0,.50),rgba(224,168,60,.20) 50%,rgba(0,0,0,.50));
}
.panel-resizer.is-dragging .resizer-line{width:2px;box-shadow:0 0 16px rgba(224,168,60,.75);}
.panel-resizer:focus-visible{outline:none;}
.panel-resizer:focus-visible .resizer-line{
  background:var(--accent);width:2px;box-shadow:0 0 12px rgba(224,168,60,.6);
}
.panel-resizer:focus-visible::after{opacity:1;height:42px;}

/* Soft wash so the AI panel reads as its own territory. */
.workspace-panels > .panel[data-panel="ai"]{
  background:linear-gradient(90deg,rgba(224,168,60,.05) 0%,rgba(224,168,60,0) 96px),var(--bg);
}

/* =========================================================
   Topbar "More" sheet + mobile pills
   ========================================================= */
.tb-more{display:none;}
.tb-more-glyph{font-size:1.15rem;line-height:1;}
.tb-more-sheet{
  position:fixed;top:56px;right:8px;z-index:90;display:none;flex-direction:column;gap:6px;
  min-width:170px;max-width:240px;padding:8px;
  background:var(--surface);border:1px solid var(--border-strong);border-radius:12px;
  box-shadow:0 12px 40px rgba(0,0,0,.5);
}
.tb-more-sheet.is-open{display:flex;}
.tb-more-sheet .btn{justify-content:flex-start;}
.tb-more-sheet .btn span{white-space:normal;}
.panel-pills{display:none;}
.pill{
  display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;
  border:1px solid var(--border);background:var(--surface);color:var(--muted);
  font-size:.78rem;font-weight:600;cursor:pointer;white-space:nowrap;flex:none;
}
.pill.is-active{background:var(--accent-soft);border-color:rgba(224,168,60,.5);color:var(--accent);}
.pill-dot{width:7px;height:7px;border-radius:50%;background:var(--accent);flex:none;}

@media (max-width:860px){
  .topbar .tb-fold{display:none;}
  .topbar .tb-support{display:none;}
  .tb-more{display:inline-flex;}
  .workspace-panels{
    display:flex !important;flex-direction:column !important;
    position:fixed;left:0;right:0;bottom:0;top:104px;min-height:0;
  }
  .workspace-panels .panel{display:flex;flex-direction:column;flex:1 1 0;min-height:0;width:100%;}
  .workspace-panels .panel-body{flex:1 1 auto;min-height:0;overflow-y:auto;}
  .workspace-panels .panel-footer{
    flex:none;justify-content:center;
    padding:6px 64px calc(6px + env(safe-area-inset-bottom, 0px));
  }
  .panel{border-color:transparent !important;}
  .panel-resizer{
    display:block;height:16px;width:100%;cursor:row-resize;touch-action:none;
    background:linear-gradient(180deg,rgba(0,0,0,.6),rgba(255,255,255,.035) 50%,rgba(0,0,0,.6));
  }
  .panel-resizer .resizer-line{
    left:0;right:0;top:50%;bottom:auto;width:auto;height:1px;
    transform:translateY(-50%);background:var(--border);
  }
  .panel-resizer::after{
    width:26px;height:2px;
    background:repeating-linear-gradient(90deg,var(--faint) 0 2px,transparent 2px 6px);
  }
  .panel-resizer:hover::after,
  .panel-resizer.is-dragging::after{width:42px;height:2px;}
  .workspace-panels > .panel[data-panel="ai"]{background:var(--bg);}
  .topbar .btn-label{display:none;}
  .topbar .btn{padding:8px;width:34px;height:34px;flex:none;}
  .topbar .scribe-bar{display:none;}
  .topbar-title{font-size:.95rem;}
  .panel-pills{display:flex;gap:6px;padding:8px 10px 2px;overflow-x:auto;flex:none;}
  .panel-footer .btn{flex:0 0 auto;width:34px;height:34px;padding:0;justify-content:center;}
  .panel-footer .btn-label{display:none;}
  .panel-footer .btn-icon{display:inline-flex;}
  .panel-actions .btn-icon{display:none;}
}
`;
function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
}

let root = null;
let panelsEl = null;
let panelRefs = null;
let pillRefs = null;
let mobilePanel = 'manuscript';
let aiDot = false;
let aiObserver = null;

const DEFAULT_SPLIT = [33.4, 33.3, 33.3];
const MIN_PCT = 10;

function isMobileLayout() {
  return window.matchMedia('(max-width:860px)').matches;
}
function setMobilePanel(key) {
  mobilePanel = key;
  if (key === 'ai') aiDot = false;
  applyExpanded();
}
function updatePills() {
  if (!pillRefs) return;
  for (const key of ['manuscript', 'novel', 'ai']) {
    if (pillRefs[key]) pillRefs[key].classList.toggle('is-active', key === mobilePanel);
  }
  if (pillRefs.aiDot) pillRefs.aiDot.hidden = !aiDot;
}

/* ---------- separator sizing (keyboard + ARIA) ---------- */
function sizesNow() {
  const s = getState().settings.general.panelSizes;
  return Array.isArray(s) && s.length === 3 ? s.slice() : DEFAULT_SPLIT.slice();
}
function commitSizes(next) {
  updateSettings((s) => { s.general.panelSizes = next; });
  if (refreshRz) safe('refreshLayout', refreshRz);
  syncSeparatorAria();
}
function nudgeSizes(idx, delta) {
  const base = sizesNow();
  let d = delta;
  d = Math.max(d, MIN_PCT - base[idx]);
  d = Math.min(d, base[idx + 1] - MIN_PCT);
  if (!d) return;
  const next = base.slice();
  next[idx] = Math.round((next[idx] + d) * 100) / 100;
  next[idx + 1] = Math.round((next[idx + 1] - d) * 100) / 100;
  commitSizes(next);
}
function resetSizes() { commitSizes(DEFAULT_SPLIT.slice()); }
function syncSeparatorAria() {
  if (!panelRefs || !panelRefs.resizers) return;
  const s = sizesNow();
  panelRefs.resizers.forEach((r, i) => {
    if (!r || !r.isConnected) return;
    r.setAttribute('aria-valuemin', String(MIN_PCT));
    r.setAttribute('aria-valuemax', String(100 - MIN_PCT));
    r.setAttribute('aria-valuenow', String(Math.round(s[i])));
    r.setAttribute('aria-valuetext', `${Math.round(s[i])}% and ${Math.round(s[i + 1])}%`);
  });
}

function topBtn(key, iconName, label, onclick) {
  return el('button', {
    class: 'btn btn-ghost',
    dataset: { topbar: key },
    title: label,
    onclick,
  }, [icon(iconName), el('span', { class: 'btn-label', text: label })]);
}

/* ---------- mobile "More" sheet (holds every folded tool) ---------- */
let moreSheet = null;
let moreBtnRef = null;
function ensureMoreSheet() {
  if (moreSheet) return moreSheet;
  moreSheet = el('div', { class: 'tb-more-sheet' }, [
    el('button', { class: 'btn btn-sm', onclick: () => { closeMoreSheet(); togglePlotReference(); } }, [icon('file-text', 'icon-sm'), el('span', { text: 'Plot' })]),
    el('button', { class: 'btn btn-sm', onclick: () => { closeMoreSheet(); import('../features/cover-gen.js').then((m) => m.openCoverGenerator()); } }, [icon('sparkles', 'icon-sm'), el('span', { text: 'Cover' })]),
    el('button', { class: 'btn btn-sm', onclick: () => { closeMoreSheet(); if (toggleHier) toggleHier(); } }, [icon('tree', 'icon-sm'), el('span', { text: 'Hierarchy' })]),
    el('button', { class: 'btn btn-sm', onclick: () => { closeMoreSheet(); exportProject(); } }, [icon('download', 'icon-sm'), el('span', { text: 'Export' })]),
    el('button', { class: 'btn btn-sm', onclick: () => { closeMoreSheet(); import('../features/focus-mode.js').then((m) => m.toggleFocusMode()); } }, [icon('expand', 'icon-sm'), el('span', { text: 'Focus' })]),
    el('button', { class: 'btn btn-sm', onclick: () => { closeMoreSheet(); openGuide(); } }, [icon('book', 'icon-sm'), el('span', { text: 'Guide' })]),
    el('button', { class: 'btn btn-sm', onclick: () => { closeMoreSheet(); openSettings(); } }, [icon('gear', 'icon-sm'), el('span', { text: 'Settings' })]),
    el('button', { class: 'btn btn-sm', onclick: () => { closeMoreSheet(); openSupport(); } }, [icon('send', 'icon-sm'), el('span', { text: 'Support' })]),
  ]);
  document.body.appendChild(moreSheet);
  document.addEventListener('click', (e) => {
    if (!moreSheet.classList.contains('is-open')) return;
    if (moreSheet.contains(e.target) || (moreBtnRef && moreBtnRef.contains(e.target))) return;
    closeMoreSheet();
  });
  return moreSheet;
}
function toggleMoreSheet() { ensureMoreSheet().classList.toggle('is-open'); }
function closeMoreSheet() { if (moreSheet) moreSheet.classList.remove('is-open'); }

function buildPanel(key, iconName, title, actions = []) {
  const header = el('header', { class: 'panel-header' }, [
    el('div', { class: 'panel-title' }, [icon(iconName), el('span', { text: title })]),
    el('div', { class: 'panel-actions' }, actions),
  ]);
  const body = el('div', { class: 'panel-body', dataset: { panelBody: key } });
  const footer = el('footer', { class: 'panel-footer', dataset: { panelFooter: key } });
  const panel = el('section', { class: `panel panel-${key}`, dataset: { panel: key } }, [header, body, footer]);
  return { panel, header, body, footer };
}

/* ---------- the separator itself ---------- */
function resizer(after) {
  const idx = after === 'manuscript' ? 0 : 1;
  const label = after === 'manuscript'
    ? 'Resize Manuscript and Main Novel'
    : 'Resize Main Novel and AI Output';
  const node = el('div', {
    class: 'panel-resizer',
    dataset: { resizerAfter: after },
    role: 'separator',
    tabindex: '0',
    'aria-orientation': 'vertical',
    'aria-label': label,
    title: `${label} — drag, or focus and press ← → (Shift for bigger steps). Double-click or Home resets.`,
  }, [el('div', { class: 'resizer-line' })]);

  node.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 6 : 2;
    if (e.key === 'ArrowLeft') { e.preventDefault(); nudgeSizes(idx, -step); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); nudgeSizes(idx, step); }
    else if (e.key === 'Home') { e.preventDefault(); resetSizes(); }
  });
  node.addEventListener('pointerup', () => syncSeparatorAria());
  return node;
}

export function renderWorkspace() {
  if (!root) return;
  ensureStyle();
  clear(root);
  const state = getState();
  const project = state.project;
  if (!project) return;

  /* Left cluster: Config stays on mobile; Plot/Cover/Hierarchy fold. */
  const plotBtn = topBtn('plot', 'file-text', 'Plot', () => togglePlotReference());
  const coverBtn = topBtn('cover', 'sparkles', 'Cover', () => import('../features/cover-gen.js').then((m) => m.openCoverGenerator()));
  const hierBtn = topBtn('hierarchy', 'tree', 'Hierarchy', () => { if (toggleHier) toggleHier(); });
  plotBtn.classList.add('tb-fold');
  coverBtn.classList.add('tb-fold');
  hierBtn.classList.add('tb-fold');

  const topbar = el('header', { class: 'topbar' }, [
    el('div', { class: 'topbar-left' }, [
      weaverLogo('sm'),
      topBtn('config', 'sliders', 'Config', () => openConfigBible()),
      plotBtn,
      coverBtn,
      hierBtn,
    ]),
    el('div', { class: 'topbar-center' }, [
      el('h1', { class: 'topbar-title', text: project.name }),
      el('span', {
        class: 'topbar-sub',
        text: project.seriesName ? `${project.seriesName} · ${project.bookTitle || ''}` : 'standalone',
      }),
    ]),
    (() => {
      const guideBtn = topBtn('guide', 'book', 'Guide', () => openGuide());
      const exportBtn = topBtn('export', 'download', 'Export', () => exportProject());
      const focusBtn = topBtn('focus', 'expand', 'Focus', () => import('../features/focus-mode.js').then((m) => m.toggleFocusMode()));
      const settingsBtn = topBtn('settings', 'gear', 'Settings', () => openSettings());
      guideBtn.classList.add('tb-fold');
      exportBtn.classList.add('tb-fold');
      focusBtn.classList.add('tb-fold');
      settingsBtn.classList.add('tb-fold');
      moreBtnRef = el('button', {
        class: 'btn btn-ghost tb-more',
        title: 'More tools',
        'aria-label': 'More tools',
        onclick: () => toggleMoreSheet(),
      }, [el('span', { class: 'tb-more-glyph', text: '⋯' })]);
      return el('div', { class: 'topbar-right' }, [
        topBtn('library', 'library', 'Library', () => { flushSave(); autoSync(); closeProject(); }),
        guideBtn,
        exportBtn,
        focusBtn,
        settingsBtn,
        moreBtnRef,
      ]);
    })(),
  ]);

  const expandBtn = (target) => el('button', {
    class: 'btn btn-ghost btn-icon btn-sm',
    title: 'Expand panel',
    'aria-label': 'Expand panel',
    onclick: () => setUI({ expandedPanel: state.ui.expandedPanel === target ? null : target }),
  }, [icon('expand', 'icon-sm')]);

  const manuscript = buildPanel('manuscript', 'pen', 'Manuscript', [expandBtn('manuscript')]);
  const novel = buildPanel('novel', 'book-open', 'Main Novel', [expandBtn('novel')]);
  const ai = buildPanel('ai', 'sparkles', 'AI Output', [expandBtn('ai')]);

  if (recheckFn) {
    novel.footer.appendChild(el('button', {
      class: 'btn btn-sm',
      title: 'Cut selected text to the Manuscript for revision — it returns to this spot when you accept',
      onclick: () => recheckFn(),
    }, [icon('refresh', 'icon-sm'), el('span', { class: 'btn-label', text: 'Recheck' })]));
  }
  if (acceptAi) ai.footer.appendChild(el('button', { class: 'btn btn-sm btn-primary', title: 'Accept block into Main Novel', onclick: () => acceptAi() }, [icon('check', 'icon-sm'), el('span', { class: 'btn-label', text: 'Accept' })]));
  if (rewriteAi) ai.footer.appendChild(el('button', { class: 'btn btn-sm', title: 'Rewrite block with the same prompt', onclick: () => rewriteAi() }, [icon('refresh', 'icon-sm'), el('span', { class: 'btn-label', text: 'Rewrite' })]));
  if (discardAi) ai.footer.appendChild(el('button', { class: 'btn btn-sm btn-danger', title: 'Discard block', onclick: () => discardAi() }, [icon('trash', 'icon-sm'), el('span', { class: 'btn-label', text: 'Discard' })]));

  ai.body.appendChild(el('div', { class: 'empty-state' }, [
    icon('sparkles', 'icon-lg'),
    el('p', { text: 'AI generations will appear here.' }),
  ]));

  const r1 = resizer('manuscript');
  const r2 = resizer('novel');

  panelsEl = el('div', {
    class: 'workspace-panels',
    dataset: { active: 'manuscript' },
  }, [manuscript.panel, r1, novel.panel, r2, ai.panel]);

  panelRefs = {
    panels: [manuscript.panel, novel.panel, ai.panel],
    resizers: [r1, r2],
  };

  /* Mobile pill bar (hidden on desktop via CSS) */
  const pillsBar = el('div', { class: 'panel-pills' });
  pillRefs = {};
  const pillDefs = [
    ['manuscript', 'pen', 'Manuscript'],
    ['novel', 'book-open', 'Main Novel'],
    ['ai', 'sparkles', 'AI Output'],
  ];
  for (const [key, iconName, label] of pillDefs) {
    const children = [icon(iconName, 'icon-sm'), el('span', { text: label })];
    if (key === 'ai') {
      pillRefs.aiDot = el('span', { class: 'pill-dot', hidden: true });
      children.push(pillRefs.aiDot);
    }
    const btn = el('button', { class: 'pill', onclick: () => setMobilePanel(key) }, children);
    pillRefs[key] = btn;
    pillsBar.appendChild(btn);
  }

  const kids = [];
  if (MISSING.length) {
    kids.push(el('div', {
      style: {
        padding: '8px 14px',
        background: 'rgba(224,168,60,.12)',
        border: '1px solid rgba(224,168,60,.4)',
        color: 'var(--accent)',
        fontSize: '.78rem',
      },
      text: `Workspace degraded — unresolved: ${MISSING.join('; ')}. Screenshot this for support.`,
    }));
  }
  kids.push(topbar, pillsBar, panelsEl);
  root.append(...kids);

  if (bindRz) safe('bindResizers', bindRz, { container: panelsEl, panels: panelRefs.panels, resizers: panelRefs.resizers });
  applyExpanded();
  syncSeparatorAria();

  /* Gold dot when a generation lands while you're on another panel (mobile) */
  if (aiObserver) aiObserver.disconnect();
  if (typeof MutationObserver !== 'undefined') {
    aiObserver = new MutationObserver(() => {
      if (isMobileLayout() && mobilePanel !== 'ai') { aiDot = true; updatePills(); }
    });
    aiObserver.observe(ai.body, { childList: true });
  }

  if (!safe('mountManuscript(panel)', mountManuscript, manuscript.panel)) {
    safe('mountManuscript(body)', mountManuscript, manuscript.body);
  }
  if (!safe('mountMainNovel(panel)', mountNovel, novel.panel)) {
    safe('mountMainNovel(body)', mountNovel, novel.body);
  }
  safe('renderManuscript', renderManuscript);
  safe('renderMainNovel', renderNovel);

  /* V4: Accept split — two explicit buttons. */
  if (acceptAsIs && manuscript.footer.children.length === 0) {
    manuscript.footer.appendChild(el('button', {
      class: 'btn btn-sm btn-primary',
      title: 'Accept highlighted text into the Main Novel — returns to its rechecked spot if one is pending',
      onclick: () => acceptAsIs(),
    }, [icon('check', 'icon-sm'), el('span', { class: 'btn-label', text: 'Accept highlighted' })]));
    if (acceptWhole) {
      manuscript.footer.appendChild(el('button', {
        class: 'btn btn-sm',
        title: 'Accept the entire Manuscript into Main Novel and clear the Manuscript',
        onclick: () => acceptWhole(),
      }, [icon('book-open', 'icon-sm'), el('span', { class: 'btn-label', text: 'Accept whole' })]));
    }
  }
}

function applyExpanded() {
  if (!panelRefs) return;
  const keys = ['manuscript', 'novel', 'ai'];

  if (isMobileLayout()) {
    keys.forEach((key, i) => {
      panelRefs.panels[i].style.display = (key === mobilePanel) ? '' : 'none';
    });
    panelRefs.resizers.forEach((r) => { r.style.display = 'none'; });
    const anchor = (root && (root.querySelector('.panel-pills') || root.querySelector('.topbar'))) || null;
    const topPx = anchor ? Math.round(anchor.getBoundingClientRect().bottom) : 104;
    const s = panelsEl.style;
    s.position = 'fixed';
    s.left = '0';
    s.right = '0';
    s.bottom = '0';
    s.top = topPx + 'px';
    s.display = 'flex';
    s.flexDirection = 'column';
    updatePills();
    if (refreshRz) safe('refreshLayout', refreshRz);
    syncSeparatorAria();
    return;
  }

  const s = panelsEl.style;
  s.position = ''; s.left = ''; s.right = ''; s.bottom = ''; s.top = '';
  s.display = ''; s.flexDirection = '';
  const expanded = getState().ui.expandedPanel;
  keys.forEach((key, i) => {
    panelRefs.panels[i].style.display = (!expanded || expanded === key) ? '' : 'none';
  });
  panelRefs.resizers.forEach((r) => { r.style.display = expanded ? 'none' : ''; });
  if (refreshRz) safe('refreshLayout', refreshRz);
  syncSeparatorAria();
}

export function initWorkspace() {
  root = document.getElementById('view-workspace');
  safe('initAiOutput', initAi);
  const mq = window.matchMedia('(max-width:860px)');
  const onMq = () => applyExpanded();
  if (mq.addEventListener) mq.addEventListener('change', onMq);
  else if (mq.addListener) mq.addListener(onMq);
  window.addEventListener('resize', () => applyExpanded());
  subscribeWorkspace();
}

function subscribeWorkspace() {
  subscribe((state, change) => {
    if (change.ui) applyExpanded();
    if (state.view !== 'workspace') return;
    if (change.settings) syncSeparatorAria();
    if (change.view) renderWorkspace();
  });
}
