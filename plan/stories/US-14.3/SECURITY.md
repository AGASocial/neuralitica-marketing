# Security Design Review — US-14.3

**Story:** US-14.3 — Log out  
**Date:** 2026-08-28  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-14.3), `plan/SECURITY_BASELINE.md` (Authentication / session cookie ↔ server), `plan/stories/US-14.2/SECURITY.md`, `plan/stories/US-14.4/SECURITY.md`, `plan/stories/US-14.5/SECURITY.md`, `plan/stories/US-14.3/TASKS.md`, `plan/stories/US-14.3/SPEC-REVIEW.md` (ALIGNED), `lib/auth/supabase-cookie.ts`, `lib/auth/session-cookie-flags.ts`, `lib/auth/public-routes.ts`, `AGENTS.md`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct: one POST-only Next.js Server Action, user-scoped Supabase Auth **local** sign-out (this refresh token / this device), then expire `sb-*` with the **same flags used to set them**, then `/login`. Replay of a captured pre-logout cookie is rejected. Pending uses the same action. No GET logout. No `requireActive()`. Cache-Control is already US-14.5 — verify, do not rebuild. No REDESIGN.

The conditions are the `[SEC]` criteria below plus the **CONTRACT freeze list** in Design Concerns. USER_STORIES still says “Route Handler / Server Action”; this review **narrows to a Server Action only** (same CSRF class as `logIn` / `signUp`). Do not add a logout Route Handler.

**This story owns:** the logout mutation, header + pending controls, Auth **local** revocation of the current session, matching cookie expiry, replay coverage, success landing on `/login` without `next` of the page they left.

**This story does not own:** `Cache-Control: no-store` (US-14.5 — already on `/`, `/dashboard`, `/dashboard/:path*`, `/pending`); deny-by-default guards / `requireActive()` (reuse, do not fork); **global** sign-out (US-14.4 after set-password); Path A or recovery landings; RBAC / activation UI.

**Terminology:** Client / pending user log out. ES product copy: **cerrar sesión**. Do not use “admin”, administrador, staff, or “sign out everywhere” as a product label in this story.

---

### Threat Summary

US-14.3 is the **session-termination boundary** for a shared device. The user is already authenticated (product or pending). Primary threats:

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Cookie deletion without Auth revocation** | Stolen `Cookie` header still passes `getUser()` | Revoke the **current** refresh token via user-scoped `signOut({ scope: "local" })` **then** expire cookies. Replay → `getCurrentUser()` null / login redirect, not dashboard HTML |
| **GET logout / image CSRF** | `<a href>`, prefetch, or `<img>` ends the session | **No** GET `/logout`, **no** GET form, **no** public GET allowlist for logout. POST-only Server Action. A GET must not terminate a session |
| **Cross-origin POST CSRF** | Attacker site logs the victim out (or worse, if a GET existed) | Next.js Server Action origin check (same class as `logIn` / `signUp`). `SameSite=Lax` cookies. Reject mismatched `Origin` |
| **Global sign-out from a shared-device control** | Other devices killed when the user only meant this kiosk | Scope is **local** (this device / this session). US-14.4 owns `scope: "global"` on password reset. No “sign out all devices” UI |
| **`requireActive()` on logout** | Inactive `/pending` users cannot leave a shared device | Do **not** call `requireActive()` / `requireOperator()`. Same action on pending. Idempotent if already logged out |
| **Stale `sb-*` variant** | Path/Domain mismatch leaves a live cookie | Expire with `discardSupabaseAuthCookies` / `applySessionCookieFlags({ maxAge: 0 })`: `HttpOnly`, `Secure` in production, `SameSite=Lax`, `Path=/`, **host-only**. Do **not** clamp `maxAge: 0` up to 7 days |
| **Cached authenticated HTML** | Back button on a shared device shows dashboard | Already shipped in US-14.5 (`no-store` on gated pages). This story **verifies** Back; does not add a second caching scheme |
| **Success that lies about revocation** | FE treats `{ ok: true }` as “token is dead” when Auth sign-out failed | If revoke fails after retry: still expire cookies; **never** `{ ok: true }`. Still leave the authenticated shell |
| **Identity / privilege smuggling** | Body sets `role` / `active` / `client_id` | Forbidden keys rejected or stripped. Empty input is fine. No identity in the result |
| **Service-role on logout** | Privileged client used to sign out or mint cookies | User-scoped cookie client only. Never service-role on this action |

**Residual risk accepted:** Possession of XSS on this origin can POST the Server Action (same as other mutations). If Auth `signOut` is down after retry, a **captured** cookie copy may still validate until the refresh token expires — cookies on *this* browser are still expired and the UI must leave the shell; do not pretend revocation succeeded. `AUTH_DEV_FALLBACK` is not an Auth session: logout cannot revoke `DEV_USER`; product GETs while the dual flag is on still resolve the hardcoded user (local-only; production already throws if the env var is set).

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| Session cookie (`sb-*`, `@supabase/ssr`) | High — session bearer | Must be expired with the **same** name / `Path=/` / host-only / `HttpOnly` / `Secure` (production) / `SameSite=Lax` used to set it |
| Current refresh token | Critical | Revoked in Supabase Auth (**local** scope) via the user-scoped client **before** cookie expiry so the client still holds the token |
| Other sessions for the same user | High — **must survive** this control | Not revoked here. Global revocation is US-14.4 (password reset) only |
| `neuramark_clients.active` / `role` | High — authorization gates | **Not read as a gate** on this action; **no write**. Pending (inactive) must be able to log out |
| Access / refresh tokens in responses | Critical | Never in HTML, JSON, JS, logs, or `Location` |
| Service-role key | Critical | Must **not** be used on this action |
| `AUTH_DEV_FALLBACK` / `DEV_USER` | Critical if honored in production | Unchanged dual-flag + production throw (US-14.5). Logout must not invent a fake session store or persist `DEV_USER` via cookies |
| Login landing | Low | `/login` is already public. Optional `locale=en\|es` if already on the request — never `next` of the page they left |

**Boundaries:**

1. **Browser → logout Server Action** — Untrusted. POST only. Origin check. No identity fields required. Client island submits the action; it does not read cookies or call Supabase.
2. **Logout action → Supabase Auth** — User-scoped `createUserScopedAuthClient` + `signOut({ scope: "local" })`. Never service-role.
3. **Logout action → cookie jar** — After revoke (or when there is no session to revoke): `discardSupabaseAuthCookies` / `applySessionCookieFlags({ maxAge: 0 })` for every `isSupabaseAuthCookieName`.
4. **Post-logout → US-14.5 guards** — Success landing is `/login` **without** `next` of `/dashboard`, `/`, or `/pending`. A later `GET /dashboard` with no valid session uses the existing guard (`/login` + safe `next`). Do not fork middleware.
5. **Pending vs product** — Both call the **same** action. `/pending` is outside `AppShell`; hint copy is not a control.

---

## Abuse Cases Considered

- *As a malicious actor, I can steal the `Cookie` header, wait for the owner to log out, and replay it onto `/dashboard`* → **Blocked:** local Auth revocation of this refresh token, then cookie expiry. Replay fails `getUser()` / `getCurrentUser()` → null; product GET → login redirect, not dashboard HTML. Cookie deletion alone is a fail.
- *As a malicious actor, I can CSRF logout with `GET /logout`, `<a href="/logout">`, or `<img src>`* → **Blocked:** no GET logout path, no GET form, no public GET allowlist for logout. A GET must not terminate (or be forced to terminate) a session.
- *As a malicious actor, I can POST logout from `https://evil.example` using the victim’s cookies* → **Blocked:** Server Action origin check (same as `logIn` / `signUp`). `SameSite=Lax`.
- *As a malicious actor, I can click “log out” on a shared device and kill the owner’s phone session* → **Blocked by freeze:** this story is **local** (this device / this session). No global UI. US-14.4 already globally signs out after password reset.
- *As a malicious actor, I am inactive on `/pending` (shared tablet) and there is no way to end the session* → **Blocked:** pending wires the **same** Server Action. Do **not** call `requireActive()` / `requireOperator()`.
- *As a malicious actor, I can leave a `sb-*` cookie with a different `Path` or `Domain` after “logout”* → **Blocked:** expire every `sb-*` with matching host-only flags; `maxAge: 0` is not clamped to 7 days.
- *As a malicious actor, I can use Back to show cached dashboard HTML after logout* → **Blocked (already US-14.5):** `Cache-Control: no-store` on product and `/pending`. This story verifies; extend headers only if a new gated surface appears (none expected).
- *As a malicious actor, I can send `role` / `active` / `client_id` / `auth_user_id` on logout or read them from the result* → **Blocked:** forbidden keys rejected or stripped; result has no tokens, `role`, `active`, or `client_id`.
- *As a malicious actor, I can call the service-role client from this action to sign out other users or mint cookies* → **Blocked:** user-scoped cookie client only. Service-role is forbidden here. Logout does not take a user id.
- *As a malicious actor, I can force logout to 302 to `https://evil.example` via `next` or `Host`* → **Blocked:** landing is `/login` only (optional already-present valid `locale`). Never copy `next` of the page they left. Never `Host` / `X-Forwarded-Host`.
- *As a malicious actor, I can treat `{ ok: true }` as proof the refresh token is dead when Auth sign-out failed* → **Blocked:** never `{ ok: true }` if revoke failed after retry. Still expire cookies and leave the shell.
- *As a malicious actor, I can 500 the action when already logged out so crumbs stay* → **Blocked:** missing / expired session is idempotent — still expire `sb-*` crumbs and land on login.
- *As a malicious actor, I can keep `AUTH_DEV_FALLBACK` identity by logging out (fake session store) or skip logout because there is no Auth user* → **Blocked:** logout still expires `sb-*` and redirects. Do not persist `DEV_USER` across logout. Do not invent a session store. Residual: while the dual flag is on, `getCurrentUser()` still returns `DEV_USER` on the next product GET — local-only, production throw already exists.

---

## Frozen design choices (must land in CONTRACT)

These are the picks this review is required to freeze. CONTRACT.md must copy them, not reopen them.

### 1. POST-only Server Action (CSRF). No GET logout

- **One** Server Action (name is CONTRACT’s choice, e.g. `logOut`). Same CSRF class as `logIn` / `signUp`: Next.js built-in origin check. Reject mismatched `Origin` the same way other auth mutations do.
- **No** Route Handler, **no** `GET /logout`, **no** `<form method="get">`, **no** `<a href="/logout">`.
- Do **not** add a public GET logout path to `isPublicPath` / `PUBLIC_EXACT`.
- The action POSTs to the current product or pending URL (session cookies present → middleware passes). After `Set-Cookie` expiry, the 302/navigation target is allowlisted `/login`.
- A GET must not terminate a session.

### 2. Revoke Auth, then expire cookies with matching set flags

**Order is mandatory:** revoke **then** expire so the user-scoped client still has the refresh token.

1. `createUserScopedAuthClient()` (anon/publishable key — **never** service-role).
2. `signOut({ scope: "local" })` (or equivalent that revokes **this** refresh token only). Retry once on failure (same pattern as US-14.4 `tryGlobalSignOut`, but **local**).
3. `discardSupabaseAuthCookies()` / `applySessionCookieFlags({ maxAge: 0 })` for every cookie where `isSupabaseAuthCookieName`.

**Delete flags must match set flags:** `HttpOnly`, `Secure` when `NODE_ENV === "production"`, `SameSite=Lax`, `Path=/`, **host-only** (`Domain` unset). Do **not** clamp `maxAge: 0` up to 7 days (`applySessionCookieFlags` already preserves 0 — do not regress). Leave no stale `sb-*` variant.

Cookie deletion without Auth revocation is a **fail**.

### 3. Replay must be rejected

Automated coverage: capture cookie values → run logout → replay the old `Cookie` on `getCurrentUser()` and/or `GET /dashboard` (and `/pending`) → unauthenticated (`null` user / login redirect), **not** dashboard or pending HTML.

`getCurrentUser()` already treats expired/**revoked** sessions as `null` (`getUser()`, not cookie presence). This story must make that true after logout.

### 4. Local session (this device), not global

- Scope = **this device / this session**. Shared-device outcome in USER_STORIES.
- **Do not** call `signOut({ scope: "global" })` here.
- **Do not** ship “sign out all devices” / “sign out everywhere” UI or copy.
- US-14.4 keeps `scope: "global"` on successful set-password.

### 5. Pending can log out. Do not `requireActive()`

- Wire the **same** action on `AppHeader` (product, small `"use client"` island) and `PendingActivationView` (`/pending`).
- Hint copy (`auth.pending.logoutHint`) is not a control.
- **Do not** call `requireActive()` or `requireOperator()` on this action. Inactive, missing-row, and client-role sessions must be able to leave. This is not a product/spend endpoint.
- **Idempotent:** missing / already-expired session → still expire any `sb-*` crumbs and land on login (not 500). Do not require a live session to “succeed.”

### 6. Cache-Control is US-14.5 — verify only

Authenticated product and `/pending` already send `Cache-Control: no-store` (`next.config.ts` + middleware pass-through / login 302). After logout, **Back** must not show authenticated HTML.

This story **verifies** that coverage. Only extend headers if a new gated surface is added here (none expected). Do **not** fork middleware, do **not** re-implement `requireActive()`, do **not** add a second caching scheme.

### 7. Success landing: plain `/login`. No `next` of the page they left

- Redirect/navigate to **`/login`**.
- Preserve `locale` only if it is already on the request as a query param **and** is `en` or `es`.
- Do **not** pass `next` of `/dashboard`, `/`, or `/pending`.
- Do **not** add `?loggedOut=1` (not frozen as copy; extra query surface; login copy stays generic).
- Never build an absolute URL from `Host` / `X-Forwarded-Host`.
- Subsequent `GET /dashboard` without a session uses the **existing** US-14.5 guard (`/login` + safe `next`). Do not add a “logged out” middleware branch.

### 8. Failure envelope (US-14.4 pattern)

| Situation | Cookies | Auth token | Client-visible outcome |
|---|---|---|---|
| Revoke succeeded (or there was no session to revoke) | Expire `sb-*` | This refresh token dead **or** already absent | Leave shell → `/login`. `{ ok: true }` (or `redirect()`) allowed |
| Revoke failed after retry | Still expire `sb-*` | **May still be live** on a captured copy | **Never** `{ ok: true }`. Still leave the authenticated shell → `/login` with generic `INTERNAL_ERROR` (CONTRACT picks exact envelope vs `redirect()`). No Supabase text |
| User-scoped credentials missing | Expire `sb-*` if any | Cannot revoke | Same generic internal failure as other auth actions; still leave the shell if cookies were expired |
| Forbidden keys in body | No revoke needed | Unchanged | Reject or strip before processing; do not log out as a side effect of a malformed privilege payload |

FE: disable double-submit; generic failure copy; success is the login page (not a toast on dashboard). Even on revoke-failure, **do not remain** on `AppShell` / pending as if still authenticated.

### 9. `AUTH_DEV_FALLBACK`

Hardcoded `DEV_USER` is not a real Auth session. Logout **still** expires `sb-*` and redirects to `/login`. It cannot revoke `DEV_USER` until the flag is off.

- Do **not** persist the fallback across logout (no cookie that represents `DEV_USER`).
- Do **not** invent a fake session store.
- Do **not** skip the redirect because “there is no Auth user.”
- Residual (document in CONTRACT, do not “fix” with a store): while the dual flag is on, the next product GET still resolves `DEV_USER`. Production throw if `AUTH_DEV_FALLBACK` is set remains US-14.5.

### 10. No DB / no audit row / no new packages

- No new tables, columns, enums, indexes, or RLS policies.
- Do **not** add a `logout` value to `neuramark_auth_action` (default: **no** audit row).
- No `INSERT`/`UPDATE`/`DELETE` on `neuramark_clients`.
- RLS stays enabled with zero policies. Logout does not talk to `neuramark_*` tables.
- Reuse `lib/auth/supabase-cookie.ts`, `session-cookie-flags.ts`, `forbidden-fields.ts`, `redactAuthPayload`. No new auth packages. No Upstash.

### 11. Header identity stays server-only

`AppHeader` remains a Server Component; `CurrentUser` is passed from `AppShell` after `requireActive("page")`. The client island is the interactive control only — no `getCurrentUser()` in Client Components, no `document.cookie`, no browser Supabase SDK. Pending identity stays server-passed email + display name. No second identity API.

Confirmation is **optional** (story). It is not a CSRF control. Do not block BUILD on a modal.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-14.3 are binding. Items marked **(added)** are new in this review — paste them into the story. Do not drop or weaken any existing `[SEC]` line.

- [ ] **[SEC] Logout revokes the session in Supabase Auth server-side** (sign-out / refresh-token revocation), not just cookie deletion; a captured pre-logout cookie value replayed after logout is rejected by `getCurrentUser()`
- [ ] **[SEC] Logout is a POST-only Server Action / Route Handler** with the same CSRF origin check as other auth mutations; no GET request can terminate (or be forced to terminate) a session
- [ ] **[SEC] Authenticated pages are served with `Cache-Control: no-store`** so the browser back button and shared-device history cannot render cached authenticated content after logout
- [ ] **[SEC] The cookie is cleared with attributes matching how it was set** (name, path, domain), leaving no stale variant behind
- [ ] **[SEC] (added) Surface is a POST-only Server Action** (Next.js origin check, same class as `logIn` / `signUp`) — **not** a Route Handler. No `GET /logout`, no GET form, no `<a href>` that logs out, no public GET logout path on the US-14.5 allowlist
- [ ] **[SEC] (added) Order: revoke then expire.** User-scoped `createUserScopedAuthClient` calls `signOut({ scope: "local" })` (this refresh token) **before** `discardSupabaseAuthCookies` / `applySessionCookieFlags({ maxAge: 0 })`. Service-role is forbidden on this action. Retry revoke once; if it still fails, expire cookies anyway and **never** return `{ ok: true }`
- [ ] **[SEC] (added) Cookie delete flags match set flags:** `HttpOnly`, `Secure` in production, `SameSite=Lax`, `Path=/`, host-only (`Domain` unset). Expire every `sb-*` (`isSupabaseAuthCookieName`). Do **not** clamp `maxAge: 0` up to 7 days
- [ ] **[SEC] (added) Scope is local (this device / this session), not global.** Do not call `signOut({ scope: "global" })`. Do not ship “sign out all devices” UI. US-14.4 owns global sign-out on password reset
- [ ] **[SEC] (added) Replay coverage is automated:** capture `sb-*` values, run logout, replay the old `Cookie` on `getCurrentUser()` and a product `GET /dashboard` (and `/pending`) → unauthenticated (null user / login redirect), not authenticated HTML
- [ ] **[SEC] (added) Pending can log out; do not call `requireActive()` or `requireOperator()`** on this action. The same Server Action is wired on the product header island and `/pending`. Missing / already-expired session is idempotent (expire crumbs, land on login, not 500)
- [ ] **[SEC] (added) `Cache-Control: no-store` is owned by US-14.5** on `/`, `/dashboard`, `/dashboard/:path*`, and `/pending`. This story verifies Back after logout; it must not fork middleware, re-implement guards, or add a second caching scheme. Extend headers only if this story adds a new gated surface (none expected)
- [ ] **[SEC] (added) Success lands on `/login` without `next`** of `/dashboard`, `/`, or `/pending`. Optional `locale=en|es` only if already on the request. Do not add `?loggedOut=1`. Never copy `Host` / `X-Forwarded-Host`. After logout, US-14.5 is the redirect for a later product GET
- [ ] **[SEC] (added) Logout request/result forbid `role`, `active`, `auth_user_id`, and `client_id`:** reject or strip if present. Empty input is fine. Result bodies contain no tokens, `role`, `active`, or `client_id`. No app write to `neuramark_clients`. No `logout` value on `neuramark_auth_action`
- [ ] **[SEC] (added) Header identity stays a Server Component:** client island is the control only. No `getCurrentUser()` in Client Components, no `document.cookie`, no browser Supabase SDK. Pending identity remains server-passed email + display name
- [ ] **[SEC] (added) `AUTH_DEV_FALLBACK`:** logout still expires `sb-*` and redirects; it cannot revoke `DEV_USER`. Do not persist the fallback across logout or invent a fake session store

---

## Design Concerns and Required Changes

### CONTRACT.md must freeze (non-negotiable)

When `plan/stories/US-14.3/CONTRACT.md` is authored, lock these before implementation. Security will spot-check the contract against this list.

1. **Surface** — One Server Action. No logout Route Handler. No `@supabase/supabase-js` / tokens / keys in the browser. CSRF: Next.js origin check.
2. **Revoke then expire** — Frozen design §2. Local `signOut`, then matching `maxAge: 0` flags. Replay test required.
3. **Local not global** — Frozen design §4. US-14.4 keeps global on reset.
4. **Landing** — Frozen design §7. Plain `/login`; no `loggedOut=1`; no `next` of the page they left.
5. **Pending + no `requireActive()`** — Frozen design §5. Same action on header island and pending. Idempotent.
6. **Envelope** — Frozen design §8. Never `{ ok: true }` if revoke failed. Always leave the authenticated shell after attempting logout. Generic errors; `redactAuthPayload` if any payload exists.
7. **Cache** — Frozen design §6. Verify US-14.5 `no-store`. Do not rebuild guards.
8. **Forbidden keys / empty body** — `role`, `active`, `auth_user_id` / `authUserId`, `client_id` / `clientId`. Reuse `forbidden-fields.ts` (same privilege set as login/resend). Empty / omitted body is valid.
9. **`AUTH_DEV_FALLBACK`** — Frozen design §9. Document residual; do not build a store.
10. **Out of scope (copy into CONTRACT)** — US-14.5 guard/`no-store` implementation; US-14.4 global sign-out; Path A (`GET /auth/callback`) and recovery landings; RBAC / activation UI; Interview / Ficha / visual prefs; Instagram / spend; app writes to `active` / `role`; new `neuramark_*` objects.

### Required implementation constraints

1. **Processing order:** forbidden keys (if a body is present) → do **not** `requireActive()` → user-scoped client → `signOut({ scope: "local" })` with one retry (skip/no-op if no session) → `discardSupabaseAuthCookies` → if revoke failed after retry: generic internal error **and** leave shell; else success → `/login`.
2. **User-scoped vs service-role.** This action: cookie client only. Never import `createServerSupabaseClient` / service-role here. Logout does not SELECT/UPDATE `neuramark_clients`.
3. **Do not clamp deletes.** `applySessionCookieFlags({ maxAge: 0 })` must remain `maxAge: 0`.
4. **Reuse** `discardSupabaseAuthCookies`, `createUserScopedAuthClient`, `isSupabaseAuthCookieName`, `findForbiddenLogInKeys` (or a dedicated logout alias of the same set), `redactAuthPayload`. Top-level try/catch → generic internal error (no Supabase text).
5. **FE:** PrimeReact `Button` / optional `Menu` / optional `ConfirmDialog`. Disable while pending. EN + ES (`header.*` + pending button). ES: **cerrar sesión**. No GET control. No Supabase in the bundle.
6. **Dependencies:** no new auth packages. `@supabase/ssr` already present.
7. **Allowlist:** do not add logout to `PUBLIC_EXACT`. `/login` is already public.

---

## Future-Proofing Notes

- **Cookie shape:** Names, `Path=/`, host-only, and `maxAge: 0` semantics must stay aligned with login, recovery, and refresh so every `sb-*` variant can be cleared. Do not invent `neuramark_session`.
- **Multi-device:** Local logout is the shared-device control. Stolen-session-after-password-reset remains US-14.4 global. A future “sign out everywhere” from the header would be a new story, not an extension of this freeze.
- **Tenancy / RLS:** No change. RLS stays deny-by-default with zero policies. Identity stays `getCurrentUser()`.
- **Dev fallback:** After this story, sweeps still treat leftover `return DEV_USER` on the default path as a US-14.5 finding. Logout must not paper over the flag with a fake cookie.
- **Back-door sweep hooks after implementation:** no `@supabase` / `NEXT_PUBLIC_SUPABASE` / tokens in `.next/static`; no `GET /logout` or logout Route Handler; no `signOut({ scope: "global" })` in this action; no `requireActive` / `requireOperator` on logout; grep `neuramark_clients` writes; confirm `maxAge: 0` not clamped; confirm replay test exists; confirm `/logout` not in `PUBLIC_EXACT`; confirm pending calls the same action.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-14.3/CONTRACT.md` exists, verify before coding proceeds:

- [ ] One POST-only Server Action; Next.js origin CSRF; no Route Handler; no GET logout; not on the public allowlist
- [ ] `signOut({ scope: "local" })` then expire `sb-*` with matching host-only flags; `maxAge: 0` not clamped; never service-role
- [ ] Automated replay: pre-logout cookie → after logout → `getCurrentUser()` null / product GET → login, not dashboard HTML
- [ ] Not global; no “sign out all devices”; US-14.4 keeps global on reset
- [ ] Same action on header island and `/pending`; no `requireActive()` / `requireOperator()`; idempotent if already logged out
- [ ] Landing `/login` without `next` of the left page; no `?loggedOut=1`; optional `locale` only if already valid `en`/`es`
- [ ] Never `{ ok: true }` if revoke failed; still expire cookies and leave the shell; generic errors
- [ ] Forbidden keys stripped/rejected; no tokens / `role` / `active` / `client_id` in the result; empty body OK
- [ ] Cache-Control: verify US-14.5 `no-store`; do not fork middleware or re-implement guards
- [ ] `AUTH_DEV_FALLBACK`: expire + redirect; no fake session store
- [ ] No new DB objects; no `logout` on `neuramark_auth_action`; no `neuramark_clients` writes
- [ ] Out of scope: Path A / recovery landings, US-14.4 global, US-14.5 guard implementation, RBAC/activation UI
