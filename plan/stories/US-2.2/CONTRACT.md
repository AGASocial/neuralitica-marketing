Reviewed by FE: yes — 2026-08-29

**FE notes:** Contract is sufficient for `/profile` edit BUILD. Save/Cancel, await + success toast (not optimistic-only), seven-key full-snapshot submit, `VALIDATION_ERROR.fields` for Messages, missing → no edit chrome + CTA `/interview`, success `updatedAt` for visible last-updated, EN/ES Ficha viva / Living profile + Style / Estilo, and no consent/Preferencias editors all fit the UI flow. FE will call `updateBusinessProfile(mergedSevenKeyFields)` and omit `updated_by` / tenant ids from props. No disputes.

# API Contract — US-2.2 Edit business profile (Ficha viva)

**Story:** US-2.2  
**Status:** FE signed off — ready for BUILD  
**Security:** `plan/stories/US-2.2/SECURITY.md` (APPROVE WITH CONDITIONS — binding freeze; do not reopen)  
**Spec review:** `plan/stories/US-2.2/SPEC-REVIEW.md` (ALIGNED)  
**Depends on:** US-2.1 CONTRACT (frozen) — extend `/profile` with edit; reuse arity-0 loader · US-1.3 CONTRACT (frozen) — table + create-on-submit upsert  
**Identity seam:** `lib/auth/get-current-user.ts` / `requireActive()` (US-14.5 — unchanged)  
**Error envelope style:** same class as interview/auth (`ok: true` vs `{ ok: false, error: { code, fields?, messageKey? } }`)

**This document is CONTRACT ONLY.** Do not implement `updateBusinessProfile`, edit UI, Zod mutation schemas in code, or migrations until FE signoff. Zod below is a documentation sketch for the future BUILD file (`lib/contracts/profile.ts` and/or `lib/contracts/interview.ts`).

**Terminology:** **Ficha viva** (ES) / **Living profile** (EN). **Entrevista inicial** (ES) / **Initial interview** (EN). Role: **Cliente** / **Operator**. Field `style` UI label: **Style** / **Estilo**. Preferencias de producción visual · Consentimiento de avatar (US-3.x — not editable here). Do **not** use CONTEXT _Evitar_ terms (Business Profile, perfil de negocio, Brand notes / Notas de marca as primary section label, cuestionario, onboarding interview, admin / administrador / staff, avatar mode / visual preferences as entity names, consent ledger in product copy) in this file, fixtures, or product copy.

---

## Overview

An authenticated, activated Cliente edits their own Ficha viva on the gated `/profile` page. The server:

1. Resolves identity via `requireActive("handler")` / `getCurrentUser().id` only.
2. Validates the PATCH body as a **full seven-key** object with Zod **`.strict()`** (`interviewAnswersCompleteSchema` / shared `BusinessProfileFields`).
3. Rejects unknown / consent / Preferencias / system / privilege keys — never written.
4. `UPDATE`s **own** row only (`WHERE client_id = $server`): replace `fields`, bump `version`, set `updated_by`, rely on / set `updated_at`.
5. **Never INSERT** when no row exists — typed `PROFILE_NOT_FOUND`.
6. Returns a minimal DTO (`fields` + `version` + `updatedAt`) so FE can toast success and show the refreshed last-updated timestamp (last-write-wins).

**Surfaces**

| # | Surface | Kind | New vs reused |
|---|---------|------|---------------|
| 1 | `updateBusinessProfile` | Server Action | **New** — only Cliente PATCH writer for Ficha viva fields |
| 2 | `/profile` page | RSC + edit Client Component under `(app)` | **Extend** US-2.1 read-only → edit chrome when `exists` |
| 3 | `getBusinessProfileForClient` | RSC server helper | **Reused** — arity 0 load; do not fork identity rules |
| 4 | `submitInterview` / upsert | Server Action / DB | **Unchanged** (US-1.3 owns create) |
| 5 | Dashboard primary card | RSC | **Unchanged** (US-2.1) — no hard redirect |

No public Route Handler. No GET-by-id / PATCH-by-id API. No `getBusinessProfileForAgents` (US-2.3). No `profile_versions` history table.

**Frontend consumers**

| Consumer | Route | Contract surface |
|----------|-------|------------------|
| Living profile **edit** UI | `app/(app)/profile/page.tsx` (+ Client edit form) | Load via `getBusinessProfileForClient()`; Save calls `updateBusinessProfile(fields)`; Cancel discards local edits |
| Success feedback | Edit Client Component | On `{ ok: true }` → **await** + success toast (EN/ES); show refreshed `updatedAt` (and optional subtle `version`) |
| Missing profile | Same page | No edit chrome — keep US-2.1 CTA → `/interview` |

**Server-only modules (planned BUILD)**

| Module | Purpose |
|--------|---------|
| `lib/profile/update-business-profile.ts` (or `lib/profile/actions/update-business-profile.ts`) | `"use server"` `updateBusinessProfile` |
| `lib/profile/get-business-profile-for-client.ts` | **Reuse** — arity-0 loader |
| `lib/contracts/profile.ts` (and/or `interview.ts`) | Mutation input/result Zod + types; reuse `interviewAnswersCompleteSchema` |
| `app/(app)/profile/page.tsx` (+ edit Client Component) | Edit UI when `exists` |
| `lib/auth/require-user.ts` | Unchanged |
| `lib/supabase/server.ts` | Unchanged |
| Migration | Additive `updated_by` only (see DB) |

---

## Frozen decisions (from SECURITY.md)

Do not reopen.

| # | Topic | Freeze |
|---|-------|--------|
| 1 | **Surface / CSRF** | Server Action **`updateBusinessProfile`** only. POST + Next.js origin check. `requireActive("handler")` before any write. **No** public Route Handler `PATCH`/`PUT`/`POST` `/api/profile` (any tenant/profile id) |
| 2 | **Identity / IDOR** | **No** `client_id` / `profile_id` / `id` / `source_interview_id` / `as_client_id` as write authority. Action takes **fields body only**. `UPDATE … WHERE client_id = user.id` only |
| 3 | **Allowlist** | Zod **`.strict()`** on full seven-key object: `services`, `zone`, `tone`, `offers`, `objections`, `style`, `restrictions`. Unknown / consent* / Preferencias (`visual_mode`…) / system / privilege keys → **validation error**; never written |
| 4 | **Persist shape** | **Full replace** of jsonb `fields` with validated object. FE may edit one section in UI but **submits merged complete snapshot**. No sparse merge |
| 5 | **Audit** | On success: `fields` = validated; `version = version + 1`; `updated_at` via existing trigger and/or explicit set; **`updated_by = getCurrentUser().id`**. Client cannot supply write authority for those columns |
| 6 | **Migration** | **Yes** — nullable `updated_by uuid` FK → `neuramark_clients(id)` `ON DELETE SET NULL`. Set on every successful PATCH. Logs-only is **not** sufficient |
| 7 | **Missing profile** | Typed error `PROFILE_NOT_FOUND`; **no INSERT** / upsert-create. FE: no edit chrome; CTA → `/interview` |
| 8 | **Concurrency** | **Last-write-wins**. No If-Match / version precondition for V1. Visible `updatedAt` after save is the Cliente-facing signal |
| 9 | **XSS** | Controlled inputs on edit; display as React text nodes / PrimeReact children only — **no** `dangerouslySetInnerHTML` |
| 10 | **Consent / Preferencias AC** | Cannot change via this endpoint. Dedicated US-3.x re-confirm flows. No consent/visual toggles on `/profile` |
| 11 | **DTO** | Success / revalidated view: seven `fields` + `version` + `updatedAt`. Prefer omit profile UUID, `client_id`, `source_interview_id`, `updated_by` from client props. Never tokens / `auth_user_id` / `role` |
| 12 | **FE UX** | **Save** + **Cancel**; **await** Server Action + **success toast** (not optimistic-only). Cancel restores last server-loaded values |
| 13 | **Route / cache** | `/profile` under `(app)`, off `isPublicPath`, `requireActive("page")`, `Cache-Control: no-store` — do not weaken |
| 14 | **Operator** | No cross-tenant edit. No `as_client_id`. Operator role still updates **own** `client_id` only |
| 15 | **Out of scope** | `profile_versions`; US-2.3 agent helper; Preferencias / Consentimiento editors; auth redesign; LLM; redo Entrevista; browser Supabase; new packages |

### Strip vs reject (mutation body)

| Keys | Behavior |
|------|----------|
| Seven allowlisted field keys (`services`…`restrictions`) | **Accept** via Zod `.strict()` completeness schema; full replace into `fields` |
| Unknown keys (any other property on the body object) | **Reject** → `400 VALIDATION_ERROR` (Zod `.strict()`). Never written |
| Consent* / Preferencias (`visual_mode`, related visual keys) | **Reject** → `VALIDATION_ERROR` (not in allowlist / `.strict()`). Never written |
| `client_id`, `clientId`, `id`, `profile_id`, `profileId`, `source_interview_id`, `sourceInterviewId`, `as_client_id` | **Reject** if present as top-level body keys (or nested write authority) → prefer `FORBIDDEN_FIELDS` or `VALIDATION_ERROR`. Never used in `WHERE` / never written. Action signature has **no** tenant args |
| `role`, `active`, `auth_user_id`, `authUserId` | **Reject** → `FORBIDDEN_FIELDS`. No write |
| Client-supplied `version`, `updated_at` / `updatedAt`, `updated_by` / `updatedBy`, `created_at` | **Reject** if present on body → `FORBIDDEN_FIELDS` or `VALIDATION_ERROR`. Server computes these |
| Query `?client_id=` / `?id=` / dynamic `/profile/[id]` mutate | **Forbidden.** No such surface |

**Note:** Prefer a single object body that **is** the seven-key fields payload (not `{ fields: {…}, client_id: … }`). If BUILD wraps as `{ fields: … }`, the wrapper must also be `.strict()` and must not accept tenant/audit keys.

---

## Server Action — `updateBusinessProfile` (**new**)

**File (BUILD):** `lib/profile/update-business-profile.ts` (or `lib/profile/actions/update-business-profile.ts`) — `"use server"`  
**Frontend consumer:** `/profile` edit Client Component — **Save** control.  
**Why Server Action (not Route Handler):** UI-coupled mutation; CSRF via Next.js origin check (same class as `submitInterview` / `persistInterviewDraft`). No public HTTP profile PATCH API.

**Signature (frozen):**

```ts
/**
 * Update own Ficha viva fields.
 * No tenant/profile id arguments — identity only via requireActive("handler") / getCurrentUser().id.
 * Body = full seven-key BusinessProfileFields (Zod .strict()).
 */
export async function updateBusinessProfile(
  input: UpdateBusinessProfileInput
): Promise<UpdateBusinessProfileResult>;
```

**Auth:** `requireActive("handler")` inside the action **before** any DB write.  
- Unauthenticated → `{ ok: false, error: { code: "UNAUTHENTICATED" } }` (401-class); **no** side effects.  
- Inactive → `{ ok: false, error: { code: "FORBIDDEN" } }` (403-class); **no** side effects.

**CSRF:** Next.js Server Action built-in origin check (POST from same origin only). No GET mutate.

### Input

```ts
/** BUILD: extend lib/contracts/profile.ts */

/**
 * Full seven-key replace. Reuse interviewAnswersCompleteSchema (.strict()).
 * FE submits merged complete snapshot even if UI edited one section.
 */
export const updateBusinessProfileInputSchema = interviewAnswersCompleteSchema;
// Equivalent explicit form:
// z.object({
//   services: interviewServicesStepSchema,
//   zone: interviewZoneStepSchema,
//   tone: interviewToneStepSchema,
//   offers: interviewOffersStepSchema,
//   objections: interviewObjectionsStepSchema,
//   style: interviewStyleStepSchema,
//   restrictions: interviewRestrictionsStepSchema,
// }).strict();

export type UpdateBusinessProfileInput = BusinessProfileFields;
// = InterviewAnswersComplete
```

**Payload size:** Reuse interview completeness caps + existing DB `fields` size CHECK (80 KiB). Oversize → `PAYLOAD_TOO_LARGE` (or `VALIDATION_ERROR`) **before** write.

### Success / error result

```ts
export const updateBusinessProfileSuccessSchema = z
  .object({
    ok: z.literal(true),
    /** Full seven sections after persist — FE may sync local form state */
    fields: interviewAnswersCompleteSchema,
    /** Bumped integer for agent traceability */
    version: z.number().int().positive(),
    /** ISO timestamptz — LWW visible signal after save */
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type UpdateBusinessProfileSuccess = z.infer<
  typeof updateBusinessProfileSuccessSchema
>;

/**
 * Error codes — extend interview/auth style.
 * PROFILE_NOT_FOUND is US-2.2–specific (no create-via-PATCH).
 */
export const updateBusinessProfileErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "PAYLOAD_TOO_LARGE",
  "FORBIDDEN_FIELDS",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "PROFILE_NOT_FOUND",
  "CONFLICT",
  "INTERNAL_ERROR",
]);

export const updateBusinessProfileErrorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z
    .object({
      code: updateBusinessProfileErrorCodeSchema,
      /** Per-field paths when VALIDATION_ERROR (Zod issues) */
      fields: z.record(z.string(), z.array(z.string())).optional(),
      messageKey: z.string().optional(),
    })
    .strict(),
});

export type UpdateBusinessProfileErrorEnvelope = z.infer<
  typeof updateBusinessProfileErrorEnvelopeSchema
>;

export const updateBusinessProfileResultSchema = z.discriminatedUnion("ok", [
  updateBusinessProfileSuccessSchema,
  updateBusinessProfileErrorEnvelopeSchema,
]);

export type UpdateBusinessProfileResult = z.infer<
  typeof updateBusinessProfileResultSchema
>;
```

### Server algorithm (frozen)

1. `requireActive("handler")` → resolve `user`. Fail → `UNAUTHENTICATED` / `FORBIDDEN`; no write.
2. If body contains forbidden identity/privilege/audit keys (see strip/reject table) → `FORBIDDEN_FIELDS` or `VALIDATION_ERROR`; no write.
3. Zod-parse body as `updateBusinessProfileInputSchema` (`.strict()`). Failure → `400 VALIDATION_ERROR` + `fields`; no write.
4. Payload size check → `PAYLOAD_TOO_LARGE` if over cap; no write.
5. Parameterized `UPDATE` (service-role Node only):

```ts
.from("neuramark_business_profiles")
.update({
  fields: validatedFields,           // full seven-key object
  version: /* SQL: version + 1 */,   // never from client
  updated_by: user.id,               // never from client
  // updated_at: existing BEFORE UPDATE trigger neuramark_business_profiles_set_updated_at
  //   and/or explicit set — both OK; trigger already present from US-1.3
})
.eq("client_id", user.id)
.select("fields, version, updated_at") // prefer omit id, client_id, source_interview_id, updated_by from DTO
.maybeSingle();
```

6. **0 rows updated / no own row** → `{ ok: false, error: { code: "PROFILE_NOT_FOUND", messageKey: "profile.errors.notFound" } }`. **Do not INSERT.**
7. On success: `revalidatePath("/profile")` (and `/dashboard` if card shows stale timestamp — optional but preferred).
8. Return `{ ok: true, fields, version, updatedAt }` (ISO from `updated_at`).

**Do not:** mutate `source_interview_id`; touch interview `status`; create `profile_versions` rows; call or client-import `getBusinessProfileForAgents`; log full free-text `fields`.

### Outcome matrix

| Case | Result | FE |
|------|--------|-----|
| Valid seven-key body + own row exists | `{ ok: true, fields, version, updatedAt }` | Success toast; show refreshed last-updated; sync form |
| Zod `.strict()` fail / unknown / consent / visual keys | `VALIDATION_ERROR` (+ `fields`) | Field Messages; stay in edit; no toast success |
| Forbidden identity/privilege/audit keys | `FORBIDDEN_FIELDS` | Generic error; no write |
| Oversize payload | `PAYLOAD_TOO_LARGE` | Error toast; no write |
| No own profile row | `PROFILE_NOT_FOUND` | No edit chrome expected; CTA → `/interview` if navigated here |
| Unauthenticated | `UNAUTHENTICATED` | Auth gate / redirect (existing `(app)` behavior) |
| Inactive | `FORBIDDEN` | Existing inactive UX |
| Foreign `client_id` somehow in body | Reject / ignore as authority; still only own row | No foreign-tenant oracle |
| Concurrent two tabs Save | LWW — last UPDATE wins; both may `ok: true` with different versions | Visible `updatedAt` after refresh |
| Orphan own row (interview not `completed`) | **Allow** edit if row exists (same as US-2.1 show rule) | Edit chrome OK |

### Logging

- Log error **codes** only.
- **Never** log full free-text `fields` bodies in production.

---

## FE — `/profile` edit UX (binding)

| Rule | Detail |
|------|--------|
| Load | RSC: `getBusinessProfileForClient()` (unchanged arity 0). Edit chrome **only** when `exists: true` |
| Missing | Keep US-2.1 onboarding CTA → `/interview`. Do **not** invent empty edit form that PATCHes create |
| Editable sections | Seven allowlisted keys only. Labels: Style / Estilo for `style`. Page title Living profile / Ficha viva |
| Save | Disable while in-flight; **await** `updateBusinessProfile(mergedFullSnapshot)`; on `ok: true` → **success toast** (EN/ES); update visible `updatedAt` |
| Cancel | Discard local dirty state; restore last server-loaded values; no orphan dirty after navigation if practical |
| Optimistic-only | **Not** the default. Await + toast is frozen |
| Consent / Preferencias | **No** toggles or editors on this page |
| XSS | Controlled inputs; saved values render as text nodes / PrimeReact children only |
| i18n | `messages/en.json` + `es.json` — extend `profile.*` (save, cancel, toast, errors) |
| Identity | No `client_id` / profile UUID in URL, form hidden fields, or client fetch as identity |

---

## Reused read path — `getBusinessProfileForClient`

Unchanged from US-2.1:

- Arity 0; `requireActive("page")`; `WHERE client_id = user.id`.
- View DTO: `{ exists: true, fields, updatedAt?, version? }` or missing / `loadFailed`.
- After successful PATCH, RSC revalidation should surface new `updatedAt` / `version`. Prefer making `updatedAt` **required** on the success mutation DTO; view loader may keep optional for soft-corrupt edge cases.

BUILD may tighten the view schema so `updatedAt` and `version` are always present when `exists: true` (recommended for edit page chrome) without changing identity rules.

---

## Database

Logical name in USER_STORIES: `business_profiles`. Physical: `neuramark_business_profiles`.

### Verify-only (US-1.3 — do not recreate)

| Object | Notes |
|--------|-------|
| Table `neuramark_business_profiles` | `id`, `client_id`, `source_interview_id`, `fields` jsonb, `version`, `created_at`, `updated_at` |
| `UNIQUE (client_id)` | `neuramark_business_profiles_client_id_idx` |
| `UNIQUE (source_interview_id)` | `neuramark_business_profiles_source_interview_id_idx` |
| `fields` size CHECK | ≤ 81920 bytes |
| Trigger | `neuramark_business_profiles_set_updated_at` → `neuramark_set_updated_at` |
| RLS | Enabled; **zero** named policies; service-role Node only |
| Migration file (existing) | `supabase/migrations/20260829120000_neuramark_business_profiles.sql` |

### Migration — **YES** (US-2.2 additive)

**Required.** One additive migration only:

```sql
-- US-2.2: audit who edited Ficha viva (server-resolved Cliente)
ALTER TABLE public.neuramark_business_profiles
  ADD COLUMN updated_by uuid NULL
    REFERENCES public.neuramark_clients (id) ON DELETE SET NULL;

CREATE INDEX neuramark_business_profiles_updated_by_idx
  ON public.neuramark_business_profiles (updated_by);

COMMENT ON COLUMN public.neuramark_business_profiles.updated_by IS
  'Last editor Cliente id; set server-side on US-2.2 PATCH from getCurrentUser().id. NULL for rows never edited after create.';
```

| Rule | Detail |
|------|--------|
| Nullable | **Yes** — existing rows (US-1.3 create) remain NULL until first edit |
| FK | → `neuramark_clients(id)` `ON DELETE SET NULL` |
| Set when | Every successful `updateBusinessProfile` |
| Not set by | US-1.3 create path (may leave NULL) — OK |
| Client DTO | Prefer **omit** `updated_by` from FE props (column still written) |
| **Out** | `profile_versions` history table; Preferencias/consent columns; changing `source_interview_id` |

Suggested filename (BUILD): `supabase/migrations/YYYYMMDDHHMMSS_neuramark_business_profiles_updated_by.sql`.

---

## Enums and state transitions

### Editable field keys (allowlist)

| Key | Mutable via `updateBusinessProfile`? |
|-----|--------------------------------------|
| `services` | Yes |
| `zone` | Yes |
| `tone` | Yes |
| `offers` | Yes |
| `objections` | Yes |
| `style` | Yes |
| `restrictions` | Yes |

No other keys. Transitions: N/A for enums on this path — `fields` is a full replace of the seven-key object; `version` is monotonic integer (`n → n+1` on each successful edit). Interview `status` is **not** transitioned by this action.

### Profile row lifecycle (this story)

```text
[no row] --X--> updateBusinessProfile   (forbidden: PROFILE_NOT_FOUND, no INSERT)
[row exists] --> updateBusinessProfile --> [row exists, version+1, fields replaced, updated_by set]
```

Create remains US-1.3 `submitInterview` only.

---

## Caching / revalidation

| Event | Action |
|-------|--------|
| `updateBusinessProfile` success | `revalidatePath("/profile")`; prefer also `revalidatePath("/dashboard")` |
| Page | Keep `force-dynamic` / `Cache-Control: no-store` on `/profile` |

---

## Fixtures (FE mock)

### 1. Happy path — request

```json
{
  "services": { "items": ["Web design", "Brand kits"] },
  "zone": { "description": "Greater Miami and remote US" },
  "tone": { "description": "Clear, confident, no hype" },
  "offers": { "items": ["Landing page package", "Monthly retainer"] },
  "objections": { "items": ["Too expensive", "Need it yesterday"] },
  "style": { "description": "Clean sans, high contrast, product-first" },
  "restrictions": { "items": ["No political content"] }
}
```

### 2. Happy path — response

```json
{
  "ok": true,
  "fields": {
    "services": { "items": ["Web design", "Brand kits"] },
    "zone": { "description": "Greater Miami and remote US" },
    "tone": { "description": "Clear, confident, no hype" },
    "offers": { "items": ["Landing page package", "Monthly retainer"] },
    "objections": { "items": ["Too expensive", "Need it yesterday"] },
    "style": { "description": "Clean sans, high contrast, product-first" },
    "restrictions": { "items": ["No political content"] }
  },
  "version": 2,
  "updatedAt": "2026-08-29T16:42:10.123Z"
}
```

### 3. Smuggled consent / visual — reject

**Request:**

```json
{
  "services": { "items": ["Web design"] },
  "zone": { "description": "Miami" },
  "tone": { "description": "Warm" },
  "offers": { "items": ["Retainer"] },
  "objections": { "items": ["Price"] },
  "style": { "description": "Minimal" },
  "restrictions": { "items": [] },
  "visual_mode": "own_avatar",
  "consentAvatar": true
}
```

**Response:**

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "fields": {
      "visual_mode": ["Unrecognized key"],
      "consentAvatar": ["Unrecognized key"]
    }
  }
}
```

(Exact Zod issue wording may vary; code must be `VALIDATION_ERROR`; keys must **not** be written.)

### 4. Forbidden identity keys

**Request (illustrative — also invalid arity if passed as separate args):**

```json
{
  "client_id": "00000000-0000-4000-8000-000000000099",
  "services": { "items": ["X"] },
  "zone": { "description": "Y" },
  "tone": { "description": "Z" },
  "offers": { "items": ["A"] },
  "objections": { "items": ["B"] },
  "style": { "description": "C" },
  "restrictions": { "items": [] }
}
```

**Response:** `{ "ok": false, "error": { "code": "FORBIDDEN_FIELDS" } }` **or** `VALIDATION_ERROR` via `.strict()` — either is acceptable if **no write** and foreign id never used in `WHERE`. Prefer documenting BUILD choice as: top-level non-allowlisted keys → `.strict()` `VALIDATION_ERROR`; explicit privilege list may map to `FORBIDDEN_FIELDS` if pre-checked before Zod.

**Freeze for tests:** foreign `client_id` must not change another tenant’s row; UPDATE always `WHERE client_id = $server`.

### 5. Missing profile — no create

```json
{
  "ok": false,
  "error": {
    "code": "PROFILE_NOT_FOUND",
    "messageKey": "profile.errors.notFound"
  }
}
```

### 6. Incomplete / sparse body — reject

**Request:**

```json
{
  "services": { "items": ["Only one section"] }
}
```

**Response:** `VALIDATION_ERROR` with missing-key field errors — **no** partial write.

### 7. Unauthenticated

```json
{
  "ok": false,
  "error": { "code": "UNAUTHENTICATED" }
}
```

---

## Automated tests (security-relevant — BUILD)

- Allowlist happy path → version increments; `updated_by` = server user; `updated_at` changes; DTO returns fields + version + updatedAt.
- Smuggled consent / `visual_mode` / system / unknown keys → rejected; DB unchanged.
- Foreign `client_id` ignored / rejected; only own row updated.
- Missing row → `PROFILE_NOT_FOUND`; **no INSERT**.
- Unauthenticated / inactive → rejected; no write.
- No public Route Handler profile mutate.
- XSS regression: no `dangerouslySetInnerHTML` on profile edit/display.
- `/profile` still not on `isPublicPath`; `no-store` retained.

---

## Out of scope (do not implement)

| Topic | Owner |
|-------|--------|
| Full Entrevista redo / reopen wizard | Fuera V1 |
| `profile_versions` history table | Fuera V1 / P1 |
| `getBusinessProfileForAgents` | US-2.3 |
| Preferencias de producción visual / Consentimiento de avatar editors | US-3.x |
| Operator cross-tenant edit | Out of V1 |
| Auth redesign / `isPublicPath` changes | Auth stories |
| LLM profile enricher | Out |
| Public Route Handler GET/PATCH by UUID | Forbidden |
| Browser Supabase / new packages | Forbidden |

---

## AC mapping (for validator — do not check USER_STORIES here)

| Acceptance criterion | Satisfied by |
|----------------------|--------------|
| Edits persist and appear on next agent run | Full `fields` replace on canonical row; bumped `version` (US-2.3 reads same row) |
| Restricted fields require explicit re-confirmation | Consent / Preferencias **cannot** change via this endpoint (`.strict()` reject) |
| Concurrent edits LWW with timestamp visible | No If-Match; success returns + UI shows `updatedAt` |
| [SEC] PATCH allowlist; consent / visual_mode / system cannot be modified | Zod `.strict()` seven keys; strip/reject table |
| [SEC] Records who + bumps version | `updated_by = user.id` (migration); `version = version + 1` |

---

## CONTRACT checklist (pre-BUILD)

- [x] `updateBusinessProfile`: Server Action; `requireActive("handler")`; no tenant/profile args; `WHERE client_id = user.id`
- [x] Zod `.strict()` full seven-key body; reject consent / visual / system / unknown; full `fields` replace
- [x] Success: bump `version`; set `updated_at`; set `updated_by` from server user; return fields + version + updatedAt; `revalidatePath("/profile")`
- [x] Missing row → `PROFILE_NOT_FOUND`; **no** create
- [x] Migration: **yes** — `updated_by` nullable FK → `neuramark_clients(id)`; no `profile_versions`
- [x] CSRF: Server Action only; no public profile mutate Route Handler
- [x] `/profile` edit UI: Save + Cancel; await + toast; XSS bar; no consent/visual editors; missing → CTA `/interview`
- [x] EN/ES terminology: Ficha viva / Living profile; Style / Estilo; no CONTEXT _Evitar_
- [x] Out of scope listed
- [x] **Reviewed by FE** — yes — 2026-08-29 (see header FE notes). Ready for BUILD.

---

## FE signoff prompts

When reviewing, confirm:

1. `updateBusinessProfile(fullSevenKeyFields)` → `{ ok: true, fields, version, updatedAt }` enough for Save + toast + timestamp refresh? **Yes**
2. Await + success toast (not optimistic-only) OK? **Yes**
3. Cancel = restore last server snapshot OK? **Yes**
4. Missing → no edit chrome; CTA `/interview` OK? **Yes**
5. Migration **yes** (`updated_by`) — FE omits from props OK? **Yes**
6. Error codes `VALIDATION_ERROR` / `FORBIDDEN_FIELDS` / `PROFILE_NOT_FOUND` / `UNAUTHENTICATED` / `FORBIDDEN` enough for Messages? **Yes**
7. No public Route Handler; no tenant ids in URL/body as identity? **Yes**

**Signoff line (FE fills):** `Reviewed by FE: yes — 2026-08-29` (+ FE notes in header). **Signed.**
