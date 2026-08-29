# QA Report — US-2.1

**Story:** View canonical business profile  
**Reviewer:** qa-engineer  
**Date:** 2026-08-29  
**Branch:** `feature/US-2.1-view-business-profile`  
**Commits:** `76e84c3` (FE), `10da494` (BE), `9df3e42` (sprint)  
**VALIDATE:** PASS WITH NOTES (`plan/stories/US-2.1/VALIDATION.md`)  
**Standard:** Enterprise-grade (production-safe for paying customers)  
**Sources:** `plan/USER_STORIES.md` § US-2.1, `plan/stories/US-2.1/{SECURITY,CONTRACT,TASKS,VALIDATION}.md`

Auth is real (US-14.5). Sanctioned local-dev fallback user is **not** a finding. This story is **read-only** — no profile mutations.

### Verdict: APPROVE WITH NOTES

No Critical. No High. **0 Medium.** **1 Low** (BE test-gap — non-blocking). **No fix loop / no FE–BE re-delegation required.**

Security acceptance criteria and CONTRACT freeze are met for IDOR/arity-0, XSS text nodes, `/profile` `no-store` + gated route, no tenant oracle, no `client_id` surface, dashboard primary-card elevation (not hard redirect), and Zod soft-fail on invalid `fields`. Residual: no live browser/DB E2E this gate. **CLOSE can proceed: yes.**

---

### Findings

No Critical. No High. No Medium.

#### Low

1. **`getBusinessProfileForClient` is not driven under a mocked `requireActive` + Supabase harness**  
   **Where:** `lib/profile/get-business-profile-for-client.ts:19-37`; `lib/profile/get-business-profile-for-client.test.ts` (arity + `mapBusinessProfileRow` only).  
   **What:** Unit coverage proves arity 0, mapper missing / view / `loadFailed`, DTO omits UUIDs, and stub thin-adapter shapes. There is no test that mocks Supabase and asserts `.eq("client_id", user.id)`, select column list, or that a forged foreign id cannot reach the query (vacuously true by arity, but unproven at the call site). Same residual class as US-1.1 / US-1.2 / US-1.3.  
   **Why it matters:** A future edit that adds an optional tenant arg could regress IDOR without a red test at the helper boundary.  
   **Fix direction (non-blocking, BE):** Add a mocked-helper test: configured Supabase → assert filter `client_id = requireActive().id`; unconfigured → `loadFailed`; never pass query/body ids.

---

### Must-check hunt (file:line)

| Check | Result | Evidence |
|-------|--------|----------|
| **IDOR / arity-0** | **Pass** | `getBusinessProfileForClient()` no params (`get-business-profile-for-client.ts:19`); identity `requireActive("page")` then `.eq("client_id", user.id)` (`20-31`); test `length === 0` (`get-business-profile-for-client.test.ts:43-58`). Stub adapter also arity 0 (`get-profile-stub-summary.ts:12`; test `180-198`). |
| **No `client_id` / profile id surface** | **Pass** | No `searchParams` on `/profile`; no `/profile/[id]`; no `/api/profile`. Select omits `id` / `client_id` / `source_interview_id` (`get-business-profile-for-client.ts:30`). DTO JSON assert excludes those keys (`test.ts:94-97`). |
| **No foreign-tenant oracle** | **Pass** | Missing → `{ exists: false }` (`map-business-profile-row.ts:47-48`); select/Zod fail → `{ exists: false, loadFailed: true }` (`42-57`). No foreign-id route that could return distinct forbidden vs not-found. |
| **Zod soft-fail on invalid fields** | **Pass** | `interviewAnswersCompleteSchema.safeParse` (`map-business-profile-row.ts:51-57`); invalid → soft `loadFailed`, log `{ code }` only; garbage not in result (`test.ts:100-114`). Invalid `version` omitted without failing the view (`125-139`). |
| **XSS — React text nodes** | **Pass** | Descriptions / list items as `{description}` / `{item}` children (`LivingProfileView.tsx:186-201`). Empty lists → i18n copy (`192-194`). Grep: no `dangerouslySetInnerHTML` in product TS/TSX (comment only on profile view). PrimeReact `Message` uses `text` for empty/error bodies (`65-68`, `80-83`). |
| **`Cache-Control: no-store` + `force-dynamic`** | **Pass** | `next.config.ts:37-42` (`/profile`, `/profile/:path*`); `export const dynamic = "force-dynamic"` on profile (`page.tsx:7`) and dashboard (`dashboard/page.tsx:13`). |
| **Off `isPublicPath` + `requireActive`** | **Pass** | Under `app/(app)/profile/`; layout `requireActive("page")` (`layout.tsx:16-17`); helper re-asserts (`get-business-profile-for-client.ts:20`); `isPublicPath("/profile") === false` (probe + `session-guards.test.ts:108`). |
| **Dashboard: elevate, not hard redirect** | **Pass** | When `profile.exists === true`, profile card first (`dashboard/page.tsx:114-127`). Links `href: "/profile"` only — no tenant query (`109-111`). App root `redirect("/dashboard")` only (`app/(app)/page.tsx:5-6`) — never `/profile`. |
| **Missing / loadFailed UX** | **Pass** | Missing → CTA `/interview` (`LivingProfileView.tsx:77-105`). Soft error → dashboard CTA, shell intact (`62-74`; page try/catch `35-42`). |
| **Read-only / no PATCH** | **Pass** | No edit controls in `LivingProfileView`. No profile PATCH Server Action / Route Handler in US-2.1 commits. Writes remain US-1.3 upsert only. |
| **No `getBusinessProfileForAgents`** | **Pass** | Grep: not present in product code. |
| **No Operator cross-tenant** | **Pass** | No `as_client_id` / `requireOperator` on profile path. |
| **Client bundle / secrets** | **Pass** | Helpers `import "server-only"`. `LivingProfileView` has no `@supabase/supabase-js`. Types-only import from `lib/contracts/profile`. |
| **No free-text fields in logs** | **Pass** | Logs `{ code }` / static strings only (`map-business-profile-row.ts:43, 55-56`; `get-business-profile-for-client.ts:23`). |
| **`neuramark_` prefix / RLS** | **Pass** (verify-only) | Reads `neuramark_business_profiles` only. No new migration in US-2.1 commits. |
| **EN/ES terminology** | **Pass** | Living profile / Ficha viva; Style / Estilo (`messages/en.json` + `es.json` `profile.*`). No CONTEXT _Evitar_ primary labels. |

---

### Focus confirmation (requested)

| Focus | Result | Owner if fail |
|-------|--------|----------------|
| IDOR / arity-0 | **Pass** | — |
| XSS text nodes | **Pass** | — |
| `no-store` `/profile` | **Pass** | — |
| Missing / no oracle | **Pass** | — |
| No `client_id` | **Pass** | — |
| Dashboard no hard redirect | **Pass** | — |
| Zod soft-fail invalid fields | **Pass** | — |

---

### Confirmations (CONTRACT / SECURITY)

| Topic | Result |
|-------|--------|
| AC: Profile renders all core fields from interview | **Pass** (code). Seven keys via `INTERVIEW_STEP_ORDER` + Zod-complete `fields`. |
| AC: Profile loads on dashboard as default post-onboarding view | **Pass** as CONTRACT primary-card elevation (not hard redirect). |
| AC: Missing profile shows onboarding CTA, not empty crash | **Pass.** |
| `[SEC]` Profile fetched by server-resolved user; no arbitrary `client_id` | **Pass.** |
| Stub replaced in place at `/profile` | **Pass.** `ProfileStubView` removed; `getProfileStubSummary` thin-wraps full helper. |
| Out of scope (US-2.2 PATCH, US-2.3 agent helper, public API) | **Pass.** Not introduced. |

---

### Critical / High fix ownership

**None.** No Critical or High findings. No FE vs BE re-delegation for a fix loop.

| Finding | Owner |
|---------|-------|
| Low #1 — mocked helper SELECT / `.eq("client_id", user.id)` harness | **BE** (optional follow-up) |

---

### Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/profile/get-business-profile-for-client.test.ts` | **8/8 pass** |
| `npx tsx --test lib/auth/session-guards.test.ts` | **13/13 pass** (includes `isPublicPath("/profile") === false`) |
| `npx tsx -e` `isPublicPath('/profile'|'/profile/')` | Both **`false`** |
| `npx eslint` on US-2.1 changed TS/TSX (helper, mapper, stub, contracts/profile, profile page, dashboard, LivingProfileView) | **exit 0** |
| `npx tsc --noEmit` | **Errors only in test files** (`.ts` import extensions / `NODE_ENV` assign) — pre-existing harness pattern; **not** product compile blockers |
| Grep product TS/TSX for `dangerouslySetInnerHTML`, `getBusinessProfileForAgents`, `/api/profile`, `as_client_id`, client `@supabase` on profile surfaces | Clean (comment-only XSS note; no agent helper / public API) |

---

### What Was Not Covered

- Live browser E2E (authenticated `/profile` with real row; missing CTA; dashboard card order; `?client_id=` ignored).
- Live Zod-corrupt row / select failure against Postgres.
- Applying / re-verifying `neuramark_business_profiles` migration on a live Supabase this gate (verify-only; no new migration).
- Full `next build` (not required given targeted lint + unit evidence; tsc noise confined to tests).
- PrimeReact `Message` internal DOM audit beyond `text` prop usage (treated as text path consistent with US-1.3 stub QA).

---

### CLOSE

**yes** — no Critical/High; no blocking Medium; optional Low test harness only. Product-owner may check US-2.1 AC boxes and close the story without a fix loop.
