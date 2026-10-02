/* =========================================================
   Weaver — js/utils/dom.js
   Step 3: DOM construction & UI primitives used by every module.
   Exports: el, clear, qs, qsa, delegate, escapeHtml,
            toast, modal, confirmDialog
   ========================================================= */

import { icon } from './icons.js';

/* ---------- Element factory ----------
   el('button', { class: 'btn btn-primary', text: 'Save', onclick: fn }, [child, ...])
   Special attr keys: class, text, html, dataset{}, style{}, on* handlers.
   Anything else becomes a plain attribute; `true` sets a bare attribute. */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') {
      String(value).split(/\s+/).filter(Boolean).forEach((c) => node.classList.add(c));
    } else if (key === 'text') {
      node.textContent = value;
    } else if (key === 'html') {
      node.innerHTML = value;
    } else if (key === 'dataset') {
      Object.assign(node.dataset, value);
    } else if (key === 'style') {
      for (const [prop, val] of Object.entries(value)) node.style.setProperty(prop, val);
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, value);
    }
  }
  appendChildren(node, children);
  return node;
}

function appendChildren(node, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) { appendChildren(node, child); continue; }
    node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function qs(selector, root = document) { return root.querySelector(selector); }
export function qsa(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }

/* Event delegation — handler(event, matchedTarget) */
export function delegate(root, type, selector, handler) {
  root.addEventListener(type, (event) => {
    const match = event.target.closest(selector);
    if (match && root.contains(match)) handler(event, match);
  });
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/* ---------- Toasts ---------- */
const TOAST_ICONS = { success: 'check', danger: 'alert', info: 'info' };
let toastContainer = null;

export function toast(message, type = 'info', timeout = 3200) {
  if (!toastContainer) {
    toastContainer = el('div', { class: 'toast-container' });
    document.body.appendChild(toastContainer);
  }
  const node = el('div', { class: `toast toast-${type}` }, [
    icon(TOAST_ICONS[type] || 'info'),
    el('span', { text: message }),
  ]);
  toastContainer.appendChild(node);
  setTimeout(() => node.remove(), timeout);
  return node;
}

/* ---------- Modal ----------
   Returns { root, body, footer, backdrop, close } */
export function modal(options = {}) {
  const {
    title = '', body = null, footer = null,
    size = '', closeOnBackdrop = true, onClose = null,
  } = options;

  const backdrop = el('div', { class: 'modal-backdrop' });
  const box = el('div', { class: size === 'lg' ? 'modal modal-lg' : 'modal' });

  const bodyNode = el('div', { class: 'modal-body' });
  if (body) appendChildren(bodyNode, body);

  const footerNode = el('div', { class: 'modal-footer' });
  if (footer) appendChildren(footerNode, footer);

  function onKey(event) { if (event.key === 'Escape') close(); }
  function close() {
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    if (typeof onClose === 'function') onClose();
  }

  const header = el('div', { class: 'modal-header' }, [
    el('h2', { class: 'modal-title', text: title }),
    el('button', {
      class: 'btn btn-ghost btn-icon btn-sm',
      'aria-label': 'Close',
      onclick: () => close(),
    }, [icon('x')]),
  ]);

  box.append(header, bodyNode);
  if (footer) box.append(footerNode);
  backdrop.appendChild(box);

  backdrop.addEventListener('mousedown', (event) => {
    if (closeOnBackdrop && event.target === backdrop) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(backdrop);

  return { root: box, body: bodyNode, footer: footerNode, backdrop, close };
}

/* Promise-based confirm — resolves true on confirm, false on cancel/Esc/backdrop */
export function confirmDialog(options = {}) {
  const {
    title = 'Are you sure?', message = '',
    confirmLabel = 'Confirm', danger = false,
  } = options;
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => { settled = true; resolve(value); };
    const m = modal({
      title,
      body: el('p', {
        text: message,
        style: { color: 'var(--muted)', 'font-size': '.88rem', 'line-height': '1.6' },
      }),
      footer: [
        el('button', { class: 'btn', text: 'Cancel', onclick: () => { settle(false); m.close(); } }),
        el('button', {
          class: danger ? 'btn btn-danger' : 'btn btn-primary',
          text: confirmLabel,
          onclick: () => { settle(true); m.close(); },
        }),
      ],
      onClose: () => { if (!settled) resolve(false); },
    });
  });
}
