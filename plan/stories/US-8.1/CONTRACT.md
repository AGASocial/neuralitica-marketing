Reviewed by FE: N/A — 2026-08-29 — BE-only story; no Cliente or Operator UI surfaces. Downstream US-8.2+ consume server-only adapter/registry helpers.

# API Contract — US-8.1 Provider adapter interface

**Story:** US-8.1  
**Status:** Frozen — 2026-08-29  
**Security:** `plan/stories/US-8.1/SECURITY.md` (APPROVE WITH CONDITIONS — reconciled below)  
**Spec review:** `plan/stories/US-8.1/SPEC-REVIEW.md` (GAPS — resolved by this contract)  
**Depends on:** US-X.4 ✅ catalog seed · `getProviderCatalog()` · `resolveProvider()` · Zod mirrors · US-7.2 ✅ `resolveProviderForJob()` · `ProviderDecision.providerKey` · `estimateVideoJobCost()` · `FORBIDDEN_PROVIDER_AUTHORITY_KEYS`  
**ADR:** `docs/adr/0003-worker-flyio-ffmpeg.md` — Vercel enqueues; Fly worker polls/downloads/FFmpeg  
**Feature branch:** `feature/US-8.1-provider-adapter-interface`

**This document is CONTRACT ONLY.** Zod below is the BUILD sketch for `lib/contracts/providers.ts`, new modules under `lib/providers/`, and `lib/providers/video/`. No vendor HTTP, no `neuramark_video_jobs` DDL, no Route Handlers in US-8.1 BUILD.

**Terminology:** **provider adapter** · **provider key** · **asset role** · **external job id** · **video job status** (`queued` \| `processing` \| `completed` \| `failed` \| `cancelled`). Technical enums OK in code/Operator diagnostics. Do **not** use CONTEXT _Evitar_ terms in product-facing strings.

---

## SPEC-REVIEW blocking gaps closed

| # | Gap | Resolution |
|---|-----|------------|
| 1 | Untrusted-response normalization not implemented | **`normalizeProviderJobStatus`**, **`sanitizeProviderErrorMessage`**, **`validateProviderOutputUrl`** in `lib/providers/normalize-provider-response.ts` (`import "server-only"`); adapters **must** call before returning `VideoJobStatusResult` |
| 2 | `external_job_id` opaque rules not frozen | **`externalJobIdSchema`** + **`ExternalJobId`** type; persistence/lookup rules (§ External job id) |
| 3 | ADR-0003 runtime split undocumented | **Method invocation matrix** (§ ADR-0003 runtime split) — Vercel vs Fly per adapter method |
| 4 | `fetchAsset` storage contract undefined | **Download-and-own contract** (§ `fetchAsset` storage) — Storage key shape, `neuramark_media_assets` handoff |
| 5 | Registry bootstrap missing | **`createProviderRegistry()`** + **`getProviderRegistry()`** singleton (§ Registry bootstrap) |
| 6 | No US-8.1 unit tests | **Test matrix** (§ Automated tests) |
| 7 | `ProviderRegistry.getVideoAdapter` generic `Error` | **`ProviderAdapterNotFoundError`** with `PROVIDER_ADAPTER_NOT_FOUND` code |
| 8 | `CostEstimate` Zod mirror missing | **`costEstimateSchema`** in `lib/contracts/providers.ts` |
| 9 | `rawOutputUrl` persistence risk | **`persistedVideoJobStatusSchema`** = omit `rawOutputUrl`; DB/API DTOs use persisted shape only |

## SECURITY reconciliation (binding)

| Topic | SECURITY condition | **Frozen in this contract** |
|-------|-------------------|----------------------------|
| Registry bootstrap | Single init; no handler `register*` | **`createProviderRegistry()`** only mutator; **`getProviderRegistry()`** returns frozen singleton |
| Adapter lookup | Engine output only | `getVideoAdapter(key)` where `key` = `resolveProviderForJob` → `decision.providerKey` — cross-ref **`FORBIDDEN_PROVIDER_AUTHORITY_KEYS`** (`lib/contracts/provider-decisions.ts`) |
| Untrusted responses | Normalize before trust | **`normalizeProviderJobStatus`**, **`sanitizeProviderErrorMessage`**, **`validateProviderOutputUrl`** mandatory path |
| `rawOutputUrl` | Transient; never persisted | **`persistedVideoJobStatusSchema`**; orchestrators omit from DB/API |
| `external_job_id` | Opaque; no path/SQL interpolation | **`externalJobIdSchema`**; lookup `WHERE external_job_id = $1 AND provider_key = $2 AND client_id = $3` (US-8.2) |
| Vendor HTTP | Only under `lib/providers/**` | BUILD grep test; adapters implement I/O; Route Handlers delegate to interface |
| Module boundary | `server-only` on registry/adapters | Frozen module list (§ Server-only modules) |
| Closed result schemas | No `rawResponse`, `apiKey`, etc. | Zod mirrors in `lib/contracts/providers.ts` — adapter returns parsed shapes only |

---

## Overview

US-8.1 ships the **server-only video adapter contract**, **registry bootstrap**, **untrusted-response normalization helpers**, and **stub video adapters** for three catalog keys. Swapping SadTalker for MuseTalk or HeyGen = new adapter class + catalog row + env var — assembly (US-9.x) unchanged.

1. **Consolidate** `VideoProviderAdapter` four-method interface in `lib/providers/provider-adapters.ts` (extend US-X.4 — do not fork).
2. **Add** `lib/providers/normalize-provider-response.ts` — status/error/URL normalization.
3. **Add** `lib/providers/create-provider-registry.ts` — `createProviderRegistry()` + `getProviderRegistry()` singleton.
4. **Add** `lib/providers/video/create-stub-video-adapter.ts` — deterministic stubs (no network).
5. **Register** stubs for **`sadtalker_low`**, **`siliconflow_wan21_turbo`**, **`heygen_high`** at bootstrap.
6. **Extend** `lib/contracts/providers.ts` — `externalJobIdSchema`, `costEstimateSchema`, `persistedVideoJobStatusSchema`, `PROVIDER_ADAPTER_NOT_FOUND`.
7. **Tests** — registry, normalization, schema rejection, `server-only` boundary.

**Surfaces**

| # | Surface | Kind | New vs reused |
|---|---------|------|---------------|
| 1 | `VideoProviderAdapter` | Interface | **Reused** — US-X.4 scaffold |
| 2 | `ProviderRegistry` / `InMemoryProviderRegistry` | Registry | **Reused** — extend error types |
| 3 | `createProviderRegistry()` | Server bootstrap | **New** |
| 4 | `getProviderRegistry()` | Server singleton accessor | **New** |
| 5 | `normalizeProviderJobStatus` | Server helper | **New** |
| 6 | `sanitizeProviderErrorMessage` | Server helper | **New** |
| 7 | `validateProviderOutputUrl` | Server helper | **New** |
| 8 | `createStubVideoAdapter` | Stub factory | **New** |
| 9 | `ProviderAdapterNotFoundError` | Error class | **New** |
| 10 | `RegistryFrozenError` | Error class | **New** |
| 11 | Zod extensions | `lib/contracts/providers.ts` | **Extend** |
| 12 | `estimateVideoJobCost` | Server helper | **Reused** — optional default registry arg (BUILD) |

**Forbidden surfaces (BUILD veto):**

- Route Handlers / Server Actions importing `registerVideo` / `registerTts` / `registerLlm`.
- Per-request `new InMemoryProviderRegistry()` in production orchestration.
- `getVideoAdapter(requestBody.providerKey)` or any request-derived key.
- Direct vendor `fetch()` outside `lib/providers/**` adapter implementation files.
- Persisting or returning `rawOutputUrl` to DB or browser.
- Using `external_job_id` in Storage key construction or dynamic SQL.
- Client Component import of `lib/providers/index.ts` or any `lib/providers/**` module with `server-only`.
- Vendor HTTP in US-8.1 stub bodies.

**Out of scope (explicit):** SadTalker/Wan/HeyGen real I/O (US-8.2 / US-8.5 / US-8.7) · `neuramark_video_jobs` DDL (US-8.2) · poller/webhooks/UI (US-8.4) · FFmpeg (US-9.x / Fly worker) · TTS adapter bodies (US-9.3) · LLM adapter changes beyond optional registry registration.

---

## Frozen decisions (do not reopen)

| # | Topic | Freeze |
|---|-------|--------|
| 1 | **Consolidate** | Extend `lib/providers/provider-adapters.ts` + `lib/contracts/providers.ts` — no parallel adapter module |
| 2 | **Registry key** | `provider_key` string from catalog / `resolveProviderForJob` — must match `neuramark_provider_catalog.key` |
| 3 | **Video statuses** | `queued` \| `processing` \| `completed` \| `failed` \| `cancelled` only — `videoJobStatusSchema` at boundaries |
| 4 | **Stub keys** | `sadtalker_low` (primary) · `siliconflow_wan21_turbo` (broll) · `heygen_high` (primary) — no outbound HTTP |
| 5 | **Factory name** | **`getProviderRegistry()`** returns singleton; **`createProviderRegistry()`** builds + freezes |
| 6 | **Not-found error** | **`ProviderAdapterNotFoundError`** code **`PROVIDER_ADAPTER_NOT_FOUND`** |
| 7 | **Normalize module** | `lib/providers/normalize-provider-response.ts` — shared by adapters + US-8.4 poller |
| 8 | **Bootstrap module** | `lib/providers/create-provider-registry.ts` — sole `register*` caller in production |
| 9 | **CostEstimate type** | Runtime interface stays in `provider-adapters.ts`; **`costEstimateSchema`** in contracts for validation |
| 10 | **LLM/TTS in factory** | **Optional** — video stubs required; LLM may continue direct imports (US-X.4 pattern) |
| 11 | **Barrel** | Export `getProviderRegistry` from `lib/providers/index.ts`; prefer direct imports in tests (US-X.4 QA L1) |
| 12 | **DB** | No migration in US-8.1 |

---

## `VideoProviderAdapter` interface (frozen)

**File:** `lib/providers/provider-adapters.ts` (`import "server-only"`)

```ts
export interface VideoProviderAdapter {
  readonly providerKey: string;
  readonly videoAssetRole: VideoAssetRole;

  estimateCost(input: CreateVideoJobInput): Promise<CostEstimate>;

  createJob(input: CreateVideoJobInput): Promise<CreateVideoJobResult>;

  getJobStatus(externalJobId: ExternalJobId): Promise<VideoJobStatusResult>;

  /**
   * Download provider output and persist under our storage layer (download-and-own).
   * `rawOutputUrl` comes from getJobStatus when the vendor returns a URL.
   * US-8.1 stubs return deterministic `storageKey` without HTTP or Storage I/O.
   */
  fetchAsset(
    externalJobId: ExternalJobId,
    rawOutputUrl?: string,
  ): Promise<StoredMediaAsset>;
}
```

| Method | Input validation | Return validation |
|--------|------------------|-------------------|
| `estimateCost` | Caller validates `resolvedCreateVideoJobInputSchema` | `costEstimateSchema.parse` optional in adapter |
| `createJob` | Same | `createVideoJobResultSchema.parse` — `externalJobId` via `externalJobIdSchema` |
| `getJobStatus` | `externalJobIdSchema.parse(externalJobId)` at adapter entry | Adapter calls normalize helpers → `videoJobStatusResultSchema.parse` |
| `fetchAsset` | `externalJobIdSchema` + optional `validateProviderOutputUrl` on `rawOutputUrl` | `storedMediaAssetSchema.parse` |

**Adapter implementation rules (all US-8.x vendors):**

- Read API keys via `process.env[row.envKeyName]` only inside adapter module; missing key → throw before network I/O.
- Never return `rawResponse`, `headers`, `apiKey`, `authorization`, or spread `...vendorJson` into results.
- Catch vendor errors → `sanitizeProviderErrorMessage` → set `sanitizedErrorMessage` or rethrow `ProviderAdapterError` with code — never raw body.
- `getJobStatus` **must** pipe vendor status through **`normalizeProviderJobStatus`** before return.
- Stubs (US-8.1): no `process.env` reads; no `fetch`; deterministic IDs and costs.

---

## Untrusted-response normalization

**File (BUILD):** `lib/providers/normalize-provider-response.ts` (`import "server-only"`)

### `normalizeProviderJobStatus(raw: unknown): VideoJobStatus`

Maps vendor status strings → `videoJobStatusSchema` enum.

| Vendor input (case-insensitive examples) | Normalized |
|------------------------------------------|------------|
| `queued`, `pending`, `submitted`, `waiting` | `queued` |
| `processing`, `running`, `in_progress`, `active` | `processing` |
| `completed`, `succeeded`, `success`, `done` | `completed` |
| `failed`, `error`, `errored` | `failed` |
| `cancelled`, `canceled`, `aborted` | `cancelled` |
| Unknown / non-string / empty | `failed` |

```ts
export function normalizeProviderJobStatus(raw: unknown): VideoJobStatus;
```

**Rule:** Unknown vendor status → **`failed`** — never persist unchecked vendor strings.

### `sanitizeProviderErrorMessage(raw: unknown): string`

```ts
export function sanitizeProviderErrorMessage(raw: unknown): string;
```

| Step | Rule |
|------|------|
| Coerce | Non-string → `""` |
| Redact | Remove `Bearer\s+\S+`, `sk-[a-zA-Z0-9_-]+`, query params `(api_key\|token\|secret)=…`, base64 blobs >32 chars |
| Control chars | Strip `\0`–`\x1f` except `\n` `\t` |
| Whitespace | Collapse runs to single space; trim |
| Length | Max **2000** chars (truncate with `…`) |
| Empty after redaction | Return **`"Provider request failed"`** (generic fallback — never empty string to UI) |

**Mandatory** before any `sanitizedErrorMessage` persist or Operator display. US-8.4 poller reuses this helper.

### `validateProviderOutputUrl(url: string, allowedHosts: readonly string[]): string`

```ts
export function validateProviderOutputUrl(
  url: string,
  allowedHosts: readonly string[],
): string;
```

| Rule | Detail |
|------|--------|
| Protocol | **`https:`** only |
| Host | Must match entry in `allowedHosts` (exact host or suffix match per CONTRACT implementation — prefer exact) |
| Source | `allowedHosts` from catalog `capabilities.allowedOutputHosts` or per-adapter frozen constant (US-8.2+) |
| Failure | Throw **`ProviderAdapterError`** code `INVALID_PROVIDER_OUTPUT_URL` — do not fetch |
| Persistence | Return validated URL for **in-memory** `rawOutputUrl` only — **never** DB |

### `normalizeVideoJobStatusResult(vendor: unknown, allowedHosts?: readonly string[]): VideoJobStatusResult`

**Optional convenience (BUILD):** composes status + error + URL validation for adapter `getJobStatus` implementations.

```ts
export function normalizeVideoJobStatusResult(
  vendor: {
    status?: unknown;
    progressPercent?: unknown;
    errorMessage?: unknown;
    outputUrl?: unknown;
  },
  allowedHosts?: readonly string[],
): VideoJobStatusResult;
```

- `progressPercent`: clamp 0–100; omit if non-finite.
- `rawOutputUrl`: set only when `outputUrl` passes `validateProviderOutputUrl`.
- `sanitizedErrorMessage`: from `sanitizeProviderErrorMessage(vendor.errorMessage)` when status is `failed` or vendor supplied error text.

---

## External job id

**Contracts:** `lib/contracts/providers.ts`

```ts
/** Opaque vendor correlation id — not a path, not client authority. */
export const EXTERNAL_JOB_ID_MAX_LENGTH = 512 as const;

export const externalJobIdSchema = z
  .string()
  .min(1)
  .max(EXTERNAL_JOB_ID_MAX_LENGTH)
  .regex(
    /^[A-Za-z0-9_\-:.]+$/,
    "externalJobId must be opaque alphanumeric (no path separators)",
  )
  .refine(
    (id) =>
      !id.includes("..") &&
      !id.includes("/") &&
      !id.includes("\\") &&
      !id.includes("%2e") &&
      !id.includes("\0"),
    "externalJobId must not contain path traversal sequences",
  );

export type ExternalJobId = z.infer<typeof externalJobIdSchema>;
```

**`createVideoJobResultSchema` change:** `externalJobId: externalJobIdSchema` (replaces bare `z.string().min(1)`).

### Persistence rules (US-8.2+ — frozen here for migration)

| Rule | Detail |
|------|--------|
| Store | `neuramark_video_jobs.external_job_id` = validated string **as-is** (opaque) |
| Lookup | **Parameterized exact match only:** `WHERE external_job_id = $1 AND provider_key = $2 AND client_id = $3` |
| Forbidden | `LIKE`, prefix/suffix match, dynamic SQL interpolation, filesystem paths |
| Round-trip | `getJobStatus` / `fetchAsset` receive id from **server-loaded job row** — never client input alone |
| Cross-provider | Registry resolves adapter by job row's **`provider_key`**; id never sent to a different adapter |
| Storage keys | **Server-generated** UUID paths (US-3.3 pattern) — **never** derive from `external_job_id` |

### Orchestration binding

```ts
// After US-8.2 job row load (server-side only):
const registry = getProviderRegistry();
const adapter = registry.getVideoAdapter(job.providerKey); // from row, not request
const externalJobId = externalJobIdSchema.parse(job.externalJobId);
const status = await adapter.getJobStatus(externalJobId);
```

---

## Registry bootstrap

**File (BUILD):** `lib/providers/create-provider-registry.ts` (`import "server-only"`)

### `createProviderRegistry(): ProviderRegistry`

| Step | Behavior |
|------|----------|
| 1 | `new InMemoryProviderRegistry()` |
| 2 | Load catalog via `getProviderCatalog()` |
| 3 | Register video stubs (see [Stub adapters](#stub-video-adapters-build)) |
| 4 | **Validate** each adapter `providerKey` ∈ catalog keys (`V1_CATALOG_SEED_KEYS` or loaded snapshot) |
| 5 | Optional: register existing LLM adapter(s) — not required for US-8.1 AC |
| 6 | **`Object.freeze(registry)`** or internal frozen flag — subsequent `register*` throws **`RegistryFrozenError`** |
| 7 | Return registry |

**`registerVideo` / `registerTts` / `registerLlm`:** callable **only** inside `createProviderRegistry` (and test helpers). **Not exported** from modules imported by Route Handlers or Server Actions.

### `getProviderRegistry(): ProviderRegistry`

| Rule | Detail |
|------|--------|
| Singleton | Lazy-init on first call via `createProviderRegistry()` |
| Idempotent | Repeated calls return same frozen instance |
| Handlers | Import **`getProviderRegistry` only** — not `InMemoryProviderRegistry`, not `createProviderRegistry` from handlers (factory may be used in tests) |

### `ProviderAdapterNotFoundError`

```ts
export const PROVIDER_ADAPTER_NOT_FOUND = "PROVIDER_ADAPTER_NOT_FOUND" as const;

export class ProviderAdapterNotFoundError extends Error {
  readonly code = PROVIDER_ADAPTER_NOT_FOUND;
  constructor(public readonly providerKey: string) {
    super(`Video adapter not registered: ${providerKey}`);
    this.name = "ProviderAdapterNotFoundError";
  }
}
```

**`InMemoryProviderRegistry.getVideoAdapter`** (and TTS/LLM getters): throw **`ProviderAdapterNotFoundError`** — replace generic `Error`.

### `RegistryFrozenError`

```ts
export class RegistryFrozenError extends Error {
  readonly code = "REGISTRY_FROZEN" as const;
  constructor() {
    super("Provider registry is frozen");
    this.name = "RegistryFrozenError";
  }
}
```

### Adapter lookup chain (mandatory)

```
resolveProviderForJob(...) → decision.providerKey
  → getProviderRegistry().getVideoAdapter(decision.providerKey)
  → adapter.estimateCost | createJob | getJobStatus | fetchAsset
```

**Forbidden:** `getCatalogRowByKey(catalog, clientSuppliedKey)` + adapter on untrusted key. Cross-ref **`FORBIDDEN_PROVIDER_AUTHORITY_KEYS`**.

---

## Stub video adapters (BUILD)

**File:** `lib/providers/video/create-stub-video-adapter.ts` (`import "server-only"`)

```ts
export function createStubVideoAdapter(params: {
  providerKey: string;
  videoAssetRole: VideoAssetRole;
  defaultEstimateCents: number;
}): VideoProviderAdapter;
```

| `providerKey` | `videoAssetRole` | `defaultEstimateCents` (BUILD) |
|---------------|------------------|-------------------------------|
| `sadtalker_low` | `primary` | From catalog row `costModel` or **19** (flat stub) |
| `siliconflow_wan21_turbo` | `broll` | From catalog or **10** |
| `heygen_high` | `primary` | From catalog or **100** |

**Stub behavior (deterministic, no network):**

| Method | Behavior |
|--------|----------|
| `estimateCost` | `{ estimatedCostCents: defaultEstimateCents, currency: "USD", providerKey }` |
| `createJob` | `{ externalJobId: \`stub-${providerKey}-${input.reelScriptId}\`, status: "queued", estimatedCostCents }` — id must pass `externalJobIdSchema` |
| `getJobStatus` | `{ status: "completed", progressPercent: 100 }` — output passes `videoJobStatusResultSchema` |
| `fetchAsset` | `{ storageKey: \`stub/${providerKey}/${externalJobId}.mp4\`, mimeType: "video/mp4", sizeBytes: 1024, actualCostCents: defaultEstimateCents }` — **no** Supabase upload in US-8.1 |

---

## ADR-0003 runtime split

Per **ADR-0003**: Vercel hosts Next.js + enqueue; Fly worker runs long polls, download, FFmpeg. Adapters are **shared modules** importable from both runtimes — no FFmpeg inside adapter files.

| Method | Primary runtime | Caller (story) | Notes |
|--------|-----------------|----------------|-------|
| `estimateCost` | **Vercel** (Next server) | US-7.2 policy preview · US-8.2 create flow | Fast; no vendor poll loop |
| `createJob` | **Vercel** | US-8.2+ after budget + consent re-check | INSERT job row; enqueue worker |
| `getJobStatus` | **Fly worker** (or shared poller module) | US-8.4 poller | Long/unbounded poll — **not** in Vercel Route Handler loop |
| `fetchAsset` | **Fly worker** | US-8.4 / US-8.2 on terminal success | HTTP GET + Storage upload; may run minutes |

**Env:** Worker uses same `process.env[envKeyName]` names as Vercel; service-role Supabase on worker.

**US-8.1 BUILD:** Document + test interface only — no poller wiring (US-8.4).

```
┌─────────────┐     createJob      ┌──────────────────┐
│ Vercel App  │ ─────────────────► │ neuramark_video  │
│             │     estimateCost   │ _jobs (US-8.2)   │
└─────────────┘                    └────────┬─────────┘
                                            │ enqueue
                                            ▼
                                   ┌──────────────────┐
                                   │ Fly.io worker    │
                                   │ getJobStatus loop│
                                   │ fetchAsset       │
                                   │ (FFmpeg US-9.x)  │
                                   └──────────────────┘
```

---

## `fetchAsset` storage contract

**Goal:** Download-and-own — never persist long-lived third-party URLs as source of truth (SPEC §3 S3.M9).

### Real adapter behavior (US-8.2+ — frozen interface)

| Step | Rule |
|------|------|
| 1 | Receive `externalJobId` + optional `rawOutputUrl` from poller (in-memory from `getJobStatus`) |
| 2 | If no URL, adapter may call vendor status API again server-side |
| 3 | `validateProviderOutputUrl(rawOutputUrl, allowedHosts)` |
| 4 | Server-side **HTTPS GET** (stream); size/MIME checks; timeout per adapter |
| 5 | Upload to Supabase Storage bucket (region **`us-east-1`** / worker **`iad`**) under **server-generated** key |
| 6 | INSERT `neuramark_media_assets` (US-8.2) with `storage_key`, `mime_type`, `size_bytes`, `client_id` |
| 7 | Return **`StoredMediaAsset`** — `storageKey` only; **forbid** provider URL in return |
| 8 | `actualCostCents` from vendor billing metadata when present (US-7.3 handoff) |
| 9 | Clear `rawOutputUrl` from orchestrator memory after success |

### Storage key shape (production — US-8.2)

```
neuramark/{clientId}/{reelScriptId}/{uuid}.mp4
```

- **`{uuid}`** = `crypto.randomUUID()` — **not** `external_job_id`.
- Stubs use `stub/{providerKey}/{externalJobId}.mp4` for tests only.

### Forbidden

- Persisting `rawOutputUrl` on `neuramark_video_jobs.output_url` as canonical (transient poll window only until `fetchAsset` completes).
- Client-visible provider CDN URLs.
- Fetching URLs not validated against allowlist.

---

## Zod schemas (extend `lib/contracts/providers.ts`)

**Already shipped (US-X.4 / US-7.2):** `videoJobStatusSchema`, `createVideoJobResultSchema`, `videoJobStatusResultSchema`, `storedMediaAssetSchema`, `resolvedCreateVideoJobInputSchema`, `createVideoJobRequestSchema`.

**US-8.1 additions (stub in contracts — BUILD implements usage):**

```ts
export const PROVIDER_ADAPTER_NOT_FOUND = "PROVIDER_ADAPTER_NOT_FOUND" as const;

export const costEstimateSchema = z.object({
  estimatedCostCents: z.number().int().nonnegative(),
  currency: z.literal("USD"),
  providerKey: z.string().min(1),
  breakdown: z.record(z.string(), z.number()).optional(),
});

export const persistedVideoJobStatusSchema = videoJobStatusResultSchema.omit({
  rawOutputUrl: true,
});

export type PersistedVideoJobStatus = z.infer<typeof persistedVideoJobStatusSchema>;
```

**`createVideoJobResultSchema`:** use `externalJobId: externalJobIdSchema`.

**Cliente / Operator status DTOs (US-8.4):** use **`persistedVideoJobStatusSchema`** subset — no `rawOutputUrl`.

---

## `VideoJobStatusResult` semantics

```ts
export interface VideoJobStatusResult {
  status: VideoJobStatus;
  progressPercent?: number;
  sanitizedErrorMessage?: string;
  /** Transient — server download only; NEVER persisted or client-exposed */
  rawOutputUrl?: string;
}
```

| Field | Persist | Client API |
|-------|---------|------------|
| `status` | Yes | Yes (mapped label) |
| `progressPercent` | Optional | Optional |
| `sanitizedErrorMessage` | Yes (failed jobs) | Operator yes; Cliente generic only (US-8.4) |
| `rawOutputUrl` | **Never** | **Never** |

---

## Server-only modules (frozen)

| Module | `import "server-only"` |
|--------|------------------------|
| `lib/providers/provider-adapters.ts` | **Yes** (existing) |
| `lib/providers/create-provider-registry.ts` | **Yes** |
| `lib/providers/normalize-provider-response.ts` | **Yes** |
| `lib/providers/video/create-stub-video-adapter.ts` | **Yes** |
| `lib/providers/video/*.ts` (future vendor adapters) | **Yes** |
| `lib/contracts/providers.ts` | **No** — FE-safe types/schemas only |

---

## Policy-engine integration (consume only)

```ts
import { resolveProviderForJob } from "@/lib/providers/resolve-provider-for-job";
import { getProviderRegistry } from "@/lib/providers/create-provider-registry";

const decision = await resolveProviderForJob({ /* server-trusted context */ });
const registry = getProviderRegistry();
const adapter = registry.getVideoAdapter(decision.providerKey);
const estimate = await adapter.estimateCost({
  ...resolvedInput,
  providerKey: decision.providerKey,
  providerTier: decision.providerTier,
  assetRole: decision.assetRole === "broll" ? "broll" : "primary",
});
```

**`estimateVideoJobCost`:** BUILD may default `registry` arg to `getProviderRegistry()` when omitted — preserve backward compatibility for explicit registry in tests.

---

## Automated tests (BUILD)

**File:** `lib/providers/provider-adapters.test.ts` (or split `provider-registry.test.ts` + `normalize-provider-response.test.ts`)

| # | Test | Assertion |
|---|------|-----------|
| 1 | Registry singleton | Two `getProviderRegistry()` calls === same instance |
| 2 | Stub registration | `getVideoAdapter("sadtalker_low")` returns adapter with four methods |
| 3 | Missing adapter | `getVideoAdapter("unknown_key")` throws **`ProviderAdapterNotFoundError`** with `code === PROVIDER_ADAPTER_NOT_FOUND` |
| 4 | Second register after freeze | `registerVideo` after init throws **`RegistryFrozenError`** |
| 5 | Stub round-trip | `createJob` → `getJobStatus` → `fetchAsset` succeeds; statuses ⊆ `VIDEO_JOB_STATUSES` |
| 6 | `externalJobIdSchema` | Rejects `../evil`, `/`, `\`, overlong (>512), empty |
| 7 | `normalizeProviderJobStatus` | `"RUNNING"` → `processing`; `"bogus"` → `failed` |
| 8 | `sanitizeProviderErrorMessage` | `"Bearer sk-test"` redacted; empty → generic fallback |
| 9 | `videoJobStatusResultSchema` | Rejects non-enum status; rejects non-https `rawOutputUrl` |
| 10 | `persistedVideoJobStatusSchema` | Rejects object with `rawOutputUrl` key |
| 11 | `server-only` | `provider-adapters.ts` and `create-provider-registry.ts` contain `import "server-only"` |
| 12 | Register grep | `registerVideo(` appears only in `create-provider-registry.ts` (+ test files) |
| 13 | Vendor fetch grep | No `replicate.com` / `heygen` / provider hosts outside `lib/providers/**` (except tests) |
| 14 | `estimateVideoJobCost` | Integration with stub registry + catalog fixture returns estimate |

**Harness:** Reuse `withServerOnlyStub` / `loadProviderAdapters` from `providers.test.ts` where applicable.

---

## BUILD file checklist

| Path | Action |
|------|--------|
| `lib/contracts/providers.ts` | Add `externalJobIdSchema`, `costEstimateSchema`, `persistedVideoJobStatusSchema`, `PROVIDER_ADAPTER_NOT_FOUND`; wire `createVideoJobResultSchema` |
| `lib/providers/provider-adapters.ts` | `ProviderAdapterNotFoundError`; `ExternalJobId` on interface; frozen registry throws |
| `lib/providers/normalize-provider-response.ts` | **New** — three helpers + optional composer |
| `lib/providers/create-provider-registry.ts` | **New** — factory + singleton |
| `lib/providers/video/create-stub-video-adapter.ts` | **New** — stub factory |
| `lib/providers/index.ts` | Export `getProviderRegistry` |
| `lib/providers/provider-adapters.test.ts` | **New** — test matrix above |

**No migration.** **No Route Handlers.** **No FE.**

---

## Downstream handoff

| Story | Receives from US-8.1 |
|-------|---------------------|
| US-8.2 | Real `sadtalker_low` adapter; `fetchAsset` Storage upload; job DDL uses `externalJobIdSchema` |
| US-8.4 | Poller calls `getJobStatus` on Fly; `persistedVideoJobStatusSchema` for writes; `sanitizeProviderErrorMessage` |
| US-8.5 / US-8.6 / US-8.7 | Register real adapters in `createProviderRegistry`; host allowlists in `validateProviderOutputUrl` |
| US-9.x | Assembly consumes `StoredMediaAsset.storageKey` only |
| US-7.3 | `actualCostCents` from `storedMediaAssetSchema` |

---

## Gate status

| Gate | Status |
|------|--------|
| SPEC-REVIEW | Gaps resolved by this contract |
| SECURITY | APPROVE WITH CONDITIONS — reconciled in § SECURITY reconciliation |
| CONTRACT | **Frozen** — 2026-08-29 |
| BUILD | Pending |
| VALIDATION | Pending |
| QA | Pending |
