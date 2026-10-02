/* =========================================================
   Weaver — js/views/workspace.js
   Step 12 + Step 13 + Step 14: Main workspace layout.
   - Responsive three-panel layout with drag-resize borders.
   - Per-panel expand buttons (hide the other two panels).
   - Top bar: Hierarchy, Config, Scribe, Library, Export, Settings.
   - Panel footers: Accept as is / Recheck / AI actions.
   ========================================================= */

import { el, clear, toast } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { getState, setState, subscribe } from '../core/state.js';
import { mountManuscript, acceptAsIs } from '../panels/manuscript.js';
import { mountMainNovel, recheck } from '../panels/main-novel.js';
import { toggleHierarchyDrawer } from '../features/hierarchy.js';

let rootEl = null;
let panelsEl = null;

export function renderWorkspace(root) {
  rootEl = root;
  clear(root);

  const topbar = el('div', { class: 'topbar' }, [
    el('div', { class: 'topbar-brand' }, [icon('logo', 'icon-sm'), el('span', { text: 'Weaver' })]),
    el('div', { class: 'topbar-actions' }, [
      topBtn('hierarchy', 'tree', 'Hierarchy', () => toggleHierarchyDrawer()),
      topBtn('config', 'book', 'Config', () => toast('Config (Project Bible) arrives in Step 15.', 'info')),
      topBtn('scribe', 'spark', 'Scribe', () => toast('Scribe AI arrives in Step 16.', 'info')),
      topBtn('library', 'shelf', 'Library', () => setState({ view: 'library' })),
      topBtn('export', 'download', 'Export', () => toast('Export arrives in Step 18.', 'info')),
      topBtn('settings', 'gear', 'Settings', () => setState({ view: 'settings' })),
    ]),
  ]);

  panelsEl = el('div', { class: 'panels' });

  const manuscriptPanel = panel('Manuscript', 'ms-panel', [
    footerBtn('Accept as is', 'check', () => acceptAsIs()),
  ]);
  const novelPanel = panel('Main Novel', 'mn-panel', [
    footerBtn('Recheck', 'scissors', () => recheck()),
  ]);
  const aiPanel = panel('AI Output', 'ai-panel', [
    footerBtn('Accept', 'check', () => toast('AI Output arrives in Step 16.', 'info')),
    footerBtn('Rewrite', 'refresh', () => toast('AI Output arrives in Step 16.', 'info')),
    footerBtn('Discard', 'trash', () => toast('AI Output arrives in Step 16.', 'info')),
  ]);

  const border1 = el('div', { class: 'panel-border', dataset: { border: '1' } });
  const border2 = el('div', { class: 'panel-border', dataset: { border: '2' } });

  panelsEl.append(manuscriptPanel, border1, novelPanel, border2, aiPanel);
  root.append(topbar, panelsEl);

  mountManuscript(manuscriptPanel);
  mountMainNovel(novelPanel);

  aiPanel.querySelector('.panel-body').appendChild(el('div', { class: 'empty-state' }, [
    icon('spark', 'icon-lg'),
    el('p', { text: 'AI generations will appear here.' }),
    el('p', {
      class: 'launch-empty-hint',
      text: 'Highlight text in Manuscript and prompt Scribe to generate.',
    }),
  ]));

  bindResize(border1, manuscriptPanel);
  bindResize(border2, novelPanel);

  subscribe((state, change) => {
    if (change.settings && state.view === 'workspace') applyAesthetic();
  });
  applyAesthetic();
}

/* ---------- Builders ---------- */
function topBtn(id, iconName, label, onclick) {
  return el('button', { class: 'btn btn-ghost btn-sm topbar-btn', id: `tb-${id}`, onclick }, [
    icon(iconName, 'icon-sm'),
    el('span', { text: label }),
  ]);
}

function footerBtn(label, iconName, onclick) {
  return el('button', { class: 'btn btn-sm panel-btn', onclick }, [
    icon(iconName, 'icon-sm'),
    el('span', { text: label }),
  ]);
}

function panel(title, cls, footerButtons) {
  const actions = el('div', { class: 'panel-actions' });
  const header = el('div', { class: 'panel-header' }, [
    el('h2', { class: 'panel-title', text: title }),
    actions,
  ]);
  const body = el('div', { class: 'panel-body' });
  const footer = el('div', { class: 'panel-footer' }, footerButtons);
  const p = el('section', { class: `panel ${cls}` }, [header, body, footer]);

  actions.appendChild(el('button', {
    class: 'btn btn-ghost btn-icon btn-sm',
    'aria-label': `Expand ${title}`,
    onclick: () => toggleExpand(p),
  }));
  return p;
}

function toggleExpand(p) {
  const panels = Array.from(panelsEl.children).filter((n) => n.classList.contains('panel'));
  const wasExpanded = p.classList.contains('is-expanded');
  panels.forEach((n) => n.classList.remove('is-expanded'));
  panelsEl.classList.remove('has-expanded');
  if (!wasExpanded) {
    p.classList.add('is-expanded');
    panelsEl.classList.add('has-expanded');
  }
}

/* ---------- Drag-to-resize borders ---------- */
function bindResize(border, prevPanel) {
  let dragging = false;
  border.addEventListener('pointerdown', (e) => {
    dragging = true;
    border.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  border.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const rect = panelsEl.getBoundingClientRect();
    const vertical = window.matchMedia('(max-width: 860px)').matches;
    const total = vertical ? rect.height : rect.width;
    const cursor = vertical ? (e.clientY - rect.top) : (e.clientX - rect.left);
    const prevRect = prevPanel.getBoundingClientRect();
    const prevStart = vertical ? (prevRect.top - rect.top) : (prevRect.left - rect.left);
    const pct = Math.max(12, Math.min(76, ((cursor - prevStart) / total) * 100));
    prevPanel.style.flexBasis = pct + '%';
  });
  border.addEventListener('pointerup', () => { dragging = false; });
  border.addEventListener('pointercancel', () => { dragging = false; });
}

/* ---------- Aesthetic ---------- */
function applyAesthetic() {
  const g = getState().settings.general;
  document.documentElement.style.setProperty('--accent', g.accentColor || '#e0a83c');
  document.documentElement.style.setProperty('--font-scale', String(g.fontScale ?? 1));
}
