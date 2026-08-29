# Security Design Review — US-16.2

**Story:** US-16.2 — Publish weekly trend snapshot (manual)  
**Date:** 2026-08-29  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-16.2, all `[SEC]`), `plan/stories/US-16.2/TASKS.md`, `plan/stories/US-16.2/README.md`, `SPEC.md` §3 Trend Intelligence, `plan/stories/US-16.1/SECURITY.md` + `CONTRACT.md` (Playbook slug validation, agent-helper pattern), `plan/stories/US-14.5/SECURITY.md` (`requireOperator` floor), `plan/stories/US-2.3/SECURITY.md` (trusted-caller agent helper), `lib/playbook/get-playbook-for-agents.ts`, `lib/auth/require-user.ts`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct and SPEC-aligned: a **global Operator-curated** weekly **Snapshot de tendencias** in `neuramark_trend_snapshots` (no `client_id` in V1), **Operator-gated** Server Actions for publish/update snapshot and entry CRUD within a week, **slug immutability** after create within a snapshot, **soft deactivate** (`activo = false`) not hard delete, **Zod `.strict()`** on every write, **`fuente` forced to `manual`** in V1 writes, **`prioridad_semana` bounded 1–5**, **`week_start` normalized to ISO Monday** server-side, Playbook cross-validation via **`getPlaybookForAgents()` only**, and a **server-only** `getTrendSnapshotForWeek(weekStart)` that returns **`activo = true` entries only** with **`ejemplo_referencia` stripped**. RLS stays **deny-by-default** (zero policies); all DB access via service-role Node. **No public CRUD Route Handler** — no HTTP surface for snapshot mutation or agent reads.

No REDESIGN. No veto of PO lean defaults (jsonb `entries` + Zod; one row per `week_start`; upsert semantics; `/operator/trends`; fixed seed `week_start`; entry slug unique within snapshot only; reuse Playbook enums; strict `{ cold_open, total }` duration object; monolingual ES seed content). Orchestrator may proceed to **CONTRACT.md** after freezing the items below.

**Inherited floors (US-14.5 / US-16.1 / Fase 1 — do not weaken):** `requireOperator()` calls `requireActive()` first; role never from request; middleware is convenience; handler-level gates mandatory; RLS enabled with zero named policies; service-role Node only; no `@supabase/supabase-js` in Client Components; no browser Supabase keys; Playbook slug validation imports `getPlaybookForAgents()` — never direct `neuramark_content_playbooks` SELECT from Trend modules.

**This story owns:** `neuramark_trend_snapshots` migration + seed (`cold-open-mejor-toma`); Operator Trend Server Actions + RSC loaders; Zod create/update/read/agent DTO schemas; `getTrendSnapshotForWeek(weekStart)` server-only helper; security tests for operator gate, slug rules, Playbook slug rejection, deactivate exclusion, DTO strip, `fuente`/`week_start` enforcement.

**This story does not own:** Content Strategy / Script / Caption LLM jobs (US-4.x+); Trend scraping agent or auto-activation; Cliente read UI for Trend; per-client Trend overrides; prompt-injection containment at LLM call time (deferred — storage treated as untrusted input for downstream); auth redesign; Playbook CRUD changes beyond import for slug validation.

**Terminology:** **Snapshot de tendencias** · **Táctica de tendencia** · **Operator** · **Playbook de formatos** (reference only). Technical helper name `getTrendSnapshotForWeek` is canonical. Do not use CONTEXT _Evitar_ terms in product-facing docs.

---

### Threat Summary (US-16.2–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Non-operator publish/edit/deactivate of Trend snapshots** | Cliente or anonymous user curates global LLM fuel, reads internal reference URLs | Every Operator list/detail loader and **every mutation** calls `requireOperator("page" \| "handler")` before side effects. Cliente has **no** read path in V1 |
| **Public `/api/…` CRUD without gate** | Unauthenticated or client-role snapshot tampering | **No** public Route Handler for Trend CRUD. Server Actions only, each gated. `getTrendSnapshotForWeek` is **not** exposed as HTTP |
| **`ejemplo_referencia` / Operator-only fields leak to browser or agents** | Internal URLs/notes in client bundle or LLM context | Operator read DTO may include `ejemplo_referencia` for edit forms (Operator session only). **Agent DTO and any Cliente-facing shape must omit it.** Zod agent schema excludes the key; tests prove strip |
| **`getTrendSnapshotForWeek` in client bundle** | Full weekly tácticas + hints reachable from browser | Module **`import "server-only"`**. Never import from `"use client"` trees. Only trusted server orchestration / future agent jobs |
| **Mass assignment / extra JSON keys on write** | Attacker injects privileged fields (`fuente: scraping`, `activo` override, forged `week_start`) | Zod **`.strict()`** on snapshot/entry create/update; reject unknown keys server-side. **`fuente` server-set to `manual`** in V1 — client cannot set `scraping` / `operator_review` |
| **Slug mutation after create** | Breaks `tactica_tendencia_slug` references from Strategy slots | Update handler **rejects** slug changes within snapshot; duplicate slug within same `week_start` rejected on create |
| **Invalid Playbook cross-references** | Strategy attaches táctica to incompatible or archived formato | **`formatos_playbook_compatibles[]`** validated on write against **active** slugs from `getPlaybookForAgents()`; unknown/archived slugs → validation error, no write |
| **Non-Monday `week_start` / date injection** | Snapshot keyed wrong week; agent reads wrong tácticas | Server normalizes/rejects non-Monday dates; Zod date schema; UNIQUE on `week_start` |
| **`prioridad_semana` out of range** | Agent ordering bugs or DoS via huge integers | Zod bounds **1–5 inclusive** on every write |
| **Hard delete of entry history** | Audit loss; orphaned strategy references | **Soft deactivate only** (`activo: false`); no entry DELETE in V1 |
| **Fake `client_id` on global snapshot** | Future tenancy confusion, IDOR footgun | **No `client_id` column** in V1. CONTRACT must not add tenant args to Trend mutations. Global snapshot by design |
| **RLS policy that exposes rows to `authenticated`** | Browser SDK could read/write snapshots if added later | RLS **enabled, zero policies** — match Fase 1 / US-16.1. Do not add `authenticated` SELECT/INSERT policies |
| **Corrupt seed / jsonb without read validation** | Agents consume malformed hints | Read-time Zod on Operator load and agent helper; corrupt entries excluded from agent DTO with safe logging (codes only) |
| **Prompt injection via stored hints** | Operator-entered `guion_hints` / `editing_hints` steer LLM later | **Accepted residual for storage story.** Hints are untrusted **data** at LLM time; delimiter + output schema validation lands US-4.x+. Do not execute or HTML-render hint text in Operator UI |
| **Logging full payloads** | Business/strategy text in logs | Log **codes / slugs / weekStart** only — never full jsonb bodies in production |
| **Scraping pipeline smuggled into V1** | Unreviewed external content enters agent fuel | **No** scraping agent, cron, or write path for `fuente !== manual` in V1 BUILD |

**Residual risk accepted:** Trend snapshots are **global** — all clients share the same weekly tácticas in V1. That is product intent, not a leak. Operator trust model: anyone with `role = operator` can edit global snapshots (SQL-promoted only). `getTrendSnapshotForWeek()` trusts **caller** (server orchestration); defense is no browser/HTTP path to it. Inactive entries remain in jsonb for Operator history but are excluded from agent DTO.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| `neuramark_trend_snapshots` rows (full `entries` payload) | Medium — shapes weekly Reel tactics for all clients via agents | Service-role Node; Operator CRUD only; RLS deny-by-default |
| `ejemplo_referencia` (per entry) | Medium — internal URL/notes, Operator eyes only | Operator edit/read responses only; **never** agent DTO or Cliente |
| Entry `slug` | High — stable foreign key for US-4.1 / US-5.1 (`tactica_tendencia_slug`) | Immutable after create within snapshot; unique per `(week_start, entries[])`; may repeat across different weeks |
| `week_start` | Medium — partition key for weekly agent reads | ISO Monday `date`; server-validated; UNIQUE per row |
| `guion_hints`, `editing_hints`, `estructura`, `explicacion` | Medium — **LLM fuel** (untrusted at prompt time) | Stored by Operator; consumed server-side via `getTrendSnapshotForWeek()` only |
| `formatos_playbook_compatibles[]` | Medium — cross-module integrity | Validated on write via `getPlaybookForAgents()` active slugs only |
| `fuente` | Low–Medium — provenance / future scraping gate | V1 writes **`manual` only**; enum reserved for fase posterior |
| `prioridad_semana` | Low — ordering hint for Strategy | Integer 1–5; server-bounded |
| Service-role key | Critical | Node only; never Client Components or Edge middleware |
| Operator session | High — can mutate global weekly tactics | `requireOperator()` on every Operator surface and mutation |

**Boundaries:**

1. **Browser (Cliente or Operator) → Next.js Server Actions / RSC** — Untrusted. No Supabase SDK. Operator UI calls gated Server Actions only. Cliente has **no** Trend UI/API in V1.
2. **Operator RSC / Server Actions → Postgres** — After `requireOperator()`. Parameterized queries; service-role; jsonb validated with Zod `.strict()` before write; Playbook slugs validated via `getPlaybookForAgents()`.
3. **Trusted server orchestration → `getTrendSnapshotForWeek(weekStart)`** — No session gate inside helper (mirror US-2.3 / US-16.1). **No** HTTP. **No** Client Component import. Returns `activo = true` entries only; strips Operator-only fields; safe empty when no row.
4. **Postgres → agents (future US-4.x+)** — Only through `getTrendSnapshotForWeek()` validated DTO — never raw table SELECT from agent modules.
5. **Trend write path → Playbook catalog** — Read-only via `getPlaybookForAgents()` for slug allowlist; no Trend module writes Playbook rows.

---

## Abuse Cases Considered

- *As a malicious actor, I can POST a Trend Server Action without an Operator session and publish/edit/deactivate tácticas* → **Blocked:** every mutation starts with `requireOperator("handler")`; 401/403, **no side effects**.
- *As a Cliente, I can open `/operator/trends` or call list/detail/publish actions* → **Blocked:** RSC loader uses `requireOperator("page")` → 403; handlers return 403. UI hiding is not sufficient — handler gate is mandatory.
- *As a malicious actor, I can `GET /api/trends` or `/api/trend-snapshots/[weekStart]` to read or mutate snapshots* → **Blocked:** no public CRUD Route Handler. BUILD veto if introduced without a new gated story.
- *As a malicious actor, I can import `getTrendSnapshotForWeek` in a Client Component and pull weekly tácticas* → **Blocked:** `import "server-only"`; must not appear in client graphs.
- *As a malicious actor, I send extra JSON keys (`client_id`, `fuente: scraping`, `activo: true` override, `published_at`) in a publish/update body* → **Blocked:** Zod `.strict()` rejects unknown keys; **`fuente` forced server-side to `manual`** in V1; timestamps server-owned.
- *As a malicious actor, I change entry `slug` on update to hijack Strategy slot references* → **Blocked:** update handler ignores/rejects slug changes; slug not in update schema.
- *As a malicious actor, I reference archived or fake Playbook slugs in `formatos_playbook_compatibles[]`* → **Blocked:** write-time validation against active slugs from `getPlaybookForAgents()`; reject unknown slugs.
- *As a malicious actor, I publish a snapshot with `prioridad_semana` of 0, 6, or 999* → **Blocked:** Zod bounds 1–5 on every write.
- *As a malicious actor, I use a non-Monday `week_start` to corrupt weekly partitioning* → **Blocked:** server rejects or normalizes to ISO Monday per CONTRACT; Zod date validation.
- *As a malicious actor, I hard-delete tácticas to disrupt production or erase audit trail* → **Blocked:** no DELETE path in V1; deactivate only (`activo: false`).
- *As a malicious actor, I read `ejemplo_referencia` via agent DTO or a Cliente-facing API* → **Blocked:** agent Zod schema omits field; automated test proves absence; no Cliente read path.
- *As a malicious actor, I inject `client_id` to create tenant-specific snapshots and IDOR later* → **Blocked:** no `client_id` column; mutations do not accept tenant args.
- *As a malicious actor, I add RLS policies so `authenticated` users SELECT snapshots via a future browser SDK* → **Blocked:** zero policies; service-role only. Review migration for policy absence.
- *As a malicious actor, I smuggle `fuente: scraping` to bypass Operator review (fase posterior)* → **Blocked:** V1 write handlers set/force `manual`; reject or strip client-supplied non-manual values.
- *As a malicious actor, I enumerate all historical weeks via an unauthenticated API* → **Blocked:** week list is Operator-gated RSC/Server Action only in V1.
- *As a malicious Operator, I store XSS payloads in `titulo` / hints* → **Mitigated:** render as plain text in Operator UI (no `dangerouslySetInnerHTML`); hints are not HTML at storage time.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-16.2 are binding. Items marked **(added)** are new in this review — paste them into the story when the PO next edits USER_STORIES. Do not drop or weaken any existing `[SEC]` line.

**Inherited (still binding — do not weaken adjacent auth paths):**

- [ ] **[SEC] Every operator-only gate lives inside the Server Action / Route Handler itself** as `requireOperator()` on the `getCurrentUser()` result; middleware and UI hiding are convenience only *(US-14.5)*
- [ ] **[SEC] `requireOperator()` runs `requireActive()` first** — inactive operator has no access *(US-14.5)*
- [ ] **[SEC] RLS stays enabled with zero policies** on new `neuramark_*` tables; privileged access via Node service-role only *(US-14.5 / Fase 1)*

**US-16.2 story `[SEC]` (existing):**

- [ ] **[SEC] Snapshot and entry payloads re-validated server-side on every write (Zod); `prioridad_semana` bounded 1–5**
- [ ] **[SEC] `getTrendSnapshotForWeek()` is server-only and is the only path agents use to read trend data; no scraping agent or auto-activation in V1**
- [ ] **[SEC] Operator-only reference fields (`ejemplo_referencia`) never appear in client-session responses or agent DTOs**
- [ ] **[SEC] Trend data is treated as untrusted input when later injected into LLM prompts (storage story only — prompt containment verified in US-4.1+)**

**Added in this review:**

- [ ] **[SEC] (added) Every Trend mutation Server Action** (`publishOrUpdateSnapshot`, `addEntry`, `updateEntry`, `deactivateEntry` — CONTRACT names) calls `requireOperator("handler")` as its **first** await before validation or DB I/O; failure → 401/403, **no side effects**
- [ ] **[SEC] (added) Operator Trend RSC loaders** (week list + week detail/editor) call `requireOperator("page")` before loading rows; Cliente sessions receive **403**, not an empty snapshot masquerading as auth success
- [ ] **[SEC] (added) No public Route Handler** for Trend list/get/publish/update/entry CRUD or for `getTrendSnapshotForWeek` by HTTP. If a Route Handler is added for export/debug, it is a **new story** with explicit Operator gate — not in US-16.2 BUILD
- [ ] **[SEC] (added) Create/update input schemas use Zod `.strict()`** — unknown keys rejected. Separate schemas for entry create vs update (update must not accept `slug`). Closed enums reused from Playbook contract where applicable (`hook_type`, `rubros`, `modalidades_recomendadas`)
- [ ] **[SEC] (added) Entry `slug` immutable after create within snapshot:** update handler rejects slug changes even if smuggled in body; duplicate slug within same `week_start` rejected server-side
- [ ] **[SEC] (added) Soft deactivate only:** no hard DELETE of entries or snapshot rows in application code; `activo: false` entries excluded from `getTrendSnapshotForWeek()` but remain in stored jsonb for Operator history
- [ ] **[SEC] (added) Global snapshot — no `client_id`:** table and mutations have no tenant column and accept no `client_id` from browser/request. Per-client overrides are out of scope and require a future story
- [ ] **[SEC] (added) `getTrendSnapshotForWeek()` module uses `import "server-only"`** (lean path: `lib/trend/get-trend-snapshot-for-week.ts` or CONTRACT exact). File header: Content Strategy (US-4.1), Video Script (US-5.1), Media Assembly (US-9.x) **MUST** import this helper only — no direct `neuramark_trend_snapshots` SELECT from agent modules
- [ ] **[SEC] (added) Agent DTO:** `{ weekStart, entries: [...] }` with **`activo = true` entries only**; each entry validated; **`ejemplo_referencia` key absent**; Operator-only fields not aliased under other names. Missing week → safe empty `{ weekStart, entries: [] }` (not an error oracle). Read-time Zod; corrupt entries skipped or soft-failed (codes-only logs), never passed through unvalidated
- [ ] **[SEC] (added) Operator read DTO for edit forms may include `ejemplo_referencia`** — only after `requireOperator()`; never cached in public/static responses; `Cache-Control: no-store` on Operator Trend pages
- [ ] **[SEC] (added) `formatos_playbook_compatibles[]` validated on every write** via `getPlaybookForAgents()` active slugs only — reject unknown, archived, or inactive Playbook slugs; Trend modules **must not** SELECT `neuramark_content_playbooks` directly
- [ ] **[SEC] (added) V1 writes force `fuente: manual`** — client cannot set `scraping` or `operator_review`; no scraping agent, cron, or auto-activation code paths in this story
- [ ] **[SEC] (added) `week_start` server-validated as ISO Monday** (`YYYY-MM-DD`); reject or normalize non-Monday dates before upsert; UNIQUE constraint on `week_start`
- [ ] **[SEC] (added) Parameterized SQL / Supabase queries only;** service-role Node client; no browser Supabase. Migration enables RLS with **zero** named policies on `neuramark_trend_snapshots`
- [ ] **[SEC] (added) Do not log full jsonb payloads** in production — `weekStart`, entry slug, error codes only
- [ ] **[SEC] (added) Automated security tests cover at least:** non-operator mutation → 403 no DB change; non-operator page gate → 403; duplicate entry slug within week rejected; slug change on update rejected; unknown Playbook slug rejected; deactivated entry excluded from agent helper; agent DTO omits `ejemplo_referencia`; create/update `.strict()` rejects extra keys; `fuente` non-manual rejected or overwritten; non-Monday `week_start` rejected; module has `server-only`; no Route Handler for public CRUD (grep/checklist)

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Operator gate — **all mutations and Operator reads** (APPROVE)

| Surface | Gate |
|---|---|
| Publish / update snapshot; add / update / deactivate entry Server Actions | `requireOperator("handler")` first |
| Week list / week detail RSC loaders | `requireOperator("page")` |
| `getTrendSnapshotForWeek(weekStart)` | **No** operator gate (trusted server caller); **no** HTTP |
| Cliente UI/API | **None in V1** |

Middleware route match for `/operator/trends` is UX only. Direct Server Action invocation must remain gated.

#### 2. No public CRUD API (APPROVE)

| Allowed | Forbidden |
|---|---|
| Operator-gated Server Actions consumed by Operator UI | `/api/trends`, `/api/trend-snapshots`, or generic REST CRUD |
| Server-only `getTrendSnapshotForWeek()` | Route Handler exposing agent DTO to browser |
| `revalidatePath` after mutations | Webhook, scraping ingest, or unauthenticated import endpoints |

#### 3. Global snapshot — **no `client_id`** (APPROVE)

| Rule | Detail |
|---|---|
| Schema | No `client_id` column on `neuramark_trend_snapshots` in V1 |
| Mutations | No tenant argument from browser; Operator edits global weekly snapshot |
| Future | Per-client overrides = new table/story; do not bolt `client_id` onto this table without SECURITY review |

#### 4. Entry slug rules — **immutable within snapshot, unique per week** (APPROVE)

| Rule | Detail |
|---|---|
| Create | Slug required; format frozen in CONTRACT (mirror Playbook slug pattern); unique within `(week_start, entries[])` |
| Update | Slug **not** in update schema; handler rejects if present |
| Deactivate | Sets `activo: false`; slug stays in jsonb for history |
| Cross-week reuse | **Allowed** — same slug string may appear in different weeks as separate entry objects (PO lean APPROVED) |
| Seed slug | Frozen in migration: `cold-open-mejor-toma` (CONTRACT exact payload + seed `week_start`) |

#### 5. Zod write validation — **`.strict()`** (APPROVE WITH CONDITIONS)

| Schema | Rules |
|---|---|
| Snapshot publish/upsert | `.strict()`; `week_start` Monday date; `entries` array validated per entry schema |
| Entry create | `.strict()`; all SPEC fields; `prioridad_semana` 1–5; `fuente` omitted or overwritten to `manual` |
| Entry update | `.strict()`; **no `slug`**; must not allow privilege fields without explicit deactivate action |
| Read (Operator) | May include full stored payload including `ejemplo_referencia` for edit |
| Agent DTO | Separate schema; strips `ejemplo_referencia`; `activo = true` only |

**Condition:** CONTRACT must define upsert semantics (`published_at` set on insert only; `updated_at` on every write) and whether full `entries` replace or merge on publish — must not allow partial jsonb merge that bypasses per-entry validation.

#### 6. Playbook cross-validation — **`getPlaybookForAgents()` only** (APPROVE)

| Rule | Detail |
|---|---|
| On write | Every slug in `formatos_playbook_compatibles[]` must exist in active Playbook DTO |
| Implementation | Import `getPlaybookForAgents()` — **no** direct Playbook table SELECT from Trend modules |
| Failure | `VALIDATION_ERROR` with field path; no partial write of entry with bad slug |
| Cliente enumeration | **No** slug list endpoint for Cliente; Operator form loads Playbook slugs via gated Operator read path only |

#### 7. `getTrendSnapshotForWeek(weekStart)` — **server-only, minimal DTO** (APPROVE)

| Rule | Detail |
|---|---|
| Module | `import "server-only"` |
| Export | `getTrendSnapshotForWeek(weekStart: string): Promise<TrendSnapshotForWeekResult>` |
| Input | Validate `weekStart` as ISO Monday date (Zod); invalid input → safe empty or typed error per CONTRACT — **no** SQL injection via string concat |
| Filter | Entries where `activo === true` only |
| Strip | No `ejemplo_referencia`; no internal audit fields unless agents need them (prefer omit row timestamps from agent DTO unless CONTRACT documents need) |
| Empty | No row for week → `{ weekStart, entries: [] }` — same safe shape, not a distinguishable error for untrusted callers |
| Callers | Trusted server orchestration / future US-4.x jobs only |
| HTTP | **Forbidden** |

Mirror US-16.1 / US-2.3 patterns: MUST-import comment, unit tests, no `"use client"` import graph.

#### 8. RLS — **deny-by-default** (APPROVE)

```sql
ALTER TABLE public.neuramark_trend_snapshots ENABLE ROW LEVEL SECURITY;
-- Zero named policies → deny-by-default for anon/authenticated roles.
```

Do **not** add `authenticated` SELECT policies. All access via service-role Node helpers.

#### 9. Deactivate vs delete (APPROVE)

Deactivate Server Action only. No `DELETE FROM neuramark_trend_snapshots` or entry removal from jsonb in app code. Operator history remains queryable including inactive entries.

#### 10. V1 provenance lock — **`fuente: manual` only** (APPROVE)

| Rule | Detail |
|---|---|
| Writes | Server sets `fuente: manual` on every entry create/update in V1 |
| Client input | Reject or strip `scraping` / `operator_review` from request bodies |
| BUILD veto | Scraping agent, cron publish, auto-activation rules, or ingest webhooks |

---

## Future-Proofing Notes

- **US-4.1+** agents **MUST** import `getTrendSnapshotForWeek()` and `getPlaybookForAgents()` only. Trend hint text is **untrusted input** at LLM time — delimiter wrapping and output schema validation are downstream responsibilities (US-4.1 `[SEC]` already binds prompt containment).
- **Scraping fase posterior:** when `fuente: scraping` lands, it requires a **new story** with Operator review gate, separate ingest path, and SECURITY review — do not enable via env flag or loose validation in V1 code.
- **Multi-tenancy:** if per-client Trend overrides are ever needed, use a **separate** table or explicit override story — do not add nullable `client_id` to the global snapshot table without migration + SECURITY review.
- **Auth:** Operator gate depends on US-14.5 `requireOperator()` — do not reintroduce hardcoded operator bypass on Trend paths.
- **Strategy slot references:** `tactica_tendencia_slug` in US-4.1 must be validated server-side against `getTrendSnapshotForWeek()` for the target week — not against stale client-supplied táctica objects.
- **Do not** later “simplify” by exposing Trend CRUD as a generic REST resource — that recreates gate bypass and mass-assignment risk.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-16.2/CONTRACT.md` exists, spot-check before BUILD:

- [ ] Server Action names frozen; each mutation starts with `requireOperator("handler")`
- [ ] RSC routes frozen (`/operator/trends`, `/operator/trends/[weekStart]` lean); `requireOperator("page")` on loaders
- [ ] **No** public CRUD Route Handler
- [ ] Table `neuramark_trend_snapshots`: columns frozen (`week_start` UNIQUE, `entries` jsonb, `published_at`, `updated_at`); **no `client_id`**
- [ ] RLS enabled, zero policies
- [ ] Zod create/update `.strict()`; closed enums; entry update excludes `slug`
- [ ] Entry slug immutability + per-week uniqueness documented
- [ ] Deactivate action semantics; no DELETE
- [ ] Upsert / `published_at` / `updated_at` behavior frozen
- [ ] `getTrendSnapshotForWeek()` path, return shape `{ weekStart, entries: [...] }`, active filter, strip list, empty-week behavior
- [ ] Operator read DTO vs agent DTO distinction explicit
- [ ] Playbook slug validation via `getPlaybookForAgents()` documented with error code
- [ ] `fuente: manual` enforcement on V1 writes
- [ ] `week_start` Monday validation frozen
- [ ] Seed `week_start` + `cold-open-mejor-toma` payload frozen
- [ ] `revalidatePath` targets listed
- [ ] EN/ES Operator chrome; plain-text rendering for user-entered táctica fields
- [ ] Out of scope: US-4.x jobs, scraping agent, Cliente Trend UI, clone-prior-week, per-client overrides, LLM calls

---

## CONTRACT freeze list (binding summary)

1. **Gate:** `requireOperator()` on **every** Trend mutation and Operator RSC loader; 401/403, no side effects on failure.
2. **Surface:** Server Actions + RSC only — **no** public CRUD Route Handler; **no** HTTP for `getTrendSnapshotForWeek`.
3. **Tenancy:** Global snapshot — **no `client_id`** column or mutation arg in V1.
4. **Entry slug:** Immutable after create within snapshot; unique per `week_start`; cross-week reuse allowed; seed slug frozen in migration.
5. **Write validation:** Zod **`.strict()`** on snapshot/entry create/update; closed enums; client validation is non-authoritative; `prioridad_semana` 1–5.
6. **Lifecycle:** Soft deactivate only (`activo: false`); no hard delete.
7. **Provenance:** V1 **`fuente: manual` only** — no scraping/auto-activation in BUILD.
8. **Week key:** ISO Monday `week_start`; server-validated; UNIQUE.
9. **Playbook refs:** `formatos_playbook_compatibles[]` validated via `getPlaybookForAgents()` active slugs only.
10. **Agent path:** `getTrendSnapshotForWeek()` in `import "server-only"` module; active entries only; **`ejemplo_referencia` absent** from agent DTO; safe empty when no row.
11. **Operator-only fields:** May appear in Operator edit/read after gate; never in agent DTO or Cliente responses.
12. **DB:** RLS deny-by-default; service-role Node only; parameterized queries; no full payload logging.
13. **Out of scope:** Strategy/Script jobs (US-4.x+), scraping pipeline, Cliente Trend UI, LLM/video jobs, per-client overrides, clone-prior-week.

---

## BUILD vetoes (summary)

1. **Trend mutation or Operator list/detail without `requireOperator()`** (including “temporary” dev bypass).
2. **Public Route Handler** for snapshot CRUD or agent trend read.
3. **`getTrendSnapshotForWeek` imported from Client Components** or exposed via HTTP.
4. **Create/update schemas without `.strict()`** or accepting entry `slug` on update.
5. **Hard DELETE** path for snapshots or entries.
6. **`client_id` column or tenant arg** on Trend mutations in V1.
7. **`ejemplo_referencia` (or Operator-only fields) in agent DTO** or any Cliente-facing response.
8. **RLS policies granting `authenticated` access** to `neuramark_trend_snapshots`.
9. **Browser Supabase / service-role in Client Components**; logging full jsonb payloads.
10. **Direct `neuramark_content_playbooks` SELECT from Trend modules** — must use `getPlaybookForAgents()`.
11. **Client-writable `fuente` other than `manual`**, scraping agent, cron auto-publish, or ingest webhooks in V1 BUILD.
12. **LLM calls, Strategy jobs, Cliente Trend UI, or Playbook table alterations** under this story’s BUILD.

---

## Open questions — SECURITY resolutions

| # | Question (TASKS.md) | Resolution |
|---|---|---|
| 1 | Seed `week_start` — fixed vs relative? | **Fixed canonical Monday in migration** (APPROVED) — predictable dev/staging/prod seed; no security impact |
| 2 | Entry slug scope — per snapshot vs global? | **Unique within snapshot only** (APPROVED) — cross-week reuse allowed; immutability within week prevents reference confusion |
| 3 | `duracion_ideal_seg` object schema | **Strict `{ cold_open: number, total: number }`** (APPROVED) — Zod bounds on both keys |
| 4 | Hook / rubro enums | **Reuse Playbook Zod enums** (APPROVED) — avoids drift; closed lists |
| 5 | Operator route | **`/operator/trends`** + `/operator/trends/[weekStart]` with `requireOperator` on page + handlers (APPROVED) |
| 6 | Upsert semantics | **Upsert by `week_start`**; `published_at` insert-only (APPROVED) — CONTRACT must define full `entries` replace vs merge with per-entry validation |
| 7 | Week list UX | **Persisted weeks only** (APPROVED) — list gated; no public enumeration |
| 8 | Clone prior week | **Out of V1** (APPROVED) — reduces bulk-copy abuse surface; manual re-entry only |
| 9 | Catalog i18n | **Monolingual ES seed OK** (APPROVED) — Operator UI chrome EN/ES; no security impact |
| 10 | `editing_hints` vocabulary | **Free-text strings** (APPROVED) — mirror Playbook; plain-text UI; untrusted at LLM time |

---

## Recommended action

**APPROVE WITH CONDITIONS.** Proceed to **CONTRACT.md** (nextjs-backend). Binding floors above must appear in CONTRACT before BUILD. FE signoff required after CONTRACT (Operator UI consumes gated actions only). content-agents-engineer owns `getTrendSnapshotForWeek()` module placement per TASKS.md but must satisfy all agent-helper `[SEC]` criteria in this file.
