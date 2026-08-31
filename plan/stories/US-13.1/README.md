# US-13.1 — Record basic post metrics manually

**Status:** PREP (2026-08-31) — README + TASKS · gates pending  
**As a** Operator, **I want** to enter views, likes, comments, saves, and DMs, **so that** we learn what works without a full analytics stack.

Ship **Operator Metrics Lite V1 (Phase A)**: from the existing `/operator/calendar` Sidebar on **published** Reels, enter five non-negative integer counters; persist one metrics row per **Ensamblado** in `neuramark_reel_metrics`; enforce **published-only**, **7-day edit window**, and **Operator-only** server-side. Unlocks US-13.2 strategy insights injection.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-13.1 (do **not** check off in PREP).

**This folder:** [`plan/stories/US-13.1/`](./) — `README.md` · `TASKS.md`. Next gates: `SPEC-REVIEW.md` · `SECURITY.md` · `CONTRACT.md` (not created in PREP).

**Branch:** `feature/US-13.1-reel-metrics`

**Depends on:** [US-12.2](../US-12.2/) ✅ CLOSED — published slots on calendar with `publish_status=published`, `publishedAt`, `assembledReelId` in calendar DTO · mark-published Sidebar pattern.

**Upstream contracts:** [US-12.2 README](../US-12.2/README.md) · [US-12.1 CONTRACT](../US-12.1/CONTRACT.md) · [US-12.2 CONTRACT](../US-12.2/CONTRACT.md) · `lib/contracts/calendar.ts` · `components/calendar/OperatorCalendarView.tsx` · SPEC §3 Metrics Lite (P2 label; sprint P1 per USER_STORIES).

**Unblocks:** [US-13.2](../../USER_STORIES.md) aggregate metrics by theme/pillar → strategy agent prompt.

---

## Scope in

| Area | What US-13.1 BUILD adds |
|------|-------------------------|
| **FE (Operator)** | **Metrics section** in calendar **Sidebar** when `pipelineStatus === 'published'` and `assembledReelId` present; PrimeReact **`InputNumber`** (integer mode) for **views**, **likes**, **comments**, **saves**, **dms**; **Save** CTA when within edit window; **read-only** display after window expires; show **`recordedAt`** when metrics exist; loading / validation / server error states; EN/ES `calendar.metrics.*`; refresh week/slot after save (match CONTRACT return shape). |
| **BE** | **New** Server Action **`upsertReelMetrics`** — `requireOperator("handler")` first → 403; Zod input (`assembledReelId` + five counters); **published-only** gate via calendar slot join; **7-day edit window** from slot `published_at`; non-negative integers + sane upper bound; **upsert** one row per `assembled_reel_id`; extend calendar read DTO with optional **`metrics`** snapshot on published slots; core helper + tests. |
| **DB** | **`neuramark_reel_metrics`**: `assembled_reel_id` (UNIQUE), `client_id`, five integer counters, `recorded_at`, timestamps; RLS deny-by-default unchanged. |
| **Implementers** | **nextjs-backend** + **nextjs-frontend** only. **No** content-agents-engineer · **No** media-pipeline-engineer · **No** integrations-engineer. |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **Instagram Insights / Graph API auto-import** | No analytics stack in V1; manual entry only |
| **Separate `/operator/metrics` route or page** | DESIGN continuity — Sidebar on calendar (same as mark-published) |
| **Cliente metrics entry or Cliente calendar metrics** | Operator-only surface |
| **`client_id` on mutation input** | Forbidden — authority from `assembledReelId` + server joins |
| **Charts, trends UI, leaderboards** | US-13.2 consumes aggregates server-side; no dashboard widgets here |
| **Strategy agent prompt injection** | US-13.2 |
| **Bulk CSV import / batch edit** | Phase B defer |
| **Edit window override for Operator** | Phase B defer — V1 hard cutoff |
| **Metrics on non-published Reels** | AC: published only |
| **RBAC beyond `requireOperator()`** | Unchanged |
| **Extending mark-published or calendar sync** | US-12.2 owns publish writes |

## Canonical terms (CONTEXT)

Use **Calendario de contenido**, **Operator**, **Cliente**, **Reel**, **Ensamblado**, **publicado**, **métricas** (Metrics Lite).  
_Evitar:_ full analytics stack vocabulary as product promise; admin/staff; client-supplied `client_id` as authority; free-text metric fields.

## What US-12.2 already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-12.2 | `/operator/calendar` Sidebar; `pipelineStatus === 'published'`; `publishedAt`, `instagramPostUrl`, `assembledReelId` on `CalendarSlotDetailDto`; `markCalendarSlotPublished` pattern |
| US-12.1 | Week grid + Sidebar shell; `getOperatorCalendarForWeek`; Operator cross-client read |
| DB | `neuramark_content_calendar_slots.publish_status`, `published_at` — **metrics gate reads these**; no new publish columns |

**US-13.1 adds metrics persistence + Sidebar form** — not a new calendar page, not Instagram API, not strategy injection.

---

## Phased BUILD (PO)

| Phase | Scope | Closes |
|-------|-------|--------|
| **A (US-13.1 BUILD — ship all in this story)** | DDL `neuramark_reel_metrics` · `upsertReelMetrics` · published-only + 7-day window + integer bounds · calendar DTO `metrics` delta · Sidebar metrics section · read-only after window · [SEC] Operator 403 + server-side gates · EN/ES | USER_STORIES § US-13.1 AC (all five) |
| **B (deferred — not US-13.1)** | Instagram Insights API · bulk import · charts · Operator edit-window override · metrics audit log · orphan-slot re-link UI | Backlog / integrations / US-13.x polish |

**VALIDATION note (binding):** Phase A closes full US-13.1 AC. FE edit-window disable is UX only — VALIDATION must prove non-published, expired-window, and non-operator paths fail in the handler. Orphan metrics rows (calendar slot hard-deleted per US-12.1 sync) may exist in DB but are not writable via calendar UI V1.

---

## Upstream / downstream handoffs

| Direction | Artifact | Rule |
|-----------|----------|------|
| **From US-12.2** | `publish_status = published`, `publishedAt`, `assembledReelId` | Metrics UI + write gate only on published Reels |
| **From US-12.1** | Calendar Sidebar, slot ↔ script join path | Published check joins `neuramark_content_calendar_slots` via `reel_script_id` |
| **From US-9.x** | `neuramark_assembled_reels.id` + `client_id` | Metrics FK + tenancy verification |
| **To US-13.2** | `neuramark_reel_metrics` rows keyed by `assembled_reel_id` | Aggregate by theme/pillar via script → strategy slot; `recorded_at` for recency |
| **Orphan note (US-12.2)** | Sync hard DELETE may drop published calendar row | Metrics row may survive; US-13.2 aggregate still valid; calendar Sidebar write path requires live published slot |

---

## PO decisions frozen (2026-08-31)

| # | Topic | Decision |
|---|-------|----------|
| 1 | **Table name** | **`neuramark_reel_metrics`** (physical table; USER_STORIES shorthand `reel_metrics`) |
| 2 | **UI surface** | **Metrics section on calendar Sidebar** — visible when `pipelineStatus === 'published'` and `assembledReelId != null`. **No** separate route/page. Collapsible **Panel** or inline field group below publish metadata (PrimeReact `InputNumber`). |
| 3 | **Mutation authority** | **`assembledReelId`** in action input — **not** `slotId`. One metrics row per Ensamblado (UNIQUE on `assembled_reel_id`). Server verifies assembled reel exists, resolves `client_id` from reel row (never from request). |
| 4 | **Published gate** | At write time: require ≥1 **`neuramark_content_calendar_slots`** row with **`publish_status = 'published'`** linking to the assembled reel's **`reel_script_id`** (same join path as calendar read). Non-published → structured error (e.g. `NOT_PUBLISHED`). FE visibility insufficient alone. |
| 5 | **7-day edit window anchor** | **`published_at`** on the linked published calendar slot (timestamptz from US-12.2). Edits allowed while **`now() <= published_at + REEL_METRICS_EDIT_WINDOW_DAYS`**. Window is **configurable server-side** constant (default **7**); **not** anchored to `recorded_at`. After expiry: **read-only** in UI; handler rejects updates with e.g. `EDIT_WINDOW_EXPIRED`. **Initial create** also requires within window (no late first entry beyond 7 days post-publish V1). |
| 6 | **Metric fields** | Five required integers on every save: **`views`**, **`likes`**, **`comments`**, **`saves`**, **`dms`**. All **≥ 0**. Zod + DB enforce **≤ `REEL_METRICS_MAX_VALUE`** (lean **99_999_999** — CONTRACT may tune). No floats, no free text. |
| 7 | **Upsert semantics** | **UPSERT** on `assembled_reel_id`: INSERT sets `recorded_at = now()`; UPDATE refreshes counters + **`recorded_at = now()`** + `updated_at`. Full snapshot replace (all five fields required each save). |
| 8 | **Read path** | Extend **`CalendarSlotDetailDto`** with optional **`metrics: ReelMetricsDto \| null`** (`views`, `likes`, `comments`, `saves`, `dms`, `recordedAt`, `editable: boolean`) loaded in **`getOperatorCalendarForWeek`** for published slots — **single-fetch** Sidebar pattern (no second action in Phase A). |
| 9 | **Auth / authority** | **`requireOperator("handler")` first** — zero side effects on 403. Input strict; **forbid** `client_id` / `clientId`. Operator may write metrics for **any** tenant's published Reel (multi-client calendar — same trust model as US-12.1/12.2). |
| 10 | **Contract module** | New **`lib/contracts/reel-metrics.ts`** for Zod/types/constants; calendar DTO imports metrics snapshot type (avoid bloating `calendar.ts` with write schemas). |
| 11 | **Action name** | **`upsertReelMetrics`** Server Action under `lib/metrics/actions/` (sibling pattern to `lib/calendar/actions/`). Optional **`upsertReelMetricsCore`** for tests. |
| 12 | **Rate limit** | **Operator write bucket** — lean **30 saves per operator `client_id` per rolling 60 minutes** (mirror US-12.2 mark-published); SECURITY/CONTRACT may adjust. |
| 13 | **Post-mutation UX** | On success: toast/inline success; **re-fetch** week via `getOperatorCalendarForWeek` (or merge returned metrics — CONTRACT picks; lean refresh week). |
| 14 | **i18n** | Namespace **`calendar.metrics.*`**: field labels, save CTA, read-only hint, window-expired copy, validation errors, empty-state “No metrics yet”. EN + ES. |
| 15 | **Implementers** | **nextjs-backend** (migration, action, Zod, calendar DTO join, tests) + **nextjs-frontend** (Sidebar section, InputNumber form, i18n, gating). |
| 16 | **US-13.2 handoff** | Stable **`neuramark_reel_metrics`** with `client_id`, counters, `recorded_at`, join via `assembled_reel_id` → script → strategy **`tema`** / pillar. No prompt work in this story. |
| 17 | **Orphan metrics** | If calendar slot hard-deleted but metrics row remains: **no** Sidebar write path (no published slot); row retained for US-13.2 aggregate; no DELETE cascade from slot in V1. |

---

## Gates (orchestrator)

- [x] PREP — README + TASKS + PO freezes
- [ ] SPEC-REVIEW.md (spec-guardian)
- [ ] SECURITY.md (security-architect)
- [ ] CONTRACT.md (nextjs-backend) — Reviewed by FE
- [ ] BUILD (nextjs-backend + nextjs-frontend)
- [ ] VALIDATION.md
- [ ] QA.md
- [ ] CLOSE — 5/5 AC checked in USER_STORIES.md (product-owner)

**Next:** SPEC-REVIEW → SECURITY → CONTRACT (freeze Zod + DDL + error codes) → BUILD.

---

## Open questions (for SECURITY / CONTRACT — not PREP blockers)

| # | Question | PO lean |
|---|----------|---------|
| 1 | Exact **`REEL_METRICS_MAX_VALUE`** | **99_999_999** per field; DB CHECK optional duplicate of Zod |
| 2 | **`EDIT_WINDOW_EXPIRED`** vs **`FORBIDDEN`** for expired edits | Dedicated **`EDIT_WINDOW_EXPIRED`** code + `messageKey` |
| 3 | Multiple published slots same `reel_script_id`? | **Use latest `published_at` DESC** among published slots for window calc; gate passes if any published slot links |
| 4 | **`InputNumber`** vs plain `InputText` with integer parse | **`InputNumber`** `useGrouping={false}` `min={0}` `max={REEL_METRICS_MAX_VALUE}` |
| 5 | Return shape on upsert success | **`{ ok: true, metrics: ReelMetricsDto }`** + FE week refresh (mirror US-12.2) |
| 6 | Zero-value UX: empty inputs vs explicit 0 | **Default form to 0**; treat empty as validation error or coalesce to 0 — CONTRACT picks (lean **coalesce blank → 0** on submit) |
| 7 | Calendar DTO **`editable`** computed server-side? | **Yes** — FE disables Save when `editable === false` |
| 8 | Index on `(client_id, recorded_at DESC)` for US-13.2? | **Optional lean yes** — helps 4-week aggregate; CONTRACT decides |
| 9 | FK **`ON DELETE CASCADE`** from `assembled_reel_id`? | **CASCADE** — if reel row deleted, metrics go; slot orphan case keeps both rows |
| 10 | Rate limit key name | **`reel_metrics_upsert`** agent key in `neuramark_agent_rate_limits` |

---

## SPEC alignment / blockers for spec-guardian

| Item | Assessment |
|------|------------|
| Manual metrics on published Reels | **ALIGNED** with SPEC §3 Metrics Lite — Operator loads counters; no full analytics stack |
| Calendar Sidebar entry | **ALIGNED** with US-12.x Operator Calendario pattern + DESIGN §10 |
| Operator-only mutation | **ALIGNED** with SPEC §2 Operator surfaces + SECURITY_BASELINE |
| SPEC P2 module vs USER_STORIES P1 | **FLAG** (same as US-12.x) — sprint source of truth; no scope reduction |
| US-13.2 dependency | **ALIGNED** — this story only persists rows; injection is downstream |
