# Validation Report — US-2.2

**Story:** Edit business profile (Ficha viva)  
**Validator:** requirements-validator  
**Date:** 2026-08-29  
**Branch:** `feature/US-2.2-edit-business-profile`  
**Commits reviewed:** `6b99910` (FE), `bd7ad08` (BE)  
**Contract:** Frozen, Reviewed by FE (2026-08-29)  
**SPEC-REVIEW:** ALIGNED  
**SECURITY:** APPROVE WITH CONDITIONS (binding freeze encoded in CONTRACT)  
**Tests re-run:** `npx tsx --test lib/profile/update-business-profile.test.ts` → **17/17 pass**  
**Live browser / DB E2E:** **Not run** this gate (no local `next` server on :3000; code + unit evidence only)  
**Repo note:** `../AGENTS.md` not present at expected path; conventions taken from story artifacts + existing US-2.1 VALIDATION pattern.

---

### Verdict: PASS WITH NOTES

All five USER_STORIES acceptance criteria and the SECURITY.md `[SEC]` floors for US-2.2 (story + added + inherited re-assertions relevant to `/profile` edit) are met in the implementation. Residual notes: (1) “appear on next agent run” is soft — persist + `version` bump proven; US-2.3 wires agent reads; (2) no live authenticated browser/DB E2E this gate; (3) `version` bump is application-level `currentVersion + 1` after SELECT (not atomic SQL `version = version + 1`) — acceptable under frozen LWW concurrency.

On PASS, the product-owner — not this validator — checks the story’s acceptance criteria in `plan/USER_STORIES.md`.

---

### Acceptance Criteria

Criteria 1–5 are verbatim from `plan/USER_STORIES.md` § US-2.2. Criteria below that are SECURITY.md `[SEC]` items (inherited re-asserted for profile write + story `[SEC]` + **(added)**).

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Edits persist and appear on next agent run | **PASS** (soft agent wiring) | Server Action `updateBusinessProfile` full-replaces `fields` on `neuramark_business_profiles` with `WHERE client_id = user.id` only (`update-business-profile.ts` 71–93, 146–150). Bumps `version` (`update-helpers.ts` 69–85). FE awaits Save, syncs returned `fields` + `updatedAt`, success toast (`LivingProfileEditor.tsx` 301–330). Same canonical row US-2.3 will read (SPEC-REVIEW / CONTRACT AC mapping). **No** `getBusinessProfileForAgents` in this story (out of scope). |
| Restricted fields (e.g. legal consents) require explicit re-confirmation | **PASS** | Consent / Preferencias **cannot** change via this endpoint: Zod `.strict()` seven-key schema rejects `visual_mode` / `consentAvatar` (`interview.ts` 163–173; `profile.ts` 58; tests lines 85–107). FE has no consent/visual toggles (`LivingProfileEditor.tsx` 133–136; seven `INTERVIEW_STEP_ORDER` sections only). Dedicated re-confirm remains US-3.x (SECURITY freeze #8 / CONTRACT decision 10). |
| Concurrent edits last-write-wins with timestamp visible | **PASS** | No If-Match / version precondition (CONTRACT freeze #8). Success returns `updatedAt`; editor shows “Last updated {date}” / “Última actualización {date}” (`LivingProfileEditor.tsx` 160–163, 347–349; `messages/en.json` 246; `messages/es.json` 246). After save, local `updatedAt` refreshed from result (`LivingProfileEditor.tsx` 323). |
| **[SEC]** PATCH accepts an explicit allowlist of editable fields; consent flags, `visual_mode` rules, and system fields cannot be modified through this endpoint even if present in the payload | **PASS** | Allowlist = `interviewAnswersCompleteSchema` `.strict()` (`profile.ts` 58; `interview.ts` 163–173). Unknown/consent/visual → `VALIDATION_ERROR` (action 125–129; tests 85–107). Identity/privilege/audit keys → `FORBIDDEN_FIELDS` before Zod (`update-helpers.ts` 15–51; action 121–123; tests 111–158). Only validated seven keys written into `fields` (`update-business-profile.ts` 85–89). No public `app/api/profile` Route Handler (test 320–331). |
| **[SEC]** Every edit records who changed it (server-resolved user) and bumps `version`, so agent runs can be traced to the profile version they consumed | **PASS** | Migration adds nullable `updated_by uuid` FK → `neuramark_clients(id)` (`20260829140000_neuramark_business_profiles_updated_by.sql` 4–12). Every success sets `updated_by: user.id` via `buildBusinessProfileUpdatePayload` (`update-helpers.ts` 80–84; `update-business-profile.ts` 76–89). `version = currentVersion + 1` server-side; client `version` / `updated_by` rejected (`update-helpers.ts` 30–35, 82; tests 178–202). DTO omits `updated_by` from client (`mapUpdateBusinessProfileResult` 94–125; tests 206–228). |
| **[SEC] (inherited)** Interview sessions / profiles loaded only for server-resolved `getCurrentUser()`; no `client_id` from body/query | **PASS** | Action arity 1 (fields body only); `requireActive("handler")` then `.eq("client_id", params.clientId)` with `params.clientId = user.id` (`update-business-profile.ts` 112–119, 146–150, 166–168; test arity 297–317). No tenant args. Load still arity-0 `getBusinessProfileForClient` (`profile/page.tsx` 30–44). |
| **[SEC] (inherited)** Free-text stored as data and rendered escaped | **PASS** | Controlled `InterviewStepFields` + React text nodes / `<li>` / `<p>` (`LivingProfileEditor.tsx` 390–513). No `dangerouslySetInnerHTML` on profile surfaces (grep: comments only). |
| **[SEC] (inherited)** `/profile` under `(app)`, off `isPublicPath`, `requireActive("page")`, `Cache-Control: no-store` | **PASS** | `app/(app)/profile/page.tsx`; `isPublicPath("/profile") === false` (test 333–335); `next.config.ts` 37–42 `no-store`; `dynamic = "force-dynamic"` (`page.tsx` 8). |
| **[SEC] (added)** Mutation is Server Action only; `requireActive("handler")`; no public Route Handler mutate | **PASS** | `"use server"` module (`update-business-profile.ts` 1); auth before write (112–119); no `app/api/profile` (test 320–331). |
| **[SEC] (added)** Action takes no `client_id` / `profile_id` / `id` / `source_interview_id` / `as_client_id` as write authority | **PASS** | Signature `updateBusinessProfile(input)` only; forbidden-key pre-check; UPDATE always `WHERE client_id = $server`. |
| **[SEC] (added)** Body Zod `.strict()` full seven-key; unknown/consent/visual/system never written | **PASS** | See story SEC allowlist row + unit tests allowlist suite. |
| **[SEC] (added)** Full seven-key replace of `fields` on success | **PASS** | FE `buildSnapshot` merges all seven steps (`LivingProfileEditor.tsx` 116–129); BE writes entire validated object (`update-business-profile.ts` 86). Sparse body rejected (test 74–83). |
| **[SEC] (added)** On success: `fields`, `version+1`, `updated_at`, `updated_by = getCurrentUser().id` | **PASS** | `buildBusinessProfileUpdatePayload` + explicit `updated_at` ISO + column write (`update-helpers.ts` 69–85; `update-business-profile.ts` 85–89). |
| **[SEC] (added)** Migration `updated_by` nullable FK; set on every successful PATCH | **PASS** | Migration file above; set on every UPDATE path. |
| **[SEC] (added)** Missing own profile → `PROFILE_NOT_FOUND`; no INSERT | **PASS** | `selectOwnProfileVersion` null → `profileNotFoundError()` (`update-business-profile.ts` 141–144); UPDATE path only; FE missing → CTA `/interview`, no edit chrome (`LivingProfileView.tsx` 93–121). |
| **[SEC] (added)** Do not mutate `source_interview_id`, interview `status`, or create `profile_versions` | **PASS** | UPDATE payload keys: `fields`, `version`, `updated_by`, `updated_at` only. No `profile_versions` migration/table. |
| **[SEC] (added)** No Operator cross-tenant edit | **PASS** | No `as_client_id` / `requireOperator` branch. |
| **[SEC] (added)** XSS bar on edit + display | **PASS** | Controlled inputs + text nodes; comments + implementation. |
| **[SEC] (added)** Mutation response minimal: fields + version + updatedAt; omit secrets / prefer omit UUIDs | **PASS** | `select("fields, version, updated_at")`; map omits ids / `updated_by` (tests 206–228). |
| **[SEC] (added)** Do not log full free-text `fields` | **PASS** | Logs use `{ code: error.code }` / static strings only (`update-business-profile.ts` 56–57, 96–97, 137, 175). |
| **[SEC] (added)** RLS / service-role Node only; no browser Supabase | **PASS** | Writes via `createServerSupabaseClient()` in Server Action; Client Component only calls Server Action (no `@supabase/supabase-js` in editor). |
| **[SEC] (added)** `/profile` remains off `isPublicPath` with `no-store` | **PASS** | See inherited route/cache row. |
| **[SEC] (added)** Restricted-field re-confirmation AC via block here | **PASS** | See restricted-fields AC. |
| **[SEC] (added)** Do not introduce or client-bundle `getBusinessProfileForAgents` | **PASS** | Repo grep: no such symbol introduced. |
| **[SEC] (added)** Automated security tests cover allowlist / smuggle / foreign id / version / updated_by / missing / session surface | **PASS** | `update-business-profile.test.ts` 17/17 — allowlist, smuggle, forbidden keys, version+updated_by, DTO omit, missing, arity, no public API, off `isPublicPath`. (Integration DB write under live session not covered by unit suite.) |

---

### Convention Compliance

| Convention | Status | Evidence |
|------------|--------|----------|
| EN + ES user-facing strings | **PASS** | `messages/en.json` / `es.json` `profile.*` — title Living profile / Ficha viva; Style / Estilo; edit/save/cancel/saving/toast/errors (`en` 244–290; `es` 244–290). |
| Server Components by default; `"use client"` justified | **PASS** | RSC `profile/page.tsx` loads data; `LivingProfileEditor` / `LivingProfileView` client for edit state, Toast, Save/Cancel. |
| PrimeReact-first | **PASS** | `Button`, `Message`, `Toast`; `InterviewStepFields` reuse. |
| loading / empty / error / pending | **PASS** | Missing + loadFailed (`LivingProfileView`); pending disables Save/Cancel + loading (`LivingProfileEditor` 353–367); validation/banner errors; success toast. |
| Auth / identity | **PASS** | `requireActive("handler")` on mutate; arity-0 loader; no browser Supabase auth. |
| Backend maps to FE consumer | **PASS** | Only consumer: `/profile` `LivingProfileEditor` Save → `updateBusinessProfile`. |
| CONTRACT shapes / error envelope | **PASS** | Success `{ ok, fields, version, updatedAt }`; errors include `VALIDATION_ERROR`, `FORBIDDEN_FIELDS`, `PROFILE_NOT_FOUND`, auth codes (`profile.ts` 61–115; `errors.ts`). |
| Terminology (CONTEXT) | **PASS** | Product copy uses Living profile / Ficha viva; Style / Estilo; no Business Profile / consent-ledger product labels in new strings. |
| Depends on US-2.1 | **PASS** | US-2.1 CLOSED (VALIDATION PASS WITH NOTES); edit extends same `/profile` + loader without forking identity. |

---

### Gaps (what blocks PASS)

**None.** No blockers for PASS WITH NOTES.

Non-blocking notes (do not fail the story):

1. **Soft “next agent run”** — Persist + `version` on canonical row proven; agent consumer is US-2.3 (explicitly out of scope; SPEC-REVIEW Info).
2. **No live E2E** — Authenticated browser save → DB round-trip not exercised this gate (same class as US-2.1 VALIDATE). Unit suite + code review substitute.
3. **Version bump concurrency** — Application SELECT then `currentVersion + 1` (not atomic SQL increment). Under frozen LWW, last UPDATE wins; rare concurrent same-version numbers possible. Acceptable for V1; optional harden later.

---

### Scope Creep

**None material.** No `profile_versions` table; no `getBusinessProfileForAgents`; no Preferencias / Consentimiento editors; no public Route Handler; no auth allowlist changes; no Operator cross-tenant; FE only extends `/profile` with Save/Cancel + toast.

---

### Recommended Next Actions (and which agent should take them)

1. **product-owner** — On this PASS WITH NOTES, check US-2.2 acceptance criteria boxes in `plan/USER_STORIES.md` when closing the story (validator does not check them).
2. **qa-engineer** — Run QA gate (`QA.md`); prefer one live authenticated Save on `/profile` to confirm DB `fields` / `version` / `updated_by` / `updated_at` if environment allows.
3. **master-orchestrator / product-owner** — Advance to next story (**US-2.3** expose profile to agents) after QA approve.
4. **Optional (BE, non-blocking):** Atomic `version = version + 1` in SQL if concurrent-edit version collisions become an issue.
