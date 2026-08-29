# Validation Report — US-1.2

**Story:** Save and resume interview  
**Validator:** requirements-validator  
**Date:** 2026-08-29  
**Branch:** `feature/US-1.2-save-resume-interview`  
**Commits reviewed:** `37f1f81` (FE), `9abfb90` (BE), `aacd156` (artifacts)  
**Contract:** Frozen, Reviewed by FE (2026-08-29)  
**SPEC-REVIEW:** ALIGNED  
**SECURITY:** APPROVE WITH CONDITIONS (binding freeze encoded in CONTRACT)  
**Tests re-run:** `npx tsx --test lib/interview/interview.test.ts` → **24/24 pass**  
**Live browser / DB E2E:** **Not run** this gate (code + unit evidence only)

---

### Verdict: PASS WITH NOTES

All five USER_STORIES acceptance criteria and the SECURITY.md `[SEC]` floors for US-1.2 (story + added) are met in the implementation. Residual notes: no live browser/session E2E; completed-write rejection is proven via draft-predicate helpers + `UPDATE … AND status = 'draft'` wiring rather than a full mocked Server Action integration suite; Operator reopen is SQL/ops-documented only (CONTRACT), which matches the V1 freeze.

Do **not** treat missing US-1.3 submit / write `completed` / **Ficha viva** as failures.

On PASS, the product-owner — not this validator — checks the story’s acceptance criteria in `plan/USER_STORIES.md`.

---

### Acceptance Criteria

Criteria 1–5 are verbatim from `plan/USER_STORIES.md` § US-1.2. Criteria 6–16 are SECURITY.md `[SEC]` items (inherited re-asserted for 1.2 surfaces + story `[SEC]` + **(added)**).

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Returning client sees incomplete interview prompt on dashboard | **PASS** | RSC `getInterviewDashboardSummary()` (`lib/interview/get-interview-dashboard-summary.ts` 16–40) → `buildInterviewCard` Resume branch when `status === "draft" && hasProgress` (`app/(app)/dashboard/page.tsx` 61–69): `resumeBody` with `{step}` + `resumeCta` → `/interview`. Empty/no-progress keeps Start (`43–49`). EN/ES: `messages/en.json` 10–11, `messages/es.json` 10–11. Unit: `interview.test.ts` 287–302, 346–357. |
| Draft survives page refresh and new browser session | **PASS** (code; E2E not run) | Source of truth = Postgres row + auth cookie. Persist writes answers/`current_step` (`persist-interview-draft.ts` 72–88, 236–241). Refresh/resume load: `getOrCreateInterviewDraft` SELECT by `user.id` (`get-or-create-interview-draft.ts` 40–50) → wizard initial state (`app/(app)/interview/page.tsx` 26–34, `InterviewWizard.tsx` 55–59). No `localStorage` / `sessionStorage` anywhere in app TS/TSX. Dashboard after leave: `revalidatePath('/dashboard')` (`persist-interview-draft.ts` 236–237) + `Cache-Control: no-store` (`next.config.ts` 21–34). Continuity after new browser session requires same activated auth user (US-14.5) — not live-verified here. |
| Completed interviews are read-only unless operator reopens | **PASS** | FE: `status === "completed"` → `InterviewCompletedView` only; no Next / Save / Save & continue later (`InterviewWizard.tsx` 68, 312–326; `InterviewCompletedView.tsx` 36–103). Dashboard completed card: view-only CTA, no edit/resume-as-draft (`dashboard/page.tsx` 52–58). No Cliente reopen UI/action in codebase. Operator reopen: SQL/ops only in CONTRACT (`CONTRACT.md` 300–314); no app `completed` → `draft` write path. |
| **[SEC]** Read-only enforcement for `completed` sessions happens server-side: mutation endpoints/Server Actions reject writes to completed sessions regardless of what the UI allows | **PASS** | Pre-write: `decideDraftWrite({ status: "completed" })` → `"conflict"` (`merge-answers.ts` 152–170; `persist-interview-draft.ts` 184–189). DB: `UPDATE … .eq("client_id").eq("status", "draft")`; zero rows → conflict (`persist-interview-draft.ts` 78–100, 232–233). Unique-race on completed also conflicts (`123–130`). Client `status` rejected as `FORBIDDEN_FIELDS` (`166–168`; `interview.test.ts` 197–211). Envelope `CONFLICT` (`interview.test.ts` 214–227). Save & continue later reuses the same action (`InterviewWizard.tsx` 305–309, 274–277). This story never writes `status = 'completed'`. |
| **[SEC]** Resume loads the draft by the server-resolved current user only; a session ID supplied by the client is validated to belong to that user (IDOR guard for future multi-tenancy) | **PASS** (strip-primary per CONTRACT) | Primary load: `requireActive` + `WHERE client_id = user.id` — no session id in URL (`get-or-create-interview-draft.ts` 40–50; `app/(app)/interview/page.tsx`; no `interview/[id]`). Dashboard helper: zero arity, no `client_id`/session params (`get-interview-dashboard-summary.ts` 16–30; `interview.test.ts` 379–410). Persist: strip `id` / `session_id` / `sessionId` / `client_id` / `clientId` before parse; never used in queries (`merge-answers.ts` 42–55; `persist-interview-draft.ts` 170; `interview.test.ts` 169–195). Draft/summary views omit `id` / `client_id` (`interview.test.ts` 229–238, 304–324). CONTRACT freeze: strip-and-ignore satisfies USER_STORIES IDOR AC when foreign ids are never used. |
| **[SEC] (inherited)** All interview answers are re-validated server-side against a typed schema (Zod); client-side validation is presentation only | **PASS** | Same persist path: Zod input + merged stored schema (`persist-interview-draft.ts` 171–198). Save & continue later calls the same action with the same payload shape (`InterviewWizard.tsx` 259–309) — no weaker soft-save. Client `validateCurrentStep` is presentation-only gate (`113–136`, 264–268). |
| **[SEC] (inherited)** Interview sessions are created and loaded only for the client resolved via server-side `getCurrentUser()`; no `client_id` accepted from the request body or query string | **PASS** | Dashboard + load + persist all scope to `requireActive` / `user.id` (`get-interview-dashboard-summary.ts` 17, 30; `get-or-create-interview-draft.ts` 41, 48; `persist-interview-draft.ts` 157–158, 85–86). Strip identity keys on persist. |
| **[SEC] (inherited)** Total `answers` JSON payload rejected above 64 KiB with 413 / `PAYLOAD_TOO_LARGE` | **PASS** | Unchanged gate on persist (`persist-interview-draft.ts` 201–202; `interview.test.ts` 143–157). |
| **[SEC] (inherited)** Free-text answers are stored as data and always rendered escaped | **PASS** | React text nodes / PrimeReact `text` / `<li>{item}</li>` (`InterviewCompletedView.tsx` 91–120; dashboard step label via string replace — `dashboard/page.tsx` 62–66). No `dangerouslySetInnerHTML` in interview/dashboard. |
| **[SEC] (added)** Every draft write path uses `UPDATE … WHERE client_id = $server AND status = 'draft'` (or INSERT new draft). Zero rows on completed → **409**. No blind UPSERT. Never writes `completed` in this story | **PASS** | See completed-write evidence above. Only mutation is `persistInterviewDraft`. INSERT hardcodes `status: "draft"` (`persist-interview-draft.ts` 114–117). |
| **[SEC] (added)** Dashboard interview summary loaded only for `getCurrentUser().id` / `requireActive()`; helper accepts no `client_id` / session id; failed load must not leak other tenants | **PASS** | `getInterviewDashboardSummary` arity 0; `.eq("client_id", user.id)` (`get-interview-dashboard-summary.ts` 16–31). Dashboard catch → card `error` flag only (`dashboard/page.tsx` 81–88, 34–40) — no cross-tenant data. |
| **[SEC] (added)** Dashboard payload minimal: `status`, `currentStep`, `hasProgress`; omit `answers`, session UUID, auth internals | **PASS** | `toDashboardSummary` / schema (`merge-answers.ts` 249–261; `lib/contracts/interview.ts` 144–157). Tests assert no `answers`/`id`/`client_id` (`interview.test.ts` 269–324). SELECT reads answers only for `hasProgress` compute (`get-interview-dashboard-summary.ts` 28–29). |
| **[SEC] (added)** Dashboard helper must not get-or-create | **PASS** | SELECT-only; no INSERT (`get-interview-dashboard-summary.ts` 12–14, 27–40). No row → `null` (`summarizeInterviewSessionRow` `merge-answers.ts` 268–276). |
| **[SEC] (added)** Save & continue later uses same current-step validation as advance; no weaker soft-save; invalid → stay on step | **PASS** | Shared `runPersist("leave")` → same client validate + `persistInterviewDraft`; navigate only if `ok` (`InterviewWizard.tsx` 259–309). Invalid → `handlePersistFailure`, no `router.push`. |
| **[SEC] (added)** Primary resume URL remains `/interview` with no session id; no `/interview/[id]` | **PASS** | Only `app/(app)/interview/page.tsx` (+ layout/loading). Glob: no `[id]` segment. |
| **[SEC] (added)** Client-supplied id keys: strip on persist; foreign ids must not leak | **PASS** | Strip set + tests (`merge-answers.ts` 23–55; `interview.test.ts` 169–195). No accept-id load surface. |
| **[SEC] (added)** Draft continuity uses DB + auth cookie — not browser storage as source of truth | **PASS** | No localStorage/sessionStorage usage in codebase for interview. Persist + RSC load only. |
| **[SEC] (added)** Operator reopen V1 is SQL/ops only; no Cliente reopen; no Server Action `completed` → `draft` | **PASS** | CONTRACT ops SQL (`CONTRACT.md` 300–314). Grep: no reopen action under `lib/interview`. |
| **[SEC] (added)** `revalidatePath('/dashboard')` and `revalidatePath('/interview')` on successful persist | **PASS** | `persist-interview-draft.ts` 236–237. |
| **[SEC] (added)** XSS bar: dashboard progress labels / answers as React text; no `dangerouslySetInnerHTML` | **PASS** | As above. |
| **[SEC] (added)** Do not log `answers` bodies in production | **PASS** | Persist/dashboard errors log `code` only (`persist-interview-draft.ts` 65–66, 92–96; `get-interview-dashboard-summary.ts` 34–36). |

---

### Convention Compliance

| Convention | Status | Evidence |
|------------|--------|----------|
| EN + ES user-facing copy | **PASS** | `saveAndContinueLater`, resume/completed card keys, completed interview copy in `messages/en.json` + `es.json`. Interview titles: “Initial interview” / “Entrevista inicial”. |
| Server Components by default; `"use client"` justified | **PASS** | Dashboard/interview pages are RSC; `InterviewWizard` / `DashboardView` / `InterviewCompletedView` are client for interactivity. |
| PrimeReact-first | **PASS** | Button, Message, Steps, Card (`InterviewWizard.tsx`, `DashboardView.tsx`, `InterviewCompletedView.tsx`). |
| Loading / empty / error / pending | **PASS** | Interview `loading.tsx`; wizard empty intro banner; persist pending modes; dashboard interview `loadError` card; completed read-only messaging. |
| Auth: Server Actions + httpOnly cookies; identity via `requireActive` / `getCurrentUser` | **PASS** | No browser Supabase auth SDK on interview surfaces; persist is `"use server"`; helpers `import "server-only"`. |
| Backend surfaces have FE consumers | **PASS** | `getInterviewDashboardSummary` → dashboard card; `persistInterviewDraft` → Next + Save & continue later; `getOrCreateInterviewDraft` → `/interview`. |
| Contract shapes honored | **PASS** | `InterviewDashboardSummary` matches freeze; no answers on dashboard; strip/reject keys; revalidate both paths. |
| Dependency US-1.1 | **PASS** | US-1.1 CLOSED (`plan/stories/US-1.1/`); 1.2 extends modules rather than forking. |
| Terminology (CONTEXT) | **PASS** (interview surfaces) | Interview card/wizard use Entrevista inicial / Initial interview. Dashboard placeholder `profileCard` still says “Business profile” / “Perfil del negocio” — pre-existing US-X.1/US-2.x stub, not introduced by 1.2 interview work; not a story AC fail. |

---

### Gaps (what blocks PASS)

**None that block PASS.** Notes only:

1. **Live E2E not run** — refresh + logout/login + dashboard Resume + Save & continue later + completed 409 were not exercised in a real browser/DB this gate.
2. **Completed mutation coverage** — unit tests cover `decideDraftWrite` / conflict envelope and UPDATE predicate wiring; there is no mocked end-to-end Server Action test that stubs Supabase returning a completed row through `persistInterviewDraftInner`.

---

### Scope Creep

**None material.** Implementation stays within CONTRACT: Save & continue later, dashboard Start/Resume/completed, dashboard summary helper, `revalidatePath('/dashboard')`, completed read-only UX, IDOR strip policy. No submit / `status = completed` write / **Ficha viva** / Cliente reopen / `/interview/[id]` / auth redesign / full US-X.1 aggregator.

---

### Recommended Next Actions (and which agent should take them)

1. **product-owner** — At CLOSE, check US-1.2 AC boxes in `plan/USER_STORIES.md` (validator does not).
2. **qa-engineer** — Run QA gate; prefer a short live path: draft progress → Save & continue later → dashboard Resume → refresh `/interview` → (if a completed row can be SQL-set) confirm UI read-only + persist 409.
3. **orchestrator** — Proceed to QA; no BUILD re-delegation required for AC gaps.

---

### Runtime note

Validator did **not** start the Next.js app or hit Supabase. Continuity AC and completed-write AC are satisfied by static code + unit tests; live confirmation is deferred to QA.
