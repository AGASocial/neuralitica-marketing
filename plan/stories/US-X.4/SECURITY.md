# Security Design Review — US-X.4

**Story:** US-X.4 — Seed provider catalog and tier defaults  
**Date:** 2026-08-29  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-X.4, US-7.1, US-7.2 `[SEC]`), `plan/stories/US-16.1/SECURITY.md` (Operator / RLS pattern), `plan/stories/US-14.5/SECURITY.md` (`requireOperator` floor), `plan/stories/US-2.3/SECURITY.md` (server-only helper pattern), `lib/providers/provider-adapters.ts`, `lib/contracts/providers.ts`, `lib/auth/require-user.ts`, `plan/PROVIDER_TIERS.html`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct: **migration-seeded** global `neuramark_provider_catalog` + default `neuramark_cost_policies` (`provider_tier = low`, `max_cost_cents = 150`), a **server-only** catalog loader + `resolveProvider(assetRole, tier)` used by downstream jobs, **RLS deny-by-default**, **service-role Node only**, **no V1 write endpoints** for catalog or cost policy (changes are SQL/migration only until US-7.1 settings), **`envKeyName` stores env var names never secret values**, and **full catalog rows are not client-readable** (operator views may show resolved provider labels only — UI in US-7.1/7.2).

No REDESIGN. No veto of PO lean defaults (seed keys from `DEFAULT_LOW_TIER_PROVIDER_KEYS` / `PROVIDER_TIERS.html`; high-tier rows seeded `active = false`; global cost policy row; `resolveProvider` in `lib/providers/`; Zod mirrors in `lib/contracts/providers.ts`). Orchestrator may proceed to **CONTRACT.md** after freezing the items below.

**Inherited floors (US-14.5 / Fase 1 — do not weaken):** `requireOperator()` calls `requireActive()` first; role never from request; middleware is convenience; handler-level gates mandatory on any future write surface; RLS enabled with zero named policies; service-role Node only; no `@supabase/supabase-js` in Client Components; no browser Supabase keys.

**This story owns:** `neuramark_provider_catalog` + `neuramark_cost_policies` migrations + seed; server-only `getProviderCatalog()` (CONTRACT exact path); wire `resolveProvider` as server-only; read-time Zod validation of catalog rows; security tests for RLS posture, seed invariants, inactive-row exclusion, envKeyName shape, no client HTTP surface.

**This story does not own:** Operator settings UI or cost-policy write Server Actions (US-7.1); policy engine / job creation (US-7.2, US-8.x, US-9.3); adapter implementations (US-8.1+); LLM/TTS/video spend; Cliente-facing provider picker; catalog CRUD UI; activating high-tier rows (P1 / SQL).

**Terminology:** **Provider catalog** · **Cost policy** · **Provider tier** (`low` \| `high`) · **Asset role** · **Operator** · **Cliente**. Technical names `resolveProvider`, `getProviderCatalog`, `envKeyName` are canonical. Do not use CONTEXT _Evitar_ terms in product-facing docs.

---

### Threat Summary (US-X.4–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **API keys stored in catalog rows** | DB leak → vendor account compromise | `envKeyName` column holds **env var name only** (e.g. `SILICONFLOW_API_KEY`); actual secrets live in server env / Vercel secrets. Migration seed + Zod reject values matching secret patterns (`sk-`, `Bearer`, base64 blobs). **Never** `NEXT_PUBLIC_*` in seed |
| **Full catalog exposed to Cliente** | Margin-sensitive cost models, inactive P1 vendors, env var names aid recon | **No** Cliente read path. **No** Route Handler / Server Action returning full catalog to browser. Downstream operator UI (US-7.1/7.2) may show **resolved provider display name + tier + estimate** only — not full `cost_model` / `capabilities` / `envKeyName` |
| **V1 write endpoints on trusted config** | Cliente or anonymous user swaps vendors, lowers costs, activates expensive rows | **No application write path** in US-X.4 BUILD. Catalog + default cost policy seeded in migration only. Future US-7.1 writes **must** use `requireOperator("handler")` + validated bounds |
| **Client-supplied `provider_key` at job creation** | Force HeyGen/high-tier or unknown adapter; bypass budget | **Out of scope for BUILD** but **binding floor for CONTRACT + US-7.2:** job-creation schemas **must not** accept client-authoritative `provider_key`; server resolves via policy + `resolveProvider`. Document in CONTRACT freeze list |
| **`resolveProvider` / catalog loader in client bundle** | Full catalog + env var names reachable from browser | Catalog loader module **`import "server-only"`**. `resolveProvider` callable only from server orchestration. Never import from `"use client"` trees |
| **Inactive high-tier rows selected** | Silent spend on P1 vendors while tier is `low` | Seed high-tier rows `active = false`. `resolveProvider` filters `row.active === true`. Tests prove inactive rows never returned |
| **Tampered `cost_model` / `capabilities` JSON** | Wrong estimates → margin loss or blocked generation | Treat as **trusted server config** (seed + SQL only in V1). Read-time Zod (`providerCatalogRowSchema` / `providerCostModelSchema`); corrupt rows excluded with codes-only logs — never passed unvalidated to estimators |
| **RLS policy exposing catalog to `authenticated`** | Future browser SDK reads/writes catalog | RLS **enabled, zero policies** on both tables. All access via service-role Node helpers |
| **Service-role on Edge / in Client Components** | Privileged key in browser or middleware bundle | Service-role stays in Node server modules only (match US-14.5) |
| **Logging full catalog jsonb** | Cost structure + env var names in logs | Log **provider keys / asset roles / error codes** only — never full `cost_model`, `capabilities`, or `envKeyName` values in production |

**Residual risk accepted:** Catalog and default cost policy are **global** — all clients share the same vendor mappings in V1. That is product intent. Operator trust model for changes: SQL/migration until US-7.1 ships gated settings. `getProviderCatalog()` trusts **caller** (server orchestration); defense is no browser/HTTP path to it. `envKeyName` in DB reveals which env vars exist server-side — acceptable because values are not stored and Cliente cannot read the column.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| `neuramark_provider_catalog` rows (full) | High — margin config, vendor mapping, env var **names** | Service-role Node; migration seed + SQL only in V1; RLS deny-by-default |
| `cost_model` JSON | High — drives US-7.2 estimates | Trusted config; Zod on read; never client-writable in V1 |
| `capabilities` JSON | Medium — routing hints (`prefersReferenceLoop`, etc.) | Trusted config; Zod on read; server-side only |
| `envKeyName` | Medium — recon aid if leaked; not a secret itself | Env var **name** only; validated at seed; never in Cliente/operator UI responses in full-catalog shape |
| `active` flag | High — gates spend tier | Seed low-tier `true`, high-tier P1 `false`; `resolveProvider` enforces |
| `neuramark_cost_policies` (global default) | High — tier switch + budget cap | Seeded `provider_tier = low`, `max_cost_cents = 150`; no V1 app write; US-7.1 operator writes later |
| Actual API keys (`.env`) | Critical | Server env only; resolved at adapter runtime via `process.env[envKeyName]` — never persisted in DB |
| Service-role key | Critical | Node only; never Client Components or Edge middleware |
| `resolveProvider` output (`ProviderCatalogRow`) | Medium–High — consumed by spend paths | Server-only callers; downstream must not forward full row to browser |

**Boundaries:**

1. **Browser (Cliente or Operator) → Next.js** — Untrusted. **No** Supabase SDK. **No** full catalog API in US-X.4. Cliente has **no** catalog UI. Operator tier/cost display lands in US-7.1 (minimal fields only).
2. **Migration / Operator SQL → Postgres** — Trusted. Seed is versioned migration; post-seed catalog changes are SQL-only until US-7.1.
3. **Trusted server orchestration → `getProviderCatalog()` / `resolveProvider()`** — No session gate inside helpers (mirror US-2.3 / US-16.1 agent path). **No** HTTP. **No** Client Component import.
4. **Postgres → adapters / policy engine (US-7.2+)** — Only through validated catalog loader + `resolveProvider`; never raw table SELECT from adapter modules or Client Components.
5. **Future job creation (US-7.2, US-8.x)** — Server resolves `provider_key` from tier + asset role + policy; client payload **must not** carry authoritative `provider_key`.

---

## Abuse Cases Considered

- *As a malicious actor, I can POST a Server Action to create/update catalog rows or swap `envKeyName` to my API key* → **Blocked:** no write Server Actions or Route Handlers in US-X.4 BUILD. Tables mutated only by migration/SQL.
- *As a Cliente, I can GET `/api/provider-catalog` or call a list action and read cost models and env var names* → **Blocked:** no public catalog read endpoint. BUILD veto if introduced without a gated, minimal-DTO story.
- *As a malicious actor, I can import `getProviderCatalog` or `resolveProvider` in a Client Component* → **Blocked:** catalog loader module uses `import "server-only"`; must not appear in client graphs. CONTRACT should split or annotate `provider-adapters.ts` so resolution path is server-only.
- *As a malicious actor, I seed or smuggle an API key into `cost_model` or `capabilities` via a future write* → **Blocked in V1** (no writes). Seed migration reviewed: no secret-shaped strings. Future US-7.1 operator writes validate bounds only — catalog CRUD remains out of V1.
- *As a malicious actor, I call a future job-creation endpoint with `provider_key: "heygen_high"` to force expensive generation* → **Blocked by binding floor (US-7.2 / CONTRACT):** job input schemas reject or ignore client-supplied `provider_key`; server resolves via policy + active catalog row.
- *As a malicious actor, I activate high-tier rows by UPDATE via anon/authenticated Supabase client* → **Blocked:** RLS deny-by-default; zero policies; no browser Supabase. Changes require service-role Node or Operator SQL.
- *As a malicious actor, I pass `tier: "high"` in a Cliente request to upgrade tier silently* → **Out of US-X.4 BUILD;** `provider_tier` on `cost_policies` is server-resolved (US-7.1). Cliente never sends tier as authority.
- *As a malicious actor, I rely on inactive catalog rows being selected when tier is `low`* → **Blocked:** `resolveProvider` requires `row.active === true`; high-tier seed rows inactive; tests required.
- *As a malicious actor, I tamper `cost_model.billingUnit` to `per_run` with `unitCostCents: 0` via app write* → **Blocked in V1** (no writes). Read-time Zod enforces closed enum + non-negative ints; corrupt rows skipped.
- *As a malicious actor, I add RLS policies so `authenticated` users SELECT the catalog* → **Blocked:** migration enables RLS with **zero** named policies; review rejects policy additions in this story.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-X.4 (and inherited US-7.2 catalog floor) are binding. Items marked **(added)** are new in this review — paste them into the story when the PO next edits USER_STORIES. Do not drop or weaken any existing `[SEC]` line.

**Inherited (still binding — do not weaken adjacent auth paths):**

- [ ] **[SEC] RLS stays enabled with zero policies** on new `neuramark_*` tables; privileged access via Node service-role only *(US-14.5 / Fase 1)*
- [ ] **[SEC] Service-role key is used only from Node server modules** — never Client Components, never Edge middleware, never `NEXT_PUBLIC_*` *(US-14.5)*

**US-X.4 story `[SEC]` (existing):**

- [ ] **[SEC] Catalog and cost policy writes are operator-only; catalog is not client-readable in full (only resolved provider name in operator views)**
- [ ] **[SEC] API vendor keys referenced only by env var names in server config — never stored in catalog rows**

**US-7.2 catalog floor (binding on CONTRACT / downstream — US-X.4 must not undermine):**

- [ ] **[SEC] `provider_catalog.cost_model` and `capabilities` are trusted config maintained server-side only; no endpoint exposes writes to the catalog in V1** *(USER_STORIES.md US-7.2)*
- [ ] **[SEC] `provider_key` for a job is chosen by the server-side policy engine; a client-supplied provider key is never accepted at job creation** *(USER_STORIES.md US-7.2 — future job stories; CONTRACT freeze)*

**Added in this review:**

- [ ] **[SEC] (added) V1 catalog and default cost policy are seeded by migration only** — no Server Action, Route Handler, or dashboard path mutates `neuramark_provider_catalog` or `neuramark_cost_policies` in US-X.4 BUILD. Post-seed changes are Operator SQL or a future gated story (US-7.1 for cost policy)
- [ ] **[SEC] (added) No Cliente-facing read surface for the full catalog** — no list/detail Route Handler or Server Action returning complete rows (`cost_model`, `capabilities`, `envKeyName`) to client sessions. Operator-facing minimal summaries deferred to US-7.1/7.2 with explicit field allowlists
- [ ] **[SEC] (added) `getProviderCatalog()` (CONTRACT exact path) uses `import "server-only"`** and is the **only** application path that SELECTs `neuramark_provider_catalog`. File header: US-4.x, US-7.2, US-8.x, US-9.3, US-10.x **MUST** load catalog through this helper — no direct table SELECT from adapter modules or agent code
- [ ] **[SEC] (added) `resolveProvider(catalog, context)` is invoked only from server modules** (`import "server-only"` on the module that exports it or on the catalog loader that wraps it). Never imported from `"use client"` trees. Filters **`active === true`**, matching `tier` and `assetRole`; throws typed error when no row (caller maps to 503 / operator message — no secret leakage)
- [ ] **[SEC] (added) `envKeyName` column stores env var names only** — seed values must match `^[A-Z][A-Z0-9_]*$` (no `NEXT_PUBLIC_` prefix). Migration + Zod reject secret-shaped strings in `envKeyName`, `cost_model`, and `capabilities`. Runtime key lookup: `process.env[row.envKeyName]` server-side only; missing env → fail closed before vendor call (adapter stories)
- [ ] **[SEC] (added) Read-time Zod validation** on every catalog row loaded (`providerCatalogRowSchema` + `providerCostModelSchema`). Corrupt rows excluded from the in-memory catalog passed to `resolveProvider`; log codes/slugs only
- [ ] **[SEC] (added) High-tier seed rows** (`heygen_high`, `ltx_broll_high`, `elevenlabs_tts_high`, CONTRACT exact) ship with **`active = false`**. Automated test: `resolveProvider(..., { tier: "high", ... })` succeeds only after SQL activation; with default seed, high-tier resolution throws or returns empty candidate set
- [ ] **[SEC] (added) Default global cost policy seed:** one row with `provider_tier = 'low'`, `max_cost_cents = 150`, global scope (CONTRACT exact columns — e.g. `client_id IS NULL`). No per-client override logic in this story
- [ ] **[SEC] (added) Parameterized SQL / Supabase queries only;** service-role Node client; migration enables RLS with **zero** named policies on `neuramark_provider_catalog` and `neuramark_cost_policies`
- [ ] **[SEC] (added) Do not log full jsonb payloads** — log provider `key`, `asset_role`, `tier`, `active`, error codes; never log `envKeyName` values, `cost_model`, or `capabilities` bodies in production
- [ ] **[SEC] (added) CONTRACT job-creation schemas (US-7.2+) must treat `providerKey` as server-derived** — if present in internal types, it is set only after `resolveProvider` / policy engine, never copied from request body. Document forbidden client fields in CONTRACT freeze list
- [ ] **[SEC] (added) Automated security tests cover at least:** both tables RLS enabled + zero policies (migration grep or introspection); seed contains no secret-shaped strings; inactive high-tier rows excluded by `resolveProvider`; `getProviderCatalog` module has `server-only`; no Route Handler exposing catalog (grep/checklist); Zod rejects invalid `cost_model`; default cost policy seed values

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. V1 write surface — **migration seed only** (APPROVE)

| Surface | V1 rule |
|---|---|
| `neuramark_provider_catalog` | INSERT/UPDATE via migration seed only. **No** app write endpoints |
| `neuramark_cost_policies` (global default) | Seeded in migration. **No** app write in US-X.4 (US-7.1 adds Operator-gated settings) |
| Operator SQL | Allowed for emergency catalog activation / cost tweaks (same trust model as `role`) |
| Cliente UI/API | **None** |

Future catalog CRUD requires a **new story** with `requireOperator()` on every mutation — not US-X.4 BUILD.

#### 2. Read surface — **no full catalog to Cliente** (APPROVE WITH CONDITIONS)

| Allowed (downstream) | Forbidden |
|---|---|
| Server-only `getProviderCatalog()` for orchestration | `/api/provider-catalog`, generic REST list |
| Operator UI showing **resolved** provider label + tier + estimate (US-7.1/7.2) | Returning `envKeyName`, full `cost_model`, or raw `capabilities` jsonb to browser |
| Internal adapter use of resolved row server-side | Client Component import of catalog loader |

**Condition:** US-7.1/7.2 CONTRACT must define an explicit **operator minimal DTO** field allowlist — not “return the row”.

#### 3. `envKeyName` — **names only, never secrets** (APPROVE)

| Rule | Detail |
|---|---|
| Column semantics | Name of server env var (e.g. `SILICONFLOW_API_KEY`, `REPLICATE_API_TOKEN`) |
| Forbidden in DB | Literal API keys, `Bearer …`, `sk-…`, base64 secrets, `NEXT_PUBLIC_*` |
| Seed validation | Migration comment + post-seed check script or test scanning seed strings |
| Runtime | Adapters read `process.env[envKeyName]` in Node only (US-8.1+) |

Zod: `envKeyName: z.string().regex(/^[A-Z][A-Z0-9_]+$/)` (adjust if CONTRACT documents exceptions).

#### 4. `resolveProvider` + catalog loader — **server-only** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Loader | `getProviderCatalog(): Promise<readonly ProviderCatalogRow[]>` — loads all active+inactive rows, validates, caches per request or module policy per CONTRACT |
| Resolver | Existing `resolveProvider(catalog, context)` in `lib/providers/provider-adapters.ts` — filters `active`, `tier`, `assetRole`; MuseTalk preference when `hasReferenceLoop` |
| Module boundary | **`import "server-only"`** on loader module. Either move `resolveProvider` there or add `server-only` to `provider-adapters.ts` and ensure FE-safe imports use `lib/contracts/providers.ts` types only |
| HTTP | **Forbidden** for catalog loader and resolver |
| Gate | **No** `requireOperator()` inside loader (trusted server caller — mirror US-2.3) |

**Condition:** CONTRACT must freeze file paths and forbid re-export of loader from FE-safe barrels.

#### 5. Trusted `cost_model` / `capabilities` JSON (APPROVE)

| Field | Rules |
|---|---|
| `cost_model` | Zod `providerCostModelSchema`: closed `billingUnit` enum; `unitCostCents` int ≥ 0; optional `metadata` record — **no** secret keys in metadata |
| `capabilities` | Open record at storage; read through catalog row schema; used only server-side for routing (`prefersReferenceLoop`, etc.) |
| Trust model | Data is **operator/developer trusted config**, not user-generated. V1 integrity = migration + deny writes |

#### 6. RLS — **deny-by-default** (APPROVE)

```sql
ALTER TABLE public.neuramark_provider_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neuramark_cost_policies ENABLE ROW LEVEL SECURITY;
-- Zero named policies → deny-by-default for anon/authenticated roles.
```

Do **not** add `authenticated` SELECT/INSERT/UPDATE policies.

#### 7. Seed inventory — **frozen keys** (APPROVE)

Low-tier active (minimum):

| key | asset_role | tier | active |
|---|---|---|---|
| `siliconflow_deepseek_flash` | `llm` | `low` | `true` |
| `siliconflow_cosyvoice2` | `tts` | `low` | `true` |
| `sadtalker_low` | `talking_head` | `low` | `true` |
| `musetalk_low` | `talking_head` | `low` | `true` (`capabilities.prefersReferenceLoop: true`) |
| `siliconflow_wan21_turbo` | `broll` | `low` | `true` |
| `manual` | `talking_head` | `low` | `true` (zero-cost fallback; CONTRACT exact role/billing) |

High-tier inactive until P1 (minimum):

| key | asset_role | tier | active |
|---|---|---|---|
| `heygen_high` | `talking_head` | `high` | `false` |
| `ltx_broll_high` | `broll` | `high` | `false` |
| `elevenlabs_tts_high` | `tts` | `high` | `false` |

CONTRACT may add LLM high-tier placeholder rows — still `active = false` in V1.

Default cost policy: global row, `provider_tier = 'low'`, `max_cost_cents = 150`.

#### 8. Client cannot supply `provider_key` (APPROVE — CONTRACT freeze for downstream)

US-X.4 does not implement job creation. **Binding for CONTRACT and US-7.2+:**

- Job-creation Route Handlers / Server Actions **must not** accept client-authoritative `provider_key` / `providerKey`.
- Internal pipeline sets `providerKey` only after server-side tier resolution + `resolveProvider`.
- Zod input schemas for user-facing job starts **omit** `providerKey` or strip/ignore it if smuggled.

---

## Future-Proofing Notes

- **US-7.1** adds Operator settings for `max_cost_cents` and `provider_tier` — every write **must** use `requireOperator("handler")` + validated positive integer bounds. Still **no** catalog row CRUD in V1 unless a dedicated story is opened.
- **US-7.2** policy engine **must** load catalog via `getProviderCatalog()` and assign `provider_key` server-side; log decision tuple (tier, asset role, provider_key, estimate) without logging full `cost_model`.
- **US-8.x / US-9.3 / US-4.x** adapters receive `providerKey` from resolved catalog row, not from client input. Registry lookup server-side only.
- **Multi-tenancy:** per-client cost policy overrides may add rows with `client_id` in US-7.1 — catalog remains **global**. Do not add `client_id` to `neuramark_provider_catalog` without SECURITY review.
- **Auth:** when real sessions land everywhere, catalog loader behavior unchanged — deny-by-default RLS + service-role Node. No browser Supabase path.
- **Do not** expose catalog as a generic REST resource — recreates gate bypass and leaks `envKeyName` / cost structure.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-X.4/CONTRACT.md` exists, spot-check before BUILD:

- [ ] Table DDL frozen: `neuramark_provider_catalog`, `neuramark_cost_policies` columns, indexes, UNIQUE constraints on `key`
- [ ] RLS enabled, **zero** policies on both tables
- [ ] Seed rows + default cost policy frozen (keys, `active`, `cost_model` shapes, `envKeyName` names)
- [ ] `getProviderCatalog()` path, return type, caching strategy, Zod validation behavior on corrupt rows
- [ ] `resolveProvider` signature, filter rules (`active`, tier, asset role, loop preference), error mapping
- [ ] **`import "server-only"`** module boundaries documented; FE imports types from `lib/contracts/providers.ts` only
- [ ] **No** write Server Actions / Route Handlers in scope
- [ ] **No** Cliente catalog read API
- [ ] Operator minimal DTO deferred to US-7.1/7.2 with field allowlist called out as out-of-scope here
- [ ] **`providerKey` not client-authoritative** — documented for downstream job schemas
- [ ] `envKeyName` regex / forbidden patterns
- [ ] Out of scope: adapters, policy engine UI, job creation, LLM/TTS/video spend, catalog CRUD, high-tier activation

---

## CONTRACT freeze list (binding summary)

1. **Writes:** Migration seed only — **no** application endpoints mutating catalog or default cost policy in US-X.4.
2. **Reads:** `getProviderCatalog()` server-only — **no** full catalog to Cliente; operator summaries minimal (US-7.1+).
3. **Resolver:** `resolveProvider` server-only; **`active === true`** required; inactive high-tier seed excluded.
4. **Secrets:** `envKeyName` = env var **name** only; API keys in server env; never in DB jsonb or catalog columns.
5. **Trust:** `cost_model` + `capabilities` = trusted server config; Zod on read; no V1 client writes.
6. **DB:** RLS deny-by-default; service-role Node only; parameterized queries; no full jsonb logging.
7. **Jobs (downstream):** Client **cannot** supply authoritative `provider_key` — server resolves via tier + policy + catalog.
8. **Module:** `import "server-only"` on catalog loader; types/schemas in `lib/contracts/providers.ts` for FE-safe sharing.
9. **Seed:** Low-tier keys active; high-tier P1 keys inactive; global cost policy `low` / `150` cents.
10. **Out of scope:** US-7.1 settings UI, US-7.2 engine, adapters, spend endpoints, catalog CRUD.

---

## BUILD vetoes (summary)

1. **Server Action or Route Handler that writes catalog or cost policy** without a new gated story (US-X.4 BUILD has **none**).
2. **Public or Cliente-authenticated endpoint returning full catalog rows** (`envKeyName`, `cost_model`, `capabilities`).
3. **`getProviderCatalog` or `resolveProvider` imported from Client Components** or missing `server-only`.
4. **API key or secret-shaped string in migration seed** (column values or jsonb).
5. **`envKeyName` values using `NEXT_PUBLIC_` or storing literal secrets**.
6. **RLS policies granting `authenticated` access** to catalog or cost policy tables.
7. **Browser Supabase / service-role in Client Components**; service-role on Edge middleware.
8. **Job-creation input accepting client `provider_key`** introduced under US-X.4 scope (belongs to US-7.2+ but veto if smuggled in early).
9. **High-tier seed rows shipped `active = true`** by default.
10. **Direct `neuramark_provider_catalog` SELECT from adapter modules** bypassing `getProviderCatalog()`.

---

## Open questions — SECURITY resolutions

| # | Question | Resolution |
|---|---|---|
| 1 | Catalog CRUD in V1? | **No.** Migration seed + SQL only. Operator UI for cost policy in US-7.1; catalog activation via SQL/P1 story |
| 2 | Where does `resolveProvider` live? | **APPROVE** existing function in `lib/providers/provider-adapters.ts` **with** server-only boundary enforced via loader module or file-level `server-only` + FE uses `lib/contracts/providers.ts` only |
| 3 | Can Cliente see which LLM vendor we use? | **Not full catalog.** Operator views may show resolved friendly name (US-7.2 read-only). No `envKeyName` or cost model to Cliente |
| 4 | Per-client tier override? | **Cost policy table** may gain `client_id` rows in US-7.1. Catalog stays global. US-X.4 seeds **global default only** |
| 5 | `manual` provider billing | **Zero cost** in `cost_model`; trusted fallback — CONTRACT exact `billingUnit` / `unitCostCents: 0` |

---

## Recommended action

**APPROVE WITH CONDITIONS.** Proceed to **CONTRACT.md** (nextjs-backend). Binding floors above must appear in CONTRACT before BUILD. No FE signoff required (no FE scope). Downstream stories (US-7.1, US-7.2, US-4.1+) inherit the **no client `provider_key`** and **server-only catalog loader** floors.
