/* =========================================================
   Weaver — js/features/cloud.js
   v2 Stage 6.1-final: compressed, failover-aware cloud sync.
   V3.2b: Added isKnownFree gate to scheduleCloudSave.
   ========================================================= */
import { el, clear, toast } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { getState, subscribe } from '../core/state.js';
import {
  listProjects, getProject, saveProject,
  listSeries, getSeries, getSeriesConfig, upsertSeries,
  readStore, writeStore,
} from '../core/storage.js';
import { getSupabaseClient, supabaseConfigured } from '../core/supabase.js';
import {
  puterSignedIn, connectPuter, puterPut, puterGet, puterDel, puterList,
} from './puter-mirror.js';
import { isKnownFree } from '../core/entitlements.js';

const BUCKET = 'weaver-vault';
const LEDGER_KEY = 'weaver_sync_ledger';
const AUTOSYNC_DELAY = 3000;

let cachedUid = null;
let syncing = false;
let pushing = false;
let autoTimer = null;

function configured() { return supabaseConfigured(); }
export function isCloudConfigured() { return configured(); }

async function userId() {
  if (cachedUid) return cachedUid;
  const client = await getSupabaseClient();
  const { data: { session } } = await client.auth.getSession();
  cachedUid = session?.user?.id || null;
  return cachedUid;
}

export async function getCloudUserEmail() {
  if (!configured()) return '';
  try {
    const client = await getSupabaseClient();
    const { data: { session } } = await client.auth.getSession();
    return session?.user?.email || '';
  } catch { return ''; }
}

async function path(rel) {
  const uid = await userId();
  if (!uid) throw new Error('You are not signed in.');
  return `${uid}/weaver/${rel}`;
}

/* =========================================================
   COMPRESSION ENVELOPE (v2 gzip / v1 raw JSON, self-detecting)
   ========================================================= */
function canCompress() {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

async function packObject(obj) {
  const json = JSON.stringify(obj);
  if (!canCompress()) return new Blob([json], { type: 'application/json' });
  try {
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
    const gz = await new Response(stream).blob();
    return new Blob([gz], { type: 'application/x-weaver-gzip' });
  } catch {
    return new Blob([json], { type: 'application/json' });
  }
}

async function unpackBlob(blob) {
  if (!blob) return null;
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  try {
    if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      const text = await new Response(stream).text();
      return JSON.parse(text);
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/* =========================================================
   FAILOVER CLASSIFICATION
   Quota + network => fall over. Auth/permission => surface.
   ========================================================= */
function isFailoverError(e) {
  const msg = ((e && e.message) || '') + ' ' + String((e && e.statusCode) || (e && e.status) || '');
  return /quota|exceeded|insufficient storage|507|failed to fetch|network|load failed|timeout|abort/i.test(msg);
}

/* ---------- Supabase primitives ---------- */
async function supabaseUpload(rel, blob) {
  const client = await getSupabaseClient();
  const full = await path(rel);
  const { error } = await client.storage.from(BUCKET).upload(full, blob, {
    upsert: true,
    contentType: blob.type || 'application/octet-stream',
  });
  if (error) throw new Error(error.message || 'upload failed');
}

async function supabaseDownload(rel) {
  const client = await getSupabaseClient();
  const full = await path(rel);
  const { data, error } = await client.storage.from(BUCKET).download(full);
  if (error) {
    if (/not found/i.test(error.message || '')) return null;
    throw new Error(error.message || 'download failed');
  }
  return data;
}

async function supabaseRemove(rel) {
  const client = await getSupabaseClient();
  const full = await path(rel);
  const { error } = await client.storage.from(BUCKET).remove([full]);
  if (error && !/not found/i.test(error.message || '')) {
    throw new Error(error.message || 'delete failed');
  }
}

/* ---------- orchestrated blob ops ---------- */
async function putBlob(rel, obj) {
  const blob = await packObject(obj);
  if (configured()) {
    try {
      await supabaseUpload(rel, blob);
      /* Primary healthy: retire any stale overflow copy (quiet). */
      if (puterSignedIn()) puterDel(rel);
      return 'cloud';
    } catch (e) {
      if (!isFailoverError(e)) throw e;
    }
  }
  await connectPuter(); /* popup only if overflow is genuinely needed */
  await puterPut(rel, blob);
  return 'overflow';
}

async function getBlob(rel) {
  if (configured()) {
    try {
      const blob = await supabaseDownload(rel);
      if (blob) return unpackBlob(blob);
    } catch (e) {
      if (!isFailoverError(e)) throw e;
      /* unreachable: fall through to overflow */
    }
  }
  if (puterSignedIn()) {
    const blob = await puterGet(rel);
    if (blob) return unpackBlob(blob);
  }
  return null;
}

async function removeBlob(rel) {
  /* Deletions are ledger-driven and best-effort everywhere. */
  if (configured()) {
    try { await supabaseRemove(rel); } catch (e) { console.warn('[Cloud] primary delete:', e); }
  }
  if (puterSignedIn()) await puterDel(rel);
}

/* ---------- ledger ---------- */
function readLedger() {
  const l = readStore(LEDGER_KEY, null);
  return (l && Array.isArray(l.projects)) ? l : { projects: [], series: [] };
}
function writeLedger(l) { writeStore(LEDGER_KEY, l); }

export async function connectCloud() {
  if (!configured()) throw new Error('Cloud sync is not configured (paste your Supabase URL + anon key into js/core/supabase.js).');
  const uid = await userId();
  if (!uid) throw new Error('You are not signed in.');
  return { userId: uid };
}

/* =========================================================
   CLOUD-SAVE BADGE — Main Novel panel header
   ========================================================= */
const BADGE_STYLE_ID = 'cloud-badge-style';
const BADGE_CSS = `.cloud-badge{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;border:1px solid var(--border);background:var(--surface);color:var(--faint);font-size:.66rem;font-family:var(--font-mono);white-space:nowrap;pointer-events:none;flex:none;transition:color .3s ease,border-color .3s ease;} .cloud-badge.is-ok{color:var(--success);border-color:rgba(127,176,105,.45);} .cloud-badge.is-overflow{color:var(--accent);border-color:rgba(224,168,60,.5);} .cloud-badge.is-error{color:var(--danger);border-color:rgba(212,96,79,.45);} .cloud-badge .icon{width:11px;height:11px;} .cloud-badge[hidden]{display:none;}`;

let lastStamp = null;
let lastDest = 'cloud';
let lastError = false;

function ensureBadgeStyle() {
  if (!document.getElementById(BADGE_STYLE_ID)) {
    const s = document.createElement('style');
    s.id = BADGE_STYLE_ID;
    s.textContent = BADGE_CSS;
    document.head.appendChild(s);
  }
}

function renderBadgeInto(host) {
  let b = host.querySelector('.cloud-badge');
  if (!lastStamp && !lastError) {
    if (b) b.hidden = true;
    return;
  }
  if (!b) {
    b = el('span', { class: 'cloud-badge' });
    host.insertBefore(b, host.firstChild);
  }
  b.hidden = false;
  clear(b);
  if (lastError) {
    b.classList.add('is-error');
    b.classList.remove('is-ok', 'is-overflow');
    b.append(icon('alert', 'icon-sm'), el('span', { text: 'cloud save failed' }));
  } else if (lastDest === 'overflow') {
    b.classList.add('is-overflow');
    b.classList.remove('is-ok', 'is-error');
    b.append(icon('check', 'icon-sm'), el('span', { text: `saved via Puter · ${lastStamp}` }));
  } else {
    b.classList.add('is-ok');
    b.classList.remove('is-error', 'is-overflow');
    b.append(icon('check', 'icon-sm'), el('span', { text: `saved  · ${lastStamp}` }));
  }
}

function refreshBadge() {
  if (getState().view !== 'workspace') return;
  ensureBadgeStyle();
  const host = document.querySelector('.panel[data-panel="novel"] .panel-actions');
  if (host) renderBadgeInto(host);
}

function stampBadge(dest) {
  lastStamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  lastDest = dest || 'cloud';
  lastError = false;
  refreshBadge();
}

function failBadge() {
  lastError = true;
  refreshBadge();
}

/* =========================================================
   CONTINUOUS AUTOSYNC
   ========================================================= */
export function scheduleCloudSave() {
  if (!configured() && !puterSignedIn()) return;
  if (isKnownFree()) return; // V3.2b: Free users are local-only
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => pushActiveProject({ quiet: true }), AUTOSYNC_DELAY);
}

function buildIndex() {
  const finalIndex = { projects: {}, series: {}, updatedAt: Date.now() };
  for (const m of listProjects()) finalIndex.projects[m.id] = { updatedAt: m.updatedAt, name: m.name };
  for (const s of listSeries()) finalIndex.series[s.id] = { updatedAt: s.updatedAt, name: s.name };
  return finalIndex;
}

async function pushActiveProject({ quiet = true } = {}) {
  if (pushing || syncing) return;
  const project = getState().project;
  if (!project || !project.id) return;
  pushing = true;
  let dest = 'cloud';
  try {
    const uid = await userId();
    if (!uid) return;

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
    dest = await putBlob(`projects/${project.id}.json`, { id: project.id, data: project, meta });

    if (project.seriesId) {
      const sm = getSeries(project.seriesId);
      if (sm) {
        dest = await putBlob(`series/${project.seriesId}.json`, {
          id: project.seriesId, meta: sm, config: getSeriesConfig(project.seriesId),
        });
      }
    }

    const idx = (await getBlob('index.json')) || { projects: {}, series: {} };
    idx.projects = idx.projects || {};
    idx.series = idx.series || {};
    idx.projects[project.id] = { updatedAt: project.updatedAt, name: project.name };
    if (project.seriesId) {
      const sm = getSeries(project.seriesId);
      if (sm) idx.series[project.seriesId] = { updatedAt: sm.updatedAt, name: sm.name };
    }
    idx.updatedAt = Date.now();
    dest = await putBlob('index.json', idx);

    const ledger = readLedger();
    if (!ledger.projects.includes(project.id)) ledger.projects.push(project.id);
    if (project.seriesId && !ledger.series.includes(project.seriesId)) ledger.series.push(project.seriesId);
    writeLedger(ledger);

    stampBadge(dest);
  } catch (e) {
    failBadge();
    if (!quiet) toast('Cloud save failed: ' + e.message, 'danger');
  } finally {
    pushing = false;
  }
}

subscribe((state, change) => {
  if (change.project) scheduleCloudSave();
  if (change.project || change.view) requestAnimationFrame(refreshBadge);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && (configured() || puterSignedIn())) {
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
  if (!configured() && !puterSignedIn()) {
    if (!quiet) toast('Cloud sync is not configured yet.', 'info');
    return false;
  }
  syncing = true;
  let dest = 'cloud';
  try {
    if (configured()) await connectCloud();

    let remoteIndex = { projects: {}, series: {} };
    const idx = await getBlob('index.json');
    if (idx && typeof idx === 'object') remoteIndex = idx;

    const ledger = readLedger();
    const localIds = new Set(listProjects().map((pr) => pr.id));
    const localSeriesIds = new Set(listSeries().map((s) => s.id));
    const deletedProjects = ledger.projects.filter((id) => !localIds.has(id));
    const deletedSeries = ledger.series.filter((id) => !localSeriesIds.has(id));

    let pulled = 0;
    for (const [id, info] of Object.entries(remoteIndex.projects || {})) {
      if (deletedProjects.includes(id)) continue;
      const lm = listProjects().find((pr) => pr.id === id);
      if (!lm || lm.updatedAt < info.updatedAt) {
        const obj = await getBlob(`projects/${id}.json`);
        if (obj && obj.data) { saveProject(obj.data); pulled++; }
      }
    }
    for (const [id, info] of Object.entries(remoteIndex.series || {})) {
      if (deletedSeries.includes(id)) continue;
      const ls = listSeries().find((s) => s.id === id);
      if (!ls || ls.updatedAt < info.updatedAt) {
        const obj = await getBlob(`series/${id}.json`);
        if (obj && obj.meta) { upsertSeries(obj.id, obj.meta, obj.config); pulled++; }
      }
    }

    let pushed = 0;
    for (const m of listProjects()) {
      const ri = (remoteIndex.projects || {})[m.id];
      if (!ri || ri.updatedAt < m.updatedAt) {
        dest = await putBlob(`projects/${m.id}.json`, { id: m.id, data: getProject(m.id), meta: m });
        pushed++;
      }
    }
    for (const s of listSeries()) {
      const ri = (remoteIndex.series || {})[s.id];
      if (!ri || ri.updatedAt < s.updatedAt) {
        dest = await putBlob(`series/${s.id}.json`, { id: s.id, meta: s, config: getSeriesConfig(s.id) });
        pushed++;
      }
    }

    let deletedCount = 0;
    for (const id of deletedProjects) {
      if ((remoteIndex.projects || {})[id]) { await removeBlob(`projects/${id}.json`); deletedCount++; }
    }
    for (const id of deletedSeries) {
      if ((remoteIndex.series || {})[id]) { await removeBlob(`series/${id}.json`); deletedCount++; }
    }

    dest = await putBlob('index.json', buildIndex());

    writeLedger({
      projects: listProjects().map((pr) => pr.id),
      series: listSeries().map((s) => s.id),
    });

    stampBadge(dest);

    if (!quiet) {
      const parts = [];
      if (pushed > 0) parts.push(`${pushed} pushed`);
      if (pulled > 0) parts.push(`${pulled} pulled`);
      if (deletedCount > 0) parts.push(`${deletedCount} removed`);
      const where = dest === 'overflow' ? ' (Puter overflow)' : '';
      toast(parts.length ? `Synced${where}: ${parts.join(', ')}.` : `Sync complete${where} — already up to date.`, 'success');
    }
    return true;
  } catch (e) {
    failBadge();
    if (!quiet) toast('Cloud sync failed: ' + e.message, 'danger');
    return false;
  } finally {
    syncing = false;
  }
}

export function autoSync() {
  if (!configured() && !puterSignedIn()) return;
  syncNow({ quiet: true });
}

/* =========================================================
   MANUAL OVERFLOW TOOLS (Settings ▸ Data & Storage)
   ========================================================= */
export async function copyAllToPuter() {
  await connectPuter();
  let n = 0;
  for (const m of listProjects()) {
    await puterPut(`projects/${m.id}.json`, await packObject({ id: m.id, data: getProject(m.id), meta: m }));
    n++;
  }
  for (const s of listSeries()) {
    await puterPut(`series/${s.id}.json`, await packObject({ id: s.id, meta: s, config: getSeriesConfig(s.id) }));
  }
  await puterPut('index.json', await packObject(buildIndex()));
  return n;
}

export async function restoreFromPuter() {
  await connectPuter();
  let pulled = 0;
  for (const name of await puterList('projects')) {
    const obj = await unpackBlob(await puterGet(`projects/${name}`));
    if (obj && obj.data) { saveProject(obj.data); pulled++; }
  }
  for (const name of await puterList('series')) {
    const obj = await unpackBlob(await puterGet(`series/${name}`));
    if (obj && obj.meta) upsertSeries(obj.id, obj.meta, obj.config);
  }
  return pulled;
}

export async function signOutAndReload() {
  try {
    const client = await getSupabaseClient();
    await client.auth.signOut();
  } catch (e) {
    console.warn('[Cloud] signOut:', e);
  }
  location.reload();
}
