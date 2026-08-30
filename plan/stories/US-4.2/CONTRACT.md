# API Contract — US-4.2 Review and adjust strategy before scripting

**Story:** US-4.2  
**Status:** Frozen — 2026-08-30 (awaiting FE signoff)  
**Security:** `plan/stories/US-4.2/SECURITY.md` (APPROVE WITH CONDITIONS — binding freeze; do not reopen)  
**Spec review:** `plan/stories/US-4.2/SPEC-REVIEW.md` (GAPS — resolved by this contract)  
**Depends on:** US-4.1 ✅ `neuramark_content_strategies` · `contentStrategyBriefSchema` · `validateBriefAgainstAllowlists()` · `/operator/strategy` · US-14.5 ✅ `requireOperator()`  
**Identity seam:** `lib/auth/get-current-user.ts` / `requireOperator()` (unchanged)  
**Error envelope style:** same class as US-4.1 (`ok: true` vs `{ ok: false, error: { code, fields?, messageKey? } }`)

**This document is CONTRACT ONLY.** Zod below is the BUILD sketch for `lib/contracts/content-strategy.ts`, server modules under `lib/content-strategy/`, and tests extending `lib/content-strategy/content-strategy.test.ts`.

**Terminology:** **Estrategia semanal** (ES) / **Weekly content strategy** (EN product chrome) · **brief** (technical jsonb) · **Formato de Reel** · **Modalidad de producción** · **Táctica de tendencia** · **Operator** · **Approve strategy** (product CTA). Technical enums (`draft`, `approved`, `formatoPlaybookSlug`) OK in code/DB.

**SPEC-REVIEW blocking gaps closed in this contract:**

| # | Gap | Resolution |
|---|-----|------------|
| 1 | SPEC auto-avance vs mandatory Operator approval | **Dual-path gate frozen:** (A) **Operator/manual script path (US-5.1 batch)** — explicit **`approveContentStrategy`** required before script generation; (B) **System/cron path (ADR-0001)** — auto-approve **deferred to integrations-engineer**; US-4.2 ships **Operator approve action only**; no cron auto-approve in this story |
| 2 | Edit persistence vs US-4.1 INSERT-only regenerate | **Save edits** = `UPDATE brief` (+ `updated_at`) on **existing `draft` row only** (same `version`); **Approve** = `UPDATE status` + `approved_by` / `approved_at` on same row; **Regenerate** (US-4.1) remains **INSERT** new `draft` version — never UPDATE `approved` rows |
| 3 | Editable field allowlist | **V1 editable:** `brief.themes[]`, `brief.slots[].angle`, `brief.slots[].ctaHint` only. All other brief fields **read-only** in FE; server enforces via **strict partial input schema + merge** into stored brief (no untrusted deep-merge). Full merged brief validated with `contentStrategyBriefSchema` + `validateBriefAgainstAllowlists()` |
| 4 | Approval metadata columns | Migration adds nullable `approved_by`, `approved_at`; set only on **`approveContentStrategy`** success |
| 5 | Draft vs approved read helpers | **`getLatestDraftStrategy`** for edit eligibility; **`getApprovedStrategyForWeek`** for US-5.1 gate; **`getLatestContentStrategy`** extended with approval metadata |
| 6 | Cliente read-only brief (SPEC §3) | **Explicit deferral** to follow-on **US-4.3** — out of scope US-4.2; Operator edit/approve only |

---

## Overview

An authenticated **Operator** reviews the latest **Estrategia semanal** on `/operator/strategy`, edits human-judgment fields on the **current `draft` row**, saves in place, then **Approves strategy** to transition **`draft` → `approved`** with audit metadata. Edits and approval are **Operator-only** Server Actions gated by `requireOperator("handler")`.

**US-4.2 does not:**

- INSERT a new version on manual save (regenerate remains US-4.1 INSERT).
- Edit or un-approve **`approved`** rows.
- Implement system/cron auto-approve (integrations-engineer / ADR-0001 consumer).
- Expose Cliente read-only brief UI (deferred **US-4.3**).
- Create `neuramark_reel_scripts` or script agent jobs (US-5.1).

**Surfaces**

| # | Surface | Kind | New vs reused |
|---|---------|------|---------------|
| 1 | `/operator/strategy` | RSC Operator page | **Extended** — inline edit + approve CTAs |
| 2 | `updateContentStrategyBrief` | Server Action | **New** — save draft edits (UPDATE) |
| 3 | `approveContentStrategy` | Server Action | **New** — `draft` → `approved` |
| 4 | `getLatestContentStrategy` | Server Action | **Extended** — approval metadata + edit flags |
| 5 | `getLatestDraftStrategy` | Server-only helper | **New** — highest-version `draft` row |
| 6 | `getApprovedStrategyForWeek` | Server-only helper | **New** — US-5.1 approved-row lookup |
| 7 | `loadStrategyRowForOperator` | Server-only helper | **New** — IDOR-safe row load |
| 8 | `mergeEditableBriefFields` | Server-only pure fn | **New** — apply editable patch to stored brief |
| 9 | `strategyHasScripts` | Server-only helper | **New** — stub `false` until US-5.1 table |
| 10 | Zod extensions | `lib/contracts/content-strategy.ts` | **Extended** |
| 11 | Migration | `approved_by`, `approved_at` | **New** |

**Forbidden surfaces (BUILD veto):**

- Public Route Handler (`PATCH /api/content-strategies/*`).
- Combined edit+approve action with client-supplied `status` or boolean flag.
- System/cron auto-approve Server Action or Route Handler in US-4.2.
- Cliente read route or action.
- Client Component Supabase access.
- UPDATE on `approved` rows; DELETE of strategy history.

**Why Server Actions (not Route Handlers):** UI-coupled Operator save/approve on existing `/operator/strategy` page; same CSRF model as US-4.1.

**Frontend consumers**

| Consumer | Route | Contract surface |
|----------|-------|------------------|
| Strategy page | `app/(app)/operator/strategy/page.tsx` | Extended load: `getLatestContentStrategy({ weekStart })` with approval metadata |
| Editable brief (draft only) | Strategy page Client island | `themes[]`, per-slot `angle`, `ctaHint` inputs |
| Save changes | Strategy page | `updateContentStrategyBrief({ strategyId, weekStart, editable })` |
| Approve strategy | Strategy page | `approveContentStrategy({ strategyId, weekStart })` — disabled while form dirty (PO lean) |
| Status badge + approval caption | Strategy page | From extended read DTO when `status = 'approved'` |
| Generate / Regenerate | Unchanged US-4.1 | `generateContentStrategy({ weekStart })` — still INSERT-only |

**Server-only modules (planned BUILD)**

| Module | Purpose |
|--------|---------|
| `lib/content-strategy/actions/update-content-strategy-brief.ts` | `"use server"` save draft edits |
| `lib/content-strategy/actions/approve-content-strategy.ts` | `"use server"` approve transition |
| `lib/content-strategy/load-strategy-row-for-operator.ts` | IDOR-safe SELECT by `(strategyId, clientId)` |
| `lib/content-strategy/load-latest-draft-strategy-row.ts` | Highest-version `draft` for `(clientId, weekStart)` |
| `lib/content-strategy/load-approved-strategy-for-week.ts` | Highest-version `approved` for US-5.1 |
| `lib/content-strategy/merge-editable-brief-fields.ts` | Pure merge editable patch → full brief |
| `lib/content-strategy/strategy-has-scripts.ts` | Lock helper — stub until US-5.1 |
| `lib/content-strategy/update-strategy-brief.ts` | Parameterized UPDATE `brief` on draft row |
| `lib/content-strategy/approve-strategy-row.ts` | Parameterized UPDATE status + audit columns |

---

## Frozen decisions (from SECURITY.md + SPEC-REVIEW + PO TASKS)

Do not reopen.

| # | Topic | Freeze |
|---|-------|--------|
| 1 | **Operator route** | Extend **`/operator/strategy`** only — no new top-level route in V1 |
| 2 | **Tenancy (V1)** | `clientId` = **`getCurrentUser().id`** after `requireOperator()`. Mutations include **`strategyId` + `weekStart`** for IDOR defense; `weekStart` must match loaded row |
| 3 | **Dual approval path** | **(A) Operator/manual (US-5.1 batch):** script generation requires row `status = 'approved'` set via **`approveContentStrategy`**. **(B) System/cron (ADR-0001):** auto-approve or draft-bypass **not implemented in US-4.2** — owned by **integrations-engineer** in a future story; US-4.2 documents hook only |
| 4 | **Edit persistence** | **`UPDATE`** `brief` + `updated_at` on existing row by `strategyId` when `status = 'draft'` — **same `version`**, no INSERT |
| 5 | **Regenerate** | Unchanged US-4.1 — **INSERT** new row `version = max + 1`, `status = draft` |
| 6 | **Editable fields (V1)** | **`themes[]`**, **`slots[].angle`**, **`slots[].ctaHint`** only. Read-only: `pillars[]`, `slots[].tema`, `formatoPlaybookSlug`, `modalidad`, `tacticaTendenciaSlug`, `goal`, `dayOfWeek`, `slotIndex` |
| 7 | **Edit input shape** | **Partial editable patch** — not full brief from client. Server merges into stored brief; validates **full merged** brief post-merge |
| 8 | **Save validation** | `contentStrategyBriefSchema.strict()` + `validateBriefAgainstAllowlists()` — identical stack to US-4.1 generate persist |
| 9 | **Approve transition** | **`draft` → `approved` only** via dedicated **`approveContentStrategy`**; sets `approved_by`, `approved_at` atomically; client cannot pass `status` |
| 10 | **Approved immutability** | No brief UPDATE on `approved` rows; no `approved` → `draft` rollback in V1 |
| 11 | **Approve without save** | Approve uses **last persisted brief only**; FE **disables Approve while dirty** (PO lean — no save-then-approve combo action) |
| 12 | **Multiple approved versions** | Allowed (history preserved). US-5.1 uses **`getApprovedStrategyForWeek`** → highest `version` with `status = 'approved'` |
| 13 | **Latest read** | `getLatestContentStrategy` returns highest `version` row **regardless of status** (carry-forward US-4.1) |
| 14 | **Edit eligibility** | UI edit/approve enabled when returned row `status = 'draft'` and `!strategyHasScripts(strategyId)` |
| 15 | **Lock-after-scripts** | **`strategyHasScripts()`** stub returns **`false`** until `neuramark_reel_scripts` exists (US-5.1). When table exists + `NEURAMARK_STRATEGY_LOCK_AFTER_SCRIPTS !== 'false'` (default locked), brief UPDATE → **`STRATEGY_LOCKED`**. Enforcement wiring completes with US-5.1 migration |
| 16 | **Rate limit** | No new rate limit on save/approve (generate rate limit unchanged) |
| 17 | **Logging** | `strategyId`, `clientId`, action (`update` \| `approve`), error **codes** only — never full brief bodies |
| 18 | **Cliente read** | **Deferred US-4.3** — SPEC §3 Cliente visibility tracked in follow-on; not in US-4.2 BUILD |
| 19 | **revalidatePath** | `revalidatePath("/operator/strategy")` after successful save and approve |

### Strip vs reject (mutation bodies)

Extends US-4.1 forbidden keys for edit/approve actions:

| Keys | Behavior |
|------|----------|
| `strategyId`, `weekStart`, `editable` | **Accept** on update (see schemas) |
| `strategyId`, `weekStart` | **Accept** on approve |
| `status`, `approved`, `approved_by`, `approved_at`, `approvedBy`, `approvedAt` | **Reject** → `FORBIDDEN_FIELDS` |
| `clientId`, `client_id`, `version`, `brief` (top-level on update — use `editable`) | **Reject** → `FORBIDDEN_FIELDS` |
| `providerKey`, `provider_key`, `tier`, `envKeyName`, `model`, `role`, `auth_user_id` | **Reject** → `FORBIDDEN_FIELDS` |
| Unknown keys | **Reject** → `VALIDATION_ERROR` (`.strict()`) |

---

## Dual-path approval gate (SPEC auto-avance reconciliation)

| Path | Caller | Approval requirement | US-4.2 scope |
|------|--------|---------------------|--------------|
| **A — Operator manual** | Operator on `/operator/strategy` → US-5.1 batch script generation | **`approveContentStrategy`** must run before US-5.1 accepts strategy for batch | **Implemented** — `approveContentStrategy` Server Action |
| **B — System/cron** | ADR-0001 weekly cycle orchestration (integrations-engineer) | SPEC §3 auto-avance: valid strategy may continue without Operator approve | **Deferred** — integrations-engineer may add `autoApproveContentStrategyForWeek({ clientId, weekStart })` or equivalent internal helper; **not in US-4.2 BUILD** |

**US-5.1 obligation (downstream):** Operator-initiated script batch verifies `status = 'approved'` via `getApprovedStrategyForWeek` or explicit `strategyId` + server re-check. System-initiated path documents separate gate in US-5.1 / integrations CONTRACT.

---

## Editable allowlist (frozen)

### Operator-editable (V1)

| Field | Type | Notes |
|-------|------|-------|
| `brief.themes[]` | `string[]` | Add/remove/edit within schema bounds (1–8 items, max 200 chars each) |
| `brief.slots[].angle` | `string?` | Per slot, matched by `slotIndex` |
| `brief.slots[].ctaHint` | `string?` | Per slot, matched by `slotIndex` |

### Read-only (V1 — server rejects changes)

| Field | Enforcement |
|-------|-------------|
| `brief.pillars[]` | Preserved from stored brief on merge — not in editable schema |
| `brief.slots[].tema` | Preserved from stored brief |
| `brief.slots[].formatoPlaybookSlug` | Preserved — regenerate for structural change |
| `brief.slots[].modalidad` | Preserved — regenerate for allowlist change |
| `brief.slots[].tacticaTendenciaSlug` | Preserved |
| `brief.slots[].goal` | Preserved |
| `brief.slots[].dayOfWeek` | Preserved |
| `brief.slots[].slotIndex` | Immutable identity — editable patch references by index only |

**Merge algorithm (frozen):**

1. Load stored `brief` from draft row.
2. Parse `editable` with `contentStrategyBriefEditableSchema.strict()`.
3. Replace `themes` with `editable.themes`.
4. For each `editable.slots[]` entry, find stored slot by `slotIndex`; update `angle` and/or `ctaHint` only (omit key = leave unchanged; explicit `null` clears optional field if schema allows — BUILD: use `undefined` omit vs empty string per Zod optional rules).
5. Run `contentStrategyBriefSchema.strict().parse(merged)`.
6. Run `validateBriefAgainstAllowlists(merged, ctx)`.
7. `UPDATE` full merged `brief` jsonb.

If client attempts to smuggle locked fields via forbidden top-level `brief` key → `FORBIDDEN_FIELDS`.

---

## Shared schemas (BUILD: extend `lib/contracts/content-strategy.ts`)

### Editable patch input

```ts
export const contentStrategySlotEditableSchema = z
  .object({
    slotIndex: z.number().int().min(0).max(6),
    angle: z.string().trim().min(1).max(300).optional(),
    ctaHint: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const contentStrategyBriefEditableSchema = z
  .object({
    themes: z.array(z.string().trim().min(1).max(200)).min(1).max(8),
    slots: z.array(contentStrategySlotEditableSchema).min(1).max(7),
  })
  .strict()
  .superRefine((editable, ctx) => {
    const indices = editable.slots.map((s) => s.slotIndex);
    if (new Set(indices).size !== indices.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Duplicate slotIndex in editable patch",
        path: ["slots"],
      });
    }
  });

export const updateContentStrategyBriefInputSchema = z
  .object({
    strategyId: z.string().uuid(),
    weekStart: trendWeekStartSchema,
    editable: contentStrategyBriefEditableSchema,
  })
  .strict();
```

### Approve input

```ts
export const approveContentStrategyInputSchema = z
  .object({
    strategyId: z.string().uuid(),
    weekStart: trendWeekStartSchema,
  })
  .strict();
```

### Extended strategy view (read)

```ts
export const contentStrategyApproverSchema = z
  .object({
    id: z.string().uuid(),
    displayName: z.string().min(1).max(120),
  })
  .strict();

export const contentStrategyViewSchema = contentStrategyDraftViewSchema
  .extend({
    approvedBy: contentStrategyApproverSchema.optional(),
    approvedAt: z.string().datetime({ offset: true }).optional(),
    /** True when Operator may edit: status draft and not script-locked */
    isEditable: z.boolean(),
  })
  .strict();
```

When `status = 'approved'`, `approvedBy` and `approvedAt` **must** be present in DTO (loaded from DB columns + display name lookup).

### Mutation success envelopes

```ts
export const updateContentStrategyBriefSuccessSchema = z
  .object({
    ok: z.literal(true),
    strategyId: z.string().uuid(),
    weekStart: trendWeekStartSchema,
    version: z.number().int().positive(),
    status: z.literal("draft"),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const approveContentStrategySuccessSchema = z
  .object({
    ok: z.literal(true),
    strategyId: z.string().uuid(),
    weekStart: trendWeekStartSchema,
    version: z.number().int().positive(),
    status: z.literal("approved"),
    approvedBy: contentStrategyApproverSchema,
    approvedAt: z.string().datetime({ offset: true }),
  })
  .strict();
```

### Extended error codes

Add to `contentStrategyErrorCodeSchema`:

```ts
"STRATEGY_NOT_DRAFT",
"INVALID_STATE_TRANSITION",
"STRATEGY_LOCKED",
```

(`NOT_FOUND` reused for wrong tenancy / missing row — distinct `messageKey` when strategy exists but wrong client.)

---

## Server Action — `updateContentStrategyBrief` (**new**)

**File (BUILD):** `lib/content-strategy/actions/update-content-strategy-brief.ts` (`"use server"`)  
**Consumer:** Operator Strategy page — **Save changes** button (draft only).

**Gate:** `await requireOperator("handler")` — **first** await. Failure → 401/403, **no UPDATE**.

**Input:** `updateContentStrategyBriefInputSchema`

**Tenancy resolution (frozen):**

```ts
const operator = await requireOperator("handler");
const clientId = operator.id;
```

**Flow:**

1. `requireOperator("handler")`
2. Reject forbidden keys on raw input
3. Parse input
4. `loadStrategyRowForOperator({ strategyId, clientId })` — null → `NOT_FOUND`
5. Verify `row.weekStart === input.weekStart` — mismatch → `NOT_FOUND`
6. If `row.status !== 'draft'` → **`STRATEGY_NOT_DRAFT`**
7. If `await strategyHasScripts(strategyId)` && lock enabled → **`STRATEGY_LOCKED`**
8. `merged = mergeEditableBriefFields(row.brief, editable)`
9. Validate allowlist context for `row.weekStart`; Zod + `validateBriefAgainstAllowlists(merged)`
10. `UPDATE neuramark_content_strategies SET brief = $merged, updated_at = now() WHERE id = $strategyId AND client_id = $clientId AND status = 'draft'` — 0 rows → **`STRATEGY_NOT_DRAFT`** (race)
11. `revalidatePath("/operator/strategy")`
12. Return success envelope

**Success:** `updateContentStrategyBriefSuccessSchema`

---

## Server Action — `approveContentStrategy` (**new**)

**File (BUILD):** `lib/content-strategy/actions/approve-content-strategy.ts` (`"use server"`)  
**Consumer:** Operator Strategy page — **Approve strategy** CTA (draft only; disabled while dirty).

**Gate:** `await requireOperator("handler")` — **first** await.

**Input:** `approveContentStrategyInputSchema` — **no `status`**, no audit fields.

**Flow:**

1. `requireOperator("handler")`
2. Reject forbidden keys
3. Parse input
4. `loadStrategyRowForOperator({ strategyId, clientId })` — null → `NOT_FOUND`
5. Verify `row.weekStart === input.weekStart`
6. If `row.status !== 'draft'` → **`STRATEGY_NOT_DRAFT`** or **`INVALID_STATE_TRANSITION`**
7. If `await strategyHasScripts(strategyId)` → **`STRATEGY_LOCKED`** (edge guard)
8. Re-validate stored `row.brief` with Zod + allowlists (defense-in-depth — no persist change if invalid)
9. `UPDATE neuramark_content_strategies SET status = 'approved', approved_by = $operator.id, approved_at = now(), updated_at = now() WHERE id = $strategyId AND client_id = $clientId AND status = 'draft'` — 0 rows → **`INVALID_STATE_TRANSITION`**
10. `revalidatePath("/operator/strategy")`
11. Return success with `approvedBy: { id, displayName: operator.displayName }`, `approvedAt`

**Success:** `approveContentStrategySuccessSchema`

**Does not:** accept client `status`; modify `brief`; INSERT new version.

---

## Extended Server Action — `getLatestContentStrategy`

**Changes:** Return `contentStrategyViewSchema` instead of bare `contentStrategyDraftViewSchema`.

**Additional server work when row found:**

1. Map `approved_by` → `{ id, displayName }` via operator/client lookup (hardcoded local user OK in dev).
2. Set `approvedAt` from column when `status = 'approved'`.
3. Compute `isEditable = (status === 'draft') && !(await strategyHasScripts(id))`.

**Empty week:** unchanged `{ ok: true, strategy: null }`.

---

## Server-only helpers

### `loadStrategyRowForOperator`

```ts
export async function loadStrategyRowForOperator(params: {
  strategyId: string;
  clientId: string;
}): Promise<ContentStrategyRow | null>;
```

`SELECT ... WHERE id = $strategyId AND client_id = $clientId` — null → uniform `NOT_FOUND`.

### `getLatestDraftStrategy`

```ts
export async function getLatestDraftStrategy(params: {
  clientId: string;
  weekStart: string;
}): Promise<ContentStrategyDraftView | null>;
```

`WHERE client_id = $clientId AND week_start = $weekStart AND status = 'draft' ORDER BY version DESC LIMIT 1`

**Use:** edit-target validation; optional FE helper if latest row is `approved` but older draft exists (V1 UI shows latest row only — if latest is `approved`, edit disabled; regenerate creates new draft).

### `getApprovedStrategyForWeek`

```ts
export async function getApprovedStrategyForWeek(params: {
  clientId: string;
  weekStart: string;
}): Promise<ContentStrategyDraftView | null>;
```

`WHERE client_id = $clientId AND week_start = $weekStart AND status = 'approved' ORDER BY version DESC LIMIT 1`

**Consumer:** US-5.1 script batch gate (server-only import — not a public Server Action in US-4.2).

### `strategyHasScripts` (stub until US-5.1)

```ts
export async function strategyHasScripts(
  strategyId: string,
): Promise<boolean>;
```

| Phase | Behavior |
|-------|----------|
| **US-4.2 BUILD** | Always returns **`false`** (table absent). Unit tests mock future behavior. |
| **US-5.1+** | `EXISTS (SELECT 1 FROM neuramark_reel_scripts WHERE strategy_id = $1)` when table exists |

**Config:** `process.env.NEURAMARK_STRATEGY_LOCK_AFTER_SCRIPTS !== 'false'` → default **locked**.

### `mergeEditableBriefFields`

Pure function — unit-tested without DB:

```ts
export function mergeEditableBriefFields(
  stored: ContentStrategyBrief,
  editable: ContentStrategyBriefEditable,
): ContentStrategyBrief;
```

---

## Database

### Migration file name (frozen)

**`supabase/migrations/20260830200000_neuramark_content_strategies_approval.sql`**

```sql
ALTER TABLE public.neuramark_content_strategies
  ADD COLUMN approved_by uuid NULL
    REFERENCES public.neuramark_clients(id) ON DELETE RESTRICT,
  ADD COLUMN approved_at timestamptz NULL;

COMMENT ON COLUMN public.neuramark_content_strategies.approved_by IS
  'Operator neuramark_clients.id who approved; set only on draft→approved transition (US-4.2).';

COMMENT ON COLUMN public.neuramark_content_strategies.approved_at IS
  'Server timestamp of approval; set only on draft→approved transition (US-4.2).';
```

| Column | Type | Notes |
|--------|------|-------|
| `approved_by` | uuid NULL FK → `neuramark_clients(id)` ON DELETE **RESTRICT** | Set on approve only; null while `draft` |
| `approved_at` | timestamptz NULL | Set on approve only |

**Integrity:** App-layer enforcement (US-4.2): when `status = 'approved'`, both columns non-null. Optional DB CHECK deferred — tests assert invariant.

**Unchanged:** UNIQUE `(client_id, week_start, version)`; INSERT-only regenerate; RLS deny-by-default.

---

## Standard error envelope (extended)

| Code | HTTP lean | `messageKey` | When |
|------|-----------|--------------|------|
| `STRATEGY_NOT_DRAFT` | 409 | `strategy.errors.notDraft` | UPDATE brief or approve when row not `draft` |
| `INVALID_STATE_TRANSITION` | 409 | `strategy.errors.invalidTransition` | Approve race / double-approve; forbidden status write |
| `STRATEGY_LOCKED` | 409 | `strategy.errors.locked` | Brief UPDATE or approve when `strategyHasScripts` true (post-US-5.1) |
| `NOT_FOUND` | 404 | `strategy.errors.notFound` | Unknown `strategyId` or tenancy/`weekStart` mismatch |
| *(unchanged US-4.1 codes)* | | | `FORBIDDEN`, `FORBIDDEN_FIELDS`, `VALIDATION_ERROR`, `AGENT_OUTPUT_INVALID`, etc. |

---

## State transitions

### `neuramark_content_strategies.status`

| From | To | Action | Owner |
|------|-----|--------|-------|
| `draft` | `draft` | `updateContentStrategyBrief` (brief UPDATE, same version) | US-4.2 |
| `draft` | `approved` | `approveContentStrategy` (+ `approved_by`, `approved_at`) | US-4.2 |
| — | `draft` | US-4.1 `generateContentStrategy` INSERT | US-4.1 |
| `approved` | * | **Forbidden** — immutable | US-4.2 |
| `approved` | `draft` | **Forbidden** — no rollback V1 | — |
| * | * (client POST) | **Forbidden** — no client `status` | US-4.2 |

**Regenerate after approve:** US-4.1 INSERT new `draft` row at `version + 1`; prior `approved` row unchanged.

---

## Fixtures (BUILD / FE mocks / tests)

### `updateContentStrategyBrief` — happy

**Request:**

```json
{
  "strategyId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "weekStart": "2026-01-05",
  "editable": {
    "themes": ["Invierno: mantenimiento preventivo", "Confianza antes del frío"],
    "slots": [
      { "slotIndex": 0, "angle": "Enfoque en ahorro energético" },
      { "slotIndex": 2, "ctaHint": "Escríbenos por DM hoy" }
    ]
  }
}
```

**Response:**

```json
{
  "ok": true,
  "strategyId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "weekStart": "2026-01-05",
  "version": 2,
  "status": "draft",
  "updatedAt": "2026-08-30T20:15:00.000Z"
}
```

### `approveContentStrategy` — happy

**Request:**

```json
{
  "strategyId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "weekStart": "2026-01-05"
}
```

**Response:**

```json
{
  "ok": true,
  "strategyId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "weekStart": "2026-01-05",
  "version": 2,
  "status": "approved",
  "approvedBy": {
    "id": "22222222-2222-4222-8222-222222222222",
    "displayName": "Gabriel Vega"
  },
  "approvedAt": "2026-08-30T20:20:00.000Z"
}
```

### `getLatestContentStrategy` — approved with metadata

```json
{
  "ok": true,
  "strategy": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "clientId": "22222222-2222-4222-8222-222222222222",
    "weekStart": "2026-01-05",
    "version": 2,
    "status": "approved",
    "brief": { "...": "..." },
    "createdAt": "2026-08-30T18:00:00.000Z",
    "updatedAt": "2026-08-30T20:20:00.000Z",
    "approvedBy": {
      "id": "22222222-2222-4222-8222-222222222222",
      "displayName": "Gabriel Vega"
    },
    "approvedAt": "2026-08-30T20:20:00.000Z",
    "isEditable": false
  },
  "playbookLabels": { "tip-rapido": "Tip rápido" }
}
```

### Save on approved row — error

```json
{
  "ok": false,
  "error": {
    "code": "STRATEGY_NOT_DRAFT",
    "messageKey": "strategy.errors.notDraft"
  }
}
```

### Smuggled status on approve body — error

```json
{
  "ok": false,
  "error": {
    "code": "FORBIDDEN_FIELDS",
    "messageKey": "strategy.errors.forbiddenFields"
  }
}
```

---

## Unit test matrix (frozen — extends US-4.1)

| # | Area | Test | Expected |
|---|------|------|----------|
| 1 | Editable schema | Valid patch with themes + slot angles | pass parse |
| 2 | Editable schema | Rejects `tema` in editable slot | `VALIDATION_ERROR` |
| 3 | Editable schema | Rejects duplicate `slotIndex` in patch | fail parse |
| 4 | Merge | Updates themes only | pillars/slots locked fields unchanged |
| 5 | Merge | Updates angle for slotIndex 1 | other slots unchanged |
| 6 | Merge | Unknown slotIndex in patch | `VALIDATION_ERROR` or merge error |
| 7 | Update action | Non-operator | 403, no UPDATE |
| 8 | Update action | Smuggled `status` | `FORBIDDEN_FIELDS` |
| 9 | Update action | Smuggled top-level `brief` | `FORBIDDEN_FIELDS` |
| 10 | Update action | Foreign `strategyId` | `NOT_FOUND` |
| 11 | Update action | `weekStart` mismatch | `NOT_FOUND` |
| 12 | Update action | Happy path on draft | UPDATE same `version`, `status` stays `draft` |
| 13 | Update action | Save on `approved` row | `STRATEGY_NOT_DRAFT`, no UPDATE |
| 14 | Update action | Allowlist violation in merged brief | `AGENT_OUTPUT_INVALID`, no UPDATE |
| 15 | Update action | `strategyHasScripts` mock true + lock on | `STRATEGY_LOCKED` |
| 16 | Approve action | Non-operator | 403, no UPDATE |
| 17 | Approve action | Smuggled `approved_by` | `FORBIDDEN_FIELDS` |
| 18 | Approve action | Happy path on draft | `status=approved`, `approved_by` from session, `approved_at` set |
| 19 | Approve action | Double approve | `INVALID_STATE_TRANSITION` |
| 20 | Approve action | Approve on already `approved` | `STRATEGY_NOT_DRAFT` or `INVALID_STATE_TRANSITION` |
| 21 | Approve action | Invalid stored brief (corrupt jsonb) | `AGENT_OUTPUT_INVALID`, no status change |
| 22 | Read | Extended DTO includes `isEditable: true` on draft | pass |
| 23 | Read | Approved row includes `approvedBy`, `approvedAt`, `isEditable: false` | pass |
| 24 | Helper | `getLatestDraftStrategy` returns highest draft version | not approved row |
| 25 | Helper | `getApprovedStrategyForWeek` after v1 approved + v2 draft | returns v1 approved |
| 26 | Helper | `getApprovedStrategyForWeek` no approved row | null |
| 27 | Helper | `strategyHasScripts` stub | returns false |
| 28 | Helper | `loadStrategyRowForOperator` cross-tenant | null → NOT_FOUND |
| 29 | State | Regenerate after approve (US-4.1) | new draft v3; v2 approved unchanged |
| 30 | Security | No full brief in prod logs on update | logger mock assert |
| 31 | Migration | `approved_by` FK RESTRICT | migration assert |
| 32 | Contract | New error codes in enum | static assert |

---

## Acceptance criteria mapping

| USER_STORIES / SPEC obligation | CONTRACT surface |
|-------------------------------|------------------|
| Edits saved and used as Script agent input | `updateContentStrategyBrief` UPDATE on draft; US-5.1 reads approved row brief |
| Approved strategy required before batch script generation (Operator path) | `approveContentStrategy`; `getApprovedStrategyForWeek` |
| Shows who approved and when | Extended read DTO + approve success envelope |
| Operator-only mutations | `requireOperator("handler")` on both actions |
| [SEC] Server-side state machine | Dedicated approve action; forbidden client `status` |
| SPEC auto-avance (system path) | Documented deferral — integrations-engineer |
| Cliente read (SPEC §3) | Deferred **US-4.3** |
| Lock after scripts | `strategyHasScripts` stub; full enforcement US-5.1+ |

---

## Out of scope (explicit)

| Item | Story |
|------|-------|
| System/cron auto-approve | integrations-engineer / ADR-0001 |
| Cliente read-only Estrategia semanal | **US-4.3** (follow-on) |
| `neuramark_reel_scripts` table | US-5.1 |
| Video Script agent jobs | US-5.1 |
| Edit pillars, tema, formato, modalidad, tactica, goal, day | Future story or regenerate |
| Strategy history list UI | P2 follow-on |
| `approved` → `draft` rollback | Out of V1 |
| Un-approve / DELETE strategy rows | Out of V1 |
| New rate limits on save/approve | Out of V1 |
| LLM regenerate on edit | US-4.1 generate only |

---

## FE signoff checklist

- [x] Extend `/operator/strategy` — no new route
- [x] `updateContentStrategyBrief({ strategyId, weekStart, editable })` — partial patch, not full brief
- [x] `approveContentStrategy({ strategyId, weekStart })` — separate CTA; disabled while dirty
- [x] Extended `getLatestContentStrategy` — status badge, approval caption, `isEditable`
- [x] Editable: themes, angle, ctaHint per slot only; rest read-only
- [x] Error codes + `messageKey` in EN/ES
- [x] No Cliente route; no Supabase in Client Components

**Reviewed by FE:** 2026-08-30 — inline edit on `/operator/strategy`; partial `editable` patch; approve disabled while dirty; `ContentStrategyView` + status/approval caption.
