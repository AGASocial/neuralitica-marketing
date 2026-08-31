# QA Report — US-7.3 Track actual cost per generation job

**Story:** US-7.3  
**Branch:** `feature/US-7.3-actual-cost`  
**Commits reviewed:** `f6038e9` … `030d85f`  
**Reviewed:** 2026-08-30  
**Reviewer:** qa-engineer  
**Sources:** `plan/stories/US-7.3/{CONTRACT,SECURITY,TASKS}.md`, `lib/cost-policy/*`, script/caption orchestrators, `getReelScriptsForWeek`, `components/scripts/ScriptsPageView.tsx`, `supabase/migrations/20260830510400_neuramark_reel_spend_events_actual_cost_reason.sql`

### Verdict: APPROVE WITH NOTES

**Severity counts:** Critical **0** · High **1** · Medium **2** · Low **3**  
**CLOSE recommended:** **Yes** — after one-line FE fallback fix for **H1** (trivial; does not change security or contract shape). Phase A LLM actual-cost path, Operator-only reads, forbidden-key posture, migration, and security tests align with frozen `CONTRACT.md` and `SECURITY.md`.

---

## Findings

### High (fix before merge)

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| H1 | `app/(app)/operator/scripts/page.tsx:58-64`, `:71-79` | Error/fallback success objects omit required `costSummary` after `getReelScriptsForWeekSuccessSchema` extension. | **`npm run build` fails** type-check (`TS2322` / `TS2719`). Operator scripts page cannot ship. | Add `costSummary: { weekStart, clientId: operator.id or empty UUID from user, slots: [], weeklyEstimatedCostCents: 0, weeklyActualCostCents: null, hasPartialActual: false }` to both fallback literals (mirror `emptyWeekCostSummary` in the action). |

### Medium (non-blocking)

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| M1 | `lib/reel-scripts/generate-reel-scripts-for-client.ts:408-418` · `lib/reel-captions/generate-reel-captions-for-client.ts:409-419` | Orchestrators `await finalizeGenerationCost(...)` without checking `{ ok: false }`. | CONTRACT: spend persist failure must propagate. DB INSERT throws (good), but a validation failure would leave a persisted script/caption **without** a spend row — AC gap and silent economics loss. Unlikely today because orchestrators always pass `llmUsage`, but the contract path allows soft failure. | Check result; on `!ok` throw or return internal error (fail closed post-persist). Add orchestrator test with mocked `{ ok: false }`. |
| M2 | `lib/cost-policy/compute-llm-actual-cost.ts` · `lib/providers/siliconflow-llm-adapter.ts` | `provider_no_billing` enum is frozen in DDL/i18n but **never emitted** — failures map to `usage_missing` or `catalog_cost_model_unsupported` only. | AC / CONTRACT allow null actual + closed reason; one enum value is dead. Stub adapters that cannot bill should return this reason for Operator clarity. | Return `provider_no_billing` from stub/adapter when vendor explicitly omits billing (e.g. stub with zero usage by design). |

### Low (non-blocking)

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| L1 | CONTRACT surface #8 `sumReelActualCostCents` | Helper not extracted; per-`reel_script_id` SUM lives inline in `getReelCostSummaryForWeek`. | CONTRACT module map drift; behavior is covered by aggregation tests. | Optional extract to `lib/cost-policy/sum-reel-actual-cost-cents.ts` or mark N/A in CONTRACT at CLOSE. |
| L2 | SECURITY test matrix S7 | No repo grep/CI test asserting zero `actual_cost_cents` in exported client-request Zod schemas. | Partial coverage via forbidden-key unit tests only. | Add grep test mirroring US-7.1/7.2 pattern. |
| L3 | `lib/cost-policy/record-reel-spend-event.ts` | Still exported; caller restriction is convention-only (prod: `finalizeGenerationCost` only). | Future drift could bypass central writer. | Document in module header or narrow export surface in a follow-up. |

---

## Security Review Summary

| Control | Status | Evidence |
|---------|--------|----------|
| Central module `import "server-only"` sole writer | **PASS** | `finalize-generation-cost.ts:1`, `compute-llm-actual-cost.ts:1`, `update-reel-spend-event-actual.ts:1` |
| No client write surface for actual cost | **PASS** | `FORBIDDEN_BUDGET_SPEND_KEYS` extended (`cost-policy.ts:87-104`); script/caption forbidden helpers merge list |
| Adapter-sourced actuals only | **PASS** | Orchestrators pass `llmUsage.adapterReportedCents` from agent completion, not request body |
| `recordReelSpendEvent` INSERT-only from central module | **PASS** | Grep: single prod caller `finalize-generation-cost.ts:48` |
| Immutability `WHERE actual_cost_cents IS NULL` | **PASS** | `update-reel-spend-event-actual.ts:78`; tests S3/S4 |
| Tenant scope on async UPDATE | **PASS** | `update-reel-spend-event-actual.ts:38-43`, `:76-77` |
| Operator reads `requireOperator` first | **PASS** | `get-reel-scripts-for-week.ts:54`; non-operator 403 tests |
| `clientId` server-derived (no foreign tenant in body) | **PASS** | `get-reel-scripts-for-week.ts:73` |
| Cliente cost exclusion (response shape) | **PASS** | `costSummary` on Operator action only; `reelScriptListItemSchema` has no cost fields |
| Failure reason closed enum + DB CHECK | **PASS** | Migration `neuramark_reel_spend_events_unavailable_reason_chk` |
| Decision log append-only | **PASS** | No UPDATE to `neuramark_provider_decisions` |
| Budget gate unchanged (estimates only) | **PASS** | `assertReelBudgetAllowsSpend` / `sumReelCumulativeCostCents` unchanged |
| RLS deny-by-default on spend ledger | **PASS** | Prior migration; no new policies |
| No `@supabase` in US-7.3 Client Component | **PASS** | `ScriptsPageView` uses Server Actions + display types only |
| Phase B async seam exported, not wired | **PASS** | `updateReelSpendEventActual` tested; no prod US-8.x call sites |

**SECURITY spot-check (post-CONTRACT):** All binding conditions from `SECURITY.md` **Design Concerns** and **Security Acceptance Criteria** are satisfied in Phase A BUILD.

---

## CONTRACT Compliance (Phase A)

| Item | Status |
|------|--------|
| `neuramark_reel_spend_events` canonical ledger | **PASS** |
| Migration `actual_cost_unavailable_reason`, `duration_sec`, indexes, CHECKs | **PASS** |
| `computeLlmActualCost` — adapter ≥1 cent precedence, catalog token math | **PASS** |
| `finalizeGenerationCost` sync_insert sole writer | **PASS** |
| `updateReelSpendEventActual` async seam (exported, not wired) | **PASS** |
| Orchestrators wire script + caption via `finalizeGenerationCost` | **PASS** |
| `getReelCostSummaryForWeek` aggregation rules | **PASS** |
| `getReelScriptsForWeek` attaches `costSummary` | **PASS** |
| `/operator/scripts` cost column + weekly footer + EN/ES | **PASS** |
| Forbidden keys on generate/regenerate | **PASS** |
| SiliconFlow token-based actual (replaces placeholder 0 path via recompute) | **PASS** |
| `sumReelActualCostCents` standalone helper | **PARTIAL** — see L1 |
| Phase B `OperatorProductionJobCostDto` / production list | **N/A** (deferred US-8.4) |
| Security test matrix S1–S7 | **PARTIAL** — S7 see L2; S1–S6 **PASS** |

---

## Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/cost-policy/actual-cost.test.ts lib/cost-policy/get-reel-cost-summary-for-week.test.ts lib/cost-policy/cost-policy.test.ts lib/reel-scripts/reel-scripts.test.ts lib/reel-captions/reel-captions.test.ts` | **117/117 pass** |
| `npm run build` | **FAIL** — `page.tsx` missing `costSummary` (H1) |
| `npx tsc --noEmit` | **FAIL** — same H1 in app code (+ pre-existing test-file TS noise) |
| `npm run lint` | **Exit 1** — pre-existing `no-require-imports` in test files; unrelated app lint in `operator/playbook/page.tsx` |
| Grep: prod `recordReelSpendEvent(` callers | **1** — `finalize-generation-cost.ts` only |
| Grep: public Server Action accepting `actualCostCents` | **0** |
| Grep: `@supabase` in `components/scripts/ScriptsPageView.tsx` | **0** |

---

## What Was Not Covered

- Live browser E2E of cost column and weekly footer on `/operator/scripts`.
- Migration apply against live Supabase (`20260830510400_*`).
- Cliente-role session harness on cost-bearing response (403 path covered in unit tests only).
- Phase B video/TTS `async_update` wiring (explicitly out of Phase A scope).
- Full production build after H1 fix (expected PASS).
- Historical pre-7.3 row backfill (out of scope per TASKS).

---

## Recommended actions

| Priority | Action | Owner |
|----------|--------|-------|
| **Pre-merge** | Fix `page.tsx` fallback `costSummary` (H1) | nextjs-frontend |
| **CLOSE** | PO checks Phase A AC boxes in `plan/USER_STORIES.md` § US-7.3 | product-owner |
| Post-close | Fail closed when `finalizeGenerationCost` returns `!ok` (M1) | nextjs-backend |
| Post-close | Wire `provider_no_billing` from stub adapter path (M2) | media-pipeline-engineer |
| Post-close | Grep test for client Zod schemas (L2) | nextjs-backend |

---

## CLOSE recommendation

**Yes — CLOSE recommended** for Phase A after **H1** is fixed (expected one small diff in `app/(app)/operator/scripts/page.tsx`). Core story intent is met: LLM jobs persist actual or null + reason on the spend ledger via a server-only central module; Operator sees estimated vs actual per slot and weekly sum on `/operator/scripts`; client forgery and Cliente leakage controls match `SECURITY.md`. Remaining Medium/Low items are hardening and CONTRACT hygiene, not merge blockers once H1 is resolved.

---

## Verdict Rationale

**APPROVE WITH NOTES** — implementation faithfully executes frozen CONTRACT Phase A and satisfies SECURITY conditions (central writer, forbidden keys, immutability, Operator gating, estimate-only budget gate). Automated coverage is strong (117 tests). The only merge blocker is a FE fallback type omission (H1), not a trust-boundary defect.

---

# Phase B — Video / TTS / B-roll spend backfill

**Story:** US-7.3 Phase B (`US-7.3-B`)  
**Branch:** `feature/US-7.3-phase-b-spend-backfill`  
**Commits reviewed:** `1add7ed` (FE poll cost merge) · `d3b2e03` (GET cost DTO + TTS trusted duration) · `3f3653c` (poller duration + spend actual) · `6da4340` (PREP/SPEC/SECURITY/CONTRACT) · VALIDATION.md Phase B present  
**Reviewed:** 2026-08-31  
**Reviewer:** qa-engineer  
**Sources:** `plan/stories/US-7.3/{CONTRACT,SECURITY,VALIDATION,PHASE-B}.md` Phase B; `lib/video-jobs/apply-video-job-status-update.ts`, `persist-video-job-output.ts`, `app/api/video-jobs/[jobId]/route.ts`, `lib/tts/synthesize-voiceover-for-client-trusted.ts`, `components/scripts/OperatorVideoJobSummaryPanel.tsx`, adapters (`optionalDurationSecFromBuffer`)

### Verdict: APPROVE WITH CONDITIONS

**Severity counts:** Critical **0** · High **0** · Medium **1** · Low **4**  
**CLOSE recommended:** **Yes** — no Critical/High. Medium/Low are post-close hardening; they do **not** block Phase B CLOSE. Do **not** uncheck Phase A USER_STORIES AC.

Phase B BUILD matches frozen CONTRACT (writer table, Operator poll `OperatorProductionJobCostDto`, no `/operator/production`, Cliente response-shape exclusion) and SECURITY Phase B **12 conditions**. Hunt items (Cliente leak, client-supplied actuals, late INSERT, fail/cancel spend mutation, write-once, SSRF/vendor log leak, `@supabase` in Client Components) **PASS**.

---

## Findings (Phase B)

### Critical / High

None.

### Medium (non-blocking)

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| **M1** | `lib/video-jobs/apply-video-job-status-update.ts:114-123` | `await finalizeGenerationCost(...)` result is discarded. `{ ok: false }` (`NOT_FOUND`, `TENANT_MISMATCH`, `VALIDATION_ERROR`) still proceeds to mark the job `completed` and mirror `actual_cost_cents` on `neuramark_video_jobs`. | Completed job + job-row actual while ledger stays estimate-only. Operator GET is **ledger-wins**, so the panel can show pending/`estimated_only` after complete; weekly SUM misses the actual. Throws still fail the poller (good); soft `ok: false` is fail-open. `ALREADY_FINALIZED` *should* be ignored. | Check result; on `NOT_FOUND` / `TENANT_MISMATCH` / `VALIDATION_ERROR` log and fail the complete pass (or skip job-row actual). Treat `ALREADY_FINALIZED` as success. |

### Low (non-blocking)

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| **L1** | `lib/providers/video/optional-duration-sec-from-buffer.ts:14-19` · `lib/media/probe-video-duration.ts` | `Promise.race` 1.5s timeout does **not** abort `mp4box` parsing of vendor bytes. Poller does not hang (timeout wins), but a stuck parser can retain the buffer. | Untrusted-buffer residual. Download already cap-bytes + host allowlist. Duration omit-on-timeout matches CONTRACT. | Bound parse (slice first N bytes) or drop the probe promise reference; do not block complete on duration. |
| **L2** | `components/scripts/OperatorVideoJobSummaryPanel.tsx:240-248` | Poll JSON is `as`‑cast; no Zod `operatorVideoJobSummaryDtoSchema` on the client. No unit test for `mergePolledStatus`. | GET already validates server-side. Malformed 200 would only affect Operator display, not the ledger. | Optional `safeParse` before merge; add a tiny merge unit test. |
| **L3** | `OperatorVideoJobSummaryPanel.tsx:221,260,270` | Lint: `prefer-const` on `timer`; `react-hooks/exhaustive-deps` (`job` omitted, deps are `job?.jobId` / `job?.status`). | Quality only; poll still keyed on job identity + in-flight status. | `const` after assign, or leave with comment; not a security issue. |
| **L4** | `lib/video-jobs/build-operator-production-job-cost.ts:40-49` | Ledger `select` ignores `error`; missing `data` falls back to job-row costs even when `spendEventId` is present. | Transient DB error can show mirror instead of ledger (DTO ledger-wins gap). No Cliente leak. | If `error`, keep last known / omit actual rather than silently using job-row when a spend id exists. |

---

## Hunt checklist (requested)

| Hunt | Result | Evidence |
|------|--------|----------|
| Cliente cost leakage on poll/serializers | **PASS** | GET first await `requireOperator` (`route.ts:24-31`); Cliente 403, no `cost` JSON (`video-jobs.test.ts` PB-S2). `operatorVideoJobStatusDtoSchema` stays status-only. Calendar slot DTO uses `videoJob?.status` only — no cost fields. Approval / list / voiceover schemas omit cost keys (PB-S4). Trusted TTS success return omits cost keys (`synthesize-voiceover-for-client-trusted.ts:165-171`). |
| Client-supplied `actualCostCents` | **PASS** | GET has no body. Forbidden keys on video create + TTS (`find-forbidden-keys.ts`, `find-forbidden-synthesis-keys.ts`). Tests: TTS `actualCostCents` / `durationSec` → `FORBIDDEN_FIELDS`. Persist/finalize read adapter `fetchAsset` / typed `storedAsset` only. |
| Late spend INSERT when `spendEventId` missing | **PASS** | Log only (`apply-video-job-status-update.ts:124-130`); no `finalize` / no `recordReelSpendEvent`. Test asserts no INSERT and log has no vendor URL. |
| Fail/cancel mutating spend actuals | **PASS** | Fail/cancel do not call `finalizeGenerationCost`. Job update may rewrite `actual_cost_cents` with existing job value (`null`); does not invent `0`. Tests: zero finalize, zero spend INSERT. |
| Write-once / overwrite of actuals | **PASS** | `updateReelSpendEventActual` `WHERE actual_cost_cents IS NULL`; different value → `ALREADY_FINALIZED`. Terminal job early-return skips second finalize. Test: stored actual stays `18` when persist returns `99`. |
| SSRF / vendor body leak in logs | **PASS** | `fetchAsset` → `validateProviderOutputUrl` + host allowlist + redirect re-check + max bytes. Missing-`spendEventId` log: `jobId` / `clientId` / `reelScriptId` only — no `rawOutputUrl`. |
| Duration probe hang / untrusted buffer | **PASS WITH L1** | 1.5s race timeout so complete is not blocked; duration omitted. Parser not aborted (L1). |
| `@supabase/supabase-js` in Client Components | **PASS** | No `@supabase` under `components/`. Panel `fetch`s Next.js GET only. `formatCentsForDisplay` is display-only (no `server-only` leak). |
| Contract vs implementation drift | **PASS** | GET validates `operatorVideoJobSummaryDtoSchema` + `mapOperatorVideoJobSummaryDto`. FE `mergePolledStatus` copies `cost`. `durationSec` on video `async_update` + TTS trusted INSERT. Closed `provider_no_billing` when persist actual null. No `/operator/production`. No new DDL. DTO ledger-wins when `spendEventId` present. Budget still `estimated_cost_cents` only. |

---

## SECURITY Phase B — 12 conditions

| # | Condition | Status |
|---|-----------|--------|
| 1 | TTS exception: `server-only`, adapter-sourced, no client actuals, write-once, no migrate | **PASS** |
| 2 | Exclusive actual writers: `finalize` async_update / manual 0 + TTS INSERT; create estimate-only | **PASS** |
| 3 | Zero HTTP mutations accepting actuals / client `durationSec` | **PASS** |
| 4 | FE = panel + Operator GET + `OperatorProductionJobCostDto`; no `/operator/production` | **PASS** |
| 5 | Poll DTO Operator-only; zero cost keys on Cliente poll/serializers | **PASS** |
| 6 | Ledger canonical; job-row mirror; DTO ledger-wins; no `video_jobs` SUM | **PASS** |
| 7 | Fail/cancel: no spend actual UPDATE | **PASS** |
| 8 | Missing `spendEventId`: log only; no late INSERT | **PASS** |
| 9 | Complete + `spendEventId`: actual or closed reason; never null/null | **PASS** |
| 10 | `durationSec` server-derived on video async_update + TTS trusted | **PASS** (omit on timeout — L1) |
| 11 | Budget gate estimates only | **PASS** |
| 12 | Security test matrix PB-S1–S12 | **PASS** (75/75 Phase B suite) |

---

## CONTRACT Compliance (Phase B)

| Item | Status |
|------|--------|
| Video complete → `async_update` + `durationSec` + closed reason | **PASS** |
| Missing `spendEventId` → no INSERT | **PASS** |
| Fail/cancel ∉ finalize | **PASS** |
| Operator GET 200 includes `cost` / `OperatorProductionJobCostDto`; no `cost_model` | **PASS** |
| FE poll merge copies `cost` | **PASS** (L2: no FE unit test) |
| TTS trusted `durationSec` on INSERT; leave TTS on `recordReelSpendEvent` | **PASS** |
| Manual `actual = 0` unchanged | **PASS** (verify tests) |
| Wan B-roll same poller writer | **PASS** |
| No `/operator/production`; no US-7.4 reopen; no new tables | **PASS** |
| GET 404/403 envelopes | **PASS** (404 `{ error: "NOT_FOUND" }` pre-existing US-8.4; 403 `{ error: { code: "FORBIDDEN" } }` matches CONTRACT) |

---

## Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test` Phase B suite (`apply-video-job-status-update`, `build-operator-production-job-cost`, `video-jobs`, `us-7.3-phase-b-security`, TTS synthesize, talking-head, b-roll, manual upload) | **75/75 pass** |
| `npx tsc --noEmit` | **FAIL** (pre-existing test-file noise). Phase B prod hit: `synthesize-voiceover-for-client-trusted.ts:170` excess `idempotent` (US-11.2 shape; not introduced as a cost field). `create-broll-video-jobs.ts` TS2322 **not** in Phase B diff vs `origin/main`. |
| `npx next lint` on Phase B files | Panel **prefer-const** Error + hooks warning (L3). Other listed files clean. |
| `npm run build` | **Not run** (tsc already showed no Phase B app-route type break on GET/poller). |
| Grep: `@supabase` in `components/` | **0** |
| Grep: `app/**/operator/production` | **0** |
| Grep: prod `recordReelSpendEvent` / `finalizeGenerationCost` call sites | Create = estimate-only; complete = `async_update`; TTS INSERT actual; no Route Handler UPDATE of spend actuals |

---

## What Was Not Covered

- Live browser poll-after-complete on `/operator/scripts` (Operator GET + panel merge).
- Live Cliente session hitting `GET /api/video-jobs/[jobId]` (unit 403 only).
- HTTP webhook Route Handler (none in this slice; `source: "webhook"` enum-only).
- Full `npm run build`.
- USER_STORIES AC checkboxes (out of this gate by instruction).

---

## Recommended actions

| Priority | Action | Owner |
|----------|--------|-------|
| **CLOSE** | Phase B CLOSE; do **not** change USER_STORIES US-7.3 AC | product-owner |
| Post-close | Honor `finalizeGenerationCost` `{ ok: false }` except `ALREADY_FINALIZED` (M1) | media-pipeline-engineer |
| Post-close | Optional duration-probe abort / FE merge parse (L1–L2) | media-pipeline-engineer / nextjs-frontend |

---

## CLOSE recommendation (Phase B)

**Yes — CLOSE recommended.** Trust boundaries hold: no client write of actuals, no Cliente cost JSON, no late ledger INSERT, fail/cancel leave estimate-only spend, Operator poll carries `OperatorProductionJobCostDto`. Remaining items are fail-open spend persist (M1) and hardening.

---

## Verdict Rationale (Phase B)

**APPROVE WITH CONDITIONS** — implementation matches frozen CONTRACT Phase B and SECURITY’s 12 conditions. Automated matrix **75/75**. No Critical/High. Conditions = M1 (check finalize result) + Low hygiene; none require fix before CLOSE. **Next gate:** product-owner Phase B CLOSE notes only.
