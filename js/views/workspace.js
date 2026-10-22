/* =========================================================
   Weaver — js/views/workspace.js
   v2 + logo: 3-panel writing workspace; small script W brand
   mark pinned to the topbar-left of every open project.
   ========================================================= */
import { el, clear } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { getState, setUI, closeProject, touchProject, updateSettings, flushSave } from '../core/state.js';
import { saveProject } from '../core/storage.js';
import { renderManuscript, initManuscript, destroyManuscript, syncManuscriptView } from '../panels/manuscript.js';
import { renderMainNovel, initMainNovel, destroyMainNovel } from '../panels/main-novel.js';
import { renderAiOutput, initAiOutput, destroyAiOutput } from '../panels/ai-output.js';
import { openSettings } from '../features/settings.js';
import { openGuide } from '../features/guide.js';
import { exportProject } from '../features/export.js';
import { openConfigBible } from '../features/config-bible.js';
import { ensureHierarchyDrawer, toggleHierarchyDrawer, refreshHierarchy } from '../features/hierarchy.js';
import { initResizers } from '../core/resizers.js';
import { autoSync } from '../features/cloud.js';
import { weaverLogo } from '../utils/dom.js';

const STYLE_ID = 'workspace-style';
const CSS = `
.resizer-line{pointer-events:none;position:absolute;background:rgba(255,255,255,0.06);}
@media (max-width:860px){
  .panel-resizer{display:none;}
  .workspace-panels{grid-template-columns:1fr !important;}
  .workspace-panels[data-active="manuscript"] .panel-mid,
  .workspace-panels[data-active="manuscript"] .panel-right{display:none;}
  .workspace-panels[data-active="novel"] .panel-left,
  .workspace-panels[data-active="novel"] .panel-right{display:none;}
  .workspace-panels[data-active="ai"] .panel-left,
  .workspace-panels[data-active="ai"] .panel-mid{display:none;}
  .panel{border-left:none !important;border-right:none !important;}
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
    title: 'Drag to resize',
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
      topBtn('hierarchy', 'tree', 'Hierarchy', () => toggleHierarchyDrawer()),
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

  panelsEl = el('div', {
    class: 'workspace-panels',
    dataset: { active: 'manuscript' },
  }, [
    manuscript.panel, resizer('manuscript'),
    novel.panel, resizer('novel'),
    ai.panel,
  ]);

  root.append(topbar, panelsEl);
  ensureHierarchyDrawer();
  applyPanelSizes();
  renderManuscript();
  renderMainNovel();
  renderAiOutput();
}

function applyPanelSizes() {
  if (!panelsEl) return;
  const state = getState();
  const expanded = state.ui.expandedPanel;
  if (expanded) {
    const cols = {
      manuscript: '1fr 0px 0px 0px 0px',
      novel: '0px 0px 1fr 0px 0px',
      ai: '0px 0px 0px 0px 1fr',
    }[expanded];
    panelsEl.style.gridTemplateColumns = cols;
  } else {
    const [a, b, c] = state.ui.panelSizes;
    panelsEl.style.gridTemplateColumns = `${a}fr 6px ${b}fr 6px ${c}fr`;
  }
}

export function initWorkspace() {
  root = document.getElementById('view-workspace');
  initManuscript();
  initMainNovel();
  initAiOutput();
  initResizers(panelsElGetter, onResizeEnd);
  subscribeWorkspace();
}

function panelsElGetter() { return panelsEl; }

function onResizeEnd(sizes) {
  updateSettings((s) => { s.general.panelSizes = sizes; });
}

function subscribeWorkspace() {
  const { subscribe } = require_state();
  subscribe((state, change) => {
    if (state.view !== 'workspace') return;
    if (change.ui) applyPanelSizes();
    if (change.project && !change.silent) {
      renderWorkspace();
    }
    if (change.hierarchy) refreshHierarchy();
  });
}

function require_state() {
  // late import to avoid circular init issues
  return { subscribe: window.__weaverSubscribe };
}
