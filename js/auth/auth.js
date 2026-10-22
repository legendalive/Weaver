/* =========================================================
   Weaver — js/auth/auth.js
   v2 Stage 6.11: Supabase auth + robust password reset on the
   SHARED client (js/core/supabase.js). Auth card shows a
   free-floating script W — no circular badge.
   ========================================================= */
import { el, clear, weaverLogo } from '../utils/dom.js';
import { getSupabaseClient, supabaseConfigured } from '../core/supabase.js';

const RECOVERY_FLAG = 'weaver_pw_recovery';
const AUTH_STYLE_ID = 'auth-style';

const AUTH_CSS = `.auth-wrap{width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:24px;background:radial-gradient(1200px 600px at 50% -10%,rgba(224,168,60,.06),transparent 60%),var(--bg);overflow-y:auto;} .auth-card{width:min(420px,100%);background:var(--surface);border:1px solid var(--border-strong);border-radius:var(--radius-lg);box-shadow:var(--shadow-2);padding:28px 28px 24px;display:flex;flex-direction:column;gap:20px;} .auth-head{display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;} .auth-logo{display:flex;align-items:center;justify-content:center;} .auth-logo .weaver-logo{font-size:2.6rem;line-height:1;} .auth-title{font-size:1.3rem;font-weight:700;letter-spacing:.02em;line-height:1.2;} .auth-tag{font-size:.7rem;color:var(--muted);letter-spacing:.15em;text-transform:uppercase;margin-top:2px;} .auth-form{display:flex;flex-direction:column;gap:14px;} .auth-form .field{gap:6px;} .auth-tabs{display:flex;gap:8px;border-bottom:1px solid var(--border);padding-bottom:12px;margin-bottom:4px;} .auth-tabs .btn{flex:1;justify-content:center;} .auth-tabs .btn.is-selected{border-color:rgba(224,168,60,.55);background:var(--accent-soft);color:var(--accent);} .auth-error{padding:10px 14px;border-radius:var(--radius-md);background:rgba(212,96,79,.1);border:1px solid rgba(212,96,79,.35);color:var(--danger);font-size:.82rem;line-height:1.5;} .auth-hint{font-size:.78rem;color:var(--muted);line-height:1.5;} .auth-notice{width:min(420px,100%);background:var(--surface);border:1px solid var(--border-strong);border-radius:var(--radius-lg);padding:24px;display:flex;flex-direction:column;gap:12px;}`;

function ensureStyle() {
  if (!document.getElementById(AUTH_STYLE_ID)) {
    const s = document.createElement('style');
    s.id = AUTH_STYLE_ID;
    s.textContent = AUTH_CSS;
    document.head.appendChild(s);
  }
}

let client = null;
let cachedUserId = null;
let cachedUserEmail = '';
let recoveryTokens = null;

async function ensureClient() {
  client = client || (await getSupabaseClient());
  return client;
}

export function authConfigured() { return supabaseConfigured(); }

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
    const c = await ensureClient();
    if (isRecovery) return { signedIn: false, reason: 'recovery' };
    const { data: { session } } = await c.auth.getSession();
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

/* RECOVERY LOCK: suppress app reloads while a reset is in progress. */
export function onAuthChange(cb) {
  if (!client) return () => {};
  const { data } = client.auth.onAuthStateChange((event, session) => {
    cachedUserId = session?.user?.id || null;
    cachedUserEmail = session?.user?.email || '';
    if (recoveryTokens) return;
    cb({ session, event });
  });
  return () => { if (data && data.subscription) data.subscription.unsubscribe(); };
}

export async function signOutUser() {
  try {
    const c = await ensureClient();
    await c.auth.signOut();
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
        el('div', { class: 'auth-logo' }, [weaverLogo('md')]),
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
        const c = await ensureClient();
        const email = emailInput.value.trim();
        const password = passInput.value;
        if (mode === 'signin') {
          const { error } = await c.auth.signInWithPassword({ email, password });
          if (error) throw error;
          location.reload();
        } else {
          const { data, error } = await c.auth.signUp({ email, password });
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
      const c = await ensureClient();
      const email = emailInput.value.trim();
      const redirectTo = window.location.origin + window.location.pathname;
      const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo });
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
      /* Shared client; the recovery lock above keeps app.js from
         reloading mid-reset. */
      const c = await ensureClient();
      const { error: sessErr } = await c.auth.setSession({
        access_token: recoveryTokens.access_token,
        refresh_token: recoveryTokens.refresh_token,
      });
      if (sessErr) throw new Error('This reset link has expired or is invalid. Go back and request a new one.');
      const { error } = await c.auth.updateUser({ password: pw });
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
      el('p', { text: 'Paste your Supabase Project URL and anon key at the top of js/core/supabase.js.' }),
    ]),
  ]));
}
