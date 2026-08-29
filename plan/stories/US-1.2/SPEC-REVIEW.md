## Spec Review — US-1.2

### Verdict: ALIGNED

US-1.2 (explicit **Save & continue later**, dashboard incomplete / resume prompt with `current_step` cursor, prove draft continuity across sessions, completed **read-only** server enforcement, IDOR guard if a session id is ever supplied) matches SPEC §3 Interview Builder (S3.M2) — Cliente “guardar borrador y retomar”; System `draft`|`completed` with completed read-only salvo Operator; `client_id` solo vía `getCurrentUser()`. Continuity with US-1.1 (persist already shipped) and deferral of submit → Ficha viva to US-1.3 is **ALIGNED sequencing**, not DRIFT. No ADR, visual-modality, playbook/trend, SC-2, or V1 out-of-scope breach.

Orchestrator product defaults (encoded below) are **SPEC-aligned**. Residual open items are SECURITY/CONTRACT floors, not SPEC conflicts.

---

### Scope split vs US-1.1 / US-1.3 — confirm

| Story | PO scope | SPEC mapping | Verdict |
|-------|----------|--------------|---------|
| **US-1.1** ✅ CLOSED | Wizard; persist structured `answers` + high-water `current_step`; survive refresh; enum exists; writes `draft` only; `/interview` no session id; Start CTA only; no Ficha viva | Cliente: iniciar Entrevista inicial por pasos; ver progreso/errores (EN/ES). System: persiste JSON; schema server-side; `client_id` solo `getCurrentUser()`. | **ALIGNED** (shipped) |
| **US-1.2** (this) | Explicit Save & continue later; dashboard incomplete prompt + last progress; completed read-only UX + server mutation reject; IDOR if session id supplied; Operator reopen = ops/SQL V1 (no Cliente reopen UI) | Cliente: **guardar borrador y retomar**. System: `completed` read-only **salvo Operator**. Fuera V1: Cliente no reabre a voluntad. | **ALIGNED** |
| **US-1.3** | Submit → `completed` → Ficha viva (idempotent) | Cliente: enviar cuando esté completa. System: al submit completo dispara Ficha viva (S3.M3). | **ALIGNED** (out of this story) |

SPEC lists Interview Builder **module** capabilities, not a requirement that persist, dashboard resume, and submit/ficha ship in one story. Parent `USER_STORIES.md` US-1.2 BE still says “mark `completed` when submitted” — that write remains **US-1.3**. Story-folder TASKS/README correctly exclude it. Do not amend SPEC. Do not check off USER_STORIES AC here.

---

### Orchestrator defaults — SPEC alignment

| # | Default | SPEC / continuity | Spec-guardian |
|---|---------|-------------------|---------------|
| 1 | **Operator reopen:** SQL-only / ops process for V1; **no** Cliente reopen UI; **no** `requireOperator()` Server Action **required** in this story | SPEC: completed read-only salvo Operator; Fuera V1: Cliente reabre a voluntad. Auth module pattern: Operator activation is SQL, sin UI V1. | **ALIGNED.** Document reopen SQL in SECURITY/ops note. In-app Operator action is optional later — not a SPEC veto if omitted here. |
| 2 | **Save & continue later:** require **current-step validation** (same advance rules as persist/Next) before soft-exit save; invalid → errors, stay on step | SPEC: ver progreso/errores; System valida schema server-side. US-1.1 CONTRACT already gates persist on advance rules. | **ALIGNED.** Soft-save of invalid partial fields would weaken the same bar; do not invent a weaker persist path. |
| 3 | **Dashboard:** empty draft (no meaningful answers / still at first step / no progress) → **Start** CTA; draft with progress → **Resume** / incomplete prompt | SPEC does not prescribe Start vs Resume copy for empty get-or-create rows. US-1.1 may create empty draft on first `/interview` visit. | **ALIGNED** product policy. Freeze “meaningful progress” in CONTRACT (PO default: `current_step` ≠ first **or** ≥1 answers key). Do **not** get-or-create solely to render the dashboard card. |
| 4 | **Session id:** primary resume = load by `getCurrentUser()`; if client supplies session id → **ownership-check** (IDOR) or reject/strip — never trust client id alone | SPEC: `client_id` solo vía `getCurrentUser()`. US-1.1 CONTRACT: strip ids. USER_STORIES US-1.2 [SEC] IDOR AC. | **ALIGNED.** Happy path stays `/interview` without id. SECURITY chooses strip-and-ignore vs validate-and-use; both satisfy SPEC if foreign rows never leak. |

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| Info | Story supports SC-3 (onboarding path to primer lote) via resume so Cliente is not forced to finish in one sitting. Does not touch Aprobación, Publicación IG, grabación humana, Ciclo semanal, Playbook, Trend, Preferencias de producción visual. No publish path → SC-2 intact. | SPEC §1 SC-1..SC-4; Flujo S4.1; PLAN Fase 1 | None. Do not add IG, Stories, ads, generation, Ficha viva, or visual modalities. |
| Info | Roles unchanged: **Cliente** pauses/resumes; **System** loads status by server identity and rejects writes to `completed`; **Operator** reopen is ops/SQL (or future action), not Cliente UI. No RBAC UI. Mutations still `requireActive()` / `getCurrentUser()`. | SPEC §2; §3 Interview Builder + Authentication | CONTRACT: no `client_id` / `status` from request as identity. Dashboard helper: no `client_id` param. |
| Info | **Persist vs resume vs submit** cut remains correct. Do not rebuild US-1.1 wizard/schema/migration. Do not write `status = completed` or create `neuramark_business_profiles` / `source_interview_id`. | SPEC §3 S3.M2 vs S3.M3; US-1.1 SPEC-REVIEW | CONTRACT: 1.2 never writes `completed`. Reuse `persistInterviewDraft` (or thin wrapper) + draft write predicate. |
| Info | **Completed read-only:** FE must not offer edit/Save & continue / Next when `completed`; **server** remains authority (`UPDATE … AND status = 'draft'` → 409). Already partially in US-1.1; this story hardens UX + coverage. | SPEC §3 “completed read-only salvo Operator” | SECURITY/CONTRACT: confirm every write path; add tests if gaps. |
| Info | **Cardinality + URL:** one row per Cliente; primary resume URL `/interview` without session id — unchanged from US-1.1. Do not introduce `/interview/[id]` unless SECURITY requires it. | SPEC §3 S3.M2; US-1.1 CONTRACT | Prefer omit session `id` from client props; IDOR tests if any surface accepts an id. |
| Info | **NFR / stack:** Next.js App Router; Server Actions for mutations; i18n EN+ES; `neuramark_*`; RLS deny-by-default; service-role server-only; `no-store` on product HTML; `revalidatePath` dashboard + interview on save-and-leave. No Fly worker (not ADR-0003 long work). | SPEC §5–§6; AGENTS.md; ADR-0001/0002/0003 | No auth redesign; `/interview` stays off `isPublicPath`. |
| Info | ADRs 0001–0003 untouched: no cron, no IG Graph publish, no FFmpeg/Fly. | ADR-0001, ADR-0002, ADR-0003 | None. |
| Info | Out of scope held: Cliente reopen at will; full US-X.1 dashboard aggregator; US-2.x; Preferencias de producción visual; Stories IG, multicanal, ads; RBAC. | SPEC §1 Fuera de alcance; §3 | Implementers must not ship submit/ficha or reopen-completed for Cliente. |
| Low | Carry-forward from US-1.1: dashboard/interview copy must stay **Entrevista inicial** / **Initial interview**. If live strings still say “Business interview” / “Entrevista del negocio”, fix when wiring incomplete/resume variants. | CONTEXT **Entrevista inicial**; US-1.1 SPEC-REVIEW Low | Update `messages/en.json` + `es.json` in BUILD FE. |
| Low | Parent `USER_STORIES.md` BE “mark `completed` when submitted” is wording drift vs story split — not a SPEC amendment. CONTRACT must state 1.2 never writes `completed`. | USER_STORIES US-1.2 BE; SPEC S3.M2/M3 | Encode in CONTRACT non-goals. |

---

### Terminology violations (CONTEXT)

**None that block** in `plan/stories/US-1.2/README.md` or `TASKS.md`. Canonical use is correct: **Entrevista inicial**, **Cliente**, **Operator**, **Ficha viva** only as US-1.3 out-of-scope name.

**Forbidden in UI / domain copy / later CONTRACT & SECURITY:** onboarding interview, cuestionario, prestador (as product role), dueño, usuario final, admin / administrador / staff, Business Profile / perfil de negocio (use **Ficha viva** only when naming the deferred profile).

Note (not a US-1.2 veto): parent `plan/USER_STORIES.md` still says “Business Profile” in US-1.3/US-2.x titles. Do not propagate into this story’s gates or EN/ES product copy.

---

### Blockers for SECURITY / CONTRACT

**SPEC blockers:** none. Proceed to SECURITY.

| Item | Blocks? | Guidance |
|------|---------|----------|
| Operator reopen SQL vs `requireOperator()` | **No SPEC block.** Orchestrator default = SQL-only V1, no action required in this story. | SECURITY documents ops SQL (and whether audit is needed). Optional in-app Operator path is a SECURITY product choice, not a SPEC conflict. |
| Save & continue validation | **Resolved for SPEC** (default = same as advance). | CONTRACT freezes action signature + reuse of advance rules; no weaker soft-save. |
| Meaningful progress / empty draft → Start | **Resolved for SPEC** (orchestrator default ALIGNED). | CONTRACT freezes predicate; BE: no get-or-create on dashboard read. |
| Session id strip vs validate-ownership | **No SPEC block** if foreign data never leaks and primary path is `getCurrentUser()`. | SECURITY picks strip vs validate; CONTRACT encodes. Prefer 404/empty over 403 for foreign ids (PO lean). |
| Completed dashboard: link vs badge | UX only — **not** a SPEC conflict. | CONTRACT/FE. |
| Mark `completed` | Confirmed **out of scope** — US-1.3. | CONTRACT non-goal. |

---

### Recommended action

Proceed to **SECURITY.md** (security-architect). Orchestrator **may** proceed to the SECURITY gate.

CONTRACT freeze items (non-negotiable for alignment; freeze later, not in this file):

1. Primary load/resume by `getCurrentUser().id` only; `/interview` without session id; one row per Cliente.
2. If any surface accepts session/client ids: ownership-check or strip; never trust client id alone (IDOR).
3. Save & continue later: same current-step validation as advance; persist via existing draft write path; then navigate dashboard; `revalidatePath` dashboard + interview.
4. Dashboard summary: no `client_id` param; no get-or-create on card load; empty/no progress → Start; progress draft → incomplete/Resume with `current_step`; `completed` → read-only entry (no edit).
5. Never write `status = completed` in this story; reject client-supplied `status`; writes only `UPDATE … AND status = 'draft'` → 409 if completed.
6. Operator reopen: SQL/ops documented for V1; no Cliente reopen UI; no requireOperator action **required**.
7. EN/ES: Entrevista inicial / Initial interview; no CONTEXT _Evitar_ synonyms; no Ficha viva labeling on this flow.
8. Explicit out of scope: US-1.3 submit/`completed`/Ficha viva; US-2.x; full US-X.1 aggregator; auth redesign; visual prefs; Stories IG / ads / RBAC.

Do not write application code, CONTRACT.md, or SECURITY.md in this gate. Do not check off USER_STORIES acceptance criteria.
