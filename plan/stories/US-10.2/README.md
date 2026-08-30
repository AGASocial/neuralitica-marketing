# US-10.2 — Operator override with reason

**Status:** CLOSED Phase A (2026-08-30) — VALIDATION PASS WITH NOTES `d7e3cd5` (22/22) · QA APPROVE WITH CONDITIONS `3da5547` · 7/7 AC. Cliente approval-screen render of overrides → US-11.1.

**As a** Operator, **I want** to override a failed QA check with documented reason, **so that** edge cases do not stall delivery.

Ship **per-check Operator override** for failed **overridable** Veredicto QA checks: append-only `neuramark_qa_overrides` ledger; Operator-only Server Action with non-empty reason; **403** on `blocking` (consent / generic-avatar) even for Operator; extend **`getQaGateStatusForAssembledReel`** so US-11.1 can treat `failed` + full overridable coverage as ready; override modal + audit list on **`OperatorQaPanel`** (`/operator/scripts`). No Cliente override. Approval-screen visibility is a **DTO handoff** for US-11.1 (may ship fields now).

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-10.2 (do **not** check off in PREP).

**This folder:** [`plan/stories/US-10.2/`](./) — `README.md` · `TASKS.md` · `SPEC-REVIEW.md` · `SECURITY.md` · `CONTRACT.md`. Next: FE Reviewed by → BUILD.

**Branch:** `feature/US-10.2-qa-override`

**Depends on:** [US-10.1](../US-10.1/) ✅ Phase A CLOSED — `neuramark_qa_reports`, check catalog (`blocking` vs `overridable`), `OperatorQaPanel`, gate helper ready **iff** `passed` until this story.

**Upstream contracts:** [US-10.1 CONTRACT](../US-10.1/CONTRACT.md) · [US-10.1 SECURITY](../US-10.1/SECURITY.md) · [US-10.1 README](../US-10.1/README.md) · `lib/qa/check-catalog.ts` · `lib/qa/get-qa-gate-status-for-assembled-reel.ts` · `components/scripts/OperatorQaPanel.tsx` · house override pattern [US-8.4](../US-8.4/) (`neuramark_video_job_retry_overrides`, reason 1–500).

**Unblocks:** [US-11.1](../../USER_STORIES.md) Aprobación package — gate accepts `passed` **or** `failed` + overrides covering all failed overridable checks; approval UI shows override audit (consumes DTO).

---

## Scope in

| Area | What US-10.2 BUILD adds |
|------|-------------------------|
| **FE (Operator)** | Override modal on **`OperatorQaPanel`** (per failed **overridable** row); reason required; audit list of overrides for current report; EN/ES. No Cliente override UI. |
| **BE** | Operator-gated **`overrideQaCheck({ qaReportId, checkKey, reason })`** (CONTRACT freezes name); import catalog for 403 on `blocking`; append-only INSERT; extend **`getQaGateStatusForAssembledReel`** readiness rules; batch-load overrides onto Operator QA DTO (+ optional gate DTO fields for US-11.1). |
| **DB** | **`neuramark_qa_overrides`** append-only (see PO freezes). RLS deny-by-default. |
| **Implementers** | **nextjs-backend** + **nextjs-frontend** only. **No** content-agents-engineer · **No** media-pipeline · **No** integrations. |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **US-11.1** Cliente Aprobación package / decision UI / `neuramark_approvals` | Soft downstream — consumes gate + override visibility DTO; may render later. |
| **Override-all / report-level bypass** | Forbidden by [SEC] AC. |
| **Mutating `neuramark_qa_reports.status` to `passed` on override** | Report stays server-derived; gate reads overrides ledger separately. |
| **Cliente override or Cliente-callable override action** | Operator-only. |
| **Reclassifying checks / catalog CRUD** | Code-only catalog unchanged (US-10.1). |
| **QA re-run / LLM agent changes** | Owned by US-10.1; this story only adds override + gate extension. |
| **DELETE/UPDATE override endpoints** | Append-only. |
| **RBAC** beyond `requireOperator()` | Unchanged. |

## Canonical terms (CONTEXT)

Use **Veredicto QA**, **Ensamblado**, **Aprobación**, **Operator**, **Cliente**, **disclosure**.  
_Evitar:_ “QA verdict” as product noun; admin/staff; exposing override as Cliente capability.

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-10.1 | `neuramark_qa_reports` UPSERT · status `passed`/`failed`/`blocked` · `lib/qa/check-catalog.ts` · `OperatorQaPanel` · `getQaGateStatusForAssembledReel` Phase A ready iff `passed` |
| US-3.4 / US-3.2 | `generic_avatar_not_owner` + `own_avatar_consent` = **blocking** — must 403 on override |
| US-8.4 | Append-only override + reason **1–500** + `operator_client_id` pattern — **mirror**, do not invent a third reason policy |
| US-14.5 | `requireOperator("handler")` first |

**US-10.2 adds override ledger + gate extension + Operator modal/audit** — not new QA checks, not Cliente Aprobación UI.

---

## Phased BUILD (PO)

| Phase | Scope | Closes |
|-------|-------|--------|
| **A (US-10.2 BUILD — ship first)** | DDL `neuramark_qa_overrides` · `overrideQaCheck` · catalog 403 on `blocking` · extend gate helper · Operator modal + audit on QA panel · DTO fields (`overrides` / overridden keys) for Operator + US-11.1 handoff · [SEC] append-only / per-check / Operator-only | USER_STORIES § US-10.2 AC rows |
| **B (US-11.1 — soft)** | Cliente approval screen **renders** override audit; re-check gate on package create + decision | USER_STORIES § US-11.1 (override visibility AC shared) |

**VALIDATION note (binding):** AC “Overrides visible on approval screen” is **satisfied for US-10.2** by shipping the **server DTO / gate payload** that US-11.1 will render — not by building the Cliente approval page in this story. VALIDATION records: no Cliente override; report status not rewritten to `passed`; gate ready when `passed` **or** valid override coverage on `failed`.

---

## Upstream / downstream handoffs

| Direction | Artifact | Rule |
|-----------|----------|------|
| **From US-10.1** | `qaReportId`, per-check `checkKey` + `severity`, report `status` | Override targets **one** check on **one** report |
| **From catalog** | `isBlockingCheckKey` / `QA_CHECK_SEVERITY_BY_KEY` | Handler **must** import — never trust request severity |
| **To US-11.1** | Extended `getQaGateStatusForAssembledReel` + override list DTO | Ready = `passed` **or** (`failed` ∧ no blocking fails ∧ every failed overridable check overridden). Never accept client `qaPassed` / override flags as authority |

---

## PO decisions frozen (2026-08-30)

| # | Topic | Decision |
|---|-------|----------|
| 1 | **Table** | **`neuramark_qa_overrides`** — append-only INSERT; **no** UPDATE/DELETE Server Actions or Route Handlers. |
| 2 | **DDL columns (lean)** | `id` uuid PK · `client_id` NOT NULL (denormalized tenancy from report) · `qa_report_id` FK → `neuramark_qa_reports(id)` ON DELETE CASCADE · `assembled_reel_id` NOT NULL (denormalized from report for gate/list joins) · `check_key` text NOT NULL · `reason` text NOT NULL · `operator_client_id` NOT NULL FK → `neuramark_clients(id)` (server-resolved actor) · `created_at` timestamptz NOT NULL DEFAULT now(). Index `(qa_report_id, check_key)` + `(client_id, assembled_reel_id, created_at DESC)`. RLS enabled, **zero** policies. |
| 3 | **Override input** | **`{ qaReportId, checkKey, reason }` only** (`.strict()`). No `overrideAll`, no `overrides[]`, no `ready`/`passed`/`status`, no `clientId`, no `severity`, no `assembledReelId` as write authority (resolve from report). |
| 4 | **No override-all** | One INSERT = one check on one report. Batch UI that loops N calls is OK; a single request covering many keys is **forbidden**. |
| 5 | **Blocking → 403** | If catalog severity for `checkKey` is `blocking` (`own_avatar_consent`, `generic_avatar_not_owner`) → **403** even for Operator (UI must not offer control; server is authority). Also 403 if check is not currently `fail` on that report (CONTRACT may use typed `CHECK_NOT_FAILED` / `VALIDATION_ERROR` — SECURITY picks; PO lean: reject non-failed targets). |
| 6 | **Overridable only when failed** | Override allowed only when report has that `checkKey` with `status === 'fail'` and catalog `overridable`. Unknown `checkKey` → validation error. |
| 7 | **Reason length** | After trim: **min 1, max 500** — same house constants as US-7.1 / US-8.4 (`OVERRIDE_REASON_*`). Empty/whitespace → validation fail (AC “non-empty reason”). |
| 8 | **Actor** | `operator_client_id` / identity from **`getCurrentUser()`** after **`requireOperator("handler")`** — never from body. |
| 9 | **Tenancy** | Load report `WHERE id = $qaReportId AND client_id = $serverClientId`; foreign → **404**. INSERT uses same `client_id`. |
| 10 | **Report status unchanged** | Override does **not** UPDATE `neuramark_qa_reports.status` or `checks`. Status remains server-derived from last QA run (`failed` stays `failed`). |
| 11 | **Gate extension (freeze here for US-11.1)** | Extend `getQaGateStatusForAssembledReel` (same function; replace Phase A helper): **`ready === true`** iff (a) `status === 'passed'`, **or** (b) `status === 'failed'` **and** `hasBlockingFailures === false` **and** every check in `checks` with `status === 'fail'` and catalog severity `overridable` has **≥1** row in `neuramark_qa_overrides` for that `qa_report_id` + `check_key`. **`status === 'blocked'`** / `pending` / `running` / missing → **not ready**. Do **not** treat `blocked` as overridable via ledger. |
| 12 | **Gate DTO extension** | Keep existing fields; add (CONTRACT exact names): e.g. `overriddenCheckKeys: string[]` and/or `uncoveredFailedCheckKeys: string[]` so US-11.1 can explain readiness without re-querying. Optional `overrides: { checkKey, reason, operatorDisplayName?, createdAt }[]` on Operator detail DTO — **ship in 10.2**. |
| 13 | **Re-run vs overrides** | US-10.1 UPSERT keeps one report row per `assembled_reel_id` (same `id` typical). Overrides remain keyed by `qa_report_id` + `check_key` and **stay valid** for gate after re-run if that check still fails. If re-run **passes** the check, override rows are inert (append-only history). If re-run introduces a **new** failed overridable key, it needs its own override. No delete-on-rerun. |
| 14 | **Duplicate overrides** | Multiple rows for same `(qa_report_id, check_key)` allowed (append-only audit). Gate treats **any** row as coverage. FE shows chronological list. |
| 15 | **FE surface** | Extend **`OperatorQaPanel`** only (no new route). Per failed overridable row: **Override** opens PrimeReact Dialog (mirror `VideoJobRetryLimitOverrideDialog`). Blocking fails: show locked/legal copy, no override CTA. Audit section lists overrides for current report. |
| 16 | **Cliente** | No override UI; no Cliente-callable action. AC “visible on approval screen” → **DTO handoff**; US-11.1 renders (Cliente-readable reason + check label EN/ES — no Operator-only internals). |
| 17 | **Auth** | `requireOperator("handler")` first on override mutation; Cliente → **403**. |
| 18 | **Rate limit** | Optional lean: reuse agent rate limit with `agent_key: 'qa_override'` **or** skip if SECURITY deems low risk (no LLM). PO lean: **light rate limit** (CONTRACT). |
| 19 | **Implementers** | **nextjs-backend** + **nextjs-frontend** only. |
| 20 | **USER_STORIES soft note** | US-11.1 Depends on line still lists US-10.1; treat **US-10.2 as soft dependency** for override-ready gate — amend USER_STORIES when PO next edits (not a PREP code blocker). |

---

## Gates (orchestrator)

- [x] SPEC-REVIEW.md (spec-guardian) — ALIGNED `6ccf44f`
- [x] SECURITY.md (security-architect) — APPROVE WITH CONDITIONS `66b824f`
- [x] CONTRACT.md (nextjs-backend) — Frozen 2026-08-30 · Reviewed by FE: **yes** `658b5bd`
- [x] BUILD (nextjs-backend `a9cc533` + nextjs-frontend `0c6bfb0`)
- [x] VALIDATION.md — **PASS WITH NOTES** `d7e3cd5` (22/22)
- [x] QA.md — **APPROVE WITH CONDITIONS** `3da5547` · CLOSE yes
- [x] CLOSE Phase A — 7/7 AC checked; Cliente approval render → US-11.1

**Next:** SELECT **US-11.1** (recommended) or US-8.5.

---

## Open questions (for SECURITY / CONTRACT — not PO blockers)

| # | Question | PO lean |
|---|----------|---------|
| 1 | Reject override when check is already `pass` / `skipped`? | **Yes** — typed error; only `fail` + overridable. |
| 2 | Expose override `reason` to Cliente on US-11.1? | **Yes** — plain text, length-capped; XSS via React text only. |
| 3 | Rate limit `qa_override`? | **Light yes** — mirror house pattern unless SECURITY waives. |
| 4 | Gate helper tenancy via `getCurrentUser` vs caller `clientId` | Keep US-10.1 pattern; US-11.1 CONTRACT may add server-context overload later — out of 10.2 unless BUILD needs it. |

---

## SPEC alignment / blockers for spec-guardian

| Item | Assessment |
|------|------------|
| SPEC S3.M11 Operator override overridable + motivo append-only; no override legal | **Aligned** — this story. |
| SPEC §4 QA blocking legal: sin override | **Aligned** — 403 on blocking. |
| SPEC / PLAN Fase 5 gate a Aprobación | **Aligned** if gate extension ships here (PO freeze #11). |
| AC “visible on approval screen” vs no US-11.1 UI | **Soft gap** — resolve via DTO handoff + VALIDATION note; not a SPEC conflict. |
| USER_STORIES US-11.1 Depends on omits US-10.2 | **Soft gap** — recommend DEPENDS amend; not PREP blocker. |

**No SPEC amendment required** for PREP to proceed to SECURITY/CONTRACT.
