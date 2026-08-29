# QA Report — US-2.2

**Story:** Edit business profile (Ficha viva)  
**Reviewer:** qa-engineer  
**Date:** 2026-08-29  
**Branch:** `feature/US-2.2-edit-business-profile`  
**Commits:** `6b99910` (FE), `bd7ad08` (BE), `5c49799` (sprint VALIDATE)  
**VALIDATE:** PASS WITH NOTES (`plan/stories/US-2.2/VALIDATION.md`)  
**Standard:** Enterprise-grade (production-safe for paying customers)  
**Sources:** `plan/USER_STORIES.md` § US-2.2, `plan/stories/US-2.2/{SECURITY,CONTRACT,TASKS,VALIDATION}.md`

Auth is real (US-14.5). Sanctioned local-dev fallback user is **not** a finding. Focus this gate: mass assignment / `.strict()`, IDOR, `updated_by` server-only, no create-via-PATCH, XSS, consent/visual reject, CSRF Server Action.

### Verdict: APPROVE WITH NOTES

No Critical. No High. **0 Medium.** **2 Low** (non-blocking). **No fix loop / no FE–BE re-delegation required.**

Security acceptance criteria and CONTRACT freeze are met for allowlist + Zod `.strict()`, IDOR (arity-1 fields body + `WHERE client_id = user.id`), server-set `updated_by` / version bump, no INSERT on missing row, consent/`visual_mode` reject, XSS text nodes, and Server Action CSRF surface. Residual: helper-level unit suite (not full mocked action harness) and non-atomic version increment under frozen LWW. **CLOSE can proceed: yes.**

---

### Findings

No Critical. No High. No Medium.

#### Low

1. **`updateBusinessProfile` wire-up is not driven under a mocked `requireActive` + Supabase harness**  
   **Where:** `lib/profile/update-business-profile.ts:108-157`; `lib/profile/update-business-profile.test.ts` (helpers + arity + route probes; no mocked SELECT/UPDATE).  
   **What:** Unit coverage proves Zod `.strict()` allowlist, forbidden-key pre-check, payload builder (`version+1`, `updated_by`), DTO omit of ids/`updated_by`, envelopes, arity `length === 1`, no `app/api/profile`, and `/profile` off `isPublicPath`. There is no test that mocks Supabase and asserts `.eq("client_id", user.id)`, no INSERT on missing row at the action boundary, or that `requireActive("handler")` failure short-circuits before write. Same residual class as US-1.x / US-2.1.  
   **Why it matters:** A future edit that adds an optional tenant arg or INSERT fallback could regress IDOR / create-via-PATCH without a red test at the action boundary.  
   **Fix direction (non-blocking, BE):** Add mocked-action tests: configured Supabase → assert UPDATE filter `client_id = requireActive().id` and payload keys; missing SELECT → `PROFILE_NOT_FOUND` with zero INSERT calls; unauthenticated/inactive → envelope, no write.

2. **Version bump is application-level `currentVersion + 1` after SELECT (not atomic SQL)**  
   **Where:** `lib/profile/update-helpers.ts:69-85`; `lib/profile/update-business-profile.ts:141-150`.  
   **What:** Concurrent Saves can both read the same `version` and write the same next integer; last UPDATE still wins on `fields` (LWW). VALIDATE already accepted this under frozen concurrency.  
   **Why it matters:** Rare duplicate version numbers weaken agent lineage uniqueness, not tenancy.  
   **Fix direction (non-blocking, BE):** Optional harden later with SQL `version = version + 1` (or RPC) if concurrent-edit collisions appear in production.

---

### Must-check hunt (file:line)

| Check | Result | Evidence |
|-------|--------|----------|
| **Mass assignment / Zod `.strict()`** | **Pass** | `updateBusinessProfileInputSchema = interviewAnswersCompleteSchema` (`.strict()` seven keys) (`profile.ts:58`; `interview.ts:163-173`). Unknown/consent/visual → `VALIDATION_ERROR` (`update-business-profile.ts:125-129`; tests `85-107`). Only validated object written (`update-business-profile.ts:85-89`). |
| **Consent / Preferencias reject** | **Pass** | `visual_mode` / `consentAvatar` not in allowlist; `.strict()` rejects (tests `85-107`, `167-175`). FE: seven `INTERVIEW_STEP_ORDER` sections only; comment + no toggles (`LivingProfileEditor.tsx:132-136`, `380-436`). |
| **Forbidden identity/privilege/audit keys** | **Pass** | Pre-Zod `findForbiddenUpdateBusinessProfileKeys` → `FORBIDDEN_FIELDS` (`update-helpers.ts:15-51`; action `121-123`; tests `111-158`). Includes `client_id`, `version`, `updated_by`, `as_client_id`, `role`, etc. |
| **IDOR / no tenant write authority** | **Pass** | Signature `updateBusinessProfile(input)` only (`update-business-profile.ts:166-168`); arity test `length === 1` (`test.ts:297-317`). `requireActive("handler")` then `.eq("client_id", user.id)` / `params.clientId = user.id` (`112-119`, `146-150`, `91`). No `searchParams` / `/profile/[id]`. |
| **`updated_by` server-only + migration** | **Pass** | Migration nullable FK → `neuramark_clients(id)` ON DELETE SET NULL (`20260829140000_…updated_by.sql:4-12`). Set from `editorClientId` = `user.id` only (`update-helpers.ts:80-84`). Client `updated_by` rejected as forbidden. DTO omits column (`mapUpdateBusinessProfileResult` `94-125`; select `fields, version, updated_at` only). |
| **Version bump server-only** | **Pass** | `version: currentVersion + 1` in builder; client `version` → `FORBIDDEN_FIELDS`. (Atomicity: Low #2.) |
| **No create-via-PATCH** | **Pass** | Missing SELECT → `PROFILE_NOT_FOUND` before UPDATE (`update-business-profile.ts:141-144`). UPDATE path only; no `.insert` / upsert in action module. FE missing → CTA `/interview`, no edit chrome (`LivingProfileView.tsx:93-121`). |
| **XSS — controlled inputs + text nodes** | **Pass** | Edit via `InterviewStepFields`; display `{description}` / `{item}` children (`LivingProfileEditor.tsx:390-513`). Grep: no product `dangerouslySetInnerHTML` (comments only). |
| **CSRF / Server Action only** | **Pass** | `"use server"` module (`update-business-profile.ts:1`); same class as `submitInterview`. No `app/api/profile` (test `320-331`; filesystem absent). |
| **Unauthenticated / inactive** | **Pass** (code) | `requireActive("handler")` before validate/write (`112-119`); 401/403 envelopes (`36-43`, `errors.ts:45-50`). Unit proof of guard call = Low #1 gap. |
| **`Cache-Control: no-store` + gated route** | **Pass** | `next.config.ts:37-42`; `dynamic = "force-dynamic"` (`page.tsx:8`); under `app/(app)/profile/`; `isPublicPath("/profile") === false` (test `333-335`). |
| **No `getBusinessProfileForAgents`** | **Pass** | Grep: not present in product code. |
| **No Operator cross-tenant** | **Pass** | No `as_client_id` / `requireOperator` branch on mutate path. |
| **Client bundle / secrets** | **Pass** | Editor imports Server Action only; no `@supabase/supabase-js` in `components/profile`. Types-only from `lib/contracts/profile`. Supabase via `createServerSupabaseClient()` in action. |
| **No free-text fields in logs** | **Pass** | Logs `{ code }` / static strings only (`update-business-profile.ts:56-57`, `96-97`, `137`, `175`). |
| **`neuramark_` prefix / RLS** | **Pass** | Writes `neuramark_business_profiles` only; additive `updated_by` migration; no `profile_versions`. |
| **EN/ES + Save/Cancel/toast** | **Pass** | Living profile / Ficha viva; Style / Estilo (`messages/en.json` + `es.json` `profile.*`). Await Save + success toast; Cancel restores snapshot (`LivingProfileEditor.tsx:176-180`, `301-330`). |
| **Full seven-key replace** | **Pass** | FE `buildSnapshot` merges all steps (`116-129`); BE writes entire validated object. Sparse body rejected (test `74-83`). |

---

### Focus confirmation (requested)

| Focus | Result | Owner if fail |
|-------|--------|----------------|
| Mass assignment / `.strict()` | **Pass** | — |
| IDOR | **Pass** | — |
| `updated_by` server-only | **Pass** | — |
| No create-via-PATCH | **Pass** | — |
| XSS | **Pass** | — |
| Consent / visual reject | **Pass** | — |
| CSRF Server Action | **Pass** | — |

---

### Confirmations (CONTRACT / SECURITY)

| Topic | Result |
|-------|--------|
| AC: Edits persist / next agent run | **Pass** (soft — canonical row + version bump; US-2.3 wires agent reads). |
| AC: Restricted fields re-confirmation | **Pass** by **blocking** consent/visual here (US-3.x owns re-confirm). |
| AC: LWW + visible timestamp | **Pass.** Success `updatedAt`; UI “Last updated {date}”. |
| `[SEC]` PATCH allowlist; consent / visual_mode / system immutable via this endpoint | **Pass.** |
| `[SEC]` Records who + bumps version | **Pass.** Migration + server `updated_by` + version+1. |
| Out of scope (US-2.3 agent helper, Preferencias editors, `profile_versions`, public API, browser Supabase) | **Pass.** Not introduced. |

---

### Critical / High fix ownership

**None.** No Critical or High findings. No FE vs BE re-delegation for a fix loop.

| Finding | Owner |
|---------|-------|
| Low #1 — mocked action SELECT/UPDATE / auth short-circuit harness | **BE** (optional follow-up) |
| Low #2 — atomic SQL `version = version + 1` | **BE** (optional harden) |

---

### Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/profile/update-business-profile.test.ts` | **17/17 pass** |
| `npx eslint` on US-2.2 changed TS/TSX (action, helpers, errors, LivingProfileEditor/View, profile page) | **exit 0** |
| `npx tsc --noEmit` | **Errors only in test files** (`.ts` import extensions / `NODE_ENV` assign) — pre-existing harness pattern; **not** product compile blockers |
| Filesystem / grep: `app/api/profile`, `dangerouslySetInnerHTML`, `getBusinessProfileForAgents`, `as_client_id` mutate path, client `@supabase` on profile surfaces, `.insert` in update action | Clean (no public API; XSS notes are comments only; insert remains US-1.3 upsert module only) |

---

### What Was Not Covered

- Live browser E2E (authenticated `/profile` Save → DB `fields` / `version` / `updated_by` / `updated_at`; missing CTA; CSRF from foreign origin).
- Live Postgres application of `20260829140000_neuramark_business_profiles_updated_by.sql` this gate.
- Full `next build` (not required given targeted lint + unit evidence; tsc noise confined to tests).
- Concurrent two-tab Save race against a real DB (LWW accepted; version collision = Low #2).
- PrimeReact `Message` / `Toast` internal DOM audit beyond `text` / controlled children (treated as text path consistent with prior story QA).

---

### CLOSE

**yes** — no Critical/High; no blocking Medium; optional Low test harness + non-atomic version residual only. Product-owner may check US-2.2 AC boxes and close the story without a fix loop.
