/* =========================================================
Weaver — js/features/plot-builder.js
V3.3a: Plot Builder — manual story scaffolding.
Premise → Acts → Beats, stored on project.plot and synced with
the project. Modeled on config-bible.js (modal + debounced
autosave). AI assistance arrives in V3.3b.
========================================================= */
import { el, clear, modal, confirmDialog } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { getState } from '../core/state.js';
import { saveProject } from '../core/storage.js';
import { scheduleCloudSave } from './cloud.js';

const STYLE_ID = 'plot-builder-style';
const CSS = `.pb-content{display:flex;flex-direction:column;gap:14px;} .pb-section{display:flex;flex-direction:column;gap:8px;} .pb-h{font-size:.8rem;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);} .pb-head{display:flex;align-items:center;justify-content:space-between;gap:10px;} .pb-head .pb-h{margin:0;} .pb-row{display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-2);cursor:pointer;} .pb-row:hover{border-color:var(--border-strong);} .pb-row-name{font-weight:600;font-size:.86rem;white-space:nowrap;flex:none;max-width:50%;overflow:hidden;text-overflow:ellipsis;} .pb-row-meta{flex:1;min-width:0;color:var(--faint);font-size:.76rem;font-family:var(--font-mono);} .pb-row-actions{display:flex;gap:4px;flex:none;} .pb-card{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid var(--border-strong);border-radius:var(--radius-md);background:var(--surface-2);} .pb-card-head{display:flex;gap:8px;align-items:center;} .pb-card-head .input{flex:1;} .pb-beats{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px dashed var(--border);border-radius:var(--radius-md);} .pb-beats-head{display:flex;align-items:center;justify-content:space-between;gap:8px;} .pb-beats-label{font-size:.74rem;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);} .pb-beat{display:flex;flex-direction:column;gap:6px;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);} .pb-beat-head{display:flex;gap:6px;align-items:center;} .pb-beat-title{flex:1;} .pb-done{align-self:flex-end;} .pb-hint{font-size:.74rem;color:var(--faint);} .pb-scope-row{display:flex;align-items:center;justify-content:space-between;gap:8px;}`;

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
}

let projectRef = null;
let plot = null;
let contentEl = null;
let savedBadge = null;
let saveTimer = null;
let m = null;
let expandedActs = new Set();

function entryId() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function normalizePlot(p) {
  if (!p || typeof p !== 'object') p = {};
  if (typeof p.premise !== 'string') p.premise = '';
  if (!Array.isArray(p.acts)) p.acts = [];
  for (const act of p.acts) {
    if (typeof act.title !== 'string') act.title = '';
    if (typeof act.summary !== 'string') act.summary = '';
    if (!Array.isArray(act.beats)) act.beats = [];
    for (const b of act.beats) {
      if (typeof b.title !== 'string') b.title = '';
      if (typeof b.text !== 'string') b.text = '';
    }
  }
  return p;
}

/* ---------- Saving ---------- */
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 600);
}
function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!projectRef || !plot) return;
  projectRef.plot = plot;
  try { saveProject(projectRef); } catch (e) { console.warn('[Plot] local save failed:', e); }
  scheduleCloudSave();
  if (savedBadge) {
    savedBadge.hidden = false;
    setTimeout(() => { if (savedBadge) savedBadge.hidden = true; }, 1200);
  }
}

/* ---------- Render ---------- */
function render() {
  clear(contentEl);
  contentEl.appendChild(premiseSection());
  contentEl.appendChild(actsHeader());
  if (!plot.acts.length) {
    contentEl.appendChild(el('div', { class: 'empty-state' }, [
      icon('tree', 'icon-lg'),
      el('p', { text: 'No acts yet.' }),
      el('p', { class: 'pb-hint', text: 'Sketch your story\u2019s skeleton: break it into acts, then beats.' }),
    ]));
    return;
  }
  plot.acts.forEach((act, idx) => {
    contentEl.appendChild(expandedActs.has(act.id) ? actCard(act, idx) : actRow(act, idx));
  });
}

function premiseSection() {
  return el('div', { class: 'pb-section' }, [
    el('h3', { class: 'pb-h', text: 'Premise' }),
    el('textarea', {
      class: 'textarea', rows: '3',
      placeholder: 'One paragraph: whose story, what they want, what stands in the way\u2026',
      text: plot.premise,
      oninput: (e) => { plot.premise = e.target.value; scheduleSave(); },
    }),
  ]);
}

function actsHeader() {
  return el('div', { class: 'pb-head' }, [
    el('h3', { class: 'pb-h', text: 'Acts' }),
    el('button', {
      class: 'btn btn-sm btn-primary',
      onclick: () => {
        const act = { id: entryId(), title: `Act ${plot.acts.length + 1}`, summary: '', beats: [] };
        plot.acts.push(act);
        expandedActs.add(act.id);
        scheduleSave();
        render();
      },
    }, [icon('plus', 'icon-sm'), 'Add act']),
  ]);
}

function actRow(act, idx) {
  return el('div', {
    class: 'pb-row',
    onclick: () => { expandedActs.add(act.id); render(); },
  }, [
    el('span', { class: 'pb-row-name', text: act.title || '(untitled act)' }),
    el('span', { class: 'pb-row-meta', text: `${act.beats.length} beat${act.beats.length === 1 ? '' : 's'}` }),
    el('div', { class: 'pb-row-actions' }, [
      el('button', {
        class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Edit act',
        onclick: (e) => { e.stopPropagation(); expandedActs.add(act.id); render(); },
      }, [icon('pen', 'icon-sm')]),
      deleteActBtn(act, idx),
    ]),
  ]);
}

function actCard(act, idx) {
  return el('div', { class: 'pb-card' }, [
    el('div', { class: 'pb-card-head' }, [
      el('input', {
        class: 'input', placeholder: 'Act title\u2026',
        value: act.title,
        oninput: (e) => { act.title = e.target.value; scheduleSave(); },
      }),
      deleteActBtn(act, idx),
    ]),
    el('textarea', {
      class: 'textarea', rows: '2',
      placeholder: 'Act summary \u2014 what changes in this act\u2026',
      text: act.summary,
      oninput: (e) => { act.summary = e.target.value; scheduleSave(); },
    }),
    beatsBlock(act),
    el('button', {
      class: 'btn btn-sm pb-done', text: 'Done',
      onclick: () => { expandedActs.delete(act.id); render(); },
    }),
  ]);
}

function beatsBlock(act) {
  const wrap = el('div', { class: 'pb-beats' }, [
    el('div', { class: 'pb-beats-head' }, [
      el('span', { class: 'pb-beats-label', text: 'Beats' }),
      el('button', {
        class: 'btn btn-sm',
        onclick: () => { act.beats.push({ id: entryId(), title: '', text: '' }); scheduleSave(); render(); },
      }, [icon('plus', 'icon-sm'), 'Add beat']),
    ]),
  ]);
  if (!act.beats.length) {
    wrap.appendChild(el('p', { class: 'pb-hint', text: 'No beats yet. Beats are the scenes or moments that make up this act.' }));
  } else {
    act.beats.forEach((beat, bidx) => wrap.appendChild(beatCard(act, beat, bidx)));
  }
  return wrap;
}

function beatCard(act, beat, bidx) {
  return el('div', { class: 'pb-beat' }, [
    el('div', { class: 'pb-beat-head' }, [
      el('input', {
        class: 'input pb-beat-title', placeholder: 'Beat title\u2026',
        value: beat.title,
        oninput: (e) => { beat.title = e.target.value; scheduleSave(); },
      }),
      el('button', {
        class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Delete beat',
        onclick: async () => {
          const ok = await confirmDialog({
            title: 'Delete beat',
            message: beat.title ? `\u201C${beat.title}\u201D will be removed.` : 'This beat will be removed.',
            confirmLabel: 'Delete', danger: true,
          });
          if (!ok) return;
          act.beats.splice(bidx, 1);
          scheduleSave();
          render();
        },
      }, [icon('trash', 'icon-sm')]),
    ]),
    el('textarea', {
      class: 'textarea', rows: '2',
      placeholder: 'What happens in this beat\u2026',
      text: beat.text,
      oninput: (e) => { beat.text = e.target.value; scheduleSave(); },
    }),
  ]);
}

function deleteActBtn(act, idx) {
  return el('button', {
    class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Delete act',
    onclick: async (e) => {
      e.stopPropagation();
      const ok = await confirmDialog({
        title: 'Delete act',
        message: act.title
          ? `\u201C${act.title}\u201D and its ${act.beats.length} beat(s) will be removed.`
          : 'This act will be removed.',
        confirmLabel: 'Delete', danger: true,
      });
      if (!ok) return;
      plot.acts.splice(idx, 1);
      expandedActs.delete(act.id);
      scheduleSave();
      render();
    },
  }, [icon('trash', 'icon-sm')]);
}

/* ---------- Entry point ---------- */
export function openPlotBuilder() {
  const project = getState().project;
  if (!project) return;
  ensureStyle();
  projectRef = project;
  plot = normalizePlot(JSON.parse(JSON.stringify(project.plot || {})));
  expandedActs = new Set();
  savedBadge = el('span', { class: 'badge badge-success', text: 'saved', hidden: true });
  m = modal({
    title: 'Plot Builder',
    size: 'lg',
    body: [],
    footer: [el('button', { class: 'btn btn-primary', text: 'Done', onclick: () => m.close() })],
    onClose: () => { saveNow(); },
  });
  contentEl = el('div', { class: 'pb-content' });
  m.body.append(
    el('div', { class: 'pb-scope-row' }, [
      el('span', { class: 'pb-hint', text: 'Outline this book\u2019s structure. Saved with your project and synced to your vault.' }),
      savedBadge,
    ]),
    contentEl
  );
  render();
}
