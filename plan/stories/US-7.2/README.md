# US-7.2 — Select provider by economics and quality floor

**Status:** PREP — story folder + TASKS ready; gates not started.

**As a** System, **I want** automatic provider recommendation per piece, **so that** we default to the cheapest acceptable option.

Ship **server-side policy engine + Operator read-only provider recommendations**: extend `resolveProvider()` with explicit **cheapest-active** ranking from catalog `cost_model`; map **`provider_tier` + visual mode + asset role** (`llm` \| `talking_head` \| `broll` \| `tts`) → **`provider_key` + `estimated_cost_cents`**; **log every resolution** (tier, role, key, estimate, rationale) for later cost analysis; surface **read-only recommendations** on **`/operator/scripts`** (slot expand/detail panel and existing budget confirm dialog); **wire `estimateLlmJobCost`** (US-7.1) through the unified engine so preview, gate, and spend paths share one resolver. **Actual video/TTS vendor adapters** (US-8.x / US-9.3) and **catalog admin UI** stay **out**.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-7.2 (do **not** check off in PREP).

**This folder:** [`plan/stories/US-7.2/`](./) — `README.md` · `TASKS.md` · *(SPEC-REVIEW, SECURITY, CONTRACT, VALIDATION, QA — pending gates)*.

**Branch:** `feature/US-7.2-provider-ranking`

**Depends on:** [US-7.1](../US-7.1/) ✅ cost policy settings · `getCostPolicyForClient()` · `assertReelBudgetAllowsSpend()` · `estimateLlmJobCost()` · `/operator/scripts` budget confirm · [US-X.4](../US-X.4/) ✅ `neuramark_provider_catalog` seed · `getProviderCatalog()` · `resolveProvider()` · [US-3.1](../US-3.1/) ✅ `visual_mode` · [US-5.1](../US-5.1/) ✅ scripts list + slot metadata · [US-14.5](../US-14.5/) ✅ `requireOperator()`.

**Unblocks:** [US-8.1](../../USER_STORIES.md) (adapter interface consumes resolved `provider_key`) · [US-8.2–8.7](../../USER_STORIES.md) (video jobs call policy engine at create) · [US-9.3](../../USER_STORIES.md) (TTS resolution) · [US-7.3](../../USER_STORIES.md) (actual cost vs logged estimate).

---

## Scope in

| Area | What US-7.2 adds |
|------|------------------|
| **FE** | **Read-only** provider recommendation panel on **`/operator/scripts`**: per-slot (expand row or detail side panel) show resolved **provider display label + tier + estimated cost** for each applicable **asset role** (LLM, talking-head/B-roll/TTS as projected from modalidad + visual mode); short **rationale** string (e.g. "Low tier · own avatar → SadTalker"). Extend existing **`ReelBudgetConfirmDialog`** to show the same recommendation block for the LLM job being confirmed. EN/ES (`scripts.providerRecommendation.*`). **No** client `provider_key` input; **no** catalog admin. |
| **BE** | **`resolveProviderDecision()`** (or CONTRACT-exact name): loads catalog + `getCostPolicyForClient()` → calls enhanced **`resolveProvider()`** (cheapest **active** row per tier+role, existing loop/LLM-variant rules preserved) → adapter **`estimateCost`** → returns `{ providerKey, providerTier, assetRole, estimatedCostCents, displayLabel, rationaleKey }`. **`estimateLlmJobCost`** delegates here (single estimator for preview + gate). **`getReelProviderRecommendations({ clientId, weekStart, slotIndex? })`** for FE read surface. **`logProviderDecision()`** append-only INSERT on every **executed** LLM job (script/caption generate/regenerate) and exposed seam for US-8.x job create. Document **`manual`** zero-cost fallback (US-8.3) — excluded from auto-rank; explicit Operator path only. |
| **DB** | New **`neuramark_provider_decisions`** append-only log: `client_id`, `reel_script_id`, `job_kind`, `asset_role`, `provider_tier`, `provider_key`, `estimated_cost_cents`, `rationale_key`, `operator_client_id` nullable, `created_at`. RLS deny-by-default. **No** change to `neuramark_provider_catalog` seed (US-X.4). |
| **media-pipeline-engineer** | Ranking helper (`rankCatalogCandidatesByCost`), decision logger, extend `resolveProvider` sort, wire orchestrators + `estimateLlmJobCost`. |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **US-8.x** vendor adapters | SadTalker, Wan, MuseTalk, HeyGen **implementations** — US-7.2 **recommends** seeded keys only; no `createJob` / polling / storage. |
| **US-8.3** manual upload UI | Document zero-cost **`manual`** fallback; upload flow ships in US-8.3. |
| **Catalog admin UI / write API** | Catalog remains migration/SQL activation (US-X.4 [SEC]). |
| **US-7.1** budget settings | Cap/tier CRUD + gate already shipped — US-7.2 **consumes** tier, does not duplicate settings. |
| **US-7.3 / US-7.4** actual cost + roll-up UI | Decision log stores **estimate** at resolution time; actuals backfill later. |
| **Blocking budget for video/TTS in V1 BUILD** | US-7.1 gate remains **LLM-only** for blocking math; video/TTS rows appear in **read-only projection** + decision log seam for US-8.x. |
| **Cliente** provider/cost visibility | Recommendations and estimates Operator-only ([SEC] baseline). |
| **Per-asset tier mixing** | Single `provider_tier` on cost policy drives all roles (Conventions). |

## Canonical terms (CONTEXT)

Use **Operator**, **Reel**, **modalidad de producción**, **provider tier** (`low` \| `high`), **asset role**, **provider key**, **recomendación de proveedor**.  
_Evitar:_ client-picked vendor; exposing `envKeyName` / raw `cost_model` to browser; "cheap model" in Cliente-facing copy.

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-X.4 | **`neuramark_provider_catalog`** seeded (7 low active + 3 high inactive + `manual`). **`resolveProvider(catalog, context)`** with `llmVariant`, `hasReferenceLoop`, manual exclusion — US-7.2 adds **cost-based sort** among tied candidates, not a second resolver. |
| US-7.1 | **`estimateLlmJobCost`** → `resolveProvider({ assetRole: "llm", tier, llmVariant })` + adapter estimate — **replace internals** with policy engine delegate; keep function signature for gate/preview callers. **`buildReelBudgetPreview`** already shows `resolvedLlmProviderLabel` — extend DTO with multi-asset recommendations. |
| US-5.1 / US-6.1 | Script/caption orchestrators call budget gate — add **`logProviderDecision`** after successful LLM job alongside **`recordReelSpendEvent`**. |
| US-3.1 | Profile **`visual_mode`** + slot **`modalidad`** feed talking-head vs B-roll routing. |

**US-7.2 adds economics-based ranking, per-piece recommendation DTO, decision audit log, and unified estimate path** — not vendor I/O.

## PO decisions frozen (2026-08-29)

1. **V1 surface:** Read-only recommendations on **`/operator/scripts`** (slot expand panel **or** inline detail section — CONTRACT picks one layout) **plus** enrich existing budget confirm dialog. No standalone settings page.
2. **Ranking rule:** Among **active** catalog rows matching **`tier` + `asset_role`**, select **lowest `cost_model.unitCostCents`** after existing capability filters (`llmVariant`, `prefersReferenceLoop`, manual exclusion). **High-tier rows never selected while policy tier is `low`.**
3. **Visual-mode routing (V1):** **`own_avatar`** → `talking_head` (SadTalker when no loop); **`generic_avatar` + reference loop** → `talking_head` with `hasReferenceLoop: true` (MuseTalk when seeded `prefersReferenceLoop`); **`generic_avatar` without loop** → SadTalker; **`faceless` / slot `modalidad === 'faceless'`** → `broll` (+ LLM + TTS in projection); B-roll beats on script → include `broll` in projection even when not faceless.
4. **Low tier defaults (seed alignment):** LLM default → DeepSeek; LLM fallback (script regen) → Qwen; talking-head → SadTalker; loop → MuseTalk; B-roll → Wan; TTS → CosyVoice2 — must match **`DEFAULT_LOW_TIER_PROVIDER_KEYS`** when those rows are cheapest active.
5. **High tier (when active via SQL):** talking-head → HeyGen; B-roll → LTX/Kling — **recommendation only** until US-8.x adapters register.
6. **Manual fallback:** Catalog row **`manual`** with **`capabilities.manualFallback: true`** — **never** auto-selected by `resolveProvider`; documented as **zero-cost Operator escape hatch** (US-8.3). Recommendation panel may show footnote "Manual upload available — no API cost."
7. **Decision logging:** **Append-only** `neuramark_provider_decisions` on every **successful** LLM generate/regenerate (links `reel_script_id` + `job_kind` + `asset_role: llm`). US-8.x job create **must** call same logger — document seam in CONTRACT.
8. **No client authority:** Reject **`providerKey`**, **`providerTier`**, **`assetRole`** on all generate/regenerate/job-create boundaries ([SEC] AC). Server resolves from policy + catalog only.
9. **`estimateLlmJobCost` handoff:** **Same function** remains entry point for US-7.1 gate — internally delegates to **`resolveProviderDecision({ assetRole: "llm", ... })`** so preview, gate, and log never diverge.
10. **Operator DTO allowlist:** Browser receives **`displayLabel`**, **`providerTier`**, **`estimatedCostCents`**, **`rationaleKey`** per role — never **`envKeyName`**, full **`cost_model`**, or raw catalog row.
11. **Fail closed:** No active provider for tier+role → **`PROVIDER_UNAVAILABLE`** (same as US-7.1); high tier with all high rows inactive → Operator-visible error + settings hint.
12. **Implementers:** **media-pipeline-engineer** + **nextjs-backend** + **nextjs-frontend** (`docs/development/AGENT-ROSTER.md` Phase 4). **No content-agents-engineer** prompt changes.
13. **Module placement (lean):** `lib/cost-policy/resolve-provider-decision.ts`, `lib/cost-policy/log-provider-decision.ts`, `lib/cost-policy/get-reel-provider-recommendations.ts`; extend `lib/providers/provider-adapters.ts` ranking; contracts `lib/contracts/provider-decisions.ts` (or extend `cost-policy.ts` — CONTRACT freezes).
14. **i18n:** EN + ES under **`scripts.providerRecommendation.*`** (labels, rationale keys, manual footnote).

---

## Gates (orchestrator)

- [ ] SPEC-REVIEW.md (spec-guardian)
- [ ] SECURITY.md (security-architect)
- [ ] CONTRACT.md (nextjs-backend — frozen; **Reviewed by FE** before BUILD)
- [ ] BUILD (media-pipeline-engineer + nextjs-backend + nextjs-frontend)
- [ ] VALIDATION.md (requirements-validator)
- [ ] QA.md (qa-engineer)

**Next after PREP:** spec-guardian SPEC-REVIEW → security-architect SECURITY → nextjs-backend CONTRACT (FE signoff) → BUILD on `feature/US-7.2-provider-ranking`.
