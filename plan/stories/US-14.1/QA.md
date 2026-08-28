# QA Report — US-14.1

**Story:** Sign up with email and password  
**Reviewer:** qa-engineer (re-audit after BLOCK fix loop)  
**Date:** 2026-08-28  
**Branch:** `feature/US-14.1-signup`  
**Fix commit:** `66a5124431f73f08fcb06d7d6f440deeb35730c2`  
**Standard:** Enterprise-grade (production-safe for paying customers)

### Verdict: APPROVE WITH CONDITIONS

No Critical or High findings. The prior enumeration oracle is closed: confirmation-send failure and duplicate signup both return client-visible `{ ok: true }`. Rate-limit store errors fail closed. Duplicate detection no longer treats bare HTTP 422 as “already exists.” RLS is enabled with zero policies. `findAuthUserIdByEmail` is server-only and never appears in the action result.

Remaining issues are **Low** (frontend password-clear / unused `copy`, plus deferred `/pending` query-param echo and two residual hardening notes from the fix). **No further backend fix loop is required.** Frontend Lows 9 and 11 may be picked up by **nextjs-frontend** later; they must not BLOCK.

---

### Prior findings — verification

Do not trust the implementer; each assigned-closed item was re-read at file:line.

| # | Prior | Assigned | Status | Evidence |
|---|--------|----------|--------|----------|
| 1 | High — send-failure vs duplicate oracle | nextjs-backend | **Closed** | Send failure keeps the auth user + client row and still returns success (`lib/auth/actions/sign-up.ts:230-237`). Duplicate path also returns `authSuccess()` (`sign-up.ts:175-181`). Resend ignores send errors and always returns success (`lib/auth/actions/resend-confirmation.ts:66-68`). |
| 2 | Medium — rate limiter fails open | nextjs-backend | **Closed** | `recordAuthAttempt` returns `false` on insert error (`lib/auth/rate-limit.ts:39-52`). `countAttempts` returns `null` on error (`rate-limit.ts:82-95`). Signup/resend treat null/false as limited (`rate-limit.ts:122-123`, `160-161`; `sign-up.ts:55-57`; `resend-confirmation.ts:56-58`). |
| 3 | Medium — bare 422 as duplicate | nextjs-backend | **Closed** | `isDuplicateAuthError` matches codes/messages only — no `status === 422` (`lib/auth/supabase-auth-errors.ts:18-33`). `weak_password` maps to `PASSWORD_POLICY` (`supabase-auth-errors.ts:37-50`; `sign-up.ts:184-186`). |
| 4 | Medium — duplicate path skips compensated create | nextjs-backend | **Closed** | Duplicate path backfills a missing `neuramark_clients` row (`sign-up.ts:66-113`, called at `175-181`). Lookup/insert failures are swallowed; the client still gets `{ ok: true }`. Missing `user.id` is success-shaped to avoid a new oracle (`sign-up.ts:196-201`); retry hits the duplicate backfill. |
| 5 | Medium — no RLS on PII tables | nextjs-backend | **Closed** | `supabase/migrations/20260828140000_neuramark_auth_signup_rls.sql:5-6` enables RLS on `neuramark_clients` and `neuramark_auth_attempts`. No `CREATE POLICY` (deny-by-default for `anon`/`authenticated`; service role bypasses). |
| 6 | Medium — undocumented `emailRedirectTo` | nextjs-backend | **Closed** | Server-only `SITE_URL` documented in `.env.example:20-23`. `getSignupEmailRedirectTo()` prefers `SITE_URL`, warns on `VERCEL_URL` fallback, omits redirect if unset (`lib/auth/send-signup-confirmation.ts:7-40`). Send failure no longer rolls back into finding 1. |
| 7 | Low — validation not recorded | nextjs-backend | **Closed** | Validation and password-policy failures record an attempt when Supabase is configured (`sign-up.ts:125-146`). |
| 8 | Low — no top-level try/catch | nextjs-backend | **Closed** | `signUp` (`sign-up.ts:240-250`) and `resendConfirmationEmail` (`resend-confirmation.ts:71-86`) wrap inner handlers and return `internalError()`. |
| 9 | Low — password remains in React state | nextjs-frontend (not in this loop) | **Open** | See Findings. |
| 10 | Low — forbidden-key check case-sensitive | nextjs-backend | **Closed** | Keys are lower-cased before set membership (`lib/auth/forbidden-fields.ts:3-13`, `16-24`, `35`). |
| 11 | Low — unused `copy` arg | nextjs-frontend (not in this loop) | **Open** | See Findings. |
| 12 | Low — resend not IP-capped | nextjs-backend | **Closed** | Resend is 3/email/hour **and** 10/IP/hour (`lib/auth/rate-limit.ts:133-164`). |
| 13 | Low — `/pending` echoes `?email=` | US-14.2 | **Open (deferred)** | See Findings. |

---

### Findings

No Critical. No High. No Medium.

#### Low

1. **Password remains in React state after success** *(prior #9; not in this fix loop)*  
   **Where:** `components/auth/SignupForm.tsx:200-202`  
   **What:** On `{ ok: true }` the form sets `submittedEmail` and returns; `fields.password` / `confirmPassword` are not cleared. `CheckEmailView` replaces the form in the same mounted component, so the plaintext password stays in memory until unmount.  
   **Why it matters:** SECURITY.md FE pattern is to clear form state after submit. In-memory only; not written to storage or the URL.  
   **Fix direction (nextjs-frontend):** Zero password fields (and optionally the rest) when navigating to the check-email view.

2. **Lint: unused `copy` parameter** *(prior #11; not in this fix loop)*  
   **Where:** `components/auth/SignupForm.tsx:81` (`resolveAuthErrorMessage`)  
   **What:** `next lint` warning `@typescript-eslint/no-unused-vars`. Does not affect security.  
   **Fix direction (nextjs-frontend):** Drop the unused argument.

3. **`/pending` echoes an unauthenticated `email` query param** *(prior #13; deferred)*  
   **Where:** `app/(auth)/pending/page.tsx:15`  
   **What:** Displays whatever `?email=` is supplied (React-escaped, no XSS). Does not read the database. Scaffold for US-14.2.  
   **Fix direction (US-14.2):** After login, pass email from the session only. Do not treat this param as proof of identity.

4. **Duplicate backfill writes the current request’s `display_name` / `preferred_locale` onto an orphan profile**  
   **Where:** `lib/auth/actions/sign-up.ts:98-103`  
   **What:** If `createUser` reports duplicate and no `neuramark_clients` row exists, the insert uses `displayName` / `preferredLocale` from **this** request. Legitimate retry by the same person is fine. A third party who knows the email can set the display name only in the orphan case (auth user exists, profile row missing). They cannot set `role`/`active`/`auth_user_id` from the client; those stay DB defaults / looked-up id. The action still returns `{ ok: true }` with no lookup leak (`sign-up.ts:175-181`; `find-auth-user-by-email.ts` is `server-only` and returns `string \| null` only to this helper).  
   **Why it matters:** Limited integrity on a broken-signup repair path, not account takeover or enumeration.  
   **Fix direction (optional, nextjs-backend):** Prefer `user_metadata.display_name` from the existing auth user, or a generic placeholder, instead of the current request body.

5. **Residual: GoTrue `weak_password` vs duplicate can differ for HIBP-only passwords** *(accepted tradeoff of prior #3)*  
   **Where:** `lib/auth/actions/sign-up.ts:174-186`  
   **What:** Duplicate is classified first (`email_exists` / message match) → `{ ok: true }`. `weak_password` on a **new** email → `PASSWORD_POLICY`. Local denylist already rejects the same common passwords for every email **before** `createUser` (`lib/auth/password-policy.ts:22-35`), so this only applies to passwords that pass the bundled list but fail GoTrue leaked-password protection. Mapping to `PASSWORD_POLICY` is what the prior QA asked for; treating it as success was the original Medium (silent no-op).  
   **Why it matters:** A narrow content oracle for that password class. Not scored as High/Medium because it is the prescribed fix, not a regression.  
   **Fix direction (optional):** Expand the local denylist, or if GoTrue leaked-password is enabled, accept that policy failures on create are distinguishable from duplicate success (same class as local `PASSWORD_POLICY`, which is contract-allowed).

---

### Focus checks (this re-audit)

1. **Send-failure and duplicate → same `{ ok: true }`**  
   **Pass.** New-email send failure logs and keeps rows, then `return authSuccess()` (`sign-up.ts:230-237`). Duplicate calls `ensureClientRowForExistingAuthUser` then `return authSuccess()` (`sign-up.ts:175-181`). Missing `user.id` after create is also success-shaped (`sign-up.ts:196-201`) so it cannot revive the oracle.

2. **`find-auth-user-by-email.ts` does not leak existence to the client**  
   **Pass.** Module is `import "server-only"` (`find-auth-user-by-email.ts:1`). Failures return `null` and log only HTTP status (`:46-50`, `:62-64`). Exact email match before returning an id (`:55-61`). Caller never puts the id (or “found/not found”) on `SignUpResult`; duplicate handling always ends in `authSuccess()`.

3. **Rate-limit fail-closed; no bare 422-as-duplicate; RLS with zero policies**  
   **Pass.** See prior findings 2, 3, and 5 above.

4. **New bugs / regressions from the fix**  
   No High/Medium regressions. Duplicate backfill is enumeration-safe. Missing-`user.id` path is success-shaped (correct vs oracle; retry backfills). `weak_password` is no longer swallowed as duplicate success. Residuals are Lows 4–5 above.

---

### Auth-specific checklist

| Control | Result |
|---------|--------|
| Supabase tokens / SDK in the browser | **Pass** — `@supabase/supabase-js` only in `lib/supabase/server.ts` (`import "server-only"`) plus type imports in `sign-up.ts` / `send-signup-confirmation.ts`. Client components call Server Actions only. Post-build grep of `.next/static`: no `@supabase`, `NEXT_PUBLIC_SUPABASE`, service-role JWT, denylist, or `gaveho@gmail`. |
| Rate limits present | **Pass** — signup 5/IP/hour and 15/IP/day; resend 3/email/hour and 10/IP/hour. Store errors fail closed. Residual TOCTOU (insert-then-count, no lock) documented in `rate-limit.ts`; concurrent burst may slip one extra attempt. |
| User enumeration | **Pass** — duplicate, send-failure, missing `user.id`, unique-violation `23505`, unknown-email resend, and backfill miss all return `{ ok: true }`. Copy remains neutral (`auth.signup.success` / `auth.signup.resendSuccess`). Residual Low 5 (HIBP `weak_password` vs duplicate) only. |
| Session fixation | **Pass** — no session cookie; `persistSession: false`; `admin.createUser` only. |
| CSRF | **Pass** — `"use server"` actions; no signup `route.ts`. `next.config.ts` does not widen `allowedOrigins`. |
| Passwords in logs / `neuramark_` tables | **Pass** — `redactAuthPayload` on createUser failure logs; no password column; plaintext only in request → `createUser`. |
| `role` / `active` / `auth_user_id` from request | **Pass** — case-insensitive forbidden-key reject; inserts omit those columns (DB defaults `active=false`, `role=client`). Backfill sets `auth_user_id` from admin lookup only. |
| New spend endpoints for inactive accounts | **Pass** — signup creates auth user + one client row only. US-14.5 guard still deferred. |
| Extra hardcoded credentials | **Pass** — only sanctioned `gaveho@gmail.com` / Gabriel Vega in `getCurrentUser()`. |
| `neuramark_` prefix | **Pass** — enums, tables, indexes, constraints; RLS migration alters prefixed tables only. |
| Parameterized data access | **Pass** — Supabase client / `URLSearchParams` for admin lookup; no string-built SQL. |

---

### Checks Run

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | **Pass** (exit 0) |
| `npm run lint` | **Pass with 1 warning** — `SignupForm.tsx:81` unused `copy` (`@typescript-eslint/no-unused-vars`). `next.config.ts` has `eslint.ignoreDuringBuilds: true`, so lint is not part of `next build`. |
| `npm run build` | **Pass** — compiled; type-check during build passed; routes `/signup` and `/pending` dynamic. |
| Existing tests | **None** — `package.json` has no `test` script; no `*.test.*` / `*.spec.*` files. |
| Client-bundle grep (`.next/static`) | **Pass** — no `@supabase`, `supabase-js`, `NEXT_PUBLIC_SUPABASE`, `SUPABASE_SERVICE_ROLE`, `SUPABASE_URL`, `gaveho@gmail`, `password1234`, `neuramark_clients`, `auth.admin`, or JWT-shaped secrets. |
| Denylist | Tracked `lib/auth/data/common-passwords.json`; **1,369** entries; includes contract fixture `password1234`; happy-path `correct-horse-battery-staple-2026` not listed. |
| EN/ES `auth.*` key parity | **Pass** — 34 keys each, no mismatches. |
| `git ls-files lib/auth/data/common-passwords.json` | Tracked. |
| Fix commit vs tree | `66a5124431f73f08fcb06d7d6f440deeb35730c2` is HEAD for auth files; working tree dirty only on `docs/development/SPRINT-STATE.md` (out of scope). |

---

### What Was Not Covered

- **Runtime signup** against a live Supabase project (inbox delivery, `admin.createUser` + `auth.resend`, GoTrue admin `filter` lookup, unique-violation `23505`, leaked-password `weak_password`).
- **Email confirmation click** — `/auth/callback` does not exist; deferred to US-14.2. Not scored as a US-14.1 functional miss.
- **Timing side channels** (duplicate vs new duration, including extra backfill HTTP) — not measured; content oracle from the prior BLOCK is closed.
- **Concurrent burst** of signup to prove TOCTOU empirically.
- **US-14.5 `active` spend guard** and `getCurrentUser()` session swap — deferred; hardcoded operator on `/dashboard` is sanctioned.
- **PostgREST-with-anon-key** against RLS — not executed (service role bypasses; zero policies should deny `anon`/`authenticated`).
- **Browser E2E** of the signup form (pending/loading/error). Static review of `SignupForm` / `CheckEmailView` only.
- **Applying migration `20260828140000_neuramark_auth_signup_rls.sql`** to a live database — reviewed as SQL only.

---

### Fix loop

**Required:** no.  
**Implementer:** none for merge. Optional **nextjs-frontend** for Lows 1–2 (prior 9 and 11). Optional later hardening for Lows 4–5 (backend). Low 3 stays with US-14.2.

**Counts:** Critical **0** / High **0** / Medium **0** / Low **5**
