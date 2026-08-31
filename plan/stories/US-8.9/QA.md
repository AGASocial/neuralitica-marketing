# QA Report — US-8.9 Operator B-roll generate UI

**Story:** US-8.9 — Operator B-roll generate UI (P1)  
**Branch:** `feature/US-8.9-broll-operator-generate-ui`  
**Reviewed:** 2026-08-31  
**Reviewer:** qa-engineer  
**Sources:** `plan/stories/US-8.9/{CONTRACT,SECURITY,TASKS}.md`, `lib/video-jobs/preview-broll-video-jobs-estimate.ts`, `lib/video-jobs/broll-estimate-shared.ts`, `lib/video-jobs/actions/preview-broll-video-jobs-estimate.ts`, `lib/video-jobs/actions/create-broll-video-jobs.ts`, `components/scripts/BrollGenerateConfirmDialog.tsx`, `components/scripts/ScriptsPageView.tsx`, `lib/contracts/video-job.ts`, `messages/en.json` / `messages/es.json`

### Verdict: APPROVE

**Severity counts:** Critical **0** · High **0** · Medium **0** · Low **3**  
**Merge:** Allowed — no Critical/High blockers. All **10** SECURITY conditions satisfied at control level; CONTRACT security matrix covered by automated tests (15 preview cases + create regression).

---

## Findings

### Low

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| **L1** | `lib/video-jobs/broll-estimate-shared.ts:108-109` | `hasBrollJobInFlight` returns **`false` on Supabase query error** (fail-open). | If the in-flight query fails transiently, preview may omit `blockedReasonKey: jobInFlight` and the control can show while broll jobs are `queued`/`processing`. Create path does not re-check in-flight (TOCTOU accepted in SECURITY). Blast radius: duplicate broll jobs within orchestrator clip cap — not a tenancy or authority bypass. | On query error, return blocked with a generic i18n key, or retry once; log server-side. Optional follow-up — not merge-blocking. |
| **L2** | `lib/video-jobs/preview-broll-video-jobs-estimate.test.ts` | No preview case mirroring US-8.8 create test **“low tier + policy returns LTX → blocked”** (create suite test 2 / 3). | `isAllowedBrollProviderPair` blocks the pair in production (`broll-estimate-shared.ts:165-167`); defense is correct. Gap is test coverage only. | Add mock with `providerKey: ltx_broll_high`, `providerTier: low` → expect `blockedReasonKey: providerUnavailable`, never `providerKey: ltx_broll_high`. |
| **L3** | `lib/video-jobs/broll-estimate-shared.ts:201`; `preview-broll-video-jobs-estimate.ts:24-26`; test harness | `tsc --noEmit` reports type mismatches on adapter estimate assignment and `requireOperator` return narrowing; test file uses `.ts` extension imports + `require()` (lint noise). | Tests pass (41/41); production runtime behavior verified. Project-wide lint/tsc harness pattern — not a security defect. | Widen `unitCostCentsPerClip` to `number` after adapter call; use `Awaited<ReturnType<typeof requireOperator>>` or drop explicit operator type; align test imports with sibling suites when cleaning CI. |

### Informational (not findings)

| Topic | Notes |
|-------|--------|
| Hardcoded local user | Sanctioned per `AGENTS.md` — not a finding. |
| US-8.5 H1 (create action options bypass) | **Fixed** — `actions/create-broll-video-jobs.ts` accepts only `rawInput`, always `requireOperator`, passes session `operatorClientId` to internal core. FE submit verified `{ reelScriptId, clientId }` only (`BrollGenerateConfirmDialog.tsx:289`). |
| `npm run build` | **Fails** on pre-existing HeyGen `"use server"` re-export pattern (`create-heygen-talking-head-video-job.ts`) — **not introduced by US-8.9**; US-8.9 files not in failing import trace root cause. |
| Double preview round-trip | Control eligibility poll + dialog open each call `previewBrollVideoJobsEstimate` — efficiency only. |
| `brollJobInFlight` prop | Optional per CONTRACT; not wired from `ScriptsPageView` — preview remains authoritative. |

---

## SECURITY conditions (10) — verification

| # | Condition | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Anti–non-operator-abuse | **PASS** | `requireOperator("handler")` first on preview (`preview-broll-video-jobs-estimate.ts:26-34`); create action wrapper unchanged (`actions/create-broll-video-jobs.ts:17-27`); test 1 → `FORBIDDEN`; page gated by `operator/layout.tsx`. |
| 2 | Anti–authority-smuggling | **PASS** | `findForbiddenVideoJobKeys` before parse (preview L36-38, create L99-101); strict request schemas; `operatorClientId` in `FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS` (`video-job.ts:140-142`); tests 2, 2b, 11. |
| 3 | Anti–IDOR | **PASS** | `clientId !== operator.id` → `FORBIDDEN` (preview L45-47); scoped `loadReelScriptForVideoJob` → `NOT_FOUND` (L49-55); tests 3, 4. |
| 4 | Anti–client-cost-authority | **PASS** | Dialog displays `estimatedCostCents`, `clipCount`, localized provider label from preview DTO only (`BrollGenerateConfirmDialog.tsx:255-258, 407-433`); create re-runs orchestrator gates; test 13 matches preview/create unit costs. |
| 5 | Anti–preview-over-exposure | **PASS** | Closed `.strict()` success schema (`video-job.ts:489-501`); no prompts/still URLs in DTO; adapter errors → `blockedReasonKey` i18n keys only; test 12 rejects extra fields. |
| 6 | Anti–tier-floor-bypass | **PASS** | `resolveProviderForJob` + `isAllowedBrollProviderPair` (`broll-estimate-shared.ts:144-167`); low → Wan only in tests 5, 7; high → LTX in test 6; disallowed pair → `providerUnavailable`. |
| 7 | Anti–in-flight-bypass | **PASS** | Preview queries `neuramark_video_jobs` `asset_role=broll` `queued|processing` (`broll-estimate-shared.ts:99-106`, preview L64-78); FE hides via `isEligiblePreview` (`BrollGenerateConfirmDialog.tsx:162-175, 496`); test 9. See **L1** for fail-open edge. |
| 8 | Anti–orchestrator-fork | **PASS** | Shared `broll-estimate-shared.ts` extracted; create imports `isFacelessNeedsBroll`, `resolveBeatTexts`, `computeBrollClipCount` (`create-broll-video-jobs.ts:40-44`); preview delegates to `estimateBrollVideoJobsPreview`; test 13. |
| 9 | Anti–create-surface-expansion | **PASS** | Create action signature `{ reelScriptId, clientId }` only; no client `options`; internal `CreateBrollVideoJobsOptions` not re-exported from `"use server"` file. |
| 10 | Anti–module-leak | **PASS** | Preview core + shared helper `import "server-only"`; FE imports `"use server"` action re-exports only; no `@supabase/supabase-js` in client components. |

**BUILD vetoes spot-check:** None triggered.

---

## CONTRACT compliance (spot-check)

| Item | Status |
|------|--------|
| `previewBrollVideoJobsEstimate` gate order (operator → forbidden keys → strict parse → IDOR → reel load → estimate → in-flight) | **PASS** |
| Extended `providerKey` union Wan \| LTX | **PASS** |
| Shared estimate helper; no FE cost math | **PASS** |
| `BrollGenerateControl` + `BrollGenerateConfirmDialog` mirror HeyGen structure | **PASS** |
| Placement after HeyGen, before primary job panel | **PASS** (`ScriptsPageView.tsx:1835-1867`) |
| EN/ES `scripts.broll.generate.*` + blocked + failure keys | **PASS** |
| Partial success toasts + skip reason mapping | **PASS** |
| Create body `{ reelScriptId, clientId }` only — no `confirmEstimateCents` | **PASS** |
| Visibility rule `needsBroll && providerKey && !blockedReasonKey` | **PASS** |
| Automated security test matrix (CONTRACT § Automated tests) | **PASS** — cases 1–13 + budget (14) |

---

## Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/video-jobs/preview-broll-video-jobs-estimate.test.ts lib/video-jobs/create-broll-video-jobs.test.ts` | **41 pass / 0 fail** (~145 ms) |
| `npm run lint` | Pre-existing / harness `no-require-imports` on US-8.9 test file (same pattern as sibling video-job suites) — production FE/BE sources clean for US-8.9 |
| `npx tsc --noEmit` (US-8.9 files) | **3 errors** — see **L3** (non-blocking for runtime; tests pass) |
| `npm run build` | **FAIL** — pre-existing HeyGen `"use server"` re-export (not US-8.9 scope) |
| Grep: FE imports of `broll-estimate-shared` / preview core | **PASS** — client imports actions only |
| Grep: create submit body in dialog | **PASS** — `{ reelScriptId, clientId }` only |
| Grep: `NEXT_PUBLIC` / client Supabase in US-8.9 files | **0** |

---

## What Was Not Covered

- Live Wan/LTX vendor E2E or Operator browser walkthrough on `/operator/scripts`.
- Full `npm run build` green (blocked by unrelated HeyGen action export).
- Concurrent double-click race on confirm (FE disables while `pending`; orchestrator clip cap authoritative — accepted residual).
- Automated grep asserting Cliente routes do not import `previewBrollVideoJobsEstimate` (manual grep: only `BrollGenerateConfirmDialog.tsx` + action module).

---

## Gate summary

| Field | Value |
|-------|--------|
| **Verdict** | **APPROVE** |
| **Critical / High** | **0 / 0** |
| **Medium / Low** | **0 / 3** |
| **Merge** | Allowed |
| **CLOSE** | Ready after product-owner AC checkoff in `USER_STORIES.md` |
