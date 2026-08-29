# Validation Report — US-2.1

**Story:** View canonical business profile  
**Validator:** requirements-validator  
**Date:** 2026-08-29  
**Branch:** `feature/US-2.1-view-business-profile`  
**Commits reviewed:** `76e84c3` (FE), `10da494` (BE)  
**Contract:** Frozen, Reviewed by FE (2026-08-29)  
**SPEC-REVIEW:** ALIGNED  
**SECURITY:** APPROVE WITH CONDITIONS (binding freeze encoded in CONTRACT)  
**Tests re-run:** `npx tsx --test lib/profile/get-business-profile-for-client.test.ts` → **8/8 pass**  
**Live browser / DB E2E:** **Not run** this gate (code + unit evidence only)

---

### Verdict: PASS WITH NOTES

All four USER_STORIES acceptance criteria and the SECURITY.md `[SEC]` floors for US-2.1 (story + added + inherited re-assertions relevant to `/profile` read path) are met in the implementation. Residual notes: no live browser/session E2E against a real profile row; dashboard “default post-onboarding view” is implemented as **primary card elevation** (CONTRACT freeze), not a hard redirect.

On PASS, the product-owner — not this validator — checks the story’s acceptance criteria in `plan/USER_STORIES.md`.

---

### Acceptance Criteria

Criteria 1–4 are verbatim from `plan/USER_STORIES.md` § US-2.1. Criteria below that are SECURITY.md `[SEC]` items (inherited re-asserted for profile read + story `[SEC]` + **(added)**).

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Profile renders all core fields from interview | **PASS** | `LivingProfileView` maps `INTERVIEW_STEP_ORDER` (seven keys: services, zone, tone, offers, objections, style, restrictions) (`LivingProfileView.tsx` 118–137; `lib/contracts/interview.ts` 26–34). List steps → `<ul>/<li>` text; text steps → `<p>` via `getListItems` / `getDescription` (`LivingProfileView.tsx` 174–203; `step-helpers.ts` 38–71). Read path Zod-validates jsonb with `interviewAnswersCompleteSchema` before render (`map-business-profile-row.ts` 51–58; `lib/contracts/interview.ts` 163–173). EN/ES section labels Style / Estilo (`messages/en.json` 248–256; `messages/es.json` 248–256). Empty lists → `emptySection` copy, not crash (`LivingProfileView.tsx` 192–194). |
| Profile loads on dashboard as default post-onboarding view | **PASS** (CONTRACT: elevate, not hard redirect) | When `profile.exists === true`, Ficha viva card is **first** in `cards` with `href: "/profile"` (`dashboard/page.tsx` 92–127). Pre-onboarding keeps interview card primary (`115–127`). App root still `redirect("/dashboard")` only — **no** hard redirect to `/profile` (`app/(app)/page.tsx` 5–6) — matches CONTRACT / SPEC-REVIEW (hard redirect = DRIFT). Links carry no tenant query params (`dashboard/page.tsx` 110–111). Card payload is title/body/CTA only — no full `fields` dump. |
| Missing profile shows onboarding CTA, not empty crash | **PASS** | Missing `{ exists: false }` → info Message + CTA → `/interview` (`LivingProfileView.tsx` 77–105; `messages/en.json` 257–260). Soft `loadFailed` → error Message + dashboard CTA, `(app)` shell intact (`LivingProfileView.tsx` 62–74; `profile/page.tsx` 30–42 try/catch). Helper returns `{ exists: false }` on no row; `{ exists: false, loadFailed: true }` on select/Zod failure (`map-business-profile-row.ts` 42–58; unit tests lines 67–123). |
| **[SEC]** Profile is fetched by the server-resolved current user; the endpoint does not accept an arbitrary `client_id` parameter from the browser | **PASS** | `getBusinessProfileForClient()` arity 0 (`get-business-profile-for-client.ts` 19–20; test arity assert lines 43–58). Identity: `requireActive("page")` then `.eq("client_id", user.id)` (`get-business-profile-for-client.ts` 20–32). Select omits `id` / `client_id` / `source_interview_id` from DTO (`select("fields, version, updated_at")`; map omits UUIDs — unit JSON assert lines 94–97). No public Route Handler / `api/profile` / `/profile/[id]`. No PATCH / refresh action. `getProfileStubSummary` thin-wraps same helper (`get-profile-stub-summary.ts` 12–25). |
| **[SEC] (inherited)** Interview sessions / profiles are loaded only for the client resolved via server-side `getCurrentUser()`; no `client_id` from body/query | **PASS** | Same as story SEC: arity-0 helper + `(app)` layout `requireActive("page")` (`app/(app)/layout.tsx` 16–17). `/profile` off `isPublicPath` (`public-routes.ts` 7–14; `session-guards.test.ts` 108). |
| **[SEC] (inherited)** Free-text answers / profile fields are stored as data and always rendered escaped | **PASS** | React text nodes / PrimeReact `text` only (`LivingProfileView.tsx` 65–68, 186–200). No `dangerouslySetInnerHTML` on profile surfaces (repo grep: comment only). |
| **[SEC] (inherited)** Stub/profile route `/profile` under `app/(app)/`, not on `isPublicPath`, `requireActive("page")`, `Cache-Control: no-store` | **PASS** | `app/(app)/profile/page.tsx`; layout gate; `isPublicPath("/profile") === false`; `next.config.ts` sources `/profile` + `/profile/:path*` → `no-store`; `export const dynamic = "force-dynamic"` on profile + dashboard pages. |
| **[SEC] (added)** Own-profile loader takes no `client_id` / `profile_id` / `id` / `source_interview_id` args; `WHERE client_id = $server`; prove arity 0 | **PASS** | Signature + test (`get-business-profile-for-client.ts` 19; test 43–58). Stub adapter also arity 0 (test 180–198). |
| **[SEC] (added)** Reject/strip identity keys if present on optional refresh / query — prefer omit from FE props | **PASS** | No refresh Server Action shipped. No query-param identity surface. View DTO has no tenant UUIDs (unit 94–97). |
| **[SEC] (added)** No Operator cross-tenant view; own `client_id` only | **PASS** | No `as_client_id` / `requireOperator` branch on profile path. |
| **[SEC] (added)** XSS bar: seven sections as React text / PrimeReact children only | **PASS** | `LivingProfileView.tsx` SectionBody; empty `restrictions.items` → empty-state copy. |
| **[SEC] (added)** Missing / load failure must not crash `(app)` shell; no foreign-tenant oracle | **PASS** | Soft empty + soft error branches; no foreign-id route. |
| **[SEC] (added)** Jsonb `fields` Zod-validated on read; invalid → soft + log code only | **PASS** | `interviewAnswersCompleteSchema.safeParse` (`map-business-profile-row.ts` 51–57); logs `{ code }` only (55–56, 43). Unit: garbage fields → `loadFailed`, no blob leak (100–114). |
| **[SEC] (added)** View DTO minimal; omit tokens / privilege / prefer omit UUIDs | **PASS** | `lib/contracts/profile.ts` 15–52; mapper returns `exists` + `fields` + optional `updatedAt` / `version` only. |
| **[SEC] (added)** Read-only: no edit / PATCH under US-2.1 | **PASS** | No edit controls in `LivingProfileView`; no profile PATCH Route Handler / Server Action in this story. |
| **[SEC] (added)** No public Route Handler returning Ficha viva by tenant/profile id | **PASS** | RSC + `getBusinessProfileForClient` only. |
| **[SEC] (added)** Dashboard links to `/profile` without tenant query params; primary card when exists — not hard redirect | **PASS** | `dashboard/page.tsx` 114–127; root → `/dashboard` only. |
| **[SEC] (added)** Orphan own profile may show | **PASS** | Load keyed only by `client_id`; interview status not gated in helper. |
| **[SEC] (added)** RLS deny-by-default unchanged; service-role Node only; no browser Supabase | **PASS** | Verify-only US-1.3 table (no new migration in commits). Helpers `import "server-only"`; no `@supabase/supabase-js` in `LivingProfileView`. |
| **[SEC] (added)** Do not introduce or client-bundle `getBusinessProfileForAgents` | **PASS** | Not present in US-2.1 commits or profile modules. |

---

### Convention Compliance

| Convention | Status | Evidence |
|------------|--------|----------|
| EN + ES user-facing copy | **PASS** | `profile.*` + `dashboard.profileCard.*` in `messages/en.json` + `es.json`. Titles Living profile / Ficha viva; Style / Estilo. |
| Server Components by default; `"use client"` justified | **PASS** | `/profile` + `/dashboard` RSC; `LivingProfileView` client for PrimeReact Button/Message. |
| PrimeReact-first | **PASS** | Button, Message on profile empty/error/CTA. |
| Loading / empty / error / pending | **PASS** | Missing CTA; soft `loadFailed`; exists sections. No separate client loading spinner (RSC await) — acceptable for this read path. |
| Auth: identity via `requireActive` / `getCurrentUser`; no browser Supabase auth | **PASS** | Layout + helper `requireActive("page")`; server-only Supabase. |
| Backend surfaces have FE consumers | **PASS** | `/profile` RSC → `getBusinessProfileForClient`; dashboard elevation uses same helper. |
| Contract shapes honored | **PASS** | Discriminated `{ exists: true, fields, … }` / `{ exists: false }` / `{ exists: false, loadFailed: true }` matches CONTRACT. |
| Dependency US-1.3 | **PASS** | US-1.3 CLOSED; table verify-only; stub replaced in place; submit `redirectTo: "/profile"` unchanged. |
| Terminology (CONTEXT) | **PASS** | Product copy uses Living profile / Ficha viva; Style / Estilo — not Brand notes / Business Profile as primary labels. |
| `neuramark_` prefix | **PASS** | Reads `neuramark_business_profiles` only. |

---

### Gaps (what blocks PASS)

**None that block PASS.** Notes only:

1. **Live E2E not run** — authenticated `/profile` with a real row, missing-row CTA, dashboard card order after onboarding, and `?client_id=` ignored were not exercised in a browser/DB this gate.
2. **Dashboard AC interpretation** — satisfied as CONTRACT primary-card elevation, not soft/hard redirect to `/profile` (PREP PO lean rejected as SPEC DRIFT).
3. **`version` omitted from UI** — returned in DTO optionally; not rendered (CONTRACT: subtle or omit until US-2.2) — acceptable.

---

### Scope Creep

**None material.** Read-only Ficha viva + arity-0 loader + dashboard elevation + stub thin-wrap. No PATCH, no agent helper, no public API, no new migration, no Operator cross-tenant.

---

### Recommended Next Actions

| Action | Agent |
|--------|--------|
| Check off US-2.1 AC boxes in `plan/USER_STORIES.md` if PO agrees with this gate | product-owner |
| Proceed to QA.md (optional live E2E: exists / missing / loadFailed / dashboard order / XSS smoke) | qa-engineer |
| Do **not** start US-2.2 edit/PATCH until QA closes this story if sprint process requires it | orchestrator / product-owner |
