# Validation Report — US-14.3

**Story:** Log out  
**Date:** 2026-08-28  
**Validator:** requirements-validator (re-validation after replay test)  
**Branch:** `feature/US-14.3-logout`  
**Sources:** `plan/USER_STORIES.md` § US-14.3, `plan/stories/US-14.3/{TASKS,SECURITY,CONTRACT}.md` (FE signed off 2026-08-28), `AGENTS.md`  
**Runtime:** `npx tsx --test lib/auth/session-guards.test.ts` — **11/11 pass**, including `logOut cookie replay`. `TASKS.md` BE Replay is `[x]`. Live Auth logout against a real inbox/session was not exercised.

---

### Verdict: PASS WITH NOTES

Header and pending share one POST-only Server Action `logOut` that locally revokes this refresh token, expires matching `sb-*` cookies, and lands on `/login`. Automated replay coverage now exists and passes: capture pre-logout `sb-*`, run `logOut` (local `signOut` then `maxAge: 0`), restore the captured cookie, `getCurrentUser()` is `null`, and the US-14.5 guard composition for `/dashboard` and `/pending` is unauthenticated → login (not product HTML). Notes do not block: dashboard/pending coverage is seam-level (same helpers those routes use), not a live HTTP GET of HTML; live Auth E2E was not run.

**Blockers:** none. Previous FAIL (missing replay test) is closed.

---

### Acceptance Criteria

Criteria below are copied verbatim from `plan/USER_STORIES.md` § US-14.3, then SECURITY.md **(added)** items (binding per that review).

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Logout clears the session cookie and revokes the server-side session | **PASS** | `logOut` is a `"use server"` action (`lib/auth/actions/log-out.ts:1,102`). When a session exists it calls `signOut({ scope: "local" })` (retry once) **then** `discardSupabaseAuthCookies()` (`log-out.ts:29-43,79-85,94`). Success body is `{ ok: true, redirectTo: "/login" }` (`log-out.ts:26-27,46-47`; `lib/contracts/auth.ts:226-229`). FE `router.push`s that path (`components/auth/LogoutButton.tsx:49-76`). Replay test asserts revoke + empty cookie `maxAge: 0` (`session-guards.test.ts:305-309`). |
| After logout, protected routes redirect to login (verified with US-14.5 guard) | **PASS** | No new middleware branch. Allowlist unchanged (`lib/auth/public-routes.ts:7-14`) — `/logout` is not public. Unauthenticated product GET still 302s via cookie-presence check (`middleware.ts:59-61`) then Node `requireActive("page")` (`app/(app)/layout.tsx:16-18`; `lib/auth/require-user.ts:84-99`). Logout does not pass `next` of `/dashboard`, `/`, or `/pending` (`log-out.ts:26,46-47`; `LogoutButton.tsx:37-47,74-76`). Replay test: `/dashboard` and `/pending` stay private; null replayed user → `unauthenticated`; pending omits `next` (`session-guards.test.ts:318-331`). |
| Back button after logout does not expose authenticated data | **PASS** | Verify-only US-14.5 headers. `Cache-Control: no-store` on `/`, `/dashboard`, `/dashboard/:path*`, `/pending` (`next.config.ts:16-31`). Middleware login 302 sets `no-store` (`middleware.ts:18-25`). `dynamic = "force-dynamic"` on gated pages (`app/(app)/layout.tsx:5`; `app/(auth)/pending/page.tsx:8`). No new gated surface. |
| Copy exists in English and Spanish | **PASS** | Header + confirm: `messages/en.json:31-38`, `messages/es.json:31-38`. ES product label is **Cerrar sesión**. Pending button: `en.json:144-150`, `es.json:144-150`. Errors reuse `auth.errors.internal` / `forbiddenFields`. No “admin”, administrador, or “sign out everywhere”. |
| [SEC] Logout revokes the session in Supabase Auth server-side (sign-out / refresh-token revocation), not just cookie deletion; a captured pre-logout cookie value replayed after logout is rejected by `getCurrentUser()` | **PASS** | User-scoped `signOut({ scope: "local" })` before cookie expiry (`log-out.ts:29-31,72-85`). `getCurrentUser()` uses `auth.auth.getUser()`, not cookie presence (`lib/auth/get-current-user.ts:60-66`). Cookie deletion without revoke is not success (`log-out.ts:87-88`). Automated: capture `sb-localhost-auth-token` → `logOut()` → restore captured value → `getCurrentUser()` is `null`; mock `getUser()` fails only after local `signOut` (`session-guards.test.ts:186-216,304-316`). Cookie-delete-only would leave `refreshTokenRevoked` false and fail this test. |
| [SEC] Logout is a POST-only Server Action / Route Handler with the same CSRF origin check as other auth mutations; no GET request can terminate (or be forced to terminate) a session | **PASS** | Narrowed by SECURITY/CONTRACT to a Server Action (`"use server"` + Next.js origin check, same class as `logIn` / `signUp`). No `app/**/logout/**`. Button is `type="button"` and calls `logOut()` (`LogoutButton.tsx:9,72,119-129`). `PUBLIC_EXACT` does not include `/logout` (`public-routes.ts:7-14`). |
| [SEC] Authenticated pages are served with `Cache-Control: no-store` so the browser back button and shared-device history cannot render cached authenticated content after logout | **PASS** | Verify-only. `next.config.ts:16-31`; `middleware.ts:18-25`. No second caching scheme. |
| [SEC] The cookie is cleared with attributes matching how it was set (name, path, domain), leaving no stale variant behind | **PASS** | `discardSupabaseAuthCookies` expires every `isSupabaseAuthCookieName` (`sb-*`) via `applySessionCookieFlags({ maxAge: 0 })` (`lib/auth/supabase-cookie.ts:20-31`; `lib/auth/auth-cookie-name.ts:1-3`). Flags: `httpOnly`, `Secure` in production, `sameSite: "lax"`, `Path=/`, host-only (`session-cookie-flags.ts:26-44`; `user-scoped-credentials.ts:15-21`). `maxAge: 0` is not clamped (`session-cookie-flags.ts:38-44`; `session-guards.test.ts` idle clamp suite). Replay test asserts expired jar `value === ""` and `maxAge === 0` (`session-guards.test.ts:308-309`). |
| [SEC] (added) Surface is a POST-only Server Action (Next.js origin check, same class as `logIn` / `signUp`) — **not** a Route Handler. No `GET /logout`, no GET form, no `<a href>` that logs out, no public GET logout path on the US-14.5 allowlist | **PASS** | `log-out.ts:1,102`. No logout Route Handler. Allowlist unchanged (`public-routes.ts:7-14`). |
| [SEC] (added) Order: revoke then expire. User-scoped `createUserScopedAuthClient` calls `signOut({ scope: "local" })` (this refresh token) **before** `discardSupabaseAuthCookies` / `applySessionCookieFlags({ maxAge: 0 })`. Service-role is forbidden on this action. Retry revoke once; if it still fails, expire cookies anyway and **never** return `{ ok: true }` | **PASS** | Order: `createUserScopedAuthClient` → `getUser` → `tryLocalSignOut` (retry) → `discardSupabaseAuthCookies` (`log-out.ts:72-88`). Revoke failure → `internalError()` after expiry (`log-out.ts:87-88`). No `createServerSupabaseClient` in `log-out.ts`. Replay mock asserts `options.scope === "local"` (`session-guards.test.ts:214-217,307`). |
| [SEC] (added) Cookie delete flags match set flags: `HttpOnly`, `Secure` in production, `SameSite=Lax`, `Path=/`, host-only (`Domain` unset). Expire every `sb-*` (`isSupabaseAuthCookieName`). Do **not** clamp `maxAge: 0` up to 7 days | **PASS** | Same helpers as login/recovery (`supabase-cookie.ts:20-31,38-54`; `session-cookie-flags.ts:38-44`). |
| [SEC] (added) Scope is local (this device / this session), not global. Do not call `signOut({ scope: "global" })`. Do not ship “sign out all devices” UI. US-14.4 owns global sign-out on password reset | **PASS** | `signOut({ scope: "local" })` only (`log-out.ts:31`; test `session-guards.test.ts:215`). Global remains in `set-new-password.ts`. Copy: “Log out” / “Cerrar sesión”; confirm is “this device” / “este dispositivo” (`en.json:31-38`; `es.json:31-38`). |
| [SEC] (added) Replay coverage is automated: capture `sb-*` values, run logout, replay the old `Cookie` on `getCurrentUser()` and a product `GET /dashboard` (and `/pending`) → unauthenticated (null user / login redirect), not authenticated HTML | **PASS WITH NOTE** | `TASKS.md:51` is `[x]`. Suite `logOut cookie replay` (`session-guards.test.ts:178-342`) captures `sb-*`, runs `logOut`, restores the captured cookie, asserts `getCurrentUser()` is `null`, `/dashboard` and `/pending` are not public, `resolveActiveGuard` is `unauthenticated`, dashboard login Location keeps safe `next`, pending Location is `/login` without `next`. **Note:** dashboard/pending are asserted via the same US-14.5 helpers those routes use, not a live HTTP GET of HTML. SECURITY allows `getCurrentUser()` and/or product GET; cookie-delete-only fails this test. `npx tsx --test lib/auth/session-guards.test.ts` — 11 pass. |
| [SEC] (added) Pending can log out; do not call `requireActive()` or `requireOperator()` on this action. The same Server Action is wired on the product header island and `/pending`. Missing / already-expired session is idempotent (expire crumbs, land on login, not 500) | **PASS** | Same `logOut` from `LogoutButton` on header (`AppHeader.tsx:43-54`) and pending (`PendingActivationView.tsx:66`; `app/(auth)/pending/page.tsx:81-89`). No `requireActive` / `requireOperator` imports (`log-out.ts:98-101`). No session → skip `signOut`, expire crumbs, `{ ok: true, redirectTo: "/login" }` (`log-out.ts:75-77,94-95`). |
| [SEC] (added) `Cache-Control: no-store` is owned by US-14.5 on `/`, `/dashboard`, `/dashboard/:path*`, and `/pending`. This story verifies Back after logout; it must not fork middleware, re-implement guards, or add a second caching scheme. Extend headers only if this story adds a new gated surface (none expected) | **PASS** | Verify-only. No new gated route. |
| [SEC] (added) Success lands on `/login` without `next` of `/dashboard`, `/`, or `/pending`. Optional `locale=en\|es` only if already on the request. Do not add `?loggedOut=1`. Never copy `Host` / `X-Forwarded-Host`. After logout, US-14.5 is the redirect for a later product GET | **PASS** | Frozen literal `"/login"` (`log-out.ts:26`; `auth.ts:226-228`). FE `loginHref` appends `locale` only via `isLocale` on the current query (`LogoutButton.tsx:28-47,74-76`). No `loggedOut=1`. `INTERNAL_ERROR` also leaves the shell (`LogoutButton.tsx:49-51,74-76`). |
| [SEC] (added) Logout request/result forbid `role`, `active`, `auth_user_id`, and `client_id`: reject or strip if present. Empty input is fine. Result bodies contain no tokens, `role`, `active`, or `client_id`. No app write to `neuramark_clients`. No `logout` value on `neuramark_auth_action` | **PASS** | `findForbiddenLogOutKeys` before Zod (`forbidden-fields.ts:51-54`; `log-out.ts:51-55`) → `FORBIDDEN_FIELDS`, no revoke/expire. Extra keys → `VALIDATION_ERROR` (`log-out.ts:57-62`). Empty / omitted → `{}` (`log-out.ts:57-59`). Success schema is only `ok` + `redirectTo: "/login"` (`auth.ts:226-229`). `authAttemptActionSchema` has no `logout` (`auth.ts:13-19`). `log-out.ts` does not touch `neuramark_clients`. |
| [SEC] (added) Header identity stays a Server Component: client island is the control only. No `getCurrentUser()` in Client Components, no `document.cookie`, no browser Supabase SDK. Pending identity remains server-passed email + display name | **PASS** | `AppHeader` has no `"use client"`; receives `CurrentUser` from `AppShell` after `requireActive("page")` (`AppHeader.tsx:1-10,38-41`; `AppShell.tsx:12-16`; `dashboard/layout.tsx:16-22`). Island: `LogoutButton.tsx`. Locale from `window.location.search` only (`LogoutButton.tsx:28-35`). Pending: `loadPendingIdentity()` → email + displayName (`pending/page.tsx:63,74-79`). |
| [SEC] (added) `AUTH_DEV_FALLBACK`: logout still expires `sb-*` and redirects; it cannot revoke `DEV_USER`. Do not persist the fallback across logout or invent a fake session store | **PASS** | No fake session store. Missing credentials → expire + `INTERNAL_ERROR` (`log-out.ts:64-69`). No-session path → expire + success (`log-out.ts:94-95`). Residual (CONTRACT, not a defect): while the dual flag is on, the next product GET still resolves `DEV_USER`. Replay test deletes `AUTH_DEV_FALLBACK` so the default path is session-backed (`session-guards.test.ts:298-302`). |

---

### Convention Compliance

| Rule | Status | Evidence |
|------|--------|----------|
| EN + ES user-facing copy | **PASS** | Header + pending + confirm in both catalogs. ES **cerrar sesión**. Generic errors only. |
| Server Components by default; `"use client"` only where justified | **PASS** | `AppHeader`, `AppShell`, `PendingActivationView`, pending page are server. Only `LogoutButton` is a client island. |
| PrimeReact-first | **PASS** | `Button`, `ConfirmDialog`, `Message` (`LogoutButton.tsx:4-6`). Cancel does not call `logOut` (only `accept`). |
| Loading / empty / error / pending | **PASS** | Double-submit guard (`LogoutButton.tsx:58-69,121-124`). Success and `INTERNAL_ERROR` leave the shell. `FORBIDDEN_FIELDS` / `VALIDATION_ERROR` stay. |
| Supabase Auth behind Next.js; no SDK/tokens/keys in the browser; httpOnly session | **PASS** | Client imports the Server Action and `type LogOutResult` only (`LogoutButton.tsx:9-10`). Identity via server props / `getCurrentUser()`. |
| `neuramark_` prefix | **PASS** | No new DB objects. No `logout` on `neuramark_auth_action`. |
| Backend endpoints map to a concrete FE consumer | **PASS** | One action; consumers are `AppHeader` and `PendingActivationView`. |
| Dependencies US-14.2 / US-14.5 | **PASS** | Cookie client + `discardSupabaseAuthCookies` (US-14.2); session-backed `getCurrentUser()`, guards, `no-store` (US-14.5). |

**Tests:** `npx tsx --test lib/auth/session-guards.test.ts` — 11 pass (prior 10 + `replayed pre-logout sb-* cookies do not restore a product user after local revoke`).

---

### Frozen contract match

| Freeze | Status |
|--------|--------|
| One POST-only Server Action `logOut`; no Route Handler; no GET logout; not on public allowlist | **PASS** |
| `signOut({ scope: "local" })` then expire `sb-*`; `maxAge: 0` not clamped; never service-role | **PASS** |
| Automated replay: pre-logout cookie → after logout → `getCurrentUser()` null / product GET → login | **PASS** (`session-guards.test.ts:178-342`; TASKS.md:51 `[x]`) |
| Not global; no “sign out all devices”; US-14.4 keeps global on reset | **PASS** |
| Same action on header island and `/pending`; no `requireActive()` / `requireOperator()`; idempotent | **PASS** |
| Landing `/login` without `next` of the left page; no `?loggedOut=1`; optional `locale` only if already `en`/`es` | **PASS** |
| Never `{ ok: true }` if revoke failed; still expire cookies and leave the shell; generic errors | **PASS** |
| Forbidden keys rejected before revoke/expire; empty body OK; no tokens/`role`/`active`/`client_id` in result | **PASS** |
| Cache-Control: verify US-14.5 `no-store`; do not fork middleware | **PASS** |
| `AUTH_DEV_FALLBACK`: expire + redirect; no fake session store | **PASS** |
| No new DB objects; no `logout` on `neuramark_auth_action`; no `neuramark_clients` writes | **PASS** |
| Out of scope: Path A / recovery, US-14.4 global, US-14.5 guard implementation, RBAC/activation UI | **PASS** |
| FE signoff 2026-08-28 | **PASS** (`CONTRACT.md:1,400`) |
| JSON success, not Next.js `redirect()` | **PASS** (`log-out.ts:46-47,102`) |

Minor notes (not fails): USER_STORIES BE still says “Route Handler / Server Action”; implementation follows SECURITY/CONTRACT (Server Action only). SECURITY **(added)** `[SEC]` lines are not pasted into `USER_STORIES.md` (product-owner docs). `TASKS.md` carry-forward boxes at lines 21-23 remain `[ ]` while the BE checklist (including Replay at L51) is `[x]` — hygiene, not missing work. Hint copy remains beside the pending control (allowed).

---

### Gaps (what blocks PASS)

None. Notes below do not block.

- Replay coverage is seam-level (`getCurrentUser()` + `resolveActiveGuard` / `buildLoginLocation` / `isPublicPath`), not a live HTTP GET of `/dashboard` or `/pending` HTML. That matches SECURITY “and/or” and the US-14.5 test style.
- Live Auth logout (real refresh token against Supabase) was not exercised in this validation.

---

### Scope Creep

None material. Replay test mocks `next/headers`, `@supabase/ssr`, and the service-role module in `session-guards.test.ts` only. No GET `/logout`, no global sign-out UI, no `?loggedOut=1`, no new `neuramark_*` objects.

---

### Recommended Next Actions (and which agent should take them)

1. **qa-engineer** — author `plan/stories/US-14.3/QA.md`. Exercise: header logout (active) → `/login`; pending logout (inactive) → `/login` without `next=/pending`; confirm Cancel leaves the session; Back after logout does not show dashboard HTML; EN/ES **cerrar sesión**; replay of a captured cookie does not restore product HTML.
2. **product-owner** — after QA APPROVE, check US-14.3 boxes in `plan/USER_STORIES.md` (validator does not mark those). Optionally paste SECURITY **(added)** `[SEC]` lines into the story; optionally tick TASKS carry-forward lines 21-23.
3. **Do not commit** from this validation turn.

No implementing-agent rework required for this verdict.
