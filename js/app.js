/* =========================================================
   Weaver — js/app.js
   Application entry point.
   Step 22: boot + routing + resume + Scribe + AI Output actions.
   ========================================================= */

import { getState, subscribe, openProject } from './core/state.js';
import { getActiveProject } from './core/storage.js';
import { initLaunch } from './views/launch.js';
import { initWizard } from './views/wizard.js';
import { initWorkspace } from './views/workspace.js';
import { initScribe } from './features/scribe.js';
import { initAiOutput } from './panels/ai-output.js';

const APP_VERSION = '0.8.0';
const VIEWS = ['launch', 'workspace'];

function switchView(name) {
  if (!VIEWS.includes(name)) return false;
  for (const v of VIEWS) {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.toggle('is-active', v === name);
  }
  return true;
}

function boot() {
  const status = document.getElementById('boot-status');
  if (status) {
    status.textContent = `foundation online · v${APP_VERSION}`;
  }

  subscribe((state, change) => {
    if (change.view) switchView(state.view);
  });

  initLaunch();
  initWizard();
  initWorkspace();
  initScribe();
  initAiOutput();

  const activeId = getActiveProject();
  if (activeId) {
    openProject(activeId);
  } else {
    switchView(getState().view);
  }

  console.info(
    `%cWeaver v${APP_VERSION}%c ai output actions online`,
    'color:#e0a83c;font-weight:bold', 'color:inherit'
  );
}

boot();
