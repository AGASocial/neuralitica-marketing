# QA Report — US-8.6 MuseTalk adapter (feature/US-8.6-musetalk-adapter @ 798635e)

**Reviewer:** qa-engineer  
**Date:** 2026-08-30  
**Scope:** Phase A MuseTalk adapter + registry; Phase B orchestrator unlock, loop resolver, asset resolver kind seam; security acceptance vs frozen `CONTRACT.md` / `SECURITY.md`; validation cross-check at `798635e`.

### Verdict: APPROVE WITH CONDITIONS

V1-scoped BUILD is production-safe for the MuseTalk loop path. All binding SECURITY conditions from `SECURITY.md` are implemented and covered by automated tests. No Critical or High findings. Two Low hardening notes and one inherited product deferral remain; none block V1 story close.

**CLOSE recommendation:** **YES** — close US-8.6 for V1 scope. Do not check off the full USER_STORIES AC #1 operator-override clause until P1 lands (per frozen CONTRACT phased acceptance).

---

### Findings

#### Low — Retry does not assert `provider_key` consistency after policy re-resolve

**File:** `lib/video-jobs/create-talking-head-video-job.ts` (L146–155, L186–190); `lib/video-jobs/actions/retry-video-job.ts` (L248–263)

**What:** On retry, `createTalkingHeadVideoJob` re-runs `resolveProviderForJob` but reuses `options.portraitAssetId` from the failed job row without comparing stored `failedJob.provider_key` to the newly selected provider. If catalog/policy changes between fail and retry (e.g. loop removed → SadTalker selected while options still carry a loop video id), the orchestrator may pass the wrong asset shape into the adapter branch.

**Why it matters:** Not an IDOR or client-authority bypass — assets still come from the tenant-scoped failed row — but a policy flip could produce a confusing failure or wasted vendor call instead of an explicit `JOB_NOT_RETRYABLE` / provider-mismatch error.

**Mitigation today:** Adapter MIME gates fail closed (`resolveMediaAssetUrlForProvider` rejects portrait/video kind mismatch; SadTalker rejects `referenceVideoAssetId`; MuseTalk rejects portrait fields).

**Recommended fix direction:** Before building `resolvedInput` on retry paths, compare `failedJob.provider_key` (pass via options) to `providerKey` from policy; return `JOB_NOT_RETRYABLE` or re-resolve assets when they diverge.

---

#### Low — `TASKS.md` Phase A checkboxes stale (doc hygiene)

**File:** `plan/stories/US-8.6/TASKS.md`

**What:** Phase B items are marked complete while Phase A BE checklist entries remain `[ ]` despite shipped adapter/registry code.

**Why it matters:** Does not affect runtime security or correctness; creates planning drift for downstream agents.

**Recommended fix direction:** PO or implementer updates Phase A checkboxes to match BUILD reality (non-blocking).

---

#### Note (non-finding) — Operator SadTalker↔MuseTalk override deferred to P1

**Source:** Frozen `CONTRACT.md` § Phased acceptance; `VALIDATION.md` note #1

**What:** USER_STORIES AC #1 second clause (operator-configured low-tier alternative) is intentionally out of V1 BUILD scope.

**Action:** Track as P1 follow-up; do not treat as a QA defect for US-8.6 close.

---

### Security review (binding criteria)

| Criterion | Result | Evidence |
|-----------|--------|----------|
| Server-only loop resolution; client `referenceVideoAssetId` forbidden | **PASS** | `FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS` includes `referenceVideoAssetId` (`lib/contracts/video-job.ts` L74–75); `findForbiddenVideoJobKeys` gate (`create-talking-head-video-job.ts` L71–73); orchestrator resolves via `getPrimaryReferenceLoopVideoAssetForClient` (L148–154); test “rejects client referenceVideoAssetId with FORBIDDEN_FIELDS” |
| Dual-input SSRF — signed M1 URLs + kind MIME allowlists | **PASS** | `resolveMediaAssetUrlForProvider` kind seam (`resolve-media-asset-url-for-provider.ts` L49–60, L123–181); adapter resolves video+audio only through injectable/default resolver (`musetalk-low-adapter.ts` L310–317); tests adapter case 6 + orchestrator kind seam |
| `own_avatar` + MuseTalk rejected | **PASS** | Orchestrator guard (`create-talking-head-video-job.ts` L137–140); dedicated test |
| Orchestrator provider guard `{ sadtalker_low, musetalk_low }` | **PASS** | `isAllowedTalkingHeadProviderKey` (L46–50); no `museTalkNotSupported` in codebase |
| Input matrix fail-closed per provider | **PASS** | MuseTalk rejects portrait/reference image (`musetalk-low-adapter.ts` L79–84); SadTalker rejects `referenceVideoAssetId` (`sadtalker-low-adapter.ts` L79–84); orchestrator branches (L137–227) |
| Token hygiene + mandatory normalizers | **PASS** | `getReplicateApiToken` → `PROVIDER_CONFIG_MISSING` before fetch (L65–74, L308); `parseExternalJobId`, `normalizeVideoJobStatusResult`, `sanitizeProviderErrorMessage` on vendor I/O (L340–391); test case 5 token redaction |
| Output URL SSRF + download hardening | **PASS** | `MUSETALK_ALLOWED_OUTPUT_HOSTS`; `validateProviderOutputUrl` + redirect/timeout/byte caps (`musetalk-low-adapter.ts` L153–267, L395–443); test case 4 |
| Job row audit: MuseTalk `portrait_asset_id` = loop video id | **PASS** | INSERT L276; retry reuses via `options.portraitAssetId` (L146–147); test “retry reuses portrait_asset_id” |
| Budget + consent gate order | **PASS** | Budget L231–237 before consent L248–255 before `adapter.createJob` L257; regression in `video-jobs.test.ts` “orchestrator gate order” |
| US-3.4 non-bypass | **PASS** | No disclosure/skip-QA flags in adapter or orchestrator |
| Module boundary `server-only` | **PASS** | Adapter L1; loop resolver L1; asset resolver L1; adapter test case 7 |
| No client Supabase / token leakage | **PASS** | MuseTalk modules under `lib/providers/**` and `lib/media/**` only; `musetalk-low.ts` constants imported server-side only (grep) |
| Inherited US-8.2 / US-8.4 floors | **PASS** | Poller-only writes, IDOR poll → 404, retry forbidden fields — covered by `video-jobs.test.ts` (18/18) |

---

### Correctness review

| Area | Result | Notes |
|------|--------|-------|
| Policy routes `hasReferenceLoop` → `musetalk_low` | **PASS** | Confirmed in `resolve-provider-for-job.ts` + existing policy tests |
| Flat `{uuid}.mp4` storage keys | **PASS** | `uploadGeneratedVideoBuffer` uses `randomUUID()` flat key |
| `estimateCost` from catalog (19¢), not hardcoded in adapter body | **PASS** | Registry bootstrap + adapter L298–303 |
| MuseTalk initial create ignores client `portraitAssetId` | **PASS** | MuseTalk branch uses `options?.portraitAssetId` or server resolver only — client cannot pick alternate loop on create |
| Earliest-loop selection | **PASS** | `getPrimaryReferenceLoopVideoAssetForClient` orders `created_at ASC`, MIME filter, tenant scope |

---

### Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/providers/video/musetalk-low-adapter.test.ts lib/video-jobs/create-talking-head-video-job.test.ts lib/providers/provider-adapters.test.ts lib/video-jobs/video-jobs.test.ts` | **49/49 pass** |
| `npm run lint` | **Pre-existing failures** in unrelated test files (`require()` imports in `lib/trend/trend.test.ts`, `lib/video-jobs/video-jobs.test.ts`, etc.); **no new lint errors in US-8.6 production modules** |
| `npx tsc --noEmit` | **Pre-existing errors** in test files; US-8.6 production modules type-check in isolation via test runner |
| `npm run build` | **Failed** — `AUTH_DEV_FALLBACK must not be set when NODE_ENV=production` during page data collection (pre-existing local `.env` guard; unrelated to US-8.6 diff) |

---

### What Was Not Covered

- Live Replicate integration (explicitly out of scope per CONTRACT).
- Operator SadTalker↔MuseTalk override UI (P1 defer).
- US-9.3 full TTS orchestration E2E (fixture `voiceoverAssetId` only).
- Production deploy with auth env hardening (interim `getCurrentUser()` / operator guard pattern unchanged from US-8.4).
- Manual Fly worker poll + `fetchAsset` against real CDN output (ADR-0003 runtime; unit-tested with mocks).
- Regression of full `npm run build` with production-safe env (blocked by local `AUTH_DEV_FALLBACK`).

---

### Alignment with VALIDATION.md

Requirements-validator verdict **PASS WITH NOTES** at `798635e` is **confirmed**. QA adds one Low retry-policy consistency note not captured in VALIDATION; does not downgrade the validation verdict.

---

### Recommended next actions

| Action | Owner |
|--------|-------|
| Close US-8.6 V1 scope in sprint tracking | product-owner |
| Optional: add retry `provider_key` consistency guard | nextjs-backend |
| Update `TASKS.md` Phase A checkboxes | media-pipeline-engineer / nextjs-backend |
| P1: operator loop/provider override story | product-owner |
