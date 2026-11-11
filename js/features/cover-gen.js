/* =========================================================
Weaver — js/features/cover-gen.js
V4.2: Cover Studio — AI concept prompts + cover upload +
LIVE AUTHOR OVERLAY.

CHANGE: the author name & position are no longer pre-generation
prompt fields. AFTER an image is uploaded, the user gets an
overlay studio: enter the name and pick a location (center
top/middle/bottom, or the four corners). The name is drawn onto
the image client-side (canvas) at the chosen spot, with optional
size + color fine-tuning. The clean upload is kept separately so
the overlay can be re-edited or removed without re-uploading.
The composited image is stored on project.cover.image and is
what features/export.js embeds into EPUB exports.

Gates: AI concept generation = Pro; upload + overlay = everyone.
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
.cg-prompt-box{padding:12px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-2);font-family:var(--font-mono);font-size:.78rem;line-height:1.6;color:var(--muted);white-space:pre-wrap;max-height:180px;overflow-y:auto;}
.cg-output{display:flex;flex-direction:column;gap:12px;}
.cg-card{padding:14px;border:1px solid var(--border-strong);border-radius:var(--radius-md);background:var(--surface-2);}
.cg-card-head{font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);font-weight:650;margin-bottom:6px;}
.cg-card-body{font-size:.85rem;line-height:1.65;color:var(--text);white-space:pre-wrap;}
.cg-card-actions{display:flex;gap:6px;margin-top:8px;}
.cg-hint{font-size:.72rem;color:var(--faint);line-height:1.5;}
.cg-divider{border-top:1px solid var(--border);margin:4px 0;}
.cg-streaming::after{content:'▍';color:var(--accent);animation:cg-blink 1s steps(2) infinite;}
@keyframes cg-blink{50%{opacity:0;}}

/* ---- overlay studio ---- */
.cgx{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap;}
.cgx-stage{flex:none;width:230px;display:flex;flex-direction:column;gap:8px;}
.cgx-frame{position:relative;border:1px solid var(--border-strong);border-radius:var(--radius-md);overflow:hidden;background:var(--surface-2);box-shadow:0 10px 30px rgba(0,0,0,.45);}
.cgx-frame canvas{display:block;width:100%;height:auto;}
.cgx-stage-cap{font-size:.68rem;color:var(--faint);text-align:center;font-family:var(--font-mono);}
.cgx-controls{flex:1;min-width:240px;display:flex;flex-direction:column;gap:14px;}
.cgx-field{display:flex;flex-direction:column;gap:6px;}
.cgx-label{font-size:.7rem;font-weight:650;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);}
.cgx-pos{display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);gap:6px;width:120px;aspect-ratio:2/3;padding:8px;border:1px solid var(--border-strong);border-radius:var(--radius-md);background:var(--surface-2);}
.cgx-pos button{border:1px solid transparent;border-radius:8px;background:transparent;cursor:pointer;display:grid;place-items:center;padding:0;transition:background .15s ease,border-color .15s ease;}
.cgx-pos button .dot{width:9px;height:9px;border-radius:50%;background:var(--border-strong);transition:background .15s ease,transform .15s ease;}
.cgx-pos button:hover{background:var(--surface-3);}
.cgx-pos button:hover .dot{background:var(--muted);}
.cgx-pos button.is-on{border-color:rgba(224,168,60,.6);background:var(--accent-soft);}
.cgx-pos button.is-on .dot{background:var(--accent);transform:scale(1.35);}
.cgx-pos button.is-off{cursor:default;pointer-events:none;}
.cgx-pos button.is-off .dot{width:4px;height:4px;background:var(--border);opacity:.5;}
.cgx-row{display:flex;gap:12px;align-items:center;flex-wrap:wrap;}
.cgx-range{flex:1;min-width:120px;accent-color:var(--accent);}
.cgx-sizeval{font-family:var(--font-mono);font-size:.72rem;color:var(--muted);min-width:44px;text-align:right;}
.cgx-swatches{display:flex;gap:6px;align-items:center;}
.cgx-swatch{width:24px;height:24px;border-radius:50%;border:2px solid var(--border-strong);cursor:pointer;padding:0;transition:transform .12s ease,border-color .12s ease;}
.cgx-swatch:hover{transform:scale(1.1);}
.cgx-swatch.is-on{border-color:var(--accent);transform:scale(1.12);}
.cgx-color{width:30px;height:30px;padding:0;border:1px solid var(--border-strong);border-radius:8px;background:var(--surface-2);cursor:pointer;}
.cgx-actions{display:flex;gap:8px;flex-wrap:wrap;}
.cgx-empty{display:flex;flex-direction:column;gap:10px;align-items:flex-start;}
@media (max-width:640px){ .cgx{flex-direction:column;} .cgx-stage{width:100%;max-width:260px;margin:0 auto;} }
`;
function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
}

/* ---------- Positions (the seven allowed spots) ---------- */
const POSITIONS = [
  { key: 'top-left',      label: 'Top left' },
  { key: 'top-center',    label: 'Top center' },
  { key: 'top-right',     label: 'Top right' },
  { key: 'middle-center', label: 'Middle center' },
  { key: 'bottom-left',   label: 'Bottom left' },
  { key: 'bottom-center', label: 'Bottom center' },
  { key: 'bottom-right',  label: 'Bottom right' },
];
const POS_KEYS = POSITIONS.map((p) => p.key);
const DEFAULT_POS = 'bottom-center';
/* 3×3 visual grid; the two middle-side cells are inactive. */
const POS_GRID = [
  'top-left', 'top-center', 'top-right',
  null, 'middle-center', null,
  'bottom-left', 'bottom-center', 'bottom-right',
];
const COLOR_PRESETS = ['#ffffff', '#e0a83c', '#f3ead7', '#111111'];

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
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL('image/jpeg', 0.85);
  if (!out || out.length > 3000000) {
    throw new Error('That image is still too large after compression — try a smaller or simpler file.');
  }
  return out;
}

/* ---------- Canvas overlay compositor ---------- */
function drawComposite(canvas, img, name, pos, sizePct, color) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const text = (name || '').trim();
  if (!text) return;

  const pad = Math.round(Math.min(w, h) * 0.06);
  let fs = Math.max(12, Math.round(w * 0.052 * (sizePct / 100)));
  const maxW = w - pad * 2;
  const setFont = () => { ctx.font = `600 ${fs}px Georgia, 'Times New Roman', serif`; };
  setFont();
  while (fs > 12 && ctx.measureText(text).width > maxW) { fs -= 1; setFont(); }

  const p = POS_KEYS.includes(pos) ? pos : DEFAULT_POS;
  const vx = p.endsWith('left') ? 'start' : p.endsWith('right') ? 'end' : 'mid';
  const vy = p.startsWith('top') ? 'top' : p.startsWith('bottom') ? 'bottom' : 'mid';
  const x = vx === 'start' ? pad : vx === 'end' ? w - pad : w / 2;
  const y = vy === 'top' ? pad + fs * 0.82 : vy === 'bottom' ? h - pad : h / 2 + fs * 0.34;

  ctx.textAlign = vx === 'start' ? 'left' : vx === 'end' ? 'right' : 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,.6)';
  ctx.shadowBlur = Math.round(fs * 0.2);
  ctx.shadowOffsetY = Math.round(fs * 0.05);
  ctx.fillStyle = color || '#ffffff';
  ctx.fillText(text, x, y);
  ctx.shadowColor = 'transparent';
}

/* ---------- Prompt compiler (clean art — text added locally) ---------- */
function compileCoverPrompt(project) {
  const cfg = getEffectiveConfig(project);
  const plot = project.plot || {};
  const parts = [];
  parts.push(`BOOK TITLE: "${project.bookTitle || project.name || 'Untitled'}"`);
  if (project.seriesName) parts.push(`SERIES: ${project.seriesName}`);
  if (plot.premise && plot.premise.trim()) parts.push(`\nPREMISE:\n${plot.premise.trim().slice(0, 600)}`);
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
  if (cfg.generalProse && cfg.generalProse.trim()) parts.push(`\nPROSE STYLE: ${cfg.generalProse.trim().slice(0, 200)}`);
  return parts.join('\n');
}
const SYSTEM_PROMPT = `You are a professional book cover designer and art director. Given a novel's details, generate THREE distinct cover concepts. For each concept provide:
1. CONCEPT TITLE (2-3 words)
2. VISUAL DESCRIPTION (composition, colors, mood, lighting)
3. IMAGE PROMPT (one detailed prompt, ready to paste into an image generator)
4. STYLE TAGS (3-5 keywords)
Cover rules — every IMAGE PROMPT must:
- Produce CLEAN ARTWORK WITH NO TEXT of any kind: no title, no author name, no letters, no watermarks, no borders. Typography is added later by the app.
- Leave calm negative space near the top and bottom thirds so a title and author line can be overlaid cleanly.
- Specify standard ebook cover proportions (2:3 portrait).
Be specific about color palettes, composition and mood. Output ONLY the three numbered concepts, no preamble.`;

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

/* ---------- AI generation ---------- */
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
      onToken: (_d, accumulated) => { full = accumulated; bodyEl.textContent = full; },
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
          class: 'btn btn-sm', text: 'Copy all',
          onclick: () => navigator.clipboard.writeText(full).then(
            () => toast('All concepts copied.', 'success'),
            () => toast('Could not copy — select the text manually.', 'danger')
          ),
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

  /* ===== AI concept section (no author fields) ===== */
  const promptBox = el('div', { class: 'cg-prompt-box', text: compileCoverPrompt(project) });
  const outputHost = el('div', { class: 'cg-output' });
  const generateBtn = el('button', {
    class: 'btn btn-primary',
    onclick: () => {
      if (isKnownFree()) { toast('Cover prompt generation is a Pro feature. Upgrade in Settings.', 'info'); return; }
      runGeneration(promptBox.textContent, outputHost, generateBtn);
    },
  }, [icon('sparkles', 'icon-sm'), el('span', { text: 'Generate Cover Concepts' })]);

  /* ===== Upload + live overlay studio ===== */
  const studioHost = el('div', {});
  let srcImg = null;
  let pos = POS_KEYS.includes(cover.authorPos) ? cover.authorPos : DEFAULT_POS;
  let size = Number.isFinite(cover.authorSize) ? cover.authorSize : 100;
  let color = cover.authorColor || '#ffffff';
  let previewCanvas = null;
  let nameInput = null;
  let posGrid = null;
  let sizeVal = null;
  let compTimer = null;

  function drawPreview() {
    if (!srcImg || !previewCanvas) return;
    drawComposite(previewCanvas, srcImg, nameInput ? nameInput.value : '', pos, size, color);
  }
  function persistComposite() {
    if (!srcImg || !previewCanvas) return;
    drawPreview();
    const name = (nameInput ? nameInput.value : '').trim();
    if (!name) {
      cover.image = cover.sourceImage;
    } else {
      try {
        let out = previewCanvas.toDataURL('image/jpeg', 0.88);
        if (out.length > 3000000) out = previewCanvas.toDataURL('image/jpeg', 0.72);
        cover.image = out;
      } catch (e) { cover.image = cover.sourceImage; }
    }
    cover.author = name;
    cover.authorPos = pos;
    cover.authorSize = size;
    cover.authorColor = color;
    cover.updatedAt = Date.now();
    touchProject();
  }
  function schedulePersist() {
    clearTimeout(compTimer);
    compTimer = setTimeout(persistComposite, 220);
  }
  function refreshPosGrid() {
    if (!posGrid) return;
    posGrid.querySelectorAll('button[data-pos]').forEach((b) => {
      b.classList.toggle('is-on', b.dataset.pos === pos);
    });
  }

  const fileInput = el('input', {
    type: 'file', accept: 'image/jpeg,image/png,image/webp', hidden: true,
    onchange: async (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        const dataUrl = await compressCover(f);
        cover.sourceImage = dataUrl;
        srcImg = await loadImage(dataUrl);
        renderStudio();
        persistComposite();
        toast('Cover uploaded. Add the author name and pick its position below.', 'success');
      } catch (err) {
        toast(err.message || 'Could not use that image.', 'danger');
      }
    },
  });

  function renderStudio() {
    clear(studioHost);
    const hasImage = Boolean(cover.sourceImage || cover.image);
    if (!hasImage) {
      studioHost.appendChild(el('div', { class: 'cgx-empty' }, [
        el('span', {
          class: 'cg-hint',
          text: 'Create the artwork with your favorite image generator (the prompts above produce clean, text-free covers), then upload it here. After uploading you can superimpose the author name exactly where you want it.',
        }),
        el('button', { class: 'btn btn-sm', onclick: () => fileInput.click() },
          [icon('upload', 'icon-sm'), 'Upload cover image']),
      ]));
      return;
    }

    previewCanvas = el('canvas', {});
    nameInput = el('input', {
      class: 'input', type: 'text', maxlength: '60',
      placeholder: 'Author name as it should appear…',
      value: cover.author || '',
      oninput: () => { drawPreview(); schedulePersist(); },
    });

    posGrid = el('div', { class: 'cgx-pos', role: 'group', 'aria-label': 'Author name position' });
    for (const key of POS_GRID) {
      if (!key) { posGrid.appendChild(el('button', { class: 'is-off', tabindex: '-1', 'aria-hidden': 'true' }, [el('span', { class: 'dot' })])); continue; }
      const label = (POSITIONS.find((p) => p.key === key) || {}).label || key;
      posGrid.appendChild(el('button', {
        dataset: { pos: key }, title: label, 'aria-label': label,
        onclick: () => { pos = key; refreshPosGrid(); drawPreview(); persistComposite(); },
      }, [el('span', { class: 'dot' })]));
    }

    const sizeRange = el('input', {
      class: 'cgx-range', type: 'range', min: '60', max: '170', step: '5', value: String(size),
      oninput: (e) => { size = parseInt(e.target.value, 10) || 100; if (sizeVal) sizeVal.textContent = size + '%'; drawPreview(); schedulePersist(); },
    });
    sizeVal = el('span', { class: 'cgx-sizeval', text: size + '%' });

    const swatches = el('div', { class: 'cgx-swatches' });
    function refreshSwatches() {
      swatches.querySelectorAll('.cgx-swatch').forEach((s) => s.classList.toggle('is-on', s.dataset.color === color));
    }
    for (const c of COLOR_PRESETS) {
      const sw = el('button', { class: 'cgx-swatch', dataset: { color: c }, title: c, 'aria-label': 'Text color ' + c });
      sw.style.background = c;
      sw.onclick = () => { color = c; refreshSwatches(); drawPreview(); persistComposite(); };
      swatches.appendChild(sw);
    }
    const colorInput = el('input', {
      class: 'cgx-color', type: 'color', value: color, title: 'Custom text color',
      oninput: (e) => { color = e.target.value; refreshSwatches(); drawPreview(); schedulePersist(); },
    });
    swatches.appendChild(colorInput);

    const stage = el('div', { class: 'cgx-stage' }, [
      el('div', { class: 'cgx-frame' }, [previewCanvas]),
      el('span', { class: 'cgx-stage-cap', text: 'Live preview — saved with this project' }),
    ]);

    const controls = el('div', { class: 'cgx-controls' }, [
      el('div', { class: 'cgx-field' }, [
        el('span', { class: 'cgx-label', text: '1 · Author name' }),
        nameInput,
        el('span', { class: 'cg-hint', text: 'Superimposed on the artwork. Leave blank for a text-free cover.' }),
      ]),
      el('div', { class: 'cgx-field' }, [
        el('span', { class: 'cgx-label', text: '2 · Position on cover' }),
        posGrid,
      ]),
      el('div', { class: 'cgx-field' }, [
        el('span', { class: 'cgx-label', text: 'Fine-tune' }),
        el('div', { class: 'cgx-row' }, [sizeRange, sizeVal]),
        el('div', { class: 'cgx-row' }, [swatches]),
      ]),
      el('div', { class: 'cgx-actions' }, [
        el('button', { class: 'btn btn-sm', onclick: () => fileInput.click() }, [icon('upload', 'icon-sm'), 'Replace image']),
        el('button', { class: 'btn btn-sm', onclick: () => { persistComposite(); downloadCover(project); } }, [icon('download', 'icon-sm'), 'Download']),
        el('button', {
          class: 'btn btn-sm', title: 'Remove the author text but keep the artwork',
          onclick: () => { if (nameInput) nameInput.value = ''; drawPreview(); persistComposite(); },
        }, [icon('type', 'icon-sm'), 'Clear text']),
        el('button', {
          class: 'btn btn-sm btn-danger',
          onclick: async () => {
            const ok = await confirmDialog({
              title: 'Remove cover',
              message: 'The uploaded cover and its author overlay will be removed from this project. EPUB exports will no longer embed a cover. Continue?',
              confirmLabel: 'Remove', danger: true,
            });
            if (!ok) return;
            delete cover.image; delete cover.sourceImage;
            srcImg = null; touchProject(); renderStudio();
          },
        }, [icon('trash', 'icon-sm'), 'Remove']),
      ]),
    ]);

    studioHost.appendChild(el('div', { class: 'cgx' }, [stage, controls]));
    refreshPosGrid();
    refreshSwatches();
    drawPreview();
  }

  /* Load any existing cover source, then render. */
  const initialSrc = cover.sourceImage || cover.image;
  if (initialSrc) {
    loadImage(initialSrc).then((img) => {
      srcImg = img;
      if (!cover.sourceImage) cover.sourceImage = initialSrc;
      renderStudio();
    }).catch(() => { srcImg = null; renderStudio(); });
  } else {
    renderStudio();
  }

  const bodyKids = [
    el('div', { class: 'cg-wrap' }, [
      el('p', {
        class: 'cg-hint',
        text: 'Generate clean, text-free cover concepts from your Config Bible and Plot Builder, create the artwork in your favorite image generator, upload it, then superimpose the author name exactly where you want it.',
      }),
      el('div', { class: 'field' }, [
        el('span', { class: 'field-label', text: 'Story context sent to AI' }),
        promptBox,
      ]),
      generateBtn,
      outputHost,
      el('div', { class: 'cg-divider' }),
      el('div', { class: 'field' }, [
        el('span', { class: 'field-label', text: 'Your cover image & author overlay' }),
      ]),
      studioHost,
      fileInput,
    ]),
  ];
  if (isKnownFree()) {
    bodyKids[0].insertBefore(
      el('p', { class: 'cg-hint', text: 'Concept generation is a Pro feature. Uploading a cover and adding the author overlay works on any plan.' }),
      bodyKids[0].children[1]
    );
  }

  const m = modal({
    title: 'Cover Studio',
    size: 'lg',
    body: bodyKids,
    footer: [el('button', {
      class: 'btn btn-primary', text: 'Done',
      onclick: () => { persistComposite(); m.close(); },
    })],
  });
}
