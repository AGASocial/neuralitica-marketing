**Reviewed by FE:** pending

# API Contract — US-4.1 Generate weekly Instagram content strategy

**Story:** US-4.1  
**Status:** Frozen — 2026-08-30 (awaiting FE signoff)  
**Security:** `plan/stories/US-4.1/SECURITY.md` (APPROVE WITH CONDITIONS — binding freeze; do not reopen)  
**Spec review:** `plan/stories/US-4.1/SPEC-REVIEW.md` (GAPS — resolved by this contract)  
**Depends on:** US-2.3 ✅ `getBusinessProfileForAgents()` · US-3.4 ✅ `visualModeSummary` allowlist · US-16.1 ✅ `getPlaybookForAgents()` · US-16.2 ✅ `getTrendSnapshotForWeek()` · US-X.4 ✅ `getProviderCatalog()` + `resolveProvider({ llmVariant: "default" })` · US-14.5 ✅ `requireOperator()`  
**Identity seam:** `lib/auth/get-current-user.ts` / `requireOperator()` (US-14.5 — unchanged)  
**Error envelope style:** same class as Playbook / Trend (`ok: true` vs `{ ok: false, error: { code, fields?, messageKey? } }`)

**This document is CONTRACT ONLY.** Do not implement loaders, Server Actions, Zod in code, migrations, or agent prompts until FE signoff. Zod below is the BUILD sketch for `lib/contracts/content-strategy.ts`, server modules, and `lib/agents/content/generate-weekly-strategy.ts`.

**Terminology:** **Estrategia semanal** (ES) / **Weekly content strategy** (EN product chrome) · **brief** (technical) · **Formato de Reel** · **Modalidad de producción** · **Táctica de tendencia** · **Operator** · **Ficha viva**. Technical enums (`own_avatar`, `trust`, `formatoPlaybookSlug`) OK in code/DB. Do **not** use CONTEXT _Evitar_ terms (weekly brief as product headline, viral playbook, content template, multichannel plan, admin/staff) in product-facing strings.

**SPEC-REVIEW blocking gaps closed in this contract:**

| # | Gap | Resolution |
|---|-----|------------|
| 1 | Playbook + Trend mandatory agent inputs | Four-helper pipeline frozen; agent **MUST** call `getPlaybookForAgents()` + `getTrendSnapshotForWeek(weekStart)` — never direct catalog/snapshot SELECT |
| 2 | Per-slot brief shape | Frozen Zod `contentStrategySlotSchema`: `tema`, `formatoPlaybookSlug`, `modalidad`, optional `tacticaTendenciaSlug`, `goal` enum |
| 3 | Modalidad ⊆ allowlist | Post-parse `validateBriefAgainstAllowlists()`; reject before INSERT |
| 4 | Operator vs System cron | Dual path: Operator Server Action (`requireOperator`) + internal `generateContentStrategyForClient({ invokedBy })` — **no HTTP** for system path in US-4.1 |
| 5 | DB table prefix | `neuramark_content_strategies` with monotonic `version` per `(client_id, week_start)` |

---

## Overview

An authenticated **Operator** triggers **Estrategia semanal** generation for a target **Cliente** + ISO week. The server:

1. Gates **generate** and **read** with `requireOperator()` — 401/403, **no side effects** on failure.
2. Resolves **`clientId` server-side only** (V1: `getCurrentUser().id` after operator gate — **no** authoritative `clientId` in request body).
3. Loads agent inputs **only** via four trusted helpers: profile (incl. allowlist), Playbook, Trend snapshot, provider catalog + cost policy.
4. Runs server-only LLM job (`lib/agents/content/generate-weekly-strategy.ts`); wraps untrusted text in delimited blocks; validates output with Zod **`.strict()`**; re-validates slugs/modalidad against helper allowlists.
5. **INSERT** new row in `neuramark_content_strategies` with `status = draft`, monotonic `version` — **never UPDATE** prior `brief` on regenerate; **never DELETE** history.
6. Enforces per-`client_id` rate limit (**3 / 60 min**) + in-flight guard (**1** per `client_id` + `week_start`).

**Instagram Reels only** — brief has no multichannel fields; reject unknown keys via `.strict()`.

**Surfaces**

| # | Surface | Kind | New vs reused |
|---|---------|------|---------------|
| 1 | `/operator/strategy` | RSC Operator page | **New** — Estrategia semanal hub |
| 2 | `generateContentStrategy` | Server Action | **New** — Operator trigger |
| 3 | `getLatestContentStrategy` | Server Action | **New** — Operator read latest draft |
| 4 | `generateContentStrategyForClient` | Server-only orchestrator | **New** — shared by action + future ADR-0001 cron |
| 5 | `generateWeeklyContentStrategy` | Server-only agent module | **New** — `lib/agents/content/generate-weekly-strategy.ts` |
| 6 | `validateBriefAgainstAllowlists` | Server-only pure fn | **New** — post-Zod slug/modalidad checks |
| 7 | Zod + types | `lib/contracts/content-strategy.ts` | **New** |
| 8 | Migration | `neuramark_content_strategies` + `neuramark_agent_rate_limits` | **New** |
| 9 | `trendWeekStartSchema` | `lib/contracts/trend.ts` | **Reused** — week validation |
| 10 | `visualModalitySchema`, `playbookSlugSchema` | contracts | **Reused** |

**Forbidden surfaces (BUILD veto):**

- Public Route Handler (`/api/content-strategies`, generate/status poll, cron webhook).
- HTTP exposure of `generateContentStrategyForClient` or `generateWeeklyContentStrategy`.
- Client Component import of agent/orchestrator modules.
- Cliente read UI/API for strategy brief (deferred US-4.2 / follow-on).
- Direct SELECT on `neuramark_interview_sessions`, `neuramark_content_playbooks`, `neuramark_trend_snapshots` from agent module.
- Request fields: `clientId`, `client_id`, `providerKey`, `tier`, `envKeyName` as authority.
- `approved` status writes, edit/approve endpoints (US-4.2).
- `neuramark_reel_scripts` or downstream script/caption/video jobs.

**Why Server Actions (not Route Handlers):** UI-coupled Operator generate/read under `(app)`; CSRF via Next.js origin check; no public REST API (SECURITY freeze). System cron (ADR-0001) calls **server-only** `generateContentStrategyForClient` — not HTTP in US-4.1.

**Frontend consumers**

| Consumer | Route | Contract surface |
|----------|-------|------------------|
| Strategy page | `app/(app)/operator/strategy/page.tsx` | Initial load: `getLatestContentStrategy({ weekStart })` or page-level wrapper; **Generate** → `generateContentStrategy({ weekStart })` |
| Week picker | Strategy page Client island | `weekStart` ISO Monday; default current week Monday |
| Client context (V1) | Strategy page | Implicit session Cliente — **no** `clientId` in action input; selector UI may show current user label only |
| Success / error UX | Client button + toasts | Standard envelope; rate-limit / agent-failure `messageKey` |
| Nav | Operator nav (FE) | Link to `/operator/strategy`; EN/ES chrome |

**Server-only modules (planned BUILD)**

| Module | Purpose |
|--------|---------|
| `lib/content-strategy/actions/generate-content-strategy.ts` | `"use server"` `generateContentStrategy` |
| `lib/content-strategy/actions/get-latest-content-strategy.ts` | `"use server"` `getLatestContentStrategy` |
| `lib/content-strategy/generate-content-strategy-for-client.ts` | `import "server-only"` orchestrator |
| `lib/content-strategy/validate-brief-against-allowlists.ts` | `import "server-only"` post-parse validation |
| `lib/content-strategy/load-latest-strategy-row.ts` | `import "server-only"` DB read helper |
| `lib/content-strategy/persist-strategy-draft.ts` | `import "server-only"` versioned INSERT |
| `lib/content-strategy/check-generation-rate-limit.ts` | `import "server-only"` rate + in-flight |
| `lib/agents/content/generate-weekly-strategy.ts` | `import "server-only"` LLM prompt + parse |
| `lib/contracts/content-strategy.ts` | Zod + types |
| Migrations | See [Database](#database) |

---

## Frozen decisions (from SECURITY.md + SPEC-REVIEW + PO TASKS)

Do not reopen.

| # | Topic | Freeze |
|---|-------|--------|
| 1 | **Operator route** | **`/operator/strategy`** — optional query `?weekStart=YYYY-MM-DD` (ISO Monday). `requireOperator("page")` on RSC; `force-dynamic` / `Cache-Control: no-store` |
| 2 | **Tenancy (V1)** | `clientId` = **`getCurrentUser().id`** after `requireOperator()` on generate/read actions. Request schema **`{ weekStart }` only** — no authoritative `clientId`. Multi-client Operator picker = future story (server-validated job context) |
| 3 | **Dual invoke path** | **Operator:** `generateContentStrategy` → `generateContentStrategyForClient({ clientId, weekStart, invokedBy: "operator" })`. **System (ADR-0001, not built US-4.1):** trusted orchestration calls same helper with `invokedBy: "system"` — **no** `requireOperator` inside helper; **no** HTTP surface |
| 4 | **Agent inputs (mandatory)** | **`getBusinessProfileForAgents(clientId)`** · **`getPlaybookForAgents()`** · **`getTrendSnapshotForWeek(weekStart)`** · **`getProviderCatalog()`** + **`getDefaultCostPolicy()`**. Empty trend `{ entries: [] }` OK. Abort before LLM if profile `exists: false` |
| 5 | **LLM provider** | `resolveProvider(catalog, { assetRole: "llm", tier: policy.providerTier, llmVariant: "default" })` → `siliconflow_deepseek_flash`. Keys via `process.env[row.envKeyName]` only |
| 6 | **Brief locale** | Generate copy in profile `fields.preferredLocale` when `en` \| `es`; else **`es`** (prompt instruction) |
| 7 | **Status** | All US-4.1 writes **`status = 'draft'`** only. Enum includes `approved` for US-4.2 — not written here |
| 8 | **Versioning** | Monotonic integer **`version` ≥ 1** per `(client_id, week_start)`. First generate → `1`; regenerate → `max + 1` **INSERT**. Never UPDATE prior `brief`. Never DELETE rows |
| 9 | **Slot count** | **`slots.length` ≥ 3** and **≤ 7** (hard Zod max). Channel implicit: Instagram Reels |
| 10 | **Goal coverage** | **Soft** prompt instruction: spread `trust`, `education`, `local_sale`, `inbound_dm` across week when possible. **Hard:** each slot `goal` ∈ enum; ≥3 slots total |
| 11 | **Modalidad allowlist** | Each slot `modalidad` ∈ `profile.visualModeSummary.allowedModes`. If `visualModeSummary === null` → **fail closed** `PROFILE_INCOMPLETE` before LLM (no Preferencias row) |
| 12 | **Post-parse validation** | After Zod: `formatoPlaybookSlug` ∈ active Playbook slugs; optional `tacticaTendenciaSlug` ∈ active Trend slugs for `weekStart`; `modalidad` ∈ allowlist. Failure → `AGENT_OUTPUT_INVALID`, **no INSERT** |
| 13 | **Rate limit** | **Max 3 successful generates** per `client_id` per rolling **60 minutes**; **max 1 in-flight** per (`client_id`, `week_start`). Over-limit → **429** `RATE_LIMITED` or `GENERATION_IN_FLIGHT`, **no LLM** |
| 14 | **Sync generate** | Blocking Server Action; FE pending state. `maxDuration` / timeout documented in BUILD (lean: 60s) — no job row + poll in V1 |
| 15 | **Read scope** | Latest row only: `ORDER BY version DESC LIMIT 1` for `(client_id, week_start)`. History list deferred US-4.2 |
| 16 | **Prompt delimiters** | `<UNTRUSTED_BUSINESS_PROFILE>`, `<UNTRUSTED_PLAYBOOK_HINTS>`, `<UNTRUSTED_TREND_HINTS>` — see [Prompt containment](#prompt-containment-frozen) |
| 17 | **Logging** | `clientId`, `weekStart`, `version`, provider **key slug**, error **codes** only — never full prompts, profile fields, or LLM raw output |
| 18 | **Out of scope** | US-4.2 edit/approve; Cliente read; US-5.x scripts; US-7.2 budget engine; cron Route Handler; multichannel |

### Strip vs reject (mutation body)

| Keys | Behavior |
|------|----------|
| `weekStart` | **Accept** — `trendWeekStartSchema` |
| `clientId`, `client_id` | **Reject** → `FORBIDDEN_FIELDS` (V1 — server-resolved tenancy) |
| `providerKey`, `provider_key`, `tier`, `envKeyName`, `model` | **Reject** → `FORBIDDEN_FIELDS` |
| `status`, `brief`, `version`, `approved` | **Reject** → `FORBIDDEN_FIELDS` |
| `role`, `auth_user_id` | **Reject** → `FORBIDDEN_FIELDS` |
| Unknown keys | **Reject** → `VALIDATION_ERROR` (`.strict()`) |

---

## Routes — Operator Strategy (**new**)

| Rule | Detail |
|------|--------|
| Page | **`/operator/strategy`** |
| Query | Optional **`weekStart`** = ISO Monday `YYYY-MM-DD`; server normalizes invalid/missing to current week Monday in UI loader |
| Auth | `requireOperator("page")` on RSC (or page calls gated loader first) |
| Cache | `force-dynamic` / `Cache-Control: no-store` |
| Cliente | **No** read path in US-4.1 |
| Rendering | Brief text plain — **no** `dangerouslySetInnerHTML` |

---

## Shared enums and schemas (BUILD: `lib/contracts/content-strategy.ts`)

Reuse imports:

```ts
import { z } from "zod";
import { playbookSlugSchema } from "@/lib/contracts/playbook";
import { trendWeekStartSchema } from "@/lib/contracts/trend";
import { visualModalitySchema } from "@/lib/contracts/visual-preferences";
```

### Strategy status (DB enum)

```ts
export const contentStrategyStatusSchema = z.enum(["draft", "approved"]);
export type ContentStrategyStatus = z.infer<typeof contentStrategyStatusSchema>;
```

**US-4.1 writes:** `draft` only.  
**US-4.2:** may write `approved`.

### Slot goal (business messaging)

Maps USER_STORIES AC: trust, education, local sale, inbound DM.

```ts
export const contentStrategySlotGoalSchema = z.enum([
  "trust",
  "education",
  "local_sale",
  "inbound_dm",
]);
export type ContentStrategySlotGoal = z.infer<typeof contentStrategySlotGoalSchema>;
```

### Day of week (optional per slot)

```ts
export const contentStrategyDayOfWeekSchema = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);
```

### Per-slot brief shape (**frozen**)

Required fields per SPEC-REVIEW: `tema`, `formatoPlaybookSlug`, `modalidad`, `goal`; optional `tacticaTendenciaSlug`.

```ts
export const contentStrategySlotSchema = z
  .object({
    slotIndex: z.number().int().min(0).max(6),
    dayOfWeek: contentStrategyDayOfWeekSchema.optional(),
    tema: z.string().trim().min(1).max(200),
    angle: z.string().trim().min(1).max(300).optional(),
    goal: contentStrategySlotGoalSchema,
    formatoPlaybookSlug: playbookSlugSchema,
    modalidad: visualModalitySchema,
    tacticaTendenciaSlug: playbookSlugSchema.optional(),
    ctaHint: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export type ContentStrategySlot = z.infer<typeof contentStrategySlotSchema>;
```

| Field | Required | Validation |
|-------|----------|------------|
| `slotIndex` | yes | 0-based; unique within `slots[]` (BUILD superRefine) |
| `dayOfWeek` | no | Suggested publish day for Operator planning |
| `tema` | yes | Slot theme / topic headline |
| `angle` | no | Narrative angle |
| `goal` | yes | `trust` \| `education` \| `local_sale` \| `inbound_dm` |
| `formatoPlaybookSlug` | yes | Must ∈ `getPlaybookForAgents().formats[].slug` (post-parse) |
| `modalidad` | yes | Must ∈ `visualModeSummary.allowedModes` (post-parse) |
| `tacticaTendenciaSlug` | no | When present, must ∈ active Trend entries for `weekStart` (post-parse) |
| `ctaHint` | no | Soft CTA direction for downstream Script agent |

### Full brief jsonb shape

```ts
export const contentStrategyBriefSchema = z
  .object({
    pillars: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
    themes: z.array(z.string().trim().min(1).max(200)).min(1).max(8),
    slots: z.array(contentStrategySlotSchema).min(3).max(7),
  })
  .strict()
  .superRefine((brief, ctx) => {
    const indices = brief.slots.map((s) => s.slotIndex);
    if (new Set(indices).size !== indices.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Duplicate slotIndex values",
        path: ["slots"],
      });
    }
  });

export type ContentStrategyBrief = z.infer<typeof contentStrategyBriefSchema>;
```

**LLM output:** parse JSON → `contentStrategyBriefSchema.parse()` → `validateBriefAgainstAllowlists()` → persist.

### Post-parse allowlist validation

```ts
export type BriefAllowlistContext = {
  playbookSlugs: ReadonlySet<string>;
  trendSlugs: ReadonlySet<string>;
  allowedModalidades: ReadonlySet<string>;
};

export type BriefAllowlistViolation = {
  path: string;
  code:
    | "INVALID_PLAYBOOK_SLUG"
    | "INVALID_TREND_SLUG"
    | "MODALIDAD_NOT_ALLOWED";
};

/**
 * Pure validation after Zod parse. Returns [] when valid.
 * Caller maps violations → AGENT_OUTPUT_INVALID with fields.
 */
export function validateBriefAgainstAllowlists(
  brief: ContentStrategyBrief,
  ctx: BriefAllowlistContext,
): BriefAllowlistViolation[];
```

| Check | Rule |
|-------|------|
| Playbook slug | Every `slots[].formatoPlaybookSlug` ∈ `playbookSlugs` from `getPlaybookForAgents()` active formats |
| Trend slug | If `tacticaTendenciaSlug` set, ∈ `trendSlugs` from `getTrendSnapshotForWeek(weekStart).entries[].slug` |
| Modalidad | Every `slots[].modalidad` ∈ `allowedModalidades` from `profile.visualModeSummary!.allowedModes` |

---

## Server Action — `generateContentStrategy` (**new**)

**File (BUILD):** `lib/content-strategy/actions/generate-content-strategy.ts` (`"use server"`)  
**Consumer:** Operator Strategy page — **Generate strategy** button.

**Gate:** `await requireOperator("handler")` — **first** await. Failure → auth envelope, **no** rate limit, **no** LLM, **no** INSERT.

**Input (frozen — V1):**

```ts
export const generateContentStrategyInputSchema = z
  .object({
    weekStart: trendWeekStartSchema,
  })
  .strict();

export type GenerateContentStrategyInput = z.infer<
  typeof generateContentStrategyInputSchema
>;
```

**Tenancy resolution (frozen):**

```ts
const operator = await requireOperator("handler");
const clientId = operator.id; // server-resolved — never from input
```

**Flow:**

1. `requireOperator("handler")`
2. Parse input `weekStart`
3. `checkGenerationRateLimit({ clientId, weekStart })` — on fail → 429
4. `generateContentStrategyForClient({ clientId, weekStart, invokedBy: "operator" })`
5. On success: `revalidatePath("/operator/strategy")`
6. Return success envelope with new row metadata

**Success:**

```ts
export const generateContentStrategySuccessSchema = z
  .object({
    ok: z.literal(true),
    strategyId: z.string().uuid(),
    clientId: z.string().uuid(),
    weekStart: trendWeekStartSchema,
    version: z.number().int().positive(),
    status: z.literal("draft"),
    slotCount: z.number().int().min(3).max(7),
  })
  .strict();
```

---

## Server Action — `getLatestContentStrategy` (**new**)

**File (BUILD):** `lib/content-strategy/actions/get-latest-content-strategy.ts` (`"use server"`)  
**Consumer:** Operator Strategy page — load/read latest draft for selected week.

**Gate:** `await requireOperator("handler")` — **first** await.

**Input:**

```ts
export const getLatestContentStrategyInputSchema = z
  .object({
    weekStart: trendWeekStartSchema,
  })
  .strict();
```

**Tenancy:** `clientId = (await requireOperator("handler")).id`

**Success (found):**

```ts
export const contentStrategyDraftViewSchema = z
  .object({
    id: z.string().uuid(),
    clientId: z.string().uuid(),
    weekStart: trendWeekStartSchema,
    version: z.number().int().positive(),
    status: contentStrategyStatusSchema,
    brief: contentStrategyBriefSchema,
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const getLatestContentStrategyFoundSchema = z
  .object({
    ok: z.literal(true),
    strategy: contentStrategyDraftViewSchema,
    playbookLabels: z.record(playbookSlugSchema, z.string().max(120)).optional(),
  })
  .strict();
```

`playbookLabels` optional map `slug → titulo` for FE display (server-built from `getPlaybookForAgents()` — not stored in DB).

**Not found (empty week — not an error):**

```ts
export const getLatestContentStrategyEmptySchema = z
  .object({
    ok: z.literal(true),
    strategy: z.null(),
  })
  .strict();
```

---

## Server orchestrator — `generateContentStrategyForClient` (**new**)

**File (BUILD):** `lib/content-strategy/generate-content-strategy-for-client.ts` (`import "server-only"`)

**Purpose:** Single entry for Operator action **and** future ADR-0001 weekly cycle (System). **Not** exposed via HTTP in US-4.1.

**Signature (frozen):**

```ts
export type ContentStrategyInvoker = "operator" | "system";

export async function generateContentStrategyForClient(params: {
  clientId: string;
  weekStart: string;
  invokedBy: ContentStrategyInvoker;
}): Promise<GenerateContentStrategyResult>;
```

| `invokedBy` | Caller | Session gate |
|-------------|--------|--------------|
| `"operator"` | `generateContentStrategy` Server Action (after `requireOperator`) | Gated at action boundary |
| `"system"` | Future ciclo semanal orchestration (ADR-0001) | **No** `requireOperator` here; caller must be trusted server job with server-resolved `clientId` |

**Flow (frozen):**

1. Validate `clientId` UUID; validate `weekStart` Monday
2. `getBusinessProfileForAgents(clientId)` — if `!exists` → `PROFILE_INCOMPLETE`; if `loadFailed` → `INTERNAL_ERROR`
3. If `visualModeSummary === null` → `PROFILE_INCOMPLETE` (Preferencias required)
4. `getPlaybookForAgents()` — if `loadFailed`, abort `INTERNAL_ERROR`; empty formats → `AGENT_OUTPUT_INVALID` pre-check (cannot satisfy slug validation)
5. `getTrendSnapshotForWeek(weekStart)` — empty entries OK
6. `getProviderCatalog()` + `getDefaultCostPolicy()` → `resolveProvider(..., { assetRole: "llm", tier, llmVariant: "default" })`
7. `generateWeeklyContentStrategy({ profile, playbook, trend, weekStart, provider })` — LLM call
8. Zod parse brief → `validateBriefAgainstAllowlists()` → on fail `AGENT_OUTPUT_INVALID`
9. Compute `version = coalesce(max(version), 0) + 1` for `(clientId, weekStart)`
10. INSERT `neuramark_content_strategies` (`status = draft`)
11. Record rate-limit success + clear in-flight guard
12. Return success envelope

**Forbidden:** importing this module from Client Components; calling from unauthenticated Route Handler.

---

## Agent module — `generateWeeklyContentStrategy` (**new**)

**File (BUILD):** `lib/agents/content/generate-weekly-strategy.ts` (`import "server-only"`)

**Exports:** `generateWeeklyContentStrategy(params)` — prompt build + LLM adapter + JSON extract + return raw object for orchestrator Zod parse.

**Inputs (all from helpers — mandatory):**

| Input | Source | Notes |
|-------|--------|-------|
| Business profile | `getBusinessProfileForAgents(clientId)` | Delimited `<UNTRUSTED_BUSINESS_PROFILE>` |
| Playbook formatos | `getPlaybookForAgents()` | Delimited `<UNTRUSTED_PLAYBOOK_HINTS>`; slug list for prompt |
| Trend tácticas | `getTrendSnapshotForWeek(weekStart)` | Delimited `<UNTRUSTED_TREND_HINTS>`; may be empty |
| Allowlist rules | `profile.visualModeSummary` | Trusted instruction block (not delimited) |
| Provider | `resolveProvider` result | Adapter reads `envKeyName` |

**Output:** `unknown` JSON object — orchestrator runs `contentStrategyBriefSchema.strict().parse()`.

**Does not:** INSERT to DB; call `requireOperator`; accept browser input.

---

## Prompt containment (frozen)

| Block | Delimiter | Content |
|-------|-----------|---------|
| Ficha viva fields | `<UNTRUSTED_BUSINESS_PROFILE>…</UNTRUSTED_BUSINESS_PROFILE>` | Profile `fields` JSON subset for strategy |
| Playbook hints | `<UNTRUSTED_PLAYBOOK_HINTS>…</UNTRUSTED_PLAYBOOK_HINTS>` | Active formatos (no `ejemplo_referencia`) |
| Trend hints | `<UNTRUSTED_TREND_HINTS>…</UNTRUSTED_TREND_HINTS>` | Active tácticas (no `ejemplo_referencia`) |

**Trusted system instructions (outside delimiters):** Instagram Reels only; ≥3 slots; allowed modalidades list; `mustDiscloseNotOwner` when true; goal enum definitions; respond **JSON only** matching brief schema.

---

## Database

### Migration file name (frozen)

**`supabase/migrations/20260830130000_neuramark_content_strategies.sql`**

Single migration creates both tables (atomic deploy).

### `neuramark_content_strategies`

```sql
CREATE TYPE public.neuramark_content_strategy_status AS ENUM ('draft', 'approved');

CREATE TABLE public.neuramark_content_strategies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES public.neuramark_clients(id),
  week_start  date NOT NULL,
  brief       jsonb NOT NULL,
  status      public.neuramark_content_strategy_status NOT NULL DEFAULT 'draft',
  version     integer NOT NULL CHECK (version >= 1),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT neuramark_content_strategies_client_week_version_unique
    UNIQUE (client_id, week_start, version),
  CONSTRAINT neuramark_content_strategies_brief_is_object_chk
    CHECK (jsonb_typeof(brief) = 'object'),
  CONSTRAINT neuramark_content_strategies_brief_size_chk
    CHECK (pg_column_size(brief) <= 131072)
);

CREATE INDEX neuramark_content_strategies_client_id_week_start_version_idx
  ON public.neuramark_content_strategies (client_id, week_start, version DESC);

CREATE TRIGGER neuramark_content_strategies_set_updated_at
  BEFORE UPDATE ON public.neuramark_content_strategies
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_set_updated_at();

ALTER TABLE public.neuramark_content_strategies ENABLE ROW LEVEL SECURITY;
-- Zero policies. Service-role Node only.
```

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | Strategy row id — downstream US-5.1 references via `strategy_id` |
| `client_id` | uuid FK | Tenancy key — server-set only |
| `week_start` | date | ISO Monday |
| `brief` | jsonb | `contentStrategyBriefSchema` camelCase keys |
| `status` | enum | US-4.1: always `draft` on INSERT |
| `version` | int | Monotonic per `(client_id, week_start)` |

**Regenerate:** INSERT new row; never UPDATE `brief` on existing row; never DELETE.

### `neuramark_agent_rate_limits`

Server-side rate + in-flight tracking (SECURITY floor).

```sql
CREATE TABLE public.neuramark_agent_rate_limits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES public.neuramark_clients(id),
  agent_key     text NOT NULL,
  window_start  timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  in_flight_key text NULL,
  in_flight_at  timestamptz NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT neuramark_agent_rate_limits_client_agent_window_unique
    UNIQUE (client_id, agent_key, window_start)
);

CREATE INDEX neuramark_agent_rate_limits_client_agent_idx
  ON public.neuramark_agent_rate_limits (client_id, agent_key, window_start DESC);

ALTER TABLE public.neuramark_agent_rate_limits ENABLE ROW LEVEL SECURITY;
```

| Constant | Value |
|----------|-------|
| `agent_key` for this story | **`content_strategy_generate`** |
| Rolling window | **60 minutes** |
| Max attempts / window | **3** |
| In-flight key | **`${clientId}:${weekStart}`** — max 1 concurrent generate |

---

## Standard error envelope

```ts
export const contentStrategyErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "RATE_LIMITED",
  "GENERATION_IN_FLIGHT",
  "PROFILE_INCOMPLETE",
  "AGENT_OUTPUT_INVALID",
  "PROVIDER_UNAVAILABLE",
  "FORBIDDEN_FIELDS",
  "INTERNAL_ERROR",
]);

export type ContentStrategyMutationError = {
  ok: false;
  error: {
    code: z.infer<typeof contentStrategyErrorCodeSchema>;
    messageKey?: string;
    fields?: Record<string, string[]>;
  };
};
```

| Code | HTTP lean | `messageKey` | When |
|------|-----------|--------------|------|
| `UNAUTHENTICATED` | 401 | `auth.errors.unauthenticated` | No session |
| `FORBIDDEN` | 403 | `auth.errors.forbidden` | Non-operator / inactive |
| `VALIDATION_ERROR` | 400 | `strategy.errors.validation` | Zod input failure |
| `NOT_FOUND` | 404 | `strategy.errors.notFound` | Strategy id lookup with wrong tenancy (future) |
| `RATE_LIMITED` | 429 | `strategy.errors.rateLimited` | >3 generates / 60 min per `client_id` |
| `GENERATION_IN_FLIGHT` | 429 | `strategy.errors.inFlight` | Concurrent generate same client+week |
| `PROFILE_INCOMPLETE` | 422 | `strategy.errors.profileIncomplete` | No Ficha or no Preferencias allowlist |
| `AGENT_OUTPUT_INVALID` | 422 | `strategy.errors.agentOutputInvalid` | LLM JSON / Zod / allowlist failure |
| `PROVIDER_UNAVAILABLE` | 503 | `strategy.errors.providerUnavailable` | Missing env key / resolve failure |
| `FORBIDDEN_FIELDS` | 400 | `strategy.errors.forbiddenFields` | Smuggled `clientId`, `provider_key`, etc. |
| `INTERNAL_ERROR` | 500 | `strategy.errors.internal` | DB/helper load failure (no leak) |

Page loaders use `requireOperator("page")` redirects — not this JSON envelope.

---

## State transitions

### `neuramark_content_strategies.status`

| From | To | US-4.1 | Owner |
|------|-----|--------|-------|
| — | `draft` | **INSERT on generate** | US-4.1 |
| `draft` | `draft` | **INSERT new version** (regenerate) | US-4.1 |
| `draft` | `approved` | **Forbidden** | US-4.2 |
| `approved` | * | **Immutable** — regenerate still INSERTs new `draft` row; never DELETE `approved` | US-4.2+ |

---

## Fixtures (BUILD / FE mocks / tests)

### `generateContentStrategy` — happy

**Request:**

```json
{ "weekStart": "2026-01-05" }
```

**Response:**

```json
{
  "ok": true,
  "strategyId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "clientId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "weekStart": "2026-01-05",
  "version": 1,
  "status": "draft",
  "slotCount": 3
}
```

### `getLatestContentStrategy` — happy (draft v2)

```json
{
  "ok": true,
  "strategy": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "clientId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "weekStart": "2026-01-05",
    "version": 2,
    "status": "draft",
    "brief": {
      "pillars": ["Confianza local", "Educación práctica"],
      "themes": ["Invierno: mantenimiento preventivo"],
      "slots": [
        {
          "slotIndex": 0,
          "dayOfWeek": "monday",
          "tema": "Por qué revisar antes del frío",
          "goal": "trust",
          "formatoPlaybookSlug": "tip-rapido",
          "modalidad": "faceless",
          "tacticaTendenciaSlug": "cold-open-mejor-toma"
        },
        {
          "slotIndex": 1,
          "dayOfWeek": "wednesday",
          "tema": "3 señales de filtro sucio",
          "goal": "education",
          "formatoPlaybookSlug": "tip-rapido",
          "modalidad": "faceless"
        },
        {
          "slotIndex": 2,
          "dayOfWeek": "friday",
          "tema": "Oferta revisión pre-temporada",
          "goal": "local_sale",
          "formatoPlaybookSlug": "antes-despues",
          "modalidad": "own_avatar",
          "ctaHint": "DM para agendar"
        }
      ]
    },
    "createdAt": "2026-08-30T18:00:00.000Z",
    "updatedAt": "2026-08-30T18:00:00.000Z"
  },
  "playbookLabels": {
    "tip-rapido": "Tip rápido",
    "antes-despues": "Antes y después"
  }
}
```

### `generateContentStrategy` — rate limited

```json
{
  "ok": false,
  "error": {
    "code": "RATE_LIMITED",
    "messageKey": "strategy.errors.rateLimited"
  }
}
```

### `generateContentStrategy` — invalid LLM output (bad playbook slug)

```json
{
  "ok": false,
  "error": {
    "code": "AGENT_OUTPUT_INVALID",
    "messageKey": "strategy.errors.agentOutputInvalid",
    "fields": {
      "slots.0.formatoPlaybookSlug": ["INVALID_PLAYBOOK_SLUG"]
    }
  }
}
```

---

## Unit test matrix (frozen)

| # | Area | Test | Expected |
|---|------|------|----------|
| 1 | Schema | `contentStrategyBriefSchema` accepts valid 3-slot brief | pass |
| 2 | Schema | Rejects &lt;3 slots | `VALIDATION_ERROR` |
| 3 | Schema | Rejects &gt;7 slots | `VALIDATION_ERROR` |
| 4 | Schema | Rejects unknown top-level keys (`.strict()`) | fail parse |
| 5 | Schema | Rejects duplicate `slotIndex` | fail parse |
| 6 | Schema | Each slot requires `tema`, `formatoPlaybookSlug`, `modalidad`, `goal` | fail if missing |
| 7 | Allowlist | Valid playbook slug | `[]` violations |
| 8 | Allowlist | Invalid `formatoPlaybookSlug` | `INVALID_PLAYBOOK_SLUG` |
| 9 | Allowlist | Invalid optional `tacticaTendenciaSlug` | `INVALID_TREND_SLUG` |
| 10 | Allowlist | `modalidad` not in `allowedModes` | `MODALIDAD_NOT_ALLOWED` |
| 11 | Allowlist | Empty trend + no tactica slug on slots | pass |
| 12 | Generate action | Non-operator | 403, no LLM mock call, no INSERT |
| 13 | Generate action | Input with smuggled `clientId` | `FORBIDDEN_FIELDS` |
| 14 | Generate action | Input with `provider_key` | `FORBIDDEN_FIELDS` |
| 15 | Generate action | Happy path | INSERT `version=1`, `status=draft`, ≥3 slots |
| 16 | Generate action | Regenerate same week | INSERT `version=2`; row v1 unchanged |
| 17 | Generate action | 4th generate within 60 min | `RATE_LIMITED`, no LLM |
| 18 | Generate action | Concurrent same client+week | `GENERATION_IN_FLIGHT` |
| 19 | Generate action | Profile `exists: false` | `PROFILE_INCOMPLETE`, no LLM |
| 20 | Generate action | `visualModeSummary === null` | `PROFILE_INCOMPLETE`, no LLM |
| 21 | Read action | Non-operator | 403 |
| 22 | Read action | No row for week | `{ ok: true, strategy: null }` |
| 23 | Read action | v2 exists | Returns v2 not v1 |
| 24 | Orchestrator | `invokedBy: "system"` skips requireOperator | calls agent when profile OK |
| 25 | Agent module | `import "server-only"` present | static check |
| 26 | Agent module | Mocks prove calls to 4 helpers, not raw tables | spy assertions |
| 27 | Provider | Uses `resolveProvider` with `llmVariant: "default"` | `siliconflow_deepseek_flash` |
| 28 | Provider | Missing env key | `PROVIDER_UNAVAILABLE` |
| 29 | DB | RLS enabled, zero policies on both tables | migration assert |
| 30 | Security | Invalid LLM JSON | `AGENT_OUTPUT_INVALID`, no INSERT |
| 31 | Security | No full prompt in logs | logger mock assert |

---

## Acceptance criteria mapping (CONTRACT closes SPEC-REVIEW gaps)

| USER_STORIES / SPEC obligation | CONTRACT surface |
|-------------------------------|------------------|
| ≥3 Reel slots + goals | `contentStrategyBriefSchema.slots.min(3)` + `goal` enum |
| `getBusinessProfileForAgents` only | Orchestrator step 2; BUILD veto on interview SELECT |
| **`getPlaybookForAgents()` mandatory** | Orchestrator step 4; agent prompt; slug validation |
| **`getTrendSnapshotForWeek()` mandatory** | Orchestrator step 5; optional tactica per slot |
| Modalidad ⊆ allowlist | `validateBriefAgainstAllowlists` + `PROFILE_INCOMPLETE` if null summary |
| Regenerate versioning | INSERT `version+1`; never DELETE |
| Operator-only generate/read | `requireOperator` on both Server Actions |
| System cron path (ADR-0001) | `generateContentStrategyForClient({ invokedBy: "system" })` — no HTTP US-4.1 |
| LLM via catalog low tier | `resolveProvider` + `llmVariant: "default"` |
| Rate limit per client | `neuramark_agent_rate_limits` 3/60min + in-flight |
| Instagram only | No channel field; prompt instruction; reject multichannel keys |
| `neuramark_content_strategies` | Migration frozen |

---

## Out of scope (explicit)

| Item | Story |
|------|-------|
| Edit brief fields / Approve CTA | US-4.2 |
| Cliente read-only Estrategia semanal | US-4.2 or follow-on |
| `neuramark_reel_scripts` | US-5.1 |
| Cost policy engine / spend audit | US-7.2 |
| Weekly cycle cron Route Handler | integrations / ADR-0001 consumer |
| Operator multi-client picker (authoritative body `clientId`) | Future — V1 session `clientId` only |
| Strategy history list UI | US-4.2 |

---

## FE signoff checklist

- [ ] `/operator/strategy` + `weekStart` query documented
- [ ] `generateContentStrategy({ weekStart })` — no `clientId` in form payload
- [ ] `getLatestContentStrategy({ weekStart })` read envelope + empty state
- [ ] Error codes + `messageKey` wired in `messages/en.json` / `es.json`
- [ ] Brief slot cards: `tema`, formato label, modalidad, optional táctica, goal tag
- [ ] Version indicator when `version > 1`
- [ ] No Approve button; no edit fields; no Cliente route

**Reviewed by FE:** _pending_
