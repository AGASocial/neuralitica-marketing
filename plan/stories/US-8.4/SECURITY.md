# Security Design Review — US-8.4

**Story:** US-8.4 — Job status and failure handling UI (video job orchestration + status API)  
**Date:** 2026-08-29  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-8.4 AC + `[SEC]`), `plan/stories/US-8.2/CONTRACT.md` (Phase B DDL, `createTalkingHeadVideoJob`, status poll DTO), `plan/stories/US-8.2/SECURITY.md`, `plan/stories/US-8.1/SECURITY.md` + `CONTRACT.md` (adapter boundary, normalization, `persistedVideoJobStatusSchema`), `plan/stories/US-7.1/SECURITY.md` + `CONTRACT.md` (`assertReelBudgetAllowsSpend`, forbidden spend fields), `plan/stories/US-7.3/CONTRACT.md` (`OperatorProductionJobCostDto`), `plan/stories/US-3.2/SECURITY.md` (`assertActiveAvatarConsentForJobs`), `plan/stories/US-14.5/CONTRACT.md` (`requireOperator`), `plan/USER_STORIES.md` US-10.2 (override audit pattern), `docs/adr/0003-worker-flyio-ffmpeg.md`, `lib/contracts/providers.ts`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.  
**Primary implementer:** **nextjs-backend** (orchestration, Route Handlers, retry/override actions, webhook handler, `neuramark_video_jobs` migration). **media-pipeline-engineer** (Fly poller module, worker status writer, stale timeout). **nextjs-frontend** (Operator `/operator/production`, retry UI, read-only poll consumers — no status authority).

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct: **server-authoritative** job lifecycle (poller/worker + optional signed webhooks as the **only** status writers), **read-only** browser status APIs with **tenant-scoped IDOR guards**, **Operator-gated** retry and retry-override with **mandatory budget + consent re-check** on every billable retry create, and **append-only audit** for overrides mirroring US-10.2. US-8.2 Phase B already frozen the DDL and create path; US-8.4 completes orchestration, poll surfaces, retry lineage, stale timeout, and Operator UI.

No REDESIGN. The four primary threats — **client status manipulation**, **IDOR on job poll**, **webhook auth**, **consent/budget bypass on retry** — are addressable with concrete acceptance criteria. Orchestrator may proceed to **CONTRACT.md** after encoding the items below.

**Primary threats modeled:**

| Threat | Abuse class |
|---|---|
| **Client status manipulation** | POST/PATCH job status, `output_url`, or terminal state; smuggle `status: completed` on create/retry; replay stale poll responses as writes |
| **IDOR on job poll** | Guess UUID to read another client's generation progress, failure text, or asset linkage |
| **Webhook auth** | Forged provider callback marks jobs completed without vendor run; cross-tenant job binding via crafted `external_job_id`; unsigned callbacks accepted |
| **Consent/budget bypass** | Retry handler skips `assertReelBudgetAllowsSpend` or `assertActiveAvatarConsentForJobs`; UI-disabled retry bypassed via direct Server Action; override flag permanently skips gates |

**Inherited floors (do not weaken):** US-8.1 adapter boundary + normalization; US-8.2 poller-only status writes + IDOR 404 rule + gate order on initial create; US-7.1 central budget gate + forbidden spend authority fields; US-3.2 consent re-check at job time; US-14.5 `requireOperator()` as first await on operator mutations; ADR-0003 poll/fetch on Fly worker; interim hardcoded user is sanctioned — not a finding.

**This story owns:** `neuramark_video_jobs` migration + all server writes; `createTalkingHeadVideoJob()` and **retry** orchestrators; Fly poller loop + stale-job timeout; optional **webhook Route Handler** with signature verification; `GET /api/video-jobs/[jobId]` (Cliente read-only); Operator production list query + **`OperatorProductionJobCostDto`**; retry + retry-override Server Actions; **`neuramark_video_job_retry_overrides`** (or CONTRACT-exact) audit table; regeneration count; security tests for the four primary threats.

**This story does not own:** SadTalker/Wan/MuseTalk/HeyGen adapter bodies (US-8.2 / US-8.5–8.7); manual upload path (US-8.3 — must reuse job shape without weakening gates); TTS orchestration (US-9.3); FFmpeg assembly (US-9.x); QA override UI (US-10.2 — pattern only); auth redesign; Cliente-facing cost fields.

---

### Threat Summary (US-8.4–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Client sets `status` / `output_url` / `externalJobId`** | Forge completion; skip vendor billing; serve attacker URL | **No** client-callable status mutation endpoint. Create/retry request schemas reject `status`, `outputUrl`, `output_url`, `externalJobId`, `external_job_id`, `progressPercent`, `failureReason`, `outputMediaAssetId`. Status UPDATE paths exist **only** in `import "server-only"` poller/webhook modules |
| **Client promotes job via retry payload** | Retry used as disguised status write | Retry creates **new** job row (`parent_job_id`, `attempt + 1`); never UPDATE parent to `completed`. Retry body = `{ failedJobId, confirmRetry: true }` (+ override fields on separate action) — no status fields |
| **IDOR on `GET /api/video-jobs/[jobId]`** | Cross-tenant progress/failure leak | Load `WHERE id = $1 AND client_id = $2` with server-resolved `clientId` from `getCurrentUser()`. Foreign id → **404** (not 403). Same rule for any SSE channel keyed by job id |
| **IDOR on Operator production list** | Client reads margin-sensitive job/cost rows | `/operator/production` data via **`requireOperator("handler")`** first. List scoped to operator-authorized client set (V1: operator's client). Cost DTO never on Cliente poll API |
| **Unsigned / replayed webhook** | Attacker completes arbitrary jobs | Verify provider signature (Replicate webhook secret) **or** HMAC shared secret before parse. Reject missing/invalid signature → **401/403**, log metadata only, **no** DB write |
| **Webhook binds wrong job** | Complete victim job or orphan write | After auth: lookup **`WHERE external_job_id = $1 AND provider_key = $2`** (parameterized). No match → reject + log, **no** INSERT/UPDATE. Never trust client-supplied `provider_key` on webhook body without matching stored row |
| **Webhook + poller race double-spend** | Duplicate `fetchAsset` / spend finalize | Terminal transition **idempotent**: UPDATE only from non-terminal states; `fetchAsset` at-most-once via row lock or `output_media_asset_id IS NULL` guard; `finalizeGenerationCost` safe on repeat |
| **Retry skips budget gate** | Margin blowout via API | **`retryVideoJob()`** calls **`assertReelBudgetAllowsSpend`** with **new** estimate immediately before `adapter.createJob` — same module as initial create. UI disable is non-authoritative (story `[SEC]`) |
| **Retry skips consent** | Likeness generation after revoke | If reel `visualMode === own_avatar`: **`assertActiveAvatarConsentForJobs(clientId)`** on every retry create — same as `createTalkingHeadVideoJob` |
| **Retry override = permanent skip flag** | One override unlocks unlimited retries under cap | Override is **separate** Operator action inserting audit row; allows **one** retry attempt past max **when** budget gate still passes (or explicit US-7.1 budget override action used — distinct). No `skipBudgetCheck` / `skipRetryLimit` client fields |
| **Max retry bypass without audit** | Untraceable margin risk | Count attempts per `reel_script_id` (or lineage root). Block when `attempt > MAX_VIDEO_RETRIES_PER_REEL` unless valid override row exists for `(reel_script_id, override_scope)` with server timestamp within CONTRACT TTL/window |
| **Stale timeout as client trigger** | Client forces fail/success | Stale detection runs **only** in worker/poller cron comparing `updated_at` / `status IN (queued, processing)` to **`VIDEO_JOB_STALE_TIMEOUT_MS`** env — not client-callable |
| **Operator retry by non-operator** | Client-initiated regeneration spend | **`retryVideoJob`** and **`overrideVideoJobRetryLimit`** call **`requireOperator("handler")`** first → **403** for Cliente |
| **Over-exposure in status DTO** | Leak `external_job_id`, provider URL, cost | Cliente poll: **`persistedVideoJobStatusSchema`** + `jobId` + timestamps only. Operator list: separate DTO with sanitized `failureReason`, `attempt`, **`OperatorProductionJobCostDto`** — still no `rawOutputUrl`, tokens, or `envKeyName` |

**Residual risk accepted:** Operator trust — Operator can retry and record override (product intent). Webhook optional in V1 — poll-only path is acceptable if webhook Route Handler is absent; if present, auth AC is mandatory. UUID guessing against 404 is low sensitivity. Timing side-channels on poll are acceptable with uniform 404 messaging.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| `neuramark_video_jobs` rows | **High** — spend + production state | Service-role writes; status mutations **poller/webhook modules only** |
| Job status / `output_media_asset_id` | **High** — completion authority | Worker/webhook after adapter normalization — never browser |
| `external_job_id` + `provider_key` pair | Medium — webhook binding key | Lookup exact match only; webhook verifies both against stored row |
| Webhook signing secret | **Critical** | Server env only (`REPLICATE_WEBHOOK_SECRET` or CONTRACT exact); never client/log |
| Retry / override audit rows | Medium — margin accountability | Append-only; Operator write; no Cliente read in V1 |
| Cliente status poll DTO | Low–Medium | Minimal fields; no cost, no vendor ids |
| Operator production list + cost DTO | **High** — margin | `requireOperator`; never on Cliente session |
| Cumulative Reel spend (retry input) | **High** | Loaded server-side for gate — not client-supplied |

**Boundaries:**

1. **Browser (Cliente) → `GET /api/video-jobs/[jobId]`** — Untrusted. Read-only. Session → server `clientId` → scoped SELECT → minimal DTO.
2. **Browser (Operator) → retry / override / production list** — Untrusted. **`requireOperator()`** first. Retry intent only — no estimate/cap/status authority.
3. **Provider → webhook Route Handler** — Untrusted. Signature gate → job lookup → delegate to shared **`applyVideoJobStatusUpdate()`** (server-only) — same normalization as poller.
4. **Fly worker poller → adapter → DB** — Trusted server process. Loads job row + stored `provider_key` before `getJobStatus`. Only module that may transition status (with webhook sharing one code path).
5. **Vercel → create/retry orchestrator → adapter.createJob** — Gates (policy, budget, consent) before vendor I/O; enqueue poll message — no long poll on Vercel.

---

## Abuse Cases Considered

- *As a malicious actor, I POST `{ status: "completed", outputUrl: "https://evil.com/x.mp4" }` to a job endpoint* → **Blocked:** no mutation Route Handler; forbidden fields on all job bodies; grep CI on request schemas.
- *As a malicious actor, I PATCH `/api/video-jobs/[id]` to mark failed jobs completed* → **Blocked:** GET-only on Cliente poll path; no PATCH/PUT on job resource for browser sessions.
- *As a malicious actor, I poll job status with another client's UUID* → **Blocked:** `client_id` predicate; foreign → **404**.
- *As a malicious actor, I open SSE `/api/video-jobs/[id]/events` for a foreign job* → **Blocked:** same ownership check before subscribe; drop connection / 404 on mismatch.
- *As a malicious actor, I POST a fake Replicate webhook without signature* → **Blocked:** reject before body parse; no DB write; security log line with provider key hint only.
- *As a malicious actor, I replay an old valid webhook for an already-completed job* → **Blocked:** idempotent handler — terminal job ignores downgrade or duplicate complete; no second `fetchAsset`.
- *As a malicious actor, I send webhook with valid signature but another tenant's `external_job_id`* → **Blocked:** lookup requires existing row with matching `(external_job_id, provider_key)`; no match → reject.
- *As a malicious actor, I call `retryVideoJob` directly while over budget* → **Blocked:** server-side `assertReelBudgetAllowsSpend` before `createJob`; UI state irrelevant.
- *As a malicious actor, I retry own-avatar job after consent revoke* → **Blocked:** `assertActiveAvatarConsentForJobs` on retry path.
- *As a malicious actor, I POST `{ skipRetryLimit: true }` on retry* → **Blocked:** forbidden field; max enforced server-side; override requires separate audited action + `requireOperator`.
- *As a Cliente, I invoke retry or override actions* → **Blocked:** `requireOperator` → **403**.
- *As a malicious actor, I trigger stale timeout via client API* → **Blocked:** stale mark runs in worker only.
- *As a malicious actor, I read production list costs as Cliente* → **Blocked:** operator gate on list handler; cost fields excluded from Cliente poll DTO.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-8.4 are binding. Items marked **(added)** are new in this review — paste into the story when the PO next edits USER_STORIES.

**Inherited (still binding — do not weaken upstream paths):**

- [ ] **[SEC] All US-8.2 orchestration floors** — poller-only status writes; IDOR 404 on Cliente poll; consent + budget immediately before initial `createJob`; `persistedVideoJobStatusSchema` on Cliente DTO; no canonical provider URL in DB *(US-8.2)*
- [ ] **[SEC] Central budget gate on every billable retry** — `assertReelBudgetAllowsSpend` from US-7.1; no ad-hoc comparisons in retry handler *(US-7.1)*
- [ ] **[SEC] Active avatar consent re-check on retry when `own_avatar`** — `assertActiveAvatarConsentForJobs` *(US-3.2)*
- [ ] **[SEC] Operator-only mutations use `requireOperator("handler")` first** *(US-14.5)*
- [ ] **[SEC] Adapter/normalization boundary unchanged** — status from vendor only via registry + stored `provider_key` *(US-8.1)*

**US-8.4 story `[SEC]` (existing in USER_STORIES.md):**

- [ ] **[SEC] Retry limit and cumulative-budget check (US-7.1) are enforced in the server-side retry handler; disabling the retry button is UI convenience only** *(USER_STORIES US-8.4)*
- [ ] **[SEC] If a webhook endpoint is used for status updates, it verifies request authenticity (provider signature or shared secret) and matches `external_job_id` + `provider_key` against an existing job before writing; unmatched or unsigned callbacks are rejected and logged** *(USER_STORIES US-8.4)*
- [ ] **[SEC] Retry override is recorded (user, reason, timestamp) in the same audit pattern as QA overrides (US-10.2)** *(USER_STORIES US-8.4)*

**Added in this review (binding for US-8.4 BUILD):**

- [ ] **[SEC] (added) Closed write surface:** the **only** code paths that UPDATE `neuramark_video_jobs.status`, `failure_reason`, `output_media_asset_id`, or `actual_cost_cents` are **`import "server-only"`** modules under `lib/video-jobs/**` (shared **`applyVideoJobStatusUpdate`**) invoked by Fly poller and optional webhook handler. **Zero** Server Actions / Route Handlers accept client identity and mutate job status
- [ ] **[SEC] (added) Cliente status API is GET-only:** `GET /api/video-jobs/[jobId]` (CONTRACT exact path) — no POST/PUT/PATCH/DELETE on this resource for browser sessions. Response = **`clientVideoJobStatusDtoSchema`** = `persistedVideoJobStatusSchema` + `jobId` + `createdAt` + `updatedAt` — **strict**; excludes cost, `external_job_id`, `provider_key`, `rawOutputUrl`, asset FKs
- [ ] **[SEC] (added) IDOR guard:** job status load uses **`WHERE id = $1 AND client_id = $2`** with `clientId` from `getCurrentUser()` only — never from query/body. Missing/wrong tenant → **404** with generic envelope (no "exists but forbidden" leak). Automated test: peer job id → 404
- [ ] **[SEC] (added) Operator production list is Operator-only:** list/query Server Action or Route Handler calls **`requireOperator("handler")`** before SELECT. Returns **`OperatorProductionJobRowDto`** including **`OperatorProductionJobCostDto`** per US-7.3 — **never** exposed on Cliente poll API
- [ ] **[SEC] (added) Forbidden fields on create/retry request schemas:** reject with **`FORBIDDEN_FIELDS`**: `status`, `outputUrl`, `output_url`, `externalJobId`, `external_job_id`, `progressPercent`, `failureReason`, `failure_reason`, `outputMediaAssetId`, `estimatedCostCents`, `estimated_cost_cents`, `actualCostCents`, `skipBudgetCheck`, `skipRetryLimit`, `overrideRetryLimit`, `providerKey`, `provider_key`, `confirmRetry` without boolean true on retry (CONTRACT exact). Merge US-7.1 **`FORBIDDEN_BUDGET_SPEND_KEYS`**
- [ ] **[SEC] (added) Retry orchestration gate order (same as create):** `retryVideoJob({ failedJobId })` — (1) `requireOperator`; (2) load failed job + reel script server-side; (3) verify job terminal `failed` (or CONTRACT-allowed stale-failed); (4) enforce max attempts unless override audit valid; (5) `resolveProviderForJob`; (6) `adapter.estimateCost`; (7) **`assertReelBudgetAllowsSpend`**; (8) if `own_avatar` → **`assertActiveAvatarConsentForJobs`**; (9) `adapter.createJob`; (10) INSERT new row with `parent_job_id`, `attempt = parent.attempt + 1`; (11) `recordReelSpendEvent`; (12) enqueue poll — **no** UPDATE of parent status
- [ ] **[SEC] (added) Max retries per Reel:** env **`VIDEO_MAX_RETRIES_PER_REEL`** (CONTRACT default, e.g. **3**). Count = max `attempt` among jobs for `reel_script_id` or count of lineage — CONTRACT freezes. When exceeded → **`RETRY_LIMIT_EXCEEDED`** unless active override (below)
- [ ] **[SEC] (added) Retry override audit table:** **`neuramark_video_job_retry_overrides`** (or CONTRACT exact) — append-only (no UPDATE/DELETE endpoints). Columns: `id`, `client_id`, `reel_script_id`, `failed_job_id`, `operator_client_id`, `reason` (non-empty, max length), `created_at`. **`overrideVideoJobRetryLimit`** Server Action: `requireOperator` → validate reason → INSERT audit → returns short-lived **`retryOverrideToken`** or server-side flag checked inside **`retryVideoJob`** for **one** subsequent retry only. Pattern mirrors US-10.2 `qa_overrides` (user, reason, timestamp)
- [ ] **[SEC] (added) Webhook authenticity:** Route Handler **`POST /api/webhooks/video/[providerKey]`** (CONTRACT exact) — (1) read raw body for signature; (2) verify **Replicate-Signature** HMAC (or provider-specific verifier module per catalog); (3) constant-time compare; (4) reject on failure — **401**; (5) parse minimal payload for `id` / status only; (6) lookup job **`WHERE external_job_id = $1 AND provider_key = $2`**; (7) call **`applyVideoJobStatusUpdate`** — never select adapter from URL alone without row match
- [ ] **[SEC] (added) Webhook no-op paths:** unsigned, wrong signature, unknown `external_job_id`, or provider_key mismatch → **no** job UPDATE; structured security log (job id if known, provider key, outcome) — never log full body or secrets
- [ ] **[SEC] (added) Shared status applier:** **`applyVideoJobStatusUpdate({ jobRow, normalizedStatus })`** — single code path for poller + webhook. Validates enum via **`persistedVideoJobStatusSchema`**. Enforces allowed transitions (e.g. no `completed` → `queued`). Invokes `fetchAsset` + `finalizeGenerationCost` only on first transition to `completed`
- [ ] **[SEC] (added) Stale job timeout:** worker cron **`markStaleVideoJobsFailed()`** — `status IN ('queued','processing') AND updated_at < now() - interval`** from **`VIDEO_JOB_STALE_TIMEOUT_MS`**. Sets `failed` + sanitized `failure_reason` (i18n key / generic message). **Not** client-triggered
- [ ] **[SEC] (added) Regeneration count visibility:** Operator DTO exposes `attempt` and optional `regenerationCount` derived server-side from lineage — not client-writable
- [ ] **[SEC] (added) Automated security tests cover at least:** (1) no handler accepts `status` in body → `FORBIDDEN_FIELDS`; (2) Cliente poll foreign job id → **404**; (3) Cliente POST retry → **403**; (4) retry handler calls budget gate (mock/spy); (5) retry without consent when revoked → blocked; (6) webhook missing signature → **401** + no DB update; (7) webhook wrong `external_job_id` → no DB update; (8) override without reason → rejected; (9) grep — no `UPDATE neuramark_video_jobs` outside `lib/video-jobs/**`

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Status write authority — **server-only, single applier** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Writers | Fly poller + optional webhook → **`applyVideoJobStatusUpdate`** only |
| Readers | Cliente GET poll; Operator list/detail — read-only |
| Forbidden | Any `app/**/route.ts` or Server Action that SETS `status` / `output_media_asset_id` from request body |
| Idempotency | Terminal states sticky; duplicate complete safe |

**Condition:** CONTRACT lists allowed state transitions and names the single applier module.

#### 2. Cliente status poll — **GET-only, IDOR-safe DTO** (APPROVE)

| Rule | Detail |
|---|---|
| Path | `GET /api/video-jobs/[jobId]` |
| Auth | `requireActive("handler")` |
| Scope | `client_id` from session |
| Foreign id | **404** |
| DTO | `clientVideoJobStatusDtoSchema` — subset of persisted status; no cost/vendor ids |

**Condition:** If SSE added, same ownership check before stream open.

#### 3. Webhook — **verify first, bind second, write last** (APPROVE WITH CONDITIONS)

| Step | Control |
|---|---|
| 1 | Raw body + signature header |
| 2 | HMAC verify with server secret |
| 3 | Extract `external_job_id` + infer `provider_key` from route or payload |
| 4 | Parameterized lookup existing job |
| 5 | Registry `getVideoAdapter(job.provider_key).getJobStatus` optional refresh OR trust signed payload through normalizer only — CONTRACT picks; prefer **poll refresh on webhook** for Replicate to avoid trusting body status alone |
| 6 | `applyVideoJobStatusUpdate` |

**Condition:** CONTRACT documents Replicate verifier module path and secret env var name. Prefer webhook as **wakeup** that enqueues immediate poll rather than trusting callback JSON alone (stronger against replay/tamper).

#### 4. Retry — **new row, full gates, Operator-only** (APPROVE)

| Rule | Detail |
|---|---|
| Auth | `requireOperator("handler")` |
| Input | `{ failedJobId: uuid, confirmRetry: true }` strict |
| Gates | Max attempts → budget → consent (own avatar) → policy → createJob |
| Lineage | `parent_job_id`, `attempt + 1` |
| Parent row | Immutable after terminal |

**Condition:** Retry estimate shown in UI comes from server preview endpoint — not client-supplied cents.

#### 5. Retry override — **append-only audit, US-10.2 pattern** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Table | `neuramark_video_job_retry_overrides` append-only |
| Action | `overrideVideoJobRetryLimit({ failedJobId, reason })` |
| Reason | Required non-empty string, max length |
| Effect | Allows **one** retry past max when combined with normal budget/consent gates |
| Forbidden | Global `skipRetryLimit` flag; Cliente access |

**Condition:** CONTRACT mirrors US-10.2 columns and 403 on missing reason.

#### 6. Budget / consent on retry — **no bypass parameters** (APPROVE)

| Rule | Detail |
|---|---|
| Budget | **`assertReelBudgetAllowsSpend`** with new estimate every retry |
| Consent | **`assertActiveAvatarConsentForJobs`** when `own_avatar` |
| Override | US-7.1 budget override is **separate** audited action — not a hidden retry field |
| Forbidden | `skipBudgetCheck`, `estimatedCostCents`, `maxCostCents` on retry body |

#### 7. Operator production list — **margin isolation** (APPROVE)

| Rule | Detail |
|---|---|
| Route | `/operator/production` |
| Gate | `requireOperator` |
| DTO | Job status + `OperatorProductionJobCostDto` + sanitized failure + attempt |
| Cliente | **No** cost/status admin fields on Cliente APIs |

---

## Future-Proofing Notes

- **US-8.3 manual upload** must INSERT job rows with `provider_key = manual` without opening a client status-write path; Operator-only upload handler.
- **US-8.5–8.7** add providers — webhook verifier per `provider_key`; shared applier unchanged.
- **US-9.3** voiceover — retry reuses same asset ids from failed job row server-side, not client-supplied swap.
- **US-10.2** QA overrides — keep retry override schema parallel (append-only, reason required) for unified Operator audit UX later.
- **Real auth:** `client_id` / operator checks replace interim hardcoded user — same query shapes.
- **RLS:** `neuramark_video_jobs` deny-by-default; Node service-role only (US-8.2 DDL intent).

---

## CONTRACT Spot-Check Checklist (when CONTRACT.md exists)

Before BUILD starts, verify CONTRACT:

- [ ] `neuramark_video_jobs` migration matches US-8.2 Phase B DDL + `parent_job_id` / `attempt`
- [ ] `createTalkingHeadVideoJob()` gate order unchanged from US-8.2 CONTRACT
- [ ] **`retryVideoJob`** + **`overrideVideoJobRetryLimit`** Server Actions with schemas + forbidden fields
- [ ] **`applyVideoJobStatusUpdate`** — sole status writer; transition table
- [ ] **`GET /api/video-jobs/[jobId]`** — GET-only, 404 IDOR, `clientVideoJobStatusDtoSchema`
- [ ] Webhook Route Handler — signature verify, job lookup, reject unsigned
- [ ] **`VIDEO_MAX_RETRIES_PER_REEL`**, **`VIDEO_JOB_STALE_TIMEOUT_MS`** frozen defaults
- [ ] **`neuramark_video_job_retry_overrides`** DDL append-only
- [ ] Operator **`/operator/production`** + `OperatorProductionJobCostDto` — `requireOperator`
- [ ] ADR-0003 matrix — poll/stale/webhook processing on Fly
- [ ] Security test matrix for four primary threats
- [ ] Explicit forbidden: client status mutation, budget/consent skip flags, cost on Cliente poll

---

## Verdict for CONTRACT

**Pre-CONTRACT (this review): APPROVE WITH CONDITIONS** — **nextjs-backend** (primary) and **media-pipeline-engineer** may author `plan/stories/US-8.4/CONTRACT.md`. Proceed only if CONTRACT encodes the frozen items in **Design Concerns** and **Security Acceptance Criteria** above. Reconcile with US-8.2 Phase B sections — US-8.4 CONTRACT **extends**, does not contradict, the frozen DDL and create path.

**Post-CONTRACT spot-check (binding):**

| CONTRACT outcome | When |
|---|---|
| **APPROVE WITH CONDITIONS** | CONTRACT includes: (1) **single server-only status applier** + explicit allowed transitions; (2) **GET-only Cliente poll** with `client_id` scope → **404** IDOR; (3) **webhook verify-before-write** binding `(external_job_id, provider_key)` + reject unsigned; (4) **retry gate order** mirroring create with **`assertReelBudgetAllowsSpend`** + consent; (5) **forbidden status/budget fields** on all job/retry schemas; (6) **`requireOperator`** on retry/override/list; (7) **append-only retry override audit** (US-10.2 pattern); (8) **stale timeout worker-only**; (9) **Operator cost DTO isolated** from Cliente poll; (10) security test matrix for manipulation, IDOR, webhook, bypass |
| **REDESIGN** | CONTRACT exposes POST/PATCH for job status; accepts client `status`/`outputUrl` on retry; webhook writes without signature or without job row match; retry skips budget/consent; override is a permanent client flag; Cliente poll returns cost or `external_job_id` |
| **VETO (do not BUILD)** | Any Route Handler updating `neuramark_video_jobs.status` from JSON body; webhook without constant-time signature verify; retry Server Action without `requireOperator`; budget gate optional via query flag; shared poll endpoint without `client_id` predicate |

**Conditions that must be satisfied before BUILD (not optional polish):**

1. **Anti–status-manipulation:** one write path; GET-only client poll; forbidden fields grep-tested.
2. **Anti–IDOR:** parameterized `(id, client_id)` on all Cliente job reads/SSE.
3. **Anti–webhook-forgery:** signature first; job binding second; log rejects without DB write.
4. **Anti–consent/budget-bypass:** retry calls same gates as create; override audited separately; UI non-authoritative.

When CONTRACT.md lands, security-architect re-runs the spot-check checklist; **expected result: APPROVE WITH CONDITIONS** if all rows pass. Any REDESIGN finding blocks BUILD until CONTRACT revision.

---

## CONTRACT freeze list (binding summary)

1. **Writes:** poller/webhook → `applyVideoJobStatusUpdate` only — no client status mutation.
2. **Poll:** GET `/api/video-jobs/[jobId]`; `client_id` scope; foreign → 404; minimal DTO.
3. **Webhook:** verify signature; match `(external_job_id, provider_key)`; reject unsigned/unmatched.
4. **Retry:** Operator-only; new row + lineage; budget + consent before `createJob`; max attempts enforced.
5. **Override:** append-only audit with reason; US-10.2 pattern; no permanent skip flags.
6. **Stale:** worker-only timeout to `failed`.
7. **Cost:** Operator production list only; never on Cliente poll.
8. **Forbidden:** status, output URLs, estimates, skip flags on client job/retry bodies.
9. **Runtime:** ADR-0003 — poll/stale/webhook processing on Fly; create/retry enqueue from Vercel.
10. **Tests:** manipulation, IDOR, webhook auth, retry bypass — automated.

---

## BUILD vetoes (summary)

1. **Client-callable endpoint mutating `neuramark_video_jobs.status` or `output_media_asset_id`.**
2. **Cliente job poll without `client_id` predicate or returning 403 instead of 404 for foreign ids.**
3. **Webhook handler persisting status without signature verification and without existing job row match.**
4. **`retryVideoJob` without preceding `assertReelBudgetAllowsSpend` (and consent when `own_avatar`).**
5. **Retry or override callable without `requireOperator("handler")`.**
6. **Request schemas accepting `status`, `skipBudgetCheck`, `skipRetryLimit`, or client-supplied cost fields.**
7. **Cliente poll or SSE payload including cost cents, `external_job_id`, or `rawOutputUrl`.**
8. **Retry override without append-only audit row (user, reason, timestamp).**
9. **Stale failure transition triggered from browser-accessible API.**
10. **Duplicate `fetchAsset` / double `finalizeGenerationCost` on webhook+poller race without idempotency guard.**

---

## Verdict Rationale

**APPROVE WITH CONDITIONS** — not REDESIGN because USER_STORIES and US-8.2 already mandate server-authoritative job state, Operator-only retry control, webhook authenticity, and budget enforcement on retry. US-8.4 is the orchestration layer where those `[SEC]` rows become concrete APIs and worker modules. The four primary threats are classic job-system failures (client authority bleed, IDOR on async ids, unauthenticated callbacks, spend gate skip on retry) and are **testable** when CONTRACT freezes a single status applier, closed request schemas, and mirrored gate order on retry.

**Recommended action:** Proceed to **CONTRACT.md** with **nextjs-backend** as primary author; **media-pipeline-engineer** owns poller/stale/webhook worker modules; security-architect post-CONTRACT spot-check expected **APPROVE WITH CONDITIONS** when the freeze list is encoded.
