# Validation Report — US-1.3

**Story:** Submit interview for profile generation  
**Validator:** requirements-validator  
**Date:** 2026-08-29  
**Branch:** `feature/US-1.3-submit-interview-profile`  
**Commits reviewed:** `6f55df4` (FE), `4b5de0c` (BE)  
**Contract:** Frozen, Reviewed by FE (2026-08-29)  
**SPEC-REVIEW:** ALIGNED  
**SECURITY:** APPROVE WITH CONDITIONS (binding freeze encoded in CONTRACT)  
**Tests re-run:** `npx tsx --test lib/interview/interview.test.ts` → **39/39 pass**  
**Live browser / DB E2E / migration apply:** **Not run** this gate (code + unit evidence only)

---

### Verdict: PASS WITH NOTES

All five USER_STORIES acceptance criteria and the SECURITY.md `[SEC]` floors for US-1.3 (story + added + inherited re-assertions relevant to submit/stub) are met in the implementation. Residual notes: no live browser/session E2E; migration `20260829120000_neuramark_business_profiles.sql` was not applied against a live Supabase in this gate; atomic RPC + unique-violation soft success are proven by SQL + handler wiring + unit helpers, not a mocked end-to-end Server Action suite against Postgres.

Do **not** treat missing US-2.1 full Ficha viva field grid as a failure (stub/success route is in scope).

On PASS, the product-owner — not this validator — checks the story’s acceptance criteria in `plan/USER_STORIES.md`.

---

### Acceptance Criteria

Criteria 1–5 are verbatim from `plan/USER_STORIES.md` § US-1.3. Criteria below that are SECURITY.md `[SEC]` items (inherited re-asserted for submit/stub surfaces + story `[SEC]` + **(added)**).

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Submitting a complete interview creates exactly one business profile (or updates draft profile) | **PASS** (code; live DB not run) | Completeness over **stored** answers → map → upsert (`submit-interview.ts` 200–213; `completeness.ts` 17–35; `upsert-from-interview.ts` 23–55). Atomic path: RPC `neuramark_complete_interview_with_profile` INSERT…ON CONFLICT `(client_id)` DO UPDATE then `status = 'completed'` (`20260829120000_neuramark_business_profiles.sql` 70–96). Uniques: `UNIQUE (client_id)` + `UNIQUE (source_interview_id)` (`migration` 22–28). Create-on-submit; update if row exists. Fail-closed two-step fallback is profile-first then mark (`submit-interview.ts` 114–138; `upsert-from-interview.ts` 61–148). |
| Incomplete submit returns 400 with field-level errors | **PASS** | `validateInterviewCompleteness` → `interviewValidationError(fieldErrors)` and **return before** profile/status writes (`submit-interview.ts` 200–203; `completeness.ts` 20–27; `errors.ts` 21–27). Unit: missing `zone` → `required`; empty `services.items` → `too_small` (`interview.test.ts` 449–470). Envelope code `VALIDATION_ERROR` (logical 400 per CONTRACT Server Action semantics). FE surfaces fields via `handleSubmitFailure` / `applyValidationFields` (`InterviewWizard.tsx` 313–319, 261–284). |
| Event is idempotent on double-submit | **PASS** (code; race E2E not run) | Already `completed` → soft success `{ alreadyCompleted: true }` without reopen (`submit-interview.ts` 186–198; `handleAlreadyCompleted` 80–112; `decideSubmitSessionPath` `merge-answers.ts` 114–119). Unique violation on upsert → re-SELECT soft success (`upsert-from-interview.ts` 38–43, 81–85). Success shape fixture (`interview.test.ts` 568–580). DB uniques prevent a second row (`migration` 22–28). |
| **[SEC]** Completeness is verified server-side at submit time; a client cannot mark a session `completed` by flipping a status field in the request | **PASS** | Completeness Zod on DB-loaded answers only (`submit-interview.ts` 171–180, 200–203; `completeness.ts` 13–15). Client `status` / privilege keys → `FORBIDDEN_FIELDS` before parse (`submit-interview.ts` 154–156; `merge-answers.ts` 15–21, 41–47; `interview.test.ts` 475–481). Client `answers` stripped (not SoT) (`merge-answers.ts` 35–36, 69–88; `interview.test.ts` 508–518). Only in-app writer of `completed`: RPC/mark after profile success (`migration` 90–96; `mayMarkInterviewCompleted` `merge-answers.ts` 95–99; `submit-interview.ts` 126–128). |
| **[SEC]** Idempotency is enforced with a DB-level constraint (e.g. unique `business_profiles.source_interview_id`), not only application logic | **PASS** | `CREATE UNIQUE INDEX neuramark_business_profiles_source_interview_id_idx ON … (source_interview_id)` (`migration` 26–28). Also `UNIQUE (client_id)` (`22–24`). App soft-success on unique violation is defense-in-depth, not the sole idempotency mechanism. |
| **[SEC] (inherited)** All interview answers are re-validated server-side against a typed schema (Zod); client-side validation is presentation only | **PASS** | Submit completeness: `interviewAnswersCompleteSchema` (`lib/contracts/interview.ts` 163–173). Persist-then-submit still uses US-1.1 persist Zod (`InterviewWizard.tsx` 402–405). Client `validateCurrentStep` / `presentationComplete` are presentation only (`InterviewWizard.tsx` 122+, 392–396, 562). |
| **[SEC] (inherited)** Interview sessions / profiles are created and loaded only for the client resolved via server-side `getCurrentUser()`; no `client_id` from body/query | **PASS** | Submit: `requireActive("handler")` then SELECT/upsert by `user.id` (`submit-interview.ts` 146–147, 171; `upsert-from-interview.ts` 73, 107, 137). Strip identity keys including `source_interview_id` / `profile_id` (`merge-answers.ts` 23–33, 69–88). Stub: `getProfileStubSummary` arity 0, `.eq("client_id", user.id)` (`get-profile-stub-summary.ts` 15–28; `interview.test.ts` 642+). |
| **[SEC] (inherited)** Total `answers` JSON payload rejected above 64 KiB with 413 / `PAYLOAD_TOO_LARGE` (persist-then-submit) | **PASS** | Unchanged on `persistInterviewDraft` (US-1.1/1.2). Submit does not accept answers as SoT. |
| **[SEC] (inherited)** Free-text answers / profile fields stored as data and rendered escaped | **PASS** | Stub/success/completed views use React text / PrimeReact `text` (`ProfileStubView.tsx` 36–42; wizard banners). No `dangerouslySetInnerHTML` on interview/profile surfaces. Stub omits raw `fields` dump (`get-profile-stub-summary.ts` 25–44; `profile/page.tsx` 40–50). |
| **[SEC] (inherited)** Read-only enforcement for `completed` sessions on draft mutation paths unchanged | **PASS** | `decideDraftWrite({ status: "completed" })` → conflict (`interview.test.ts` 592–595). Persist predicate unchanged (US-1.2). |
| **[SEC] (added)** Completeness Zod over DB answers for `getCurrentUser().id` only; incomplete → 400 fields; no profile write; leave `draft` | **PASS** | See incomplete AC + early return before upsert (`submit-interview.ts` 200–203). |
| **[SEC] (added)** `status` never read from client; reject/strip identity/privilege/`source_interview_id` | **PASS** | Reject set + strip set (`merge-answers.ts` 15–36); wired in submit (`submit-interview.ts` 154–164). |
| **[SEC] (added)** Fail-closed ordering: profile upsert before/with `completed`; prefer single transaction | **PASS** | Preferred: single RPC transaction (`migration` 46–103; `completeInterviewWithProfile`). Fallback: profile then `mayMarkInterviewCompleted(true)` then mark (`submit-interview.ts` 114–138). Forbidden reverse order not present. |
| **[SEC] (added)** `UNIQUE (source_interview_id)` and `UNIQUE (client_id)`; double-submit → soft success, one row | **PASS** | Migration indexes + soft success paths above. |
| **[SEC] (added)** Profile upsert sets `client_id` / `source_interview_id` from server user + own session PK only; fields 1:1 interview keys | **PASS** | `upsert-from-interview.ts` 70–75, 101–103; RPC params from server (`submit-interview.ts` 209–212); `mapAnswersToProfileFields` (`completeness.ts` 30–35). |
| **[SEC] (added)** Submit (and profile mutation) call `requireActive("handler")`; unauth 401 / inactive 403; no side effects | **PASS** | First call in `submitInterviewInner` (`submit-interview.ts` 145–152). Stub helper `requireActive("page")` (`get-profile-stub-summary.ts` 16). |
| **[SEC] (added)** Stub `/profile` under `(app)`, not on `isPublicPath`, `requireActive`, `no-store`; no id query params | **PASS** | `app/(app)/profile/page.tsx`; `isPublicPath("/profile") === false` (`session-guards.test.ts` 108); `next.config.ts` 37–42; helper has no id params. |
| **[SEC] (added)** Stub / success payloads minimal until US-2.1 | **PASS** | Success: `{ exists, version }` only (`buildSubmitSuccess` `merge-answers.ts` 128–144). Stub summary same (`get-profile-stub-summary.ts` 35–44). No fields dump. |
| **[SEC] (added)** Concurrent double-submit must not leave `completed` without profile nor two profiles | **PASS** (design + unit; live race not run) | Atomic RPC ordering + DB uniques + unique-violation recovery. Unit covers soft-success shape and fail-closed gate (`interview.test.ts` 536–580). |
| **[SEC] (added)** RLS enabled on `neuramark_business_profiles`, zero policies; parameterized writes; service-role Node only | **PASS** | `ENABLE ROW LEVEL SECURITY` + zero policies comment (`migration` 35–37). Modules `import "server-only"` / `"use server"`. RPC EXECUTE granted to `service_role` only (`migration` 105–108). |
| **[SEC] (added)** Re-submit when already `completed`: soft success; no reopen; no incompleteness 400 blocking idempotent success when profile exists | **PASS** | `handleAlreadyCompleted` returns soft success if profile exists without completeness failure path (`submit-interview.ts` 85–90). |
| **[SEC] (added)** Do not log full `answers` or profile `fields` free text | **PASS** | Logs use `code` / static strings only (`submit-interview.ts` 69, 167–168, 250; `upsert-from-interview.ts` 45, 89–91). |
| **[SEC] (added)** `revalidatePath` for `/interview`, `/dashboard`, `/profile` on successful submit | **PASS** | `submit-interview.ts` 193–195, 227–228. |
| **[SEC] (added)** XSS bar: stub/success as React text / PrimeReact children only | **PASS** | `ProfileStubView.tsx`; no `dangerouslySetInnerHTML`. |

---

### Convention Compliance

| Convention | Status | Evidence |
|------------|--------|----------|
| EN + ES user-facing copy | **PASS** | `interview.submit*`, `submitSuccess`, `viewProfile`, `errors.notFound`, `profile.stub.*`, dashboard `completedCta` in `messages/en.json` + `es.json`. Canonical Living profile / Ficha viva; Initial interview / Entrevista inicial. |
| Server Components by default; `"use client"` justified | **PASS** | `/profile` page RSC; `ProfileStubView` / `InterviewWizard` client for PrimeReact interactivity. |
| PrimeReact-first | **PASS** | Button, Message on stub + wizard submit UX. |
| Loading / empty / error / pending | **PASS** | Submit `pendingMode === "submit"`; validation/internal banners; stub empty CTA → `/interview` when no profile (`ProfileStubView.tsx` 56–59). |
| Auth: Server Actions + httpOnly cookies; identity via `requireActive` / `getCurrentUser` | **PASS** | `submitInterview` `"use server"`; profile helpers `server-only`; no browser Supabase on these surfaces. |
| Backend surfaces have FE consumers | **PASS** | Wizard Submit → `submitInterview`; success → `/profile`; stub RSC → `getProfileStubSummary`; dashboard completed → `/profile`. |
| Contract shapes honored | **PASS** | Empty-body submit; success `{ ok, alreadyCompleted, redirectTo: "/profile", profile, interview }`; strip answers; FORBIDDEN_FIELDS on status; CONFLICT + `interview.errors.notFound`. |
| Dependencies US-1.1 / US-1.2 | **PASS** | Both CLOSED; this story extends rather than forking draft persist / wizard. |
| Terminology (CONTEXT) | **PASS** (US-1.3 surfaces) | Stub/submit/dashboard completed CTA use Living profile / Ficha viva. Avoids Business Profile / perfil de negocio in new copy. |
| `neuramark_` prefix | **PASS** | Table, indexes, trigger, RPC in migration. |

---

### Gaps (what blocks PASS)

**None that block PASS.** Notes only:

1. **Live E2E not run** — complete submit → one profile + `completed`; incomplete → still `draft` + zero profile; double-submit race; forbidden `status` body were not exercised against a real browser/DB this gate.
2. **Migration apply not verified** — `supabase/migrations/20260829120000_neuramark_business_profiles.sql` is present and matches CONTRACT; application to a live Supabase project was not confirmed here.
3. **Integration coverage** — unit tests cover completeness Zod, strip/reject, soft-success shapes, fail-closed gate, and action arity; there is no mocked Supabase end-to-end of `submitInterviewInner` through RPC.

---

### Scope Creep

**None material.** Implementation stays within CONTRACT: `submitInterview`, completeness helper, `neuramark_business_profiles` + RPC, stub `/profile`, dashboard completed → `/profile`, EN/ES keys. No full Ficha viva field grid (US-2.1), no PATCH (US-2.2), no `getBusinessProfileForAgents` (US-2.3), no LLM profile builder, no Cliente reopen, no auth allowlist expansion, no public Route Handler.

---

### Recommended Next Actions (and which agent should take them)

1. **product-owner** — At CLOSE, check US-1.3 AC boxes in `plan/USER_STORIES.md` (validator does not).
2. **qa-engineer** — Run QA gate; prefer short live path: complete interview → Submit → stub `/profile` → confirm one `neuramark_business_profiles` row + session `completed`; incomplete submit → 400 fields + still `draft`; double Submit → soft success / one row; POST body with `status: "completed"` → FORBIDDEN_FIELDS.
3. **orchestrator** — Proceed to QA; no BUILD re-delegation required for AC gaps. Ensure migration is applied in the target environment before live QA.

---

### Runtime note

Validator did **not** start the Next.js app or apply/hit Supabase. ACs are satisfied by static code review + unit tests (39/39); live confirmation is deferred to QA.
