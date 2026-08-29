# QA Report — US-1.2

**Story:** Save and resume interview  
**Reviewer:** qa-engineer  
**Date:** 2026-08-29  
**Branch:** `feature/US-1.2-save-resume-interview`  
**Commits:** `37f1f81` (FE), `9abfb90` (BE), `aacd156` (artifacts)  
**VALIDATE:** PASS WITH NOTES (`plan/stories/US-1.2/VALIDATION.md`)  
**Standard:** Enterprise-grade (production-safe for paying customers)  
**Sources:** `plan/USER_STORIES.md` § US-1.2, `plan/stories/US-1.2/{SECURITY,CONTRACT,TASKS,VALIDATION}.md`

Auth is real (US-14.5). Sanctioned `AUTH_DEV_FALLBACK` local user is **not** a finding. Interview remains a **product write**.

### Verdict: APPROVE WITH NOTES

No Critical. No High. No Medium. **No fix loop / no FE–BE re-delegation.**

Security acceptance criteria and CONTRACT freeze are met in the reviewed diff. Residual notes: no live browser/DB E2E this gate; action-level persist tests remain helper/predicate coverage (same class as US-1.1 Low). **CLOSE can proceed.**

---

### Findings

No Critical. No High. No Medium.

#### Low

1. **`persistInterviewDraft` is still not invoked under a mocked Server Action harness**  
   **Where:** `lib/interview/interview.test.ts` (helpers + arity check); `lib/interview/actions/persist-interview-draft.ts:153-170, 244-248`.  
   **What:** Completed-write, strip/reject, Zod, 64 KiB, dashboard summary shape, and `decideDraftWrite` are unit-tested. There is still no test that calls `persistInterviewDraft({ …valid, status: "completed" })` (or a completed-row Supabase stub) through the exported action and asserts `FORBIDDEN_FIELDS` / `CONFLICT` with zero writes. A future refactor that destructures typed input before the forbidden-key scan would silently weaken the gate without failing today’s suite. Current code forwards the raw object into `persistInterviewDraftInner(rawInput: unknown)` and does **not** destructure.  
   **Fix direction (non-blocking, BE):** Add a mocked-action test for privilege reject + completed-row `UPDATE … status = 'draft'` → `CONFLICT`.

2. **Persist `CONFLICT` flips UI to completed using client-local answers (no refetch)**  
   **Where:** `components/interview/InterviewWizard.tsx:236-242, 312-326`.  
   **What:** On `CONFLICT`, FE sets `status` to `"completed"` and renders `InterviewCompletedView` with in-memory `answers` (which may include unsaved edits). Contract requires showing `interview.errors.conflict` and not treating the write as saved — banner path is correct; answers shown may diverge from the server completed row until refresh. Rare in V1 (completed mainly after US-1.3 / ops).  
   **Fix direction (non-blocking, FE):** On `CONFLICT`, `router.refresh()` (or re-load draft) before/instead of trusting local answers for the read-only view.

---

### Must-check hunt (file:line)

| Check | Result | Evidence |
|-------|--------|----------|
| **Completed writes rejected server-side** | **Pass** | Pre-write `decideDraftWrite` → `"conflict"` (`merge-answers.ts:152-161`; `persist-interview-draft.ts:184-189`). `UPDATE … .eq("client_id").eq("status", "draft")`; zero rows → conflict (`78-100, 232-233`). Unique race never updates non-draft (`123-134`; `decideUniqueRaceWrite` `165-172`). Client `status` → `FORBIDDEN_FIELDS` (`166-168`). This story never writes `status = 'completed'`. INSERT hardcodes `"draft"` (`114-117`). Save & continue later reuses the same action (`InterviewWizard.tsx:259-309`). |
| **IDOR / session id** | **Pass** | Primary load by `requireActive` + `WHERE client_id = user.id` (`get-or-create-interview-draft.ts:40-50`; `get-interview-dashboard-summary.ts:16-31`). No `/interview/[id]` (only `page.tsx` / `layout.tsx` / `loading.tsx`). Persist strips `id` / `session_id` / `sessionId` / `client_id` / `clientId` (`merge-answers.ts:23-55`; `persist-interview-draft.ts:170`; tests `169-195`). Dashboard helper arity 0 (`get-interview-dashboard-summary.ts:16`; test `379-406`). Draft/summary views omit `id` / `client_id` (`229-238`, `304-324`). |
| **Dashboard summary leak (no answers)** | **Pass** | `toDashboardSummary` / schema emit only `status`, `currentStep`, `hasProgress` (`merge-answers.ts:249-261`; `lib/contracts/interview.ts:144-157`). SELECT reads `answers` only for `hasProgress` (`get-interview-dashboard-summary.ts:28-40`). RSC maps to i18n card strings — no answers props to `DashboardView` (`dashboard/page.tsx:28-70, 97-110`). Tests assert no `answers`/`id`/`client_id` (`269-324`). Load failure → local `error` card only (`81-88`, `34-40`). |
| **Save & continue validation parity** | **Pass** | Shared `runPersist("leave"|"next")` → same client `validateCurrentStep` + `persistInterviewDraft` payload (`InterviewWizard.tsx:113-150, 259-309`). Navigate `router.push('/dashboard')` only when `ok` (`305-309`). Invalid → `handlePersistFailure`, stay on step. No soft-save alias / second mutation path. Server Zod + advance-rule unchanged (`persistInterviewDraftInputSchema` `lib/contracts/interview.ts:89-103`). |
| **XSS on free-text answers** | **Pass** | Chips / completed lists / text steps render `{item}` / description as React text (`InterviewStepFields.tsx:150`; `InterviewCompletedView.tsx:91-120`). Dashboard body is i18n + step **label** from messages, not answers (`dashboard/page.tsx:61-66`; `DashboardView.tsx:64`). Grep: no `dangerouslySetInnerHTML` / `innerHTML` / `localStorage` / `sessionStorage` in app TS/TSX product paths. |
| **Auth gates** | **Pass** | `(app)` layout `requireActive("page")` (`app/(app)/layout.tsx:16-18`); interview layout also (`interview/layout.tsx:16`). Persist `requireActive("handler")` first (`persist-interview-draft.ts:157-164`). Dashboard summary `requireActive("page")` (`get-interview-dashboard-summary.ts:17`). `isPublicPath("/interview")` / `"/dashboard"` → **false** (probe + `public-routes.ts:7-28`; `session-guards.test.ts` public allowlist). `Cache-Control: no-store` on both (`next.config.ts:21-35`). |
| **Continuity source of truth** | **Pass** (code) | Postgres + auth cookie; persist writes answers/`current_step`; RSC restore via `getOrCreateInterviewDraft`. Successful persist `revalidatePath("/interview")` **and** `revalidatePath("/dashboard")` (`persist-interview-draft.ts:236-237`). No browser storage as draft store. |
| **Dashboard no get-or-create** | **Pass** | SELECT-only helper (`get-interview-dashboard-summary.ts:12-40`). No row → `null` → Start (`summarizeInterviewSessionRow` `268-276`; `buildInterviewCard` `43-49`). |
| **Start vs Resume vs completed** | **Pass** | `computeHasProgress` matches freeze (`merge-answers.ts:231-247`). Empty draft → Start; progress → Resume + `{step}`; completed → view-only CTA to `/interview` (`dashboard/page.tsx:43-69`). No Cliente reopen control. |
| **Operator reopen** | **Pass** | SQL/ops only in CONTRACT; no app `completed` → `draft` action under `lib/interview`. |
| **Client bundle / secrets** | **Pass** | No `@supabase/supabase-js` in `components/interview` or `components/dashboard`. `lib/supabase/server.ts` is `server-only` + service-role. Wizard imports Server Action + types only. |
| **No answers in production logs** | **Pass** | Interview `console.error` logs static strings / `{ code }` only (`persist-interview-draft.ts:65-66, 92-96, 179-180, 260-262`; `get-interview-dashboard-summary.ts:34-36`). |
| **DB prefix / no new migration** | **Pass** | US-1.2 uses existing `neuramark_interview_sessions` (+ enums/trigger). Diff adds no migration. |

---

### Confirmations (CONTRACT / SECURITY)

| Topic | Result |
|-------|--------|
| Save & continue later = same mutation as Next | **Pass.** One action; FE navigates only on success. |
| Meaningful progress predicate | **Pass.** Unit tests `242-266`. |
| High-water cursor on leave | **Pass.** Same `resumeCursorAfterSave`; CONTRACT fixture 5 advances zone → tone. |
| EN/ES copy | **Pass.** `saveAndContinueLater`, resume/completed card keys; titles Initial interview / Entrevista inicial. |
| Auth modules not redesigned | **Pass.** Diff does not edit signup/login/logout/reset or `isPublicPath` allowlist. |
| Out of scope (US-1.3 submit / Ficha viva / reopen UI / `/interview/[id]`) | **Pass.** Not introduced. |

---

### Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/interview/interview.test.ts` | **24/24 pass** |
| `npx tsx --test lib/auth/session-guards.test.ts` | **13/13 pass** |
| `npx tsx -e` `isPublicPath('/interview'|'/interview/'|'/dashboard')` | All **`false`** |
| Grep interview/dashboard for `dangerouslySetInnerHTML`, `localStorage`, `sessionStorage`, client `@supabase` | **No product matches** |
| Grep `lib/interview` for `upsert` / answers in `console.*` | **No upsert;** logs codes only |
| Glob `app/**/interview/**` | **No `[id]` segment;** no Route Handler |
| `npx tsc --noEmit` | **Fails on pre-existing test import `.ts` extensions** (`interview.test.ts:404`, `session-guards.test.ts`) — not introduced as product regressions in app sources |
| Live browser / authenticated DB E2E | **Not run** (no app server in terminals this gate) |
| `npm run build` | **Not run** |

---

### What Was Not Covered

- Live path: draft progress → Save & continue later → dashboard Resume → refresh `/interview` → (SQL-set completed) UI read-only + persist 409.
- Unauthenticated HTTP probe of `/interview` / `/dashboard` against a running Next server (code + unit evidence only; US-1.1 previously proved 302 + `no-store`).
- Production `next build` with `AUTH_DEV_FALLBACK` unset.
- Persist rate limit (explicitly **not required**).

---

### Fix ownership (Critical / High)

**None.** No Critical or High findings. Orchestrator: **do not** re-delegate FE/BE for a fix loop.

---

### Verdict for orchestrator

- **Verdict:** APPROVE WITH NOTES  
- **Findings:** Critical 0 · High 0 · Medium 0 · Low 2  
- **QA.md:** `plan/stories/US-1.2/QA.md`  
- **CLOSE can proceed:** **Yes**  
- **Fix loop required:** No  
