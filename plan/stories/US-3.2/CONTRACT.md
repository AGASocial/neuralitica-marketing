Reviewed by FE: yes — 2026-08-29 — Consentimiento embeds on existing `/settings/preferences` Client form; grant/revoke Server Actions + loader DTO fit PrimeReact/toast patterns and US-3.1 `ownAvatarConsentActive` gate.

# API Contract — US-3.2 Capture consent for own avatar (Consentimiento de avatar)

**Story:** US-3.2  
**Status:** **Frozen** — 2026-08-29  
**Security:** `plan/stories/US-3.2/SECURITY.md` (APPROVE WITH CONDITIONS — binding freeze; do not reopen)  
**Spec review:** `plan/stories/US-3.2/SPEC-REVIEW.md` (ALIGNED — append-only ledger; active = non-revoked **and** current version; Preferencias continuity; job stubs)  
**Depends on:** US-3.1 CONTRACT (frozen) — Preferencias `/settings/preferences`, soft `hasActiveAvatarConsent`, `OWN_AVATAR_CONSENT_REQUIRED` · US-14.5 — `getCurrentUser()` / `requireActive()` · US-2.2 — Ficha viva PATCH stays consent-blind · US-2.3 — agents DTO omits ledger internals  
**Identity seam:** `lib/auth/get-current-user.ts` / `requireActive()` (US-14.5 — unchanged)  
**Error envelope style:** same class as Preferencias / profile / interview / auth (`ok: true` vs `{ ok: false, error: { code, fields?, messageKey? } }`)

**This document is CONTRACT ONLY.** Do not implement loaders, Server Actions, Zod in code, or migrations until FE signoff. Zod below is a documentation sketch for the future BUILD files (`lib/contracts/avatar-consent.ts`, Consentimiento server modules).

**Terminology:** **Consentimiento de avatar** (ES/EN product entity). **Avatar propio autorizado**. **Preferencias de producción visual**. Role: **Cliente** / **Operator**. Technical tokens (`own_avatar`, `neuramark_avatar_consents`, `consent_version`, `AVATAR_CONSENT_DISCLOSURE_V1`) OK in code/DB only — never primary UI headlines. Do **not** use CONTEXT _Evitar_ terms (esp. “consent ledger” as product label, avatar mode / visual preferences as entity names, Business Profile, admin / staff) in this file’s product-facing strings, fixtures’ UI labels, or i18n headlines.

---

## Overview

An authenticated, activated Cliente grants or revokes likeness authorization for **Avatar propio autorizado** on the Preferencias settings page. The server:

1. Resolves identity via `requireActive("page"|"handler")` / `getCurrentUser().id` only.
2. Loads own Consentimiento status (arity 0) for the Preferencias / Consentimiento UI.
3. **Grants** only via an explicit affirmative Server Action: body `{ affirmed: true, consentVersion }` must echo the server constant; INSERT append-only row; server stamps `consented_at`.
4. **Revokes** only via a dedicated Server Action: UPDATE **`revoked_at` only** on the single active row; never DELETE; never mutate historical consent fields; invoke cancel-queue stub; **do not** silently rewrite Preferencias allowlist.
5. Hardens `hasActiveAvatarConsent` so Preferencias `own_avatar` persist remains fail-closed against the **real** ledger (active = non-revoked **and** `consent_version` = current constant).
6. Exports job-time assert + cancel-queue stubs for US-8.x / US-10.x (unit-tested; no job table writes required here).
7. **Never** grants/revokes as a side effect of Preferencias upsert / Ficha viva PATCH / loaders. **Never** enqueues video/TTS/strategy jobs from grant/revoke.

**Surfaces**

| # | Surface | Kind | New vs reused |
|---|---------|------|---------------|
| 1 | `/settings/preferences` Consentimiento chrome | RSC + Client form embed (disclosure + grant/revoke) | **Extend** US-3.1 Preferencias page — **not** a dedicated `/settings/avatar-consent` route |
| 2 | `getAvatarConsentForClient` | RSC server helper | **New** — arity 0 consent status load |
| 3 | `grantAvatarConsent` | Server Action | **New** — only explicit grant writer |
| 4 | `revokeAvatarConsent` | Server Action | **New** — only revoke writer + cancel stub invoke |
| 5 | `hasActiveAvatarConsent` | Server-only helper (US-3.1) | **Harden** — multi-row + version match (mandatory first BE work) |
| 6 | `assertActiveAvatarConsentForJobs` | Server-only stub helper | **New** — mandatory call site for US-8/US-10 job create |
| 7 | `cancelQueuedOwnAvatarJobs` | Server-only stub | **New** — invoked on revoke; no-op-safe if jobs absent |
| 8 | `upsertVisualPreferences` | Server Action (US-3.1) | **Unchanged behavior** — still rejects `own_avatar` without active consent; **must not** write ledger |
| 9 | `getVisualPreferencesForClient` | RSC helper (US-3.1) | **Continuity** — `ownAvatarConsentActive` now reflects hardened probe |
| 10 | `updateBusinessProfile` | Server Action (US-2.2) | **Unchanged** — consent keys remain rejected |
| 11 | `getBusinessProfileForAgents` | Server-only (US-2.3) | **Unchanged** — omit ledger internals |

No public Route Handler. No GET-by-id / PATCH-by-id consent API. No `media_assets`. No job cancel UI / Operator review UI. No Preferencias allowlist schema reopen.

**Frontend consumers**

| Consumer | Route | Contract surface |
|----------|-------|------------------|
| Consentimiento UI (embedded) | `app/(app)/settings/preferences/page.tsx` (+ Client form) | Load via `getAvatarConsentForClient()` (and/or Preferencias loader’s `ownAvatarConsentActive`); Grant → `grantAvatarConsent(body)`; Revoke → `revokeAvatarConsent()` |
| Avatar propio enablement | Same Preferencias Client form | Hard-disable until `active === true`; refresh after grant so Cliente can then include `own_avatar` in allowlist |
| Preferencias Save | Same Client form | Continues `upsertVisualPreferences` — **never** grants consent |
| Success / error feedback | Client form | On grant/revoke `{ ok: true }` → **await** + toast (EN/ES); show `consentedAt` / version when active |

**Server-only modules (planned BUILD)**

| Module | Purpose |
|--------|---------|
| `lib/visual-preferences/avatar-consent-version.ts` | `import "server-only"`; **`AVATAR_CONSENT_DISCLOSURE_V1`** constant (+ export for Zod echo compare). **Frozen location** for consent_version constant |
| `lib/contracts/avatar-consent.ts` | Zod + types for grant input / results / status DTO (may re-export constant type string for FE echo) |
| `lib/visual-preferences/get-avatar-consent-for-client.ts` | `import "server-only"`; arity-0 status loader |
| `lib/visual-preferences/grant-avatar-consent.ts` (or `…/actions/…`) | `"use server"` `grantAvatarConsent` |
| `lib/visual-preferences/revoke-avatar-consent.ts` | `"use server"` `revokeAvatarConsent` |
| `lib/visual-preferences/has-active-avatar-consent.ts` | **Harden** existing probe (first BE task) |
| `lib/visual-preferences/assert-active-avatar-consent-for-jobs.ts` | Stub assert for US-8/US-10 |
| `lib/visual-preferences/cancel-queued-own-avatar-jobs.ts` | Stub cancel; TODO in-flight Operator flag |
| `app/(app)/settings/preferences/page.tsx` (+ Client form) | Embed Consentimiento chrome |
| `lib/auth/require-user.ts` | Unchanged |
| `lib/supabase/server.ts` | Unchanged |
| Migration | **Yes** — create `neuramark_avatar_consents` |

---

## Frozen decisions (from SECURITY.md + SPEC-REVIEW + PO TASKS)

Do not reopen.

| # | Topic | Freeze |
|---|-------|--------|
| 1 | **UI placement** | Consentimiento **on Preferencias page** `/settings/preferences` — disclosure + grant/revoke beside Avatar propio. **Not** a new dedicated route in V1 |
| 2 | **Table** | **`neuramark_avatar_consents`**: `id` PK, `client_id` FK → `neuramark_clients`, `consented_at`, `consent_version`, `revoked_at`. RLS deny-by-default; service-role Node only |
| 3 | **Append-only** | Grant/re-consent = **INSERT**. Revoke = **UPDATE `revoked_at` only** on active row. **Never DELETE**. Never UPDATE `consented_at` / `consent_version` / `client_id` |
| 4 | **Active semantics** | Active iff row with `revoked_at IS NULL` **and** `consent_version` = current server constant. Version mismatch → inactive (re-consent required). Fail closed on missing table / error / no row |
| 5 | **Probe harden** | `hasActiveAvatarConsent`: filter `revoked_at IS NULL`, order `consented_at` desc, limit 1 / maybeSingle on active subset, **then** version-match current constant. **First BE work** before grant/revoke rely |
| 6 | **`consent_version` constant** | Server-owned string **`AVATAR_CONSENT_DISCLOSURE_V1`** in **`lib/visual-preferences/avatar-consent-version.ts`**. Cliente may **echo** only; cannot invent. Disclosure copy change ⇒ bump constant ⇒ prior grants inactive until re-consent |
| 7 | **Grant Action** | `grantAvatarConsent({ affirmed: true, consentVersion })` — Zod `.strict()`; version must equal constant; server `consented_at`; no tenant id |
| 8 | **Revoke Action** | `revokeAvatarConsent()` arity 0 (or empty `.strict()` body); set `revoked_at` on own active row; invoke `cancelQueuedOwnAvatarJobs`; **no** Preferencias allowlist rewrite |
| 9 | **Preferencias side effect** | `upsertVisualPreferences` **must not** INSERT/UPDATE ledger. Explicit grant only |
| 10 | **Stale allowlist after revoke** | **No silent rewrite.** Stale `own_avatar` in Preferencias may remain until Cliente edits; UI may soft-warn; every eligibility path ANDs live probe |
| 11 | **Partial unique** | Index `(client_id) WHERE revoked_at IS NULL` — at most one active row per Cliente |
| 12 | **Job stubs** | Export `assertActiveAvatarConsentForJobs`; revoke invokes `cancelQueuedOwnAvatarJobs` (idempotent no-op if jobs absent); in-flight Operator flag = **documented TODO** for US-8/US-10 |
| 13 | **Surface / CSRF** | Server Actions only. POST + Next.js origin check. `requireActive("handler")` before write. **No** public Route Handler `/api/…` with tenant ids |
| 14 | **Identity / IDOR** | **No** `client_id` / consent `id` / `as_client_id` as authority. Loader arity **0**; grant body has no tenant keys; revoke arity **0**. All queries `WHERE client_id = user.id` |
| 15 | **No silent regenerate** | Grant/revoke = ledger write + stubs + `revalidatePath` only. No job enqueue / provider / strategy regenerate |
| 16 | **No human recording** | Copy + UX never ask Cliente to record video/audio |
| 17 | **XSS** | Disclosure from i18n as React text / structured markup — **no** `dangerouslySetInnerHTML` |
| 18 | **Out of scope** | US-3.3 uploads; US-3.4 QA UI; Modalidad por slot; full job cancel UI; Ficha viva consent writes; auth redesign; browser Supabase |

### Strip vs reject (grant / revoke bodies)

| Keys | Behavior |
|------|----------|
| `affirmed` (grant) | **Accept** — must be literal `true` |
| `consentVersion` (grant) | **Accept** — must equal `AVATAR_CONSENT_DISCLOSURE_V1`; mismatch → `CONSENT_VERSION_MISMATCH` or `VALIDATION_ERROR` |
| Unknown keys | **Reject** → `VALIDATION_ERROR` (Zod `.strict()`). Never written |
| `client_id`, `clientId`, `id`, `as_client_id`, consent UUID | **Reject** → `FORBIDDEN_FIELDS` / `VALIDATION_ERROR`. Never used in `WHERE` |
| `consented_at`, `consentedAt`, `revoked_at`, `revokedAt` | **Reject** → `FORBIDDEN_FIELDS` / `VALIDATION_ERROR`. Server owns timestamps |
| `role`, `active`, `auth_user_id`, `authUserId` | **Reject** → `FORBIDDEN_FIELDS` |
| Preferencias keys (`allowedModes`, etc.) | **Reject** on grant/revoke bodies — wrong surface |
| Query `?client_id=` / dynamic consent mutate by id | **Forbidden.** No such surface |

**Revoke:** prefer arity **0** (no body). If BUILD accepts `{}`, it must be `.strict()` empty object only.

---

## Route — `/settings/preferences` (**extend** — Consentimiento chrome)

| Rule | Detail |
|------|--------|
| Path | **`/settings/preferences`** (frozen — same as US-3.1) |
| Layout | Embed Consentimiento disclosure + grant/revoke in Preferencias Client form / adjacent section |
| Auth | `requireActive("page")`; off `isPublicPath` |
| Cache | `force-dynamic` / `Cache-Control: no-store` |
| Not on | `/profile` edit chrome; no dedicated `/settings/avatar-consent` in this story |
| Nav | Existing Preferencias nav only |

---

## Consent version constant (**frozen location**)

**File (BUILD):** `lib/visual-preferences/avatar-consent-version.ts` (`import "server-only"`)

```ts
/**
 * Disclosure text version bound to EN/ES i18n keys for Consentimiento de avatar.
 * Bumping this constant after legal copy change forces re-consent (probe treats
 * prior non-revoked rows with old version as inactive).
 */
export const AVATAR_CONSENT_DISCLOSURE_V1 = "AVATAR_CONSENT_DISCLOSURE_V1" as const;

export type AvatarConsentDisclosureVersion =
  typeof AVATAR_CONSENT_DISCLOSURE_V1;

/** Current version used by probe, grant, and loader. */
export const CURRENT_AVATAR_CONSENT_VERSION = AVATAR_CONSENT_DISCLOSURE_V1;
```

**i18n binding (FE BUILD):** disclosure strings live under keys such as `preferences.consent.disclosureV1` (EN + ES). Changing those strings **requires** bumping the constant (process: `AVATAR_CONSENT_DISCLOSURE_V2` + new i18n keys). Do not change V1 copy in place without a bump.

**FE echo:** Client form reads current version from loader DTO `currentConsentVersion` (or a shared export via contracts package that does not pull server-only) and sends it back on grant — server re-compares to constant; UI is not authority.

---

## Server helper — `getAvatarConsentForClient` (**new**)

**File (BUILD):** `lib/visual-preferences/get-avatar-consent-for-client.ts` (`import "server-only"`)  
**Frontend consumer:** `/settings/preferences` RSC / Consentimiento Client form.  
**Why server helper (not Route Handler):** UI-coupled read under `(app)`; identity from session.

**Signature (frozen):**

```ts
/**
 * Load own Consentimiento de avatar status.
 * Arity 0 — identity only via requireActive("page") / getCurrentUser().id.
 */
export async function getAvatarConsentForClient(): Promise<AvatarConsentForClientResult>;
```

**Auth:** `requireActive("page")` inside the helper (or page calls `requireActive` then helper — BUILD must not accept tenant args either way).

### Return shape

```ts
/** BUILD: lib/contracts/avatar-consent.ts */

export const avatarConsentActiveViewSchema = z
  .object({
    active: z.literal(true),
    consentedAt: z.string().datetime({ offset: true }),
    consentVersion: z.string().min(1),
    /** Echo target for grant form — always current server constant */
    currentConsentVersion: z.literal("AVATAR_CONSENT_DISCLOSURE_V1"),
    /** Soft UX: Preferencias may still list own_avatar after revoke until Cliente edits */
    preferenciasMayStillListOwnAvatar: z.boolean().optional(),
  })
  .strict();

export const avatarConsentInactiveViewSchema = z
  .object({
    active: z.literal(false),
    consentedAt: z.null(),
    consentVersion: z.null(),
    currentConsentVersion: z.literal("AVATAR_CONSENT_DISCLOSURE_V1"),
    /** Why inactive — for UX copy only; not authority */
    reason: z
      .enum([
        "none",
        "revoked",
        "version_mismatch",
        "load_failed",
      ])
      .optional(),
  })
  .strict();

export type AvatarConsentForClientResult =
  | z.infer<typeof avatarConsentActiveViewSchema>
  | z.infer<typeof avatarConsentInactiveViewSchema>;
```

**Query:** parameterized SELECT on `neuramark_avatar_consents` for `$server` only — active subset (`revoked_at IS NULL`) ordered by `consented_at` desc, limit 1; then apply version match against `CURRENT_AVATAR_CONSENT_VERSION`. Service-role Node; RLS deny-by-default.

**Do not:** accept tenant args; return full ledger history / other tenants; return `auth_user_id` / `role` / tokens; dump disclosure body text into DTO (UI loads disclosure from i18n).

**Continuity with Preferencias loader:** `getVisualPreferencesForClient().ownAvatarConsentActive` must equal `hasActiveAvatarConsent(user.id)` (hardened). Consentimiento UI may use either the dedicated loader or Preferencias boolean + dedicated status fields — BUILD picks one composition as long as grant/revoke refresh both.

---

## Hardened helper — `hasActiveAvatarConsent` (**harden existing**)

**File (BUILD):** `lib/visual-preferences/has-active-avatar-consent.ts` (`import "server-only"`)  
**Consumers:** `upsertVisualPreferences` (authority); Preferencias / Consentimiento loaders (UX boolean); `assertActiveAvatarConsentForJobs`.  
**Why helper (not Server Action):** read-only probe; Preferencias gate continuity.

**Signature (unchanged):**

```ts
/**
 * Fail-closed Consentimiento de avatar probe.
 * @param clientId — must be server-resolved getCurrentUser().id (or trusted job id later).
 * Never invent consent rows. Never default true.
 */
export async function hasActiveAvatarConsent(
  clientId: string,
): Promise<boolean>;
```

### Semantics (binding — SECURITY; **supersedes** US-3.1 soft “any non-revoked”)

| Case | Return |
|------|--------|
| Invalid / empty `clientId` | **`false`** |
| Supabase not configured | **`false`** |
| Consent table does not exist | **`false`** |
| No row for `clientId` | **`false`** |
| Only revoked rows (`revoked_at` set) | **`false`** |
| Latest non-revoked row but `consent_version` ≠ `CURRENT_AVATAR_CONSENT_VERSION` | **`false`** |
| Latest non-revoked row matches current constant | **`true`** |
| Probe / query / unexpected error / ambiguous dual-active (should be prevented by partial unique) | **`false`** |

### Query shape (mandatory — US-3.1 QA Medium)

```ts
.from("neuramark_avatar_consents")
.select("consent_version, revoked_at, consented_at")
.eq("client_id", clientId)
.is("revoked_at", null)
.order("consented_at", { ascending: false })
.limit(1)
.maybeSingle();
// then: row.consent_version === CURRENT_AVATAR_CONSENT_VERSION
```

**Do not:** grant consent; INSERT/UPDATE consent; fail open; treat Preferencias allowlist as authority; use `.maybeSingle()` on **unfiltered** multi-row history (breaks when history exists).

---

## Server Action — `grantAvatarConsent` (**new**)

**File (BUILD):** `lib/visual-preferences/grant-avatar-consent.ts` — `"use server"`  
**Frontend consumer:** Preferencias Consentimiento Client form — **Grant**.  
**Why Server Action (not Route Handler):** UI-coupled mutation; CSRF via Next.js origin check.

**Signature (frozen):**

```ts
/**
 * Explicit Consentimiento de avatar grant (append-only INSERT).
 * No tenant id arguments — identity only via requireActive("handler") / getCurrentUser().id.
 */
export async function grantAvatarConsent(
  input: GrantAvatarConsentInput,
): Promise<GrantAvatarConsentResult>;
```

**Auth:** `requireActive("handler")` **before** any DB write.  
- Unauthenticated → `{ ok: false, error: { code: "UNAUTHENTICATED" } }`; **no** side effects.  
- Inactive → `{ ok: false, error: { code: "FORBIDDEN" } }`; **no** side effects.

**CSRF:** Next.js Server Action built-in origin check (POST from same origin only). No GET mutate.

### Input

```ts
export const grantAvatarConsentInputSchema = z
  .object({
    affirmed: z.literal(true),
    consentVersion: z.literal("AVATAR_CONSENT_DISCLOSURE_V1"),
  })
  .strict();

export type GrantAvatarConsentInput = z.infer<
  typeof grantAvatarConsentInputSchema
>;
```

### Success / error result

```ts
export const grantAvatarConsentSuccessSchema = z
  .object({
    ok: z.literal(true),
    active: z.literal(true),
    consentedAt: z.string().datetime({ offset: true }),
    consentVersion: z.literal("AVATAR_CONSENT_DISCLOSURE_V1"),
  })
  .strict();

export const grantAvatarConsentErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "FORBIDDEN_FIELDS",
  "CONSENT_VERSION_MISMATCH",
  "AFFIRMATION_REQUIRED",
  "ALREADY_ACTIVE",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "INTERNAL_ERROR",
]);

export const grantAvatarConsentErrorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z
    .object({
      code: grantAvatarConsentErrorCodeSchema,
      fields: z.record(z.string(), z.array(z.string())).optional(),
      messageKey: z.string().optional(),
    })
    .strict(),
});

export type GrantAvatarConsentResult =
  | z.infer<typeof grantAvatarConsentSuccessSchema>
  | z.infer<typeof grantAvatarConsentErrorEnvelopeSchema>;
```

### Server algorithm (frozen)

1. `requireActive("handler")` → resolve `user`. Fail → `UNAUTHENTICATED` / `FORBIDDEN`; no write.
2. If body contains forbidden identity/privilege/timestamp/tenant keys → `FORBIDDEN_FIELDS` or `VALIDATION_ERROR`; no write.
3. Zod-parse as `grantAvatarConsentInputSchema`.  
   - `affirmed` missing/false → `AFFIRMATION_REQUIRED` or `VALIDATION_ERROR`; no write.  
   - `consentVersion` ≠ constant → `CONSENT_VERSION_MISMATCH` (or `VALIDATION_ERROR` via `.literal`); no write.
4. If `hasActiveAvatarConsent(user.id)` already **true** → `ALREADY_ACTIVE` (idempotent no second INSERT) **or** return success with existing row — **freeze:** prefer **`ALREADY_ACTIVE`** with no INSERT (keeps audit clean); FE treats as soft success / refresh.
5. Parameterized **INSERT** (service-role Node only):

```ts
.from("neuramark_avatar_consents")
.insert({
  client_id: user.id, // never from client
  consented_at: /* server now() */,
  consent_version: CURRENT_AVATAR_CONSENT_VERSION,
  revoked_at: null,
})
.select("consented_at, consent_version")
.single();
```

6. On partial-unique violation (concurrent grant) → fail closed `INTERNAL_ERROR` or `ALREADY_ACTIVE`; do not pick arbitrary active row.  
7. On success: `revalidatePath("/settings/preferences")`.  
8. Return `{ ok: true, active: true, consentedAt, consentVersion }`.

### Explicit non-behavior

On success or failure, this action **must not**:

- UPDATE Preferencias allowlist / auto-enable `own_avatar`  
- Call `upsertVisualPreferences`  
- Enqueue jobs / call providers / regenerate strategy/scripts/media  
- DELETE or UPDATE prior consent rows  

**Evidence (BUILD):** automated test asserts Preferencias upsert path never writes ledger; grant path never inserts job/strategy rows.

### Outcome matrix

| Case | Result | FE |
|------|--------|-----|
| Valid affirmed + matching version | `{ ok: true, active: true, … }` | Success toast; enable Avatar propio control; refresh status |
| Missing/false `affirmed` | `AFFIRMATION_REQUIRED` / `VALIDATION_ERROR` | Keep checkbox; no write |
| Version echo mismatch | `CONSENT_VERSION_MISMATCH` | Refresh page / re-load version; no write |
| Already active (current version) | `ALREADY_ACTIVE` | Soft UX — already consented |
| Forbidden tenant/timestamp keys | `FORBIDDEN_FIELDS` | Generic error; no write |
| Unauthenticated / inactive | `UNAUTHENTICATED` / `FORBIDDEN` | Auth gate |
| Foreign `client_id` in body | Reject; still only own INSERT | No foreign-tenant write |

---

## Server Action — `revokeAvatarConsent` (**new**)

**File (BUILD):** `lib/visual-preferences/revoke-avatar-consent.ts` — `"use server"`  
**Frontend consumer:** Preferencias Consentimiento Client form — **Revoke**.  
**Why Server Action:** UI-coupled mutation; CSRF via Next.js origin check.

**Signature (frozen):**

```ts
/**
 * Revoke active Consentimiento de avatar (set revoked_at only).
 * Arity 0 — identity only via requireActive("handler") / getCurrentUser().id.
 */
export async function revokeAvatarConsent(): Promise<RevokeAvatarConsentResult>;
```

**Auth:** `requireActive("handler")` before any DB write. Same UNAUTHENTICATED / FORBIDDEN rules as grant.

### Success / error result

```ts
export const revokeAvatarConsentSuccessSchema = z
  .object({
    ok: z.literal(true),
    active: z.literal(false),
    revokedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const revokeAvatarConsentErrorCodeSchema = z.enum([
  "NOT_ACTIVE",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "INTERNAL_ERROR",
]);

export const revokeAvatarConsentErrorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z
    .object({
      code: revokeAvatarConsentErrorCodeSchema,
      messageKey: z.string().optional(),
    })
    .strict(),
});

export type RevokeAvatarConsentResult =
  | z.infer<typeof revokeAvatarConsentSuccessSchema>
  | z.infer<typeof revokeAvatarConsentErrorEnvelopeSchema>;
```

### Server algorithm (frozen)

1. `requireActive("handler")` → resolve `user`. Fail → no write.
2. Find own active row: `client_id = user.id AND revoked_at IS NULL` (limit 1).  
   - None → `NOT_ACTIVE`; **do not** invent revoke; still may call cancel stub idempotently (optional) — **freeze:** **skip** cancel stub if no active row; return `NOT_ACTIVE`.
3. Parameterized **UPDATE** — **only** `revoked_at = now()` (and rely on no other column changes):

```ts
.from("neuramark_avatar_consents")
.update({ revoked_at: /* server now() */ })
.eq("id", activeRow.id) // or .eq("client_id", user.id).is("revoked_at", null)
.eq("client_id", user.id) // belt-and-suspenders
.is("revoked_at", null)
.select("revoked_at")
.maybeSingle();
```

4. **Must invoke** `await cancelQueuedOwnAvatarJobs(user.id)` after successful revoke (and unit-test invoke).  
5. **Must not** UPDATE `neuramark_visual_preferences` (no silent strip of `own_avatar`).  
6. `revalidatePath("/settings/preferences")`.  
7. Return `{ ok: true, active: false, revokedAt }`.

### Explicit non-behavior

- DELETE consent rows  
- UPDATE `consented_at` / `consent_version` / `client_id`  
- Silent Preferencias allowlist rewrite  
- Job enqueue / provider cancel beyond stub  
- Operator review UI  

---

## Stub — `assertActiveAvatarConsentForJobs` (**new**)

**File (BUILD):** `lib/visual-preferences/assert-active-avatar-consent-for-jobs.ts` (`import "server-only"`)  
**Consumers:** **US-8.x / US-10.x** job create (mandatory call site — document in module JSDoc). This story: unit tests only; **no** job table writes.

**Signature (frozen):**

```ts
/**
 * Fail-closed gate for own-avatar video/job creation (US-8 / US-10).
 * Call before enqueue/submit when modality is own_avatar.
 * Throws or returns error result — never defaults true.
 */
export async function assertActiveAvatarConsentForJobs(
  clientId: string,
): Promise<AssertActiveAvatarConsentForJobsResult>;

export type AssertActiveAvatarConsentForJobsResult =
  | { ok: true }
  | {
      ok: false;
      error: {
        code: "OWN_AVATAR_CONSENT_REQUIRED" | "UNAUTHENTICATED" | "INTERNAL_ERROR";
        messageKey?: string;
      };
    };
```

**Algorithm:** if `!(await hasActiveAvatarConsent(clientId))` → `{ ok: false, error: { code: "OWN_AVATAR_CONSENT_REQUIRED", messageKey: "preferences.errors.ownAvatarConsentRequired" } }`; else `{ ok: true }`. Invalid `clientId` → fail closed (`ok: false`).

**Do not:** invent consent; read Preferencias allowlist as authority; write job tables in this story.

---

## Stub — `cancelQueuedOwnAvatarJobs` (**new**)

**File (BUILD):** `lib/visual-preferences/cancel-queued-own-avatar-jobs.ts` (`import "server-only"`)  
**Consumer:** `revokeAvatarConsent` (mandatory invoke on successful revoke).

**Signature (frozen):**

```ts
/**
 * Cancel queued (not yet submitted) own-avatar jobs for clientId.
 * US-3.2: idempotent no-op when neuramark_video_jobs (or successor) is absent.
 * US-8/US-10: real cancel of status=queued own-avatar rows.
 *
 * TODO (US-8 / US-10): flag in-flight provider jobs for Operator review —
 * do not invent Operator UI in US-3.2.
 */
export async function cancelQueuedOwnAvatarJobs(
  clientId: string,
): Promise<{ ok: true; cancelledCount: number }>;
```

**V1 behavior:** if jobs table missing / not configured → `{ ok: true, cancelledCount: 0 }` (no throw). When table exists later → cancel `queued` own-avatar jobs for `client_id` only (parameterized).

**In-flight Operator flag:** document TODO in file header / JSDoc pointing to US-8/US-10 — **no** Operator chrome in this story.

---

## Preferencias continuity (US-3.1 — binding)

| Rule | Detail |
|------|--------|
| Upsert gate | `own_avatar` ∈ allowlist ⇒ `hasActiveAvatarConsent` must be true → else `OWN_AVATAR_CONSENT_REQUIRED`; **no write** |
| Upsert side effects | **Must not** INSERT/UPDATE `neuramark_avatar_consents` |
| UI disable | Soft UX from `ownAvatarConsentActive` / consent loader — UI is **not** authority |
| After revoke | Probe false immediately; Preferencias allowlist **unchanged** unless Cliente saves; optional soft warning copy that Avatar propio may still appear selected until edited |
| After grant | Cliente may then save Preferencias including `own_avatar` |

---

## FE — Consentimiento UX (binding)

| Rule | Detail |
|------|--------|
| Placement | On `/settings/preferences` — disclosure + affirmative control + Grant; Revoke when `active` |
| Disclosure | EN/ES i18n text nodes for `AVATAR_CONSENT_DISCLOSURE_V1`; show version for audit if useful |
| Affirmation | Checkbox (or equivalent) must be checked before Grant enabled |
| Timestamp | Show `consentedAt` (FE locale format) when active |
| Avatar propio | Remain hard-disabled until `active === true`; refresh after grant |
| Soft warning | After revoke, if Preferencias still lists `own_avatar`, optional warning — do **not** claim allowlist was cleared |
| Loading / errors | Disable controls while in-flight; await grant/revoke; toast on success |
| XSS | No `dangerouslySetInnerHTML` |
| Identity | No `client_id` / consent UUID in URL, hidden fields, or client fetch as identity |
| No recording | Never prompt to record video/audio |
| i18n | `messages/en.json` + `es.json` — **Consentimiento de avatar** / **Avatar propio autorizado**; avoid CONTEXT _Evitar_ |

---

## Database

Logical name in USER_STORIES: `avatar_consents`. Physical: **`neuramark_avatar_consents`**.

### Migration — **YES** (US-3.2 create)

```sql
-- US-3.2: Consentimiento de avatar (append-only ledger)
-- Product copy uses CONTEXT labels; technical columns only below.

CREATE TABLE public.neuramark_avatar_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL
    REFERENCES public.neuramark_clients (id) ON DELETE CASCADE,
  consented_at timestamptz NOT NULL DEFAULT now(),
  consent_version text NOT NULL,
  revoked_at timestamptz NULL,
  CONSTRAINT neuramark_avatar_consents_consent_version_nonempty_chk
    CHECK (char_length(trim(consent_version)) > 0),
  CONSTRAINT neuramark_avatar_consents_revoked_after_consented_chk
    CHECK (revoked_at IS NULL OR revoked_at >= consented_at)
);

-- At most one active (non-revoked) row per Cliente
CREATE UNIQUE INDEX neuramark_avatar_consents_client_id_active_uidx
  ON public.neuramark_avatar_consents (client_id)
  WHERE revoked_at IS NULL;

-- Probe / history support
CREATE INDEX neuramark_avatar_consents_client_id_consented_at_idx
  ON public.neuramark_avatar_consents (client_id, consented_at DESC);

ALTER TABLE public.neuramark_avatar_consents ENABLE ROW LEVEL SECURITY;
-- Zero named policies → deny-by-default for anon/authenticated roles.
-- Access only via service-role Node (Next.js backend).

COMMENT ON TABLE public.neuramark_avatar_consents IS
  'Cliente Consentimiento de avatar append-only ledger; US-3.2. Never DELETE; revoke sets revoked_at only.';
COMMENT ON COLUMN public.neuramark_avatar_consents.consent_version IS
  'Server constant (e.g. AVATAR_CONSENT_DISCLOSURE_V1) matching disclosure text shown at grant.';
COMMENT ON COLUMN public.neuramark_avatar_consents.revoked_at IS
  'NULL = candidate active row; set only on revoke. Historical consented_at/consent_version immutable.';
```

| Rule | Detail |
|------|--------|
| PK | `id` uuid |
| FK | `client_id` → `neuramark_clients(id)` `ON DELETE CASCADE` |
| Append-only app rules | INSERT grant; UPDATE `revoked_at` only; never DELETE |
| Partial unique | `neuramark_avatar_consents_client_id_active_uidx` |
| RLS | Enabled; **zero** named policies; service-role Node only |
| Media / jobs | **Do not** create `media_assets` or full `neuramark_video_jobs` cancel schema here |
| Preferencias / Ficha viva | **No** consent columns on those tables as authority |

Suggested filename (BUILD): `supabase/migrations/YYYYMMDDHHMMSS_neuramark_avatar_consents.sql`.

---

## Enums and state transitions

### Consent row lifecycle

```text
[no active row]
  --grantAvatarConsent-->  [active: revoked_at NULL, version=CURRENT]
  --revokeAvatarConsent--> [revoked: revoked_at set]  (same row; other columns immutable)

[revoked]
  --grantAvatarConsent-->  [new INSERT active row]  (same CURRENT version OK if disclosure unchanged)

[active, version outdated after constant bump]
  --probe--> inactive (version_mismatch) until re-consent INSERT with new constant
```

### Active definition (product + Preferencias + jobs)

```text
active ⇔ ∃ row:
  client_id = $id
  AND revoked_at IS NULL
  AND consent_version = CURRENT_AVATAR_CONSENT_VERSION
```

### Preferencias `own_avatar` eligibility

```text
may_persist_own_avatar ⇔ hasActiveAvatarConsent(user.id) === true
(allowlist membership alone is never sufficient)
```

---

## Caching / revalidation

| Event | Action |
|-------|--------|
| `grantAvatarConsent` success | `revalidatePath("/settings/preferences")` |
| `revokeAvatarConsent` success | `revalidatePath("/settings/preferences")` |
| Page | `force-dynamic` / `Cache-Control: no-store` on `/settings/preferences` |

---

## Fixtures (FE mock)

### 1. Loader — inactive (never consented)

```json
{
  "active": false,
  "consentedAt": null,
  "consentVersion": null,
  "currentConsentVersion": "AVATAR_CONSENT_DISCLOSURE_V1",
  "reason": "none"
}
```

### 2. Grant — request

```json
{
  "affirmed": true,
  "consentVersion": "AVATAR_CONSENT_DISCLOSURE_V1"
}
```

### 3. Grant — success response

```json
{
  "ok": true,
  "active": true,
  "consentedAt": "2026-08-29T22:10:00.000Z",
  "consentVersion": "AVATAR_CONSENT_DISCLOSURE_V1"
}
```

### 4. Loader — active after grant

```json
{
  "active": true,
  "consentedAt": "2026-08-29T22:10:00.000Z",
  "consentVersion": "AVATAR_CONSENT_DISCLOSURE_V1",
  "currentConsentVersion": "AVATAR_CONSENT_DISCLOSURE_V1"
}
```

### 5. Grant — version mismatch

**Request:**

```json
{
  "affirmed": true,
  "consentVersion": "AVATAR_CONSENT_DISCLOSURE_V999"
}
```

**Response:**

```json
{
  "ok": false,
  "error": {
    "code": "CONSENT_VERSION_MISMATCH",
    "messageKey": "preferences.consent.errors.versionMismatch"
  }
}
```

(No INSERT.)

### 6. Grant — affirmation missing

**Request:**

```json
{
  "affirmed": false,
  "consentVersion": "AVATAR_CONSENT_DISCLOSURE_V1"
}
```

**Response:** `AFFIRMATION_REQUIRED` or `VALIDATION_ERROR` — **no** write.

### 7. Revoke — success

**Request:** _(arity 0 — no body)_

**Response:**

```json
{
  "ok": true,
  "active": false,
  "revokedAt": "2026-08-29T22:15:00.000Z"
}
```

(Cancel stub invoked. Preferencias allowlist **unchanged**.)

### 8. Revoke — not active

```json
{
  "ok": false,
  "error": {
    "code": "NOT_ACTIVE",
    "messageKey": "preferences.consent.errors.notActive"
  }
}
```

### 9. Preferencias upsert still rejects without consent

**Preconditions:** after revoke (or never granted); `hasActiveAvatarConsent === false`.

**Request to `upsertVisualPreferences`:**

```json
{
  "allowedModes": ["own_avatar", "generic_avatar"],
  "facelessStyle": null,
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

(No Preferencias write. No consent invent.)

### 10. IDOR — session-bound (**N/A as tenant API**)

There is **no** consent-by-id HTTP surface. Smuggled tenant keys are rejected; grant/revoke always use `client_id = getCurrentUser().id`.

**Request (illustrative — must not write victim row):**

```json
{
  "affirmed": true,
  "consentVersion": "AVATAR_CONSENT_DISCLOSURE_V1",
  "client_id": "00000000-0000-4000-8000-000000000099"
}
```

**Response:** `{ "ok": false, "error": { "code": "FORBIDDEN_FIELDS" } }` **or** `VALIDATION_ERROR` via `.strict()` — either acceptable if **no write** and foreign id never used in `WHERE`.

### 11. Unauthenticated grant/revoke

```json
{
  "ok": false,
  "error": { "code": "UNAUTHENTICATED" }
}
```

### 12. Job assert stub — inactive

```json
{
  "ok": false,
  "error": {
    "code": "OWN_AVATAR_CONSENT_REQUIRED",
    "messageKey": "preferences.errors.ownAvatarConsentRequired"
  }
}
```

### 13. Cancel stub — jobs absent

```json
{
  "ok": true,
  "cancelledCount": 0
}
```

---

## Automated tests (security-relevant — BUILD)

- Harden probe: multi-row history + one active matching version → `true`; only revoked → `false`; version mismatch → `false`; missing table / error → `false`.
- Grant → active; version stored = `AVATAR_CONSENT_DISCLOSURE_V1`; server `consented_at`.
- Grant without `affirmed: true` → rejected; no INSERT.
- Grant with wrong `consentVersion` → rejected; no INSERT.
- Grant with foreign `client_id` → rejected/ignored; only own row.
- Already active → `ALREADY_ACTIVE` (no duplicate active row / partial unique holds).
- Revoke → inactive; Preferencias `own_avatar` upsert rejected; **Preferencias allowlist not auto-stripped**.
- Revoke invokes `cancelQueuedOwnAvatarJobs` (mock).
- Re-consent after revoke → new INSERT; new `consented_at`; same version OK.
- Append-only: no DELETE; revoke does not mutate `consented_at` / `consent_version`.
- Preferencias upsert never writes ledger (non-side-effect).
- `assertActiveAvatarConsentForJobs` fail-closed when inactive.
- Unauthenticated / inactive → rejected; no write.
- No public Route Handler consent mutate.
- XSS regression: no `dangerouslySetInnerHTML` on disclosure UI.
- `/settings/preferences` not on `isPublicPath`; `no-store` retained.
- No job/strategy inserts from grant/revoke success path.

---

## Out of scope (do not implement)

| Topic | Owner |
|-------|--------|
| Reference uploads / `media_assets` | US-3.3 |
| QA disclosure UI / impersonation checks | US-3.4 |
| Full video-job create / cancel / Operator in-flight UI | US-8.x / US-10.x (stubs only here) |
| Modalidad de producción per Reel / Strategy slot | US-4.x |
| Preferencias allowlist schema reopen | Forbidden (US-3.1 CLOSED) |
| Consent editors on `/profile` / Ficha viva PATCH writes | Forbidden (US-2.2 bar) |
| Job enqueue / silent regenerate / providers on grant/revoke | Forbidden |
| Dedicated `/settings/avatar-consent` route | Out for V1 (chrome on Preferencias) |
| Auth redesign / browser Supabase / public consent Route Handler | Forbidden |
| Operator cross-tenant consent edit | Out of V1 |
| Silent Preferencias `own_avatar` strip on revoke | Forbidden (APPROVED no-rewrite) |

---

## AC mapping (for validator — do not check USER_STORIES here)

| Acceptance criterion | Satisfied by |
|----------------------|--------------|
| Own avatar cannot be selected without consent | Hardened probe + Preferencias reject + UI disable; grant/revoke surfaces |
| Consent version string stored for audit | INSERT stores `AVATAR_CONSENT_DISCLOSURE_V1`; loader returns version |
| Revoking blocks new own-avatar generations | Probe false + Preferencias reject + job assert stub |
| [SEC] Append-only | INSERT grant; UPDATE `revoked_at` only; never DELETE; tests |
| [SEC] Disclosure version / re-consent | Constant + version-match active rule; bump ⇒ re-consent |
| [SEC] Job-time re-check | `assertActiveAvatarConsentForJobs` exported + unit-tested |
| [SEC] Explicit grant only | `grantAvatarConsent` only; Preferencias upsert never writes ledger |
| [SEC] Revoke immediate + cancel queued + in-flight flag | Probe immediate; `cancelQueuedOwnAvatarJobs` invoke; Operator TODO documented |

---

## Disputes with SECURITY / SPEC

| Topic | Status |
|-------|--------|
| Active = non-revoked **and** current version | **No dispute** — SPEC ALIGNED; SECURITY hard; frozen here |
| UI on Preferencias page | **No dispute** — PO lean + SECURITY APPROVE; frozen |
| No silent Preferencias rewrite on revoke | **No dispute** — SPEC + SECURITY APPROVE (no veto) |
| Grant body `{ affirmed, consentVersion }` | **No dispute** — SECURITY hard |
| Revoke = UPDATE `revoked_at` only | **No dispute** — AC + SPEC + SECURITY |
| Partial unique active row | **No dispute** — SECURITY required |
| Job / cancel stubs depth | **No dispute** — no-op-safe + invoke tests; full jobs US-8/10 |
| Constant name / file location | **Frozen here** — `AVATAR_CONSENT_DISCLOSURE_V1` in `lib/visual-preferences/avatar-consent-version.ts` |
| Stub name `assertActiveAvatarConsentForJobs` | **Frozen here** (SECURITY example used singular `…ForJob`; plural Jobs matches this freeze — one helper either way) |

No SECURITY vetoes triggered. No SPEC amendment required.

---

## CONTRACT checklist (pre-BUILD)

- [x] Surface: Consentimiento on `/settings/preferences`; Server Actions `grantAvatarConsent` / `revokeAvatarConsent`; loader arity 0; no public Route Handler with tenant ids; `no-store`; off `isPublicPath`
- [x] Table: `neuramark_avatar_consents`; columns; partial unique active; RLS deny-by-default; service-role Node only
- [x] Append-only: INSERT grant; UPDATE `revoked_at` only; never DELETE; never mutate historical fields
- [x] Active probe: multi-row safe + version match current constant; fail closed; harden existing helper
- [x] Grant: `affirmed` + `consentVersion` echo; server timestamp; no tenant id; Zod `.strict()`
- [x] Revoke: `revoked_at` only; invoke cancel stub; no Preferencias silent rewrite; in-flight Operator TODO
- [x] Stubs: `assertActiveAvatarConsentForJobs` + `cancelQueuedOwnAvatarJobs`
- [x] Preferencias continuity: reject `own_avatar` without active consent; upsert never writes ledger
- [x] Constant location: `lib/visual-preferences/avatar-consent-version.ts` → `AVATAR_CONSENT_DISCLOSURE_V1`
- [x] Fixtures + error envelopes; IDOR strip; XSS / CSRF notes
- [x] Non-goals: no US-3.3/3.4/full job UI; no Ficha viva consent writes; no recording prompts
- [x] **Frozen** — 2026-08-29
- [x] **Reviewed by FE:** yes — 2026-08-29

---

## FE signoff prompts

When reviewing, confirm:

1. Consentimiento chrome on `/settings/preferences` (not dedicated route) enough?  
2. Loader `getAvatarConsentForClient()` + Preferencias `ownAvatarConsentActive` continuity OK?  
3. Grant body `{ affirmed: true, consentVersion: "AVATAR_CONSENT_DISCLOSURE_V1" }` enough?  
4. Revoke arity 0 OK?  
5. No silent Preferencias strip on revoke + optional soft warning OK?  
6. Await + toast (not optimistic-only) OK?  
7. Disclosure from i18n text nodes (no HTML inject) OK?  
8. Error codes (`CONSENT_VERSION_MISMATCH`, `AFFIRMATION_REQUIRED`, `ALREADY_ACTIVE`, `NOT_ACTIVE`) enough for UX?

**Signoff:** replace header with `Reviewed by FE: yes — YYYY-MM-DD` when FE accepts this freeze.
