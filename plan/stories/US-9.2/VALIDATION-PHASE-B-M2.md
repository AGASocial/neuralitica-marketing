# Validation Report — US-9.2 Phase B-M2

**Story:** US-9.2 — Branding poll atomic claim  
**Sprint label:** `US-9.2-B-M2`  
**Branch:** `feature/US-9.2-b-m2-branding-poll-claim`  
**Build ref:** `29352f4`  
**Validator:** requirements-validator  
**Date:** 2026-08-31  
**Sources:** `PHASE-B-M2.md` (M2-1…M2-11) · `CONTRACT.md` § Phase B-M2 · `SECURITY.md` Phase B-M2 (5 conditions) · `TASKS.md` Phase B-M2 checklist  
**Scope:** Worker claim race hardening only — **no** USER_STORIES AC changes; Phase A/B/M1 AC stay **[x]**.

### Verdict: PASS WITH NOTES

Phase B-M2 closes the branding poll claim race: atomic `queued` → `processing` claim with zero-row idempotent skip, runner early-exit before temp/download/spawn, and `queued`-only poll batch. M2 unit tests pass. Notes are non-blocking: no dedicated `apply-branding-job-update.test.ts`; `TASKS.md` gate checkboxes still unchecked (docs lag).

---

## Test execution

```bash
npx tsx --test lib/branding/run-branding-job.test.ts
```

| Metric | Result |
|--------|--------|
| Suites | 4 |
| Tests | **11 pass / 0 fail** |
| Duration | ~249 ms |

**M2 coverage:** `Phase B-M2: entry with processing status → no spawn`; `Phase B-M2: lost claim → no spawn`. Happy-path winner still covered by `completes with mocked ffmpeg — subtitles + logo + cover extract`.

**Not run:** dedicated applier unit file; poll batch integration; live Fly concurrent replica test.

---

## Phase B-M2 acceptance mapping

| Requirement (PHASE-B-M2 / CONTRACT § B-M2) | Status | Evidence |
|---------------------------------------------|--------|----------|
| **M2-2** Atomic claim via conditional UPDATE + RETURNING | **PASS** | `applyBrandingJobUpdate` processing path: `.eq("status","completed").eq("branding_status","queued").select("id")` (`lib/branding/apply-branding-job-update.ts:122–129`) |
| **M2-3** Zero rows → `{ ok: true, idempotent: true }`, no throw | **PASS** | `data.length === 0` branch reloads current status, returns `idempotent: true` (`apply-branding-job-update.ts:135–142`) |
| **M2-4** Runner gate: lost claim or peer `processing` → return before mkdtemp/download/spawn | **PASS** | Early return on `processing` at entry (`run-branding-job.ts:95–97`); claim + `claim.idempotent` return (`99–107`); `mkdtemp` at L206 is after gates |
| **M2-5** Poll batch `queued`-only | **PASS** | `.eq("branding_status", "queued")` — no `.in(..., "processing")` (`poll-branding-jobs.ts:28–29`) |
| **M2-7** `pre_branding_output_media_asset_id` on successful claim | **PASS** | Set in update payload when absent (`apply-branding-job-update.ts:103–107`) |
| Lost claim → **zero** FFmpeg | **PASS** | `run-branding-job.test.ts` — `loseProcessingClaim: true` mock; `ffmpegCalled === false` |
| Peer `processing` at entry → **zero** FFmpeg | **PASS** | `run-branding-job.test.ts:399–431` |
| Winner happy path unchanged | **PASS** | Existing mocked complete test still passes (`run-branding-job.test.ts` — completes with mocked ffmpeg) |
| Stale sweeper regression | **PASS** | `pollQueuedBrandingJobsBatch` still calls `markStaleBrandingJobsFailed()` first (`poll-branding-jobs.ts:22`); sweeper still selects stale `queued`/`processing` (`mark-stale-branding-jobs-failed.ts:31`) — unchanged this branch |
| QA Phase A Finding 1 + QA-PHASE-B Medium #2 closure (code) | **PASS** | Claim race + poll predicate fixed as specified |
| **M2-11** No US-9.1 assembly poll bundled | **PASS** | Branch diff: branding modules + docs only (`git diff main...HEAD --stat`) |

---

## SECURITY Phase B-M2 (5 conditions)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| **[SEC] Atomic job claim** | **PASS** | Conditional UPDATE + `.select("id")`; zero rows → idempotent (`apply-branding-job-update.ts:122–142`) |
| **[SEC] Lost-race applier semantics** | **PASS** | `idempotent: true` on zero rows; no throw |
| **[SEC] Runner early-exit gate** | **PASS** | `run-branding-job.ts:95–107` + M2 unit tests |
| **[SEC] Poll `queued`-only** | **PASS** | `poll-branding-jobs.ts:29` |
| **[SEC] No new client authority** | **PASS** | No FE/Route Handler/Server Action changes in branch diff |

---

## Convention compliance

| Check | Status |
|-------|--------|
| FE surface | **N/A** — none required (M2-9) |
| DB migration | **N/A** — none required |
| Localization | **N/A** — no user-facing strings |
| Server-only applier | **PASS** — `apply-branding-job-update.ts` `import "server-only"` |
| CONTRACT Phase B-M2 frozen | **PASS** — amended on branch (`CONTRACT.md` § Phase B-M2) |
| USER_STORIES AC untouched | **PASS** — validator did not check/uncheck AC |

---

## Gaps (non-blocking)

1. **`apply-branding-job-update.test.ts` missing** — CONTRACT § Phase B-M2 lists applier fixtures (lost race / successful claim); behavior is covered indirectly via `run-branding-job.test.ts` mock (`loseProcessingClaim`). Recommend dedicated applier tests for **nextjs-backend**.
2. **`TASKS.md` gate checkboxes** — BUILD items marked `[x]` but gate section (SECURITY/CONTRACT/VALIDATION/QA) still `[ ]`; docs lag only.
3. **No poll predicate unit test** — `poll-branding-jobs.ts` change is one line; regression risk low.

---

## Scope creep

**None.** Branding worker modules + story docs only; US-9.1 assembly poll untouched.

---

## Recommended next actions

| Action | Owner |
|--------|-------|
| QA lean — confirm Medium #2 CLOSED | **qa-engineer** |
| Optional: add `apply-branding-job-update.test.ts` for processing-claim rows-affected | **nextjs-backend** |
| Tick VALIDATION/QA gates; PO CLOSE M2 in `TASKS.md` / `README.md` | **product-owner** |
| Do **not** check/uncheck USER_STORIES § US-9.2 AC | **product-owner** |
