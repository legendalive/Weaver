/* =========================================================
   Weaver — js/features/guide.js
   v2 Stage 7: onboarding guide modal, refreshed for the
   Supabase era. GitHub-sync content removed; account,
   continuous autosync, badge states, optional Puter overflow
   and the both-files export guarantee are documented.
   ========================================================= */
import { el, modal } from '../utils/dom.js';

const STYLE_ID = 'guide-style';
const CSS = `.guide-body{display:flex;flex-direction:column;gap:18px;max-height:70vh;overflow-y:auto;padding-right:6px;} .guide-body h2{font-size:1.1rem;font-weight:700;color:var(--text);margin:0 0 2px;} .guide-body h3{font-size:.92rem;font-weight:650;color:var(--accent);margin:4px 0 4px;} .guide-body p, .guide-body li{font-size:.85rem;line-height:1.6;color:var(--muted);} .guide-body ul{padding-left:20px;margin:4px 0;} .guide-body li{margin-bottom:4px;} .guide-body .guide-optional{font-size:.72rem;color:var(--faint);font-style:italic;margin-top:-4px;} .guide-body code{background:var(--surface-2);padding:1px 6px;border-radius:4px;font-size:.78rem;} .guide-body .guide-table{width:100%;border-collapse:collapse;font-size:.8rem;margin-top:6px;} .guide-body .guide-table td{border-bottom:1px solid var(--border);padding:5px 6px;vertical-align:top;} .guide-body .guide-table td:first-child{color:var(--text);font-weight:600;white-space:nowrap;} .guide-body .guide-welcome{padding:14px;border-left:3px solid var(--accent);background:var(--surface-2);border-radius:var(--radius-sm);}`;

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
      p('Weaver is a private novel-writing studio that lives in your browser. Everything is saved locally as you write and — once you are signed in — quietly saved to your own private cloud vault as well. Your stories are yours: each vault folder is locked to its account on the server, so no one else can read it.'),
    ]),

    section('1. Your Account', [
      p('Weaver uses a simple email + password account so your library can follow you between devices.'),
      ul([
        'Create account — from the sign-in screen. If asked, confirm via the email, then sign in.',
        'Sign in — email + password on any device; your library is waiting.',
        'Forgot password? — sends a reset link; click it and set a new password.',
        'Sign out — Settings ▸ Data & Storage ▸ Account.',
      ]),
      p('Every account has its own vault.'),
    ]),

    section('2. Your First Project', [
      p('From the Library, press the big New Project button.'),
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
      p('Where you keep characters, settings, plot arcs, world rules, items, prose style, and standing AI instructions. Tick "Open the Config Bible right after creating this project" to start there — or leave it unticked and come back any time via the Config button in the top bar. It is always optional.'),
    ]),

    section('3. The Workspace', [
      p('Three panels separated by draggable borders (double-click a border to reset the split). On phones they stack; tap the name-pills on the right to switch.'),
      ul([
        'Manuscript — your raw drafts. Type directly, paste, or use H1/H2/H3/¶ to mark headings. Highlight text and Scribe will rewrite, describe, or continue it.',
        'Main Novel — the finalized canon. Send selected text here with Accept as is (or Accept on an AI block). Recheck cuts selected novel text back into the Manuscript for revision.',
        'AI Output — streams from Scribe appear here. Accept pushes to Main Novel, Rewrite tries again, Discard removes the block.',
      ]),
      p('The Hierarchy drawer (top bar) shows a table of contents for both documents — click any heading to jump.'),
    ]),

    section('4. Scribe (AI)', [
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

    section('5. Cloud Save, Sync & Safety', [
      optional('Automatic once signed in — there is nothing to configure.'),
      ul([
        'Continuous autosave — a few seconds after you stop typing, the open project (Manuscript, Main Novel and Config Bible together) is compressed and pushed to your vault.',
        'The badge — in the Main Novel header: "saved to cloud · HH:MM" means your latest words are safe; "saved via Puter · HH:MM" means the optional overflow caught them; "cloud save failed" means retry soon — your work is still safe in this browser either way.',
        'Manual doors — Settings ▸ Data & Storage: Backup to cloud (push everything now), Restore (pull everything from your vault), Export.',
        'Overflow storage (Puter) — optional and off by default. If the primary vault is ever full or unreachable, Weaver silently spills into your own free Puter account. Connect or copy manually from Settings ▸ Data & Storage if you want the extra safety net.',
      ]),
      h3('Another computer?'),
      p('Sign in and press Restore — your whole library arrives. API keys are deliberately never synced, so re-paste them in Settings ▸ AI Providers on the new machine.'),
      p('Closing the tab or going offline is always safe: local storage keeps everything, and the next sync reconciles.'),
    ]),

    section('6. Export & Your Files', [
      ul([
        'Export (top bar, or Settings ▸ Data & Storage) always downloads BOTH files: the Main Novel as a real .docx with navigable chapter headings, and the Config Bible as .txt — even if the novel is still empty.',
        'Keep those files anywhere you like; they are plain, open formats any word processor can read.',
      ]),
    ]),

    section('7. Quick Reference', [
      el('table', { class: 'guide-table' }, [
        row(['Find a word/phrase', 'Search field in the top bar. › next, ‹ prev, Esc clears.']),
        row(['Add selection to Config', 'Click the ＋ Config pill that floats above any selection.']),
        row(['Move instead of copy on Accept', 'Settings ▸ General → enable "Accept-as-is MOVES text".']),
        row(['Leave a project', 'Library button (top-right); anything unsaved syncs within seconds anyway.']),
        row(['Reset a forgotten password', 'Sign-in screen → "Forgot password?" → click the emailed link.']),
        row(['Sign out', 'Settings ▸ Data & Storage ▸ Account ▸ Sign out.']),
      ]),
    ]),
  ]);
}

export function openGuide() {
  ensureStyle();
  const m = modal({
    title: 'Weaver — Quick Start',
    size: 'lg',
    body: buildBody(),
    footer: [el('button', { class: 'btn btn-primary', text: 'Close', onclick: () => m.close() })],
  });
}
