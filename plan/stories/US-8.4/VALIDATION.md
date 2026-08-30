# Validation Report — US-8.4

**Branch:** `feature/US-8.4-video-jobs`  
**Commit validated:** `ad4d514` — *US-8.4: fix validation gaps — tests, config readers, budget soft UX*  
**Prior validation:** `442b31a` / `25737db` — **FAIL** (test coverage, failing config test, budget soft UX)  
**Validator:** requirements-validator  
**Date:** 2026-08-29  

### Verdict: PASS WITH NOTES

Remediation at `ad4d514` closes all blockers from the prior FAIL report: **13/13** `video-jobs` unit tests pass, TASKS.md BE test checklist is evidenced, config readers are testable without `server-only`, and budget soft-disable UX is wired end-to-end (`canRetry` + blocked reason in batch DTO and retry preview). US-8.4 acceptance criteria and US-8.2 Phase B closure evidence are satisfied. PO may proceed to check off USER_STORIES AC (product-owner action). Residual notes are non-blocking follow-ups (optional webhook, partial SECURITY.md matrix beyond TASKS.md).

---

## Remediation verification (prior FAIL blockers)

| Prior blocker | Status | Evidence |
|---------------|--------|----------|
| Failing config import test | **FIXED** | `lib/video-jobs/video-job-config-readers.ts` — pure env readers without `server-only`; `video-job-config.ts` delegates. Test: *reads defaults for stale timeout and max retries* passes. |
| TASKS.md test matrix missing | **FIXED** | `lib/video-jobs/video-jobs.test.ts` — 13 tests across 10 suites (gate order, IDOR 404, retry lineage, stale sweeper, poller terminal, forbidden keys, HMAC/migration grep, poller-only writes, budget soft UX). |
| Budget soft-disable UX | **FIXED** | `evaluateRetryEligibility` calls `assertVideoJobBudgetAllowsSpend` when `estimatedCostCents` + `operatorClientId` provided (`retry-eligibility.ts:154-170`). `mapOperatorVideoJobStatusDto` passes both for failed jobs (`map-operator-video-job-dto.ts:30-33`). `previewRetryVideoJobEstimate` re-checks with fresh adapter estimate (`retry-video-job.ts:128-144`). FE hides retry when `!canRetry`, shows `scripts.videoJob.retry.budgetExceeded` via `OperatorVideoJobSummaryPanel.tsx:288-405` and `VideoJobRetryConfirmDialog.tsx:58-268`. |
| US-8.2 Phase B automated evidence | **FIXED** | Orchestrator gate-order, poller complete delegation, retry lineage INSERT, IDOR 404 — all in `video-jobs.test.ts`. |

---

## Test runs

| Command | Result |
|---------|--------|
| `npx tsx --test lib/video-jobs/video-jobs.test.ts` | **13 pass / 0 fail** (13 total) |
| `npx tsx --test lib/video-jobs/video-jobs.test.ts lib/providers/video/sadtalker-low-adapter.test.ts` | **20 pass / 0 fail** (20 total) |

**Test matrix vs TASKS.md BE checklist:**

| TASKS.md requirement | Test |
|----------------------|------|
| Orchestrator gate order (consent/budget mocked) | *calls budget before consent before adapter.createJob* |
| IDOR 404 on status GET | *returns 404 for foreign job id (client scope)* |
| Retry lineage | *inserts child job with parent_job_id and incremented attempt* |
| Stale timeout | *selects queued/processing jobs older than stale timeout cutoff* |
| M1 route HMAC | migration grep + *verifies HMAC signature constant-time path* |
| Poller mocked HTTP | *delegates completed vendor status to applyVideoJobStatusUpdate* |
| Forbidden status on create body | *rejects provider authority keys on create input* |
| Config env readers | *reads defaults* / *reads env overrides* |
| Poller-only status writes | server-only grep + route has no PATCH/POST/update |
| Budget gate soft UX | *evaluateRetryEligibility blocks canRetry when budget exceeded* |

---

## Acceptance Criteria — US-8.4 (`plan/USER_STORIES.md`)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Stale jobs timeout to `failed` | **PASS** | `lib/video-jobs/mark-stale-video-jobs-failed.ts`; cutoff from `getVideoJobStaleTimeoutMs()` via `video-job-config-readers.ts` (default 7_200_000 ms). Sweeper test validates `queued`/`processing` + `updated_at < cutoff` predicate. |
| Retry requires explicit confirmation showing new estimate | **PASS** | `VideoJobRetryConfirmDialog.tsx` → `previewRetryVideoJobEstimate`; `confirmEstimateCents` match in `retryVideoJob` (`retry-video-job.ts`). |
| Regeneration count visible (margin risk) | **PASS** | `countPrimaryVideoJobsForReel`; rendered in `OperatorVideoJobSummaryPanel.tsx:353-358`. |
| Retries beyond configurable max per Reel blocked until operator override | **PASS** | `readVideoMaxRetriesPerReel()` (default 3); `retry-video-job.ts` + override audit table; FE override when `limitExceeded`. |
| Operator-only: retry and override reject non-operator (403) | **PASS** | `requireOperator("handler")` first in retry/override actions and `GET /api/video-jobs/[jobId]/route.ts`. |
| [SEC] Retry limit and cumulative-budget check enforced server-side in retry handler | **PASS** | `assertVideoJobBudgetAllowsSpend` before create; max-attempt gate; UI `canRetry` non-authoritative. Budget soft UX now aligned with server gate. |
| [SEC] Webhook verifies authenticity and binds job before write | **PASS WITH NOTE** | Poll-only V1 — no webhook route. CONTRACT defers; satisfies poller-authority AC. |
| [SEC] Retry override recorded (user, reason, timestamp) US-10.2 pattern | **PASS** | `neuramark_video_job_retry_overrides`; INSERT-only in `override-video-job-retry-limit.ts`. |

---

## Acceptance Criteria — US-8.2 Phase B closure (`plan/stories/US-8.4/TASKS.md` § closure table)

| AC | Status | Evidence |
|----|--------|----------|
| Default low-tier talking-head E2E | **PASS** | Orchestrator gate-order integration test + `create-talking-head-video-job.ts` policy resolution; adapter tests `sadtalker-low-adapter.test.ts` (7/7). |
| Portrait + voiceover inputs | **PASS** | Asset validation in `create-talking-head-video-job.ts:127-146`. |
| Playable `media_assets` output (not third-party URL) | **PASS** | `apply-video-job-status-update.ts` → `persistVideoJobOutputAsset`; poller terminal test delegates to applier. |
| Failures capture reason; retries create child job | **PASS** | Sanitized `failure_reason`; lineage test asserts `parent_job_id` + incremented `attempt`. |
| Flat per-run estimate (~10¢) at create | **PASS** | `adapter.estimateCost` + `recordReelSpendEvent` at create. |
| [SEC] Consent + budget before submit | **PASS** | Gate-order test: `["budget", "consent", "createJob"]`. |
| [SEC] Poller-only status writes | **PASS** | `apply-video-job-status-update.ts` server-only; route grep test; no client status mutation. |
| [SEC] Download + URL allowlist | **PASS** | `persist-video-job-output.ts` job-row context; adapter URL tests in `sadtalker-low-adapter.test.ts`. |
| [SEC] Scoped status poll → 404 foreign job | **PASS** | IDOR test: foreign `jobId` → 404, own job → 200. |

---

## Convention Compliance

| Check | Status | Notes |
|-------|--------|-------|
| EN + ES under `scripts.videoJob.*` | **PASS** | `messages/en.json`, `messages/es.json` — `budgetExceeded` and retry copy present. |
| Server Components default; minimal `"use client"` | **PASS** | Page RSC; client islands for job panel and retry dialogs. |
| PrimeReact-first | **PASS** | `Tag`, `Button`, `Dialog`, `Message` in job UI. |
| Loading / empty / error / pending | **PASS** | Empty panel, poll spinner, retry dialog states, blocked-reason `Message`. |
| Operator-only cost fields | **PASS** | `OperatorVideoJobSummaryDto` with cost nested DTO; operator-gated batch. |
| No Supabase in client for job data | **PASS** | Server Actions + `GET /api/video-jobs/[jobId]`. |
| `neuramark_` DB prefix | **PASS** | Migration `20260830600000_neuramark_video_jobs.sql`. |
| CONTRACT frozen shapes | **PASS** | `lib/contracts/video-job.ts`; batch on `getReelScriptsForWeek`. |

---

## Gaps (non-blocking notes)

1. **SECURITY.md extended matrix (beyond TASKS.md)** — Not all nine SECURITY.md automated cases are in `video-jobs.test.ts`: non-operator retry → 403, consent revoked on retry, override without reason. Server code enforces these; dedicated tests are follow-up hardening, not story blockers.
2. **Webhook handler** — Optional per CONTRACT; poll-only V1 acceptable.
3. **Batch audit identity** — `getVideoJobsForReelScripts` passes reel `clientId` as `operatorClientId` for budget eligibility (`get-video-jobs-for-reel-scripts.ts:53-55`). V1 hardcoded operator/client identity makes this moot; real auth should pass operator id for audit when auth lands.

---

## Scope Creep

None identified. Implementation stays within US-8.4 CONTRACT Phase A (SadTalker-only, `/operator/scripts`, poll-only default, no Cliente job UI, no `/operator/production` route).

---

## Recommended Next Actions

| Priority | Action | Owner |
|----------|--------|-------|
| PO | Check off USER_STORIES US-8.4 AC and US-8.2 Phase B AC in `plan/USER_STORIES.md` | product-owner |
| P2 | Add SECURITY.md follow-up tests: non-operator retry 403, consent revoke on retry, override without reason | nextjs-backend |
| P2 | Optional webhook handler if product wants push updates | nextjs-backend |
| P2 | Pass true operator id to `getVideoJobsForReelScripts` budget eligibility when real auth lands | nextjs-backend |

---

## Files reviewed (representative)

- `lib/video-jobs/video-jobs.test.ts` (13 tests)
- `lib/video-jobs/video-job-config-readers.ts`, `video-job-config.ts`
- `lib/video-jobs/retry-eligibility.ts`, `actions/retry-video-job.ts`
- `lib/video-jobs/map-operator-video-job-dto.ts`, `get-video-jobs-for-reel-scripts.ts`
- `app/api/video-jobs/[jobId]/route.ts`
- `components/scripts/OperatorVideoJobSummaryPanel.tsx`, `VideoJobRetryConfirmDialog.tsx`
- `lib/providers/video/sadtalker-low-adapter.test.ts`
