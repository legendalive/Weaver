# Weaver V4 — Roadmap & Delivery Plan

Living document. Check items off as they land.
Companion docs: `docs/Handover v3/Handoverfile.md` (source of truth), `docs/BACKLOG.md`.

---

## 0. Delivery protocol (read every session)

These rules override everything else. They exist because partial edits have
blanked the app before.

| Rule | Meaning |
|---|---|
| No CLI | You paste into the GitHub web editor only. No terminal, no `git`, no local server. |
| No local editors | The only code you touch is what I generate + the GitHub editor. |
| Full-file default | Any change touching more than 3 lines ships as a COMPLETE file, ready to paste over the old one. |
| ≤3-line edits only when tiny | I will only ask you to replace / insert / cut when the diff is 3 lines or fewer, and I will give the exact anchor text. |
| Always name the target | Every delivered file states **Repo** + **exact GitHub file path** at the top. |
| Verify → report → next | After each step you test on desktop AND phone, report the result, then we move on. |
| Park, don't chat | New ideas go into `docs/BACKLOG.md`, never into conversation. |

If a step ever blanks the app: open F12 → Console → first RED line names the
file. Paste that line back to me; I will re-deliver the full clean file.

---

## 1. Phase 0 — Verify & housekeep (no code, ~15 min)

Goal: confirm the V3 end-state is clean before building on it.

- [ ] Open `https://legendalive.github.io/Weaver/admin/ai-keys.html` → should 404. If it loads, delete the file (Repo `Weaver`, path `admin/ai-keys.html`).
- [ ] Open `https://legendalive.github.io/Weaver/admin/` → sign in → confirm Tickets, AI Monitor, Credits, Announcements tabs all load.
- [ ] Open `https://legendalive.github.io/Weaver/welcome/pricing.html` → confirm all three purchase buttons resolve to a real Gumroad page (currently all point at `cqxxpt`; that's expected pre-Phase-5).
- [ ] Note in your calendar: Supabase access tokens expire. When `weaver-server` Actions go red with `401`, regenerate the token (Supabase → avatar → Access tokens) and update the GitHub secret `SUPABASE_ACCESS_TOKEN`.

Report back what you see, then we start Phase 1.

---

## 2. Phase 1 — Library series grouping

**Goal:** In the Library, a series renders as ONE card (series name + book
count). Tapping it expands to show its books. The "＋ Add book" button moves
to the series row. Standalone projects stay as single cards.

**Why first:** It's the highest-visibility growth item, frontend-only, and
de-risks the `launch.js` rewrite in isolation before we touch the editor.

**Files affected**

| Repo | Path | Delivery |
|---|---|---|
| Weaver | `js/views/launch.js` | FULL file |
| Weaver | `css/views.css` | FULL file (append new series-card rules; keeps existing hero/cards) |

No backend change. `core/storage.js` already exposes `listSeries()`,
`getSeries()`, and `listProjects()` with `seriesId` — we only regroup in the view.

**Steps**
1. I deliver full `js/views/launch.js`. Logic: group `listProjects()` by `seriesId`; series group → one expandable card; standalone → normal card. "＋ Add book" lives on the series card header and calls `openWizardFn({ seriesId, seriesName })`.
2. I deliver full `css/views.css` with the new `.series-card`, `.series-card-books`, expand/collapse styles appended. Existing hero + project-card rules preserved verbatim.
3. You paste both, hard-refresh, test:
   - A series with 2+ books shows as one card with count.
   - Tap → books list appears; tap a book → opens workspace.
   - "＋ Add book" opens the wizard pre-scoped to that series.
   - Standalone projects unchanged.
   - Phone layout still stacks cleanly.

**Verify checklist**
- [ ] Series card shows name + book count.
- [ ] Expand/collapse works on desktop and phone.
- [ ] Add-book opens wizard with series preselected.
- [ ] No console errors; no blank screen.

---

## 3. Phase 2 — Accept split ("Accept whole" / "Accept highlighted")

**Goal:** Replace the single "Accept as is" action with two explicit buttons
so writers can push an entire Manuscript or only their highlighted selection
into the Main Novel. Add a one-line hint: "Move text to Main Novel before
EPUB export."

**Why:** Directly supports the EPUB workflow (Phase 5) and removes ambiguity
about what gets accepted.

**Files affected**

| Repo | Path | Delivery |
|---|---|---|
| Weaver | `js/panels/manuscript.js` | FULL file (exports a new `acceptWhole()` alongside existing `acceptAsIs()` which becomes the highlighted path) |
| Weaver | `js/views/workspace.js` | FULL file (footer now renders two buttons; pick()-resolution untouched) |
| Weaver | `js/features/export.js` | FULL file (adds the hint line in the EPUB picker modal) |

`manuscript.js` is load-bearing (block engine). I will re-deliver the ENTIRE
file with only the accept logic added — paging, sticky-bottom, runway,
selection bundling all preserved exactly.

**Steps**
1. I deliver full `js/panels/manuscript.js` adding `acceptWhole()` (pushes entire Manuscript text) and renaming intent of existing `acceptAsIs()` to highlighted-only (keep function name for back-compat; it already does selection).
2. I deliver full `js/views/workspace.js` so the Manuscript footer renders two buttons: "Accept whole" and "Accept highlighted". The defensive `pick()` block and MISSING banner stay intact.
3. I deliver full `js/features/export.js` adding a hint under the EPUB picker: "Tip: move text from Manuscript into Main Novel before exporting EPUB."
4. You paste all three, hard-refresh, test:
   - "Accept highlighted" with a selection → moves only that text, cuts from Manuscript (D1 freeze holds).
   - "Accept whole" with no selection → moves entire Manuscript to Main Novel, clears Manuscript.
   - Duplicate-guard still fires.
   - EPUB picker shows the new hint.

**Verify checklist**
- [ ] Both buttons visible in Manuscript footer (desktop + phone).
- [ ] Accept highlighted cuts selection only.
- [ ] Accept whole moves everything.
- [ ] Duplicate confirm still appears.
- [ ] EPUB hint present.
- [ ] No blank screen; paging/sticky-bottom still smooth.

---

## 4. Phase 3 — Supervisor role (support delegation)

**Goal:** Create a lesser admin tier — "Supervisor" — that can handle support
tickets and view the AI monitor, but CANNOT grant credits, delete/ban users,
change announcements, manage AI keys, run backups, or see the owner's audit log.

**Design**
- New table `supervisors` (user_id uuid primary key, added_at timestamptz).
  Only service_role can write it. Owner adds supervisors via a small SQL
  insert or a future admin UI.
- `support-admin` function: allow request if user is OWNER **or** present in `supervisors`.
- `help` function's `/api/help-log` (AI monitor): same owner-or-supervisor gate.
- `admin` function stays OWNER-ONLY (credits, users, announcements, backups, audit).
- Frontend `admin/index.html`: on load, detect role. Supervisors see ONLY
  "Messages" (Tickets + AI Monitor). Credits/Announcements/Audit tabs hidden.

**Files affected**

| Repo | Path | Delivery |
|---|---|---|
| weaver-server | `supabase/functions/support-admin/index.ts` | FULL file |
| weaver-server | `supabase/functions/help/index.ts` | FULL file (gate the help-log endpoint) |
| Weaver | `admin/index.html` | FULL file (role-aware tab rendering) |
| Supabase | SQL (paste in SQL Editor) | Small script (I give exact SQL) |

**Steps**
1. I give you the SQL to create the `supervisors` table (you paste in Supabase → SQL Editor → Run).
2. I deliver full `support-admin/index.ts` with the owner-or-supervisor check.
3. I deliver full `help/index.ts` gating the AI-monitor endpoint.
4. I deliver full `admin/index.html` that reads the viewer's role and hides owner-only tabs for supervisors.
5. You push `weaver-server` (green tick), then paste `admin/index.html`.
6. Test as owner (full access) and, if you have a second account, add it to `supervisors` and confirm it sees only Messages.

**Manual adds**
- Run the `supervisors` SQL in Supabase.
- To grant someone supervisor: `insert into supervisors(user_id) values ('<their-uuid>');`

**Verify checklist**
- [ ] Owner still sees all tabs.
- [ ] Supervisor sees only Tickets + AI Monitor.
- [ ] Supervisor CANNOT reach credits/users/announcements/backups.
- [ ] Ticket replies still email via Brevo.

---

## 5. Phase 4 — Ticket report CSV

**Goal:** Let the admin (owner or supervisor) export all support tickets +
replies + help-log as a CSV for offline review.

**Approach:** Client-built CSV in `admin/index.html` from data already fetched
by `support-admin` (tickets + replies) and `help` (help-log). No new backend
endpoint needed.

**Files affected**

| Repo | Path | Delivery |
|---|---|---|
| Weaver | `admin/index.html` | FULL file (adds an "Export CSV" button in the Messages tab) |

**Steps**
1. I deliver full `admin/index.html` with an "Export CSV" button that assembles tickets + replies + help-log rows into a CSV and triggers a browser download.
2. You paste, open admin → Messages → click Export CSV → confirm a file downloads with correct columns (ticket id, subject, user email, status, created, replies, help-log question/answer/resolved).

**Verify checklist**
- [ ] Button visible to owner and supervisor.
- [ ] CSV opens cleanly in a spreadsheet.
- [ ] Includes tickets, threaded replies, and help-log.

---

## 6. Phase 5 — Gumroad 3-product setup & relink

**Goal:** Stand up three real Gumroad products and point every upgrade surface
at the correct one. Then run a full purchase test.

**Products to create in Gumroad (manual, you do this in the Gumroad dashboard)**

| Name | Price | Permalink |
|---|---|---|
| Weaver Pro — Monthly | $8 / month | `weaver-monthly` |
| Weaver Pro — Yearly | $60 / year | `weaver-yearly` |
| Weaver Pro — Lifetime | $149 one-time | `weaver-lifetime` |

Use seller `mbenson62`. Keep the existing `cqxxpt` product live until these
are confirmed, then you can archive it.

**Files affected (relink only)**

| Repo | Path | Delivery |
|---|---|---|
| Weaver | `welcome/pricing.html` | FULL file (three buttons → three permalinks) |
| Weaver | `js/features/scribe.js` | ≤3-line edit (update `UPGRADE_URL` constant) |
| Weaver | `js/features/settings.js` | ≤3-line edit (update the upgrade `<a href>`) |

Because the scribe.js and settings.js changes are a single URL constant each,
those qualify as ≤3-line targeted edits. I will give you the exact line and
the exact replacement. Everything else is full-file.

**Steps**
1. You create the three Gumroad products; send me the three live URLs.
2. I deliver full `welcome/pricing.html` with the three real links and matching copy.
3. I give you the ≤3-line edit for `scribe.js` (the `UPGRADE_URL` value) and the ≤3-line edit for `settings.js` (the upgrade anchor href).
4. You paste pricing.html, apply the two tiny edits.
5. **End-to-end purchase test** (critical):
   - Sign up a FRESH Weaver account (not your owner account).
   - Buy the monthly product on Gumroad using that account's email.
   - As owner, open admin → Credits → grant Pro to that account.
   - Sign in as the new account → confirm unlocks: cloud sync badge, Scribe input, temperature slider in Settings, EPUB export.

**Verify checklist**
- [ ] Pricing page buttons go to three distinct Gumroad products.
- [ ] Scribe upgrade card + Settings upgrade button use the right link.
- [ ] Fresh-account purchase → manual grant → all Pro features unlock.

---

## 7. Later (not in this phase, listed so we don't lose them)

- Strict one-way cloud actions (push-only / pull-only) if users request — touches `features/cloud.js` internals.
- Credits-exhausted CTA parity when the server denies a generation (currently only the client gate shows the upgrade card).

## 8. Parked (explicitly deferred)

Full PDF import (reject-with-guidance is final) · TTS/audiobook ·
multi-platform Gumroad · Stripe/PayPal + Kenya research · EU-domain/GDPR pass ·
trash / 30-day recovery · legacy env AI-secret cleanup.

## 9. Scrapped (do not revive without new facts)

Silent Puter auto-accounts · merged contextual "Cloud Sync" button ·
free-user AI panel removal (kills the trial funnel; the CTA card replaces it) ·
Stonecode/SwingMatrix company names.

---

## Suggested build order (dependencies)

Phase 0 (verify) → Phase 1 (library) → Phase 2 (accept) → Phase 5 (Gumroad,
so Phase 3/4 admins can be tested against a real paying flow) → Phase 3
(supervisor) → Phase 4 (CSV).

We do ONE phase at a time. You verify and report before the next.
