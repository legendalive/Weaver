/* =========================================================
   Weaver — js/core/resizers.js
   Step 9: drag-to-resize engine for the three-panel workspace.
   Pointer Events (mouse + touch), axis auto-detected from the
   container's flex direction. Sizes persist as percentages in
   settings.general.panelSizes. Double-click a border to reset.
   ========================================================= */

import { getState, updateSettings } from './state.js';

const MIN_PCT = 10;
const DEFAULT_SPLIT = [33.4, 33.3, 33.3];

let ctx = null;          // { container, panels[3], resizers[2] }
let windowBound = false;

export function bindResizers(context) {
  ctx = context;
  ctx.resizers.forEach((r, idx) => {
    if (r.dataset.bound) return;
    r.dataset.bound = '1';
    r.addEventListener('pointerdown', (e) => startDrag(e, idx));
    r.addEventListener('dblclick', () => resetSizes());
  });
  if (!windowBound) {
    windowBound = true;
    window.addEventListener('resize', refreshLayout);
  }
  refreshLayout();
}

/* ---------- Geometry helpers ---------- */
function axis() {
  if (!ctx) return 'x';
  const dir = getComputedStyle(ctx.container).flexDirection;
  return dir.startsWith('column') ? 'y' : 'x';
}

function sizes() {
  const s = getState().settings.general.panelSizes;
  return Array.isArray(s) && s.length === 3 ? s.slice() : DEFAULT_SPLIT.slice();
}

function applyPct(pct) {
  if (!ctx) return;
  const a = axis();
  const total = a === 'x' ? ctx.container.clientWidth : ctx.container.clientHeight;
  const resizerTotal = ctx.resizers.reduce(
    (sum, r) => sum + (a === 'x' ? r.offsetWidth : r.offsetHeight), 0
  );
  const available = Math.max(total - resizerTotal, 0);
  ctx.panels.forEach((p, k) => {
    p.style.flex = `0 0 ${(available * pct[k]) / 100}px`;
  });
}

/* Called by workspace.js whenever expansion state changes. */
export function refreshLayout() {
  if (!ctx) return;
  if (getState().ui.expandedPanel) {
    for (const p of ctx.panels) p.style.flex = '';
    return;
  }
  applyPct(sizes());
}

function commit(pct) {
  updateSettings((s) => { s.general.panelSizes = pct; });
}

function resetSizes() {
  commit(DEFAULT_SPLIT.slice());
  refreshLayout();
}

/* ---------- Drag lifecycle ---------- */
function startDrag(event, index) {
  if (!ctx || getState().ui.expandedPanel) return;
  event.preventDefault();

  const a = axis();
  const resizer = ctx.resizers[index];
  const base = sizes();
  const total = (a === 'x' ? ctx.container.clientWidth : ctx.container.clientHeight) || 1;
  const startPos = a === 'x' ? event.clientX : event.clientY;
  let latest = base;

  resizer.classList.add('is-dragging');
  document.body.style.userSelect = 'none';
  document.body.style.cursor = a === 'x' ? 'col-resize' : 'row-resize';
  resizer.setPointerCapture(event.pointerId);

  const onMove = (e) => {
    const pos = a === 'x' ? e.clientX : e.clientY;
    let delta = ((pos - startPos) / total) * 100;
    // Clamp so neither neighbour collapses below MIN_PCT
    delta = Math.max(delta, MIN_PCT - base[index]);
    delta = Math.min(delta, base[index + 1] - MIN_PCT);
    latest = base.slice();
    latest[index] += delta;
    latest[index + 1] -= delta;
    applyPct(latest); // inline-only during drag: no settings writes per frame
  };

  const onUp = () => {
    resizer.removeEventListener('pointermove', onMove);
    resizer.removeEventListener('pointerup', onUp);
    resizer.removeEventListener('pointercancel', onUp);
    resizer.classList.remove('is-dragging');
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    commit(latest); // single persisted write at drag end
  };

  resizer.addEventListener('pointermove', onMove);
  resizer.addEventListener('pointerup', onUp);
  resizer.addEventListener('pointercancel', onUp);
}
