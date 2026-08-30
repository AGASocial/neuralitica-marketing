# US-7.1 — Configure max budget per Reel

**Priority:** P0  
**Depends on:** US-3.1 ✅ `visual_mode` · US-5.1 ✅ `neuramark_reel_scripts` + generate actions · US-X.4 ✅ `neuramark_cost_policies` seed + catalog loaders · US-14.5 ✅ `requireOperator()`  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-7.1 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **nextjs-backend** + **nextjs-frontend** + **media-pipeline-engineer** (`docs/development/AGENT-ROSTER.md` Phase 4). DB migrations under BE. **No content-agents-engineer** BUILD slice.  
**Canonical terms:** **Operator** · **Paquete de guion** · **Reel** · **modalidad de producción** · **provider tier** · **presupuesto máximo por Reel**. Avoid CONTEXT _Evitar_ list in product-facing copy.

## Out of scope (do not implement here)

- **US-7.2** policy engine — cheapest-active provider per asset role; `provider_key` job logging; full duration/visual-mode → vendor routing for video/TTS.
- **US-8.x** video job creation — no budget gate on `neuramark_video_jobs` in BUILD; document **`checkReelBudget` seam** for downstream.
- **US-9.3** TTS / assembly — ledger columns exist; no TTS spend events in BUILD.
- **US-7.3 / US-7.4** actual cost persistence and roll-up UI — `actual_cost_cents` nullable on spend events for future backfill only.
- **US-4.1** Content Strategy generation — per-Reel cap does not gate strategy LLM in 7.1.
- **Catalog write API** — `neuramark_provider_catalog` remains read-only from app (US-X.4 [SEC]).
- **Cliente** routes, approval package, dashboard cost columns — Operator-only cost fields ([SEC] baseline).
- **Weekly cycle / system `invokedBy`** auto-generate — manual Operator paths first; seam must not require browser `budgetOverride`.
- **Per-asset tier mixing** — single `provider_tier` on cost policy drives all roles (Conventions).

## Scope split

| Concern | Owner |
|---------|--------|
| Global + per-client `neuramark_cost_policies` reads/writes | **US-7.1** BE/DB |
| Operator settings UI `/operator/settings/cost-policy` | **US-7.1** FE |
| `getCostPolicyForClient(clientId)` | **US-7.1** BE (extends US-X.4 global loader) |
| Cumulative ledger `neuramark_reel_spend_events` | **US-7.1** DB/BE |
| Budget audit `neuramark_budget_audit_log` | **US-7.1** DB/BE |
| `checkReelBudget` in script/caption job paths | **US-7.1** BE |
| Estimate + confirm on `/operator/scripts` | **US-7.1** FE |
| `getProviderCatalog` + seed global row | **US-X.4** (unchanged) |
| Video retry cumulative gate | **US-8.4** (reuses `checkReelBudget`) |
| Multi-asset estimate ranking | **US-7.2** |

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Global default | **`provider_tier = low`**, **`max_cost_cents = 150`** — US-X.4 seed; settings UI **UPDATE** global row (`client_id IS NULL`). |
| Per-client override | **Optional** `neuramark_cost_policies` row with `client_id`; resolver **client row → else global**; UI toggle + save/delete override for session tenant. |
| Settings route | **`/operator/settings/cost-policy`** — Operator-only; first settings route in Operator area. |
| Policy resolver | **`getCostPolicyForClient(clientId)`** replaces direct `getDefaultCostPolicy()` in gated job paths; keep `getDefaultCostPolicy()` as global-only helper or alias — CONTRACT freezes. |
| V1 gate surface | **Script + caption** generate/regenerate only (US-5.1 / US-6.1 actions). **No** video job gate in BUILD. |
| Estimate before confirm | FE **`ConfirmDialog`** on batch/single script and caption actions; preview from **`getReelBudgetPreview`** (or equivalent Server Action) — **server numbers only**. |
| Block rule | **`cumulativeCostCents + estimatedCostCents > maxCostCents`** → **`BUDGET_EXCEEDED`** without override. |
| Override | Mutation flag **`budgetOverride: true`** only after explicit Operator second confirm; writes **`override_proceed`** audit row. **No** global "disable budget" toggle. |
| Cumulative sum | **`SUM(estimated_cost_cents)`** on **`neuramark_reel_spend_events`** for `reel_script_id` (all `job_kind` values). US-7.3 may reconcile actuals later. |
| Spend event timing | **INSERT spend event** after successful LLM job with **`estimated_cost_cents`** from adapter (and `actual` null until US-7.3). **Do not** insert on blocked attempts (audit log only). |
| Visual mode / avatar | Profile **`visual_mode`** + slot **`modalidad`** feed **projection hint** in preview DTO; **blocking estimate V1 = LLM only**. Faceless / generic / own_avatar noted for Operator ("video/TTS may add cost later"). |
| B-roll flag | **`modalidad === 'faceless'`** or script B-roll beats → projection hint only in V1. |
| Policy edit auth | **`requireOperator("handler")`** on all policy writes; **403** for non-operator. |
| Policy bounds | **`max_cost_cents`:** int **1–10000** (PO lean); **`provider_tier`:** `low` \| `high`. CONTRACT may tighten ceiling. |
| Forbidden keys | Generate/regenerate actions reject **`maxCostCents`**, **`providerTier`**, **`estimatedCostCents`**, **`providerKey`**, **`tier`**, **`budgetCap`**, **`clientId`**. |
| Cost DTO allowlist | Operator preview/settings DTOs expose **resolved provider display label + tier + cents** — never **`envKeyName`**, full **`cost_model`**, or catalog row. |
| Implementers | **nextjs-backend** + **nextjs-frontend** + **media-pipeline-engineer**. |
| i18n | **`settings.costPolicy.*`**, **`scripts.budget.*`** EN + ES. |

### Cost policy resolver sketch (CONTRACT freezes Zod + SQL)

```ts
// Lean sketch — CONTRACT owns exact names
async function getCostPolicyForClient(clientId: string): Promise<CostPolicyResult> {
  // 1) SELECT * FROM neuramark_cost_policies WHERE client_id = $clientId LIMIT 1
  // 2) ELSE global row WHERE client_id IS NULL (US-X.4 seed)
}
```

### Budget check sketch (CONTRACT freezes codes)

```ts
type ReelBudgetCheckInput = {
  clientId: string;
  reelScriptId: string;
  assetRole: "llm";
  jobKind: "script_generate" | "caption_generate";
  llmVariant: "default" | "fallback";
  budgetOverride?: boolean; // strict optional — forbidden unless true
};

type ReelBudgetCheckResult =
  | { ok: true; estimatedCostCents: number; cumulativeCostCents: number; maxCostCents: number }
  | { ok: false; code: "BUDGET_EXCEEDED"; cumulativeCostCents: number; estimatedCostCents: number; maxCostCents: number };
```

### Preview DTO sketch (FE confirm dialog)

```ts
type ReelBudgetPreview = {
  reelScriptId: string;
  estimatedCostCents: number;      // this attempt (LLM)
  cumulativeCostCents: number;     // prior spend on this Reel
  maxCostCents: number;            // resolved policy cap
  remainingCents: number;          // max(0, max - cumulative) — server-derived
  providerTier: "low" | "high";
  resolvedLlmProviderLabel: string; // catalog display name only
  visualMode: "own_avatar" | "generic_avatar" | "faceless";
  projectionHint?: string | null;   // e.g. faceless B-roll note — i18n key or server copy id
  wouldExceed: boolean;             // cumulative + estimate > max
};
```

### Settings mutation sketch (CONTRACT freezes Zod)

```ts
export const updateGlobalCostPolicyInputSchema = z
  .object({
    maxCostCents: z.number().int().min(1).max(10000),
    providerTier: providerTierSchema,
  })
  .strict();

export const updateClientCostPolicyOverrideInputSchema = z
  .object({
    enabled: z.boolean(),
    maxCostCents: z.number().int().min(1).max(10000).optional(),
    providerTier: providerTierSchema.optional(),
  })
  .strict();
// enabled false → DELETE client override row if exists
```

## Carry-forwards / reuse (do not reinvent)

- Cost policy table + seed: `supabase/migrations/20260829260100_neuramark_cost_policies.sql`.
- Global loader: `lib/providers/get-default-cost-policy.ts` — extend, do not fork.
- Catalog + resolve: `lib/providers/get-provider-catalog.ts`, `lib/providers/provider-adapters.ts`, `lib/contracts/providers.ts`.
- Script orchestrator: `lib/reel-scripts/generate-reel-scripts-for-client.ts` (already loads policy for tier).
- Caption orchestrator: `lib/reel-captions/generate-reel-captions-for-client.ts`.
- Script actions: `lib/reel-scripts/actions/` · Caption actions: `lib/reel-captions/actions/`.
- Scripts UI: `components/scripts/ScriptsPageView.tsx` — add confirm + budget copy.
- Operator gate: `lib/auth/require-user.ts` · `requireOperator()`.
- PrimeReact: `ConfirmDialog` pattern from `components/preferences/AvatarConsentSection.tsx`.
- Visual mode: `profile.visualModeSummary` from `getBusinessProfileForAgents`.

---

## FE checklist

Concrete BE consumers: **`getCostPolicyForSettings`** (page load) · **`updateGlobalCostPolicy`** · **`updateClientCostPolicyOverride`** · **`getReelBudgetPreview`** · generate/regenerate actions with optional **`budgetOverride`**.

- [ ] **New route** `app/(app)/operator/settings/cost-policy/page.tsx` — Operator layout; load effective global policy + whether client override exists.
- [ ] **Settings form (PrimeReact):** `maxCostCents` input (display dollars/cents per CONTRACT); `providerTier` `SelectButton` or dropdown `low` \| `high`; save global via Server Action.
- [ ] **Client override section:** toggle "Use custom budget for this client"; when enabled, show override fields; save/delete override action; show effective policy summary ("Using global" vs "Custom").
- [ ] **Resolved provider label** read-only (from server DTO) — no catalog secrets.
- [ ] **Operator nav link** to cost-policy settings (CONTRACT freezes placement).
- [ ] **`/operator/scripts`:** before **Generate scripts** (batch), **Regenerate script** (slot), **Generate captions** (batch), **Regenerate caption** (slot) — call preview action; open **`ConfirmDialog`** with estimate, cumulative, cap, remaining, tier, provider label, projection hint when faceless.
- [ ] **Blocked state:** when `wouldExceed`, primary action disabled or shows block message; **secondary "Proceed anyway"** triggers mutation with **`budgetOverride: true`** (second confirm optional — PO lean: same dialog with explicit override button).
- [ ] **Error handling:** `BUDGET_EXCEEDED`, `FORBIDDEN`, validation errors on policy save.
- [ ] **EN + ES** `settings.costPolicy.*`, `scripts.budget.*`.
- [ ] **No Supabase in Client Components**; no client-side cost math for authority — display server DTO only.
- [ ] **No Cliente** cost fields on any shared route.

---

## BE checklist

Concrete FE consumers: settings page · scripts confirm dialogs · future US-8.x `checkReelBudget` reuse.

- [ ] **Migration:** `neuramark_reel_spend_events` append-only ledger (CONTRACT freezes columns: `client_id`, `reel_script_id`, `asset_role`, `job_kind`, `estimated_cost_cents`, `actual_cost_cents` nullable, `operator_client_id`, `created_at`; indexes on `reel_script_id`, `(client_id, reel_script_id)`).
- [ ] **Migration:** `neuramark_budget_audit_log` append-only (`event_type`, `client_id`, `reel_script_id` nullable, `operator_client_id`, `estimated_cost_cents`, `cumulative_cost_cents`, `max_cost_cents`, `provider_tier`, `metadata` jsonb nullable, `created_at`).
- [ ] **Migration (if needed):** `UNIQUE INDEX` on `neuramark_cost_policies (client_id) WHERE client_id IS NOT NULL` — one override per client.
- [ ] **`lib/contracts/cost-policy.ts`** — Zod schemas for policy DTOs, preview, audit enums, error codes (`BUDGET_EXCEEDED`, `POLICY_VALIDATION_ERROR`, etc.).
- [ ] **`getCostPolicyForClient(clientId)`** — server-only; validated `CostPolicyRow`.
- [ ] **`sumReelCumulativeCostCents(reelScriptId)`** — parameterized sum over spend events.
- [ ] **`estimateLlmJobCost(...)`** — catalog + policy tier + `llmVariant` → adapter `estimateCost`.
- [ ] **`checkReelBudget(input)`** — resolve policy, cumulative, estimate; if exceed and no override → audit `blocked` + return error; if override → audit `override_proceed` + allow.
- [ ] **`recordReelSpendEvent(...)`** — INSERT after successful LLM job only.
- [ ] **Wire `checkReelBudget`** into `generate-reel-scripts-for-client.ts` and `generate-reel-captions-for-client.ts` **before** LLM call; pass through `budgetOverride` from actions.
- [ ] **`getReelBudgetPreview({ weekStart, slotIndex, jobKind })`** — operator-gated; resolves `reel_script_id`; no LLM call.
- [ ] **`updateGlobalCostPolicy`** Server Action — `requireOperator`; UPDATE global row; audit `policy_updated`.
- [ ] **`updateClientCostPolicyOverride`** Server Action — upsert/delete per-client row; audit `policy_updated`.
- [ ] **`getCostPolicyForSettings`** Server Action or page loader — global + optional client override + effective resolved policy for session tenant.
- [ ] **[SEC] Forbidden fields** on generate/regenerate actions — extend forbidden-key helpers.
- [ ] **[SEC] Non-operator** policy writes → 403.
- [ ] **Extend generate actions** input schemas with optional **`budgetOverride: z.literal(true).optional()`** strict — reject other truthy values.
- [ ] **Automated tests:** `lib/cost-policy/cost-policy.test.ts` (or extend `providers.test.ts`) — resolver client vs global; block vs override; cumulative sum across regen; forbidden fields; bounds on policy save; audit rows inserted; preview DTO never includes `envKeyName`.

---

## DB checklist

All objects keep `neuramark_` prefix. Migrations via Supabase migrations only.

- [ ] **CREATE** **`neuramark_reel_spend_events`** per CONTRACT DDL.
- [ ] **CREATE** **`neuramark_budget_audit_log`** per CONTRACT DDL.
- [ ] **ALTER/INDEX** **`neuramark_cost_policies`** — unique per `client_id` when not null (if not already enforced).
- [ ] **No change** to US-X.4 global seed values in migration (still `low` / `150` on fresh DB).
- [ ] **No change** to `neuramark_provider_catalog` in this story.
- [ ] RLS deny-by-default on new tables; service-role Node only.

---

## Gates (orchestrator)

- [x] SPEC-REVIEW.md (spec-guardian)
- [x] SECURITY.md (security-architect)
- [x] CONTRACT.md authored (nextjs-backend — frozen; **Reviewed by FE** required before BUILD)
- [ ] BUILD (nextjs-backend + nextjs-frontend + media-pipeline-engineer)
- [ ] VALIDATION.md
- [ ] QA.md

**Status:** PREP (2026-08-29). **Next:** spec-guardian SPEC-REVIEW → security-architect SECURITY → nextjs-backend CONTRACT.

---

## Open questions (for SPEC / SECURITY / CONTRACT)

1. **Override UX — double ConfirmDialog vs single dialog with danger button?** **PO lean:** single dialog; when `wouldExceed`, show warning + **"Proceed anyway"** as explicit secondary action (records audit).
2. **Batch generate preview — one dialog for whole week vs per-slot?** **PO lean:** **one batch dialog** with **worst-case sum** (sum of estimates for all targets) vs single cap — CONTRACT must freeze batch math (likely sum of per-slot estimates compared once against **per-Reel** cap **per slot** in loop server-side; FE batch shows aggregate range or "up to N Reels × estimate").
3. **Batch block behavior** — if one slot would exceed, block entire batch or skip slots? **PO lean:** server **fails entire batch** unless override; FE shows which slots exceed in preview list (CONTRACT detail).
4. **`actual_cost_cents` on spend events in 7.1?** **PO lean:** column **nullable**, always null in 7.1 BUILD; US-7.3 backfills on job complete.
5. **Projection hint delivery** — server i18n key vs free-text? **PO lean:** server sends **`projectionHintKey`** enum (`faceless_broll_later`, `own_avatar_video_later`, null) — FE maps to messages.
6. **Global settings editable by any operator vs session-scoped?** **PO lean:** **global policy edit affects all clients** — Operator trust model (SQL-promoted role); client override only affects session `clientId` tenant.
7. **High tier activation** — selecting `high` does not auto-activate catalog rows; US-7.2 ranks **active** rows only — settings copy should warn "high tier providers must be active in catalog (SQL)".
8. **`rules` jsonb on cost_policies** — **unchanged null** in V1; no UI for rules JSON in 7.1.

No SPEC amendment assumed in PREP: SPEC §3 Cost Policy Engine already requires server-side cap, cumulative Reel cost, Operator settings, and audited override — US-7.1 implements V1 slice on LLM script/caption paths first.
