# QA Report — US-9.1 Phase B (Faceless B-roll stitch)

**Story:** US-9.1 — Assemble final 9:16 Reel (Phase B / sprint `US-9.1-B`)  
**Branch:** `feature/US-9.1-phase-b-broll-stitch`  
**BUILD / VALIDATION refs:** media/worker `c3a9c19` · FE enable `80652c2` · canAssemble fix `1106420` · VALIDATION re-check `6d13f4b` (PASS WITH NOTES)  
**CONTRACT:** Phase B amendment frozen + FE Reviewed approved (`de22717` / `9fa1f69`)  
**SECURITY:** Phase B APPROVE WITH CONDITIONS (10 conditions)  
**Reviewer:** qa-engineer  
**Date:** 2026-08-31  
**Scope:** Faceless B-roll stitch + zero-broll degrade + Assemble enablement; SECURITY Phase B matrix; CONTRACT Phase B deltas. Phase A floors re-checked on stitch path.

### Verdict: APPROVE WITH CONDITIONS

Phase B correctly extends the Phase A assembly trust model to N owned B-roll clips: Operator-gated `{ reelScriptId }` only, server-resolved ordered broll FKs (cap 8) + required voiceover, persisted `broll_asset_ids` / `assembly_path_tag` for worker replay, args-array concat via `buildBrollConcatArgs` + `spawn(..., { shell: false })`, Storage SDK downloads only, per-clip ownership re-check, numeric cold-open parse, sanitized incomplete/failure keys, talking-head ignores broll, and server-authoritative null-job `canAssemble` companions for first-time faceless Assemble. No Critical or High findings. No must-fix before CLOSE.

**Close recommendation (Phase B): YES** — with non-blocking Medium hardening tracked below (worker claim race inherited; readiness companion early-return edge).

---

## Findings

### Medium

| # | Severity | Location | Issue | Why it matters | Recommended fix |
|---|----------|----------|-------|----------------|-----------------|
| 1 | **Medium** | `lib/assembly/poll-assembly-jobs.ts:25-42`, `lib/assembly/apply-assembly-job-update.ts` | Worker poll still uses plain `SELECT … WHERE status = 'queued'` with no atomic claim (`FOR UPDATE SKIP LOCKED` / conditional `UPDATE … WHERE status='queued' RETURNING`). Inherited from Phase A QA Finding 1; Phase B multi-clip FFmpeg raises compute cost of a double claim. | Concurrent Fly replicas (or overlapping in-process + worker) can both run concat on the same job → wasted CPU, orphaned `assembled_reel` assets until sticky/idempotency settles. Not cross-tenant IDOR. | Atomic claim: `UPDATE … SET status='processing' WHERE id=$1 AND status='queued' RETURNING *`; skip when zero rows. |
| 2 | **Medium** | `lib/assembly/get-assembly-jobs-for-reel-scripts.ts:104-106` | On assembly-jobs query `error`, function returns the pre-initialized map of `null` entries and **skips** null-job readiness companions (`mapNullJobAssemblyReadinessDto`). | Transient DB errors leave FE without `canAssemble`; panel falls back to `job === null && hasPrimaryVideo`, which can hide faceless stitch readiness (or mis-signal talking-head convenience) until reload. Not a trust-boundary bypass — mutate path still enforces resolve gates. | On query error, still emit companions for requested script ids (or surface a controlled batch error) so B12 readiness does not depend on the jobs SELECT succeeding. |

### Low

| # | Severity | Location | Issue | Why it matters | Recommended fix |
|---|----------|----------|-------|----------------|-----------------|
| 3 | **Low** | Phase B test suite / SECURITY matrix item 6 | No dedicated assertion that degrade/incomplete **fixtures** lack vendor CDN / argv / `storage_key` / Bearer substrings. Coverage is indirect via messageKey-only paths. | Regression could reintroduce over-rich `failure_reason` without a red test. | Add fixture substring deny-list test on incomplete/fail DTOs and worker fail reasons for stitch path. |
| 4 | **Low** | `components/scripts/OperatorAssemblyPanel.tsx:455` | ESLint `prefer-const`: `timer` never reassigned (Phase A Finding 4 still present). | Lint noise in FE slice; no runtime/security impact. | `const timer`. |
| 5 | **Low** | `lib/assembly/run-assembly-job.ts:317-324` | Cold-open trim is re-parsed from live `neuramark_reel_scripts.cold_open_notes` at worker run, not frozen on the job row at enqueue. Fingerprint omits trim (CONTRACT). | In-flight jobs can pick up notes edited after enqueue (usually also bumps `script_updated_at` for *new* jobs). Edge inconsistency only; parse still digits-only — no injection. | Optionally persist `cold_open_trim_sec` on enqueue and pass that number into the builder. |
| 6 | **Low** | CONTRACT test file note | `create-assembly-job-for-reel-script.phase-b.test.ts` not present as a dedicated file; fingerprint + forbidden + Cliente 403 covered in `assembly-jobs.test.ts`. | Acceptable coverage (VALIDATION noted); slightly harder to map CONTRACT test-file table. | Optional dedicated file or leave as-is. |

### Informational (non-blocking)

| Topic | Status | Notes |
|-------|--------|-------|
| Live FFmpeg / Operator E2E | **Deferred** | CONTRACT / VALIDATION out of scope; mocked spawn + golden argv only. Manual Fly/dev smoke recommended before production traffic. |
| TASKS.md BE/Worker Phase B boxes | **Doc lag** | VALIDATION note — unchecked despite shipped code; product-owner hygiene. |
| Legacy `job === null && hasPrimaryVideo` Assemble fallback | **Allowed** | CONTRACT FE constraint #3; week load now emits companions so faceless stitch prefers `canAssemble === true`. |
| Hardcoded local operator | **Sanctioned** | `getCurrentUser()` interim per AGENTS.md — not a finding. |
| Phase A remux-at-enqueue gap | **Unchanged** | Orchestrator still enqueues primary path without audio probe; worker fails `missingAudio` — Phase A Medium #2, not Phase B stitch path (stitch always requires VO at resolve). |
| Residual S3.M10 | **Documented** | Rewind FX / weekly auto-assemble correctly out of Phase B. |

---

## Security control verification (Phase B — 10 conditions + floors)

| # / Control | Status | Evidence |
|-------------|--------|----------|
| 1 Anti–shell-injection | **PASS** | `build-broll-concat-args.ts` pure `string[]`; `run-ffmpeg.ts:26` `shell: false`; phase-b + floor spawn tests |
| 2 Anti–filtergraph-text-injection | **PASS** | Argv = temp paths + numerics; `parseColdOpenTrimSec` digits-only; malicious notes absent from argv test |
| 3 Anti–multi-clip-IDOR | **PASS** | Resolver ownership per clip; worker re-check each broll + VO; cross-tenant test → failed, no spawn |
| 4 Anti–client path/URL authority | **PASS** | Extended `FORBIDDEN_ASSEMBLY_AUTHORITY_KEYS` (broll/clip/concat/path_tag/…); trigger Zod `{ reelScriptId }` strict; tests |
| 5 Anti–SSRF-at-stitch | **PASS** | Storage SDK + `assertSafeKey`; grep no `fetch(` under `lib/assembly/**` |
| 6 Anti–cold-open string passthrough | **PASS** | `parse-cold-open-trim-sec.ts`; builder receives number only |
| 7 Anti–degrade-secret-leak | **PASS (code)** | messageKeys only (`facelessWaitingForClips`, `facelessMissingVoiceover`, sanitized failure keys); **no dedicated substring fixture test** (Finding 3) |
| 8 Anti–Cliente-trigger | **PASS** | `requireOperator("handler")` first; Cliente → FORBIDDEN test retained |
| 9 Anti–modality-confused-deputy | **PASS** | Talking-head always `pathTag=primary`, `brollAssetIds=[]`; tests |
| 10 Anti–fingerprint-forgery | **PASS** | Five-part server fingerprint + `path_tag`; worker corruption guard; client cannot supply |
| Phase A floors (DTO closed, status writes, ADR-0003, `neuramark_` DDL) | **PASS** | DTO omits `brollAssetIds` / paths / argv; `applyAssemblyJobUpdate` sole writer; migration `20260831090000_…_phase_b_broll.sql`; no client Supabase |
| Atomic worker job claim | **PARTIAL** | Finding 1 |
| B12 FE readiness | **PASS** | Nullable batch DTO + companions; panel `canAssembleFromServer`; poll preserves `canAssemble`; readiness tests 3/3 |

---

## CONTRACT Phase B delta spot-check

| Delta | Status |
|-------|--------|
| Faceless stitch only; talking-head ignores broll | **PASS** |
| Order `created_at ASC`, cap 8 | **PASS** |
| Zero broll → degrade / `facelessWaitingForClips` | **PASS** |
| Voiceover required on stitch | **PASS** |
| Persist `broll_asset_ids` + `assembly_path_tag`; worker replay only | **PASS** |
| Fingerprint five-part + exact path tags | **PASS** |
| `buildBrollConcatArgs` concat demuxer + 1080×1920 codecs | **PASS** |
| FE Assemble via server `canAssemble` / null-job companion | **PASS** |
| i18n EN/ES incomplete + fingerprintMismatch keys | **PASS** |
| No scope into US-9.2 / talking-head overlays / Wan / weekly cron | **PASS** |

---

## Checks run

| Command | Result |
|---------|--------|
| `npx tsx --test` Phase B focused + floors (`resolve-assembly-inputs.phase-b`, `run-assembly-job.phase-b`, `build-broll-concat-args`, `parse-cold-open-trim-sec`, `assembly-readiness.phase-b`, `assembly-jobs`, `run-assembly-job`) | **43 pass / 0 fail** (~354 ms) |
| `npx eslint` on Phase B changed FE/BE sources | **1 error** (`prefer-const` timer — Finding 4); 2 warnings (hooks deps; unused `_canAssemble` omit) |
| Manual Operator E2E / live FFmpeg on Fly | **Not run** — deferred |
| Route-level IDOR tests (poll / media serve) | **Not run** — Phase A Finding 3 still open; code paths unchanged and still scoped |

---

## What was not covered

- Live FFmpeg concat on Fly or `ASSEMBLY_JOB_POLL_MODE=in_process` with real Wan clips → Assemble → 9:16 preview.
- Concurrent worker claim load test (Finding 1).
- Automated IDOR route tests for assembly poll / `assembled_reel` serve (Phase A gap).
- Full-repo `npm run lint` / `npm run build` green (pre-existing AUTH_DEV_FALLBACK / repo lint debt).
- Revision seam `createAssemblyJobForClientTrusted` (pre-existing trusted caller; not Phase B delta) — spot-checked call site only.

---

## Finding counts

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 2 |
| Low | 4 |
| Informational | 6 |

---

## Phase B close gate

| Question | Answer |
|----------|--------|
| QA verdict | **APPROVE WITH CONDITIONS** |
| Critical / High must-fix before CLOSE? | **None** |
| Blockers for merge? | **No** |
| Recommend CLOSE Phase B? | **YES** |
| Conditions / follow-ups | (1) Track worker atomic claim (Finding 1); (2) harden companion emission on jobs SELECT error (Finding 2); (3) optional degrade substring test + prefer-const; (4) manual Fly/dev stitch smoke before production traffic |
