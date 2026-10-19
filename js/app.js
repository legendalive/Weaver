/* =========================================================
   Weaver — js/app.js
   v2.0 Stage 2: boot + Supabase auth gate + per-user namespace.
   Flow: splash → initAuth() → signed in ? namespaced boot
   : auth view. Session transitions use full reloads so no
   module ever initializes twice.
   ========================================================= */
import { getState, subscribe, openProject, reloadSettings } from './core/state.js';
import {
  getActiveProject, setUserNamespace,
  hasLegacyData, namespaceIsEmpty, migrateLegacyData,
} from './core/storage.js';
import { toast } from './utils/dom.js';
import {
  initAuth, authConfigured, currentUserId, onAuthChange, renderAuthView,
} from './auth/auth.js';
import { initLaunch } from './views/launch.js';
import { initWizard } from './views/wizard.js';
import { initWorkspace } from './views/workspace.js';
import { initScribe } from './features/scribe.js';
import { initAiOutput } from './panels/ai-output.js';
import { initSearch } from './features/search.js';
import { initCapture } from './features/capture.js';
import { renderManuscript } from './panels/manuscript.js';
import { renderMainNovel } from './panels/main-novel.js';

const APP_VERSION = '2.0.0';
const VIEWS = ['auth', 'launch', 'workspace'];

let inApp = false;

function setStatus(text) {
  const status = document.getElementById('boot-status');
  if (status) status.textContent = text;
}

function switchView(name) {
  if (!VIEWS.includes(name)) return false;
  for (const v of VIEWS) {
    const node = document.getElementById(`view-${v}`);
    if (node) node.classList.toggle('is-active', v === name);
  }
  return true;
}

function showAuthView() {
  switchView('auth');
  renderAuthView(document.getElementById('view-auth'));
}

function applyFontScale() {
  const fs = getState().settings.general.fontScale ?? 1;
  document.documentElement.style.setProperty('--font-scale', String(fs));
}

let settingsTimer = null;

/* Runs exactly once per page load, after a session is confirmed. */
async function enterApp() {
  const userId = currentUserId();
  if (!userId) return;
  inApp = true;

  /* All storage reads/writes from here on are user-scoped. */
  setUserNamespace(userId);
  reloadSettings();

  /* SILENT migration: adopt pre-account (v1) data found on this device.
     No blocking prompt — just move it to the user namespace and proceed. */
  if (namespaceIsEmpty() && hasLegacyData()) {
    migrateLegacyData();
    reloadSettings();
  }

  subscribe((state, change) => {
    if (change.view) switchView(state.view);
    if (change.settings) {
      applyFontScale();
      clearTimeout(settingsTimer);
      settingsTimer = setTimeout(() => {
        if (getState().view === 'workspace' && getState().project) {
          renderManuscript();
          renderMainNovel();
        }
      }, 500);
    }
  });

  initLaunch();
  initWizard();
  initWorkspace();
  initScribe();
  initAiOutput();
  initSearch();
  initCapture();
  applyFontScale();

  const activeId = getActiveProject();
  if (activeId) openProject(activeId);
  else switchView(getState().view === 'workspace' ? 'launch' : getState().view);
}

async function boot() {
  setStatus('contacting auth service…');

  const result = await initAuth();

  if (!authConfigured()) {
    setStatus('auth setup required');
    showAuthView();
    return;
  }

  if (result.reason === 'load-failed') {
    setStatus('auth service unreachable');
    showAuthView();
    toast('Could not reach the auth service. Check your connection and reload.', 'danger');
    return;
  }

  if (result.signedIn) {
    setStatus('session found · opening your library…');
    await enterApp();
    if (!inApp) { showAuthView(); return; }
    setStatus(`foundation online · v${APP_VERSION}`);
  } else {
    setStatus('awaiting sign-in');
    showAuthView();
  }

  /* Session transitions = full reload (no double-init landmines). */
  onAuthChange((payload) => {
    const session = payload && payload.session;
    if (session && !inApp) location.reload();
    else if (!session && inApp) location.reload();
  });

  console.info(
    `%cWeaver v${APP_VERSION}%c auth gate online`,
    'color:#e0a83c;font-weight:bold', 'color:inherit'
  );
}

boot();
