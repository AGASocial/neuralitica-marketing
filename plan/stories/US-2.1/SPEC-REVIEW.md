## Spec Review — US-2.1

### Verdict: ALIGNED

US-2.1 (replace US-1.3 stub at `/profile` with **read-only Ficha viva** — all seven interview-mapped fields; own-profile load via `getCurrentUser()` / `requireActive()`; missing row → onboarding CTA to Entrevista; dashboard post-onboarding emphasizes `/profile` without starving US-X.1) matches SPEC §3 Business Profile / **Ficha viva** (S3.M3), Flujo S4.1 (ficha review slice), SPEC §2 Cliente role, SPEC §5–§6, and CONTEXT **Ficha viva** / **Entrevista inicial**. Edit (US-2.2) and `getBusinessProfileForAgents` (US-2.3) correctly remain out. No ADR, visual-modality, playbook/trend, SC-2, or V1 out-of-scope breach.

Orchestrator product defaults (encoded below) are **SPEC-aligned**. They supersede PREP PO leans that would **DRIFT** (hard dashboard redirect; “brand notes” label). Residual open items are SECURITY/CONTRACT floors, not SPEC conflicts. Verdict is **ALIGNED** (not CONFLICT / BLOCKED).

---

### Scope split vs US-1.3 / US-2.2 / US-2.3 — confirm

| Story | PO scope | SPEC mapping | Verdict |
|-------|----------|--------------|---------|
| **US-1.3** ✅ CLOSED | Submit → upsert `neuramark_business_profiles`; stub `/profile` + `getProfileStubSummary` | System: al submit completo crea/actualiza Ficha viva (idempotente). Stub until full view. | **ALIGNED** (shipped) |
| **US-2.1** (this) | Full **read-only** Ficha viva UI; own-profile helper; missing CTA; dashboard primary entry to `/profile` when ficha exists | Cliente: **ver resumen vivo del negocio**; CTA onboarding si no hay ficha. | **ALIGNED** |
| **US-2.2** | Edit / PATCH allowlist; version bump | Cliente: editar campos permitidos sin rehacer Entrevista; System: PATCH allowlist; versiona ediciones. | **ALIGNED** (out) |
| **US-2.3** | `getBusinessProfileForAgents` | System: contrato solo-server para agentes. | **ALIGNED** (out) |

SPEC S3.M3 lists view + CTA + create-on-interview + edit + agent helper as **module** capabilities, not a single-story ship. Parent `USER_STORIES.md` US-2.1 AC and US-1.3 note already split create (1.3) vs full read UI (2.1). Do not amend SPEC. Do not check off USER_STORIES AC here.

---

### Orchestrator defaults — SPEC alignment

| # | Default | SPEC / continuity | Spec-guardian |
|---|---------|-------------------|---------------|
| 1 | **Dashboard:** primary card/CTA to `/profile` when Ficha viva exists — **not** hard redirect off `/` or `/dashboard`. Coexist with other dashboard cards (US-X.1). | SPEC §1 Fuera: “Dashboard complejo”. US-X.1: dashboard as default entry with multiple cards (interview, profile, approvals…). USER_STORIES US-2.1 AC “Profile loads on dashboard as default post-onboarding view” = **emphasize** Ficha viva, not replace the dashboard shell. PREP PO lean (soft redirect) would starve US-X.1 home and future cards. | **ALIGNED.** Freeze primary card / elevated CTA in CONTRACT. Hard redirect = **DRIFT** — do not adopt. |
| 2 | Field `style` UI label: **Estilo** / **Style** (interview terminology) | SPEC S3.M2/M3 step list includes **estilo**. US-1.1 CONTRACT/i18n already use Style / Estilo. USER_STORIES FE line “brand notes” is parent wording, not a product-label mandate. | **ALIGNED.** Keep jsonb key `style`. Do **not** ship “Brand notes” / “Notas de marca” as the primary section label (mild PREP DRIFT if used). Optional helper text may clarify writing style. |
| 3 | **Re-validate jsonb `fields` with Zod on read** | SPEC: schema-validate on write path (S3.M2); S3.M3 does not forbid read-time validation. Defense in depth for Operator SQL / corrupt rows. Soft empty/error, not 500 dump. | **ALIGNED.** CONTRACT freezes schema reuse (`interviewAnswersCompleteSchema` or shared profile fields schema). |
| 4 | Show **`updated_at`** (light); **`version` optional** / subtle | SPEC: versiona ediciones (edit story); Fuera V1: historial completo de versiones. AC does not require either. | **ALIGNED.** Light `updated_at` OK. Full version history UI still out (US-2.2 / nice-to-have). |
| 5 | New helper **`getBusinessProfileForClient`** (replace stub summary for full fields) | SPEC names `getBusinessProfileForAgents` for agents (US-2.3). Cliente view helper is distinct and in scope for S3.M3 “ver resumen vivo”. | **ALIGNED.** Do not implement or alias agent DTO here. Stub callers may thin-wrap or delete after page swap. |
| 6 | If profile **row exists** without completed interview, **still show** Ficha viva | SPEC CTA only when **no hay ficha**. Existence of row = living summary available. Interview status remains US-1.2 dashboard card concern. | **ALIGNED.** SECURITY: confirm no cross-tenant leak (own `client_id` only). |
| 7 | **No Operator cross-tenant view** in V1 | SPEC: no RBAC UI V1; Operator multi-client calendar is P2/later. This page is Cliente own-ficha only. | **ALIGNED.** Reject any `client_id` / profile id from browser. No Operator “view as Cliente” param. |

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| Info | Story supports SC-3 (Cliente can review Ficha viva after Entrevista so primer lote path continues). Does not touch Aprobación, Publicación IG, grabación humana, Ciclo semanal, Playbook, Trend, Preferencias de producción visual. No publish path → SC-2 intact. | SPEC §1 SC-1..SC-4; Flujo S4.1; PLAN Fase 1 | None. Do not add IG, Stories, ads, generation, visual modalities, PATCH, or agent APIs. |
| Info | Roles unchanged: **Cliente** views own Ficha viva; **System** loads by server identity; **Operator** cross-tenant UI absent V1. Mutations for edit remain US-2.2. Still `requireActive()` / `getCurrentUser()`. | SPEC §2; §3 S3.M3 + Authentication | CONTRACT: reject `client_id` / `profile_id` / `id` from query/body. |
| Info | **View vs edit vs agents** cut is correct. Read-only only. Preferencias de producción visual stay US-3.x. No LLM rewrite of profile. | SPEC §3 S3.M3 vs M4; USER_STORIES US-2.x / US-3.x | CONTRACT non-goals. |
| Info | **Route continuity:** replace stub **in place** at `/profile` (US-1.3 freeze). Table verify-only. `neuramark_` prefix. RLS deny-by-default + service-role Node only unchanged. | SPEC §5–§6; US-1.3 CONTRACT | Keep `no-store`; off `isPublicPath`. |
| Info | **NFR / stack:** Next.js App Router; RSC + server helper preferred; i18n EN+ES; multi-tenant `client_id` from server only; free-text as React text nodes (XSS bar). Not ADR-0003 long work — stays on Vercel app. | SPEC §5–§6; ADR-0001/0002/0003 | No auth redesign. |
| Info | ADRs 0001–0003 untouched: no cron, no IG Graph publish, no FFmpeg/Fly. | ADR-0001, ADR-0002, ADR-0003 | None. |
| Info | Out of scope held: US-2.2 PATCH; US-2.3 agent helper; Preferencias visuales; Cliente reopen Entrevista; Stories IG, multicanal, ads; RBAC; `profile_versions` history table. | SPEC §1 Fuera; §3 S3.M3 Fuera V1 historial | Implementers must not add edit controls or agent imports. |
| Low | Parent `USER_STORIES.md` US-2.1 FE line says “brand notes”; module title still “Business Profile”. CONTEXT _Evitar_ for product copy. Story README/TASKS mostly correct (**Ficha viva** / Living profile). Orchestrator default #2 resolves label to Style / Estilo. | CONTEXT **Ficha viva**; SPEC estilo | Do not propagate _Evitar_ or “brand notes” as primary UI label into CONTRACT/i18n. Optional later parent-title cleanup. |
| Low | PREP PO lean “soft redirect `/dashboard` → `/profile`” conflicts with US-X.1 multi-card dashboard and SPEC avoidance of complex/single-purpose dashboard takeover. | SPEC §1 Fuera dashboard complejo; USER_STORIES US-X.1; US-2.1 AC “default … view” | **Resolved for SPEC** by orchestrator default #1 (primary card/CTA). CONTRACT must not freeze hard redirect. |

---

### Terminology violations (CONTEXT)

**None that block** in `plan/stories/US-2.1/README.md` or `TASKS.md` once orchestrator defaults apply. Canonical use is correct: **Ficha viva**, **Entrevista inicial**, **Cliente**, **Operator**.

**Forbidden in UI / domain copy / later CONTRACT & SECURITY:**

| Prefer | _Evitar_ |
|--------|----------|
| **Ficha viva** / Living profile (EN UI) | Business Profile, perfil de negocio |
| **Entrevista inicial** / Initial interview | onboarding interview, cuestionario |
| **Cliente** | prestador (as product role), dueño, usuario final |
| **Operator** | admin, administrador, staff |
| **Estilo** / **Style** (field `style`) | Brand notes / Notas de marca as primary label |

Note (not a US-2.1 PREP veto): parent `plan/USER_STORIES.md` still uses “Business Profile” / “business profile” / “brand notes” in titles and FE lines — do not copy into product strings or this story’s later gates.

---

### Blockers for SECURITY / CONTRACT

**SPEC blockers:** none. Proceed to SECURITY.

| Item | Blocks? | Guidance |
|------|---------|----------|
| Dashboard primary card vs hard redirect | **Resolved for SPEC** (primary card **ALIGNED**; hard redirect = DRIFT). | CONTRACT freezes primary/first Ficha viva card + CTA to `/profile` when `exists`; no forced redirect off dashboard. |
| `style` label Style/Estilo vs brand notes | **Resolved for SPEC** (Style/Estilo **ALIGNED**). | CONTRACT + i18n align with US-1.1 interview step labels. |
| Read-time Zod | **No SPEC block.** Default validate-on-read = **ALIGNED**. | CONTRACT: invalid → soft empty/error + log code only. |
| Show `updated_at` / optional `version` | **No SPEC block.** | CONTRACT freezes display; omit full history. |
| `getBusinessProfileForClient` vs extend stub | **No SPEC block.** New full helper **ALIGNED**. | Distinct from US-2.3 `getBusinessProfileForAgents`. |
| Orphan profile without completed interview | **Resolved for SPEC** (show if row exists **ALIGNED**). | SECURITY: own-tenant only; dashboard interview card independent. |
| Operator cross-tenant view | **Resolved for SPEC** (out of V1 **ALIGNED**). | No param; reject foreign ids. |
| Public GET Route Handler | **No SPEC block.** RSC-only preferred. | Optional thin action only if CONTRACT needs refresh. |
| Edit / agent API | Confirmed **out of scope**. | US-2.2 / US-2.3. |

---

### Recommended action

Proceed to **SECURITY.md** (security-architect). Orchestrator **may** proceed to the SECURITY gate.

CONTRACT freeze items (non-negotiable for alignment; freeze later, not in this file):

1. Route: replace stub **in place** at `/profile` under `(app)`; `requireActive("page")`; `Cache-Control: no-store`; off `isPublicPath`.
2. Helper `getBusinessProfileForClient` (or CONTRACT name): load by `getCurrentUser().id` only; reject/strip `client_id` / `profile_id` / `id` from browser; return typed fields + optional `updatedAt` / `version` or explicit missing.
3. Zod-validate jsonb `fields` on read (seven keys 1:1 interview); invalid → soft empty/error, not 500.
4. FE read-only sections: services, zone, tone, offers, objections, **style** (label Style / Estilo), restrictions; empty arrays → empty-state copy.
5. Missing profile → CTA to `/interview` (Entrevista inicial); never crash.
6. Dashboard: when Ficha viva exists, **primary card/CTA** to `/profile`; **no** hard redirect that removes US-X.1 coexistence; pre-onboarding keeps interview Start/Resume.
7. EN/ES: **Ficha viva** / Living profile; Style / Estilo; no CONTEXT _Evitar_ synonyms.
8. Explicit out of scope: US-2.2 PATCH/edit UI; US-2.3 `getBusinessProfileForAgents`; Preferencias de producción visual; Operator cross-tenant; auth redesign; LLM profile enricher; `profile_versions` table.

Do not write application code, CONTRACT.md, or SECURITY.md in this gate. Do not check off USER_STORIES acceptance criteria.
