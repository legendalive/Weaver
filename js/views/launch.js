/* =========================================================
   Weaver — js/views/launch.js
   Library dashboard.
   v2 Stage 6.9 + logo: hero-first layout with the freehand
   script W; compacts to a masthead once projects exist.
   ========================================================= */
import { el, clear, toast, confirmDialog, weaverLogo } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { listProjects, deleteProject, getActiveProject } from '../core/storage.js';
import { openProject, subscribe } from '../core/state.js';
import { openGuide } from '../features/guide.js';
import { openSettings } from '../features/settings.js';

let root = null;
let openWizardFn = null;
export function setOpenWizard(fn) { openWizardFn = fn; }

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
    ? `It belongs to the series "${project.seriesName}" — if this is the last book in it, the shared series bible will also be removed.`
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

/* ---------- Hero: script W + wordmark + CTA ---------- */
function hero(compact) {
  const cta = el('button', {
    class: 'btn btn-primary launch-cta',
    title: 'Create a new project',
    onclick: () => { if (openWizardFn) openWizardFn(); },
  }, [icon('plus'), el('span', { text: 'New Project' })]);

  const secondary = el('div', { class: 'launch-hero-sub' }, [
    el('button', {
      class: 'btn btn-ghost',
      title: 'Read the quick-start guide',
      onclick: () => openGuide(),
    }, [icon('book'), el('span', { text: 'Getting Started' })]),
    el('button', {
      class: 'btn btn-ghost btn-icon',
      title: 'Settings (account, backup, restore, cloud sync)',
      'aria-label': 'Settings',
      onclick: () => openSettings(),
    }, [icon('gear')]),
  ]);

  const kids = [
    el('div', { class: 'launch-hero-logo' }, [weaverLogo(compact ? 'md' : 'xl')]),
    el('h1', { class: 'launch-hero-title', text: 'Weaver' }),
    el('p', { class: 'launch-hero-tag', text: 'A private novel-writing studio. Your words stay yours.' }),
    el('div', { class: 'launch-hero-actions' }, [cta, secondary]),
  ];

  if (!compact) {
    kids.push(el('p', {
      class: 'launch-hero-hint',
      text: 'Your library is empty — begin your first novel above, or read the quick-start guide first.',
    }));
  }

  return el('section', { class: 'launch-hero' + (compact ? ' is-compact' : '') }, kids);
}

export function renderLaunch() {
  if (!root) return;
  clear(root);
  const projects = listProjects();

  root.appendChild(hero(projects.length > 0));

  if (!projects.length) return;

  root.appendChild(el('div', { class: 'launch-lib-bar' }, [
    el('span', { class: 'launch-lib-count', text: `Your library · ${projects.length} project${projects.length === 1 ? '' : 's'}` }),
  ]));
  root.appendChild(el('div', { class: 'launch-grid' }, projects.map(projectCard)));
}

export function initLaunch() {
  root = document.getElementById('view-launch');
  subscribe((state, change) => {
    if (state.view !== 'launch') return;
    if (change.view || change.project) renderLaunch();
  });
  renderLaunch();
}
