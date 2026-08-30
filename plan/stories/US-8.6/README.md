# US-8.6 — MuseTalk adapter (low-tier talking-head alternative)

**Status:** PREP — story folder + PO decisions frozen (2026-08-30). Gates pending: SPEC-REVIEW · SECURITY · CONTRACT · BUILD · VALIDATION · QA.

**As a** System, **I want** MuseTalk lip-sync via a cloud API, **so that** generic-avatar mode can use a reference video loop when SadTalker is not the best fit.

Ship **server-only Replicate MuseTalk adapter** for catalog key **`musetalk_low`**: implement **`VideoProviderAdapter`** behind **`REPLICATE_API_TOKEN`** (same env as SadTalker); wire **`createMusetalkLowAdapter`** in **`getProviderRegistry()`** / **`initializeProviderRegistryFromCatalog()`**; implement **`estimateCost`** from catalog **`cost_model`** (**19¢** per-run baseline); pipe **`createJob` / `getJobStatus` / `fetchAsset`** through US-8.1 normalization helpers; cover with **mocked-HTTP unit tests only**. **Phase B (same story):** unlock **`createTalkingHeadVideoJob()`** for policy-selected **`musetalk_low`** (reference video loop + voiceover audio); resolve reference-loop asset **server-side**; reuse **US-8.4** poller, job rows, retry lineage, and **`/operator/scripts`** status UI — **no new FE**. **US-9.3 TTS not required for V1 slice** — voiceover via existing **`neuramark_media_assets`** row (`voiceoverAssetId`) is acceptable for adapter + orchestrator E2E.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-8.6 (**intentionally unchecked** until VALIDATION).

**This folder:** [`plan/stories/US-8.6/`](./) — `README.md` · `TASKS.md` (gates: `SECURITY.md` · `CONTRACT.md` · `VALIDATION.md` · `QA.md` — create when story enters sprint).

**Branch:** `feature/US-8.6-musetalk-adapter`

**Depends on:** [US-8.1](../US-8.1/) ✅ `VideoProviderAdapter` · normalizers · registry · [US-X.4](../US-X.4/) ✅ catalog seed `musetalk_low` · `REPLICATE_API_TOKEN` · `per_run` / **19¢** · `prefersReferenceLoop` · [US-7.2](../US-7.2/) ✅ policy routes `generic_avatar` + loop → `musetalk_low` · [US-8.4](../US-8.4/) ✅ `neuramark_video_jobs` · poller · retry UI · M1 provider-assets route · [US-8.2](../US-8.2/) ✅ SadTalker adapter pattern · [US-3.1](../US-3.1/) ✅ generic_avatar mode · [US-3.4](../US-3.4/) ✅ disclosure rules (SEC). **Soft:** [US-9.3](../../USER_STORIES.md) (TTS orchestration — fixture / pre-uploaded audio OK).

**Unblocks:** Full **`generic_avatar` + reference loop** talking-head path at low tier · [US-9.1](../../USER_STORIES.md) assembly (primary video from loop lip-sync) · operator-visible MuseTalk jobs on existing US-8.4 status surfaces.

---

## Scope in

| Area | What US-8.6 BUILD adds |
|------|------------------------|
| **FE** | — (reuses US-8.4 status badges, retry UI, EN/ES — provider-agnostic) |
| **BE Phase A** | **`lib/providers/video/musetalk-low-adapter.ts`** — real Replicate MuseTalk `VideoProviderAdapter` (`providerKey: musetalk_low`, `videoAssetRole: primary`); **`lib/contracts/musetalk-low.ts`** constants (model version, input fields, MIME allowlists, output hosts); **register** in **`lib/providers/create-provider-registry.ts`** (+ bootstrap catalog row); **`estimateCost`** from catalog (**19¢**); **`createJob`** → reference **video** URL + voiceover **audio** URL; **`getJobStatus`** / **`fetchAsset`** mirror SadTalker hardened download; **mocked-HTTP tests** in `lib/providers/video/musetalk-low-adapter.test.ts`. |
| **BE Phase B** | **`lib/video-jobs/create-talking-head-video-job.ts`** — accept **`musetalk_low`** when `resolveProviderForJob` selects it; **server-resolve** reference-loop video asset id (not client authority); reject SadTalker when loop path required; pass **`referenceVideoAssetId`** on **`resolvedCreateVideoJobInput`**; extend **`resolveMediaAssetUrlForProvider`** kind seam for **video** inputs; **retry** path unchanged (re-resolves policy + assets). Optional helper **`getPrimaryReferenceLoopVideoAssetForClient`**. |
| **DB** | — (reuse **`neuramark_video_jobs`**; **`portrait_asset_id`** stores reference-loop video asset id for MuseTalk jobs — semantic documented in CONTRACT; no migration in V1 slice) |
| **Implementers** | **media-pipeline-engineer** (adapter + Replicate I/O) + **nextjs-backend** (`CONTRACT.md`, asset resolver seam, orchestrator wiring, tests). **Reviewed by FE: N/A** — no FE BUILD. |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **US-8.4** job table / poller / status UI | ✅ Closed — consume as-is. |
| **US-8.2** SadTalker adapter body | ✅ Closed — unchanged except orchestrator branching. |
| **US-8.3** manual upload | Separate story. |
| **US-8.5 / US-8.7** Wan / HeyGen | Other adapter stories. |
| **New Operator UI** | Badges/retry already provider-agnostic on **`/operator/scripts`**. |
| **US-9.3** TTS synthesis orchestration | Voiceover asset assumed present; pre-uploaded / fixture audio OK for V1 E2E. |
| **Assembly / FFmpeg** | US-9.x / Fly worker (ADR-0003). |
| **Live Replicate integration tests** | BUILD uses **mocked HTTP** only. |
| **`neuramark_video_jobs` DDL change** | PO freeze: no new columns; reuse `portrait_asset_id` FK for loop video audit on MuseTalk rows. |
| **Operator-configured global SadTalker↔MuseTalk override UI** | P1 defer — V1 routing follows US-7.2 policy only (`hasReferenceLoop`). |

## Canonical terms (CONTEXT)

Use **provider adapter**, **provider key**, **provider tier**, **asset role**, **external job id**, **video job status**, **download-and-own**, **bucle de referencia**.  
_Evitar:_ client-supplied `provider_key`; long-lived third-party `output_url` as canonical; API secrets in catalog rows or responses.

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-8.2 | **`sadtalker-low-adapter.ts`** — Replicate create/poll/download pattern, injectable seams, job context map for poller L1 — **mirror for MuseTalk**, do not fork interface. |
| US-8.4 | **`createTalkingHeadVideoJob()`**, poller, retry, **`GET /api/video-jobs/[jobId]`**, M1 **`/api/media/provider-assets/[assetId]`** — **wire MuseTalk into orchestrator only**. |
| US-7.2 | **`resolveProviderForJob`** already selects **`musetalk_low`** when `hasReferenceLoop: true` — adapter + orchestrator unlock is transparent to policy. |
| US-X.4 | Catalog row **`musetalk_low`**: `talking_head` · `low` · `active` · `envKeyName: REPLICATE_API_TOKEN` · **`unitCostCents: 19`** · `capabilities.prefersReferenceLoop: true`. |
| US-3.1 / US-3.4 | **`generic_avatar`** mode + **`must_disclose_not_owner`** — MuseTalk jobs still subject to QA disclosure (SEC AC). |
| `hasReferenceLoopAssetForClient` | Boolean gate for policy — Phase B adds **asset id resolution** for create path. |

**US-8.6 adds the MuseTalk adapter body and unlocks the loop path in the existing orchestrator** — not a second job system or UI.

## PO decisions frozen (2026-08-30)

1. **Phased BUILD (single story):** **Phase A** = real **`musetalk_low`** adapter + registry + mocked tests (callable in isolation). **Phase B** = orchestrator accepts **`musetalk_low`** + server-side reference-loop asset resolution — reuses US-8.4 poller/UI. Full USER_STORIES AC closure requires **both phases** + VALIDATION.
2. **Vendor:** **Replicate** REST Predictions API (catalog `metadata.vendor: replicate`); auth via **`process.env.REPLICATE_API_TOKEN`** (catalog `envKeyName`); missing token → **`ProviderAdapterError`** `PROVIDER_CONFIG_MISSING` before network I/O.
3. **Model (PO lean — CONTRACT freezes hash):** Community model **`douwantech/musetalk`** (cost ~$0.19/run aligns with catalog seed). Input fields **`video`** + **`audio`** (HTTPS URLs). Optional **`bbox_shift`**, **`cycle`** frozen to V1 defaults in CONTRACT.
4. **Registry:** Register **`createMusetalkLowAdapter`** for **`musetalk_low`** in **`createProviderRegistry`** / catalog bootstrap; **`sadtalker_low`** / Wan stub / HeyGen stub unchanged.
5. **`estimateCost`:** Flat **`per_run`** from catalog bootstrap — **19¢** (`unitCostCents: 19`); no hardcoded override in adapter body.
6. **Adapter inputs:** **`createJob`** requires **`referenceVideoAssetId`** + **`voiceoverAssetId`**; **reject** `portraitAssetId` / `referenceImageAssetId` (SadTalker still path). Resolve assets to short-lived HTTPS URLs via **`resolveMediaAssetUrlForProvider`** (video MIME allowlist: **`video/mp4`**, **`video/quicktime`**; audio same as SadTalker).
7. **Normalizers (mandatory):** **`getJobStatus`** → **`normalizeVideoJobStatusResult`**; errors → **`sanitizeProviderErrorMessage`**; output URL → **`validateProviderOutputUrl`** with Replicate delivery allowlist (**reuse SadTalker host set** unless SECURITY extends — CONTRACT lists exact hosts).
8. **`external_job_id`:** Replicate prediction id — **`externalJobIdSchema`**; opaque round-trip only (US-8.1).
9. **`fetchAsset`:** Download validated HTTPS URL → Storage upload → **`StoredMediaAsset`**; poller passes **`clientId` + `reelScriptId` from job row** (US-8.4 L1). Storage key shape **`neuramark/{clientId}/{reelScriptId}/{uuid}.mp4`**.
10. **Orchestrator (Phase B):** Remove blanket **`referenceVideoAssetId` → museTalkNotSupported** rejection. Accept **`providerKey ∈ { sadtalker_low, musetalk_low }`** from policy. **`musetalk_low`:** require `script.hasReferenceLoop` + server-resolved loop video asset id; **no** `own_avatar` + MuseTalk combo. **`sadtalker_low`:** keep existing portrait still + voiceover path; **reject** `referenceVideoAssetId` on adapter (unchanged). Gate order unchanged: policy → estimate → budget → consent (**own_avatar** only) → **`adapter.createJob`** → INSERT → spend → poll.
11. **Job row audit (no DDL):** For **`musetalk_low`** jobs, persist reference-loop video asset id in existing **`portrait_asset_id`** column (CONTRACT documents provider-specific semantics); **`voiceover_asset_id`** unchanged.
12. **Reference loop asset selection:** **`getPrimaryReferenceLoopVideoAssetForClient(clientId)`** — earliest **`avatar_reference`** row with video MIME (`metadata.detectedMime` ∈ `video/mp4` \| `video/quicktime`) by **`created_at ASC`**; fail closed → orchestrator **`NOT_FOUND`** / validation error if policy selected MuseTalk but no video asset.
13. **Voiceover (US-9.3 soft):** **`voiceoverAssetId`** required on create (orchestrator options / request body); may point to any tenant-owned audio **`media_assets`** row — TTS job orchestration not required for V1 adapter slice tests/E2E.
14. **FE:** **None** — US-8.4 Operator badges/retry/cost DTOs are **`provider_key`-agnostic**; no new i18n keys required unless CONTRACT adds operator-facing MuseTalk label (display already in **`resolveProviderDisplayLabel`**).
15. **Tests:** **Mocked HTTP only** in CI for adapter; orchestrator tests cover **`musetalk_low`** branch with stub adapter; registry test asserts **`getVideoAdapter("musetalk_low")`** is real adapter.
16. **SEC — US-3.4:** MuseTalk does not bypass QA disclosure; **`generic_avatar`** + **`must_disclose_not_owner`** rules unchanged — validation in QA/US-10.x, not adapter bypass.
17. **Implementers:** **media-pipeline-engineer** + **nextjs-backend**; CONTRACT before BUILD.

---

## Gates (orchestrator)

- [ ] SPEC-REVIEW.md (spec-guardian — cross-cutting vs SPEC §3 S3.M9)
- [ ] SECURITY.md (security-architect — loop asset SSRF, impersonation, download-and-own)
- [ ] CONTRACT.md (nextjs-backend — frozen; **Reviewed by FE: N/A**)
- [ ] BUILD (media-pipeline-engineer + nextjs-backend — Phase A adapter + Phase B orchestrator)
- [ ] VALIDATION.md (requirements-validator)
- [ ] QA.md (qa-engineer)

**Status:** PREP complete — next gate **SPEC-REVIEW** → **SECURITY** → **CONTRACT**.

---

## Acceptance criteria mapping (do not check until VALIDATION)

| USER_STORIES § US-8.6 AC | Deliverable |
|--------------------------|-------------|
| Selected by policy for `generic_avatar` when reference loop exists | US-7.2 ✅ + Phase B orchestrator accepts `musetalk_low` |
| Operator-configured low-tier alternative to SadTalker | **Deferred P1** — V1 policy-only routing |
| Estimated cost ~19¢ from catalog | Phase A `estimateCost` + spend event at create |
| Same consent, budget, download-and-own, polling security as US-8.2 | Phase B orchestrator gates + Phase A `fetchAsset` + US-8.4 poller |
| [SEC] US-3.4 generic-avatar impersonation / QA disclosure | No adapter bypass; downstream QA unchanged |
