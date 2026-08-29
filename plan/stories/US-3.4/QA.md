# QA Report — US-3.4 Enforce generic avatar representation rules

**Story:** US-3.4 — Enforce generic avatar representation rules  
**Branch:** `feature/US-3.4-generic-avatar-rules`  
**Commits reviewed:** `a0b0a80` (FE — disclosure warning + preview UI), `eadf356` (BE — rules hardening, agents DTO, QA stub), `1773ef7` (sprint state → VALIDATE)  
**Date:** 2026-08-29  
**Reviewer:** qa-engineer  
**Contract:** Frozen (FE signoff 2026-08-29)  
**SECURITY:** APPROVE WITH CONDITIONS (binding)  
**VALIDATION:** PASS WITH NOTES (2026-08-29)

---

## Verdict: APPROVE WITH NOTES

Implementation meets the frozen US-3.4 CONTRACT and SECURITY bar: server-owned `must_disclose_not_owner` on write (`deriveVisualPreferencesRules`) and read (`resolveVisualPreferencesRules` with drift repair), FORBIDDEN strip for client-writable rule flags, agents DTO `visualModeSummary.mustDiscloseNotOwner` populated server-side only, deterministic QA check stub with frozen `generic_avatar_not_owner` key and `blocking` severity, Preferencias warning + read-only disclosure preview with EN/ES i18n, no new Route Handlers or DB migration, no browser Supabase in preferences components.

Phased scope is correct: US-10.1 live QA job and US-11.1 full approval screen are **not** implemented here (stubs only).

**CLOSE:** **Yes** — 0 Critical, 0 High; story may close after PO AC checkoff in `plan/USER_STORIES.md`.

---

## Severity counts

| Severity | Count |
|----------|------:|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 4 |

---

## Findings

### Low — Internal QA evidence key not in i18n catalogs

**File:** `lib/qa/checks/generic-avatar-not-owner.ts:38` (evidence `messageKey`)

**What:** Stub returns `qa.checks.genericAvatarNotOwner.failOwnerClaim` as evidence. CONTRACT freezes this key, but `messages/en.json` and `messages/es.json` have no matching entry.

**Why it matters:** No user-facing impact in US-3.4 (stub is server-only; no Operator QA report UI). US-10.1 will need localized evidence strings when failures surface in the approval workflow.

**Fix direction:** Add EN/ES entries under `qa.checks.genericAvatarNotOwner` when US-10.1 ships the QA report UI.

---

### Low — QA stub is heuristic-only (documented residual risk)

**Files:** `lib/qa/checks/generic-avatar-not-owner.ts:24–167`, `lib/contracts/qa.ts`

**What:** Owner-claim detection uses fixed EN/ES phrase lists, optional display-name templates, and disclosure pass phrases with paragraph/120-char adjacency. No LLM layer.

**Why it matters:** False negatives (clever owner-claim wording passes) and false positives (benign first-person + “my business” in same sentence) are possible until US-10.1 adds LLM QA on the same `checkKey`. SECURITY and CONTRACT accept this for V1.

**Fix direction:** US-10.1 must import this stub and preserve `GENERIC_AVATAR_NOT_OWNER_CHECK_KEY` + `QA_CHECK_SEVERITY.blocking`; extend fixtures as new edge cases are discovered.

---

### Low — V1 allowlist-level disclosure flag (conservative proxy)

**Files:** `lib/profile/get-business-profile-for-agents.ts:13–16`, `lib/visual-preferences/helpers.ts:71–77`

**What:** `mustDiscloseNotOwner` is true whenever `generic_avatar` ∈ `allowed_modes`, not when a specific Reel slot uses generic modality.

**Why it matters:** Script/QA may require disclosure even when the active slot is faceless-only — conservative for legal safety, but may over-disclose until US-4.x per-slot Modalidad composes with this default. Documented in CONTRACT/SECURITY as accepted residual risk.

**Fix direction:** US-4.x should pass per-job modality server-side; logical AND with allowlist default — do not remove allowlist derivation.

---

### Low — `helpers.ts` still lacks `import "server-only"` (carry-forward from US-3.1)

**File:** `lib/visual-preferences/helpers.ts:1` (no `server-only` guard)

**What:** `deriveVisualPreferencesRules`, `resolveVisualPreferencesRules`, `buildVisualPreferencesUpsertPayload`, and FORBIDDEN-key logic live in a module without the `server-only` package import. Contrast `lib/qa/checks/generic-avatar-not-owner.ts:1` and `lib/profile/get-business-profile-for-agents.ts:1`.

**Why it matters:** Today helpers are only imported from server actions/helpers (limited blast radius). A future accidental Client Component import could pull derivation/payload builders into the browser graph.

**Fix direction:** Add `import "server-only"` to `helpers.ts` and extend the static test in `visual-preferences.test.ts` to assert it.

---

## Security focus review

| Area | Result | Evidence |
|------|--------|----------|
| Server-derived `rules` on upsert | **Pass** | `buildVisualPreferencesUpsertPayload` calls `deriveVisualPreferencesRules` (`helpers.ts:283–300`) |
| Client-writable rule flags blocked | **Pass** | FORBIDDEN strip includes `rules`, `must_disclose_not_owner`, `mustDiscloseNotOwner` (`helpers.ts:31–33`); upsert rejects before Zod (`upsert-visual-preferences.ts:89–91`); test `upsert-visual-preferences.test.ts:242–259` |
| Read-path drift repair | **Pass** | `resolveVisualPreferencesRules` prefers derivation, logs drift, never exposes `false` when generic ∈ allowlist (`helpers.ts:99–106`); agents integration test (`get-business-profile-for-agents.test.ts:286–350`) |
| Agents DTO injection only | **Pass** | `loadVisualModeSummaryForAgents` loads DB server-side; `mustDiscloseNotOwner` from `resolveVisualPreferencesRules` only (`get-business-profile-for-agents.ts:41–86`); `import "server-only"` |
| QA check `blocking` classification | **Pass** | `QA_CHECK_SEVERITY.blocking` (`check-classes.ts:5–8`); stub always returns `severity: blocking` on pass and fail (`generic-avatar-not-owner.ts:160–177`) |
| Frozen `checkKey` | **Pass** | `GENERIC_AVATAR_NOT_OWNER_CHECK_KEY = "generic_avatar_not_owner"` (`contracts/qa.ts:9–10`) |
| No LLM in 3.4 QA path | **Pass** | Deterministic evaluator only (`generic-avatar-not-owner.ts:180–202`) |
| Ficha viva PATCH rules-blind | **Pass** | Regression test unchanged (`visual-preferences.test.ts:329–346`) |
| XSS on disclosure copy | **Pass** | React text nodes / PrimeReact `Message` `text`; no `dangerouslySetInnerHTML` in `components/preferences/*` |
| No browser Supabase | **Pass** | No `@supabase` imports under `components/preferences/**` |
| No new public disclosure API | **Pass** | No new Route Handlers; `/settings/preferences` off `isPublicPath` (test `visual-preferences.test.ts`) |
| IDOR continuity | **Pass** | Loader arity 0; upsert session-bound; agents `clientId` from trusted context only |
| i18n EN + ES | **Pass** | `legal.genericAvatarDisclosure`, `preferences.disclosureNote`, `preferences.disclosurePreview.note` in `messages/en.json` and `messages/es.json` |

---

## Checks run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/qa/generic-avatar-not-owner.test.ts lib/visual-preferences/visual-preferences.test.ts lib/visual-preferences/upsert-visual-preferences.test.ts lib/profile/get-business-profile-for-agents.test.ts` | **66/66 pass** |
| `npm run lint` | **Exit 1** — 3 ESLint errors in `lib/media/media-assets.test.ts` (`no-require-imports`); pre-existing, not introduced by US-3.4. No lint issues in US-3.4 changed files. |
| `npm run build` | **Failed** — `AUTH_DEV_FALLBACK must not be set when NODE_ENV=production` (reviewer local `.env`; **not introduced by US-3.4**). TypeScript compile step succeeded before page-data collection failed. |
| `npx tsc --noEmit` | **Exit 2** — errors confined to `*.test.ts` import paths; production app sources compile under Next build. |
| Live browser E2E (Preferencias disclosure warning/preview toggle) | **Not run** |

---

## What was not covered

- Live browser verification of warning severity (`warn` vs `info`) and disclosure preview visibility on `/settings/preferences`
- End-to-end upsert → reload with real Supabase row (unit mocks only)
- US-5.1 / US-10.1 consumer integration (deferred to sibling stories)
- Production build with sanitized env (blocked by `AUTH_DEV_FALLBACK` in reviewer `.env`)
- Legal review of EN/ES disclosure strings (async per CONTRACT)

---

## Recommended follow-ups (post-close)

| Priority | Action | Owner |
|----------|--------|-------|
| Low | Add `import "server-only"` to `lib/visual-preferences/helpers.ts` | nextjs-backend |
| US-5.1 | Consume `visualModeSummary.mustDiscloseNotOwner` + optional `buildGenericDisclosurePromptHint` | content-agents-engineer |
| US-10.1 | Import `evaluateGenericAvatarNotOwnerCheck`, `GENERIC_AVATAR_NOT_OWNER_CHECK_KEY`, `QA_CHECK_SEVERITY.blocking` | content-agents-engineer |
| US-10.1 | Add `qa.checks.genericAvatarNotOwner.failOwnerClaim` to EN/ES messages | nextjs-frontend |
| US-11.1 | Reuse `legal.genericAvatarDisclosure` + `GenericAvatarDisclosurePreview` pattern | nextjs-frontend |
| US-4.x | Compose per-slot modality with allowlist-level disclosure default | nextjs-backend |
