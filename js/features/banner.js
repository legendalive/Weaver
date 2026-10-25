/* =========================================================
Weaver — js/features/banner.js
V3.1g (rev 2): announcement / maintenance banner.

PLACEMENT CHANGE: no longer a floating overlay. The strip is a
push-down bar at the top of the viewport — #app is offset and
shrunk by exactly the banner's measured height, so nothing is
ever covered (topbar, logo, hero all stay fully visible and
clickable). A ResizeObserver re-measures on wrap/rotation, so
multi-line text on phones stays correct.

Fetches the current banner from the open admin endpoint on boot.
Users can dismiss it for the session (sessionStorage keyed on the
message text, so a NEW announcement reappears even after dismiss).
Silent on any error — a banner must never break the app.
========================================================= */

const API_BASE = 'https://hiqmvhkwuvvgalqxxtbc.functions.supabase.co/admin';
const BANNER_ID = 'weaver-app-banner';
const STYLE_ID = 'weaver-banner-style';
const DISMISS_KEY = 'weaver_banner_dismissed';
const ON_CLASS = 'weaver-banner-on';

const LEVEL_LABEL = {
  info: 'Notice',
  warning: 'Warning',
  maintenance: 'Maintenance',
};

let loaded = false;
let bannerEl = null;
let resizeObs = null;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    /* Push the whole app down by the banner's height. #app is
       border-box + overflow:hidden, so shrinking its height keeps
       the absolutely-positioned .view children perfectly fitted. */
    html.${ON_CLASS} #app{
      margin-top:var(--weaver-banner-h,0px);
      height:calc(100vh - var(--weaver-banner-h,0px));
    }
    #${BANNER_ID}{
      position:fixed;top:0;left:0;right:0;z-index:60;
      display:flex;align-items:center;gap:10px;
      padding:9px 12px 9px 11px;
      background:var(--surface,#141416);
      border-bottom:1px solid var(--border,#2b2b30);
      border-left:3px solid var(--accent,#e0a83c);
      font-family:var(--font-ui,'Inter',system-ui,-apple-system,sans-serif);
      font-size:.82rem;line-height:1.45;
      color:var(--text,#e8e5dd);
      box-shadow:0 1px 0 rgba(0,0,0,.45);
    }
    #${BANNER_ID}.level-warning{border-left-color:var(--danger,#d4604f);}
    #${BANNER_ID}.level-warning .bn-chip{
      color:var(--danger,#d4604f);
      border-color:rgba(212,96,79,.45);
      background:rgba(212,96,79,.12);
    }
    #${BANNER_ID}.level-maintenance{border-left-color:var(--accent,#e0a83c);}
    #${BANNER_ID}.level-maintenance .bn-text{font-weight:600;}
    #${BANNER_ID} .bn-chip{
      flex:none;
      font-family:var(--font-mono,'JetBrains Mono',ui-monospace,monospace);
      font-size:.6rem;font-weight:600;
      letter-spacing:.14em;text-transform:uppercase;
      color:var(--accent,#e0a83c);
      border:1px solid rgba(224,168,60,.45);
      background:rgba(224,168,60,.12);
      border-radius:999px;
      padding:3px 9px;
      white-space:nowrap;
    }
    #${BANNER_ID} .bn-text{flex:1 1 auto;min-width:0;overflow-wrap:anywhere;}
    #${BANNER_ID} .bn-close{
      flex:none;
      width:26px;height:26px;
      display:grid;place-items:center;
      background:none;border:1px solid transparent;border-radius:8px;
      color:var(--muted,#94918a);
      font-size:1.15rem;line-height:1;cursor:pointer;
      transition:color .15s ease,border-color .15s ease,background .15s ease;
    }
    #${BANNER_ID} .bn-close:hover{
      color:var(--text,#e8e5dd);
      border-color:var(--border-strong,#3a3a40);
      background:var(--surface-2,#1c1c20);
    }
    @media (max-width:520px){
      #${BANNER_ID}{font-size:.78rem;gap:8px;padding:8px 10px 8px 9px;}
      #${BANNER_ID} .bn-chip{font-size:.56rem;padding:2px 7px;letter-spacing:.1em;}
    }
  `;
  document.head.appendChild(s);
}

/* Keep the app offset exactly equal to the banner's real height. */
function applyOffset() {
  if (!bannerEl) return;
  const h = Math.round(bannerEl.getBoundingClientRect().height);
  document.documentElement.style.setProperty('--weaver-banner-h', h + 'px');
}

function observeHeight() {
  if (!bannerEl) return;
  if (resizeObs) { try { resizeObs.disconnect(); } catch (e) {} }
  if (typeof ResizeObserver === 'function') {
    resizeObs = new ResizeObserver(applyOffset);
    resizeObs.observe(bannerEl);
  }
  // Fallbacks for the first paint and for rotation/zoom.
  requestAnimationFrame(applyOffset);
  window.addEventListener('resize', applyOffset);
}

function removeBanner() {
  if (resizeObs) { try { resizeObs.disconnect(); } catch (e) {} resizeObs = null; }
  window.removeEventListener('resize', applyOffset);
  if (bannerEl) { bannerEl.remove(); bannerEl = null; }
  document.documentElement.classList.remove(ON_CLASS);
  document.documentElement.style.removeProperty('--weaver-banner-h');
}

function renderBanner({ text, level }) {
  if (document.getElementById(BANNER_ID)) return;

  // Session dismissal is keyed on the message: a NEW announcement
  // still shows even if the reader dismissed an older one.
  let dismissed = null;
  try { dismissed = sessionStorage.getItem(DISMISS_KEY); } catch (e) {}
  if (dismissed && dismissed === text) return;

  const lvl = LEVEL_LABEL[level] ? level : 'info';

  const el = document.createElement('div');
  el.id = BANNER_ID;
  el.className = 'level-' + lvl;
  el.setAttribute('role', 'status');

  const chip = document.createElement('span');
  chip.className = 'bn-chip';
  chip.textContent = LEVEL_LABEL[lvl];

  const textEl = document.createElement('span');
  textEl.className = 'bn-text';
  textEl.textContent = text;

  const close = document.createElement('button');
  close.className = 'bn-close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Dismiss announcement');
  close.title = 'Dismiss for this session';
  close.textContent = '×';
  close.addEventListener('click', () => {
    try { sessionStorage.setItem(DISMISS_KEY, text); } catch (e) {}
    removeBanner();
  });

  el.appendChild(chip);
  el.appendChild(textEl);
  el.appendChild(close);

  bannerEl = el;
  document.body.insertBefore(el, document.body.firstChild);
  document.documentElement.classList.add(ON_CLASS);
  observeHeight();
}

/* Called once from app.js at the start of boot(). */
export async function loadBanner() {
  if (loaded) return;
  loaded = true;
  injectStyle();
  try {
    const res = await fetch(API_BASE + '/api/announcement/public', {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !data.text) return;
    if (data.show_until) {
      const t = Date.parse(data.show_until);
      if (Number.isFinite(t) && t < Date.now()) return;
    }
    renderBanner(data);
  } catch (e) {
    /* non-critical — never surface an error for a banner */
  }
}

/* Lets other modules drop the banner immediately if ever needed. */
export function hideBanner() { removeBanner(); }
