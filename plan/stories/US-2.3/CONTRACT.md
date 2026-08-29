Reviewed by FE: N/A — 2026-08-29 (no FE surface)

**FE notes:** This story has **no Cliente / Operator UI**, no RSC props, and no Server Action the browser may call. FE SIGNOFF is **N/A**. Downstream agent UIs (US-4.x+) consume the helper server-side only and do not import this module into Client Components.

# API Contract — US-2.3 Expose profile to agents (Ficha viva agent DTO)

**Story:** US-2.3  
**Status:** Frozen (FE N/A — 2026-08-29; ready for BE BUILD)  
**Security:** `plan/stories/US-2.3/SECURITY.md` (APPROVE WITH CONDITIONS — binding freeze; do not reopen)  
**Spec review:** `plan/stories/US-2.3/SPEC-REVIEW.md` (ALIGNED)  
**Depends on:** US-2.1 CONTRACT (frozen) — arity-0 Cliente loader + seven-key `fields` · US-2.2 CONTRACT (frozen) — PATCH bumps `version` agents consume · US-1.3 CONTRACT (frozen) — table + create-on-submit  
**Identity seam:** Trusted **server/orchestration** callers only — **no** `requireActive` / session inside this helper  
**Error / empty style:** soft typed result (`exists` / `loadFailed`) — **no** HTTP envelope; **no** throw on missing / pre-onboarding

**This document is CONTRACT ONLY.** Do not implement `getBusinessProfileForAgents`, agent Zod schemas in code, or migrations until BUILD. Zod below is the BUILD sketch for `lib/contracts/profile.ts` (extend) and `lib/profile/get-business-profile-for-agents.ts`.

**Terminology:** **Ficha viva** (ES) / **Living profile** (EN). **Entrevista inicial** (ES) / **Initial interview** (EN). Role: **Cliente** / **Operator** / **System**. **Preferencias de producción visual** · **Modalidad de producción** (future summary). **Consentimiento de avatar** (US-3.x — omit). Technical helper name `getBusinessProfileForAgents` is SPEC-canonical (S3.M3) — keep in code. Do **not** use CONTEXT _Evitar_ terms in product-facing docs.

---

## Overview

Trusted server orchestration (System cycle jobs, agent runners, Operator-gated **server** jobs that already resolved the target tenant) needs a **stable, minimal** Ficha viva projection so Content Strategy, Video Script, Caption, and QA agents (US-4.x+) do not re-parse raw Entrevista sessions or reuse the Cliente UI DTO.

The server helper:

1. Accepts a single `clientId` UUID from **trusted job context** (never browser body/query/headers as authority).
2. Does **not** call `requireActive` / session (System jobs may lack a Cliente session).
3. `SELECT`s the canonical row from `neuramark_business_profiles` where `client_id = $clientId` (parameterized; service-role Node).
4. Zod-validates jsonb `fields` (seven keys 1:1 interview complete schema).
5. Returns a **minimal agent DTO** (`exists: true` + seven `fields` + positive `version` + echo `clientId` + `visualModeSummary: null` + optional `updatedAt`), or soft empty / soft `loadFailed`.
6. Never returns consent internals, raw Entrevista blobs, `source_interview_id`, tokens, or privilege fields.

**Surfaces**

| # | Surface | Kind | New vs reused |
|---|---------|------|---------------|
| 1 | `getBusinessProfileForAgents` | Server-only helper | **New** — only agent/orchestration read path for Ficha viva |
| 2 | Zod agent DTO + types | `lib/contracts/profile.ts` (extend) | **New** schemas / types — distinct from Cliente view types |
| 3 | `getBusinessProfileForClient` | RSC server helper | **Unchanged** — arity 0; Cliente UI only |
| 4 | `updateBusinessProfile` / submit upsert | Server Actions | **Unchanged** (US-2.2 / US-1.3) |

**Forbidden surfaces (BUILD veto):**

- Public Route Handler / HTTP API (`GET`/`POST` `/api/…?clientId=` or any alias).
- Server Action or RSC entry that accepts browser/query/body `clientId` as authority for this read.
- Client Component / `"use client"` import of the agents module.
- Merge / overload / re-export with `getBusinessProfileForClient`.

**Why server helper (not Route Handler / Server Action):** Callers are trusted server jobs, not a browser UI. An HTTP surface would create classic IDOR by `clientId`. Chosen form: **server-only function** with arity-1 UUID.

**Frontend consumers**

| Consumer | Route / module | Contract surface |
|----------|----------------|------------------|
| *(none this story)* | — | FE N/A |
| Content Strategy / Video Script / Caption / QA jobs | US-4.x+ server modules | **MUST** import `getBusinessProfileForAgents` only |
| Ciclo semanal orchestration | Later System jobs | Same helper; server-resolved `clientId` |

**Server-only modules (planned BUILD)**

| Module | Purpose |
|--------|---------|
| `lib/profile/get-business-profile-for-agents.ts` | `import "server-only"`; `getBusinessProfileForAgents(clientId)` |
| `lib/contracts/profile.ts` | Agent DTO Zod + types (extend; do not replace Cliente schemas) |
| `lib/profile/map-business-profile-row.ts` (or private fork/wrap) | Optional shared Zod/row mapping — must not leak Cliente UX shapes incorrectly into agent DTO |
| `lib/profile/get-business-profile-for-client.ts` | **Do not change** arity / identity rules |
| Migration | **None** — verify-only |

---

## Frozen decisions (from SECURITY.md)

Do not reopen.

| # | Topic | Freeze |
|---|-------|--------|
| 1 | **Surface** | Export exactly `getBusinessProfileForAgents(clientId: string)` from `lib/profile/get-business-profile-for-agents.ts` with `import "server-only"`. **No** Route Handler, **no** Server Action, **no** browser entry |
| 2 | **Callers / IDOR** | `clientId` = UUID from **trusted server/job context** only (System cycle, agent runners, Operator-gated server jobs that **already resolved** the target server-side). **Never** browser body, query, headers, Cliente Server Action tenant args, or unchecked LLM-tool JSON as authority |
| 3 | **Helper auth** | **No** `requireActive` / session inside the helper. Do **not** invent query-param “internal tokens.” Tenancy trust = caller architecture + no untrusted HTTP surface |
| 4 | **UUID validation** | Validate `clientId` as UUID before query. Invalid → soft empty / typed validation failure (same soft class as missing — **no throw** that crashes orchestration). **Not** a distinct “forbidden tenant” oracle |
| 5 | **DTO exists** | `{ exists: true, clientId, version, fields, visualModeSummary: null, updatedAt? }` — seven validated fields; **positive** `version` **required**; echo trusted `clientId`; `visualModeSummary` key **present**, value **`null`** until US-3.x |
| 6 | **DTO missing** | `{ exists: false }` — soft typed; **no throw**. Intentionally **same** shape whether row absent / never-existed UUID (no foreign-vs-missing oracle) |
| 7 | **Corrupt / load failure** | `{ exists: false, loadFailed: true }` — distinct soft failure; never invent profile data; log **codes only** |
| 8 | **Omit always** | Consent internals, raw Entrevista session blobs, `source_interview_id`, tokens, `role`, `auth_user_id`, `updated_by`, profile row `id`, Preferencias columns invented here |
| 9 | **Separation** | `getBusinessProfileForClient` remains **arity 0** + `requireActive` + separate module / types. Do not merge, alias, or re-export agents helper from Cliente module (or vice versa). Never client-bundle either profile helper |
| 10 | **Query** | Parameterized `SELECT … WHERE client_id = $clientId` on `neuramark_business_profiles` only; service-role Node; RLS deny-by-default unchanged |
| 11 | **MUST-import** | File header / export comment: Content Strategy, Video Script, Caption, QA (and future orchestration) **MUST** import this helper only — no raw `neuramark_interview_sessions` SELECT, no Cliente DTO reuse for prompts |
| 12 | **Soft “used by agents” AC** | Export + MUST-import comment + unit tests satisfy V1; wiring full LLM jobs is **out of scope** (US-4.x+) |
| 13 | **DB** | **Verify-only.** No migration. No Preferencias / consent columns. No `profile_versions` |
| 14 | **Logging** | Codes / static strings only — **never** full free-text `fields` in production |
| 15 | **Future HTTP** | Any HTTP wrapper is a **new story** and inherits IDOR veto unless it uses server-resolved identity (not body UUID as authority) |
| 16 | **Packages / FE** | No new npm packages. No FE UI this story |

### Strip list (agent DTO — never return)

| Keys / sources | Behavior |
|----------------|----------|
| Consent ledger / Consentimiento internals | **Omit always** — do not SELECT or project |
| Raw `neuramark_interview_sessions` answers / blobs | **Never SELECT** from this helper |
| `source_interview_id` / `sourceInterviewId` | **Omit always** |
| Tokens, `role`, `auth_user_id` / `authUserId` | **Omit always** |
| `updated_by` / `updatedBy` | **Omit always** |
| Profile row `id` | **Omit** from DTO (prefer omit from SELECT→DTO) |
| Preferencias / modalities beyond stub | **Do not invent** — only `visualModeSummary: null` |
| Unknown extra jsonb keys | Zod seven-key `.strict()` on `fields` — corrupt → `loadFailed` |

---

## Server helper — `getBusinessProfileForAgents` (**new**)

**File (BUILD):** `lib/profile/get-business-profile-for-agents.ts` (`import "server-only"`)  
**Consumers (later):** Content Strategy, Video Script, Caption, QA agent jobs; Ciclo semanal orchestration — **not built in this story**.  
**Why server helper (not Route Handler):** Trusted job-context read; avoids public HTTP IDOR. Not UI-coupled → not a Server Action.

**Signature (frozen):**

```ts
/**
 * Minimal Ficha viva projection for trusted server agents / orchestration.
 *
 * Content Strategy, Video Script, Caption, QA (and future orchestration) MUST
 * import this helper only — never raw neuramark_interview_sessions SELECT,
 * never getBusinessProfileForClient / Cliente DTO for prompts.
 *
 * clientId: UUID from trusted server/job context only — never browser
 * body/query/headers as authority. Does NOT call requireActive / session.
 */
export async function getBusinessProfileForAgents(
  clientId: string,
): Promise<BusinessProfileForAgentsResult>;
```

**Auth inside helper:** **None** (`requireActive` forbidden here).

**Input validation (frozen):**

```ts
const agentClientIdSchema = z.string().uuid();
// invalid UUID → return { exists: false } (soft; optional loadFailed: false)
// do NOT throw; do NOT emit FORBIDDEN / foreign-tenant discriminants
```

**Query (frozen):**

```ts
// Parameterized service-role Node only
.from("neuramark_business_profiles")
.select("fields, version, updated_at") // omit id, source_interview_id, updated_by from DTO
.eq("client_id", clientId) // validated UUID
.maybeSingle();
```

**Do not:** accept browser-supplied tenant args; SELECT interview sessions; call `requireActive`; return raw unvalidated jsonb; merge with Cliente helper; expose HTTP.

### Return shape (Zod sketch — BUILD)

```ts
/** BUILD: extend lib/contracts/profile.ts — distinct from Cliente view types */

import { z } from "zod";
import { interviewAnswersCompleteSchema } from "@/lib/contracts/interview";

/** Reuse seven-key complete schema for fields when exists */
export type BusinessProfileFields = z.infer<typeof interviewAnswersCompleteSchema>;

export const businessProfileForAgentsViewSchema = z
  .object({
    exists: z.literal(true),
    /** Echo of trusted arg — server-only DTO; never client-bundled */
    clientId: z.string().uuid(),
    /** Required positive int for agent traceability (US-2.2 bumps) */
    version: z.number().int().positive(),
    fields: interviewAnswersCompleteSchema,
    /**
     * Preferencias / Modalidad de producción summary — stub until US-3.x.
     * Key MUST be present; value MUST be null in this story.
     */
    visualModeSummary: z.null(),
    /** Optional ISO timestamptz freshness */
    updatedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export type BusinessProfileForAgentsView = z.infer<
  typeof businessProfileForAgentsViewSchema
>;

export const businessProfileForAgentsMissingSchema = z
  .object({
    exists: z.literal(false),
  })
  .strict();

export type BusinessProfileForAgentsMissing = z.infer<
  typeof businessProfileForAgentsMissingSchema
>;

/**
 * Soft load / corrupt failure — distinct from bare missing.
 * Do not invent fields; do not add foreign-tenant oracle codes.
 */
export const businessProfileForAgentsLoadFailedSchema = z
  .object({
    exists: z.literal(false),
    loadFailed: z.literal(true),
  })
  .strict();

export type BusinessProfileForAgentsLoadFailed = z.infer<
  typeof businessProfileForAgentsLoadFailedSchema
>;

export type BusinessProfileForAgentsResult =
  | BusinessProfileForAgentsView
  | BusinessProfileForAgentsMissing
  | BusinessProfileForAgentsLoadFailed;
```

**Naming freeze:** Use the `BusinessProfileForAgents*` type names above (or exact synonyms documented in BUILD). Do **not** reuse `BusinessProfileView` / `BusinessProfileForClientResult` as the agents public type — keep Cliente and agent contracts distinct even if a private mapper is shared.

### Outcome matrix

| Case | Result | Caller behavior |
|------|--------|-----------------|
| Valid UUID + row + Zod-valid `fields` + positive `version` | `{ exists: true, clientId, version, fields, visualModeSummary: null, updatedAt? }` | Agents may use as prompt **data** |
| Valid UUID + no row (pre-onboarding / missing) | `{ exists: false }` | Skip / soft-empty; **no throw** |
| Invalid UUID (not UUID format) | `{ exists: false }` (soft validation failure — same missing class; **no** FORBIDDEN oracle) | Skip; log code only |
| Row + Zod-invalid / corrupt `fields` | `{ exists: false, loadFailed: true }` | Skip/alert; never invent fields |
| Select / Supabase config failure | `{ exists: false, loadFailed: true }` | Soft failure; log code only |
| Missing / non-positive `version` on otherwise valid row | `{ exists: false, loadFailed: true }` | Treat as corrupt for agents (version required when exists) |
| Foreign vs never-existed UUID | **Identical** `{ exists: false }` | Intentional — no oracle |

### Distinction from `getBusinessProfileForClient` (hard)

| | `getBusinessProfileForClient` | `getBusinessProfileForAgents` |
|--|-------------------------------|-------------------------------|
| Arity | **0** | **1** (`clientId`) |
| Identity | `requireActive` / `getCurrentUser().id` | Trusted job UUID; **no** session |
| Audience | Cliente UI RSC | Server agents / orchestration |
| Success DTO | `exists` + `fields` + optional `version` / `updatedAt` — **no** `clientId` echo, **no** `visualModeSummary` | `exists` + `clientId` + **required** `version` + `fields` + `visualModeSummary: null` + optional `updatedAt` |
| Module | `get-business-profile-for-client.ts` | `get-business-profile-for-agents.ts` |
| Types | `BusinessProfileForClientResult` | `BusinessProfileForAgentsResult` |

Shared private mapper for Zod seven-key validation is **OK** if BUILD wraps/forks so agent DTO adds `clientId`, required `version`, and `visualModeSummary: null` without leaking Cliente-only UX assumptions.

### Logging

- Log error **codes** only (e.g. Zod issue code / Supabase `error.code` / `invalid_uuid`).
- **Never** log full free-text `fields` bodies in production.

### Caching / revalidation

- No HTTP cache. Helper is per-job / per-call.
- No `revalidatePath` / `revalidateTag` owned by this story (read-only agent path; no FE).

---

## Database (verify-only)

**Migration: no.**

Reuse existing `public.neuramark_business_profiles` (US-1.3 + US-2.2 `updated_by`).

### DDL sketch (existing — do not recreate)

```sql
-- Already shipped (US-1.3 / US-2.2). Verify-only for US-2.3.
CREATE TABLE public.neuramark_business_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.neuramark_clients(id),
  fields jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1
    CONSTRAINT neuramark_business_profiles_version_positive CHECK (version >= 1),
  source_interview_id uuid NULL, -- OMIT from agent DTO always
  updated_by uuid NULL REFERENCES public.neuramark_clients(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
  -- + fields size check, unique indexes on client_id / source_interview_id, updated_at trigger
);

ALTER TABLE public.neuramark_business_profiles ENABLE ROW LEVEL SECURITY;
-- Zero named policies — service-role Node only (unchanged)
```

**Indexes (existing):** `neuramark_business_profiles_client_id_idx`, `neuramark_business_profiles_source_interview_id_idx`, `neuramark_business_profiles_updated_by_idx`.

**This story does not add:** Preferencias columns, consent tables, agent views, `profile_versions`, new enums, new policies.

### Enums / state transitions

No new enums. Agent DTO `visualModeSummary` remains `null` (not an enum) until US-3.x.

Profile row `version` is an integer bumped by US-2.2 PATCH — agents consume **current** value; no history table.

---

## Standard error envelope

**N/A for HTTP** — this story has no Route Handler / Server Action response envelope.

Soft results use the discriminated `BusinessProfileForAgentsResult` above (`exists` / `loadFailed`). Do not invent parallel `ok: false` HTTP envelopes for this helper.

---

## Fixtures (BUILD / unit tests / future agent mocks)

### Happy path — exists

**Call:** `getBusinessProfileForAgents("11111111-1111-4111-8111-111111111111")`

**Response:**

```json
{
  "exists": true,
  "clientId": "11111111-1111-4111-8111-111111111111",
  "version": 2,
  "fields": {
    "services": { "items": ["Residential plumbing", "Drain cleaning"] },
    "zone": { "primary": "Austin TX metro", "notes": "South and central" },
    "tone": { "voice": "Friendly expert", "avoid": ["Slang", "Overpromise"] },
    "offers": { "items": ["Free estimate", "Same-week slots"] },
    "objections": { "items": ["Price vs big chains"] },
    "style": { "notes": "Clean before/after; no gore" },
    "restrictions": { "items": ["No political topics", "No competitor names"] }
  },
  "visualModeSummary": null,
  "updatedAt": "2026-08-29T16:00:00.000Z"
}
```

### Missing / pre-onboarding

**Call:** `getBusinessProfileForAgents("22222222-2222-4222-8222-222222222222")` (no row)

**Response:**

```json
{
  "exists": false
}
```

### Invalid UUID (soft)

**Call:** `getBusinessProfileForAgents("not-a-uuid")`

**Response:**

```json
{
  "exists": false
}
```

### Corrupt fields / loadFailed

**Response:**

```json
{
  "exists": false,
  "loadFailed": true
}
```

### Strip proof (must NOT appear in any success/missing payload)

```txt
source_interview_id, sourceInterviewId, updated_by, updatedBy,
id (profile row), role, auth_user_id, authUserId, tokens,
consent*, interview session answers blob, visual_mode enum inventing modalities
```

---

## Automated tests (BUILD expectations)

| Case | Assert |
|------|--------|
| Happy path | Seven fields + positive `version` + `clientId` echo + `visualModeSummary === null` |
| Missing row | `{ exists: false }` — no throw |
| Invalid UUID | Soft empty — no throw; no FORBIDDEN discriminant |
| Corrupt `fields` | `{ exists: false, loadFailed: true }` |
| Module | File / graph includes `server-only`; not importable from `"use client"` trees |
| Strip / schema | Agent schema `.strict()` rejects over-disclosure keys on success object |
| Separation | `getBusinessProfileForClient.length === 0`; agents helper arity 1; separate modules |
| No HTTP | No Route Handler profile-by-`clientId` introduced |

---

## Out of scope

| Topic | Owner |
|-------|--------|
| FE UI / i18n / Preferencias editors | US-3.x / none |
| Public HTTP / Server Action by `clientId` | **Never** under this helper’s contract |
| Wiring Content Strategy / Script / Caption / QA LLM jobs | US-4.x+ |
| `getBusinessProfileForClient` rebuild / merge | Forbidden |
| Consent / Preferencias persistence | US-3.x |
| `profile_versions` history | SPEC Fuera V1 |
| Auth redesign / browser Supabase / new packages | Out |

---

## AC mapping (for validator — do not check USER_STORIES here)

| USER_STORIES AC | Contract coverage |
|-----------------|-------------------|
| Single server function used by Strategy / Script / Caption / QA | Export `getBusinessProfileForAgents` + MUST-import comment; real call sites US-4.x+ (soft) |
| Contract documented in code types | Zod + `BusinessProfileForAgents*` in `lib/contracts/profile.ts` |
| 404-safe empty for pre-onboarding | `{ exists: false }` — no throw |
| [SEC] server-only + only agent path | `import "server-only"`; no HTTP; MUST-import |
| [SEC] minimal shape excludes consent / interview blobs | Strip list + omit `source_interview_id` |

---

## Signoff checklist

- [x] Export path frozen: `lib/profile/get-business-profile-for-agents.ts`
- [x] Trusted callers; no `requireActive` inside; no HTTP
- [x] DTO: exists / missing / `loadFailed`; `visualModeSummary: null`; omit consent/interview/etc.
- [x] Distinct from `getBusinessProfileForClient`
- [x] Migration: **no**
- [x] **Reviewed by FE:** N/A — 2026-08-29 (no FE surface)

After this freeze, BE BUILD may proceed. Any contract change after freeze requires an update to this file + FE re-mark (or explicit N/A reconfirm).

| Date | Change |
|------|--------|
| 2026-08-29 | CONTRACT authored (nextjs-backend); FE N/A; Frozen for BUILD |
