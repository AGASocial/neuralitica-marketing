# Validation Report — US-9.1 Phase B (Faceless B-roll stitch)

**Story:** US-9.1 — Assemble final 9:16 Reel (Phase B / sprint `US-9.1-B`)  
**Branch:** `feature/US-9.1-phase-b-broll-stitch`  
**Build refs:** media/worker `c3a9c19` · FE `80652c2` · CONTRACT Phase B `de22717` (FE Reviewed approved)  
**Validator:** requirements-validator  
**Date:** 2026-08-31  
**Scope:** Faceless B-roll stitch + zero-broll degrade + Assemble enablement; re-validate five USER_STORIES § US-9.1 AC on stitch path. No new USER_STORIES checkboxes.

### Verdict: FAIL

BE/worker stitch path, fingerprint, degrade, SEC floors, and unit tests meet CONTRACT Phase B. **FE Assemble enablement for first-time faceless stitch (no prior assembly job, no primary) is incomplete** — `getAssemblyJobsForReelScripts` leaves `null` (no readiness companion), and the panel only falls back to primary when `job === null`. That blocks the Phase B Operator happy path (B12 / CONTRACT § FE enablement).

---

## Test execution

```bash
npx tsx --test \
  lib/assembly/resolve-assembly-inputs.phase-b.test.ts \
  lib/assembly/run-assembly-job.phase-b.test.ts \
  lib/assembly/ffmpeg/build-broll-concat-args.test.ts \
  lib/assembly/parse-cold-open-trim-sec.test.ts
```

| Metric | Result |
|--------|--------|
| Suites | 5 |
| Tests | **21 pass / 0 fail** |
| Duration | ~312 ms |

**Also run (supporting SEC / Phase A floors):**

```bash
npx tsx --test lib/assembly/assembly-jobs.test.ts lib/assembly/run-assembly-job.test.ts
```

| Metric | Result |
|--------|--------|
| Tests | **19 pass / 0 fail** |

**Coverage highlights:** concat golden argv (1/3/8 clips, cold-open numeric only); `parseColdOpenTrimSec` reject metacharacters; resolve order/`created_at ASC`/cap 8; talking-head ignores broll; zero→degrade / `facelessWaitingForClips`; missing VO → `facelessMissingVoiceover`; ownership fail-closed; worker uses persisted `broll_asset_ids`; cross-tenant no spawn; `shell: false`; five-part fingerprint; forbidden Phase B keys; no `fetch(` under `lib/assembly/**`.

**Not run (explicit out of scope):** live FFmpeg on Fly; Operator E2E Wan → Assemble → preview.

**CONTRACT test-file note:** `create-assembly-job-for-reel-script.phase-b.test.ts` not present as a dedicated file; fingerprint + forbidden + Cliente 403 covered in `assembly-jobs.test.ts` (acceptable coverage, not a FAIL).

---

## Acceptance Criteria

### USER_STORIES § US-9.1 (re-validated on stitch path)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Output aspect ratio 9:16 | **PASS** | `buildBrollConcatArgs` filter `scale=1080:1920:…,crop=1080:1920` (`lib/assembly/ffmpeg/build-broll-concat-args.ts:8–9, 62–83`). Shared `insertAssembledReelMediaAsset` metadata 1080×1920 (Phase A). Golden tests in `build-broll-concat-args.test.ts`. |
| Duration within script target ± configurable tolerance | **PASS** | Trim via `-t` / pad via `tpad`+`apad` in concat builder (`build-broll-concat-args.ts:54–111`). Post-encode `abs(actual - target) > toleranceSec` → fail (`run-assembly-job.ts:392–398` via `finishFfmpegUpload`). Default tolerance unchanged in contracts. |
| Pipeline idempotent per script version | **PASS** | Five-part fingerprint `primary\|voiceover\|template\|ordered_broll\|path_tag` (`compute-input-fingerprint.ts:13–30`). Orchestrator idempotent return on completed/in-flight (`create-assembly-job-for-reel-script.ts:137–173`). Worker corruption guard recomputes fingerprint from persisted FKs (`run-assembly-job.ts:119–133`). |
| [SEC] FFmpeg args arrays; owned assets; no injectable text | **PASS** | `spawn(..., { shell: false })` (`run-ffmpeg.ts:26`). Pure `buildBrollConcatArgs` — paths + numerics only; no beats/notes (`build-broll-concat-args.ts`). Per-clip ownership before Storage (`run-assembly-job.ts:263–270`). Tests: malicious notes absent from argv; cross-tenant no spawn. |
| [SEC] No arbitrary URL fetch at assembly (SSRF) | **PASS** | Downloads via Storage SDK + `assertSafeKey` (`run-assembly-job.ts:284–315`). Grep guard no `fetch(` in `lib/assembly/**` (`assembly-jobs.test.ts`). Trigger still `{ reelScriptId }` + extended forbidden keys (`assembly-job.ts` FORBIDDEN list; `assembly-jobs.test.ts` Phase B keys). |

**AC score (USER_STORIES rows on stitch path): 5 / 5 PASS**

### Phase B deltas (PHASE-B B1–B14 / CONTRACT / SECURITY)

| Delta | Status | Evidence |
|-------|--------|----------|
| B2 Faceless-only stitch; talking-head ignores broll | **PASS** | `resolve-assembly-inputs.ts:159–187` always `pathTag=primary`, `brollAssetIds=[]` when `modalidad !== "faceless"`. Test: talking-head ignores broll. |
| B3 Order `created_at ASC`, cap 8 | **PASS** | `resolveCompletedBrollAssetIds` `.order("created_at", { ascending: true }).limit(ASSEMBLY_BROLL_CLIP_MAX)` (`resolve-assembly-inputs.ts:88–98`); `ASSEMBLY_BROLL_CLIP_MAX = 8`. |
| B4 Never block on failed/queued; zero → degrade / incomplete | **PASS** | Query `status=completed` only. Zero broll + primary → `pathTag=primary` (`:224–250`); else `facelessWaitingForClips` (`:230–234`). |
| B5 Voiceover required on stitch | **PASS** | Missing VO → `facelessMissingVoiceover` (`:200–205`); mux always in concat builder (`-map 1:a:0`). |
| B6 FFmpeg spawn args-array; no script text in argv | **PASS** | Concat demuxer + numeric `-ss` (`build-broll-concat-args.ts:67–114`); `parseColdOpenTrimSec` digits-only (`parse-cold-open-trim-sec.ts:6–38`). |
| B7 Ownership every broll + VO | **PASS** | Resolver `verifyMediaAssetOwned` per clip (`:107–113`); worker re-check (`run-assembly-job.ts:255–270`). |
| B8 Max 8 clips | **PASS** | Cap in resolve + builder throw if not 1..8; DDL cardinality 1..8 (`20260831090000_…phase_b_broll.sql:26–28`). |
| B9 Fingerprint + `path_tag` | **PASS** | Exact `"primary"` / `"broll_stitch"` (`assembly-job.ts:13–14`); five-part formula tests in `assembly-jobs.test.ts`. |
| B10 Duration / `reel_v1_basic` 1080×1920 | **PASS** | Same codecs/filter constants as Phase A in concat builder. |
| B11 Cold-open numeric trim only | **PASS** | `parseColdOpenTrimSec`; unparsable → null; builder receives number only. |
| **B12 FE Assemble enablement for faceless** | **FAIL** | See Gaps. Panel uses `job?.canAssemble` or `job === null && hasPrimaryVideo` (`OperatorAssemblyPanel.tsx:456–464`). Batch helper returns `null` for scripts with no row (`get-assembly-jobs-for-reel-scripts.ts:62–65, 95–110`) — **no null-job readiness companion** with `canAssemble: true` for faceless+broll+VO. First-time stitch-only scripts cannot show Assemble. FE commit only dropped `disabled={…\|\|!hasPrimaryVideo}` and preserved poll `canAssemble`; comment admits companion “until … lands”. |
| B13 Trigger / SEC floors unchanged | **PASS** | `{ reelScriptId }` + `requireOperator`; extended FORBIDDEN keys; Storage-only. |
| DDL Option A lineage | **PASS** | Migration `supabase/migrations/20260831090000_neuramark_assembled_reels_phase_b_broll.sql` matches CONTRACT (nullable primary, `broll_asset_ids`, `assembly_path_tag`, path_inputs CHECK). |
| Worker replays persisted ids only | **PASS** | `runBrollStitchPath` uses `activeJob.brollAssetIds` (`run-assembly-job.ts:249–336`); phase-b test asserts persisted ids. |
| Orchestrator INSERT deltas | **PASS** | Persists `broll_asset_ids` + `assembly_path_tag` (`create-assembly-job-for-reel-script.ts:187–191`). |
| i18n EN/ES incomplete keys | **PASS** | `messages/en.json` + `messages/es.json` `facelessWaitingForClips` / `facelessMissingVoiceover`; panel maps messageKeys (`OperatorAssemblyPanel.tsx:235–242`). |

**Phase B delta score: 15 / 16 PASS** (B12 FAIL)

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
| Server Components / thin `"use client"` | **PASS** | Panel remains client for interactivity; resolve/orchestrator server-only |
| PrimeReact-first | **PASS** | Existing Button/Message/video preview reused — no new stitch UI |
| Loading / empty / error / pending | **PASS (panel)** | Existing assembly states; incomplete via messageKey |
| `getCurrentUser` / Operator gate | **PASS** | Unchanged orchestrator `requireOperator` |
| Endpoints map to FE consumer | **PASS** | Same `/operator/scripts` panel; no speculative API |
| `neuramark_` DDL prefix | **PASS** | Migration alters `neuramark_assembled_reels` only |
| No scope creep into US-9.2 / talking-head overlays / Wan | **PASS** | Faceless-only stitch; residual rewind FX documented out |

---

## Gaps (what blocks PASS)

1. **FE first-time faceless Assemble (B12 / CONTRACT FE enablement / fixture null-job `canAssemble: true`)**  
   - `getAssemblyJobsForReelScripts` never emits a readiness-only DTO when there is no assembly row.  
   - `OperatorAssemblyPanel` therefore cannot enable Assemble for faceless + completed broll + voiceover unless a prior job exists **or** a primary video exists (degrade fallback).  
   - Evidence: `get-assembly-jobs-for-reel-scripts.ts:62–65`, `OperatorAssemblyPanel.tsx:456–464`, FE commit `80652c2` comment “until companion readiness DTO lands”.  
   - **Owner to fix:** nextjs-backend (null-job / companion readiness on week load) **and/or** nextjs-frontend (consume companion; do not invent broll ids client-side).

2. **TASKS.md Phase B BE/Worker checkboxes** still unchecked despite `c3a9c19` — doc lag for product-owner hygiene (does not alone block PASS once FE gap fixed).

---

## Scope Creep

None material. Optional BUILD addition `sourceDurationSec` on `buildBrollConcatArgs` (not in CONTRACT example signature) is a justified trim/pad helper — not product scope creep. Temp workspace uses `mkdtemp(…neuramark-assembly-${jobId}-)` rather than literal `/tmp/neuramark-assembly/{jobId}/`; fixed basenames (`broll-N.mp4`, `concat.txt`) still honor SEC path allowlist intent (same Phase A pattern).

Residual S3.M10 (rewind FX, weekly auto-assemble) correctly **not** implemented — document-only.

---

## Recommended Next Actions

| Action | Agent |
|--------|--------|
| Emit null-job / readiness companion with server `canAssemble` for faceless stitch (and degrade) on week load — mirror CONTRACT fixture | **nextjs-backend** |
| Wire panel to companion only; keep poll preserve of `canAssemble`; remove reliance on primary-only for faceless stitch | **nextjs-frontend** |
| Add regression test: faceless + ≥1 broll + VO + no assembly row → Assemble visible / `canAssemble true` | **nextjs-backend** or **nextjs-frontend** |
| Re-run requirements-validator on Phase B after FE/BE readiness fix | **requirements-validator** |
| Then QA.md Phase B | **qa-engineer** |
| Tick TASKS.md Phase B BE/Worker boxes after re-PASS | **product-owner** |

Do **not** check additional USER_STORIES.md AC boxes (Phase B re-validates the same five; already `[x]` from Phase A).
