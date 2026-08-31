# API Contract — US-7.3 Track actual cost per generation job

**Story:** US-7.3  
**Status:** Phase A Frozen — 2026-08-29 (FE signoff complete) · **Phase B frozen** / BUILD unblocked — 2026-08-31  
**Sprint (Phase B):** `US-7.3-B`  
**Security:** `plan/stories/US-7.3/SECURITY.md` (Phase A APPROVE WITH CONDITIONS — in force) · Phase B **12 binding conditions reconciled** in § Phase B  
**Spec review:** `plan/stories/US-7.3/SPEC-REVIEW.md` (Phase A GAPS — resolved by Phase A) · Phase B **ALIGNED** (3 High — encoded below)  
**Phase B prep:** `plan/stories/US-7.3/PHASE-B.md` (PO B1–B18)  
**Depends on:** US-7.1 ✅ spend ledger + gate · US-7.2 ✅ provider engine + adapter `actualCostCents` · US-5.1 ✅ `/operator/scripts` · US-6.1 ✅ caption orchestrators · US-14.5 ✅ `requireOperator()` · US-8.4 ✅ poller + Operator video panel · US-8.2/8.6/8.7/8.5/8.3 ✅ video writers · US-9.3 ✅ TTS · US-7.4 Phase A ✅ roll-up consumer (do not reopen)  
**Identity seam:** `lib/auth/get-current-user.ts` / `requireOperator()` (unchanged)  
**Feature branch (Phase A):** `feature/US-7.3-actual-cost` (historical)  
**Feature branch (Phase B):** `feature/US-7.3-phase-b-spend-backfill`  
**Error envelope style:** same class as US-5.1 / US-7.1 (`ok: true` vs `{ ok: false, error: { code, fields?, messageKey? } }`)

**This document is CONTRACT ONLY.** Zod below is the BUILD sketch for `lib/contracts/actual-cost.ts`, extensions to `lib/contracts/cost-policy.ts` and `lib/contracts/reel-script.ts`, new modules under `lib/cost-policy/`, migration, and orchestrator wiring.

**Terminology:** **Costo estimado** · **Costo real** · **Job de generación** · **Operator** · **Reel** · **Paquete de guion**. Technical enums (`finalizeGenerationCost`, `actualCostUnavailableReason`) OK in code/DB. Do **not** use CONTEXT _Evitar_ terms in product-facing strings.

**SPEC-REVIEW blocking gaps closed in this contract:**

| # | Gap | Resolution |
|---|-----|------------|
| 1 | Dual canonical store (`video_jobs` vs spend ledger) | **`neuramark_reel_spend_events`** is the **single reporting ledger** for all asset roles. **`neuramark_video_jobs`** may mirror costs in Phase B (US-8.2+) but **never** the sole store for LLM/TTS actuals. |
| 2 | LLM actual-cost write path undefined | **`finalizeGenerationCost({ mode: "sync_insert", … })`** — after successful LLM `complete()`, orchestrator calls central module → **`computeLlmActualCost`** → **`recordReelSpendEvent`** (single INSERT with estimate + actual). |
| 3 | Job-completion handler ownership unset | **`finalizeGenerationCost`** (`import "server-only"`) is the **sole writer** of `actual_cost_cents`. Async video/TTS (Phase B) call **`finalizeGenerationCost({ mode: "async_update", … })`** → **`updateReelSpendEventActual`**. **Forbidden:** any Server Action / Route Handler accepting `actualCostCents` from request body. |
| 4 | BUILD blocked on US-8.4 / `video_jobs` | **Phased acceptance** — **Phase A (BUILD):** LLM sync backfill + Operator weekly/slot cost on `/operator/scripts`. **Phase B:** video/TTS + **`OperatorProductionJobCostDto`** on US-8.4 production list when US-8.4 + US-9.3 land. |
| 5 | Failure reason schema undefined | Nullable **`actual_cost_unavailable_reason`** on spend events — closed enum (see DDL). |
| 6 | Duration persistence unspecified | Nullable **`duration_sec`** on **`neuramark_reel_spend_events`**; populated on complete when adapter provides it; LLM jobs omit (null). |
| 7 | Weekly per-client aggregate undefined | **`getReelCostSummaryForWeek`** — Operator-only; week boundary = **`weekStart`** (`trendWeekStartSchema`, Monday-aligned Estrategia semanal); attached to **`getReelScriptsForWeek`** success payload (one round-trip). |
| 8 | Production list FE surface not frozen | Phase A: cost column on **`/operator/scripts`** via **`ReelSlotCostSummary`**. Phase B: **`OperatorProductionJobCostDto`** on US-8.4 `/operator/production`. |
| 9 | TTS path missing from Depends | **US-9.3** soft dependency for Phase B; same **`finalizeGenerationCost`** sync path with `asset_role: "tts"`. |
| 10 | Operator-only enforcement | All cost reads via **`requireOperator()`**; extend **`FORBIDDEN_BUDGET_SPEND_KEYS`**; shared Cliente serializers **omit** cost fields. |
| 11 | Manual upload actual = 0 | Phase B: **`actual_cost_cents = 0`**, `provider_key = manual`, `costStatus = actual`. |
| 12 | Gate must not switch to actuals | **Non-goal:** **`assertReelBudgetAllowsSpend`** unchanged — **`SUM(estimated_cost_cents)`** only. Actuals are **reporting-only** in US-7.3. |

**SECURITY reconciliation (binding):**

| Topic | SECURITY condition | **Frozen in this contract** |
|-------|-------------------|----------------------------|
| Central module | `import "server-only"` sole writer | **`lib/cost-policy/finalize-generation-cost.ts`** — exclusive `actual_cost_cents` mutation |
| No client write surface | Zero endpoints accept actual cost input | Forbidden keys on all spend/job paths; **`finalizeGenerationCost`** not exported to action handlers as a client-callable action |
| Adapter-sourced actuals | Read `actualCostCents` only from typed adapter results | **`computeLlmActualCost`** receives `adapterReportedCents` from orchestrator (from `llmCompletionResultSchema`), never from `rawInput` |
| Immutability | `UPDATE … WHERE actual_cost_cents IS NULL` | **`updateReelSpendEventActual`** enforces write-once; idempotent same-value re-run OK |
| Tenant scope | Backfill scoped by server job context | **`finalizeGenerationCost`** verifies `client_id` + `reel_script_id` before UPDATE |
| Operator reads | `requireOperator` first await | **`getReelCostSummaryForWeek`** internal helper; consumed only via gated **`getReelScriptsForWeek`** |
| Cliente exclusion | Response-shape omission | **`getReelScriptsForWeek`** cost block Operator-only route; no cost keys on Cliente paths |
| Failure reason sanitization | Closed enum, no raw provider JSON | **`actualCostUnavailableReasonSchema`** — max 64 chars in DB CHECK |
| Decision log | Append-only | US-7.3 does **not** UPDATE **`neuramark_provider_decisions`** |

---

## Phase A addenda (Phase B — superseded names)

Phase A sections below remain **historical and frozen**. These names are **struck as BUILD targets** for sprint `US-7.3-B`. See **## Phase B** for the live freeze.

| Phase A wording | Phase B addendum |
|-----------------|------------------|
| FE route **`/operator/production`** (surfaces #9, `OperatorProductionJobCostDto` FE route, FE signoff “Phase B: `/operator/production`”) | **Struck.** That route **does not exist**. Live consumer: **`OperatorVideoJobSummaryPanel`** on **`/operator/scripts`**. DTO **type name** `OperatorProductionJobCostDto` **stays**. |
| Gap 4 / 8 “production list on US-8.4 `/operator/production`” | US-8.4 shipped job status + cost chip on **`/operator/scripts`**. Phase B BUILD **must not** invent `/operator/production`. |
| **Sole writer** `finalizeGenerationCost` for all `actual_cost_cents` | **Narrowed for actuals (not abandoned):** exclusive writers = `finalizeGenerationCost` (video `async_update`, manual `sync_insert` 0) **plus named TTS exception** (`recordReelSpendEvent` with actual). Video **create** `recordReelSpendEvent` remains **estimate-only** (not an actual writer). **No** client write surface. |
| `recordReelSpendEvent` callers = **only** `finalizeGenerationCost` (sync_insert) | **Amended:** TTS success orchestrators may INSERT actuals (exception). Create-path video INSERTs may call `recordReelSpendEvent` with `actualCostCents: null`. |
| Out of scope “Production list UI wiring — US-8.4 Phase B” | **Closed as a named route.** Thin FE: poll merge on existing panel (Phase B BUILD). |

**Reviewed by FE (Phase A):** unchanged (2026-08-29). **Phase B Reviewed by FE:** yes — 2026-08-31 — see § Phase B.

---

## Overview

The **System** records **costo real** per completed **Job de generación** on the **spend ledger**, sourced exclusively from **provider adapter responses**. The **Operator** sees **costo estimado vs costo real** per Reel slot and a **weekly per-client sum** on **`/operator/scripts`**.

**Phase A flow (BUILD — LLM-only):**

1. Script/caption orchestrator completes LLM I/O successfully.
2. Orchestrator calls **`finalizeGenerationCost({ mode: "sync_insert", …, llmUsage })`**.
3. Module runs **`computeLlmActualCost`** (catalog token math; prefer adapter-reported cents when **> 0**).
4. Module calls **`recordReelSpendEvent`** — single INSERT with `estimated_cost_cents`, `actual_cost_cents`, optional `actual_cost_unavailable_reason`.
5. Operator loads **`getReelScriptsForWeek`** → response includes **`costSummary: ReelWeekCostSummary`** for column + weekly footer.

**Phase B flow (integration hook — not wired in Phase A BUILD):**

1. Video/TTS job reaches terminal success (US-8.4 poller / US-9.3 synthesize).
2. Completion handler calls **`finalizeGenerationCost({ mode: "async_update", spendEventId, … })`**.
3. Module calls **`updateReelSpendEventActual`** — UPDATE spend row inserted at job start with estimate-only.
4. US-8.4 production list reads **`OperatorProductionJobCostDto`** (separate from scripts list).

**Surfaces**

| # | Surface | Kind | Phase | New vs reused |
|---|---------|------|-------|---------------|
| 1 | `/operator/scripts` cost column + weekly footer | FE | A | **Extended** — estimated vs actual per slot |
| 2 | `finalizeGenerationCost` | Server helper | A+B | **New** — sole actual-cost writer |
| 3 | `computeLlmActualCost` | Server helper | A | **New** — token → cents |
| 4 | `recordReelSpendEvent` | Server helper | A | **Extended** — accept actual + unavailable reason on INSERT |
| 5 | `updateReelSpendEventActual` | Server helper | B seam | **New** — exported; unit-tested; not called in Phase A prod path |
| 6 | `getReelCostSummaryForWeek` | Server helper | A | **New** — slot + weekly aggregates |
| 7 | `getReelScriptsForWeek` | Server Action | A | **Extended** — `costSummary` on success |
| 8 | `sumReelActualCostCents` | Server helper | A | **New** — per-`reel_script_id` SUM |
| 9 | `/operator/production` cost column | FE | B | **US-8.4** — `OperatorProductionJobCostDto` |
| 10 | Zod + types | `lib/contracts/actual-cost.ts` | A | **New** |
| 11 | Migration | `actual_cost_unavailable_reason`, `duration_sec` | A | **New** ALTER |
| 12 | Forbidden keys | `lib/contracts/cost-policy.ts` | A | **Extended** |

**Forbidden surfaces (BUILD veto):**

- Client-supplied `actualCostCents`, `actual_cost_cents`, `durationSec`, `failureReason`, `providerCost` on generate/regenerate/status/webhook payloads.
- Public Server Action / Route Handler named `updateActualCost`, `setSpendActual`, etc.
- Cliente routes or shared serializers exposing `estimatedCostCents`, `actualCostCents`, `weeklyCostSum`.
- Changing **`sumReelCumulativeCostCents`** / budget gate to use actuals.
- Operator manual cost edit UI or correction endpoint.
- Inline `UPDATE neuramark_reel_spend_events SET actual_cost_cents` in route handlers (must go through **`finalizeGenerationCost`**).

---

## Phased BUILD acceptance

| Phase | Scope | Closes AC |
|-------|-------|-----------|
| **A** | LLM script + caption orchestrators; migration; `computeLlmActualCost`; `finalizeGenerationCost` sync path; `getReelCostSummaryForWeek`; `/operator/scripts` cost column + weekly footer; forbidden keys; security tests | Every **completed LLM job** has actual or null + reason; weekly sum; Operator-only 403; [SEC] server-only writes |
| **B** | `updateReelSpendEventActual` wired from US-8.4/US-9.3; `duration_sec` on video/TTS; `OperatorProductionJobCostDto` on production list; manual `actual_cost_cents = 0` | Production list cost column AC; full per-Reel economics before US-7.4 |

Phase A **does not** block on **`neuramark_video_jobs`** DDL.

---

## Frozen constants

```ts
/** Prefer adapter-reported cents when strictly positive. */
export const ADAPTER_REPORTED_COST_MIN_CENTS = 1 as const;

/** Max length for unavailable-reason enum values in DB. */
export const ACTUAL_COST_UNAVAILABLE_REASON_MAX_LENGTH = 64 as const;
```

---

## `actualCostUnavailableReason` (frozen enum)

```ts
export const actualCostUnavailableReasonSchema = z.enum([
  "usage_missing",
  "catalog_cost_model_unsupported",
  "provider_no_billing",
]);

export type ActualCostUnavailableReason = z.infer<
  typeof actualCostUnavailableReasonSchema
>;
```

| Value | When |
|-------|------|
| `usage_missing` | LLM returned without usable token counts |
| `catalog_cost_model_unsupported` | Catalog row missing or `billingUnit` not `per_1m_tokens` |
| `provider_no_billing` | Adapter explicitly cannot compute billing (e.g. stub returns 0 with no usage) |

**Rules:**

- When `actual_cost_cents` is non-null, **`actual_cost_unavailable_reason` MUST be null**.
- When `actual_cost_cents` is null on a **completed** spend row, **`actual_cost_unavailable_reason` MUST be set** (AC literal).
- Exception: pre-US-7.3 historical rows remain null/null until regenerated — UI shows **pending** via `hasPendingActual`.

**i18n keys (Operator UI):** `scripts.cost.actual.unavailable.usage_missing`, `.catalog_cost_model_unsupported`, `.provider_no_billing` (EN + ES).

---

## `computeLlmActualCost` (**new**)

**File (BUILD):** `lib/cost-policy/compute-llm-actual-cost.ts` (`import "server-only"`)

```ts
export type ComputeLlmActualCostInput = {
  providerKey: string;
  inputTokens: number;
  outputTokens: number;
  /** From validated llmCompletionResultSchema — never from request body. */
  adapterReportedCents: number;
};

export type ComputeLlmActualCostResult =
  | { ok: true; actualCostCents: number }
  | { ok: false; reason: ActualCostUnavailableReason };

export async function computeLlmActualCost(
  input: ComputeLlmActualCostInput,
): Promise<ComputeLlmActualCostResult> {
  // 1) If adapterReportedCents >= ADAPTER_REPORTED_COST_MIN_CENTS → { ok: true, actualCostCents }
  // 2) Load catalog row for providerKey
  // 3) If billingUnit per_1m_tokens: ceil((inputTokens + outputTokens) / 1_000_000 * unitCostCents)
  // 4) Else → { ok: false, reason: "catalog_cost_model_unsupported" }
  // 5) If tokens missing/invalid → { ok: false, reason: "usage_missing" }
}
```

| Rule | Detail |
|------|--------|
| Authority | **Only** path for LLM actual cents before persist |
| Precedence | Adapter-reported when **≥ 1** cent; else catalog token math |
| Failed compute | Returns reason; **`finalizeGenerationCost`** still INSERTs row with `actual_cost_cents: null` + reason |
| SiliconFlow fix | Replace placeholder `actualCostCents: 0` — use usage + catalog or return reason |

---

## `finalizeGenerationCost` (**new** — sole writer)

**File (BUILD):** `lib/cost-policy/finalize-generation-cost.ts` (`import "server-only"`)

**Exclusive call sites (frozen):**

| Call site | Phase | Mode |
|---------|-------|------|
| `generateReelScriptsForClient` / slot regenerate | A | `sync_insert` |
| `generateReelCaptionsForClient` / caption regenerate | A | `sync_insert` |
| Video status poller / webhook handler (US-8.4) | B | `async_update` |
| TTS synthesize orchestrator (US-9.3) | B | `sync_insert` or `async_update` per US-9.3 spend timing |
| Manual upload complete (US-8.3) | B | `sync_insert` with `actualCostCents: 0`, `providerKey: "manual"` |

```ts
export const finalizeGenerationCostSyncInsertSchema = z
  .object({
    mode: z.literal("sync_insert"),
    clientId: z.string().uuid(),
    reelScriptId: z.string().uuid(),
    assetRole: z.enum(["llm", "tts", "talking_head", "broll"]),
    jobKind: reelSpendJobKindSchema,
    estimatedCostCents: z.number().int().nonnegative(),
    operatorClientId: z.string().uuid(),
    providerKey: z.string().min(1),
    durationSec: z.number().positive().nullable().optional(),
    llmUsage: z
      .object({
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
        adapterReportedCents: z.number().int().nonnegative(),
      })
      .optional(),
    /** Phase B manual upload — bypasses computeLlmActualCost. */
    manualActualCostCents: z.literal(0).optional(),
  })
  .strict();

export const finalizeGenerationCostAsyncUpdateSchema = z
  .object({
    mode: z.literal("async_update"),
    spendEventId: z.string().uuid(),
    clientId: z.string().uuid(),
    reelScriptId: z.string().uuid(),
    actualCostCents: z.number().int().nonnegative().nullable(),
    actualCostUnavailableReason: actualCostUnavailableReasonSchema.nullable(),
    durationSec: z.number().positive().nullable().optional(),
  })
  .strict();

export type FinalizeGenerationCostInput = z.infer<
  typeof finalizeGenerationCostSyncInsertSchema
> | z.infer<typeof finalizeGenerationCostAsyncUpdateSchema>;

export type FinalizeGenerationCostResult =
  | { ok: true; spendEventId: string }
  | {
      ok: false;
      code: "VALIDATION_ERROR" | "TENANT_MISMATCH" | "NOT_FOUND" | "ALREADY_FINALIZED";
    };

export async function finalizeGenerationCost(
  input: FinalizeGenerationCostInput,
): Promise<FinalizeGenerationCostResult> {
  // sync_insert:
  //   - if assetRole llm && !manualActualCostCents: computeLlmActualCost(llmUsage)
  //   - recordReelSpendEvent({ … actual, reason, durationSec })
  //   - return { ok: true, spendEventId }
  // async_update:
  //   - verify clientId + reelScriptId match spend row
  //   - updateReelSpendEventActual({ … })
}
```

| Rule | Detail |
|------|--------|
| Public API | **Not** a Server Action — internal helper only |
| Sync LLM | Single INSERT via **`recordReelSpendEvent`** (no two-phase INSERT+UPDATE) |
| Failed LLM | **No** spend row (US-7.1 rule unchanged) |
| Immutability | Async path delegates to **`updateReelSpendEventActual`** with `WHERE actual_cost_cents IS NULL` |
| Errors | Spend persist failure **must propagate** (do not swallow — US-7.1 QA M2) |

---

## `recordReelSpendEvent` (**extended**)

**File (BUILD):** `lib/cost-policy/record-reel-spend-event.ts`

```ts
export async function recordReelSpendEvent(params: {
  clientId: string;
  reelScriptId: string;
  assetRole: "llm" | "tts" | "talking_head" | "broll";
  jobKind: ReelSpendJobKind;
  estimatedCostCents: number;
  actualCostCents: number | null;
  actualCostUnavailableReason?: ActualCostUnavailableReason | null;
  durationSec?: number | null;
  operatorClientId: string;
  providerKey: string;
}): Promise<{ spendEventId: string }> {
  // INSERT neuramark_reel_spend_events
  // RETURNING id
}
```

| Rule | Detail |
|------|--------|
| Callers | **Only** **`finalizeGenerationCost`** (sync_insert) in BUILD — orchestrators **must not** call directly |
| `actualCostCents` | Server-computed only; null allowed with reason |
| Return | **`spendEventId`** for correlation / tests |

---

## `updateReelSpendEventActual` (**new** — async seam)

**File (BUILD):** `lib/cost-policy/update-reel-spend-event-actual.ts` (`import "server-only"`)

```ts
export async function updateReelSpendEventActual(params: {
  spendEventId: string;
  clientId: string;
  reelScriptId: string;
  actualCostCents: number | null;
  actualCostUnavailableReason?: ActualCostUnavailableReason | null;
  durationSec?: number | null;
}): Promise<
  | { ok: true; spendEventId: string; idempotent: boolean }
  | { ok: false; code: "NOT_FOUND" | "TENANT_MISMATCH" | "ALREADY_FINALIZED" }
> {
  // UPDATE neuramark_reel_spend_events
  // SET actual_cost_cents, actual_cost_unavailable_reason, duration_sec
  // WHERE id = $spendEventId
  //   AND client_id = $clientId
  //   AND reel_script_id = $reelScriptId
  //   AND (actual_cost_cents IS NULL OR actual_cost_cents = $actualCostCents)
}
```

| Rule | Detail |
|------|--------|
| Callers | **Only** **`finalizeGenerationCost`** (`async_update`) |
| Phase A BUILD | Exported + unit-tested; **not** invoked in production |
| Idempotency | Re-applying same value → `{ ok: true, idempotent: true }` |
| Different value after set | No row change; log server-side; return `ALREADY_FINALIZED` |

---

## Operator cost read — `getReelCostSummaryForWeek` (**new**)

**File (BUILD):** `lib/cost-policy/get-reel-cost-summary-for-week.ts` (`import "server-only"`)

**Gate:** Called only from **`getReelScriptsForWeek`** after **`requireOperator("handler")`** — not a standalone public action in Phase A.

```ts
export const getReelCostSummaryForWeekInputSchema = z
  .object({
    clientId: z.string().uuid(),
    weekStart: trendWeekStartSchema,
    /** Slot indices 0–6 aligned to approved strategy brief. */
    slotReelScriptIds: z.array(
      z.object({
        slotIndex: z.number().int().min(0).max(6),
        reelScriptId: z.string().uuid().nullable(),
      }),
    ),
  })
  .strict();

export const reelSlotCostSummarySchema = z
  .object({
    reelScriptId: z.string().uuid().nullable(),
    slotIndex: z.number().int().min(0).max(6),
    estimatedCostCents: z.number().int().nonnegative(),
    actualCostCents: z.number().int().nonnegative().nullable(),
    hasPendingActual: z.boolean(),
    unavailableReasonKeys: z.array(actualCostUnavailableReasonSchema),
  })
  .strict();

export const reelWeekCostSummarySchema = z
  .object({
    weekStart: trendWeekStartSchema,
    clientId: z.string().uuid(),
    slots: z.array(reelSlotCostSummarySchema),
    weeklyEstimatedCostCents: z.number().int().nonnegative(),
    /** null when no spend row has non-null actual_cost_cents in week scope. */
    weeklyActualCostCents: z.number().int().nonnegative().nullable(),
    hasPartialActual: z.boolean(),
  })
  .strict();
```

**Aggregation rules (frozen):**

| Field | Rule |
|-------|------|
| Week scope | Spend events where `client_id = $clientId` AND `created_at >= weekStart` AND `created_at < weekStart + 7 days` (UTC date math on `weekStart` string) |
| Per-slot `estimatedCostCents` | `SUM(estimated_cost_cents)` for all events with matching `reel_script_id` |
| Per-slot `actualCostCents` | `SUM(actual_cost_cents)` where not null; **null** if all events for slot have null actual |
| `hasPendingActual` | Any event for slot with `actual_cost_cents IS NULL` |
| `weeklyEstimatedCostCents` | Sum of slot estimates (include slots with zero events as 0) |
| `weeklyActualCostCents` | Sum of slot actuals where slot `actualCostCents` not null; **null** if zero slots have any actual |
| `hasPartialActual` | Some but not all completed events in week have actual |

**Tenancy:** `clientId` from **`requireOperator().id`** — request body **must not** accept foreign `clientId` (handler derives server-side).

---

## Extended `getReelScriptsForWeek` (**extended**)

**Action:** `lib/reel-scripts/actions/get-reel-scripts-for-week.ts`  
**Input:** unchanged `{ weekStart }` only.

**Success response extension:**

```ts
export const getReelScriptsForWeekSuccessSchema = z
  .object({
    ok: z.literal(true),
    weekStart: trendWeekStartSchema,
    approvedStrategy: /* unchanged */,
    strategyVersionChanged: z.boolean(),
    items: z.array(reelScriptListItemSchema),
    /** US-7.3 — Operator-only cost block. */
    costSummary: reelWeekCostSummarySchema,
  })
  .strict();
```

**FE consumer:** `/operator/scripts` — cost column reads `costSummary.slots[slotIndex]`; weekly footer reads `weeklyEstimatedCostCents` + `weeklyActualCostCents`.

**i18n keys:** `scripts.cost.actual.columnHeader`, `.estimated`, `.actual`, `.pending`, `.weeklyTotal`, `.weeklyEstimated`, `.unavailable.*` (EN + ES).

---

## `OperatorProductionJobCostDto` (Phase B — US-8.4)

```ts
export const operatorProductionJobCostStatusSchema = z.enum([
  "actual",
  "estimated_only",
  "pending",
  "unavailable",
]);

export const operatorProductionJobCostDtoSchema = z
  .object({
    jobId: z.string().uuid(),
    reelScriptId: z.string().uuid(),
    estimatedCostCents: z.number().int().nonnegative(),
    actualCostCents: z.number().int().nonnegative().nullable(),
    costStatus: operatorProductionJobCostStatusSchema,
    unavailableReasonKey: actualCostUnavailableReasonSchema.optional(),
  })
  .strict();
```

| `costStatus` | When |
|--------------|------|
| `actual` | `actual_cost_cents` non-null (including manual `0`) |
| `estimated_only` | Row exists; actual null; no unavailable reason (pre-7.3 or in-flight) |
| `pending` | Job not terminal; spend row estimate-only |
| `unavailable` | Actual null + `actual_cost_unavailable_reason` set |

**FE route:** `/operator/production` (US-8.4). **Not** in Phase A BUILD.

---

## Forbidden fields (extended)

Merge into **`FORBIDDEN_BUDGET_SPEND_KEYS`** in `lib/contracts/cost-policy.ts`:

```ts
"actualCostCents",
"actual_cost_cents",
"costCents",
"cost_cents",
"durationSec",
"duration_sec",
"billingUsage",
"usage",
"providerCost",
"provider_cost",
"actualCostUnavailableReason",
"actual_cost_unavailable_reason",
"failureReason",
"failure_reason",
"spendEventId",
"spend_event_id",
"manualActualCostCents",
```

**Behavior:** Reject with **`FORBIDDEN_FIELDS`** on script/caption generate/regenerate (match US-7.1 strip/reject posture).

**Grep CI test:** no `actual_cost_cents` in exported client-request Zod schemas.

---

## Database

### Migration — ALTER `neuramark_reel_spend_events`

**File (BUILD):** `supabase/migrations/20260829120000_neuramark_reel_spend_events_actual_cost_reason.sql`

```sql
ALTER TABLE public.neuramark_reel_spend_events
  ADD COLUMN IF NOT EXISTS actual_cost_unavailable_reason text NULL,
  ADD COLUMN IF NOT EXISTS duration_sec numeric(10, 3) NULL;

ALTER TABLE public.neuramark_reel_spend_events
  ADD CONSTRAINT neuramark_reel_spend_events_unavailable_reason_chk
    CHECK (
      actual_cost_unavailable_reason IS NULL
      OR actual_cost_unavailable_reason IN (
        'usage_missing',
        'catalog_cost_model_unsupported',
        'provider_no_billing'
      )
    );

ALTER TABLE public.neuramark_reel_spend_events
  ADD CONSTRAINT neuramark_reel_spend_events_actual_reason_consistency_chk
    CHECK (
      (actual_cost_cents IS NOT NULL AND actual_cost_unavailable_reason IS NULL)
      OR (actual_cost_cents IS NULL)
    );

ALTER TABLE public.neuramark_reel_spend_events
  ADD CONSTRAINT neuramark_reel_spend_events_duration_positive_chk
    CHECK (duration_sec IS NULL OR duration_sec > 0);

CREATE INDEX IF NOT EXISTS neuramark_reel_spend_events_client_created_at_idx
  ON public.neuramark_reel_spend_events (client_id, created_at);
```

| Column | Type | Notes |
|--------|------|-------|
| `actual_cost_unavailable_reason` | `text NULL` | Closed enum CHECK |
| `duration_sec` | `numeric(10,3) NULL` | Reporting; LLM usually null |

**RLS:** unchanged deny-by-default. **No** `neuramark_video_jobs` DDL in Phase A.

---

## Standard error envelope

Cost summary inherits reel-script errors:

| Code | HTTP | When |
|------|------|------|
| `FORBIDDEN` | 403 | Non-operator `getReelScriptsForWeek` |
| `FORBIDDEN_FIELDS` | 400 | Smuggled cost keys on mutations |
| `UNAUTHENTICATED` | 401 | No session |

Internal **`finalizeGenerationCost`** errors propagate to orchestrator → existing generate/regenerate error envelopes.

---

## Fixtures

### Sync LLM success — script generate

**Orchestrator calls after `llmCompletionResult`:**

```json
{
  "mode": "sync_insert",
  "clientId": "11111111-1111-4111-8111-111111111111",
  "reelScriptId": "22222222-2222-4222-8222-222222222222",
  "assetRole": "llm",
  "jobKind": "script_generate",
  "estimatedCostCents": 12,
  "operatorClientId": "11111111-1111-4111-8111-111111111111",
  "providerKey": "siliconflow_low",
  "llmUsage": {
    "inputTokens": 1500,
    "outputTokens": 800,
    "adapterReportedCents": 0
  }
}
```

**INSERT result (catalog `per_1m_tokens` @ 50 cents/1M):**

```json
{
  "spendEventId": "33333333-3333-4333-8333-333333333333",
  "estimated_cost_cents": 12,
  "actual_cost_cents": 1,
  "actual_cost_unavailable_reason": null
}
```

### Unavailable billing

```json
{
  "ok": false,
  "reason": "usage_missing"
}
```

**Spend row:**

```json
{
  "actual_cost_cents": null,
  "actual_cost_unavailable_reason": "usage_missing"
}
```

### `getReelScriptsForWeek` success excerpt

```json
{
  "ok": true,
  "weekStart": "2026-08-25",
  "items": [ "…" ],
  "costSummary": {
    "weekStart": "2026-08-25",
    "clientId": "11111111-1111-4111-8111-111111111111",
    "slots": [
      {
        "slotIndex": 0,
        "reelScriptId": "22222222-2222-4222-8222-222222222222",
        "estimatedCostCents": 24,
        "actualCostCents": 2,
        "hasPendingActual": false,
        "unavailableReasonKeys": []
      }
    ],
    "weeklyEstimatedCostCents": 24,
    "weeklyActualCostCents": 2,
    "hasPartialActual": false
  }
}
```

### Async update seam (Phase B test fixture)

```json
{
  "mode": "async_update",
  "spendEventId": "44444444-4444-4444-8444-444444444444",
  "clientId": "11111111-1111-4111-8111-111111111111",
  "reelScriptId": "22222222-2222-4222-8222-222222222222",
  "actualCostCents": 10,
  "actualCostUnavailableReason": null,
  "durationSec": 28.5
}
```

---

## Security test matrix (BUILD)

| # | Case | Expected |
|---|------|----------|
| S1 | Generate with `actualCostCents: 0` in body | `FORBIDDEN_FIELDS` |
| S2 | Cliente session `getReelScriptsForWeek` | 403 |
| S3 | `updateReelSpendEventActual` second write different value | No row change / `ALREADY_FINALIZED` |
| S4 | `updateReelSpendEventActual` foreign `clientId` | `TENANT_MISMATCH` / no update |
| S5 | Shared Reel DTO snapshot | No `actualCostCents` / `estimatedCostCents` keys |
| S6 | `computeLlmActualCost` token math | Matches catalog fixture |
| S7 | Grep client Zod schemas | No `actual_cost_cents` |

---

## Out of scope (unchanged)

| Item | Owner |
|------|-------|
| Reel detail cost roll-up + variance | US-7.4 |
| `neuramark_video_jobs` DDL | US-8.2 |
| Production list UI wiring | US-8.4 Phase B |
| TTS spend INSERT timing | US-9.3 Phase B |
| Budget gate on actuals | Never without new story |
| Cliente cost visibility | Never |
| Catalog / pricing CRUD | US-X.4 |

---

## FE signoff

- [x] **Reviewed by FE** — `/operator/scripts` cost column + weekly footer from `costSummary`; EN/ES `scripts.cost.actual.*`; pending/unavailable states; no client cost math.

**Reviewed by FE:** yes — 2026-08-29 — nextjs-frontend. **Column:** add read-only **costo estimado / costo real** column to existing `ScriptsPageView` `DataTable` (between status and actions); map each row via `costSummary.slots.find(s => s.slotIndex === item.slotIndex)`; format cents with `formatCentsForDisplay`; show estimate always when `estimatedCostCents > 0`, else **—**; actual: formatted cents when `actualCostCents != null`, **pending** when `hasPendingActual`, subdued unavailable label(s) from `unavailableReasonKeys` → `scripts.cost.actual.unavailable.*` (join when multiple). **Weekly footer:** header or footer stat from `weeklyEstimatedCostCents` + `weeklyActualCostCents` (show **—** when weekly actual null); optional `hasPartialActual` hint. **Data:** same `getReelScriptsForWeek` round-trip — no separate cost action; `costSummary` optional in stub until BE BUILD (hide column/footer when absent). **Phase B:** `/operator/production` + `OperatorProductionJobCostDto` deferred to US-8.4 — no Phase A FE work. **i18n:** EN + ES `scripts.cost.actual.*`. **Constraints:** Operator route only; no client cost math; read-only display.

---

## Zod module map

| Module | Contents |
|--------|----------|
| `lib/contracts/actual-cost.ts` | `actualCostUnavailableReasonSchema`, `computeLlmActualCost` I/O types, `finalizeGenerationCost` input schemas, `reelSlotCostSummarySchema`, `reelWeekCostSummarySchema`, `operatorProductionJobCostDtoSchema`, constants |
| `lib/contracts/cost-policy.ts` | Extended `FORBIDDEN_BUDGET_SPEND_KEYS` |
| `lib/contracts/reel-script.ts` | `getReelScriptsForWeekSuccessSchema` + `costSummary` field (optional in stub until BE BUILD) |

---

# Phase B — Video / TTS / B-roll spend backfill

**Status:** Phase B **frozen** / BUILD unblocked (2026-08-31 — FE Reviewed)  
**Sprint:** `US-7.3-B` · branch `feature/US-7.3-phase-b-spend-backfill`  
**Sources:** `PHASE-B.md` (B1–B18) · `SPEC-REVIEW.md` Phase B (ALIGNED) · `SECURITY.md` Phase B (**12 conditions** reconciled below)  
**DB:** **None** — reuse `neuramark_reel_spend_events.duration_sec` / `actual_cost_unavailable_reason` (Phase A). No new tables or reporting columns.  
**Phase A floors:** Remain binding except names struck in **Phase A addenda**. Phase B **extends** writers, poll DTO, and duration wiring; does **not** weaken forbidden keys, immutability, Operator gate, or Cliente response-shape exclusion.

**This amendment is CONTRACT ONLY.** Zod sketches below are BUILD notes. **Do not change `lib/contracts/*.ts` in this gate** — FE signs off first. Existing `lib/contracts/actual-cost.ts` already exports `operatorProductionJobCostDtoSchema`, `finalizeGenerationCostAsyncUpdateSchema` (`durationSec` optional), and `FORBIDDEN_*` aliases; BUILD **wires** them (poller, GET mapper, TTS trusted duration) rather than inventing parallel schemas.

**Acceptance boundary (narrow — binding):** Phase B closes video/TTS/B-roll **actual** backfill gaps + Operator poll **cost** refresh. Phase A USER_STORIES AC stay **[x]**. **No** new USER_STORIES checkboxes. **US-7.4 BUILD not reopened.**

**Terminology (Phase B):** Prefer **Costo estimado** / **Costo real** · **Job de generación** · **Operator** · **Cliente**. Keep DTO names (`OperatorProductionJobCostDto`) out of Cliente strings.

---

## Phase B — SECURITY reconciliation (12 conditions)

| # | SECURITY condition | Frozen here |
|---|-----------|-------------|
| 1 | TTS exception encoded as `[SEC]` job-completion handler: `server-only`, adapter-sourced actual, **no** request/Zod client `actualCostCents`, write-once; **do not** migrate TTS this slice | § Exclusive actual writers · § TTS exception |
| 2 | Exclusive actual-writer table: `finalizeGenerationCost` (`async_update` video complete, `sync_insert` manual 0) **plus** TTS `recordReelSpendEvent` with actual; create-path INSERT = estimate-only | § Call-site / writer table |
| 3 | Zero HTTP mutations accepting `actualCostCents` / `actual_cost_cents` / client `durationSec` | § Forbidden keys (Phase A list remains) · GET has **no body** |
| 4 | FE surface: no `/operator/production` BUILD; panel + Operator `GET /api/video-jobs/[jobId]` + `OperatorProductionJobCostDto` | § FE surface freeze · Phase A addenda |
| 5 | Poll DTO Operator-only; **zero** cost keys on Cliente poll/serializers; Cliente cannot obtain the cost DTO | § Operator poll response · § Cliente exclusion |
| 6 | Ledger = reporting canonical; `video_jobs.actual_cost_cents` = mirror; Operator DTO **ledger-wins** when `spendEventId` present; US-7.4 must not SUM `video_jobs` | § Dual store · § DTO ledger-wins |
| 7 | Fail/cancel: no spend actual UPDATE | § Call-site table · § Fail / cancel |
| 8 | Missing `spendEventId`: log only; **no** late actual-only INSERT | § Missing spendEventId |
| 9 | Completed success + `spendEventId`: actual **or** closed `actualCostUnavailableReason` — never null/null | § Poller complete |
| 10 | `durationSec` server-derived on video `async_update` + TTS trusted path when known; never from client | § `durationSec` |
| 11 | Budget gate unchanged (estimates only) | § Non-goals |
| 12 | Security test matrix (forgery, Cliente 403, poll cost Operator-only, no late INSERT, fail/cancel immutability, no `video_jobs` SUM, estimate-only gate) | § Security test matrix |

---

## Phase B — Call-site / writer table (frozen)

**Frontend consumer (job cost):** `OperatorVideoJobSummaryPanel` on `/operator/scripts` (expand) — **not** a new route.

| Path | Writer | When | Actuals |
|------|--------|------|---------|
| Video create (talking_head / broll: SadTalker, MuseTalk, HeyGen, Wan) | `recordReelSpendEvent` **estimate-only** | job create | `actual_cost_cents` **null**; link `spend_event_id` on `neuramark_video_jobs`. Retries → **new** spend row per attempt (B4). **Not** an actual writer. |
| Video complete (poller / webhook after US-8.4 authenticity gate) | `finalizeGenerationCost({ mode: "async_update" })` → `updateReelSpendEventActual` | `status = completed` **and** `spendEventId` present | actual **or** closed `actualCostUnavailableReason`; `durationSec` when known. Mirror `neuramark_video_jobs.actual_cost_cents` on the **same** complete pass. Cost from **adapter `fetchAsset` / typed persist** — **never** raw webhook/status JSON. |
| Video fail / cancel | **none** | terminal fail / cancel | **no** spend UPDATE. Estimate-only row remains. Do **not** invent billed cost or a “job failed” unavailable-reason (no adapter reports billed amount today) (B6). |
| Missing `spendEventId` on complete | **log only** (no secrets / raw vendor body) | completed without linked spend | **no** late INSERT of an actual-only spend row (B5). Job-row mirror may still update from persist; reporting ledger has no new row. |
| Manual upload | `finalizeGenerationCost` `sync_insert` | upload complete | `actual = 0`, `providerKey: "manual"`, `durationSec` when known. **Verify tests only** — no rewrite (B8). |
| TTS success (Operator `synthesize-voiceover-for-reel-script` + trusted `synthesize-voiceover-for-client-trusted`) | `recordReelSpendEvent` **with actual** (**named exception**) | synthesize success | actual from typed adapter / `storedAsset`; `durationSec` on **trusted** path in BUILD (Operator path already sets it). Failed TTS: **no** spend row (same as LLM). **Do not** migrate to `finalizeGenerationCost` this slice (B3/B7). |
| LLM script / caption / QA `qa_run` | Phase A `finalizeGenerationCost` `sync_insert` | unchanged | unchanged. **Out** of Phase B BUILD unless a cost leak is found. |

**Forbidden writers:**

- Ad-hoc `UPDATE neuramark_reel_spend_events SET actual_cost_cents` in Route Handlers / Server Actions.
- New HTTP mutation accepting actuals / `durationSec`.
- Client Component calls to spend helpers.
- Third actual writer (e.g. `media_assets` as a second ledger).

**Public API:** `finalizeGenerationCost` and TTS `recordReelSpendEvent` remain **`import "server-only"`** internal helpers — **not** Server Actions.

---

## Phase B — TTS exception (condition 1)

**Counts as** the USER_STORIES `[SEC]` job-completion handler for TTS.

| Rule | Detail |
|------|--------|
| Modules | `lib/tts/synthesize-voiceover-for-reel-script.ts` · `lib/tts/synthesize-voiceover-for-client-trusted.ts` — keep `server-only` |
| Actual source | Typed adapter / `storedMediaAssetSchema.actualCostCents` only — **never** `request.json()`, form data, or query |
| Request Zod | Operator action remains `{ reelScriptId }` (plus existing non-cost fields). Trusted path: **server params only**. **Forbidden:** `actualCostCents`, `actual_cost_cents`, `durationSec` from the client |
| Write-once | No TTS “correct actual” mutation |
| Operator success DTO | May keep cost fields **only** because the action is Operator-gated |
| Cliente | Revision / approval / dashboard payloads **omit** TTS cost keys even if the trusted synthesizer ran |
| Migration | **Out** this slice — future story if TTS is later wrapped in `finalizeGenerationCost` |

---

## Phase B — FE surface freeze (condition 4)

| Item | Freeze |
|------|--------|
| **BUILD target** | **`OperatorVideoJobSummaryPanel`** on **`/operator/scripts`** |
| **Poll** | Operator **`GET /api/video-jobs/[jobId]`** (`app/api/video-jobs/[jobId]/route.ts`) — already `requireOperator("handler")` first await |
| **DTO type name** | `OperatorProductionJobCostDto` — **keep** (do not rename) |
| **Struck** | **`/operator/production`** — not a live route; **do not invent** |
| Slot list / weekly footer | Phase A `costSummary` **unchanged** — new `asset_role` rows auto-sum |
| B-roll clip strip / TTS cost chip | **Out** — US-7.4 rollup + weekly slot sum |
| Cliente UI | **No** cost |

Status-only poll that drops `cost` is **in-scope BUILD**, not a new page (B12).

---

## Phase B — Operator poll response (frozen JSON)

**Kind:** Route Handler `GET` (explicit HTTP poll — not a Server Action).  
**Why Route Handler:** existing US-8.4 interval poll from the panel; no mutation.

**Gate:** `requireOperator("handler")` **first** await (already). Role never from request. Scoped load `loadVideoJobScoped({ jobId, clientId: operator.id })`. Foreign / missing `jobId` → **404** (uniform, no leak). Invalid UUID → **404**.

**Request:** **no body**. Path param `jobId` only. Client **cannot** send `actualCostCents` / `durationSec`.

**Cache:** `Cache-Control: private, no-store` (unchanged).

**Live today (pre-BUILD):** GET validates `operatorVideoJobStatusDtoSchema` via `mapOperatorVideoJobStatusDto` — **status-only**, no `cost`. Panel `mergePolledStatus` copies status fields and **drops** `cost`.

**BUILD freeze:** GET **must** return the same shape as the summary mapper (`mapOperatorVideoJobSummaryDto`) so FE can merge `cost` after complete **without** a full page reload.

**Do not** extend a shared Cliente status schema with cost. Prefer: validate GET with **`operatorVideoJobSummaryDtoSchema`** (status fields + `cost`). `operatorVideoJobStatusDtoSchema` stays **status-only** for any future non-cost poll.

### Exact 200 JSON (Operator) — FE merge target

GET returns the DTO **directly** (not `{ ok: true, … }` — match live Route Handler). Frozen field set:

```json
{
  "status": "completed",
  "progressPercent": 100,
  "sanitizedErrorMessage": null,
  "jobId": "55555555-5555-4555-8555-555555555555",
  "reelScriptId": "22222222-2222-4222-8222-222222222222",
  "attempt": 1,
  "regenerationCount": 1,
  "failureReason": null,
  "canRetry": false,
  "retryBlockedReasonKey": null,
  "createdAt": "2026-08-31T16:00:00.000Z",
  "updatedAt": "2026-08-31T16:05:00.000Z",
  "cost": {
    "jobId": "55555555-5555-4555-8555-555555555555",
    "reelScriptId": "22222222-2222-4222-8222-222222222222",
    "estimatedCostCents": 18,
    "actualCostCents": 18,
    "costStatus": "actual"
  }
}
```

`progressPercent` / `sanitizedErrorMessage` remain optional per `persistedVideoJobStatusSchema`. `unavailableReasonKey` is **omitted** unless `costStatus === "unavailable"`.

### `cost` object allowlist (frozen)

Markdown sketch — **already** in `lib/contracts/actual-cost.ts` (no file change this gate):

```ts
export const operatorProductionJobCostStatusSchema = z.enum([
  "actual",
  "estimated_only",
  "pending",
  "unavailable",
]);

export const operatorProductionJobCostDtoSchema = z
  .object({
    jobId: z.string().uuid(),
    reelScriptId: z.string().uuid(),
    estimatedCostCents: z.number().int().nonnegative(),
    actualCostCents: z.number().int().nonnegative().nullable(),
    costStatus: operatorProductionJobCostStatusSchema,
    unavailableReasonKey: actualCostUnavailableReasonSchema.optional(),
  })
  .strict();
```

| Field | Rule |
|-------|--------|
| `jobId` / `reelScriptId` | Server job row |
| `estimatedCostCents` | From spend row when `spendEventId` present, else job-row estimate |
| `actualCostCents` | **Ledger-wins** when `spendEventId` present (read `neuramark_reel_spend_events`). Job-row `actual_cost_cents` is fallback **only** when no spend row. Includes manual `0`. |
| `costStatus` | `actual` · `estimated_only` · `pending` · `unavailable` — same Phase A table |
| `unavailableReasonKey` | Closed enum only; **omit** when unused |
| **Forbidden in DTO** | `cost_model`, `envKeyName`, raw provider billing payloads, `external_job_id`, `rawOutputUrl`, `storage_key` |

### FE merge (binding for nextjs-frontend)

Today:

```ts
function mergePolledStatus(
  current: OperatorVideoJobSummaryDto,
  polled: OperatorVideoJobStatusDto,
): OperatorVideoJobSummaryDto
```

**BUILD:** treat poll JSON as **`OperatorVideoJobSummaryDto`**. Copy **`cost`** from `polled` when present. After terminal **completed**, panel **Costo real** must update without a full reload. Reuse `formatCentsForDisplay` + existing `scripts.videoJob` / `scripts.cost.actual.*` keys. **No** client-side cents math.

### In-flight vs terminal

| Job `status` | Typical `cost.costStatus` |
|--------------|---------------------------|
| `queued` / `processing` | `pending` (estimate-only spend) |
| `completed` + actual set | `actual` |
| `completed` + actual null + reason | `unavailable` |
| `failed` / `cancelled` | `estimated_only` (spend actual **unchanged** / still null) |

---

## Phase B — Cliente exclusion (condition 5)

| Surface | Cost keys |
|---------|----------|
| Operator `GET /api/video-jobs/[jobId]` after `requireOperator` | **Allowed** — `cost` / `OperatorProductionJobCostDto` |
| Operator TTS synthesize success DTO | **Allowed** (existing Operator gate) |
| Any **Cliente** video-job / TTS / media **poll or serializer** | **Zero** `estimatedCostCents`, `actualCostCents`, `costStatus`, `unavailableReasonKey`, `cost`, snake_case equivalents |
| Cliente session calling Operator GET | **`403`** (`requireOperator`) — no partial DTO |
| Shared Reel / approval / dashboard | Unchanged Phase A omission |

UI hiding is **not** a control.

---

## Phase B — Dual store (condition 6)

| Store | Role |
|-------|--------|
| **`neuramark_reel_spend_events`** | **Canonical reporting** — weekly SUM, US-7.4 roll-up `GROUP BY asset_role` |
| **`neuramark_video_jobs.actual_cost_cents`** | Denormalized **UI mirror** from the same complete pass — **never** US-7.4 / weekly SUM source |

**No new tables/columns.** **No US-7.4 BUILD.** Queries **must not** `SUM(neuramark_video_jobs.actual_cost_cents)`.

**DTO ledger-wins:** `buildOperatorProductionJobCostDto` (BUILD) must prefer ledger `actual_cost_cents` / `actual_cost_unavailable_reason` when `spendEventId` is present — not “job row first, ledger only if job actual is null” (live helper today).

---

## Phase B — Poller complete, fail, missing id (conditions 7–9)

**File (BUILD):** `lib/video-jobs/apply-video-job-status-update.ts`

| Event | Behavior |
|-------|----------|
| `completed` + `spendEventId` | `finalizeGenerationCost({ mode: "async_update", spendEventId, clientId, reelScriptId, actualCostCents, actualCostUnavailableReason, durationSec })`. If persist `actualCostCents` is null → set closed **`actualCostUnavailableReason`** (`provider_no_billing` when adapter cannot bill; do **not** leave completed ledger row **null/null**). |
| `completed` + no `spendEventId` | Log (no secrets); **do not** INSERT spend; **do not** call finalize |
| `failed` / `cancelled` | Status UPDATE only. **Do not** call `finalizeGenerationCost`. Spend actual unchanged |
| Webhook | US-8.4 authenticity **before** persist; cost from persist/adapter only |
| Idempotent complete | Existing early-return when already completed — no second different actual (immutability still `WHERE actual_cost_cents IS NULL`) |

Wan B-roll complete uses this **same** path — no second writer (`ltx_broll_high` **out**).

---

## Phase B — `durationSec` (condition 10)

| Path | Rule |
|------|------|
| Video `async_update` | Pass when persist / probe / `storedMediaAssetSchema.durationSec` is known; else omit / `null` |
| TTS Operator | Already sets `durationSec` — keep |
| TTS **trusted** | BUILD: persist `durationSec` on spend INSERT when adapter/asset knows it |
| LLM | **null** |
| Client request | **Never** — remains in `FORBIDDEN_BUDGET_SPEND_KEYS` |
| Weekly SUM | Duration **not** required |

Existing Zod (`finalizeGenerationCostAsyncUpdateSchema.durationSec`) already allows `number().positive().nullable().optional()` — BUILD **passes the value**; no schema file change required this gate.

---

## Phase B — Forbidden keys (condition 3)

Phase A list **remains** (no removals). Client **cannot** send `actualCostCents` / `durationSec` on video create, TTS synthesize, retry, poll, or webhooks.

Grep: no `actual_cost_cents` in exported **client-request** Zod schemas.

---

## Phase B — Non-goals (condition 11 + scope out)

| Item | Rule |
|------|--------|
| Budget gate | **`SUM(estimated_cost_cents)`** only — `assertReelBudgetAllowsSpend` / `sumReelCumulativeCostCents` **unchanged** |
| `/operator/production` | Not a BUILD target |
| US-7.4 query rewrite | **No** |
| TTS migrate to `finalizeGenerationCost` | **No** this slice |
| Fail-row billed actual | **No** |
| New DDL | **No** |
| Historical SQL backfill | **Out** |
| Assembly / branding / FFmpeg / QA spend | **Out** |
| Cliente cost | **Never** |
| `ltx_broll_high` | Catalog inactive — no adapter |

---

## Phase B — Zod / BUILD sketch (markdown only — no `lib/contracts/*.ts` this gate)

| Module (live) | Phase B BUILD change |
|---------------|----------------------|
| `lib/contracts/actual-cost.ts` | **No required schema add** — `operatorProductionJobCostDtoSchema` + async `durationSec` already exist. Optional: document ledger-wins in helper, not Zod. |
| `lib/contracts/video-job.ts` | GET validates **`operatorVideoJobSummaryDtoSchema`** (already `status + cost`). Do **not** add `cost` onto `operatorVideoJobStatusDtoSchema` if that type could be reused for Cliente. |
| `lib/contracts/cost-policy.ts` | Forbidden keys unchanged |
| `app/api/video-jobs/[jobId]/route.ts` | Switch mapper to `mapOperatorVideoJobSummaryDto`; parse summary schema |
| `lib/video-jobs/apply-video-job-status-update.ts` | Pass `durationSec`; closed reason if actual null; log missing `spendEventId` |
| `lib/video-jobs/build-operator-production-job-cost.ts` | Ledger-wins when `spendEventId` present |
| `lib/tts/synthesize-voiceover-for-client-trusted.ts` | Pass `durationSec` on INSERT |
| `components/scripts/OperatorVideoJobSummaryPanel.tsx` | Merge `cost` from poll (FE) |

---

## Phase B — Error codes (poll)

| Code | HTTP | When |
|------|------|------|
| `FORBIDDEN` | **403** | Non-operator GET (Cliente / unauthenticated-as-client) — existing `authGuardResponse` |
| `UNAUTHENTICATED` | **401** | No session |
| `NOT_FOUND` | **404** | Invalid UUID, missing job, or foreign `jobId` (tenant) |
| `INTERNAL_ERROR` | **500** | DTO parse failure |

No new cost-correction error codes. `ALREADY_FINALIZED` remains **internal** to `finalizeGenerationCost` (logged; not a client oracle).

---

## Phase B — Fixtures

### Operator GET after complete with cost

```http
GET /api/video-jobs/55555555-5555-4555-8555-555555555555
```

**200** (excerpt — full status fields as in § Operator poll response):

```json
{
  "status": "completed",
  "jobId": "55555555-5555-4555-8555-555555555555",
  "reelScriptId": "22222222-2222-4222-8222-222222222222",
  "cost": {
    "jobId": "55555555-5555-4555-8555-555555555555",
    "reelScriptId": "22222222-2222-4222-8222-222222222222",
    "estimatedCostCents": 18,
    "actualCostCents": 18,
    "costStatus": "actual"
  }
}
```

**Unavailable complete** (`cost` only):

```json
{
  "cost": {
    "jobId": "55555555-5555-4555-8555-555555555555",
    "reelScriptId": "22222222-2222-4222-8222-222222222222",
    "estimatedCostCents": 18,
    "actualCostCents": null,
    "costStatus": "unavailable",
    "unavailableReasonKey": "provider_no_billing"
  }
}
```

### Cliente 403

Cliente (or non-operator) `GET /api/video-jobs/{jobId}` → **403**, **no** `cost` object, **no** `OperatorProductionJobCostDto` fields.

```json
{
  "error": {
    "code": "FORBIDDEN"
  }
}
```

(Exact envelope matches existing `authGuardResponse` — FE must not assume cost keys exist on 403.)

### Fail / cancel — actual unchanged

After create (estimate-only spend):

```json
{
  "estimated_cost_cents": 18,
  "actual_cost_cents": null,
  "actual_cost_unavailable_reason": null
}
```

Poller → `failed` or `cancelled`: **same** spend row (no UPDATE). Job poll `cost.costStatus` = `estimated_only`; `actualCostCents` **null**. Job-row mirror must **not** invent `0`.

### Async update with duration (internal — not HTTP)

```json
{
  "mode": "async_update",
  "spendEventId": "44444444-4444-4444-8444-444444444444",
  "clientId": "11111111-1111-4111-8111-111111111111",
  "reelScriptId": "22222222-2222-4222-8222-222222222222",
  "actualCostCents": 18,
  "actualCostUnavailableReason": null,
  "durationSec": 28.5
}
```

---

## Phase B — Security test matrix (condition 12)

BUILD **must** exist for at least:

| # | Case | Expected |
|---|------|----------|
| PB-S1 | TTS synthesize **or** video-create payload with `actualCostCents: 0` (and `durationSec`) | `FORBIDDEN_FIELDS` |
| PB-S2 | Cliente session `GET /api/video-jobs/[jobId]` | **403**; no cost JSON |
| PB-S3 | Operator GET after complete | Includes `cost` / `OperatorProductionJobCostDto`; **no** catalog `cost_model` / `envKeyName` |
| PB-S4 | Grep / schema: Cliente poll / shared serializers | **No** cost keys (`estimatedCostCents`, `actualCostCents`, `costStatus`, `cost`, snake_case) |
| PB-S5 | Complete with null `spendEventId` | **No** new `neuramark_reel_spend_events` INSERT; log only |
| PB-S6 | Fail / cancel | Spend `actual_cost_cents` **unchanged** |
| PB-S7 | Second `async_update` with **different** actual | No overwrite (`ALREADY_FINALIZED` / idempotent same-value only) |
| PB-S8 | Weekly / US-7.4 rollup queries | Do **not** `SUM` `neuramark_video_jobs.actual_cost_cents` |
| PB-S9 | Budget helper | Still sums **estimates only** |
| PB-S10 | Completed + `spendEventId` + persist actual null | Ledger has closed `actual_cost_unavailable_reason`; not null/null |
| PB-S11 | Video `async_update` when duration known | `duration_sec` set on spend row |
| PB-S12 | TTS trusted path when duration known | `duration_sec` set on INSERT |

---

## Phase B — Test files (BUILD)

| File | Covers |
|------|--------|
| `lib/video-jobs/apply-video-job-status-update.test.ts` (extend) | Complete → ledger actual / reason; `durationSec`; missing `spendEventId` no INSERT; fail/cancel no spend UPDATE |
| `app/api/video-jobs/[jobId]/route.ts` tests (or existing route test) | Operator 200 includes `cost`; Cliente **403**; foreign job **404** |
| `lib/video-jobs/build-operator-production-job-cost.test.ts` (extend) | Ledger-wins; no `cost_model` in DTO |
| `lib/tts/synthesize-voiceover-for-client-trusted.test.ts` (extend) | `durationSec` on INSERT; no request actuals |
| Cost-policy / forbidden-key tests (extend) | Video-create + TTS `actualCostCents` → `FORBIDDEN_FIELDS` |
| Grep / schema snapshot | Cliente serializers cost-free; no `SUM(video_jobs.actual_cost_cents)` |
| Budget helper test | Estimates only |

---

## Phase B — Acceptance mapping (for validator)

Phase A USER_STORIES AC stay **[x]**. Phase B **re-verifies** `[SEC]` on video / TTS / B-roll paths. **Do not** check USER_STORIES AC in CONTRACT or BUILD gates.

---

## Phase B — Reviewed by FE

**Reviewed by FE:** yes — 2026-08-31 — nextjs-frontend (Phase B poll `cost` on `OperatorVideoJobSummaryPanel`; no `/operator/production`)

FE confirmed: poll JSON `cost` merge on `OperatorVideoJobSummaryPanel`; **no** `/operator/production`; **no** Cliente cost; DTO type name may stay; i18n reuse existing keys unless a gap is found.
