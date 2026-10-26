/* =========================================================
Weaver — js/features/support.js
V3.7a: user → owner support form.
Injects a small "Support" button into the workspace topbar.
The form sends through the support Edge Function; the sender's
email comes from their verified session, not from the form.
The owner's personal email is never shown in the app.
========================================================= */
import { el, toast, modal } from '../utils/dom.js';
import { getState, subscribe } from '../core/state.js';
import { getSupabaseClient } from '../core/supabase.js';

const API = 'https://hiqmvhkwuvvgalqxxtbc.functions.supabase.co/support';
const BTN_ID = 'weaver-support-btn';
const STYLE_ID = 'weaver-support-style';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    #${BTN_ID}{
      flex:none; white-space:nowrap;
      font-size:.76rem; padding:6px 11px; border-radius:999px;
      border:1px solid var(--border-strong); background:transparent;
      color:var(--muted); cursor:pointer;
    }
    #${BTN_ID}:hover{ color:var(--accent); border-color:rgba(224,168,60,.5); }
    @media (max-width:860px){ #${BTN_ID}{ display:none; } }
  `;
  document.head.appendChild(s);
}

function injectButton() {
  ensureStyle();
  if (getState().view !== 'workspace') return;
  if (document.getElementById(BTN_ID)) return;
  const bar = document.querySelector('.topbar');
  if (!bar) return;
  const btn = el('button', {
    id: BTN_ID,
    type: 'button',
    title: 'Contact Weaver support',
    onclick: openSupport,
  }, ['Support']);
  bar.appendChild(btn);
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
