/* =========================================================
Weaver — js/features/plot-reference.js
V3.3c: Plot Reference panel.
A collapsible right-side panel showing the plot outline (acts
and beats) while writing. Toggled via the Plot topbar button.
Read-only; editing happens in the Plot Builder modal.
Listens for 'plot-updated' events to stay in sync.
========================================================= */
import { el, clear } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { getState } from '../core/state.js';
import { openPlotBuilder } from './plot-builder.js';

const STYLE_ID = 'plot-reference-style';
const CSS = `.plot-ref-panel{position:fixed;top:52px;right:0;bottom:0;width:280px;background:var(--surface);border-left:1px solid var(--border);z-index:40;display:flex;flex-direction:column;transform:translateX(100%);transition:transform .2s ease;box-shadow:-2px 0 8px rgba(0,0,0,.15);} .plot-ref-panel.is-open{transform:translateX(0);} .plot-ref-header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--border);flex:none;} .plot-ref-title{font-size:.85rem;font-weight:650;color:var(--text);} .plot-ref-actions{display:flex;gap:6px;align-items:center;} .plot-ref-body{flex:1;overflow-y:auto;padding:12px 14px;} .plot-ref-empty{color:var(--faint);font-size:.82rem;line-height:1.5;} .plot-ref-premise{margin-bottom:14px;padding-bottom:10px;border-bottom:1px dashed var(--border);} .plot-ref-premise h4{font-size:.72rem;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:6px;} .plot-ref-premise p{font-size:.82rem;color:var(--text);line-height:1.5;white-space:pre-wrap;} .plot-ref-act{margin-bottom:14px;} .plot-ref-act h4{font-size:.82rem;font-weight:650;color:var(--accent);margin-bottom:4px;} .plot-ref-summary{font-size:.78rem;color:var(--muted);line-height:1.4;margin-bottom:6px;white-space:pre-wrap;} .plot-ref-beats{display:flex;flex-direction:column;gap:6px;padding-left:10px;border-left:2px solid var(--border);} .plot-ref-beat{font-size:.78rem;color:var(--text);line-height:1.4;} .plot-ref-beat-title{font-weight:600;color:var(--text);} .plot-ref-beat-text{color:var(--muted);margin-top:2px;white-space:pre-wrap;} @media (max-width:860px){.plot-ref-panel{display:none;}}`;

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
}

let panel = null;
let bodyEl = null;

function ensurePanel() {
  if (panel) return;
  ensureStyle();

  const header = el('div', { class: 'plot-ref-header' }, [
    el('span', { class: 'plot-ref-title', text: 'Plot Reference' }),
    el('div', { class: 'plot-ref-actions' }, [
      el('button', {
        class: 'btn btn-sm',
        title: 'Open the Plot Builder to edit the outline',
        onclick: () => openPlotBuilder(),
      }, [icon('pen', 'icon-sm'), 'Edit']),
      el('button', {
        class: 'btn btn-ghost btn-icon btn-sm',
        title: 'Close Plot Reference',
        onclick: () => togglePlotReference(),
      }, [icon('x', 'icon-sm')]),
    ]),
  ]);

  bodyEl = el('div', { class: 'plot-ref-body' });
  panel = el('div', { class: 'plot-ref-panel' }, [header, bodyEl]);
  document.body.appendChild(panel);

  document.addEventListener('plot-updated', () => {
    if (panel && panel.classList.contains('is-open')) {
      renderPlotReference();
    }
  });
}

function renderPlotReference() {
  if (!bodyEl) return;
  clear(bodyEl);

  const project = getState().project;
  const plot = project && project.plot;

  if (!plot || !plot.acts || !plot.acts.length) {
    bodyEl.appendChild(el('p', {
      class: 'plot-ref-empty',
      text: 'No plot outline yet. Click "Edit" to open the Plot Builder and sketch your story\u2019s structure.',
    }));
    return;
  }

  if (plot.premise && plot.premise.trim()) {
    bodyEl.appendChild(el('div', { class: 'plot-ref-premise' }, [
      el('h4', { text: 'Premise' }),
      el('p', { text: plot.premise }),
    ]));
  }

  for (const act of plot.acts) {
    const actEl = el('div', { class: 'plot-ref-act' });
    actEl.appendChild(el('h4', { text: act.title || '(untitled act)' }));

    if (act.summary && act.summary.trim()) {
      actEl.appendChild(el('p', { class: 'plot-ref-summary', text: act.summary }));
    }

    if (act.beats && act.beats.length) {
      const beatsEl = el('div', { class: 'plot-ref-beats' });
      for (const beat of act.beats) {
        const beatEl = el('div', { class: 'plot-ref-beat' });
        beatEl.appendChild(el('span', { class: 'plot-ref-beat-title', text: beat.title || '(untitled)' }));
        if (beat.text && beat.text.trim()) {
          beatEl.appendChild(el('p', { class: 'plot-ref-beat-text', text: beat.text }));
        }
        beatsEl.appendChild(beatEl);
      }
      actEl.appendChild(beatsEl);
    }

    bodyEl.appendChild(actEl);
  }
}

export function togglePlotReference() {
  ensurePanel();
  const isOpen = panel.classList.toggle('is-open');
  if (isOpen) {
    renderPlotReference();
  }
}
