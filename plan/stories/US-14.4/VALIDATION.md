# Validation Report — US-14.4

**Story:** Reset forgotten password  
**Date:** 2026-08-28  
**Validator:** requirements-validator  
**Branch:** `feature/US-14.4-reset-password`  
**Sources:** `plan/USER_STORIES.md` § US-14.4, `plan/stories/US-14.4/{TASKS,SECURITY,CONTRACT}.md` (FE signed off 2026-08-28), `AGENTS.md`  
**Runtime:** `npm run build` succeeded (Next.js 15.5.20). Routes: `ƒ /reset-password`, `ƒ /reset-password/new`, `ƒ /auth/callback`, `ƒ /auth/callback/recovery`, `ƒ /login`. Client chunks under `.next/static` grepped for `token_hash`, `@supabase`, `supabase-js`, `NEXT_PUBLIC_SUPABASE`, `access_token`, `refresh_token` — **no matches**. Live inbox / token-exchange E2E was not exercised.

---

### Verdict: PASS WITH NOTES

Request-reset, dedicated recovery callback, Path A defense, set-password, generic check-email (including 429), shared password policy, global sign-out, and `/login?reset=1` landing match the frozen contract. Notes are ops OTP config, unproven live inbox E2E, sanctioned US-14.5/US-14.3 deferrals, and a tighter insert-then-count rate window — none of which this story is required to close.

**Blockers:** none.

---

### Acceptance Criteria

Criteria below are copied verbatim from `plan/USER_STORIES.md` § US-14.4, then SECURITY.md **(added)** items (binding per that review).

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Requesting a reset returns the same generic "check your email" response for known and unknown emails (no enumeration) | **PASS** | `requestPasswordReset` always ends in `{ ok: true }` after a valid, not-limited shape (`lib/auth/actions/request-password-reset.ts:69-72`). No `neuramark_clients` lookup; no `USER_NOT_FOUND`. `sendPasswordResetEmail` always calls `resetPasswordForEmail` and absorbs provider errors (`lib/auth/send-password-reset.ts:17-33`; `isBenignResendError` at `lib/auth/supabase-auth-errors.ts:79-92`). FE shows `CheckEmailView` for `{ ok: true }` **and** `RATE_LIMITED` (`components/auth/ResetPasswordForm.tsx:128-130,174-187`). Copy is existence-conditional, not existence-revealing (`messages/en.json:110`, `messages/es.json:110`). |
| The emailed link leads to a set-new-password page that works exactly once per token | **PASS WITH NOTE** | `emailRedirectTo` = `{SITE_URL origin}/auth/callback/recovery` (`lib/auth/site-origin.ts:50-53`; `lib/auth/send-password-reset.ts:18-22`). Handler exchanges `token_hash`+`type=recovery` via `verifyOtp` or PKCE `code` via `exchangeCodeForSession` on the user-scoped cookie client, then 302s token-free to `/reset-password/new` (`app/auth/callback/recovery/route.ts:11-12,43-110`). Set-password uses cookie `getUser()`, then `updateUser({ password })` (`lib/auth/actions/set-new-password.ts:61-70`). Provider OTP is single-use; password change invalidates outstanding recovery tokens (documented). **Note:** live single-use E2E was not exercised. |
| Expired or already-used tokens show a clear error with a path to request a new link | **PASS** | Callback failure (missing/invalid/expired/used, wrong `type`, provider `error` / `error_description`, throw) 302s to `/reset-password/new?error=invalid` and expires `sb-*` (`app/auth/callback/recovery/route.ts:12,31-35,49-51,57-59,78-79,85-86,106-107,111-113`). Page treats `error=invalid` or `recoveryReady === false` as the same UI (`app/(auth)/reset-password/new/page.tsx:15-21`; `components/auth/SetNewPasswordForm.tsx:216-224`). Copy `auth.reset.invalidToken` + retry `/reset-password` (`messages/en.json:125-126`, `messages/es.json:125-126`; form `L104-106`). Action missing session → `RECOVERY_INVALID` / `auth.reset.invalidToken` (`lib/auth/errors.ts:43-45`; `set-new-password.ts:64-66,73-74`; form `L189-191`). Provider text is not echoed. |
| New password is validated server-side against the same policy as signup | **PASS** | `validatePassword` from `lib/auth/password-policy.ts:22-36` (12–128, no composition rules, bundled denylist) in `set-new-password.ts:17,49-52`. Policy failure → `PASSWORD_POLICY` (`errors.ts:59-64`). Client match/length hints only (`SetNewPasswordForm.tsx:143-156,253`; `messages/en.json:123`). `confirmPassword` is not on the wire (`SetNewPasswordForm.tsx:176-178`; `lib/contracts/auth.ts:186-194`). |
| After a successful reset the client can log in with the new password; the old password no longer works | **PASS WITH NOTE** | Success updates Auth password (`set-new-password.ts:68-70`), globally signs out (`L88-102`), discards cookies (`L102`), returns `{ ok: true, redirectTo: "/login?reset=1" }` (`L29,104-107`). FE `router.push(result.redirectTo)` (`SetNewPasswordForm.tsx:183-186`). Login banner `reset=1` (`app/(auth)/login/page.tsx:12,38-40`; `LoginForm.tsx:231-237`; `messages/en.json:89`). No new login path — US-14.2 `logIn`. **Note:** live old-vs-new password proof against a real inbox was not exercised. |
| Copy exists in English and Spanish | **PASS** | Parallel `auth.reset` trees in `messages/en.json:103-134` and `messages/es.json:103-134` (request, check-email, resend, set-password, mismatch, invalid token, retry, field errors, password hint). `auth.login.resetSuccess` / `resetLink` in both (`en.json:89,91`; `es.json:89,91`). Key parity script: zero EN/ES delta. No “admin” / administrador in product copy. |
| [SEC] Known and unknown emails get the same status code, body, and copy from the request endpoint; the Supabase recovery call's "user not found" outcome is absorbed server-side, and app code adds no timing branch that distinguishes the two | **PASS** | Processing: forbidden → Zod → record → rate-limit → **always** `sendPasswordResetEmail` (`request-password-reset.ts:31-72`). No early return on missing / unconfirmed / inactive. `sendPasswordResetEmail` swallows not-found and other provider errors and never returns a distinct client outcome (`send-password-reset.ts:17-33`). Known and unknown share `{ ok: true }` (`authSuccess()`). Unconfigured Supabase → `INTERNAL_ERROR` for everyone (`request-password-reset.ts:46-51`). |
| [SEC] Reset requests are rate-limited: max 3 requests per email per hour and max 10 per IP per hour, tracked in `neuramark_auth_attempts`; over-limit requests still return the generic "check your email" response (with 429) | **PASS WITH NOTE** | Action `password_reset_request` (existing enum, US-14.1 migration). `isPasswordResetRateLimited`: 3/`email_hash`/hour **and** 10/`ip_hash`/hour (`lib/auth/rate-limit.ts:175-205`). Over-limit / store failure → `passwordResetRateLimitedError()` (`request-password-reset.ts:61-67`; `errors.ts:38-41`) with **`messageKey: "auth.reset.checkEmail"`**, not `auth.errors.rateLimited`. FE treats `RATE_LIMITED` as the same check-email screen (`ResetPasswordForm.tsx:128-130`). Record runs for every well-formed email before the send (`request-password-reset.ts:55-59`). **Note:** insert-then-count with `>= 3` / `>= 10` is one attempt tighter than a “3 successful sends” reading (same pattern as US-14.1 resend). |
| [SEC] Recovery tokens are single-use and expire within 1 hour (Supabase Auth OTP expiry configured accordingly); a used or expired token cannot set a password, and any outstanding recovery token is invalidated when the password changes by any means | **NOTE** | App cannot enforce Mailer OTP TTL. Frozen as Supabase dashboard config in `CONTRACT.md` OTP section and `.env.example:26-29` (≤ 1 hour / ≤ 3600s, single-use, password change invalidates outstanding tokens). Used/expired exchange → failure 302 (`recovery/route.ts:78-79,106-107`). Set-password without a valid cookie → `RECOVERY_INVALID` (`set-new-password.ts:64-66`). `updateUser({ password })` is the provider invalidation. **Do not fail** — ops config is documented. Live expiry was not proven. |
| [SEC] The emailed link lands on a Next.js Route Handler that exchanges the recovery code for a session server-side; the token never reaches client-side JavaScript, is never logged, and the set-password page sends `Referrer-Policy: no-referrer` so the URL cannot leak via referrer | **PASS** | Dedicated `GET /auth/callback/recovery` (`app/auth/callback/recovery/route.ts:43-114`). 302 `Location` is only `/reset-password/new` or `/reset-password/new?error=invalid` (`L11-12,21-28`) — no `token_hash` / `code` / `type`. Logs are generic (`L63-65,94-96,112`) — URL/query not logged. Client forms do not read `token_hash`/`code`/`type` (grep of `components/auth`: no matches). `.next/static`: no `token_hash` / `@supabase`. Set-password: layout `referrer: "no-referrer"` (`app/(auth)/reset-password/new/layout.tsx:4-6`) plus `next.config.ts:9-15`. Callback 302 sends `Referrer-Policy: no-referrer` (`recovery/route.ts:14-18`). |
| [SEC] A successful password reset revokes all other active sessions for that user (global sign-out), so a stolen session does not survive recovery | **PASS WITH NOTE** | `auth.signOut({ scope: "global" })` then `discardSupabaseAuthCookies()` (`set-new-password.ts:88-102`; cookie flags match set path in `lib/auth/supabase-cookie.ts:34-55,84-97`). **Note:** if global `signOut` errors, the action logs and still returns success after local cookie discard (`L92-100`). Password has already been changed. |
| [SEC] The set-password endpoint enforces the shared password policy module (US-14.1), is CSRF-protected, and never logs the new password | **PASS** | Shared `validatePassword` (`set-new-password.ts:17,49-52`). `"use server"` Server Action (`L1,110`) — same CSRF pattern as `signUp` / `logIn` (Next.js origin check; no GET mutation). Catch path logs `redactAuthPayload(raw)` (`L120-123`; `errors.ts:73-89` redacts keys containing `password`). Success/error JSON never echoes the password. |
| [SEC] Password reset works identically for active, inactive, and unconfirmed accounts — same generic responses, same flow (preserving enumeration resistance); a successful reset never changes `neuramark_clients.active`, and the account remains gated on activation after the reset (recovering a password grants credential access only, never product access) | **PASS WITH NOTE** | Request-reset and set-password never read or write `neuramark_clients` (grep of those actions / recovery handler: no `active` / `role` / table access). No branch on confirmation or activation. Success `redirectTo` is `/login?reset=1` only — never `/dashboard` or `/pending` (`set-new-password.ts:29,104-107`; `recovery/route.ts:11-12`). **Note (not a fail):** every-request `active` gating is US-14.5. Until then, hardcoded `getCurrentUser()` plus a leftover recovery cookie can still render product pages if the user navigates there (`lib/auth/get-current-user.ts:17-40`). Sanctioned in SECURITY.md / CONTRACT.md. |
| [SEC] (added) Rate-limit store errors fail closed: if `recordAuthAttempt` / count queries throw or return an error, treat the request as over-limit and return **429** with the **same generic check-email copy** — do not fail open. Record **every** well-formed submitted email (known or unknown) so 429 vs 200 is not an existence oracle | **PASS** | `recordAuthAttempt` false → 429 check-email (`rate-limit.ts:18-54`; `request-password-reset.ts:61-63`). `countAttempts` error → `null`; `isPasswordResetRateLimited` treats `null` / throw as limited (`rate-limit.ts:82-88,196-204`). Record is after Zod, before send, for every valid email (`request-password-reset.ts:55-59`). |
| [SEC] (added) Request-reset is CSRF-protected the same way as set-password: Server Action with origin verification (or Route Handler rejecting mismatched `Origin`). No GET can trigger a recovery email | **PASS** | Only mutation: `"use server"` `requestPasswordReset` (`request-password-reset.ts:1,75`). Forgot-password form POSTs via the Server Action (`ResetPasswordForm.tsx:10,126`). Recovery callback is GET exchange-or-reject only (`recovery/route.ts:43`). Same CSRF pattern as US-14.1 / US-14.2. |
| [SEC] (added) Request-reset must not become an existence oracle via send/profile failure (US-14.1 High finding 1 class): do not return a client-visible error that only happens when the auth user exists. Absorb “user not found.” Map provider/send failures that only occur for existing users to generic check-email success (log server-side). Do **not** read `neuramark_clients` (or confirmation status) to decide whether to send. `INTERNAL_ERROR` only for failures that also occur for unknown emails (e.g. unconfigured Supabase) | **PASS** | No profile/`neuramark_clients` read in the request-reset path. `sendPasswordResetEmail` maps not-found and other send failures to void; the action still returns `{ ok: true }` (`send-password-reset.ts:25-33`; `request-password-reset.ts:69-72`). `INTERNAL_ERROR` only for unconfigured Supabase or unexpected throw (`request-password-reset.ts:46-51,80-89`). |
| [SEC] (added) Recovery `emailRedirectTo` uses server-only `SITE_URL` as the allowlisted public origin pointing at the dedicated recovery callback — never `Host` / `X-Forwarded-Host`. If origin cannot be resolved safely, omit `emailRedirectTo` rather than copying the request host. Document the recovery callback URL on the Supabase Auth redirect allowlist (`.env.example`) | **PASS** | `getAllowlistedSiteOrigin()` uses `SITE_URL` then `VERCEL_URL`, never request Host (`lib/auth/site-origin.ts:9-42`). Recovery path: `${origin}/auth/callback/recovery` or omit (`L50-53`; `send-password-reset.ts:18-22`). Documented in `.env.example:20-24`. |
| [SEC] (added) Dedicated recovery callback; Path A must not consume recovery tokens: primary exchange is `GET /auth/callback/recovery` (not Path A). Recovery `emailRedirectTo` must **not** be `/auth/callback`. Path A **must not** call `verifyOtp` / `exchangeCodeForSession` for `type=recovery` (remove `recovery` from Path A’s OTP allowlist). If `type=recovery` still hits Path A, 302 to `/auth/callback/recovery` with the same query **without consuming the token**; never 302 `/login?confirmed=1` for recovery. Signup/email Path A landings stay frozen | **PASS** | Dedicated handler exists. `emailRedirectTo` is `/auth/callback/recovery`, not Path A (`site-origin.ts:44-53`). Path A `EMAIL_OTP_TYPES` is `signup`, `invite`, `magiclink`, `email_change`, `email` — **no `recovery`** (`app/auth/callback/route.ts:19-25`). `type=recovery` returns immediately via `forwardRecoveryWithoutConsuming` (`L53-64,77-79`) — no `verifyOtp` / `exchangeCodeForSession`. Signup/email landings remain `/login?confirmed=1` / `/login?error=confirmation` (`L16-17`). Production server bundle confirms the same allowlist and forward. |
| [SEC] (added) `token_hash`, `code`, access_token, and refresh_token never appear in the 302 `Location`, HTML, JSON, or client JS; they are never logged (redact if a URL is logged). Recovery callback 302 sends `Referrer-Policy: no-referrer`. Invalid, expired, missing, or already-used tokens — and provider `error` / `error_description` — share **one** generic recovery-failure (retry to `/reset-password`); do not echo provider error text. Expire any `sb-*` cookies on exchange failure | **PASS** | Recovery success/failure Locations are frozen constants (`recovery/route.ts:11-18`). Path A recovery forward **does** preserve query in `Location` (`callback/route.ts:57`) — required by CONTRACT fixture, then consumed only on the recovery handler. Failure: one landing, `expireSupabaseAuthCookies` (`recovery/route.ts:31-35`). Client JS grep: clean. Set-password props are `recoveryReady: boolean` only (`reset-password/new/page.tsx:29-36`). |
| [SEC] (added) Recovery session is set-password only: cookie flags match login (`HttpOnly`, `Secure` in production, `SameSite=Lax`, `Path=/`, host-only). Minted with the user-scoped `@supabase/ssr` client — **not** the service-role client. This flow never 302s to `/dashboard`, `/pending`, or other product routes. After successful set-password: `signOut({ scope: "global" })` **then** clear cookies; land on **`/login`** (not dashboard/pending). Cookie carries identity only — do not bake `active` / `role` / `client_id` into it | **PASS** | User-scoped `createUserScopedAuthClientForResponse` for exchange (`recovery/route.ts:72-76,103-104`; `supabase-cookie.ts:12-18,125-147`). Flags: `httpOnly: true`, `secure` in production, `sameSite: "lax"`, `path: "/"`, no Domain (`supabase-cookie.ts:34-55`). Service-role stays `persistSession: false` and is not the verifyOtp client (`lib/supabase/server.ts:25-30`). No product 302s from this flow. Success lands `/login?reset=1`. Cookie adapter does not write `active`/`role`/`client_id`. |
| [SEC] (added) Request-reset and set-password contracts forbid `role`, `active`, `auth_user_id`, and `client_id`: any payload containing those keys is rejected or stripped before processing. Set-password forbids `confirmPassword` / `confirm_password` on the wire (same as signup). Success/error payloads never include tokens, `role`, `active`, `client_id`, or `auth_user_id` | **PASS** | Request-reset: `findForbiddenPasswordResetRequestKeys` before Zod (`forbidden-fields.ts:51-54`; `request-password-reset.ts:31-37`). Set-password: those keys **plus** `confirmPassword` / `confirm_password` (`forbidden-fields.ts:56-58`; `set-new-password.ts:34-40`). Schemas `.strict()` (`lib/contracts/auth.ts:157-168,190-194`). Success bodies: `{ ok: true }` and `{ ok: true, redirectTo: "/login?reset=1" }` (`L173-174,201-204`). |
| [SEC] (added) Unconfirmed recovery must not write activation: if Supabase confirms email as a provider side effect of recovery/`verifyOtp`/`updateUser`, document that as provider behavior — **do not** invent an app-side confirm write and **never** set `neuramark_clients.active` or `role`. Observable reset responses stay identical for unconfirmed vs confirmed | **PASS** | No app-side confirm write. Reset files do not `UPDATE` `neuramark_clients`. CONTRACT documents provider auto-confirm (`CONTRACT.md:177,531`). Observable request-reset is always `{ ok: true }` when not limited/invalid. |

---

### Convention Compliance

| Rule | Status | Evidence |
|------|--------|----------|
| EN + ES user-facing copy | **PASS** | `messages/en.json` / `messages/es.json` `auth.reset` + `auth.login.resetSuccess` / `resetLink`. Request 429 uses `auth.reset.checkEmail`, not `auth.errors.rateLimited` (`errors.ts:38-41`; `ResetPasswordForm.tsx:128-130`). |
| Server Components by default; `"use client"` only where justified | **PASS** | Pages `app/(auth)/reset-password/page.tsx` and `.../new/page.tsx` are Server Components. Client islands: `ResetPasswordForm.tsx`, `SetNewPasswordForm.tsx` (form state). `recoveryReady` computed server-side via `isRecoverySessionReady()` — **not** `getCurrentUser()` (`lib/auth/recovery-session.ts:16-28`). |
| PrimeReact-first | **PASS** | Request: `InputText`, `Button`, `Message` (`ResetPasswordForm.tsx:4-6,205-230`). Set-password: `Password`, `Button`, `Message` (`SetNewPasswordForm.tsx:5-7,231-282`). Reuses `CheckEmailView` / `AuthShell`. |
| Loading / empty / error / pending | **PASS** | Submit pending/disabled (`ResetPasswordForm.tsx:226-230`; `SetNewPasswordForm.tsx:278-282`). Validation + form `Message`. Check-email success state. Invalid-token empty/error for missing cookie. Passwords cleared after submit (`SetNewPasswordForm.tsx:159-161,209-211`). |
| Supabase Auth behind Next.js; no SDK/tokens/keys in the browser; httpOnly session | **PASS** | `@supabase/ssr` / `@supabase/supabase-js` only in server modules. Forms call Server Actions only. Anon key is not `NEXT_PUBLIC_` (`supabase-cookie.ts:12-15`). `.next/static` grep: clean. |
| `neuramark_` prefix | **PASS** | Reuses `neuramark_auth_attempts` + `password_reset_request`. No new tables, enums, indexes, or RLS policies. |
| `getCurrentUser()` still hardcoded until US-14.5 | **PASS** | `lib/auth/get-current-user.ts:17-40` — `gaveho@gmail.com` / `Gabriel Vega`. Set-password gates on cookie `getUser()`, not the identity seam. |
| Backend endpoints map to a concrete FE consumer | **PASS** | `requestPasswordReset` → `/reset-password`. `GET /auth/callback/recovery` → email link. `setNewPassword` → `/reset-password/new`. No speculative reset HTTP API. |
| US-14.5 guards / spend / identity swap out of scope | **PASS** | Not implemented here. |
| US-14.3 logout UI out of scope | **PASS** | Global sign-out on success only; no header logout control. |

**Build:** `npm run build` — compiled, types valid. New routes: `ƒ /reset-password`, `ƒ /reset-password/new`, `ƒ /auth/callback/recovery`. Path A `ƒ /auth/callback` retained.

---

### Frozen contract match

| Freeze | Status |
|--------|--------|
| Two Server Actions + one recovery Route Handler; no browser Supabase | **PASS** |
| `GET /auth/callback/recovery`; `emailRedirectTo` not `/auth/callback` | **PASS** (`site-origin.ts:50-53`; `recovery/route.ts`) |
| Exchange: `verifyOtp` (`token_hash`+`type=recovery`) or PKCE `code` on user-scoped client | **PASS** (`recovery/route.ts:57-110`) |
| Success 302 `/reset-password/new`; failure `/reset-password/new?error=invalid` | **PASS** |
| Path A: remove `recovery` from OTP allowlist; forward without consuming | **PASS** (`callback/route.ts:19-25,53-79`) |
| Request-reset `{ ok: true }` for known and unknown; 429 `messageKey: "auth.reset.checkEmail"` | **PASS** (`errors.ts:38-41`) |
| Set-password `{ ok: true, redirectTo: "/login?reset=1" }` | **PASS** (`set-new-password.ts:29,104-107`; `lib/contracts/auth.ts:201-204`) |
| `RECOVERY_INVALID` + `auth.reset.invalidToken`; `recoveryReady: boolean` from Server Component | **PASS** |
| FE: check-email inline on `/reset-password` including 429; login `?reset=1` banner | **PASS** (`ResetPasswordForm.tsx:128-130,174-187`; `login/page.tsx:38-40`) |
| Cookie flags match login; service-role `persistSession: false`; no product 302 | **PASS** |
| OTP ≤ 1 hour documented as ops (CONTRACT + `.env.example`) | **PASS** (documentation only — see Notes) |
| Shared `validatePassword`; forbidden keys; `confirmPassword` off the wire | **PASS** |
| FE signoff 2026-08-28 honored (no contract drift) | **PASS** |

---

### Gaps (what blocks PASS)

None. No FAIL criteria.

---

### Scope Creep

None that violates the story. In-contract extras:

- Check-email **resend** reuses signup `CheckEmailView` (`ResetPasswordForm.tsx:149-172,177-187`) — still enumeration-safe (`RATE_LIMITED` → same check-email).
- `next.config.ts` headers for `/reset-password/new` (`Referrer-Policy`, `Cache-Control: no-store`) — required by CONTRACT.

No second forgot-password URL, no product 302s, no `getCurrentUser()` swap, no logout UI, no `active`/`role` writes, no new `neuramark_auth_action` value.

---

### Notes (do not block PASS)

1. **OTP ≤ 1 hour** is Supabase Auth project config, not app code. Documented in `CONTRACT.md` and `.env.example:26-29`. Instruction: NOTE, do not fail.
2. **Live inbox E2E** (email delivery, single-use click, old password rejected at `logIn`) was not exercised. Static path is complete.
3. **US-14.5** leftover recovery cookie + hardcoded `getCurrentUser()` can still render product pages on **navigation**. This flow does not **redirect** there. Sanctioned.
4. **US-14.3** logout UI not shipped. Global sign-out on successful reset **is** shipped.
5. **Rate-limit tightness:** record-then-count with `>= 3` / `>= 10` can 429 the Nth attempt (same as US-14.1 resend). Still max 3/email/hour and 10/IP/hour.
6. **`resetPasswordForEmail` uses the service-role server client** (`request-password-reset.ts:69-70`; `persistSession: false`). CONTRACT table says service-role is for attempts writes; SECURITY forbids service-role `verifyOtp` / cookie minting — those constraints hold. Errors are absorbed; no cookies minted.
7. **TASKS.md** still has the carry-forward “Login already links here” unchecked; `LoginForm.tsx:292-295` implements `/reset-password?locale=`. Tracking nit only.

---

### Recommended Next Actions (and which agent should take them)

1. **product-owner** — On PASS, tick US-14.4 acceptance criteria in `plan/USER_STORIES.md`. Do not change implementation.
2. **qa-engineer** — Author `plan/stories/US-14.4/QA.md`. Prove (or explicitly defer) live inbox: request-reset known vs unknown, 429 check-email copy, recovery callback vs Path A, set-password once, login with new password / old rejected.
3. **No implementer fix.** Do not commit from this validation pass.
