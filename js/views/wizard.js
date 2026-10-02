/* =========================================================
   Weaver — js/views/wizard.js
   Step 7: New Project wizard — name, scope, source (scratch or
   manuscript upload), config-bible initialization with bypass.
   Registers itself into the launch dashboard's New Project button.
   ========================================================= */

import { el, toast, modal } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { createProject, saveProject } from '../core/storage.js';
import { openProject } from '../core/state.js';
import { setOpenWizard } from './launch.js';

/* ---------- Segmented picker helper ---------- */
function segmented(options, initial) {
  let value = initial;
  let onChange = null;

  const buttons = options.map((opt) =>
    el('button', {
      class: 'btn wizard-seg-btn' + (opt.value === initial ? ' is-selected' : ''),
      dataset: { value: opt.value },
      onclick: () => {
        value = opt.value;
        buttons.forEach((b) => b.classList.toggle('is-selected', b.dataset.value === value));
        if (typeof onChange === 'function') onChange(value);
      },
    }, [icon(opt.icon), opt.label])
  );

  return {
    node: el('div', { class: 'wizard-seg' }, buttons),
    get: () => value,
    onChange: (fn) => { onChange = fn; },
  };
}

/* ---------- Wizard ---------- */
export function openProjectWizard() {
  let uploadedText = null;
  let uploadedName = null;

  const nameInput = el('input', {
    class: 'input', type: 'text', maxlength: '80',
    placeholder: 'e.g. The Ashes of Avalon',
  });

  const scopeSeg = segmented([
    { value: 'standalone', label: 'Standalone', icon: 'book' },
    { value: 'series', label: 'Series installment', icon: 'library' },
  ], 'standalone');

  const sourceSeg = segmented([
    { value: 'scratch', label: 'Start from scratch', icon: 'pen' },
    { value: 'upload', label: 'Upload manuscript', icon: 'upload' },
  ], 'scratch');

  const configSeg = segmented([
    { value: 'now', label: 'Create config now', icon: 'sliders' },
    { value: 'later', label: 'Skip for later', icon: 'clock' },
  ], 'later');

  /* ----- upload zone ----- */
  const uploadLabel = el('span', {
    class: 'wizard-upload-hint',
    text: 'Drop a .txt / .md file here, or click to choose one.',
  });
  const fileInput = el('input', {
    type: 'file', accept: '.txt,.md,.markdown,text/plain', hidden: true,
    onchange: (e) => { const f = e.target.files?.[0]; if (f) readFile(f); },
  });
  const uploadBox = el('div', {
    class: 'wizard-upload',
    onclick: () => fileInput.click(),
    ondragover: (e) => { e.preventDefault(); uploadBox.classList.add('is-drag'); },
    ondragleave: () => uploadBox.classList.remove('is-drag'),
    ondrop: (e) => {
      e.preventDefault();
      uploadBox.classList.remove('is-drag');
      const f = e.dataTransfer.files?.[0];
      if (f) readFile(f);
    },
  }, [icon('upload', 'icon-lg'), uploadLabel, fileInput]);

  const uploadRow = el('div', { class: 'field', hidden: true }, [
    el('span', { class: 'field-label', text: 'Manuscript file' }),
    uploadBox,
  ]);
  sourceSeg.onChange((v) => { uploadRow.hidden = v !== 'upload'; });

  async function readFile(file) {
    try {
      uploadedText = await file.text();
      uploadedName = file.name;
      const words = uploadedText.trim() ? uploadedText.trim().split(/\s+/).length : 0;
      uploadLabel.textContent = `${file.name} — ${words.toLocaleString()} words loaded`;
      uploadBox.classList.add('is-loaded');
    } catch (err) {
      toast('Could not read that file.', 'danger');
    }
  }

  /* ----- footer ----- */
  const createBtn = el('button', {
    class: 'btn btn-primary', text: 'Create Project', disabled: true,
    onclick: () => create(),
  });
  nameInput.addEventListener('input', () => {
    createBtn.disabled = nameInput.value.trim() === '';
  });

  const m = modal({
    title: 'New Project',
    body: [
      el('div', { class: 'field' }, [
        el('span', { class: 'field-label', text: 'Project name' }),
        nameInput,
      ]),
      el('div', { class: 'field' }, [
        el('span', { class: 'field-label', text: 'Scope' }),
        scopeSeg.node,
      ]),
      el('div', { class: 'field' }, [
        el('span', { class: 'field-label', text: 'Source' }),
        sourceSeg.node,
      ]),
      uploadRow,
      el('div', { class: 'field' }, [
        el('span', { class: 'field-label', text: 'Config bible' }),
        configSeg.node,
        el('span', {
          class: 'field-hint',
          text: 'Stores characters, settings, plot arcs, world rules & physics, items, general prose style, and standing AI instructions.',
        }),
      ]),
    ],
    footer: [
      el('button', { class: 'btn', text: 'Cancel', onclick: () => m.close() }),
      createBtn,
    ],
  });

  function create() {
    const name = nameInput.value.trim();
    if (!name) return;
    if (sourceSeg.get() === 'upload' && !uploadedText) {
      toast('Choose a manuscript file first, or switch to "Start from scratch".', 'danger');
      return;
    }
    const project = createProject({ name, scope: scopeSeg.get(), source: sourceSeg.get() });
    if (uploadedText) project.manuscript.text = uploadedText;
    project.configInitialized = configSeg.get() === 'now';
    project.uploadedFileName = uploadedName || null;
    saveProject(project);
    m.close();
    if (!openProject(project.id)) toast('Project created but could not open.', 'danger');
    else toast(`Project "${name}" created.`, 'success');
  }

  setTimeout(() => nameInput.focus(), 50);
}

export function initWizard() {
  setOpenWizard(openProjectWizard);
}
