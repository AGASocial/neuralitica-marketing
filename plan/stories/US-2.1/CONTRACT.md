Reviewed by FE: yes — 2026-08-29

**FE notes (signoff):**
1. Arity-0 `getBusinessProfileForClient()` is enough for `/profile` RSC + dashboard card elevation (`exists` only on the card — no full `fields` dump).
2. View DTO (`exists` + seven `fields` + optional `updatedAt` / `version`) is enough; no profile/`client_id` UUIDs needed in client props.
3. Dashboard: **primary card/CTA** → `/profile` when exists — **confirm no hard redirect** off `/` or `/dashboard` (preserves US-X.1 multi-card home).
4. Section `style` UI labels: **Style** / **Estilo** (align interview step; not Brand notes as primary).
5. Missing → CTA `/interview`; prefer explicit `{ exists: false, loadFailed: true }` over bare `null` for clearer EN/ES error copy (both soft UX OK).
6. Confirm **no** public Route Handler and **no** PATCH in this story — RSC + server helper only.
7. Confirm migration **no** — verify-only `neuramark_business_profiles`.
8. XSS: React text nodes / PrimeReact children only for all free-text + list items; empty `restrictions.items` → empty-state copy.
9. i18n: page title **Living profile** / **Ficha viva**; reuse/extend `messages/en.json` + `es.json` (`profile.*`, `dashboard.profileCard.*`).

# API Contract — US-2.1 View canonical business profile (Ficha viva)

**Story:** US-2.1  
**Status:** Frozen (FE signed off 2026-08-29)  
**Security:** `plan/stories/US-2.1/SECURITY.md` (binding freeze — do not reopen)  
**Spec review:** `plan/stories/US-2.1/SPEC-REVIEW.md` (ALIGNED)  
**Depends on:** US-1.3 CONTRACT (frozen) — table + stub `/profile` + submit upsert; extend read path only  
**Identity seam:** `lib/auth/get-current-user.ts` / `requireActive()` (US-14.5 — unchanged)  
**Error / empty style:** soft empty + CTA (same class as US-1.3 stub / dashboard `loadFailed`) — no HTTP mutation envelope on the primary read path

**This document is CONTRACT ONLY.** Do not implement `getBusinessProfileForClient`, the full Ficha viva page, Zod view schemas in code, or migrations until FE signoff. Zod below is a documentation sketch for the future BUILD file (`lib/contracts/interview.ts` and/or `lib/contracts/profile.ts`).

**Terminology:** **Ficha viva** (ES) / **Living profile** (EN). **Entrevista inicial** (ES) / **Initial interview** (EN). Role: **Cliente** / **Operator**. Field `style` UI label: **Style** / **Estilo** (align US-1.1 interview step). Do **not** use CONTEXT _Evitar_ terms (Business Profile, perfil de negocio, Brand notes / Notas de marca as **primary** section label, cuestionario, onboarding interview, admin / administrador / staff) in this file, fixtures, or product copy.

---

## Overview

An authenticated, activated Cliente opens the gated Living profile page. The server:

1. Resolves identity via `requireActive("page")` / `getCurrentUser().id` only.
2. Loads **own** row from `neuramark_business_profiles` (`WHERE client_id = $server`).
3. Zod-validates jsonb `fields` (seven keys 1:1 interview complete schema).
4. Returns a minimal view DTO for RSC render, or an explicit missing / soft-error shape.
5. FE renders a **read-only** Ficha viva (all seven sections) or an onboarding CTA to `/interview`.

**Surfaces**

| # | Surface | Kind | New vs reused |
|---|---------|------|---------------|
| 1 | `getBusinessProfileForClient` | RSC server helper | **New** — full own-profile reader |
| 2 | `/profile` page | RSC under `(app)` | **Replace stub content in place** (US-1.3 path) |
| 3 | Dashboard primary card / CTA | RSC dashboard | **Elevate** Ficha viva card when `exists` — **no** hard redirect |
| 4 | `getProfileStubSummary` | RSC helper | **Thin-wrap or delete** after page swap — do not leave a second weaker loader |
| 5 | `submitInterview` / upsert | Server Action / DB | **Unchanged** (US-1.3) |

No public Route Handler. No GET-by-id API. No PATCH / edit. No `getBusinessProfileForAgents` (US-2.3).

**Frontend consumers**

| Consumer | Route | Contract surface |
|----------|-------|------------------|
| Living profile page | `app/(app)/profile/page.tsx` (`/profile`) | RSC calls `getBusinessProfileForClient()`; render fields or missing CTA |
| Dashboard post-onboarding entry | `app/(app)/dashboard/page.tsx` (+ app root if it lands on dashboard) | When profile exists: **primary / first** card + CTA → `/profile` (no tenant query params). Pre-onboarding keeps Entrevista Start/Resume |
| Post-submit redirect | Wizard → `/profile` | Unchanged US-1.3 `redirectTo: "/profile"`; page now shows full Ficha viva |

**Server-only modules (planned BUILD)**

| Module | Purpose |
|--------|---------|
| `lib/profile/get-business-profile-for-client.ts` | `import "server-only"`; arity-0 loader |
| `lib/profile/get-profile-stub-summary.ts` | Thin adapter or delete after swap |
| `lib/contracts/interview.ts` and/or `lib/contracts/profile.ts` | View DTO Zod + types; reuse `interviewAnswersCompleteSchema` / `BusinessProfileFields` |
| `app/(app)/profile/page.tsx` | Replace stub UI with read-only Ficha viva |
| `app/(app)/dashboard/page.tsx` | Elevate profile card when exists |
| `lib/auth/require-user.ts` | Unchanged |
| `lib/supabase/server.ts` | Unchanged |

---

## Frozen decisions (from SECURITY.md)

Do not reopen.

| # | Topic | Freeze |
|---|-------|--------|
| 1 | **Identity / helper** | `getBusinessProfileForClient()` — **arity 0** for tenant/profile ids. Inside: `requireActive("page")` then `SELECT … WHERE client_id = user.id`. Never accept `client_id` / `profile_id` / `id` / `source_interview_id` from browser |
| 2 | **Route** | Replace stub **in place** at `/profile` under `app/(app)/`. Off `isPublicPath`. `requireActive("page")`. `Cache-Control: no-store`. Keep `force-dynamic` (or equivalent) |
| 3 | **Read Zod** | Validate jsonb `fields` with seven-key complete schema (`interviewAnswersCompleteSchema` / shared `BusinessProfileFields`). Invalid → soft empty/error + log **code only** — do not render unvalidated blob; do not log free-text fields |
| 4 | **Missing / error** | Own missing → CTA `/interview`. Load failure → soft empty/error (dashboard `loadFailed` class). No foreign-tenant oracle. Orphan own row (profile exists, interview not `completed`) **may show** |
| 5 | **XSS** | All free-text + list items as React text nodes / PrimeReact children only — **no** `dangerouslySetInnerHTML` |
| 6 | **DTO** | Seven sections + optional `updatedAt` / subtle `version`. Omit tokens, `auth_user_id`, `role`, service-role internals. Prefer omit profile UUID, `client_id`, `source_interview_id` from client props |
| 7 | **Surface** | **RSC + server helper** preferred. No public `/api/profile`. Optional refresh Server Action only if needed: arity 0, `requireActive("handler")`, read-only. **No PATCH** |
| 8 | **Operator** | No cross-tenant view. No `as_client_id`, no `requireOperator` bypass. Operator role still loads **own** `client_id` only |
| 9 | **Dashboard** | When Ficha viva **exists**, elevate **primary card / CTA** to `/profile`. **Do not** hard-redirect off `/` or `/dashboard` (SPEC DRIFT). Links: `/profile` only — no tenant query params. Prefer link-only / existence on the card — **not** full `fields` dump |
| 10 | **DB** | **Verify-only** US-1.3 `neuramark_business_profiles`. **No** new migration expected. No `profile_versions`. No agent tables/views |

### Strip vs reject (if any optional refresh action or query ever appears)

| Keys | Behavior |
|------|----------|
| `client_id`, `clientId`, `id`, `profile_id`, `profileId`, `source_interview_id`, `sourceInterviewId` | **Strip and ignore.** Never used as read authority. Always load own row |
| `role`, `active`, `auth_user_id`, `authUserId` | **Reject / strip** — never used as privilege escalation |
| Query `?client_id=` / `?id=` / dynamic `/profile/[id]` | **Forbidden.** No such surface |

---

## Server helper — `getBusinessProfileForClient` (**new**)

**File (BUILD):** `lib/profile/get-business-profile-for-client.ts` (`import "server-only"`)  
**Frontend consumer:** `/profile` RSC page; dashboard may call for `exists` / card elevation (or reuse a thin existence adapter).  
**Why server helper (not Route Handler):** UI-coupled read for RSC; avoids public HTTP profile API and IDOR-by-query patterns. Read-only — CSRF N/A.

**Signature (frozen):**

```ts
/**
 * Own Ficha viva for the authenticated Cliente.
 * Arity 0 — identity only via requireActive("page") / getCurrentUser().id.
 * Prove getBusinessProfileForClient.length === 0 in tests (same class as getProfileStubSummary).
 */
export async function getBusinessProfileForClient(): Promise<BusinessProfileForClientResult>;
```

**Auth:** `requireActive("page")` inside the helper (and `(app)` layout already gates the page).

**Query (frozen):**

```ts
// Parameterized service-role Node only
.from("neuramark_business_profiles")
.select("fields, version, updated_at") // prefer omit id, client_id, source_interview_id from select→DTO
.eq("client_id", user.id)
.maybeSingle();
```

**Do not:** accept tenant args; join other tenants; return raw unvalidated jsonb; introduce `getBusinessProfileForAgents`.

### Return shape

Discriminated soft result (no throw that dumps fields to the client). Prefer returning a typed result object the RSC can branch on — **not** a 500 HTML dump.

```ts
/** BUILD: Zod in lib/contracts/profile.ts (or extend interview.ts) */

/** Reuse US-1.3 completeness / fields schema — seven keys strict */
export type BusinessProfileFields = InterviewAnswersComplete;
// interviewAnswersCompleteSchema:
// { services, zone, tone, offers, objections, style, restrictions }

export const businessProfileViewSchema = z
  .object({
    exists: z.literal(true),
    fields: interviewAnswersCompleteSchema, // seven sections
    updatedAt: z.string().datetime({ offset: true }).optional(), // ISO from updated_at
    version: z.number().int().positive().optional(), // subtle; omit from UI until US-2.2 OK
  })
  .strict();

export type BusinessProfileView = z.infer<typeof businessProfileViewSchema>;

export const businessProfileMissingSchema = z
  .object({
    exists: z.literal(false),
  })
  .strict();

export type BusinessProfileMissing = z.infer<typeof businessProfileMissingSchema>;

/**
 * Soft load failure — same UX class as dashboard interview loadFailed.
 * Do not distinguish foreign-tenant cases (no foreign-id surface).
 */
export const businessProfileLoadFailedSchema = z
  .object({
    exists: z.literal(false),
    loadFailed: z.literal(true),
  })
  .strict();

export type BusinessProfileLoadFailed = z.infer<
  typeof businessProfileLoadFailedSchema
>;

export type BusinessProfileForClientResult =
  | BusinessProfileView
  | BusinessProfileMissing
  | BusinessProfileLoadFailed;
```

**Optional:** return `null` instead of `{ exists: false, loadFailed: true }` for config/select failure if page already treats `null` as soft empty (US-1.3 stub). If so, CONTRACT BUILD must still ensure **missing** (`exists: false`) and **loadFailed** are both soft UX and never crash the `(app)` shell. Prefer explicit `loadFailed` for clearer i18n.

### Outcome matrix

| Case | Result | FE |
|------|--------|-----|
| No row for current user | `{ exists: false }` | Onboarding CTA → `/interview` |
| Row + Zod-valid `fields` | `{ exists: true, fields, updatedAt?, version? }` | Read-only Ficha viva sections |
| Row + Zod-invalid / corrupt `fields` | Soft empty/error (`loadFailed` or missing class) | Soft error UX; log **code only** |
| Select / Supabase config failure | Soft empty/error | Soft error; log code only |
| Orphan own row (interview not `completed`) | **Show** view if fields valid | Interview card independent |
| Foreign id somehow present | **Ignore**; still own row only | No distinct forbidden oracle |

### Logging

- Log error **codes** only (e.g. Zod issue code / Supabase `error.code`).
- **Never** log full free-text `fields` or answers bodies in production.

### Stub helper disposition

| Option | Rule |
|--------|------|
| Preferred | `/profile` and dashboard use `getBusinessProfileForClient`; delete or private-thin-wrap `getProfileStubSummary` |
| Allowed | `getProfileStubSummary` becomes a thin adapter that maps `{ exists, version }` from the new helper without a second SELECT with weaker scoping |
| Forbidden | Two independent loaders with different identity rules |

---

## Route — `/profile` (replace stub in place)

| Rule | Detail |
|------|--------|
| Path | `/profile` under `app/(app)/profile/` — **same URL** as US-1.3 stub |
| Auth | `(app)` layout + helper `requireActive("page")`; **not** on `isPublicPath` |
| Cache | Keep `Cache-Control: no-store` for `/profile` (+ `/profile/:path*` if present) in `next.config.ts` — do not weaken |
| Dynamic | Keep `force-dynamic` (or equivalent) so full fields are not statically cached |
| UI | **Full read-only** Ficha viva: all seven field sections. Replace `ProfileStubView` content |
| Identity | No `client_id` / profile id query param; no `/profile/[id]` |
| Mutations | **None** — no edit forms, save buttons, or PATCH wiring (US-2.2) |

### Section render map

| `fields` key | UI label EN | UI label ES | Shape |
|--------------|-------------|-------------|-------|
| `services` | Services | Servicios | `items: string[]` (list) |
| `zone` | Zone | Zona | `description: string` |
| `tone` | Tone | Tono | `description: string` |
| `offers` | Offers | Ofertas | `items: string[]` |
| `objections` | Objections | Objeciones | `items: string[]` |
| `style` | **Style** | **Estilo** | `description: string` |
| `restrictions` | Restrictions | Restricciones | `items: string[]` (empty → empty-state copy, not crash) |

Optional light metadata: locale-formatted `updatedAt`. `version` subtle or omitted until US-2.2.

---

## Dashboard — primary card / CTA (not hard redirect)

| Rule | Detail |
|------|--------|
| When `exists === true` | Elevate **Ficha viva** as **primary / first** dashboard card with CTA → `/profile` |
| When missing / pre-onboarding | Keep Entrevista Start/Resume as primary path; profile card may still link to `/profile` (empty CTA) |
| Hard redirect | **Forbidden** — do not `redirect('/profile')` from `/` or `/dashboard` when profile exists (starves US-X.1 multi-card home) |
| Links | `href: "/profile"` only — **no** tenant query params |
| Card payload | Prefer existence / title / CTA — **do not** dump full seven `fields` onto the dashboard card unless a later CONTRACT addendum freezes a minimal teaser |

Satisfies USER_STORIES AC “Profile loads on dashboard as default post-onboarding view” as **emphasize**, not replace the dashboard shell (SPEC-REVIEW / SECURITY).

---

## DB — verify only (no migration)

**Migration required:** **no.**

Verify US-1.3 shipped objects (do not duplicate create):

| Object | Expectation |
|--------|-------------|
| Table `neuramark_business_profiles` | `id`, `client_id`, `source_interview_id`, `fields` jsonb, `version`, `created_at`, `updated_at` |
| `UNIQUE (client_id)` | `neuramark_business_profiles_client_id_idx` |
| `UNIQUE (source_interview_id)` | `neuramark_business_profiles_source_interview_id_idx` |
| RLS | Enabled; **zero** named policies; service-role Node only |
| Trigger | `neuramark_business_profiles_set_updated_at` → `neuramark_set_updated_at` |
| Migration file | `supabase/migrations/20260829120000_neuramark_business_profiles.sql` |

**No** new columns for V1 Cliente view. **No** `profile_versions`. **No** agent views. Read path needs no schema change.

Logical name in USER_STORIES: `business_profiles`. Physical: `neuramark_business_profiles`.

---

## Enums and state transitions

This story is **read-only**. No interview or profile status writes.

| Entity | Transitions in US-2.1 |
|--------|------------------------|
| `neuramark_interview_session_status` | **None** (US-1.3 owns `draft` → `completed`) |
| Profile `version` | **Not bumped** on view |
| Profile row | **SELECT only** |

Orphan display rule (SPEC): if own profile **row exists**, show Ficha viva even if interview is not `completed`. Interview status remains dashboard interview-card concern.

---

## XSS and render bar

- Render every free-text `description` and every list `items[]` entry as React text nodes / PrimeReact children only.
- Empty `restrictions.items` → empty-state **copy** (EN/ES), not crash, not HTML injection.
- **No** markdown/HTML renderers on profile fields in V1.
- **No** `dangerouslySetInnerHTML`, `eval`, or HTML string concatenation from `fields`.

---

## Optional refresh Server Action (not preferred)

Default: **RSC-only** — no Server Action required.

If BUILD discovers a Client Component refresh need:

```ts
/** Arity 0; requireActive("handler"); read-only; same result type as helper */
export async function refreshBusinessProfileForClient(): Promise<BusinessProfileForClientResult>;
```

- Zero tenant params; strip/reject identity keys if present.
- Must **not** mutate rows.
- Prefer calling the same internal loader as the RSC helper.

**Forbidden:** public `GET /api/profile`, `GET /api/profile?client_id=`, Route Handler by UUID.

---

## FE expectations

### `/profile` page

1. Call `getBusinessProfileForClient()` from the RSC (or server child).
2. If `{ exists: true }`: render read-only sections for all seven keys; lists as bullets/chips that are still **text**; show `updatedAt` if present (locale-formatted).
3. If `{ exists: false }` (and not loadFailed): CTA to complete Entrevista → `/interview`.
4. If loadFailed / soft error: recoverable empty/error message (EN/ES); do not blank the `(app)` shell.
5. EN + ES in `messages/en.json` / `es.json`. Page title / heading: **Living profile** / **Ficha viva**.
6. No Supabase in Client Components; no `client_id` / profile UUID in URL or client fetch as identity.
7. Read-only: no edit/save/PATCH. Do not tease “Edit coming” as a control (US-2.2 owns edit).

### Dashboard

1. When profile exists: place Ficha viva card first / primary with CTA → `/profile`.
2. When missing: keep interview card as the onboarding focus.
3. Never hard-redirect away from dashboard solely because a profile exists.
4. Do not put `client_id` on dashboard links.

### i18n keys (suggested)

| Key area | Purpose |
|----------|---------|
| `profile.title` | Living profile / Ficha viva |
| `profile.sections.{services,zone,tone,offers,objections,style,restrictions}` | Section headings (style = Style / Estilo) |
| `profile.empty.*` | Missing → CTA copy + link label to Entrevista |
| `profile.error.*` | Soft load failure |
| `profile.updatedAt` | Optional “Last updated” |
| `dashboard.profileCard.*` | Primary card when exists (may already exist — elevate order/emphasis) |

Align section labels with US-1.1 interview step labels where possible.

---

## Fixtures (FE mocks)

### Exists — happy path

```json
{
  "exists": true,
  "updatedAt": "2026-08-29T16:00:00.000Z",
  "version": 1,
  "fields": {
    "services": { "items": ["Residential cleaning", "Office cleaning"] },
    "zone": { "description": "Greater Metro area, north and west suburbs" },
    "tone": { "description": "Warm, professional, concise" },
    "offers": { "items": ["First clean 15% off"] },
    "objections": { "items": ["Price vs DIY", "Trust with keys"] },
    "style": { "description": "Short sentences; avoid slang; Spanish OK" },
    "restrictions": { "items": [] }
  }
}
```

### Missing — onboarding CTA

```json
{
  "exists": false
}
```

### Soft load failure

```json
{
  "exists": false,
  "loadFailed": true
}
```

### Invalid fields (server behavior — not rendered as blob)

Server Zod fails → FE receives soft empty/error (missing or `loadFailed`), **not**:

```json
{
  "exists": true,
  "fields": { "garbage": true }
}
```

---

## Caching / revalidation

| Surface | Rule |
|---------|------|
| `GET /profile` | `Cache-Control: no-store` (verify; do not weaken) |
| Page | `force-dynamic` (or equivalent) |
| Mutations | None in this story — no new `revalidatePath` required beyond what US-1.3 already does on submit |
| Auth allowlist | Do **not** add `/profile` to `isPublicPath` |

---

## Out of scope (BUILD veto if shipped here)

| Topic | Owner |
|-------|--------|
| Edit / PATCH / version bump for edits | US-2.2 |
| `getBusinessProfileForAgents` | US-2.3 |
| Preferencias de producción visual | US-3.x |
| Submit / upsert / mark `completed` | US-1.3 (done) |
| Hard dashboard redirect to `/profile` | SPEC DRIFT — not this CONTRACT |
| Operator cross-tenant view | Out of V1 |
| `profile_versions` history table | Fuera V1 / later |
| LLM enricher / browser Supabase / new packages | Forbidden |
| Auth redesign | Forbidden |

---

## Security acceptance (must remain true after BUILD)

- Helper arity 0; `WHERE client_id = $server` only.
- `/profile` gated, `no-store`, off `isPublicPath`.
- Zod on read; invalid → soft + log code only.
- Missing → CTA `/interview`; no foreign oracle.
- XSS: text nodes only.
- Minimal DTO; prefer omit UUIDs from props.
- RSC + server helper; read-only; no public GET-by-id.
- No Operator cross-tenant param.
- Dashboard primary card/CTA — not hard redirect.
- RLS deny-by-default unchanged; service-role Node only.

---

## CONTRACT checklist (pre-implementation)

- [x] `getBusinessProfileForClient`: `requireActive("page")`; **no** tenant/profile args; `WHERE client_id = user.id`
- [x] Return typed fields or explicit missing; Zod-validate `fields` on read; invalid → soft empty/error
- [x] View DTO minimal (seven sections + optional `updatedAt` / `version`); omit secrets / privilege / prefer omit UUIDs
- [x] `/profile` replace stub in place; gated; `no-store`; off `isPublicPath`
- [x] Missing → CTA `/interview`; load failure soft; orphan own row may show
- [x] XSS: text nodes only; read-only UI; no PATCH
- [x] Dashboard: primary card/CTA to `/profile` when exists — **no** hard redirect freeze; no tenant query params
- [x] No public profile GET Route Handler; no Operator cross-tenant param
- [x] EN/ES: Ficha viva / Living profile; Style / Estilo; no CONTEXT _Evitar_
- [x] Out of scope: US-2.2, US-2.3, Preferencias visuales, auth redesign, LLM enricher, `profile_versions`
- [x] Inherited floors unchanged: RLS, parameterized reads, server-only Supabase, no fields free text in logs
- [x] **Migration:** no (verify US-1.3 table only)
- [x] **Reviewed by FE:** yes — 2026-08-29

---

## FE signoff questions

1. Is `getBusinessProfileForClient(): Promise<BusinessProfileForClientResult>` (arity 0) enough for `/profile` RSC + dashboard card elevation?
2. Is the view DTO (`exists` + seven `fields` + optional `updatedAt` / `version`) enough to replace the stub without needing profile/`client_id` UUIDs in props?
3. Confirm dashboard: **primary card/CTA** when exists — **not** hard redirect off `/dashboard`.
4. Confirm `style` section label **Style** / **Estilo** (not Brand notes as primary).
5. Confirm missing → CTA `/interview`; soft `loadFailed` acceptable vs `null`.
6. Confirm **no** public Route Handler and **no** PATCH in this story.
7. Confirm migration **no** — verify-only `neuramark_business_profiles`.

After FE answers yes and adds `Reviewed by FE: yes — YYYY-MM-DD` at the top, this CONTRACT is **frozen**.
