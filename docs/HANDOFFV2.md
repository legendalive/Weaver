# Weaver — HANDOFF V2 (the Supabase era)

> Read this file top to bottom before writing any V3 code.
> It is the complete operating manual for Weaver v2: architecture, verified
> APIs, landmines learned the hard way, owner constraints, and the V3 seed.
> Companion file: `docs/BACKLOG.md` (parked work + status).

---

## 1. Product in one paragraph

Weaver is an offline-first novel-writing studio that runs entirely in the
browser (GitHub Pages, no server). Three panels — Manuscript (raw drafts),
Main Novel (finalized canon), AI Output (Scribe streams) — plus a per-project
Config Bible (characters, places, plot arcs, world rules, items, prose style,
standing AI instructions). Series books share one Config Bible. Auth, cloud
vault and sync are Supabase; an optional per-user Puter account acts as
overflow storage. AI is optional and provider-agnostic (Groq, OpenRouter,
Gemini, Mistral) with a fallback chain. Market direction: Gumroad sale page
later; V3 adds paywall, admin dashboard, plot builder.

## 2. Owner constraints & working agreements (HARD RULES)

- **No terminal, no desktop apps, no local server.** Everything happens in
  the browser + GitHub web UI + provider dashboards.
- **Max 3 code files per step.** Prefer FULL file replacements; targeted
  cut/paste only for trivially safe edits with exact anchors.
- Owner tests on **desktop Chrome AND phone**; visual polish matters to them
  (prominent CTAs, unreserved branding, no clutter, no "reserved" look).
- Owner pastes files by hand — never assume a file matches your memory of it;
  when in doubt, re-deliver the whole file.
- Small verified steps; after each, owner reports results before next step.
- Park ideas in `docs/BACKLOG.md`, never in conversation.

## 3. Hosting, accounts & secrets

| Thing | Where | Notes |
|---|---|---|
| App | GitHub Pages, `https://legendalive.github.io/Weaver/` | deploys on push to `main` via `.github/workflows/deploy-pages.yml` |
| Auth + primary vault | Supabase (free tier) | bucket `weaver-vault`, PRIVATE; policies "Give users access to own folder" (INSERT/SELECT/UPDATE/DELETE) enforce `{userId}/…` isolation server-side |
| Supabase keys | **`js/core/supabase.js`** (single source) | URL + anon key are public by design; `service_role` must NEVER appear in client code |
| Redirect URLs | Supabase → Auth → URL Configuration | must include `https://legendalive.github.io/Weaver/` (reset links depend on it) |
| Email limits | Supabase built-in mailer throttles hard | test resets sparingly; Resend SMTP parked as headroom (BACKLOG 6.8) |
| Overflow storage | Puter.js (per end-user account, optional) | no keys, no CORS, no payment; popup only on failover or manual connect |
| AI keys | per-user, Settings ▸ AI Providers, localStorage only | never synced; V3.4 will centralize behind a server proxy |

## 4. File tree (repo root folder: `Weaver`)

```
Weaver/
├── .github/
│   └── workflows/
│       └── deploy-pages.yml        # GitHub Pages deploy on push to main
├── css/
│   ├── base.css                    # tokens; .weaver-logo (Great Vibes gold script W)
│   ├── components.css              # buttons, inputs, modals, toasts, badges
│   ├── layout.css                  # topbar grid (auto minmax(0,1fr) auto), panels
│   ├── views.css                   # library hero/cards/wizard + 6.9/6.10 overrides
│   └── auth.css                    # auth screen base (card CSS also injected by auth.js)
├── docs/
│   ├── BACKLOG.md                  # Stages 6–7 status + V3 parking lot
│   └── HANDOFFV2.md                # THIS FILE
├── index.html                      # splash (script W), Great Vibes font link, favicon data-URI
├── README.md
└── js/
    ├── app.js                      # boot, auth gate, watchdog, per-user namespace, v1 migration
    ├── auth/
    │   └── auth.js                 # Supabase auth UI; recovery-lock password reset
    ├── core/
    │   ├── state.js                # single store; subscribe/emit; touchProject; flushSave
    │   ├── storage.js              # localStorage; per-user namespace; series; ledger helpers
    │   ├── resizers.js             # bindResizers(ctx)/refreshLayout(); flex %, pointer events
    │   └── supabase.js             # ONE shared client (detectSessionInUrl:false); keys live here
    ├── cloud/
    │   ├── sigv4.js                # DORMANT — delete (Stage 7 leftover)
    │   └── s3.js                   # DORMANT — delete (Stage 7 leftover)
    ├── utils/
    │   ├── dom.js                  # el/clear/qs/qsa/delegate/escapeHtml/weaverLogo/toast/modal/confirmDialog
    │   ├── icons.js                # inline SVG registry; UNKNOWN NAMES RENDER EMPTY (silent!)
    │   ├── text.js                 # block index, headings, word count, sentence windows
    │   └── docx.js                 # readDocx (upload), buildDocx (export)
    ├── views/
    │   ├── launch.js               # Library hero (script W + CTA) + project cards
    │   ├── wizard.js               # New Project wizard (scope/source/config checkbox)
    │   └── workspace.js            # BLANK-PROOF wiring; topbar; panels; footers; mobile CSS
    ├── panels/
    │   ├── manuscript.js           # editor; virtualized; selection chip; Accept-as-is footer
    │   ├── main-novel.js           # read-only virtualized canon; word-count badge; Recheck
    │   └── ai-output.js            # block select + Accept/Rewrite/Discard actions
    ├── features/
    │   ├── cloud.js                # sync engine: gzip envelope, Supabase→Puter failover,
    │   │                           #   3s debounced autosync, badge, two-way merge + ledger
    │   ├── puter-mirror.js         # Puter transport only (connect/put/get/del/list)
    │   ├── settings.js             # 3 tabs: AI Providers / Data & Storage / General
    │   ├── guide.js                # Getting Started modal (v2 content)
    │   ├── export.js               # ALWAYS downloads .docx + .txt (both files guarantee)
    │   ├── config-bible.js         # bible modal; saveNow() calls scheduleCloudSave()
    │   ├── hierarchy.js            # drawer; exports ONLY toggleHierarchyDrawer()
    │   ├── capture.js              # floating ＋ Config pill on selections
    │   ├── search.js               # topbar search (+ injects topbar truncation CSS)
    │   └── scribe.js               # AI streaming; mobile FAB
    └── ai/
        ├── manager.js              # fallback chain runner
        └── providers/              # groq.js, openrouter.js, gemini.js, mistral.js
```

## 5. Architecture & data flow

### 5.1 State
`core/state.js` holds one store. Mutations emit change flags:
`{ project, novel, view, ui, settings, hierarchy, silent }`.
- Panels subscribe to their own flags (manuscript/novel/ai re-render themselves).
- `workspace.js` re-renders the shell **only on `change.view`** — content edits
  must NOT rebuild panels (would detach AI blocks & scroll positions).
- `touchProject(change)` marks dirty + emits; local autosave flushes on
  `settings.general.autosaveInterval` (default 3000ms).

### 5.2 Storage layout (localStorage, per user)
Namespace prefix `weaver_u_<userId>_` set by `setUserNamespace()` at boot.
- Project object: `{ id, name, scope, seriesId, seriesName, bookTitle,
  manuscript:{text}, mainNovel:{text}, configBible:{...}, createdAt,
  updatedAt, wordCount, source, uploadedFileName }`.
- Series config lives in its own key; `getEffectiveConfig(project)` resolves
  series bible vs standalone bible.
- Sync ledger (`weaver_sync_ledger`) remembers ids known at last sync →
  deletions propagate to cloud.
- One-time silent migration adopts pre-account (v1) data when the user's
  namespace is empty.

### 5.3 Auth (Supabase)
- Single client from `core/supabase.js`, created with
  `auth: { detectSessionInUrl: false }` — **required**, otherwise recovery
  links auto-sign-in and skip the reset screen.
- Reset flow: `resetPasswordForEmail` → link lands with `#type=recovery` →
  `detectRecovery()` captures tokens into memory + `sessionStorage`
  (`weaver_pw_recovery`), strips hash → reset screen → `setSession(tokens)` +
  `updateUser({password})` → clear + reload.
- **Recovery lock:** while `recoveryTokens` is set, `onAuthChange` swallows
  session events so `app.js` cannot reload the user into the app mid-reset.
- `app.js` boot: watchdog (15s) + `bootFailed()` card — the splash can never
  trap a user again. Session transitions = full page reload (deliberate).

### 5.4 Cloud sync (`features/cloud.js`)
- **Envelope v2 (compression):** blobs gzipped via native
  `CompressionStream('gzip')`; reads sniff magic bytes `1f 8b` and fall back
  to raw JSON parse — old v1 blobs remain readable forever, no migration.
  Effective vault capacity ≈ 3–5× raw text size.
- **Paths:** `{userId}/weaver/index.json`, `…/projects/<id>.json`,
  `…/series/<id>.json`. Index = manifest `{projects:{id:{updatedAt,name}},
  series:{…}, updatedAt}`.
- **Failover:** Supabase first. `isFailoverError()` (quota/exceeded/507/
  network/timeout) → Puter (`puter-mirror.js`). Auth/permission errors surface
  honestly. When Supabase is healthy again, a successful primary write quietly
  deletes the stale Puter copy (single source of truth).
- **Autosync:** debounced 3s after any `change.project` (and on
  `visibilitychange→hidden`); pushes ONLY the active project + its series
  bible + patched index. Never the whole library per tick.
- **Manual:** `syncNow()` = two-way merge by `updatedAt` + ledger deletions.
  Settings buttons "Backup to cloud" and "Restore" both call it (two-way is
  deliberate; strict push/pull split is parked).
- **Badge** (Main Novel header): `saved to cloud · HH:MM` (green) /
  `saved via Puter · HH:MM` (gold) / `cloud save failed` (red).

### 5.5 Workspace wiring (the BLANK-PROOF pattern)
Named ES imports are a **module-graph landmine**: one missing export blanks
the whole app with a single console SyntaxError. `workspace.js` therefore:
1. imports panels/hierarchy/resizers as **namespaces** (`import * as x`);
2. resolves functions via `pick(api, [candidateNames])`;
3. calls everything through `safe()` (try/catch → console.warn);
4. shows a gold in-app banner listing unresolved names if any critical is
   missing (screenshot = one-line fix).
**V3 rule: verify a module's real exports (read the file) before importing
named symbols from it. Never invent export names.**

### 5.6 Branding
`weaverLogo(size)` in `utils/dom.js` renders `<span class="weaver-logo
logo-{sm|md|lg|xl}">W</span>`; Great Vibes script, bright gold gradient,
NO enclosing circles. Placements: splash (`logo-xl`), auth card (`md`,
stacked above wordmark), Library hero (`xl` full / `md` compact), workspace
topbar-left (`sm`). Favicon = italic gold W data-URI in `index.html`.
Owner verdict history: Cinzel Roman W rejected ("too Roman, too dark, circle
wrong"); custom SVG path remains the preferred FINAL form (BACKLOG 6.10).

## 6. Verified export map (read before importing anything)

| Module | Exports |
|---|---|
| core/resizers.js | `bindResizers(context)`, `refreshLayout()` |
| core/supabase.js | `getSupabaseClient()`, `supabaseConfigured()`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| panels/main-novel.js | `mountMainNovel(panel)`, `renderMainNovel(startBlock?)`, `jumpNovelToBlock(i)`, `recheck()` |
| panels/ai-output.js | `initAiOutput()`, `acceptAiBlock()`, `rewriteAiBlock()`, `discardAiBlock()` |
| panels/manuscript.js | `renderManuscript()`, `initManuscript()`, `flushManuscriptSync()`, `jumpManuscriptToBlock(i)` (+ mount name — see workspace pick list) |
| features/hierarchy.js | `toggleHierarchyDrawer()` **only** |
| features/cloud.js | `syncNow()`, `autoSync()`, `scheduleCloudSave()`, `isCloudConfigured()`, `getCloudUserEmail()`, `signOutAndReload()`, `connectCloud()`, `copyAllToPuter()`, `restoreFromPuter()` |
| features/puter-mirror.js | `puterSignedIn()`, `connectPuter()`, `disconnectPuter()`, `puterPut()`, `puterGet()`, `puterDel()`, `puterList()` |
| js/auth/auth.js | `initAuth()`, `authConfigured()`, `currentUserId()`, `currentUserEmail()`, `onAuthChange()`, `signOutUser()`, `renderAuthView()` |
| utils/dom.js | `el`, `clear`, `qs`, `qsa`, `delegate`, `escapeHtml`, `weaverLogo`, `toast`, `modal`, `confirmDialog` |
| views/* | `initLaunch/setOpenWizard/renderLaunch`, `initWizard/openProjectWizard`, `initWorkspace/renderWorkspace` |
| features/* | `openSettings`, `openGuide`, `exportProject`, `openConfigBible` |

## 7. Landmines & lessons (the expensive list)

1. **Invented export names blank the app** (three separate outages:
   `ensureHierarchyDrawer`, `initMainNovel`, `initManuscript`). Namespace +
   pick + safe() is now mandatory in workspace.js; verify exports elsewhere.
2. **Multiple GoTrueClient instances** warning → fixed by the single factory
   in `core/supabase.js`. Do not create ad-hoc clients (the old transient
   reset client was retired).
3. **Supabase recovery links auto-sign-in** unless
   `detectSessionInUrl:false` + recovery lock. Both are load-bearing.
4. **Free-tier email throttling** — repeated reset tests lock you out for
   ~an hour. Resend SMTP is the parked fix.
5. **GitHub Pages/Actions quirks:** stuck run = queued runner → Cancel +
   Re-run; ❗ on a commit = cancelled/queued (not failure); latest green run
   deploys the whole branch; favicon is tab-cached (new tab / clear site data).
6. **Settings merge** must preserve every block (v1 once dropped the github
   block on reload). Keep `getSettings()` merge list complete when refactoring.
7. **Autosync scope:** active project only, debounced. Full-library sync per
   keystroke-tick will melt free-tier quotas.
8. **Deletions** travel via the ledger; 404/"not found" is the ONLY error that
   may be read as "absent". Everything else surfaces.
9. **Mobile CSS once hid resizers** and referenced nonexistent
   `.panel-mid/.panel-right` classes (dead rules). Mobile is now: flex column,
   transparent panel borders, 16px touch-drag resizer bands (`touch-action:none`).
10. **icons.js renders unknown names as empty SVG silently** — a "missing
    icon" is always a typo, never a crash.
11. **`config-bible.js` saves bypass state emits** — it calls
    `scheduleCloudSave()` directly; keep that line when editing saveNow().

## 8. Stage 6 status (all DONE unless noted)

| Item | Landed as |
|---|---|
| 6.1 secondary storage | gzip envelope + per-user Puter **failover** (not mirror); shared-admin Puter ruled impossible (no service creds, no isolation, no capacity gain) |
| 6.2 settings slimming | 3 tabs; Data & Storage = Backup/Export/Restore + optional Puter card |
| 6.3 continuous autosync | 3s debounce + visibilitychange; badge in Main Novel header |
| 6.4/6.9 library layout | hero cascade (desktop + mobile), prominent gold CTA |
| 6.5 topbar truncation | grid `auto minmax(0,1fr) auto` + ellipsis |
| 6.6 wizard config | single checkbox + optional hint line; opens bible on create |
| 6.7 both-files guarantee | export always docx+txt; sync blobs carry novel+manuscript+bible |
| 6.8 password reset | true reset via recovery lock; Resend SMTP **parked** |
| 6.10 logo | Great Vibes script W, circles removed; **custom SVG path still preferred final form** |
| 6.11 client consolidation | `core/supabase.js` singleton |
| Stage 7 leftovers | delete `js/cloud/sigv4.js` + `js/cloud/s3.js`; write CHANGELOG.md; tag v2.0.0 (see §10); owner QA sweep |

## 9. V3 seed (from BACKLOG; dependency order V3.1→V3.6→V3.2→V3.4→V3.3→V3.5)

- V3.1 admin dashboard: MUST be server-side (Supabase Edge Functions);
  `service_role` never ships to client. Research: Retool/Appsmith vs small
  Vite admin page on Pages/Netlify.
- V3.2 paywall: entitlements table in Supabase; Stripe/PayPal webhooks flip it.
- V3.3 plot builder: AI-assisted (paid) / manual scaffolding (free).
- V3.4 centralize AI keys behind Edge-Function proxy (metering, kill sharing).
- V3.5 EU domain (eu.org / cheap .eu); update Supabase redirect URLs on swap.
- V3.6 Stripe primary, PayPal optional.
- Capacity math for planning: 1GB Supabase ≈ ~2,500 gzipped full projects;
  Puter adds per-user ~0.5–1GB free; paid Supabase Pro (100GB) or R2 (card)
  become viable once revenue exists — swap is credentials-only thanks to the
  cloud.js abstraction.

## 10. Release & versioning procedure (browser-only)

1. Commit everything; wait for the green Actions tick.
2. Repo → **Releases** (right column) → **Create a new release**.
3. Tag: type `v2.0.0` → "Create new tag on publish"; target `main`.
4. Title `Weaver v2.0 — the Supabase era`; paste CHANGELOG bullets (§11).
5. **Publish release.** The tag freezes this snapshot forever.
6. Optional: create branch `v2-maintenance` from the tag for hotfixes; V3
   continues on `main` (or a fresh repo seeded with this file + BACKLOG).

## 11. v2.0 changelog bullets (for the release body)

- Accounts: Supabase email/password sign-in, true password reset, sign-out.
- Private per-user cloud vault (server-enforced isolation) + continuous
  compressed autosync with save badge.
- Optional Puter overflow storage (failover when vault full/unreachable).
- Library hero redesign + script-gold W brand mark everywhere.
- Settings rebuilt (3 tabs); export always yields .docx + .txt.
- Mobile: cascading library, truncating topbar, invisible panel borders,
  touch-drag panel resizing.
- Boot hardened: watchdog + failure card; single Supabase client.

## 12. Verification playbook (how the owner tests)

- Hard-refresh after every deploy; test desktop + phone.
- Badge states are the sync truth; Supabase Dashboard → Storage →
  `weaver-vault` shows blobs (binary = gzipped, expected).
- SQL truth: `select name, updated_at from storage.objects where
  bucket_id='weaver-vault' order by updated_at desc limit 20;` (UTC times).
- Any blank screen: F12 → Console → first RED error names file+line;
  gold in-app banner names unresolved panel functions.
