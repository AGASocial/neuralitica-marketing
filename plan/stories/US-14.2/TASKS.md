# US-14.2 — Log in with email and password

**Priority:** P0  
**Depends on:** US-14.1 ✅ (signup, `neuramark_clients.active`, `neuramark_auth_attempts`, pending UI, confirmation emails aimed at `/auth/callback`)  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-14.2 (source of truth — do not redefine)  
**Implementers:** nextjs-backend + nextjs-frontend (`docs/development/AGENT-ROSTER.md`; auth is not a domain specialist)

## Out of scope (do not implement here)

- **US-14.5:** `getCurrentUser()` session swap; every-request `active` / spend / route guards; RLS policies; deny-by-default middleware. Login **does** check `neuramark_clients.active` **once** after a successful sign-in to choose landing (`/dashboard` vs `/pending`). Direct navigation to product routes while inactive remains US-14.5 (seam stays hardcoded until then: `lib/auth/get-current-user.ts`).
- **US-14.3:** Logout mutation (pending copy may mention returning later; no logout Server Action in this story).
- **US-14.4:** Password-reset request/set-password implementation. Login only **links** to the future reset route (same forward-reference pattern as signup → `/login`).
- No new identity helper for product pages. Login/callback may read `neuramark_clients` after a successful Supabase sign-in **only** to choose landing and to pass the user’s own email/display name to pending. Product identity remains `getCurrentUser()`.

## Carry-forwards from US-14.1 (in scope)

From `plan/stories/US-14.1/VALIDATION.md`, `CONTRACT.md` (out of scope), and `QA.md`:

- [ ] **Email-confirmation callback Route Handler** at `/auth/callback` (matches `lib/auth/send-signup-confirmation.ts` `emailRedirectTo`). Completes confirmation so the account can log in. Must **not** grant product access (`active` still false until operator SQL).
- [ ] **Post-confirm landing:** after the confirm click, the client reaches the pending-activation experience — either callback → `/pending`, or callback → `/login` then login of confirmed-inactive → `/pending`. Freeze the path in CONTRACT.md; E2E must prove one of them.
- [ ] **E2E post-confirm landing** (QA + FE/BE): click the confirmation link from a real (or dashboard-copied) email; user lands on pending (directly or via login), not dashboard/product.
- [ ] **`/pending` must not treat `?email=` as identity** (US-14.1 QA Low #13). After login, email/display name on the pending screen come from the **authenticated** result (what the user already knows). Unauthenticated query params are not proof of identity and must not be echoed as if they were.

## FE checklist

Consumer of BE: login page (`app/(auth)/login/`) calls the login Server Action. Pending page reuses `components/auth/PendingActivationView.tsx`. Confirmation landing uses `/pending` and/or `/login` per frozen contract.

- [ ] Login page: PrimeReact form (email, password); wrap with existing `AuthShell` / locale switcher pattern from signup
- [ ] Submit pending / loading / disabled submit; generic failure message only (no “unknown email” vs “wrong password” vs “unconfirmed” copy)
- [ ] Links: signup (`/signup`, exists) and reset (forward reference; route need not be implemented until US-14.4)
- [ ] On success: redirect to **dashboard** if the action says the account is active; show/redirect **account pending activation** if confirmed-but-inactive
- [ ] Reuse `PendingActivationView`; EN/ES pending copy — remove “login will be available in a future update” now that login exists
- [ ] Pending screen: at most the user’s own email/display name + neutral copy; no internal IDs, queue details, operator internals, or operational timestamps
- [ ] Do not render attacker-controlled `?email=` as the account identity (fix US-14.1 pending query-param echo)
- [ ] `next` / `redirectTo` (if present on the login URL): FE passes it through; server validates (open-redirect prevention). FE must not send the user to an unvalidated external URL
- [ ] EN + ES copy in `messages/en.json` and `messages/es.json` (login form, generic error, links, pending updates)
- [ ] Failure, loading, and pending states covered; clear password from client state after submit (same FE pattern as signup)
- [ ] No Supabase SDK, tokens, or keys in the client bundle; form calls the Server Action only
- [ ] Signup “Log in” link already points at `/login?locale=` — login page must exist so that link is not a 404

## BE checklist

Concrete FE consumer: login form on `app/(auth)/login/`. Callback consumer: confirmation email link (`emailRedirectTo` = `{SITE_URL}/auth/callback`).

- [ ] Server Action wrapping Supabase Auth **sign-in** (email/password) server-side — no tokens in the action result body
- [ ] On success: set **httpOnly** session cookie (server-managed); `Secure` in production, `SameSite=Lax`, `Path=/`; no access/refresh token readable by JS or present in the JSON/HTML body
- [ ] After successful authentication: read `neuramark_clients.active` (and email/display name as needed for pending) to choose landing — **dashboard** if active, **pending** if confirmed-but-inactive
- [ ] Unconfirmed, unknown email, and wrong password: **one** generic failure (same status, body shape, and copy). App code must not early-return on “user not found”; the Supabase sign-in call runs for all those failure paths (no app-introduced timing oracle)
- [ ] Active vs inactive is revealed **only after** successful authentication — failures never disclose activation state
- [ ] Session rotation / fixation: successful login always issues a **fresh** cookie value; discard any pre-auth session identifier
- [ ] CSRF: Server Action origin check, or Route Handler that rejects mismatched `Origin`
- [ ] Open-redirect prevention on `next` / `redirectTo`: must be a same-origin relative path starting with a single `/`, not `//`, no scheme, no backslash; anything else → `/dashboard`
- [ ] Passwords never logged or echoed; reuse `redactAuthPayload` (or equivalent) on any error/telemetry path
- [ ] Forbidden keys (`role`, `active`, `auth_user_id`, `client_id`, …): reject or strip before processing (same pattern as signup); `role` is not on the login contract
- [ ] Brute-force: max **5 failed attempts per (email, IP) per 15-minute window** in `neuramark_auth_attempts` (`action = login_failed`, already on `neuramark_auth_action`); over-limit → same generic failure with **429**; **counter resets on successful login**; fail closed if the attempts store errors; keep Supabase Auth rate limits as the second layer
- [ ] Email-confirmation **Route Handler** (`/auth/callback`): complete the confirm flow; do not send the user into product routes; landing is `/pending` or `/login` → pending for inactive (see carry-forwards)
- [ ] If the callback sets a session cookie, apply the same cookie flags and fixation rules as login; still send inactive users to pending, not dashboard
- [ ] Cookie shape must be usable by US-14.5 `getCurrentUser()` later — do not invent a parallel product identity API now
- [ ] Reuse existing server-only helpers where they fit (`lib/auth/rate-limit.ts`, `forbidden-fields.ts`, `errors.ts`, `get-client-ip.ts`, `hash.ts`); extend rate-limit for login windows rather than a new store
- [ ] Top-level try/catch → generic internal error (no Supabase text to the client)

## DB checklist

No new product tables. Session lives in the cookie / Supabase Auth. Login **reads** `neuramark_clients.active` (US-14.1). Rate limits **reuse** `neuramark_auth_attempts`.

- [ ] No new tables or columns required for the happy path
- [ ] Read `neuramark_clients.active` (and email/display_name if needed for pending) after successful auth — service-role / server client only; RLS stays deny-by-default (no new policies — US-14.5)
- [ ] Record failed logins as `neuramark_auth_action` value **`login_failed`** (already created in US-14.1). Hash IP and email as today (HMAC); never store plaintext password, raw IP, or plaintext email in `neuramark_*`
- [ ] Reset the 15-minute (email, IP) failure counter on successful login (delete matching `login_failed` rows, or equivalent). **Do not** write `neuramark_clients.active` or `role`
- [ ] **Only if CONTRACT/SECURITY require an audit row for successful login:** add enum value `login_success` to `public.neuramark_auth_action` via a Supabase migration (`neuramark_` prefix; `ALTER TYPE ... ADD VALUE`). Otherwise do **not** add an enum value — `login_failed` is enough
- [ ] If a new composite index is needed for `(email_hash, ip_hash, action, attempted_at)` login windows, name it with `neuramark_` prefix; existing US-14.1 indexes may suffice — confirm in CONTRACT, do not invent extra objects
- [ ] No password column; no app UPDATE on `active` / `role`

## Gates (orchestrator)

- [ ] SPEC-REVIEW.md
- [ ] SECURITY.md
- [ ] CONTRACT.md + FE signoff
- [ ] VALIDATION.md
- [ ] QA.md
