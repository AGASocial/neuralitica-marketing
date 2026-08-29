# Validation Report — US-3.4

**Story:** Enforce generic avatar representation rules  
**Validator:** requirements-validator  
**Date:** 2026-08-29  
**Branch:** `feature/US-3.4-generic-avatar-rules`  
**Commits reviewed:** `a0b0a80` (FE — disclosure warning + preview UI), `eadf356` (BE — rules hardening, agents DTO, QA stub)  
**Contract:** Frozen, Reviewed by FE (2026-08-29)  
**SPEC-REVIEW:** ALIGNED (V1 allowlist proxy; stubs for QA/approval — not full US-10.1 / US-11.1)  
**SECURITY:** APPROVE WITH CONDITIONS (binding `[SEC]` floors)  
**Tests re-run:** `npx tsx --test lib/qa/generic-avatar-not-owner.test.ts lib/visual-preferences/visual-preferences.test.ts lib/visual-preferences/upsert-visual-preferences.test.ts lib/profile/get-business-profile-for-agents.test.ts` → **66/66 pass**  
**Live browser / DB E2E:** **Not run** this gate (code + unit evidence only)

---

### Verdict: PASS WITH NOTES

All five USER_STORIES acceptance criteria are satisfied **per the phased US-3.4 scope** frozen in `CONTRACT.md`, `SPEC-REVIEW.md`, and `TASKS.md`: server-owned `must_disclose_not_owner` on read/write paths, agents DTO `mustDiscloseNotOwner`, deterministic QA check stub classified `blocking`, Preferencias warning + disclosure preview stub with EN/ES copy. Full US-10.1 QA agent job and US-11.1 approval screen are correctly **not** implemented here.

On PASS, the product-owner — not this validator — checks the story’s acceptance criteria in `plan/USER_STORIES.md`.

**QA can proceed:** **Yes** (blocker count: **0**).

---

### Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Generic mode sets `must_disclose_not_owner = true` | **PASS** | `deriveVisualPreferencesRules` sets `true` when `generic_avatar` ∈ allowlist (`lib/visual-preferences/helpers.ts` 71–77). Upsert persists derived rules via `buildVisualPreferencesUpsertPayload` (283–300). Read path resolves drift via `resolveVisualPreferencesRules` (84–110). Mapper surfaces resolved rules (`mapVisualPreferencesRow` 240–255). Tests: derivation toggle, drift repair, upsert happy path (`visual-preferences.test.ts` 223–302, 354–374; `upsert-visual-preferences.test.ts` 172–199). Agents DTO exposes `mustDiscloseNotOwner: true` from resolved rules (`get-business-profile-for-agents.ts` 78–86; test `get-business-profile-for-agents.test.ts` 286–350). |
| QA agent fails scripts that claim generic avatar is the owner | **PASS** (phased: **stub + fixtures**, not live US-10.1 job) | `evaluateGenericAvatarNotOwnerCheck` (`lib/qa/checks/generic-avatar-not-owner.ts` 180–202) fails owner-claim EN/ES patterns when `mustDiscloseNotOwner === true` without disclosure pass phrases; passes when flag false (N/A), no claim, or disclosure present. Frozen `checkKey` `generic_avatar_not_owner` (`lib/contracts/qa.ts` 9–10). CONTRACT fixtures covered (`generic-avatar-not-owner.test.ts` 44–170). SPEC-REVIEW/TASKS explicitly scope live QA agent to US-10.1. |
| Approval UI shows required disclosure when applicable | **PASS** (phased: **preview stub** on Preferencias, not full US-11.1) | `GenericAvatarDisclosurePreview` renders canonical disclosure line when `visible` (`components/preferences/GenericAvatarDisclosurePreview.tsx` 18–61). Mounted on `/settings/preferences` when generic in draft or server `must_disclose_not_owner` (`PreferencesEditor.tsx` 166–170, 534–539). i18n `legal.genericAvatarDisclosure` EN/ES (`messages/en.json` 298; `messages/es.json` 298). Preview note clarifies not final approval package (`messages/en.json` 310–311; `messages/es.json` 310–311). |
| **[SEC] `must_disclose_not_owner` server-side; not client-writable** | **PASS** | FORBIDDEN strip includes `rules`, `must_disclose_not_owner`, `mustDiscloseNotOwner` (`helpers.ts` 31–33, 50–68). Upsert rejects before write (`upsert-visual-preferences.ts` 89+; test `upsert-visual-preferences.test.ts` 242–259). Zod input `.strict()` excludes rules (`lib/contracts/visual-preferences.ts` 95–113). No new client write surfaces. US-2.2 PATCH regression still rejects Preferencias keys (`visual-preferences.test.ts` 329–346). |
| **[SEC] QA impersonation check = non-overridable legal block (US-10.2 class)** | **PASS** (classification **exported**; override handler = US-10.2) | `QA_CHECK_SEVERITY.blocking` in `lib/qa/check-classes.ts` 5–8. Stub always returns `severity: QA_CHECK_SEVERITY.blocking` on pass and fail (`generic-avatar-not-owner.ts` 160–177). `GENERIC_AVATAR_NOT_OWNER_CHECK_KEY` frozen for US-10.1/US-10.2 import. Module headers document mandatory downstream import (`generic-avatar-not-owner.ts` 6–8; `get-business-profile-for-agents.ts` 18–19). |

---

### SECURITY.md `[SEC]` floors (US-3.4 + added + inherited re-assertions)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Story `[SEC]` rows (2) | **PASS** | See acceptance table above. |
| **[SEC] (added) `rules` jsonb never client-writable** | **PASS** | Derivation on every upsert; forbidden keys + tests. |
| **[SEC] (added) Derivation authority on read** | **PASS** | `resolveVisualPreferencesRules` prefers derivation on drift; logs `[preferences] rules drift`; never exposes `false` when generic ∈ allowlist (helpers.ts 99–106; tests 252–259). |
| **[SEC] (added) Agents DTO injection only** | **PASS** | `getBusinessProfileForAgents` loads `allowed_modes, rules` server-side; `mustDiscloseNotOwner` from `resolveVisualPreferencesRules` only (`get-business-profile-for-agents.ts` 41–86). `import "server-only"`. |
| **[SEC] (added) QA stub exports frozen key + blocking** | **PASS** | Constants + strict Zod contracts (`lib/contracts/qa.ts`; `check-classes.ts`). |
| **[SEC] (added) No new client write surface for disclosure** | **PASS** | No new Route Handlers or Server Actions; preview is read-only. |
| **[SEC] (added) Ficha viva PATCH rules-blind** | **PASS** | Regression test unchanged (`visual-preferences.test.ts` 329–346). |
| **[SEC] (added) XSS bar on disclosure copy** | **PASS** | React text nodes / PrimeReact `Message` `text`; no `dangerouslySetInnerHTML` in preferences/disclosure components. |
| **[SEC] (added) IDOR continuity** | **PASS** | Loader arity 0; upsert session-bound; agents `clientId` from trusted context only. |
| **[SEC] (added) Automated security tests** | **PASS** | 66/66 re-run includes forbidden fields, derivation toggle, drift, DTO flag, QA pass/fail fixtures, blocking constant. |
| Inherited US-3.1 / US-2.2 / US-2.3 / US-14.5 floors | **PASS** | No weakening observed; server-only agents helper; consent internals omitted from DTO. |

---

### CONTRACT compliance

| Topic | Status | Evidence |
|-------|--------|----------|
| `deriveVisualPreferencesRules` single authority | **PASS** | One function; upsert + read use it. |
| `resolveVisualPreferencesRules` read authority | **PASS** | Implemented per frozen behavior. |
| `visualModeSummary` widen | **PASS** | `{ allowedModes, mustDiscloseNotOwner }` Zod `.strict()` (`visual-preferences.ts` 191–196; `profile.ts` 75). |
| QA stub contract | **PASS** | Input/output types, `checkKey`, severity, EN/ES fixtures match CONTRACT. |
| `buildGenericDisclosurePromptHint` | **PASS** | Server-only optional helper (`lib/qa/build-generic-disclosure-prompt-hint.ts`). |
| FE warning severity | **PASS** | `warn` when `generic_avatar` in draft; `info` when only persisted server rule (`PreferencesEditor.tsx` 169–170, 526–531). |
| `GenericAvatarDisclosurePreview` props + placement | **PASS** | Props match CONTRACT; mounted below modality section on Preferencias. |
| i18n shared legal line | **PASS** | `legal.genericAvatarDisclosure` EN/ES consumed by page → editor → preview. |
| No migration / no forbidden surfaces | **PASS** | Reuses `neuramark_visual_preferences.rules`; no new RH; no LLM in QA path. |
| FE signoff freeze followed | **PASS** | No Supabase in Client Components; no client write of rules/flag. |

---

### Convention Compliance

| Check | Status | Evidence |
|-------|--------|----------|
| EN + ES user-facing strings | **PASS** (1 note) | Warning, legal line, preview note in `messages/en.json` and `messages/es.json`. **Note:** internal `qa.checks.genericAvatarNotOwner.failOwnerClaim` key referenced in stub evidence is not yet in message files (non-user-facing in 3.4; US-10.1 may add). |
| Server Components by default | **PASS** | `app/(app)/settings/preferences/page.tsx` is RSC; `"use client"` only on `PreferencesEditor` / `GenericAvatarDisclosurePreview`. |
| PrimeReact-first | **PASS** | `Message` for warning; existing Checkbox/Dropdown pattern. |
| Loading / empty / error / pending | **PASS** | Inherited from US-3.1 Preferencias flow (loadFailed, empty hint, save pending, error banner). |
| Auth / identity | **PASS** | `requireActive` via `(app)` layout; arity-0 loaders; `getCurrentUser()` seam unchanged. |
| No browser Supabase | **PASS** | No `@supabase` in `components/preferences/*`. |
| Backend maps to concrete FE consumer | **PASS** | All BE changes serve Preferencias loader, agents profile, or future US-5.1/US-10.1 imports — no speculative APIs. |
| `neuramark_` prefix | **PASS** | No new DB objects; existing table reused. |

---

### Dependencies

| Dependency | Status | Evidence |
|------------|--------|----------|
| US-3.1 (Preferencias + `rules` derivation) | **Satisfied** | CLOSED; US-3.4 extends without reopening schema. |
| US-2.3 (`getBusinessProfileForAgents`) | **Satisfied** | CLOSED; DTO widened in place. |
| US-14.5 (`getCurrentUser` / `requireActive`) | **Satisfied** | Preferencias paths unchanged. |

---

### Gaps (what blocks PASS)

**None.** Blocker count: **0**.

---

### Notes (non-blocking)

1. **Phased AC wording:** USER_STORIES AC says “QA agent” and “Approval UI”; US-3.4 correctly delivers **check stub** and **disclosure preview stub** per SPEC-REVIEW/TASKS/CONTRACT. Validator confirms stubs meet story-folder scope; PO should not treat full US-10.1 / US-11.1 as done.
2. **Internal QA i18n:** `qa.checks.genericAvatarNotOwner.failOwnerClaim` is frozen in CONTRACT as an internal evidence key but is not present in `messages/en.json` / `messages/es.json`. Stub returns `messageKey` string only — acceptable for 3.4; add EN/ES when US-10.1 surfaces evidence to Operators.
3. **`TASKS.md` gate checklist** still shows PREP/unchecked gates at file bottom — stale vs actual SPEC-REVIEW, SECURITY, CONTRACT, and BUILD commits. Documentation hygiene only.
4. **No `npm test` script** in `package.json`; tests run via `npx tsx --test …` (66/66 pass this gate).

---

### Scope Creep

**None identified.** Correctly excluded: US-10.1 QA job / `neuramark_qa_reports`, US-10.2 override handler, US-11.1 full approval screen, US-5.1 script generation, per-slot Modalidad (US-4.x), DB migration, public disclosure Route Handlers, LLM in QA stub.

---

### Recommended Next Actions

| Action | Owner |
|--------|--------|
| Run **QA** gate on branch `feature/US-3.4-generic-avatar-rules` (FE `a0b0a80`, BE `eadf356`) | qa-engineer |
| PO check off AC in `plan/USER_STORIES.md` after QA approve | product-owner |
| US-5.1: consume `visualModeSummary.mustDiscloseNotOwner` + optional `buildGenericDisclosurePromptHint` | content-agents-engineer / nextjs-backend |
| US-10.1: import `evaluateGenericAvatarNotOwnerCheck`, `GENERIC_AVATAR_NOT_OWNER_CHECK_KEY`, `QA_CHECK_SEVERITY.blocking` | content-agents-engineer |
| US-11.1: reuse `legal.genericAvatarDisclosure` + `GenericAvatarDisclosurePreview` pattern | nextjs-frontend |
| Optional: add `qa.checks.*` EN/ES entries when QA report UI ships | nextjs-frontend |
