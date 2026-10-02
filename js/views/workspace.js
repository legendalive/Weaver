/* =========================================================
   Weaver — js/views/workspace.js
   Step 8-14: workspace shell — top bar, three-panel skeleton,
   expand/collapse, Library exit, resize binding, Manuscript +
   Main Novel mounting, Hierarchy drawer wiring.
   ========================================================= */

import { el, clear, toast } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { getState, subscribe, setUI, closeProject } from '../core/state.js';
import { bindResizers, refreshLayout } from '../core/resizers.js';
import { mountManuscript, flushManuscriptSync, acceptAsIs } from '../panels/manuscript.js';
import { mountMainNovel, recheck } from '../panels/main-novel.js';
import { toggleHierarchyDrawer } from '../features/hierarchy.js';

let root = null;
let refs = {};
let lastProjectId = null;

export function initWorkspace() {
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
    label,
  ]);
}

function scribeBar() {
  const input = el('input', {
    class: 'input', type: 'text',
    placeholder: 'Scribe: write, continue, describe, rewrite…',
  });
  const send = el('button', {
    class: 'btn btn-ghost btn-icon', title: 'Send to Scribe',
    onclick: () => toast('Scribe wiring arrives in Step 21.', 'info'),
  }, [icon('send')]);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send.click(); });
  refs.scribeInput = input;
  return el('div', { class: 'scribe-bar' }, [input, send]);
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
      topBtn('config', 'sliders', 'Config', () => toast('Config bible editor arrives in Step 15.', 'info')),
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
      topBtn('export', 'download', 'Export', () => toast('Export arrives in Step 23.', 'info')),
      topBtn('settings', 'gear', 'Settings', () => toast('Settings arrives in Step 20.', 'info')),
      scribeBar(),
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
        footerBtn('Accept', 'check', () => toast('Accept arrives with the AI Output panel in Step 22.', 'info')),
        footerBtn('Rewrite', 'refresh', () => toast('Rewrite arrives with the AI Output panel in Step 22.', 'info')),
        footerBtn('Discard', 'x', () => toast('Discard arrives with the AI Output panel in Step 22.', 'info'), true),
      ]),
  ]);

  root.append(topbar, panels);
  bindResizers({
    container: panels,
    panels: [refs.manuscript, refs.novel, refs.ai],
    resizers: refs.resizers,
  });
  mountManuscript(refs.manuscript);
  mountMainNovel(refs.novel);
  applyExpansion();
}
