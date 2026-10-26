/* =========================================================
   Weaver — js/app.js
   v2 Stage 6.9.1: boot + Supabase auth gate + per-user namespace.
   HARDENED: boot() can never leave the user trapped on the
   splash. Exceptions surface on screen, and a watchdog reveals
   a retry card if no view has activated within 15s.
   Splash screen is explicitly hidden on view activation.
   ========================================================= */
import { getState, subscribe, openProject, reloadSettings } from './core/state.js';
import {
  getActiveProject, setUserNamespace,
  hasLegacyData, namespaceIsEmpty, migrateLegacyData,
} from './core/storage.js';
import { el, clear, toast } from './utils/dom.js';
import { icon } from './utils/icons.js';
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
import { loadBanner } from './features/banner.js';
import { renderManuscript } from './panels/manuscript.js';
import { loadEntitlement } from './core/entitlements.js';
import { renderMainNovel } from './panels/main-novel.js';

const APP_VERSION = '2.0.0';
const VIEWS = ['auth', 'launch', 'workspace'];
const WATCHDOG_MS = 15000;

let inApp = false;
let watchdog = null;

function setStatus(text) {
  const status = document.getElementById('boot-status');
  if (status) status.textContent = text;
}

function switchView(name) {
  if (!VIEWS.includes(name)) return false;
  // CRITICAL: Hide the static splash screen as soon as any view activates
  const splash = document.querySelector('.splash');
  if (splash) splash.style.display = 'none';
  
  for (const v of VIEWS) {
    const node = document.getElementById(`view-${v}`);
    if (node) node.classList.toggle('is-active', v === name);
  }
  return true;
}

function anyViewActive() {
  return VIEWS.some((v) => {
    const node = document.getElementById(`view-${v}`);
    return node && node.classList.contains('is-active');
  });
}

function showAuthView() {
  switchView('auth');
  const container = document.getElementById('view-auth');
  if (container) renderAuthView(container);
}

/* Last resort: never leave the user staring at the splash. */
function bootFailed(message) {
  inApp = false;
  setStatus('could not start');
  // CRITICAL: Hide splash before showing error card
  const splash = document.querySelector('.splash');
  if (splash) splash.style.display = 'none';
  
  switchView('auth');
  const container = document.getElementById('view-auth');
  if (!container) return;
  clear(container);
  container.appendChild(el('div', { class: 'auth-wrap' }, [
    el('div', { class: 'auth-card' }, [
      el('div', { class: 'auth-head' }, [
        el('div', { class: 'auth-logo' }, [icon('alert', 'icon-lg')]),
        el('div', {}, [
          el('div', { class: 'auth-title', text: 'Weaver could not start' }),
          el('div', { class: 'auth-tag', text: 'Your work is safe' }),
        ]),
      ]),
      el('div', { class: 'auth-error', text: message || 'An unexpected error occurred during startup.' }),
      el('p', {
        class: 'auth-hint',
        text: 'Nothing has been lost — your projects are stored in this browser. Reload to try again; if it persists, check your connection (the sign-in service may be unreachable).',
      }),
      el('button', { class: 'btn btn-primary', text: 'Reload Weaver', onclick: () => location.reload() }),
    ]),
  ]));
}

function armWatchdog() {
  clearTimeout(watchdog);
  watchdog = setTimeout(() => {
    if (!anyViewActive()) {
      bootFailed('Startup timed out. The sign-in service may be unreachable.');
    }
  }, WATCHDOG_MS);
}

function disarmWatchdog() { clearTimeout(watchdog); watchdog = null; }

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
  loadEntitlement(userId);

  /* Silent one-time adoption of pre-account (v1) data on this device. */
  if (namespaceIsEmpty() && hasLegacyData()) {
    migrateLegacyData();
    reloadSettings();
    loadEntitlement(userId);
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
  if (activeId) {
    if (!openProject(activeId)) switchView('launch');
  } else {
    switchView(getState().view === 'workspace' ? 'launch' : getState().view);
  }
}

async function boot() {
armWatchdog();
loadBanner();
try {
    setStatus('contacting auth service…');

    const result = await initAuth();

    if (!authConfigured()) {
      setStatus('auth setup required');
      showAuthView();
      disarmWatchdog();
      return;
    }

    if (result.reason === 'load-failed') {
      setStatus('auth service unreachable');
      showAuthView();
      disarmWatchdog();
      toast('Could not reach the auth service. Check your connection and reload.', 'danger');
      return;
    }

    if (result.signedIn) {
      setStatus('session found · opening your library…');
      await enterApp();
      if (!inApp || !anyViewActive()) {
        showAuthView();
        disarmWatchdog();
        return;
      }
      setStatus(`foundation online · v${APP_VERSION}`);
    } else {
      setStatus('awaiting sign-in');
      showAuthView();
    }

    disarmWatchdog();

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
  } catch (e) {
    console.error('[Boot] failed:', e);
    disarmWatchdog();
    bootFailed(e && e.message ? e.message : String(e));
  }
}

boot();
