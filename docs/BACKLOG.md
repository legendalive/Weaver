# Weaver — BACKLOG (Stages 6–7)

## Status snapshot (parked after Stage 5 — all verified working)
- v2 live on GitHub Pages. **Auth** = Supabase email/password.
- **Cloud sync** = Supabase Storage, bucket `weaver-vault`, per-user paths
  `{userId}/weaver/…` (isolation enforced server-side by bucket policy).
- GitHub sync fully removed. `js/cloud/sigv4.js` + `js/cloud/s3.js` are dormant
  leftovers from the abandoned B2/R2 path → delete in Stage 7.
- Owner requests: pick up here when resuming. Sync docs/HANDOFF.md + CHANGELOG
  at the end (HANDOFF still describes GitHub sync and is now stale).

---

## STAGE 6

### 6.1 Secondary cloud provider (>1 GB, no CORS lock-in, no payment)
Keep Supabase primary; add higher-capacity provider for bulky files.
| Provider | Free | Payment? | CORS? | Notes |
|---|---|---|---|---|
| Puter.js | free tier (verify limit) | none | none (SDK) | top candidate; no key, browser sign-in popup |
| Google Drive API | 15 GB | none | none (OAuth) | heavier OAuth setup |
| Cloudflare R2 | 10 GB | card required | yes | excluded (payment) |
| Backblaze B2 | 10 GB | often | yes (CLI) | excluded (CORS+payment) |
| Filebase | 5 GB | none | yes (S3) | partial (CORS) |
**Direction:** Supabase = auth + index/metadata; secondary = manuscript + bible
blobs. Decide split + conflict handling. Validate Puter.js free limit first.

### 6.2 Slim Settings ▸ General → exactly 3 actions
Replace current Cloud Sync + Data & Backup sections with three buttons:
- **Backup to cloud** — push now (replaces "Sync now").
- **Export** — download Main Novel (.docx) + Config Bible (.txt); reuse
  `exportProject()` from js/features/export.js.
- **Restore** — pull from cloud (replaces "Pull from cloud" / "Restore from this PC").
**Remove:** "Sync now", "Download full backup", "Restore from this PC…",
"Pull from cloud" (as separate), and the auto-sync checkbox.
Files: js/features/settings.js (cloudSection + dataSection).

### 6.3 Continuous autosync (every few seconds, as they write)
- Runs automatically (no checkbox), a few seconds after each edit.
- Saves the **active project's** Main Novel + Config Bible (series-aware).
- **Debounce**, not fixed-interval spam: reset timer on each edit, fire ~3s
  after idle; hook into the local-autosave cadence (autosaveInterval).
- Scope to active project + index; do NOT re-upload the whole library per tick.
Files: js/features/cloud.js (new debounced autosync), js/panels/manuscript.js
(touchProject), js/features/config-bible.js (saveNow), js/views/workspace.js
(remove exit-only autoSync call).

### 6.4 Library buttons (Getting Started / New Project)
Nearly touching, misaligned; New Project gold-filled, Getting Started outline.
Add consistent gap + alignment in `.launch-actions`; harmonize styling.
Files: js/views/launch.js, css/views.css (.launch-header/.launch-actions).

### 6.5 Top bar overflow with long project names (mobile worst)
Long names jumble/overlap the topbar. Let `.topbar-center` shrink and truncate
the title with ellipsis; verify on phone.
Files: css/layout.css (.topbar, .topbar-center, .topbar-title),
js/views/workspace.js, js/features/search.js (has topbar CSS overrides).

### 6.6 Wizard: fix "Create config now", remove "Skip for later" card
- The "Create config now" control in the New Project wizard doesn't work — fix/rewire.
- Remove the "Skip for later" card; replace with a single hint line
  ("Config is optional — add it any time from the Config button.").
  Do not present skip as a clickable card.
Files: js/views/wizard.js (configSeg / configField).

### 6.7 Guarantee uploads & restores ALWAYS carry BOTH files
Every backup / restore / export path must always include **Main Novel** AND
**Config Bible** (project bible); neither may be silently omitted.
Audit: exportProject() (docx+txt), exportAllData()/importAllData() (JSON),
cloud push/pull (projects/<id>.json must hold mainNovel.text + configBible /
series config).
Files: js/features/export.js, js/core/storage.js, js/features/cloud.js.
### 6.8 True password change via email link (parked from Stage 6.2)
The "Forgot password? Log in using email." link currently SIGNS THE USER IN
without changing the password (accepted behavior for now). Implement a real
set-new-password screen (recovery-token interception + auth.updateUser) later.
Files: js/auth/auth.js.
---

## STAGE 7 — Close out
- End-to-end QA of 6.1–6.7 on desktop AND phone (owner tests with screenshots).
- Delete dormant js/cloud/sigv4.js + js/cloud/s3.js.
- Sync docs/HANDOFF.md to the Supabase reality + CHANGELOG + tag release.
