/* =========================================================
   Weaver — js/views/workspace.js
   v2 Stage 6.11-fix3: 3-panel writing workspace; small script W
   brand mark pinned to the topbar-left of every open project.
   BLANK-PROOF: panels, hierarchy and resizers are imported as
   NAMESPACES and resolved defensively, so a renamed export can
   never break the module graph again. Unresolved functions are
   skipped safely and reported once via console.warn.
   ========================================================= */
import { el, clear, weaverLogo, toast } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import {
  getState, setUI, closeProject, flushSave, updateSettings, subscribe,
} from '../core/state.js';
import * as manuscriptApi from '../panels/manuscript.js';
import * as novelApi from '../panels/main-novel.js';
import * as aiApi from '../panels/ai-output.js';
import * as hierarchyApi from '../features/hierarchy.js';
import * as resizersApi from '../core/resizers.js';
import { openSettings } from '../features/settings.js';
import { openGuide } from '../features/guide.js';
import { exportProject } from '../features/export.js';
import { openConfigBible } from '../features/config-bible.js';
import { autoSync } from '../features/cloud.js';

/* ---------- defensive resolution of panel APIs ---------- */
const renderManuscript = manuscriptApi.renderManuscript || null;
const initManuscript = manuscriptApi.initManuscript || null;
const renderMainNovel = novelApi.renderMainNovel || null;
const mountMainNovel = novelApi.mountMainNovel || novelApi.initMainNovel || null;
const renderAiOutput = aiApi.renderAiOutput || null;
const mountAiOutput = aiApi.mountAiOutput || aiApi.initAiOutput || null;
const toggleHierarchyDrawer = hierarchyApi.toggleHierarchyDrawer || hierarchyApi.toggleHierarchy || null;
const ensureHierarchyDrawer = hierarchyApi.ensureHierarchyDrawer || hierarchyApi.initHierarchyDrawer || null;
const refreshHierarchy = hierarchyApi.refreshHierarchy || null;

let warned = false;
function warnMissingOnce() {
  if (warned) return;
  warned = true;
  const missing = [];
  if (!renderManuscript) missing.push('manuscript.renderManuscript');
  if (!initManuscript) missing.push('manuscript.initManuscript');
  if (!renderMainNovel) missing.push('main-novel.renderMainNovel');
  if (!mountMainNovel) missing.push('main-novel.mountMainNovel|initMainNovel');
  if (!renderAiOutput) missing.push('ai-output.renderAiOutput');
  if (!mountAiOutput) missing.push('ai-output.mountAiOutput|initAiOutput');
  if (!toggleHierarchyDrawer) missing.push('hierarchy.toggleHierarchyDrawer');
  if (missing.length) console.warn('[Workspace] unresolved panel functions:', missing.join(', '));
}

/* Call a maybe-function without ever letting it kill the boot. */
function safe(label, fn, ...args) {
  if (typeof fn !== 'function') return false;
  try { fn(...args); return true; }
  catch (e) { console.warn(`[Workspace] ${label} failed:`, e); return false; }
}

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
      topBtn('hierarchy', 'tree', 'Hierarchy', () => {
        if (toggleHierarchyDrawer) toggleHierarchyDrawer();
        else toast('Hierarchy drawer is unavailable in this build.', 'danger');
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

  panelsEl = el('div', {
    class: 'workspace-panels',
    dataset: { active: 'manuscript' },
  }, [
    manuscript.panel, resizer('manuscript'),
    novel.panel, resizer('novel'),
    ai.panel,
  ]);

  root.append(topbar, panelsEl);

  safe('ensureHierarchyDrawer', ensureHierarchyDrawer);
  /* Mount helpers may expect the panel root or its body — try both, guarded. */
  if (!safe('mountMainNovel(panel)', mountMainNovel, novel.panel)) {
    safe('mountMainNovel(body)', mountMainNovel, novel.body);
  }
  if (!safe('mountAiOutput(panel)', mountAiOutput, ai.panel)) {
    safe('mountAiOutput(body)', mountAiOutput, ai.body);
  }
  applyPanelSizes();
  safe('renderManuscript', renderManuscript);
  safe('renderMainNovel', renderMainNovel);
  safe('renderAiOutput', renderAiOutput);
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
  safe('initManuscript', initManuscript);
  safe('initResizers', resizersApi.initResizers, () => panelsEl, onResizeEnd);
  subscribeWorkspace();
  warnMissingOnce();
}

function onResizeEnd(sizes) {
  updateSettings((s) => { s.general.panelSizes = sizes; });
}

function subscribeWorkspace() {
  subscribe((state, change) => {
    if (change.ui) applyPanelSizes();
    if (state.view !== 'workspace') return;
    if (change.view || (change.project && !change.silent)) renderWorkspace();
    if (change.hierarchy) safe('refreshHierarchy', refreshHierarchy);
  });
}
