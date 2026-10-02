/* =========================================================
   Weaver — js/core/state.js
   Step 5: reactive application state store.
   Single source of truth for: current view, active project,
   settings, and transient UI state (panel sizes, expansion).
   Exports: getState, subscribe, setView, openProject,
            closeProject, touchProject, markDirty, flushSave,
            updateSettings, setUI
   ========================================================= */

import {
  getProject, saveProject, setActiveProject,
  getSettings, saveSettings,
} from './storage.js';

const state = {
  view: 'launch',        // 'launch' | 'workspace'
  project: null,         // full project object while workspace is open
  settings: getSettings(),
  ui: {
    expandedPanel: null, // 'manuscript' | 'novel' | 'ai' | null
    panelSizes: [34, 33, 33],
    hierarchyOpen: false,
  },
};

const listeners = new Set();

export function getState() { return state; }

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(change) {
  for (const listener of listeners) listener(state, change);
}

/* ---------- View ---------- */
export function setView(view) {
  state.view = view;
  emit({ view: true });
}

/* ---------- Project session ---------- */
export function openProject(id) {
  const project = getProject(id);
  if (!project) return false;
  flushSave(); // safety: persist any previous session first
  state.project = project;
  setActiveProject(id);
  state.view = 'workspace';
  emit({ project: true, view: true });
  return true;
}

export function closeProject() {
  flushSave();
  state.project = null;
  state.view = 'launch';
  emit({ project: true, view: true });
}

/* Modules mutate state.project directly, then call touchProject()
   to schedule autosave and notify subscribers. */
export function touchProject(change = {}) {
  markDirty();
  emit({ project: true, ...change });
}

/* ---------- Autosave ---------- */
let saveTimer = null;

export function markDirty() {
  if (!state.project) return;
  const interval = state.settings.general.autosaveInterval ?? 3000;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, interval);
}

export function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (state.project) saveProject(state.project);
}

/* ---------- Settings ----------
   Usage: updateSettings(s => { s.general.fontScale = 1.1; }) */
export function updateSettings(mutator) {
  if (typeof mutator === 'function') mutator(state.settings);
  saveSettings(state.settings);
  emit({ settings: true });
}

/* ---------- Transient UI ---------- */
export function setUI(patch) {
  Object.assign(state.ui, patch);
  emit({ ui: true });
}

/* ---------- Never lose work: persist on tab close / hide ---------- */
window.addEventListener('beforeunload', flushSave);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSave();
});
