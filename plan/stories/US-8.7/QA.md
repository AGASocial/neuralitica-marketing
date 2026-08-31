# QA Report — US-8.7 HeyGen adapter

**Story:** US-8.7 — HeyGen adapter (high tier / operator fallback, P1)  
**Branch:** `feature/US-8.7-heygen-adapter`  
**Commits reviewed:** `a118936` … `602995c` (through VALIDATION); implementation focus `299d638` (BE) · `a18d4cb` (FE)  
**Reviewed:** 2026-08-31  
**Reviewer:** qa-engineer  
**Sources:** `plan/stories/US-8.7/{CONTRACT,SECURITY,VALIDATION,TASKS}.md`, `lib/contracts/heygen-high.ts`, `lib/providers/video/heygen-high-adapter.ts`, `lib/video-jobs/create-heygen-talking-head-video-job.ts`, `lib/video-jobs/create-talking-head-video-job.ts`, `components/scripts/HeygenGenerateConfirmDialog.tsx`, migration `20260831080000_neuramark_heygen_high_activate.sql`

### Verdict: APPROVE WITH CONDITIONS

**Severity counts:** Critical **0** · High **0** · Medium **2** · Low **4**  
**CLOSE recommended:** **Yes** for merge — no Critical/High blockers. Address **M1–M2** as follow-up hardening before treating budget/fallback durability as fully closed; Low items are backlog.

Phase A (real adapter + registry + mocked HTTP) and Phase B (catalog activate, orchestrator unlock, operator fallback + FE) match CONTRACT and SECURITY’s **12** conditions at the control level. Automated security matrix is covered (20/20 tests). Residual issues are estimate-duration authority and a failure-path durability gap after vendor create.

---

## Findings

### Medium

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| **M1** | `create-heygen-talking-head-video-job.ts:334,361` (create path); contrast preview `189–190` | Create uses **client** `targetDurationSec` for `estimateCost` → budget → spend. Preview falls back to `script.package.targetDurationSec`; create does not re-bind to the package. CONTRACT: estimate drivers = server duration from reel package; SECURITY test matrix item (11): server duration, not client cost drivers. | Operator (or any caller of the Server Action) can understate duration to pass `assertReelBudgetAllowsEstimatedSpend` with an understated estimate while HeyGen still bills on real audio length — weakens anti–gate-bypass for a high unit-cost provider. Blast radius limited to Operator-gated path. | Derive duration from `script.package.targetDurationSec` (optionally clamp/reject client value if it diverges); keep `confirmEstimateCents` non-authoritative. Add a unit test that client `targetDurationSec: 1` cannot shrink the server estimate below package duration. |
| **M2** | `create-heygen-talking-head-video-job.ts:394–448` | Order is `adapter.createJob` → INSERT job → INSERT fallback override. If override INSERT fails, handler returns `INTERNAL_ERROR` **before** `recordReelSpendEvent` / `enqueueVideoJobPoll`. | Vendor job already exists; DB job row exists; no spend event and **no poll** → stuck high-cost job, Operator sees failure, download-and-own never runs. Rare (DB fault) but expensive. | On override failure: still enqueue poll + record spend (log override failure), **or** insert override in the same transaction as the job row, **or** compensate/cancel vendor job. Prefer “job + poll succeed; audit best-effort with alert” over aborting mid-pipeline. |

### Low

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| **L1** | `previewHeygenTalkingHeadEstimate` (`156–224`) | Preview does **not** enforce `clientId === operator.id` (create does at `252–254`). | With interim hardcoded operator-as-client this is inert; after multi-client operator auth, preview could leak eligibility/estimate for another tenant. | Mirror create’s tenancy check on preview. |
| **L2** | `create-heygen-talking-head-video-job.ts:394–427` | Vendor `createJob` before durable job INSERT (same pattern as US-8.2/8.4 talking-head create). | INSERT failure after successful HeyGen create orphans a billable vendor job with no poll row. | Accept as inherited residual, or insert `queued` placeholder / compensate on insert failure in a later story. |
| **L3** | `heygen-high-adapter.ts` + `resolve-media-asset-url-for-provider.ts` | CONTRACT freezes `HEYGEN_PORTRAIT_MIME_ALLOWLIST` / `HEYGEN_AUDIO_MIME_ALLOWLIST` / `HEYGEN_INPUT_URL_TTL_SEC`; adapter resolves via kind `"portrait"` \| `"audio"` (SadTalker/MuseTalk lists). Values are currently identical (300s TTL; same MIME sets). | Drift risk if HeyGen allowlists diverge later without adapter wiring. | Pass `allowedMimeTypes: HEYGEN_*` and `ttlSec: HEYGEN_INPUT_URL_TTL_SEC` into `resolveMediaAssetUrlForProvider`, or document intentional shared lists. |
| **L4** | `heygen-high-adapter.test.ts` (tsc); `create-heygen-talking-head-video-job.test.ts` (eslint `no-require-imports`) | Test harness typing / `require()` dynamic imports fail project-wide `tsc` / lint patterns (pre-existing style in sibling suites). | No production compile break for US-8.7 sources; noise only. | Align with team’s preferred test import pattern when cleaning suites. |

### Informational (not findings)

| Topic | Notes |
|-------|--------|
| Hardcoded local user | Sanctioned per `AGENTS.md` — not a finding. |
| SECURITY storage key wording | SECURITY hierarchical path superseded by CONTRACT flat `{uuid}.mp4`; implementation matches CONTRACT via `uploadGeneratedVideoBuffer`. |
| Stub factory | `heygen-high-stub-adapter.ts` remains for unrelated suites; production bootstrap registers `createHeygenHighAdapter` only. |
| No dependency / lockfile changes | No new npm packages in story diff. |

---

## SECURITY conditions (12) — verification

| # | Condition | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Anti–API-key-leakage | **PASS** | Key loaded only in `heygen-high-adapter.ts` via `HEYGEN_ENV_KEY_NAME`; `X-Api-Key`; missing → `PROVIDER_CONFIG_MISSING` before fetch; `readResponseErrorMessage` redacts key + `sanitizeProviderErrorMessage`; closed DTOs; test 2, 8. No `NEXT_PUBLIC_*` HeyGen env. |
| 2 | Anti–silent-low-default | **PASS** | Phase B test 2; `resolveProviderForJob` tier floor unchanged; catalog `active` does not select heygen on low. |
| 3 | Anti–silent-fallback | **PASS** | No auto path; retry inherits parent key (`retry-video-job.ts`); tests 9–10; only `createHeygenTalkingHeadVideoJob`. |
| 4 | Anti–Avatar-IV footgun | **PASS** | Avatar body always `engine: { type: "avatar_iii" }`; image body omits engine (CONTRACT discriminant); `assertNoForbiddenEngine`; tests 4–6. |
| 5 | Anti–fallback-abuse | **PASS** | `requireOperator("handler")` first on preview + create; eligibility `high_tier` \| failed low parent; Cliente → 403 (test 5); audit table INSERT with `operator_heygen_fallback` (test 4). |
| 6 | Anti–provider smuggling | **PASS** | `FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS` includes provider/engine/avatar/URL/cost drivers; `findForbiddenVideoJobKeys` → `FORBIDDEN_FIELDS` (test 8); server forces `heygen_high` / `high` on INSERT. |
| 7 | Anti–SSRF (output) | **PASS** | `HEYGEN_ALLOWED_OUTPUT_HOSTS` distinct from Replicate; `validateProviderOutputUrl` in status + fetch + redirect loop; test 7. |
| 8 | Anti–SSRF (input) | **PASS** | Owned media via `resolveMediaAssetUrlForProvider` / ownership checks; studio `avatar_id` from `HEYGEN_DEFAULT_AVATAR_ID` only; forbidden client URL keys in schema. |
| 9 | Anti–untrusted-response | **PASS** | `normalizeVideoJobStatusResult` + `parseExternalJobId` + sanitize; no raw vendor JSON persist. |
| 10 | Anti–CDN-as-canonical | **PASS** | `fetchAsset` download-and-own → flat `{uuid}.mp4`; `rawOutputUrl` transient only. |
| 11 | Anti–gate-bypass | **PASS with note** | Gate order estimate → budget → consent → `createJob` on both high-tier orchestrator and HeyGen action (test 7). **Note:** M1 — duration used for estimate is client-supplied on create; budget runs, but estimate authority is weaker than CONTRACT wording. |
| 12 | Anti–module-leak | **PASS** | `import "server-only"` on adapter + action module; FE imports `"use server"` re-exports only; HeyGen HTTP under `lib/providers/**`; no HeyGen webhook Route Handler (grep `app/**`). |

**BUILD vetoes spot-check:** None triggered (key not in client bundle; engine not omitted on avatar; low never selects heygen; no silent fallback; `requireOperator` present; no client authority fields; allowlist + validate; owned inputs; download-and-own; gates before create; registry uses real adapter; poll-only; security tests present).

---

## CONTRACT compliance (spot-check)

| Item | Status |
|------|--------|
| Real `createHeygenHighAdapter` + registry swap | **PASS** |
| `lib/contracts/heygen-high.ts` frozen constants | **PASS** |
| v3 create/get paths + `X-Api-Key` | **PASS** |
| Cost `per_second` × 2¢; estimate 30×2=60 | **PASS** (test 3) |
| Phase B migration activate + cost_model + override table + RLS | **PASS** |
| Allowlist unlock includes `heygen_high` | **PASS** |
| Operator action + preview + FE dialog EN/ES | **PASS** |
| Dual path high_tier / operator_fallback | **PASS** |
| Flat storage keys | **PASS** |
| Poll-only V1 (no webhook) | **PASS** |
| Server duration for estimate | **PARTIAL** — see **M1** |
| Override audit durability on failure | **PARTIAL** — see **M2** |

---

## Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/providers/video/heygen-high-adapter.test.ts lib/video-jobs/create-heygen-talking-head-video-job.test.ts` | **20/20 pass** |
| `npx tsc --noEmit` (filter US-8.7 **production** sources) | **PASS** — no errors in adapter / create-heygen / contracts / registry / FE |
| `npx tsc --noEmit` (US-8.7 **test** files) | Noise: `never` property access / `unknown` err in `heygen-high-adapter.test.ts` (L4) |
| `npm run lint` | Pre-existing / harness `no-require-imports` in US-8.7 test file and siblings — not production blockers |
| Grep: HeyGen webhook / `app/**/route` HeyGen | **0** Route Handlers |
| Grep: `NEXT_PUBLIC` / client `HEYGEN_API_KEY` | **PASS** — key only in server adapter/tests |
| Grep: production `createHeygenHighStubAdapter` registration | **PASS** — stub unused in `create-provider-registry.ts` |
| Grep: FE submit body authority fields | **PASS** — dialog sends reel/client/duration/assets/confirmEstimate only |

---

## What Was Not Covered

- Live HeyGen API / real `HEYGEN_API_KEY` E2E (out of scope per CONTRACT).
- Applying migration against a live Supabase project (SQL reviewed; not executed in this QA run).
- Full `npm run build` / Playwright Operator UI walkthrough (unit + static review only).
- Concurrent double-submit race on fallback eligibility (no unique constraint) — accepted as Low residual similar to US-8.4 concurrency notes; not separately filed.
- Browser bundle inspection for accidental key leakage (static import graph is clean).

---

## Gate summary

| Field | Value |
|-------|--------|
| **Verdict** | **APPROVE WITH CONDITIONS** |
| **Critical / High** | **0 / 0** |
| **Medium / Low** | **2 / 4** |
| **Merge** | Allowed |
| **Conditions for full close** | **M1** server-authoritative duration for estimate/budget; **M2** do not abandon poll/spend when override audit INSERT fails |
