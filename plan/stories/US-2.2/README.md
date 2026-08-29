# US-2.2 — Edit business profile

**Status:** CLOSED — VALIDATE PASS WITH NOTES; QA APPROVE WITH NOTES (5/5 AC; FE `6b99910`, BE `bd7ad08`).

**As a** Cliente, **I want** to update my Ficha viva, **so that** agents use current information without redoing the full Entrevista inicial.

Add **edit** on the existing `/profile` Ficha viva (US-2.1 read-only): Client may change the **seven interview field keys** via a Server Action PATCH with Zod + allowlist; save/cancel; success feedback; **version** bump + **updated_at**; last-write-wins with visible timestamp. Consent, visual-mode / Preferencias de producción visual, and system columns are **stripped/rejected** even if present in the payload. No full Entrevista redo.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-2.2 (do not redefine; do **not** mark done in PREP)

**This folder:** [`plan/stories/US-2.2/`](./) — `README.md` + `TASKS.md` (this PREP). `SECURITY.md` and `CONTRACT.md` are authored in later gates, not here.

**Depends on:** [US-2.1](../US-2.1/) ✅ CLOSED — read-only Ficha viva at `/profile`; `getBusinessProfileForClient()`; seven-key view DTO + optional `updatedAt` / `version`. Runtime identity: [US-14.5](../US-14.5/) (`getCurrentUser()` / `requireActive()`). Profile row create/upsert: [US-1.3](../US-1.3/) ✅ CLOSED.

**Unblocks:** [US-2.3](../../USER_STORIES.md) (agents consume bumped `version` / current `fields`) · later assembly logo settings that touch profile (US-9.x depends on US-2.2).

---

## Scope in

| Area | What 2.2 adds |
|------|----------------|
| **FE** | Edit UI on `/profile` for the **seven** allowlisted keys (`services`, `zone`, `tone`, `offers`, `objections`, `style`, `restrictions`): inline and/or form edit; **Save** / **Cancel**; optimistic or explicit success toast; show **last-updated timestamp** after save (last-write-wins visible). EN/ES. Keep XSS bar (text nodes / controlled inputs only). Missing profile still CTA → `/interview` (no invent edit-without-row). |
| **BE** | Server Action **PATCH** (CONTRACT name, e.g. `updateBusinessProfile`): `requireActive("handler")`; identity from `getCurrentUser().id` only; **Zod** validate body against seven-key complete schema; **allowlist** — strip/reject `consent*`, `visual_mode` / Preferencias, and system fields (`client_id`, `id`, `version` from client as authority, `source_interview_id`, `created_at`, `updated_at`, role/auth keys); write `fields`; **bump `version`**; rely on / set **`updated_at`**; record **who** (server user — CONTRACT/SECURITY freeze column vs audit); last-write-wins (no optimistic-lock AC). Revalidate `/profile`. |
| **DB** | Prefer **verify-only** US-1.3 table (`fields`, `version`, `updated_at` trigger). Migration **only if** SECURITY/CONTRACT require `updated_by` (or equivalent) to satisfy AC “[SEC] Every edit records who…”. **No** `profile_versions` history table in V1. |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **`profile_versions` history table** | SPEC S3.M3 Fuera V1 (nice-to-have). Defer P1. Version **integer bump** on the row is enough for agent traceability. |
| **US-2.3** | `getBusinessProfileForAgents` — do not build agent DTO here. Edits write the same `fields` agents will read later. |
| **Preferencias de producción visual / consent** | US-3.x — not editable via this PATCH; strip even if smuggled in payload. AC “restricted fields require explicit re-confirmation” → satisfied by **not** allowing silent change here; dedicated re-confirm flows stay US-3.x. |
| **Redo Entrevista** | SPEC Fuera V1: Cliente reabre entrevista a voluntad. Edit Ficha viva ≠ reopen wizard. |
| **US-2.1 rebuild** | Read path, missing CTA, dashboard primary card — **shipped**. Extend with edit controls; do not fork loader identity rules. |
| Auth redesign | Do not edit `lib/auth/*` allowlist / signup / login. Keep `/profile` off `isPublicPath`. |
| LLM rewrite of profile | Deterministic Cliente edits only. |
| Public Route Handler / GET-by-id | Prefer Server Action under `(app)`; no `/api/profile` with tenant ids. |

## What US-2.1 already shipped (do not duplicate)

From `plan/stories/US-2.1/` (CONTRACT / VALIDATION / QA) and code:

- `/profile` full **read-only** Ficha viva; `getBusinessProfileForClient()` arity 0; Zod on read; soft missing / `loadFailed`.
- View DTO: seven sections + optional `updatedAt` / `version`; Style / Estilo labels; EN/ES; `Cache-Control: no-store`; off `isPublicPath`.
- Dashboard: primary card/CTA → `/profile` when exists — **no** hard redirect.
- Table `neuramark_business_profiles`: jsonb `fields` 1:1 interview keys, `version`, `updated_at` trigger, RLS zero policies, service-role Node only.

**US-2.2 adds mutation on the same page and row** — keep ownership-scoped writes (`WHERE client_id = $server`); never accept `client_id` / profile id from the browser (US-2.1 SECURITY carry-forward).

## Field allowlist (interview → editable Ficha viva)

| `fields` key (DB) | UI concept | Editable via US-2.2 PATCH? |
|-------------------|------------|----------------------------|
| `services` | Services / Servicios | **Yes** |
| `zone` | Zone / Zona | **Yes** |
| `tone` | Tone / Tono | **Yes** |
| `offers` | Offers / Ofertas | **Yes** |
| `objections` | Objections / Objeciones | **Yes** |
| `style` | Style / Estilo | **Yes** |
| `restrictions` | Restrictions / Restricciones | **Yes** |

**Never via this endpoint (strip/reject):** consent flags / Consentimiento de avatar; `visual_mode` / Preferencias de producción visual; `client_id`, profile `id`, `source_interview_id`, client-supplied `version` as write authority, `created_at` / `updated_at`, `role`, `auth_user_id`, tokens.

Reuse `interviewAnswersCompleteSchema` / `BusinessProfileFields` for the allowlisted payload shape (CONTRACT freezes partial-vs-full replace).

## Canonical terms (CONTEXT)

Use **Ficha viva**, **Entrevista inicial**, **Cliente**, **Operator**, **Preferencias de producción visual**, **Consentimiento de avatar**.  
_Evitar:_ Business Profile / perfil de negocio (UI EN: Living profile), onboarding interview, cuestionario, admin / administrador / staff, avatar mode / visual preferences (as entity names), consent ledger (in product copy).

## Ready for SPEC?

**Yes.** SPEC §3 Business Profile / Ficha viva (S3.M3): Cliente can edit allowed fields without redoing Entrevista; System versiona ediciones; PATCH allowlist (sin consent / modo visual / campos sistema); Fuera V1 historial completo de versiones. Continuity with US-2.1 CONTRACT (no PATCH there; edit owns mutation). No SPEC amendment required for PREP handoff — open questions below are SECURITY/CONTRACT freezes, not SPEC conflicts.
