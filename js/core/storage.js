/* =========================================================
   Weaver — js/core/storage.js
   Step 4 + 7.5 + 9 + 24: namespaced localStorage engine.
   Projects, series registry (shared config bible per series),
   settings, resume state, and orphan-safe deletion.
   ========================================================= */

const PREFIX = 'weaver_';

/* ---------- Helpers ---------- */
function read(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.warn(`[Storage] Failed to parse key: ${key}`, e);
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error(`[Storage] Failed to write key: ${key}`, e);
    return false;
  }
}

function remove(key) {
  localStorage.removeItem(PREFIX + key);
}

function genId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---------- Config bible schema (7 sections) ---------- */
export function blankConfig() {
  return {
    characters: [],
    settings: [],
    plotArcs: [],
    worldRules: [],
    items: [],
    generalProse: '',
    generalAiInstructions: '',
  };
}

export function configHasContent(cfg) {
  if (!cfg) return false;
  return Boolean(
    (cfg.characters && cfg.characters.length) ||
    (cfg.settings && cfg.settings.length) ||
    (cfg.plotArcs && cfg.plotArcs.length) ||
    (cfg.worldRules && cfg.worldRules.length) ||
    (cfg.items && cfg.items.length) ||
    (cfg.generalProse || '').trim() ||
    (cfg.generalAiInstructions || '').trim()
  );
}

/* ---------- Project schema ---------- */
function createBlankProject({ name = 'Untitled Project', scope = 'standalone', source = 'scratch' } = {}) {
  const now = Date.now();
  return {
    id: genId(),
    name,
    scope,        // 'standalone' | 'series'
    source,       // 'scratch' | 'upload'
    seriesId: null,
    seriesName: null,
    bookTitle: null,
    createdAt: now,
    updatedAt: now,
    manuscript: { text: '', viewIndex: 0, viewStart: 0 },
    mainNovel: { text: '' },
    configBible: blankConfig(), // used only when seriesId is null
    configInitialized: false,
    uploadedFileName: null,
    scribeHistory: [],
  };
}

/* ---------- Project CRUD ---------- */
export function listProjects() {
  const ids = read('project_ids', []);
  const projects = [];
  for (const id of ids) {
    const meta = read(`project_meta_${id}`);
    if (meta) projects.push(meta);
  }
  return projects.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getProject(id) {
  return read(`project_data_${id}`);
}

export function saveProject(project) {
  if (!project || !project.id) return false;

  const now = Date.now();
  project.updatedAt = now;

  write(`project_data_${project.id}`, project);

  const meta = {
    id: project.id,
    name: project.name,
    scope: project.scope,
    source: project.source,
    seriesId: project.seriesId || null,
    seriesName: project.seriesName || null,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    wordCount: (project.mainNovel?.text || '').trim().split(/\s+/).filter(Boolean).length,
  };
  write(`project_meta_${project.id}`, meta);

  const ids = read('project_ids', []);
  if (!ids.includes(project.id)) {
    ids.push(project.id);
    write('project_ids', ids);
  }
  return true;
}

/* Step 24: orphan-safe deletion — removing the last book of a
   series also removes the series registry entry and its bible. */
export function deleteProject(id) {
  remove(`project_data_${id}`);
  remove(`project_meta_${id}`);

  const ids = read('project_ids', []);
  write('project_ids', ids.filter((x) => x !== id));

  for (const sid of read('series_ids', [])) {
    const meta = read(`series_meta_${sid}`);
    if (meta && meta.bookIds.includes(id)) {
      meta.bookIds = meta.bookIds.filter((b) => b !== id);
      if (meta.bookIds.length === 0) {
        remove(`series_meta_${sid}`);
        remove(`series_config_${sid}`);
        write('series_ids', read('series_ids', []).filter((x) => x !== sid));
      } else {
        write(`series_meta_${sid}`, meta);
      }
    }
  }

  if (getActiveProject() === id) setActiveProject(null);
  return true;
}

export function createProject(opts) {
  const project = createBlankProject(opts);
  saveProject(project);
  return project;
}

/* ---------- Series registry (config bible lives here) ---------- */
export function listSeries() {
  const ids = read('series_ids', []);
  return ids
    .map((id) => read(`series_meta_${id}`))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getSeries(id) {
  return read(`series_meta_${id}`);
}

export function createSeries(name) {
  const id = genId();
  const meta = { id, name, createdAt: Date.now(), updatedAt: Date.now(), bookIds: [] };
  write(`series_meta_${id}`, meta);
  write(`series_config_${id}`, blankConfig());
  const ids = read('series_ids', []);
  ids.push(id);
  write('series_ids', ids);
  return meta;
}

export function addBookToSeries(seriesId, projectId) {
  const meta = getSeries(seriesId);
  if (!meta) return false;
  if (!meta.bookIds.includes(projectId)) meta.bookIds.push(projectId);
  meta.updatedAt = Date.now();
  write(`series_meta_${seriesId}`, meta);
  return true;
}

export function getSeriesConfig(seriesId) {
  return read(`series_config_${seriesId}`, null) || blankConfig();
}

export function saveSeriesConfig(seriesId, config) {
  return write(`series_config_${seriesId}`, config);
}

/* Config resolution: series books share the series bible;
   standalone books use their own. */
export function getEffectiveConfig(project) {
  if (project && project.seriesId) return getSeriesConfig(project.seriesId);
  return (project && project.configBible) || blankConfig();
}

export function saveEffectiveConfig(project, config) {
  if (project && project.seriesId) return saveSeriesConfig(project.seriesId, config);
  if (!project) return false;
  project.configBible = config;
  return saveProject(project);
}

/* ---------- Active project (resume state) ---------- */
export function setActiveProject(id) {
  if (id) write('active_project_id', id);
  else remove('active_project_id');
}

export function getActiveProject() {
  return read('active_project_id', null);
}

/* ---------- Settings ---------- */
const DEFAULT_SETTINGS = {
  general: {
    theme: 'charcoal-gold',
    fontScale: 1.0,
    sentencesPerPage: 15,
    autosaveInterval: 3000,
        panelSizes: [33.4, 33.3, 33.3],
       acceptMovesText: false,
    quickPrompts: ['Improve prose', 'Continue the scene from here', 'Rewrite in third person, past tense'],
  },
  ai: {
    providers: {
      groq: { key: '', enabled: false },
      openrouter: { key: '', enabled: false },
      gemini: { key: '', enabled: false },
      mistral: { key: '', enabled: false },
    },
        fallbackOrder: ['gemini', 'openrouter', 'groq', 'mistral'],
    activeModel: null,
    temperature: 0.85,
    maxTokens: 2048,
  },
};

export function getSettings() {
  const saved = read('settings', {});
  return {
    general: { ...DEFAULT_SETTINGS.general, ...(saved.general || {}) },
        ai: {
      ...DEFAULT_SETTINGS.ai,
      ...(saved.ai || {}),
      providers: { ...DEFAULT_SETTINGS.ai.providers, ...((saved.ai || {}).providers || {}) },
    },
    github: saved.github || { token: '', repo: '', autoSync: true },
  };
}
/* ---------- Step 28: backup / restore + series upsert ---------- */
function sanitizedSettings() {
  const s = JSON.parse(JSON.stringify(read('settings', {})));
  if (s.ai && s.ai.providers) {
    for (const k of Object.keys(s.ai.providers)) s.ai.providers[k].key = '';
  }
  delete s.github; // sync token never leaves this browser
  return s;
}

export function exportAllData() {
  const projectIds = read('project_ids', []);
  const seriesIds = read('series_ids', []);
  return {
    app: 'weaver', version: 1, exportedAt: Date.now(),
    settings: sanitizedSettings(),
    activeProjectId: read('active_project_id', null),
    projects: projectIds
      .map((id) => ({ id, data: read(`project_data_${id}`), meta: read(`project_meta_${id}`) }))
      .filter((p) => p.data),
    series: seriesIds
      .map((id) => ({ id, meta: read(`series_meta_${id}`), config: read(`series_config_${id}`) }))
      .filter((s) => s.meta),
  };
}

export function importAllData(bundle) {
  if (!bundle || bundle.app !== 'weaver' || bundle.version !== 1 || !Array.isArray(bundle.projects)) {
    throw new Error('not a Weaver backup file');
  }
  const ids = read('project_ids', []);
  for (const p of bundle.projects) {
    write(`project_data_${p.id}`, p.data);
    if (p.meta) write(`project_meta_${p.id}`, p.meta);
    if (!ids.includes(p.id)) ids.push(p.id);
  }
  write('project_ids', ids);

  const sids = read('series_ids', []);
  for (const s of (bundle.series || [])) {
    write(`series_meta_${s.id}`, s.meta);
    if (s.config) write(`series_config_${s.id}`, s.config);
    if (!sids.includes(s.id)) sids.push(s.id);
  }
  write('series_ids', sids);

  if (bundle.settings) write('settings', bundle.settings);
  if (bundle.activeProjectId) write('active_project_id', bundle.activeProjectId);
  return bundle.projects.length;
}

export function upsertSeries(sid, meta, config) {
  write(`series_meta_${sid}`, meta);
  if (config) write(`series_config_${sid}`, config);
  const ids = read('series_ids', []);
  if (!ids.includes(sid)) { ids.push(sid); write('series_ids', ids); }
  return true;
}
export function saveSettings(settings) {
  return write('settings', settings);
}
