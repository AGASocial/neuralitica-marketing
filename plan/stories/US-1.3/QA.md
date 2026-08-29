# QA Report — US-1.3

**Story:** Submit interview for profile generation  
**Reviewer:** qa-engineer  
**Date:** 2026-08-29  
**Branch:** `feature/US-1.3-submit-interview-profile`  
**Commits:** `6f55df4` (FE), `4b5de0c` (BE), `c3da664` (sprint)  
**VALIDATE:** PASS WITH NOTES (`plan/stories/US-1.3/VALIDATION.md`)  
**Standard:** Enterprise-grade (production-safe for paying customers)  
**Sources:** `plan/USER_STORIES.md` § US-1.3, `plan/stories/US-1.3/{SECURITY,CONTRACT,TASKS,VALIDATION}.md`

Auth is real (US-14.5). Sanctioned `AUTH_DEV_FALLBACK` local user is **not** a finding. Submit + profile upsert are **product writes**.

### Verdict: APPROVE WITH NOTES

No Critical. No High. **1 Medium** (BE hardening — non-blocking for CLOSE). **2 Low** (test gap + FE soft-success UX). **No fix loop / no FE–BE re-delegation required.**

Security acceptance criteria and CONTRACT freeze are met in the reviewed diff for fail-closed completed, DB SoT completeness, UNIQUEs, soft-success idempotency, status reject, stub `/profile` auth + `no-store`, and XSS on stub/completed surfaces. Residual notes: no live browser/DB E2E; migration apply not verified against a live Supabase this gate. **CLOSE can proceed.**

---

### Findings

No Critical. No High.

#### Medium

1. **Broad `catch` after RPC falls through to two-step even when the atomic path may have already committed**  
   **Where:** `lib/interview/actions/submit-interview.ts:208-223`; `lib/profile/upsert-from-interview.ts:178-190` (`parseRpcResult`); two-step always returns `alreadyCompleted: false` (`submit-interview.ts:138`).  
   **What:** Any thrown error from `completeInterviewWithProfile` (network blip after commit, malformed RPC payload parse, unexpected PG code) triggers `completeFailClosedTwoStep`, which upserts again (version bump) and always reports `alreadyCompleted: false`. Fail-closed ordering is still preserved (profile before status; incomplete never reaches here). Soft-success semantics and version monotonicity can drift under rare client/RPC transport failures.  
   **Why it matters:** Double-apply is recoverable via `UNIQUE (client_id)` but weakens idempotent `alreadyCompleted` signaling and can inflate `version` without an Operator reopen.  
   **Fix direction (non-blocking, BE):** Narrow the fallback (e.g. only when RPC is missing / undefined function); on unique-violation or post-error, re-SELECT session+profile and return soft success without a second write; never treat parse failure after a successful RPC as “retry from scratch.”

#### Low

1. **`submitInterview` is not exercised under a mocked Server Action / Supabase harness**  
   **Where:** `lib/interview/interview.test.ts` (completeness, strip/reject, soft-success shapes, arity); `lib/interview/actions/submit-interview.ts:141-233`.  
   **What:** Unit coverage proves helpers and contracts. There is no test that drives `submitInterviewInner` through mocked SELECT → completeness → RPC/two-step and asserts zero writes on incomplete / `FORBIDDEN_FIELDS` / soft success on already-completed. Same class of residual as US-1.1 / US-1.2.  
   **Fix direction (non-blocking, BE):** Add mocked-action tests for incomplete (no profile write), `status` reject, already-completed soft success, and unique-violation recovery.

2. **Persist-then-submit treats draft `CONFLICT` as an error banner, not soft-success redirect**  
   **Where:** `components/interview/InterviewWizard.tsx:287-297, 401-430`.  
   **What:** Submit always `persistInterviewDraft` first. If another tab already completed, persist returns `CONFLICT` → `handlePersistFailure` sets local `status` to `completed` and shows an error Message; it never calls `submitInterview()` (which would soft-succeed). User can still reach `/profile` via completed view CTA. Rare multi-tab race.  
   **Fix direction (non-blocking, FE):** On submit path, map persist `CONFLICT` (or follow with `submitInterview()`) to the same success toast + `router.push("/profile")` as `alreadyCompleted: true`.

---

### Must-check hunt (file:line)

| Check | Result | Evidence |
|-------|--------|----------|
| **Fail-closed completed** | **Pass** | Preferred atomic RPC upsert then `status = 'completed'` (`20260829120000_neuramark_business_profiles.sql:70-96`). App calls RPC first (`submit-interview.ts:209-213`). Two-step fallback is profile-first then `mayMarkInterviewCompleted(true)` then mark (`114-138`; `upsert-from-interview.ts:61-148`). No reverse order. Only in-app writers of `completed`: RPC + `markInterviewCompleted`. |
| **Completeness SoT from DB** | **Pass** | SELECT own session answers (`submit-interview.ts:58-66, 171-180`); `validateInterviewCompleteness` before writes (`200-203`; `completeness.ts:17-27`). Client `answers` stripped (`merge-answers.ts:35-36, 69-88`; test `508-518`). Incomplete → `VALIDATION_ERROR` + early return; no upsert. |
| **UNIQUE constraints** | **Pass** | `UNIQUE (client_id)` + `UNIQUE (source_interview_id)` indexes (`migration:22-28`). RPC `ON CONFLICT (client_id) DO UPDATE`. Insert path recovers on `23505` (`upsert-from-interview.ts:81-85`). |
| **Soft-success idempotency** | **Pass** (code) | Already completed + profile exists → soft success without reopen (`submit-interview.ts:85-90`; `decideSubmitSessionPath` `merge-answers.ts:114-119`). Unique-violation recovery → `alreadyCompleted: true` (`upsert-from-interview.ts:39-42`). Success shape fixture (`interview.test.ts:568-580`). |
| **Status flip rejection** | **Pass** | `status` / privilege keys → `FORBIDDEN_FIELDS` before parse (`submit-interview.ts:154-156`; `merge-answers.ts:15-21, 41-47`; test `475-481`). Never read client `status` for write. |
| **Stub `/profile` auth + no-store** | **Pass** | Under `app/(app)/profile/`; layout `requireActive("page")` (`app/(app)/layout.tsx:16-18`); helper `requireActive("page")` (`get-profile-stub-summary.ts:16`); `isPublicPath("/profile") === false` (probe + `session-guards.test.ts:108`); `Cache-Control: no-store` (`next.config.ts:37-42`). No id query params. |
| **Race / txn** | **Pass** (design + unit; live race not run) | `FOR UPDATE` + single txn in RPC (`migration:59-96`). DB uniques prevent two rows. App soft-success paths above. |
| **XSS on profile / interview fields** | **Pass** | Stub renders i18n copy only via PrimeReact `Message` `text` / headings (`ProfileStubView.tsx:36-42`) — no `fields` dump. Completed answers as React text nodes (`InterviewCompletedView.tsx:100-130`). Grep: no `dangerouslySetInnerHTML` in `components/`. |
| **Auth on submit** | **Pass** | `requireActive("handler")` first (`submit-interview.ts:145-152`); 401/403 envelopes; no write before auth. |
| **Identity / IDOR** | **Pass** | Upsert / SELECT always `client_id = user.id`; strip `client_id` / `source_interview_id` / `profile_id` (`merge-answers.ts:23-33`; `upsert-from-interview.ts:70-75, 107`). Stub arity 0 (`get-profile-stub-summary.ts:15`; test `642-669`). |
| **Client bundle / secrets** | **Pass** | No `@supabase/supabase-js` in Client Components for these surfaces. `lib/supabase/server.ts` is `server-only` + service-role. Wizard imports Server Action only. |
| **No answers/fields in logs** | **Pass** | Submit/profile logs use static strings / `{ code }` only (`submit-interview.ts:69, 167-168, 250`; `upsert-from-interview.ts:45, 89-91`). |
| **RLS deny-by-default** | **Pass** | `ENABLE ROW LEVEL SECURITY`; zero policies; RPC `EXECUTE` to `service_role` only (`migration:35-37, 105-108`). |
| **`neuramark_` prefix** | **Pass** | Table, indexes, trigger, RPC named with prefix. |
| **revalidatePath** | **Pass** | `/interview`, `/dashboard`, `/profile` on success (`submit-interview.ts:193-195, 226-228`). |
| **Draft persist still 409 after complete** | **Pass** | `decideDraftWrite({ status: "completed" })` → conflict (`interview.test.ts:592-595`); persist path unchanged. |

---

### Confirmations (CONTRACT / SECURITY)

| Topic | Result |
|-------|--------|
| AC: complete → one profile (or update) | **Pass** (code). Create-on-submit + upsert on `client_id`. |
| AC: incomplete → 400 fields | **Pass.** Unit: missing `zone` / empty `services.items`. |
| AC: idempotent double-submit | **Pass** (code + uniques). Live race not run. |
| `[SEC]` completeness server-side; no client status flip | **Pass.** |
| `[SEC]` DB unique on `source_interview_id` | **Pass.** |
| Stub minimal until US-2.1 | **Pass.** No field grid. |
| EN/ES terminology | **Pass.** Living profile / Ficha viva; Initial interview / Entrevista inicial. No CONTEXT _Evitar_ terms in new copy. |
| No public Route Handler / no browser Supabase | **Pass.** |
| Out of scope (US-2.1 full UI, US-2.2 PATCH, US-2.3 agent DTO, LLM) | **Pass.** Not introduced. |

---

### Critical / High fix ownership

**None.** No Critical or High findings. No FE vs BE re-delegation for a fix loop.

Optional non-blocking follow-ups (if scheduled later):

| Finding | Owner |
|---------|-------|
| Medium #1 — narrow RPC fallback / soft-success re-SELECT | **BE** |
| Low #1 — mocked `submitInterview` harness | **BE** |
| Low #2 — persist `CONFLICT` → soft-success UX on submit path | **FE** |

---

### Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/interview/interview.test.ts lib/auth/session-guards.test.ts` | **52/52 pass** (interview + session-guards) |
| `npx eslint` on US-1.3 changed TS/TSX sources (`submit-interview`, profile helpers, completeness, merge-answers, wizard, stub, profile page) | **exit 0** |
| `npx tsc --noEmit` | **Errors only in test files** (`.ts` import extensions / `NODE_ENV` assign) — pre-existing test harness pattern; **not** product compile blockers for this story |
| `npx tsx -e` `isPublicPath('/profile'|'/profile/')` | Both **`false`** |
| Grep product TS/TSX for `dangerouslySetInnerHTML`, client `@supabase`, `status: "completed"` writers | Only RPC + `markInterviewCompleted`; no XSS sinks; no browser Supabase on these surfaces |

---

### What Was Not Covered

- Live browser E2E (complete Submit → stub `/profile` → one profile row + `completed`).
- Live incomplete submit against Postgres (assert still `draft` + zero profile).
- Live double-submit / race against Postgres.
- Applying `supabase/migrations/20260829120000_neuramark_business_profiles.sql` to a real project this gate.
- Full `next build` (not required given targeted lint + unit evidence; tsc noise confined to tests).

---

### CLOSE recommendation

**CLOSE can proceed.** Product-owner should check US-1.3 AC boxes in `plan/USER_STORIES.md` at CLOSE. Track Medium #1 as a follow-up hardening item; it does not require a BUILD fix loop before CLOSE.
