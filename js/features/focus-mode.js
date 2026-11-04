/* =========================================================
Weaver — js/features/focus-mode.js
V4: Distraction-free fullscreen writing mode.
Hides topbar, pills, other panels, resizers, FABs.
Shows ONLY the Manuscript panel expanded to fill the viewport.
Exit: Escape key or floating × button.
Self-styled. No state persistence (session-only).
========================================================= */
import { el } from '../utils/dom.js';
import { icon } from '../utils/icons.js';

const STYLE_ID = 'focus-mode-style';
const CSS = `
html.weaver-focus-mode #app > *:not(#view-workspace),
html.weaver-focus-mode .topbar,
html.weaver-focus-mode .panel-pills,
html.weaver-focus-mode .panel-resizer,
html.weaver-focus-mode .scribe-fab,
html.weaver-focus-mode .notes-fab,
html.weaver-focus-mode .tb-more-sheet,
html.weaver-focus-mode .modal-backdrop,
html.weaver-focus-mode #weaver-app-banner { display: none !important; }
html.weaver-focus-mode #view-workspace { display: flex !important; }
html.weaver-focus-mode .workspace-panels {
  position: fixed !important; inset: 0 !important;
  display: flex !important; flex-direction: column !important;
  z-index: 200 !important; background: var(--bg) !important;
}
html.weaver-focus-mode .workspace-panels > .panel:not([data-panel="manuscript"]) { display: none !important; }
html.weaver-focus-mode .workspace-panels > .panel[data-panel="manuscript"] {
  display: flex !important; flex: 1 1 100% !important; width: 100% !important;
}
html.weaver-focus-mode .panel-header { opacity: 0.3; transition: opacity .2s ease; }
html.weaver-focus-mode .panel-header:hover { opacity: 1; }
html.weaver-focus-mode .panel-footer { justify-content: center; }
.fm-exit {
  position: fixed; top: 12px; right: 12px; z-index: 300;
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--surface-2); border: 1px solid var(--border-strong);
  color: var(--muted); display: flex; align-items: center; justify-content: center;
  cursor: pointer; opacity: 0.4; transition: opacity .2s ease, background .15s ease;
}
.fm-exit:hover { opacity: 1; background: var(--surface-3); color: var(--text); }
`;

let active = false;
let exitBtn = null;
let previousExpanded = null;

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
}

export function toggleFocusMode() {
  if (active) exitFocusMode();
  else enterFocusMode();
}

export function isInFocusMode() { return active; }

function enterFocusMode() {
  if (active) return;
  ensureStyle();

  /* Remember current expanded panel so we can restore it */
  try {
    const { getState } = await_import_state();
    previousExpanded = getState().ui.expandedPanel;
  } catch (_) { previousExpanded = null; }

  document.documentElement.classList.add('weaver-focus-mode');

  /* Floating exit button */
  exitBtn = el('button', {
    class: 'fm-exit',
    title: 'Exit focus mode (Esc)',
    'aria-label': 'Exit focus mode',
    onclick: exitFocusMode,
  }, [icon('x', 'icon-sm')]);
  document.body.appendChild(exitBtn);

  /* Enter browser fullscreen if allowed */
  try {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  } catch (_) {}

  active = true;

  /* Bind Escape */
  document.addEventListener('keydown', onEscape);
}

function exitFocusMode() {
  if (!active) return;
  document.documentElement.classList.remove('weaver-focus-mode');

  if (exitBtn) { exitBtn.remove(); exitBtn = null; }

  /* Exit browser fullscreen */
  try {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  } catch (_) {}

  document.removeEventListener('keydown', onEscape);
  active = false;
  previousExpanded = null;
}

function onEscape(e) {
  if (e.key === 'Escape') { e.preventDefault(); exitFocusMode(); }
}

/* Lazy state import to avoid circular deps */
function await_import_state() {
  /* Synchronous require-like access — state.js is always loaded before us */
  return window.__weaver_state_module || {};
}
