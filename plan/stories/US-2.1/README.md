# US-2.1 — View canonical business profile

**Status:** CLOSED — VALIDATE PASS WITH NOTES; QA APPROVE WITH NOTES (4/4 AC; FE `76e84c3`, BE `10da494`).

**As a** Cliente, **I want** to see a living summary of my business, **so that** I can confirm the system understood me correctly.

Replace the US-1.3 **stub** at `/profile` with the full read-only **Ficha viva** (Living profile): services, zone, tone, offers, objections, brand notes (`style`), restrictions. Load by server-resolved current user only. Missing profile → onboarding CTA to Entrevista, not an empty crash. Post-onboarding, the Ficha viva is the default dashboard landing/view for the Cliente.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-2.1 (do not redefine; do **not** mark done in PREP)

**This folder:** [`plan/stories/US-2.1/`](./) — `TASKS.md` (this PREP). `SECURITY.md` and `CONTRACT.md` are authored in later gates, not here.

**Depends on:** [US-1.3](../US-1.3/) ✅ CLOSED — creates/updates `neuramark_business_profiles`; stub `/profile` + `getProfileStubSummary`; submit → `/profile`. Runtime identity: [US-14.5](../US-14.5/) (`getCurrentUser()` / `requireActive()`).

**Unblocks:** [US-2.2](../../USER_STORIES.md) (edit / PATCH) · [US-2.3](../../USER_STORIES.md) (`getBusinessProfileForAgents`).

---

## Scope in

| Area | What 2.1 adds |
|------|----------------|
| **FE** | Replace stub with **read-only Ficha viva** UI at `/profile`: all core fields from interview (`services`, `zone`, `tone`, `offers`, `objections`, `style` as brand notes, `restrictions`). Loading / empty / error states. Missing profile → CTA to Entrevista (`/interview`), not crash. EN/ES. Wire dashboard so Ficha viva is the **default post-onboarding view** (CONTRACT freezes redirect vs embed vs primary card). |
| **BE** | Server helper (RSC-callable) loads **own** Ficha viva by `getCurrentUser()` / `requireActive("page")` only; map stored `fields` → typed view shape for FE. No `client_id` / profile id from browser. Extend or replace `getProfileStubSummary` (CONTRACT names). |
| **DB** | Table **already created** in US-1.3 (`neuramark_business_profiles`, jsonb `fields`, `version`, UNIQUEs). **Verify-only** unless CONTRACT/SECURITY finds a gap (e.g. missing index for read path — unlikely). |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **US-1.3 (done)** | Submit, completeness, upsert profile, mark `completed`, stub success UX, migration. Do **not** rebuild submit or create path. |
| **US-2.2** | Edit / PATCH Ficha viva, version bump for edits, allowlist, consent/visual system fields. Read-only only here. |
| **US-2.3** | `getBusinessProfileForAgents` agent DTO / contract. Client view shape may inform it later; agent API is out. |
| **Preferencias de producción visual** | US-3.x — avatar modes, consent, assets. Not on this page. |
| Rebuild Entrevista wizard / draft / resume | US-1.1 / US-1.2 done. |
| Auth redesign | Do not edit `lib/auth/*` allowlist / signup / login. Keep `/profile` off `isPublicPath`. |
| LLM rewrite of profile | Fields stay deterministic map from interview (already on write in US-1.3). |

## What US-1.3 already shipped (do not duplicate)

From `plan/stories/US-1.3/` (CONTRACT / VALIDATION / QA) and code:

- Table `neuramark_business_profiles`: `client_id` UNIQUE, `source_interview_id` UNIQUE, jsonb `fields` **1:1** interview keys (`services`…`restrictions`), `version`, RLS zero policies, service-role Node only.
- Upsert on `submitInterview` from **stored** complete answers (`lib/profile/upsert-from-interview.ts`).
- Stub route `app/(app)/profile/page.tsx` + `ProfileStubView` — existence / confirmation only; empty CTA → `/interview`.
- `getProfileStubSummary()` — `{ exists, version }` for own `client_id` only (`lib/profile/get-profile-stub-summary.ts`).
- Dashboard completed interview card → `/profile`; profile card → `/profile`; submit `redirectTo: "/profile"`.
- `Cache-Control: no-store` on `/profile`; gated under `(app)` + `requireActive`.

**US-2.1 replaces stub content in place at `/profile`** (US-1.3 CONTRACT freeze). Keep ownership-scoped load; do not add `client_id` / profile id query params.

## Field map (interview → Ficha viva UI)

| `fields` key (DB) | UI concept (USER_STORIES / product) |
|-------------------|-------------------------------------|
| `services` | Services |
| `zone` | Zone |
| `tone` | Tone |
| `offers` | Offers |
| `objections` | Objections |
| `style` | Brand notes (estilo / notas de marca) |
| `restrictions` | Restrictions |

No new storage keys in this story. Labels EN/ES in i18n; CONTEXT: product name **Ficha viva** / **Living profile** — avoid “Business Profile” / “perfil de negocio” in product copy.

## Canonical terms (CONTEXT)

Use **Ficha viva**, **Entrevista inicial**, **Cliente**, **Operator**.  
_Evitar:_ Business Profile / perfil de negocio (UI EN may translate Ficha viva as Living profile), onboarding interview, cuestionario, admin / administrador / staff.

## Ready for SPEC?

**Yes.** SPEC §3 Business Profile (S3.M3): Cliente can see living summary; CTA if no ficha; System created/updated row on interview complete. Viewing full Ficha viva is this story; edit and agent API remain US-2.2 / US-2.3. No SPEC amendment required for PREP handoff — open questions below are CONTRACT/SECURITY UX freezes, not SPEC conflicts.
