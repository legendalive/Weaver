/* =========================================================
   Weaver — js/views/launch.js
   Step 5 + 6 + 24 + 28.5: Library dashboard.
   - Project cards: name, scope, word count, edited-ago, active ring.
   - New Project + Getting Started (guide) buttons.
   - Delete with rich, series-aware confirmation.
   ========================================================= */

import { el, clear, toast, confirmDialog } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { listProjects, deleteProject, getActiveProject } from '../core/storage.js';
import { openProject, subscribe } from '../core/state.js';
import { openGuide } from '../features/guide.js';
import { openSettings } from '../features/settings.js';

let root = null;
let openWizardFn = null;

export function setOpenWizard(fn) { openWizardFn = fn; }

/* ---------- helpers ---------- */
function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

async function askDelete(project) {
  const words = project.wordCount || 0;
  const seriesNote = project.seriesName
    ? ` It belongs to the series "${project.seriesName}" — if this is the last book in it, the shared series bible will also be removed.`
    : '';
  const ok = await confirmDialog({
    title: 'Delete project',
    message: `"${project.name}" (${words.toLocaleString()} words in Main Novel) will be permanently removed, including its manuscript and config bible.${seriesNote} Tip: use Export first if you want a local copy.`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return;
  deleteProject(project.id);
  toast('Project deleted.', 'success');
  renderLaunch();
}

/* ---------- project card ---------- */
function projectCard(p) {
  const active = getActiveProject() === p.id;
  const subtitle = p.seriesName
    ? `${p.seriesName} · ${p.name}`
    : (p.scope === 'series' ? 'series installment' : 'standalone');

  return el('button', {
    class: 'project-card' + (active ? ' is-active' : ''),
    onclick: () => { if (!openProject(p.id)) toast('Could not open project.', 'danger'); },
  }, [
    el('div', { class: 'project-card-head' }, [
      el('h3', { class: 'project-card-title', text: p.name }),
      el('button', {
        class: 'btn btn-ghost btn-icon btn-sm',
        title: 'Delete project',
        'aria-label': `Delete ${p.name}`,
        onclick: (e) => { e.stopPropagation(); askDelete(p); },
      }, [icon('trash', 'icon-sm')]),
    ]),
    el('span', { class: 'project-card-sub', text: subtitle }),
    el('div', { class: 'project-card-meta' }, [
      el('span', { class: 'badge' + (p.seriesName ? ' badge-accent' : ''), text: p.seriesName ? 'series' : 'standalone' }),
      el('span', { class: 'project-card-words', text: `${(p.wordCount || 0).toLocaleString()} words` }),
      el('span', { class: 'project-card-time', text: `edited ${timeAgo(p.updatedAt)}` }),
    ]),
  ]);
}

/* ---------- render ---------- */
export function renderLaunch() {
  if (!root) return;
  clear(root);

  const projects = listProjects();

  root.append(
          el('div', { class: 'launch-actions' }, [
        el('button', {
          class: 'btn btn-ghost btn-icon',
          title: 'Settings (backup, restore, cloud sync)',
          'aria-label': 'Settings',
          onclick: () => openSettings(),
        }, [icon('gear')]),
        el('button', {
          class: 'btn',
          title: 'Read the quick-start guide',
          onclick: () => openGuide(),
        }, [icon('book'), 'Getting Started']),
        el('button', {
          class: 'btn btn-primary',
          onclick: () => { if (openWizardFn) openWizardFn(); },
        }, [icon('plus'), 'New Project']),
      ]),
    ])
  );

  if (!projects.length) {
    root.appendChild(el('div', { class: 'launch-empty' }, [
      icon('library', 'icon-lg'),
      el('p', { text: 'No projects yet.' }),
      el('p', { class: 'launch-empty-hint', text: 'Create your first novel — or read the Getting Started guide first.' }),
    ]));
    return;
  }

  root.appendChild(el('div', { class: 'launch-grid' }, projects.map(projectCard)));
}

/* ---------- init ---------- */
export function initLaunch() {
  root = document.getElementById('view-launch');
  subscribe((state, change) => {
    if (state.view !== 'launch') return;
    if (change.view || change.project) renderLaunch();
  });
  renderLaunch();
}
