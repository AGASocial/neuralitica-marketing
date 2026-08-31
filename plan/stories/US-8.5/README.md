# US-8.5 — Wan B-roll adapter (low tier, P0)

**Status:** CLOSED (2026-08-31) — VALIDATION PASS WITH NOTES `14a74f5` (6/6 AC; 39/39) · QA APPROVE WITH CONDITIONS `8617ae7` (High H1 + M1 fixed `e75e1b7`) · PO AC check-off. BUILD `f7cf726` · CONTRACT `89cf172` · SECURITY `13bc6d5`.

**As a** System, **I want** short B-roll clips via Wan API (SiliconFlow), **so that** faceless Reels have cheap supporting visuals without full text-to-video for every piece.

Ship **server-only SiliconFlow Wan2.1 I2V Turbo `VideoProviderAdapter`** for catalog key **`siliconflow_wan21_turbo`**: replace **`createSiliconflowWan21TurboStubAdapter`** with a real adapter behind **`SILICONFLOW_API_KEY`**; wire **`createSiliconflowWan21TurboAdapter`** in **`getProviderRegistry()`** / **`initializeProviderRegistryFromCatalog()`**; implement **`estimateCost`** from catalog **`per_clip`** (**21¢** / ~$0.21); pipe **`createJob` / `getJobStatus` / `fetchAsset`** through US-8.1 normalizers; **`videoAssetRole: broll`**; cover with **mocked-HTTP unit tests only**. **Phase B (same story):** unlock **B-roll job orchestrator** (`createBrollVideoJobs` or CONTRACT-exact) so policy-selected low-tier B-roll creates **`neuramark_video_jobs`** rows with **`asset_role = broll`**; budget counting; **graceful degrade** (failed B-roll never blocks talking-head primary); one job per clip beat (capped). **Multi-clip stitch remains US-9.1 Phase B** — this story produces owned clips only. **FE optional preview strip deferred** (no FE AC).

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-8.5 (6/6 checked at CLOSE; stitch = US-9.1 Phase B handoff).

**This folder:** [`plan/stories/US-8.5/`](./) — `README.md` · `TASKS.md` (gates: `SECURITY.md` · `CONTRACT.md` · `VALIDATION.md` · `QA.md` — create when story enters sprint).

**Branch:** `feature/US-8.5-wan-broll-adapter`

**Depends on:** [US-8.1](../US-8.1/) ✅ `VideoProviderAdapter` · registry · normalizers · stub `siliconflow_wan21_turbo` · [US-7.2](../US-7.2/) ✅ policy routes `broll` + `provider_tier = low` + `needsBroll` → `siliconflow_wan21_turbo` · [US-X.4](../US-X.4/) ✅ catalog seed (active, `per_clip` / **21¢**, `clipDurationSec: 5`, `SILICONFLOW_API_KEY`) · [US-8.4](../US-8.4/) ✅ `neuramark_video_jobs` · poller · retry · status surfaces · [US-7.1](../US-7.1/) ✅ cumulative budget. **Soft:** [US-5.1](../US-5.1/) ✅ `broll_beats` / `modalidad` · [US-9.1](../US-9.1/) Phase A ✅ (stitch consumer = US-9.1 Phase B). **Pattern refs:** [US-8.2](../US-8.2/) / [US-8.6](../US-8.6/) / [US-8.7](../US-8.7/) · CosyVoice2 SiliconFlow HTTP (`SILICONFLOW_API_KEY` shared).

**Unblocks:** Faceless / `needs_broll` low-tier clip generation · [US-9.1](../US-9.1/) Phase B faceless multi-clip stitch · Sprint 7 provider matrix completion (Wan after HeyGen).

---

## Scope in

| Area | What US-8.5 BUILD adds |
|------|------------------------|
| **FE** | — (**defer** optional B-roll preview strip; no USER_STORIES FE AC). US-8.4 primary-job list may stay primary-only until a later thin UX pass. |
| **BE Phase A** | **`lib/providers/video/siliconflow-wan21-turbo-adapter.ts`** — real Wan I2V `VideoProviderAdapter` (`providerKey: siliconflow_wan21_turbo`, `videoAssetRole: broll`); **`lib/contracts/siliconflow-wan21-turbo.ts`** (or CONTRACT-exact) constants; **replace stub** in **`create-provider-registry.ts`**; **`estimateCost`** = catalog **`per_clip`** × clip count (default 1) = **21¢**/clip; **`createJob` / `getJobStatus` / `fetchAsset`** + US-8.1 normalizers; **mocked-HTTP tests**. |
| **BE Phase B** | **B-roll orchestrator** — when policy selects `siliconflow_wan21_turbo` / `needsBroll`, create **N** `video_jobs` with **`asset_role = broll`** (N from `brollBeats`, min 1 when needs B-roll, CONTRACT freezes max); budget per clip + cumulative; **failed B-roll does not fail / cancel talking-head primary**; reuse US-8.4 poller for `broll` rows; retry path for B-roll only (does not mutate primary). |
| **DB** | — (reuse **`neuramark_video_jobs.asset_role`** `primary` \| `broll`; catalog row already **`active = true`**). No activate migration. Optional: no DDL unless CONTRACT proves a gap. |
| **Implementers** | **media-pipeline-engineer** (adapter + SiliconFlow Wan I/O) + **nextjs-backend** (`CONTRACT.md`, B-roll orchestrator, budget/degrade tests). **Reviewed by FE: N/A** — FE deferred. |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **US-9.1 Phase B** multi-clip stitch / `build-broll-concat-args` | Adapter **produces** clips; assembly **consumes** them later. AC “may be stitched” is a handoff, not BUILD in this story. |
| **Optional FE B-roll preview strip** | USER_STORIES owner row is optional; **no FE AC** — **defer** (P1 / follow-up). |
| **High-tier B-roll** (`ltx_broll_high`) | Separate catalog row; inactive; out of scope. |
| **Rename provider_key to `wan_broll_low`** | Catalog + stubs already use **`siliconflow_wan21_turbo`** — do not invent a second key. |
| **Talking-head adapters / HeyGen** | US-8.2 / 8.6 / 8.7 ✅ — unchanged. |
| **New poller / job DDL** | US-8.4 ✅ — extend allowlists / queries for `asset_role = broll` only as needed. |
| **Live SiliconFlow CI tests** | Mocked HTTP only. |
| **Client-supplied provider_key / prompt override that bypasses server script beats** | Server authority only. |

## Canonical terms (CONTEXT)

Use **provider adapter**, **provider key**, **provider tier**, **asset role** (`broll`), **external job id**, **video job status**, **download-and-own**, **graceful degrade**, **needs_broll**.  
_Evitar:_ client-supplied `provider_key`; long-lived third-party `output_url` as canonical; API secrets in catalog rows or responses; blocking primary on B-roll failure; inventing `wan_broll_low` as a second key.

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-8.1 | Stub **`siliconflow_wan21_turbo`** registered with **`videoAssetRole: broll`** — **replace body**, do not fork interface. |
| US-X.4 / US-7.2 | Catalog + policy already default low-tier B-roll → **`siliconflow_wan21_turbo`** when `needsBroll`; row **active**, **21¢** `per_clip`, **`SILICONFLOW_API_KEY`**. |
| US-8.4 | Job table supports **`asset_role` `primary` \| `broll`**; talking-head create always writes **`primary`** — Phase B adds **broll** create path. Poller is provider-agnostic. |
| US-9.1 Phase A | Faceless without primary → incomplete; **B-roll stitch deferred Phase B** until clips exist from this story. |
| CosyVoice2 | Shared **`SILICONFLOW_API_KEY`** + SiliconFlow HTTP patterns — mirror auth/error handling for Wan. |
| US-8.2 / 8.6 / 8.7 | Adapter + registry + download-and-own + mocked HTTP — **mirror** for Wan I2V. |

**US-8.5 replaces the Wan stub, unlocks B-roll job creation, and proves graceful degrade** — not FFmpeg stitch or Operator preview UI.

---

## PO decisions frozen (2026-08-31)

1. **Phased BUILD (single story):** **Phase A** = real **`siliconflow_wan21_turbo`** adapter + registry swap + estimate + create/status/fetch + mocked HTTP. **Phase B** = B-roll orchestrator + `asset_role = broll` jobs + budget + graceful degrade + poller/retry parity for B-roll. Full USER_STORIES AC closure requires **both phases** + VALIDATION. **Stitch stays US-9.1 Phase B** (not a third phase of US-8.5).
2. **`provider_key`:** **`siliconflow_wan21_turbo` only** (existing catalog / stub / `DEFAULT_LOW_TIER_PROVIDER_KEYS.broll`). Reject inventing `wan_broll_low`.
3. **Default routing:** When **`provider_tier = low`** and script/policy **`needsBroll`** (`modalidad === "faceless"` **OR** `brollBeats.length > 0`), policy selects this key (US-7.2 ✅). Phase B orchestrator must honor that selection — no silent skip when budget allows.
4. **`asset_role`:** Adapter and job rows use **`broll`** (`videoAssetRole: "broll"`). Never write Wan jobs as `primary`.
5. **Clip duration:** Policy window **3–5s**; Wan hard cap **5s** (`cost_model.metadata.clipDurationSec: 5`). Adapter / create path **clamps requested duration to ≤ 5s**; CONTRACT freezes default request duration (lean: **5s** unless script/policy supplies a lower value ≥ 3).
6. **Cost:** Catalog **`billingUnit: "per_clip"`**, **`unitCostCents: 21`** (~$0.21/clip). `estimateCost` = **21 × clipCount** (clipCount from orchestrator; adapter default 1). Fix stub/registry drift that used **10¢** fallback — production estimate must be **21¢**.
7. **Env var:** **`SILICONFLOW_API_KEY`** (catalog `envKeyName` — shared with LLM/TTS). Missing → **`ProviderAdapterError`** `PROVIDER_CONFIG_MISSING` before network I/O. Do **not** introduce a Wan-only env name in V1.
8. **Graceful degrade:** Failed / timed-out / budget-blocked **B-roll must not** fail, cancel, or block **talking-head `primary`** create/poll/retry. Primary and B-roll jobs are **independent**. Assembly (US-9.1 Phase B) skips missing B-roll. Faceless-only slots without any visual still need Operator path (manual upload / wait) — degrade means **do not couple** primary success to B-roll success.
9. **Multiple clips:** One **`video_jobs`** row per clip (from `brollBeats`; `max(1, length)` when needs B-roll). CONTRACT freezes **max clips per Reel** (lean: **8**, align script `brollBeats` max). **Stitch / concat = US-9.1 Phase B** — out of US-8.5 BUILD.
10. **Inputs (PO lean — CONTRACT freezes):** Wan **I2V** — server-resolved **reference still** (image) + **text prompt** derived from beat / script (server-authored; never raw client prompt as sole authority). Exact SiliconFlow model id + endpoints frozen in CONTRACT (mirror CosyVoice2 SiliconFlow base URL patterns).
11. **Catalog activate:** **Already `active = true`** — **no** activate migration (unlike HeyGen). Optionally enrich bootstrap `cost_model.metadata` (`clipDurationSec`, `model`) for parity with seed tests — no behavioral unlock required.
12. **FE:** **Defer** optional B-roll preview strip. **Reviewed by FE: N/A**. Operator status for B-roll jobs may remain incomplete on `/operator/scripts` (primary-filtered) until a follow-up — acceptable for CLOSE if AC (no FE checkboxes) pass via BE evidence.
13. **Consent:** B-roll does **not** require avatar consent gate (not likeness talking-head). Budget (US-7.1) **does** apply per clip and cumulative.
14. **Tests:** Mocked HTTP only for adapter; orchestrator tests for default select, cost 21¢, degrade, N clips, budget block on B-roll without failing primary.
15. **Implementers:** **media-pipeline-engineer** + **nextjs-backend**; CONTRACT before BUILD.

### Phase A vs Phase B recommendation

| Phase | Ship | Closes which AC? |
|-------|------|------------------|
| **A** | Adapter + registry + estimate + create/status/fetch + mocked tests | Partial — cost model + adapter SEC floors; **not** full USER_STORIES |
| **B** | B-roll orchestrator · `asset_role=broll` · budget · graceful degrade · poller/retry for B-roll | Remaining AC (default when needs_broll, degrade, multi-job handoff) — **required for CLOSE** |
| **Out (US-9.1 B)** | FFmpeg multi-clip stitch | AC “may be stitched in assembly” — **handoff documented**; clip **production** satisfies US-8.5 |

**PO recommendation:** Execute **Phase A then Phase B in this story** (MuseTalk/HeyGen-style). Do **not** pull US-9.1 stitch into US-8.5. Prefer **full CLOSE** after A+B + VALIDATION; VALIDATION must note stitch deferred to US-9.1 Phase B (same pattern as US-9.1 Phase A notes).

---

## Gates (orchestrator)

- [x] SPEC-REVIEW.md (spec-guardian — **GAPS** vs SPEC §3 S3.M9 Video Provider / B-roll; stitch handoff US-9.1 Phase B)
- [x] SECURITY.md (security-architect — APPROVE WITH CONDITIONS · 12)
- [x] CONTRACT.md (nextjs-backend — freeze endpoints/schemas; **Reviewed by FE: N/A**)
- [x] BUILD Phase A (media-pipeline-engineer + nextjs-backend)
- [x] BUILD Phase B (BE orchestrator + degrade/budget tests)
- [x] VALIDATION.md (requirements-validator) — PASS WITH NOTES `14a74f5` (6/6; 39/39)
- [x] QA.md (qa-engineer) — APPROVE WITH CONDITIONS `8617ae7`; H1/M1 `e75e1b7`
- [x] CLOSE — 6/6 AC checked in USER_STORIES.md (product-owner)

**Status:** CLOSED. **Next:** US-9.1 Phase B faceless B-roll stitch (recommended) — Sprint 7 provider backlog complete.

---

## Acceptance criteria mapping

| USER_STORIES § US-8.5 AC | Deliverable | Phase |
|-------------------------|-------------|-------|
| Default B-roll when `provider_tier = low` and `needs_broll` | US-7.2 ✅ + Phase B orchestrator creates Wan jobs | B |
| Clips max duration 3–5s; Wan 5s cap | Adapter/orchestrator clamp + catalog metadata | A (+ B create) |
| Estimated cost ~$0.21/clip | Catalog `per_clip` **21¢** + `estimateCost` | A |
| Failed B-roll does not block talking-head primary | Independent jobs + degrade tests | B |
| Multiple clips may be stitched in assembly (US-9.1) | N `broll` jobs produced; stitch **handoff** to US-9.1 Phase B | B (produce) / US-9.1 B (stitch) |
| [SEC] US-8.1 contract, server-only keys, budget vs US-7.1 | Adapter SEC + orchestrator budget | A + B |
