# US-14.3 — Log out

**Priority:** P0  
**Depends on:** US-14.5 ✅ (session-backed `getCurrentUser()`, `requireActive()` / `loadPendingIdentity()`, deny-by-default middleware, `Cache-Control: no-store` on gated pages, `applySessionCookieFlags`) · US-14.2 ✅ (httpOnly `sb-*` cookie, login)  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-14.3 (source of truth — do not redefine)  
**Implementers:** nextjs-backend + nextjs-frontend (`docs/development/AGENT-ROSTER.md`; auth is not a domain specialist)

## Out of scope (do not implement here)

- **RBAC / permission tables / role-management UI.** `role` is unchanged. Logout does not read or write `neuramark_clients.role` or `active`. No operator-only gate on logout (inactive and client-role sessions must be able to leave).
- **Activation UI**, invite flows, or any write to `neuramark_clients`.
- **New identity API.** Do not add a `neuramark_session` cookie, a GET `/logout` page, or client Supabase Auth.
- **Re-implementing US-14.5 guards.** After logout, protected routes redirect to login because the existing guard sees a null/revoked session — do not fork middleware or `requireActive()`.
- **Re-implementing `Cache-Control: no-store`.** Product `/`, `/dashboard`, `/dashboard/:path*`, and `/pending` already send `no-store` (`next.config.ts`, middleware pass-through / login redirect). This story **verifies** that coverage; only extend if a new gated surface is added here (none expected).
- Do not change Path A (`GET /auth/callback`) or recovery landings. US-14.4 global sign-out after set-password stays that story’s behavior.

## Carry-forwards this story owns / reuses

From US-14.5 CONTRACT / TASKS (do not reinvent):

- [x] **Revoke, then expire.** `getCurrentUser()` already treats expired/**revoked** sessions as `null` (`getUser()`, not cookie presence). Logout must revoke the refresh token in Supabase Auth so a captured pre-logout `Cookie` header replayed after logout is rejected — cookie deletion alone is not enough.
- [x] **Cookie delete flags match set flags.** Reuse `discardSupabaseAuthCookies` / `applySessionCookieFlags({ maxAge: 0 })`: `HttpOnly`, `Secure` in production, `SameSite=Lax`, `Path=/`, **host-only** (`Domain` unset). Do **not** clamp `maxAge: 0` up to 7 days. Expire every `sb-*` name present (`isSupabaseAuthCookieName`).
- [x] **Guards already ship.** Unauthenticated product → `/login` (+ safe `next`); unauthenticated `/pending` → `/login` **without** `next`. Logout’s success landing is login; do not send `next` of the page they left (user asked to leave the session).
- [x] **Header stays a Server Component.** `AppHeader` receives `CurrentUser` from `AppShell` after `requireActive("page")`. Do not import `getCurrentUser()` into a Client Component, read `document.cookie`, or add a browser Supabase SDK.
- [x] **Pending has a session, not AppHeader.** `/pending` is outside `AppShell`. Hint copy (`auth.pending.logoutHint`) is not a control. Wire the **same** logout Server Action there so inactive users can terminate a shared-device session.

## FE checklist

Consumers of BE: product header (`AppHeader` via `AppShell` on `/dashboard` and other `(app)` pages) and pending (`PendingActivationView` on `/pending`) call the logout Server Action. Success → login page.

- [x] **Header / user menu:** logout control in `components/layout/AppHeader.tsx` (PrimeReact: `Button` and/or `Menu`; optional `ConfirmDialog`). Keep `AppHeader` a Server Component; extract a small `"use client"` island for the interactive control only. Display name/email stay server-passed props — do not fetch identity on the client.
- [x] Confirmation is **optional** (story). If used, PrimeReact confirm; Cancel leaves the session intact. CONTRACT may freeze default on/off — do not block BUILD on a modal.
- [x] On success: **redirect to `/login`** (preserve `locale` if already on the request as a query param). Do **not** pass `next` of `/dashboard`, `/`, or `/pending`.
- [x] Pending: replace hint-only copy with a real logout control that calls the same Server Action (PrimeReact `Button`). Keep pending identity server-only (email + display name props).
- [x] EN + ES in `messages/en.json` / `messages/es.json` (`header.*` for the menu/button/confirm; pending button label). Do not invent a second product name for “log out.”
- [x] Loading / pending / error: disable double-submit while the action runs; generic failure copy if revoke fails (no Supabase text). Success is the login page, not a toast on dashboard.
- [x] **Cache-Control verify (do not re-implement):** authenticated product and `/pending` already send `no-store`. After logout, **Back** must not show authenticated HTML. Confirm `next.config.ts` sources `/`, `/dashboard`, `/dashboard/:path*`, `/pending` plus middleware `no-store` on gated pass-through / login 302. Gap → extend headers, don’t add a second caching scheme.
- [x] No GET link that logs the user out (`<a href="/logout">` or `method="get"`). The control must POST (Server Action / form).
- [x] No Supabase SDK, tokens, or keys in the client bundle; form/button calls the Server Action only. PrimeReact before custom UI.

## BE checklist

Concrete FE consumers: header logout island under `AppShell` (`AppHeader`); pending logout control on `app/(auth)/pending/page.tsx`.

- [x] **POST-only Server Action** (same CSRF class as `logIn` / `signUp`: Next.js origin check). **No** Route Handler GET, **no** `GET /logout`, **no** `<form method="get">`. A GET must not terminate (or be forced to terminate) a session.
- [x] **Revoke in Supabase Auth** with the **user-scoped** cookie client (`createUserScopedAuthClient`) — never the service-role client. Call `signOut` so the **current** refresh token is revoked (replay of the pre-logout cookie fails `getUser()` / `getCurrentUser()` → `null`). Cookie deletion without Auth revocation is a fail. Scope **local vs global** is a SECURITY/CONTRACT freeze: this story is **this device / this session** (shared-device), not “sign out everywhere” UI. US-14.4 already uses `scope: "global"` on password reset.
- [x] **Order:** revoke **then** expire `sb-*` cookies with **the same name / path / host-only attributes used to set them** (`discardSupabaseAuthCookies` + `applySessionCookieFlags({ maxAge: 0 })`). Leave no stale `sb-*` variant (`Path` mismatch, accidental `Domain`).
- [x] If revoke fails after a retry: still expire cookies; do **not** return a success that implies the refresh token is dead. Freeze exact envelope vs redirect in CONTRACT (US-14.4 pattern: never `{ ok: true }` if global sign-out failed). FE still must not stay on an authenticated shell.
- [x] **Idempotent:** missing / already-expired session → still expire any `sb-*` crumbs and land on login (not 500). Do **not** call `requireActive()` / `requireOperator()` on this action — inactive and missing-row sessions must be able to log out. This is not a product spend endpoint.
- [x] **CSRF:** Server Action only (origin check). Reject mismatched `Origin` the same way other auth mutations do. No logout side effect on a forged GET.
- [x] **Replay:** automated coverage — capture cookie values, run logout, replay the old `Cookie` on `getCurrentUser()` / a product GET → unauthenticated (login redirect / null user), not dashboard HTML.
- [x] After logout, **US-14.5 guard** is the redirect: `GET /dashboard` (no valid session) → `/login` + safe `next`. Do not add a second middleware branch for “logged out.”
- [x] Forbidden keys (`role`, `active`, `auth_user_id`, `client_id`, …): reject or strip if a body is sent. Logout should not accept identity fields. Empty input is fine.
- [x] No tokens, `role`, `active`, or `client_id` in the action result body. Redirect to `/login` (optional `locale` only; optional `?loggedOut=1` only if CONTRACT freezes it as non-oracle copy — default is plain `/login`).
- [x] Do **not** allowlist a public GET logout path. The action POSTs to the current product/pending URL (cookies present → middleware passes). After `Set-Cookie` expiry, the 302 target is allowlisted `/login`.
- [x] `AUTH_DEV_FALLBACK`: hardcoded user is not a real Auth session. Logout still expires `sb-*` and redirects; it cannot “revoke” `DEV_USER` until the flag is off. Do not teach the fallback to persist across logout. Document in CONTRACT; do not build a fake session store.
- [x] Top-level try/catch → generic internal error (no Supabase text). Reuse `redactAuthPayload` if any payload exists. User-scoped credentials missing → same generic failure as other auth actions, plus expire cookies if any.
- [x] Reuse `lib/auth/supabase-cookie.ts`, `session-cookie-flags.ts`, `forbidden-fields.ts`. No new auth packages. Do not put service-role in this action.

## DB checklist

No schema work. Session lives in Supabase Auth + `sb-*` cookies.

- [x] **No new tables, columns, enums, indexes, or RLS policies.** Do not add a `logout` / `login_success` value to `neuramark_auth_action` unless SECURITY later requires an audit row (default: **no**).
- [x] **No** `INSERT`/`UPDATE`/`DELETE` on `neuramark_clients` (`active` / `role` stay operator SQL).
- [x] RLS stays enabled with zero policies. Logout does not talk to `neuramark_*` tables.

## Gates (orchestrator)

- [x] SPEC-REVIEW.md — ALIGNED
- [x] SECURITY.md — APPROVE WITH CONDITIONS
- [x] CONTRACT.md + FE signoff — 2026-08-28
- [x] VALIDATION.md — PASS WITH NOTES
- [x] QA.md — APPROVE (High #1 closed in fa48b6f; 2 Lows: `tsc` on replay test, live Auth E2E)
