# Validation Report — US-10.1

**Story:** US-10.1 — Run automated QA on script, caption, and video  
**Phase:** A (server verdicts + Operator panel + gate helper; override = US-10.2)  
**Branch:** `feature/US-10.1-automated-qa`  
**Validated against:** `plan/USER_STORIES.md` § US-10.1 · `CONTRACT.md` · `SECURITY.md` · BUILD commits `0b56c9e` / `75802d6` / `5e50115` / `b5e0941`  
**Date:** 2026-08-30  
**Validator:** requirements-validator  
**Do not check off AC in USER_STORIES.md** (PO owns that on PASS).

### Verdict: PASS WITH NOTES

Phase A delivers CONTRACT surfaces, SECURITY floors, Operator QA panel, and a DB-only gate helper with `ready === true` iff `status === 'passed'`. US-10.2 override path is correctly **not** shipped. Unit suite **42/42 pass**. Soft notes only (terminology, incomplete automated coverage of some SECURITY minimum cases).

**Phase A binding notes (CONTRACT § Phased BUILD):**

- No vision / frame LLM.
- No weekly cron HTTP.
- Gate ready **iff** `passed`.
- AC phrase “or overridden” → **US-10.2** (deferred); do **not** claim override closed.

---

### Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Checks include generic-avatar-not-owner rule (US-3.4) | **PASS** | Catalog key `generic_avatar_not_owner` (`lib/contracts/qa-report.ts` 20–28, 34–37); deterministic runner imports US-3.4 evaluator (`lib/qa/run-deterministic-qa-checks.ts` 12–15, 48–54; `lib/qa/checks/generic-avatar-not-owner.ts` + `run-generic-avatar-qa.ts`). Severity always `blocking` via catalog / `QA_CHECK_SEVERITY`. |
| AI disclosure required when avatar or synthetic voice used | **PASS** | `isAiDisclosureRequired` — generic avatar / `mustDiscloseNotOwner` / TTS (`lib/agents/content/run-reel-qa.ts` 74–84). Orchestrator sets `usedTts` from `assembly.voiceoverAssetId` and `aiDisclosureSkipped` (`lib/qa/run-qa-for-assembled-reel.ts` 166–171). LLM evaluates `ai_disclosure` when required; server may skip when not (`merge-qa-checks.ts` 81–87, 107–123). |
| LLM QA pass uses catalog row for asset role `llm` at resolved `provider_tier` (US-X.4) | **PASS** | `resolveProviderForJob({ assetRole: "llm", llmVariant: "default" })` (`lib/qa/run-qa-for-assembled-reel.ts` 199–203). Adapter from catalog row via `resolveCatalogRowForDecision` + `createSiliconFlowLlmAdapter` (218–225). Agent exports `REEL_QA_LLM_VARIANT = "default"` (`run-reel-qa.ts` 23). |
| Failed critical checks block approval until resolved or overridden by operator | **PASS WITH NOTES** | Status derivation: blocking fail → `blocked`; overridable fail → `failed`; else `passed` (`lib/contracts/qa-report.ts` 287–303). Gate: `isQaReportReadyPhaseA` / `getQaGateStatusForAssembledReel` → `ready` only when `status === 'passed'` (`qa-report.ts` 316–319; `get-qa-gate-status-for-assembled-reel.ts` 28–70). Panel shows not-ready when terminal ≠ passed (`OperatorQaPanel.tsx` 336–341). **Override path deferred to US-10.2** (CONTRACT Phase A amendment) — no escape for `blocked`; overridable fails stay not-ready until re-run passes. |
| **[SEC]** QA verdicts computed/stored server-side; no client-supplied `passed`; approval gate reads DB | **PASS** | Closed write under `lib/qa/**` (`run-qa-for-assembled-reel.ts` `import "server-only"`). Action accepts pointer-only after forbidden-key scan (`actions/run-qa-for-assembled-reel.ts` 25–55; `FORBIDDEN_QA_RUN_AUTHORITY_KEYS` in `qa-report.ts` 120–160). Gate helper DB-only; no request `passed` (`get-qa-gate-status-for-assembled-reel.ts` 1–70). No QA Route Handler under `app/`. |
| **[SEC]** Checks classified `overridable` vs `blocking` in code/config; not endpoint-editable | **PASS** | `QA_BLOCKING_CHECK_KEYS` / `QA_OVERRIDABLE_CHECK_KEYS` + `lib/qa/check-catalog.ts` (immutable map). No catalog CRUD / `neuramark_qa_overrides` in this story. Blocking set: `own_avatar_consent`, `generic_avatar_not_owner`. |

---

### CONTRACT surfaces

| # | Surface | Status | Evidence |
|---|---------|--------|----------|
| 1 | `runQaForAssembledReel` Server Action | **PASS** | `lib/qa/actions/run-qa-for-assembled-reel.ts` — `requireOperator("handler")` first; `{ assembledReelId }` only; `revalidatePath("/operator/scripts")`. |
| 2 | `runQaForAssembledReelForClient` orchestrator | **PASS** | `lib/qa/run-qa-for-assembled-reel.ts` — prereqs, rate limit, fail-closed `running`, deterministic + budget + LLM + merge + spend. |
| 3 | `onBrandingCompleted` auto-chain | **PASS** | `lib/qa/on-branding-completed.ts`; hooked from `applyBrandingJobUpdate` when branding → `completed` (`lib/branding/apply-branding-job-update.ts` 138–145); no branding revert. |
| 4 | `getQaGateStatusForAssembledReel` | **PASS** | `lib/qa/get-qa-gate-status-for-assembled-reel.ts` — `server-only`; Phase A ready iff `passed`. |
| 5 | `getQaReportsForAssembledReels` batch | **PASS** | `lib/qa/get-qa-reports-for-assembled-reels.ts`; attached via `get-reel-scripts-for-week.ts` as `qaByAssembledReelId`. |
| 6 | Check catalog | **PASS** | `lib/qa/check-catalog.ts` + contracts. |
| 7 | Deterministic evaluators | **PASS** | consent / generic-avatar / CTA under `lib/qa/checks/**`. |
| 8 | `runReelQaAgent` LLM | **PASS** | `lib/agents/content/run-reel-qa.ts` — delimited untrusted tags; Zod `.strict()` subset. |
| 9 | Zod + types | **PASS** | `lib/contracts/qa-report.ts`. |
| 10 | Migration `neuramark_qa_reports` | **PASS** | `supabase/migrations/20260831010000_neuramark_qa_reports.sql` — UNIQUE assembled_reel, CHECK status, RLS enabled, zero policies. |
| 11 | `/operator/scripts` QA panel | **PASS** | `OperatorQaPanel.tsx` stacked after assembly/branding in `ScriptsPageView.tsx` 1764–1776; Run/Re-run pointer-only; no override UI. |

---

### SECURITY floors (binding summary)

| Floor | Status | Evidence |
|-------|--------|----------|
| `requireOperator` first on manual run | **PASS** | `actions/run-qa-for-assembled-reel.ts` 29–38 |
| Pointer-only + forbidden keys | **PASS** | `find-forbidden-qa-run-keys.ts`; tests smuggle → `FORBIDDEN_FIELDS` |
| Assembly + branding prereqs | **PASS** | orchestrator 100–105 → `ASSEMBLY_NOT_READY` / `BRANDING_REQUIRED` |
| Caption hard reject | **PASS** | orchestrator 134–140 → `CAPTION_REQUIRED` |
| Tenancy / IDOR → 404 | **PASS** (code) | `loadAssemblyJobScoped` + report SELECT by `client_id`; miss → `NOT_FOUND` |
| Closed write surface | **PASS** | grep: no QA Route Handler; UPSERT only in `persist-qa-report` via orchestrator |
| Status derivation server-only | **PASS** | `deriveQaReportStatus` |
| Catalog immutable + blocking set | **PASS** | check-catalog + contracts |
| LLM severity ignored; unknown drop+log | **PASS** | `merge-qa-checks.ts`; agent tests |
| Deterministic legal always run | **PASS** | orchestrator runs deterministic before LLM; LLM fail still persists deterministic via `persistNonPass` |
| Budget before LLM + spend on success | **PASS** | `assertReelBudgetAllowsEstimatedSpend` 235–248; `finalizeGenerationCost` 301–315 |
| Rate limit `qa_run` | **PASS** (code) | `check-qa-run-rate-limit.ts`; constants in contracts |
| Prompt injection delimiters + Zod strict | **PASS** | `run-reel-qa.ts` tags + `qaLlmAgentOutputSchema` |
| Provider `assetRole: 'llm'` | **PASS** | orchestrator resolve |
| Gate DB-only; ready iff passed | **PASS** | gate helper + `isQaReportReadyPhaseA` |
| US-10.2 boundary (no override) | **PASS** | no `neuramark_qa_overrides`; no override UI |
| Auto-chain trusted; no branding revert | **PASS** | `on-branding-completed.ts` |
| Operator DTO minimal; no XSS dump | **PASS** | detail DTO checks only; panel React text / PrimeReact — no `dangerouslySetInnerHTML` |
| DDL + RLS zero policies | **PASS** | migration + test |

---

### Convention Compliance

| Rule | Status | Evidence |
|------|--------|----------|
| EN + ES user-facing copy | **PASS WITH NOTES** | `messages/en.json` / `es.json` `scripts.qa.*` (status, checks, actions, errors). **Note:** EN title `"QA verdict"` (`en.json` ~1298) vs CONTEXT preference for **Veredicto QA** / avoid “QA verdict” as product noun; ES correctly uses `"Veredicto QA"`. Operator-only surface — soft. |
| Server Components default; `"use client"` justified | **PASS** | Page RSC loads week data; `OperatorQaPanel` is client for Run action + local pending/banner. |
| PrimeReact-first | **PASS** | `Button`, `Tag`, `Message` in panel. |
| Loading / empty / error / pending | **PASS** | Empty prereqs / no report; loading; error banner via `messageForQaError`; in-flight disable. |
| Auth / `getCurrentUser` / no browser Supabase | **PASS** | Action uses `requireOperator`; gate uses `getCurrentUser`; no `@supabase/supabase-js` in panel. |
| Endpoint has concrete FE consumer | **PASS** | `/operator/scripts` → `runQaForAssembledReel`. |
| `neuramark_` prefix | **PASS** | `neuramark_qa_reports` migration. |

---

### Gaps (what blocks PASS)

**None blocking Phase A PASS.** Soft notes only:

1. **US-10.2 override deferred** — by design; VALIDATION must not claim “overridden” AC path closed.
2. **SECURITY test suite incomplete vs CONTRACT minimum list** — implemented in code but **not** all covered by automated tests: foreign `assembledReelId` → 404, branding/caption reject paths, budget block → no LLM, rate limit 6th run, gate helper integration (pure `ready iff passed` is covered). Cliente 403 + forbidden fields + derivation + RLS grep + auto-chain are covered.
3. **EN terminology** — `"QA verdict"` vs Veredicto QA (soft).

---

### Scope Creep

| Item | Assessment |
|------|------------|
| Override UI / `neuramark_qa_overrides` | **Absent** — correct |
| Vision / frame LLM | **Absent** — correct |
| Weekly cron HTTP | **Absent** — `invokedBy: 'system'` seam only |
| New Operator route / Cliente QA panel | **Absent** — correct |
| Client-editable catalog | **Absent** — correct |

No unrequested surfaces found beyond CONTRACT Phase A.

---

### Tests

```text
npx tsx --test lib/qa/*.test.ts lib/agents/content/run-reel-qa.test.ts
→ 42 pass / 0 fail (11 suites)
```

| File | Approx. focus |
|------|----------------|
| `lib/agents/content/run-reel-qa.test.ts` | 9 — prompts, disclosure, LLM Zod, fixtures, severity catalog wins |
| `lib/qa/check-catalog.test.ts` | 10 — catalog + deterministic + merge |
| `lib/qa/generic-avatar-not-owner.test.ts` | 12 — US-3.4 fixtures + hint |
| `lib/qa/qa-reports.test.ts` | 11 — forbidden keys, derivation/gate, Cliente 403, FORBIDDEN_FIELDS, migration/RLS, auto-chain hook |

---

### Recommended Next Actions (and which agent should take them)

1. **qa-engineer** — QA gate: exercise Operator panel smoke; optionally add missing SECURITY automated cases (IDOR 404, budget, rate limit, branding/caption rejects) as conditions if raising APPROVE WITH CONDITIONS.
2. **product-owner** — On this PASS WITH NOTES, check off USER_STORIES § US-10.1 AC (Phase A interpretation); keep US-10.2 override AC open.
3. **nextjs-frontend** (optional soft) — Rename EN `scripts.qa.title` from “QA verdict” → “QA” / “Veredicto QA” equivalent for CONTEXT alignment.
4. **Do not** implement override in a follow-up under 10.1 — that is **US-10.2**.

---

### QA blockers (handoff)

| Severity | Blocker |
|----------|---------|
| None (hard) | — |
| Soft | Incomplete automated coverage for some CONTRACT SECURITY minimum cases (IDOR/budget/rate/prereq) — code present |
| Soft | EN title “QA verdict” terminology |
| Info | US-10.2 override explicitly deferred — not a 10.1 Phase A fail |
