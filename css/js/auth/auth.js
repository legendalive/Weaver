/* =========================================================
   Weaver — js/auth/auth.js
   v2.0 Stage 1: authentication gate (Clerk).
   DORMANT in Stage 1 — app.js wires it in Stage 2.

   Loads clerk-js from CDN (no build step, no terminal),
   renders a vanilla Sign in / Create account / Verify UI
   into #view-auth, and exposes session helpers.

   SECURITY:
   - The PUBLISHABLE key below is public by design (safe in
     client code, like a site ID).
   - Clerk's SECRET key must NEVER be added to this repo.
   ========================================================= */
import { el, clear } from '../utils/dom.js';
import { icon } from '../utils/icons.js';

/* ── STAGE 0: paste your Clerk PUBLISHABLE key (pk_live_… or pk_test_…) ── */
const CLERK_PUBLISHABLE_KEY = 'PASTE_YOUR_CLERK_PUBLISHABLE_KEY';
/* ───────────────────────────────────────────────────────────────────────── */

let loadPromise = null;
let pendingSignIn = null;
let pendingSignUp = null;

/* ---------- Public session helpers (used by app.js in Stage 2) ---------- */

export function authConfigured() {
  return /^pk_(test|live)_[A-Za-z0-9]+$/.test(CLERK_PUBLISHABLE_KEY);
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
      loadPromise = null; // allow retry on next boot
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

/* ---------- Auth view (called by app.js in Stage 2) ---------- */

export function renderAuthView(container) {
  clear(container);
  if (!authConfigured()) { renderSetupNotice(container); return; }

  let mode = 'signin'; // 'signin' | 'signup' | 'verify-signin' | 'verify-signup'
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
    /* Stage 2: app.js listens via onAuthChange() and boots the workspace. */
    showError('');
  }

  /* ----- flows ----- */

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

  /* ----- rendering ----- */

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

/* ---------- Setup notice (only visible if the key wasn't pasted) ---------- */

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
