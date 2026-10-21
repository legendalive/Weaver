/* =========================================================
   Weaver — js/features/cloud.js
   v2.0 Stage 6.3: Supabase Storage cloud sync.
   - CONTINUOUS AUTOSYNC: ~3s after any edit, the ACTIVE
     project (Main Novel + Config Bible, series-aware) is
     pushed quietly. Debounced; scoped to the open project.
   - Manual Backup/Restore = full two-way merge by updatedAt
     with the deletion ledger.
   - Per-user paths {userId}/weaver/… locked server-side.
   ========================================================= */
import { toast } from '../utils/dom.js';
import { getState, subscribe } from '../core/state.js';
import {
  listProjects, getProject, saveProject,
  listSeries, getSeries, getSeriesConfig, upsertSeries,
  readStore, writeStore,
} from '../core/storage.js';

/* ── Paste the SAME two values you used in js/auth/auth.js ── */
const SUPABASE_URL = 'https://hiqmvhkwuvvgalqxxtbc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpcW12aGt3dXZ2Z2FscXh4dGJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0MzQxOTMsImV4cCI6MjEwODAxMDE5M30.BgYJxwX7JFsrbKXeqhnS84rs7l9V1gWz9o-C5AZS8ls';
/* ─────────────────────────────────────────────────────────── */

const BUCKET = 'weaver-vault';
const LEDGER_KEY = 'weaver_sync_ledger';
const AUTOSYNC_DELAY = 3000;

let sb = null;
let sbLoadPromise = null;
let cachedUid = null;
let syncing = false;
let pushing = false;
let autoTimer = null;

function configured() {
  return /^https:\/\//.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20;
}
export function isCloudConfigured() { return configured(); }

function loadScript() {
  return new Promise((resolve, reject) => {
    if (window.supabase) return resolve();
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the Supabase script.'));
    document.head.appendChild(s);
  });
}

async function getClient() {
  if (sb) return sb;
  if (!sbLoadPromise) {
    sbLoadPromise = (async () => {
      await loadScript();
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      return sb;
    })();
  }
  return sbLoadPromise;
}

async function userId() {
  if (cachedUid) return cachedUid;
  const client = await getClient();
  const { data: { session } } = await client.auth.getSession();
  cachedUid = session?.user?.id || null;
  return cachedUid;
}

export async function getCloudUserEmail() {
  if (!configured()) return '';
  try {
    const client = await getClient();
    const { data: { session } } = await client.auth.getSession();
    return session?.user?.email || '';
  } catch { return ''; }
}

/* Storage path helper: {userId}/weaver/<rel> */
async function path(rel) {
  const uid = await userId();
  if (!uid) throw new Error('You are not signed in.');
  return `${uid}/weaver/${rel}`;
}

/* ---------- low-level storage ops ---------- */

async function getJson(rel) {
  const client = await getClient();
  const full = await path(rel);
  const { data, error } = await client.storage.from(BUCKET).download(full);
  if (error) {
    if (/not found/i.test(error.message || '')) return null;
    throw new Error(error.message || 'download failed');
  }
  const text = await data.text();
  try { return JSON.parse(text); } catch { return null; }
}

async function putJson(rel, obj) {
  const client = await getClient();
  const full = await path(rel);
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  const { error } = await client.storage.from(BUCKET).upload(full, blob, {
    upsert: true,
    contentType: 'application/json',
  });
  if (error) throw new Error(error.message || 'upload failed');
}

async function removeRel(rel) {
  const client = await getClient();
  const full = await path(rel);
  const { error } = await client.storage.from(BUCKET).remove([full]);
  if (error) throw new Error(error.message || 'delete failed');
}

/* ---------- ledger (deletion memory) ---------- */
function readLedger() {
  const l = readStore(LEDGER_KEY, null);
  return (l && Array.isArray(l.projects)) ? l : { projects: [], series: [] };
}
function writeLedger(l) { writeStore(LEDGER_KEY, l); }

/* ---------- connect check ---------- */
export async function connectCloud() {
  if (!configured()) throw new Error('Cloud sync is not configured (paste your Supabase URL + anon key into js/features/cloud.js).');
  const uid = await userId();
  if (!uid) throw new Error('You are not signed in.');
  return { userId: uid };
}

/* =========================================================
   CONTINUOUS AUTOSYNC — save as they write
   ========================================================= */

/* Debounced: every edit resets the timer; the push fires ~3s
   after typing stops. Exported so config-bible.js can call it. */
export function scheduleCloudSave() {
  if (!configured()) return;
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => pushActiveProject({ quiet: true }), AUTOSYNC_DELAY);
}

async function pushActiveProject({ quiet = true } = {}) {
  if (pushing || syncing) return;
  if (!configured()) return;
  const project = getState().project;
  if (!project || !project.id) return;
  pushing = true;
  try {
    const uid = await userId();
    if (!uid) return;

    /* The project object already carries mainNovel.text AND
       configBible, so one blob always holds BOTH (Backlog 6.7). */
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
    await putJson(`projects/${project.id}.json`, { id: project.id, data: project, meta });

    /* Series books share one bible — keep it fresh too. */
    if (project.seriesId) {
      const sm = getSeries(project.seriesId);
      if (sm) {
        await putJson(`series/${project.seriesId}.json`, {
          id: project.seriesId, meta: sm, config: getSeriesConfig(project.seriesId),
        });
      }
    }

    /* Patch the index (read-modify-write, single project). */
    const idx = (await getJson('index.json')) || { projects: {}, series: {} };
    idx.projects = idx.projects || {};
    idx.series = idx.series || {};
    idx.projects[project.id] = { updatedAt: project.updatedAt, name: project.name };
    if (project.seriesId) {
      const sm = getSeries(project.seriesId);
      if (sm) idx.series[project.seriesId] = { updatedAt: sm.updatedAt, name: sm.name };
    }
    idx.updatedAt = Date.now();
    await putJson('index.json', idx);

    /* Keep the deletion ledger aware of what we've pushed. */
    const ledger = readLedger();
    if (!ledger.projects.includes(project.id)) ledger.projects.push(project.id);
    if (project.seriesId && !ledger.series.includes(project.seriesId)) ledger.series.push(project.seriesId);
    writeLedger(ledger);
  } catch (e) {
    if (!quiet) toast('Cloud save failed: ' + e.message, 'danger');
  } finally {
    pushing = false;
  }
}

/* Every project edit (manuscript autosave, Accept, Recheck…) reschedules. */
subscribe((state, change) => {
  if (change.project) scheduleCloudSave();
});

/* Best effort: push the moment the tab is hidden (phone switch, tab hop). */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && configured()) {
    clearTimeout(autoTimer);
    pushActiveProject({ quiet: true });
  }
});

/* =========================================================
   FULL TWO-WAY SYNC (Backup to cloud / Restore)
   ========================================================= */

export async function syncNow({ quiet = false } = {}) {
  if (syncing) {
    if (!quiet) toast('A sync is already running — give it a moment.', 'info');
    return false;
  }
  if (!configured()) {
    if (!quiet) toast('Cloud sync is not configured yet.', 'info');
    return false;
  }
  syncing = true;
  try {
    await connectCloud();

    let remoteIndex = { projects: {}, series: {} };
    const idx = await getJson('index.json');
    if (idx && typeof idx === 'object') remoteIndex = idx;

    const ledger = readLedger();
    const localIds = new Set(listProjects().map((pr) => pr.id));
    const localSeriesIds = new Set(listSeries().map((s) => s.id));
    const deletedProjects = ledger.projects.filter((id) => !localIds.has(id));
    const deletedSeries = ledger.series.filter((id) => !localSeriesIds.has(id));

    /* PULL: remote newer than local (skip intentional deletions) */
    let pulled = 0;
    for (const [id, info] of Object.entries(remoteIndex.projects || {})) {
      if (deletedProjects.includes(id)) continue;
      const lm = listProjects().find((pr) => pr.id === id);
      if (!lm || lm.updatedAt < info.updatedAt) {
        const obj = await getJson(`projects/${id}.json`);
        if (obj && obj.data) { saveProject(obj.data); pulled++; }
      }
    }
    for (const [id, info] of Object.entries(remoteIndex.series || {})) {
      if (deletedSeries.includes(id)) continue;
      const ls = listSeries().find((s) => s.id === id);
      if (!ls || ls.updatedAt < info.updatedAt) {
        const obj = await getJson(`series/${id}.json`);
        if (obj && obj.meta) { upsertSeries(obj.id, obj.meta, obj.config); pulled++; }
      }
    }

    /* PUSH: local newer than remote index */
    let pushed = 0;
    for (const m of listProjects()) {
      const ri = (remoteIndex.projects || {})[m.id];
      if (!ri || ri.updatedAt < m.updatedAt) {
        await putJson(`projects/${m.id}.json`, { id: m.id, data: getProject(m.id), meta: m });
        pushed++;
      }
    }
    for (const s of listSeries()) {
      const ri = (remoteIndex.series || {})[s.id];
      if (!ri || ri.updatedAt < s.updatedAt) {
        await putJson(`series/${s.id}.json`, { id: s.id, meta: s, config: getSeriesConfig(s.id) });
        pushed++;
      }
    }

    /* DELETE remotely: locally deleted but still in the remote index */
    let deletedCount = 0;
    for (const id of deletedProjects) {
      if ((remoteIndex.projects || {})[id]) { await removeRel(`projects/${id}.json`); deletedCount++; }
    }
    for (const id of deletedSeries) {
      if ((remoteIndex.series || {})[id]) { await removeRel(`series/${id}.json`); deletedCount++; }
    }

    /* Fresh index */
    const finalIndex = { projects: {}, series: {}, updatedAt: Date.now() };
    for (const m of listProjects()) finalIndex.projects[m.id] = { updatedAt: m.updatedAt, name: m.name };
    for (const s of listSeries()) finalIndex.series[s.id] = { updatedAt: s.updatedAt, name: s.name };
    await putJson('index.json', finalIndex);

    writeLedger({
      projects: listProjects().map((pr) => pr.id),
      series: listSeries().map((s) => s.id),
    });

    if (!quiet) {
      const parts = [];
      if (pushed > 0) parts.push(`${pushed} pushed`);
      if (pulled > 0) parts.push(`${pulled} pulled`);
      if (deletedCount > 0) parts.push(`${deletedCount} removed`);
      toast(parts.length ? `Synced: ${parts.join(', ')}.` : 'Sync complete — already up to date.', 'success');
    }
    return true;
  } catch (e) {
    if (!quiet) toast('Cloud sync failed: ' + e.message, 'danger');
    return false;
  } finally {
    syncing = false;
  }
}

/* Fire-and-forget full sync, still used as the Library-exit safety net. */
export function autoSync() {
  if (!configured()) return;
  syncNow({ quiet: true });
}

/* Sign out via this client, then hard-reload to the auth screen. */
export async function signOutAndReload() {
  try {
    const client = await getClient();
    await client.auth.signOut();
  } catch (e) {
    console.warn('[Cloud] signOut:', e);
  }
  location.reload();
}
