/* =========================================================
   Weaver — js/features/guide.js
   Step 28.5: Onboarding guide modal.
   - Accessible from Launch, Workspace top bar, and Settings.
   - Sections: welcome, first project, workspace, Scribe (optional),
     cloud backup (optional), export, quick reference.
   ========================================================= */

import { el, modal } from '../utils/dom.js';
import { icon } from '../utils/icons.js';

const STYLE_ID = 'guide-style';
const CSS = `
.guide-body{display:flex;flex-direction:column;gap:18px;max-height:70vh;overflow-y:auto;padding-right:6px;}
.guide-body h2{font-size:1.1rem;font-weight:700;color:var(--text);margin:0 0 2px;}
.guide-body h3{font-size:.92rem;font-weight:650;color:var(--accent);margin:4px 0 4px;}
.guide-body p, .guide-body li{font-size:.85rem;line-height:1.6;color:var(--muted);}
.guide-body ul{padding-left:20px;margin:4px 0;}
.guide-body li{margin-bottom:4px;}
.guide-body .guide-optional{font-size:.72rem;color:var(--faint);font-style:italic;margin-top:-4px;}
.guide-body code{background:var(--surface-2);padding:1px 6px;border-radius:4px;font-size:.78rem;}
.guide-body .guide-table{width:100%;border-collapse:collapse;font-size:.8rem;margin-top:6px;}
.guide-body .guide-table td{border-bottom:1px solid var(--border);padding:5px 6px;vertical-align:top;}
.guide-body .guide-table td:first-child{color:var(--text);font-weight:600;white-space:nowrap;}
.guide-body .guide-welcome{padding:14px;border-left:3px solid var(--accent);background:var(--surface-2);border-radius:var(--radius-sm);}
`;

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
}

function section(title, children) {
  return el('div', { class: 'guide-section' }, [
    el('h2', { text: title }),
    ...children,
  ]);
}

function p(text) { return el('p', { text }); }
function h3(text) { return el('h3', { text }); }
function ul(items) {
  return el('ul', {}, items.map((t) => el('li', { text: t })));
}
function optional(text) { return el('p', { class: 'guide-optional', text }); }
function row(cells) { return el('tr', {}, cells.map((t) => el('td', { text: t }))); }

function buildBody() {
  return el('div', { class: 'guide-body' }, [
    el('div', { class: 'guide-welcome' }, [
      el('h2', { text: 'Welcome to Weaver' }),
      p('Weaver is a private, offline-first novel-writing studio that lives in your browser. Your stories never leave your device unless you choose to sync to a private GitHub repo or use the AI features. Everything is saved locally as you write.'),
    ]),

    section('1. Your First Project', [
      p('From the Library, click + New Project.'),
      h3('Scope'),
      ul([
        'Standalone — a single novel. Give it a name.',
        'Series installment — one book of a series. Name the series (or pick an existing one) and the book title. Every book in a series shares one Config Bible, so characters and world rules stay consistent across installments.',
      ]),
      h3('Source'),
      ul([
        'Start from scratch — blank Manuscript, ready to write.',
        'Upload manuscript — drop a .txt, .md, or .docx file. Word headings become H1/H2/H3 automatically. Only the plain text is stored; the original file is not kept.',
      ]),
      h3('Config Bible'),
      p('Where you keep characters, settings, plot arcs, world rules, items, prose style, and standing AI instructions. Fill it in now, or come back any time via the Config button in the top bar.'),
    ]),

    section('2. The Workspace', [
      p('Three panels separated by draggable borders. On phones they stack; tap the name-pills on the right to switch.'),
      ul([
        'Manuscript — your raw drafts. Type directly, paste, or use H1/H2/H3/¶ to mark headings. Highlight text and Scribe will rewrite, describe, or continue it.',
        'Main Novel — the finalized canon. Send selected text here with Accept as is (or Accept on an AI block).',
        'AI Output — streams from Scribe appear here. Accept pushes to Main Novel, Rewrite tries again, Discard removes the block.',
      ]),
      p('The Hierarchy drawer (top bar) shows a table of contents for both documents — click any heading to jump.'),
    ]),

    section('3. Scribe (AI)', [
      optional('Optional — Weaver works beautifully with zero AI.'),
      p('If you want an AI writing partner:'),
      ul([
        'Open Settings ▸ AI Providers.',
        'Enable one or more providers (Groq, OpenRouter, Gemini, Mistral) — paste an API key, click Test Connection, tick Enable.',
        'The Fallback Order at the top shows the chain Weaver tries if one provider fails or rate-limits.',
      ]),
      p('Back in the workspace:'),
      ul([
        'Highlight a sentence in Manuscript — a chip appears showing the bundled character count.',
        'Type a prompt in the Scribe input (or tap a quick-prompt pill) and press Enter.',
        'Scribe streams a response using your highlight, your Config Bible (only the relevant entries, token-efficient), and your standing AI instructions.',
        'Accept what you like into Main Novel; rewrite what is not right.',
      ]),
      p('Quick prompts — the three pill-buttons under the Scribe input. Edit them in Settings ▸ General to match your workflow (e.g. Improve prose, Continue scene, Rewrite in past tense).'),
    ]),

    section('4. Cloud Backup', [
      optional('Optional — your novels live in your browser by default.'),
      h3('GitHub private-repo sync'),
      ul([
        'At github.com/new, create a PRIVATE repository (e.g. weaver-backup).',
        'At github.com/settings/tokens, create a Fine-grained token scoped to that repo with Contents: Read and write.',
        'In Weaver ▸ Settings ▸ General ▸ GitHub Cloud Sync, paste the token and repo name, click Connect, then Sync now.',
      ]),
      p('Every sync is a git commit, so GitHub\'s history is your time machine. Public repos are refused by design. The token never leaves this browser.'),
      h3('Portable backup file'),
      p('Settings ▸ General ▸ Data & Backup ▸ Download full backup gives you a single JSON file of every project and series bible (API keys excluded). Restore from backup merges it back on any machine.'),
    ]),

    section('5. Export & Migration', [
      ul([
        'Export (top bar) downloads the Main Novel as a real .docx with navigable chapter headings, plus the Config Bible as .txt.',
        'Moving to another PC: Export + download a full backup on the old machine → install the app on the new machine → Restore from backup, re-paste your API keys, open the project.',
      ]),
    ]),

    section('6. Quick Reference', [
      el('table', { class: 'guide-table' }, [
        row(['Find a word/phrase', 'Search field in the top bar. › next, ‹ prev, Esc clears.']),
        row(['Add selection to Config', 'Click the ＋ Config pill that floats above any selection.']),
        row(['Move instead of copy on Accept', 'Settings ▸ General → enable "Accept-as-is MOVES text".']),
        row(['Force-save', 'Ctrl/Cmd + S (if enabled).']),
        row(['Leave a project', 'Library button (top-right); auto-syncs if configured.']),
      ]),
    ]),
  ]);
}

export function openGuide() {
  ensureStyle();
  modal({
    title: 'Weaver — Quick Start',
    size: 'lg',
    body: buildBody(),
    footer: [el('button', { class: 'btn btn-primary', text: 'Close', onclick: () => modal.__last && modal.__last.close && modal.__last.close() })],
  });
}
