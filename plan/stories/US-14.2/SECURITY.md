# Security Design Review — US-14.2

**Story:** US-14.2 — Log in with email and password  
**Date:** 2026-08-28  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-14.2), `plan/SECURITY_BASELINE.md` (Authentication), `plan/stories/US-14.1/SECURITY.md`, `plan/stories/US-14.1/QA.md` (High finding 1 class), `plan/stories/US-14.2/TASKS.md`, `plan/stories/US-14.2/SPEC-REVIEW.md` (ALIGNED), `AGENTS.md`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct: email/password login wrapped entirely behind a Next.js Server Action (or Origin-checked Route Handler), httpOnly server-managed session cookie, one generic failure for unauthenticated outcomes, and `neuramark_clients.active` used **only after successful authentication** to choose `/dashboard` vs `/pending`. Email-confirmation callback `/auth/callback` is in this story and must complete confirm without granting product access while `active = false`. No REDESIGN.

The conditions are the `[SEC]` criteria below plus the CONTRACT freeze list in **Design Concerns**. Implementers must not ship every-request guards, spend blocks, or a `getCurrentUser()` swap — those remain US-14.5.

**Sanctioned interim state (not a finding):** Until US-14.5 lands, `getCurrentUser()` may still return the hardcoded local user (`gaveho@gmail.com` / Gabriel Vega). Login **does** mint a real session cookie for US-14.5 to read later. Direct navigation to product routes while inactive may still hit the hardcoded seam — sanctioned, not a US-14.2 defect. Landing ≠ route protection.

**Do not require** a `login_success` value on `neuramark_auth_action`. Failed attempts use existing `login_failed`; successful login resets the window by deleting matching `login_failed` rows (or equivalent). No new tables.

---

### Threat Summary

US-14.2 is the **session-minting boundary**. Open signup already exists (US-14.1), so any internet actor can attempt login against registered and unregistered emails. Primary threats:

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Credential / existence enumeration** | Attacker learns which emails are registered, unconfirmed, or inactive | One generic failure for unknown email, wrong password, **and** unconfirmed; same status, body shape, and copy; Supabase sign-in runs on all those paths (no app early-return). Activation state revealed only after successful auth. Do **not** repeat US-14.1 High finding 1 (divergent success vs error on internally different paths). |
| **Password brute force** | Account takeover | App-level 5 failures per (email, IP) per 15 minutes in `neuramark_auth_attempts` (`login_failed`); 429 with the **same generic credentials copy**; counter resets on success; **fail closed** if the attempts store errors; Supabase Auth limits as second layer |
| **Session fixation** | Attacker plants a cookie, victim logs in, attacker reuses the planted id | Successful login always issues a **fresh** cookie value; discard any pre-auth session identifier |
| **Token theft from the browser** | Session hijack, refresh-token replay | httpOnly cookie; no access/refresh token in JSON/HTML/JS; no `@supabase/supabase-js` in Client Components; no anon/service keys in the bundle |
| **Open redirect** | Phishing via `next` / `redirectTo` after login or on the callback | Same-origin relative path only: single leading `/`, not `//`, no scheme, no backslash; else `/dashboard` |
| **CSRF on login** | Force a victim to authenticate as the attacker (login CSRF) or submit the victim’s password to the attacker’s form | Server Action origin check, or Route Handler rejecting mismatched `Origin`; POST only for the login mutation |
| **Email-link session / token leak** | Stolen inbox or `Referer` yields tokens or product access | Callback exchanges `code` **server-side**; tokens/`code` never forwarded to the next URL, HTML, or JS; inactive never lands on product routes; `SITE_URL` allowlisted origin for `emailRedirectTo` (already US-14.1) |
| **Activation oracle** | Unauthenticated probe of `active` | Failures (and unauthenticated callback errors) never disclose `active`; pending copy is post-auth only; no `?email=` identity |
| **Cookie / claim smuggling** | Client sets `active`/`role` and skips pending | Cookie carries **identity only**; `active`/`role` never written into the cookie or login payload; read from `neuramark_clients` server-side after auth |

**Residual risk accepted:** Login-time `active` check is a landing choice, not an every-request gate. Until US-14.5, an inactive session plus hardcoded `getCurrentUser()` can still render product pages if the user navigates there. Bounded by: no spend-bearing endpoints introduced here; callback and login never **redirect** inactive users into product routes. Stolen-inbox confirmation (clicking the email link) is inherent to email confirmation; it must not by itself grant product access.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| Email + password (login payload) | High — authentication secret | Browser (untrusted) → Next.js Server Action / Route Handler only |
| Plaintext password in transit | High | HTTPS only; exists only in the request body and the server-side `signInWithPassword` call |
| Session cookie (access + refresh, chunked by `@supabase/ssr` or equivalent) | High — session bearer | Set by the server; `HttpOnly`, `Secure` (production), `SameSite=Lax`, `Path=/`; host-only (do not set `Domain`) |
| Supabase access / refresh tokens | Critical | Server cookie jar only; never in response bodies, logs, or client JS |
| Confirmation `code` (email link → `/auth/callback`) | High — one-time capability | Query string on the first GET only; exchanged server-side immediately; never logged; never copied into the 302 `Location` |
| `neuramark_clients.active` / `role` | High — authorization gates | Server read after successful auth (landing only in this story); **not** a cookie/JWT claim; no app write path |
| Email, display name on pending | Low–medium — user-known PII | Authenticated result only; never from unauthenticated `?email=` |
| `neuramark_auth_attempts` (`login_failed`) | Low — abuse telemetry | Server writes; HMAC `ip_hash` / `email_hash` only; never password, raw IP, or plaintext email |
| `SITE_URL` / redirect allowlist | Medium — open-redirect and email-link origin | Server env; callback 302 targets are app-relative only |
| Service-role key | Critical | Existing server-only client (`persistSession: false`) for `neuramark_clients` / attempts reads; **must not** mint user session cookies |

**Boundaries:**

1. **Browser → login mutation** — Only place the password crosses from untrusted space. Client validation is presentation only.
2. **Login mutation → Supabase Auth (user-scoped SSR client)** — `signInWithPassword` and cookie set via `@supabase/ssr` (or equivalent) using the **server-only anon/publishable key**. The service-role client from US-14.1 stays for privileged reads (`neuramark_clients`, `neuramark_auth_attempts`) and must **not** be the session cookie client.
3. **Email channel → `GET /auth/callback`** — Untrusted query (`code`, `error`, `error_description`, `next`). Handler exchanges or rejects; then 302 to a frozen app-relative path.
4. **Session cookie ↔ server** — Sole session bearer. US-14.5 will validate it inside `getCurrentUser()`; this story must freeze a cookie shape that swap can read without a second session store.
5. **Post-auth landing** — `active` is read fresh from Postgres after credentials succeed. Inactive → `/pending`. Active → `/dashboard` (or validated `next`). This is **not** the US-14.5 every-request guard.

---

## Abuse Cases Considered

- *As a malicious actor, I can tell whether `victim@example.com` is registered by comparing login errors (unknown vs wrong password vs unconfirmed)* → **Blocked:** one generic credentials failure (same status, body shape, copy). App code does not early-return on “user not found”; the Supabase sign-in call runs for unknown email, wrong password, and unconfirmed.
- *As a malicious actor, I can repeat US-14.1 High finding 1: one internal path returns success-shaped output and another returns a distinct error (send-failure vs duplicate)* → **Blocked for login/callback:** missing `neuramark_clients` row after a successful sign-in must follow the **confirmed-inactive success landing** (`/pending`), not `INTERNAL_ERROR` / generic credentials failure. Callback invalid/expired/`error` query params share **one** generic confirmation-failure. Internal errors that only occur when the auth user exists are a finding.
- *As a malicious actor, I can brute-force passwords or spray common passwords* → **Bounded:** 5 `login_failed` per (email, IP) per 15 minutes; over-limit returns **429** with the **same generic credentials copy** (no “too many attempts for this account” vs “unknown email”). Store errors **fail closed** (treat as limited). Success deletes that window. Supabase limits remain on.
- *As a malicious actor, I can probe `active` without knowing the password, via pending vs error vs different 429s* → **Blocked:** activation is disclosed only after successful authentication. Unauthenticated responses stay generic regardless of `active`.
- *As a malicious actor, I can CSRF-login a victim into my account (login CSRF) or submit their password cross-origin* → **Blocked:** POST-only Server Action origin check, or Route Handler rejecting mismatched `Origin`.
- *As a malicious actor, I can plant a session cookie before the victim logs in (fixation)* → **Blocked:** login (and callback-if-it-sets-a-session) always issues a fresh cookie value and discards any pre-auth identifier.
- *As a malicious actor, I can pass `next=https://evil.example` or `next=//evil.example` after login or on the callback* → **Blocked:** same-origin relative-path validation; anything else → `/dashboard` (login) or the frozen callback landing (callback). Callback must not honor an external `redirect_to`.
- *As a malicious actor, I can read access/refresh tokens from JS, HTML, JSON, or the post-callback URL* → **Blocked:** tokens only in httpOnly cookies; `code` exchanged server-side; 302 strips `code` / tokens from `Location`.
- *As a malicious actor, I can click a stolen confirmation link and reach the dashboard while `active = false`* → **Blocked:** callback never 302s inactive users to product routes. Frozen landing is `/pending` and/or `/login` only.
- *As a malicious actor, I can open `/pending?email=victim@example.com` and treat that as proof of identity (US-14.1 QA Low #13)* → **Blocked:** pending identity comes from the authenticated result only; unauthenticated query params are not echoed as the account.
- *As a malicious actor, I can send `role` / `active` / `auth_user_id` / `client_id` on login or smuggle them into the cookie* → **Blocked:** forbidden keys rejected or stripped; cookie is identity-only; DB columns unchanged by this story.
- *As a malicious actor, I can use the service-role client to mint a cookie that bypasses Auth confirmation* → **Blocked:** session cookies come only from user-scoped `signInWithPassword` / `exchangeCodeForSession` (SSR client). Service-role stays `persistSession: false`.
- *As a malicious actor, I can learn passwords from logs, error pages, or analytics* → **Blocked:** reuse `redactAuthPayload`; never echo the password on failure; never store it in `neuramark_*`.
- *As a malicious actor, I can call generation endpoints from an inactive login in this story* → **Out of scope / residual:** US-14.5 spend and route guards. This story must not add spend endpoints or treat inactive login as product-authenticated in its own redirects.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-14.2 are binding. Items marked **(added)** are new in this review — paste them into the story. Do not drop or weaken any existing `[SEC]` line.

- [ ] **[SEC] The generic login failure returns the same status code, body shape, and copy for unknown email, wrong password, and unconfirmed account**, with no timing side channel introduced by app code (the Supabase call runs for all failure paths; no early return on "user not found")
- [ ] **[SEC] Brute-force protection:** max 5 failed attempts per (email, IP) per 15-minute window tracked in `neuramark_auth_attempts`; over-limit attempts return the same generic failure (with 429), and the counter resets on successful login; Supabase Auth built-in rate limits remain enabled as the second layer
- [ ] **[SEC] (added) Rate-limit store errors fail closed:** if `recordAuthAttempt` / count queries throw or return an error, treat the request as over-limit and return the same 429 generic failure — do not fail open (US-14.1 QA Medium #2 class). A successful sign-in still succeeds if **clearing** `login_failed` rows fails (log server-side; do not convert success into an enumeration-shaped error)
- [ ] **[SEC] Session cookie is set with `HttpOnly`, `Secure` (in production), `SameSite=Lax`, and `Path=/`;** no Supabase access/refresh token is readable by browser JavaScript or present in any response body
- [ ] **[SEC] Session rotation on login:** a successful login always issues a fresh session cookie value; any session identifier present before authentication is discarded (session fixation guard)
- [ ] **[SEC] Login mutation is CSRF-protected:** Server Action with origin verification, or Route Handler rejecting mismatched `Origin` headers
- [ ] **[SEC] The post-login redirect target (`next`/`redirectTo` parameter) is validated as a same-origin relative path:** must start with a single `/`, must not start with `//` or contain a scheme/backslash; anything else falls back to `/dashboard` (open-redirect prevention)
- [ ] **[SEC] Passwords are never logged or echoed back on failure;** the login handler redacts credential fields from any error/telemetry path
- [ ] **[SEC] The active/inactive distinction is revealed only AFTER successful authentication:** login failures for inactive, active, unconfirmed, and nonexistent accounts are all the same generic error, and no unauthenticated request or response can be used to learn an account's activation state
- [ ] **[SEC] The pending-activation screen shows only what the user already knows** (at most their own email/display name) plus neutral copy; no internal IDs, activation queue details, operator contact internals, or timestamps that leak operational information
- [ ] **[SEC] (added) `/pending` identity is never an unauthenticated query param:** do not treat `?email=` (or any other query field) as proof of identity or echo it as the account (closes US-14.1 QA Low #13). After login, email/display name come from the authenticated result only
- [ ] **[SEC] (added) Login request contract forbids `role`, `active`, `auth_user_id`, and `client_id`:** any payload containing those keys is rejected or stripped before processing (same pattern as signup). Success payloads must not include `role`, `client_id`, `auth_user_id`, or tokens. A post-auth landing discriminator (`dashboard` vs `pending`) is allowed; a raw `active` boolean is unnecessary and must not appear on unauthenticated responses
- [ ] **[SEC] (added) Cookie carries identity only:** do not bake `active`, `role`, or `client_id` into cookie values or JWT-style claims the browser can influence. Session cookie shape is the `@supabase/ssr` (or equivalent) host-only cookie US-14.5 will read — no parallel product session store, no service-role session
- [ ] **[SEC] (added) Missing or unreadable `neuramark_clients` row after successful Supabase sign-in must not become an enumeration/oracle path** (US-14.1 High finding 1 class): do not return a client-visible error that only happens when the auth user exists (`INTERNAL_ERROR`, “profile missing”, distinct copy). Land on the confirmed-inactive path (`/pending`). Do **not** INSERT/UPDATE `neuramark_clients` from login (no self-service activation, no orphan repair write)
- [ ] **[SEC] (added) `GET /auth/callback` completes email confirmation server-side and never grants product access while `active` is not true:** exchange `code` on the server; `code`, access_token, and refresh_token never appear in the 302 `Location`, HTML, JSON, or client JS; they are never logged (redact if a URL is logged). Invalid, expired, missing, or already-used codes — and Supabase `error` / `error_description` query params — share **one** generic confirmation-failure (same status, shape, copy); do not echo provider error text. Inactive (or missing client row) never 302s to `/dashboard` or other product routes. If the callback sets a session cookie, the same cookie flags and fixation rules as login apply. Callback `next` / `redirect_to` use the same relative-path rule as login; unsafe values fall back to the frozen callback landing, not an external URL
- [ ] **[SEC] (added) Confirmation and login use `SITE_URL` as the allowlisted public origin** (reuse `getSignupEmailRedirectTo()` / US-14.1): do not build `emailRedirectTo` or post-callback absolute URLs from attacker-controlled hosts; if `SITE_URL` is unset, do not fall through to an open redirect

---

## Design Concerns and Required Changes

### CONTRACT.md must freeze (non-negotiable)

When `plan/stories/US-14.2/CONTRACT.md` is authored, lock these before implementation. Security will spot-check the contract against this list.

1. **Login mutation surface** — One Server Action (preferred, matches US-14.1 CSRF) **or** one Origin-checked POST Route Handler. No second undocumented login path. No `@supabase/supabase-js` / tokens / keys in the browser.
2. **Generic credentials failure** — Unknown email, wrong password, and unconfirmed share **one** error code, HTTP status, body shape, and `messageKey`. Suggested: `{ ok: false, error: { code: "INVALID_CREDENTIALS", messageKey: "auth.login.genericFailure" } }` (name is CONTRACT’s choice; uniqueness of the triple is not). Do **not** expose `EMAIL_NOT_CONFIRMED`, `USER_NOT_FOUND`, or `INVALID_PASSWORD` to the client. Validation (malformed email) and `FORBIDDEN_FIELDS` may differ — they do not reveal account existence. `RATE_LIMITED` is 429 with the **same user-facing credentials copy** (or the existing generic `auth.errors.rateLimited` used uniformly, never branched on whether the email exists). `INTERNAL_ERROR` is only for failures that also occur for unknown users (e.g. unconfigured Supabase); it must not fire solely on “user exists, profile read failed.”
3. **Rate-limit fail-closed** — Document: 5 `login_failed` per (`email_hash`, `ip_hash`) per 15 minutes; 429 generic; reset on success; store errors → limited. No new rate-limit package. No `login_success` enum unless a later story needs audit rows.
4. **Cookie flags and client** — `HttpOnly`, `Secure` when `NODE_ENV === "production"` (or equivalent production check), `SameSite=Lax`, `Path=/`, host-only. Session minted with `@supabase/ssr` (sanctioned) + server-only anon/publishable key. Service-role client remains `persistSession: false` and is not the cookie adapter. Response bodies contain zero tokens.
5. **Callback path (pick exactly one primary E2E path)** — Security default, freeze unless product overrides in CONTRACT:
   - **Path A (preferred):** `GET /auth/callback` exchanges `code` server-side to **complete confirmation**, then **does not leave a durable session** (sign out / drop cookies if exchange set them) and **302 → `/login`** with generic “you can sign in” copy (no `code`, no tokens, no `?email=`). Confirmed-inactive **password** login then **302 → `/pending`**. Stolen inbox confirms email but does not mint a session.
   - **Path B (acceptable):** `GET /auth/callback` exchanges `code`, **sets** the session cookie (same flags + fixation), reads `active`, and **302 → `/pending`** when `active` is not true (missing row included). **Never** 302 → `/dashboard` or product routes for inactive. Pending identity from the new session, not query params. If `active === true` (operator already activated), `/dashboard` (or validated `next`) is allowed.
   CONTRACT must name **A or B** and E2E must prove that path. Hybrid “sometimes session, sometimes not” is a finding.
6. **Open redirect** — Login `next` / `redirectTo`: relative path starting with a single `/`; reject `//`, scheme, backslash, encoded `//`. Fallback `/dashboard`, but **inactive successful login ignores `next` and goes to `/pending`** (open-redirect must not skip the pending landing). Callback redirects only to frozen `/login` or `/pending` (or `/dashboard` only on Path B when `active === true`).
7. **Out of scope (copy into CONTRACT)** — US-14.5 `getCurrentUser()` swap, every-request `active`/spend/RLS/middleware allowlist; US-14.3 logout mutation; US-14.4 reset implementation (link only); RBAC or activation UI; app writes to `active` / `role`.

### Required implementation constraints

1. **Do not repeat US-14.1 High finding 1.** Any branch after “Supabase accepted the user” that returns a *different client-visible outcome* than the normal inactive/active landings is an oracle. Map: successful auth + `active=true` → dashboard landing; successful auth + `active=false` **or missing row** → pending landing; failed auth (including unconfirmed) → generic credentials failure. Callback provider errors → generic confirmation failure, never a dashboard redirect.
2. **User-scoped SSR client vs service-role.** Login/callback cookie writes: `@supabase/ssr` `createServerClient` with cookie get/set on the incoming response. Privileged `neuramark_clients` / `neuramark_auth_attempts`: existing service-role helper. Never put the service-role key in a cookie client.
3. **Processing order (login):** forbidden keys → Zod parse → rate-limit check (fail closed) → `signInWithPassword` (always called on valid shape, including unknown emails) → on Auth error: record `login_failed`, return generic credentials failure (or 429 if already limited) → on Auth success: reset `login_failed` window, read `neuramark_clients.active` (service-role), set fresh cookies, return landing. Do not skip the Supabase call for “user not found.”
4. **Unconfirmed is a failed sign-in**, not a pending landing. Pending is **confirmed + inactive** (or missing row after a **successful** session). Mixing these re-opens enumeration (“this email exists but is unconfirmed”).
5. **Fixation:** clear any pre-existing `sb-*` (or chosen cookie name) cookies, then set the new session. Do not reuse a client-supplied cookie value as the session id.
6. **Callback is GET** (email link). CSRF origin checks do not apply the same way; the `code` is the capability. Limit the handler to: exchange or reject, optional cookie set per frozen path, 302. No other mutations. `Referrer-Policy: no-referrer` on the 302 response is required so the `code` URL is not leaked via `Referer` to the next page’s third parties.
7. **Reuse** `lib/auth/rate-limit.ts`, `forbidden-fields.ts`, `errors.ts` (`redactAuthPayload`), `get-client-ip.ts`, `hash.ts`. Extend rate-limit with `isLoginRateLimited` / reset helper; do not add Upstash or a new table.
8. **FE:** generic EN/ES failure only; clear password from client state after submit (close the US-14.1 leftover on the **login** form even if signup still has it); do not navigate to an unvalidated `next`; no Supabase in the bundle.
9. **Dependencies:** `@supabase/ssr` is the only expected new auth package (first-party, already allowed by `SECURITY_BASELINE.md`). No other auth libraries.

---

## Future-Proofing Notes

- **US-14.5 cookie shape:** Mint cookies now in the exact `@supabase/ssr` format `getCurrentUser()` will validate (signature/expiry or user lookup — not mere cookie presence). Do not invent `neuramark_session` JWTs, signed `client_id` cookies, or `active` claims. Idle/refresh lifetime (≤ 7 days, rotating refresh, refresh token never in JS) is specified on US-14.5; this story should not contradict it (no year-long `Max-Age` on a custom cookie).
- **Identity seam:** Login/callback may read `neuramark_clients` **only** to choose landing and to pass the user’s own email/display name into pending. That is not a second product identity API. Product pages keep using `getCurrentUser()` (hardcoded until US-14.5).
- **`active` freshness:** Do not cache `active` in the cookie. US-14.5 will re-read it every request so operator SQL deactivation works without re-login.
- **Logout / reset:** Cookie names, `Path`, and host-only attributes must match so US-14.3 can clear every variant. US-14.4 must not change `active`.
- **RLS:** Stay deny-by-default with zero policies (US-14.1). Login reads use service-role. Do not add authenticated RLS policies here.
- **Dev fallback:** Do not add `AUTH_DEV_FALLBACK` or header/query identity in this story.
- **Back-door sweep hooks after implementation:** no `@supabase` / `NEXT_PUBLIC_SUPABASE` / tokens in `.next/static`; no login Route Handler besides the contracted one; grep logs for `password` / `code=` / `refresh_token`; confirm `role`/`active` absent from the login Zod schema; confirm `/auth/callback` never 302s inactive users to `/dashboard`.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-14.2/CONTRACT.md` exists, verify before coding proceeds:

- [ ] Request schema: `email`, `password`, optional `next` / `redirectTo` only
- [ ] Request schema forbids or omits: `role`, `active`, `auth_user_id`, `client_id`
- [ ] Credentials failure: one code/status/shape/copy for unknown, wrong password, unconfirmed
- [ ] Rate-limit: 5 / (email, IP) / 15 min; 429; fail closed; reset on success; no `login_success` enum required
- [ ] Cookie flags documented; no tokens in the action/handler result body
- [ ] `/auth/callback` in scope; **Path A or Path B frozen**; inactive never product-routed
- [ ] `/pending` identity from authenticated result, not `?email=`
- [ ] Open-redirect rules on login `next` and callback redirects; inactive login ignores `next` → `/pending`
- [ ] Out of scope: US-14.5 guards/spend/`getCurrentUser()` swap, US-14.3, US-14.4 implementation
