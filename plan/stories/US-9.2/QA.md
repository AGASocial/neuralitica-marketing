# QA Report — US-9.2 (Phase A — Subtitles, logo, and cover)

**Branch:** `feature/US-9.2-subtitles-logo-cover`  
**BUILD commits reviewed:** worker `7518bc5` · BE `36e9dd3` + fix `757da6a` · FE `a15921b`  
**Validation:** PASS WITH NOTES — `plan/stories/US-9.2/VALIDATION.md` @ `4378c65` (49/49 tests)  
**CONTRACT:** `plan/stories/US-9.2/CONTRACT.md` (frozen, FE-reviewed)  
**SECURITY:** `plan/stories/US-9.2/SECURITY.md` (APPROVE WITH CONDITIONS)  
**Reviewer:** qa-engineer  
**Date:** 2026-08-30 (post-fix `757da6a`)

### Verdict: APPROVE WITH CONDITIONS

Phase A implements the frozen CONTRACT/SECURITY model: ASS sanitize → temp file → path-only FFmpeg argv; `spawn` args-array with `shell: false`; Storage SDK I/O (no branding-time URL fetch); pointer-only Operator trigger with forbidden-field rejection; Cliente logo/defaults via dedicated Server Actions and shared US-3.3 upload stack; closed branding status writes under `lib/assembly/**` + `lib/branding/**`; type-specific media serve auth; worker tenancy re-check before spawn; fix `757da6a` wires Operator **Apply branding** / **Re-brand** to the real orchestrator. No Critical or High exploitable findings.

**Close recommendation (Phase A): YES** — ship branding second pass, Ficha logo/defaults, Operator panel, auto-chain, and cover export. Live FFmpeg/Fly smoke, visual mobile subtitle QA, and incomplete SECURITY test-matrix items are follow-ups; not blockers for Phase A close.

---

## Fix verification — `757da6a`

| Check | Status | Evidence |
|-------|--------|----------|
| Server Action delegates to orchestrator | **PASS** | `applyBrandingForAssembly` → `applyBrandingForAssemblyInner(input)` (`lib/assembly/actions/apply-branding-for-assembly.ts:13–16`) |
| Forbidden-field validation preserved | **PASS** | Inner scans `findForbiddenBrandingKeys` + Zod before `createBrandingJobForAssembly({ source: "operator_manual" })` (`lib/assembly/create-branding-job-for-assembly.ts:233–252`) |
| FE imports wired action | **PASS** | `OperatorAssemblyPanel.tsx:25,492` · `BrandingRebrandConfirmDialog.tsx:12,102` |
| Stub `INTERNAL_ERROR` removed | **PASS** | Action file contains delegation only — no stub return |

**Prior VALIDATION FAIL (apply branding stub) is resolved.** No regressions introduced by the fix.

---

## Findings

### Medium

| # | Severity | Location | Issue | Why it matters | Recommended fix |
|---|----------|----------|-------|----------------|-----------------|
| 1 | **Medium** | `lib/branding/poll-branding-jobs.ts:25–43`, `lib/branding/apply-branding-job-update.ts:120–136`, `lib/branding/run-branding-job.ts:84–95` | Worker poll uses plain `SELECT … WHERE branding_status IN ('queued','processing')` with no `FOR UPDATE SKIP LOCKED`. `applyBrandingJobUpdate` conditional `.eq("branding_status", currentStatus)` does not verify rows affected; on lost race it still returns success and `runBrandingJob` proceeds to FFmpeg. | CONTRACT § Poll runtime expects atomic claim (same class as US-9.1). Concurrent Fly replicas or dev in-process + worker overlap can duplicate branding FFmpeg and orphan `branded-*` / `cover-*` assets before idempotency index catches up. Not cross-tenant IDOR. | Return `idempotent: true` when zero rows updated; skip spawn when claim lost. Prefer atomic `UPDATE … SET branding_status='processing' WHERE id=$1 AND branding_status='queued' RETURNING *` before download/spawn. |

### Low

| # | Severity | Location | Issue | Why it matters | Recommended fix |
|---|----------|----------|-------|----------------|-----------------|
| 2 | **Low** | `lib/assembly/assembly-jobs.test.ts:417–443`, `lib/branding/**` | SECURITY grep for `fetch(` covers `lib/assembly/**` only — not `lib/branding/**`. Manual review confirms no `fetch(` under `lib/branding/`. | Regression in branding download path would ship undetected. VALIDATION flagged. | Extend grep guard to scan `lib/branding/**` (exclude tests). |
| 3 | **Low** | Test suite (see CONTRACT § Security test matrix) | Missing automated tests: logo SVG/HTML rejection; logo > 2 MiB; foreign `assemblyJobId` → `NOT_FOUND`; foreign `client_logo` / `cover_frame` serve → 404; explicit Ficha PATCH `logo_asset_id` smuggle. Code paths enforce controls (`upload-validation.ts:174–231`, `create-branding-job-for-assembly.ts:125–131`, media route ownership). | High-impact IDOR/upload regressions would ship undetected. | Add mocked orchestrator + route tests per CONTRACT matrix (VALIDATION P1 backlog). |
| 4 | **Low** | `components/scripts/OperatorAssemblyPanel.tsx:422` | ESLint `prefer-const`: `timer` never reassigned. | Lint failure in US-9.2 FE slice; no runtime/security impact (same pattern as US-9.1 Finding 4). | Change `let timer` to `const timer`. |

### Informational (non-blocking)

| Topic | Status | Notes |
|-------|--------|-------|
| Live FFmpeg / Fly E2E | **Deferred** | CONTRACT out of scope; args builder + mocked `runBrandingJob` only. Manual Assemble → auto-chain/Apply → preview → Download cover recommended before production traffic. |
| Visual mobile subtitle QA | **Deferred** | Safe-zone constants verified in unit tests (`lib/branding/constants.ts`, `build-ass-from-beats.test.ts`); no device/visual CI. |
| Phase B items | **Documented** | VO-proportional timing, Operator `coverFrameSec` override, custom fonts — CONTRACT Phase B; not AC blockers. |
| Hardcoded local operator | **Sanctioned** | `getCurrentUser()` interim per AGENTS.md — not a finding. |
| `npm run build` | **Pre-existing env guard** | Fails with `AUTH_DEV_FALLBACK` set when `NODE_ENV=production`; **passes** when unset (`AUTH_DEV_FALLBACK= npm run build`). Not introduced by US-9.2. |
| `npm run lint` / `tsc --noEmit` | **Pre-existing repo debt** | US-9.2-specific: Finding 4; test files use established `require()` / tsx pattern. |

---

## Security control verification

| Control (CONTRACT / SECURITY.md) | Status | Evidence |
|----------------------------------|--------|----------|
| Subtitle sanitize → ASS file → path-only argv | **PASS** | `sanitize-subtitle-beats.ts:52–80`; `run-branding-job.ts:187–203`; golden tests assert no raw beat text |
| FFmpeg `spawn` args array, `shell: false` | **PASS** | `lib/assembly/run-ffmpeg.ts:26`; branding tests assert array + `shell: false` |
| No shell `exec` in branding path | **PASS** | Grep: no `exec(` under `lib/branding/**` or branding worker modules |
| No `-drawtext` with user strings | **PASS** | `build-reel-v1-branding-args.ts` uses `subtitles=` filter with temp path only |
| No HTTP `fetch` for branding asset bytes | **PASS (code)** | `run-branding-job.ts` uses `getMediaStorage().readStream`; no `fetch(` in `lib/branding/**`; grep guard partial (Finding 2) |
| Trigger `{ assemblyJobId, subtitlesEnabled?, logoEnabled? }` only | **PASS** | `applyBrandingForAssemblyRequestSchema`; `findForbiddenBrandingKeys` + tests |
| `requireOperator("handler")` on manual apply | **PASS** | `create-branding-job-for-assembly.ts:105–116`; reachable via wired Server Action (`757da6a`) |
| `requireActive("handler")` on logo/defaults | **PASS** | `upload-client-logo.ts:76`, `update-assembly-config-defaults.ts:34`, `remove-client-logo.ts` |
| Assembly tenancy foreign id → `NOT_FOUND` | **PASS (code)** | `loadAssemblyJobForBranding` scopes `client_id`; **no automated 404 test** (Finding 3) |
| Shared `client_logo` upload (2 MiB, magic bytes, server key) | **PASS** | `validateClientLogoUpload` (`upload-validation.ts:174–231`); **no SVG/oversize tests** (Finding 3) |
| Logo replace-on-upload deletes prior own blob | **PASS** | `upload-client-logo.ts:38–65`, `116–125` |
| Ficha PATCH cannot set `logo_asset_id` / `assembly_config` | **PASS (code)** | Strict seven-key allowlist in profile update tests; **no explicit smuggle test** (Finding 3) |
| Worker tenancy re-check before spawn | **PASS** | `run-branding-job.ts:110–125`; mocked mismatch → `failed` without spawn |
| Closed branding status write surface | **PASS** | `apply-branding-job-update.ts` + `writeBrandingQueuedState`; grep allows `lib/assembly/**` + `lib/branding/**` only |
| Media serve auth matrix | **PASS (code)** | `client_logo` / `cover_frame`: `requireActive` + ownership; `assembled_reel`: `requireOperator` (`route.ts:129–240`); **no route IDOR tests** (Finding 3) |
| Branded video Cliente serve not widened | **PASS** | `assembled_reel` branch requires `requireOperator` |
| DTO excludes `storage_key`, ASS body, argv, beat text | **PASS** | `mapBrandingConfigForDto` strips server-only fields |
| Auto-chain uses server profile defaults | **PASS** | `on-assembly-job-completed.ts` → `createBrandingJobForAssembly({ source: "auto_chain" })` |
| Idempotency fingerprint server-computed | **PASS** | `compute-branding-fingerprint.ts`; stability test |
| RLS + `neuramark_` prefix on DDL | **PASS** | `20260830900000_neuramark_branding_us_9_2.sql` |
| No `@supabase/supabase-js` in Client Components (branding surfaces) | **PASS** | `ProfileBrandingSection.tsx`, `OperatorAssemblyPanel.tsx` import Server Actions + contracts only |
| ADR-0003: branding FFmpeg on Fly / dev in-process | **PASS** | `enqueue-branding-job.ts`; `worker/branding-jobs.ts` |
| Atomic worker job claim | **PARTIAL** | Finding 1 |

---

## Checks run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/branding/*.test.ts lib/assembly/branding-jobs.test.ts lib/assembly/assembly-jobs.test.ts lib/profile/get-business-profile-for-client.test.ts` | **49 pass / 0 fail** (~409 ms) |
| `npm run lint` | **Fail** — repo-wide debt; US-9.2 FE `prefer-const` in `OperatorAssemblyPanel.tsx:422` |
| `AUTH_DEV_FALLBACK= npm run build` | **Pass** — Next.js 15.5.20 production build completes |
| `npm run build` (default `.env`) | **Fail (pre-existing)** — `AUTH_DEV_FALLBACK must not be set when NODE_ENV=production` |
| `npx tsc --noEmit` | **Pre-existing test-file TS noise** — branding tests run via tsx, not tsc project |
| Manual Operator E2E / Fly FFmpeg smoke | **Not run** — out of VALIDATION scope; recommended staging checklist |
| Manual logo SVG/oversize upload | **Not run** — code review + validator logic only |

---

## What was not covered

- Manual Operator flow: Assemble → auto-chain branding → Apply/Re-brand toggles → preview `<video>` → Download cover JPEG.
- Live FFmpeg on Fly worker with real assembly job and DejaVu font bundle on worker image.
- Visual subtitle safe-zone readability on physical mobile device.
- Automated route-level IDOR tests for branding trigger and `client_logo` / `cover_frame` serve.
- Load/concurrency test for duplicate branding worker claims (Finding 1).
- Full-repo lint/build green with default dev `.env` (pre-existing `AUTH_DEV_FALLBACK` guard).
- Phase B VO-synced timing, Operator `coverFrameSec` override, Cliente branded video preview (US-11.1).

---

## Finding counts

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 1 |
| Low | 3 |
| Informational | 6 |

---

## Phase A close gate

| Question | Answer |
|----------|--------|
| QA verdict | **APPROVE WITH CONDITIONS** |
| Blockers for merge? | **No** — no Critical/High; Medium is worker-claim hardening (same class as US-9.1), not exploitable bypass |
| Recommend CLOSE Phase A? | **YES** |
| Conditions before production traffic | (1) Manual or Fly smoke with real FFmpeg + cover extract; (2) track Finding 1 worker claim hardening in backlog; (3) add SECURITY matrix tests (Finding 3) and extend `fetch(` grep (Finding 2) in next slice |

---
---

# QA Report — US-9.2 Phase B-M2 (Branding poll atomic claim)

**Story:** US-9.2 — Phase B-M2 lean integrity fast-follow  
**Sprint label:** `US-9.2-B-M2`  
**Branch:** `feature/US-9.2-b-m2-branding-poll-claim`  
**Sources:** `PHASE-B-M2.md` (M2-1…M2-11) · `SECURITY.md` Phase B-M2 (5 conditions) · `CONTRACT.md` § Phase B-M2  
**Reviewer:** qa-engineer  
**Date:** 2026-08-31  
**Scope:** Lean — poll claim race only. Do not check USER_STORIES AC.

### Verdict: APPROVE

M2 closes QA Phase A **Medium #1** and QA-PHASE-B **Medium #2**. Atomic `queued` → `processing` claim via conditional UPDATE + `.select("id")`; zero rows → `{ idempotent: true }`; `runBrandingJob` exits before `mkdtemp` / download / spawn on lost claim or peer `processing` at entry; poll batch is `queued`-only. All five SECURITY Phase B-M2 conditions hold. No new client authority. **Close recommendation (Phase B-M2): YES.**

---

## Finding status

| # | Severity | Status | Notes |
|---|----------|--------|-------|
| **1** (Phase A QA) | Medium | **CLOSED** | `apply-branding-job-update.ts:122–150` · `run-branding-job.ts:95–107` |
| **2** (QA-PHASE-B) | Medium | **CLOSED** | `poll-branding-jobs.ts:29` — `queued`-only; claim gate as above |
| Phase A Low 2–4 · Phase B Low 3–4 | Low | Unchanged | Out of M2 scope |

---

## M2 control verification

| Condition (SECURITY / CONTRACT M2) | Status | Evidence |
|------------------------------------|--------|----------|
| Atomic claim `WHERE branding_status = 'queued'` + RETURNING | **PASS** | `apply-branding-job-update.ts:123–129` — also `.eq("status", "completed")`; `pre_branding` snapshot on claim (`103–107`) |
| Zero rows → `idempotent: true`, no throw | **PASS** | `apply-branding-job-update.ts:135–142` |
| Runner gate: lost claim / peer `processing` → no spawn | **PASS** | `run-branding-job.ts:95–107`; tests `Phase B-M2: lost claim` · `entry with processing status` |
| Poll `queued`-only (no `processing` resume) | **PASS** | `poll-branding-jobs.ts:29`; stale sweep still runs first (`mark-stale-branding-jobs-failed.ts`) |
| No new client authority / endpoints | **PASS** | Worker-only applier; `import "server-only"` unchanged |

---

## Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/branding/run-branding-job.test.ts` | **11 pass / 0 fail** (~284 ms) — includes 2 Phase B-M2 cases |
| `npx tsx --test lib/branding/*.test.ts` | **35 pass / 0 fail** (~277 ms) |
| Manual review vs SECURITY Phase B-M2 (5) + CONTRACT § Phase B-M2 | Completed |

---

## What Was Not Covered

- Live multi-replica Fly concurrency soak (design relies on Postgres conditional UPDATE — acceptable per CONTRACT)  
- Dedicated unit test for `poll-branding-jobs.ts` SELECT predicate (optional per PHASE-B-M2)  
- US-9.1 assembly poll claim (separate backlog — M2-11)

---

## Gate summary (Phase B-M2)

| Field | Value |
|-------|-------|
| **Verdict** | **APPROVE** |
| **Critical / High / Medium / Low** | **0 / 0 / 0 / 0** (new) |
| **QA Phase A Medium #1** | **CLOSED** |
| **QA-PHASE-B Medium #2** | **CLOSED** |
| **Stop CLOSE M2?** | **No** |
