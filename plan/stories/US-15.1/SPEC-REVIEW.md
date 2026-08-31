## Spec Review — US-15.1

### Verdict: ALIGNED

US-15.1 intent — the **System** runs a **Ciclo semanal automatizado** (Vercel Cron → `CRON_SECRET` Route Handler) per **Cliente** `active` with onboarding ready (Ficha viva + **Preferencias de producción visual**), idempotently orchestrates Estrategia semanal → **Paquete de guion** → caption → provider jobs → **Ensamblado** → branding → **Veredicto QA** → **cola de Aprobación** via existing `invokedBy: "system"` orchestrators; **Operator** may trigger the same runner manually in Phase B — is **aligned** with SPEC §3 **Ciclo semanal automatizado** (S3.M14), SPEC §1 SC-1 / SC-3 / SC-4 (3 Reels/semana to review without human production; first lote ≤ 7 días; review ≤ 30 min), SPEC §1 hard rules (no publish without **Aprobación**; no human recording), SPEC §2 roles (System owns normal cycle; Operator supervises + optional manual trigger), SPEC §4 error paths (ciclo parcial; fallos → Operator), SPEC §5 scheduler pattern (Vercel Cron + `CRON_SECRET` → encola ciclo), **ADR-0001** (automate through approval queue), **ADR-0002** (no IG publish in this story), **ADR-0003** (long FFmpeg/provider poll on Fly — Vercel enqueues only), PLAN Fase 7 / TASKS.md § Scheduler, and frozen upstream seams documented in US-4.1 ✅ · US-5.1 ✅ · US-6.1 ✅ · US-10.1 ✅ · US-11.1 ✅.

**No SPEC amendment required.** Phase A / Phase B split, eligibility without IG-connect gate, async provider enqueue, and Operator pause/skip deferral are **explicit PREP decisions** — not product-direction drift. The **dual-path Estrategia semanal gate** (SPEC auto-avance vs US-4.2 / US-5.1 Operator `approved` requirement) is the main **Phase B CONTRACT freeze**; it is documented in README PO #7 and TASKS OQ1 and is **owned by this story** (integrations-engineer), not a PREP veto.

**Branch `feature/US-15.1-weekly-cron` (2026-08-31):** PREP docs only — no application code yet. This review gates SECURITY → CONTRACT → BUILD Phase A.

**Upstream dependencies satisfied:** US-4.1 ✅ (`generateContentStrategyForClient`, `invokedBy: "system"`) · US-4.2 ✅ (Operator approve; system path deferral documented) · US-5.1 ✅ (`generateReelScriptsForClient` orchestrator + `invokedBy` signature; system approval gate still Operator-only in code) · US-6.1 ✅ (caption system seam) · US-7.1/7.2 ✅ (budget/policy) · US-8.x ✅ · US-9.1–9.3 ✅ · US-10.1 ✅ (QA + branding auto-chain) · US-11.1 ✅ (ensure-on-list approval queue) · US-2.3 ✅ · US-3.1 ✅ · US-14.5 ✅ · US-16.1/16.2 ✅.

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **High** | **Dual-path Estrategia semanal gate unresolved for Phase B.** SPEC §3 Content Strategy **auto-avance** + ADR-0001 require System to continue Estrategia → guiones without Operator approve. US-4.2 / US-5.1 / US-6.1 CONTRACTs freeze Operator path = `status = 'approved'`; system path deferred to integrations-engineer. Live code: `generateReelScriptsForClient` always calls `loadApprovedStrategyForScriptJob` → `STRATEGY_NOT_APPROVED` on draft. US-15.1 Phase B **must** pick one: (A) `autoApproveContentStrategyForWeek` after valid draft, or (B) system-only draft bypass in script/caption orchestrators. | SPEC §3 Content Strategy auto-avance; S3.M14; ADR-0001; US-4.2 CONTRACT § Dual-path; US-5.1 CONTRACT § Dual-path | **CONTRACT Phase B delta (before Phase B BUILD):** freeze gate + implement helper; SECURITY reviews auto-approve audit/immutability. Phase A dry-run may plan `strategy` step without resolving gate. |
| **Medium** | **Onboarding “completo” vs IG connect deferred.** SPEC S3.M14 / TASKS F7: cron for Cliente `active` con **onboarding listo**; TASKS also lists IG connect checklist before cron. US-15.1 V1 eligibility = profile exists + `visualModeSummary !== null` only (IG connect out). Producing Reels to **Aprobación** does not require IG Graph token; publish (Fase 6) does. Acceptable V1 slice if CONTRACT documents residual gate. | S3.M14; TASKS.md F7 onboarding; Flujo S4.1 | CONTRACT: freeze eligibility predicate; record TASKS “checklist onboarding” + IG connect as **follow-up** (do not silently claim full onboarding checklist). |
| **Medium** | **Async provider / assembly completion vs SC-1 “listos para aprobar”.** Phase B PO lean: enqueue jobs + `step_log` status `pending_provider` acceptable for story CLOSE; full package may arrive asynchronously. SPEC §6 internal SLA: ≤ 24 h to approval queue after cron. VALIDATION / integration-checker must verify end-to-end timing — not Phase A. | S3.M14; SPEC §6 SLA ciclo semanal; TASKS OQ2 | CONTRACT: freeze sync vs async per step; never mark approval ensure until assembly+branding+QA gate ready (US-11.1 pattern). Do not block on Fly poll in Vercel cron handler (ADR-0003). |
| **Medium** | **Step order must reuse orchestrators — no new agents.** PREP step list (strategy → scripts → captions → primary → TTS → B-roll → assembly → branding → QA → approval) matches SPEC pipeline. Risk: BUILD invents parallel HTTP or bypasses budget/consent re-checks. | S3.M5–M12; AGENTS.md server-only | CONTRACT: name exact server-only entrypoints per step; forbid new LLM agents/adapters; budget blocks → run step failure (USER_STORIES Phase B [SEC]). |
| **Low** | **Operator pause/skip semana out of scope.** TASKS F7 lists pause/skip UI; README defers follow-up story. SPEC §3 S3.M14 mentions Operator pause/skip — partial module closure acceptable for V1 if recorded. | S3.M14; TASKS F7 | Document in CONTRACT scope-out; do not drop from SPEC — track follow-up story. |
| **Low** | **Phase A idempotency: live vs dry-run.** USER_STORIES: second cron tick same client+week returns existing run without duplicate spend; `dryRun` may re-plan without writes. CONTRACT must define whether dry-run updates ledger row or is read-only overlay. | S3.M14 idempotencia; USER_STORIES Phase A AC | CONTRACT Phase A: freeze `acquireWeeklyCycleRun` semantics for `dry_run` vs `running`/`completed`. |
| **Low** | **Manual trigger `clientId` tenancy.** PO lean: Operator may trigger any active client. Aligns with Operator supervision role; SECURITY must IDOR-guard via `requireOperator` only (V1 single-operator internal use). | SPEC §2 Operator; AGENTS.md | SECURITY: freeze manual action auth; reject forbidden body fields; no Cliente-triggered cycle. |
| **Info** | **ADR-0001 — this story is the implementation.** Vercel Cron → `/api/cron/weekly-cycle` + `CRON_SECRET` matches SPEC §5 and ADR-0001. System path does not require Operator for happy path. | ADR-0001; SPEC §5; S3.M14 | Phase A: auth + ledger + dry-run planner. Phase B: live wiring. |
| **Info** | **ADR-0002 respected.** Explicit scope-out: no Instagram Graph publish; System stops at approval queue; SC-2 intact. | ADR-0002; SPEC §1 SC-2 | Do not add publish routes or auto-publish flags in cron runner. |
| **Info** | **ADR-0003 respected.** Cron/orchestrator on Vercel enqueues assembly/branding/provider jobs; no FFmpeg or long poll in Route Handler. | ADR-0003; SPEC §5 | Worker poller unchanged; orchestrator returns after enqueue where CONTRACT freezes. |
| **Info** | **Hard rules intact.** No publish without **Aprobación**; no human recording; no Stories/multicanal/ads/RBAC UI; Playbook ≠ Trend (consumes existing helpers only). | SPEC §1; CONTEXT | Out-of-scope table in README held. |
| **Info** | **NFR / stack.** `neuramark_weekly_cycle_runs` prefix; server-only orchestrator `import "server-only"`; multi-tenant `client_id`; Phase B EN/ES Operator UI; secrets (`CRON_SECRET`) never client-exposed. | SPEC §5–§6; AGENTS.md | CONTRACT freezes DDL + auth header pattern. |
| **Info** | **Phase A dry-run-first ALIGNED.** No LLM/provider spend in Phase A AC reduces risk before dual-path gate implementation — good BUILD sequencing. | README Phase split; USER_STORIES Phase A | VALIDATION Phase A must assert spend orchestrators not called when `dryRun=true`. |

---

### US-5.1 orchestrator seam (binding for Phase B)

| Artifact | US-15.1 obligation |
|----------|-------------------|
| `generateReelScriptsForClient({ clientId, weekStart, strategyId, invokedBy: "system", mode: "batch" })` | Phase B **must** call after strategy step; **`strategyId`** from strategy step output |
| `loadApprovedStrategyForScriptJob` (internal) | **Blocks system path today** until gate (A) or (B) above is implemented |
| Five-helper pipeline inside orchestrator | **Do not bypass** — weekly runner calls orchestrator, not agent modules directly |
| Operator path unchanged | Manual Operator script actions still require `approved`; cron must not weaken Operator gate |

Same pattern applies to **`generateReelCaptionsForClient`** (US-6.1) and downstream video/assembly/QA helpers: wire **existing** server-only entrypoints with trusted `clientId` from eligibility query — never browser-supplied `clientId` on cron path.

---

### TASKS / README open questions — resolved against SPEC

| # | Question | Resolution | SPEC / ADR basis |
|---|----------|------------|------------------|
| 1 | Strategy auto-approve vs draft-bypass | **Must freeze in CONTRACT Phase B** — pick one before Phase B BUILD; SECURITY reviews chosen path | SPEC auto-avance; ADR-0001; US-4.2 / US-5.1 dual-path |
| 2 | Async provider completion | **Enqueue + step status acceptable** for story CLOSE; E2E SC-1 timing = integration-checker / VALIDATION Phase B | ADR-0003; SPEC §6 SLA |
| 3 | Cron schedule | **Single UTC** (e.g. Monday 06:00) for V1 — CONTRACT freezes | S3.M14; multi-tenant simplicity |
| 4 | Manual trigger tenant scope | **Any active client** with `requireOperator` — V1 internal | SPEC §2 Operator supervision |
| 5 | Rate limit / burst | **Sequential per client** per cron tick — no parallel spend burst | SPEC §6 concurrencia V1 |

**No SPEC amendment required** for resolutions above.

---

### Terminology violations (CONTEXT)

**None blocking** in README/TASKS for PREP (uses **Ciclo semanal automatizado**, **Estrategia semanal**, **cola de Aprobación** in canonical-terms line; defers CONTEXT _Evitar_ correctly).

Phase B FE (`operator.cycle.*`) must use:

| Prefer | _Evitar_ |
|--------|----------|
| **Ciclo semanal automatizado** | cron, batch job (product UI) |
| **cola de Aprobación** | approval queue (ES primary label) |
| **Estrategia semanal** | weekly brief |
| **Cliente** / **Operator** | prestador, admin, staff |
| **Paquete de guion** | script package |
| **Reel ensamblado** / **Ensamblado** | assembled reel (Cliente-facing ES) |

Technical terms (`dry-run`, `CRON_SECRET`, `weekStart`, `step_log`, `invokedBy`) OK in Operator diagnostics and server logs.

---

### Blockers for SECURITY / CONTRACT

| Item | Blocks? | Guidance |
|------|---------|----------|
| Phase A CONTRACT (cron auth, ledger DDL, eligibility, dry-run orchestrator) | **Yes — BUILD Phase A gate** | Freeze after SECURITY; no Phase B wiring in Phase A BUILD |
| Phase B CONTRACT (live steps, strategy gate, manual trigger, FE) | **Yes — BUILD Phase B gate** | Requires FE signoff; **strategy gate freeze mandatory** |
| Dual-path strategy gate implementation | **Yes — Phase B BUILD only** | Does not block SECURITY or Phase A CONTRACT |
| IG-connect onboarding checklist | **No — documented deferral** | Record in CONTRACT; optional follow-up story |
| Operator pause/skip | **No — follow-up story** | Do not implement in US-15.1 unless scope amended |
| SC-1..SC-4 formal verification | **No — integration-checker PHASE-7** | USER_STORIES scope-out explicit |

**SPEC blockers on intent:** none. **ADR breaches:** none if BUILD follows enqueue-only Vercel + no IG publish.

---

### Recommended action

1. **Proceed to SECURITY.md** — no SPEC veto. Phase A focus: `CRON_SECRET` constant-time compare, cron-only HTTP surface, ledger tenancy, dry-run spend guard, manual-trigger deferral auth sketch for Phase B.
2. **CONTRACT.md Phase A** — freeze Route Handler, `neuramark_weekly_cycle_runs`, eligibility helpers, `runWeeklyCycleBatch` / `runWeeklyCycleForClient` dry-run branch, idempotency semantics, `vercel.json` cron schedule.
3. **CONTRACT.md Phase B delta (before Phase B BUILD)** — freeze **strategy gate (A or B)**, live orchestrator wiring table (exact imports from US-4.1 / US-5.1 / US-6.1 / US-8.x / US-9.x / US-10.1 / US-11.1), partial failure `step_log` shape, Operator `/operator/cycle` props + EN/ES keys.
4. Do **not** check off USER_STORIES acceptance criteria in this gate. Do **not** write application code in SPEC-REVIEW.

**Next gate:** SECURITY → CONTRACT Phase A → BUILD Phase A.
