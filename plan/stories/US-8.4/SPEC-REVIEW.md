## Spec Review — US-8.4

### Verdict: GAPS

US-8.4 intent — the **Operator** sees **Job de generación** progress, retries failed jobs with explicit confirmation and cost estimate, views regeneration counts, and the **System** runs server-side polling (and optional webhooks) on **Fly.io** per **ADR-0003**, persisting lineage in **`neuramark_video_jobs`**, enforcing cumulative **Política de costo** on retry, and closing deferred **US-8.2** orchestration AC (consent + budget gates, download-and-own, poller-only status writes, client-scoped status reads) — is **directionally aligned** with SPEC §3 **Video Provider Adapter** (S3.M9: `neuramark_video_jobs`; re-check consent+budget; download-and-own; Operator reintentos), SPEC §4 error paths (Operator ve job failed + reintentar / override budget), SPEC §5 (ADR-0003 worker split), SPEC §6 (multi-tenant `client_id`; Operator-only margin surfaces), USER_STORIES § US-8.4, frozen **US-8.2 CONTRACT Phase B** (`neuramark_video_jobs` DDL, `createTalkingHeadVideoJob()`, poller terminal path, `finalizeGenerationCost`, status poll DTO sketch), frozen **US-7.3 CONTRACT Phase B** (`OperatorProductionJobCostDto` on `/operator/production`), and **ADR-0003** (Vercel create/enqueue; Fly poll + `fetchAsset`).

**Gaps** sit between USER_STORIES § US-8.4 acceptance criteria / owner table and what must be frozen in **US-8.4 CONTRACT.md** / **SECURITY.md** before BUILD: retry handler API + max-attempt config + override audit schema, stale-job timeout policy, optional webhook auth contract, Operator production-list FE surface (beyond cost DTO carry-forward), Fly worker enqueue mechanism, regeneration-count semantics, and Cliente vs Operator status UI split. Story intent does not drift from SPEC; unresolved US-8.4-specific contract shape is the blocker — core orchestration shape is largely pre-frozen in US-8.2 Phase B.

**Upstream dependencies satisfied or frozen:** **US-8.2** ✅ Phase A CLOSED (real `sadtalker_low` adapter; Phase B orchestration explicitly assigned to US-8.4). **US-8.1** ✅ (adapter interface, normalizers, ADR-0003 method matrix). **US-7.1** ✅ (budget gate + spend ledger; retry must re-run gate). **US-7.2** ✅ (policy engine; forbidden client `providerKey`). **US-7.3** ✅ Phase A CLOSED (`finalizeGenerationCost` async seam; `OperatorProductionJobCostDto` frozen for Phase B). **US-3.2** ✅ (`assertActiveAvatarConsentForJobs`). **US-14.5** ✅ (`requireOperator()` floor). **Partial / downstream:** **US-9.3** (voiceover asset for SadTalker E2E) · **US-8.3** (manual upload job shape — Depends OR) · **US-8.6** (MuseTalk — Depends OR) · **US-10.2** (QA override audit pattern reference for retry override AC).

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **High** | **No US-8.4 CONTRACT.md.** USER_STORIES AC spans poller, retry, stale timeout, webhook, Operator UI, and audit — but only **partial** freezes exist in **US-8.2 CONTRACT Phase B** (DDL, create orchestrator, terminal poller steps, minimal status DTO). US-8.4-specific surfaces (retry Server Action, production list query, stale sweeper, webhook Route Handler) are undefined. | USER_STORIES US-8.4; US-8.2 CONTRACT § Phased BUILD Phase B | Author **US-8.4 CONTRACT.md** importing Phase B freezes verbatim; add US-8.4-only sections: **`retryVideoJob()`**, **`listProductionJobsForOperator()`**, stale-job policy, webhook optional path, FE routes, phased acceptance (SadTalker-only BUILD vs US-8.3/8.6). |
| **High** | **Retry handler API undefined.** AC: retry with lineage (`parent_job_id`, `attempt`); explicit confirmation showing new estimate; max attempts per Reel with Operator override; [SEC] cumulative budget re-check server-side; retry override audit (US-10.2 pattern). US-8.2 CONTRACT sets `attempt = 1` on initial create only — no retry mutation, no max-env, no override table. | USER_STORIES US-8.4 AC; US-8.2 CONTRACT § Phase B DDL; US-7.1 override audit pattern | CONTRACT: freeze **`retryVideoJob({ jobId, confirmEstimateCents, budgetOverride?, overrideReason? })`** — Operator-only (`requireOperator()`); load failed/cancelled job; `assertReelBudgetAllowsSpend` with fresh estimate; consent re-check if `own_avatar`; INSERT new row with `parent_job_id`, `attempt = prior.attempt + 1`; new `recordReelSpendEvent`; enqueue poll; block when `attempt > MAX_VIDEO_JOB_ATTEMPTS_PER_REEL` unless override path writes audit row (`neuramark_video_job_retry_overrides` or extend budget audit). UI confirm dialog is convenience only. |
| **High** | **Stale-job timeout not frozen.** AC: “Stale jobs timeout to `failed`.” No duration, sweep runtime (Fly cron vs poller tick), or `failure_reason` copy. Risk: jobs stuck `processing` indefinitely. | USER_STORIES US-8.4 AC; SPEC §4 “Generación falla”; ADR-0003 worker | CONTRACT: freeze **`VIDEO_JOB_STALE_TIMEOUT_MS`** (env, e.g. 2h); sweeper on Fly worker or shared cron — `UPDATE … SET status = 'failed', failure_reason = sanitized` where `status IN ('queued','processing') AND updated_at < now() - interval`; Operator UI shows stale as failed with i18n key `production.job.stale`. |
| **High** | **Fly worker enqueue mechanism unspecified.** ADR-0003 + US-8.2 Phase B step 11: “Enqueue worker poll message” — no queue table, HTTP trigger, or poll-loop contract. BUILD cannot wire create → poll without this. | ADR-0003; US-8.2 CONTRACT § Job orchestration step 11; SPEC §5 | CONTRACT: freeze minimal V1 seam — e.g. **`neuramark_video_jobs.status = 'queued'`** + Fly worker long-poll loop on `(status IN ('queued','processing') ORDER BY updated_at)` **or** Supabase `pg_notify` / dedicated **`neuramark_job_poll_queue`** table; **forbid** unbounded `getJobStatus` loop in Vercel Route Handlers. Document worker env (`SUPABASE_SERVICE_ROLE`, provider tokens). |
| **Medium** | **Operator production list FE underspecified.** USER_STORIES FE: status badges, retry, failure reason, disable retry when over budget. US-7.3 freezes **`OperatorProductionJobCostDto`** + route **`/operator/production`** for cost column only — no list row DTO, status badge mapping, retry button states, pagination, or EN/ES keys. US-8.2 FE row also assigns Cliente “Job status polling UI / SSE” to US-8.4 — persona tension. | USER_STORIES US-8.4 FE; US-7.3 CONTRACT § `OperatorProductionJobCostDto`; US-8.2 CONTRACT § Status polling DTO | CONTRACT: **`OperatorProductionJobListItemDto`** — `jobId`, `reelScriptId`, `status`, `attempt`, `regenerationCount`, `failureReason` (sanitized), `estimatedCostCents`, `canRetry`, `retryBlockedReasonKey?`, `providerKey` (Operator diagnostics), `createdAt`, `updatedAt`; merge cost fields from US-7.3 DTO. Freeze **Cliente** poll: `GET /api/video-jobs/[jobId]` minimal DTO (US-8.2 Phase B) — **no** retry, **no** cost. Operator list at `/operator/production`. |
| **Medium** | **Regeneration count semantics undefined.** AC: “Regeneration count visible (margin risk).” Unclear if count = `attempt` on latest job, sum of attempts per `reel_script_id`, or per asset role — affects margin UX and US-7.4 roll-up clarity. | USER_STORIES US-8.4 AC; US-7.4 per-Reel economics | CONTRACT: **`regenerationCount`** = `COUNT(*)` of `neuramark_video_jobs` rows for `(client_id, reel_script_id, asset_role)` **or** `MAX(attempt)` on active lineage chain — pick one; expose on Operator list + Reel detail expand (US-5.1 / US-7.4 handoff). Document in CONTRACT; do not infer in FE. |
| **Medium** | **Webhook auth contract missing (optional AC).** AC [SEC]: if webhook used, verify provider signature or shared secret; match `external_job_id` + `provider_key` before write. US-8.2 adapter explicitly defers webhooks to US-8.4; no Route Handler path, secret env, or idempotency rule. | USER_STORIES US-8.4 [SEC]; US-8.2 CONTRACT “Do not send webhook in Phase A” | CONTRACT: either **(A) poll-only V1 BUILD** — document webhooks out of initial BUILD with AC checkbox deferred — or **(B)** freeze `POST /api/webhooks/video-jobs/replicate` with `REPLICATE_WEBHOOK_SECRET`, constant-time compare, job lookup `WHERE external_job_id AND provider_key`, reject unsigned; poller remains source of truth for terminal state if webhook races. |
| **Medium** | **Retry override audit schema not frozen.** AC [SEC]: retry override recorded (user, reason, timestamp) like QA overrides (US-10.2). US-7.1 has budget override audit — distinct from “max attempts exceeded” override. | USER_STORIES US-8.4 [SEC]; US-7.1 `neuramark_budget_audit_log`; US-10.2 pattern | CONTRACT: append-only **`neuramark_video_job_retry_overrides`** (or `event_type` on shared audit table) — `job_id`, `reel_script_id`, `operator_client_id`, `reason` (1–500), `prior_attempt`, `created_at`; service-role INSERT; Operator-only read on production list detail. |
| **Medium** | **Depends line allows three adapter paths; BUILD scope unset.** Depends: US-8.2, US-8.3, **or** US-8.6. Only US-8.2 Phase A is CLOSED. Starting BUILD on full Depends blocks on US-8.3/US-8.6/US-9.3. | USER_STORIES US-8.4 Depends; US-8.2 README Phase B table | CONTRACT: **phased acceptance** — Phase A: SadTalker orchestration + poller + Operator production list + retry for `sadtalker_low` only; Phase B: manual job retry (US-8.3), MuseTalk/Wan rows when adapters land. Soft-dep **US-9.3** for E2E voiceover (fixture asset OK in Phase A tests). |
| **Low** | **USER_STORIES DB row uses `video_jobs` not `neuramark_`.** Canonical table is **`neuramark_video_jobs`** per SPEC §6 + US-8.2 Phase B DDL. | SPEC §6 `neuramark_*`; AGENTS.md; US-8.2 CONTRACT DDL | Amend USER_STORIES DB row when PO next edits; CONTRACT uses **`neuramark_video_jobs`** exclusively. |
| **Low** | **SSE vs polling not frozen.** US-8.2 CONTRACT mentions “Operator status UI / SSE”; USER_STORIES FE silent on transport. | US-8.2 CONTRACT Phase B; USER_STORIES US-8.4 FE | CONTRACT: V1 default **short-interval GET poll** on Operator list + Cliente job detail; SSE optional P2 — do not block BUILD on EventSource. |
| **Info** | **Phase B orchestration pre-frozen in US-8.2 CONTRACT.** DDL, `createTalkingHeadVideoJob()` gate order, terminal poller steps (`getJobStatus` → `fetchAsset` → `media_assets` INSERT → `finalizeGenerationCost`), IDOR-safe status read rules, ADR-0003 runtime matrix — US-8.4 should **import**, not reopen. | US-8.2 CONTRACT § Phase B | US-8.4 CONTRACT references US-8.2 Phase B sections by anchor; changes require dual CONTRACT revision. |
| **Info** | **Vision & hard rules intact.** US-8.4 does not publish to Instagram (SC-2), does not require human recording, does not conflate Playbook vs Trend, does not introduce Stories/multicanal/ads/RBAC UI. | SPEC §1 SC-1–SC-4; SPEC §1 fuera de alcance | Retry/regenerate stays within weekly slot / Reel lineage — not silent publish. |
| **Info** | **Modalidad / policy unchanged.** Retry reuses server-resolved `provider_key` from policy — no Cliente provider selection. SadTalker vs MuseTalk routing stays US-7.2. | SPEC §3 Avatar/Visual Mode; US-7.2 | Retry handler reloads script + `resolveProviderForJob` — never client `providerKey`. |
| **Info** | **Out of scope held:** FFmpeg assembly (US-9.x), full Ciclo semanal cron (ADR-0001 / US-14.x), Instagram publish (ADR-0002), Cliente cost fields, QA override handler body (US-10.2), HeyGen fallback UI (US-8.7). | SPEC §3 modules; ADR-0001–0002 | US-8.4 = job lifecycle orchestration + Operator production control — not assembly or publish. |

---

### Terminology violations (CONTEXT)

**None that block** in USER_STORIES § US-8.4 (Operator role; technical `video_jobs` table name is a naming drift — see Low finding — not a CONTEXT _Evitar_ synonym in user-facing copy).

Product-facing EN/ES for US-8.4 UI must use:

| Prefer | _Evitar_ |
|--------|----------|
| **Job de generación** | generation job |
| **Operator** | admin, administrador, staff |
| **Reel** | piece, content item (generic) |
| **Política de costo** / presupuesto | max_cost as loose business concept in UI |
| **Reintentar** | retry (user-facing ES; EN “Retry” OK) |
| **Veredicto QA** | QA verdict |

Technical enums (`queued`, `processing`, `failed`, `sadtalker_low`, `parent_job_id`) OK in code and Operator diagnostics; map to localized labels in FE. Do **not** expose **Cliente** as “prestador” or **Preferencias de producción visual** as “visual mode selector” in UI copy.

---

### Blockers for SECURITY / CONTRACT

| Item | Blocks? | Guidance |
|------|---------|----------|
| US-8.4 CONTRACT.md (retry, list, stale, enqueue) | **Yes — BUILD gate** | Import US-8.2 Phase B; add US-8.4-only freezes. |
| `retryVideoJob()` + max attempts + budget re-check | **Yes — AC + [SEC]** | Operator-only; server enforcement. |
| Stale-job timeout + sweeper | **Yes — AC** | Fly/worker; sanitized `failure_reason`. |
| Worker enqueue / poll loop seam | **Yes — ADR-0003** | No Vercel long poll. |
| Operator production list DTO + `/operator/production` | **Yes — FE AC** | Include US-7.3 cost column merge. |
| Retry override audit persistence | **Yes — [SEC] AC** | Append-only; Operator identity. |
| Webhook auth (if in BUILD scope) | **Conditional — [SEC] AC** | Poll-only BUILD may defer webhook AC explicitly. |
| Regeneration count rule | **No — but freeze before FE** | Single server-side definition. |
| US-8.3 / US-8.6 adapter retry | **No — Phase B** | SadTalker path first. |
| US-9.3 voiceover E2E | **No — soft dep** | Fixture audio in Phase A tests. |

**SPEC blockers on intent:** none. **ADR breaches:** none if poll/fetch/stale sweep stay on Fly and create stays on Vercel.

---

### Recommended action

Proceed to **SECURITY.md** then **US-8.4 CONTRACT.md** with these **non-negotiable freezes**:

1. **Import US-8.2 Phase B verbatim** — `neuramark_video_jobs` migration, `createTalkingHeadVideoJob()`, terminal poller path, `finalizeGenerationCost`, Cliente `GET` status DTO (no cost/retry).
2. **`retryVideoJob()`** — Operator-only; lineage `parent_job_id` + `attempt`; budget + consent gates; max attempts env; override audit row.
3. **Stale-job policy** — timeout constant + worker sweeper → `failed` + sanitized reason.
4. **Fly worker poll seam** — queue table or status-driven loop; ADR-0003 compliant; service-role job writes only.
5. **`OperatorProductionJobListItemDto`** + **`/operator/production`** — status badges, failure reason, regeneration count, retry UX, **`OperatorProductionJobCostDto`** column (US-7.3).
6. **Phased BUILD** — Phase A: SadTalker + US-8.2 orchestration closure; Phase B: US-8.3 manual + US-8.6/US-8.5 adapters; E2E voiceover when US-9.3 lands.
7. **Webhook** — poll-only initial BUILD **or** frozen signed Route Handler; document choice in CONTRACT.
8. **Explicit out of scope:** FFmpeg assembly, IG publish, Ciclo semanal cron, Cliente cost surfaces, QA override implementation (reference pattern only), Stories IG, multicanal.

Do not check off USER_STORIES acceptance criteria in this gate.
