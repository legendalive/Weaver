/* =========================================================
Weaver — js/features/settings.js
v2 Stage 6.1-final: Settings Modal.
V3.2b: Added Pro/Free badge and Upgrade button.
V3.4b: AI Providers tab removed — AI is served centrally by the
Weaver proxy for Pro users; no user-managed API keys anymore.
========================================================= */
import { el, clear, modal, toast, confirmDialog } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { getState, updateSettings } from '../core/state.js';
import {
  syncNow, getCloudUserEmail, signOutAndReload,
  copyAllToPuter, restoreFromPuter,
} from './cloud.js';
import { puterSignedIn, connectPuter, disconnectPuter } from './puter-mirror.js';
import { exportProject } from './export.js';
import { isPro, onEntitlementChange } from '../core/entitlements.js';

const STYLE_ID = 'settings-style';
const CSS = `.set-wrap{display:flex;gap:16px;min-height:380px;} .set-rail{flex:none;width:190px;display:flex;flex-direction:column;gap:4px;border-right:1px solid var(--border);padding-right:12px;} .set-rail-btn{display:flex;align-items:center;gap:8px;padding:8px 10px;border:none;border-radius:var(--radius-sm);background:transparent;color:var(--muted);font-size:.82rem;text-align:left;cursor:pointer;} .set-rail-btn:hover{background:var(--surface-2);color:var(--text);} .set-rail-btn.is-selected{background:var(--accent-soft);color:var(--accent);font-weight:600;} .set-content{flex:1;min-width:0;display:flex;flex-direction:column;gap:16px;overflow-y:auto;padding-right:8px;} .set-section{display:flex;flex-direction:column;gap:10px;} .set-section h4{font-size:.78rem;font-weight:650;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:4px;} .set-card{display:flex;flex-direction:column;gap:10px;padding:14px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-2);} .set-card-head{display:flex;align-items:center;justify-content:space-between;} .set-card-head h4{font-size:.95rem;font-weight:600;color:var(--text);margin:0;text-transform:none;letter-spacing:0;} .set-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;} .set-row .input{flex:1;min-width:150px;} .set-field{display:flex;flex-direction:column;gap:6px;} .set-field label{font-size:.78rem;color:var(--muted);} .set-field .input, .set-field .select{max-width:220px;} .set-toggle{display:flex;align-items:center;gap:8px;font-size:.82rem;cursor:pointer;user-select:none;} .set-order{display:flex;gap:6px;flex-wrap:wrap;} .set-hint{font-size:.74rem;color:var(--faint);margin-top:-4px;} .set-scope-row{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-bottom:-8px;} .set-range-row{display:flex;align-items:center;gap:10px;} .set-range-row input[type="range"]{flex:1;max-width:220px;accent-color:var(--accent);} @media (max-width:640px){ .set-wrap{flex-direction:column;} .set-rail{width:100%;flex-direction:row;border-right:none;border-bottom:1px solid var(--border);padding:0 0 10px;} }`;

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
}

let savedBadge = null;
function saveAndFlash(mutator) {
  updateSettings(mutator);
  if (savedBadge) {
    savedBadge.hidden = false;
    setTimeout(() => { if (savedBadge) savedBadge.hidden = true; }, 1200);
  }
}

/* ---------- Account ---------- */
function accountSection() {
  const emailBadge = el('span', { class: 'badge', text: 'checking…' });
  getCloudUserEmail().then((email) => {
    emailBadge.textContent = email || 'signed in';
    emailBadge.className = 'badge badge-success';
  });
  const proBadge = el('span', {
    class: 'badge ' + (isPro() ? 'badge-accent' : ''),
    text: isPro() ? 'Pro' : 'Free'
  });
  const upgradeBtn = el('a', {
    class: 'btn btn-sm btn-primary',
    href: 'https://mbenson62.gumroad.com/l/cqxxpt',
    target: '_blank',
    hidden: isPro()
  }, [icon('sparkles', 'icon-sm'), el('span', { text: 'Upgrade to Pro' })]);
  onEntitlementChange(() => {
    proBadge.className = 'badge ' + (isPro() ? 'badge-accent' : '');
    proBadge.textContent = isPro() ? 'Pro' : 'Free';
    upgradeBtn.hidden = isPro();
  });
  return el('div', { class: 'set-section' }, [
    el('h4', { text: 'Account' }),
    el('div', { class: 'set-card' }, [
      el('div', { class: 'set-row' }, [
        emailBadge,
        proBadge,
        upgradeBtn,
        el('button', {
          class: 'btn btn-sm btn-danger',
          onclick: async () => {
            const ok = await confirmDialog({
              title: 'Sign out',
              message: 'You will be signed out of Weaver. Your projects stay safe in this browser and in your private cloud vault.',
              confirmLabel: 'Sign out',
              danger: true,
            });
            if (!ok) return;
            await signOutAndReload();
          },
        }, [icon('x', 'icon-sm'), el('span', { text: 'Sign out' })]),
      ]),
    ]),
  ]);
}

/* ---------- Backup & Restore ---------- */
function backupRestoreSection() {
  return el('div', { class: 'set-section' }, [
    el('h4', { text: 'Backup & Restore' }),
    el('p', { class: 'set-hint', text: 'Your work saves to your private cloud automatically as you write (compressed, ~3–5× more room). Use these to back up, export, or restore manually.' }),
    el('div', { class: 'set-row' }, [
      el('button', { class: 'btn btn-sm', text: 'Backup to cloud', onclick: () => syncNow() }),
      el('button', { class: 'btn btn-sm', text: 'Export', onclick: () => exportProject() }),
      el('button', { class: 'btn btn-sm', text: 'Restore', onclick: () => syncNow() }),
    ]),
  ]);
}

/* ---------- Optional Puter overflow ---------- */
function overflowSection(rerender) {
  const status = el('span', {
    class: 'badge' + (puterSignedIn() ? ' badge-success' : ''),
    text: puterSignedIn() ? 'connected' : 'not connected',
  });
  const connectBtn = el('button', {
    class: 'btn btn-sm',
    text: puterSignedIn() ? 'Disconnect' : 'Connect Puter',
    onclick: async () => {
      connectBtn.disabled = true;
      try {
        if (puterSignedIn()) {
          await disconnectPuter();
          toast('Overflow storage disconnected.', 'success');
        } else {
          await connectPuter();
          toast('Overflow storage connected.', 'success');
        }
      } catch (e) {
        toast('Could not reach Puter: ' + e.message, 'danger');
      }
      connectBtn.disabled = false;
      rerender();
    },
  });
  return el('div', { class: 'set-section' }, [
    el('h4', { text: 'Overflow Storage (Puter) — optional' }),
    el('p', { class: 'set-hint', text: 'Optional — Weaver works fully without it. Puter is used automatically only if the primary vault is full or unreachable; each user\'s own free Puter account holds their overflow at no additional cost.' }),
    el('div', { class: 'set-card' }, [
      el('div', { class: 'set-row' }, [status, connectBtn]),
      el('div', { class: 'set-row' }, [
        el('button', {
          class: 'btn btn-sm', text: 'Copy all to Puter',
          onclick: async () => {
            try {
              const n = await copyAllToPuter();
              toast(`Copied ${n} project(s) to Puter overflow.`, 'success');
            } catch (e) {
              toast('Copy failed: ' + e.message, 'danger');
            }
          },
        }),
        el('button', {
          class: 'btn btn-sm', text: 'Restore from Puter',
          onclick: async () => {
            const ok = await confirmDialog({
              title: 'Restore from Puter',
              message: 'This pulls every project stored in your Puter overflow into this browser, overwriting local copies with the same ID. Continue?',
              confirmLabel: 'Restore',
              danger: true,
            });
            if (!ok) return;
            try {
              const n = await restoreFromPuter();
              toast(`Restored ${n} project(s) from Puter. Reloading…`, 'success');
              setTimeout(() => location.reload(), 900);
            } catch (e) {
              toast('Restore failed: ' + e.message, 'danger');
            }
          },
        }),
      ]),
    ]),
  ]);
}

/* ---------- Data & Storage tab ---------- */
function renderDataTab(contentEl, rerender) {
  clear(contentEl);
  contentEl.append(accountSection(), backupRestoreSection(), overflowSection(rerender));
}

/* ---------- General tab ---------- */
function renderGeneralTab(contentEl, settings) {
  clear(contentEl);
  const g = settings.general;
  contentEl.append(
    el('div', { class: 'set-section' }, [
      el('h4', { text: 'Editor Behavior' }),
      el('div', { class: 'set-field' }, [
        el('label', { text: 'Sentences per page (Manuscript window)' }),
        el('input', {
          type: 'number', class: 'input', min: '5', max: '50', value: String(g.sentencesPerPage),
          oninput: (e) => saveAndFlash(s => { s.general.sentencesPerPage = Math.max(5, parseInt(e.target.value) || 15); }),
        }),
      ]),
      el('div', { class: 'set-field' }, [
        el('label', { text: 'Autosave delay (milliseconds)' }),
        el('input', {
          type: 'number', class: 'input', min: '500', max: '5000', step: '500', value: String(g.autosaveInterval),
          oninput: (e) => saveAndFlash(s => { s.general.autosaveInterval = Math.max(500, parseInt(e.target.value) || 3000); }),
        }),
      ]),
      el('label', { class: 'set-toggle' }, [
        el('input', { type: 'checkbox', checked: Boolean(g.acceptMovesText), onchange: (e) => saveAndFlash(s => { s.general.acceptMovesText = e.target.checked; }) }),
        el('span', { text: 'Accept-as-is MOVES text (cuts it from Manuscript) instead of copying' }),
      ]),
    ]),
    el('div', { class: 'set-section' }, [
      el('h4', { text: 'Quick Prompts (Scribe shortcuts)' }),
      el('p', { class: 'set-hint', text: 'Up to three one-tap prompts shown with the Scribe input. Leave blank to hide.' }),
      ...[0, 1, 2].map((i) => el('input', {
        class: 'input', placeholder: `Quick prompt ${i + 1}…`,
        value: (g.quickPrompts && g.quickPrompts[i]) || '',
        oninput: (e) => saveAndFlash((s) => {
          if (!Array.isArray(s.general.quickPrompts)) s.general.quickPrompts = ['', '', ''];
          s.general.quickPrompts[i] = e.target.value;
        }),
      })),
    ]),
    el('div', { class: 'set-section' }, [
      el('h4', { text: 'Aesthetics' }),
      el('div', { class: 'set-field' }, [
        el('label', { text: 'Font Scale' }),
        el('select', {
          class: 'select',
          onchange: (e) => { saveAndFlash(s => { s.general.fontScale = parseFloat(e.target.value); }); document.documentElement.style.setProperty('--font-scale', e.target.value); },
        }, [
          el('option', { value: '0.9', text: 'Small (0.9x)', selected: g.fontScale === 0.9 }),
          el('option', { value: '1.0', text: 'Default (1.0x)', selected: g.fontScale === 1.0 || !g.fontScale }),
          el('option', { value: '1.1', text: 'Large (1.1x)', selected: g.fontScale === 1.1 }),
          el('option', { value: '1.2', text: 'Extra Large (1.2x)', selected: g.fontScale === 1.2 }),
        ]),
      ]),
    ]),
  );
}

/* ---------- Entry Point (2 tabs) ---------- */
export function openSettings() {
  ensureStyle();
  const state = getState();
  let activeTab = 'data';
  const railEl = el('div', { class: 'set-rail' });
  const contentEl = el('div', { class: 'set-content' });
  savedBadge = el('span', { class: 'badge badge-success', text: 'saved', hidden: true });

  function renderRail() {
    clear(railEl);
    const tabs = [
      { id: 'data', label: 'Data & Storage', icon: 'folder' },
      { id: 'general', label: 'General', icon: 'gear' },
    ];
    for (const tab of tabs) {
      railEl.appendChild(el('button', {
        class: 'set-rail-btn' + (activeTab === tab.id ? ' is-selected' : ''),
        onclick: () => { activeTab = tab.id; renderRail(); renderContent(); },
      }, [icon(tab.icon, 'icon-sm'), el('span', { text: tab.label })]));
    }
  }
  function renderContent() {
    if (activeTab === 'data') renderDataTab(contentEl, renderContent);
    else renderGeneralTab(contentEl, state.settings);
  }
  const m = modal({
    title: 'Settings',
    size: 'lg',
    body: [
      el('div', { class: 'set-scope-row' }, [savedBadge]),
      el('div', { class: 'set-wrap' }, [railEl, contentEl]),
    ],
    footer: [el('button', { class: 'btn btn-primary', text: 'Done', onclick: () => m.close() })],
  });
  renderRail();
  renderContent();
}
