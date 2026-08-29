# Security Design Review — US-3.2

**Story:** US-3.2 — Capture consent for own avatar  
**Date:** 2026-08-29  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-3.2 `[SEC]`), `plan/SECURITY_BASELINE.md` §2 (“Consent as an immutable ledger”), `plan/stories/US-3.1/SECURITY.md` + QA Medium (multi-row probe), `plan/stories/US-3.2/README.md`, `TASKS.md`, `SPEC-REVIEW.md` (ALIGNED), SPEC §3 S3.M4 Consentimiento  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct and SPEC-aligned: ship **Consentimiento de avatar** as an **append-only ledger** on **`neuramark_avatar_consents`**; grant only via an **explicit affirmative Server Action** (never as a side effect of Preferencias upsert); revoke by setting **`revoked_at` only** on the active row (**never DELETE**; never mutate historical `consented_at` / `consent_version`); store server-owned **`consent_version`** matching the disclosure text shown; treat consent as **active** only when latest non-revoked row’s version **equals** the current server constant; harden **`hasActiveAvatarConsent`** for multi-row fail-closed probes; keep Preferencias rejecting `own_avatar` without active consent; export **stubs** for job-time re-check and revoke→cancel queued own-avatar jobs (full enforcement US-8.x / US-10.x); RLS deny-by-default + service-role Node only; no browser Supabase; IDOR via session-bound identity only.

No REDESIGN. No veto of SPEC-REVIEW / PO leans on: Preferencias-page Consentimiento UI, no silent Preferencias rewrite on revoke, grant body `{ affirmed, consentVersion }`, revoke = UPDATE `revoked_at` only, job/cancel stubs, partial unique active row. Orchestrator may proceed to **CONTRACT.md** after freezing the items below.

**Inherited floors (US-1.x / US-2.2 / US-2.3 / US-3.1 / US-14.5 — do not weaken):** identity only via `getCurrentUser()` / `requireActive()`; strip/reject browser `client_id`; Preferencias upsert continues to reject `own_avatar` when probe false (US-3.1); Preferencias save **must never** grant/revoke consent; Ficha viva PATCH still rejects Preferencias / consent keys (US-2.2); agents helper remains `import "server-only"` and must **omit consent ledger internals** (US-2.3); parameterized SQL; no `@supabase/supabase-js` in Client Components; disclosure / UI copy as React text nodes only (no `dangerouslySetInnerHTML`); gated settings off `isPublicPath` with `Cache-Control: no-store`.

**This story owns:** `neuramark_avatar_consents` migration; hardened `hasActiveAvatarConsent`; grant + revoke Server Actions; consent status loader; disclosure version constant + EN/ES disclosure UI; Preferencias continuity against real ledger; job re-check stub + revoke→cancel stub (invoke-tested).

**This story does not own:** US-3.3 uploads / `media_assets`; US-3.4 QA disclosure UI; full `neuramark_video_jobs` cancel schema / Operator review UI (US-8.x / US-10.x); Preferencias allowlist schema reopen; Ficha viva consent editors; auth redesign; browser Supabase; public Route Handler with tenant ids.

**Terminology:** **Consentimiento de avatar** · **Avatar propio autorizado** · **Preferencias de producción visual** · **Cliente** · **Operator** · **Ficha viva**. Technical tokens (`own_avatar`, `neuramark_avatar_consents`, `consent_version`) OK in code/DB/engineering docs only — never primary UI headlines. Do not use CONTEXT _Evitar_ terms (esp. “consent ledger” as product label) in CONTRACT product copy or EN/ES headlines.

---

### Threat Summary (US-3.2–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **In-place rewrite / DELETE of consent history** | Destroy audit trail; forge “never consented” or alter disclosure version after grant | Append-only: grant/re-consent = **INSERT**; revoke = set **`revoked_at` only**; **never DELETE**; never UPDATE `consented_at` / `consent_version` / `client_id`. Partial unique `(client_id) WHERE revoked_at IS NULL` |
| **Consent as Preferencias side effect** | Likeness authorization without affirmative disclosure | Preferencias upsert **must not** INSERT/UPDATE ledger. Grant Action requires `{ affirmed: true }` + `consentVersion` echo matching server constant |
| **Stale / client-supplied `consent_version`** | Bind grant to wrong disclosure text; skip re-consent after legal copy change | Version is **server constant** (`AVATAR_CONSENT_DISCLOSURE_V*`). Client may echo only; mismatch → reject grant. Active probe requires version **equals** current constant |
| **IDOR via `client_id` / consent id / `?id=` / `as_client_id`** | Read/grant/revoke another Cliente’s Consentimiento | Actions/loader: no tenant id as authority. `WHERE client_id = $server` only. Reject/strip browser tenant ids |
| **Fail-open / multi-row probe bug** | Treat error as consented, or misread multi-row ledger (US-3.1 QA Medium) | Fail closed on missing table / error / no active matching row. Query: `revoked_at IS NULL`, order `consented_at` desc, limit 1; **and** version = current constant |
| **Revoke without blocking new jobs / queued jobs** | Likeness generation after withdrawal | Preferencias + UI disable + job stub re-check. Revoke **must** invoke `cancelQueuedOwnAvatarJobs(clientId)` (no-op-safe if jobs absent). In-flight Operator flag = documented TODO for US-8/US-10 |
| **Cached “consented” flag on Preferencias** | Bypass live ledger after revoke | Preferencias allowlist is **not** consent authority. Every `own_avatar` eligibility path ANDs live `hasActiveAvatarConsent`. No silent Preferencias rewrite on revoke (APPROVED — see § Design Concerns) |
| **Concurrent double-active rows** | Ambiguous “active” state; probe races | Partial unique index on `client_id WHERE revoked_at IS NULL`. Grant path must fail cleanly if unique violated |
| **XSS on disclosure / legal copy** | Script via HTML disclosure | i18n / trusted copy as React text / structured markup — **no** `dangerouslySetInnerHTML` |
| **CSRF / public consent API** | Cross-site grant/revoke | Server Actions only; POST + Next.js origin check; `requireActive("handler")`. No public `/api/…` with tenant ids |
| **Over-exposure in DTO / agents** | Leak ledger history, tokens, foreign consents | Loader returns own minimal status (`active`, `consentedAt`, `consentVersion` as needed) — **omit** full history dump, Auth tokens, privilege fields. Agents DTO stays consent-blind (US-2.3) |
| **Grant/revoke enqueues video jobs** | Surprise spend / likeness use | Mutations = ledger write + stubs + `revalidatePath` only. **No** job enqueue from grant/revoke |

**Residual risk accepted:** Full cancel of queued jobs and Operator in-flight flag are **stubs** until job tables exist — same phased pattern as US-3.1 soft probe; SEC AC satisfied by real helpers + invoke tests, not live provider cancel. Stale `own_avatar` remaining in Preferencias after revoke is **accepted** if every consumer ANDs live consent (no silent rewrite). Hardcoded local user via `getCurrentUser()` until auth stories land is sanctioned, not a finding. Legal review of EN/ES disclosure copy is outside this gate.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| `neuramark_avatar_consents` rows | **Highest** — legal likeness authorization; biometric-adjacent class (SECURITY_BASELINE) | Service-role Node write; append-only rules; never browser Supabase |
| `consent_version` + disclosure text | Highest — binds grant to exact legal text | Server constant + i18n; client echo only |
| `consented_at` / `revoked_at` | Highest — audit timestamps | Server-set only; never client-supplied |
| Active Consentimiento probe | Highest — gates Preferencias `own_avatar` and (later) jobs/uploads | Fail-closed helper; version-aware; multi-row safe |
| Preferencias allowlist (adjacent) | High — eligibility menu, **not** consent authority | US-3.1 continuity; must AND live consent |
| Cancel-queue stub / job assert helper | High — revoke immediacy + future job gate | Server-only; no-op-safe; never trust client “cancel done” |
| `client_id` / `CurrentUser.id` | High — tenancy key | Only from `getCurrentUser()` / `requireActive`. Never body/query/headers |
| Consentimiento UI + disclosure | Medium–High | `(app)` + `requireActive` + `no-store`; XSS bar |
| Session cookie (`sb-*`) | High — US-14.5 | Unchanged; CSRF via Server Action |
| Service-role key | Critical | Node only. Never Client Components |

**Boundaries:**

1. **Browser → grant Server Action** — Untrusted body may include `{ affirmed: true, consentVersion }` only. CSRF via Next.js origin check. `requireActive("handler")` before validate/write. Identity never from body. Server stamps `consented_at` + stores current constant as `consent_version`.
2. **Browser → revoke Server Action** — No tenant id. Optional empty/affirmed body per CONTRACT. Sets `revoked_at` on **own** active row only; invokes cancel stub; no Preferencias auto-mutation.
3. **Browser → settings RSC + Consentimiento UI** — Session identifies user; arity-0 loader returns own status. No `client_id` query param. Preferencias page (PO lean) or dedicated route — both gated.
4. **Next.js → Postgres** — Parameterized INSERT / targeted UPDATE `revoked_at` / SELECT where `client_id = user.id`. Service-role Node; RLS enabled, **zero** named policies on `neuramark_avatar_consents`.
5. **Preferencias upsert → consent ledger** — **No write boundary.** Upsert must not grant/revoke.
6. **Revoke → jobs** — Call stub only; must not invent job tables or Operator UI. Job create (future) must call assert/probe live — never Preferencias flag alone.
7. **US-2.2 PATCH / US-2.3 agents** — Remain consent-blind; do not reopen.
8. **Auth** — Reuse US-14.5. Keep settings / consent path off `isPublicPath`. `Cache-Control: no-store`.

---

## Abuse Cases Considered

- *As a malicious actor, I can UPDATE historical `consent_version` / `consented_at` or DELETE rows to erase the audit trail* → **Blocked:** application forbids those mutations; revoke touches `revoked_at` only; never DELETE; tests prove append-only. Partial unique prevents dual-active.
- *As a malicious actor, I can save Preferencias with `own_avatar` and get a consent row as a side effect* → **Blocked:** Preferencias upsert never writes the ledger; grant is a separate Action with affirmative + version echo.
- *As a malicious actor, I can POST `{ affirmed: true, consentVersion: "v999" }` or omit affirmation and still grant* → **Blocked:** Zod requires `affirmed === true` and `consentVersion ===` server constant; else reject, no INSERT.
- *As a malicious actor, I can POST `{ client_id: victim }` or `/settings/preferences?client_id=` and grant/revoke for another Cliente* → **Blocked:** reject/strip tenant ids; all queries `WHERE client_id = $server`; arity 0 / no tenant args as authority.
- *As a malicious actor, I can revoke then rely on a cached Preferencias `own_avatar` flag to create a video job* → **Blocked:** job stub/helper re-checks live consent; Preferencias allowlist is not authority; Preferencias upsert still rejects without active consent.
- *As a malicious actor, I can change disclosure copy in i18n without bumping the constant and keep old grants “active”* → **Blocked (process + probe):** CONTRACT freezes constant string tied to shipped disclosure; active = non-revoked **and** version equals current constant; bump ⇒ re-consent.
- *As a malicious actor, I force the probe to throw / return multiple rows and treat that as consented* → **Blocked:** errors → `false`; multi-row query filters `revoked_at IS NULL`, orders, limits 1; version mismatch → `false`.
- *As a malicious actor, I open a public `POST /api/avatar-consent` or CSRF from `https://evil.example`* → **Blocked:** Server Actions only; POST + origin check; `requireActive("handler")`.
- *As a malicious actor, I put `<script>` in disclosure or rely on HTML injection* → **Blocked:** trusted i18n / text nodes; no `dangerouslySetInnerHTML`.
- *As an Operator, I can pass `as_client_id` and revoke another Cliente’s consent* → **Blocked:** no Operator cross-tenant branch; own `client_id` only. In-flight flag UI is US-8/US-10.
- *As a malicious actor, I call grant/revoke unauthenticated or inactive* → **Blocked:** `requireActive` → **401** / **403**; no write.
- *As a malicious actor, I dump full consent history or tokens via loader / agents DTO* → **Blocked:** minimal status DTO; agents omit ledger internals.
- *As a malicious actor, I grant or revoke and trigger silent video/TTS jobs* → **Blocked:** mutation non-goals forbid enqueue; only ledger + stubs + revalidate.
- *As a malicious actor, I INSERT a second active row to confuse the probe* → **Blocked:** partial unique index; grant handles unique violation as error (fail closed for ambiguous state — do not pick an arbitrary row as “active” without uniqueness).

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-3.2 are binding. Items marked **(added)** are new in this review — paste them into the story when the PO next edits USER_STORIES. Do not drop or weaken any existing `[SEC]` line. Do not check boxes in USER_STORIES from this gate.

**Inherited (still binding on adjacent surfaces — do not weaken):**

- [ ] **[SEC] Interview sessions / profiles are loaded only for the client resolved via server-side `getCurrentUser()`;** no `client_id` accepted from the request body or query string *(Cliente paths)*
- [ ] **[SEC] PATCH accepts an explicit allowlist of editable fields; consent flags, `visual_mode` rules, and system fields cannot be modified through this endpoint even if present in the payload** *(US-2.2 — consent / Preferencias remain rejected on Ficha viva PATCH)*
- [ ] **[SEC] `getBusinessProfileForAgents` is a server-only module** and **contract output excludes consent record internals** *(US-2.3)*
- [ ] **[SEC] Preferencias modality values are validated server-side against the enum; selecting / persisting `own_avatar` is rejected server-side when no active consent exists**, independent of UI disabling *(US-3.1 — continuity against real ledger)*
- [ ] **[SEC] Free-text / disclosure strings are stored as data and always rendered escaped;** never interpolated into HTML, SQL, or shell

**US-3.2 story `[SEC]` (existing — binding interpretations below):**

- [ ] **[SEC] Consent records are append-only:** revocation sets `revoked_at` on the existing active row; consent rows are never updated in place (except `revoked_at`) or deleted, preserving a full audit trail
- [ ] **[SEC] The exact disclosure text version shown at consent time (`consent_version`) is stored with the record;** changing the disclosure text requires re-consent under a new version
- [ ] **[SEC] Consent status is re-checked server-side at video-job creation time** (not only at mode selection), so a revocation between selection and generation still blocks the job *(this story: export + unit-test helper/stub; full job create = US-8.x / US-10.x)*
- [ ] **[SEC] Consent can only be granted via an explicit affirmative action recorded with server timestamp;** no endpoint or Server Action can set consent as a side effect of another operation
- [ ] **[SEC] Revocation takes effect immediately for new jobs and cancels queued (not yet submitted) own-avatar jobs; in-flight provider jobs are flagged for operator review** *(this story: immediate Preferencias/probe effect + invoke `cancelQueuedOwnAvatarJobs` stub; in-flight Operator flag = documented TODO for US-8/US-10 — do not invent Operator UI)*

**Added in this review:**

- [ ] **[SEC] (added) Table `neuramark_avatar_consents`:** `id` PK, `client_id` FK → `neuramark_clients`, `consented_at` (timestamptz, server-set), `consent_version` (text, server constant), `revoked_at` (nullable timestamptz). **RLS enabled, deny-by-default, zero named policies;** service-role Node only; parameterized queries; `neuramark_` prefix on all DB objects. No browser Supabase
- [ ] **[SEC] (added) Partial unique index** on `(client_id) WHERE revoked_at IS NULL` so at most one active row per Cliente. Grant must not leave dual-active state
- [ ] **[SEC] (added) Append-only mutation rules:** grant / re-consent = **INSERT** only; revoke = **UPDATE `revoked_at` (and only that consent field)** on the single active row for `$server` client; **never DELETE**; **never UPDATE** `consented_at`, `consent_version`, or `client_id`. Automated tests prove these invariants
- [ ] **[SEC] (added) Active consent definition (fail closed):** `hasActiveAvatarConsent(clientId)` returns **`true` only** when a row exists with `client_id = $id`, `revoked_at IS NULL`, and `consent_version` equals the **current** server disclosure constant; else **`false`**. Missing table / no row / revoked / version mismatch / probe error / invalid `clientId` → **`false`**. Never default `true`; never invent rows
- [ ] **[SEC] (added) Multi-row-safe probe (US-3.1 QA Medium):** query filters `revoked_at IS NULL`, orders by `consented_at` desc, limits to one row (`.limit(1)` / `.maybeSingle()` on the active subset). Unit test: multi-row history + one active matching version → `true`; only revoked / version-mismatched → `false`
- [ ] **[SEC] (added) Grant Server Action** (CONTRACT name): `requireActive("handler")`; Zod `.strict()` body with **`affirmed: true`** and **`consentVersion`** must equal server constant; server sets `consented_at` + stores constant as `consent_version`; identity from session only. Reject/strip `client_id`, consent row `id`, `as_client_id`, `revoked_at`, privilege keys, unknown keys
- [ ] **[SEC] (added) Revoke Server Action** (CONTRACT name): `requireActive("handler")`; sets `revoked_at` on own active row only; **must invoke** `cancelQueuedOwnAvatarJobs(clientId)` (idempotent no-op if jobs table absent); **must not** silently rewrite Preferencias allowlist; **must not** DELETE ledger rows
- [ ] **[SEC] (added) Preferencias upsert must not grant or revoke** Consentimiento (no INSERT/UPDATE on `neuramark_avatar_consents` from that path). Continuity: `own_avatar` ∈ allowlist ⇒ active consent required (`OWN_AVATAR_CONSENT_REQUIRED`)
- [ ] **[SEC] (added) Preferencias allowlist is not consent authority:** after revoke, stale `own_avatar` in Preferencias (if left) must not authorize jobs/uploads/generation. Every `own_avatar` eligibility path ANDs live `hasActiveAvatarConsent`. Optional UI warning that allowlist still lists Avatar propio until Cliente edits — CONTRACT may include; product copy must not claim allowlist was cleared
- [ ] **[SEC] (added) Video-job re-check stub:** export server helper (CONTRACT name e.g. `assertActiveAvatarConsentForJob`) that fails closed when consent inactive; unit-tested; documented as mandatory call site for US-8/US-10 job create. No job table writes required in this story
- [ ] **[SEC] (added) Loader arity 0:** returns own minimal consent status (`active`, `consentedAt` ISO UTC, `consentVersion` as needed) for `$server` only — omit full ledger history, tokens, `auth_user_id`, `role`, other tenants
- [ ] **[SEC] (added) Surfaces:** Consentimiento UI on gated settings (PO lean `/settings/preferences`); Server Actions only; **no** public Route Handler with tenant ids; off `isPublicPath`; `Cache-Control: no-store`; `requireActive("page"|"handler")`
- [ ] **[SEC] (added) XSS bar:** disclosure and Consentimiento copy from i18n / trusted sources; render as React text nodes / structured markup without raw HTML inject — **no** `dangerouslySetInnerHTML`, no `eval`
- [ ] **[SEC] (added) No silent regenerate / job enqueue from grant or revoke** — ledger write + stubs + `revalidatePath` only. Automated test proves no inserts into job/strategy tables and no generation module calls
- [ ] **[SEC] (added) No Operator cross-tenant consent edit.** No `as_client_id`, no `requireOperator` bypass. Operator role still resolves to **own** `client_id` only for these Actions
- [ ] **[SEC] (added) Do not log full disclosure text dumps / unnecessary PII in production** — codes / static strings only
- [ ] **[SEC] (added) Do not create `media_assets` or full job-cancel Operator UI in this story** (US-3.3 / US-8 / US-10)
- [ ] **[SEC] (added) Automated security tests cover at least:** grant → active (version stored); revoke → inactive + Preferencias `own_avatar` rejected; version mismatch → inactive / grant rejected; multi-row probe; foreign `client_id` ignored; Preferencias save does not grant; stub cancel invoked on revoke; job assert helper fail-closed; unauthenticated/inactive rejected; append-only (no DELETE / no historical field mutate); XSS regression (no `dangerouslySetInnerHTML`); settings route not public + `no-store`

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Append-only ledger — **APPROVE (hard)**

| Operation | Allowed mutation |
|---|---|
| Grant / re-consent (same or new version) | **INSERT** new row; server `consented_at`; `consent_version` = current constant; `revoked_at` NULL |
| Revoke | **UPDATE `revoked_at` only** on the single active row for `$server` |
| Re-consent after revoke | **INSERT** (new `consented_at`; same version OK if disclosure unchanged) |
| DELETE | **Forbidden** |
| UPDATE `consented_at` / `consent_version` / `client_id` | **Forbidden** |

Interpretation of parent AC “never updated in place” **and** “sets `revoked_at` on the existing row”: revoke is the **sole** in-place exception, limited to `revoked_at`.

#### 2. Active semantics + version match — **APPROVE (hard)**

| Case | `hasActiveAvatarConsent` |
|---|---|
| Table missing / not configured | **`false`** |
| No row / only revoked rows | **`false`** |
| Active row (`revoked_at IS NULL`) but `consent_version` ≠ current constant | **`false`** (re-consent required) |
| Latest active row matches current constant | **`true`** |
| Probe / unique-violation ambiguity / error | **`false`** |

Server constant name frozen in CONTRACT (e.g. `AVATAR_CONSENT_DISCLOSURE_V1`). Bumping the constant after disclosure copy change is a **required** process for implementers.

#### 3. Multi-row probe harden — **APPROVE (mandatory first BE work)**

Per US-3.1 QA Medium: filter `revoked_at IS NULL`, order `consented_at` desc, limit 1; then apply version match. Preferencias gate continues to call this helper.

#### 4. Explicit grant only — **APPROVE (hard)**

| Rule | Detail |
|---|---|
| Surface | Dedicated grant Server Action — not Preferencias upsert, not Ficha viva PATCH, not loader |
| Body | `{ affirmed: true, consentVersion }` must match server constant; Zod `.strict()` |
| Timestamp | Server `consented_at` only — reject client-supplied timestamps |
| Identity | `getCurrentUser().id` / `requireActive` only |

#### 5. Revoke immediacy + stubs — **APPROVE WITH CONDITIONS**

| Requirement | This story |
|---|---|
| New Preferencias / probe | Immediate — probe false after revoke |
| Cancel queued own-avatar jobs | **Stub** `cancelQueuedOwnAvatarJobs(clientId)` — idempotent no-op if jobs table absent; **must be invoked** on revoke success; unit-test with mock |
| Flag in-flight for Operator | **Documented TODO** in stub for US-8/US-10 — no Operator UI |
| Job-time re-check | Export `assertActiveAvatarConsentForJob` (or equivalent) + unit tests; full job create later |

Do **not** mark full parent “reject video jobs / cancel queue” AC as done without stub evidence + Preferencias reject. Validator: stub + Preferencias gate suffice for US-3.2 CLOSE.

#### 6. No silent Preferencias rewrite on revoke — **APPROVE (no veto)**

SPEC-OK PO lean accepted. **Condition:** Preferencias allowlist **must not** be treated as consent. CONTRACT non-goals / notes must state: revoke does not auto-strip `own_avatar`; UI may warn; Strategy/jobs/uploads **must** AND live consent. Auto-strip is **not** required and would be a silent preference mutation without Cliente edit intent.

#### 7. Identity / IDOR — **server user only** (APPROVE)

| Rule | Detail |
|---|---|
| Args | **No** tenant/consent ids as authority. Arity 0 loader; grant/revoke take no tenant args as authority |
| Query | All ledger ops `WHERE client_id = user.id` |
| Strip | Reject/strip `client_id`, consent `id`, `as_client_id`, `role`, `auth_user_id`, `active`, client `consented_at` / `revoked_at` spoof |

#### 8. UI placement — **APPROVE (PO lean)**

Consentimiento on `/settings/preferences` (disclosure + grant/revoke beside Avatar propio) is acceptable. Dedicated `/settings/avatar-consent` also acceptable if FE prefers — both must remain gated + `no-store`. Exact chrome freezes in CONTRACT. **No security veto** of same-page placement.

#### 9. DB constraints — **APPROVE**

- Table: **`neuramark_avatar_consents`**
- Partial unique: `(client_id) WHERE revoked_at IS NULL`
- Index supporting active probe (CONTRACT freezes exact index names)
- RLS deny-by-default; service-role Node only
- Do **not** create `media_assets` or full video-jobs cancel schema here

#### 10. XSS / CSRF / i18n — **APPROVE**

- Disclosure: EN + ES versioned copy; text nodes only
- Mutations: Server Actions; POST + origin check; `requireActive("handler")`
- No public consent Route Handler with tenant ids

---

### Required implementation constraints

1. Consent modules under server-only paths (`import "server-only"` for loaders/helpers/actions).
2. Harden `hasActiveAvatarConsent` **before** relying on grant/revoke in Preferencias gate (first BE task).
3. Do **not** weaken US-2.2 strip of consent / Preferencias on Ficha viva PATCH.
4. Do **not** dump ledger into `getBusinessProfileForAgents`.
5. Do **not** edit auth allowlist except ensuring settings/consent path stays gated + `no-store`.
6. Migrations via Supabase only; `neuramark_` prefix; no ad-hoc SQL.
7. **No new packages** without justification. No browser Supabase. No LLM / queue / spend from grant/revoke.
8. **Tests (security-relevant):** append-only; version match; multi-row probe; explicit grant; Preferencias non-side-effect; revoke + stub cancel invoke; job assert fail-closed; IDOR; CSRF/session; XSS; route not public.

### Vetoes (would block BUILD)

| If implementers… | Verdict |
|---|---|
| Accept `client_id` / consent id / `as_client_id` from browser as read/write authority | **REJECT** |
| DELETE consent rows, or UPDATE historical `consented_at` / `consent_version` / `client_id` | **REJECT** |
| Grant consent as side effect of Preferencias save / Ficha viva PATCH / any non-grant Action | **REJECT** |
| Accept client-writable arbitrary `consent_version` without matching server constant, or grant without `affirmed: true` | **REJECT** |
| Fail-open probe (errors / missing table / version mismatch treated as consented) | **REJECT** |
| Ship dual-active rows without partial unique (or equivalent hard uniqueness) | **REJECT** |
| Treat Preferencias allowlist alone as consent authority for jobs/generation | **REJECT** |
| Skip invoke of cancel stub on revoke, or skip exporting job assert helper | **REJECT** |
| Enqueue jobs / regenerate strategy/scripts/media / call providers on grant or revoke | **REJECT** |
| Ship public Route Handler consent mutate/GET-by-tenant-id | **REJECT** |
| Add settings/consent path to `isPublicPath` or drop `requireActive` / `no-store` | **REJECT** |
| Render disclosure via `dangerouslySetInnerHTML` / unescaped HTML | **REJECT** |
| Ship Operator cross-tenant consent edit or invent Operator review UI under this story | **REJECT** |
| Put `@supabase/supabase-js` or service-role in Client Components | **REJECT** |
| Dump full ledger history / tokens into loader or `visualModeSummary` | **REJECT** |
| Log full disclosure dumps in production | **REJECT** |
| Create `media_assets` / full job-cancel schema under this story’s BUILD | **REJECT** (siblings) |

None of the SPEC-REVIEW / PO product defaults trigger a redesign veto. **No silent Preferencias rewrite** is **not** vetoed.

---

## Future-Proofing Notes

- **US-3.3** uploads must gate on the **same** live `hasActiveAvatarConsent` (active + current version) — never a Preferencias flag alone.
- **US-8.x / US-10.x** job create **must** call the assert helper exported here; revoke cancel stub becomes real cancel + Operator in-flight flag — do not invent a second “consented” cache column.
- **US-3.4 / US-10.2** non-overridable legal class: missing/revoked/version-mismatched consent remains `blocking` — never overridable.
- **Disclosure bumps:** changing legal copy without bumping `AVATAR_CONSENT_DISCLOSURE_V*` is a process failure; probe correctly forces re-consent only when the constant changes.
- **Multi-tenancy / RLS:** deny-by-default + server `client_id` remains the IDOR defense; enabling tenant policies later is additive and must not rely on client-supplied ids.
- **Do not** later merge consent grant into Preferencias upsert “for convenience” — that recreates side-effect authorization and audit gaps.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-3.2/CONTRACT.md` exists, verify before coding proceeds:

- [ ] Table: `neuramark_avatar_consents`; columns; partial unique active; RLS deny-by-default; service-role Node only
- [ ] Append-only rules: INSERT grant; UPDATE `revoked_at` only; never DELETE; never mutate historical consent fields
- [ ] Active probe: multi-row safe + version match current constant; fail closed
- [ ] Grant Action: `affirmed` + `consentVersion` echo; server timestamp; no tenant id; Zod `.strict()` strip list
- [ ] Revoke Action: `revoked_at` only; invoke cancel stub; no Preferencias silent rewrite
- [ ] Loader: arity 0; minimal DTO; ISO UTC `consentedAt`
- [ ] Stubs: `assertActiveAvatarConsentForJob` + `cancelQueuedOwnAvatarJobs`; unit-tested; in-flight TODO documented
- [ ] Preferencias continuity: reject `own_avatar` without active consent; upsert never writes ledger
- [ ] Surfaces: gated settings (path frozen); Server Actions only; `no-store`; off `isPublicPath`
- [ ] XSS / CSRF / EN+ES CONTEXT terms; no “consent ledger” product label; no recording prompts
- [ ] Non-goals: no US-3.3 uploads; no full job cancel UI; no Ficha viva consent writes; no Preferencias schema reopen; no browser Supabase
- [ ] Automated tests listed for append-only, version, multi-row, IDOR, Preferencias non-side-effect, stub invoke, job assert

---

## CONTRACT freeze list (binding summary)

1. **Table:** `neuramark_avatar_consents` — append-only ledger; RLS deny-by-default; partial unique one active per `client_id`; service-role Node only.  
2. **Append-only:** grant/re-consent = INSERT; revoke = `revoked_at` only; never DELETE; never mutate historical consent fields.  
3. **Active:** fail-closed; `revoked_at IS NULL` + `consent_version` = current server constant; multi-row-safe query (US-3.1 QA Medium).  
4. **Grant:** explicit Server Action only; `{ affirmed: true, consentVersion }` must match server constant; server `consented_at`; no Preferencias side effect.  
5. **Revoke:** immediate for probe/Preferencias gate; invoke cancel stub; no silent Preferencias rewrite; in-flight Operator flag = TODO stub.  
6. **IDOR:** session-bound only; reject/strip browser tenant ids; arity-0 loader.  
7. **Job re-check:** export assert helper for US-8/US-10; Preferencias allowlist ≠ consent authority.  
8. **Boundaries:** Server Actions under `(app)`; CSRF; XSS text nodes; no browser Supabase; no public tenant Route Handler.

---

## BUILD vetoes (summary)

1. Client-supplied `client_id` / consent id / `as_client_id` as authority (IDOR).  
2. DELETE / historical field rewrite of consent rows.  
3. Consent grant as Preferencias (or other) side effect.  
4. Fail-open probe or version-blind “any non-revoked = active.”  
5. Missing partial unique (dual-active) or multi-row-unsafe probe.  
6. Preferencias allowlist alone authorizing likeness jobs/generation.  
7. Skip cancel stub invoke or job assert export.  
8. Silent regenerate / job enqueue on grant/revoke.  
9. Public Route Handler / CSRF-weak anonymous mutate; XSS via `dangerouslySetInnerHTML`.  
10. Ledger dump in DTO/agents; browser Supabase; public settings path / weakened `no-store`; US-3.3/full job UI creep.

---

## Open questions — SECURITY resolutions

| # | Question | Resolution |
|---|---|---|
| 1 | UI placement Preferencias vs dedicated route | **APPROVE PO lean** (same page). Dedicated route also OK. CONTRACT freezes chrome. No security veto. |
| 2 | Active = version match? | **Yes (hard).** Latest non-revoked **and** `consent_version` = current constant; else inactive / re-consent. |
| 3 | Grant arity / body | **Body required:** `{ affirmed: true, consentVersion }` must equal server constant. No `client_id`. |
| 4 | Revoke mutation shape | **UPDATE `revoked_at` only** on active row; INSERT for re-consent; never DELETE. |
| 5 | Re-consent after revoke same version | **Allowed** (new INSERT, new `consented_at`). Disclosure text change ⇒ bump constant. |
| 6 | Disclosure copy ownership | FE drafts EN/ES; constant string freezes in CONTRACT; legal review outside this gate. |
| 7 | Video-job stub depth | **Idempotent no-op** if jobs absent; invoke-on-revoke + helper unit tests required. |
| 8 | In-flight Operator flag | **Stub TODO** for US-8/US-10; no Operator UI in 3.2. |
| 9 | Preferencias allowlist after revoke | **No silent rewrite (APPROVE).** Live consent is authority; optional UI warning. |
| 10 | Multiple concurrent active rows | **Partial unique required** `(client_id) WHERE revoked_at IS NULL`. |
| 11 | Timestamp timezone / display | Server UTC store; ISO in loader DTO; FE locale format. |

---

## Recommended action

**APPROVE WITH CONDITIONS.** Proceed to **CONTRACT.md** (nextjs-backend). Binding floors above must appear in CONTRACT before BUILD. FE SIGNOFF required after CONTRACT (Consentimiento UI is in scope).

**CONTRACT may proceed:** **Yes.**
