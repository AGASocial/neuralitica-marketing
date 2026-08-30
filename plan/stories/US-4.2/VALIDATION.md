# Validation Report — US-4.2

**Story:** US-4.2 — Review and adjust strategy before scripting  
**Branch:** `feature/US-4.2-strategy-approve`  
**Builds:** BE `ba57bac` · FE `4367287`  
**Date:** 2026-08-30  
**Validator:** requirements-validator  
**Sources:** `plan/USER_STORIES.md` § US-4.2, `plan/stories/US-4.2/CONTRACT.md`, `plan/stories/US-4.2/SECURITY.md`, `plan/stories/US-4.2/TASKS.md`, implemented code, automated tests

### Verdict: PASS WITH NOTES

**Blockers:** 0  
**Tests:** 74/74 pass (`npx tsx --test lib/contracts/content-strategy.test.ts lib/content-strategy/content-strategy.test.ts`)

---

## Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Edits saved and used as input to Video Script Agent | **PASS** (handoff) | `updateContentStrategyBrief` UPDATEs `brief` on existing `draft` row, same `version` (`lib/content-strategy/actions/update-content-strategy-brief.ts:111–115`, `update-strategy-brief.ts:24–34`). Partial editable patch merged server-side (`merge-editable-brief-fields.ts`, FE `buildEditablePatch` in `components/strategy/strategy-brief-edit.ts:6–18`). `getApprovedStrategyForWeek` returns latest approved row for downstream script agent (`lib/content-strategy/load-approved-strategy-for-week.ts:32–56`). **Note:** Script agent consumption is US-5.1; US-4.2 establishes persisted brief + approved lookup. |
| Approved strategy required before batch script generation | **PASS** (infra) | `approveContentStrategy` is the only path to `status = 'approved'` (`approve-strategy-row.ts:24–35` with `WHERE status = 'draft'`). `getApprovedStrategyForWeek` is the frozen US-5.1 gate helper. **Note:** Runtime rejection of script batch on non-approved strategy is US-5.1 `[SEC]` — not implemented in this story (per CONTRACT dual-path table). |
| Shows who approved and when (hardcoded user OK in local dev) | **PASS** | Approve success returns `approvedBy: { id, displayName }` + `approvedAt` (`approve-content-strategy.ts:130–134`). Extended read maps DB columns via `toContentStrategyView` + `loadClientDisplayName` (`to-strategy-view.ts:29–36`). FE renders localized caption `{name}` / `{date}` (`StrategyPageView.tsx:244–251`, `468–472`; `messages/en.json:745`, `messages/es.json:745`). Test asserts `displayName: "Gabriel Vega"`. |
| Operator-only: endpoint/action rejects non-operator sessions server-side (403) | **PASS** | Both mutations call `requireOperator("handler")` as first await (`update-content-strategy-brief.ts:50–58`, `approve-content-strategy.ts:50–58`). Extended read gated similarly (`get-latest-content-strategy.ts:40–48`). Page under `app/(app)/operator/` with layout gate. Tests: non-operator → `FORBIDDEN`, no UPDATE. |
| [SEC] Status transitions (`draft` → `approved`) enforced server-side as a state machine; client cannot set arbitrary status; script generation endpoints verify `approved` themselves | **PASS** (partial downstream) | Forbidden keys include `status`, `approved_by`, `approved_at` (`find-forbidden-keys.ts:9–16`). Dedicated `approveContentStrategy` — no combined edit+approve. Approve UPDATE sets status in SQL with `eq("status", "draft")` guard (`approve-strategy-row.ts:32–34`). Smuggled `status` / `approved_by` → `FORBIDDEN_FIELDS` (tests). Double approve → `INVALID_STATE_TRANSITION`. **Note:** Script-generation `approved` re-check is US-5.1 obligation per CONTRACT; helper `getApprovedStrategyForWeek` ships here. |

---

## Convention Compliance

| Check | Status | Evidence |
|-------|--------|----------|
| EN + ES user-facing strings | **PASS** | Save/approve CTAs, status badges, approval caption, new error codes in `messages/en.json:729–798` and `messages/es.json:729–798`. |
| Server Components by default; minimal `"use client"` | **PASS** | RSC page `app/(app)/operator/strategy/page.tsx`. Client islands: `StrategyPageView`, `StrategyBriefView` for edit/save/approve interactivity only. |
| PrimeReact-first UI | **PASS** | `Button`, `InputText`, `Tag`, `Message`, `Toast`, `Calendar`, `Dropdown`, `Skeleton`, `Card`. |
| Loading / empty / error / pending states | **PASS** | Generating skeleton + `aria-busy` (`StrategyPageView.tsx:515–569`); empty week `Message` (`533`); load error path (`360–373`); save/approve `loading` + disabled-while-dirty approve (`491–507`); error banner from server codes (`511–513`). |
| Auth via `getCurrentUser()` / `requireOperator()` | **PASS** | Tenancy `clientId = operator.id` server-resolved; no Supabase imports in `components/strategy/*`. |
| Backend endpoints map to concrete FE consumers | **PASS** | `updateContentStrategyBrief`, `approveContentStrategy`, extended `getLatestContentStrategy` consumed by `/operator/strategy`. No public Route Handlers for strategy PATCH. |
| `neuramark_` DB prefix + migration | **PASS** | `supabase/migrations/20260830200000_neuramark_content_strategies_approval.sql` adds `approved_by` FK RESTRICT + `approved_at`. |
| CONTRACT frozen shapes / error envelope | **PASS** | Editable patch schema, success envelopes, new error codes (`STRATEGY_NOT_DRAFT`, `INVALID_STATE_TRANSITION`, `STRATEGY_LOCKED`) in `lib/contracts/content-strategy.ts`. `revalidatePath("/operator/strategy")` on save/approve. |

---

## Security Acceptance Criteria (SECURITY.md)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| `requireOperator("handler")` first on edit + approve | **PASS** | Both actions; tests confirm 403 before UPDATE. |
| Client schemas exclude authoritative fields | **PASS** | `findForbiddenContentStrategyKeys` + `.strict()` input schemas. |
| State machine: draft edit only; draft→approved via approve only; approved immutable | **PASS** | `updateStrategyBrief` / `approveStrategyRow` both guard `status = 'draft'`. Save on approved → `STRATEGY_NOT_DRAFT`. |
| Audit columns server-authoritative | **PASS** | `approved_by = operator.id`, `approved_at = now()` in approve handler only. |
| Brief validation on edit (Zod strict + allowlists) | **PASS** | Full merged brief validated before UPDATE (`update-content-strategy-brief.ts:97–109`). |
| IDOR-safe row access | **PASS** | `loadStrategyRowForOperator` filters `id` + `client_id`; foreign id / week mismatch → `NOT_FOUND`. |
| Lock-after-scripts floor (stub) | **PASS** | `strategyHasScripts` returns `false` until US-5.1; lock path tested with mock. |
| No public PATCH Route Handler | **PASS** | No `content-strateg*` Route Handlers in repo. |
| Logging: ids + codes only | **PASS** (untested) | `console.info` logs `{ strategyId, clientId, action }` only (`update-content-strategy-brief.ts:121–125`, `approve-content-strategy.ts:116–120`). **Note:** CONTRACT matrix #30 (logger mock assert) not automated. |

---

## Dependency Stories

| Dependency | Status | Notes |
|------------|--------|-------|
| US-4.1 Content Strategy agent | **Satisfied** | CLOSED; generate/regenerate INSERT-only unchanged; brief schema + allowlists reused. |
| US-14.5 `requireOperator` | **Satisfied** | Handler + page gates on strategy surfaces. |

---

## Test Results

```
npx tsx --test lib/contracts/content-strategy.test.ts \
  lib/content-strategy/content-strategy.test.ts

ℹ tests 74
ℹ pass 74
ℹ fail 0
ℹ duration_ms ~192
```

US-4.2-specific suites (30 tests): editable schema (4), merge (3), update action (9), approve action (5), extended read (2), helpers (6), migration posture (1).

**Gaps vs CONTRACT unit test matrix:**

| # | Test | Status |
|---|------|--------|
| 29 | Regenerate after approve — new draft v3; v2 approved unchanged | **Missing** — US-4.1 regenerate path not re-tested in US-4.2 suite (behavior unchanged from US-4.1). |
| 30 | No full brief in prod logs on update | **Missing** — implementation compliant; no logger mock test. |

---

## Gaps (what blocks PASS)

None. All USER_STORIES acceptance criteria satisfied within frozen US-4.2 CONTRACT scope.

---

## Scope Creep

| Item | Assessment |
|------|------------|
| Refactored loaders (`map-strategy-row`, `to-strategy-view`, `load-latest-strategy-row-with-approval`) | **Acceptable** — supports extended read DTO without changing US-4.1 generate semantics. |
| Cliente read-only brief UI | **Correctly deferred** — US-4.3 per CONTRACT. |
| System/cron auto-approve | **Correctly deferred** — integrations-engineer / ADR-0001. |
| `neuramark_reel_scripts` table or script jobs | **Correctly out of scope** — US-5.1. |
| Public REST PATCH for strategies | **Not added** — correct per CONTRACT veto list. |

---

## Notes (non-blocking)

1. **Script-generation gate:** AC wording spans US-4.2 + US-5.1; US-4.2 ships approve action + `getApprovedStrategyForWeek`; batch rejection at script job creation lands in US-5.1.
2. **Optional DB CHECK** (`status = 'approved'` ⇒ audit columns NOT NULL) deferred per TASKS.md — app-layer + tests enforce invariant.
3. **`strategyHasScripts` stub:** Always `false` until US-5.1 table; lock wiring tested via mock.
4. **Approve disabled while dirty:** FE enforces PO lean — Operator must save before approve (`StrategyPageView.tsx:327`, `505`).
5. **TASKS.md gate checkboxes:** BUILD/VALIDATION gates in `TASKS.md` still show pending — update at QA/CLOSE.

---

## Recommended Next Actions

| Action | Owner |
|--------|-------|
| Proceed to **QA** gate (operator edit/save/approve smoke on `/operator/strategy` with live Supabase) | **qa-engineer** |
| PO checks AC boxes in `USER_STORIES.md` at story CLOSE | **product-owner** |
| Optional: add CONTRACT matrix tests #29 (regenerate-after-approve) and #30 (logger mock) | **nextjs-backend** |
| US-5.1: consume `getApprovedStrategyForWeek` + verify `approved` before script batch | **content-agents-engineer** / **nextjs-backend** |
