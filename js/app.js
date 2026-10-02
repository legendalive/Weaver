/* =========================================================
   Weaver — js/app.js
   Application entry point.
   Step 8: boot + routing + launch + wizard + workspace shell.
   ========================================================= */

import { getState, subscribe } from './core/state.js';
import { initLaunch } from './views/launch.js';
import { initWizard } from './views/wizard.js';
import { initWorkspace } from './views/workspace.js';

const APP_VERSION = '0.5.0';
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
  switchView(getState().view);
  console.info(
    `%cWeaver v${APP_VERSION}%c workspace shell online`,
    'color:#e0a83c;font-weight:bold', 'color:inherit'
  );
}

boot();
