# API Contract — US-7.1 Configure max budget per Reel

**Story:** US-7.1  
**Status:** Frozen — 2026-08-30 (awaiting FE signoff)  
**Security:** `plan/stories/US-7.1/SECURITY.md` (APPROVE WITH CONDITIONS — binding freeze; reconciled below)  
**Spec review:** `plan/stories/US-7.1/SPEC-REVIEW.md` (GAPS — resolved by this contract)  
**Depends on:** US-3.1 ✅ `visual_mode` · US-5.1 ✅ `neuramark_reel_scripts` + generate/regenerate · US-6.1 ✅ caption generate/regenerate · US-X.4 ✅ `neuramark_cost_policies` seed + catalog loaders · US-14.5 ✅ `requireOperator()`  
**Identity seam:** `lib/auth/get-current-user.ts` / `requireOperator()` (unchanged)  
**Feature branch:** `feature/US-7.1-cost-policy`  
**Error envelope style:** same class as US-5.1 / US-6.1 (`ok: true` vs `{ ok: false, error: { code, fields?, messageKey? } }`)

**This document is CONTRACT ONLY.** Zod below is the BUILD sketch for `lib/contracts/cost-policy.ts`, new modules under `lib/cost-policy/`, migrations, and targeted changes to script/caption generate orchestrators and actions.

**Terminology:** **Política de costo** · **Presupuesto máximo por Reel** · **Nivel de proveedor** (`low` \| `high`) · **Operator** · **Paquete de guion** · **Reel** · **modalidad de producción**. Technical enums (`budgetOverride`, `assertReelBudgetAllowsSpend`) OK in code/DB. Do **not** use CONTEXT _Evitar_ terms in product-facing strings.

**SPEC-REVIEW blocking gaps closed in this contract:**

| # | Gap | Resolution |
|---|-----|------------|
| 1 | Audit log schema undefined | **`neuramark_budget_audit_log`** append-only table with `event_type` (`blocked` \| `override_proceed` \| `policy_updated`); service-role INSERT only; no Cliente read path |
| 2 | Override workflow unspecified | **V1 frozen:** inline **`budgetOverride: true`** on generate/regenerate mutations after ConfirmDialog “Proceed anyway”; **`overrideReason`** required (1–500 chars) when override used; synchronous **`override_proceed`** audit row **before** LLM I/O — not a permanent skip flag |
| 3 | US-7.1 vs US-7.2 BE overlap | **US-7.1** = `getCostPolicyForClient`, **`assertReelBudgetAllowsSpend`**, ledger, settings CRUD, **`estimateLlmJobCost`** (LLM blocking math only). **US-7.2** = full per-asset ranking + job decision logging — 7.1 passes visual/modalidad as **projection hint only** |
| 4 | `getCostPolicyForClient()` missing | Frozen resolver: per-client row if present, else global `client_id IS NULL`; partial **UNIQUE** index on `client_id WHERE NOT NULL` |
| 5 | Cumulative spend data model incomplete | **`neuramark_reel_spend_events`** ledger; **`sumReelCumulativeCostCents(reelScriptId)`** = `SUM(estimated_cost_cents)`; strategy LLM (US-4.1) **out of** Reel cumulative; video/TTS rows deferred but schema ready |
| 6 | “User confirms generation” vs Cliente cost ban | Estimates + ConfirmDialog are **Operator-only** on `/operator/scripts`; system/cron path blocks + audits — no Cliente cost UI |
| 7 | Operator minimal DTO not frozen | **`OperatorCostSettingsDto`** + **`ReelBudgetPreview`** explicit allowlists — no `envKeyName`, full `cost_model`, or raw `rules` |
| 8 | `MAX_COST_CENTS_CEILING` unset | Frozen **`MAX_COST_CENTS_CEILING = 10_000`** ($100.00/Reel); Zod on writes; FE mirrors for UX only |
| 9 | `rules` jsonb schema unset | V1 **`rules` remains NULL** — no UI CRUD; avatar/faceless via profile `visual_mode` + slot `modalidad` as projection context |
| 10 | Cycle block → Operator queue | V1 **event-only:** `blocked` rows in **`neuramark_budget_audit_log`**; no `reel_production_status` column in 7.1 BUILD |
| 11 | High tier without active catalog rows | Generation estimate/gate **fail closed** → **`PROVIDER_UNAVAILABLE`**; settings may still set `high` |
| 12 | Retrofit LLM generate paths | **`assertReelBudgetAllowsSpend`** wired in all four orchestrator paths before LLM call (see Call sites) |

**SECURITY reconciliation (binding):**

| Topic | SECURITY condition | **Frozen in this contract** |
|-------|-------------------|----------------------------|
| Gate module | `import "server-only"` central gate | **`lib/cost-policy/assert-reel-budget-allows-spend.ts`** — single entry; no ad-hoc comparisons in handlers |
| Override | Separate action vs inline flag | **PO reconciliation:** inline **`budgetOverride: true`** on gated mutations **with** required **`overrideReason`** + audit — satisfies “explicit Operator override + audit trail” without a second round-trip |
| Forbidden fields | Reject estimate/policy authority on spend paths | Extended forbidden-key lists on script + caption actions (see Strip vs reject) |
| Global vs client writes | Separate code paths | **`updateGlobalCostPolicy`** (global row only) vs **`updateClientCostPolicyOverride`** (session tenant `clientId` only) |
| Overflow | Safe integer arithmetic | **`safeAddCents`** + SQL `SUM`; overflow → fail closed (treat as over budget) |
| Policy cache | No cross-request cache of mutable policy | Per-request `cache()` OK on loaders; spend paths always fresh read |
| Cumulative stub | No always-zero gate once paid jobs exist | Ledger INSERT after successful LLM; SUM is real from first spend event |
| Manual upload | Skip gate for `manual` provider | Documented seam for US-8.3 — not in 7.1 BUILD paths |
| Cliente cost exclusion | No cost fields on shared payloads | Budget DTOs Operator-gated only; list/get Reel payloads unchanged |

---

## Overview

An authenticated **Operator** configures **Política de costo** (global default + optional per-client override) on **`/operator/settings/cost-policy`**, sees **server-derived budget previews** before script/caption generate/regenerate on **`/operator/scripts`**, and the **System** enforces a **mandatory server-side budget gate** on cumulative Reel spend before any LLM I/O.

1. **`getCostPolicyForClient(clientId)`** resolves effective policy (client row → else global seed).
2. **`getReelBudgetPreview`** returns estimate DTO for ConfirmDialog (no LLM call).
3. **`assertReelBudgetAllowsSpend`** runs inside job-creation orchestrators **before** LLM invocation.
4. On block: INSERT **`neuramark_budget_audit_log`** `blocked`; return **`BUDGET_EXCEEDED`** — no spend event.
5. On override: mutation includes **`budgetOverride: true`** + **`overrideReason`**; INSERT **`override_proceed`** audit; then proceed.
6. On success: **`recordReelSpendEvent`** INSERT after LLM completes.
7. Policy edits: Operator-gated Server Actions + **`policy_updated`** audit rows.

**V1 gate surface:** script + caption generate/regenerate only. Video/TTS/B-roll spend events and **`neuramark_video_jobs`** gate are **US-8.x / US-9.3** — ledger schema accepts them.

**Surfaces**

| # | Surface | Kind | New vs reused |
|---|---------|------|---------------|
| 1 | `/operator/settings/cost-policy` | FE page | **New** — global policy form + optional client override section |
| 2 | `/operator/scripts` ConfirmDialog | FE | **Extended** — budget preview before generate/regenerate (batch + single) |
| 3 | `getCostPolicyForSettings` | Server Action | **New** — settings page load |
| 4 | `updateGlobalCostPolicy` | Server Action | **New** — UPDATE global row |
| 5 | `updateClientCostPolicyOverride` | Server Action | **New** — upsert/delete per-client override |
| 6 | `getReelBudgetPreview` | Server Action | **New** — confirm dialog DTO(s) |
| 7 | `getCostPolicyForClient` | Server helper | **New** — effective policy resolver |
| 8 | `sumReelCumulativeCostCents` | Server helper | **New** — ledger SUM |
| 9 | `estimateLlmJobCost` | Server helper | **New** — catalog + tier + variant → cents |
| 10 | `assertReelBudgetAllowsSpend` | Server helper | **New** — mandatory gate |
| 11 | `recordReelSpendEvent` | Server helper | **New** — post-success ledger INSERT |
| 12 | `generateReelScripts` / `regenerateReelScriptSlot` | Server Action | **Extended** — `budgetOverride`, `overrideReason`; wire gate |
| 13 | `generateReelCaptions` / `regenerateReelCaption` | Server Action | **Extended** — same |
| 14 | `generateReelScriptsForClient` / `generateReelCaptionsForClient` | Orchestrator | **Extended** — replace `getDefaultCostPolicy` with `getCostPolicyForClient`; call gate + record spend |
| 15 | Zod + types | `lib/contracts/cost-policy.ts` | **New** |
| 16 | Migrations | `neuramark_reel_spend_events`, `neuramark_budget_audit_log`, cost_policies unique index | **New** |

**Forbidden surfaces (BUILD veto):**

- Cliente routes exposing caps, estimates, or tier.
- Client-supplied `maxCostCents`, `providerTier`, `estimatedCostCents`, `policyId`, `skipBudgetCheck`, etc. on spend paths.
- Catalog CRUD or `envKeyName` / full `cost_model` in Operator DTOs.
- Global “disable budget” toggle.
- Permanent override tokens or `SKIP_BUDGET_CHECK` env bypass in production.
- Moving spend authority to Client Components or Fly worker.

**Why Server Actions:** UI-coupled Operator settings + confirm-then-generate on `/operator/scripts`; same CSRF/origin posture as US-5.1 / US-6.1.

---

## Frozen constants

```ts
/** Application ceiling for max_cost_cents writes (stricter than DB CHECK > 0). */
export const MAX_COST_CENTS_CEILING = 10_000 as const; // $100.00/Reel

/** US-X.4 seed default — documented; not enforced on read. */
export const DEFAULT_MAX_COST_CENTS = 150 as const; // $1.50/Reel

export const OVERRIDE_REASON_MIN_LENGTH = 1;
export const OVERRIDE_REASON_MAX_LENGTH = 500;
```

| Constant | Value | Notes |
|----------|-------|-------|
| `MAX_COST_CENTS_CEILING` | **10_000** | Zod `.max()` on policy writes; SECURITY stricter than DB |
| `DEFAULT_MAX_COST_CENTS` | **150** | US-X.4 seed; settings UI edits global row in place |
| `OVERRIDE_REASON_MAX_LENGTH` | **500** | Required when `budgetOverride: true` and gate would block |

---

## Shared helpers (frozen)

**BUILD:** `lib/contracts/cost-policy.ts` — FE may import constants, projection hint enum, and **types**; Zod parse for mutations stays server-side.

```ts
/** Overflow-safe cents addition. Returns null if unsafe or negative inputs. */
export function safeAddCents(a: number, b: number): number | null {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) return null;
  if (a < 0 || b < 0) return null;
  const total = a + b;
  if (!Number.isSafeInteger(total)) return null;
  if (total > Number.MAX_SAFE_INTEGER) return null;
  return total;
}

export function remainingBudgetCents(
  maxCostCents: number,
  cumulativeCostCents: number,
): number {
  return Math.max(0, maxCostCents - cumulativeCostCents);
}

export function wouldExceedBudget(
  cumulativeCostCents: number,
  estimatedCostCents: number,
  maxCostCents: number,
): boolean {
  const total = safeAddCents(cumulativeCostCents, estimatedCostCents);
  if (total === null) return true; // fail closed
  return total > maxCostCents;
}
```

---

## Policy resolution — `getCostPolicyForClient` (**new**)

**File (BUILD):** `lib/cost-policy/get-cost-policy-for-client.ts` (`import "server-only"`)

```ts
export type CostPolicyForClientResult =
  | {
      ok: true;
      policy: CostPolicyRow;
      scope: "client" | "global";
    }
  | {
      ok: false;
      code: "COST_POLICY_UNAVAILABLE";
    };

export async function getCostPolicyForClient(
  clientId: string,
): Promise<CostPolicyForClientResult> {
  // 1) SELECT * FROM neuramark_cost_policies WHERE client_id = $clientId LIMIT 1
  // 2) ELSE SELECT global WHERE client_id IS NULL LIMIT 1 (reuse getDefaultCostPolicy mapping)
  // 3) Zod costPolicyRowSchema; missing/invalid → { ok: false, code: COST_POLICY_UNAVAILABLE }
}
```

| Rule | Detail |
|------|--------|
| Authority | **Only** application path for effective policy on spend/settings reads |
| Fallback | Client row wins; else global seed row |
| `getDefaultCostPolicy()` | **Retained** global-only helper; orchestrators **switch** to `getCostPolicyForClient` in gated paths |
| Cache | Per-request `cache()` OK; **no** cross-request cache of mutable policy |
| `rules` | Read from DB; V1 always `null` in practice; **not** accepted from generate requests |

---

## Cumulative spend — `sumReelCumulativeCostCents` (**new**)

**File (BUILD):** `lib/cost-policy/sum-reel-cumulative-cost-cents.ts` (`import "server-only"`)

```ts
export async function sumReelCumulativeCostCents(
  reelScriptId: string,
): Promise<number> {
  // SELECT COALESCE(SUM(estimated_cost_cents), 0)::int
  // FROM neuramark_reel_spend_events
  // WHERE reel_script_id = $reelScriptId
  // Cast/check Number.isSafeInteger; if not → throw / fail closed in gate
}
```

| Source | In V1 BUILD | Future |
|--------|-------------|--------|
| `neuramark_reel_spend_events` | **Yes** — script + caption LLM events | Video/TTS/B-roll rows (US-8.x / US-9.3) |
| `neuramark_video_jobs` | **No** — table not shipped | US-8.x adds spend events or SUM extension |
| US-4.1 strategy LLM | **Excluded** — not per `reel_script_id` | — |

**Gate comparison:** `cumulativeCostCents + estimatedCostCents > maxCostCents` via `wouldExceedBudget`.

**US-7.3 note:** `actual_cost_cents` nullable on spend events; cumulative gate V1 uses **`estimated_cost_cents` only**.

---

## LLM estimate — `estimateLlmJobCost` (**new**)

**File (BUILD):** `lib/cost-policy/estimate-llm-job-cost.ts` (`import "server-only"`)

```ts
export type EstimateLlmJobCostInput = {
  clientId: string;
  providerTier: ProviderTier;
  llmVariant: LlmVariant; // "default" | "fallback"
};

export type EstimateLlmJobCostResult =
  | {
      ok: true;
      estimatedCostCents: number;
      providerKey: string;
      resolvedLlmProviderLabel: string; // catalog display name — CONTRACT: key → label map server-side
    }
  | { ok: false; code: "PROVIDER_UNAVAILABLE" };

export async function estimateLlmJobCost(
  input: EstimateLlmJobCostInput,
): Promise<EstimateLlmJobCostResult> {
  // getProviderCatalog() + resolveProvider({ assetRole: "llm", tier, llmVariant })
  // adapter.estimateCost(...) — same path used for gate and preview
  // No active provider for tier → PROVIDER_UNAVAILABLE (fail closed)
}
```

| Rule | Detail |
|------|--------|
| US-7.2 handoff | When 7.2 ships, this helper may delegate ranking — **same estimator** for preview + gate |
| Blocking math V1 | **LLM script/caption only** |
| Projection | `visual_mode` + `modalidad` + b-roll beats → **`projectionHintKey`** only (not in blocking sum) |

**Provider display labels (V1 frozen map — no `envKeyName` to browser):**

| `provider_key` | `resolvedLlmProviderLabel` |
|----------------|---------------------------|
| `siliconflow_deepseek_flash` | `DeepSeek Flash` |
| `siliconflow_qwen` | `Qwen 2.5` |
| *(future active high-tier llm rows)* | Humanized `key` or catalog metadata field added in US-7.2 |

---

## Budget gate — `assertReelBudgetAllowsSpend` (**new**)

**File (BUILD):** `lib/cost-policy/assert-reel-budget-allows-spend.ts` (`import "server-only"`)

```ts
export const reelSpendJobKindSchema = z.enum([
  "script_generate",
  "script_regenerate",
  "caption_generate",
  "caption_regenerate",
]);

export type AssertReelBudgetAllowsSpendInput = {
  clientId: string;
  reelScriptId: string;
  jobKind: z.infer<typeof reelSpendJobKindSchema>;
  operatorClientId: string; // from requireOperator().id
  budgetOverride?: true;
  overrideReason?: string;
};

export type AssertReelBudgetAllowsSpendResult =
  | {
      ok: true;
      estimatedCostCents: number;
      cumulativeCostCents: number;
      maxCostCents: number;
      providerTier: ProviderTier;
      didOverride: boolean;
    }
  | {
      ok: false;
      code: "BUDGET_EXCEEDED" | "COST_POLICY_UNAVAILABLE" | "PROVIDER_UNAVAILABLE" | "VALIDATION_ERROR";
      cumulativeCostCents?: number;
      estimatedCostCents?: number;
      maxCostCents?: number;
    };
```

**Flow:**

1. `getCostPolicyForClient(clientId)` → fail → `COST_POLICY_UNAVAILABLE`
2. Verify `reel_script_id` belongs to `clientId` (IDOR → treat as not found at action layer)
3. `estimateLlmJobCost` for this job kind → fail → `PROVIDER_UNAVAILABLE`
4. `sumReelCumulativeCostCents(reelScriptId)`
5. If `wouldExceedBudget(...)`:
   - If **no** `budgetOverride: true` → INSERT audit `blocked` → return `BUDGET_EXCEEDED`
   - If `budgetOverride: true` → require `overrideReason` (1–500 chars) → INSERT audit `override_proceed` → continue
6. Return `ok: true` with numbers

| Rule | Detail |
|------|--------|
| Placement | **Immediately before** LLM adapter `complete()` — after profile/strategy gates |
| Override scope | **Per mutation attempt** — not permanent; each blocked generate needs fresh override |
| `budgetOverride: true` when under cap | **Allowed** — no override audit; `didOverride: false` |
| `budgetOverride` without reason when over cap | **`VALIDATION_ERROR`** on `overrideReason` |
| System/cron (`invokedBy: "system"`) | Gate runs; **no** `budgetOverride` from client — block + audit only |

**Alias:** `checkReelBudget` in TASKS sketches = **`assertReelBudgetAllowsSpend`** (canonical name frozen here).

---

## Spend ledger — `recordReelSpendEvent` (**new**)

**File (BUILD):** `lib/cost-policy/record-reel-spend-event.ts` (`import "server-only"`)

```ts
export async function recordReelSpendEvent(params: {
  clientId: string;
  reelScriptId: string;
  assetRole: "llm";
  jobKind: z.infer<typeof reelSpendJobKindSchema>;
  estimatedCostCents: number;
  actualCostCents?: null; // always null in V1
  operatorClientId: string;
  providerKey: string;
}): Promise<void> {
  // INSERT neuramark_reel_spend_events — after successful LLM only
}
```

| Rule | Detail |
|------|--------|
| Timing | **After** successful LLM completion — **not** on blocked attempts |
| Failed LLM | No spend row; optional `blocked` audit only if gate failed earlier |

---

## Operator DTOs (minimal allowlist — frozen)

### `OperatorCostSettingsDto`

```ts
export const operatorCostSettingsDtoSchema = z
  .object({
    global: z.object({
      maxCostCents: z.number().int().positive(),
      providerTier: providerTierSchema,
      updatedAt: z.string().datetime({ offset: true }),
    }),
    clientOverride: z
      .object({
        maxCostCents: z.number().int().positive(),
        providerTier: providerTierSchema,
        updatedAt: z.string().datetime({ offset: true }),
      })
      .nullable(),
    effective: z.object({
      scope: z.enum(["global", "client"]),
      maxCostCents: z.number().int().positive(),
      providerTier: providerTierSchema,
    }),
    resolvedLlmProviderLabel: z.string().min(1),
    highTierWarningKey: z.literal("settings.costPolicy.highTierInactiveWarning").optional(),
  })
  .strict();
```

**Forbidden in Operator settings response:** `envKeyName`, full `costModel`, `capabilities`, raw `rules` jsonb, catalog row ids, internal policy UUID (unless CONTRACT later needs — **V1 omit**).

### `ReelBudgetPreview` (single slot — ConfirmDialog)

```ts
export const projectionHintKeySchema = z.enum([
  "faceless_broll_later",
  "own_avatar_video_later",
  "generic_avatar_video_later",
]);

export const reelBudgetPreviewSchema = z
  .object({
    reelScriptId: z.string().uuid(),
    slotIndex: z.number().int().min(0).max(6),
    jobKind: reelSpendJobKindSchema,
    estimatedCostCents: z.number().int().nonnegative(),
    cumulativeCostCents: z.number().int().nonnegative(),
    maxCostCents: z.number().int().positive(),
    remainingCents: z.number().int().nonnegative(),
    providerTier: providerTierSchema,
    resolvedLlmProviderLabel: z.string().min(1),
    visualMode: visualModeSchema,
    modalidad: visualModalitySchema,
    projectionHintKey: projectionHintKeySchema.nullable(),
    wouldExceed: z.boolean(),
  })
  .strict();
```

**Projection hint rules (server-derived, read-only):**

| Condition | `projectionHintKey` |
|-----------|---------------------|
| `modalidad === "faceless"` or script has `brollBeats` | `faceless_broll_later` |
| `visualMode === "own_avatar"` | `own_avatar_video_later` |
| `visualMode === "generic_avatar"` | `generic_avatar_video_later` |
| else | `null` |

### `ReelBudgetBatchPreview`

```ts
export const reelBudgetBatchPreviewSchema = z
  .object({
    weekStart: trendWeekStartSchema,
    jobKind: z.enum(["script_generate", "caption_generate"]),
    items: z.array(reelBudgetPreviewSchema).min(1),
    wouldExceedAny: z.boolean(),
    blockedSlotIndexes: z.array(z.number().int().min(0).max(6)),
    aggregateEstimatedCostCents: z.number().int().nonnegative(),
  })
  .strict();
```

| Batch rule | Detail |
|------------|--------|
| Per-slot cap | Each item compares **its** `reel_script_id` cumulative vs **same** resolved `maxCostCents` |
| `wouldExceedAny` | `true` if any item `wouldExceed` |
| `blockedSlotIndexes` | Slots where `wouldExceed` |
| `aggregateEstimatedCostCents` | Sum of per-slot `estimatedCostCents` (display only — **not** compared to single cap) |
| Batch generate server | If **any** target slot would exceed and **no** `budgetOverride` → **fail entire batch** with `BUDGET_EXCEEDED` + `blockedSlotIndexes` in error metadata |
| Batch with override | `budgetOverride: true` + `overrideReason` → audit **per exceeded slot**; then process all targets |

---

## Server Actions

### `getCostPolicyForSettings` (**new**)

**File (BUILD):** `lib/cost-policy/actions/get-cost-policy-for-settings.ts`  
**Consumer:** `/operator/settings/cost-policy` page load  
**Gate:** `requireOperator("handler")` first  
**Tenancy:** `clientId = operator.id` (V1 single-tenant operator session)

**Success:** `{ ok: true, settings: OperatorCostSettingsDto }`  
**Errors:** `UNAUTHENTICATED`, `FORBIDDEN`, `COST_POLICY_UNAVAILABLE`, `INTERNAL_ERROR`

---

### `updateGlobalCostPolicy` (**new**)

**File (BUILD):** `lib/cost-policy/actions/update-global-cost-policy.ts`  
**Consumer:** settings form — save global defaults

```ts
export const updateGlobalCostPolicyInputSchema = z
  .object({
    maxCostCents: z.number().int().min(1).max(MAX_COST_CENTS_CEILING),
    providerTier: providerTierSchema,
  })
  .strict();
```

**Flow:** `requireOperator` → parse → UPDATE `neuramark_cost_policies` WHERE `client_id IS NULL` → INSERT audit `policy_updated` with metadata `{ scope: "global", previous, next }` → `revalidatePath("/operator/settings/cost-policy")`

**Rejects:** `clientId` in body → `FORBIDDEN_FIELDS`

---

### `updateClientCostPolicyOverride` (**new**)

**File (BUILD):** `lib/cost-policy/actions/update-client-cost-policy-override.ts`  
**Consumer:** settings — “Custom budget for this client” section

```ts
export const updateClientCostPolicyOverrideInputSchema = z
  .object({
    enabled: z.boolean(),
    maxCostCents: z.number().int().min(1).max(MAX_COST_CENTS_CEILING).optional(),
    providerTier: providerTierSchema.optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.enabled && (val.maxCostCents === undefined || val.providerTier === undefined)) {
      ctx.addIssue({ code: "custom", message: "maxCostCents and providerTier required when enabled" });
    }
  });
```

| `enabled` | Action |
|-----------|--------|
| `false` | DELETE row WHERE `client_id = operator.id` if exists |
| `true` | UPSERT per-client row (`ON CONFLICT (client_id)`) |

**Tenancy:** target `client_id` = **`operator.id` only** in V1 — no cross-tenant UUID in request.  
**Audit:** `policy_updated` with `{ scope: "client", clientId, previous, next }`

---

### `getReelBudgetPreview` (**new**)

**File (BUILD):** `lib/cost-policy/actions/get-reel-budget-preview.ts`  
**Consumer:** `/operator/scripts` ConfirmDialog before generate/regenerate

```ts
export const getReelBudgetPreviewInputSchema = z
  .object({
    weekStart: trendWeekStartSchema,
    jobKind: z.enum(["script_generate", "caption_generate"]),
    mode: z.enum(["batch", "slot"]),
    slotIndex: z.number().int().min(0).max(6).optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.mode === "slot" && val.slotIndex === undefined) {
      ctx.addIssue({ code: "custom", message: "slotIndex required when mode is slot" });
    }
  });
```

**Gate:** `requireOperator("handler")`  
**Flow:** resolve approved strategy → resolve target slot(s) → load/create-path `reel_script_id` per slot → build `ReelBudgetPreview` per slot → return batch or single wrapper

**Success (slot):** `{ ok: true, preview: ReelBudgetPreview }`  
**Success (batch):** `{ ok: true, preview: ReelBudgetBatchPreview }`

**Does not:** call LLM; accept client cost numbers

---

## Extended generate/regenerate actions

### Input schema extension (all four actions)

```ts
const budgetOverrideFieldsSchema = z.object({
  budgetOverride: z.literal(true).optional(),
  overrideReason: z.string().trim().min(OVERRIDE_REASON_MIN_LENGTH).max(OVERRIDE_REASON_MAX_LENGTH).optional(),
});

// Merged with existing weekStart / slotIndex schemas via .merge() — stay .strict()
```

**SuperRefine:** when `budgetOverride: true` and preview would exceed for any targeted slot → `overrideReason` **required**.

### Strip vs reject (spend paths)

**New forbidden keys** (add to `findForbiddenReelScriptKeys` and `findForbiddenReelCaptionKeys`):

| Keys | Behavior |
|------|----------|
| `maxCostCents`, `max_cost_cents`, `providerTier`, `provider_tier`, `tier` | **Reject** → `FORBIDDEN_FIELDS` |
| `estimatedCostCents`, `estimated_cost_cents`, `cumulativeCostCents`, `cumulative_cost_cents` | **Reject** |
| `budgetCap`, `policyId`, `policy_id`, `rules` | **Reject** |
| `skipBudgetCheck`, `skip_budget_check`, `overrideBudget`, `override_budget` | **Reject** — use frozen `budgetOverride` only |
| `budgetOverride` | **Accept** — `z.literal(true)` optional only |
| `overrideReason` | **Accept** — when provided |
| `confirmGeneration`, `confirm_generation` | **Reject** — UI convenience not in schema (gate always runs) |

### New error codes (script + caption envelopes)

| Code | When | `messageKey` |
|------|------|--------------|
| `BUDGET_EXCEEDED` | Gate block without override | `scripts.budget.errors.exceeded` |
| `COST_POLICY_UNAVAILABLE` | Policy load fail | `scripts.budget.errors.policyUnavailable` |
| `POLICY_VALIDATION_ERROR` | Settings bounds fail | `settings.costPolicy.errors.validation` |

Extend `reelScriptErrorCodeSchema` and `reelCaptionErrorCodeSchema` accordingly.

**`BUDGET_EXCEEDED` error shape (batch):**

```ts
{
  ok: false,
  error: {
    code: "BUDGET_EXCEEDED",
    messageKey: "scripts.budget.errors.exceeded",
    blockedSlotIndexes?: number[],
    previews?: ReelBudgetPreview[], // slots that would exceed — Operator-only
  }
}
```

---

## Orchestrator integration (call sites — frozen)

| Orchestrator | When | Gate `jobKind` | Spend event after success |
|--------------|------|----------------|---------------------------|
| `generateReelScriptsForClient` (batch) | Per slot before LLM | `script_generate` | `script_generate` |
| `generateReelScriptsForClient` (slot) | Before LLM | `script_regenerate` | `script_regenerate` |
| `generateReelCaptionsForClient` (batch) | Per slot before LLM | `caption_generate` | `caption_generate` |
| `generateReelCaptionsForClient` (slot) | Before LLM | `caption_regenerate` | `caption_regenerate` |

**Batch fail-entire:** loop slots in deterministic slotIndex order; on first `BUDGET_EXCEEDED` without batch-level override, **abort entire batch** — no partial LLM calls. When `budgetOverride: true` on batch action, evaluate all slots first; audit each exceeded slot; then run all LLM jobs.

**Replace:** `getDefaultCostPolicy()` → `getCostPolicyForClient(clientId)` for tier resolution in these orchestrators.

**Pass-through from actions:** `budgetOverride`, `overrideReason`, `operatorClientId` into orchestrator params.

**Downstream reuse (documented, not built in 7.1):**

| Story | Integration |
|-------|-------------|
| US-8.2+ | Call `assertReelBudgetAllowsSpend` before video job create; `recordReelSpendEvent` with `asset_role` `talking_head` / `broll` |
| US-8.3 manual | Skip gate / zero estimate for `provider_key = manual` |
| US-8.4 retry | Same gate on retry handler |
| US-9.3 TTS | `asset_role: "tts"` spend events |
| US-7.2 | Replace `estimateLlmJobCost` internals with ranked provider selection |

---

## Database

### Migration — `neuramark_reel_spend_events`

**File (frozen):** `supabase/migrations/20260830510000_neuramark_reel_spend_events.sql`

```sql
CREATE TABLE public.neuramark_reel_spend_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            uuid NOT NULL
                         REFERENCES public.neuramark_clients (id) ON DELETE CASCADE,
  reel_script_id       uuid NOT NULL
                         REFERENCES public.neuramark_reel_scripts (id) ON DELETE CASCADE,
  asset_role           text NOT NULL,
  job_kind             text NOT NULL,
  estimated_cost_cents integer NOT NULL,
  actual_cost_cents    integer NULL,
  provider_key         text NOT NULL,
  operator_client_id   uuid NOT NULL
                         REFERENCES public.neuramark_clients (id) ON DELETE RESTRICT,
  created_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT neuramark_reel_spend_events_asset_role_chk
    CHECK (asset_role IN ('llm', 'tts', 'talking_head', 'broll')),
  CONSTRAINT neuramark_reel_spend_events_estimated_nonneg_chk
    CHECK (estimated_cost_cents >= 0),
  CONSTRAINT neuramark_reel_spend_events_actual_nonneg_chk
    CHECK (actual_cost_cents IS NULL OR actual_cost_cents >= 0)
);

CREATE INDEX neuramark_reel_spend_events_reel_script_id_idx
  ON public.neuramark_reel_spend_events (reel_script_id);

CREATE INDEX neuramark_reel_spend_events_client_reel_idx
  ON public.neuramark_reel_spend_events (client_id, reel_script_id);

ALTER TABLE public.neuramark_reel_spend_events ENABLE ROW LEVEL SECURITY;
```

### Migration — `neuramark_budget_audit_log`

**File (frozen):** `supabase/migrations/20260830510100_neuramark_budget_audit_log.sql`

```sql
CREATE TABLE public.neuramark_budget_audit_log (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type            text NOT NULL,
  client_id             uuid NOT NULL
                          REFERENCES public.neuramark_clients (id) ON DELETE CASCADE,
  reel_script_id        uuid NULL
                          REFERENCES public.neuramark_reel_scripts (id) ON DELETE SET NULL,
  operator_client_id    uuid NOT NULL
                          REFERENCES public.neuramark_clients (id) ON DELETE RESTRICT,
  estimated_cost_cents  integer NULL,
  cumulative_cost_cents integer NULL,
  max_cost_cents        integer NULL,
  provider_tier         text NULL,
  override_reason       text NULL,
  metadata              jsonb NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT neuramark_budget_audit_log_event_type_chk
    CHECK (event_type IN ('blocked', 'override_proceed', 'policy_updated')),
  CONSTRAINT neuramark_budget_audit_log_provider_tier_chk
    CHECK (provider_tier IS NULL OR provider_tier IN ('low', 'high'))
);

CREATE INDEX neuramark_budget_audit_log_client_created_idx
  ON public.neuramark_budget_audit_log (client_id, created_at DESC);

CREATE INDEX neuramark_budget_audit_log_reel_script_idx
  ON public.neuramark_budget_audit_log (reel_script_id)
  WHERE reel_script_id IS NOT NULL;

ALTER TABLE public.neuramark_budget_audit_log ENABLE ROW LEVEL SECURITY;
```

| `event_type` | When | `reel_script_id` |
|--------------|------|------------------|
| `blocked` | Gate deny without override | Set |
| `override_proceed` | `budgetOverride: true` on exceeded attempt | Set |
| `policy_updated` | Global or client policy write | NULL |

**Append-only:** no UPDATE/DELETE on audit rows in V1.

### Migration — per-client policy unique index

**File (frozen):** `supabase/migrations/20260830510200_neuramark_cost_policies_client_unique.sql`

```sql
CREATE UNIQUE INDEX neuramark_cost_policies_one_per_client_idx
  ON public.neuramark_cost_policies (client_id)
  WHERE client_id IS NOT NULL;
```

**No change** to US-X.4 global seed (`low` / `150`).

---

## State transitions

### Effective policy scope

| State | Resolution |
|-------|------------|
| No client row | Global default |
| Client override row exists | Client row values |
| Override deleted | Revert to global |

### Budget gate (per Reel attempt)

```
[preview] → (Operator confirms) → [assertReelBudgetAllowsSpend]
  → ok → LLM → [recordReelSpendEvent]
  → BUDGET_EXCEEDED → audit blocked → stop
  → override path → audit override_proceed → LLM → record spend
```

---

## Fixtures

### `getReelBudgetPreview` — single slot (script regenerate)

**Request:**

```json
{
  "weekStart": "2026-01-05",
  "jobKind": "script_generate",
  "mode": "slot",
  "slotIndex": 0
}
```

**Response:**

```json
{
  "ok": true,
  "preview": {
    "reelScriptId": "11111111-1111-4111-8111-111111111111",
    "slotIndex": 0,
    "jobKind": "script_regenerate",
    "estimatedCostCents": 1,
    "cumulativeCostCents": 149,
    "maxCostCents": 150,
    "remainingCents": 1,
    "providerTier": "low",
    "resolvedLlmProviderLabel": "DeepSeek Flash",
    "visualMode": "faceless",
    "modalidad": "faceless",
    "projectionHintKey": "faceless_broll_later",
    "wouldExceed": true
  }
}
```

### `generateReelScripts` — budget exceeded

**Request:** `{ "weekStart": "2026-01-05" }` (batch, one slot would exceed)

**Response:**

```json
{
  "ok": false,
  "error": {
    "code": "BUDGET_EXCEEDED",
    "messageKey": "scripts.budget.errors.exceeded",
    "blockedSlotIndexes": [0]
  }
}
```

### `regenerateReelScriptSlot` — override proceed

**Request:**

```json
{
  "weekStart": "2026-01-05",
  "slotIndex": 0,
  "budgetOverride": true,
  "overrideReason": "Cliente deadline — aprobar sobrecosto puntual."
}
```

**Response:** existing success envelope from US-5.1; audit row `override_proceed` inserted server-side.

### `updateGlobalCostPolicy`

**Request:**

```json
{
  "maxCostCents": 200,
  "providerTier": "low"
}
```

**Response:**

```json
{
  "ok": true,
  "settings": {
    "global": { "maxCostCents": 200, "providerTier": "low", "updatedAt": "2026-01-06T12:00:00.000Z" },
    "clientOverride": null,
    "effective": { "scope": "global", "maxCostCents": 200, "providerTier": "low" },
    "resolvedLlmProviderLabel": "DeepSeek Flash"
  }
}
```

### Forbidden — crafted estimate on generate

**Request:**

```json
{
  "weekStart": "2026-01-05",
  "estimatedCostCents": 0
}
```

**Response:**

```json
{
  "ok": false,
  "error": {
    "code": "FORBIDDEN_FIELDS",
    "messageKey": "scripts.errors.forbiddenFields"
  }
}
```

---

## Unit test matrix (frozen)

**File (BUILD):** `lib/cost-policy/cost-policy.test.ts`

| # | Area | Expected |
|---|------|----------|
| 1 | `getCostPolicyForClient` | Client row wins over global |
| 2 | `getCostPolicyForClient` | Missing global → `COST_POLICY_UNAVAILABLE` |
| 3 | `sumReelCumulativeCostCents` | Sums across script + caption events |
| 4 | `wouldExceedBudget` / `safeAddCents` | Overflow → exceed / null |
| 5 | `assertReelBudgetAllowsSpend` | Under cap → ok, no audit |
| 6 | `assertReelBudgetAllowsSpend` | Over cap → `BUDGET_EXCEEDED` + `blocked` audit |
| 7 | `assertReelBudgetAllowsSpend` | Override + reason → `override_proceed` audit + ok |
| 8 | Override | Missing `overrideReason` when over cap → `VALIDATION_ERROR` |
| 9 | Batch orchestrator | One slot exceeds → entire batch fails without override |
| 10 | Forbidden keys | `estimatedCostCents` on generate → `FORBIDDEN_FIELDS` |
| 11 | Settings | Non-operator → 403 |
| 12 | Settings | `maxCostCents > MAX_COST_CENTS_CEILING` → validation error |
| 13 | Global write | Cannot set `clientId` |
| 14 | Client override | UPSERT + delete on `enabled: false` |
| 15 | Preview DTO | Never includes `envKeyName` |
| 16 | Spend event | Insert only after successful LLM |
| 17 | High tier inactive | `PROVIDER_UNAVAILABLE` when no active llm row |

---

## Security (binding summary)

1. **Gate:** `assertReelBudgetAllowsSpend` in orchestrator **before** LLM — UI confirm is non-authoritative.
2. **Policy:** `getCostPolicyForClient` only path for effective cap/tier on spend.
3. **Forbidden fields:** extended lists on script + caption actions.
4. **Settings writes:** `requireOperator("handler")` first; global vs client actions separated.
5. **Override:** audit `override_proceed` with `override_reason` before proceed.
6. **Block:** audit `blocked` on deny.
7. **RLS:** deny-by-default on new tables; service-role Node only.
8. **Cliente:** 403 on all cost surfaces; no cost fields on shared Reel list payloads.
9. **Overflow:** `safeAddCents` fail closed.
10. **No bypass flags** in production paths.

---

## Out of scope (explicit)

| Item | Owner |
|------|-------|
| US-7.2 full policy engine / per-asset ranking | US-7.2 |
| Video job budget gate | US-8.x |
| TTS spend events | US-9.3 |
| Actual cost backfill | US-7.3 |
| Reel cost roll-up UI | US-7.4 |
| Content strategy LLM gate | — |
| Catalog CRUD | US-X.4 SQL-only |
| `reel_production_status = budget_blocked` column | Future / integrations |
| Cliente cost visibility | — |

---

## FE signoff

- [ ] **Reviewed by FE** — `/operator/settings/cost-policy` form; `/operator/scripts` ConfirmDialog with `getReelBudgetPreview`; override UX; EN/ES `settings.costPolicy.*` + `scripts.budget.*`; batch blocked slot list.

**Reviewed by FE:** _(pending)_
