# Validation Report — US-9.1 (Phase A)

**Story:** US-9.1 — Assemble final 9:16 Reel  
**Branch:** `feature/US-9.1-assemble-reel`  
**Build refs:** worker `f74570f` / `153b73a` · BE `7189f4b` · FE `9e7142c`  
**Validator:** requirements-validator  
**Date:** 2026-08-30  
**Scope:** Phase A only (talking-head + manual-primary normalize/mux; faceless B-roll stitch deferred Phase B)

### Verdict: PASS WITH NOTES

Phase A satisfies all five USER_STORIES § US-9.1 acceptance criteria and CONTRACT/SECURITY floors. Notes cover intentional Phase B / partial S3.M10 deferrals, SECURITY test-matrix gaps for QA manual IDOR checks, and absence of live FFmpeg E2E in CI.

---

## Test execution

```bash
npx tsx --test \
  lib/assembly/assembly-jobs.test.ts \
  lib/assembly/ffmpeg/build-reel-v1-basic-args.test.ts \
  lib/assembly/run-assembly-job.test.ts
```

| Metric | Result |
|--------|--------|
| Suites | 13 |
| Tests | **23 pass / 0 fail** |
| Duration | ~206 ms |

**Coverage highlights:** golden FFmpeg args (trim/pad/remux), forbidden-key rejection, Cliente `FORBIDDEN`, spawn `shell: false`, cross-tenant worker fail-without-spawn, grep guards (no `UPDATE neuramark_assembled_reels` outside `lib/assembly/**`; no `fetch(` in `lib/assembly/**`), idempotent terminal `applyAssemblyJobUpdate`, mocked full `runAssemblyJob` pipeline.

**Not run (explicit out of scope):** live FFmpeg on Fly, manual Operator E2E (SadTalker → Assemble → preview 1080×1920).

---

## Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Output aspect ratio 9:16 | **PASS** | `buildReelV1BasicArgs` filter `scale=1080:1920:…,crop=1080:1920` (`lib/assembly/ffmpeg/build-reel-v1-basic-args.ts:3–4, 41–59`). Output metadata `width: 1080`, `height: 1920` (`lib/assembly/insert-assembled-reel-media-asset.ts:37–38`). Golden tests in `build-reel-v1-basic-args.test.ts`. |
| Duration within script target ± configurable tolerance | **PASS** | Default tolerance `NEURAMARK_ASSEMBLY_DURATION_TOLERANCE_SEC_DEFAULT = 2` (`lib/contracts/assembly-job.ts:11`). Trim via `-t` and pad via `tpad`/`apad` in args builder (`build-reel-v1-basic-args.ts:31–69, 86–88`). Post-encode validation `abs(actual - target) > toleranceSec` → fail (`run-assembly-job.ts:166–171`). |
| Pipeline idempotent per script version | **PASS** | Partial unique index on completed triple (`supabase/migrations/20260830800000_neuramark_assembled_reels.sql:29–31`). Server fingerprint `sha256(primary \| voiceover \| template)` (`lib/assembly/compute-input-fingerprint.ts`). Orchestrator returns existing completed/in-flight row without duplicate INSERT (`create-assembly-job-for-reel-script.ts:157–185, 209–224`). |
| [SEC] FFmpeg invoked with argument arrays; owned `media_assets` inputs; no injectable text Phase A | **PASS** | `spawn(ffmpegPath, args, { shell: false })` (`lib/assembly/run-ffmpeg.ts:26`). Pure args builder — no script text, `-drawtext`, or user filenames (`build-reel-v1-basic-args.ts`). Inputs loaded via `loadMediaAssetForAssembly` + `client_id` check before Storage read (`run-assembly-job.ts:85–102, 116–119`). Temp dir server UUID prefix (`run-assembly-job.ts:104–108`). Tests: spawn contract + no shell metacharacters (`assembly-jobs.test.ts`, `run-assembly-job.test.ts`). |
| [SEC] Assembly only consumes stored assets; no arbitrary URL fetch (SSRF guard) | **PASS** | Downloads via `getMediaStorage().readStream(storageKey)` after `assertSafeKey` (`run-assembly-job.ts:116–140`). No `fetch(` under `lib/assembly/**` — grep test passes (`assembly-jobs.test.ts:412+`). Trigger accepts `{ reelScriptId }` only; forbidden keys rejected (`find-forbidden-assembly-keys.ts`, `create-assembly-job-for-reel-script.ts:114–116`). |

---

## CONTRACT surface verification

| Surface | Status | Evidence |
|---------|--------|----------|
| Migration `neuramark_assembled_reels` + `assembled_reel` enum | **PASS** | `supabase/migrations/20260830800000_neuramark_assembled_reels.sql` matches CONTRACT DDL (no `preview_url`/`final_url`; partial unique index; storage_key CHECK). |
| `lib/contracts/assembly-job.ts` | **PASS** | Schemas, error codes, forbidden keys, env defaults, DTOs frozen per CONTRACT. |
| `createAssemblyJobForReelScript` / `assembleReelForScript` | **PASS** | Operator-first orchestrator (`create-assembly-job-for-reel-script.ts:104–230`); thin Server Action (`lib/assembly/actions/assemble-reel-for-script.ts`). |
| `resolveAssemblyInputs` | **PASS** | Latest completed primary job + ownership; faceless → `facelessNoPrimary` (`resolve-assembly-inputs.ts:65–71`). Remux probe deferred to worker (CONTRACT audio rules). |
| `applyAssemblyJobUpdate` sole writer | **PASS** | Transition table + terminal sticky (`apply-assembly-job-update.ts:18–121`). Grep guard: no UPDATE outside `lib/assembly/**`. |
| `GET /api/assembly-jobs/[jobId]` | **PASS** | `requireOperator("handler")` + scoped load → 404 foreign (`app/api/assembly-jobs/[jobId]/route.ts:26–58`). |
| `assemblyByReelScriptId` batch | **PASS** | `getReelScriptsForWeek` attaches map (`get-reel-scripts-for-week.ts:149–169`). |
| Media serve `assembled_reel` | **PASS** | Operator + `client_id` match branch (`app/api/media/assets/[assetId]/route.ts:169–182`). |
| Worker seam | **PASS** | `worker/assembly-jobs.ts`; `enqueueAssemblyJob` dev in-process / fly no-op (`lib/assembly/enqueue-assembly-job.ts`). `runAssemblyJob` full pipeline (`run-assembly-job.ts`). |
| Operator UI on `/operator/scripts` | **PASS** | `OperatorAssemblyPanel`, poll interval, preview `<video>`, reassemble confirm (`components/scripts/OperatorAssemblyPanel.tsx`, `ScriptsPageView.tsx:1549+`, `AssemblyReassembleConfirmDialog.tsx`). Copy wired in `app/(app)/operator/scripts/page.tsx:170+`. |

---

## SECURITY floors (added criteria)

| Floor | Status | Evidence |
|-------|--------|----------|
| Pointer-only trigger `{ reelScriptId }` | **PASS** | Zod strict request + `findForbiddenAssemblyKeys` (`create-assembly-job-for-reel-script.ts:114–121`). Test: `templateId` → `FORBIDDEN_FIELDS`. |
| `requireOperator("handler")` first on mutate/read | **PASS** | Orchestrator L104; GET route L26; media serve L172. Test: Cliente → `FORBIDDEN`. |
| Script tenancy `(reelScriptId, client_id)` → 404 | **PASS** | `loadReelScriptForVideoJob` in orchestrator (`create-assembly-job-for-reel-script.ts:126–131`). **Note:** no automated foreign-script test — QA manual. |
| Asset ownership before enqueue + worker | **PASS** | `verifyMediaAssetOwned` in `resolve-assembly-inputs.ts:83–111`; worker re-check L92–101. Test: cross-tenant → fail without spawn. |
| `storage_key` regex validation | **PASS** | DB CHECK in migration; `ASSEMBLED_REEL_STORAGE_KEY_REGEX` + insert guard (`insert-assembled-reel-media-asset.ts:26–31`). |
| Closed status write surface | **PASS** | Only `applyAssemblyJobUpdate` UPDATEs status columns; grep test passes. |
| IDOR poll GET / media serve | **PASS (code)** | Scoped queries / ownership checks. **Note:** no automated foreign-job or foreign-asset serve tests — QA manual. |
| Stale timeout worker-only | **PASS** | `markStaleAssemblyJobsFailed` called from worker batch (`poll-assembly-jobs.ts:22`). |
| DTO excludes paths/keys/ffmpeg | **PASS** | `operatorAssemblyJobDtoSchema` — no `storage_key` or argv fields (`lib/contracts/assembly-job.ts`). |

---

## Phase B deferrals & partial S3.M10 closure

Documented per CONTRACT § Phased BUILD acceptance and README binding VALIDATION note:

| Deferred item | Phase | Impact on narrative AC |
|---------------|-------|------------------------|
| Faceless multi-clip B-roll stitch | **B** | USER_STORIES sentence “combine voice, avatar/**B-roll**, template, and timing” is **partially** closed — Phase A = primary video + timing (+ voiceover remux edge). Faceless without primary → `ASSEMBLY_INPUTS_INCOMPLETE` (`resolve-assembly-inputs.ts:66–71`). |
| `broll_beats` / `cold_open_notes` / `editing_hints` FX | **B** | SPEC §3 S3.M10 editing_hints consumer not implemented. |
| `lib/assembly/ffmpeg/build-broll-concat-args.ts` stub | **B** | Not present — expected until US-8.5. |
| US-9.2 subtitles, logo, cover | **Out of scope** | Second FFmpeg pass — not US-9.1. |
| Weekly auto-assemble cron | **Out of scope** | integrations-engineer / ADR-0001. |
| Assembly spend ledger | **Out of scope** | US-7.3 Phase B. |
| Cliente assemble / preview serve | **Out of scope** | Operator-only V1; US-11.1 may widen later. |

These deferrals do **not** block Phase A PASS against the five USER_STORIES AC rows.

---

## Convention Compliance

| Rule | Status | Evidence |
|------|--------|----------|
| EN + ES user-facing strings | **PASS** | `messages/en.json` + `messages/es.json` → `scripts.assembly.*` (title, status, actions, errors, reassembleConfirm, failure.staleTimeout). |
| Server Components default; minimal `"use client"` | **PASS** | Page RSC; client boundaries: `OperatorAssemblyPanel`, `AssemblyReassembleConfirmDialog`. |
| PrimeReact-first UI | **PASS** | `Button`, `Message`, `Tag`, `Dialog` in assembly components. |
| Loading / empty / error / pending | **PASS** | Panel: empty state, in-flight poll, preview loading/error, assemble pending (`OperatorAssemblyPanel.tsx`). |
| No Supabase in Client Components | **PASS** | FE calls Server Action + Route Handler only. |
| Backend maps to concrete FE consumer | **PASS** | All assembly endpoints consumed by `/operator/scripts` expand row. |
| `neuramark_` DB prefix | **PASS** | `neuramark_assembled_reels`, indexes, trigger, RLS. |
| Dependencies US-8.4, US-6.1 | **PASS** | US-8.4 ✅ (primary video jobs + poller). US-6.1 ✅ CLOSED (sequencing only — captions not assembly input). |

---

## Gaps (what blocks PASS)

**None for Phase A USER_STORIES AC.** The following are **non-blocking notes** for QA and follow-up:

1. **SECURITY test matrix incomplete:** No automated tests for foreign `reelScriptId` → 404, foreign assembly job GET → 404, foreign `assembled_reel` media serve → 404 (CONTRACT § Security test matrix). Code paths exist; QA should verify manually.
2. **No live FFmpeg / Fly E2E:** CI uses mocked spawn only (CONTRACT explicit). QA must smoke-test on Fly worker (`ASSEMBLY_JOB_POLL_MODE=fly`) or dev `in_process`.
3. **Worker claim pattern:** `pollQueuedAssemblyJobsBatch` uses plain `SELECT … WHERE status = 'queued'` without `FOR UPDATE SKIP LOCKED` (CONTRACT prose). Mitigated by `applyAssemblyJobUpdate` terminal guards; concurrent double-run risk is low but QA may watch for duplicate completes under load.
4. **TASKS.md lag:** Worker/FFmpeg checklist items remain unchecked in `TASKS.md` despite implemented files — documentation drift only.
5. **Orchestrator idempotency:** No integration test for completed/in-flight return paths with mocked Supabase INSERT race — logic present in code.

---

## Scope Creep

**None observed.** No Cliente assemble routes, no spend ledger, no subtitle/logo pass, no browser-callable status mutation, no Vercel FFmpeg execution.

---

## Recommended Next Actions

| Action | Owner |
|--------|-------|
| Manual QA: Operator assemble → preview 9:16 MP4 on Fly or dev in-process | **qa-engineer** |
| Manual QA: IDOR 404 on foreign job id and foreign assembled asset serve | **qa-engineer** |
| Optional: add route-level tests for foreign script/job/asset 404 | **nextjs-backend** |
| Phase B: B-roll concat + `build-broll-concat-args.ts` when US-8.5 lands | **media-pipeline-engineer** |
| Update `TASKS.md` worker checkboxes to match shipped code | **product-owner** or implementer |
| PO check-off USER_STORIES § US-9.1 AC after QA APPROVE | **product-owner** |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-08-30 | Initial VALIDATION — Phase A PASS WITH NOTES; 23/23 assembly tests pass |
