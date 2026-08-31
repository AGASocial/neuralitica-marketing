# Validation — US-7.3

Phase A report below is **preserved as-is** (2026-08-29). Phase B amendment follows immediately.

---

## Validation Report — US-7.3 Phase B (`US-7.3-B`)

**Story:** US-7.3 — Track actual cost per generation job (Phase B: video / TTS / B-roll spend backfill)  
**Branch:** `feature/US-7.3-phase-b-spend-backfill`  
**Commits:** FE `1add7ed` · BE `d3b2e03` · media `3f3653c` · docs `6da4340`  
**Validated:** 2026-08-31  
**Validator:** requirements-validator  
**USER_STORIES:** Phase A AC remain **[x]**. Phase B adds **no new checkboxes**. This gate **does not** check USER_STORIES boxes.

### Verdict: PASS WITH NOTES

Phase B BUILD matches CONTRACT Phase B (frozen, Reviewed by FE) and SECURITY Phase B (12 conditions). Video complete uses `finalizeGenerationCost({ mode: "async_update" })` with `durationSec` and closed `provider_no_billing`; Operator GET poll returns `OperatorProductionJobCostDto`; FE merges `cost`; TTS trusted INSERT sets `durationSec`; no `/operator/production`, no US-7.4 reopen, no new tables. Security matrix tests pass (75/75 on the Phase B suite below). Notes are non-blocking (no FE unit test for merge; poller-only webhook path).

**Next gate:** qa-engineer (`QA.md` Phase B). Do **not** uncheck Phase A USER_STORIES AC.

### Test execution (Phase B)

```bash
npx tsx --test \
  lib/video-jobs/apply-video-job-status-update.test.ts \
  lib/video-jobs/build-operator-production-job-cost.test.ts \
  lib/video-jobs/video-jobs.test.ts \
  lib/cost-policy/us-7.3-phase-b-security.test.ts \
  lib/tts/synthesize-voiceover-for-reel-script.test.ts \
  lib/video-jobs/create-talking-head-video-job.test.ts \
  lib/video-jobs/create-broll-video-jobs.test.ts \
  lib/video-jobs/upload-manual-video-job.test.ts
```

**Result:** 75 tests, 0 failures.

---

### USER_STORIES AC (re-verified on video / TTS / B-roll — not checked)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Every completed job has actual or `null` with failure reason | **PASS (Phase B paths)** | Complete + `spendEventId`: `finalizeGenerationCost` `async_update` with persist actual or `actualCostUnavailableReason: "provider_no_billing"` (`lib/video-jobs/apply-video-job-status-update.ts` L107–123). Missing `spendEventId`: log only, no late INSERT (L124–130). Fail/cancel: no finalize (L80–82, L332–364 tests). TTS success INSERT with adapter actual (`lib/tts/synthesize-voiceover-for-reel-script.ts` L186–193; trusted L153–163). Manual remains `sync_insert` actual `0`. |
| Dashboard aggregate cost per client per week (simple sum) | **PASS (unchanged consumer)** | Weekly still `getReelCostSummaryForWeek` over `neuramark_reel_spend_events` only (`lib/cost-policy/us-7.3-phase-b-security.test.ts` PB-S8). New `asset_role` rows auto-sum. No US-7.4 rewrite. |
| Operator-only: endpoint/action rejects non-operator sessions (403) | **PASS (includes poll)** | `GET /api/video-jobs/[jobId]` first await `requireOperator("handler")` (`app/api/video-jobs/[jobId]/route.ts` L24–31). Cliente 403, no cost JSON (`lib/video-jobs/video-jobs.test.ts` L1043–1107). Foreign job 404 (L946–1040). TTS synthesize still Operator-gated. |
| [SEC] `actual_cost_cents` written only by server-side job-completion handler from provider responses; no client-facing endpoint can set or edit recorded costs | **PASS (Phase B writers)** | Exclusive actuals: poller `finalizeGenerationCost` (`apply-video-job-status-update.ts` L1, L114–123) from `persistVideoJobOutputAsset` → adapter `fetchAsset` (`persist-video-job-output.ts` L16–38); manual `finalizeGenerationCost` `sync_insert`; named TTS `recordReelSpendEvent` (`server-only`, adapter `storedAsset`). GET has no body. Forbidden keys on video create + TTS (`find-forbidden-keys.ts`; `find-forbidden-synthesis-keys.ts` L35–38). Tests: TTS `actualCostCents: 0` → `FORBIDDEN_FIELDS`; video-job keys include `actualCostCents` / `durationSec`. |

---

### SECURITY Phase B — inherited + additive [SEC]

| Criterion | Status | Evidence |
|-----------|--------|----------|
| [SEC] USER_STORIES writer-only + no client edit (Phase B: finalize **or** named TTS INSERT) | **PASS** | See USER_STORIES [SEC] row. TTS not migrated to finalize (B3/B7). |
| Operator-only 403 including job poll with cost | **PASS** | Route L24–31 + Cliente 403 test. |
| [SEC] Cliente cost exclusion at response-shape (includes poll) | **PASS** | GET validates `operatorVideoJobSummaryDtoSchema` (cost) only after Operator gate. `operatorVideoJobStatusDtoSchema` remains status-only (`lib/contracts/video-job.ts` L228–250). PB-S4: approval / list / voiceover summary / status-only omit cost keys. Trusted TTS success return omits cost fields (`synthesize-voiceover-for-client-trusted.ts` L165–171). |
| [SEC] Budget gate estimates only | **PASS** | `sum-reel-cumulative-cost-cents.ts` L25 `.select("estimated_cost_cents")`; PB-S9. |
| [SEC] Operator gate inside handler (`requireOperator`) | **PASS** | Poll route first await; TTS orchestrator `requireOperator`. |
| [SEC] RLS deny-by-default + service-role Node | **PASS** | No new DDL; existing spend + video_jobs RLS unchanged. |
| [SEC] (Phase B) TTS exception: server-only, adapter-sourced, no client actuals/duration, write-once, do not migrate | **PASS** | Both modules `import "server-only"`. Operator input Zod `{ reelScriptId }` only. Forbidden keys reject `actualCostCents` / `durationSec`. Trusted params are server-only (`clientId`, `reelScriptId`, `invokedBy`). |
| [SEC] (Phase B) Exclusive actual writers; create-path estimate-only | **PASS** | Create: `actualCostCents: null` (`create-talking-head-video-job.ts` L391; `create-heygen-talking-head-video-job.ts` L498; `create-broll-video-jobs.ts` L315). No ad-hoc `UPDATE … SET actual_cost_cents` in Route Handlers. GET has no mutation. |
| [SEC] (Phase B) FE surface: no `/operator/production` | **PASS** | No `app/**/operator/production` route. Consumer: `OperatorVideoJobSummaryPanel` + Operator GET + `OperatorProductionJobCostDto`. |
| [SEC] (Phase B) Poll DTO Operator-only; Cliente cannot obtain cost DTO | **PASS** | Summary schema has `cost`; Cliente 403 test asserts no `actualCostCents` / `"cost"`. |
| [SEC] (Phase B) Ledger canonical; job-row mirror; DTO ledger-wins; no `video_jobs` SUM | **PASS** | `build-operator-production-job-cost.ts` L56–75 ledger-wins when `spendEventId` present. Weekly/rollup grep test PB-S8. Job row still updated on same complete pass (`apply-video-job-status-update.ts` L133–137). |
| [SEC] (Phase B) Fail / cancel: no spend actual UPDATE | **PASS** | Fail/cancel tests: zero finalize, zero spend INSERT; job `actual_cost_cents` stays null. |
| [SEC] (Phase B) Missing `spendEventId`: log, no late INSERT | **PASS** | L124–130 + test “complete with null spendEventId”; log has no vendor URL. |
| [SEC] (Phase B) Completed + spendEventId never null/null | **PASS** | L111–112 `provider_no_billing` when persist actual null; test L266–296. |
| [SEC] (Phase B) `durationSec` server-derived; never from client | **PASS** | Video async_update L107–122; TTS trusted L160; Operator TTS already set duration. Client `durationSec` forbidden. Tests PB-S11/S12. |
| [SEC] (Phase B) Operator TTS success DTO may keep cost; Cliente revision/approval omit | **PASS** | Operator success schema still has cost (`lib/contracts/tts-voiceover.ts` L101–113). Trusted/revision return has no cost keys. Approval package schema in PB-S4. |
| [SEC] (Phase B) Webhook/poller: authenticity before persist; cost from adapter persist | **PASS WITH NOTES** | Live path: `poll-video-job-until-terminal.ts` L43–56 uses adapter `getJobStatus` then `applyVideoJobStatusUpdate`; cost from `fetchAsset`, not request JSON. No HTTP webhook Route Handler in this slice (`source: "webhook"` remains enum-only). |
| [SEC] (Phase B) Security test matrix PB-S1–S12 | **PASS** | Covered by the 75-test run: forgery (TTS + video keys), Cliente 403, Operator GET `cost` without `cost_model`, Cliente schemas, no late INSERT, fail/cancel, immutability, no `video_jobs` SUM, estimate-only gate, closed reason, duration on video + TTS trusted. |

---

### CONTRACT Phase B call-site / FE / DTO

| Claim | Status | Evidence |
|-------|--------|----------|
| Video complete → `async_update` + duration; closed reason; no late INSERT; fail/cancel no UPDATE | **PASS** | `apply-video-job-status-update.ts` L84–131; tests L237–364. |
| Operator GET returns summary + `cost` | **PASS** | `route.ts` L60–74; `map-operator-video-job-dto.ts` L52–61; fixture match in `video-jobs.test.ts` L1024–1034. |
| FE `mergePolledStatus` copies `cost` | **PASS** | `OperatorVideoJobSummaryPanel.tsx` L173–194, L247–248. `formatCentsForDisplay` L21. `"use client"` justified (interval poll). No cents math. |
| TTS trusted `durationSec` on INSERT; leave TTS on `recordReelSpendEvent` | **PASS** | Trusted L153–163; Operator still INSERT actual; no `finalizeGenerationCost` in TTS modules. |
| No `/operator/production`; no US-7.4 reopen; no new tables | **PASS** | No production route; no Phase B `.sql` in `origin/main...HEAD`; rollup still `neuramark_reel_spend_events`. |
| Wan B-roll same poller writer | **PASS** | Test L489–515; create-path does not call finalize. |

---

### Convention Compliance (Phase B)

| Area | Status | Evidence |
|------|--------|----------|
| EN + ES | **PASS** | Reuses `scripts.videoJob` / `scripts.cost.actual.*` (no required new keys). |
| Server Components default / small client boundary | **PASS** | Poll panel already Client Component; GET is Route Handler. |
| PrimeReact-first | **PASS** | Panel still `Button` / `Message` / `Tag`. |
| Loading / empty / error / pending | **PASS** | Existing pending / unavailable / `—`; merge updates actual after complete without reload. |
| `getCurrentUser` / `requireOperator` | **PASS** | Poll first await; role never from request. |
| No Supabase in Client Components | **PASS** | Panel `fetch`s Next.js GET only. |
| Endpoints from concrete FE consumer | **PASS** | GET documented for `OperatorVideoJobSummaryPanel`. |
| `neuramark_` prefix / no speculative APIs | **PASS** | No new tables; no production list API. |

---

### Gaps (what blocks PASS)

None for **Phase B** frozen scope. Notes below do not block VALIDATE.

---

### Scope Creep

None observed. No `/operator/production`, no TTS migrate, no fail-row billed actual, no `ltx_broll_high`, no FFmpeg/branding spend, no budget-on-actuals, no Cliente cost, no US-7.4 query rewrite.

---

### Notes (PASS WITH NOTES rationale)

1. **No FE unit test** for `mergePolledStatus` — behavior is in `OperatorVideoJobSummaryPanel.tsx` L173–194; QA should smoke poll-after-complete.
2. **Webhook HTTP handler** is not in this slice. Cost authority is poller → adapter `fetchAsset` (`persist-video-job-output.ts`). `source: "webhook"` remains a typed enum only.
3. **TTS trusted duration tests** live in `lib/tts/synthesize-voiceover-for-reel-script.test.ts` (not a separate `synthesize-voiceover-for-client-trusted.test.ts` file). Coverage exists.
4. **GET 404 envelope** is `{ error: "NOT_FOUND" }` (string) vs 403 `{ error: { code: "FORBIDDEN" } }` — pre-existing US-8.4 shape; 403 fixture matches CONTRACT.
5. **Phase A VALIDATION text** below still says video/TTS “not wired” and “Phase B deferred” — historical; superseded by this amendment.

---

### Recommended Next Actions

| Action | Owner |
|--------|-------|
| QA Phase B (`QA.md`) — Operator poll cost after complete, Cliente 403, matrix smoke | qa-engineer |
| Do **not** check/uncheck USER_STORIES US-7.3 AC | product-owner (already [x] from Phase A) |

---

## Phase A (historical — 2026-08-29) — preserved

## Validation Report — US-7.3

**Branch:** `feature/US-7.3-actual-cost`  
**Validated:** 2026-08-29  
**Validator:** requirements-validator

### Verdict: PASS WITH NOTES

Phase A (LLM sync actual-cost persistence, Operator weekly/slot cost on `/operator/scripts`, security gates) is complete and matches the frozen CONTRACT. Phase B items (video/TTS async backfill, `/operator/production` cost column) are explicitly deferred and documented — not blockers for Phase A close.

### Test execution

```bash
npx tsx --test \
  lib/cost-policy/actual-cost.test.ts \
  lib/cost-policy/cost-policy.test.ts \
  lib/cost-policy/get-reel-cost-summary-for-week.test.ts \
  lib/reel-scripts/reel-scripts.test.ts \
  lib/reel-captions/reel-captions.test.ts \
  lib/agents/content/generate-reel-script.test.ts \
  lib/agents/content/generate-reel-caption.test.ts
```

**Result:** 151 tests, 0 failures.

---

### Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Every completed job has actual or `null` with failure reason | **PASS (Phase A — LLM only)** | `finalizeGenerationCost` (`lib/cost-policy/finalize-generation-cost.ts` L23–61) calls `computeLlmActualCost` then `recordReelSpendEvent` with `actualCostCents` or `actualCostUnavailableReason`. Wired from script orchestrator (`lib/reel-scripts/generate-reel-scripts-for-client.ts` L408–418) and caption orchestrator (`lib/reel-captions/generate-reel-captions-for-client.ts` L409+). Migration adds `actual_cost_unavailable_reason` + CHECK (`supabase/migrations/20260830510400_neuramark_reel_spend_events_actual_cost_reason.sql`). Tests: `actual-cost.test.ts` (compute + sync_insert), `get-reel-cost-summary-for-week.test.ts` (unavailable reason aggregation). **Note:** Video/TTS async jobs not wired (Phase B). |
| Dashboard aggregate cost per client per week (simple sum) | **PASS** | `getReelCostSummaryForWeek` (`lib/cost-policy/get-reel-cost-summary-for-week.ts`) aggregates per-slot and weekly totals; attached to `getReelScriptsForWeek` (`lib/reel-scripts/actions/get-reel-scripts-for-week.ts` L98–117). FE weekly footer in `components/scripts/ScriptsPageView.tsx` (`WeeklyCostFooter` L1772+). Tests: `get-reel-cost-summary-for-week.test.ts` (3 cases). |
| Operator-only: endpoint rejects non-operator sessions (403) | **PASS** | `getReelScriptsForWeek` calls `requireOperator("handler")` (L54) and returns `reelScriptForbiddenError()` on 403 (L39–41, L56–58). Test: `reel-scripts.test.ts` "non-operator read returns 403" (L948+). Cost data only on Operator action response (`costSummary` in `getReelScriptsForWeekSuccessSchema`, `lib/contracts/reel-script.ts` L93–94). |
| [SEC] `actual_cost_cents` written only by server-side job-completion handler from provider responses; no client endpoint can set/edit costs | **PASS** | Sole writer: `finalizeGenerationCost` (`import "server-only"`, `lib/cost-policy/finalize-generation-cost.ts` L1). Not exported as Server Action. Forbidden keys extended in `lib/contracts/cost-policy.ts` L87–104 (`actualCostCents`, `actual_cost_cents`, etc.). Tests: `actual-cost.test.ts` forbidden keys; `cost-policy.test.ts` rejects `actualCostCents` on generate input. `updateReelSpendEventActual` exported for Phase B seam only (`update-reel-spend-event-actual.ts`); unit-tested, not called in prod path. |

---

### Convention Compliance

| Area | Status | Evidence |
|------|--------|----------|
| EN + ES user-facing strings | **PASS** | `messages/en.json` L929–944, `messages/es.json` L929–944 (`scripts.cost.actual.*`). |
| Server Components by default | **PASS** | `app/(app)/operator/scripts/page.tsx` is Server Component; data via `getReelScriptsForWeek`. |
| PrimeReact-first UI | **PASS** | Cost column uses PrimeReact `Column` in `ScriptsPageView.tsx` L1005–1028. |
| Loading / empty / error states | **PASS** | Column hidden when `costSummary` absent (`showCostSummary` L462–463); `—` for empty slots (`renderEstimatedCostValue` / `renderActualCostValue`); weekly actual shows `—` when null (L1784–1787). |
| Auth via `requireOperator()` | **PASS** | Operator layout + handler gate on list action. |
| No Supabase in Client Components | **PASS** | Cost reads/writes server-only modules under `lib/cost-policy/`. |
| `neuramark_` DB prefix | **PASS** | Migration alters `neuramark_reel_spend_events`; index `neuramark_reel_spend_events_client_created_at_idx`. |
| Budget gate unchanged (estimates only) | **PASS** | `sum-reel-cumulative-cost-cents.ts` selects `estimated_cost_cents` only (L25). |

---

### Gaps (what blocks PASS)

None for **Phase A** scope as frozen in CONTRACT. Full USER_STORIES literal AC for all job types (video/TTS/production list) remains open until Phase B.

---

### Scope Creep

None observed. Implementation stays within CONTRACT Phase A: LLM orchestrators, spend-ledger DDL, Operator scripts cost column/footer, security extensions. No Cliente cost fields, no manual edit UI, no gate algorithm change.

---

### Notes (PASS WITH NOTES rationale)

1. **Phased acceptance (CONTRACT § Phased BUILD):** Video/TTS `async_update` path and `/operator/production` `OperatorProductionJobCostDto` are documented but not wired — correct per frozen contract, not a Phase A defect.
2. **USER_STORIES vs CONTRACT surface:** Story FE row says "production list"; CONTRACT Phase A routes cost to `/operator/scripts`. Implementation follows CONTRACT (FE signoff 2026-08-29). PO may update USER_STORIES DB row (`video_jobs.*`) to reflect spend-ledger canonical store.
3. **`sumReelActualCostCents` helper:** CONTRACT lists a standalone helper; aggregation is inlined in `getReelCostSummaryForWeek`. Behavior covered by tests; optional refactor for US-7.4 reuse.
4. **Security matrix S5/S7:** No dedicated grep/snapshot test for client Zod schemas or shared Reel DTO exclusion; partial coverage via `FORBIDDEN_BUDGET_SPEND_KEYS` + `findForbiddenReelScriptKeys` tests. Recommend qa-engineer add in QA gate.
5. **Orchestrator integration test:** Reel mutation tests mock `finalizeGenerationCost`; end-to-end assert that happy-path generate passes `llmUsage` with computed actual is not present (covered indirectly via `finalizeGenerationCost` + `computeLlmActualCost` unit tests).
6. **SiliconFlow adapter:** Returns `actualCostCents: 0` when `computeLlmActualCost` fails (`siliconflow-llm-adapter.ts` L109); orchestrator re-computes via `finalizeGenerationCost` from `llmUsage`, so spend row still gets null + reason when tokens missing.
7. **Downstream gates:** `QA.md` not yet authored; `TASKS.md` BE checklist boxes not updated in plan folder (implementation present).

---

### Recommended Next Actions

| Action | Owner |
|--------|-------|
| PO checks US-7.3 acceptance criteria in `USER_STORIES.md` for Phase A close | product-owner |
| Run `qa-engineer` gate (`QA.md`) — security matrix S5/S7, Operator UI smoke | qa-engineer |
| Wire Phase B: US-8.4 poller → `finalizeGenerationCost({ mode: "async_update" })`; US-9.3 TTS; production list column | media-pipeline-engineer + nextjs-frontend |
| Reconcile USER_STORIES DB row to spend ledger (optional doc hygiene) | product-owner |
