# US-7.2 — Select provider by economics and quality floor

**Priority:** P0  
**Depends on:** US-7.1 ✅ budget gate + `estimateLlmJobCost` · US-X.4 ✅ catalog + `resolveProvider` · US-3.1 ✅ `visual_mode` · US-5.1 ✅ `/operator/scripts` · US-14.5 ✅ `requireOperator()`  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-7.2 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **media-pipeline-engineer** + **nextjs-backend** + **nextjs-frontend** (`docs/development/AGENT-ROSTER.md` Phase 4). DB migrations under BE. **No content-agents-engineer** BUILD slice.  
**Canonical terms:** **Operator** · **Reel** · **modalidad de producción** · **provider tier** · **asset role** · **recomendación de proveedor**. Avoid CONTEXT _Evitar_ list in product-facing copy.

## Out of scope (do not implement here)

- **US-8.x** video provider adapters — no `createJob`, polling, webhooks, or `neuramark_video_jobs` writes.
- **US-8.3** manual upload UI — document **`manual`** zero-cost path only; upload handler is US-8.3.
- **US-9.3** TTS synthesis — recommend CosyVoice2/ElevenLabs from catalog; no audio generation.
- **Catalog admin UI / write endpoints** — `neuramark_provider_catalog` remains read-only from app (US-X.4 [SEC]).
- **US-7.1** settings / budget gate — consume `getCostPolicyForClient()`; do not duplicate cap/tier CRUD or audit tables.
- **US-7.3 / US-7.4** actual cost persistence and Reel cost roll-up dashboard.
- **Blocking budget for video/TTS** — US-7.1 gate stays LLM-only; video/TTS estimates are **projection + recommendation** until US-8.x wires gate.
- **Cliente** routes — no provider or cost fields on shared payloads.
- **Per-asset tier mixing** — single policy `provider_tier` applies to all asset roles.

## Scope split

| Concern | Owner |
|---------|--------|
| Cheapest-active ranking in `resolveProvider` | **US-7.2** BE (media-pipeline-engineer) |
| `resolveProviderDecision` unified estimator | **US-7.2** BE |
| `estimateLlmJobCost` delegate to policy engine | **US-7.2** BE (replaces US-7.1 inline resolve) |
| `getReelProviderRecommendations` Operator read API | **US-7.2** BE |
| `logProviderDecision` append-only audit | **US-7.2** DB/BE |
| Read-only recommendation UI on `/operator/scripts` | **US-7.2** FE |
| Budget confirm dialog enrichment (LLM recommendation block) | **US-7.2** FE |
| `getProviderCatalog` + seed rows | **US-X.4** (unchanged) |
| Budget gate + cumulative ledger | **US-7.1** (unchanged — calls `estimateLlmJobCost`) |
| Video job create + adapter I/O | **US-8.x** (calls `resolveProviderDecision` + `logProviderDecision`) |
| Manual upload handler | **US-8.3** |

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| V1 FE surface | **Read-only** on **`/operator/scripts`** — slot expand/detail panel showing per-role recommendations; **also** enrich **`ReelBudgetConfirmDialog`** for LLM confirm path. |
| Ranking | Filter **active** + matching **tier** + **asset_role** + capability rules → sort by **`cost_model.unitCostCents` ascending** → pick first. Tie-break: stable **`provider_key` lexicographic** (CONTRACT may freeze). |
| Tier floor | **`provider_tier = low`** never selects high-tier rows; **`high`** never selects low-tier rows. Inactive rows never selected. |
| LLM variant | **`llmVariant: "default"`** (caption) vs **`"fallback"`** (script generate/regenerate) — preserved from US-X.4; ranking applies **within** variant-eligible set. |
| Talking-head routing | **`own_avatar`** → `talking_head`, `hasReferenceLoop: false`. **`generic_avatar` + loop asset** → `hasReferenceLoop: true`. **`generic_avatar` without loop** → `hasReferenceLoop: false`. |
| B-roll routing | Slot **`modalidad === 'faceless'`** OR script **`brollBeats.length > 0`** → include **`broll`** recommendation in projection. |
| TTS routing | Always include **`tts`** in full-Reel projection when visual mode is not purely "LLM-only" (all Reel production paths need voiceover per SPEC). |
| Manual fallback | **`manual`** excluded from auto `resolveProvider`; **`estimatedCostCents: 0`** when explicitly selected (US-8.3); footnote in recommendation UI. |
| Decision log | **`neuramark_provider_decisions`** INSERT on **successful** LLM jobs in BUILD; seam exported for US-8.x job create. |
| No client `providerKey` | Extend forbidden-key helpers on generate/regenerate; strip/ignore on any future job-create schema. |
| `estimateLlmJobCost` | **Delegate** to `resolveProviderDecision` — **one estimator** for preview, gate, spend event, and decision log. |
| Operator DTO | **`displayLabel`**, **`providerTier`**, **`estimatedCostCents`**, **`rationaleKey`** per role — no secrets. |
| High tier inactive | Fail closed **`PROVIDER_UNAVAILABLE`** with Operator message referencing SQL activation (same as US-7.1 provider error). |
| Implementers | **media-pipeline-engineer** + **nextjs-backend** + **nextjs-frontend**. |
| i18n | **`scripts.providerRecommendation.*`** EN + ES. |

### Policy engine sketch (CONTRACT freezes Zod + exact names)

```ts
export type ResolveProviderDecisionInput = {
  clientId: string;
  providerTier: ProviderTier;
  assetRole: AssetRole;
  visualMode?: VisualMode;
  modalidad?: VisualModality;
  hasReferenceLoop?: boolean;
  needsBroll?: boolean;
  llmVariant?: LlmVariant;
  targetDurationSec?: number; // optional — for per-second estimates (US-8.x)
};

export type ProviderDecision = {
  providerKey: string;
  providerTier: ProviderTier;
  assetRole: AssetRole;
  estimatedCostCents: number;
  displayLabel: string;
  rationaleKey: ProviderRationaleKey; // i18n enum — CONTRACT freezes
};

export async function resolveProviderDecision(
  input: ResolveProviderDecisionInput,
): Promise<
  | { ok: true; decision: ProviderDecision }
  | { ok: false; code: "PROVIDER_UNAVAILABLE" }
> {
  // getProviderCatalog() + resolveProvider (enhanced rank) + adapter.estimateCost
}
```

### Full-Reel recommendation sketch (FE panel)

```ts
export type ReelProviderRecommendation = {
  reelScriptId: string | null; // null for not-yet-generated slot
  slotIndex: number;
  providerTier: ProviderTier;
  visualMode: VisualMode;
  modalidad: VisualModality;
  components: Array<{
    assetRole: AssetRole;
    displayLabel: string;
    estimatedCostCents: number;
    rationaleKey: ProviderRationaleKey;
  }>;
  projectedTotalCents: number; // sum of components — read-only hint, NOT blocking gate in V1
  manualFallbackNoteKey: "manual_upload_available"; // always present
};

export async function getReelProviderRecommendations(input: {
  clientId: string;
  weekStart: string;
  slotIndex?: number;
}): Promise<
  | { ok: true; items: ReelProviderRecommendation[] }
  | { ok: false; code: "STRATEGY_NOT_APPROVED" | "PROVIDER_UNAVAILABLE" | "SLOT_NOT_FOUND" }
>;
```

### Decision log sketch (CONTRACT freezes DDL)

```ts
export type LogProviderDecisionInput = {
  clientId: string;
  reelScriptId: string;
  jobKind: ReelSpendJobKind; // from US-7.1
  assetRole: AssetRole;
  providerTier: ProviderTier;
  providerKey: string;
  estimatedCostCents: number;
  rationaleKey: ProviderRationaleKey;
  operatorClientId?: string | null;
};
```

### Ranking enhancement sketch (`resolveProvider`)

```ts
// After capability filters (llmVariant, loop preference, manual exclusion):
// sort candidates by cost_model.unitCostCents ASC, then key ASC
// return sorted[0]
```

### `estimateLlmJobCost` handoff (replace US-7.1 internals)

```ts
export async function estimateLlmJobCost(input: EstimateLlmJobCostInput) {
  const decision = await resolveProviderDecision({
    clientId: input.clientId,
    providerTier: input.providerTier,
    assetRole: "llm",
    llmVariant: input.llmVariant,
  });
  if (!decision.ok) return { ok: false, code: "PROVIDER_UNAVAILABLE" };
  return {
    ok: true,
    estimatedCostCents: decision.decision.estimatedCostCents,
    providerKey: decision.decision.providerKey,
    resolvedLlmProviderLabel: decision.decision.displayLabel,
  };
}
```

## Carry-forwards / reuse (do not reinvent)

- Catalog loader: `lib/providers/get-provider-catalog.ts`.
- Resolver base: `lib/providers/provider-adapters.ts` — **extend** `resolveProvider`, do not fork.
- Cost policy: `lib/cost-policy/get-cost-policy-for-client.ts`.
- LLM estimate entry: `lib/cost-policy/estimate-llm-job-cost.ts` — **delegate** to policy engine.
- Budget preview: `lib/cost-policy/build-reel-budget-preview.ts` — extend DTO with recommendation block.
- Spend + gate: `lib/cost-policy/assert-reel-budget-allows-spend.ts`, `record-reel-spend-event.ts`.
- Orchestrators: `lib/reel-scripts/generate-reel-scripts-for-client.ts`, `lib/reel-captions/generate-reel-captions-for-client.ts`.
- Scripts UI: `components/scripts/ScriptsPageView.tsx`, `components/cost-policy/ReelBudgetConfirmDialog.tsx`.
- Provider labels: `lib/cost-policy/llm-provider-label.ts` — generalize to **`resolveProviderDisplayLabel(key)`**.
- Seed keys: `DEFAULT_LOW_TIER_PROVIDER_KEYS` in `lib/contracts/providers.ts`.
- Migration reference: `supabase/migrations/20260829260000_neuramark_provider_catalog.sql`.

---

## FE checklist

Concrete BE consumers: **`getReelProviderRecommendations`** · extended **`getReelBudgetPreview`** (optional inline recommendations) · existing generate/regenerate actions (unchanged inputs).

- [x] **Recommendation panel** on `/operator/scripts` — per-slot expand or detail section (CONTRACT freezes layout): list **asset roles** with **display label**, **tier badge**, **estimated cost**, **rationale** (i18n from `rationaleKey`).
- [x] **Projected total** footnote — sum of component estimates; label as **projected** (not yet blocking budget for video/TTS in V1).
- [x] **Manual fallback note** — static copy from `manualFallbackNoteKey` ("Manual upload — no API cost").
- [x] **Loading / empty / error** states — `PROVIDER_UNAVAILABLE`, `STRATEGY_NOT_APPROVED`, slot not found.
- [x] **Enrich `ReelBudgetConfirmDialog`** — show LLM recommendation line (label + estimate + rationale) above existing budget numbers.
- [x] **High tier inactive** — when recommendations fail, show Operator-friendly error (mirror budget dialog provider error).
- [x] **EN + ES** `scripts.providerRecommendation.*` (role labels, rationale keys, manual note, projected total).
- [x] **No Supabase in Client Components**; no client-side provider selection or cost math.
- [x] **No Cliente** provider/cost fields on any shared route.
- [x] **Read-only** — no buttons to override provider in V1 (HeyGen explicit fallback is US-8.7).

---

## BE checklist

Concrete FE consumers: recommendation panel · budget confirm enrichment · US-8.x seam.

- [ ] **Migration:** `neuramark_provider_decisions` append-only (CONTRACT freezes columns + indexes on `reel_script_id`, `(client_id, created_at)`).
- [ ] **`lib/contracts/provider-decisions.ts`** (or extend `cost-policy.ts`) — Zod for `ProviderDecision`, `ReelProviderRecommendation`, `ProviderRationaleKey`, `LogProviderDecisionInput`.
- [ ] **`rankCatalogCandidatesByCost(candidates)`** — sort by `unitCostCents`, stable tie-break.
- [ ] **Extend `resolveProvider`** — apply cost ranking after capability filters; preserve `llmVariant`, loop, manual exclusion behavior.
- [ ] **`resolveProviderDecision(input)`** — catalog + rank + adapter `estimateCost`; map `providerKey` → `displayLabel`.
- [ ] **Refactor `estimateLlmJobCost`** — delegate to `resolveProviderDecision`; remove duplicate resolve/adapter path.
- [ ] **`getReelProviderRecommendations({ clientId, weekStart, slotIndex? })`** — operator-gated; resolve policy tier + profile visual mode + strategy slots; build multi-role `components[]` per AC routing table.
- [ ] **`logProviderDecision(input)`** — INSERT decision row; call from script/caption orchestrators **after successful LLM** alongside `recordReelSpendEvent`.
- [ ] **Wire orchestrators** — pass `rationaleKey` + `providerKey` from decision into spend event metadata optional field (CONTRACT freezes whether duplicate or FK-only).
- [ ] **Generalize display labels** — extend beyond LLM keys (SadTalker, MuseTalk, Wan, CosyVoice2, HeyGen, Manual).
- [ ] **Export seam** — document **`resolveProviderDecision` + `logProviderDecision`** for US-8.1 CONTRACT (video job create).
- [ ] **[SEC] Forbidden fields** — reject `providerKey`, `assetRole`, `providerTier` on generate/regenerate (extend US-7.1 helpers).
- [ ] **[SEC] Operator-only** reads for recommendations — `requireOperator()` on preview/recommendation actions.
- [ ] **Automated tests:** extend `lib/providers/providers.test.ts` + `lib/cost-policy/cost-policy.test.ts` — cheapest-active ranking; low tier never picks high row; loop → MuseTalk; faceless → broll; manual excluded from auto rank; `estimateLlmJobCost` delegates; decision log INSERT; forbidden client `providerKey`; inactive high tier → `PROVIDER_UNAVAILABLE`.

---

## DB checklist

All objects keep `neuramark_` prefix. Migrations via Supabase migrations only.

- [ ] **CREATE** **`neuramark_provider_decisions`** per CONTRACT DDL.
- [ ] **No change** to `neuramark_provider_catalog` seed or `neuramark_cost_policies`.
- [ ] RLS deny-by-default on new table; service-role Node only.
- [ ] Indexes: `reel_script_id`, `(client_id, created_at DESC)` for later US-7.3 analysis.

---

## Gates (orchestrator)

- [ ] SPEC-REVIEW.md (spec-guardian)
- [ ] SECURITY.md (security-architect)
- [x] CONTRACT.md authored (nextjs-backend — frozen; **Reviewed by FE** required before BUILD)
- [ ] BUILD (media-pipeline-engineer + nextjs-backend + nextjs-frontend)
- [ ] VALIDATION.md (requirements-validator)
- [ ] QA.md (qa-engineer)

**Status:** PREP (2026-08-29). Gates not started. **Next:** SPEC-REVIEW on `feature/US-7.2-provider-ranking`.

---

## Open questions (for SPEC / SECURITY / CONTRACT)

1. **Recommendation panel layout — expand row vs fixed side panel?** **PO lean:** **expand row** per slot (matches existing script list UX); side panel optional P1.
2. **Projected total in V1 — show on confirm dialog or panel only?** **PO lean:** **both** panel (full Reel projection) and confirm (LLM line only).
3. **`rationaleKey` delivery — closed enum vs free-text?** **PO lean:** **closed enum** (`low_tier_own_avatar_sadtalker`, `faceless_broll_wan`, etc.) — FE maps to EN/ES; no server free-text to avoid leakage.
4. **Decision log on failed LLM?** **PO lean:** **no** — log only on successful resolution+execution (same as spend events); failed attempts have no provider decision row.
5. **Per-second vs per-run estimates for video roles without jobs?** **PO lean:** use catalog **`billingUnit`** defaults (`per_run` for talking-head, `per_clip` for b-roll) with CONTRACT-frozen duration assumptions (e.g. 30s Reel, 5s B-roll clip) — **projection only**.
6. **Duplicate `provider_key` on spend event vs decision log?** **PO lean:** **decision log is canonical** for analytics; spend event keeps `estimated_cost_cents` only (no FK between tables in V1).
7. **Batch recommendation fetch — one action for whole week?** **PO lean:** **yes** — `getReelProviderRecommendations` without `slotIndex` returns all slots (mirror budget preview batch pattern).
8. **`resolveProviderDisplayLabel` — catalog metadata column vs hardcoded map?** **PO lean:** **hardcoded map V1** (extend `llm-provider-label.ts`); optional `display_name` column deferred to avoid migration scope creep.

No SPEC amendment assumed in PREP: SPEC §3 Cost Policy Engine already requires server-side provider selection by economics/mode/asset role — US-7.2 implements the ranking + recommendation + decision log slice; US-8.x consumes it for actual jobs.
