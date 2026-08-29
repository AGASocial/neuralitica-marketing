# US-2.1 — View canonical business profile

**Priority:** P0  
**Depends on:** US-1.3 ✅ CLOSED (`plan/stories/US-1.3/`) · runtime US-14.5 (`getCurrentUser()` / `requireActive()`, `(app)` layout)  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-2.1 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** nextjs-backend + nextjs-frontend (`docs/development/AGENT-ROSTER.md` Fase 1). No content/media/integrations specialist.  
**Canonical terms:** **Ficha viva** / Living profile · **Entrevista inicial** · Role: **Cliente** / **Operator**. Avoid CONTEXT _Evitar_ terms (Business Profile / perfil de negocio in product copy).

## Out of scope (do not implement here)

- **US-2.2:** edit / PATCH, version bump for edits, allowlist, consent / visual / system fields.
- **US-2.3:** `getBusinessProfileForAgents` server helper / agent DTO.
- **US-1.3 rebuild:** submit, completeness, upsert, mark `completed`, migration for `neuramark_business_profiles` — **already shipped**. Extend read path; do not fork create/submit.
- **Preferencias de producción visual** (US-3.x), avatar consent, assets.
- Rebuild Entrevista wizard / Save & continue later / dashboard interview incomplete prompt (US-1.1 / US-1.2).
- Auth changes: do **not** edit signup/login/logout/reset, `requireActive()` semantics, or add `/profile` to `isPublicPath`.
- `@supabase/supabase-js` in Client Components; `client_id` / profile id from body/query/headers as identity.
- LLM / queued “profile enricher”; `profile_versions` history table.

## Scope split

| Concern | Owner |
|---------|--------|
| Submit → upsert Ficha viva → stub `/profile` | **US-1.3** (done) |
| Full **read-only** Ficha viva UI + own-profile GET helper + dashboard post-onboarding default + missing CTA | **US-2.1** (this story) |
| Edit / PATCH | **US-2.2** |
| Agent API | **US-2.3** |

## PO decisions (freeze in CONTRACT unless SECURITY vetoes)

| Topic | Decision |
|-------|----------|
| Route | **Replace stub in place** at `/profile` under `(app)`. No new public path. Keep `no-store` + off `isPublicPath`. |
| Read surface | **RSC + server helper** (extend/replace `getProfileStubSummary`). No public Route Handler required for V1 Cliente view. Optional thin Server Action only if CONTRACT needs client refresh — prefer RSC-only. |
| Identity | Load by `requireActive("page")` / `getCurrentUser().id` only. **Reject/strip** `client_id`, `profile_id`, `id` from query/body if ever present. No arbitrary `client_id` from browser (AC [SEC]). |
| Field shape | Render from stored jsonb `fields` (US-1.3 1:1 seven keys). View DTO may add `version` / `updatedAt` for display — CONTRACT freezes. UI label for `style` = **brand notes** / estilo. |
| Missing profile | `{ exists: false }` / null → **onboarding CTA** → `/interview` (reuse stub empty pattern). Never crash / blank 500 on “no row”. |
| Load failure | Soft empty/error UX (same class as dashboard interview loadFailed) — do not take down `(app)` layout. |
| Dashboard post-onboarding default | When Cliente has a Ficha viva (and interview completed), **default entry emphasizes `/profile`**. PO lean: authenticated post-onboarding visit to `/` or `/dashboard` **redirects to `/profile`** when profile exists; pre-onboarding keeps interview/dashboard resume. CONTRACT freezes exact redirect rules vs “primary card / embedded summary on dashboard” if redirect is too aggressive for US-X.1. |
| Read-only | No edit controls, no PATCH wiring. Optional “Edit coming” copy is **out** (prefer clean read-only; US-2.2 adds edit). |
| XSS | Free-text from `fields` rendered as React text nodes / PrimeReact children only — same bar as interview (US-1.1). No `dangerouslySetInnerHTML`. |
| Auth / cache | `requireActive` on helper; `Cache-Control: no-store` already on `/profile` — verify, do not weaken. |
| DB | **Verify-only** US-1.3 table. No migration unless CONTRACT finds a real gap. |

## Carry-forwards / reuse (do not reinvent)

- Reuse `neuramark_business_profiles` + `BusinessProfileFields` / completeness types from `lib/contracts/interview.ts` (or split `lib/contracts/profile.ts` if CONTRACT prefers).
- Replace `ProfileStubView` / stub page content; keep path and auth pattern.
- Prefer one helper: e.g. `getBusinessProfileForClient()` returning full view or empty — deprecate stub-only summary or have stub call the new helper.
- Dashboard: extend `app/(app)/dashboard/page.tsx` / root redirect as CONTRACT decides; keep interview card behavior from US-1.2/1.3.
- RLS deny-by-default + service-role server-only — unchanged.
- Do **not** change auth allowlist.

---

## FE checklist

Concrete BE consumers: profile RSC helper (own Ficha viva or empty); dashboard / default landing may call existence or full summary.

- [x] **Replace stub** at `/profile` with read-only Ficha viva: sections for services, zone, tone, offers, objections, brand notes (`style`), restrictions. Show list items and text descriptions clearly; empty arrays (e.g. restrictions) render as empty-state copy, not crash.
- [x] **Missing profile:** CTA to complete Entrevista (`/interview`); no empty crash / blank grid.
- [x] **Loading / error** states for profile load failure (EN/ES); recoverable, no layout blow-up.
- [x] **Dashboard / default post-onboarding:** implement CONTRACT decision (redirect to `/profile` and/or elevate Ficha viva as default view). Pre-onboarding clients still see interview Start/Resume path.
- [x] EN + ES in `messages/en.json` / `es.json`. Canonical **Ficha viva** / **Living profile**. Avoid CONTEXT _Evitar_ terms.
- [x] No Supabase in Client Components; no `client_id` / profile UUID in URL or client fetch as identity.
- [x] Free-text fields rendered escaped only (XSS bar).
- [x] Read-only: no edit forms, save buttons, or PATCH calls (US-2.2).

---

## BE checklist

Concrete FE consumers: `/profile` RSC page; dashboard / default-entry redirect or card that needs “has profile?” / optional summary.

- [x] **Own-profile loader** (CONTRACT name, e.g. `getBusinessProfileForClient`): `requireActive("page")`; `SELECT` where `client_id = user.id` only; return typed fields (+ version / updated_at if needed) or explicit empty/missing.
- [x] **No** `client_id` / profile id parameter from browser. Strip/reject if present on any surface.
- [x] Map stored `fields` → normalized **view** shape (Zod-validate jsonb on read or trust write-time completeness — CONTRACT freezes; fail soft to empty/error, not 500 dump).
- [x] Replace or wrap `getProfileStubSummary` so stub callers / dashboard can share one path.
- [x] Parameterized queries; service-role Node only; never log full free-text `fields` in production.
- [x] Automated tests: load scoped to current user; foreign `client_id` ignored; missing row → empty; malformed fields → safe error/empty; no public GET with tenant id.
- [x] CSRF N/A for read-only RSC; if any mutation sneaks in, reject (this story is read-only).

**AC satisfied (for validator):** Profile fetched by server-resolved current user only (arity-0 `getBusinessProfileForClient` + `WHERE client_id = user.id`); Zod on read; missing → `{ exists: false }`; invalid/select fail → `{ exists: false, loadFailed: true }`; no PATCH / no agent API / no public Route Handler.

---

## DB checklist

All objects keep `neuramark_` prefix. Migrations only if a gap is proven.

- [x] **Verify** `neuramark_business_profiles` from US-1.3 (`fields` jsonb, `version`, `UNIQUE (client_id)`, `UNIQUE (source_interview_id)`, RLS zero policies, updated_at trigger) — **no duplicate create migration**.
- [x] Confirm read path needs **no** new columns for V1 Cliente view.
- [x] No `profile_versions` table (US-2.2 / Fuera V1 nice-to-have).
- [x] No agent-facing tables or views required for this story.

---

## Gates (orchestrator)

- [ ] SPEC-REVIEW.md (spec-guardian — Business Profile S3.M3 view + CTA; stub replace in place)
- [ ] SECURITY.md (security-architect)
- [ ] CONTRACT.md + FE signoff (nextjs-backend → nextjs-frontend)
- [ ] BUILD (FE + BE)
- [ ] VALIDATION.md
- [ ] QA.md

**PREP complete when:** `README.md` + this `TASKS.md` exist; AC in `USER_STORIES.md` remain unchecked; no CONTRACT/SECURITY/code from PO.

---

## Open questions (for SPEC / SECURITY / CONTRACT)

1. **Dashboard “default post-onboarding view”** — Redirect `/` and/or `/dashboard` → `/profile` when profile exists, **or** keep multi-card dashboard and make Ficha viva the primary/first card with optional embedded summary? Blocks FE IA and US-X.1 coexistence. **PO lean:** soft redirect from `/dashboard` (and app root if it lands on dashboard) to `/profile` when `exists === true`; incomplete onboarding stays on dashboard/interview. Confirm with spec-guardian so US-X.1 is not starved of a home.
2. **`style` ↔ “brand notes”** — Confirm UI copy only (no rename of jsonb key). **PO lean:** keep key `style`; label EN “Brand notes” / ES “Notas de marca” (or “Estilo” if i18n already uses it — CONTRACT + FE align with interview step labels where possible).
3. **Read-time Zod** — Re-validate `fields` with `interviewAnswersCompleteSchema` on every load vs trust write-time map? **PO lean:** validate on read; invalid → soft empty/error + log code only (defense in depth for Operator SQL edits).
4. **Show `version` / `updated_at`?** — Useful for “last updated”; not in AC. **PO lean:** show `updated_at` (locale-formatted); `version` optional/subtle or omit until US-2.2.
5. **Helper naming** — Extend `getProfileStubSummary` with optional `fields` vs new `getBusinessProfileForClient` + thin stub wrapper? **PO lean:** new full helper; stub summary becomes thin adapter or deleted after page swap.
6. **Incomplete interview + orphan profile** — Rare fail-closed residue: profile row without `completed` interview. Show Ficha viva anyway, or CTA to interview? **PO lean:** if profile exists, show it; dashboard interview card still reflects interview status. SECURITY confirm no leak.
7. **Operator viewing another Cliente’s Ficha** — Out of V1 UI. Confirm no Operator cross-tenant param on this page.

No SPEC amendment required: S3.M3 already requires view living summary + onboarding CTA if missing; create-on-submit is US-1.3; edit/agent are US-2.2/2.3. Preferencias visuales stay US-3.x.
