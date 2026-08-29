Reviewed by FE: yes — 2026-08-29 — FE will implement Operator Playbook UI against this freeze (`/operator/playbook` list, create/edit forms, archive confirm, `expectedVersion` concurrency, EN/ES chrome; snake_case payload fields in forms).

# API Contract — US-16.1 Curate evergreen Reel format catalog (Playbook)

**Story:** US-16.1  
**Status:** Frozen — 2026-08-29 (awaiting FE signoff)  
**Security:** `plan/stories/US-16.1/SECURITY.md` (APPROVE WITH CONDITIONS — binding freeze; do not reopen)  
**Spec review:** `plan/stories/US-16.1/SPEC-REVIEW.md` (ALIGNED)  
**Depends on:** US-14.5 CONTRACT (frozen) — `requireOperator()` / `requireActive()` · US-2.3 CONTRACT (frozen) — server-only agent helper pattern · US-3.1 CONTRACT (frozen) — `own_avatar` \| `generic_avatar` \| `faceless` modality tokens  
**Identity seam:** `lib/auth/get-current-user.ts` / `requireOperator()` (US-14.5 — unchanged)  
**Error envelope style:** same class as Preferencias/profile (`ok: true` vs `{ ok: false, error: { code, fields?, messageKey? } }`)

**This document is CONTRACT ONLY.** Do not implement loaders, Server Actions, Zod in code, migrations, or seeds until FE signoff. Zod below is the BUILD sketch for `lib/contracts/playbook.ts`, Playbook server modules, and `lib/playbook/get-playbook-for-agents.ts`.

**Terminology:** **Playbook de formatos** (ES) / **Formato de Reel** · **Operator** · **Cliente** · **Modalidad de producción** (referenced only via `modalidades_recomendadas` — assignment per slot is US-4.x). Technical helper name `getPlaybookForAgents` is canonical. Enums `own_avatar` \| `generic_avatar` \| `faceless` OK in code/DB only — never primary UI headlines. Do **not** use CONTEXT _Evitar_ terms (viral playbook, template library, reel template, admin / staff) in product-facing strings or fixtures’ UI labels.

---

## Overview

An authenticated **Operator** curates a **global evergreen catalog** of **Formatos de Reel** on `/operator/playbook`. The server:

1. Gates every Operator RSC loader with `requireOperator("page")` and every mutation with `requireOperator("handler")` as the **first** await — 401/403, **no side effects** on failure.
2. Persists rows in `neuramark_content_playbooks` (slug column + jsonb `payload`; **no `client_id`**).
3. Validates every write with Zod **`.strict()`** (create vs update schemas; update **excludes `slug`**).
4. Enforces **slug immutability** after create; **rejects duplicate slugs** including archived rows (slug permanently reserved).
5. Bumps integer **`version`** on successful update; rejects stale **`expectedVersion`** (optimistic concurrency).
6. **Archives** only (`active = false`, `archived_at` set) — no hard delete.
7. Exposes **`getPlaybookForAgents()`** as the **sole** read path for downstream agents — server-only, active formatos, **`ejemplo_referencia` stripped**.

**Surfaces**

| # | Surface | Kind | New vs reused |
|---|---------|------|---------------|
| 1 | `/operator/playbook` | RSC list page | **New** — Operator Playbook de formatos |
| 2 | `/operator/playbook/new` | RSC create page + Client form | **New** |
| 3 | `/operator/playbook/[slug]` | RSC edit page + Client form | **New** — slug read-only on edit |
| 4 | `loadPlaybookListForOperator` | RSC server helper | **New** — list loader |
| 5 | `loadPlaybookFormatoForOperator` | RSC server helper | **New** — detail/edit loader |
| 6 | `createPlaybookFormato` | Server Action | **New** |
| 7 | `updatePlaybookFormato` | Server Action | **New** — optimistic `expectedVersion` |
| 8 | `archivePlaybookFormato` | Server Action | **New** |
| 9 | `getPlaybookForAgents` | Server-only helper | **New** — agent/orchestration read path |
| 10 | Zod + types | `lib/contracts/playbook.ts` | **New** |
| 11 | Migration + seed | `neuramark_content_playbooks` | **New** — five V1 formatos |

**Forbidden surfaces (BUILD veto):**

- Public Route Handler (`/api/playbook`, `/api/content-playbooks`, slug GET/POST/PATCH/DELETE).
- HTTP exposure of `getPlaybookForAgents`.
- Client Component import of `get-playbook-for-agents.ts`.
- Cliente read UI/API for Playbook (US-4.1 brief labels only, later).
- LLM calls, video jobs, Trend tables, Strategy/Script jobs.

**Why Server Actions (not Route Handlers):** UI-coupled Operator CRUD under `(app)`; CSRF via Next.js origin check; no public REST catalog API (SECURITY freeze).

**Frontend consumers**

| Consumer | Route | Contract surface |
|----------|-------|------------------|
| Playbook list | `app/(app)/operator/playbook/page.tsx` | `loadPlaybookListForOperator()` |
| Create formato | `app/(app)/operator/playbook/new/page.tsx` (+ Client form) | `createPlaybookFormato(input)` |
| Edit formato | `app/(app)/operator/playbook/[slug]/page.tsx` (+ Client form) | `loadPlaybookFormatoForOperator(slug)`; Save → `updatePlaybookFormato(slug, input)`; Archive → `archivePlaybookFormato(slug, input)` |
| Success / error UX | Client forms | Standard `{ ok: true, … }` / error envelope; toast EN/ES on success |
| Nav discoverability | Operator nav (FE) | Link to `/operator/playbook`; EN/ES chrome only |

**Server-only modules (planned BUILD)**

| Module | Purpose |
|--------|---------|
| `lib/playbook/load-playbook-list-for-operator.ts` | `import "server-only"`; list loader |
| `lib/playbook/load-playbook-formato-for-operator.ts` | `import "server-only"`; detail loader |
| `lib/playbook/create-playbook-formato.ts` | `"use server"` `createPlaybookFormato` |
| `lib/playbook/update-playbook-formato.ts` | `"use server"` `updatePlaybookFormato` |
| `lib/playbook/archive-playbook-formato.ts` | `"use server"` `archivePlaybookFormato` |
| `lib/playbook/get-playbook-for-agents.ts` | `import "server-only"`; agent DTO |
| `lib/contracts/playbook.ts` | Zod + types (Operator + agent variants) |
| `lib/auth/require-user.ts` | Unchanged — `requireOperator()` |
| `lib/supabase/server.ts` | Unchanged — service-role Node |
| Migration | **Yes** — `neuramark_content_playbooks` + seed (five formatos) |

---

## Frozen decisions (from SECURITY.md + SPEC-REVIEW + PO TASKS)

Do not reopen.

| # | Topic | Freeze |
|---|-------|--------|
| 1 | **Operator route** | **`/operator/playbook`** (+ `/new`, `/[slug]`). `requireOperator("page")` on loaders; `force-dynamic` / `Cache-Control: no-store` |
| 2 | **Tenancy** | **Global catalog** — **no `client_id`** column; mutations accept **no** tenant args |
| 3 | **Surface** | Server Actions + RSC loaders only — **no** public CRUD Route Handler; **no** HTTP for `getPlaybookForAgents` |
| 4 | **Payload storage** | Top-level **`slug`** column (UNIQUE, immutable) + jsonb **`payload`** for SPEC content fields. Integer **`version`** on row |
| 5 | **Archive vs delete** | **Archive only** (`active = false`, `archived_at` timestamptz). No DELETE Server Action or app DELETE |
| 6 | **Slug rules** | Create: required, regex `^[a-z0-9]+(?:-[a-z0-9]+)*$`, max 64. Update: **not in schema**; handler rejects if smuggled. Archived slugs **never** reused |
| 7 | **Optimistic version** | Update and archive require **`expectedVersion`** matching current row; stale → `VERSION_CONFLICT`. Success increments `version` by 1 (update only; archive sets `active`/`archived_at`, **does not** bump `version`) |
| 8 | **Write validation** | Zod **`.strict()`** on create/update. Client validation is presentation only |
| 9 | **`rubros`** | Closed token array (see enums). **Empty array = all rubros** (SPEC) |
| 10 | **`modalidades_recomendadas`** | Subset of `{ own_avatar, generic_avatar, faceless }`. **Empty array = no restriction** (any modality allowed at assignment time) |
| 11 | **`editing_hints`** | Optional string array; omit key or `null` when absent. Bounded (see schema) |
| 12 | **`duracion_ideal_seg`** | **Scalar integer seconds** (Playbook shape — **not** Trend’s `{ cold_open, total }` object) |
| 13 | **Catalog content i18n** | Operator UI chrome EN/ES. Seed `titulo` / `explicacion` **Spanish-first monolingual** in V1 |
| 14 | **`ejemplo_referencia`** | Operator read/edit DTO **may include** after gate. **Absent** from agent DTO and any Cliente-facing shape |
| 15 | **Agent helper** | `getPlaybookForAgents()` — no session gate; trusted server callers only; filter `active = true` AND `archived_at IS NULL` |
| 16 | **Logging** | Slug / id / version / error **codes** only — never full jsonb payloads in production |
| 17 | **Out of scope** | US-16.2 Trend; US-4.x+ Strategy/Script jobs; Cliente Playbook UI; per-client overrides; LLM/video |

### Strip vs reject (mutation body)

| Keys | Behavior |
|------|----------|
| SPEC payload fields (create/update) | **Accept** via Zod `.strict()` per schema variant |
| `slug` on create | **Accept** (required) |
| `slug` on update | **Reject** — not in update schema; smuggled slug → `FORBIDDEN_FIELDS` |
| `expectedVersion` on update/archive | **Accept** (required) |
| `active`, `archivedAt`, `archived_at`, `version`, `createdAt`, `updatedAt`, row `id` | **Reject** → `FORBIDDEN_FIELDS` / `.strict()` |
| `client_id`, `clientId`, `role`, `auth_user_id` | **Reject** → `FORBIDDEN_FIELDS` |
| Unknown keys | **Reject** → `VALIDATION_ERROR` (`.strict()`) |

---

## Routes — Operator Playbook (**new**)

| Rule | Detail |
|------|--------|
| List | **`/operator/playbook`** |
| Create | **`/operator/playbook/new`** |
| Edit | **`/operator/playbook/[slug]`** — dynamic segment = immutable slug |
| Auth | `requireOperator("page")` on each RSC loader (or page calls helper that gates first) |
| Cache | `force-dynamic` / `Cache-Control: no-store` |
| Cliente | **No** read path in V1 |
| Rendering | Plain text for Operator-entered catalog fields — **no** `dangerouslySetInnerHTML` |

---

## Shared enums and bounds (BUILD: `lib/contracts/playbook.ts`)

### Slug (create only)

```ts
export const playbookSlugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase kebab-case");
```

### `hook_type` (closed — extend via migration when needed)

```ts
export const playbookHookTypeSchema = z.enum([
  "question",
  "bold_claim",
  "pain_point",
  "curiosity_gap",
  "statistic",
  "before_after_tease",
  "objection_callout",
  "myth_statement",
  "local_hook",
  "quick_tip",
]);
```

| Token | Typical use |
|-------|-------------|
| `quick_tip` | Tip rápido |
| `before_after_tease` | Antes/después |
| `objection_callout` | Objeción |
| `local_hook` | Oferta local |
| `myth_statement` | Mito vs realidad |
| Others | General evergreen hooks |

### `cta_tipo` (closed)

```ts
export const playbookCtaTipoSchema = z.enum([
  "dm",
  "link_in_bio",
  "call",
  "visit",
  "book",
  "comment",
  "save",
  "follow",
  "none",
]);
```

### `modalidades_recomendadas`

Reuse **`visualModalitySchema`** from `lib/contracts/visual-preferences.ts`:

```ts
import { visualModalitySchema } from "@/lib/contracts/visual-preferences";
// own_avatar | generic_avatar | faceless
```

### `rubros` (closed tokens; empty = all)

```ts
export const playbookRubroSchema = z.enum([
  "plumbing",
  "hvac",
  "electrical",
  "cleaning",
  "landscaping",
  "auto_repair",
  "beauty",
  "fitness",
  "restaurant",
  "retail",
  "professional_services",
  "healthcare",
  "real_estate",
  "home_services",
  "other",
]);
```

### Shared string/array bounds

```ts
export const playbookBeatSchema = z.string().trim().min(1).max(200);
export const playbookHintSchema = z.string().trim().min(1).max(500);
export const playbookEditingHintSchema = z.string().trim().min(1).max(200);
export const playbookTituloSchema = z.string().trim().min(1).max(120);
export const playbookExplicacionSchema = z.string().trim().min(1).max(2000);
export const playbookEjemploReferenciaSchema = z.string().trim().min(1).max(2000);
export const playbookDuracionIdealSegSchema = z.number().int().min(5).max(90);
```

### Payload core (stored in jsonb — snake_case keys in DB)

```ts
/** Fields stored inside neuramark_content_playbooks.payload (excluding slug) */
export const playbookPayloadCoreSchema = z
  .object({
    titulo: playbookTituloSchema,
    explicacion: playbookExplicacionSchema,
    estructura: z.array(playbookBeatSchema).min(1).max(12),
    hook_type: playbookHookTypeSchema,
    duracion_ideal_seg: playbookDuracionIdealSegSchema,
    modalidades_recomendadas: z
      .array(visualModalitySchema)
      .max(3)
      .superRefine((arr, ctx) => {
        if (new Set(arr).size !== arr.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Duplicate modalities are not allowed",
            path: ["modalidades_recomendadas"],
          });
        }
      }),
    rubros: z.array(playbookRubroSchema).max(15),
    guion_hints: z.array(playbookHintSchema).min(1).max(20),
    editing_hints: z.array(playbookEditingHintSchema).max(15).optional(),
    cta_tipo: playbookCtaTipoSchema,
    /** Operator-only — stored in payload; stripped from agent DTO */
    ejemplo_referencia: playbookEjemploReferenciaSchema.optional(),
  })
  .strict();
```

**Semantics:**

- `rubros: []` → applies to **all** rubros (Strategy filter is no-op).
- `modalidades_recomendadas: []` → **no restriction** (any modality may be assigned per slot in US-4.x).
- `editing_hints` omitted or undefined → no editing technique hints.

---

## Database — `neuramark_content_playbooks` (**new**)

**Migration:** create table + RLS deny-by-default + seed five formatos.

### DDL sketch

```sql
CREATE TABLE public.neuramark_content_playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  version integer NOT NULL DEFAULT 1
    CONSTRAINT neuramark_content_playbooks_version_positive CHECK (version >= 1),
  payload jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  archived_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT neuramark_content_playbooks_slug_unique UNIQUE (slug),
  CONSTRAINT neuramark_content_playbooks_slug_format_chk
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT neuramark_content_playbooks_payload_size_chk
    CHECK (pg_column_size(payload) <= 65536),
  CONSTRAINT neuramark_content_playbooks_archive_consistency_chk
    CHECK (
      (active = true AND archived_at IS NULL)
      OR (active = false AND archived_at IS NOT NULL)
    )
);

CREATE INDEX neuramark_content_playbooks_active_idx
  ON public.neuramark_content_playbooks (active)
  WHERE archived_at IS NULL;

CREATE TRIGGER neuramark_content_playbooks_set_updated_at
  BEFORE UPDATE ON public.neuramark_content_playbooks
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_set_updated_at();

ALTER TABLE public.neuramark_content_playbooks ENABLE ROW LEVEL SECURITY;
-- Zero named policies → deny-by-default for anon/authenticated roles.
-- Access only via service-role Node (Next.js backend).
```

**No `client_id`.** No hard DELETE in app code.

### Row state transitions

| From | Action | To | Fields changed |
|------|--------|-----|----------------|
| *(new)* | `createPlaybookFormato` | active | `slug`, `payload`, `version = 1`, `active = true`, `archived_at = NULL` |
| active | `updatePlaybookFormato` (version match) | active | `payload` replaced; `version += 1`; `updated_at` |
| active | `updatePlaybookFormato` (stale version) | active | **No change** — `VERSION_CONFLICT` |
| active | `archivePlaybookFormato` | archived | `active = false`, `archived_at = now()`; **`version` unchanged** |
| archived | `updatePlaybookFormato` | archived | **Rejected** — `ALREADY_ARCHIVED` (or `NOT_FOUND` if CONTRACT BUILD maps archived edits to forbidden — freeze: **`ALREADY_ARCHIVED`**) |
| archived | `archivePlaybookFormato` | archived | **Idempotent success** `{ ok: true, alreadyArchived: true }` |
| any | hard DELETE | — | **Forbidden** in V1 |

### Seed slugs (frozen — migration)

| Slug | Seed `hook_type` | Seed `cta_tipo` |
|------|------------------|-----------------|
| `tip-rapido` | `quick_tip` | `save` |
| `antes-despues` | `before_after_tease` | `dm` |
| `objecion` | `objection_callout` | `comment` |
| `oferta-local` | `local_hook` | `visit` |
| `mito-vs-realidad` | `myth_statement` | `follow` |

Seed rows: `active = true`, `version = 1`, `archived_at = NULL`. Minimal valid Spanish `titulo` / `explicacion`, ≥1 beat, ≥1 `guion_hints`, empty `rubros`, empty `modalidades_recomendadas`. No `ejemplo_referencia` required in seed.

---

## Server helper — `loadPlaybookListForOperator` (**new**)

**File (BUILD):** `lib/playbook/load-playbook-list-for-operator.ts` (`import "server-only"`)  
**Frontend consumer:** `/operator/playbook` RSC.

**Signature (frozen):**

```ts
export async function loadPlaybookListForOperator(): Promise<PlaybookListForOperatorResult>;
```

**Auth:** `requireOperator("page")` first.

### Return shape

```ts
export const playbookListItemSchema = z
  .object({
    slug: playbookSlugSchema,
    titulo: playbookTituloSchema,
    active: z.boolean(),
    archivedAt: z.string().datetime({ offset: true }).nullable(),
    version: z.number().int().positive(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const playbookListForOperatorSuccessSchema = z
  .object({
    ok: z.literal(true),
    formatos: z.array(playbookListItemSchema),
  })
  .strict();

export const playbookListForOperatorLoadFailedSchema = z
  .object({
    ok: z.literal(false),
    loadFailed: z.literal(true),
  })
  .strict();

export type PlaybookListForOperatorResult =
  | z.infer<typeof playbookListForOperatorSuccessSchema>
  | z.infer<typeof playbookListForOperatorLoadFailedSchema>;
```

**Query:** `SELECT slug, payload->>'titulo' AS titulo, active, archived_at, version, updated_at FROM neuramark_content_playbooks ORDER BY active DESC, slug ASC` (exact ORDER BY is BUILD detail; archived visible for Operator history).

**Do not:** include `ejemplo_referencia` in list rows; expose agent DTO; accept tenant args.

---

## Server helper — `loadPlaybookFormatoForOperator` (**new**)

**File (BUILD):** `lib/playbook/load-playbook-formato-for-operator.ts` (`import "server-only"`)  
**Frontend consumer:** `/operator/playbook/[slug]` RSC.

**Signature (frozen):**

```ts
export async function loadPlaybookFormatoForOperator(
  slug: string,
): Promise<PlaybookFormatoForOperatorResult>;
```

**Auth:** `requireOperator("page")` first. Validate `slug` with `playbookSlugSchema` before query.

### Return shape

```ts
export const playbookFormatoOperatorViewSchema = z
  .object({
    slug: playbookSlugSchema,
    version: z.number().int().positive(),
    active: z.boolean(),
    archivedAt: z.string().datetime({ offset: true }).nullable(),
    updatedAt: z.string().datetime({ offset: true }),
    payload: playbookPayloadCoreSchema,
  })
  .strict();

export const playbookFormatoForOperatorFoundSchema = z
  .object({
    ok: z.literal(true),
    formato: playbookFormatoOperatorViewSchema,
  })
  .strict();

export const playbookFormatoForOperatorNotFoundSchema = z
  .object({
    ok: z.literal(false),
    error: z.object({
      code: z.literal("NOT_FOUND"),
      messageKey: z.literal("playbook.errors.notFound"),
    }),
  })
  .strict();

export type PlaybookFormatoForOperatorResult =
  | z.infer<typeof playbookFormatoForOperatorFoundSchema>
  | z.infer<typeof playbookFormatoForOperatorNotFoundSchema>;
```

**Operator edit form may display `payload.ejemplo_referencia`.** Never cache publicly.

---

## Server Action — `createPlaybookFormato` (**new**)

**File (BUILD):** `lib/playbook/create-playbook-formato.ts` — `"use server"`  
**Frontend consumer:** `/operator/playbook/new` — **Create**.

**Signature (frozen):**

```ts
export async function createPlaybookFormato(
  input: CreatePlaybookFormatoInput,
): Promise<CreatePlaybookFormatoResult>;
```

**Auth:** `requireOperator("handler")` **before** validation or DB I/O.

### Input

```ts
export const createPlaybookFormatoInputSchema = z
  .object({
    slug: playbookSlugSchema,
    payload: playbookPayloadCoreSchema,
  })
  .strict();

export type CreatePlaybookFormatoInput = z.infer<
  typeof createPlaybookFormatoInputSchema
>;
```

### Success

```ts
export const createPlaybookFormatoSuccessSchema = z
  .object({
    ok: z.literal(true),
    slug: playbookSlugSchema,
    version: z.literal(1),
  })
  .strict();
```

### Errors

| Condition | `error.code` | Side effects |
|-----------|--------------|--------------|
| Unauthenticated | `UNAUTHENTICATED` | None |
| Non-operator / inactive | `FORBIDDEN` | None |
| Zod fail | `VALIDATION_ERROR` + `fields` | None |
| Duplicate slug (including archived) | `DUPLICATE_SLUG` | None |

**Post-success:** `revalidatePath("/operator/playbook")`.

---

## Server Action — `updatePlaybookFormato` (**new**)

**File (BUILD):** `lib/playbook/update-playbook-formato.ts` — `"use server"`  
**Frontend consumer:** `/operator/playbook/[slug]` — **Save**.

**Signature (frozen):**

```ts
export async function updatePlaybookFormato(
  slug: string,
  input: UpdatePlaybookFormatoInput,
): Promise<UpdatePlaybookFormatoResult>;
```

**Auth:** `requireOperator("handler")` first. Validate route `slug` with `playbookSlugSchema`.

### Input

```ts
/** Full payload replace — slug immutable (not in body) */
export const updatePlaybookFormatoInputSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    payload: playbookPayloadCoreSchema,
  })
  .strict();

export type UpdatePlaybookFormatoInput = z.infer<
  typeof updatePlaybookFormatoInputSchema
>;
```

### Success

```ts
export const updatePlaybookFormatoSuccessSchema = z
  .object({
    ok: z.literal(true),
    slug: playbookSlugSchema,
    version: z.number().int().positive(),
  })
  .strict();
```

### Optimistic concurrency (frozen)

```sql
UPDATE neuramark_content_playbooks
SET payload = $payload, version = version + 1, updated_at = now()
WHERE slug = $slug
  AND version = $expectedVersion
  AND active = true
  AND archived_at IS NULL
RETURNING version;
```

| Condition | `error.code` | Side effects |
|-----------|--------------|--------------|
| Row not found | `NOT_FOUND` | None |
| Archived row | `ALREADY_ARCHIVED` | None |
| `expectedVersion` mismatch | `VERSION_CONFLICT` | None |
| Zod fail | `VALIDATION_ERROR` | None |
| Slug in body (if smuggled via wrapper) | `FORBIDDEN_FIELDS` | None |

**Post-success:** `revalidatePath("/operator/playbook")` and `revalidatePath(\`/operator/playbook/${slug}\`)`.

---

## Server Action — `archivePlaybookFormato` (**new**)

**File (BUILD):** `lib/playbook/archive-playbook-formato.ts` — `"use server"`  
**Frontend consumer:** `/operator/playbook/[slug]` — **Archive** (confirm in FE).

**Signature (frozen):**

```ts
export async function archivePlaybookFormato(
  slug: string,
  input: ArchivePlaybookFormatoInput,
): Promise<ArchivePlaybookFormatoResult>;
```

**Auth:** `requireOperator("handler")` first.

### Input

```ts
export const archivePlaybookFormatoInputSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
  })
  .strict();
```

### Success

```ts
export const archivePlaybookFormatoSuccessSchema = z
  .object({
    ok: z.literal(true),
    slug: playbookSlugSchema,
    alreadyArchived: z.boolean().optional(),
  })
  .strict();
```

**Behavior:**

- Active row + matching `expectedVersion` → set `active = false`, `archived_at = now()`; **`version` unchanged**.
- Already archived → `{ ok: true, alreadyArchived: true }` (idempotent; **no** version check required if already archived — BUILD: short-circuit before version gate).
- Active row + stale version → `VERSION_CONFLICT`.

**Post-success:** same `revalidatePath` targets as update.

---

## Server helper — `getPlaybookForAgents` (**new**)

**File (BUILD):** `lib/playbook/get-playbook-for-agents.ts` (`import "server-only"`)  
**Consumers (later):** Content Strategy (US-4.1), Video Script (US-5.1), Media Assembly (US-9.x), Trend slug validation (US-16.2) — **not built in this story**.  
**Why server helper (not Route Handler):** Trusted server orchestration read; no browser/HTTP surface.

**Signature (frozen):**

```ts
/**
 * Global Playbook de formatos projection for trusted server agents.
 *
 * Content Strategy, Video Script, Media Assembly, and Trend validation
 * (US-16.2+) MUST import this helper only — never direct
 * neuramark_content_playbooks SELECT from agent modules.
 *
 * No session gate — callers are trusted server jobs only.
 * Active formatos only; ejemplo_referencia stripped.
 */
export async function getPlaybookForAgents(): Promise<PlaybookForAgentsResult>;
```

**Auth inside helper:** **None** (mirror US-2.3 trusted-caller pattern).

**Query (frozen filter):**

```sql
SELECT slug, payload
FROM neuramark_content_playbooks
WHERE active = true AND archived_at IS NULL
ORDER BY slug ASC;
```

### Agent DTO schema (strip `ejemplo_referencia`)

```ts
export const playbookFormatoAgentDtoSchema = z
  .object({
    slug: playbookSlugSchema,
    titulo: playbookTituloSchema,
    explicacion: playbookExplicacionSchema,
    estructura: z.array(playbookBeatSchema).min(1).max(12),
    hookType: playbookHookTypeSchema,
    duracionIdealSeg: playbookDuracionIdealSegSchema,
    modalidadesRecomendadas: z.array(visualModalitySchema).max(3),
    rubros: z.array(playbookRubroSchema).max(15),
    guionHints: z.array(playbookHintSchema).min(1).max(20),
    editingHints: z.array(playbookEditingHintSchema).max(15).optional(),
    ctaTipo: playbookCtaTipoSchema,
  })
  .strict();

export const playbookForAgentsSuccessSchema = z
  .object({
    formats: z.array(playbookFormatoAgentDtoSchema),
  })
  .strict();

export const playbookForAgentsLoadFailedSchema = z
  .object({
    formats: z.tuple([]).or(z.array(playbookFormatoAgentDtoSchema).length(0)),
    loadFailed: z.literal(true),
  })
  .strict();

export type PlaybookForAgentsResult =
  | z.infer<typeof playbookForAgentsSuccessSchema>
  | z.infer<typeof playbookForAgentsLoadFailedSchema>;
```

**Mapping:** jsonb snake_case → agent DTO camelCase. **Drop** `ejemplo_referencia` at map time (never SELECT into agent object). Rows failing Zod → skip row; log code only; if **all** rows corrupt or DB error → `{ formats: [], loadFailed: true }`.

### Strip list (agent DTO — key must be absent)

```txt
ejemplo_referencia, ejemploReferencia,
version, active, archivedAt, archived_at,
createdAt, created_at, updatedAt, updated_at,
id, client_id, clientId
```

---

## Standard error envelope

Handler failures reuse US-14.5 / Preferencias pattern:

```ts
export const playbookErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "DUPLICATE_SLUG",
  "VERSION_CONFLICT",
  "ALREADY_ARCHIVED",
  "FORBIDDEN_FIELDS",
  "INTERNAL_ERROR",
]);

export type PlaybookMutationError = {
  ok: false;
  error: {
    code: z.infer<typeof playbookErrorCodeSchema>;
    messageKey?: string;
    fields?: Record<string, string[]>;
  };
};
```

| Code | `messageKey` (i18n) | When |
|------|---------------------|------|
| `UNAUTHENTICATED` | `auth.errors.unauthenticated` | No session (handler) |
| `FORBIDDEN` | `auth.errors.forbidden` | Inactive or non-operator |
| `VALIDATION_ERROR` | `playbook.errors.validation` | Zod failure |
| `NOT_FOUND` | `playbook.errors.notFound` | Unknown slug |
| `DUPLICATE_SLUG` | `playbook.errors.duplicateSlug` | Create slug collision |
| `VERSION_CONFLICT` | `playbook.errors.versionConflict` | Stale `expectedVersion` |
| `ALREADY_ARCHIVED` | `playbook.errors.alreadyArchived` | Update on archived row |
| `FORBIDDEN_FIELDS` | `playbook.errors.forbiddenFields` | Privilege / slug smuggle |
| `INTERNAL_ERROR` | `playbook.errors.internal` | Unexpected DB failure (no payload leak) |

Page loaders use `requireOperator("page")` redirects — not this JSON envelope.

---

## Fixtures (BUILD / FE mocks / tests)

### List loader — happy

**Call:** `loadPlaybookListForOperator()` (operator session)

```json
{
  "ok": true,
  "formatos": [
    {
      "slug": "tip-rapido",
      "titulo": "Tip rápido",
      "active": true,
      "archivedAt": null,
      "version": 1,
      "updatedAt": "2026-08-29T18:00:00.000Z"
    },
    {
      "slug": "antes-despues",
      "titulo": "Antes y después",
      "active": true,
      "archivedAt": null,
      "version": 1,
      "updatedAt": "2026-08-29T18:00:00.000Z"
    }
  ]
}
```

### Detail loader — happy (Operator may see `ejemplo_referencia`)

**Call:** `loadPlaybookFormatoForOperator("tip-rapido")`

```json
{
  "ok": true,
  "formato": {
    "slug": "tip-rapido",
    "version": 1,
    "active": true,
    "archivedAt": null,
    "updatedAt": "2026-08-29T18:00:00.000Z",
    "payload": {
      "titulo": "Tip rápido",
      "explicacion": "Un consejo accionable en menos de 30 segundos.",
      "estructura": ["Hook", "Tip", "CTA"],
      "hook_type": "quick_tip",
      "duracion_ideal_seg": 25,
      "modalidades_recomendadas": [],
      "rubros": [],
      "guion_hints": ["Un solo tip; sin relleno."],
      "cta_tipo": "save",
      "ejemplo_referencia": "https://example.internal/ref/tip-rapido"
    }
  }
}
```

### Create — request / success

**Request:**

```json
{
  "slug": "checklist-express",
  "payload": {
    "titulo": "Checklist express",
    "explicacion": "Lista corta de pasos verificables.",
    "estructura": ["Hook", "Paso 1-3", "CTA"],
    "hook_type": "question",
    "duracion_ideal_seg": 30,
    "modalidades_recomendadas": ["faceless"],
    "rubros": ["home_services"],
    "guion_hints": ["Máximo tres ítems en pantalla."],
    "cta_tipo": "comment"
  }
}
```

**Response:**

```json
{
  "ok": true,
  "slug": "checklist-express",
  "version": 1
}
```

### Update — success

**Request:** `updatePlaybookFormato("tip-rapido", { … })`

```json
{
  "expectedVersion": 1,
  "payload": {
    "titulo": "Tip rápido (actualizado)",
    "explicacion": "Un consejo accionable en menos de 30 segundos.",
    "estructura": ["Hook", "Tip", "CTA"],
    "hook_type": "quick_tip",
    "duracion_ideal_seg": 28,
    "modalidades_recomendadas": [],
    "rubros": [],
    "guion_hints": ["Un solo tip; sin relleno.", "Mostrar resultado en 3s."],
    "cta_tipo": "save"
  }
}
```

**Response:**

```json
{
  "ok": true,
  "slug": "tip-rapido",
  "version": 2
}
```

### Update — version conflict

**Request:** `expectedVersion: 1` when row is already `version: 2`

```json
{
  "ok": false,
  "error": {
    "code": "VERSION_CONFLICT",
    "messageKey": "playbook.errors.versionConflict"
  }
}
```

### Create — duplicate slug

```json
{
  "ok": false,
  "error": {
    "code": "DUPLICATE_SLUG",
    "messageKey": "playbook.errors.duplicateSlug"
  }
}
```

### Archive — success

**Request:** `archivePlaybookFormato("tip-rapido", { "expectedVersion": 2 })`

```json
{
  "ok": true,
  "slug": "tip-rapido"
}
```

### Non-operator mutation

```json
{
  "ok": false,
  "error": {
    "code": "FORBIDDEN",
    "messageKey": "auth.errors.forbidden"
  }
}
```

### Validation — extra keys rejected

**Request:** create body includes `"active": true`

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "messageKey": "playbook.errors.validation",
    "fields": {
      "": ["Unrecognized key(s) in object: 'active'"]
    }
  }
}
```

### Agent helper — happy

**Call:** `getPlaybookForAgents()` (server module only)

```json
{
  "formats": [
    {
      "slug": "tip-rapido",
      "titulo": "Tip rápido",
      "explicacion": "Un consejo accionable en menos de 30 segundos.",
      "estructura": ["Hook", "Tip", "CTA"],
      "hookType": "quick_tip",
      "duracionIdealSeg": 25,
      "modalidadesRecomendadas": [],
      "rubros": [],
      "guionHints": ["Un solo tip; sin relleno."],
      "ctaTipo": "save"
    }
  ]
}
```

### Agent helper — archived formato excluded

After archiving `tip-rapido`, `getPlaybookForAgents()` must **not** include that slug.

### Agent strip proof

Success agent objects must **not** contain:

```txt
ejemplo_referencia, ejemploReferencia, version, active, archivedAt, id
```

---

## Automated tests (BUILD expectations)

| Case | Assert |
|------|--------|
| Operator CRUD happy path | Create → list → get → update (version bump) → archive |
| Duplicate slug | `DUPLICATE_SLUG`; no row inserted |
| Archived slug reuse | Create with archived slug → `DUPLICATE_SLUG` |
| Slug immutability | Update cannot change slug; slug in body rejected |
| Version conflict | Stale `expectedVersion` → `VERSION_CONFLICT`; row unchanged |
| Archive exclusion | Archived slug absent from `getPlaybookForAgents()` |
| Agent DTO strip | `ejemplo_referencia` absent; `.strict()` agent schema passes |
| Non-operator | Mutation → `FORBIDDEN`; no DB change |
| Non-operator page | Loader gate → 403 / redirect per US-14.5 |
| `.strict()` writes | Extra keys → `VALIDATION_ERROR` |
| Module boundary | `get-playbook-for-agents.ts` has `server-only`; not in client graph |
| No HTTP | No `/api/playbook*` Route Handler |

---

## Out of scope

| Topic | Owner |
|-------|--------|
| Trend snapshots / `getTrendSnapshotForWeek` | US-16.2 |
| Strategy / Script / Caption LLM jobs | US-4.x+ |
| Cliente Playbook UI / brief labels | US-4.1 |
| Per-client Playbook overrides | Future story |
| Public REST catalog API | **Never** under this contract |
| LLM / video / provider spend | Out |

---

## AC mapping (for validator — do not check USER_STORIES here)

| USER_STORIES AC | Contract coverage |
|-----------------|-------------------|
| Operator list/create/edit/archive | Routes + loaders + four Server Actions |
| SPEC payload fields | `playbookPayloadCoreSchema` + seed |
| Five seed formatos | Frozen slugs + migration |
| `getPlaybookForAgents()` active-only, stripped | Agent helper + filter + strip list |
| Slug immutable; duplicate rejected | Create/update schemas + errors |
| EN/ES copy | FE i18n keys (`playbook.*`); catalog ES-first documented |
| Operator-only 403 | `requireOperator` on all surfaces |
| [SEC] Zod on write | `.strict()` create/update |
| [SEC] server-only agent path | `import "server-only"` + MUST-import comment |
| [SEC] no Operator-only fields in agent DTO | Strip list + agent schema |
| [SEC] no LLM/video/client mutations | Out of scope table |

---

## Signoff checklist

- [x] Operator routes frozen: `/operator/playbook`, `/new`, `/[slug]`
- [x] Server Action names frozen; each mutation starts with `requireOperator("handler")`
- [x] RSC loaders frozen; `requireOperator("page")`
- [x] **No** public CRUD Route Handler
- [x] Table `neuramark_content_playbooks`: columns, RLS, no `client_id`
- [x] Zod create/update `.strict()`; closed enums; update excludes `slug`
- [x] Slug immutability + no archived slug reuse
- [x] Archive semantics; no DELETE
- [x] Optimistic `expectedVersion` + `VERSION_CONFLICT`
- [x] `getPlaybookForAgents()` path, `{ formats: [...] }`, active filter, strip list
- [x] Operator read DTO vs agent DTO distinction
- [x] Seed slugs + minimal payload frozen
- [x] `revalidatePath` targets listed
- [x] EN/ES Operator chrome; plain-text catalog fields
- [x] **Reviewed by FE:** yes — 2026-08-29

After FE signoff, BUILD may proceed. Any contract change after freeze requires an update to this file + FE re-signoff.

| Date | Change |
|------|--------|
| 2026-08-29 | CONTRACT authored (nextjs-backend + content-agents-engineer); Frozen pending FE |
