# QA Report — US-14.2

**Story:** Log in with email and password  
**Reviewer:** qa-engineer (re-audit after Medium #1 fix)  
**Date:** 2026-08-28  
**Branch:** `feature/US-14.2-login`  
**Fix commit:** `b9a208a128fa71b550a86066463ba4101c13c7ee`  
**Standard:** Enterprise-grade (production-safe for paying customers)  
**Sources:** `plan/USER_STORIES.md` § US-14.2, `plan/stories/US-14.2/{SECURITY,CONTRACT,VALIDATION,TASKS}.md`, `app/auth/callback/route.ts`

### Verdict: APPROVE

No Critical or High findings. Medium #1 is **closed**. Residual items are the four original **Lows** (optional FE / US-14.5). No new High/Critical regressions from `verifyOtp`. **No fix loop.**

US-14.1 QA Low #13 (`/pending?email=` echoed as identity) remains **closed** for display.

---

### Prior findings — verification

| # | Prior | Assigned | Status | Evidence |
|---|--------|----------|--------|----------|
| Medium 1 | Path A success dead; `token_hash` ignored | nextjs-backend | **Closed** | See below. |

**Medium #1 closed — file:line**

- `app/auth/callback/route.ts:69-98` — if `token_hash` is present, require allowlisted `type` (`:19-33`, `:70-78`), call `verifyOtp({ token_hash, type })` on the **service-role** client (`:85-90`), then Path A 302 `/login?confirmed=1` (`:96-98`).
- Service-role client is `persistSession: false` (`lib/supabase/server.ts:25-30`); comment at `callback/route.ts:85` states it must not mint cookies. Success still runs `expireSupabaseAuthCookies` (`:97`).
- PKCE `code` path unchanged: exchange → local `signOut` → expire (`:101-120`).
- Frozen landings only: `CONFIRMED_LOCATION = "/login?confirmed=1"`, `CONFIRMATION_ERROR_LOCATION = "/login?error=confirmation"` (`:16-17`, `:35-46`). `next` / `redirect_to` still unread.
- CONTRACT changelog 2026-08-28 (`CONTRACT.md:751`) and E2E path (`CONTRACT.md:215-224`) now freeze `token_hash`+`type` **or** `code`, still Path A (no durable session).

Invalid `token_hash` (runtime, rebuilt `next start :3460`): `?token_hash=fakehash&type=signup`, missing `type`, unknown `type`, `next=/dashboard`, and `error_description` all `302 Location: /login?error=confirmation`, `Referrer-Policy: no-referrer`, **no `Set-Cookie`**. Not `/dashboard` or `/pending`.

---

### Findings

No Critical. No High. No remaining Medium.

#### Low *(unchanged from first pass)*

1. **Pending identity stays in `sessionStorage` after leaving `/pending`**  
   **Where:** `components/auth/pending-identity.ts:8-14`; `components/auth/LoginForm.tsx:184-188`; `components/auth/PendingActivationClient.tsx:53-59`  
   **What:** Success to `/pending` writes `{ email, displayName }` under `neuramark.pendingIdentity`. Nothing removes it on dashboard login, tab reuse, or after read. `/pending` is not session-gated until US-14.5, so a later visit in the same tab shows the last pending identity. Values are React text nodes (no XSS). Not tokens.  
   **Why it matters:** Shared-tab leftover PII; not a cross-origin leak.  
   **Fix direction (nextjs-frontend):** `sessionStorage.removeItem` after a successful read, and clear on active (`/dashboard`) login.

2. **Failed login discards any pre-existing session before Auth returns**  
   **Where:** `lib/auth/actions/log-in.ts:146-155`  
   **What:** `discardSupabaseAuthCookies()` runs before `signInWithPassword`, and again on Auth failure. A typo on `/login` while already authenticated drops the current session. Fixation on **success** is correctly implemented (fresh cookies from this sign-in).  
   **Why it matters:** Availability / UX, not fixation. CSRF cannot trigger this cross-origin (mismatched `Origin` aborts the action).  
   **Fix direction (optional, nextjs-backend):** Discard planted cookies only after a successful sign-in, still overwriting with the new session.

3. **Locale switcher preserves untrusted query keys (`email`, `error_description`)**  
   **Where:** `components/auth/AuthLocaleSwitcher.tsx:21-26`  
   **What:** Identity is not rendered from those params. The switcher hrefs still copy the attacker-supplied query. Pending client strips identity keys in `useEffect` (`PendingActivationClient.tsx:25-41`).  
   **Why it matters:** URL/history/Referer residue only.  
   **Fix direction (nextjs-frontend):** Allowlist query keys when building locale hrefs (`locale`, `next`/`redirectTo`, `confirmed`, `error`).

4. **`@supabase/ssr` default `maxAge` (~400 days) is passed through on session cookies**  
   **Where:** `lib/auth/supabase-cookie.ts:44-46`; library default in `node_modules/@supabase/ssr/src/utils/constants.ts:3-10` (`httpOnly: false` is **overwritten** to `true` at `:38`)  
   **What:** Contract says follow `@supabase/ssr` defaults. Idle ≤ 7 days is a US-14.5 concern.  
   **Why it matters:** A stolen refresh cookie could outlive the future idle policy. Not a US-14.2 contract break.  
   **Fix direction (US-14.5):** Cap cookie lifetime when swapping `getCurrentUser()`.

---

### Regression hunt (this re-audit)

| Hunt | Result |
|------|--------|
| Session leftover after `verifyOtp` | **Pass (code + failure runtime).** `verifyOtp` uses service-role `createClient` with `persistSession: false` — no cookie adapter (`callback/route.ts:85-90`; `lib/supabase/server.ts:25-30`). Success expires `sb-*` on the 302 (`:96-98`). Failure paths had **no `Set-Cookie`**. Real-token success `Set-Cookie` still not captured (no inbox token). |
| 302 to product routes | **Pass.** Only `/login?confirmed=1` or `/login?error=confirmation`. Runtime `next=/dashboard` still 302s to `/login?error=confirmation`. |
| Enumeration | **Pass.** Missing type, unknown type, bad hash, provider `error_description` share one `Location` and copy. Provider errors are checked **before** `token_hash` (`:65-67`) so descriptions are never echoed. `token_hash` / `type` never copied into `Location`. |
| New High/Critical | **None.** |

---

### Checks Run *(this re-audit)*

| Check | Result |
|-------|--------|
| `git show b9a208a` | Callback + CONTRACT only; Path A 302 targets unchanged. |
| `npm run build` (after the fix) | **Pass** — types valid; `ƒ /auth/callback`. |
| Runtime `GET /auth/callback?token_hash=…` variants | **Pass** — generic confirmation-failure 302; no product `Location`; no `Set-Cookie`. |
| First-pass tsc/lint/bundle grep / login Auth smoke | Unchanged from prior report (login mutation not in this commit). |

---

### What Was Not Covered

- Real confirmation-email click (`token_hash` success → `/login?confirmed=1` with empty session cookie jar).
- Successful active / confirmed-inactive `logIn` cookie headers (same gap as first pass).

---

### Recommended next actions

1. **nextjs-frontend (optional):** Lows #1 and #3.
2. **product-owner:** Medium #1 is closed; remaining Lows need not block US-14.2. Confirmation inbox E2E still unproven in QA.

**Orchestrator:** **Verdict APPROVE. Medium #1 closed. New High/Critical: none. Severity now 0 Critical, 0 High, 0 Medium, 4 Low. Fix loop: no.**
