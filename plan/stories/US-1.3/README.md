# US-1.3 — Submit interview for profile generation

**Status:** PREP — SELECTED (`feature/US-1.3-submit-interview-profile`). AC unchecked until requirements-validator.

**As a** System, **I want** a completed Entrevista inicial to trigger Ficha viva creation, **so that** downstream agents have canonical context.

Cliente submits a complete Entrevista: server validates completeness → upserts `neuramark_business_profiles` → marks session `completed` (only after successful profile write) → links session ↔ profile via `source_interview_id`. FE shows success and redirects to a **minimal stub/success route** for “profile review” until [US-2.1](../../USER_STORIES.md) ships the full Ficha viva page.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-1.3 (do not redefine; do **not** mark done in PREP)

**This folder:** [`plan/stories/US-1.3/`](./) — `TASKS.md` (this PREP). `SECURITY.md` and `CONTRACT.md` are authored in later gates, not here.

**Depends on:** [US-1.1](../US-1.1/) ✅ CLOSED · [US-1.2](../US-1.2/) ✅ CLOSED · runtime [US-14.5](../US-14.5/) (`getCurrentUser()` / `requireActive()`).

**Does not depend on US-2.1.** Circular dependency broken by orchestrator: US-1.3 goes first (creates/updates profile + stub review UX); US-2.1 still Depends on US-1.3 and owns the full read-only Ficha viva UI.

**Unblocks:** [US-2.1](../../USER_STORIES.md) (view Ficha viva) · downstream US-2.2 / US-2.3.

---

## Scope in

| Area | What 1.3 adds |
|------|----------------|
| **FE** | Submit CTA on last Entrevista step (or dedicated submit control); pending/error/field-level errors; **success confirmation**; redirect to **stub/success route** (not full Ficha viva page). EN/ES. |
| **BE** | Submit Server Action: completeness Zod (all seven steps) → upsert Ficha viva from answers → set `status = 'completed'` **only after** successful profile write; never accept client `status`; idempotent double-submit. |
| **DB** | Create `neuramark_business_profiles` (+ `source_interview_id` FK to interview session, **UNIQUE** for idempotency; `client_id`, fields/version/`updated_at` as CONTRACT freezes). |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **US-1.1 / US-1.2 (done)** | Wizard, draft persist, Save & continue later, dashboard resume, completed read-only on draft writes. Extend; do not rebuild. |
| **US-2.1 full Ficha viva page** | Profile review after submit is a **stub** until US-2.1. No full services/zone/tone/… read-only profile UI here. |
| **US-2.2** | Edit / PATCH Ficha viva. |
| **US-2.3** | `getBusinessProfileForAgents` agent API. |
| **Enqueue / LLM profile builder** | SPEC: create/update Ficha viva from interview answers (deterministic map). No paid agent job in this story. |
| Cliente reopen completed Entrevista | SPEC Fuera V1. |
| Auth redesign | Do not edit `lib/auth/*` allowlist / signup / login. |

## Dependency break (encode)

```text
Before (circular):  US-1.3 → US-2.1 → US-1.3
After:              US-1.1 → US-1.2 → US-1.3 → US-2.1
```

- **US-1.3 Depends on:** US-1.1, US-1.2  
- **US-2.1 Depends on:** US-1.3 (creates/updates `neuramark_business_profiles`)  
- FE “redirect to Business Profile review” = **stub route** until US-2.1.

## What US-1.1 / US-1.2 already shipped (do not duplicate)

- One row per Cliente; `/interview`; `draft` \| `completed` enum; Zod step shapes; persist only when `draft`; `status` never from client; 409 on completed writes.
- Completeness of all seven keys was **deferred to US-1.3** (US-1.1 CONTRACT).
- Dashboard Start / Resume / completed variants (US-1.2).
- `InterviewCompletedView` for completed load — extend with success path / CTA as needed; do not invent edit-after-complete.

## Canonical terms (CONTEXT)

Use **Entrevista inicial**, **Ficha viva**, **Cliente**, **Operator**.  
_Evitar:_ onboarding interview, cuestionario, Business Profile / perfil de negocio (UI EN may translate Ficha viva), admin / administrador / staff.
