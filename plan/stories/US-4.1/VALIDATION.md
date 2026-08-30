# Validation Report — US-4.1

**Story:** US-4.1 — Generate weekly Instagram content strategy  
**Branch:** `feature/US-4.1-content-strategy`  
**Date:** 2026-08-30  
**Validator:** requirements-validator  
**Sources:** `plan/USER_STORIES.md` § US-4.1, `plan/stories/US-4.1/CONTRACT.md`, `plan/stories/US-4.1/SECURITY.md`, `plan/stories/US-4.1/TASKS.md`, implemented code, automated tests

### Verdict: PASS WITH NOTES

**Blockers:** 0  
**Tests:** 51/51 pass (`npx tsx --test lib/contracts/content-strategy.test.ts lib/agents/content/generate-weekly-strategy.test.ts lib/content-strategy/content-strategy.test.ts`)

---

## Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Brief includes at least 3 Reel slots aligned to trust, education, local sale, and inbound-message (DM) goals | **PASS** (soft goal spread) | Hard: `contentStrategyBriefSchema` requires `slots.min(3).max(7)` and per-slot `goal` ∈ `{ trust, education, local_sale, inbound_dm }` (`lib/contracts/content-strategy.ts:14–57`). Agent prompt instructs spreading goals (`lib/agents/content/generate-weekly-strategy.ts:192`). FE displays goal tags (`components/strategy/StrategyBriefView.tsx:85–87`). **Note:** All four goal categories are not server-enforced across the week — CONTRACT freeze #10 (soft prompt only). |
| Uses `getBusinessProfileForAgents` only, not raw interview | **PASS** | Orchestrator loads profile exclusively via `getBusinessProfileForAgents(clientId)` (`lib/content-strategy/generate-content-strategy-for-client.ts:56–65`). No `neuramark_interview_sessions` SELECT in `lib/content-strategy/` or `lib/agents/content/`. Agent module documents mandatory helper inputs (`lib/agents/content/generate-weekly-strategy.ts:6–8`). |
| Regenerate creates new version without deleting approved history | **PASS** | `persistStrategyDraft` performs INSERT only (`lib/content-strategy/persist-strategy-draft.ts:29–38`). `loadNextStrategyVersion` computes `max + 1` (`lib/content-strategy/load-latest-strategy-row.ts:114–137`). Test: regenerate INSERTs version 2 (`lib/content-strategy/content-strategy.test.ts`). Migration UNIQUE on `(client_id, week_start, version)` — no DELETE path. |
| Strategy targets Instagram Reels only in V1 — no multichannel output | **PASS** | Brief schema has no channel field and uses `.strict()` (`lib/contracts/content-strategy.ts:53–58`). System prompt: "Channel: Instagram Reels only" (`lib/agents/content/generate-weekly-strategy.ts:164`). |
| Operator-only: endpoint/action rejects non-operator sessions server-side (403) | **PASS** | `generateContentStrategy` and `getLatestContentStrategy` call `requireOperator("handler")` first (`lib/content-strategy/actions/generate-content-strategy.ts:41–48`, `get-latest-content-strategy.ts:39–46`). Page under `app/(app)/operator/` with layout `requireOperator("page")` (`app/(app)/operator/layout.tsx:14`). Tests: non-operator → `FORBIDDEN`. |
| [SEC] Agent job runs server-side only; LLM provider keys from server env, never client or DB | **PASS** | `import "server-only"` on agent + orchestrator (`lib/agents/content/generate-weekly-strategy.ts:1`, `generate-content-strategy-for-client.ts:1`). Keys via `createSiliconFlowLlmAdapter(provider.key, provider.envKeyName)` reading `process.env` (`lib/providers/siliconflow-llm-adapter.ts`). No provider fields in action input; smuggled keys rejected (`findForbiddenContentStrategyKeys`). |
| LLM calls use catalog row for asset role `llm` at resolved `provider_tier` (low default via US-X.4) | **PASS** | `resolveProvider(catalogResult.providers, { assetRole: "llm", tier: policyResult.policy.providerTier, llmVariant: "default" })` (`lib/content-strategy/generate-content-strategy-for-client.ts:94–98`). Test logs show `providerKey: 'siliconflow_deepseek_flash'`. |
| [SEC] Client-authored profile text delimited; agent output validated against typed brief schema before storage | **PASS** | Delimiters `<UNTRUSTED_BUSINESS_PROFILE>`, `<UNTRUSTED_PLAYBOOK_HINTS>`, `<UNTRUSTED_TREND_HINTS>` in `buildWeeklyStrategyPrompts` (`lib/agents/content/generate-weekly-strategy.ts:118–216`). Post-LLM: `contentStrategyBriefSchema.safeParse` + `validateBriefAgainstAllowlists` before INSERT (`generate-content-strategy-for-client.ts:141–161`). Invalid output → `AGENT_OUTPUT_INVALID`, no INSERT (tested). |
| [SEC] "Generate strategy" rate-limited/debounced server-side per client | **PASS** | `checkGenerationRateLimit` before orchestrator (`generate-content-strategy.ts:65–71`). Constants: 3 generates / 60 min, in-flight guard (`lib/contracts/content-strategy.ts:151–154`). Table `neuramark_agent_rate_limits` in migration. Tests: `RATE_LIMITED`, `GENERATION_IN_FLIGHT`. |

---

## Convention Compliance

| Check | Status | Evidence |
|-------|--------|----------|
| EN + ES user-facing strings | **PASS** (1 typo) | Full `strategy.*` blocks in `messages/en.json:719–778` and `messages/es.json:719–778`. Nav link in `AppHeader.tsx:55–58`. **Note:** EN `strategy.page.clientLabel` is `"Cliente"` — should be `"Client"`. |
| Server Components by default; minimal `"use client"` | **PASS** | RSC page `app/(app)/operator/strategy/page.tsx` (no `"use client"`). Client island limited to `StrategyPageView` + `StrategyBriefView` for interactivity. |
| PrimeReact-first UI | **PASS** | `Button`, `Calendar`, `Dropdown`, `Message`, `Skeleton`, `Toast`, `Card`, `Tag` in strategy components. |
| Loading / empty / error / pending states | **PASS** | `loading.tsx` + `StrategyLoading`; empty `Message` (`StrategyPageView.tsx:316`); load error path (`197–210`); generating skeleton (`301–302`); error banner from server codes (`297–298`). |
| Auth via `getCurrentUser()` / `requireOperator()` | **PASS** | Session `clientId = operator.id` server-resolved; no Supabase in client components. |
| Backend endpoints map to concrete FE consumers | **PASS** | `generateContentStrategy` + `getLatestContentStrategy` consumed by `/operator/strategy`. No public Route Handlers. |
| `neuramark_` DB prefix + RLS deny-by-default | **PASS** | Migration `20260830130000_neuramark_content_strategies.sql`; RLS enabled, zero policies; test asserts migration posture. |
| CONTRACT frozen shapes / error envelope | **PASS** | Input `{ weekStart }` only; success/error envelopes match CONTRACT; forbidden-field rejection; versioned INSERT; dual invoke path `invokedBy: "system"` tested. |

---

## Dependency Stories

| Dependency | Status | Notes |
|------------|--------|-------|
| US-2.3 `getBusinessProfileForAgents` | **Satisfied** | Used in orchestrator |
| US-3.1 / US-3.4 visual mode allowlist | **Satisfied** | `visualModeSummary === null` → `PROFILE_INCOMPLETE`; modalidad validated |
| US-16.1 `getPlaybookForAgents` | **Satisfied** | Orchestrator + slug allowlist |
| US-16.2 `getTrendSnapshotForWeek` | **Satisfied** | Orchestrator + optional tactica validation |
| US-X.4 provider catalog | **Satisfied** | `getProviderCatalog` + `resolveProvider` |
| US-14.5 `requireOperator` | **Satisfied** | Action + layout gates |

---

## Test Results

```
npx tsx --test lib/contracts/content-strategy.test.ts \
  lib/agents/content/generate-weekly-strategy.test.ts \
  lib/content-strategy/content-strategy.test.ts

ℹ tests 51
ℹ pass 51
ℹ fail 0
ℹ duration_ms ~189
```

Coverage highlights vs CONTRACT unit test matrix (31 items): schema (1–6), allowlist (7–11), generate action (12–20), read action (21–23), orchestrator system path (24), agent delimiters (25–26), provider resolution (27–28), migration RLS (29), invalid LLM JSON (30). **Gap:** matrix item 31 (logger mock — no full prompt in logs) not automated; implementation logs only metadata (`generate-content-strategy-for-client.ts:177–183`).

---

## Gaps (what blocks PASS)

None. All acceptance criteria satisfied per frozen CONTRACT interpretation.

---

## Scope Creep

| Item | Assessment |
|------|------------|
| `loadOperatorClientsForStrategy` + disabled client Dropdown | **Acceptable** — display-only per CONTRACT V1; generate still uses session `clientId`. |
| `lib/providers/llm/stub-llm-adapter.ts` | **Minor** — test helper; not wired to production path (orchestrator uses `lib/providers/siliconflow-llm-adapter.ts`). |
| No US-4.2 edit/approve, no Cliente route, no script jobs | **Correct** — out of scope per CONTRACT. |

---

## Notes (non-blocking)

1. **Goal coverage:** USER_STORIES AC wording suggests alignment to all four goal types; CONTRACT + implementation treat collective coverage as a **soft** LLM prompt instruction, not a post-parse validator. Acceptable per frozen CONTRACT #10; PO may clarify AC checkbox wording at CLOSE.
2. **Rate limit without Supabase:** `checkGenerationRateLimit` returns `{ ok: true }` when Supabase is unconfigured (`check-generation-rate-limit.ts:44–46`) — dev convenience; production requires configured Supabase.
3. **`maxDuration`:** CONTRACT mentions ~60s lean timeout; Server Action does not export `maxDuration` — rely on platform default until production tuning.
4. **EN i18n typo:** `messages/en.json` `strategy.page.clientLabel` = `"Cliente"` should be `"Client"`.
5. **TASKS.md gate checkboxes:** BUILD/VALIDATION gates in `TASKS.md` still show pending — update at QA/CLOSE.

---

## Recommended Next Actions

| Action | Owner |
|--------|-------|
| Fix EN `clientLabel` string | **nextjs-frontend** |
| Proceed to **QA** gate (security + integration smoke on `/operator/strategy` with live Supabase + LLM env) | **qa-engineer** |
| PO checks AC boxes in `USER_STORIES.md` at story CLOSE | **product-owner** |
| Optional: add logger unit test for CONTRACT matrix #31 | **nextjs-backend** |
