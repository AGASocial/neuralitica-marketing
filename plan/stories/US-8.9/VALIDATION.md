# Validation Report — US-8.9

**Branch:** `feature/US-8.9-broll-operator-generate-ui`  
**Commit:** `e8bd0d3` (HEAD at validation time)  
**Validator:** requirements-validator  
**Date:** 2026-08-31  

### Verdict: PASS WITH NOTES

All six acceptance criteria are satisfied with file-level evidence. Automated tests for preview + create pass **41 / 41**. Residual notes are non-blocking (optional SC hint not wired; no browser E2E in this pass).

---

### Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| **AC #1** — Operator-only “Generate B-roll” control visible on `/operator/scripts` when script is faceless, marks `needs_broll`, and policy resolves an active B-roll provider (Wan on `provider_tier = low`, LTX on `provider_tier = high`) | **PASS** | Route `/operator/scripts` is Operator-gated via `operator/layout.tsx` (`page.tsx` L41–43). `BrollGenerateControl` wired in `ScriptsPageView.tsx` L1849–1858 (after `HeygenGenerateControl`, before `OperatorVideoJobSummaryPanel`). Visibility rule `isEligiblePreview` (`BrollGenerateConfirmDialog.tsx` L162–175): `needsBroll && providerKey && !blockedReasonKey`. Server preview resolves provider via `resolveProviderForJob` + `isAllowedBrollProviderPair` in `broll-estimate-shared.ts` L144–167; returns `siliconflow_wan21_turbo` or `ltx_broll_high` L221–229. Tests 5–7 confirm Wan/LTX paths. |
| **AC #2** — Control hidden when ineligible (non-faceless / no B-roll beats / B-roll jobs already queued or processing / preview returns blocked) | **PASS** | `BrollGenerateControl` returns `null` when `!showButton` (`BrollGenerateConfirmDialog.tsx` L515–517). Eligibility poll sets `showButton` only via `isEligiblePreview(result)` L496; errors → hide L497–500. Non-faceless: test 8 → `needsBroll: false`, no `providerKey`. In-flight: `hasBrollJobInFlight` query (`broll-estimate-shared.ts` L90–113) + preview action L64–78; test 9 → `blockedReasonKey: scripts.broll.blocked.jobInFlight`. Blocked still/budget/provider: tests 10, 14. Optional `brollJobInFlight` prop also hides L475–478. |
| **AC #3** — Confirm dialog shows estimated total cost, clip count, and provider label before submit (server preview — never client-computed cost or provider) | **PASS** | `BrollGenerateConfirmDialog` loads preview on dialog open (`useEffect` L216–276). Display rows from preview DTO only: provider label via `providerLabel(providerKey, copy)` L149–160, L407–415; clip count L417–425; cost via `formatCentsForDisplay(estimatedCostCents, locale)` L427–434. Confirm disabled until server preview eligible L278–279, L358. No client-side cost math or provider picker. |
| **AC #4** — Confirm submits only `{ reelScriptId, clientId }` via existing `createBrollVideoJobs` Server Action; success toast + refresh; partial skips surfaced with localized messages | **PASS** | Submit body L289: `createBrollVideoJobs({ reelScriptId, clientId })` only. Success handling L291–326: full / partial / all-skipped paths with localized `skipReasonMessage`. `ScriptsPageView.handleBrollGenerateSuccess` L985–1011: success toast + warn toast for partial skips + `router.refresh()`. Partial skip maps `reasonCode` / `messageKey` to copy L127–146. |
| **AC #5** — EN + ES strings for button, dialog, errors, and success toast | **PASS** | `messages/en.json` L1414–1452 and `messages/es.json` L1414–1452: full `scripts.broll.generate.*`, `scripts.broll.blocked.*`, `scripts.broll.failure.referenceStillMissing`. Wired in `app/(app)/operator/scripts/page.tsx` L178: `broll: t.scripts.broll.generate`. |
| **AC #6 [SEC]** — Non-operator sessions receive 403; request body rejects forbidden authority fields; no new adapter or orchestrator logic | **PASS** | Preview: `requireOperator("handler")` first (`preview-broll-video-jobs-estimate.ts` L24–34); test 1 → `FORBIDDEN`. Forbidden keys: `findForbiddenVideoJobKeys` before parse L36–38; tests 2, 2b → `FORBIDDEN_FIELDS` for `provider_key`, `operatorClientId`. Create regression: test 11 + create test 4 (`provider_key`, `prompt`, `image_url`). IDOR: `clientId !== operator.id` L45–47; test 3. Shared helper extraction only: `create-broll-video-jobs.ts` imports `isFacelessNeedsBroll`, `computeBrollClipCount` from `broll-estimate-shared.ts`; 26 create tests unchanged/pass. Closed success schema `.strict()` test 12. |

---

### Convention Compliance

| Check | Status | Evidence |
|-------|--------|----------|
| EN + ES user-facing strings | **PASS** | See AC #5 |
| Server Components by default; minimal `"use client"` | **PASS** | Page is SC; only `BrollGenerateConfirmDialog.tsx` (control + dialog) is client |
| PrimeReact-first UI | **PASS** | `Button`, `Dialog`, `Message`, `ProgressSpinner` from PrimeReact |
| Loading / error / pending / success states | **PASS** | Eligibility loading hides control; dialog spinner L377–388; load error L391–393; confirm `pending` + disabled L358–359; toasts on success/partial/error |
| Auth: Supabase behind server; no browser Supabase | **PASS** | FE calls Server Actions only; no `@supabase` in B-roll components |
| Backend serves concrete frontend consumer | **PASS** | `previewBrollVideoJobsEstimate` + `createBrollVideoJobs` consumed by `BrollGenerateControl` / dialog |
| CONTRACT alignment | **PASS** | Request `{ reelScriptId, clientId }` strict; success schema Wan \| LTX; visibility hide rule; gate order; shared estimate helper; FE stamp `Reviewed by FE: approved` in CONTRACT.md |

---

### Automated Tests

```bash
npx tsx --test \
  lib/video-jobs/preview-broll-video-jobs-estimate.test.ts \
  lib/video-jobs/create-broll-video-jobs.test.ts
```

| Suite | Result |
|-------|--------|
| US-8.9 `previewBrollVideoJobsEstimate` | **15 / 15 pass** |
| US-8.5 `createBrollVideoJobs` | **15 / 15 pass** |
| US-8.8 LTX `createBrollVideoJobs` | **11 / 11 pass** |
| **Total** | **41 / 41 pass** (~144 ms) |

---

### Gaps (what blocks PASS)

None. All six AC satisfied.

---

### Scope Creep

None identified. Implementation stays within CONTRACT out-of-scope: no adapter changes, no DB migrations, no Cliente trigger, no B-roll job list panel, no create body expansion.

---

### Notes (non-blocking)

1. **`brollJobInFlight` SC prop not wired** — `BrollGenerateControl` accepts optional `brollJobInFlight` (CONTRACT § FE props) but `ScriptsPageView` does not pass it. In-flight detection remains authoritative via preview server query; no AC gap.
2. **No browser E2E in this validation pass** — Recommend QA smoke on `/operator/scripts` with a faceless Reel (eligible Wan/LTX), confirm dialog fields, and partial-skip toast.
3. **Double preview call** — Eligibility poll + dialog-open preview (mirrors HeyGen pattern); acceptable per CONTRACT.

---

### Recommended Next Actions

| Action | Owner |
|--------|-------|
| Run QA smoke on `/operator/scripts` (eligible faceless Reel, confirm dialog, partial skip toast) | **qa-engineer** |
| Mark BUILD complete in `TASKS.md`; produce `QA.md` | **qa-engineer** |
| Check off AC in `USER_STORIES.md` on CLOSE | **product-owner** |

---

### Dependency Check

| Dependency | Status |
|------------|--------|
| US-8.5 `createBrollVideoJobs` + Wan | **Satisfied** — reused, 15 tests pass |
| US-8.8 LTX high tier | **Satisfied** — preview + create LTX paths tested |
| US-8.4 job status UI | **Satisfied** — panel unchanged; refresh via `router.refresh()` |
| US-8.7 HeyGen pattern | **Satisfied** — control/dialog structure mirrored |
| US-7.1 budget estimate | **Satisfied** — `assertReelBudgetAllowsEstimatedSpend` in shared helper |
| US-7.2 tier routing | **Satisfied** — `resolveProviderForJob` + allowlist; test 7 tier floor |
