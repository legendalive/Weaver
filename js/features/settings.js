/* =========================================================
   Weaver — js/features/settings.js
   Step 20: Settings Modal.
   - AI Tab: 4-tier provider management (paste key, test, enable).
   - General Tab: QoL tweaks (paging, autosave, font scale).
   - Auto-saves to state/localStorage on every change.
   ========================================================= */

import { el, clear, modal, toast } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { getState, updateSettings } from '../core/state.js';
import groq from '../ai/providers/groq.js';
import openrouter from '../ai/providers/openrouter.js';
import gemini from '../ai/providers/gemini.js';
import mistral from '../ai/providers/mistral.js';

const PROVIDERS = [groq, openrouter, gemini, mistral];

const STYLE_ID = 'settings-style';
const CSS = `
.set-wrap{display:flex;gap:16px;min-height:380px;}
.set-rail{flex:none;width:180px;display:flex;flex-direction:column;gap:4px;
  border-right:1px solid var(--border);padding-right:12px;}
.set-rail-btn{display:flex;align-items:center;gap:8px;padding:8px 10px;border:none;
  border-radius:var(--radius-sm);background:transparent;color:var(--muted);
  font-size:.82rem;text-align:left;cursor:pointer;}
.set-rail-btn:hover{background:var(--surface-2);color:var(--text);}
.set-rail-btn.is-selected{background:var(--accent-soft);color:var(--accent);font-weight:600;}
.set-content{flex:1;min-width:0;display:flex;flex-direction:column;gap:16px;overflow-y:auto;padding-right:8px;}
.set-section{display:flex;flex-direction:column;gap:10px;}
.set-section h4{font-size:.78rem;font-weight:650;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:4px;}
.set-card{display:flex;flex-direction:column;gap:10px;padding:14px;
  border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-2);}
.set-card-head{display:flex;align-items:center;justify-content:space-between;}
.set-card-head h4{font-size:.95rem;font-weight:600;color:var(--text);margin:0;text-transform:none;letter-spacing:0;}
.set-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
.set-row .input{flex:1;min-width:150px;}
.set-field{display:flex;flex-direction:column;gap:6px;}
.set-field label{font-size:.78rem;color:var(--muted);}
.set-field .input, .set-field .select{max-width:220px;}
.set-toggle{display:flex;align-items:center;gap:8px;font-size:.82rem;cursor:pointer;user-select:none;}
.set-order{display:flex;gap:6px;flex-wrap:wrap;}
.set-hint{font-size:.74rem;color:var(--faint);margin-top:-4px;}
.set-scope-row{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-bottom:-8px;}
@media (max-width:640px){
  .set-wrap{flex-direction:column;}
  .set-rail{width:100%;flex-direction:row;border-right:none;border-bottom:1px solid var(--border);padding:0 0 10px;}
}
`;

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

/* ---------- AI Tab ---------- */
function renderAiTab(contentEl, settings) {
  clear(contentEl);

  contentEl.appendChild(el('div', { class: 'set-section' }, [
    el('h4', { text: 'Fallback Order' }),
    el('p', { class: 'set-hint', text: 'If a provider fails or rate-limits, the app silently tries the next one in this list.' }),
    el('div', { class: 'set-order' }, settings.ai.fallbackOrder.map(id => {
      const p = PROVIDERS.find(x => x.id === id);
      return el('span', { class: 'badge badge-accent', text: p.label });
    }))
  ]));

  for (const p of PROVIDERS) {
    const pCfg = settings.ai.providers[p.id];
    
    const input = el('input', { 
      class: 'input', 
      type: 'password', 
      placeholder: 'Paste API key...', 
      value: pCfg.key || '',
      oninput: (e) => {
        saveAndFlash(s => { s.ai.providers[p.id].key = e.target.value; });
        statusBadge.textContent = 'untested';
        statusBadge.className = 'badge';
      }
    });
    
    const statusBadge = el('span', { class: 'badge', text: pCfg.key ? 'saved' : 'untested' });
    
    const testBtn = el('button', { 
      class: 'btn btn-sm', 
      text: 'Test Connection',
      onclick: async () => {
        testBtn.disabled = true;
        testBtn.textContent = 'Testing...';
        const res = await p.testKey(input.value);
        testBtn.disabled = false;
        testBtn.textContent = 'Test Connection';
        if (res.ok) {
          statusBadge.textContent = 'connected';
          statusBadge.className = 'badge badge-success';
          toast(`${p.label} connected successfully.`, 'success');
        } else {
          statusBadge.textContent = 'failed';
          statusBadge.className = 'badge badge-danger';
          toast(`${p.label} failed: ${res.message}`, 'danger');
        }
      }
    });
    
    const toggleLabel = el('label', { class: 'set-toggle' }, [
      el('input', { 
        type: 'checkbox', 
        checked: pCfg.enabled,
        onchange: (e) => saveAndFlash(s => { s.ai.providers[p.id].enabled = e.target.checked; })
      }),
      el('span', { text: 'Enable for fallback chain' })
    ]);
    
    contentEl.appendChild(el('div', { class: 'set-card' }, [
      el('div', { class: 'set-card-head' }, [
        el('h4', { text: p.label }),
        el('a', { href: p.keyUrl, target: '_blank', class: 'btn btn-ghost btn-sm', title: 'Get API Key' }, [icon('key', 'icon-sm'), 'Get Key']),
      ]),
      el('div', { class: 'set-row' }, [input, testBtn]),
      el('div', { class: 'set-row' }, [statusBadge, toggleLabel])
    ]));
  }
}

/* ---------- General Tab ---------- */
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
          oninput: (e) => saveAndFlash(s => { s.general.sentencesPerPage = Math.max(5, parseInt(e.target.value) || 15); })
        })
      ]),
      el('div', { class: 'set-field' }, [
        el('label', { text: 'Autosave delay (milliseconds)' }),
        el('input', { 
          type: 'number', class: 'input', min: '500', max: '5000', step: '500', value: String(g.autosaveInterval),
          oninput: (e) => saveAndFlash(s => { s.general.autosaveInterval = Math.max(500, parseInt(e.target.value) || 3000); })
        })
      ])
    ]),
    el('div', { class: 'set-section' }, [
      el('h4', { text: 'Aesthetics' }),
      el('div', { class: 'set-field' }, [
        el('label', { text: 'Font Scale' }),
        el('select', { 
          class: 'select',
          onchange: (e) => {
            saveAndFlash(s => { s.general.fontScale = parseFloat(e.target.value); });
            document.documentElement.style.setProperty('--font-scale', e.target.value);
          }
        }, [
          el('option', { value: '0.9', text: 'Small (0.9x)', selected: g.fontScale === 0.9 }),
          el('option', { value: '1.0', text: 'Default (1.0x)', selected: g.fontScale === 1.0 || !g.fontScale }),
          el('option', { value: '1.1', text: 'Large (1.1x)', selected: g.fontScale === 1.1 }),
          el('option', { value: '1.2', text: 'Extra Large (1.2x)', selected: g.fontScale === 1.2 }),
        ])
      ])
    ])
  );
}

/* ---------- Entry Point ---------- */
export function openSettings() {
  ensureStyle();
  const state = getState();
  let activeTab = 'ai';
  
  const railEl = el('div', { class: 'set-rail' });
  const contentEl = el('div', { class: 'set-content' });
  savedBadge = el('span', { class: 'badge badge-success', text: 'saved', hidden: true });
  
  function renderRail() {
    clear(railEl);
    const tabs = [
      { id: 'ai', label: 'AI Providers', icon: 'sparkles' },
      { id: 'general', label: 'General', icon: 'gear' }
    ];
    for (const tab of tabs) {
      railEl.appendChild(el('button', {
        class: 'set-rail-btn' + (activeTab === tab.id ? ' is-selected' : ''),
        onclick: () => { activeTab = tab.id; renderRail(); renderContent(); }
      }, [icon(tab.icon, 'icon-sm'), el('span', { text: tab.label })]));
    }
  }
  
  function renderContent() {
    if (activeTab === 'ai') renderAiTab(contentEl, state.settings);
    else renderGeneralTab(contentEl, state.settings);
  }
  
  const m = modal({
    title: 'Settings',
    size: 'lg',
    body: [
      el('div', { class: 'set-scope-row' }, [savedBadge]),
      el('div', { class: 'set-wrap' }, [railEl, contentEl])
    ],
    footer: [el('button', { class: 'btn btn-primary', text: 'Done', onclick: () => m.close() })]
  });
  
  renderRail();
  renderContent();
}
