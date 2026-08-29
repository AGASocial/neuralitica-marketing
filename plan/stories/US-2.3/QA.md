# QA Report — US-2.3

**Story:** Expose profile to agents (API contract)  
**Reviewer:** qa-engineer  
**Date:** 2026-08-29  
**Branch:** `main` (feature work already merged; build `bf19e95`, VALIDATE `6e5d79c`)  
**VALIDATE:** PASS WITH NOTES (`plan/stories/US-2.3/VALIDATION.md`)  
**Standard:** Enterprise-grade (production-safe for paying customers)  
**Sources:** `../AGENTS.md`, `plan/USER_STORIES.md` § US-2.3, `plan/stories/US-2.3/{SECURITY,CONTRACT,TASKS,SPEC-REVIEW,VALIDATION}.md`  
**Scope:** BE-only — `getBusinessProfileForAgents` + agent Zod DTO + mapper wrap. No FE.

Auth is real (US-14.5). Sanctioned local-dev fallback user is **not** a finding. Focus this gate: IDOR (`clientId` trusted-server only), server-only / no client-bundle, minimal strip list, no public HTTP by `clientId`, distinct from Cliente arity-0 helper, back doors / secrets.

### Verdict: APPROVE

No Critical. No High. **0 Medium.** **1 Low** (non-blocking test-gap). **No fix loop / no FE–BE re-delegation required.**

Security acceptance criteria and CONTRACT freeze are met for server-only export, UUID soft-fail, minimal agent DTO (seven fields + required `version` + echo `clientId` + `visualModeSummary: null`), strip list, no `requireActive` inside helper, no public Route Handler / Server Action by `clientId`, and separation from `getBusinessProfileForClient`. Soft “used by agents” AC is satisfied by export + MUST-import comment + unit tests (LLM wiring US-4.x+). **CLOSE can proceed: yes.**

---

### Findings

No Critical. No High. No Medium.

#### Low

1. **`getBusinessProfileForAgents` happy path is not driven under a mocked Supabase harness**  
   **Where:** `lib/profile/get-business-profile-for-agents.ts:27-52`; `lib/profile/get-business-profile-for-agents.test.ts` (module probes + `mapBusinessProfileRowForAgents` + invalid UUID only).  
   **What:** Unit coverage proves `import "server-only"`, MUST-import comment, arity 1, Cliente arity 0 / separate module, no `app/api/profile*`, mapper happy / missing / corrupt / bad version / select error, schema `.strict()` strip, and invalid UUID → soft `{ exists: false }`. There is no test that mocks `createServerSupabaseClient` and asserts `.from("neuramark_business_profiles").select("fields, version, updated_at").eq("client_id", <validated uuid>)` or unconfigured → `loadFailed`. Same residual class as US-2.1 / US-2.2.  
   **Why it matters:** A future edit that widens the SELECT (e.g. adds `source_interview_id`) or drops UUID gating before `.eq` could regress strip / IDOR hygiene without a red test at the helper boundary.  
   **Fix direction (non-blocking, BE):** Add mocked-helper tests: configured Supabase → assert table, select columns, equality filter on validated UUID; unconfigured → `{ exists: false, loadFailed: true }`; never log free-text `fields`.

---

### Must-check hunt (file:line)

| Check | Result | Evidence |
|-------|--------|----------|
| **Server-only module** | **Pass** | `import "server-only"` (`get-business-profile-for-agents.ts:1`); test asserts import + MUST comment (`test.ts:74-87`). No `"use client"` under `lib/profile/`. No `app/` import of agents helper (repo grep: product call sites = module + test only). |
| **MUST-import / single agent path** | **Pass** (soft) | File header names Content Strategy, Video Script, Caption, QA (`get-business-profile-for-agents.ts:3-12`). Soft AC per CONTRACT freeze #12 / SPEC-REVIEW; no US-4.x+ call sites yet. |
| **IDOR / trusted `clientId`** | **Pass** | UUID via `agentClientIdSchema.safeParse` before query (`get-business-profile-for-agents.ts:30-34`; `profile.ts:16-17`). Invalid → soft `{ exists: false }`, no throw, no FORBIDDEN (`test.ts:228-237`). No browser/HTTP/Server Action entry accepting tenant UUID for this read. |
| **No `requireActive` inside helper** | **Pass** | No `requireActive` in agents module (`get-business-profile-for-agents.ts`; test `86`). Cliente path still uses `requireActive("page")` (`get-business-profile-for-client.ts:19-20`). |
| **No public HTTP / Server Action by `clientId`** | **Pass** | `app/api/**` absent (glob 0). Test probes `app/api/profile` / `profile-for-agents` (`test.ts:116-123`). Agents module is not `"use server"`. |
| **Minimal DTO / strip list** | **Pass** | SELECT only `fields, version, updated_at` (`get-business-profile-for-agents.ts:42-46`). Success DTO: seven Zod fields + `version` + `clientId` + `visualModeSummary: null` + optional `updatedAt` (`map-business-profile-row.ts:101-108`). Serialized omit of `source_interview_id` / `updated_by` / `auth_user_id` (`test.ts:153-158`). Schema `.strict()` rejects over-disclosure (`test.ts:214-224`). Never SELECTs interview sessions or consent. |
| **404-safe empty / oracle** | **Pass** | Missing → `{ exists: false }` (`map-business-profile-row.ts:89-93`; `test.ts:161-172`). Invalid UUID same soft missing class (`get-business-profile-for-agents.ts:30-34`). Corrupt / select / bad version → `{ exists: false, loadFailed: true }` (`map-business-profile-row.ts:84-98`; `test.ts:174-212`). No foreign-vs-missing discriminant. |
| **Separation from Cliente helper** | **Pass** | Distinct modules; agents arity 1 (`test.ts:89-96`); Cliente arity 0 (`test.ts:98-113`; `get-business-profile-for-client.ts:19`). Agents source does not import Cliente module (`test.ts:108-111`). Distinct result types in `profile.ts` (`BusinessProfileForClientResult` vs `BusinessProfileForAgentsResult`). Shared private mapper wrap CONTRACT-allowed. |
| **Logging codes only** | **Pass** | Agents: `{ code: "invalid_uuid" }` / static strings (`get-business-profile-for-agents.ts:32-38`). Mapper: `{ code }` only (`map-business-profile-row.ts:46-47`, `59`, `97`). |
| **Parameterized query / `neuramark_`** | **Pass** | `.from("neuramark_business_profiles").eq("client_id", idParsed.data)` via `createServerSupabaseClient()` (`get-business-profile-for-agents.ts:41-46`). No migration in `bf19e95` (verify-only). |
| **Client bundle / secrets** | **Pass** | No `NEXT_PUBLIC_*` Supabase for this path. `@supabase/supabase-js` only in server auth/supabase modules (type or Node client) — not in Client Components for profile. Agents helper never imported from `app/` or components. |
| **Back doors / suspicious patterns** | **Pass** | No debug bypass, no `eval`, no undocumented profile-by-id routes, no hardcoded credentials beyond sanctioned auth fallback (out of this story’s diff). Commit `bf19e95` adds helper + contracts + tests + story docs only. |
| **Contract types in code** | **Pass** | Zod + `BusinessProfileForAgents*` in `lib/contracts/profile.ts:62-112`; view `.strict()` with required `version`, `clientId`, `visualModeSummary: z.null()`. |

---

### Focus confirmation (requested)

| Focus | Result | Owner if fail |
|-------|--------|---------------|
| Bugs / soft empty / corrupt | **Pass** | — |
| Trust boundaries / IDOR | **Pass** | — |
| Server-only leakage | **Pass** | — |
| Minimal DTO strip list | **Pass** | — |
| No public Route Handler / Server Action by `clientId` | **Pass** | — |
| Distinct from Cliente arity-0 helper | **Pass** | — |
| Back doors / secrets | **Pass** | — |

---

### Checks Run

| Check | Command / method | Result |
|-------|------------------|--------|
| Unit tests | `npx tsx --test lib/profile/get-business-profile-for-agents.test.ts` | **11/11 pass** (exit 0) |
| ESLint (touched product files) | `npx eslint lib/profile/get-business-profile-for-agents.ts lib/profile/map-business-profile-row.ts lib/contracts/profile.ts` | **Clean** (exit 0) |
| Typecheck product vs tests | `npx tsc --noEmit` filtered | **No product errors** in agents helper / mapper / `profile.ts`. Test files show TS5097 on `.ts` dynamic-import paths — same harness pattern as US-2.1/2.2 tests; `tsx --test` runs them successfully |
| Grep: agents helper imports | Product `*.{ts,tsx}` | Call sites = `get-business-profile-for-agents.ts` + its test only; no `app/` / components |
| Grep: `app/` profile-by-clientId | `app/` | No matches |
| Glob: `app/api/**` | Filesystem | **0 files** |
| Grep: `"use client"` under `lib/profile` | — | None |
| Grep: client Supabase / secrets patterns | Product TS | No `NEXT_PUBLIC_` Supabase; service-role only in server modules |
| Commit verify | `git show bf19e95` | Helper, mapper wrap, contracts, tests, story docs; **no migration** |
| VALIDATE reconfirm | Read `VALIDATION.md` | PASS WITH NOTES aligned with this gate |

---

### What Was Not Covered

- Live Supabase round-trip against a real `neuramark_business_profiles` fixture row (no env E2E this gate).
- Mocked Supabase assert on SELECT column list / `.eq("client_id", …)` at the helper boundary (Low #1).
- Real Content Strategy / Script / Caption / QA job call sites (intentionally out of scope — US-4.x+).
- Browser / Next bundle analyzer proof that `server-only` fails a Client Component import (relies on package + test source assert).
- Operator-gated job runners that resolve target `clientId` (none exist yet; design floor only).
- Full `next build` / app E2E (BE-only contract; lint + unit + typecheck product files used instead).

---

### Recommended next actions

1. **product-owner / master-orchestrator** — CLOSE US-2.3; check acceptance criteria in `plan/USER_STORIES.md` (QA does not check them).
2. **nextjs-backend (optional, non-blocking)** — Low #1 mocked Supabase helper tests when convenient.
3. **content-agents-engineer (US-4.x+)** — Import `getBusinessProfileForAgents` only; never raw interview SELECT or Cliente DTO for prompts.
