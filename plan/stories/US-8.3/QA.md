## QA Report — US-8.3 Manual video upload fallback

**Branch:** `feature/US-8.3-manual-upload`  
**Reviewed at:** `2f5edc0` (VALIDATION PASS WITH NOTES) · HEAD includes docs-only commits after validation  
**Sources:** `VALIDATION.md` · `CONTRACT.md` · `SECURITY.md` · implementation on feature branch

### Verdict: BLOCK

US-8.3 implements the frozen CONTRACT end-to-end with sound Operator gates, shared validation, zero-cost spend, attribution, and FE wiring. Automated US-8.3 tests pass. **Production build is broken** by `next.config.ts` importing a Zod-heavy contract module — this blocks Vercel deploy and must be fixed before CLOSE.

---

### Findings

#### 1. High — `next.config.ts` import breaks production build

**File:** `next.config.ts:2`, `lib/contracts/manual-video-upload.ts:7`

**What is wrong:** `next.config.ts` imports `MANUAL_UPLOAD_SERVER_ACTION_BODY_LIMIT` from `lib/contracts/manual-video-upload.ts`. That module transitively imports `@/lib/contracts/video-job` (Zod schemas). Next.js compiles `next.config.ts` without full `@/` alias resolution for nested imports, causing:

```
Error: Cannot find module './lib/contracts/video-job'
```

**Why it matters:** `npm run build` and `npm run lint` both fail. Vercel deploy cannot succeed. CONTRACT § Transport requires the 52mb body limit, but the constant must live in a config-safe module (no Zod / `@/` graph).

**Recommended fix:** Extract `MANUAL_UPLOAD_SERVER_ACTION_BODY_LIMIT` (and optionally other display constants) to a leaf file such as `lib/contracts/manual-video-upload-constants.ts` with zero imports, and import that from both `next.config.ts` and the full contract module. Alternatively inline `"52mb"` in `next.config.ts` and document parity with the contract constant in a comment.

---

#### 2. Medium — Spend finalize failure leaves orphaned completed job

**File:** `lib/video-jobs/upload-manual-video-job.ts:255–272`

**What is wrong:** If `finalizeGenerationCost` fails after job and media INSERTs succeed, the orchestrator returns `INTERNAL_ERROR` without compensating deletes. The slot now has a `completed` manual job (blocking further uploads per slot guard) but no `spend_event_id`.

**Why it matters:** Operator sees a generic error; reel slot is stuck in `SLOT_COMPLETED_JOB_EXISTS` on retry; spend ledger is inconsistent. SECURITY § sync orchestrator expects atomic success path; media/job rollback exists for earlier failures but not here.

**Recommended fix:** On spend failure, best-effort delete job row + media row + storage blob (mirror steps 233–246 pattern), or wrap inserts + spend in a transaction with explicit rollback policy documented in CONTRACT.

---

#### 3. Medium — Missing automated test for consent gate on manual upload

**File:** `lib/video-jobs/upload-manual-video-job.test.ts` (gap); orchestrator gate at `upload-manual-video-job.ts:114–118`

**What is wrong:** SECURITY.md test matrix requires `own_avatar` + revoked consent → blocked. Mock infrastructure supports `hasConsent: false`, but no test asserts `CONSENT_REVOKED` from the orchestrator when `visualMode === 'own_avatar'`.

**Why it matters:** Cost bypass must not bypass consent (SECURITY §6). Regression could slip through unnoticed.

**Recommended fix:** Add orchestrator test with `loadReelScript` returning `own_avatar` and `hasConsent: false`; assert `error.code === 'CONSENT_REVOKED'`.

---

#### 4. Low — Serve route ownership tied to operator session id, not reel owner

**File:** `app/api/media/assets/[assetId]/route.ts:132–134`

**What is wrong:** `generated_video` serve checks `row.client_id !== operator.id`. Media rows store reel-owner `client_id`. CONTRACT names `$scriptsPageClientId`; V1 operator scripts resolve `clientId = operator.id` (`get-reel-scripts-for-week.ts`), so current flow works.

**Why it matters:** Multi-client Operator impersonation would 404 on preview even for legitimately uploaded assets. Out of US-8.3 V1 scope but should be tracked for operator multi-tenancy.

**Recommended fix:** Follow-up story: serve check against scripts-page client context or join through reel ownership, not operator session id alone.

---

#### 5. Low — Concurrent upload TOCTOU on slot guard

**File:** `lib/video-jobs/upload-manual-video-job.ts:100–112`, `213–231`

**What is wrong:** Slot guard reads latest job then INSERTs without serializable transaction or unique partial index on `(reel_script_id, asset_role)` for non-terminal states. Two parallel uploads could both pass the guard.

**Why it matters:** Rare Operator double-submit could create duplicate completed jobs for one slot. CONTRACT mentions UNIQUE constraint fallback — no such constraint observed on primary slot.

**Recommended fix:** P1: DB unique partial index or advisory lock; short term: accept risk with Operator-only surface.

---

#### 6. Low — Pre-existing US-3.3 delete test failure in combined media suite

**File:** `lib/media/media-assets.test.ts:644` (`deleteAvatarReferenceAsset`)

**What is wrong:** Mock Supabase `from()` lacks `neuramark_video_jobs` stub for `isAvatarReferenceAssetReferencedByJob`; gate fail-closes to referenced → delete blocked.

**Why it matters:** Unrelated to US-8.3 deliverables; US-8.3 `generated_video` serve test passes. Combined suite reports 48/49.

**Recommended fix:** Extend delete test mock per VALIDATION.md note (nextjs-backend).

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

---

### Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/video-jobs/upload-manual-video-job.test.ts lib/providers/video/manual-upload-adapter.test.ts lib/media/media-assets.test.ts lib/video-jobs/video-jobs.test.ts` | **48/49 pass** — all US-8.3 suites pass; 1 pre-existing US-3.3 delete failure |
| `npm run build` | **FAIL** — `next.config.ts` → `Cannot find module './lib/contracts/video-job'` |
| `npm run lint` | **FAIL** — same `next.config.ts` import chain |
| `npx tsc --noEmit` | **Not clean** — pre-existing test-file errors project-wide; US-8.3 app modules not isolated |

---

### What Was Not Covered

- Manual browser E2E upload on `/operator/scripts` (file picker, toast, batch map merge).
- Real Supabase integration / migration apply against remote project.
- Load test for 50 MiB multipart Server Action on Vercel.
- Malware scanning (accepted residual per SECURITY.md).
- Multi-client Operator serve/upload scenarios.

---

### CLOSE recommendation: **NO**

Fix **Finding 1 (build blocker)** before PO CLOSE. Findings 2–3 are recommended pre-merge hardening but do not alone justify indefinite hold once build is green. Finding 4 is a documented V1 limitation aligned with VALIDATION notes.

After build fix + re-run `npm run build`, re-QA or spot-check config import only, then **CLOSE** is appropriate.

---

*QA review 2026-08-30 — qa-engineer.*
