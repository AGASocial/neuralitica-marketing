# US-8.4 — Job status and failure handling UI (closes US-8.2 Phase B)

**Priority:** P0  
**Depends on:** US-8.2 ✅ Phase A adapter · US-8.1 ✅ · US-7.1 ✅ budget gate · US-7.2 ✅ policy · US-3.2 ✅ consent · US-3.3 ✅ portrait assets · US-7.3 ✅ spend ledger · US-14.5 ✅ operator gate. **Soft:** US-9.3 (voiceover asset).  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-8.4 (source of truth — do **not** redefine; do **not** check off in PREP) + § US-8.2 Phase B closure table in README.  
**Implementers:** **media-pipeline-engineer** + **nextjs-backend** + **nextjs-frontend** (`docs/development/AGENT-ROSTER.md` Phase 4).  
**Canonical terms:** **Job de generación** · **provider key** · **external job id** · **download-and-own** · **reintento**. Avoid CONTEXT _Evitar_ list in product-facing copy.

## Out of scope (do not implement here)

- **US-8.2 Phase A** — SadTalker Replicate adapter body (already shipped).
- **US-8.3** manual upload adapter.
- **US-8.5 / US-8.6 / US-8.7** — Wan / MuseTalk / HeyGen adapters (reuse job table later).
- **US-9.1** assembly / FFmpeg pipeline.
- **US-9.3** TTS synthesis orchestration (consume `voiceoverAssetId` only).
- **`/operator/production`** list — route does not exist; use **`/operator/scripts`**.
- **Cliente** job status or retry UI.
- **Live Replicate** in CI — mocked poller + adapter tests only.
- **RBAC** beyond `requireOperator()`.

## Scope split

| Concern | Owner |
|---------|--------|
| `neuramark_video_jobs` migration | **US-8.4** DB |
| `createTalkingHeadVideoJob()` orchestrator | **US-8.4** BE |
| Consent gate `assertActiveAvatarConsentForJobs` | **US-8.4** orchestrator (US-3.2 helper) |
| Budget gate `assertReelBudgetAllowsSpend` | **US-8.4** orchestrator (US-7.1 helper) |
| `recordReelSpendEvent` + `finalizeGenerationCost` | **US-8.4** poller terminal path |
| Fly worker poller / dev in-process poll | **US-8.4** BE (media-pipeline-engineer) |
| `GET /api/video-jobs/[jobId]` | **US-8.4** BE |
| M1 `provider-assets` read route | **US-8.4** BE (carry-forward US-8.2 QA) |
| `fetchAsset` job-row context (L1) | **US-8.4** poller passes `clientId` + `reelScriptId` |
| Status badges + retry UI on `/operator/scripts` | **US-8.4** FE |
| Retry lineage `parent_job_id`, `attempt` | **US-8.4** DB + BE |
| Stale timeout, max attempts, override audit | **US-8.4** BE + FE |
| SadTalker `VideoProviderAdapter` | **US-8.2** ✅ |
| Policy `resolveProviderForJob` | **US-7.2** ✅ |

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Branch | **`feature/US-8.4-video-jobs`** |
| DDL | US-8.2 CONTRACT § Phase B — `neuramark_video_jobs` with `parent_job_id`, `attempt`, `output_media_asset_id`; **no** `output_url` |
| Orchestrator module | **`lib/video-jobs/create-talking-head-video-job.ts`** (`import "server-only"`) |
| Create input | **`createVideoJobRequestSchema`** — no client `providerKey`; server resolves via policy |
| Gate order | Policy → estimate → **`assertReelBudgetAllowsSpend`** → **`assertActiveAvatarConsentForJobs`** (own_avatar) → **`adapter.createJob`** |
| Initial row | `attempt = 1`, `status = queued`, asset FKs, `estimated_cost_cents` |
| Spend at create | **`recordReelSpendEvent({ assetRole: "talking_head", ... })`** |
| Poller prod | Fly worker: `getJobStatus` loop → terminal → `fetchAsset` → media INSERT → job UPDATE → **`finalizeGenerationCost`** |
| Poller dev | **`VIDEO_JOB_POLL_MODE=in_process`** — `pollVideoJobUntilTerminal(jobId)` after create (async job, not blocking Route Handler) |
| Status route | **`GET /api/video-jobs/[jobId]`** — `requireOperator()`; `client_id` scope → foreign **404** |
| Status DTO | `persistedVideoJobStatusSchema` subset — no `external_job_id`, costs, vendor JSON |
| M1 route | **`app/api/media/provider-assets/[assetId]/route.ts`** — HMAC + `exp`; tenant check; vendor-readable |
| FE surface | **`/operator/scripts`** slot badges + expand-row job panel |
| Retry action | **`retryVideoJob`** Server Action — operator-only; `parent_job_id` lineage; budget + max-attempt server gates |
| Max attempts | Default **3** per `reel_script_id` + `asset_role primary` (env or policy rules — CONTRACT freezes) |
| Stale timeout | Default **120 min** in `queued`/`processing` → `failed` + `STALE_TIMEOUT` reason |
| Webhook | Optional in BUILD; poll-only path acceptable for V1 if CONTRACT documents defer |
| Registry bootstrap | First orchestration path calls **`initializeProviderRegistryFromCatalog()`** if not already |
| Implementers | **media-pipeline-engineer** (poller) + **nextjs-backend** (DDL, routes) + **nextjs-frontend** (UI) |

### Orchestrator sketch (CONTRACT freezes exact signatures)

```ts
// lib/video-jobs/create-talking-head-video-job.ts
export async function createTalkingHeadVideoJob(
  input: CreateVideoJobRequest,
): Promise<{ jobId: string; status: VideoJobStatus; estimatedCostCents: number }>;
```

### Poller terminal complete (BUILD)

```ts
// 1. Load job row (service-role) — clientId, reelScriptId, provider_key, external_job_id
// 2. adapter.getJobStatus(externalJobId)
// 3. If completed + rawOutputUrl: adapter.fetchAsset with job context from row (L1 fix)
// 4. INSERT neuramark_media_assets (generated video)
// 5. UPDATE job: status, output_media_asset_id, actual_cost_cents, failure_reason null
// 6. finalizeGenerationCost({ mode: "async_update", actualCostCents })
// On failed: UPDATE status + sanitized failure_reason only
```

### Retry handler sketch

```ts
// retryVideoJob({ jobId, budgetOverride?, overrideReason? })
// 1. requireOperator()
// 2. Load failed parent job — same client_id scope
// 3. Count attempts for reel_script_id + primary — if >= max && !override → reject
// 4. assertReelBudgetAllowsSpend with new estimate
// 5. createTalkingHeadVideoJob with parent_job_id + attempt = parent.attempt + 1
// 6. If override: INSERT audit row (US-10.2 pattern)
```

## Carry-forwards / reuse (do not reinvent)

- Adapter: `lib/providers/video/sadtalker-low-adapter.ts` (US-8.2 Phase A).
- DDL + orchestration spec: `plan/stories/US-8.2/CONTRACT.md` § Phase B.
- Budget: `lib/cost-policy/assert-reel-budget-allows-spend.ts`, `record-reel-spend-event.ts`, `finalize-generation-cost.ts`.
- Consent: `lib/visual-preferences/assert-active-avatar-consent-for-jobs.ts`.
- Policy: `lib/cost-policy/resolve-provider-for-job.ts` (US-7.2).
- Asset URL resolver: `lib/media/resolve-media-asset-url-for-provider.ts` (needs M1 route).
- Normalizers: `lib/providers/normalize-provider-response.ts`.
- Operator scripts page: `app/(app)/operator/scripts/page.tsx`, `ReelDetailPanel` pattern (US-5.1 / US-7.4).
- Security baseline: `plan/SECURITY_BASELINE.md` § Video Provider; US-8.2 SECURITY.md Phase B items.
- ADR-0003: `docs/adr/0003-worker-flyio-ffmpeg.md`.

---

## FE checklist

Concrete consumers: **`/operator/scripts`** · retry confirm dialog · optional poll of `GET /api/video-jobs/[jobId]`.

- [ ] **Status badge** on each Reel slot row — maps `videoJobStatus` → PrimeReact `Tag` severity / icon (`queued`, `processing`, `completed`, `failed`, `cancelled`).
- [ ] **Expand-row panel** — current job status, **failure reason** (truncated, sanitized), **regeneration count** (`attempt` + count of primary jobs for script).
- [ ] **Retry button** — visible when `failed` and server allows; hidden/disabled when over budget (soft UX).
- [ ] **Retry confirm dialog** — shows **new estimate** (`estimatedCostCents`) before submit; EN/ES (`scripts.videoJob.retry.*`).
- [ ] **Max attempts exceeded** — show override affordance with **reason** field when server returns retry-limit error.
- [ ] **Loading / empty** — no job yet · in-flight poll · terminal states.
- [ ] **i18n** — EN + ES under **`scripts.videoJob.*`** (status labels, failure, retry, stale, override).
- [ ] **No cost fields** in shared Cliente serializers — operator-only DTOs only.
- [ ] **No** `external_job_id` or raw provider URLs in UI.

---

## BE checklist

Concrete consumers: FE badges · retry actions · Fly worker · dev in-process poller.

- [x] **Migration** — `neuramark_video_jobs` per US-8.2 CONTRACT DDL + RLS deny-by-default.
- [x] **`createTalkingHeadVideoJob()`** — full gate order; INSERT job; `recordReelSpendEvent`; enqueue poll.
- [x] **`pollVideoJobUntilTerminal(jobId)`** — load row → adapter `getJobStatus` loop → terminal handling.
- [x] **`fetchAsset` context (L1)** — pass `clientId`, `reelScriptId` from job row into adapter factory / download path.
- [x] **Terminal complete** — INSERT `neuramark_media_assets`; UPDATE job; `finalizeGenerationCost` async_update.
- [x] **Terminal failed** — UPDATE `status`, `failure_reason` (sanitized only).
- [x] **Stale sweeper** — cron or poller pre-check marks old `queued`/`processing` as `failed`.
- [x] **`GET /api/video-jobs/[jobId]`** — `requireOperator()`; client-scoped; 404 foreign; frozen DTO.
- [x] **`retryVideoJob` Server Action** — operator-only; lineage; budget + max-attempt gates; override audit.
- [x] **M1 route** — `app/api/media/provider-assets/[assetId]/route.ts` (HMAC, exp, tenant).
- [ ] **Optional webhook** — signature verify + `external_job_id` match (if shipped).
- [x] **`initializeProviderRegistryFromCatalog()`** on first video job path.
- [x] **[SEC] No client endpoint** sets `status`, `output_url`, or `external_job_id`.
- [x] **[SEC] Poller-only** status writes.
- [x] **[SEC] Retry budget** enforced server-side in retry handler (not UI-only).
- [x] **Tests** — orchestrator gate order (consent/budget mocked); IDOR 404 on status GET; retry lineage; stale timeout; M1 route HMAC; poller mocked HTTP (no live Replicate in CI).

---

## DB checklist

All objects keep `neuramark_` prefix.

- [x] **CREATE `neuramark_video_jobs`** — columns per CONTRACT; indexes `client_reel`, `status_updated`.
- [x] **`parent_job_id`** self-FK + **`attempt`** CHECK `>= 1`.
- [x] **`output_media_asset_id`** FK → `neuramark_media_assets` — no canonical provider URL column.
- [x] **UNIQUE** `(client_id, provider_key, external_job_id)`.
- [x] **RLS** deny-by-default; service-role Node only.
- [x] **No** changes to `sadtalker_low` catalog seed (US-X.4).

---

## Gates (orchestrator)

- [ ] SPEC-REVIEW.md (spec-guardian)
- [ ] SECURITY.md (security-architect)
- [ ] CONTRACT.md authored (nextjs-backend — extends US-8.2 Phase B; **Reviewed by FE** before BUILD)
- [ ] BUILD (media-pipeline-engineer + nextjs-backend + nextjs-frontend)
- [ ] VALIDATION.md (requirements-validator — US-8.4 + US-8.2 Phase B AC)
- [ ] QA.md (qa-engineer)

**Status:** PREP — TASKS.md ready. **Next:** SECURITY.md → CONTRACT.md on `feature/US-8.4-video-jobs`.

---

## US-8.2 Phase B AC closure (VALIDATION evidence required)

| AC | Evidence |
|----|----------|
| Default low-tier talking-head E2E | Orchestrator + policy integration test |
| Portrait + voiceover inputs | Create job with fixture assets |
| Playable `media_assets` output | Poller complete path + storage key |
| Failures + retries | `failure_reason` + retry creates child job |
| Flat per-run estimate (~10¢) | Spend row at create |
| [SEC] Consent + budget before submit | Orchestrator tests reject without gates |
| [SEC] Poller-only status writes | No PATCH route; grep regression |
| [SEC] Download + allowlist | Adapter tests (US-8.2) + poller integration |
| [SEC] Scoped status poll → 404 | GET foreign `jobId` test |

**US-8.4 own AC:** stale timeout · retry confirm + estimate · regeneration count · max + override · operator-only retry · [SEC] server retry budget · [SEC] webhook auth (if shipped) · [SEC] override audit.

**Known carry-forwards:** US-8.2 QA **M1** provider-asset route · **L1** job-row context for `fetchAsset`.

---

## Open questions (for SPEC / SECURITY / CONTRACT)

1. **Poll UX — SSE vs interval?** **PO lean:** interval refresh or manual refresh on `/operator/scripts` for V1; SSE defer unless CONTRACT has bandwidth.
2. **Batch status on week load?** **PO lean:** attach `videoJobsByReelScriptId` map on `getReelScriptsForWeek` (mirror US-7.4 cost batch) — one round-trip.
3. **Max attempts config location?** **PO lean:** env `VIDEO_JOB_MAX_ATTEMPTS_PRIMARY=3` + CONTRACT optional policy rules JSON later.
4. **Fly worker in BUILD?** **PO lean:** ship poller module + dev in-process; Fly deploy wiring can be minimal stub with ADR-0003 doc if infra not ready — dev path must pass VALIDATION.
5. **Webhook in V1 BUILD?** **PO lean:** **optional** — poll-only satisfies poller-authority; webhook AC marked partial if deferred with SECURITY signoff.
6. **US-9.3 voiceover without TTS orchestration?** **PO lean:** INSERT fixture `voiceoverAssetId` in tests; manual seed audio for demo E2E.
7. **Retry override audit table?** **PO lean:** reuse `neuramark_budget_events` override pattern or `neuramark_qa_override_events` shape — CONTRACT picks one table.
8. **Operator read vs client scope on GET?** **PO lean:** operator session still scopes by job's `client_id` (scripts page already has client context) — no cross-client jobId enumeration.

No SPEC amendment assumed in PREP: US-8.4 implements SPEC §3 S3.M9 orchestration deferred from US-8.2 Phase A.
