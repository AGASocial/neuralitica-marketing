# US-14.5 — Session-backed identity and route protection

**Priority:** P0  
**Depends on:** US-14.2 ✅ (httpOnly session cookie, login-time `active` landing, `/pending`) · US-X.3 ✅ (`lib/auth/get-current-user.ts` seam) · US-14.1 ✅ (`neuramark_clients`) · US-14.4 ✅ (cookie adapter; recovery callback)  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-14.5 (source of truth — do not redefine)  
**Implementers:** nextjs-backend + nextjs-frontend (`docs/development/AGENT-ROSTER.md`; auth is not a domain specialist)

## Out of scope (do not implement here)

- **US-14.3:** Logout control in the header/user menu. Session **expiry** must redirect to login (in scope). Pending copy may keep a logout *hint*; do not ship a logout Server Action.
- Interview Builder / Ficha viva / visual preferences (US-1.x–3.x).
- RBAC, permission tables, role-management UI, activation UI. `active` / `role` writes stay operator SQL (plus the one-time seed below).
- Do not add a second product identity API (no `client_id` cookie, no `neuramark_session` JWT, no header/query identity).
- Do not bake `active`, `role`, or `client_id` into the session cookie.
- Confirmation Path A (`GET /auth/callback` → `/login?confirmed=1`) and recovery Path (`GET /auth/callback/recovery` → set-password) stay frozen. This story **guards** those routes as public; it does not change their landings.

## Carry-forwards this story owns

From US-14.1, US-14.2, US-14.4 (VALIDATION / QA / TASKS):

- [x] **Every-request `active` gate** — login-time landing is not enough. `neuramark_clients.active` is enforced in `getCurrentUser()` / handler guards on **every** request (pages, Server Actions, Route Handlers). Inactive → pending screen / 403; no product, no spend.
- [x] **Spend guard** — no LLM / video / TTS / file-storage endpoint is reachable while `active = false` (US-14.1 [SEC] deferred). Today there are no spend endpoints; ship `requireActive()` (or equivalent) so future handlers cannot skip it. Direct action/handler calls from an inactive session return **403** with no side effects.
- [x] **`getCurrentUser()` swap** — replace the hardcoded `gaveho@gmail.com` default path with session → `neuramark_clients`. Call-site **shape** stays (`CurrentUser`: stable `id`, email, displayName, preferredLocale, `role`, `active`).
- [x] **Cookie `maxAge` cap (US-14.4 QA Low #2)** — `@supabase/ssr` default is ~400 days. Cap idle ≤ **7 days** in `applySessionCookieFlags` (and any cookie write path). Refresh stays server-side via the httpOnly cookie; refresh token never in JS.
- [x] **Header shows the session user** — `AppHeader.tsx` already calls `getCurrentUser()` from a Server Component. Swap the data source only; do not move identity into a Client Component.
- [x] **Pending identity off `sessionStorage` (US-14.2 QA Low #1)** — `/pending` email/display name come from the authenticated `getCurrentUser()` result on the Server Component. Remove `components/auth/pending-identity.ts` as product identity. No `?email=` echo.
- [x] **RLS** — tables already have RLS enabled with **zero** policies (deny anon/authenticated; service-role bypasses). Do **not** add browser-facing ownership policies that assume a client Supabase SDK. SECURITY.md decides whether any named `neuramark_*` policies are required; default is keep deny-by-default.

## Public allowlist (sketch — freeze in CONTRACT)

Deny-by-default: every route is protected unless listed. New routes are protected without opt-in.

| Kind | Paths |
|------|--------|
| Auth pages | `/login`, `/signup`, `/reset-password`, `/reset-password/new` |
| Auth callbacks | `/auth/callback`, `/auth/callback/recovery` |
| Static / framework | `/_next/static/*`, `/_next/image`, `/favicon.ico`, other `public/` assets |
| Auth Server Actions | Bound to the auth pages above (`signUp`, `logIn`, `requestPasswordReset`, `setNewPassword`, `resendConfirmationEmail`). They stay callable **without** a product session. |

**Not public**

- `/` (today 302 → `/dashboard`) and `/dashboard` — product.
- `/pending` — **authenticated-but-inactive only**. Unauthenticated → `/login`. Active session → `/dashboard`. Not an activation-status oracle for anonymous users.
- Every future product page, Server Action, and Route Handler.

Middleware is **convenience** (redirect). It must not be the security boundary and must not ship the service-role key on the Edge. Prefer cookie-presence / allowlist redirects in middleware; full session validation + `neuramark_clients` read in **Node** (`getCurrentUser()`, layout guards). SECURITY.md freezes Edge vs Node.

## FE checklist

Consumers of BE: protected shell (`AppHeader`, dashboard) reads `getCurrentUser()`; `/pending` reads the same seam on the server; auth pages stay public.

- [x] Auth pages (`/login`, `/signup`, `/reset-password`, `/reset-password/new`) remain reachable while logged out (existing `AuthShell` / locale switcher). Do not put them behind the product guard.
- [x] Unauthenticated visit to `/`, `/dashboard`, or any product route → login (not a crash or blank page). Session expiry mid-use → same redirect. Reuse `sanitizeLoginNext` / `isSafeRelativePath` if passing `next`.
- [x] `/pending`: Server Component loads identity via `getCurrentUser()`; pass **at most** email + display name into `PendingActivationView`. Strip/stop using `sessionStorage` (`pending-identity.ts` / `LoginForm` `storePendingIdentity`). Still strip untrusted `?email=` (and related) query keys.
- [x] Authenticated-but-inactive users never see dashboard / `AppShell` product chrome. Active users hitting `/pending` go to dashboard.
- [x] `AppHeader` stays a Server Component; display name/email come from the session-backed `getCurrentUser()`. No client-side identity (`document.cookie`, Supabase SDK, header/query user).
- [x] EN + ES for any new states (session expired → login, pending already exists). Update dashboard `setupBanner` copy that still says “hardcoded dev user” (`messages/en.json` / `messages/es.json`).
- [x] Loading / empty / error / pending covered for the new redirects. PrimeReact before custom UI. Keep `"use client"` on forms only.
- [x] No logout button (US-14.3). Pending logout *hint* copy may remain.

## BE checklist

Concrete FE consumers: `app/dashboard/page.tsx` + `components/layout/AppHeader.tsx` (session user); `app/(auth)/pending/page.tsx` (inactive identity); auth pages/actions stay public.

- [x] **Swap `getCurrentUser()`** (`lib/auth/get-current-user.ts`): validate session against Supabase Auth **server-side** (user-scoped cookie client — signature/expiry or `getUser()`, not mere cookie presence) → load `neuramark_clients` by `auth_user_id` → return `CurrentUser`. Expired / revoked / missing session → **null**. Missing client row → null (do not invent a user).
- [x] `active` and `role` are read **fresh every request** from `neuramark_clients` (no module cache, no cookie/JWT claim). Deactivation / demotion take effect on the next request.
- [x] Unauthenticated: helpers/pages redirect to login or return 401. Inactive: product Route Handlers / Server Actions return **403** with **no side effects**; pages → `/pending`. Evaluate `active` **before** `role`.
- [x] **`requireOperator()`** (shared helper): `role === 'operator'` on the `getCurrentUser()` result, after the active gate. Non-operator → 403, no side effects. Role is never taken from header, cookie, body, or middleware-injected request fields. No operator-only product endpoints exist yet; still ship the helper so later stories cannot skip it.
- [x] Deny-by-default middleware **or** layout guard using the allowlist above. New routes protected without opt-in. Middleware does not assert identity for handlers.
- [x] **Every** product Server Action / Route Handler still calls `getCurrentUser()` (or `requireActive()` / `requireOperator()`). Do not trust middleware headers. Auth actions on the allowlist do **not** use this as a product gate (login/signup/reset/callback unchanged).
- [x] **No “check my activation status”** endpoint for anonymous users. Activation state only on `/pending` for the authenticated owner.
- [x] **Dev fallback:** hardcoded user **only** when `NODE_ENV === 'development'` **AND** `AUTH_DEV_FALLBACK=true`. Role/active/id of that user are **fixed in code** (today’s `DEV_USER`: `00000000-0000-4000-8000-000000000001`, `gaveho@gmail.com`, Gabriel Vega, `operator`, `active: true`) — not env-configurable. Default path must not return the hardcoded user.
- [x] **Production:** if `AUTH_DEV_FALLBACK` is set, **throw at startup** (do not silently ignore). Automated test: fallback unreachable when `NODE_ENV=production`. Update `.env.example` (flag is local-only; must not be set in production).
- [x] **Cookie idle ≤ 7 days:** cap `maxAge` / `expires` in `lib/auth/supabase-cookie.ts` `applySessionCookieFlags` (US-14.4 Low #2). Keep `HttpOnly`, `Secure` in production, `SameSite=Lax`, `Path=/`, host-only. Refresh via `@supabase/ssr` cookie adapter server-side; refresh token never in JS or response bodies.
- [x] Service-role key stays in server-only modules (`lib/supabase/server.ts`, admin lookup). Never `NEXT_PUBLIC_*`, never client bundle, **never Edge middleware** if avoidable. `getCurrentUser()` DB read: Node server helper (service-role **or** a server-only path SECURITY freezes). User-scoped client for session validation; service-role for `neuramark_clients` if RLS stays deny-by-default.
- [x] No application write path to `neuramark_clients.active` or `role` (grep Server Actions, Route Handlers, seeds beyond the documented SQL seed). Forbidden keys still stripped on auth contracts.
- [x] Session expiry / null user: redirect to login, no throw that 500s the page.
- [x] **Recovery leftover cookies:** `/reset-password/*` stays on the allowlist (US-14.4 must not 302 to product). SECURITY/CONTRACT freeze whether a recovery session on a **product** path is treated as a normal session (subject to `active`) or isolated. Do not reopen Path A/recovery landings.
- [x] Automated coverage for: unauthenticated → login; inactive → pending/403; SQL `active=true` next request; SQL role demotion next request; production fallback throw; `maxAge` cap.
- [x] **Edge session refresh (QA High):** middleware refreshes with the anon-key `@supabase/ssr` client + `getUser()` and writes rotated `sb-*` (`Set-Cookie`, 7-day clamp) on the document GET. RSC cookie adapter is read-only (`setAll` no-op); a successful `getUser()` is never mapped to `null`. No service-role on Edge.
- [x] **Product route group (QA Medium):** `app/(app)/layout.tsx` calls `requireActive("page")` so new product pages inherit the gate. `/` and `/dashboard` live under the group; URLs unchanged. `/pending` and auth stay outside.

## DB checklist

Seed/backfill the US-X.3 local user as a real `neuramark_clients` row linked to a real Auth user. No new product tables.

- [x] **Auth user first (ops, not `auth.users` INSERT from app SQL):** ensure `gaveho@gmail.com` exists in Supabase Auth (Dashboard “Add user”, Admin API, or existing confirmed signup) with a password the operator knows. Email confirmed. Do **not** insert into `auth.users` from a `neuramark_` migration (password in SQL, fragile schema).
- [x] **Idempotent Supabase migration** (`neuramark_` prefix on objects/comments; filename continues the existing timestamp series). Look up `auth.users` by email `gaveho@gmail.com`. If missing: `RAISE NOTICE` and skip (or fail closed — freeze in CONTRACT; local CI may have no auth user). If present: upsert `neuramark_clients`:
  - `email` = `gaveho@gmail.com`
  - `display_name` = `Gabriel Vega`
  - `active` = `true`
  - `role` = `operator`
  - `auth_user_id` = that Auth id
  - **INSERT** (no existing row): set `id` = `00000000-0000-4000-8000-000000000001` (US-X.3 `DEV_USER_ID`) so the seam’s stable id survives
  - **UPDATE** (row already exists from signup): set `active`, `role`, `display_name`, `auth_user_id`; **do not** rewrite `id` if it already differs (avoid breaking future FKs)
- [x] Document **SQL-only** writes (migration `COMMENT` + ops note). The seed’s initial `active`/`role` is the only sanctioned **app-repo** write; afterwards operators run SQL only, e.g.  
  `UPDATE public.neuramark_clients SET active = true WHERE email = '<email>';`  
  `UPDATE public.neuramark_clients SET role = 'operator' WHERE email = '<email>';`  
  (and the inverse for deactivate/demote). No endpoint, Server Action, or env flag.
- [x] No new enum values, tables, or RLS policies unless SECURITY/CONTRACT require a named `neuramark_*` policy. Keep RLS enabled, deny-by-default.
- [x] Existing data: there are **no** `client_id` child rows yet (interview/ficha not built). After the swap, `getCurrentUser().id` is the `neuramark_clients.id` of the session user (seeded operator keeps the US-X.3 UUID when inserted fresh).

## Gates (orchestrator)

- [ ] SPEC-REVIEW.md
- [ ] SECURITY.md
- [ ] CONTRACT.md + FE signoff
- [ ] VALIDATION.md
- [ ] QA.md
