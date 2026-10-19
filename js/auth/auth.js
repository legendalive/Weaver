/* =========================================================
   Weaver — js/auth/auth.js
   v2.0 Stage 2: authentication gate (Supabase Auth).
   
   SECURITY:
   - The URL and ANON key below are public by design.
   - Never add the `service_role` key to this repository.
   ========================================================= */
import { el, clear } from '../utils/dom.js';
import { icon } from '../utils/icons.js';

/* ── STAGE 0: paste your Supabase credentials ── */
const SUPABASE_URL = 'https://hiqmvhkwuvvgalqxxtbc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpcW12aGt3dXZ2Z2FscXh4dGJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0MzQxOTMsImV4cCI6MjEwODAxMDE5M30.BgYJxwX7JFsrbKXeqhnS84rs7l9V1gWz9o-C5AZS8ls';
/* ───────────────────────────────────────────────────────────────────────── */

let sb = null;
let cachedUserId = null;

/* ---------- Public session helpers (used by app.js) ---------- */

export function authConfigured() {
  return SUPABASE_URL.startsWith('https://') && SUPABASE_ANON_KEY.length > 20;
}

export function currentUserId() {
  return cachedUserId;
}

export function onAuthChange(cb) {
  if (!sb) return;
  sb.auth.onAuthStateChange((event, session) => {
    cachedUserId = session?.user?.id || null;
    cb({ session });
  });
}

export async function signOutUser() {
  try { if (sb) await sb.auth.signOut(); } catch (e) { console.warn('[Auth] signOut:', e); }
}

/* ---------- Supabase bootstrap ---------- */

function loadSupabaseScript() {
  return new Promise((resolve, reject) => {
    if (window.supabase) return resolve();
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the Supabase auth script.'));
    document.head.appendChild(s);
  });
}

export async function initAuth() {
  if (!authConfigured()) return { signedIn: false, reason: 'not-configured' };
  try {
    await loadSupabaseScript();
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { session } } = await sb.auth.getSession();
    if (session) cachedUserId = session.user.id;
    return { signedIn: !!session, reason: 'ok' };
  } catch (e) {
    return { signedIn: false, reason: 'load-failed', error: e.message };
  }
}

/* ---------- Auth view UI ---------- */

export function renderAuthView(container) {
  clear(container);
  if (!authConfigured()) { renderSetupNotice(container); return; }

  let mode = 'signin'; 
  let busy = false;

  const tabsEl = el('div', { class: 'auth-tabs' });
  const formEl = el('form', { class: 'auth-form', onsubmit: (e) => e.preventDefault() });
  const errorEl = el('div', { class: 'auth-error', hidden: true });
  const successEl = el('div', { class: 'auth-error', hidden: true, style: { color: 'var(--success)', borderColor: 'rgba(127, 176, 105, .35)', background: 'rgba(127, 176, 105, .1)' } });

  const card = el('div', { class: 'auth-card' }, [
    el('div', { class: 'auth-head' }, [
      el('div', { class: 'auth-logo' }, [icon('feather', 'icon-lg')]),
      el('div', {}, [
        el('div', { class: 'auth-title', text: 'Weaver' }),
        el('div', { class: 'auth-tag', text: 'Structure · Refine · Generate' }),
      ]),
    ]),
    tabsEl,
    errorEl,
    successEl,
    formEl,
    el('p', {
      class: 'auth-hint',
      text: 'Private by design: your stories live in your browser and sync only to your own cloud storage.',
    }),
  ]);

  container.appendChild(el('div', { class: 'auth-wrap' }, [card]));

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = !msg;
    successEl.hidden = true;
  }
  
  function showSuccess(msg) {
    successEl.textContent = msg;
    successEl.hidden = !msg;
    errorEl.hidden = true;
  }

  function setBusy(b, label) {
    busy = b;
    const submit = formEl.querySelector('.btn-primary');
    if (submit) {
      submit.disabled = b;
      if (label) submit.textContent = label;
    }
  }

  /* ----- Supabase flows ----- */
  async function doSignIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.session) {
      cachedUserId = data.session.user.id;
      location.reload(); // Trigger app.js boot sequence
    }
  }

  async function doSignUp(email, password) {
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) throw error;
    if (data.session) {
      // Instant login (email confirmation disabled or auto-confirmed)
      cachedUserId = data.session.user.id;
      location.reload();
    } else if (data.user) {
      // Email confirmation required
      showSuccess('Account created! Check your email for a confirmation link, then sign in.');
      mode = 'signin';
      renderForm();
    }
  }

  /* ----- UI Rendering ----- */
  function renderTabs() {
    clear(tabsEl);
    const tabs = [
      { key: 'signin', label: 'Sign in' },
      { key: 'signup', label: 'Create account' },
    ];
    for (const t of tabs) {
      tabsEl.appendChild(el('button', {
        class: 'btn' + (mode === t.key ? ' is-selected' : ''),
        text: t.label,
        onclick: () => { mode = t.key; showError(''); successEl.hidden = true; renderTabs(); renderForm(); },
      }));
    }
  }

  function renderForm() {
    clear(formEl);
    renderTabs();

    const emailInput = el('input', {
      class: 'input', type: 'email', required: true, autocomplete: 'email',
      placeholder: 'you@example.com',
    });
    const passInput = el('input', {
      class: 'input', type: 'password', required: true,
      autocomplete: mode === 'signin' ? 'current-password' : 'new-password',
      placeholder: mode === 'signin' ? 'Password' : 'Choose a password',
    });
    
    formEl.append(
      el('div', { class: 'field' }, [el('span', { class: 'field-label', text: 'Email' }), emailInput]),
      el('div', { class: 'field' }, [el('span', { class: 'field-label', text: 'Password' }), passInput]),
      el('button', {
        class: 'btn btn-primary', type: 'submit',
        text: mode === 'signin' ? 'Sign in to Weaver' : 'Create my account',
      }),
    );
    
    formEl.onsubmit = async (e) => {
      e.preventDefault();
      if (busy) return;
      showError('');
      setBusy(true, 'One moment…');
      try {
        if (mode === 'signin') await doSignIn(emailInput.value.trim(), passInput.value);
        else await doSignUp(emailInput.value.trim(), passInput.value);
      } catch (err) {
        showError(err.message || 'Authentication failed.');
      }
      setBusy(false, mode === 'signin' ? 'Sign in to Weaver' : 'Create my account');
    };
    setTimeout(() => emailInput.focus(), 60);
  }

  renderForm();
}

/* ---------- Setup notice ---------- */
function renderSetupNotice(container) {
  container.appendChild(el('div', { class: 'auth-wrap' }, [
    el('div', { class: 'auth-notice' }, [
      el('strong', { text: 'Authentication is not configured yet.' }),
      el('p', { text: 'To finish setup:' }),
      el('p', { text: '1. Create a free project at supabase.com.' }),
      el('p', { text: '2. Go to Settings -> API.' }),
      el('p', { text: '3. Paste the Project URL and the `anon` `public` key at the top of js/auth/auth.js.' }),
    ]),
  ]));
}
