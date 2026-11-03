# HANDOVER/00_START_HERE.md
# Weaver → V4 Handover: Start Here

## 1. Identity
- Product: **Weaver** — privacy-first novel-writing studio (local-first, cloud vault, canon-aware AI).
- Company: **LegendAlive Studio** (footer/eyebrow on marketing pages; Gumroad seller name should match).
- Owner account: mbenson.mb62@gmail.com · Supabase UID `c4481e53-3dbd-4ff3-91b1-8f11f196894e`
  (hardcoded as OWNER_USER_ID in `admin` and `support-admin` edge functions).

## 2. Where everything lives
| Asset | Location |
|---|---|
| Frontend app (static ES modules, no build step) | GitHub repo `Weaver` → GitHub Pages: `https://legendalive.github.io/Weaver/` |
| Admin console | same repo, `/Weaver/admin/` |
| Marketing site (3 pages) | same repo, `/Weaver/welcome/` |
| Backend (Deno Edge Functions) | GitHub repo `weaver-server` → Supabase project `hiqmvhkwuvvgalqxxtbc` |
| Functions base URL | `https://hiqmvhkwuvvgalqxxtbc.functions.supabase.co/{admin,ai-proxy,ai-admin,support,help,support-admin}` |
| DB + Auth + Secrets | Supabase dashboard (same project) |
| Transactional email | Brevo (SMTP for auth; HTTP API for support replies) |
| Ledger backups | Resend (owner-only deliveries) |
| Payments | Gumroad seller `mbenson62` (manual Pro provisioning — no webhook) |
| Optional overflow storage | Puter (each user's own account) |

## 3. Read order for a new session
1. This file. 2. `03_FILE_TREES.md`. 3. `01_FRONTEND_ARCHITECTURE.md`.
4. `02_BACKEND_SERVICES.md`. 5. `04_DECISIONS_RULES.md`. 6. `06_GOTCHAS_WARSTORIES.md`.
7. Start work from `05_V4_BACKLOG.md`.

## 4. Secrets & credentials map (where, not what)
- **GitHub `weaver-server` → Settings → Secrets:** `SUPABASE_ACCESS_TOKEN` (CLI deploys; EXPIRES — see 06), plus anything `deploy-functions.yml` references.
- **Supabase Dashboard → Edge Functions → Secrets:** `BREVO_API_KEY` (support-reply emails), `BACKUP_SECRET` (cron), Resend key. Secrets inject **at deploy time** → changing one requires a redeploy (empty commit).
- **AI provider keys (Groq/OpenRouter/Gemini/Mistral):** NOT env vars — stored in `ai_config` table, edited via admin console (service_role-only).
- **Brevo SMTP creds:** Supabase Dashboard → Auth → SMTP settings (host/port/user/password = Brevo "SMTP key value").
- Never put live secret values into these handover files or chat.

## 5. Deploy runbook
- Frontend: commit/push `Weaver` → Pages auto-publish (~30 s). Hard-refresh after.
- Backend: commit/push `weaver-server` → Actions `deploy-functions.yml` deploys all functions. Watch for green tick.
- New/changed function secret: add in Supabase dashboard, THEN trigger a redeploy (empty commit) or it won't be visible.
- Workflows red with `401 Invalid access token`: regenerate Supabase access token (avatar → Access tokens, longest expiry), update GitHub secret, re-run.

## 6. Source-of-truth rule
The live repos are truth. Chat snapshots/KB uploads (manuscript.txt, scribe.txt, etc.) are point-in-time and MAY BE STALE (several were captured pre-fix). When in doubt, re-read the live file before editing.

# HANDOVER/01_FRONTEND_ARCHITECTURE.md
# Frontend (Weaver repo) — architecture & mechanisms

No bundler, no framework: native ES modules + a hand-rolled DOM helper.
Global stylesheet lives in `css/` (defines .panel, .btn, .ms-block base, tokens like --accent #e0a43c).
Feature modules inject their own <style> via ensureStyle() with a unique STYLE_ID.

## 1. Core patterns
- `utils/dom.js` → `el(tag, props, children)`: props = class/text/title/dataset/onclick/etc.
  **It does NOT support innerHTML and style-object props are unreliable** → set `node.style.x` imperatively.
- `core/state.js` → getState(), subscribe(fn(state, change)), touchProject(), flushSave(), setUI(), openProject/closeProject.
  change flags: {view, project, silent, settings, ui}.
- `core/storage.js` → namespaced localStorage: prefix `weaver_u_{userId}_` set by app.js after Supabase sign-in
  (file comment says "Clerk" — legacy wording; live auth is Supabase).
  Keys: project_ids · project_meta_{id} (SUMMARY ONLY: id,name,scope,source,seriesId,seriesName,createdAt,updatedAt,wordCount) ·
  project_data_{id} (FULL blob: manuscript{text,viewStart}, mainNovel{text}, configBible, notes[], plot, scribeHistory…) ·
  series_ids · series_meta_{id}{bookIds[]} · series_config_{id} · active_project_id · settings.
  **GOTCHA: listProjects() returns metas (no text). getProject(id) returns the full blob.** (Caused the EPUB "empty" bug — see 06.)
  getEffectiveConfig(project): series books share series_config; standalones use own configBible.
  exportAllData/importAllData = backup bundle v1 (settings sanitized: AI keys/github/cloud stripped).
- `core/entitlements.js` → isPro(), isKnownFree(), onEntitlementChange(); entitlements cached client-side,
  refreshed on load; server tables are service_role-only. Pro provisioning is MANUAL (admin console) after Gumroad purchase.

## 2. Views & panels
- `views/launch.js` — Library: hero + project cards (meta-driven), delete guard, "＋ Add book" icon on series cards
  (calls openWizardFn({seriesId}) — V3.9). V4 will regroup cards by series.
- `views/wizard.js` — New Project modal: scope seg (standalone/series), series select (+__new), book title,
  source seg (scratch/upload .txt/.md/.docx via readDocx), config checkbox; accepts `prefill` for add-book.
- `views/workspace.js` — topbar (Config/Plot/Hierarchy left; Library/Guide/Export/Settings/More right),
  three panels (manuscript/novel/ai) + resizers; defensive `pick()` resolution with MISSING banner;
  mobile ≤860px: pill bar (remember-last, AI attention dot via MutationObserver), position:fixed panel stack,
  docked footers; ≤480px: Guide/Export fold into "?" More-sheet.
- `panels/manuscript.js` — THE block engine (load-bearing; do not replace):
  buildBlockIndex levels (1=#,2=##,3=###), windowed mount (MAX_MOUNTED 300) with top/bottom spacers,
  sticky-bottom paging + one-page runway, resume via viewStart, contenteditable plaintext-only (fallback true),
  Enter=splitBlock, Shift+Enter=<br>, Backspace-at-0=merge, paste splits lines into blocks,
  H1/H2/H3/¶ toolbar, selection bundling (.is-bundled gold edge) → getManuscriptSelection(),
  debounced sync → spliceBlocks back into project.manuscript.text,
  acceptAsIs(): selection → Main Novel with duplicate-guard confirm; **V3.9 D1 freeze: ALWAYS cuts from Manuscript**
  (old acceptMovesText toggle removed from UI; dead default remains in settings).
  V3.9 continuity: injected MS_CSS with !important overrides (global css boxes .ms-block otherwise) +
  single `.ms-empty-hint` "Type here or upload a manuscript" shown only while whole manuscript empty
  (refreshEmptyHint via scheduleSync + render); per-block ::before placeholders suppressed.
- `panels/main-novel.js` — finalized text view + recheck (cut back to manuscript).
- `panels/ai-output.js` — block registry actions Accept/Rewrite/Discard; active-block selection; empty-state restore.
- `features/scribe.js` — command deck (transparent pills), context chip, mobile FAB + sheet,
  compileBible (token-budgeted: DIRECTIVES/STYLE/matched entries/ROSTER), buildMessages rules 1–6,
  streamChatWithFallback wiring, **free-gate: isKnownFree() → showUpgradeNotice() gold card + toast**,
  createBlock removes stale upgrade notice/empty-state.
- `features/export.js` — Export = .docx (buildDocx from Main Novel blocks) + .txt bible, ALWAYS both;
  Export EPUB (Pro) = openEpubExportList() modal listing listProjects() metas → on tap getProject(id) full blob →
  chapters from H1 (fallback H2; else single chapter), title page, nav.xhtml + toc.ncx, style.css, OPF v3,
  utils/zip.js STORE-method zip (mimetype first, uncompressed), author constant 'Anonymous' (prompt removed),
  Main-Novel-only rule (never Manuscript); filename safe-slugged.
- `features/settings.js` — 2 tabs. Data & Storage: Account (email badge, Pro/Free badge, Upgrade link cqxxpt,
  sign-out), **Cloud Sync & Export** row = Upload to cloud / Export / Export EPUB / Download from cloud
  (both sync buttons call syncNow() = two-way reconcile, newer-wins, never erases), Puter overflow card.
  General: sentences/page, autosave ms, quick prompts (3), font scale; Pro-only temperature slider.
- `features/notes.js` — V3.8-trimmed: single-surface sheet, borderless textarea, placeholder IS the empty message
  ("Your quick scratchpad for sudden ideas."), hairline rows, faint ×, Ctrl/Cmd+Alt+N, FAB auto-hide while typing.
- `features/plot-reference.js` — right rail desktop; **mobile = full-screen sheet (z 85)** since V3.9
  (was display:none → "dead Plot button").
- `features/cloud.js` — autoSync/syncNow/scheduleCloudSave; compressed vault payloads.
- `features/puter-mirror.js` — optional overflow (connect/disconnect, copyAllToPuter, restoreFromPuter).
- `features/support.js` — Support Center: instant lookup (help fn, capped), request form, Your-requests threaded
  list w/ unread badges; voice rules in 04.
- `features/guide.js` — renders docs/HELP.md (DOC_V).
- `features/config-bible.js`, `features/plot-builder.js`, `features/hierarchy.js`, `core/resizers.js`.
- `ai/manager.js` — streamChatWithFallback (provider order, onProviderSwitch/onToken).
- `utils/text.js` — buildBlockIndex/windowBounds/spliceBlocks/headingPrefix/normalizeNewlines.
- `utils/docx.js` — buildDocx + readDocx. `utils/zip.js` — buildZip (CRC32 + STORE) for EPUB.

## 3. Mobile invariants (regression checklist)
Pills remember last panel · AI dot when generation lands off-panel · footers dock to viewport bottom ·
More-sheet at ≤480px · Scribe FAB right / Notes FAB left · Plot = full-screen sheet · topbar buttons 34px squares.
# HANDOVER/02_BACKEND_SERVICES.md
# Backend, database & external services

## 1. Edge functions (weaver-server/supabase/functions/*)
| Fn | Purpose / key routes |
|---|---|
| admin | Owner console API: /api/health, tickets list, credits/pro-days grants, announcements, audit (admin_log). Auth = Supabase user must equal OWNER_USER_ID. |
| support-admin | GET /api/support (tickets+replies), POST /api/support/:id/reply → inserts support_replies + sends Brevo notification; returns {ok, emailed, emailError}. Owner-gated. |
| help | Support lookup: /api/lookup (caps: Free 5/hr + 12/day, Pro 60/hr, enforced via help_log), /api/tickets (ESCALATE auto-file). |
| support | User ticket creation → support_messages. |
| ai-proxy | Streaming chat with server-held provider keys + fallback; entitlement-aware. |
| ai-admin | ai_config CRUD (provider keys/models) — admin console only. |
| backup* | Cron-driven ledger backup email via Resend (backup-schedule.yml + BACKUP_SECRET). *verify fn name in repo. |

## 2. Schema gotchas (Supabase Postgres)
- support_messages.id = **bigint** · support_replies.ticket_id = **bigint** (not uuid/int — inserts must match).
- service_role-only tables (never expose anon keys): entitlements, credit_log, admin_log, announcement, ai_config.
- help_log(question, answer, resolved, created_at) backs the lookup caps.
- entitlements drive Pro (pro-days/credits); client caches via entitlements.js; provisioning is MANUAL after Gumroad.

## 3. Supabase Auth
- Email/password; custom SMTP = Brevo (below). Password-reset email = the historical 500-error surface (see 06).
- Redirects include the Pages origin; recovery flow tested live V3.

## 4. Brevo (two integrations)
a) **SMTP for Auth** (Supabase Auth → SMTP): host smtp-relay.brevo.com · port 587 · user = mbenson.mb62@gmail.com ·
   password = the **"SMTP key value"** from Brevo → SMTP & API (NOT login password, NOT xkeysib API key) ·
   sender mbenson.mb62@gmail.com ("Weaver") must be **Verified** in Brevo → Senders & IP.
b) **HTTP API for support replies** (support-admin): POST `https://api.brevo.com/v3/smtp/email`,
   header `api-key: $BREVO_API_KEY`, body keys: sender{}, to[], subject, **htmlContent** (NOT `html`).
   Wrong endpoint/param = "Invalid route/method" / "htmlContent or textContent required" (see 06).

## 5. Resend — ledger backups only; onboarding sender delivers solely to owner. Never user-facing mail.

## 6. Gumroad
- Seller mbenson62. Live product today: `cqxxpt` (pricing buttons currently all point here post-fix).
- Intended final state: THREE products — permalinks weaver-monthly ($8/mo), weaver-yearly ($60/yr),
  weaver-lifetime ($149 once); pricing.html hrefs + scribe.js UPGRADE_URL + settings upgrade link must match.
- **No webhook:** owner grants Pro manually (admin console → entitlements) after purchase; buyer must use their
  Weaver email at checkout (copy says so).

## 7. Puter — optional per-user overflow; silent auto-accounts SCRAPPED (auth model + privacy).

## 8. CI/CD
- deploy-functions.yml: deploys all functions; uses SUPABASE_ACCESS_TOKEN (expires → 401 red runs; see 05/06).
- backup-schedule.yml: cron → backup fn with BACKUP_SECRET.
- Secrets changed in Supabase dashboard require a redeploy to take effect.
# HANDOVER/03_FILE_TREES.md
# Annotated trees (live names; * = verify if touched)

## Weaver (frontend, GitHub Pages)
```
Weaver/
├── index.html                  # app shell (login → launch → workspace)
├── css/                        # global stylesheet: tokens, .panel/.btn/.ms-block base *
├── docs/HELP.md                # Guide source (rendered by features/guide.js)
├── welcome/                    # marketing site (favicon = inline SVG data-URI, gold italic W)
│   ├── index.html              # landing: what/why + differentiation cards
│   ├── pricing.html            # Free vs Pro value lists + $8/$60/$149 cards + FAQ
│   ├── features.html           # 9-card tour
│   └── site.css                # shared marketing styles
├── admin/
│   ├── index.html              # console: Messages (Tickets/AI Monitor, threaded replies), credits, announcements
│   └── ai-keys.html            # DELETE pending (verify gone)
└── js/
    ├── app.js                  # boot, auth gate, namespace set, view routing
    ├── core/{state,storage,entitlements,resizers}.js
    ├── views/{launch,workspace,wizard}.js
    ├── panels/{manuscript,main-novel,ai-output}.js
    ├── features/{scribe,export,settings,notes,cloud,puter-mirror,plot-reference,
    │             plot-builder,config-bible,guide,support,hierarchy}.js
    ├── ai/manager.js            # streamChatWithFallback
    └── utils/{dom,icons,text,docx,zip}.js
```
(landing.html at root was deleted when welcome/ launched.)

## weaver-server (Supabase Edge Functions)
```
weaver-server/
├── .github/workflows/
│   ├── deploy-functions.yml    # deploys all fns; SUPABASE_ACCESS_TOKEN
│   └── backup-schedule.yml     # cron ledger backup (BACKUP_SECRET)
└── supabase/functions/
    ├── admin/index.ts
    ├── support-admin/index.ts  # replies + Brevo htmlContent email
    ├── help/index.ts           # lookup caps + ESCALATE tickets
    ├── support/index.ts
    ├── ai-proxy/index.ts
    ├── ai-admin/index.ts
    └── backup/index.ts         # * name verify; Resend ledger mail
```
# HANDOVER/04_DECISIONS_RULES.md
# Decision log & standing rules

## Decisions
- D1 Accept-as-is ALWAYS cuts Manuscript→Main Novel (toggle gone; freeze landed V3.9; duplicate-guard kept).
- D2 Exports: .docx+.txt always both; EPUB Pro-only, Main-Novel-only, picker lists all books (series individually),
  loads full blob via getProject(); author constant 'Anonymous'.
- D3 Mobile: More-sheet ≤480px; pills + dock; Plot = full-screen sheet.
- D4 Brevo = auth SMTP + reply notifications; Resend = ledger backups only.
- D5 Help caps: Free 5/hr+12/day, Pro 60/hr (help_log-enforced server-side).
- D6 Support voice: never mention docs/guide/help; no chat; one request = one resolution;
  ESCALATE marker auto-files a ticket; replies email via Brevo + thread in-app.
- D7 Pricing: undercut market — $8/mo · $60/yr · $149 lifetime (research: Dabble $15–39, LivingWriter $25–35,
  Sudowrite $10–59, Novelcrafter $4–20 BYOK, Plottr $199 lt, Campfire $336 lt, Scrivener $60 no-AI/cloud).
- D8 Branding: LegendAlive Studio; marketing = welcome/ 3 pages; no admin links in marketing; favicon gold W.
- D9 Manuscript stays a block engine; continuity is CSS-only (!important injections); single empty-doc hint.
- D10 Settings sync row renamed: Upload to cloud / Download from cloud (both = two-way syncNow; honest hint).

## Standing engineering rules
1. `el()` never innerHTML; imperative style sets. 2. ES imports carry .js. 3. >3 edits in a file → deliver full file.
4. Code travels in chat text, not uploads (uploads mangle: \n→newline, |→escapes). 5. New files = safest pastes.
6. Injected CSS vs global css: use !important or lose specificity war. 7. No browser prompt()/confirm() in flows.
8. Every user-facing failure message names the next step (see upgrade CTA, EPUB empty notice).
9. Pro gates client (isPro/isKnownFree) AND server (caps/entitlements) — never client-only for cost-bearing ops.
# HANDOVER/05_V4_BACKLOG.md
# V4 backlog (prioritized) + parked + scrapped

## Now (growth + delegation)
1. Library series grouping: series = one card (name + book count); expand → books; move "＋ Add book" to series row.
2. Accept split: "Accept whole" / "Accept highlighted"; add note: move Manuscript→Main Novel before EPUB export.
3. Supervisor role: lesser admin tier (support delegation without full control) — design perms vs OWNER_USER_ID gate.
4. Ticket report CSV: admin-side export (tickets + replies + help_log); client-built CSV from saApi or new /api/report.
5. Gumroad 3-product setup + relink pricing.html/UPGRADE_URL/settings; purchase end-to-end test (fresh account →
   buy → manual grant → verify unlocks: cloud, Scribe, temp slider, EPUB).
6. Verifies: admin/ai-keys.html deleted; workflows green; token expiry calendar note.

## Later
7. Strict one-way cloud actions (push-only/pull-only) if users ask — needs cloud.js internals.
8. Credits-exhausted CTA parity on server-denied generations (currently client-gate only).

## Parked
Full PDF import (reject-with-guidance is final behavior) · TTS/audiobook · multi-platform Gumroad ·
Stripe/PayPal + Kenya research · EU-domain/GDPR pass · trash/30-day recovery · legacy env AI-secret cleanup.

## Scrapped (do not revive without new facts)
Silent Puter auto-accounts · merged contextual "Cloud Sync" button (erase ambiguity) · free-user AI panel removal
(kills trial funnel; CTA card is the replacement) · Stonecode/SwingMatrix company names.
# HANDOVER/06_GOTCHAS_WARSTORIES.md
# Bug war stories (symptom → root cause → fix) — read before debugging

1. Blank app after an edit → mangled paste broke module parse. Cure: full-file replace from clean source; F12 first red line names culprit.
2. "Error sending recovery email" 500 → Brevo sender unverified / wrong password field. Verify sender + use SMTP key value.
3. Brevo "Invalid route/method" → endpoint must be /v3/smtp/email. "htmlContent or textContent required" → param is htmlContent.
4. EPUB "Main Novel is empty" on a full book → listProjects() metas have no text; load via getProject(id). DOCX worked because it reads the open project.
5. Plot button dead on mobile → CSS `@media(max-width:860px){.plot-ref-panel{display:none}}`; now full-screen sheet.
6. Workflows 401 → SUPABASE_ACCESS_TOKEN expiry; regenerate + update secret + re-run.
7. Secret added but function ignores it → secrets inject at deploy; redeploy (empty commit).
8. Manuscript looked segmented / placeholders everywhere → global css specificity; MS_CSS !important + per-block ::before suppression + single .ms-empty-hint.
9. Gumroad 404 from pricing → placeholder concat garbage (`.../l/cqxxpt.gumroad.com/l/...`); replace whole price-grid block, verify via console href dump.
10. support inserts failing → bigint ids (support_messages.id, support_replies.ticket_id).
11. Settings "tremble" → saved-badge row height collapse; keep row height stable.
12. Uploads mangle code (\n, ||, quotes) → paste code in chat; treat uploaded .txt/.docx as reference only.
13. KB snapshots stale: manuscript.txt predates D1 freeze; launch.js predates add-book; notes.js predates trim; settings.docx predates EPUB row. Live repo wins.
