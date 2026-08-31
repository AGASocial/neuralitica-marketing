# API Contract — US-12.2 Mark manual publication done

**Story:** US-12.2  
**Status:** Frozen — 2026-08-30 · **Reviewed by FE:** yes — 2026-08-30 — nextjs-frontend  
**Security:** `plan/stories/US-12.2/SECURITY.md` (APPROVE WITH CONDITIONS — 13 conditions reconciled below)  
**Spec review:** `plan/stories/US-12.2/SPEC-REVIEW.md` (GAPS — 5 Low closed below)  
**Pattern:** US-12.1 calendar read + sync · US-11.x approval statuses · ADR-0002 approved-only guard (manual mark only)  
**Depends on:** US-12.1 ✅ · US-11.x ✅ · US-14.5 ✅ `requireOperator()`  
**Feature branch:** `feature/US-12.2-mark-published`  
**Error envelope style:** Server Actions — same house pattern as US-12.1 (`ok: true` vs `{ ok: false, error: { code, fields?, messageKey? } }`).

**This document is CONTRACT ONLY.** Zod mirrors live in `lib/contracts/calendar.ts` (committed with this freeze). Migration ALTER, `markCalendarSlotPublished` Server Action, sync preserve extension, read DTO mapper delta, and FE Dialog are specified here and applied during BUILD — **not shipped in this gate commit**.

**Terminology:** **Calendario de contenido** · **Operator** · **Cliente** · **Reel** · **Aprobación** · **publicado** · **listo para publicar** · **Ensamblado**. Do **not** use CONTEXT _Evitar_ terms on Operator surfaces ("publish queue" as primary noun; admin/staff; unvalidated IG `href`; `client_id` as mutation authority).

---

## SPEC-REVIEW gaps closed (5 Low)

| # | Gap | Resolution in this contract |
|---|-----|----------------------------|
| 1 | SPEC §3 P2 label vs USER_STORIES P1 | § Overview — sprint source of truth is USER_STORIES + frozen PREP; full Phase A scope unchanged. |
| 2 | USER_STORIES DB row stale (no `published_at` / `instagram_post_url`) | § Database ALTER — full column set on `neuramark_content_calendar_slots`. |
| 3 | Open questions not frozen until CONTRACT | § PO open questions — all 10 README items resolved below. |
| 4 | Sync orphan DELETE of published slots — metrics orphan risk | § Sync preserve — reaffirm hard DELETE; document US-13.1 graceful handling. |
| 5 | Re-mark after approval revoked — edge case | § Approval re-check — `NOT_APPROVED` on every write; published row unchanged on reject. |

---

## SECURITY reconciliation (13 conditions)

| # | SECURITY condition | **Frozen in this contract** |
|---|-------------------|----------------------------|
| 1 | `requireOperator` first — zero side effects on 403 | § `markCalendarSlotPublished` gate order |
| 2 | `slotId` + publish fields only — no `client_id` | § Request · `FORBIDDEN_MARK_PUBLISHED_AUTHORITY_KEYS` |
| 3 | Write-time approval re-check — `approved` only | § Approval re-check join · `NOT_APPROVED` / `SLOT_NOT_READY` |
| 4 | Forbidden status / identity spoof keys | § Forbidden keys list |
| 5 | IG URL allowlist + XSS-safe render | § `calendarInstagramPostUrlSchema` · FE link rules |
| 6 | `publishedAt` date-only → UTC noon storage + bounds | § `publishedAt` validation |
| 7 | Dedicated mutation surface — not read-action overload | § Surfaces · § Non-goals |
| 8 | DTO delta + read validation | § Response DTO delta |
| 9 | Sync preserve publish metadata — no escalation | § Sync preserve rules |
| 10 | Rate limit `calendar_mark_published` 30/60 min | § Rate limit |
| 11 | Idempotent re-mark + no unpublish V1 | § Re-mark rules · § Non-goals |
| 12 | Error envelope consistency | § Error envelope |
| 13 | Security tests minimum list | § Security tests |

**Inherited floors (US-14.5 / US-12.1 / US-11.3 / SECURITY_BASELINE):** `requireOperator()` → `requireActive()` first; role never from request; RLS deny-by-default; service-role Node only; no browser Supabase keys; interim hardcoded user sanctioned.

---

## Phased BUILD acceptance

| Phase | Scope | Closes |
|-------|-------|--------|
| **A (US-12.2 BUILD — ship all in this story)** | ALTER `published_at` + `instagram_post_url` · `markCalendarSlotPublished` · approved-only re-check · IG URL Zod · Sidebar Dialog CTA · DTO fields · sync preserve · [SEC] Operator 403 + approved-only · EN/ES `calendar.markPublished.*` | USER_STORIES § US-12.2 AC (all four) |
| **B (deferred — not US-12.2)** | Unpublish / revert to `ready` · edit-published audit · Instagram Graph publish (ADR-0002) · auto-mark on Graph success | Backlog / US-13.x / integrations |

**VALIDATION note (binding):** Phase A closes full US-12.2 AC. FE CTA on `pipelineStatus === 'approved'` is UX only — VALIDATION must prove non-approved and non-operator paths fail in the handler. Idempotent re-mark allowed when still approved; unpublish must not exist in Phase A.

---

## Overview

US-12.2 ships **Operator mark-published V1 (Phase A)**: from the existing `/operator/calendar` Sidebar, mark an **approved** Reel as **publicado** with editable published date (default today) and optional Instagram post URL; persist `publish_status = published` plus `published_at` / `instagram_post_url` on `neuramark_content_calendar_slots`; enforce **approved-only** and **Operator-only** server-side. Unlocks US-13.1 metrics on published Reels.

**This is manual bookkeeping only** — not Instagram Graph API publish (ADR-0002 deferred).

**Surfaces**

| # | Surface | Kind | Consumer |
|---|---------|------|----------|
| 1 | `markCalendarSlotPublished` | Server Action | `/operator/calendar` Sidebar Dialog |
| 2 | `markCalendarSlotPublishedCore` | Server-only orchestrator (optional) | Action + unit tests |
| 3 | `getOperatorCalendarForWeek` (extended DTO) | Server Action (read — unchanged write behavior) | Week grid refresh after mark success |
| 4 | `syncCalendarSlotsForWeek` (preserve extension) | Server-only helper | Sync-on-read — preserve publish metadata |
| 5 | Zod + types | `lib/contracts/calendar.ts` | FE types · BE validation |
| 6 | Migration ALTER | `neuramark_content_calendar_slots` | Publish metadata columns |
| 7 | Sidebar Dialog | FE | Mark published / update publish details |

**Forbidden surfaces (BUILD veto):**

- `client_id` / `clientId` on mark-published action input.
- `publish_status` / `publishStatus` / `status` / `pipelineStatus` on mutation input.
- `assembledReelId`, `approvalId`, `weekStart`, cost/provider/content authority keys on mutation input.
- Write branch on `getOperatorCalendarForWeek`.
- UPDATE `publish_status = 'published'` anywhere except `markCalendarSlotPublished` (incl. sync, read paths).
- Unpublish / revert to `ready` in V1.
- Instagram Graph API publish / ADR-0002 adapter imports in mark action modules.
- Cliente mark-published or Cliente calendar mutation.
- Approval status mutations from mark action.
- Separate `/operator/calendar/publish` page or route.
- Metrics form / `neuramark_reel_metrics` (US-13.1).
- Rendering user-typed IG URL as `href` before server-validated DTO value.

**Why Server Action (not Route Handler):** UI-coupled Operator mutation from Sidebar Dialog; matches approval decide / strategy patterns; CSRF via Next.js origin check.

---

## PO open questions — CONTRACT resolutions

| # | Question (PREP) | **Frozen resolution** |
|---|-----------------|----------------------|
| 1 | IG host strictness | **Require `https://www.instagram.com/`** — reject bare `instagram.com`, `m.instagram.com`, `instagr.am` V1 |
| 2 | `publishedAt` input shape | **Date-only `YYYY-MM-DD`** in action input; store **`timestamptz` at UTC noon** (`YYYY-MM-DDT12:00:00.000Z`) |
| 3 | Future-dated `publishedAt`? | **Allow up to Operator-local today + 1 calendar day** (timezone skew); reject further future; **not before slot `week_start`** |
| 4 | Re-mark when approval revoked? | **Re-check `approved` on every write** — reject with `NOT_APPROVED`; published row unchanged |
| 5 | Return shape | **`{ ok: true, slot: CalendarSlotDetailDto }`** + FE calls existing `getOperatorCalendarForWeek` week refresh |
| 6 | Rate limit | **30 attempts per operator `client_id` per rolling 60 minutes** via `neuramark_agent_rate_limits` / `calendar_mark_published` |
| 7 | Empty URL vs omit | **`""` / whitespace-only → `null`**; re-mark may clear URL while staying published |
| 8 | Sync orphan DELETE of published | **Keep US-12.1 hard DELETE** — document metrics orphan risk for US-13.1 |
| 9 | IG link `target=_blank` | **Required** FE hardening (`rel="noopener noreferrer"`) |
| 10 | Column name | **`instagram_post_url`** (text NULL) |

---

## Database

**Migration (BUILD):** `supabase/migrations/*_neuramark_content_calendar_slots_publish_metadata.sql`  
**Rule:** ALTER TABLE only — **do not** recreate table. Timestamp after US-12.1 `20260831050000_…`.

### ALTER `neuramark_content_calendar_slots`

Add publish metadata columns for manual Operator mark (US-12.2) and US-13.1 metrics gate.

```sql
ALTER TABLE public.neuramark_content_calendar_slots
  ADD COLUMN published_at timestamptz NULL,
  ADD COLUMN instagram_post_url text NULL;

COMMENT ON COLUMN public.neuramark_content_calendar_slots.published_at IS
  'US-12.2: Operator manual mark-published date (UTC noon anchor). NULL until marked published.';

COMMENT ON COLUMN public.neuramark_content_calendar_slots.instagram_post_url IS
  'US-12.2: Validated https://www.instagram.com/... permalink. NULL when omitted or cleared on re-mark.';
```

| Column | Rule |
|--------|------|
| `published_at` | Set on mark-published UPDATE; NULL while `publish_status = 'ready'`; stored as UTC noon for input calendar date |
| `instagram_post_url` | Optional validated HTTPS IG permalink; NULL allowed; max 500 chars enforced app-side |
| `publish_status` | **Unchanged CHECK** `'ready' \| 'published'` — only `markCalendarSlotPublished` sets `'published'` |
| RLS | Deny-by-default unchanged — service-role Node only |
| Index | **None V1** — lean; no extra index on publish columns |

**No new enums.** **No RLS policies.**

---

## Response DTO delta (US-12.2)

Extend **`CalendarSlotDetailDto`** (and card schema superset) with publish metadata for Sidebar + violet published card affordances.

| Field | Type | Rule |
|-------|------|------|
| `publishedAt` | `string \| null` | ISO 8601 UTC timestamptz when `publish_status = 'published'` (e.g. `2026-08-30T12:00:00.000Z`); **`null`** when not published |
| `instagramPostUrl` | `string \| null` | When non-null, must pass **`calendarInstagramPostUrlSchema`** (same rules as input); **`null`** when unset |

**Read mapper (BUILD):** SELECT `published_at`, `instagram_post_url` from calendar row; map `published_at` to ISO string; parse URL through read schema before DTO emit.

**Existing fields unchanged:** `pipelineStatus = 'published'` already derived when `publish_status === 'published'` (US-12.1 cascade priority 1).

---

## `calendarInstagramPostUrlSchema`

**File:** `lib/contracts/calendar.ts`  
**Used by:** mark-published input normalization · DTO read validation · success response build from persisted row.

```ts
// Frozen allowlist — reject javascript:, data:, non-HTTPS, non-www hosts, empty path
z.string()
  .trim()
  .max(500)
  .url()
  .refine((u) => {
    try {
      const p = new URL(u);
      return (
        p.protocol === "https:" &&
        p.hostname === "www.instagram.com" &&
        p.pathname.length > 1
      );
    } catch {
      return false;
    }
  });
```

**Rejected V1:** `http://…`, bare `instagram.com`, `m.instagram.com`, `instagr.am`, `javascript:…`, `data:…`, URLs without path segment.

**Invalid URL envelope:** **`VALIDATION_ERROR`** with `fields.instagramPostUrl` and `messageKey: "calendar.markPublished.errors.invalidIgUrl"`. There is **no separate top-level `INVALID_IG_URL` code** — FE maps via `messageKey` / field key (SECURITY condition 12).

---

## `publishedAt` validation

### Input (action)

| Rule | Detail |
|------|--------|
| Shape | **`YYYY-MM-DD`** date-only string — `calendarPublishedAtInputSchema` |
| Storage | Convert to **`published_at = `${publishedAt}T12:00:00.000Z``** (UTC noon anchor — avoids TZ flip on display) |
| Min bound | **`publishedAt >= slot.week_start`** (calendar date compare) |
| Max bound | **`publishedAt <= Operator-local today + 1 day`** (timezone skew window) |
| Invalid date | **`VALIDATION_ERROR`** with `fields.publishedAt` |

**FE default:** Operator local calendar **today** in Dialog date picker — submits `YYYY-MM-DD`.

### Output (DTO)

Return stored **`published_at`** as ISO 8601 UTC string (same noon anchor).

---

## Approval re-check (write-time)

**Mandatory on every `markCalendarSlotPublished` call** — including idempotent re-mark. FE `pipelineStatus === 'approved'` is **not** authoritative.

### Join path (mirror US-12.1 calendar read)

1. Load calendar slot by **`slotId`** (primary key) → if missing **`NOT_FOUND`** (uniform envelope — no tenant oracle).
2. Resolve **`reel_script_id`** from slot row (nullable).
3. If **`reel_script_id` IS NULL** → **`SLOT_NOT_READY`** (no assembly path).
4. Load latest **branded assembly** for script (same loader chain as `getOperatorCalendarForWeek` — assembly job with `output_media_asset_id` / `assembled_reel_id`).
5. If no assembled reel → **`SLOT_NOT_READY`**.
6. Load **latest** `neuramark_approvals` row for **`assembled_reel_id`** (same ordering as calendar read — `decided_at DESC` / `created_at DESC` tie-break per US-12.1 loader).
7. Require **`status === 'approved'`** → else **`NOT_APPROVED`** (pending_client, changes_requested, rejected, missing approval).
8. **No approval row UPDATE** in this action.

### UPDATE (only after steps 1–7 pass)

```sql
UPDATE neuramark_content_calendar_slots
SET
  publish_status = 'published',
  published_at = :publishedAtUtcNoon,
  instagram_post_url = :instagramPostUrlOrNull
WHERE id = :slotId;
-- updated_at bumped by existing trigger
```

**Tenant authority:** slot's `client_id` resolved from row — never from request. Operator may mark any active client's slot (product trust model).

---

## Re-mark rules (idempotent)

| Case | Behavior |
|------|----------|
| Already `publish_status = 'published'` + still approved | **Allow** — overwrite `published_at` and `instagram_post_url` (URL may be cleared to NULL) |
| Already published + approval no longer approved | **Reject `NOT_APPROVED`** — row unchanged |
| `publish_status = 'ready'` + approved | **Allow** — first mark; set all three publish fields |
| Unpublish / revert to `ready` | **Forbidden V1** — no code path |

---

## `markCalendarSlotPublished({ slotId, publishedAt, instagramPostUrl? })`

**Kind:** Server Action  
**File (BUILD):** `lib/calendar/actions/mark-calendar-slot-published.ts`  
**Orchestrator (BUILD):** `lib/calendar/mark-calendar-slot-published.ts` (optional core for tests)  
**Consumer:** `components/calendar/OperatorCalendarView.tsx` Sidebar Dialog

### Gate order (Condition 1)

1. **`requireOperator("handler")`** — first `await`. Failure → **`FORBIDDEN`** / **`UNAUTHENTICATED`**, **zero side effects**.
2. **`findForbiddenMarkPublishedKeys(rawInput)`** — any match → **`FORBIDDEN_FIELDS`**.
3. **`markCalendarSlotPublishedInputSchema.safeParse`** — failure → **`VALIDATION_ERROR`** (incl. invalid IG URL field).
4. **`checkCalendarMarkPublishedRateLimit(operator.clientId)`** — over limit → **`RATE_LIMITED`**.
5. Load slot by `slotId` — missing → **`NOT_FOUND`**.
6. **`publishedAt` bounds check** vs slot `week_start` + Operator-local today+1 — fail → **`VALIDATION_ERROR`**.
7. **Approval re-check join** — fail → **`NOT_APPROVED`** or **`SLOT_NOT_READY`**.
8. **UPDATE** publish columns.
9. **`recordCalendarMarkPublishedAttempt(operator.clientId)`** — on **successful UPDATE only** (failed validation/approval does not consume budget).
10. Build **`CalendarSlotDetailDto`** from post-write row + pipeline derivation — success DTO URL must pass read schema; **never echo raw request URL**.

### Request

```ts
{
  slotId: string;           // UUID — .strict(); sole identity key
  publishedAt: string;      // YYYY-MM-DD
  instagramPostUrl?: string | null;  // optional; "" / whitespace → null
}
```

**Forbidden keys (reject → `FORBIDDEN_FIELDS` before parse):**  
`client_id`, `clientId`, `weekStart`, `week_start`, `publish_status`, `publishStatus`, `status`, `pipelineStatus`, `assembledReelId`, `assembled_reel_id`, `approvalId`, `approval_id`, `reelScriptId`, `reel_script_id`, `strategyId`, `strategy_id`, `role`, `auth_user_id`, `slot_id`, `filter`, `limit`, `offset`, `storage_key`, `storageKey`, cost/provider/content authority keys — full list in **`FORBIDDEN_MARK_PUBLISHED_AUTHORITY_KEYS`** (`lib/contracts/calendar.ts`).

### Success

```ts
{
  ok: true;
  slot: CalendarSlotDetailDto; // pipelineStatus: "published"; publishedAt; instagramPostUrl
}
```

**Post-mutation UX (FE):** close Dialog; call **`getOperatorCalendarForWeek({ weekStart })`** for current week refresh; optional merge of returned `slot` into local state — week refresh is **required minimum**.

### Error envelope

| Code | When | Typical `messageKey` |
|------|------|---------------------|
| `UNAUTHENTICATED` | No session | `auth.errors.unauthenticated` |
| `FORBIDDEN` | Cliente / non-operator | `auth.errors.forbidden` |
| `FORBIDDEN_FIELDS` | Forbidden authority keys in body | `calendar.errors.forbiddenFields` |
| `VALIDATION_ERROR` | Zod failure; invalid date bounds; invalid IG URL | `calendar.errors.validation` · `calendar.markPublished.errors.invalidIgUrl` |
| `NOT_FOUND` | Unknown `slotId` | `calendar.markPublished.errors.notFound` |
| `NOT_APPROVED` | Latest approval not `approved` (incl. re-mark after revoke) | `calendar.markPublished.errors.notApproved` |
| `SLOT_NOT_READY` | Missing script, assembly, or assembled reel | `calendar.markPublished.errors.slotNotReady` |
| `RATE_LIMITED` | >30 mark attempts / 60 min / operator | `calendar.markPublished.errors.rateLimited` |
| `INTERNAL_ERROR` | Unexpected | `calendar.errors.internal` |

```ts
{ ok: false; error: { code: CalendarErrorCode; fields?: Record<string, string[]>; messageKey?: string } }
```

**Note on `INVALID_IG_URL`:** Delivered as **`VALIDATION_ERROR`** + `fields.instagramPostUrl` — not a separate envelope code (SECURITY § condition 12).

---

## Rate limit

Reuse **`neuramark_agent_rate_limits`** (US-4.1 table).

| Constant | Value |
|----------|-------|
| `CALENDAR_MARK_PUBLISHED_AGENT_KEY` | `'calendar_mark_published'` |
| `CALENDAR_MARK_PUBLISHED_MAX_PER_WINDOW` | **30** |
| `CALENDAR_MARK_PUBLISHED_RATE_WINDOW_MS` | **60 × 60 × 1000** (rolling) |
| Scope | Operator session **`client_id`** (from `requireOperator`) |
| Check timing | After operator gate + forbidden keys + Zod; **before** slot load |
| Record timing | **Successful UPDATE only** |
| Over limit | **`RATE_LIMITED`** — no DB write |

**File (BUILD):** `lib/calendar/check-calendar-mark-published-rate-limit.ts` (mirror `lib/approvals/check-approval-rate-limit.ts`).

---

## Sync preserve rules (US-12.2 delta on US-12.1)

**File:** `lib/calendar/sync-calendar-slots-for-week.ts`

### Preserve on UPSERT UPDATE

When upserting an **existing** calendar row, UPDATE SET clause may include **`strategy_id`**, **`scheduled_date`**, **`reel_script_id`**, **`updated_at`** only.

**Must NOT appear in UPDATE SET:**

- `publish_status`
- `published_at`
- `instagram_post_url`

Existing publish metadata **preserved by omission** (same pattern as US-12.1 `publish_status` preserve).

### INSERT

New rows: `publish_status = 'ready'`; `published_at = NULL`; `instagram_post_url = NULL`.

### Non-escalation (BUILD veto)

Sync must **never** set `publish_status = 'published'` or write publish metadata. Only **`markCalendarSlotPublished`** may transition to published.

### Orphan DELETE (unchanged US-12.1)

Hard DELETE calendar rows when strategy brief drops a slot index — **including published rows**. Known V1 residual: US-13.1 metrics may orphan if slot deleted after publish. US-13.1 CONTRACT should handle missing slot gracefully.

### `loadExistingSlotsForClientWeek` extension (BUILD)

If sync needs publish awareness for tests/logging, may SELECT `publish_status`, `published_at`, `instagram_post_url` — but UPDATE must still omit them from SET.

---

## Frontend contract (for FE signoff)

| Consumer | Route / component | Contract surface |
|----------|-------------------|------------------|
| Calendar Sidebar | `components/calendar/OperatorCalendarView.tsx` | Dialog + CTA |
| Mark CTA | Same | Visible when `pipelineStatus === 'approved'` and not in update-only mode |
| Published display | Same | When `pipelineStatus === 'published'`: show `publishedAt` + IG link icon from DTO |
| Update CTA | Same | Optional **"Update publish details"** when published — same Dialog |
| Dialog form | PrimeReact `Dialog` | Date (default today) + optional IG URL; submit → `markCalendarSlotPublished` |
| Success | Same | Close Dialog; refresh week via `getOperatorCalendarForWeek` |
| IG link | Same | Render **only** `slot.instagramPostUrl` from DTO; `target="_blank"` + `rel="noopener noreferrer"` |
| i18n | `messages/en.json` + `es.json` | **`calendar.markPublished.*`** EN/ES |
| Types | FE imports | `lib/contracts/calendar.ts` only — no ad-hoc shapes |

**CTA gating (UX only — server enforces):**

- Show Mark published: `pipelineStatus === 'approved'`
- Hide/disable: draft, generating, qa, pending, rejected paths
- Published: show date + link; optional update CTA

**Do not** add `/operator/calendar/publish` route.

---

## Fixtures (mock against)

### Success — first mark

**Request:**

```json
{
  "slotId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "publishedAt": "2026-08-30",
  "instagramPostUrl": "https://www.instagram.com/reel/ABC123xyz/"
}
```

**Response:**

```json
{
  "ok": true,
  "slot": {
    "slotId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "clientId": "11111111-1111-4111-8111-111111111111",
    "clientDisplayName": "Cafe Luna",
    "weekStart": "2026-08-25",
    "scheduledDate": "2026-08-26",
    "slotIndex": 1,
    "tema": "Promo del martes",
    "reelScriptId": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    "pipelineStatus": "published",
    "approvalId": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    "assembledReelId": "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    "thumbnailPreviewUrl": "/api/media/assets/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    "strategyId": "ffffffff-ffff-4fff-8fff-ffffffffffff",
    "goal": "local_sale",
    "approvalStatus": "approved",
    "changesRequested": false,
    "publishedAt": "2026-08-30T12:00:00.000Z",
    "instagramPostUrl": "https://www.instagram.com/reel/ABC123xyz/"
  }
}
```

### Success — re-mark clear URL

**Request:**

```json
{
  "slotId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "publishedAt": "2026-08-29",
  "instagramPostUrl": ""
}
```

→ `instagramPostUrl: null` in response; `publish_status` stays `published`.

### Not approved

```json
{ "ok": false, "error": { "code": "NOT_APPROVED", "messageKey": "calendar.markPublished.errors.notApproved" } }
```

### Forbidden fields

```json
{ "slotId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "publishedAt": "2026-08-30", "client_id": "11111111-1111-4111-8111-111111111111" }
```

→ `{ "ok": false, "error": { "code": "FORBIDDEN_FIELDS" } }`

### Invalid IG URL

```json
{ "slotId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "publishedAt": "2026-08-30", "instagramPostUrl": "https://instagram.com/p/abc" }
```

→ `{ "ok": false, "error": { "code": "VALIDATION_ERROR", "messageKey": "calendar.markPublished.errors.invalidIgUrl", "fields": { "instagramPostUrl": ["…"] } } }`

### Cliente session

→ `{ "ok": false, "error": { "code": "FORBIDDEN" } }` — zero DB writes.

---

## Security tests (minimum — Condition 13)

| Test | Expect |
|------|--------|
| Cliente session → `markCalendarSlotPublished` | **403** `FORBIDDEN`; no UPDATE |
| Operator → approved slot happy path | **200** `{ ok: true, slot.pipelineStatus: "published" }` |
| Non-approved slot | **`NOT_APPROVED`**; no UPDATE |
| No assembly / script | **`SLOT_NOT_READY`** |
| Body with `client_id` | **`FORBIDDEN_FIELDS`** |
| Body with `publish_status: "published"` | **`FORBIDDEN_FIELDS`** |
| Invalid IG URL (`javascript:`, bare host) | **`VALIDATION_ERROR`** + invalidIgUrl messageKey |
| Valid `https://www.instagram.com/reel/abc/` | Stored + returned in DTO |
| Re-mark overwrites date/URL when still approved | Success; fields updated |
| Re-mark after approval revoked | **`NOT_APPROVED`**; row unchanged |
| Random foreign `slotId` | **`NOT_FOUND`** |
| Rate limit exceeded | **`RATE_LIMITED`** |
| Grep sync module | No `publish_status = 'published'` in UPDATE |
| Grep read action | No publish UPDATE |
| Grep mark action | No Graph/integrations imports |

---

## Server-only modules (planned BUILD)

| Module | Purpose |
|--------|---------|
| `lib/calendar/actions/mark-calendar-slot-published.ts` | `"use server"` export |
| `lib/calendar/mark-calendar-slot-published.ts` | Orchestrator / core |
| `lib/calendar/check-calendar-mark-published-rate-limit.ts` | Rate limit check + record |
| `lib/calendar/sync-calendar-slots-for-week.ts` | Extend preserve (no SET on publish cols) |
| `lib/calendar/get-operator-calendar-for-week.ts` | DTO mapper delta for publish fields |
| `lib/contracts/calendar.ts` | Zod + types (**committed in CONTRACT gate**) |
| `supabase/migrations/*_publish_metadata.sql` | ALTER DDL |

---

## Handoffs

| Direction | Artifact | Rule |
|-----------|----------|------|
| From US-12.1 | `slotId`, Sidebar, sync preserve pattern | Mutation keys off `slotId`; extend preserve to new columns |
| From US-11.x | `neuramark_approvals.status = approved` | Write-time re-check — same hard rule as ADR-0002 |
| To US-13.1 | `publish_status = published` + `assembledReelId` + publish metadata | Metrics only on published Reels |
| To ADR-0002 | Manual mark pattern + approved re-check | Graph adapter may set same columns on success |

---

## Non-goals (reaffirmed)

- Instagram Graph API publish (ADR-0002).
- Unpublish / revert `publish_status` to `ready`.
- Separate mark-published page/route.
- Cliente mark-published.
- Metrics tables/UI (US-13.1).
- Overloading `getOperatorCalendarForWeek` with write behavior.
- Approval / QA status mutations from mark action.
- RBAC beyond `requireOperator()`.

---

## Reviewed by FE

**Reviewed by FE:** yes — 2026-08-30 — nextjs-frontend

**Verdict:** Accept — extend existing `OperatorCalendarView` Sidebar + PrimeReact `Dialog` against frozen `markCalendarSlotPublished` / `CalendarSlotDetailDto` types in `lib/contracts/calendar.ts`. Matches US-12.1 week-refresh and approval-mutation patterns (`useTransition` + `router.refresh()`).

### FE signoff notes (non-blocking)

- **Surface:** No new route — Dialog + CTAs live in `components/calendar/OperatorCalendarView.tsx` (optional small child component for form state). Sidebar already holds slot DTO from card click.
- **CTA gating (UX):** Show **Mark published** when `pipelineStatus === 'approved'`; **Update publish details** when `pipelineStatus === 'published'`. Hide for draft / generating / qa / pending / rejected. Operator may mark any active client slot — not limited to `sessionClientId` (deep links remain session-client only per US-12.1).
- **Dialog form:** PrimeReact `Dialog` + `Calendar` date picker (default **Operator-local today** as `YYYY-MM-DD` submit shape) + optional IG URL `InputText`. Pending via `useTransition` on submit; map `VALIDATION_ERROR` field keys and `messageKey` via `CALENDAR_MARK_PUBLISHED_MESSAGE_KEYS` / `calendar.markPublished.*`.
- **Success path:** Close Dialog; **`router.refresh()`** on current `weekStart` satisfies CONTRACT minimum (RSC re-fetches `getOperatorCalendarForWeek`). Optional optimistic merge of returned `slot` into `selectedSlot` / grid state is allowed but not required.
- **Published display:** Sidebar shows formatted `publishedAt` (UTC noon DTO → calendar date via ISO slice or `Intl` UTC, same as `scheduledDate`). IG link icon only when `instagramPostUrl` non-null from DTO; `target="_blank"` + `rel="noopener noreferrer"` — never bind form input to `href`.
- **Cards:** Violet `CalendarStatusTag` already wired; add published check + IG icon affordance on grid cards per DESIGN §10 when `pipelineStatus === 'published'`.
- **i18n:** New `calendar.markPublished.*` EN/ES; extend page copy props from `app/(app)/operator/calendar/page.tsx`.
- **Disputes:** none.

**FE signoff checklist (blocking BUILD):**

- [ ] **Dialog:** PrimeReact form on Sidebar — date default today + optional IG URL.
- [ ] **CTA:** Mark published when `pipelineStatus === 'approved'`; update mode when published.
- [ ] **Action:** `markCalendarSlotPublished` strict body; map error codes to `calendar.markPublished.*`.
- [ ] **Success:** Close Dialog + refresh week via `getOperatorCalendarForWeek`.
- [ ] **Published card:** Violet check + IG icon from DTO `instagramPostUrl` only.
- [ ] **IG link:** `target="_blank"` + `rel="noopener noreferrer"`; never raw form input as `href`.
- [ ] **Types:** Import from `lib/contracts/calendar.ts` only.
- [ ] **i18n:** `calendar.markPublished.*` EN/ES.
