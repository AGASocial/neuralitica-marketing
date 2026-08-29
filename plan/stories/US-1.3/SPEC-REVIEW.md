## Spec Review — US-1.3

### Verdict: ALIGNED

US-1.3 (submit complete **Entrevista inicial** → server completeness → upsert `neuramark_business_profiles` → mark session `completed` only after successful profile write → idempotent double-submit → **stub/success** redirect for profile review) matches SPEC §3 Interview Builder (S3.M2) and Business Profile / **Ficha viva** (S3.M3), Flujo S4.1 (entrevista → ficha slice), SPEC §2 Cliente/System roles, SPEC §5–§6, and CONTEXT **Entrevista inicial** / **Ficha viva**. Splitting full Ficha viva read UI into US-2.1 while this story creates/updates the row and ships a minimal stub is **ALIGNED sequencing**, not DRIFT. Circular dep with US-2.1 is correctly broken. No ADR, visual-modality, playbook/trend, SC-2, or V1 out-of-scope breach.

Orchestrator product defaults (encoded below) are **SPEC-aligned**. Residual open items are SECURITY/CONTRACT floors, not SPEC conflicts. Verdict is **ALIGNED** (not CONFLICT).

---

### Scope split vs US-1.1 / US-1.2 / US-2.1 — confirm

| Story | PO scope | SPEC mapping | Verdict |
|-------|----------|--------------|---------|
| **US-1.1** ✅ CLOSED | Wizard; persist structured `answers` + high-water `current_step`; enum exists; writes `draft` only; `/interview` no session id; no Ficha viva | Cliente: iniciar Entrevista inicial por pasos; ver progreso/errores. System: persiste JSON; schema server-side; `client_id` solo `getCurrentUser()`. | **ALIGNED** (shipped) |
| **US-1.2** ✅ CLOSED | Save & continue later; dashboard resume; completed read-only on draft writes; IDOR if session id supplied | Cliente: guardar borrador y retomar. System: `completed` read-only salvo Operator. | **ALIGNED** (shipped) |
| **US-1.3** (this) | Submit CTA; completeness Zod (seven steps); upsert Ficha viva; `status = completed` only after profile write; UNIQUE `source_interview_id` (+ lean UNIQUE `client_id`); stub success route; idempotent double-submit | Cliente: **enviar cuando esté completa**. System: al submit completo **dispara creación/actualización de Ficha viva (idempotente)**; `completed` read-only thereafter (salvo Operator). S3.M3: System crea/actualiza `neuramark_business_profiles` al completar entrevista. | **ALIGNED** |
| **US-2.1** | Full read-only Ficha viva page (services/zone/tone/…); dashboard default post-onboarding profile view; missing-profile CTA | Cliente: **ver resumen vivo del negocio**; CTA onboarding si no hay ficha. | **ALIGNED** (out of this story; Depends on US-1.3) |

SPEC lists Interview Builder and Business Profile as **modules**, not a requirement that submit, profile row creation, and full profile UI ship in one story. Parent `USER_STORIES.md` US-1.3 already notes stub OK until US-2.1. Do not amend SPEC. Do not check off USER_STORIES AC here.

**Stub vs full profile:** Sequencing, not drift. SPEC requires that submit creates/updates Ficha viva and that the Cliente can eventually see the living summary (US-2.1). A gated stub/success route that confirms completion and later hosts US-2.1 content **in place** satisfies the redirect AC without claiming the full S3.M3 “ver resumen vivo” surface in this story.

---

### Orchestrator defaults — SPEC alignment

| # | Default | SPEC / continuity | Spec-guardian |
|---|---------|-------------------|---------------|
| 1 | **Profile storage:** jsonb `fields` mirroring interview answer keys for V1 (US-2.1 displays; US-2.3 may project a narrower agent DTO later) | SPEC S3.M3 names table + create/update on interview complete; does **not** prescribe columns vs jsonb. Interview answers are already structured JSON (S3.M2). | **ALIGNED.** Freeze shape in CONTRACT. Do not invent LLM “profile builder” or agent DTO here (US-2.3). |
| 2 | **UNIQUE(`client_id`) and UNIQUE(`source_interview_id`);** Operator reopen later can overwrite the **same** profile row | SPEC: creación/actualización **idempotente**; one canonical Ficha viva per Cliente is the product intent. AC [SEC]: DB-level unique on `source_interview_id`. Completed read-only salvo Operator (reopen is ops). | **ALIGNED.** Both uniques are SPEC-safe. Overwrite-on-Operator-reopen-resubmit is update semantics, not a second profile — SECURITY must approve overwrite rules; not a SPEC veto. |
| 3 | **Stub success redirect:** `/profile` (US-2.1 replaces content in place) | SPEC does not prescribe URL. USER_STORIES: stub/success route OK until US-2.1. | **ALIGNED.** Path slug is CONTRACT/FE. Product **copy** must say **Ficha viva** / Living profile — not Business Profile / perfil de negocio (CONTEXT _Evitar_). |
| 4 | **Double-submit:** soft success / return existing profile (idempotent); not hard 409 unless incomplete/wrong state | SPEC: idempotente. AC: event idempotent + DB unique constraint. Incomplete → 400 field-level. | **ALIGNED.** Soft success on already-completed is preferred UX; 409 only for wrong-state draft mutations (US-1.1/1.2 pattern), not for re-submit of a completed session. |
| 5 | **Create profile on submit** (no orphan draft profile before submit); **update if row exists** | SPEC: al **submit completo** dispara creación/actualización. AC “or updates draft profile” does **not** require a pre-submit draft Ficha viva entity. | **ALIGNED.** Create-on-submit only; “updates draft profile” = upsert if a row already exists for that Cliente (e.g. prior experiment / Operator path). No orphan profiles before first successful submit. |
| 6 | **Fail-closed:** mark `completed` only after successful profile upsert; prefer same transaction/order | SPEC couples complete submit with Ficha viva create/update; `completed` means agents can rely on a profile existing for that path. | **ALIGNED.** Never set `completed` from client body. Incomplete or profile write failure → leave `draft`. Prefer single transaction (SECURITY/CONTRACT exact SQL). |
| 7 | **Submit loads answers from DB** for current user — do not trust client-submitted answers blob as source of truth | SPEC: valida schema server-side; `client_id` solo vía `getCurrentUser()`. Continuity with US-1.1/1.2 server authority. | **ALIGNED.** Completeness Zod over **stored** answers. Optional final persist-then-submit for unsaved last step is CONTRACT, not a weaker “complete-by-payload” path. |
| 8 | **Dashboard may link to stub `/profile` when completed** | SPEC Cliente eventually views Ficha viva; dashboard incomplete/resume is US-1.2. Completed entry → stub until US-2.1. | **ALIGNED.** US-2.1 swaps page content (and may become default post-onboarding view per USER_STORIES) without changing the create-on-submit contract. |

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| Info | Story supports SC-3 (onboarding → Ficha viva so primer lote path can continue). Does not touch Aprobación, Publicación IG, grabación humana, Ciclo semanal, Playbook, Trend, Preferencias de producción visual. No publish path → SC-2 intact. | SPEC §1 SC-1..SC-4; Flujo S4.1; PLAN Fase 1 | None. Do not add IG, Stories, ads, generation, visual modalities, or agent APIs. |
| Info | Roles unchanged: **Cliente** submits complete Entrevista; **System** validates, upserts Ficha viva, sets `completed`; **Operator** reopen remains ops/SQL V1 (no Cliente reopen UI — Fuera V1). No RBAC UI. Mutations still `requireActive()` / `getCurrentUser()`. | SPEC §2; §3 S3.M2/M3 + Authentication | CONTRACT: reject `client_id` / `status` / `source_interview_id` / privilege fields from request. |
| Info | **Submit vs view vs edit vs agents** cut is correct. Do not ship full field-grid Ficha viva UI (US-2.1), PATCH/version bump for edits (US-2.2), or `getBusinessProfileForAgents` (US-2.3). Deterministic map interview → profile — no LLM/queued profile builder. | SPEC §3 S3.M2 vs S3.M3; USER_STORIES US-1.3 / US-2.x | CONTRACT non-goals. Stub must not pretend full “resumen vivo”. |
| Info | **Idempotency + cardinality:** one profile per submit source (`UNIQUE source_interview_id`); V1 lean one profile per Cliente (`UNIQUE client_id`). Double-submit → one row. Application-only idempotency is insufficient (AC [SEC]). | SPEC S3.M2 idempotent Ficha viva; USER_STORIES US-1.3 [SEC] | Migration + handler unique-violation → soft success. |
| Info | **Status authority:** client never sends `status`; `completed` only after successful upsert. Draft persist paths (US-1.1/1.2) remain `UPDATE … AND status = 'draft'` → 409. Re-submit of completed → soft success, not reopen. | SPEC “completed read-only salvo Operator”; Fuera V1 Cliente reopen | SECURITY/CONTRACT: transaction order; tests for fail-closed and forbidden fields. |
| Info | **NFR / stack:** Next.js App Router; Server Action for submit; i18n EN+ES; `neuramark_*`; RLS deny-by-default; service-role server-only; `no-store` on new routes; multi-tenant `client_id` from server only. Profile upsert is not ADR-0003 long work — stays on Vercel app. | SPEC §5–§6; ADR-0001/0002/0003 | No auth redesign; stub route off `isPublicPath`. |
| Info | ADRs 0001–0003 untouched: no cron, no IG Graph publish, no FFmpeg/Fly. | ADR-0001, ADR-0002, ADR-0003 | None. |
| Info | Out of scope held: US-2.1 full UI; US-2.2/2.3; Preferencias de producción visual; Cliente reopen at will; Stories IG, multicanal, ads; RBAC; LLM profile agent. | SPEC §1 Fuera de alcance; §3 | Implementers must not expand stub into full profile or enqueue paid agents. |
| Low | Parent `USER_STORIES.md` US-1.3/US-2.x titles still say “Business Profile” / “business profile”. CONTEXT _Evitar_ for product/domain copy. Story-folder README/TASKS correctly prefer **Ficha viva** / Living profile. | CONTEXT **Ficha viva** | Do not propagate _Evitar_ into CONTRACT, SECURITY, or EN/ES UI. Optional later cleanup of parent titles. |
| Low | AC phrase “or updates draft profile” can be misread as requiring a pre-submit draft Ficha viva row. SPEC only requires create/update **on complete submit**. | SPEC S3.M3; USER_STORIES US-1.3 AC | CONTRACT: create-on-submit; upsert if row exists; no orphan draft-profile lifecycle in this story. |

---

### Terminology violations (CONTEXT)

**None that block** in `plan/stories/US-1.3/README.md` or `TASKS.md`. Canonical use is correct: **Entrevista inicial**, **Ficha viva**, **Cliente**, **Operator**.

**Forbidden in UI / domain copy / later CONTRACT & SECURITY:** onboarding interview, cuestionario, prestador (as product role), dueño, usuario final, admin / administrador / staff, Business Profile / perfil de negocio (use **Ficha viva**; EN UI may use **Living profile**).

Note (not a US-1.3 PREP veto): parent `plan/USER_STORIES.md` still uses “Business Profile” in module/story titles and FE lines — do not copy into product strings or this story’s later gates.

---

### Blockers for SECURITY / CONTRACT

**SPEC blockers:** none. Proceed to SECURITY.

| Item | Blocks? | Guidance |
|------|---------|----------|
| jsonb fields 1:1 vs normalized columns | **No SPEC block.** Default jsonb mirroring interview keys = **ALIGNED**. | CONTRACT freezes shape + Zod map; US-2.1 renders from it. |
| UNIQUE(`client_id`) + UNIQUE(`source_interview_id`) | **No SPEC block.** Both **ALIGNED**. | CONTRACT + migration; SECURITY: Operator reopen overwrite / retarget `source_interview_id`. |
| Stub path `/profile` vs `/interview/submitted` | **No SPEC block.** `/profile` **ALIGNED** if gated + stub-only. | CONTRACT/FE pick one; i18n copy = Ficha viva / Living profile. |
| Soft success vs 409 on double-submit | **Resolved for SPEC** (soft success **ALIGNED**). | CONTRACT encodes `{ ok, alreadyCompleted }` (or equivalent); incomplete still 400. |
| Create-on-submit vs pre-submit draft profile | **Resolved for SPEC** (create-on-submit **ALIGNED**). | CONTRACT: no orphan draft profile; upsert if exists. |
| Transaction / orphan profile if status update fails | **No SPEC block**; fail-closed ordering is **ALIGNED**. | SECURITY/CONTRACT: prefer single transaction; compensating delete only if SECURITY accepts residual. |
| Submit payload empty vs re-send answers | **Resolved for SPEC** (DB answers as truth **ALIGNED**). | CONTRACT: load by `getCurrentUser()`; optional persist-then-submit for dirty last step. |
| Dashboard link to stub | **No SPEC block.** | FE/CONTRACT; US-2.1 replaces content later. |
| Full Ficha viva UI | Confirmed **out of scope** — US-2.1. | Stub only. |

---

### Recommended action

Proceed to **SECURITY.md** (security-architect). Orchestrator **may** proceed to the SECURITY gate.

CONTRACT freeze items (non-negotiable for alignment; freeze later, not in this file):

1. `submitInterview` (or CONTRACT name): `requireActive("handler")`; load session + **stored** answers by `getCurrentUser()` only; reject forbidden identity/privilege/`status`/`source_interview_id` fields.
2. Completeness Zod: all seven keys (`services`…`restrictions`); empty `restrictions.items` allowed; incomplete → 400 field-level.
3. Upsert `neuramark_business_profiles` from stored answers; `client_id` + `source_interview_id` server-set; jsonb `fields` (or CONTRACT shape) mirroring interview keys for V1.
4. UNIQUE(`source_interview_id`) required; UNIQUE(`client_id`) for V1 one-ficha-per-Cliente; double-submit / unique violation → soft success, one row.
5. Mark `completed` **only after** successful profile upsert; prefer same DB transaction; never from request body; failure leaves `draft`.
6. Stub route (e.g. `/profile`) under `(app)`, `requireActive`, EN/ES, no full field grid; dashboard may link when completed; US-2.1 replaces content in place.
7. EN/ES: Entrevista inicial / Initial interview; Ficha viva / Living profile; no CONTEXT _Evitar_ synonyms.
8. Explicit out of scope: US-2.1 full UI; US-2.2 PATCH; US-2.3 agent API; LLM profile builder; Cliente reopen; auth redesign; visual prefs; Stories IG / ads / RBAC.

Do not write application code, CONTRACT.md, or SECURITY.md in this gate. Do not check off USER_STORIES acceptance criteria.
