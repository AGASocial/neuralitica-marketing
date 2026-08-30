# US-8.2 — SadTalker adapter (V1 default talking-head, low tier)

**Status:** PREP — story folder ready; gates not started.

**As a** System, **I want** SadTalker lip-sync via a cloud API, **so that** own-avatar and generic-avatar Reels are produced cheaply without client recording.

Ship **server-only Replicate SadTalker adapter** for catalog key **`sadtalker_low`**: replace **`createSadtalkerLowStubAdapter`** with a real **`VideoProviderAdapter`** that calls Replicate behind **`REPLICATE_API_TOKEN`**; wire it in **`getProviderRegistry()`** / **`createProviderRegistry()`**; implement **`estimateCost`** from catalog **`cost_model`**; pipe **`createJob` / `getJobStatus` / `fetchAsset`** through US-8.1 normalization helpers; cover with **mocked-HTTP unit tests only**. **No FE**, **no Route Handlers**, **no `neuramark_video_jobs` DDL/writes**, **no poller/SSE/retry orchestration** — job lifecycle UI and server orchestration ship in **US-8.4**.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-8.2 (unchecked until VALIDATION).

**This folder:** [`plan/stories/US-8.2/`](./) — `README.md` · `TASKS.md` (gates: `SECURITY.md` · `CONTRACT.md` · `VALIDATION.md` · `QA.md` — create when story enters sprint).

**Branch:** `feature/US-8.2-sadtalker-adapter`

**Depends on:** [US-8.1](../US-8.1/) ✅ `VideoProviderAdapter` · `getProviderRegistry()` · `normalizeProviderJobStatus` · `sanitizeProviderErrorMessage` · `validateProviderOutputUrl` · `externalJobIdSchema` · [US-X.4](../US-X.4/) ✅ catalog seed `sadtalker_low` · `REPLICATE_API_TOKEN` · `per_run` / **10¢** · [US-7.2](../US-7.2/) ✅ policy routes `talking_head` low → `sadtalker_low`.

**Unblocks:** [US-8.4](../../USER_STORIES.md) (job poller + status UI wiring) · [US-9.1](../../USER_STORIES.md) (assembly consumes `StoredMediaAsset`) · full US-8.2 AC closure (consent/budget re-check, `media_assets` persistence, retries) when orchestration lands.

---

## Scope in

| Area | What US-8.2 BUILD adds |
|------|------------------------|
| **FE** | — (job status polling / SSE is US-8.4; USER_STORIES FE row is shared with US-8.4) |
| **BE** | **`lib/providers/video/sadtalker-low-adapter.ts`** — real Replicate SadTalker `VideoProviderAdapter` (`providerKey: sadtalker_low`, `videoAssetRole: primary`); **replace stub registration** in **`lib/providers/create-provider-registry.ts`**; **`estimateCost`** from catalog row (`billingUnit: per_run`, `unitCostCents: 10`); **`createJob`** → Replicate prediction create (portrait + voiceover inputs); **`getJobStatus`** → Replicate prediction poll + **`normalizeVideoJobStatusResult`**; **`fetchAsset`** → **`validateProviderOutputUrl`** + server-side download + Storage upload helper (injectable for tests); **delete or repurpose** `sadtalker-low-stub-adapter.ts`; **mocked-HTTP tests** in `lib/providers/video/sadtalker-low-adapter.test.ts` (+ registry swap test). |
| **DB** | — (catalog row exists from US-X.4; **`neuramark_video_jobs` DDL + writes** deferred to orchestration story slice — see PO freeze) |
| **Implementers** | **media-pipeline-engineer** (adapter + Replicate I/O) + **nextjs-backend** (`CONTRACT.md`, asset URL resolution seam, tests). **Reviewed by FE: N/A** — BE-only BUILD slice. |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **US-8.4** job orchestration | Poller, stale timeout, retry lineage, Operator status UI, SSE/Route Handlers — US-8.4 owns `neuramark_video_jobs` writes and status surfaces. |
| **US-8.4 / FE** | Status badges, retry button, EN/ES labels — no Client Components. |
| **`neuramark_video_jobs` migration** | PO freeze: no job table DDL or INSERT/UPDATE in this BUILD; adapter is callable in isolation and from future orchestrator. |
| **Consent + budget re-check at submit** | USER_STORIES `[SEC]` — enforced in create-job orchestrator (US-8.4 / US-9.x), not inside adapter `createJob`. |
| **Operator/client polling endpoints** | US-8.4; adapter exposes methods only. |
| **TTS generation** | Voiceover asset assumed present (`voiceoverAssetId`) — produced by US-9.3 upstream. |
| **Assembly / FFmpeg** | US-9.x / Fly worker (ADR-0003). |
| **MuseTalk / Wan / HeyGen** | US-8.6 / US-8.5 / US-8.7 — other stub bodies unchanged in US-8.2. |
| **Live Replicate integration tests** | BUILD uses **mocked HTTP** only; manual smoke with real token is post-QA optional. |

## Canonical terms (CONTEXT)

Use **provider adapter**, **provider key**, **provider tier**, **asset role**, **external job id**, **video job status** (`queued` \| `processing` \| `completed` \| `failed` \| `cancelled`), **download-and-own**.  
_Evitar:_ client-supplied `provider_key`; long-lived third-party `output_url` as canonical; API secrets in catalog rows or responses.

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-8.1 | **`VideoProviderAdapter`** four methods; **`getProviderRegistry()`**; **`normalize-provider-response.ts`**; **`externalJobIdSchema`**; stub **`sadtalker-low-stub-adapter.ts`** registered today — **replace in registry**, do not fork interface. |
| US-X.4 | Catalog row **`sadtalker_low`**: `talking_head` · `low` · `active` · `envKeyName: REPLICATE_API_TOKEN` · `cost_model: { billingUnit: "per_run", unitCostCents: 10, metadata: { vendor: "replicate" } }`. |
| US-7.2 | **`resolveProviderForJob`** already selects `sadtalker_low` for low-tier talking-head — adapter swap is transparent to policy engine. |
| US-3.3 | Avatar reference assets in Storage + `neuramark_media_assets` — adapter resolves `portraitAssetId` / `referenceImageAssetId` to signed/read URLs server-side. |

**US-8.2 replaces the SadTalker stub body with real Replicate I/O and proves it via mocked-HTTP tests** — not end-to-end job orchestration or UI.

## PO decisions frozen (2026-08-29)

1. **Replace stub, don't parallel:** Swap **`createSadtalkerLowStubAdapter`** for **`createSadtalkerLowAdapter`** in **`create-provider-registry.ts`**; remove stub from production bootstrap (keep stub factory file only if tests need it — prefer delete stub adapter module).
2. **Vendor:** **Replicate** REST API (catalog `metadata.vendor: replicate`); auth via **`process.env.REPLICATE_API_TOKEN`** (catalog `envKeyName`); missing token → throw **`ProviderAdapterError`** before network I/O.
3. **Registry:** **`getProviderRegistry()`** returns real SadTalker adapter for **`sadtalker_low`**; Wan/HeyGen stubs unchanged.
4. **`estimateCost`:** Read **`per_run`** **`unitCostCents`** from catalog row passed at factory time (mirror **`estimateCentsFromCatalog`** in registry bootstrap) — **10¢** at seed baseline; no hardcoded override in adapter body.
5. **Inputs:** **`createJob`** requires **`voiceoverAssetId`** + (**`portraitAssetId`** or **`referenceImageAssetId`**) on **`resolvedCreateVideoJobInputSchema`**; resolve assets to HTTPS URLs server-side (CONTRACT freezes resolver seam).
6. **Normalizers (mandatory):** **`getJobStatus`** → **`normalizeVideoJobStatusResult`**; errors → **`sanitizeProviderErrorMessage`**; output URL → **`validateProviderOutputUrl`** with Replicate allowlist (**`replicate.delivery`**, **`pbxt.replicate.delivery`**, etc. — CONTRACT freezes exact hosts).
7. **`external_job_id`:** Replicate prediction id — must pass **`externalJobIdSchema`**; opaque round-trip only (US-8.1 rules).
8. **`fetchAsset`:** Download validated HTTPS URL → upload to Storage under **`neuramark/{clientId}/{reelScriptId}/{uuid}.mp4`**; return **`StoredMediaAsset`** only — no provider URL in result. Storage I/O behind injectable helper for mocked tests.
9. **Tests:** **Mocked HTTP only** in BUILD — no live Replicate calls in CI; registry test asserts **`getVideoAdapter("sadtalker_low")`** is real adapter (not stub id prefix).
10. **No orchestration:** No poller loop, no job row persistence, no retry config, no Route Handlers — **US-8.4**.
11. **No FE:** USER_STORIES FE row satisfied by **US-8.4**, not US-8.2 BUILD.
12. **Implementers:** **media-pipeline-engineer** + **nextjs-backend**; CONTRACT before BUILD.

---

## Gates (orchestrator)

- [ ] SPEC-REVIEW.md (spec-guardian)
- [ ] SECURITY.md (security-architect)
- [x] CONTRACT.md (nextjs-backend — frozen; **Reviewed by FE: N/A**)
- [ ] BUILD (media-pipeline-engineer + nextjs-backend)
- [ ] VALIDATION.md (requirements-validator)
- [ ] QA.md (qa-engineer)

**Status:** CONTRACT frozen. **Next gate:** BUILD (media-pipeline-engineer + nextjs-backend).
