/* =========================================================
   Weaver — js/auth/auth.js
   v2 Stage 6.8.2: Supabase auth + ROBUST password reset + CSS.
   ========================================================= */
import { el, clear } from '../utils/dom.js';
import { icon } from '../utils/icons.js';

/* ── PASTE YOUR SUPABASE CREDENTIALS HERE ── */
const SUPABASE_URL = 'https://hiqmvhkwuvvgalqxxtbc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpcW12aGt3dXZ2Z2FscXh4dGJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0MzQxOTMsImV4cCI6MjEwODAxMDE5M30.BgYJxwX7JFsrbKXeqhnS84rs7l9V1gWz9o-C5AZS8ls';
/* ─────────────────────────────────────────────────────────── */

const RECOVERY_FLAG = 'weaver_pw_recovery';
const AUTH_STYLE_ID = 'auth-style';

/* ---------- Injected CSS for auth screens ---------- */
const AUTH_CSS = `.auth-wrap{width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:24px;background:radial-gradient(1200px 600px at 50% -10%,rgba(224,168,60,.06),transparent 60%),var(--bg);overflow-y:auto;} .auth-card{width:min(420px,100%);background:var(--surface);border:1px solid var(--border-strong);border-radius:var(--radius-lg);box-shadow:var(--shadow-2);padding:28px 28px 24px;display:flex;flex-direction:column;gap:20px;} .auth-head{display:flex;align-items:center;gap:14px;} .auth-logo{width:44px;height:44px;flex:none;display:grid;place-items:center;border-radius:50%;color:var(--accent);background:rgba(224,168,60,.12);border:1px solid rgba(224,168,60,.35);} .auth-logo .icon{width:24px;height:24px;} .auth-title{font-size:1.3rem;font-weight:700;letter-spacing:.02em;line-height:1.2;} .auth-tag{font-size:.7rem;color:var(--muted);letter-spacing:.15em;text-transform:uppercase;margin-top:2px;} .auth-form{display:flex;flex-direction:column;gap:14px;} .auth-form .field{gap:6px;} .auth-tabs{display:flex;gap:8px;border-bottom:1px solid var(--border);padding-bottom:12px;margin-bottom:4px;} .auth-tabs .btn{flex:1;justify-content:center;} .auth-tabs .btn.is-selected{border-color:rgba(224,168,60,.55);background:var(--accent-soft);color:var(--accent);} .auth-error{padding:10px 14px;border-radius:var(--radius-md);background:rgba(212,96,79,.1);border:1px solid rgba(212,96,79,.35);color:var(--danger);font-size:.82rem;line-height:1.5;} .auth-hint{font-size:.78rem;color:var(--muted);line-height:1.5;} .auth-notice{width:min(420px,100%);background:var(--surface);border:1px solid var(--border-strong);border-radius:var(--radius-lg);padding:24px;display:flex;flex-direction:column;gap:12px;}`;

function ensureStyle() {
  if (!document.getElementById(AUTH_STYLE_ID)) {
    const s = document.createElement('style');
    s.id = AUTH_STYLE_ID;
    s.textContent = AUTH_CSS;
    document.head.appendChild(s);
  }
}

let sb = null;
let loadPromise = null;
let cachedUserId = null;
let cachedUserEmail = '';
let recoveryTokens = null;

export function authConfigured() {
  return /^https:\/\//.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20;
}

function loadSupabaseScript() {
  return new Promise((resolve, reject) => {
    if (window.supabase) return resolve();
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the Supabase script.'));
    document.head.appendChild(s);
  });
}

async function getClient() {
  if (sb) return sb;
  if (!loadPromise) {
    loadPromise = (async () => {
      await loadSupabaseScript();
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { detectSessionInUrl: false },
      });
      return sb;
    })();
  }
  return loadPromise;
}

function detectRecovery() {
  const hash = window.location.hash;
  if (hash && hash.includes('type=recovery')) {
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (access_token && refresh_token) {
      recoveryTokens = { access_token, refresh_token };
      try { sessionStorage.setItem(RECOVERY_FLAG, JSON.stringify(recoveryTokens)); } catch {}
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      return true;
    }
  }
  try {
    const saved = sessionStorage.getItem(RECOVERY_FLAG);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.access_token && parsed.refresh_token) {
        recoveryTokens = parsed;
        return true;
      }
      sessionStorage.removeItem(RECOVERY_FLAG);
    }
  } catch {}
  return false;
}

function clearRecovery() {
  recoveryTokens = null;
  try { sessionStorage.removeItem(RECOVERY_FLAG); } catch {}
}

export async function initAuth() {
  if (!authConfigured()) return { signedIn: false, reason: 'not-configured' };
  try {
    const isRecovery = detectRecovery();
    const client = await getClient();
    if (isRecovery) return { signedIn: false, reason: 'recovery' };
    const { data: { session } } = await client.auth.getSession();
    if (session) {
      cachedUserId = session.user.id;
      cachedUserEmail = session.user.email || '';
    }
    return { signedIn: !!session, reason: 'ok' };
  } catch (e) {
    return { signedIn: false, reason: 'load-failed', error: e.message };
  }
}

export function currentUserId() { return cachedUserId; }
export function currentUserEmail() { return cachedUserEmail; }

export function onAuthChange(cb) {
  if (!sb) return () => {};
  const { data } = sb.auth.onAuthStateChange((event, session) => {
    cachedUserId = session?.user?.id || null;
    cachedUserEmail = session?.user?.email || '';
    if (recoveryTokens) return;
    cb({ session, event });
  });
  return () => { if (data && data.subscription) data.subscription.unsubscribe(); };
}

export async function signOutUser() {
  try {
    const client = await getClient();
    await client.auth.signOut();
  } catch (e) {
    console.warn('[Auth] signOut:', e);
  }
}

/* ---------- shared card chrome ---------- */
function authCard(children) {
  ensureStyle();
  return el('div', { class: 'auth-wrap' }, [
    el('div', { class: 'auth-card' }, [
      el('div', { class: 'auth-head' }, [
        el('div', { class: 'auth-logo' }, [icon('feather', 'icon-lg')]),
        el('div', {}, [
          el('div', { class: 'auth-title', text: 'Weaver' }),
          el('div', { class: 'auth-tag', text: 'Structure · Refine · Generate' }),
        ]),
      ]),
      ...children,
    ]),
  ]);
}

function errorBox() { return el('div', { class: 'auth-error', hidden: true }); }
function showErr(box, msg) { box.textContent = msg; box.hidden = !msg; }

/* ---------- entry ---------- */
export function renderAuthView(container) {
  ensureStyle();
  clear(container);
  if (!authConfigured()) { renderSetupNotice(container); return; }
  if (recoveryTokens) { renderResetPassword(container); return; }
  renderSignInSignUp(container);
}

/* ---------- sign in / create account ---------- */
function renderSignInSignUp(container) {
  let mode = 'signin';
  const tabsEl = el('div', { class: 'auth-tabs' });
  const formEl = el('form', { class: 'auth-form', onsubmit: (e) => e.preventDefault() });
  const err = errorBox();

  function renderTabs() {
    clear(tabsEl);
    for (const t of [{ key: 'signin', label: 'Sign in' }, { key: 'signup', label: 'Create account' }]) {
      tabsEl.appendChild(el('button', {
        class: 'btn' + (mode === t.key ? ' is-selected' : ''),
        text: t.label,
        onclick: () => { mode = t.key; showErr(err, ''); renderTabs(); renderForm(); },
      }));
    }
  }

  function renderForm() {
    clear(formEl);
    renderTabs();
    const emailInput = el('input', { class: 'input', type: 'email', required: true, autocomplete: 'email', placeholder: 'you@example.com' });
    const passInput = el('input', { class: 'input', type: 'password', required: true, autocomplete: mode === 'signin' ? 'current-password' : 'new-password', placeholder: mode === 'signin' ? 'Password' : 'Choose a password' });
    const submit = el('button', { class: 'btn btn-primary', type: 'submit', text: mode === 'signin' ? 'Sign in to Weaver' : 'Create my account' });

    formEl.append(
      el('div', { class: 'field' }, [el('span', { class: 'field-label', text: 'Email' }), emailInput]),
      el('div', { class: 'field' }, [el('span', { class: 'field-label', text: 'Password' }), passInput]),
      submit,
    );

    if (mode === 'signin') {
      formEl.appendChild(el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        text: 'Forgot password?',
        onclick: () => renderForgotPassword(container),
      }));
    }

    formEl.onsubmit = async (e) => {
      e.preventDefault();
      showErr(err, '');
      submit.disabled = true; submit.textContent = 'One moment…';
      try {
        const client = await getClient();
        const email = emailInput.value.trim();
        const password = passInput.value;
        if (mode === 'signin') {
          const { error } = await client.auth.signInWithPassword({ email, password });
          if (error) throw error;
          location.reload();
        } else {
          const { data, error } = await client.auth.signUp({ email, password });
          if (error) throw error;
          if (data.session) {
            location.reload();
          } else {
            showErr(err, 'Account created. Check your email to confirm it, then sign in.');
            submit.disabled = false; submit.textContent = 'Create my account';
            return;
          }
        }
      } catch (e2) {
        showErr(err, e2.message || 'Authentication failed.');
        submit.disabled = false; submit.textContent = mode === 'signin' ? 'Sign in to Weaver' : 'Create my account';
      }
    };
    setTimeout(() => emailInput.focus(), 60);
  }

  container.appendChild(authCard([err, tabsEl, formEl]));
  renderForm();
}

/* ---------- forgot password: request the email ---------- */
function renderForgotPassword(container) {
  clear(container);
  const err = errorBox();
  const emailInput = el('input', { class: 'input', type: 'email', required: true, placeholder: 'you@example.com' });
  const sendBtn = el('button', { class: 'btn btn-primary', type: 'submit', text: 'Send reset link' });
  const formEl = el('form', { class: 'auth-form', onsubmit: (e) => e.preventDefault() }, [
    el('p', { class: 'auth-hint', text: 'Enter your account email. We will send you a link to reset your password.' }),
    el('div', { class: 'field' }, [el('span', { class: 'field-label', text: 'Account email' }), emailInput]),
    sendBtn,
    el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '← Back to sign in', onclick: () => renderSignInSignUp(container) }),
  ]);

  formEl.onsubmit = async (e) => {
    e.preventDefault();
    showErr(err, '');
    sendBtn.disabled = true; sendBtn.textContent = 'Sending…';
    try {
      const client = await getClient();
      const email = emailInput.value.trim();
      const redirectTo = window.location.origin + window.location.pathname;
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      renderLinkSent(container, email);
    } catch (e2) {
      showErr(err, e2.message || 'Could not send the reset link.');
      sendBtn.disabled = false; sendBtn.textContent = 'Send reset link';
    }
  };

  container.appendChild(authCard([err, formEl]));
  setTimeout(() => emailInput.focus(), 60);
}

/* ---------- "link sent" screen ---------- */
function renderLinkSent(container, email) {
  clear(container);
  container.appendChild(authCard([
    el('div', {
      class: 'auth-error',
      style: { color: 'var(--success)', borderColor: 'rgba(127,176,105,.35)', background: 'rgba(127,176,105,.1)' },
      text: 'Reset link sent — check your email.',
    }),
    el('p', { class: 'auth-hint', text: `Open the message we sent to ${email} and click the link inside to set a new password.` }),
    el('p', { class: 'auth-hint', text: 'Nothing there? Check your spam folder, then come back and send another.' }),
    el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '← Back to sign in', onclick: () => renderSignInSignUp(container) }),
  ]));
}

/* ---------- set new password (arrived via reset link) ---------- */
function renderResetPassword(container) {
  const err = errorBox();
  const passInput = el('input', { class: 'input', type: 'password', placeholder: 'New password', autocomplete: 'new-password' });
  const confirmInput = el('input', { class: 'input', type: 'password', placeholder: 'Confirm new password', autocomplete: 'new-password' });
  const submit = el('button', { class: 'btn btn-primary', type: 'submit', text: 'Set new password' });
  const formEl = el('form', { class: 'auth-form', onsubmit: (e) => e.preventDefault() }, [
    el('p', { class: 'auth-hint', text: 'Enter a new password for your account.' }),
    el('div', { class: 'field' }, [el('span', { class: 'field-label', text: 'New password' }), passInput]),
    el('div', { class: 'field' }, [el('span', { class: 'field-label', text: 'Confirm new password' }), confirmInput]),
    submit,
    el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '← Back to sign in', onclick: () => { clearRecovery(); renderSignInSignUp(container); } }),
  ]);

  formEl.onsubmit = async (e) => {
    e.preventDefault();
    showErr(err, '');
    const pw = passInput.value;
    if (pw.length < 6) { showErr(err, 'Password must be at least 6 characters.'); return; }
    if (pw !== confirmInput.value) { showErr(err, 'Passwords do not match.'); return; }
    submit.disabled = true; submit.textContent = 'Saving…';
    try {
      const resetClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { detectSessionInUrl: false },
      });
      const { error: sessErr } = await resetClient.auth.setSession({
        access_token: recoveryTokens.access_token,
        refresh_token: recoveryTokens.refresh_token,
      });
      if (sessErr) throw new Error('This reset link has expired or is invalid. Go back and request a new one.');
      const { error } = await resetClient.auth.updateUser({ password: pw });
      if (error) throw error;
      clearRecovery();
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      location.reload();
    } catch (e2) {
      showErr(err, e2.message || 'Could not reset the password.');
      submit.disabled = false; submit.textContent = 'Set new password';
    }
  };

  container.appendChild(authCard([err, formEl]));
  setTimeout(() => passInput.focus(), 60);
}

/* ---------- setup notice ---------- */
function renderSetupNotice(container) {
  container.appendChild(el('div', { class: 'auth-wrap' }, [
    el('div', { class: 'auth-notice' }, [
      el('strong', { text: 'Authentication is not configured yet.' }),
      el('p', { text: 'Paste your Supabase Project URL and anon key at the top of js/auth/auth.js.' }),
    ]),
  ]));
}
