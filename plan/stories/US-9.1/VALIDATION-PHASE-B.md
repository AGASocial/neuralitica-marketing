# Validation Report — US-9.1 Phase B (Faceless B-roll stitch)

**Story:** US-9.1 — Assemble final 9:16 Reel (Phase B / sprint `US-9.1-B`)  
**Branch:** `feature/US-9.1-phase-b-broll-stitch`  
**Build refs:** media/worker `c3a9c19` · FE enable `80652c2` · canAssemble fix `1106420` · CONTRACT Phase B `de22717` (FE Reviewed approved)  
**Validator:** requirements-validator  
**Date:** 2026-08-31  
**Scope:** Faceless B-roll stitch + zero-broll degrade + Assemble enablement; re-validate five USER_STORIES § US-9.1 AC on stitch path. No new USER_STORIES checkboxes.  
**Re-check:** After FAIL on B12 (first VALIDATION `abad4a9`); re-validate post-fix `1106420`.

### Verdict: PASS WITH NOTES

BE/worker stitch path, fingerprint, degrade, SEC floors, unit tests, and **B12 first-time faceless Assemble enablement** meet CONTRACT Phase B. Prior gap closed: week-batch emits null-job readiness companion with server `canAssemble`; panel prefers `job?.canAssemble === true`. Notes: TASKS.md BE/Worker Phase B boxes still unchecked (doc lag); live FFmpeg / Operator E2E out of scope.

---

## Test execution

```bash
npx tsx --test \
  lib/assembly/resolve-assembly-inputs.phase-b.test.ts \
  lib/assembly/run-assembly-job.phase-b.test.ts \
  lib/assembly/ffmpeg/build-broll-concat-args.test.ts \
  lib/assembly/parse-cold-open-trim-sec.test.ts \
  lib/assembly/assembly-readiness.phase-b.test.ts
```

| Metric | Result |
|--------|--------|
| Suites (Phase B focused) | 5 (+ readiness) |
| Tests | **24 pass / 0 fail** |
| Includes B12 | `assembly-readiness.phase-b.test.ts` — 3/3 |

**Also run (supporting SEC / Phase A floors):**

```bash
npx tsx --test lib/assembly/assembly-jobs.test.ts lib/assembly/run-assembly-job.test.ts
```

| Metric | Result |
|--------|--------|
| Tests | **19 pass / 0 fail** |

**Combined (all above in one run):** **43 pass / 0 fail** (~338 ms)

**Coverage highlights:** concat golden argv (1/3/8 clips, cold-open numeric only); `parseColdOpenTrimSec` reject metacharacters; resolve order/`created_at ASC`/cap 8; talking-head ignores broll; zero→degrade / `facelessWaitingForClips`; missing VO → `facelessMissingVoiceover`; ownership fail-closed; worker uses persisted `broll_asset_ids`; cross-tenant no spawn; `shell: false`; five-part fingerprint; forbidden Phase B keys; no `fetch(` under `lib/assembly/**`; **null-job companion `canAssemble: true` for faceless+broll+VO without assembly row**.

**Not run (explicit out of scope):** live FFmpeg on Fly; Operator E2E Wan → Assemble → preview.

**CONTRACT test-file note:** `create-assembly-job-for-reel-script.phase-b.test.ts` not present as a dedicated file; fingerprint + forbidden + Cliente 403 covered in `assembly-jobs.test.ts` (acceptable coverage, not a FAIL).

---

## Acceptance Criteria

### USER_STORIES § US-9.1 (re-validated on stitch path)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Output aspect ratio 9:16 | **PASS** | `buildBrollConcatArgs` filter `scale=1080:1920:…,crop=1080:1920` (`lib/assembly/ffmpeg/build-broll-concat-args.ts`). Shared `insertAssembledReelMediaAsset` metadata 1080×1920 (Phase A). Golden tests in `build-broll-concat-args.test.ts`. |
| Duration within script target ± configurable tolerance | **PASS** | Trim via `-t` / pad via `tpad`+`apad` in concat builder. Post-encode `abs(actual - target) > toleranceSec` → fail via `finishFfmpegUpload` in `run-assembly-job.ts`. Default tolerance unchanged in contracts. |
| Pipeline idempotent per script version | **PASS** | Five-part fingerprint `primary\|voiceover\|template\|ordered_broll\|path_tag` (`compute-input-fingerprint.ts`). Orchestrator idempotent return on completed/in-flight (`create-assembly-job-for-reel-script.ts`). Worker corruption guard recomputes fingerprint from persisted FKs (`run-assembly-job.ts`). |
| [SEC] FFmpeg args arrays; owned assets; no injectable text | **PASS** | `spawn(..., { shell: false })` (`run-ffmpeg.ts`). Pure `buildBrollConcatArgs` — paths + numerics only; no beats/notes. Per-clip ownership before Storage (`run-assembly-job.ts`). Tests: malicious notes absent from argv; cross-tenant no spawn. |
| [SEC] No arbitrary URL fetch at assembly (SSRF) | **PASS** | Downloads via Storage SDK + `assertSafeKey`. Grep guard no `fetch(` in `lib/assembly/**` (`assembly-jobs.test.ts`). Trigger still `{ reelScriptId }` + extended forbidden keys. |

**AC score (USER_STORIES rows on stitch path): 5 / 5 PASS**

### Phase B deltas (PHASE-B B1–B14 / CONTRACT / SECURITY)

| Delta | Status | Evidence |
|-------|--------|----------|
| B2 Faceless-only stitch; talking-head ignores broll | **PASS** | `resolve-assembly-inputs.ts` always `pathTag=primary`, `brollAssetIds=[]` when `modalidad !== "faceless"`. Test: talking-head ignores broll. |
| B3 Order `created_at ASC`, cap 8 | **PASS** | `resolveCompletedBrollAssetIds` `.order("created_at", { ascending: true }).limit(ASSEMBLY_BROLL_CLIP_MAX)`; `ASSEMBLY_BROLL_CLIP_MAX = 8`. |
| B4 Never block on failed/queued; zero → degrade / incomplete | **PASS** | Query `status=completed` only. Zero broll + primary → `pathTag=primary`; else `facelessWaitingForClips`. |
| B5 Voiceover required on stitch | **PASS** | Missing VO → `facelessMissingVoiceover`; mux always in concat builder (`-map 1:a:0`). |
| B6 FFmpeg spawn args-array; no script text in argv | **PASS** | Concat demuxer + numeric `-ss`; `parseColdOpenTrimSec` digits-only. |
| B7 Ownership every broll + VO | **PASS** | Resolver `verifyMediaAssetOwned` per clip; worker re-check. |
| B8 Max 8 clips | **PASS** | Cap in resolve + builder throw if not 1..8; DDL cardinality 1..8. |
| B9 Fingerprint + `path_tag` | **PASS** | Exact `"primary"` / `"broll_stitch"`; five-part formula tests. |
| B10 Duration / `reel_v1_basic` 1080×1920 | **PASS** | Same codecs/filter constants as Phase A in concat builder. |
| B11 Cold-open numeric trim only | **PASS** | `parseColdOpenTrimSec`; unparsable → null; builder receives number only. |
| **B12 FE Assemble enablement for faceless** | **PASS** | Fix `1106420`: (1) Zod nullable `jobId`/`status`/`createdAt`/`updatedAt` on batch DTO (`lib/contracts/assembly-job.ts:169–196`); poll DTO remains non-null job (`:202–211`). (2) `mapNullJobAssemblyReadinessDto` calls `areAssemblyInputsComplete` without INSERT (`map-operator-assembly-job-dto.ts:35–75`). (3) `getAssemblyJobsForReelScripts` fills null map entries with companion (`get-assembly-jobs-for-reel-scripts.ts:136–155`); week load via `get-reel-scripts-for-week.ts:151–155`. (4) Panel: `canAssembleFromServer = job?.canAssemble === true` (`OperatorAssemblyPanel.tsx:471–479`); companion treated as empty UI (`isReadinessCompanion`, `:357–359`, `:624–628`); poll only when persisted job (`isPersistedAssemblyJob`, `:404–408`); poll merge preserves `canAssemble` (`:324–325`). (5) Regression: `assembly-readiness.phase-b.test.ts` — faceless+broll+VO → `canAssemble true`; without broll → false; batch no-row → companion true. |
| B13 Trigger / SEC floors unchanged | **PASS** | `{ reelScriptId }` + `requireOperator`; extended FORBIDDEN keys; Storage-only. |
| DDL Option A lineage | **PASS** | Migration `supabase/migrations/20260831090000_neuramark_assembled_reels_phase_b_broll.sql` matches CONTRACT. |
| Worker replays persisted ids only | **PASS** | `runBrollStitchPath` uses `activeJob.brollAssetIds`; phase-b test asserts persisted ids. |
| Orchestrator INSERT deltas | **PASS** | Persists `broll_asset_ids` + `assembly_path_tag`. |
| i18n EN/ES incomplete keys | **PASS** | `messages/en.json` + `messages/es.json` `facelessWaitingForClips` / `facelessMissingVoiceover`. |

**Phase B delta score: 16 / 16 PASS** (B12 closed by `1106420`)

### SECURITY Phase B (10 conditions) — code evidence

| # | Status | Evidence |
|---|--------|----------|
| 1 Anti–shell-injection | **PASS** | Concat builder + `shell: false` spawn tests |
| 2 Anti–filtergraph-text-injection | **PASS** | Numeric cold-open; no beats/notes in argv tests |
| 3 Anti–multi-clip-IDOR | **PASS** | Resolver + worker ownership; cross-tenant test |
| 4 Anti–client path/URL authority | **PASS** | Extended FORBIDDEN keys + tests |
| 5 Anti–SSRF-at-stitch | **PASS** | Storage SDK; no `fetch(` grep |
| 6 Anti–cold-open string passthrough | **PASS** | `parseColdOpenTrimSec` |
| 7 Anti–degrade-secret-leak | **PASS** | Sanitized messageKeys only |
| 8 Anti–Cliente-trigger | **PASS** | Cliente → FORBIDDEN test (Phase A retained) |
| 9 Anti–modality-confused-deputy | **PASS** | Talking-head ignores broll test |
| 10 Anti–fingerprint-forgery | **PASS** | Server-only fingerprint + path_tag |

**Note:** SECURITY automated matrix item “degrade fixtures contain no key/CDN/argv” is covered indirectly by messageKey assertions; no dedicated substring fixture test — QA may spot-check.

---

## Convention Compliance

| Rule | Status | Notes |
|------|--------|-------|
| EN + ES user-facing strings | **PASS** | New faceless incomplete keys present |
| Server Components / thin `"use client"` | **PASS** | Panel remains client for interactivity; resolve/orchestrator/readiness server-only |
| PrimeReact-first | **PASS** | Existing Button/Message/video preview reused — no new stitch UI |
| Loading / empty / error / pending | **PASS (panel)** | Companion shows empty copy; incomplete via messageKey; poll only on persisted jobs |
| `getCurrentUser` / Operator gate | **PASS** | Unchanged orchestrator `requireOperator` |
| Endpoints map to FE consumer | **PASS** | Same `/operator/scripts` panel; no speculative API |
| `neuramark_` DDL prefix | **PASS** | Migration alters `neuramark_assembled_reels` only |
| No scope creep into US-9.2 / talking-head overlays / Wan | **PASS** | Faceless-only stitch; residual rewind FX documented out |

---

## Gaps (what blocks PASS)

None blocking. Prior B12 FAIL is closed.

### Notes (non-blocking)

1. **TASKS.md Phase B BE/Worker checkboxes** still unchecked despite `c3a9c19` / `1106420` — doc lag for product-owner hygiene (B12 FE/BE boxes were ticked in fix commit).  
2. **Legacy** `job === null && hasPrimaryVideo` Assemble fallback remains (`OperatorAssemblyPanel.tsx:477–478`) for paths that still omit companion; week load now always emits companion via `getAssemblyJobsForReelScripts`, so faceless stitch no longer depends on it (CONTRACT constraint #3 allows talking-head convenience).  
3. Live FFmpeg / Operator E2E deferred to QA / deploy smoke.

---

## Scope Creep

None material. Optional BUILD addition `sourceDurationSec` on `buildBrollConcatArgs` (not in CONTRACT example signature) is a justified trim/pad helper — not product scope creep. Temp workspace uses `mkdtemp(…neuramark-assembly-${jobId}-)` rather than literal `/tmp/neuramark-assembly/{jobId}/`; fixed basenames still honor SEC path allowlist intent (same Phase A pattern).

Nullable batch `jobId`/`status` + separate poll schema match CONTRACT fixture “Batch readiness (faceless ready)” and FE Reviewed constraint #2 option (b).

Residual S3.M10 (rewind FX, weekly auto-assemble) correctly **not** implemented — document-only.

---

## Recommended Next Actions

| Action | Agent |
|--------|--------|
| Tick remaining TASKS.md Phase B BE/Worker boxes; close PHASE-B gates VALIDATION | **product-owner** |
| QA.md Phase B (security matrix + Operator smoke if env available) | **qa-engineer** |
| Do **not** check additional USER_STORIES.md AC boxes (Phase B re-validates the same five; already `[x]` from Phase A) | — |

---

## Score summary (re-check after `1106420`)

| Bucket | Score |
|--------|-------|
| USER_STORIES § US-9.1 AC | **5 / 5** |
| Phase B deltas (incl. B12) | **16 / 16** |
| SECURITY Phase B | **10 / 10** |
| Tests (Phase B focused) | **24 pass / 0 fail** |
| Tests (combined w/ floors) | **43 pass / 0 fail** |
| **Verdict** | **PASS WITH NOTES** |
