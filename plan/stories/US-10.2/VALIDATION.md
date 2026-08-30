# Validation Report — US-10.2

**Story:** US-10.2 — Operator override with reason  
**Phase:** A (ledger + `overrideQaCheck` + gate extension + Operator modal/audit; Cliente approval render = US-11.1)  
**Branch:** `feature/US-10.2-qa-override`  
**Validated against:** `plan/USER_STORIES.md` § US-10.2 · `CONTRACT.md` · `SECURITY.md` · BUILD commits BE `a9cc533` / FE `0c6bfb0`  
**Date:** 2026-08-30  
**Validator:** requirements-validator  
**Do not check off AC in USER_STORIES.md** (PO owns that on PASS).

### Verdict: PASS WITH NOTES

Phase A delivers CONTRACT surfaces, SECURITY floors, Operator override dialog + audit, append-only `neuramark_qa_overrides`, and gate readiness via `passed` **or** full overridable coverage on `failed`. Cliente approval-screen **render** of overrides is correctly deferred to US-11.1 (DTO / gate handoff shipped). Unit suite **22/22** (`lib/qa/qa-override.test.ts`) + related **21/21** (`qa-reports.test.ts` + `check-catalog.test.ts`) — **0 failures**.

**Phase A binding notes (CONTRACT § Phased BUILD / § USER_STORIES AC amendment):**

- AC “Overrides visible on approval screen” → **satisfied for US-10.2** by server `overrides[]` + gate `overriddenCheckKeys` / `uncoveredFailedCheckKeys` — **not** Cliente Aprobación UI.
- Report `status` / `checks` **not** rewritten to `passed` on override.
- Blocking keys always **403** even for Operator; `blocked` never ready via ledger.
- No Cliente override action or UI.

---

### Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Override requires non-empty reason | **PASS** | Zod trim → min 1 / max 500 (`lib/contracts/qa-override.ts` 67–81) using `OVERRIDE_REASON_*`. FE submit disabled unless trimmed length ∈ [1, 500] (`QaOverrideDialog.tsx` 110–113, 180–185). Tests reject empty/whitespace (`qa-override.test.ts` “override reason + input schema”). |
| Overrides visible on approval screen | **PASS WITH NOTES** | CONTRACT binding: DTO handoff only. Detail DTO requires `overrides[]` (`lib/contracts/qa-report.ts` 265–276); batch attach in `getQaReportsForAssembledReels` (55–67); gate returns `overriddenCheckKeys` / `uncoveredFailedCheckKeys` (`get-qa-gate-status-for-assembled-reel.ts` 135–143). Operator audit list on `OperatorQaPanel` (540–597). **Cliente approval render = US-11.1** — not claimed closed. |
| Cannot override consent/legal blocks (own avatar without consent) | **PASS** | Catalog `isBlockingCheckKey` → `CHECK_BLOCKING` before INSERT (`override-qa-check.ts` 80–82). Blocking set `own_avatar_consent`, `generic_avatar_not_owner` (`check-catalog` + test). FE: no Override CTA on blocking fails; locked copy (`OperatorQaPanel.tsx` 465–466, 499–532). |
| Operator-only: override rejects non-operator sessions server-side (403) | **PASS** | `requireOperator("handler")` first await in Server Action (`actions/override-qa-check.ts` 24–35). Cliente → `FORBIDDEN` without INSERT (test “Cliente session → FORBIDDEN”). No Cliente-callable surface under `app/` (grep: zero matches). |
| **[SEC]** Non-overridable set enforced server-side: blocking → 403 even from Operator | **PASS** | Handler imports catalog; blocking returns `CHECK_BLOCKING` regardless of UI (`override-qa-check.ts` 15–17, 80–82). Test: “blocking checkKey → CHECK_BLOCKING, no INSERT”. UI hide is non-authoritative (CONTRACT / SECURITY). |
| **[SEC]** `qa_overrides` append-only; row records check key, reason, server-resolved user, timestamp | **PASS** | Table `neuramark_qa_overrides` INSERT-only migration (`20260831020000_neuramark_qa_overrides.sql`); columns `check_key`, `reason`, `operator_client_id`, `created_at`. `insertQaOverride` only (`persist-qa-override.ts` 76–100). Actor from `params.operator.id` after `requireOperator` (`override-qa-check.ts` 93–100). Test: “no UPDATE/DELETE Server Action or Route Handler”; RLS enabled zero policies. |
| **[SEC]** Override applies to one specific check on one specific QA report; no override-all / report-level bypass | **PASS** | Input `.strict()` `{ qaReportId, checkKey, reason }` only (`qa-override.ts` 67–81). `FORBIDDEN_QA_OVERRIDE_AUTHORITY_KEYS` + `findForbiddenQaOverrideKeys` reject `overrideAll`, `passed`, `status`, `severity`, `clientId`, etc. Tests: smuggle → `FORBIDDEN_FIELDS`; pointer-only allowed. |

---

### CONTRACT surfaces

| # | Surface | Status | Evidence |
|---|---------|--------|----------|
| 1 | `overrideQaCheck` Server Action | **PASS** | `lib/qa/actions/override-qa-check.ts` — Operator-gated; `revalidatePath("/operator/scripts")` on success. |
| 2 | `overrideQaCheckForClient` orchestrator | **PASS** | `lib/qa/override-qa-check.ts` `import "server-only"` — forbidden → Zod → rate limit → scoped load → blocking → fail+overridable → INSERT → DTO; no report status UPDATE. |
| 3 | `getQaGateStatusForAssembledReel` extended | **PASS** | Uses `computeQaGateReady` (not Phase A-only); required key lists present (`get-qa-gate-status-for-assembled-reel.ts` 128–143). Test: “gate helper no longer uses Phase A-only readiness”. |
| 4 | Batch `overrides[]` on week load | **PASS** | `getQaReportsForAssembledReels` batch-loads + attaches (`get-qa-reports-for-assembled-reels.ts` 55–67). |
| 5 | Catalog import (no fork) | **PASS** | Orchestrator + gate import `lib/qa/check-catalog.ts`; test asserts no forked severity map. |
| 6 | Zod + types | **PASS** | `lib/contracts/qa-override.ts` + additive `qa-report.ts` (`OperatorQaOverrideDto`, gate fields). FE signoff on CONTRACT 2026-08-30. |
| 7 | Migration | **PASS** | `supabase/migrations/20260831020000_neuramark_qa_overrides.sql` matches CONTRACT DDL (FKs, CHECK reason, indexes, RLS). |
| 8 | Operator Override UI | **PASS** | `QaOverrideDialog` + `OperatorQaPanel` modal/audit/blocking lock; wired via `ScriptsPageView` `handleQaOverrideSuccess` → merge `result.report`. |

**Forbidden surfaces:** No override UPDATE/DELETE actions; no Cliente override; no report status rewrite; no Route Handler writers — covered by closed-write tests.

---

### SECURITY floors (story + added)

| Floor | Status | Evidence |
|-------|--------|----------|
| `requireOperator("handler")` first await | **PASS** | Action source ordering test + `actions/override-qa-check.ts` 26–27. |
| Pointer-only + forbidden keys | **PASS** | Schema + `findForbiddenQaOverrideKeys`; tests. |
| Catalog authority / blocking 403 | **PASS** | `isBlockingCheckKey` / `isOverridableCheckKey`; tests. |
| Fail + overridable target only | **PASS** | `CHECK_NOT_FAILED` path (`override-qa-check.ts` 84–91); test. |
| Reason 1–500 | **PASS** | House constants + Zod + FE. |
| Actor + tenancy 404 | **PASS** | `loadQaReportById({ qaReportId, clientId })`; foreign → `NOT_FOUND` test. |
| Append-only ledger | **PASS** | INSERT-only persist; grep test. |
| Report verdict immutable | **PASS** | Success returns unchanged `status`; test “successful override keeps report status failed”. |
| Gate purity + `blocked` never via ledger | **PASS** | `computeQaGateReady` + gate helper tests (full coverage / uncovered / blocked / passed). |
| Gate DTO keys informational | **PASS** | Derived server-side; no mutation accepts them as write authority. |
| No Cliente override | **PASS** | Operator action only; no `app/` consumer. |
| Rate limit `qa_override` | **PASS** | `check-qa-override-rate-limit.ts` + constants; test RATE_LIMITED. |
| DDL + RLS zero policies | **PASS** | Migration + test. |
| XSS — no `dangerouslySetInnerHTML` | **PASS** | Reason/audit as React text (`OperatorQaPanel` / `QaOverrideDialog`); no HTML sink in override UI. |

---

### Convention Compliance

| Rule | Status | Notes |
|------|--------|-------|
| EN/ES copy | **PASS** | `messages/en.json` + `messages/es.json` `scripts.qa.override.*` (action, dialog, errors, audit). Page passes `t.scripts.qa`. |
| Server Components default / `"use client"` justified | **PASS** | Dialog + panel interactive Client Components; orchestration `server-only`. |
| PrimeReact-first | **PASS** | Dialog, InputTextarea, Button, Message, Tag. |
| Loading / empty / error / pending | **PASS** | Panel empty/loading; audit empty; dialog pending; error banner + mapped codes. |
| Auth via `getCurrentUser` / `requireOperator` | **PASS** | Hardcoded local Operator sanctioned until auth stories. |
| Endpoint has concrete FE consumer | **PASS** | `/operator/scripts` → `OperatorQaPanel` / `QaOverrideDialog`. |
| `neuramark_` DB prefix | **PASS** | `neuramark_qa_overrides`. |
| No browser Supabase | **PASS** | Persist/rate-limit server-only. |

**Depends on US-10.1:** Satisfied (catalog, reports, panel, gate helper base) — CLOSED upstream.

---

### Gaps (what blocks PASS)

None that block Phase A PASS. Soft notes only:

1. **Cliente Aprobación UI** does not render override audit yet — **by design** (US-11.1 Phase B). Do not treat as US-10.2 FAIL.
2. **`qa-reports.test.ts`** still documents Phase A “ready iff passed” for the legacy pure helper; live gate path uses `computeQaGateReady` (asserted in override suite). Not a functional gap.
3. Story folder `README.md` gates line still mentions FE signoff “pending” in places — stale docs vs CONTRACT “Reviewed by FE: yes”; not a code blocker.

---

### Scope Creep

None material. No Cliente override, no catalog CRUD, no QA re-run/LLM changes, no `neuramark_approvals` writes, no UPDATE/DELETE override endpoints, no new Operator route (panel extend only). Optional Operator “Ready for approval” badge is CONTRACT-allowed informational UX.

---

### Test results

| Suite | Result |
|-------|--------|
| `npx tsx --test lib/qa/qa-override.test.ts` | **22/22 pass** (6 suites) |
| `npx tsx --test lib/qa/qa-reports.test.ts lib/qa/check-catalog.test.ts` | **21/21 pass** (related gate/catalog) |
| Failures | **0** |

Primary coverage maps to CONTRACT security tests 1–15 (Cliente 403, blocking 403, IDOR 404, empty reason, forbidden fields, non-fail, status unchanged, gate coverage / uncovered / blocked, append-only, rate limit, RLS, catalog import, requireOperator ordering).

---

### Recommended Next Actions

| Who | Action |
|-----|--------|
| **product-owner** | On PASS: check off US-10.2 AC in `USER_STORIES.md` (including approval-screen AC with Phase A DTO note); advance sprint to QA → CLOSE. |
| **qa-engineer** | Manual Operator flow: fail overridable → override with reason → audit grows; attempt blocking → locked + server 403; confirm week load shows `overrides[]`. |
| **US-11.1 implementers** | Consume `getQaGateStatusForAssembledReel` + `overrides[]` for Cliente Aprobación render + gate re-check; soft DEPENDS on US-10.2. |

**QA blockers for CLOSE:** None from VALIDATION. Soft: Cliente visual confirmation of overrides waits on US-11.1 (not a US-10.2 Phase A blocker).
