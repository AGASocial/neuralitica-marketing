# Validation Report — US-9.1 Phase B-M2

**Story:** US-9.1 — Assembly poll atomic claim  
**Sprint label:** `US-9.1-B-M2`  
**Branch:** `feature/US-9.1-b-m2-assembly-poll-claim`  
**Build ref:** `2a69b24`  
**Validator:** requirements-validator  
**Date:** 2026-08-31  
**Sources:** `PHASE-B-M2.md` (M2-1…M2-11) · `CONTRACT.md` § Phase B-M2 · `SECURITY.md` Phase B-M2 (5 conditions) · `TASKS.md` Phase B-M2 checklist  
**Scope:** Worker claim race hardening only — **no** USER_STORIES AC changes; Phase A/B AC stay **[x]**.

### Verdict: PASS WITH NOTES

Phase B-M2 closes the assembly poll claim race: atomic `queued` → `processing` claim with zero-row idempotent skip, runner early-exit before temp/download/spawn, and `queued`-only poll batch. M2 unit tests pass; Phase A/B regression suites pass. Notes are non-blocking: no dedicated `apply-assembly-job-update.test.ts`; `TASKS.md` gate checkboxes still partially unchecked (docs lag).

---

## Test execution

```bash
npx tsx --test lib/assembly/assembly-jobs.test.ts lib/assembly/run-assembly-job.test.ts lib/assembly/run-assembly-job.phase-b.test.ts
```

| Metric | Result |
|--------|--------|
| Suites | 13 |
| Tests | **24 pass / 0 fail** |
| Duration | ~200 ms |

**M2 coverage:** `Phase B-M2: entry with processing status → no spawn (peer owns row)`; `Phase B-M2: lost claim → no spawn`. Happy-path winner still covered by `completes with mocked ffmpeg and probe` (primary) and Phase B `broll_stitch uses persisted ids, concat args, shell:false spawn`.

**Not run:** dedicated applier unit file; poll batch integration; live Fly concurrent replica test.

---

## Phase B-M2 acceptance mapping

| Requirement (PHASE-B-M2 / CONTRACT § B-M2) | Status | Evidence |
|---------------------------------------------|--------|----------|
| **M2-2** Atomic claim via conditional UPDATE + RETURNING | **PASS** | `applyAssemblyJobUpdate` processing path: `.eq("status", "queued").select("id")` (`lib/assembly/apply-assembly-job-update.ts:106–112`) |
| **M2-3** Zero rows → `{ ok: true, idempotent: true }`, no throw | **PASS** | `!data \|\| data.length === 0` branch reloads current status, returns `idempotent: true` (`apply-assembly-job-update.ts:118–125`) |
| **M2-4** Runner gate: lost claim or peer `processing` → return before mkdtemp/download/spawn | **PASS** | Early return on `processing` at entry (`run-assembly-job.ts:106–108`); claim + `claim.idempotent` return (`110–118`); `mkdtemp` at L180/L280 is after gates |
| **M2-5** Poll batch `queued`-only | **PASS** | `.eq("status", "queued")` — no `.in(..., "processing")` (`poll-assembly-jobs.ts:28`); unchanged this branch (already correct) |
| **M2-6** Dev in-process + poll overlap → one FFmpeg winner | **PASS** | Atomic claim + runner early-exit; poll still invokes `runAssemblyJob` per row but loser exits at claim gate |
| **M2-7** `onAssemblyJobCompleted` only on successful `completed` | **PASS** | Hook invoked only in `completed` transition path (`apply-assembly-job-update.ts:146–148`); lost claim returns before runner proceeds |
| Lost claim → **zero** FFmpeg | **PASS** | `run-assembly-job.test.ts:278–308` — `loseProcessingClaim: true` mock; `ffmpegCalled === false` |
| Peer `processing` at entry → **zero** FFmpeg | **PASS** | `run-assembly-job.test.ts:246–276` |
| Winner happy path unchanged (primary + faceless stitch) | **PASS** | Primary complete test + Phase B broll_stitch test still pass |
| Stale sweeper regression | **PASS** | `pollQueuedAssemblyJobsBatch` still calls `markStaleAssemblyJobsFailed()` first (`poll-assembly-jobs.ts:22`); sweeper still selects stale `queued`/`processing` (`mark-stale-assembly-jobs-failed.ts:30–31`) — unchanged this branch |
| QA Phase A Finding 1 + QA-PHASE-B Medium #1 closure (code) | **PASS** | Claim race + poll predicate fixed as specified |
| **M2-11** No US-9.2 branding poll bundled | **PASS** | Branch diff: assembly modules + story docs only (`git diff main...HEAD --stat`) |

---

## SECURITY Phase B-M2 (5 conditions)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| **[SEC] Assembly worker atomic job claim** | **PASS** | Conditional UPDATE + `.select("id")`; zero rows → idempotent (`apply-assembly-job-update.ts:106–125`) |
| **[SEC] Lost-race applier semantics** | **PASS** | `idempotent: true` on zero rows; no throw |
| **[SEC] Runner early-exit gate** | **PASS** | `run-assembly-job.ts:106–118` + M2 unit tests |
| **[SEC] Poll `queued`-only** | **PASS** | `poll-assembly-jobs.ts:28` |
| **[SEC] No new client authority** | **PASS** | No FE/Route Handler/Server Action changes in branch diff |

---

## Convention compliance

| Check | Status |
|-------|--------|
| FE surface | **N/A** — none required (M2-9) |
| DB migration | **N/A** — none required |
| Localization | **N/A** — no user-facing strings |
| Server-only applier | **PASS** — `apply-assembly-job-update.ts` `import "server-only"` |
| CONTRACT Phase B-M2 frozen | **PASS** — amended on branch (`CONTRACT.md` § Phase B-M2, commit `db8e246`) |
| SECURITY Phase B-M2 lean amend | **PASS** — `SECURITY.md` § Phase B-M2 present on branch |
| USER_STORIES AC untouched | **PASS** — validator did not check/uncheck AC |
| PrimeReact / getCurrentUser | **N/A** — no FE work |

---

## Gaps (non-blocking)

1. **`apply-assembly-job-update.test.ts` missing** — CONTRACT § Phase B-M2 lists applier fixtures (lost race / successful claim); behavior is covered indirectly via `run-assembly-job.test.ts` mock (`loseProcessingClaim`). Recommend dedicated applier tests for **nextjs-backend**.
2. **`TASKS.md` gate checkboxes** — BUILD items marked `[x]` but gate section still shows SECURITY/CONTRACT/VALIDATION/QA as `[ ]`; CONTRACT and SECURITY files are amended on branch — docs lag only.
3. **No poll predicate unit test** — `poll-assembly-jobs.ts` was already `queued`-only; regression risk low.

---

## Scope creep

**None.** Assembly worker modules + story docs only; US-9.2 branding poll untouched; no new endpoints, DTOs, or FE surfaces.

---

## Recommended next actions

| Action | Owner |
|--------|-------|
| QA lean — confirm QA Phase A Medium #1 + QA-PHASE-B Medium #1 CLOSED | **qa-engineer** |
| Optional: add `apply-assembly-job-update.test.ts` for processing-claim rows-affected | **nextjs-backend** |
| Tick VALIDATION/QA gates; PO CLOSE M2 in `TASKS.md` / `README.md` / `PHASE-B-M2.md` | **product-owner** |
| Do **not** check/uncheck USER_STORIES § US-9.1 AC | **product-owner** |
