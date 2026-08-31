# Validation Report — US-8.8

**Story:** LTX B-roll adapter (high tier, P1)  
**Branch:** `feature/US-8.8-ltx-broll-high`  
**Head:** `4835f2d` — US-8.8 Phase B: activate LTX catalog and orchestrator unlock.  
**Phases validated:** Phase A (adapter + registry) + Phase B (catalog activate + orchestrator unlock)  
**Date:** 2026-08-31  
**Validator:** requirements-validator

### Verdict: PASS WITH NOTES

All seven `plan/USER_STORIES.md` § US-8.8 acceptance criteria are satisfied with file-level evidence and automated tests. Notes cover vendor duration floor (documented in CONTRACT) and `TASKS.md` checklist drift — neither blocks CLOSE.

**Tests:** 68 passed, 0 failed (`npx tsx --test` on adapter + orchestrator + provider files)

```bash
npx tsx --test \
  lib/providers/video/ltx-broll-high-adapter.test.ts \
  lib/video-jobs/create-broll-video-jobs.test.ts \
  lib/providers/providers.test.ts
```

---

### Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Never the silent default when `provider_tier = low` — tier floor unchanged; Wan remains low-tier B-roll | **PASS** | Policy: `resolveProvider` with `tier: "low"` + active `ltx_broll_high` returns `DEFAULT_LOW_TIER_PROVIDER_KEYS.broll` (`siliconflow_wan21_turbo`), never LTX — `lib/providers/providers.test.ts` “low tier + active ltx_broll_high never resolves LTX for broll”. Orchestrator: `isAllowedBrollProviderPair` requires `(ltx_broll_high, high)` or `(wan, low)` — `lib/contracts/ltx-broll-high.ts` L209–217; rejected at `create-broll-video-jobs.ts` L195–197. Tests: orchestrator #2 (low → Wan only), #3 `(ltx_broll_high, low)` → `BROLL_PROVIDER_UNAVAILABLE`. |
| Default B-roll provider when `provider_tier = high`, script marks `needs_broll`, and catalog row is active | **PASS** | Migration activates row: `supabase/migrations/20260831100000_neuramark_ltx_broll_high_activate.sql`. Policy: high tier + active → `ltx_broll_high` — `providers.test.ts` “high tier + active ltx_broll_high resolves LTX for broll”. Orchestrator resolves via `resolveProviderForJob({ assetRole: "broll", … needsBroll: true })` L174–186, allowlist pass L195–197, creates jobs with `provider_key = ltx_broll_high`, `provider_tier = high`, `asset_role = broll` L293–309. Test: `create-broll-video-jobs.test.ts` US-8.8 #1. Pre-activate inactive → `BROLL_PROVIDER_UNAVAILABLE` — test #15. |
| Clips max duration per policy (3–5s); LTX catalog documents 5s cap (`ltx-2.3-pro`) | **PASS** *(note)* | Policy band: `LTX_CLIP_DURATION_MIN_SEC=3`, `MAX=5`, `DEFAULT=5`; `clampLtxClipDurationSec` — `lib/contracts/ltx-broll-high.ts` L48–50, L141–158. Catalog seed metadata `clipDurationSec: 5`, model `ltx-2.3-pro` — `supabase/migrations/20260829260000_neuramark_provider_catalog.sql` L126. Orchestrator uses `clampLtxClipDurationSec(5)` for LTX path — `create-broll-video-jobs.ts` L227–230. Adapter maps policy ≤5s → FAL vendor enum `6` — `mapLtxVendorDurationSec` L173–184; test adapter #4. **Note:** FAL API minimum is 6s; product AC band is 3–5s at orchestrator/metadata layer per frozen CONTRACT § Duration mapping — not an AC gap. |
| Estimated cost ~$1.26/clip at research baseline (126¢ `per_clip` from catalog seed) | **PASS** | `LTX_UNIT_COST_CENTS_PER_CLIP = 126`; `LTX_CATALOG_COST_MODEL` — `lib/contracts/ltx-broll-high.ts` L66, L72–81. Catalog seed: `"unitCostCents": 126`, `"billingUnit": "per_clip"` — migration L126. Registry bootstrap fallback **126** — `create-provider-registry.ts` L242–255. Adapter `estimateCost` × clipCount — adapter.ts L346–351; tests adapter #3 (126 / 378). Orchestrator budget gate at 126¢/clip — test US-8.8 #7. |
| Failed B-roll does not block talking-head primary (graceful degrade — same independence as US-8.5) | **PASS** | B-roll create failures append `skipped`, never touch primary rows — `create-broll-video-jobs.ts` L351–363. `createTalkingHeadVideoJob` unchanged (independent path). Tests US-8.8 #8 (over-budget, primary untouched), #9 (adapter throw, primary untouched), #14 (sanitized degrade — no key leak). US-8.5 degrade tests #6–7, #12 remain green on shared orchestrator. |
| Multiple B-roll clips may be stitched in assembly (US-9.1) *(produce N `broll` assets; stitch = US-9.1 Phase B handoff)* | **PASS** *(handoff)* | Orchestrator loop creates one job per beat, capped at 8 via `clampWanClipCount` — `create-broll-video-jobs.ts` L170–172, L236–364. Shared test US-8.5 #3: N beats → N jobs (max 8). LTX test #1: 2 beats → 2 LTX `asset_role = broll` rows. **Stitch / FFmpeg = US-9.1 Phase B** (CLOSED) — out of scope; CONTRACT handoff satisfied. |
| [SEC] LTX adapter follows US-8.1 contract: server-only `FAL_API_KEY`, untrusted-response handling, B-roll cost counted against Reel cumulative budget (US-7.1) | **PASS** | `import "server-only"` — adapter.ts L1; test adapter #7. Key via `process.env[LTX_ENV_KEY_NAME]` only inside adapter `getFalApiKey()` L89–97; missing → `PROVIDER_CONFIG_MISSING` before fetch — test #2. Transport `Authorization: Key ${token}` — adapter.ts L185–186; test #9. Normalizers: `normalizeVideoJobStatusResult`, `sanitizeProviderErrorMessage`, `validateProviderOutputUrl` + `LTX_ALLOWED_OUTPUT_HOSTS` — adapter.ts L416–421, L160–176, L199–204; tests #5–6. Budget: `assertReelBudgetAllowsEstimatedSpend` per clip before `createJob` — orchestrator L268–288; test US-8.8 #7. Spend event per created clip L326–335. Forbidden client authority keys — test US-8.5 #4. |

---

### Convention Compliance

| Check | Status | Evidence |
|-------|--------|----------|
| English + Spanish UI strings | **N/A** | No FE AC; preview strip deferred per CONTRACT. |
| Server Components / minimal `"use client"` | **PASS** | All new logic server-only modules (`ltx-broll-high-adapter.ts`, `create-broll-video-jobs.ts`). |
| PrimeReact-first | **N/A** | No UI in scope. |
| Loading / empty / error / pending states | **N/A** | Reuses US-8.4 status UI; no new FE consumer. |
| Auth / `getCurrentUser()` / Operator gate | **PASS** | `requireOperator("handler")` at orchestrator entry L109–121; non-operator → 403 — US-8.5 test #9. No Supabase auth SDK in browser. |
| Backend endpoints map to concrete FE consumer | **PASS** *(deferred FE OK)* | Orchestrator consumed by Server Action / retry path / poller; CONTRACT explicitly defers preview strip. |
| `neuramark_` DB prefix | **PASS** | Migration updates `neuramark_provider_catalog` only; reuses `neuramark_video_jobs` columns. |
| CONTRACT frozen shapes honored | **PASS** | Provider key `ltx_broll_high`, env `FAL_API_KEY`, allowlist `{ wan+low, ltx+high }`, 126¢/clip, host allowlist, flat `{uuid}.mp4` storage — matches `CONTRACT.md`. |

---

### Dependencies (verified satisfied, not re-validated)

| Dependency | Status |
|------------|--------|
| US-8.1 adapter interface + registry + normalizers | ✅ prior CLOSED |
| US-7.2 policy high-tier B-roll routing | ✅ `providers.test.ts` high/low LTX routing |
| US-8.5 `createBrollVideoJobs` + Wan + graceful degrade | ✅ extended, Wan tests still pass |
| US-X.4 catalog seed (`ltx_broll_high`, inactive, 126¢) | ✅ seed + Phase B activate migration |

---

### Gaps (what blocks PASS)

None. All USER_STORIES AC have implementation evidence and passing tests.

---

### Scope Creep

None identified. Implementation stays within CONTRACT out-of-scope list (no FE preview, no stitch, no webhook, no new `video_jobs` DDL, no low-tier Wan behavior change beyond shared allowlist).

---

### Notes (non-blocking)

1. **Vendor duration floor:** FAL submit body sends `duration: 6` when policy clamp is ≤5s — documented in CONTRACT and validated by adapter test #4. Product/metadata band remains 3–5s per AC.
2. **TASKS.md drift:** Phase A BE checklist items remain `[ ]` in `TASKS.md` despite Phase A commit `5aa1392` and full adapter test suite — update TASKS/ gates for process hygiene (not an AC gap).
3. **Multi-clip cap:** Max-8 clip cap exercised on shared orchestrator (US-8.5 test #3); LTX-specific test uses 2 beats — sufficient because provider branch shares the same loop.

---

### Recommended Next Actions

| Action | Owner |
|--------|-------|
| Mark BUILD Phase A checklist complete in `TASKS.md`; advance gates to VALIDATION complete | **product-owner** / implementers |
| Run **QA.md** security + regression review on branch | **qa-engineer** |
| Check off USER_STORIES.md § US-8.8 AC after PO review | **product-owner** (not validator) |
| Merge `feature/US-8.8-ltx-broll-high` when QA approves | **product-owner** |

---

### Test run summary

```
ℹ tests 68
ℹ pass 68
ℹ fail 0
ℹ duration_ms ~1739
```

**Suites exercised:**
- `US-8.8 LTX adapter (Phase A)` — 10/10
- `US-8.8 Phase B createBrollVideoJobs (LTX high tier)` — 11/11
- `US-8.5 Phase B createBrollVideoJobs` (shared orchestrator regressions) — 15/15
- `resolveProvider (US-X.4)` LTX tier-floor/routing — 2/2
- `migrations (US-X.4)` LTX activate migration — 1/1
