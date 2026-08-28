# Validation Report — US-14.1

**Story:** Sign up with email and password  
**Validated:** 2026-08-28 (re-validation after blocker fixes)  
**Validator:** requirements-validator  
**Runtime note:** `npm run build` passes (TypeScript fix applied to email-send compensation in `sign-up.ts`). Migration `neuramark_auth_signup` applied to configured Supabase project. No live signup/email-delivery test run.

---

## Verdict: FAIL

The confirmation-email and TypeScript blockers are **resolved**. **One blocker remains:**

1. **`lib/auth/data/common-passwords.json` not committed** — denylist exists locally (1,369 entries) but `git status` shows `?? lib/auth/data/`; a clean clone/CI build cannot resolve the import in `password-policy.ts`.

Deferred dependencies (not scored as FAIL): US-14.5 spend guard, US-14.2 confirmation callback + login redirect to `/pending`, runtime email-delivery verification, client-bundle audit.

---

## Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Signup is open (no invite required); after submitting, the client sees a "check your email to confirm" screen — no session into product routes | **PASS** | Open form at `app/(auth)/signup/page.tsx`; success navigates inline to `CheckEmailView` (`components/auth/SignupForm.tsx` L200–202, L248–261). No cookie/session set: service client uses `persistSession: false` (`lib/supabase/server.ts` L25–29); signup uses `auth.admin.createUser` only (`lib/auth/actions/sign-up.ts` L64–72). |
| Supabase sends an email confirmation on signup; the account cannot log in to a pending/product state before confirming | **PASS** (static) / **NOTE** | After insert, `sendSignupConfirmationEmail(supabase, input.email)` calls `auth.resend({ type: 'signup', email, options: { emailRedirectTo } })` (`lib/auth/send-signup-confirmation.ts` L22–32; `lib/auth/actions/sign-up.ts` L119–128). On send failure: compensates (delete client row + auth user) and returns `internalError()`. Login not implemented (US-14.2); unconfirmed users cannot authenticate via app. **Runtime email delivery not verified.** |
| After email confirmation, the client sees a neutral "account pending activation" state until an operator activates the account (US-14.5 enforces on every request) | **DEFERRED** (UI ready) | `PendingActivationView` + `/pending` page with EN/ES copy (`components/auth/PendingActivationView.tsx`, `app/(auth)/pending/page.tsx`, `messages/en.json` L79–84, `messages/es.json` L79–84). **No email-confirmation callback Route Handler** — `CONTRACT.md` defers to US-14.2/14.5; no `app/**/auth/callback` route found. E2E post-confirm redirect not wired in this story. |
| Signing up with an already-registered email returns the same generic success-style response as a new email (no user enumeration) | **PASS** | Duplicate Supabase error → `{ ok: true }` (`lib/auth/actions/sign-up.ts` L74–76). Client-row unique violation → compensate delete + `{ ok: true }` (L100–103). FE always shows same `CheckEmailView` on `result.ok` (`components/auth/SignupForm.tsx` L200–202). |
| Password policy enforced server-side (minimum length; client-side hints are presentation only) | **PASS** (local) | Server: `validatePassword` in `lib/auth/password-policy.ts` (12–128 chars, common list). Client: hints only (`SignupForm.tsx` L149–175, L321). Denylist file present locally but **not committed** — see Gaps. |
| A `neuramark_clients` row linked to Supabase `auth.users` is created on signup with `active = false` | **PASS** | Insert uses `auth_user_id` from Supabase response only (`lib/auth/actions/sign-up.ts` L93–98). `active` omitted → DB default `false` (`supabase/migrations/20260828120000_neuramark_auth_signup.sql` L21). |
| Manual activation: operator runs `UPDATE ... SET active = true` via SQL (no admin UI); once active, full access on next request/login | **PASS** | Migration comments document SQL-only activation (`supabase/migrations/...sql` L36–37). No app UPDATE path for `active`. Full-access-on-login is US-14.2/14.5 — out of scope here. |
| Every signup creates the row with `role = 'client'`; `role` absent from contract and cannot be set via endpoint | **PASS** | Insert omits `role` → enum default `'client'` (migration L22). Forbidden-key reject for `role` (`lib/auth/forbidden-fields.ts` L3–12, `sign-up.ts` L27–30). Strict Zod schema excludes `role` (`lib/contracts/auth.ts` L43–56). |
| No Supabase SDK, token, or key appears in any client bundle or browser response | **PASS** (static) | `@supabase/supabase-js` only in `lib/supabase/server.ts` with `import "server-only"`. Client components import Server Actions only (`components/auth/SignupForm.tsx` L11–12). **Bundle audit not completed** (build failed at type-check). |
| Copy exists in English and Spanish | **PASS** | Parity in `messages/en.json` and `messages/es.json` under `auth.*` (errors, passwordPolicy, signup, pending, localeSwitcher). |
| **[SEC] Password policy:** min 12, max 128, all chars, no composition rules, top ~1,000 denylist, shared module for US-14.4 | **PASS** (local) / **NOTE** | `lib/auth/password-policy.ts` L15–36; denylist 1,369 entries at `lib/auth/data/common-passwords.json` (local). File **not committed** — deploy/CI gap. Module marked `server-only`, reusable by US-14.4. |
| **[SEC] Passwords never in logs, errors, analytics, URLs, or `neuramark_` tables; logging redacts password keys | **PASS** | `redactAuthPayload` redacts keys containing `"password"` (`lib/auth/errors.ts` L55–72); used on error log (`sign-up.ts` L79–82). No password column in migration. Grep: no `console.*password` in `lib/`. |
| **[SEC] Duplicate-email signup: same status, body, copy as new email; Supabase "user already exists" mapped server-side | **PASS** | `isDuplicateAuthError` → `authSuccess()` (`lib/auth/supabase-auth-errors.ts` L9–27, `sign-up.ts` L74–76). Neutral copy: `auth.signup.success` EN/ES. |
| **[SEC] Signup rate-limited: 5/IP/hour, 15/IP/day via `neuramark_auth_attempts`; over-limit → 429 generic | **PASS** | `recordAuthAttempt` + `isSignupRateLimited` (`lib/auth/rate-limit.ts` L77–96, `sign-up.ts` L52–59). HMAC hashing (`lib/auth/hash.ts`). Migration table + indexes (`supabase/migrations/...sql` L42–55). Returns `rateLimitedError()` (`lib/auth/errors.ts` L29–31). |
| **[SEC] Inactive accounts consume no paid resources (US-14.5 guard on every spend endpoint) | **DEFERRED** | Signup creates auth user + one client row only (`sign-up.ts`). No US-14.5 `active` guard in codebase yet — not FAIL for US-14.1 signup correctness. |
| **[SEC] Resend confirmation rate-limited (3/email/hour) + generic response for known/unknown emails | **PASS** | `isResendConfirmationRateLimited` (`lib/auth/rate-limit.ts` L98–112). Shared helper swallows benign errors (`lib/auth/supabase-auth-errors.ts` L29–44, `send-signup-confirmation.ts` L34–40). Resend action always returns `{ ok: true }` for enumeration safety (`resend-confirmation.ts` L62–64). UI resend on `CheckEmailView` (`SignupForm.tsx` L222–246). |
| **[SEC] Signup mutation CSRF-protected (Server Action origin check or Route Handler Origin validation) | **PASS** | `"use server"` on `signUp` (`lib/auth/actions/sign-up.ts` L1). Next.js built-in Server Action origin verification. |
| **[SEC] `auth_user_id` from Supabase response only; transactional/compensated create (no orphaned auth users) | **PASS** (logic) / **NOTE** | `authUserId` from `authData.user?.id` only (`sign-up.ts` L87–98). On insert failure: `admin.deleteUser` compensation (L100–116). On email-send failure: delete client row + auth user (L119–127) — **compensation code has TypeScript error** (see Gaps). |
| **[SEC] If signup establishes a session, cookie newly issued (session fixation guard) | **PASS** | No session/cookie established at signup. Service client `persistSession: false`. Preferred contract path followed. |
| **[SEC] `role` DB-constrained; absent from auth contracts; payload with `role` rejected/stripped | **PASS** | Enum `neuramark_client_role` (migration L4). Forbidden-key rejection before Zod (`forbidden-fields.ts`, `sign-up.ts` L27–30). |

---

## Convention Compliance

| Convention | Status | Notes |
|------------|--------|-------|
| English + Spanish user-facing strings | **PASS** | `messages/en.json`, `messages/es.json` |
| Server Components by default; minimal `"use client"` | **PASS** | Pages are Server Components; interactivity in `SignupForm`, `CheckEmailView`, `AuthLocaleSwitcher` |
| PrimeReact-first UI | **PASS** | `Button`, `InputText`, `Password`, `Message` from PrimeReact |
| Loading / pending / error states | **PASS** | Submit `pending` + `loading` button; form/resend errors via `Message`; check-email state |
| Supabase only on server; no browser auth SDK | **PASS** (static) | Actions + `server-only` modules |
| `neuramark_` DB prefix | **PASS** | Migration uses prefixed tables, enums, indexes |
| Endpoints map to concrete FE consumers | **PASS** | `signUp` ← `SignupForm`; `resendConfirmationEmail` ← check-email resend |
| `getCurrentUser()` hardcoded until US-14.5 | **PASS** | Unchanged seam (`lib/auth/get-current-user.ts`) |
| Contract FE/BE alignment | **PASS** | Types/schemas match `CONTRACT.md`; FE imports types from `lib/contracts/auth.ts`; email send now matches contract step 5 intent |

---

## Gaps (what blocks PASS)

1. **TypeScript/build failure in email-send compensation** — `lib/auth/actions/sign-up.ts` L121–125 chains `.catch()` on `supabase.from(...).delete().eq(...)` (PostgrestFilterBuilder, not a Promise). `npm run build` fails:
   ```
   Property 'catch' does not exist on type 'PostgrestFilterBuilder<...>'
   ```
   Fix: `await supabase.from(...).delete().eq(...)` inside try/catch, or `.then(({ error }) => ...)` pattern used elsewhere.

2. **`lib/auth/data/common-passwords.json` not in git** — required by `password-policy.ts` L5; `git status`: `?? lib/auth/data/`. Local file has 1,369 entries (satisfies "~1,000"). **Remains a FAIL blocker** for shippable/CI-complete work: fresh checkout cannot build or enforce common-password rejection.

3. **Runtime verification not done** — Supabase `auth.resend({ type: 'signup' })` with service-role client not exercised; email delivery not confirmed in dashboard/logs. Client-bundle grep for `@supabase` not run post-build (type-check blocked completion).

---

## Scope Creep

None identified. Implementation stays within US-14.1 signup, resend, schema, and shared pending UI. Login page link points to `/login` (not yet implemented — US-14.2, acceptable forward reference).

---

## Recommended Next Actions

| Action | Owner |
|--------|-------|
| Fix TypeScript error in email-send compensation (`sign-up.ts` L121–125): await delete, wrap in try/catch | **nextjs-backend** |
| Commit `lib/auth/data/common-passwords.json` (and track `lib/auth/send-signup-confirmation.ts` + rest of `lib/auth/` if not yet staged) | **nextjs-backend** |
| Run `npm run build`; grep client chunks for `@supabase` / `NEXT_PUBLIC_SUPABASE` | **qa-engineer** or implementer |
| Verify confirmation email arrives in Supabase dashboard after signup | **nextjs-backend** |
| Wire email-confirmation callback → `/pending` (or login → pending for inactive) | **US-14.2** (nextjs-backend + nextjs-frontend) |
| Implement `active=false` spend guard on all product endpoints | **US-14.5** (nextjs-backend) |
| Re-run requirements-validator after fixes → target **PASS** | **requirements-validator** |
| On PASS: product-owner checks acceptance boxes in `plan/USER_STORIES.md` | **product-owner** |

---

## Contract Deviations

| Contract expectation | Implementation | Severity |
|---------------------|----------------|----------|
| Step 5–7: confirmation email after createUser + compensated create | Implemented via `sendSignupConfirmationEmail` + compensation on failure | **Resolved** |
| Compensation must compile and run | `.catch()` on query builder breaks build | **Blocker** |
| Bundled common-password denylist | Present locally, not in repo | **Blocker** |
| All other shapes, error envelope, forbidden fields, rate limits, DDL | Aligned | — |

---

## Dependency Check

| Dependency | Status |
|------------|--------|
| US-X.3 identity seam (`getCurrentUser`) | **Satisfied** — `lib/auth/get-current-user.ts` exists |
| US-14.2 login + confirm callback | **Not required for US-14.1 PASS** — pending UI scaffolded; E2E deferred |
| US-14.5 active guard + session swap | **Deferred** — not blocking signup story |

---

## Change Log (re-validation)

| Prior finding | Status |
|---------------|--------|
| No confirmation email on signup | **Fixed** — `lib/auth/send-signup-confirmation.ts` + call in `sign-up.ts` L119; shared by `resend-confirmation.ts` |
| `common-passwords.json` untracked | **Still open** — remains FAIL blocker for CI/deploy |
| Build not verified | **Partially verified** — build fails on new compensation code |
