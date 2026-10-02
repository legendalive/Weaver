/* =========================================================
   Weaver — js/views/launch.js
   Step 6: launch dashboard — logo, project list, resume-last-edit,
   delete with confirmation, New Project entry point.
   (The real wizard registers itself via setOpenWizard in Step 7.)
   ========================================================= */

import { el, clear, toast, confirmDialog } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { listProjects, deleteProject, getActiveProject } from '../core/storage.js';
import { subscribe, openProject } from '../core/state.js';

let root = null;
let openWizardHook = null;

export function setOpenWizard(fn) { openWizardHook = fn; }

export function initLaunch() {
  root = document.getElementById('view-launch');
  subscribe((state, change) => {
    if ((change.view && state.view === 'launch') || change.projects) renderLaunch();
  });
  renderLaunch();
}

/* ---------- Helpers ---------- */
function logoMark() {
  return el('div', {
    class: 'launch-logo',
    html: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="2" y="2" width="60" height="60" rx="14" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M14 20l9 26 9-18 9 18 9-26" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  });
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

function openWizard() {
  if (openWizardHook) openWizardHook();
  else toast('Project wizard arrives in Step 7.', 'info');
}

function enterProject(id) {
  if (!openProject(id)) toast('Could not open project — data missing.', 'danger');
}

async function askDelete(project) {
  const ok = await confirmDialog({
    title: 'Delete project',
    message: `"${project.name}" — its manuscript, main novel, and config bible will be permanently removed.`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return;
  deleteProject(project.id);
  toast('Project deleted.', 'success');
  renderLaunch();
}

/* ---------- Render ---------- */
function projectCard(project, activeId) {
  return el('div', {
    class: 'project-card' + (project.id === activeId ? ' is-active' : ''),
    tabindex: '0',
    role: 'button',
    onclick: () => enterProject(project.id),
    onkeydown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enterProject(project.id); }
    },
  }, [
    el('h3', { class: 'project-name', text: project.name }),
    el('div', { class: 'project-meta' }, [
      el('span', { class: 'badge badge-accent', text: project.scope === 'series' ? 'series' : 'standalone' }),
      el('span', { class: 'badge', text: project.source === 'upload' ? 'uploaded' : 'from scratch' }),
      el('span', { class: 'badge', text: `${project.wordCount || 0} words` }),
    ]),
    el('span', { class: 'project-updated', text: `edited ${timeAgo(project.updatedAt)}` }),
    el('button', {
      class: 'btn btn-ghost btn-icon btn-sm project-delete',
      'aria-label': `Delete ${project.name}`,
      onclick: (e) => { e.stopPropagation(); askDelete(project); },
    }, [icon('trash', 'icon-sm')]),
  ]);
}

export function renderLaunch() {
  if (!root) return;
  clear(root);

  const projects = listProjects();
  const activeId = getActiveProject();

  const content = projects.length
    ? el('div', { class: 'launch-grid' }, projects.map((p) => projectCard(p, activeId)))
    : el('div', { class: 'launch-empty' }, [
        icon('folder', 'icon-lg'),
        el('p', { text: 'No projects yet.' }),
        el('p', {
          class: 'launch-empty-hint',
          text: 'Weave your first story — start from scratch or upload an existing manuscript.',
        }),
        el('button', { class: 'btn btn-primary', onclick: openWizard }, [icon('plus'), 'New Project']),
      ]);

  const wrap = el('div', { class: 'launch-wrap' }, [
    el('header', { class: 'launch-header' }, [
      logoMark(),
      el('div', { class: 'launch-titles' }, [
        el('h1', { class: 'launch-title', text: 'Weaver' }),
        el('p', { class: 'launch-tag', text: 'Structure · Refine · Generate' }),
      ]),
      el('div', { class: 'launch-spacer' }),
      el('button', { class: 'btn btn-primary', onclick: openWizard }, [icon('plus'), 'New Project']),
    ]),
    content,
  ]);

  root.appendChild(wrap);
}
