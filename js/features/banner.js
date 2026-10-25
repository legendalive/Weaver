/* =========================================================
Weaver — js/features/banner.js
V3.1g: announcement / maintenance banner.
Fetches the current banner from the open admin endpoint on
boot; renders a slim fixed strip at the top of the viewport
on the auth / launch / workspace screens. Level drives the
colour: info (gold), warning (red), maintenance (bold gold).
Users can dismiss for the current session (sessionStorage).
Silent on any error — the banner is non-critical.
========================================================= */
const API_BASE = 'https://hiqmvhkwuvvgalqxxtbc.functions.supabase.co/admin';
const BANNER_ID = 'weaver-app-banner';
const STYLE_ID = 'weaver-banner-style';
const DISMISS_KEY = 'weaver_banner_dismissed';

let loaded = false;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    #${BANNER_ID}{
      position:fixed;top:0;left:0;right:0;z-index:1000;
      display:flex;align-items:center;gap:12px;
      padding:10px 16px;
      font-size:.85rem;line-height:1.4;
      box-shadow:0 2px 8px rgba(0,0,0,.4);
      font-family:var(--font-ui,system-ui,sans-serif);
      pointer-events:auto;
    }
    #${BANNER_ID}.level-info{
      background:rgba(224,168,60,.14);
      border-bottom:1px solid rgba(224,168,60,.4);
      color:#e0a83c;
    }
    #${BANNER_ID}.level-warning{
      background:rgba(212,96,79,.12);
      border-bottom:1px solid rgba(212,96,79,.4);
      color:#d4604f;
    }
    #${BANNER_ID}.level-maintenance{
      background:rgba(224,168,60,.22);
      border-bottom:1px solid rgba(224,168,60,.6);
      color:#e0a83c;font-weight:600;
    }
    #${BANNER_ID} .bn-text{flex:1;}
    #${BANNER_ID} .bn-close{
      background:none;border:none;color:inherit;
      font-size:1.3rem;line-height:1;cursor:pointer;padding:0 6px;
      opacity:.7;
    }
    #${BANNER_ID} .bn-close:hover{opacity:1;}
  `;
  document.head.appendChild(s);
}

function renderBanner({ text, level }) {
  if (document.getElementById(BANNER_ID)) return;
  let dismissed = null;
  try { dismissed = sessionStorage.getItem(DISMISS_KEY); } catch {}
  if (dismissed && dismissed === text) return;

  const el = document.createElement('div');
  el.id = BANNER_ID;
  el.className = 'level-' + (level || 'info');
  el.setAttribute('role', 'status');

  const textEl = document.createElement('span');
  textEl.className = 'bn-text';
  textEl.textContent = text;

  const close = document.createElement('button');
  close.className = 'bn-close';
  close.setAttribute('aria-label', 'Dismiss announcement');
  close.textContent = '×';
  close.addEventListener('click', () => {
    try { sessionStorage.setItem(DISMISS_KEY, text); } catch {}
    el.remove();
  });

  el.appendChild(textEl);
  el.appendChild(close);
  document.body.prepend(el);
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
  } catch {
    /* non-critical — never surface an error for a banner */
  }
}
