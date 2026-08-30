# US-8.6 — MuseTalk adapter (low-tier talking-head alternative)

**Priority:** P0  
**Depends on:** US-8.1 ✅ adapter interface + registry + normalizers · US-X.4 ✅ `musetalk_low` catalog seed · US-7.2 ✅ policy routes loop → `musetalk_low` · US-8.4 ✅ job orchestration + poller + Operator UI · US-8.2 ✅ SadTalker adapter pattern · US-3.1 ✅ generic_avatar · US-3.4 ✅ disclosure rules (SEC). **Soft:** US-9.3 (voiceover asset — pre-uploaded OK).  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-8.6 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **media-pipeline-engineer** + **nextjs-backend** (`docs/development/AGENT-ROSTER.md` Phase 4). **Reviewed by FE: N/A** — BE-only BUILD.  
**Canonical terms:** **provider adapter** · **provider key** · **bucle de referencia** · **external job id** · **download-and-own**. Avoid CONTEXT _Evitar_ list in product-facing copy.

## Out of scope (do not implement here)

- **FE** — status badges, retry UI, EN/ES (US-8.4 ✅ — reuse as-is).
- **New job orchestration** — poller, stale timeout, retry lineage (US-8.4 ✅).
- **`neuramark_video_jobs` migration / new columns** — PO freeze; reuse table + `portrait_asset_id` semantic for loop video on MuseTalk rows.
- **US-8.2 SadTalker adapter changes** — except orchestrator branching (keep SadTalker reject of `referenceVideoAssetId`).
- **US-9.3 TTS synthesis** — consume `voiceoverAssetId` from existing `media_assets` only.
- **Operator SadTalker↔MuseTalk override UI** — P1 defer; policy-only V1.
- **Live Replicate integration tests** — mocked HTTP only in BUILD.
- **Wan / HeyGen adapter bodies** — US-8.5 / US-8.7.
- **Assembly / FFmpeg** — US-9.x.

## Scope split

| Concern | Owner |
|---------|--------|
| Real `musetalk_low` `VideoProviderAdapter` (Replicate) | **US-8.6 Phase A** BE |
| `lib/contracts/musetalk-low.ts` constants | **US-8.6 Phase A** BE |
| Registry: register `musetalk_low` + bootstrap catalog row | **US-8.6 Phase A** BE |
| `estimateCost` from catalog `per_run` / **19¢** | **US-8.6 Phase A** BE |
| `createJob` / `getJobStatus` / `fetchAsset` + US-8.1 normalizers | **US-8.6 Phase A** BE |
| Mocked-HTTP adapter tests + registry regression | **US-8.6 Phase A** BE |
| Unlock `createTalkingHeadVideoJob` for `musetalk_low` | **US-8.6 Phase B** BE |
| Server-side reference-loop video asset resolution | **US-8.6 Phase B** BE |
| Extend asset URL resolver for video input kind | **US-8.6 Phase B** BE |
| Policy `resolveProviderForJob` | **US-7.2** ✅ (unchanged) |
| Job row persistence + poller + retry + status UI | **US-8.4** ✅ |
| Voiceover from US-9.3 TTS job | **US-9.3** (soft — fixture OK) |

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Branch | **`feature/US-8.6-musetalk-adapter`** |
| Module | **`lib/providers/video/musetalk-low-adapter.ts`** (`import "server-only"`) |
| Constants | **`lib/contracts/musetalk-low.ts`** — mirror `sadtalker-low.ts` shape |
| Factory | **`createMusetalkLowAdapter(params)`** — `defaultEstimateCents` from catalog bootstrap |
| Provider key | **`musetalk_low`** · **`videoAssetRole: primary`** |
| Env | **`REPLICATE_API_TOKEN`** via `process.env[envKeyName]`; missing → **`PROVIDER_CONFIG_MISSING`** |
| Vendor API | Replicate Predictions API — CONTRACT freezes **`douwantech/musetalk`** version hash + input map |
| `estimateCost` | Flat **`per_run`** — seed **19¢** (`unitCostCents: 19`) |
| `createJob` inputs | **`referenceVideoAssetId`** + **`voiceoverAssetId`** required; reject portrait still fields |
| `createJob` output | `{ externalJobId, status: "queued", estimatedCostCents }` — Replicate prediction id |
| `getJobStatus` | Poll Replicate; **`normalizeVideoJobStatusResult(vendor, MUSETALK_ALLOWED_OUTPUT_HOSTS)`** |
| `fetchAsset` | Same hardened download as SadTalker → Storage → **`storedMediaAssetSchema`** |
| Output hosts | Replicate delivery CDN allowlist (CONTRACT lists; lean: reuse SadTalker set) |
| Video input MIME | **`video/mp4`**, **`video/quicktime`** for reference loop resolver |
| Audio input MIME | Same as SadTalker (`audio/wav`, `audio/mpeg`, `audio/mp4`, `video/mp4`) |
| Registry | Add **`musetalk_low`** to **`createProviderRegistry`**; extend **`buildBootstrapCatalog()`** seed row |
| Orchestrator | Accept **`sadtalker_low` \| `musetalk_low`**; remove **`museTalkNotSupported`** blanket reject |
| Loop asset helper | **`getPrimaryReferenceLoopVideoAssetForClient(clientId)`** — earliest video `avatar_reference` |
| Job row FK | MuseTalk: store loop video id in **`portrait_asset_id`** (no DDL) |
| Consent gate | **`assertActiveAvatarConsentForJobs`** only for **`own_avatar`** — MuseTalk is **`generic_avatar`** path |
| Voiceover | Required **`voiceoverAssetId`**; US-9.3 TTS not blocking for V1 tests |
| Implementers | **media-pipeline-engineer** (adapter) + **nextjs-backend** (CONTRACT, orchestrator, tests) |

### Catalog row (US-X.4 seed — do not change in US-8.6)

| Field | Value |
|-------|-------|
| `key` | `musetalk_low` |
| `asset_role` | `talking_head` |
| `tier` | `low` |
| `active` | `true` |
| `env_key_name` | `REPLICATE_API_TOKEN` |
| `capabilities` | `{ "prefersReferenceLoop": true }` |
| `cost_model` | `{ "billingUnit": "per_run", "unitCostCents": 19, "metadata": { "vendor": "replicate" } }` |

### MuseTalk input matrix (CONTRACT freezes)

| Visual path | Required assets | Forbidden |
|-------------|-----------------|-----------|
| **`generic_avatar` + reference loop** (policy → `musetalk_low`) | `referenceVideoAssetId` (server-resolved) + `voiceoverAssetId` | `portraitAssetId` / `referenceImageAssetId` on adapter |
| **`own_avatar` / generic still** (policy → `sadtalker_low`) | portrait still + `voiceoverAssetId` | `referenceVideoAssetId` on SadTalker adapter (unchanged) |

### Adapter method sketch (CONTRACT freezes exact signatures)

```ts
// lib/providers/video/musetalk-low-adapter.ts
export function createMusetalkLowAdapter(params: {
  defaultEstimateCents: number;
  resolveMediaAssetUrl?: (
    assetId: string,
    clientId: string,
    kind: "video" | "audio",
  ) => Promise<string>;
  uploadGeneratedVideo?: (args: UploadGeneratedVideoArgs) => Promise<UploadGeneratedVideoResult>;
  fetchImpl?: typeof fetch;
  initialJobContexts?: Map<ExternalJobId, JobContext>;
}): VideoProviderAdapter;
```

### Replicate createJob flow (Phase A BUILD)

```ts
// 1. Validate env REPLICATE_API_TOKEN
// 2. Validate referenceVideoAssetId + voiceoverAssetId present; reject portrait still ids
// 3. Resolve referenceVideoAssetId → video URL (video MIME allowlist)
// 4. Resolve voiceoverAssetId → audio URL
// 5. POST https://api.replicate.com/v1/predictions { version, input: { video, audio, bbox_shift?, cycle? } }
// 6. Return { externalJobId: prediction.id, status: "queued", estimatedCostCents }
```

### Registry registration (Phase A BUILD)

```ts
// lib/providers/create-provider-registry.ts
import { createMusetalkLowAdapter } from "@/lib/providers/video/musetalk-low-adapter";

// Register musetalk_low alongside sadtalker_low (not a stub)
registry.registerVideo(
  createMusetalkLowAdapter({ defaultEstimateCents: estimateCentsFromCatalog(catalog, "musetalk_low", 19) }),
);
```

### Orchestrator unlock (Phase B BUILD)

```ts
// lib/video-jobs/create-talking-head-video-job.ts
// 1. Remove early return on input.referenceVideoAssetId
// 2. After resolveProviderForJob:
//    - if providerKey === musetalk_low: require script.hasReferenceLoop
//    - resolve referenceVideoAssetId server-side (helper) unless operator override in options
//    - skip portraitAssetId requirement
//    - if providerKey === sadtalker_low: existing portrait + voiceover path (unchanged)
// 3. Allow providerKey in { sadtalker_low, musetalk_low } — reject others with PROVIDER_UNAVAILABLE
// 4. INSERT job: portrait_asset_id = referenceVideoAssetId for musetalk_low rows
// 5. resolvedInput includes referenceVideoAssetId for MuseTalk adapter.createJob
```

## Carry-forwards / reuse (do not reinvent)

- Pattern: `lib/providers/video/sadtalker-low-adapter.ts` (US-8.2 ✅).
- Constants pattern: `lib/contracts/sadtalker-low.ts`.
- Interface: `lib/providers/provider-adapters.ts` — **`VideoProviderAdapter`** (US-8.1).
- Normalizers: `lib/providers/normalize-provider-response.ts`.
- Registry: `lib/providers/create-provider-registry.ts`.
- Orchestrator: `lib/video-jobs/create-talking-head-video-job.ts` (US-8.4 ✅).
- Poller / retry / status: US-8.4 modules — provider-agnostic.
- Asset resolver: `lib/media/resolve-media-asset-url-for-provider.ts` + M1 route (US-8.4 ✅).
- Loop detection: `lib/media/has-reference-loop-asset-for-client.ts`.
- Policy: `lib/providers/resolve-provider-for-job.ts` (US-7.2 ✅).
- Display label: `lib/providers/resolve-provider-display-label.ts` — **`musetalk_low: "MuseTalk"`** already seeded.
- Security baseline: `plan/SECURITY_BASELINE.md` § Video Provider; US-8.2 / US-8.4 SECURITY.md.
- US-8.4 CONTRACT: phased BUILD note — US-8.6 reuses job table + UI patterns.

---

## FE checklist

**No FE work** — N/A for US-8.6 BUILD (USER_STORIES FE row → US-8.4 ✅).

- [ ] _Intentionally empty — Operator status UI is US-8.4._

---

## BE checklist

Concrete consumers: **`createTalkingHeadVideoJob()`** · US-8.4 poller · **`retryVideoJob`** · **`estimateVideoJobCost()`** (if wired).

### Phase A — MuseTalk adapter

- [x] **`lib/contracts/musetalk-low.ts`** — env key, model version, input fields, MIME allowlists, output hosts, fetch limits.
- [x] **`lib/providers/video/musetalk-low-adapter.ts`** — implement **`VideoProviderAdapter`** for **`musetalk_low`** / **`primary`**.
- [x] **`estimateCost`** — return catalog flat **`per_run`** cents (**19** from bootstrap).
- [x] **`createJob`** — validate `referenceVideoAssetId` + `voiceoverAssetId`; reject portrait still ids; POST Replicate prediction.
- [x] **`getJobStatus`** — GET prediction; **`normalizeVideoJobStatusResult`**; allowlisted **`rawOutputUrl`** only when terminal.
- [x] **`fetchAsset`** — **`validateProviderOutputUrl`** → download → Storage upload → **`storedMediaAssetSchema`**; job context map for poller L1.
- [x] **Registry** — register **`createMusetalkLowAdapter`**; add **`musetalk_low`** to **`buildBootstrapCatalog()`**.
- [x] **Asset resolver seam** — injectable **`resolveMediaAssetUrl(assetId, clientId, kind)`** with **`video`** + **`audio`** kinds (extend default impl or shared helper).
- [x] **[SEC] `server-only`**; token never logged/returned; untrusted JSON sanitized; output URL allowlist; opaque **`external_job_id`**.
- [x] **`lib/providers/video/musetalk-low-adapter.test.ts`** — mocked HTTP round-trip; missing env; invalid MIME; sanitized errors.
- [x] **Update registry tests** — **`getVideoAdapter("musetalk_low")`** returns real adapter.

### Phase B — Orchestrator wiring

- [x] **`getPrimaryReferenceLoopVideoAssetForClient`** (or equivalent) — server-only; earliest video **`avatar_reference`** by `created_at ASC`.
- [x] **`create-talking-head-video-job.ts`** — accept **`musetalk_low`** from policy; remove **`museTalkNotSupported`** early reject.
- [x] **Branch inputs** — MuseTalk: resolve loop video id + voiceover; SadTalker: existing portrait path unchanged.
- [x] **Provider guard** — allow only **`sadtalker_low` \| `musetalk_low`** for Phase B talking-head create (reject Wan/HeyGen here).
- [x] **Job INSERT** — MuseTalk rows: **`portrait_asset_id`** = reference loop video asset id; **`voiceover_asset_id`** set.
- [x] **`resolvedCreateVideoJobInput`** — include **`referenceVideoAssetId`** for MuseTalk **`adapter.createJob`**.
- [x] **Retry path** — re-resolve policy + assets; MuseTalk retries stay on loop path when `hasReferenceLoop`.
- [x] **Orchestrator tests** — mocked registry: policy selects **`musetalk_low`** → create succeeds with loop + voiceover fixtures.
- [x] **No new Route Handlers** — reuse US-8.4 surfaces.

---

## DB checklist

All objects keep `neuramark_` prefix. **No migration in US-8.6 BUILD** (PO freeze).

- [x] **No CREATE / ALTER `neuramark_video_jobs`** — reuse US-8.4 DDL; document **`portrait_asset_id`** overload for MuseTalk in CONTRACT.
- [x] **No catalog seed changes** — `musetalk_low` row from US-X.4 is authoritative.
- [x] RLS deny-by-default unchanged; service-role Node only.

---

## Gates (orchestrator)

- [x] SPEC-REVIEW.md (spec-guardian)
- [x] SECURITY.md (security-architect)
- [x] CONTRACT.md authored (nextjs-backend — frozen; **Reviewed by FE: N/A**)
- [x] BUILD (media-pipeline-engineer + nextjs-backend — Phase A + Phase B)
- [x] VALIDATION.md (requirements-validator — PASS WITH NOTES)
- [x] QA.md (qa-engineer — APPROVE WITH CONDITIONS)

**Status:** CLOSED (2026-08-30). V1 scope complete; 4/5 AC checked in `plan/USER_STORIES.md` (operator override P1 defer). **Next:** **US-8.5** Wan B-roll adapter or **SELECT** next Sprint 4 story.

---

## Open questions (for SPEC / SECURITY / CONTRACT)

1. **Replicate model slug?** **PO lean:** **`douwantech/musetalk`** — CONTRACT documents exact `version` hash; upgrade via code change.
2. **Raw `fetch` vs Replicate SDK?** **PO lean:** **`fetch`** (mirror SadTalker / SiliconFlow pattern).
3. **Output host allowlist?** **PO lean:** reuse **`SADTALKER_ALLOWED_OUTPUT_HOSTS`** constants under MuseTalk namespace unless SECURITY requires split.
4. **Multiple loop videos per client?** **PO lean:** pick **earliest** `created_at` video `avatar_reference` — CONTRACT may allow operator override via create options later.
5. **`portrait_asset_id` semantic overload?** **PO lean:** **yes** for V1 — avoids migration; CONTRACT documents per-`provider_key` meaning on job row.
6. **`resolveMediaAssetUrlForProvider` kind param?** **PO lean:** extend with **`kind: "video" | "audio" | "portrait"`** — default impl selects MIME allowlist by kind.
7. **Replicate optional inputs (`bbox_shift`, `cycle`)?** **PO lean:** freeze defaults in CONTRACT (`bbox_shift: 0`, `cycle: true` for smooth loop).
8. **Operator SadTalker override when loop exists?** **PO lean:** **out of scope V1** — policy wins; P1 story if needed.
9. **Partial AC in VALIDATION?** **PO lean:** Phase A validates adapter; Phase B validates orchestrator E2E with fixture voiceover — full AC needs loop asset + audio fixtures.
10. **US-3.4 SEC AC evidence?** **PO lean:** document in VALIDATION that adapter does not skip QA — disclosure enforced downstream (US-10.x).

No SPEC amendment assumed in PREP: SPEC §3 requires swappable video adapters with download-and-own — US-8.6 completes the MuseTalk leg of the low-tier talking-head matrix.
