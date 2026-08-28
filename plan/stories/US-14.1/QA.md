# QA Report — US-14.1

**Story:** Sign up with email and password  
**Reviewer:** qa-engineer  
**Date:** 2026-08-28  
**Branch:** `feature/US-14.1-signup`  
**Standard:** Enterprise-grade (production-safe for paying customers)

### Verdict: BLOCK

One **High** finding: signup responses diverge for new vs existing emails whenever confirmation email sending fails, which is a user-enumeration oracle. A fix loop is required (**nextjs-backend**).

No Critical findings. Client bundle is clean (no Supabase SDK/keys). CSRF, session-fixation, password-in-DB, and `role`/`active` from the request are in good shape. `getCurrentUser()` hardcoded local user is sanctioned (not a finding). Email confirmation callback and spend guard remain deferred.

---

### Findings

#### High

1. **User enumeration via email-send failure vs duplicate success**  
   **Where:** `lib/auth/actions/sign-up.ts:74-76` (duplicate → `{ ok: true }`) vs `lib/auth/actions/sign-up.ts:119-133` (new user, `sendSignupConfirmationEmail` fails → compensate-delete + `INTERNAL_ERROR`)  
   **What:** Duplicate emails never attempt to send mail and always return generic success. A *new* email that passes `createUser` + client insert returns `INTERNAL_ERROR` if `auth.resend` fails (SMTP, captcha, or `emailRedirectTo` not on the Supabase allowlist).  
   **Why it matters:** An attacker who can make confirmation sending fail (or who simply hits an environment where it already fails) gets a content oracle: `INTERNAL_ERROR` ⇒ email was not registered; `{ ok: true }` ⇒ email already exists. That is the binding [SEC] enumeration control. `.env.example` does not document `SITE_URL` / `NEXT_PUBLIC_SITE_URL`; `getSignupEmailRedirectTo()` (`lib/auth/send-signup-confirmation.ts:7-18`) falls back to `VERCEL_URL`, which is often *not* in the redirect allowlist — so this oracle is likely in default Vercel deploys, not only a theoretical SMTP outage. Rolling back the user on send failure also makes the new-email path fail closed while the duplicate path stays success-shaped.  
   **Fix direction (nextjs-backend):** Both paths must use the same client-visible outcome. Preferred: on send failure, **keep** the auth user + `neuramark_clients` row, log the failure, return `{ ok: true }`, and let resend recover (this matches `resendConfirmationEmail`, which already ignores send errors at `lib/auth/actions/resend-confirmation.ts:62-64`). Do not map send failure to `INTERNAL_ERROR` unless the duplicate path does the same. Document `SITE_URL` (or `NEXT_PUBLIC_SITE_URL`) in `.env.example` and require it in the Supabase redirect allowlist. Consider `auth.admin.generateLink({ type: "signup" })` if `auth.resend` after `admin.createUser` proves unreliable.

#### Medium

2. **Rate limiter fails open**  
   **Where:** `lib/auth/rate-limit.ts:34-38` (insert error swallowed), `lib/auth/rate-limit.ts:66-71` (`countAttempts` returns `0` on error)  
   **What:** If `neuramark_auth_attempts` cannot be written or counted, signup and resend proceed with no app-level cap. Check happens *after* record, using `>= 5` / `>= 15` / `>= 3` (`rate-limit.ts:95`, `rate-limit.ts:111`), so even the healthy path is one attempt tighter than the written max (effective 4/hour and 14/day signup; 2/hour resend) — safer, not a defect. Concurrent requests are also racy (insert then count, no lock).  
   **Why it matters:** Binding [SEC] rate limits (5/IP/hour, 15/IP/day signup; 3/email/hour resend) disappear under store errors. Auth rate limits should fail closed.  
   **Fix direction (nextjs-backend):** On record/count failure, return `rateLimitedError()` (or `internalError()` with the same generic copy). Optionally count *before* insert with `> 5` / `> 15` to match the written caps, and document the TOCTOU residual.

3. **All HTTP 422 responses treated as “user already exists”**  
   **Where:** `lib/auth/supabase-auth-errors.ts:18-21` (`error.status === 422`)  
   **What:** Duplicate detection matches `email_exists` / `user_already_exists` (good) *and* any 422. GoTrue also uses 422 for `weak_password` (leaked-password protection) and some validation failures. Those become `{ ok: true }` with **no** `neuramark_clients` row.  
   **Why it matters:** Core signup can silently no-op: the UI shows “check your email” but no account exists. Enumeration-safe, but breaks the happy path when Supabase password checks are stricter than the local policy.  
   **Fix direction (nextjs-backend):** Match duplicate only on known codes/messages (`email_exists`, `user_already_exists`, “already registered”). Map `weak_password` to `PASSWORD_POLICY` (or generic `INTERNAL_ERROR` if you must not distinguish). Never use bare `status === 422`.

4. **Duplicate short-circuit does not complete compensated creation**  
   **Where:** `lib/auth/actions/sign-up.ts:74-76`; missing-id path `sign-up.ts:87-91` (no `deleteUser`)  
   **What:** If `createUser` succeeds and the process dies before the client insert (timeout, missing `user.id`, deploy kill), retry hits duplicate and returns success **without** inserting `neuramark_clients` or sending mail. Binding [SEC] requires transactional or compensated auth-user + client-row creation with no orphans.  
   **Why it matters:** Stuck identity: `auth.users` row, no client row, US-14.2 login will have nothing to load. Resend may still email, which does not repair the profile row.  
   **Fix direction (nextjs-backend):** On duplicate, look up `neuramark_clients` by email/`auth_user_id` server-side; if missing, insert from the existing auth user (still return `{ ok: true }` either way). On missing `user.id` after create, compensate with delete. Do not echo lookup results to the client.

5. **New PII tables have no RLS**  
   **Where:** `supabase/migrations/20260828120000_neuramark_auth_signup.sql` (tables at L13 and L42; no `ENABLE ROW LEVEL SECURITY`, no policies)  
   **What:** `neuramark_clients` (email, display_name) and `neuramark_auth_attempts` (HMAC hashes) are in `public` with default Supabase grants to `anon` / `authenticated`. This app does not ship the anon key (not a client-bundle leak), but every project still has one. SECURITY.md defers *ownership policies* to US-14.5; it does not require leaving RLS off.  
   **Why it matters:** Anyone with project URL + anon key can read/write signup PII via PostgREST. Service role bypasses RLS, so `ENABLE ROW LEVEL SECURITY` with zero policies is deny-by-default for anon and compatible with later US-14.5 policies.  
   **Fix direction (nextjs-backend / DB):** In this migration (or a follow-up in the same story), `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on both tables. Add `anon`/`authenticated` policies only in US-14.5 if needed.

6. **Confirmation `emailRedirectTo` is undocumented and can fail closed into finding 1**  
   **Where:** `lib/auth/send-signup-confirmation.ts:7-18`; `.env.example` (no `SITE_URL` / `NEXT_PUBLIC_SITE_URL`)  
   **What:** Redirect target is `NEXT_PUBLIC_SITE_URL` ?? `SITE_URL` ?? `https://$VERCEL_URL` + `/auth/callback`. Callback itself is correctly deferred to US-14.2; the problem is using an unallowlisted URL as `emailRedirectTo` so `resend` errors.  
   **Why it matters:** Turns a missing env var into “all new signups INTERNAL_ERROR” and activates the High enumeration oracle.  
   **Fix direction (nextjs-backend):** Add `SITE_URL` to `.env.example` and README; prefer a server-only `SITE_URL`; treat missing/invalid redirect as a logged warning rather than a rollback (see finding 1). `/auth/callback` 404 after verify remains US-14.2, not a blocker here.

#### Low

7. **Validation / password-policy failures are not recorded in `neuramark_auth_attempts`**  
   **Where:** `lib/auth/actions/sign-up.ts:33-43` (return before `recordAuthAttempt` at L52)  
   **What:** SECURITY.md asked to record attempts even on validation failure to prevent policy-oracle probing. AC for *signup* limits is still met for real create attempts.  
   **Fix direction:** Record (or at least IP-count) before returning `VALIDATION_ERROR` / `PASSWORD_POLICY`, still with generic bodies.

8. **Server Actions have no top-level try/catch**  
   **Where:** `lib/auth/actions/sign-up.ts` and `lib/auth/actions/resend-confirmation.ts` (no envelope around `createUser` / network throws)  
   **What:** Unexpected throws skip `authErrorEnvelope`. Production Next.js 15 typically returns a digest only; dev can surface Supabase messages (including duplicate text).  
   **Fix direction:** Wrap handlers; return `internalError()`; never log or rethrow raw auth errors with passwords.

9. **Password remains in React state after success**  
   **Where:** `components/auth/SignupForm.tsx:200-202` (sets `submittedEmail`, does not clear `fields.password`)  
   **What:** SECURITY.md FE pattern: clear form state after submit. In-memory only; CheckEmailView stays mounted on the same component.  
   **Fix direction (nextjs-frontend):** Zero `password` / `confirmPassword` (and optionally the rest) when navigating to the check-email view.

10. **Forbidden-key check is case-sensitive**  
    **Where:** `lib/auth/forbidden-fields.ts:3-12`  
    **What:** `Role` / `Active` are not in the set; `.strict()` still rejects them as `VALIDATION_ERROR` and they are never written. Harmless.  
    **Fix direction:** Case-fold keys in the forbidden check, or keep as-is.

11. **Lint: unused `copy` parameter**  
    **Where:** `components/auth/SignupForm.tsx:81` (`resolveAuthErrorMessage`)  
    **What:** `next lint` warning `@typescript-eslint/no-unused-vars`. Does not affect security.  
    **Fix direction (nextjs-frontend):** Drop the unused arg.

12. **Resend is not IP-capped**  
    **Where:** `lib/auth/rate-limit.ts:98-112`; `resend-confirmation.ts:50-58`  
    **What:** Contract only requires 3/email/hour. One IP can insert unbounded `neuramark_auth_attempts` rows across many addresses. Signup *is* IP-capped. Residual resource exhaustion; not a contract miss.  
    **Fix direction:** Add an IP window (e.g. aligned with US-14.4 reset: 10/IP/hour) in addition to the email cap.

13. **`/pending` echoes an unauthenticated `email` query param**  
    **Where:** `app/(auth)/pending/page.tsx:15`  
    **What:** Displays whatever `?email=` is supplied (React-escaped, no XSS). Does not read the database. Scaffold for US-14.2; do not later treat this param as proof of identity.  
    **Fix direction (US-14.2):** After login, pass email from the session only.

---

### Auth-specific checklist

| Control | Result |
|---------|--------|
| Supabase tokens / SDK in the browser | **Pass** — `@supabase/supabase-js` only in `lib/supabase/server.ts` (`import "server-only"`) + type import in `send-signup-confirmation.ts`. Client components call Server Actions only. Post-build grep of `.next/static`: no `@supabase`, `NEXT_PUBLIC_SUPABASE`, service-role JWT, or denylist. |
| Rate limits present | **Implemented, with Medium gaps** — table + HMAC hashes exist; fail-open and TOCTOU (findings 2, 12). |
| User enumeration | **Fail (High)** — finding 1 when send fails. Duplicate happy path and resend-unknown are otherwise generic `{ ok: true }`. Copy is neutral (`auth.signup.success` / `auth.signup.resendSuccess`). |
| Session fixation | **Pass** — no session cookie; `persistSession: false`; `admin.createUser` only. |
| CSRF | **Pass** — `"use server"` actions, no signup `route.ts`. Next.js 15 origin check; `next.config.ts` does not widen `allowedOrigins`. |
| Passwords in logs / `neuramark_` tables | **Pass** — `redactAuthPayload` used on createUser failure logs; no password column; plaintext only in request → `createUser`. |
| `role` / `active` / `auth_user_id` from request | **Pass** — forbidden-key reject; insert omits those columns (DB defaults `active=false`, `role=client`); enum `neuramark_client_role`. |
| New spend endpoints for inactive accounts | **Pass** — signup creates auth user + one client row only. US-14.5 guard still deferred (not a finding). |
| Extra hardcoded credentials | **Pass** — only sanctioned `gaveho@gmail.com` / Gabriel Vega in `getCurrentUser()`. |
| `neuramark_` prefix | **Pass** — enums, tables, indexes, constraints. |
| Parameterized data access | **Pass** — Supabase client only; no string-built SQL. |

---

### Checks Run

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | **Pass** (exit 0) |
| `npm run lint` | **Pass with 1 warning** — `SignupForm.tsx:81` unused `copy` (`@typescript-eslint/no-unused-vars`). Note: `next.config.ts` has `eslint.ignoreDuringBuilds: true`, so lint is not part of `next build`. |
| `npm run build` | **Pass** — compiled, type-check during build passed, routes: `/signup`, `/pending` dynamic. |
| Existing tests | **None** — `package.json` has no `test` script; no `*.test.*` / `*.spec.*` files. |
| Client-bundle grep (`.next/static`) | **Pass** — no `@supabase`, `supabase-js`, `NEXT_PUBLIC_SUPABASE`, `SUPABASE_SERVICE_ROLE`, `SUPABASE_URL`, `gaveho@gmail`, denylist contents, or JWT-shaped secrets. |
| Denylist | Tracked `lib/auth/data/common-passwords.json`; **1,369** entries; includes contract fixture `password1234`; happy-path `correct-horse-battery-staple-2026` not listed. |
| EN/ES `auth.*` key parity | **Pass** — 34 keys each, no mismatches. |
| `git ls-files lib/auth/data/common-passwords.json` | Tracked. |

---

### What Was Not Covered

- **Runtime signup** against a live Supabase project (inbox delivery, `admin.createUser` + `auth.resend` behavior, unique-violation `23505` path).
- **Email confirmation click** — `/auth/callback` does not exist; deferred to US-14.2. Not scored as a US-14.1 functional miss.
- **Timing side channels** (duplicate vs new duration) — not measured; content oracle in finding 1 is the blocker.
- **Concurrent burst** of signup to prove TOCTOU empirically.
- **US-14.5 `active` spend guard** and `getCurrentUser()` session swap — deferred; hardcoded operator on `/dashboard` is sanctioned.
- **PostgREST-with-anon-key exploit** of missing RLS — not executed (would need project URL + anon key from outside this app).
- **Browser E2E** of the signup form (pending/loading/error). Static review of `SignupForm` / `CheckEmailView` only.

---

### Fix loop

**Required:** yes.  
**Implementer:** **nextjs-backend** (finding 1 must be fixed to unblock; 2–6 should be addressed in the same pass). **nextjs-frontend** for Lows 9 and 11 only — not blocking.

**Counts:** Critical **0** / High **1** / Medium **5** / Low **7**
