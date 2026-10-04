/* =========================================================
   Weaver — js/features/cloud.js
   Step 28: GitHub private-repo sync (Git Data API, size-safe).
   - Two-way merge by updatedAt; every sync = one commit.
   - Refuses public repos. Token stays in this browser only.
   - Payload: projects + series bibles (settings stay local).
   ========================================================= */

import { toast } from '../utils/dom.js';
import { getState, updateSettings } from '../core/state.js';
import {
  listProjects, getProject, saveProject,
  listSeries, getSeriesConfig, upsertSeries,
} from '../core/storage.js';

const API = 'https://api.github.com';

async function gh(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); if (j && j.message) msg = j.message; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

function toB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function fromB64(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/* ---------- Connect / ensure ---------- */
export async function connectGithub(token, repo) {
  const me = await gh('/user', { token });
  let r;
  try {
    r = await gh(`/repos/${me.login}/${repo}`, { token });
  } catch (e) {
    if (!/Not Found/i.test(e.message)) throw e;
    try {
      r = await gh('/user/repos', { method: 'POST', token, body: { name: repo, private: true, auto_init: false } });
    } catch (e2) {
      throw new Error(
        `Repo "${repo}" is not accessible to this token and the token cannot create it. ` +
        `Fix: create a PRIVATE repo named "${repo}" at github.com/new, then edit the token → ` +
        `Repository access → select it, and Permissions → Contents: Read and write.`
      );
    }
  }
  if (!r.private) {
    throw new Error(`"${repo}" is PUBLIC. Novels sync only to private repos — make it private or choose another name.`);
  }
  /* Permission probe: 404 = empty repo (fine), 403 = missing Contents permission */
  try {
    await gh(`/repos/${me.login}/${repo}/contents/`, { token });
  } catch (e) {
    if (/not accessible|403/i.test(e.message)) {
      throw new Error('Token lacks Contents permission on this repo. Edit the token → Permissions → Repository permissions → Contents: Read and write → Save.');
    }
  }
  return { owner: me.login, branch: r.default_branch || 'main' };
}

/* ---------- Remote tree ---------- */
async function readRemote(ctx) {
  let ref;
  try {
    ref = await gh(`/repos/${ctx.owner}/${ctx.repo}/git/ref/heads/${ctx.branch}`, { token: ctx.token });
  } catch {
    return { ...ctx, commitSha: null, treeSha: null, byPath: {} };
  }
  const commit = await gh(`/repos/${ctx.owner}/${ctx.repo}/git/commits/${ref.object.sha}`, { token: ctx.token });
  const tree = await gh(`/repos/${ctx.owner}/${ctx.repo}/git/trees/${commit.tree.sha}?recursive=1`, { token: ctx.token });
  const byPath = {};
  for (const t of tree.tree) if (t.type === 'blob' && t.path.startsWith('weaver/')) byPath[t.path] = t.sha;
  return { ...ctx, commitSha: commit.sha, treeSha: commit.tree.sha, byPath };
}

async function readBlob(ctx, sha) {
  const b = await gh(`/repos/${ctx.owner}/${ctx.repo}/git/blobs/${sha}`, { token: ctx.token });
  return JSON.parse(fromB64(b.content));
}

async function commitAll(ctx, files) {
  const items = [];
  for (const f of files) {
    const b = await gh(`/repos/${ctx.owner}/${ctx.repo}/git/blobs`, {
      method: 'POST', token: ctx.token,
      body: { content: toB64(JSON.stringify(f.obj)), encoding: 'base64' },
    });
    items.push({ path: f.path, mode: '100644', type: 'blob', sha: b.sha });
  }
  const treeBody = { tree: items };
  if (ctx.treeSha) treeBody.base_tree = ctx.treeSha;
  const tree = await gh(`/repos/${ctx.owner}/${ctx.repo}/git/trees`, { method: 'POST', token: ctx.token, body: treeBody });
  const commitBody = { message: `Weaver sync ${new Date().toISOString()}`, tree: tree.sha };
  if (ctx.commitSha) commitBody.parents = [ctx.commitSha];
  const commit = await gh(`/repos/${ctx.owner}/${ctx.repo}/git/commits`, { method: 'POST', token: ctx.token, body: commitBody });
  if (ctx.commitSha) {
    await gh(`/repos/${ctx.owner}/${ctx.repo}/git/refs/heads/${ctx.branch}`, { method: 'PATCH', token: ctx.token, body: { sha: commit.sha } });
  } else {
    await gh(`/repos/${ctx.owner}/${ctx.repo}/git/refs`, { method: 'POST', token: ctx.token, body: { ref: `refs/heads/${ctx.branch}`, sha: commit.sha } });
  }
}

/* ---------- Two-way sync ---------- */
export async function syncNow({ quiet = false } = {}) {
  const g = getState().settings.github || {};
  if (!g.token || !g.repo) {
    if (!quiet) toast('Configure GitHub sync in Settings ▸ General first.', 'info');
    return false;
  }
  try {
    const base = await connectGithub(g.token, g.repo);
    const ctx = await readRemote(base);

    let remoteIndex = { projects: {}, series: {} };
    if (ctx.byPath['weaver/index.json']) remoteIndex = await readBlob(ctx, ctx.byPath['weaver/index.json']);

    /* PULL: remote newer than local */
    let pulled = 0;
    for (const [id, info] of Object.entries(remoteIndex.projects || {})) {
      const lm = listProjects().find((p) => p.id === id);
      const sha = ctx.byPath[`weaver/projects/${id}.json`];
      if (sha && (!lm || lm.updatedAt < info.updatedAt)) {
        const obj = await readBlob(ctx, sha);
        saveProject(obj.data);
        pulled++;
      }
    }
    for (const [id, info] of Object.entries(remoteIndex.series || {})) {
      const ls = listSeries().find((s) => s.id === id);
      const sha = ctx.byPath[`weaver/series/${id}.json`];
      if (sha && (!ls || ls.updatedAt < info.updatedAt)) {
        const obj = await readBlob(ctx, sha);
        upsertSeries(obj.id, obj.meta, obj.config);
        pulled++;
      }
    }

    /* PUSH: local newer than remote index */
    const pushFiles = [];
    for (const m of listProjects()) {
      const ri = (remoteIndex.projects || {})[m.id];
      if (!ri || ri.updatedAt < m.updatedAt) {
        pushFiles.push({ path: `weaver/projects/${m.id}.json`, obj: { id: m.id, data: getProject(m.id), meta: m } });
      }
    }
    for (const s of listSeries()) {
      const ri = (remoteIndex.series || {})[s.id];
      if (!ri || ri.updatedAt < s.updatedAt) {
        pushFiles.push({ path: `weaver/series/${s.id}.json`, obj: { id: s.id, meta: s, config: getSeriesConfig(s.id) } });
      }
    }

    const finalIndex = { projects: {}, series: {}, updatedAt: Date.now() };
    for (const m of listProjects()) finalIndex.projects[m.id] = { updatedAt: m.updatedAt, name: m.name };
    for (const s of listSeries()) finalIndex.series[s.id] = { updatedAt: s.updatedAt, name: s.name };
    pushFiles.push({ path: 'weaver/index.json', obj: finalIndex });

    if (pushFiles.length) await commitAll(ctx, pushFiles);

    if (!quiet) {
      const pushed = Math.max(0, pushFiles.length - 1);
      toast(pushed || pulled ? `Synced: ${pushed} pushed, ${pulled} pulled.` : 'Sync complete — already up to date.', 'success');
    }
    return true;
  } catch (e) {
    if (!quiet) toast('GitHub sync failed: ' + e.message, 'danger');
    return false;
  }
}

/* Fire-and-forget, used on Library exit */
export function autoSync() {
  const g = getState().settings.github || {};
  if (g.token && g.repo && g.autoSync !== false) syncNow({ quiet: true });
}
