## QA Report — US-8.3 Manual video upload fallback

**Branch:** `feature/US-8.3-manual-upload`  
**Reviewed at:** `b2fb1cc` (post BLOCK remediation — config constants + mp4box types)  
**Prior review:** `0980dbe` — BLOCK (next.config import chain)  
**Sources:** `VALIDATION.md` · `CONTRACT.md` · `SECURITY.md` · implementation on feature branch

### Verdict: APPROVE WITH CONDITIONS

Both prior **High** build blockers are **resolved**: `f3f78af` extracts config-safe constants for `next.config.ts`; `b2fb1cc` adds `types/mp4box.d.ts` and fixes `requireOperator("handler")` GuardMode typing. US-8.3 implements the frozen CONTRACT end-to-end with sound Operator gates, shared validation, zero-cost spend, attribution, and FE wiring. Automated US-8.3 tests pass. **`AUTH_DEV_FALLBACK= npm run build` succeeds** (production-safe env; local `.env` dev flag failure is pre-existing US-14.5 intended behavior, not a US-8.3 defect).

**Conditions:** Address Finding 3 (spend finalize rollback) and Finding 4 (consent gate test) before or immediately after merge — recommended pre-merge hardening, not deploy blockers.

---

### Findings

#### 1. RESOLVED — `next.config.ts` import broke build (prior High)

**Files:** `next.config.ts:2`, `lib/contracts/manual-video-upload-constants.ts`

**Status:** **Fixed** at `f3f78af`. `next.config.ts` imports `MANUAL_UPLOAD_SERVER_ACTION_BODY_LIMIT` from the leaf constants module (zero imports, no `@/` aliases, no Zod). Next.js compile step succeeds.

---

#### 2. RESOLVED — `mp4box` missing TypeScript declarations (prior High)

**Files:** `types/mp4box.d.ts`, `lib/media/probe-video-duration.ts:9`, `lib/video-jobs/actions/upload-manual-video-job.ts`

**Status:** **Fixed** at `b2fb1cc`. Minimal `declare module "mp4box"` shim committed; upload action uses `requireOperator("handler")` for GuardMode compatibility. Type-check phase in `npm run build` succeeds.

---

#### 3. Medium — Spend finalize failure leaves orphaned completed job

**File:** `lib/video-jobs/upload-manual-video-job.ts:255–272`

**What is wrong:** If `finalizeGenerationCost` fails after job and media INSERTs succeed, the orchestrator returns `INTERNAL_ERROR` without compensating deletes. The slot now has a `completed` manual job (blocking further uploads per slot guard) but no `spend_event_id`.

**Why it matters:** Operator sees a generic error; reel slot is stuck in `SLOT_COMPLETED_JOB_EXISTS` on retry; spend ledger is inconsistent. SECURITY § sync orchestrator expects atomic success path; media/job rollback exists for earlier failures but not here.

**Recommended fix:** On spend failure, best-effort delete job row + media row + storage blob (mirror steps 233–246 pattern), or wrap inserts + spend in a transaction with explicit rollback policy documented in CONTRACT.

---

#### 4. Medium — Missing automated test for consent gate on manual upload

**File:** `lib/video-jobs/upload-manual-video-job.test.ts` (gap); orchestrator gate at `upload-manual-video-job.ts:114–118`

**What is wrong:** SECURITY.md test matrix requires `own_avatar` + revoked consent → blocked. Mock infrastructure supports `hasConsent: false`, but no test asserts `CONSENT_REVOKED` from the orchestrator when `visualMode === 'own_avatar'`.

**Why it matters:** Cost bypass must not bypass consent (SECURITY §6). Regression could slip through unnoticed.

**Recommended fix:** Add orchestrator test with `loadReelScript` returning `own_avatar` and `hasConsent: false`; assert `error.code === 'CONSENT_REVOKED'`.

---

#### 5. Low — Serve route ownership tied to operator session id, not reel owner

**File:** `app/api/media/assets/[assetId]/route.ts:132–134`

**What is wrong:** `generated_video` serve checks `row.client_id !== operator.id`. Media rows store reel-owner `client_id`. CONTRACT names `$scriptsPageClientId`; V1 operator scripts resolve `clientId = operator.id` (`get-reel-scripts-for-week.ts`), so current flow works.

**Why it matters:** Multi-client Operator impersonation would 404 on preview even for legitimately uploaded assets. Out of US-8.3 V1 scope but should be tracked for operator multi-tenancy.

**Recommended fix:** Follow-up story: serve check against scripts-page client context or join through reel ownership, not operator session id alone.

---

#### 6. Low — Concurrent upload TOCTOU on slot guard

**File:** `lib/video-jobs/upload-manual-video-job.ts:100–112`, `213–231`

**What is wrong:** Slot guard reads latest job then INSERTs without serializable transaction or unique partial index on `(reel_script_id, asset_role)` for non-terminal states. Two parallel uploads could both pass the guard.

**Why it matters:** Rare Operator double-submit could create duplicate completed jobs for one slot. CONTRACT mentions UNIQUE constraint fallback — no such constraint observed on primary slot.

**Recommended fix:** P1: DB unique partial index or advisory lock; short term: accept risk with Operator-only surface.

---

#### 7. Low — Pre-existing US-3.3 delete test failure in combined media suite

**File:** `lib/media/media-assets.test.ts:644` (`deleteAvatarReferenceAsset`)

**What is wrong:** Mock Supabase `from()` lacks `neuramark_video_jobs` stub for `isAvatarReferenceAssetReferencedByJob`; gate fail-closes to referenced → delete blocked.

**Why it matters:** Unrelated to US-8.3 deliverables; US-8.3 `generated_video` serve test passes. Combined suite reports 48/49.

**Recommended fix:** Extend delete test mock per VALIDATION.md note (nextjs-backend).

---

#### Note — `AUTH_DEV_FALLBACK` vs `next build` (not a finding)

`npm run build` with local `.env` containing `AUTH_DEV_FALLBACK=true` fails at page-data collection with `AUTH_DEV_FALLBACK must not be set when NODE_ENV=production` (US-14.5 intended fail-closed guard). **`AUTH_DEV_FALLBACK= npm run build` passes.** Vercel production/preview must omit the flag — same pattern documented in US-8.4/US-14.5 QA.

---

### Security & contract compliance (passing)

| Area | Result | Evidence |
|------|--------|----------|
| Operator-only gate | **PASS** | `requireOperator('action')` first in action (`actions/upload-manual-video-job.ts:25–30`); page layout `requireOperator("page")` |
| Forbidden client authority | **PASS** | Merged forbidden keys (`find-forbidden-manual-upload-keys.ts`); test rejects `status` in FormData |
| Shared US-3.3 validator (no fork) | **PASS** | `validateAndPrepareMediaUpload` union branch (`upload-validation.ts:295–301`); mp4/mov magic + duration probe |
| Zero-cost budget bypass | **PASS** | No `assertVideoJobBudgetAllowsSpend`; `estimated/actual_cost_cents: 0`; `finalizeGenerationCost` with `manualActualCostCents: 0` |
| Attribution | **PASS** | `operator_client_id` from session only; DB CHECK migration |
| No poller / no QA skip | **PASS** | No `enqueueVideoJobPoll` in orchestrator; `skipQa`/`autoApprove` in forbidden keys |
| IDOR on reel slot | **PASS** | `loadReelScriptForVideoJob` tenancy; test foreign client → `NOT_FOUND` |
| Manual adapter sync-only | **PASS** | Vendor I/O throws `MANUAL_UPLOAD_SYNC_ONLY`; registry test passes |
| Client bundle leakage | **PASS** | No `@supabase/supabase-js` in Client Components; FE calls Server Action only |
| Success DTO shape | **PASS** | `uploadManualVideoJobSuccessSchema` validation in tests; no `storage_key` in mapper |
| `neuramark_` prefix | **PASS** | Migration `neuramark_video_jobs_operator_client_id` |
| Config-safe body limit | **PASS** | `next.config.ts` → `manual-video-upload-constants.ts` (leaf, no Zod graph) |
| Production build | **PASS** | `AUTH_DEV_FALLBACK= npm run build` — Next.js 15.5.20; `/operator/scripts` compiles |

---

### Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/video-jobs/upload-manual-video-job.test.ts lib/providers/video/manual-upload-adapter.test.ts lib/media/media-assets.test.ts lib/video-jobs/video-jobs.test.ts` | **48/49 pass** — all US-8.3 suites pass; 1 pre-existing US-3.3 delete failure |
| `AUTH_DEV_FALLBACK= npm run build` | **PASS** — compile + type-check + page data; `/operator/scripts` dynamic route present |
| `npm run build` (local `.env` with `AUTH_DEV_FALLBACK=true`) | **FAIL** at page-data — pre-existing US-14.5 guard; **not a US-8.3 defect** |
| `npm run lint` | **PASS** (exit 0) — pre-existing test-file `no-require-imports` violations remain project-wide |
| `npx tsc --noEmit` | **Not clean** — pre-existing test-file errors project-wide; US-8.3 app modules not isolated |

---

### What Was Not Covered

- Manual browser E2E upload on `/operator/scripts` (file picker, toast, batch map merge).
- Real Supabase integration / migration apply against remote project.
- Load test for 50 MiB multipart Server Action on Vercel.
- Malware scanning (accepted residual per SECURITY.md).
- Multi-client Operator serve/upload scenarios.

---

### CLOSE recommendation: **YES**

Both build blockers are closed. PO may **CLOSE** US-8.3. Track Findings 3–4 as follow-up hardening (recommended before or immediately after merge). Findings 5–7 are documented V1 limitations aligned with VALIDATION notes.

---

*Re-QA 2026-08-30 — qa-engineer (post f3f78af + b2fb1cc remediation).*
