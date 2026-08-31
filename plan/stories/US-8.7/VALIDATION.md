# Validation Report — US-8.7

**Story:** HeyGen adapter (high tier / operator fallback, P1)  
**Branch:** `feature/US-8.7-heygen-adapter`  
**Gate:** VALIDATE  
**Date:** 2026-08-31  
**Validator:** requirements-validator  
**Implementation commits:** `299d638` (BE) · `a18d4cb` (FE)

### Verdict: PASS WITH NOTES

**AC score:** 5 / 5 (all USER_STORIES acceptance criteria satisfied)  
**Tests:** 20 / 20 pass (`npx tsx --test lib/providers/video/heygen-high-adapter.test.ts lib/video-jobs/create-heygen-talking-head-video-job.test.ts`)

Phase A (real adapter + registry + mocked HTTP) and Phase B (catalog activate, orchestrator unlock, operator fallback + FE) are both present. CONTRACT § “V1 VALIDATION closes only after Phase A + Phase B” is met.

---

### Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Never the silent default when `provider_tier = low` | **PASS** | US-7.2 tier floor unchanged; Phase B test `2 — provider_tier=low + active heygen → never heygen_high (policy)` in `create-heygen-talking-head-video-job.test.ts`. Orchestrator allowlist includes `heygen_high` but policy still filters by tier (`create-talking-head-video-job.ts` L46–51 + `resolveProviderForJob`). No auto-fallback path — only dedicated Operator action. Retry stays on parent key (`retry-video-job.ts` forced heygen only when parent was heygen; test cases 9–10). |
| Used when `provider_tier = high`, or when operator explicitly triggers fallback after low-tier failure (override recorded) | **PASS** | High-tier policy: test `3 — provider_tier=high + active → policy selects heygen_high`; allowlist unlock L46–51 `create-talking-head-video-job.ts`. Operator action: `createHeygenTalkingHeadVideoJob` eligibility `high_tier` \| `operator_fallback` (`create-heygen-talking-head-video-job.ts` L112–154, L268–277). Fallback + audit: INSERT `neuramark_video_job_heygen_fallback_overrides` with `rationale_key = operator_heygen_fallback` (L435–448); migration `20260831080000_neuramark_heygen_high_activate.sql` L18–37; test case 4. FE: `HeygenGenerateControl` on `/operator/scripts` expand (`ScriptsPageView.tsx` + `HeygenGenerateConfirmDialog.tsx`). |
| Estimated cost uses per-minute model from catalog (standard ~$1/min; Avatar IV priced separately and never auto-selected) | **PASS** | Catalog/`estimateCost`: `per_second` × `unitCostCents: 2` ≈ 120¢/min (`lib/contracts/heygen-high.ts` L67–88; adapter `estimateCentsForDuration` L93–103). Migration corrects seed 7→2 + `approxPerMinuteCents: 120`. Test `3 — estimate: 30s × 2¢ = 60¢`. Avatar IV never auto-selected: avatar creates always set `engine: { type: "avatar_iii" }` (`heygen-high-adapter.ts` L196–201; `HEYGEN_AVATAR_ENGINE`); forbidden `avatar_iv`/`avatar_v` asserted (`assertNoForbiddenEngine`); tests 4–6. Image path correctly omits `engine` (CONTRACT discriminant). |
| Same consent, budget, download-and-own, webhook/polling security rules as US-8.2 | **PASS** | Gate order on HeyGen action: estimate → `assertReelBudgetAllowsEstimatedSpend` → `assertActiveAvatarConsentForJobs` (own_avatar) → `adapter.createJob` (`create-heygen-talking-head-video-job.ts` L366–394); mirrored on high-tier orchestrator path (`create-talking-head-video-job.ts` budget/consent before create). Test case 7 spies budget+consent before createJob. Download-and-own: `fetchAsset` → `validateProviderOutputUrl` + download → `uploadGeneratedVideo` flat `{uuid}.mp4` (`heygen-high-adapter.ts` L541–590; `upload-generated-video-buffer.ts` L20–26). Poll-only V1: no HeyGen webhook Route Handler (grep); reuses US-8.4 poller. Hosts: `HEYGEN_ALLOWED_OUTPUT_HOSTS` distinct from Replicate (`heygen-high.ts` L52–57); SSRF reject test 7. |
| Operator-only for fallback trigger; clients cannot request HeyGen directly | **PASS** | `requireOperator("handler")` first on preview + create (`create-heygen-talking-head-video-job.ts` L162, L231). Cliente → 403: test case 5. Forbidden client authority keys → `FORBIDDEN_FIELDS` (L242–243; test case 8 with `provider_key` + `engine`). Server forces `provider_key = heygen_high` / `provider_tier = high` on INSERT (L409–410). FE lives under Operator layout (`app/(app)/operator/layout.tsx` `requireOperator("page")`); control mounted only on operator scripts page. No client `provider_key`/`engine`/`tier` fields in Dialog submit body. |

---

### Convention Compliance

| Check | Status | Evidence |
|-------|--------|----------|
| EN + ES user-facing strings | **PASS** | `messages/en.json` + `messages/es.json` § `scripts.heygen.*` (button, confirm, paths, blocked, errors). Wired via `app/(app)/operator/scripts/page.tsx` → `ScriptsPageView`. |
| Server Components default; minimal `"use client"` | **PASS** | Dialog/control is client island (`HeygenGenerateConfirmDialog.tsx` L1). Adapter + orchestrator `import "server-only"`. Actions re-export from `"use server"` boundary (`lib/video-jobs/actions/create-heygen-talking-head-video-job.ts`). |
| PrimeReact-first UI | **PASS** | `Dialog`, `Button`, `Message`, `ProgressSpinner` in `HeygenGenerateConfirmDialog.tsx`. |
| Loading / empty / error / pending states | **PASS** | Preview loading spinner; ineligible/blocked Message; submit pending; error mapping for HEYGEN_* / budget / consent / forbidden (`HeygenGenerateConfirmDialog.tsx`). |
| Auth / identity | **PASS** | Operator gates; no Supabase client imports in FE; identity via `requireOperator` / `getCurrentUser` seam. |
| Backend maps to frontend consumer | **PASS** | `previewHeygenTalkingHeadEstimate` + `createHeygenTalkingHeadVideoJob` → Operator “Generate with HeyGen” confirm dialog. No speculative public HeyGen HTTP API. |
| Contract frozen shapes | **PASS** | Constants in `lib/contracts/heygen-high.ts`; request/success/preview + override schemas in `lib/contracts/video-job.ts`; rationale `operator_heygen_fallback` in `lib/contracts/providers.ts`. Flat storage keys per CONTRACT README amendment (not hierarchical). Registry uses `createHeygenHighAdapter` (not stub) in `create-provider-registry.ts` L78–87. |
| `neuramark_` schema prefix | **PASS** | Migration updates `neuramark_provider_catalog`; creates `neuramark_video_job_heygen_fallback_overrides` + index + RLS deny-by-default. |

---

### Security Acceptance Criteria (SECURITY.md)

| Area | Status | Evidence |
|------|--------|----------|
| Anti–API-key-leakage | **PASS** | Key loaded in adapter only; missing → `PROVIDER_CONFIG_MISSING` before fetch (test 2); sanitization of key material (test 8); `server-only` (test 9). |
| Anti–silent-low-default / no silent fallback | **PASS** | Policy + retry tests 2, 9, 10. |
| Anti–Avatar-IV footgun | **PASS** | Tests 4–6; `HEYGEN_AVATAR_ENGINE`. |
| Anti–fallback-abuse | **PASS** | `requireOperator` + eligibility + audit table; Cliente 403 (tests 4–6). |
| Anti–provider smuggling | **PASS** | `FORBIDDEN_FIELDS` (test 8). |
| Anti–SSRF output/input | **PASS** | Allowlist + validate (test 7); owned media / server avatar id only. |
| Anti–untrusted-response / CDN-as-canonical | **PASS** | Normalizers + download-and-own (test 1 round-trip). |
| Anti–gate-bypass | **PASS** | Budget + consent before createJob (test 7). |
| Anti–module-leak / poll-only | **PASS** | `server-only`; no webhook Route Handler in story scope. |

**Note:** SECURITY.md § download hardening still mentions hierarchical `neuramark/{clientId}/{reelScriptId}/{uuid}.mp4`. CONTRACT amendment (binding) freezes **flat `{uuid}.mp4`** to match `STORAGE_KEY_REGEX`; implementation correctly follows CONTRACT via `uploadGeneratedVideoBuffer`.

---

### Dependencies

| Dependency | Status |
|------------|--------|
| US-8.1 adapter interface + registry + stub | **Satisfied** — stub replaced by real adapter in registry bootstrap. |
| US-X.4 catalog seed `heygen_high` | **Satisfied** — Phase B migration activates + corrects cost_model. |
| US-8.2 consent/budget/download-and-own | **Satisfied** — same gate order + fetchAsset pattern. |
| US-8.4 jobs + poller + retry UI | **Satisfied** — reuse poller/status; FE mounts beside US-8.4 panels. |
| US-8.6 allowlist extension pattern | **Satisfied** — `heygen_high` added to talking-head allowlist. |
| US-7.1 / US-7.2 budget + tier floor | **Satisfied** — gates + low-never-heygen tests. |
| US-3.2 / US-3.3 consent + avatar assets | **Satisfied** — consent on own_avatar; owned media resolution. |
| US-5.1 reel script | **Satisfied** — script package duration / visual mode. |

---

### Gaps (what blocks PASS)

None. All five USER_STORIES acceptance criteria are met with Phase A + Phase B implementation and automated coverage matching CONTRACT test matrices.

---

### Scope Creep

None identified. No Avatar IV/V catalog/UI, no HeyGen webhook, no new `neuramark_video_jobs` columns, no live HeyGen CI, no client-facing provider picker. Stub factory file may remain for unrelated suites; production bootstrap registers real adapter only.

---

### Notes (non-blocking — PASS WITH NOTES rationale)

1. **TASKS.md / README gate drift:** Story folder still shows BUILD Phase A/B and VALIDATION checkboxes unchecked / “BUILD pending” in places, despite commits `299d638` + `a18d4cb`. Documentation sync only — not an AC failure.
2. **SECURITY vs CONTRACT storage key wording:** SECURITY hierarchical key text is superseded by CONTRACT flat-key amendment; code matches CONTRACT.
3. **Interim auth tenancy:** `createHeygenTalkingHeadVideoJob` rejects when `input.clientId !== operator.id` (same interim hardcoded-operator-as-client pattern as adjacent video jobs). Acceptable until multi-client operator auth stories land; QA should not expect cross-client Operator create under current hardcode.

---

### Recommended Next Actions

| Action | Owner |
|--------|-------|
| QA: Operator scripts expand — high-tier path + failed-low fallback path; Cliente cannot invoke; estimate confirm; EN/ES | **qa-engineer** |
| QA: Confirm catalog migration applied in target env (`heygen_high.active`, unitCostCents 2) | **qa-engineer** |
| Sync TASKS.md / README gate checkboxes to shipped A+B | **implementing agent** or **product-owner** |
| PO: check off AC in `USER_STORIES.md` after reviewing this report | **product-owner** |

---

### Test run (validator)

```text
npx tsx --test \
  lib/providers/video/heygen-high-adapter.test.ts \
  lib/video-jobs/create-heygen-talking-head-video-job.test.ts

▶ US-8.7 HeyGen adapter — 10 pass
▶ US-8.7 Phase B — HeyGen unlock + fallback — 10 pass
ℹ tests 20 · pass 20 · fail 0
```
