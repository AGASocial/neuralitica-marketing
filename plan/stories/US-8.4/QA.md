# QA Report — US-8.4 (video job orchestration)

**Branch:** `feature/US-8.4-video-jobs`  
**Commit reviewed:** `77142b9` — *US-8.4: fix QA P1 override consume and HMAC secret*  
**Prior validation:** PASS WITH NOTES (`plan/stories/US-8.4/VALIDATION.md`)  
**Prior QA:** APPROVE WITH CONDITIONS at `4e36fbc` (2026-08-29)  
**Re-QA reviewer:** qa-engineer  
**Re-QA date:** 2026-08-29  

### Verdict: APPROVE WITH CONDITIONS

US-8.4 implements the frozen CONTRACT security model: poller-only status writes via `applyVideoJobStatusUpdate`, operator-gated mutations with `requireOperator("handler")`, tenant-scoped job reads (foreign id → 404), forbidden authority keys on create/retry, server-side budget + consent gates on retry, append-only override audit, and operator-only cost DTOs. No Critical or High exploitable findings.

**P1 merge blockers (conditions 1–2) are resolved at `77142b9`.** Merge and story close are acceptable for local/V1. Remaining P2 conditions (concurrency hardening, extended security tests) are follow-up hardening and do not block close.

**Close recommendation:** **YES** — ship US-8.4; track P2 items as backlog.

---

## P1 re-verification (77142b9)

| Condition | Status | Evidence |
|-----------|--------|----------|
| **1 — Override consumed only after successful create** | **RESOLVED** | `retry-video-job.ts:248-274` calls `createTalkingHeadVideoJob` first; returns on `!createResult.ok` without consuming; `consumeRetryOverride(override.id)` runs only when `override` exists and create succeeded. Tests: `does not consume override when child job create fails`, `consumes override only after successful child job create` (`video-jobs.test.ts`). |
| **2 — `NEURAMARK_PROVIDER_ASSET_URL_SECRET` required in production** | **RESOLVED** | `lib/media/provider-asset-url-secret.ts:8-22` returns dedicated secret when set; returns `null` in production when unset (no service-role fallback). Route verify path fails closed → 401 (`provider-assets/[assetId]/route.ts:22-25,86-90`). URL signing throws `PROVIDER_CONFIG_MISSING` when secret absent (`resolve-media-asset-url-for-provider.ts:20-29`). Tests: `requires NEURAMARK_PROVIDER_ASSET_URL_SECRET in production`, dev-only service-role fallback (`video-jobs.test.ts`). |

---

## Findings

### Medium (open)

| # | Severity | Location | Issue | Why it matters | Recommended fix |
|---|----------|----------|-------|----------------|-----------------|
| 2 | **Medium** | `lib/video-jobs/retry-eligibility.ts:102-112`, `retry-video-job.ts:190-200` | Override consumption has no atomic tie to job creation; concurrent `retryVideoJob` calls can both pass the max-attempt check while sharing one unconsumed override row. | Two parallel retries could exceed the “one retry past max” guarantee under race. | Use DB transaction with `SELECT … FOR UPDATE` on override row, or unique partial index + conditional consume checking `rows affected`. |

### Medium (resolved in 77142b9)

| # | Severity | Location | Original issue | Resolution |
|---|----------|----------|----------------|------------|
| 1 | ~~Medium~~ | `retry-video-job.ts:248-274` | Override consumed before create | Consume moved after successful `createTalkingHeadVideoJob` |
| 3 | ~~Medium~~ | `provider-asset-url-secret.ts`, provider-assets route | Service-role HMAC fallback in production | Dedicated secret required in production; dev-only fallback |

### Low

| # | Severity | Location | Issue | Why it matters | Recommended fix |
|---|----------|----------|-------|----------------|-----------------|
| 4 | **Low** | `lib/video-jobs/map-operator-video-job-dto.ts:30-33` | Batch week-load `canRetry` uses persisted `job.estimatedCostCents`, not fresh `adapter.estimateCost` (preview path does re-estimate). | Expand-row panel may show `canRetry: true` while confirm dialog blocks on budget — confusing but non-authoritative. | Align batch mapper with preview estimate path, or omit budget from batch eligibility and rely on preview only. |
| 5 | **Low** | `lib/video-jobs/retry-eligibility.ts:120-173` | `evaluateRetryEligibility` does not surface consent revocation in `canRetry` / `retryBlockedReasonKey`. | Operator UI may offer retry until submit returns `CONSENT_REVOKED`; server still blocks spend. | Add consent probe for `own_avatar` scripts when computing eligibility (mirror create gate). |
| 6 | **Low** | `lib/video-jobs/video-jobs.test.ts` (suite overall) | SECURITY.md extended matrix items not automated: non-operator retry → 403, consent revoked on retry, override without reason. | Regression risk on trust boundaries documented as binding in SECURITY.md. | Add three focused handler tests (mock `requireOperator`, consent helper, Zod on override). |
| 7 | **Low** | `lib/video-jobs/get-video-jobs-for-reel-scripts.ts:53-55` | Batch passes reel `clientId` as `operatorClientId` for budget eligibility audit. | Budget audit events may attribute wrong operator identity when real auth lands. | Pass `operator.id` from `getReelScriptsForWeek` when auth stories ship. |
| 8 | **Low** | `lib/video-jobs/create-talking-head-video-job.ts:59-61` | `operatorClientId` option skips `requireOperator()` when provided. | Safe today (only `retryVideoJob` caller after auth); future misuse could bypass operator gate. | Always call `requireOperator` and assert `operator.id === options.operatorClientId`, or make option internal/private. |
| 9 | **Low** | `lib/video-jobs/apply-video-job-status-update.ts:119-133` | Status UPDATE does not check affected row count after optimistic `.in("status", ["queued","processing"])`. | Poller/webhook race may silently no-op while returning `{ idempotent: false }`. | Check Supabase `count` / returned rows; treat zero rows as idempotent no-op. |
| 10 | **Low** | `.env.example` | `NEURAMARK_PROVIDER_ASSET_URL_SECRET` not documented in example env file. | Deploy operators may miss required production secret despite runtime fail-closed. | Add commented entry to `.env.example` with production requirement note. |

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
| Retry gate order: operator → max/override → budget → consent → create → consume override | **PASS** | `retry-video-job.ts:157-274` |
| Override durability (consume after successful retry create) | **PASS** | `retry-video-job.ts:266-272`, override consumption tests |
| Budget gate authoritative on retry (UI non-authoritative) | **PASS** | `assertVideoJobBudgetAllowsSpend` in retry + eligibility test |
| Operator-only retry / override / poll | **PASS** | `requireOperator("handler")` first in actions + route |
| Override append-only audit | **PASS** | Migration `neuramark_video_job_retry_overrides`; INSERT-only action |
| Stale timeout worker-only | **PASS** | `mark-stale-video-jobs-failed.ts`; not exposed in `app/**` |
| Operator cost isolation | **PASS** | `operatorVideoJobSummaryDtoSchema` includes cost; poll GET excludes cost |
| `neuramark_` DB prefix + RLS deny-default | **PASS** | `20260830600000_neuramark_video_jobs.sql` |
| No Supabase in client job UI | **PASS** | FE uses Server Actions + `fetch('/api/video-jobs/...')` only |
| M1 provider-assets HMAC + tenant scope | **PASS** | `provider-asset-url-secret.ts`, constant-time verify + `client_id` predicate; production fail-closed |
| EN + ES `scripts.videoJob.*` | **PASS** | `messages/en.json`, `messages/es.json` |

---

## Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/video-jobs/video-jobs.test.ts` | **18 pass / 0 fail** (includes P1 fix tests for override consumption + HMAC secret) |
| `npm run lint` | **Exit 0** — pre-existing `@typescript-eslint/no-require-imports` in test files; not introduced by P1 fix |
| `npm run build` | **Failed** — `AUTH_DEV_FALLBACK must not be set when NODE_ENV=production` during page data collection. **Pre-existing local `.env` config**, not US-8.4-specific. Type-check and compile succeeded before page-data phase. |

---

## Conditions for merge / close

### Resolved (P1)

1. ~~**P1 — Override durability:**~~ **DONE** at `77142b9` (Finding #1).
2. ~~**P1 — Production HMAC secret:**~~ **DONE** at `77142b9` (Finding #3). Runtime enforcement verified; `.env.example` doc remains optional (Finding #10).

### Remaining (P2 — non-blocking for V1 close)

3. **P2 — Concurrency hardening:** Atomic override consume + create (Finding #2).
4. **P2 — Security test matrix:** Add missing SECURITY.md cases (Finding #6).

Findings #4, #5, #7–#9, #10 may ship as follow-up hardening without blocking V1 local operator flows or story close.

---

## What Was Not Covered

- Live Replicate / Fly.io worker E2E (mocked unit tests only per TASKS.md).
- Webhook authenticity (no handler shipped).
- Load/concurrency testing under parallel operator retries.
- Production deployment with auth stories (interim hardcoded operator/client).
- Full-repo lint/type cleanliness (scoped to US-8.4 modules and tests).
- Browser manual QA of `/operator/scripts` retry/override dialogs (code review + contract alignment only).

---

## Files reviewed (P1 re-QA at 77142b9)

- `lib/video-jobs/actions/retry-video-job.ts`
- `lib/media/provider-asset-url-secret.ts` (new)
- `lib/media/resolve-media-asset-url-for-provider.ts`
- `app/api/media/provider-assets/[assetId]/route.ts`
- `lib/video-jobs/video-jobs.test.ts` (override consumption + HMAC secret tests)
