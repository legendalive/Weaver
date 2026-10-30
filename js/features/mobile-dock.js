/* =========================================================
Weaver — js/features/mobile-dock.js
V3.9: Mobile dock overhaul. Owns the phone layout entirely
with inline styles so no stylesheet chain can break it:
pins .workspace-panels to the viewport under the pill bar,
stretches the active panel, scrolls its body, and docks its
footer at the screen bottom above the floating buttons.
Self-healing: re-applies on resize, rotation, breakpoint
crossing and any DOM/style mutation (pill taps, re-renders,
banners). Desktop is never touched (styles are released).
========================================================= */
import { getState, subscribe } from '../core/state.js';

window.WEAVER_DOCK_VER = '1.0';

const MQ = '(max-width:860px)';
let registry = [];   /* { el, props:[...] } — inline styles we own */
let mqObj = null;
let observer = null;
let queued = false;

function isMobile() { return window.matchMedia(MQ).matches; }
function inWorkspace() {
  const st = getState();
  return st.view === 'workspace' && !!st.project;
}

/* Only write when the value actually changes (prevents
   observer feedback loops). */
function setProp(el, prop, value) {
  if (el.style[prop] === value) return;
  let rec = registry.find((r) => r.el === el);
  if (!rec) { rec = { el, props: [] }; registry.push(rec); }
  if (!rec.props.includes(prop)) rec.props.push(prop);
  el.style[prop] = value;
}

function clearAll() {
  for (const rec of registry) {
    for (const p of rec.props) rec.el.style[p] = '';
    if (rec.el.dataset && rec.el.dataset.dockHide) {
      rec.el.style.display = '';
      delete rec.el.dataset.dockHide;
    }
  }
  registry = [];
}

function applyDock() {
  const panelsEl = document.querySelector('.workspace-panels');
  if (!panelsEl) return;
  if (!isMobile() || !inWorkspace()) { clearAll(); return; }

  /* Pin the panel stack to the viewport, flush under the pills. */
  const anchor = document.querySelector('.panel-pills') || document.querySelector('.topbar');
  const topPx = anchor ? Math.round(anchor.getBoundingClientRect().bottom) : 104;
  setProp(panelsEl, 'position', 'fixed');
  setProp(panelsEl, 'left', '0');
  setProp(panelsEl, 'right', '0');
  setProp(panelsEl, 'bottom', '0');
  setProp(panelsEl, 'top', topPx + 'px');
  setProp(panelsEl, 'display', 'flex');
  setProp(panelsEl, 'flexDirection', 'column');
  setProp(panelsEl, 'minHeight', '0');
  setProp(panelsEl, 'zIndex', '1');

  /* Stretch the visible panel; hide stragglers if an older
     workspace build left more than one showing. */
  const panels = Array.from(panelsEl.querySelectorAll(':scope > .panel'));
  let visible = panels.filter((p) => p.style.display !== 'none');
  if (visible.length > 1) {
    for (const p of visible.slice(1)) {
      p.style.display = 'none';
      p.dataset.dockHide = '1';
      if (!registry.find((r) => r.el === p)) registry.push({ el: p, props: [] });
    }
    visible = [visible[0]];
  }
  const active = visible[0] || panels[0];
  if (!active) return;
  setProp(active, 'display', 'flex');
  setProp(active, 'flexDirection', 'column');
  setProp(active, 'flex', '1 1 0');
  setProp(active, 'minHeight', '0');
  setProp(active, 'width', '100%');

  const body = active.querySelector('.panel-body');
  if (body) {
    setProp(body, 'flex', '1 1 auto');
    setProp(body, 'minHeight', '0');
    setProp(body, 'overflowY', 'auto');
  }
  const footer = active.querySelector('.panel-footer');
  if (footer) {
    setProp(footer, 'flex', 'none');
    setProp(footer, 'justifyContent', 'center');
    setProp(footer, 'padding', '6px 64px calc(6px + env(safe-area-inset-bottom, 0px))');
  }
  panelsEl.querySelectorAll('.panel-resizer').forEach((r) => setProp(r, 'display', 'none'));
}

function queueDock() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; applyDock(); });
}

export function initMobileDock() {
  mqObj = window.matchMedia(MQ);
  if (mqObj.addEventListener) mqObj.addEventListener('change', queueDock);
  else if (mqObj.addListener) mqObj.addListener(queueDock);
  window.addEventListener('resize', queueDock);
  window.addEventListener('orientationchange', queueDock);
  if (typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(() => queueDock());
    observer.observe(document.body, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ['style', 'class', 'hidden'],
    });
  }
  subscribe(() => queueDock());
  queueDock();
}
