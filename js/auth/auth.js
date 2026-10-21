/* =========================================================
   Weaver — js/auth/auth.js
   v2.0 Stage 6.2: Supabase auth gate + password reset.
   Modes: sign in · create account · forgot password ·
   set new password (via the emailed reset link).
   ========================================================= */
import { el, clear } from '../utils/dom.js';
import { icon } from '../utils/icons.js';

/* ── Paste the SAME two values you used before ── */
const SUPABASE_URL = 'PASTE_YOUR_PROJECT_URL';
const SUPABASE_ANON_KEY = 'PASTE_YOUR_ANON_KEY';
/* ─────────────────────────────────────────────── */

let sb = null;
let loadPromise = null;
let cachedUserId = null;
let cachedUserEmail = '';

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
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      return sb;
    })();
  }
  return loadPromise;
}

/* A reset link lands here with "#…&type=recovery" in the URL. */
function isRecoveryUrl() {
  return window.location.hash.includes('type=recovery');
}

export async function initAuth() {
  if (!authConfigured()) return { signedIn: false, reason: 'not-configured' };
  try {
    const client = await getClient();
    // If this is a password-reset redirect, force the reset screen.
    if (isRecoveryUrl()) return { signedIn: false, reason: 'recovery' };
    const { data: { session } } = await client.auth.getSession();
    if (session) { cachedUserId = session.user.id; cachedUserEmail = session.user.email || ''; }
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
    cb({ session, event });
  });
  return () => { if (data && data.subscription) data.subscription.unsubscribe(); };
}

export async function signOutUser() {
  try { const client = await getClient(); await client.auth.signOut(); }
  catch (e) { console.warn('[Auth] signOut:', e); }
}

/* ---------- shared card chrome ---------- */
function authCard(children) {
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
  clear(container);
  if (!authConfigured()) { renderSetupNotice(container); return; }
  if (isRecoveryUrl()) { renderSetNewPassword(container); return; }
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
        class: 'btn btn-ghost btn-sm', type: 'button', text: 'Forgot password?',
        onclick: () => renderResetRequest(container),
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
          if (data.session) { location.reload(); }
          else {
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
function renderResetRequest(container) {
  clear(container);
  const err = errorBox();
  const ok = el('div', { class: 'auth-error', hidden: true, style: { color: 'var(--success)', borderColor: 'rgba(127,176,105,.35)', background: 'rgba(127,176,105,.1)' } });
  const emailInput = el('input', { class: 'input', type: 'email', required: true, placeholder: 'you@example.com' });
  const sendBtn = el('button', { class: 'btn btn-primary', type: 'submit', text: 'Send reset link' });
  const formEl = el('form', { class: 'auth-form', onsubmit: (e) => e.preventDefault() }, [
    el('div', { class: 'field' }, [el('span', { class: 'field-label', text: 'Account email' }), emailInput]),
    sendBtn,
    el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '← Back to sign in', onclick: () => renderSignInSignUp(container) }),
  ]);

  formEl.onsubmit = async (e) => {
    e.preventDefault();
    showErr(err, ''); ok.hidden = true;
    sendBtn.disabled = true; sendBtn.textContent = 'Sending…';
    try {
      const client = await getClient();
      const redirectTo = window.location.origin + window.location.pathname;
      const { error } = await client.auth.resetPasswordForEmail(emailInput.value.trim(), { redirectTo });
      if (error) throw error;
      ok.textContent = 'Reset link sent. Check your inbox, then click the link to set a new password.';
      ok.hidden = false;
    } catch (e2) {
      showErr(err, e2.message || 'Could not send the reset link.');
    }
    sendBtn.disabled = false; sendBtn.textContent = 'Send reset link';
  };

  container.appendChild(authCard([err, ok, formEl]));
  setTimeout(() => emailInput.focus(), 60);
}

/* ---------- set new password (arrived via reset link) ---------- */
function renderSetNewPassword(container) {
  clear(container);
  const err = errorBox();
  const passInput = el('input', { class: 'input', type: 'password', required: true, placeholder: 'New password' });
  const confirmInput = el('input', { class: 'input', type: 'password', required: true, placeholder: 'Confirm new password' });
  const saveBtn = el('button', { class: 'btn btn-primary', type: 'submit', text: 'Set new password' });
  const formEl = el('form', { class: 'auth-form', onsubmit: (e) => e.preventDefault() }, [
    el('p', { class: 'auth-hint', text: 'Choose a new password for your account.' }),
    el('div', { class: 'field' }, [el('span', { class: 'field-label', text: 'New password' }), passInput]),
    el('div', { class: 'field' }, [el('span', { class: 'field-label', text: 'Confirm' }), confirmInput]),
    saveBtn,
  ]);

  formEl.onsubmit = async (e) => {
    e.preventDefault();
    showErr(err, '');
    if (passInput.value.length < 6) { showErr(err, 'Password must be at least 6 characters.'); return; }
    if (passInput.value !== confirmInput.value) { showErr(err, 'Passwords do not match.'); return; }
    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    try {
      const client = await getClient();
      const { error } = await client.auth.updateUser({ password: passInput.value });
      if (error) throw error;
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      renderSignInSignUp(container);
    } catch (e2) {
      showErr(err, e2.message || 'Could not set the new password.');
      saveBtn.disabled = false; saveBtn.textContent = 'Set new password';
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
