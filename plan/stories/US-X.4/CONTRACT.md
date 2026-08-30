Reviewed by FE: N/A — 2026-08-29 — BE-only story; no Cliente or Operator UI surfaces. Downstream agents (US-4.1, US-7.2, US-8.x) consume server-only helpers only.

# API Contract — US-X.4 Seed provider catalog and tier defaults

**Story:** US-X.4  
**Status:** Frozen — 2026-08-29  
**Security:** `plan/stories/US-X.4/SECURITY.md` (APPROVE WITH CONDITIONS — binding freeze; do not reopen)  
**Spec review:** `plan/stories/US-X.4/SPEC-REVIEW.md` (GAPS — resolved by this contract)  
**Depends on:** US-X.3 ✅ (identity seam — catalog reads are global config) · US-14.5 ✅ (`requireOperator()` floor for **future** catalog/policy writes)  
**Reference code (extend, do not fork):** `lib/providers/provider-adapters.ts` (`resolveProvider`) · `lib/contracts/providers.ts` (Zod mirrors) · `lib/playbook/get-playbook-for-agents.ts` (server-only loader pattern)

**This document is CONTRACT ONLY.** Do not implement migrations, helpers, or resolver changes until BUILD. Zod additions below are the BUILD sketch for `lib/contracts/providers.ts` and server modules.

**Terminology:** **Provider catalog** · **Provider tier** (`low` \| `high`) · **Asset role** (`llm` \| `tts` \| `talking_head` \| `broll`) · **Provider key** · **Cost model** · **Cost policy**. Technical names `getProviderCatalog`, `resolveProvider`, `envKeyName` are canonical. Do **not** hardcode vendor names in agent modules; do **not** expose full catalog rows to Cliente sessions.

---

## Overview

US-X.4 ships **data-driven provider catalog persistence** and a **global default cost policy** so trusted server jobs resolve vendors consistently:

1. Migrate **`neuramark_provider_catalog`** and **`neuramark_cost_policies`** with RLS deny-by-default (service-role Node only).
2. Seed all V1 **low-tier active** rows, **high-tier inactive** placeholders, and **`manual`** zero-cost fallback.
3. Expose **`getProviderCatalog()`** — sole application SELECT path for catalog rows; Zod-validates; returns active **and** inactive rows (callers filter via `resolveProvider`).
4. Expose **`getDefaultCostPolicy()`** — returns the global default tier + budget cap (`client_id IS NULL`).
5. Extend existing **`resolveProvider(catalog, context)`** with **`llmVariant`** disambiguation for dual low-tier LLM rows (SPEC-REVIEW High gap).
6. **No** FE routes, **no** write Server Actions, **no** Route Handlers in US-X.4 BUILD.

**Surfaces**

| # | Surface | Kind | New vs reused |
|---|---------|------|---------------|
| 1 | `getProviderCatalog()` | Server-only helper | **New** |
| 2 | `getDefaultCostPolicy()` | Server-only helper | **New** |
| 3 | `resolveProvider(catalog, context)` | Pure resolver (server module) | **Reused** — extend `ResolveProviderContext` |
| 4 | Zod + types | `lib/contracts/providers.ts` | **Extend** — `costPolicyRowSchema`, `envKeyNameSchema`, `llmVariantSchema`, error codes |
| 5 | Migration | `neuramark_provider_catalog` + seed | **New** |
| 6 | Migration | `neuramark_cost_policies` + global seed | **New** |

**Forbidden surfaces (BUILD veto):**

- Any Route Handler or Server Action that reads full catalog to the browser (`/api/provider-catalog`, etc.).
- Any write Server Action / Route Handler mutating catalog or cost policy in US-X.4 BUILD.
- Client Component import of `get-provider-catalog.ts`, `get-default-cost-policy.ts`, or `resolveProvider` from server-only graphs.
- Direct `neuramark_provider_catalog` SELECT from agent/adapter modules (bypassing `getProviderCatalog()`).
- Client-authoritative `providerKey` on job-creation inputs (binding floor for US-7.2+ — document only here).

**Why server helpers (not Route Handlers):** Trusted server orchestration only (US-4.1, US-7.2, US-8.x, US-9.3, US-10.x). No browser/HTTP surface. Mirror `getPlaybookForAgents()` (US-16.1).

**Frontend consumers:** **None** in US-X.4. Operator tier/budget display is **US-7.1**. Cliente never sees catalog rows.

**Server-only modules (planned BUILD)**

| Module | Purpose |
|--------|---------|
| `lib/providers/get-provider-catalog.ts` | `import "server-only"`; catalog loader + mapper |
| `lib/providers/get-default-cost-policy.ts` | `import "server-only"`; global cost policy loader |
| `lib/providers/map-provider-catalog-rows.ts` | DB snake_case → `ProviderCatalogRow` + Zod filter |
| `lib/providers/provider-adapters.ts` | Add `import "server-only"`; extend `resolveProvider` for `llmVariant` + manual exclusion |
| `lib/contracts/providers.ts` | Extend schemas/types (FE-safe types only from this file) |
| Migrations | See [Database](#database) |

---

## Frozen decisions (from SECURITY.md + SPEC-REVIEW + PO TASKS)

Do not reopen.

| # | Topic | Freeze |
|---|-------|--------|
| 1 | **Table names** | `neuramark_provider_catalog`, `neuramark_cost_policies` |
| 2 | **V1 writes** | Migration seed + Operator SQL only — **no** app write endpoints in US-X.4 |
| 3 | **V1 reads** | `getProviderCatalog()` / `getDefaultCostPolicy()` server-only — **no** HTTP |
| 4 | **Tier switch (MVP)** | `provider_tier` on `cost_policies` only — no per-asset tier mixing |
| 5 | **Global default policy** | One row: `client_id IS NULL`, `provider_tier = low`, `max_cost_cents = 150` |
| 6 | **`cost_model` JSON** | Canonical shape = `providerCostModelSchema` (`billingUnit`, `unitCostCents`, optional `metadata`) — **not** AC prose field names |
| 7 | **`env_key_name`** | Env var **name** only (`^[A-Z][A-Z0-9_]*$`); never secrets; never `NEXT_PUBLIC_*` |
| 8 | **Resolver** | Reuse `resolveProvider()` — no second implementation |
| 9 | **Dual LLM routing** | `llmVariant?: 'default' \| 'fallback'` on `ResolveProviderContext` — see [LLM routing](#llm-routing-frozen) |
| 10 | **`manual` row** | Seeded `active = true`; **`capabilities.manualFallback: true`** — excluded from auto `resolveProvider`; explicit key lookup / policy override only (US-8.3, US-7.2) |
| 11 | **Inactive high-tier** | `heygen_high`, `ltx_broll_high`, `elevenlabs_tts_high` — `active = false`; never selected while inactive |
| 12 | **RLS** | Enabled, **zero** named policies on both tables |
| 13 | **Logging** | Provider `key`, `asset_role`, `tier`, error **codes** only — never full `cost_model`, `capabilities`, or `envKeyName` values |
| 14 | **Future writes** | US-7.1+ mutations **must** use `requireOperator("handler")` — not built here |
| 15 | **Out of scope** | Operator settings UI (US-7.1), policy engine (US-7.2), vendor adapters (US-8.x), LLM/TTS/video jobs |

---

## LLM routing (frozen)

**Problem (SPEC-REVIEW High):** Two active low-tier `llm` rows exist (`siliconflow_deepseek_flash`, `siliconflow_qwen`). `resolveProvider` must not rely on SQL insert order.

**Decision:** Extend `ResolveProviderContext`:

```ts
export type LlmVariant = "default" | "fallback";

export interface ResolveProviderContext {
  assetRole: AssetRole;
  tier: ProviderTier;
  visualMode?: VisualMode;
  hasReferenceLoop?: boolean;
  needsBroll?: boolean;
  /** When assetRole is "llm" and multiple active rows share tier, pick by variant. */
  llmVariant?: LlmVariant;
  /** When true, allows selecting rows with capabilities.manualFallback === true. Default false. */
  allowManualFallback?: boolean;
}
```

**Resolution order (frozen):**

1. Filter catalog: `row.active && row.tier === context.tier && row.assetRole === context.assetRole`.
2. Unless `context.allowManualFallback === true`, exclude rows where `capabilities.manualFallback === true`.
3. If zero candidates → throw `ProviderResolveError` code `PROVIDER_NOT_FOUND`.
4. If `assetRole === "talking_head"` and `hasReferenceLoop === true`, prefer row with `capabilities.prefersReferenceLoop === true` (existing behavior).
5. If `assetRole === "llm"` and multiple candidates remain:
   - `llmVariant === "fallback"` (or explicit `'fallback'`) → return row with `key === "siliconflow_qwen"`.
   - Otherwise (`llmVariant` omitted or `'default'`) → return row with `key === "siliconflow_deepseek_flash"`.
   - If targeted key missing among candidates → throw `PROVIDER_NOT_FOUND` (do not silently fall back to `candidates[0]` for LLM).
6. Otherwise → return `candidates[0]`.

**Agent → variant mapping (documentation for downstream BUILD — not enforced in US-X.4):**

| Consumer | `llmVariant` | Resolved key |
|----------|--------------|--------------|
| US-4.1 Content Strategy | `'default'` | `siliconflow_deepseek_flash` |
| US-5.1 Video Script | `'fallback'` | `siliconflow_qwen` |
| US-6.x Caption | `'default'` | `siliconflow_deepseek_flash` |
| US-10.x QA / compliance | `'default'` | `siliconflow_deepseek_flash` |

**BUILD also updates** `DEFAULT_LOW_TIER_PROVIDER_KEYS` in `lib/contracts/providers.ts`:

```ts
export const DEFAULT_LOW_TIER_PROVIDER_KEYS = {
  llm: "siliconflow_deepseek_flash",
  llmFallback: "siliconflow_qwen", // new
  tts: "siliconflow_cosyvoice2",
  talkingHead: "sadtalker_low",
  talkingHeadLoop: "musetalk_low",
  broll: "siliconflow_wan21_turbo",
  manual: "manual",
} as const;
```

Optional keyed lookup helper (BUILD may add if agents prefer explicit keys):

```ts
export function getCatalogRowByKey(
  catalog: readonly ProviderCatalogRow[],
  key: string,
): ProviderCatalogRow | undefined;
```

---

## Shared schemas (BUILD: extend `lib/contracts/providers.ts`)

Existing schemas reused unchanged unless noted.

### `envKeyNameSchema` (new)

```ts
export const envKeyNameSchema = z
  .string()
  .min(1)
  .regex(/^[A-Z][A-Z0-9_]+$/, "envKeyName must be UPPER_SNAKE_CASE")
  .refine((v) => !v.startsWith("NEXT_PUBLIC_"), "NEXT_PUBLIC_* forbidden");
```

Apply at catalog row validation (BUILD): reject secret-shaped strings in `envKeyName`, `cost_model`, and `capabilities` (patterns: `sk-`, `Bearer`, base64 blobs — codes-only log on seed test failure).

### `providerCostModelSchema` (existing — canonical DB JSON)

```ts
export const providerCostModelSchema = z.object({
  billingUnit: costBillingUnitSchema, // per_run | per_second | per_clip | per_1m_tokens | per_1m_chars
  unitCostCents: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
```

**DB storage:** jsonb column `cost_model` uses **snake_case keys identical to TS** (`billingUnit`, `unitCostCents`, `metadata`) — no remapping inside JSON blob.

### `providerCatalogRowSchema` (existing — TS DTO camelCase)

```ts
export const providerCatalogRowSchema = z.object({
  key: z.string().min(1),
  assetRole: assetRoleSchema,
  tier: providerTierSchema,
  active: z.boolean(),
  capabilities: z.record(z.string(), z.unknown()),
  costModel: providerCostModelSchema,
  envKeyName: envKeyNameSchema,
});
```

### `costPolicyRowSchema` (new)

```ts
export const costPolicyRowSchema = z.object({
  id: z.string().uuid(),
  clientId: z.string().uuid().nullable(),
  providerTier: providerTierSchema,
  maxCostCents: z.number().int().positive(),
  rules: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export type CostPolicyRow = z.infer<typeof costPolicyRowSchema>;
```

Global default seed: `maxCostCents = 150`, `rules = null`.

### `llmVariantSchema` (new)

```ts
export const llmVariantSchema = z.enum(["default", "fallback"]);
export type LlmVariant = z.infer<typeof llmVariantSchema>;
```

---

## Database

**Migration file naming (frozen pattern):** `supabase/migrations/YYYYMMDDHHMMSS_neuramark_<object>.sql` — match existing repo timestamps. US-X.4 BUILD uses:

| File | Purpose |
|------|---------|
| `supabase/migrations/20260829260000_neuramark_provider_catalog.sql` | Table + indexes + RLS + catalog seed |
| `supabase/migrations/20260829260100_neuramark_cost_policies.sql` | Table + indexes + RLS + global policy seed |

*(Timestamps are BUILD placeholders — if collision, use next free `YYYYMMDDHHMMSS` in sequence.)*

### `neuramark_provider_catalog` (new)

```sql
CREATE TABLE public.neuramark_provider_catalog (
  key           text PRIMARY KEY,
  asset_role    text NOT NULL,
  tier          text NOT NULL,
  active        boolean NOT NULL DEFAULT true,
  capabilities  jsonb NOT NULL DEFAULT '{}'::jsonb,
  cost_model    jsonb NOT NULL,
  env_key_name  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT neuramark_provider_catalog_asset_role_chk
    CHECK (asset_role IN ('llm', 'tts', 'talking_head', 'broll')),
  CONSTRAINT neuramark_provider_catalog_tier_chk
    CHECK (tier IN ('low', 'high')),
  CONSTRAINT neuramark_provider_catalog_env_key_name_chk
    CHECK (env_key_name ~ '^[A-Z][A-Z0-9_]+$' AND env_key_name NOT LIKE 'NEXT_PUBLIC_%'),
  CONSTRAINT neuramark_provider_catalog_cost_model_object_chk
    CHECK (jsonb_typeof(cost_model) = 'object')
);

CREATE INDEX neuramark_provider_catalog_role_tier_active_idx
  ON public.neuramark_provider_catalog (asset_role, tier, active);

CREATE TRIGGER neuramark_provider_catalog_set_updated_at
  BEFORE UPDATE ON public.neuramark_provider_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_set_updated_at();

ALTER TABLE public.neuramark_provider_catalog ENABLE ROW LEVEL SECURITY;
-- Zero named policies → deny-by-default for anon/authenticated roles.
```

**No `client_id`.** Catalog is global in V1.

### `neuramark_cost_policies` (new)

```sql
CREATE TABLE public.neuramark_cost_policies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NULL
                    REFERENCES public.neuramark_clients (id) ON DELETE CASCADE,
  provider_tier   text NOT NULL,
  max_cost_cents  integer NOT NULL,
  rules           jsonb NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT neuramark_cost_policies_tier_chk
    CHECK (provider_tier IN ('low', 'high')),
  CONSTRAINT neuramark_cost_policies_max_cost_positive
    CHECK (max_cost_cents > 0)
);

-- Exactly one global default row (client_id IS NULL).
CREATE UNIQUE INDEX neuramark_cost_policies_one_global_default_idx
  ON public.neuramark_cost_policies ((1))
  WHERE client_id IS NULL;

CREATE INDEX neuramark_cost_policies_client_id_idx
  ON public.neuramark_cost_policies (client_id)
  WHERE client_id IS NOT NULL;

CREATE TRIGGER neuramark_cost_policies_set_updated_at
  BEFORE UPDATE ON public.neuramark_cost_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_set_updated_at();

ALTER TABLE public.neuramark_cost_policies ENABLE ROW LEVEL SECURITY;
-- Zero named policies.
```

Per-client override rows (`client_id` NOT NULL) are **schema-ready** but **not seeded** in US-X.4 (US-7.1).

---

## Seed rows — `neuramark_provider_catalog` (frozen)

All `cost_model` values are **estimate placeholders** for US-7.2 — not live vendor quotes.

### Low-tier active

| key | asset_role | tier | active | env_key_name | capabilities | cost_model |
|-----|------------|------|--------|--------------|--------------|------------|
| `siliconflow_deepseek_flash` | `llm` | `low` | `true` | `SILICONFLOW_API_KEY` | `{}` | `{ "billingUnit": "per_1m_tokens", "unitCostCents": 14, "metadata": { "model": "deepseek-v4-flash" } }` |
| `siliconflow_qwen` | `llm` | `low` | `true` | `SILICONFLOW_API_KEY` | `{}` | `{ "billingUnit": "per_1m_tokens", "unitCostCents": 18, "metadata": { "model": "qwen3.5-9b" } }` |
| `siliconflow_cosyvoice2` | `tts` | `low` | `true` | `SILICONFLOW_API_KEY` | `{}` | `{ "billingUnit": "per_1m_chars", "unitCostCents": 1, "metadata": { "model": "cosyvoice2" } }` |
| `sadtalker_low` | `talking_head` | `low` | `true` | `REPLICATE_API_TOKEN` | `{}` | `{ "billingUnit": "per_run", "unitCostCents": 10, "metadata": { "vendor": "replicate" } }` |
| `musetalk_low` | `talking_head` | `low` | `true` | `REPLICATE_API_TOKEN` | `{ "prefersReferenceLoop": true }` | `{ "billingUnit": "per_run", "unitCostCents": 19, "metadata": { "vendor": "replicate" } }` |
| `siliconflow_wan21_turbo` | `broll` | `low` | `true` | `SILICONFLOW_API_KEY` | `{}` | `{ "billingUnit": "per_clip", "unitCostCents": 21, "metadata": { "clipDurationSec": 5, "model": "wan2.1-i2v-turbo" } }` |
| `manual` | `talking_head` | `low` | `true` | `NEURAMARK_MANUAL_FALLBACK` | `{ "manualFallback": true }` | `{ "billingUnit": "per_run", "unitCostCents": 0 }` |

### High-tier inactive (P1 placeholders)

| key | asset_role | tier | active | env_key_name | capabilities | cost_model |
|-----|------------|------|--------|--------------|--------------|------------|
| `heygen_high` | `talking_head` | `high` | `false` | `HEYGEN_API_KEY` | `{}` | `{ "billingUnit": "per_second", "unitCostCents": 7, "metadata": { "plan": "standard" } }` |
| `ltx_broll_high` | `broll` | `high` | `false` | `FAL_API_KEY` | `{}` | `{ "billingUnit": "per_clip", "unitCostCents": 126, "metadata": { "clipDurationSec": 5, "model": "ltx-2.3-pro" } }` |
| `elevenlabs_tts_high` | `tts` | `high` | `false` | `ELEVENLABS_API_KEY` | `{}` | `{ "billingUnit": "per_1m_chars", "unitCostCents": 300, "metadata": { "plan": "multilingual" } }` |

**Seed invariants (tests must assert):**

- Keys match `DEFAULT_LOW_TIER_PROVIDER_KEYS` (+ `llmFallback: siliconflow_qwen`).
- High-tier rows: `active = false`.
- `manual`: `unitCostCents === 0`; present in catalog load; **absent** from default `resolveProvider(..., { assetRole: "talking_head", tier: "low" })`.
- No secret-shaped strings in any seed column/jsonb.
- `musetalk_low` has `prefersReferenceLoop: true`.

### Global cost policy seed — `neuramark_cost_policies`

Single INSERT:

| Column | Value |
|--------|-------|
| `client_id` | `NULL` |
| `provider_tier` | `'low'` |
| `max_cost_cents` | `150` |
| `rules` | `NULL` |

---

## Server helper — `getProviderCatalog()` (new)

**File (BUILD):** `lib/providers/get-provider-catalog.ts` (`import "server-only"`)  
**Consumers (later):** US-4.1, US-7.2, US-8.x, US-9.3, US-10.x — **not built in this story**.

**Signature (frozen):**

```ts
/**
 * Global provider catalog for trusted server orchestration.
 *
 * US-4.x, US-7.2, US-8.x, US-9.3, US-10.x MUST import this helper only —
 * never direct neuramark_provider_catalog SELECT from agent/adapter modules.
 *
 * No session gate — callers are trusted server jobs only.
 * Returns active AND inactive rows; resolveProvider filters active.
 */
export async function getProviderCatalog(): Promise<ProviderCatalogResult>;
```

**Auth inside helper:** **None** (mirror `getPlaybookForAgents()`).

**Query (frozen):**

```sql
SELECT key, asset_role, tier, active, capabilities, cost_model, env_key_name
FROM public.neuramark_provider_catalog
ORDER BY asset_role ASC, tier ASC, key ASC;
```

**Caching (frozen):** Use React `cache()` wrapper around the loader function for **per-request deduplication**. No cross-request module singleton in US-X.4 BUILD. (US-7.2 may add short TTL later — out of scope here.)

**Mapping:** DB snake_case → TS camelCase (`asset_role` → `assetRole`, `cost_model` → `costModel`, `env_key_name` → `envKeyName`).

**Validation:** Each row parsed with `providerCatalogRowSchema`. Invalid rows **skipped**; log code `PROVIDER_CATALOG_ROW_INVALID` + `key` only. If **all** rows invalid or DB error / Supabase unconfigured → soft failure.

### Return shape

```ts
export const providerCatalogSuccessSchema = z.object({
  providers: z.array(providerCatalogRowSchema),
});

export const providerCatalogLoadFailedSchema = z.object({
  providers: z.array(providerCatalogRowSchema).length(0),
  loadFailed: z.literal(true),
});

export type ProviderCatalogResult =
  | z.infer<typeof providerCatalogSuccessSchema>
  | z.infer<typeof providerCatalogLoadFailedSchema>;
```

**Supabase unconfigured:** Same as Playbook — `{ providers: [], loadFailed: true }`; log `[provider-catalog] load unavailable: Supabase not configured`.

**Do not:** expose via HTTP; gate with `requireOperator` (global config); return partial unvalidated rows.

---

## Server helper — `getDefaultCostPolicy()` (new)

**File (BUILD):** `lib/providers/get-default-cost-policy.ts` (`import "server-only"`)

**Signature (frozen):**

```ts
/**
 * Global default cost policy (client_id IS NULL).
 * Per-client overrides are US-7.1 — not loaded here.
 */
export async function getDefaultCostPolicy(): Promise<DefaultCostPolicyResult>;
```

**Query (frozen):**

```sql
SELECT id, client_id, provider_tier, max_cost_cents, rules, created_at, updated_at
FROM public.neuramark_cost_policies
WHERE client_id IS NULL
LIMIT 1;
```

**Caching:** Same `cache()` per-request pattern as catalog loader.

### Return shape

```ts
export const defaultCostPolicySuccessSchema = z.object({
  policy: costPolicyRowSchema,
});

export const defaultCostPolicyLoadFailedSchema = z.object({
  policy: z.null(),
  loadFailed: z.literal(true),
});

export type DefaultCostPolicyResult =
  | z.infer<typeof defaultCostPolicySuccessSchema>
  | z.infer<typeof defaultCostPolicyLoadFailedSchema>;
```

**Mapping:** `client_id` → `clientId`, `provider_tier` → `providerTier`, `max_cost_cents` → `maxCostCents`, timestamps ISO-8601.

**Zero rows or corrupt row:** `{ policy: null, loadFailed: true }` — log `COST_POLICY_GLOBAL_MISSING` or `COST_POLICY_ROW_INVALID`.

---

## Resolver — `resolveProvider()` (extend existing)

**File (BUILD):** `lib/providers/provider-adapters.ts` — add `import "server-only"` at top.

**Signature (unchanged):**

```ts
export function resolveProvider(
  catalog: readonly ProviderCatalogRow[],
  context: ResolveProviderContext,
): ProviderCatalogRow;
```

**Throws:** `ProviderResolveError` (BUILD) with `code: "PROVIDER_NOT_FOUND"` when no matching active row. Callers map to 503 / operator-safe message — no secret leakage.

```ts
export class ProviderResolveError extends Error {
  readonly code = "PROVIDER_NOT_FOUND" as const;
  constructor(
    public readonly assetRole: AssetRole,
    public readonly tier: ProviderTier,
    public readonly llmVariant?: LlmVariant,
  ) {
    super(`No active provider for assetRole=${assetRole} tier=${tier}`);
  }
}
```

**Filter rules (frozen):** `active === true` · matching `tier` · matching `assetRole` · exclude `manualFallback` unless `allowManualFallback` · MuseTalk preference · LLM variant keys as above.

**Inactive high-tier:** With default seed, `resolveProvider(catalog, { assetRole: "talking_head", tier: "high" })` throws `PROVIDER_NOT_FOUND` until SQL activation sets `active = true`.

---

## Error codes (frozen)

No HTTP envelope — helpers use soft failure; resolver throws typed error.

| Code | Where | Meaning |
|------|-------|---------|
| `PROVIDER_CATALOG_ROW_INVALID` | `getProviderCatalog` mapper | Row failed Zod — skipped |
| `PROVIDER_CATALOG_LOAD_FAILED` | `getProviderCatalog` | DB error or all rows invalid |
| `COST_POLICY_ROW_INVALID` | `getDefaultCostPolicy` | Row failed Zod |
| `COST_POLICY_GLOBAL_MISSING` | `getDefaultCostPolicy` | No `client_id IS NULL` row |
| `COST_POLICY_LOAD_FAILED` | `getDefaultCostPolicy` | DB error / Supabase unconfigured |
| `PROVIDER_NOT_FOUND` | `resolveProvider` | No matching active row after filters |

Log prefix: `[provider-catalog]` / `[cost-policy]`. Never log jsonb bodies or env var names.

---

## Fixtures (BUILD / tests)

### Catalog loader — happy (abbreviated)

**Call:** `getProviderCatalog()` (server module)

```json
{
  "providers": [
    {
      "key": "siliconflow_deepseek_flash",
      "assetRole": "llm",
      "tier": "low",
      "active": true,
      "capabilities": {},
      "costModel": {
        "billingUnit": "per_1m_tokens",
        "unitCostCents": 14,
        "metadata": { "model": "deepseek-v4-flash" }
      },
      "envKeyName": "SILICONFLOW_API_KEY"
    },
    {
      "key": "siliconflow_qwen",
      "assetRole": "llm",
      "tier": "low",
      "active": true,
      "capabilities": {},
      "costModel": {
        "billingUnit": "per_1m_tokens",
        "unitCostCents": 18,
        "metadata": { "model": "qwen3.5-9b" }
      },
      "envKeyName": "SILICONFLOW_API_KEY"
    }
  ]
}
```

*(Full fixture includes all 10 seed keys.)*

### Catalog loader — Supabase unconfigured

```json
{
  "providers": [],
  "loadFailed": true
}
```

### Default cost policy — happy

```json
{
  "policy": {
    "id": "00000000-0000-4000-8000-000000000001",
    "clientId": null,
    "providerTier": "low",
    "maxCostCents": 150,
    "rules": null,
    "createdAt": "2026-08-29T00:00:00.000Z",
    "updatedAt": "2026-08-29T00:00:00.000Z"
  }
}
```

### `resolveProvider` — LLM default vs fallback

Given full low-tier seed in memory:

```ts
resolveProvider(catalog, { assetRole: "llm", tier: "low" });
// → key === "siliconflow_deepseek_flash"

resolveProvider(catalog, { assetRole: "llm", tier: "low", llmVariant: "fallback" });
// → key === "siliconflow_qwen"
```

### `resolveProvider` — MuseTalk loop preference

```ts
resolveProvider(catalog, {
  assetRole: "talking_head",
  tier: "low",
  hasReferenceLoop: true,
});
// → key === "musetalk_low"
```

### `resolveProvider` — inactive high-tier excluded

```ts
resolveProvider(catalog, { assetRole: "talking_head", tier: "high" });
// throws ProviderResolveError PROVIDER_NOT_FOUND
```

### `resolveProvider` — manual excluded from auto path

```ts
resolveProvider(catalog, { assetRole: "talking_head", tier: "low" });
// → key === "sadtalker_low" (not "manual")
```

---

## Automated tests (BUILD expectations)

| Case | Assert |
|------|--------|
| Migration seed keys | All 10 catalog keys present; global cost policy row exists |
| `DEFAULT_LOW_TIER_PROVIDER_KEYS` | Includes `llmFallback: siliconflow_qwen`; matches active low keys |
| Secret scan | Seed SQL / jsonb contains no `sk-`, `Bearer`, `NEXT_PUBLIC_` |
| RLS posture | Both tables: RLS enabled, zero policies (migration grep or introspection) |
| `getProviderCatalog` module | File has `import "server-only"`; not importable from client graph |
| Catalog happy load | Returns 10 rows; Zod-valid |
| Corrupt row skipped | Invalid row omitted; valid rows returned; log code only |
| Supabase unconfigured | `{ providers: [], loadFailed: true }` |
| `getDefaultCostPolicy` | Returns `providerTier: low`, `maxCostCents: 150`, `clientId: null` |
| Missing global policy | `{ policy: null, loadFailed: true }` |
| LLM `default` variant | Resolves `siliconflow_deepseek_flash` |
| LLM `fallback` variant | Resolves `siliconflow_qwen` |
| LLM without variant | Same as `default` |
| Talking-head default | Resolves `sadtalker_low` |
| Talking-head + loop | Resolves `musetalk_low` |
| High-tier inactive | `resolveProvider` throws `PROVIDER_NOT_FOUND` for each high inactive role |
| Manual exclusion | Auto talking_head resolve ≠ `manual`; manual row has zero cost |
| No HTTP surface | Grep: no `/api/provider-catalog` Route Handler |
| Partial unique index | Only one global cost policy row allowed (`client_id IS NULL`) |

---

## Out of scope

| Topic | Owner |
|-------|--------|
| Operator budget/tier settings UI | US-7.1 |
| Policy engine ranking + job logging | US-7.2 |
| Vendor adapter HTTP implementations | US-8.x |
| LLM/TTS/video generation jobs | US-4.x+, US-9.3 |
| Per-client cost policy CRUD | US-7.1 |
| Catalog write API / Operator CRUD | Future story + `requireOperator()` |
| Cliente catalog read API | **Never** in V1 |
| `plan/PROVIDER_TIERS.html` sync | BUILD SHOULD update html table (Qwen + high-tier rows) — optional doc follow-up |

---

## Downstream binding floors (document only)

- Job-creation schemas (US-7.2+): **omit** client-authoritative `providerKey`; server sets after `resolveProvider`.
- Operator UI (US-7.1/7.2): minimal DTO allowlist — never return full `costModel`, `capabilities`, `envKeyName` to browser.
- Adapters (US-8.x): `process.env[row.envKeyName]` server-side only; missing env → fail closed before vendor call.

---

## AC mapping (for validator — do not check USER_STORIES here)

| USER_STORIES AC | Contract coverage |
|-----------------|-------------------|
| Catalog min low-tier keys + qwen | Seed table + `DEFAULT_LOW_TIER_PROVIDER_KEYS.llmFallback` |
| High-tier inactive rows | Seed table `active = false` + resolver tests |
| `cost_model` for US-7.2 estimates | `providerCostModelSchema` + seed placeholders |
| V1 tier switch on cost_policies only | Global policy seed; no per-asset mixing |
| [SEC] No client-readable full catalog | No FE surfaces; server-only helpers |
| [SEC] Env var names only | `envKeyNameSchema` + seed + migration CHECK |
| Dual LLM resolution | `llmVariant` on `ResolveProviderContext` |

---

## Signoff checklist

- [x] Table DDL frozen: `neuramark_provider_catalog`, `neuramark_cost_policies`
- [x] RLS enabled, zero policies on both tables
- [x] Seed rows + global cost policy frozen (keys, `active`, `cost_model`, `env_key_name`, `capabilities`)
- [x] Migration file naming pattern frozen
- [x] `getProviderCatalog()` path, return type, per-request cache, Zod validation
- [x] `getDefaultCostPolicy()` path, return type, global row query
- [x] `resolveProvider` LLM routing via `llmVariant`; manual exclusion; MuseTalk preference
- [x] `import "server-only"` module boundaries documented
- [x] **No** write Server Actions / Route Handlers in scope
- [x] **No** Cliente catalog read API
- [x] Error codes frozen
- [x] Unit test matrix frozen
- [x] **Reviewed by FE:** N/A — 2026-08-29 (BE-only story)

After freeze, BUILD may proceed. Any contract change after freeze requires an update to this file + FE re-signoff (N/A unless FE surfaces added).

| Date | Change |
|------|--------|
| 2026-08-29 | CONTRACT authored and frozen (nextjs-backend) |
