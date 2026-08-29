# US-1.3 — Submit interview for profile generation

**Priority:** P0  
**Depends on:** US-1.1 ✅ CLOSED · US-1.2 ✅ CLOSED · runtime US-14.5 (`getCurrentUser()` / `requireActive()`, `(app)` layout)  
**Does not depend on:** US-2.1 (circular dep broken — US-1.3 goes first; US-2.1 still Depends on US-1.3)  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-1.3 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** nextjs-backend + nextjs-frontend (`docs/development/AGENT-ROSTER.md` Fase 1). No content/media/integrations specialist.  
**Canonical terms:** **Entrevista inicial** · **Ficha viva** · Role: **Cliente** / **Operator**. Avoid CONTEXT _Evitar_ terms (Business Profile / perfil de negocio in product copy — use Ficha viva / Living profile per i18n).

## Out of scope (do not implement here)

- **US-2.1 full Ficha viva page:** services / zone / tone / offers / objections / brand notes / restrictions read-only UI; dashboard default post-onboarding profile view. This story’s FE may only ship a **minimal stub/success route** after submit (confirmation + link/redirect). Document stub clearly in UI copy if needed (“full review coming” is optional; prefer neutral success).
- **US-2.2:** edit / PATCH Ficha viva, version bump for edits, consent/visual fields.
- **US-2.3:** `getBusinessProfileForAgents` agent contract.
- **LLM / queued “profile builder” agent:** SPEC maps interview → Ficha viva on submit (deterministic server map). No SiliconFlow/LLM spend in this story.
- Rebuild of US-1.1 wizard / US-1.2 Save & continue later / dashboard incomplete prompt.
- Cliente reopen of completed Entrevista (SPEC Fuera V1).
- Auth changes: do **not** edit signup/login/logout/reset, `requireActive()` semantics, or add routes to `isPublicPath`.
- `@supabase/supabase-js` in Client Components; `client_id` from body/query/headers as identity.

## Scope split

| Concern | Owner |
|---------|--------|
| Wizard + draft persist + step Zod | **US-1.1** (done) |
| Save & continue later; dashboard resume; completed read-only on draft writes | **US-1.2** (done) |
| Submit → completeness → upsert Ficha viva → `status = completed`; stub success UX; `neuramark_business_profiles` + unique `source_interview_id` | **US-1.3** (this story) |
| Full Ficha viva review page | **US-2.1** |
| Edit profile | **US-2.2** |
| Agent API | **US-2.3** |

## PO decisions (freeze in CONTRACT unless SECURITY vetoes)

| Topic | Decision |
|-------|----------|
| Ordering vs US-2.1 | **US-1.3 first.** Creates/updates `neuramark_business_profiles`. FE redirect lands on **stub/success route** until US-2.1. |
| Submit surface | Server Action only (CSRF class of US-1.1 persist). No public Route Handler required. |
| Completeness | Server Zod: all seven keys present and satisfy the same advance rules as US-1.1 (`services`…`restrictions`; empty `restrictions.items` allowed). Incomplete → **400** with field-level errors. Client-side checks are presentation only. |
| Status write | Client **never** sends `status`. Handler sets `completed` **only after** successful profile upsert in the same transaction (or equivalent fail-closed sequence). Incomplete or profile write failure → leave `draft`; no half-completed state. |
| Profile upsert | Map stored interview `answers` → normalized Ficha viva fields (CONTRACT freezes shape). Create if none; update if draft/existing for this client **or** same `source_interview_id`. Prefer one profile per Cliente in V1 unless CONTRACT proves otherwise. |
| Idempotency | Double-submit must not create a second profile. Enforce with **UNIQUE (`source_interview_id`)** (and/or unique `client_id` if one-profile-per-client). Second submit on already-completed session: return success (or safe conflict) with same profile link — **no second row**. Application logic alone is insufficient (AC [SEC]). |
| Transaction | Prefer single DB transaction: upsert profile → update session `status = 'completed'` where still `draft` (or already completed + same source). Exact SQL/RPC in CONTRACT. |
| Stub route | e.g. `/interview/submitted` or `/profile` placeholder under `(app)` — CONTRACT/FE pick one path. Must be gated (`requireActive`), EN/ES, no full field grid. May deep-link later to US-2.1 page when that story lands. |
| Already completed | Re-submit / submit CTA when `status = 'completed'`: idempotent success → stub (or read-only completed UX), **not** 400 incompleteness. Do not reopen to draft. |
| Identity | `client_id` / ownership only via `getCurrentUser()` / `requireActive("handler")`. Reject `client_id`, `status`, `role`, `active`, `source_interview_id` from request if present (`FORBIDDEN_FIELDS` class). |
| Session id | Prefer load/submit by current user only (same as 1.1/1.2). If a session id is accepted, ownership-check (IDOR) or strip. |
| Dashboard after submit | Update interview card: completed / success entry; no incomplete Resume. `revalidatePath` dashboard + interview + stub. |
| Auth / cache | `Cache-Control: no-store` on new routes; no public allowlist additions. |

## Carry-forwards / reuse (do not reinvent)

- Reuse `lib/contracts/interview.ts` step schemas; add a **completeness** schema / helper (all seven required) — do not fork step shapes.
- Reuse `getOrCreateInterviewDraft` / load-by-user patterns; add `submitInterview` (name frozen in CONTRACT).
- Reuse `/interview` wizard; last step gains **Submit** (distinct from Save draft / Save & continue later).
- RLS deny-by-default + service-role server-only — same pattern as interview sessions.
- Do **not** change auth code paths beyond `revalidatePath` / new gated routes.

---

## FE checklist

Concrete BE consumers: submit Server Action; optional load of stub page after redirect; dashboard completed state already partially present from US-1.2.

- [x] **Submit control** on Entrevista (last step and/or dedicated CTA): pending, disabled when presentation-incomplete (optional), never the only gate. Distinct from Save & continue later / step Next.
- [x] On success → **success confirmation** + redirect to **stub/success route** (not full Ficha viva UI). Document in copy/comments that full review is US-2.1.
- [x] Incomplete / validation errors: surface **field-level** messages from BE (EN/ES). Do not invent client-only “mark completed”.
- [x] Already-completed path: no edit; success/idempotent UX or link to stub / read-only completed view.
- [x] Loading / error for submit failure (profile write / internal) without leaving wizard in a lying “completed” UI state.
- [x] EN + ES in `messages/en.json` / `es.json`. Canonical **Entrevista inicial** / **Ficha viva** (Living profile). Avoid CONTEXT _Evitar_ terms.
- [x] No Supabase in Client Components; no `client_id` / privilege fields in the submit payload.
- [x] Free-text answers still rendered escaped only (XSS bar from US-1.1).

---

## BE checklist

Concrete FE consumers: wizard Submit CTA; success/stub page; dashboard interview card after completion.

- [x] **`submitInterview` (or CONTRACT name) Server Action:** `requireActive("handler")`; reject forbidden fields (`status`, `role`, `active`, `client_id`, `auth_user_id`, …).
- [x] Load session for current user only; if no draft / missing row → appropriate error (CONTRACT).
- [x] **Completeness Zod** over stored (or submitted) answers — all seven steps; field-level 400 on failure. Do **not** trust client “I’m done” flags.
- [x] **Upsert Ficha viva** into `neuramark_business_profiles` from answers; set `source_interview_id` to the session PK; set `client_id` from server user only.
- [x] **Mark `completed` only after** successful profile upsert (same transaction preferred). Never set `completed` from request body.
- [x] **Idempotency:** unique `source_interview_id` (and handle unique violation as success/no-op). Double-submit does not create a second profile.
- [x] Completed session re-submit: idempotent success returning existing profile link / stub redirect target — no reopen, no second insert.
- [x] CSRF: Server Action only. Parameterized SQL / service-role server-only.
- [x] Never log full `answers` / profile free text in production.
- [x] `revalidatePath` for `/interview`, dashboard, and stub route.
- [x] Automated tests: complete submit → one profile + `completed`; incomplete → 400 fields; double-submit → one profile; client `status: completed` rejected; completed write paths still 409 for draft persist; ownership / no `client_id` from request.

---

## DB checklist

All objects keep `neuramark_` prefix. Migration via Supabase migrations only.

- [x] Create table **`neuramark_business_profiles`** (logical `business_profiles`): at minimum `id`, `client_id` FK → `neuramark_clients`, `source_interview_id` FK → `neuramark_interview_sessions`, fields payload (jsonb or columns — CONTRACT), `version`, `created_at`, `updated_at`.
- [x] **UNIQUE (`source_interview_id`)** for submit idempotency (AC [SEC]). Nullability: CONTRACT — prefer NOT NULL once linked from submit.
- [x] Decide **UNIQUE (`client_id`)** for one Ficha viva per Cliente in V1 (PO lean: **yes** unless SECURITY/CONTRACT finds a reason for multiples). Document in CONTRACT.
- [x] Indexes named `neuramark_*`; RLS enabled with **zero** policies (deny-by-default; service-role server access) — match interview sessions pattern unless SECURITY requires otherwise.
- [x] No agent API tables. No `profile_versions` history table (US-2.2 / Fuera V1 nice-to-have).
- [x] Do **not** alter interview enum; `draft` → `completed` remains the only app transition (this story owns the write).

---

## Gates (orchestrator)

- [ ] SPEC-REVIEW.md (spec-guardian — Interview Builder submit → Ficha viva idempotent; Business Profile create-on-complete; stub UI vs US-2.1)
- [ ] SECURITY.md (security-architect)
- [x] CONTRACT.md + FE signoff (nextjs-backend → nextjs-frontend) — **Reviewed by FE: yes — 2026-08-29**; Frozen; no disputes
- [ ] BUILD (FE + BE)
- [ ] VALIDATION.md
- [ ] QA.md

**PREP complete when:** `README.md` + this `TASKS.md` exist; AC in `USER_STORIES.md` remain unchecked; no CONTRACT/SECURITY/code from PO.

---

## Open questions (for SPEC / SECURITY / CONTRACT)

1. **Profile field shape** — Flatten seven interview keys into `fields` jsonb 1:1 vs normalized columns? Blocks CONTRACT schema and US-2.1 render map. PO lean: jsonb `fields` mirroring interview keys for V1 (fast path); US-2.3 can project a narrower agent DTO later.
2. **One profile per Cliente** — UNIQUE(`client_id`) plus UNIQUE(`source_interview_id`)? PO lean: both. If Operator SQL-reopens interview and Cliente re-submits, upsert **updates** the same profile row (same `client_id`) and may retarget `source_interview_id` — SECURITY must approve overwrite semantics.
3. **Stub route path** — `/interview/submitted` vs `/profile` vs `/ficha`? Product URL + i18n; must not imply full Ficha viva UI until US-2.1.
4. **Double-submit response** — Soft success `{ ok: true, alreadyCompleted: true }` vs 409 with redirect hint? AC requires idempotent event; UX preference for soft success.
5. **Partial profile “draft”** — AC says “creates exactly one … (or updates draft profile)”. Is there a pre-submit draft Ficha viva, or only create-on-submit? PO lean: **create-on-submit only** (no orphan profiles); “updates draft profile” = upsert if a row already exists for the client (e.g. prior partial experiment). Confirm with SPEC-guardian.
6. **Transaction failure after profile insert** — If session status update fails, is orphan profile acceptable with compensating delete, or must both commit together? SECURITY/CONTRACT: prefer single transaction.
7. **Submit payload** — Empty body (server reads stored answers) vs re-send full answers? PO lean: **server reads stored answers** as source of truth (client cannot complete-by-payload alone without persist); optional final persist-then-submit if last step unsaved — CONTRACT freezes.
8. **Dashboard CTA after complete** — Link to stub vs wait for US-2.1 profile page? PO lean: link to stub for now; US-2.1 swaps target.

No SPEC amendment required for the dependency break: SPEC already states submit creates/updates Ficha viva idempotently; viewing the full Ficha viva remains Business Profile module (US-2.1). Stub review UI is an implementation sequencing choice, not a SPEC conflict.
