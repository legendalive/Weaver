/* =========================================================
   Weaver — js/features/cloud.js
   v2.0 Stage 5: Supabase Storage cloud sync.
   Two-way merge by updatedAt; deletion propagation via the
   local sync ledger; mutex; honest errors.
   Every file lives in the signed-in user's own folder
   ({userId}/weaver/…) — locked server-side by bucket policy,
   so one user can never read another's vault.
   Keeps its own Supabase client (shares the login session
   automatically via the browser), so no secrets move between
   modules.
   ========================================================= */
import { toast } from '../utils/dom.js';
import { getState } from '../core/state.js';
import {
  listProjects, getProject, saveProject,
  listSeries, getSeriesConfig, upsertSeries,
  readStore, writeStore,
} from '../core/storage.js';

/* ── Paste the SAME two values you used in js/auth/auth.js ── */
const SUPABASE_URL = 'https://hiqmvhkwuvvgalqxxtbc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpcW12aGt3dXZ2Z2FscXh4dGJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0MzQxOTMsImV4cCI6MjEwODAxMDE5M30.BgYJxwX7JFsrbKXeqhnS84rs7l9V1gWz9o-C5AZS8ls';
/* ─────────────────────────────────────────────────────────── */

const BUCKET = 'weaver-vault';
const LEDGER_KEY = 'weaver_sync_ledger';

let sb = null;
let sbLoadPromise = null;
let cachedUid = null;

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

/* Signed-in user id (from the shared session) — builds per-user paths. */
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
    if (/not found/i.test(error.message || '')) return null; // not uploaded yet
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

/* ---------- two-way sync (mutex + deletions) ---------- */
let syncing = false;

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

    // Read remote index
    let remoteIndex = { projects: {}, series: {} };
    const idx = await getJson('index.json');
    if (idx && typeof idx === 'object') remoteIndex = idx;

    // Deletions: known at last sync, gone locally now
    const ledger = readLedger();
    const localIds = new Set(listProjects().map((pr) => pr.id));
    const localSeriesIds = new Set(listSeries().map((s) => s.id));
    const deletedProjects = ledger.projects.filter((id) => !localIds.has(id));
    const deletedSeries = ledger.series.filter((id) => !localSeriesIds.has(id));

    // PULL: remote newer than local (skip intentional deletions)
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

    // PUSH: local newer than remote index
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

    // DELETE remotely: locally deleted but still in the remote index
    let deletedCount = 0;
    for (const id of deletedProjects) {
      if ((remoteIndex.projects || {})[id]) { await removeRel(`projects/${id}.json`); deletedCount++; }
    }
    for (const id of deletedSeries) {
      if ((remoteIndex.series || {})[id]) { await removeRel(`series/${id}.json`); deletedCount++; }
    }

    // Write fresh index
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

/* Fire-and-forget, used on Library exit */
export function autoSync() {
  if (!configured()) return;
  const c = getState().settings.cloud || {};
  if (c.autoSync === false) return;
  syncNow({ quiet: true });
}

/* Sign out via this client, then hard-reload back to the auth screen.
   The session is shared in the browser, so this logs out the whole app. */
export async function signOutAndReload() {
  try {
    const client = await getClient();
    await client.auth.signOut();
  } catch (e) {
    console.warn('[Cloud] signOut:', e);
  }
  location.reload();
}
