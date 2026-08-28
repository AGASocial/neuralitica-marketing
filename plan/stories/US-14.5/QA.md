# QA Report — US-14.5

**Story:** Session-backed identity and route protection  
**Reviewer:** qa-engineer (re-audit after High/Medium fix)  
**Date:** 2026-08-28  
**Branch:** `feature/US-14.5-session-guards`  
**Fix commit:** `366306e` — *US-14.5: refresh session cookies in middleware, not RSC.*  
**Standard:** Enterprise-grade (production-safe for paying customers)  
**Sources:** `plan/USER_STORIES.md` § US-14.5, `plan/stories/US-14.5/{SECURITY,CONTRACT,VALIDATION,TASKS}.md`, `AGENTS.md`

### Verdict: APPROVE

No Critical. No High. Prior High #1 and Medium #1 are **closed**. Residual is the original **Low #1** (operator page 403 digest) — deferred until an operator page exists. **No fix loop.**

Hardcoded `gaveho@gmail.com` / Gabriel Vega remains **only** on the dual-flag dev path. Sanctioned.

---

### Prior findings — verification

Do not trust the implementer; each assigned-closed item was re-read at file:line.

| # | Prior | Assigned | Status | Evidence |
|---|--------|----------|--------|----------|
| High 1 | RSC `getUser()` refresh → `cookies().set` throw → mapped to `null`; refresh token rotated; idle ≤ 7 days broken | nextjs-backend | **Closed** | See below. |
| Medium 1 | Inactive sessions not gated on pages outside `/dashboard` and `/` | nextjs-frontend + nextjs-backend | **Closed** | See below. |
| Low 1 | `requireOperator("page")` uses private Next.js 403 digest | deferred | **Open** | Unchanged. No operator pages yet. |

**High #1 closed — file:line** (`366306e`)

- **Edge write path:** Non-public + `sb-*` present calls `refreshSessionCookiesOnEdge` (`middleware.ts:55-64`). `createServerClient` uses **anon/publishable key only** (`refresh-session-cookies.ts:60-63`, `user-scoped-credentials.ts:7-12,24-34`). `getUser()` result is **not** used to 302 (`:84-90` — catch passes through; Node `requireActive` remains the boundary).
- **Set-Cookie on the document GET:** `setAll` writes `response.cookies.set(name, value, applySessionCookieFlags(options))` (`refresh-session-cookies.ts:74-76`). Clamp still 604800s (middleware bundle contains `604800` ×2). Also `request.cookies.set` then rebuilds `NextResponse.next` with copied headers so the Cookie header is updated (`RequestCookies.set` writes `cookie` on `request.headers`; `continueWithPathHeaders` copies `request.headers` after that).
- **RSC read-only:** `getCurrentUser` uses `createReadOnlyUserScopedAuthClient` (`get-current-user.ts:62-67`). `setAll` is a no-op (`supabase-cookie.ts:62-76`) — cannot throw `ReadonlyRequestCookiesError`. Successful `getUser()` assigns `user` and returns identity **outside** the catch (`:60-81`); only `error` / missing id / thrown failure → `null`. Login/reset still use the writable Server Action client (`supabase-cookie.ts:38-54`).
- Public allowlist still skips refresh (`middleware.ts:55-57`; tests `session-guards.test.ts:104-117`) so US-14.4 set-password is not 302'd to product.

**Medium #1 closed — file:line** (`366306e`)

- Product route group `app/(app)/layout.tsx:16-18` calls `requireActive("page")`. New pages under `app/(app)/` inherit the gate. Auth + `/pending` stay outside (`app/(auth)/`, `app/auth/callback/`). Root `app/layout.tsx` is ungated.
- URLs unchanged: `next build` still emits `ƒ /` and `ƒ /dashboard` (no `(app)` in the path). Home `app/(app)/page.tsx:5-6` is `redirect("/dashboard")` **after** the parent gate (inactive never reaches it; anon is middleware-302'd).
- Nested `app/(app)/dashboard/layout.tsx:16-18` may call `requireActive` again for AppShell (React `cache()`). CONTRACT changelog records this FE-freeze update.

---

### Findings

No Critical. No High. No new Medium.

#### Low *(unchanged)*

1. **Operator page 403 uses a private Next.js HTTP-error digest**  
   **Where:** `lib/auth/require-user.ts:39-44,72-77` (`throwPageForbidden` / `NEXT_HTTP_ERROR_FALLBACK;403`).  
   **What:** No operator pages exist yet. Handler mode already throws `AuthGuardError`.  
   **Fix direction:** When an operator page exists, use a supported 403 (`forbidden()` / `NextResponse`).

---

### Confirmations (this re-audit)

| Ask | Result |
|-----|--------|
| Middleware anon-key refresh writes Set-Cookie on product GET | **Yes.** `refresh-session-cookies.ts:63-76` + `middleware.ts:59-64`. Public paths skip. `getUser()` does not 302. |
| RSC `getCurrentUser` read-only adapter; successful `getUser` not mapped to `null` | **Yes.** `supabase-cookie.ts:62-76`; `get-current-user.ts:60-81`. |
| Product group layout `requireActive`; URLs still `/` and `/dashboard` | **Yes.** `app/(app)/layout.tsx`; build routes `ƒ /`, `ƒ /dashboard`. |
| No service-role in middleware | **Yes.** Source: only `SUPABASE_ANON_KEY` / `PUBLISHABLE_KEY`. Built `.next/server/middleware.js`: `SERVICE_ROLE` 0, `SUPABASE_SECRET_KEY` 0, `neuramark_clients` 0, `SUPABASE_ANON_KEY` 2, `createServerClient` present. |
| No new High/Critical | **None found.** |

---

### Special — `AUTH_DEV_FALLBACK` vs `next build` (unchanged, intended)

Fail-closed on any non-empty `AUTH_DEV_FALLBACK` when `NODE_ENV=production`. Not a finding. Keep unset on Vercel Production **and** Preview. Local `.env` still has `AUTH_DEV_FALLBACK=true`; `AUTH_DEV_FALLBACK= npm run build` succeeds.

---

### Hunt results *(re-audit)*

| Hunt | Result |
|------|--------|
| Bypass of `requireActive` (direct Server Action) | **Pass (inventory).** Still no product Server Actions. Auth actions do not call `requireActive`. Product **pages** now inherit the gate via `app/(app)/`. |
| Identity from headers / middleware | **Pass.** Still only `x-neuramark-pathname` / `x-neuramark-locale`. Middleware `getUser()` is cookie rotation only — not a 302/identity signal. |
| Service-role in middleware / Edge / client | **Pass.** See confirmations. Client `.next/static` clean. Middleware 94.4 kB (up from 34.9 kB — `@supabase/ssr` on Edge, expected). |
| Dev fallback in production | **Pass.** Unchanged dual flag + throw. |
| Cookie `maxAge` > 7 days | **Pass.** Edge `setAll` uses `applySessionCookieFlags`. Idle 604800 present in middleware.js. |
| Anon `/pending` oracle | **Pass.** `/pending` not public; no-cookie → `/login` without `next`. Cookie present → Edge refresh then `loadPendingIdentity()`. |
| Recovery leftover without `active` | **Pass.** Frozen: real session + Node `active` gate. Reset paths stay public (no Edge refresh, no product 302). |
| Cache of `active` / `role` | **Pass.** Unchanged per-request SELECT + React `cache()`. |
| App write path for `active` / `role` | **Pass.** Unchanged. Seed only. |

**Back doors:** No `eval` / client Supabase / `NEXT_PUBLIC_` Supabase / `sessionStorage` identity. `DEV_USER` dual-flag only.

---

### Checks Run *(this re-audit)*

| Check | Result |
|-------|--------|
| `git show 366306e --stat` | Middleware refresh module, read-only RSC client, `app/(app)/` group, CONTRACT note. |
| `npx tsc --noEmit` | Pass |
| `npm run lint` | Pass with warning: `SignupForm.tsx` unused `copy` (pre-existing). `_headers` unused warning **gone**. |
| `npx tsx --test lib/auth/session-guards.test.ts` | **10/10 pass** (added Edge refresh allowlist cases) |
| `AUTH_DEV_FALLBACK= npm run build` | Pass — Next.js 15.5.20. Routes: `ƒ /`, `ƒ /dashboard`, `ƒ /pending`, auth + callbacks. Middleware 94.4 kB |
| Client bundle grep `.next/static` | **Clean** — no `SERVICE_ROLE`, `SUPABASE_SECRET`, `AUTH_DEV_FALLBACK`, `NEXT_PUBLIC_SUPABASE`, `@supabase`, `supabase-js`, `refresh_token` |
| Middleware grep `.next/server/middleware.js` | **Clean of service-role** — `SERVICE_ROLE`/`SUPABASE_SECRET_KEY`/`neuramark_clients` 0; `SUPABASE_ANON_KEY` present; `604800` present |

---

### What Was Not Covered

- Live 1-hour access-token expiry → Set-Cookie refresh on a real session (code + Next.js cookie-header update + Edge `setAll` reviewed; not waited out in a browser).
- Live SQL `active` / `role` flip.
- Browser E2E of redirects and header identity.
- Vercel dashboard env (local `.env` only).

---

### Fix loop

None for merge. Low #1 may wait until an operator page exists.

Do **not** treat the `AUTH_DEV_FALLBACK` production/`next build` throw as a defect. Do **not** ship logout UI (US-14.3). Do **not** commit from this review.
