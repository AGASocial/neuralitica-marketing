# API Contract — US-13.1 Record basic post metrics manually

**Story:** US-13.1  
**Status:** Frozen — 2026-08-31 · **Reviewed by FE:** approved — 2026-08-31 — nextjs-frontend  
**Security:** `plan/stories/US-13.1/SECURITY.md` (APPROVE WITH CONDITIONS — 14 conditions reconciled below)  
**Spec review:** `plan/stories/US-13.1/SPEC-REVIEW.md` (GAPS — 6 Low closed below)  
**Pattern:** US-12.2 mark-published Sidebar · US-12.1 calendar read · manual Metrics Lite (no analytics stack)  
**Depends on:** US-12.2 ✅ (`publish_status = published`, `publishedAt`, `assembledReelId` in DTO) · US-12.1 ✅ · US-14.5 ✅ `requireOperator()`  
**Feature branch:** `feature/US-13.1-reel-metrics`  
**Error envelope style:** Server Actions — same house pattern as US-12.1/12.2 (`ok: true` vs `{ ok: false, error: { code, fields?, messageKey? } }`).

**This document is CONTRACT ONLY.** Zod mirrors live in `lib/contracts/reel-metrics.ts` + calendar DTO delta in `lib/contracts/calendar.ts` (committed with this gate). Migration DDL, `upsertReelMetrics` Server Action, calendar read join, Sidebar metrics section, and tests are specified here and applied during BUILD — **not shipped in this gate commit beyond contract modules**.

**Terminology:** **Calendario de contenido** · **Operator** · **Cliente** · **Reel** · **Ensamblado** · **publicado** · **métricas** (Metrics Lite). Do **not** use CONTEXT _Evitar_ terms (analytics avanzados as product promise; admin/staff; client-supplied `client_id` as authority; free-text metric fields).

---

## SPEC-REVIEW gaps closed (6 Low)

| # | Gap | Resolution in this contract |
|---|-----|----------------------------|
| 1 | SPEC §3 P2 label vs USER_STORIES P1 | § Overview — sprint source of truth is USER_STORIES + frozen PREP; full Phase A scope unchanged. |
| 2 | USER_STORIES DB row stale (`reel_metrics` shorthand) | § Database — full DDL `neuramark_reel_metrics` with `client_id`. |
| 3 | USER_STORIES [SEC] "current client" vs Operator multi-client model | § Tenancy — ownership = reel exists + `client_id` from reel row; Operator cross-tenant writes **allowed**. |
| 4 | USER_STORIES BE row says `POST`; PREP uses Server Action | § Surfaces — `upsertReelMetrics` Server Action only. |
| 5 | Open questions not frozen until CONTRACT | § PO open questions — all 10 README items resolved below. |
| 6 | Orphan metrics when calendar slot hard-deleted | § Orphan metrics behavior. |

---

## SECURITY reconciliation (14 conditions)

| # | SECURITY condition | **Frozen in this contract** |
|---|-------------------|----------------------------|
| 1 | `requireOperator` first — zero side effects on 403 | § `upsertReelMetrics` gate order |
| 2 | `assembledReelId` + five counters only — no `client_id` | § Request · `FORBIDDEN_REEL_METRICS_AUTHORITY_KEYS` |
| 3 | Tenancy from reel row — not session match | § Tenancy · UPSERT semantics |
| 4 | Published-only server gate | § Published gate · `NOT_PUBLISHED` |
| 5 | 7-day edit window from `published_at` | § Edit window · `EDIT_WINDOW_EXPIRED` |
| 6 | Integer bounds 0 … `REEL_METRICS_MAX_VALUE` | § Counter validation |
| 7 | Forbidden status / identity / timestamp spoof keys | § Forbidden keys list |
| 8 | Dedicated mutation surface | § Surfaces · § Non-goals |
| 9 | Calendar DTO delta + server `editable` | § Response DTO delta |
| 10 | Rate limit `reel_metrics_upsert` 30/60 min | § Rate limit |
| 11 | UPSERT + timestamp authority | § UPSERT semantics |
| 12 | Error envelope consistency | § Error envelope |
| 13 | DDL constraints | § Database |
| 14 | Security tests minimum list | § Security tests |

**Inherited floors (US-14.5 / US-12.2 / US-12.1 / SECURITY_BASELINE):** `requireOperator()` → `requireActive()` first; role never from request; RLS deny-by-default; service-role Node only; no browser Supabase keys; interim hardcoded user sanctioned.

---

## Phased BUILD acceptance

| Phase | Scope | Closes |
|-------|-------|--------|
| **A (US-13.1 BUILD — ship all in this story)** | DDL `neuramark_reel_metrics` · `upsertReelMetrics` · published-only + 7-day window + integer bounds · calendar DTO `metrics` delta · Sidebar metrics section · [SEC] Operator 403 + server-side gates · EN/ES `calendar.metrics.*` | USER_STORIES § US-13.1 AC (all five) |
| **B (deferred — not US-13.1)** | Instagram Insights API · bulk CSV import · charts · Operator edit-window override · metrics audit log · orphan-slot re-link UI | Backlog / integrations / US-13.x polish |

**VALIDATION note (binding):** Phase A closes full US-13.1 AC. FE `metrics.editable === false` disable is UX only — VALIDATION must prove non-published, expired-window, and non-operator paths fail in the handler. Orphan metrics rows may exist in DB but are not writable via calendar UI V1.

---

## Overview

US-13.1 ships **Operator Metrics Lite V1 (Phase A)**: from the existing `/operator/calendar` Sidebar on **published** Reels, enter five non-negative integer counters (views, likes, comments, saves, DMs); persist one metrics row per **Ensamblado** in `neuramark_reel_metrics`; enforce **published-only**, **7-day edit window** anchored to slot `published_at`, and **Operator-only** server-side. Unlocks US-13.2 strategy insights injection.

**Manual entry only** — no Instagram Insights / Graph API import (Phase B).

**Surfaces**

| # | Surface | Kind | Consumer |
|---|---------|------|----------|
| 1 | `upsertReelMetrics` | Server Action | `/operator/calendar` Sidebar metrics form |
| 2 | `upsertReelMetricsCore` | Server-only orchestrator (optional) | Action + unit tests |
| 3 | `getOperatorCalendarForWeek` (extended DTO) | Server Action (read — unchanged write behavior) | Week grid + Sidebar single-fetch |
| 4 | Zod + types | `lib/contracts/reel-metrics.ts` · `lib/contracts/calendar.ts` delta | FE types · BE validation |
| 5 | Migration CREATE | `neuramark_reel_metrics` | Metrics persistence |
| 6 | Sidebar metrics section | FE | InputNumber form + Save CTA |

**Forbidden surfaces (BUILD veto):**

- `client_id` / `clientId` on upsert action input.
- `slotId` / `slot_id` on mutation input (authority is `assembledReelId` only).
- `publish_status`, `pipelineStatus`, `recorded_at`, `editable` on mutation input.
- Write branch on `getOperatorCalendarForWeek`.
- Separate `/operator/metrics` route or page.
- Cliente metrics entry or Cliente calendar metrics.
- Instagram Insights / Graph API auto-import.
- Charts, dashboards, CSV import.
- Operator edit-window override V1.
- Metrics on non-published Reels.
- Session-tenant filter blocking Operator cross-client writes.
- Free-text metric fields or JSON blobs.

**Why Server Action (not Route Handler):** UI-coupled Operator mutation from calendar Sidebar; matches US-12.2 mark-published pattern; CSRF via Next.js origin check.

---

## PO open questions — CONTRACT resolutions

| # | Question (PREP) | **Frozen resolution** |
|---|-----------------|----------------------|
| 1 | Exact `REEL_METRICS_MAX_VALUE` | **99_999_999** per field — Zod authoritative; optional DB CHECK duplicate |
| 2 | `EDIT_WINDOW_EXPIRED` vs `FORBIDDEN` | **Dedicated `EDIT_WINDOW_EXPIRED`** + `messageKey: "calendar.metrics.errors.editWindowExpired"` |
| 3 | Multiple published slots same `reel_script_id`? | **Gate passes if ≥1** published slot links; **edit window uses latest `published_at` DESC** among published slots |
| 4 | `InputNumber` vs plain `InputText` | **`InputNumber`** `useGrouping={false}` `min={0}` `max={REEL_METRICS_MAX_VALUE}` (FE) |
| 5 | Return shape on upsert success | **`{ ok: true, metrics: ReelMetricsDto }`** + FE week refresh via `getOperatorCalendarForWeek` |
| 6 | Zero-value UX: empty inputs vs explicit 0 | **Coalesce blank → 0** on submit via Zod preprocess (`null` / `undefined` / `""` → `0`); non-numeric strings → **`VALIDATION_ERROR`** |
| 7 | Calendar DTO `editable` computed server-side? | **Yes** — included in `metrics` snapshot; FE disables Save when `editable === false`; handler still enforces |
| 8 | Index on `(client_id, recorded_at DESC)` for US-13.2? | **Yes** — `neuramark_reel_metrics_client_recorded_idx` |
| 9 | FK `ON DELETE CASCADE` from `assembled_reel_id`? | **CASCADE** — reel row deleted → metrics row deleted; calendar slot orphan case keeps both rows |
| 10 | Rate limit key name | **`reel_metrics_upsert`** in `neuramark_agent_rate_limits` |

**Note on `REEL_NOT_FOUND` / `INVALID_METRIC_VALUE`:** This contract uses the house envelope — missing assembled reel → **`NOT_FOUND`** (uniform, no tenant oracle); invalid counters → **`VALIDATION_ERROR`** with per-field keys (`views`, `likes`, etc.). There is **no** separate top-level `REEL_NOT_FOUND` or `INVALID_METRIC_VALUE` code.

---

## Database

**Migration (BUILD):** `supabase/migrations/20260831070000_neuramark_reel_metrics.sql`  
**Rule:** CREATE TABLE only — timestamp after US-12.2 `20260831060000_neuramark_content_calendar_slots_publish_metadata.sql`.

### CREATE `neuramark_reel_metrics`

```sql
CREATE TABLE public.neuramark_reel_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.neuramark_clients(id) ON DELETE CASCADE,
  assembled_reel_id uuid NOT NULL UNIQUE
    REFERENCES public.neuramark_assembled_reels(id) ON DELETE CASCADE,
  views integer NOT NULL CHECK (views >= 0 AND views <= 99999999),
  likes integer NOT NULL CHECK (likes >= 0 AND likes <= 99999999),
  comments integer NOT NULL CHECK (comments >= 0 AND comments <= 99999999),
  saves integer NOT NULL CHECK (saves >= 0 AND saves <= 99999999),
  dms integer NOT NULL CHECK (dms >= 0 AND dms <= 99999999),
  recorded_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX neuramark_reel_metrics_client_recorded_idx
  ON public.neuramark_reel_metrics (client_id, recorded_at DESC);

CREATE TRIGGER neuramark_reel_metrics_set_updated_at
  BEFORE UPDATE ON public.neuramark_reel_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_set_updated_at();

ALTER TABLE public.neuramark_reel_metrics ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.neuramark_reel_metrics IS
  'US-13.1: Operator manual Metrics Lite counters per Ensamblado. US-13.2 aggregates by client_id + recorded_at.';
```

| Column | Rule |
|--------|------|
| `assembled_reel_id` | **UNIQUE** — one metrics row per Ensamblado; mutation key |
| `client_id` | Denormalized from `neuramark_assembled_reels.client_id` on every write — **never** from request |
| `views`, `likes`, `comments`, `saves`, `dms` | NOT NULL integers ≥ 0, ≤ `REEL_METRICS_MAX_VALUE` |
| `recorded_at` | Set to `now()` on every successful INSERT/UPDATE — client cannot supply |
| `created_at` / `updated_at` | Standard timestamps; `updated_at` via trigger |
| RLS | Deny-by-default unchanged — service-role Node only |
| Index | `(client_id, recorded_at DESC)` for US-13.2 ~4-week aggregate queries |

**No FK to calendar slots.** Slot hard-delete does **not** cascade to metrics (see § Orphan metrics).

**No new enums.** **No RLS policies.**

---

## Orphan metrics behavior

When US-12.1 sync **hard DELETE** drops a published calendar row but the assembled reel and metrics row survive:

| Concern | Behavior |
|---------|----------|
| Metrics row in DB | **Retained** — US-13.2 aggregate queries remain valid |
| Sidebar write path | **Blocked** — published gate requires **live** `neuramark_content_calendar_slots` row with `publish_status = 'published'` linked via `reel_script_id` → **`NOT_PUBLISHED`** |
| Calendar read DTO | Slot no longer appears in week grid — orphan metrics not surfaced in Sidebar V1 |
| Slot DELETE → metrics | **No cascade** — only `assembled_reel_id` CASCADE deletes metrics when reel row deleted |
| Re-link / cleanup UI | **Phase B defer** — no orphan repair in US-13.1 |

---

## Tenancy and ownership (clarified)

**"Ownership verification"** for US-13.1 means:

1. `assembledReelId` must reference an existing `neuramark_assembled_reels` row → else **`NOT_FOUND`**.
2. `client_id` on the metrics row is **denormalized from that reel row** on every write.
3. Request bodies must **not** carry `client_id` / `clientId`.
4. Operator may write metrics for **any** active client's published Reel — **no** filter `operator.clientId === reel.client_id`.

This supersedes the ambiguous USER_STORIES AC phrase "scoped to Reels of the current client" for VALIDATION purposes (per SECURITY.md).

---

## Response DTO delta (US-13.1)

Extend **`CalendarSlotDetailDto`** in `lib/contracts/calendar.ts`:

| Field | Type | Rule |
|-------|------|------|
| `metrics` | `ReelMetricsDto \| null` | **`null`** when `pipelineStatus !== 'published'` or `assembledReelId === null`. **Non-null** when published + assembled reel — includes server-computed `editable`. |

### `ReelMetricsDto` shape

```ts
{
  views: number;       // 0 … REEL_METRICS_MAX_VALUE
  likes: number;
  comments: number;
  saves: number;
  dms: number;
  recordedAt: string | null;  // ISO 8601 UTC when row exists; null when no row yet
  editable: boolean;   // server-computed from published gate + edit window
}
```

**Read mapper (BUILD):** For published slots with `assembledReelId`:

1. LEFT JOIN `neuramark_reel_metrics` on `assembled_reel_id`.
2. When no metrics row: emit counters **0**, `recordedAt: null`.
3. When row exists: emit persisted counters + `recordedAt` as ISO 8601 UTC.
4. Compute **`editable`**: `true` when ≥1 live published calendar slot links via `reel_script_id` **and** `now() <= latest_published_at + REEL_METRICS_EDIT_WINDOW_DAYS`; else `false`.

**Card DTO (`CalendarSlotCardDto`):** unchanged — no `metrics` on grid cards (Sidebar detail only).

---

## Counter validation

| Rule | Detail |
|------|--------|
| Type | **Integer only** — rejects floats, strings (except blank coalesce), booleans |
| Range | **0 … 99_999_999** (`REEL_METRICS_MAX_VALUE`) per field |
| Blank FE input | **`null` / `undefined` / `""` → 0** via Zod preprocess before `.int().min(0)` |
| Invalid string (e.g. `"abc"`) | **`VALIDATION_ERROR`** with `fields.{metricName}` |
| Snapshot replace | All five counters **required** on every save — full replace, not partial patch |
| Error delivery | **`VALIDATION_ERROR`** — not a separate `INVALID_METRIC_VALUE` top-level code |

**Zod module:** `reelMetricCounterInputSchema` (preprocess + bounds) for action input; `reelMetricCounterSchema` (strict) for read/success DTO validation.

---

## Published gate (write-time)

**Mandatory on every `upsertReelMetrics` call** — FE `pipelineStatus === 'published'` is **not** authoritative.

### Join path

1. Load `neuramark_assembled_reels` by **`assembledReelId`** → missing → **`NOT_FOUND`**.
2. Read **`reel_script_id`** and **`client_id`** from reel row.
3. Query **`neuramark_content_calendar_slots`** where `reel_script_id = :reelScriptId` AND **`publish_status = 'published'`**.
4. If **zero rows** → **`NOT_PUBLISHED`**; no UPSERT.
5. If **≥1 row** → gate passes; use **`published_at` from row with latest `published_at` DESC** for edit-window calculation.

**Orphan case:** metrics row exists but no live published slot → step 4 fails → **`NOT_PUBLISHED`**.

---

## Edit window (write-time)

| Constant | Value |
|----------|-------|
| `REEL_METRICS_EDIT_WINDOW_DAYS` | **7** (default; server env override allowed — **not** client input) |

| Rule | Detail |
|------|--------|
| Anchor | **`published_at`** on linked published calendar slot — **not** `recorded_at` |
| Multi-slot | Latest **`published_at` DESC** among published slots for same `reel_script_id` |
| Create + update | Both require `now() <= anchor + REEL_METRICS_EDIT_WINDOW_DAYS` — **no late first entry** beyond window V1 |
| After expiry | Handler → **`EDIT_WINDOW_EXPIRED`**; read DTO `editable: false` |
| Timezone | Compare using server `now()` vs stored timestamptz — no client-supplied dates |

---

## UPSERT semantics

```sql
INSERT INTO neuramark_reel_metrics (
  client_id, assembled_reel_id,
  views, likes, comments, saves, dms,
  recorded_at
) VALUES (
  :clientIdFromReel, :assembledReelId,
  :views, :likes, :comments, :saves, :dms,
  now()
)
ON CONFLICT (assembled_reel_id) DO UPDATE SET
  client_id = EXCLUDED.client_id,
  views = EXCLUDED.views,
  likes = EXCLUDED.likes,
  comments = EXCLUDED.comments,
  saves = EXCLUDED.saves,
  dms = EXCLUDED.dms,
  recorded_at = now(),
  updated_at = now();
```

| Rule | Detail |
|------|--------|
| Key | **`assembled_reel_id`** UNIQUE — one row per Ensamblado |
| `client_id` | Always from assembled reel row on INSERT and UPDATE |
| `recorded_at` | **`now()`** on every successful write — client cannot set |
| Partial updates | **Forbidden** — all five counters required each save |

---

## `upsertReelMetrics({ assembledReelId, views, likes, comments, saves, dms })`

**Kind:** Server Action  
**File (BUILD):** `lib/metrics/actions/upsert-reel-metrics.ts`  
**Orchestrator (BUILD):** `lib/metrics/upsert-reel-metrics.ts` (optional core for tests)  
**Consumer:** `components/calendar/OperatorCalendarView.tsx` Sidebar metrics section

### Gate order (Condition 1)

1. **`requireOperator("handler")`** — first `await`. Failure → **`FORBIDDEN`** / **`UNAUTHENTICATED`**, **zero side effects**.
2. **`findForbiddenReelMetricsKeys(rawInput)`** — any match → **`FORBIDDEN_FIELDS`**.
3. **`upsertReelMetricsInputSchema.safeParse`** — failure → **`VALIDATION_ERROR`** (incl. blank coalesce failures for non-numeric strings).
4. **`checkReelMetricsUpsertRateLimit(operator.clientId)`** — over limit → **`RATE_LIMITED`**.
5. Load assembled reel by `assembledReelId` — missing → **`NOT_FOUND`**.
6. **Published gate join** — no live published slot → **`NOT_PUBLISHED`**.
7. **Edit window check** — expired → **`EDIT_WINDOW_EXPIRED`**.
8. **UPSERT** metrics row (`client_id` from reel row).
9. **`recordReelMetricsUpsertAttempt(operator.clientId)`** — on **successful UPSERT only** (failed validation/gates do not consume budget).
10. Build **`ReelMetricsDto`** from post-write row + computed `editable` — success response.

### Request

```ts
{
  assembledReelId: string;  // UUID — .strict(); sole identity key
  views: number;              // integer 0 … REEL_METRICS_MAX_VALUE; blank coalesced to 0
  likes: number;
  comments: number;
  saves: number;
  dms: number;
}
```

**Forbidden keys (reject → `FORBIDDEN_FIELDS` before parse):**  
`client_id`, `clientId`, `slotId`, `slot_id`, `weekStart`, `week_start`, `publish_status`, `publishStatus`, `status`, `pipelineStatus`, `recorded_at`, `recordedAt`, `editable`, `created_at`, `updated_at`, `role`, `auth_user_id`, `strategyId`, `approvalId`, cost/provider/content authority keys — full list in **`FORBIDDEN_REEL_METRICS_AUTHORITY_KEYS`** (`lib/contracts/reel-metrics.ts`).

### Success

```ts
{
  ok: true;
  metrics: ReelMetricsDto;
}
```

**Post-mutation UX (FE):** toast/inline success; call **`getOperatorCalendarForWeek({ weekStart })`** for current week refresh (required minimum — mirror US-12.2).

### Error envelope

| Code | When | Typical `messageKey` |
|------|------|---------------------|
| `UNAUTHENTICATED` | No session | `auth.errors.unauthenticated` |
| `FORBIDDEN` | Cliente / non-operator | `auth.errors.forbidden` |
| `FORBIDDEN_FIELDS` | Forbidden authority keys in body | `calendar.errors.forbiddenFields` |
| `VALIDATION_ERROR` | Zod failure; non-integer; out-of-range counter | `calendar.metrics.errors.validation` |
| `NOT_FOUND` | Unknown `assembledReelId` | `calendar.metrics.errors.notFound` |
| `NOT_PUBLISHED` | No live published calendar slot links to reel | `calendar.metrics.errors.notPublished` |
| `EDIT_WINDOW_EXPIRED` | Outside 7-day window (create or update) | `calendar.metrics.errors.editWindowExpired` |
| `RATE_LIMITED` | >30 upserts / 60 min / operator | `calendar.metrics.errors.rateLimited` |
| `INTERNAL_ERROR` | Unexpected | `calendar.errors.internal` |

```ts
{ ok: false; error: { code: ReelMetricsErrorCode; fields?: Record<string, string[]>; messageKey?: string } }
```

---

## Rate limit

Reuse **`neuramark_agent_rate_limits`** (US-4.1 table).

| Constant | Value |
|----------|-------|
| `REEL_METRICS_UPSERT_AGENT_KEY` | `'reel_metrics_upsert'` |
| `REEL_METRICS_UPSERT_MAX_PER_WINDOW` | **30** |
| `REEL_METRICS_UPSERT_RATE_WINDOW_MS` | **60 × 60 × 1000** (rolling) |
| Scope | Operator session **`client_id`** (from `requireOperator`) |
| Check timing | After operator gate + forbidden keys + Zod; **before** reel load |
| Record timing | **Successful UPSERT only** |
| Over limit | **`RATE_LIMITED`** — no DB write |

**File (BUILD):** `lib/metrics/check-reel-metrics-upsert-rate-limit.ts` (mirror `lib/calendar/check-calendar-mark-published-rate-limit.ts`).

---

## TypeScript interfaces and Zod modules

### `lib/contracts/reel-metrics.ts` (committed in CONTRACT gate)

| Export | Purpose |
|--------|---------|
| `REEL_METRICS_EDIT_WINDOW_DAYS` | Default 7 |
| `REEL_METRICS_MAX_VALUE` | 99_999_999 |
| `REEL_METRICS_UPSERT_AGENT_KEY` | `'reel_metrics_upsert'` |
| `REEL_METRICS_UPSERT_MAX_PER_WINDOW` | 30 |
| `REEL_METRICS_UPSERT_RATE_WINDOW_MS` | 3_600_000 |
| `reelMetricCounterSchema` | Strict integer bounds (read/DTO) |
| `reelMetricCounterInputSchema` | Preprocess blank → 0 + bounds (action input) |
| `reelMetricsDtoSchema` | Read snapshot + success payload |
| `ReelMetricsDto` | Inferred type |
| `upsertReelMetricsInputSchema` | Action input `.strict()` |
| `UpsertReelMetricsInput` | Inferred type |
| `upsertReelMetricsSuccessSchema` | `{ ok: true, metrics }` |
| `upsertReelMetricsResultSchema` | Success ∪ error union |
| `UpsertReelMetricsResult` | Inferred type |
| `REEL_METRICS_ERROR_CODES` | Error code const array |
| `ReelMetricsErrorCode` | Inferred type |
| `FORBIDDEN_REEL_METRICS_AUTHORITY_KEYS` | Forbidden key list |
| `findForbiddenReelMetricsKeys()` | Pre-parse scan |
| `REEL_METRICS_MESSAGE_KEYS` | i18n key map |

### `lib/contracts/calendar.ts` delta (committed in CONTRACT gate)

| Export | Change |
|--------|--------|
| `calendarSlotDetailDtoSchema` | Adds optional **`metrics: reelMetricsDtoSchema.nullable()`** |
| `CalendarSlotDetailDto` | Inferred type includes `metrics` |

---

## Frontend contract (for FE signoff)

| Consumer | Route / component | Contract surface |
|----------|-------------------|------------------|
| Calendar Sidebar | `components/calendar/OperatorCalendarView.tsx` | Metrics section |
| Metrics form | `ReelMetricsSection` child (recommended) | Five `InputNumber` fields + Save |
| Save CTA | Same | Calls `upsertReelMetrics`; disabled when `metrics?.editable === false` |
| Read-only state | Same | Show values + window-expired copy; hide Save |
| `recordedAt` | Same | Formatted when non-null |
| Success | Same | Toast or inline success + refresh week via `router.refresh()` |
| i18n | `messages/en.json` + `es.json` | **`calendar.metrics.*`** EN/ES |
| Types | FE imports | `lib/contracts/reel-metrics.ts` + `lib/contracts/calendar.ts` |
| Error mapper | `components/calendar/map-reel-metrics-error.ts` | Map codes / `messageKey` via `REEL_METRICS_MESSAGE_KEYS` |

**Section gating (UX only — server enforces):**

- Show metrics section: `pipelineStatus === 'published'` **and** `assembledReelId != null`
- Hide for draft / generating / qa / pending / approved / rejected
- Pre-fill from `selectedSlot.metrics` when non-null; default **0** when counters absent
- Save disabled when `metrics.editable === false`; all `InputNumber` fields disabled in read-only state

**Do not** add `/operator/metrics` route.

### FE implementation notes (BUILD)

- **Placement:** Sidebar block after published-on / IG link row, before deep-link CTAs — same scroll context as US-12.2 publish metadata.
- **Component split:** Optional `ReelMetricsSection.tsx` client child (mirrors `MarkPublishedDialog` extraction) keeps `OperatorCalendarView` readable; props: `slot`, `copy`, `locale`, `onSuccess`.
- **InputNumber:** `useGrouping={false}` `min={0}` `max={REEL_METRICS_MAX_VALUE}`; allow `null` while editing — submit passes through to Server Action (Zod blank → 0). Disable inputs when `!metrics?.editable`.
- **Mutation body:** `{ assembledReelId: slot.assembledReelId, views, likes, comments, saves, dms }` — **never** `slotId` or `client_id`.
- **Pending:** `useTransition` on Save; disable form while pending (US-12.2 pattern).
- **Success:** Close/hold Sidebar; merge returned `metrics` into `selectedSlot` optional; **`router.refresh()`** required minimum for week RSC re-fetch.
- **Errors:** `mapReelMetricsError` — field keys `views` / `likes` / `comments` / `saves` / `dms` on `VALIDATION_ERROR`; server banner for `NOT_PUBLISHED`, `EDIT_WINDOW_EXPIRED`, `RATE_LIMITED`, auth codes.
- **recordedAt:** Format with `Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })` when non-null; omit row when null.
- **i18n keys (EN/ES):** `calendar.metrics.title`, `views`, `likes`, `comments`, `saves`, `dms`, `recordedAtLabel`, `save`, `savePending`, `success`, `editWindowExpired`, `errors.{notFound,notPublished,editWindowExpired,rateLimited,validation,forbidden,forbiddenFields,internal,unauthenticated}` — wire from `app/(app)/operator/calendar/page.tsx` copy props.
- **Disputes:** none.

---

## Fixtures (mock against)

### Success — first save

**Request:**

```json
{
  "assembledReelId": "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  "views": 1250,
  "likes": 89,
  "comments": 12,
  "saves": 34,
  "dms": 5
}
```

**Response:**

```json
{
  "ok": true,
  "metrics": {
    "views": 1250,
    "likes": 89,
    "comments": 12,
    "saves": 34,
    "dms": 5,
    "recordedAt": "2026-08-31T13:00:00.000Z",
    "editable": true
  }
}
```

### Success — blank coalesced to zero

**Request:**

```json
{
  "assembledReelId": "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  "views": "",
  "likes": 0,
  "comments": null,
  "saves": 0,
  "dms": 0
}
```

→ `views: 0`, `comments: 0` in persisted row.

### Calendar DTO — published slot without metrics row

```json
{
  "slotId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "pipelineStatus": "published",
  "assembledReelId": "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  "publishedAt": "2026-08-30T12:00:00.000Z",
  "metrics": {
    "views": 0,
    "likes": 0,
    "comments": 0,
    "saves": 0,
    "dms": 0,
    "recordedAt": null,
    "editable": true
  }
}
```

### Not published

```json
{ "ok": false, "error": { "code": "NOT_PUBLISHED", "messageKey": "calendar.metrics.errors.notPublished" } }
```

### Edit window expired

```json
{ "ok": false, "error": { "code": "EDIT_WINDOW_EXPIRED", "messageKey": "calendar.metrics.errors.editWindowExpired" } }
```

### Reel not found

```json
{ "ok": false, "error": { "code": "NOT_FOUND", "messageKey": "calendar.metrics.errors.notFound" } }
```

### Forbidden fields

```json
{
  "assembledReelId": "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  "views": 100,
  "likes": 10,
  "comments": 0,
  "saves": 0,
  "dms": 0,
  "client_id": "11111111-1111-4111-8111-111111111111"
}
```

→ `{ "ok": false, "error": { "code": "FORBIDDEN_FIELDS" } }`

### Validation — negative counter

```json
{
  "assembledReelId": "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  "views": -1,
  "likes": 0,
  "comments": 0,
  "saves": 0,
  "dms": 0
}
```

→ `{ "ok": false, "error": { "code": "VALIDATION_ERROR", "fields": { "views": ["…"] } } }`

### Cliente session

→ `{ "ok": false, "error": { "code": "FORBIDDEN" } }` — zero DB writes.

---

## Security tests (minimum — Condition 14)

| Test file | Case | Expect |
|-----------|------|--------|
| `lib/metrics/upsert-reel-metrics.test.ts` | Cliente session → `upsertReelMetrics` | **403** `FORBIDDEN`; no UPSERT |
| same | Operator → published reel within window happy path | **200** `{ ok: true, metrics }` + persisted counters |
| same | Non-published reel (no published slot) | **`NOT_PUBLISHED`**; no UPSERT |
| same | Expired window (create) | **`EDIT_WINDOW_EXPIRED`** |
| same | Expired window (update existing row) | **`EDIT_WINDOW_EXPIRED`**; row unchanged |
| same | Missing assembled reel UUID | **`NOT_FOUND`** |
| same | Body with `client_id` | **`FORBIDDEN_FIELDS`** |
| same | Body with `publish_status: "published"` | **`FORBIDDEN_FIELDS`** |
| same | Body with `slotId` | **`FORBIDDEN_FIELDS`** or strict Zod reject |
| same | Negative counter | **`VALIDATION_ERROR`** |
| same | Float counter (`1.5`) | **`VALIDATION_ERROR`** |
| same | Over-max counter (`100_000_000`) | **`VALIDATION_ERROR`** |
| same | Operator cross-tenant write when published slot exists | **Success** — not blocked by session tenant |
| same | Rate limit exceeded | **`RATE_LIMITED`** |
| same | Blank views coalesced to 0 | Success with `views: 0` |
| `lib/calendar/calendar.test.ts` (extend) | Published slot DTO includes `metrics` snapshot | Non-null with `editable` computed |
| same | Non-published slot DTO | `metrics: null` |
| grep | `getOperator-calendar-for-week` / read action | No metrics UPSERT |
| grep | metrics action modules | No Graph/integrations imports |

---

## Server-only modules (planned BUILD)

| Module | Purpose |
|--------|---------|
| `lib/metrics/actions/upsert-reel-metrics.ts` | `"use server"` export |
| `lib/metrics/upsert-reel-metrics.ts` | Orchestrator / core |
| `lib/metrics/check-reel-metrics-upsert-rate-limit.ts` | Rate limit check + record |
| `lib/metrics/errors.ts` | Typed error envelope builders |
| `lib/metrics/load-published-slot-for-reel.ts` | Published gate + window anchor helper |
| `lib/calendar/get-operator-calendar-for-week.ts` | DTO mapper delta — join metrics + `editable` |
| `lib/contracts/reel-metrics.ts` | Zod + types (**committed in CONTRACT gate**) |
| `lib/contracts/calendar.ts` | DTO delta (**committed in CONTRACT gate**) |
| `supabase/migrations/20260831070000_neuramark_reel_metrics.sql` | CREATE DDL |

---

## Handoffs

| Direction | Artifact | Rule |
|-----------|----------|------|
| From US-12.2 | `publish_status = published`, `publishedAt`, `assembledReelId` | Metrics UI + write gate only on published Reels |
| From US-12.1 | Calendar Sidebar, slot ↔ script join path | Published check joins via `reel_script_id` |
| From US-9.x | `neuramark_assembled_reels.id` + `client_id` | Metrics FK + tenancy verification |
| To US-13.2 | `neuramark_reel_metrics` rows keyed by `assembled_reel_id` | Aggregate by theme/pillar via script → strategy slot; `recorded_at` for recency; index `(client_id, recorded_at DESC)` |

---

## Non-goals (reaffirmed)

- Instagram Insights / Graph API auto-import.
- Separate `/operator/metrics` route or page.
- Strategy agent prompt / US-13.2 aggregation.
- Cliente metrics surfaces.
- Charts, dashboards, CSV import.
- Operator override of 7-day edit window.
- Metrics on non-published Reels.
- `client_id` on mutation input.
- Session-tenant write filter for Operator.
- Overloading `getOperatorCalendarForWeek` with write behavior.
- RBAC beyond `requireOperator()`.
- Orphan metrics re-link UI (Phase B).

---

## Reviewed by FE

**Reviewed by FE:** approved — 2026-08-31 — nextjs-frontend

**Verdict:** Accept — extend existing `OperatorCalendarView` Sidebar with inline metrics section (optional `ReelMetricsSection` child) against frozen `upsertReelMetrics` / `ReelMetricsDto` / `CalendarSlotDetailDto.metrics` in contract modules. Matches US-12.2 `useTransition` + `router.refresh()` + error-mapper patterns; no new route.

### FE signoff notes (non-blocking)

- **Surface:** No new route — metrics form lives in Sidebar when published + `assembledReelId`. Operator may edit any active client's published Reel (not limited to `sessionClientId`).
- **DTO assumption:** BE emits non-null `metrics` snapshot whenever `pipelineStatus === 'published'` and `assembledReelId` is set; FE may defensively default counters to 0 if null during BUILD overlap.
- **Read-only UX:** When `metrics.editable === false`, disable all inputs, hide Save, show `calendar.metrics.editWindowExpired` copy; still display counter values and `recordedAt` when present.
- **Success feedback:** PrimeReact `Toast` (optional, cf. scripts page) or inline `Message` severity success — either satisfies CONTRACT.
- **PrimeReact `InputNumber`:** Frozen per PO Q4 — not plain `InputText`; integer-only via `min`/`max` and server Zod.

**FE signoff checklist (blocking BUILD):**

- [x] **Metrics section:** Sidebar when `pipelineStatus === 'published'` + `assembledReelId`.
- [x] **Form:** Five PrimeReact `InputNumber` fields; blank → 0 on submit (server Zod coalesce).
- [x] **Save CTA:** Calls `upsertReelMetrics`; disabled when `metrics.editable === false`.
- [x] **Read-only:** Expired window shows values + copy; no Save.
- [x] **Success:** Toast or inline success + refresh week via `router.refresh()`.
- [x] **Errors:** Map codes to `calendar.metrics.*` i18n keys via `REEL_METRICS_MESSAGE_KEYS`.
- [x] **Types:** Import from `lib/contracts/reel-metrics.ts` + `calendar.ts` only.
- [x] **i18n:** `calendar.metrics.*` EN/ES.

---

## Key contract decisions (summary)

1. **Mutation key:** `assembledReelId` only — no `slotId`, no `client_id` on input.
2. **Table:** `neuramark_reel_metrics` — UNIQUE `assembled_reel_id`, FK CASCADE to assembled reels, index `(client_id, recorded_at DESC)`.
3. **Migration:** `20260831070000_neuramark_reel_metrics.sql`.
4. **Gate order:** `requireOperator` → forbidden keys → Zod → rate limit → reel load → published gate → edit window → UPSERT → record attempt.
5. **Blank inputs:** coalesce to **0**; invalid strings → `VALIDATION_ERROR`.
6. **Max value:** **99_999_999** per counter.
7. **Edit window:** **7 days** from latest `published_at`; dedicated **`EDIT_WINDOW_EXPIRED`** code.
8. **Missing reel:** **`NOT_FOUND`** (not `REEL_NOT_FOUND`).
9. **Rate limit:** **`reel_metrics_upsert`** — 30 / 60 min / operator `client_id`.
10. **Calendar DTO:** `metrics` snapshot with server-computed **`editable`** on published slots.
11. **Orphan metrics:** row retained for US-13.2; write blocked with **`NOT_PUBLISHED`** when no live published slot.
12. **Tenancy:** `client_id` from reel row; Operator cross-tenant writes allowed.
