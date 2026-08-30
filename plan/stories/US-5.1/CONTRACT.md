# API Contract — US-5.1 Generate Reel script package per slot

**Story:** US-5.1  
**Status:** Frozen — 2026-08-30 (awaiting FE signoff)  
**Security:** `plan/stories/US-5.1/SECURITY.md` (APPROVE WITH CONDITIONS — binding freeze; do not reopen)  
**Spec review:** `plan/stories/US-5.1/SPEC-REVIEW.md` (GAPS — resolved by this contract)  
**Depends on:** US-4.2 ✅ `getApprovedStrategyForWeek` · `approveContentStrategy` · US-4.1 ✅ brief slot shape · US-3.4 ✅ `visualModeSummary.mustDiscloseNotOwner` · US-16.1 ✅ `getPlaybookForAgents()` · US-16.2 ✅ `getTrendSnapshotForWeek()` · US-X.4 ✅ `resolveProvider({ llmVariant: "fallback" })` → `siliconflow_qwen` · US-14.5 ✅ `requireOperator()`  
**Identity seam:** `lib/auth/get-current-user.ts` / `requireOperator()` (unchanged)  
**Error envelope style:** same class as US-4.1 / US-4.2 (`ok: true` vs `{ ok: false, error: { code, fields?, messageKey? } }`)

**This document is CONTRACT ONLY.** Zod below is the BUILD sketch for `lib/contracts/reel-script.ts`, server modules under `lib/reel-scripts/`, `lib/agents/content/generate-reel-script.ts`, and `lib/reel-scripts/reel-scripts.test.ts`.

**Terminology:** **Paquete de guion** (ES) / **Reel script** (EN product chrome) · **Estrategia semanal** · **Formato de Reel** · **Modalidad de producción** · **Táctica de tendencia** · **Operator** · **Ficha viva**. Technical enums (`hook`, `voiceover_text`, `generic_avatar`, `strategy_id`) OK in code/DB. Do **not** use CONTEXT _Evitar_ terms in product-facing strings.

**SPEC-REVIEW blocking gaps closed in this contract:**

| # | Gap | Resolution |
|---|-----|------------|
| 1 | Playbook + Trend hints missing from AC | **Five-helper pipeline frozen** — agent orchestrator **MUST** call `getBusinessProfileForAgents`, `getPlaybookForAgents`, `getTrendSnapshotForWeek`, `getProviderCatalog` + `resolveProvider` before any per-slot LLM call; per slot resolve `formatoPlaybookSlug` → `guionHints` / `editingHints` / `duracionIdealSeg` and optional `tacticaTendenciaSlug` → táctica hints |
| 2 | Paquete de guion schema under-specified | **`reelScriptPackageSchema.strict()`** — required hook/body/cta/onScreenText/voiceoverText/targetDurationSec; optional `brollBeats[]`, `coldOpenNotes`, `editingNotes`; persisted to DB columns (see [Database](#database)) |
| 3 | Global visual mode vs per-slot `modalidad` | Each job reads **`slot.modalidad`** from approved brief (trusted server copy); **`mustDiscloseForSlot`** = `slot.modalidad === 'generic_avatar' && profile.visualModeSummary.mustDiscloseNotOwner === true`; persisted **`must_disclose_not_owner`** column = that server-computed boolean — never from request or LLM |
| 4 | Dual-path approval gate (ADR-0001) | **Operator path (BUILD):** `invokedBy: "operator"` requires **`status = 'approved'`** via `getApprovedStrategyForWeek` + `loadApprovedStrategyForScriptJob`. **System path (deferred):** `generateReelScriptsForClient({ invokedBy: "system" })` documented for integrations-engineer — **not** implemented in US-5.1 BUILD; no draft-bypass in this story |
| 5 | DB `reel_scripts` → `neuramark_reel_scripts` + tenancy | Migration **`20260830300000_neuramark_reel_scripts.sql`** — `client_id` FK, `strategy_id` FK, UNIQUE `(strategy_id, slot_index)`, RLS deny-by-default |

---

## Overview

An authenticated **Operator** triggers **Paquete de guion** generation for each Reel slot on an **approved Estrategia semanal** for a selected ISO week. The server:

1. Gates **generate**, **regenerate**, and **read** with `requireOperator()` — 401/403, **no side effects** on failure.
2. Resolves **`clientId` server-side only** (V1: `getCurrentUser().id` after operator gate — **no** authoritative `clientId` in request body).
3. Loads approved strategy via **`getApprovedStrategyForWeek({ clientId, weekStart })`** then defense-in-depth **`loadApprovedStrategyForScriptJob({ strategyId, clientId })`** — draft/missing → **`STRATEGY_NOT_APPROVED`**, **no LLM**.
4. Assembles agent inputs via **five-helper pipeline** (profile, playbook, trend, provider catalog + policy, approved strategy brief).
5. Runs **one LLM call per slot** (`generateReelScriptForSlot`); delimited untrusted blocks; Zod **`.strict()`** on output; UPSERT into **`neuramark_reel_scripts`**.
6. Sets **`must_disclose_not_owner`** and **`modalidad`** from server-trusted sources at persist — never from client or LLM authority fields.
7. Wires **`strategyHasScripts(strategyId)`** real EXISTS query — enables US-4.2 lock-after-scripts.

**Instagram Reels only** — no multichannel fields; reject unknown keys via `.strict()`.

**Surfaces**

| # | Surface | Kind | New vs reused |
|---|---------|------|---------------|
| 1 | `/operator/scripts` | RSC Operator page | **New** — Paquete de guion workspace |
| 2 | `generateReelScripts` | Server Action | **New** — batch all slots |
| 3 | `regenerateReelScriptSlot` | Server Action | **New** — single slot |
| 4 | `getReelScriptsForWeek` | Server Action | **New** — list + slot metadata |
| 5 | `generateReelScriptsForClient` | Server-only orchestrator | **New** — shared by actions + future ADR-0001 cron |
| 6 | `loadApprovedStrategyForScriptJob` | Server-only helper | **New** — IDOR-safe approved row load |
| 7 | `generateReelScriptForSlot` | Server-only agent module | **New** — `lib/agents/content/generate-reel-script.ts` |
| 8 | `strategyHasScripts` | Server-only helper | **Extended** — replace stub with EXISTS query |
| 9 | Zod + types | `lib/contracts/reel-script.ts` | **New** |
| 10 | Migration | `neuramark_reel_scripts` | **New** |

**Forbidden surfaces (BUILD veto):**

- Public Route Handler (`/api/reel-scripts`, generate/status poll, cron webhook).
- HTTP exposure of `generateReelScriptsForClient` or `generateReelScriptForSlot`.
- Client Component import of agent/orchestrator modules.
- Cliente read UI/API for scripts (deferred US-11.x Aprobación package).
- Operator inline edit of hook/body/CTA — regenerate only.
- Direct SELECT on profile/playbook/trend/strategy tables from agent module.
- Request fields: `clientId`, `provider_key`, `mustDiscloseNotOwner`, script text fields as authority.
- `neuramark_reel_captions`, video/TTS/assembly job tables (US-6.x / US-8.x / US-9.x).

**Why Server Actions (not Route Handlers):** UI-coupled Operator generate/read under `(app)/operator`; CSRF via Next.js origin check; no public REST API (SECURITY freeze). System cron (ADR-0001) calls **server-only** `generateReelScriptsForClient` — not HTTP in US-5.1.

**Frontend consumers**

| Consumer | Route | Contract surface |
|----------|-------|------------------|
| Scripts page | `app/(app)/operator/scripts/page.tsx` | Initial load: `getReelScriptsForWeek({ weekStart })` |
| Week picker | Scripts page Client island | `weekStart` ISO Monday; default current week Monday |
| Script list | Scripts page | Rows per slot: tema, day, `targetDurationSec`, generated/pending badge |
| Expand / detail panel | Scripts page | hook, body, cta, onScreenText, voiceoverText; optional coldOpenNotes, editingNotes, brollBeats |
| Copy-to-clipboard | Scripts page | Per field + toast |
| Generate scripts | Scripts page | `generateReelScripts({ weekStart })` when approved strategy exists |
| Regenerate this Reel | Scripts page per row | `regenerateReelScriptSlot({ weekStart, slotIndex })` |
| Link from Strategy | `/operator/strategy` when `status = approved` | Navigate to `/operator/scripts?weekStart=…` |
| Nav | Operator nav (FE) | EN **Scripts** / ES **Guiones** → `/operator/scripts` |

**Server-only modules (planned BUILD)**

| Module | Purpose |
|--------|---------|
| `lib/reel-scripts/actions/generate-reel-scripts.ts` | `"use server"` `generateReelScripts` |
| `lib/reel-scripts/actions/regenerate-reel-script-slot.ts` | `"use server"` `regenerateReelScriptSlot` |
| `lib/reel-scripts/actions/get-reel-scripts-for-week.ts` | `"use server"` `getReelScriptsForWeek` |
| `lib/reel-scripts/generate-reel-scripts-for-client.ts` | `import "server-only"` orchestrator |
| `lib/reel-scripts/load-approved-strategy-for-script-job.ts` | `import "server-only"` approved strategy loader |
| `lib/reel-scripts/persist-reel-script.ts` | `import "server-only"` UPSERT helper |
| `lib/reel-scripts/check-script-generation-rate-limit.ts` | `import "server-only"` rate + in-flight |
| `lib/reel-scripts/list-reel-scripts-for-strategy.ts` | `import "server-only"` SELECT + join brief metadata |
| `lib/agents/content/generate-reel-script.ts` | `import "server-only"` per-slot LLM prompt + parse |
| `lib/contracts/reel-script.ts` | Zod + types |
| `lib/content-strategy/strategy-has-scripts.ts` | **Update** — real EXISTS query |

---

## Frozen decisions (from SECURITY.md + SPEC-REVIEW + PO TASKS)

Do not reopen.

| # | Topic | Freeze |
|---|-------|--------|
| 1 | **Operator route** | **`/operator/scripts`** — query `?weekStart=YYYY-MM-DD` (ISO Monday). `requireOperator("page")` on RSC; `force-dynamic` / `Cache-Control: no-store` |
| 2 | **Tenancy (V1)** | `clientId` = **`getCurrentUser().id`** after `requireOperator()` on generate/read actions. Request schema **`{ weekStart }`** (+ `slotIndex` on regen) — no authoritative `clientId` |
| 3 | **Dual invoke path** | **Operator:** actions → `generateReelScriptsForClient({ clientId, weekStart, invokedBy: "operator", mode: "batch" \| "slot", slotIndex? })`. **System (ADR-0001, not built US-5.1):** trusted orchestration calls same helper with `invokedBy: "system"` — **no** `requireOperator` inside helper; **no** HTTP surface; **approval gate for system path deferred** to integrations-engineer CONTRACT |
| 4 | **Approval gate (Operator)** | `getApprovedStrategyForWeek` must return row; then `loadApprovedStrategyForScriptJob` re-verifies `status = 'approved'` + `client_id` on that `strategyId`. Missing/draft → **`STRATEGY_NOT_APPROVED`**, no LLM |
| 5 | **Agent inputs (mandatory five-helper pipeline)** | **`getBusinessProfileForAgents(clientId)`** · **`getPlaybookForAgents()`** · **`getTrendSnapshotForWeek(weekStart)`** · **`getProviderCatalog()`** + **`getDefaultCostPolicy()`** · **approved strategy brief** via `loadApprovedStrategyForScriptJob`. Abort before LLM if profile `exists: false` or `visualModeSummary === null` → **`PROFILE_INCOMPLETE`** |
| 6 | **LLM provider** | `resolveProvider(catalog, { assetRole: "llm", tier: policy.providerTier, llmVariant: "fallback" })` → **`siliconflow_qwen`**. Keys via `process.env[row.envKeyName]` only |
| 7 | **Locale** | Generate copy in profile `preferredLocale` when `en` \| `es`; else **`es`** (prompt instruction) |
| 8 | **LLM calls** | **One call per slot** — batch loops `brief.slots[]`; single-slot regen calls one slot only |
| 9 | **Batch atomicity** | Batch generate runs in **single transaction** — all slots UPSERT or **none** on any slot agent/validation failure; return **`SCRIPT_OUTPUT_INVALID`** with `fields.slotIndex` on failure |
| 10 | **Persistence** | **UPSERT** on `(strategy_id, slot_index)` — regenerate replaces row; no DELETE; no version history in V1 |
| 11 | **Per-slot `modalidad`** | Read from approved brief slot at job time; persist denormalized **`modalidad`** column from server brief — never from request or LLM |
| 12 | **Per-slot disclosure** | **`mustDiscloseForSlot`** = `slot.modalidad === 'generic_avatar' && profile.visualModeSummary.mustDiscloseNotOwner === true`. Optional prompt: `buildGenericDisclosurePromptHint(mustDiscloseForSlot, locale)`. Persist **`must_disclose_not_owner`** = `mustDiscloseForSlot` in same UPSERT — never from request/LLM |
| 13 | **Playbook/trend hints** | Per slot: resolve `formatoPlaybookSlug` → formato `guionHints`, `editingHints`, `duracionIdealSeg`, `ctaTipo`; optional `tacticaTendenciaSlug` → táctica `guionHints`, `editingHints`. Injected in delimited untrusted blocks — not stored as separate hint snapshot columns |
| 14 | **Duration** | `targetDurationSec` integer **15–45** inclusive; Zod + DB CHECK; prompt uses playbook `duracionIdealSeg` as hint when present |
| 15 | **Script field bounds** | See [Paquete de guion schema](#paquete-de-guion-schema-frozen); plain text only — no HTML |
| 16 | **Rate limit** | **Max 5** successful batch/regen job attempts per `client_id` per rolling **60 minutes** (`agent_key = video_script_generate`); **max 1 in-flight** batch per (`client_id`, `strategy_id`); **max 1 in-flight** regen per (`client_id`, `strategy_id`, `slot_index`). Over-limit → **`RATE_LIMITED`**, no LLM |
| 17 | **Sync generate** | Blocking Server Action; FE pending state. `maxDuration` lean **120s** on batch action (N slots × ~15s budget) |
| 18 | **`strategyHasScripts`** | `EXISTS (SELECT 1 FROM neuramark_reel_scripts WHERE strategy_id = $1)` — replaces stub; US-4.2 lock engages when `NEURAMARK_STRATEGY_LOCK_AFTER_SCRIPTS !== 'false'` |
| 19 | **Strategy version drift** | Scripts FK `strategy_id` to row used at generation. If newer approved version supersedes, list shows scripts for **current** `getApprovedStrategyForWeek` id only — FE shows warning when script `strategy_id` ≠ current approved id (`messageKey: scripts.errors.strategyVersionChanged`) |
| 20 | **revalidatePath** | `revalidatePath("/operator/scripts")` and `revalidatePath("/operator/strategy")` after successful generate/regen |
| 21 | **Logging** | `strategyId`, `clientId`, `slotIndex`, action, error **codes**, provider **key slug** only — never full prompts or script bodies |
| 22 | **Out of scope** | US-5.2 length warnings UI; US-6.x captions; US-7.1 budget pre-check; US-8.x/9.x video; Cliente read; Operator inline edit; cron scheduler implementation |

### Strip vs reject (mutation bodies)

| Keys | Behavior |
|------|----------|
| `weekStart` | **Accept** — `trendWeekStartSchema` |
| `slotIndex` | **Accept** on `regenerateReelScriptSlot` only — integer 0–6 |
| `clientId`, `client_id`, `strategyId`, `strategy_id` | **Reject** → `FORBIDDEN_FIELDS` (V1 — server resolves strategy from week + approved lookup) |
| `providerKey`, `provider_key`, `tier`, `envKeyName`, `model` | **Reject** → `FORBIDDEN_FIELDS` |
| `status`, `approved`, `mustDiscloseNotOwner`, `must_disclose_not_owner`, `ruleFlags` | **Reject** → `FORBIDDEN_FIELDS` |
| `hook`, `body`, `cta`, `onScreenText`, `voiceoverText`, `on_screen_text`, `voiceover_text`, `targetDurationSec`, `brollBeats`, `coldOpenNotes`, `editingNotes` | **Reject** → `FORBIDDEN_FIELDS` |
| `brief`, `modalidad`, `invokedBy` | **Reject** → `FORBIDDEN_FIELDS` |
| `role`, `auth_user_id` | **Reject** → `FORBIDDEN_FIELDS` |
| Unknown keys | **Reject** → `VALIDATION_ERROR` (`.strict()`) |

---

## Dual-path approval gate (ADR-0001 reconciliation)

| Path | Caller | Approval requirement | US-5.1 BUILD scope |
|------|--------|---------------------|-------------------|
| **A — Operator manual** | `generateReelScripts` / `regenerateReelScriptSlot` after `requireOperator` | **`getApprovedStrategyForWeek`** + **`loadApprovedStrategyForScriptJob`** — `status = 'approved'` | **Implemented** |
| **B — System/cron** | ADR-0001 weekly cycle (`generateReelScriptsForClient({ invokedBy: "system" })`) | SPEC auto-avance: may continue on `draft` or via future auto-approve — **owned by integrations-engineer** | **Deferred** — orchestrator signature + gate hook documented; **no cron wiring in US-5.1** |

**Operator path rule (frozen):** Public Server Actions **always** require approved strategy. System path **must not** be callable from browser-exposed actions without `requireOperator`.

---

## Five-helper input pipeline (frozen)

Orchestrator `generateReelScriptsForClient` **MUST** load shared inputs once per job, then loop slots:

| # | Helper | Purpose | Abort condition |
|---|--------|---------|-----------------|
| 1 | `getBusinessProfileForAgents(clientId)` | Tone, locale, zone, `visualModeSummary` | `!exists` or `visualModeSummary === null` → `PROFILE_INCOMPLETE` |
| 2 | `getPlaybookForAgents()` | Resolve `formatoPlaybookSlug` per slot | `loadFailed` → `INTERNAL_ERROR`; empty formats → pre-check failure |
| 3 | `getTrendSnapshotForWeek(weekStart)` | Resolve optional `tacticaTendenciaSlug` per slot | `loadFailed` → `INTERNAL_ERROR`; empty entries OK |
| 4 | `getProviderCatalog()` + `getDefaultCostPolicy()` + `resolveProvider(..., llmVariant: "fallback")` | LLM adapter | resolve/adapter failure → `PROVIDER_UNAVAILABLE` |
| 5 | `loadApprovedStrategyForScriptJob({ strategyId, clientId })` | Approved brief + slots | null → `STRATEGY_NOT_APPROVED` |

Agent module **`generateReelScriptForSlot`** receives **pre-loaded** helper results + one slot — **does not** call Supabase or re-fetch helpers per slot (orchestrator owns pipeline).

**Per-slot context assembly (frozen):**

```ts
type ReelScriptSlotContext = {
  slot: ContentStrategySlot; // from approved brief
  formatoHints: {
    guionHints: string;
    editingHints: string;
    duracionIdealSeg: number | null;
    ctaTipo: string | null;
  };
  tacticaHints: {
    guionHints: string;
    editingHints: string;
  } | null;
  mustDiscloseForSlot: boolean;
  modalidad: VisualModality; // from slot.modalidad
};
```

---

## Routes — Operator Scripts (**new**)

| Rule | Detail |
|------|--------|
| Page | **`/operator/scripts`** |
| Query | **`weekStart`** = ISO Monday `YYYY-MM-DD`; server normalizes invalid/missing to current week Monday |
| Auth | `requireOperator("page")` on RSC |
| Cache | `force-dynamic` / `Cache-Control: no-store` |
| Cliente | **No** read path in US-5.1 |
| Rendering | Script text plain — **no** `dangerouslySetInnerHTML` |

---

## Paquete de guion schema (frozen)

**BUILD:** `lib/contracts/reel-script.ts`

```ts
import { z } from "zod";
import { visualModalitySchema } from "@/lib/contracts/visual-preferences";
import { trendWeekStartSchema } from "@/lib/contracts/trend";

export const reelScriptBrollBeatSchema = z
  .string()
  .trim()
  .min(1)
  .max(300);

/** LLM agent output + persisted package shape (camelCase in TS). */
export const reelScriptPackageSchema = z
  .object({
    hook: z.string().trim().min(1).max(300),
    body: z.string().trim().min(1).max(2000),
    cta: z.string().trim().min(1).max(200),
    onScreenText: z.string().trim().min(1).max(500),
    voiceoverText: z.string().trim().min(1).max(2000),
    targetDurationSec: z.number().int().min(15).max(45),
    brollBeats: z.array(reelScriptBrollBeatSchema).max(8).optional(),
    coldOpenNotes: z.string().trim().min(1).max(500).optional(),
    editingNotes: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

export type ReelScriptPackage = z.infer<typeof reelScriptPackageSchema>;
```

| Field | Required | Max | Notes |
|-------|----------|-----|-------|
| `hook` | yes | 300 | Opening hook |
| `body` | yes | 2000 | Main script body / cuerpo |
| `cta` | yes | 200 | Call to action |
| `onScreenText` | yes | 500 | On-screen text; newlines OK for beat lines (US-5.2 adds char warnings) |
| `voiceoverText` | yes | 2000 | Voiceover narration |
| `targetDurationSec` | yes | 15–45 | Integer seconds |
| `brollBeats` | no | 8 × 300 chars | Visual B-roll beat descriptions when playbook/trend/editing hints apply |
| `coldOpenNotes` | no | 500 | Cold open / rewind assembly notes when `editingHints` indicate |
| `editingNotes` | no | 1000 | Additional editing guidance from playbook/trend hints |

**Server-only fields (not in LLM output schema):** `modalidad`, `mustDiscloseNotOwner` — set by orchestrator at persist from approved brief + profile.

---

## Shared action schemas (BUILD: `lib/contracts/reel-script.ts`)

```ts
export const generateReelScriptsInputSchema = z
  .object({
    weekStart: trendWeekStartSchema,
  })
  .strict();

export const regenerateReelScriptSlotInputSchema = z
  .object({
    weekStart: trendWeekStartSchema,
    slotIndex: z.number().int().min(0).max(6),
  })
  .strict();

export const getReelScriptsForWeekInputSchema = z
  .object({
    weekStart: trendWeekStartSchema,
  })
  .strict();

export type ReelScriptInvoker = "operator" | "system";
```

---

## Server Action — `generateReelScripts` (**new**)

**File (BUILD):** `lib/reel-scripts/actions/generate-reel-scripts.ts`

**Consumer:** Operator Scripts page — **Generate scripts** (batch all slots).

**Gate:** `await requireOperator("handler")` — **first** await.

**Input:** `generateReelScriptsInputSchema`

**Tenancy:** `clientId = (await requireOperator("handler")).id`

**Flow:**

1. `requireOperator("handler")`
2. Parse input; forbidden-key scan → `FORBIDDEN_FIELDS`
3. Rate limit + in-flight guard (`video_script_generate`)
4. `getApprovedStrategyForWeek({ clientId, weekStart })` — null → `STRATEGY_NOT_APPROVED`
5. `generateReelScriptsForClient({ clientId, weekStart, strategyId: approved.id, invokedBy: "operator", mode: "batch" })`
6. `revalidatePath("/operator/scripts")`; `revalidatePath("/operator/strategy")`
7. Return success envelope

**Success:**

```ts
export const generateReelScriptsSuccessSchema = z
  .object({
    ok: z.literal(true),
    strategyId: z.string().uuid(),
    weekStart: trendWeekStartSchema,
    slotCount: z.number().int().min(1).max(7),
    scriptIds: z.array(z.string().uuid()),
  })
  .strict();
```

---

## Server Action — `regenerateReelScriptSlot` (**new**)

**File (BUILD):** `lib/reel-scripts/actions/regenerate-reel-script-slot.ts`

**Consumer:** Operator Scripts page — **Regenerate this Reel** per row.

**Gate:** `await requireOperator("handler")` — **first** await.

**Input:** `regenerateReelScriptSlotInputSchema`

**Flow:** Same gates as batch; `mode: "slot"`, `slotIndex`; validates slot exists on approved brief → else **`SLOT_NOT_FOUND`**.

**Success:**

```ts
export const regenerateReelScriptSlotSuccessSchema = z
  .object({
    ok: z.literal(true),
    strategyId: z.string().uuid(),
    weekStart: trendWeekStartSchema,
    slotIndex: z.number().int().min(0).max(6),
    scriptId: z.string().uuid(),
  })
  .strict();
```

---

## Server Action — `getReelScriptsForWeek` (**new**)

**File (BUILD):** `lib/reel-scripts/actions/get-reel-scripts-for-week.ts`

**Consumer:** Operator Scripts page — initial load + week picker refresh.

**Gate:** `await requireOperator("handler")` — **first** await.

**Input:** `getReelScriptsForWeekInputSchema`

**Success (approved strategy exists):**

```ts
export const reelScriptListItemSchema = z
  .object({
    scriptId: z.string().uuid().nullable(),
    slotIndex: z.number().int().min(0).max(6),
    tema: z.string(),
    dayOfWeek: z.string().optional(),
    goal: z.string(),
    formatoPlaybookSlug: z.string(),
    modalidad: visualModalitySchema,
    targetDurationSec: z.number().int().min(15).max(45).nullable(),
    status: z.enum(["pending", "generated"]),
    package: reelScriptPackageSchema.nullable(),
    mustDiscloseNotOwner: z.boolean().nullable(),
  })
  .strict();

export const getReelScriptsForWeekSuccessSchema = z
  .object({
    ok: z.literal(true),
    weekStart: trendWeekStartSchema,
    approvedStrategy: z
      .object({
        id: z.string().uuid(),
        version: z.number().int().positive(),
        status: z.literal("approved"),
      })
      .nullable(),
    strategyVersionChanged: z.boolean(),
    items: z.array(reelScriptListItemSchema),
  })
  .strict();
```

| `approvedStrategy` | `items` | UX |
|--------------------|---------|-----|
| `null` | `[]` | Empty state — approve strategy first |
| present, no scripts | slots from brief, all `status: "pending"` | Empty state — generate scripts |
| present, partial/full scripts | merged list | Show expand/copy |

**`strategyVersionChanged`:** `true` when any script row `strategy_id` ≠ current approved strategy id (orphaned scripts from prior approved version).

---

## Server helper — `loadApprovedStrategyForScriptJob` (**new**)

**File (BUILD):** `lib/reel-scripts/load-approved-strategy-for-script-job.ts` (`import "server-only"`)

**Purpose:** Caller-independent approved-strategy verification before every agent invoke and UPSERT.

```ts
export type ApprovedStrategyForScript = {
  id: string;
  clientId: string;
  weekStart: string;
  version: number;
  status: "approved";
  brief: ContentStrategyBrief;
};

export async function loadApprovedStrategyForScriptJob(params: {
  strategyId: string;
  clientId: string;
}): Promise<ApprovedStrategyForScript | null> {
  // SELECT ... WHERE id = strategyId AND client_id = clientId AND status = 'approved'
  // Parse brief with contentStrategyBriefSchema.strict()
}
```

| Rule | Detail |
|------|--------|
| Used by | Batch generate, single-slot regen, future system orchestrator |
| Failure | `null` → action maps to **`STRATEGY_NOT_APPROVED`** (same tenant) or **`NOT_FOUND`** (cross-tenant — uniform 404) |
| Not sufficient alone | Operator actions also use `getApprovedStrategyForWeek` to resolve **current** approved row for `weekStart` |

---

## Server orchestrator — `generateReelScriptsForClient` (**new**)

**File (BUILD):** `lib/reel-scripts/generate-reel-scripts-for-client.ts` (`import "server-only"`)

**Purpose:** Single entry for Operator actions **and** future ADR-0001 weekly cycle (System). **Not** exposed via HTTP in US-5.1.

```ts
export async function generateReelScriptsForClient(params: {
  clientId: string;
  weekStart: string;
  strategyId: string;
  invokedBy: ReelScriptInvoker;
  mode: "batch" | "slot";
  slotIndex?: number;
}): Promise<GenerateReelScriptsResult>;
```

| `invokedBy` | Caller | Session gate | Approval |
|-------------|--------|--------------|----------|
| `"operator"` | Server Actions (after `requireOperator`) | Gated at action boundary | **`loadApprovedStrategyForScriptJob`** — `approved` required |
| `"system"` | Future ciclo semanal (integrations-engineer) | **No** `requireOperator` here | **Deferred** — separate gate in integrations CONTRACT; US-5.1 BUILD does not invoke this path |

**Flow (frozen):**

1. Validate UUIDs + `weekStart` Monday
2. Five-helper pipeline (profile, playbook, trend, provider) — abort codes per frozen decisions
3. `loadApprovedStrategyForScriptJob({ strategyId, clientId })` — null → `STRATEGY_NOT_APPROVED`
4. Verify `strategy.weekStart === weekStart` — mismatch → `VALIDATION_ERROR`
5. Determine slot list: batch = all `brief.slots[]`; slot = one `slotIndex` validated against brief
6. **Begin transaction**
7. For each slot: build `ReelScriptSlotContext` → `generateReelScriptForSlot(...)` → `reelScriptPackageSchema.strict().parse()` → on fail **rollback** → `SCRIPT_OUTPUT_INVALID`
8. UPSERT `neuramark_reel_scripts` with package fields + `modalidad` + `must_disclose_not_owner` + `client_id`
9. **Commit transaction**; record rate-limit success; release in-flight guard
10. Return success envelope

**Forbidden:** importing from Client Components; unauthenticated Route Handler entry.

---

## Agent module — `generateReelScriptForSlot` (**new**)

**File (BUILD):** `lib/agents/content/generate-reel-script.ts` (`import "server-only"`)

**Exports:** `generateReelScriptForSlot(params)` — prompt build + LLM adapter + JSON extract → raw object for orchestrator Zod parse.

**Inputs (from orchestrator — mandatory):**

| Input | Source | Notes |
|-------|--------|-------|
| Business profile | `getBusinessProfileForAgents` (orchestrator) | Delimited `<UNTRUSTED_BUSINESS_PROFILE>` |
| Slot + formato/táctica hints | Orchestrator-resolved `ReelScriptSlotContext` | Delimited `<UNTRUSTED_SLOT_BRIEF>`, `<UNTRUSTED_FORMATO_HINTS>`, `<UNTRUSTED_TACTICA_HINTS>` |
| `modalidad` | Approved brief slot | Trusted instruction block |
| `mustDiscloseForSlot` | Server-computed | Trusted instruction + optional `buildGenericDisclosurePromptHint` |
| Provider | `resolveProvider` fallback result | Adapter reads `envKeyName` |

**Output:** `unknown` JSON — orchestrator runs `reelScriptPackageSchema.strict().parse()`.

**Does not:** UPSERT DB; call `requireOperator`; accept browser input; SELECT Supabase tables directly.

### Prompt containment (frozen)

| Block | Delimiter | Content |
|-------|-----------|---------|
| Ficha viva | `<UNTRUSTED_BUSINESS_PROFILE>…</UNTRUSTED_BUSINESS_PROFILE>` | Profile `fields` subset |
| Slot brief | `<UNTRUSTED_SLOT_BRIEF>…</UNTRUSTED_SLOT_BRIEF>` | `tema`, `angle`, `goal`, `ctaHint` |
| Formato hints | `<UNTRUSTED_FORMATO_HINTS>…</UNTRUSTED_FORMATO_HINTS>` | `guionHints`, `editingHints`, `duracionIdealSeg`, `ctaTipo` |
| Táctica hints | `<UNTRUSTED_TACTICA_HINTS>…</UNTRUSTED_TACTICA_HINTS>` | Optional táctica hints; empty block OK |

**Trusted system instructions (outside delimiters):** Instagram Reels; `modalidad` for slot; `mustDiscloseForSlot` when true; duration 15–45s; JSON only matching `reelScriptPackageSchema`; include `brollBeats` / `coldOpenNotes` / `editingNotes` when playbook `editingHints` reference cold open, rewind, or B-roll structure.

---

## `strategyHasScripts` — real implementation (**extended**)

**File (BUILD):** `lib/content-strategy/strategy-has-scripts.ts`

```ts
export async function strategyHasScripts(strategyId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return false;
  }
  // EXISTS (SELECT 1 FROM neuramark_reel_scripts WHERE strategy_id = $1)
}
```

| Rule | Detail |
|------|--------|
| US-4.2 effect | When `true` + `isStrategyLockAfterScriptsEnabled()` → `updateContentStrategyBrief` returns **`STRATEGY_LOCKED`** |
| Test | Insert script row → `strategyHasScripts(strategyId) === true` |

---

## Database

### Migration file name (frozen)

**`supabase/migrations/20260830300000_neuramark_reel_scripts.sql`**

### `neuramark_reel_scripts`

```sql
CREATE TABLE public.neuramark_reel_scripts (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id               uuid NOT NULL REFERENCES public.neuramark_clients(id),
  strategy_id             uuid NOT NULL REFERENCES public.neuramark_content_strategies(id) ON DELETE RESTRICT,
  slot_index              integer NOT NULL,
  modalidad               text NOT NULL,
  hook                    text NOT NULL,
  body                    text NOT NULL,
  cta                     text NOT NULL,
  on_screen_text          text NOT NULL,
  voiceover_text          text NOT NULL,
  target_duration_sec     integer NOT NULL,
  broll_beats             jsonb,
  cold_open_notes         text,
  editing_notes           text,
  must_disclose_not_owner boolean NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT neuramark_reel_scripts_strategy_slot_unique
    UNIQUE (strategy_id, slot_index),
  CONSTRAINT neuramark_reel_scripts_slot_index_check
    CHECK (slot_index >= 0 AND slot_index <= 6),
  CONSTRAINT neuramark_reel_scripts_duration_check
    CHECK (target_duration_sec >= 15 AND target_duration_sec <= 45),
  CONSTRAINT neuramark_reel_scripts_modalidad_check
    CHECK (modalidad IN ('own_avatar', 'generic_avatar', 'faceless'))
);

CREATE INDEX neuramark_reel_scripts_strategy_id_idx
  ON public.neuramark_reel_scripts (strategy_id);

CREATE INDEX neuramark_reel_scripts_client_strategy_idx
  ON public.neuramark_reel_scripts (client_id, strategy_id);

ALTER TABLE public.neuramark_reel_scripts ENABLE ROW LEVEL SECURITY;
-- Zero named policies → deny-by-default for anon/authenticated.
```

### Column map (TS ↔ DB)

| TS (`reelScriptPackageSchema` + server fields) | DB column | Notes |
|------------------------------------------------|-----------|-------|
| — | `id` | uuid PK |
| — | `client_id` | Denormalized from strategy row on UPSERT |
| — | `strategy_id` | FK approved strategy used at generation |
| — | `slot_index` | Matches `brief.slots[].slotIndex` |
| `modalidad` (server) | `modalidad` | From approved brief slot |
| `hook` | `hook` | |
| `body` | `body` | |
| `cta` | `cta` | |
| `onScreenText` | `on_screen_text` | |
| `voiceoverText` | `voiceover_text` | |
| `targetDurationSec` | `target_duration_sec` | |
| `brollBeats?` | `broll_beats` | jsonb `string[]` or NULL |
| `coldOpenNotes?` | `cold_open_notes` | NULL when absent |
| `editingNotes?` | `editing_notes` | NULL when absent |
| `mustDiscloseForSlot` (server) | `must_disclose_not_owner` | boolean NOT NULL |
| — | `created_at`, `updated_at` | `neuramark_set_updated_at` trigger if project pattern applies |

### Rate limit (reuse table)

| Constant | Value |
|----------|-------|
| `agent_key` | **`video_script_generate`** |
| Rolling window | **60 minutes** |
| Max attempts / window | **5** per `client_id` |
| In-flight batch key | **`${clientId}:${strategyId}:batch`** — max 1 |
| In-flight regen key | **`${clientId}:${strategyId}:${slotIndex}`** — max 1 |

---

## Standard error envelope

```ts
export const reelScriptErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "STRATEGY_NOT_APPROVED",
  "SLOT_NOT_FOUND",
  "RATE_LIMITED",
  "GENERATION_IN_FLIGHT",
  "PROFILE_INCOMPLETE",
  "SCRIPT_OUTPUT_INVALID",
  "PROVIDER_UNAVAILABLE",
  "FORBIDDEN_FIELDS",
  "INTERNAL_ERROR",
]);

export type ReelScriptMutationError = {
  ok: false;
  error: {
    code: z.infer<typeof reelScriptErrorCodeSchema>;
    messageKey?: string;
    fields?: Record<string, string[]>;
  };
};
```

| Code | HTTP lean | `messageKey` | When |
|------|-----------|--------------|------|
| `UNAUTHENTICATED` | 401 | `auth.errors.unauthenticated` | No session |
| `FORBIDDEN` | 403 | `auth.errors.forbidden` | Non-operator / inactive |
| `VALIDATION_ERROR` | 400 | `scripts.errors.validation` | Zod input failure |
| `NOT_FOUND` | 404 | `scripts.errors.notFound` | Cross-tenant lookup |
| `STRATEGY_NOT_APPROVED` | 422 | `scripts.errors.strategyNotApproved` | No approved strategy for week or row not `approved` |
| `SLOT_NOT_FOUND` | 422 | `scripts.errors.slotNotFound` | `slotIndex` not on approved brief |
| `RATE_LIMITED` | 429 | `scripts.errors.rateLimited` | >5 jobs / 60 min per `client_id` |
| `GENERATION_IN_FLIGHT` | 429 | `scripts.errors.inFlight` | Concurrent batch/regen same scope |
| `PROFILE_INCOMPLETE` | 422 | `scripts.errors.profileIncomplete` | No Ficha or no Preferencias allowlist |
| `SCRIPT_OUTPUT_INVALID` | 422 | `scripts.errors.scriptOutputInvalid` | LLM JSON / Zod package failure |
| `PROVIDER_UNAVAILABLE` | 503 | `scripts.errors.providerUnavailable` | Missing env key / resolve failure |
| `FORBIDDEN_FIELDS` | 400 | `scripts.errors.forbiddenFields` | Smuggled authority fields |
| `INTERNAL_ERROR` | 500 | `scripts.errors.internal` | DB/helper load failure (no leak) |

Page loaders use `requireOperator("page")` redirects — not this JSON envelope.

---

## State transitions

### `neuramark_reel_scripts` rows

| Event | Effect |
|-------|--------|
| Batch generate (first time) | INSERT one row per slot |
| Batch generate (re-run) | UPSERT all slots — refreshes every script |
| Single-slot regenerate | UPSERT one row for `(strategy_id, slot_index)` |
| Strategy brief edit after scripts | **Blocked** by US-4.2 `STRATEGY_LOCKED` when `strategyHasScripts` true |
| Strategy new approved version | Old script rows remain on prior `strategy_id`; FE warns `strategyVersionChanged` |
| DELETE script row | **Forbidden** in V1 |

---

## Fixtures (BUILD / FE mocks / tests)

### `generateReelScripts` — happy

**Request:**

```json
{ "weekStart": "2026-01-05" }
```

**Response:**

```json
{
  "ok": true,
  "strategyId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "weekStart": "2026-01-05",
  "slotCount": 3,
  "scriptIds": [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333"
  ]
}
```

### `getReelScriptsForWeek` — one slot generated

```json
{
  "ok": true,
  "weekStart": "2026-01-05",
  "approvedStrategy": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "version": 1,
    "status": "approved"
  },
  "strategyVersionChanged": false,
  "items": [
    {
      "scriptId": "11111111-1111-4111-8111-111111111111",
      "slotIndex": 0,
      "tema": "Por qué revisar antes del frío",
      "dayOfWeek": "monday",
      "goal": "trust",
      "formatoPlaybookSlug": "tip-rapido",
      "modalidad": "faceless",
      "targetDurationSec": 30,
      "status": "generated",
      "mustDiscloseNotOwner": false,
      "package": {
        "hook": "¿Tu calefacción falla justo cuando más la necesitas?",
        "body": "Antes del primer frío intenso, revisa filtros y termostato...",
        "cta": "Guarda este video y agenda tu revisión.",
        "onScreenText": "3 checks antes del frío\n✓ Filtro\n✓ Termostato\n✓ Presión",
        "voiceoverText": "Antes del primer frío intenso, revisa estos tres puntos...",
        "targetDurationSec": 30,
        "brollBeats": ["Plano manos abriendo panel", "Close-up filtro sucio"],
        "coldOpenNotes": "Abrir con la toma más impactante del filtro (rewind 2s).",
        "editingNotes": "Corte rápido entre checks; texto en pantalla sincronizado con VO."
      }
    }
  ]
}
```

### `generateReelScripts` — strategy not approved

```json
{
  "ok": false,
  "error": {
    "code": "STRATEGY_NOT_APPROVED",
    "messageKey": "scripts.errors.strategyNotApproved"
  }
}
```

### `regenerateReelScriptSlot` — invalid LLM output

```json
{
  "ok": false,
  "error": {
    "code": "SCRIPT_OUTPUT_INVALID",
    "messageKey": "scripts.errors.scriptOutputInvalid",
    "fields": {
      "slotIndex": ["0"],
      "targetDurationSec": ["OUT_OF_RANGE"]
    }
  }
}
```

### `generateReelScripts` — forbidden smuggled script text

```json
{
  "ok": false,
  "error": {
    "code": "FORBIDDEN_FIELDS",
    "messageKey": "scripts.errors.forbiddenFields"
  }
}
```

---

## Unit test matrix (frozen)

**File (BUILD):** `lib/reel-scripts/reel-scripts.test.ts`

| # | Area | Test | Expected |
|---|------|------|----------|
| 1 | Schema | `reelScriptPackageSchema` accepts full package with optional beats/notes | pass |
| 2 | Schema | Rejects `targetDurationSec` &lt; 15 or &gt; 45 | fail parse |
| 3 | Schema | Rejects empty `hook` / `body` / `cta` | fail parse |
| 4 | Schema | Rejects unknown keys (`.strict()`) | fail parse |
| 5 | Schema | Rejects `brollBeats` &gt; 8 items | fail parse |
| 6 | Input | `generateReelScriptsInputSchema` rejects `strategyId` | `FORBIDDEN_FIELDS` |
| 7 | Input | `regenerateReelScriptSlotInputSchema` requires `slotIndex` | `VALIDATION_ERROR` if missing |
| 8 | Generate action | Non-operator | 403, no LLM mock, no UPSERT |
| 9 | Generate action | No approved strategy for week | `STRATEGY_NOT_APPROVED`, no LLM |
| 10 | Generate action | Draft strategy only | `STRATEGY_NOT_APPROVED`, no LLM |
| 11 | Generate action | `PROFILE_INCOMPLETE` (no visualModeSummary) | no LLM |
| 12 | Generate action | Happy batch 3 slots | 3 UPSERTs, `strategyHasScripts` true |
| 13 | Generate action | Slot 2 LLM invalid JSON | transaction rollback, 0 new rows, `SCRIPT_OUTPUT_INVALID` |
| 14 | Generate action | Re-run batch on existing scripts | UPSERT refresh all slots |
| 15 | Regen action | Invalid `slotIndex` | `SLOT_NOT_FOUND`, no LLM |
| 16 | Regen action | Happy single slot | 1 UPSERT, siblings unchanged |
| 17 | Regen action | Non-operator | 403 |
| 18 | Read action | Non-operator | 403 |
| 19 | Read action | Approved, no scripts | items pending from brief slots |
| 20 | Read action | Merged list with package fields | hook/body/cta/onScreenText/voiceoverText present |
| 21 | Disclosure | Slot `generic_avatar` + profile `mustDiscloseNotOwner` | `must_disclose_not_owner` true on row |
| 22 | Disclosure | Slot `faceless` + profile flag true | `must_disclose_not_owner` false (per-slot rule) |
| 23 | Disclosure | Request `mustDiscloseNotOwner: false` | `FORBIDDEN_FIELDS` |
| 24 | Provider | `resolveProvider` called with `llmVariant: "fallback"` | mock asserts fallback slug |
| 25 | Rate limit | 6th job in 60 min | `RATE_LIMITED`, no LLM |
| 26 | In-flight | Concurrent batch same strategy | `GENERATION_IN_FLIGHT` |
| 27 | IDOR | Foreign `weekStart` / wrong tenant strategy | `NOT_FOUND` or empty — no leak |
| 28 | Helper | `loadApprovedStrategyForScriptJob` draft id | null → `STRATEGY_NOT_APPROVED` |
| 29 | Helper | `strategyHasScripts` before insert | false |
| 30 | Helper | `strategyHasScripts` after insert | true |
| 31 | Agent | Prompt contains formato `guionHints` for slot slug | string match in mock prompt |
| 32 | Agent | Prompt contains táctica hints when slug set | string match |
| 33 | Agent | `buildGenericDisclosurePromptHint` when `mustDiscloseForSlot` | hint in system prompt |
| 34 | Orchestrator | Five helpers called once per batch job | mock call counts |
| 35 | Forbidden | Request includes `hook` text | `FORBIDDEN_FIELDS` |
| 36 | RLS | Migration enables RLS, zero policies | advisor / SQL assertion |

---

## Security (binding summary from SECURITY.md)

1. **Gate:** `requireOperator("handler")` **first** on **`generateReelScripts`** and **`regenerateReelScriptSlot`**; read via `requireOperator("page" \| "handler")`.
2. **Approved strategy:** **`loadApprovedStrategyForScriptJob`** + **`getApprovedStrategyForWeek`** before LLM/UPSERT; **`STRATEGY_NOT_APPROVED`** on failure.
3. **Tenancy:** `client_id` server-resolved only; IDOR → **404**.
4. **Forbidden input:** no `provider_key`, `mustDiscloseNotOwner`, script text fields — **`FORBIDDEN_FIELDS`**.
5. **Schema validation:** Zod **`.strict()`** on agent output **before** persist; batch **atomic** — no partial orphan scripts; **`SCRIPT_OUTPUT_INVALID`**.
6. **Disclosure:** `must_disclose_not_owner` **server-injected** per-slot rule at persist; never from request.
7. **Provider:** catalog + `resolveProvider({ assetRole: "llm", llmVariant: "fallback" })`.
8. **Rate limit:** `video_script_generate` key; per-`client_id` enforcement.
9. **RLS:** `neuramark_reel_scripts` enabled, zero policies.
10. **Lock handoff:** **`strategyHasScripts()`** EXISTS query.
11. **Agent module:** `import "server-only"`; five-helper pipeline; delimited untrusted prompt data.
12. **System seam:** `generateReelScriptsForClient({ invokedBy: "system" })` — trusted server only; not in US-5.1 BUILD.

---

## Out of scope (explicit)

| Item | Owner story |
|------|-------------|
| On-screen/VO length warnings UI | US-5.2 |
| `neuramark_reel_captions` | US-6.1 |
| Pre-generation budget block | US-7.1 |
| Video / TTS / assembly jobs | US-8.x / US-9.x |
| Cliente script read (Aprobación package) | US-11.x |
| Weekly cycle cron wiring | integrations-engineer (ADR-0001) |
| Operator inline script edit | — (regenerate only) |
| Script version history / DELETE | — |

---

## FE signoff

- [x] **Reviewed by FE** — 2026-08-30 — /operator/scripts, generate/regen actions, list DTO, EN/ES strings.

**Reviewed by FE:** 2026-08-30 — /operator/scripts, generate/regen actions, list DTO, EN/ES strings.
