# US-8.2 — SadTalker adapter (V1 default talking-head, low tier)

**Priority:** P0  
**Depends on:** US-8.1 ✅ adapter interface + registry + normalizers · US-X.4 ✅ `sadtalker_low` catalog seed · US-7.2 ✅ policy routes low talking-head → `sadtalker_low`  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-8.2 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **media-pipeline-engineer** + **nextjs-backend** (`docs/development/AGENT-ROSTER.md` Phase 4). **Reviewed by FE: N/A** — BE-only BUILD slice.  
**Canonical terms:** **provider adapter** · **provider key** · **asset role** · **external job id** · **download-and-own**. Avoid CONTEXT _Evitar_ list in product-facing copy.

## Out of scope (do not implement here)

- **FE** — status badges, retry UI, EN/ES (US-8.4).
- **Job orchestration** — poller, webhooks, stale timeout, retry lineage, `parent_job_id` (US-8.4).
- **`neuramark_video_jobs` DDL / INSERT / UPDATE** — PO freeze; orchestration story owns persistence.
- **Route Handlers / Server Actions** for job create or status.
- **Consent re-check (US-3.2) and budget gate (US-7.1)** at submit — orchestrator responsibility, not adapter internals.
- **Client-callable status endpoints** — US-8.4.
- **Live Replicate integration tests** — mocked HTTP only in BUILD.
- **MuseTalk / Wan / HeyGen adapter bodies** — remain stubs.
- **TTS synthesis** — US-9.3 produces `voiceoverAssetId`; adapter consumes it.
- **Assembly / FFmpeg** — US-9.x.

## Scope split

| Concern | Owner |
|---------|--------|
| Real `sadtalker_low` `VideoProviderAdapter` (Replicate) | **US-8.2** BE |
| Registry swap: stub → real adapter in `createProviderRegistry` | **US-8.2** BE |
| `estimateCost` from catalog `per_run` / `unitCostCents` | **US-8.2** BE |
| `createJob` / `getJobStatus` / `fetchAsset` + US-8.1 normalizers | **US-8.2** BE |
| Mocked-HTTP adapter tests + registry regression | **US-8.2** BE |
| Asset ID → signed/read URL resolution seam | **US-8.2** BE (CONTRACT freezes) |
| Policy engine `resolveProviderForJob` | **US-7.2** (unchanged) |
| Job row persistence + poller | **US-8.4** |
| Operator status UI / SSE | **US-8.4** FE |
| Full US-8.2 AC (E2E playable Reel, retries, SEC polling scope) | **US-8.2 + US-8.4 + US-9.3** |

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Module | **`lib/providers/video/sadtalker-low-adapter.ts`** (`import "server-only"`); delete **`sadtalker-low-stub-adapter.ts`** after swap |
| Factory | **`createSadtalkerLowAdapter(params)`** — `defaultEstimateCents` from catalog bootstrap (same pattern as stub factory today) |
| Provider key | **`sadtalker_low`** · **`videoAssetRole: primary`** |
| Env | **`REPLICATE_API_TOKEN`** via `process.env[envKeyName]`; missing → **`ProviderAdapterError`** code `PROVIDER_CONFIG_MISSING` before fetch |
| Vendor API | Replicate Predictions API (`POST /v1/predictions`, `GET /v1/predictions/{id}`) — CONTRACT freezes model version slug + input field map |
| `estimateCost` | Flat **`per_run`** from catalog — seed **10¢** (`unitCostCents: 10`); return **`costEstimateSchema`** shape |
| `createJob` inputs | **`voiceoverAssetId`** required; image from **`portraitAssetId`** (own avatar) or **`referenceImageAssetId`** (generic still); resolve to HTTPS URLs server-side |
| `createJob` output | `{ externalJobId, status: "queued", estimatedCostCents }` — id = Replicate prediction id, parsed with **`externalJobIdSchema`** |
| `getJobStatus` | Poll Replicate prediction; pipe through **`normalizeVideoJobStatusResult(vendor, ALLOWED_OUTPUT_HOSTS)`** |
| `fetchAsset` | **`validateProviderOutputUrl`** → stream download → Storage upload → **`storedMediaAssetSchema`**; key shape **`neuramark/{clientId}/{reelScriptId}/{uuid}.mp4`** |
| Output hosts | Frozen allowlist for Replicate delivery CDN hosts (CONTRACT lists exact suffixes) |
| HTTP in tests | Inject **`fetch`** or Replicate client mock — **no network in CI** |
| Registry | **`createProviderRegistry`** calls **`createSadtalkerLowAdapter`** instead of stub; update **`provider-adapters.test.ts`** expectations (no `stub-sadtalker_low-` ids) |
| Stubs retained | **`siliconflow_wan21_turbo`**, **`heygen_high`** — unchanged |
| Implementers | **media-pipeline-engineer** (adapter I/O) + **nextjs-backend** (CONTRACT, asset resolver, tests) |

### Catalog row (US-X.4 seed — do not change in US-8.2)

| Field | Value |
|-------|-------|
| `key` | `sadtalker_low` |
| `asset_role` | `talking_head` |
| `tier` | `low` |
| `active` | `true` |
| `env_key_name` | `REPLICATE_API_TOKEN` |
| `cost_model` | `{ "billingUnit": "per_run", "unitCostCents": 10, "metadata": { "vendor": "replicate" } }` |
| `capabilities` | `{}` |

### Adapter method sketch (CONTRACT freezes exact signatures)

```ts
// lib/providers/video/sadtalker-low-adapter.ts
export function createSadtalkerLowAdapter(params: {
  defaultEstimateCents: number;
  resolveMediaAssetUrl?: (assetId: string, clientId: string) => Promise<string>;
  uploadVideoBuffer?: (args: {
    clientId: string;
    reelScriptId: string;
    buffer: Buffer;
    mimeType: string;
  }) => Promise<{ storageKey: string; sizeBytes: number }>;
  fetchImpl?: typeof fetch;
}): VideoProviderAdapter;
```

### Replicate createJob flow (BUILD)

```ts
// 1. Validate env REPLICATE_API_TOKEN
// 2. Resolve portraitAssetId | referenceImageAssetId → source_image URL
// 3. Resolve voiceoverAssetId → driven_audio URL
// 4. POST https://api.replicate.com/v1/predictions { version, input: { source_image, driven_audio, ... } }
// 5. Return { externalJobId: prediction.id, status: "queued", estimatedCostCents }
```

### Registry swap (BUILD)

```ts
// lib/providers/create-provider-registry.ts
import { createSadtalkerLowAdapter } from "@/lib/providers/video/sadtalker-low-adapter";

case DEFAULT_LOW_TIER_PROVIDER_KEYS.talkingHead:
  return createSadtalkerLowAdapter({ defaultEstimateCents });
```

## Carry-forwards / reuse (do not reinvent)

- Interface: `lib/providers/provider-adapters.ts` — **`VideoProviderAdapter`** (US-8.1).
- Normalizers: `lib/providers/normalize-provider-response.ts` — **`normalizeVideoJobStatusResult`**, **`validateProviderOutputUrl`**, **`sanitizeProviderErrorMessage`**.
- Registry: `lib/providers/create-provider-registry.ts` — **`estimateCentsFromCatalog`**, **`createProviderRegistry`**, **`getProviderRegistry`**.
- Contracts: `lib/contracts/providers.ts` — **`resolvedCreateVideoJobInputSchema`**, result schemas, **`externalJobIdSchema`**.
- Stub to replace: `lib/providers/video/sadtalker-low-stub-adapter.ts`.
- LLM HTTP pattern: `lib/providers/siliconflow-llm-adapter.ts` (Bearer auth, server-only fetch).
- Media upload pattern: `lib/media/upload-avatar-reference-asset.ts` (Storage put + DB row — `fetchAsset` may reuse storage helper).
- Tests harness: `lib/providers/provider-adapters.test.ts` — update SadTalker assertions after swap.
- Security baseline: `plan/SECURITY_BASELINE.md` § Video Provider Adapter; US-8.1 SECURITY.md threat model.

---

## FE checklist

**No FE work** — N/A for US-8.2 BUILD (USER_STORIES FE row → US-8.4).

- [ ] _Intentionally empty — job status UI is US-8.4._

---

## BE checklist

Concrete consumers: **US-8.4** poller/orchestrator · **`estimateVideoJobCost()`** (already resolves registry) · future create-job Server Action.

- [ ] **`lib/providers/video/sadtalker-low-adapter.ts`** — implement **`VideoProviderAdapter`** for **`sadtalker_low`** / **`primary`**.
- [ ] **`estimateCost`** — return catalog flat **`per_run`** cents (`defaultEstimateCents` from registry bootstrap).
- [ ] **`createJob`** — validate required asset IDs; resolve image + audio URLs; POST Replicate prediction; return **`createVideoJobResultSchema`**-compatible result.
- [ ] **`getJobStatus`** — GET Replicate prediction; map via **`normalizeVideoJobStatusResult`**; set **`rawOutputUrl`** only when status terminal + URL allowlisted.
- [ ] **`fetchAsset`** — **`validateProviderOutputUrl`** → download → Storage upload → **`storedMediaAssetSchema`** parse.
- [ ] **Remove** **`sadtalker-low-stub-adapter.ts`**; update imports in **`create-provider-registry.ts`**.
- [ ] **Registry** — register real adapter in **`createProviderRegistry`**; catalog bootstrap estimate still **10¢** from seed row.
- [ ] **Asset resolver seam** — injectable **`resolveMediaAssetUrl(assetId, clientId)`** (CONTRACT freezes default impl: service-role read from `neuramark_media_assets` + signed URL).
- [ ] **Storage seam** — injectable upload helper for tests (default: Supabase Storage put).
- [ ] **[SEC] `server-only`** on adapter module; **`REPLICATE_API_TOKEN`** never logged or returned.
- [ ] **[SEC] Untrusted vendor JSON** — no spread into results; errors sanitized.
- [ ] **[SEC] Output URL allowlist** — reject non-Replicate hosts before fetch.
- [ ] **[SEC] `external_job_id`** — opaque; no path/SQL interpolation.
- [ ] **`lib/providers/video/sadtalker-low-adapter.test.ts`** — mocked HTTP: create → status (processing → completed) → fetchAsset round-trip; missing env throws; invalid URL rejected; error message sanitized.
- [ ] **Update `provider-adapters.test.ts`** — SadTalker adapter is real (no `stub-sadtalker_low-` prefix); vendor host grep allows `replicate.com` under `lib/providers/video/sadtalker-low-adapter.ts`.
- [ ] **No new Route Handlers** — regression unchanged.

---

## DB checklist

All objects keep `neuramark_` prefix. **No migration in US-8.2 BUILD** (PO freeze).

- [ ] **No CREATE `neuramark_video_jobs`** — US-8.4 / orchestration slice.
- [ ] **No catalog seed changes** — `sadtalker_low` row from US-X.4 is authoritative.
- [ ] RLS deny-by-default unchanged; service-role Node only.

---

## Gates (orchestrator)

- [ ] SPEC-REVIEW.md (spec-guardian)
- [ ] SECURITY.md (security-architect)
- [x] CONTRACT.md authored (nextjs-backend — frozen; **Reviewed by FE: N/A**)
- [ ] BUILD (media-pipeline-engineer + nextjs-backend)
- [ ] VALIDATION.md (requirements-validator)
- [ ] QA.md (qa-engineer)

**Status:** PREP complete. **Next:** SPEC-REVIEW → SECURITY → CONTRACT on branch `feature/US-8.2-sadtalker-adapter`.

---

## Open questions (for SPEC / SECURITY / CONTRACT)

1. **Replicate model version slug?** **PO lean:** freeze constant in adapter (e.g. `cjwbw/sadtalker` version hash) — CONTRACT documents exact `version` id; upgrade via code change, not catalog.
2. **Raw `fetch` vs `replicate` npm package?** **PO lean:** **`fetch`** to Replicate REST (mirror `siliconflow-llm-adapter.ts`) — avoid new dependency unless SECURITY prefers official SDK.
3. **Asset URL resolution — signed URL TTL?** **PO lean:** short-lived signed URL from Storage at `createJob` time; CONTRACT defines helper in `lib/media/` reused by adapter factory default.
4. **`fetchAsset` INSERT `neuramark_media_assets`?** **PO lean:** adapter returns **`StoredMediaAsset`** only in BUILD; orchestrator INSERT deferred to US-8.4 — unless CONTRACT folds minimal INSERT into adapter for download-and-own completeness.
5. **Generic avatar `referenceImageAssetId` vs `portraitAssetId`?** **PO lean:** accept either; prefer `portraitAssetId` when both set (own avatar path).
6. **Replicate delivery host allowlist?** **PO lean:** `replicate.delivery`, `pbxt.replicate.delivery`, `*.replicate.delivery` — SECURITY confirms suffix rules.
7. **`actualCostCents` in `fetchAsset`?** **PO lean:** default to **`estimatedCostCents`** when Replicate omits billing metadata (US-7.3 handoff).
8. **Partial AC closure in VALIDATION?** **PO lean:** **yes** — BUILD validates adapter + registry + mocked I/O; full USER_STORIES AC needs US-8.4 + US-9.3 orchestration (document in VALIDATION.md).
9. **Delete stub adapter file entirely?** **PO lean:** **yes** — no production stub path for `sadtalker_low` after BUILD.
10. **Bootstrap catalog in tests?** **PO lean:** keep **`buildBootstrapCatalog()`** `sadtalker_low` row aligned with migration (10¢, `REPLICATE_API_TOKEN`).

No SPEC amendment assumed in PREP: SPEC §3 requires swappable SadTalker adapter with download-and-own — US-8.2 delivers the real adapter module; orchestration completes the user-visible flow in US-8.4.
