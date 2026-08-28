# QA Report — US-14.3

**Story:** Log out  
**Reviewer:** qa-engineer (re-audit after High #1 fix)  
**Date:** 2026-08-28  
**Branch:** `feature/US-14.3-logout`  
**Fix commit:** `fa48b6f` — *US-14.3: use absolute login redirect in middleware.*  
**Standard:** Enterprise-grade (production-safe for paying customers)  
**Sources:** `plan/USER_STORIES.md` § US-14.3, `plan/stories/US-14.3/{SECURITY,CONTRACT,VALIDATION,TASKS}.md`, `AGENTS.md`

### Verdict: APPROVE

No Critical. No High. Prior High #1 is **closed**. Residual items are the original **Lows** (test-file `tsc`; live Auth E2E). **No fix loop.**

The logout mutation is unchanged and still sound: **no GET logout**, **POST-only Server Action CSRF**, **matching `maxAge: 0` cookie flags**, **replay unit test passes**.

Hardcoded `gaveho@gmail.com` / Gabriel Vega remains **only** on the dual-flag dev path. Sanctioned. `AUTH_DEV_FALLBACK` residual after logout is documented in CONTRACT — not a production finding.

---

### Prior findings — verification

Do not trust the implementer; each assigned-closed item was re-read at file:line and re-probed over HTTP.

| # | Prior | Assigned | Status | Evidence |
|---|--------|----------|--------|----------|
| High 1 | No-cookie product GET 500s (relative Edge `Location`) | nextjs-backend | **Closed** | See below. |
| Low 1 | `tsc --noEmit` fails on replay test | optional | **Open** | Unchanged. |
| Low 2 | Replay seam-level; live Auth not run | optional | **Open (narrowed)** | HTTP no-cookie 302 now proven. Live GoTrue still not run. |

**High #1 closed — file:line** (`fa48b6f`)

- `middleware.ts:19-37,70-72` — no `sb-*` calls `loginRedirect` → `buildAbsoluteLoginLocation` + `NextResponse.redirect(location, 302)` + `Cache-Control: no-store`. Relative `NextResponse({ Location: "/login?…" })` is gone.
- Origin: `SITE_URL` first, then `request.nextUrl.origin` (`login-redirect.ts:32-65,71-82`). Does not read `Host` / `X-Forwarded-Host` headers. Unit test: spoofed `appOrigin` loses to `SITE_URL` (`session-guards.test.ts:145-177`). Pending still omits `next` (`:154-161`, `:197-206`).
- Runtime (`AUTH_DEV_FALLBACK= npx next start -p 3465` after `AUTH_DEV_FALLBACK= npm run build`):

  | Request | Cookie | Result |
  |---------|--------|--------|
  | `GET /dashboard` | none | **302** `Location: /login?next=%2Fdashboard`, `Cache-Control: no-store` |
  | `GET /pending` | none | **302** `Location: /login` (**no `next`**), `Cache-Control: no-store` |
  | `GET /` | none | **302** `Location: /login?next=%2F`, `no-store` |
  | `GET /dashboard?locale=es` | none | **302** `/login?locale=es&next=%2Fdashboard` |
  | `GET /pending?locale=es` | none | **302** `/login?locale=es` (no `next`) |
  | `GET /dashboard` | `Host: evil.example` | **302** `/login?next=%2Fdashboard` (not evil origin) |
  | `GET /dashboard` | `X-Forwarded-Host: evil.example` | **302** `/login?next=%2Fdashboard` |
  | `GET /dashboard` | fake `sb-*` | **307** `/login?next=%2Fdashboard`, `no-store` (Node `requireActive`) |

  No `TypeError: Invalid URL` on the production server log for these requests.

---

### Findings

No Critical. No High. No new Medium.

#### Low *(unchanged / narrowed)*

1. **`npx tsc --noEmit` fails on the replay test; `next build` still typechecks**  
   **Where:** `lib/auth/session-guards.test.ts:368` (`process.env.NODE_ENV = "test"` — TS2540), `:373` and `:383` (dynamic `import("./….ts")` — TS5097).  
   **What:** `fa48b6f` did not touch these lines. `next build` “Checking validity of types” succeeds.  
   **Fix direction:** Optional. Assign `NODE_ENV` via index/`as`; drop the `.ts` suffix on dynamic imports.

2. **Live Auth logout / cookie replay against GoTrue was not exercised**  
   **Where:** `lib/auth/session-guards.test.ts` replay suite (13/13 including new absolute-URL cases).  
   **What:** Seam-level replay still passes. Post-logout **HTTP** no-cookie `/dashboard` and `/pending` now 302 to login (High #1). A real refresh-token capture → `logOut` → replay on `GET /dashboard` HTML was not run.  
   **Fix direction:** Optional later inbox E2E. Do not block merge.

---

### Confirmations (this re-audit)

| Ask | Result |
|-----|--------|
| `GET /dashboard` no cookie → login, not 500 | **Yes.** 302 `/login?next=%2Fdashboard`, `no-store`. |
| `GET /pending` no cookie → login without `next`, not 500 | **Yes.** 302 `/login`. |
| Absolute Edge redirect; `SITE_URL` wins over spoofed origin | **Yes.** `login-redirect.ts:60-64,77-81`; tests `:145-177`. HTTP Host / `X-Forwarded-Host` still 302 to `/login?…`. |
| GET `/logout` still does not terminate a session | **Yes.** No cookie: 302 login (`next=/logout` — deny-by-default, not a logout action). With `sb-*`: **404**, **no `Set-Cookie`**. |
| No new High/Critical | **None found.** |

---

### Hunt results *(re-audit)*

| Hunt | Result |
|------|--------|
| GET logout | **Pass.** Unchanged action/UI. HTTP: cookie 404 no `Set-Cookie`; no-cookie 302 login (not session teardown). |
| CSRF | **Pass.** Unchanged Server Action. Fix did not add a GET logout route or public allowlist entry. |
| Cookie leftover | **Pass (code).** Unchanged `discardSupabaseAuthCookies` / `maxAge: 0`. |
| Replay | **Pass with note.** Unit 13/13. HTTP no-cookie product GET → login (not dashboard HTML). Live GoTrue not run. |

**Back doors:** Middleware grep after rebuild: `SERVICE_ROLE`/`SUPABASE_SECRET_KEY`/`neuramark_clients`/`X-Forwarded-Host` 0; `SITE_URL` 1; `SUPABASE_ANON_KEY` 2; idle `604800` 2. No logout Route Handler.

---

### Checks Run *(this re-audit)*

| Check | Result |
|-------|--------|
| `git show fa48b6f --stat` | `middleware.ts`, `lib/auth/login-redirect.ts`, `lib/auth/session-guards.test.ts` |
| `npx tsx --test lib/auth/session-guards.test.ts` | **13/13 pass** (prior 11 + absolute SITE_URL + `NextResponse.redirect`) |
| `npx tsc --noEmit` | **Fail** — same 3 errors in `session-guards.test.ts` only (Low #1) |
| `npm run lint` | Pass with warning: `SignupForm.tsx` unused `copy` (pre-existing) |
| `AUTH_DEV_FALLBACK= npm run build` | Pass — Next.js 15.5.20. No `/logout` route. Middleware 94.5 kB |
| HTTP `AUTH_DEV_FALLBACK= npx next start -p 3465` | **GET /dashboard and /pending no cookie → 302 login, not 500.** Host / `X-Forwarded-Host` spoof still `/login`. GET `/logout` + cookie → 404 no `Set-Cookie` |

---

### What Was Not Covered

- Live Supabase Auth `signOut({ scope: "local" })` against a real refresh token, then replay of the captured `Cookie` on `GET /dashboard` HTML.
- Browser E2E: header logout → `/login`; pending logout without `next=/pending`; confirm Cancel; Back after logout (`AUTH_DEV_FALLBACK` residual still applies locally while the flag is on).
- Other-device session survival (local vs global) against live Auth.

---

### Fix loop

None for merge. Low #1 may wait. Low #2 is optional live E2E.

Do **not** treat the `AUTH_DEV_FALLBACK` leftover identity as a US-14.3 production defect. Do **not** add `GET /logout`. Do **not** commit from this review.
