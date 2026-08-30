# QA Report — US-10.1 Phase A (Automated QA)

**Branch:** `feature/US-10.1-automated-qa`  
**BUILD commits reviewed:** agents `0b56c9e` + fix `75802d6` · BE `5e50115` · FE `b5e0941`  
**Validation:** PASS WITH NOTES — `plan/stories/US-10.1/VALIDATION.md` @ `d95555d` (42/42 tests)  
**CONTRACT:** `plan/stories/US-10.1/CONTRACT.md` (frozen, FE-reviewed)  
**SECURITY:** `plan/stories/US-10.1/SECURITY.md` (APPROVE WITH CONDITIONS)  
**Reviewer:** qa-engineer  
**Date:** 2026-08-30  

### Verdict: APPROVE WITH CONDITIONS

Phase A ships server-owned Veredicto QA: pointer-only Operator run, code-only check catalog + severity, hybrid deterministic + LLM merge, fail-closed UPSERT on `neuramark_qa_reports`, Operator panel (display only), and a DB-only gate helper with `ready === true` iff `status === 'passed'`. No client-supplied `passed` / status / checks authority. No override UI or `neuramark_qa_overrides` (US-10.2). No Critical or High findings.

**Close recommendation (Phase A): YES** — close US-10.1 Phase A. Soft follow-ups (missing SECURITY automated cases, EN title wording) are not merge blockers. Do **not** ship override under 10.1 — that is **US-10.2**.

---

## Focus control verification

| Focus control | Status | Evidence |
|---------------|--------|----------|
| **No client-passed flag** | **PASS** | Action scans `findForbiddenQaRunKeys` then Zod `.strict()` `{ assembledReelId }` only (`lib/qa/actions/run-qa-for-assembled-reel.ts:41–55`; `FORBIDDEN_QA_RUN_AUTHORITY_KEYS` in `lib/contracts/qa-report.ts:120–160`). Panel calls `runQaForAssembledReel({ assembledReelId })` only (`OperatorQaPanel.tsx:249`). Status derived via `deriveQaReportStatus` — never from request (`qa-report.ts:287–303`). Tests: smuggle → `FORBIDDEN_FIELDS`; Cliente → `FORBIDDEN` without orchestration. |
| **Catalog severity server-only** | **PASS** | Immutable map in `lib/qa/check-catalog.ts` + contracts. Blocking: `own_avatar_consent`, `generic_avatar_not_owner`. Merge overwrites LLM severity; unknown keys drop + log (`merge-qa-checks.ts:44–78`). US-3.4 import via `run-generic-avatar-qa.ts` (no fork). No catalog CRUD / endpoint / DB table. |
| **Operator gate** | **PASS** | `requireOperator("handler")` is first await on manual path (`actions/run-qa-for-assembled-reel.ts:29–38`); failure → 401/403, no LLM, no write. Auto-chain uses trusted `invokedBy: "system"` from branding writer only (`on-branding-completed.ts:15–19`; hook `apply-branding-job-update.ts:138–145`) — not a browser endpoint. |
| **Tenancy** | **PASS (code)** | Assembly load `loadAssemblyJobScoped({ jobId, clientId })` → miss → `NOT_FOUND` (`run-qa-for-assembled-reel.ts:92–98`). Report SELECT/UPSERT scoped by `client_id` (`persist-qa-report.ts:113–118`, `141–152`). Batch attach filters `.eq("client_id", params.clientId)` (`get-qa-reports-for-assembled-reels.ts:34–38`). Gate helper scopes via `getCurrentUser().id` (`get-qa-gate-status-for-assembled-reel.ts:42–58`). **No automated foreign-UUID → 404 test** (Finding 1). |
| **Budget before LLM** | **PASS** | `assertReelBudgetAllowsEstimatedSpend` runs after local `estimateCost` (no network) and **before** `runReelQaAgent` (`run-qa-for-assembled-reel.ts:227–266`). On block: `persistNonPass` (never `passed`) + `BUDGET_EXCEEDED` / `COST_POLICY_UNAVAILABLE`; no LLM. Spend via `finalizeGenerationCost` only after successful LLM (`301–315`). Client cannot send estimate/`skipBudgetCheck` (forbidden keys). **No automated budget-block test** (Finding 1). |
| **Gate helper DB-only** | **PASS** | `getQaGateStatusForAssembledReel(assembledReelId)` — `import "server-only"`; single string arg; loads report from DB; `ready: isQaReportReadyPhaseA(report.status)` (`get-qa-gate-status-for-assembled-reel.ts:1–70`). Does not accept `passed` / `ready` / override flags. Phase A: ready iff `passed`. Pure helper covered by `isQaReportReadyPhaseA` unit tests. |

---

## Findings

### Low

| # | Severity | Location | Issue | Why it matters | Recommended fix |
|---|----------|----------|-------|----------------|-----------------|
| 1 | **Low** | Test suite vs CONTRACT § Security tests (minimum) | Automated coverage incomplete for: foreign `assembledReelId` → 404; branding/caption reject → no `passed`; budget block → no LLM / no `passed`; rate limit 6th run → `RATE_LIMITED`; gate helper integration beyond pure `ready iff passed`. Code paths enforce controls (orchestrator + persist + rate-limit modules). Cliente 403, forbidden fields, derivation, catalog severity, RLS grep, auto-chain hook are covered. | High-impact IDOR/budget regressions could ship undetected. VALIDATION already noted. | Add mocked orchestrator tests per CONTRACT security matrix (P1 backlog; same class as US-9.2 Finding 3). |
| 2 | **Low** | `messages/en.json` ~1298 `scripts.qa.title` | EN copy `"QA verdict"` vs CONTEXT preference for **Veredicto QA** / avoid “QA verdict” as product noun. ES correctly uses `"Veredicto QA"`. Operator-only surface. | Soft terminology drift; not a trust-boundary issue. | Rename EN title to `"QA"` or `"Veredicto QA"` equivalent. |
| 3 | **Low** | `lib/qa/qa-reports.test.ts:186,226` | ESLint `@typescript-eslint/no-require-imports` on dynamic `require()` used for Server Action mock injection. | Lint noise in US-10.1 test slice; established tsx mock pattern elsewhere. No runtime/security impact. | Accept as test-pattern debt or switch to dynamic `import()` with cache busting. |

### Informational (non-blocking)

| Topic | Status | Notes |
|-------|--------|-------|
| US-10.2 override | **Deferred by design** | No override modal, mutation, or `neuramark_qa_overrides`. Failed overridable → `failed` (gate not ready); blocking → `blocked` with no Operator escape until content/consent fix + re-run. |
| Vision / weekly cron | **Absent** | Correct Phase A scope. |
| Local `qaOverrides` React state in `ScriptsPageView` | **OK** | Optimistic UI merge of server success DTO — not US-10.2 `qa_overrides` authority. Gate helper still reads DB. |
| Hardcoded local operator | **Sanctioned** | `getCurrentUser()` interim per AGENTS.md — not a finding. |
| Gate helper caller context | **Phase A OK** | Uses `getCurrentUser()` only; US-11.1 must call in correct server session (or extend with server-supplied `clientId` later). |
| `npx tsc --noEmit` | **Pre-existing / test-file noise** | US-10.1 production modules clean under tsx tests; `.ts` extension imports and `@ts-expect-error` noise in `*.test.ts` only. |
| Closed write surface grep test | **Weak but code-reviewed** | Test asserts orchestrator paths; manual `app/` grep confirms zero QA Route Handlers. |

---

## Security control verification (broader)

| Control | Status | Evidence |
|---------|--------|----------|
| Pointer-only + forbidden authority keys | **PASS** | `find-forbidden-qa-run-keys.ts`; action + tests |
| Prerequisites: assembly + branding completed | **PASS (code)** | Orchestrator → `ASSEMBLY_NOT_READY` / `BRANDING_REQUIRED` |
| Caption hard reject | **PASS (code)** | → `CAPTION_REQUIRED` before UPSERT running |
| Fail-closed re-run (`running` clears prior `passed`) | **PASS** | `upsertQaReportRunning` then terminal (`persist-qa-report.ts:127–165`) |
| Status derivation: blocking → `blocked`; overridable → `failed`; else `passed` | **PASS** | `deriveQaReportStatus` + tests |
| LLM Zod `.strict()`; invalid → never `passed` | **PASS** | `qaLlmAgentOutputSchema`; `persistNonPass` forces non-pass |
| Deterministic legal always run | **PASS** | Consent + generic-avatar + CTA before LLM; LLM fail still persists deterministic |
| Rate limit `qa_run` | **PASS (code)** | `check-qa-run-rate-limit.ts`; constants in contracts |
| Provider `assetRole: 'llm'`, `llmVariant: 'default'` | **PASS** | Orchestrator `resolveProviderForJob` |
| Prompt injection delimiters | **PASS** | `UNTRUSTED_*` tags in `run-reel-qa.ts` |
| Operator DTO minimal; no XSS dump | **PASS** | Detail DTO checks only; panel React text / PrimeReact — no `dangerouslySetInnerHTML` |
| DDL + RLS zero policies + `neuramark_` prefix | **PASS** | `20260831010000_neuramark_qa_reports.sql` + migration test |
| No `@supabase/supabase-js` in Client Components (QA surfaces) | **PASS** | `OperatorQaPanel` / `ScriptsPageView` — Server Actions + contracts only |
| No QA status Route Handler | **PASS** | Grep `app/` — none |
| Auto-chain does not revert branding | **PASS** | `on-branding-completed.ts` — no branding status write |

---

## Checks run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/qa/*.test.ts lib/agents/content/run-reel-qa.test.ts` | **42 pass / 0 fail** (~323 ms, 11 suites) |
| `npx eslint lib/qa lib/agents/content/run-reel-qa.ts components/scripts/OperatorQaPanel.tsx --max-warnings 0` | **Fail** — unused import warning in `check-catalog.test.ts`; `no-require-imports` in `qa-reports.test.ts` (Finding 3) |
| `npx tsc --noEmit` | **Pre-existing / test-file noise** — no production-module blockers unique to US-10.1 BUILD |
| Manual Operator E2E (Run QA → badges → gate) | **Not run** — unit + code review only |
| Live LLM / budget against real catalog | **Not run** — stub adapter + mocked paths |

---

## What was not covered

- Manual Operator flow: branded Ensamblado → Run/Re-run QA → per-check badges → gate-not-ready banner.
- Live DeepSeek/SiliconFlow QA completion + spend ledger row.
- Automated IDOR 404, budget-block, rate-limit, branding/caption reject tests (Finding 1).
- Concurrent double-run race beyond in-flight idempotent short-circuit unit coverage.
- US-11.1 consumption of `getQaGateStatusForAssembledReel` (downstream story).
- US-10.2 blocking-override 403 path (explicitly out of scope).

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

1. **product-owner** — On APPROVE WITH CONDITIONS + VALIDATION PASS WITH NOTES, check off USER_STORIES § US-10.1 AC (Phase A interpretation); keep US-10.2 override AC open.
2. **nextjs-backend** (optional P1) — Add missing SECURITY automated cases (Finding 1).
3. **nextjs-frontend** (optional soft) — EN `scripts.qa.title` terminology (Finding 2).
4. **Do not** implement override / `neuramark_qa_overrides` under US-10.1 — proceed to **US-10.2** / **US-11.1** as separate stories.
