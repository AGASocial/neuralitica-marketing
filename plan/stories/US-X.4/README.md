# US-X.4 — Seed provider catalog and tier defaults

**Status:** PREP — story folder created; gates not started.

**As a** Developer, **I want** a server-side provider catalog with low/high tier mappings, **so that** all agents and video jobs resolve vendors consistently without hardcoding in each story.

Ship **data-driven provider catalog + global cost-policy seed**: migrate `neuramark_provider_catalog` and `neuramark_cost_policies`, seed V1 low-tier rows (plus inactive high-tier placeholders), expose server-only `getProviderCatalog()` for trusted server jobs, and wire existing `resolveProvider()` in `lib/providers/provider-adapters.ts` against DB-backed rows. Operator tier/budget **UI** (US-7.1), policy engine ranking (US-7.2), and concrete vendor adapters (US-8.x) stay **out**.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-X.4 (do **not** check off in PREP).

**This folder:** [`plan/stories/US-X.4/`](./) — `README.md` · `TASKS.md` · *(gates: SPEC-REVIEW → SECURITY → CONTRACT → BUILD → VALIDATION → QA)*.

**Branch:** `null` (not started — set on BUILD).

**Depends on:** [US-X.3](../../USER_STORIES.md) ✅ — `getCurrentUser()` seam · [US-14.5](../US-14.5/) ✅ (`requireOperator()` for any future catalog/policy writes).

**Unblocks:** [US-4.1](../../USER_STORIES.md) (Content Strategy LLM resolution) · [US-7.2](../../USER_STORIES.md) (policy engine) · [US-8.1](../../USER_STORIES.md)+ (provider adapters) · [US-9.3](../../USER_STORIES.md) · [US-10.1](../../USER_STORIES.md).

**Reference code (already shipped):** `lib/providers/provider-adapters.ts` (`resolveProvider`, adapter interfaces) · `lib/contracts/providers.ts` (Zod schemas, `DEFAULT_LOW_TIER_PROVIDER_KEYS`) · `plan/PROVIDER_TIERS.html` (seed key table).

---

## Scope in

| Area | What US-X.4 adds |
|------|------------------|
| **FE** | — (operator tier display and budget settings live in **US-7.1**) |
| **BE** | Migrations + seed for `neuramark_provider_catalog` and global `neuramark_cost_policies`; server-only `getProviderCatalog()` (and optional `getDefaultCostPolicy()` if CONTRACT splits); reuse existing `resolveProvider(catalog, context)` — no duplicate resolver logic; Zod validation at DB boundary using `lib/contracts/providers.ts`; automated tests for seed shape, inactive high-tier exclusion, and resolver integration. |
| **DB** | `neuramark_provider_catalog` rows per Conventions **Provider tiers** table; global default `neuramark_cost_policies` row (`provider_tier = low`, `max_cost_cents = 150`); RLS deny-by-default (service-role Node only). |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **US-7.1** Operator settings UI | Budget/tier display and editable `max_cost_cents` — separate story; consumes tables seeded here. |
| **US-7.2** Policy engine | Ranking, visual-mode routing, job logging — consumes `getProviderCatalog()` + `resolveProvider()`. |
| **US-8.x** Vendor adapters | SadTalker, Wan, CosyVoice, HeyGen, etc. — register adapters against seeded `provider_key` values. |
| **US-4.1+** LLM agent jobs | Strategy/Script/Caption agents import catalog helper only; no generation in this story. |
| **Catalog write API / Operator CRUD** | V1 catalog is migration-seeded + SQL activation (US-7.2 [SEC]); no client-writable catalog endpoints. |
| **Per-client cost-policy overrides** | Schema may allow `client_id` nullable for global default; per-client rows are US-7.1. |
| **Per-asset tier mixing** | V1 tier switch is `provider_tier` on cost policy only (USER_STORIES AC). |

## Canonical terms

Use **provider catalog**, **provider tier** (`low` \| `high`), **asset role** (`llm` \| `tts` \| `talking_head` \| `broll`), **provider key**, **cost model**.  
_Evitar:_ hardcoded vendor names in agent modules; client-supplied `provider_key`; storing API secrets in catalog rows.

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-X.3 | `getCurrentUser()` identity seam — catalog reads are global config, not per-client. |
| US-14.5 | `requireOperator()` on any future catalog/cost-policy **write** handlers; deny-by-default routing unchanged. |
| `lib/providers/provider-adapters.ts` | **`resolveProvider()` already implemented** — US-X.4 loads catalog rows from DB and passes them in; do not fork resolver logic. |
| `lib/contracts/providers.ts` | Zod mirrors + `DEFAULT_LOW_TIER_PROVIDER_KEYS` — seed keys MUST align. |
| US-16.1 | Agent helper pattern: `getPlaybookForAgents()` — mirror with `getProviderCatalog()` (`import "server-only"`, soft failure when Supabase unavailable, validated DTO). |

**US-X.4 adds catalog persistence + global policy seed + server read contract** — no adapters, no Operator UI, no generation jobs.
