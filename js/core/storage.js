/* =========================================================
   Weaver — js/core/storage.js
   Step 4: namespaced localStorage engine.
   Handles projects, settings, and the "last active" resume state.
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

/* ---------- Project Schema ---------- */
function createBlankProject({ name = 'Untitled Project', scope = 'standalone', source = 'scratch' } = {}) {
  const now = Date.now();
  return {
    id: genId(),
    name,
    scope,      // 'standalone' | 'series'
    source,     // 'scratch' | 'upload'
    createdAt: now,
    updatedAt: now,
    manuscript: {
      text: '',
      // Paging engine state (Step 12 will use this)
      viewIndex: 0, 
    },
    mainNovel: {
      text: '',
    },
    // The 7-section Project Bible
    configBible: {
      characters: [],
      settings: [],
      plotArcs: [],
      worldRules: [],
      items: [],
      generalProse: '',
      generalAiInstructions: '',
    },
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
  // Sort by most recently updated first
  return projects.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getProject(id) {
  return read(`project_data_${id}`);
}

export function saveProject(project) {
  if (!project || !project.id) return false;
  
  const now = Date.now();
  project.updatedAt = now;

  // Save the heavy payload
  write(`project_data_${project.id}`, project);

  // Save lightweight metadata for the dashboard list
  const meta = {
    id: project.id,
    name: project.name,
    scope: project.scope,
    source: project.source,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    wordCount: (project.mainNovel?.text || '').trim().split(/\s+/).filter(Boolean).length,
  };
  write(`project_meta_${project.id}`, meta);

  // Ensure it's in the index list
  const ids = read('project_ids', []);
  if (!ids.includes(project.id)) {
    ids.push(project.id);
    write('project_ids', ids);
  }

  return true;
}

export function deleteProject(id) {
  remove(`project_data_${id}`);
  remove(`project_meta_${id}`);
  
  const ids = read('project_ids', []);
  const nextIds = ids.filter((x) => x !== id);
  write('project_ids', nextIds);

  if (getActiveProject() === id) {
    setActiveProject(null);
  }
  return true;
}

export function createProject(opts) {
  const project = createBlankProject(opts);
  saveProject(project);
  return project;
}

/* ---------- Active Project (Resume State) ---------- */
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
    theme: 'charcoal-gold', // Future-proofing for aesthetic toggles
    fontScale: 1.0,
    sentencesPerPage: 15,   // For Manuscript paging engine
    autosaveInterval: 3000, // ms
  },
  ai: {
    // Provider configs will be populated in Step 20
    providers: {
      groq: { key: '', enabled: false },
      openrouter: { key: '', enabled: false },
      gemini: { key: '', enabled: false },
      mistral: { key: '', enabled: false },
    },
    fallbackOrder: ['groq', 'openrouter', 'gemini', 'mistral'],
    activeModel: null,
  },
};

export function getSettings() {
  const saved = read('settings', {});
  // Deep merge with defaults to ensure new settings fields don't break older saves
  return {
    general: { ...DEFAULT_SETTINGS.general, ...(saved.general || {}) },
    ai: { 
      ...DEFAULT_SETTINGS.ai, 
      ...(saved.ai || {}),
      providers: { ...DEFAULT_SETTINGS.ai.providers, ...((saved.ai || {}).providers || {}) }
    },
  };
}

export function saveSettings(settings) {
  return write('settings', settings);
}
