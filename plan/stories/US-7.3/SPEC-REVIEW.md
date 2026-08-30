## Spec Review — US-7.3

### Verdict: GAPS

US-7.3 intent — the **Operator** records **real API cost** per **Job de generación** (estimated vs actual) to learn true unit economics; every completed job has `actual_cost_cents` or `null` with a failure reason; weekly per-client cost is summable; cost surfaces are **Operator-only** with server-side writes from provider responses only — is **directionally aligned** with SPEC §3 **Cost Policy Engine** (S3.M8: Operator sees estimados; Cliente never sees/envía costos), SPEC §6 sensitive data (presupuesto server-only), `plan/SECURITY_BASELINE.md` §(f) response-shape exclusion for Cliente, USER_STORIES Conventions economics, and frozen **US-7.1** / **US-7.2** handoffs (spend ledger + decision log at estimate time; actuals are a separate backfill path; cumulative **gate** stays on **`estimated_cost_cents` only**).

**Gaps** sit between USER_STORIES § US-7.3 acceptance criteria / owner table and what must be frozen in **CONTRACT.md** before BUILD: dual persistence model (`video_jobs` vs `neuramark_reel_spend_events`), LLM/TTS actual-cost write path, failure-reason schema, duration column ownership, weekly aggregate endpoint/surface, production-list FE route, job-completion writer authority (Vercel poller vs Fly worker per ADR-0003), and phased dependency on **US-8.4** when `neuramark_video_jobs` may still be landing. Story intent does not drift from SPEC; unresolved contract shape is the blocker.

**Upstream dependencies satisfied or frozen:** **US-7.1** ✅ (`neuramark_reel_spend_events` with nullable `actual_cost_cents`; `recordReelSpendEvent`; gate uses `SUM(estimated_cost_cents)` only; explicit US-7.3 backfill note). **US-7.2** ✅ (`neuramark_provider_decisions` estimate-time audit; `resolveProviderForJob`; adapter contracts expose `actualCostCents` on `LlmCompletionResult` / `storedMediaAssetSchema`; actual backfill explicitly US-7.3). **US-14.5** ✅ (`requireOperator()` floor). **US-8.1** ✅ (adapter result shapes include `actualCostCents`). **Partial / downstream:** **US-8.4** (job status UI = “production list”; poller writes status) · **US-8.2+** (`neuramark_video_jobs` DDL) · **US-9.3** (TTS spend events + `media_assets` voiceover) — not in Depends line but required for full per-Reel economics before **US-7.4**.

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **High** | **Dual canonical store conflict.** USER_STORIES DB row: `video_jobs.estimated_cost_cents`, `actual_cost_cents`. Frozen **US-7.1 CONTRACT**: **`neuramark_reel_spend_events`** is the Reel-scoped spend ledger; `actual_cost_cents` nullable for **US-7.3 backfill**; LLM jobs already INSERT spend rows (actual always null today). LLM/TTS never use `video_jobs`. | USER_STORIES US-7.3 DB row; US-7.1 CONTRACT L211, L622–647; US-7.4 “query over `video_jobs` + TTS” | CONTRACT: freeze **single reporting ledger** — **`neuramark_reel_spend_events`** is canonical for all asset roles (`llm`, `tts`, `talking_head`, `broll`); **`backfillReelSpendActual({ spendEventId \| jobKind + reelScriptId, actualCostCents, durationSec?, failureReason? })`** UPDATE on completion. **`neuramark_video_jobs`** may mirror `estimated_cost_cents` / `actual_cost_cents` / `duration_sec` for job polling UI but **must not** be the sole store for LLM actuals. Document sync rule: video job complete → UPDATE matching spend event (or INSERT spend + UPDATE job). |
| **High** | **LLM actual-cost write path undefined.** Adapters already return `actualCostCents` (`llmCompletionResultSchema`). US-7.1 inserts spend events **after** LLM success with `actualCostCents: null`. AC: “Every **completed** job has actual or null with failure reason” — no helper, timing, or idempotency for backfill. | USER_STORIES US-7.3 AC; `lib/contracts/providers.ts` L205–210; US-7.1 `recordReelSpendEvent` | CONTRACT: extend script/caption orchestrators — after `complete()`, call **`applyActualCostToSpendEvent({ reelScriptId, jobKind, actualCostCents })`** on the row inserted by `recordReelSpendEvent` (same transaction or immediate follow-up). Failed LLM: **no** spend row (7.1 rule) — failure reason lives on job/audit only; AC “completed job” = successful I/O paths only unless CONTRACT adds failed-attempt rows (PO lean: **success-only spend rows; null actual only when provider returns no billing data**). |
| **High** | **Job-completion handler ownership unset.** AC [SEC]: `actual_cost_cents` written only by server-side **job-completion handler** from provider responses. ADR-0003: Fly worker updates `neuramark_*` job state. Unclear whether Vercel poller, worker, or both may write actuals — risk of client-callable UPDATE or duplicate writers. | USER_STORIES US-7.3 [SEC]; ADR-0003; US-8.4 poller/webhook; SECURITY_BASELINE §6 spend authority | CONTRACT: freeze **`finalizeGenerationCost()`** (`import "server-only"`) — sole writer of `actual_cost_cents`; invoked only from (1) LLM orchestrator post-`complete()`, (2) video status poller / authenticated webhook handler after validated terminal status, (3) TTS orchestrator post-synthesize. **Forbidden:** any Server Action / Route Handler accepting `actualCostCents` from request body; Client Components. Fly worker may call shared module via service-role **only** if worker owns poll-complete — document one writer path per job. |
| **High** | **Depends on US-8.4 but BUILD scope spans pre–`video_jobs`.** Depends: US-7.2, US-8.4. Sprint 5 schedules US-7.3 with US-8.5/9.x; `neuramark_video_jobs` ships US-8.2+. AC “cost column on **production list**” is US-8.4 FE. Without phased CONTRACT, 7.3 blocks on full video pipeline. | USER_STORIES US-7.3 Depends; Sprint 4–5 split; US-8.4 AC | CONTRACT: **phased acceptance** — Phase A: LLM spend backfill + Operator weekly sum API (no production list). Phase B: video/TTS rows when US-8.4 + US-9.3 land. BUILD may close Phase A AC for LLM + aggregate; video column follows 8.4 surface. |
| **Medium** | **Failure reason schema undefined.** AC: “actual or `null` with **failure reason**.” No column on spend events or `video_jobs`; US-8.4 has `sanitizedErrorMessage` on status only. | USER_STORIES US-7.3 AC; US-8.1 `videoJobStatusResultSchema` | CONTRACT: add nullable **`cost_finalize_failure_reason`** (text, max 500, sanitized) on **`neuramark_reel_spend_events`** OR document that `null` actual + reason uses existing job `failure_reason` join — not split across invisible tables. Freeze: **`actual_cost_cents IS NULL`** allowed only when `failure_reason` set **or** provider omitted billing (enum `cost_unavailable`). |
| **Medium** | **Duration persistence unspecified.** BE row: “persist … **duration**”; DB owner table omits it. `storedMediaAssetSchema` has `durationSec`; video jobs need duration for per-second providers. | USER_STORIES US-7.3 BE/DB rows; `lib/contracts/providers.ts` L160–166 | CONTRACT: add **`duration_sec`** nullable on **`neuramark_reel_spend_events`** (reporting) and **`neuramark_video_jobs`** (job row); populated from adapter/asset metadata on complete. LLM jobs: duration optional null. |
| **Medium** | **Weekly per-client aggregate undefined.** AC: “Dashboard aggregate cost per client per week (simple sum).” No route, week boundary (`week_start` vs calendar ISO), or inclusion rules (estimated vs actual vs both). US-7.4 AC requires reconciliation with per-Reel totals. | USER_STORIES US-7.3 AC; US-7.4 AC; SPEC §3 Metrics Lite (P2) — adjacent but not same | CONTRACT: **`getOperatorWeeklyClientCostSummary({ weekStart, clientId? })`** Server Action — `requireOperator()`; sum **`actual_cost_cents`** where not null else **`estimated_cost_cents`** (PO lean: **actual-first fallback to estimate** for open jobs); scope `client_id` + `created_at` in `[weekStart, weekStart+7d)`; return minimal DTO — no provider pricing. FE: Operator dashboard widget or `/operator/costs` — freeze route in CONTRACT. |
| **Medium** | **Production list FE surface not frozen.** AC: “Cost column on production list; estimated vs actual.” US-7.2 SPEC-REVIEW referenced “future `/operator/production`”; US-8.4 owns job status UI. No column spec, i18n keys, or DTO allowlist. | USER_STORIES US-7.3 FE; US-8.4; US-7.2 CONTRACT Operator DTO pattern | CONTRACT: **`OperatorProductionJobCostDto`** — `jobId`, `reelScriptId`, `estimatedCostCents`, `actualCostCents`, `costStatus` (`actual` \| `estimated_only` \| `pending` \| `unavailable`); extend US-8.4 list/query; EN/ES `production.cost.*`; **no** fields on Cliente job poll payloads. |
| **Medium** | **TTS actual cost path missing from Depends.** TTS is `asset_role: "tts"` on spend ledger (US-7.1); US-9.3 AC: “TTS cost included in job estimate.” US-7.4 depends on US-9.3 for voiceover costs. US-7.3 Depends omits US-9.3. | USER_STORIES US-7.3 Depends; US-9.3 AC; US-7.1 call-site table | CONTRACT: add **US-9.3** as soft dependency for Phase B; TTS complete → `recordReelSpendEvent` + `applyActualCostToSpendEvent`; optional `media_assets.cost_cents` mirror for US-7.4 only if CONTRACT defines dedup vs spend ledger. |
| **Medium** | **Operator-only enforcement carry-forward.** AC [SEC] 403 for non-operator. US-7.1/7.4 require response-shape exclusion on **all** endpoints Cliente can hit. US-7.3 weekly aggregate + production column must not leak via shared serializers. | SECURITY_BASELINE §(f); USER_STORIES US-7.4 [SEC]; US-7.1 SECURITY | CONTRACT: all US-7.3 reads via `requireOperator()`; forbidden keys on any shared Reel DTO (`actualCostCents`, `estimatedCostCents`, `weeklyCostSum`); regression test matrix mirroring US-7.4 list. |
| **Low** | **Manual upload jobs: actual = 0, not null.** US-8.3 bypasses API charges; catalog `manual` is zero cost. Null actual on manual rows would break weekly sums and US-7.4 rollup. | USER_STORIES US-8.3; US-X.4 `manual` row; US-7.1 manual skip | CONTRACT: on manual job complete, set **`actual_cost_cents = 0`** with `provider_key = manual`; `costStatus = actual`. |
| **Low** | **Cumulative gate must not switch to actuals.** US-7.1 SECURITY future note asked estimate vs actual for gate; US-7.1 CONTRACT frozen: **gate uses `estimated_cost_cents` only**. US-7.3 must not change `sumReelCumulativeCostCents` without new story. | US-7.1 CONTRACT L211; US-7.1 SECURITY L199 | CONTRACT: explicit **non-goal** — actuals for **reporting only** in 7.3; no change to `assertReelBudgetAllowsSpend`. |
| **Low** | **Provider + duration on complete.** BE row says persist provider; spend events already have `provider_key` at INSERT. Video retries (US-8.4) create new jobs — each needs own spend row + actual backfill. | US-8.4 lineage `parent_job_id`, `attempt` | CONTRACT: one spend event per **billable attempt**; actual backfill keyed by spend event `id` or (`reel_script_id`, `job_kind`, `created_at`) with idempotency token from `external_job_id`. |
| **Info** | **Estimate vs actual analytics preserved.** US-7.2 `neuramark_provider_decisions` remains estimate-time audit; US-7.3 does not UPDATE decision log — aligns with US-7.2 SECURITY future note. | US-7.2 SECURITY L184; US-7.2 CONTRACT out-of-scope | Keep decision log append-only; variance analysis joins decisions ↔ spend events on `reel_script_id` + time proximity — optional analytics, not AC. |
| **Info** | **Adapter contracts ready.** `LlmCompletionResult.actualCostCents`, `storedMediaAssetSchema.actualCostCents` exist in `lib/contracts/providers.ts` — BUILD can consume without schema drift. | US-8.1; SPEC §3 Video Provider | CONTRACT references these types; forbid parallel ad-hoc cost fields on adapter responses. |
| **Info** | **ADRs respected.** Cost finalize on server/trusted worker only (ADR-0003); no publish or Cliente cost exposure (ADR-0002); cron path uses same orchestrators (ADR-0001). | ADR-0001–0003; SPEC §5–6 | Do not expose cost finalize RPC to browser or unauthenticated webhooks. |
| **Info** | **Out of scope held:** per-Reel rollup UI + variance highlight (US-7.4), Cliente cost visibility, catalog/pricing CRUD, gate algorithm change, RBAC UI, Stories IG, multicanal, ads. | SPEC §1; USER_STORIES phase split | US-7.3 = persist actuals + Operator list/weekly sum — not full Reel economics dashboard. |

---

### Terminology violations (CONTEXT)

**None that block** in USER_STORIES § US-7.3 title/AC (uses “Operator”, “Reel”, “generation job” in acceptable technical sense).

Product-facing EN/ES for US-7.3 FE + CONTRACT must use:

| Prefer | _Evitar_ |
|--------|----------|
| **Política de costo** (settings context only) | cost policy as primary ES headline |
| **Costo estimado** / **Costo real** | estimated vs actual without labels (always pair in UI) |
| **Job de generación** | generation job (user-facing EN) |
| **Operator** | admin, administrador, staff |
| **Cliente** | prestador, dueño, usuario final (as product role) |
| **Reel** | piece, content item (generic) |

Avoid “unit economics” in Cliente copy; Operator UI may use “economía unitaria” / “unit economics” in internal dashboards only.

---

### Blockers for SECURITY / CONTRACT

| Item | Blocks? | Guidance |
|------|---------|----------|
| Canonical ledger + `finalizeGenerationCost()` | **Yes — core AC** | Single server-only writer; reconcile `reel_spend_events` vs `video_jobs`. |
| LLM backfill on existing spend rows | **Yes — shippable Phase A** | Wire script/caption orchestrators first. |
| Failure reason + duration columns | **Yes — AC literal** | Freeze on spend events (and job mirror if needed). |
| Operator weekly sum API + 403 | **Yes — AC** | `requireOperator()`; scoped `client_id`. |
| Production list cost DTO | **Yes — FE AC** | Coordinate with US-8.4 CONTRACT extension. |
| Phased BUILD vs US-8.4 | **Yes — sprint reality** | Phase A without blocking on `video_jobs`. |
| Cliente response-shape exclusion | **Yes — [SEC]** | Mirror US-7.4 forbidden cost fields. |
| Manual `actual_cost_cents = 0` | **No — if frozen** | Prevents null ambiguity. |
| Gate unchanged (estimates only) | **No — document non-goal** | Prevents scope creep into 7.1. |

**SPEC blockers on intent:** none. **ADR breaches:** none if finalize stays server/trusted-worker only.

---

### Recommended action

Proceed to **SECURITY.md** then **CONTRACT.md** with these **non-negotiable freezes**:

1. **`neuramark_reel_spend_events`** — canonical per-attempt cost record for **all** asset roles; **`applyActualCostToSpendEvent` / `finalizeGenerationCost`** sole mutation path for `actual_cost_cents`.
2. **`neuramark_video_jobs`** — optional mirror for video job UI; sync on complete; never the only store for LLM/TTS actuals.
3. **Phased BUILD** — Phase A: LLM actual backfill + weekly Operator aggregate; Phase B: video/TTS + production-list column with US-8.4/US-9.3.
4. **Columns** — `actual_cost_cents`, `duration_sec` nullable, `cost_finalize_failure_reason` nullable (or joined job failure with frozen rules).
5. **`getOperatorWeeklyClientCostSummary`** — Operator-only; actual-first sum with estimate fallback for incomplete jobs; week boundary aligned to **`week_start`** (Estrategia semanal) or ISO week — pick one in CONTRACT.
6. **`OperatorProductionJobCostDto`** — minimal allowlist on US-8.4 production list; EN/ES labels for estimated vs actual.
7. **Security** — forbidden request keys (`actualCostCents`, `estimatedCostCents`); no Cliente serializers; idempotent finalize per `external_job_id` / spend event id.
8. **Non-goals** — no change to cumulative budget gate; no US-7.4 rollup UI; no catalog writes.
9. **Manual jobs** — `actual_cost_cents = 0`.

Do not check off USER_STORIES acceptance criteria in this gate.
