Reviewed by FE: yes — 2026-08-29 — FE will implement Operator Trend UI against this freeze (`/operator/trends` week list + publish flow, `/operator/trends/[weekStart]` entry list/editor, táctica form mirroring Playbook patterns with `duracion_ideal_seg` object, `prioridad_semana`, `formatos_playbook_compatibles[]` multi-select from filtered active Playbook slugs, deactivate confirm, snake_case entry payloads in forms, EN/ES chrome).

# API Contract — US-16.2 Publish weekly trend snapshot (manual)

**Story:** US-16.2  
**Status:** Frozen — 2026-08-29 (awaiting FE signoff)  
**Security:** `plan/stories/US-16.2/SECURITY.md` (APPROVE WITH CONDITIONS — binding freeze; do not reopen)  
**Spec review:** `plan/stories/US-16.2/SPEC-REVIEW.md` (ALIGNED)  
**Depends on:** US-14.5 CONTRACT (frozen) — `requireOperator()` / `requireActive()` · US-16.1 CONTRACT (frozen) — `getPlaybookForAgents()` for `formatos_playbook_compatibles[]` slug validation · US-2.3 CONTRACT (frozen) — server-only agent helper pattern · US-3.1 CONTRACT (frozen) — `own_avatar` \| `generic_avatar` \| `faceless` modality tokens  
**Identity seam:** `lib/auth/get-current-user.ts` / `requireOperator()` (US-14.5 — unchanged)  
**Error envelope style:** same class as Playbook / Preferencias (`ok: true` vs `{ ok: false, error: { code, fields?, messageKey? } }`)

**This document is CONTRACT ONLY.** Do not implement loaders, Server Actions, Zod in code, migrations, or seeds until FE signoff. Zod below is the BUILD sketch for `lib/contracts/trend.ts`, Trend server modules, and `lib/trend/get-trend-snapshot-for-week.ts`.

**Terminology:** **Snapshot de tendencias** (ES) / **Táctica de tendencia** · **Operator** · **Playbook de formatos** (referenced only via `formatos_playbook_compatibles[]`). Technical helper name `getTrendSnapshotForWeek` is canonical. Enums `own_avatar` \| `generic_avatar` \| `faceless` OK in code/DB only — never primary UI headlines. Do **not** use CONTEXT _Evitar_ terms (trend report, weekly trends dump, trend tip, viral hack, admin / staff) in product-facing strings or fixtures’ UI labels.

---

## Overview

An authenticated **Operator** curates a **global weekly Snapshot de tendencias** on `/operator/trends`. The server:

1. Gates every Operator RSC loader with `requireOperator("page")` and every mutation with `requireOperator("handler")` as the **first** await — 401/403, **no side effects** on failure.
2. Persists rows in `neuramark_trend_snapshots` (**one row per `week_start`**, `entries` jsonb array; **no `client_id`**).
3. Validates every write with Zod **`.strict()`** (entry create vs update schemas; update **excludes `slug`**).
4. Enforces **entry slug immutability** after create within a snapshot; **rejects duplicate slugs** within the same `week_start`.
5. **Soft-deactivates** entries only (`activo: false`) — no hard delete of entries or snapshot rows in V1.
6. Forces **`fuente: manual`** on every V1 entry write (server-set; client cannot set `scraping` / `operator_review`).
7. Validates **`week_start` as ISO Monday** (`YYYY-MM-DD`); rejects non-Monday dates.
8. Validates **`formatos_playbook_compatibles[]`** against **active** Playbook slugs via **`getPlaybookForAgents()` only** — never direct `neuramark_content_playbooks` SELECT from Trend modules.
9. Exposes **`getTrendSnapshotForWeek(weekStart)`** as the **sole** read path for downstream agents — server-only, **`activo = true` entries only**, **`ejemplo_referencia` stripped**.

**Surfaces**

| # | Surface | Kind | New vs reused |
|---|---------|------|---------------|
| 1 | `/operator/trends` | RSC week list page | **New** — Operator Snapshot de tendencias hub |
| 2 | `/operator/trends/[weekStart]` | RSC week editor page + Client forms | **New** — `weekStart` = ISO Monday `YYYY-MM-DD` |
| 3 | `loadTrendWeekListForOperator` | RSC server helper | **New** — list persisted weeks |
| 4 | `loadTrendSnapshotForOperator` | RSC server helper | **New** — week detail + all entries (incl. inactive) |
| 5 | `publishOrUpdateSnapshot` | Server Action | **New** — upsert week row by `week_start` |
| 6 | `addTrendEntry` | Server Action | **New** — append táctica to week |
| 7 | `updateTrendEntry` | Server Action | **New** — replace táctica fields (slug immutable) |
| 8 | `deactivateTrendEntry` | Server Action | **New** — soft deactivate (`activo: false`) |
| 9 | `getTrendSnapshotForWeek` | Server-only helper | **New** — agent/orchestration read path |
| 10 | Zod + types | `lib/contracts/trend.ts` | **New** |
| 11 | Migration + seed | `neuramark_trend_snapshots` | **New** — `cold-open-mejor-toma` seed row |
| 12 | `loadPlaybookListForOperator` | RSC server helper | **Reused** (US-16.1) — active Playbook slug multi-select in táctica form |

**Forbidden surfaces (BUILD veto):**

- Public Route Handler (`/api/trends`, `/api/trend-snapshots`, week GET/POST/PATCH/DELETE).
- HTTP exposure of `getTrendSnapshotForWeek`.
- Client Component import of `get-trend-snapshot-for-week.ts`.
- Cliente read UI/API for Trend (US-4.1 brief labels only, later).
- LLM calls, video jobs, scraping agent, cron auto-publish, clone-prior-week.
- Direct `neuramark_content_playbooks` SELECT from Trend modules.

**Why Server Actions (not Route Handlers):** UI-coupled Operator CRUD under `(app)`; CSRF via Next.js origin check; no public REST snapshot API (SECURITY freeze).

**Frontend consumers**

| Consumer | Route | Contract surface |
|----------|-------|------------------|
| Week list | `app/(app)/operator/trends/page.tsx` | `loadTrendWeekListForOperator()` |
| Week editor | `app/(app)/operator/trends/[weekStart]/page.tsx` (+ Client forms) | `loadTrendSnapshotForOperator(weekStart)`; Publish week → `publishOrUpdateSnapshot(input)`; Add → `addTrendEntry(input)`; Save → `updateTrendEntry(weekStart, slug, input)`; Deactivate → `deactivateTrendEntry(weekStart, slug)` |
| Playbook slug multi-select | Táctica form (Client) | `loadPlaybookListForOperator()` (US-16.1) — active slugs only in UI |
| Success / error UX | Client forms | Standard `{ ok: true, … }` / error envelope; toast EN/ES on success |
| Nav discoverability | Operator nav (FE) | Link to `/operator/trends`; EN/ES chrome only |

**Server-only modules (planned BUILD)**

| Module | Purpose |
|--------|---------|
| `lib/trend/load-trend-week-list-for-operator.ts` | `import "server-only"`; week list loader |
| `lib/trend/load-trend-snapshot-for-operator.ts` | `import "server-only"`; week detail loader |
| `lib/trend/publish-or-update-snapshot.ts` | `"use server"` `publishOrUpdateSnapshot` |
| `lib/trend/add-trend-entry.ts` | `"use server"` `addTrendEntry` |
| `lib/trend/update-trend-entry.ts` | `"use server"` `updateTrendEntry` |
| `lib/trend/deactivate-trend-entry.ts` | `"use server"` `deactivateTrendEntry` |
| `lib/trend/get-trend-snapshot-for-week.ts` | `import "server-only"`; agent DTO |
| `lib/trend/validate-playbook-slugs.ts` | `import "server-only"`; wraps `getPlaybookForAgents()` allowlist |
| `lib/contracts/trend.ts` | Zod + types (Operator + agent variants) |
| `lib/auth/require-user.ts` | Unchanged — `requireOperator()` |
| `lib/supabase/server.ts` | Unchanged — service-role Node |
| Migration | **Yes** — `neuramark_trend_snapshots` + seed (`cold-open-mejor-toma`) |

---

## Frozen decisions (from SECURITY.md + SPEC-REVIEW + PO TASKS)

Do not reopen.

| # | Topic | Freeze |
|---|-------|--------|
| 1 | **Operator route** | **`/operator/trends`** (+ `/operator/trends/[weekStart]`). `requireOperator("page")` on loaders; `force-dynamic` / `Cache-Control: no-store` |
| 2 | **Tenancy** | **Global snapshot** — **no `client_id`** column; mutations accept **no** tenant args |
| 3 | **Surface** | Server Actions + RSC loaders only — **no** public CRUD Route Handler; **no** HTTP for `getTrendSnapshotForWeek` |
| 4 | **Row model** | **One row per `week_start`** (UNIQUE `date`); `entries` jsonb array holds all tácticas for that week |
| 5 | **Week key** | **`week_start`** = ISO week Monday as `date` (`YYYY-MM-DD`); server **rejects** non-Monday dates; UI week picker normalizes to Monday |
| 6 | **Entry identity** | Each entry includes `slug` + denormalized `week_start`; **slug unique within snapshot**; same slug **may** appear in different weeks |
| 7 | **Deactivate vs delete** | **Soft deactivate only** (`activo: false`). No DELETE Server Action or app DELETE of entries or rows |
| 8 | **Slug rules** | Create: required, regex `^[a-z0-9]+(?:-[a-z0-9]+)*$`, max 64. Update: **not in schema**; handler rejects if smuggled |
| 9 | **Upsert semantics** | `publishOrUpdateSnapshot` **upserts by `week_start`**: INSERT with validated `entries` (may be `[]`) + `published_at = now()`; UPDATE replaces **full** `entries` array with Zod-validated array + `updated_at`; **`published_at` unchanged** on update |
| 10 | **Entry CRUD** | `addTrendEntry` / `updateTrendEntry` / `deactivateTrendEntry` perform atomic read-modify-write on `entries` with full-array re-validation before persist |
| 11 | **Write validation** | Zod **`.strict()`** on snapshot publish and entry create/update. Client validation is presentation only |
| 12 | **`prioridad_semana`** | Integer **1–5** inclusive on every write; duplicates allowed across entries |
| 13 | **`fuente`** | Enum `manual` \| `scraping` \| `operator_review` in stored schema; **V1 writes force `manual`** server-side — omit from create/update input or reject non-manual |
| 14 | **`duracion_ideal_seg`** | **Strict object** `{ cold_open: number, total: number }` — distinct from Playbook scalar. Bounds: `cold_open` 1–10, `total` 5–90, `cold_open <= total` |
| 15 | **`rubros`** | Reuse `playbookRubroSchema` from `lib/contracts/playbook.ts`. **Empty array = all rubros** |
| 16 | **`modalidades_recomendadas`** | Reuse `visualModalitySchema`. **Empty array = no restriction** |
| 17 | **`hook_type`** | Reuse `playbookHookTypeSchema` from `lib/contracts/playbook.ts` |
| 18 | **Playbook refs** | `formatos_playbook_compatibles[]` validated on **every write** via active slugs from `getPlaybookForAgents()` |
| 19 | **Catalog content i18n** | Operator UI chrome EN/ES. Seed `titulo` / `explicacion` **Spanish-first monolingual** in V1 |
| 20 | **`ejemplo_referencia`** | Operator read/edit DTO **may include** after gate. **Absent** from agent DTO and any Cliente-facing shape |
| 21 | **Agent helper** | `getTrendSnapshotForWeek(weekStart)` — no session gate; trusted server callers only; **`activo = true` entries only** |
| 22 | **Logging** | `weekStart`, entry slug, error **codes** only — never full jsonb payloads in production |
| 23 | **Seed** | Fixed canonical `week_start` **`2026-01-05`** (ISO Monday); seed slug **`cold-open-mejor-toma`** |
| 24 | **Out of scope** | US-4.x+ Strategy/Script jobs; scraping agent; auto-activation; Cliente Trend UI; per-client overrides; clone-prior-week; LLM/video |

### Strip vs reject (mutation body)

| Keys | Behavior |
|------|----------|
| SPEC entry fields (create/update) | **Accept** via Zod `.strict()` per schema variant |
| `slug` on create | **Accept** (required) |
| `slug` on update | **Reject** — not in update schema; smuggled slug → `FORBIDDEN_FIELDS` |
| `week_start` on entry create/update | **Accept** — must match route/action `weekStart` or → `WEEK_START_MISMATCH` |
| `fuente` on create/update | **Reject** if client sends non-`manual`** → `FORBIDDEN_FIELDS`; if omitted, server sets `manual` |
| `activo` on create | **Accept** default `true`; on update via `updateTrendEntry` only (not via deactivate shortcut) |
| `activo` on deactivate | Set by `deactivateTrendEntry` only — not accepted in `updateTrendEntry` body (use dedicated action) |
| `published_at`, `publishedAt`, `updated_at`, `updatedAt`, row `id` | **Reject** → `FORBIDDEN_FIELDS` / `.strict()` |
| `client_id`, `clientId`, `role`, `auth_user_id` | **Reject** → `FORBIDDEN_FIELDS` |
| Unknown keys | **Reject** → `VALIDATION_ERROR` (`.strict()`) |

---

## Routes — Operator Trend (**new**)

| Rule | Detail |
|------|--------|
| Week list | **`/operator/trends`** |
| Week editor | **`/operator/trends/[weekStart]`** — dynamic segment = ISO Monday `YYYY-MM-DD` |
| Auth | `requireOperator("page")` on each RSC loader (or page calls helper that gates first) |
| Cache | `force-dynamic` / `Cache-Control: no-store` |
| Cliente | **No** read path in V1 |
| Rendering | Plain text for Operator-entered táctica fields — **no** `dangerouslySetInnerHTML` |

---

## Shared enums and bounds (BUILD: `lib/contracts/trend.ts`)

Import shared enums from Playbook / visual-preferences — do not duplicate:

```ts
import {
  playbookSlugSchema,
  playbookHookTypeSchema,
  playbookRubroSchema,
  playbookBeatSchema,
  playbookHintSchema,
  playbookEditingHintSchema,
  playbookTituloSchema,
  playbookExplicacionSchema,
  playbookEjemploReferenciaSchema,
} from "@/lib/contracts/playbook";
import { visualModalitySchema } from "@/lib/contracts/visual-preferences";
```

### `week_start` (ISO Monday)

```ts
export const trendWeekStartSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "week_start must be YYYY-MM-DD")
  .superRefine((value, ctx) => {
    const date = new Date(`${value}T12:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid date" });
      return;
    }
    if (date.getUTCDay() !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "week_start must be an ISO week Monday",
      });
    }
  });
```

### `fuente` (stored enum — V1 writes `manual` only)

```ts
export const trendFuenteSchema = z.enum([
  "manual",
  "scraping",
  "operator_review",
]);
```

### `prioridad_semana`

```ts
export const trendPrioridadSemanaSchema = z.number().int().min(1).max(5);
```

### `duracion_ideal_seg` (Trend object — not Playbook scalar)

```ts
export const trendDuracionIdealSegSchema = z
  .object({
    cold_open: z.number().int().min(1).max(10),
    total: z.number().int().min(5).max(90),
  })
  .strict()
  .superRefine((obj, ctx) => {
    if (obj.cold_open > obj.total) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "cold_open must be <= total",
        path: ["cold_open"],
      });
    }
  });
```

### Optional string bounds

```ts
export const trendEvitarSchema = z.string().trim().min(1).max(2000);
```

### Entry core (stored in `entries[]` — snake_case keys)

```ts
/** Full Táctica de tendencia object stored inside entries jsonb */
export const trendEntryCoreSchema = z
  .object({
    slug: playbookSlugSchema,
    titulo: playbookTituloSchema,
    week_start: trendWeekStartSchema,
    activo: z.boolean(),
    prioridad_semana: trendPrioridadSemanaSchema,
    fuente: trendFuenteSchema,
    explicacion: playbookExplicacionSchema,
    evitar: trendEvitarSchema.optional(),
    /** Operator-only — stored in entry; stripped from agent DTO */
    ejemplo_referencia: playbookEjemploReferenciaSchema.optional(),
    hook_type: playbookHookTypeSchema,
    estructura: z.array(playbookBeatSchema).min(1).max(12),
    guion_hints: z.array(playbookHintSchema).min(1).max(20),
    editing_hints: z.array(playbookEditingHintSchema).max(15).optional(),
    duracion_ideal_seg: trendDuracionIdealSegSchema,
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
    formatos_playbook_compatibles: z
      .array(playbookSlugSchema)
      .min(1)
      .max(10)
      .superRefine((arr, ctx) => {
        if (new Set(arr).size !== arr.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Duplicate Playbook slugs are not allowed",
            path: ["formatos_playbook_compatibles"],
          });
        }
      }),
  })
  .strict();
```

**Semantics:**

- `rubros: []` → applies to **all** rubros.
- `modalidades_recomendadas: []` → **no restriction** (any modality may be assigned per slot in US-4.x).
- `editing_hints` omitted or undefined → no editing technique hints.
- `evitar` omitted → no anti-patterns documented.
- Entry `week_start` must equal the parent snapshot row’s `week_start` (enforced in handlers).

### Entry create input (Operator form — omits server-owned fields)

```ts
export const trendEntryCreateInputSchema = z
  .object({
    slug: playbookSlugSchema,
    titulo: playbookTituloSchema,
    week_start: trendWeekStartSchema,
    prioridad_semana: trendPrioridadSemanaSchema,
    explicacion: playbookExplicacionSchema,
    evitar: trendEvitarSchema.optional(),
    ejemplo_referencia: playbookEjemploReferenciaSchema.optional(),
    hook_type: playbookHookTypeSchema,
    estructura: z.array(playbookBeatSchema).min(1).max(12),
    guion_hints: z.array(playbookHintSchema).min(1).max(20),
    editing_hints: z.array(playbookEditingHintSchema).max(15).optional(),
    duracion_ideal_seg: trendDuracionIdealSegSchema,
    modalidades_recomendadas: z.array(visualModalitySchema).max(3),
    rubros: z.array(playbookRubroSchema).max(15),
    formatos_playbook_compatibles: z.array(playbookSlugSchema).min(1).max(10),
  })
  .strict();
```

**Handler merges:** `activo: true`, `fuente: "manual"` (server-set).

### Entry update input (slug immutable — not in body)

```ts
export const trendEntryUpdateInputSchema = trendEntryCreateInputSchema
  .omit({ slug: true })
  .strict();
```

**Handler preserves:** `slug`, `activo` (unless `deactivateTrendEntry`), `fuente: "manual"`.

---

## Database — `neuramark_trend_snapshots` (**new**)

**Migration:** create table + RLS deny-by-default + seed one week with `cold-open-mejor-toma`.

### DDL sketch

```sql
CREATE TABLE public.neuramark_trend_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  entries jsonb NOT NULL DEFAULT '[]'::jsonb,
  published_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT neuramark_trend_snapshots_week_start_unique UNIQUE (week_start),
  CONSTRAINT neuramark_trend_snapshots_entries_is_array_chk
    CHECK (jsonb_typeof(entries) = 'array'),
  CONSTRAINT neuramark_trend_snapshots_entries_size_chk
    CHECK (pg_column_size(entries) <= 262144)
);

CREATE INDEX neuramark_trend_snapshots_week_start_idx
  ON public.neuramark_trend_snapshots (week_start DESC);

CREATE TRIGGER neuramark_trend_snapshots_set_updated_at
  BEFORE UPDATE ON public.neuramark_trend_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_set_updated_at();

ALTER TABLE public.neuramark_trend_snapshots ENABLE ROW LEVEL SECURITY;
-- Zero named policies → deny-by-default for anon/authenticated roles.
-- Access only via service-role Node (Next.js backend).
```

**No `client_id`.** No hard DELETE in app code.

### Row state transitions

| From | Action | To | Fields changed |
|------|--------|-----|----------------|
| *(new)* | `publishOrUpdateSnapshot` (no row) | published | `week_start`, `entries` (validated, may be `[]`), `published_at = now()`, `updated_at = now()` |
| published | `publishOrUpdateSnapshot` (row exists) | published | **Full `entries` replace** (validated); `updated_at`; **`published_at` unchanged** |
| published | `addTrendEntry` | published | Append entry to `entries`; `updated_at` |
| published | `updateTrendEntry` | published | Replace matching entry by `slug` in `entries`; `updated_at` |
| published | `deactivateTrendEntry` | published | Set entry `activo = false` in `entries`; `updated_at` |
| any | hard DELETE | — | **Forbidden** in V1 |

### Seed (frozen — migration)

| Field | Value |
|-------|-------|
| `week_start` | **`2026-01-05`** (ISO Monday) |
| Entry slug | **`cold-open-mejor-toma`** |
| `prioridad_semana` | `1` |
| `fuente` | `manual` |
| `activo` | `true` |
| `hook_type` | `before_after_tease` |
| `duracion_ideal_seg` | `{ "cold_open": 2, "total": 25 }` |
| `formatos_playbook_compatibles` | `["antes-despues", "tip-rapido"]` |
| `modalidades_recomendadas` | `["faceless", "own_avatar"]` |
| `rubros` | `[]` (all rubros) |

**Seed entry payload (exact jsonb object inside `entries[0]`):**

```json
{
  "slug": "cold-open-mejor-toma",
  "titulo": "Cold open con mejor toma",
  "week_start": "2026-01-05",
  "activo": true,
  "prioridad_semana": 1,
  "fuente": "manual",
  "explicacion": "Abrir con el clip de mayor impacto (2–3 s), luego rewind para contexto, desarrollo y CTA. Ideal para B-roll o avatar con fotos de trabajo real.",
  "hook_type": "before_after_tease",
  "estructura": [
    "Cold open (mejor toma)",
    "Rewind / contexto",
    "Desarrollo",
    "CTA"
  ],
  "guion_hints": [
    "Elegir la toma más visual o sorprendente para los primeros 2–3 segundos.",
    "Tras el cold open, rebobinar brevemente para situar al espectador."
  ],
  "editing_hints": [
    "Cold open: clip de impacto 2–3 s al inicio sin intro genérica.",
    "Rewind: efecto de rebobinado o repetición rápida tras el cold open para dar contexto."
  ],
  "duracion_ideal_seg": { "cold_open": 2, "total": 25 },
  "modalidades_recomendadas": ["faceless", "own_avatar"],
  "rubros": [],
  "formatos_playbook_compatibles": ["antes-despues", "tip-rapido"]
}
```

---

## Playbook slug validation (write-time)

**File (BUILD):** `lib/trend/validate-playbook-slugs.ts` (`import "server-only"`)

```ts
/**
 * Validates formatos_playbook_compatibles[] against active Playbook slugs.
 * MUST call getPlaybookForAgents() — never direct neuramark_content_playbooks SELECT.
 */
export async function validateFormatosPlaybookCompatibles(
  slugs: string[],
): Promise<{ ok: true } | { ok: false; invalidSlugs: string[] }>;
```

**Rules:**

- Call `getPlaybookForAgents()`; build allowlist from returned `formats[].slug`.
- Every slug in input must be in allowlist.
- On failure → mutation returns `VALIDATION_ERROR` with `fields.formatos_playbook_compatibles: ["trend.errors.invalidPlaybookSlug"]` and optional `invalidSlugs` in BUILD logs (codes only).
- If `getPlaybookForAgents()` returns `loadFailed: true` → mutation returns `INTERNAL_ERROR` (no partial write).

---

## Server helper — `loadTrendWeekListForOperator` (**new**)

**File (BUILD):** `lib/trend/load-trend-week-list-for-operator.ts` (`import "server-only"`)  
**Frontend consumer:** `/operator/trends` RSC.

**Signature (frozen):**

```ts
export async function loadTrendWeekListForOperator(): Promise<TrendWeekListForOperatorResult>;
```

**Auth:** `requireOperator("page")` first.

### Return shape

```ts
export const trendWeekListItemSchema = z
  .object({
    weekStart: trendWeekStartSchema,
    entryCount: z.number().int().min(0),
    activeEntryCount: z.number().int().min(0),
    publishedAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const trendWeekListForOperatorSuccessSchema = z
  .object({
    ok: z.literal(true),
    weeks: z.array(trendWeekListItemSchema),
  })
  .strict();

export const trendWeekListForOperatorLoadFailedSchema = z
  .object({
    ok: z.literal(false),
    loadFailed: z.literal(true),
  })
  .strict();

export type TrendWeekListForOperatorResult =
  | z.infer<typeof trendWeekListForOperatorSuccessSchema>
  | z.infer<typeof trendWeekListForOperatorLoadFailedSchema>;
```

**Query:** `SELECT week_start, entries, published_at, updated_at FROM neuramark_trend_snapshots ORDER BY week_start DESC`. Counts derived from `entries` (total length; active where `activo = true`).

**List only persisted weeks** — no synthetic future weeks.

---

## Server helper — `loadTrendSnapshotForOperator` (**new**)

**File (BUILD):** `lib/trend/load-trend-snapshot-for-operator.ts` (`import "server-only"`)  
**Frontend consumer:** `/operator/trends/[weekStart]` RSC.

**Signature (frozen):**

```ts
export async function loadTrendSnapshotForOperator(
  weekStart: string,
): Promise<TrendSnapshotForOperatorResult>;
```

**Auth:** `requireOperator("page")` first. Validate `weekStart` with `trendWeekStartSchema` before query.

### Return shape

```ts
export const trendSnapshotOperatorViewSchema = z
  .object({
    weekStart: trendWeekStartSchema,
    publishedAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    entries: z.array(trendEntryCoreSchema),
  })
  .strict();

export const trendSnapshotForOperatorFoundSchema = z
  .object({
    ok: z.literal(true),
    snapshot: trendSnapshotOperatorViewSchema,
  })
  .strict();

export const trendSnapshotForOperatorNotFoundSchema = z
  .object({
    ok: z.literal(false),
    error: z.object({
      code: z.literal("NOT_FOUND"),
      messageKey: z.literal("trend.errors.weekNotFound"),
    }),
  })
  .strict();

export type TrendSnapshotForOperatorResult =
  | z.infer<typeof trendSnapshotForOperatorFoundSchema>
  | z.infer<typeof trendSnapshotForOperatorNotFoundSchema>;
```

**Includes inactive entries** (`activo: false`) for Operator history. **May include `ejemplo_referencia`** per entry. Never cache publicly.

---

## Server Action — `publishOrUpdateSnapshot` (**new**)

**File (BUILD):** `lib/trend/publish-or-update-snapshot.ts` — `"use server"`  
**Frontend consumer:** `/operator/trends` — **Publish new week**; `/operator/trends/[weekStart]` — optional bulk replace (if FE adds “Save all” later; V1 primary flow uses entry CRUD).

**Signature (frozen):**

```ts
export async function publishOrUpdateSnapshot(
  input: PublishOrUpdateSnapshotInput,
): Promise<PublishOrUpdateSnapshotResult>;
```

**Auth:** `requireOperator("handler")` **before** validation or DB I/O.

### Input

```ts
export const publishOrUpdateSnapshotInputSchema = z
  .object({
    weekStart: trendWeekStartSchema,
    /** Optional on create; on update replaces full entries array. Default `[]` on insert. */
    entries: z.array(trendEntryCreateInputSchema).max(50).optional(),
  })
  .strict();
```

**Handler behavior (frozen):**

1. Validate each entry in `entries` (if provided) via `trendEntryCreateInputSchema` + merge `activo: true`, `fuente: "manual"`.
2. Validate `formatos_playbook_compatibles` on each entry via `validateFormatosPlaybookCompatibles`.
3. Reject duplicate slugs within the submitted `entries` array.
4. Ensure each entry’s `week_start` equals input `weekStart` — else `WEEK_START_MISMATCH`.
5. **INSERT** if no row: `entries = input.entries ?? []`, `published_at = now()`.
6. **UPDATE** if row exists: replace `entries` with validated array (use `input.entries ?? existing entries` — if `entries` omitted on update, **no change to entries**, only validates row exists); always bump `updated_at`; **`published_at` unchanged**.

### Success

```ts
export const publishOrUpdateSnapshotSuccessSchema = z
  .object({
    ok: z.literal(true),
    weekStart: trendWeekStartSchema,
    created: z.boolean(),
  })
  .strict();
```

| Condition | `error.code` | Side effects |
|-----------|--------------|--------------|
| Unauthenticated | `UNAUTHENTICATED` | None |
| Non-operator / inactive | `FORBIDDEN` | None |
| Zod fail | `VALIDATION_ERROR` + `fields` | None |
| Non-Monday `weekStart` | `VALIDATION_ERROR` | None |
| Duplicate slug in `entries` | `DUPLICATE_SLUG` | None |
| Invalid Playbook slug | `VALIDATION_ERROR` + `fields.formatos_playbook_compatibles` | None |
| Entry `week_start` ≠ `weekStart` | `WEEK_START_MISMATCH` | None |
| Client sends `fuente` ≠ `manual` | `FORBIDDEN_FIELDS` | None |

**Post-success:** `revalidatePath("/operator/trends")` and `revalidatePath(\`/operator/trends/${weekStart}\`)`.

---

## Server Action — `addTrendEntry` (**new**)

**File (BUILD):** `lib/trend/add-trend-entry.ts` — `"use server"`  
**Frontend consumer:** `/operator/trends/[weekStart]` — **Add táctica**.

**Signature (frozen):**

```ts
export async function addTrendEntry(
  input: AddTrendEntryInput,
): Promise<AddTrendEntryResult>;
```

**Auth:** `requireOperator("handler")` first.

### Input

```ts
export const addTrendEntryInputSchema = z
  .object({
    weekStart: trendWeekStartSchema,
    entry: trendEntryCreateInputSchema,
  })
  .strict();
```

**Handler:** Row must exist for `weekStart` — else `NOT_FOUND`. Entry `week_start` must match `weekStart`. Merge `activo: true`, `fuente: "manual"`. Reject duplicate slug in existing `entries`. Validate Playbook slugs. Append to `entries`; bump `updated_at`.

### Success

```ts
export const addTrendEntrySuccessSchema = z
  .object({
    ok: z.literal(true),
    weekStart: trendWeekStartSchema,
    slug: playbookSlugSchema,
  })
  .strict();
```

| Condition | `error.code` | Side effects |
|-----------|--------------|--------------|
| Week row not found | `NOT_FOUND` | None |
| Duplicate slug in snapshot | `DUPLICATE_SLUG` | None |
| Invalid Playbook slug | `VALIDATION_ERROR` | None |
| Entry `week_start` mismatch | `WEEK_START_MISMATCH` | None |

**Post-success:** same `revalidatePath` targets as publish.

---

## Server Action — `updateTrendEntry` (**new**)

**File (BUILD):** `lib/trend/update-trend-entry.ts` — `"use server"`  
**Frontend consumer:** `/operator/trends/[weekStart]` — **Save** on edit form.

**Signature (frozen):**

```ts
export async function updateTrendEntry(
  weekStart: string,
  slug: string,
  input: UpdateTrendEntryInput,
): Promise<UpdateTrendEntryResult>;
```

**Auth:** `requireOperator("handler")` first. Validate route `weekStart` and `slug` with respective schemas.

### Input

```ts
export const updateTrendEntryInputSchema = trendEntryUpdateInputSchema;

export type UpdateTrendEntryInput = z.infer<typeof updateTrendEntryInputSchema>;
```

**Handler:** Find entry by `slug` in snapshot — else `NOT_FOUND`. **Preserve** `slug` and current `activo`. Force `fuente: "manual"`. Validate Playbook slugs. Replace entry object in array; bump `updated_at`.

| Condition | `error.code` | Side effects |
|-----------|--------------|--------------|
| Snapshot or entry not found | `NOT_FOUND` | None |
| Slug in body (smuggled) | `FORBIDDEN_FIELDS` | None |
| Invalid Playbook slug | `VALIDATION_ERROR` | None |
| Entry `week_start` mismatch | `WEEK_START_MISMATCH` | None |

### Success

```ts
export const updateTrendEntrySuccessSchema = z
  .object({
    ok: z.literal(true),
    weekStart: trendWeekStartSchema,
    slug: playbookSlugSchema,
  })
  .strict();
```

**Post-success:** same `revalidatePath` targets.

---

## Server Action — `deactivateTrendEntry` (**new**)

**File (BUILD):** `lib/trend/deactivate-trend-entry.ts` — `"use server"`  
**Frontend consumer:** `/operator/trends/[weekStart]` — **Deactivate** (confirm in FE).

**Signature (frozen):**

```ts
export async function deactivateTrendEntry(
  weekStart: string,
  slug: string,
): Promise<DeactivateTrendEntryResult>;
```

**Auth:** `requireOperator("handler")` first.

### Input

Route params only — **no body**. Sets matching entry `activo = false`; slug remains in jsonb.

### Success

```ts
export const deactivateTrendEntrySuccessSchema = z
  .object({
    ok: z.literal(true),
    weekStart: trendWeekStartSchema,
    slug: playbookSlugSchema,
    alreadyInactive: z.boolean().optional(),
  })
  .strict();
```

**Behavior:**

- Active entry → `activo = false`; bump `updated_at`.
- Already inactive → `{ ok: true, alreadyInactive: true }` (idempotent).
- Unknown slug → `NOT_FOUND`.

**Post-success:** same `revalidatePath` targets.

---

## Server helper — `getTrendSnapshotForWeek` (**new**)

**File (BUILD):** `lib/trend/get-trend-snapshot-for-week.ts` (`import "server-only"`)  
**Consumers (later):** Content Strategy (US-4.1), Video Script (US-5.1), Media Assembly (US-9.x) — **not built in this story**.  
**Why server helper (not Route Handler):** Trusted server orchestration read; no browser/HTTP surface.

**Signature (frozen):**

```ts
/**
 * Global Snapshot de tendencias projection for trusted server agents.
 *
 * Content Strategy, Video Script, and Media Assembly (US-4.1+)
 * MUST import this helper only — never direct
 * neuramark_trend_snapshots SELECT from agent modules.
 *
 * No session gate — callers are trusted server jobs only.
 * Active entries only; ejemplo_referencia stripped.
 */
export async function getTrendSnapshotForWeek(
  weekStart: string,
): Promise<TrendSnapshotForWeekResult>;
```

**Auth inside helper:** **None** (mirror US-2.3 / US-16.1 trusted-caller pattern).

**Input validation:** Parse `weekStart` with `trendWeekStartSchema`. Invalid date / non-Monday → **`{ weekStart: normalizedOrInput, entries: [] }`** (safe empty — not an error oracle for untrusted callers).

**Query (frozen filter):**

```sql
SELECT week_start, entries
FROM neuramark_trend_snapshots
WHERE week_start = $weekStart
LIMIT 1;
```

### Agent DTO schema (strip `ejemplo_referencia`; active only)

```ts
export const trendEntryAgentDtoSchema = z
  .object({
    slug: playbookSlugSchema,
    titulo: playbookTituloSchema,
    weekStart: trendWeekStartSchema,
    prioridadSemana: trendPrioridadSemanaSchema,
    fuente: trendFuenteSchema,
    explicacion: playbookExplicacionSchema,
    evitar: trendEvitarSchema.optional(),
    hookType: playbookHookTypeSchema,
    estructura: z.array(playbookBeatSchema).min(1).max(12),
    guionHints: z.array(playbookHintSchema).min(1).max(20),
    editingHints: z.array(playbookEditingHintSchema).max(15).optional(),
    duracionIdealSeg: trendDuracionIdealSegSchema,
    modalidadesRecomendadas: z.array(visualModalitySchema).max(3),
    rubros: z.array(playbookRubroSchema).max(15),
    formatosPlaybookCompatibles: z.array(playbookSlugSchema).min(1).max(10),
  })
  .strict();

export const trendSnapshotForWeekSuccessSchema = z
  .object({
    weekStart: trendWeekStartSchema,
    entries: z.array(trendEntryAgentDtoSchema),
  })
  .strict();

export type TrendSnapshotForWeekResult = z.infer<
  typeof trendSnapshotForWeekSuccessSchema
>;
```

**Mapping:** jsonb snake_case → agent DTO camelCase. **Drop** `ejemplo_referencia` at map time. **Filter** `activo === true` before map. Rows failing Zod → skip entry; log code only. No row for week → `{ weekStart, entries: [] }`. DB error → `{ weekStart, entries: [] }` + `loadFailed: true` optional internal flag **not** exposed to untrusted callers (mirror Playbook: return empty entries only).

### Strip list (agent DTO — key must be absent)

```txt
ejemplo_referencia, ejemploReferencia,
activo,
published_at, publishedAt, updated_at, updatedAt,
id, client_id, clientId
```

---

## Standard error envelope

Handler failures reuse US-14.5 / Playbook pattern:

```ts
export const trendErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "DUPLICATE_SLUG",
  "WEEK_START_MISMATCH",
  "FORBIDDEN_FIELDS",
  "INTERNAL_ERROR",
]);

export type TrendMutationError = {
  ok: false;
  error: {
    code: z.infer<typeof trendErrorCodeSchema>;
    messageKey?: string;
    fields?: Record<string, string[]>;
  };
};
```

| Code | `messageKey` (i18n) | When |
|------|---------------------|------|
| `UNAUTHENTICATED` | `auth.errors.unauthenticated` | No session (handler) |
| `FORBIDDEN` | `auth.errors.forbidden` | Inactive or non-operator |
| `VALIDATION_ERROR` | `trend.errors.validation` | Zod failure; invalid Playbook slug |
| `NOT_FOUND` | `trend.errors.notFound` | Unknown week or entry slug |
| `DUPLICATE_SLUG` | `trend.errors.duplicateSlug` | Duplicate slug within snapshot |
| `WEEK_START_MISMATCH` | `trend.errors.weekStartMismatch` | Entry `week_start` ≠ action `weekStart` |
| `FORBIDDEN_FIELDS` | `trend.errors.forbiddenFields` | Privilege / slug / `fuente` smuggle |
| `INTERNAL_ERROR` | `trend.errors.internal` | Unexpected DB failure (no payload leak) |

Page loaders use `requireOperator("page")` redirects — not this JSON envelope.

---

## Fixtures (BUILD / FE mocks / tests)

### Week list — happy

**Call:** `loadTrendWeekListForOperator()` (operator session)

```json
{
  "ok": true,
  "weeks": [
    {
      "weekStart": "2026-01-05",
      "entryCount": 1,
      "activeEntryCount": 1,
      "publishedAt": "2026-08-29T18:00:00.000Z",
      "updatedAt": "2026-08-29T18:00:00.000Z"
    }
  ]
}
```

### Week detail — happy (Operator may see `ejemplo_referencia`)

**Call:** `loadTrendSnapshotForOperator("2026-01-05")`

```json
{
  "ok": true,
  "snapshot": {
    "weekStart": "2026-01-05",
    "publishedAt": "2026-08-29T18:00:00.000Z",
    "updatedAt": "2026-08-29T18:00:00.000Z",
    "entries": [
      {
        "slug": "cold-open-mejor-toma",
        "titulo": "Cold open con mejor toma",
        "week_start": "2026-01-05",
        "activo": true,
        "prioridad_semana": 1,
        "fuente": "manual",
        "explicacion": "Abrir con el clip de mayor impacto (2–3 s), luego rewind para contexto, desarrollo y CTA.",
        "hook_type": "before_after_tease",
        "estructura": ["Cold open (mejor toma)", "Rewind / contexto", "Desarrollo", "CTA"],
        "guion_hints": ["Elegir la toma más visual para los primeros 2–3 segundos."],
        "editing_hints": ["Cold open: clip de impacto 2–3 s al inicio.", "Rewind: rebobinado tras el cold open."],
        "duracion_ideal_seg": { "cold_open": 2, "total": 25 },
        "modalidades_recomendadas": ["faceless", "own_avatar"],
        "rubros": [],
        "formatos_playbook_compatibles": ["antes-despues", "tip-rapido"],
        "ejemplo_referencia": "https://example.internal/ref/cold-open-mejor-toma"
      }
    ]
  }
}
```

### Publish new week — request / success

**Request:** `publishOrUpdateSnapshot({ "weekStart": "2026-01-12" })`

**Response:**

```json
{
  "ok": true,
  "weekStart": "2026-01-12",
  "created": true
}
```

### Add entry — request / success

**Request:** `addTrendEntry({ "weekStart": "2026-01-12", "entry": { … } })`

**Response:**

```json
{
  "ok": true,
  "weekStart": "2026-01-12",
  "slug": "pregunta-hook-local"
}
```

### Update entry — success

**Request:** `updateTrendEntry("2026-01-12", "pregunta-hook-local", { … })`

**Response:**

```json
{
  "ok": true,
  "weekStart": "2026-01-12",
  "slug": "pregunta-hook-local"
}
```

### Deactivate entry — success

**Request:** `deactivateTrendEntry("2026-01-12", "pregunta-hook-local")`

**Response:**

```json
{
  "ok": true,
  "weekStart": "2026-01-12",
  "slug": "pregunta-hook-local"
}
```

### Validation error — duplicate slug

```json
{
  "ok": false,
  "error": {
    "code": "DUPLICATE_SLUG",
    "messageKey": "trend.errors.duplicateSlug",
    "fields": { "slug": ["trend.errors.duplicateSlug"] }
  }
}
```

### Validation error — unknown Playbook slug

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "messageKey": "trend.errors.validation",
    "fields": {
      "formatos_playbook_compatibles": ["trend.errors.invalidPlaybookSlug"]
    }
  }
}
```

### Validation error — non-Monday week

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "messageKey": "trend.errors.validation",
    "fields": { "weekStart": ["trend.errors.notMonday"] }
  }
}
```

### Forbidden — non-operator mutation

```json
{
  "ok": false,
  "error": {
    "code": "FORBIDDEN",
    "messageKey": "auth.errors.forbidden"
  }
}
```

### Agent helper — happy (seed week)

**Call:** `getTrendSnapshotForWeek("2026-01-05")` (server module only)

```json
{
  "weekStart": "2026-01-05",
  "entries": [
    {
      "slug": "cold-open-mejor-toma",
      "titulo": "Cold open con mejor toma",
      "weekStart": "2026-01-05",
      "prioridadSemana": 1,
      "fuente": "manual",
      "explicacion": "Abrir con el clip de mayor impacto (2–3 s), luego rewind para contexto, desarrollo y CTA.",
      "hookType": "before_after_tease",
      "estructura": ["Cold open (mejor toma)", "Rewind / contexto", "Desarrollo", "CTA"],
      "guionHints": ["Elegir la toma más visual para los primeros 2–3 segundos."],
      "editingHints": ["Cold open: clip de impacto 2–3 s al inicio.", "Rewind: rebobinado tras el cold open."],
      "duracionIdealSeg": { "cold_open": 2, "total": 25 },
      "modalidadesRecomendadas": ["faceless", "own_avatar"],
      "rubros": [],
      "formatosPlaybookCompatibles": ["antes-despues", "tip-rapido"]
    }
  ]
}
```

### Agent helper — empty week (no row)

**Call:** `getTrendSnapshotForWeek("2026-02-02")`

```json
{
  "weekStart": "2026-02-02",
  "entries": []
}
```

### Agent helper — deactivated entry excluded

After `deactivateTrendEntry("2026-01-05", "cold-open-mejor-toma")`, `getTrendSnapshotForWeek("2026-01-05")` returns `{ "weekStart": "2026-01-05", "entries": [] }`.

### Agent strip proof

Success agent entry objects must **not** contain:

```txt
ejemplo_referencia, ejemploReferencia, activo,
publishedAt, updatedAt, id
```

---

## `revalidatePath` targets (post-mutation)

| Action | Paths |
|--------|-------|
| All Trend mutations | `/operator/trends` |
| All Trend mutations | `/operator/trends/${weekStart}` |

---

## Automated tests (BUILD expectations)

| Case | Assert |
|------|--------|
| Publish + entry CRUD happy path | Publish week → add → list/detail → update → deactivate |
| Duplicate slug within week | `DUPLICATE_SLUG`; no duplicate in `entries` |
| Slug immutability | Update cannot change slug; slug in body → `FORBIDDEN_FIELDS` |
| Unknown Playbook slug | `VALIDATION_ERROR`; no write |
| Deactivate exclusion | Deactivated entry absent from `getTrendSnapshotForWeek()` |
| Agent DTO strip | `ejemplo_referencia` absent; `.strict()` agent schema passes |
| Non-operator mutation | `FORBIDDEN`; no DB change |
| Non-operator page | Loader gate → 403 / redirect per US-14.5 |
| `.strict()` writes | Extra keys → `VALIDATION_ERROR` |
| `fuente` enforcement | Client `scraping` → rejected or overwritten; stored value always `manual` in V1 |
| Non-Monday `weekStart` | `VALIDATION_ERROR`; no row inserted |
| Module boundary | `get-trend-snapshot-for-week.ts` has `server-only`; not in client graph |
| No HTTP | No `/api/trends*` Route Handler |
| Playbook validation path | Trend module imports `getPlaybookForAgents()` — grep no direct Playbook SELECT |
| Upsert `published_at` | Set on insert only; unchanged on update |
| Empty week agent read | No row → `{ weekStart, entries: [] }` |

---

## Out of scope

| Topic | Owner |
|-------|--------|
| Content Strategy / Script / Caption LLM jobs | US-4.x+ |
| Cliente Trend UI / brief táctica labels | US-4.1 |
| Trend scraping agent / `fuente: scraping` writes | Future story |
| Auto-activation rules / cron publish | Future story |
| Per-client Trend overrides | Future story |
| Clone prior week | P1 convenience — not V1 |
| Public REST snapshot API | **Never** under this contract |
| Playbook CRUD / `getPlaybookForAgents()` changes | US-16.1 (reuse only) |
| LLM / video / provider spend | Out |

---

## AC mapping (for validator — do not check USER_STORIES here)

| USER_STORIES AC | Contract coverage |
|-----------------|-------------------|
| Operator publish/update snapshot per `week_start` | `publishOrUpdateSnapshot` + UNIQUE row model |
| SPEC táctica fields | `trendEntryCoreSchema` + seed |
| Seed `cold-open-mejor-toma` | Frozen payload + `week_start` `2026-01-05` |
| `getTrendSnapshotForWeek()` active-only, safe empty | Agent helper + filter + empty shape |
| Playbook slug validation on write | `validateFormatosPlaybookCompatibles` + errors |
| EN/ES copy | FE i18n keys (`trend.*`); catalog ES-first documented |
| Operator-only 403 | `requireOperator` on all surfaces |
| [SEC] Zod on write; `prioridad_semana` 1–5 | `.strict()` create/update |
| [SEC] server-only agent path | `import "server-only"` + MUST-import comment |
| [SEC] no Operator-only fields in agent DTO | Strip list + agent schema |
| [SEC] untrusted input at LLM time | Documented — containment in US-4.1+ |
| [SEC] no scraping/auto-activation | `fuente: manual` only; out of scope |

---

## Signoff checklist

- [x] Operator routes frozen: `/operator/trends`, `/operator/trends/[weekStart]`
- [x] Server Action names frozen; each mutation starts with `requireOperator("handler")`
- [x] RSC loaders frozen; `requireOperator("page")`
- [x] **No** public CRUD Route Handler
- [x] Table `neuramark_trend_snapshots`: columns, RLS, no `client_id`
- [x] Zod create/update `.strict()`; closed enums reused from Playbook; update excludes `slug`
- [x] Entry slug immutability + per-week uniqueness documented
- [x] Deactivate semantics; no DELETE
- [x] Upsert / `published_at` / `updated_at` behavior frozen
- [x] `getTrendSnapshotForWeek()` path, `{ weekStart, entries: [...] }`, active filter, strip list, empty-week behavior
- [x] Operator read DTO vs agent DTO distinction explicit
- [x] Playbook slug validation via `getPlaybookForAgents()` documented with error code
- [x] `fuente: manual` enforcement on V1 writes
- [x] `week_start` Monday validation frozen
- [x] Seed `week_start` + `cold-open-mejor-toma` payload frozen
- [x] `revalidatePath` targets listed
- [x] EN/ES Operator chrome; plain-text táctica fields
- [x] **Reviewed by FE:** yes — 2026-08-29

After FE signoff, BUILD may proceed. Any contract change after freeze requires an update to this file + FE re-signoff.

| Date | Change |
|------|--------|
| 2026-08-29 | CONTRACT authored (nextjs-backend + content-agents-engineer); Frozen pending FE |
