## Spec Review — US-2.2

### Verdict: ALIGNED

US-2.2 (edit Ficha viva on `/profile` via Server Action PATCH; seven interview-key allowlist; Zod `.strict()`; version bump + `updated_at` + server-resolved `updated_by`; await-save + success toast; last-write-wins) matches SPEC §3 Business Profile / **Ficha viva** (S3.M3), Flujo S4.1 (ficha maintain slice), SPEC §2 Cliente role, SPEC §5–§6, and CONTEXT **Ficha viva** / **Entrevista inicial**. Continuity with US-2.1 (read-only) is correct: mutation owns this story only. Preferencias de producción visual / Consentimiento de avatar stay US-3.x. No ADR, playbook/trend, SC-2, or V1 out-of-scope breach.

Orchestrator product defaults (encoded below) are **SPEC-aligned**. They freeze PREP open questions that would otherwise leave CONTRACT ambiguous; none require a SPEC amendment. Verdict is **ALIGNED** (not DRIFT / CONFLICT / BLOCKED).

---

### Scope split vs US-2.1 / US-2.3 / US-3.x — confirm

| Story | PO scope | SPEC mapping | Verdict |
|-------|----------|--------------|---------|
| **US-2.1** ✅ CLOSED | Read-only Ficha viva; `getBusinessProfileForClient`; missing CTA; dashboard primary card | Cliente: **ver resumen vivo**; CTA si no hay ficha | **ALIGNED** (shipped) |
| **US-2.2** (this) | Edit UI + PATCH allowlist; bump `version` / `updated_at` / who; no history table | Cliente: **editar campos permitidos** sin rehacer Entrevista; System: **versiona ediciones**; PATCH allowlist (sin consent / modo visual / campos sistema). Fuera V1: historial completo | **ALIGNED** |
| **US-2.3** | `getBusinessProfileForAgents` | System: contrato solo-server para agentes | **ALIGNED** (out) |
| **US-3.x** | Preferencias de producción visual + Consentimiento de avatar | S3.M4 — not editable via S3.M3 PATCH | **ALIGNED** (out) |

SPEC S3.M3 lists view + edit + agent helper as **module** capabilities. Parent `USER_STORIES.md` already splits view (2.1) vs edit (2.2) vs agents (2.3). Do not amend SPEC. Do not check off USER_STORIES AC here.

**AC “appear on next agent run”:** Satisfied for this story by persisting to the same `neuramark_business_profiles.fields` (+ bumped `version`) that US-2.3 will read. Closing US-2.2 does **not** require shipping US-2.3. Validator may note soft dependency; not a SPEC BLOCKED.

---

### Orchestrator defaults — SPEC alignment

| # | Default | SPEC / continuity | Spec-guardian |
|---|---------|-------------------|---------------|
| 1 | Add **`updated_by`** FK (server user) on each PATCH for [SEC] audit AC | USER_STORIES US-2.2 [SEC]: “Every edit records who…”. SPEC S3.M3: versiona ediciones; Fuera V1 = historial completo de versiones (table of snapshots), **not** “no actor column.” Column on the live row is audit metadata, not a version-history product. | **ALIGNED.** Prefer `updated_by uuid` → `neuramark_clients(id)` (or SECURITY-approved equivalent) set from `getCurrentUser().id` only. Logs-only is weaker; do not adopt unless SECURITY vetoes the column with a documented floor. |
| 2 | **Full seven-key** `fields` replace (not sparse partial PATCH) | SPEC: PATCH with allowlist; Interview Builder completeness schema already defines the seven keys. Sparse merge risks half-corrupt jsonb feeding agents. | **ALIGNED.** Body = complete object matching `interviewAnswersCompleteSchema` / shared profile fields schema. FE may edit one section at a time but **submit merged full snapshot**. |
| 3 | Zod **`.strict()`** — reject unknown keys | SPEC S3.M3 + USER_STORIES [SEC]: consent / `visual_mode` / system fields cannot be modified even if present. Reject is clearer than silent strip for security tests. | **ALIGNED.** Unknown / smuggled keys → validation error; never written. |
| 4 | FE **await** Server Action + **success toast** (not optimistic-only) | USER_STORIES FE: “optimistic or explicit success toast.” Await + toast is the explicit path; simpler rollback; matches LWW + visible timestamp after persist. | **ALIGNED.** Optimistic-only without confirmed persist = weaker UX vs AC timestamp; do not freeze optimistic as default. |
| 5 | Emphasize **`updated_at`** in UI; **`version`** bump for agents (show lightly or omit) | SPEC: versiona ediciones (agent traceability); Fuera V1 historial UI. US-2.1 already optional `version` in DTO. AC LWW + timestamp visible. | **ALIGNED.** Always bump `version` server-side. UI: last-updated prominent; `version` subtle or omit until US-2.3 tooling. |
| 6 | Allow **edit when profile row exists**, even if interview edge cases (not `completed`) | US-2.1 SPEC-REVIEW #6: show if row exists. Edit is the mutate twin of that view rule. SPEC CTA only when **no hay ficha**. | **ALIGNED.** No create-via-PATCH; missing row → keep US-2.1 CTA → `/interview`. |
| 7 | **No Operator cross-tenant**; **no `profile_versions` table** V1 | SPEC: no RBAC UI V1; S3.M3 Fuera V1 historial completo. USER_STORIES DB “optional profile_versions P1 nice-to-have” correctly deferred. | **ALIGNED.** Reject any `as_client_id` / foreign id. Integer bump on the row only. |
| 8 | Consent / Preferencias de producción visual **not editable** here (US-3.x) | SPEC S3.M3: PATCH sin consent/modo visual. USER_STORIES AC “restricted fields require explicit re-confirmation” → satisfied by **blocking** silent change on this endpoint; dedicated re-confirm flows stay US-3.x. | **ALIGNED.** Do not add consent/visual toggles on `/profile`. |

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| Info | Story supports SC-3/SC-4 indirectly (Cliente keeps Ficha viva current without redoing Entrevista; agents consume current data later). Does not touch Aprobación, Publicación IG, grabación humana, Ciclo semanal, Playbook, Trend, Preferencias de producción visual. No publish path → SC-2 intact. | SPEC §1 SC-1..SC-4; Flujo S4.1; PLAN Fase 1 | None. Do not add IG, Stories, ads, generation, visual modalities, or agent helper. |
| Info | Roles unchanged: **Cliente** edits own Ficha viva; **System** validates + writes + bumps version / `updated_at` / `updated_by`; **Operator** cross-tenant edit absent V1. Still `requireActive("handler")` / `getCurrentUser()` only. | SPEC §2; §3 S3.M3 + Authentication | CONTRACT: reject `client_id` / `profile_id` / `id` / client-supplied `version` as write authority. |
| Info | **Edit vs agents vs visual prefs** cut is correct. Persist to canonical row; US-2.3 wires agents. Preferencias / Consentimiento stay US-3.x. No LLM rewrite of profile. No Cliente reopen Entrevista (Fuera V1). | SPEC §3 S3.M3 vs M2 Fuera vs M4; USER_STORIES US-2.x / US-3.x | CONTRACT non-goals. |
| Info | **Route continuity:** edit **on** `/profile` (US-2.1 surface). Prefer Server Action under `(app)`; no public `/api/profile` with tenant ids. Table verify-only (+ optional `updated_by` migration). `neuramark_` prefix. RLS deny-by-default + service-role Node only. | SPEC §5–§6; US-2.1 SECURITY carry-forward | Keep `no-store`; off `isPublicPath`. |
| Info | **NFR / stack:** Next.js App Router; i18n EN+ES; multi-tenant `client_id` from server only; free-text via controlled inputs (XSS bar). Not ADR-0003 long work — stays on Vercel app. | SPEC §5–§6; ADR-0001/0002/0003 | No auth redesign. |
| Info | ADRs 0001–0003 untouched: no cron, no IG Graph publish, no FFmpeg/Fly. | ADR-0001, ADR-0002, ADR-0003 | None. |
| Info | Out of scope held: `profile_versions` history table; US-2.3 agent helper; Preferencias visuales / consent UI; Cliente reopen Entrevista; Stories IG, multicanal, ads; RBAC; Operator cross-tenant; public Route Handler by UUID; LLM enricher. | SPEC §1 Fuera; §3 S3.M3 Fuera V1 historial | Implementers must not create history table or visual editors. |
| Low | Parent `USER_STORIES.md` title/FE still say “business profile” / “interview”; module title “Business Profile”. CONTEXT _Evitar_ for product copy. Story README/TASKS mostly correct (**Ficha viva** / Living profile). | CONTEXT **Ficha viva**; **Entrevista inicial** | Do not propagate _Evitar_ into CONTRACT/i18n. Keep Style / Estilo for `style`. Optional later parent-title cleanup. |
| Low | USER_STORIES DB line lists optional `profile_versions` — correctly scoped **out** in PREP (SPEC Fuera V1). Integer bump satisfies agent traceability AC with `updated_by`. | SPEC S3.M3 Fuera V1 | CONTRACT: do not create `profile_versions`. |

---

### Terminology violations (CONTEXT)

**None that block** in `plan/stories/US-2.2/README.md` or `TASKS.md` once orchestrator defaults apply. Canonical use is correct: **Ficha viva**, **Entrevista inicial**, **Cliente**, **Operator**, **Preferencias de producción visual**, **Consentimiento de avatar**.

**Forbidden in UI / domain copy / later CONTRACT & SECURITY:**

| Prefer | _Evitar_ |
|--------|----------|
| **Ficha viva** / Living profile (EN UI) | Business Profile, perfil de negocio |
| **Entrevista inicial** / Initial interview | onboarding interview, cuestionario |
| **Cliente** | prestador (as product role), dueño, usuario final |
| **Operator** | admin, administrador, staff |
| **Preferencias de producción visual** | avatar mode, visual preferences (as entity name), modo único global |
| **Consentimiento de avatar** | consent ledger (in product copy) |
| **Estilo** / **Style** (field `style`) | Brand notes / Notas de marca as primary label |

Note (not a US-2.2 PREP veto): parent `plan/USER_STORIES.md` still uses “Business Profile” / “business profile” / “interview” in titles and FE lines — do not copy into product strings or this story’s later gates.

---

### Blockers for SECURITY / CONTRACT

**SPEC blockers:** none. Proceed to SECURITY.

| Item | Blocks? | Guidance |
|------|---------|----------|
| `updated_by` column vs logs-only | **Resolved for SPEC** (column **ALIGNED**). | SECURITY confirm FK target (`neuramark_clients(id)` preferred). Migration in-scope if required. |
| Full seven-key replace vs sparse PATCH | **Resolved for SPEC** (full replace **ALIGNED**). | CONTRACT: body = complete seven-key schema; FE submits merged snapshot. |
| Strict reject vs silent strip | **Resolved for SPEC** (`.strict()` **ALIGNED**). | SECURITY tests: smuggled consent/visual/system → reject. |
| Await toast vs optimistic | **Resolved for SPEC** (await + toast **ALIGNED**). | CONTRACT may allow optimistic only if rollback-on-failure is specified; default = await. |
| Show `updated_at` / light `version` | **Resolved for SPEC**. | Always bump `version`; UI emphasizes timestamp. |
| Edit when row exists (interview edge) | **Resolved for SPEC** (same as US-2.1 show rule). | No create-via-PATCH; missing → CTA `/interview`. |
| Operator cross-tenant / `profile_versions` | **Resolved for SPEC** (out **ALIGNED**). | No `as_client_id`; no history table. |
| Consent / visual not editable | **Resolved for SPEC** (US-3.x **ALIGNED**). | AC re-confirmation = block here + dedicated flows later. |
| “Next agent run” without US-2.3 | **No SPEC block.** Persist AC closable without agent helper. | Soft dependency note for validator only. |

---

### Recommended action

Proceed to **SECURITY.md** (security-architect). Orchestrator **may** proceed to the SECURITY gate.

**Defaults aligned?** Yes — all eight orchestrator defaults are **ALIGNED** with SPEC S3.M3 / CONTEXT / ADRs / US-2.1 continuity. No SPEC amendment. No CONFLICT.

CONTRACT freeze items (non-negotiable for alignment; freeze later, not in this file):

1. Route: edit **on** `/profile` under `(app)`; Server Action mutation; `requireActive("handler")`; `Cache-Control: no-store`; off `isPublicPath`.
2. Action `updateBusinessProfile` (or CONTRACT name): arity without tenant args; `WHERE client_id = getCurrentUser().id` only; reject/strip `client_id` / `profile_id` / `id` / client `version` authority.
3. Zod: full seven-key object via shared interview/profile schema; **`.strict()`** — reject unknown / consent / Preferencias / system keys.
4. On success: replace `fields`; `version = version + 1`; set/rely on `updated_at`; set **`updated_by`** from server user; return view slice for FE; `revalidatePath("/profile")`.
5. Concurrency: last-write-wins; no required If-Match for V1 AC.
6. FE: Save + Cancel; **await** persist + success toast (EN/ES); show refreshed **last-updated**; optional subtle `version`; controlled inputs only (XSS bar).
7. Missing profile: no edit chrome — CTA → `/interview`. Do not create row via PATCH.
8. EN/ES: **Ficha viva** / Living profile; Style / Estilo; no CONTEXT _Evitar_.
9. Explicit out of scope: `profile_versions`; US-2.3 `getBusinessProfileForAgents`; Preferencias / Consentimiento editors; Operator cross-tenant; auth redesign; LLM enricher; public Route Handler by UUID; redo Entrevista.

Do not write application code, CONTRACT.md, or SECURITY.md in this gate. Do not check off USER_STORIES acceptance criteria.
