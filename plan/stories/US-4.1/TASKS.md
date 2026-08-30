# US-4.1 — Generate weekly Instagram content strategy

**Priority:** P0  
**Depends on:** US-2.3 ✅ · US-3.1 ✅ · US-16.1 ✅ · US-16.2 ✅ · US-X.4 ✅ · US-14.5 ✅ (`requireOperator()`)  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-4.1 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **nextjs-backend** + **nextjs-frontend** + **content-agents-engineer** (`docs/development/AGENT-ROSTER.md` PLAN Fase 3). DB migration under BE. Agent module + brief Zod contract owned by **content-agents-engineer**; Server Actions / persistence under BE.  
**Canonical terms:** **Estrategia semanal** · **brief** · **Formato de Reel** · **Modalidad de producción** · **Táctica de tendencia** · **Operator**. Avoid CONTEXT _Evitar_ list in product-facing copy.

## Out of scope (do not implement here)

- **US-4.2** editable brief fields, **Approve strategy** CTA, `draft` → `approved` transitions, approval metadata, lock-after-scripts rules.
- **Cliente** read-only brief surface (SPEC mentions it; sprint slice is Operator-only — defer).
- **US-5.1+** `neuramark_reel_scripts`, batch/single-slot script generation.
- **US-7.2** policy engine ranking, per-job cost audit log, pre-job budget block.
- **integrations-engineer** weekly cycle auto-trigger (manual Operator generate only).
- Multichannel fields (TikTok, Facebook, etc.) — **Instagram Reels only**.
- In-place UPDATE of an existing brief row on regenerate — **INSERT new version** only.
- DELETE of prior strategy rows (including future `approved` rows).

## Scope split

| Concern | Owner |
|---------|--------|
| `neuramark_content_strategies` table + draft INSERT | **US-4.1** (this story) |
| Content Strategy agent job + brief Zod schema | **US-4.1** (`content-agents-engineer`) |
| Operator generate + read draft brief UI | **US-4.1** |
| Edit brief + approve + status machine | **US-4.2** |
| Video Script per slot | **US-5.1** (requires US-4.2 `approved`) |

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Table name | **`neuramark_content_strategies`** (logical `content_strategies` in USER_STORIES = same with `neuramark_` prefix). |
| Core columns | `id` (uuid PK), `client_id` (FK `neuramark_clients`), `week_start` (date, ISO Monday), `brief` (jsonb), `status` (enum: **`draft` only written in 4.1**; `approved` reserved for US-4.2), `version` (integer ≥ 1), `created_at`, `updated_at`. |
| Versioning | **Monotonic `version` per `(client_id, week_start)`**. First generate → `version = 1`. Each **Generate** / **Regenerate** → **INSERT** new row with `version = max(existing) + 1`, `status = draft`. **Never UPDATE** prior rows' `brief` on regenerate. **Never DELETE** rows (approved history preserved for US-4.2+). |
| Uniqueness | **UNIQUE `(client_id, week_start, version)`**. Operator read loads **latest** row for `(client_id, week_start)` ORDER BY `version` DESC LIMIT 1. |
| `week_start` | ISO week Monday `YYYY-MM-DD`; reuse `trendWeekStartSchema` / Operator week-picker pattern from US-16.2. |
| Brief shape (minimum) | `pillars[]` (string labels, ≥1), `themes[]` (weekly narrative themes), `slots[]` (≥3 Reel slots). Each slot: `slot_index` (0-based), optional `day_of_week`, `tema`, `angle` (optional), `goal` ∈ `{ trust, education, local_sale, inbound_dm }` (map AC "trust, education, local sale, inbound-message (DM) goals"), `formato_playbook_slug`, `modalidad` (`own_avatar` \| `generic_avatar` \| `faceless`), optional `tactica_tendencia_slug`, optional `cta_hint`. **Channel:** implicit Instagram Reels — no multichannel field in V1. |
| Slot validation (server) | `formato_playbook_slug` ∈ active Playbook slugs; `modalidad` ⊆ client `visualModeSummary.allowedModes`; optional `tactica_tendencia_slug` ∈ active trend entries for `week_start` (or null). Reject entire brief if validation fails — **do not persist**. |
| Agent inputs | **`getBusinessProfileForAgents(clientId)`** only — never raw interview / Cliente DTO. Plus **`getPlaybookForAgents()`**, **`getTrendSnapshotForWeek(weekStart)`**, **`getProviderCatalog()`** + **`getDefaultCostPolicy()`**. |
| LLM provider | **`resolveProvider(catalog, { assetRole: 'llm', tier: policy.providerTier, llmVariant: 'default' })`** — low tier default per US-X.4. Keys from `env_key_name` server env only. |
| Generate trigger | Operator-gated **Server Action** `requireOperator("handler")`. **`clientId`** from server-validated client selector (UUID, client row exists) — **not** trusted from anonymous body alone; Operator session required. **`weekStart`** validated Monday ISO. |
| Rate limit | **Per `client_id`**: reject generate if last successful generate for that client was **&lt; 60 seconds** ago (PO lean; CONTRACT may tune window). Return typed error to FE; no LLM call when limited. Applies to regenerate too. |
| Status in 4.1 | All persisted rows **`status = 'draft'`**. No approve endpoint; no `approved` writes. |
| Operator route | **PO lean:** `/operator/strategy` with query or segment for `clientId` + `weekStart` (CONTRACT freezes exact URL). Under `(app)/operator` layout + `requireOperator("page")`. |
| Client selector | Operator picks target **Cliente** from server-loaded list (V1: all active clients or CONTRACT-defined scope). Local dev single-client OK. |
| i18n | EN + ES for Operator UI chrome; brief content may be Spanish-first (match profile locale lean) — CONTRACT defines display rules. |
| Module placement | Agent: `lib/agents/content/strategy/` (or CONTRACT path). Contracts: `lib/contracts/content-strategy.ts`. |
| Prompt containment | Client-authored Ficha text in delimited blocks; trend/playbook text as data; validate LLM JSON against Zod before INSERT; malformed → error to Operator, no partial persist. |
| Identity on row | No `approved_by` / `approved_at` in 4.1 (US-4.2). Optional `created_by` operator client id — **PO lean:** omit in V1 unless SECURITY requires audit. |

## Carry-forwards / reuse (do not reinvent)

- Agent helper imports: `getBusinessProfileForAgents`, `getPlaybookForAgents`, `getTrendSnapshotForWeek`, `getProviderCatalog`, `getDefaultCostPolicy`, `resolveProvider` — **existing modules only**.
- Operator gate: `requireOperator()` from `lib/auth/require-user.ts` (US-14.5).
- Week validation: `trendWeekStartSchema` from `lib/contracts/trend.ts`.
- Modalidad allowlist: `visualModeSummary.allowedModes` from profile helper (US-3.4); reject slot modalidad outside allowlist server-side.
- Migrations: `neuramark_` prefix; RLS deny-by-default; service-role Node only.
- PrimeReact for Operator layout; loading/skeleton during generate.
- `import "server-only"` on agent + helper modules; no Supabase in Client Components.

---

## FE checklist

Concrete BE consumers: generate Server Action; RSC loader for latest draft brief per `(clientId, weekStart)`.

- [x] **Operator Strategy page** (CONTRACT path): client selector + `week_start` picker (ISO Monday).
- [x] **Generate strategy** primary button; disabled while pending; shows rate-limit error from server.
- [x] **Loading / generating** state (skeleton + "Strategy agent running…" or i18n equivalent).
- [x] **Read-only draft brief view** when latest row exists: pillars (chips), themes list, ≥3 Reel slot cards/rows (tema, formato label resolved from slug if CONTRACT provides lookup, modalidad, optional táctica, goal tag).
- [x] **Version indicator** when `version > 1` (e.g. "Draft v2 — regenerated").
- [x] **Empty state** when no strategy for week ("Generate strategy to create a draft").
- [x] **Error state** for agent failure / validation rejection (recoverable message).
- [x] **EN + ES strings** in `messages/en.json` / `es.json`.
- [x] **No Supabase in Client Components**; no edit fields; no Approve button (US-4.2).
- [x] **No Cliente** strategy route in this story.

---

## BE checklist

Concrete FE consumers: Operator Strategy page; future US-4.2/US-5.1 via strategy row id + brief jsonb.

- [x] **Migration** `neuramark_content_strategies` per PO table (CONTRACT freezes indexes, FK, enum type name).
- [x] **Zod schemas** in `lib/contracts/content-strategy.ts`: brief, slot, generate input, persisted row, agent output.
- [x] **`generateContentStrategy({ weekStart })`** Server Action — `requireOperator("handler")`; rate limit; delegates to `generateContentStrategyForClient`.
- [x] **Agent job** `generateWeeklyContentStrategy` (`lib/agents/content/generate-weekly-strategy.ts`): loads helpers via orchestrator; builds prompt; calls LLM adapter; parses + validates output; validates slot refs; **INSERT** new version row `status = draft`.
- [x] **`getLatestContentStrategy({ weekStart })`** Server Action — latest version only; `requireOperator` at action boundary.
- [x] **[SEC] Server-side Zod** on brief before INSERT; reject unknown playbook/trend slugs and disallowed modalidad.
- [x] **[SEC] Rate limit** per `client_id` on generate (CONTRACT: 3/60min + in-flight).
- [x] **[SEC] LLM keys** server env only; never log prompts with secrets; never return raw LLM errors with key material.
- [x] **[SEC] `clientId`** server-resolved from operator session; Operator-only — no Cliente-triggered generate.
- [x] `revalidatePath` for Operator Strategy route after successful generate.
- [x] Automated tests: `lib/content-strategy/content-strategy.test.ts` (32/32 pass).

---

## DB checklist

All objects keep `neuramark_` prefix. Migrations via Supabase migrations only.

- [ ] Create **`neuramark_content_strategies`** per CONTRACT.
- [ ] FK `client_id` → `neuramark_clients(id)`.
- [ ] **UNIQUE** `(client_id, week_start, version)`.
- [ ] Index on `(client_id, week_start, version DESC)` or equivalent for latest-draft query.
- [ ] `status` enum or text check — values include `draft`, `approved` (only `draft` written in 4.1).
- [ ] `brief` jsonb NOT NULL.
- [ ] RLS: zero policies / deny-by-default (match Fase 1 pattern).
- [ ] **Do not** create `neuramark_reel_scripts` (US-5.1).
- [ ] **Do not** add approval columns beyond what US-4.2 needs unless CONTRACT bundles nullable placeholders.

---

## content-agents-engineer checklist

Coordinates with BE on CONTRACT; owns agent logic and brief schema.

- [x] **`lib/contracts/content-strategy.ts`** — brief + slot schemas shared with BE/FE types.
- [x] **Strategy agent module** under `lib/agents/content/` — prompt template with delimited untrusted data blocks.
- [x] Wire **`getBusinessProfileForAgents(clientId)`** — abort with typed error if `exists: false` (orchestrator; agent documents mandatory helper inputs).
- [x] Wire **`getPlaybookForAgents()`**, **`getTrendSnapshotForWeek(weekStart)`** — tolerate empty trend.
- [x] Wire **`getProviderCatalog()`** + **`getDefaultCostPolicy()`** + **`resolveProvider`** for `llm` / `default` (orchestrator resolves provider; agent uses `resolveLlmAdapter`).
- [x] Post-LLM: Zod parse; enforce ≥3 slots; map goals to trust/education/local_sale/inbound_dm coverage per AC.
- [x] **[SEC] Prompt-injection containment** per `plan/SECURITY_BASELINE.md` — no store on validation failure.
- [x] Unit tests: schema rejects bad slug/modalidad; mock LLM returns valid brief; regenerate does not mutate prior version (integration with BE).

---

## Gates (orchestrator)

- [x] SPEC-REVIEW.md (spec-guardian — Strategy vs SPEC §3 Content Strategy Agent; Instagram-only; no US-4.2 scope creep) — 2026-08-30 GAPS; closed in CONTRACT
- [x] SECURITY.md (security-architect — Operator gate; rate limit; prompt containment; server-only agent; no Cliente generate) — 2026-08-29 APPROVE WITH CONDITIONS
- [x] CONTRACT.md authored (nextjs-backend) — 2026-08-30 frozen; **Reviewed by FE:** pending
- [ ] BUILD (FE + BE + DB + content-agents-engineer)
- [ ] VALIDATION.md
- [ ] QA.md

**Status:** CONTRACT (2026-08-30). **Next gate:** FE signoff → BUILD.

---

## Open questions (for SPEC / SECURITY / CONTRACT)

1. **Operator client list scope** — All active `neuramark_clients` vs operator-assigned subset? **PO lean:** all active clients in V1 (single-tenant local dev); CONTRACT confirms query.
2. **Goal coverage AC** — Must ≥3 slots each map to a distinct goal, or only collectively cover the four goals? **PO lean:** ≥3 slots; at least one slot tagged per goal category across the week when possible (agent prompt instruction); CONTRACT defines hard vs soft rule.
3. **Rate limit window** — 60s vs 5 min per client? **PO lean:** 60s debounce for dev; SECURITY may raise for production.
4. **`brief` locale** — Generate in profile `preferredLocale` or fixed ES? **PO lean:** match Cliente `preferredLocale` when present, else `es`.
5. **Async vs sync generate** — Blocking Server Action with long timeout vs job row + poll? **PO lean:** sync Server Action with FE pending state for V1 (≤3 slots single LLM call); CONTRACT confirms timeout.
6. **Empty profile** — Generate allowed when `getBusinessProfileForAgents` returns `exists: false`? **PO lean:** reject with 422 / user-visible "complete onboarding first".
7. **Latest draft when v2 exists** — Show only latest draft in 4.1; history list deferred to US-4.2? **PO lean:** latest only in Operator UI.

No SPEC amendment assumed in PREP: SPEC §3 Content Strategy Agent already defines inputs, slot shape, and `neuramark_content_strategies`. Spec-guardian confirms US-4.2 auto-approve / Cliente read are not pulled into 4.1.
