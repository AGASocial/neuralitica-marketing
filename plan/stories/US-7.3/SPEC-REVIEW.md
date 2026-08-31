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

---

## Spec Review — US-7.3 Phase B (video/TTS/B-roll spend backfill)

**Identity:** same story **US-7.3** (sprint `US-7.3-B`). Not a new backlog ID. Branch `feature/US-7.3-phase-b-spend-backfill`. Phase A text above is **unchanged**. Binding PREP: `PHASE-B.md` PO **B1–B18**.

### Verdict: ALIGNED

Phase B intent — persist **costo real** for completed video / TTS / B-roll **Jobs de generación** on canonical **`neuramark_reel_spend_events`**, keep **`neuramark_video_jobs.actual_cost_cents` as a UI mirror**, refresh **Operator** job cost on poll without inventing `/operator/production`, leave **US-7.4** as an automatic roll-up consumer, and never expose cost on **Cliente** (including poll routes) — **supports SPEC §3 Cost Policy Engine** (Operator sees estimados; Cliente never sees/envía costos), SPEC §6 presupuesto server-only, ADR-0003 trusted worker/poller state writes, and Phase A dual-store freeze.

**No SPEC amendment.** SPEC does not name `/operator/production`, `finalizeGenerationCost`, or TTS writer identity. Remaining work is CONTRACT/SECURITY hygiene + BUILD gaps (duration, poll DTO, tests), not product-contract drift.

**GAPS (acceptable — do not BLOCK):** Phase A CONTRACT still names a historical `/operator/production` surface; Phase A “sole writer `finalizeGenerationCost`” is **narrowed** by PO **B3/B7** (TTS success INSERT via `recordReelSpendEvent`). Those are **story-floor amendments**, not SPEC conflicts. SECURITY must encode the TTS exception without weakening [SEC] (adapter-sourced, `server-only`, no request-body actuals).

**Upstream:** Phase A CLOSED; US-8.4 / US-8.2+ / US-8.3 / US-9.3 / US-7.4 Phase A CLOSED. US-7.4 CONTRACT **Phase B (automatic — no US-7.4 BUILD change)** is the consumer contract.

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **High** | **TTS actual INSERT vs Phase A “sole writer.”** Phase A SPEC-REVIEW + CONTRACT freeze **`finalizeGenerationCost`** as exclusive mutator of `actual_cost_cents`; `recordReelSpendEvent` callers = finalize only. SECURITY Phase A: exclusive backfill module; `recordReelSpendEvent` INSERT-only for estimates; US-9.3 “same backfill module.” Live TTS writes actuals on success INSERT (`synthesize-voiceover-for-reel-script` / trusted path). PO **B3/B7** freeze **leave it** this slice. This **conflicts with Phase A floors**, not with SPEC §3 (any server job-completion path from adapter results is in-spec). | Phase A SPEC-REVIEW High (sole writer); US-7.3 CONTRACT L22, L190–198, L294; SECURITY exclusive module + future US-9.3 note; PO B3/B7 | **SECURITY amend (required):** named **TTS exception** — trusted orchestrator INSERT with actual still counts as the [SEC] “job-completion handler”; **forbidden:** request/Zod `actualCostCents`; keep `import "server-only"`; write-once / no client edit. **CONTRACT Phase B:** exclusive call-site table = `finalizeGenerationCost` (`async_update` video, `sync_insert` manual 0) **plus** TTS `recordReelSpendEvent` with actual. **Do not** migrate TTS this slice. Estimate-only video create INSERTs remain non-actual writers (B3/B4). |
| **High** | **CONTRACT Phase A FE route is a historical name, not a live surface.** CONTRACT surfaces #9 / `OperatorProductionJobCostDto` **FE route: `/operator/production`**. That route **does not exist**. US-8.4 shipped on **`/operator/scripts`** (`OperatorVideoJobSummaryPanel`). Inventing `/operator/production` would be disconnected-API / scope drift vs AGENTS.md (endpoints from a concrete consumer) and PO **B11**. DTO **type name** may stay. | US-7.3 CONTRACT L23, L80, L451, FE signoff Phase B note; PO B11; US-8.4 live panel; SPEC §3 (no route name) | CONTRACT Phase B addendum: **strike** `/operator/production` as a BUILD target. Freeze job-level estimated vs actual on **`OperatorVideoJobSummaryPanel`** + Operator **`GET /api/video-jobs/[jobId]`** (or equivalent refetch) carrying **`OperatorProductionJobCostDto`**. Status-only poll that drops `cost` is **in-scope BUILD** (B12), not a new page. |
| **High** | **Poll cost DTO is Operator-only; Cliente poll must stay cost-free.** Extending job poll with `estimatedCostCents` / `actualCostCents` / `costStatus` on a shared serializer would violate SPEC §3 and SECURITY_BASELINE response-shape exclusion even if the panel is Operator-only in UI. | SPEC §3 Cost Policy Engine; SPEC §6 sensitive presupuesto; Phase A SPEC-REVIEW Medium (Cliente exclusion); PO B12; US-7.4 [SEC] floor | SECURITY + CONTRACT: cost on **`requireOperator`** poll/summary only. **Forbidden keys** on any Cliente video-job / TTS / media poll. Tests: Cliente session cannot obtain `OperatorProductionJobCostDto`. |
| **Medium** | **Dual store remains: ledger canonical, job row mirror.** Phase A High dual-store is **closed as policy**, not as a single physical column. Poller already mirrors `video_jobs.actual_cost_cents`. US-7.4 must not SUM the mirror. Phase B must not reopen US-7.4 query rewrite. | Phase A SPEC-REVIEW High dual store; PO B2/B13; US-7.4 CONTRACT L16, L67–69, forbidden SUM `video_jobs` | CONTRACT: mirror is **denormalized job UI** from the same complete pass; reporting SUM = **`neuramark_reel_spend_events` only**. **No US-7.4 BUILD.** Missing `spendEventId`: log; **no** late actual-only INSERT (B5) — avoids a second unofficial ledger path. |
| **Medium** | **Failed / cancelled: no spend UPDATE.** Phase A AC wording “actual or null with failure reason” was already leaned to **success-only spend rows**. PO **B6** matches: fail/cancel leave estimate-only; do not invent billed cost; do not add “job failed” unavailable-reason unless an adapter reports a billed amount (none today). Aligns with US-7.4: failed attempts **without** spend rows excluded. | Phase A High LLM fail / Medium failure-reason; PO B6; US-7.4 CONTRACT failed-attempt rule | CONTRACT Phase B: terminal **fail/cancel** ∉ finalize path. Completed **success** row: actual **or** closed `actualCostUnavailableReason` — never null/null after successful complete (B5). |
| **Medium** | **Duration still partial.** DDL `duration_sec` exists. Gaps: video `async_update` omits `durationSec`; TTS **trusted** path omits it (Operator TTS already sets). Not required for weekly SUM. LLM remains null. | Phase A Medium duration; PO B5/B7/B10; SPEC no duration column | BUILD only; **no new tables/columns**. CONTRACT: pass `durationSec` when adapter/probe knows it; else omit/null. |
| **Low** | **Budget gate must stay estimate-only.** Phase B must not change `sumReelCumulativeCostCents` / `assertReelBudgetAllowsSpend`. | US-7.1 CONTRACT; SPEC §3 budget-before-generate; PO B14 | Non-goal in CONTRACT Phase B. |
| **Low** | **Manual upload already `actual = 0`.** Verify tests only (B8). | Phase A Low manual; US-8.3 | No rewrite. |
| **Info** | **US-7.4 automatic expand is the consumer, not this story’s UI.** Same GROUP BY `asset_role` picks up `talking_head` / `broll` / `tts` when ledger rows exist. B-roll clip strip and TTS cost chip are **out** (rollup + slot weekly sum). | US-7.4 CONTRACT Phase B automatic; PO B9/B13 | Do not reopen US-7.4 unless aggregator ignores non-LLM roles (PREP: it does not). |
| **Info** | **ADRs.** Cost writes stay on server / trusted poller-worker updating `neuramark_*` (ADR-0003). No IG publish change (ADR-0002). Ciclo uses same orchestrators (ADR-0001). No secrets in browser (AGENTS.md / SPEC §5–6). | ADR-0001–0003; SPEC §5 | No Fly-hosted cost RPC to the browser; no unauthenticated webhook mapping raw `actualCostCents`. |
| **Info** | **Roles / modalidades / playbook.** Operator-only cost; Cliente still never sees costs. B-roll is **asset_role** on the ledger, not a new **Modo visual** product noun. No playbook/trend conflation. | SPEC §2–3; CONTEXT | Keep Operator copy: **Costo estimado** / **Costo real**; **Job de generación**. |
| **Info** | **Out of scope held:** `/operator/production` route, US-7.4 BUILD, TTS migrate to finalize, fail-row billed actuals, `ltx_broll_high`, assembly/branding/FFmpeg spend, QA spend rewrite, gate-on-actuals, Cliente cost fields, new DDL, historical SQL backfill, Stories IG, ads, RBAC UI, multicanal. | SPEC §1; PHASE-B.md scope out | Do not expand. |

---

### Terminology violations (CONTEXT)

**None in Phase B PREP/TASKS** (uses Operator, Cliente, Reel, Job de generación, Costo estimado / Costo real).

CONTRACT/FE Phase B must **not** introduce product-facing:

| Prefer | _Evitar_ |
|--------|----------|
| **Operator** | admin, administrador, staff |
| **Cliente** | prestador, dueño, usuario final (as product role) |
| **Costo estimado** / **Costo real** | unlabeled “estimated vs actual”; **Política de costo** as the panel title |
| **Job de generación** | generation job (user-facing EN) |
| **B-roll / sin presencia** (if any new copy) | faceless (UI) |

Keep DTO/code names (`OperatorProductionJobCostDto`, `asset_role`) out of Cliente strings. “Unit economics” stays Operator-internal only.

---

### Recommended action

**Verdict ALIGNED (GAPS acceptable). SECURITY may proceed** — then CONTRACT Phase B amendment (do **not** rewrite Phase A except addenda) + **Reviewed by FE** before BUILD.

SECURITY must freeze:

1. TTS **`recordReelSpendEvent` actual INSERT** as the **only** named exception to `finalizeGenerationCost` for **actuals**; still server-only, adapter-sourced, no HTTP mutation.
2. Operator poll/summary **`OperatorProductionJobCostDto`**; **zero** cost keys on Cliente poll/status routes.
3. Dual store: ledger = reporting; `video_jobs` actual = mirror; US-7.4 still ledger-only.

CONTRACT Phase B must freeze (nextjs-backend; not this gate):

1. Call-site table (video `async_update` + duration; manual 0; TTS INSERT exception; create-path estimate-only INSERT).
2. FE surface = **`/operator/scripts`** `OperatorVideoJobSummaryPanel` — **historical `/operator/production` is not a BUILD target**.
3. Poll DTO + fail/cancel = no spend UPDATE; missing `spendEventId` = no invented INSERT.
4. Non-goals: US-7.4 BUILD, gate-on-actuals, new DDL.

**PO change required only if** PO wants TTS forced through `finalizeGenerationCost` this slice (would contradict B7) or insists on a new `/operator/production` route (would contradict B11 and this review). **Neither is required for SPEC.**

Do not check off USER_STORIES acceptance criteria in this gate. Do not start SECURITY or CONTRACT from this agent.
