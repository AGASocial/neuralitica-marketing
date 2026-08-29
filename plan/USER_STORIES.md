# Neuralitica V1 — User Stories (from MODULES_ROADMAP v1.1)

> **Source:** `plan/MODULES_ROADMAP_v1.1.html`  
> **Goal:** 3 AI Reels/week per client · Instagram only · No human recording required · Cheap API first · **Default provider tier: low** (see Conventions)
> **Agents:** Each story is tagged **FE**, **BE**, or **DB** so frontend and backend work can run in parallel where dependencies allow.

---

## Conventions

| Field | Meaning |
|-------|---------|
| **ID** | Stable reference (`US-{phase}.{seq}`) |
| **Priority** | P0 = MVP blocker · P1 = post-MVP |
| **Depends on** | Stories or modules that must exist first |
| **Owner** | Primary implementing agent |

**Roles**

- **Client** — local service provider (plumber, barber, etc.)
- **Operator** — internal user running production (can be same hardcoded user in local dev)
- **System** — automated agents and pipelines

**Story format**

```
As a [role], I want [capability], so that [outcome].
```

**Stack and database naming**

- Stack: Next.js (FE + BE) · Supabase (Postgres) as database · Vercel for deployment.
- Supabase is accessed ONLY by the Next.js backend (Server Actions, Route Handlers, server helpers). The frontend never imports Supabase clients or sees Supabase keys; all FE data access — including future auth — goes through Next.js endpoints.
- Table names in the **DB** rows below are *logical* names. Every physical object in Supabase — tables, triggers, indexes, functions, enums, policies — MUST carry the `neuramark_` prefix.
  - Example: `interview_sessions` → table `neuramark_interview_sessions`, index `neuramark_interview_sessions_client_id_idx`, trigger `neuramark_interview_sessions_set_updated_at`.
- Schema changes go through Supabase migrations, never ad-hoc dashboard edits.

**Provider tiers (assembly assets)**

V1 starts on the **low** tier by default. The same assembly pipeline (US-9.x) runs at both tiers; only upstream asset generators change. The policy engine (US-7.x) and catalogs (US-X.4) resolve `provider_tier` → concrete vendor per asset role. Clients never pick a tier; operators may switch global default or per-client override.

| Asset role | Low tier (V1 default) | High tier (P1 / operator override) |
|---|---|---|
| LLM text (strategy, script, caption, QA) | DeepSeek V4 Flash / Qwen3.5 via **SiliconFlow** | GPT-5.4 mini / Claude-class APIs |
| TTS voiceover | **CosyVoice2** via SiliconFlow (or Inworld Mini) | ElevenLabs Multilingual |
| Talking-head video (own / generic avatar) | **SadTalker** via Replicate (~$0.10/Reel) | **HeyGen** standard or Avatar IV |
| Talking-head alt (generic loop) | **MuseTalk** via Replicate (~$0.19/Reel) | HeyGen studio avatar |
| B-roll (faceless mode) | **Wan2.1 I2V Turbo** via SiliconFlow (~$0.21/5s clip) | LTX 2.3 Pro / Kling 3.0 |
| Cover still | FFmpeg frame extract (no API) | FLUX / image API |
| Final assembly | FFmpeg on server (no API) | Same |

**V1 economics target:** ~$0.37–0.58 per 30s Reel (low tier) · ~$1.10–1.75 per client per week (3 Reels) · default `max_cost_cents` seed **150** ($1.50/Reel) including retries, B-roll, and TTS.

**Upgrade order when quality justifies cost:** avatar adapter → B-roll adapter → TTS → LLM. HeyGen remains an operator fallback (US-8.7), not the silent default.

**Reference docs & code:** visual comparison → `plan/PROVIDER_TIERS.html` · TypeScript contract → `lib/providers/provider-adapters.ts` · Zod schemas → `lib/contracts/providers.ts`

---

## Phase 0 — Access

### Module: Authentication (P0)

> **Architecture (hard constraint from `AGENTS.md`):** Supabase Auth (email/password) is used ONLY from the Next.js backend. The browser never imports Supabase auth SDKs and never sees Supabase tokens or keys. Auth pages call Next.js Route Handlers / Server Actions exclusively. Sessions are server-managed httpOnly cookies. Identity is resolved only via the server-side `getCurrentUser()` helper (US-X.3) — these stories replace its hardcoded implementation through that designed seam, changing zero call sites. Supabase Auth owns `auth.users`; app-side profile data lives in `neuramark_`-prefixed tables linked via `auth_user_id`. Role systems remain OUT of scope.
>
> **Access model (user decision):** signup is OPEN (not invite-only). Flow: signup → Supabase sends email confirmation → app-side record created with `active = false` → an operator manually activates the account via SQL (`UPDATE ... SET active = true`). Only active accounts get product access; confirmed-but-inactive users see a neutral "account pending activation" screen. An admin activation UI is explicitly out of scope (possible P1 later).
>
> **Role flag (user decision):** `neuramark_clients.role text NOT NULL DEFAULT 'client'`, allowed values `client` | `operator` (Postgres enum or CHECK constraint, `neuramark_` prefix). Set to `operator` via SQL only — same trust model as `active`. `getCurrentUser()` returns the role; operator-only Server Actions / Route Handlers check it server-side. NO role management UI, NO permission tables, NO invite flows. The column exists from day one (US-14.1). Role gating and session-backed identity ship in US-14.5 (`requireOperator()` after the `active` gate). Promotion remains SQL-only.

#### US-14.1 — Sign up with email and password
**As a** Client, **I want** to create an account with my email and a password, **so that** I can access my own workspace once auth is live.

| Owner | Work |
|-------|------|
| **FE** | Signup page (PrimeReact form: email, password, confirm password, display name); client-side validation as presentation only; loading/pending/error states; post-signup "check your email to confirm" screen; post-confirmation "account pending activation" state (shared with US-14.2/14.5); EN/ES copy |
| **BE** | Route Handler / Server Action wrapping Supabase Auth user creation server-side (email confirmation enabled); input validation (email format, password policy); duplicate-email handled without revealing whether the address exists (same generic response); create linked client row with `active = false` |
| **DB** | `clients` table (`neuramark_clients`, aka "neuramark_users" in user shorthand — same record): `auth_user_id` (FK-like link to `auth.users.id`), email, display_name, preferred_locale, `active boolean NOT NULL DEFAULT false`, `role text NOT NULL DEFAULT 'client'` constrained to `client` \| `operator` (Postgres enum or CHECK, `neuramark_` prefix), created_at; migration via Supabase migrations |

**Acceptance criteria**
- [x] Signup is open (no invite required); after submitting, the client sees a "check your email to confirm" screen — no session into product routes
- [x] Supabase sends an email confirmation on signup; the account cannot log in to a pending/product state before confirming
- [x] After email confirmation, the client sees a neutral "account pending activation" state until an operator activates the account (US-14.5 enforces this on every request) — Path A + every-request pending/403 shipped; inbox E2E unproven
- [x] Signing up with an already-registered email returns the same generic success-style response as a new email (no user enumeration)
- [x] Password policy enforced server-side (minimum length; client-side hints are presentation only)
- [x] A `neuramark_clients` row linked to the Supabase `auth.users` record is created on signup with `active = false` (column is `NOT NULL DEFAULT false`)
- [x] Manual activation: operator runs `UPDATE ... SET active = true` via SQL (no admin UI — explicitly out of scope, P1 candidate); once active, the user gets full access on their next request/login with no additional step
- [x] Every signup creates the row with `role = 'client'`; `role` is absent from the signup request contract and cannot be set through the endpoint under any payload (promotion to `operator` is SQL-only)
- [x] No Supabase SDK, token, or key appears in any client bundle or browser response
- [x] Copy exists in English and Spanish
- [x] [SEC] Password policy (server-enforced): minimum 12 characters, maximum 128, all characters allowed (spaces/unicode), no composition rules; password rejected if it appears in a bundled common-password list (top ~1,000); the same policy module is reused by US-14.4
- [x] [SEC] Passwords never appear in logs, error messages, analytics events, URLs, or any `neuramark_` table — the plaintext password exists only in the request body and the server-side Supabase Auth call; request logging redacts password fields by key name
- [x] [SEC] Duplicate-email signup returns the same HTTP status, response body shape, and copy as a new-email signup, with no measurable content difference; any Supabase "user already exists" error is caught server-side and mapped to the generic response
- [x] [SEC] Signup endpoint is rate-limited server-side (tightened for open signup): max 5 signup attempts per IP per hour AND max 15 per IP per day, tracked in `neuramark_auth_attempts` (ip_hash, email_hash, action, attempted_at) in addition to Supabase Auth's built-in limits; over-limit requests get the same generic response with a 429
- [x] [SEC] Inactive accounts consume no paid resources: signup creates only the Supabase auth user and one `neuramark_clients` row; no endpoint that triggers LLM, video, TTS, or file-storage spend is reachable while `active = false` (enforced by the US-14.5 guard on every request, including direct Route Handler / Server Action calls) — `requireActive()` shipped; no spend endpoints exist yet (validator NOTE)
- [x] [SEC] Any "resend confirmation email" capability is rate-limited like reset requests (max 3 per email per hour via `neuramark_auth_attempts` plus Supabase built-in limits) and returns the same generic response for known and unknown emails
- [x] [SEC] Signup mutation is CSRF-protected: implemented as a Server Action (Next.js origin check) or a Route Handler that rejects requests whose `Origin` header does not match the app host
- [x] [SEC] `auth_user_id` for the `neuramark_clients` row comes only from the server-side Supabase Auth response — never from the request; the auth-user + client-row creation is transactional or compensated (no orphaned auth users on failure)
- [x] [SEC] If signup establishes a session, the session cookie is newly issued server-side at that moment (never reusing any pre-existing cookie value — session fixation guard)
- [x] [SEC] `role` is constrained at the DB level (Postgres enum `neuramark_client_role` or a CHECK constraint) to exactly `client` | `operator` with `NOT NULL DEFAULT 'client'`, so an invalid role value is impossible regardless of write path; `role` appears in NO auth request contract (signup, login, reset) and any payload containing a `role` field is rejected or stripped before processing

**Depends on:** US-X.3 (seam definition)  
**Priority:** P0

---

#### US-14.2 — Log in with email and password
**As a** Client, **I want** to log in with my email and password, **so that** I can reach my dashboard securely.

| Owner | Work |
|-------|------|
| **FE** | Login page (PrimeReact form: email, password); submit pending state; generic failure message for bad credentials; link to signup and reset password; redirect to dashboard on success (active accounts) or to the "account pending activation" screen (confirmed-but-inactive accounts); EN/ES copy |
| **BE** | Route Handler / Server Action calling Supabase Auth sign-in server-side; on success set httpOnly session cookie (server-managed) and check `neuramark_clients.active` to choose the landing destination; on failure return one generic error regardless of cause |
| **DB** | — (session lives in the cookie / Supabase Auth; reads `neuramark_clients.active` from US-14.1) |

**Acceptance criteria**
- [x] Valid credentials for an ACTIVE account establish a server-side session (httpOnly cookie) and redirect to the dashboard
- [x] Valid credentials for a confirmed-but-INACTIVE account authenticate but land on the neutral "account pending activation" screen (EN/ES); no dashboard or product route is reachable — login-time landing; every-request blocking shipped in US-14.5
- [x] The `active` check is not a login-time-only gate: it is enforced server-side on every request via `getCurrentUser()`/route guards (US-14.5)
- [x] Invalid email or password shows the same generic error (no distinction between "unknown email" and "wrong password")
- [x] Session survives page refresh and new tab; no Supabase token is readable by browser JavaScript — cookie persistence; identity swap shipped in US-14.5
- [x] Failure, loading, and pending states covered
- [x] Copy exists in English and Spanish
- [x] [SEC] The generic login failure returns the same status code, body shape, and copy for unknown email, wrong password, and unconfirmed account, with no timing side channel introduced by app code (the Supabase call runs for all failure paths; no early return on "user not found")
- [x] [SEC] Brute-force protection: max 5 failed attempts per (email, IP) per 15-minute window tracked in `neuramark_auth_attempts`; over-limit attempts return the same generic failure (with 429), and the counter resets on successful login; Supabase Auth built-in rate limits remain enabled as the second layer
- [x] [SEC] Session cookie is set with `HttpOnly`, `Secure` (in production), `SameSite=Lax`, and `Path=/`; no Supabase access/refresh token is readable by browser JavaScript or present in any response body
- [x] [SEC] Session rotation on login: a successful login always issues a fresh session cookie value; any session identifier present before authentication is discarded (session fixation guard)
- [x] [SEC] Login mutation is CSRF-protected: Server Action with origin verification, or Route Handler rejecting mismatched `Origin` headers
- [x] [SEC] The post-login redirect target (`next`/`redirectTo` parameter) is validated as a same-origin relative path: must start with a single `/`, must not start with `//` or contain a scheme/backslash; anything else falls back to `/dashboard` (open-redirect prevention)
- [x] [SEC] Passwords are never logged or echoed back on failure; the login handler redacts credential fields from any error/telemetry path
- [x] [SEC] The active/inactive distinction is revealed only AFTER successful authentication: login failures for inactive, active, unconfirmed, and nonexistent accounts are all the same generic error, and no unauthenticated request or response can be used to learn an account's activation state
- [x] [SEC] The pending-activation screen shows only what the user already knows (at most their own email/display name) plus neutral copy; no internal IDs, activation queue details, operator contact internals, or timestamps that leak operational information

**Depends on:** US-14.1  
**Priority:** P0

---

#### US-14.3 — Log out
**As a** Client, **I want** to log out, **so that** my session cannot be reused on a shared device.

| Owner | Work |
|-------|------|
| **FE** | Logout action in the header/user menu and on pending; confirmation optional; redirect to login page; EN/ES copy |
| **BE** | Server Action that revokes the Supabase session server-side and clears the httpOnly session cookie |
| **DB** | — |

**Acceptance criteria**
- [x] Logout clears the session cookie and revokes the server-side session
- [x] After logout, protected routes redirect to login (verified with US-14.5 guard) — HTTP no-cookie 302 proven after fa48b6f; live session HTML replay unproven (QA Low #2)
- [x] Back button after logout does not expose authenticated data
- [x] Copy exists in English and Spanish
- [x] [SEC] Logout revokes the session in Supabase Auth server-side (sign-out / refresh-token revocation), not just cookie deletion; a captured pre-logout cookie value replayed after logout is rejected by `getCurrentUser()` — seam-level replay; live Auth E2E unproven (validator NOTE)
- [x] [SEC] Logout is a POST-only Server Action / Route Handler with the same CSRF origin check as other auth mutations; no GET request can terminate (or be forced to terminate) a session
- [x] [SEC] Authenticated pages are served with `Cache-Control: no-store` so the browser back button and shared-device history cannot render cached authenticated content after logout
- [x] [SEC] The cookie is cleared with attributes matching how it was set (name, path, domain), leaving no stale variant behind
- [x] [SEC] Surface is a POST-only Server Action (Next.js origin check, same class as `logIn` / `signUp`) — not a Route Handler. No `GET /logout`, no GET form, no `<a href>` that logs out, no public GET logout path on the US-14.5 allowlist
- [x] [SEC] Order: revoke then expire. User-scoped `createUserScopedAuthClient` calls `signOut({ scope: "local" })` (this refresh token) before `discardSupabaseAuthCookies` / `applySessionCookieFlags({ maxAge: 0 })`. Service-role is forbidden on this action. Retry revoke once; if it still fails, expire cookies anyway and never return `{ ok: true }`
- [x] [SEC] Cookie delete flags match set flags: `HttpOnly`, `Secure` in production, `SameSite=Lax`, `Path=/`, host-only (`Domain` unset). Expire every `sb-*` (`isSupabaseAuthCookieName`). Do not clamp `maxAge: 0` up to 7 days
- [x] [SEC] Scope is local (this device / this session), not global. Do not call `signOut({ scope: "global" })`. Do not ship “sign out all devices” UI. US-14.4 owns global sign-out on password reset
- [x] [SEC] Replay coverage is automated: capture `sb-*` values, run logout, replay the old `Cookie` on `getCurrentUser()` and a product `GET /dashboard` (and `/pending`) → unauthenticated (null user / login redirect), not authenticated HTML — seam-level; live Auth E2E unproven (validator NOTE)
- [x] [SEC] Pending can log out; do not call `requireActive()` or `requireOperator()` on this action. The same Server Action is wired on the product header island and `/pending`. Missing / already-expired session is idempotent (expire crumbs, land on login, not 500)
- [x] [SEC] `Cache-Control: no-store` is owned by US-14.5 on `/`, `/dashboard`, `/dashboard/:path*`, and `/pending`. This story verifies Back after logout; it must not fork middleware, re-implement guards, or add a second caching scheme. Extend headers only if this story adds a new gated surface (none expected)
- [x] [SEC] Success lands on `/login` without `next` of `/dashboard`, `/`, or `/pending`. Optional `locale=en|es` only if already on the request. Do not add `?loggedOut=1`. Never copy `Host` / `X-Forwarded-Host`. After logout, US-14.5 is the redirect for a later product GET
- [x] [SEC] Logout request/result forbid `role`, `active`, `auth_user_id`, and `client_id`: reject or strip if present. Empty input is fine. Result bodies contain no tokens, `role`, `active`, or `client_id`. No app write to `neuramark_clients`. No `logout` value on `neuramark_auth_action`
- [x] [SEC] Header identity stays a Server Component: client island is the control only. No `getCurrentUser()` in Client Components, no `document.cookie`, no browser Supabase SDK. Pending identity remains server-passed email + display name
- [x] [SEC] `AUTH_DEV_FALLBACK`: logout still expires `sb-*` and redirects; it cannot revoke `DEV_USER`. Do not persist the fallback across logout or invent a fake session store

**Depends on:** US-14.2, US-14.5 (redirect behavior)  
**Priority:** P0

---

#### US-14.4 — Reset forgotten password
**As a** Client, **I want** to request a password reset by email and set a new password, **so that** I can recover access without support intervention.

| Owner | Work |
|-------|------|
| **FE** | "Forgot password" page (email input) with generic confirmation; "Set new password" page reached from the emailed link (new password + confirm); expired/invalid-token error state with retry path; EN/ES copy |
| **BE** | Request endpoint: trigger Supabase Auth recovery email server-side, always returning the same generic response whether or not the email exists; set-password endpoint: validate recovery token server-side, apply new password via Supabase Auth, invalidate token after use |
| **DB** | — (recovery tokens owned by Supabase Auth) |

**Acceptance criteria**
- [x] Requesting a reset returns the same generic "check your email" response for known and unknown emails (no enumeration)
- [x] The emailed link leads to a set-new-password page that works exactly once per token — static path complete; live inbox E2E unproven
- [x] Expired or already-used tokens show a clear error with a path to request a new link
- [x] New password is validated server-side against the same policy as signup
- [x] After a successful reset the client can log in with the new password; the old password no longer works — static path complete; live inbox E2E unproven
- [x] Copy exists in English and Spanish
- [x] [SEC] Known and unknown emails get the same status code, body, and copy from the request endpoint; the Supabase recovery call's "user not found" outcome is absorbed server-side, and app code adds no timing branch that distinguishes the two
- [x] [SEC] Reset requests are rate-limited: max 3 requests per email per hour and max 10 per IP per hour, tracked in `neuramark_auth_attempts`; over-limit requests still return the generic "check your email" response (with 429)
- [x] [SEC] Recovery tokens are single-use and expire within 1 hour (Supabase Auth OTP expiry configured accordingly); a used or expired token cannot set a password, and any outstanding recovery token is invalidated when the password changes by any means — ops OTP ≤ 1h documented in CONTRACT/.env.example; live expiry unproven (validator NOTE, do not fail)
- [x] [SEC] The emailed link lands on a Next.js Route Handler that exchanges the recovery code for a session server-side; the token never reaches client-side JavaScript, is never logged, and the set-password page sends `Referrer-Policy: no-referrer` so the URL cannot leak via referrer
- [x] [SEC] A successful password reset revokes all other active sessions for that user (global sign-out), so a stolen session does not survive recovery
- [x] [SEC] The set-password endpoint enforces the shared password policy module (US-14.1), is CSRF-protected, and never logs the new password
- [x] [SEC] Password reset works identically for active, inactive, and unconfirmed accounts — same generic responses, same flow (preserving enumeration resistance); a successful reset never changes `neuramark_clients.active`, and the account remains gated on activation after the reset (recovering a password grants credential access only, never product access) — every-request `active` / identity swap shipped in US-14.5
- [x] [SEC] Rate-limit store errors fail closed: if `recordAuthAttempt` / count queries throw or return an error, treat the request as over-limit and return 429 with the same generic check-email copy — do not fail open; record every well-formed submitted email (known or unknown) so 429 vs 200 is not an existence oracle
- [x] [SEC] Request-reset is CSRF-protected the same way as set-password: Server Action with origin verification (or Route Handler rejecting mismatched `Origin`); no GET can trigger a recovery email
- [x] [SEC] Request-reset must not become an existence oracle via send/profile failure: absorb “user not found”; map provider/send failures that only occur for existing users to generic check-email success; do not read `neuramark_clients` (or confirmation status) to decide whether to send; `INTERNAL_ERROR` only for failures that also occur for unknown emails
- [x] [SEC] Recovery `emailRedirectTo` uses server-only `SITE_URL` as the allowlisted public origin pointing at the dedicated recovery callback — never `Host` / `X-Forwarded-Host`; if origin cannot be resolved safely, omit `emailRedirectTo` rather than copying the request host
- [x] [SEC] Dedicated recovery callback; Path A must not consume recovery tokens: primary exchange is `GET /auth/callback/recovery`; recovery `emailRedirectTo` is not `/auth/callback`; Path A does not call `verifyOtp` / `exchangeCodeForSession` for `type=recovery`; if `type=recovery` still hits Path A, 302 to `/auth/callback/recovery` with the same query without consuming the token; never 302 `/login?confirmed=1` for recovery
- [x] [SEC] `token_hash`, `code`, access_token, and refresh_token never appear in the 302 `Location`, HTML, JSON, or client JS; they are never logged; recovery callback 302 sends `Referrer-Policy: no-referrer`; invalid, expired, missing, or already-used tokens share one generic recovery-failure (retry to `/reset-password`); expire any `sb-*` cookies on exchange failure
- [x] [SEC] Recovery session is set-password only: cookie flags match login (`HttpOnly`, `Secure` in production, `SameSite=Lax`, `Path=/`, host-only); minted with the user-scoped client — not the service-role client; this flow never 302s to `/dashboard`, `/pending`, or other product routes; after successful set-password: `signOut({ scope: "global" })` then clear cookies; land on `/login`
- [x] [SEC] Request-reset and set-password contracts forbid `role`, `active`, `auth_user_id`, and `client_id`; set-password forbids `confirmPassword` / `confirm_password` on the wire; success/error payloads never include tokens, `role`, `active`, `client_id`, or `auth_user_id`
- [x] [SEC] Unconfirmed recovery must not write activation: if Supabase confirms email as a provider side effect, that is provider behavior only — no app-side confirm write and never set `neuramark_clients.active` or `role`; observable reset responses stay identical for unconfirmed vs confirmed

**Depends on:** US-14.1  
**Priority:** P0

---

#### US-14.5 — Session-backed identity and route protection
**As a** System, **I want** unauthenticated users redirected to login and `getCurrentUser()` resolved from the server session, **so that** every existing flow becomes multi-user-safe with zero call-site changes.

| Owner | Work |
|-------|------|
| **FE** | Header shows session user's display name/email (passed from Server Component, per US-X.3); auth pages (login/signup/reset) remain accessible while logged out; neutral "account pending activation" screen (EN/ES) for authenticated-but-inactive users; EN/ES copy for any new states |
| **BE** | Middleware or layout-level guard: unauthenticated requests to app routes redirect to login (auth routes excluded); authenticated-but-inactive users (`neuramark_clients.active = false`) are routed to the pending-activation screen and blocked from all product routes; swap `getCurrentUser()` internals from hardcoded user to session-backed lookup (Supabase session → `neuramark_clients` row, including `active` and `role` on every request); operator-only Server Actions / Route Handlers gate on `role = 'operator'` server-side; optional dev-mode fallback flag (env var) that restores the hardcoded user for local development only |
| **DB** | Seed/backfill: ensure the existing hardcoded local user (`gaveho@gmail.com` / Gabriel Vega) exists as a real `neuramark_clients` row (with `active = true`, `role = 'operator'`) linked to a Supabase auth user, so existing data keeps its owner |

**Acceptance criteria**
- [x] Visiting any protected route without a session redirects to the login page; login, signup, and reset pages remain reachable
- [x] An authenticated user whose `neuramark_clients.active` is false is served only the neutral "account pending activation" screen; every product route and endpoint rejects them — enforced server-side in `getCurrentUser()`/route guards on every request, not only at login
- [x] Flipping `active` to true via SQL grants access on the user's next request or login with no other step (no cached inactive verdict outlives the request) — per-request SELECT; live SQL flip not exercised (validator NOTE)
- [x] After login, `getCurrentUser()` returns the session user (same return shape as before, including stable `id`, plus `role`) and all existing call sites work unchanged
- [x] Operator-only Server Actions / Route Handlers verify `role = 'operator'` server-side and reject non-operator sessions with 403; the role is never taken from the request (header, cookie flag, or body) — `requireOperator()` shipped; no operator product endpoints yet (validator NOTE)
- [x] Like `active`, `role` is read fresh from `neuramark_clients` on every request (no cached role outlives the request), and has no write path in the application — promotion/demotion is operator SQL only — live SQL demotion not exercised (validator NOTE)
- [x] The hardcoded user implementation is removed from the default path; a dev-only env flag can restore it locally and is inert in production builds
- [x] Existing seeded data remains owned by the migrated `gaveho@gmail.com` client row after the switch — seed skip-if-missing if Auth user absent (validator NOTE)
- [x] Session expiry mid-use results in a redirect to login, not a crash or blank page
- [x] [SEC] Route protection is deny-by-default: the middleware/guard protects every route except an explicit public allowlist (login, signup, reset pages, their endpoints, static assets); new routes are protected without opt-in
- [x] [SEC] Middleware is convenience, not the security boundary: every Route Handler and Server Action independently resolves identity via server-side `getCurrentUser()` and returns 401/redirect when unauthenticated; no handler trusts a header, cookie flag, or middleware-injected value from the request to assert identity
- [x] [SEC] `getCurrentUser()` validates the session against Supabase Auth server-side (signature/expiry verification or user lookup), not mere cookie presence; expired or revoked sessions resolve to null
- [x] [SEC] Session lifetime is explicit: refresh handled server-side via the httpOnly cookie (rotating refresh token), idle expiry ≤ 7 days, and the refresh token is never exposed to client JavaScript — includes US-14.4 QA Low #2: cap `@supabase/ssr` cookie `maxAge` (~400 days today)
- [x] [SEC] The dev fallback activates only when `NODE_ENV === 'development'` AND `AUTH_DEV_FALLBACK=true` are both set; in production builds the code path throws at startup if `AUTH_DEV_FALLBACK` is set, and an automated test asserts the fallback is unreachable when `NODE_ENV=production`
- [x] [SEC] The Supabase service-role key (used for the seed/backfill and any admin lookup) stays in server-only modules and env vars; it never appears in `NEXT_PUBLIC_*`, client bundles, or middleware that ships to the edge without need
- [x] [SEC] `active` is read fresh from `neuramark_clients` inside `getCurrentUser()` on every request — never cached across requests (no module-level cache, no `active` claim baked into a cookie/JWT, no client-side persistence); staleness bound is one request, so deactivation (`active = false`) takes effect on the user's very next request even with a live session, and activation likewise requires no re-login
- [x] [SEC] `active` is not writable through any endpoint, Server Action, or request payload — the only write path is operator SQL (documented in the migration); an inactive session hitting any product Route Handler or Server Action directly (bypassing page navigation) receives 403, same enforcement as page routes
- [x] [SEC] No "check my activation status" endpoint exists outside an authenticated session; activation state is only ever conveyed on the pending screen to the authenticated owner of the account
- [x] [SEC] `role` is server-resolved authorization only: it is never present in any request contract, never stored in a cookie or JWT claim, never persisted client-side, and never accepted from a header or middleware-injected value — the ONLY source is the fresh per-request `neuramark_clients` read inside `getCurrentUser()`; demotion (`operator` → `client` via SQL) takes effect on the user's next request even with a live session, same staleness bound as `active`
- [x] [SEC] Every operator-only gate lives inside the Server Action / Route Handler itself as `role === 'operator'` on the `getCurrentUser()` result (a shared `requireOperator()` helper is acceptable); middleware checks and UI hiding are convenience only, and a direct request to an operator endpoint from a client-role session returns 403 with no side effects executed — helper shipped; no operator product endpoint yet (validator NOTE); QA Low #1 page-403 digest deferred until an operator page exists
- [x] [SEC] `role` and `active` compose as AND: an inactive operator (`active = false`) has no access to anything — the `active` gate is evaluated before the role gate, and `role = 'operator'` never bypasses activation, deny-by-default routing, or ownership checks
- [x] [SEC] The application has no code path that writes `neuramark_clients.role` — no endpoint, Server Action, seed-time toggle, or env flag (the dev fallback user's role is fixed in code, not configurable); promotion/demotion is operator SQL only, and back-door sweeps verify no alternate write path exists
- [x] [SEC] `/pending` is not on the public allowlist: unauthenticated requests to `/pending` redirect to `/login` (same treatment as other protected pages — not a distinct oracle). Authenticated inactive (or valid session with missing `neuramark_clients` row) see pending. Authenticated `active === true` is redirected to `/dashboard`. No anonymous activation-status endpoint
- [x] [SEC] Leftover recovery cookies are a real Auth session on product paths, subject to the same `active` gate — do not isolate via a second cookie, marker, or AMR check. `/reset-password` and `/reset-password/new` remain public so US-14.4 cannot 302 to product; middleware must not redirect those allowlisted paths to dashboard/pending when `sb-*` cookies are present. Do not change Path A or recovery landings
- [x] [SEC] Seed never writes `auth.users`: lookup by email `gaveho@gmail.com`; if missing, NOTICE and skip (no privileged row without `auth_user_id`); if present, upsert `neuramark_clients` or fail the migration on upsert error. After seed, no application `UPDATE` of `active` or `role`
- [x] [SEC] `getCurrentUser()` must not invent a user: expired/revoked/missing session → null. Missing `neuramark_clients` row → do not fabricate `id` / `role`; treat as not-active (pending / 403); no repair `INSERT`/`UPDATE` from the seam. `CurrentUser.id` is always `neuramark_clients.id` when a user object is returned
- [x] [SEC] `requireActive()` is the spend/product gate and is shipped in this story even though no LLM/video/TTS/storage endpoints exist yet. Future spend handlers cannot skip it. Direct inactive calls return **403** with no side effects. `requireOperator()` calls `requireActive()` first
- [x] [SEC] Production throw is presence-based: if `NODE_ENV === "production"` and `AUTH_DEV_FALLBACK` is any non-empty string, throw at module evaluation — do not honor `"false"` / `"0"` as a disable switch. Automated test covers `NODE_ENV=production`
- [x] [SEC] Cookie clamp is in `applySessionCookieFlags`: every `sb-*` write (login, recovery, refresh) inherits idle ≤ 7 days. Access/refresh tokens never appear in client JS or response bodies
- [x] [SEC] Pending identity is server-only: `/pending` Server Component loads identity from the session seam; pass at most email + display name into the view. Remove `components/auth/pending-identity.ts` as product identity; do not echo `?email=` (US-14.2 QA Low #1)
- [x] [SEC] Authenticated product and pending responses send `Cache-Control: no-store` so the back button / shared-device cache cannot show authenticated HTML after expiry (US-14.3 still owns logout UI; this story owns cache on newly gated surfaces)
- [x] [SEC] Unauthenticated redirects to login use a same-origin relative `next`: reuse `isSafeRelativePath` / `sanitizeLoginNext`; never copy `Host` / `X-Forwarded-Host` into an absolute redirect. Unsafe `next` falls back to `/dashboard` as the sanitizer already does (inactive login still ignores `next` per US-14.2)
- [x] [SEC] RLS stays enabled with zero policies on `neuramark_clients` / `neuramark_auth_attempts`. Do not add authenticated ownership policies that assume a browser Supabase SDK. Privileged reads use the Node service-role client
- [x] [SEC] Header identity stays a Server Component: `AppHeader` keeps calling `getCurrentUser()` on the server. No `document.cookie`, no client Supabase SDK, no header/query user

**Depends on:** US-14.2, US-X.3  
**Priority:** P0

---

## Phase 1 — Base del cliente

### Module: Interview Builder (P0)

#### US-1.1 — Start guided business interview
**As a** Client, **I want** a step-by-step interview about my business, **so that** I can onboard without writing marketing copy myself.

| Owner | Work |
|-------|------|
| **FE** | Multi-step interview UI (services, zone, tone, offers, objections, style, restrictions); progress indicator; validation per step; empty/error states; EN/ES copy |
| **BE** | `GET/POST` interview session endpoints or Server Actions; schema validation; persist draft answers |
| **DB** | `interview_sessions` (client_id, status, current_step, answers JSON, created_at, updated_at) |

**Acceptance criteria**
- [x] Client can complete all interview sections in one sitting or save and resume (US-1.2) — 1.1 persists drafts so the wizard can finish in one sitting and survive refresh; dedicated dashboard resume is US-1.2 (out of scope here; validator did not fail this)
- [x] Answers are stored as structured JSON, not free-form blobs only
- [x] Invalid or incomplete required fields block advance with clear messages
- [x] Copy exists in English and Spanish
- [x] [SEC] All interview answers are re-validated server-side against a typed schema (Zod); client-side validation is presentation only
- [x] [SEC] Interview sessions are created and loaded only for the client resolved via server-side `getCurrentUser()`; no `client_id` accepted from the request body or query string
- [x] [SEC] Total `answers` JSON payload rejected above a configured size limit (e.g. 64 KB) with a 413/400, preventing storage abuse
- [x] [SEC] Free-text answers are stored as data and always rendered escaped; they are never interpolated into HTML, SQL, or shell commands

**Depends on:** none  
**Output:** structured interview answers

---

#### US-1.2 — Save and resume interview
**As a** Client, **I want** to pause the interview and continue later, **so that** I am not forced to finish in one session.

| Owner | Work |
|-------|------|
| **FE** | "Save & continue later" action; resume entry on dashboard; show last completed step |
| **BE** | Upsert draft; load draft by client; mark `completed` when submitted |
| **DB** | `interview_sessions.status` enum: `draft` \| `completed` |

**Acceptance criteria**
- [x] Returning client sees incomplete interview prompt on dashboard
- [x] Draft survives page refresh and new browser session
- [x] Completed interviews are read-only unless operator reopens
- [x] [SEC] Read-only enforcement for `completed` sessions happens server-side: mutation endpoints/Server Actions reject writes to completed sessions regardless of what the UI allows
- [x] [SEC] Resume loads the draft by the server-resolved current user only; a session ID supplied by the client is validated to belong to that user (IDOR guard for future multi-tenancy)

**Depends on:** US-1.1

---

#### US-1.3 — Submit interview for profile generation
**As a** System, **I want** a completed interview to trigger business profile creation, **so that** downstream agents have canonical context.

| Owner | Work |
|-------|------|
| **FE** | Success confirmation screen; redirect to Business Profile review (**minimal stub/success route OK** until US-2.1 ships the full Ficha viva page — full profile UI is out of scope here) |
| **BE** | On submit: validate completeness → create/update Ficha viva → mark session `completed`; link session → profile |
| **DB** | `neuramark_business_profiles` (+ FK `source_interview_id`, unique for idempotency) |

**Acceptance criteria**
- [x] Submitting a complete interview creates exactly one business profile (or updates draft profile)
- [x] Incomplete submit returns 400 with field-level errors
- [x] Event is idempotent on double-submit
- [x] [SEC] Completeness is verified server-side at submit time; a client cannot mark a session `completed` by flipping a status field in the request
- [x] [SEC] Idempotency is enforced with a DB-level constraint (e.g. unique `business_profiles.source_interview_id`), not only application logic

**Depends on:** US-1.1, US-1.2  
**Note:** Profile review UI after submit may be a **stub/success route** until US-2.1 delivers the full Ficha viva page. US-1.3 owns creating/updating `neuramark_business_profiles`; US-2.1 owns reading and rendering them.

---

### Module: Business Profile (P0)

#### US-2.1 — View canonical business profile
**As a** Client, **I want** to see a living summary of my business, **so that** I can confirm the system understood me correctly.

| Owner | Work |
|-------|------|
| **FE** | Profile page: services, zone, tone, offers, objections, brand notes, restrictions; read-only default |
| **BE** | `GET` profile by client; map interview answers → normalized profile shape |
| **DB** | `business_profiles` (client_id, fields JSON, version, updated_at) |

**Acceptance criteria**
- [x] Profile renders all core fields from interview
- [x] Profile loads on dashboard as default post-onboarding view
- [x] Missing profile shows onboarding CTA, not empty crash
- [x] [SEC] Profile is fetched by the server-resolved current user; the endpoint does not accept an arbitrary `client_id` parameter from the browser

**Depends on:** US-1.3 (creates/updates `neuramark_business_profiles`)

---

#### US-2.2 — Edit business profile
**As a** Client, **I want** to update my business profile, **so that** agents use current information without redoing the full interview.

| Owner | Work |
|-------|------|
| **FE** | Inline or form edit for allowed fields; save/cancel; optimistic or explicit success toast |
| **BE** | `PATCH` profile; validation; version bump; audit `updated_at` |
| **DB** | Optional `profile_versions` for history (P1 nice-to-have) |

**Acceptance criteria**
- [x] Edits persist and appear on next agent run
- [x] Restricted fields (e.g. legal consents) require explicit re-confirmation
- [x] Concurrent edits last-write-wins with timestamp visible
- [x] [SEC] PATCH accepts an explicit allowlist of editable fields; consent flags, `visual_mode` rules, and system fields cannot be modified through this endpoint even if present in the payload
- [x] [SEC] Every edit records who changed it (server-resolved user) and bumps `version`, so agent runs can be traced to the profile version they consumed

**Depends on:** US-2.1

---

#### US-2.3 — Expose profile to agents (API contract)
**As a** System, **I want** a stable profile contract for all agents, **so that** strategy, script, and QA agents do not re-parse raw interview data.

| Owner | Work |
|-------|------|
| **FE** | — |
| **BE** | `getBusinessProfileForAgents(clientId)` server helper; typed schema (Zod or equivalent); include visual mode summary when set |
| **DB** | — |

**Acceptance criteria**
- [x] Single server function used by Content Strategy, Video Script, Caption, QA agents
- [x] Contract documented in code types
- [x] Returns 404-safe empty state for pre-onboarding clients
- [x] [SEC] `getBusinessProfileForAgents` is a server-only module (never imported into client bundles) and is the only path agents use to read profile data
- [x] [SEC] Contract output excludes fields agents do not need (no consent record internals, no raw interview blobs) — minimal response shape by design

**Depends on:** US-2.1

---

### Module: Avatar / Visual Mode Selector (P0)

#### US-3.1 — Choose visual production mode
**As a** Client, **I want** to pick how my Reels will look (own avatar, generic avatar, or faceless), **so that** content matches my comfort and brand rules.

| Owner | Work |
|-------|------|
| **FE** | Mode selector with explanations and examples; disable unavailable modes; EN/ES |
| **BE** | Persist `visual_mode`: `own_avatar` \| `generic_avatar` \| `faceless`; attach mode rules |
| **DB** | `visual_preferences` (client_id, mode, generic_avatar_id, faceless_style, updated_at) |

**Acceptance criteria**
- [x] Three modes selectable with clear product copy per roadmap rules
- [x] Mode stored on profile and shown in settings
- [x] Changing mode does not silently regenerate in-flight content
- [x] No mode ever requires the client to record video or audio; own-avatar uses uploaded reference assets only (roadmap hard rule: no human recording)
- [x] Faceless mode captures a style preference (voice + text + stock/B-roll) stored in `faceless_style`
- [x] [SEC] `visual_mode` value is validated server-side against the enum; selecting `own_avatar` is rejected server-side when no active consent exists, independent of UI disabling (defense in depth with US-3.2)

**Depends on:** US-2.1

---

#### US-3.2 — Capture consent for own avatar
**As a** Client, **I want** to explicitly authorize use of my likeness, **so that** own-avatar mode is legally and ethically enabled.

| Owner | Work |
|-------|------|
| **FE** | Consent checkbox + disclosure text; block own-avatar until signed; timestamp display |
| **BE** | Store consent record (who, when, text version); reject video jobs without consent |
| **DB** | `avatar_consents` (client_id, consented_at, consent_version, revoked_at) |

**Acceptance criteria**
- [x] Own avatar cannot be selected without consent
- [x] Consent version string stored for audit
- [x] Revoking consent blocks new own-avatar generations
- [x] [SEC] Consent records are append-only: revocation sets `revoked_at` on the existing row; consent rows are never updated in place or deleted, preserving a full audit trail
- [x] [SEC] The exact disclosure text version shown at consent time (`consent_version`) is stored with the record; changing the disclosure text requires re-consent under a new version
- [x] [SEC] Consent status is re-checked server-side at video-job creation time (not only at mode selection), so a revocation between selection and generation still blocks the job
- [x] [SEC] Consent can only be granted via an explicit affirmative action recorded with server timestamp; no endpoint or Server Action can set consent as a side effect of another operation
- [x] [SEC] Revocation takes effect immediately for new jobs and cancels queued (not yet submitted) own-avatar jobs; in-flight provider jobs are flagged for operator review

**Security note:** likeness consent is the legal backbone of own-avatar mode — treat `avatar_consents` as an immutable ledger, and make US-8.x/US-10.x enforcement read from it live, never from a cached flag.

**Depends on:** US-3.1

---

#### US-3.3 — Upload avatar reference assets (own avatar)
**As a** Client, **I want** to upload photos or clips for my avatar, **so that** generated videos resemble me when authorized.

| Owner | Work |
|-------|------|
| **FE** | File upload UI; format/size hints; preview; upload progress |
| **BE** | Store files (local/S3 later); link to `visual_preferences`; virus/size validation |
| **DB** | `media_assets` (client_id, type, path, metadata JSON) |

**Acceptance criteria**
- [x] At least one reference asset required before own-avatar production — `hasOwnAvatarReferenceAssets` helper + unit tests; live job gate wiring US-8.x (validator NOTE)
- [x] Assets listed and deletable before first generation
- [x] Failed upload shows recoverable error
- [x] [SEC] Upload endpoint rejects files over a configured size limit and any MIME type outside an image/video allowlist; type is verified from file content (magic bytes), not the client-supplied Content-Type or extension
- [x] [SEC] Stored filenames are server-generated (e.g. UUID + safe extension); the original client filename is stored as metadata only and never used to build the storage path (path traversal guard)
- [x] [SEC] Files are stored outside the web root / `public` directory and served through a route that checks the asset belongs to the current user; `media_assets.path` values are relative keys, not absolute filesystem paths
- [x] [SEC] Uploads are only accepted when an active (non-revoked) avatar consent exists for the client
- [x] [SEC] Delete removes both the DB row and the stored file, and is only allowed for assets owned by the server-resolved current user
- [x] [SEC] Storage layer is behind a small server-side interface (local disk now, S3 later) so credentials and paths never appear client-side

**Security note:** likeness reference media is the most sensitive data in the system; design storage keys and the serving route so migrating to S3 with signed URLs is a swap, not a rewrite.

**Depends on:** US-3.2

---

#### US-3.4 — Enforce generic avatar representation rules
**As a** System, **I want** generic avatars to never impersonate the business owner, **so that** we avoid misleading local customers.

| Owner | Work |
|-------|------|
| **FE** | Warning copy on generic mode; disclosure preview on approval screen |
| **BE** | Rule flags on profile: `must_disclose_not_owner`; pass to Script + QA agents |
| **DB** | `visual_preferences.rules JSON` |

**Acceptance criteria**
- [x] Generic mode sets `must_disclose_not_owner = true`
- [x] QA agent fails scripts that claim generic avatar is the owner
- [x] Approval UI shows required disclosure when applicable
- [x] [SEC] `must_disclose_not_owner` is set server-side as a consequence of mode selection and is not client-writable through any endpoint
- [x] [SEC] The impersonation check in QA (US-10.1) is classified as a non-overridable legal block, same class as missing consent (US-10.2)

**Depends on:** US-3.1

---

## Phase 2 — Playbook + Tendencias (PLAN Fase 2)

> **PLAN/TASKS alignment:** This section is **PLAN Fase 2** (`TASKS.md` § Fase 2 — Playbook + Tendencias). It must complete before Content Strategy (US-4.1) consumes playbook slugs and weekly trend snapshots. The **Estrategia y guiones** agents below remain the next backlog slice after Playbook + Trend land.

### Module: Content Playbook (P0)

#### US-16.1 — Curate evergreen Reel format catalog (Playbook)
**As an** Operator, **I want** to create and maintain a versioned catalog of **Formatos de Reel**, **so that** Strategy, Script, and Assembly agents use consistent structure and hints instead of ad-hoc prompts.

| Owner | Work |
|-------|------|
| **FE** | Operator-only Playbook UI: list/create/edit/archive formatos; form fields map to schema (slug, titulo, explicacion, estructura beats, hook_type, duracion_ideal_seg, modalidades_recomendadas, rubros, guion_hints, editing_hints, cta_tipo, ejemplo_referencia); loading/empty/error states; EN/ES copy |
| **BE** | Operator-gated Server Actions / Route Handlers for CRUD; Zod schema for **Formato de Reel**; server helper `getPlaybookForAgents()` (server-only, typed, minimal agent DTO); slug uniqueness; optimistic versioning on update |
| **DB** | `content_playbooks` → `neuramark_content_playbooks` (slug UNIQUE, version, payload JSON schema-validated, `active`, `created_at`, `updated_at`, optional `archived_at`); seed migration for initial formatos |

**Acceptance criteria**
- [x] Operator can list, create, edit, and archive formatos; archived formatos are not offered to agents but history remains queryable
- [x] Each formato stores SPEC fields: `slug`, `titulo`, `explicacion`, `estructura` (ordered beats), `hook_type`, `duracion_ideal_seg`, `modalidades_recomendadas`, `rubros` (empty = all rubros), `guion_hints`, optional `editing_hints`, `cta_tipo`, optional Operator-only `ejemplo_referencia`
- [x] Seed includes at minimum: tip rápido, antes/después, objeción, oferta local, mito vs realidad (stable slugs frozen in migration)
- [x] `getPlaybookForAgents()` returns active formatos only, schema-validated, server-only; excludes Operator-only reference fields from agent DTO
- [x] Slug is immutable after create; duplicate slug rejected server-side
- [x] Copy exists in English and Spanish
- [x] Operator-only: all Playbook mutations and list/detail endpoints reject non-operator sessions server-side (403)
- [x] [SEC] Playbook payload re-validated server-side on every write (Zod); client-side validation is presentation only
- [x] [SEC] `getPlaybookForAgents()` is server-only (never imported into Client Components) and is the only path agents use to read playbook data
- [x] [SEC] `ejemplo_referencia` and other Operator-only fields never appear in client-session responses or agent DTOs
- [x] [SEC] No LLM calls, video jobs, or client-scoped mutations in this story — catalog CRUD + read contract only

**Depends on:** Fase 1 complete (US-1.3, US-2.3, US-3.4, US-14.5 — operator gate + profile context exist; no Strategy/Script jobs yet)  
**Priority:** P0

---

### Module: Trend Intelligence — manual V1 (P0)

#### US-16.2 — Publish weekly trend snapshot (manual)
**As an** Operator, **I want** to publish and edit a weekly **Snapshot de tendencias**, **so that** Strategy and Script agents can attach prioritized **Tácticas de tendencia** per Reel slot when relevant.

| Owner | Work |
|-------|------|
| **FE** | Operator-only Trend UI: pick `week_start` (ISO week); list/add/edit/deactivate entries; form for **Táctica de tendencia** fields; show `prioridad_semana` (1–5); loading/empty/error states; EN/ES copy |
| **BE** | Operator-gated Server Actions for publish/update snapshot; Zod schema for snapshot + entries; `getTrendSnapshotForWeek(weekStart)` server helper (server-only); enforce one active snapshot per `week_start`; validate `formatos_playbook_compatibles[]` slugs against active Playbook |
| **DB** | `trend_snapshots` → `neuramark_trend_snapshots` (`week_start` UNIQUE, `entries` JSON array, `published_at`, `updated_at`); seed migration for canonical `cold-open-mejor-toma` entry |

**Acceptance criteria**
- [ ] Operator can publish or update the snapshot for a given `week_start`; at most one active snapshot row per week
- [ ] Each **Táctica de tendencia** entry stores SPEC fields: `slug`, `titulo`, `week_start`, `activo`, `prioridad_semana` (1–5), `fuente` (`manual` \| `scraping` \| `operator_review` — V1 writes `manual` only), `explicacion`, optional `evitar`, optional Operator-only `ejemplo_referencia`, `hook_type`, `estructura[]`, `guion_hints[]`, `editing_hints[]`, `duracion_ideal_seg` (e.g. `{ cold_open: 2, total: 25 }`), `modalidades_recomendadas`, `rubros[]`, `formatos_playbook_compatibles[]`
- [ ] Seed includes canonical V1 example `cold-open-mejor-toma` with cold-open + rewind editing hints
- [ ] `getTrendSnapshotForWeek(weekStart)` returns the snapshot for that week or a safe empty state; server-only; entries filtered to `activo = true` for agent consumption
- [ ] `formatos_playbook_compatibles` slugs validated against active Playbook rows (reject unknown slugs on write)
- [ ] Copy exists in English and Spanish
- [ ] Operator-only: all Trend mutations and reads for Operator UI reject non-operator sessions server-side (403)
- [ ] [SEC] Snapshot and entry payloads re-validated server-side on every write (Zod); `prioridad_semana` bounded 1–5
- [ ] [SEC] `getTrendSnapshotForWeek()` is server-only and is the only path agents use to read trend data; no scraping agent or auto-activation in V1
- [ ] [SEC] Operator-only reference fields (`ejemplo_referencia`) never appear in client-session responses or agent DTOs
- [ ] [SEC] Trend data is treated as untrusted input when later injected into LLM prompts (storage story only — prompt containment verified in US-4.1+)

**Depends on:** US-16.1, Fase 1 complete (US-14.5 operator gate)  
**Priority:** P0

---

## Phase 2 — Estrategia y guiones

### Module: Content Strategy Agent (P0)

#### US-4.1 — Generate weekly Instagram content strategy
**As a** Operator, **I want** the system to propose weekly pillars, themes, and sequence, **so that** we deliver 3 Reels with coherent messaging.

| Owner | Work |
|-------|------|
| **FE** | "Generate strategy" action; loading state; strategy brief view (pillars, themes, daily slots) |
| **BE** | Agent job: input profile + visual mode → output weekly brief; store result |
| **DB** | `content_strategies` (client_id, week_start, brief JSON, status) |

**Acceptance criteria**
- [ ] Brief includes at least 3 Reel slots aligned to trust, education, local sale, and inbound-message (DM) goals
- [ ] Uses `getBusinessProfileForAgents` only, not raw interview
- [ ] Regenerate creates new version without deleting approved history
- [ ] Strategy targets Instagram Reels only in V1 — no multichannel output (roadmap hard rule: Instagram first)
- [ ] Operator-only: endpoint/action rejects non-operator sessions server-side (403)
- [ ] [SEC] Agent job runs server-side only; LLM provider keys are read from server env and never reach the client or the DB
- [ ] LLM calls use the catalog row for asset role `llm` at the resolved `provider_tier` (low default: DeepSeek V4 Flash / Qwen via SiliconFlow per US-X.4)
- [ ] [SEC] Client-authored profile text is passed to the LLM as clearly delimited data, and agent output is validated against a typed brief schema before storage (prompt-injection containment: malformed or out-of-schema output is rejected, not stored)
- [ ] [SEC] "Generate strategy" is rate-limited/debounced server-side per client to prevent runaway LLM spend from repeated clicks or scripted calls

**Depends on:** US-2.3, US-3.1, US-16.1, US-16.2, US-X.4

---

#### US-4.2 — Review and adjust strategy before scripting
**As a** Operator, **I want** to edit the weekly brief, **so that** human judgment can correct AI planning.

| Owner | Work |
|-------|------|
| **FE** | Editable fields for themes, angles, CTAs; approve strategy CTA |
| **BE** | `PATCH` strategy; status `draft` → `approved`; lock after scripts generated (configurable) |
| **DB** | `content_strategies.status` |

**Acceptance criteria**
- [ ] Edits saved and used as input to Video Script Agent
- [ ] Approved strategy required before batch script generation
- [ ] Shows who approved and when (hardcoded user OK in local dev)
- [ ] Operator-only: endpoint/action rejects non-operator sessions server-side (403)
- [ ] [SEC] Status transitions (`draft` → `approved`) are enforced server-side as a state machine; the client cannot set an arbitrary status value, and script generation endpoints verify `approved` status themselves rather than trusting the caller

**Depends on:** US-4.1

---

### Module: Video Script Agent (P0)

#### US-5.1 — Generate Reel script package per slot
**As a** System, **I want** each planned Reel to get hook, script, voiceover text, on-screen text, and CTA, **so that** video production has complete instructions.

| Owner | Work |
|-------|------|
| **FE** | Script list per week; expand row for hook/body/CTA/on-screen/VO; copy-to-clipboard |
| **BE** | Agent: strategy + profile + visual mode → `reel_scripts` records; respect duration target (e.g. 15–45s) |
| **DB** | `reel_scripts` (strategy_id, slot_index, hook, body, cta, on_screen_text, voiceover_text, target_duration_sec) |

**Acceptance criteria**
- [ ] One script package per Reel slot in approved strategy
- [ ] Scripts adapt tone to profile and constraints (no false owner claims in generic mode)
- [ ] Regenerate single slot without regenerating entire week
- [ ] [SEC] Script generation verifies server-side that the referenced strategy is `approved` and belongs to the current client before invoking the agent
- [ ] LLM calls use the catalog row for asset role `llm` at the resolved `provider_tier` (US-X.4)
- [ ] [SEC] Agent output is schema-validated (hook/body/CTA/on-screen/VO fields, duration bounds) before persistence; rule flags like `must_disclose_not_owner` are injected from the server-side profile, never from request input

**Depends on:** US-4.2, US-3.4, US-X.4

---

#### US-5.2 — Preview script readability for vertical video
**As a** Operator, **I want** on-screen text length validated, **so that** subtitles fit 9:16 Reels.

| Owner | Work |
|-------|------|
| **FE** | Character/line warnings on on-screen text fields |
| **BE** | Validation rules on save; optional agent self-check pass |
| **DB** | — |

**Acceptance criteria**
- [ ] Warn when on-screen text exceeds configured max chars per beat
- [ ] Voiceover word count estimate shown vs target duration

**Depends on:** US-5.1

---

### Module: Caption Agent (P0)

#### US-6.1 — Generate Instagram caption per Reel
**As a** System, **I want** captions, hashtags, and local keywords for each script, **so that** posts are ready for review alongside video.

| Owner | Work |
|-------|------|
| **FE** | Caption tab per Reel; hashtag chips; character count |
| **BE** | Agent: strategy + script + profile → caption record; Instagram length limits |
| **DB** | `reel_captions` (reel_script_id, caption, hashtags JSON, keywords JSON, cta_variants JSON) |

**Acceptance criteria**
- [ ] Caption generated for each script in approved strategy
- [ ] Includes local/geo keywords when profile has zone
- [ ] Hashtag count within configured max
- [ ] LLM calls use the catalog row for asset role `llm` at the resolved `provider_tier` (US-X.4)
- [ ] [SEC] Caption/hashtag/keyword output is schema-validated and length-bounded before storage; captions are rendered as plain text everywhere (never as HTML)

**Depends on:** US-5.1, US-4.2, US-X.4

---

#### US-6.2 — CTA variants for caption testing
**As a** Operator, **I want** multiple CTA variants, **so that** the client can pick the best conversion line.

| Owner | Work |
|-------|------|
| **FE** | Radio/select among CTA variants; preview in context |
| **BE** | Store variants; persist `selected_cta_index` on approval |
| **DB** | `reel_captions.selected_cta_index` |

**Acceptance criteria**
- [ ] At least 2 CTA variants per Reel
- [ ] Selected CTA flows to Approval Flow and final export
- [ ] [SEC] `selected_cta_index` is validated server-side to be within the stored variants array bounds; free-text CTA substitution via this field is not possible

**Depends on:** US-6.1

---

## Phase 3 — Costo y proveedores

### Module: Cost Policy Engine (P0)

#### US-7.1 — Configure max budget per Reel
**As a** Operator, **I want** a maximum cost per Reel before generation, **so that** margin is protected.

| Owner | Work |
|-------|------|
| **FE** | Settings: max cost per Reel, default provider tier; display estimates |
| **BE** | `cost_policies` resolver: duration, visual mode, b-roll flag → provider + estimate |
| **DB** | `cost_policies` (client_id or global, max_cost_cents, provider_tier `low` \| `high`, rules JSON) |

**Acceptance criteria**
- [ ] Global default `provider_tier` is `low`; per-client override optional
- [ ] Seeded default `max_cost_cents` is **150** ($1.50/Reel) — sized for low-tier stack + 2–3 retries (see Provider tiers in Conventions)
- [ ] Generation blocked if estimate exceeds max without override
- [ ] Policy considers avatar required vs faceless
- [ ] Estimate shown before user confirms generation
- [ ] Budget check counts cumulative cost of all attempts for the same Reel (retries + B-roll + TTS), not just the current attempt (controls failed-regeneration margin risk)
- [ ] Operator-only: endpoint/action rejects non-operator sessions server-side (403) — applies to budget/policy settings writes
- [ ] [SEC] The budget check runs server-side inside the job-creation path; a direct call to the generation endpoint with a crafted payload cannot skip it (the client never sends the estimate or the policy — both are resolved server-side)
- [ ] [SEC] `max_cost_cents` and policy rules are editable only by the Operator role (hardcoded user OK locally), through a dedicated settings endpoint with validated bounds (positive integers, sane ceiling)
- [ ] [SEC] Every budget-exceeded block and every override is recorded (who, when, estimate vs cap) so margin decisions are auditable

**Depends on:** US-3.1, US-5.1, US-X.4

---

#### US-7.2 — Select provider by economics and quality floor
**As a** System, **I want** automatic provider recommendation per piece, **so that** we default to cheapest acceptable option.

| Owner | Work |
|-------|------|
| **FE** | Show recommended provider + tier + rationale (read-only in V1) |
| **BE** | Policy engine: `provider_tier` + visual mode + asset role (`talking_head` \| `broll` \| `tts` \| `llm`) → `provider_key` + `estimated_cost_cents`; ranks only **active** catalog rows matching tier |
| **DB** | `provider_catalog` (key, asset_role, tier `low` \| `high`, capabilities JSON, cost_model JSON, active) |

**Acceptance criteria**
- [ ] With `provider_tier = low` (default): talking-head routes to SadTalker (US-8.2); generic-avatar may route to MuseTalk (US-8.6) when a reference loop exists; faceless B-roll routes to Wan (US-8.5)
- [ ] With `provider_tier = high`: talking-head may route to HeyGen (US-8.7); B-roll may route to LTX/Kling when those catalog rows are active
- [ ] Manual upload always available as zero-cost fallback
- [ ] Decision logged per job (tier, asset role, provider_key, estimate) for later cost analysis
- [ ] Cheapest **active** provider in the resolved tier is the default — high-tier providers are never chosen while tier is `low` (roadmap rule: cheap API first)
- [ ] Provider catalog is data-driven and seeded by US-X.4: providers can be activated/deactivated without redesign
- [ ] [SEC] `provider_key` for a job is chosen by the server-side policy engine; a client-supplied provider key is never accepted at job creation (prevents forcing an expensive provider or an inactive/unknown adapter)
- [ ] [SEC] `provider_catalog.cost_model` and `capabilities` are trusted config maintained server-side only; no endpoint exposes writes to the catalog in V1

**Depends on:** US-7.1, US-X.4

---

#### US-7.3 — Track actual cost per generation job
**As a** Operator, **I want** real API cost recorded per Reel, **so that** we learn true unit economics.

| Owner | Work |
|-------|------|
| **FE** | Cost column on production list; estimated vs actual |
| **BE** | On job complete: persist `actual_cost_cents`, provider, duration |
| **DB** | `video_jobs.estimated_cost_cents`, `actual_cost_cents` |

**Acceptance criteria**
- [ ] Every completed job has actual or `null` with failure reason
- [ ] Dashboard aggregate cost per client per week (simple sum)
- [ ] Operator-only: endpoint/action rejects non-operator sessions server-side (403) — cost data is margin-sensitive and never served to client sessions
- [ ] [SEC] `actual_cost_cents` is written only by the server-side job-completion handler from provider responses; no client-facing endpoint can set or edit recorded costs

**Depends on:** US-7.2, US-8.4

---

#### US-7.4 — Report real total cost per Reel
**As a** Operator, **I want** the full actual cost of each Reel (video jobs, retries, B-roll, TTS) rolled up in one place, **so that** we know true unit economics per piece, not just per API call.

| Owner | Work |
|-------|------|
| **FE** | "Cost" section on Reel detail: estimated vs actual total, breakdown by component (video, B-roll, voiceover); over-budget highlight; EN/ES labels |
| **BE** | Aggregation: sum `actual_cost_cents` across all jobs linked to a `reel_script_id` (all attempts and asset roles); expose to Reel detail and weekly dashboard sum |
| **DB** | No new tables; query over `video_jobs` + TTS asset costs (add `media_assets.cost_cents` for voiceover if missing) |

**Acceptance criteria**
- [ ] Every Reel shows one total actual cost including failed attempts and all asset roles (talking_head, broll, tts, llm where tracked)
- [ ] Estimated vs actual variance visible per Reel
- [ ] Weekly per-client cost sum (US-7.3) reconciles with the sum of per-Reel totals
- [ ] Operator-only: endpoint/action rejects non-operator sessions server-side (403) — cost data is margin-sensitive and never served to client sessions
- [ ] [SEC] Cost roll-up queries are parameterized and scoped to the requested client's Reels; cost data for other clients is never included in a response (multi-tenancy readiness)
- [ ] [SEC] Cost exclusion is enforced at the response-shape level, not by UI hiding: shared payloads that client sessions can receive (Reel detail, dashboard, approval package) contain NO cost fields (`estimated_cost_cents`, `actual_cost_cents`, provider pricing, budget caps); cost fields appear only in operator-gated endpoints/serializers, so a client session cannot obtain cost data from any endpoint in the system

**Depends on:** US-7.3, US-9.3

---

### Module: Video Provider Adapter (P0)

#### US-8.1 — Provider adapter interface
**As a** System, **I want** a single adapter contract for all video providers, **so that** swapping SadTalker for MuseTalk or HeyGen does not rewrite the pipeline.

| Owner | Work |
|-------|------|
| **FE** | — |
| **BE** | Interface in `lib/providers/provider-adapters.ts`: `VideoProviderAdapter` with `estimateCost`, `createJob`, `getJobStatus`, `fetchAsset`; `ProviderRegistry` + `InMemoryProviderRegistry`; Zod mirrors in `lib/contracts/providers.ts` |
| **DB** | — |

**Acceptance criteria**
- [ ] `VideoProviderAdapter` interface exists in `lib/providers/` with the four methods above; types shared via `lib/contracts/providers.ts`
- [ ] New provider = new adapter class + catalog row + env var, no changes to assembly pipeline (US-9.x)
- [ ] All jobs share statuses: `queued`, `processing`, `completed`, `failed`, `cancelled`
- [ ] [SEC] All adapter code is server-only; provider API keys are read exclusively from server environment variables — never stored in the DB, never in `NEXT_PUBLIC_*` vars, never serialized into any response or log
- [ ] [SEC] The adapter interface treats all provider responses as untrusted input: status values, URLs, and error messages are validated/normalized before persistence, and provider error text is sanitized before display
- [ ] [SEC] `external_job_id` is stored opaque and only ever sent back to the same provider's adapter; it is never used to build local file paths or DB queries beyond an exact-match lookup

**Depends on:** US-7.2

---

#### US-8.2 — SadTalker adapter (V1 default talking-head, low tier)
**As a** System, **I want** SadTalker lip-sync via a cloud API, **so that** own-avatar and generic-avatar Reels are produced cheaply without client recording.

| Owner | Work |
|-------|------|
| **FE** | Job status polling UI / SSE (shared with US-8.4) |
| **BE** | SadTalker adapter (e.g. Replicate): portrait asset + TTS audio → poll → store MP4; `provider_key` `sadtalker_low`; env API key |
| **DB** | `video_jobs` (reel_script_id, provider_key, asset_role `primary`, external_job_id, status, output_url, provider_tier) |

**Acceptance criteria**
- [ ] Default talking-head provider when `provider_tier = low` and visual mode is `own_avatar` or `generic_avatar`
- [ ] Inputs: one approved reference image (own avatar) or generic loop still + voiceover audio from US-9.3
- [ ] Successful job returns playable video stored as `media_assets` (not a long-lived third-party URL)
- [ ] Failures capture provider error message; retries configurable with max attempts
- [ ] Estimated cost uses flat per-run model from `provider_catalog` (~$0.10/Reel at research baseline)
- [ ] [SEC] Job creation re-verifies active avatar consent (US-3.2) when mode is `own_avatar`, and budget (US-7.1) server-side immediately before submit
- [ ] [SEC] Job status is updated only by the server-side poller; no client-callable endpoint can set status or `output_url`
- [ ] [SEC] Output video is downloaded server-side; provider URLs are validated (https, expected host) before fetch
- [ ] [SEC] Status polling from the browser is scoped to jobs owned by the current client; foreign job IDs return 404

**Depends on:** US-8.1, US-3.3 (own avatar), US-5.1, US-9.3, US-X.4

---

#### US-8.3 — Manual video upload fallback
**As a** Operator, **I want** to upload a video file when API generation fails or is too expensive, **so that** production continues without blocking the client.

| Owner | Work |
|-------|------|
| **FE** | Upload video on Reel detail; mark as manual provider |
| **BE** | `manual` adapter: accept upload → same job record shape as API providers |
| **DB** | Reuse `video_jobs` + `media_assets` |

**Acceptance criteria**
- [ ] Manual upload bypasses cost policy API charges
- [ ] Downstream assembly treats manual raw video like provider output
- [ ] File type and duration validated
- [ ] Operator-only: endpoint/action rejects non-operator sessions server-side (403)
- [ ] [SEC] Manual upload applies the same file validation stack as US-3.3 (size limit, video MIME allowlist via magic bytes, server-generated storage key, storage outside web root)
- [ ] [SEC] Manual uploads are restricted to the Operator role and recorded with uploader identity, so `manual` provider jobs are attributable
- [ ] [SEC] A manual job still goes through QA (US-10.1) before approval — the manual path bypasses cost, not compliance

**Depends on:** US-8.1

---

#### US-8.4 — Job status and failure handling UI
**As a** Operator, **I want** to see generation progress and retry failed jobs, **so that** I control regenerations and cost.

| Owner | Work |
|-------|------|
| **FE** | Status badges; retry button; failure reason; disable retry when over budget |
| **BE** | Poll/webhook status updates; retry creates new job with lineage; count regenerations |
| **DB** | `video_jobs.parent_job_id`, `attempt` |

**Acceptance criteria**
- [ ] Stale jobs timeout to `failed`
- [ ] Retry requires explicit confirmation showing new estimate
- [ ] Regeneration count visible (margin risk from roadmap)
- [ ] Retries beyond a configurable max per Reel are blocked until an operator explicitly overrides
- [ ] Operator-only: retry and retry-override endpoints/actions reject non-operator sessions server-side (403)
- [ ] [SEC] Retry limit and cumulative-budget check (US-7.1) are enforced in the server-side retry handler; disabling the retry button is UI convenience only
- [ ] [SEC] If a webhook endpoint is used for status updates, it verifies request authenticity (provider signature or shared secret) and matches `external_job_id` + `provider_key` against an existing job before writing; unmatched or unsigned callbacks are rejected and logged
- [ ] [SEC] Retry override is recorded (user, reason, timestamp) in the same audit pattern as QA overrides (US-10.2)

**Depends on:** US-8.2, US-8.3, or US-8.6

---

#### US-8.5 — Wan B-roll adapter (low tier, P0)
**As a** System, **I want** short B-roll clips via Wan API (SiliconFlow), **so that** faceless Reels have cheap supporting visuals without full text-to-video for every piece.

| Owner | Work |
|-------|------|
| **FE** | Optional B-roll preview strip on Reel |
| **BE** | Wan adapter: image/text prompt → short clip; cost per clip from catalog; only when policy selects `broll` + `provider_tier = low` |
| **DB** | `video_jobs.asset_role`: `primary` \| `broll`; `provider_tier` on job |

**Acceptance criteria**
- [ ] Default B-roll provider when `provider_tier = low` and script marks `needs_broll`
- [ ] Clips max duration per policy (e.g. 3–5s); Wan catalog documents 5s cap
- [ ] Estimated cost ~$0.21/clip at research baseline (Wan2.1 I2V Turbo)
- [ ] Failed B-roll does not block talking-head primary (graceful degrade)
- [ ] Multiple B-roll clips may be stitched in assembly (US-9.1)
- [ ] [SEC] Wan adapter follows US-8.1 contract: server-only keys, untrusted-response handling, B-roll cost counted against Reel cumulative budget (US-7.1)

**Depends on:** US-8.1, US-7.2

---

#### US-8.6 — MuseTalk adapter (low-tier talking-head alternative)
**As a** System, **I want** MuseTalk lip-sync via a cloud API, **so that** generic-avatar mode can use a reference video loop when SadTalker is not the best fit.

| Owner | Work |
|-------|------|
| **FE** | — (reuses US-8.4 status UI) |
| **BE** | MuseTalk adapter (e.g. Replicate): reference video loop + TTS audio → poll → store MP4; `provider_key` `musetalk_low` |
| **DB** | Reuse `video_jobs` |

**Acceptance criteria**
- [ ] Selected by policy for `generic_avatar` when a reference loop asset exists, or as operator-configured low-tier alternative to SadTalker
- [ ] Estimated cost uses flat per-run model from catalog (~$0.19/Reel at research baseline)
- [ ] Same consent, budget, download-and-own, and polling security rules as US-8.2
- [ ] [SEC] Generic-avatar impersonation rules (US-3.4) still apply; MuseTalk does not bypass QA disclosure requirements

**Depends on:** US-8.1, US-3.1, US-9.3, US-X.4

---

#### US-8.7 — HeyGen adapter (high tier / operator fallback, P1)
**As a** System, **I want** HeyGen API integration, **so that** operators can produce higher-polish avatar Reels or recover when low-tier adapters fail.

| Owner | Work |
|-------|------|
| **FE** | Operator-only "Generate with HeyGen" action on Reel detail when tier is `high` or fallback is invoked |
| **BE** | HeyGen adapter: submit script + avatar ref → poll → store MP4; `provider_key` `heygen_high`; env API key |
| **DB** | Reuse `video_jobs` |

**Acceptance criteria**
- [ ] Never the silent default when `provider_tier = low`
- [ ] Used when `provider_tier = high`, or when operator explicitly triggers fallback after low-tier failure (override recorded)
- [ ] Estimated cost uses per-minute model from catalog (standard ~$1/min; Avatar IV priced separately and never auto-selected)
- [ ] Same consent, budget, download-and-own, webhook/polling security rules as US-8.2
- [ ] Operator-only for fallback trigger; clients cannot request HeyGen directly

**Depends on:** US-8.1, US-3.3, US-5.1, US-X.4

**Priority:** P1 (MVP operable without this if SadTalker + manual upload suffice)

---

### Module: Media Assembly Pipeline (P0)

#### US-9.1 — Assemble final 9:16 Reel
**As a** System, **I want** to combine voice, avatar/B-roll, template, and timing, **so that** output is Instagram-ready vertical video.

| Owner | Work |
|-------|------|
| **FE** | Assembly progress; final preview player |
| **BE** | Pipeline job: inputs from video job + script + TTS audio → FFmpeg or service → `assembled_reels` |
| **DB** | `assembled_reels` (reel_script_id, preview_url, final_url, status, template_id) |

**Acceptance criteria**
- [ ] Output aspect ratio 9:16
- [ ] Duration within script target ± configurable tolerance
- [ ] Pipeline idempotent per script version
- [ ] [SEC] FFmpeg (or the assembly service) is invoked with argument arrays, never shell string interpolation; all input paths come from validated `media_assets` records owned by the job's client, and text inputs (subtitles, filenames) cannot inject FFmpeg options or shell metacharacters
- [ ] [SEC] Assembly only consumes assets already stored by the system; it never fetches arbitrary URLs supplied at assembly time (SSRF guard)

**Depends on:** US-8.4, US-6.1

---

#### US-9.2 — Add subtitles, logo, and cover
**As a** System, **I want** burned-in or overlay subtitles, client logo, and cover frame, **so that** Reels match brand and perform on Instagram.

| Owner | Work |
|-------|------|
| **FE** | Toggle subtitles on/off preview; logo upload in profile settings |
| **BE** | Subtitle generation from on-screen text + VO; logo placement; cover frame extract at 1s |
| **DB** | `business_profiles.logo_asset_id`; assembly config JSON |

**Acceptance criteria**
- [ ] Subtitles readable on mobile safe zone
- [ ] Logo optional; default template if missing
- [ ] Cover image exported for manual IG upload
- [ ] [SEC] Logo upload uses the shared upload validation stack (US-3.3): size limit, image MIME allowlist via magic bytes, server-generated storage key
- [ ] [SEC] Subtitle text is escaped/sanitized before being passed to the renderer (subtitle files and FFmpeg drawtext are injection surfaces)

**Depends on:** US-9.1, US-2.2

---

#### US-9.3 — Text-to-speech for voiceover
**As a** System, **I want** AI voice from voiceover script, **so that** clients never record audio.

| Owner | Work |
|-------|------|
| **FE** | Voice picker (limited catalog); play audio sample |
| **BE** | TTS provider integration via catalog (`asset_role = tts`); low tier default CosyVoice2 (SiliconFlow); store audio asset; link to assembly job |
| **DB** | `media_assets` type `voiceover`; `visual_preferences.voice_id` |

**Acceptance criteria**
- [ ] Low tier (`provider_tier = low`): CosyVoice2 or equivalent catalog row; high tier may use ElevenLabs when active
- [ ] Voice matches profile tone hint when possible
- [ ] Spanish and English voices supported
- [ ] TTS cost included in job estimate
- [ ] [SEC] `voice_id` is validated server-side against the offered catalog (no arbitrary provider voice IDs from the client — guards against voice-cloning misuse and unexpected billing)
- [ ] [SEC] TTS provider key is server-only, and TTS spend is counted in the Reel's cumulative budget check (US-7.1)

**Depends on:** US-5.1, US-X.4

---

## Phase 4 — Control y aprobación

### Module: QA/Compliance Agent (P0)

#### US-10.1 — Run automated QA on script, caption, and video
**As a** System, **I want** compliance checks before client review, **so that** risky content is flagged early.

| Owner | Work |
|-------|------|
| **FE** | QA report panel: pass/fail per check; severity badges |
| **BE** | Agent/rules: dangerous claims, tone, clarity, AI disclosure, avatar misuse, CTA presence |
| **DB** | `qa_reports` (assembled_reel_id, checks JSON, status, created_at) |

**Acceptance criteria**
- [ ] Checks include generic-avatar-not-owner rule (US-3.4)
- [ ] AI disclosure required when avatar or synthetic voice used
- [ ] LLM QA pass uses catalog row for asset role `llm` at resolved `provider_tier` (US-X.4)
- [ ] Failed critical checks block approval until resolved or overridden by operator
- [ ] [SEC] QA verdicts are computed and stored server-side; no endpoint accepts a client-supplied "passed" flag, and the approval gate (US-11.1) reads QA status from the DB, not from the request
- [ ] [SEC] Checks are classified in the schema as `overridable` vs `blocking` (legal class: missing consent, generic-avatar impersonation); this classification is code/config, not data editable via any endpoint

**Depends on:** US-9.2, US-6.1, US-3.4, US-X.4

---

#### US-10.2 — Operator override with reason
**As a** Operator, **I want** to override a failed QA check with documented reason, **so that** edge cases do not stall delivery.

| Owner | Work |
|-------|------|
| **FE** | Override modal; reason required; audit display |
| **BE** | `qa_overrides` record; only operator role (hardcoded user OK locally) |
| **DB** | `qa_overrides` (qa_report_id, check_key, reason, user_id, created_at) |

**Acceptance criteria**
- [ ] Override requires non-empty reason
- [ ] Overrides visible on approval screen
- [ ] Cannot override consent/legal blocks (own avatar without consent)
- [ ] Operator-only: the override endpoint/action rejects non-operator sessions server-side (403) — makes the existing "only operator role" note explicit via `neuramark_clients.role`
- [ ] [SEC] The non-overridable set (missing/revoked consent, generic-avatar impersonation) is enforced in the override handler server-side: an override request for a `blocking` check is rejected with 403 even from the Operator, regardless of UI state
- [ ] [SEC] `qa_overrides` is append-only (no update/delete endpoint); each row records check key, reason, server-resolved user, and timestamp
- [ ] [SEC] Override applies to one specific check on one specific QA report; there is no "override all" or report-level bypass parameter

**Depends on:** US-10.1

---

### Module: Approval Flow (P0)

#### US-11.1 — Present Reel package for client approval
**As a** Client, **I want** to preview video, caption, and CTA together, **so that** I can approve what will represent my business.

| Owner | Work |
|-------|------|
| **FE** | Approval screen: video player, caption, hashtags, disclosure text, approve/reject/request changes |
| **BE** | `GET` approval package; status `pending_client`; gate on QA pass or override |
| **DB** | `approvals` (assembled_reel_id, status, client_feedback, decided_at) |

**Acceptance criteria**
- [ ] Nothing reaches client without assembly complete + QA resolved
- [ ] Mobile-friendly preview
- [ ] AI disclosure visible when required
- [ ] [SEC] The gate "assembly complete + QA passed or validly overridden" is re-checked server-side when the approval package is created AND when a decision is submitted — a direct POST to the decision endpoint for an ungated Reel is rejected
- [ ] [SEC] Approval package lookups are scoped to the current client; a Reel/approval ID belonging to another client returns 404 (IDOR guard)

**Depends on:** US-10.1, US-9.2

---

#### US-11.2 — Request controlled revision round
**As a** Client, **I want** to request specific changes (not unlimited loops), **so that** I can correct content without scope creep.

| Owner | Work |
|-------|------|
| **FE** | Change request form; show revisions remaining (e.g. 1 round V1) |
| **BE** | Increment `revision_count`; route feedback to script/caption/assembly as tagged fields |
| **DB** | `approvals.revision_count`, `change_requests` JSON |

**Acceptance criteria**
- [ ] V1 max 1 client revision round per Reel (configurable)
- [ ] Exceeded limit requires operator intervention
- [ ] Change request triggers only affected downstream steps
- [ ] [SEC] Revision limit is enforced server-side atomically (increment + check in one transaction); concurrent or replayed change requests cannot exceed the round limit
- [ ] [SEC] Change-request text is validated (length cap) and treated as data through the pipeline — including when injected into agent prompts (same prompt-injection containment as US-4.1)

**Depends on:** US-11.1

---

#### US-11.3 — Approve and mark ready to publish
**As a** Client, **I want** to approve a Reel, **so that** my team knows it can be posted to Instagram.

| Owner | Work |
|-------|------|
| **FE** | Approve button; confirmation; download/export link |
| **BE** | Status → `approved`; timestamp; optional webhook/email stub |
| **DB** | `approvals.status`: `approved` |

**Acceptance criteria**
- [ ] Approved Reels appear in "ready to publish" list
- [ ] Caption + video downloadable for manual IG posting (V1)
- [ ] Rejected Reels do not appear in publish queue
- [ ] [SEC] Approval status transitions follow a server-enforced state machine (`pending_client` → `approved`/`rejected`/`changes_requested`); approving an already-decided or ungated approval is rejected
- [ ] [SEC] Download/export links serve only assets tied to Reels of the current client, through the authenticated asset route (no direct static paths)

**Depends on:** US-11.1

---

## Phase 5 — Operación semanal (P1)

### Module: Content Calendar (P1)

#### US-12.1 — Weekly calendar view
**As a** Operator, **I want** a calendar of planned and approved Reels, **so that** I can hit 3 posts per week.

| Owner | Work |
|-------|------|
| **FE** | Week grid; drag optional P1; color by status (draft/generating/QA/pending/approved/published) |
| **BE** | Aggregate strategies, scripts, jobs, approvals by `scheduled_date` |
| **DB** | `content_calendar_slots` (client_id, date, reel_script_id, publish_status) |

**Acceptance criteria**
- [ ] Shows gaps when fewer than 3 Reels scheduled
- [ ] Click slot opens Reel detail workflow
- [ ] EN/ES day/month labels
- [ ] Operator-only: endpoint/action rejects non-operator sessions server-side (403) — the V1 calendar aggregates production status across clients and is an operator surface
- [ ] [SEC] If a client-facing calendar is added later, it must be a separate endpoint scoped to the server-resolved client's own Reels — never the operator aggregate with rows filtered in the UI, and never a `client_id` parameter on the operator endpoint

**Depends on:** US-11.3, US-4.1

---

#### US-12.2 — Mark manual publication done
**As a** Operator, **I want** to mark a Reel as published on Instagram, **so that** the calendar reflects reality.

| Owner | Work |
|-------|------|
| **FE** | "Mark published" + optional IG post URL |
| **BE** | Update slot status; store `published_at` and URL |
| **DB** | `publish_status`: `ready` \| `published` |

**Acceptance criteria**
- [ ] Only approved Reels can be marked published
- [ ] Published date defaults to today editable
- [ ] Operator-only: endpoint/action rejects non-operator sessions server-side (403)
- [ ] [SEC] "Approved only" is enforced server-side in the mark-published handler (roadmap hard rule: no publish without approval); the optional IG post URL is validated as an `https://www.instagram.com/...` URL and stored as text, never rendered as a raw link without validation

**Depends on:** US-12.1

---

### Module: Metrics Lite (P1)

#### US-13.1 — Record basic post metrics manually
**As a** Operator, **I want** to enter views, likes, comments, saves, and DMs, **so that** we learn what works without a full analytics stack.

| Owner | Work |
|-------|------|
| **FE** | Metrics form on published Reel; simple number inputs |
| **BE** | `POST` metrics; validate non-negative integers |
| **DB** | `reel_metrics` (assembled_reel_id, views, likes, comments, saves, dms, recorded_at) |

**Acceptance criteria**
- [ ] Metrics only on published Reels
- [ ] Edit allowed within 7 days (configurable)
- [ ] Operator-only: endpoint/action rejects non-operator sessions server-side (403)
- [ ] [SEC] Metrics inputs are validated server-side as non-negative integers with a sane upper bound; the "published Reels only" and 7-day-edit rules are enforced in the handler, not just the form
- [ ] [SEC] Metrics writes are scoped to Reels of the current client (client-supplied `assembled_reel_id` verified for ownership)

**Depends on:** US-12.2

---

#### US-13.2 — Surface top themes for next strategy cycle
**As a** System, **I want** to pass performance signals into the next Content Strategy run, **so that** weekly planning improves over time.

| Owner | Work |
|-------|------|
| **FE** | "Insights" snippet on strategy screen (top 3 themes) |
| **BE** | Aggregate metrics by theme/pillar; inject summary into strategy agent prompt |
| **DB** | — |

**Acceptance criteria**
- [ ] Strategy agent prompt includes last 4 weeks metrics summary when available
- [ ] Graceful empty state when no metrics yet
- [ ] [SEC] Metrics summary injected into the strategy prompt is built from aggregated numbers server-side (no free-text fields), keeping the prompt surface free of user-authored injection vectors

**Depends on:** US-13.1, US-4.1

---

## Cross-cutting stories (all phases)

#### US-X.1 — Dashboard as default entry
**As a** Client, **I want** a dashboard showing onboarding status, this week's Reels, and pending approvals, **so that** I know what to do next.

| Owner | Work |
|-------|------|
| **FE** | Dashboard route default; cards: interview, profile, pending approvals, production status |
| **BE** | Dashboard aggregator endpoint or server component data loader |
| **DB** | — |

**Acceptance criteria**
- [ ] [SEC] Dashboard data is loaded server-side scoped to `getCurrentUser()`; the aggregator exposes no parameter to load another client's data

**Depends on:** US-1.1, US-11.1  
**Priority:** P0

---

#### US-X.2 — English and Spanish localization
**As a** Client, **I want** the UI in my language, **so that** I can use the product comfortably.

| Owner | Work |
|-------|------|
| **FE** | i18n files `en` / `es`; language switcher; all user-facing strings externalized |
| **BE** | Accept-Language or user preference; agent prompts locale-aware for generated copy |
| **DB** | `clients.preferred_locale` optional |

**Acceptance criteria**
- [ ] [SEC] Locale input (header, cookie, or preference) is validated against the supported list (`en`, `es`) before use; it is never used to build file paths or template lookups dynamically

**Priority:** P0 (incremental per screen)

---

#### US-X.4 — Seed provider catalog and tier defaults
**As a** Developer, **I want** a server-side provider catalog with low/high tier mappings, **so that** all agents and video jobs resolve vendors consistently without hardcoding in each story.

| Owner | Work |
|-------|------|
| **FE** | — (operator tier display lives in US-7.1 settings) |
| **BE** | Seed/migration for `neuramark_provider_catalog` + default `neuramark_cost_policies` (`provider_tier = low`, `max_cost_cents = 150`); resolver helper `resolveProvider(assetRole, tier)` used by US-4.x, US-8.x, US-9.3, US-10.1 |
| **DB** | `provider_catalog` rows (see Conventions **Provider tiers** table); `cost_policies` global default |

**Acceptance criteria**
- [ ] Catalog includes at minimum: `llm` low (siliconflow_deepseek / siliconflow_qwen), `tts` low (siliconflow_cosyvoice2), `talking_head` low (sadtalker_low), `talking_head` alt low (musetalk_low), `broll` low (siliconflow_wan21), `manual` (zero cost)
- [ ] High-tier rows exist but `active = false` until P1 (heygen_high, ltx_broll_high, elevenlabs_tts_high) — policy engine cannot select inactive rows
- [ ] Each row stores `cost_model` JSON sufficient for US-7.2 estimates (per_run_cents, per_second_cents, or per_clip_cents)
- [ ] `provider_tier` on `cost_policies` is the only tier switch in V1; no per-asset tier mixing in MVP
- [ ] [SEC] Catalog and cost policy writes are operator-only; catalog is not client-readable in full (only resolved provider name in operator views)
- [ ] [SEC] API vendor keys referenced only by env var names in server config — never stored in catalog rows

**Depends on:** US-X.3  
**Priority:** P0 (blocks US-7.2 and all provider stories)

---

#### US-X.3 — Hardcoded local user (dev V1)
**As a** Developer, **I want** a fixed current user without auth, **so that** we can build flows before login exists.

| Owner | Work |
|-------|------|
| **FE** | Display name/email in header |
| **BE** | `getCurrentUser()` returns `gaveho@gmail.com` / Gabriel Vega |
| **DB** | Seed single client row |

**Acceptance criteria**
- [ ] [SEC] `getCurrentUser()` lives in one server-only module and is the ONLY way any endpoint, Server Action, or agent resolves identity; no other code hardcodes the user or reads identity from headers/cookies/body
- [ ] [SEC] All owned tables carry a `client_id` FK from day one, and every query filters by the `client_id` resolved through `getCurrentUser()` — never a `client_id` from the request — so introducing real auth is a one-function change
- [ ] [SEC] `getCurrentUser()` is never imported into client components; the header displays values passed down from a Server Component

**Security note:** this helper is the future auth seam. Its return shape should already include a stable `id` used as the FK everywhere, so swapping in a session-backed implementation later changes zero call sites.

**Priority:** P0

---

## Suggested sprint order (dependency-aware)

```text
Sprint 1: US-X.3, US-X.1, US-1.1, US-1.2, US-1.3, US-2.1, US-2.2, US-2.3
Sprint 1b (Auth): US-14.1, US-14.2, US-14.4, US-14.5, US-14.3
Sprint 2: US-3.1, US-3.2, US-3.3, US-3.4, US-X.2 (onboarding screens)
Sprint 2b (Playbook + Trend): US-16.1, US-16.2
Sprint 3: US-X.4, US-4.1, US-4.2, US-5.1, US-5.2, US-6.1, US-6.2
Sprint 4: US-7.1, US-7.2, US-8.1, US-8.2, US-8.6, US-8.3, US-8.4, US-9.3
Sprint 5: US-8.5, US-9.1, US-9.2, US-7.3, US-7.4, US-10.1, US-10.2
Sprint 6: US-11.1, US-11.2, US-11.3
Sprint 7 (P1): US-8.7, US-12.1, US-12.2, US-13.1, US-13.2, (+ high-tier B-roll adapter when added)
```

Auth is scheduled early (Sprint 1b) because US-14.5 gates route protection for everything after it. US-X.3 defined the `getCurrentUser()` seam; US-14.5 swapped internals to session-backed lookup with no call-site changes. Logout UI shipped in US-14.3. Sprint 1b (US-14.1–US-14.5) is complete.

Sprint 1 Interview Builder: **US-1.1** is CLOSED (`plan/stories/US-1.1/`). VALIDATE PASS WITH NOTES; QA APPROVE (0 Critical, 0 High, 1 Low test-gap, no fix loop). **US-1.2** is CLOSED (`plan/stories/US-1.2/`). VALIDATE PASS WITH NOTES; QA APPROVE WITH NOTES (0 Critical, 0 High, 2 Low non-blocking, no fix loop). Builds FE `37f1f81` / BE `9abfb90`. **US-1.3** is CLOSED (`plan/stories/US-1.3/`). VALIDATE PASS WITH NOTES; QA APPROVE WITH NOTES (0 Critical, 0 High, 1 Medium non-blocking, 2 Low; no fix loop). Builds FE `6f55df4` / BE `4b5de0c`. **US-2.1** is CLOSED (`plan/stories/US-2.1/`). VALIDATE PASS WITH NOTES; QA APPROVE WITH NOTES (0 Critical, 0 High, 1 Low non-blocking; no fix loop). Builds FE `76e84c3` / BE `10da494`. **US-2.2** is CLOSED (`plan/stories/US-2.2/`). VALIDATE PASS WITH NOTES; QA APPROVE WITH NOTES (0 Critical, 0 High, 0 Medium, 2 Low non-blocking; no fix loop). Builds FE `6b99910` / BE `bd7ad08`. **US-2.3** is CLOSED (`plan/stories/US-2.3/`). VALIDATE PASS WITH NOTES; QA APPROVE (0 Critical, 0 High, 0 Medium, 1 Low non-blocking; no fix loop). Build BE `bf19e95` (no FE). Sprint 1 Interview Builder complete. **US-3.1** is CLOSED (`plan/stories/US-3.1/`). VALIDATE PASS WITH NOTES; QA APPROVE WITH CONDITIONS (0 Critical, 0 High, 1 Medium non-blocking, 5 Low; CLOSE yes). Builds FE `c0caaee` / BE `6e2121c`. **US-3.2** is CLOSED (`plan/stories/US-3.2/`). VALIDATE PASS WITH NOTES; QA APPROVE WITH CONDITIONS (0 Critical, 0 High, 1 Medium non-blocking, 2 Low; CLOSE yes). Builds FE `7a11571` / BE `ff280ed`. **US-3.3** is CLOSED (`plan/stories/US-3.3/`). VALIDATE PASS WITH NOTES; QA APPROVE WITH CONDITIONS (0 Critical, 0 High, 0 Medium, 3 Low; CLOSE yes). Builds FE `ca18258` / BE `63c8c64`. **US-3.4** is CLOSED (`plan/stories/US-3.4/`). VALIDATE PASS WITH NOTES; QA APPROVE WITH CONDITIONS (0 Critical, 0 High assumed — formal QA pending; PO CLOSE yes). Builds FE `a0b0a80` / BE `eadf356`. **Fase 1 Preferencias module complete** (US-3.1–US-3.4). Next recommended: **Phase 1 integration report** (`docs/development/integration-reports/PHASE-1.md` via integration-checker) **then** **Fase 2 Playbook + Trend** — start **US-16.1** (`plan/stories/US-16.1/`), then **US-16.2**, before Sprint 3 strategy agents (US-X.4, US-4.1). **US-16.1** is CLOSED (`plan/stories/US-16.1/`). VALIDATE PASS WITH NOTES; QA APPROVE WITH NOTES (0 Critical, 0 High, 3 Low non-blocking; no fix loop). Builds FE `d78a699` / BE `5792a63` / agents `bab3047`. **Next:** **US-16.2** — Publish weekly trend snapshot (manual) (`plan/stories/US-16.2/` when picked up).

---

## MVP cut line (matches roadmap)

Stories **through US-11.3** plus the Authentication module (**US-14.1–US-14.5**) constitute the operable V1 — the product cannot go to real clients without login and route protection.  
**US-12.x** and **US-13.x** can be manual spreadsheets until P1 is scheduled.

---

## Agent handoff checklist

Before marking a story **done**:

1. FE: loading, empty, error, and success states implemented  
2. BE: input validated; business rules enforced server-side  
3. DB: migration or seed updated if schema changed  
4. EN + ES strings for new UI  
5. Story acceptance criteria checked  
6. Downstream stories unblocked (contract/types stable)
