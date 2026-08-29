Reviewed by FE: yes — 2026-08-29 — FE will implement Preferencias UI against this freeze (`/settings/preferences`, arity-0 loader, `upsertVisualPreferences`, consent-disabled `own_avatar`).

# API Contract — US-3.1 Choose visual production mode (Preferencias de producción visual)

**Story:** US-3.1  
**Status:** **Frozen** — 2026-08-29 (FE signed off)  
**Security:** `plan/stories/US-3.1/SECURITY.md` (APPROVE WITH CONDITIONS — binding freeze; do not reopen)  
**Spec review:** `plan/stories/US-3.1/SPEC-REVIEW.md` (ALIGNED — multi-select allowlist; SPEC S3.M4 wins over singular USER_STORIES `visual_mode`)  
**Depends on:** US-2.1 CONTRACT (frozen) — Ficha viva context · US-2.2 CONTRACT (frozen) — Preferencias keys stay rejected on Ficha viva PATCH · US-2.3 CONTRACT (frozen) — `visualModeSummary` stub to widen · US-14.5 — `getCurrentUser()` / `requireActive()`  
**Identity seam:** `lib/auth/get-current-user.ts` / `requireActive()` (US-14.5 — unchanged)  
**Error envelope style:** same class as profile/interview/auth (`ok: true` vs `{ ok: false, error: { code, fields?, messageKey? } }`)

**This document is CONTRACT ONLY.** Do not implement loaders, Server Actions, Zod in code, or migrations until FE signoff. Zod below is a documentation sketch for the future BUILD files (`lib/contracts/visual-preferences.ts`, Preferencias server modules).

**Terminology:** **Preferencias de producción visual** (ES/EN product entity). Page title: **Visual production preferences** (EN) / **Preferencias de producción visual** (ES). Modalities: **Avatar propio autorizado** · **Avatar genérico profesional** · **Video sin rostro** / **B-roll / sin presencia**. **Consentimiento de avatar** (US-3.2 — soft probe only). Role: **Cliente** / **Operator**. Technical enums `own_avatar` \| `generic_avatar` \| `faceless` OK in code/DB only — never primary UI headlines. Do **not** use CONTEXT _Evitar_ terms (avatar mode / visual preferences as entity names, visual mode selector, single mode, production mode, Business Profile, admin / staff, consent ledger in product copy) in this file’s product-facing strings, fixtures’ UI labels, or i18n headlines.

---

## Overview

An authenticated, activated Cliente configures which production modalities they accept (multi-select **allowlist**) on a dedicated gated settings page. The server:

1. Resolves identity via `requireActive("page"|"handler")` / `getCurrentUser().id` only.
2. Loads own Preferencias (arity 0) or an explicit empty/missing view for the form.
3. Validates the mutation body with Zod **`.strict()`**: allowlist ⊆ `{ own_avatar, generic_avatar, faceless }`; structured `faceless_style` when `faceless` ∈ allowlist; `generic_avatar_id` null-only stub in V1.
4. **Rejects** persist if `own_avatar` ∈ allowlist and `hasActiveAvatarConsent(clientId)` is false (fail closed pre–US-3.2).
5. Upserts **own** row only (`WHERE client_id = $server`); derives server-owned `rules` (e.g. `must_disclose_not_owner` when `generic_avatar` ∈ allowlist).
6. **Never** enqueues jobs, regenerates strategy/scripts/media, or calls providers on save — upsert + `revalidatePath` only.
7. Optionally (same BUILD, soft): when a Preferencias row exists, populate `getBusinessProfileForAgents.visualModeSummary` from the allowlist (omit consent internals); if absent, keep `null`.

**Surfaces**

| # | Surface | Kind | New vs reused |
|---|---------|------|---------------|
| 1 | `/settings/preferences` page | RSC + Preferencias Client form under `(app)` | **New** — gated settings; **not** `/profile` edit |
| 2 | `getVisualPreferencesForClient` | RSC server helper | **New** — arity 0 load |
| 3 | `upsertVisualPreferences` | Server Action | **New** — only Cliente Preferencias writer |
| 4 | `hasActiveAvatarConsent` | Server-only soft helper | **New** — fail-closed probe; no ledger UI/API |
| 5 | `getBusinessProfileForAgents` | Server-only helper (US-2.3) | **Extend (soft)** — widen `visualModeSummary` when Preferencias exist |
| 6 | `updateBusinessProfile` | Server Action (US-2.2) | **Unchanged** — Preferencias keys remain rejected |

No public Route Handler. No GET-by-id / PATCH-by-id Preferencias API. No consent grant/revoke. No `media_assets`. No Modalidad de producción per slot.

**Frontend consumers**

| Consumer | Route | Contract surface |
|----------|-------|------------------|
| Preferencias settings UI | `app/(app)/settings/preferences/page.tsx` (+ Client form) | Load via `getVisualPreferencesForClient()`; Save calls `upsertVisualPreferences(body)`; Cancel discards local edits |
| Consent-availability UX | Same Client form | Soft boolean from loader/`hasActiveAvatarConsent` path — disable Avatar propio when false; UI is **not** authority |
| Success feedback | Client form | On `{ ok: true }` → **await** + success toast (EN/ES); show refreshed allowlist + `updatedAt` |
| Nav / discoverability | Dashboard and/or profile nav link | Link to `/settings/preferences` only — no Preferencias editors on `/profile` |

**Server-only modules (planned BUILD)**

| Module | Purpose |
|--------|---------|
| `lib/visual-preferences/get-visual-preferences-for-client.ts` | `import "server-only"`; arity-0 loader |
| `lib/visual-preferences/upsert-visual-preferences.ts` (or `…/actions/…`) | `"use server"` `upsertVisualPreferences` |
| `lib/visual-preferences/has-active-avatar-consent.ts` | `import "server-only"`; fail-closed consent probe |
| `lib/contracts/visual-preferences.ts` | Zod + types for input/result/view DTO |
| `lib/profile/get-business-profile-for-agents.ts` | Soft: populate `visualModeSummary` from Preferencias |
| `app/(app)/settings/preferences/page.tsx` (+ Client form) | Settings UI |
| `lib/auth/require-user.ts` | Unchanged |
| `lib/supabase/server.ts` | Unchanged |
| Migration | **Yes** — create `neuramark_visual_preferences` |

---

## Frozen decisions (from SECURITY.md + SPEC-REVIEW + PO TASKS)

Do not reopen.

| # | Topic | Freeze |
|---|-------|--------|
| 1 | **Allowlist (SPEC wins)** | Preferencias = **multi-select set** ⊆ `{ own_avatar, generic_avatar, faceless }`. Not a singular product `mode` column. Parent AC “three modes selectable” / “mode stored” = modalities in Preferencias shown on settings |
| 2 | **Settings route** | **`/settings/preferences`** under `app/(app)/`. EN title “Visual production preferences” / ES “Preferencias de producción visual”. **Not** on Ficha viva `/profile` edit. Off `isPublicPath`; `requireActive("page")`; `Cache-Control: no-store` |
| 3 | **Surface / CSRF** | Server Action **`upsertVisualPreferences`** only. POST + Next.js origin check. `requireActive("handler")` before any write. **No** public Route Handler `/api/…` with tenant ids |
| 4 | **Identity / IDOR** | **No** `client_id` / prefs `id` / `as_client_id` as write/read authority. Loader arity **0**; action arity **≤1** (body only). All queries `WHERE client_id = user.id` |
| 5 | **Empty allowlist** | **Allowed.** Cliente may save `allowedModes: []` (= none selected). Strategy later treats empty as no eligible modalities — not a validation error |
| 6 | **Consent soft gate** | If `own_avatar` ∈ allowlist and `hasActiveAvatarConsent(user.id)` is **false** → reject with `OWN_AVATAR_CONSENT_REQUIRED`. Fail closed if consent table missing / no row / revoked / probe error. Preferencias save **never** grants consent |
| 7 | **`faceless_style`** | **Required** (non-null structured object) when `faceless` ∈ allowlist; **must be null/omitted** when `faceless` ∉ allowlist. Keys frozen below |
| 8 | **`generic_avatar_id`** | Nullable stub. V1 client may send **`null` only**; non-null → `VALIDATION_ERROR` until catalog/US-3.3 |
| 9 | **`rules`** | Server-derived only. When `generic_avatar` ∈ allowlist → `{ must_disclose_not_owner: true }`; otherwise `{ must_disclose_not_owner: false }`. **Never** client-writable |
| 10 | **No silent regenerate** | Upsert Preferencias + `revalidatePath` **only**. No job enqueue, strategy/script/media regenerate, provider calls. Tests prove no generation side effects |
| 11 | **No human recording** | Copy + UX never ask Cliente to record video/audio; own-avatar references = future uploads (US-3.3) |
| 12 | **Hard-disable V1** | Only Avatar propio without consent. Missing assets = soft note only (selection may persist) |
| 13 | **XSS** | i18n explanations trusted; stored values as React text / select enums — **no** `dangerouslySetInnerHTML` |
| 14 | **Agent summary** | Soft same-BUILD: when Preferencias row exists, set `visualModeSummary` from allowlist; if absent, `null`. Omit consent internals |
| 15 | **Out of scope** | US-3.2 ledger UI/API; US-3.3 uploads; US-3.4 QA UI; Modalidad por slot; Ficha viva Preferencias writes; auth redesign; browser Supabase |

### Strip vs reject (mutation body)

| Keys | Behavior |
|------|----------|
| `allowedModes` (array of enum tokens) | **Accept** via Zod `.strict()`; may be empty |
| `facelessStyle` (structured) | **Accept** when `faceless` ∈ set; **reject** if present when `faceless` ∉ set, or missing/invalid when ∈ set |
| `genericAvatarId` | **Accept** only `null` in V1; non-null → `VALIDATION_ERROR` |
| Unknown keys | **Reject** → `VALIDATION_ERROR` (Zod `.strict()`). Never written |
| `rules`, `must_disclose_not_owner`, `mustDiscloseNotOwner` | **Reject** → `FORBIDDEN_FIELDS` (or `VALIDATION_ERROR` via `.strict()`). Server derives |
| consent*, `consented_at`, `consent_version`, `revoked_at` | **Reject** → `FORBIDDEN_FIELDS` / `VALIDATION_ERROR`. Never written; never grant |
| `client_id`, `clientId`, `id`, `as_client_id`, prefs UUID | **Reject** → `FORBIDDEN_FIELDS` / `VALIDATION_ERROR`. Never used in `WHERE` |
| `role`, `active`, `auth_user_id`, `authUserId` | **Reject** → `FORBIDDEN_FIELDS` |
| Client-supplied `updated_at` / `updatedAt`, `created_at` | **Reject** → `FORBIDDEN_FIELDS` / `VALIDATION_ERROR`. Server owns timestamps |
| Query `?client_id=` / dynamic `/settings/preferences/[id]` mutate | **Forbidden.** No such surface |

**Note:** Prefer a single object body that **is** the client-writable Preferencias slice (not `{ preferences: {…}, client_id: … }`). If BUILD wraps, wrapper must also be `.strict()` and must not accept tenant/audit/rules keys.

---

## Route — `/settings/preferences` (**new**)

| Rule | Detail |
|------|--------|
| Path | **`/settings/preferences`** (frozen) |
| Layout | `app/(app)/settings/preferences/page.tsx` |
| Auth | `requireActive("page")`; off `isPublicPath` |
| Cache | `force-dynamic` / `Cache-Control: no-store` |
| Not on | `/profile` edit chrome (US-2.2) |
| Nav | Link from dashboard and/or profile nav (FE); English/Spanish labels use Preferencias terms |

---

## Server helper — `getVisualPreferencesForClient` (**new**)

**File (BUILD):** `lib/visual-preferences/get-visual-preferences-for-client.ts` (`import "server-only"`)  
**Frontend consumer:** `/settings/preferences` RSC.  
**Why server helper (not Route Handler):** UI-coupled read under `(app)`; identity from session; same class as `getBusinessProfileForClient`.

**Signature (frozen):**

```ts
/**
 * Load own Preferencias de producción visual.
 * Arity 0 — identity only via requireActive("page") / getCurrentUser().id.
 */
export async function getVisualPreferencesForClient(): Promise<VisualPreferencesForClientResult>;
```

**Auth:** `requireActive("page")` inside the helper (or page calls `requireActive` then helper — BUILD must not accept tenant args either way).  
- Unauthenticated / inactive → existing `(app)` gate behavior (redirect / forbidden); helper itself should not invent foreign-tenant reads.

### Return shape

```ts
export const visualModalitySchema = z.enum([
  "own_avatar",
  "generic_avatar",
  "faceless",
]);

export type VisualModality = z.infer<typeof visualModalitySchema>;

export const facelessStyleSchema = z
  .object({
    /** Voice / audio preference for Video sin rostro */
    voice: z.enum(["none", "ai_voiceover", "music_only"]),
    /** On-screen text preference */
    onScreenText: z.enum(["none", "captions", "headline_and_captions"]),
    /** B-roll / stock imagery preference */
    broll: z.enum(["stock", "product_led", "mixed"]),
  })
  .strict();

export type FacelessStyle = z.infer<typeof facelessStyleSchema>;

/** Server-owned rules — present on DTO for FE display of disclosure stub if needed; not editable */
export const visualPreferencesRulesSchema = z
  .object({
    must_disclose_not_owner: z.boolean(),
  })
  .strict();

export const visualPreferencesViewExistsSchema = z
  .object({
    exists: z.literal(true),
    allowedModes: z.array(visualModalitySchema).max(3),
    facelessStyle: facelessStyleSchema.nullable(),
    genericAvatarId: z.null(), // V1 stub always null in DTO
    rules: visualPreferencesRulesSchema,
    updatedAt: z.string().datetime({ offset: true }),
    /** Soft UX signal — not authority; server re-checks on upsert */
    ownAvatarConsentActive: z.boolean(),
  })
  .strict();

export const visualPreferencesViewMissingSchema = z
  .object({
    exists: z.literal(false),
    /** Defaults for empty form */
    allowedModes: z.tuple([]).or(z.array(visualModalitySchema).length(0)),
    facelessStyle: z.null(),
    genericAvatarId: z.null(),
    rules: z.null(),
    updatedAt: z.null(),
    ownAvatarConsentActive: z.boolean(),
  })
  .strict();

export const visualPreferencesViewLoadFailedSchema = z
  .object({
    exists: z.literal(false),
    loadFailed: z.literal(true),
    ownAvatarConsentActive: z.boolean().optional(),
  })
  .strict();

export const visualPreferencesForClientResultSchema = z.discriminatedUnion(
  "exists",
  [
    visualPreferencesViewExistsSchema,
    // BUILD may use a tagged union with loadFailed; soft failure must not dump jsonb
  ],
);
// Practical BUILD union:
export type VisualPreferencesForClientResult =
  | z.infer<typeof visualPreferencesViewExistsSchema>
  | z.infer<typeof visualPreferencesViewMissingSchema>
  | z.infer<typeof visualPreferencesViewLoadFailedSchema>;
```

**Query:** parameterized `SELECT … FROM neuramark_visual_preferences WHERE client_id = $server`. Service-role Node; RLS deny-by-default.

**Do not:** accept tenant args; return consent ledger rows; return `auth_user_id` / `role` / tokens; join other tenants.

---

## Soft helper — `hasActiveAvatarConsent` (**new**)

**File (BUILD):** `lib/visual-preferences/has-active-avatar-consent.ts` (`import "server-only"`)  
**Consumers:** `upsertVisualPreferences` (authority); settings loader (UX boolean).  
**Why helper (not Server Action):** read-only probe; no ledger UI; US-3.2 owns grant/revoke.

**Signature (frozen):**

```ts
/**
 * Fail-closed Consentimiento de avatar probe (pre–US-3.2 soft gate).
 * @param clientId — must be server-resolved getCurrentUser().id (or trusted job id later).
 * Never invent consent rows. Never default true.
 */
export async function hasActiveAvatarConsent(
  clientId: string,
): Promise<boolean>;
```

### Semantics (binding — SECURITY)

| Case | Return |
|------|--------|
| Consent table does not exist yet (`neuramark_avatar_consents` or CONTRACT successor) | **`false`** |
| Table exists, no row for `clientId` | **`false`** |
| Row exists, `revoked_at` set | **`false`** |
| Active non-revoked row (US-3.2+) | **`true`** |
| Probe / query / unexpected error | **`false`** |

**Do not:** grant consent; INSERT/UPDATE consent; fail open; cache “consented” on Preferencias row as authority.

**Table name note:** Full ledger is US-3.2 (`neuramark_avatar_consents` expected). This story does **not** create it. Probe must tolerate missing relation → `false`.

---

## Server Action — `upsertVisualPreferences` (**new**)

**File (BUILD):** `lib/visual-preferences/upsert-visual-preferences.ts` — `"use server"`  
**Frontend consumer:** `/settings/preferences` Client form — **Save**.  
**Why Server Action (not Route Handler):** UI-coupled mutation; CSRF via Next.js origin check. No public HTTP Preferencias API.

**Signature (frozen):**

```ts
/**
 * Upsert own Preferencias de producción visual.
 * No tenant/prefs id arguments — identity only via requireActive("handler") / getCurrentUser().id.
 * Body = client-writable slice only (Zod .strict()).
 */
export async function upsertVisualPreferences(
  input: UpsertVisualPreferencesInput,
): Promise<UpsertVisualPreferencesResult>;
```

**Auth:** `requireActive("handler")` **before** any DB write.  
- Unauthenticated → `{ ok: false, error: { code: "UNAUTHENTICATED" } }`; **no** side effects.  
- Inactive → `{ ok: false, error: { code: "FORBIDDEN" } }`; **no** side effects.

**CSRF:** Next.js Server Action built-in origin check (POST from same origin only). No GET mutate.

### Input

```ts
/** BUILD: lib/contracts/visual-preferences.ts */

export const upsertVisualPreferencesInputSchema = z
  .object({
    allowedModes: z
      .array(visualModalitySchema)
      .max(3)
      .superRefine((arr, ctx) => {
        const unique = new Set(arr);
        if (unique.size !== arr.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Duplicate modalities are not allowed",
            path: ["allowedModes"],
          });
        }
      }),
    facelessStyle: facelessStyleSchema.nullable().optional(),
    /** V1: null only */
    genericAvatarId: z.null().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    const hasFaceless = val.allowedModes.includes("faceless");
    if (hasFaceless) {
      if (val.facelessStyle == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "facelessStyle is required when faceless is selected",
          path: ["facelessStyle"],
        });
      }
    } else if (val.facelessStyle != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "facelessStyle must be null when faceless is not selected",
        path: ["facelessStyle"],
      });
    }
  });

export type UpsertVisualPreferencesInput = z.infer<
  typeof upsertVisualPreferencesInputSchema
>;
```

**Payload size:** Cap `faceless_style` jsonb ≤ 4 KiB (recommend). Oversize → `PAYLOAD_TOO_LARGE` or `VALIDATION_ERROR` **before** write.

### Success / error result

```ts
export const upsertVisualPreferencesSuccessSchema = z
  .object({
    ok: z.literal(true),
    allowedModes: z.array(visualModalitySchema).max(3),
    facelessStyle: facelessStyleSchema.nullable(),
    genericAvatarId: z.null(),
    rules: visualPreferencesRulesSchema,
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type UpsertVisualPreferencesSuccess = z.infer<
  typeof upsertVisualPreferencesSuccessSchema
>;

/**
 * Error codes — aligned with US-2.2 / interview / auth style.
 * OWN_AVATAR_CONSENT_REQUIRED is US-3.1–specific.
 * PROFILE_NOT_FOUND is N/A for this upsert (creates Preferencias row); keep unused here.
 */
export const upsertVisualPreferencesErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "PAYLOAD_TOO_LARGE",
  "FORBIDDEN_FIELDS",
  "OWN_AVATAR_CONSENT_REQUIRED",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "INTERNAL_ERROR",
]);

export const upsertVisualPreferencesErrorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z
    .object({
      code: upsertVisualPreferencesErrorCodeSchema,
      fields: z.record(z.string(), z.array(z.string())).optional(),
      messageKey: z.string().optional(),
    })
    .strict(),
});

export type UpsertVisualPreferencesErrorEnvelope = z.infer<
  typeof upsertVisualPreferencesErrorEnvelopeSchema
>;

export const upsertVisualPreferencesResultSchema = z.discriminatedUnion("ok", [
  upsertVisualPreferencesSuccessSchema,
  upsertVisualPreferencesErrorEnvelopeSchema,
]);

export type UpsertVisualPreferencesResult = z.infer<
  typeof upsertVisualPreferencesResultSchema
>;
```

### Server algorithm (frozen)

1. `requireActive("handler")` → resolve `user`. Fail → `UNAUTHENTICATED` / `FORBIDDEN`; no write.
2. If body contains forbidden identity/privilege/rules/consent/audit keys (see strip/reject table) → `FORBIDDEN_FIELDS` or `VALIDATION_ERROR`; no write.
3. Zod-parse body as `upsertVisualPreferencesInputSchema` (`.strict()` + faceless refinements). Failure → `VALIDATION_ERROR` + `fields`; no write.
4. Payload size check → `PAYLOAD_TOO_LARGE` if over cap; no write.
5. If `own_avatar` ∈ `allowedModes` and `!(await hasActiveAvatarConsent(user.id))` →  
   `{ ok: false, error: { code: "OWN_AVATAR_CONSENT_REQUIRED", messageKey: "preferences.errors.ownAvatarConsentRequired" } }`; **no write**.
6. Derive `rules`:
   - `must_disclose_not_owner = allowedModes.includes("generic_avatar")`.
7. Parameterized upsert (service-role Node only):

```ts
.from("neuramark_visual_preferences")
.upsert(
  {
    client_id: user.id, // never from client
    allowed_modes: validated.allowedModes,
    faceless_style: validated.facelessStyle ?? null,
    generic_avatar_id: null, // V1
    rules: { must_disclose_not_owner: /* derived */ },
    // updated_at via BEFORE UPDATE trigger and/or explicit set on conflict
  },
  { onConflict: "client_id" },
)
.select("allowed_modes, faceless_style, generic_avatar_id, rules, updated_at")
.single();
```

8. On success: `revalidatePath("/settings/preferences")` (and dashboard/nav if Preferencias summary appears — optional).  
9. Return `{ ok: true, allowedModes, facelessStyle, genericAvatarId: null, rules, updatedAt }`.

### Explicit non-behavior — **no silent regenerate**

On success or failure, this action **must not**:

- Insert/update job / strategy / script / media / TTS / video queue tables  
- Call generation helpers, provider adapters, or LLM modules  
- Trigger “regenerate now” or invalidate in-flight content as a side effect beyond path revalidation  

**Evidence (BUILD):** automated test asserts no inserts into job/strategy tables and no calls to generation modules when `upsertVisualPreferences` succeeds.

**Do not:** write Preferencias into `neuramark_business_profiles.fields`; mutate consent ledger; create `media_assets`; log full preference jsonb in production.

### Outcome matrix

| Case | Result | FE |
|------|--------|-----|
| Valid body (with or without `faceless`) + consent OK if needed | `{ ok: true, … }` | Success toast; sync form; show `updatedAt` |
| Zod `.strict()` / unknown / faceless style mismatch | `VALIDATION_ERROR` (+ `fields`) | Field Messages; stay in edit; no toast success |
| Forbidden identity/privilege/rules/consent keys | `FORBIDDEN_FIELDS` | Generic error; no write |
| `own_avatar` ∈ set + no active consent | `OWN_AVATAR_CONSENT_REQUIRED` | Show consent reason; keep Avatar propio disabled; no write |
| Oversize payload | `PAYLOAD_TOO_LARGE` | Error toast; no write |
| Unauthenticated | `UNAUTHENTICATED` | Auth gate / redirect |
| Inactive | `FORBIDDEN` | Existing inactive UX |
| Foreign `client_id` in body | Reject / ignore as authority; still only own row | No foreign-tenant write |
| Concurrent two tabs Save | LWW — last UPSERT wins | Visible `updatedAt` after refresh |
| Empty `allowedModes: []` | `{ ok: true, allowedModes: [], … }` | Allowed; show empty selection |

### Logging

- Log error **codes** only.
- **Never** log full preference jsonb bodies in production.

---

## Soft extend — `getBusinessProfileForAgents.visualModeSummary`

**Owner:** US-2.3 helper module (server-only).  
**This story:** optional same-BUILD soft follow-up (PO / SPEC ALIGNED).

| When | `visualModeSummary` |
|------|---------------------|
| No Preferencias row for `clientId` | `null` (US-2.3 behavior retained) |
| Preferencias row exists | Minimal allowlist projection (below) |
| Always omit | Consent ledger, revoke state, `rules` internals beyond summary, tokens, privilege |

**Frozen summary shape (when non-null):**

```ts
export const visualModeSummarySchema = z
  .object({
    allowedModes: z.array(visualModalitySchema).max(3),
  })
  .strict();

// Widen US-2.3 agent DTO field from z.null() to:
// visualModeSummary: visualModeSummarySchema.nullable()
```

**Stub note:** If BUILD defers population, keep `null` and leave a TODO referencing this CONTRACT — not a ship blocker for Preferencias settings AC, but preferred in the same BUILD for US-4.1 continuity.

**Do not:** client-bundle the agents helper; dump consent into summary.

---

## FE — `/settings/preferences` UX (binding)

| Rule | Detail |
|------|--------|
| Load | RSC: `getVisualPreferencesForClient()`. Prefill form from `exists` or empty defaults |
| Modalities | Three options with EN/ES explanations/examples — product labels, **not** raw enums as headlines |
| Disable | Hard-disable Avatar propio when `ownAvatarConsentActive === false`; show why. Soft note that own-avatar needs reference uploads later (US-3.3) |
| Faceless | When Video sin rostro included, show constrained `facelessStyle` controls (voice + on-screen text + B-roll) |
| Save | Disable while in-flight; **await** `upsertVisualPreferences(body)`; on `ok: true` → **success toast** |
| Cancel | Discard local dirty state; restore last server-loaded values |
| Optimistic-only | **Not** the default. Await + toast is frozen |
| No recording | Never prompt to record video/audio |
| XSS | Controlled inputs / PrimeReact; no `dangerouslySetInnerHTML` |
| i18n | `messages/en.json` + `es.json` — Preferencias terms; avoid CONTEXT _Evitar_ |
| Identity | No `client_id` / prefs UUID in URL, form hidden fields, or client fetch as identity |
| Not on `/profile` | Do not add Preferencias editors to Ficha viva edit chrome |

---

## Database

Logical name in USER_STORIES: `visual_preferences`. Physical: **`neuramark_visual_preferences`** (SPEC).

### Migration — **YES** (US-3.1 create)

**Required.** New table migration:

```sql
-- US-3.1: Preferencias de producción visual (allowlist)
-- Enum tokens are technical only; product copy uses CONTEXT labels.

CREATE TYPE public.neuramark_visual_modality AS ENUM (
  'own_avatar',
  'generic_avatar',
  'faceless'
);

CREATE TABLE public.neuramark_visual_preferences (
  client_id uuid PRIMARY KEY
    REFERENCES public.neuramark_clients (id) ON DELETE CASCADE,
  allowed_modes public.neuramark_visual_modality[] NOT NULL
    DEFAULT '{}'::public.neuramark_visual_modality[],
  generic_avatar_id uuid NULL,
  -- V1: no FK to catalog/media; always NULL until US-3.3 / catalog
  faceless_style jsonb NULL,
  rules jsonb NOT NULL
    DEFAULT '{"must_disclose_not_owner": false}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT neuramark_visual_preferences_allowed_modes_valid_chk
    CHECK (
      allowed_modes <@ ARRAY[
        'own_avatar',
        'generic_avatar',
        'faceless'
      ]::public.neuramark_visual_modality[]
    ),
  CONSTRAINT neuramark_visual_preferences_allowed_modes_unique_chk
    CHECK (cardinality(allowed_modes) = cardinality(ARRAY(SELECT DISTINCT unnest(allowed_modes)))),
  CONSTRAINT neuramark_visual_preferences_faceless_style_size_chk
    CHECK (
      faceless_style IS NULL
      OR pg_column_size(faceless_style) <= 4096
    ),
  CONSTRAINT neuramark_visual_preferences_faceless_consistency_chk
    CHECK (
      (
        'faceless' = ANY (allowed_modes)
        AND faceless_style IS NOT NULL
      )
      OR (
        NOT ('faceless' = ANY (allowed_modes))
        AND faceless_style IS NULL
      )
    )
);

CREATE TRIGGER neuramark_visual_preferences_set_updated_at
  BEFORE UPDATE ON public.neuramark_visual_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_set_updated_at();

ALTER TABLE public.neuramark_visual_preferences ENABLE ROW LEVEL SECURITY;
-- Zero named policies → deny-by-default for anon/authenticated roles.
-- Access only via service-role Node (Next.js backend).

COMMENT ON TABLE public.neuramark_visual_preferences IS
  'Cliente Preferencias de producción visual allowlist; US-3.1. Not Ficha viva fields.';
COMMENT ON COLUMN public.neuramark_visual_preferences.allowed_modes IS
  'Multi-select modality tokens ⊆ {own_avatar, generic_avatar, faceless}. Empty = none selected.';
COMMENT ON COLUMN public.neuramark_visual_preferences.rules IS
  'Server-derived only (e.g. must_disclose_not_owner). Never client-writable.';
COMMENT ON COLUMN public.neuramark_visual_preferences.faceless_style IS
  'Structured jsonb { voice, onScreenText, broll } when faceless ∈ allowlist.';
```

| Rule | Detail |
|------|--------|
| PK | `client_id` (UNIQUE implied) FK → `neuramark_clients(id)` `ON DELETE CASCADE` |
| Allowlist column | `allowed_modes neuramark_visual_modality[]` — **not** singular `mode` |
| RLS | Enabled; **zero** named policies; service-role Node only |
| Consent table | **Do not** create `neuramark_avatar_consents` here (US-3.2) |
| Media | **Do not** create `media_assets` here (US-3.3) |
| Ficha viva | **No** Preferencias columns on `neuramark_business_profiles` |

Suggested filename (BUILD): `supabase/migrations/YYYYMMDDHHMMSS_neuramark_visual_preferences.sql`.

---

## Enums and state transitions

### Modality tokens (allowlist membership)

| Token | Product label | Selectable when | Persist gate |
|-------|---------------|-----------------|--------------|
| `own_avatar` | Avatar propio autorizado | UI: consent active | Server: `hasActiveAvatarConsent` true |
| `generic_avatar` | Avatar genérico profesional | Always (V1) | Always (V1) |
| `faceless` | Video sin rostro / B-roll | Always (V1) | Requires `faceless_style` |

### `faceless_style` axes

| Key | Allowed values |
|-----|----------------|
| `voice` | `none` \| `ai_voiceover` \| `music_only` |
| `onScreenText` | `none` \| `captions` \| `headline_and_captions` |
| `broll` | `stock` \| `product_led` \| `mixed` |

### `rules` transitions (server)

```text
generic_avatar ∈ allowed_modes  →  rules.must_disclose_not_owner = true
generic_avatar ∉ allowed_modes  →  rules.must_disclose_not_owner = false
```

Client cannot set either value.

### Preferencias row lifecycle

```text
[no row] --> upsertVisualPreferences --> [row exists]
[row exists] --> upsertVisualPreferences --> [row exists, fields replaced, updated_at bumped]
```

No delete API in this story. Empty allowlist still leaves a row (explicit “none selected”).

---

## Caching / revalidation

| Event | Action |
|-------|--------|
| `upsertVisualPreferences` success | `revalidatePath("/settings/preferences")`; optional dashboard/nav |
| Page | `force-dynamic` / `Cache-Control: no-store` on `/settings/preferences` |

---

## Fixtures (FE mock)

### 1. Happy path — allowlist **with** faceless — request

```json
{
  "allowedModes": ["generic_avatar", "faceless"],
  "facelessStyle": {
    "voice": "ai_voiceover",
    "onScreenText": "captions",
    "broll": "stock"
  },
  "genericAvatarId": null
}
```

### 2. Happy path — with faceless — response

```json
{
  "ok": true,
  "allowedModes": ["generic_avatar", "faceless"],
  "facelessStyle": {
    "voice": "ai_voiceover",
    "onScreenText": "captions",
    "broll": "stock"
  },
  "genericAvatarId": null,
  "rules": { "must_disclose_not_owner": true },
  "updatedAt": "2026-08-29T21:40:00.000Z"
}
```

### 3. Happy path — allowlist **without** faceless — request

```json
{
  "allowedModes": ["generic_avatar"],
  "facelessStyle": null,
  "genericAvatarId": null
}
```

### 4. Happy path — without faceless — response

```json
{
  "ok": true,
  "allowedModes": ["generic_avatar"],
  "facelessStyle": null,
  "genericAvatarId": null,
  "rules": { "must_disclose_not_owner": true },
  "updatedAt": "2026-08-29T21:41:00.000Z"
}
```

### 5. Reject `own_avatar` without consent

**Preconditions:** `hasActiveAvatarConsent(serverUserId) === false` (missing table / no row / revoked / error).

**Request:**

```json
{
  "allowedModes": ["own_avatar", "faceless"],
  "facelessStyle": {
    "voice": "music_only",
    "onScreenText": "headline_and_captions",
    "broll": "mixed"
  },
  "genericAvatarId": null
}
```

**Response:**

```json
{
  "ok": false,
  "error": {
    "code": "OWN_AVATAR_CONSENT_REQUIRED",
    "messageKey": "preferences.errors.ownAvatarConsentRequired"
  }
}
```

(No DB write. Consent is **not** granted.)

### 6. IDOR — session-bound (**N/A as tenant API**)

There is **no** Preferencias-by-id HTTP surface. Smuggled tenant keys are rejected; upsert always uses `client_id = getCurrentUser().id`.

**Request (illustrative — must not write victim row):**

```json
{
  "client_id": "00000000-0000-4000-8000-000000000099",
  "allowedModes": ["generic_avatar"],
  "facelessStyle": null,
  "genericAvatarId": null
}
```

**Response:** `{ "ok": false, "error": { "code": "FORBIDDEN_FIELDS" } }` **or** `VALIDATION_ERROR` via `.strict()` — either acceptable if **no write** and foreign id never used in `WHERE`.

**Freeze for tests:** foreign `client_id` must not change another tenant’s Preferencias; UPSERT always `client_id = $server`.

### 7. Faceless without style — reject

**Request:**

```json
{
  "allowedModes": ["faceless"],
  "facelessStyle": null
}
```

**Response:** `VALIDATION_ERROR` with `facelessStyle` field errors — **no** write.

### 8. Unknown modality — reject

**Request:**

```json
{
  "allowedModes": ["own_avatar", "god_mode"],
  "facelessStyle": null
}
```

**Response:** `VALIDATION_ERROR` — **no** write.

### 9. Client-writable `rules` — reject

**Request:**

```json
{
  "allowedModes": ["generic_avatar"],
  "facelessStyle": null,
  "rules": { "must_disclose_not_owner": false }
}
```

**Response:** `FORBIDDEN_FIELDS` or `VALIDATION_ERROR` — **no** write; server would still derive `true` if generic were accepted without `rules` key.

### 10. Unauthenticated

```json
{
  "ok": false,
  "error": { "code": "UNAUTHENTICATED" }
}
```

### 11. Loader — missing Preferencias (empty form)

```json
{
  "exists": false,
  "allowedModes": [],
  "facelessStyle": null,
  "genericAvatarId": null,
  "rules": null,
  "updatedAt": null,
  "ownAvatarConsentActive": false
}
```

### 12. Agent summary (when Preferencias exist — soft)

```json
{
  "exists": true,
  "clientId": "11111111-1111-4111-8111-111111111111",
  "version": 2,
  "fields": { "...": "seven keys omitted in this fixture" },
  "visualModeSummary": {
    "allowedModes": ["generic_avatar", "faceless"]
  },
  "updatedAt": "2026-08-29T21:40:00.000Z"
}
```

---

## Automated tests (security-relevant — BUILD)

- Allowlist happy path (with / without faceless) → row upserted; `rules` derived; DTO returns allowlist + `updatedAt`.
- Empty allowlist → allowed; persisted as `{}` / `[]`.
- Unknown enum / duplicate tokens → rejected; DB unchanged.
- `own_avatar` without consent (incl. missing-table fail-closed) → `OWN_AVATAR_CONSENT_REQUIRED`; no write; no consent invent.
- `faceless` without style / style without faceless → `VALIDATION_ERROR`.
- Client `rules` / `must_disclose_not_owner` / consent* / tenant ids → rejected.
- Foreign `client_id` ignored/rejected; only own row upserted.
- Unauthenticated / inactive → rejected; no write.
- **No silent regenerate:** success path does not insert job/strategy/script/media rows; does not call generation modules.
- US-2.2 PATCH still rejects Preferencias / `visual_mode` keys (regression).
- No public Route Handler Preferencias mutate.
- XSS regression: no `dangerouslySetInnerHTML` on settings Preferencias UI.
- `/settings/preferences` not on `isPublicPath`; `no-store` retained.

---

## Out of scope (do not implement)

| Topic | Owner |
|-------|--------|
| Consentimiento ledger UI/API / revoke / `consent_version` | US-3.2 |
| Reference uploads / `media_assets` | US-3.3 |
| QA disclosure UI / impersonation checks | US-3.4 |
| Modalidad de producción per Reel / Strategy slot | US-4.x |
| Preferencias editors on `/profile` / Ficha viva PATCH writes | Forbidden (US-2.2 bar) |
| Job enqueue / silent regenerate / providers on save | Forbidden |
| Auth redesign / browser Supabase / public Preferencias Route Handler | Forbidden |
| Operator cross-tenant Preferencias edit | Out of V1 |
| Non-null `generic_avatar_id` catalog UX | Later catalog / US-3.3 |

---

## AC mapping (for validator — do not check USER_STORIES here)

| Acceptance criterion | Satisfied by |
|----------------------|--------------|
| Three modes selectable with clear product copy | Settings UI + allowlist ⊆ three enum tokens; EN/ES CONTEXT labels |
| Mode stored and shown in settings | `neuramark_visual_preferences` + `/settings/preferences` load/save (SPEC allowlist interpretation of singular “mode”) |
| Changing mode does not silently regenerate | Explicit non-behavior + tests |
| No human recording; own-avatar uses uploads later | UX/copy freeze; no recording controls; US-3.3 out |
| Faceless captures style (voice + text + stock/B-roll) | Required `faceless_style` structured keys when `faceless` ∈ set |
| [SEC] enum validate; reject `own_avatar` without consent | Zod set ⊆ enum; `OWN_AVATAR_CONSENT_REQUIRED` + fail-closed helper |

---

## Disputes with SECURITY / SPEC

| Topic | Status |
|-------|--------|
| Allowlist vs singular USER_STORIES `visual_mode` | **No dispute** — SPEC-REVIEW ALIGNED; SECURITY APPROVE; CONTRACT freezes allowlist |
| Empty allowlist | **Frozen here** as allowed (SECURITY asked CONTRACT to pick; empty OK) |
| Settings path `/settings/preferences` | **No dispute** — matches PO lean + SECURITY |
| `visualModeSummary` populate | **Soft same-BUILD** — aligned with SPEC/SECURITY; not a Preferencias settings AC blocker if deferred with TODO |
| Parent DB line still says singular `mode` | Spec-guardian: optional later USER_STORIES hygiene; **not** a CONTRACT conflict |

No SECURITY vetoes triggered. No SPEC amendment required.

---

## CONTRACT checklist (pre-BUILD)

- [x] Surface: `/settings/preferences` gated; Server Action `upsertVisualPreferences`; loader arity 0; soft `hasActiveAvatarConsent`; no public Route Handler with tenant ids; `no-store`; off `isPublicPath`
- [x] Table: `neuramark_visual_preferences`; PK/FK `client_id`; `allowed_modes`; `faceless_style`; nullable `generic_avatar_id`; `rules`; `updated_at`; RLS deny-by-default
- [x] Zod: set ⊆ enum; `.strict()`; strip `rules` / consent* / tenant / privilege; faceless style required when needed; `genericAvatarId` null-only V1
- [x] Consent: fail-closed semantics; `OWN_AVATAR_CONSENT_REQUIRED`; no consent side effect on save
- [x] `rules.must_disclose_not_owner` server-derived only
- [x] Non-goals: no silent regenerate; no US-3.2/3.3/3.4 UI; no Ficha viva Preferencias writes; no per-slot modality
- [x] Optional: `visualModeSummary` allowlist-only shape documented
- [x] IDOR: arity 0 / body-only; `WHERE client_id = $server`; fixture N/A as tenant API
- [x] Fixtures: with/without faceless; reject own_avatar without consent; IDOR smuggle; errors aligned with US-2.2 style
- [x] **Frozen** — 2026-08-29
- [x] **Reviewed by FE:** yes — 2026-08-29

---

## FE signoff prompts

When reviewing, confirm:

1. Route `/settings/preferences` + load `getVisualPreferencesForClient()` / save `upsertVisualPreferences(body)` enough for Preferencias UI? **Yes**
2. Empty allowlist allowed OK? **Yes**
3. `OWN_AVATAR_CONSENT_REQUIRED` + `ownAvatarConsentActive` boolean enough to disable Avatar propio? **Yes** (UI + server; UI not authority)
4. `facelessStyle` three constrained enums enough for voice + text + B-roll? **Yes**
5. Await + success toast (not optimistic-only) OK? **Yes**
6. Cancel = restore last server snapshot OK? **Yes**
7. Soft `visualModeSummary` widen OK (FE typically N/A — agents only)? **Yes / N/A for Preferencias UI**
8. No Preferencias chrome on `/profile` OK? **Yes**

**Signoff:** `Reviewed by FE: yes — 2026-08-29` — FE will implement against this freeze.
