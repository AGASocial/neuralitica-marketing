# QA Report — US-4.2 Review and adjust strategy before scripting

**Story:** US-4.2  
**Branch:** `feature/US-4.2-strategy-approve`  
**Commits reviewed:** `ba57bac` (BE), `4367287` (FE), `dd7eff5` (VALIDATION)  
**Date:** 2026-08-30  
**Reviewer:** qa-engineer  
**Sources:** `plan/USER_STORIES.md` § US-4.2, `plan/stories/US-4.2/{SECURITY,CONTRACT,VALIDATION,TASKS}.md`, implemented code, automated tests

### Verdict: APPROVE WITH NOTES

**Severity counts:** Critical **0** · High **0** · Medium **0** · Low **3**

**CLOSE recommended:** **yes** — `SECURITY.md` floors for operator gate, state machine, IDOR scoping, editable allowlist, and approved immutability are implemented and tested; 74/74 story tests pass; findings are test-coverage / hardening notes only, not merge blockers.

---

## Findings

### Low

#### L1 — No automated test that update/approve logs exclude brief bodies

**Files:** `lib/content-strategy/actions/update-content-strategy-brief.ts:121-125`, `lib/content-strategy/actions/approve-content-strategy.ts:116-120`; CONTRACT unit test matrix #30

**What:** Production logging correctly emits only `{ strategyId, clientId, action }`. No unit test asserts this invariant on save/approve paths (US-4.1 generate path has the same gap — L1 in US-4.1 QA).

**Why it matters:** Regression risk if a future debug log adds merged `brief` or editable patch to `console.*`.

**Fix direction:** Add logger-mock tests on `updateContentStrategyBrief` and `approveContentStrategy` success and failure paths.

---

#### L2 — Approve action IDOR / `weekStart` mismatch not covered by automated tests

**Files:** `lib/content-strategy/actions/approve-content-strategy.ts:74-77`; `lib/content-strategy/content-strategy.test.ts` (update action has foreign-id and week-mismatch cases; approve suite does not)

**What:** `approveContentStrategy` uses the same `loadStrategyRowForOperator` + `weekStart` guard as update. Implementation is correct; only test matrix gap.

**Why it matters:** Approve is the higher-privilege transition (`draft` → `approved`). Missing tests increase regression risk on refactors.

**Fix direction:** Mirror update tests: foreign `strategyId` → `NOT_FOUND`; `weekStart` mismatch → `NOT_FOUND`; assert no UPDATE payload.

---

#### L3 — Optional DB CHECK for approval audit columns still deferred

**Files:** `supabase/migrations/20260830200000_neuramark_content_strategies_approval.sql`; `plan/stories/US-4.2/TASKS.md` DB checklist

**What:** `approved_by` / `approved_at` are nullable with app-layer enforcement only. A manual SQL corruption or partial failure could yield `status = 'approved'` without audit columns; `toContentStrategyView` would omit approval caption (`to-strategy-view.ts:29-36`) but row would still block edits via `STRATEGY_NOT_DRAFT`.

**Why it matters:** Audit integrity under direct DB access or future bugs; limited blast radius because brief mutation remains server-gated.

**Fix direction:** Optional `CHECK (status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))` in a follow-up migration when PO accepts schema hardening.

---

## Security focus checklist

| Control | Status | Evidence |
|---------|--------|----------|
| `requireOperator("handler")` first on update + approve + extended read | **PASS** | `update-content-strategy-brief.ts:50-58`, `approve-content-strategy.ts:50-58`, `get-latest-content-strategy.ts:40-48` |
| Client cannot set `status` / audit columns | **PASS** | `find-forbidden-keys.ts:9-16`; `.strict()` input schemas; smuggled `status` / `approved_by` → `FORBIDDEN_FIELDS` (tests) |
| State machine: brief edit on `draft` only; `draft` → `approved` only via approve | **PASS** | `update-strategy-brief.ts:30-34` (`eq status draft`); `approve-strategy-row.ts:26-34`; pre-checks in actions; double-approve → `INVALID_STATE_TRANSITION` / `STRATEGY_NOT_DRAFT` (tests) |
| `approved_by` / `approved_at` server-authoritative | **PASS** | Set only in `approve-strategy-row.ts:27-30` from `operator.id` + server `now()`; never read from request |
| IDOR-safe row access | **PASS** | `load-strategy-row-for-operator.ts:28-29` (`id` + `client_id`); `weekStart` mismatch → `NOT_FOUND`; foreign `strategyId` on update → `NOT_FOUND` (test) |
| Editable allowlist enforced server-side | **PASS** | Partial `editable` schema (`content-strategy.ts:108-135`); `merge-editable-brief-fields.ts` preserves locked fields; top-level `brief` forbidden; `tema` in editable rejected (tests) |
| Full merged brief: Zod `.strict()` + allowlists before UPDATE | **PASS** | `update-content-strategy-brief.ts:97-109`; allowlist violation → `AGENT_OUTPUT_INVALID` (test) |
| Approved rows immutable | **PASS** | Save on `approved` → `STRATEGY_NOT_DRAFT` (test); UPDATE guarded by `status = 'draft'` |
| Lock-after-scripts floor (stub) | **PASS** (stub) | `strategy-has-scripts.ts:7-9` returns `false` until US-5.1; lock path tested with mock; `NEURAMARK_STRATEGY_LOCK_AFTER_SCRIPTS` default on |
| No public PATCH Route Handler | **PASS** | No `/api/content-strateg*` routes; Server Actions only |
| No Supabase in Client Components | **PASS** | `components/strategy/*` imports actions/types only; grep clean |
| RLS deny-by-default unchanged | **PASS** | US-4.1 migration posture test still passes; approval migration adds columns only |
| FE does not send client `status` | **PASS** | `StrategyPageView.tsx:300-338` sends `{ strategyId, weekStart, editable }` / `{ strategyId, weekStart }` only; approve disabled while dirty (`:327`) |

**Residual (accepted per CONTRACT):** `strategyHasScripts` enforcement is stubbed until US-5.1; script-batch `approved` re-check is US-5.1 `[SEC]` obligation. System/cron auto-approve path deferred to integrations-engineer.

---

## Checks run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/contracts/content-strategy.test.ts lib/content-strategy/content-strategy.test.ts` | **74/74 pass** (~198ms) |
| `npm run lint` | **Exit 0** with pre-existing warnings/errors in unrelated test files (`providers.test.ts`, `trend.test.ts`, etc.); no new lint issues in US-4.2 strategy modules |
| `npx tsc --noEmit` | **Errors in unrelated test files** (`.ts` extension imports, etc.); US-4.2 implementation files compile under Next build type-check phase |
| `npm run build` | **Failed** — `AUTH_DEV_FALLBACK must not be set when NODE_ENV=production` (local `.env` dev fallback; not introduced by US-4.2; same as US-4.1 QA) |

---

## What was not covered

- Live smoke on `/operator/strategy` with configured Supabase (save → approve → read approval caption E2E).
- Production deploy verification that `AUTH_DEV_FALLBACK` is unset.
- Approve-action IDOR / week-mismatch runtime tests (L2 — code reviewed, update-path tests cover same helper).
- Logger regression tests (L1).
- CONTRACT matrix #29 (regenerate-after-approve preserves prior approved row) — US-4.1 regenerate semantics unchanged; not re-tested in US-4.2 suite.
- Penetration test of crafted `editable` payloads beyond schema/allowlist bounds (server merge + validation reviewed statically).
- US-5.1 script job rejection when strategy is not `approved` (downstream story).

---

## Recommended actions before / after CLOSE

| Priority | Action | Owner |
|----------|--------|-------|
| Optional | Add approve IDOR / week-mismatch tests (L2) | nextjs-backend |
| Optional | Add logger mock tests for update/approve (L1) | nextjs-backend |
| Optional | DB CHECK for audit columns when `status = 'approved'` (L3) | nextjs-backend |
| Post-CLOSE | US-5.1: wire `strategyHasScripts` + verify `approved` before script batch | content-agents-engineer / nextjs-backend |
| CLOSE | PO checks AC boxes in `USER_STORIES.md` § US-4.2 | product-owner |
