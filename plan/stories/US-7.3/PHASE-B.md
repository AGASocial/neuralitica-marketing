# US-7.3 Phase B — Video / TTS / B-roll spend backfill

**Story ID:** **US-7.3** (same story — **not** a new `US-7.x` ID). Sprint label: **`US-7.3-B`**.  
**Status:** **CLOSED** (2026-08-31) — Phase A CLOSED (2026-08-29). Upstream US-8.4 / US-8.2 / US-8.6 / US-8.7 / US-8.5 / US-8.3 / US-9.3 / US-9.1-B / US-9.2-B / US-7.4 Phase A **CLOSED**.  
**Branch:** `feature/US-7.3-phase-b-spend-backfill`  
**BUILD hashes:** FE `1add7ed` · BE `d3b2e03` · media `3f3653c` · docs `6da4340`  
**CONTRACT:** Phase A frozen — **do not rewrite**. Phase B amendment **shipped** (Reviewed by FE).

**As an** Operator, **I want** real API cost recorded per completed video / TTS / B-roll job on the spend ledger, **so that** weekly and per-Reel economics include generation jobs beyond LLM.

---

## Requirement summary

Phase A ships LLM `finalizeGenerationCost` sync INSERT, Operator **`/operator/scripts`** slot estimated vs actual + weekly sum, and an exported `async_update` seam.

Phase B closes the **deferred** items now that video/TTS/B-roll writers exist. Canonical AC remain [`plan/USER_STORIES.md`](../../USER_STORIES.md) § US-7.3 — **all four Phase A checkboxes stay checked**. Phase B **does not add new USER_STORIES checkboxes**. VALIDATION re-verifies **[SEC]** writer-only + Operator-only + response-shape exclusion on video / TTS / B-roll paths, and records closure of Phase A deferrals.

**US-7.4** is a **consumer**: Phase A roll-up groups by `asset_role` and will show `talking_head` / `broll` / `tts` lines when ledger rows exist. **Do not reopen US-7.4 BUILD** unless a query gap is proven.

---

## Scope in

| Area | Phase B adds |
|------|----------------|
| **BE** | Close remaining **actual** backfill gaps: pass **`durationSec`** on video `async_update`; TTS **trusted** path persist `duration_sec`; tests that poller complete → ledger actual; handle missing `spendEventId` without inventing cost. CONTRACT Phase B amendment (call-site table, TTS exception, poll DTO). |
| **media-pipeline** | Confirm adapter `fetchAsset.actualCostCents` feeds persist → poller; Wan B-roll complete uses same poller; no new adapters. |
| **FE** | **Thin:** Operator video job panel already shows estimated vs actual. Fix **poll stale cost** (status poll omits `cost`). **No** new `/operator/production` route. EN/ES only if new keys needed. |
| **DB** | **No new tables/columns** — `duration_sec` + `actual_cost_unavailable_reason` already on **`neuramark_reel_spend_events`**. |
| **Implementers** | **media-pipeline-engineer** + **nextjs-backend** + thin **nextjs-frontend**. |

## Scope out

| Topic | Why |
|-------|-----|
| **`/operator/production`** | Does **not** exist. US-8.4 shipped on **`/operator/scripts`**. |
| Duplicate scripts **list** cost column | Phase A already cumulative per slot; new roles auto-sum. |
| B-roll job strip / per-clip panel | `getVideoJobsForReelScripts` is **`asset_role = primary` only**. B-roll cost via **US-7.4 rollup** + weekly slot sum. |
| TTS panel cost chip | Voiceover panel has no cost UI; success DTO already Operator-only. Rollup is the surface. |
| Route TTS through `finalizeGenerationCost` | Working **`recordReelSpendEvent`** with actual at success — **leave** (B7). |
| Failed / cancelled spend UPDATE | No billed amount from adapters on fail — **no fail-row actual** (B6). |
| **`ltx_broll_high`** | Catalog seed **inactive** (`false`) — no adapter. Wan only. |
| Assembly FFmpeg / branding spend | US-9.1 / US-9.2 — **out**. |
| QA `qa_run` LLM spend | Already `finalizeGenerationCost` in `run-qa-for-assembled-reel.ts` — **out** unless a cost leak is found. |
| Budget gate on actuals | US-7.1 remains **estimate-only**. |
| Cliente cost fields | [SEC] response-shape exclusion unchanged. |
| New tables / US-7.4 query rewrite | Roll-up auto-expands. |
| New USER_STORIES AC / unchecking Phase A | Stay **[x]**. |
| Historical SQL backfill | Forward path + tests only. |

---

## Audit — existing wiring vs still missing

| Deferred item (Phase A CONTRACT/VALIDATION) | Status | Evidence |
|---------------------------------------------|--------|----------|
| 1. Video `finalizeGenerationCost({ mode: "async_update" })` from poller | **Mostly done** | `lib/video-jobs/apply-video-job-status-update.ts` calls it on **completed** when `spendEventId` present. **Gap:** no `durationSec`; no tests asserting ledger UPDATE; skip if `spendEventId` null. |
| 2. Production list `OperatorProductionJobCostDto` | **Done on wrong named route** | **No** `/operator/production`. DTO built in `build-operator-production-job-cost.ts`; mapped in `map-operator-video-job-dto.ts`; **rendered** on `OperatorVideoJobSummaryPanel` (`/operator/scripts` expand). **Gap:** `GET /api/video-jobs/[jobId]` returns **status-only**; `mergePolledStatus` does **not** refresh `cost` → actual stays pending until reload. |
| 3. TTS spend INSERT `asset_role: tts` | **Done (not via finalize)** | `synthesize-voiceover-for-reel-script.ts` + `synthesize-voiceover-for-client-trusted.ts` call `recordReelSpendEvent` with actual at success. |
| 4. Manual `actual_cost_cents = 0`, `provider_key = manual` | **Done** | `upload-manual-video-job.ts` → `finalizeGenerationCost` sync_insert `manualActualCostCents: 0`. |
| 5. `duration_sec` on spend events | **Partial** | Manual + Operator TTS path set it. **Gaps:** video `async_update`; TTS **trusted** path omits `durationSec`. DDL already exists. |
| 6. B-roll INSERT + actual backfill | **Mostly done** | `create-broll-video-jobs.ts` INSERT estimate-only + `spend_event_id`. Complete uses **same poller** as talking-head. **No** dedicated B-roll cost UI (rollup only). |
| 7. Failed / cancelled | **Matches lean** | Poller does **not** call `finalizeGenerationCost` on fail/cancel. Estimate-only row remains. |

**Already present (do not duplicate):** `finalize-generation-cost.ts` (`sync_insert` LLM + manual 0; `async_update`); `update-reel-spend-event-actual.ts`; talking-head / HeyGen / B-roll create `recordReelSpendEvent` with `actualCostCents: null`; `video_jobs.actual_cost_cents` mirrored on status UPDATE (reporting **mirror only**).

---

## PO decisions frozen (2026-08-31) — Phase B

| # | Topic | Decision |
|---|-------|----------|
| **B1** | **Story identity** | **Phase B of US-7.3** — sprint `current_story: US-7.3-B`. Not a new backlog ID. |
| **B2** | **Canonical store** | **`neuramark_reel_spend_events`** remains the reporting ledger. `neuramark_video_jobs.actual_cost_cents` may **mirror** for job UI — **never** the reporting store. US-7.4 must not SUM `video_jobs`. |
| **B3** | **Sole writer of actuals** | **`finalizeGenerationCost`** (`server-only`) for **async video** (`async_update`) and **manual** (`sync_insert` 0). **Accepted exception:** TTS success INSERT via **`recordReelSpendEvent` with actual** (already shipping) — do **not** migrate in this slice. CONTRACT Phase B must name this exception. Create-path video INSERTs (estimate-only, actual **null**) may keep calling `recordReelSpendEvent` — they do **not** write actuals. |
| **B4** | **Video job create** | Keep estimate-only spend INSERT + `spend_event_id` link (SadTalker / MuseTalk / HeyGen / Wan). Retries go through create helpers → **new** spend row per attempt. |
| **B5** | **Poller complete** | Keep existing `async_update` on **completed** only. BUILD: pass **`durationSec`** when asset/probe duration is known (else omit / null); if `actualCostCents` is null after persist, set a closed **`actualCostUnavailableReason`** (do not leave completed row null/null). Missing `spendEventId`: log; **do not** INSERT a late actual-only row in V1. |
| **B6** | **Failed / cancelled** | **No** spend UPDATE. Leave estimate-only. Do **not** invent billed cost. Do **not** add a new unavailable-reason for “job failed” unless an adapter reports a billed amount (none do today). |
| **B7** | **TTS** | **Leave** working sync INSERT with actual. BUILD: add **`durationSec`** on **trusted** path (Operator path already sets it). Failed TTS: **no** spend row (same as LLM). |
| **B8** | **Manual upload** | Already `actual = 0`, `providerKey = manual`, `durationSec`. **Verify** tests only — no rewrite. |
| **B9** | **B-roll** | Wan create + poller path is the backfill. **`ltx_broll_high` out**. No B-roll clip cost panel. |
| **B10** | **`duration_sec`** | Populate on complete when adapter/asset provides it. LLM remains null. Not required for weekly SUM. |
| **B11** | **FE surface** | **Do not invent `/operator/production`.** Job-level estimated vs actual lives on **`OperatorVideoJobSummaryPanel`** (`/operator/scripts`). Hide from Cliente (already Operator route). |
| **B12** | **Poll / cost refresh** | BUILD **must** refresh job `cost` after terminal complete: extend Operator **`GET /api/video-jobs/[jobId]`** (already `requireOperator`) to include **`OperatorProductionJobCostDto`**, **or** equivalent refetch. Do **not** put cost on any Cliente poll. CONTRACT freezes the DTO. |
| **B13** | **Slot list + US-7.4** | Phase A column + `ReelCostRollupPanel` **unchanged**. New roles appear automatically. **No US-7.4 BUILD.** |
| **B14** | **Budget gate** | Still **`SUM(estimated_cost_cents)`** only. |
| **B15** | **Assembly / branding / QA** | **Out.** Do not add FFmpeg or branding spend lines. Do not retouch QA cost unless it leaks to Cliente. |
| **B16** | **Phase A AC** | Remain **[x]**. Notes in VALIDATION Phase B; no new USER_STORIES checkboxes. |
| **B17** | **CONTRACT** | **Phase B amendment required** — nextjs-backend. Do not rewrite Phase A sections except addenda. FE **Reviewed by FE** on amendment before BUILD. |
| **B18** | **Implementers** | **media-pipeline-engineer** + **nextjs-backend** + thin **nextjs-frontend**. |

---

## Task breakdown (summary)

See [`TASKS.md`](./TASKS.md) § Phase B checklist.

| Layer | Work |
|-------|------|
| **FE** | Poll merge / status DTO includes cost so panel actual updates; no new route; i18n reuse `scripts.videoJob` cost keys |
| **BE** | `durationSec` on async_update; TTS trusted duration; poll DTO; tests; CONTRACT Phase B |
| **media-pipeline** | Confirm adapter actuals on `fetchAsset`; Wan complete path; no new provider |
| **DB** | None |

---

## Dependencies and sequence

1. **US-7.3 Phase A** ✅ — ledger actuals + `/operator/scripts` weekly/slot  
2. **US-8.4** ✅ — poller + Operator video panel  
3. **US-8.2 / 8.6 / 8.7 / 8.5 / 8.3** ✅ — talking-head / Wan / manual writers  
4. **US-9.3** ✅ — TTS spend INSERT  
5. **US-7.4 Phase A** ✅ — roll-up consumer (no reopen)  
6. **This Phase B** — SPEC-REVIEW → SECURITY amend → CONTRACT Phase B + FE Reviewed → BUILD → VALIDATION → QA → **CLOSED 2026-08-31**  

**Unblocks:** truthful weekly + per-Reel economics including video/TTS/B-roll; US-7.4 Phase B “automatic expand” realized (no US-7.4 BUILD).

---

## Gates (Phase B) — CLOSED 2026-08-31

- [x] SPEC-REVIEW.md amendment (spec-guardian — video/TTS/B-roll actuals + surface = `/operator/scripts`)
- [x] SECURITY.md amendment (security-architect — TTS INSERT exception; poll cost Operator-only; re-verify [SEC])
- [x] CONTRACT.md Phase B section (nextjs-backend) — Reviewed by FE before BUILD
- [x] BUILD (media-pipeline-engineer ∥ nextjs-backend ∥ thin nextjs-frontend) — FE `1add7ed` · BE `d3b2e03` · media `3f3653c` · docs `6da4340`
- [x] VALIDATION.md Phase B (requirements-validator) — PASS WITH NOTES; Phase A AC stay [x]; re-verify [SEC]
- [x] QA.md Phase B (qa-engineer) — APPROVE WITH CONDITIONS (Critical 0 · High 0 · Medium 1 non-blocking · Low 4)

**Status:** CLOSED. **Next SELECT:** US-9.2-B QA M1 (`voiceoverTimingHash` worker re-check).

---

## VALIDATION note (binding)

- Phase A USER_STORIES AC stay **checked**. Prefer **notes** over new AC wording.
- Re-verify **[SEC]**: actuals written only server-side from adapter/orchestrator results; no client-set cost; Operator-only reads; Cliente serializers omit cost (including poll routes).
- Re-verify TTS + video create do not expose `actualCostCents` to Cliente sessions.

---

## Open questions (resolved — PO lean)

| Question | PO default |
|----------|------------|
| New story vs Phase B? | **Phase B of US-7.3** (`US-7.3-B`). |
| Invent `/operator/production`? | **No** — `/operator/scripts` video panel + existing slot/rollup. |
| Migrate TTS to `finalizeGenerationCost`? | **No** this slice — leave working INSERT; document exception. |
| Fail-row actual? | **No** unless adapter reports billed amount (none). |
| B-roll per-clip UI? | **No** — US-7.4 rollup. |
| `ltx_broll_high` / ElevenLabs / assembly spend? | **Out**. |
| Reopen US-7.4? | **No** unless aggregator ignores non-LLM roles (it does not). |
| Poll without cost? | **Not acceptable** — Operator must see actual after complete without full page reload (B12). |
