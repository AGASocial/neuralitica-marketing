# Security Design Review — US-2.1

**Story:** US-2.1 — View canonical business profile  
**Date:** 2026-08-29  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-2.1 `[SEC]`), `plan/SECURITY_BASELINE.md` (Business Profile), `plan/stories/US-1.3/SECURITY.md` (inherited floors), `plan/stories/US-2.1/README.md`, `TASKS.md`, `SPEC-REVIEW.md` (ALIGNED), `lib/profile/get-profile-stub-summary.ts`, `app/(app)/profile/page.tsx`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct and SPEC-aligned: replace the US-1.3 **stub** at `/profile` **in place** with a **read-only Ficha viva** (all seven interview-mapped `fields`); load via **`getBusinessProfileForClient`** (CONTRACT name) scoped to **`getCurrentUser()` / `requireActive("page")` only** — **no** `client_id` / profile id from the browser; Zod-validate jsonb `fields` on read; missing own row → onboarding CTA to Entrevista (not crash / not tenant oracle); XSS bar = escaped React text nodes; `Cache-Control: no-store`; off `isPublicPath`; no Operator cross-tenant view; no PATCH / agent DTO.

No REDESIGN. No veto of orchestrator product defaults from SPEC-REVIEW (primary dashboard card — not hard redirect; Style/Estilo label; Zod-on-read; show orphan own profile; no Operator param). Orchestrator may proceed to CONTRACT.md after freezing the items below.

**Inherited floors (US-1.1 / US-1.2 / US-1.3 — do not weaken):** identity only via `getCurrentUser()` / `requireActive()`; strip/reject tenant and privilege keys; `/profile` under `(app)`, off `isPublicPath`, `Cache-Control: no-store`; parameterized SQL; RLS deny-by-default on `neuramark_business_profiles`, service-role Node only; free-text as React text nodes only (no `dangerouslySetInnerHTML`); no answers/profile free-text bodies in production logs; no `@supabase/supabase-js` in Client Components; no public profile GET by UUID.

**This story owns:** full read-only Ficha viva UI at `/profile`; `getBusinessProfileForClient` (own row or explicit missing); read-time Zod on `fields`; missing → CTA `/interview`; dashboard primary/elevated entry to `/profile` when ficha exists (no hard redirect off dashboard); replace stub content / thin-wrap or delete `getProfileStubSummary`.

**This story does not own:** submit / upsert / mark `completed` (US-1.3); PATCH / version bump for edits (US-2.2); `getBusinessProfileForAgents` (US-2.3); Preferencias de producción visual (US-3.x); Operator cross-tenant UI; auth redesign; LLM enricher; `profile_versions` table.

**Terminology:** **Ficha viva** / Living profile · **Entrevista inicial** · **Cliente** · **Operator**. Field `style` UI label: **Style** / **Estilo**. Do not use CONTEXT _Evitar_ terms (Business Profile / perfil de negocio, Brand notes / Notas de marca as primary label, cuestionario, onboarding interview, admin / administrador / staff) in CONTRACT, this file’s product-facing examples, or EN/ES copy.

---

### Threat Summary (US-2.1–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **IDOR via `client_id` / profile id / `?id=`** | Read another Cliente’s Ficha viva | Helper takes **zero** tenant params. `SELECT … WHERE client_id = $server` only. Reject/strip `client_id`, `profile_id`, `id`, `source_interview_id` if ever present on any surface |
| **Operator “view as Cliente” param** | Cross-tenant read without RBAC story | **Out of V1.** No Operator override, no `as_client_id`, no `requireOperator` branch on this page. Even Operator role loads **own** `client_id` only |
| **Public `/profile` or allowlist regression** | Anonymous scrape of Ficha viva HTML | Keep under `app/(app)/`; layout + helper `requireActive("page")`; **not** on `isPublicPath` |
| **CDN / bfcache leak of free-text fields** | Shared device / proxy shows another user’s services/zone/… | Verify `Cache-Control: no-store` on `/profile` (already from US-1.3); `force-dynamic`; do not weaken |
| **XSS via stored free-text `fields`** | Script in services/zone/restrictions executes in browser | Render as React text nodes / PrimeReact children only; lists from arrays as text; no `dangerouslySetInnerHTML`; never interpolate into HTML, SQL, or shell |
| **Info leak on missing / error** | Oracle distinguishing “no row” vs “forbidden” vs foreign tenant; stack/DB dumps | Missing own row → same soft empty + CTA to `/interview` as stub. Load failure → soft empty/error (dashboard `loadFailed` class) — **no** 500 HTML dump, **no** foreign-id 404 surface. Do not add any path that accepts another tenant’s id |
| **Malformed jsonb / Operator SQL corruption** | Crash, raw blob leak, prototype keys | Zod-validate `fields` on read (seven keys 1:1 interview). Invalid → soft empty/error + log **code only**; do not render unvalidated blob |
| **Over-exposure in view DTO** | Tokens, `auth_user_id`, `role`, other tenants, raw interview session blob | Minimal view shape: seven field sections + optional `updatedAt` / subtle `version`. Prefer **omit** `source_interview_id`, profile UUID, `client_id` from client props |
| **Public Route Handler GET `?client_id=`** | Classic IDOR API | **Prefer RSC-only.** No public `/api/profile`. Optional refresh Server Action (if CONTRACT needs it) must take **no** tenant args and call `requireActive("handler")` |
| **Mutation sneak-in (edit / PATCH)** | Privilege expansion under “view” story | Read-only UI and loader. No forms, save, or PATCH. Any mutation → **out of scope / BUILD veto** → US-2.2 |
| **Dashboard hard redirect / query tenant** | Forced nav is product; tenant in URL is IDOR | Primary card/CTA to `/profile` (SPEC). Links must not carry `client_id`. Hard redirect is **product DRIFT**, not a security redesign — CONTRACT must not freeze hard redirect |

**Residual risk accepted:** An activated Cliente who completed Entrevista can read their own free-text Ficha viva (intended). Orphan own profile without `completed` interview still shows (SPEC) — no cross-tenant leak because scope is own `client_id`. Prompt injection via profile text into later agents remains deferred to US-4.x (store as data here). Write amplification N/A (read-only).

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| `neuramark_business_profiles.fields` jsonb | Medium — business PII-adjacent; full free text now rendered (upgrade from stub) | Service-role Node read; Zod on read; RSC → escaped text only |
| `version` / `updated_at` | Low–Medium — display metadata | Own row only; optional light UI |
| `client_id` / `CurrentUser.id` | High — tenancy key | Only from `getCurrentUser()` / `requireActive`. Never query/body/headers |
| `source_interview_id` | Medium — FK / idempotency | Server-side only; prefer omit from FE props |
| Ficha viva HTML at `/profile` | Medium — full field grid | `(app)` + `requireActive` + `no-store` |
| Session cookie (`sb-*`) | High — US-14.5 | Unchanged |
| Service-role key | Critical | Node only. Never Client Components |

**Boundaries:**

1. **Browser → `/profile` RSC** — Untrusted URL/query. Session identifies user; page loads **that** Cliente’s Ficha viva or empty CTA. No `client_id` / profile id query param as identity.
2. **RSC / server helper → Postgres** — `getBusinessProfileForClient`: `requireActive("page")` then `SELECT` where `client_id = user.id`. Parameterized. No public GET list/detail by UUID.
3. **Browser → Dashboard** — Primary card/CTA links to `/profile` without tenant query params. Pre-onboarding keeps interview Start/Resume. Do not put full `fields` on the dashboard card unless CONTRACT explicitly freezes a minimal teaser (prefer link-only / existence).
4. **Next.js → Supabase** — Service-role Node; RLS enabled, **zero** named policies (unchanged from US-1.3). Verify-only table — no migration unless a proven gap.
5. **Auth** — Reuse US-14.5. Do **not** edit `lib/auth/*` allowlist. Keep `/profile` off `isPublicPath`.

---

## Abuse Cases Considered

- *As a malicious actor, I can open `/profile?client_id=<victim>` or `/profile/<uuid>` and read another Ficha viva* → **Blocked:** no dynamic tenant segment; helper arity 0; ignore/strip query ids; always `WHERE client_id = $server`.
- *As a malicious actor, I can call `getBusinessProfileForClient(victimId)` from a Server Action or forged RSC payload* → **Blocked:** function accepts **no** client/profile id argument; identity only inside via `requireActive` / `getCurrentUser().id`.
- *As an Operator, I can pass `as_client_id` / use role to view another Cliente on this page* → **Blocked:** no Operator branch; own `client_id` only. Cross-tenant UI is out of V1.
- *As a malicious actor, I open `/profile` without a session or scrape CDN/bfcache for another user’s fields* → **Blocked:** `(app)` + `requireActive("page")`; not on public allowlist; `Cache-Control: no-store`.
- *As a malicious actor, I put `<script>` / HTML in interview answers (already stored) and execute them on Ficha viva* → **Blocked:** React text nodes / PrimeReact children only; no `dangerouslySetInnerHTML`.
- *As a malicious actor, I probe missing vs forbidden to learn whether another tenant has a profile* → **Blocked:** no foreign-id surface; missing/error only ever describe **own** row (or soft load failure). Same empty CTA class — no tenant oracle.
- *As a malicious actor, I hit a public `GET /api/profile?client_id=`* → **Blocked:** no such Route Handler in this story; RSC-only preferred.
- *As a malicious actor, I ship a hidden edit form / PATCH under the view page* → **Blocked by scope:** read-only; BUILD veto → US-2.2.
- *As a malicious actor, I force a 500 that dumps jsonb `fields` or Postgres errors* → **Blocked:** Zod fail / select error → soft empty/error; log code only; no free-text fields in logs.
- *As a malicious actor, I import `getBusinessProfileForAgents` into a Client Component “for preview”* → **Blocked:** US-2.3 out of scope; agent helper must not be introduced or aliased here.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-2.1 are binding. Items marked **(added)** are new in this review — paste them into the story when the PO next edits USER_STORIES. Do not drop or weaken any existing `[SEC]` line. Do not check boxes in USER_STORIES from this gate.

**Inherited (still binding on `/profile` + profile read path):**

- [ ] **[SEC] Interview sessions / profiles are loaded only for the client resolved via server-side `getCurrentUser()`;** no `client_id` accepted from the request body or query string
- [ ] **[SEC] Free-text answers / profile fields are stored as data and always rendered escaped;** never interpolated into HTML, SQL, or shell
- [ ] **[SEC] Stub/profile route `/profile` lives under `app/(app)/`, is not on `isPublicPath`, uses `requireActive("page")`, sends `Cache-Control: no-store`** (US-1.3 — do not weaken when expanding UI)

**US-2.1 story `[SEC]` (existing):**

- [ ] **[SEC] Profile is fetched by the server-resolved current user; the endpoint does not accept an arbitrary `client_id` parameter from the browser**

**Added in this review:**

- [ ] **[SEC] (added) Own-profile loader `getBusinessProfileForClient` (CONTRACT name) takes no `client_id` / `profile_id` / `id` / `source_interview_id` arguments.** Identity from `requireActive("page")` / `getCurrentUser().id` only. `SELECT` always `WHERE client_id = $server`. Prove arity / signature in tests (same class as `getProfileStubSummary.length === 0`)
- [ ] **[SEC] (added) Reject or strip `client_id`, `profile_id`, `id`, `source_interview_id`, `role`, `auth_user_id`, `active` if present on any optional refresh Server Action or query string.** Never use them as read authority. Prefer omit those keys from FE props entirely
- [ ] **[SEC] (added) No Operator cross-tenant view in this story.** No `as_client_id`, no `requireOperator` bypass, no path that loads another Cliente’s Ficha viva. Operator role still resolves to **own** `client_id` only
- [ ] **[SEC] (added) `/profile` remains under `app/(app)/`, off `isPublicPath`, with `requireActive("page")` on the page path (layout and/or helper) and `Cache-Control: no-store`.** Replacing stub content must not add the route to the public allowlist or drop `no-store`
- [ ] **[SEC] (added) XSS bar:** all seven free-text field sections (including list items) render as React text nodes / PrimeReact children only — **no** `dangerouslySetInnerHTML`, no `eval`, no HTML string concatenation from `fields`
- [ ] **[SEC] (added) Missing own profile and load failure must not crash the `(app)` shell and must not leak foreign-tenant existence.** Missing → onboarding CTA to `/interview`. Failure → soft empty/error UX. No stack traces, SQL errors, or raw jsonb in the response body
- [ ] **[SEC] (added) Jsonb `fields` are Zod-validated on read** (seven keys 1:1 interview complete schema / shared profile fields schema). Invalid or corrupt row → soft empty/error + log **code only** — do not render unvalidated blob; do not log full free-text `fields`
- [ ] **[SEC] (added) View DTO is minimal:** typed field sections + optional `updatedAt` / subtle `version`. Must **omit** Auth tokens, `auth_user_id`, `role`, service-role internals, other tenants’ data. Prefer omit profile UUID / `client_id` / `source_interview_id` from client-visible props
- [ ] **[SEC] (added) Read-only enforcement for this story:** no edit controls, no PATCH/Server Action mutations of profile rows. Any write path is out of scope (US-2.2)
- [ ] **[SEC] (added) No public Route Handler that returns Ficha viva by tenant or profile id.** Prefer RSC + server helper only. If an optional refresh action exists, it takes **zero** tenant params and calls `requireActive("handler")`
- [ ] **[SEC] (added) Dashboard / default entry links to `/profile` without tenant query params.** Primary card/CTA when ficha exists (SPEC); do not freeze hard redirect that is product DRIFT — and never put `client_id` in those URLs
- [ ] **[SEC] (added) Orphan own profile (row exists, interview not `completed`) may be shown** — still scoped to `getCurrentUser().id` only; interview status remains a separate dashboard concern. No cross-tenant implication
- [ ] **[SEC] (added) RLS remains enabled on `neuramark_business_profiles`, deny-by-default, zero named policies;** service-role Node only; parameterized reads only. No browser Supabase
- [ ] **[SEC] (added) Do not introduce or client-bundle `getBusinessProfileForAgents`** (US-2.3). Cliente helper must stay distinct and server-only (`import "server-only"`)

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Identity and loader — **server user only** (APPROVE)

| Rule | Detail |
|---|---|
| Helper | `getBusinessProfileForClient` (or CONTRACT exact name) — **new** full reader; replace stub summary for field load |
| Args | **None** for tenant/profile ids. Arity 0 for identity |
| Auth | `requireActive("page")` inside helper (and `(app)` layout already gates page) |
| Query | `WHERE client_id = user.id` only; `.maybeSingle()` / equivalent |
| Strip | Any future action: reject/strip `client_id`, `profile_id`, `id`, `source_interview_id` |

#### 2. Missing / error / orphan semantics (APPROVE — no info-leak oracle)

| Case | UX / security |
|---|---|
| No row for current user | `{ exists: false }` / null → CTA → `/interview`. Never blank 500 crash |
| Select / config failure | Soft empty/error (same class as dashboard `loadFailed`); log code only |
| Row exists, interview not completed | **Show** Ficha viva (own row). Interview card independent |
| Foreign id ever supplied | Must not exist as a surface. If somehow present → ignore; still load own row only. Do **not** return a distinct “forbidden” that confirms another tenant’s profile |

Missing-profile messaging is about **onboarding state of the authenticated Cliente**, not about probing other accounts.

#### 3. Read-time Zod (APPROVE orchestrator default)

- Re-validate jsonb `fields` with the complete seven-key schema (reuse interview complete schema or shared profile fields schema — CONTRACT freezes name).
- Invalid → soft empty/error; do not partial-render garbage keys; do not 500-dump.
- Defense in depth for Operator SQL edits / corrupt rows.

#### 4. XSS and render (APPROVE)

- Free-text + array items → React text nodes / PrimeReact children only.
- Empty arrays (e.g. restrictions) → empty-state **copy**, not crash, not HTML injection point.
- No markdown/HTML renderers on profile fields in V1.

#### 5. Auth / cache / route (APPROVE — continuity with US-1.3)

| Rule | Detail |
|---|---|
| Path | Replace stub **in place** at `/profile` under `(app)` |
| Public | Must stay **off** `isPublicPath` |
| Cache | `Cache-Control: no-store` — verify, do not weaken |
| Dynamic | Keep `force-dynamic` (or equivalent) so full fields are not statically cached |

#### 6. Dashboard post-onboarding (APPROVE SPEC default — product, security-neutral)

- When Ficha viva **exists**, elevate **primary card/CTA** to `/profile`.
- **No** hard redirect off `/` or `/dashboard` that removes US-X.1 coexistence (SPEC DRIFT if frozen as hard redirect).
- Links: `/profile` only — no tenant query params.
- Prefer not dumping full `fields` onto the dashboard card.

#### 7. Surface area (APPROVE)

- RSC + server helper preferred. No public Route Handler.
- Optional thin Server Action for client refresh only if CONTRACT requires it — zero tenant args, `requireActive("handler")`, read-only.
- Read-only UI: no edit/save/PATCH.

#### 8. View DTO minimality (APPROVE)

- Include: seven field sections (`services`, `zone`, `tone`, `offers`, `objections`, `style`, `restrictions`).
- Optional: `updatedAt` (locale-formatted); `version` subtle or omit until US-2.2.
- Exclude: tokens, `auth_user_id`, `role`, service-role internals, other tenants, prefer exclude `source_interview_id` / profile UUID / `client_id` from props.

### Required implementation constraints

1. **Extend** `lib/profile/*` with `import "server-only"` helper — do not fork a parallel reader that accepts tenant ids.
2. **Replace** stub view content in place; thin-wrap or delete `getProfileStubSummary` after page swap — do not leave a second public-ish loader with weaker scoping.
3. **Do not edit** auth modules except verifying `/profile` stays off `isPublicPath` and keeps `no-store`.
4. **DB verify-only** — no duplicate create migration; no `profile_versions`; no agent tables/views.
5. **No new packages.** No browser Supabase. No LLM / queue / spend.
6. **Tests (security-relevant):** helper arity 0 / ignores foreign ids; load scoped to current user; missing → empty CTA shape; malformed fields → soft empty/error; `/profile` not public; `no-store` still set; no PATCH; XSS regression (no `dangerouslySetInnerHTML` on profile field render).

### Vetoes (would block BUILD)

| If implementers… | Verdict |
|---|---|
| Accept `client_id` / `profile_id` / `id` / `source_interview_id` from browser as read authority | **REJECT** |
| Add `/profile/[id]` or query-param tenant routing | **REJECT** |
| Add `/profile` to `isPublicPath` or serve full fields without `requireActive` | **REJECT** |
| Drop or weaken `Cache-Control: no-store` on `/profile` | **REJECT** |
| Ship Operator cross-tenant / `as_client_id` / `requireOperator` view on this page | **REJECT** |
| Render profile free text via `dangerouslySetInnerHTML` or unescaped HTML strings | **REJECT** |
| Add public Route Handler `GET` profile by tenant/profile id | **REJECT** |
| Put `@supabase/supabase-js` or service-role in Client Components | **REJECT** |
| Ship PATCH / edit forms / profile mutations under US-2.1 | **REJECT** (scope + security floor for “view”) |
| Implement or client-import `getBusinessProfileForAgents` | **REJECT** (US-2.3) |
| Log full free-text `fields` in production | **REJECT** |
| Return distinct foreign-tenant “not found” vs “forbidden” oracles (if any id surface slips in) | **REJECT** — remove the id surface; own-row only |

None of the SPEC-REVIEW orchestrator product defaults trigger a redesign veto. Hard dashboard redirect is a **product/SPEC DRIFT** (do not freeze in CONTRACT), not a security REDESIGN.

---

## Future-Proofing Notes

- **US-2.2** PATCH must keep allowlisted fields, server identity, version bump — never introduce `client_id` from the browser “because edit needs it.”
- **US-2.3** `getBusinessProfileForAgents(clientId)` is **server-only** and may take an internal `clientId` from **trusted server callers** (agent jobs), not from the browser. Do not conflate that signature with `getBusinessProfileForClient` (arity 0). Keep names and modules distinct so Client Components cannot import the agent path.
- **Multi-tenancy / RLS:** deny-by-default + server `client_id` remains the IDOR defense; enabling tenant RLS policies later is additive and must not rely on client-supplied ids.
- **Prompt injection:** rendered `fields` remain untrusted data for later agents — store/render as data here; delimit in US-4.x.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-2.1/CONTRACT.md` exists, verify before coding proceeds:

- [ ] `getBusinessProfileForClient` (name frozen): `requireActive("page")`; **no** tenant/profile args; `WHERE client_id = user.id`
- [ ] Return typed fields or explicit missing; Zod-validate `fields` on read; invalid → soft empty/error
- [ ] View DTO minimal (seven sections + optional `updatedAt` / `version`); omit secrets / privilege / prefer omit UUIDs
- [ ] `/profile` replace stub in place; gated; `no-store`; off `isPublicPath`
- [ ] Missing → CTA `/interview`; load failure soft; orphan own row may show
- [ ] XSS: text nodes only; read-only UI; no PATCH
- [ ] Dashboard: primary card/CTA to `/profile` when exists — **no** hard redirect freeze; no tenant query params
- [ ] No public profile GET Route Handler; no Operator cross-tenant param
- [ ] EN/ES: Ficha viva / Living profile; Style / Estilo; no CONTEXT _Evitar_
- [ ] Out of scope: US-2.2, US-2.3, Preferencias visuales, auth redesign, LLM enricher, `profile_versions`
- [ ] Inherited floors unchanged: RLS, parameterized reads, server-only Supabase, no fields free text in logs

---

## CONTRACT freeze list (binding summary)

1. **Identity:** `getBusinessProfileForClient` by `getCurrentUser()` / `requireActive` only — **no** `client_id` / profile id param; arity 0 for tenant identity.  
2. **Route:** replace stub **in place** at `/profile` under `(app)`; off `isPublicPath`; `requireActive("page")`; `Cache-Control: no-store`.  
3. **Read Zod:** validate jsonb `fields` (seven keys 1:1 interview) on every load; invalid → soft empty/error + log code only.  
4. **Missing / error:** own missing → CTA `/interview`; load failure soft; no foreign-tenant oracle; orphan own profile may show.  
5. **XSS:** free-text / list items as React text nodes only — no `dangerouslySetInnerHTML`.  
6. **DTO:** minimal view shape; omit tokens / `auth_user_id` / `role` / prefer omit profile & `source_interview_id` UUIDs from props; no full fields in logs.  
7. **Surface:** RSC + server helper preferred; no public GET-by-id API; read-only (no PATCH).  
8. **Operator:** no cross-tenant view param in V1.  
9. **Dashboard:** primary card/CTA to `/profile` when ficha exists — **not** hard redirect; no tenant ids in links.  
10. **Out of scope:** US-2.2 edit, US-2.3 agent helper, Preferencias visuales, auth redesign, LLM, `profile_versions`, new packages, browser Supabase.

---

## BUILD vetoes (summary)

1. Client-supplied `client_id` / profile id / `source_interview_id` as read authority (IDOR).  
2. Public or unauthenticated `/profile` (allowlist / missing `requireActive`).  
3. Weakened or missing `no-store` on `/profile`.  
4. Operator cross-tenant / `as_client_id` on this page.  
5. XSS via unescaped / `dangerouslySetInnerHTML` profile free text.  
6. Public Route Handler GET profile by tenant or profile id.  
7. Distinct missing/forbidden oracles for foreign tenants (or any foreign-id surface).  
8. PATCH / edit mutations under US-2.1.  
9. Client-bundled or introduced `getBusinessProfileForAgents`.  
10. Service-role or Supabase client in the browser; logging full free-text `fields`.
