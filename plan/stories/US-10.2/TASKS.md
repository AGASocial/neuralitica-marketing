# US-10.2 — Operator override with reason

**Priority:** P0  
**Depends on:** US-10.1 ✅ Veredicto QA + catalog + OperatorQaPanel + gate Phase A  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-10.2 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **nextjs-backend** (DDL, override action, gate extension, DTOs) + **nextjs-frontend** (modal, audit list, i18n). Per `docs/development/AGENT-ROSTER.md` Fase 5. **No** content-agents-engineer · **No** media-pipeline-engineer · **No** integrations-engineer.  
**Canonical terms:** **Veredicto QA** · **Aprobación** · **Operator** · **Cliente**. Avoid CONTEXT _Evitar_ list in product-facing copy.

## Out of scope (do not implement here)

- **US-11.1** Cliente approval package / decision UI / `neuramark_approvals` writes (consume gate + override DTO only).
- **Override-all** / report-level bypass parameter.
- **UPDATE** `neuramark_qa_reports.status` → `passed` when overriding.
- **Cliente** override UI or Cliente-callable override action.
- Catalog / severity mutation.
- QA run / LLM agent changes (US-10.1).
- DELETE/UPDATE endpoints on `neuramark_qa_overrides`.
- **RBAC** beyond `requireOperator()`.

## Scope split

| Concern | Owner |
|---------|--------|
| `neuramark_qa_overrides` DDL + RLS deny-by-default | **BE** |
| `overrideQaCheck` Server Action + orchestration | **BE** |
| Import `lib/qa/check-catalog.ts` for blocking 403 | **BE** |
| Extend `getQaGateStatusForAssembledReel` readiness | **BE** |
| Attach overrides to Operator QA DTO / week payload | **BE** + **FE** |
| Override modal + audit on `OperatorQaPanel` | **FE** |
| EN/ES `scripts.qa.override.*` | **FE** |
| Approval-screen render of overrides | **US-11.1** (DTO shipped here) |

## Implementer routing

| Agent | Owns |
|-------|------|
| **nextjs-backend** | Migration · Zod request/response · Server Action · persist override · gate helper extension · list/detail DTO fields · security tests |
| **nextjs-frontend** | `OperatorQaPanel` override CTA + Dialog · audit list · disabled states for blocking · i18n · toast/error mapping |

---

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Branch | **`feature/US-10.2-qa-override`** |
| Table | **`neuramark_qa_overrides`** append-only |
| Columns | `id`, `client_id`, `qa_report_id`, `assembled_reel_id`, `check_key`, `reason`, `operator_client_id`, `created_at` |
| Input | **`{ qaReportId, checkKey, reason }` only** — no override-all |
| Blocking | **403** even for Operator (`own_avatar_consent`, `generic_avatar_not_owner`) |
| Reason | Trimmed **min 1 / max 500** (US-7.1 / US-8.4 house) |
| Report status | **Unchanged** on override (stays `failed` / `blocked`) |
| Gate | `ready` iff `passed` **OR** (`failed` ∧ no blocking fails ∧ all failed overridable keys overridden) |
| FE | Modal on **`OperatorQaPanel`**; audit list; no Cliente override |
| Approval visibility | Ship override DTO now; US-11.1 renders |
| Auth | **`requireOperator("handler")`** first |
| Implementers | nextjs-backend + nextjs-frontend |

### DDL sketch (CONTRACT freezes SQL)

```sql
-- neuramark_qa_overrides (append-only)
-- id uuid PK
-- client_id uuid NOT NULL → neuramark_clients
-- qa_report_id uuid NOT NULL → neuramark_qa_reports ON DELETE CASCADE
-- assembled_reel_id uuid NOT NULL → neuramark_assembled_reels
-- check_key text NOT NULL
-- reason text NOT NULL CHECK (char_length(reason) >= 1 AND char_length(reason) <= 500)
-- operator_client_id uuid NOT NULL → neuramark_clients
-- created_at timestamptz NOT NULL DEFAULT now()
-- RLS ENABLE; zero policies
```

### Override action sketch

```ts
// overrideQaCheck({ qaReportId, checkKey, reason })
// 1. requireOperator("handler")
// 2. reject forbidden keys / overrideAll
// 3. load report by id + server client_id → 404
// 4. if isBlockingCheckKey(checkKey) → 403
// 5. if check not fail+overridable on report → typed error
// 6. INSERT override (server operator_client_id, denormalized client_id + assembled_reel_id)
// 7. return updated detail DTO (report + overrides) — status unchanged
```

### Gate sketch (US-11.1 consumer — freeze in this story)

```ts
// getQaGateStatusForAssembledReel(assembledReelId) →
// {
//   ready: boolean;
//   status: QaReportStatus | null;
//   hasBlockingFailures: boolean;
//   hasOverridableFailures: boolean;
//   qaReportId: string | null;
//   overriddenCheckKeys?: string[];      // CONTRACT exact
//   uncoveredFailedCheckKeys?: string[]; // CONTRACT exact
// }
// ready =
//   status === "passed"
//   || (status === "failed"
//       && !hasBlockingFailures
//       && every failed overridable checkKey has ≥1 override row)
// NEVER accepts client-supplied passed / override flags
```

### Phased BUILD checklist

| Phase | Deliverables |
|-------|----------------|
| **A (US-10.2)** | DDL · override action · blocking 403 · gate extension · Operator modal + audit · override DTO · SEC |
| **B (US-11.1)** | Cliente approval UI shows overrides; gate re-check on create/decision |

---

## FE checklist

- [ ] On `OperatorQaPanel`, for each check with `status === fail` and `severity === overridable`: **Override** control opens Dialog (PrimeReact; mirror `VideoJobRetryLimitOverrideDialog`)
- [ ] Dialog: reason `InputTextarea`; submit disabled unless trimmed length ∈ [1, 500]; cancel; pending state
- [ ] Blocking failed checks: **no** override CTA; show legal/non-overridable copy (EN/ES)
- [ ] After success: refresh panel (report status unchanged; audit list grows); toast
- [ ] Audit list: chronological overrides for current report (`checkKey` label, reason, timestamp; optional operator display)
- [ ] Empty / loading / error / forbidden states
- [ ] i18n: `scripts.qa.override.*` (+ reuse check labels from `scripts.qa.checks.*`)
- [ ] No Cliente surface; no override-all control
- [ ] Plain text / PrimeReact only — no `dangerouslySetInnerHTML`

## BE checklist

- [ ] Migration `neuramark_qa_overrides` (`neuramark_` prefix, RLS zero policies, CHECK on reason length)
- [ ] Zod `.strict()` request: `{ qaReportId, checkKey, reason }` only; forbidden-key helper
- [ ] Server Action `overrideQaCheck` (CONTRACT name): `requireOperator` first; tenancy 404; blocking → 403; INSERT only
- [ ] Import severity from `lib/qa/check-catalog.ts` — do not trust body severity
- [ ] Do **not** UPDATE `neuramark_qa_reports.status` / `checks` on override
- [ ] Extend `getQaGateStatusForAssembledReel` per PO gate freeze (replace Phase A `isQaReportReadyPhaseA`-only path)
- [ ] Load overrides for Operator detail / week map DTO (and gate optional key lists)
- [ ] Rate limit lean (`qa_override`) if CONTRACT keeps PO lean
- [ ] Automated tests: Cliente 403; blocking 403; foreign report 404; empty reason reject; override-all / forbidden fields; gate ready after full coverage; gate not ready if one overridable uncovered; `blocked` never ready via overrides; append-only (no update/delete route)

## DB checklist

- [ ] `neuramark_qa_overrides` as sketched; FKs + indexes
- [ ] RLS enabled, zero policies
- [ ] No triggers that UPDATE/DELETE override rows from app paths
- [ ] ON DELETE CASCADE from `qa_report_id` (report gone → overrides gone)

---

## Sequence

1. **PREP** (this folder) — PO freezes ✅  
2. **SPEC-REVIEW** — spec-guardian  
3. **SECURITY** — security-architect  
4. **CONTRACT** — nextjs-backend → FE Reviewed by  
5. **BUILD** — BE then/with FE against frozen contract  
6. **VALIDATION** → **QA** → **CLOSE**

## Dependencies

| Depends on | Status |
|------------|--------|
| US-10.1 | ✅ CLOSED |
| US-14.5 `requireOperator` | ✅ |
| Soft → US-11.1 | Consumes gate + override visibility |

## Open questions

See `README.md` § Open questions — none block PREP → SECURITY.
