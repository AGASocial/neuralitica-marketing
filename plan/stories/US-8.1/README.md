# US-8.1 — Provider adapter interface

**Status:** SELECT — PREP (`README.md` + `TASKS.md`). Gates pending: SPEC-REVIEW · SECURITY · CONTRACT · BUILD · VALIDATION · QA.

**As a** System, **I want** a single adapter contract for all video providers, **so that** swapping SadTalker for MuseTalk or HeyGen does not rewrite the pipeline.

Ship **server-only video adapter contract + registry**: consolidate and extend the stubs already started in `lib/providers/provider-adapters.ts` and `lib/contracts/providers.ts` (US-X.4 / US-7.2); wire **`ProviderRegistry` / `InMemoryProviderRegistry`** keyed by **`provider_key`** from the policy engine (`resolveProviderForJob`); register **stub `VideoProviderAdapter` implementations** for catalog seed keys **`sadtalker_low`**, **`siliconflow_wan21_turbo`**, **`heygen_high`** (no vendor HTTP); add **registry lookup + interface-compliance tests**. **No Route Handlers**, **no FE**, **no `neuramark_video_jobs` writes** — concrete vendor I/O ships in **US-8.2+**.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-8.1 (unchecked until VALIDATION).

**This folder:** [`plan/stories/US-8.1/`](./) — `README.md` · `TASKS.md` · (gates pending) `SPEC-REVIEW.md` · `SECURITY.md` · `CONTRACT.md` · `VALIDATION.md` · `QA.md`.

**Branch:** `feature/US-8.1-provider-adapter-interface`

**Depends on:** [US-X.4](../US-X.4/) ✅ catalog seed · `DEFAULT_LOW_TIER_PROVIDER_KEYS` · `getProviderCatalog()` · `resolveProvider()` · Zod mirrors in `lib/contracts/providers.ts` · [US-7.2](../US-7.2/) ✅ `resolveProviderForJob()` · `ProviderDecision.providerKey` · `estimateVideoJobCost()` seam.

**Unblocks:** [US-8.2](../../USER_STORIES.md) (SadTalker adapter) · [US-8.4](../../USER_STORIES.md) (job poller) · [US-8.6](../../USER_STORIES.md) (Wan B-roll) · [US-8.7](../../USER_STORIES.md) (HeyGen high tier) · [US-9.3](../../USER_STORIES.md) (TTS adapter registry pattern).

---

## Scope in

| Area | What US-8.1 adds |
|------|------------------|
| **FE** | — (no UI; job status polling is US-8.4) |
| **BE** | **Consolidate** `VideoProviderAdapter` (`estimateCost`, `createJob`, `getJobStatus`, `fetchAsset`); **`ProviderRegistry` + `InMemoryProviderRegistry`**; **stub video adapters** for `sadtalker_low`, `siliconflow_wan21_turbo`, `heygen_high`; **`getProviderRegistry()`** (or CONTRACT-exact factory) wiring stubs at module load; **Zod mirrors** for adapter I/O in `lib/contracts/providers.ts` (extend existing schemas — no parallel types); **sanitize/normalize** helpers for untrusted provider status + error text; **automated tests** for registry lookup, missing-key errors, and four-method interface compliance. Reuse **`estimateVideoJobCost(catalog, registry, …)`** — do not duplicate resolver logic. |
| **DB** | — (catalog rows from US-X.4; `video_jobs` DDL is US-8.2) |
| **Implementers** | **media-pipeline-engineer** + **nextjs-backend** (`docs/development/AGENT-ROSTER.md` Phase 4). **Reviewed by FE: N/A** — BE-only story (mirror US-X.4). |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **US-8.2+** vendor HTTP | SadTalker Replicate calls, Wan/HeyGen APIs, polling loops, storage download — replace stub bodies in downstream stories. |
| **US-8.3** manual upload | `manual` provider adapter / zero-cost path — US-8.3. |
| **US-9.3** TTS adapter impl | `TtsProviderAdapter` interface **already exists** (US-X.4); CosyVoice/ElevenLabs bodies are US-9.3. |
| **US-4.x / US-5.x** LLM adapters | `LlmProviderAdapter` + SiliconFlow/stub LLM adapters already shipped; no changes unless CONTRACT aligns registry export. |
| **HTTP Route Handlers** | Registry and adapters are server-only imports — no `/api/providers` or job endpoints. |
| **`neuramark_video_jobs` DDL** | US-8.2 owns persistence. |
| **Policy engine ranking** | US-7.2 owns `resolveProviderForJob`; US-8.1 **consumes** `providerKey` only. |
| **Operator UI** | US-7.2 recommendation panel already shows display labels; no new surfaces. |
| **Cliente** routes | No provider or job fields on shared serializers. |

## Canonical terms (CONTEXT)

Use **provider adapter**, **provider key**, **provider tier**, **asset role**, **external job id**, **video job status** (`queued` \| `processing` \| `completed` \| `failed` \| `cancelled`).  
_Evitar:_ client-supplied `provider_key`; API secrets in catalog rows or responses; persisting raw vendor URLs without server-side validation.

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-X.4 | **`VideoProviderAdapter` interface**, **`InMemoryProviderRegistry`**, **`VIDEO_JOB_STATUSES`**, Zod: `createVideoJobResultSchema`, `videoJobStatusResultSchema`, `storedMediaAssetSchema`, `resolvedCreateVideoJobInputSchema`, **`DEFAULT_LOW_TIER_PROVIDER_KEYS`**, **`V1_CATALOG_SEED_KEYS`**. |
| US-7.2 | **`resolveProviderForJob()`** returns `decision.providerKey`; **`estimateVideoJobCost()`** resolves catalog → registry → `estimateCost`. |
| US-X.4 QA L1 | Prefer **direct** imports (`@/lib/providers/provider-adapters`, `@/lib/contracts/providers`) over barrel `@/lib/providers` in new code. |

**US-8.1 consolidates the contract, registers stub video adapters for three seed keys, and proves registry + interface compliance in tests** — not vendor integrations or job persistence.

## PO decisions frozen (2026-08-29)

1. **Consolidate, don't fork:** Extend **`lib/providers/provider-adapters.ts`** and **`lib/contracts/providers.ts`** — no second adapter module or duplicate status enums.
2. **Registry key:** **`provider_key`** string from catalog / `resolveProviderForJob` / `resolveProvider` — same keys as `neuramark_provider_catalog.key` (US-X.4 seed).
3. **Stub adapters (BUILD):** **`sadtalker_low`** (`videoAssetRole: primary`), **`siliconflow_wan21_turbo`** (`broll`), **`heygen_high`** (`primary`) — deterministic stub responses; **no outbound vendor HTTP** in US-8.1.
4. **Registry factory:** Export **`getProviderRegistry(): ProviderRegistry`** (CONTRACT may rename) returning a **singleton** `InMemoryProviderRegistry` with video stubs pre-registered; LLM/TTS registration unchanged / optional in same factory.
5. **No HTTP:** No new Route Handlers; regression test mirrors US-X.4 (`app/api/provider-catalog` absent).
6. **Server-only:** `import "server-only"` on adapter modules and registry factory; FE imports types from **`lib/contracts/providers.ts`** only.
7. **Statuses:** All video jobs use **`queued` \| `processing` \| `completed` \| `failed` \| `cancelled`** — validate via `videoJobStatusSchema` at adapter boundaries.
8. **`external_job_id`:** Opaque string from `createJob`; passed only to **same adapter** `getJobStatus` / `fetchAsset`; never interpolated into SQL or filesystem paths — exact-match lookup only (US-8.2+ persistence).
9. **Untrusted vendor data:** `getJobStatus` results parsed with **`videoJobStatusResultSchema`**; `sanitizedErrorMessage` max length per schema; `rawOutputUrl` transient (not persisted).
10. **API keys:** Adapters read **`process.env[envKeyName]`** from catalog row **only in real implementations** (US-8.2+); stubs **must not** log or return env values.
11. **Tests:** Dedicated suite — registry `getVideoAdapter` hit/miss; each stub implements four methods; status enum compliance; `server-only` boundary assertion (extend `providers.test.ts` or `provider-registry.test.ts`).
12. **Implementers:** **media-pipeline-engineer** (adapter stubs + registry) + **nextjs-backend** (contracts + tests). **No nextjs-frontend** BUILD slice.

---

## Gates (orchestrator)

- [x] SPEC-REVIEW.md (spec-guardian)
- [x] SECURITY.md (security-architect)
- [x] CONTRACT.md (nextjs-backend — frozen; **Reviewed by FE: N/A**)
- [ ] BUILD (media-pipeline-engineer + nextjs-backend)
- [ ] VALIDATION.md (requirements-validator)
- [ ] QA.md (qa-engineer)

**Status:** SELECT — PREP complete. **Next:** SPEC-REVIEW → SECURITY → CONTRACT freeze → BUILD.
