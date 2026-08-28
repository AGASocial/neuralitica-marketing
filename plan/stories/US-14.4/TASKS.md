# US-14.4 — Reset forgotten password

**Priority:** P0  
**Depends on:** US-14.1 ✅ (password policy, `neuramark_clients`, `neuramark_auth_attempts`, `password_reset_request` on `neuramark_auth_action`, `SITE_URL`, generic known/unknown responses) · US-14.2 ✅ (login link to `/reset-password`, callback Path A, cookie adapter)  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-14.4 (source of truth — do not redefine)  
**Implementers:** nextjs-backend + nextjs-frontend (`docs/development/AGENT-ROSTER.md`; auth is not a domain specialist)

## Out of scope (do not implement here)

- **US-14.5:** `getCurrentUser()` session swap; every-request `active` / spend / route guards; RLS policies; deny-by-default middleware. A successful reset grants **credential access only**, never product access. Do not swap identity or add spend guards here.
- **US-14.3:** Logout UI (header/user menu). This story **does** revoke all sessions server-side on a successful reset (global sign-out). It does **not** ship a logout control.
- No admin/activation UI. Reset must **never** `UPDATE neuramark_clients.active` (or `role`).
- No new identity helper for product pages. Recovery session exists only to authorize set-password; do not 302 to `/dashboard` or any product route from this flow.
- Do not change confirmation Path A landings (`/login?confirmed=1` / `/login?error=confirmation`) for `type=signup` / `type=email`.

## Carry-forwards (in scope)

From US-14.1 and US-14.2 (reuse, do not fork):

- [ ] **Shared password policy** — `lib/auth/password-policy.ts` (`validatePassword`, 12–128, common-password denylist). Set-password is server-authoritative; client length/match hints are presentation only.
- [ ] **`neuramark_auth_attempts`** — rate-limit reset **requests** with existing enum value **`password_reset_request`** (already on `neuramark_auth_action` from US-14.1). Extend `lib/auth/rate-limit.ts` the same way resend confirmation does (3/email/hour + 10/IP/hour, fail closed). **No new enum value** unless SECURITY/CONTRACT later require a distinct set-password audit action (see DB).
- [ ] **Enumeration** — same status, body shape, and copy for known and unknown emails. Absorb Supabase “user not found” server-side. No app-introduced timing branch (always invoke the recovery-email call; no early return on missing user). Mirror `resendConfirmationEmail`.
- [ ] **`SITE_URL`** — server-only allowlisted origin for recovery `emailRedirectTo` (reuse / extend `getSignupEmailRedirectTo()` pattern in `lib/auth/send-signup-confirmation.ts`). Do not build redirects from `Host` / `X-Forwarded-Host`. If `SITE_URL` is unset, do not fall through to an open redirect. Add the recovery callback path to the Supabase Auth redirect allowlist (document in `.env.example`).
- [ ] **Cookie adapter** — `lib/auth/supabase-cookie.ts` (`HttpOnly`, `Secure` in production, `SameSite=Lax`, `Path=/`). Recovery exchange uses the user-scoped cookie client; service-role client stays `persistSession: false`.
- [ ] **Login already links here** — `LoginForm` → `/reset-password?locale=`. Implement that route; do not leave a 404. Do not invent a second forgot-password URL.
- [ ] **Callback Path A must not consume recovery tokens as confirmation** — today’s `GET /auth/callback` allowlists `type=recovery` and then **drops** the session and 302s to `/login?confirmed=1`. A recovery link that hits Path A would burn a single-use token. CONTRACT freezes either a **dedicated recovery callback** (preferred) or an explicit `type=recovery` branch that does **not** follow Path A. Signup/email Path A stays frozen.

## FE checklist

Consumers of BE: forgot-password page calls the request-reset Server Action; set-new-password page calls the set-password Server Action. Emailed link hits the recovery Route Handler (not Client Component JS). Wrap with existing `AuthShell` / locale switcher.

- [ ] Forgot-password page at **`/reset-password`** (login already points here): PrimeReact email field; wrap with `AuthShell`; submit pending / loading / disabled submit
- [ ] After request: **generic “check your email”** screen (same copy for known and unknown). No “account not found”, no “email sent to X” that differs by existence. Optional: stay on the same route with a success state, or a sibling route — freeze in CONTRACT; do not leak whether the email exists
- [ ] Set-new-password page reached **after** the Route Handler exchange (token **not** in the page URL, not in client JS): PrimeReact **password + confirm**; client-side match is UX only (`confirmPassword` stays off the wire, same as signup)
- [ ] Expired / invalid / already-used token: **clear error** plus a **retry path** back to `/reset-password` to request a new link (EN/ES). Do not echo Supabase error text
- [ ] Set-password page (and recovery callback 302 target) send **`Referrer-Policy: no-referrer`** so a token URL cannot leak via `Referer`
- [ ] On successful set-password: land on **login** (user signs in with the new password). Do not send the user to dashboard/pending from this story — landing after login remains US-14.2
- [ ] Links: back to login (`/login?locale=`); login’s “Forgot your password?” already targets this page
- [ ] EN + ES copy in `messages/en.json` and `messages/es.json` (request form, check-email, set-password, mismatch, expired/invalid token, retry, password-policy hints). Reuse `auth.errors.*` / `auth.passwordPolicy.*` where they fit
- [ ] Failure, loading, and pending states covered; clear password fields from client state after submit (signup/login pattern)
- [ ] No Supabase SDK, tokens, or keys in the client bundle; forms call Server Actions only. Do not read `token_hash`, `code`, or `type` in Client Components
- [ ] PrimeReact before custom UI; keep `"use client"` on the forms only

## BE checklist

Concrete FE consumers: forgot-password form on `app/(auth)/reset-password/`; set-password form on the post-exchange page. Callback consumer: recovery email link (`emailRedirectTo` = `{SITE_URL}` + frozen recovery path).

- [ ] **Request-reset Server Action** wrapping Supabase Auth recovery email (`resetPasswordForEmail` or equivalent) **server-side**. Always return the **same generic success** for known and unknown emails. Absorb “user not found” (and equivalent) server-side
- [ ] No app timing oracle: the Supabase recovery call **runs** for every well-formed request that is not rate-limited; no early return on “user not found” / unconfirmed / inactive
- [ ] **Same flow** for active, inactive, and unconfirmed accounts — no branch on `neuramark_clients.active` or confirmation status that the client can observe. Do **not** write `active` or `role`
- [ ] Recovery `emailRedirectTo` uses **server-only `SITE_URL`** (allowlisted origin) pointing at the recovery Route Handler. Never copy request `Host` into the email link
- [ ] **Route Handler** that exchanges the recovery token **server-side** (`token_hash` + `type=recovery` via `verifyOtp`, and/or PKCE `code` via `exchangeCodeForSession` — freeze Path A-equivalent in CONTRACT). Token / `code` / `token_hash` **never** reach client JS, **never** logged, **never** copied into `Location`, HTML, or JSON. 302 to the set-password page **without** the token in the query
- [ ] Confirmation **`GET /auth/callback` Path A stays frozen** for signup/email. Recovery must **not** 302 to `/login?confirmed=1` or burn the token as a confirmation. Prefer a dedicated recovery path (e.g. `/auth/reset-callback`) so Path A does not share landings with reset
- [ ] Invalid / expired / used recovery token: 302 to the set-password **error** state (retry to request a new link). One generic failure for missing, expired, used, and provider `error` / `error_description`. Expire any `sb-*` cookies on failure
- [ ] If the exchange sets a session cookie, use the same flags as login (`HttpOnly`, `Secure` in production, `SameSite=Lax`, `Path=/`, host-only). That session authorizes **set-password only** — do not 302 to `/dashboard` or product routes. After success, it must not survive (global sign-out)
- [ ] **Set-password Server Action:** validate recovery session server-side; enforce **`validatePassword`** (US-14.1 module); apply new password via Supabase Auth; token is single-use and invalidated by the password change. CSRF: Server Action origin check (same as `signUp` / `logIn`)
- [ ] **Global sign-out on success** — revoke all other sessions for that user (`signOut({ scope: "global" })` or equivalent refresh-token revocation) so a stolen session does not survive recovery. Then clear cookies. User must log in with the new password (US-14.2)
- [ ] Passwords never logged or echoed; reuse `redactAuthPayload` (or equivalent). `confirmPassword` forbidden on the wire
- [ ] Forbidden keys (`role`, `active`, `auth_user_id`, `client_id`, …): reject or strip before processing (extend `forbidden-fields.ts`). `role` / `active` are not on the reset contract
- [ ] Rate limits on **request-reset**: max **3 per email per hour** AND max **10 per IP per hour**, tracked in `neuramark_auth_attempts` with action **`password_reset_request`**. Over-limit still returns the **generic check-email copy** with **429**. Fail closed if the attempts store errors. Keep Supabase Auth rate limits as the second layer. Record the attempt for every submitted email (known or unknown) so 429 vs 200 is not an existence oracle
- [ ] Reuse `lib/auth/rate-limit.ts`, `get-client-ip.ts`, `hash.ts`, `errors.ts`. Add `isPasswordResetRateLimited` (or equivalent) rather than a new store — same shape as `isResendConfirmationRateLimited`
- [ ] Recovery tokens **single-use** and expire **within 1 hour** (Supabase Auth OTP expiry configured accordingly — document as ops/config in CONTRACT; not an app table). Used or expired token cannot set a password; outstanding recovery tokens are invalidated when the password changes
- [ ] Top-level try/catch → generic internal error (no Supabase text to the client)
- [ ] After a successful reset the **old password no longer works**; login with the new password succeeds (proven against US-14.2 `logIn`, not a new login path)

## DB checklist

No new product tables. Recovery tokens are owned by **Supabase Auth**. Rate limits **reuse** `neuramark_auth_attempts`.

- [ ] **No new tables or columns** for the happy path
- [ ] Reuse existing enum value **`password_reset_request`** on `public.neuramark_auth_action` (created in US-14.1, reserved for this story). Hash IP and email as today (HMAC); never store plaintext password, raw IP, plaintext email, or recovery tokens in `neuramark_*`
- [ ] **No new `password_reset` enum value by default.** Request windows are fully served by `password_reset_request`. Set-password is token-gated (single-use / 1-hour OTP), not a second attempt counter. **Only if** SECURITY/CONTRACT later require an audit or rate-limit row for set-password attempts: add a value via Supabase migration `ALTER TYPE public.neuramark_auth_action ADD VALUE '…'` (`neuramark_` prefix). Do not add `login_success`-style noise
- [ ] Existing indexes (`neuramark_auth_attempts_ip_action_time_idx`, `neuramark_auth_attempts_email_action_time_idx`) cover 3/email/hour and 10/IP/hour lookups — confirm in CONTRACT; do not invent extra objects unless measured
- [ ] RLS stays deny-by-default on `neuramark_auth_attempts` / `neuramark_clients` (no new policies — US-14.5). Writes use the server/service-role client only
- [ ] **No app UPDATE** on `neuramark_clients.active` or `role`. Reset does not create or delete client rows
- [ ] OTP expiry (≤ 1 hour) is **Supabase Auth project config**, not a `neuramark_` migration

## Gates (orchestrator)

- [ ] SPEC-REVIEW.md
- [ ] SECURITY.md
- [ ] CONTRACT.md + FE signoff
- [ ] VALIDATION.md
- [ ] QA.md
