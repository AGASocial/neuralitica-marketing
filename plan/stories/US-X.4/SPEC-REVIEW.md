## Spec Review — US-X.4

### Verdict: GAPS

US-X.4 (seed `neuramark_provider_catalog` + default `neuramark_cost_policies`; server-side `resolveProvider(assetRole, tier)`; V1 **low** tier default; operator-only catalog/policy writes; env var **names** in catalog — never secrets) is **aligned with SPEC** Conventions **Provider tiers** table, SPEC §3 Cost Policy Engine / Video Provider Adapter / agent LLM-via-catálogo rules, SPEC §5–§6 (server-only providers, `neuramark_*`, Cliente never sees cost/tier), USER_STORIES § US-X.4, and ADR-0003 (long FFmpeg on Fly — catalog/adapters stay on Vercel server layer). **Cliente never picks a tier**; tier switch is `provider_tier` on `cost_policies` only (Operator override in US-7.1). No ADR breach (no cron, no IG publish, no client-side keys).

**Gaps** are in **partial contract code** (`lib/contracts/providers.ts`, `lib/providers/provider-adapters.ts`, `plan/PROVIDER_TIERS.html`) and **missing DB/migration work** — not in the story’s SPEC intent. Until CONTRACT freezes LLM routing among two low-tier `llm` rows and completes the seed matrix, US-4.1 and US-7.2 cannot satisfy acceptance criteria.

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **High** | **Dual LLM low-tier rows** required by AC (`siliconflow_deepseek` / `siliconflow_qwen`) but `resolveProvider()` returns `candidates[0]` with no disambiguation when multiple active `llm` rows share tier `low`. PROVIDER_TIERS assigns DeepSeek → strategy/caption/QA and Qwen → script package. | USER_STORIES US-X.4 AC; Conventions Provider tiers; SPEC §3 agents “LLM vía catálogo/tier”; PROVIDER_TIERS.html per-asset table | Extend resolver contract: e.g. `capabilities.llmUseCase` (`general` \| `script`) + optional `llmUseCase` on `ResolveProviderContext`, **or** explicit `getCatalogRowByKey(key)` for agents with documented keys in seed. Do not rely on SQL insert order. Freeze in CONTRACT before US-4.1. |
| **Medium** | **`siliconflow_qwen` missing** from `DEFAULT_LOW_TIER_PROVIDER_KEYS` and `plan/PROVIDER_TIERS.html` seed table; only `siliconflow_deepseek_flash` present. | USER_STORIES US-X.4 AC; `lib/contracts/providers.ts` L116–124 | Add `siliconflow_qwen_*` key (exact slug frozen in CONTRACT), seed row `active = true`, adapter stub registration path, and PROVIDER_TIERS.html row. |
| **Medium** | **No DB implementation:** no Supabase migration for `neuramark_provider_catalog` or `neuramark_cost_policies`; no server loader (`getProviderCatalog()` / policy resolver). PHASE-2 integration report confirms expected blocker. | USER_STORIES US-X.4 BE/DB rows; TASKS.md Fase 4; SPEC §5 server-only catalog | Ship migration + seed SQL: all low-tier active rows, high-tier rows `active = false`, global `cost_policies` row (`provider_tier = low`, `max_cost_cents = 150`). Server-only read helper cached or queried per request. |
| **Medium** | **High-tier inactive seeds** in AC (`heygen_high`, `ltx_broll_high`, `elevenlabs_tts_high`) absent from `plan/PROVIDER_TIERS.html` seed table (only `heygen_high` listed). | USER_STORIES US-X.4 AC; SPEC Conventions high-tier column; US-7.2 “ranks only **active** catalog rows” | Seed all three with `active = false`; document in PROVIDER_TIERS.html. Policy engine must never select them while tier is `low`. |
| **Low** | **`cost_model` shape:** AC prose uses `per_run_cents` / `per_second_cents` / `per_clip_cents`; Zod contract uses `billingUnit` + `unitCostCents`. Semantically equivalent but naming diverges. | USER_STORIES US-X.4 AC; US-7.2; `providerCostModelSchema` | CONTRACT adopts Zod shape as canonical JSON stored in DB; map AC prose to `per_run` / `per_second` / `per_clip` billing units. |
| **Low** | **`manual` provider semantics:** AC lists `manual (zero cost)` without tier; PROVIDER_TIERS.html shows `talking_head` / tier “fallback”. Schema requires `tier: low \| high`. | USER_STORIES US-X.4 AC; US-7.2 manual fallback; US-8.3; SPEC §3 Video Provider “upload manual (bypass costo)” | Freeze: `manual` row — `asset_role = talking_head`, `tier = low`, `active = true`, `unitCostCents = 0`; selected only via explicit operator/manual path or policy override, not default `resolveProvider` for normal generation. |
| **Low** | **Provider key naming drift:** AC `siliconflow_wan21` vs code/html `siliconflow_wan21_turbo`; AC `siliconflow_deepseek` vs `siliconflow_deepseek_flash`. | USER_STORIES US-X.4 AC; PROVIDER_TIERS.html | Freeze exact `provider_key` strings in CONTRACT/migration; treat AC as shorthand. |
| **Info** | **V1 low default** correctly specified: global seed `provider_tier = low`, `max_cost_cents = 150` ($1.50/Reel); matches SPEC Conventions economics target. | SPEC Conventions; USER_STORIES US-7.1 AC; US-X.4 BE row | Implement seed; US-7.1 adds Operator UI — out of US-X.4 FE scope (`FE —`). |
| **Info** | **No Cliente tier picker:** FE owner is `—`; tier display/settings deferred to US-7.1 Operator settings. Cliente sessions must never read full catalog or policy writes. | SPEC §3 Cost Policy “Cliente nunca ve/envía costos”; USER_STORIES US-X.4 [SEC] | RLS deny-by-default on catalog/policy tables; no Cliente Route Handler exposes catalog rows. |
| **Info** | **Env var names, not secrets:** `providerCatalogRowSchema.envKeyName` satisfies [SEC] “API vendor keys referenced only by env var names … never stored in catalog rows.” Adapters read `process.env[row.envKeyName]`. | USER_STORIES US-X.4 [SEC]; SPEC §5–§6 secrets server-only; AGENTS.md | Migration must include `env_key_name` column (or JSON field) per row; never seed literal keys. |
| **Info** | **Talking-head alt routing** for MuseTalk when `hasReferenceLoop` is implemented in `resolveProvider()` — aligns with US-7.2 / Conventions generic loop row. | USER_STORIES US-X.4 AC; `provider-adapters.ts` L102–107 | Seed `musetalk_low` with `capabilities.prefersReferenceLoop: true`. |
| **Info** | **Single tier switch in V1:** AC forbids per-asset tier mixing in MVP; matches SPEC Conventions and US-7.2. | USER_STORIES US-X.4 AC; Conventions Provider tiers | `cost_policies.provider_tier` drives all asset roles for a client/global policy. |
| **Info** | **Out of scope held:** concrete vendor adapters (US-8.x), policy engine UI (US-7.1), job polling (US-8.4), Fly worker (ADR-0003), Cliente cost surfaces, RBAC UI, Stories IG, multicanal, ads. | SPEC §1; USER_STORIES Sprint 3/4 split | US-X.4 = catalog seed + resolver + read helpers only. |
| **Info** | **ADRs untouched:** catalog/policy on Vercel Next server; no cron (ADR-0001), no IG (ADR-0002), no FFmpeg on catalog path (ADR-0003). | ADR-0001–0003 | None. |

---

### Terminology violations (CONTEXT)

**None that block** in USER_STORIES § US-X.4.

Technical tokens in code (`talking_head`, `broll`, `faceless`, `provider_tier`, `cost_model`) are acceptable as DB/API enums. Product-facing Operator UI (US-7.1) must use canonical terms:

| Prefer | _Evitar_ |
|--------|----------|
| **Política de costo** | max_cost as loose business concept in UI |
| **Job de generación** | generation job (user-facing EN) |
| **Operator** | admin, administrador, staff |
| **Cliente** | prestador, dueño, usuario final (as product role) |

Note: `plan/PROVIDER_TIERS.html` uses English marketing labels (“Low vs High Tier Models”) — acceptable as internal reference doc, not Cliente UI.

---

### Blockers for SECURITY / CONTRACT

**SPEC blockers:** none on story intent. **One design blocker** must be frozen before US-4.1:

| Item | Blocks? | Guidance |
|------|---------|----------|
| Dual LLM row routing (DeepSeek vs Qwen) | **Yes — US-4.1** | Extend `ResolveProviderContext` or add keyed lookup; document agent→key mapping in CONTRACT. |
| Migration + seed for catalog and global cost policy | **Yes — story AC** | P0; blocks all provider-dependent stories. |
| `siliconflow_qwen` seed + constant | **Yes — AC** | Add to migration and `DEFAULT_LOW_TIER_PROVIDER_KEYS` (or split LLM keys object). |
| High-tier inactive rows | **No — if seeded inactive** | Required for US-7.2 high-tier path later. |
| `envKeyName` / no secrets in DB | **Resolved for SPEC** | SECURITY confirms migration column and adapter env lookup pattern. |
| Operator-only catalog/policy writes; Cliente cannot read full catalog | **Resolved for SPEC** | RLS + no Cliente endpoints; SECURITY freezes. |
| Manual zero-cost row | **No — if CONTRACT frozen** | `unitCostCents: 0`; explicit manual path only (US-8.3). |
| `cost_model` JSON canonical shape | **No** | Freeze Zod-aligned shape in CONTRACT. |

---

### Recommended action

Proceed to **SECURITY.md** and **CONTRACT.md** with these **non-negotiable freezes**:

1. Tables **`neuramark_provider_catalog`** (`key`, `asset_role`, `tier`, `active`, `capabilities` jsonb, `cost_model` jsonb, `env_key_name`) and **`neuramark_cost_policies`** (global default + optional per-`client_id` override later); RLS deny-by-default; `neuramark_*` indexes.
2. **Seed low-tier active:** `siliconflow_deepseek_flash`, `siliconflow_qwen_*`, `siliconflow_cosyvoice2`, `sadtalker_low`, `musetalk_low` (with `prefersReferenceLoop`), `siliconflow_wan21_turbo`, `manual` (zero cost).
3. **Seed high-tier inactive:** `heygen_high`, `ltx_broll_high`, `elevenlabs_tts_high` (`active = false`).
4. **Global cost policy seed:** `provider_tier = low`, `max_cost_cents = 150`.
5. **`resolveProvider(catalog, context)`** + **`getProviderCatalog()`** server-only; extend context for **LLM use-case** or parallel **`resolveProviderByKey(key)`** for agents.
6. **`env_key_name`** per row; adapters read server env only — never persist secrets.
7. Update **`plan/PROVIDER_TIERS.html`** and **`DEFAULT_LOW_TIER_PROVIDER_KEYS`** to match frozen keys including Qwen and high-tier inactive rows.
8. Explicit out of scope: vendor HTTP adapters, Operator settings UI, job execution, Cliente tier/cost UI.

Do not check off USER_STORIES acceptance criteria in this gate.
