# API Contract — US-7.2 Select provider by economics and quality floor

**Story:** US-7.2  
**Status:** Frozen — 2026-08-30 (awaiting FE signoff)  
**Security:** `plan/stories/US-7.2/SECURITY.md` (APPROVE WITH CONDITIONS — reconciled below)  
**Spec review:** `plan/stories/US-7.2/SPEC-REVIEW.md` (GAPS — resolved by this contract)  
**Depends on:** US-7.1 ✅ budget gate + `estimateLlmJobCost` · US-X.4 ✅ catalog + `resolveProvider` · US-3.1 ✅ `visual_mode` + slot `modalidad` · US-5.1 ✅ scripts + b-roll beats · US-14.5 ✅ `requireOperator()`  
**Identity seam:** `lib/auth/get-current-user.ts` / `requireOperator()` (unchanged)  
**Feature branch:** `feature/US-7.2-provider-ranking`  
**Error envelope style:** same class as US-7.1 (`ok: true` vs `{ ok: false, error: { code, fields?, messageKey? } }`)

**This document is CONTRACT ONLY.** Zod below is the BUILD sketch for `lib/contracts/provider-decisions.ts`, extensions to `lib/contracts/providers.ts` and `lib/contracts/cost-policy.ts`, new modules under `lib/providers/` and `lib/cost-policy/`, one migration, and targeted orchestrator wiring.

**Terminology:** **Política de costo** · **Nivel de proveedor** (`low` \| `high`) · **modalidad de producción** · **Operator** · **Reel** · **Paquete de guion** · **recomendación de proveedor**. Technical enums (`assetRole`, `rationaleKey`) OK in code/DB. Do **not** use CONTEXT _Evitar_ terms in product-facing strings.

**Naming freeze:** Canonical policy-engine export is **`resolveProviderForJob`**. README/TASKS alias **`resolveProviderDecision`** and SPEC-REVIEW alias **`selectProviderForJob`** refer to the **same function** — BUILD uses `resolveProviderForJob` only.

---

## SPEC-REVIEW blocking gaps closed

| # | Gap | Resolution |
|---|-----|------------|
| 1 | Per-job decision log schema undefined | **`neuramark_provider_decisions`** append-only table; `logProviderDecision()` INSERT on successful LLM jobs in BUILD; seam for US-8.x |
| 2 | Cheapest active not implemented | **`rankCatalogCandidatesByCost`** after capability filters in **`resolveProvider`**; sort `unitCostCents` ASC, tie-break `key` lexicographic |
| 3 | No frozen policy-engine module | **`resolveProviderForJob`** (`import "server-only"`) — sole assigner of `providerKey` + estimate + `rationaleKey` |
| 4 | Modalidad → asset-role routing incomplete | Frozen routing matrix (§ Modalidad routing); server loads profile + strategy slot + script row — never client authority |
| 5 | Operator rationale DTO unspecified | **`OperatorProviderRecommendationComponentDto`** with **`rationaleKey`** closed enum → FE i18n (`scripts.providerRecommendation.*`) |
| 6 | Client `providerKey` in contract schemas | Client-boundary schemas **omit** `providerKey` / `providerTier`; internal server types set key after engine |
| 7 | Multi-asset estimate hook for budget gate | US-7.1 gate stays **LLM-blocking** in BUILD; engine supplies video/TTS/B-roll **projections** + US-8.x call-site table |
| 8 | Duration/clip-aware estimates unset | Frozen projection inputs: `targetDurationSec` (playbook default 30), `brollClipCount` (from `brollBeats.length`, min 1 when broll included) |
| 9 | High tier inactive | **No tier downgrade** — `PROVIDER_UNAVAILABLE` + `rationaleKey: "high_tier_inactive"` |
| 10 | Manual fallback | **`manual`** excluded from auto-rank; footnote `manualFallbackNoteKey` on recommendation DTO |

## SECURITY reconciliation (binding)

| Topic | SECURITY condition | **Frozen in this contract** |
|-------|-------------------|----------------------------|
| Policy engine | Single `import "server-only"` module | **`lib/providers/resolve-provider-for-job.ts`** exports **`resolveProviderForJob`** |
| Forbidden fields | Reject provider/tier/estimate authority | **`FORBIDDEN_PROVIDER_AUTHORITY_KEYS`** merged into script/caption forbidden-key helpers |
| Tier lock | From `getCostPolicyForClient` only | Engine input type has **no** `providerTier` from handlers — loaded inside `resolveProviderForJob` |
| Visual/loop context | Server-loaded only | **`buildReelProductionContext`** helper resolves `visualMode`, `modalidad`, `hasReferenceLoop`, `needsBroll` from DB |
| Operator DTO | Minimal allowlist | `displayLabel`, `providerTier`, `estimatedCostCents`, `rationaleKey`, optional `providerKey` (Operator support only) |
| Decision log | Append-only, no secrets | `rationale_key` enum only; never full `cost_model` / `envKeyName` |
| Catalog writes | None in V1 | **Zero** INSERT/UPDATE/DELETE on `neuramark_provider_catalog` in US-7.2 BUILD |
| Cheapest-active | Deterministic comparator | `rankCatalogCandidatesByCost` on validated `costModel.unitCostCents` |

---

## Overview

The **System** selects the cheapest **active** catalog provider per **asset role** at the effective **provider tier**, driven by **modalidad de producción** + profile **modo visual** + script metadata. Operators see **read-only recomendación de proveedor** on **`/operator/scripts`**; successful LLM jobs append a row to **`neuramark_provider_decisions`**.

1. **`getCostPolicyForClient(clientId)`** → effective `providerTier`.
2. **`buildReelProductionContext(...)`** → server-trusted `visualMode`, `modalidad`, `hasReferenceLoop`, `needsBroll`, duration, b-roll clip count.
3. **`resolveProviderForJob(input)`** → catalog + ranked `resolveProvider` + adapter `estimateCost` → **`ProviderDecision`**.
4. **`estimateLlmJobCost`** **delegates** to step 3 (`assetRole: "llm"`).
5. **`getReelProviderRecommendations`** → multi-role projection per slot (read-only).
6. **`logProviderDecision`** → INSERT after successful LLM I/O alongside **`recordReelSpendEvent`**.

**V1 blocking gate:** US-7.1 **`assertReelBudgetAllowsSpend`** remains **LLM-only**. Video/TTS/B-roll rows in recommendations are **projected** (not blocking) until US-8.x wires gate.

**Surfaces**

| # | Surface | Kind | New vs reused |
|---|---------|------|---------------|
| 1 | `/operator/scripts` recommendation panel | FE | **New** — expand row per slot |
| 2 | `ReelBudgetConfirmDialog` | FE | **Extended** — LLM recommendation line + `rationaleKey` |
| 3 | `getReelProviderRecommendations` | Server Action | **New** — batch or single slot |
| 4 | `resolveProviderForJob` | Server helper | **New** — policy engine |
| 5 | `buildReelProductionContext` | Server helper | **New** — trusted routing inputs |
| 6 | `rankCatalogCandidatesByCost` | Server helper | **New** — sort helper |
| 7 | `resolveProvider` | Server helper | **Extended** — cost ranking |
| 8 | `estimateLlmJobCost` | Server helper | **Refactored** — delegates to engine |
| 9 | `logProviderDecision` | Server helper | **New** — decision log INSERT |
| 10 | `resolveProviderDisplayLabel` | Server helper | **New** — generalizes `resolveLlmProviderLabel` |
| 11 | Script/caption orchestrators | Orchestrator | **Extended** — `logProviderDecision` after success |
| 12 | `lib/contracts/provider-decisions.ts` | Zod + types | **New** |
| 13 | Migration | `neuramark_provider_decisions` | **New** |

**Forbidden surfaces (BUILD veto):**

- Client-supplied `providerKey`, `providerTier`, `assetRole`, `estimatedCostCents`, `allowManualFallback`, catalog ids on any spend or job-create path.
- Catalog write Server Actions / Route Handlers.
- Cliente routes exposing provider or cost recommendation data.
- Tier downgrade when high-tier rows inactive.
- Auto-selection of `manual` catalog row.

---

## Frozen constants

```ts
/** Default Reel duration for per-second / projection estimates (seconds). */
export const DEFAULT_REEL_DURATION_SEC = 30 as const;

/** Default single B-roll clip duration when beat metadata lacks per-clip sec (seconds). */
export const DEFAULT_BROLL_CLIP_SEC = 5 as const;

/** Footnote i18n key on every recommendation DTO. */
export const MANUAL_FALLBACK_NOTE_KEY = "manual_upload_available" as const;
```

---

## Cheapest-active ranking — `rankCatalogCandidatesByCost` (**new**)

**File (BUILD):** `lib/providers/rank-catalog-candidates-by-cost.ts` (`import "server-only"`)

Applied **inside** `resolveProvider` **after** capability filters (`active`, tier, assetRole, manual exclusion, loop preference, LLM variant key match) and **before** returning the winner.

```ts
export function rankCatalogCandidatesByCost(
  candidates: readonly ProviderCatalogRow[],
): ProviderCatalogRow[] {
  return [...candidates].sort((a, b) => {
    const costDiff = a.costModel.unitCostCents - b.costModel.unitCostCents;
    if (costDiff !== 0) return costDiff;
    return a.key.localeCompare(b.key); // stable tie-break
  });
}
```

| Rule | Detail |
|------|--------|
| Comparator | **`costModel.unitCostCents`** ascending (same `billingUnit` within role+tier in V1 seed) |
| Tie-break | **`key`** lexicographic ASC |
| Inactive | Already excluded before ranking |
| LLM variant | Variant key filter runs **before** rank; rank applies within variant-eligible set |
| Loop preference | MuseTalk preference filter runs **before** rank among `talking_head` candidates |
| Manual | Rows with `capabilities.manualFallback === true` excluded unless `allowManualFallback: true` (US-8.3 only) |

**`resolveProvider` change:** replace `return resolvedCandidates[0]` with `return rankCatalogCandidatesByCost(resolvedCandidates)[0]` (after LLM variant branch returns early when matched).

---

## Modalidad routing — `buildReelProductionContext` (**new**)

**File (BUILD):** `lib/cost-policy/build-reel-production-context.ts` (`import "server-only"`)

Loads trusted state only. Client may pass **`reelScriptId`**, **`clientId`**, **`weekStart`**, **`slotIndex`** — never `visualMode` / `modalidad` / `hasReferenceLoop` as authority.

```ts
export type ReelProductionContext = {
  clientId: string;
  reelScriptId: string | null;
  slotIndex: number;
  visualMode: VisualMode;
  modalidad: VisualModality;
  hasReferenceLoop: boolean;
  needsBroll: boolean;
  targetDurationSec: number;
  brollClipCount: number;
  providerTier: ProviderTier; // from getCostPolicyForClient
};
```

### Frozen routing matrix

| Condition | `talking_head` | `broll` | `tts` | `llm` |
|-----------|----------------|---------|-------|-------|
| `modalidad === "faceless"` OR profile `visualMode === "faceless"` | **No** | **Yes** | **Yes** | **Yes** (2 rows: default + fallback when projecting both script+caption paths) |
| `own_avatar` | **Yes** (`hasReferenceLoop: false`) | If `needsBroll` | **Yes** | Per job |
| `generic_avatar` + reference loop asset exists | **Yes** (`hasReferenceLoop: true` → MuseTalk when cheapest loop row) | If `needsBroll` | **Yes** | Per job |
| `generic_avatar` without loop | **Yes** (`hasReferenceLoop: false`) | If `needsBroll` | **Yes** | Per job |

**`needsBroll`:** `true` when slot `modalidad === "faceless"` **OR** script package `brollBeats.length > 0`.

**`hasReferenceLoop`:** `true` when profile `visualMode === "generic_avatar"` **and** a reference-loop media asset exists for the client (US-3.1 / media assets helper — server query).

**`targetDurationSec`:** from playbook `duracion_ideal_seg` when available, else **`DEFAULT_REEL_DURATION_SEC`**.

**`brollClipCount`:** `max(1, brollBeats.length)` when `needsBroll`; else `0`.

**Faceless rule:** never resolve `assetRole: "talking_head"` when effective production path is faceless (modalidad or profile).

### `rationaleKey` mapping (frozen enum)

| `rationaleKey` | When set |
|----------------|----------|
| `cheapest_active_low_tier` | Default winner after rank at `low` tier |
| `cheapest_active_high_tier` | Winner at `high` tier when active rows exist |
| `llm_variant_default` | Caption / strategy LLM path (`llmVariant: "default"`) |
| `llm_variant_fallback` | Script generate/regenerate (`llmVariant: "fallback"`) |
| `reference_loop_prefers_musetalk` | Loop context + MuseTalk row selected |
| `own_avatar_talking_head` | `own_avatar` → SadTalker-class row |
| `generic_avatar_talking_head` | `generic_avatar` without loop |
| `faceless_broll_wan` | Faceless / b-roll path → `broll` role |
| `tts_voiceover_required` | TTS included in full-Reel projection |
| `high_tier_inactive` | Policy `high` but no active row for role (error path) |
| `manual_fallback_operator` | US-8.3 explicit manual path only (not auto-rank) |

FE maps keys under **`scripts.providerRecommendation.rationale.*`**.

---

## Policy engine — `resolveProviderForJob` (**new**)

**File (BUILD):** `lib/providers/resolve-provider-for-job.ts` (`import "server-only"`)

```ts
export type ResolveProviderForJobInput = {
  clientId: string;
  assetRole: AssetRole;
  /** Required when assetRole === "llm". */
  llmVariant?: LlmVariant;
  /** Server-derived from buildReelProductionContext — not from request body. */
  productionContext?: Pick<
    ReelProductionContext,
    | "visualMode"
    | "modalidad"
    | "hasReferenceLoop"
    | "needsBroll"
    | "targetDurationSec"
    | "brollClipCount"
  >;
};

export type ProviderDecision = {
  providerKey: string;
  providerTier: ProviderTier;
  assetRole: AssetRole;
  estimatedCostCents: number;
  displayLabel: string;
  rationaleKey: ProviderRationaleKey;
};

export type ResolveProviderForJobResult =
  | { ok: true; decision: ProviderDecision }
  | { ok: false; code: "PROVIDER_UNAVAILABLE" };

export async function resolveProviderForJob(
  input: ResolveProviderForJobInput,
): Promise<ResolveProviderForJobResult> {
  // 1) getCostPolicyForClient(input.clientId) → providerTier
  // 2) getProviderCatalog()
  // 3) resolveProvider(catalog, { assetRole, tier, llmVariant, hasReferenceLoop, ... })
  // 4) adapter.estimateCost with server-derived duration/clip/token placeholders
  // 5) map providerKey → displayLabel via resolveProviderDisplayLabel
  // 6) set rationaleKey per routing table
}
```

| Rule | Detail |
|------|--------|
| Tier source | **`getCostPolicyForClient(clientId)`** only — never from `input` |
| Adapter binding | Registry factory receives **`decision.providerKey`** only |
| Estimate | Same adapter `estimateCost` used for preview, gate, spend event, decision log |
| Fail closed | No active row for tier+role → `{ ok: false, code: "PROVIDER_UNAVAILABLE" }` |
| No downgrade | `provider_tier = high` with all high rows inactive → fail; **never** pick low-tier row |

**Estimate context by asset role:**

| `assetRole` | Adapter | Estimate inputs (server-derived) |
|-------------|---------|----------------------------------|
| `llm` | LLM | Stub prompts; `llmVariant` from caller |
| `talking_head` | Video | `targetDurationSec` from context; `per_second` / `per_run` from `costModel` |
| `broll` | Video (`broll`) | `brollClipCount`, `DEFAULT_BROLL_CLIP_SEC` for `per_clip` |
| `tts` | TTS | Voiceover char count from script row or projection default |

---

## `estimateLlmJobCost` refactor (**changed**)

**File:** `lib/cost-policy/estimate-llm-job-cost.ts`

**Signature unchanged** (US-7.1 callers):

```ts
export type EstimateLlmJobCostInput = {
  clientId: string;
  providerTier: ProviderTier; // caller passes policy tier from getCostPolicyForClient
  llmVariant: LlmVariant;
};
```

**Implementation:** delegate to `resolveProviderForJob({ clientId, assetRole: "llm", llmVariant })` — remove inline `resolveProvider` + `createSiliconFlowLlmAdapter` duplication.

```ts
export async function estimateLlmJobCost(
  input: EstimateLlmJobCostInput,
): Promise<EstimateLlmJobCostResult> {
  const result = await resolveProviderForJob({
    clientId: input.clientId,
    assetRole: "llm",
    llmVariant: input.llmVariant,
  });
  if (!result.ok) return { ok: false, code: "PROVIDER_UNAVAILABLE" };
  return {
    ok: true,
    estimatedCostCents: result.decision.estimatedCostCents,
    providerKey: result.decision.providerKey,
    resolvedLlmProviderLabel: result.decision.displayLabel,
  };
}
```

---

## Operator recommendations — `getReelProviderRecommendations` (**new**)

**File (BUILD):** `lib/cost-policy/get-reel-provider-recommendations.ts`  
**Action (BUILD):** `lib/cost-policy/actions/get-reel-provider-recommendations.ts`

**Gate:** `requireOperator("getReelProviderRecommendations")` first.

```ts
export const getReelProviderRecommendationsInputSchema = z
  .object({
    clientId: z.string().uuid(),
    weekStart: trendWeekStartSchema,
    slotIndex: z.number().int().min(0).max(6).optional(),
  })
  .strict();

export type GetReelProviderRecommendationsInput = z.infer<
  typeof getReelProviderRecommendationsInputSchema
>;

export type OperatorProviderRecommendationComponentDto = {
  assetRole: AssetRole;
  displayLabel: string;
  providerTier: ProviderTier;
  estimatedCostCents: number;
  rationaleKey: ProviderRationaleKey;
  /** Operator support only — omit from Cliente serializers. */
  providerKey?: string;
};

export type ReelProviderRecommendation = {
  reelScriptId: string | null;
  slotIndex: number;
  providerTier: ProviderTier;
  visualMode: VisualMode;
  modalidad: VisualModality;
  components: OperatorProviderRecommendationComponentDto[];
  projectedTotalCents: number;
  manualFallbackNoteKey: typeof MANUAL_FALLBACK_NOTE_KEY;
};

export type GetReelProviderRecommendationsResult =
  | { ok: true; items: ReelProviderRecommendation[] }
  | {
      ok: false;
      error: {
        code:
          | "STRATEGY_NOT_APPROVED"
          | "PROVIDER_UNAVAILABLE"
          | "SLOT_NOT_FOUND"
          | "FORBIDDEN";
      };
    };
```

| Rule | Detail |
|------|--------|
| Strategy | Requires **approved** strategy for `weekStart` (same as script list) |
| Batch | Omit `slotIndex` → all slots (max 7) |
| LLM in projection | Include **one** LLM component per slot using `llmVariant: "fallback"` (script path) for projected total; confirm dialog uses actual job kind variant |
| `projectedTotalCents` | Sum of `components[].estimatedCostCents` — **read-only hint** |
| IDOR | Verify `clientId` matches session tenant; invalid slot → `SLOT_NOT_FOUND` (404 class) |

### Extended `ReelBudgetPreview` (US-7.1 DTO)

Add optional block to `reelBudgetPreviewSchema`:

```ts
llmRecommendation: z
  .object({
    displayLabel: z.string().min(1),
    providerTier: providerTierSchema,
    estimatedCostCents: z.number().int().nonnegative(),
    rationaleKey: providerRationaleKeySchema,
  })
  .strict()
  .optional(),
```

Populated by `getReelBudgetPreview` via `resolveProviderForJob` for the pending `jobKind`.

---

## Decision log — `logProviderDecision` (**new**)

**File (BUILD):** `lib/cost-policy/log-provider-decision.ts` (`import "server-only"`)

```ts
export const logProviderDecisionInputSchema = z
  .object({
    clientId: z.string().uuid(),
    reelScriptId: z.string().uuid(),
    jobKind: reelSpendJobKindSchema,
    assetRole: assetRoleSchema,
    providerTier: providerTierSchema,
    providerKey: z.string().min(1),
    estimatedCostCents: z.number().int().nonnegative(),
    rationaleKey: providerRationaleKeySchema,
    operatorClientId: z.string().uuid().nullable().optional(),
  })
  .strict();
```

| Rule | Detail |
|------|--------|
| When | **Successful** LLM script/caption generate/regenerate in BUILD; US-8.x job create **must** call same helper |
| Failed LLM | **No** row (PO decision #4) |
| vs spend ledger | Decision log is **canonical** for routing analytics; spend event keeps `estimated_cost_cents` + `provider_key` — **no FK** in V1 |
| Content | Never store `cost_model`, `capabilities`, `envKeyName` |

### Call sites (BUILD)

| Orchestrator | After |
|--------------|-------|
| `generateReelScriptsForClient` | successful LLM + `recordReelSpendEvent` |
| `regenerateReelScriptSlotForClient` | same |
| `generateReelCaptionsForClient` | same |
| `regenerateReelCaptionForClient` | same |

### US-8.x seam (document only)

Before `createJob` / TTS synthesize: `resolveProviderForJob` → `assertReelBudgetAllowsSpend` (when wired) → vendor I/O → `recordReelSpendEvent` + `logProviderDecision`.

---

## Database — `neuramark_provider_decisions` (**new**)

**Migration:** `supabase/migrations/*_neuramark_provider_decisions.sql`

```sql
CREATE TABLE neuramark_provider_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES neuramark_clients(id) ON DELETE CASCADE,
  reel_script_id uuid NOT NULL REFERENCES neuramark_reel_scripts(id) ON DELETE CASCADE,
  job_kind text NOT NULL CHECK (
    job_kind IN (
      'script_generate',
      'script_regenerate',
      'caption_generate',
      'caption_regenerate'
    )
  ),
  asset_role text NOT NULL CHECK (
    asset_role IN ('llm', 'tts', 'talking_head', 'broll')
  ),
  provider_tier text NOT NULL CHECK (provider_tier IN ('low', 'high')),
  provider_key text NOT NULL,
  estimated_cost_cents integer NOT NULL CHECK (estimated_cost_cents >= 0),
  rationale_key text NOT NULL,
  operator_client_id uuid NULL REFERENCES neuramark_clients(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX neuramark_provider_decisions_reel_script_id_idx
  ON neuramark_provider_decisions (reel_script_id);

CREATE INDEX neuramark_provider_decisions_client_id_created_at_idx
  ON neuramark_provider_decisions (client_id, created_at DESC);

ALTER TABLE neuramark_provider_decisions ENABLE ROW LEVEL SECURITY;
-- No policies — service-role Node only (US-X.4 / US-14.5 floor).
```

**Future:** US-8.x extends `job_kind` CHECK via new migration (`video_generate`, `tts_synthesize`, etc.).

---

## Schema changes — remove client `providerKey` authority

### Client-boundary schemas (request — no provider fields)

**File:** `lib/contracts/providers.ts`

```ts
/** Client / handler request — provider assigned by policy engine (US-7.2). */
export const createVideoJobRequestSchema = z
  .object({
    reelScriptId: z.string().uuid(),
    clientId: z.string().uuid(),
    targetDurationSec: z.number().int().positive().max(120),
    voiceoverAssetId: z.string().uuid().optional(),
    portraitAssetId: z.string().uuid().optional(),
    referenceVideoAssetId: z.string().uuid().optional(),
    prompt: z.string().max(4000).optional(),
    referenceImageAssetId: z.string().uuid().optional(),
  })
  .strict();

export const synthesizeSpeechRequestSchema = z
  .object({
    reelScriptId: z.string().uuid(),
    clientId: z.string().uuid(),
    text: z.string().min(1).max(50_000),
    voiceId: z.string().min(1),
    locale: supportedLocaleSchema,
  })
  .strict();
```

### Internal server schemas (adapter I/O — engine sets key)

Rename existing schemas for clarity in BUILD:

| Current | BUILD name | Notes |
|---------|------------|-------|
| `createVideoJobInputSchema` | **`resolvedCreateVideoJobInputSchema`** | Adds `providerKey`, `providerTier`, `assetRole` after engine |
| `synthesizeSpeechInputSchema` | **`resolvedSynthesizeSpeechInputSchema`** | Adds `providerKey` server-side |
| `llmCompletionInputSchema` | **`resolvedLlmCompletionInputSchema`** | Adds `providerKey` server-side |

**Deprecation:** `createVideoJobInputSchema` re-exports `resolvedCreateVideoJobInputSchema` during US-8.1 transition with `@deprecated` JSDoc — Route Handlers validate **`createVideoJobRequestSchema`** only.

---

## Forbidden client authority fields

**File:** `lib/contracts/provider-decisions.ts`

```ts
export const FORBIDDEN_PROVIDER_AUTHORITY_KEYS = [
  "providerKey",
  "provider_key",
  "provider",
  "selectedProvider",
  "providerTier",
  "provider_tier",
  "tier",
  "assetRole",
  "asset_role",
  "estimatedCostCents",
  "estimated_cost_cents",
  "catalogKey",
  "catalogRowId",
  "allowManualFallback",
  "allow_manual_fallback",
  "envKeyName",
  "costModel",
  "cost_model",
  "capabilities",
  "hasReferenceLoop",
  "has_reference_loop",
  "visualMode",
  "visual_mode",
  "modalidad",
  "needsBroll",
  "needs_broll",
] as const;
```

**BUILD:** merge into `findForbiddenReelScriptKeys`, `findForbiddenReelCaptionKeys`, and future video-job forbidden helpers. On spend paths: **reject** with `FORBIDDEN_FIELDS` (strip-only insufficient).

---

## Security test matrix (BUILD)

| Case | Expected |
|------|----------|
| Generate script with `providerKey: "heygen_high"` | `FORBIDDEN_FIELDS` |
| Generate with `tier: "high"` only | `FORBIDDEN_FIELDS`; effective tier from policy |
| `resolveProviderForJob` at `low` tier | never returns `heygen_high` / inactive keys |
| Multi-row same role+tier | cheapest `unitCostCents` wins |
| Faceless slot | `broll` role; no `talking_head` in recommendations |
| Generic + loop | `reference_loop_prefers_musetalk` when MuseTalk row active |
| `getReelProviderRecommendations` as Cliente | `403` / `FORBIDDEN` |
| Grep: no handler `UPDATE neuramark_provider_catalog` | pass |
| Decision log INSERT | contains `rationale_key`; no jsonb secrets |

---

## Fixtures

### `resolveProviderForJob` — low tier script LLM

**Request (internal):**

```json
{
  "clientId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "assetRole": "llm",
  "llmVariant": "fallback"
}
```

**Response:**

```json
{
  "ok": true,
  "decision": {
    "providerKey": "siliconflow_qwen",
    "providerTier": "low",
    "assetRole": "llm",
    "estimatedCostCents": 2,
    "displayLabel": "Qwen (SiliconFlow)",
    "rationaleKey": "llm_variant_fallback"
  }
}
```

### `getReelProviderRecommendations` — faceless slot

**Request:**

```json
{
  "clientId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "weekStart": "2026-08-25",
  "slotIndex": 1
}
```

**Response (truncated):**

```json
{
  "ok": true,
  "items": [
    {
      "reelScriptId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "slotIndex": 1,
      "providerTier": "low",
      "visualMode": "faceless",
      "modalidad": "faceless",
      "components": [
        {
          "assetRole": "llm",
          "displayLabel": "DeepSeek Flash",
          "providerTier": "low",
          "estimatedCostCents": 1,
          "rationaleKey": "llm_variant_fallback",
          "providerKey": "siliconflow_deepseek_flash"
        },
        {
          "assetRole": "broll",
          "displayLabel": "Wan 2.1 Turbo",
          "providerTier": "low",
          "estimatedCostCents": 15,
          "rationaleKey": "faceless_broll_wan",
          "providerKey": "siliconflow_wan21_turbo"
        },
        {
          "assetRole": "tts",
          "displayLabel": "CosyVoice 2",
          "providerTier": "low",
          "estimatedCostCents": 3,
          "rationaleKey": "tts_voiceover_required",
          "providerKey": "siliconflow_cosyvoice2"
        }
      ],
      "projectedTotalCents": 19,
      "manualFallbackNoteKey": "manual_upload_available"
    }
  ]
}
```

### `logProviderDecision`

```json
{
  "clientId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "reelScriptId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "jobKind": "script_generate",
  "assetRole": "llm",
  "providerTier": "low",
  "providerKey": "siliconflow_qwen",
  "estimatedCostCents": 2,
  "rationaleKey": "llm_variant_fallback",
  "operatorClientId": null
}
```

---

## Out of scope (unchanged)

| Topic | Owner |
|-------|-------|
| Video/TTS vendor HTTP adapters | US-8.x / US-9.3 |
| Blocking budget for video/TTS | US-8.x gate wiring |
| Catalog admin / writes | SQL-only (US-X.4) |
| Actual cost backfill | US-7.3 |
| Reel cost roll-up UI | US-7.4 |
| Cliente provider/cost visibility | Never |
| Operator provider override UI | US-8.7 / later |

---

## FE signoff

- [x] **Reviewed by FE** — expand-row recommendation panel on `/operator/scripts`; `ReelBudgetConfirmDialog` LLM block via optional `llmRecommendation`; `getReelProviderRecommendations` + EN/ES `scripts.providerRecommendation.*`.

**Reviewed by FE:** yes — 2026-08-29 — nextjs-frontend. **Panel:** add read-only **recomendación de proveedor** block inside existing expand-row `ReelDetailPanel` (`DataTable` `rowExpansionTemplate` — PO expand-row layout); lazy-fetch per slot via `getReelProviderRecommendations({ weekStart, slotIndex })` on expand (or batch without `slotIndex` on page load — map `items` by `slotIndex`); render `components[]` with asset-role label (i18n), `displayLabel`, tier badge, `estimatedCostCents` (`formatCentsForDisplay`), `rationaleKey` → `scripts.providerRecommendation.rationale.*`; `projectedTotalCents` labeled projected; `manualFallbackNoteKey` footnote; loading / empty / `PROVIDER_UNAVAILABLE` / `STRATEGY_NOT_APPROVED` / `SLOT_NOT_FOUND` states; `reelScriptId: null` supported for pending slots. **Confirm dialog:** extend `ReelBudgetConfirmDialog` / `BudgetMetrics` with optional `llmRecommendation` (`displayLabel`, `providerTier`, `estimatedCostCents`, `rationaleKey`) above existing budget rows — complements `resolvedLlmProviderLabel`; batch preview shows per-slot LLM line when present. **Action boundary:** mirror `getReelBudgetPreview` — Server Action derives `clientId` from `requireOperator().id`; FE passes only `weekStart` + optional `slotIndex` (do not add `clientId` to `ScriptsPageView` props). **i18n:** `scripts.providerRecommendation.*` EN + ES (role labels, rationale keys, projected total, manual note). Types from `lib/contracts/provider-decisions.ts` + extended `reelBudgetPreviewSchema`; no client provider math; no `providerKey` in UI.

---

## Zod module map

| Module | Contents |
|--------|----------|
| `lib/contracts/provider-decisions.ts` | `providerRationaleKeySchema`, `ProviderDecision`, recommendation DTOs, `FORBIDDEN_PROVIDER_AUTHORITY_KEYS`, input schemas |
| `lib/contracts/providers.ts` | `createVideoJobRequestSchema`, `synthesizeSpeechRequestSchema`, renamed resolved/internal schemas |
| `lib/contracts/cost-policy.ts` | optional `llmRecommendation` on `reelBudgetPreviewSchema` (BUILD) |
