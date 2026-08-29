# US-2.2 — Edit business profile

**Priority:** P0  
**Depends on:** US-2.1 ✅ CLOSED (`plan/stories/US-2.1/`) · US-1.3 ✅ (table + upsert) · runtime US-14.5 (`getCurrentUser()` / `requireActive()`, `(app)` layout)  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-2.2 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** nextjs-backend + nextjs-frontend (`docs/development/AGENT-ROSTER.md` Fase 1). No content/media/integrations specialist.  
**Canonical terms:** **Ficha viva** / Living profile · **Entrevista inicial** · Role: **Cliente** / **Operator**. Avoid CONTEXT _Evitar_ terms (Business Profile / perfil de negocio in product copy).

## Out of scope (do not implement here)

- **`profile_versions` history table** — SPEC Fuera V1; defer P1. Integer `version` bump on the row only.
- **US-2.3:** `getBusinessProfileForAgents` / agent DTO.
- **Preferencias de producción visual**, Consentimiento de avatar, assets (US-3.x) — strip from PATCH; no UI on `/profile` for them.
- **Redo Entrevista** / reopen wizard (SPEC Fuera V1).
- **US-2.1 rebuild:** read-only loader, missing CTA, dashboard primary card — extend with edit; do not fork identity rules.
- Auth changes: do **not** edit signup/login/logout/reset, `requireActive()` semantics, or add `/profile` to `isPublicPath`.
- `@supabase/supabase-js` in Client Components; `client_id` / profile id from body/query/headers as identity.
- LLM / profile enricher; public `GET`/`PATCH` Route Handler by UUID.

## Scope split

| Concern | Owner |
|---------|--------|
| Create/upsert on Entrevista submit | **US-1.3** (done) |
| Read-only Ficha viva + own-profile GET helper | **US-2.1** (done) |
| Edit / PATCH allowlist + version bump + visible `updated_at` | **US-2.2** (this story) |
| Agent API | **US-2.3** |

## PO decisions (freeze in CONTRACT unless SECURITY vetoes)

| Topic | Decision |
|-------|----------|
| Route / surface | Edit **on** `/profile` (same gated page). Prefer **Server Action** mutation (not public Route Handler). Keep `no-store` + off `isPublicPath`. |
| Allowlist | Exactly the **seven** interview keys: `services`, `zone`, `tone`, `offers`, `objections`, `style`, `restrictions`. Zod via `interviewAnswersCompleteSchema` / shared profile fields schema. |
| Strip / reject | Consent, `visual_mode` / Preferencias keys, and system fields rejected or stripped **even if present** — never written. Prefer **reject invalid keys** (strict Zod) over silent strip when keys are unknown; CONTRACT freezes. |
| Identity | `requireActive("handler")` / `getCurrentUser().id` only. **Reject/strip** `client_id`, `profile_id`, `id` from body. `UPDATE … WHERE client_id = $server`. |
| Version | Every successful edit: `version = version + 1` (server-side). Client cannot set `version`. |
| `updated_at` | Existing trigger and/or explicit set; **visible** on UI after save (last-write-wins AC). |
| Concurrency | **Last-write-wins** — no If-Match / version precondition required for V1 AC. Optional stale-toast if CONTRACT wants later. |
| Who changed it | AC [SEC] requires recording server-resolved user. **PO lean:** add nullable `updated_by uuid` → `neuramark_clients(id)` (or `auth_user_id` per SECURITY) set on each PATCH; if SECURITY accepts “audit via logs only,” document that — prefer column for agent traceability. CONTRACT freezes. |
| Restricted / consent AC | Interpreting USER_STORIES “Restricted fields require explicit re-confirmation”: **cannot** change consent/visual via this story; dedicated US-3.x flows own re-confirm. Do not add fake consent toggles on `/profile`. |
| Persist vs agent run | Edits persist on `neuramark_business_profiles.fields`. “Appear on next agent run” = same row agents will read in US-2.3 — **no** agent helper in this story. |
| Partial vs full replace | **PO lean:** PATCH body = **full** seven-key object (same completeness as interview submit) to avoid half-corrupt jsonb. CONTRACT may allow per-section patch if Zod merge is safe. |
| FE UX | Save + Cancel; explicit success toast preferred over silent optimistic-only (CONTRACT may allow optimistic + rollback). Cancel discards local edits. |
| Missing profile | No create-via-PATCH. Missing → keep US-2.1 CTA to `/interview`. |
| Labels | `style` = **Style** / **Estilo** (US-2.1 freeze). Page: Living profile / Ficha viva. |
| XSS | Controlled inputs + React text; no `dangerouslySetInnerHTML`. Same bar as interview / US-2.1. |
| DB | No `profile_versions`. Migration only for `updated_by` (or SECURITY-required audit column). |

## Carry-forwards / reuse (do not reinvent)

- Reuse `getBusinessProfileForClient` for load; add mutation Server Action (e.g. `updateBusinessProfile`) in `lib/profile/` + Zod in `lib/contracts/profile.ts` / interview schemas.
- Reuse field shapes from Entrevista steps (list/description schemas) for edit forms — align UX with interview where practical without reopening the wizard.
- Keep RLS deny-by-default + service-role server-only.
- Do **not** change auth allowlist.
- US-2.1 SECURITY carry-forward: never introduce `client_id` from the browser “because edit needs it.”

---

## FE checklist

Concrete BE consumer: Server Action PATCH / `updateBusinessProfile` (CONTRACT name); RSC still loads via `getBusinessProfileForClient`.

- [x] **Edit UI on `/profile`:** allow editing the seven allowlisted sections; Save + Cancel; disable save while in-flight.
- [x] **Success feedback:** optimistic **or** explicit success toast (EN/ES) after persist; show refreshed **last-updated** timestamp (and optionally subtle `version`).
- [x] **Cancel** restores last server-loaded values; no orphan dirty state after navigation if practical.
- [x] **Missing profile:** no edit chrome — keep onboarding CTA → `/interview`.
- [x] EN + ES in `messages/en.json` / `es.json`. Canonical **Ficha viva** / **Living profile**; Style / Estilo. Avoid CONTEXT _Evitar_.
- [x] No Supabase in Client Components; no `client_id` / profile UUID as identity in URL or client fetch.
- [x] XSS bar: controlled inputs / text nodes only.
- [x] Do **not** expose consent / Preferencias visuales editors on this page (US-3.x).

---

## BE checklist

Concrete FE consumers: `/profile` edit Client Component / form calling the Server Action; post-save revalidation for RSC timestamp.

- [x] **Server Action PATCH** (CONTRACT name): `requireActive("handler")`; arity without tenant args; `WHERE client_id = user.id` only.
- [x] **Zod** validate allowlisted seven keys; **strict** — reject unknown keys / consent / `visual_mode` / system fields even if smuggled.
- [x] On success: write `fields`; **bump `version`**; ensure **`updated_at`**; record **who** per CONTRACT freeze; return updated view slice (`fields`, `version`, `updatedAt`) for FE.
- [x] Last-write-wins (no required optimistic lock); parameterized UPDATE; service-role Node only.
- [x] Strip/reject identity and privilege keys (`client_id`, `role`, `auth_user_id`, …).
- [x] Never log full free-text `fields` in production (codes only).
- [x] `revalidatePath("/profile")` (and dashboard if needed).
- [x] Automated tests: allowlist happy path; smuggled consent/visual/system rejected; foreign `client_id` ignored; version increments; missing row → typed error (no create); CSRF/session required for mutation.
- [x] Do **not** implement `getBusinessProfileForAgents`.

**AC mapping (for validator later):** Persist seven fields; consent/visual not writable here; LWW + visible timestamp; [SEC] allowlist; [SEC] who + version bump.

---

## DB checklist

All objects keep `neuramark_` prefix. Migrations only if SECURITY/CONTRACT require.

- [x] **Verify** `neuramark_business_profiles` (`fields`, `version`, `updated_at` trigger, UNIQUE `client_id`, RLS zero policies) — do not duplicate create.
- [x] **`profile_versions`:** **out** — do not create.
- [x] **Migration YES (CONTRACT freeze):** nullable `updated_by uuid` FK → `neuramark_clients(id)` `ON DELETE SET NULL`; set on every successful PATCH. No `profile_versions`.
- [x] No Preferencias / consent columns on this table via this story.

---

## Gates (orchestrator)

- [ ] SPEC-REVIEW.md (spec-guardian — S3.M3 edit + allowlist + versiona; Fuera V1 historial)
- [ ] SECURITY.md (security-architect)
- [x] CONTRACT.md authored (nextjs-backend) — FE signoff **done** (`Reviewed by FE: yes — 2026-08-29`)
- [ ] BUILD (FE + BE) — BE/DB done; FE pending
- [ ] VALIDATION.md
- [ ] QA.md

**PREP complete when:** `README.md` + this `TASKS.md` exist; AC in `USER_STORIES.md` remain unchecked; no CONTRACT/SECURITY/code from PO.

---

## Open questions (for SPEC / SECURITY / CONTRACT)

1. **`updated_by` column vs logs-only** — AC [SEC] “records who.” Table today has no actor column. **PO lean:** add `updated_by uuid` FK to `neuramark_clients(id)`, set on every PATCH from `getCurrentUser().id`. SECURITY confirm.
2. **Partial PATCH vs full seven-key replace** — **PO lean:** full replace of `fields` with complete Zod object (safer jsonb). FE may still edit one section at a time but submit merged full snapshot.
3. **Strict reject vs silent strip** of non-allowlisted keys — **PO lean:** `.strict()` Zod → validation error (clearer security tests). Confirm SECURITY.
4. **Optimistic UI vs await toast** — USER_STORIES allows either. **PO lean:** await Server Action + success toast (simpler rollback); optimistic OK if CONTRACT specifies rollback on failure.
5. **Show `version` in UI** — AC needs bump for agents; display optional. **PO lean:** show `updated_at` prominently; `version` subtle or omit until US-2.3 tooling.
6. **Interview `completed` + orphan** — Editing when interview not `completed` but profile row exists (US-2.1 show rule). **PO lean:** allow edit if own row exists (same as view).
7. **Operator edit of another Cliente** — Out of V1. Confirm no `as_client_id` bypass.
8. **AC “appear on next agent run”** — Satisfied by persisting to the canonical row; US-2.3 wires agents. Confirm spec-guardian: no BLOCKED dependency on US-2.3 for closing US-2.2 persist AC (validator may note soft dependency).

No SPEC amendment required: S3.M3 already requires edit allowed fields, versiona ediciones, PATCH allowlist without consent/visual/system; historial completo Fuera V1. Preferencias / consent stay US-3.x.
