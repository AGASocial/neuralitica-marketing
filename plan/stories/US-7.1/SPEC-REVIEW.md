## Spec Review — US-7.1

### Verdict: GAPS

US-7.1 intent — **Operator** configures **Política de costo** (`max_cost_cents`, `provider_tier` with **low** default), the **System** enforces a server-side pre-generation budget gate on **cumulative Reel spend** (retries, B-roll, TTS, and downstream LLM/video paths), blocks generation when estimate exceeds cap unless an **auditado** override, and surfaces estimates only in **Operator**-gated UI — is **directionally aligned** with SPEC §3 **Cost Policy Engine** (S3.M8), SPEC §4 error path (“override budget”), SPEC §6 hard rule **budget-before-generate**, SPEC §2 Operator-only “catálogo/tiers de costo”, USER_STORIES Conventions **Provider tiers** / **150¢ seed**, frozen **US-X.4** `neuramark_cost_policies` DDL + global seed, `plan/SECURITY_BASELINE.md` spend-authority floors, and ADR-0001 (cycle continues until block → Operator exception; no publish bypass).

**Gaps** sit between USER_STORIES § US-7.1 acceptance criteria / owner table and what must be frozen in **CONTRACT.md** before BUILD: audit persistence, override workflow, US-7.1 vs **US-7.2** boundary, cumulative-cost data sources (especially pre-`neuramark_video_jobs`), per-client override UX, and the **operator minimal DTO** carry-forward from US-X.4 SECURITY. Story intent does not drift from SPEC; unresolved contract shape is the blocker.

**Upstream dependencies satisfied or frozen:** **US-X.4** ✅ (`neuramark_cost_policies` migration + seed `provider_tier = low`, `max_cost_cents = 150`; `getDefaultCostPolicy()`; `getProviderCatalog()`; `resolveProvider()`; RLS deny-by-default). **US-5.1** ✅ (`neuramark_reel_scripts`, `reel_script_id` lineage for per-Reel rollup). **US-3.1** ✅ (Preferencias allowlist + per-slot **modalidad de producción** inputs for avatar vs faceless policy). **US-14.5** ✅ (`requireOperator("handler")` floor for settings writes).

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **High** | **Audit log schema undefined.** AC [SEC]: “Every budget-exceeded block and every override is recorded (who, when, estimate vs cap).” No table, event type enum, or append-only store in USER_STORIES DB row or US-X.4 CONTRACT. | SPEC §3 “override auditado”; USER_STORIES US-7.1 [SEC]; SECURITY_BASELINE §2 spend authority | CONTRACT: add **`neuramark_cost_policy_events`** (or equivalent) with `event_type` (`blocked` \| `override_granted`), `client_id`, `reel_script_id` nullable, `operator_client_id`, `estimated_cost_cents`, `cumulative_cost_cents`, `max_cost_cents`, `provider_tier`, `reason` optional, `created_at`; service-role insert only; no Cliente read path. |
| **High** | **Override workflow unspecified.** AC: “Generation blocked if estimate exceeds max **without override**.” SPEC §3 + §4: Operator may override budget on failed generation. No AC for *how* override is requested, scoped (per Reel? per attempt?), authorized, or replayed on retry. | SPEC §3 Cost Policy Engine; SPEC §4 “override budget”; USER_STORIES US-7.1 AC | CONTRACT: freeze **`grantBudgetOverride({ reelScriptId, reason })`** Operator Server Action; one active override per `reel_script_id` with TTL or single-use flag; writes audit row; budget gate checks override before block; cycle/system path records block → Operator queue (status flag or event — see Medium row). |
| **High** | **US-7.1 vs US-7.2 BE overlap.** USER_STORIES US-7.1 BE: “`cost_policies` resolver: duration, visual mode, b-roll flag → provider + estimate.” US-7.2 BE owns full policy engine (`provider_tier` + visual mode + asset role → `provider_key` + `estimated_cost_cents`). Same responsibility described twice; risk of duplicate engines or 7.1 shipping incomplete estimates. | SPEC §3 (engine + cap in one module); USER_STORIES US-7.1 BE row vs US-7.2 | CONTRACT split: **US-7.1** = policy CRUD/read (`getCostPolicyForClient`), **`assertReelBudget()`** gate (cumulative + next-estimate), audit + override, Operator settings FE, thin **`estimateReelGeneration()`** wrapper that **calls US-7.2 helper when present** or catalog stub until 7.2 lands. **US-7.2** = ranking, per-asset-role estimates, decision logging on jobs. Do not implement full provider ranking in 7.1. |
| **High** | **`getCostPolicyForClient()` missing.** US-X.4 ships **`getDefaultCostPolicy()`** (global `client_id IS NULL` only). AC requires optional **per-client override**; migration has `client_id` FK + index but no UNIQUE per client, no loader, no fallback rule. | USER_STORIES US-7.1 AC; US-X.4 CONTRACT L312, L428–430; migration `neuramark_cost_policies_client_id_idx` | CONTRACT: **`getCostPolicyForClient(clientId)`** → client row if exists else global default; partial **UNIQUE** index `WHERE client_id IS NOT NULL`; UPSERT semantics on Operator save. |
| **Medium** | **Cumulative spend data model incomplete for V1 pipeline.** AC: cumulative cost for same Reel includes retries, B-roll, TTS. TASKS for US-4.1/5.1/6.1 defer **pre-generation budget block** to US-7.1 (LLM paths too). **`neuramark_video_jobs`** not shipped (US-8.x); no persisted LLM `estimated_cost_cents` per `reel_script_id` today. | USER_STORIES US-7.1 AC; US-5.1/6.1 TASKS; SPEC §3 pre-Job cumulative check; SECURITY_BASELINE §2 | CONTRACT: define **`getReelCumulativeSpendCents(reelScriptId)`** sum sources — (1) `video_jobs.estimated/actual` when table exists, (2) optional **`neuramark_generation_cost_ledger`** or columns on existing rows for LLM/TTS until US-7.3 unifies; stub **0** cumulative when no rows (safe for early Sprint 4). Freeze whether **Estrategia semanal** LLM (weekly, 3 slots) allocates to per-Reel cap or is out of Reel cumulative (PO lean: **per-`reel_script_id` only** for script/caption/video/TTS; strategy spend separate or amortized — pick one in CONTRACT). |
| **Medium** | **“Estimate shown before user confirms generation” vs Cliente cost ban.** SECURITY_BASELINE + SPEC: **Cliente nunca ve/envía costos.** AC wording “user” is ambiguous. | SPEC §3; SECURITY_BASELINE (f); USER_STORIES US-7.1 AC | CONTRACT: estimates and confirm step are **Operator-only** (generate/regenerate/retry actions on `/operator/*`). System/cron path: block + audit + Operator queue — no Cliente confirmation UI. Shared Cliente/Operator payloads exclude cost fields. |
| **Medium** | **Operator minimal DTO not frozen (US-X.4 carry-forward).** US-X.4 SECURITY condition: settings/read surfaces show resolved provider **label + tier + estimate** only — not `envKeyName`, full `cost_model`, or raw `capabilities`. | US-X.4 SECURITY §2; USER_STORIES US-7.1 FE “display estimates” | CONTRACT: explicit **`OperatorCostSettingsDto`** / **`OperatorGenerationEstimateDto`** field allowlists; reject returning full catalog/policy rows to browser. |
| **Medium** | **Validated bounds “sane ceiling” unset.** AC [SEC]: positive integers + sane ceiling for `max_cost_cents`. Seed **150**; no max cap constant. | USER_STORIES US-7.1 [SEC]; Conventions economics ~$1.50/Reel | CONTRACT: freeze **`MAX_COST_CENTS_CEILING`** (e.g. **500** or **1000**) server-side; Zod on write; FE mirrors for UX only. |
| **Medium** | **`rules` jsonb schema unset.** DB column exists (`rules NULL` in seed). AC: “Policy considers avatar required vs faceless.” Unclear if rules live in jsonb or purely in US-7.2 engine inputs (modalidad + catalog). | USER_STORIES US-7.1 DB row; US-X.4 migration | CONTRACT: V1 **`rules` remains NULL**; avatar vs faceless routing inputs come from **modalidad de producción** on script/strategy slot + US-7.2 resolver — document in 7.1 as pass-through context, not jsonb CRUD in settings UI. |
| **Medium** | **Cycle block → Operator queue unspecified.** SPEC §3: “en ciclo el bloqueo va a cola Operator.” No story defines queue entity for budget blocks (distinct from job failed / QA). | SPEC §3 Cost Policy Engine; ADR-0001 exceptions | CONTRACT: define minimal signal — e.g. **`reel_production_status = budget_blocked`** on script row, or event-only + Operator dashboard filter; align with integrations-engineer cron handler; no Cliente-facing error leaking cost. |
| **Low** | **`provider_tier = high` without active catalog rows.** Operator may set high tier in settings; US-X.4 seeds high-tier catalog **`active = false`**. US-7.2 ranks only active rows. | Conventions Provider tiers; USER_STORIES US-7.2 AC; US-X.4 seed invariants | CONTRACT: tier write allowed; generation estimate/gate **fail closed** with clear Operator error if no active provider for tier+role; document SQL activation path unchanged (no catalog CRUD in 7.1). |
| **Low** | **`createVideoJobInputSchema` includes client-supplied `providerKey`.** Pre-existing in `lib/contracts/providers.ts`; US-7.2 [SEC] forbids client authority. US-7.1 gate must not trust request body for tier/estimate. | US-7.2 [SEC]; US-8.2 [SEC] budget re-check | CONTRACT (7.1/8.x coordination): job creation resolves `providerKey` server-side after budget pass; strip or ignore client `providerKey` on HTTP boundary — note for US-8.1 CONTRACT, not 7.1-only. |
| **Low** | **Depends list omits US-14.5.** Operator gate is mandatory for settings writes per AC + US-X.4 SECURITY. | USER_STORIES Depends; US-14.5 `requireOperator` | Add **US-14.5** to Depends (or document as implicit platform floor in CONTRACT). |
| **Info** | **DB + seed aligned.** `neuramark_cost_policies`: global row `provider_tier = low`, `max_cost_cents = 150`, partial unique on global default, CHECK constraints, RLS deny-by-default — matches Conventions and US-X.4 VALIDATION PASS. | USER_STORIES Conventions; US-X.4 VALIDATION; migration `20260829260100_neuramark_cost_policies.sql` | US-7.1 BUILD extends with app writes + per-client rows; no DDL change required unless audit table added. |
| **Info** | **Cliente never picks tier.** Conventions + SPEC §2 Operator-only tier switch preserved. Settings UI is Operator-only. | Conventions Provider tiers; SPEC §2; CONTEXT **Política de costo** | No Cliente tier/cost surfaces; role gate on all policy reads that expose caps. |
| **Info** | **Manual upload bypass.** US-8.3: manual bypasses API cost — consistent with SPEC §3 Video Provider “upload manual (bypass costo)”. US-7.1 gate must not block Operator manual path. | SPEC §3 Video Provider; USER_STORIES US-8.3 | CONTRACT: `assertReelBudget` skipped or zero-estimate for `provider_key = manual` Operator upload path only. |
| **Info** | **ADRs respected.** Budget gate on Vercel Next server layer before job enqueue; no Fly worker authority (ADR-0003); no IG publish (ADR-0002); cron may hit gate but must not skip audit (ADR-0001). | ADR-0001–0003; SPEC §5 | Do not move spend authority to Client Components or Fly worker. |
| **Info** | **Out of scope held:** catalog CRUD (US-X.4 / SQL-only activation), full provider ranking UI (US-7.2), actual cost persistence (US-7.3), Reel rollup dashboard (US-7.4), vendor adapters (US-8.x), Cliente cost visibility, RBAC UI, Stories IG, multicanal, ads. | SPEC §1; USER_STORIES Sprint 4 split | US-7.1 = cap/tier settings + gate + audit + Operator estimate display — not unit-economics reporting. |

---

### Terminology violations (CONTEXT)

**None that block** in USER_STORIES § US-7.1 title/AC (uses “Operator”, “Reel”, “generation” in acceptable technical sense).

Product-facing EN/ES for US-7.1 FE + CONTRACT must use:

| Prefer | _Evitar_ |
|--------|----------|
| **Política de costo** | cost policy (as primary EN headline); **max_cost** as loose business concept |
| **Operator** | admin, administrador, staff |
| **Job de generación** | generation job (user-facing EN) |
| **Modalidad de producción** / **B-roll / sin presencia** | faceless (product copy; enum OK in code) |
| **Avatar propio autorizado** / **Avatar genérico profesional** | own_avatar / generic_avatar (product copy) |
| **Cliente** | prestador, dueño, usuario final (as product role) |

Note: USER_STORIES Conventions table uses English role label **Client** — story-folder CONTRACT should use **Cliente** per CONTEXT for product copy.

---

### Blockers for SECURITY / CONTRACT

| Item | Blocks? | Guidance |
|------|---------|----------|
| Audit table + append-only events | **Yes — [SEC] AC** | Must exist before marking US-7.1 [SEC] audit AC done. |
| Override grant API + audit | **Yes — SPEC “override auditado”** | Freeze single Operator action + scope. |
| `getCostPolicyForClient` + per-client UPSERT | **Yes — AC optional override** | UNIQUE per `client_id`; fallback to global. |
| US-7.1 / US-7.2 responsibility split | **Yes — avoid duplicate engine** | 7.1 gate + settings; 7.2 ranking/estimate detail. |
| Cumulative spend query contract | **Yes — AC cumulative budget** | Define sum sources + pre-`video_jobs` stub. |
| Operator minimal DTO allowlist | **Yes — US-X.4 SECURITY condition** | No full catalog/policy to browser. |
| `MAX_COST_CENTS_CEILING` | **No — if frozen in CONTRACT** | Required for [SEC] bounds AC. |
| `rules` jsonb UI | **No — defer NULL** | Avatar/faceless via modalidad + 7.2 inputs. |
| Retrofit LLM generate paths (4.1/5.1/6.1) | **Yes — if TASKS require** | CONTRACT lists which Server Actions call `assertReelBudget` in 7.1 vs later stories. |
| Cycle budget-block signal | **Medium — SPEC §3** | Minimal queue semantics for ADR-0001 cron. |

**SPEC blockers on intent:** none. **ADR breaches:** none identified.

---

### Recommended action

Proceed to **SECURITY.md** then **CONTRACT.md** with these **non-negotiable freezes**:

1. **`getCostPolicyForClient(clientId)`** with global fallback; Operator **UPSERT** for global (`client_id NULL`, single row) and per-client override rows.
2. **`assertReelBudget({ clientId, reelScriptId, nextEstimateCents, invokedBy })`** — server-only; called inside every spend path US-7.1 owns (video job create, retry, and agreed LLM regenerates); client never sends estimate or cap.
3. **Audit table** + **`grantBudgetOverride`** Operator action with append-only events.
4. **Operator minimal DTOs** for settings + pre-generation estimate (tier label, cap, cumulative, next estimate, resolved provider display name — no secrets, no full catalog).
5. **`MAX_COST_CENTS_CEILING`** + default **150** documented; **`provider_tier`** enum `low` \| `high` only.
6. **Explicit US-7.2 handoff:** US-7.1 may stub `nextEstimateCents` from catalog placeholders until 7.2 ships; gate logic and audit must still run.
7. **Cliente cost exclusion** at response-shape level on any shared Reel/strategy payloads touched by estimate endpoints.
8. **EN/ES** settings copy: **Política de costo**, presupuesto máximo por Reel, nivel de proveedor (low/high internal labels OK with localized helper text).

Do not check off USER_STORIES acceptance criteria in this gate.
