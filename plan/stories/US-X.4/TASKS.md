# US-X.4 — Seed provider catalog and tier defaults

**Priority:** P0  
**Depends on:** US-X.3 ✅ · US-14.5 ✅ (`requireOperator()` carry-forward for future writes)  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-X.4 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **nextjs-backend** only (`docs/development/AGENT-ROSTER.md`). No FE work this story (operator tier display is **US-7.1**). DB migration under BE. Downstream agents (content-agents-engineer, media-pipeline-engineer) consume `getProviderCatalog()` only — they do not own this migration.  
**Canonical terms:** **provider catalog** · **provider tier** · **asset role** · **provider key** · **cost model**.

## Out of scope (do not implement here)

- **US-7.1** Operator settings UI (max cost, tier display, per-client override UI).
- **US-7.2** Policy engine (visual-mode routing, cheapest-active ranking, job audit log).
- **US-8.x** Concrete vendor adapters (SadTalker, Wan, CosyVoice, HeyGen, ElevenLabs, LTX).
- **US-4.1+** Content Strategy / Script / Caption LLM jobs.
- **Catalog or cost-policy write endpoints** in V1 (seed + SQL activation only; US-7.2 [SEC]).
- **Cliente-facing provider details** (operator views show resolved name later — US-7.1/7.2).
- **FE routes, PrimeReact, i18n** — empty FE column in USER_STORIES.

## Scope split

| Concern | Owner |
|---------|--------|
| Catalog table + tier seed rows | **US-X.4** (this story) |
| Global default cost policy seed | **US-X.4** (this story) |
| Operator budget/tier settings UI | **US-7.1** |
| Policy engine + job provider selection | **US-7.2** |
| Vendor adapter implementations | **US-8.x** |

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Table names | **`neuramark_provider_catalog`** and **`neuramark_cost_policies`** (logical `provider_catalog` / `cost_policies` in USER_STORIES = same with `neuramark_` prefix). |
| Seed keys (low tier) | MUST match `DEFAULT_LOW_TIER_PROVIDER_KEYS` in `lib/contracts/providers.ts`: `siliconflow_deepseek_flash` (llm), `siliconflow_cosyvoice2` (tts), `sadtalker_low` (talking_head), `musetalk_low` (talking_head alt / `prefersReferenceLoop`), `siliconflow_wan21_turbo` (broll), `manual` (zero-cost fallback). |
| Additional llm row | AC requires **siliconflow_deepseek / siliconflow_qwen** — seed **`siliconflow_qwen`** as second active `llm` low row (CONTRACT freezes cost_model and default pick order; primary default remains `siliconflow_deepseek_flash`). |
| High-tier seed rows | **`heygen_high`**, **`ltx_broll_high`**, **`elevenlabs_tts_high`** — present in catalog with `active = false` until P1; `resolveProvider()` and US-7.2 must never select inactive rows. |
| Global cost policy | One global row: **`provider_tier = low`**, **`max_cost_cents = 150`** ($1.50/Reel per Conventions economics target). `client_id` **NULL** = global default; per-client overrides deferred to US-7.1. |
| Tier switch (V1) | **`provider_tier` on `cost_policies`** is the only tier switch in MVP — no per-asset tier mixing. |
| `cost_model` JSON | Each catalog row stores `cost_model` sufficient for US-7.2 estimates — map to `providerCostModelSchema` (`billingUnit`: `per_run` \| `per_second` \| `per_clip` \| `per_1m_tokens` \| `per_1m_chars`; `unitCostCents`). `manual` uses zero cost. |
| `envKeyName` | Catalog rows reference **env var names only** (e.g. `SILICONFLOW_API_KEY`) — never store secret values in DB ([SEC] USER_STORIES). |
| Resolver | **Reuse** existing `resolveProvider(catalog, context)` in `lib/providers/provider-adapters.ts` — load catalog via `getProviderCatalog()`, pass array in. No second resolver implementation. |
| Agent helper | **`getProviderCatalog()`** — server-only module (mirror `getPlaybookForAgents()`): `import "server-only"`, Supabase SELECT, Zod validate rows, return `{ providers: ProviderCatalogRow[], loadFailed?: boolean }`. Trusted server jobs only; no session gate on read (same as Playbook helper). |
| Cost policy helper | **PO lean:** `getDefaultCostPolicy()` in same server module (or combined DTO) — CONTRACT freezes name and shape. |
| Writes (future) | No catalog/cost-policy write API in this story. When US-7.1 adds mutations, **`requireOperator("handler")`** on every write (US-14.5 carry-forward). |
| RLS | Deny-by-default; service-role Node only (match Fase 1 / US-16.1 pattern). |
| `manual` row | `active = true`, zero `unitCostCents`, asset role per `plan/PROVIDER_TIERS.html` (`talking_head`); capabilities flag as operator/upload fallback. |

## Carry-forwards / reuse (do not reinvent)

- **Resolver:** `resolveProvider()` in `lib/providers/provider-adapters.ts` — already handles `talking_head` + `hasReferenceLoop` → MuseTalk preference.
- **Zod:** `providerCatalogRowSchema`, `providerTierSchema`, `assetRoleSchema` from `lib/contracts/providers.ts`.
- **Agent helper pattern:** `lib/playbook/get-playbook-for-agents.ts` — soft `loadFailed`, no Client Component imports, parameterized Supabase query.
- **Operator gate (future writes):** `requireOperator()` from `lib/auth/require-user.ts` (US-14.5) — not needed for read-only seed story, but mandatory for any mutation added in US-7.1+.
- **Migrations:** `neuramark_` prefix; Supabase migrations only; no ad-hoc dashboard edits.

---

## FE checklist

**No FE work in US-X.4.** Operator tier display and budget settings are **US-7.1**.

- [ ] *(intentionally empty — do not add Operator UI or client-facing provider screens in this story)*

---

## BE checklist

Concrete consumers: US-4.1 / US-7.2 / US-8.x / US-9.3 / US-10.1 via `getProviderCatalog()` + `resolveProvider()` only.

- [x] **Migration** `neuramark_provider_catalog` (CONTRACT freezes columns: `key` UNIQUE, `asset_role`, `tier`, `active`, `capabilities` jsonb, `cost_model` jsonb, `env_key_name`, timestamps).
- [x] **Migration** `neuramark_cost_policies` (CONTRACT freezes: nullable `client_id` FK, `provider_tier`, `max_cost_cents`, optional `rules` jsonb, timestamps; UNIQUE partial index or constraint for one global row when `client_id IS NULL`).
- [x] **Seed migration** — low-tier active rows per PO table above; high-tier inactive rows (`heygen_high`, `ltx_broll_high`, `elevenlabs_tts_high`); global cost policy (`low`, `150`).
- [x] **`getProviderCatalog()`** server-only helper: validated `ProviderCatalogRow[]`; active + inactive rows returned (callers filter via `resolveProvider`); soft failure when Supabase unconfigured.
- [x] **`getDefaultCostPolicy()`** (or CONTRACT-named equivalent): returns global default tier + cap.
- [x] **Wire tests:** seed keys match `DEFAULT_LOW_TIER_PROVIDER_KEYS`; `resolveProvider()` picks expected low-tier row per asset role; inactive high-tier rows excluded; `musetalk_low` preferred when `hasReferenceLoop`; `manual` zero cost.
- [x] **[SEC]** No catalog write endpoints; no client-readable full catalog API.
- [x] **[SEC]** `env_key_name` only — no API key material in rows or logs.
- [x] **[SEC]** Document that future catalog/policy mutations MUST use `requireOperator("handler")`.
- [x] Parameterized queries; service-role Node only.

---

## DB checklist

All objects keep `neuramark_` prefix. Migrations via Supabase migrations only.

- [x] Create **`neuramark_provider_catalog`** per CONTRACT.
- [x] Create **`neuramark_cost_policies`** per CONTRACT.
- [x] UNIQUE on `neuramark_provider_catalog.key`.
- [x] Index on `(asset_role, tier, active)` if needed for policy queries (CONTRACT confirms).
- [x] **Seed** all V1 catalog rows (low active + high inactive + `manual`).
- [x] **Seed** global cost policy: `provider_tier = low`, `max_cost_cents = 150`, `client_id IS NULL`.
- [x] RLS: zero policies / deny-by-default (match Fase 1 pattern).
- [x] **Do not** create vendor job tables, adapter registry tables, or Operator settings UI tables here.

---

## Gates (orchestrator)

- [x] SPEC-REVIEW.md (spec-guardian — catalog vs SPEC §3 Cost Policy; seed economics; no FE scope creep) — ALIGNED
- [x] SECURITY.md (security-architect — no client catalog exposure; env var names only; operator-only future writes; server-only helper) — APPROVE WITH CONDITIONS
- [x] CONTRACT.md authored (nextjs-backend) + FE signoff *(N/A waived — BE-only story; CONTRACT notes "Reviewed by FE: N/A — 2026-08-29")*
- [x] BUILD (nextjs-backend — migrations + helpers + tests) — BE `5ba9876`
- [x] VALIDATION.md — PASS WITH NOTES
- [x] QA.md — APPROVE WITH NOTES (0 Critical, 0 High, 1 Medium, 2 Low; CLOSE yes)

**Status:** CLOSED (2026-08-29). All gates complete; AC checked in `plan/USER_STORIES.md`. **Next:** **US-4.1** Content Strategy (Sprint 3).

---

## Open questions (for SPEC / SECURITY / CONTRACT)

1. **Column naming** — snake_case DB (`asset_role`, `cost_model`, `env_key_name`) vs camelCase in TS DTO? **PO lean:** snake_case in Postgres; map to `ProviderCatalogRow` camelCase in helper (match Playbook pattern).
2. **`siliconflow_qwen` cost_model** — Same billing unit as DeepSeek or separate `per_1m_tokens`? **PO lean:** both `per_1m_tokens`; CONTRACT freezes placeholder cents for estimates.
3. **`manual` asset_role** — `talking_head` only or cross-role? **PO lean:** `talking_head` per PROVIDER_TIERS.html; zero-cost escape hatch for US-8.3.
4. **High-tier asset_role mapping** — `heygen_high` → `talking_head`, `ltx_broll_high` → `broll`, `elevenlabs_tts_high` → `tts`. **PO lean:** freeze in CONTRACT seed fixture.
5. **`capabilities` for MuseTalk** — `prefersReferenceLoop: true` on `musetalk_low` row? **PO lean:** yes — required for existing `resolveProvider()` branch.
6. **Combined vs split helpers** — Single `getProviderContextForJobs()` vs separate catalog + policy helpers? **PO lean:** separate `getProviderCatalog()` + `getDefaultCostPolicy()`; US-7.2 composes.

No SPEC amendment assumed in PREP: Conventions **Provider tiers** table and US-X.4 USER_STORIES AC already define seed scope. Spec-guardian confirms alignment with TASKS.md Fase 3 checklist.
