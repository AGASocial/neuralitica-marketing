# Validation Report — US-1.1

**Story:** Start guided business interview (Entrevista inicial)  
**Validator:** requirements-validator  
**Date:** 2026-08-28  
**Branch:** `feature/US-1.1-start-interview`  
**Commits reviewed:** `97d5704` (schema, contracts, draft persist), `924ea96` (wizard + dashboard CTA)  
**Contract:** Frozen, Reviewed by FE (2026-08-29)  
**SPEC-REVIEW:** ALIGNED  
**Tests re-run:** `npx tsx --test lib/interview/*.test.ts lib/auth/session-guards.test.ts` → **28/28 pass**

---

### Verdict: PASS WITH NOTES

All in-scope USER_STORIES acceptance criteria and every SECURITY.md `[SEC]` checkbox (including **added**) are met in the implementation. Notes are residual: this validator did not run live browser / DB E2E; persist is covered by helper unit tests rather than a mocked Server Action integration suite; list chips are a small custom widget on top of PrimeReact.

Do **not** treat missing US-1.2 dashboard resume / “Save & continue later”, or missing US-1.3 submit / `completed` / Ficha viva, as failures.

On PASS, the product-owner — not this validator — checks the story’s acceptance criteria in `plan/USER_STORIES.md`.

---

### Acceptance Criteria

Criteria 1–8 are verbatim from `plan/USER_STORIES.md` § US-1.1. Criteria 9–22 are verbatim SECURITY.md `[SEC] (added)` items. Overlapping story `[SEC]` lines are evaluated against the SECURITY freeze (64 KiB / 413 `PAYLOAD_TOO_LARGE`, Zod `.strict()`, etc.).

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Client can complete all interview sections in one sitting or save and resume (US-1.2) | **PASS** (scope split) | Seven-step wizard in SPEC order (`components/interview/step-helpers.ts` 7–11, `InterviewWizard.tsx` 328, 351–368). Sequential Next / last-step **Save** (`InterviewWizard.tsx` 254–291, 385–388) persists via `persistInterviewDraft`; last step stays `draft` (INSERT `status: "draft"` only — `persist-interview-draft.ts` 114–118; UPDATE never sets `completed`). Refresh restore: RSC `getOrCreateInterviewDraft` → wizard initial state (`app/(app)/interview/page.tsx` 26–34, `InterviewWizard.tsx` 53–54). Dashboard “incomplete interview” prompt and dedicated “Save & continue later” are **out of scope** (US-1.2); Start CTA is wired (`dashboard/page.tsx` 15). |
| Answers are stored as structured JSON, not free-form blobs only | **PASS** | `interviewAnswersStoredSchema` seven `.strict()` keys (`lib/contracts/interview.ts` 76–86). Table `answers jsonb NOT NULL DEFAULT '{}'` (`supabase/migrations/20260829010000_neuramark_interview_sessions.sql` 33). Merge copies only `INTERVIEW_STEP_ORDER` keys (`merge-answers.ts` 56–77). Persist writes the merged object (`persist-interview-draft.ts` 191–215). |
| Invalid or incomplete required fields block advance with clear messages | **PASS** | Client presentation checks block submit (`InterviewWizard.tsx` 108–131, 260–264) with EN/ES `Message`. Server Zod + advance superRefine (`lib/contracts/interview.ts` 89–102); empty `services.items` → `too_small` (`interview.test.ts` 88–103). FE maps `VALIDATION_ERROR` + `fields` to step `Message` (`InterviewWizard.tsx` 240–245, 178–199). Empty `restrictions.items` allowed (`interview.test.ts` 129–135). |
| Copy exists in English and Spanish | **PASS** | `messages/en.json` 153–230 (`title`: “Initial interview”); `messages/es.json` 153–230 (`title`: “Entrevista inicial”). Dashboard card aligned (`en.json` 6–9, `es.json` 6–9). Error keys match CONTRACT (`interview.errors.*`). No CONTEXT _Evitar_ terms in interview copy. |
| **[SEC]** All interview answers are re-validated server-side against a typed schema (Zod); client-side validation is presentation only | **PASS** | Persist: Zod parse of input (`persist-interview-draft.ts` 171–174) then full merged `interviewAnswersStoredSchema` (`194–198`). Caps: items 1–500 / max 20; description 1–2000; restrictions 0–20 (`lib/contracts/interview.ts` 47–61). Client `validateCurrentStep` returns before the action (`InterviewWizard.tsx` 260–264); server remains the gate. |
| **[SEC]** Interview sessions are created and loaded only for the client resolved via server-side `getCurrentUser()`; no `client_id` accepted from the request body or query string | **PASS** | Load: `requireActive("page")` then `WHERE client_id = user.id` (`get-or-create-interview-draft.ts` 41, 48, 56–57). Persist: `requireActive("handler")` (`persist-interview-draft.ts` 157–158); SELECT/UPDATE/INSERT use `user.id` / `params.clientId` from that user (`54–62`, `85–86`, `115`). Strip `client_id` / `clientId` / `id` / `session_id` / `sessionId` (`merge-answers.ts` 21–54, `persist-interview-draft.ts` 170). Test: `interview.test.ts` 165–189. No `client_id` in FE forms (`InterviewWizard.tsx` 270–272). Route is `/interview` with no session id (`app/(app)/interview/page.tsx`). |
| **[SEC]** Total `answers` JSON payload rejected above a configured size limit (e.g. 64 KB) with a 413/400, preventing storage abuse | **PASS** | App gate: `Buffer.byteLength(JSON.stringify(answers), "utf8") > 65536` (`merge-answers.ts` 142–148, `INTERVIEW_ANSWERS_MAX_UTF8_BYTES` in `lib/contracts/interview.ts` 8). Persist returns `PAYLOAD_TOO_LARGE` / `interview.errors.payloadTooLarge`, no store (`persist-interview-draft.ts` 201–202, `errors.ts` 33–35). Schema failures remain `VALIDATION_ERROR` (`persist-interview-draft.ts` 172–174). FE branches on `error.code` (CONTRACT: Server Action status is logical). Tests: `interview.test.ts` 138–161. |
| **[SEC]** Free-text answers are stored as data and always rendered escaped; they are never interpolated into HTML, SQL, or shell commands | **PASS** | Stored as jsonb values via Supabase client (no SQL concat). Rendered as React text nodes / PrimeReact `text` (`InterviewStepFields.tsx` 150; `InterviewCompletedView.tsx` 77–78, 105–106; `InterviewWizard.tsx` 331–335). No `dangerouslySetInnerHTML` / `innerHTML` / markdown HTML in interview or `components/`. |
| **[SEC] (added)** No client-supplied interview session UUID in path, query, or body. Load and persist by `getCurrentUser().id` only. If `id` / `session_id` / `sessionId` is sent, strip or reject — do not use it | **PASS** | No `app/(app)/interview/[id]`. No interview `route.ts`. Strip set includes `id`, `session_id`, `sessionId` (`merge-answers.ts` 21–27, 41–53). Load/persist queries never use request ids (`get-or-create-interview-draft.ts` 24–25; `persist-interview-draft.ts` 60–61). Test strips those keys (`interview.test.ts` 165–189). |
| **[SEC] (added)** `status` is never read from the client. This story writes `draft` only. US-1.3 is the only path that may set `completed` | **PASS** | `findForbiddenInterviewKeys` rejects `status` (any casing) before Zod (`merge-answers.ts` 13–37; `persist-interview-draft.ts` 166–168). INSERT hardcodes `status: "draft"` (`persist-interview-draft.ts` 116; `get-or-create-interview-draft.ts` 58). UPDATE does not set `status`. No `business_profiles` / submit path. Test: `interview.test.ts` 192–206. |
| **[SEC] (added)** Draft writes use `UPDATE … WHERE client_id = $1 AND status = 'draft'` (or equivalent INSERT of a new draft). A `completed` row must not be overwritten. Zero rows updated → **409**, no second row | **PASS** | `updateDraft` `.eq("client_id").eq("status", "draft")`; 0 rows → `"conflict"` (`persist-interview-draft.ts` 78–103). `decideDraftWrite` / unique-race: completed → conflict, no INSERT (`merge-answers.ts` 150–170; `persist-interview-draft.ts` 123–134, 187–189, 232–233). Envelope `CONFLICT` (`errors.ts` 37–38). No `ON CONFLICT DO UPDATE` / upsert in `lib/interview`. Tests: `interview.test.ts` 209–222. |
| **[SEC] (added)** `/interview` is not on the public allowlist (`isPublicPath`). Page lives under `app/(app)/`. Mutations call `requireActive("handler")` independently of middleware / layout | **PASS** | `PUBLIC_EXACT` has no `/interview` (`lib/auth/public-routes.ts` 7–14). Test `isPublicPath("/interview") === false` (`session-guards.test.ts` 107). Page: `app/(app)/interview/page.tsx`. Parent layout `requireActive("page")` (`app/(app)/layout.tsx` 17). Persist: `requireActive("handler")` first (`persist-interview-draft.ts` 157–158); inactive → `FORBIDDEN`, no write (`45–51`). |
| **[SEC] (added)** Persist is a POST-only Server Action with the same CSRF origin check as auth mutations. No GET persist. No interview Route Handler required | **PASS** | `"use server"` on `lib/interview/actions/persist-interview-draft.ts` 1. Single action `persistInterviewDraft` (243–264). Wizard is the only consumer (`InterviewWizard.tsx` 8, 270). No `app/**/interview/**/route.ts`. No GET mutation. |
| **[SEC] (added)** Per-field Zod caps (CONTRACT freeze numbers): list `items` max **20**; each item **1–500** chars after trim; `description` **1–2000** chars after trim when that step is advanced; `restrictions.items` **0–20** (empty allowed). Unknown keys rejected (`.strict()`) | **PASS** | `lib/contracts/interview.ts` 47–61, 76–86, 89–94. FE mirrors caps (`step-helpers.ts` 7–9). Empty restrictions: `interview.test.ts` 129–135. Unknown keys → `unrecognized_key` (`interview.test.ts` 116–127). |
| **[SEC] (added)** XSS: wizard and dashboard copy render answers as React text nodes / PrimeReact children only. **No** `dangerouslySetInnerHTML`, markdown-to-HTML, or `innerHTML` from answers | **PASS** | See free-text SEC above. Dashboard CTA is a Link label, not answers (`DashboardView.tsx` 56–58; `dashboard/page.tsx` 15). Answers never in `href`/`src`/CSS. |
| **[SEC] (added)** Parameterized jsonb writes only. Answers bound as JSON/jsonb values — never string-concatenated into SQL | **PASS** | Supabase `.insert({ answers })` / `.update({ answers })` (`persist-interview-draft.ts` 80–81, 114–118; `get-or-create-interview-draft.ts` 54–60). No string-built SQL in `lib/interview`. |
| **[SEC] (added)** RLS enabled on `neuramark_interview_sessions`, deny-by-default, zero named policies. No browser ownership policies. Service-role Node only | **PASS** | Migration `ENABLE ROW LEVEL SECURITY` + comment “Zero policies” (`20260829010000_neuramark_interview_sessions.sql` 49–51). No `CREATE POLICY` in repo for this table. Writes via `createServerSupabaseClient()` (`lib/supabase/server.ts` 1, 15–31, `import "server-only"`). No `@supabase/supabase-js` in `components/interview` or interview Client Components. |
| **[SEC] (added)** DB CHECK `octet_length(answers::text) <= 81920` (80 KiB) as a backstop above the 64 KiB app gate. App still rejects at 65536 with 413 before insert/update | **PASS** | Constraint `neuramark_interview_sessions_answers_size_check` (`migration` 37–38). App 64 KiB first (`persist-interview-draft.ts` 201–202). CHECK violation → `INTERNAL_ERROR`, not 413 (`persist-interview-draft.ts` 90–93, 256–257). |
| **[SEC] (added)** Product HTML for `/interview` sends `Cache-Control: no-store` (extend `next.config.ts` headers like `/dashboard`). `force-dynamic` on the page or parent `(app)` layout | **PASS** | `next.config.ts` 28–35 (`/interview` and `/interview/:path*`). `export const dynamic = "force-dynamic"` on `app/(app)/layout.tsx` 5, `interview/layout.tsx` 7, `interview/page.tsx` 7. Persist `revalidatePath("/interview")` (`persist-interview-draft.ts` 236). |
| **[SEC] (added)** Minimal load shape for the wizard: `current_step`, `answers`, `status` (always `draft` here). Do not return other tenants’ rows, Auth tokens, `auth_user_id`, `role`, or service-role error internals. Prefer omitting session `id` from client props | **PASS** | SELECT list is `current_step, answers, status` only (`get-or-create-interview-draft.ts` 24; `persist-interview-draft.ts` 60). `toInterviewDraftView` emits `currentStep`, `answers`, `status` (`merge-answers.ts` 205–209). Page passes that object only (`interview/page.tsx` 30–34). Test asserts no `id` / `client_id` (`interview.test.ts` 224–233). Load errors throw generic “Interview draft unavailable”; page shows `interview.errors.internal` (`interview/page.tsx` 47–52). |
| **[SEC] (added)** `current_step` is an allowlisted enum of the seven storage keys. DB CHECK or enum. Never used to build file paths or dynamic imports | **PASS** | DB enum `neuramark_interview_step` (`migration` 7–15, column 32). Zod `interviewStepKeySchema` (`lib/contracts/interview.ts` 15–23). Resume cursor uses `INTERVIEW_STEP_ORDER` (`merge-answers.ts` 131–139). FE `key={viewStep}` is a React list key, not a dynamic import (`InterviewWizard.tsx` 352). |
| **[SEC] (added)** Do not log `answers` bodies (or full persist payloads) in production logs / error telemetry | **PASS** | Interview logs are codes / static strings only (`get-or-create-interview-draft.ts` 29, 44, 68, 75–77; `persist-interview-draft.ts` 65, 92, 95, 139, 142, 179, 259–261). No `answers` or raw input in `console.*`. |

---

### Convention Compliance

| Rule | Status | Evidence |
|------|--------|----------|
| EN + ES for user-facing strings | **PASS** | Parallel `interview.*` and `dashboard.interviewCard` in `messages/en.json` / `es.json`. Canonical **Initial interview** / **Entrevista inicial**. |
| Server Components by default; `"use client"` only where justified | **PASS** | RSC page/layout/loading. Client: wizard, step fields, completed view, loading spinner (interactivity / PrimeReact). |
| PrimeReact-first | **PASS WITH NOTE** | `Steps`, `Button`, `Message`, `InputText`, `InputTextarea`, `ProgressSpinner`, dashboard `Card`. List items are a small custom chip row (`InterviewStepFields.tsx` 125–163) instead of PrimeReact `Chips` — justified enough not to fail AC. |
| Loading / empty / error / pending | **PASS** | `loading.tsx` + `InterviewLoading`; empty intro banner (`InterviewWizard.tsx` 57–60); load error `InterviewErrorState` (`page.tsx` 47–52); save `pending` / `loading` on Button (`387–389`); 400 field errors, 413/generic banners (`228–251`). Unauthenticated: `(app)` + interview layout `requireActive("page")`. |
| No client Supabase / keys; identity via `getCurrentUser()` / `requireActive()` | **PASS** | Supabase only in server modules. Persist/load call `requireActive`. Hardcoded-user seam is US-14.5 (unchanged). |
| Backend endpoints map to a concrete FE consumer | **PASS** | RSC load → `/interview` page; Server Action → `InterviewWizard`. Dashboard is Link-only (`dashboard/page.tsx` 15). No public interview API. |
| `neuramark_` prefix | **PASS** | Table, enums, unique index, trigger, CHECK, function `neuramark_set_updated_at` in the migration. |
| `no-store` on `/interview` | **PASS** | `next.config.ts` 28–35. |
| Auth allowlist unchanged except “must not add `/interview`” | **PASS** | `lib/auth/public-routes.ts` unchanged set; test asserts private (`session-guards.test.ts` 107). |
| Contract shapes (persist + get-or-create, 413/400, strip `client_id`, reject `status`, UPDATE draft, unique `client_id`, RLS zero) | **PASS** | Matches Frozen CONTRACT: `InterviewDraftView` / `persistInterviewDraft` envelopes (`lib/contracts/interview.ts`, `errors.ts`); strip vs `FORBIDDEN_FIELDS` (`merge-answers.ts` 13–54); unique index (`migration` 41–42). |

**Dependencies:** USER_STORIES says Depends on: none. Runtime US-14.5 (`requireActive`, `(app)` layout, `neuramark_clients`) is present and used; not assumed away.

---

### Gaps (what blocks PASS)

**None.** No in-scope AC is unmet.

---

### Scope Creep

Nothing that violates the story split:

- **InterviewCompletedView** — CONTRACT FE notes: treat unexpected `status: "completed"` as non-editable; persist `409 CONFLICT` without inventing submit. Not US-1.3 Ficha viva / `completed` write.
- **No** `neuramark_business_profiles`, submit CTA, or `status = 'completed'` write path.
- **No** dashboard resume prompt / “Save & continue later” (US-1.2). Last-step button is **Save** / **Guardar** (persist draft).
- Extra `no-store` source `/interview/:path*` is harmless (no nested interview routes).

---

### Notes (do not fail)

1. **Live E2E not run** by this validator (browser wizard, refresh restore against a real DB, 413/409 over the wire). Unit tests 28/28 cover contract helpers, Zod, strip/reject, write predicate, and `isPublicPath("/interview")`.
2. **`persistInterviewDraft` / `getOrCreateInterviewDraft` are not integration-tested** with a mocked Supabase client; TASKS “happy-path create/load/update” is implemented in production code and covered at the helper layer.
3. **`step-helpers.ts` value-imports `INTERVIEW_STEP_ORDER`** from `lib/contracts/interview.ts`. CONTRACT prefers FE types-only; this does not weaken server Zod or expose secrets.
4. Migration file exists; applying it to a live project was not part of this gate.

---

### Recommended Next Actions (and which agent should take them)

1. **product-owner** — Check US-1.1 boxes in `plan/USER_STORIES.md` (validator does not).
2. **Orchestrator** — Proceed to QA gate (`QA.md`).
3. **nextjs-frontend** (US-1.2) — Dashboard resume prompt + “Save & continue later”; do not weaken the `status = 'draft'` write predicate.
4. **nextjs-backend** (US-1.3) — Submit / `completed` / Ficha viva only.

No implementer fix loop is required for this story.
