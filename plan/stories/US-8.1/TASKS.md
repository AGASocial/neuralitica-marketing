# US-8.1 — Provider adapter interface

**Priority:** P0  
**Depends on:** US-X.4 ✅ catalog seed · `getProviderCatalog()` · `resolveProvider()` · Zod mirrors · US-7.2 ✅ `resolveProviderForJob()` · `ProviderDecision.providerKey` · `estimateVideoJobCost()` seam  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-8.1 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **media-pipeline-engineer** + **nextjs-backend** (`docs/development/AGENT-ROSTER.md` Phase 4). **Reviewed by FE: N/A** — BE-only story.  
**Canonical terms:** **provider adapter** · **provider key** · **asset role** · **external job id** · **video job status**. Avoid CONTEXT _Evitar_ list in product-facing copy.

## Out of scope (do not implement here)

- **Vendor HTTP** — Replicate SadTalker, SiliconFlow Wan, HeyGen API calls (US-8.2 / US-8.6 / US-8.7).
- **`neuramark_video_jobs` migration or writes** — US-8.2.
- **Job poller / SSE / status UI** — US-8.4.
- **Route Handlers** for jobs, providers, or webhooks.
- **FE** components, i18n, or Client Components importing adapter modules.
- **TTS / LLM adapter bodies** — interfaces exist; CosyVoice (US-9.3) and SiliconFlow LLM already wired elsewhere.
- **`manual` upload adapter** — US-8.3.
- **Policy engine changes** — US-7.2 owns ranking and `resolveProviderForJob`.
- **Catalog seed / DDL changes** — US-X.4.
- **Budget gate or spend ledger** — US-7.1 / US-7.3.

## Scope split

| Concern | Owner |
|---------|--------|
| `VideoProviderAdapter` four-method contract | **US-8.1** BE (consolidate US-X.4 stub) |
| `ProviderRegistry` + `InMemoryProviderRegistry` | **US-8.1** BE (consolidate US-X.4 stub) |
| Stub adapters: `sadtalker_low`, `siliconflow_wan21_turbo`, `heygen_high` | **US-8.1** BE |
| `getProviderRegistry()` singleton factory | **US-8.1** BE |
| Zod mirrors for adapter I/O | **US-8.1** BE (extend `lib/contracts/providers.ts`) |
| Registry + interface compliance tests | **US-8.1** BE |
| Catalog load + `resolveProvider` | **US-X.4** (unchanged) |
| `resolveProviderForJob` + decision log | **US-7.2** (unchanged) |
| Real SadTalker `createJob` + storage | **US-8.2** |

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Module placement | **`lib/providers/provider-adapters.ts`** (interface + registry) · stubs under **`lib/providers/video/`** (mirror `lib/providers/llm/stub-*`) · Zod in **`lib/contracts/providers.ts`**. |
| Consolidate | **Extend** existing US-X.4 types — no duplicate `VideoJobStatus` or parallel registry. |
| Registry key | **`provider_key`** from catalog / policy engine — must match `neuramark_provider_catalog.key`. |
| Stub keys | **`sadtalker_low`** · **`siliconflow_wan21_turbo`** · **`heygen_high`** — align with `V1_CATALOG_SEED_KEYS` / `DEFAULT_LOW_TIER_PROVIDER_KEYS`. |
| Stub behavior | Deterministic `externalJobId`, `status: queued` on create; `estimateCost` uses catalog `cost_model` unit math or flat stub cents; **no network**. |
| `videoAssetRole` | `sadtalker_low` + `heygen_high` → **`primary`**; `siliconflow_wan21_turbo` → **`broll`**. |
| Factory | **`getProviderRegistry()`** returns singleton with video stubs registered; idempotent across calls. |
| HTTP surface | **None** — regression: no `app/api/**/provider*` job routes. |
| Server boundary | `import "server-only"` on adapter + registry modules; contracts file has **no** `server-only` (FE-safe types). |
| Status enum | **`queued` \| `processing` \| `completed` \| `failed` \| `cancelled`** only — `videoJobStatusSchema` at boundaries. |
| `external_job_id` | Opaque; same-adapter round-trip only; no path/SQL interpolation. |
| Untrusted responses | Parse/normalize via **`videoJobStatusResultSchema`**; sanitize error text before persistence/display. |
| Env keys | Stubs ignore env; real adapters (US-8.2+) read `process.env[row.envKeyName]` server-side only. |
| Barrel import | New code: prefer direct paths over `@/lib/providers` barrel (US-X.4 QA L1). |
| Implementers | **media-pipeline-engineer** + **nextjs-backend**. |

### Video adapter interface sketch (CONTRACT freezes exact signatures)

```ts
export interface VideoProviderAdapter {
  readonly providerKey: string;
  readonly videoAssetRole: VideoAssetRole;

  estimateCost(input: CreateVideoJobInput): Promise<CostEstimate>;
  createJob(input: CreateVideoJobInput): Promise<CreateVideoJobResult>;
  getJobStatus(externalJobId: string): Promise<VideoJobStatusResult>;
  fetchAsset(
    externalJobId: string,
    rawOutputUrl?: string,
  ): Promise<StoredMediaAsset>;
}
```

### Registry sketch (CONTRACT freezes error type + factory name)

```ts
export interface ProviderRegistry {
  getVideoAdapter(providerKey: string): VideoProviderAdapter;
  getTtsAdapter(providerKey: string): TtsProviderAdapter;
  getLlmAdapter(providerKey: string): LlmProviderAdapter;
  registerVideo(adapter: VideoProviderAdapter): void;
  registerTts(adapter: TtsProviderAdapter): void;
  registerLlm(adapter: LlmProviderAdapter): void;
}

export function getProviderRegistry(): ProviderRegistry {
  // singleton InMemoryProviderRegistry + register video stubs
}
```

### Stub adapter sketch (BUILD)

```ts
// lib/providers/video/create-stub-video-adapter.ts
export function createStubVideoAdapter(params: {
  providerKey: string;
  videoAssetRole: VideoAssetRole;
  defaultEstimateCents: number;
}): VideoProviderAdapter {
  return {
    providerKey: params.providerKey,
    videoAssetRole: params.videoAssetRole,
    async estimateCost(input) {
      return {
        estimatedCostCents: params.defaultEstimateCents,
        currency: "USD",
        providerKey: params.providerKey,
      };
    },
    async createJob(input) {
      return {
        externalJobId: `stub-${params.providerKey}-${input.reelScriptId}`,
        status: "queued",
        estimatedCostCents: params.defaultEstimateCents,
      };
    },
    async getJobStatus(externalJobId) {
      return { status: "completed", progressPercent: 100 };
    },
    async fetchAsset(externalJobId) {
      return {
        storageKey: `stub/${externalJobId}.mp4`,
        mimeType: "video/mp4",
        sizeBytes: 1024,
        actualCostCents: params.defaultEstimateCents,
      };
    },
  };
}
```

### Policy-engine integration (consume only — do not change US-7.2)

```ts
// After resolveProviderForJob returns decision.providerKey:
const registry = getProviderRegistry();
const adapter = registry.getVideoAdapter(decision.providerKey);
const estimate = await adapter.estimateCost({
  ...resolvedInput,
  providerKey: decision.providerKey,
  providerTier: decision.providerTier,
});
```

### Zod additions sketch (CONTRACT freezes names)

```ts
export const costEstimateSchema = z.object({
  estimatedCostCents: z.number().int().nonnegative(),
  currency: z.literal("USD"),
  providerKey: z.string().min(1),
  breakdown: z.record(z.string(), z.number()).optional(),
});

export type CostEstimate = z.infer<typeof costEstimateSchema>;
// Existing: createVideoJobResultSchema, videoJobStatusResultSchema, storedMediaAssetSchema
```

## Carry-forwards / reuse (do not reinvent)

- Interface + registry class: `lib/providers/provider-adapters.ts` (US-X.4).
- Zod I/O: `lib/contracts/providers.ts` — `resolvedCreateVideoJobInputSchema`, `createVideoJobResultSchema`, `videoJobStatusResultSchema`, `storedMediaAssetSchema`, `videoJobStatusSchema`.
- Catalog keys: `DEFAULT_LOW_TIER_PROVIDER_KEYS`, `V1_CATALOG_SEED_KEYS`.
- Resolver: `resolveProvider()`, `getCatalogRowByKey()`, `estimateVideoJobCost()`.
- Policy engine: `lib/providers/resolve-provider-for-job.ts`.
- LLM stub pattern: `lib/providers/llm/stub-llm-adapter.ts` (`createStubLlmAdapter`).
- Tests harness: `lib/providers/providers.test.ts` (`withServerOnlyStub`, `loadProviderAdapters`).
- Display labels: `lib/providers/resolve-provider-display-label.ts` (unchanged).
- Security baseline: `plan/SECURITY_BASELINE.md` § Video Provider Adapter.

---

## FE checklist

**No FE work** — N/A for US-8.1.

- [ ] _Intentionally empty — job status UI is US-8.4._

---

## BE checklist

Concrete consumers: **US-8.2+** job create/poller · **`estimateVideoJobCost()`** · future **`resolveProviderForJob` → registry** wiring.

- [x] **Consolidate** `VideoProviderAdapter`, `VideoJobStatusResult`, `CostEstimate` in `lib/providers/provider-adapters.ts` — align method names with USER_STORIES AC (`estimateCost`, `createJob`, `getJobStatus`, `fetchAsset`).
- [x] **Consolidate** `ProviderRegistry` + `InMemoryProviderRegistry` — typed `getVideoAdapter` / `registerVideo` (already present; verify no drift).
- [x] **`lib/providers/video/create-stub-video-adapter.ts`** — shared factory for stub video adapters (mirror LLM stub pattern).
- [x] **Register stubs** for **`sadtalker_low`**, **`siliconflow_wan21_turbo`**, **`heygen_high`** with correct `videoAssetRole`.
- [x] **`getProviderRegistry()`** — singleton factory in `lib/providers/` (CONTRACT picks exact path); pre-registers video stubs.
- [x] **`lib/contracts/providers.ts`** — add **`costEstimateSchema`** (+ export type if CONTRACT moves `CostEstimate` inference here); ensure all adapter result types have Zod mirrors.
- [x] **Sanitize helper** (optional module `lib/providers/sanitize-provider-error.ts`) — strip/control chars, max length for `sanitizedErrorMessage` — CONTRACT freezes.
- [x] **`estimateVideoJobCost`** — optionally default to `getProviderRegistry()` when registry arg omitted (CONTRACT decides; avoid breaking callers).
- [x] **[SEC] `server-only`** on new adapter/registry modules; no `NEXT_PUBLIC_*` env reads.
- [x] **[SEC] `external_job_id`** — document + test opaque handling; no path concatenation in stubs.
- [x] **[SEC] Untrusted status** — stub `getJobStatus` output passes `videoJobStatusResultSchema.parse`.
- [x] **No HTTP routes** — regression test: no new `app/api/**` provider/job endpoints.
- [x] **Export** registry factory from appropriate module (avoid forcing barrel import in tests).
- [x] **Automated tests:** `getVideoAdapter("sadtalker_low")` succeeds; unknown key throws; each stub implements four methods; statuses ⊆ `VIDEO_JOB_STATUSES`; `createJob` → `getJobStatus` → `fetchAsset` round-trip; `server-only` import present; optional integration: `estimateVideoJobCost(catalog, registry, …)` with stub registry.

---

## DB checklist

All objects keep `neuramark_` prefix. **No migration required.**

- [ ] **No CREATE tables** — catalog from US-X.4; `video_jobs` is US-8.2.
- [ ] RLS deny-by-default unchanged; service-role Node only.

---

## Gates (orchestrator)

- [x] SPEC-REVIEW.md (spec-guardian)
- [x] SECURITY.md (security-architect)
- [x] CONTRACT.md authored (nextjs-backend — frozen; **Reviewed by FE: N/A**)
- [x] BUILD (media-pipeline-engineer + nextjs-backend — `a11d4ae`)
- [x] VALIDATION.md (requirements-validator — PASS WITH NOTES `7367929`)
- [x] QA.md (qa-engineer — BLOCK remediated `4193a1e`; M1 catalog bootstrap deferred to US-8.2)

**Status:** CLOSED (2026-08-30). All gates complete; AC checked in `plan/USER_STORIES.md`. **Next:** **US-8.2** SadTalker adapter.

---

## Open questions (for SPEC / SECURITY / CONTRACT)

1. **`CostEstimate` type location — interface file vs contracts?** **PO lean:** keep runtime interface in `provider-adapters.ts`; add **`costEstimateSchema`** in contracts for validation parity.
2. **`getProviderRegistry()` vs inject registry in tests?** **PO lean:** factory singleton for prod; tests may `new InMemoryProviderRegistry()` + manual register (mirror LLM stub tests).
3. **Register LLM/TTS adapters in same factory?** **PO lean:** **video stubs only** in US-8.1 BUILD; LLM continues direct `createSiliconFlowLlmAdapter` / stub imports — CONTRACT may add optional LLM register for symmetry.
4. **`ProviderRegistry.getVideoAdapter` error type?** **PO lean:** throw **`ProviderAdapterNotFoundError`** with `providerKey` field (replace generic `Error`) — CONTRACT freezes for US-8.2 catch paths.
5. **`musetalk_low` stub now or US-8.x?** **PO lean:** **defer** — US-8.1 AC names three keys; MuseTalk ships with loop talking-head story.
6. **Sanitize helper shared with US-8.4 poller?** **PO lean:** export **`sanitizeProviderErrorMessage(raw: string): string`** in US-8.1 for reuse.
7. **Validate `createJob` input inside adapter?** **PO lean:** callers validate `resolvedCreateVideoJobInputSchema` before invoke; adapters may assert in dev only.
8. **`fetchAsset` stub storage key format?** **PO lean:** `stub/{providerKey}/{externalJobId}.mp4` — no real Supabase upload in US-8.1.
9. **Extend `lib/providers/index.ts` barrel?** **PO lean:** export `getProviderRegistry` from barrel for ergonomics; downstream stories prefer direct imports per QA L1.
10. **USER_STORIES Depends line says US-7.2 only — also cite US-X.4?** **PO lean:** **both** — catalog keys (X.4) + policy resolution (7.2); no SPEC amendment required.

No SPEC amendment assumed in PREP: SPEC §3 Video Provider Adapter requires swappable vendors behind one contract — US-8.1 is the contract + registry foundation; US-8.2+ swap stub bodies for real adapters without pipeline changes.
