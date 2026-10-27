/* =========================================================
   Weaver — js/views/workspace.js
   v2 Stage 7: BLANK-PROOF workspace + mobile panel fix.
   - Panels/hierarchy/resizers imported as NAMESPACES; a renamed
     or missing export can never break the module graph again.
   - Mobile: panel borders transparent (invisible), stacked
     panels are a flex column, and the gaps between them are
     16px touch-drag resizers (pointer events, touch-action none).
   - Small script W brand mark pinned to topbar-left.
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
import { openPlotBuilder } from '../features/plot-builder.js';
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
const CSS = `
.resizer-line{pointer-events:none;position:absolute;background:rgba(255,255,255,0.06);}
@media (max-width:860px){
  .workspace-panels{display:flex !important;flex-direction:column !important;}
  .panel{border-color:transparent !important;}
  .panel-resizer{display:block;height:16px;width:100%;cursor:row-resize;touch-action:none;}
  .panel-resizer .resizer-line{left:0;right:0;top:7px;height:2px;background:transparent;}
  .topbar .btn-label{display:none;}
  .topbar .btn{padding:8px;width:34px;height:34px;}
  .topbar .scribe-bar{display:none;}
  .topbar-title{font-size:.95rem;}
  .panel-footer{justify-content:flex-end;}
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

function topBtn(key, iconName, label, onclick) {
  return el('button', {
    class: 'btn btn-ghost',
    dataset: { topbar: key },
    title: label,
    onclick,
  }, [icon(iconName), el('span', { class: 'btn-label', text: label })]);
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
topBtn('plot', 'file-text', 'Plot', () => openPlotBuilder()),
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
    el('div', { class: 'topbar-right' }, [
      topBtn('library', 'library', 'Library', () => { flushSave(); autoSync(); closeProject(); }),
      topBtn('guide', 'book', 'Guide', () => openGuide()),
      topBtn('export', 'download', 'Export', () => exportProject()),
      topBtn('settings', 'gear', 'Settings', () => openSettings()),
    ]),
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
  kids.push(topbar, panelsEl);
  root.append(...kids);

  if (bindRz) safe('bindResizers', bindRz, { container: panelsEl, panels: panelRefs.panels, resizers: panelRefs.resizers });
  applyExpanded();

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
  const expanded = getState().ui.expandedPanel;
  const keys = ['manuscript', 'novel', 'ai'];
  keys.forEach((key, i) => {
    panelRefs.panels[i].style.display = (!expanded || expanded === key) ? '' : 'none';
  });
  panelRefs.resizers.forEach((r) => { r.style.display = expanded ? 'none' : ''; });
  if (refreshRz) safe('refreshLayout', refreshRz);
}

export function initWorkspace() {
  root = document.getElementById('view-workspace');
  safe('initAiOutput', initAi);
  subscribeWorkspace();
}

function subscribeWorkspace() {
  subscribe((state, change) => {
    if (change.ui) applyExpanded();
    if (state.view !== 'workspace') return;
    if (change.view) renderWorkspace();
  });
}
