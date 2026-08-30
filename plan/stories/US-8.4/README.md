# US-8.4 — Job status and failure handling UI (closes US-8.2 Phase B)

**Status:** CLOSED (2026-08-29) — VALIDATION PASS WITH NOTES · QA APPROVE WITH CONDITIONS · PO AC check-off on `feature/US-8.4-video-jobs` @ `9b24c48`. Closes **US-8.4** and **US-8.2 Phase B** USER_STORIES AC. Poll-only V1 (webhook deferred per CONTRACT). P2 follow-ups tracked in QA.md (override concurrency, extended security tests).

**As an** Operator, **I want** to see generation progress and retry failed jobs, **so that** I control regenerations and cost.

Ship **video job orchestration + Operator status surfaces** for talking-head generation: **`neuramark_video_jobs` migration**; **`createTalkingHeadVideoJob()`** with **consent (US-3.2) + budget (US-7.1) gates** before vendor I/O; **server-side poller** (Fly worker per ADR-0003, **V1 dev in-process poll** when worker absent); **`GET /api/video-jobs/[jobId]`** operator-scoped read; **M1 provider-asset read route** from US-8.2 QA; **status badges** (+ failure reason, retry affordances) on **`/operator/scripts`**; **retry lineage** (`parent_job_id`, `attempt`); **stale timeout**, **regeneration count**, **retry max + override audit**. **SadTalker adapter** (US-8.2 Phase A) is consumed — no duplicate Replicate I/O in this story.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-8.4 (+ **US-8.2 Phase B closure** table below).

**This folder:** [`plan/stories/US-8.4/`](./) — `README.md` · `TASKS.md` · `SECURITY.md` · `CONTRACT.md` · `VALIDATION.md` · `QA.md` · `SPEC-REVIEW.md`.

**Branch:** `feature/US-8.4-video-jobs`

**Depends on:** [US-8.2](../US-8.2/) ✅ Phase A SadTalker adapter · [US-8.1](../US-8.1/) ✅ adapter contract + normalizers · [US-7.1](../US-7.1/) ✅ `assertReelBudgetAllowsSpend` · [US-7.2](../US-7.2/) ✅ `resolveProviderForJob` · [US-3.2](../US-3.2/) ✅ `assertActiveAvatarConsentForJobs` · [US-3.3](../US-3.3/) portrait assets · [US-7.3](../US-7.3/) `recordReelSpendEvent` / `finalizeGenerationCost` · [US-14.5](../US-14.5/) `requireOperator()`. **Soft:** [US-9.3](../../USER_STORIES.md) (voiceover `voiceoverAssetId` — fixture/mock OK for V1 E2E) · [US-8.3](../../USER_STORIES.md) (manual upload — not required for this slice).

**Unblocks:** Full **US-8.2** AC closure · [US-9.1](../../USER_STORIES.md) assembly (playable `media_assets` primary video) · [US-7.3](../../USER_STORIES.md) / [US-7.4](../../USER_STORIES.md) Phase B video spend rows · [US-8.5](../../USER_STORIES.md)–[US-8.7](../../USER_STORIES.md) (reuse job table + status UI).

---

## Scope in

| Area | What US-8.4 BUILD adds |
|------|------------------------|
| **FE** | **Status badges** on **`/operator/scripts`** (per-slot / expand-row): `queued` · `processing` · `completed` · `failed` · `cancelled`; **failure reason** (sanitized); **regeneration count** (`attempt` / lineage); **retry** button with **confirm dialog** showing **new estimate**; **disabled retry** when over budget (UI convenience — server enforces); **retry-override** flow when max attempts exceeded (reason + audit); EN/ES (`scripts.videoJob.*`). Optional poll via `GET /api/video-jobs/[jobId]` or batched status on `getReelScriptsForWeek` — CONTRACT picks one round-trip. |
| **BE** | **`neuramark_video_jobs` migration** (DDL frozen in US-8.2 CONTRACT Phase B). **`createTalkingHeadVideoJob()`** orchestrator: policy → gates → adapter `createJob` → INSERT job row → `recordReelSpendEvent` → enqueue poll. **Poller:** Fly worker module **or** V1 **`pollVideoJobInProcess`** dev seam (env-gated, no Fly required locally). Terminal complete: `getJobStatus` → `fetchAsset` (job-row context for L1) → INSERT `neuramark_media_assets` → UPDATE job → `finalizeGenerationCost`. **Retry handler:** new job with `parent_job_id`, `attempt + 1`, budget + max-attempt gates. **Stale timeout** → `failed`. **`GET /api/video-jobs/[jobId]`** — operator session, client-scoped (`client_id` from job row → foreign id **404**). **`POST`** retry + retry-override Server Actions (operator-only). **M1:** `app/api/media/provider-assets/[assetId]/route.ts` — HMAC + `exp`, vendor-readable, tenant validation. Optional webhook Route Handler with signature verification (if poll-only in V1, webhook AC satisfied by documented defer + poll path). |
| **DB** | **`neuramark_video_jobs`** table + indexes (US-8.2 CONTRACT). Columns include `parent_job_id`, `attempt`, `failure_reason`, `output_media_asset_id` (no canonical `output_url`). RLS deny-by-default. |
| **Implementers** | **media-pipeline-engineer** (poller, orchestrator, `fetchAsset` job context) + **nextjs-backend** (migration, routes, CONTRACT) + **nextjs-frontend** (badges, retry UI) (`docs/development/AGENT-ROSTER.md` Phase 4). |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **US-8.2 Phase A** SadTalker adapter body | ✅ Closed — consume `createSadtalkerLowAdapter` only. |
| **US-8.3** manual upload | Separate story; same job shape later. |
| **US-8.5 / US-8.6 / US-8.7** Wan / MuseTalk / HeyGen | Reuse job table + UI patterns; adapters not in this BUILD. |
| **US-9.1** FFmpeg assembly | Downstream of completed primary video job. |
| **US-9.3** TTS orchestration body | Consumes `voiceoverAssetId`; may use fixture audio for V1 E2E. |
| **`/operator/production`** route | Not in repo V1 — badges on **`/operator/scripts`** only. |
| **Cliente** job status UI | Operator-only surfaces. |
| **RBAC beyond `requireOperator()`** | Minimal role flag only. |
| **Catalog / cost-policy CRUD** | US-7.1 / US-X.4. |

## Canonical terms (CONTEXT)

Use **Job de generación**, **proveedor**, **reintento**, **regeneración**, **coste estimado**, **presupuesto máximo**, **download-and-own**.  
_Evitar:_ long-lived third-party URLs as canonical output; client-supplied `provider_key`; exposing `external_job_id` or raw vendor JSON to FE.

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-8.2 Phase A | **`createSadtalkerLowAdapter`** · Replicate create/poll/download · **`resolveMediaAssetUrlForProvider`** · **`uploadGeneratedVideoBuffer`** · normalizers · registry swap. |
| US-8.2 CONTRACT Phase B | Frozen **`neuramark_video_jobs` DDL** · **`createTalkingHeadVideoJob()`** steps · status DTO rules · poller diagram — **implement here**, do not redesign. |
| US-8.2 QA M1 | Default resolver URLs point to **`/api/media/provider-assets/{assetId}`** — **route missing**; must ship in US-8.4 before live `createJob`. |
| US-8.2 QA L1 | **`fetchAsset`** needs **`clientId` / `reelScriptId`** from job row on worker — pass from poller, not adapter instance memory. |
| US-7.1 | **`assertReelBudgetAllowsSpend`** before create/retry; **`recordReelSpendEvent`** at enqueue; cumulative gate includes retries. |
| US-3.2 | **`assertActiveAvatarConsentForJobs(clientId)`** when `visualMode === own_avatar` at job create (not cached UI flag). |
| US-7.3 | **`finalizeGenerationCost({ mode: "async_update" })`** on terminal video complete. |

**US-8.4 wires Phase B orchestration and Operator UI** — not a second SadTalker implementation.

## PO decisions frozen (2026-08-29)

1. **Migration:** Apply **`neuramark_video_jobs`** DDL exactly as US-8.2 CONTRACT § Phase B — no `output_url` column; canonical output = **`output_media_asset_id`** FK.
2. **Orchestrator:** **`lib/video-jobs/create-talking-head-video-job.ts`** — gate order: identity → load script → **`resolveProviderForJob`** (`sadtalker_low` for low talking-head paths) → reject `referenceVideoAssetId` (MuseTalk) → **`estimateCost`** → **`assertReelBudgetAllowsSpend`** → **`assertActiveAvatarConsentForJobs`** (own_avatar only) → **`adapter.createJob`** → INSERT job (`attempt = 1`) → **`recordReelSpendEvent`** (`asset_role: talking_head`) → enqueue poll.
3. **Poller runtime:** **Production:** Fly worker per ADR-0003 (`getJobStatus` loop + `fetchAsset` off Vercel). **V1 dev:** **`VIDEO_JOB_POLL_MODE=in_process`** (or unset Fly queue) runs **`pollVideoJobUntilTerminal(jobId)`** in Node after create — acceptable for local E2E; must not block HTTP response unbounded on Vercel Route Handlers.
4. **Status read:** **`GET /api/video-jobs/[jobId]`** — **`requireOperator()`** + **`WHERE id = $1 AND client_id = $2`**; response = **`persistedVideoJobStatusSchema`** subset; **404** for foreign/missing; **no** `external_job_id`, `rawOutputUrl`, cost fields, tokens.
5. **M1 route:** **`app/api/media/provider-assets/[assetId]/route.ts`** — HMAC sig + expiry; validates tenant + asset ownership; no session cookie (Replicate fetches URL); dedicated secret **`NEURAMARK_PROVIDER_ASSET_URL_SECRET`** preferred over service-role fallback.
6. **FE surface:** **`/operator/scripts`** — status badge on slot row + detail in expand row (`ReelDetailPanel` or sibling); not a new route. Poll UX: badge updates on interval or after navigation refresh — SSE optional P1 defer if CONTRACT agrees poll-only refresh.
7. **Retry:** Server Action **`retryVideoJob({ jobId, budgetOverride?, overrideReason? })`** — operator-only; creates row with **`parent_job_id`**, **`attempt = parent.attempt + 1`**; re-runs budget + max-attempt checks; confirm dialog shows **`estimateCost`** from adapter/policy.
8. **Max attempts:** Configurable per Reel (env or cost-policy rules JSON lean: default **3** attempts per `reel_script_id` for `asset_role = primary`) — override requires reason + audit row (US-10.2 pattern).
9. **Stale jobs:** Jobs in `queued` / `processing` older than **`VIDEO_JOB_STALE_TIMEOUT_MIN`** (default **120**) → poller sets **`failed`** + sanitized `failure_reason` (`STALE_TIMEOUT`).
10. **Webhook (if implemented):** Verify provider signature or shared secret; match **`external_job_id` + `provider_key` + client_id`** before UPDATE; unsigned/unmatched → reject + log. **V1 lean:** poll-only satisfies poller-authority AC; webhook Route Handler optional in BUILD if timeboxed.
11. **US-8.2 AC closure:** Checking US-8.2 boxes in USER_STORIES happens only when US-8.4 VALIDATION passes — not at PREP.
12. **Implementers:** **media-pipeline-engineer** + **nextjs-backend** + **nextjs-frontend**; CONTRACT before BUILD.

---

## Gates (orchestrator)

- [x] SPEC-REVIEW.md (spec-guardian — cross-cutting vs SPEC §3 S3.M9)
- [x] SECURITY.md (security-architect — poller authority, IDOR, retry audit, webhook)
- [x] CONTRACT.md (nextjs-backend — DDL, routes, DTOs, poller seam; **Reviewed by FE** before BUILD)
- [x] BUILD (media-pipeline-engineer + nextjs-backend + nextjs-frontend)
- [x] VALIDATION.md (requirements-validator — PASS WITH NOTES @ `ad4d514`)
- [x] QA.md (qa-engineer — APPROVE WITH CONDITIONS @ `9b24c48`)

**Status:** CLOSED. **Commit:** `9b24c48` on `feature/US-8.4-video-jobs`.

---

## US-8.2 Phase B closure (checked off in USER_STORIES via US-8.4 VALIDATION)

| USER_STORIES § US-8.2 AC | US-8.4 deliverable |
|--------------------------|-------------------|
| Default talking-head when `provider_tier = low` + `own_avatar` / `generic_avatar` | `createTalkingHeadVideoJob()` + policy → `sadtalker_low` |
| Portrait still + voiceover (US-9.3) | Orchestrator resolves asset IDs; voiceover fixture OK for V1 |
| Playable video in `neuramark_media_assets` | Poller `fetchAsset` → INSERT media row → `output_media_asset_id` |
| Failures + configurable retries / max attempts | `failure_reason` + retry handler + max-attempt config + override |
| Estimated cost flat per-run (~10¢) | `recordReelSpendEvent` + catalog `unitCostCents` at create |
| [SEC] Consent (US-3.2) + budget (US-7.1) before submit | Orchestrator gate order (step 5–6) |
| [SEC] Status updated only by server poller | No client PATCH status; poller/worker UPDATE only |
| [SEC] Download server-side + URL allowlist | Adapter `fetchAsset` on worker (US-8.2 Phase A) |
| [SEC] Status poll scoped to client → 404 foreign | `GET /api/video-jobs/[jobId]` IDOR rules |

**US-8.4 own AC:** stale timeout · retry confirm + estimate · regeneration count visible · retry max + operator override · operator-only retry endpoints · [SEC] server-side retry budget gate · [SEC] webhook auth (if shipped) · [SEC] retry override audit.
