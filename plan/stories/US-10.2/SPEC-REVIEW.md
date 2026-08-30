## Spec Review — US-10.2

### Verdict: ALIGNED

US-10.2 intent — the **Operator** overrides a single failed **overridable** check on a **Veredicto QA** with a documented non-empty reason; the **System** appends an audit row to **`neuramark_qa_overrides`**, rejects **blocking** (legal) overrides with **403** even for Operator, leaves report `status` server-derived (does **not** rewrite to `passed`), and extends **`getQaGateStatusForAssembledReel`** so **Aprobación** (US-11.1) can treat `failed` + full overridable coverage as ready — is **aligned** with SPEC §3 **QA/Compliance Agent** (S3.M11: Operator override overridable con motivo append-only; no override legal), SPEC §2 (acciones solo Operator: overrides QA salvo gates legales), SPEC §4 error path (**QA blocking legal** → sin override), SPEC §1 SC-1/SC-2 (unstall delivery without publishing; override ≠ Aprobación ≠ publish), SPEC §5–§6 (`neuramark_*`, server-only secrets, multi-tenant `client_id`, EN/ES), USER_STORIES § US-10.2 AC, and frozen upstream **US-10.1** ✅ (catalog `blocking`/`overridable`, `OperatorQaPanel`, Phase A gate ready iff `passed`).

**No SPEC amendment required.** Soft hygiene notes (USER_STORIES DB shorthand; US-11.1 Depends line; approval-screen AC via DTO handoff) do **not** block SECURITY or CONTRACT. Soft gaps are CONTRACT freezes and downstream US-11.1 render — not product-direction drift.

**Upstream dependencies satisfied:** US-10.1 ✅ CLOSED Phase A · US-3.4 / US-3.2 ✅ blocking keys · US-8.4 ✅ append-only override + reason 1–500 house pattern · US-14.5 ✅ `requireOperator()` · US-11.1 soft consumer of gate + override DTO.

**US-11.1 gate notes consumed (from US-10.1 CONTRACT / SPEC-REVIEW):** Phase A `ready` iff `passed`; helper already exposes `hasBlockingFailures` / `hasOverridableFailures`; US-11.1 must re-check gate on package create + decision and never honor client `qaPassed`. PREP PO #11–#12 correctly replace Phase A readiness with override coverage without reopening report authority or client-writable flags.

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **Low** | **AC “Overrides visible on approval screen” vs no US-11.1 UI.** USER_STORIES AC implies Cliente Aprobación surface; PREP correctly scopes render to US-11.1 and satisfies US-10.2 via **DTO / gate payload** handoff. Soft AC phasing — not a SPEC conflict (S3.M11 requires audit + gate, not that this story own M12 UI). | USER_STORIES US-10.2 AC; S3.M11–M12; README VALIDATION note | CONTRACT + VALIDATION: ship `overrides` / `overriddenCheckKeys` / `uncoveredFailedCheckKeys` on Operator + gate DTO; record approval-screen render as **US-11.1**. Do not build Cliente Aprobación page here. |
| **Low** | **USER_STORIES DB shorthand.** Row lists `qa_overrides` + `user_id`; canonical table **`neuramark_qa_overrides`** with **`operator_client_id`** (mirror US-8.4) + denormalized `client_id` / `assembled_reel_id`. | SPEC §1 prefix; §6; AGENTS.md; US-8.4 CONTRACT | CONTRACT uses prefixed names + `operator_client_id`; amend USER_STORIES DB row when PO next edits. |
| **Low** | **US-11.1 Depends omits US-10.2.** USER_STORIES Depends still lists US-10.1 only; override-ready gate is a soft dependency. | USER_STORIES US-11.1; US-10.1 downstream obligations | Soft DEPENDS amend when PO next edits USER_STORIES — not a PREP/SPEC veto. |
| **Info** | **S3.M11 + §4 legal non-override ALIGNED.** PREP freezes 403 on `own_avatar_consent` + `generic_avatar_not_owner` via catalog import; `blocked` report never becomes ready via ledger; report status not mutated to `passed`. | S3.M11; SPEC §4 QA blocking legal; US-10.1 catalog | SECURITY: bypass tests even for Operator session; CONTRACT imports `isBlockingCheckKey` — never trust body severity. |
| **Info** | **Gate extension ALIGNED with US-10.1 foresight.** `ready` iff `passed` **or** (`failed` ∧ no blocking fails ∧ every failed overridable key has ≥1 override). Matches US-10.1 Phase B / SPEC gate a Aprobación. | S3.M11–M12; US-10.1 CONTRACT § Gate helper; US-11.1 | CONTRACT freezes exact readiness boolean + DTO field names; helper remains DB-only (no HTTP `ready` / override flags). |
| **Info** | **Per-check append-only ALIGNED.** One INSERT = one `(qa_report_id, check_key)`; no override-all; no UPDATE/DELETE endpoints; reason trim 1–500; actor from `getCurrentUser()` after `requireOperator`. | USER_STORIES [SEC]; S3.M11 append-only; US-8.4 pattern | CONTRACT: Zod `.strict()` `{ qaReportId, checkKey, reason }` only; forbidden-key scan for bypass params. |
| **Info** | **Roles / surfaces ALIGNED.** Override modal + audit on existing **`OperatorQaPanel`** (`/operator/scripts`); no Cliente override; no new Operator route; no RBAC UI. | SPEC §2; S3.M11 | FE: blocking rows locked (no CTA); EN/ES `scripts.qa.override.*`. |
| **Info** | **ADRs respected.** No IG publish (ADR-0002); no Fly FFmpeg work (ADR-0003); no weekly cron HTTP (ADR-0001). Override + gate stay on Next/Vercel app layer. | ADR-0001–0003 | Do not add Graph publish or worker jobs for this story. |
| **Info** | **Hard rules / out of scope intact.** No publish without Aprobación (SC-2); no human recording; no Stories/multicanal/ads/RBAC; Playbook ≠ Trend untouched; catalog severity not endpoint-editable. | SPEC §1; S3.M11; SECURITY_BASELINE §7 | Override unstalls overridable QA only — Cliente still decides in Aprobación. |
| **Info** | **NFR / stack.** `neuramark_*`; RLS deny-by-default; multi-tenant `client_id` from report/session (never body); i18n EN/ES; light rate limit lean (`qa_override`) for CONTRACT/SECURITY. | SPEC §5–§6; AGENTS.md | SECURITY may waive rate limit if low risk; PO lean is light yes. |

---

### Terminology violations (CONTEXT)

**None that block** in README/TASKS (uses **Veredicto QA**, **Aprobación**, **Operator**, **Cliente**, **Ensamblado**, **disclosure**; correctly scopes _Evitar_ “QA verdict” as product noun; no admin/staff; no Cliente override capability).

Product-facing EN/ES for US-10.2 UI must use:

| Prefer | _Evitar_ |
|--------|----------|
| **Veredicto QA** | QA verdict (as primary product noun) |
| **Aprobación** | approval decision (as primary ES noun) |
| **Operator** | admin, administrador, staff |
| **Cliente** | prestador, dueño, usuario final |
| **Consentimiento de avatar** | consent ledger (in business glossary UI) |
| **disclosure** (presenter is not the owner) | impersonation (in Cliente-facing copy) |
| **Reel ensamblado** / **Ensamblado** | assembled reel (user-facing ES) |

Technical enums (`checkKey`, `blocking`, `overridable`, `qa_override`, `operator_client_id`) OK in code/DB and Operator diagnostics; map to localized labels in FE. Do **not** label a failed legal block as Operator-overridable. Do **not** expose override CTA to Cliente.

---

### Blockers for SECURITY / CONTRACT

| Item | Blocks? | Guidance |
|------|---------|----------|
| US-10.2 SECURITY.md | **Yes — next gate** | Threat model: Operator-only mutation, blocking 403, append-only, per-check, IDOR 404, no report status rewrite, gate purity. |
| US-10.2 CONTRACT.md (DDL, action, gate, DTOs) | **Yes — BUILD gate** | Freeze after SECURITY; **Reviewed by FE** before BUILD. |
| Import US-10.1 check catalog for severity | **Yes — [SEC] AC** | Server authority; never trust request severity / overrideAll. |
| Gate helper extension | **Yes — SPEC S3.M11–M12 + US-11.1** | Replace Phase A `passed`-only; `blocked` never ready via overrides. |
| Append-only `neuramark_qa_overrides` | **Yes — [SEC] AC** | No UPDATE/DELETE endpoints; RLS zero policies. |
| Per-check input only | **Yes — [SEC] AC** | Zod `.strict()`; reject report-level bypass. |
| Approval UI render | **No — US-11.1** | DTO handoff in 10.2; VALIDATION must not claim Cliente screen closed. |
| Catalog / QA run / LLM changes | **No — out of scope** | US-10.1 owns. |
| Weekly cron / IG publish / Fly worker | **No — out of scope** | ADR-0001–0003. |

**SPEC blockers on intent:** none. **ADR breaches:** none if override + gate stay on Next server layer and no IG publish.

**SECURITY can proceed?** **Yes.** [SEC] AC items (Operator-only 403, blocking non-overridable even for Operator, append-only ledger, per-check only, no client-writable ready/passed) and SECURITY_BASELINE continuity with US-10.1 / US-8.4 are specified sufficiently for **security-architect** to author **SECURITY.md**.

**CONTRACT blockers (freeze before BUILD):**

1. Migration — `neuramark_qa_overrides` (`id`, `client_id`, `qa_report_id` FK CASCADE, `assembled_reel_id`, `check_key`, `reason` CHECK 1–500, `operator_client_id`, `created_at`); indexes; RLS enabled, zero policies.
2. **`overrideQaCheck({ qaReportId, checkKey, reason })`** — `requireOperator("handler")` first; tenancy 404; catalog blocking → 403; only `fail` + overridable; INSERT only; never UPDATE report `status`/`checks`; actor from session.
3. Extend **`getQaGateStatusForAssembledReel`** — readiness per PO #11; add CONTRACT-exact `overriddenCheckKeys` / `uncoveredFailedCheckKeys` (and Operator `overrides[]` detail); DB-only authority.
4. Zod `.strict()` + forbidden keys (`overrideAll`, `overrides`, `ready`, `passed`, `status`, `severity`, `clientId`, …).
5. Operator FE contract — modal on `OperatorQaPanel`; blocking locked; audit list; EN/ES; mirror US-8.4 reason dialog pattern.
6. Optional light rate limit `agent_key: 'qa_override'`.
7. Phased acceptance — US-10.2 closes override + gate + Operator audit DTO; US-11.1 renders Cliente visibility + re-check gate on decision.

---

### Recommended action

Proceed to **SECURITY.md** (no SPEC veto), then **US-10.2 CONTRACT.md** with the non-negotiable freezes above.

1. **S3.M11 override path** — per-check, motivo, append-only; legal class 403 forever.
2. **Gate to Aprobación** — extend helper here; US-11.1 consumes only.
3. **Report status immutable on override** — ledger separate from derived verdict.
4. **House pattern** — reason 1–500 + `operator_client_id` like US-8.4.
5. **Explicit out of scope:** Cliente Aprobación UI, override-all, catalog mutation, QA re-run/LLM, Stories IG, multicanal, ads, RBAC UI, Playbook/Trend, Fly FFmpeg, IG publish.

**Gate status:** SPEC-REVIEW **ALIGNED**. Next: security-architect **SECURITY.md** → nextjs-backend **CONTRACT.md** (Reviewed by FE) → BUILD.
