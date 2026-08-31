## Spec Review — US-13.2

### Verdict: ALIGNED

US-13.2 intent — **System** passes **Métricas lite** performance signals into the next **Estrategia semanal** run: 28-day read-only aggregation by slot **`tema`**, top-3 ranking, `<TRUSTED_METRICS_SUMMARY>` prompt injection when data exists, graceful empty when none, Operator **Insights** snippet on `/operator/strategy` — is **directionally aligned** with SPEC §3 **S3.M15 Metrics Lite** (“System inyecta resumen ~4 semanas en siguiente Estrategia”), SPEC §3 **Content Strategy Agent** (S3.M5 — learning loop without changing modalidad/formato rules), USER_STORIES § US-13.2 AC (all three rows), closed **US-13.1** handoff (`neuramark_reel_metrics`, integer counters, `(client_id, recorded_at DESC)` index), **US-4.1** orchestrator + delimiter prompt pattern, **US-5.1** join path (assembled reel → script → strategy brief slot), CONTEXT canon (**Estrategia semanal**, **brief**, **tema**, **métricas**, **Operator**), and ADR boundaries (no analytics stack, no Graph API, no Fly worker for aggregation, no publish path).

**No SPEC amendment required.** **No CONFLICT.** Remaining items are **documentation reconciliation** (SPEC P2 label vs sprint P1; USER_STORIES BE “theme/pillar” vs Phase A **`tema`** only), **SECURITY/CONTRACT freeze** (prompt label policy, `clientId` tenancy on read vs current generate action), and **Phase B deferrals** (pillar rollup, persisted cache, Cliente read) — not product-direction drift. Phase A closes full US-13.2 AC per PO binding note.

**Upstream dependencies satisfied:** US-13.1 ✅ · US-4.1 ✅ · US-5.1 ✅ (join path) · US-4.2 ✅ (strategy page shell) · US-9.x ✅ (`reel_script_id` on assembled reels) · US-12.x ✅ (published Reels / calendar context for metrics entry hint).

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **Medium** | **USER_STORIES BE row says “theme/pillar”; Phase A groups by slot `tema` only.** Pillar rollup deferred Phase B (no stable slot→pillar FK in brief V1). README documents split; USER_STORIES owner table still implies both. | USER_STORIES § US-13.2 BE row; README § Phased BUILD · PO #2; SPEC §3 S3.M5 (slots carry **tema**, not explicit pillar FK) | **Document in CONTRACT:** Phase A = **`tema`** grouping only; pillar = Phase B backlog. Amend USER_STORIES BE row on next PO edit (“aggregate by slot **tema**; pillar Phase B”). **Not a BUILD blocker** — PO freeze + VALIDATION note already binding. |
| **Medium** | **`clientId` on insights read vs generate action tenancy.** PREP: `getStrategyPerformanceInsights({ clientId, weekStart })` with UUID + active-client validation; Operator may read **any** active client (calendar-like). Shipped US-4.1 generate action still resolves `clientId = operator.id` (session); orchestrator `generateContentStrategyForClient({ clientId })` already accepts param but action does not pass selector value yet. | SPEC §2 Operator multi-client supervision; US-12.1 calendar pattern; US-4.1 CONTRACT V1 session tenancy; README PO #8 · #12 | **CONTRACT + SECURITY:** freeze insights read with validated body `clientId` + `requireOperator`; aggregator filter **`WHERE m.client_id = :validatedClientId`**. For prompt injection: use **same `clientId` as orchestrator generate context** (when generate gains selector, both align). Until then, insights may show selected client while generate uses session id — **CONTRACT must state FE default** (selector → same id passed to generate when wired) or defer multi-client insights to selector parity story. |
| **Low** | **SPEC §3 P2 module label vs USER_STORIES / Sprint 7 P1.** S3.M15 lists Metrics Lite as **P2**; USER_STORIES and Sprint 7 schedule US-13.2 as **P1**. Behavior unchanged — sprint promotion, not scope reduction. Same precedent as US-12.x / US-13.1. | SPEC §3 S3.M15; USER_STORIES § US-13.2; README § SPEC alignment | **Document precedence:** `plan/USER_STORIES.md` + frozen PREP govern BUILD. Optional PO amend SPEC §3 P2→P1 note on next SPEC edit — **not a BUILD blocker**. |
| **Low** | **[SEC] AC “no free-text fields” vs optional `tema` labels in prompt.** USER_STORIES [SEC]: summary built from aggregated **numbers** server-side, no free-text fields. PREP proposes optional server-resolved **`tema`** string per row in `<TRUSTED_METRICS_SUMMARY>` (from strategy brief join, not metrics input). Tension is wording, not intent — [SEC] targets metrics-table injection vectors. | USER_STORIES § US-13.2 AC [SEC]; README PO #5 · open Q1; US-13.1 SECURITY § US-13.2 handoff | **SECURITY gate:** decide **sanitized brief `tema` labels allowed** vs **rank-only integers**. See PO recommendations below. CONTRACT documents chosen shape + fallback. |
| **Low** | **Open questions not frozen until CONTRACT.** Window bounds (exclusive `weekStart` Monday), strategy `status` filter on join, FE load pattern (RSC loader vs action), read rate limit — listed README § Open questions. | README § Open questions; TASKS § Open questions for CONTRACT | **CONTRACT** must freeze each; lean PO resolutions acceptable if SECURITY does not veto. |
| **Low** | **USER_STORIES FE “top 3 themes” vs canonical `tema`.** English “themes” maps to slot **`tema`** from brief — not pillar, not free-text metric notes. | CONTEXT **Estrategia semanal**; README § Canonical terms | i18n **`strategy.insights.*`**: use **tema** / theme consistently; avoid “analytics” or “pillar” in Phase A copy unless Phase B. |
| **Info** | **~4-week metrics injection — ALIGNED with S3.M15.** 28-day lookback on `recorded_at`, inject at generate time, omit block when zero rows — matches SPEC Metrics Lite loop. | SPEC §3 S3.M15; USER_STORIES AC row 1 | VALIDATION: prove tag present with fixture metrics, absent when empty. |
| **Info** | **Graceful empty — ALIGNED.** `available: false` / `insights: null`; generate proceeds without error. | USER_STORIES AC row 2; README PO #4 | FE empty state is UX; handler must not fail generate on empty aggregate. |
| **Info** | **Integer-only metric values in prompt — ALIGNED with [SEC] and US-13.1.** Counters summed from DB integers; `JSON.stringify` on server-built object; no columns from `neuramark_reel_metrics` beyond integers. | USER_STORIES AC row 3 [SEC]; US-13.1 CONTRACT; README PO #5 | content-agents-engineer tests: numbers only in serialized block. |
| **Info** | **`<TRUSTED_METRICS_SUMMARY>` delimiter — ALIGNED with US-4.1 pattern.** Parallel to `<UNTRUSTED_*>` tags; system instruction biases **tema** choice, not modalidad/formato/playbook rules. | US-4.1 CONTRACT § Prompt containment; README PO #6; SPEC §3 S3.M4 modalidad per slot | Agent addendum must explicitly forbid overriding allowlist / formato / tactica rules from metrics block. |
| **Info** | **No new analytics stack — ALIGNED.** Read-only SQL joins; no Graph API; no charts/dashboard widgets in scope; avoids CONTEXT _Evitar_ “analytics avanzados”. | SPEC §1 fuera de alcance; README § Scope out; CONTEXT **Métricas lite** | BUILD grep: no integrations-engineer scope. |
| **Info** | **Operator-only insights surface — ALIGNED.** `/operator/strategy` snippet; no Cliente read V1; `requireOperator` on read action. | SPEC §2 Operator supervision; README § Scope out | Cliente insights = Phase B; do not expose aggregate via public Route Handler. |
| **Info** | **No DDL Phase A — ALIGNED.** USER_STORIES DB row `—`; reuse US-13.1 index. | USER_STORIES § US-13.2 DB; README PO #13 | Confirm index sufficiency in CONTRACT; no new `neuramark_*` objects. |
| **Info** | **Join path frozen — ALIGNED with US-5.1 / US-9.x / US-13.1.** metrics → assembled reel → reel script → content strategy → `brief.slots[slotIndex].tema`; skip unresolvable rows. | README § Join path; US-13.1 CONTRACT handoff | Unit tests: orphan join failure excluded; cross-`client_id` isolation. |
| **Info** | **ADR boundaries intact.** ADR-0001: aggregator reusable by future ciclo semanal (`invokedBy: "system"`) — no cron in this story. ADR-0002: N/A. ADR-0003: aggregation on Vercel app layer — OK for read-only SQL. | ADR-0001–0003; README § handoffs | Do not enqueue Fly jobs for insights V1. |
| **Info** | **Hard rules preserved.** No publish without Aprobación; no human recording; no multicanal; no auto-run strategy on metrics save (manual Generate per US-4.1). | SPEC §1 SC-2; README § Scope out | Do not add cron trigger or Cliente-facing metrics on strategy page. |
| **Info** | **Playbook vs Trend not conflated.** Metrics inform **tema** bias only; does not merge Trend Intelligence or Playbook catalogs. | SPEC §3 Playbook vs Trend; CONTEXT canon | Prompt instruction scope: performance → **tema** / slot topics only. |
| **Info** | **NFR — ALIGNED.** `neuramark_*` read-only; multi-tenant `client_id` filter; EN/ES `strategy.insights.*`; server-only Supabase; Operator gate. | SPEC §5–§6; AGENTS.md | SECURITY owns forbidden keys on generate body (no operator-supplied metrics summary). |

**Gap count:** **2 Medium** (documentation / tenancy alignment) · **4 Low** · **12 Info** · **0 High** · **0 Critical** · **0 CONFLICT**

**SPEC blockers:** none. **ADR breaches:** none.

---

### Focus areas (binding assessment)

| Focus | Assessment |
|-------|------------|
| **S3.M15 ~4-week injection into Estrategia** | **ALIGNED** — 28-day window, server-built summary, inject at `generateContentStrategyForClient`, omit when empty. |
| **Phase A `tema` vs pillar rollup** | **ALIGNED with documented Phase B defer** — USER_STORIES BE wording should be amended for clarity; not a spec conflict. |
| **[SEC] integer-only prompt summary** | **ALIGNED** for metric **values**; **`tema` label policy** deferred to SECURITY (Low). |
| **Modalidad / formato rules unchanged** | **ALIGNED** — PO #6 restricts agent delta to **tema** bias; allowlist and playbook/trend validation remain US-4.1. |
| **Metrics Lite vs analytics stack** | **ALIGNED** — manual counters + read-only aggregate; no Insights API. |
| **CONTEXT _Evitar_ violations** | **None blocking** in README/TASKS — see Terminology section. |

---

### Terminology violations (CONTEXT)

**None blocking** in README/TASKS (uses **Estrategia semanal**, **brief**, **Operator**, **Cliente**, **Reel**, **Ensamblado**, **métricas**, **tema**; explicitly avoids full analytics vocabulary, admin/staff, injecting raw calendar URLs or free-text metric notes into prompts).

**CONTRACT / FE i18n must enforce:**

| Prefer (Operator copy) | _Evitar_ |
|------------------------|----------|
| **Métricas lite** / **métricas** | analytics avanzados (product promise) |
| **Estrategia semanal** | weekly brief (product headline) |
| **tema** (slot theme from brief) | pillar (Phase A UI — defer to Phase B) |
| **Insights** (product chrome OK EN) | “performance dashboard”, “analytics” |
| **Operator** / **Cliente** | admin, administrador, staff |
| **Calendario de contenido** (metrics entry hint) | separate analytics route |

**English story title “themes”** — map to slot **`tema`** in ES/EN product copy under `strategy.insights.*`.

---

### PO open questions — spec-guardian recommendations

| # | Question | Recommendation |
|---|----------|----------------|
| **1** | Include **`tema`** labels in prompt or rank-only integers? | **Allow sanitized server-resolved `tema` labels** paired with integer aggregates in `<TRUSTED_METRICS_SUMMARY>`. Rationale: SPEC learning loop needs semantic signal; labels come from **strategy brief JSON via join** (same trust class as brief fields already in `<UNTRUSTED_*>` blocks), **not** from metrics mutation input — satisfies [SEC] intent. Require: trim, max 200, strip control chars and `<>`/`</`; Zod on prompt payload. **Rank-only fallback** (rank + integers, no `tema` key) documented in CONTRACT if security-architect vetoes strings in TRUSTED block. |
| **2** | Sanitize **`tema`** for prompt? | **Yes** — mirror `contentStrategySlotSchema` / brief slot bounds; reject rows failing sanitize before prompt build. |
| **3** | `windowEnd` exclusive on target `weekStart` Monday? | **Approve PO freeze** — excludes metrics recorded during the week being planned; aligns Estrategia with prior-week performance only. |
| **4** | Approved-only strategies for `tema` source? | **Lean: any strategy row linked by script** (scripts typically exist post-approval). Optional SECURITY tighten to `status = 'approved'` if join noise appears in VALIDATION — not a spec blocker. |
| **5** | Duplicate `tema` casing | **Approve** lowercase GROUP BY, first-seen display label. |
| **6** | FE load: RSC loader vs action | **Approve lean:** server helper in page loader for initial paint + `getStrategyPerformanceInsights` action when client/week changes — matches calendar/strategy patterns. |
| **7** | Re-fetch insights after Generate | **Optional** `router.refresh()` — non-blocking; lookback set unchanged materially. |
| **8** | Rate limit on read action | **No rate limit V1** — read-only aggregate; acceptable per PO lean. |

---

### Blockers for SECURITY / CONTRACT

| Item | Blocks? | Guidance |
|------|---------|----------|
| US-13.2 SECURITY.md | **Yes — next gate** | Prompt trust boundary (`tema` labels vs rank-only); `requireOperator` on read; `clientId` validation + aggregate filter; forbid operator-supplied metrics summary on generate; logging excludes prompts/brief JSON. |
| US-13.2 CONTRACT.md | **Yes — BUILD gate** | Freeze after SECURITY; **Reviewed by FE** before BUILD. |
| `aggregateReelMetricsByTema` | **Yes — core AC** | 28-day window, join path, top 3, `engagementScore` rank. |
| Prompt injection delta | **Yes — AC row 1 + [SEC]** | `<TRUSTED_METRICS_SUMMARY>`; omit when empty; agent instruction scope. |
| `StrategyInsightsPanel` | **Yes — AC row 2** | Top 3 **tema** rows, empty state, EN/ES. |
| Pillar rollup / charts / Cliente read | **No — Phase B** | Explicitly out of scope. |
| Instagram Insights API | **No — out of scope** | integrations-engineer; separate story. |
| DDL migration | **No Phase A** | Read-only queries only. |

**SECURITY can proceed?** **Yes.** PREP sufficiently specifies Metrics Lite injection scope, integer metric values, US-13.1 data model handoff, Operator-only read surface, and prompt delimiter pattern for **security-architect** to author **SECURITY.md**. No spec-guardian veto.

**CONTRACT blockers (freeze before BUILD):**

1. **`lib/contracts/strategy-insights.ts`** — DTOs, `STRATEGY_METRICS_LOOKBACK_DAYS = 28`, prompt summary schema (integers + optional sanitized `tema` or rank-only per SECURITY).
2. **`aggregateReelMetricsByTema`** — join path, window bounds, normalization, top 3, `available: false` when zero qualifying rows.
3. **`getStrategyPerformanceInsights`** — `requireOperator("handler")`; validated `clientId` + `weekStart`; tenancy filter on aggregate.
4. **Orchestrator hook** — `generateContentStrategyForClient` loads aggregator; passes `metricsSummaryForPrompt` to agent module; **forbidden:** client-supplied summary keys on generate action.
5. **Agent delta** — `TRUSTED_METRICS_SUMMARY_TAG`; system addendum biases **tema** only; omit block when null.
6. **Phase A scope note** — **`tema`** grouping only; pillar rollup Phase B.
7. **Non-goals reaffirmed** — no Insights API, no DDL, no Cliente insights, no charts, no persisted cache V1, no auto-generate on metrics save.

---

### Recommended action

Proceed to **SECURITY.md** (no SPEC veto), then **US-13.2 CONTRACT.md** with the non-negotiable freezes above.

1. **Metrics Lite loop** — read US-13.1 rows; aggregate 28 days by slot **`tema`**; inject into next **Estrategia semanal** when available.
2. **Prompt containment** — integer counters server-built; **`tema` label policy** resolved in SECURITY (recommend sanitized brief labels with rank-only fallback).
3. **Operator surface** — insights snippet on `/operator/strategy`; empty state points to **Calendario de contenido** for metrics entry.
4. **Phase boundaries** — Phase A closes all three USER_STORIES AC; pillar rollup, cache, Cliente read, charts → Phase B backlog.
5. **Explicit out of scope:** Graph analytics, DDL, dashboard widgets, auto-trigger generate, weight-tuning UI, RBAC beyond `requireOperator()`.

**Gate status:** SPEC-REVIEW **ALIGNED** (2 Medium · 4 Low · 0 blockers · 0 CONFLICT). Next: security-architect **SECURITY.md** → nextjs-backend **CONTRACT.md** (Reviewed by FE) → BUILD.
