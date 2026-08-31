# Validation Report — US-8.5

**Story:** US-8.5 — Wan B-roll adapter (low tier, P0)  
**Branch:** `feature/US-8.5-wan-broll-adapter`  
**Commit under review:** `f7cf726` — US-8.5: Wan B-roll adapter + orchestrator + graceful degrade  
**Validator:** requirements-validator  
**Date:** 2026-08-31  
**Contract:** `plan/stories/US-8.5/CONTRACT.md` (Frozen — Phase A + Phase B)  
**Security:** `plan/stories/US-8.5/SECURITY.md` (APPROVE WITH CONDITIONS — 12 conditions)

### Verdict: PASS WITH NOTES

**AC score:** 6 / 6 PASS  
**Tests:** 39 passed, 0 failed (`npx tsx --test` on the three specified files)

All USER_STORIES acceptance criteria are met by Phase A (real Wan adapter) + Phase B (`createBrollVideoJobs`, degrade, budget, retry). FE preview strip is **N/A** (not an AC; CONTRACT **Reviewed by FE: N/A**). Multi-clip stitch is a **handoff** to US-9.1 Phase B (produce N owned `broll` assets here).

---

### Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Default B-roll provider when `provider_tier = low` and script marks `needs_broll` | **PASS** | Policy default key `DEFAULT_LOW_TIER_PROVIDER_KEYS.broll = "siliconflow_wan21_turbo"` (`lib/contracts/providers.ts` ~297). Orchestrator gates on `needsBroll`, resolves `assetRole: "broll"`, requires `providerKey === WAN_PROVIDER_KEY` + `providerTier === "low"` (`create-broll-video-jobs.ts` 131–183). Registry registers real adapter (`create-provider-registry.ts` 77–85). Tests: `create-broll-video-jobs.test.ts` #1, #2. |
| Clips max duration per policy (e.g. 3–5s); Wan catalog documents 5s cap | **PASS** | `WAN_CLIP_DURATION_MIN_SEC=3`, `MAX=5`, `DEFAULT=5`; `clampWanClipDurationSec` clamps (not rejects) (`siliconflow-wan21-turbo.ts` 58–64, 148–166). Adapter `createJob` clamps `targetDurationSec` (adapter.ts 366). Catalog metadata `clipDurationSec: 5` (`WAN_CATALOG_COST_MODEL`). Test: adapter.test.ts #4 (12→5, 1→3). |
| Estimated cost ~$0.21/clip at research baseline (Wan2.1 I2V Turbo) | **PASS** | `WAN_UNIT_COST_CENTS_PER_CLIP = 21`; catalog `per_clip` / 21 (`siliconflow-wan21-turbo.ts` 69–85). Registry bootstrap fallback **21** (not stub 10) (`create-provider-registry.ts` 34–35, 78–84, catalog seed ~136–140). Adapter `estimateCost` = unit × clipCount. Tests: adapter.test.ts #3 (21 / 63); orchestrator uses per-clip estimate before budget. |
| Failed B-roll does not block talking-head primary (graceful degrade) | **PASS** | Orchestrator never updates primary jobs; clip failures → `skipped` + sanitized log, still returns `ok: true` (`create-broll-video-jobs.ts` 252–348). Talking-head create path unchanged / independent. Tests: create-broll #6 (over-budget), #7 (adapter throw), #10 (missing still), #12 (sanitized degrade). |
| Multiple B-roll clips may be stitched in assembly (US-9.1) | **PASS** *(handoff)* | US-8.5 **produces** N `asset_role = broll` jobs (beats → clips, capped at 8 via `clampWanClipCount`) — `create-broll-video-jobs.ts` 149–158, 215–276; test #3. **Stitch / FFmpeg / `build-broll-concat-args` = US-9.1 Phase B** per CONTRACT § US-9.1 Phase B handoff — not implemented here (correct out-of-scope). |
| [SEC] Wan adapter follows US-8.1 contract: server-only keys, untrusted-response handling, B-roll cost counted against Reel cumulative budget (US-7.1) | **PASS** | See Convention / SEC evidence below. `import "server-only"` on adapter + orchestrator; `SILICONFLOW_API_KEY` via `process.env[WAN_ENV_KEY_NAME]` only in adapter; `normalizeVideoJobStatusResult` + `WAN_ALLOWED_OUTPUT_HOSTS` + `sanitizeProviderErrorMessage`; per-clip `assertReelBudgetAllowsEstimatedSpend` (US-7.1 cumulative) before each `createJob` (`create-broll-video-jobs.ts` 244–264). Tests: adapter #2,#5,#6,#7; create-broll #4,#5,#6,#12. |

---

### Convention Compliance

| Convention | Status | Evidence |
|------------|--------|----------|
| EN/ES user-facing strings | **N/A / NOTE** | No new Operator UI in this story (FE deferred). Existing keys e.g. `faceless_broll_wan` present in `messages/en.json` + `es.json`. **Note:** `WAN_REFERENCE_STILL_MISSING_MESSAGE_KEY` (`scripts.broll.failure.referenceStillMissing`) is returned on error but **not yet** present in `messages/*.json` — non-blocking until FE surfaces it. |
| Server Components / `"use client"` | **PASS** | No new Client Components. Thin Server Action re-export (`lib/video-jobs/actions/create-broll-video-jobs.ts`). Adapter + orchestrator + still resolver all `server-only`. |
| PrimeReact-first | **N/A** | No FE UI. |
| loading / empty / error / pending | **N/A** | No FE surfaces; BE returns closed Zod success/error envelopes. |
| Auth / `getCurrentUser` / Operator gate | **PASS** | `requireOperator("handler")` at orchestrator entry; non-operator → 403 (`create-broll-video-jobs.ts` 95–107; test #9). No Supabase auth SDK in browser. |
| Backend endpoint has concrete consumer | **PASS** *(deferred FE OK)* | CONTRACT: FE consumer none this story; callable via Server Action / retry path / tests. Retry wires B-roll recreate (`retry-video-job.ts` 265–311). |
| `neuramark_` schema | **PASS** | No new DDL; uses existing `neuramark_video_jobs` / media tables. |
| Contract shapes | **PASS** | Request `{ reelScriptId, clientId }` only; success with `jobs[]` / `skipped[]` / `skippedNoNeedsBroll`; `FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS` includes prompt/still/cost/clipCount (`video-job.ts` 72–140, 416–421). Flat `{uuid}.mp4` storage via `uploadGeneratedVideoBuffer`. |
| Poller parity | **PASS** | `pollActiveVideoJobsBatch` selects by status `queued`/`processing` with **no** primary-only filter (`poll-video-job-until-terminal.ts` 84–89) — B-roll jobs are polled. Operator list still filters `asset_role = primary` — CONTRACT-acceptable for CLOSE. |
| Dependencies US-8.1, US-7.2 | **PASS** | US-8.1 adapter interface + normalizers reused; US-7.2 policy routes low + needsBroll → Wan (verified by orchestrator + registry). |

---

### Gaps (what blocks PASS)

None. All six USER_STORIES ACs have file-level evidence and automated tests.

---

### Scope Creep

None material. Out-of-scope items correctly **not** shipped: US-9.1 stitch, FE preview strip, `ltx_broll_high`, `wan_broll_low` key, catalog activate migration, live SiliconFlow CI, webhook Route Handler, new video_jobs DDL.

---

### Notes (non-blocking)

1. **Stitch handoff:** AC “may be stitched in assembly” = produce owned B-roll clips here; assembly stitch is **US-9.1 Phase B**.
2. **FE preview:** Work-table optional strip deferred; **Reviewed by FE: N/A** — not an AC.
3. **i18n:** Add `scripts.broll.failure.referenceStillMissing` EN/ES when Operator UI surfaces B-roll errors (product-owner / nextjs-frontend follow-up).
4. **TASKS.md** media checklist still mentions hierarchical storage keys; CONTRACT + `uploadGeneratedVideoBuffer` correctly use flat `{uuid}.mp4` — TASKS text stale, not a BUILD defect.

---

### Test run

```text
npx tsx --test \
  lib/providers/video/siliconflow-wan21-turbo-adapter.test.ts \
  lib/video-jobs/create-broll-video-jobs.test.ts \
  lib/providers/provider-adapters.test.ts

ℹ tests 39
ℹ pass 39
ℹ fail 0
```

Breakdown: Wan Phase A **9**; createBroll Phase B **13**; provider-adapters (incl. Wan registry regression) **17**.

---

### Recommended Next Actions

| Action | Agent |
|--------|--------|
| Check off US-8.5 ACs in `plan/USER_STORIES.md` | **product-owner** |
| QA.md / security regression pass | **qa-engineer** |
| Open / continue US-9.1 Phase B for multi-clip stitch consuming `asset_role = broll` assets | **product-owner** → media-pipeline |
| Optional: add EN/ES for `scripts.broll.failure.referenceStillMissing` | **nextjs-frontend** (when preview lands) |
| Optional: Operator B-roll job list / preview strip (deferred) | **nextjs-frontend** (follow-up) |
