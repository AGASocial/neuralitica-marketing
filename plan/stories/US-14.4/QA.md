# QA Report — US-14.4

**Story:** Reset forgotten password  
**Reviewer:** qa-engineer (re-audit after Medium fixes)  
**Date:** 2026-08-28  
**Branch:** `feature/US-14.4-reset-password`  
**Fix commits:** `623c39e` (BE sign-out fail-closed + Path A `token_hash` without type), `7e83ebf` (FE locale allowlist)  
**Standard:** Enterprise-grade (production-safe for paying customers)  
**Sources:** `plan/USER_STORIES.md` § US-14.4, `plan/stories/US-14.4/{SECURITY,CONTRACT,VALIDATION,TASKS}.md`, `AGENTS.md`

### Verdict: APPROVE

No Critical or High findings. Both Mediums are **closed**. Low #1 (Path A forward when `type` is missing) is **closed** in the same BE commit. Residual is the original **Low #2** (cookie `maxAge` ~400 days, US-14.5). **No fix loop.**

Hardcoded `getCurrentUser()`, logout UI, spend guard, and dashboard OTP config remain sanctioned / out of scope.

---

### Prior findings — verification

Do not trust the implementer; each assigned-closed item was re-read at file:line.

| # | Prior | Assigned | Status | Evidence |
|---|--------|----------|--------|----------|
| Medium 1 | Global `signOut` failure swallowed; action still `{ ok: true }` | nextjs-backend | **Closed** | See below. |
| Medium 2 | Locale switcher copied `token_hash` / `code` / `type` into HTML hrefs | nextjs-frontend | **Closed** | See below. |
| Low 1 | Path A forwarded recovery only when `type=recovery` | nextjs-backend (optional) | **Closed** | See below. |
| Low 2 | `@supabase/ssr` ~400-day cookie `maxAge` | US-14.5 | **Open (deferred)** | Unchanged. |

**Medium #1 closed — file:line** (`623c39e`)

- `lib/auth/actions/set-new-password.ts:34-49` — `tryGlobalSignOut` returns `true` only when `signOut({ scope: "global" })` has no error; logs `code`/`status` only (no password).
- `:108-117` — first attempt, one retry, then `discardSupabaseAuthCookies()`, then **`internalError()` if still not revoked**. `{ ok: true, redirectTo: "/login?reset=1" }` only after revocation (`:119-122`).
- Local cookies are discarded even when revocation fails (`:113` before the `internalError` return).

**Medium #2 closed — file:line** (`7e83ebf`)

- `components/auth/AuthLocaleSwitcher.tsx:9-16,26-41` — hrefs are built from an allowlist (`next`, `redirectTo`, `confirmed`, `error`, `reset`) plus `locale`. No copy of `searchParams.toString()`.
- Runtime (`next start :3462`): `GET /reset-password/new?token_hash=SECRETHASH&type=recovery&code=SECRETCODE&error_description=nope&error=invalid` rendered locale hrefs `/reset-password/new?locale=en&error=invalid` and `…locale=es&error=invalid` only. Login still preserves `reset` / `confirmed`.

**Low #1 closed — file:line** (`623c39e`)

- `app/auth/callback/route.ts:94-98` — `token_hash` with missing or unknown `type` (`parseEmailOtpType` null) 302s to `/auth/callback/recovery` without `verifyOtp`. `type=signup` / `type=email` still Path A (`parseEmailOtpType` succeeds).
- Runtime: no-type and `type=not-a-real-type` → `Location: /auth/callback/recovery?…`; `type=signup` still `/login?error=confirmation`; `type=recovery` still forwarded.

---

### Findings

No Critical. No High. No remaining Medium.

#### Low *(unchanged)*

1. **Recovery session cookies inherit `@supabase/ssr` ~400-day `maxAge`** *(prior Low #2)*  
   **Where:** `lib/auth/supabase-cookie.ts:44-46`; library default in `node_modules/@supabase/ssr/src/utils/constants.ts:3-10` (`httpOnly: false` is overwritten to `true` at `:38`)  
   **What:** Contract freezes follow `@supabase/ssr` defaults. Idle ≤ 7 days is US-14.5. Abandoned recovery click leaves a long-lived `sb-*` cookie. This flow does not 302 to product routes.  
   **Why it matters:** After US-14.5 identity swap, that leftover cookie becomes a real session.  
   **Fix direction (US-14.5):** Cap cookie lifetime when swapping `getCurrentUser()`.

---

### Regression hunt (this re-audit)

| Hunt | Result |
|------|--------|
| Sign-out fail-open | **Closed.** Success JSON requires `revoked === true`. |
| Token in locale hrefs | **Closed.** Allowlist excludes `token_hash`, `code`, `type`, `error_description`. |
| Path A consuming recovery | **Pass.** `type=recovery` still forwarded without `verifyOtp`. Missing/unknown type + `token_hash` now forwarded instead of confirmation-failure. Frozen `type=signup` landing unchanged. |
| `{ ok: true }` without revocation | **Pass (code).** Unreachable if both `tryGlobalSignOut` calls fail. |
| New High/Critical | **None.** |

Note: Next.js RSC still serializes the **current request** query into the flight payload when the browser already opened `/reset-password/new?token_hash=…`. That is the URL the client requested, not the locale switcher copying tokens into new links. Happy-path callback 302s remain token-free.

---

### Checks Run *(this re-audit)*

| Check | Result |
|-------|--------|
| `git show 623c39e` / `7e83ebf` | BE: `set-new-password.ts` + Path A + CONTRACT. FE: `AuthLocaleSwitcher.tsx` only. |
| `npx tsc --noEmit` | **Pass** |
| `npm run lint` | **Pass** — same pre-existing warnings (`SignupForm.tsx:81`, `supabase-cookie.ts:113`). No new warnings in the fix files. |
| `npm run build` | **Pass** — types valid; `ƒ /reset-password`, `ƒ /reset-password/new`, `ƒ /auth/callback`, `ƒ /auth/callback/recovery`. |
| Client-bundle grep (`.next/static`) | **Pass** — no `token_hash`, `@supabase`, `NEXT_PUBLIC_SUPABASE`. |
| Runtime `next start :3462` | **Pass** — Path A no-type / unknown-type forward; signup landing frozen; locale hrefs token-free. |

---

### What Was Not Covered

- Live inbox E2E (known vs unknown send, real token exchange, new password vs old at `logIn`).
- Forcing Auth `signOut` to fail in order to observe `INTERNAL_ERROR` after a real `updateUser` (code path reviewed only).
- Cross-origin CSRF against Server Actions (unchanged Next.js origin check).

---

### Recommended next actions

1. **product-owner:** Mediums closed; remaining Low #2 need not block US-14.4. Live inbox E2E still unproven.
2. **US-14.5:** Cookie idle / `maxAge` cap (Low #2).

**Orchestrator:** **Verdict APPROVE. Medium #1 and #2 closed. Low #1 closed. New High/Critical: none. Severity now 0 Critical, 0 High, 0 Medium, 1 Low. Fix loop: no.**
