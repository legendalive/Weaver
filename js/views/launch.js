/* =========================================================
Weaver — js/views/launch.js
Library dashboard.
V4 Phase 1 + book tag: series grouping (collapsed by default,
single line per entry) + optional "Book N" tag on each book.
Ordering is unchanged: latest-edited stays on top (series and
standalone sorted by most recent activity; books inside a
series arrive newest-first from listProjects()).
Self-styled: series/list styles injected here (STYLE_ID
'launch-series-style'), so css/views.css is NOT touched.
========================================================= */
import { el, clear, toast, confirmDialog, weaverLogo } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { listProjects, deleteProject, getActiveProject } from '../core/storage.js';
import { openProject, subscribe } from '../core/state.js';
import { openGuide } from '../features/guide.js';
import { openSettings } from '../features/settings.js';

/* ---------- injected styles (series grouping + book tag) ---------- */
const STYLE_ID = 'launch-series-style';
const CSS = `
.launch-list{display:flex;flex-direction:column;gap:6px;width:min(960px,100%);}
.launch-row{
  display:flex;align-items:center;gap:10px;
  min-width:0;height:44px;padding:0 12px;
  background:var(--surface);border:1px solid var(--border);
  border-radius:var(--radius-md);cursor:pointer;
  transition:border-color .15s ease,background .15s ease;
}
.launch-row:hover{border-color:var(--border-strong);background:var(--surface-2);}
.launch-row.is-active{border-color:rgba(224,168,60,.55);}
.launch-chev{flex:none;color:var(--faint);}
.launch-row.is-open .launch-chev{color:var(--accent);}
.launch-series-name{
  flex:0 1 auto;min-width:0;font-weight:600;font-size:.92rem;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.launch-books{display:flex;flex-direction:column;gap:6px;margin:2px 0 2px 30px;}
.launch-book{height:42px;}
.launch-book-icon{flex:none;color:var(--faint);}
.launch-book-name{
  flex:0 1 auto;min-width:0;font-size:.88rem;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.launch-booknum{
  flex:none;font-family:var(--font-mono);font-size:.6rem;letter-spacing:.04em;
  color:var(--accent);border:1px solid rgba(224,168,60,.4);
  background:rgba(224,168,60,.1);border-radius:999px;padding:2px 8px;
  white-space:nowrap;
}
.launch-grow{flex:1 1 auto;min-width:0;}
.launch-meta{
  display:flex;align-items:center;gap:14px;flex:none;
  font-family:var(--font-mono);font-size:.68rem;color:var(--faint);
  white-space:nowrap;
}
.launch-meta .words{color:var(--muted);}
.launch-row .btn-icon{flex:none;}
@media (max-width:640px){
  .launch-meta{gap:10px;}
  .launch-meta .time{display:none;}
  .launch-books{margin-left:18px;}
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
let openWizardFn = null;
const expandedSeries = new Set();   // collapsed by default

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

/* ---------- grouping ---------- */
function buildLibraryItems(projects) {
  const seriesMap = new Map();
  const items = [];
  for (const p of projects) {
    if (p.seriesId) {
      let g = seriesMap.get(p.seriesId);
      if (!g) {
        g = { type: 'series', seriesId: p.seriesId, seriesName: p.seriesName || 'Series', books: [], latest: 0 };
        seriesMap.set(p.seriesId, g);
        items.push(g);
      }
      g.books.push(p);
      if (p.updatedAt > g.latest) g.latest = p.updatedAt;
    } else {
      items.push({ type: 'project', project: p, latest: p.updatedAt });
    }
  }
  items.sort((a, b) => b.latest - a.latest);
  return items;
}

function toggleSeries(seriesId) {
  if (expandedSeries.has(seriesId)) expandedSeries.delete(seriesId);
  else expandedSeries.add(seriesId);
  renderLaunch();
}

/* ---------- row builders ---------- */
function seriesRow(group) {
  const isOpen = expandedSeries.has(group.seriesId);
  return el('div', {
    class: 'launch-row launch-series' + (isOpen ? ' is-open' : ''),
    title: isOpen ? 'Collapse series' : 'Expand series',
    onclick: () => toggleSeries(group.seriesId),
  }, [
    icon(isOpen ? 'chevron-down' : 'chevron-right', 'icon-sm launch-chev'),
    el('span', { class: 'launch-series-name', text: group.seriesName }),
    el('span', { class: 'badge badge-accent', text: `${group.books.length} book${group.books.length === 1 ? '' : 's'}` }),
    el('span', { class: 'launch-grow' }),
    el('button', {
      class: 'btn btn-ghost btn-icon btn-sm',
      title: `Add another book to "${group.seriesName}"`,
      'aria-label': `Add another book to ${group.seriesName}`,
      onclick: (e) => { e.stopPropagation(); if (openWizardFn) openWizardFn({ seriesId: group.seriesId, seriesName: group.seriesName }); },
    }, [icon('plus', 'icon-sm')]),
  ]);
}

function bookNumberBadge(p) {
    return p.seriesId && p.bookNumber
    ? el('span', { class: 'launch-booknum', text: `Book ${p.bookNumber}` })
    : null;
}

function metaSpans(p) {
  return el('span', { class: 'launch-meta' }, [
    el('span', { class: 'words', text: `${(p.wordCount || 0).toLocaleString()} words` }),
    el('span', { class: 'time', text: `edited ${timeAgo(p.updatedAt)}` }),
  ]);
}

function deleteBtn(p) {
  return el('button', {
    class: 'btn btn-ghost btn-icon btn-sm',
    title: 'Delete',
    'aria-label': `Delete ${p.name}`,
    onclick: (e) => { e.stopPropagation(); askDelete(p); },
  }, [icon('trash', 'icon-sm')]);
}

function bookRow(p) {
  const active = getActiveProject() === p.id;
  const kids = [icon('book', 'icon-sm launch-book-icon')];
  const tag = bookNumberBadge(p);
  if (tag) kids.push(tag);
  kids.push(
    el('span', { class: 'launch-book-name', text: p.name }),
    el('span', { class: 'launch-grow' }),
    metaSpans(p),
    deleteBtn(p),
  );
  return el('div', {
    class: 'launch-row launch-book' + (active ? ' is-active' : ''),
    onclick: () => { if (!openProject(p.id)) toast('Could not open project.', 'danger'); },
  }, kids);
}

function projectRow(p) {
  const active = getActiveProject() === p.id;
  const kids = [icon('book', 'icon-sm launch-book-icon')];
  const tag = bookNumberBadge(p);
  if (tag) kids.push(tag);
  kids.push(
    el('span', { class: 'launch-book-name', text: p.name }),
    el('span', { class: 'launch-grow' }),
    metaSpans(p),
    deleteBtn(p),
  );
  return el('div', {
    class: 'launch-row launch-standalone' + (active ? ' is-active' : ''),
    onclick: () => { if (!openProject(p.id)) toast('Could not open project.', 'danger'); },
  }, kids);
}

function renderLibraryItem(item) {
  if (item.type === 'series') {
    const isOpen = expandedSeries.has(item.seriesId);
    const kids = [seriesRow(item)];
    if (isOpen) kids.push(el('div', { class: 'launch-books' }, item.books.map(bookRow)));
    return el('div', { class: 'launch-group' }, kids);
  }
  return projectRow(item.project);
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
  ensureStyle();
  clear(root);
  const projects = listProjects();
  root.appendChild(hero(projects.length > 0));
  if (!projects.length) return;
  root.appendChild(el('div', { class: 'launch-lib-bar' }, [
    el('span', { class: 'launch-lib-count', text: `Your library · ${projects.length} project${projects.length === 1 ? '' : 's'}` }),
  ]));
  const items = buildLibraryItems(projects);
  root.appendChild(el('div', { class: 'launch-list' }, items.map(renderLibraryItem)));
}

export function initLaunch() {
  root = document.getElementById('view-launch');
  subscribe((state, change) => {
    if (state.view !== 'launch') return;
    if (change.view || change.project) renderLaunch();
  });
  renderLaunch();
}
