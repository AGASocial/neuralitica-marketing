# QA Report — US-9.1 (Phase A — Assemble final 9:16 Reel)

**Branch:** `feature/US-9.1-assemble-reel`  
**BUILD commits reviewed:** worker `f74570f` · BE `7189f4b` · FE `9e7142c`  
**Validation:** PASS WITH NOTES — `plan/stories/US-9.1/VALIDATION.md` @ `03dff73` (23/23 tests)  
**CONTRACT:** `plan/stories/US-9.1/CONTRACT.md` (frozen, FE-reviewed)  
**SECURITY:** `plan/stories/US-9.1/SECURITY.md` (APPROVE WITH CONDITIONS)  
**Reviewer:** qa-engineer  
**Date:** 2026-08-30  

### Verdict: APPROVE WITH CONDITIONS

Phase A implements the frozen CONTRACT/SECURITY model: Operator-gated pointer-only assemble trigger, server-resolved inputs, args-array FFmpeg/ffprobe with `shell: false`, Storage SDK I/O (no assembly-time URL fetch), worker tenancy re-check before spawn, closed status writes under `lib/assembly/**`, scoped IDOR guards on poll and media serve, and strict Operator DTOs without paths or keys. No Critical or High exploitable findings.

**Close recommendation (Phase A): YES** — ship talking-head + manual-primary assembly path. Phase B (faceless B-roll stitch), live FFmpeg on Fly smoke, and SECURITY test-matrix IDOR route tests remain follow-ups; not blockers for Phase A close.

---

## Findings

### Medium

| # | Severity | Location | Issue | Why it matters | Recommended fix |
|---|----------|----------|-------|----------------|-----------------|
| 1 | **Medium** | `lib/assembly/poll-assembly-jobs.ts:25-42`, `lib/assembly/apply-assembly-job-update.ts:106-110` | Worker poll uses plain `SELECT … WHERE status = 'queued'` with no `FOR UPDATE SKIP LOCKED` (or equivalent atomic claim). `applyAssemblyJobUpdate` allows `UPDATE … WHERE status IN ('queued','processing')`, so two workers can both claim the same row while still `queued` and run FFmpeg concurrently. | CONTRACT § Poll runtime and SECURITY.md require atomic job claim. Under concurrent Fly replicas or dev in-process + worker overlap, duplicate FFmpeg runs waste compute and can produce orphaned `assembled_reel` assets before idempotency index catches up. Not cross-tenant IDOR. | Add RPC or raw SQL claim: `UPDATE … SET status='processing' WHERE id=$1 AND status='queued' RETURNING *`; skip row when zero rows updated. Mirror US-8.4 worker pattern when available. |
| 2 | **Medium** | `lib/assembly/resolve-assembly-inputs.ts:114-119` | Orchestrator always returns `remuxVoiceover: false`; no-audio primary is detected only at worker probe time (`run-assembly-job.ts:127-141`). Jobs enqueue without verifying voiceover exists when primary lacks an audio stream. | Operator can trigger assembly that always fails at worker with `missingAudio` after queue latency — UX/ops noise, not a trust-boundary bypass. | Optionally probe primary at enqueue (or require voiceover FK when latest primary is known silent-manual) to return `ASSEMBLY_INPUTS_INCOMPLETE` before INSERT. |

### Low

| # | Severity | Location | Issue | Why it matters | Recommended fix |
|---|----------|----------|-------|----------------|-----------------|
| 3 | **Low** | `lib/assembly/assembly-jobs.test.ts` (suite), `app/api/assembly-jobs/[jobId]/route.ts`, `app/api/media/assets/[assetId]/route.ts:169-182` | SECURITY test matrix items untested: foreign `reelScriptId` → `NOT_FOUND`, foreign assembly job GET → 404, foreign `assembled_reel` serve → 404. Code paths enforce `client_id` scope (`create-assembly-job-for-reel-script.ts:126-132`, `load-assembly-job.ts:27-28`, media route ownership). | High-impact IDOR regressions would ship undetected. VALIDATION flagged manual QA only. | Add mocked orchestrator test (foreign script → `NOT_FOUND`, no INSERT) and route handler unit tests with operator mock + foreign `client_id` row → 404. |
| 4 | **Low** | `components/scripts/OperatorAssemblyPanel.tsx:240` | ESLint `prefer-const`: `timer` never reassigned after initial assignment pattern. | Lint failure in US-9.1 FE slice; no runtime/security impact. | Change `let timer` to `const timer` (same pattern as sibling video panel). |
| 5 | **Low** | `lib/assembly/run-assembly-job.ts:208-213` | Broad `catch` maps any unexpected error to `ASSEMBLY_FAILURE_STORAGE`. | Operators see generic storage failure for probe/IO edge cases; harder ops debugging. | Narrow catch or map error class to distinct sanitized `failure_reason` keys. |

### Informational (non-blocking)

| Topic | Status | Notes |
|-------|--------|-------|
| Live FFmpeg / Fly E2E | **Deferred** | CONTRACT out of scope; args builder + mocked spawn only. Manual smoke on Fly/dev recommended before production traffic. |
| Phase B S3.M10 partial | **Documented** | No B-roll stitch, subtitles, or weekly auto-assemble in Phase A — VALIDATION.md records. |
| Hardcoded local operator | **Sanctioned** | `getCurrentUser()` interim per AGENTS.md — not a finding. |
| `npm run build` | **Pre-existing** | Compiles; page-data fails on `AUTH_DEV_FALLBACK` when `NODE_ENV=production` — not introduced by US-9.1. |
| `npm run lint` | **Pre-existing noise + FE nits** | Repo-wide lint debt; US-9.1-specific: Finding 4. Test files use `require()` pattern consistent with other stories. |

---

## Security control verification

| Control (CONTRACT / SECURITY.md) | Status | Evidence |
|----------------------------------|--------|----------|
| FFmpeg `spawn` args array, `shell: false` | **PASS** | `lib/assembly/run-ffmpeg.ts:26`; `probe-media-streams.ts:57` (ffprobe same pattern) |
| No shell `exec` / string interpolation | **PASS** | Grep: no `exec(` / `execSync` under `lib/assembly/**` |
| Phase A no user/script text in filtergraph | **PASS** | `build-reel-v1-basic-args.ts` — numeric duration/pad only; golden tests |
| No HTTP `fetch` for assembly asset bytes | **PASS** | `run-assembly-job.ts:116-140` uses `getMediaStorage()`; grep test passes |
| Trigger `{ reelScriptId }` only | **PASS** | Strict Zod schema; `findForbiddenAssemblyKeys` + test |
| Forbidden authority keys → `FORBIDDEN_FIELDS` | **PASS** | `create-assembly-job-for-reel-script.ts:114-116`; test |
| `requireOperator("handler")` first on mutate | **PASS** | `create-assembly-job-for-reel-script.ts:104-112`; Cliente → `FORBIDDEN` test |
| Script tenancy foreign id → `NOT_FOUND` | **PASS (code)** | `loadReelScriptForVideoJob` scopes `client_id`; **no unit test** (Finding 3) |
| Server-resolved primary + voiceover FKs | **PASS** | `resolve-assembly-inputs.ts:53-118` |
| Asset ownership before worker I/O | **PASS** | `run-assembly-job.ts:92-102`; cross-tenant mock test fails without spawn |
| `storage_key` regex validation | **PASS** | Migration CHECK; `load-media-asset-for-assembly.ts:56-58`; insert guard |
| Temp dir server UUID prefix | **PASS** | `run-assembly-job.ts:104-108` (`mkdtemp` + fixed basenames) |
| Closed status write surface | **PASS** | `apply-assembly-job-update.ts` sole writer; grep guard passes |
| GET assembly job Operator + `(jobId, client_id)` | **PASS (code)** | `app/api/assembly-jobs/[jobId]/route.ts:45-48`; **no route test** (Finding 3) |
| Media serve `assembled_reel` Operator + ownership | **PASS (code)** | `app/api/media/assets/[assetId]/route.ts:169-182`; **no route test** (Finding 3) |
| DTO excludes `storage_key`, ffmpeg argv, fingerprint | **PASS** | `operatorAssemblyJobDtoSchema` strict subset |
| Worker tenancy re-check at run | **PASS** | `run-assembly-job.ts:92-102`; mocked test |
| RLS + `neuramark_` prefix | **PASS** | `20260830800000_neuramark_assembled_reels.sql` |
| No `@supabase/supabase-js` in Client Components | **PASS** | `OperatorAssemblyPanel.tsx` imports action + contracts only |
| ADR-0003: no Vercel FFmpeg in prod | **PASS** | `enqueue-assembly-job.ts` no-op when `fly`; worker entry `worker/assembly-jobs.ts` |
| Atomic worker job claim | **PARTIAL** | Finding 1 — no `FOR UPDATE SKIP LOCKED` / conditional claim |

---

## Checks run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/assembly/assembly-jobs.test.ts lib/assembly/ffmpeg/build-reel-v1-basic-args.test.ts lib/assembly/run-assembly-job.test.ts` | **23 pass / 0 fail** (~214 ms) |
| `npm run lint` | **Fail** — repo-wide debt; US-9.1 FE `prefer-const` in `OperatorAssemblyPanel.tsx:240` |
| `npm run build` | **Fail (pre-existing)** — compiles; page-data blocked by `AUTH_DEV_FALLBACK` in production env |
| `npx tsc --noEmit` | **Pre-existing test-file TS noise** — assembly tests run via tsx, not tsc project |
| Manual IDOR route exercise | **Not run** — code review only; deferred to Finding 3 tests or manual QA |
| Live FFmpeg on Fly / dev in-process smoke | **Not run** — out of VALIDATION scope |

---

## What was not covered

- Manual Operator E2E: SadTalker/manual primary → Assemble → preview 1080×1920 MP4 on Fly or dev in-process.
- Automated route-level IDOR tests for assembly poll and `assembled_reel` media serve.
- Load/concurrency test for duplicate worker claims (Finding 1).
- Full-repo lint/build green (pre-existing failures unrelated to assembly security model).
- Phase B faceless B-roll, US-9.2 second FFmpeg pass, Cliente preview widening (US-11.1).

---

## Finding counts

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 2 |
| Low | 3 |
| Informational | 5 |

---

## Phase A close gate

| Question | Answer |
|----------|--------|
| QA verdict | **APPROVE WITH CONDITIONS** |
| Blockers for merge? | **No** — no Critical/High; Medium items are hardening/UX, not exploitable bypass |
| Recommend CLOSE Phase A? | **YES** |
| Conditions before production traffic | (1) Manual or Fly smoke with real FFmpeg; (2) track Finding 1 worker claim hardening in backlog; (3) add IDOR route tests (Finding 3) in next slice |
