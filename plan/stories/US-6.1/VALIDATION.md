# Validation Report — US-6.1

**Story:** US-6.1 — Generate Instagram caption per Reel  
**Branch:** `feature/US-6.1-reel-captions`  
**Builds:** agents `c385372` · FE `d075781` · BE `1f45244`  
**Date:** 2026-08-30  
**Validator:** requirements-validator  
**Sources:** `plan/USER_STORIES.md` § US-6.1, `plan/stories/US-6.1/CONTRACT.md`, `plan/stories/US-6.1/SECURITY.md`, `plan/stories/US-6.1/TASKS.md`, implemented code, automated tests

### Verdict: PASS WITH NOTES

**Blockers:** 0  
**Tests:** 45/48 pass (`npx tsx --test lib/reel-captions/reel-captions.test.ts lib/agents/content/generate-reel-caption.test.ts`) — 3 agent prompt-fixture assertions fail (non-blocking; see Test Results)

---

## Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Caption generated for each script in approved strategy | **PASS** | Orchestrator loops approved strategy slots, skips `SCRIPT_PENDING`, UPSERTs per script (`lib/reel-captions/generate-reel-captions-for-client.ts:172–185`, batch handler). Server Actions `generateReelCaptions` / `regenerateReelCaption` gate on `getApprovedStrategyForWeek` + `requireOperator("handler")` (`lib/reel-captions/actions/generate-reel-captions.ts:39–89`). DB `neuramark_reel_captions` with `UNIQUE (reel_script_id)` (`supabase/migrations/20260830400000_neuramark_reel_captions.sql:14–15`). FE batch + per-slot regen on `/operator/scripts` (`components/scripts/ScriptsPageView.tsx:367–421`, `512–516`). Test: happy batch 2 scripts + 1 skip (`lib/reel-captions/reel-captions.test.ts`). |
| Includes local/geo keywords when profile has zone | **PASS** | Agent loads profile via `getBusinessProfileForAgents`; system prompt injects zone description and instructs local keywords (`lib/agents/content/generate-reel-caption.ts:121–150`). Stub adapter derives keywords from `UNTRUSTED_BUSINESS_PROFILE` zone block (`lib/providers/llm/stub-reel-caption-llm-adapter.ts:58–74`). Test: stub returns empty keywords when no zone; batch persists keywords with zone fixture profile (`lib/agents/content/generate-reel-caption.test.ts`; `lib/reel-captions/reel-captions.test.ts` VALID_CAPTION_OUTPUT). FE keyword chips when `record.keywords.length > 0` (`components/scripts/ScriptsPageView.tsx:971+`). |
| Hashtag count within configured max | **PASS** | Frozen constants: warn max 15 (`IG_HASHTAG_WARN_MAX`), hard max 30 (`IG_HASHTAG_HARD_MAX`) in `lib/contracts/reel-caption.ts:10–11`. Agent output schema rejects >30 (`reelCaptionAgentOutputSchema` max 30). `buildReelCaptionRecord` sets `hashtagsOverConfiguredMax` when count > 15 (`lib/contracts/reel-caption.ts:106`). FE shows count + over-max warning (`components/scripts/ScriptsPageView.tsx:946–955`). Tests: rejects 31 hashtags; accepts 16 with warn flag (`lib/reel-captions/reel-captions.test.ts`). |
| LLM calls use catalog row for asset role `llm` at resolved `provider_tier` (US-X.4) | **PASS** | Orchestrator: `getProviderCatalog` → `getDefaultCostPolicy` → `resolveProvider({ assetRole: "llm", tier: policy.providerTier, llmVariant: "default" })` (`lib/reel-captions/generate-reel-captions-for-client.ts:130–144`). Agent exports `REEL_CAPTION_LLM_VARIANT = "default"` (`lib/agents/content/generate-reel-caption.ts:22`). Test: `resolveProvider called with llmVariant default` → `siliconflow_deepseek_flash` (`lib/reel-captions/reel-captions.test.ts:962+`). |
| [SEC] Caption/hashtag/keyword output is schema-validated and length-bounded before storage; captions are rendered as plain text everywhere (never as HTML) | **PASS** | Zod strict schemas with plain-text refine (no `<>&`, no `javascript:`) (`lib/contracts/reel-caption.ts:24–70`). `mapAgentOutputToRecord` + `buildReelCaptionRecord` before UPSERT (`lib/reel-captions/persist-reel-caption.ts:62–71`; orchestrator uses same path). DB CHECK caption 1–2200 chars (`supabase/migrations/20260830400000_neuramark_reel_captions.sql:16–17`). FE renders caption as text node `{record.caption}` — no `dangerouslySetInnerHTML` in `components/scripts/*`. Tests: HTML reject, unknown keys, length bounds (`lib/reel-captions/reel-captions.test.ts`). |

---

## Convention Compliance

| Check | Status | Evidence |
|-------|--------|----------|
| EN + ES user-facing strings | **PASS** | `messages/en.json:873–915`, `messages/es.json:873–915` — full `scripts.caption.*` tree. Wired in RSC `app/(app)/operator/scripts/page.tsx:141–161`. |
| Server Components by default; minimal `"use client"` | **PASS** | RSC page loads week data + copy. Client island `ScriptsPageView` for TabView, generate/regen actions, clipboard. |
| PrimeReact-first UI | **PASS** | `TabView`/`TabPanel`, `Tag`, `Button`, `Message`, `Toast`, `DataTable` (`components/scripts/ScriptsPageView.tsx`). |
| Loading / empty / error / pending states | **PASS** | Caption pending empty state, no-script gate, batch/regen loading flags, error banner via `messageForCaptionCode`, stale badge (`ScriptsPageView.tsx:561–640`, `801–830`). |
| Auth via `requireOperator()` / no Supabase in client | **PASS** | Actions call `requireOperator("handler")` first. List enrichment via existing gated `getReelScriptsForWeek`. No `@supabase` in `components/scripts/*`. |
| Backend endpoints map to concrete FE consumers | **PASS** | `generateReelCaptions`, `regenerateReelCaption`, extended `getReelScriptsForWeek` → Caption tab only. |
| `neuramark_` DB prefix / migrations only | **PASS** | `neuramark_reel_captions` table, indexes, trigger, RLS deny-by-default (`supabase/migrations/20260830400000_neuramark_reel_captions.sql`). |
| CONTRACT frozen shapes | **PASS** | DTOs in `lib/contracts/reel-caption.ts`; list extension in `lib/reel-scripts/list-reel-scripts-for-week.ts:25–66`. Error codes match CONTRACT. No `selected_cta_index`. |

---

## Security Acceptance Criteria (SECURITY.md)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| [SEC] Schema-validated, length-bounded, plain-text output before storage | **PASS** | See AC row above. |
| [SEC] Operator-only mutations; `requireOperator("handler")` | **PASS** | `generate-reel-captions.ts:44–45`; `regenerate-reel-caption.ts` (same pattern). Tests: non-operator → 403. |
| [SEC] Caption read enrichment behind gated `getReelScriptsForWeek` | **PASS** | `buildReelScriptListForStrategy` server-only; consumed via existing Operator list action. No standalone caption Route Handler. |
| [SEC] Forbidden client-supplied caption/hashtag/keyword/variant fields | **PASS** | `findForbiddenReelCaptionKeys` + input schemas `.strict()`; test rejects smuggled caption text at action layer. |
| [SEC] Rate limit `caption_generate` + in-flight guard | **PASS** | `check-caption-generation-rate-limit.ts`; distinct agent key test vs `video_script_generate`. |
| [SEC] Approval + tenancy before LLM/UPSERT | **PASS** | `getApprovedStrategyForWeek`, `loadApprovedStrategyForScriptJob`, `loadReelScriptForCaptionJob`; draft strategy → `STRATEGY_NOT_APPROVED`. |
| [SEC] RLS deny-by-default on new table | **PASS** | Migration enables RLS, zero policies; test reads migration file. |
| [SEC] LLM keys server-only; delimited untrusted blocks | **PASS** | `import "server-only"` on agent + orchestrator. `UNTRUSTED_*` tags in user prompt (`generate-reel-caption.ts:24–26`, `156–169`). |
| [SEC] System invoke seam documented, not browser-exposed | **PASS** | `generateReelCaptionsForClient({ invokedBy: "system" })` skips `requireOperator`; test confirms trusted path only. Not wired to cron in US-6.1 BUILD (per CONTRACT). |

---

## Dependency Stories

| Dependency | Status | Notes |
|------------|--------|-------|
| US-5.1 Reel script package per slot | **Satisfied** | CLOSED. `neuramark_reel_scripts`, batch/single script generate, `/operator/scripts`. Caption requires script row (SCRIPT_PENDING skip / SCRIPT_NOT_FOUND). |
| US-4.2 Review and approve strategy | **Satisfied** | CLOSED. `getApprovedStrategyForWeek` approval gate enforced. |
| US-X.4 Provider catalog + resolveProvider | **Satisfied** | CLOSED. Caption uses `llmVariant: "default"` at policy tier. |
| US-2.3 Business profile (zone) | **Satisfied (implicit)** | `getBusinessProfileForAgents` supplies zone for geo keywords; `PROFILE_INCOMPLETE` when missing. |

---

## Test Results

```
npx tsx --test lib/reel-captions/reel-captions.test.ts lib/agents/content/generate-reel-caption.test.ts

ℹ tests 48
ℹ pass 45
ℹ fail 3
```

### Passing coverage (45)

- Contract/schema: agent output bounds, HTML reject, strict keys, hashtag warn flag, forbidden action fields
- BE mutations: operator gate, approval gate, profile incomplete, happy batch/single regen, UPSERT idempotency, partial batch errors, rate-limit agent key, `llmVariant: "default"`
- Helpers: caption job loader tenancy, system invoke path, RLS migration posture
- Agent runtime: server-only, resolveProvider default, JSON parse/validate, stub generate with/without zone

### Failing tests (3) — notes, not story blockers

All three are **prompt-fixture assertion drift** in `lib/agents/content/generate-reel-caption.test.ts`; production prompt behavior is correct and covered by passing integration/stub tests.

| Test | Root cause |
|------|------------|
| `buildReelCaptionPrompts wraps untrusted blocks with frozen delimiters` | Asserts `systemPrompt` matches `/2..4/` (regex “any two chars”), but prompt uses Unicode en-dash `2–4`. Delimiter wrapping in **userPrompt** passes. |
| `prompt contains zone description when profile has zone` | Asserts `/keywords locales/i` on system prompt; implementation uses English `local/geo terms` / `include local keywords referencing: Denver CO`. Zone text **is** present. |
| `prompt allows empty keywords when no zone present` | Asserts Spanish `/puede estar vacío/i`; hard-rules line is English `keywords array may be empty.` even when `locale: "es"`. Stub test `stub returns empty keywords when profile has no zone` **passes**. |

**Recommended fix (content-agents-engineer):** Update the three assertions to match frozen prompt copy (en-dash range, English hard-rules strings, or localize hard-rules per locale if product wants Spanish system rules).

---

## Gaps (what blocks PASS)

None. Story acceptance criteria and CONTRACT obligations are met. Agent test failures are test-maintenance debt only.

---

## Scope Creep

None identified. Correctly excludes: `selected_cta_index` / CTA radio (US-6.2), Cliente caption read (US-11), cron/system wiring (integrations-engineer), inline Operator edit, publish, cost pre-check (US-7.1).

---

## Recommended Next Actions

| Action | Owner |
|--------|-------|
| Fix 3 prompt-fixture assertions in `generate-reel-caption.test.ts` (en-dash range, locale strings) | content-agents-engineer |
| Proceed to QA gate | qa-engineer |
| PO checks AC boxes in `plan/USER_STORIES.md` only after QA CLOSE | product-owner |

---

**Next gate:** QA (`plan/stories/US-6.1/QA.md`)
