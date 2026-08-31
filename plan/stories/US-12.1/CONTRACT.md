# API Contract — US-12.1 Weekly calendar view (Calendario de contenido)

**Story:** US-12.1  
**Status:** Frozen — 2026-08-30 · **Reviewed by FE:** yes — 2026-08-30 — nextjs-frontend  
**Security:** `plan/stories/US-12.1/SECURITY.md` (APPROVE WITH CONDITIONS — 11 conditions reconciled below)  
**Spec review:** `plan/stories/US-12.1/SPEC-REVIEW.md` (GAPS — 6 Low closed below)  
**Pattern:** US-4.1 strategy slots + `week_start` · US-5.1 scripts · US-11.3 Operator ≠ Cliente queue · US-11.1 approval statuses · `lib/trend/normalize-week-start.ts`  
**Depends on:** US-11.3 ✅ · US-4.1 ✅ · US-4.2 ✅ · US-14.5 ✅ `requireOperator()`  
**Feature branch:** `feature/US-12.1-weekly-calendar`  
**Error envelope style:** Server Actions — same as Reel scripts / Strategy (`ok: true` vs `{ ok: false, error: { code, fields?, messageKey? } }`). Route Handler media serve — JSON `{ error: "<CODE>" }` on failure (unchanged house pattern).

**This document is CONTRACT ONLY.** Zod mirrors live in `lib/contracts/calendar.ts` (committed with this freeze). Migration, sync helper, status derivation, Server Action, media-route extension, and FE page are specified here and applied during BUILD — **not shipped in this gate commit**.

**Terminology:** **Calendario de contenido** · **Estrategia semanal** · **Operator** · **Cliente** · **Reel** · **listo para publicar** · **Aprobación** · **Ensamblado**. Do **not** use CONTEXT _Evitar_ terms on Operator surfaces ("publish queue" as primary noun; admin/staff; client-side aggregate filtering; `storage_key` exposure).

---

## SPEC-REVIEW gaps closed (6 Low)

| # | Gap | Resolution in this contract |
|---|-----|----------------------------|
| 1 | SPEC §3 P2 label vs USER_STORIES P1 | § Overview — sprint source of truth is USER_STORIES + frozen PREP; full Phase A scope unchanged. Optional SPEC §3 note on next PO edit — non-blocking. |
| 2 | USER_STORIES FE row "drag optional P1" | § Phased BUILD — Phase A grid **read-only**; drag-and-drop Phase B. VALIDATION must not require drag for CLOSE. |
| 3 | USER_STORIES DB row stale (no `neuramark_` prefix) | § Database — physical table **`neuramark_content_calendar_slots`** with full column set. |
| 4 | DESIGN_PROMPTS §10 spans US-12.1 + US-12.2 | § Non-goals — no mark-published UI/action in Phase A; **display** `published` when US-12.2 has written rows. |
| 5 | Rejected-approval card rule open | § Status derivation — `rejected` never a display status; cascade excludes approval branches when rejected (rule R1). |
| 6 | Orphan slot deletion on sync open | § `syncCalendarSlotsForWeek` — **hard DELETE** orphan rows per `(client_id, week_start)` not in latest approved brief; idempotency tests required. |

---

## SECURITY reconciliation (11 conditions)

| # | SECURITY condition | **Frozen in this contract** |
|---|-------------------|----------------------------|
| 1 | `requireOperator` first — zero side effects on 403 | § `getOperatorCalendarForWeek` gate order |
| 2 | `weekStart` only input — forbidden `client_id` / `clientId` | § Request · `FORBIDDEN_CALENDAR_AUTHORITY_KEYS` |
| 3 | Future Cliente calendar = separate endpoint | § Non-goals · `FUTURE_CLIENT_CALENDAR_ACTION` |
| 4 | DTO allowlist — safe Operator fields only | § Response DTO allowlist |
| 5 | DTO denylist — no cost, storage, full content | § Response DTO denylist |
| 6 | `thumbnailPreviewUrl` regex + `mediaPreviewUrl()` | § Thumbnails · `calendarMediaPreviewPathSchema` |
| 7 | Operator cross-client `assembled_reel` media serve | § Media route extension (US-12.1 delta) |
| 8 | No Cliente queue reuse | § Forbidden imports · aggregate SQL joins pipeline directly |
| 9 | No `publish_status` UPDATE to `published` in US-12.1 | § Sync rules · § Non-goals |
| 10 | Sync-on-read Operator-only scope | § `syncCalendarSlotsForWeek` |
| 11 | Security tests minimum list | § Security tests |

**Inherited floors (US-14.5 / US-11.3 / SECURITY_BASELINE):** `requireOperator()` → `requireActive()` first; role never from request; RLS deny-by-default; service-role Node only; no browser Supabase keys; interim hardcoded user sanctioned.

---

## Phased BUILD acceptance

| Phase | Scope | Closes |
|-------|-------|--------|
| **A (US-12.1 BUILD — ship all in this story)** | DDL `neuramark_content_calendar_slots` · `syncCalendarSlotsForWeek` · `deriveCalendarPipelineStatus` · `getOperatorCalendarForWeek` · Operator cross-client `assembled_reel` media serve · `/operator/calendar` grid + gap warnings · Sidebar detail · week navigation · status colors · Operator nav · [SEC] gates · EN/ES `calendar.*` | USER_STORIES § US-12.1 AC (all five) |
| **B (deferred — not US-12.1)** | Drag-and-drop reschedule · persist manual date moves · Operator multi-client context for deep links · auto-sync on strategy approve (cron/hook) · **`getClientCalendarForWeek`** Cliente endpoint · optional `getOperatorCalendarSlotDetail` refetch | Backlog / US-12.x+ / integrations |

**VALIDATION note (binding):** Phase A closes full US-12.1 AC. Sidebar on card click satisfies "Reel detail workflow"; deep link to `/operator/scripts?weekStart=&highlightSlot=` is supplementary. Known V1 limitation: scripts/strategy deep links remain session-`clientId`-scoped (PO #6).

---

## Overview

US-12.1 ships **Operator Calendario de contenido V1 (Phase A)**: multi-client Mon–Sun week grid at **`/operator/calendar`**, materialized from latest **approved Estrategia semanal** slots, **pipeline display status** derived at read time, per-client **<3 slot gap warnings**, and **Sidebar** detail with deep links into existing Operator production surfaces. **`publish_status` writes and "Mark published" stay in US-12.2.**

**Surfaces**

| # | Surface | Kind | Consumer |
|---|---------|------|----------|
| 1 | `getOperatorCalendarForWeek` | Server Action | `/operator/calendar` RSC + week picker refresh |
| 2 | `getOperatorCalendarForWeekCore` | Server-only orchestrator | Action only |
| 3 | `syncCalendarSlotsForWeek` | Server-only helper | Called at start of aggregate read only |
| 4 | `deriveCalendarPipelineStatus` | Server-only pure fn | Per-slot status during aggregate read |
| 5 | `GET /api/media/assets/[assetId]` | Route Handler (extend) | Cross-client Operator `assembled_reel` thumbnails |
| 6 | Zod + types | `lib/contracts/calendar.ts` | FE types · BE validation |
| 7 | Migration | `neuramark_content_calendar_slots` | Sync + US-12.2 handoff |
| 8 | `/operator/calendar` | FE | Grid · Sidebar · gap UI · nav · i18n |

**Forbidden surfaces (BUILD veto):**

- `client_id` / `clientId` on Operator aggregate action, page query, or sync API.
- Reuse of `listApprovedApprovals`, `/ready-to-publish`, or Cliente approval list helpers for Operator calendar data.
- Mark-published Server Action / UI / `publish_status = 'published'` UPDATE in US-12.1 modules.
- Drag-and-drop reschedule mutations (Phase B).
- Cliente calendar as filtered Operator aggregate or Operator action + FE client filter.
- **`getClientCalendarForWeek`** in US-12.1 BUILD (name reserved for future story).
- Optional **`getOperatorCalendarSlotDetail`** in Phase A (single-fetch panel — Phase B only if payload too heavy).
- `storage_key`, cost cents, full script/caption/strategy brief, QA override reasons, provider fields, or auth PII in calendar DTO.
- Cross-client serve on `generated_video` / `voiceover` media types.
- Public Storage URLs or `NEXT_PUBLIC_` Supabase keys.
- Strategy-approve cron / webhook auto-sync (integrations-engineer).
- New approval, QA, or pipeline mutations from calendar read path.

**Why Server Action (not Route Handler):** UI-coupled Operator read under `(app)/operator/calendar`; matches `getReelScriptsForWeek` / strategy week pattern; CSRF via Next.js origin check.

**Why single fetch (no slot detail action):** SECURITY lean — reduces IDOR surface; panel fields included in `slots[]` items (`CalendarSlotDetailDto`).

---

## PO open questions — CONTRACT resolutions

| # | Question (PREP) | **Frozen resolution** |
|---|-----------------|----------------------|
| 1 | Action name | **`getOperatorCalendarForWeek({ weekStart })`** |
| 2 | Single vs panel refetch | **Single fetch** — `CalendarSlotDetailDto` fields on each slot; no second action in Phase A |
| 3 | Thumbnail source | **`mediaPreviewUrl(outputMediaAssetId)`** from branded assembly when present + § Media route cross-client serve |
| 4 | `highlightSlot` on scripts | **FE-only** query param — no BE change |
| 5 | Clients without approved strategy | **Omit** from `slots` and gap math; expose **`clientsWithoutApprovedStrategyCount`** in success payload |
| 6 | `changes_requested` copy | **`pipelineStatus = pending`** + **`changesRequested: true`** on detail DTO for FE sub-badge |
| 7 | Rate limit | **None V1** — Operator-only read; sync-on-read acceptable (SECURITY resolution) |
| 8 | Sync orphan policy | **Hard DELETE** rows whose `(client_id, week_start, slot_index)` ∉ latest approved brief |
| 9 | `publish_status` enum | **`ready` \| `published`** only; default `ready` on INSERT |
| 10 | SPEC P2 vs sprint P1 | USER_STORIES governs BUILD — no scope reduction |


---

## Database

**Migration (BUILD):** `supabase/migrations/*_neuramark_content_calendar_slots.sql`

### `neuramark_content_calendar_slots`

Scheduling identity per tenant + week. **Pipeline display status is NOT stored** — derived at read time.

```sql
CREATE TABLE public.neuramark_content_calendar_slots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL
                    REFERENCES public.neuramark_clients(id),
  week_start      date NOT NULL,
  scheduled_date  date NOT NULL,
  slot_index      int NOT NULL,
  strategy_id     uuid NOT NULL
                    REFERENCES public.neuramark_content_strategies(id),
  reel_script_id  uuid NULL
                    REFERENCES public.neuramark_reel_scripts(id),
  publish_status  text NOT NULL DEFAULT 'ready'
                    CHECK (publish_status IN ('ready', 'published')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT neuramark_content_calendar_slots_client_week_slot_uq
    UNIQUE (client_id, week_start, slot_index),
  CONSTRAINT neuramark_content_calendar_slots_slot_index_check
    CHECK (slot_index >= 0 AND slot_index <= 6),
  CONSTRAINT neuramark_content_calendar_slots_week_start_monday_check
    CHECK (EXTRACT(ISODOW FROM week_start) = 1)
);

CREATE INDEX neuramark_content_calendar_slots_week_start_idx
  ON public.neuramark_content_calendar_slots (week_start);

CREATE INDEX neuramark_content_calendar_slots_client_week_idx
  ON public.neuramark_content_calendar_slots (client_id, week_start);

CREATE INDEX neuramark_content_calendar_slots_scheduled_date_idx
  ON public.neuramark_content_calendar_slots (scheduled_date);

ALTER TABLE public.neuramark_content_calendar_slots ENABLE ROW LEVEL SECURITY;
-- Zero policies: service-role Node only (deny-by-default).

CREATE OR REPLACE FUNCTION public.neuramark_content_calendar_slots_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER neuramark_content_calendar_slots_set_updated_at
  BEFORE UPDATE ON public.neuramark_content_calendar_slots
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_content_calendar_slots_set_updated_at();
```

| Column | Rule |
|--------|------|
| `week_start` | ISO Monday `YYYY-MM-DD` — validated app-side via `trendWeekStartSchema` |
| `scheduled_date` | Calendar day column for grid placement — see § Scheduled date mapping |
| `slot_index` | Matches approved strategy brief `slotIndex` (0–6) |
| `strategy_id` | Latest **approved** strategy row used at sync time |
| `reel_script_id` | Linked when `neuramark_reel_scripts` row exists for `(strategy_id, slot_index)`; nullable |
| `publish_status` | **US-12.1:** default `'ready'` on INSERT only; read for `published` display; **US-12.2** owns UPDATE to `'published'` |
| `updated_at` | Touch on upsert field changes; **never** bump solely for read-time sync no-op |

**No trigger** on strategy approve in US-12.1 — sync-on-read only.

**US-12.2 handoff:** expose `slotId` (= row `id`), `publish_status`, `assembledReelId` in DTO for downstream mark-published mutation.

---

## Scheduled date mapping (frozen)

For each slot in the latest approved strategy brief:

1. **When `dayOfWeek` present:** `scheduled_date = week_start + offset(dayOfWeek)` where `monday=0 … sunday=6` (UTC date arithmetic at noon anchor).
2. **When `dayOfWeek` absent:** `offsetDays = min(slotIndex * 2, 6)` from `week_start` (Mon→0, Wed→2, Fri→4, Sun→6; indices ≥4 share Sunday).

Implementation (BUILD): `lib/calendar/map-slot-scheduled-date.ts` — pure, unit-tested.

---

## `syncCalendarSlotsForWeek(weekStart)`

**Kind:** `import "server-only"` — **not** exported as Server Action  
**File (BUILD):** `lib/calendar/sync-calendar-slots-for-week.ts`  
**Entry:** Called **only** from `getOperatorCalendarForWeekCore` after Operator gate — never from Cliente paths, cron, or public HTTP.

### Algorithm

1. Normalize `weekStart` via `normalizeToIsoMonday` when caller passes adjacent dates (orchestrator normalizes once).
2. Load **`neuramark_clients`** where **`active = true`**.
3. For each client:
   - Load latest **approved** strategy for `(client_id, week_start)` — same query as `getApprovedStrategyForWeek`.
   - **If none:** skip client (no slots, no gap row); increment `clientsWithoutApprovedStrategyCount`.
   - **If found:** for each `brief.slots[]` entry:
     - Compute `scheduled_date` (§ mapping).
     - Resolve `reel_script_id` from `neuramark_reel_scripts` where `strategy_id` + `slot_index` match (nullable).
     - **UPSERT** on `(client_id, week_start, slot_index)`:
       - Set `strategy_id`, `scheduled_date`, `reel_script_id`, `updated_at`.
       - **INSERT:** `publish_status = 'ready'`.
       - **UPDATE:** **preserve** existing `publish_status` (US-12.2 may have set `published`).
   - **DELETE** (hard) calendar rows for `(client_id, week_start)` whose `slot_index` is **not** in the current approved brief slot set.
4. Return sync stats `{ clientsSynced, slotsUpserted, slotsDeleted }` for logging/tests (not exposed in action DTO).

### Idempotency

Repeated calls with unchanged strategies produce identical row set. Changing approved brief version updates `strategy_id` / dates / orphans deleted.

### Forbidden

- UPDATE `publish_status` to `'published'`.
- DELETE rows outside the target `week_start` partition.
- Accept `client_id` filter parameter (always all active clients).

---

## `deriveCalendarPipelineStatus(context)`

**Kind:** Server-only pure function (+ async loader wrapper in BUILD)  
**File (BUILD):** `lib/calendar/derive-calendar-pipeline-status.ts`  
**Inputs (per slot):** calendar row, strategy slot `tema`, optional reel script + caption summary, latest video job, assembly job, QA report, latest approval for assembled reel, `publish_status` column.

**Priority cascade — first match wins:**

| Priority | `pipelineStatus` | Predicate |
|----------|------------------|-----------|
| 1 | `published` | `calendar.publish_status === 'published'` |
| 2 | `approved` | Latest approval **`status === 'approved'`** (and not superseded by published) |
| 3 | `pending` | Latest approval **`status IN ('pending_client', 'changes_requested')`** — see rule R1 for rejected |
| 4 | `qa` | Branded assembly complete (`output_media_asset_id` present) **AND** (QA report exists **OR** assembly complete awaiting approval enqueue) **AND** no terminal approval blocking earlier stages — reuse existing loaders; **do not duplicate** `getQaGateStatusForAssembledReel` logic for calendar color |
| 5 | `generating` | Script missing **OR** caption missing (`status !== 'generated'`) **OR** active video/assembly/branding job in non-terminal state **OR** in-flight script/caption generation |
| 6 | `draft` | Slot synced from approved strategy; earliest planning stage |

### Rule R1 — `rejected` approval (PO #14 / SPEC gap #5)

- **`rejected` is never emitted as `pipelineStatus` or calendar color.**
- When latest approval for the slot's assembled reel is **`rejected`**:
  - **Skip** cascade branches 2–3 (`approved`, `pending`).
  - Evaluate branches 4–6 from pipeline facts only → typically **`qa`** or **`generating`** when assembly exists; else **`draft`** / **`generating`**.
- Card **remains visible** when a calendar slot row exists (planning/ops view); rejected Reels are not "listo para publicar" but may still show pipeline work in progress.

### Rule R2 — `changes_requested` (PO #6)

- Maps to **`pipelineStatus = pending`**.
- Set **`changesRequested: true`** on `CalendarSlotDetailDto` for FE sub-badge "Revision requested".

### Thumbnail

When assembly has `output_media_asset_id`:  
`thumbnailPreviewUrl = mediaPreviewUrl(output_media_asset_id)` — validated by `calendarMediaPreviewPathSchema`.  
Else `null`.

**Do not** call `getQaGateStatusForAssembledReel` for card color — calendar is display-only.


---

## `getOperatorCalendarForWeek({ weekStart })`

**Kind:** Server Action  
**File (BUILD):** `lib/calendar/actions/get-operator-calendar-for-week.ts`  
**Orchestrator (BUILD):** `lib/calendar/get-operator-calendar-for-week.ts`  
**Consumer:** `app/(app)/operator/calendar/page.tsx` · week picker refresh in `OperatorCalendarView`

### Gate order (Condition 1)

1. **`requireOperator("handler")`** — first `await`. Failure → typed envelope, **zero DB writes** (no sync).
2. **`findForbiddenCalendarKeys(rawInput)`** — any match → **`FORBIDDEN_FIELDS`**.
3. **`getOperatorCalendarForWeekInputSchema.safeParse`** — failure → **`VALIDATION_ERROR`**.
4. **`syncCalendarSlotsForWeek(weekStart)`** — side effect allowed only after steps 1–3 pass.
5. Load slots + pipeline joins + derive status + gap warnings.
6. Return success DTO.

### Request

```ts
{ weekStart: string } // ISO Monday YYYY-MM-DD — .strict(); NO other keys
```

**Forbidden keys (reject → `FORBIDDEN_FIELDS` before parse):**  
`client_id`, `clientId`, `filter`, `limit`, `offset`, `role`, `auth_user_id`, `status`, `publish_status`, `publishStatus`, `slotId`, `strategyId`, `reelScriptId`, `assembledReelId`, `approvalId`, cost/provider/content authority keys — full list in `FORBIDDEN_CALENDAR_AUTHORITY_KEYS` (`lib/contracts/calendar.ts`).

**Page route:** `/operator/calendar?weekStart=` — **no** `client_id` searchParam (forbidden).

### Success

```ts
{
  ok: true;
  weekStart: string;
  clients: CalendarClientSummaryDto[];
  slots: CalendarSlotDetailDto[];
  gapWarnings: ClientGapWarningDto[];
  clientsWithoutApprovedStrategyCount: number;
}
```

**`weekRangeLabel`:** FE-computed via `formatWeekRange(weekStart, locale)` — not returned by action (locale is FE concern; matches reel-scripts pattern).

**Ordering:** `slots` sorted by `scheduledDate` ASC, then `clientDisplayName` ASC, then `slotIndex` ASC.

**Aggregate scope:** Slots only for **`neuramark_clients.active = true`** with latest approved strategy for `weekStart` after sync.

### Gap warnings

For each active client with an **approved** strategy for `weekStart`:

- `scheduledCount` = count of calendar slot rows for `(client_id, week_start)` after sync.
- `missingCount = max(0, 3 - scheduledCount)`.
- Include in `gapWarnings` when **`missingCount > 0`** (i.e. `scheduledCount < 3`).

Clients without approved strategy: **excluded** from gap math.

### Response DTO allowlist (Condition 4)

**Per slot (`CalendarSlotDetailDto`):** `slotId`, `clientId`, `clientDisplayName`, `weekStart`, `scheduledDate`, `slotIndex`, `tema`, `reelScriptId`, `pipelineStatus`, `approvalId`, `assembledReelId`, `thumbnailPreviewUrl`, `strategyId`, `goal`, `approvalStatus`, `changesRequested`.

**Gap warning (`ClientGapWarningDto`):** `clientId`, `clientDisplayName`, `scheduledCount`, `missingCount`.

**Client summary (`CalendarClientSummaryDto`):** `clientId`, `clientDisplayName`.

### Response DTO denylist (Condition 5)

Response JSON must **NOT** contain:  
`storage_key`, `storageKey`, `estimated_cost_cents`, `actual_cost_cents`, `costCents`, `costSummary`, `reelCostRollups`, `envKeyName`, `provider_key`, `email`, `auth_user_id`, full script hook/body/cta/voiceover, effective Instagram caption body, strategy `brief` jsonb, QA override reasons, raw Supabase/public asset URLs.

Enforced via Zod `.strict()` on DTO schemas + grep/tests in CI.

### Thumbnails (Conditions 5–6)

- Build with **`mediaPreviewUrl(assetId)`** from `lib/approvals/caption-preview.ts`.
- Must match **`^/api/media/assets/[0-9a-f-]{36}$`** — `calendarMediaPreviewPathSchema`.
- Requires § Media route cross-client Operator serve or thumbnails 404 for non-session clients.

### Error envelope

| Code | When |
|------|------|
| `UNAUTHENTICATED` | No session |
| `FORBIDDEN` | Cliente / non-operator |
| `FORBIDDEN_FIELDS` | Forbidden authority keys in body |
| `VALIDATION_ERROR` | Zod failure on `weekStart` |
| `INTERNAL_ERROR` | Unexpected |

```ts
{ ok: false; error: { code: CalendarErrorCode; fields?: Record<string, string[]>; messageKey?: string } }
```

---

## Media route extension (US-12.1 delta)

**File:** `app/api/media/assets/[assetId]/route.ts`  
**Consumer:** Calendar `thumbnailPreviewUrl` for **any** active client's branded reel.

### Change (Condition 6)

In the **`assembled_reel`** branch, when **`requireOperator("handler")`** succeeds:

- **Allow stream for any `row.client_id`** — remove `row.client_id === operator.id` ownership check for Operator path.
- **Keep** Cliente path: `requireActive` + `row.client_id === user.id` unchanged.
- **Keep** US-11.3 attachment guard: Cliente `?disposition=attachment` requires approved approval linkage.
- **Do not** widen **`generated_video`** or **`voiceover`** branches — remain session-scoped Operator ownership.

### Abuse cases blocked

- Cliente guessing cross-tenant `assetId` — Cliente branch unchanged; no cross-client IDs leaked via Cliente calendar (future story uses own scoped endpoint).
- Operator intentionally views cross-client thumbnails — **allowed** (product intent per SECURITY_BASELINE § (e)).

---

## Forbidden imports (aggregate loader)

BUILD grep must prove calendar modules **do not** import:

- `listApprovedApprovals` / `listApprovedApprovalsForClient`
- Cliente `/ready-to-publish` page loaders
- `listPendingApprovals` as calendar data source

Aggregate SQL joins **`neuramark_content_calendar_slots`**, **`neuramark_content_strategies`**, **`neuramark_reel_scripts`**, caption/video/assembly/QA/approval tables directly.

---

## Frontend contract (for FE signoff)

| Consumer | Route / component | Contract surface |
|----------|-------------------|------------------|
| Calendar page | `app/(app)/operator/calendar/page.tsx` | RSC: resolve `weekStart` from searchParams (`normalizeToIsoMonday`); call `getOperatorCalendarForWeek` |
| Week grid | `components/calendar/OperatorCalendarView.tsx` | 7-column Mon–Sun; cards by `scheduledDate`; `CalendarStatusTag` by `pipelineStatus` |
| Gap UI | Same view | Render `gapWarnings` when `missingCount > 0` |
| Sidebar | Same view | Card click → panel from slot DTO; CTAs: `/operator/scripts?weekStart=&highlightSlot=` · `/operator/strategy?weekStart=` |
| Week label | Same view | `formatWeekRange(weekStart, locale)` locally |
| Nav | `AppHeader` | Operator link `header.nav.calendar` → `/operator/calendar` |
| i18n | `messages/en.json` + `es.json` | Namespace **`calendar.*`** |
| Scripts highlight | `ScriptsPageView` (optional) | Read `highlightSlot` query — scroll/expand row |

**Status colors (DESIGN_PROMPTS §10):** draft=grey · generating=blue · qa=amber · pending=orange · approved=green · published=violet.

**Deep link V1 limitation:** "Open in Scripts" / "View strategy" use session `clientId` — fully actionable for session client; other clients show Sidebar summary only until Phase B multi-client Operator context.

**No mark-published UI** in Phase A.

---

## Future: `getClientCalendarForWeek` (non-goals)

**Name frozen:** `FUTURE_CLIENT_CALENDAR_ACTION = "getClientCalendarForWeek"` (`lib/contracts/calendar.ts`).

| Rule | Detail |
|------|--------|
| Auth | `requireActive("handler")` — Cliente only |
| Scope | `WHERE client_id = getCurrentUser().id` server-side |
| DTO | Subset of Operator card fields — **no** cross-client gap warnings |
| Forbidden | Importing Operator aggregate + FE filter; `client_id` param on Operator action |

Automated test/grep: no Cliente route imports `getOperatorCalendarForWeek`.


---

## Fixtures (mock against)

### Success — mixed pipeline week

```json
{
  "ok": true,
  "weekStart": "2026-09-01",
  "clients": [
    { "clientId": "11111111-1111-4111-8111-111111111111", "clientDisplayName": "Cafe Luna" },
    { "clientId": "22222222-2222-4222-8222-222222222222", "clientDisplayName": "Studio Vega" }
  ],
  "slots": [
    {
      "slotId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "clientId": "11111111-1111-4111-8111-111111111111",
      "clientDisplayName": "Cafe Luna",
      "weekStart": "2026-09-01",
      "scheduledDate": "2026-09-01",
      "slotIndex": 0,
      "tema": "Promo del martes",
      "reelScriptId": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "pipelineStatus": "approved",
      "approvalId": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      "assembledReelId": "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      "thumbnailPreviewUrl": "/api/media/assets/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      "strategyId": "ffffffff-ffff-4fff-8fff-ffffffffffff",
      "goal": "local_sale",
      "approvalStatus": "approved",
      "changesRequested": false
    },
    {
      "slotId": "12121212-1212-4121-8121-121212121212",
      "clientId": "22222222-2222-4222-8222-222222222222",
      "clientDisplayName": "Studio Vega",
      "weekStart": "2026-09-01",
      "scheduledDate": "2026-09-03",
      "slotIndex": 1,
      "tema": "Tips de iluminación",
      "reelScriptId": null,
      "pipelineStatus": "draft",
      "approvalId": null,
      "assembledReelId": null,
      "thumbnailPreviewUrl": null,
      "strategyId": "34343434-3434-4343-8343-343434343434",
      "goal": "education",
      "approvalStatus": null,
      "changesRequested": false
    }
  ],
  "gapWarnings": [
    {
      "clientId": "22222222-2222-4222-8222-222222222222",
      "clientDisplayName": "Studio Vega",
      "scheduledCount": 2,
      "missingCount": 1
    }
  ],
  "clientsWithoutApprovedStrategyCount": 0
}
```

### Forbidden fields

```json
{ "weekStart": "2026-09-01", "client_id": "11111111-1111-4111-8111-111111111111" }
```

→ `{ "ok": false, "error": { "code": "FORBIDDEN_FIELDS" } }`

### Cliente session

→ `{ "ok": false, "error": { "code": "FORBIDDEN" } }` — no sync, empty body.

---

## Security tests (minimum — Condition 11)

| Test | Expect |
|------|--------|
| Cliente session → `getOperatorCalendarForWeek` | **403** `FORBIDDEN`; no sync side effects |
| Operator session → valid `weekStart` | **200** success shape |
| Body with `client_id` | **`FORBIDDEN_FIELDS`** |
| Body with `clientId` | **`FORBIDDEN_FIELDS`** |
| Success JSON grep | Excludes denylist keys |
| `thumbnailPreviewUrl` when set | Matches path regex |
| Non-operator `/operator/calendar` page | Layout **403** / forbidden fallback |
| Grep US-12.1 modules | No `publish_status` UPDATE to `'published'` |
| Grep calendar loader | No Cliente queue imports |
| Grep Cliente routes | No import of `getOperatorCalendarForWeek` |
| Media route Operator cross-client `assembled_reel` | Operator streams other tenant asset after gate |
| Media route Cliente cross-tenant guess | **404** unchanged |

---

## Server-only modules (planned BUILD)

| Module | Purpose |
|--------|---------|
| `lib/calendar/actions/get-operator-calendar-for-week.ts` | `"use server"` export |
| `lib/calendar/get-operator-calendar-for-week.ts` | Orchestrator |
| `lib/calendar/sync-calendar-slots-for-week.ts` | Sync-on-read upsert + orphan delete |
| `lib/calendar/derive-calendar-pipeline-status.ts` | Status cascade |
| `lib/calendar/map-slot-scheduled-date.ts` | `scheduled_date` mapping |
| `lib/calendar/errors.ts` | Typed error helpers |
| `lib/contracts/calendar.ts` | Zod + types (**committed in CONTRACT gate**) |
| `supabase/migrations/*_neuramark_content_calendar_slots.sql` | DDL |

---

## Handoffs

| Direction | Artifact | Rule |
|-----------|----------|------|
| From US-4.2 | Latest approved strategy per `(client_id, week_start)` | Only approved briefs materialize slots |
| From US-5.1+ | `reel_script_id` per `(strategy_id, slot_index)` | Linked on sync |
| From US-11.x | Approval statuses | Drive `approved` / `pending` display; **no** Cliente queue reuse |
| To US-12.2 | `slotId`, `publish_status`, `assembledReelId` | Mark-published mutation target |
| To ADR-0002 | Calendar shows approved-ready Reels | Publish adapter re-checks approval server-side |

---

## Reviewed by FE

**Reviewed by FE:** yes — 2026-08-30 — nextjs-frontend

**Verdict:** Accept — `/operator/calendar` RSC + `OperatorCalendarView` client island against `getOperatorCalendarForWeek` and types in `lib/contracts/calendar.ts`. Matches existing Operator week patterns (`strategy` / `scripts` pages).

### FE signoff notes (non-blocking)

- **Page shell:** RSC `app/(app)/operator/calendar/page.tsx` — `resolveWeekStart(searchParams.weekStart)` via `trendWeekStartSchema` + `normalizeToIsoMonday`; auth via `operator/layout.tsx` `requireOperator("page")`; `dynamic = "force-dynamic"`.
- **Week UX:** Reuse `formatWeekRange(weekStart, locale)` + PrimeReact `Calendar` picker + prev/next week buttons (same `navigateWeek` query-param pattern as `ScriptsPageView` / `StrategyPageView`).
- **Grid:** Group `slots[]` by `scheduledDate` into 7 Mon–Sun columns; localized weekday headers via `Intl.DateTimeFormat` + `calendar.*` copy.
- **Cards:** `CalendarStatusTag` from `pipelineStatus`; optional `<img src={thumbnailPreviewUrl}>` when set (authenticated path only); `changesRequested` sub-badge on `pending` color.
- **Gap UI:** Render `gapWarnings[]` when `missingCount > 0` — per-client warning strip/card at week level.
- **Sidebar:** PrimeReact `Sidebar` on card click; fields from `CalendarSlotDetailDto` (single-fetch — no refetch action). CTAs: `/operator/scripts?weekStart=&highlightSlot={slotIndex}` and `/operator/strategy?weekStart=` — **disable or hide when `slot.clientId !== sessionClientId`** (V1 deep-link limitation documented in contract).
- **Goal labels:** Map `goal` via existing `strategy.page.goals.{key}` — same keys as strategy brief.
- **Optional:** Week-level summary for `clientsWithoutApprovedStrategyCount` when `> 0`; `ScriptsPageView` `highlightSlot` scroll/expand — both optional Phase A nice-to-haves per TASKS.
- **Nav / i18n:** Add `header.nav.calendar` → `/operator/calendar`; new `calendar.*` namespace EN/ES.
- **README drift:** README PO #14 says hide rejected cards; **CONTRACT Rule R1 governs BUILD** — cards remain visible; rejected skips `approved`/`pending` display branches only.
- **Disputes:** none.

### FE signoff checklist (blocking BUILD)

- [ ] **Route:** `/operator/calendar?weekStart=` RSC wired; `loading.tsx` skeleton.
- [ ] **Types:** Import DTOs/result union from `lib/contracts/calendar.ts` only — no ad-hoc shapes.
- [ ] **Action:** `getOperatorCalendarForWeek({ weekStart })` — body strict; map error codes to `calendar.*` copy.
- [ ] **Grid + Sidebar:** 7-column week grid; card click opens Sidebar from slot DTO.
- [ ] **Gap warnings:** Render `gapWarnings` per client when `missingCount > 0`.
- [ ] **Status colors:** draft=grey · generating=blue · qa=amber · pending=orange · approved=green · published=violet.
- [ ] **Deep links:** Session-client CTAs only; other clients summary-only in Sidebar.
- [ ] **i18n:** `calendar.*` + `header.nav.calendar` EN/ES.
- [ ] **No mark-published UI** in Phase A.
