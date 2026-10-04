/* =========================================================
   Weaver — js/features/export.js
   Step 23 + Step 26: Export.
   - Main Novel -> real .docx with Word heading styles.
   - Config Bible -> readable .txt (unchanged).
   ========================================================= */

import { getState } from '../core/state.js';
import { getEffectiveConfig } from '../core/storage.js';
import { buildBlockIndex, headingPrefix } from '../utils/text.js';
import { buildDocx } from '../utils/docx.js';
import { toast } from '../utils/dom.js';

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  triggerDownload(filename, blob);
}

function downloadBlob(filename, data, mime) {
  const blob = new Blob([data], { type: mime });
  triggerDownload(filename, blob);
}

function triggerDownload(filename, blob) {
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

  /* ----- Main Novel as DOCX ----- */
  const novelText = project.mainNovel.text || '';
  const hasNovel = novelText.trim().length > 0;

  /* ----- Config Bible as TXT ----- */
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
    if (!entries.length) bibleText += `(No entries)\n\n`;
    else for (const e of entries) bibleText += `### ${e.name || '(Unnamed)'}\n${e.body || ''}\n\n`;
  }
  bibleText += `## General Prose\n\n${cfg.generalProse || '(Empty)'}\n\n`;
  bibleText += `## General AI Instructions\n\n${cfg.generalAiInstructions || '(Empty)'}\n\n`;

  /* ----- Downloads ----- */
  if (hasNovel) {
    const idx = buildBlockIndex(novelText);
    const blocks = idx.map((b) => {
      const raw = novelText.slice(b.s, b.e).replace(/\n$/, '');
      return { level: b.level, text: b.level ? raw.slice(headingPrefix(b.level).length) : raw };
    });
    const docx = buildDocx(blocks.length ? blocks : [{ level: 0, text: '' }]);
    downloadBlob(
      `${safeName}_main_novel.docx`,
      docx,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    setTimeout(() => downloadFile(`${safeName}_config_bible.txt`, bibleText), 600);
    toast('Exporting Main Novel (.docx) and Config Bible (.txt)…', 'success');
  } else {
    downloadFile(`${safeName}_config_bible.txt`, bibleText);
    toast('Main Novel is empty. Exported Config Bible only.', 'info');
  }
}
