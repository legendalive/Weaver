# Weaver V3 — Roadmap & Admin Build Plan

> Living document. Check items off as they land. Approved stack (2026-10-24):
> **Supabase Edge Functions** for ALL server-side work — admin dashboard,
> payment webhooks, AI proxy. One runtime end-to-end, no mid-V3 re-platform.
> Companion docs: `HANDOFFV2.md` (operating manual), `BACKLOG.md` (parking lot).

---

## 1. Decision record — why not Python/Streamlit/Retool?

| Candidate | Verdict |
|---|---|
| Streamlit / Gradio (Streamlit Cloud, HF Spaces) | Rejected. Great dashboards, but cannot host Stripe webhooks (V3.6) or the user-facing AI proxy (V3.4) — would force a mid-V3 platform switch (owner hard rule: end-to-end, no switching). Free tiers sleep; service_role would live with a third party. |
| Retool / Appsmith | Rejected. Third party holds the master key; weak fit for webhook/proxy phases; free tiers narrow. |
| Python app on Render/Railway/Fly | Rejected. Free tiers spin down or need a card; adds a fifth vendor; same webhook/proxy fit problem. |
| **Supabase Edge Functions** | ✅ Chosen. service_role never leaves Supabase; one home for admin + webhooks + AI proxy; deploys from GitHub web UI via one Action (access token minted in Supabase dashboard, stored as a GitHub secret); free tier ample at launch; UI is fully brandable HTML — a real product screen, not a dev console. |

## 2. Repo strategy

| Repo | Contains | Deploys to |
|---|---|---|
| `Weaver` (this one) | The app (GitHub Pages). All client code, docs. | legendalive.github.io/Weaver |
| `weaver-server` (new) | Every Edge Function: `admin` (V3.1), `stripe-webhook` + `create-checkout` (V3.6), `ai-proxy` (V3.4). Plus the deploy workflow. | `<project-ref>.functions.supabase.co` |

Rationale: main repo is uploaded wholesale to public Pages — server code must not ride along.

## 3. Admin dashboard spec (V3.1)

Branded Weaver admin (charcoal + script-gold W, Great Vibes mark), fully
responsive (owner tests desktop **and** phone), sign-in = owner's normal
Weaver account; server checks user id against OWNER_USER_ID.

**Tabs & features**

- [ ] Overview: user totals, signups 7/30d (bars, hand-rolled SVG — no chart lib), storage used, active last 7d, health, plan mix
- [ ] Users: search by email · create account · last sign-in / last sync · suspend (reversible) · delete (auth + vault wipe, double confirm) · send password-reset email
- [ ] Credits & plans: grant/revoke with reason + expiry · set Pro-until manually (Gumroad manual fulfillment) · quota boost · per-user credit history
- [ ] Storage: per-user vault size, object counts, largest first
- [ ] Audit log: every admin action, timestamped (table `admin_log`)
- [ ] Polish: mobile pass, danger-zone styling, empty states

**Privacy rule:** the dashboard exposes metadata (emails, dates, sizes,
counts) — it never displays manuscript content, even though service_role
technically could.

**Admin needs the owner didn't ask for (deliberately included):** suspend
before delete; audit trail; credit reasons/expiry; support password-reset
send; quota overrides; destructive-action confirms; GDPR-ready user wipe
(needed anyway by V3.5).

**Metrics policy:** business truth (users/storage/credits/revenue) comes
from Supabase inside the dashboard. Visitor counters (e.g. histats) are a
separate, optional client-side snippet — parked mini-step: paste `<script>`
tag into `index.html`, nothing else.

## 4. V3.1 steps

### V3.1a — Skeleton + login + Overview
- [ ] Files: `weaver-server/supabase/functions/admin/index.ts`, `weaver-server/.github/workflows/deploy-functions.yml`, `weaver-server/README.md`
- [ ] Manual adds: GitHub secret `SUPABASE_ACCESS_TOKEN`; replace `YOUR_PROJECT_REF` in the workflow; replace `PASTE_YOUR_USER_ID_HERE` in the function
- [ ] Verify: green Action → function URL → sign in → Overview numbers on desktop + phone

### V3.1b — Users tab
- [ ] Replace `index.ts` (full file): GoTrue admin API — list/search/create users, suspend (`ban_duration`), delete + vault wipe (`DELETE /storage/v1/object/<uid>` prefix), send recovery email
- [ ] Verify with a throwaway test account (create → suspend → delete)

### V3.1c — Credits & entitlements
- [ ] SQL (paste in Supabase SQL Editor): tables `entitlements` (user_id PK, plan, credits, pro_until, quota_mb, updated_at) + `credit_log` — RLS on, zero policies → only service_role can touch
- [ ] Replace `index.ts`: Credits tab — grant/revoke with reason, expiry, history
- [ ] Verify: grant yourself credits, see log row

### V3.1d — Storage & metrics
- [ ] Replace `index.ts`: per-user storage sizes (storage.objects via PostgREST), signups chart, active users, CSV export of user list
- [ ] Verify numbers against Supabase dashboard Storage view

### V3.1e — Audit log + polish
- [ ] SQL: table `admin_log`; replace `index.ts` (log every mutating action, show Audit tab); mobile QA pass
- [ ] V3.1 DONE → report → V3.6

## 5. V3.6 — Payments (Stripe first, PayPal parked)

- [ ] Stripe account (browser): products Weaver Pro monthly + yearly; copy keys
- [ ] SQL: none new (entitlements from V3.1c is the ledger)
- [ ] `weaver-server/supabase/functions/create-checkout/index.ts` — creates Stripe Checkout Session (owner's Stripe secret key as function secret via Action)
- [ ] `weaver-server/supabase/functions/stripe-webhook/index.ts` — verifies signature, on `checkout.session.completed` / `invoice.paid` / `customer.subscription.deleted` writes entitlements; webhook secret as function secret
- [ ] App side: Settings → "Upgrade" button → checkout; success/cancel redirect URLs back to the app
- [ ] Test-mode-first verification checklist before live keys
- [ ] PayPal: parked — revisit only if demand appears
- [ ] Manual adds flagged per step: Stripe keys, webhook signing secret, price IDs

## 6. V3.2 — Paywall

- [ ] SQL: RLS policy letting a user SELECT **only their own** entitlements row (no writes from client)
- [ ] App: entitlement fetch at boot + after checkout return; gate cloud sync + AI behind plan/pro_until/credits; free tier keeps local writing/export 100% intact
- [ ] Upgrade surface: hero-level CTA style (prominent, gold), pricing modal, honest free-vs-pro table
- [ ] Grace rules: expired mid-session → warn, never destroy work; local-only mode always available

## 7. V3.4 — Centralized AI keys

- [ ] `weaver-server/supabase/functions/ai-proxy/index.ts` — owner's provider keys as function secrets; streams back; enforces entitlement; meters into SQL table `ai_usage` (user_id, provider, model, tokens, day)
- [ ] App: `js/ai/manager.js` refactor — entitled users hit the proxy; per-user key Settings UI retired (migration note for existing key holders)
- [ ] Admin: AI spend tab reads `ai_usage`
- [ ] Manual adds flagged: each provider key, set via GitHub Action secrets step

## 8. V3.3 — Plot Builder (paid)

- [ ] Design doc first (BACKLOG rule): fourth panel vs modal vs Config tab; beats, arcs, tension map; free = manual scaffolding, paid = AI-assisted via the V3.4 proxy
- [ ] Build in small steps after design sign-off

## 9. V3.5 — EU domain

- [ ] Options: free subdomains (eu.org, is-a.dev) vs cheap .eu/.de (~€5/yr)
- [ ] Pages CNAME + DNS; update Supabase Auth redirect URLs (reset links depend on this — HANDOFF landmine #3)
- [ ] GDPR pass: privacy notice, the user-wipe action from V3.1b becomes the deletion workflow

## 10. Delivery conventions (standing rules, repeated here so they survive)

- Every delivered code block states its **exact file path** at the top.
- Every step ends with a **manual-adds list** — anything the owner must paste (keys, URLs, refs, tokens, SQL) is named explicitly; nothing is silently hardcoded.
- Max 3 files per step, full replacements preferred; owner pastes by hand.
- Owner verifies desktop + phone and reports before the next step.
- Ideas park in `docs/BACKLOG.md`, never in conversation.

## 11. Secrets registry (what lives where — keep current)

| Secret | Lives in | Set via |
|---|---|---|
| Supabase URL + anon key | `js/core/supabase.js` (public by design) | hand-paste (already done) |
| Supabase access token (deploy) | `weaver-server` GitHub secret `SUPABASE_ACCESS_TOKEN` | GitHub web UI |
| Project ref | `deploy-functions.yml` (not secret) | hand-edit |
| OWNER_USER_ID | `admin/index.ts` constant (an ID, not a credential) | hand-edit |
| service_role | NEVER in any file — auto-injected into functions by Supabase | nothing to do |
| Stripe keys / webhook secret | function secrets via deploy Action | GitHub secrets |
| AI provider keys (V3.4) | function secrets via deploy Action | GitHub secrets |
