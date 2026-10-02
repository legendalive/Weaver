/* =========================================================
   Weaver — js/app.js
   Application entry point.
   Step 6: boot + store-driven routing + launch view init.
   ========================================================= */

import { getState, subscribe } from './core/state.js';
import { initLaunch } from './views/launch.js';

const APP_VERSION = '0.3.0';
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
  switchView(getState().view);
  console.info(
    `%cWeaver v${APP_VERSION}%c launch dashboard online`,
    'color:#e0a83c;font-weight:bold', 'color:inherit'
  );
}

boot();
