# Security Design Review — US-16.1

**Story:** US-16.1 — Curate evergreen Reel format catalog (Playbook)  
**Date:** 2026-08-29  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-16.1, all `[SEC]`), `plan/stories/US-16.1/TASKS.md`, `plan/stories/US-16.1/README.md`, `SPEC.md` §3 Content Playbook, `plan/stories/US-14.5/SECURITY.md` (`requireOperator` floor), `plan/stories/US-2.3/SECURITY.md` (agent-helper pattern), `lib/auth/require-user.ts`, `lib/profile/get-business-profile-for-agents.ts`, Fase 1 RLS migrations  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct and SPEC-aligned: a **global Operator-curated** catalog in `neuramark_content_playbooks` (no `client_id` in V1), **Operator-gated** Server Actions for list/create/update/archive, **slug immutability** after create, **archive-not-delete**, **Zod `.strict()`** on every write, and a **server-only** `getPlaybookForAgents()` that returns active formatos with **`ejemplo_referencia` stripped**. RLS stays **deny-by-default** (zero policies); all DB access via service-role Node. **No public CRUD Route Handler** — no HTTP surface for catalog mutation or agent reads.

No REDESIGN. No veto of PO lean defaults (jsonb payload + Zod; integer `version` only; `/operator/playbook`; five seed slugs; archived slugs permanently reserved; closed `hook_type` enum). Orchestrator may proceed to **CONTRACT.md** after freezing the items below.

**Inherited floors (US-14.5 / Fase 1 — do not weaken):** `requireOperator()` calls `requireActive()` first; role never from request; middleware is convenience; handler-level gates mandatory; RLS enabled with zero named policies; service-role Node only; no `@supabase/supabase-js` in Client Components; no browser Supabase keys.

**This story owns:** `neuramark_content_playbooks` migration + seed; Operator Playbook CRUD Server Actions + RSC loaders; Zod create/update/read/agent DTO schemas; `getPlaybookForAgents()` server-only helper; security tests for operator gate, slug rules, archive exclusion, DTO strip.

**This story does not own:** Trend snapshots (US-16.2); Strategy/Script/Caption LLM jobs (US-4.x+); Cliente read UI for Playbook; per-client Playbook overrides; prompt-injection containment at LLM call time (deferred — storage treated as untrusted input for downstream); auth redesign.

**Terminology:** **Playbook de formatos** · **Formato de Reel** · **Operator** · **Cliente**. Technical helper name `getPlaybookForAgents` is canonical. Do not use CONTEXT _Evitar_ terms in product-facing docs.

---

### Threat Summary (US-16.1–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Non-operator CRUD / read of Operator catalog** | Cliente or anonymous user curates global prompts, reads internal reference URLs | Every Operator list/detail loader and **every mutation** calls `requireOperator("page" \| "handler")` before side effects. Cliente has **no** read path in V1 |
| **Public `/api/…` CRUD without gate** | Classic unauthenticated or client-role catalog tampering | **No** public Route Handler for Playbook CRUD. Server Actions only, each gated. `getPlaybookForAgents` is **not** exposed as HTTP |
| **`ejemplo_referencia` / Operator-only fields leak to browser or agents** | Internal URLs/notes in client bundle or LLM context | Operator read DTO may include `ejemplo_referencia` for edit forms (Operator session only). **Agent DTO and any Cliente-facing shape must omit it.** Zod agent schema excludes the key; tests prove strip |
| **`getPlaybookForAgents` in client bundle** | Full catalog + hints reachable from browser; future IDOR if misused | Module **`import "server-only"`**. Never import from `"use client"` trees. Only trusted server orchestration / future agent jobs |
| **Mass assignment / extra JSON keys on write** | Attacker injects privileged fields, bypasses validation | Zod **`.strict()`** on create/update input schemas; reject unknown keys server-side. Client validation is presentation only |
| **Slug mutation after create** | Breaks foreign references (`formato_playbook_slug`, Trend compat slugs) | Update handler **rejects** slug changes; DB may add trigger/constraint as defense-in-depth. Archived slugs **never** reused (PO lean APPROVED) |
| **Hard delete** | Orphaned strategy/script references; audit loss | **Archive only** (`active = false`, `archived_at`). No DELETE path in V1 |
| **Fake `client_id` on global catalog** | Future tenancy confusion, IDOR footgun | **No `client_id` column** in V1. CONTRACT must not add tenant args to Playbook mutations. Global catalog by design |
| **RLS policy that exposes rows to `authenticated`** | Browser SDK could read/write catalog if added later | RLS **enabled, zero policies** — match Fase 1. Do not add `authenticated` SELECT/INSERT policies |
| **Corrupt seed / jsonb without read validation** | Agents consume malformed hints | Read-time Zod on Operator load and agent helper; corrupt rows excluded from agent DTO with safe logging (codes only) |
| **Prompt injection via stored hints** | Operator-entered `guion_hints` steers LLM later | **Accepted residual for storage story.** Hints are untrusted **data** at LLM time; delimiter + output schema validation lands US-4.x+. Do not execute or HTML-render hint text in Operator UI |
| **Logging full payloads** | Business/strategy text in logs | Log **codes / slugs / ids** only — never full jsonb bodies in production |

**Residual risk accepted:** Playbook content is **global** — all clients share the same format catalog in V1. That is product intent, not a leak. Operator trust model: anyone with `role = operator` can edit global catalog (SQL-promoted only). `getPlaybookForAgents()` trusts **caller** (server orchestration); defense is no browser/HTTP path to it.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| `neuramark_content_playbooks` rows (full payload) | Medium — shapes all client Reels via agents | Service-role Node; Operator CRUD only; RLS deny-by-default |
| `ejemplo_referencia` | Medium — internal URL/notes, Operator eyes only | Operator edit/read responses only; **never** agent DTO or Cliente |
| `slug` | High — stable foreign key for US-16.2 / US-4.1 / US-5.1 | Immutable after create; UNIQUE; archived slugs permanently reserved |
| `guion_hints`, `editing_hints`, `estructura` | Medium — **LLM fuel** (untrusted at prompt time) | Stored by Operator; consumed server-side via `getPlaybookForAgents()` only |
| `version` | Low–Medium — optimistic concurrency / audit hint | Server increments on successful update; client cannot set arbitrary version without rejection |
| Service-role key | Critical | Node only; never Client Components or Edge middleware |
| Operator session | High — can mutate global catalog | `requireOperator()` on every Operator surface and mutation |

**Boundaries:**

1. **Browser (Cliente or Operator) → Next.js Server Actions / RSC** — Untrusted. No Supabase SDK. Operator UI calls gated Server Actions only. Cliente has **no** Playbook UI/API in V1.
2. **Operator RSC / Server Actions → Postgres** — After `requireOperator()`. Parameterized queries; service-role; jsonb validated with Zod `.strict()` before write.
3. **Trusted server orchestration → `getPlaybookForAgents()`** — No session gate inside helper (mirror US-2.3). **No** HTTP. **No** Client Component import. Returns active formatos only; strips Operator-only fields.
4. **Postgres → agents (future US-4.x+)** — Only through `getPlaybookForAgents()` validated DTO — never raw table SELECT from agent modules.

---

## Abuse Cases Considered

- *As a malicious actor, I can POST a Playbook Server Action without an Operator session and create/edit/archive formatos* → **Blocked:** every mutation starts with `requireOperator("handler")`; 401/403, **no side effects**.
- *As a Cliente, I can open `/operator/playbook` or call list/detail actions* → **Blocked:** RSC loader uses `requireOperator("page")` → 403; handlers return 403. UI hiding is not sufficient — handler gate is mandatory.
- *As a malicious actor, I can `GET /api/playbook` or `/api/playbook/[slug]` to read or mutate the catalog* → **Blocked:** no public CRUD Route Handler. BUILD veto if introduced without a new gated story.
- *As a malicious actor, I can import `getPlaybookForAgents` in a Client Component and pull the full catalog* → **Blocked:** `import "server-only"`; must not appear in client graphs.
- *As a malicious actor, I send extra JSON keys (`role`, `client_id`, `active: true` override) in a create/update body* → **Blocked:** Zod `.strict()` rejects unknown keys server-side.
- *As a malicious actor, I change `slug` on update to hijack references or reuse an archived slug* → **Blocked:** update handler ignores/rejects slug changes; create rejects duplicate slugs including archived rows (PO lean: slug permanently reserved).
- *As a malicious actor, I hard-delete a formato to disrupt production* → **Blocked:** no DELETE Server Action / migration path in V1; archive only.
- *As a malicious actor, I read `ejemplo_referencia` via agent DTO or a Cliente-facing API* → **Blocked:** agent Zod schema omits field; automated test proves absence; no Cliente read path.
- *As a malicious actor, I inject `client_id` to create a tenant-specific formato and IDOR later* → **Blocked:** no `client_id` column; mutations do not accept tenant args.
- *As a malicious actor, I add RLS policies so `authenticated` users SELECT the catalog via a future browser SDK* → **Blocked:** zero policies; service-role only. Review migration for policy absence.
- *As a malicious actor, I tamper `version` in update to clobber concurrent edits silently* → **Mitigated:** CONTRACT should define optimistic check (reject stale `version` or use row update with `WHERE version = $expected`); at minimum server-owned increment, never trust client-only version without check.
- *As a malicious Operator, I store XSS payloads in `titulo` / hints* → **Mitigated:** render as plain text in Operator UI (no `dangerouslySetInnerHTML`); hints are not HTML at storage time.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-16.1 are binding. Items marked **(added)** are new in this review — paste them into the story when the PO next edits USER_STORIES. Do not drop or weaken any existing `[SEC]` line.

**Inherited (still binding — do not weaken adjacent auth paths):**

- [ ] **[SEC] Every operator-only gate lives inside the Server Action / Route Handler itself** as `requireOperator()` on the `getCurrentUser()` result; middleware and UI hiding are convenience only *(US-14.5)*
- [ ] **[SEC] `requireOperator()` runs `requireActive()` first** — inactive operator has no access *(US-14.5)*
- [ ] **[SEC] RLS stays enabled with zero policies** on new `neuramark_*` tables; privileged access via Node service-role only *(US-14.5 / Fase 1)*

**US-16.1 story `[SEC]` (existing):**

- [ ] **[SEC] Playbook payload re-validated server-side on every write (Zod); client-side validation is presentation only**
- [ ] **[SEC] `getPlaybookForAgents()` is server-only (never imported into Client Components) and is the only path agents use to read playbook data**
- [ ] **[SEC] `ejemplo_referencia` and other Operator-only fields never appear in client-session responses or agent DTOs**
- [ ] **[SEC] No LLM calls, video jobs, or client-scoped mutations in this story — catalog CRUD + read contract only**

**Added in this review:**

- [ ] **[SEC] (added) Every Playbook mutation Server Action** (`create`, `update`, `archive` — CONTRACT names) calls `requireOperator("handler")` as its **first** await before validation or DB I/O; failure → 401/403, **no side effects**
- [ ] **[SEC] (added) Operator Playbook RSC loaders** (list + detail/edit) call `requireOperator("page")` before loading rows; Cliente sessions receive **403**, not an empty catalog masquerading as auth success
- [ ] **[SEC] (added) No public Route Handler** for Playbook list/get/create/update/archive or for `getPlaybookForAgents` by slug/HTTP. If a Route Handler is added for export/debug, it is a **new story** with explicit Operator gate — not in US-16.1 BUILD
- [ ] **[SEC] (added) Create/update input schemas use Zod `.strict()`** — unknown keys rejected. Separate schemas for create vs update (update must not accept `slug`). Closed enums for `hook_type`, `modalidades_recomendadas`, `cta_tipo` frozen in CONTRACT
- [ ] **[SEC] (added) `slug` immutable after create:** update handler rejects slug changes even if smuggled in body; duplicate slug on create rejected server-side (including archived rows — no reuse)
- [ ] **[SEC] (added) Archive-only lifecycle:** no hard DELETE in application code or migration helpers; archived rows (`active = false`, `archived_at` set) excluded from `getPlaybookForAgents()` but remain for Operator history queries
- [ ] **[SEC] (added) Global catalog — no `client_id`:** table and mutations have no tenant column and accept no `client_id` from browser/request. Per-client overrides are out of scope and require a future story
- [ ] **[SEC] (added) `getPlaybookForAgents()` module uses `import "server-only"`** (lean path: `lib/playbook/get-playbook-for-agents.ts` or CONTRACT exact). File header: Content Strategy, Video Script, Media Assembly, Trend validation (US-16.2+) **MUST** import this helper only — no direct `neuramark_content_playbooks` SELECT from agent modules
- [ ] **[SEC] (added) Agent DTO:** `{ formats: [...] }` active rows only; each item validated; **`ejemplo_referencia` key absent**; Operator-only fields not aliased under other names. Read-time Zod; corrupt rows skipped or soft-failed (codes-only logs), never passed through unvalidated
- [ ] **[SEC] (added) Operator read DTO for edit forms may include `ejemplo_referencia`** — only after `requireOperator()`; never cached in public/static responses; `Cache-Control: no-store` on Operator Playbook pages
- [ ] **[SEC] (added) Parameterized SQL / Supabase queries only;** service-role Node client; no browser Supabase. Migration enables RLS with **zero** named policies on `neuramark_content_playbooks`
- [ ] **[SEC] (added) Do not log full jsonb payloads** in production — slug, id, version, error codes only
- [ ] **[SEC] (added) Automated security tests cover at least:** non-operator mutation → 403 no DB change; non-operator page gate → 403; duplicate slug rejected; slug change on update rejected; archived excluded from agent helper; agent DTO omits `ejemplo_referencia`; create/update `.strict()` rejects extra keys; module has `server-only`; no Route Handler for public CRUD (grep/checklist)

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Operator gate — **all mutations and Operator reads** (APPROVE)

| Surface | Gate |
|---|---|
| Create / update / archive Server Actions | `requireOperator("handler")` first |
| List / detail RSC loaders | `requireOperator("page")` |
| `getPlaybookForAgents()` | **No** operator gate (trusted server caller); **no** HTTP |
| Cliente UI/API | **None in V1** |

Middleware route match for `/operator/playbook` is UX only. Direct Server Action invocation must remain gated.

#### 2. No public CRUD API (APPROVE)

| Allowed | Forbidden |
|---|---|
| Operator-gated Server Actions consumed by Operator UI | `/api/playbook`, `/api/content-playbooks`, or generic REST CRUD |
| Server-only `getPlaybookForAgents()` | Route Handler exposing agent DTO to browser |
| `revalidatePath` after mutations | Webhook or unauthenticated import endpoints |

#### 3. Global catalog — **no `client_id`** (APPROVE)

| Rule | Detail |
|---|---|
| Schema | No `client_id` column on `neuramark_content_playbooks` in V1 |
| Mutations | No tenant argument from browser; Operator edits global catalog |
| Future | Per-client overrides = new table/story; do not bolt `client_id` onto this table without SECURITY review |

#### 4. Slug rules — **immutable, unique, non-reusable** (APPROVE)

| Rule | Detail |
|---|---|
| Create | Slug required; format frozen in CONTRACT (e.g. `^[a-z0-9]+(?:-[a-z0-9]+)*$`); UNIQUE constraint |
| Update | Slug **not** in update schema; handler rejects if present |
| Archive | Sets `active = false`, `archived_at`; slug stays occupied |
| Reuse archived slug | **Forbidden** (PO lean APPROVED) — prevents reference confusion |
| Seed slugs | Frozen in migration: `tip-rapido`, `antes-despues`, `objecion`, `oferta-local`, `mito-vs-realidad` (CONTRACT exact) |

#### 5. Zod write validation — **`.strict()`** (APPROVE WITH CONDITIONS)

| Schema | Rules |
|---|---|
| Create | `.strict()`; all SPEC fields; closed enums; bounded arrays/strings per CONTRACT |
| Update | `.strict()`; **no `slug`**; partial or full replace per CONTRACT — must not allow privilege fields (`active` bypass) without explicit archive action |
| Read (Operator) | May include full stored payload for edit |
| Agent DTO | Separate schema; strips `ejemplo_referencia`; active only |

**Condition:** CONTRACT must define whether `update` accepts client-supplied `version` for optimistic locking and the failure mode (409 vs 400). Minimum: server increments `version` on success; stale concurrent update must not silently lose data.

#### 6. `getPlaybookForAgents()` — **server-only, minimal DTO** (APPROVE)

| Rule | Detail |
|---|---|
| Module | `import "server-only"` |
| Export | `getPlaybookForAgents(): Promise<PlaybookForAgentsResult>` (no args — global catalog) |
| Filter | `active = true` AND `archived_at IS NULL` (or equivalent — CONTRACT exact) |
| Strip | No `ejemplo_referencia`; no internal audit fields unless agents need them (prefer omit `created_at`/`updated_at` unless CONTRACT documents need) |
| Callers | Trusted server orchestration / future US-4.x jobs only |
| HTTP | **Forbidden** |

Mirror US-2.3 patterns: MUST-import comment, unit tests, no `"use client"` import graph.

#### 7. RLS — **deny-by-default** (APPROVE)

```sql
ALTER TABLE public.neuramark_content_playbooks ENABLE ROW LEVEL SECURITY;
-- Zero named policies → deny-by-default for anon/authenticated roles.
```

Do **not** add `authenticated` SELECT policies. All access via service-role Node helpers.

#### 8. Archive vs delete (APPROVE)

Archive Server Action only. No `DELETE FROM neuramark_content_playbooks` in app code. Operator history remains queryable.

---

## Future-Proofing Notes

- **US-16.2** validates `formatos_playbook_compatibles[]` against **active** Playbook slugs via server helper — do not expose a slug enumeration endpoint to Cliente; validation on Trend write is Operator-gated.
- **US-4.1+** agents **MUST** import `getPlaybookForAgents()` only. Playbook hint text is **untrusted input** at LLM time — delimiter wrapping and output schema validation are downstream responsibilities.
- **Multi-tenancy:** if per-client Playbook overrides are ever needed, use a **separate** table or explicit override story — do not add nullable `client_id` to the global catalog without migration + SECURITY review.
- **Auth:** Operator gate depends on US-14.5 `requireOperator()` — do not reintroduce hardcoded operator bypass on Playbook paths.
- **Do not** later “simplify” by exposing Playbook CRUD as a generic REST resource — that recreates gate bypass and mass-assignment risk.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-16.1/CONTRACT.md` exists, spot-check before BUILD:

- [ ] Server Action names frozen; each mutation starts with `requireOperator("handler")`
- [ ] RSC routes frozen (`/operator/playbook` lean); `requireOperator("page")` on loaders
- [ ] **No** public CRUD Route Handler
- [ ] Table `neuramark_content_playbooks`: columns frozen (slug UNIQUE, version, payload jsonb, active, timestamps, archived_at); **no `client_id`**
- [ ] RLS enabled, zero policies
- [ ] Zod create/update `.strict()`; closed enums; update excludes `slug`
- [ ] Slug immutability + no archived slug reuse documented
- [ ] Archive action semantics; no DELETE
- [ ] Optimistic `version` behavior frozen
- [ ] `getPlaybookForAgents()` path, return shape `{ formats: [...] }`, active filter, strip list
- [ ] Operator read DTO vs agent DTO distinction explicit
- [ ] Seed slugs + minimal payload frozen
- [ ] `revalidatePath` targets listed
- [ ] EN/ES Operator chrome; plain-text rendering for user-entered catalog fields
- [ ] Out of scope: US-16.2, US-4.x jobs, Cliente Playbook UI, LLM calls, Trend scraping

---

## CONTRACT freeze list (binding summary)

1. **Gate:** `requireOperator()` on **every** Playbook mutation and Operator RSC loader; 401/403, no side effects on failure.
2. **Surface:** Server Actions + RSC only — **no** public CRUD Route Handler; **no** HTTP for `getPlaybookForAgents`.
3. **Tenancy:** Global catalog — **no `client_id`** column or mutation arg in V1.
4. **Slug:** Immutable after create; UNIQUE; archived slugs **never** reused; seed slugs frozen in migration.
5. **Write validation:** Zod **`.strict()`** on create/update; closed enums; client validation is non-authoritative.
6. **Lifecycle:** Archive only (`active` + `archived_at`); no hard delete.
7. **Version:** Server-owned increment; CONTRACT defines optimistic concurrency failure mode.
8. **Agent path:** `getPlaybookForAgents()` in `import "server-only"` module; active formatos only; **`ejemplo_referencia` absent** from agent DTO.
9. **Operator-only fields:** May appear in Operator edit/read after gate; never in agent DTO or Cliente responses.
10. **DB:** RLS deny-by-default; service-role Node only; parameterized queries; no full payload logging.
11. **Out of scope:** Trend (US-16.2), Strategy/Script jobs (US-4.x+), Cliente Playbook UI, LLM/video jobs, per-client overrides.

---

## BUILD vetoes (summary)

1. **Playbook mutation or Operator list/detail without `requireOperator()`** (including “temporary” dev bypass).
2. **Public Route Handler** for catalog CRUD or agent catalog read.
3. **`getPlaybookForAgents` imported from Client Components** or exposed via HTTP.
4. **Create/update schemas without `.strict()`** or accepting `slug` on update.
5. **Hard DELETE** path or archived slug reuse on create.
6. **`client_id` column or tenant arg** on Playbook mutations in V1.
7. **`ejemplo_referencia` (or Operator-only fields) in agent DTO** or any Cliente-facing response.
8. **RLS policies granting `authenticated` access** to `neuramark_content_playbooks`.
9. **Browser Supabase / service-role in Client Components**; logging full jsonb payloads.
10. **LLM calls, Trend tables, Strategy jobs, or Cliente Playbook UI** under this story’s BUILD.

---

## Open questions — SECURITY resolutions

| # | Question (TASKS.md) | Resolution |
|---|---|---|
| 1 | Payload shape — jsonb vs normalized? | **jsonb + Zod** (PO lean APPROVED). Validate on every write and on agent read |
| 2 | Catalog i18n | **No security impact.** Monolingual ES seed OK; Operator UI chrome EN/ES |
| 3 | Operator route | **`/operator/playbook`** with `requireOperator` on page + handlers (APPROVED) |
| 4 | Version history table? | **Integer `version` only** in V1 (APPROVED). CONTRACT must define optimistic concurrency |
| 5 | `hook_type` enum | **Closed list in Zod** frozen in CONTRACT (APPROVED) |
| 6 | Archive + slug reuse? | **No reuse** — slug permanently reserved (APPROVED — prevents reference attacks) |

---

## Recommended action

**APPROVE WITH CONDITIONS.** Proceed to **CONTRACT.md** (nextjs-backend). Binding floors above must appear in CONTRACT before BUILD. FE signoff required after CONTRACT (Operator UI consumes gated actions only).
