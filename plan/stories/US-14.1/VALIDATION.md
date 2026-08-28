# Validation Report — US-14.1

**Story:** Sign up with email and password  
**Validated:** 2026-08-28 (re-validation; prior verdict FAIL)  
**Validator:** requirements-validator  
**Branch:** `feature/US-14.1-signup`  
**Runtime:** `npm run build` **passes**. `git ls-files lib/auth/data/common-passwords.json` **tracked**. Client-chunk grep for `@supabase` / `NEXT_PUBLIC_SUPABASE` in `.next/static`: **no matches**. Live signup/email-delivery not exercised.

---

## Verdict: PASS WITH NOTES

Both previous FAIL blockers are **resolved**. No remaining blockers for US-14.1 shippable acceptance.

| Prior blocker | Status |
|---------------|--------|
| `lib/auth/data/common-passwords.json` not in git | **Resolved** — tracked; committed in `befe306`; 1,369 entries; `password-policy.ts` import resolves; `tsconfig.json` has `resolveJsonModule: true`; production build compiled the module. |
| TypeScript `.catch()` on `PostgrestFilterBuilder` in email-send compensation | **Resolved** — `sign-up.ts` uses `await supabase.from(...).delete().eq(...)`; `npm run build` completed (compile + type-check + static generation). |

Notes (do **not** block PASS): US-14.2 confirmation callback and US-14.5 spend guard scored **DEFERRED** per CONTRACT.md; confirmation email delivery not runtime-tested; rate-limit window is one attempt tighter than the written max (see Contract Deviations).

---

## Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Signup is open (no invite required); after submitting, the client sees a "check your email to confirm" screen — no session into product routes | **PASS** | Open form at `app/(auth)/signup/page.tsx` (no invite gate). Success navigates inline to `CheckEmailView` (`components/auth/SignupForm.tsx` L200–202, L248–261). No session cookie: service client `persistSession: false` (`lib/supabase/server.ts` L25–29); signup uses `auth.admin.createUser` only (`lib/auth/actions/sign-up.ts` L64–72). |
| Supabase sends an email confirmation on signup; the account cannot log in to a pending/product state before confirming | **PASS** (static) / **NOTE** | After client-row insert, `sendSignupConfirmationEmail` calls `auth.resend({ type: "signup", email, options: { emailRedirectTo } })` (`lib/auth/send-signup-confirmation.ts` L22–32; `lib/auth/actions/sign-up.ts` L119–134). On send failure: compensates (delete client row + auth user) and returns `internalError()`. Login is not implemented (US-14.2); unconfirmed users cannot authenticate via this app. **Runtime inbox/dashboard delivery was not exercised.** `emailRedirectTo` points at `/auth/callback`, which is deferred to US-14.2. |
| After email confirmation, the client sees a neutral "account pending activation" state until an operator activates the account (US-14.5 enforces this on every request) | **DEFERRED** (UI ready) | `PendingActivationView` + `/pending` with EN/ES copy (`components/auth/PendingActivationView.tsx`, `app/(auth)/pending/page.tsx`, `messages/en.json` L79–84, `messages/es.json` L79–84). **No email-confirmation callback Route Handler** — `CONTRACT.md` Out of scope → US-14.2 / US-14.5; no `app/**/auth/callback` route. E2E post-confirm redirect is not this story. |
| Signing up with an already-registered email returns the same generic success-style response as a new email (no user enumeration) | **PASS** | Duplicate Supabase error → `{ ok: true }` (`lib/auth/actions/sign-up.ts` L74–76; `lib/auth/supabase-auth-errors.ts` L9–27). Client-row unique violation (`23505`) → compensate delete + `{ ok: true }` (L100–103). FE always shows `CheckEmailView` on `result.ok` (`SignupForm.tsx` L200–202). Neutral copy: `auth.signup.success`. |
| Password policy enforced server-side (minimum length; client-side hints are presentation only) | **PASS** | Server: `validatePassword` 12–128 + denylist (`lib/auth/password-policy.ts` L15–36). Client: required/mismatch/format hints only — no server policy duplicated as a gate (`SignupForm.tsx` L149–175, L321). |
| A `neuramark_clients` row linked to the Supabase `auth.users` record is created on signup with `active = false` (column is `NOT NULL DEFAULT false`) | **PASS** | Insert uses `auth_user_id` from Supabase response only (`sign-up.ts` L87–98). `active` omitted → DB default `false` (`supabase/migrations/20260828120000_neuramark_auth_signup.sql` L21). FK: `REFERENCES auth.users (id)` (migration L15). |
| Manual activation: operator runs `UPDATE ... SET active = true` via SQL (no admin UI — explicitly out of scope, P1 candidate); once active, the user gets full access on their next request/login with no additional step | **PASS** | Migration comments document SQL-only activation (migration L36–37). No application `UPDATE` on `neuramark_clients.active` (grep: insert + compensate-delete only in `sign-up.ts`). Full-access-on-login is US-14.2/14.5. |
| Every signup creates the row with `role = 'client'`; `role` is absent from the signup request contract and cannot be set through the endpoint under any payload (promotion to `operator` is SQL-only) | **PASS** | Insert omits `role` → enum default `'client'` (migration L22). Forbidden-key reject for `role` before Zod (`lib/auth/forbidden-fields.ts` L3–12, `sign-up.ts` L26–30). Strict Zod schema excludes `role` (`lib/contracts/auth.ts` L43–56). |
| No Supabase SDK, token, or key appears in any client bundle or browser response | **PASS** | `@supabase/supabase-js` only in `lib/supabase/server.ts` (`import "server-only"`) and as a type import in `send-signup-confirmation.ts`. Client components call Server Actions only (`SignupForm.tsx` L11–12). After `npm run build`, grep of `.next/static` for `@supabase` / `NEXT_PUBLIC_SUPABASE` / `supabase-js`: **no matches**. Success/error envelopes contain no tokens or IDs (`lib/auth/errors.ts` L7–27). |
| Copy exists in English and Spanish | **PASS** | Parity in `messages/en.json` and `messages/es.json` under `auth.errors`, `auth.passwordPolicy`, `auth.signup`, `auth.pending`, `auth.localeSwitcher` (EN L34–84, ES L34–84). |
| **[SEC] Password policy (server-enforced): minimum 12 characters, maximum 128, all characters allowed (spaces/unicode), no composition rules; password rejected if it appears in a bundled common-password list (top ~1,000); the same policy module is reused by US-14.4** | **PASS** | `lib/auth/password-policy.ts` L15–36 (`server-only`); no composition regex. Denylist: `lib/auth/data/common-passwords.json` — **1,369 entries**, tracked (`git ls-files`), committed `befe306`. Module exported for US-14.4 reuse; signup is the only current importer. |
| **[SEC] Passwords never appear in logs, error messages, analytics events, URLs, or any `neuramark_` table — the plaintext password exists only in the request body and the server-side Supabase Auth call; request logging redacts password fields by key name** | **PASS** | `redactAuthPayload` redacts keys containing `"password"` (`lib/auth/errors.ts` L55–72); used on createUser failure log (`sign-up.ts` L79–82). No password column in migration. Grep: no `console.*password` in `lib/`. Password not sent in URL; `confirmPassword` stays client-side only. |
| **[SEC] Duplicate-email signup returns the same HTTP status, response body shape, and copy as a new-email signup, with no measurable content difference; any Supabase "user already exists" error is caught server-side and mapped to the generic response** | **PASS** | `isDuplicateAuthError` → `authSuccess()` (`lib/auth/supabase-auth-errors.ts` L9–27, `sign-up.ts` L74–76). Same `{ ok: true }` as new email. Neutral EN/ES `auth.signup.success`. |
| **[SEC] Signup endpoint is rate-limited server-side (tightened for open signup): max 5 signup attempts per IP per hour AND max 15 per IP per day, tracked in `neuramark_auth_attempts` (ip_hash, email_hash, action, attempted_at) in addition to Supabase Auth's built-in limits; over-limit requests get the same generic response with a 429** | **PASS** (see note) | `recordAuthAttempt` + `isSignupRateLimited` (`lib/auth/rate-limit.ts` L77–96, `sign-up.ts` L52–59). HMAC-SHA256 hashing (`lib/auth/hash.ts` L20–33). Table + indexes (migration L42–55). Returns `rateLimitedError()` (`lib/auth/errors.ts` L29–31). **Note:** because the current attempt is recorded before the count check, `hourlyCount >= 5` / `dailyCount >= 15` blocks the 5th / 15th attempt (effective caps 4/hour and 14/day). Safer than spec; not a FAIL. |
| **[SEC] Inactive accounts consume no paid resources: signup creates only the Supabase auth user and one `neuramark_clients` row; no endpoint that triggers LLM, video, TTS, or file-storage spend is reachable while `active = false` (enforced by the US-14.5 guard on every request, including direct Route Handler / Server Action calls)** | **DEFERRED** | Signup creates auth user + one client row only (`sign-up.ts` L64–98). No US-14.5 `active` spend guard in the codebase yet. CONTRACT.md out-of-scope → US-14.5. Not scored FAIL. |
| **[SEC] Any "resend confirmation email" capability is rate-limited like reset requests (max 3 per email per hour via `neuramark_auth_attempts` plus Supabase built-in limits) and returns the same generic response for known and unknown emails** | **PASS** | `isResendConfirmationRateLimited` (`lib/auth/rate-limit.ts` L98–112). Benign/not-found errors swallowed (`lib/auth/supabase-auth-errors.ts` L29–44, `send-signup-confirmation.ts` L34–40). Resend action always returns `{ ok: true }` after the rate-limit gate (`resend-confirmation.ts` L62–64). UI resend on `CheckEmailView` (`SignupForm.tsx` L222–246). |
| **[SEC] Signup mutation is CSRF-protected: implemented as a Server Action (Next.js origin check) or a Route Handler that rejects requests whose `Origin` header does not match the app host** | **PASS** | `"use server"` on `signUp` (`lib/auth/actions/sign-up.ts` L1) and `resendConfirmationEmail` (`resend-confirmation.ts` L1). No signup `app/**/route.ts`. Next.js Server Action origin check applies. |
| **[SEC] `auth_user_id` for the `neuramark_clients` row comes only from the server-side Supabase Auth response — never from the request; the auth-user + client-row creation is transactional or compensated (no orphaned auth users on failure)** | **PASS** | `authUserId` from `authData.user?.id` only (`sign-up.ts` L87–98); forbidden keys include `auth_user_id` / `authUserId`. Insert failure: `admin.deleteUser` (L100–116). Email-send failure: `await` delete client row then delete auth user (L119–132). |
| **[SEC] If signup establishes a session, the session cookie is newly issued server-side at that moment (never reusing any pre-existing cookie value — session fixation guard)** | **PASS** | No session/cookie established at signup. Preferred CONTRACT path: `persistSession: false` + admin `createUser` only. |
| **[SEC] `role` is constrained at the DB level (Postgres enum `neuramark_client_role` or a CHECK constraint) to exactly `client` \| `operator` with `NOT NULL DEFAULT 'client'`, so an invalid role value is impossible regardless of write path; `role` appears in NO auth request contract (signup, login, reset) and any payload containing a `role` field is rejected or stripped before processing** | **PASS** | `CREATE TYPE public.neuramark_client_role AS ENUM ('client', 'operator')` (migration L4); column `NOT NULL DEFAULT 'client'` (L22). Payload with `role` rejected before Zod (`forbidden-fields.ts`, `sign-up.ts` L26–30). |

---

## Convention Compliance

| Convention | Status | Notes |
|------------|--------|-------|
| English + Spanish user-facing strings | **PASS** | `messages/en.json`, `messages/es.json` — matching `auth.*` trees |
| Server Components by default; minimal `"use client"` | **PASS** | Pages `signup/page.tsx`, `pending/page.tsx`, `AuthShell.tsx` are Server Components. Client islands: `SignupForm`, `CheckEmailView` (submit/resend), `AuthLocaleSwitcher` (`useSearchParams`) |
| PrimeReact-first UI | **PASS** | `Button`, `InputText`, `Password`, `Message` from PrimeReact in signup/check-email |
| Loading / pending / error states | **PASS** | Submit `pending` + `loading`/`disabled` (`SignupForm.tsx` L346–351); form/resend errors via `Message`; check-email success/error. No list empty-state required |
| Supabase only on server; no browser auth SDK | **PASS** | `import "server-only"` on data modules; post-build client chunks clean |
| `neuramark_` DB prefix | **PASS** | Enums `neuramark_client_role`, `neuramark_auth_action`; tables `neuramark_clients`, `neuramark_auth_attempts`; indexes prefixed |
| Endpoints map to concrete FE consumers | **PASS** | `signUp` ← `SignupForm`; `resendConfirmationEmail` ← check-email resend. No speculative Route Handlers |
| `getCurrentUser()` hardcoded until US-14.5 | **PASS** | Unchanged seam: `gaveho@gmail.com` / `Gabriel Vega` (`lib/auth/get-current-user.ts` L17–40) |
| Contract FE/BE alignment | **PASS** | `lib/contracts/auth.ts` matches frozen CONTRACT.md schemas/envelope; FE imports types from that file |
| Identity resolved only via `getCurrentUser()` | **PASS** | Signup does not introduce alternate identity (no client-supplied `client_id`) |

---

## Gaps (what blocks PASS)

**None.** Prior blockers are closed.

Non-blocking observations:

1. **Confirmation email not runtime-verified** — `auth.resend({ type: "signup" })` after `admin.createUser` is implemented but inbox/Supabase dashboard delivery was not run in this validation.
2. **`/auth/callback` does not exist** — `send-signup-confirmation.ts` L18 sets `emailRedirectTo` to `/auth/callback`. CONTRACT defers the callback to US-14.2 / US-14.5.
3. **Rate-limit attempts are not recorded on validation / password-policy failure** — SECURITY.md recommended recording even then to prevent policy-oracle probing. AC still met for actual signup attempts.
4. **Effective rate-limit caps are 4/hour and 14/day** — record-then-`>=` check (see Contract Deviations). Safer than the written 5/15.

---

## Scope Creep

None identified. Implementation stays within US-14.1 signup, resend, schema, shared pending UI, and the password-policy module. Login link points at `/login` (US-14.2, acceptable forward reference). No extra APIs.

---

## Contract Deviations

| Contract expectation | Implementation | Severity |
|---------------------|----------------|----------|
| Bundled common-password denylist in repo | Tracked `lib/auth/data/common-passwords.json` (1,369 entries) | **Resolved** |
| Compensation must compile | `await supabase.from(...).delete().eq(...)` (`sign-up.ts` L121–124); `npm run build` passes | **Resolved** |
| Confirmation email after createUser | `sendSignupConfirmationEmail` + compensate on failure | Aligned |
| Signup rate max 5/IP/hour and 15/IP/day | Record-then-check with `>=` yields 4/hour and 14/day | **Note** (stricter; not FAIL) |
| `signUp(input: SignUpInput)` | `signUp(raw: unknown)` then forbidden-keys + Zod — required to reject extra keys | Acceptable |
| Rate-limit 429 body `{ ok: true }` **or** envelope | Uses `{ ok: false, error: { code: "RATE_LIMITED", ... } }` | Allowed by CONTRACT |
| All other shapes, error envelope, forbidden fields, DDL | Aligned (`lib/contracts/auth.ts`, migration) | — |
| Email confirmation callback / login session | Out of scope (US-14.2) | **DEFERRED** |
| `getCurrentUser()` session swap + spend guard | Out of scope (US-14.5) | **DEFERRED** |

---

## Dependency Check

| Dependency | Status |
|------------|--------|
| US-X.3 identity seam (`getCurrentUser`) | **Satisfied** — `lib/auth/get-current-user.ts` exists; still hardcoded |
| US-14.2 login + confirm callback | **Not required for US-14.1 PASS** — pending UI scaffolded; callback deferred |
| US-14.5 active guard + session swap | **Deferred** — not blocking signup story |

---

## Recommended Next Actions

| Action | Owner |
|--------|-------|
| Check US-14.1 acceptance boxes in `plan/USER_STORIES.md` | **product-owner** |
| QA.md / runtime signup + confirmation email in Supabase dashboard | **qa-engineer** |
| Optional: record rate-limit attempts on validation failure; compare count **before** insert (or use `> 5` / `> 15`) to match written caps | **nextjs-backend** (non-blocking) |
| Wire email-confirmation callback → `/pending` (or login → pending for inactive) | **US-14.2** (nextjs-backend + nextjs-frontend) |
| Implement `active=false` spend guard on all product endpoints | **US-14.5** (nextjs-backend) |

---

## Change Log (re-validation)

| Prior finding | Status |
|---------------|--------|
| `common-passwords.json` untracked | **Fixed** — `git ls-files` shows `lib/auth/data/common-passwords.json`; 1,369 entries; commit `befe306` |
| `.catch()` on PostgrestFilterBuilder broke `npm run build` | **Fixed** — awaited delete; production build passes |
| Confirmation email missing | **Fixed** (prior re-validation) — still present via `send-signup-confirmation.ts` |
| Client-bundle audit blocked by failed build | **Done** — `.next/static` has no `@supabase` / `NEXT_PUBLIC_SUPABASE` |
| US-14.2 callback / US-14.5 spend guard | **DEFERRED** (unchanged; not FAIL) |
