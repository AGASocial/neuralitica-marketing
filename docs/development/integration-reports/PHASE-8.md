# Integration Report — Sprint 8 (Operator B-roll UI)

**Date:** 2026-08-31  
**Branch reviewed:** `main` (`0a0ec84` — US-8.9 close)  
**Checker:** integration-checker  
**Flow scope:** US-8.9 Operator B-roll generate UI → Wan (`siliconflow_wan21_turbo`) / LTX (`ltx_broll_high`) preview + create → poll + spend → US-9.1 Phase B stitch → US-9.2 branding → US-10.1 QA

> **Numbering note:** Sprint 8 in `SPRINT-STATE.md` closes the **Provider P1 faceless Operator trigger** gap left open at Sprint 7 ([`PHASE-7.md`](./PHASE-7.md) non-blocking gap #1). PLAN.md **Fase 8** (Calendar + Metrics P2) is a separate post-MVP slice — not this gate.

---

## Verdict: CONNECTED

Sprint 8 wires the Operator `/operator/scripts` surface to the existing faceless B-roll pipeline delivered in Sprint 7. Preview and create share `lib/video-jobs/broll-estimate-shared.ts`; create reuses `createBrollVideoJobs` (US-8.5/US-8.8) with no orchestrator fork. Completed B-roll jobs still feed `resolveCompletedBrollAssetIds` → `broll_stitch` assembly → branding auto-chain → QA auto-chain. US-8.9 reports **PASS WITH NOTES** / **APPROVE** (0 Critical/High). Focused integration suite: **79 pass / 0 fail**. **Sprint 8 may close.**

| Metric | Value |
|--------|-------|
| **Verdict** | CONNECTED |
| **Blocking gaps** | 0 |
| **Non-blocking / expected gaps** | 5 |
| **Sprint 8 may close** | Yes |
| **Recommended next** | PLAN F7 cron automation · QA follow-ups (revision B-roll step · enqueue-time audio probe) |

---

## Deliverable claimed vs observed

| Claimed deliverable (Sprint 8) | Observed |
|-------------------------------|----------|
| Operator-only “Generate B-roll” on `/operator/scripts` for faceless / `needs_broll` slots | **Yes.** `BrollGenerateControl` in `ScriptsPageView.tsx` (after HeyGen, before `OperatorVideoJobSummaryPanel`) |
| Server preview before confirm (cost, clip count, provider label — never client-computed) | **Yes.** `previewBrollVideoJobsEstimate` → `estimateBrollVideoJobsPreview` in `broll-estimate-shared.ts` |
| Wan on `provider_tier = low`; LTX on `provider_tier = high` per policy | **Yes.** `resolveProviderForJob` + `isAllowedBrollProviderPair`; tests 5–7 (preview) + create Wan/LTX suites |
| Confirm submits `{ reelScriptId, clientId }` only via `createBrollVideoJobs` | **Yes.** `BrollGenerateConfirmDialog.tsx` L289; action wrapper `requireOperator` + session `operatorClientId` |
| Downstream stitch → branding → QA unchanged | **Yes.** Re-verified assembly Phase B tests + `onAssemblyJobCompleted` / `onBrandingCompleted` hooks |

---

## Flow traces

### 1. Operator faceless happy path — UI → Wan/LTX → stitch → branding → QA

| Step | Expected | Found | Owner |
|------|----------|-------|-------|
| 1. Page gate | Operator-only `/operator/scripts` | `app/(app)/operator/layout.tsx` + `page.tsx` | nextjs-frontend |
| 2. Eligibility poll | Faceless / `needs_broll`; provider resolved; hide when blocked or in-flight | `BrollGenerateControl` → `previewBrollVideoJobsEstimate`; `isEligiblePreview` (`needsBroll && providerKey && !blockedReasonKey`) | nextjs-frontend |
| 3. Tier routing | Low → Wan; high → LTX; disallowed pair blocked | `estimateBrollVideoJobsPreview` L144–167 · `isAllowedBrollProviderPair` | nextjs-backend |
| 4. Confirm dialog | Server DTO: `estimatedCostCents`, `clipCount`, localized provider label | `BrollGenerateConfirmDialog` — no client cost math | nextjs-frontend |
| 5. Create | Operator-only; N jobs `asset_role = broll`; per-clip budget | `createBrollVideoJobs` action → core orchestrator; Wan/LTX adapter `createJob` | media-pipeline-engineer |
| 6. Spend + poll | Estimate INSERT at create; poll on enqueue | `recordReelSpendEvent` · `enqueueVideoJobPoll` (`create-broll-video-jobs.ts` L307–323) | media-pipeline-engineer |
| 7. Poll complete | B-roll actuals; `output_media_asset_id` set | `pollActiveVideoJobsBatch` · `applyVideoJobStatusUpdate` → `finalizeGenerationCost` | media-pipeline-engineer |
| 8. Assembly readiness | Faceless + broll clips + VO → `canAssemble: true` | `assembly-readiness.phase-b.test.ts` (B12) | media-pipeline-engineer |
| 9. Stitch | `broll_stitch` FFmpeg concat + VO mux | `resolveAssemblyInputs` → `resolveCompletedBrollAssetIds` → `buildBrollConcatArgs` | media-pipeline-engineer |
| 10. Branding auto-chain | Assembly complete → branding queued | `onAssemblyJobCompleted` → `createBrandingJobForAssembly` | media-pipeline-engineer |
| 11. QA auto-chain | Branding complete → QA run | `onBrandingCompleted` → `runQaForAssembledReelForClient` | content-agents-engineer |
| 12. FE refresh | Success / partial toast + job panel refresh | `handleBrollGenerateSuccess` → `router.refresh()` | nextjs-frontend |

### 2. Preview ↔ create contract alignment (US-8.9 anti-fork)

| From → To | Contract / entrypoint | Schema alignment | Status |
|-----------|----------------------|------------------|--------|
| Shared estimate | `broll-estimate-shared.ts` | `isFacelessNeedsBroll`, `computeBrollClipCount`, `resolveBeatTexts`, budget gate | OK |
| Preview → FE | `previewBrollVideoJobsEstimateSuccessSchema` (`.strict()`) | No prompts/still URLs; Wan \| LTX `providerKey` | OK |
| Preview → create | Same helper inputs; create re-runs gates | Test 13: preview/create unit costs match | OK |
| Create → poller | `asset_role: broll`, `provider_key` server-only | INSERT row + `enqueueVideoJobPoll` | OK |
| Poller → assembly | Completed broll assets by `created_at` ASC | `resolveCompletedBrollAssetIds` cap 8 | OK |

### Handoffs table (cross-story boundaries)

| From → To | Contract | Status |
|-----------|----------|--------|
| US-8.9 FE → US-8.9 preview | `{ reelScriptId, clientId }` strict | OK |
| US-8.9 preview → US-8.5/8.8 create | Shared `broll-estimate-shared.ts`; same provider/tier rules | OK |
| US-8.5/8.8 → US-9.1 Phase B | N owned `broll` clips → stitch resolver | OK (Sprint 7 — unchanged) |
| US-9.1 → US-9.2 | `onAssemblyJobCompleted` auto-chain | OK |
| US-9.2 → US-10.1 | `onBrandingCompleted` auto-chain | OK |
| US-8.4 poller → US-7.3-B | Poll GET merges `OperatorProductionJobCostDto` in job panel | OK |

---

## SPEC §4 error paths — Sprint 8 scope

| Error path | Expected behavior | Found |
|------------|-------------------|-------|
| Non-operator preview/create | 403 / hide control | `requireOperator("handler")` first; test 1 |
| Authority smuggling (`provider_key`, `operatorClientId`) | 403 `FORBIDDEN_FIELDS` | `findForbiddenVideoJobKeys`; tests 2, 2b, 11 |
| Cross-tenant IDOR | 403 / 404 | `clientId !== operator.id`; scoped reel load |
| Low tier + LTX policy mismatch | Blocked preview; create `BROLL_PROVIDER_UNAVAILABLE` | `isAllowedBrollProviderPair` |
| B-roll in-flight | Preview `blockedReasonKey: jobInFlight`; control hidden | `hasBrollJobInFlight` + `isEligiblePreview`; test 9 |
| Reference still missing | Preview blocked; create `BROLL_REFERENCE_STILL_MISSING` | `getBrollReferenceStillAssetForClient` |
| Budget exceeded | Per-clip skip with localized reason | `assertReelBudgetAllowsEstimatedSpend` |
| B-roll clip failure | Graceful degrade; partial success toast | `createBrollVideoJobs` skipped items; FE `handleBrollGenerateSuccess` |
| QA blocking legal | Does not reach approval (S4.Q1) | Unchanged US-10.1 path post-branding |

S4.2 cron auto-cycle and S4.4 IG publish remain **out of Sprint 8 scope** — correct deferral.

---

## VALIDATION / QA sample (Sprint 8)

| Story | VALIDATION | QA | Integration-relevant notes |
|-------|------------|-----|----------------------------|
| US-8.9 Operator B-roll UI | PASS WITH NOTES (6/6 AC; 41/41) | APPROVE (0 Crit/High, 3 Low) | Closes PHASE-7 gap #1; shared estimate helper; HeyGen pattern mirrored |

Inherited Sprint 7 media chain (Wan, LTX, US-9.1-B, US-9.2-B, US-7.3-B) — see [`PHASE-7.md`](./PHASE-7.md). No regressions observed in re-run assembly/provider suites.

---

## Automated check summary (this gate)

```bash
# Sprint 8 UI contract + B-roll create/preview + faceless assembly chain (79 pass)
npx tsx --test \
  lib/video-jobs/preview-broll-video-jobs-estimate.test.ts \
  lib/video-jobs/create-broll-video-jobs.test.ts \
  lib/assembly/assembly-readiness.phase-b.test.ts \
  lib/assembly/resolve-assembly-inputs.phase-b.test.ts \
  lib/assembly/run-assembly-job.phase-b.test.ts \
  lib/assembly/ffmpeg/build-broll-concat-args.test.ts \
  lib/providers/video/siliconflow-wan21-turbo-adapter.test.ts \
  lib/providers/video/ltx-broll-high-adapter.test.ts
```

**Result:** 79 pass / 0 fail (~1.8s).

---

## Gaps (blocks next phase)

**None.**

---

## Non-blocking gaps / expected partial MVP

| # | Gap | Severity | Owner | Notes |
|---|-----|----------|-------|-------|
| 1 | **Revision pipeline `video_job` step only enqueues talking-head** | Medium | media-pipeline-engineer | Carried from PHASE-7 #2 — faceless revision media path may skip B-roll recreate |
| 2 | **`hasBrollJobInFlight` fail-open on Supabase query error** | Low | nextjs-backend | US-8.9 QA L1 — TOCTOU accepted in SECURITY; optional hardening |
| 3 | **`brollJobInFlight` SC prop not wired** | Low | nextjs-frontend | Preview remains authoritative; US-8.9 VALIDATION note |
| 4 | **No live browser / FFmpeg / Fly E2E** | Low | QA | Recommend staging smoke: eligible faceless Reel → confirm dialog → poll → assemble → QA |
| 5 | **PLAN F7 cron not started** | Expected | integrations-engineer | Weekly auto-cycle still manual Operator path |

**Closed since PHASE-7:** Operator UI to trigger `createBrollVideoJobs` (was gap #1).

---

## Recommended fixes (by agent)

| Agent | Action |
|-------|--------|
| **media-pipeline-engineer** | Extend revision `video_job` step to call `createBrollVideoJobs` when script is faceless/`needs_broll`. |
| **nextjs-backend** | Optional: fail-closed or retry on `hasBrollJobInFlight` query error (QA L1). |
| **QA / nextjs-frontend** | One staging smoke on `/operator/scripts` with Wan and LTX-tier fixtures. |
| **integrations-engineer** | PLAN F7 cron automation (next major backlog item). |

---

## Sprint 8 close checklist

- [x] US-8.9 VALIDATION PASS WITH NOTES (6/6 AC)
- [x] US-8.9 QA APPROVE (0 Critical/High)
- [x] Operator UI → preview → create → existing stitch/branding/QA chain verified
- [x] Wan low + LTX high tier routing enforced at preview and create
- [x] Shared estimate helper — no orchestrator fork
- [x] Automated integration suite 79/79 pass
- [x] 0 blocking integration gaps

**Sprint 8: CLOSED — CONNECTED**
