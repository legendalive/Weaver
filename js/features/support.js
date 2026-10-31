/* =========================================================
Weaver — js/features/support.js
V3.9: Support Center — instant lookup (answer directly below
the question), human contact form, and "Your requests" so
users see team replies in-app. Backend handles quota,
escalation, and the strict support voice.
========================================================= */
import { el, toast, modal } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { getState, subscribe } from '../core/state.js';
import { getSupabaseClient } from '../core/supabase.js';

const HELP_BASE = 'https://hiqmvhkwuvvgalqxxtbc.functions.supabase.co/help';
const API = 'https://hiqmvhkwuvvgalqxxtbc.functions.supabase.co/support';
const BTN_ID = 'weaver-support-btn';
const STYLE_ID = 'support-style';

const CSS = `.sup-section{display:flex;flex-direction:column;gap:10px;padding:12px 0;border-bottom:1px solid var(--border);} .sup-section:last-child{border-bottom:none;padding-bottom:0;} .sup-label{font-size:.7rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:650;} .sup-lookup-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;} .sup-lookup-row .input{flex:1;min-width:180px;} .sup-card{border:1px solid var(--border-strong);border-radius:12px;padding:12px;background:var(--surface-2);display:flex;flex-direction:column;gap:10px;} .sup-card-head{font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);font-weight:650;} .sup-feedback{display:flex;gap:8px;align-items:center;flex-wrap:wrap;} .sup-feedback span{font-size:.78rem;color:var(--muted);} .sup-p{font-size:.85rem;line-height:1.65;color:var(--text);} .sup-code{font-family:var(--font-mono);font-size:.8em;background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:1px 5px;} .sup-hint{font-size:.72rem;color:var(--faint);line-height:1.5;} .sup-reply{margin-top:8px;padding:8px 10px;background:var(--surface);border:1px solid var(--border);border-radius:8px;} .sup-reply-head{font-size:.66rem;color:var(--faint);font-family:var(--font-mono);margin-bottom:4px;}`;

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function inline(s) {
  let out = esc(s);
  out = out.replace(/`([^`]+)`/g, '<span class="sup-code">$1</span>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return out;
}
function richP(htmlStr) {
  const d = document.createElement('p');
  d.className = 'sup-p';
  d.innerHTML = htmlStr;
  return d;
}

/* ---------- topbar button ---------- */
function injectButton() {
  if (getState().view !== 'workspace') return;
  if (document.getElementById(BTN_ID)) return;
  const topbarBtns = Array.from(document.querySelectorAll('.topbar button, .topbar a'));
  const settingsBtn = topbarBtns.find((b) => {
    const label = (
      (b.textContent || '') + ' ' +
      (b.title || '') + ' ' +
      (b.getAttribute('aria-label') || '')
    ).toLowerCase();
    return label.includes('settings');
  });
  const content = [icon('send', 'icon-sm'), el('span', { text: 'Support' })];
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
  const injected = document.getElementById(BTN_ID);
  if (injected) injected.classList.add('tb-support');
}

async function sessionToken() {
  try {
    const client = await getSupabaseClient();
    const { data } = await client.auth.getSession();
    return data && data.session ? data.session.access_token : '';
  } catch { return ''; }
}

async function helpApi(path, body) {
  const token = await sessionToken();
  if (!token) throw new Error('Please sign in to Weaver first.');
  const res = await fetch(HELP_BASE + path, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (res.status === 429) { const d = await res.json().catch(() => ({})); return { capped: true, code: d.code }; }
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || ('HTTP ' + res.status));
  return d;
}

/* ---------- lookup UI ---------- */
function cardShell(headText) {
  const card = el('div', { class: 'sup-card' });
  card.appendChild(el('div', { class: 'sup-card-head', text: headText }));
  return card;
}
function showInfoCard(host, headText, bodyText, onBack) {
  host.innerHTML = '';
  const card = cardShell(headText);
  card.appendChild(el('p', { class: 'sup-p', text: bodyText }));
  host.appendChild(card);
  if (onBack) host.appendChild(el('button', { class: 'btn btn-sm', text: 'Try another question', onclick: onBack }));
}
function showReplyCard(host, answer, logId, question, onBack) {
  host.innerHTML = '';
  const card = cardShell('Support answer');
  for (const para of String(answer).split(/\n\n+/)) {
    if (!para.trim()) continue;
    const p = document.createElement('p');
    p.className = 'sup-p';
    p.innerHTML = inline(para.trim());
    card.appendChild(p);
  }
  const fb = el('div', { class: 'sup-feedback' }, [el('span', { text: 'Did this solve your issue?' })]);
  const yes = el('button', { class: 'btn btn-sm', text: 'Yes — solved' });
  const no = el('button', { class: 'btn btn-sm', text: 'No — send to our team' });
  yes.onclick = async () => {
    yes.disabled = true; no.disabled = true;
    try { await helpApi('/api/resolve', { logId }); } catch (e) { /* quiet */ }
    fb.innerHTML = '';
    fb.appendChild(el('span', { text: 'Thanks — glad that helped.' }));
  };
  no.onclick = async () => {
    yes.disabled = true; no.disabled = true;
    let ok = false;
    try { const d = await helpApi('/api/escalate', { logId, question, answer }); ok = !!d.filed; } catch (e) { ok = false; }
    fb.innerHTML = '';
    fb.appendChild(el('span', {
      text: ok
        ? 'Forwarded to the Weaver team. We\u2019ll get back to you as soon as we can.'
        : 'Could not forward automatically — please use the message form below.',
    }));
  };
  fb.appendChild(yes); fb.appendChild(no);
  card.appendChild(fb);
  host.appendChild(card);
  if (onBack) host.appendChild(el('button', { class: 'btn btn-sm', text: 'Try another question', onclick: onBack }));
}
async function runLookup(lookupInput, lookupBtn, replyHost, resetFn) {
  const question = (lookupInput.value || '').trim();
  if (!question) { toast('Describe your issue first.', 'info'); return; }
  lookupInput.disabled = true;
  lookupBtn.disabled = true;
  lookupBtn.textContent = 'Looking into it…';
  replyHost.innerHTML = '';
  try {
    const d = await helpApi('/api/answer', { question });
    if (d.capped) {
      const msg = d.code === 'cap_day'
        ? 'Support lookup limit reached (5 per hour, 12 per day on Free). Try again later, or send your request to the team below.'
        : 'Too many lookups in a short window. Try again in a few minutes, or send your request to the team below.';
      showInfoCard(replyHost, 'Support lookup', msg, resetFn);
      return;
    }
    if (d.escalated) {
      showInfoCard(replyHost, 'Support request', 'Forwarded to the Weaver team. We\u2019ll get back to you as soon as we can.', resetFn);
      return;
    }
    showReplyCard(replyHost, d.answer, d.logId, question, resetFn);
  } catch (e) {
    showInfoCard(replyHost, 'Support lookup', 'The lookup service is unreachable right now. Your request can still reach the team via the message form below.', resetFn);
  } finally {
    lookupInput.disabled = false;
    lookupBtn.disabled = false;
    lookupBtn.textContent = 'Find my answer';
  }
}

/* ---------- Your requests (in-app reply leg) ---------- */
async function loadMyTickets(host) {
  host.innerHTML = '';
  try {
    const token = await sessionToken();
    if (!token) { host.appendChild(el('p', { class: 'sup-p', text: 'Sign in to see your requests.' })); return; }
    const res = await fetch(HELP_BASE + '/api/tickets', { headers: { 'Authorization': 'Bearer ' + token } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    const tickets = d.tickets || [];
    if (!tickets.length) {
      host.appendChild(el('p', { class: 'sup-p', text: 'No requests yet. Your support requests and our replies will appear here.' }));
      return;
    }
    for (const t of tickets) {
      const card = el('div', { class: 'sup-card' });
      card.appendChild(el('div', {
        class: 'sup-card-head',
        text: (t.subject || '(no subject)') + ' · ' + (t.status === 'closed' ? 'closed' : 'open'),
      }));
      card.appendChild(el('p', { class: 'sup-p', text: t.body || '' }));
      for (const r of (t.replies || [])) {
        const rw = el('div', { class: 'sup-reply' });
        rw.appendChild(el('div', {
          class: 'sup-reply-head',
          text: (r.author === 'team' ? 'Weaver team' : 'You') + ' · ' + new Date(r.created_at).toLocaleString(),
        }));
        rw.appendChild(el('p', { class: 'sup-p', text: r.body || '' }));
        card.appendChild(rw);
      }
      host.appendChild(card);
    }
  } catch (e) {
    host.appendChild(el('p', { class: 'sup-p', text: 'Could not load your requests right now.' }));
  }
}

/* ---------- Support Center modal ---------- */
export function openSupport() {
  ensureStyle();
  const lookupInput = el('input', {
    class: 'input', type: 'text',
    placeholder: 'Describe your issue — e.g. \u201Csync badge says failed\u201D',
  });
  const lookupBtn = el('button', { class: 'btn btn-sm btn-primary', text: 'Find my answer' });
  const replyHost = el('div', {});
  const ticketsHost = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
  function resetLookup() {
    lookupInput.value = '';
    replyHost.innerHTML = '';
    lookupInput.focus();
  }
  lookupBtn.onclick = () => runLookup(lookupInput, lookupBtn, replyHost, resetLookup);
  lookupInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runLookup(lookupInput, lookupBtn, replyHost, resetLookup);
  });

  const subject = el('input', {
    class: 'input', type: 'text', maxlength: '120',
    placeholder: 'e.g. Cloud sync question',
  });
  const body = el('textarea', {
    class: 'textarea', rows: '5', maxlength: '4000',
    placeholder: 'Tell me what happened. Please do not include passwords or API keys.',
  });
  const hint = el('p', {
    class: 'sup-hint',
    text: 'Sent securely from your signed-in Weaver account. Replies appear under \u201CYour requests\u201D in this window. No manuscripts or files are attached.',
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
      subject.value = '';
      body.value = '';
      toast('Message sent. Thank you — I usually reply within one business day.', 'success');
      loadMyTickets(ticketsHost);
    } catch (e) {
      toast(e.message || 'Could not send.', 'danger');
      send.disabled = false;
      send.textContent = 'Send message';
    }
  });

  const m = modal({
    title: 'Support',
    size: 'lg',
    body: [
      el('div', { class: 'sup-section' }, [
        el('div', { class: 'sup-label', text: 'Instant lookup' }),
        el('div', { class: 'sup-lookup-row' }, [lookupInput, lookupBtn]),
        replyHost,
      ]),
      el('div', { class: 'sup-section' }, [
        el('div', { class: 'sup-label', text: 'Write to the team' }),
        hint,
        subject,
        body,
        send,
      ]),
      el('div', { class: 'sup-section' }, [
        el('div', { class: 'sup-label', text: 'Your requests' }),
        ticketsHost,
      ]),
    ],
    footer: [el('button', { class: 'btn', text: 'Close', onclick: () => m.close() })],
  });
  loadMyTickets(ticketsHost);
  lookupInput.focus();
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
