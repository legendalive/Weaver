/* =========================================================
Weaver — js/features/guide.js
V3.9: Guide powered by docs/HELP.md + Support lookup.
Browse (topic rail + search) and a one-shot Support lookup
that resolves issues silently from the knowledge base. The
lookup never mentions docs/guide — it answers as the support
team. Unresolvable requests forward to the Messages inbox.
========================================================= */
import { el, clear, modal } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { openSupport } from './support.js';

const STYLE_ID = 'guide-style';
const DOC_V = '2026-11-01a';
const HELP_BASE = 'https://hiqmvhkwuvvgalqxxtbc.functions.supabase.co/help';
const CSS = `.gd-wrap{display:flex;gap:16px;min-height:420px;} .gd-rail{flex:none;width:200px;display:flex;flex-direction:column;gap:4px;border-right:1px solid var(--border);padding-right:10px;overflow-y:auto;} .gd-rail-btn{display:flex;align-items:center;gap:8px;padding:8px 10px;border:none;border-radius:var(--radius-sm);background:transparent;color:var(--muted);font-size:.82rem;text-align:left;cursor:pointer;} .gd-rail-btn:hover{background:var(--surface-2);color:var(--text);} .gd-rail-btn.is-selected{background:var(--accent-soft);color:var(--accent);font-weight:600;} .gd-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:10px;} .gd-searchrow{display:flex;gap:8px;align-items:center;} .gd-searchrow .input{flex:1;} .gd-content{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding-right:6px;} .gd-h3{font-size:.9rem;font-weight:650;color:var(--accent);margin-top:6px;} .gd-p{font-size:.85rem;line-height:1.65;color:var(--text);} .gd-li{font-size:.85rem;line-height:1.6;padding-left:14px;position:relative;} .gd-li:before{content:'•';position:absolute;left:2px;color:var(--accent);} .gd-quote{font-size:.82rem;line-height:1.6;color:var(--muted);border-left:3px solid var(--accent);padding:6px 10px;background:var(--surface-2);border-radius:0 8px 8px 0;} .gd-table{width:100%;border-collapse:collapse;font-size:.8rem;} .gd-table td,.gd-table th{border:1px solid var(--border);padding:6px 8px;text-align:left;vertical-align:top;} .gd-table th{background:var(--surface-2);color:var(--muted);font-weight:650;} .gd-code{font-family:var(--font-mono);font-size:.8em;background:var(--surface-2);border:1px solid var(--border);border-radius:4px;padding:1px 5px;} .gd-topic-label{font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin-top:8px;} .gd-lookup{display:flex;gap:8px;align-items:center;padding-top:10px;border-top:1px solid var(--border);flex:none;flex-wrap:wrap;} .gd-lookup-label{font-size:.7rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);flex:none;} .gd-lookup .input{flex:1;min-width:160px;} .gd-card{border:1px solid var(--border-strong);border-radius:12px;padding:12px;background:var(--surface-2);display:flex;flex-direction:column;gap:10px;} .gd-card-head{font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);font-weight:650;} .gd-feedback{display:flex;gap:8px;align-items:center;flex-wrap:wrap;} .gd-feedback span{font-size:.78rem;color:var(--muted);} @media (max-width:640px){ .gd-wrap{flex-direction:column;min-height:0;} .gd-rail{width:100%;flex-direction:row;flex-wrap:wrap;border-right:none;border-bottom:1px solid var(--border);padding:0 0 10px;max-height:110px;} }`;

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
  out = out.replace(/`([^`]+)`/g, '<span class="gd-code">$1</span>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--accent)">$1</a>');
  return out;
}
function rich(cls, htmlStr) {
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = htmlStr;
  return d;
}

/* ---------- markdown-lite ---------- */
function renderLines(lines, host) {
  let listBuf = [];
  let tableBuf = [];
  const flushList = () => { for (const t of listBuf) host.appendChild(rich('gd-li', inline(t))); listBuf = []; };
  const flushTable = () => {
    const rows = tableBuf.filter((r) => !/^\|?[\s:|-]+\|?$/.test(r));
    tableBuf = [];
    if (!rows.length) return;
    const table = document.createElement('table');
    table.className = 'gd-table';
    rows.forEach((r, idx) => {
      const cells = r.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      const tr = document.createElement('tr');
      for (const c of cells) {
        const cell = document.createElement(idx === 0 ? 'th' : 'td');
        cell.innerHTML = inline(c);
        tr.appendChild(cell);
      }
      table.appendChild(tr);
    });
    host.appendChild(table);
  };
  for (const line of lines) {
    const t = line.trim();
    if (!t) { flushList(); flushTable(); continue; }
    if (t.startsWith('|')) { flushList(); tableBuf.push(t); continue; }
    if (tableBuf.length) flushTable();
    if (t === '---') { flushList(); continue; }
    if (t.startsWith('- ') || t.startsWith('* ')) { listBuf.push(t.slice(2)); continue; }
    if (/^\d+\.\s/.test(t)) { listBuf.push(t.replace(/^\d+\.\s/, '')); continue; }
    flushList();
    if (t.startsWith('> ')) { host.appendChild(rich('gd-quote', inline(t.slice(2)))); continue; }
    host.appendChild(rich('gd-p', inline(t)));
  }
  flushList();
  flushTable();
}

/* ---------- parser + fetch ---------- */
function parseDoc(text) {
  const topics = [];
  let cur = null;
  let sub = null;
  for (const raw of String(text).replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (line.startsWith('## ')) { cur = { title: line.slice(3).trim(), intro: [], subs: [] }; topics.push(cur); sub = null; continue; }
    if (line.startsWith('### ')) {
      if (!cur) { cur = { title: 'General', intro: [], subs: [] }; topics.push(cur); }
      sub = { title: line.slice(4).trim(), lines: [] };
      cur.subs.push(sub); continue;
    }
    if (line.startsWith('# ') || !cur) continue;
    if (sub) sub.lines.push(line); else cur.intro.push(line);
  }
  return topics;
}
let DOC = null;
let DOC_LOADING = false;
let waiters = [];
function loadDoc() {
  if (DOC) return Promise.resolve(DOC);
  if (DOC_LOADING) return new Promise((r) => waiters.push(r));
  DOC_LOADING = true;
  const url = new URL('docs/HELP.md', document.baseURI).href + '?v=' + DOC_V;
  return fetch(url, { cache: 'no-store' })
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
    .then((text) => { DOC = parseDoc(text); DOC_LOADING = false; waiters.splice(0).forEach((f) => f(DOC)); return DOC; })
    .catch(() => { DOC_LOADING = false; waiters.splice(0).forEach((f) => f(null)); return null; });
}

/* ---------- app session token ---------- */
function appToken() {
  try {
    for (const store of [sessionStorage, localStorage]) {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (!k || k.indexOf('sb-') !== 0) continue;
        try {
          const v = JSON.parse(store.getItem(k) || 'null');
          const t = v && (v.access_token || (v.session && v.session.access_token));
          if (t) return t;
        } catch (e) { /* skip */ }
      }
    }
  } catch (e) { /* skip */ }
  return '';
}
async function helpApi(path, body) {
  const res = await fetch(HELP_BASE + path, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + appToken(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (res.status === 429) { const d = await res.json().catch(() => ({})); return { capped: true, code: d.code }; }
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || ('HTTP ' + res.status));
  return d;
}

/* ---------- UI state ---------- */
let m = null;
let railEl = null;
let contentEl = null;
let searchEl = null;
let lookupInput = null;
let lookupBtn = null;
let topics = [];
let active = 0;
let lastLookup = null;

function renderRail() {
  clear(railEl);
  topics.forEach((t, i) => {
    railEl.appendChild(el('button', {
      class: 'gd-rail-btn' + (i === active ? ' is-selected' : ''),
      onclick: () => { active = i; if (searchEl) searchEl.value = ''; renderRail(); renderMain(); },
    }, [el('span', { text: t.title })]));
  });
}
function renderSearch(q) {
  let shown = 0;
  for (const t of topics) {
    const introHit = t.intro.some((l) => l.toLowerCase().includes(q));
    const subs = t.subs.filter((s) => s.title.toLowerCase().includes(q) || s.lines.some((l) => l.toLowerCase().includes(q)));
    if (!introHit && !subs.length) continue;
    contentEl.appendChild(rich('gd-topic-label', esc(t.title)));
    if (introHit) renderLines(t.intro, contentEl);
    for (const s of subs) {
      contentEl.appendChild(rich('gd-h3', esc(s.title)));
      renderLines(s.lines, contentEl);
      shown++;
      if (shown > 30) return;
    }
  }
  if (!shown) contentEl.appendChild(rich('gd-p', 'No matches in the guide. Try another phrase, or use Support lookup below.'));
}
function renderMain() {
  if (!contentEl) return;
  clear(contentEl);
  if (!topics.length) { renderError(); return; }
  const q = (searchEl && searchEl.value || '').trim().toLowerCase();
  if (q) { renderSearch(q); return; }
  const t = topics[active] || topics[0];
  if (t.intro.length) renderLines(t.intro, contentEl);
  for (const s of t.subs) {
    contentEl.appendChild(rich('gd-h3', esc(s.title)));
    renderLines(s.lines, contentEl);
  }
}
function renderError() {
  clear(contentEl);
  contentEl.appendChild(rich('gd-p', 'The help document could not be loaded (offline, or docs/HELP.md is missing from the site).'));
  const retry = el('button', { class: 'btn btn-sm', text: 'Retry' });
  retry.onclick = () => {
    DOC = null;
    clear(contentEl);
    contentEl.appendChild(rich('gd-p', 'Loading help…'));
    loadDoc().then((doc) => { if (doc) { topics = doc; renderRail(); renderMain(); } else renderError(); });
  };
  contentEl.appendChild(retry);
}

/* ---------- Support lookup ---------- */
function cardShell(headText) {
  const card = el('div', { class: 'gd-card' });
  card.appendChild(rich('gd-card-head', esc(headText)));
  return card;
}
function showReplyCard(answer, logId, question) {
  clear(contentEl);
  const card = cardShell('Support answer');
  for (const para of String(answer).split(/\n\n+/)) {
    if (para.trim()) card.appendChild(rich('gd-p', inline(para.trim())));
  }
  const fb = el('div', { class: 'gd-feedback' }, [el('span', { text: 'Did this solve your issue?' })]);
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
        : 'Could not forward automatically — please use Contact support below.',
    }));
  };
  fb.appendChild(yes); fb.appendChild(no);
  card.appendChild(fb);
  contentEl.appendChild(card);
  contentEl.appendChild(el('button', { class: 'btn btn-sm', text: 'Back to guide', onclick: () => renderMain() }));
}
function showInfoCard(headText, bodyText) {
  clear(contentEl);
  const card = cardShell(headText);
  card.appendChild(rich('gd-p', esc(bodyText)));
  contentEl.appendChild(card);
  contentEl.appendChild(el('button', { class: 'btn btn-sm', text: 'Back to guide', onclick: () => renderMain() }));
}
async function runLookup() {
  const question = (lookupInput && lookupInput.value || '').trim();
  if (!question) return;
  if (lookupBtn) { lookupBtn.disabled = true; lookupBtn.textContent = 'Looking into it…'; }
  try {
    const d = await helpApi('/api/answer', { question });
    if (d.capped) {
      const msg = d.code === 'cap_day'
        ? 'Support lookup limit reached (5 per hour, 12 per day on Free). Try again later, or send your request to the team.'
        : (d.code === 'cap_hour' ? 'Too many lookups in a short window. Try again in a few minutes, or send your request to the team.' : 'Limit reached — please send your request to the team.');
      showInfoCard('Support lookup', msg);
      return;
    }
    if (d.escalated) {
      showInfoCard('Support request', 'Forwarded to the Weaver team. We\u2019ll get back to you as soon as we can.');
      return;
    }
    lastLookup = { logId: d.logId, question, answer: d.answer };
    showReplyCard(d.answer, d.logId, question);
  } catch (e) {
    showInfoCard('Support lookup', 'The lookup service is unreachable right now. Your request can still reach the team via Contact support.');
  } finally {
    if (lookupBtn) { lookupBtn.disabled = false; lookupBtn.textContent = 'Find my answer'; }
  }
}

/* ---------- Entry ---------- */
export function openGuide() {
  ensureStyle();
  topics = [];
  active = 0;
  lastLookup = null;
  m = modal({
    title: 'Weaver Guide',
    size: 'lg',
    body: [],
    footer: [
      el('button', { class: 'btn', onclick: () => { m.close(); openSupport(); } }, [icon('send', 'icon-sm'), 'Contact support']),
      el('button', { class: 'btn btn-primary', text: 'Done', onclick: () => m.close() }),
    ],
  });
  searchEl = el('input', { class: 'input', type: 'search', placeholder: 'Search the guide…' });
  searchEl.addEventListener('input', () => renderMain());
  railEl = el('div', { class: 'gd-rail' });
  contentEl = el('div', { class: 'gd-content' });
  lookupInput = el('input', { class: 'input', type: 'text', placeholder: 'Describe your issue — e.g. \u201Csync badge says failed\u201D' });
  lookupInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') runLookup(); });
  lookupBtn = el('button', { class: 'btn btn-sm btn-primary', text: 'Find my answer', onclick: () => runLookup() });
  m.body.append(
    el('div', { class: 'gd-wrap' }, [
      railEl,
      el('div', { class: 'gd-main' }, [
        el('div', { class: 'gd-searchrow' }, [icon('book', 'icon-sm'), searchEl]),
        contentEl,
        el('div', { class: 'gd-lookup' }, [
          rich('gd-lookup-label', 'Support lookup'),
          lookupInput,
          lookupBtn,
        ]),
      ]),
    ])
  );
  contentEl.appendChild(rich('gd-p', 'Loading help…'));
  loadDoc().then((doc) => {
    if (!contentEl) return;
    if (!doc) { renderError(); return; }
    topics = doc;
    renderRail();
    renderMain();
  });
}
