# Security Design Review — US-14.5

**Story:** US-14.5 — Session-backed identity and route protection  
**Date:** 2026-08-28  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-14.5, all `[SEC]`), `plan/SECURITY_BASELINE.md` (Authentication), `plan/stories/US-14.2/SECURITY.md`, `plan/stories/US-14.4/SECURITY.md`, `plan/stories/US-14.5/TASKS.md`, `plan/stories/US-14.5/SPEC-REVIEW.md` (ALIGNED), `lib/auth/get-current-user.ts`, `lib/auth/supabase-cookie.ts`, `AGENTS.md`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct: one server-side identity seam (`getCurrentUser()`), deny-by-default routing, `neuramark_clients.active` and `role` read fresh every request, SQL-only writes to those columns after a one-time seed, no RBAC/activation UI, no tokens in the browser. No REDESIGN.

The conditions are the `[SEC]` criteria below plus the **CONTRACT freeze list** in Design Concerns. This story **ends** the sanctioned hardcoded-user exception on the default path. After it lands, a hardcoded identity outside the dual-flag dev fallback is a **finding**, not an exception.

**This story owns:** session-backed `getCurrentUser()`; every-request `active` (before `role`, before spend); `requireActive()` / `requireOperator()`; deny-by-default allowlist; cookie idle ≤ 7 days; production throw if `AUTH_DEV_FALLBACK` is set; seed upsert of `gaveho@gmail.com` as `neuramark_clients` (lookup Auth by email — never `INSERT` into `auth.users` from SQL).

**This story does not own:** logout UI / logout mutation (US-14.3); Path A or recovery **landings** (frozen); activation/role UI.

**Terminology:** Operator / operator SQL / service-role lookup. Do not use “admin”, administrador, or staff in CONTRACT, this file’s product-facing examples, or EN/ES copy.

---

### Threat Summary

US-14.5 is the **authorization boundary** for the whole app. Open signup already exists, so unauthenticated and inactive sessions are the default internet traffic. Primary threats:

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Skip middleware, call a Server Action / Route Handler directly** | Product or spend without a session | Middleware is convenience only. Every product handler calls `getCurrentUser()` / `requireActive()` / `requireOperator()`. No identity from headers or middleware-injected fields |
| **Inactive session reaches product or spend** | Unactivated accounts use the product or burn LLM/video/TTS/storage | `active` read fresh every request; pages → `/pending`; handlers → **403**, no side effects. `requireActive()` shipped now even though no spend endpoints exist yet |
| **Inactive operator bypasses pending via `role`** | Activation gate skipped | Evaluate `active` **before** `role`. `requireOperator()` calls `requireActive()` first. Inactive operator has **no** access |
| **Stale `active` / `role` in cookie or module cache** | Access survives SQL deactivate/demote | Cookie carries identity only. Fresh `neuramark_clients` read every request. No JWT claims for `active` / `role` / `client_id` |
| **Self-service activation or promotion** | Attacker sets `active`/`role` | No application write path after the documented seed. Forbidden keys still stripped on auth contracts |
| **`/pending` as anonymous activation oracle** | Probe whether an email is pending | `/pending` is **not** public. Unauthenticated → `/login` (same as other protected routes). No anonymous “check activation” endpoint |
| **Dev fallback in production** | Hardcoded operator on the live app | Dual flag: `NODE_ENV === "development"` **AND** `AUTH_DEV_FALLBACK === "true"`. Production: **throw at startup** if the env var is set (any non-empty value) |
| **Service-role on the Edge** | Privileged key in the middleware bundle | Service-role stays in Node server modules only. Middleware: allowlist + cookie-presence (optional anon-key refresh). Never service-role, never `neuramark_clients` on Edge |
| **Leftover recovery cookie on a product path** | Recovery session used as product identity | **Frozen below:** treat as a **real session**, still `active`-gated. Reset allowlist stays so US-14.4 does not 302 to product |
| **Year-long cookie / refresh token in JS** | Stolen cookie lives ~400 days; XSS reads refresh | Cap `maxAge` / `expires` at **7 days idle** in `applySessionCookieFlags`. Refresh server-side only. Tokens never in JS or response bodies |
| **Seed INSERT into `auth.users`** | Password in SQL; fragile Auth schema; accidental operator mint | Lookup `auth.users` by email only. **Never** `INSERT`/`UPDATE` `auth.users` from a `neuramark_` migration |
| **Invented `CurrentUser` when the client row is missing** | Fake `id` used as `client_id` (future IDOR) | Missing row → do **not** invent `id` / `role`. Treat as not-active. No repair `INSERT` from `getCurrentUser()` |

**Residual risk accepted:** Open signup still creates inactive rows within US-14.1 rate limits. Possession of a valid httpOnly Auth session (login **or** leftover recovery) is possession of that user’s identity; the `active` gate is what blocks product. Isolation of recovery sessions would require a second, spoofable marker — not adopted. Session expiry mid-use redirects to login (no logout control until US-14.3).

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| Session cookie (`sb-*`, `@supabase/ssr`) | High — session bearer | Set/refreshed by the server; `HttpOnly`, `Secure` (production), `SameSite=Lax`, `Path=/`, host-only; idle ≤ 7 days |
| Access / refresh tokens | Critical | Cookie jar only; never in HTML, JSON, JS, logs, or `Location` |
| `neuramark_clients.active` / `role` | High — authorization gates | Fresh server read every request; **not** a cookie/JWT claim; no app write after seed |
| `neuramark_clients.id` | High — future `client_id` / tenancy | Only from the DB row. Never from the request. Never invented when the row is missing |
| Auth user id (`auth.users.id`) | High — join key | Used server-side to load the client row. Not a product `CurrentUser.id` substitute |
| Pending email / display name | Low–medium — user-known PII | Server Component → view, at most those two fields. No `sessionStorage`, no `?email=` |
| `AUTH_DEV_FALLBACK` | Critical if honored in production | Dual flag + production throw. Identity of the fallback user is **fixed in code** |
| Service-role key | Critical | Node `lib/supabase/server.ts` (and equivalent). Never `NEXT_PUBLIC_*`, never client bundle, **never Edge middleware** |
| Anon / publishable key | High — server-only in this app | User-scoped cookie client (`lib/auth/supabase-cookie.ts`). Optional Edge use **only** to refresh cookies — never for `neuramark_clients` |
| Seed operator row | High — first real operator | Lookup Auth by email; upsert `neuramark_clients` only |

**Boundaries:**

1. **Browser → Next.js** — Untrusted. No Supabase SDK, no tokens, no identity in headers/query/body. Client Components consume Server Actions / RSC only.
2. **Middleware (Edge) → routing convenience** — Allowlist + cookie **presence** (optional anon-key cookie refresh). **Not** the security boundary. Does not read `neuramark_clients`. Does not inject identity headers. Does not hold the service-role key.
3. **Node `getCurrentUser()` → real boundary** — User-scoped client `getUser()` (signature/expiry, not mere cookie presence) → service-role (or other Node-only privileged client) load of `neuramark_clients` by `auth_user_id` → `CurrentUser` or null.
4. **Product handlers** — `requireActive()` / `requireOperator()` before any side effect. Direct calls from an inactive or anonymous session must not mutate or spend.
5. **Auth allowlist** — Login, signup, reset, callbacks, and their Server Actions stay callable without a **product** session. They keep their existing CSRF, enumeration, and landing contracts.
6. **Operator SQL** — The only post-seed write path for `active` and `role`.

---

## Abuse Cases Considered

- *As a malicious actor, I can skip middleware and POST a Server Action / hit a Route Handler to reach product or spend* → **Blocked:** every product action/handler independently calls `getCurrentUser()` / `requireActive()` / `requireOperator()`. Middleware headers are not identity.
- *As a malicious actor, I can stay logged in after the operator sets `active = false` (or demotes `role`) because my cookie still says I am good* → **Blocked:** `active` and `role` are not in the cookie. Fresh DB read every request. Next request is gated.
- *As a malicious actor, I can send `role: "operator"` or `active: true` in a body, header, or cookie* → **Blocked:** those keys are absent from auth contracts (already 14.1/14.2/14.4) and are never read from the request for authorization. DB CHECK/enum still constrains values.
- *As a malicious actor, I am an inactive operator and I call `requireOperator()`-gated logic* → **Blocked:** `active` is evaluated first. Inactive operator → pending (pages) / 403 (handlers). `role` never bypasses activation.
- *As a malicious actor, I can GET `/pending` (or a “status” endpoint) without a session to see if an account is pending* → **Blocked:** `/pending` is not public; anon → `/login`. No anonymous activation-status endpoint. Pending copy is for the authenticated owner only.
- *As a malicious actor, I can open `/pending?email=victim@…` or read leftover `sessionStorage` and treat that as identity* → **Blocked:** pending identity comes from the server seam (at most email + display name). Strip untrusted query keys. Remove `pending-identity.ts` as product identity.
- *As a malicious actor, I can set `AUTH_DEV_FALLBACK` on Vercel and get the hardcoded operator* → **Blocked:** production throws at startup if the variable is set; fallback code is unreachable when `NODE_ENV=production` (automated test). Dual flag in development only; role/active/id not env-configurable.
- *As a malicious actor, I can read the service-role key from the Edge middleware bundle or a `NEXT_PUBLIC_*` var* → **Blocked:** service-role never imported from middleware. Never `NEXT_PUBLIC_`.
- *As a malicious actor, I can use a leftover recovery cookie to skip activation or to 302 out of set-password into the dashboard* → **Blocked (frozen design):** recovery cookie on a **product** path is a normal session + `active` gate (inactive → pending/403, not dashboard). `/reset-password` and `/reset-password/new` stay on the allowlist; middleware **must not** 302 those paths to product even when `sb-*` cookies exist. US-14.4 still globally signs out after set-password.
- *As a malicious actor, I can rely on a 400-day `@supabase/ssr` `maxAge` or fish the refresh token out of JS* → **Blocked:** clamp idle to ≤ 7 days on every cookie write; refresh server-side; tokens never in the client bundle or response bodies.
- *As a malicious actor, I can put a password and operator row into a migration via `INSERT INTO auth.users`* → **Blocked:** seed looks up by email only. No writes to `auth.users` from app SQL.
- *As a malicious actor, I can call `getCurrentUser()` when my profile row is missing and get a fabricated `id` I later use as another tenant’s `client_id`* → **Blocked:** missing row does not invent `CurrentUser`. No repair write from the seam.
- *As a malicious actor, I can use the hardcoded `gaveho@gmail.com` path after this story without the dual flag* → **Blocked:** default path is session → `neuramark_clients` or null. Hardcoded user only under the dual flag.

---

## Frozen design choices (must land in CONTRACT)

These are the picks this review is required to freeze. CONTRACT.md must copy them, not reopen them.

### 1. Public allowlist (exact). `/pending` is not public

Deny-by-default: every route is protected unless listed. New routes are protected without opt-in.

| Kind | Paths (exact unless noted) |
|------|----------------------------|
| Auth pages | `/login`, `/signup`, `/reset-password`, `/reset-password/new` |
| Auth callbacks | `/auth/callback`, `/auth/callback/recovery` |
| Static / framework | `/_next/static/*` (prefix), `/_next/image`, `/favicon.ico`, other files served from `public/` |
| Auth Server Actions | `signUp`, `logIn`, `requestPasswordReset`, `setNewPassword`, `resendConfirmationEmail` — callable **without** a product session; keep existing CSRF / enumeration contracts |

**Not public**

- `/` (today 302 → `/dashboard`) and `/dashboard` — product.
- **`/pending` — authenticated-but-inactive only.** Unauthenticated → `/login` (same class of redirect as other protected pages; not an oracle). Authenticated + `active === true` → `/dashboard`. Authenticated + inactive (or missing client row) → pending screen.
- Every future product page, Server Action, and Route Handler.

Do not add locale prefixes, `/api/*` wildcards, or “anything under `(auth)`” to the allowlist — `(auth)` currently includes `/pending`.

### 2. Middleware is convenience; `getCurrentUser()` is the boundary

- **Middleware (Edge):** match allowlist; if the path is public, do **not** redirect to product even when `sb-*` cookies are present (required so US-14.4 set-password is not 302’d to dashboard). If the path is not public and **no** `sb-*` cookie is present → 302 `/login` with a safe `next` (`isSafeRelativePath` / `sanitizeLoginNext`). Cookie **presence** only — not `getUser()`, not `neuramark_clients`.
- **Must not:** set `x-user-id`, `x-role`, `x-active`, or any other identity header for handlers to trust.
- **Must not:** import the service-role client or `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY`.
- **Optional:** refresh session cookies on Edge with the **user-scoped anon/publishable key only** (same adapter as `lib/auth/supabase-cookie.ts`). If Server Components cannot persist refreshed cookies, this is the sanctioned fallback. Still no `neuramark_clients` on Edge.
- **Node (real boundary):** `getCurrentUser()` validates the session (`getUser()` / equivalent — signature and expiry, not mere presence) then loads `neuramark_clients` by `auth_user_id`. Product layouts and every product Server Action / Route Handler call this seam (or `requireActive()` / `requireOperator()`).

### 3. Cookie idle ≤ 7 days; refresh server-side; no tokens in JS

- Clamp in `applySessionCookieFlags` (and any other cookie write): `maxAge` / `expires` **≤ 7 days** (604800 seconds). Keep `maxAge: 0` / delete unchanged (logout/expiry/fixation).
- If `@supabase/ssr` supplies a larger `maxAge` (~400 days), **clamp down**. If it supplies none, set 7 days.
- Rolling idle: each server-side refresh may reset the 7-day clock via `Set-Cookie`.
- Flags unchanged: `HttpOnly`, `Secure` in production, `SameSite=Lax`, `Path=/`, host-only (no `Domain`).
- Refresh token never in client JS, HTML, JSON, or logs.

### 4. Dev fallback (dual flag + production throw)

- Hardcoded `DEV_USER` **only** when `NODE_ENV === "development"` **AND** `AUTH_DEV_FALLBACK === "true"` (exact string).
- Identity is **fixed in code** (today’s values: id `00000000-0000-4000-8000-000000000001`, `gaveho@gmail.com`, Gabriel Vega, `operator`, `active: true`). Not env-configurable.
- Default path **must not** return `DEV_USER` (today’s `get-current-user.ts` still does — this story removes that).
- **Production:** if `AUTH_DEV_FALLBACK` is **set** (any non-empty value, including `"false"`), **throw at module evaluation / startup**. Do not silently ignore. Automated test: fallback unreachable when `NODE_ENV=production`.
- `.env.example`: local-only; must not be set on Vercel production. Prefer commented in the example so the default local path is session-backed.

### 5. Leftover recovery cookies — **real session + `active` gate** (not isolated)

Isolation (a `neuramark_recovery` marker, AMR sniffing, or a parallel cookie) is **rejected**: a marker is client-deletable, AMR is provider-fragile, and a second session type is a second identity API.

**Adopted design:**

- A leftover recovery cookie is a valid Auth session. On **product** paths, `getCurrentUser()` resolves it like login, then the **`active` gate** applies (inactive → `/pending` / 403; active → product).
- **`/reset-password` and `/reset-password/new` stay on the public allowlist** so US-14.4 does not 302 to product. Middleware must not bounce those paths to dashboard/pending when cookies exist.
- `isRecoverySessionReady()` remains a **boolean** for the set-password page — not a product identity API; still no email/`active`/`role` from that helper.
- Path A and recovery **landings** stay frozen (this story guards the routes as public; it does not change 302 targets).
- US-14.4 global sign-out after successful set-password still applies.

### 6. Seed — lookup by email; **skip if Auth user missing**; never write `auth.users`

**Adopted design: skip (not fail-closed-on-missing-user).** Fail-closed-on-missing-user incentivizes `INSERT INTO auth.users` from SQL (password in the repo) — the worse outcome.

- **Never** `INSERT`/`UPDATE`/`DELETE` `auth.users` (or Auth schema) from a `neuramark_` migration.
- Look up `auth.users` by email `gaveho@gmail.com`.
- **If missing:** `RAISE NOTICE` and **skip** (do not create a `neuramark_clients` row without `auth_user_id`). Document ops: create the Auth user via Dashboard or Auth Admin API, then run the documented upsert SQL. Migration still records as applied — the COMMENT must include the rerunnable upsert.
- **If present:** upsert `neuramark_clients` (`email`, `display_name = Gabriel Vega`, `active = true`, `role = operator`, `auth_user_id`). INSERT uses id `00000000-0000-4000-8000-000000000001` when no row exists; UPDATE must **not** rewrite `id` if it already differs. If this upsert errors → **fail the migration** (fail closed on write, not on missing Auth user).
- After the seed, **no** application write to `active` / `role`. Operator SQL only.

### 7. Service-role not in Edge middleware

See §2. Privileged `neuramark_clients` read is Node-only (service-role bypasses deny-by-default RLS). User-scoped client for session validation.

### 8. `requireActive` before `requireOperator`

- `requireActive()`: no valid session → 401 (handlers) or login redirect (pages); valid session but inactive or missing client row → **403**, no side effects (pages → `/pending`).
- `requireOperator()`: **must** run `requireActive()` first; then `role === "operator"` else 403, no side effects.
- Inactive operator has no product, no spend, no operator logic.
- Role is never taken from header, cookie, body, or middleware.

### 9. No app write path for `active` / `role`

Grep Server Actions, Route Handlers, and seeds beyond the documented migration. Forbidden keys remain stripped on auth contracts. Dev-fallback role/active are fixed in code.

### 10. RLS stays deny-by-default (zero policies)

US-14.1 left a comment that ownership policies might land here. **They must not.** There is no browser Supabase client. Adding `authenticated` policies would look like a client-SDK tenancy model we do not have. Keep RLS enabled, **zero** named `neuramark_*` policies; service-role for server reads/writes. Do not add browser-facing ownership policies.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-14.5 are binding. Items marked **(added)** are new in this review — paste them into the story. Do not drop or weaken any existing `[SEC]` line.

- [ ] **[SEC] Route protection is deny-by-default:** the middleware/guard protects every route except an explicit public allowlist (login, signup, reset pages, their endpoints, static assets); new routes are protected without opt-in
- [ ] **[SEC] Middleware is convenience, not the security boundary:** every Route Handler and Server Action independently resolves identity via server-side `getCurrentUser()` and returns 401/redirect when unauthenticated; no handler trusts a header, cookie flag, or middleware-injected value from the request to assert identity
- [ ] **[SEC] `getCurrentUser()` validates the session against Supabase Auth server-side** (signature/expiry verification or user lookup), not mere cookie presence; expired or revoked sessions resolve to null
- [ ] **[SEC] Session lifetime is explicit:** refresh handled server-side via the httpOnly cookie (rotating refresh token), idle expiry ≤ 7 days, and the refresh token is never exposed to client JavaScript — includes US-14.4 QA Low #2: cap `@supabase/ssr` cookie `maxAge` (~400 days today)
- [ ] **[SEC] The dev fallback activates only when `NODE_ENV === 'development'` AND `AUTH_DEV_FALLBACK=true` are both set;** in production builds the code path throws at startup if `AUTH_DEV_FALLBACK` is set, and an automated test asserts the fallback is unreachable when `NODE_ENV=production`
- [ ] **[SEC] The Supabase service-role key** (used for the seed/backfill and any privileged lookup) stays in server-only modules and env vars; it never appears in `NEXT_PUBLIC_*`, client bundles, or middleware that ships to the edge without need
- [ ] **[SEC] `active` is read fresh from `neuramark_clients` inside `getCurrentUser()` on every request** — never cached across requests (no module-level cache, no `active` claim baked into a cookie/JWT, no client-side persistence); staleness bound is one request, so deactivation (`active = false`) takes effect on the user's very next request even with a live session, and activation likewise requires no re-login
- [ ] **[SEC] `active` is not writable through any endpoint, Server Action, or request payload** — the only write path is operator SQL (documented in the migration); an inactive session hitting any product Route Handler or Server Action directly (bypassing page navigation) receives 403, same enforcement as page routes
- [ ] **[SEC] No "check my activation status" endpoint exists outside an authenticated session;** activation state is only ever conveyed on the pending screen to the authenticated owner of the account
- [ ] **[SEC] `role` is server-resolved authorization only:** it is never present in any request contract, never stored in a cookie or JWT claim, never persisted client-side, and never accepted from a header or middleware-injected value — the ONLY source is the fresh per-request `neuramark_clients` read inside `getCurrentUser()`; demotion (`operator` → `client` via SQL) takes effect on the user's next request even with a live session, same staleness bound as `active`
- [ ] **[SEC] Every operator-only gate lives inside the Server Action / Route Handler itself** as `role === 'operator'` on the `getCurrentUser()` result (a shared `requireOperator()` helper is acceptable); middleware checks and UI hiding are convenience only, and a direct request to an operator endpoint from a client-role session returns 403 with no side effects executed
- [ ] **[SEC] `role` and `active` compose as AND:** an inactive operator (`active = false`) has no access to anything — the `active` gate is evaluated before the role gate, and `role = 'operator'` never bypasses activation, deny-by-default routing, or ownership checks
- [ ] **[SEC] The application has no code path that writes `neuramark_clients.role`** — no endpoint, Server Action, seed-time toggle, or env flag (the dev fallback user's role is fixed in code, not configurable); promotion/demotion is operator SQL only, and back-door sweeps verify no alternate write path exists
- [ ] **[SEC] (added) `/pending` is not on the public allowlist:** unauthenticated requests to `/pending` redirect to `/login` (same treatment as other protected pages — not a distinct oracle). Authenticated inactive (or valid session with missing `neuramark_clients` row) see pending. Authenticated `active === true` is redirected to `/dashboard`. No anonymous activation-status endpoint
- [ ] **[SEC] (added) Leftover recovery cookies are a real Auth session on product paths**, subject to the same `active` gate — do not isolate via a second cookie, marker, or AMR check. `/reset-password` and `/reset-password/new` remain public so US-14.4 cannot 302 to product; middleware must not redirect those allowlisted paths to dashboard/pending when `sb-*` cookies are present. Do not change Path A or recovery landings
- [ ] **[SEC] (added) Seed never writes `auth.users`:** lookup by email `gaveho@gmail.com`; if missing, NOTICE and skip (no privileged row without `auth_user_id`); if present, upsert `neuramark_clients` or fail the migration on upsert error. After seed, no application `UPDATE` of `active` or `role`
- [ ] **[SEC] (added) `getCurrentUser()` must not invent a user:** expired/revoked/missing session → null. Missing `neuramark_clients` row → do not fabricate `id` / `role`; treat as not-active (pending / 403); no repair `INSERT`/`UPDATE` from the seam. `CurrentUser.id` is always `neuramark_clients.id` when a user object is returned
- [ ] **[SEC] (added) `requireActive()` is the spend/product gate and is shipped in this story** even though no LLM/video/TTS/storage endpoints exist yet. Future spend handlers cannot skip it. Direct inactive calls return **403** with no side effects. `requireOperator()` calls `requireActive()` first
- [ ] **[SEC] (added) Production throw is presence-based:** if `NODE_ENV === "production"` and `AUTH_DEV_FALLBACK` is any non-empty string, throw at module evaluation — do not honor `"false"` / `"0"` as a disable switch. Automated test covers `NODE_ENV=production`
- [ ] **[SEC] (added) Cookie clamp is in `applySessionCookieFlags`:** every `sb-*` write (login, recovery, refresh) inherits idle ≤ 7 days. Access/refresh tokens never appear in client JS or response bodies
- [ ] **[SEC] (added) Pending identity is server-only:** `/pending` Server Component loads identity from the session seam; pass at most email + display name into the view. Remove `components/auth/pending-identity.ts` as product identity; do not echo `?email=` (US-14.2 QA Low #1)
- [ ] **[SEC] (added) Authenticated product and pending responses send `Cache-Control: no-store`** so the back button / shared-device cache cannot show authenticated HTML after expiry (US-14.3 still owns logout UI; this story owns cache on newly gated surfaces)
- [ ] **[SEC] (added) Unauthenticated redirects to login use a same-origin relative `next`:** reuse `isSafeRelativePath` / `sanitizeLoginNext`; never copy `Host` / `X-Forwarded-Host` into an absolute redirect. Unsafe `next` falls back to `/dashboard` as the sanitizer already does (inactive login still ignores `next` per US-14.2)
- [ ] **[SEC] (added) RLS stays enabled with zero policies** on `neuramark_clients` / `neuramark_auth_attempts`. Do not add authenticated ownership policies that assume a browser Supabase SDK. Privileged reads use the Node service-role client
- [ ] **[SEC] (added) Header identity stays a Server Component:** `AppHeader` keeps calling `getCurrentUser()` on the server. No `document.cookie`, no client Supabase SDK, no header/query user

---

## Design Concerns and Required Changes

### CONTRACT.md must freeze (non-negotiable)

When `plan/stories/US-14.5/CONTRACT.md` is authored, lock these before implementation. Security will spot-check the contract against this list.

1. **Single identity seam** — `getCurrentUser()`: valid session → `neuramark_clients` by `auth_user_id` → `CurrentUser` (`id`, email, displayName, preferredLocale, `role`, `active`). Return type may become `CurrentUser | null` (null = no valid session). No second identity API (`client_id` cookie, `neuramark_session` JWT, header/query identity). Cookie does not carry `active` / `role` / `client_id`. Client Components never import `getCurrentUser()`.
2. **Allowlist** — exact table in Frozen design §1. `/pending` not public. Auth Server Actions listed; product actions not listed.
3. **Edge vs Node** — Frozen design §2. No identity headers. No service-role on Edge. Optional anon-key refresh only.
4. **Helpers** — `requireActive()` and `requireOperator()` as the handler pattern. `requireOperator()` ⊆ `requireActive()`. No spend path without `requireActive()`. Role never from the request.
5. **Missing client row** — Frozen design: not-active, no invented `id`, no repair write. Pages with a valid Auth session and no row → `/pending` (email from `getUser()` at most). Handlers → 403.
6. **Dev fallback** — Frozen design §4. Dual flag, fixed-in-code user, production throw on any non-empty `AUTH_DEV_FALLBACK`, test with `NODE_ENV=production`.
7. **Cookies** — Frozen design §3. Clamp in `applySessionCookieFlags`.
8. **Recovery leftover** — Frozen design §5. Real session + `active`. Reset allowlist unchanged. Path A / recovery landings frozen.
9. **Seed** — Frozen design §6. Lookup-only; skip if missing; never write `auth.users`; upsert fail closed; then operator SQL only.
10. **RLS** — zero new policies. `neuramark_` prefix on any new DB object (none expected).
11. **Out of scope** — US-14.3 logout UI/mutation; Path A (`/login?confirmed=1`) and recovery landings; RBAC / activation UI; Interview / Ficha / visual prefs; Instagram / spend / generation (only the **gate** is in scope).
12. **EN/ES** — session-expired → login, pending already exists, dashboard `setupBanner` must not say “hardcoded dev user.”

### Required implementation constraints

1. **Processing order (`getCurrentUser()`):** dual-flag fallback (dev only) → else production-throw already evaluated → user-scoped `getUser()` → if fail/null, return null → service-role select `neuramark_clients` where `auth_user_id` → if no row, return null (callers treat as not-active) → return `CurrentUser` with fresh `active`/`role`. No module-level memo of `active`/`role`.
2. **User-scoped vs service-role.** Session validate / cookie refresh: `createUserScopedAuthClient` (anon key). `neuramark_clients` read: existing service-role helper (`persistSession: false`). Never put service-role in the cookie client or middleware.
3. **Do not trust cookie presence in handlers.** Middleware may 302 based on presence; handlers must `getUser()`.
4. **Layout vs middleware.** A Node layout guard that calls `getCurrentUser()` is the page boundary; middleware is the anon UX shortcut. Both may exist; neither replaces handler checks.
5. **Existing call sites** (`AppHeader`, `dashboard/page.tsx`) assume a non-null `CurrentUser`. After the swap they must sit behind an active layout/guard so they never render for null/inactive. That is allowed; it is not a second identity API.
6. **Home `/`:** unauthenticated → login (do not 302 to `/dashboard` then bounce). Authenticated inactive → pending. Authenticated active → dashboard.
7. **Reuse** `lib/auth/supabase-cookie.ts`, `safe-next-path.ts`, `forbidden-fields.ts`. Do not add Upstash, a new session JWT library, or a browser Supabase client.
8. **Dependencies:** no new auth packages. `@supabase/ssr` already present. No lookalike middleware-auth kits.
9. **US-14.1 High finding 1 class:** missing profile after a valid session must not become a distinct unauthenticated error the client can use as an oracle. Same pending treatment as inactive; no “profile missing” copy.
10. **Do not ship logout.** Pending hint copy may remain.

---

## Future-Proofing Notes

- **End of hardcoded-user exception.** After this story, back-door sweeps treat leftover `return DEV_USER` on the default path, `AUTH_DEV_FALLBACK` in production, identity headers, and client-side Supabase as findings.
- **Multi-tenancy:** `getCurrentUser().id` is `neuramark_clients.id`. Child tables should keep using that as `client_id`. Do not use `auth.users.id` as `client_id`.
- **RLS later:** ownership policies can be added when (if) a model needs them; they are additive because RLS is already enabled. This story must not invent client-SDK policies.
- **US-14.3:** cookie names, `Path=/`, host-only, and `Cache-Control: no-store` on gated pages make logout and back-button hygiene straightforward. Global revocation stays a US-14.3 / already-done US-14.4 concern.
- **Spend stories:** importing `requireActive()` is mandatory before any LLM/video/TTS/storage side effect. Reviewers should reject handlers that only hide UI.
- **Back-door sweep hooks after implementation:** no `@supabase` / `NEXT_PUBLIC_SUPABASE` / tokens in `.next/static`; no service-role import from `middleware.ts`; grep `neuramark_clients` writes for `active`/`role` outside the seed; grep `AUTH_DEV_FALLBACK` without `NODE_ENV === "development"`; confirm `/pending` not in the public matcher; confirm `applySessionCookieFlags` clamps `maxAge`; confirm no `INSERT INTO auth.users`; confirm `pending-identity` / `sessionStorage` gone as product identity.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-14.5/CONTRACT.md` exists, verify before coding proceeds:

- [ ] Allowlist exact; `/pending` not public; `(auth)` group not blindly public
- [ ] Middleware: convenience only; no identity headers; no service-role on Edge
- [ ] `getCurrentUser()` session validate → `neuramark_clients`; null on no session; no invented user
- [ ] Cookie does not carry `active` / `role` / `client_id`
- [ ] `requireActive()` before `requireOperator()`; inactive operator has no access; 403 no side effects
- [ ] Dev fallback: dual flag, fixed-in-code user, production throw on any non-empty env var, test
- [ ] Cookie idle ≤ 7 days in `applySessionCookieFlags`; refresh server-side; no tokens in JS
- [ ] Recovery leftover = real session + `active`; reset allowlist stays; Path A/recovery landings frozen
- [ ] Seed: lookup by email; skip if missing; never write `auth.users`; upsert fail closed; then SQL-only `active`/`role`
- [ ] RLS: no new policies
- [ ] Pending identity from server seam; no `sessionStorage` / `?email=`
- [ ] Out of scope: US-14.3 logout UI, Path A/recovery landing changes, RBAC/activation UI
