
## 3. Data model (localStorage; all keys prefixed `weaver_`)

- `project_ids[]`, `project_data_<id>`, `project_meta_<id>`
- `series_ids[]`, `series_meta_<id>`, `series_config_<id>` (series-shared bible)
- `settings`, `active_project_id`, and raw `weaver_sync_ledger` (cloud.js)

Project: `{ id, name, scope:'standalone'|'series', seriesId, seriesName,
bookTitle, createdAt, updatedAt, wordCount, configInitialized,
uploadedFileName, manuscript:{ text, viewStart }, mainNovel:{ text },
configBible:{ characters[], settings[], plotArcs[], worldRules[], items[],
generalProse, generalAiInstructions } }`
Entry: `{ id, name, body }`. Meta mirrors identity fields + updatedAt/wordCount.
Settings: `{ general:{ theme, fontScale, sentencesPerPage, autosaveInterval,
panelSizes[3], acceptMovesText, quickPrompts[3] }, ai:{ providers{4×{key,enabled}},
fallbackOrder, activeModel, temperature, maxTokens }, github:{ token, repo, autoSync } }`

## 4. Text engine invariants (the heart — read before touching)

- Raw text is a string of **lines**; headings encoded as `# `/`## `/`### ` prefixes.
  DOM blocks strip the prefix; level lives in `dataset.level`.
- `buildBlockIndex(text)` → `[{s,e,level,sentences}]`; measured once per change
  (~2.8 ms / 1.8 MB). Never scan text in render paths.
- Virtualization: `mounted {from,to}` window + top/bottom spacers holding pruned
  pixel heights; `MAX_MOUNTED=300`, `SCROLL_THRESHOLD=300`; append/prepend/prune
  keep `scrollHeight` stable by spacer arithmetic.
- Edits splice back via `spliceBlocks(oldText, index, from, to, newStrings)` in
  `flushManuscriptSync()`; `project.manuscript.viewStart = mounted.from` persists
  for resume.
- **Sticky bottom:** `isStickyBottom` (within 30px) → synchronous pin after appends
  + rAF confirm; `pruneTop()` must skip its scrollTop restore while sticky.
  Runway = `paddingBottom = clientHeight` (one empty page), debounced on resize.
- Main Novel groups consecutive body lines into one `.mn-block`; its
  `renderMainNovel(startBlock=null)` auto-picks scroll mode: append→bottom,
  removal→preserve, jump/open→top (via `lastNovelText/lastNovelProjectId`).

## 5. Selection & bundle semantics

- Bundle = `selectionInfo = { text }` captured with `sel.toString()` on
  `selectionchange` (sticky: collapsing or clicking elsewhere does NOT clear).
  **No offsets are stored** — offset math was the original bug; never reintroduce.
- Consumed on Scribe send (`clearManuscriptSelection()`); gold tint `.is-bundled`.
- Accept-as-is: selection-only; duplicate guard via `confirmDialog`; move-mode cuts
  by exact `indexOf` match. Recheck cuts Novel selection back into Manuscript.
- Search/capture use their own observers; capture never mutates the bundle.

## 6. Cloud sync semantics (js/features/cloud.js)

- Private repos only (refused otherwise). Token in `settings.github`, never in
  backups (`sanitizedSettings`) nor in the repo.
- Layout: `weaver/index.json` manifest + `weaver/projects/<id>.json` +
  `weaver/series/<id>.json`; two-way merge by `updatedAt`; one commit per sync.
- Mutex (`syncing`) per tab; `commitAll` re-reads head immediately before commit
  and rebases+retries (≤3) on 422 "not a fast forward".
- **Only** 404 / "Git Repository is empty" may be read as "no head"; any other
  error must surface (the 422 saga was a swallowed 403 rate-limit).
- Empty repo bootstrap: single README commit via Contents API, then normal path.
- **Deletions propagate via `weaver_sync_ledger`** (ids known at last sync but
  gone now → tree entry `sha:null`). Removing the ledger resurrects deletes.
- `autoSync()` fires quietly on Library exit when enabled.

## 7. AI pipeline

- Fallback order from settings; runtime `listModels()` discovery (zero hardcoded
  models); router scores free models for creative fit; temperature/maxTokens
  injected by manager.
- `compileBible(cfg, context, budget=6000)`: DIRECTIVES → STYLE → matched entries
  (name/word overlap vs context) → name-only ROSTER, hard-capped. Context cap 8000.
- Scribe system rules 1-6 (transform-only-if-source; clarifying question; never
  open with interjections). No cross-send conversation memory (by design).
- AI blocks live in DOM (`scribe.blocks`), not persisted — refresh discards them.

## 8. Landmines & quirks (learned the hard way)

1. Desktop Manuscript sticky-bottom has an accepted ~1% bounce (layout timing).
   Do not "fix" by deleting pins/runway; retest with a 5,000-chapter doc.
2. `icon()` with an unknown name renders an empty svg silently (help-circle
   incident). Check `icons.js` names before using.
3. `text-overflow: ellipsis` does nothing on flex `.btn` — needs an inner span
   (quick-prompts pills).
4. Several modules inject their own `<style id="*-style">`; don't migrate their
   CSS into views.css without deleting the injection (duplicate-source bugs).
5. Workspace renders an unbound `.scribe-bar` placeholder; scribe replaces it
   (guarded by `dataset.scribeBound`). Don't bind twice.
6. `getSettings()` once dropped the `github` block on reload — keep it in the
   merge list if you refactor settings.
7. Mobile resizers carry a `.resizer-line` child + inline styles from
   `styleResizers()`; the visible divider is the child, not the element bg.
8. Search marks (`mark.ws-hit`) are transient and sync-safe (bodyString walks
   through them); clear on jump/clear, never persist.
9. Novel `viewStart` is NOT persisted (parked). Manuscript's is.
10. Cross-device delete semantics: delete on the device you sync most; a second
    device still holding the project will re-push it.

## 9. Parked list (post-v1, deliberate)

Stored-range "already sent" tint · Novel resume position · mobile search entry in
drawer · per-provider model picker · DOCX tables/images · extra themes · custom
undo/redo · multi-send conversation memory · desktop bounce (see §8.1).

## 10. Conventions for future sessions

- Small verified steps; after each, update this doc + CHANGELOG in the same commit.
- Targeted edits use exact anchors; at the first sign of a botched patch, replace
  the ENTIRE file (the "FULL" protocol).
- Tag releases (`v1.0` = this baseline); snapshot downloads pin to tags.
- Park ideas in `docs/BACKLOG.md` / GitHub Issues, not in conversation.
- Verify on desktop AND phone; the owner tests with screenshots — match that bar.

## 11. Orientation cheat-sheet

| Task | Start at |
|---|---|
| Block/offset/sentence logic | `js/utils/text.js` |
| Editor behavior, caret, paste | `js/panels/manuscript.js` |
| Canon rendering / recheck | `js/panels/main-novel.js` |
| Prompt payload & bible budget | `js/features/scribe.js` |
| Providers / fallback / gen params | `js/ai/manager.js` + providers |
| Sync / backups / secrets | `js/features/cloud.js`, `js/core/storage.js` |
| Mobile chrome | `js/views/workspace.js` CSS + `css/views.css` EOF |
| Any UI primitive | `js/utils/dom.js`, `css/components.css` |

## 12. Changelog seed (condensed)

1-4 foundation (store/state/text/utils, launch shell) · 5-7 library, wizard,
settings · 8-10 workspace, resizers, text engine · 11-14 manuscript editor,
novel panel, hierarchy, paging fixes · 15-17 config bible + series sharing +
import/export · 18-20 AI providers/manager/router + hardening · 21-24 Scribe
bundle, sticky tint, resume, sel.toString capture · 25 preferences pass ·
26 quick prompts, DOCX in/out, mobile hairline system · 27 QA + cross-doc
search · 27.5 capture-to-bible + AI descriptions · 28 backup/restore, GitHub
sync (mutex, rebase retry, ledger deletions), guide, library gear.
