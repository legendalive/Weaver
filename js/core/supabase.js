/* =========================================================
   Weaver — js/core/supabase.js
   v2 Stage 6.11: single shared Supabase client factory.
   ONE client for auth + storage + password reset, which
   eliminates the "Multiple GoTrueClient instances" warning.
   detectSessionInUrl is OFF so recovery URLs are intercepted
   manually by auth.js (see detectRecovery).
   ========================================================= */

/* ── PASTE YOUR SUPABASE CREDENTIALS HERE (single source of truth) ── */
export const SUPABASE_URL = 'https://hiqmvhkwuvvgalqxxtbc.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpcW12aGt3dXZ2Z2FscXh4dGJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0MzQxOTMsImV4cCI6MjEwODAxMDE5M30.BgYJxwX7JFsrbKXeqhnS84rs7l9V1gWz9o-C5AZS8ls';
/* ─────────────────────────────────────────────────────────────────── */

let sb = null;
let loadPromise = null;

export function supabaseConfigured() {
  return /^https:\/\//.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20;
}

function loadSupabaseScript() {
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

/* The ONE shared client. */
export async function getSupabaseClient() {
  if (sb) return sb;
  if (!loadPromise) {
    loadPromise = (async () => {
      await loadSupabaseScript();
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { detectSessionInUrl: false },
      });
      return sb;
    })();
  }
  return loadPromise;
}
