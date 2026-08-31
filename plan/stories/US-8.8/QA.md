# QA Report — US-8.8 LTX B-roll adapter (high tier, P1)

**Story:** US-8.8  
**Branch:** `feature/US-8.8-ltx-broll-high`  
**Reviewer:** qa-engineer  
**Date:** 2026-08-31  
**Sources:** `SECURITY.md` (13 conditions), `CONTRACT.md`, `TASKS.md`, changed implementation files on branch vs `main`

### Verdict: REJECT

**Severity counts:** Critical **0** · High **1** · Medium **1** · Low **2**

Phase A adapter + Phase B orchestrator unlock meet most SECURITY/CONTRACT floors (FAL key hygiene, LTX-specific SSRF allowlist, per-clip 126¢ budget, tier pairing, graceful degrade, `asset_role = broll` INSERT). **REJECT** because Operator retry for failed LTX B-roll jobs is still Wan-gated — CONTRACT Phase B retry parity is not implemented.

---

## Re-verdict (2026-08-31, after fix `4584573`)

### Verdict: **APPROVE**

**Severity counts:** Critical **0** · High **0** · Medium **0** · Low **2** (L1/L2 unchanged — non-blocking)

| Prior ID | Resolution |
|----------|------------|
| **H1** | `retry-video-job.ts` now uses `isAllowedBrollProviderPair(providerKey, providerTier)` instead of Wan-only guard; LTX B-roll parents retry via `createBrollVideoJobs` with inherited still. |
| **M1** | `video-jobs.test.ts` — *"retries failed ltx_broll_high broll jobs via createBrollVideoJobs"* covers `retryVideoJob` Server Action end-to-end. |

**Checks re-run:** `npx tsx --test` on adapter + orchestrator + providers + video-jobs retry suite — **88 pass / 0 fail**. SECURITY condition 12 (retry tenancy) now **PASS**.

**Residual (non-blocking):** L1 adapter boundary test gap; L2 pre-existing HeyGen `"use server"` build failure (out of US-8.8 scope).

---

## Findings

### High

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| **H1** | `lib/video-jobs/actions/retry-video-job.ts:265-268` | B-roll retry path rejects any `provider_key !== siliconflow_wan21_turbo` with `JOB_NOT_RETRYABLE`. Failed **`ltx_broll_high`** jobs cannot be retried through the Operator retry action. | CONTRACT § Poller + retry parity: *"LTX parent — Retry calls `createBrollVideoJobs` single-clip path with inherited still — stays `ltx_broll_high` + `high`"*. TASKS.md marks retry `[x]` complete, but this file was **not** changed on the branch. Operators can create LTX clips but cannot recover failed ones — core production flow gap. Violates SECURITY condition 12 (retry non-promotion / tenancy) in practice. | Remove Wan-only guard; allow retry when parent `asset_role = broll` and `provider_key` is an allowed B-roll pair (`isAllowedBrollProviderPair`). Let `createBrollVideoJobs` + policy resolve LTX vs Wan from parent row. Add integration test on `retryVideoJob` with LTX parent fixture. |

### Medium

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| **M1** | `lib/video-jobs/create-broll-video-jobs.test.ts:842-878` vs `retry-video-job.ts` | Test *"13 — singleClipRetry LTX parent stays broll + ltx_broll_high"* exercises **internal** `createBrollVideoJobs(..., { singleClipRetry })` only. It does **not** cover `retryVideoJob` Server Action, which still hard-rejects LTX. | Gives false confidence that CONTRACT automated test #13 (retry parity) is satisfied. QA cannot sign off retry AC from orchestrator unit tests alone. | Extend `video-jobs.test.ts` or add `retry-video-job.ltx.test.ts` mocking LTX failed parent → assert retry succeeds and INSERT stays `ltx_broll_high` + `broll`. |

### Low

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| **L1** | SECURITY automated test matrix item (4) | No dedicated adapter test asserting client absolute `image_url` / non-UUID still id is rejected at adapter boundary. | Mitigated: orchestrator rejects `image_url` via `FORBIDDEN_FIELDS` (test 4 in orchestrator suite); adapter input schema requires UUID `referenceImageAssetId` and resolves via owned-media helper only. Residual gap is test coverage, not exploitable path from HTTP boundary. | Optional: adapter test with invalid still id / missing resolver asset → `INVALID_PROVIDER_INPUT`. |
| **L2** | `npm run build` (repo-wide) | Production build fails on pre-existing HeyGen Server Action re-export (`create-heygen-talking-head-video-job.ts` — non-async export in `"use server"` file). **Not introduced by US-8.8 diff** (0 lines changed in that file on branch). | Blocks full CI/build gate for the repo; unrelated to LTX logic but noted for merge hygiene. | Fix HeyGen action wrapper separately (async-only exports). |

---

## SECURITY 13-Condition Reconciliation

| # | Condition | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Anti–API-key-leakage | **PASS** | `ltx-broll-high-adapter.ts:1,89-97,186`; `Authorization: Key`; `sanitizeProviderErrorMessage` extended for `Key …` (`normalize-provider-response.ts:65`); degrade logs sanitized (`create-broll-video-jobs.ts:352-358`) |
| 2 | Anti–SSRF (output) | **PASS** | `LTX_ALLOWED_OUTPUT_HOSTS` (`ltx-broll-high.ts:87-92`); validate at status + fetch + redirect re-validation (`ltx-broll-high-adapter.ts:204-245,496-499`) |
| 3 | Anti–SSRF (input) | **PASS** | Owned still via `resolveMediaAssetUrlForProvider` + MIME allowlist (`ltx-broll-high-adapter.ts:328-336,358-363`); orchestrator uses `getBrollReferenceStillAssetForClient` |
| 4 | Anti–untrusted-response | **PASS** | `normalizeVideoJobStatusResult`, `parseExternalJobId`, `sanitizeProviderErrorMessage` on all FAL paths |
| 5 | Anti–CDN-as-canonical | **PASS** | `fetchAsset` download-and-own; flat `{uuid}.mp4` storage key (adapter test 1) |
| 6 | Anti–budget-bypass | **PASS** | `assertReelBudgetAllowsEstimatedSpend` per clip before `createJob` (`create-broll-video-jobs.ts:268-288`); 126¢ estimate |
| 7 | Anti–provider smuggling | **PASS** | `findForbiddenVideoJobKeys` + `isAllowedBrollProviderPair` (`create-broll-video-jobs.ts:123-125,195-197`) |
| 8 | Anti–tier-floor bypass | **PASS** | `(ltx_broll_high, low)` → `BROLL_PROVIDER_UNAVAILABLE`; policy tests in `providers.test.ts:484-506` |
| 9 | Anti–prompt authority | **PASS** | `buildLtxBrollPrompt` server-side; prompt fields in `FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS` |
| 10 | Anti–degrade primary coupling | **PASS** | B-roll failures skip clip only; primary INSERT counter never touched (orchestrator tests 6-9) |
| 11 | Anti–degrade secret leak | **PASS** | Sanitized errors in catch path; LTX degrade test 14 |
| 12 | Anti–`asset_role` / tenancy | **PARTIAL** | INSERT correct (`asset_role = broll`, `client_id`, `provider_tier = high`). **Retry path blocks LTX** — see H1 |
| 13 | Anti–module-leak | **PASS** | `import "server-only"` on adapter + orchestrator; FAL HTTP under `lib/providers/**`; no webhook route |

---

## CONTRACT Alignment (summary)

| Area | Status |
|------|--------|
| Phase A — LTX adapter, registry, 126¢ estimate, mocked tests | **PASS** (10/10 adapter tests) |
| Phase B — catalog activate migration | **PASS** (`20260831100000_neuramark_ltx_broll_high_activate.sql`) |
| Phase B — orchestrator allowlist `{ wan+low, ltx+high }` | **PASS** |
| Phase B — per-clip budget + degrade | **PASS** |
| Phase B — poller parity | **PASS** (provider-agnostic poller; no `asset_role` filter in `poll-video-job-until-terminal.ts:84-89`) |
| Phase B — retry parity | **FAIL** (H1) |
| Phase B — tier-floor regression | **PASS** |

---

## Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/providers/video/ltx-broll-high-adapter.test.ts lib/video-jobs/create-broll-video-jobs.test.ts lib/providers/providers.test.ts` | **68 pass / 0 fail** (~1.75 s) |
| `npm run lint` | **Exit 0** with pre-existing `no-require-imports` noise in unrelated test files (not US-8.8-specific) |
| `npm run build` | **FAIL** — pre-existing HeyGen `"use server"` re-export (not in US-8.8 diff) |

---

## What Was Not Covered

- Live FAL API integration (explicitly out of scope — mocked HTTP only).
- Fly worker runtime poll + `fetchAsset` end-to-end against real Storage.
- Operator UI surfaces (FE deferred — N/A).
- Full-repo build green (blocked by unrelated HeyGen action).
- `retryVideoJob` integration test for LTX parent (gap identified — M1/H1).

---

## Recommended Action

1. **Fix H1** — extend `retry-video-job.ts` to retry LTX B-roll parents via inherited `provider_key` (not Wan-only).
2. **Add M1 test** — `retryVideoJob` with failed `ltx_broll_high` parent.
3. Re-run QA after fix; expected verdict **APPROVE** if retry parity lands and tests pass.
