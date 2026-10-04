/* =========================================================
   Weaver — js/app.js
   Application entry point.
   Step 25: boot + routing + resume + live preferences pass.
   ========================================================= */

import { getState, subscribe, openProject } from './core/state.js';
import { getActiveProject } from './core/storage.js';
import { initLaunch } from './views/launch.js';
import { initWizard } from './views/wizard.js';
import { initWorkspace } from './views/workspace.js';
import { initScribe } from './features/scribe.js';
import { initAiOutput } from './panels/ai-output.js';
import { initSearch } from './features/search.js';
import { renderManuscript } from './panels/manuscript.js';
import { renderMainNovel } from './panels/main-novel.js';

const APP_VERSION = '0.9.0';
const VIEWS = ['launch', 'workspace'];

function switchView(name) {
  if (!VIEWS.includes(name)) return false;
  for (const v of VIEWS) {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.toggle('is-active', v === name);
  }
  return true;
}

function applyFontScale() {
  const fs = getState().settings.general.fontScale ?? 1;
  document.documentElement.style.setProperty('--font-scale', String(fs));
}

let settingsTimer = null;

function boot() {
  const status = document.getElementById('boot-status');
  if (status) {
    status.textContent = `foundation online · v${APP_VERSION}`;
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

  applyFontScale();

  const activeId = getActiveProject();
  if (activeId) {
    openProject(activeId);
  } else {
    switchView(getState().view);
  }

  console.info(
    `%cWeaver v${APP_VERSION}%c preferences live`,
    'color:#e0a83c;font-weight:bold', 'color:inherit'
  );
}

boot();
