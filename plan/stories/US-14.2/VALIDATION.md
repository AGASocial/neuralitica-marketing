# Validation Report — US-14.2

**Story:** Log in with email and password  
**Date:** 2026-08-28  
**Validator:** requirements-validator  
**Branch:** `feature/US-14.2-login`  
**Sources:** `plan/USER_STORIES.md` § US-14.2, `plan/stories/US-14.2/{TASKS,SECURITY,CONTRACT}.md` (FE signed off 2026-08-28), `AGENTS.md`  
**Runtime:** `npm run build` succeeded (Next.js 15.5.20). Client chunks under `.next/static` grepped for `@supabase`, `supabase-js`, `NEXT_PUBLIC_SUPABASE`, `access_token`, `refresh_token` — no matches.

---

### Verdict: PASS WITH NOTES

Login-time behavior, Path A callback, generic credentials failure, fail-closed rate limit, open-redirect sanitizer, and httpOnly cookie minting match the frozen contract. Notes are deferred US-14.5 identity/guards, unexercised confirmation E2E, and the forward-only reset link — none of which this story is required to close.

---

### Acceptance Criteria

Criteria below are copied verbatim from `plan/USER_STORIES.md` § US-14.2, then SECURITY.md **(added)** items (binding per that review).

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Valid credentials for an ACTIVE account establish a server-side session (httpOnly cookie) and redirect to the dashboard | **PASS** | `logIn` calls user-scoped `signInWithPassword` then reads `neuramark_clients.active`. Active → `redirectTo: sanitizeLoginNext(input.next)` (`lib/auth/actions/log-in.ts:146-182`). Cookie flags `httpOnly: true`, `sameSite: "lax"`, `path: "/"`, `secure` in production (`lib/auth/supabase-cookie.ts:34-55`, `107-118`). FE `router.push(result.redirectTo)` (`components/auth/LoginForm.tsx:183-190`). No `active`/`role`/tokens on the JSON body (`log-in.ts:177-182`; `lib/contracts/auth.ts:138-147`). |
| Valid credentials for a confirmed-but-INACTIVE account authenticate but land on the neutral "account pending activation" screen (EN/ES); no dashboard or product route is reachable | **PASS WITH NOTE** | Inactive / missing row → `redirectTo: "/pending"` and `next` ignored (`log-in.ts:185-191`). FE stores identity then navigates to `/pending` without `?email=` (`LoginForm.tsx:184-190`). Neutral EN/ES copy (`messages/en.json:102-106`, `messages/es.json:102-106`; `PendingActivationView.tsx:23-27`). **Note (not a fail):** every-request product-route blocking is US-14.5; landing ≠ middleware. Direct navigation to `/dashboard` may still hit hardcoded `getCurrentUser()` until that story. |
| The `active` check is not a login-time-only gate: it is enforced server-side on every request via `getCurrentUser()`/route guards (US-14.5) | **NOTE** | Explicitly out of scope (`TASKS.md:10`, `CONTRACT.md:707-711`, `SECURITY.md:15-17`). `getCurrentUser()` still returns `gaveho@gmail.com` / `Gabriel Vega` (`lib/auth/get-current-user.ts:17-40`). Do not fail US-14.2 for this. |
| Invalid email or password shows the same generic error (no distinction between "unknown email" and "wrong password") | **PASS** | Any Auth miss (`authError`, missing user id, or missing session) → `invalidCredentialsError()` (`log-in.ts:154-161`; `lib/auth/errors.ts:38-40`). Code `INVALID_CREDENTIALS`, `messageKey: "auth.login.genericFailure"`. FE maps both `INVALID_CREDENTIALS` and `RATE_LIMITED` to the same string (`LoginForm.tsx:77-78`, `194`). Copy: EN `messages/en.json:86`, ES `messages/es.json:86`. No `EMAIL_NOT_CONFIRMED` / `USER_NOT_FOUND` / `INVALID_PASSWORD` in contracts (`lib/contracts/auth.ts:23-30`). |
| Session survives page refresh and new tab; no Supabase token is readable by browser JavaScript | **PASS WITH NOTE** | Session is `@supabase/ssr` host-only `sb-*` cookies via `cookies().set` / `response.cookies.set` with `httpOnly: true` (`supabase-cookie.ts:34-55`, `84-118`, `125-146`). Success JSON has no tokens (`log-in.ts:177-191`). `.next/static` has no `@supabase` / `access_token` / `refresh_token`. **Note:** product pages still resolve identity via hardcoded `getCurrentUser()` (US-14.5). Cookie persistence itself is implemented; identity swap is not this story. |
| Failure, loading, and pending states covered | **PASS** | Client validation + server field errors (`LoginForm.tsx:138-153`, `196-201`). Form error `Message` (`230-232`). Submit `loading`/`disabled` and `submitPending` label (`270-275`). Path A banners (`218-228`). Password cleared after submit (`205-206`). Pending landing uses `PendingActivationView` (`PendingActivationClient.tsx:61-70`). Empty state N/A (form, not a list). |
| Copy exists in English and Spanish | **PASS** | Parallel keys under `auth.login` and `auth.pending` in `messages/en.json:79-107` and `messages/es.json:79-107` (title, subtitle, fields, generic failure, confirmed / confirmationFailed banners, signup + reset links, field errors, pending title/body/emailLabel/logoutHint). Locale switcher reused (`AuthShell.tsx:49-51`). |
| [SEC] The generic login failure returns the same status code, body shape, and copy for unknown email, wrong password, and unconfirmed account, with no timing side channel introduced by app code (the Supabase call runs for all failure paths; no early return on "user not found") | **PASS** | Processing order: forbidden keys → Zod → rate-limit → **always** `signInWithPassword` on valid shape (`log-in.ts:121-152`). No app lookup of whether the email exists before Auth. Unconfirmed is an Auth error, not pending (`log-in.ts:154-161` vs `185-191`). One envelope: `{ ok: false, error: { code: "INVALID_CREDENTIALS", messageKey: "auth.login.genericFailure" } }` (`errors.ts:38-40`; `CONTRACT.md:50-51`). |
| [SEC] Brute-force protection: max 5 failed attempts per (email, IP) per 15-minute window tracked in `neuramark_auth_attempts`; over-limit attempts return the same generic failure (with 429), and the counter resets on successful login; Supabase Auth built-in rate limits remain enabled as the second layer | **PASS** | `LOGIN_FAILED_WINDOW_MS = 15 * 60 * 1000`, `LOGIN_FAILED_MAX = 5`, action `login_failed` (`lib/auth/rate-limit.ts:171-198`). Over-limit → `loginRateLimitedError()` (`log-in.ts:142-144`; `errors.ts:34-36`) with **same** `messageKey: "auth.login.genericFailure"` (not `auth.errors.rateLimited`). Auth failure records `login_failed` (`log-in.ts:39-53`, `156`). Success deletes matching rows (`rate-limit.ts:205-229`; `log-in.ts:164-167`). HMAC hashes only (`lib/auth/hash.ts:27-33`). No `login_success` enum (`lib/contracts/auth.ts:14-19`; existing migration `supabase/migrations/20260828120000_neuramark_auth_signup.sql:6-11`). |
| [SEC] Session cookie is set with `HttpOnly`, `Secure` (in production), `SameSite=Lax`, and `Path=/`; no Supabase access/refresh token is readable by browser JavaScript or present in any response body | **PASS** | `applySessionCookieFlags`: `httpOnly: true`, `secure: process.env.NODE_ENV === "production"`, `sameSite: "lax"`, `path: "/"`; no `Domain` (`supabase-cookie.ts:21-55`). Anon/publishable key is server-only, never `NEXT_PUBLIC_` (`supabase-cookie.ts:12-15`). Service-role client stays `persistSession: false` (`lib/supabase/server.ts:25-30`) and is not the cookie adapter. Action result and callback 302 body contain no tokens (`log-in.ts:177-191`; `app/auth/callback/route.ts:14-24`). Client bundle grep: clean. |
| [SEC] Session rotation on login: a successful login always issues a fresh session cookie value; any session identifier present before authentication is discarded (session fixation guard) | **PASS** | `discardSupabaseAuthCookies()` runs **before** `signInWithPassword` (`log-in.ts:146-152`; `supabase-cookie.ts:85-97`). Failed Auth also expires cookies (`log-in.ts:155`). New session comes from this sign-in via `setAll` + `applySessionCookieFlags`. |
| [SEC] Login mutation is CSRF-protected: Server Action with origin verification, or Route Handler rejecting mismatched `Origin` headers | **PASS** | Single mutation: `"use server"` `logIn` (`log-in.ts:1`, `194-208`). No login POST Route Handler (only `GET /auth/callback`). Same CSRF pattern as US-14.1 `signUp`. |
| [SEC] The post-login redirect target (`next`/`redirectTo` parameter) is validated as a same-origin relative path: must start with a single `/`, must not start with `//` or contain a scheme/backslash; anything else falls back to `/dashboard` (open-redirect prevention) | **PASS** | `isSafeRelativePath` / `sanitizeLoginNext` (`lib/auth/safe-next-path.ts:26-59`): single `/`, not `//`, no `\`, no `://`, colon-before-slash scheme check, decode loop rejects `%2F%2F` / `%5C`. Unsafe / absent → `/dashboard`. Inactive **ignores** `next` (`log-in.ts:185-191`). FE maps URL `next`/`redirectTo` → action `next` only (`app/(auth)/login/page.tsx:15-29`) and navigates **only** to `result.redirectTo` (`LoginForm.tsx:176-190`). Body `redirectTo` rejected by `.strict()` (`lib/contracts/auth.ts:118-130`). Callback Path A ignores `next` / `redirect_to` (`app/auth/callback/route.ts:32-35`, `37-67`). |
| [SEC] Passwords are never logged or echoed back on failure; the login handler redacts credential fields from any error/telemetry path | **PASS** | Unexpected errors log `redactAuthPayload(raw)` (`log-in.ts:197-205`; `errors.ts:65-80` redacts keys containing `password`). Auth failures return envelope only — no password echo (`log-in.ts:154-161`). Attempts store HMAC email/IP, never password (`rate-limit.ts:24-37`). Callback does not log `code` or URL (`app/auth/callback/route.ts:64-66`). |
| [SEC] The active/inactive distinction is revealed only AFTER successful authentication: login failures for inactive, active, unconfirmed, and nonexistent accounts are all the same generic error, and no unauthenticated request or response can be used to learn an account's activation state | **PASS** | `neuramark_clients` is read only after Auth success (`log-in.ts:154-174`). Failures never include `email`/`displayName`/`active`/`redirectTo`. Unconfirmed → credentials failure, not pending. Callback errors 302 to `/login?error=confirmation` with no activation signal (`app/auth/callback/route.ts:27-31`, `44-46`). |
| [SEC] The pending-activation screen shows only what the user already knows (at most their own email/display name) plus neutral copy; no internal IDs, activation queue details, operator contact internals, or timestamps that leak operational information | **PASS** | View renders title, body, optional display name + email, logout hint (`PendingActivationView.tsx:23-58`). Copy has no IDs, queue, operator internals, or timestamps (`messages/en.json:102-106`, `messages/es.json:102-106`). Identity props come from authenticated `logIn` success via sessionStorage (`LoginForm.tsx:184-188`; `pending-identity.ts:8-14`), not from the URL. |
| [SEC] (added) Rate-limit store errors fail closed: if `recordAuthAttempt` / count queries throw or return an error, treat the request as over-limit and return the same 429 generic failure — do not fail open. A successful sign-in still succeeds if **clearing** `login_failed` rows fails (log server-side; do not convert success into an enumeration-shaped error) | **PASS** | `countAttempts` error → `null`; `isLoginRateLimited` treats `null` as limited (`rate-limit.ts:82-88`, `190-197`). `recordAuthAttempt` false → `loginRateLimitedError()` (`log-in.ts:49-51`). `resetLoginFailedAttempts` false → `console.error` and continue success (`log-in.ts:164-167`; `rate-limit.ts:218-228`). |
| [SEC] (added) `/pending` identity is never an unauthenticated query param: do not treat `?email=` (or any other query field) as proof of identity or echo it as the account. After login, email/display name come from the authenticated result only | **PASS** | Pending page searchParams are `locale` only (`app/(auth)/pending/page.tsx:5-14`). Client strips `email`, `displayName`, `client_id`, `auth_user_id`, `role`, `active` from the URL (`PendingActivationClient.tsx:15-41`) and reads sessionStorage written from `logIn` success (`44-59`; `pending-identity.ts:16-45`). FE must not put email on the pending URL (`LoginForm.tsx:190` uses `withLocale(result.redirectTo)` only). |
| [SEC] (added) Login request contract forbids `role`, `active`, `auth_user_id`, and `client_id`: any payload containing those keys is rejected or stripped before processing. Success payloads must not include `role`, `client_id`, `auth_user_id`, or tokens. A post-auth landing discriminator (`dashboard` vs `pending`) is allowed; a raw `active` boolean is unnecessary and must not appear on unauthenticated responses | **PASS** | `findForbiddenLogInKeys` before Zod (`log-in.ts:122-126`; `forbidden-fields.ts:16-48`). Success type: `ok`, `redirectTo`, `email`, `displayName` only (`lib/contracts/auth.ts:138-147`). `active` is used server-side for landing, never returned (`log-in.ts:33-37`, `176-191`). |
| [SEC] (added) Cookie carries identity only: do not bake `active`, `role`, or `client_id` into cookie values or JWT-style claims the browser can influence. Session cookie shape is the `@supabase/ssr` (or equivalent) host-only cookie US-14.5 will read — no parallel product session store, no service-role session | **PASS** | Cookie adapter is `@supabase/ssr` `createServerClient` with anon/publishable key (`supabase-cookie.ts:99-120`). Flags overwrite library options; no custom claims (`34-55`). Service-role helper is separate and `persistSession: false` (`lib/supabase/server.ts:25-30`). No `neuramark_session` cookie. |
| [SEC] (added) Missing or unreadable `neuramark_clients` row after successful Supabase sign-in must not become an enumeration/oracle path: do not return a client-visible error that only happens when the auth user exists. Land on the confirmed-inactive path (`/pending`). Do **not** INSERT/UPDATE `neuramark_clients` from login | **PASS** | `readClientLandingRow` returns `null` on error/missing/incomplete row (`log-in.ts:60-101`). Null → pending identity from Auth email, `redirectTo: "/pending"` (`104-118`, `185-191`). Grep of `log-in.ts`: no `.insert` / `.update` on `neuramark_clients`. |
| [SEC] (added) `GET /auth/callback` completes email confirmation server-side and never grants product access while `active` is not true: exchange `code` on the server; tokens/`code` never in 302 `Location`, HTML, JSON, or client JS; never logged. Invalid/expired/missing/used codes and provider `error` / `error_description` share **one** generic confirmation-failure. Inactive (or missing client row) never 302s to `/dashboard`. If the callback sets a session cookie, same cookie flags and fixation rules. Callback `next` / `redirect_to` use the same relative-path rule; unsafe values fall back to the frozen callback landing | **PASS WITH NOTE** | Path A frozen (`CONTRACT.md:209-251`). `GET` exchanges `code` via user-scoped client (`app/auth/callback/route.ts:53-55`). Success: `signOut({ scope: "local" })` + `expireSupabaseAuthCookies`, 302 `/login?confirmed=1` (`61-63`, `11`). Failure (missing code, provider error, exchange error, throw): 302 `/login?error=confirmation` (`27-31`, `44-46`, `57-58`, `64-66`). `Referrer-Policy: no-referrer` (`19`). `Location` is only those two relative URLs — no `code`, tokens, `error_description`, `/pending`, or `/dashboard`. `next` / `redirect_to` never read. **Note:** E2E click of a real confirmation email was not exercised here (QA). |
| [SEC] (added) Confirmation and login use `SITE_URL` as the allowlisted public origin (reuse `getSignupEmailRedirectTo()` / US-14.1): do not build `emailRedirectTo` or post-callback absolute URLs from attacker-controlled hosts; if `SITE_URL` is unset, do not fall through to an open redirect | **PASS** | Callback builds app-relative `Location` only (`app/auth/callback/route.ts:11-24`) — no `Host` / `X-Forwarded-Host`. Login `redirectTo` is a sanitized relative path (`safe-next-path.ts:44-59`). Signup `emailRedirectTo` remains `{origin}/auth/callback` from `SITE_URL` (or omitted if unset/invalid) (`lib/auth/send-signup-confirmation.ts:7-40`). |

---

### Convention Compliance

| Rule | Status | Evidence |
|------|--------|----------|
| EN + ES user-facing copy | **PASS** | `messages/en.json` / `messages/es.json` `auth.login` + `auth.pending`. Login 429 uses `auth.login.genericFailure`, not `auth.errors.rateLimited` (`errors.ts:34-36`; `LoginForm.tsx:77-78`). |
| Server Components by default; `"use client"` only where justified | **PASS** | `app/(auth)/login/page.tsx` and `app/(auth)/pending/page.tsx` are Server Components. Client islands: `LoginForm.tsx` (form state), `PendingActivationClient.tsx` (sessionStorage + query strip), `AuthLocaleSwitcher.tsx` (search params). |
| PrimeReact-first | **PASS** | Login: `InputText`, `Password`, `Button`, `Message` (`LoginForm.tsx:5-8`, `236-275`). `PendingActivationView` is a small presentational layout (no form) — justified; reused from US-14.1. |
| Loading / empty / error / pending | **PASS** | See AC “Failure, loading, and pending states”. |
| Supabase Auth behind Next.js; no SDK/tokens/keys in the browser; httpOnly session | **PASS** | `@supabase/ssr` / `@supabase/supabase-js` only in server modules (`lib/auth/supabase-cookie.ts`, `lib/supabase/server.ts`, signup helpers). `LoginForm` calls `logIn` Server Action only (`LoginForm.tsx:12`, `181`). Build: `/login` and `/pending` client chunks have no `@supabase`. `SUPABASE_ANON_KEY` is not `NEXT_PUBLIC_`. |
| `neuramark_` prefix | **PASS** | Reads `neuramark_clients`; writes/deletes `neuramark_auth_attempts` with `login_failed`. No new tables, enums, or indexes. |
| `getCurrentUser()` still hardcoded until US-14.5 | **PASS** | `lib/auth/get-current-user.ts:17-40` — `gaveho@gmail.com` / `Gabriel Vega`. Login/callback do not replace the identity seam. |
| Backend endpoints map to a concrete FE consumer | **PASS** | `logIn` → login form. `GET /auth/callback` → confirmation email (`emailRedirectTo`). No speculative login Route Handler. |
| Reset implementation out of scope (link only) | **PASS** | Link to `/reset-password?locale=` (`LoginForm.tsx:284-286`). No reset page/action in this story. |
| Logout out of scope | **PASS** | Pending hint copy only (`messages/en.json:106`); no logout Server Action. |

**Build:** `npm run build` — compiled, types valid. Routes: `ƒ /login`, `ƒ /pending`, `ƒ /auth/callback`. No `/reset-password` (expected until US-14.4).

---

### Frozen contract match

| Freeze | Status |
|--------|--------|
| Path A: exchange `code`, drop durable session, 302 `/login?confirmed=1` or `/login?error=confirmation` | **PASS** (`app/auth/callback/route.ts`) |
| Success `{ ok: true, redirectTo, email, displayName }` — no `active` / `role` / tokens | **PASS** (`log-in.ts:177-191`; `lib/contracts/auth.ts:138-147`) |
| Generic `INVALID_CREDENTIALS` for unknown / wrong / unconfirmed; 429 same `messageKey` | **PASS** (`errors.ts:34-40`) |
| Open-redirect sanitizer | **PASS** (`safe-next-path.ts`) |
| Fail-closed rate limit | **PASS** (`rate-limit.ts:178-198`; `log-in.ts:49-51`) |

CONTRACT.md header still says “Draft — awaiting FE signoff” while the signoff checkbox is marked 2026-08-28. Documentation nit only; FE notes match the implementation (pending identity from action result; URL `next`/`redirectTo` → action `next`; Path A banners on `/login`).

---

### Gaps (what blocks PASS)

None that this story owns.

Deferred / unscored as fail per validator instructions:

1. **US-14.5** — every-request `active` / spend / route guards and `getCurrentUser()` session swap. Login-time landing is implemented.
2. **US-14.3** — logout mutation (hint copy only).
3. **US-14.4** — reset-password page/action (login link only; `/reset-password` is not a route yet).
4. **E2E confirmation click** — static Path A handler exists; inbox click not exercised in this validation.

---

### Scope Creep

None material.

- `@supabase/ssr` is the sanctioned cookie client (`SECURITY.md` / `CONTRACT.md`).
- `sessionStorage` pending identity is the contracted FE transport (not a second product identity API).
- Callback `Cache-Control: no-store` is extra hardening, not a new product surface.
- No logout action, no reset handlers, no RLS policies, no `login_success` enum, no spend endpoints.

---

### Recommended Next Actions (and which agent should take them)

1. **product-owner** — Check US-14.2 acceptance boxes in `plan/USER_STORIES.md` (including [SEC] lines). Optionally fix CONTRACT.md status line (“Draft — awaiting FE signoff” vs signed-off). Do **not** check the US-14.5 every-request AC as done.
2. **qa-engineer** — E2E: active login → dashboard cookie; confirmed-inactive login → `/pending` without `?email=`; unknown/wrong/unconfirmed → same generic copy; 6th failure → same copy (429); unsafe `next` → `/dashboard` for active and `/pending` for inactive; confirmation link → `/login?confirmed=1` with no session; invalid `code` → `/login?error=confirmation`; grep client bundles again on the QA build.
3. **nextjs-frontend / nextjs-backend** — No code fix required for this story. Start US-14.5 when scheduled (identity swap + every-request guards). US-14.3/14.4 remain separate.

**Orchestrator:** story may proceed to QA. Do not send implementers a fix loop for the notes above.
