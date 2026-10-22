/* =========================================================
   Weaver — js/views/workspace.js
   v2 Stage 6.11-final: 3-panel writing workspace wired to the
   VERIFIED panel APIs:
   - main-novel: mountMainNovel(panel) / renderMainNovel / recheck
   - ai-output:  initAiOutput / accept / rewrite / discard
   - resizers:   bindResizers(ctx) / refreshLayout (flex-based)
   - hierarchy:  toggleHierarchyDrawer
   Small script W brand mark pinned to the topbar-left.
   ========================================================= */
import { el, clear, weaverLogo } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import {
  getState, setUI, closeProject, flushSave, subscribe,
} from '../core/state.js';
import { renderManuscript, initManuscript } from '../panels/manuscript.js';
import { mountMainNovel, renderMainNovel, recheck } from '../panels/main-novel.js';
import {
  initAiOutput, acceptAiBlock, rewriteAiBlock, discardAiBlock,
} from '../panels/ai-output.js';
import { toggleHierarchyDrawer } from '../features/hierarchy.js';
import { bindResizers, refreshLayout } from '../core/resizers.js';
import { openSettings } from '../features/settings.js';
import { openGuide } from '../features/guide.js';
import { exportProject } from '../features/export.js';
import { openConfigBible } from '../features/config-bible.js';
import { autoSync } from '../features/cloud.js';

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
let panelRefs = null; // { panels: [3], resizers: [2] }

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

  /* Main Novel footer: Recheck (cut selection back to Manuscript). */
  novel.footer.appendChild(el('button', {
    class: 'btn btn-sm',
    title: 'Cut selected Main Novel text back into the Manuscript',
    onclick: () => recheck(),
  }, [icon('refresh', 'icon-sm'), el('span', { class: 'btn-label', text: 'Recheck' })]));

  /* AI Output footer: the three block actions. */
  ai.footer.append(
    el('button', { class: 'btn btn-sm btn-primary', title: 'Accept block into Main Novel', onclick: () => acceptAiBlock() },
      [icon('check', 'icon-sm'), el('span', { class: 'btn-label', text: 'Accept' })]),
    el('button', { class: 'btn btn-sm', title: 'Rewrite block with the same prompt', onclick: () => rewriteAiBlock() },
      [icon('refresh', 'icon-sm'), el('span', { class: 'btn-label', text: 'Rewrite' })]),
    el('button', { class: 'btn btn-sm btn-danger', title: 'Discard block', onclick: () => discardAiBlock() },
      [icon('trash', 'icon-sm'), el('span', { class: 'btn-label', text: 'Discard' })]),
  );

  /* AI empty state (ai-output.js has no render function of its own). */
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

  root.append(topbar, panelsEl);

  /* Wire the drag-resize engine (flex-based; it also applies saved sizes). */
  bindResizers({ container: panelsEl, panels: panelRefs.panels, resizers: panelRefs.resizers });

  applyExpanded();
  mountMainNovel(novel.panel);
  renderManuscript();
  renderMainNovel();
}

/* Expansion: show one panel full-bleed, hide the rest, then let the
   resizer engine clear its inline flex sizes. */
function applyExpanded() {
  if (!panelRefs) return;
  const expanded = getState().ui.expandedPanel;
  const keys = ['manuscript', 'novel', 'ai'];
  keys.forEach((key, i) => {
    panelRefs.panels[i].style.display = (!expanded || expanded === key) ? '' : 'none';
  });
  panelRefs.resizers.forEach((r) => { r.style.display = expanded ? 'none' : ''; });
  refreshLayout();
}

export function initWorkspace() {
  root = document.getElementById('view-workspace');
  initManuscript();
  initAiOutput();
  subscribeWorkspace();
}

function subscribeWorkspace() {
  subscribe((state, change) => {
    if (change.ui) applyExpanded();
    if (state.view !== 'workspace') return;
    /* Rebuild only on view transitions (open/close project). Content
       edits flow through each panel's own subscription. */
    if (change.view) renderWorkspace();
  });
}
