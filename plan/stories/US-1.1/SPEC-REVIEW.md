## Spec Review — US-1.1

### Verdict: ALIGNED

US-1.1 (wizard + persist `draft` JSON + survive refresh; one row per Cliente; `/interview` with no session id; no Ficha viva) matches SPEC §3 Interview Builder (S3.M2), Flujo S4.1 as the Entrevista slice of PLAN Fase 1, SPEC §2 Cliente, SPEC §5–§6, AGENTS.md, and CONTEXT **Entrevista inicial**. Splitting SPEC “guardar borrador y retomar” into persist (1.1) vs dashboard resume UX (1.2), and SPEC “enviar cuando esté completa” + System “al submit completo dispara creación/actualización de Ficha viva” into US-1.3, is **ALIGNED sequencing of one module**, not DRIFT. No ADR, visual-modality, playbook/trend, or V1 out-of-scope breach.

---

### Scope split vs US-1.2 / US-1.3 — confirm

| Story | PO scope | SPEC mapping | Verdict |
|-------|----------|--------------|---------|
| **US-1.1** | Step wizard; persist structured `answers` + `current_step`; survive refresh; enum exists but writes only `draft`; `UNIQUE (client_id)`; `/interview` no session id; no Ficha viva; no submit | Cliente: iniciar Entrevista inicial por pasos; ver progreso/errores (EN/ES). System: persiste JSON en `neuramark_interview_sessions`; schema server-side; `client_id` solo `getCurrentUser()`. Fuera V1: no entrevista libre; no reabrir a voluntad. | **ALIGNED** |
| **US-1.2** | Dashboard resume prompt; dedicated “save & continue later” control; completed-session mutation guards as story | Cliente: guardar borrador y **retomar**. System: `completed` read-only salvo Operator. | **ALIGNED** (resume UX + read-only enforcement; not submit) |
| **US-1.3** | Submit → `completed` → Ficha viva (idempotent) | Cliente: enviar cuando esté completa. System: al submit completo dispara creación/actualización de Ficha viva. Módulo Business Profile (S3.M3). | **ALIGNED** |

SPEC lists Interview Builder **module** capabilities, not a requirement that persist, dashboard resume, and submit/ficha ship in one story. Filling all seven steps in one sitting (US-1.1 AC) is not “enviar”: last-step save stays `draft`. Implementers must not add a submit CTA that sets `completed` or pretends agents can consume a Ficha viva.

Parent `plan/USER_STORIES.md` still mixes 1.2 language into 1.1 AC (“or save and resume (US-1.2)”) and 1.3 language into 1.2 BE (“mark `completed` when submitted”). Story-folder TASKS is the operative split. Do not amend SPEC. Do not check off USER_STORIES AC here.

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| Info | Story supports SC-3 as the start of onboarding (primer lote ≤ 7 días **tras** Entrevista inicial). Does not touch Aprobación, Publicación en Instagram, grabación humana, Ciclo semanal, Playbook, Trend, or Preferencias de producción visual. No publish path → SC-2 intact. | SPEC §1 SC-1..SC-4; hard rules; Flujo S4.1; PLAN Fase 1 | None. Do not add IG, Stories, ads, generation, Ficha viva, or visual modalities here. |
| Info | Roles unchanged: **Cliente** runs the wizard; **System** persists draft JSON; **Operator** reopen of completed is out of 1.1 (SPEC: completed read-only salvo Operator — US-1.2/1.3). No RBAC UI. Auth already shipped (US-14.5); mutations still call `requireActive()` / `getCurrentUser()` — do not trust middleware. | SPEC §2; §3 Interview Builder + Authentication; AGENTS.md | CONTRACT: no `client_id` / `status` from request. Page under `app/(app)/`. `/interview` off public allowlist. |
| Info | **Persist vs resume vs submit** is the correct cut of S3.M2. Dashboard default entry (AGENTS.md) stays; 1.1 only **wires** existing Start CTA to the wizard. Do not add “incomplete interview” dashboard prompt (US-1.2). Do not create `neuramark_business_profiles` or `source_interview_id` (US-1.3 / S3.M3). | SPEC §3 S3.M2 vs S3.M3; Flujo S4.1; USER_STORIES US-1.1–1.3, US-X.1; TASKS.md Interview Builder | Keep last step as `draft` save. No “Enviar” / complete CTA in 1.1. |
| Info | **Cardinality + URL:** one row per Cliente (`UNIQUE (client_id)`), load by current user, no session id in path/query. Matches Fuera V1 (Cliente does not reopen at will) and `client_id` solo vía `getCurrentUser()`. Stricter than US-1.2’s future IDOR-on-session-id AC; 1.2 may still add ownership checks if a UUID ever appears. | SPEC §3 S3.M2; §5 Auth; USER_STORIES US-1.1 [SEC] | CONTRACT: no client-supplied session id. Lookups filtered by server `client_id`. |
| Info | **Status:** introduce `draft` \| `completed`; this story only writes `draft`; never accept `status` from the client. Recommended `UPDATE … WHERE client_id = $1 AND status = 'draft'` so a future completed row is not overwritten — security floor, not extra product UX. Full completed read-only + Operator exception is US-1.2 / SPEC. | SPEC §3 “estados `draft`\|`completed` (completed read-only salvo Operator)” | SECURITY.md: freeze write predicate. CONTRACT: omit `status` from request. |
| Info | **Steps:** fixed order services → zone → tone → offers → objections → style → restrictions matches SPEC Spanish step list. Storage keys English snake is CONTRACT, not SPEC. Per-field max length / max array size / 64 KB backstop are CONTRACT + AC [SEC], not SPEC shape. | SPEC §3 “por pasos (servicios, zona, tono, ofertas, objeciones, estilo, restricciones)” | CONTRACT freeze keys, Zod limits, 413 vs 400 for oversize (PO prefers 413 bytes / 400 schema; AC allows either). |
| Info | **Empty `restrictions`:** SPEC names the step; it does **not** require ≥1 item. Empty `items: []` as “none” is valid. Other list steps (`services`, `offers`, `objections`) requiring ≥1 item is a CONTRACT completeness rule for *advance*, not a SPEC veto. Full completeness for submit is US-1.3. | SPEC §3 Interview Builder steps | CONTRACT: `restrictions.items` required array, min 0. Do not treat empty as missing step. |
| Info | **Tone / style:** SPEC names steps only. Free text vs closed enums is **CONTRACT**, not a SPEC conflict. | SPEC §3 S3.M2 (tono, estilo) | Freeze in CONTRACT. Either choice is ALIGNED if UI labels stay Entrevista inicial steps (EN/ES). |
| Info | **NFR / stack:** Next.js App Router; Server Actions preferred for UI-coupled mutations; PrimeReact before custom; i18n EN+ES; `neuramark_*` on table/enum/index/trigger/policy; RLS deny-by-default (no browser SDK policies); service-role server-only; `Cache-Control: no-store` like other `(app)` surfaces; no Fly worker (interview persist is not ADR-0003 long work). | SPEC §5–§6; AGENTS.md; ADR-0001/0002/0003 | New DB objects must use `neuramark_` prefix. No `@supabase/supabase-js` in Client Components. No auth code edits. |
| Info | ADRs 0001–0003 untouched: no cron, no IG Graph publish, no FFmpeg/Fly for this story. Interview stays on the Vercel Next.js app. | ADR-0001, ADR-0002, ADR-0003 | None. |
| Info | Out of scope held: Ficha viva UI/PATCH/agents contract (US-2.x); Preferencias de producción visual; Stories IG, multicanal, ads; RBAC; Cliente reabre a voluntad; entrevista libre. TASKS Interview Builder remaining checkboxes (submit → ficha) stay for 1.3. | SPEC §1 Fuera de alcance; §3 M3–M4; PLAN Fase 1; TASKS.md Interview Builder | Implementers must not ship submit/ficha, visual prefs, or reopen-completed. |
| Low | Live dashboard copy is not canonical: EN `dashboard.interviewCard.title` = “Business interview”; ES = “Entrevista del negocio”. Not on CONTEXT _Evitar_, but ES must be **Entrevista inicial**. EN should use the agreed translation of that term (see Terminology). Fix when this story wires the CTA. Do not use _Evitar_ “onboarding interview” / “cuestionario”. Do not label the flow as creating Ficha viva. | CONTEXT **Entrevista inicial**; SPEC §3; TASKS.md FE copy | Update `messages/en.json` + `es.json` interview card (+ wizard strings) in this story. Leave `profileCard` (“Business profile” / “Perfil del negocio”) for US-2.x / US-1.3 — that is Ficha viva _Evitar_ territory, not 1.1 scope. |
| Low | Parent `USER_STORIES.md` US-1.3 FE says “redirect to Business Profile review”; US-2.x titles use “business profile”. CONTEXT _Evitar_ **Business Profile** / **perfil de negocio** for Ficha viva. Not a 1.1 veto. | CONTEXT Ficha viva | Do not copy those strings into 1.1 UI, CONTRACT, or SECURITY. |

---

### Terminology violations (CONTEXT)

None that **block** US-1.1 in `plan/stories/US-1.1/` (README.md, TASKS.md). Canonical use is correct: **Entrevista inicial**, **Cliente**, **Ficha viva** deferred to US-1.3.

**Confirm — PO open questions**

1. **Empty `restrictions` array valid?** **Yes.** SPEC lists restricciones as a step, not as a required non-empty set. Empty array = “none”. Freeze in CONTRACT (`items: string[]`, min 0).

2. **Tone/style free text vs closed enums?** **Not a SPEC conflict.** SPEC names steps only. CONTRACT freeze. Spec-guardian does not mandate either.

3. **EN dashboard “Business interview” vs Entrevista inicial?**  
   - **ES (required):** **Entrevista inicial**. Replace “Entrevista del negocio”. Never **cuestionario**, never **onboarding interview**.  
   - **EN (guidance):** CONTEXT does not list an EN canonical string. Prefer **Initial interview** as the translation of Entrevista inicial (closest to the term; not an _Evitar_ synonym). “Business interview” is not forbidden but is weaker and should be aligned when wiring the card.  
   - **Forbidden in UI/domain copy:** onboarding interview, cuestionario, prestador (as product role), dueño, usuario final, admin/administrador/staff, Business Profile / perfil de negocio (Ficha viva — do not use on this wizard).

Do not ship _Evitar_ terms in CONTRACT, SECURITY, or EN/ES product copy.

Note (not a US-1.1 veto): parent `plan/USER_STORIES.md` still says “Business Profile” in US-1.3/US-2.x. Do not propagate into this story’s later gates.

---

### Recommended action

Proceed to **SECURITY.md** (security-architect). Orchestrator **may** proceed to the SECURITY gate.

CONTRACT freeze items (non-negotiable for alignment; freeze later, not in this file):

1. One `neuramark_interview_sessions` row per Cliente (`UNIQUE (client_id)`). Load/persist by `getCurrentUser().id` only. No session id in URL or body.
2. Status enum `draft` \| `completed`; 1.1 writes `draft` only; strip/reject client-supplied `status` / `client_id`.
3. Seven steps in SPEC order; storage keys + Zod limits + empty `restrictions` allowed; tone/style representation (text vs enum).
4. Oversize → prefer 413; schema/required → 400. Optional DB CHECK vs app-only 64 KB is SECURITY.
5. Write predicate `status = 'draft'` (defense for future completed rows). Full completed read-only story remains US-1.2.
6. CSRF (Server Action origin check preferred), parameterized jsonb writes, RLS deny-by-default, `neuramark_` prefix, `requireActive()` on mutations, `no-store` on product HTML.
7. EN/ES: Entrevista inicial / Initial interview; no _Evitar_ synonyms; no Ficha viva labeling.
8. Explicit out of scope: US-1.2 dashboard resume prompt; US-1.3 submit/`completed`/Ficha viva; US-2.x; visual prefs; auth edits; Stories IG / ads / RBAC.

Do not write application code, CONTRACT.md, or SECURITY.md in this gate. Do not check off USER_STORIES acceptance criteria.
