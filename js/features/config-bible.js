/* =========================================================
   Weaver — js/features/config-bible.js
   Step 15: Config (Project Bible) editor.
   - Seven sections: characters, settings & places, plot arcs,
     world rules & physics, item catalog, General Prose,
     General Instructions to the AI.
   - Series-aware: series books edit the SHARED series bible;
     standalone books edit their own (storage.getEffectiveConfig).
   - Debounced autosave + flush on close. Self-styled module.
   ========================================================= */

import { el, clear, modal, confirmDialog } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { getState } from '../core/state.js';
import { getEffectiveConfig, saveEffectiveConfig } from '../core/storage.js';

const STYLE_ID = 'config-bible-style';
const CSS = `
.cb-wrap{display:flex;gap:16px;min-height:380px;}
.cb-rail{flex:none;width:196px;display:flex;flex-direction:column;gap:4px;
  border-right:1px solid var(--border);padding-right:12px;}
.cb-rail-btn{display:flex;align-items:center;gap:8px;padding:8px 10px;border:none;
  border-radius:var(--radius-sm);background:transparent;color:var(--muted);
  font-size:.82rem;text-align:left;cursor:pointer;}
.cb-rail-btn:hover{background:var(--surface-2);color:var(--text);}
.cb-rail-btn.is-selected{background:var(--accent-soft);color:var(--accent);font-weight:600;}
.cb-rail-btn .icon{flex:none;}
.cb-rail-btn .count{margin-left:auto;font-family:var(--font-mono);font-size:.68rem;color:var(--faint);}
.cb-content{flex:1;min-width:0;display:flex;flex-direction:column;gap:12px;}
.cb-head{display:flex;align-items:center;justify-content:space-between;gap:10px;}
.cb-head h3{font-size:.95rem;font-weight:650;}
.cb-card{display:flex;flex-direction:column;gap:8px;padding:12px;
  border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-2);}
.cb-card-head{display:flex;gap:8px;align-items:center;}
.cb-card-head .input{flex:1;}
.cb-scope-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.cb-hint{font-size:.74rem;color:var(--faint);}
@media (max-width:640px){
  .cb-wrap{flex-direction:column;}
  .cb-rail{width:100%;flex-direction:row;flex-wrap:wrap;
    border-right:none;border-bottom:1px solid var(--border);padding:0 0 10px;}
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

const SECTIONS = [
  { key: 'characters', label: 'Characters', icon: 'pen', kind: 'list', item: 'character' },
  { key: 'settings', label: 'Settings & Places', icon: 'folder', kind: 'list', item: 'setting' },
  { key: 'plotArcs', label: 'Plot Arcs', icon: 'tree', kind: 'list', item: 'arc' },
  { key: 'worldRules', label: 'World Rules & Physics', icon: 'info', kind: 'list', item: 'rule' },
  { key: 'items', label: 'Item Catalog', icon: 'key', kind: 'list', item: 'item' },
  {
    key: 'generalProse', label: 'General Prose', icon: 'type', kind: 'text',
    hint: 'House style, voice, tense, rhythm — guidance applied to all generated prose.',
    placeholder: 'e.g. Third-person limited, lean sentences, dry wit. Prefer sensory detail over abstraction…',
  },
  {
    key: 'generalAiInstructions', label: 'AI Instructions', icon: 'sparkles', kind: 'text',
    hint: 'Standing directives automatically bundled with EVERY Scribe prompt.',
    placeholder: 'e.g. Never break established world rules. Keep character voices consistent with their profiles…',
  },
];

let projectRef = null;
let cfg = null;
let activeSection = 'characters';
let railEl = null;
let contentEl = null;
let savedBadge = null;
let saveTimer = null;
let m = null;

function entryId() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'e_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function normalize(cfgObj) {
  for (const sec of SECTIONS) {
    if (sec.kind === 'list' && !Array.isArray(cfgObj[sec.key])) cfgObj[sec.key] = [];
    if (sec.kind === 'text' && typeof cfgObj[sec.key] !== 'string') cfgObj[sec.key] = '';
  }
  return cfgObj;
}

/* ---------- Saving ---------- */
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 600);
}

function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!projectRef || !cfg) return;
  saveEffectiveConfig(projectRef, cfg);
  if (savedBadge) {
    savedBadge.hidden = false;
    setTimeout(() => { if (savedBadge) savedBadge.hidden = true; }, 1200);
  }
}

/* ---------- Render ---------- */
function renderRail() {
  clear(railEl);
  for (const sec of SECTIONS) {
    const count = sec.kind === 'list' ? String(cfg[sec.key].length) : (cfg[sec.key].trim() ? '•' : '');
    railEl.appendChild(el('button', {
      class: 'cb-rail-btn' + (activeSection === sec.key ? ' is-selected' : ''),
      onclick: () => { activeSection = sec.key; renderRail(); renderContent(); },
    }, [
      icon(sec.icon, 'icon-sm'),
      el('span', { text: sec.label }),
      el('span', { class: 'count', text: count }),
    ]));
  }
}

function renderContent() {
  clear(contentEl);
  const sec = SECTIONS.find((s) => s.key === activeSection);
  if (!sec) return;

  if (sec.kind === 'text') {
    contentEl.append(
      el('div', { class: 'cb-head' }, [el('h3', { text: sec.label })]),
      el('p', { class: 'cb-hint', text: sec.hint }),
      el('textarea', {
        class: 'textarea',
        rows: '12',
        placeholder: sec.placeholder,
        text: cfg[sec.key],
        oninput: (e) => { cfg[sec.key] = e.target.value; scheduleSave(); },
      })
    );
    return;
  }

  contentEl.append(
    el('div', { class: 'cb-head' }, [
      el('h3', { text: sec.label }),
      el('button', {
        class: 'btn btn-sm btn-primary cb-add',
        onclick: () => {
          cfg[sec.key].push({ id: entryId(), name: '', body: '' });
          scheduleSave();
          renderRail();
          renderContent();
          const cards = contentEl.querySelectorAll('.cb-card .input');
          if (cards.length) cards[cards.length - 1].focus();
        },
      }, [icon('plus', 'icon-sm'), `Add ${sec.item}`]),
    ])
  );

  if (!cfg[sec.key].length) {
    contentEl.appendChild(el('div', { class: 'empty-state' }, [
      icon(sec.icon, 'icon-lg'),
      el('p', { text: `No ${sec.item}s yet.` }),
      el('p', { class: 'cb-hint', text: 'Entries here are bundled into Scribe prompts and exported with your project.' }),
    ]));
    return;
  }

  cfg[sec.key].forEach((entry, idx) => {
    contentEl.appendChild(el('div', { class: 'cb-card' }, [
      el('div', { class: 'cb-card-head' }, [
        el('input', {
          class: 'input',
          placeholder: `${sec.item} name…`,
          value: entry.name || '',
          oninput: (e) => { entry.name = e.target.value; scheduleSave(); },
        }),
        el('button', {
          class: 'btn btn-ghost btn-icon btn-sm',
          'aria-label': `Delete ${entry.name || sec.item}`,
          onclick: async () => {
            const ok = await confirmDialog({
              title: `Delete ${sec.item}`,
              message: entry.name ? `"${entry.name}" will be removed from the bible.` : 'This empty entry will be removed.',
              confirmLabel: 'Delete',
              danger: true,
            });
            if (!ok) return;
            cfg[sec.key].splice(idx, 1);
            scheduleSave();
            renderRail();
            renderContent();
          },
        }, [icon('trash', 'icon-sm')]),
      ]),
      el('textarea', {
        class: 'textarea',
        rows: '4',
        placeholder: 'Description, traits, history, rules…',
        text: entry.body || '',
        oninput: (e) => { entry.body = e.target.value; scheduleSave(); },
      }),
    ]));
  });
}

/* ---------- Entry point ---------- */
export function openConfigBible() {
  const project = getState().project;
  if (!project) return;
  ensureStyle();

  projectRef = project;
  cfg = normalize(JSON.parse(JSON.stringify(getEffectiveConfig(project))));
  activeSection = 'characters';

  savedBadge = el('span', { class: 'badge badge-success', text: 'saved', hidden: true });

  m = modal({
    title: 'Project Bible',
    size: 'lg',
    body: [],
    footer: [
      el('button', { class: 'btn btn-primary', text: 'Done', onclick: () => m.close() }),
    ],
    onClose: () => { saveNow(); },
  });

  railEl = el('div', { class: 'cb-rail' });
  contentEl = el('div', { class: 'cb-content' });

  m.body.append(
    el('div', { class: 'cb-scope-row' }, [
      el('span', {
        class: 'badge' + (project.seriesId ? ' badge-accent' : ''),
        text: project.seriesId
          ? `shared series bible · ${project.seriesName || 'series'}`
          : 'standalone project bible',
      }),
      savedBadge,
      el('span', {
        class: 'cb-hint',
        text: project.seriesId
          ? 'Edits persist across every book in this series.'
          : 'Edits apply to this project only.',
      }),
    ]),
    el('div', { class: 'cb-wrap' }, [railEl, contentEl])
  );

  renderRail();
  renderContent();
}
