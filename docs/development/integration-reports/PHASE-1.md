# Integration Report — PLAN Fase 1

**Date:** 2026-08-29  
**Branch reviewed:** `main` (all Fase 1 stories CLOSED)  
**Checker:** integration-checker  
**Flow scope:** S4.1 partial (onboarding → entrevista → ficha → preferencias; **no IG** — expected)

---

## Verdict: CONNECTED

Fase 1 modules hand off correctly through shared contracts, server-only helpers, and `requireActive()` gates. All 15 closed stories report **PASS WITH NOTES** with **0 validation blockers**. Residual gaps are expected partial-MVP items (IG, agent jobs, Playbook/Trend) or non-blocking quality notes (no live browser/DB E2E). **Phase 2 may start.**

| Metric | Value |
|--------|-------|
| **Verdict** | CONNECTED |
| **Blocking gaps** | 0 |
| **Non-blocking / expected gaps** | 5 |
| **Phase 2 ready** | Yes |

---

## Deliverable claimed vs observed

| PLAN Fase 1 deliverable | Observed |
|-------------------------|----------|
| Onboarding end-to-end until visual preferences + assets uploaded | **Yes (code-complete).** Auth → interview → submit → profile read/edit → preferencias + consent + reference assets are wired with FE consumers for every Server Action / route. |
| Product blocked if `active=false` | **Yes.** `requireActive("page")` on `app/(app)/layout.tsx`; `requireActive("handler")` on all product mutations; inactive → `/pending` (pages) or 403 (handlers). Login also lands inactive users on `/pending`. |
| S4.1 partial (no IG yet) | **As expected.** No Instagram OAuth, publish, or onboarding IG step exists. |

---

## Flow traces

### Happy path — auth → preferencias + assets

| Step | Expected | Found | Owner |
|------|----------|-------|-------|
| 1. Signup | Open signup; creates `auth.users` + `neuramark_clients` (`active=false`); generic success | `lib/auth/actions/sign-up.ts` → `app/(auth)/signup/page.tsx` | nextjs-backend |
| 2. Email confirm | Callback verifies OTP/code; **no** product session | `app/auth/callback/route.ts` → 302 `/login?confirmed=1`; cookies expired | nextjs-backend |
| 3. Login | Active → `/dashboard`; inactive → `/pending` | `lib/auth/actions/log-in.ts`; `PendingActivationView` | nextjs-backend / nextjs-frontend |
| 4. Route guard | All product routes require session + `active=true` | `middleware.ts` (cookie presence) + `lib/auth/require-user.ts` (`requireActive`) on `(app)/*` | nextjs-backend |
| 5. Dashboard entry | Cards for interview, profile, preferences | `app/(app)/dashboard/page.tsx`; `/` redirects to `/dashboard` | nextjs-frontend |
| 6. Interview draft | Persist seven-step answers as `draft` | `lib/interview/actions/persist-interview-draft.ts` → `neuramark_interview_sessions` | nextjs-backend |
| 7. Interview submit | Completeness from DB → upsert ficha → `completed` → `/profile` | `lib/interview/actions/submit-interview.ts` → RPC `neuramark_complete_interview_with_profile` / fail-closed fallback | nextjs-backend |
| 8. Profile read | Full seven-key Ficha viva or missing CTA | `lib/profile/get-business-profile-for-client.ts` → `app/(app)/profile/page.tsx` | nextjs-backend / nextjs-frontend |
| 9. Profile edit | PATCH allowlist; version bump + `updated_by` | `lib/profile/update-business-profile.ts` → `neuramark_business_profiles` | nextjs-backend |
| 10. Agents profile | Trusted `clientId` → fields + version + `visualModeSummary` | `lib/profile/get-business-profile-for-agents.ts` (MUST-import for future agents) | content-agents-engineer |
| 11. Preferencias load | Allowlist, faceless style, consent probe, rules | `lib/visual-preferences/get-visual-preferences-for-client.ts` → `/settings/preferences` | nextjs-backend / nextjs-frontend |
| 12. Preferencias save | Server-derived `rules`; consent gate for `own_avatar` | `lib/visual-preferences/upsert-visual-preferences.ts` → `neuramark_visual_preferences` | nextjs-backend |
| 13. Consent grant/revoke | Append-only ledger; version-aware active probe | `grant-avatar-consent.ts` / `revoke-avatar-consent.ts` → `neuramark_avatar_consents` | nextjs-backend |
| 14. Reference assets | Upload/list/delete/serve with consent gate | `upload-avatar-reference-asset.ts`, `GET app/api/media/assets/[assetId]/route.ts` → `neuramark_media_assets` | media-pipeline-engineer / nextjs-backend |
| 15. Generic disclosure | `must_disclose_not_owner` server-owned; agents + QA stub | `lib/visual-preferences/helpers.ts`; `lib/qa/checks/generic-avatar-not-owner.ts`; DTO in agents helper | content-agents-engineer |

### Handoffs table (contracts / boundaries)

| From → To | Contract / entrypoint | Schema alignment | Status |
|-----------|----------------------|------------------|--------|
| Auth → all product modules | `getCurrentUser()` / `requireActive()` | `lib/contracts/auth.ts`; `CurrentUser` incl. `active`, `role` | OK |
| Interview → Profile | `submitInterview` success `{ redirectTo: "/profile", profile, interview }` | `lib/contracts/interview.ts` ↔ `interviewAnswersCompleteSchema` in profile | OK |
| Profile (client) ↔ Profile (agents) | Separate DTOs; shared seven-key `fields` | `lib/contracts/profile.ts` — `BusinessProfileView` vs `BusinessProfileForAgentsView` | OK |
| Profile edit → Agents | `version` bump on PATCH | Agents SELECT includes `version`; edit writes `version+1` | OK |
| Preferencias → Agents | `visualModeSummary: { allowedModes, mustDiscloseNotOwner }` | `lib/contracts/visual-preferences.ts` ↔ `profile.ts` agent schema | OK |
| Consent → Preferencias upsert | `hasActiveAvatarConsent(userId)` fail-closed | `OWN_AVATAR_CONSENT_REQUIRED` in upsert + contract | OK |
| Consent → Media upload | Same probe in `validateAndPrepareMediaUpload` | `lib/contracts/media-assets.ts` error codes | OK |
| Preferencias rules → QA stub | `mustDiscloseNotOwner` from agents helper only | `lib/contracts/qa.ts` + `generic-avatar-not-owner.ts` | OK (stub; US-10.1 deferred) |
| Media → serve route | DTO `previewUrl: /api/media/assets/{uuid}` | Ownership check in route handler | OK |

### SPEC §4 error paths — Fase 1 scope

S4.Q1 paths (generation fail, QA legal block, IG publish fail, ciclo parcial) are **out of Fase 1 scope** — no jobs, QA gate, or IG modules exist yet. **Correct deferral.**

In-scope error paths verified in code + unit tests:

| Error path | Expected behavior | Found |
|------------|-------------------|-------|
| Unauthenticated product access | Redirect login / 401 envelope | `requireActive` + middleware |
| Inactive (`active=false`) | `/pending` or 403; no mutations | All product Server Actions call `requireActive("handler")` first |
| Incomplete interview submit | `VALIDATION_ERROR` + fields; no profile write | `validateInterviewCompleteness` before upsert |
| Completed session draft write | `CONFLICT`; no overwrite | `decideDraftWrite` / UPDATE `status='draft'` |
| Own avatar without consent | `OWN_AVATAR_CONSENT_REQUIRED` | Upsert + upload paths |
| Upload oversize / bad MIME | Recoverable error envelope | `lib/media/upload-validation.ts` |
| Profile PATCH with forbidden keys | `FORBIDDEN_FIELDS` / `VALIDATION_ERROR` | `update-helpers.ts` strip list |
| Load failures | Soft `loadFailed` / empty states; no oracle | Profile, prefs, assets loaders |

---

## VALIDATION.md sample (key stories)

| Story | Verdict | Integration-relevant notes |
|-------|---------|----------------------------|
| US-14.1 Signup | PASS WITH NOTES | Creates client row `active=false`; no spend paths at signup |
| US-14.2 Login | PASS WITH NOTES | Active/inactive landing; Path A callback integrated |
| US-14.5 Session guards | PASS WITH NOTES | `requireActive` shipped; per-request fresh `active`/`role` |
| US-1.3 Submit interview | PASS WITH NOTES | Atomic profile+completed; idempotent submit; redirects `/profile` |
| US-2.3 Agents profile | PASS WITH NOTES | Single server export; soft “used by agents” until US-4.x |
| US-3.1 Preferencias | PASS WITH NOTES | Allowlist persisted; no silent regenerate |
| US-3.2 Consent | PASS WITH NOTES | Append-only; upsert never writes ledger |
| US-3.3 Avatar assets | PASS WITH NOTES | Consent-gated upload; ownership serve route |
| US-3.4 Generic rules | PASS WITH NOTES | `mustDiscloseNotOwner` in agents DTO; QA stub blocking |

**Cross-cutting validation note:** No sampled story ran live browser + Supabase E2E this gate. Unit coverage is strong (121 tests pass across auth, interview, profile/agents, visual-preferences, media suites).

---

## Gaps (blocks next phase)

**None.**

---

## Non-blocking gaps / expected partial MVP

| # | Gap | Severity | Owner | Notes |
|---|-----|----------|-------|-------|
| 1 | **No live E2E onboarding walk** | Low | QA / nextjs-frontend | All validators PASS on static + unit evidence only. Recommend one manual E2E before first paid LLM job (Fase 3). |
| 2 | **S4.1 tail: conectar IG** | Expected | integrations-engineer | PLAN Fase 6 / Fase 7 onboarding checklist. Not a Fase 1 defect. |
| 3 | **Agent/job call sites absent** | Expected | content-agents-engineer | `getBusinessProfileForAgents`, `assertActiveAvatarConsentForJobs`, `hasOwnAvatarReferenceAssets` exported with MUST-import comments; no LLM/video jobs yet. |
| 4 | **Playbook + Trend modules not started** | Expected | content-agents-engineer | PLAN Fase 2 deliverable. `TASKS.md` Fase 2 checklist exists; no `plan/stories/US-*` folders yet. |
| 5 | **`TASKS.md` Fase 1 checkboxes unchecked** | Doc drift | product-owner | Stories CLOSED but root `TASKS.md` still shows `[ ]` for Fase 1 — tracking only, not a code gap. |

---

## Recommended fixes (by agent)

| Agent | Action |
|-------|--------|
| **product-owner** | Author user stories for Content Playbook + Trend Intelligence (PLAN Fase 2) if story workflow is required; optionally sync `TASKS.md` Fase 1 to `[x]`. |
| **QA / nextjs-frontend** | Run one authenticated E2E: signup → confirm → activate → interview → submit → profile edit → preferencias + consent + asset upload. |
| **content-agents-engineer** | Begin Fase 2 with Playbook schema + Operator CRUD + `getPlaybookForAgents()` per `TASKS.md` § Fase 2. |
| **integrations-engineer** | No action until Fase 6 (IG). |

---

## Recommended next phase entry

**First Fase 2 work item (per `PLAN.md` + `TASKS.md`):**

> **Content Playbook — DB `neuramark_content_playbooks`, Zod schema, Operator CRUD UI, seed formatos iniciales, server contract `getPlaybookForAgents()`**

Follow with **Trend Intelligence manual** (snapshot + seed `cold-open-mejor-toma`) before Fase 3 **US-4.1** (Content Strategy Agent), which depends on playbook + trend inputs per SPEC §3 M5.

**Note:** `USER_STORIES.md` labels “Phase 2” as US-4.1 (Strategy). That is **Fase 3** in `PLAN.md`. Phase 2 Playbook/Trend stories are not yet numbered in `USER_STORIES.md` — PO should add them or explicitly adopt `TASKS.md` items as stories before implementation.

---

## Automated check summary

```
npx tsx --test \
  lib/auth/session-guards.test.ts \
  lib/interview/interview.test.ts \
  lib/profile/get-business-profile-for-agents.test.ts \
  lib/visual-preferences/visual-preferences.test.ts \
  lib/media/media-assets.test.ts
→ 121/121 pass
```

---

## Sign-off

| Question | Answer |
|----------|--------|
| Can Phase 2 start? | **Yes** |
| Blocking gap count | **0** |
| Fase 1 onboarding chain connected? | **Yes** |
| `active=false` spend block in place? | **Yes** (`requireActive` on all product surfaces) |
