# QA Report — US-9.2 Phase B (VO-proportional timing + Operator coverFrameSec)

**Story:** US-9.2 — Phase B deferred polish  
**Sprint label:** `US-9.2-B`  
**Branch:** `feature/US-9.2-phase-b-subtitle-cover`  
**BUILD refs:** BE `95419c1` · FE `8f365bf` · VALIDATION `6db2cba`  
**Validation:** PASS WITH NOTES — `VALIDATION-PHASE-B.md` (44/44 tests)  
**CONTRACT:** `CONTRACT.md` § Phase B (frozen, FE-reviewed 2026-08-31)  
**SECURITY:** `SECURITY.md` Phase B — APPROVE WITH CONDITIONS (8 conditions)  
**Reviewer:** qa-engineer  
**Date:** 2026-08-31

### Verdict: APPROVE WITH CONDITIONS

Phase B correctly closes both Phase A deferrals under the frozen trust model: **VO-proportional beat timings** from server-loaded `voiceover_text` word partitions (counts only — never ASS Dialogue / argv), and **Operator optional `coverFrameSec`** via Zod `0–45` → snapshot → duration clamp → numeric `-ss`. All eight SECURITY Phase B conditions hold on the reviewed path. No Critical or High findings.

**Close recommendation (Phase B): YES** — proceed to CLOSE. Remediate the Medium integrity gap (worker VO-hash re-check) as a fast follow; it does not reopen injection / shell / client-authority surfaces.

---

## Severity counts

| Severity | Count |
|----------|-------|
| Critical | **0** |
| High | **0** |
| Medium | **2** (1 Phase B–new · 1 Phase A carry-forward) |
| Low | **2** |

---

## Findings

### Medium

| # | Severity | Location | Issue | Why it matters | Recommended fix |
|---|----------|----------|-------|----------------|-----------------|
| 1 | **Medium** | `lib/branding/run-branding-job.ts` (was `:148–206`) | ~~Worker did not re-check `voiceoverTimingHash` before VO-proportional timings.~~ | Fingerprint integrity gap vs subtitle-hash guard. | **CLOSED by US-9.2-B-M1** (`1b2a8e7` / `00df642`) — see § Phase B-M1 below. |
| 2 | **Medium** | `lib/branding/poll-branding-jobs.ts:25–43`, `apply-branding-job-update.ts`, `run-branding-job.ts` claim path | **Carry-forward (Phase A QA Finding 1):** poll lacks `FOR UPDATE SKIP LOCKED`; claim does not verify rows affected before FFmpeg. | Concurrent workers can still duplicate branding spend. Unchanged by Phase B; not cross-tenant. | Same Phase A fix: atomic claim / zero-row → skip spawn. |

### Low

| # | Severity | Location | Issue | Why it matters | Recommended fix |
|---|----------|----------|-------|----------------|-----------------|
| 3 | **Low** | `components/scripts/OperatorAssemblyPanel.tsx:207–213` | `resolveCoverFrameSecForApply` accepts any finite number; does not clamp to `0–45` before the Server Action. Relies on InputNumber min/max + server Zod. | Out-of-range typed values produce a validation error round-trip instead of silent clamp; no security bypass (Zod rejects). | Clamp client-side to `[0, 45]` (or disable Apply when out of range) to match InputNumber bounds. |
| 4 | **Low** | `OperatorAssemblyPanel.tsx:502` | ESLint `prefer-const`: `timer` never reassigned (Phase A Finding 4 still open). | Lint noise in the Phase B FE touch file; no runtime/security impact. | `const timer`. |

---

## Security control verification (Phase B — 8 conditions)

| # | Condition | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Anti–cover-injection: Zod number `0–45`; invalid → `VALIDATION_ERROR`; argv numeric + clamp | **PASS** | `applyBrandingForAssemblyRequestSchema` (`branding-job.ts:84`); Inner maps field errors (`create-branding-job-for-assembly.ts:267–284`); tests reject `-1` / `46` / `"1;rm"` (`branding-jobs.test.ts:213–229`); `clampCoverSeekSec` + `formatCoverSeekSec` (`extract-cover-frame-args.ts:14–32`) |
| 2 | Anti–VO-in-ASS/argv: VO counts only | **PASS** | Worker timings from VO (`run-branding-job.ts:196–206`); Dialogue = sanitized beats (`build-ass-from-beats.ts:61–63`); test asserts VO fixture absent from ASS (`build-ass-from-beats.test.ts:62–63`) |
| 3 | Anti–subtitle-injection: same sanitizer on VO-timing path | **PASS** | Orchestrator sanitizes before snapshot (`create-branding-job-for-assembly.ts:161–171`); worker re-sanitizes + hash check (`run-branding-job.ts:150–161`); sanitizer suite still pass |
| 4 | Anti–client-authority: cover number only; forbid VO/timings/paths/hashes | **PASS** | `FORBIDDEN_BRANDING_AUTHORITY_KEYS` omits cover, includes VO/timing/path/hash (`branding-job.ts:189–237`); tests (`branding-jobs.test.ts:135–155`) |
| 5 | Anti–shell-injection: spawn args-array, `shell: false` | **PASS** | `run-branding-job.test.ts` spawn contract |
| 6 | Anti–client-paths/SSRF: server temp + Storage SDK | **PASS** | Unchanged Phase A path; no `fetch(` in `lib/branding/**` for asset bytes |
| 7 | Anti–timing/fingerprint-forgery: server helper + hash in fingerprint | **PASS (partial)** | Server `computeVoiceoverTimingHash` + fingerprint append (`compute-branding-fingerprint.ts:19–27`); client hash forbidden. **Gap:** worker does not re-verify live VO vs snapshot hash — Finding 1 |
| 8 | Anti–auto-chain cover smuggle: profile defaults only | **PASS** | Cover override only when `source === "operator_manual"` (`create-branding-job-for-assembly.ts:156–159`); auto-chain / revision pass no `coverFrameSec` (`on-assembly-job-completed.ts:12–15`, `revision-pipeline-seams.ts:193–197`) |

---

## CONTRACT / FE surface checks

| Surface | Status | Notes |
|---------|--------|-------|
| `computeVoProportionalBeatTimings` + tokenizer | **PASS** | Contiguous partition, remainder to leading buckets, last end forced, empty VO → equal split |
| `voiceoverTimingHash` + fingerprint | **PASS** | Hash = sha256(tokens joined `\n`); fingerprint includes hash; VO change → new FP (unit tests) |
| Snapshot schema `voiceoverTimingHash` | **PASS** | `brandingConfigSnapshotSchema`; legacy Phase A rows soft-default empty hash in row mappers |
| Operator DTO strips hashes | **PASS** | `mapBrandingConfigForDto` exposes only toggles + `coverFrameSec` |
| `buildAssFromBeats` explicit timings | **PASS** | Length mismatch → equal split |
| FE Operator `InputNumber` + Apply/Re-brand | **PASS** | min 0 / max 45 / step 0.1; wire includes `coverFrameSec` on Apply + Re-brand dialog |
| EN/ES i18n | **PASS** | `scripts.branding.coverFrame.*` + `coverFrameInvalid`; no lip-sync copy |
| No Cliente cover UI | **PASS** | `ProfileBrandingSection` comment + no cover control |
| DB | **PASS** | No new tables/columns |

---

## Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test` on Phase B suites (`compute-vo-proportional-beat-timings`, `build-ass-from-beats`, `extract-cover-frame-args`, `branding-jobs`, `run-branding-job`, `sanitize-subtitle-beats`) | **44 pass / 0 fail** (~364 ms) |
| `npx eslint` on Phase B FE/BE touch files | **1 error** (`prefer-const` Finding 4) + pre-existing hooks warning |
| `npx tsc --noEmit` | Pre-existing repo/test debt; Phase B production sources clean; test files show established `.ts` extension / stub-typing noise |
| Manual code review vs SECURITY Phase B (8) + CONTRACT Phase B | Completed — see tables above |
| Live FFmpeg / Operator E2E on Fly | **Not run** (CONTRACT out of scope) |

---

## What Was Not Covered

- Live Fly worker FFmpeg branding with real VO-proportional ASS + Operator cover override.
- Manual Operator UI E2E (Apply with cover 2.5 → branded cover JPEG).
- Concurrent multi-replica branding claim race (Finding 2) under load.
- Full SECURITY Phase A test-matrix gaps still open from Phase A QA (logo SVG/oversize, serve IDOR automation) — out of Phase B delta.

---

## Informational (non-blocking)

| Topic | Notes |
|-------|-------|
| Terminology | Implementation correctly labels VO-proportional / script-word proxy — not TTS/ASR lip-sync. |
| Hardcoded local operator | Sanctioned via `getCurrentUser()` until auth stories — not a finding. |
| `TASKS.md` Phase B checkboxes | VALIDATION noted docs lag; implementation present on branch. |
| Phase A AC | Remain checked; Phase B adds no new USER_STORIES checkboxes. |

---

## Gate summary

| Field | Value |
|-------|-------|
| **Verdict** | **APPROVE WITH CONDITIONS** |
| **Critical / High** | **0 / 0** |
| **Medium / Low** | **2 / 2** |
| **Stop CLOSE?** | **No** — CLOSE Phase B allowed |
| **Next** | product-owner CLOSE Phase B in SPRINT-STATE; implementers optionally land Finding 1 (VO-hash worker re-check) as follow-up |

---
---

# QA Report — US-9.2 Phase B-M1 (Worker `voiceoverTimingHash` re-check)

**Story:** US-9.2 — Phase B-M1 lean integrity fast-follow  
**Sprint label:** `US-9.2-B-M1`  
**Branch:** `feature/US-9.2-b-m1-voiceover-timing-hash`  
**BUILD refs:** media `1b2a8e7` · BE constant `00df642` · docs `8c4e8da`  
**Validation:** PASS WITH NOTES — `VALIDATION-PHASE-B.md` § Phase B-M1  
**CONTRACT / SECURITY:** Phase B-M1 frozen (4 conditions)  
**Reviewer:** qa-engineer  
**Date:** 2026-08-31  
**Scope:** Lean — VO-hash worker guard only. Do not check USER_STORIES AC.

### Verdict: APPROVE

M1 closes QA-PHASE-B **Medium #1**. Worker re-checks live VO vs raw snapshot `voiceoverTimingHash` after the subtitle-hash guard and before `mkdtemp` / ASS / spawn. Mismatch and malformed non-empty fail closed with sanitized i18n codes and **zero** FFmpeg. Legacy Phase A missing/empty/null skips without soft-default false-enforce. No Critical / High. **Close recommendation (Phase B-M1): YES.**

---

## Finding status (carry-forward)

| # | Severity | Status | Notes |
|---|----------|--------|-------|
| **1** | Medium (Phase B) | **CLOSED** | `run-branding-job.ts:169–192` + `rawVoiceoverTimingHash` / `readRawVoiceoverTimingHash`; unit tests mismatch / match / legacy skip / malformed |
| **2** | Medium (Phase A poll claim) | **OPEN — out of scope** | `FOR UPDATE SKIP LOCKED` / claim race unchanged; not blocking M1 CLOSE |
| 3–4 | Low (Phase B) | Unchanged | Client clamp / `prefer-const` — out of M1 |

---

## Hunt results (M1)

| Risk | Result | Evidence |
|------|--------|----------|
| Bypass of VO-hash guard | **PASS** | Guard after subtitle hash (`164–167`), before `mkdtemp` (`199`); early `return` on mismatch/malformed |
| Soft-default false-enforce on Phase A | **PASS** | Guard uses `rawVoiceoverTimingHash`, not soft-defaulted `config.voiceoverTimingHash` (`171`); legacy-missing test completes |
| Spawn after fail | **PASS** | Mismatch/malformed tests: `ffmpegCalled === false` |
| Client authority | **PASS** | No apply/FE/DB delta; `voiceoverTimingHash` still in `FORBIDDEN_BRANDING_AUTHORITY_KEYS` |
| Secrets in fail messages | **PASS** | `failBrandingJob` persists `scripts.branding.failure.voiceoverTimingHashMismatch` / `…configError` only — no VO, digests, argv |

---

## Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/branding/run-branding-job.test.ts` | **9 pass / 0 fail** (~334 ms) — includes 4 Phase B-M1 cases |
| Manual review vs SECURITY Phase B-M1 (4) + CONTRACT § Phase B-M1 | Completed |

---

## What Was Not Covered

- Live Fly worker E2E with mutated VO between enqueue and run  
- Poll claim race (Finding 2)  
- Optional EN/ES copy for the new fail key (PO M1-9 — deferred)

---

## Gate summary (Phase B-M1)

| Field | Value |
|-------|-------|
| **Verdict** | **APPROVE** |
| **Critical / High** | **0 / 0** |
| **Stop CLOSE M1?** | **No** |
| **QA-PHASE-B Medium #1** | **CLOSED** |
| **Next** | product-owner CLOSE M1 in SPRINT-STATE; Medium #2 remains backlog |
