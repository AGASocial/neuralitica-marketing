# US-1.2 — Save and resume interview

**Priority:** P0  
**Depends on:** US-1.1 ✅ CLOSED (`plan/stories/US-1.1/`) · runtime US-14.5 (`getCurrentUser()` / `requireActive()`, `(app)` layout)  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-1.2 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** nextjs-backend + nextjs-frontend (`docs/development/AGENT-ROSTER.md` Fase 1). No content/media/integrations specialist.  
**Canonical terms:** **Entrevista inicial** · Role: **Cliente** / **Operator**. **Ficha viva** is US-1.3 only.

## Out of scope (do not implement here)

- **US-1.1 rebuild:** seven-step wizard, Zod answers shapes, get-or-create draft, persist-on-advance, refresh restore, Start CTA wiring, migration for `neuramark_interview_sessions` / status enum — **already shipped**. Extend, do not fork.
- **US-1.3:** submit / completeness validation / write `status = completed` / create or update **Ficha viva** / `source_interview_id` / success → profile review. Despite the USER_STORIES BE work table wording “mark `completed` when submitted”, **this story does not own that write** — US-1.3 does.
- **US-2.x / US-X.1 full dashboard:** profile pages; full dashboard aggregator (approvals, weekly Reels). Only the interview incomplete / resume prompt slice.
- Cliente reopening a completed Entrevista at will (SPEC Fuera V1).
- Auth changes: do **not** edit signup/login/logout/reset, `requireActive()` semantics, or add `/interview` to `isPublicPath`.
- `@supabase/supabase-js` in Client Components; `client_id` from body/query/headers as identity.

## Scope split vs US-1.1 / US-1.3

| Concern | Owner |
|---------|--------|
| Persist draft + wizard + survive refresh | **US-1.1** (done) |
| Explicit **Save & continue later**; dashboard **incomplete** prompt; show resume cursor; completed **read-only** UX; IDOR if session id supplied | **US-1.2** (this story) |
| Submit → `completed` + **Ficha viva** | **US-1.3** |

US-1.2 AC “Draft survives page refresh and new browser session” is largely satisfied by 1.1 DB persist + session cookies. This story must **prove** continuity (no localStorage-only draft) and surface resume from the dashboard after a new session.

## PO decisions (freeze in CONTRACT unless SECURITY vetoes)

| Topic | Decision |
|-------|----------|
| Resume identity | **Primary path:** load draft by `getCurrentUser().id` only (same as US-1.1). Keep `/interview` **without** session id in path/query as the Cliente resume URL. |
| Session id / IDOR | If any surface accepts `id` / `session_id` / `sessionId` (body, query, future deep-link): **validate ownership** (`row.client_id === user.id`) before returning data, or **strip and ignore** and load by user. Never return another Cliente’s row. Prefer **404/empty** over 403 for foreign ids (CONTRACT/SECURITY pick). Do **not** introduce `/interview/[id]` unless SECURITY requires it. |
| Save & continue later | Explicit control on the wizard: persist current progress via existing `persistInterviewDraft` (or a thin wrapper), then navigate to **dashboard**. Soft-save of an **invalid** current step is an open question — default recommendation: same advance-rule gate as Next; if invalid, show errors and stay on the step (do not navigate). |
| Dashboard incomplete prompt | Show when the current Cliente has a row with `status = 'draft'` **and** meaningful progress (PO default: any of — `current_step` ≠ first step, **or** at least one step key present in `answers`). No row / empty first-visit draft → keep existing **Start** CTA (US-1.1). `status = 'completed'` → **not** an incomplete prompt; show completed / view-only entry (no edit). |
| Last completed step | Display the server `current_step` resume cursor (US-1.1 high-water) with EN/ES step labels — product copy may say “last progress” / “continue from …”. Do not invent a second cursor. |
| Completed read-only | Cliente: FE must not offer edit/persist controls when `status = 'completed'` (extend `InterviewCompletedView`). **Server** remains the authority: all draft write paths keep `UPDATE … AND status = 'draft'` → **409** (already in 1.1); add tests/coverage if gaps. Cliente cannot set `status` from the request. |
| Mark `completed` | **Out of scope** — US-1.3. This story may **read** `status` for UI and enforce no writes when completed. |
| Operator reopen | SPEC: completed read-only **salvo Operator**. PO default for V1: **document SQL reopen** (`UPDATE … SET status = 'draft' WHERE …`) as acceptable exception path **or** a single `requireOperator()` Server Action — SECURITY chooses. **No** Cliente-facing reopen. Full Operator interview console is out of scope. |
| Cardinality / URL | Unchanged from US-1.1: one row per Cliente; `/interview` under `(app)`. |
| Auth / cache | `requireActive` on loaders/actions; `Cache-Control: no-store` already on `/interview` and dashboard; `revalidatePath('/dashboard')` (and `/interview`) when persist / save-and-leave updates progress so the incomplete prompt stays fresh. |

## Carry-forwards / reuse (do not reinvent)

- [ ] Reuse `getOrCreateInterviewDraft`, `persistInterviewDraft`, `lib/contracts/interview.ts`, `InterviewWizard`, `InterviewCompletedView`.
- [ ] Dashboard: extend `app/(app)/dashboard/page.tsx` + `DashboardView` / `interviewCard` — today Start link only; add incomplete / completed variants.
- [ ] RLS deny-by-default + service-role server-only — unchanged.
- [ ] Do **not** change auth code paths beyond necessary `revalidatePath` / copy.

---

## FE checklist

Concrete BE consumers: dashboard RSC needs interview status summary for current user; wizard uses existing persist (+ optional save-and-leave wrapper); completed view stays read-only.

- [x] **Save & continue later** control on the Entrevista wizard (distinct from step **Next** / last-step **Save**). EN/ES labels; pending/error states. On success → navigate to `/dashboard` (do not invent submit / Ficha viva).
- [x] Persist behavior aligned with PO decision (default: same validation as persist/advance; block navigate if invalid). CONTRACT freezes exact action signature.
- [x] **Dashboard incomplete prompt** when draft is in progress: clear CTA to resume `/interview`; show **last progress** using `current_step` (EN/ES step name). Empty / not-started keeps Start CTA from US-1.1.
- [x] **Completed** state on dashboard and `/interview`: no edit / Save & continue later / step Next. Reuse or extend `InterviewCompletedView`. No Cliente “reopen” control.
- [x] Loading / empty / error for dashboard interview slice (failed status load must not crash the whole dashboard).
- [x] EN + ES in `messages/en.json` / `es.json`. Canonical **Entrevista inicial** / **Initial interview**. Avoid CONTEXT _Evitar_ terms.
- [x] No Supabase in Client Components; no `client_id` or session UUID required in the resume URL for the happy path.
- [x] Free-text / step labels rendered as escaped text only (same XSS bar as US-1.1).

---

## BE checklist

Concrete FE consumers: dashboard incomplete/completed prompt; wizard Save & continue later; `/interview` completed read-only (already partially present).

- [ ] **Interview status for dashboard:** server helper (RSC-callable) returns a minimal summary for `requireActive()` user only — e.g. `{ status, currentStep, hasProgress }` (exact shape in CONTRACT). **No** `client_id` parameter. Prefer omit raw `answers` from the dashboard payload (not needed for the prompt).
- [ ] Do **not** get-or-create a draft solely to render the dashboard card (avoid creating empty rows on every dashboard hit). If no row → “not started”.
- [ ] **Save & continue later:** reuse `persistInterviewDraft` or a thin Server Action wrapper that persists then returns ok for FE navigation; still `requireActive("handler")`; still reject `status` / privilege fields; still `UPDATE … AND status = 'draft'`.
- [ ] **Completed read-only (server):** confirm every write path rejects completed (409). Add automated coverage if US-1.1 left gaps (e.g. mocked action with completed row). No client-supplied `status` flip to unlock writes.
- [ ] **[SEC] IDOR:** any accepted session id is ownership-checked against `getCurrentUser().id`; foreign id → not found / empty (CONTRACT code). Primary load remains by user id. Strip unused id keys consistently with US-1.1 unless CONTRACT switches a surface to validate-and-use.
- [ ] CSRF: Server Actions only for mutations (same class as US-1.1). No public interview Route Handler required.
- [ ] `revalidatePath('/dashboard')` and `/interview` on successful persist / save-and-leave so the incomplete prompt updates.
- [ ] Automated tests: dashboard summary scoped to current user; no row → not started; draft+progress → incomplete; completed → read-only summary; persist on completed → 409; foreign session id (if accepted) does not leak; Save & continue later happy path.

---

## DB checklist

All objects keep `neuramark_` prefix.

- [ ] **Verify** enum `neuramark_interview_session_status` (`draft` \| `completed`) and table `neuramark_interview_sessions` from US-1.1 — **no duplicate migration** unless SECURITY requires new objects.
- [ ] No schema change required for dashboard read of `status` + `current_step`.
- [ ] If Operator reopen is an in-app action: SECURITY/CONTRACT decide whether a new audit table/column is required; otherwise **SQL-only reopen** needs **no** migration (document in SECURITY / ops note).
- [ ] Still no `neuramark_business_profiles` in this story.

---

## Gates (orchestrator)

- [ ] SPEC-REVIEW.md (spec-guardian — Interview Builder “guardar borrador y retomar” + completed read-only salvo Operator)
- [ ] SECURITY.md (security-architect)
- [x] CONTRACT.md + FE signoff (nextjs-backend → nextjs-frontend) — Frozen 2026-08-29 (`Reviewed by FE: yes`)
- [ ] BUILD (FE + BE)
- [ ] VALIDATION.md
- [ ] QA.md

**PREP complete when:** `README.md` + this `TASKS.md` exist; AC in `USER_STORIES.md` remain unchecked; no CONTRACT/SECURITY/code from PO.

---

## Open questions (block SPEC/SECURITY/CONTRACT if unresolved)

1. **Operator reopen mechanism** — SQL-only vs `requireOperator()` Server Action (with/without audit row)? Blocks SECURITY floor and whether DB work exists. PO lean: SQL-only acceptable for V1 if documented; in-app Operator action only if SECURITY wants an auditable app path.
2. **Save & continue later vs incomplete current step** — Require advance-rule validation (PO default) vs soft-save partial fields? Blocks CONTRACT persist semantics and FE copy.
3. **“Meaningful progress” for dashboard prompt** — PO default above (`current_step` past first **or** any answers key). Spec-guardian / CONTRACT confirm edge case: empty draft created on first `/interview` visit then Cliente leaves without saving a step — Start vs Resume?
4. **Session id on the wire** — Keep strip-and-ignore (US-1.1) and satisfy IDOR AC via tests that prove ids are never used, **or** add an optional validate-ownership path? SECURITY decides; product UX must not depend on client-supplied ids.
5. **Completed dashboard entry** — Link to read-only `/interview` vs static “Completed” badge with no navigation? UX only; not a SPEC conflict.
6. **USER_STORIES BE “mark completed when submitted”** — Confirmed out of scope here (US-1.3). No SPEC amendment needed if CONTRACT states 1.2 never writes `completed`.

No known SPEC vs USER_STORIES conflict requiring an amendment before PREP handoff: SPEC “guardar borrador y retomar” + `draft`\|`completed` read-only salvo Operator maps to this story; submit → Ficha viva remains US-1.3; Cliente reopen-at-will remains Fuera V1.
