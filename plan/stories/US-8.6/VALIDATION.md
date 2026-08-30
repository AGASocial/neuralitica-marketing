# Validation Report — US-8.6

**Branch:** `feature/US-8.6-musetalk-adapter`  
**Commits reviewed:** Phase A `dbc9ce2`, Phase B `bdfaaf2` (+ contract freeze `e3e69c4`)  
**Validator:** requirements-validator  
**Date:** 2026-08-30

### Verdict: PASS WITH NOTES

Phase A adapter + registry and Phase B orchestrator unlock satisfy all V1-scoped acceptance criteria per frozen `CONTRACT.md` phased acceptance. Operator SadTalker↔MuseTalk override (USER_STORIES AC #1 tail) remains intentionally deferred to P1. Automated tests pass via `npx tsx --test` on the four requested suites (49 tests, 0 failures).

---

### Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Selected by policy for `generic_avatar` when a reference loop asset exists | **PASS** | `resolveProviderForJob` routes `hasReferenceLoop: true` → `musetalk_low` (`lib/providers/resolve-provider-for-job.ts` L121–126; regression `lib/providers/providers.test.ts` L399–407). Orchestrator accepts `musetalk_low`, server-resolves loop via `getPrimaryReferenceLoopVideoAssetForClient`, builds `resolvedInput` with `referenceVideoAssetId`, INSERTs `portrait_asset_id = loop id` (`lib/video-jobs/create-talking-head-video-job.ts` L131–184, L265–277). Test: `create-talking-head-video-job.test.ts` “creates musetalk_low job with server-resolved loop and voiceover”. |
| …or as operator-configured low-tier alternative to SadTalker | **DEFERRED (P1)** | Frozen in `CONTRACT.md` § Phased BUILD acceptance and `TASKS.md` § Out of scope — no operator override UI or config path in BUILD. Not a V1 blocker per PO freeze. |
| Estimated cost uses flat per-run model from catalog (~$0.19/Reel) | **PASS** | Bootstrap catalog row `musetalk_low` → `{ billingUnit: "per_run", unitCostCents: 19 }` (`lib/providers/create-provider-registry.ts` L80–88). Adapter `estimateCost` returns `defaultEstimateCents` from registry bootstrap, not hardcoded in body (`lib/providers/video/musetalk-low-adapter.ts` L298–303). Test: adapter test case 1 asserts `estimatedCostCents: 19`; registry test 5c confirms real adapter. |
| Same consent, budget, download-and-own, and polling security rules as US-8.2 | **PASS** | **Budget/consent order:** orchestrator calls `assertReelBudgetAllowsEstimatedSpend` then `assertActiveAvatarConsentForJobs` (own_avatar only) then `adapter.createJob` (`create-talking-head-video-job.ts` L229–257). Gate-order regression: `lib/video-jobs/video-jobs.test.ts` “orchestrator gate order”. **Download-and-own:** `fetchAsset` uses `validateProviderOutputUrl`, hardened download (timeout/redirect/byte caps), Storage upload → `storedMediaAssetSchema` (`musetalk-low-adapter.ts` L153–267, L395–443). **Polling:** job enqueue unchanged (`enqueueVideoJobPoll` L311); poller-only writes covered by `video-jobs.test.ts` “poller-only status writes”. **Input SSRF:** signed M1 URLs via `resolveMediaAssetUrlForProvider` with kind-based MIME allowlists (`resolve-media-asset-url-for-provider.ts` L49–60, L123–181). **Token hygiene:** missing token → `PROVIDER_CONFIG_MISSING` before fetch (adapter test case 2; sanitized 401 test case 5). **Normalizers:** `normalizeVideoJobStatusResult`, `parseExternalJobId`, `sanitizeProviderErrorMessage` used on all vendor I/O (`musetalk-low-adapter.ts` L340–348, L375–391). |
| [SEC] Generic-avatar impersonation rules (US-3.4) still apply; MuseTalk does not bypass QA disclosure requirements | **PASS** | MuseTalk path requires `generic_avatar` (orchestrator rejects `own_avatar` + `musetalk_low`: `create-talking-head-video-job.ts` L137–140; test “rejects own_avatar when policy selects musetalk_low”). Adapter exposes no skip-QA / disclosure-bypass flag (`musetalk-low-adapter.ts` — no disclosure-related fields). Consent gate applies only to SadTalker `own_avatar` path (L248–255). Downstream US-3.4 / US-10.x enforcement unchanged per CONTRACT § US-3.4 non-bypass. |

---

### Security Acceptance (from `SECURITY.md`)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Reference-loop asset server-resolved only | **PASS** | `referenceVideoAssetId` in `FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS` (`lib/contracts/video-job.ts` L74–75). `findForbiddenVideoJobKeys` rejects before Zod (`create-talking-head-video-job.ts` L71–73). Loop resolved via `getPrimaryReferenceLoopVideoAssetForClient` (`get-primary-reference-loop-video-asset-for-client.ts` L18–53). Test: FORBIDDEN_FIELDS on client `referenceVideoAssetId`. |
| Dual-input SSRF / kind MIME enforcement | **PASS** | Resolver kind seam with `MUSETALK_VIDEO_MIME_ALLOWLIST` / `MUSETALK_AUDIO_MIME_ALLOWLIST` (`resolve-media-asset-url-for-provider.ts` L49–60). Adapter resolves video + audio via injectable/default resolver only (`musetalk-low-adapter.ts` L310–317). Tests: adapter case 6; orchestrator “rejects video MIME when resolving as audio kind”. |
| `own_avatar` + MuseTalk rejected | **PASS** | Orchestrator guard L137–140 + dedicated test. |
| Orchestrator provider guard `{ sadtalker_low, musetalk_low }` | **PASS** | `isAllowedTalkingHeadProviderKey` L46–50; no `museTalkNotSupported` remnant in codebase. |
| Job row audit: MuseTalk `portrait_asset_id` = loop video id | **PASS** | INSERT uses `portraitAssetIdForInsert = referenceVideoAssetId` for MuseTalk branch (L172, L276). Retry reuses failed row `portrait_asset_id` via `options.portraitAssetId` (L146–147; `retry-video-job.ts` L125, L254; test “retry reuses portrait_asset_id”). |
| Inherited US-8.2 / US-8.4 floors | **PASS** | `import "server-only"` on adapter (`musetalk-low-adapter.ts` L1; test case 7). Poller-only writes, IDOR, retry gates covered by existing `video-jobs.test.ts` suite (18/18 pass). |

---

### Convention Compliance

| Area | Status | Notes |
|------|--------|-------|
| FE / localization | **N/A** | USER_STORIES FE row = —; reuses US-8.4 provider-agnostic UI. |
| Server/client boundary | **PASS** | Adapter, orchestrator, loop resolver, asset resolver all `import "server-only"`. |
| PrimeReact | **N/A** | BE-only story. |
| Supabase / `neuramark_` prefix | **PASS** | Queries use `neuramark_media_assets`, `neuramark_video_jobs`; no DDL in BUILD. |
| Auth / `getCurrentUser()` | **PASS** | Orchestrator uses `requireOperator("handler")` (L67–69); no client Supabase SDK. |
| Endpoints map to consumers | **PASS** | No new Route Handlers; extends existing `createTalkingHeadVideoJob` consumed by US-8.4 retry/generate flows. |
| Scope / no speculative APIs | **PASS** | Changes confined to adapter, registry, orchestrator, asset resolver, tests. |

---

### Automated Test Results

Command: `npx tsx --test lib/providers/video/musetalk-low-adapter.test.ts lib/video-jobs/create-talking-head-video-job.test.ts lib/providers/provider-adapters.test.ts lib/video-jobs/video-jobs.test.ts`

| Suite | Result |
|-------|--------|
| `musetalk-low-adapter.test.ts` | 8/8 pass |
| `create-talking-head-video-job.test.ts` (+ kind seam) | 7/7 pass |
| `provider-adapters.test.ts` | 14/14 pass (incl. 5c real `musetalk_low` adapter) |
| `video-jobs.test.ts` | 18/18 pass |
| **Total** | **49/49 pass** |

---

### Gaps (what blocks PASS)

None for V1-scoped AC per frozen CONTRACT phased acceptance.

**Notes (non-blocking):**

1. **Operator override AC** — USER_STORIES AC #1 second clause (“operator-configured low-tier alternative to SadTalker”) is explicitly P1 defer; do not check off full AC #1 in `USER_STORIES.md` until P1 lands or PO amends scope.
2. **US-9.3 soft dependency** — V1 uses pre-uploaded `voiceoverAssetId` fixtures; full TTS orchestration E2E is out of scope for this story.
3. **TASKS.md Phase A checklist** — BE Phase A items remain `[ ]` in `TASKS.md` while Phase B items are `[x]`; implementation is present but doc checkboxes were not updated — PO/doc hygiene only.

---

### Scope Creep

None identified. No new FE, migrations, Route Handlers, Wan/HeyGen bodies, or operator override UI.

---

### Recommended Next Actions

| Action | Owner |
|--------|-------|
| PO may check off V1-scoped US-8.6 AC in `USER_STORIES.md` (excluding operator-override clause until P1) | product-owner |
| Update `TASKS.md` Phase A BE checkboxes to reflect completed BUILD | media-pipeline-engineer / nextjs-backend |
| Proceed to `QA.md` (qa-engineer) | qa-engineer |
| P1: operator SadTalker↔MuseTalk override story if product wants full AC #1 | product-owner |
