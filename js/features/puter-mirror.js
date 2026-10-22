/* =========================================================
   Weaver — js/features/puter-mirror.js
   v2 Stage 6.1-final: Puter as OVERFLOW transport only.
   Pure auth + file transport; all orchestration (compression,
   failover decisions, library enumeration) lives in cloud.js.
   - No API keys, no CORS, no payment (User-Pays model).
   - Sign-in popup is triggered only when overflow is needed
     or the owner presses Connect/Copy in Settings.
   ========================================================= */

const PUTER_SRC = 'https://js.puter.com/v2/';
const MIRROR_ROOT = 'WeaverMirror';

let loadPromise = null;

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
  try { await puter().fs.mkdir(MIRROR_ROOT, { createMissingPaths: true }); } catch {}
  try { await puter().fs.mkdir(`${MIRROR_ROOT}/projects`, { createMissingPaths: true }); } catch {}
  try { await puter().fs.mkdir(`${MIRROR_ROOT}/series`, { createMissingPaths: true }); } catch {}
}

/* Sign in (popup) if needed and guarantee the folder tree. */
export async function connectPuter() {
  await loadPuter();
  if (!puter().auth.isSignedIn()) await puter().auth.signIn();
  await ensureRoot();
  return true;
}

export async function disconnectPuter() {
  try { if (window.puter) await puter().auth.signOut(); } catch {}
}

/* ---------- transport (Blob in, Blob out) ---------- */
export async function puterPut(rel, blob) {
  await loadPuter();
  await puter().fs.write(`${MIRROR_ROOT}/${rel}`, blob, {
    overwrite: true,
    createMissingPaths: true,
  });
}

export async function puterGet(rel) {
  try {
    await loadPuter();
    return await puter().fs.read(`${MIRROR_ROOT}/${rel}`);
  } catch {
    return null;
  }
}

export async function puterDel(rel) {
  try {
    await loadPuter();
    await puter().fs.delete(`${MIRROR_ROOT}/${rel}`);
  } catch { /* already gone */ }
}

export async function puterList(subdir) {
  try {
    await loadPuter();
    const items = await puter().fs.readdir(`${MIRROR_ROOT}/${subdir}`);
    return (items || []).map((i) => i.name).filter((n) => /\.json$/i.test(n));
  } catch {
    return [];
  }
}
