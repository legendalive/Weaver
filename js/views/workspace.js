/* =========================================================
Weaver — js/views/workspace.js
v2 Stage 7: BLANK-PROOF workspace + mobile panel fix.
V3.3a: Plot button (topbar-left). V3.3c: Plot button opens the
Plot Reference panel. V3.8: mobile "More" sheet — Guide + Export
(+ Support) fold into ⋯ on ≤480px; topbar buttons can't squeeze.
V3.8b: mobile panel pills — on phones one panel fills the screen
at a time, switched via a segmented pill bar under the topbar.
Remembers the last panel per session; a gold dot appears on the
AI pill when a generation lands while you're elsewhere.
Desktop is completely unchanged.
========================================================= */
import { el, clear, weaverLogo } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import {
  getState, setUI, closeProject, flushSave, subscribe,
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
const CSS = `.resizer-line{pointer-events:none;position:absolute;background:rgba(255,255,255,0.06);} .tb-more{display:none;} .tb-more-glyph{font-size:1.15rem;line-height:1;} .tb-more-sheet{position:fixed;top:56px;right:8px;z-index:90;display:none;flex-direction:column;gap:6px;min-width:150px;padding:8px;background:var(--surface);border:1px solid var(--border-strong);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.5);} .tb-more-sheet.is-open{display:flex;} .tb-more-sheet .btn{justify-content:flex-start;} .panel-pills{display:none;} .pill{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;border:1px solid var(--border);background:var(--surface);color:var(--muted);font-size:.78rem;font-weight:600;cursor:pointer;white-space:nowrap;flex:none;} .pill.is-active{background:var(--accent-soft);border-color:rgba(224,168,60,.5);color:var(--accent);} .pill-dot{width:7px;height:7px;border-radius:50%;background:var(--accent);flex:none;} @media (max-width:480px){ .topbar-right .tb-fold{display:none;} .topbar-right .tb-support{display:none;} .tb-more{display:inline-flex;} } @media (max-width:860px){ .workspace-panels{display:flex !important;flex-direction:column !important;} .workspace-panels .panel{flex:1 1 auto;min-height:0;} .panel{border-color:transparent !important;} .panel-resizer{display:block;height:16px;width:100%;cursor:row-resize;touch-action:none;} .panel-resizer .resizer-line{left:0;right:0;top:7px;height:2px;background:transparent;} .topbar .btn-label{display:none;} .topbar .btn{padding:8px;width:34px;height:34px;flex:none;} .topbar .scribe-bar{display:none;} .topbar-title{font-size:.95rem;} .panel-pills{display:flex;gap:6px;padding:8px 10px 2px;overflow-x:auto;flex:none;} .panel-footer{justify-content:flex-end;} .panel-footer .btn{flex:0 0 auto;width:34px;height:34px;padding:0;justify-content:center;} .panel-footer .btn-label{display:none;} .panel-footer .btn-icon{display:inline-flex;} .panel-actions .btn-icon{display:none;} }`;

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

function topBtn(key, iconName, label, onclick) {
  return el('button', {
    class: 'btn btn-ghost',
    dataset: { topbar: key },
    title: label,
    onclick,
  }, [icon(iconName), el('span', { class: 'btn-label', text: label })]);
}

/* ---------- mobile "More" sheet (folds Guide + Export + Support on phones) ---------- */
let moreSheet = null;
let moreBtnRef = null;
function ensureMoreSheet() {
  if (moreSheet) return moreSheet;
  moreSheet = el('div', { class: 'tb-more-sheet' }, [
    el('button', { class: 'btn btn-sm', onclick: () => { closeMoreSheet(); openGuide(); } }, [icon('book', 'icon-sm'), el('span', { text: 'Guide' })]),
    el('button', { class: 'btn btn-sm', onclick: () => { closeMoreSheet(); exportProject(); } }, [icon('download', 'icon-sm'), el('span', { text: 'Export' })]),
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
function toggleMoreSheet() {
  ensureMoreSheet().classList.toggle('is-open');
}
function closeMoreSheet() {
  if (moreSheet) moreSheet.classList.remove('is-open');
}

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

function resizer(after) {
  return el('div', {
    class: 'panel-resizer',
    dataset: { resizerAfter: after },
    title: 'Drag to resize · double-click to reset',
  }, [el('div', { class: 'resizer-line' })]);
}

export function renderWorkspace() {
  if (!root) return;
  ensureStyle();
  clear(root);
  const state = getState();
  const project = state.project;
  if (!project) return;
  const topbar = el('header', { class: 'topbar' }, [
    el('div', { class: 'topbar-left' }, [
      weaverLogo('sm'),
      topBtn('config', 'sliders', 'Config', () => openConfigBible()),
      topBtn('plot', 'file-text', 'Plot', () => togglePlotReference()),
      topBtn('hierarchy', 'tree', 'Hierarchy', () => {
        if (toggleHier) toggleHier();
      }),
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
      guideBtn.classList.add('tb-fold');
      exportBtn.classList.add('tb-fold');
      moreBtnRef = el('button', {
        class: 'btn btn-ghost tb-more',
        title: 'More',
        'aria-label': 'More actions',
        onclick: () => toggleMoreSheet(),
      }, [el('span', { class: 'tb-more-glyph', text: '⋯' })]);
      return el('div', { class: 'topbar-right' }, [
        topBtn('library', 'library', 'Library', () => { flushSave(); autoSync(); closeProject(); }),
        guideBtn,
        exportBtn,
        topBtn('settings', 'gear', 'Settings', () => openSettings()),
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
      title: 'Cut selected Main Novel text back into the Manuscript',
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
  if (acceptAsIs && manuscript.footer.children.length === 0) {
    manuscript.footer.appendChild(el('button', {
      class: 'btn btn-sm btn-primary',
      title: 'Accept the current manuscript text into Main Novel as-is',
      onclick: () => acceptAsIs(),
    }, [icon('check', 'icon-sm'), el('span', { class: 'btn-label', text: 'Accept as is' })]));
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
    updatePills();
    if (refreshRz) safe('refreshLayout', refreshRz);
    return;
  }
  const expanded = getState().ui.expandedPanel;
  keys.forEach((key, i) => {
    panelRefs.panels[i].style.display = (!expanded || expanded === key) ? '' : 'none';
  });
  panelRefs.resizers.forEach((r) => { r.style.display = expanded ? 'none' : ''; });
  if (refreshRz) safe('refreshLayout', refreshRz);
}

export function initWorkspace() {
  root = document.getElementById('view-workspace');
  safe('initAiOutput', initAi);
  const mq = window.matchMedia('(max-width:860px)');
  const onMq = () => applyExpanded();
  if (mq.addEventListener) mq.addEventListener('change', onMq);
  else if (mq.addListener) mq.addListener(onMq);
  subscribeWorkspace();
}

function subscribeWorkspace() {
  subscribe((state, change) => {
    if (change.ui) applyExpanded();
    if (state.view !== 'workspace') return;
    if (change.view) renderWorkspace();
  });
}
