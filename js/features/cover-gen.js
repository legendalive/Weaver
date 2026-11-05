/* =========================================================
Weaver — js/features/cover-gen.js
V4: Cover Studio — AI prompt generator + cover image upload.
PRE-GENERATION FIELDS: author name + author-name position
(top/middle/bottom center + four corners). Both are compiled
into the AI context, and the system prompt forces every image
prompt to carry the title and the author line exactly as
specified. No vendor names anywhere ("your favorite image
generator") — deliberate.
UPLOAD: the finished cover is compressed client-side (max
1600×2560, JPEG q0.85) and stored on project.cover.image, so
it rides autosave, backup bundles and the cloud vault for
free, and features/export.js embeds it into EPUB exports.
Gates: generation = Pro (client toast + server ai-proxy
check); upload/download = everyone.
========================================================= */
import { el, clear, toast, modal, confirmDialog } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { getState, touchProject } from '../core/state.js';
import { getEffectiveConfig } from '../core/storage.js';
import { streamChatWithFallback } from '../ai/manager.js';
import { isKnownFree } from '../core/entitlements.js';

const STYLE_ID = 'cover-gen-style';
const CSS = `
.cg-wrap{display:flex;flex-direction:column;gap:14px;}
.cg-form{display:flex;gap:10px;flex-wrap:wrap;}
.cg-form .field{flex:1 1 200px;}
.cg-prompt-box{padding:12px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-2);font-family:var(--font-mono);font-size:.78rem;line-height:1.6;color:var(--muted);white-space:pre-wrap;max-height:180px;overflow-y:auto;}
.cg-output{display:flex;flex-direction:column;gap:12px;}
.cg-card{padding:14px;border:1px solid var(--border-strong);border-radius:var(--radius-md);background:var(--surface-2);}
.cg-card-head{font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);font-weight:650;margin-bottom:6px;}
.cg-card-body{font-size:.85rem;line-height:1.65;color:var(--text);white-space:pre-wrap;}
.cg-card-actions{display:flex;gap:6px;margin-top:8px;}
.cg-hint{font-size:.72rem;color:var(--faint);line-height:1.5;}
.cg-divider{border-top:1px solid var(--border);margin:4px 0;}
.cg-cover-row{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;}
.cg-cover-preview{width:120px;flex:none;border:1px solid var(--border-strong);border-radius:var(--radius-md);overflow:hidden;background:var(--surface-2);}
.cg-cover-preview img{display:block;width:100%;height:auto;}
.cg-cover-actions{display:flex;flex-direction:column;gap:8px;align-items:flex-start;min-width:0;}
.cg-cover-actions .row{display:flex;gap:8px;flex-wrap:wrap;}
.cg-streaming::after{content:'▍';color:var(--accent);animation:cg-blink 1s steps(2) infinite;}
@keyframes cg-blink{50%{opacity:0;}}
`;

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
}

/* ---------- Author-name positions ---------- */
const POSITIONS = [
  'bottom center',
  'top center',
  'middle center',
  'top left',
  'top right',
  'bottom left',
  'bottom right',
];
const DEFAULT_POS = 'bottom center';

/* ---------- Client-side cover compression ---------- */
const MAX_W = 1600;
const MAX_H = 2560;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image file.'));
    img.src = src;
  });
}

async function compressCover(file) {
  if (!file || !file.type || !file.type.startsWith('image/')) {
    throw new Error('That file is not an image. Use a .jpg, .png or .webp file.');
  }
  if (file.size > 25 * 1024 * 1024) {
    throw new Error('That image is larger than 25 MB — please use a smaller file.');
  }
  const rawUrl = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('Could not read that file.'));
    fr.readAsDataURL(file);
  });
  const img = await loadImage(rawUrl);
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error('Could not measure that image.');
  const scale = Math.min(1, MAX_W / w, MAX_H / h);
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';              /* flatten transparency for JPEG */
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL('image/jpeg', 0.85);
  if (!out || out.length > 3000000) {
    throw new Error('That image is still too large after compression — try a smaller or simpler file.');
  }
  return out;
}

/* ---------- Prompt compiler ---------- */
function compileCoverPrompt(project, author, authorPos) {
  const cfg = getEffectiveConfig(project);
  const plot = project.plot || {};
  const parts = [];

  parts.push(`BOOK TITLE: "${project.bookTitle || project.name || 'Untitled'}"`);
  if (project.seriesName) parts.push(`SERIES: ${project.seriesName}`);
  if (author) {
    parts.push(`AUTHOR NAME: "${author}"`);
    parts.push(`AUTHOR NAME POSITION: ${authorPos} — the cover must display the author name at this position.`);
  } else {
    parts.push('AUTHOR NAME: none — the cover must not include any author text.');
  }

  if (plot.premise && plot.premise.trim()) {
    parts.push(`\nPREMISE:\n${plot.premise.trim().slice(0, 600)}`);
  }

  const chars = (cfg.characters || []).slice(0, 5);
  if (chars.length) {
    parts.push('\nKEY CHARACTERS:');
    for (const c of chars) parts.push(`- ${c.name}: ${(c.body || '').slice(0, 120)}`);
  }

  const settings = (cfg.settings || []).slice(0, 3);
  if (settings.length) {
    parts.push('\nKEY SETTINGS:');
    for (const s of settings) parts.push(`- ${s.name}: ${(s.body || '').slice(0, 100)}`);
  }

  if (cfg.generalProse && cfg.generalProse.trim()) {
    parts.push(`\nPROSE STYLE: ${cfg.generalProse.trim().slice(0, 200)}`);
  }

  return parts.join('\n');
}

const SYSTEM_PROMPT = `You are a professional book cover designer and art director. Given a novel's details, generate THREE distinct cover concepts. For each concept provide:
1. CONCEPT TITLE (2-3 words)
2. VISUAL DESCRIPTION (what the viewer sees — composition, colors, mood, lighting, typography treatment)
3. IMAGE PROMPT (one detailed prompt, ready to paste into an image generator)
4. STYLE TAGS (3-5 keywords, e.g. "dark fantasy, oil painting, moody")

Cover text rules — every IMAGE PROMPT must:
- Set the book title as cover text, positioned for maximum impact.
- Include the author name EXACTLY as given, at the exact stated position. If no author name is given, specify no author text on the cover.
- Specify clean, legible typography and: no other text, no watermarks, no borders.
- Specify standard ebook cover proportions (2:3 portrait).

Be specific about color palettes, composition and mood. Avoid generic descriptions. Output ONLY the three numbered concepts, no preamble.`;

/* ---------- Persistence helpers ---------- */
function coverOf(project) {
  if (!project.cover || typeof project.cover !== 'object') project.cover = {};
  return project.cover;
}

function downloadCover(project) {
  const img = project.cover && project.cover.image;
  if (!img) return;
  const a = document.createElement('a');
  a.href = img;
  a.download = (project.name || 'cover').replace(/[^a-z0-9]/gi, '_').toLowerCase() + '_cover.jpg';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ---------- Generation ---------- */
async function runGeneration(compiled, host, btn) {
  clear(host);
  btn.disabled = true;
  const label = btn.querySelector('span');
  if (label) label.textContent = 'Generating…';

  const streamingCard = el('div', { class: 'cg-card cg-streaming' }, [
    el('div', { class: 'cg-card-head', text: 'AI response' }),
    el('div', { class: 'cg-card-body', text: '' }),
  ]);
  host.appendChild(streamingCard);
  const bodyEl = streamingCard.querySelector('.cg-card-body');

  let full = '';
  try {
    await streamChatWithFallback({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: compiled },
      ],
      onToken: (_delta, accumulated) => {
        full = accumulated;
        bodyEl.textContent = full;
      },
    });
  } catch (e) {
    bodyEl.textContent = '\u26A0 ' + (e.message || 'Generation failed.');
    toast('Cover generation failed: ' + (e.message || 'unknown error'), 'danger');
  } finally {
    streamingCard.classList.remove('cg-streaming');
    btn.disabled = false;
    if (label) label.textContent = 'Generate again';
    if (full.trim()) {
      streamingCard.appendChild(el('div', { class: 'cg-card-actions' }, [
        el('button', {
          class: 'btn btn-sm',
          text: 'Copy all',
          onclick: () => {
            navigator.clipboard.writeText(full).then(
              () => toast('All concepts copied.', 'success'),
              () => toast('Could not copy — select the text manually.', 'danger')
            );
          },
        }),
      ]));
    }
  }
}

/* ---------- Modal ---------- */
export function openCoverGenerator() {
  ensureStyle();
  const project = getState().project;
  if (!project) { toast('Open a project first.', 'info'); return; }
  const cover = coverOf(project);

  /* --- prefill fields --- */
  const authorInput = el('input', {
    class: 'input', type: 'text', maxlength: '80',
    placeholder: 'e.g. Michael Benson',
    value: cover.author || '',
  });
  const posSelect = el('select', { class: 'select' },
    POSITIONS.map((p) => el('option', {
      value: p,
      text: p.charAt(0).toUpperCase() + p.slice(1),
    })));
  posSelect.value = POSITIONS.includes(cover.authorPos) ? cover.authorPos : DEFAULT_POS;

  const promptBox = el('div', { class: 'cg-prompt-box', text: '' });

  function persistMeta() {
    cover.author = authorInput.value.trim();
    cover.authorPos = posSelect.value;
    promptBox.textContent = compileCoverPrompt(project, cover.author, cover.authorPos);
    touchProject();
  }
  authorInput.addEventListener('change', persistMeta);
  posSelect.addEventListener('change', persistMeta);
  promptBox.textContent = compileCoverPrompt(project, cover.author || '', cover.authorPos || DEFAULT_POS);

  /* --- generate --- */
  const outputHost = el('div', { class: 'cg-output' });
  const generateBtn = el('button', {
    class: 'btn btn-primary',
    onclick: () => {
      if (isKnownFree()) {
        toast('Cover prompt generation is a Pro feature. Upgrade in Settings.', 'info');
        return;
      }
      persistMeta();
      runGeneration(promptBox.textContent, outputHost, generateBtn);
    },
  }, [icon('sparkles', 'icon-sm'), el('span', { text: 'Generate Cover Concepts' })]);

  /* --- uploaded cover section --- */
  const coverHost = el('div', {});
  function renderCoverSection() {
    clear(coverHost);
    const fileInput = el('input', {
      type: 'file', accept: 'image/jpeg,image/png,image/webp', hidden: true,
      onchange: async (e) => {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!f) return;
        try {
          const dataUrl = await compressCover(f);
          cover.image = dataUrl;
          cover.updatedAt = Date.now();
          touchProject();
          toast('Cover saved with this project — it will be embedded in EPUB exports.', 'success');
          renderCoverSection();
        } catch (err) {
          toast(err.message || 'Could not use that image.', 'danger');
        }
      },
    });
    const uploadBtn = el('button', {
      class: 'btn btn-sm',
      onclick: () => fileInput.click(),
    }, [icon('upload', 'icon-sm'), cover.image ? 'Replace image' : 'Upload cover image']);

    const row = el('div', { class: 'cg-cover-row' });
    if (cover.image) {
      row.appendChild(el('div', { class: 'cg-cover-preview' }, [
        el('img', { src: cover.image, alt: 'Book cover' }),
      ]));
      const dlBtn = el('button', {
        class: 'btn btn-sm',
        onclick: () => downloadCover(project),
      }, [icon('download', 'icon-sm'), 'Download']);
      const rmBtn = el('button', {
        class: 'btn btn-sm btn-danger',
        onclick: async () => {
          const ok = await confirmDialog({
            title: 'Remove cover',
            message: 'The uploaded cover image will be removed from this project. EPUB exports will no longer embed it. Continue?',
            confirmLabel: 'Remove',
            danger: true,
          });
          if (!ok) return;
          delete cover.image;
          touchProject();
          renderCoverSection();
        },
      }, [icon('trash', 'icon-sm'), 'Remove']);
      row.appendChild(el('div', { class: 'cg-cover-actions' }, [
        el('span', { class: 'cg-hint', text: 'Saved with this project · synced to your vault · embedded in EPUB exports.' }),
        el('div', { class: 'row' }, [uploadBtn, dlBtn, rmBtn]),
      ]));
    } else {
      row.appendChild(el('div', { class: 'cg-cover-actions' }, [
        el('span', {
          class: 'cg-hint',
          text: 'Create the cover with your favorite image generator, save the result, then upload it here. It is stored with this project, synced to your vault, and embedded as the cover of your EPUB exports.',
        }),
        el('div', { class: 'row' }, [uploadBtn]),
      ]));
    }
    coverHost.append(fileInput, row);
  }
  renderCoverSection();

  const bodyKids = [
    el('div', { class: 'cg-wrap' }, [
      el('p', {
        class: 'cg-hint',
        text: 'Set the author line, generate concepts from your Config Bible and Plot Builder, then paste a prompt into your favorite image generator. Upload the finished cover below.',
      }),
      el('div', { class: 'cg-form' }, [
        el('div', { class: 'field' }, [
          el('span', { class: 'field-label', text: 'Author name' }),
          authorInput,
          el('span', { class: 'field-hint', text: 'Included in every generated cover prompt exactly as typed. Leave blank for no author text.' }),
        ]),
        el('div', { class: 'field' }, [
          el('span', { class: 'field-label', text: 'Author name position' }),
          posSelect,
        ]),
      ]),
      el('div', { class: 'field' }, [
        el('span', { class: 'field-label', text: 'Story context sent to AI' }),
        promptBox,
      ]),
      generateBtn,
      outputHost,
      el('div', { class: 'cg-divider' }),
      el('div', { class: 'field' }, [
        el('span', { class: 'field-label', text: 'Your cover image' }),
      ]),
      coverHost,
    ]),
  ];
  if (isKnownFree()) {
    bodyKids[0].insertBefore(
      el('p', { class: 'cg-hint', text: 'Concept generation is a Pro feature. Uploading and exporting your own cover works on any plan.' }),
      bodyKids[0].children[1]
    );
  }

  const m = modal({
    title: 'Cover Studio',
    size: 'lg',
    body: bodyKids,
    footer: [el('button', {
      class: 'btn btn-primary', text: 'Done',
      onclick: () => { persistMeta(); m.close(); },
    })],
  });
}
