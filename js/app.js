/* =========================================================
   Weaver — js/app.js
   Application entry point.
   Step 5: boot + view routing driven by the reactive store.
   ========================================================= */

import { getState, subscribe } from './core/state.js';

const APP_VERSION = '0.2.0';
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

  // Re-route whenever the store reports a view change.
  subscribe((state, change) => {
    if (change.view) switchView(state.view);
  });

  switchView(getState().view);
  console.info(
    `%cWeaver v${APP_VERSION}%c state store online`,
    'color:#e0a83c;font-weight:bold', 'color:inherit'
  );
}

boot();
