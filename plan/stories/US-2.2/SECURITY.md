# Security Design Review — US-2.2

**Story:** US-2.2 — Edit business profile  
**Date:** 2026-08-29  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-2.2 `[SEC]`), `plan/SECURITY_BASELINE.md` (Business Profile), `plan/stories/US-2.1/SECURITY.md` + `US-1.3/SECURITY.md` (inherited floors), `plan/stories/US-2.2/README.md`, `TASKS.md`, `SPEC-REVIEW.md` (ALIGNED), `lib/contracts/interview.ts` / `profile.ts`, `supabase/migrations/20260829120000_neuramark_business_profiles.sql`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct and SPEC-aligned: add **edit** on the existing gated `/profile` Ficha viva via a **Server Action PATCH** (`updateBusinessProfile` or CONTRACT exact name); body = **full seven-key** object validated with **Zod `.strict()`** (`interviewAnswersCompleteSchema` / shared profile fields schema); write `fields` only for that allowlist; **reject** consent / Preferencias de producción visual (`visual_mode` and related) / system / privilege keys even if smuggled; scope `UPDATE … WHERE client_id = getCurrentUser().id`; **never create** a row via PATCH (missing → typed error + keep CTA → `/interview`); bump **`version`** server-side; set/rely on **`updated_at`**; record **`updated_by = getCurrentUser().id`** (nullable column FK → `neuramark_clients(id)` — migration in scope); last-write-wins with visible timestamp; XSS bar = controlled inputs + escaped text nodes; CSRF via POST-only Server Action origin check; no Operator cross-tenant; no `profile_versions` history table.

No REDESIGN. No veto of orchestrator / SPEC-REVIEW defaults (Server Action; seven-key allowlist + `.strict()`; full replace; `updated_by` column; LWW; no create-via-PATCH; no Operator param; no history table). Orchestrator may proceed to CONTRACT.md after freezing the items below.

**Inherited floors (US-1.1 / US-1.2 / US-1.3 / US-2.1 — do not weaken):** identity only via `getCurrentUser()` / `requireActive()`; strip/reject tenant and privilege keys; `/profile` under `(app)`, off `isPublicPath`, `Cache-Control: no-store`; parameterized SQL; RLS deny-by-default on `neuramark_business_profiles`, service-role Node only; free-text as React text nodes / controlled inputs only (no `dangerouslySetInnerHTML`); no answers/profile free-text bodies in production logs; no `@supabase/supabase-js` in Client Components; no public profile GET/PATCH by UUID; US-2.1 loader arity 0 for reads.

**This story owns:** edit UI on `/profile` (seven allowlisted keys); Server Action PATCH mutation; Zod `.strict()` allowlist; version bump; `updated_at` visibility; `updated_by` column + set on every successful edit; reject missing-row (no invent create); Save/Cancel + await success toast; revalidate `/profile`.

**This story does not own:** profile create/upsert on Entrevista submit (US-1.3); read-only loader / missing CTA / dashboard card (US-2.1 — extend, do not fork); `getBusinessProfileForAgents` (US-2.3); Preferencias de producción visual / Consentimiento de avatar editors (US-3.x); Operator cross-tenant UI; auth redesign; LLM enricher; `profile_versions` history table; redo Entrevista.

**Terminology:** **Ficha viva** / Living profile · **Entrevista inicial** · **Cliente** · **Operator** · **Preferencias de producción visual** · **Consentimiento de avatar**. Field `style` UI label: **Style** / **Estilo**. Do not use CONTEXT _Evitar_ terms (Business Profile / perfil de negocio, Brand notes / Notas de marca as primary label, cuestionario, onboarding interview, admin / administrador / staff, avatar mode / visual preferences as entity names, consent ledger in product copy) in CONTRACT, this file’s product-facing examples, or EN/ES copy.

---

### Threat Summary (US-2.2–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Mass assignment** (extra keys in PATCH body) | Overwrite system columns, inject privilege flags, corrupt jsonb | Zod **`.strict()`** on full seven-key object only. Unknown keys → validation error. Never spread raw body into SQL/jsonb |
| **IDOR via `client_id` / profile id / `?id=` / `as_client_id`** | Edit another Cliente’s Ficha viva | Action arity without tenant args. `UPDATE … WHERE client_id = $server` only. Reject/strip `client_id`, `profile_id`, `id`, `source_interview_id` as write authority |
| **Privilege escalation via `visual_mode` / consent** | Enable own-avatar or flip legal consent without US-3.x re-confirm | Consent / Preferencias keys **rejected** by `.strict()` (not in allowlist). No UI toggles on `/profile`. Restricted-field AC satisfied by **blocking** silent change here |
| **Client-supplied `version` / `updated_at` / `updated_by`** | Forge audit trail; skip bump; spoof actor | Server sets `version = version + 1`, relies on trigger/`updated_at`, sets `updated_by` from `getCurrentUser().id`. Client values never write authority |
| **Create-via-PATCH / invent orphan profile** | Bypass Entrevista completeness (US-1.3 gate); half-corrupt Ficha viva | Missing own row → typed error (e.g. `PROFILE_NOT_FOUND`); **no INSERT**. FE keeps US-2.1 CTA → `/interview` |
| **XSS on save + display** | Stored script in services/zone/… executes after edit | Controlled inputs on edit; post-save render as React text nodes / PrimeReact children only; no `dangerouslySetInnerHTML`; never interpolate into HTML/SQL/shell |
| **CSRF / public Route Handler PATCH** | Cross-site mutate; classic IDOR API | **Server Action only** under `(app)`; POST + Next.js origin check; `requireActive("handler")`. No `/api/profile` PATCH/GET by UUID |
| **Unauthenticated / inactive mutate** | Anonymous or deactivated account overwrites Ficha viva | `requireActive("handler")` before any write → **401** / **403**; no side effects |
| **Operator cross-tenant edit** | Privilege without RBAC story | **Out of V1.** No `as_client_id`, no `requireOperator` branch. Even Operator role updates **own** `client_id` only |
| **Over-exposure in mutation response** | Tokens, `auth_user_id`, `role`, UUIDs leak to client | Return minimal view slice: seven fields + `version` + `updatedAt` (optional subtle). Prefer omit profile UUID / `client_id` / `source_interview_id` / `updated_by` from client props unless CONTRACT needs a non-sensitive display |
| **Write amplification / unbounded payload** | DoS via huge jsonb | Reuse interview completeness caps + existing DB `fields` size CHECK (80 KiB). Reject oversized before write |
| **Logging free-text fields** | PII/business text in logs | Log **codes only** — never full `fields` bodies |

**Residual risk accepted:** Last-write-wins (no If-Match) — two concurrent tabs: last saver wins; AC requires visible `updated_at` so Cliente can see staleness after refresh. An activated Cliente may edit their own free-text Ficha viva (intended). Orphan own profile (row exists, interview not `completed`) remains editable if row exists (same as US-2.1 show rule) — no cross-tenant leak. Prompt injection via edited profile text into later agents deferred to US-4.x (store as data here). Integer `version` bump is audit metadata for agents, not a full history product (`profile_versions` Fuera V1).

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| `neuramark_business_profiles.fields` jsonb | Medium — business PII-adjacent; LLM fuel later; now **writable** by Cliente | Service-role Node write; Zod `.strict()` seven keys; XSS bar on FE |
| `version` | Medium — agent traceability | Server bump only; client cannot set |
| `updated_at` | Low–Medium — LWW visibility | Trigger and/or explicit set; shown after save |
| `updated_by` | Medium — audit “who” | Server-set from `getCurrentUser().id`; FK → `neuramark_clients(id)`; never from body |
| `client_id` / `CurrentUser.id` | High — tenancy key | Only from `getCurrentUser()` / `requireActive`. Never body/query/headers |
| `source_interview_id` | Medium — FK / idempotency | Immutable on edit path; never from client; do not change on PATCH |
| Consent / Preferencias (US-3.x stores) | Highest — legal | **Not writable** via this endpoint; reject if present |
| Ficha viva HTML + edit form at `/profile` | Medium | `(app)` + `requireActive` + `no-store` |
| Session cookie (`sb-*`) | High — US-14.5 | Unchanged; CSRF via Server Action origin |
| Service-role key | Critical | Node only. Never Client Components |

**Boundaries:**

1. **Browser → PATCH Server Action** — Untrusted POST body. CSRF via Next.js origin check. `requireActive("handler")` before validate/write. Body = seven allowlisted keys only; identity never from body.
2. **Browser → `/profile` RSC + edit Client Component** — Session identifies user; load via existing arity-0 `getBusinessProfileForClient`; edit chrome only when own row exists. No `client_id` / profile id query param.
3. **Next.js → Postgres** — Parameterized `UPDATE` where `client_id = user.id`. Service-role Node; RLS enabled, **zero** named policies (unchanged). Optional migration adds `updated_by` only.
4. **Auth** — Reuse US-14.5. Do **not** edit `lib/auth/*` allowlist. Keep `/profile` off `isPublicPath`.

---

## Abuse Cases Considered

- *As a malicious actor, I can POST `{ client_id: victim, fields: … }` or `/profile?client_id=` and overwrite another Ficha viva* → **Blocked:** reject/strip tenant ids; `UPDATE … WHERE client_id = $server` only; action takes **no** tenant args.
- *As a malicious actor, I can smuggle `consent*`, `visual_mode`, `role`, `active`, `auth_user_id` in the PATCH body and escalate privileges / skip US-3.x re-confirm* → **Blocked:** Zod `.strict()` seven-key schema; unknown / forbidden keys → validation error; never written.
- *As a malicious actor, I can set `version: 999` or `updated_by: <other>` to forge audit / agent lineage* → **Blocked:** server computes `version + 1` and `updated_by = getCurrentUser().id`; client values ignored as write authority.
- *As a malicious actor, I can PATCH when I have no profile row and invent a Ficha viva without completing Entrevista* → **Blocked:** no INSERT on this path; missing row → typed error; FE CTA → `/interview` (US-1.3 owns create).
- *As a malicious actor, I can open a public `PATCH /api/profile/:id` or CSRF from `https://evil.example`* → **Blocked:** Server Action only; POST + origin check; `requireActive("handler")`; no public Route Handler by UUID.
- *As a malicious actor, I put `<script>` / HTML in edited fields and execute them after save* → **Blocked:** controlled inputs; display as React text nodes only; no `dangerouslySetInnerHTML`.
- *As an Operator, I can pass `as_client_id` and edit another Cliente* → **Blocked:** no Operator branch; own `client_id` only. Cross-tenant UI out of V1.
- *As a malicious actor, I call the action unauthenticated or inactive* → **Blocked:** `requireActive("handler")` → **401** / **403**; no write.
- *As a malicious actor, I force a 500 that dumps jsonb `fields` or log full free text* → **Blocked:** typed errors; log **code only**; no free-text fields in production logs.
- *As a malicious actor, I ship `getBusinessProfileForAgents` into a Client Component “for preview after edit”* → **Blocked:** US-2.3 out of scope; must not be introduced or client-imported here.
- *As a malicious actor, I reopen Entrevista status or rewrite `source_interview_id` via this PATCH* → **Blocked:** edit path does not touch interview `status` or `source_interview_id`; only allowlisted `fields` + server audit columns.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-2.2 are binding. Items marked **(added)** are new in this review — paste them into the story when the PO next edits USER_STORIES. Do not drop or weaken any existing `[SEC]` line. Do not check boxes in USER_STORIES from this gate.

**Inherited (still binding on `/profile` + profile read/write paths):**

- [ ] **[SEC] Interview sessions / profiles are loaded only for the client resolved via server-side `getCurrentUser()`;** no `client_id` accepted from the request body or query string
- [ ] **[SEC] Free-text answers / profile fields are stored as data and always rendered escaped;** never interpolated into HTML, SQL, or shell
- [ ] **[SEC] Stub/profile route `/profile` lives under `app/(app)/`, is not on `isPublicPath`, uses `requireActive("page")`, sends `Cache-Control: no-store`** (US-1.3 / US-2.1 — do not weaken when adding edit)
- [ ] **[SEC] Profile is fetched by the server-resolved current user; the endpoint does not accept an arbitrary `client_id` parameter from the browser** (US-2.1)

**US-2.2 story `[SEC]` (existing):**

- [ ] **[SEC] PATCH accepts an explicit allowlist of editable fields; consent flags, `visual_mode` rules, and system fields cannot be modified through this endpoint even if present in the payload**
- [ ] **[SEC] Every edit records who changed it (server-resolved user) and bumps `version`, so agent runs can be traced to the profile version they consumed**

**Added in this review:**

- [ ] **[SEC] (added) Mutation is a Server Action only** (CONTRACT name e.g. `updateBusinessProfile`): POST + Next.js origin/CSRF check; `requireActive("handler")` before any write. Unauthenticated → **401**; inactive → **403**; no side effects. **No** public Route Handler `PATCH`/`PUT`/`POST` profile by tenant or profile id
- [ ] **[SEC] (added) Action takes no `client_id` / `profile_id` / `id` / `source_interview_id` / `as_client_id` arguments as write authority.** Identity from `getCurrentUser().id` only. `UPDATE` always `WHERE client_id = $server`. Prove arity / ignore-foreign-id in tests
- [ ] **[SEC] (added) Body validated with Zod `.strict()` against the full seven-key completeness schema** (`services`, `zone`, `tone`, `offers`, `objections`, `style`, `restrictions` only). Unknown keys (including consent*, `visual_mode` / Preferencias keys, `client_id`, `role`, `active`, `auth_user_id`, client `version` / `updated_at` / `updated_by`, `source_interview_id`, profile `id`) → **validation error**; **never written**
- [ ] **[SEC] (added) Full seven-key replace of `fields` on success** (FE may edit one section in UI but submits merged complete snapshot). No sparse merge that can leave half-corrupt jsonb for agents
- [ ] **[SEC] (added) On success server sets:** `fields` = validated object; `version = version + 1`; `updated_at` via existing trigger and/or explicit set; **`updated_by = getCurrentUser().id`**. Client cannot supply write authority for those columns
- [ ] **[SEC] (added) Migration adds nullable `updated_by uuid` FK → `neuramark_clients(id)`** (ON DELETE SET NULL or RESTRICT per CONTRACT). Set on every successful PATCH. Satisfies “records who” — logs-only is **not** sufficient for this story
- [ ] **[SEC] (added) Missing own profile → typed error (e.g. `PROFILE_NOT_FOUND`); no INSERT / upsert-create via this action.** Edit UI must not appear without an existing row; keep CTA → `/interview`
- [ ] **[SEC] (added) Do not mutate `source_interview_id`, interview `status`, or create `profile_versions` rows** on this path
- [ ] **[SEC] (added) No Operator cross-tenant edit.** No `as_client_id`, no `requireOperator` bypass. Operator role still resolves to **own** `client_id` only
- [ ] **[SEC] (added) XSS bar on edit + display:** controlled inputs for the seven sections; saved values render as React text nodes / PrimeReact children only — **no** `dangerouslySetInnerHTML`, no `eval`, no HTML string concatenation from `fields`
- [ ] **[SEC] (added) Mutation response / revalidated props are minimal:** fields + `version` + `updatedAt` (and optional subtle display). Must **omit** Auth tokens, `auth_user_id`, `role`, service-role internals, other tenants’ data. Prefer omit profile UUID / `client_id` / `source_interview_id` from client-visible props
- [ ] **[SEC] (added) Do not log full free-text `fields` in production** — codes / static strings only
- [ ] **[SEC] (added) RLS remains enabled on `neuramark_business_profiles`, deny-by-default, zero named policies;** service-role Node only; parameterized writes only. No browser Supabase
- [ ] **[SEC] (added) `/profile` remains off `isPublicPath` with `Cache-Control: no-store`** after edit UI lands; do not add the route to the public allowlist
- [ ] **[SEC] (added) Restricted-field re-confirmation AC:** consent / Preferencias de producción visual cannot be changed via this endpoint; dedicated US-3.x flows own re-confirm. Do not add consent/visual toggles on `/profile`
- [ ] **[SEC] (added) Do not introduce or client-bundle `getBusinessProfileForAgents`** (US-2.3)
- [ ] **[SEC] (added) Automated security tests cover at least:** allowlist happy path; smuggled consent/visual/system keys rejected; foreign `client_id` ignored; version increments; `updated_by` set from server user; missing row → typed error (no create); unauthenticated/inactive rejected; no public Route Handler profile mutate

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Surface and CSRF — **Server Action only** (APPROVE)

| Rule | Detail |
|---|---|
| Mutation | `updateBusinessProfile` (or CONTRACT exact name) — Server Action under `(app)` / `lib/profile/` |
| HTTP | POST-only; Next.js Server Action origin check (same class as `submitInterview` / persist) |
| Auth | `requireActive("handler")` inside action before any DB write |
| Forbidden | Public Route Handler `PATCH`/`PUT`/`POST` `/api/profile` (any tenant/profile id) |

#### 2. Identity and IDOR — **server user only** (APPROVE)

| Rule | Detail |
|---|---|
| Args | **No** tenant/profile ids as write authority. Arity without `client_id` / `profile_id` / `id` / `as_client_id` |
| Query | `UPDATE … WHERE client_id = user.id` only |
| Strip | Reject/strip `client_id`, `profile_id`, `id`, `source_interview_id`, `role`, `auth_user_id`, `active` if present |

#### 3. Allowlist / mass assignment — **Zod `.strict()` + seven keys** (APPROVE)

- Schema: reuse `interviewAnswersCompleteSchema` (or shared `BusinessProfileFields` schema) — **`.strict()`**.
- Editable keys only: `services`, `zone`, `tone`, `offers`, `objections`, `style`, `restrictions`.
- Reject (do not silent-strip): consent*, `visual_mode` / Preferencias keys, system columns, privilege keys, unknown keys.
- Persist: **full replace** of `fields` with validated object (merged FE snapshot OK).

#### 4. Missing profile — **reject, do not create** (APPROVE)

| Case | Behavior |
|---|---|
| No row for current user | Typed error; **no INSERT**. FE: no edit chrome; CTA → `/interview` |
| Row exists (incl. orphan interview edge) | Allow edit (same as US-2.1 show rule) |
| Foreign id ever supplied | Ignore; still target own row only — or better, no id surface at all |

#### 5. Audit columns — **`updated_by` + version bump** (APPROVE)

| Column | Rule |
|---|---|
| `version` | `version = version + 1` on every successful edit; client cannot set |
| `updated_at` | Existing trigger and/or explicit; **visible** after save (LWW AC) |
| `updated_by` | **Migration required:** nullable `uuid` FK → `neuramark_clients(id)`; set from `getCurrentUser().id` on each PATCH. Logs-only **rejected** as insufficient for USER_STORIES [SEC] |

#### 6. Concurrency — **last-write-wins** (APPROVE — residual accepted)

- No If-Match / version precondition required for V1 AC.
- Visible `updated_at` after save is the Cliente-facing signal.
- Optional stale-toast is product nicety, not a security gate.

#### 7. XSS and render (APPROVE)

- Edit: controlled inputs / PrimeReact form bindings only.
- Display (incl. after save): React text nodes / children only — same bar as US-2.1.
- No markdown/HTML renderers on profile fields in V1.

#### 8. Consent / Preferencias AC interpretation (APPROVE)

- USER_STORIES “Restricted fields require explicit re-confirmation” → **cannot** change consent/visual via this story.
- Dedicated re-confirm flows remain US-3.x.
- Do not add fake consent toggles on `/profile`.

#### 9. Response DTO minimality (APPROVE)

- Return / revalidate: seven field sections + `version` + `updatedAt`.
- Prefer omit: profile UUID, `client_id`, `source_interview_id`, tokens, `auth_user_id`, `role`; `updated_by` optional omit from client props (server column still written).

### Required implementation constraints

1. **Extend** `lib/profile/*` with `import "server-only"` mutation — do not fork a parallel writer that accepts tenant ids.
2. **Reuse** US-2.1 `getBusinessProfileForClient` for load; do not weaken arity-0 identity rules.
3. **Do not edit** auth modules except verifying `/profile` stays off `isPublicPath` and keeps `no-store`.
4. **DB:** verify US-1.3 table; **one** additive migration for `updated_by` only; **no** `profile_versions`; do not change `source_interview_id` on edit; do not add Preferencias/consent columns here.
5. **No new packages.** No browser Supabase. No LLM / queue / spend.
6. **Do not** reopen Entrevista / write interview `status` from this action.
7. **Tests (security-relevant):** allowlist happy path; `.strict()` rejects consent/visual/system/unknown; foreign `client_id` ignored; version +1; `updated_by` = server user; missing → no create; CSRF/session required; XSS regression (no `dangerouslySetInnerHTML`); `/profile` still not public + `no-store`.

### Vetoes (would block BUILD)

| If implementers… | Verdict |
|---|---|
| Accept `client_id` / `profile_id` / `id` / `source_interview_id` / `as_client_id` from browser as write authority | **REJECT** |
| Silent-strip unknown keys instead of Zod `.strict()` reject (or otherwise write non-allowlisted keys) | **REJECT** |
| Write consent / `visual_mode` / Preferencias / `role` / `active` / `auth_user_id` via this PATCH | **REJECT** |
| INSERT / upsert-create profile when no row exists (bypass US-1.3) | **REJECT** |
| Trust client-supplied `version`, `updated_at`, or `updated_by` as write authority | **REJECT** |
| Ship public Route Handler profile mutate/GET-by-id | **REJECT** |
| Add `/profile` to `isPublicPath` or drop `requireActive` / `no-store` | **REJECT** |
| Ship Operator cross-tenant edit | **REJECT** |
| Render or bind profile free text via `dangerouslySetInnerHTML` / unescaped HTML | **REJECT** |
| Create `profile_versions` history table in this story | **REJECT** (Fuera V1) |
| Put `@supabase/supabase-js` or service-role in Client Components | **REJECT** |
| Implement or client-import `getBusinessProfileForAgents` | **REJECT** (US-2.3) |
| Log full free-text `fields` in production | **REJECT** |
| Satisfy “records who” with logs-only (no `updated_by` column) | **REJECT** |
| Sparse partial PATCH that can leave incomplete/corrupt `fields` jsonb without completeness Zod | **REJECT** |

None of the SPEC-REVIEW orchestrator product defaults trigger a redesign veto.

---

## Future-Proofing Notes

- **US-2.3** `getBusinessProfileForAgents(clientId)` is **server-only** and may take an internal `clientId` from **trusted server callers** (agent jobs), not from the browser. Keep distinct from Cliente arity-0 loader and from this PATCH. Agents should read bumped `version` + current `fields` from the same row this story mutates.
- **US-3.x** owns Preferencias de producción visual and Consentimiento de avatar — append-only consent ledger and re-confirm flows must never be shortcuttable by profile PATCH mass assignment (already blocked here).
- **Multi-tenancy / RLS:** deny-by-default + server `client_id` remains the IDOR defense; enabling tenant RLS policies later is additive and must not rely on client-supplied ids.
- **Optimistic locking:** V1 LWW is accepted; if concurrent-edit complaints appear in production, add If-Match / version precondition later without changing identity rules.
- **Prompt injection:** edited `fields` remain untrusted data for later agents — store/render as data here; delimit in US-4.x.
- **`updated_by`:** FK to `neuramark_clients(id)` keeps audit in the app tenancy model; do not store raw auth tokens. Prefer omit from FE props until an audit UI story needs it.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-2.2/CONTRACT.md` exists, verify before coding proceeds:

- [ ] `updateBusinessProfile` (name frozen): Server Action; `requireActive("handler")`; **no** tenant/profile args; `WHERE client_id = user.id`
- [ ] Zod `.strict()` full seven-key body; reject consent / visual / system / unknown; full `fields` replace
- [ ] Success: bump `version`; set `updated_at`; set `updated_by` from server user; return minimal view slice; `revalidatePath("/profile")`
- [ ] Missing row → typed error; **no** create
- [ ] Migration: `updated_by` nullable FK → `neuramark_clients(id)`; no `profile_versions`
- [ ] CSRF: Server Action only; no public profile mutate Route Handler
- [ ] `/profile` edit UI: Save + Cancel; await + toast; XSS bar; no consent/visual editors; missing → CTA `/interview`
- [ ] EN/ES: Ficha viva / Living profile; Style / Estilo; no CONTEXT _Evitar_
- [ ] Out of scope: US-2.3, Preferencias / Consentimiento editors, Operator cross-tenant, auth redesign, LLM, `profile_versions`, redo Entrevista, new packages, browser Supabase
- [ ] Inherited floors unchanged: RLS, parameterized writes, server-only Supabase, no fields free text in logs, `no-store`, off `isPublicPath`

---

## CONTRACT freeze list (binding summary)

1. **Surface:** Server Action `updateBusinessProfile` (CONTRACT exact name) on `/profile` under `(app)`; POST + origin/CSRF; `requireActive("handler")`; **no** public Route Handler mutate/GET-by-id.  
2. **Identity:** no `client_id` / profile id / `as_client_id` write authority; `UPDATE … WHERE client_id = getCurrentUser().id` only.  
3. **Allowlist:** Zod `.strict()` full seven-key object (`services`…`restrictions`); reject consent / Preferencias (`visual_mode`…) / system / privilege / unknown keys; **full `fields` replace**.  
4. **Audit:** on success `version = version + 1`; `updated_at` set/trigger; **`updated_by = getCurrentUser().id`** via new nullable FK column (migration in scope). Client cannot set these.  
5. **Missing profile:** typed error; **no INSERT**; FE keeps CTA → `/interview`.  
6. **Concurrency:** last-write-wins; visible `updated_at` after save; no required If-Match for V1.  
7. **XSS:** controlled inputs + React text nodes only — no `dangerouslySetInnerHTML`.  
8. **Route/cache:** `/profile` off `isPublicPath`; `Cache-Control: no-store`; do not weaken.  
9. **DTO:** minimal success/view slice (fields + `version` + `updatedAt`); omit secrets / privilege / prefer omit UUIDs; no full `fields` in logs.  
10. **Out of scope:** `profile_versions`; US-2.3 agent helper; Preferencias / Consentimiento editors; Operator cross-tenant; auth redesign; LLM; redo Entrevista; browser Supabase; new packages.

---

## BUILD vetoes (summary)

1. Client-supplied `client_id` / profile id / `source_interview_id` / `as_client_id` as write authority (IDOR).  
2. Mass assignment: writing non-allowlisted keys, or silent-strip instead of Zod `.strict()` reject for unknown/consent/visual/system.  
3. Privilege escalation: mutating consent / Preferencias de producción visual / `role` / `active` / `auth_user_id` via this PATCH.  
4. Create-via-PATCH / INSERT when no own row exists (bypass Entrevista completeness).  
5. Client-trusted `version` / `updated_at` / `updated_by`; or logs-only “who” without `updated_by` column.  
6. Public Route Handler profile mutate (or GET-by-id API).  
7. CSRF-weak surface (non–Server Action anonymous mutate) or unauthenticated/inactive writes.  
8. XSS via unescaped / `dangerouslySetInnerHTML` on edit or display.  
9. Operator cross-tenant edit; `profile_versions` table; client-bundled `getBusinessProfileForAgents`.  
10. Service-role or Supabase in the browser; logging full free-text `fields`; public `/profile` or weakened `no-store`.
