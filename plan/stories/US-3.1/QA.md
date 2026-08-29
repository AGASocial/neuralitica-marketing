# QA Report — US-3.1 Choose visual production mode

**Story:** Preferencias de producción visual (allowlist)  
**Reviewer:** qa-engineer  
**Date:** 2026-08-29  
**Branch:** `feature/US-3.1-visual-mode`  
**Commits:** `c0caaee` (FE), `6e2121c` (BE)  
**Prior gate:** VALIDATION.md — PASS WITH NOTES  
**Sources:** USER_STORIES § US-3.1, SECURITY.md, CONTRACT.md, TASKS.md, VALIDATION.md, implementation under `app/(app)/settings/preferences/`, `components/preferences/`, `lib/visual-preferences/`, `lib/contracts/visual-preferences.ts`, migration `20260829210000_neuramark_visual_preferences.sql`

---

### Verdict: APPROVE WITH CONDITIONS

No Critical or High findings. Core SEC floors (enum/allowlist Zod `.strict()`, `OWN_AVATAR_CONSENT_REQUIRED` fail-closed, session-bound IDOR, forbidden-key reject, server-derived `rules`, no silent regenerate, XSS/CSRF/Server Action, no browser Supabase, RLS deny-by-default + `neuramark_` prefix) are implemented and covered by automated tests.

**CLOSE can proceed:** **Yes** (blocker count for Critical/High: **0**).

Conditions below are Medium/Low hardening or US-3.2 handoff — do not block CLOSE for US-3.1.

---

### Findings

#### Medium

1. **`hasActiveAvatarConsent` uses unfiltered `.maybeSingle()` — brittle for US-3.2 append-only ledger**  
   - **Where:** `lib/visual-preferences/has-active-avatar-consent.ts:60–64`  
   - **What:** Probe selects all consent rows for `client_id` then `.maybeSingle()`. US-3.2 is documented as append-only (re-consent under new version ⇒ multiple rows). PostgREST returns an error when >1 row; the helper fails closed (`false`).  
   - **Why it matters:** Not a V1 bypass (table absent ⇒ correctly `false`). Once a multi-row ledger exists, an active non-revoked consent can be misread as “no consent,” permanently blocking `own_avatar` despite SECURITY semantics (“Active non-revoked row → true”). Fail-closed is safe legally; it is incorrect availability.  
   - **Fix direction:** Before or as first US-3.2 task: filter `revoked_at IS NULL`, order by `consented_at` desc (or version), `.limit(1)` / `.maybeSingle()` on the active subset only. Add a unit test for multi-row + one active.

#### Low

2. **`helpers.ts` missing `import "server-only"`**  
   - **Where:** `lib/visual-preferences/helpers.ts` (no `server-only`); contrast loader/consent modules.  
   - **What:** SECURITY requires Preferencias helpers under server-only paths. The test titled “helpers import server-only” (`visual-preferences.test.ts:509–530`) asserts consent/loader/`"use server"` upsert only — not `helpers.ts`.  
   - **Why it matters:** Today helpers are only imported from server modules (limited blast radius). Without the guard, a future Client import could pull privileged mapping/payload builders into the browser graph.  
   - **Fix direction:** Add `import "server-only"` to `helpers.ts`; assert that file in the static test.

3. **Client imports value from Zod contract module**  
   - **Where:** `components/preferences/PreferencesEditor.tsx:10–17` → `FACELESS_STYLE_DEFAULT` from `lib/contracts/visual-preferences.ts` (module also exports Zod schemas).  
   - **What:** Pulls Zod (and schema definitions) into the Client Component module graph. Server still re-validates on upsert — not a trust-boundary bypass.  
   - **Fix direction:** Move `FACELESS_STYLE_DEFAULT` (and type-only re-exports) to a tiny shared constants module without Zod (VALIDATION soft note #4).

4. **Unnecessary `"use client"` on `PreferencesView`**  
   - **Where:** `components/preferences/PreferencesView.tsx:1`  
   - **What:** Wrapper has no hooks/browser APIs; only composes `PreferencesEditor`. Widens client boundary slightly.  
   - **Fix direction:** Make `PreferencesView` an RSC wrapper (VALIDATION soft note #3).

5. **ESLint unused symbols in Preferencias test file**  
   - **Where:** `lib/visual-preferences/visual-preferences.test.ts:22`, `:401`  
   - **What:** Unused import / unused `_input` under `--max-warnings 0`. Does not affect runtime security.  
   - **Fix direction:** Remove unused import; omit or void unused param.

6. **Inactive (`FORBIDDEN`) path covered by code, not dedicated upsert integration test**  
   - **Where:** `upsert-visual-preferences.ts:34–40` maps 403; isolated tests cover `UNAUTHENTICATED` and consent/IDOR, not inactive.  
   - **Why it matters:** Coverage gap only — `requireActive("handler")` + envelope already implement CONTRACT.  
   - **Fix direction:** Optional mirror test for 403 inactive (no write).

---

### Security focus checklist (evidence)

| Focus | Result | Evidence |
|-------|--------|----------|
| Enum / allowlist validation | **Pass** | `upsertVisualPreferencesInputSchema` `.strict()` + modality enum (`lib/contracts/visual-preferences.ts:8–131`); unknown/duplicate rejected (tests) |
| `OWN_AVATAR_CONSENT_REQUIRED` fail-closed | **Pass** (V1) | Upsert gates on `hasActiveAvatarConsent` (`upsert-visual-preferences.ts:104–108`); missing config/table/error → `false` (`has-active-avatar-consent.ts:50–85`); no write (isolated test) |
| IDOR session-bound | **Pass** | Loader arity 0; upsert body-only; `client_id: user.id` only (`helpers.ts:245–262`); foreign `client_id` → `FORBIDDEN_FIELDS` |
| Strip / reject forbidden keys | **Pass** | `findForbiddenUpsertVisualPreferencesKeys` + Zod `.strict()` (`helpers.ts:20–68`) |
| Server-derived `rules` | **Pass** | `deriveVisualPreferencesRules`; client `rules` / `must_disclose_not_owner` rejected |
| No silent regenerate / jobs | **Pass** | Upsert + `revalidatePath` only; `fromTables === ["neuramark_visual_preferences"]` (isolated test); no generation imports in action source |
| XSS on mode copy | **Pass** | i18n + React text / PrimeReact `Message` `text`; no `dangerouslySetInnerHTML` on preferences surfaces |
| CSRF via Server Action | **Pass** | `"use server"` `upsertVisualPreferences`; no public Preferencias Route Handler |
| No browser Supabase | **Pass** | No `@supabase` / `NEXT_PUBLIC_*` Supabase in `components/preferences`; access via `lib/supabase/server` only |
| Client/server leakage | **Pass with Low notes** | Loader/consent `server-only`; action `"use server"`; helpers lack `server-only` (finding #2); FACELESS_STYLE_DEFAULT from Zod module (finding #3) |
| RLS + `neuramark_` prefix | **Pass** | Migration enables RLS, zero `CREATE POLICY`; type/table/constraints/trigger prefixed; no consent/media tables in this migration |
| US-2.2 PATCH Preferencias-blind | **Pass** | Regression: Ficha viva schema rejects `visual_mode` / `allowedModes` |
| Settings gated + `no-store` | **Pass** | Under `(app)`; `isPublicPath("/settings/preferences") === false`; `next.config.ts` `/settings` + `/settings/:path*` → `no-store`; `dynamic = "force-dynamic"` |
| Agent `visualModeSummary` | **Pass** | Allowlist-only `{ allowedModes }`; omit consent (`get-business-profile-for-agents.ts:34–67`) |
| No recording UX | **Pass** | No MediaRecorder/getUserMedia; EN/ES copy states uploads later |

---

### Checks Run

| Check | Result |
|-------|--------|
| `npx tsx --test lib/visual-preferences/*.test.ts lib/profile/get-business-profile-for-agents.test.ts lib/profile/update-business-profile.test.ts` | **61/61 pass** |
| `npx tsc --noEmit` (workspace) | Pre-existing `.test.ts` `TS5097` / `NODE_ENV` assign noise only; **no errors in US-3.1 implementation sources** (`*.ts` excluding tests) |
| `npx eslint` on Preferencias FE/BE paths (`--max-warnings 0`) | **2 warnings** in `visual-preferences.test.ts` (unused vars) — finding #5 |
| Static: `dangerouslySetInnerHTML` on preferences UI | **None** (comment-only mention) |
| Static: public Preferencias API routes | **Absent** |
| Static: migration RLS / no consent / no media / no `CREATE POLICY` | **Confirmed** |
| Live browser / DB E2E against real session | **Not run** (same scope limit as VALIDATION) |

---

### What Was Not Covered

- Manual or Playwright E2E on `/settings/preferences` with a live Supabase session (empty load, save generic+faceless, assert `OWN_AVATAR_CONSENT_REQUIRED` / disabled own-avatar, EN/ES).  
- Production build / full Next bundle analysis for Zod leakage volume.  
- Concurrent LWW upsert under load (accepted residual).  
- Full US-3.2 ledger behavior (out of story; see Medium finding for probe handoff).

---

### Conditions for CLOSE (non-blocking)

1. **Track for US-3.2 (or immediate follow-up):** harden `hasActiveAvatarConsent` for multi-row active consent (Medium #1).  
2. **Optional polish:** `server-only` on helpers; split `FACELESS_STYLE_DEFAULT`; RSC `PreferencesView`; clean test lint (Low #2–#5).

---

### Severity counts

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 1 |
| Low | 5 |

**CLOSE:** **Yes**
