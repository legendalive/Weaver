/* =========================================================
   Weaver — js/auth/auth.js
   v2.0 Stage 2: authentication gate (Clerk) + Google OAuth.
   DORMANT in Stage 1 — app.js wires it in Stage 2.

   SECURITY:
   - The PUBLISHABLE key below is public by design.
   - Clerk's SECRET key must NEVER be added to this repo.
   ========================================================= */
import { el, clear } from '../utils/dom.js';
import { icon } from '../utils/icons.js';

/* ── STAGE 0: paste your Clerk PUBLISHABLE key (pk_live_…) ── */
const CLERK_PUBLISHABLE_KEY = 'pk_live_Y2xlcmsubGVnZW5kYWxpdmUuZ2l0aHViLmlvJA';
/* ───────────────────────────────────────────────────────────────────────── */

let loadPromise = null;
let pendingSignIn = null;
let pendingSignUp = null;

/* ---------- Public session helpers ---------- */

export function authConfigured() {
  return /^pk_(test|live)_\S+$/.test(CLERK_PUBLISHABLE_KEY);
}

function clerk() { return window.Clerk; }

export function currentUserId() {
  return (clerk() && clerk().user && clerk().user.id) || null;
}

export function currentUserEmail() {
  const u = clerk() && clerk().user;
  return (u && u.primaryEmailAddress && u.primaryEmailAddress.emailAddress) || '';
}

export function onAuthChange(cb) {
  if (clerk() && typeof clerk().addListener === 'function') {
    clerk().addListener((payload) => cb(payload));
  }
}

export async function signOutUser() {
  try { if (clerk()) await clerk().signOut(); } catch (e) { console.warn('[Auth] signOut:', e); }
}

/* ---------- Clerk bootstrap ---------- */

function loadClerkScript() {
  return new Promise((resolve, reject) => {
    if (window.Clerk) return resolve();
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js';
    s.setAttribute('data-clerk-publishable-key', CLERK_PUBLISHABLE_KEY);
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the Clerk auth script (network blocked?).'));
    document.head.appendChild(s);
  });
}

export async function initAuth() {
  if (!authConfigured()) return { signedIn: false, reason: 'not-configured' };
  if (!loadPromise) {
    loadPromise = (async () => {
      await loadClerkScript();
      await clerk().load();
      return { signedIn: Boolean(clerk().session), reason: 'ok' };
    })().catch((e) => {
      loadPromise = null; 
      return { signedIn: false, reason: 'load-failed', error: e.message };
    });
  }
  return loadPromise;
}

/* ---------- Error shaping ---------- */

function clerkMessage(e) {
  return (e && e.errors && e.errors[0] && (e.errors[0].longMessage || e.errors[0].message))
    || (e && e.message)
    || 'Authentication failed. Please try again.';
}

/* ---------- Google OAuth Helper ---------- */

async function signInWithGoogle(setBusy, showError) {
  showError('');
  setBusy(true, 'Redirecting to Google…');
  try {
    // Clerk handles user creation automatically if they don't exist yet
    await clerk().client.signIn.authenticateWithRedirect({
      strategy: 'oauth_google',
      redirectUrl: window.location.href,
      redirectUrlComplete: window.location.href,
    });
  } catch (err) {
    showError(clerkMessage(err));
    setBusy(false);
  }
}

/* ---------- Auth view ---------- */

export function renderAuthView(container) {
  clear(container);
  if (!authConfigured()) { renderSetupNotice(container); return; }

  let mode = 'signin'; 
  let busy = false;

  const tabsEl = el('div', { class: 'auth-tabs' });
  const formEl = el('form', { class: 'auth-form', onsubmit: (e) => e.preventDefault() });
  const errorEl = el('div', { class: 'auth-error', hidden: true });

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
    formEl,
    el('p', {
      class: 'auth-hint',
      text: 'Private by design: your stories live in your browser and sync only to your own cloud storage. Weaver’s servers never see your manuscripts.',
    }),
  ]);

  container.appendChild(el('div', { class: 'auth-wrap' }, [card]));

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = !msg;
  }

  function setBusy(b, label) {
    busy = b;
    const submit = formEl.querySelector('.btn-primary');
    if (submit) {
      submit.disabled = b;
      if (label) submit.textContent = label;
    }
  }

  function afterSession() {
    showError('');
  }

  /* ----- Email/Password flows ----- */

  async function doSignIn(email, password) {
    const si = await clerk().client.signIn.create({ identifier: email, password });
    if (si.status === 'complete') {
      await clerk().setActive({ session: si.createdSessionId });
      afterSession();
      return;
    }
    if (si.status === 'needs_first_factor') {
      const canCode = (si.supportedFirstFactors || []).some((f) => f.strategy === 'email_code');
      if (!canCode) throw new Error('This account needs a verification step Weaver does not support yet.');
      await si.prepareFirstFactor({ strategy: 'email_code' });
      pendingSignIn = si;
      mode = 'verify-signin';
      renderForm();
      return;
    }
    throw new Error('Unexpected sign-in state — please try again.');
  }

  async function doSignUp(email, password) {
    const su = await clerk().client.signUp.create({ emailAddress: email, password });
    if (su.status === 'complete') {
      await clerk().setActive({ session: su.createdSessionId });
      afterSession();
      return;
    }
    const ver = su.verifications && su.verifications.emailAddress;
    if (ver && ver.status === 'unverified') {
      await su.prepareEmailAddressVerification({ strategy: 'email_code' });
      pendingSignUp = su;
      mode = 'verify-signup';
      renderForm();
      return;
    }
    throw new Error('Could not create the account — check the details and try again.');
  }

  async function doVerify(code) {
    if (mode === 'verify-signin') {
      const si = await pendingSignIn.attemptFirstFactor({ strategy: 'email_code', code });
      if (si.status !== 'complete') throw new Error('Verification did not complete.');
      await clerk().setActive({ session: si.createdSessionId });
    } else {
      const su = await pendingSignUp.attemptEmailAddressVerification({ code });
      if (su.status !== 'complete') throw new Error('Verification did not complete.');
      await clerk().setActive({ session: su.createdSessionId });
    }
    afterSession();
  }

  /* ----- UI Rendering ----- */

  function renderTabs() {
    clear(tabsEl);
    tabsEl.hidden = mode.startsWith('verify');
    const tabs = [
      { key: 'signin', label: 'Sign in' },
      { key: 'signup', label: 'Create account' },
    ];
    for (const t of tabs) {
      tabsEl.appendChild(el('button', {
        class: 'btn' + (mode === t.key ? ' is-selected' : ''),
        text: t.label,
        onclick: () => { mode = t.key; showError(''); renderTabs(); renderForm(); },
      }));
    }
  }

  function renderForm() {
    clear(formEl);
    renderTabs();

    // Google OAuth Button
    const googleBtn = el('button', {
      class: 'btn', type: 'button',
      style: { width: '100%', justifyContent: 'center', gap: '10px', background: 'var(--surface-2)', border: '1px solid var(--border-strong)' },
      onclick: () => signInWithGoogle(setBusy, showError)
    }, [
      el('span', { html: '<svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>' }),
      el('span', { text: 'Continue with Google' })
    ]);

    const divider = el('div', {
      style: { display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--faint)', fontSize: '.7rem', letterSpacing: '.1em' }
    }, [
      el('div', { style: { flex: '1', height: '1px', background: 'var(--border)' } }),
      el('span', { text: 'OR' }),
      el('div', { style: { flex: '1', height: '1px', background: 'var(--border)' } }),
    ]);

    if (mode === 'signin' || mode === 'signup') {
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
        googleBtn,
        divider,
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
          showError(clerkMessage(err));
        }
        setBusy(false, mode === 'signin' ? 'Sign in to Weaver' : 'Create my account');
      };
      setTimeout(() => emailInput.focus(), 60);
      return;
    }

    /* verify-signin / verify-signup */
    const targetEmail = mode === 'verify-signin'
      ? (pendingSignIn && pendingSignIn.identifier)
      : (pendingSignUp && pendingSignUp.emailAddress);
    const codeInput = el('input', {
      class: 'input', type: 'text', inputmode: 'numeric', maxlength: '8',
      autocomplete: 'one-time-code', placeholder: '••••••',
    });
    formEl.append(
      el('p', {
        class: 'auth-hint',
        text: `We emailed a verification code to ${targetEmail || 'your address'}. Enter it below.`,
      }),
      el('div', { class: 'auth-code-row' }, [
        codeInput,
        el('button', { class: 'btn btn-primary', type: 'submit', text: 'Verify' }),
      ]),
      el('button', {
        class: 'btn btn-ghost btn-sm', text: '← Back',
        onclick: () => {
          pendingSignIn = null; pendingSignUp = null;
          mode = 'signin'; showError(''); renderForm();
        },
      }),
    );
    formEl.onsubmit = async (e) => {
      e.preventDefault();
      if (busy) return;
      showError('');
      setBusy(true, 'Verifying…');
      try {
        await doVerify(codeInput.value.trim());
      } catch (err) {
        showError(clerkMessage(err));
      }
      setBusy(false, 'Verify');
    };
    setTimeout(() => codeInput.focus(), 60);
  }

  renderForm();
}

/* ---------- Setup notice ---------- */

function renderSetupNotice(container) {
  container.appendChild(el('div', { class: 'auth-wrap' }, [
    el('div', { class: 'auth-notice' }, [
      el('strong', { text: 'Authentication is not configured yet.' }),
      el('p', { text: 'To finish setup:' }),
      el('p', { text: '1. Create a free app at clerk.com (Production instance, Email + Password enabled).' }),
      el('p', { text: '2. Copy the Publishable Key (starts with pk_live_ or pk_test_).' }),
      el('p', { text: '3. Paste it at the top of js/auth/auth.js, replacing PASTE_YOUR_CLERK_PUBLISHABLE_KEY.' }),
      el('p', { text: 'The Publishable Key is public by design. Never add the Secret Key to this repository.' }),
    ]),
  ]));
}
