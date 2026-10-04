/* =========================================================
   Weaver — js/views/wizard.js
   Step 7 + Step 7.5: New Project wizard — name, scope (with
   series name + book title + add-to-existing-series), source
   (scratch/upload), config-bible init with bypass. Series books
   inherit the shared series config bible automatically.
   ========================================================= */

import { el, clear, toast, modal } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import {
  createProject, saveProject,
  listSeries, getSeries, createSeries, addBookToSeries,
  getSeriesConfig, configHasContent,
} from '../core/storage.js';
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

const DEFAULT_CONFIG_HINT = 'Stores characters, settings, plot arcs, world rules & physics, items, general prose style, and standing AI instructions.';

/* ---------- Wizard ---------- */
export function openProjectWizard() {
  let uploadedText = null;
  let uploadedName = null;

  /* ----- name / series / book fields ----- */
  const nameInput = el('input', {
    class: 'input', type: 'text', maxlength: '80',
    placeholder: 'e.g. The Ashes of Avalon',
  });
  const nameField = el('div', { class: 'field' }, [
    el('span', { class: 'field-label', text: 'Project name' }),
    nameInput,
  ]);

  const seriesSelect = el('select', { class: 'select' });
  const seriesNameInput = el('input', {
    class: 'input', type: 'text', maxlength: '80', hidden: true,
    placeholder: 'New series name…',
  });
  const seriesHint = el('span', { class: 'field-hint', hidden: true });
  const seriesField = el('div', { class: 'field', hidden: true }, [
    el('span', { class: 'field-label', text: 'Series' }),
    seriesSelect,
    seriesNameInput,
    seriesHint,
  ]);

    const bookInput = el('input', {
    class: 'input', type: 'text', maxlength: '80',
    placeholder: 'e.g. Book One: Ashfall',
  });
  const bookField = el('div', { class: 'field', hidden: true }, [
    el('span', { class: 'field-label', text: 'Book title' }),
    bookInput,
  ]);

  /* ----- scope ----- */
  const scopeSeg = segmented([
    { value: 'standalone', label: 'Standalone', icon: 'book' },
    { value: 'series', label: 'Series installment', icon: 'library' },
  ], 'standalone');

  /* ----- source ----- */
  const sourceSeg = segmented([
    { value: 'scratch', label: 'Start from scratch', icon: 'pen' },
    { value: 'upload', label: 'Upload manuscript', icon: 'upload' },
  ], 'scratch');

  /* ----- config ----- */
  const configSeg = segmented([
    { value: 'now', label: 'Create config now', icon: 'sliders' },
    { value: 'later', label: 'Skip for later', icon: 'clock' },
  ], 'later');
  const configHint = el('span', { class: 'field-hint', text: DEFAULT_CONFIG_HINT });
  const configField = el('div', { class: 'field' }, [
    el('span', { class: 'field-label', text: 'Config bible' }),
    configSeg.node,
    configHint,
  ]);

  /* ----- upload zone ----- */
  const uploadLabel = el('span', {
    class: 'wizard-upload-hint',
    text: 'Drop a .txt / .md file here, or click to choose one.',
  });
  const fileInput = el('input', {
        type: 'file', accept: '.txt,.md,.markdown,.docx,text/plain', hidden: true,
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
      if (/\.docx$/i.test(file.name)) {
        const buf = await file.arrayBuffer();
        const { text } = await readDocx(buf);
        uploadedText = normalizeNewlines(text);
      } else {
        uploadedText = normalizeNewlines(await file.text());
      }
      uploadedName = file.name;
      const words = uploadedText.trim() ? uploadedText.trim().split(/\s+/).length : 0;
      uploadLabel.textContent = `${file.name} — ${words.toLocaleString()} words loaded`;
      uploadBox.classList.add('is-loaded');
    } catch (err) {
      toast('Could not read that file.', 'danger');
    }
  }

  /* ----- series UI logic ----- */
  function refreshSeriesOptions() {
    clear(seriesSelect);
    const series = listSeries();
    for (const s of series) {
      seriesSelect.appendChild(el('option', { value: s.id, text: s.name }));
    }
    seriesSelect.appendChild(
      el('option', { value: '__new', text: series.length ? '+ New series…' : 'New series (first book)' })
    );
    seriesSelect.value = series.length ? series[0].id : '__new';
    refreshSeriesUI();
  }

  function refreshSeriesUI() {
    const isNew = seriesSelect.value === '__new';
    seriesNameInput.hidden = !isNew;

    const sid = isNew ? null : seriesSelect.value;
    const inherited = sid && configHasContent(getSeriesConfig(sid));

    configField.hidden = Boolean(inherited);
    seriesHint.hidden = !inherited;
    if (inherited) {
      seriesHint.textContent = `Inherits the shared config bible of "${getSeries(sid).name}" — one bible persisted across every book in the series.`;
    } else if (!isNew) {
      configHint.textContent = 'This bible will be shared with every book in the series.';
    } else {
      configHint.textContent = DEFAULT_CONFIG_HINT;
    }
    validate();
  }

  seriesSelect.addEventListener('change', refreshSeriesUI);

  scopeSeg.onChange((v) => {
    const isSeries = v === 'series';
    nameField.hidden = isSeries;
    seriesField.hidden = !isSeries;
    bookField.hidden = !isSeries;
    if (isSeries) refreshSeriesOptions();
    else validate();
  });

  /* ----- validation ----- */
  const createBtn = el('button', {
    class: 'btn btn-primary', text: 'Create Project', disabled: true,
    onclick: () => create(),
  });

  function validate() {
    let ok;
    if (scopeSeg.get() === 'standalone') {
      ok = nameInput.value.trim() !== '';
    } else {
      ok = bookInput.value.trim() !== '' &&
        (seriesSelect.value !== '__new' || seriesNameInput.value.trim() !== '');
    }
    createBtn.disabled = !ok;
  }
  nameInput.addEventListener('input', validate);
  bookInput.addEventListener('input', validate);
  seriesNameInput.addEventListener('input', validate);

  /* ----- modal ----- */
  const m = modal({
    title: 'New Project',
    body: [
      el('div', { class: 'field' }, [
        el('span', { class: 'field-label', text: 'Scope' }),
        scopeSeg.node,
      ]),
      nameField,
      seriesField,
      bookField,
      el('div', { class: 'field' }, [
        el('span', { class: 'field-label', text: 'Source' }),
        sourceSeg.node,
      ]),
      uploadRow,
      configField,
    ],
    footer: [
      el('button', { class: 'btn', text: 'Cancel', onclick: () => m.close() }),
      createBtn,
    ],
  });

  /* ----- create ----- */
  function create() {
    const scope = scopeSeg.get();
    let seriesId = null;
    let seriesName = null;

    if (scope === 'series') {
      if (seriesSelect.value === '__new') {
        const s = createSeries(seriesNameInput.value.trim());
        seriesId = s.id;
        seriesName = s.name;
      } else {
        seriesId = seriesSelect.value;
        seriesName = getSeries(seriesId)?.name || 'Series';
      }
    }

    const displayName = scope === 'series' ? bookInput.value.trim() : nameInput.value.trim();
    if (!displayName) return;
    if (sourceSeg.get() === 'upload' && !uploadedText) {
      toast('Choose a manuscript file first, or switch to "Start from scratch".', 'danger');
      return;
    }

    const project = createProject({ name: displayName, scope, source: sourceSeg.get() });
    project.seriesId = seriesId;
    project.seriesName = seriesName;
    project.bookTitle = scope === 'series' ? displayName : null;
    if (uploadedText) project.manuscript.text = uploadedText;
    project.uploadedFileName = uploadedName || null;

    const inherited = seriesId && configHasContent(getSeriesConfig(seriesId));
    project.configInitialized = scope === 'series'
      ? Boolean(inherited) || configSeg.get() === 'now'
      : configSeg.get() === 'now';

    if (seriesId) addBookToSeries(seriesId, project.id);
    saveProject(project);

    m.close();
    if (!openProject(project.id)) toast('Project created but could not open.', 'danger');
    else toast(seriesName ? `"${displayName}" added to series "${seriesName}".` : `Project "${displayName}" created.`, 'success');
  }

  setTimeout(() => nameInput.focus(), 50);
}

export function initWizard() {
  setOpenWizard(openProjectWizard);
}
