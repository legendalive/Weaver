/* =========================================================
   Weaver — js/views/workspace.js
   Step 8-26: workspace shell + mobile section tabs.
   - Mobile (<=860px): one section visible at a time; the three
     section names sit on the right edge as button-tabs; the
     only border left is the single header underline.
   - Desktop unchanged: three panels, drag borders, expand.
   ========================================================= */

import { el, clear, toast } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { getState, subscribe, setUI, closeProject } from '../core/state.js';
import { bindResizers, refreshLayout } from '../core/resizers.js';
import { mountManuscript, flushManuscriptSync, acceptAsIs } from '../panels/manuscript.js';
import { mountMainNovel, recheck } from '../panels/main-novel.js';
import { toggleHierarchyDrawer } from '../features/hierarchy.js';
import { openConfigBible } from '../features/config-bible.js';
import { openSettings } from '../features/settings.js';
import { acceptAiBlock, rewriteAiBlock, discardAiBlock } from '../panels/ai-output.js';
import { exportProject } from '../features/export.js';

const STYLE_ID = 'workspace-extra-style';
const CSS = `
.mob-tabs{position:fixed;right:6px;top:50%;transform:translateY(-50%);z-index:70;
  display:none;flex-direction:column;gap:6px;}
.mob-tabs .btn{padding:6px 9px;font-size:.68rem;border-radius:var(--radius-md);
  background:var(--surface);border:1px solid var(--border-strong);box-shadow:var(--shadow-2);}
.mob-tabs .btn.is-selected{background:var(--accent-soft);color:var(--accent);
  border-color:rgba(224,168,60,.55);}
@media (max-width:860px){ .mob-tabs{display:flex;} }
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
let refs = {};
let lastProjectId = null;

export function initWorkspace() {
  ensureStyle();
  root = document.getElementById('view-workspace');
  subscribe((state, change) => {
    if (state.view !== 'workspace') return;
    if (change.view) {
      renderWorkspace();
      lastProjectId = state.project ? state.project.id : null;
      return;
    }
    if (change.project && !change.silent) {
      const id = state.project ? state.project.id : null;
      if (id !== lastProjectId) {
        flushManuscriptSync();
        renderWorkspace();
        lastProjectId = id;
      }
      return;
    }
    if (change.ui) applyExpansion();
  });
  renderWorkspace();
  lastProjectId = getState().project ? getState().project.id : null;
}

/* ---------- Builders ---------- */
function topBtn(key, iconName, label, onclick) {
  const b = el('button', { class: 'btn', title: label, onclick }, [
    icon(iconName),
    el('span', { class: 'btn-label', text: label }),
  ]);
  refs[key + 'Btn'] = b;
  return b;
}

function footerBtn(label, iconName, onclick, danger = false) {
  return el('button', { class: 'btn' + (danger ? ' btn-danger' : ''), onclick }, [
    icon(iconName),
    el('span', { class: 'btn-label', text: label }),
  ]);
}

function scribeBarPlaceholder() {
  return el('div', { class: 'scribe-bar' }, [
    el('div', { class: 'scribe-row' }, [
      el('input', { class: 'input', type: 'text', placeholder: 'Scribe: write, continue, describe, rewrite…' }),
      el('button', { class: 'btn btn-ghost btn-icon', title: 'Send to Scribe' }, [icon('send')]),
    ]),
  ]);
}

function buildPanel(key, iconName, title, placeholder, footerButtons) {
  const expandBtn = el('button', {
    class: 'btn btn-ghost btn-icon btn-sm',
    title: 'Expand panel',
    'aria-label': `Expand ${title}`,
    onclick: () => toggleExpand(key),
  }, [icon('expand')]);
  refs[key + 'Expand'] = expandBtn;

  const panel = el('section', { class: 'panel', dataset: { panel: key } }, [
    el('div', { class: 'panel-header' }, [
      el('h2', { class: 'panel-title' }, [icon(iconName), title]),
      el('div', { class: 'panel-actions' }, [expandBtn]),
    ]),
    el('div', { class: 'panel-body' }, [
      el('div', { class: 'empty-state' }, [
        icon(iconName, 'icon-lg'),
        el('p', { text: placeholder }),
      ]),
    ]),
    el('div', { class: 'panel-footer' }, footerButtons),
  ]);
  refs[key] = panel;
  return panel;
}

function mobTab(key, label) {
  const b = el('button', {
    class: 'btn',
    text: label,
    onclick: () => setUI({ expandedPanel: key }),
  });
  refs.mobTabBtns = refs.mobTabBtns || {};
  refs.mobTabBtns[key] = b;
  return b;
}

/* ---------- Expansion ---------- */
function toggleExpand(key) {
  const current = getState().ui.expandedPanel;
  setUI({ expandedPanel: current === key ? null : key });
}

function applyExpansion() {
  const expanded = getState().ui.expandedPanel;
  for (const key of ['manuscript', 'novel', 'ai']) {
    const panel = refs[key];
    if (!panel) continue;
    panel.classList.toggle('is-hidden', Boolean(expanded && expanded !== key));
    panel.classList.toggle('is-expanded', expanded === key);
    const btn = refs[key + 'Expand'];
    if (btn) {
      clear(btn);
      btn.appendChild(icon(expanded === key ? 'collapse' : 'expand'));
      btn.title = expanded === key ? 'Restore layout' : 'Expand panel';
    }
    const tab = refs.mobTabBtns ? refs.mobTabBtns[key] : null;
    if (tab) tab.classList.toggle('is-selected', expanded === key);
  }
  for (const r of refs.resizers || []) r.style.display = expanded ? 'none' : '';
  refreshLayout();
}

/* ---------- Render ---------- */
export function renderWorkspace() {
  if (!root) return;
  clear(root);
  refs = {};

  const project = getState().project;
  if (!project) return;

  const subtitle = project.seriesName
    ? `${project.seriesName} · ${project.bookTitle || project.name}`
    : (project.scope === 'series' ? 'series installment' : 'standalone');

  const topbar = el('header', { class: 'topbar' }, [
    el('div', { class: 'topbar-left' }, [
      topBtn('config', 'sliders', 'Config', () => openConfigBible()),
      topBtn('hierarchy', 'tree', 'Hierarchy', () => toggleHierarchyDrawer()),
    ]),
    el('div', { class: 'topbar-center' }, [
      el('h1', { class: 'topbar-title', text: project.name }),
      el('span', { class: 'topbar-sub', text: subtitle }),
    ]),
    el('div', { class: 'topbar-right' }, [
      el('button', {
        class: 'btn btn-ghost btn-icon',
        title: 'Library — back to dashboard',
        'aria-label': 'Library',
        onclick: () => { flushManuscriptSync(); closeProject(); },
      }, [icon('library')]),
      topBtn('export', 'download', 'Export', () => exportProject()),
      topBtn('settings', 'gear', 'Settings', () => openSettings()),
      scribeBarPlaceholder(),
    ]),
  ]);

  const resizerA = el('div', { class: 'resizer', dataset: { index: '0' } });
  const resizerB = el('div', { class: 'resizer', dataset: { index: '1' } });
  refs.resizers = [resizerA, resizerB];

  const panels = el('div', { class: 'workspace-panels' }, [
    buildPanel('manuscript', 'file-text', 'Manuscript',
      'Paste or type raw draft chapters or research here…', [
        footerBtn('Accept as is', 'check', () => acceptAsIs()),
      ]),
    resizerA,
    buildPanel('novel', 'book-open', 'Main Novel',
      'Your canon manuscript will grow here. Accept text from raw drafts or AI prompts…', [
        footerBtn('Recheck', 'refresh', () => recheck()),
      ]),
    resizerB,
    buildPanel('ai', 'sparkles', 'AI Output',
      "Scribe's novel prose and continuations will stream here…", [
        footerBtn('Accept', 'check', () => acceptAiBlock()),
        footerBtn('Rewrite', 'refresh', () => rewriteAiBlock()),
        footerBtn('Discard', 'x', () => discardAiBlock(), true),
      ]),
  ]);

  const mobTabs = el('div', { class: 'mob-tabs' }, [
    mobTab('manuscript', 'Manuscript'),
    mobTab('novel', 'Main Novel'),
    mobTab('ai', 'AI Output'),
  ]);

  root.append(topbar, panels, mobTabs);
  bindResizers({
    container: panels,
    panels: [refs.manuscript, refs.novel, refs.ai],
    resizers: refs.resizers,
  });
  mountManuscript(refs.manuscript);
  mountMainNovel(refs.novel);

  // Mobile default: one section at a time, starting with Manuscript.
  if (window.matchMedia('(max-width: 860px)').matches && !getState().ui.expandedPanel) {
    setUI({ expandedPanel: 'manuscript' });
  }
  applyExpansion();
}
