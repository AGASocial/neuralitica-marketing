# Validation Report — US-3.2

**Story:** Capture consent for own avatar (Consentimiento de avatar)  
**Validator:** requirements-validator  
**Date:** 2026-08-29  
**Branch:** `feature/US-3.2-avatar-consent`  
**Commits reviewed:** `7a11571` (FE — Consentimiento UI on Preferencias), `ff280ed` (BE — migration + grant/revoke + hardened probe + stubs)  
**Contract:** Frozen, Reviewed by FE (2026-08-29)  
**SPEC-REVIEW:** ALIGNED  
**SECURITY:** APPROVE WITH CONDITIONS (binding `[SEC]` floors)  
**Depends on:** US-3.1 ✅ CLOSED (`VALIDATION.md` PASS WITH NOTES)  
**Tests re-run:** `npx tsx --test lib/visual-preferences/*.test.ts` → **58/58 pass** (includes `avatar-consent.test.ts` 25 + Preferencias continuity suite)  
**Live browser / DB E2E:** **Not run** this gate (code + unit evidence only)

---

### Verdict: PASS WITH NOTES

All eight USER_STORIES acceptance criteria and the SECURITY.md `[SEC]` floors for US-3.2 (story + added + inherited re-assertions relevant to Consentimiento) are met. CONTRACT shapes, append-only ledger, multi-row-safe + version-aware `hasActiveAvatarConsent`, explicit grant/revoke Server Actions, Preferencias continuity (reject `own_avatar` without consent; upsert never writes ledger), and job/cancel stubs match the freeze. Soft notes only for CONTRACT-allowed video-job stubs / in-flight Operator TODO and non-blocking UX polish.

On PASS, the product-owner — not this validator — checks the story’s acceptance criteria in `plan/USER_STORIES.md`.

**QA can proceed:** **Yes** (blocker count: **0**).

---

### Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Own avatar cannot be selected without consent | **PASS** | UI: `own_avatar` hard-disabled when `!consent.active`; toggle no-ops (`PreferencesEditor.tsx` 151–179, 361–385). Server: `upsertVisualPreferences` rejects `own_avatar` ∈ allowlist when `!(await hasActiveAvatarConsent(user.id))` → `OWN_AVATAR_CONSENT_REQUIRED`, no write (`upsert-visual-preferences.ts` 104–108; `upsert-visual-preferences.test.ts`). Probe fail-closed (`has-active-avatar-consent.ts` 46–88). |
| Consent version string stored for audit | **PASS** | Grant INSERT stores `consent_version: CURRENT_AVATAR_CONSENT_VERSION` (`AVATAR_CONSENT_DISCLOSURE_V1`) (`grant-avatar-consent.ts` 83–92; `avatar-consent-version.ts` 8–14). Success DTO returns version (`grant-avatar-consent.ts` 112–117). Loader returns `consentVersion` when active (`get-avatar-consent-for-client.ts` 142–148). UI shows version label (`AvatarConsentSection.tsx` 281–284; i18n `preferences.consent.versionLabel`). Test: grant stores V1 (`avatar-consent.test.ts` 347–408). |
| Revoking consent blocks new own-avatar generations | **PASS** | Revoke sets `revoked_at` only → probe false immediately (`revoke-avatar-consent.ts` 68–75; `has-active-avatar-consent.ts` 62–85). Preferencias upsert still rejects `own_avatar` without active consent. Job stub `assertActiveAvatarConsentForJobs` fail-closed (`assert-active-avatar-consent-for-jobs.ts` 13–36; tests 699–735). UI disables Avatar propio after refresh. |
| **[SEC]** Consent records are append-only: revocation sets `revoked_at` on the existing row; consent rows are never updated in place or deleted, preserving a full audit trail | **PASS** | Grant/re-consent = INSERT only (`grant-avatar-consent.ts` 85–94). Revoke UPDATE payload keys = `["revoked_at"]` only (`revoke-avatar-consent.ts` 68–75; test 599–602). No DELETE in grant/revoke modules; migration has no `DELETE FROM` / no policies that delete (`20260829220000_neuramark_avatar_consents.sql`; test 805–806). Partial unique one active row (`…_client_id_active_uidx`). |
| **[SEC]** The exact disclosure text version shown at consent time (`consent_version`) is stored with the record; changing the disclosure text requires re-consent under a new version | **PASS** | Server constant `AVATAR_CONSENT_DISCLOSURE_V1` / `CURRENT_AVATAR_CONSENT_VERSION` (`avatar-consent-version.ts`). Client may echo only; mismatch → `CONSENT_VERSION_MISMATCH`, no INSERT (`grant-avatar-consent.ts` 59–66; test 411–440). Active = non-revoked **and** version === current (`has-active-avatar-consent.ts` 85; version-mismatch → false, test 302–325). Loader `reason: "version_mismatch"` (`get-avatar-consent-for-client.ts` 119–127). Disclosure i18n under `disclosureV1` EN/ES. |
| **[SEC]** Consent status is re-checked server-side at video-job creation time (not only at mode selection), so a revocation between selection and generation still blocks the job | **PASS** (stub per CONTRACT) | Exported `assertActiveAvatarConsentForJobs(clientId)` calls live `hasActiveAvatarConsent`; never defaults true; Preferencias allowlist not authority (`assert-active-avatar-consent-for-jobs.ts` 6–36; JSDoc mandatory US-8/US-10 call site). Unit-tested fail-closed + ok paths (`avatar-consent.test.ts` 699–735). No job table writes in this story (CONTRACT). |
| **[SEC]** Consent can only be granted via an explicit affirmative action recorded with server timestamp; no endpoint or Server Action can set consent as a side effect of another operation | **PASS** | Only writer: `grantAvatarConsent` with `{ affirmed: true, consentVersion }` Zod `.strict()` (`grant-avatar-consent.ts`; `lib/contracts/avatar-consent.ts` 41–46). Missing/false affirmed → `AFFIRMATION_REQUIRED`, no write (test 443–472). Server stamps `consented_at` (`grant-avatar-consent.ts` 83–89). Preferencias upsert never touches `neuramark_avatar_consents` (test 648–696). Ficha viva PATCH still rejects consent/Preferencias keys (US-2.2 regression in Preferencias suite). |
| **[SEC]** Revocation takes effect immediately for new jobs and cancels queued (not yet submitted) own-avatar jobs; in-flight provider jobs are flagged for operator review | **PASS WITH NOTE** (stubs per CONTRACT/SECURITY) | Immediate: probe false after revoke; Preferencias gate live. Cancel: `revokeAvatarConsent` **must** `await cancelQueuedOwnAvatarJobs(user.id)` after successful revoke (lines 86–87; test 535–611 invoke with mock). Stub is idempotent no-op when jobs absent (`cancel-queued-own-avatar-jobs.ts` 11–19; test 738–752). In-flight Operator flag = documented `TODO (US-8 / US-10)` in stub JSDoc (lines 8–9; test 809–816). **Not** full provider cancel / Operator UI — CONTRACT out of scope; soft note only. |

---

### SECURITY.md `[SEC]` (added) — binding floors

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Table `neuramark_avatar_consents` + RLS deny-by-default + service-role Node | **PASS** | Migration `20260829220000_neuramark_avatar_consents.sql` 4–28: columns, FK, CHECKs, RLS ENABLE, zero `CREATE POLICY`. Access via `createServerSupabaseClient()` only. |
| Partial unique `(client_id) WHERE revoked_at IS NULL` | **PASS** | `neuramark_avatar_consents_client_id_active_uidx` (migration 18–20). Concurrent grant → `23505` → `ALREADY_ACTIVE` (`grant-avatar-consent.ts` 97–99). |
| Append-only mutation rules + tests | **PASS** | See append-only AC above; revoke update-keys test; migration no DELETE. |
| Active definition fail-closed + version match | **PASS** | `has-active-avatar-consent.ts` semantics table implemented; empty id / missing table / error / mismatch → false. |
| Multi-row-safe probe (US-3.1 QA Medium carry-forward) | **PASS** | Query: `.is("revoked_at", null).order("consented_at", { ascending: false }).limit(1).maybeSingle()` then version match (`has-active-avatar-consent.ts` 59–85). Tests assert `is` / `order` / `limit(1)` (`avatar-consent.test.ts` 235–280). |
| Grant Action: `requireActive`, affirmed + version echo, no tenant id | **PASS** | `requireActive("handler")` first; forbidden-key strip; Zod strict; IDOR `client_id` → `FORBIDDEN_FIELDS` (test 475–501). |
| Revoke Action: `revoked_at` only; cancel stub; no Preferencias rewrite | **PASS** | See revoke tests; throws if Preferencias table touched in mock. |
| Preferencias upsert must not grant/revoke; `own_avatar` requires consent | **PASS** | Continuity tests + upsert gate. |
| Preferencias allowlist ≠ consent authority; optional stale warning | **PASS** | Soft warn when `!active && allowlistHasOwnAvatar` (`AvatarConsentSection.tsx` 147–148, 324–329; EN/ES `staleAllowlistWarning`). No silent strip on revoke. |
| Job assert stub exported + unit-tested | **PASS** | `assert-active-avatar-consent-for-jobs.ts`. |
| Loader arity 0; minimal DTO | **PASS** | `getAvatarConsentForClient()` arity 0; DTO active/inactive shapes (`get-avatar-consent-for-client.ts`; contracts schemas). |
| Surfaces: Preferencias page; Server Actions only; gated; `no-store` | **PASS** | `/settings/preferences` embed (`page.tsx`); no `app/api/avatar-consent` (test 780–787); `isPublicPath` false; `dynamic = "force-dynamic"`; `next.config.ts` `/settings/:path*` no-store. |
| XSS bar: no `dangerouslySetInnerHTML` | **PASS** | Disclosure as React `<p>` text nodes (`AvatarConsentSection.tsx` 298–301). No `dangerouslySetInnerHTML` under `components/preferences/`. |
| No silent regenerate / job enqueue from grant/revoke | **PASS** | Grant/revoke only ledger + stub + `revalidatePath`; static assert no generation modules (test 818–832); grant fromTables = consent only. |
| No Operator cross-tenant consent edit | **PASS** | Session `user.id` only; no `as_client_id` / `requireOperator` branch. |
| Do not log full disclosure dumps | **PASS** | Logs use codes only (`[consent] grant insert failed`, `{ code }`). |
| Do not create `media_assets` / full job-cancel UI | **PASS** | Migration asserts no `media_assets` (test 805); no Operator cancel chrome. |

**Inherited (spot-check):** US-2.2 PATCH rejects Preferencias/consent keys; US-2.3 agents omit consent ledger internals (`get-business-profile-for-agents.ts` comment + allowlist-only summary); no `@supabase` in Client Components under preferences.

---

### Convention Compliance

| Rule | Status | Evidence |
|------|--------|----------|
| EN + ES user-facing copy | **PASS** | `messages/en.json` / `es.json` `preferences.consent.*` (title, disclosureV1, grant/revoke, errors, toasts). ES title **Consentimiento de avatar**; EN **Avatar consent**. Canonical Avatar propio / Consentimiento used; no “consent ledger” product headline. |
| Server Components default; minimal `"use client"` | **PASS WITH NOTE** | Page RSC loads Preferencias + consent (`page.tsx`). Client islands: `PreferencesEditor`, `AvatarConsentSection` (interactivity). `PreferencesView.tsx` remains `"use client"` without hooks (same soft note as US-3.1). |
| PrimeReact-first | **PASS** | Checkbox, Button, Message, Toast, ConfirmDialog (`AvatarConsentSection.tsx`). |
| Loading / empty / error / pending | **PASS WITH NOTE** | Grant/revoke `pending`/`loading`/`disabled`; error banner; inactive reason messages; success toast + `router.refresh()`. No dedicated `loading.tsx` — SSR + force-dynamic acceptable (same as US-3.1). |
| Auth / identity via `getCurrentUser()` / `requireActive` | **PASS** | Loader `requireActive("page")`; mutations `requireActive("handler")`. No browser Supabase. |
| Endpoints map to concrete FE consumers | **PASS** | Preferencias Consentimiento section → `grantAvatarConsent` / `revokeAvatarConsent` / `getAvatarConsentForClient`. |
| CONTRACT FE signed freeze followed | **PASS** | Placement on Preferencias; grant body `{ affirmed, consentVersion }`; revoke arity 0; await + toast; no silent Preferencias strip; disclosure text nodes. |
| Dependency US-3.1 satisfied | **PASS** | Preferencias surface + upsert gate reused; probe hardened in place. |

---

### Gaps (what blocks PASS)

**None.** Blocker count: **0**.

---

### Soft notes (do not block QA)

1. **Video-job re-check / cancel / in-flight Operator flag** — stubs only (`assertActiveAvatarConsentForJobs`, `cancelQueuedOwnAvatarJobs` + TODO). Full enforcement is US-8.x / US-10.x per CONTRACT/SECURITY — accepted for CLOSE of US-3.2.
2. **Live E2E** — grant → Preferencias enable → revoke → upsert reject against real Supabase not exercised in this gate; unit mocks cover paths.
3. **`PreferencesView` `"use client"`** — could be RSC wrapper; non-blocking polish.
4. **No dedicated `loading.tsx`** for settings — soft; same pattern as Preferencias US-3.1.

---

### Scope Creep

**None observed.** No `media_assets`, no dedicated `/settings/avatar-consent`, no job cancel UI, no Preferencias allowlist schema reopen, no Ficha viva consent writes, no public consent Route Handler, no browser Supabase.

---

### Recommended Next Actions

| Action | Owner |
|--------|--------|
| Check off USER_STORIES.md § US-3.2 AC after PO review of this report | **product-owner** |
| Manual QA: grant → enable Avatar propio → save Preferencias → revoke → confirm disable + upsert reject + stale allowlist warning | **qa-engineer** |
| Wire `assertActiveAvatarConsentForJobs` at real job create; implement real `cancelQueuedOwnAvatarJobs` + Operator in-flight flag | **nextjs-backend** (US-8.x / US-10.x) |
| Optional: demote `PreferencesView` to RSC | **nextjs-frontend** (polish) |

**QA can proceed?** **Yes.**
