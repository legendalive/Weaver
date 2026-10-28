/* =========================================================
Weaver — js/features/notes.js
V3.8: Notes — a floating capture sheet for stray ideas.
FAB sits bottom-left (clear of the Scribe FAB on mobile).
Tap (or Ctrl/Cmd+Alt+N) to slide up a quick sheet: jot, press
Enter, done. Notes live on project.notes and sync with the
project. The FAB auto-hides while you type in the editors and
reappears when you pause.
========================================================= */
import { el, clear } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { getState, subscribe } from '../core/state.js';
import { saveProject } from '../core/storage.js';
import { scheduleCloudSave } from './cloud.js';

const STYLE_ID = 'notes-style';
const CSS = `.notes-fab{position:fixed;left:16px;bottom:16px;z-index:80;width:52px;height:52px;border-radius:50%;background:var(--surface-2);color:var(--accent);border:1px solid var(--border-strong);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.4);transition:opacity .25s ease,transform .25s ease;} .notes-fab:hover{border-color:rgba(224,168,60,.55);} .notes-fab.is-idle{opacity:0;pointer-events:none;transform:translateY(8px);} .notes-fab[hidden]{display:none;} .notes-sheet{position:fixed;left:16px;bottom:80px;z-index:81;width:min(360px,calc(100vw - 32px));max-height:min(480px,calc(100vh - 120px));display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--border-strong);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.5);transform:translateY(12px);opacity:0;pointer-events:none;transition:transform .18s ease,opacity .18s ease;} .notes-sheet.is-open{transform:translateY(0);opacity:1;pointer-events:auto;} .notes-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--border);flex:none;} .notes-title{font-size:.85rem;font-weight:650;flex:1;} .notes-count{font-family:var(--font-mono);font-size:.68rem;color:var(--faint);} .notes-input-row{display:flex;gap:8px;padding:10px 12px;border-bottom:1px solid var(--border);flex:none;align-items:flex-end;} .notes-input-row .textarea{flex:1;min-height:38px;max-height:120px;resize:none;} .notes-list{overflow-y:auto;padding:8px 12px 6px;display:flex;flex-direction:column;gap:8px;} .notes-empty{color:var(--faint);font-size:.78rem;padding:2px 0 6px;} .notes-item{display:flex;gap:8px;align-items:flex-start;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2);} .notes-item-text{flex:1;min-width:0;font-size:.8rem;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;} .notes-item-date{display:block;color:var(--faint);font-size:.66rem;font-family:var(--font-mono);margin-top:4px;} .notes-hint{padding:2px 12px 10px;color:var(--faint);font-size:.68rem;font-family:var(--font-mono);}`;

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
}

let fab = null;
let sheet = null;
let listEl = null;
let countEl = null;
let inputEl = null;
let saveTimer = null;
let idleTimer = null;

function entryId() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function notesOf(project) {
  if (!project) return [];
  if (!Array.isArray(project.notes)) project.notes = [];
  return project.notes;
}

/* ---------- saving ---------- */
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}
function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const project = getState().project;
  if (!project) return;
  try { saveProject(project); } catch (e) { console.warn('[Notes] save failed:', e); }
  scheduleCloudSave();
}

/* ---------- sheet ---------- */
function sheetOpen() { return sheet && sheet.classList.contains('is-open'); }

function renderList() {
  if (!listEl) return;
  clear(listEl);
  const notes = notesOf(getState().project);
  if (countEl) countEl.textContent = notes.length ? String(notes.length) : '';
  if (!notes.length) {
    listEl.appendChild(el('p', { class: 'notes-empty', text: 'Jot down fresh ideas as they pop in.' }));
    return;
  }
  notes.slice().reverse().forEach((n) => {
    let date = '';
    try { date = new Date(n.createdAt).toLocaleString(); } catch (e) { date = ''; }
    listEl.appendChild(el('div', { class: 'notes-item' }, [
      el('div', { class: 'notes-item-text' }, [
        el('span', { text: n.text }),
        el('span', { class: 'notes-item-date', text: date }),
      ]),
      el('button', {
        class: 'btn btn-ghost btn-icon btn-sm',
        title: 'Delete note',
        onclick: () => {
          const arr = notesOf(getState().project);
          const i = arr.findIndex((x) => x.id === n.id);
          if (i >= 0) arr.splice(i, 1);
          scheduleSave();
          renderList();
        },
      }, [icon('trash', 'icon-sm')]),
    ]));
  });
}

function addNote(text) {
  const t = (text || '').trim();
  if (!t) return false;
  const project = getState().project;
  if (!project) return false;
  notesOf(project).push({ id: entryId(), text: t, createdAt: Date.now() });
  scheduleSave();
  renderList();
  return true;
}

function openSheet() {
  if (!getState().project) return;
  ensureUi();
  sheet.classList.add('is-open');
  setTimeout(() => { if (inputEl) inputEl.focus(); }, 60);
}
function closeSheet() {
  if (sheet) sheet.classList.remove('is-open');
}
function toggleSheet() {
  if (sheetOpen()) closeSheet(); else openSheet();
}

/* ---------- build once ---------- */
function ensureUi() {
  ensureStyle();
  if (fab) return;
  fab = el('button', {
    class: 'notes-fab',
    title: 'Notes (Ctrl/Cmd+Alt+N)',
    'aria-label': 'Open notes',
    onclick: () => toggleSheet(),
  }, [icon('pen', 'icon-lg')]);
  inputEl = el('textarea', {
    class: 'textarea',
    rows: '2',
    placeholder: 'Jot a thought… Enter saves · Shift+Enter new line',
  });
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (addNote(inputEl.value)) inputEl.value = '';
    }
    if (e.key === 'Escape') closeSheet();
  });
  const saveBtn = el('button', {
    class: 'btn btn-sm btn-primary',
    title: 'Save note',
    onclick: () => { if (addNote(inputEl.value)) inputEl.value = ''; inputEl.focus(); },
  }, [icon('plus', 'icon-sm')]);
  countEl = el('span', { class: 'notes-count' });
  listEl = el('div', { class: 'notes-list' });
  sheet = el('div', { class: 'notes-sheet' }, [
    el('div', { class: 'notes-head' }, [
      el('span', { class: 'notes-title', text: 'Notes' }),
      countEl,
      el('button', {
        class: 'btn btn-ghost btn-icon btn-sm',
        title: 'Close notes',
        onclick: () => closeSheet(),
      }, [icon('x', 'icon-sm')]),
    ]),
    el('div', { class: 'notes-input-row' }, [inputEl, saveBtn]),
    listEl,
  ]);
  document.body.appendChild(fab);
  document.body.appendChild(sheet);
  renderList();
  refreshVisibility();
}

/* ---------- visibility & auto-hide ---------- */
function refreshVisibility() {
  if (!fab) return;
  const st = getState();
  const show = st.view === 'workspace' && !!st.project;
  fab.hidden = !show;
  if (!show) closeSheet();
}

function armGlobalKeys() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheetOpen()) { closeSheet(); return; }
    if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 'n' || e.key === 'N')) {
      const st = getState();
      if (st.view === 'workspace' && st.project) {
        e.preventDefault();
        toggleSheet();
      }
      return;
    }
    if (!fab || fab.hidden) return;
    const t = e.target;
    const inEditor = t && t.closest && t.closest('.panel-body');
    const inSheet = t && t.closest && t.closest('.notes-sheet');
    if (inEditor && !inSheet && !sheetOpen()) {
      fab.classList.add('is-idle');
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { fab.classList.remove('is-idle'); }, 1400);
    }
  });
}

/* ---------- entry ---------- */
export function initNotes() {
  ensureUi();
  armGlobalKeys();
  subscribe((state, change) => {
    if (change.view || change.project) refreshVisibility();
    if (change.project) renderList();
  });
}
