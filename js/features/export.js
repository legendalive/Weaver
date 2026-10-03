/* =========================================================
   Weaver — js/features/export.js
   Step 23: Export — downloads Main Novel and Config Bible.
   - Respects series-shared bibles via getEffectiveConfig.
   - Formats the bible into a clean, readable text structure.
   - Triggers downloads safely with a slight delay to avoid
     browser multi-download blockers.
   ========================================================= */

import { getState } from '../core/state.js';
import { getEffectiveConfig } from '../core/storage.js';
import { toast } from '../utils/dom.js';

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportProject() {
  const project = getState().project;
  if (!project) {
    toast('No active project to export.', 'danger');
    return;
  }

  const safeName = (project.name || 'Untitled').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  
  // 1. Prepare Main Novel
  const novelText = project.mainNovel.text || '';
  const hasNovel = novelText.trim().length > 0;
  
  // 2. Prepare Config Bible
  const cfg = getEffectiveConfig(project);
  let bibleText = `# Project Bible: ${project.name}\n`;
  if (project.seriesName) bibleText += `Series: ${project.seriesName}\n`;
  bibleText += `Exported: ${new Date().toLocaleString()}\n\n`;
  
  const sections = [
    { key: 'characters', label: 'Characters' },
    { key: 'settings', label: 'Settings & Places' },
    { key: 'plotArcs', label: 'Plot Arcs' },
    { key: 'worldRules', label: 'World Rules & Physics' },
    { key: 'items', label: 'Item Catalog' },
  ];
  
  for (const sec of sections) {
    bibleText += `## ${sec.label}\n\n`;
    const entries = cfg[sec.key] || [];
    if (!entries.length) {
      bibleText += `(No entries)\n\n`;
    } else {
      for (const e of entries) {
        bibleText += `### ${e.name || '(Unnamed)'}\n${e.body || ''}\n\n`;
      }
    }
  }
  
  bibleText += `## General Prose\n\n${cfg.generalProse || '(Empty)'}\n\n`;
  bibleText += `## General AI Instructions\n\n${cfg.generalAiInstructions || '(Empty)'}\n\n`;

  // 3. Download
  if (hasNovel) {
    downloadFile(`${safeName}_main_novel.txt`, novelText);
    setTimeout(() => {
      downloadFile(`${safeName}_config_bible.txt`, bibleText);
    }, 600);
    toast('Exporting Main Novel and Config Bible…', 'success');
  } else {
    downloadFile(`${safeName}_config_bible.txt`, bibleText);
    toast('Main Novel is empty. Exported Config Bible only.', 'info');
  }
}
