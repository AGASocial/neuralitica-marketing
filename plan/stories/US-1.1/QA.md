# QA Report — US-1.1

**Story:** Start guided business interview (Entrevista inicial)  
**Reviewer:** qa-engineer  
**Date:** 2026-08-28  
**Branch:** `feature/US-1.1-start-interview`  
**Commits:** `97d5704` (BE/schema), `924ea96` (FE wizard)  
**VALIDATE:** PASS WITH NOTES (`plan/stories/US-1.1/VALIDATION.md`)  
**Standard:** Enterprise-grade (production-safe for paying customers)  
**Sources:** `plan/USER_STORIES.md` § US-1.1, `plan/stories/US-1.1/{SECURITY,CONTRACT,TASKS,VALIDATION}.md`, `AGENTS.md`

Auth is real (US-14.5). `AUTH_DEV_FALLBACK` hardcoded user is sanctioned only on the dual-flag dev path. Interview is a **product write**.

### Verdict: APPROVE

No Critical. No High. No Medium. **No fix loop.**

One Low residual (action-level tests cover helpers, not the Server Action wiring). Security acceptance criteria and CONTRACT freeze are met in the reviewed diff.

---

### Findings

No Critical. No High. No Medium.

#### Low

1. **`persistInterviewDraft` / `getOrCreateInterviewDraft` are not invoked in tests**  
   **Where:** `lib/interview/interview.test.ts` (helpers only); `lib/interview/actions/persist-interview-draft.ts:243-247`; `lib/interview/get-or-create-interview-draft.ts:40`.  
   **What:** TASKS asked for happy-path create/load/update plus identity/status tests. Those predicates are unit-tested (`findForbiddenInterviewKeys`, `stripInterviewIdentityKeys`, `decideDraftWrite`, Zod, 64 KiB). The exported action is not called with a mocked `requireActive` / Supabase client. A future refactor that **destructures** `PersistInterviewDraftInput` before the forbidden-key scan would drop `status` / `role` at the boundary and would not fail today’s suite. Current code does **not** destructure: it passes the raw object into `persistInterviewDraftInner(rawInput: unknown)` (`persist-interview-draft.ts:153-170, 243-247`).  
   **Fix direction (non-blocking):** Add a mocked-action test that calls `persistInterviewDraft({ ...valid, status: "completed" })` and asserts `FORBIDDEN_FIELDS` and no write.

---

### Must-check hunt (file:line)

| Check | Result | Evidence |
|-------|--------|----------|
| **IDOR:** no `client_id` / session UUID from request | **Pass** | Load/persist queries use `user.id` from `requireActive` only (`get-or-create-interview-draft.ts:41,48,57`; `persist-interview-draft.ts:158,61,85,115`). Strip `client_id` / `clientId` / `id` / `session_id` / `sessionId` (`merge-answers.ts:21-54`, `persist-interview-draft.ts:170`). No `/interview/[id]`. Page does not read `searchParams`. FE persist body is `{ currentStep, answers }` only (`InterviewWizard.tsx:270-272`). Test: `interview.test.ts:165-189`. |
| **`status=completed` rejected; `UPDATE … AND status='draft'`; no blind UPSERT** | **Pass** | `status` is a reject key (`merge-answers.ts:13-18,32-37`; `persist-interview-draft.ts:166-168`). INSERT hardcodes `status: "draft"` (`persist-interview-draft.ts:116`; `get-or-create-interview-draft.ts:58`). UPDATE sets `answers` / `current_step` / `updated_at` only, `.eq("status", "draft")` (`persist-interview-draft.ts:80-86`). 0 rows → `"conflict"` → `CONFLICT` (`99-100, 232-233`). No `.upsert(` / `ON CONFLICT` in `lib/interview`. Unique race: SELECT then update only if draft (`123-134`; `merge-answers.ts:162-169`). |
| **64 KiB 413; Zod per-field; DB CHECK 80 KiB** | **Pass** | App gate `> 65536` UTF-8 of `JSON.stringify` (`lib/contracts/interview.ts:8`; `merge-answers.ts:142-148`; `persist-interview-draft.ts:201-202`) → `PAYLOAD_TOO_LARGE`. Zod caps: items 1–500 / max 20; description 1–2000; restrictions 0–20; `.strict()` (`lib/contracts/interview.ts:47-102`). CHECK `octet_length(answers::text) <= 81920` (`20260829010000_neuramark_interview_sessions.sql:37-38`). CHECK fire → `INTERNAL_ERROR`, not 413 (`persist-interview-draft.ts:90-93, 256-257`). |
| **XSS:** no `dangerouslySetInnerHTML`; answers as text | **Pass** | Repo grep: no `dangerouslySetInnerHTML` / `innerHTML` in interview or `components/`. Chips and completed lists render `{item}` / `{description}` as React text (`InterviewStepFields.tsx:150`; `InterviewCompletedView.tsx:77-78, 105-106`). PrimeReact `Message` uses `text={...}` of i18n copy, not answers (`InterviewWizard.tsx:331-335`). |
| **CSRF:** Server Action only; no GET mutation; `/interview` not public | **Pass** | `"use server"` persist (`persist-interview-draft.ts:1, 243`). No `app/**/interview/**/route.ts`. Get-or-create empty draft on RSC GET is CONTRACT-accepted residual. `isPublicPath("/interview") === false` (`public-routes.ts:7-14, 26-28`; test `session-guards.test.ts:107`). Unauthenticated GET `/interview` → **302** `/login?next=%2Finterview` (live probe). |
| **`requireActive` on persist independently of middleware** | **Pass** | First statement in persist inner: `requireActive("handler")` (`persist-interview-draft.ts:157-164`). Inactive → `FORBIDDEN`, no write. `(app)` layout + interview layout also `requireActive("page")`. |
| **RLS enable, zero policies; service-role server-only** | **Pass** | `ENABLE ROW LEVEL SECURITY`; comment “Zero policies”; no `CREATE POLICY` (`migration:49-51`). Writes via `createServerSupabaseClient()` (`lib/supabase/server.ts:1, 15-31`, `import "server-only"`). No `@supabase/supabase-js` in `components/interview` or other Client Components in this story. |
| **No answers in logs** | **Pass** | Interview `console.error` logs static strings and `{ code }` only (`get-or-create-interview-draft.ts:29,44,68,75-77`; `persist-interview-draft.ts:65,92,95,139,142,179,259-261`). No `answers` / raw input / `error.message`. |
| **No Ficha viva / submit / LLM** | **Pass** | No `neuramark_business_profiles`. Last-step CTA is **Save** / persist draft (`InterviewWizard.tsx:385-388`). `InterviewCompletedView` is read-only (CONTRACT: unexpected `completed`). No LLM imports in interview modules. |
| **SQL parameterized jsonb** | **Pass** | `.insert({ answers })` / `.update({ answers })` bound values (`persist-interview-draft.ts:80-81, 114-118`; `get-or-create-interview-draft.ts:54-60`). No string-built SQL in `lib/interview`. |
| **Race: unique `client_id`; completed not clobbered** | **Pass** | `UNIQUE INDEX neuramark_interview_sessions_client_id_idx` (`migration:41-42`). Insert unique → SELECT; `decideUniqueRaceWrite` conflicts on non-draft / missing row (`persist-interview-draft.ts:123-134`; `merge-answers.ts:162-169`). Update predicate `status = 'draft'`. |
| **`persistInterviewDraft` typed vs runtime extra keys (`FORBIDDEN_FIELDS`)** | **Pass** | Export is typed `PersistInterviewDraftInput` (CONTRACT). Runtime object is forwarded **without destructuring** to `persistInterviewDraftInner(rawInput: unknown)` (`243-247, 153-170`). Privilege keys scanned via `Object.keys` before Zod (`merge-answers.ts:32-37`). Identity keys stripped; `status` / `role` / `active` / `auth_user_id` / `authUserId` → `FORBIDDEN_FIELDS`. Test: `interview.test.ts:192-206`. Residual: see Low #1. |
| **Client bundle: no `@supabase/supabase-js` in interview components** | **Pass** | Grep `components/interview` and `components/dashboard`: no supabase imports. Wizard imports only the Server Action + types (`InterviewWizard.tsx:8-16`). `lib/supabase/server.ts` is `server-only`. `.next/static` has no `SUPABASE_SERVICE_ROLE` / `neuramark_interview_sessions`. |
| **`next.config` `no-store` on `/interview`** | **Pass** | `next.config.ts:28-35` (`/interview` and `/interview/:path*`). Page + interview layout + `(app)` layout `dynamic = "force-dynamic"`. Persist `revalidatePath("/interview")` (`persist-interview-draft.ts:236`). Live GET `/interview` sent `cache-control: no-store`. |
| **TRIGGER syntax / migration safety** | **Pass** | `EXECUTE FUNCTION public.neuramark_set_updated_at()` (`migration:17-25, 44-47`) is PostgreSQL 14+; matches frozen CONTRACT; hosted Supabase is PG 15+. `RETURNS trigger`; `BEFORE UPDATE`; prefixed table/enums/index/trigger/CHECK/function. `CREATE TYPE` / `CREATE TABLE` are standard one-shot migrations. No `neuramark_business_profiles`. Function is `SECURITY INVOKER` and only assigns `NEW.updated_at` (no dynamic SQL). |

---

### Confirmations (CONTRACT / SECURITY)

| Topic | Result |
|-------|--------|
| One row per Cliente; load shape omits `id` / `client_id` | **Pass.** Unique index; `toInterviewDraftView` emits `currentStep`, `answers`, `status` (`merge-answers.ts:205-209`); page re-projects those three (`interview/page.tsx:30-34`). |
| Seven-key `.strict()` merge; tone/style free text; empty restrictions allowed | **Pass.** `mergeInterviewAnswers` copies only `INTERVIEW_STEP_ORDER` (`merge-answers.ts:56-77`). Test empty restrictions (`interview.test.ts:129-135`). |
| High-water resume cursor; re-save does not rewind | **Pass.** `resumeCursorAfterSave` (`merge-answers.ts:131-139`; tests `70-84`). |
| `/interview` under `app/(app)/`; dashboard CTA is Link only | **Pass.** `app/(app)/interview/page.tsx`; dashboard `href: "/interview"` (`dashboard/page.tsx:15`; `DashboardView.tsx:55-58`). No extra interview API. |
| EN/ES: Initial interview / Entrevista inicial; no _Evitar_ interview copy | **Pass.** `messages/en.json` / `es.json` `interview.title`. Dashboard card aligned. No cuestionario / onboarding interview in interview strings. |
| Auth modules unchanged except `no-store` + `isPublicPath("/interview")` test | **Pass.** Diff does not edit `lib/auth/*` implementation; `session-guards.test.ts` adds `/interview` assertion. |

---

### Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/interview/interview.test.ts lib/auth/session-guards.test.ts` | **28/28 pass** (0 fail) |
| `npx tsx -e 'isPublicPath("/interview")'` | **`false`** (also `"/interview/"` → `false`) |
| Grep `components/interview`, `components/dashboard`, `components/` for `supabase`, `dangerouslySetInnerHTML`, `client_id` | **No matches** in interview/dashboard Client Components; no `dangerouslySetInnerHTML` in `components/` |
| Grep `lib/interview` for `upsert` / `ON CONFLICT` / answers in `console.*` | **No upsert;** logs are codes only |
| Grep `app/**/interview/**/route.ts` | **None** |
| Unauthenticated `GET http://localhost:3001/interview` (dev server) | **302** `Location: /login?next=%2Finterview`; `cache-control: no-store`; **not 200** |
| Grep `.next/static` for `SUPABASE_SERVICE_ROLE` / `neuramark_interview_sessions` | **No matches** |
| `AUTH_DEV_FALLBACK= npm run build` | **Not run** (time). Production throw if `AUTH_DEV_FALLBACK` is set is US-14.5 intended behavior, not this story. |

---

### What Was Not Covered

- Live browser wizard E2E (step advance, refresh restore, 413/409 over the wire against a real DB).
- Applying `20260829010000_neuramark_interview_sessions.sql` to a hosted project (migration file reviewed; not executed here).
- Production `next build` with `AUTH_DEV_FALLBACK=` unset.
- Server Action origin-check behavior beyond Next.js defaults (same class as `logIn`).
- Persist rate limit (explicitly **not required** in 1.1).

---

### Verdict for orchestrator

- **Verdict:** APPROVE  
- **Findings:** Critical 0 · High 0 · Medium 0 · Low 1  
- **QA.md:** `plan/stories/US-1.1/QA.md`  
- **Fix loop required:** No  
