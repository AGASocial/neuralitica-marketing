# QA Report — US-8.4 (video job orchestration)

**Branch:** `feature/US-8.4-video-jobs`  
**Commit reviewed:** `4e36fbc` — *docs(US-8.4): re-VALIDATE PASS WITH NOTES at ad4d514*  
**Prior validation:** PASS WITH NOTES (`plan/stories/US-8.4/VALIDATION.md`)  
**Reviewer:** qa-engineer  
**Date:** 2026-08-29  

### Verdict: APPROVE WITH CONDITIONS

US-8.4 implements the frozen CONTRACT security model: poller-only status writes via `applyVideoJobStatusUpdate`, operator-gated mutations with `requireOperator("handler")`, tenant-scoped job reads (foreign id → 404), forbidden authority keys on create/retry, server-side budget + consent gates on retry, append-only override audit, and operator-only cost DTOs. No Critical or High exploitable findings. Merge is acceptable for local/V1 with conditions on override durability, HMAC secret configuration, and extended security test coverage.

---

## Findings

### Medium

| # | Severity | Location | Issue | Why it matters | Recommended fix |
|---|----------|----------|-------|----------------|-----------------|
| 1 | **Medium** | `lib/video-jobs/actions/retry-video-job.ts:248-268` | `consumeRetryOverride()` runs **before** `createTalkingHeadVideoJob()`. If create fails (provider error, DB insert, asset validation), the one-time override is consumed without a successful retry. | Operators lose audit-granted retry capacity on transient failures; contradicts CONTRACT “override enables **one** subsequent retry” intent. | Consume override only after successful INSERT (same transaction or post-create callback). On create failure, leave `consumed_at` null. |
| 2 | **Medium** | `lib/video-jobs/retry-eligibility.ts:102-112`, `retry-video-job.ts:190-200` | Override consumption has no atomic tie to job creation; concurrent `retryVideoJob` calls can both pass the max-attempt check while sharing one unconsumed override row. | Two parallel retries could exceed the “one retry past max” guarantee under race. | Use DB transaction with `SELECT … FOR UPDATE` on override row, or unique partial index + conditional consume checking `rows affected`. |
| 3 | **Medium** | `app/api/media/provider-assets/[assetId]/route.ts:15-21` | HMAC secret falls back to `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` when `NEURAMARK_PROVIDER_ASSET_URL_SECRET` is unset. | Signed provider URLs would be derivable with the same material as full DB access if env is misconfigured; widens blast radius of URL leakage. | Require dedicated `NEURAMARK_PROVIDER_ASSET_URL_SECRET` in production; fail closed (401) if unset. Keep service-role fallback dev-only behind explicit flag. |

### Low

| # | Severity | Location | Issue | Why it matters | Recommended fix |
|---|----------|----------|-------|----------------|-----------------|
| 4 | **Low** | `lib/video-jobs/map-operator-video-job-dto.ts:30-33` | Batch week-load `canRetry` uses persisted `job.estimatedCostCents`, not fresh `adapter.estimateCost` (preview path does re-estimate). | Expand-row panel may show `canRetry: true` while confirm dialog blocks on budget — confusing but non-authoritative. | Align batch mapper with preview estimate path, or omit budget from batch eligibility and rely on preview only. |
| 5 | **Low** | `lib/video-jobs/retry-eligibility.ts:120-173` | `evaluateRetryEligibility` does not surface consent revocation in `canRetry` / `retryBlockedReasonKey`. | Operator UI may offer retry until submit returns `CONSENT_REVOKED`; server still blocks spend. | Add consent probe for `own_avatar` scripts when computing eligibility (mirror create gate). |
| 6 | **Low** | `lib/video-jobs/video-jobs.test.ts` (suite overall) | SECURITY.md extended matrix items not automated: non-operator retry → 403, consent revoked on retry, override without reason. | Regression risk on trust boundaries documented as binding in SECURITY.md. | Add three focused handler tests (mock `requireOperator`, consent helper, Zod on override). |
| 7 | **Low** | `lib/video-jobs/get-video-jobs-for-reel-scripts.ts:53-55` | Batch passes reel `clientId` as `operatorClientId` for budget eligibility audit. | Budget audit events may attribute wrong operator identity when real auth lands. | Pass `operator.id` from `getReelScriptsForWeek` when auth stories ship. |
| 8 | **Low** | `lib/video-jobs/create-talking-head-video-job.ts:59-61` | `operatorClientId` option skips `requireOperator()` when provided. | Safe today (only `retryVideoJob` caller after auth); future misuse could bypass operator gate. | Always call `requireOperator` and assert `operator.id === options.operatorClientId`, or make option internal/private. |
| 9 | **Low** | `lib/video-jobs/apply-video-job-status-update.ts:119-133` | Status UPDATE does not check affected row count after optimistic `.in("status", ["queued","processing"])`. | Poller/webhook race may silently no-op while returning `{ idempotent: false }`. | Check Supabase `count` / returned rows; treat zero rows as idempotent no-op. |

### Informational (non-blocking)

| Topic | Status | Notes |
|-------|--------|-------|
| Webhook handler | **Deferred (CONTRACT OK)** | Poll-only V1; no `app/api/webhooks/video/**` route. Acceptable per CONTRACT § Webhook optional. |
| Cliente job poll | **Out of scope** | `GET /api/video-jobs/[jobId]` is operator-only (`requireOperator`), matching US-8.4 CONTRACT amendment. |
| Hardcoded local user | **Sanctioned** | `getCurrentUser()` interim behavior per AGENTS.md — not a finding. |

---

## Security control verification

| Control (CONTRACT / SECURITY.md) | Status | Evidence |
|----------------------------------|--------|----------|
| Sole status writer (`applyVideoJobStatusUpdate`, server-only) | **PASS** | `apply-video-job-status-update.ts:1`, `video-jobs.test.ts` grep + server-only test |
| No client-callable status mutation routes | **PASS** | `app/api/video-jobs/[jobId]/route.ts` GET-only; no PATCH/POST |
| IDOR → 404 on scoped job read | **PASS** | `load-video-job.ts:27-28`, IDOR test in `video-jobs.test.ts` |
| Forbidden authority keys on create | **PASS** | `find-forbidden-keys.ts`, orchestrator test |
| Create gate order: budget → consent → createJob | **PASS** | `create-talking-head-video-job.ts:161-189`, gate-order test |
| Retry gate order: operator → max/override → budget → consent → create | **PASS** | `retry-video-job.ts:157-268` |
| Budget gate authoritative on retry (UI non-authoritative) | **PASS** | `assertVideoJobBudgetAllowsSpend` in retry + eligibility test |
| Operator-only retry / override / poll | **PASS** | `requireOperator("handler")` first in actions + route |
| Override append-only audit | **PASS** | Migration `neuramark_video_job_retry_overrides`; INSERT-only action |
| Stale timeout worker-only | **PASS** | `mark-stale-video-jobs-failed.ts`; not exposed in `app/**` |
| Operator cost isolation | **PASS** | `operatorVideoJobSummaryDtoSchema` includes cost; poll GET excludes cost |
| `neuramark_` DB prefix + RLS deny-default | **PASS** | `20260830600000_neuramark_video_jobs.sql` |
| No Supabase in client job UI | **PASS** | FE uses Server Actions + `fetch('/api/video-jobs/...')` only |
| M1 provider-assets HMAC + tenant scope | **PASS** | Constant-time verify + `client_id` predicate (secret fallback noted above) |
| EN + ES `scripts.videoJob.*` | **PASS** | `messages/en.json`, `messages/es.json` |

---

## Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/video-jobs/video-jobs.test.ts` | **13 pass / 0 fail** |
| `npm run lint` | **Exit 0** — pre-existing `@typescript-eslint/no-require-imports` warnings in test files (including `video-jobs.test.ts`); not introduced by US-8.4 logic |
| `npx tsc --noEmit` | **Errors in test files only** (dynamic `require` typing); application sources compile under `next build` type-check phase |
| `npm run build` | **Failed** — `AUTH_DEV_FALLBACK must not be set when NODE_ENV=production` during `/login` page data collection. **Pre-existing local `.env` config**, not US-8.4-specific. Compiled successfully before page-data phase. |

---

## Conditions for merge

1. **P1 — Override durability:** Do not consume retry override until child job row is successfully created (Finding #1).
2. **P1 — Production HMAC secret:** Document and enforce `NEURAMARK_PROVIDER_ASSET_URL_SECRET` in deployed environments; avoid service-role fallback in production (Finding #3).
3. **P2 — Concurrency hardening:** Atomic override consume + create (Finding #2).
4. **P2 — Security test matrix:** Add missing SECURITY.md cases (Finding #6).

Findings #4, #5, #7–#9 may ship as follow-up hardening without blocking V1 local operator flows.

---

## What Was Not Covered

- Live Replicate / Fly.io worker E2E (mocked unit tests only per TASKS.md).
- Webhook authenticity (no handler shipped).
- Load/concurrency testing under parallel operator retries.
- Production deployment with auth stories (interim hardcoded operator/client).
- Full-repo lint/type cleanliness (scoped to US-8.4 modules and tests).
- Browser manual QA of `/operator/scripts` retry/override dialogs (code review + contract alignment only).

---

## Files reviewed (representative)

- `lib/video-jobs/**` — orchestration, poller, stale sweeper, retry/override actions, budget gate, DTO mappers, tests
- `app/api/video-jobs/[jobId]/route.ts`
- `app/api/media/provider-assets/[assetId]/route.ts`
- `components/scripts/OperatorVideoJobSummaryPanel.tsx`, `VideoJobRetryConfirmDialog.tsx`, `VideoJobRetryLimitOverrideDialog.tsx`
- `lib/reel-scripts/actions/get-reel-scripts-for-week.ts`
- `lib/contracts/video-job.ts`
- `supabase/migrations/20260830600000_neuramark_video_jobs.sql`
- `plan/stories/US-8.4/CONTRACT.md`, `SECURITY.md`, `VALIDATION.md`
