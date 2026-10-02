/* =========================================================
   Weaver — js/panels/main-novel.js
   Step 13: Main Novel panel.
   - Read-only rendering of finalized text.
   - Live word count in the panel header.
   - Recheck: cuts selected text and moves it back to Manuscript.
   ========================================================= */

import { el, clear, toast } from '../utils/dom.js';
import { getState, touchProject } from '../core/state.js';
import { wordCount } from '../utils/text.js';
import { renderManuscript, flushManuscriptSync } from './manuscript.js';

let panelEl = null;
let bodyEl = null;
let wordCountEl = null;

export function mountMainNovel(panel) {
  panelEl = panel;
  bodyEl = panel.querySelector('.panel-body');
  
  // Inject live word count badge into the panel header
  const header = panel.querySelector('.panel-header');
  const actions = panel.querySelector('.panel-actions');
  wordCountEl = el('span', { class: 'badge badge-accent mn-word-count', text: '0 words' });
  header.insertBefore(wordCountEl, actions);

  renderMainNovel();
}

export function renderMainNovel() {
  if (!bodyEl) return;
  clear(bodyEl);

  const project = getState().project;
  if (!project) return;

  const text = project.mainNovel.text || '';
  const wc = wordCount(text);
  if (wordCountEl) wordCountEl.textContent = `${wc.toLocaleString()} words`;

  if (!text) {
    bodyEl.appendChild(el('div', { class: 'empty-state' }, [
      el('p', { text: 'Your finalized manuscript will appear here.' }),
      el('p', { class: 'launch-empty-hint', text: 'Use "Accept as is" in the Manuscript panel to push text here.' })
    ]));
    return;
  }

  const wrap = el('div', { class: 'mn-scroll' });
  
  // Split by double newlines for paragraphs
  const paragraphs = text.split(/\n\s*\n/);
  for (const p of paragraphs) {
    if (!p.trim()) continue;
    
    // Check if it's a heading
    const hm = p.match(/^(#{1,3})\s+(.*)/);
    if (hm) {
      const level = hm[1].length;
      wrap.appendChild(el('div', { class: `mn-block mn-h${level}`, text: hm[2] }));
    } else {
      // Handle single newlines within a paragraph
      const lines = p.split('\n');
      const node = el('div', { class: 'mn-block' });
      lines.forEach((line, i) => {
        if (i > 0) node.appendChild(document.createElement('br'));
        node.appendChild(document.createTextNode(line));
      });
      wrap.appendChild(node);
    }
  }
  bodyEl.appendChild(wrap);
}

/* ---------- Recheck Action ---------- */
export function recheck() {
  // Ensure any pending typing in Manuscript is saved before we modify state
  flushManuscriptSync(); 

  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) {
    toast('Select some text in the Main Novel to recheck.', 'info');
    return;
  }
  
  const selectedText = sel.toString();
  if (!selectedText.trim()) return;

  const project = getState().project;
  if (!project) return;

  const novelText = project.mainNovel.text || '';
  const idx = novelText.indexOf(selectedText);
  
  if (idx === -1) {
    toast('Could not find selected text.', 'danger');
    return;
  }

  // 1. Remove from Main Novel
  let newNovel = novelText.slice(0, idx) + novelText.slice(idx + selectedText.length);
  newNovel = newNovel.replace(/\n{3,}/g, '\n\n').trim();
  project.mainNovel.text = newNovel;

  // 2. Append to Manuscript
  const msText = project.manuscript.text || '';
  project.manuscript.text = msText ? msText + '\n\n' + selectedText : selectedText;

  touchProject();
  toast('Moved to Manuscript for revision.', 'success');
  
  // 3. Re-render both panels
  renderMainNovel();
  renderManuscript();
  
  // Clear the browser selection
  sel.removeAllRanges();
}
