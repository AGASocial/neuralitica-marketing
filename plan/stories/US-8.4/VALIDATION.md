# Validation Report — US-8.4

**Branch:** `feature/US-8.4-video-jobs`  
**Commit validated:** `25737db` — *US-8.4: add video job status and retry UI on operator scripts*  
**Validator:** requirements-validator  
**Date:** 2026-08-29  

### Verdict: FAIL

Implementation delivers most US-8.4 and US-8.2 Phase B surfaces (DDL, orchestrator, poller, Operator UI, retry/override actions, M1 route). **Automated test coverage does not match TASKS.md claims**, one unit test fails, and several acceptance items lack the evidence TASKS.md requires for Phase B closure. PO should not check off USER_STORIES AC until tests and soft UX gaps are addressed.

---

## Test runs

| Command | Result |
|---------|--------|
| `npx tsx --test lib/video-jobs/video-jobs.test.ts` | **3 pass / 1 fail** (4 total) |
| `npx tsx --test lib/providers/video/sadtalker-low-adapter.test.ts` | **7 pass / 0 fail** (7 total) |
| `npx tsx --test lib/video-jobs/video-jobs.test.ts lib/providers/video/sadtalker-low-adapter.test.ts lib/providers/providers.test.ts lib/auth/session-guards.test.ts` | **52 pass / 1 fail** (53 total) |

**Failing test:** `lib/video-jobs/video-jobs.test.ts` → *reads defaults for stale timeout and max retries* — dynamic import of `video-job-config.ts` throws because `import "server-only"` is not mockable under `node:test` without a loader shim.

**Missing vs TASKS.md BE checklist (marked [x] done):** orchestrator gate-order tests, IDOR 404 on `GET /api/video-jobs/[jobId]`, retry lineage, stale-timeout behavior, poller mocked HTTP, M1 route integration (only HMAC math + migration grep present).

---

## Acceptance Criteria — US-8.4 (`plan/USER_STORIES.md`)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Stale jobs timeout to `failed` | **PASS** | `lib/video-jobs/mark-stale-video-jobs-failed.ts` — selects `queued`/`processing` where `updated_at < cutoff` from `getVideoJobStaleTimeoutMs()` (default 7_200_000 ms); calls `applyVideoJobStatusUpdate` with `VIDEO_JOB_STALE_FAILURE_MESSAGE_KEY`. Invoked from `pollActiveVideoJobsBatch` (`poll-video-job-until-terminal.ts:81`) and Fly worker (`worker/video-jobs.ts`). |
| Retry requires explicit confirmation showing new estimate | **PASS** | `VideoJobRetryConfirmDialog.tsx` loads `previewRetryVideoJobEstimate`, displays estimate, requires `confirmEstimateCents` match in `retryVideoJob` (`retry-video-job.ts:192-196`). |
| Regeneration count visible (margin risk) | **PASS** | `countPrimaryVideoJobsForReel` in `retry-eligibility.ts`; rendered in `OperatorVideoJobSummaryPanel.tsx:355-358` and batch DTO via `mapOperatorVideoJobSummaryDto`. |
| Retries beyond configurable max per Reel blocked until operator override | **PASS** | `getVideoMaxRetriesPerReel()` (default 3); `retry-video-job.ts:175-178` returns `RETRY_LIMIT_EXCEEDED`; `overrideVideoJobRetryLimit` inserts audit row; `consumeRetryOverride` on use. FE override affordance when `retryBlockedReasonKey === limitExceeded` (`OperatorVideoJobSummaryPanel.tsx:289-292`). |
| Operator-only: retry and override reject non-operator (403) | **PASS** | `requireOperator("handler")` first in `retry-video-job.ts:137-145`, `override-video-job-retry-limit.ts:21-29`; `GET /api/video-jobs/[jobId]/route.ts:24-30`. |
| [SEC] Retry limit and cumulative-budget check enforced server-side in retry handler | **PASS** | `assertVideoJobBudgetAllowsSpend` before create in `retry-video-job.ts:198-207`; max-attempt gate `175-178`. UI `canRetry` is non-authoritative per design. |
| [SEC] Webhook verifies authenticity and binds job before write | **PASS WITH NOTE** | **Poll-only V1** — no `app/api/webhooks/**` route. CONTRACT § Webhook marks handler optional; poll-only satisfies poller-authority AC. If webhook ships later, this AC becomes mandatory. |
| [SEC] Retry override recorded (user, reason, timestamp) US-10.2 pattern | **PASS** | Migration `neuramark_video_job_retry_overrides` with `operator_client_id`, `reason`, `prior_attempt`, `created_at`, `consumed_at`; INSERT-only in `override-video-job-retry-limit.ts:54-65`. |

---

## Acceptance Criteria — US-8.2 Phase B closure (`plan/stories/US-8.4/TASKS.md` § closure table)

| AC | Status | Evidence |
|----|--------|----------|
| Default low-tier talking-head E2E | **PASS WITH NOTE** | `create-talking-head-video-job.ts:94-114` resolves policy → requires `DEFAULT_LOW_TIER_PROVIDER_KEYS.talkingHead` (`sadtalker_low`); adapter round-trip covered by `sadtalker-low-adapter.test.ts` (7/7). **No orchestrator integration test.** |
| Portrait + voiceover inputs | **PASS** | Required asset IDs validated + ownership checks (`create-talking-head-video-job.ts:127-146`). |
| Playable `media_assets` output (not third-party URL) | **PASS WITH NOTE** | `apply-video-job-status-update.ts:84-116` → `persistVideoJobOutputAsset` → `insertGeneratedVideoMediaAsset`; no `output_url` column in migration. **No poller integration test.** |
| Failures capture reason; retries create child job | **PASS** | Sanitized `failure_reason` on failed path (`apply-video-job-status-update.ts:79-82`); `retryVideoJob` INSERT with `parent_job_id`, `attempt + 1` (`retry-video-job.ts:231-247`). **No automated lineage test.** |
| Flat per-run estimate (~10¢) at create | **PASS** | `adapter.estimateCost` + `recordReelSpendEvent` at create (`create-talking-head-video-job.ts:161-236`). |
| [SEC] Consent + budget before submit | **PASS WITH NOTE** | Gate order: policy → estimate → `assertReelBudgetAllowsEstimatedSpend` → `assertActiveAvatarConsentForJobs` (own_avatar) → `adapter.createJob` (`create-talking-head-video-job.ts:163-189`). **No mocked gate-order tests.** |
| [SEC] Poller-only status writes | **PASS** | Status UPDATE only in `apply-video-job-status-update.ts:119-129` (server-only); no PATCH/POST on `/api/video-jobs`. Grep: no client Route Handler mutates status. |
| [SEC] Download + URL allowlist | **PASS** | `persistVideoJobOutputAsset` passes job-row `clientId`/`reelScriptId` to `fetchAsset` (`persist-video-job-output.ts:12-16`); adapter URL tests in `sadtalker-low-adapter.test.ts:3-4`. |
| [SEC] Scoped status poll → 404 foreign job | **PASS WITH NOTE** | `loadVideoJobScoped` uses `WHERE id AND client_id` (`load-video-job.ts:24-29`); route returns 404 (`route.ts:44-56`). **No automated IDOR test.** |

---

## Convention Compliance

| Check | Status | Notes |
|-------|--------|-------|
| EN + ES under `scripts.videoJob.*` | **PASS** | `messages/en.json:1001-1072`, `messages/es.json:1001-1072`; wired in `app/(app)/operator/scripts/page.tsx:157-162`. |
| Server Components default; minimal `"use client"` | **PASS** | Page RSC; client islands: `OperatorVideoJobSummaryPanel`, retry dialogs (poll + mutations). |
| PrimeReact-first | **PASS** | `Tag`, `Button`, `Dialog`, `Message`, `ProgressSpinner` in job UI components. |
| Loading / empty / error / pending | **PASS** | Empty job panel; poll spinner; retry dialog loading/error; terminal/failed states. |
| Operator-only cost fields | **PASS** | `OperatorVideoJobSummaryDto` with nested `OperatorProductionJobCostDto`; batch on `getReelScriptsForWeek` only after `requireOperator`. |
| No Supabase in client for job data | **PASS** | FE uses Server Actions + `GET /api/video-jobs/[jobId]`; no `@supabase` in script job components. |
| `neuramark_` DB prefix | **PASS** | `supabase/migrations/20260830600000_neuramark_video_jobs.sql`. |
| CONTRACT frozen shapes | **PASS** | `lib/contracts/video-job.ts`; `videoJobsByReelScriptId` on `getReelScriptsForWeekSuccessSchema`; error envelope matches project pattern. |

---

## Gaps (what blocks PASS)

1. **Test suite vs TASKS.md** — BE checklist marks tests [x] complete, but `lib/video-jobs/video-jobs.test.ts` has only 4 tests (migration grep, forbidden keys, HMAC math, failing config import). Missing: orchestrator gate order, IDOR 404, retry lineage, stale sweeper, poller mock, security matrix from SECURITY.md.
2. **Failing unit test** — `reads defaults for stale timeout and max retries` cannot import `video-job-config.ts` under `node:test` due to `server-only`.
3. **Budget soft-disable UX** — USER_STORIES FE / TASKS: disable retry when over budget. `evaluateRetryEligibility` and `previewRetryVideoJobEstimate` do not call budget gate; `canRetry` may be true while retry returns `BUDGET_EXCEEDED`. Server enforcement satisfies [SEC]; soft UX AC is partial.
4. **US-8.2 Phase B automated evidence** — TASKS closure table expects integration tests for orchestrator E2E, poller complete path, and IDOR; not present at `25737db`.

---

## Scope Creep

None identified. Implementation stays within US-8.4 CONTRACT Phase A (SadTalker-only, `/operator/scripts`, poll-only default, no Cliente job UI, no `/operator/production` route).

---

## Recommended Next Actions

| Priority | Action | Owner |
|----------|--------|-------|
| P0 | Fix failing `video-job-config` test (extract env readers to testable module without `server-only`, or add test loader shim) | nextjs-backend |
| P0 | Add tests claimed in TASKS.md: forbidden status on create body, foreign job GET → 404, retry lineage INSERT, stale predicate, poller terminal path (mocked HTTP), budget gate spy on retry | nextjs-backend / media-pipeline-engineer |
| P1 | Include budget check in `previewRetryVideoJobEstimate` / `canRetry` so FE disables retry when over budget (soft UX) | nextjs-backend + nextjs-frontend |
| P2 | Webhook handler (optional per CONTRACT) if product wants push updates before Fly poll interval | nextjs-backend |
| PO | Do **not** check off USER_STORIES US-8.4 / US-8.2 Phase B until tests pass and gaps above closed | product-owner |

---

## Files reviewed (representative)

- `supabase/migrations/20260830600000_neuramark_video_jobs.sql`
- `lib/video-jobs/*` (orchestrator, poller, stale, retry, DTO mappers)
- `app/api/video-jobs/[jobId]/route.ts`
- `app/api/media/provider-assets/[assetId]/route.ts`
- `components/scripts/OperatorVideoJobSummaryPanel.tsx`, `VideoJobRetryConfirmDialog.tsx`, `VideoJobRetryLimitOverrideDialog.tsx`, `ScriptsPageView.tsx`
- `lib/reel-scripts/actions/get-reel-scripts-for-week.ts`
- `worker/video-jobs.ts`
- `lib/providers/video/sadtalker-low-adapter.test.ts`
