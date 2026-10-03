/* =========================================================
   Weaver — js/features/config-bible.js
   Step 15 + patches + Step 23.5: Config (Project Bible) editor.
   - Seven sections; series-aware shared bible.
   - Collapsible entries (one-line rows; expand to edit).
   - IMPORT: ingest an exported *_config_bible.txt with
     Replace / Merge choice.
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
.cb-content{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px;}
.cb-head{display:flex;align-items:center;justify-content:space-between;gap:10px;}
.cb-head h3{font-size:.95rem;font-weight:650;}
.cb-row{display:flex;align-items:center;gap:8px;padding:7px 10px;
  border:1px solid var(--border);border-radius:var(--radius-md);
  background:var(--surface-2);cursor:pointer;}
.cb-row:hover{border-color:var(--border-strong);}
.cb-row-name{font-weight:600;font-size:.86rem;white-space:nowrap;flex:none;max-width:40%;
  overflow:hidden;text-overflow:ellipsis;}
.cb-row-preview{flex:1;min-width:0;color:var(--faint);font-size:.78rem;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cb-row-actions{display:flex;gap:4px;flex:none;}
.cb-card{display:flex;flex-direction:column;gap:8px;padding:12px;
  border:1px solid var(--border-strong);border-radius:var(--radius-md);background:var(--surface-2);}
.cb-card-head{display:flex;gap:8px;align-items:center;}
.cb-card-head .input{flex:1;}
.cb-card-done{align-self:flex-end;}
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

const LIST_KEYS = ['characters', 'settings', 'plotArcs', 'worldRules', 'items'];
const TEXT_KEYS = ['generalProse', 'generalAiInstructions'];

/* Exported-header label -> internal key (case-insensitive) */
const SECTION_LABELS = {
  'characters': 'characters',
  'settings & places': 'settings',
  'plot arcs': 'plotArcs',
  'world rules & physics': 'worldRules',
  'item catalog': 'items',
  'general prose': 'generalProse',
  'general ai instructions': 'generalAiInstructions',
};

let projectRef = null;
let cfg = null;
let activeSection = 'characters';
let railEl = null;
let contentEl = null;
let savedBadge = null;
let saveTimer = null;
let m = null;
let expanded = new Set();

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

function oneLine(str, max = 140) {
  const flat = (str || '').replace(/\s+/g, ' ').trim();
  return flat ? flat.slice(0, max) : '— empty —';
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

/* ---------- Import: parser ---------- */
function isListKey(key) { return LIST_KEYS.includes(key); }

export function parseBibleText(text) {
  const out = {
    characters: [], settings: [], plotArcs: [], worldRules: [], items: [],
    generalProse: '', generalAiInstructions: '',
  };
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  let section = null;
  let current = null;
  let textBuf = [];

  const flushEntry = () => {
    if (current && section && isListKey(section)) {
      current.body = current.body.replace(/\s+$/, '');
      out[section].push(current);
    }
    current = null;
  };
  const flushText = () => {
    if (section && !isListKey(section)) {
      const joined = textBuf.join('\n').trim();
      out[section] = joined === '(Empty)' ? '' : joined;
    }
    textBuf = [];
  };

  for (const line of lines) {
    if (line.startsWith('### ')) {
      flushEntry();
      if (section && isListKey(section)) {
        current = { id: entryId(), name: line.slice(4).trim(), body: '' };
      }
      continue;
    }
    if (line.startsWith('## ')) {
      flushEntry();
      flushText();
      section = SECTION_LABELS[line.slice(3).trim().toLowerCase()] || null;
      continue;
    }
    if (line.startsWith('# ')) continue;             // title line
    if (/^(Series|Exported):/i.test(line)) continue; // metadata lines
    if (!section) continue;
    if (isListKey(section)) {
      if (current) current.body += (current.body ? '\n' : '') + line;
      // stray lines with no open entry (e.g. "(No entries)") are ignored
    } else {
      textBuf.push(line);
    }
  }
  flushEntry();
  flushText();
  return out;
}

function importSummary(parsed) {
  const parts = LIST_KEYS
    .filter((k) => parsed[k].length)
    .map((k) => `${parsed[k].length} ${k}`);
  for (const t of TEXT_KEYS) if (parsed[t].trim()) parts.push(t === 'generalProse' ? 'prose style' : 'AI instructions');
  return parts.length ? parts.join(', ') : 'no content found';
}

function askImportMode(parsed) {
  return new Promise((resolve) => {
    let settled = false;
    const mm = modal({
      title: 'Import config bible',
      body: el('p', {
        text: `File contains: ${importSummary(parsed)}. Replace the current bible, or merge (append) into it?`,
        style: { color: 'var(--muted)', 'font-size': '.88rem', 'line-height': '1.6' },
      }),
      footer: [
        el('button', { class: 'btn', text: 'Cancel', onclick: () => { settled = true; mm.close(); resolve(null); } }),
        el('button', { class: 'btn', text: 'Merge (append)', onclick: () => { settled = true; mm.close(); resolve('merge'); } }),
        el('button', { class: 'btn btn-primary', text: 'Replace', onclick: () => { settled = true; mm.close(); resolve('replace'); } }),
      ],
      onClose: () => { if (!settled) resolve(null); },
    });
  });
}

function applyImport(mode, parsed) {
  if (mode === 'replace') {
    cfg = normalize(parsed);
  } else {
    for (const k of LIST_KEYS) cfg[k] = (cfg[k] || []).concat(parsed[k]);
    for (const t of TEXT_KEYS) {
      if (parsed[t].trim()) {
        cfg[t] = cfg[t].trim() ? cfg[t].trim() + '\n\n' + parsed[t].trim() : parsed[t];
      }
    }
  }
  expanded = new Set();
  scheduleSave();
  renderRail();
  renderContent();
  toast(`Bible imported (${mode}).`, 'success');
}

async function handleImportFile(file) {
  const text = await file.text();
  if (!/^#\s*Project Bible/im.test(text.slice(0, 300))) {
    toast('That file does not look like an exported Weaver config bible.', 'danger');
    return;
  }
  const parsed = parseBibleText(text);
  const mode = await askImportMode(parsed);
  if (!mode) return;
  applyImport(mode, parsed);
}

/* ---------- Render: rail ---------- */
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

/* ---------- Render: content ---------- */
function renderContent() {
  clear(contentEl);
  const sec = SECTIONS.find((s) => s.key === activeSection);
  if (!sec) return;

  if (sec.kind === 'text') {
    renderTextSection(sec);
    return;
  }

  contentEl.append(
    el('div', { class: 'cb-head' }, [
      el('h3', { text: sec.label }),
      el('button', {
        class: 'btn btn-sm btn-primary',
        onclick: () => {
          const entry = { id: entryId(), name: '', body: '' };
          cfg[sec.key].push(entry);
          expanded.add(entry.id);
          scheduleSave();
          renderRail();
          renderContent();
          const node = contentEl.querySelector(`[data-card="${entry.id}"] .textarea`);
          if (node) node.focus();
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
    contentEl.appendChild(
      expanded.has(entry.id) ? expandedCard(sec, entry, idx) : collapsedRow(sec, entry, idx)
    );
  });
}

function collapsedRow(sec, entry, idx) {
  return el('div', {
    class: 'cb-row',
    onclick: () => expandEntry(entry.id),
  }, [
    el('span', { class: 'cb-row-name', text: entry.name || '(unnamed)' }),
    el('span', { class: 'cb-row-preview', text: oneLine(entry.body) }),
    el('div', { class: 'cb-row-actions' }, [
      el('button', {
        class: 'btn btn-ghost btn-icon btn-sm',
        'aria-label': `Edit ${entry.name || sec.item}`,
        onclick: (e) => { e.stopPropagation(); expandEntry(entry.id); },
      }, [icon('pen', 'icon-sm')]),
      deleteBtn(sec, entry, idx),
    ]),
  ]);
}

function expandedCard(sec, entry, idx) {
  return el('div', { class: 'cb-card', dataset: { card: entry.id } }, [
    el('div', { class: 'cb-card-head' }, [
      el('input', {
        class: 'input',
        placeholder: `${sec.item} name…`,
        value: entry.name || '',
        oninput: (e) => { entry.name = e.target.value; scheduleSave(); },
      }),
      deleteBtn(sec, entry, idx),
    ]),
    el('textarea', {
      class: 'textarea',
      rows: '6',
      placeholder: 'Description, traits, history, rules…',
      text: entry.body || '',
      oninput: (e) => { entry.body = e.target.value; scheduleSave(); },
    }),
    el('button', {
      class: 'btn btn-sm cb-card-done',
      text: 'Done',
      onclick: () => { expanded.delete(entry.id); renderContent(); },
    }),
  ]);
}

function renderTextSection(sec) {
  contentEl.append(
    el('div', { class: 'cb-head' }, [el('h3', { text: sec.label })]),
    el('p', { class: 'cb-hint', text: sec.hint })
  );

  if (!expanded.has(sec.key)) {
    contentEl.appendChild(el('div', {
      class: 'cb-row',
      onclick: () => expandEntry(sec.key),
    }, [
      el('span', { class: 'cb-row-preview', text: oneLine(cfg[sec.key], 220) }),
      el('div', { class: 'cb-row-actions' }, [
        el('button', {
          class: 'btn btn-ghost btn-icon btn-sm',
          'aria-label': `Edit ${sec.label}`,
          onclick: (e) => { e.stopPropagation(); expandEntry(sec.key); },
        }, [icon('pen', 'icon-sm')]),
      ]),
    ]));
    return;
  }

  contentEl.appendChild(el('div', { class: 'cb-card', dataset: { card: sec.key } }, [
    el('textarea', {
      class: 'textarea',
      rows: '10',
      placeholder: sec.placeholder,
      text: cfg[sec.key],
      oninput: (e) => { cfg[sec.key] = e.target.value; scheduleSave(); },
    }),
    el('button', {
      class: 'btn btn-sm cb-card-done',
      text: 'Done',
      onclick: () => { expanded.delete(sec.key); renderContent(); },
    }),
  ]));
  const node = contentEl.querySelector(`[data-card="${sec.key}"] .textarea`);
  if (node) node.focus();
}

function expandEntry(id) {
  expanded.add(id);
  renderContent();
  const node = contentEl.querySelector(`[data-card="${id}"] .textarea`);
  if (node) node.focus();
}

function deleteBtn(sec, entry, idx) {
  return el('button', {
    class: 'btn btn-ghost btn-icon btn-sm',
    'aria-label': `Delete ${entry.name || sec.item}`,
    onclick: async (e) => {
      e.stopPropagation();
      const ok = await confirmDialog({
        title: `Delete ${sec.item}`,
        message: entry.name ? `"${entry.name}" will be removed from the bible.` : 'This empty entry will be removed.',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      cfg[sec.key].splice(idx, 1);
      expanded.delete(entry.id);
      scheduleSave();
      renderRail();
      renderContent();
    },
  }, [icon('trash', 'icon-sm')]);
}

/* ---------- Entry point ---------- */
export function openConfigBible() {
  const project = getState().project;
  if (!project) return;
  ensureStyle();

  projectRef = project;
  cfg = normalize(JSON.parse(JSON.stringify(getEffectiveConfig(project))));
  activeSection = 'characters';
  expanded = new Set();

  savedBadge = el('span', { class: 'badge badge-success', text: 'saved', hidden: true });

  const fileInput = el('input', {
    type: 'file', accept: '.txt,text/plain', hidden: true,
    onchange: (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) handleImportFile(f);
    },
  });
  const importBtn = el('button', {
    class: 'btn btn-sm',
    title: 'Import an exported config bible (.txt)',
    onclick: () => fileInput.click(),
  }, [icon('upload', 'icon-sm'), 'Import']);

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
      importBtn,
      fileInput,
    ]),
    el('div', { class: 'cb-wrap' }, [railEl, contentEl])
  );

  renderRail();
  renderContent();
}
