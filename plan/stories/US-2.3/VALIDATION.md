# Validation Report — US-2.3

**Story:** Expose profile to agents (API contract)  
**Validator:** requirements-validator  
**Date:** 2026-08-29  
**Branch:** `feature/US-2.3-profile-for-agents`  
**Commit reviewed:** `bf19e95` — *US-2.3: add getBusinessProfileForAgents server-only contract.*  
**Contract:** Frozen (FE N/A — 2026-08-29)  
**SPEC-REVIEW:** ALIGNED  
**SECURITY:** APPROVE WITH CONDITIONS (binding freeze encoded in CONTRACT)  
**Tests re-run:** `npx tsx --test lib/profile/get-business-profile-for-agents.test.ts` → **11/11 pass**  
**Live DB / orchestration E2E:** **Not run** this gate (unit + code review only; no agent job runners yet)  
**Repo note:** `../AGENTS.md` not present at expected path; conventions taken from story artifacts + US-2.2 VALIDATION pattern.

---

### Verdict: PASS WITH NOTES

All five USER_STORIES acceptance criteria and the SECURITY.md `[SEC]` floors for US-2.3 (story + added) are met. Soft “used by agents” is satisfied by export + MUST-import comment + unit tests (LLM wiring deferred to US-4.x+ per CONTRACT freeze #12 / SPEC-REVIEW). Residual notes: no live DB round-trip; no real agent call sites yet (intentional soft AC).

On PASS, the product-owner — not this validator — checks the story’s acceptance criteria in `plan/USER_STORIES.md`.

---

### Acceptance Criteria

Criteria 1–5 are verbatim from `plan/USER_STORIES.md` § US-2.3. Additional rows are SECURITY.md `[SEC]` items (story + **(added)**) treated as binding acceptance criteria.

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Single server function used by Content Strategy, Video Script, Caption, QA agents | **PASS** (soft) | Single export `getBusinessProfileForAgents(clientId)` (`get-business-profile-for-agents.ts` 27–29). File header MUST-import for Content Strategy, Video Script, Caption, QA (`get-business-profile-for-agents.ts` 3–12). Tests assert MUST / agent names / arity 1 (`get-business-profile-for-agents.test.ts` 74–96). No US-4.x+ call sites yet — allowed by CONTRACT freeze #12 / user VALIDATE instruction. |
| Contract documented in code types | **PASS** | Zod + types in `lib/contracts/profile.ts`: `businessProfileForAgentsViewSchema`, `…MissingSchema`, `…LoadFailedSchema`, `BusinessProfileForAgentsResult` (`profile.ts` 62–112); `agentClientIdSchema` (`profile.ts` 16–17). Distinct from `BusinessProfileForClientResult` (`profile.ts` 53–56). View schema `.strict()` with required `version`, echo `clientId`, `visualModeSummary: z.null()` (`profile.ts` 62–78). |
| Returns 404-safe empty state for pre-onboarding clients | **PASS** | Missing row → `{ exists: false }` via mapper (`map-business-profile-row.ts` 89–93; test 161–172). Invalid UUID → soft `{ exists: false }`, no throw, no FORBIDDEN (`get-business-profile-for-agents.ts` 30–34; test 228–237). Corrupt / select failure → `{ exists: false, loadFailed: true }` (mapper 84–98; tests 174–212). No HTTP 404 surface (no Route Handler). |
| **[SEC]** `getBusinessProfileForAgents` is a server-only module (never imported into client bundles) and is the only path agents use to read profile data | **PASS** (soft “only path”) | `import "server-only"` (`get-business-profile-for-agents.ts` 1). Test asserts `server-only` + MUST comment (`test.ts` 74–87). No `app/` import of agents helper (repo grep). No `app/api/profile` / `profile-for-agents` Route Handlers (`test.ts` 116–123; `app/api/**` absent). Soft “only path” = export + MUST-import until US-4.x+. |
| **[SEC]** Contract output excludes fields agents do not need (no consent record internals, no raw interview blobs) — minimal response shape by design | **PASS** | SELECT only `fields, version, updated_at` (`get-business-profile-for-agents.ts` 42–46). Success DTO = seven Zod fields + version + clientId + `visualModeSummary: null` + optional `updatedAt` (mapper 101–108). Strip proof: serialized result omits `source_interview_id` / `updated_by` / `auth_user_id` (`test.ts` 153–158). Schema rejects over-disclosure keys (`test.ts` 214–224). Never SELECTs `neuramark_interview_sessions` or consent tables. |
| **[SEC] (added)** Export exactly `getBusinessProfileForAgents(clientId: string)` from `import "server-only"` module with MUST-import comment | **PASS** | Path `lib/profile/get-business-profile-for-agents.ts`; signature + header match CONTRACT (`get-business-profile-for-agents.ts` 1–29; `test.ts` 74–96). |
| **[SEC] (added)** `clientId` UUID from trusted server/job context only; validate UUID; invalid → soft empty; never browser authority | **PASS** | `agentClientIdSchema.safeParse` before query (`get-business-profile-for-agents.ts` 30–34; `profile.ts` 16–17). No Server Action / RSC / HTTP entry accepting browser `clientId`. Soft invalid UUID (`test.ts` 228–237). |
| **[SEC] (added)** Helper does not call `requireActive` / session | **PASS** | No `requireActive` import/call in agents module (`get-business-profile-for-agents.ts`; `test.ts` 86). Cliente path still uses `requireActive("page")` separately (`get-business-profile-for-client.ts` 19–20). |
| **[SEC] (added)** No public Route Handler / Server Action / RSC exposing profile-by-`clientId` | **PASS** | No `app/api/profile*` (`test.ts` 116–123). Agents helper is not a Server Action / `"use server"` module. |
| **[SEC] (added)** Keep `getBusinessProfileForClient` distinct (arity 0; separate module/types) | **PASS** | Cliente arity 0 + agents arity 1 (`test.ts` 89–114). Agents source does not import Cliente module (`test.ts` 108–111). Separate result types in `profile.ts`. Shared private `mapBusinessProfileRow` wrap is CONTRACT-allowed (`map-business-profile-row.ts` 79–108). |
| **[SEC] (added)** Minimal agent DTO when `exists: true`; always omit strip list | **PASS** | See story SEC minimal-shape row + mapper / schema / strip tests. |
| **[SEC] (added)** Missing / pre-onboarding → `{ exists: false }`; no foreign-vs-missing oracle | **PASS** | Same soft missing for no-row and invalid UUID; no FORBIDDEN discriminant (`test.ts` 161–172, 228–237). |
| **[SEC] (added)** Corrupt / Zod-invalid `fields` → `{ exists: false, loadFailed: true }`; never invent; log codes only | **PASS** | Mapper corrupt → `loadFailed` (`map-business-profile-row.ts` 54–60, 89–91; `test.ts` 174–190). Logs `{ code }` only (`map-business-profile-row.ts` 46–47, 59; agents module `invalid_uuid` / static strings). Non-positive version → `loadFailed` (`map-business-profile-row.ts` 96–98; `test.ts` 192–203). |
| **[SEC] (added)** Parameterized `SELECT … WHERE client_id = $clientId` on `neuramark_business_profiles` only; service-role Node | **PASS** | `.from("neuramark_business_profiles").eq("client_id", idParsed.data)` via `createServerSupabaseClient()` (`get-business-profile-for-agents.ts` 41–46). |
| **[SEC] (added)** Do not log full free-text `fields` | **PASS** | Error logs use codes / static strings only (agents + mapper). |
| **[SEC] (added)** Operator-triggered jobs resolve target from server job context (design floor) | **PASS** (design) | Documented in CONTRACT/SECURITY; no Operator UI or body-authority surface introduced. Enforced architecturally by absence of HTTP/browser entry. |
| **[SEC] (added)** Automated security tests cover happy / missing / invalid UUID / corrupt / server-only / strip / Cliente arity / no Route Handler | **PASS** | `get-business-profile-for-agents.test.ts` **11/11** covering all listed cases. |

---

### Convention Compliance

| Convention | Status | Evidence |
|------------|--------|----------|
| EN + ES user-facing strings | **N/A** | No FE / UI this story (CONTRACT FE N/A). |
| Server Components by default; `"use client"` justified | **PASS** | Agents module is server-only helper; no Client Component import (grep under `app/`). |
| PrimeReact-first | **N/A** | No UI. |
| loading / empty / error / pending | **PASS** (typed soft results) | Soft `exists: false` / `loadFailed` for callers; no throw on missing/invalid UUID. |
| Auth / identity | **PASS** | Trusted job UUID; no session inside helper; no browser Supabase for this path. |
| Backend maps to FE consumer | **N/A** (soft agents) | No FE. Future consumers: US-4.x+ agent jobs MUST import this helper (header + agent roster note). |
| CONTRACT shapes | **PASS** | Exists / missing / `loadFailed` match frozen Zod; `visualModeSummary: null`; no HTTP envelope. |
| Terminology (CONTEXT) | **PASS** | Code/docs use Ficha viva / technical `getBusinessProfileForAgents`; no product UI copy. |
| Depends on US-2.1 / US-2.2 | **PASS** | US-2.1 / US-2.2 CLOSED; reuses same `neuramark_business_profiles` seven-key `fields` + positive `version`; Cliente helper unchanged arity 0. |
| DB verify-only | **PASS** | Commit `bf19e95` has no migration; no Preferencias / consent / `profile_versions`. |

---

### Gaps (what blocks PASS)

**None.** No blockers for PASS WITH NOTES.

Non-blocking notes (do not fail the story):

1. **Soft “used by agents”** — Export + MUST-import + tests satisfy V1; Content Strategy / Video Script / Caption / QA LLM jobs are US-4.x+ (CONTRACT / SPEC-REVIEW / VALIDATE instruction).
2. **No live DB E2E** — Happy-path SELECT against real Supabase not exercised this gate; mapper + invalid-UUID path covered by unit tests.
3. **CONTRACT fixture vs interview schema** — CONTRACT happy-path JSON still shows legacy `zone.primary` / `tone.voice` shapes; implementation + tests correctly use current `interviewAnswersCompleteSchema` (`description` / `items`). Types in code are authoritative; optional CONTRACT fixture cleanup later.

---

### Scope Creep

**None material.** No FE UI; no public Route Handler; no Preferencias / Consentimiento persistence; no LLM agent job wiring; no merge of Cliente/agents public APIs; no migration; no new npm packages; Cliente helper left arity 0.

---

### Recommended Next Actions (and which agent should take them)

1. **product-owner** — On this PASS WITH NOTES, check US-2.3 acceptance criteria boxes in `plan/USER_STORIES.md` when closing the story (validator does not check them).
2. **qa-engineer** — Run QA gate (`QA.md`); optionally smoke `getBusinessProfileForAgents` against a known fixture `client_id` in a configured env.
3. **master-orchestrator / product-owner** — Advance after QA; next Sprint 1 item complete → Sprint 1b auth already done / Sprint 2 Preferencias (US-3.x) or later agent consumers (US-4.1+) as planned.
4. **content-agents-engineer (US-4.x+)** — Import `getBusinessProfileForAgents` only; do not SELECT raw interview sessions or reuse Cliente DTO for prompts.

---

### Blockers

**None.**
