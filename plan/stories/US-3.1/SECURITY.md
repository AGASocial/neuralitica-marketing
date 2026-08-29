# Security Design Review — US-3.1

**Story:** US-3.1 — Choose visual production mode  
**Date:** 2026-08-29  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-3.1 `[SEC]` + US-3.2 / US-3.4 SEC continuity notes), `plan/SECURITY_BASELINE.md` (likeness / Preferencias), `plan/stories/US-2.2/SECURITY.md` + `US-2.3/SECURITY.md` (inherited floors), `plan/stories/US-3.1/README.md`, `TASKS.md`, `SPEC-REVIEW.md` (ALIGNED), SPEC §3 S3.M4 Preferencias  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct and SPEC-aligned: ship **Preferencias de producción visual** as a **multi-select allowlist** (SPEC S3.M4 wins over singular USER_STORIES `visual_mode` wording) on a gated settings surface under `(app)` (PO lean `/settings/preferences`); persist to **`neuramark_visual_preferences`** (UNIQUE `client_id`); mutate via **Server Action** (arity 0 — identity from `getCurrentUser()` / `requireActive()` only); Zod-validate allowlist ⊆ `{ own_avatar | generic_avatar | faceless }`; **reject persist if `own_avatar` ∈ allowlist and no active Consentimiento** — **fail closed** if consent table/row absent (pre–US-3.2 soft gate); require structured `faceless_style` when `faceless` ∈ allowlist; server-derive optional `rules` (e.g. `must_disclose_not_owner` when `generic_avatar` selected) — **never client-writable**; **no** silent regenerate / job enqueue on save; **no** Preferencias writes via US-2.2 Ficha viva PATCH; RLS deny-by-default + service-role Node only; XSS bar on mode explanations; CSRF via Server Action origin check.

No REDESIGN. No veto of SPEC-REVIEW / PO leans (allowlist, SPEC table name, fail-closed consent, separate settings surface, no silent regen, stub `generic_avatar_id` / server `rules`, optional minimal `visualModeSummary` from allowlist). Orchestrator may proceed to **CONTRACT.md** after freezing the items below.

**Inherited floors (US-1.x / US-2.1 / US-2.2 / US-2.3 / US-14.5 — do not weaken):** identity only via `getCurrentUser()` / `requireActive()`; strip/reject browser `client_id`; Ficha viva PATCH still rejects Preferencias / `visual_mode` / consent keys (US-2.2); agents helper remains `import "server-only"` and must **omit consent internals** (US-2.3); parameterized SQL; no `@supabase/supabase-js` in Client Components; free-text / copy as React text nodes only (no `dangerouslySetInnerHTML`); gated routes off `isPublicPath` with `Cache-Control: no-store`.

**This story owns:** Preferencias settings UI + Server Action upsert; `neuramark_visual_preferences` migration; enum/allowlist SEC; fail-closed soft consent gate helper; server-owned rules stub; no-regen proof; optional populate `visualModeSummary` from allowlist.

**This story does not own:** US-3.2 Consentimiento ledger UI/API / revoke / `consent_version`; US-3.3 uploads / `media_assets`; US-3.4 QA disclosure UI (stub rules OK); Modalidad de producción per slot (US-4.x); talking-head / B-roll / TTS job enqueue; Ficha viva Preferencias editors; auth redesign; browser Supabase.

**Terminology:** **Preferencias de producción visual** · **Cliente** · **Operator** · **Avatar propio autorizado** · **Avatar genérico profesional** · **Video sin rostro** / **B-roll / sin presencia** · **Consentimiento de avatar** · **Ficha viva** · **Modalidad de producción** (future per-slot only). Enums `own_avatar` \| `generic_avatar` \| `faceless` OK in code/DB only — never primary UI headlines. Do not use CONTEXT _Evitar_ terms in CONTRACT product copy or EN/ES headlines.

---

### Threat Summary (US-3.1–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Arbitrary mode strings / enum bypass** | Persist unknown modalities; confuse Strategy / jobs; skip legal gates | Zod: allowlist is a **non-empty set** ⊆ `{ own_avatar, generic_avatar, faceless }` only. Unknown tokens → validation error. DB CHECK / enum type preferred |
| **`own_avatar` without Consentimiento** | Likeness misuse; legal exposure (SECURITY_BASELINE highest class) | Server rejects if `own_avatar` ∈ set and `hasActiveAvatarConsent(clientId)` is false. UI disable is **not** authority. **Fail closed** if ledger table missing / no row / revoked / query error |
| **IDOR via `client_id` / prefs id / `?id=` / `as_client_id`** | Read/write another Cliente’s Preferencias | Action/loader arity 0. `WHERE client_id = $server` only. Reject/strip tenant ids from body/query |
| **Mass assignment of `rules` / legal flags** | Client clears `must_disclose_not_owner` or forges disclosure flags | `rules` **server-derived only**. Strip/reject client `rules`, `must_disclose_not_owner`, consent*, privilege keys. Zod `.strict()` on client-writable slice |
| **Preferencias write via Ficha viva PATCH** | Bypass settings SEC / consent gate via US-2.2 | Do **not** reopen PATCH allowlist. Continuity: US-2.2 still rejects Preferencias keys. Separate table + surface |
| **Silent regenerate / spend on save** | Unwanted LLM/video/TTS jobs; cost abuse; surprise content | Upsert Preferencias + `revalidatePath` **only**. No job enqueue, strategy/script/media regenerate, provider calls. Automated test proves no generation side effects |
| **Consent helper fail-open** | Missing US-3.2 table treated as “consented” | Helper returns **`false`** if table absent, no non-revoked row, or probe errors. Never default `true`. Do **not** invent consent rows |
| **XSS on mode explanations / faceless copy** | Stored or reflected script via free-text style fields | Controlled inputs / PrimeReact; explanations from i18n (trusted); any stored `faceless_style` values render as React text / select enums — **no** `dangerouslySetInnerHTML` |
| **CSRF / public Route Handler** | Cross-site mutate Preferencias; classic IDOR API | **Server Action only**; POST + Next.js origin check; `requireActive("handler")`. No public `/api/…` with tenant ids |
| **Unauthenticated / inactive mutate** | Anonymous or deactivated account sets modalities | `requireActive("handler"|"page")` → **401** / **403**; no side effects |
| **Over-exposure in DTO / agent summary** | Consent ledger, tokens, privilege, foreign prefs leak | Minimal settings DTO; `visualModeSummary` = allowlist summary only — **omit** consent internals (US-2.3 strip intact) |
| **Empty allowlist / unbounded jsonb** | Corrupt menu for Strategy; DoS via huge `faceless_style` | CONTRACT: non-empty allowlist (or explicit empty = “none selected” with clear product rule — freeze one). Cap `faceless_style` size; constrained enums where possible |

**Residual risk accepted:** Pre–US-3.2, Avatar propio is effectively unavailable (fail closed) — intended. V1 hard-disables only missing consent (not missing assets) — selection may persist without references; **job-time** reject without assets remains US-3.3 / US-8.x (do not conflate). Soft `rules` stub does not yet enforce QA (US-3.4). Concurrent LWW on Preferencias upsert accepted (visible `updated_at`). Hardcoded local user via `getCurrentUser()` until auth stories land is sanctioned, not a finding.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| `neuramark_visual_preferences` allowlist | High — drives Modalidad de producción eligibility; legal gate for own-avatar | Service-role Node write; Zod set ⊆ enum; consent gate before persist |
| `faceless_style` jsonb | Medium — production preference; possible free-text axes | Structured + constrained; XSS bar on render |
| `rules` / `must_disclose_not_owner` | Highest — legal disclosure flag | **Server-derived only**; never client write authority |
| `generic_avatar_id` | Low–Medium — stub / FK later | Nullable; client may send null only in V1; do not invent catalog trust |
| Active Consentimiento probe | Highest — legal backbone (US-3.2) | Read-only helper; fail closed; **no** consent grant as side effect of Preferencias save |
| `client_id` / `CurrentUser.id` | High — tenancy key | Only from `getCurrentUser()` / `requireActive`. Never body/query/headers |
| Settings HTML + form | Medium | `(app)` + `requireActive` + `no-store`; XSS bar |
| `visualModeSummary` (agents) | Medium — LLM fuel later | Minimal allowlist projection; omit consent; server-only helper path |
| Ficha viva PATCH surface | Medium — adjacent | Must remain Preferencias-blind (US-2.2) |
| Session cookie (`sb-*`) | High — US-14.5 | Unchanged; CSRF via Server Action |
| Service-role key | Critical | Node only. Never Client Components |

**Boundaries:**

1. **Browser → Preferencias Server Action** — Untrusted POST body (allowlist + optional `faceless_style` / `generic_avatar_id`). CSRF via Next.js origin check. `requireActive("handler")` before validate/consent-check/write. Identity never from body.
2. **Browser → settings RSC + Client form** — Session identifies user; load own Preferencias via arity-0 loader. Optional consent-availability boolean from server (no ledger dump). No `client_id` query param.
3. **Next.js → Postgres** — Parameterized upsert/`SELECT` where `client_id = user.id`. Service-role Node; RLS enabled, **zero** named policies on `neuramark_visual_preferences`. Consent probe parameterized; table-missing → treat as no consent (no invent).
4. **Preferencias upsert → generation / jobs** — **No outbound boundary.** Mutation must not call job tables, strategy/script/media generators, or providers.
5. **US-2.2 PATCH** — Remains a separate boundary; Preferencias keys stay rejected.
6. **Auth** — Reuse US-14.5. Keep settings path off `isPublicPath`. Extend `Cache-Control: no-store` to the new gated surface.

---

## Abuse Cases Considered

- *As a malicious actor, I can POST `{ allowed_modes: ["own_avatar", "god_mode"] }` or a free-form `visual_mode` string and persist arbitrary modalities* → **Blocked:** Zod set ⊆ enum only; unknown → validation error; never written.
- *As a malicious actor, I can enable `own_avatar` while Consentimiento table is missing or I never consented* → **Blocked:** `hasActiveAvatarConsent` returns false (fail closed); server rejects persist; UI disable is not the only control.
- *As a malicious actor, I can POST `{ client_id: victim, allowed_modes: […] }` or `/settings/preferences?client_id=` and overwrite another Cliente’s Preferencias* → **Blocked:** reject/strip tenant ids; upsert `WHERE client_id = $server` only; action takes **no** tenant args.
- *As a malicious actor, I can send `rules: { must_disclose_not_owner: false }` or clear legal flags when selecting generic* → **Blocked:** `rules` not in client-writable schema; server sets/clears disclosure stub from allowlist membership.
- *As a malicious actor, I can smuggle Preferencias / `visual_mode` / consent into Ficha viva PATCH and skip this story’s gates* → **Blocked:** US-2.2 `.strict()` continue to reject; do not reopen PATCH; Preferencias live on separate table/surface.
- *As a malicious actor, I can save Preferencias and trigger silent strategy/video/TTS jobs to burn budget or publish likeness* → **Blocked:** mutation non-goals forbid enqueue/regenerate; tests assert no job/strategy inserts and no generation module calls.
- *As a malicious actor, I can grant myself Consentimiento as a side effect of Preferencias save* → **Blocked:** upsert never writes `neuramark_avatar_consents` (or invents the table); consent grant is US-3.2 only (explicit affirmative action).
- *As a malicious actor, I can open a public `POST /api/visual-preferences` or CSRF from `https://evil.example`* → **Blocked:** Server Action only; POST + origin check; `requireActive("handler")`.
- *As a malicious actor, I put `<script>` in faceless style free-text or rely on HTML in mode explanations* → **Blocked:** i18n explanations trusted; stored values as React text / constrained selects; no `dangerouslySetInnerHTML`.
- *As an Operator, I can pass `as_client_id` and edit another Cliente’s Preferencias* → **Blocked:** no Operator branch; own `client_id` only. Cross-tenant UI out of V1.
- *As a malicious actor, I call the action unauthenticated or inactive* → **Blocked:** `requireActive` → **401** / **403**; no write.
- *As a malicious actor, I dump consent ledger or tokens via settings response / `visualModeSummary`* → **Blocked:** minimal DTO; agent summary = allowlist only; omit consent internals.
- *As a malicious actor, I force fail-open: make the consent probe throw and treat errors as “consented”* → **Blocked:** probe errors / missing relation → **no consent** (reject `own_avatar`); never fail open.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-3.1 are binding. Interpret singular `visual_mode` wording as **allowlist membership** (SPEC S3.M4 / SPEC-REVIEW ALIGNED). Items marked **(added)** are new in this review — paste them into the story when the PO next edits USER_STORIES. Do not drop or weaken any existing `[SEC]` line. Do not check boxes in USER_STORIES from this gate.

**Inherited (still binding on adjacent surfaces — do not weaken):**

- [ ] **[SEC] Interview sessions / profiles are loaded only for the client resolved via server-side `getCurrentUser()`;** no `client_id` accepted from the request body or query string *(Cliente / profile paths)*
- [ ] **[SEC] PATCH accepts an explicit allowlist of editable fields; consent flags, `visual_mode` rules, and system fields cannot be modified through this endpoint even if present in the payload** *(US-2.2 — Preferencias remain rejected on Ficha viva PATCH)*
- [ ] **[SEC] `getBusinessProfileForAgents` is a server-only module** and **contract output excludes consent record internals** *(US-2.3 — if `visualModeSummary` is populated, omit consent)*
- [ ] **[SEC] Free-text answers / preference-related strings are stored as data and always rendered escaped;** never interpolated into HTML, SQL, or shell

**US-3.1 story `[SEC]` (existing — apply to allowlist):**

- [ ] **[SEC] Preferencias modality values are validated server-side against the enum** (`own_avatar` \| `generic_avatar` \| `faceless`); **selecting / persisting `own_avatar` (alone or in the allowlist) is rejected server-side when no active consent exists**, independent of UI disabling (defense in depth with US-3.2)

**US-3.4 continuity (stub in this story — binding if `rules` column ships):**

- [ ] **[SEC] `must_disclose_not_owner` is set server-side as a consequence of mode selection and is not client-writable through any endpoint** *(if rules stub is included in US-3.1 CONTRACT)*

**Added in this review:**

- [ ] **[SEC] (added) Preferencias = multi-select allowlist** persisted on **`neuramark_visual_preferences`** (UNIQUE `client_id` FK → `neuramark_clients`). Not a single rigid account mode column as the product schema. Representation frozen in CONTRACT (`allowed_modes text[]` / jsonb / equivalent) with DB constraint that every element ∈ enum
- [ ] **[SEC] (added) Mutation is a Server Action only** (CONTRACT name e.g. `upsertVisualPreferences`): POST + Next.js origin/CSRF check; `requireActive("handler")` before any write. Unauthenticated → **401**; inactive → **403**; no side effects. **No** public Route Handler with tenant ids
- [ ] **[SEC] (added) Action and settings loader take no `client_id` / prefs id / `as_client_id` as authority.** Identity from `getCurrentUser().id` only. All reads/writes `WHERE client_id = $server`. Prove arity / ignore-foreign-id in tests
- [ ] **[SEC] (added) Client-writable body validated with Zod `.strict()`** against allowlist (+ `faceless_style` when required; nullable `generic_avatar_id` stub only). **Reject** (do not silent-strip): unknown modes, `rules` / `must_disclose_not_owner`, consent*, `client_id`, `role`, `active`, `auth_user_id`, client `updated_at`, unknown keys
- [ ] **[SEC] (added) Consent soft gate is fail-closed:** helper `hasActiveAvatarConsent(clientId)` (CONTRACT exact name) returns **`false`** when the consent table does not exist, no non-revoked row exists, row is revoked, or the probe errors. Preferencias upsert **rejects** if `own_avatar` ∈ allowlist and helper is false. **Never** default true; **never** invent consent rows; Preferencias save **must not** grant consent as a side effect
- [ ] **[SEC] (added) When `faceless` ∈ allowlist, `faceless_style` is required** and validated as structured jsonb with CONTRACT-frozen keys/enums (voice + on-screen text + B-roll/stock axes). Reject free-form-only blobs that bypass schema
- [ ] **[SEC] (added) Server-owned `rules` (if column present):** when `generic_avatar` ∈ allowlist, server may set `must_disclose_not_owner: true`; when not, clear/omit per CONTRACT. Client cannot set or clear these flags
- [ ] **[SEC] (added) No silent regenerate:** successful upsert writes Preferencias (+ `updated_at`) and may `revalidatePath` only. **Must not** enqueue jobs, regenerate strategy/scripts/media, or call providers. Automated test proves no inserts into job/strategy tables and no calls to generation modules
- [ ] **[SEC] (added) Do not write Preferencias onto `neuramark_business_profiles.fields`** and do not reopen US-2.2 PATCH to accept Preferencias keys
- [ ] **[SEC] (added) Settings surface** (CONTRACT path lean `/settings/preferences`) lives under `app/(app)/`, is **not** on `isPublicPath`, uses `requireActive("page")`, sends `Cache-Control: no-store`. Not on Ficha viva `/profile` edit chrome
- [ ] **[SEC] (added) XSS bar:** mode explanations from i18n / trusted copy; form controls controlled / PrimeReact; stored preference values render as React text nodes / select options only — **no** `dangerouslySetInnerHTML`, no `eval`, no HTML concatenation from preference fields
- [ ] **[SEC] (added) Response / agent summary minimality:** settings DTO returns own allowlist + style stub + `updatedAt` as needed — omit Auth tokens, `auth_user_id`, `role`, service-role internals, other tenants’ data, consent ledger. If populating `visualModeSummary`, project **allowlist only** (no consent internals)
- [ ] **[SEC] (added) RLS enabled on `neuramark_visual_preferences`, deny-by-default, zero named policies;** service-role Node only; parameterized queries only; `neuramark_` prefix on all DB objects. No browser Supabase
- [ ] **[SEC] (added) No Operator cross-tenant Preferencias edit.** No `as_client_id`, no `requireOperator` bypass. Operator role still resolves to **own** `client_id` only
- [ ] **[SEC] (added) Do not log full preference jsonb / PII-adjacent bodies in production** — codes / static strings only
- [ ] **[SEC] (added) Do not create full `neuramark_avatar_consents` ledger or consent grant/revoke APIs in this story** (US-3.2). Soft read/probe only
- [ ] **[SEC] (added) Automated security tests cover at least:** allowlist happy path; unknown enum rejected; `own_avatar` without consent rejected (incl. missing-table / fail-closed case); `faceless` without style rejected; client `rules` / `must_disclose_not_owner` rejected; foreign `client_id` ignored; US-2.2 PATCH still rejects Preferencias keys; no job/strategy enqueue on save; unauthenticated/inactive rejected; no public Route Handler; XSS regression (no `dangerouslySetInnerHTML`); settings route not public + `no-store`

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Consent soft-gate semantics — **fail closed** (APPROVE)

| Case | `hasActiveAvatarConsent` | Persist `own_avatar` ∈ allowlist |
|---|---|---|
| Consent table does not exist yet | **`false`** | **Reject** |
| Table exists, no row for client | **`false`** | **Reject** |
| Row exists, `revoked_at` set | **`false`** | **Reject** |
| Active non-revoked row (US-3.2+) | **`true`** | Allow (other validation OK) |
| Probe / query error | **`false`** | **Reject** |

- UI disable when false is UX only — server is authority.
- Preferencias upsert **must not** INSERT/UPDATE consent ledger or treat save as consent grant.
- Full append-only ledger + revoke + re-consent versions = **US-3.2**.

#### 2. Identity / IDOR — **server user only** (APPROVE)

| Rule | Detail |
|---|---|
| Args | **No** tenant/prefs ids as authority. Arity 0 for Cliente loader + upsert |
| Query | `SELECT`/`UPSERT` … `WHERE client_id = user.id` only |
| Strip | Reject/strip `client_id`, prefs `id`, `as_client_id`, `role`, `auth_user_id`, `active` if present |

#### 3. Allowlist shape — **SPEC multi-select** (APPROVE)

| Rule | Detail |
|---|---|
| Product | Preferencias = set of accepted modalities (multi-selección) |
| Tokens | `own_avatar` \| `generic_avatar` \| `faceless` only |
| Validation | Set ⊆ enum; reject unknown; CONTRACT freezes empty-set policy (recommend: allow empty = none selected **or** require ≥1 — pick one explicitly) |
| Storage | Column(s) on `neuramark_visual_preferences` — **not** singular product `mode` as the only schema; not inside `neuramark_business_profiles.fields` |
| Parent AC | “Three modes selectable” / “Mode stored” = modalities in Preferencias shown on settings — not Ficha viva fields |

#### 4. Strip / reject list (client payloads) — **APPROVE**

**Never client-writable (reject if present):**

- `rules`, `must_disclose_not_owner` (and any other legal/disclosure flags)
- consent*, `consented_at`, `consent_version`, `revoked_at`
- `client_id`, prefs row `id`, `as_client_id`
- `role`, `active`, `auth_user_id`
- client-supplied `updated_at` / audit spoof fields
- unknown keys (Zod `.strict()`)

**Client-writable (within Zod):** allowlist tokens; `faceless_style` when `faceless` included; `generic_avatar_id` null-only stub in V1 (CONTRACT may forbid non-null until catalog exists).

**Server-owned on write:** `client_id` from session; `updated_at`; `rules` derived from allowlist if column ships.

#### 5. Surface / CSRF — **Server Action + gated settings page** (APPROVE)

| Rule | Detail |
|---|---|
| Page | Under `(app)`; PO lean `/settings/preferences`; **not** `/profile` edit |
| Mutation | Server Action only; POST + origin check; `requireActive("handler")` |
| Forbidden | Public Route Handler Preferencias by UUID/tenant; GET mutate |
| Cache | `Cache-Control: no-store`; off `isPublicPath` |

#### 6. No silent regenerate — **APPROVE (hard)**

Mutation = upsert Preferencias + revalidate settings (and nav if needed) **only**.  
CONTRACT non-goals must list: no job enqueue, no strategy/script/media regenerate, no provider calls.  
Tests are the security evidence for this AC.

#### 7. XSS / i18n (APPROVE)

- Explanations/examples: translation files / trusted copy — not client HTML.
- `faceless_style`: prefer constrained enums; any string axes → React text nodes only.
- No markdown/HTML renderers on preference fields in V1.

#### 8. Agent `visualModeSummary` (APPROVE WITH CONDITIONS)

- Optional in same BUILD: when Preferencias row exists, set minimal allowlist summary; if absent, keep `null`.
- **Omit** consent internals, ledger rows, revoke state.
- Remains inside `getBusinessProfileForAgents` server-only path — never client-bundle.

#### 9. DB (APPROVE)

- Table: **`neuramark_visual_preferences`**
- UNIQUE `client_id` → `neuramark_clients`
- RLS deny-by-default; service-role Node only
- Do **not** create full consent ledger or `media_assets` here

---

### Required implementation constraints

1. Preferencias modules under server-only paths (`import "server-only"` for loaders/helpers/actions).
2. Do **not** weaken US-2.2 strip of Preferencias on Ficha viva PATCH — add regression test if practical.
3. Do **not** edit auth allowlist except ensuring settings path stays gated + `no-store`.
4. Migrations via Supabase only; `neuramark_` prefix; no ad-hoc SQL.
5. **No new packages** without justification. No browser Supabase. No LLM / queue / spend from this mutation.
6. Consent probe is read-only fail-closed — do not ship US-3.2 APIs under this story.
7. **Tests (security-relevant):** enum/allowlist; consent fail-closed (incl. missing table); IDOR ignore foreign id; rules not client-writable; no-regen; PATCH boundary; CSRF/session; XSS regression; route not public.

### Vetoes (would block BUILD)

| If implementers… | Verdict |
|---|---|
| Accept `client_id` / prefs id / `as_client_id` from browser as read/write authority | **REJECT** |
| Persist modes outside `{ own_avatar, generic_avatar, faceless }` or skip Zod set validation | **REJECT** |
| Allow `own_avatar` when consent helper is false / fail-open on missing table or errors | **REJECT** |
| Default consent to true, invent consent rows, or grant consent as side effect of Preferencias save | **REJECT** |
| Accept client-writable `rules` / `must_disclose_not_owner` / consent* | **REJECT** |
| Write Preferencias via Ficha viva PATCH or into `neuramark_business_profiles.fields` | **REJECT** |
| Enqueue jobs / regenerate strategy/scripts/media / call providers on preference save | **REJECT** |
| Ship public Route Handler Preferencias mutate/GET-by-tenant-id | **REJECT** |
| Add settings path to `isPublicPath` or drop `requireActive` / `no-store` | **REJECT** |
| Render preference/explanation content via `dangerouslySetInnerHTML` / unescaped HTML | **REJECT** |
| Ship Operator cross-tenant Preferencias edit | **REJECT** |
| Put `@supabase/supabase-js` or service-role in Client Components | **REJECT** |
| Dump consent ledger into settings DTO or `visualModeSummary` | **REJECT** |
| Log full preference jsonb bodies in production | **REJECT** |
| Create full `neuramark_avatar_consents` grant/revoke UI/API under this story’s BUILD | **REJECT** (US-3.2) |

None of the SPEC-REVIEW / PO product defaults trigger a redesign veto.

---

## Future-Proofing Notes

- **US-3.2** append-only Consentimiento ledger replaces the soft probe with real rows; Preferencias gate and **job-time** re-check (US-8.x) must keep reading live consent — never a cached “consented” flag on Preferencias alone.
- **US-3.3** asset gates are job/production eligibility, not a reason to fail-open consent. V1 may persist `own_avatar` in allowlist only after consent exists; missing assets still block generation later.
- **US-3.4** owns QA disclosure UI / non-overridable impersonation checks; server `must_disclose_not_owner` stub here must remain non-client-writable when QA lands.
- **US-4.x** Modalidad de producción per slot ⊆ Cliente allowlist — Strategy must not invent modalities outside Preferencias; IDOR rules for agent jobs stay trusted-caller (US-2.3).
- **Multi-tenancy / RLS:** deny-by-default + server `client_id` remains the IDOR defense; enabling tenant policies later is additive and must not rely on client-supplied ids.
- **Do not** later merge Preferencias into Ficha viva PATCH “for convenience” — that recreates mass-assignment and legal-gate bypasses.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-3.1/CONTRACT.md` exists, verify before coding proceeds:

- [ ] Surface: gated settings page (path frozen); Server Action upsert; `requireActive("handler"|"page")`; **no** public Route Handler with tenant ids; `no-store`; off `isPublicPath`
- [ ] Table: `neuramark_visual_preferences`; UNIQUE `client_id`; allowlist column(s); `faceless_style`; nullable `generic_avatar_id`; `updated_at`; optional server `rules`; RLS deny-by-default
- [ ] Zod: set ⊆ enum; `.strict()`; strip list includes `rules` / consent* / tenant / privilege keys
- [ ] Consent: `hasActiveAvatarConsent` fail-closed semantics documented; reject `own_avatar` ∈ set when false; no consent side effect on save
- [ ] `faceless` ∈ set ⇒ required structured `faceless_style` (keys frozen)
- [ ] `rules` / `must_disclose_not_owner` server-derived only (if column ships)
- [ ] Non-goals: no silent regenerate / job enqueue; no US-3.2 ledger APIs; no US-3.3 uploads; no Ficha viva Preferencias writes; no per-slot modality
- [ ] Optional: `visualModeSummary` allowlist-only; omit consent
- [ ] IDOR: arity 0; `WHERE client_id = $server`
- [ ] XSS / CSRF / i18n / EN+ES CONTEXT terms
- [ ] Automated tests listed for enum, consent fail-closed, IDOR, rules strip, no-regen, PATCH boundary

---

## CONTRACT freeze list (binding summary)

1. **Consent soft gate:** `hasActiveAvatarConsent` → **false** if table missing / no active row / revoked / error; reject persist when `own_avatar` ∈ allowlist; never fail open; never grant consent on Preferencias save.  
2. **IDOR:** arity-0 loader + Server Action; `client_id = requireActive()/getCurrentUser().id` only; reject/strip browser tenant ids.  
3. **Allowlist shape:** multi-select set ⊆ `{ own_avatar, generic_avatar, faceless }` on **`neuramark_visual_preferences`** — SPEC wins over singular `visual_mode` schema.  
4. **Strip list:** reject client `rules` / `must_disclose_not_owner` / consent* / `client_id` / privilege / unknown keys; server derives disclosure stub if present.  
5. **Mutation side effects:** upsert + revalidate **only** — **no** job enqueue / silent regenerate / provider calls.  
6. **Boundaries:** settings Server Action under `(app)` (not Ficha viva PATCH); CSRF via Server Action; XSS via text nodes / i18n; RLS deny-by-default; service-role Node only.

---

## BUILD vetoes (summary)

1. Client-supplied `client_id` / prefs id / `as_client_id` as authority (IDOR).  
2. Enum bypass / unknown modality persistence.  
3. `own_avatar` without active consent, or fail-open consent probe.  
4. Consent grant as Preferencias side effect / invent ledger.  
5. Client-writable `rules` / `must_disclose_not_owner`.  
6. Preferencias via Ficha viva PATCH or `business_profiles.fields`.  
7. Silent regenerate / job enqueue / provider calls on save.  
8. Public Route Handler Preferencias by tenant id; CSRF-weak anonymous mutate.  
9. XSS via `dangerouslySetInnerHTML` / unescaped preference or explanation HTML.  
10. Consent ledger dump in DTO / `visualModeSummary`; browser Supabase; public settings path / weakened `no-store`.

---

## Open questions — SECURITY resolutions

| # | Question | Resolution |
|---|---|---|
| 1 | Allowlist vs singular `visual_mode` | **Allowlist (SPEC).** Validate set ⊆ enum; apply `[SEC]` to membership. |
| 2 | Consent before US-3.2 | **Fail closed.** Missing table/row/error ⇒ no consent ⇒ reject `own_avatar`. |
| 3 | Prove no silent regenerate | CONTRACT non-goals + automated tests (no job/strategy inserts; no generation module calls). |
| 4 | `rules` / `must_disclose_not_owner` | **Server-derived only** if column ships; never client-writable (US-3.4 SEC continuity). |
| 5 | Empty allowlist | CONTRACT must freeze explicitly (empty OK vs require ≥1). Security accepts either; do not leave ambiguous. |
| 6 | Assets hard-disable | **V1:** consent-only hard gate for Avatar propio. Missing assets ≠ invent consent; job gates later. |
| 7 | `visualModeSummary` | Minimal allowlist summary OK; **omit consent**. |
| 8 | Settings path | Gated `(app)` page; separate from `/profile`; exact path CONTRACT; `no-store`. |

---

## Recommended action

**APPROVE WITH CONDITIONS.** Proceed to **CONTRACT.md** (nextjs-backend). Binding floors above must appear in CONTRACT before BUILD. FE SIGNOFF required after CONTRACT (settings UI is in scope).

**CONTRACT may proceed:** **Yes.**
