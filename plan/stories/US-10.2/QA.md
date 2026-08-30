# QA Report — US-10.2 Operator override with reason

**Branch:** `feature/US-10.2-qa-override`  
**BUILD commits reviewed:** BE `a9cc533` · FE `0c6bfb0`  
**Validation:** PASS WITH NOTES — `plan/stories/US-10.2/VALIDATION.md` @ `d7e3cd5` (22/22)  
**CONTRACT:** `plan/stories/US-10.2/CONTRACT.md` (frozen, FE-reviewed)  
**SECURITY:** `plan/stories/US-10.2/SECURITY.md` (APPROVE WITH CONDITIONS)  
**Reviewer:** qa-engineer  
**Date:** 2026-08-30

### Verdict: APPROVE WITH CONDITIONS

Phase A ships Operator-only per-check override: append-only `neuramark_qa_overrides`, pointer-only `{ qaReportId, checkKey, reason }`, catalog **403** on `blocking` even for Operator, report `status`/`checks` immutable under override, and DB-only gate readiness via `passed` **or** full overridable coverage on `failed`. No override-all, no Cliente override path, no report rewrite to `passed`. No Critical, High, or Medium findings.

**Close recommendation (Phase A): YES** — close US-10.2 Phase A. Soft Low follow-ups below are not merge blockers. Cliente Aprobación **render** of override audit remains **US-11.1** (DTO / gate handoff shipped here — not a FAIL).

---

## Focus control verification

| Focus control | Status | Evidence |
|---------------|--------|----------|
| **`requireOperator`** | **PASS** | `requireOperator("handler")` is first await in Server Action (`lib/qa/actions/override-qa-check.ts:26–27`); failure → 401/403, orchestrator never called (test “Cliente session → FORBIDDEN without INSERT”). Ordering asserted by source test. |
| **Blocking → 403** | **PASS** | Orchestrator imports `isBlockingCheckKey` from `lib/qa/check-catalog.ts`; returns `CHECK_BLOCKING` before INSERT (`override-qa-check.ts:80–82`). Blocking set: `own_avatar_consent`, `generic_avatar_not_owner`. Test: “blocking checkKey → CHECK_BLOCKING, no INSERT”. FE: no Override CTA on blocking fails; locked copy (`OperatorQaPanel.tsx:465–466, 523–532`) — UI non-authoritative. |
| **Append-only** | **PASS** | Migration INSERT-only DDL + RLS zero policies (`20260831020000_neuramark_qa_overrides.sql`). Persist exposes `insertQaOverride` only — no UPDATE/DELETE (`persist-qa-override.ts:76–116`). Closed-write test greps orchestrator/action + `app/**/route.ts` for override writers. Actor `operator_client_id` from session after `requireOperator`. |
| **No override-all** | **PASS** | Zod `.strict()` `{ qaReportId, checkKey, reason }` only (`lib/contracts/qa-override.ts:67–81`). `FORBIDDEN_QA_OVERRIDE_AUTHORITY_KEYS` + `findForbiddenQaOverrideKeys` reject `overrideAll`, `passed`, `status`, `severity`, `clientId`, etc. Test: “smuggled overrideAll → FORBIDDEN_FIELDS”. FE has no override-all control. |
| **Report status immutable** | **PASS** | Orchestrator INSERTs ledger only; returns `status: report.status` unchanged (`override-qa-check.ts:129–138`). No UPDATE of `neuramark_qa_reports` on this path. Test: “successful override keeps report status failed”. |
| **Gate purity** | **PASS** | `getQaGateStatusForAssembledReel` — `import "server-only"`; single `assembledReelId` arg; loads assembly + report + overrides from DB; `ready` via `computeQaGateReady` (not Phase A-only). `blocked` / pending / running / missing → not ready. Source test: no `isQaReportReadyPhaseA`. Pure helper tests: full coverage ready; uncovered not ready; blocked never ready; passed ready. |
| **Tenancy** | **PASS** | Report load `loadQaReportById({ qaReportId, clientId })` scoped by server `client_id` → miss → `NOT_FOUND` (`persist-qa-report.ts:130–151`; `override-qa-check.ts:75–78`). INSERT denormalizes `client_id` + `assembled_reel_id` from owned report. Batch overrides `.eq("client_id", params.clientId)`. Gate scopes via `getCurrentUser().id` + `loadAssemblyJobScoped`. Test: “foreign qaReportId → NOT_FOUND”. |

---

## Findings

### Low

| # | Severity | Location | Issue | Why it matters | Recommended fix |
|---|----------|----------|-------|----------------|-----------------|
| 1 | **Low** | `lib/qa/check-qa-override-rate-limit.ts:44–49` | Rate-limit window read errors fail **open** (`return { ok: true }`). Matches house `qa_run` pattern. | Transient DB errors briefly waive the soft cap; Operator-only, no LLM. | Accept as house consistency, or fail closed later as a shared rate-limit hardening story. |
| 2 | **Low** | `lib/qa/override-qa-check.ts:70–106` | `recordQaOverrideAttempt` runs only after successful INSERT — rejected attempts (blocking, NOT_FOUND, validation) do not increment the window. | A malicious Operator can spam rejected requests without hitting `RATE_LIMITED`; blast radius is Operator session + read/validation cost. | Optionally count attempts before INSERT (P2); not a CONTRACT veto. |
| 3 | **Low** | Gate helper vs CONTRACT security matrix | Live `getQaGateStatusForAssembledReel` coverage is source-grep + pure `computeQaGateReady` unit tests — no mocked DB integration for ready-via-overrides / blocked-with-ledger. | Regressions in wiring (forgot to load overrides) could slip past pure-helper tests. | Add mocked gate-helper integration cases (P1 backlog; same class as US-10.1 Finding 1). |

### Informational (non-blocking)

| Topic | Status | Notes |
|-------|--------|-------|
| Cliente approval-screen render | **Deferred by design** | AC satisfied for US-10.2 via `overrides[]` + gate key lists; Cliente UI = **US-11.1**. |
| Operator informational gate badge | **OK** | `deriveGateReadyFromReport` uses pure `computeQaGateReady` on DTO — never calls server gate from browser (CONTRACT). Authority remains DB helper for US-11.1. |
| Hardcoded local Operator | **Sanctioned** | `getCurrentUser()` interim per AGENTS.md — not a finding. |
| Story `README.md` gates stale | **Docs only** | Still shows FE signoff “pending” / BUILD unchecked vs CONTRACT + BUILD done — not a code blocker. |
| XSS on reason / audit | **PASS** | React text nodes + PrimeReact; no `dangerouslySetInnerHTML` in override UI. |
| `npx tsc --noEmit` | **Pre-existing noise** | Unrelated `*.test.ts` path-extension errors; US-10.2 production modules clean under eslint + tsx tests. |

---

## Security control verification (broader)

| Control | Status | Evidence |
|---------|--------|----------|
| Pointer-only + forbidden authority keys | **PASS** | `find-forbidden-qa-override-keys.ts` + schema + tests |
| Catalog authority (no fork) | **PASS** | Orchestrator + gate import `check-catalog`; test asserts no forked map |
| Fail + overridable target only | **PASS** | `CHECK_NOT_FAILED` for pass/skipped/missing (`override-qa-check.ts:84–91`) |
| Reason trim 1–500 | **PASS** | House `OVERRIDE_REASON_*` + Zod + FE submit gate |
| Rate limit `qa_override` | **PASS (code)** | Constants + `check-qa-override-rate-limit.ts`; test RATE_LIMITED |
| DDL + RLS zero policies + `neuramark_` | **PASS** | Migration + test |
| No Cliente override action / UI | **PASS** | Operator Server Action only; grep `app/` — no override Route Handler |
| No browser Supabase on override surfaces | **PASS** | Client Components → Server Action + contracts only |
| Batch `overrides[]` on week load | **PASS** | `getQaReportsForAssembledReels` attaches DTOs |
| Success merge keeps status | **PASS** | `ScriptsPageView.handleQaOverrideSuccess` merges `result.report` |

---

## Checks run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/qa/qa-override.test.ts` | **22 pass / 0 fail** (6 suites) |
| `npx tsx --test lib/qa/qa-reports.test.ts lib/qa/check-catalog.test.ts` | **21 pass / 0 fail** (related gate/catalog) |
| `npx eslint` on US-10.2 BE/FE override modules + `OperatorQaPanel` / `QaOverrideDialog` / `qa-override` contracts | **Pass** (`--max-warnings 0`) |
| `npx tsc --noEmit` | **Pre-existing / unrelated test-file noise** — no US-10.2 production-module blockers |
| Manual Operator E2E (fail overridable → override → audit; blocking locked + 403) | **Not run** — unit + code review only |

---

## What was not covered

- Manual Operator flow on `/operator/scripts`: fail overridable → Override dialog → audit grows; blocking row locked + server 403.
- Live Supabase INSERT + RLS deny for anon/authenticated against `neuramark_qa_overrides`.
- Mocked integration test of `getQaGateStatusForAssembledReel` with override ledger rows (Finding 3).
- Concurrent double-override races (append-only allows duplicates; gate treats any row as coverage — by design).
- US-11.1 consumption of gate + Cliente audit render (downstream story).

---

## Finding counts

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 3 |

---

## Recommended next actions

1. **product-owner** — On APPROVE WITH CONDITIONS + VALIDATION PASS WITH NOTES, check off USER_STORIES § US-10.2 AC (approval-screen AC with Phase A DTO note); **CLOSE** story; advance sprint.
2. **nextjs-backend** (optional P1) — Gate-helper mocked integration tests (Finding 3).
3. **US-11.1 implementers** — Re-check `getQaGateStatusForAssembledReel` on package create + decision; render `overrides[]` on Cliente Aprobación; soft DEPENDS on US-10.2.
4. **Do not** add Cliente override, override-all, report status rewrite, or UPDATE/DELETE override endpoints under later stories without new SECURITY.
