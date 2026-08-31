# Validation Report — US-9.2 Phase B

**Story:** US-9.2 — VO-proportional subtitle timing + Operator `coverFrameSec`  
**Sprint label:** `US-9.2-B`  
**Branch:** `feature/US-9.2-phase-b-subtitle-cover`  
**Build refs:** BE `95419c1` · FE `8f365bf`  
**Validator:** requirements-validator  
**Date:** 2026-08-31  
**Sources:** `PHASE-B.md` (B1–B15) · `CONTRACT.md` § Phase B · `SECURITY.md` Phase B (8 conditions) · `TASKS.md` Phase B checklist  
**Scope:** Phase B deferred polish only — **no** new USER_STORIES AC checkboxes; Phase A five AC remain **[x]**.

### Verdict: PASS WITH NOTES

Phase B closes both Phase A deferrals: **VO-proportional beat timing** from script `voiceover_text` word partitions (script-word proxy — **not** TTS/ASR lip-sync) and **Operator per-reel `coverFrameSec`** via PrimeReact `InputNumber` → Zod `0–45` → snapshot → duration clamp. **[SEC]** subtitle sanitization and cover bounds hold on the new path. Notes are non-blocking: `TASKS.md` BE/worker checkboxes still unchecked (docs lag); no live FFmpeg / Operator E2E in CI.

---

## Scores

| Axis | Score | Notes |
|------|-------|-------|
| Phase B deferred closure | **2 / 2** | VO timing + Operator cover override both evidenced |
| CONTRACT Phase B surfaces | **PASS** | Timing helper, fingerprint, schema, clamp, forbidden-keys, FE wire |
| SECURITY Phase B (8 conditions) | **8 / 8** | Cover numeric-only; VO not in ASS/argv; sanitizer; forbidden amend; spawn; no SSRF paths; fingerprint; auto-chain defaults |
| USER_STORIES Phase A AC (re-assert) | **5 / 5** | Unchanged — do not uncheck |
| Localization (cover i18n) | **PASS** | EN + ES `scripts.branding.coverFrame*` |
| Automated tests | **44 / 44** | See § Test execution |

---

## Test execution

```bash
npx tsx --test \
  lib/assembly/compute-vo-proportional-beat-timings.test.ts \
  lib/branding/build-ass-from-beats.test.ts \
  lib/branding/extract-cover-frame-args.test.ts \
  lib/assembly/branding-jobs.test.ts \
  lib/branding/run-branding-job.test.ts \
  lib/branding/sanitize-subtitle-beats.test.ts
```

| Metric | Result |
|--------|--------|
| Suites | 17 |
| Tests | **44 pass / 0 fail** |
| Duration | ~357 ms |

**Coverage highlights:** VO partition math + remainder spread + equal-split fallback; `voiceoverTimingHash` stability; fingerprint invalidates on VO hash change; ASS Dialogue uses VO-proportional timestamps with VO fixture **absent** from `assContent`; cover seek clamp + numeric `-ss`; `coverFrameSec` allowed / VO/timing/path keys forbidden; Cliente `FORBIDDEN`; out-of-range / string cover → `VALIDATION_ERROR`; sanitizer `{\fs999}` fail-closed; mocked `runBrandingJob` + spawn `shell: false`.

**Not run (explicit out of scope):** live FFmpeg on Fly; manual Operator E2E (Apply with cover override → branded cover JPEG).

---

## Phase B deferred-item mapping

| Deferred item (Phase A) | Status | Evidence |
|-------------------------|--------|----------|
| VO-synced subtitle timing | **PASS (proxy)** | `computeVoProportionalBeatTimings` (`lib/assembly/compute-vo-proportional-beat-timings.ts:39–71`); worker passes timings into `buildAssFromBeats` (`lib/branding/run-branding-job.ts:196–206`); equal fallback when VO empty (`compute-vo-proportional-beat-timings.ts:52–53`). **Label:** VO-proportional from `voiceover_text` — **not** A/V word sync. |
| Operator per-reel `coverFrameSec` | **PASS** | FE `InputNumber` min 0 / max 45 / step 0.1 (`OperatorAssemblyPanel.tsx:887–896`); Apply/Re-brand pass number (`:577–581`, `:930–936`); Zod optional `0–45` (`lib/contracts/branding-job.ts:84`); merge only on `operator_manual` (`create-branding-job-for-assembly.ts:156–159`); clamp seek (`extract-cover-frame-args.ts:14–19`, `run-branding-job.ts:227–236`). |
| `[SEC]` subtitle sanitize on VO-timing path | **PASS** | Same `sanitizeSubtitleBeats` before ASS; Dialogue text = sanitized on-screen only (`build-ass-from-beats.ts:61–63`); VO fixture absent from ASS (`build-ass-from-beats.test.ts:62–63`); sanitizer fixtures still pass (`sanitize-subtitle-beats.test.ts`). |

---

## Acceptance Criteria

Phase B adds **no** new USER_STORIES checkboxes. Canonical Phase A AC re-asserted; Phase B proof is the deferred-item table above + SECURITY conditions below.

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Subtitles readable on mobile safe zone (Phase A) | **PASS (code)** | Typography constants unchanged; Phase B only changes Dialogue timestamps (`build-ass-from-beats.ts:70–82`). |
| Logo optional; default template if missing (Phase A) | **PASS** | Untouched by Phase B — skip overlay path retained. |
| Cover image exported for manual IG upload (Phase A) | **PASS** | Cover extract still runs; seek now from snapshot + clamp (`run-branding-job.ts:225–236`). |
| [SEC] Logo upload shared stack (Phase A) | **PASS** | Out of Phase B delta — unchanged. |
| [SEC] Subtitle text sanitized before renderer | **PASS** | Re-verified on VO-timing path — see deferred-item row above. |

---

## CONTRACT Phase B surface verification

| Surface | Status | Evidence |
|---------|--------|----------|
| `computeVoProportionalBeatTimings` + tokenizer | **PASS** | Contiguous partition, leading remainder, last end forced (`compute-vo-proportional-beat-timings.ts:56–69`); unit tests match CONTRACT fixture shape. |
| `voiceoverTimingHash` + fingerprint | **PASS** | Hash = sha256(tokens joined `\n`) (`:78–80`); fingerprint appends hash (`compute-branding-fingerprint.ts:19–27`); VO change → new FP (`branding-jobs.test.ts`). |
| `brandingConfigSnapshotSchema.voiceoverTimingHash` | **PASS** | `lib/contracts/branding-job.ts:38–43`. |
| Operator DTO strips hashes | **PASS** | DTO exposes only `{ subtitlesEnabled, logoEnabled, coverFrameSec }` (`map-operator-assembly-job-dto.ts:24–28`). |
| `buildAssFromBeats` explicit timings | **PASS** | Optional `beatTimings`; length mismatch → equal split (`build-ass-from-beats.ts:52–59`). |
| `applyBrandingForAssemblyRequestSchema` + cover | **PASS** | Optional finite `0–45` (`branding-job.ts:78–86`); inner maps validation to `scripts.branding.coverFrame.invalid` (`create-branding-job-for-assembly.ts:267–284`). |
| Forbidden-keys amend | **PASS** | `coverFrameSec` not in list; VO/timing/path/hash keys present (`branding-job.ts:189–230`); tests confirm (`branding-jobs.test.ts:135–155`). |
| VO load with script | **PASS** | `loadScriptBrandingContext` selects `voiceover_text` (`load-branding-job.ts:71–99`). |
| Auto-chain ignore request cover | **PASS** | Cover override only when `source === "operator_manual"` (`create-branding-job-for-assembly.ts:156–159`). |
| Cover seek clamp | **PASS** | `clampCoverSeekSec` + measured duration preference (`run-branding-job.ts:225–230`). |
| FE Operator InputNumber + i18n | **PASS** | Panel + Apply/Re-brand + EN/ES (`OperatorAssemblyPanel.tsx`, `messages/en.json:1560–1563`, `messages/es.json:1560–1563`). |
| FE Reviewed line | **PASS** | `CONTRACT.md` header + § Phase B Reviewed by FE: yes — 2026-08-31. |
| DB | **PASS** | No new tables/columns — reuses `assembly_config` / `branding_config` JSON. |

---

## SECURITY Phase B (8 conditions)

| # | Condition | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Anti–cover-injection: Zod number `0–45`; invalid → `VALIDATION_ERROR`; argv numeric + clamp | **PASS** | Schema + validation tests (`branding-jobs.test.ts:213–229`); clamp (`extract-cover-frame-args.ts`). |
| 2 | Anti–VO-in-ASS/argv: VO counts only | **PASS** | Worker uses VO for timings only (`run-branding-job.ts:196–206`); ASS Dialogue = on-screen beats; test asserts VO absent (`build-ass-from-beats.test.ts:62–63`). |
| 3 | Anti–subtitle-injection: same sanitizer | **PASS** | Orchestrator still sanitizes before snapshot (`create-branding-job-for-assembly.ts:161–171`); sanitizer suite passes. |
| 4 | Anti–client-authority: cover number only; forbid VO/timings/paths/hashes | **PASS** | Forbidden list + tests. |
| 5 | Anti–shell-injection: spawn args-array, `shell: false` | **PASS** | `run-branding-job.test.ts` spawn contract. |
| 6 | Anti–client-paths/SSRF: server temp + Storage SDK | **PASS** | Unchanged Phase A path; no new fetch. |
| 7 | Anti–timing/fingerprint-forgery: server helper + hash in fingerprint | **PASS** | Server hash + fingerprint; client hash forbidden. |
| 8 | Anti–auto-chain cover smuggle: profile defaults only | **PASS** | Manual-only cover override (`create-branding-job-for-assembly.ts:156–159`). |

---

## Convention Compliance

| Rule | Status | Evidence |
|------|--------|----------|
| EN + ES user-facing strings | **PASS** | `scripts.branding.coverFrame.{label,help,invalid}` + error `coverFrameInvalid` |
| No lip-sync / word-aligned-audio copy | **PASS** | Copy speaks “cover frame (seconds)” / seek time only |
| PrimeReact-first | **PASS** | `InputNumber` from `primereact/inputnumber` |
| `"use client"` justified | **PASS** | Existing Operator panel client boundary; cover control added there |
| Server/client boundary | **PASS** | FE calls Server Action only; no Supabase in client |
| Loading / busy states | **PASS** | InputNumber disabled when `panelBusy \|\| brandingInFlight` |
| No Cliente Ficha cover UI | **PASS** | `ProfileBrandingSection` comment + no cover control |
| No thumbnail strip / second font | **PASS** | Not implemented (correctly out of scope) |
| Subtitle/logo toggles reused | **PASS** | Phase A checkboxes retained; cover added alongside |

---

## Gaps (what blocks PASS)

**None blocking.** Non-blocking notes:

1. **`TASKS.md` Phase B BE/worker boxes still `[ ]`** despite commits `95419c1` / `8f365bf` — docs hygiene for product-owner / implementers; implementation is present.
2. **No live FFmpeg / Operator E2E** — same Phase A residual; unit + mocked pipeline only.
3. **Terminology:** VALIDATION must not claim true A/V word sync — closed as **VO-proportional proxy** only.

---

## Scope Creep

**None observed.** No second font, thumbnail strip, Cliente cover UI, TTS/ASR timestamps, soft subtitle tracks, or new story ID.

---

## Recommended Next Actions

| Action | Agent |
|--------|-------|
| Tick Phase B BE/worker checklist boxes in `TASKS.md` to match BUILD | product-owner or implementers |
| QA Phase B (injection + cover bounds + timing label) | **qa-engineer** |
| After QA PASS: CLOSE Phase B in SPRINT-STATE / USER_STORIES note (keep Phase A AC checked) | **product-owner** |

---

## Summary for orchestrator

| Field | Value |
|-------|-------|
| **Verdict** | **PASS WITH NOTES** |
| **Deferred closed** | **2 / 2** |
| **SECURITY Phase B** | **8 / 8** |
| **Tests** | **44 pass / 0 fail** |
| **Next gate** | QA.md Phase B |

---

# Validation Report — US-9.2 Phase B-M1

**Story:** US-9.2 — Worker `voiceoverTimingHash` re-check  
**Sprint label:** `US-9.2-B-M1`  
**Branch:** `feature/US-9.2-b-m1-voiceover-timing-hash`  
**Build refs:** media `1b2a8e7` · BE `00df642`  
**Validator:** requirements-validator  
**Date:** 2026-08-31  
**Sources:** `PHASE-B-M1.md` (M1-1…M1-10) · `CONTRACT.md` § Phase B-M1 · `SECURITY.md` Phase B-M1 (4 conditions + 4 additive `[SEC]`)  
**Scope:** Lean integrity fast-follow only — **do not** add/uncheck USER_STORIES § US-9.2 AC (verified untouched).

### Verdict: PASS WITH NOTES

Worker re-checks live VO hash before `mkdtemp` / ASS / spawn; mismatch and malformed fail closed with sanitized keys and zero FFmpeg; legacy empty/missing skips; match proceeds. Closes QA-PHASE-B Medium #1 at the VALIDATION gate.

---

### Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Mismatch → `failed` + `BRANDING_FAILURE_VOICEOVER_TIMING_HASH` + **no spawn** | **PASS** | Guard `run-branding-job.ts:169–183`; fail key `52–53` = `scripts.branding.failure.voiceoverTimingHashMismatch`; test `run-branding-job.test.ts:206–262` (`ffmpegCalled === false`, reason matches export) |
| Match → proceeds past guard | **PASS** | Same file `265–331` — `ffmpegCalled === true`, `branding_status === completed`, no failed update |
| Legacy empty/missing → skip re-check | **PASS** | Raw field via `rawVoiceoverTimingHash` / `readRawVoiceoverTimingHash` (`branding-job-row.ts:77–97`, `167`); skip when absent/null/`""` (`run-branding-job.ts:184–192` else-branch only for non-empty malformed); test `334–396` completes with VO present and key absent |
| Malformed non-empty → `BRANDING_FAILURE_CONFIG`, no spawn | **PASS** | `run-branding-job.ts:184–191`; test `399–445` (`not-a-valid-64-hex-hash` → CONFIG, `ffmpegCalled === false`) |
| Guard placement: after subtitle-hash, before `mkdtemp`/ASS/spawn | **PASS** | Subtitle check `164–167` → VO guard `169–192` → `mkdtemp` `199–200` → proportional timings/ASS `226–238` |
| Reuse `computeVoiceoverTimingHash(voiceoverText)` | **PASS** | Import + call `run-branding-job.ts:11–14`, `176` — no forked formula |
| Enforce only on 64 lowercase hex (`/^[0-9a-f]{64}$/`) | **PASS** | `VOICEOVER_TIMING_HASH_HEX_RE` `branding-job-row.ts:68`; soft-default must not false-enforce — guard uses **raw** field (`171`) |
| Fail constant exact string (CONTRACT) | **PASS** | Export `00df642` / `run-branding-job.ts:52–53`; asserted in mismatch test |
| VO still not in ASS Dialogue / argv | **PASS** | Unchanged path: Dialogue from `sanitizedBeats` only (`build-ass-from-beats.ts:62–63`); VO → token counts for timings only (`compute-vo-proportional-beat-timings.ts:50–68`); argv paths-only (`build-reel-v1-branding-args.ts`). Mismatch path never reaches ASS/spawn |
| No new apply fields / FE / DB | **PASS** | FE none; `voiceoverTimingHash` still forbidden (`lib/contracts/branding-job.ts:213`); no migration |
| USER_STORIES AC not unchecked | **PASS** | `git diff HEAD -- plan/USER_STORIES.md` empty; five Phase A AC remain `[x]` |

### SECURITY Phase B-M1 (additive `[SEC]`)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| **[SEC] Worker `voiceoverTimingHash` re-check** | **PASS** | Placement + compare + fail + legacy skip — above |
| **[SEC] No new client authority** | **PASS** | Worker-only; forbidden keys unchanged |
| **[SEC] VO still never ASS/argv** | **PASS** | Code path + mismatch zero-spawn; see note |
| **[SEC] Sanitized failure only** | **PASS** | `failBrandingJob` persists i18n code only (`62–70`); tests assert key strings, not VO/digests |

### Convention Compliance

- Server-only worker path; no Client Components / Supabase in FE for M1 (FE out of scope).
- No new user-facing copy required (PO M1-9 — optional i18n later).
- Endpoints unchanged — no speculative APIs.

### Test execution

```bash
npx tsx --test lib/branding/run-branding-job.test.ts
```

| Metric | Result |
|--------|--------|
| Tests | **9 pass / 0 fail** |
| M1 cases | mismatch · match · legacy skip · malformed CONFIG |

### Gaps (what blocks PASS)

**None blocking.** Non-blocking notes:

1. **Match-path M1 test** does not re-assert VO substrings absent from ASS body/argv (relies on unchanged Phase B code path + mismatch zero-spawn). Lean OK; QA may spot-check if desired.
2. **`PHASE-B-M1.md` / README gate checkboxes** may still lag BUILD/VALIDATION ticks — docs hygiene for PO after CLOSE.

### Scope Creep

**None.** No FOR UPDATE SKIP LOCKED, second font, thumbnail, Cliente cover UI, hash-formula change, or new story ID.

### Recommended Next Actions

| Action | Agent |
|--------|-------|
| Lean QA — close QA-PHASE-B Medium #1 | **qa-engineer** |
| Tick BUILD/VALIDATION gates; CLOSE M1 note (keep USER_STORIES AC checked) | **product-owner** |

### Summary for orchestrator (B-M1)

| Field | Value |
|-------|-------|
| **Verdict** | **PASS WITH NOTES** |
| **Must-verify 1–6** | **All PASS** |
| **SECURITY M1 `[SEC]`** | **4 / 4** |
| **Tests** | **9 pass / 0 fail** |
| **USER_STORIES AC** | **Untouched** |
| **Next gate** | QA lean (M1) |
