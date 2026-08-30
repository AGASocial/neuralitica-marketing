# US-7.1 — Configure max budget per Reel

**Status:** PREP — `README.md` + `TASKS.md` (2026-08-29). Gates not started.

**As an** Operator, **I want** a maximum cost per Reel before generation, **so that** margin is protected.

Ship **Operator cost-policy settings + server-side Reel budget gate for LLM generation (scripts/captions V1)**: Operator edits **`max_cost_cents`** and **`provider_tier`** on a dedicated **`/operator/settings/cost-policy`** route (global default + optional per-client override); server resolves policy via **`getCostPolicyForClient(clientId)`** (per-client row wins, else global seed); **`checkReelBudget`** runs inside script/caption job-creation paths with **cumulative spend per `reel_script_id`**; Operator sees **estimate before confirm** on Generate/Regenerate on `/operator/scripts`; generation **blocked** when cumulative + estimate exceeds cap unless Operator records an **audited override**. **Full video/TTS/B-roll job budget wiring** and **US-7.2 policy-engine ranking** stay **out** of BUILD (ledger + gate designed so US-8.x/US-7.2 plug in).

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-7.1 (unchecked until VALIDATION CLOSE).

**This folder:** [`plan/stories/US-7.1/`](./) — `README.md` · `TASKS.md` · (pending) `SPEC-REVIEW.md` · `SECURITY.md` · `CONTRACT.md` · `VALIDATION.md` · `QA.md`.

**Branch:** `feature/US-7.1-cost-policy`

**Depends on:** [US-3.1](../US-3.1/) ✅ `visual_mode` on profile (`own_avatar` \| `generic_avatar` \| `faceless`) · [US-5.1](../US-5.1/) ✅ `neuramark_reel_scripts` · generate/regenerate on `/operator/scripts` · [US-X.4](../US-X.4/) ✅ `neuramark_cost_policies` seed · `getProviderCatalog()` · `getDefaultCostPolicy()` · `resolveProvider()` · `lib/contracts/providers.ts`.

**Unblocks:** [US-7.2](../../USER_STORIES.md) (policy engine ranking + multi-asset estimates) · [US-8.x](../../USER_STORIES.md) (video job budget gate reuse) · [US-8.4](../../USER_STORIES.md) (retry cumulative check) · [US-9.3](../../USER_STORIES.md) (TTS spend in cumulative).

---

## Scope in

| Area | What US-7.1 adds |
|------|------------------|
| **FE** | New Operator route **`/operator/settings/cost-policy`**: edit global **`max_cost_cents`** (currency display) and **`provider_tier`** (`low` \| `high`); optional **per-client override** section for session tenant; read-only resolved provider labels from catalog (no `envKeyName` / raw `cost_model`). On **`/operator/scripts`**: **ConfirmDialog** before batch/single **script** and **caption** generate/regenerate showing **estimate**, **cumulative spent**, **cap**, and **remaining**; second-step **override proceed** when blocked (Operator only). EN/ES (`settings.costPolicy.*`, `scripts.budget.*`). |
| **BE** | **`getCostPolicyForClient(clientId)`** — per-client row if present, else global (`client_id IS NULL`). **`estimateLlmJobCost`** / lean **`estimateReelPieceCost`** (V1: LLM script/caption only; visual mode + b-roll flag inform **read-only projected** full-Reel hint for Operator, not blocking math until US-7.2). **`checkReelBudget`** + **`recordReelSpendEvent`** in script/caption orchestrators **before** LLM call; reject crafted client estimate/tier/policy fields. Operator-gated **`updateCostPolicy`** (global) and **`updateClientCostPolicyOverride`** (optional upsert/delete). **`getReelBudgetPreview`** for confirm UI. **Audit** append-only rows for blocks, overrides, and policy edits. |
| **DB** | Reuse **`neuramark_cost_policies`** (US-X.4); migration for **one row per `client_id`** unique partial index if missing. New **`neuramark_reel_spend_events`** (cumulative ledger per Reel). New **`neuramark_budget_audit_log`** (blocks, overrides, policy changes). RLS deny-by-default. |
| **media-pipeline-engineer** | Budget resolver helpers under `lib/cost-policy/` (or `lib/providers/` per CONTRACT); cumulative sum query; integrate gate without duplicating US-7.2 ranking logic. |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **US-7.2** full policy engine | Cheapest-active ranking across asset roles; job decision logging; visual-mode → provider_key routing — US-7.1 uses **tier from policy** + existing `resolveProvider` for **LLM estimate only**. |
| **US-8.x** video job creation | No `neuramark_video_jobs` budget gate in BUILD — **ledger + `checkReelBudget` seam** documented for US-8.2+ to call. |
| **US-9.3** TTS / assembly spend | Cumulative ledger schema accepts `asset_role`; TTS events deferred. |
| **US-4.1** Content Strategy LLM | Budget AC is **per Reel**; strategy generation not gated in 7.1. |
| **Cliente** cost visibility | Margin-sensitive — Operator serializers only ([SEC] baseline). |
| **Catalog CRUD** | `neuramark_provider_catalog` remains migration/SQL-only (US-X.4 [SEC]). |
| **Weekly cycle auto-generate** | integrations-engineer — manual Operator trigger paths first. |
| **Dashboard cost roll-ups** | US-7.3 / US-7.4. |

## Canonical terms (CONTEXT)

Use **Operator**, **Paquete de guion**, **Reel**, **modalidad de producción** (`own_avatar` \| `generic_avatar` \| `faceless`), **provider tier** (`low` \| `high`), **presupuesto máximo por Reel**.  
_Evitar:_ client-picked vendor; exposing raw API unit costs to Cliente; "cheap model" in Cliente-facing copy.

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-X.4 | Table **`neuramark_cost_policies`** seeded: `provider_tier = low`, `max_cost_cents = 150`, `client_id IS NULL`. **`getDefaultCostPolicy()`** loads global only (`lib/providers/get-default-cost-policy.ts`). **`getProviderCatalog()`** + **`resolveProvider()`**. Zod: `costPolicyRowSchema`, `visualModeSchema`. |
| US-5.1 / US-6.1 | Script/caption generate orchestrators already load catalog + global policy for LLM resolution — **no budget gate yet**. Actions: `generateReelScripts`, `regenerateReelScript`, `generateReelCaptions`, `regenerateReelCaption`. |
| US-3.1 | **`visual_mode`** on profile — policy AC "avatar required vs faceless" uses profile/slot modality for **estimate projection** (faceless may imply B-roll in hint; gate math V1 = LLM only). |
| US-14.5 | **`requireOperator("handler")`** on all policy writes and cost-gated operator previews. |

**US-7.1 adds policy resolution (global + optional client override), Operator settings UI, cumulative Reel ledger, server-side budget gate + audit on script/caption generate** — not full video pipeline spend.

## PO decisions frozen (2026-08-29)

1. **Global default:** **`provider_tier = low`**, **`max_cost_cents = 150`** ($1.50/Reel) — already seeded by US-X.4; settings UI edits the global row in place (no second global row).
2. **Per-client override:** **Optional** — separate `neuramark_cost_policies` row with `client_id` set; **`getCostPolicyForClient(clientId)`** prefers client row, else global. UI: optional "Custom budget for this client" section on settings page (session `clientId` tenant). Deleting override reverts to global.
3. **Settings route:** **`/operator/settings/cost-policy`** — first Operator settings route; Operator-only layout gate (same as other `/operator/*` routes). Nav link in Operator shell (CONTRACT freezes label + placement).
4. **Estimate before confirm:** On `/operator/scripts`, **batch and single** script/caption generate/regenerate open **PrimeReact `ConfirmDialog`** showing server-derived **`estimatedCostCents`**, **`cumulativeCostCents`**, **`maxCostCents`**, **`remainingCents`** — client never sends these numbers on the mutation.
5. **Budget check placement:** **`checkReelBudget`** runs **server-side inside job-creation path** immediately before LLM invocation (after gates, after estimate). Direct Server Action call with crafted payload cannot skip it.
6. **Cumulative scope:** Sum **`neuramark_reel_spend_events.estimated_cost_cents`** (V1; US-7.3 may add `actual_cost_cents` weighting later) for the same **`reel_script_id`** across all prior attempts (script regen, caption regen). Video/TTS/B-roll rows **deferred** but table supports `asset_role` + `job_kind` for US-8.x/US-9.3.
7. **Block rule:** If **`cumulative + estimate > maxCostCents`**, return **`BUDGET_EXCEEDED`** unless mutation includes **`budgetOverride: true`** (strict optional flag) after Operator explicitly chooses override in confirm UI — records audit row (who, when, estimate, cumulative, cap).
8. **Override audit:** Append-only **`neuramark_budget_audit_log`** for **`blocked`**, **`override_proceed`**, and **`policy_updated`** events — never UPDATE in place on audit rows.
9. **Policy edit bounds:** **`max_cost_cents`:** positive integer, CONTRACT freezes ceiling (PO lean: **1–10000** cents = $0.01–$100.00). **`provider_tier`:** enum `low` \| `high` only. Reject client-supplied `clientId` on global update.
10. **Forbidden request fields:** Reject `maxCostCents`, `providerTier`, `estimatedCostCents`, `providerKey`, `tier`, `budgetCap` on generate/regenerate actions — policy resolved server-side (**AC [SEC]**).
11. **Visual mode in policy:** Estimate preview includes **`visualMode`** from profile (`visualModeSummary`) and slot **`modalidad`** when resolving script/caption job — affects **read-only projected full-Reel hint** (e.g. faceless → note B-roll may apply later); **blocking math V1 = LLM job estimate only** until US-7.2/US-8.x wire video/TTS.
12. **B-roll flag:** For script rows, infer from slot **`modalidad === 'faceless'`** or script package B-roll beats presence — **projection hint only** in V1 BUILD.
13. **Implementers:** **nextjs-backend** + **nextjs-frontend** + **media-pipeline-engineer** (`docs/development/AGENT-ROSTER.md` Phase 4). No **content-agents-engineer** prompt changes.
14. **Module placement (lean):** `lib/cost-policy/get-cost-policy-for-client.ts`, `lib/cost-policy/check-reel-budget.ts`, `lib/cost-policy/record-reel-spend-event.ts`, `lib/cost-policy/estimate-llm-job-cost.ts`; settings actions `lib/cost-policy/actions/`; contracts `lib/contracts/cost-policy.ts`; FE `app/(app)/operator/settings/cost-policy/page.tsx`.
15. **i18n:** EN + ES under **`settings.costPolicy.*`** (settings form) and **`scripts.budget.*`** (confirm dialog, block, override).
16. **Revalidate:** `revalidatePath("/operator/settings/cost-policy")` after policy save; `revalidatePath("/operator/scripts")` after generate paths unchanged.

---

## Gates (orchestrator)

- [ ] SPEC-REVIEW.md (spec-guardian)
- [ ] SECURITY.md (security-architect)
- [ ] CONTRACT.md (nextjs-backend — frozen; **Reviewed by FE** before BUILD)
- [ ] BUILD (nextjs-backend + nextjs-frontend + media-pipeline-engineer)
- [ ] VALIDATION.md
- [ ] QA.md

**Status:** PREP. **Next gate:** spec-guardian SPEC-REVIEW → security-architect SECURITY → nextjs-backend CONTRACT.
