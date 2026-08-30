## Spec Review — US-7.4

### Verdict: GAPS

US-7.4 intent — the **Operator** sees the **full actual cost of each Reel** (video jobs, retries, B-roll, TTS, tracked LLM) rolled up in one place with **estimated vs actual variance**, a **component breakdown**, and **over-budget highlight**; weekly per-client cost (US-7.3) **reconciles** with the sum of per-Reel totals; all cost surfaces remain **Operator-only** with **response-shape exclusion** for **Cliente** — is **directionally aligned** with SPEC §3 **Cost Policy Engine** (S3.M8: Operator sees estimados; Cliente never sees/envía costos), SPEC §6 sensitive data (presupuesto server-only), `plan/SECURITY_BASELINE.md` §(f), USER_STORIES economics conventions, and frozen **US-7.1** / **US-7.3** handoffs (`neuramark_reel_spend_events` as reporting ledger; actuals are reporting-only; gate stays on **`estimated_cost_cents`**).

**Gaps** sit between USER_STORIES § US-7.4 acceptance criteria / owner table and what must be frozen in **CONTRACT.md** before BUILD: USER_STORIES still names **`video_jobs` + `media_assets.cost_cents`** as the query surface (conflicts with frozen US-7.3 ledger), **failed-attempt inclusion** conflicts with US-7.3 success-only spend rows, per-Reel **component breakdown DTO** and **detail read API** are undefined, **variance / over-budget** rules are unspecified, **weekly ↔ per-Reel reconciliation** semantics are not frozen against existing `getReelCostSummaryForWeek` week scoping, FE **Reel detail** surface is ambiguous, and **upstream Phase B** (US-7.3 video/TTS actuals, **US-9.3** TTS spend) is not shipped — so full AC cannot close on LLM-only data today. Story intent does not drift from SPEC; unresolved contract shape and dependency phasing are the blockers.

**Upstream dependencies:**

| Dependency | Status | Notes for US-7.4 |
|------------|--------|------------------|
| **US-7.3** Phase A | ✅ CLOSED | LLM actuals on spend ledger; `getReelCostSummaryForWeek` + `/operator/scripts` slot totals + weekly footer |
| **US-7.3** Phase B | ⏳ Deferred | Video/TTS `async_update`, `duration_sec`, production-list column — required for `talking_head`, `broll`, `tts` actuals in roll-up |
| **US-9.3** | ⏳ Not shipped | TTS spend events + voiceover costs — explicit Depends in USER_STORIES |
| **US-8.2+** / **US-8.4** | ⏳ Not shipped | `neuramark_video_jobs`, retries, poller completion — billable retry attempts as spend rows |
| **US-7.1** | ✅ | `max_cost_cents` cap for over-budget highlight source; gate unchanged |
| **US-14.5** | ✅ | `requireOperator()` floor |

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **High** | **Dual canonical store (again).** USER_STORIES DB row: “query over `video_jobs` + TTS asset costs (add `media_assets.cost_cents`).” Frozen **US-7.3 CONTRACT**: **`neuramark_reel_spend_events`** is the **single reporting ledger** for all asset roles (`llm`, `tts`, `talking_head`, `broll`); `neuramark_video_jobs` may mirror costs for job UI but **must not** be the sole store for LLM/TTS actuals. | USER_STORIES US-7.4 DB row; US-7.3 CONTRACT L20, L655–665; US-7.1 CONTRACT L622–647 | CONTRACT: **`getReelCostRollup({ reelScriptId })`** queries **`neuramark_reel_spend_events`** only — `SUM(estimated_cost_cents)`, `SUM(actual_cost_cents)` where not null, grouped by `asset_role` + optional per-event rows for retries. **No** `media_assets.cost_cents` unless CONTRACT defines it as a **denormalized mirror** with dedup rule vs spend ledger (PO lean: **ledger-only, no new column**). Amend USER_STORIES DB row at CONTRACT freeze. |
| **High** | **Failed attempts AC vs frozen spend semantics.** AC: “total actual cost including **failed attempts**.” US-7.3 frozen: **success-only spend rows** — failed LLM jobs get **no** ledger row; video retries (US-8.4) get **one spend event per billable attempt** on success paths only. | USER_STORIES US-7.4 AC; US-7.3 CONTRACT Phase A rules; US-7.3 README PO #7 | CONTRACT: freeze definition — **(A)** roll-up sums **all spend events** for `reel_script_id` (each retry/regenerate that completed I/O and INSERTed a row); **(B)** separately surface **failed job count / last failure** from `neuramark_video_jobs` (Operator-only, no cost) — **not** mixed into `actual_cost_cents` unless PO adds spend rows on provider-billed failures. Default: **(A)** aligned with US-7.3; amend AC wording or add Phase B rule for provider-charged failures. |
| **High** | **Per-Reel read API / DTO undefined.** BE row: “expose to Reel detail and weekly dashboard sum.” US-7.3 ships **weekly slot summary** only (`ReelSlotCostSummary` — totals, no component lines). No `getReelCostRollup`, no Zod schema, no action/route, no lazy-fetch vs batch contract. | USER_STORIES US-7.4 BE/FE rows; US-7.3 CONTRACT L334–417; `lib/contracts/actual-cost.ts` | CONTRACT: **`getReelCostRollupForScript({ reelScriptId })`** — `requireOperator()`; verify `reel_script_id` ∈ session `client_id`; return **`ReelCostRollupDto`**: `estimatedTotalCents`, `actualTotalCents`, `varianceCents`, `isOverBudget`, `maxCostCents` (from `getCostPolicyForClient`), `hasPendingActual`, `components[]` (`assetRole`, `estimatedCents`, `actualCents`, `attemptCount`, `unavailableReasonKeys`), `events[]` optional for expand (spend event id, `jobKind`, `providerKey`, cents, `createdAt`). Wire via **`getReelScriptsForWeek`** batch map **or** lazy Server Action on `ReelDetailPanel` expand — freeze one pattern. |
| **High** | **Component breakdown mapping undefined.** FE AC: breakdown by “video, B-roll, voiceover.” Ledger uses `asset_role`: `talking_head`, `broll`, `tts`, `llm`. No i18n keys, no grouping rule (collapse `talking_head` + `broll` into “video” or show four lines). | USER_STORIES US-7.4 FE; CONTEXT **Modo visual** / asset roles; US-7.1 `asset_role` CHECK | CONTRACT: freeze **four component lines** — `llm`, `talking_head`, `broll`, `tts` — with EN/ES labels (`scripts.cost.rollup.component.llm`, `.talkingHead`, `.broll`, `.tts`). Optional UI grouping “video” = `talking_head` + `broll` subtotal — document in CONTRACT if PO wants collapsed “video” row. |
| **High** | **Variance + over-budget rules unspecified.** AC: “Estimated vs actual variance visible”; “over-budget highlight.” No formula: variance = `actual - estimated`? `actual - max_cost_cents`? Highlight when `actualTotal > maxCostCents` (US-7.1 per-Reel cap) or when `actual > estimated`? Budget gate uses **cumulative estimated** spend, not actuals. | SPEC §3 Cost Policy Engine; US-7.1 `max_cost_cents`; USER_STORIES US-7.4 AC | CONTRACT: **`varianceCents = actualTotalCents - estimatedTotalCents`** (null actual → show pending, no variance number). **`isOverBudget = actualTotalCents !== null && actualTotalCents > maxCostCents`** where `maxCostCents` from `getCostPolicyForClient(clientId)` — matches Operator mental model of per-Reel cap. **Non-goal:** changing budget gate to actuals. FE: visual highlight (e.g. danger tone) when `isOverBudget`; secondary hint when `varianceCents > 0` but under cap — freeze in UI-SPEC or CONTRACT. |
| **Medium** | **Weekly reconciliation AC vs existing aggregation.** AC: “Weekly per-client cost sum (US-7.3) reconciles with the sum of per-Reel totals.” `getReelCostSummaryForWeek` scopes events by **`created_at` in [weekStart, weekStart+7d)** and maps to **strategy slots** via `reel_script_id`. Per-Reel roll-up sums **all events for that `reel_script_id`** (no week filter). Mismatch if spend events fall outside week window or slot `reel_script_id` changes mid-week. | US-7.3 CONTRACT aggregation rules L379–389; USER_STORIES US-7.4 AC | CONTRACT: reconciliation rule — **`weeklyActualCostCents` === sum of `ReelCostRollupDto.actualTotalCents` for each slot in `costSummary.slots` where `actualTotalCents` not null**, using **same week scope on events** for both queries OR document exception when roll-up is lifetime-per-script and weekly footer is time-bounded (PO must pick one). PO lean: **both use events with `created_at` in week window** for weekly footer; per-Reel detail shows **all-time for that script** with subtitle “includes regenerations” — freeze explicitly. |
| **Medium** | **FE surface not frozen.** AC: “Cost section on **Reel detail**.” Today Operator “Reel detail” = expand-row **`ReelDetailPanel`** on `/operator/scripts` (`ScriptsPageView.tsx`) — Script/Caption tabs + `ProviderRecommendationPanel`; no Cost block. No separate `/operator/reels/[id]` route. | US-7.2 CONTRACT FE signoff (expand-row layout); USER_STORIES US-7.4 FE | CONTRACT: add **`ReelCostRollupPanel`** inside **`ReelDetailPanel`** (above tabs or dedicated “Costo” section) — Operator-only route; reuse `costSummary` when present **or** lazy `getReelCostRollupForScript` on expand. EN/ES `scripts.cost.rollup.*`. **Forbidden:** cost fields on Cliente approval preview / dashboard / shared `reelScriptListItemSchema` for Cliente paths. |
| **Medium** | **Depends line incomplete for full AC.** Depends: US-7.3, US-9.3. Full roll-up needs **US-7.3 Phase B** (video/TTS actuals) and **US-8.x** spend INSERTs for `talking_head` / `broll`. Sprint state: US-7.3 Phase A closed; video pipeline not landed. | USER_STORIES US-7.4 Depends; `docs/development/SPRINT-STATE.md`; US-7.3 phased acceptance | CONTRACT: **phased BUILD** — Phase A: LLM-only component lines + variance + over-budget on `/operator/scripts` expand panel; weekly reconciliation test with Phase A data. Phase B: add `talking_head`, `broll`, `tts` when US-7.3 Phase B + US-9.3 land. Depends line: add **US-7.3 Phase B** (soft), **US-8.2+** (soft). |
| **Medium** | **Multi-tenancy [SEC] carry-forward.** AC: roll-up queries scoped to requested client’s Reels. US-7.3 derives `clientId` from `requireOperator()` — no foreign `clientId` in request. Per-Reel endpoint must **verify `reel_script_id` belongs to session client** (IDOR → 404, not 403 oracle). | USER_STORIES US-7.4 [SEC]; US-7.1 SECURITY IDOR pattern; SECURITY_BASELINE §(f) | CONTRACT: `getReelCostRollupForScript` — `verifyReelScriptBelongsToClient(reelScriptId, operatorClientId)` before SELECT; parameterized SQL `WHERE client_id = $1 AND reel_script_id = $2`; security test matrix S4/S5 extension. |
| **Medium** | **Cliente response-shape exclusion [SEC].** AC names Reel detail, dashboard, approval package as shared payloads that must contain **no** cost fields. Today Cliente does not load `/operator/scripts`; future US-11.x approval package must not import rollup DTO. | SECURITY_BASELINE §(f); USER_STORIES US-7.4 [SEC]; US-7.3 forbidden keys | CONTRACT: extend **`FORBIDDEN_BUDGET_SPEND_KEYS`** / shared serializer denylist with `varianceCents`, `isOverBudget`, `components`, `costRollup`; regression test: Cliente `getReelScriptsForWeek` (if ever exposed) and approval serializers grep-clean. |
| **Low** | **`sumReelActualCostCents` helper drift.** US-7.3 CONTRACT listed standalone helper; implementation inlined in `getReelCostSummaryForWeek` (QA L1). US-7.4 needs per-`reel_script_id` SUM for roll-up — risk of duplicated aggregation logic. | US-7.3 QA L1; US-7.3 VALIDATION | CONTRACT: extract **`aggregateSpendEventsForReel(reelScriptId)`** shared by weekly summary and roll-up — single aggregation module in `lib/cost-policy/`. |
| **Low** | **Manual jobs (`actual = 0`).** US-7.3 Phase B: manual upload `actual_cost_cents = 0`. Roll-up must count zero in `actualTotalCents`, not treat as pending. | US-7.3 CONTRACT manual rule; US-8.3 | CONTRACT: manual events included in component line for `talking_head` (or dedicated `manual` label); `hasPendingActual` false when actual is `0`. |
| **Low** | **Provider pricing / cap leakage.** Over-budget UI needs `maxCostCents` in Operator DTO only — not full `cost_model` or catalog rows. | SPEC §3; US-X.4 catalog secrecy | CONTRACT: `ReelCostRollupDto.maxCostCents` integer only; no `provider_key` pricing in Cliente-facing paths (Operator roll-up may show `providerKey` per event line — freeze allowlist). |
| **Info** | **ADRs respected.** Roll-up is read-only reporting on server; no client write path; long-running job actuals still finalized server-side / trusted worker (ADR-0003). No publish or Cliente cost exposure (ADR-0002). | ADR-0001–0003; SPEC §5–6 | Do not expose roll-up SQL via generic query endpoints. |
| **Info** | **Out of scope held:** Cliente cost visibility, catalog/pricing CRUD, budget gate on actuals, RBAC UI, margin dashboard/charts beyond per-Reel section, Stories IG, multicanal, ads, Operator manual cost edit. | SPEC §1; USER_STORIES; US-7.3 out-of-scope | US-7.4 = per-Reel economics section + reconciliation — not full P&L dashboard. |
| **Info** | **Metrics Lite (P2) adjacent.** SPEC §3 Metrics Lite is performance metrics, not unit cost — do not conflate with US-7.4. | SPEC §3 P2 | Keep cost roll-up under Cost Policy module only. |

---

### Terminology violations (CONTEXT)

**None that block** in USER_STORIES § US-7.4 title/AC (uses “Operator”, “Reel”, component names in plain language).

Product-facing EN/ES for US-7.4 FE + CONTRACT must use:

| Prefer | _Evitar_ |
|--------|----------|
| **Costo estimado** / **Costo real** | estimated vs actual without labels |
| **Desglose por componente** | cost breakdown (generic) |
| **Voz en off** / **voiceover** (EN label ok in EN locale) | TTS as user-facing primary label |
| **B-roll / sin presencia** | faceless (user-facing) |
| **Operator** | admin, administrador, staff |
| **Cliente** | prestador, dueño, usuario final (as product role) |
| **Reel** | piece, content item (generic) |
| **Política de costo** (cap context only) | max_cost as loose business headline |

Avoid “unit economics” in Cliente copy; Operator UI may use “economía unitaria” / “unit economics” in internal dashboards only.

Map ledger `asset_role` to UI copy — not raw enum strings in ES locale.

---

### Blockers for SECURITY / CONTRACT

| Item | Blocks? | Guidance |
|------|---------|----------|
| Ledger-only roll-up query (`neuramark_reel_spend_events`) | **Yes — core AC** | Reject USER_STORIES `video_jobs` + `media_assets.cost_cents` as canonical. |
| `ReelCostRollupDto` + `getReelCostRollupForScript` | **Yes — BE/FE AC** | Operator-only; tenant-scoped. |
| Component breakdown + variance + over-budget rules | **Yes — AC literal** | Freeze formulas and `maxCostCents` source. |
| Weekly ↔ per-Reel reconciliation semantics | **Yes — AC** | Align with `getReelCostSummaryForWeek` or amend AC. |
| Failed-attempt definition | **Yes — AC ambiguity** | Reconcile with US-7.3 success-only rows. |
| FE surface (`ReelDetailPanel` vs new route) | **Yes — FE AC** | Freeze expand-row Cost section. |
| Phased BUILD vs US-9.3 / US-7.3 Phase B | **Yes — sprint reality** | Phase A LLM-only acceptable with explicit deferral. |
| Cliente serializer exclusion | **Yes — [SEC]** | Extend forbidden keys + tests. |
| Shared `aggregateSpendEventsForReel` | **No — quality** | Prevents drift vs US-7.3. |

**SPEC blockers on intent:** none. **ADR breaches:** none if roll-up stays read-only server-side and actuals remain adapter-sourced via US-7.3 finalize path.

---

### Recommended action

Proceed to **SECURITY.md** then **CONTRACT.md** with these **non-negotiable freezes**:

1. **`neuramark_reel_spend_events`** — sole source for per-Reel roll-up; group by `asset_role`; include all spend rows for `reel_script_id` per frozen failed-attempt rule.
2. **`getReelCostRollupForScript`** + **`ReelCostRollupDto`** — `requireOperator()`; IDOR-safe; components + totals + variance + `isOverBudget` + `maxCostCents`.
3. **Variance** — `actualTotal - estimatedTotal`; **over-budget** — `actualTotal > maxCostCents` (reporting only; gate unchanged).
4. **Reconciliation** — explicit equality rule between `costSummary.weeklyActualCostCents` and sum of per-slot roll-ups (same time scope — CONTRACT picks week-bounded vs script-lifetime).
5. **FE** — **`ReelCostRollupPanel`** in **`ReelDetailPanel`** on `/operator/scripts`; EN/ES `scripts.cost.rollup.*`; no Cliente cost keys.
6. **Phased BUILD** — Phase A: LLM lines only; Phase B: video/TTS when US-7.3 Phase B + US-9.3 land.
7. **Amend USER_STORIES DB row** — remove `video_jobs` / `media_assets.cost_cents` as canonical; point to spend ledger.
8. **Security** — extend forbidden keys; multi-tenant tests; no cost on approval/dashboard shared DTOs.
9. **Extract shared aggregation** — `aggregateSpendEventsForReel` used by weekly summary and roll-up.

Do not check off USER_STORIES acceptance criteria in this gate.
