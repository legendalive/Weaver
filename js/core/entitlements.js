/* =========================================================
Weaver — js/core/entitlements.js
V3.2a: paywall entitlement lookup.
Reads the signed-in user's own row from public.entitlements
(RLS: users may SELECT their own row only). Caches the result
and exposes isPro() for the gates that arrive in V3.2b.
Fail-safe: if the lookup errors we treat the user as FREE but
never block local writing. Gates only enforce once loaded.
========================================================= */
import { getSupabaseClient, supabaseConfigured } from './supabase.js';

let ent = null;      // cached entitlement row (or null)
let loaded = false;
const listeners = new Set();

export function onEntitlementChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function emit() { for (const cb of listeners) { try { cb(ent); } catch {} } }

/* Fetch + cache the caller's entitlement. Safe to call repeatedly. */
export async function loadEntitlement(userId) {
  if (!supabaseConfigured() || !userId) {
    ent = null; loaded = true; emit(); return ent;
  }
  try {
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('entitlements')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    ent = data || null;
  } catch (e) {
    console.warn('[Entitlements] lookup failed:', e.message);
    ent = null; // fail-safe: never crash the app over a paywall read
  }
  loaded = true;
  emit();
  return ent;
}

export function getEntitlement() { return ent; }
export function entitlementLoaded() { return loaded; }

/* Pro = permanent plan, or time-limited pro_until still in the future. */
export function isPro() {
  if (!ent) return false;
  if (ent.plan === 'pro') return true;
  if (ent.pro_until) {
    const t = Date.parse(ent.pro_until);
    if (Number.isFinite(t) && t > Date.now()) return true;
  }
  return false;
}

/* Gates should only BLOCK when we positively know the user is free.
   While the lookup is in flight we allow, so nobody is locked out by latency. */
export function isKnownFree() { return loaded && !isPro(); }

export function proUntilLabel() {
  if (!ent || !ent.pro_until) return '';
  try { return new Date(ent.pro_until).toLocaleDateString(); } catch { return ''; }
}
