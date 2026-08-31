# US-12.1 — Weekly calendar view

**Status:** CLOSED (2026-08-30) — VALIDATION PASS WITH NOTES `d642e70` (18/18, 5/5 AC) · QA APPROVE WITH CONDITIONS `80766dc` after fix `79546ab` (0 Critical/High) · PO AC check-off. BE `9ac84dc` · FE `de2fe1e`. Mark published / IG URL → US-12.2.

**As a** Operator, **I want** a calendar of planned and approved Reels, **so that** I can hit 3 posts per week.

Ship **Operator aggregate weekly calendar V1 (Phase A)**: multi-client week grid (Mon–Sun) showing planned Reels from approved strategies, live pipeline status colors, per-client gap warnings when fewer than 3 slots are scheduled, and a side-panel detail workflow with deep links into existing Operator production surfaces. **`publish_status` writes and “Mark published” stay in US-12.2.**

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-12.1 (do **not** check off in PREP).

**This folder:** [`plan/stories/US-12.1/`](./) — `README.md` · `TASKS.md`. Next gates per [`docs/development/AGENT-ROSTER.md`](../../../docs/development/AGENT-ROSTER.md).

**Branch:** `feature/US-12.1-weekly-calendar`

**Depends on:** [US-11.3](../US-11.3/) ✅ stable `approved` approvals + Cliente `/ready-to-publish` (Operator must **not** reuse) · [US-4.1](../US-4.1/) ✅ + [US-4.2](../US-4.2/) ✅ approved strategy slots with `dayOfWeek` · upstream pipeline tables (scripts, video jobs, assembly, QA, approvals) already shipped through Sprint 6.

**Upstream contracts:** [US-4.1 CONTRACT](../US-4.1/CONTRACT.md) (slot shape, `week_start`) · [US-11.3 CONTRACT](../US-11.3/CONTRACT.md) (Operator ≠ Cliente ready-to-publish) · [US-11.1 CONTRACT](../US-11.1/CONTRACT.md) (approval statuses) · `lib/trend/normalize-week-start.ts` · `plan/SECURITY_BASELINE.md` § US-12.1 visibility · `plan/DESIGN_PROMPTS.md` § 10 Content Calendar.

**Unblocks:** [US-12.2](../../USER_STORIES.md) mark manual publication · ADR-0002 Instagram publish (re-check `approved`) · future Cliente-scoped calendar (separate endpoint — not this story).

---

## Scope in

| Area | What US-12.1 BUILD adds |
|------|-------------------------|
| **FE (Operator)** | **`/operator/calendar`** week grid (Mon–Sun columns); Reel cards per day (client name, tema/title, status color, optional thumbnail); **per-client gap banner** when &lt;3 slots scheduled for the week; week picker + prev/next navigation; **click → Sidebar** detail panel with summary + deep links; EN/ES day/month labels via `Intl` / existing `calendar.*` namespace; Operator header nav entry; loading / empty / error states. |
| **BE** | **New Operator-only aggregate** Server Action (no `client_id` param) — `requireOperator("handler")` → 403 for Cliente; **`syncCalendarSlotsForWeek`** idempotent upsert from approved strategies; **pipeline status derivation** at read time; **`getOperatorCalendarForWeek({ weekStart })`** DTO for grid + panel; optional **`getOperatorCalendarSlotDetail({ slotId })`** if panel needs second fetch (CONTRACT picks). |
| **DB** | **`neuramark_content_calendar_slots`**: `client_id`, `week_start`, `scheduled_date`, `slot_index`, `reel_script_id` (nullable), `strategy_id`, `publish_status` (`ready` \| `published`, default `ready`); UNIQUE `(client_id, week_start, slot_index)`; RLS deny-by-default. **US-12.1 reads `publish_status`; only US-12.2 writes `published`.** |
| **Implementers** | **nextjs-backend** + **nextjs-frontend** only. **No** content-agents-engineer · **No** media-pipeline-engineer · **No** integrations-engineer. |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **Mark published / IG URL / `published_at`** | US-12.2 owns `publish_status` writes |
| **Drag-and-drop reschedule** | Phase B defer — grid is read-only in Phase A |
| **Cliente calendar view** | Future story — separate client-scoped endpoint per [SEC] AC |
| **`client_id` query param on Operator aggregate** | Forbidden per SECURITY_BASELINE — server aggregates all active clients |
| **Reuse Cliente `/ready-to-publish`** | Frozen US-11.3 — Operator aggregate is a new surface |
| **Instagram Graph publish** | ADR-0002 / integrations-engineer |
| **Weekly cycle auto-populate hook on strategy approve** | integrations-engineer — V1 syncs on calendar read |
| **Operator cross-client impersonation / “view as Cliente”** | Out of scope — deep links remain session-scoped (see PO #6) |
| **Metrics / post-publish analytics** | US-13.x |
| **New approval or QA mutations** | Read-only consumption of existing rows |

## Canonical terms (CONTEXT)

Use **Calendario de contenido**, **Estrategia semanal**, **Operator**, **Cliente**, **Reel**, **listo para publicar**, **Aprobación**, **Ensamblado**.  
_Evitar:_ “publish queue” on Operator surfaces; admin/staff; exposing storage keys; filtering the Operator aggregate in the browser by client.

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-4.1 / US-4.2 | Approved strategy brief with ≥3 slots, optional `dayOfWeek`, `week_start` ISO Monday |
| US-5.1 / US-6.x | `neuramark_reel_scripts` + captions per slot |
| US-8.x / US-9.x | Video jobs, assembly, branding |
| US-10.x | QA reports + gate helper |
| US-11.x | Approvals lifecycle; Cliente `/ready-to-publish` for `approved` |
| Operator routes | `/operator/strategy`, `/operator/scripts` use `?weekStart=` + `normalizeToIsoMonday` |
| Auth | `app/(app)/operator/layout.tsx` → `requireOperator("page")` |

**US-12.1 adds the multi-client Operator calendar aggregate** — not Cliente scheduling UI, not publish writes, not drag-and-drop.

---

## Phased BUILD (PO)

| Phase | Scope | Closes |
|-------|-------|--------|
| **A (US-12.1 BUILD — ship all in this story)** | DDL `neuramark_content_calendar_slots` · sync-on-read from approved strategies · aggregate list action · pipeline status derivation · `/operator/calendar` grid + gap warnings · Sidebar detail panel · week navigation · status colors · Operator nav · [SEC] `requireOperator` + no `client_id` param · EN/ES labels | USER_STORIES § US-12.1 AC (all five) |
| **B (deferred — not US-12.1)** | Drag-and-drop slot reschedule · persist manual date moves · Operator multi-client context switcher for deep links · auto-sync on strategy approve (cron/hook) · Cliente-facing calendar endpoint | Backlog / US-12.x+ / integrations |

**VALIDATION note (binding):** Phase A closes full US-12.1 AC. Sidebar satisfies “click slot opens Reel detail workflow”; deep link to `/operator/scripts` is supplementary. `publish_status = published` displays correctly when US-12.2 has written rows but US-12.1 must not ship mark-published UI.

---

## Upstream / downstream handoffs

| Direction | Artifact | Rule |
|-----------|----------|------|
| **From US-4.2** | Latest **approved** strategy per `(client_id, week_start)` | Only approved briefs materialize calendar slots |
| **From US-5.1+** | `reel_script_id` per `(strategy_id, slot_index)` | Linked on sync; nullable when script not generated |
| **From US-11.3** | `neuramark_approvals.status = approved` | Drives **approved** display status; do not call Cliente list action |
| **To US-12.2** | `neuramark_content_calendar_slots.publish_status` + slot row id | 12.2 updates `published` + optional IG URL |
| **To ADR-0002** | Calendar shows **approved** Reels ready to post | Publish adapter re-checks approval server-side |
| **Future Cliente calendar** | **New** endpoint scoped to `getCurrentUser().id` | Never reuse Operator aggregate |

---

## PO decisions frozen (2026-08-30)

| # | Topic | Decision |
|---|-------|----------|
| 1 | **Route** | **`/operator/calendar`** with **`?weekStart=YYYY-MM-DD`** query param (ISO Monday). Lives under `app/(app)/operator/` + existing `requireOperator` layout. **Not** top-level `/calendar` (Cliente-facing association + inconsistent with Operator hub). |
| 2 | **Week navigation** | **ISO week Monday (UTC)** — reuse `normalizeToIsoMonday`, `trendWeekStartSchema`, `formatWeekRange`. Prev/next week buttons + PrimeReact `Calendar` picker (same UX as `/operator/strategy` and `/operator/scripts`). Default week = current ISO Monday when param absent/invalid. |
| 3 | **Slot source** | **Hybrid:** persist rows in **`neuramark_content_calendar_slots`**, materialized by **`syncCalendarSlotsForWeek(weekStart)`** at the start of each aggregate read (idempotent upsert). **Scheduling identity** (client, date, slot_index, reel_script_id, strategy_id) lives in the table; **pipeline display status** is **derived at read time** from scripts / video jobs / assembly / QA / approvals — not duplicated in the table. **No `publish_status` writes in US-12.1** except default `ready` on insert. |
| 4 | **`scheduled_date` mapping** | For each approved strategy slot: `scheduled_date = week_start + dayOfWeek offset`. If `dayOfWeek` missing, default **`monday` + slotIndex×2 days** capped to Sunday (slot 0→Mon, 1→Wed, 2→Fri, 3→Sun, …). CONTRACT may refine but must stay deterministic. |
| 5 | **Status color mapping** | Single **`pipelineStatus`** enum for card color (priority cascade — first match wins): **`published`** (`publish_status = published`) → **`approved`** (approval `approved`) → **`pending`** (approval `pending_client` or `changes_requested`) → **`qa`** (branded assembly exists, QA report exists or assembly complete awaiting approval enqueue, and no terminal approval yet) → **`generating`** (script missing OR caption missing OR active video/assembly/branding job OR script/caption job in flight) → **`draft`** (approved strategy slot synced, earliest planning stage). Colors: draft=grey, generating=blue, qa=amber, pending=orange, approved=green, published=violet (per DESIGN_PROMPTS). |
| 6 | **Detail workflow on click** | **PrimeReact Sidebar** opens on card click with **`CalendarSlotDetailDto`** (client, tema, scheduled date, pipeline status, thumbnail/preview when assembled asset exists, approval summary if any). **Primary CTA:** “Open in Scripts” → `/operator/scripts?weekStart={weekStart}&highlightSlot={slotIndex}` (CONTRACT defines `highlightSlot`; FE scrolls/expands if present). **Secondary:** “View strategy” → `/operator/strategy?weekStart={weekStart}`. **Known V1 limitation:** scripts/strategy actions remain **session `clientId`**-scoped — deep links work for the Operator’s session client; other clients are fully actionable from the Sidebar summary until multi-client Operator context lands (Phase B). |
| 7 | **Gap indicator** | **Per active client** with an approved strategy for the week: if **&lt;3** calendar slot rows after sync, render a **warning card** in the grid (design: “N slot(s) unfilled”) grouped under that client — visible at week level (banner or client strip), not only on empty days. Clients with **no** approved strategy for the week: **exclude** from gap math (optional empty-state row — CONTRACT decides). |
| 8 | **Aggregate scope** | Include **all `neuramark_clients.active = true`** with approved strategy for `weekStart`. No `client_id` filter on the Operator endpoint. Ordering: by `scheduled_date`, then `client display_name`, then `slot_index`. |
| 9 | **Drag-and-drop** | **Phase B defer.** Phase A grid is **read-only** for dates; no reschedule mutations. |
| 10 | **[SEC] Operator gate** | New Server Action(s) call **`requireOperator("handler")`** first; Cliente session → **403**. Page inherits layout gate. **No `client_id` in request body or query** on the aggregate action. |
| 11 | **[SEC] Future Cliente calendar** | Document in SECURITY: Cliente calendar = **new** action scoped to server-resolved `client_id`; never filter Operator DTO client-side; never add `client_id` to Operator aggregate. |
| 12 | **i18n** | New namespace **`calendar.*`**: page title, week labels, day headers (Mon–Sun), month formatting, status labels, gap warning copy, sidebar CTAs, empty/error. EN + ES. Use `Intl.DateTimeFormat` for localized day/month where possible. |
| 13 | **Implementers** | **nextjs-backend** (migration, sync, aggregate query, status derivation, contracts) + **nextjs-frontend** (grid, sidebar, nav, i18n). |
| 14 | **Rejected approvals** | **Hide** from calendar cards (no card for `rejected`); slot reverts to **`generating`** or **`qa`** based on pipeline if assembly still exists — CONTRACT freezes exact rule. |
| 15 | **DB naming** | Table **`neuramark_content_calendar_slots`**; indexes on `(week_start)`, `(client_id, week_start)`, `(scheduled_date)`. |

---

## Gates (orchestrator)

- [x] PREP — README + TASKS + PO freezes
- [x] SPEC-REVIEW.md (spec-guardian) — note SPEC §3 P2 vs USER_STORIES P1 precedence
- [x] SECURITY.md (security-architect)
- [x] CONTRACT.md (nextjs-backend) — Reviewed by FE
- [x] BUILD (nextjs-backend + nextjs-frontend)
- [x] VALIDATION.md
- [x] QA.md
- [x] CLOSE — 5/5 AC checked in USER_STORIES.md (product-owner)

**Next:** SELECT **US-12.2** (recommended) mark manual publication · optional security test hardening · repo TTS build fix.

---

## Open questions (for SECURITY / CONTRACT — not PREP blockers)

| # | Question | PO lean |
|---|----------|---------|
| 1 | Action names: `getOperatorCalendarForWeek` vs `listCalendarSlots`? | **`getOperatorCalendarForWeek({ weekStart })`** returning `{ weekStart, weekRangeLabel, clients[], slots[], gapWarnings[] }`. |
| 2 | Single fetch vs panel refetch? | **Single fetch** includes panel fields; optional **`slotId`** refetch only if payload too heavy — lean single fetch. |
| 3 | Thumbnail source | **`previewUrl`** from assembled/branded media asset when exists (same pattern as approval package — server-built path, never storage key). |
| 4 | `highlightSlot` on `/operator/scripts` | **Add optional query param** in US-12.1 FE only (scroll/expand row) — no BE change if scripts list already keyed by `slotIndex`. |
| 5 | Clients without approved strategy | **Omit** from grid; show optional week-level summary “N active clients without approved strategy” — CONTRACT decides visibility. |
| 6 | `changes_requested` card copy | Show as **`pending`** color with sub-badge “Revision requested” — FE detail in CONTRACT. |
| 7 | Rate limit on aggregate read | **Reuse operator read bucket** or **60/min** — SECURITY picks; lean no strict limit for Operator read beyond auth. |
| 8 | Sync deletes stale slots when strategy superseded? | **Upsert + soft-delete** slots whose `(client_id, week_start, slot_index)` no longer in latest approved brief — CONTRACT defines `deleted_at` vs hard delete. Lean **delete orphan rows** on sync. |
| 9 | `publish_status` enum in DDL | **`ready` \| `published`** only for V1 (align US-12.2); no `scheduled` column value. |
| 10 | SPEC P2 label vs Phase 5 backlog | USER_STORIES is sprint source of truth; spec-guardian confirms no scope conflict with “calendario agregado multi-cliente” in SPEC §3 Operator actions. |

---

## SPEC alignment / blockers for spec-guardian

| Item | Assessment |
|------|------------|
| Operator aggregate calendar | **ALIGNED** with SPEC §3 Operator-only “calendario agregado multi-cliente” |
| SPEC §3 P2 module label vs USER_STORIES P1 | **FLAG** — reconcile as sprint promotion; no scope reduction in PREP |
| 3 Reels/week gap | **ALIGNED** with roadmap hard rule |
| No publish without approval | **ALIGNED** — display only; US-12.2 enforces publish transition |
| Cliente calendar later | **ALIGNED** with SECURITY_BASELINE § (e) — separate endpoint |
