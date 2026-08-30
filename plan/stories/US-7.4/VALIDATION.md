## Validation Report — US-7.4

**Branch:** `feature/US-7.4-reel-cost-rollup`  
**Validated:** 2026-08-29  
**Validator:** requirements-validator

### Verdict: PASS WITH NOTES

Phase A (spend-ledger roll-up, batch attach on `getReelScriptsForWeek`, `ReelCostRollupPanel` in expand-row detail, variance + over-budget, reconciliation tests, Operator-only + response-shape exclusion) is complete and matches the frozen CONTRACT. Phase B (video / B-roll / TTS component lines when upstream spend writers land) is explicitly deferred — not a Phase A blocker.

### Test execution

```bash
npx tsx --test \
  lib/cost-policy/get-reel-cost-rollup-for-script.test.ts \
  lib/cost-policy/cost-policy.test.ts \
  lib/reel-scripts/reel-scripts.test.ts
```

**Result:** 65 tests, 0 failures.

---

### Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Every Reel shows one total actual cost including failed attempts and all asset roles (talking_head, broll, tts, llm where tracked) | **PASS WITH NOTE (Phase A)** | Shared aggregator `aggregateSpendEventsForReelScript` (`lib/cost-policy/aggregate-spend-events-for-reel-script.ts` L127–188) groups all four `asset_role` values and sums every spend row in scope. Per-Reel read `getReelCostRollupForScript` (`lib/cost-policy/get-reel-cost-rollup-for-script.ts` L33–134) queries `neuramark_reel_spend_events` only — no `video_jobs` / `media_assets` parallel SUM. FE `ReelCostRollupPanel` (`components/scripts/ReelCostRollupPanel.tsx`) renders server totals + component breakdown. **Note:** BUILD is Phase A — only LLM rows exist in prod today; video/TTS/B-roll lines appear automatically when US-8.x / US-9.3 INSERT ledger rows (CONTRACT § Phase B). Failed attempts **without** a spend row are excluded (PO lean TASKS #6; matches US-7.3). |
| Estimated vs actual variance visible per Reel | **PASS** | DTO includes `varianceCents` via `computeReelCostVarianceCents` (`lib/contracts/actual-cost.ts` L318–327; populated in `get-reel-cost-rollup-for-script.ts` L121–124). FE renders signed variance with color coding (`ReelCostRollupPanel.tsx` L94–111, L190–197). Test: `get-reel-cost-rollup-for-script.test.ts` "returns LLM component breakdown and totals". |
| Weekly per-client cost sum (US-7.3) reconciles with the sum of per-Reel totals | **PASS** | `getReelCostSummaryForWeek` refactored to delegate to shared aggregator (`lib/cost-policy/get-reel-cost-summary-for-week.ts` L12–16). Batch attach on list load (`lib/reel-scripts/actions/get-reel-scripts-for-week.ts` L88–131). Automated reconciliation test: `get-reel-cost-rollup-for-script.test.ts` "reconciliation: rollup vs weekly summary" — per-slot equalities + weekly sum invariants. |
| Operator-only: endpoint/action rejects non-operator sessions server-side (403) | **PASS** | `getReelScriptsForWeek` calls `requireOperator("handler")` first (`lib/reel-scripts/actions/get-reel-scripts-for-week.ts` L41–48) → `reelScriptForbiddenError()` on 403. Test: `reel-scripts.test.ts` "non-operator read returns 403". Roll-up helper is internal only (not a browser Server Action). |
| [SEC] Cost roll-up queries are parameterized and scoped to the requested client's Reels; cost data for other clients is never included | **PASS** | Script ownership check + tenant filter (`get-reel-cost-rollup-for-script.ts` L49–73): `.eq("client_id", clientId).eq("reel_script_id", reelScriptId)`. Foreign/missing script → `null` (`L60–61`). Test: "returns null for foreign or missing reelScriptId". |
| [SEC] Cost exclusion enforced at response-shape level — shared payloads contain NO cost fields; cost fields only in operator-gated endpoints | **PASS** | `reelScriptListItemSchema` unchanged — no cost keys (`lib/contracts/reel-script.ts` L63–80). `reelCostRollups` on Operator success schema only (`L98–99`), not on list items. `FORBIDDEN_REEL_COST_ROLLUP_KEYS` (`lib/contracts/cost-policy.ts` L108–125). Tests: forbidden rollup key denylist in `get-reel-cost-rollup-for-script.test.ts`. No Cliente loader imports `reelCostRollups` (grep). |

---

### Convention Compliance

| Area | Status | Evidence |
|------|--------|----------|
| EN + ES user-facing strings | **PASS** | `scripts.cost.rollup.*` in `messages/en.json` L945–962 and `messages/es.json` L945–962. Page wires copy via `app/(app)/operator/scripts/page.tsx` L155–161 (reuses `scripts.cost.actual.pending` / `unavailable`). |
| Server Components by default | **PASS** | `app/(app)/operator/scripts/page.tsx` is RSC; loads data via `getReelScriptsForWeek`. Client island: `ReelCostRollupPanel` (`"use client"`) for display formatting only — no Supabase, no client-side cost math. |
| PrimeReact-first UI | **PASS WITH NOTE** | Over-budget uses PrimeReact `Message`; pending uses `Tag` (`ReelCostRollupPanel.tsx` L146–156, L185). Component breakdown uses a plain HTML `<table>` (L200–280) — acceptable for a small read-only grid; not PrimeReact `DataTable`. |
| Loading / empty / error states | **PASS** | Empty: `—` + explanation when no components (`ReelCostRollupPanel.tsx` L138–142). Pending actual: `Tag` / subdued copy (L184–187, L80–81). Roll-up inherits list load — no separate lazy fetch (CONTRACT Phase A). Page error fallback zeroes `reelCostRollups` (`page.tsx` L68–69, L85–86). |
| Auth via `requireOperator()` | **PASS** | Operator layout + handler gate on list action; `clientId` from `operator.id` only (`get-reel-scripts-for-week.ts` L62). |
| No Supabase in Client Components | **PASS** | Roll-up modules `import "server-only"`. FE imports types + `formatCentsForDisplay` only. |
| Backend maps to concrete FE consumer | **PASS** | `getReelScriptsForWeek` → `/operator/scripts` expand-row `ReelDetailPanel` (`ScriptsPageView.tsx` L1087–1118). |
| `neuramark_` DB prefix | **PASS** | Reads existing `neuramark_reel_spend_events` / `neuramark_reel_scripts` — no new tables. |

---

### Gaps (what blocks PASS)

None for **Phase A** scope as frozen in CONTRACT. Full literal USER_STORIES coverage for video/B-roll/TTS economics and failed-attempt rows without ledger entries remains open until Phase B upstream writers.

---

### Scope Creep

None observed. No new routes, no spend writes, no budget gate changes, no Cliente cost fields, no standalone `/operator/costs` dashboard.

---

### Notes (PASS WITH NOTES rationale)

1. **Phased BUILD (CONTRACT § Phase A / B):** Component breakdown may show LLM-only today with muted `phaseNote` (`ReelCostRollupPanel.tsx` L120–121, L283–287). Video / voiceover lines appear when ledger rows exist — no FE/BE query change required.
2. **Week-scoped roll-ups:** Phase A freezes `eventScope: "week"` for list attach (`get-reel-cost-rollup-for-script.ts` L39–41, L72–73) — reconciles with US-7.3 weekly footer, not lifetime detail. PO may add lazy lifetime fetch later (CONTRACT reserves `lifetime`).
3. **Failed attempts:** Only billable paths with spend ledger INSERTs are counted (TASKS open question #6). Matches US-7.3; AC wording "failed attempts" is satisfied when US-8.4 writes failure rows.
4. **No public rollup Server Action:** Roll-up is batch-attached only — no browser-invokable `getReelCostRollupForScriptAction` in Phase A (CONTRACT compliant; SECURITY condition for lazy action deferred).
5. **USER_STORIES DB row:** Story still mentions `video_jobs` + `media_assets.cost_cents`; CONTRACT supersedes with spend-ledger-only authority. PO should amend USER_STORIES at story close.
6. **Security matrix S2:** No dedicated snapshot test parsing a sample list item for absent cost keys; verified by `reelScriptListItemSchema` shape inspection (`lib/contracts/reel-script.ts` L63–80). Recommend qa-engineer add in QA gate.
7. **Orchestrator gates:** `QA.md` not yet authored; `TASKS.md` orchestrator checkboxes (SPEC-REVIEW, VALIDATION, QA) remain open in plan folder despite implementation landing.

---

### Recommended Next Actions

| Action | Owner |
|--------|-------|
| Check off US-7.4 acceptance criteria in `plan/USER_STORIES.md` after PO review | product-owner |
| Author `plan/stories/US-7.4/QA.md` — add S2 list-item snapshot + Cliente grep matrix | qa-engineer |
| Wire video/TTS/B-roll spend rows (Phase B) via US-8.x / US-9.3 — roll-up query unchanged | media-pipeline-engineer / nextjs-backend |
| Amend USER_STORIES DB row to spend-ledger canonical store | product-owner |
