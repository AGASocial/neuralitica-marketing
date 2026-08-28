# Security Design Review — US-14.1 Sign up with email and password

**Story:** US-14.1 — Sign up with email and password  
**Date:** 2026-08-28  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-14.1), `plan/SECURITY_BASELINE.md` (Authentication), `SPEC.md`, `AGENTS.md`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct: open signup, email confirmation, manual SQL activation, Supabase Auth wrapped entirely behind Next.js endpoints, no auth SDKs or tokens in the browser. The compensating controls in the `[SEC]` criteria below are the conditions. No REDESIGN.

**Sanctioned interim state (not a finding):** Until US-14.5 lands, `getCurrentUser()` may still return the hardcoded local user (`gaveho@gmail.com` / Gabriel Vega). US-14.1 must still implement real signup and the `neuramark_clients` schema so the swap is additive.

---

## Threat Summary

US-14.1 is the **entry point for untrusted identity** into the system. Open signup means any internet actor can attempt account creation within rate limits. Primary threats:

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Email enumeration** | Attacker learns which addresses are registered | Identical HTTP status, body shape, and copy for new vs duplicate email; Supabase "user already exists" absorbed server-side |
| **Signup / resend spam** | Resource exhaustion, email-provider throttling, junk rows | App-level limits in `neuramark_auth_attempts` (5/IP/hour, 15/IP/day signup; 3/email/hour resend) layered on Supabase built-in limits; 429 with generic body |
| **Weak or breached passwords** | Account takeover | NIST-style policy (12–128 chars, no composition rules, bundled top-~1,000 denylist); shared module reused by US-14.4 |
| **Credential leakage** | Mass compromise via logs/telemetry | Password exists only in request body → Supabase Auth call; redact by key name everywhere else |
| **CSRF on signup** | Attacker registers victim or triggers emails | Server Action origin check or Route Handler rejecting mismatched `Origin` |
| **Session fixation** | Attacker plants cookie, victim completes signup | If a session is established, issue a fresh cookie value server-side; never reuse pre-existing cookie |
| **Role / activation escalation** | Attacker gains operator or active status | `role` and `active` absent from request contract; DB constraints; SQL-only write paths |
| **Orphaned auth users** | Inconsistent state, enumeration side channels | `auth_user_id` from Supabase response only; transactional or compensated client-row creation |
| **Inactive-account spend abuse** | Attacker burns LLM/video/TTS budget | Signup creates auth user + one `neuramark_clients` row only; US-14.5 `active` guard blocks all spend endpoints (this story must not introduce bypasses) |

**Residual risk accepted:** Open signup allows junk `auth.users` / `neuramark_clients` rows within caps. Bounded by rate limits, email confirmation, `active = false` default, and zero spend-bearing endpoints for inactive accounts. Operator hygiene for junk rows is operational, not a security breach.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| Email + password (signup payload) | High — authentication secret | Browser (untrusted) → Next.js Server Action / Route Handler only |
| Plaintext password in transit | High | HTTPS only; never persisted app-side |
| Supabase service-role / auth admin credentials | Critical | Server-only env; never `NEXT_PUBLIC_*`, never client bundle |
| `auth.users` record | High — identity root | Created by server via Supabase Auth; `auth_user_id` never from client |
| `neuramark_clients` row | Medium — profile + gates | Server writes only; `active = false`, `role = 'client'` by default |
| Email confirmation token | High — delivered by email | Supabase-managed; app does not expose token in responses |
| `neuramark_auth_attempts` rows | Low — abuse telemetry | Server writes; store hashed IP/email, not plaintext |
| Session cookie (if established at signup) | High — session bearer | httpOnly, server-issued; fixation guard applies |

**Boundaries:**

1. **Browser → auth endpoint** — Only place raw credentials cross from untrusted space. Client validation is presentation only.
2. **Auth endpoint → Supabase Auth** — Server-only `@supabase/supabase-js` (or `@supabase/ssr` for cookies). No browser Supabase client.
3. **Auth endpoint → Postgres** — Client row creation uses service-role or server Supabase client; parameterized queries only.
4. **Signup → product routes** — No session into product after submit; email confirmation required before login; activation enforced by US-14.5.

---

## Abuse Cases Considered

- *As a malicious actor, I can probe whether `victim@example.com` is registered via signup response differences* → **Blocked:** same status, body, copy for new and duplicate email; no timing branch on "user exists."
- *As a malicious actor, I can mass-register accounts to spam confirmation emails or fill the database* → **Bounded:** 5 signups/IP/hour + 15/day in `neuramark_auth_attempts`; Supabase limits; inactive accounts cannot trigger spend.
- *As a malicious actor, I can send `role: "operator"` in the signup body* → **Blocked:** field absent from contract; reject or strip; DB enum/CHECK makes invalid values impossible.
- *As a malicious actor, I can CSRF-signup a victim from another site* → **Blocked:** origin verification on mutation.
- *As a malicious actor, I can fix a session by planting a cookie before signup completes* → **Blocked:** fresh cookie issued if session established; never reuse pre-auth value.
- *As a malicious actor, I can learn passwords from server logs or error pages* → **Blocked:** redact password fields by key name; never store in `neuramark_*` tables.
- *As a malicious actor, I can create auth users without matching client rows (or vice versa)* → **Blocked:** transactional or compensated creation; `auth_user_id` from Supabase response only.
- *As a malicious actor, I can abuse "resend confirmation" to harass a victim* → **Blocked:** 3/email/hour; generic response for known and unknown emails.
- *As a malicious actor, I can use a newly signed-up inactive account to call generation endpoints* → **Blocked:** US-14.5 `active` guard on every handler (US-14.1 must not expose spend paths without that guard).

---

## Security Acceptance Criteria

These mirror every `[SEC]` checkbox in `plan/USER_STORIES.md` → US-14.1. Each is binding.

- [ ] **[SEC] Password policy (server-enforced):** minimum 12 characters, maximum 128, all characters allowed (spaces/unicode), no composition rules; password rejected if it appears in a bundled common-password list (top ~1,000); the same policy module is reused by US-14.4
- [ ] **[SEC] Passwords never appear in logs, error messages, analytics events, URLs, or any `neuramark_` table** — the plaintext password exists only in the request body and the server-side Supabase Auth call; request logging redacts password fields by key name
- [ ] **[SEC] Duplicate-email signup returns the same HTTP status, response body shape, and copy as a new-email signup**, with no measurable content difference; any Supabase "user already exists" error is caught server-side and mapped to the generic response
- [ ] **[SEC] Signup endpoint is rate-limited server-side (tightened for open signup):** max 5 signup attempts per IP per hour AND max 15 per IP per day, tracked in `neuramark_auth_attempts` (`ip_hash`, `email_hash`, `action`, `attempted_at`) in addition to Supabase Auth's built-in limits; over-limit requests get the same generic response with a 429
- [ ] **[SEC] Inactive accounts consume no paid resources:** signup creates only the Supabase auth user and one `neuramark_clients` row; no endpoint that triggers LLM, video, TTS, or file-storage spend is reachable while `active = false` (enforced by the US-14.5 guard on every request, including direct Route Handler / Server Action calls)
- [ ] **[SEC] Any "resend confirmation email" capability is rate-limited like reset requests** (max 3 per email per hour via `neuramark_auth_attempts` plus Supabase built-in limits) and returns the same generic response for known and unknown emails
- [ ] **[SEC] Signup mutation is CSRF-protected:** implemented as a Server Action (Next.js origin check) or a Route Handler that rejects requests whose `Origin` header does not match the app host
- [ ] **[SEC] `auth_user_id` for the `neuramark_clients` row comes only from the server-side Supabase Auth response** — never from the request; the auth-user + client-row creation is transactional or compensated (no orphaned auth users on failure)
- [ ] **[SEC] If signup establishes a session, the session cookie is newly issued server-side at that moment** (never reusing any pre-existing cookie value — session fixation guard)
- [ ] **[SEC] `role` is constrained at the DB level** (Postgres enum `neuramark_client_role` or a CHECK constraint) to exactly `client` | `operator` with `NOT NULL DEFAULT 'client'`, so an invalid role value is impossible regardless of write path; `role` appears in NO auth request contract (signup, login, reset) and any payload containing a `role` field is rejected or stripped before processing

---

## Design Concerns and Required Changes

1. **No session into product after signup.** The happy path lands on "check your email" with no authenticated access to product routes. If Supabase returns a session on signup (config-dependent), do not treat the user as product-authenticated; either omit session establishment until post-confirmation login (preferred) or issue cookie with zero product access until US-14.5 guards apply.
2. **Enumeration-safe duplicate handling is a server-side mapping, not a UI trick.** Catch Supabase duplicate-user errors and return the exact same JSON/HTML path as success. Do not branch on error message text in the client.
3. **`neuramark_auth_attempts` is the V1 rate-limit store.** No new dependency (e.g. Upstash) required. Hash IP and email before insert (e.g. HMAC-SHA256 with a server secret); never store plaintext email in this table if avoidable.
4. **Password policy module location.** Place in a server-only module (e.g. `lib/auth/password-policy.ts`) imported by signup (US-14.1) and reset (US-14.4). Client may mirror length hints for UX; server is authoritative.
5. **Transactional client-row creation.** Preferred: create Supabase auth user, then insert `neuramark_clients` in the same handler; on client-row failure, delete/compensate the auth user (service-role admin API). Alternative: DB trigger on `auth.users` insert — if used, document and test idempotency for duplicate signup paths.
6. **Resend confirmation is in scope if exposed.** Any UI link or endpoint for resend inherits reset-style rate limits and enumeration-safe responses even if added after initial signup page.
7. **CONTRACT.md spot-check (when authored):** Request schema must exclude `role`, `active`, and `auth_user_id`. Response must not include Supabase tokens, internal IDs beyond what the user already supplied, or activation-state hints pre-authentication.

---

## Secure-by-Default Patterns

### Backend (BE)

| Pattern | Requirement |
|---|---|
| **Server-only Supabase** | Import `@supabase/supabase-js` / `@supabase/ssr` only in server modules (`"use server"`, Route Handlers, `lib/` without client re-exports). Service-role key in server env only. |
| **Single signup handler** | One Server Action or Route Handler consumed by the signup form. No parallel undocumented signup paths. |
| **Validate then rate-limit then auth** | Order: schema validation → password policy → rate-limit check (record attempt) → Supabase signUp → client row insert. Rate-limit check before expensive Supabase call, but record attempt even on validation failure to prevent policy-oracle probing (use same generic response). |
| **Generic success response** | Always return the same shape: e.g. `{ ok: true }` or redirect to confirmation page. Never `{ userExists: false }`. HTTP 200 for success path including duplicate. |
| **429 handling** | Over-limit: HTTP 429 with the **same body shape** as success where feasible, or a generic "try again later" that does not reveal whether the email exists. |
| **Error mapping** | Map all Supabase auth errors (duplicate, weak password rejected by Supabase, rate limit) to generic user-facing copy. Log internal error codes server-side only, with password fields redacted. |
| **CSRF** | Server Action (built-in origin check) **or** Route Handler comparing `Origin`/`Referer` to app host. Reject cross-origin POST. |
| **Session fixation** | If setting cookies: generate new session via Supabase; set `HttpOnly`, `Secure` (production), `SameSite=Lax`, `Path=/`. Clear any prior session cookie before set. |
| **No `client_id` from request** | `neuramark_clients.id` is server-generated. Never accept client-supplied IDs or `auth_user_id`. |
| **Strip forbidden fields** | Reject request bodies containing `role`, `active`, `auth_user_id`, or `client_id` with 400, or strip silently before validation — prefer explicit reject for clarity in logs. |

### Frontend (FE)

| Pattern | Requirement |
|---|---|
| **No Supabase in client** | No `@supabase/supabase-js`, no anon key, no auth SDK in Client Components. Signup form calls Server Action or fetches app Route Handler only. |
| **Client validation = presentation** | Email format, password length hints, confirm-password match — UX only. Server re-validates everything. |
| **Single post-submit destination** | Always navigate to "check your email" confirmation screen regardless of whether email was new or duplicate (server returns same response). |
| **No credential persistence** | Do not store password in `localStorage`, `sessionStorage`, URL query params, or analytics. Clear form state after submit. |
| **Generic copy only** | EN/ES strings must not say "email already registered" or "invalid password" with distinguishable variants that leak enumeration. Use neutral "If an account can be created, check your email." |
| **Loading / error states** | Pending disables submit. Errors show generic message; never echo server stack traces or Supabase error text. |
| **No role / active UI** | Signup form fields: email, password, confirm password, display name (and locale if collected). No hidden fields for authorization flags. |
| **Bundle audit** | Verify client bundle contains no Supabase packages or `NEXT_PUBLIC_SUPABASE_*` references after build. |

### Database (DB)

| Pattern | Requirement |
|---|---|
| **Table: `neuramark_clients`** | Columns: `auth_user_id` (unique, links to `auth.users.id`), `email`, `display_name`, `preferred_locale`, `active boolean NOT NULL DEFAULT false`, `role` with DB constraint, `created_at`. Prefix all objects `neuramark_`. |
| **Role constraint** | `CREATE TYPE neuramark_client_role AS ENUM ('client', 'operator')` or `CHECK (role IN ('client', 'operator'))` with `NOT NULL DEFAULT 'client'`. |
| **No password column** | Passwords live in Supabase Auth only. Never add a password hash column to `neuramark_` tables. |
| **Table: `neuramark_auth_attempts`** | Columns: `ip_hash`, `email_hash`, `action` (e.g. `signup`, `resend_confirmation`), `attempted_at`. Index for rate-limit queries. Retention policy optional but document TTL for hygiene. |
| **Parameterized SQL** | All inserts/selects via Supabase client or parameterized queries. No string-concatenated SQL. |
| **Unique constraints** | Unique on `auth_user_id` and likely `email` in `neuramark_clients` to prevent duplicate rows on retry. Handle conflict in signup handler without leaking which constraint fired to the client. |
| **No app write path for `active` or `role`** | Application INSERT sets defaults only. Only operator SQL may UPDATE these columns. Migration comments must document this. |
| **Future RLS** | Design with `client_id` / `auth_user_id` ownership in mind. RLS policies can be added at US-14.5 without schema rework. |

---

## Future-Proofing Notes

- **Identity seam (US-X.3):** Signup creates the `neuramark_clients` row that `getCurrentUser()` will load post–US-14.5. Do not introduce alternate identity resolution (headers, query params, client-supplied `client_id`).
- **Shared password module:** Export `validatePassword(plaintext: string): Result<void, PasswordPolicyError>` from server-only code for US-14.4 reuse.
- **Email confirmation callback:** Confirm-link handling may land in US-14.2/14.5; ensure confirmation does not auto-grant product access before `active = true`.
- **Multi-tenancy:** One auth user → one `neuramark_clients` row → one `client_id` for all owned data. Signup is the only self-service creation path for client rows in V1.
- **Dev fallback:** Real signup must work alongside the hardcoded `getCurrentUser()` until US-14.5. Do not disable signup because auth is "not live yet."
- **Back-door sweep hooks:** After implementation, verify: no `@supabase/supabase-js` in client chunks; no signup Route Handler outside this story; grep for plaintext `password` in log statements; confirm `role`/`active` absent from Zod/request schemas.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-14.1/CONTRACT.md` exists, verify before coding proceeds:

- [ ] Request schema: `email`, `password`, `displayName` (+ optional `preferredLocale`) only
- [ ] Request schema explicitly forbids or omits: `role`, `active`, `auth_user_id`, `client_id`
- [ ] Response schema: minimal (`ok: boolean` or empty success); no tokens, no user IDs, no `active`/`role`
- [ ] Error responses indistinguishable for duplicate vs new email
- [ ] Rate-limit and CSRF behavior documented on the same contract
