/* =========================================================
   Weaver — js/app.js
   Application entry point.
   Step 1: boot sequence + minimal view-router stub.
   (Real views/state arrive in Stage C; this file stays the single
    bootstrap that later modules hook into.)
   ========================================================= */

const APP_VERSION = '0.1.0';

const VIEWS = ['launch', 'workspace'];

/** Minimal view router stub — upgraded to the full router in Stage C. */
export function switchView(name) {
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
  switchView('launch');
  console.info(
    `%cWeaver v${APP_VERSION}%c foundation booted`,
    'color:#e0a83c;font-weight:bold', 'color:inherit'
  );
}

/* Module scripts are deferred, so the DOM is already parsed here. */
boot();
