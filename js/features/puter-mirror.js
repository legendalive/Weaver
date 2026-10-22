/* =========================================================
   Weaver — js/features/puter-mirror.js
   v2 Stage 6.1: secondary cloud MIRROR on Puter.js.
   Supabase remains the source of truth; Puter holds a redundant
   copy of every project/series/index blob under WeaverMirror/.
   - No API keys, no CORS rules, no payment (User-Pays model:
     each user's own Puter account covers their storage).
   - Mirror writes are fire-and-forget; failures are silent
     (console.warn) and never block the primary sync.
   - "Restore from mirror" pulls everything back into local
     storage (used if Supabase is ever unreachable/empty).
   ========================================================= */
import { toast } from '../utils/dom.js';
import { getState, subscribe } from '../core/state.js';
import {
  listProjects, getProject, saveProject,
  listSeries, getSeries, getSeriesConfig, upsertSeries,
} from '../core/storage.js';

const PUTER_SRC = 'https://js.puter.com/v2/';
const MIRROR_ROOT = 'WeaverMirror';
const MIRROR_DELAY = 4000;

let loadPromise = null;
let mirrorTimer = null;
let pushing = false;

function puter() { return window.puter; }

function loadPuter() {
  return new Promise((resolve, reject) => {
    if (window.puter) return resolve();
    const s = document.createElement('script');
    s.src = PUTER_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the Puter script.'));
    document.head.appendChild(s);
  });
}

export function puterSignedIn() {
  try { return Boolean(window.puter && puter().auth && puter().auth.isSignedIn()); }
  catch { return false; }
}

async function ensureRoot() {
  try { await puter().fs.mkdir(MIRROR_ROOT, { createMissingPaths: true }); }
  catch { /* already exists */ }
  try { await puter().fs.mkdir(`${MIRROR_ROOT}/projects`, { createMissingPaths: true }); } catch {}
  try { await puter().fs.mkdir(`${MIRROR_ROOT}/series`, { createMissingPaths: true }); } catch {}
}

/* ---------- connect / disconnect ---------- */
export async function connectPuter() {
  await loadPuter();
  if (!puter().auth.isSignedIn()) await puter().auth.signIn();
  await ensureRoot();
  return true;
}

export async function disconnectPuter() {
  try { if (puter()) await puter().auth.signOut(); } catch {}
}

/* ---------- low-level mirror ops ---------- */
async function mirrorWrite(rel, obj) {
  await puter().fs.write(`${MIRROR_ROOT}/${rel}`, JSON.stringify(obj), {
    overwrite: true,
    createMissingPaths: true,
  });
}

async function mirrorRead(rel) {
  try {
    const blob = await puter().fs.read(`${MIRROR_ROOT}/${rel}`);
    const text = typeof blob === 'string' ? blob : await blob.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/* ---------- mirror the active project (debounced) ---------- */
export function scheduleMirror() {
  if (!puterSignedIn()) return;
  clearTimeout(mirrorTimer);
  mirrorTimer = setTimeout(() => mirrorActiveProject(), MIRROR_DELAY);
}

async function mirrorActiveProject() {
  if (pushing || !puterSignedIn()) return;
  const project = getState().project;
  if (!project || !project.id) return;
  pushing = true;
  try {
    await mirrorWrite(`projects/${project.id}.json`, { id: project.id, data: project, meta: { id: project.id, name: project.name, updatedAt: project.updatedAt } });
    if (project.seriesId) {
      const sm = getSeries(project.seriesId);
      if (sm) await mirrorWrite(`series/${project.seriesId}.json`, { id: project.seriesId, meta: sm, config: getSeriesConfig(project.seriesId) });
    }
    const idx = (await mirrorRead('index.json')) || { projects: {}, series: {} };
    idx.projects = idx.projects || {};
    idx.projects[project.id] = { updatedAt: project.updatedAt, name: project.name };
    idx.updatedAt = Date.now();
    await mirrorWrite('index.json', idx);
  } catch (e) {
    console.warn('[Mirror] push failed:', e);
  } finally {
    pushing = false;
  }
}

/* ---------- full mirror (everything, now) ---------- */
export async function mirrorNow() {
  await loadPuter();
  if (!puter().auth.isSignedIn()) await puter().auth.signIn();
  await ensureRoot();
  let n = 0;
  for (const m of listProjects()) {
    await mirrorWrite(`projects/${m.id}.json`, { id: m.id, data: getProject(m.id), meta: m });
    n++;
  }
  for (const s of listSeries()) {
    await mirrorWrite(`series/${s.id}.json`, { id: s.id, meta: s, config: getSeriesConfig(s.id) });
  }
  const finalIndex = { projects: {}, series: {}, updatedAt: Date.now() };
  for (const m of listProjects()) finalIndex.projects[m.id] = { updatedAt: m.updatedAt, name: m.name };
  for (const s of listSeries()) finalIndex.series[s.id] = { updatedAt: s.updatedAt, name: s.name };
  await mirrorWrite('index.json', finalIndex);
  return n;
}

/* ---------- restore everything from the mirror ---------- */
export async function restoreFromMirror() {
  await loadPuter();
  if (!puter().auth.isSignedIn()) await puter().auth.signIn();
  let pulled = 0;
  const projDir = await puter().fs.readdir(`${MIRROR_ROOT}/projects`).catch(() => []);
  for (const item of projDir || []) {
    if (!/\.json$/i.test(item.name)) continue;
    const obj = await mirrorRead(`projects/${item.name}`);
    if (obj && obj.data) { saveProject(obj.data); pulled++; }
  }
  const serDir = await puter().fs.readdir(`${MIRROR_ROOT}/series`).catch(() => []);
  for (const item of serDir || []) {
    if (!/\.json$/i.test(item.name)) continue;
    const obj = await mirrorRead(`series/${item.name}`);
    if (obj && obj.meta) { upsertSeries(obj.id, obj.meta, obj.config); }
  }
  return pulled;
}

/* ---------- self-wiring: mirror as they write ---------- */
subscribe((state, change) => {
  if (change.project) scheduleMirror();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && puterSignedIn()) {
    clearTimeout(mirrorTimer);
    mirrorActiveProject();
  }
});
