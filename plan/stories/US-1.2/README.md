# US-1.2 — Save and resume interview

**Status:** CLOSED — VALIDATE PASS WITH NOTES; QA APPROVE WITH NOTES (5/5 AC; FE `37f1f81`, BE `9abfb90`).

Cliente pauses the **Entrevista inicial** and continues later: explicit **Save & continue later**, dashboard **incomplete interview** prompt (with last progress / resume cursor), draft continuity across refresh and new browser sessions, and **completed** sessions treated as read-only (server-enforced) unless an Operator reopens.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-1.2 (do not redefine; do **not** mark done in PREP)

**This folder:** [`plan/stories/US-1.2/`](./) — `TASKS.md`, `SPEC-REVIEW.md`, `SECURITY.md`, `CONTRACT.md` (**Frozen** — FE signed off 2026-08-29).

**Depends on:** [US-1.1](../US-1.1/) ✅ CLOSED — wizard, draft persist, `neuramark_interview_sessions`, enum `draft` \| `completed`, load-by-current-user `/interview`, `UPDATE … AND status = 'draft'` (409 on completed). Runtime identity: [US-14.5](../US-14.5/) (`getCurrentUser()` / `requireActive()`).

**Unblocks:** Clearer onboarding path into [US-1.3](../../USER_STORIES.md) (submit → **Ficha viva**). Does **not** implement submit or profile creation.

---

## Scope in

| Area | What 1.2 adds |
|------|----------------|
| **FE** | Explicit **Save & continue later** (persist + leave wizard → dashboard). Dashboard **incomplete Entrevista** prompt when a draft is in progress; show last progress via resume cursor (`current_step`). Completed session UX is clearly read-only (no edit path for Cliente). EN/ES. |
| **BE** | Dashboard (or shared helper) loads interview status for the **server-resolved** Cliente. Harden / document completed **read-only** on all write paths (reuse 1.1 draft predicate). If a session id appears on any load/resume surface, **ownership-check** it (IDOR) or strip and load by user only. `revalidatePath` dashboard when draft progress changes as needed. |
| **DB** | Enum `draft` \| `completed` **already shipped in US-1.1** — verify only unless SECURITY requires a new migration (e.g. Operator reopen audit). No `business_profiles` work. |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **US-1.1 (done)** | Wizard steps, Zod answers schema, get-or-create draft, persist on step advance, refresh restore, Start CTA → `/interview`, table/enum/RLS. Do **not** rebuild. |
| **US-1.3** | Submit, server completeness gate, write `status = completed`, enqueue/create **Ficha viva**, success redirect to profile review, `source_interview_id`. USER_STORIES BE line “mark `completed` when submitted” is **US-1.3**, not this PREP. |
| **US-2.x** | Ficha viva UI / PATCH / agent contract. |
| **Cliente reopen at will** | SPEC Fuera V1 — Cliente cannot reopen a completed Entrevista. |
| **Auth redesign** | Do not edit `lib/auth/*` allowlist / signup / login; keep `/interview` off `isPublicPath`. |
| Full **US-X.1** dashboard aggregator | Only the interview incomplete / resume prompt slice; not pending approvals or weekly Reels cards. |

## What US-1.1 already shipped (do not duplicate)

From `plan/stories/US-1.1/` (CONTRACT / VALIDATION / QA):

- One row per Cliente (`UNIQUE (client_id)`); URL `/interview` with **no** session id in path/query.
- `getOrCreateInterviewDraft` + `persistInterviewDraft`; high-water `current_step` resume cursor.
- Writes only when `status = 'draft'`; completed → **409 CONFLICT**; `status` never accepted from the client.
- `InterviewCompletedView` for unexpected `completed` load (non-editable); last-step button is Save draft, not submit.
- Dashboard card is a **Start** link only — **no** “incomplete interview” prompt yet.

## Dependency notes

- Prefer **extend** 1.1 modules (`lib/interview/*`, `components/interview/*`, dashboard RSC) over parallel APIs.
- Primary resume identity remains **current user**, not a client-trusted session UUID. IDOR AC = guard **if** an id is supplied (CONTRACT freezes strip vs validate).
- Operator reopen is SPEC-allowed; ship shape TBD in SECURITY/CONTRACT (see open questions in `TASKS.md`).

## Canonical terms (CONTEXT)

Use **Entrevista inicial**, **Cliente**, **Operator**. Avoid: onboarding interview, cuestionario, admin / administrador / staff, Business Profile / perfil de negocio (use **Ficha viva** only when naming US-1.3 out-of-scope).
