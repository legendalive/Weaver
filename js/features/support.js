/* =========================================================
Weaver — js/features/support.js
V3.7b: user → owner support form.
Slots a "Support" button into the workspace topbar, right after
the Settings button (clones Settings' classes so it matches the
other toolbar buttons). Falls back to the topbar if Settings
can't be found.
========================================================= */
import { el, toast, modal } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { getState, subscribe } from '../core/state.js';
import { getSupabaseClient } from '../core/supabase.js';

const API = 'https://hiqmvhkwuvvgalqxxtbc.functions.supabase.co/support';
const BTN_ID = 'weaver-support-btn';

function injectButton() {
  if (getState().view !== 'workspace') return;
  if (document.getElementById(BTN_ID)) return;

  /* Find the Settings button so Support can slot in right after it. */
  const topbarBtns = Array.from(document.querySelectorAll('.topbar button, .topbar a'));
  const settingsBtn = topbarBtns.find((b) => {
    const label = (
      (b.textContent || '') + ' ' +
      (b.title || '') + ' ' +
      (b.getAttribute('aria-label') || '')
    ).toLowerCase();
    return label.includes('settings');
  });

  let mailIcon = null;
  try { mailIcon = icon('mail', 'icon-sm'); } catch (e) { mailIcon = null; }
  const content = mailIcon
    ? [mailIcon, el('span', { text: 'Support' })]
    : [el('span', { text: 'Support' })];

  if (settingsBtn) {
    const btn = el('button', {
      id: BTN_ID, type: 'button',
      class: settingsBtn.className,
      title: 'Contact Weaver support',
      onclick: openSupport,
    }, content);
    settingsBtn.insertAdjacentElement('afterend', btn);
  } else {
    const bar = document.querySelector('.topbar');
    if (!bar) return;
    const btn = el('button', {
      id: BTN_ID, type: 'button',
      class: 'btn btn-ghost btn-sm',
      title: 'Contact Weaver support',
      onclick: openSupport,
    }, content);
    bar.appendChild(btn);
  }
}

async function sessionToken() {
  try {
    const client = await getSupabaseClient();
    const { data } = await client.auth.getSession();
    return data && data.session ? data.session.access_token : '';
  } catch { return ''; }
}

export function openSupport() {
  const subject = el('input', {
    class: 'input', type: 'text', maxlength: '120',
    placeholder: 'e.g. Cloud sync question',
  });
  const body = el('textarea', {
    class: 'textarea', rows: '6', maxlength: '4000',
    placeholder: 'Tell me what happened. Please do not include passwords or API keys.',
  });
  const hint = el('p', {
    class: 'set-hint',
    text: 'Sent securely from your signed-in Weaver account. Your reply arrives at the email address on your account. No manuscripts or files are attached.',
  });
  const send = el('button', { class: 'btn btn-primary', text: 'Send message' });

  send.addEventListener('click', async () => {
    const text = body.value.trim();
    if (!text) { toast('Please write a message first.', 'info'); return; }
    send.disabled = true;
    send.textContent = 'Sending…';
    try {
      const token = await sessionToken();
      if (!token) throw new Error('Please sign in to Weaver first.');
      const res = await fetch(API + '/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ subject: subject.value.trim(), body: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send. Please try again.');
      m.close();
      toast('Message sent. Thank you — I usually reply within one business day.', 'success');
    } catch (e) {
      toast(e.message || 'Could not send.', 'danger');
      send.disabled = false;
      send.textContent = 'Send message';
    }
  });

  const m = modal({
    title: 'Contact Weaver',
    body: [hint, subject, body],
    footer: [send],
  });
}

export function initSupport() {
  injectButton();
  subscribe((state) => {
    if (state.view === 'workspace') injectButton();
    else {
      const btn = document.getElementById(BTN_ID);
      if (btn) btn.remove();
    }
  });
}
