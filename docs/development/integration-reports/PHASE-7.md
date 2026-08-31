# Integration Report — Sprint 7 Rollup (Provider P1 + Media + Spend + Fase 5)

**Date:** 2026-08-31  
**Branch reviewed:** `main` (`b77bd8e` — US-9.1-B-M2 close)  
**Checker:** integration-checker  
**Flow scope:** US-8.7 HeyGen · US-8.5 Wan B-roll · US-9.1 Phase B + B-M2 assembly · US-9.2 Phase B + B-M1 + B-M2 branding · US-7.3-B spend backfill · Fase 5 weekly ops (US-12.1–US-13.2)

> **Numbering note:** Sprint 7 in `SPRINT-STATE.md` spans two PLAN slices: **Fase 5 — Operación semanal** (calendar/metrics — PLAN F8 P2) and **Provider P1 + media pipeline hardening** (extends PLAN F4). This report rolls up both slices plus cross-module E2E for the provider/media/spend stories requested for this gate. Fase 5 detail remains in [`PHASE-5.md`](./PHASE-5.md).

---

## Verdict: CONNECTED

Sprint 7 modules hand off correctly through frozen contracts (`lib/contracts/*`), server-only orchestrators, auto-chain hooks (assembly → branding → QA), shared spend ledger (`neuramark_reel_spend_events`), and Operator gates. All sampled stories report **PASS WITH NOTES** / **APPROVE** (or APPROVE WITH CONDITIONS) with **0 Critical/High** QA findings. Automated integration suite: **149 pass / 0 fail** (109 media/provider/spend + 40 cost/strategy). Residual items are non-blocking: no B-roll generate UI (US-8.5 deferred FE), no live browser/FFmpeg E2E, revision pipeline `video_job` step does not enqueue B-roll for faceless revisions, and inherited Fase 5 doc/test drift. **Sprint 7 may close.**

| Metric | Value |
|--------|-------|
| **Verdict** | CONNECTED |
| **Blocking gaps** | 0 |
| **Non-blocking / expected gaps** | 8 |
| **Sprint 7 may close** | Yes |
| **Recommended next** | `ltx_broll_high` adapter, B-roll Operator UI, or PLAN F7 cron automation |

---

## Deliverable claimed vs observed

| Claimed deliverable (Sprint 7) | Observed |
|-------------------------------|----------|
| HeyGen high-tier adapter + Operator fallback (never silent low default) | **Yes.** `heygen-high-adapter.ts` · `createHeygenTalkingHeadVideoJob` · audit table `neuramark_video_job_heygen_fallback_overrides` · FE `HeygenGenerateConfirmDialog` on `/operator/scripts` |
| Wan B-roll adapter + orchestrator + graceful degrade | **Yes.** `siliconflow-wan21-turbo-adapter.ts` · `createBrollVideoJobs` · `asset_role = broll` · per-clip budget · primary never blocked on B-roll failure |
| Faceless B-roll stitch (US-9.1 Phase B) + assembly poll claim (M2) | **Yes.** `build-broll-concat-args.ts` · `path_tag = broll_stitch` · `resolveCompletedBrollAssetIds` · atomic claim in `applyAssemblyJobUpdate` · `canAssemble` readiness companion (B12) |
| VO-proportional subtitles + Operator `coverFrameSec` (US-9.2 Phase B) | **Yes.** `computeVoProportionalBeatTimings` · `OperatorAssemblyPanel` InputNumber · fingerprint includes `voiceoverTimingHash` |
| Branding poll claim (M2) + VO-hash re-check (M1) | **Yes.** `applyBrandingJobUpdate` atomic claim · `runBrandingJob` L176–190 live VO hash gate |
| Video/TTS/B-roll spend backfill (US-7.3-B) | **Yes.** Poller `finalizeGenerationCost({ mode: "async_update" })` · GET poll returns `OperatorProductionJobCostDto` · FE `mergePolledStatus` copies `cost` |
| Fase 5 weekly ops (calendar → metrics → strategy insights) | **Yes.** Prior gate [`PHASE-5.md`](./PHASE-5.md) CONNECTED — re-verified calendar/strategy test suites pass |

---

## Flow traces

### 1. Faceless happy path — Wan B-roll → stitch → branding → QA

| Step | Expected | Found | Owner |
|------|----------|-------|-------|
| 1. Script gate | Faceless / `needs_broll` script with beats | `loadReelScriptForVideoJob` · `isFacelessNeedsBroll` in `create-broll-video-jobs.ts` | nextjs-backend |
| 2. B-roll create | Operator-only; N jobs `asset_role = broll`; budget per clip | `createBrollVideoJobs` → `recordReelSpendEvent` (estimate) → Wan adapter `createJob` | media-pipeline-engineer |
| 3. Poll + spend | B-roll jobs polled; complete → ledger actual | `pollActiveVideoJobsBatch` (no primary-only filter) · `applyVideoJobStatusUpdate` → `finalizeGenerationCost` async_update | media-pipeline-engineer |
| 4. TTS | Voiceover asset required for stitch | `OperatorVoiceoverPanel` → `synthesizeVoiceoverForReelScript` · `findLatestVoiceoverAssetId` in resolver | nextjs-backend / nextjs-frontend |
| 5. Assembly readiness | Faceless + broll + VO → `canAssemble: true` | `mapNullJobAssemblyReadinessDto` · `assembly-readiness.phase-b.test.ts` | media-pipeline-engineer |
| 6. Assembly stitch | `broll_stitch` FFmpeg concat + VO mux; 9:16 | `resolveAssemblyInputs` → `runAssemblyJob` → `buildBrollConcatArgs` · five-part fingerprint | media-pipeline-engineer |
| 7. Poll claim (M2) | One FFmpeg winner under concurrent poll | `applyAssemblyJobUpdate` `.eq("status","queued")` · runner early-exit on lost claim | media-pipeline-engineer |
| 8. Auto-chain branding | Assembly complete → branding queued | `onAssemblyJobCompleted` → `createBrandingJobForAssembly({ source: "auto_chain" })` | media-pipeline-engineer |
| 9. Branding | VO-proportional ASS + logo + cover; M1 VO-hash re-check | `runBrandingJob` · `computeVoProportionalBeatTimings` · atomic claim M2 | media-pipeline-engineer |
| 10. Auto-chain QA | Branding complete → QA run | `onBrandingCompleted` → `runQaForAssembledReelForClient` | content-agents-engineer |
| 11. Cost rollup | B-roll actuals in weekly/slot summary | `getReelCostSummaryForWeek` over `neuramark_reel_spend_events` (all asset roles) | nextjs-backend |

### 2. Talking-head path — SadTalker/MuseTalk/HeyGen → primary assembly → branding

| Step | Expected | Found | Owner |
|------|----------|-------|-------|
| 1. Provider select | Low tier → SadTalker/MuseTalk; high → HeyGen; low never silent HeyGen | `createTalkingHeadVideoJob` · US-7.2 policy · HeyGen only via high tier or Operator fallback | media-pipeline-engineer |
| 2. HeyGen fallback | Operator-only after failed low parent; audit row | `createHeygenTalkingHeadVideoJob` · `neuramark_video_job_heygen_fallback_overrides` | media-pipeline-engineer / nextjs-frontend |
| 3. Poll + spend | Complete → async_update + duration | Same `applyVideoJobStatusUpdate` path · `buildOperatorProductionJobCostDto` ledger-wins | nextjs-backend |
| 4. Assembly primary | Talking-head ignores broll; `path_tag = primary` | `resolveAssemblyInputs` L talking-head branch | media-pipeline-engineer |
| 5. Branding + QA | Same auto-chain as faceless | Shared hooks | media-pipeline-engineer |

### 3. US-7.3-B spend backfill cross-provider

| From → To | Contract / entrypoint | Schema alignment | Status |
|-----------|----------------------|------------------|--------|
| Video job complete → ledger | `applyVideoJobStatusUpdate` → `finalizeGenerationCost({ mode: "async_update" })` | `actualCostCents` + `durationSec` + closed `provider_no_billing` | OK |
| TTS success → ledger | `recordReelSpendEvent` with adapter actual (named exception) | Trusted path sets `durationSec`; forbidden client actuals | OK |
| B-roll create → ledger | Estimate-only INSERT at create; actual on poll complete | `asset_role: broll` · same poller writer | OK |
| Poll GET → FE panel | `GET /api/video-jobs/[jobId]` → `operatorVideoJobSummaryDtoSchema` | `cost: OperatorProductionJobCostDto` merged in panel | OK |
| Ledger → weekly scripts | `getReelCostSummaryForWeek` | Sums all asset roles; no `video_jobs` SUM | OK |
| Manual upload | `finalizeGenerationCost` sync_insert actual `0` | Unchanged Phase A path | OK |

### 4. Fase 5 weekly ops (inherited — see PHASE-5.md)

| Step | Expected | Found | Status |
|------|----------|-------|--------|
| Calendar week → mark published | Operator aggregate + approved-only gate | `/operator/calendar` · `markCalendarSlotPublished` | OK |
| Metrics → strategy insights | 7-day edit window · prompt injection | `upsertReelMetrics` · `aggregateReelMetricsByTema` · `<TRUSTED_METRICS_SUMMARY>` | OK |

### Handoffs table (cross-story boundaries)

| From → To | Contract | Status |
|-----------|----------|--------|
| US-8.5 → US-9.1 Phase B | N owned `broll` clips → `resolveCompletedBrollAssetIds` → stitch | OK |
| US-9.1 → US-9.2 | `onAssemblyJobCompleted` → branding auto-chain | OK |
| US-9.2 → US-10.1 | `onBrandingCompleted` → QA auto-chain | OK |
| US-8.4 poller → US-7.3-B | `applyVideoJobStatusUpdate` sole status writer + spend finalize | OK |
| US-7.3-B → US-7.4 | Weekly rollup auto-expands; no US-7.4 BUILD | OK |
| US-11.3 → US-12.1 | Approved → calendar sync | OK (PHASE-5) |
| US-13.2 → US-4.1 | Metrics → strategy generate prompt | OK (PHASE-5) |

---

## SPEC §4 error paths — Sprint 7 scope

| Error path | Expected behavior | Found |
|------------|-------------------|-------|
| B-roll failure | Graceful degrade; primary unaffected; assembly skips missing clips | `createBrollVideoJobs` returns `ok: true` with skipped items; zero broll → `facelessWaitingForClips` |
| HeyGen fallback ineligible | Operator blocked without failed low parent (unless high tier) | `HEYGEN_FALLBACK_INELIGIBLE` |
| Low tier never silent HeyGen | Policy + retry stay on low provider | Tests 2, 9, 10 in `create-heygen-talking-head-video-job.test.ts` |
| Assembly/branding poll race | One FFmpeg winner; loser idempotent skip | M2 atomic claims in assembly + branding appliers |
| VO mutated after branding enqueue | Branding fails closed before spawn | M1 `BRANDING_FAILURE_VOICEOVER_TIMING_HASH` |
| Missing spendEventId on complete | Log only; no late INSERT | `apply-video-job-status-update.ts` L124–130 |
| Fail/cancel video job | No spend actual UPDATE | Tests in `apply-video-job-status-update.test.ts` |
| Cliente cost smuggling | 403; no cost in Cliente schemas | US-7.3-B security matrix PB-S1–S12 |
| QA blocking legal | Does not reach approval (S4.Q1) | Unchanged US-10.1 path |

S4.2 cron auto-cycle and S4.4 IG publish remain **out of Sprint 7 scope** — correct deferral (PLAN F7 / F6).

---

## VALIDATION / QA sample (Sprint 7 stories)

| Story | VALIDATION | QA | Integration-relevant notes |
|-------|------------|-----|----------------------------|
| US-8.7 HeyGen | PASS WITH NOTES (5/5; 22/22) | APPROVE WITH CONDITIONS (0 Crit/High) | Fallback audit; never silent low default; poll reuse US-8.4 |
| US-8.5 Wan B-roll | PASS WITH NOTES (6/6; 39/39) | APPROVE WITH CONDITIONS (H1/M1 fixed) | Stitch handoff to US-9.1; no FE preview |
| US-9.1 Phase B | PASS WITH NOTES (5/5 + 16/16) | APPROVE WITH CONDITIONS (0 Crit/High) | B12 `canAssemble` fix; faceless stitch connected |
| US-9.1 B-M2 | PASS WITH NOTES | APPROVE (1 Low) | Assembly poll atomic claim |
| US-9.2 Phase B | PASS WITH NOTES (2/2 deferred; 44/44) | APPROVE WITH CONDITIONS (0 Crit/High) | VO-proportional proxy + coverFrameSec |
| US-9.2 B-M1/M2 | PASS WITH NOTES | APPROVE | VO-hash re-check + branding poll claim |
| US-7.3-B | PASS WITH NOTES (75/75) | APPROVE WITH CONDITIONS (0 Crit/High) | Poll cost DTO; TTS exception documented |
| US-12.1–US-13.2 | PASS (PHASE-5) | APPROVE | Calendar/metrics/strategy loop |

---

## Automated check summary (this gate)

```bash
# Media / provider / assembly / branding / spend (109 pass)
npx tsx --test \
  lib/video-jobs/create-heygen-talking-head-video-job.test.ts \
  lib/video-jobs/create-broll-video-jobs.test.ts \
  lib/assembly/resolve-assembly-inputs.phase-b.test.ts \
  lib/assembly/run-assembly-job.phase-b.test.ts \
  lib/assembly/assembly-readiness.phase-b.test.ts \
  lib/assembly/assembly-jobs.test.ts \
  lib/assembly/run-assembly-job.test.ts \
  lib/branding/run-branding-job.test.ts \
  lib/assembly/branding-jobs.test.ts \
  lib/video-jobs/apply-video-job-status-update.test.ts \
  lib/video-jobs/build-operator-production-job-cost.test.ts \
  lib/cost-policy/get-reel-cost-summary-for-week.test.ts \
  lib/calendar/calendar.test.ts

# Cost security + strategy insights (40 pass)
npx tsx --test \
  lib/assembly/compute-vo-proportional-beat-timings.test.ts \
  lib/cost-policy/us-7.3-phase-b-security.test.ts \
  lib/agents/content/generate-weekly-strategy.test.ts \
  lib/metrics/get-strategy-performance-insights.test.ts
```

**Result:** 149 pass / 0 fail.

---

## Gaps (blocks next phase)

**None.**

---

## Non-blocking gaps / expected partial MVP

| # | Gap | Severity | Owner | Notes |
|---|-----|----------|-------|-------|
| 1 | **No Operator UI to trigger `createBrollVideoJobs`** | Medium | nextjs-frontend | Server Action + retry path exist; US-8.5 CONTRACT defers FE preview/generate strip. Faceless E2E requires programmatic call until UI lands. |
| 2 | **Revision pipeline `video_job` step only enqueues talking-head** | Medium | media-pipeline-engineer | `revision-pipeline-seams.ts` L207–231 calls `createTalkingHeadVideoJob` only — faceless revision media path may skip B-roll recreate. |
| 3 | **No live browser / FFmpeg / Fly E2E** | Low | QA | All stories rely on unit + static evidence. |
| 4 | **Brief editor vs insights/generate client mismatch** | Medium | nextjs-backend / nextjs-frontend | Carried from PHASE-5 / US-13.2 QA Phase B. |
| 5 | **Mark-published unit test fixture drift** | Low | nextjs-backend | Carried from PHASE-5 (metrics DTO + Monday date edge). |
| 6 | **B-roll i18n key `scripts.broll.failure.referenceStillMissing`** | Low | nextjs-frontend | Message key returned but not in `messages/*.json` until FE surfaces errors. |
| 7 | **Enqueue-time audio probe (QA follow-up)** | Low | media-pipeline-engineer | Listed in SPRINT-STATE as optional hardening. |
| 8 | **PLAN.md Fase numbering vs Sprint State labels** | Doc drift | product-owner | Sprint 7 = Fase 5 ops + F4 extensions; PLAN F7 cron not started. |

---

## Recommended fixes (by agent)

| Agent | Action |
|-------|--------|
| **nextjs-frontend** | Add Operator “Generate B-roll” control on `/operator/scripts` for faceless slots (calls existing Server Action). |
| **media-pipeline-engineer** | Extend revision `video_job` step to call `createBrollVideoJobs` when script is faceless/`needs_broll`. |
| **QA / nextjs-frontend** | One staging smoke: Wan → poll cost → TTS → Assemble → branding poll → QA → approval package. |
| **nextjs-backend** + **nextjs-frontend** | Phase B: brief editor `selectedClientId` parity (PHASE-5 #1). |
| **product-owner** | Next backlog: `ltx_broll_high` adapter or PLAN F7 cron automation. |

---

## Success criteria touchpoint (MVP checkpoint adjacency)

Sprint 7 does not close PLAN F7 (cron automation). It **does** connect the manual Operator media pipeline and weekly ops feedback loop needed before F7:

| SC | Sprint 7 contribution | Status |
|----|----------------------|--------|
| SC-1 (3 Reels/week to approval) | Media pipeline + QA auto-chain wired; cron enqueue still F7 | Partial — manual Operator path CONNECTED |
| SC-2 (no publish without approval) | Unchanged; approval gate intact | OK |
| SC-3/SC-4 | Not in Sprint 7 scope | Deferred |

---

## Sign-off

| Question | Answer |
|----------|--------|
| Can Sprint 7 close? | **Yes** |
| Blocking gap count | **0** |
| Wan → stitch → branding → QA connected? | **Yes** (when B-roll action invoked) |
| HeyGen → primary assembly → branding connected? | **Yes** |
| Spend backfill across video/TTS/B-roll connected? | **Yes** |
| Fase 5 calendar/metrics/strategy still connected? | **Yes** |
| Blocks `ltx_broll_high` or F7 cron? | **No** |
