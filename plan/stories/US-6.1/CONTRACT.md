# API Contract — US-6.1 Generate Instagram caption per Reel

**Story:** US-6.1  
**Status:** Frozen — 2026-08-30 (awaiting FE signoff)  
**Security:** `plan/stories/US-6.1/SECURITY.md` (APPROVE WITH CONDITIONS — binding freeze; reconciled below)  
**Spec review:** `plan/stories/US-6.1/SPEC-REVIEW.md` (GAPS — resolved by this contract)  
**Depends on:** US-5.1 ✅ `neuramark_reel_scripts` · `getReelScriptsForWeek` · `/operator/scripts` · US-5.2 ✅ script readability (separate tab limits) · US-4.2 ✅ `getApprovedStrategyForWeek` · US-4.1 ✅ brief slot metadata · US-2.3 ✅ `getBusinessProfileForAgents` · US-X.4 ✅ `resolveProvider({ llmVariant: "default" })` → DeepSeek · US-14.5 ✅ `requireOperator()`  
**Identity seam:** `lib/auth/get-current-user.ts` / `requireOperator()` (unchanged)  
**Feature branch:** `feature/US-6.1-reel-captions`  
**Error envelope style:** same class as US-5.1 (`ok: true` vs `{ ok: false, error: { code, fields?, messageKey? } }`)

**This document is CONTRACT ONLY.** Zod below is the BUILD sketch for `lib/contracts/reel-caption.ts`, server modules under `lib/reel-captions/`, `lib/agents/content/generate-reel-caption.ts`, and `lib/reel-captions/reel-captions.test.ts`.

**Terminology:** **Paquete de guion** · **caption de Instagram** · **hashtags** · **keywords locales** · **Estrategia semanal** (approved) · **Operator** · **Ficha viva** · **zona de servicio**. Technical enums (`reel_script_id`, `cta_variants`) OK in code/DB. Do **not** use CONTEXT _Evitar_ terms in product-facing strings.

**SPEC-REVIEW blocking gaps closed in this contract:**

| # | Gap | Resolution |
|---|-----|------------|
| 1 | CTA variant generation missing from AC | Agent output **`ctaVariants` array min 2, max 4** plain-text strings; persisted to `cta_variants` jsonb; **read-only** in FE until US-6.2; **no** `selected_cta_index` |
| 2 | Instagram limits undefined | Frozen shared constants in `lib/contracts/reel-caption.ts`: caption **2200**; hashtags **warn >15** / **reject >30**; keywords **max 10**; imported by BE Zod + FE Caption tab |
| 3 | Trusted helper pipeline + approval gate | **Five-helper pipeline** frozen; per-slot **`loadReelScriptForCaptionJob`** before LLM/UPSERT; **`llmVariant: "default"`** (not script `'fallback'`) |
| 4 | Dual-path invoke (ADR-0001) | **`generateReelCaptionsForClient({ invokedBy: "operator" \| "system" })`** server-only orchestrator; Operator actions gated; system path documented, **not wired** in US-6.1 BUILD |
| 5 | DB `reel_captions` → `neuramark_reel_captions` + tenancy | Migration **`20260830400000_neuramark_reel_captions.sql`** — `client_id` FK, `reel_script_id` FK UNIQUE, RLS deny-by-default |

**SECURITY reconciliation (PO + SPEC override lean defaults):**

| Topic | SECURITY lean | **Frozen in this contract** |
|-------|---------------|----------------------------|
| Hashtag count | 1..30 only | **1..30** persist; **warn** when `hashtagCount > 15` (`maxHashtagsConfigured`); **reject** when `> 30` |
| Keywords count | 0..20 | **0..10** (`IG_KEYWORD_MAX`) |
| CTA variants | 2..5 | **2..4** (`CTA_VARIANT_MIN` / `CTA_VARIANT_MAX`) |
| Batch atomicity | ambiguous | **Per-slot partial success** — successful slots UPSERT; failures collected in response (mirror PO lean; unlike US-5.1 script batch atomicity) |

---

## Overview

An authenticated **Operator** triggers **caption de Instagram** generation for each **Paquete de guion** on an **approved Estrategia semanal** for a selected ISO week. The server:

1. Gates **generate**, **regenerate**, and **read** with `requireOperator()` — 401/403, **no side effects** on failure.
2. Resolves **`clientId` server-side only** (V1: `getCurrentUser().id` after operator gate).
3. Loads approved strategy via **`getApprovedStrategyForWeek`** + defense-in-depth **`loadApprovedStrategyForScriptJob`** — draft/missing → **`STRATEGY_NOT_APPROVED`**, **no LLM**.
4. Requires **persisted script row** per target slot — missing script → **`SCRIPT_NOT_FOUND`** (single) or skip/`SCRIPT_PENDING` (batch).
5. Assembles agent inputs via **five-helper pipeline** (profile, approved strategy, script rows, provider catalog + policy, `resolveProvider` default variant).
6. Runs **one LLM call per script** (`generateReelCaptionForScript`); delimited untrusted blocks; Zod **`.strict()`** on output; UPSERT into **`neuramark_reel_captions`**.
7. Extends **`getReelScriptsForWeek`** list DTO with nullable **`caption`** summary + full record for Caption tab (≤3 Reels/week — no lazy-load split in V1).

**Instagram Reels captions only** — plain text; no HTML/markdown; no publish; no CTA **selection** (US-6.2).

**Surfaces**

| # | Surface | Kind | New vs reused |
|---|---------|------|---------------|
| 1 | `/operator/scripts` Caption tab | FE TabView panel | **Extended** — Script · Caption tabs in expand/detail |
| 2 | `generateReelCaptions` | Server Action | **New** — batch all scripts for week |
| 3 | `regenerateReelCaption` | Server Action | **New** — single slot |
| 4 | `getReelScriptsForWeek` | Server Action | **Extended** — `items[].caption` |
| 5 | `generateReelCaptionsForClient` | Server-only orchestrator | **New** — shared by actions + future ADR-0001 cron |
| 6 | `loadReelScriptForCaptionJob` | Server-only helper | **New** — IDOR-safe script + approved-strategy chain |
| 7 | `generateReelCaptionForScript` | Server-only agent module | **New** — `lib/agents/content/generate-reel-caption.ts` |
| 8 | Zod + types | `lib/contracts/reel-caption.ts` | **New** |
| 9 | Migration | `neuramark_reel_captions` | **New** |

**Forbidden surfaces (BUILD veto):**

- Public Route Handler for caption generate/status.
- HTTP exposure of `generateReelCaptionsForClient` or `generateReelCaptionForScript`.
- Client Component import of agent/orchestrator modules.
- Cliente caption read UI/API (US-11.x).
- Operator inline caption edit — regenerate only.
- `selected_cta_index` column or mutation (US-6.2).
- Request fields: `clientId`, `provider_key`, caption/hashtag/keyword/variant text.

**Why Server Actions:** UI-coupled Operator generate/read under `(app)/operator/scripts`; CSRF via Next.js origin check. System cron (ADR-0001) calls **server-only** `generateReelCaptionsForClient` — not HTTP in US-6.1.

**Frontend consumers**

| Consumer | Route / component | Contract surface |
|----------|-------------------|------------------|
| Scripts page | `app/(app)/operator/scripts/page.tsx` | `getReelScriptsForWeek({ weekStart })` — includes `caption` |
| Caption tab | `ScriptsPageView` expand panel **TabView** | Read `items[].caption`; char counter; hashtag/keyword chips; read-only CTA variant lines |
| Generate captions | Scripts page primary button | `generateReelCaptions({ weekStart })` |
| Regenerate caption | Caption tab / row action | `regenerateReelCaption({ weekStart, slotIndex })` |
| Copy-to-clipboard | Caption tab | Client-only UX on plain-text DTO fields |
| i18n | `messages/en.json` / `es.json` | `scripts.caption.*` |

**Server-only modules (planned BUILD)**

| Module | Purpose |
|--------|---------|
| `lib/reel-captions/actions/generate-reel-captions.ts` | `"use server"` `generateReelCaptions` |
| `lib/reel-captions/actions/regenerate-reel-caption.ts` | `"use server"` `regenerateReelCaption` |
| `lib/reel-captions/generate-reel-captions-for-client.ts` | `import "server-only"` orchestrator |
| `lib/reel-captions/load-reel-script-for-caption-job.ts` | `import "server-only"` script ownership loader |
| `lib/reel-captions/persist-reel-caption.ts` | `import "server-only"` UPSERT helper |
| `lib/reel-captions/check-caption-generation-rate-limit.ts` | `import "server-only"` rate + in-flight |
| `lib/reel-captions/list-reel-captions-for-strategy.ts` | `import "server-only"` SELECT by strategy scripts |
| `lib/reel-captions/find-forbidden-keys.ts` | Forbidden-key scan for caption actions |
| `lib/reel-captions/errors.ts` | Typed error envelopes |
| `lib/agents/content/generate-reel-caption.ts` | `import "server-only"` per-script LLM |
| `lib/contracts/reel-caption.ts` | Zod + IG limit constants |
| `lib/reel-scripts/list-reel-scripts-for-week.ts` | **Extended** — attach caption DTO |

---

## Frozen decisions (from SECURITY.md + SPEC-REVIEW + PO TASKS)

Do not reopen.

| # | Topic | Freeze |
|---|-------|--------|
| 1 | **Operator route** | **`/operator/scripts`** — **TabView** **Script · Caption** in expand/detail panel (no new nav route) |
| 2 | **Tenancy (V1)** | `clientId` = **`getCurrentUser().id`** after `requireOperator()`. Input **`{ weekStart }`** (+ `slotIndex` on regen) — no authoritative `clientId` |
| 3 | **Dual invoke path** | **Operator:** actions → `generateReelCaptionsForClient({ clientId, weekStart, strategyId, invokedBy: "operator", mode })`. **System (ADR-0001, not built US-6.1):** trusted orchestration with `invokedBy: "system"` — **no** `requireOperator` inside helper; approval gate for system path **deferred** to integrations-engineer |
| 4 | **Approval gate (Operator)** | `getApprovedStrategyForWeek` + `loadApprovedStrategyForScriptJob` — `status = 'approved'` required before LLM/UPSERT |
| 5 | **Script prerequisite** | Caption generation **only** when `neuramark_reel_scripts` row exists. Single regen → **`SCRIPT_NOT_FOUND`**. Batch → skip slot with `SCRIPT_PENDING` in `skipped[]` |
| 6 | **Five-helper pipeline** | See [Five-helper input pipeline](#five-helper-input-pipeline-frozen). **No** playbook/trend in V1 caption prompt (PO lean) |
| 7 | **LLM provider** | `resolveProvider(catalog, { assetRole: "llm", tier: policy.providerTier, llmVariant: "default" })` → **`siliconflow_deepseek`** (US-X.4 Caption mapping). **Not** script `'fallback'` / Qwen |
| 8 | **Locale** | Profile `preferredLocale` when `en` \| `es`; else **`es`** |
| 9 | **LLM calls** | **One call per script row** — batch loops eligible scripts; single regen one script |
| 10 | **Batch partial success** | Per-slot UPSERT on success; collect failures in `errors[]`; **no** rollback of successful sibling slots |
| 11 | **Persistence** | **UPSERT** on `reel_script_id` UNIQUE — regenerate replaces caption row; script regen (US-5.1) does **not** cascade-delete caption — FE may show **stale** badge when `script.updatedAt > caption.updatedAt` |
| 12 | **IG limits** | See [Instagram limits (frozen constants)](#instagram-limits-frozen-constants) |
| 13 | **CTA variants** | Generate **2–4** plain-text variants; store in `cta_variants`; **read-only** numbered lines/chips in FE; selection → US-6.2 |
| 14 | **Hashtag normalization** | Server normalizes each hashtag to **leading `#`** on persist if agent omits; display strips double-hash risk via normalized storage |
| 15 | **Geo keywords** | Prompt injects `profile.fields.zone.description` when zone present; `keywords[]` may be empty when zone absent — **not** a failure |
| 16 | **Rate limit** | **`caption_generate`** key; **max 5** job attempts per `client_id` per rolling **60 minutes**; in-flight guards mirror US-5.1 scopes; over-limit → **`RATE_LIMITED`**, no LLM |
| 17 | **Sync generate** | Blocking Server Action; FE pending state. `maxDuration` lean **120s** on batch (N scripts × ~15s) |
| 18 | **revalidatePath** | `revalidatePath("/operator/scripts")` after successful batch/single generate |
| 19 | **Logging** | `reelScriptId`, `clientId`, `slotIndex`, `weekStart`, action, error **codes**, provider **key slug** only — never full prompts or caption bodies |
| 20 | **Out of scope** | US-6.2 CTA selection; US-7.1 budget pre-check; weekly cron wiring; Cliente read; inline edit; publish |

### Strip vs reject (mutation bodies)

| Keys | Behavior |
|------|----------|
| `weekStart` | **Accept** — `trendWeekStartSchema` |
| `slotIndex` | **Accept** on `regenerateReelCaption` only — integer 0–6 |
| `clientId`, `client_id`, `strategyId`, `strategy_id`, `reelScriptId`, `reel_script_id` | **Reject** → `FORBIDDEN_FIELDS` |
| `providerKey`, `provider_key`, `tier`, `envKeyName`, `model` | **Reject** → `FORBIDDEN_FIELDS` |
| `status`, `approved` | **Reject** → `FORBIDDEN_FIELDS` |
| `caption`, `hashtags`, `keywords`, `ctaVariants`, `cta_variants` | **Reject** → `FORBIDDEN_FIELDS` |
| `selectedCtaIndex`, `selected_cta_index` | **Reject** → `FORBIDDEN_FIELDS` |
| `maxHashtags`, `maxCaptionChars`, `hook`, `body`, `cta`, script text fields | **Reject** → `FORBIDDEN_FIELDS` |
| `brief`, `invokedBy`, `role`, `auth_user_id` | **Reject** → `FORBIDDEN_FIELDS` |
| Unknown keys | **Reject** → `VALIDATION_ERROR` (`.strict()`) |

---

## Instagram limits (frozen constants)

**BUILD:** `lib/contracts/reel-caption.ts` — **FE imports constants for Caption tab counters**; BE Zod uses same values.

```ts
export const IG_CAPTION_MAX_CHARS = 2200 as const;
export const IG_HASHTAG_WARN_MAX = 15 as const; // configured max — FE warn styling
export const IG_HASHTAG_HARD_MAX = 30 as const; // Instagram platform ceiling — BE reject
export const IG_HASHTAG_ENTRY_MAX_CHARS = 100 as const;
export const IG_KEYWORD_MAX = 10 as const;
export const IG_KEYWORD_ENTRY_MAX_CHARS = 80 as const;
export const CTA_VARIANT_MIN = 2 as const;
export const CTA_VARIANT_MAX = 4 as const;
export const CTA_VARIANT_ENTRY_MAX_CHARS = 200 as const;
```

| Field | Persist bounds | FE display |
|-------|----------------|------------|
| `caption` | Non-empty trimmed plain text; **max 2200** | Char counter `charCount / 2200`; warn if over (should not post-validate) |
| `hashtags` | Array **1..30**; each **1–100** chars; plain text; `#` normalized server-side | Chips + `hashtagCount / 15` — **warn** when `> 15`; hard reject only server-side at `> 30` |
| `keywords` | Array **0..10**; each **1–80** chars; plain text | Keyword chips when present |
| `ctaVariants` | Array **2..4**; each **1–200** chars; plain text | Read-only numbered lines — **no** radio/select |

**Plain text guard (all string fields):** reject if matches `/[<>&]/` or contains `javascript:` (shared `plainTextNoHtmlSchema` in `reel-caption.ts`).

---

## Five-helper input pipeline (frozen)

Orchestrator `generateReelCaptionsForClient` **MUST** load shared inputs once per job, then loop eligible script rows:

| # | Helper | Purpose | Abort condition |
|---|--------|---------|-----------------|
| 1 | `getBusinessProfileForAgents(clientId)` | Tone, locale, **`fields.zone`** for geo keywords | `!exists` → **`PROFILE_INCOMPLETE`** |
| 2 | `loadApprovedStrategyForScriptJob({ strategyId, clientId })` | Approved brief + slot metadata (`tema`, `goal`, `angle`, `ctaHint`, etc.) | null → **`STRATEGY_NOT_APPROVED`** |
| 3 | `listReelScriptsForStrategy({ clientId, strategyId })` | Eligible `neuramark_reel_scripts` rows for batch/slot filter | empty → batch returns `skipped` only; single slot → **`SCRIPT_NOT_FOUND`** |
| 4 | `getProviderCatalog()` + `getDefaultCostPolicy()` | Catalog + tier | `loadFailed` / missing policy → **`INTERNAL_ERROR`** |
| 5 | `resolveProvider(catalog, { assetRole: "llm", tier, llmVariant: "default" })` | LLM adapter → DeepSeek | resolve/adapter failure → **`PROVIDER_UNAVAILABLE`** |

**Per script before LLM + UPSERT:** **`loadReelScriptForCaptionJob({ reelScriptId, clientId })`** — re-verifies script tenancy + parent strategy `approved` (caller-independent).

Agent module **`generateReelCaptionForScript`** receives **pre-loaded** profile, strategy slot context, script package, provider adapter — **does not** SELECT Supabase directly.

**Per-script context assembly (frozen):**

```ts
type ReelCaptionSlotContext = {
  slot: ContentStrategySlot; // from approved brief by slotIndex
  scriptPackage: ReelScriptPackage; // from script row
  reelScriptId: string;
  slotIndex: number;
};
```

---

## Dual-path approval gate (ADR-0001 reconciliation)

| Path | Caller | Approval requirement | US-6.1 BUILD scope |
|------|--------|----------------------|-------------------|
| **A — Operator manual** | `generateReelCaptions` / `regenerateReelCaption` after `requireOperator` | **`getApprovedStrategyForWeek`** + **`loadApprovedStrategyForScriptJob`** + **`loadReelScriptForCaptionJob`** | **Implemented** |
| **B — System/cron** | ADR-0001 (`generateReelCaptionsForClient({ invokedBy: "system" })`) | Approval gate for auto-path **deferred** to integrations-engineer | **Deferred** — signature + helper only; **no cron wiring** |

**Operator path rule (frozen):** Public Server Actions **always** require approved strategy + script row. System path **must not** be callable from browser without `requireOperator`.

---

## Caption package schema (frozen)

**BUILD:** `lib/contracts/reel-caption.ts`

```ts
import { z } from "zod";
import {
  IG_CAPTION_MAX_CHARS,
  IG_HASHTAG_HARD_MAX,
  IG_HASHTAG_ENTRY_MAX_CHARS,
  IG_KEYWORD_MAX,
  IG_KEYWORD_ENTRY_MAX_CHARS,
  CTA_VARIANT_MIN,
  CTA_VARIANT_MAX,
  CTA_VARIANT_ENTRY_MAX_CHARS,
  IG_HASHTAG_WARN_MAX,
} from "./reel-caption-limits"; // or same file

export const plainTextNoHtmlSchema = z
  .string()
  .trim()
  .min(1)
  .refine((s) => !/[<>&]/.test(s) && !s.toLowerCase().includes("javascript:"), {
    message: "PLAIN_TEXT_REQUIRED",
  });

export const reelCaptionHashtagSchema = plainTextNoHtmlSchema.max(
  IG_HASHTAG_ENTRY_MAX_CHARS,
);

export const reelCaptionKeywordSchema = plainTextNoHtmlSchema.max(
  IG_KEYWORD_ENTRY_MAX_CHARS,
);

export const reelCaptionCtaVariantSchema = plainTextNoHtmlSchema.max(
  CTA_VARIANT_ENTRY_MAX_CHARS,
);

/** LLM agent output shape (camelCase). Orchestrator normalizes hashtags then parses persist schema. */
export const reelCaptionAgentOutputSchema = z
  .object({
    caption: plainTextNoHtmlSchema.max(IG_CAPTION_MAX_CHARS),
    hashtags: z.array(z.string().trim().min(1).max(IG_HASHTAG_ENTRY_MAX_CHARS))
      .min(1)
      .max(IG_HASHTAG_HARD_MAX),
    keywords: z
      .array(z.string().trim().min(1).max(IG_KEYWORD_ENTRY_MAX_CHARS))
      .max(IG_KEYWORD_MAX)
      .default([]),
    ctaVariants: z
      .array(z.string().trim().min(1).max(CTA_VARIANT_ENTRY_MAX_CHARS))
      .min(CTA_VARIANT_MIN)
      .max(CTA_VARIANT_MAX),
  })
  .strict();

/** Persisted / list DTO record after server normalization. */
export const reelCaptionRecordSchema = z
  .object({
    caption: plainTextNoHtmlSchema.max(IG_CAPTION_MAX_CHARS),
    hashtags: z.array(reelCaptionHashtagSchema).min(1).max(IG_HASHTAG_HARD_MAX),
    keywords: z.array(reelCaptionKeywordSchema).max(IG_KEYWORD_MAX),
    ctaVariants: z
      .array(reelCaptionCtaVariantSchema)
      .min(CTA_VARIANT_MIN)
      .max(CTA_VARIANT_MAX),
    charCount: z.number().int().min(1).max(IG_CAPTION_MAX_CHARS),
    hashtagCount: z.number().int().min(1).max(IG_HASHTAG_HARD_MAX),
    keywordCount: z.number().int().min(0).max(IG_KEYWORD_MAX),
    ctaVariantCount: z.number().int().min(CTA_VARIANT_MIN).max(CTA_VARIANT_MAX),
    maxCaptionChars: z.literal(IG_CAPTION_MAX_CHARS),
    maxHashtagsConfigured: z.literal(IG_HASHTAG_WARN_MAX),
    maxHashtagsHard: z.literal(IG_HASHTAG_HARD_MAX),
    hasKeywords: z.boolean(),
    hashtagsOverConfiguredMax: z.boolean(), // hashtagCount > IG_HASHTAG_WARN_MAX
  })
  .strict();

export type ReelCaptionRecord = z.infer<typeof reelCaptionRecordSchema>;
```

**Hashtag normalization (server, before `reelCaptionRecordSchema.parse`):**

```ts
function normalizeHashtag(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}
```

---

## Caption summary DTO (list extension)

```ts
export const reelCaptionSummarySchema = z
  .object({
    status: z.enum(["pending", "generated"]),
    captionId: z.string().uuid().nullable(),
    record: reelCaptionRecordSchema.nullable(),
    updatedAt: z.string().datetime().nullable(),
    stale: z.boolean(), // script.updated_at > caption.updated_at when both exist
  })
  .strict();

export type ReelCaptionSummary = z.infer<typeof reelCaptionSummarySchema>;
```

**Extended `reelScriptListItemSchema` (in `lib/contracts/reel-script.ts` or re-export from `reel-caption.ts`):**

```ts
export const reelScriptListItemSchema = z
  .object({
    // ... existing US-5.1 + US-5.2 fields ...
    caption: reelCaptionSummarySchema,
  })
  .strict();
```

| `caption.status` | `caption.record` | UX |
|------------------|------------------|-----|
| `pending` | `null` | Caption tab empty state; badge "Caption pending" |
| `generated` | full record | Caption tab content; optional **stale** warn when `stale: true` |

**Full caption payload in list read** — no second round-trip for ≤3 Reels/week (PO lean).

---

## Shared action schemas

```ts
export const generateReelCaptionsInputSchema = z
  .object({
    weekStart: trendWeekStartSchema,
  })
  .strict();

export const regenerateReelCaptionInputSchema = z
  .object({
    weekStart: trendWeekStartSchema,
    slotIndex: z.number().int().min(0).max(6),
  })
  .strict();

export type ReelCaptionInvoker = "operator" | "system";
```

---

## Server Action — `generateReelCaptions` (**new**)

**File (BUILD):** `lib/reel-captions/actions/generate-reel-captions.ts`

**Consumer:** Operator Scripts page — **Generate captions** (batch).

**Gate:** `await requireOperator("handler")` — **first** await.

**Input:** `generateReelCaptionsInputSchema`

**Tenancy:** `clientId = (await requireOperator("handler")).id`

**Flow:**

1. `requireOperator("handler")`
2. Forbidden-key scan → `FORBIDDEN_FIELDS`
3. Parse input
4. Rate limit + in-flight guard (`caption_generate`)
5. `getApprovedStrategyForWeek({ clientId, weekStart })` — null → `STRATEGY_NOT_APPROVED`
6. `generateReelCaptionsForClient({ clientId, weekStart, strategyId: approved.id, invokedBy: "operator", mode: "batch" })`
7. `revalidatePath("/operator/scripts")`
8. Return success envelope (may include per-slot `skipped` / `errors`)

**Success:**

```ts
export const generateReelCaptionsSuccessSchema = z
  .object({
    ok: z.literal(true),
    strategyId: z.string().uuid(),
    weekStart: trendWeekStartSchema,
    processedCount: z.number().int().min(0),
    captionIds: z.array(z.string().uuid()),
    skipped: z.array(
      z
        .object({
          slotIndex: z.number().int().min(0).max(6),
          code: z.literal("SCRIPT_PENDING"),
        })
        .strict(),
    ),
    errors: z.array(
      z
        .object({
          slotIndex: z.number().int().min(0).max(6),
          code: z.literal("CAPTION_OUTPUT_INVALID"),
          fields: z.record(z.string(), z.array(z.string())).optional(),
        })
        .strict(),
    ),
  })
  .strict();
```

---

## Server Action — `regenerateReelCaption` (**new**)

**File (BUILD):** `lib/reel-captions/actions/regenerate-reel-caption.ts`

**Consumer:** Caption tab — **Regenerate caption** per Reel.

**Gate:** `await requireOperator("handler")` — **first** await.

**Input:** `regenerateReelCaptionInputSchema`

**Flow:** Same gates; `mode: "slot"`, `slotIndex`; script missing → **`SCRIPT_NOT_FOUND`**, no LLM.

**Success:**

```ts
export const regenerateReelCaptionSuccessSchema = z
  .object({
    ok: z.literal(true),
    strategyId: z.string().uuid(),
    weekStart: trendWeekStartSchema,
    slotIndex: z.number().int().min(0).max(6),
    reelScriptId: z.string().uuid(),
    captionId: z.string().uuid(),
  })
  .strict();
```

---

## Server Action — `getReelScriptsForWeek` (**extended**)

**File (BUILD):** `lib/reel-scripts/actions/get-reel-scripts-for-week.ts` (existing — extend list builder)

**Change:** `buildReelScriptListForStrategy` joins `neuramark_reel_captions` by `reel_script_id`; attaches **`caption`** summary per item.

**Gate:** unchanged — `requireOperator("handler")` first.

**Caption enrichment rules:**

- `scriptId === null` → `caption: { status: "pending", captionId: null, record: null, updatedAt: null, stale: false }`
- Script exists, no caption row → same pending summary
- Caption row exists → `status: "generated"`, full `record`, `stale` from timestamp compare

---

## Server helper — `loadReelScriptForCaptionJob` (**new**)

**File (BUILD):** `lib/reel-captions/load-reel-script-for-caption-job.ts` (`import "server-only"`)

```ts
export type ReelScriptForCaption = {
  reelScriptId: string;
  clientId: string;
  strategyId: string;
  slotIndex: number;
  package: ReelScriptPackage;
  scriptUpdatedAt: string;
};

export async function loadReelScriptForCaptionJob(params: {
  reelScriptId: string;
  clientId: string;
}): Promise<ReelScriptForCaption | null> {
  // SELECT script WHERE id = reelScriptId AND client_id = clientId
  // JOIN strategy WHERE strategy.id = script.strategy_id AND status = 'approved'
  // Map package columns → ReelScriptPackage
  // null → SCRIPT_NOT_FOUND / STRATEGY_NOT_APPROVED / NOT_FOUND
}
```

| Rule | Detail |
|------|--------|
| Used by | Orchestrator per script, single-slot regen, future system path |
| Failure | `null` → map to **`SCRIPT_NOT_FOUND`** or **`STRATEGY_NOT_APPROVED`** |
| Not sufficient | Actions also use `getApprovedStrategyForWeek` for current approved row |

---

## Server orchestrator — `generateReelCaptionsForClient` (**new**)

**File (BUILD):** `lib/reel-captions/generate-reel-captions-for-client.ts` (`import "server-only"`)

```ts
export async function generateReelCaptionsForClient(params: {
  clientId: string;
  weekStart: string;
  strategyId: string;
  invokedBy: ReelCaptionInvoker;
  mode: "batch" | "slot";
  slotIndex?: number;
}): Promise<GenerateReelCaptionsResult | RegenerateReelCaptionResult>;
```

| `invokedBy` | Caller | Session gate | Approval |
|-------------|--------|--------------|----------|
| `"operator"` | Server Actions (after `requireOperator`) | Gated at action boundary | **`loadApprovedStrategyForScriptJob`** + **`loadReelScriptForCaptionJob`** |
| `"system"` | Future ciclo semanal | **No** `requireOperator` here | **Deferred** gate in integrations CONTRACT |

**Flow (frozen):**

1. Validate UUIDs + `weekStart` Monday
2. Five-helper pipeline — abort codes per frozen decisions
3. `loadApprovedStrategyForScriptJob` — null → `STRATEGY_NOT_APPROVED`
4. Verify `strategy.weekStart === weekStart` — mismatch → `VALIDATION_ERROR`
5. Load scripts via `listReelScriptsForStrategy`; filter by `mode` / `slotIndex`
6. For each eligible script:
   - `loadReelScriptForCaptionJob({ reelScriptId, clientId })` — null → skip/error per mode
   - Build `ReelCaptionSlotContext` from brief slot + script package
   - `generateReelCaptionForScript(...)` → normalize hashtags → `reelCaptionAgentOutputSchema` → `reelCaptionRecordSchema`
   - On validation fail → collect `CAPTION_OUTPUT_INVALID` for slot; **continue** batch (no rollback siblings)
   - UPSERT `neuramark_reel_captions` on success
7. Record rate-limit success; release in-flight guard
8. Return envelope with `captionIds`, `skipped`, `errors`

**Forbidden:** Client Component import; unauthenticated Route Handler entry.

---

## Agent module — `generateReelCaptionForScript` (**new**)

**File (BUILD):** `lib/agents/content/generate-reel-caption.ts` (`import "server-only"`)

**Exports:** `generateReelCaptionForScript(params)` — prompt + LLM + JSON extract → raw object for orchestrator Zod parse.

**Inputs (from orchestrator — mandatory):**

| Input | Source | Notes |
|-------|--------|-------|
| Business profile | `getBusinessProfileForAgents` (orchestrator) | Delimited `<UNTRUSTED_BUSINESS_PROFILE>` — zone, tone, services, locale |
| Strategy slot | Approved brief slot | Delimited `<UNTRUSTED_SLOT_BRIEF>` — `tema`, `goal`, `angle`, `ctaHint`, `formato`, `modalidad` |
| Script package | Script row | Delimited `<UNTRUSTED_SCRIPT_PACKAGE>` — hook, body, cta, onScreenText, voiceoverText |
| Provider | `resolveProvider` **default** variant | Adapter reads `envKeyName` |

**Output JSON keys:** `caption`, `hashtags`, `keywords`, `ctaVariants` (min 2).

**Does not:** UPSERT DB; call `requireOperator`; SELECT Supabase directly; use playbook/trend in V1.

### Prompt containment (frozen)

| Block | Delimiter | Content |
|-------|-----------|---------|
| Ficha viva | `<UNTRUSTED_BUSINESS_PROFILE>…</UNTRUSTED_BUSINESS_PROFILE>` | Profile fields; **zone.description** for geo keywords |
| Slot brief | `<UNTRUSTED_SLOT_BRIEF>…</UNTRUSTED_SLOT_BRIEF>` | `tema`, `angle`, `goal`, `ctaHint` |
| Paquete de guion | `<UNTRUSTED_SCRIPT_PACKAGE>…</UNTRUSTED_SCRIPT_PACKAGE>` | hook, body, cta, onScreenText, voiceoverText |

**Trusted system instructions (outside delimiters):** Instagram Reels caption; plain text only; caption max 2200; hashtags 1–30 (target ≤15); keywords ≤10 with local/geo terms when zone present; **2–4 CTA variant strings** for later Operator selection (US-6.2); JSON only matching agent output schema; locale ES/EN from profile.

---

## Database

### Migration file name (frozen)

**`supabase/migrations/20260830400000_neuramark_reel_captions.sql`**

### `neuramark_reel_captions`

```sql
CREATE TABLE public.neuramark_reel_captions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES public.neuramark_clients(id),
  reel_script_id  uuid NOT NULL REFERENCES public.neuramark_reel_scripts(id) ON DELETE RESTRICT,
  caption         text NOT NULL,
  hashtags        jsonb NOT NULL,
  keywords        jsonb NOT NULL,
  cta_variants    jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT neuramark_reel_captions_reel_script_unique
    UNIQUE (reel_script_id),
  CONSTRAINT neuramark_reel_captions_caption_length_check
    CHECK (char_length(caption) >= 1 AND char_length(caption) <= 2200)
);

CREATE INDEX neuramark_reel_captions_client_id_idx
  ON public.neuramark_reel_captions (client_id);

CREATE INDEX neuramark_reel_captions_reel_script_id_idx
  ON public.neuramark_reel_captions (reel_script_id);

ALTER TABLE public.neuramark_reel_captions ENABLE ROW LEVEL SECURITY;
-- Zero named policies → deny-by-default for anon/authenticated.
```

### Column map (TS ↔ DB)

| TS (`reelCaptionRecordSchema` + metadata) | DB column | Notes |
|-------------------------------------------|-----------|-------|
| — | `id` | uuid PK — exposed as `captionId` in DTO |
| — | `client_id` | Denormalized from script row on UPSERT |
| — | `reel_script_id` | FK UNIQUE — one caption per Paquete de guion |
| `caption` | `caption` | text NOT NULL |
| `hashtags` | `hashtags` | jsonb `string[]` — `#` normalized |
| `keywords` | `keywords` | jsonb `string[]` — may be `[]` |
| `ctaVariants` | `cta_variants` | jsonb `string[]` — 2–4 entries |
| — | `created_at`, `updated_at` | `neuramark_set_updated_at` trigger if project pattern applies |

**Not in US-6.1:** `selected_cta_index` (US-6.2).

### Rate limit (reuse table)

| Constant | Value |
|----------|-------|
| `agent_key` | **`caption_generate`** |
| Rolling window | **60 minutes** |
| Max attempts / window | **5** per `client_id` |
| In-flight batch key | **`${clientId}:${strategyId}:caption_batch`** — max 1 |
| In-flight regen key | **`${clientId}:${strategyId}:${slotIndex}:caption_slot`** — max 1 |
| Distinct from US-5.1 | Separate bucket — **not** `video_script_generate` |

---

## Standard error envelope

```ts
export const reelCaptionErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "STRATEGY_NOT_APPROVED",
  "SLOT_NOT_FOUND",
  "SCRIPT_NOT_FOUND",
  "SCRIPT_PENDING",
  "RATE_LIMITED",
  "GENERATION_IN_FLIGHT",
  "PROFILE_INCOMPLETE",
  "CAPTION_OUTPUT_INVALID",
  "PROVIDER_UNAVAILABLE",
  "FORBIDDEN_FIELDS",
  "INTERNAL_ERROR",
]);

export type ReelCaptionMutationError = {
  ok: false;
  error: {
    code: z.infer<typeof reelCaptionErrorCodeSchema>;
    messageKey?: string;
    fields?: Record<string, string[]>;
  };
};
```

| Code | HTTP lean | `messageKey` | When |
|------|-----------|--------------|------|
| `UNAUTHENTICATED` | 401 | `auth.errors.unauthenticated` | No session |
| `FORBIDDEN` | 403 | `auth.errors.forbidden` | Non-operator / inactive |
| `VALIDATION_ERROR` | 400 | `scripts.caption.errors.validation` | Zod input failure |
| `NOT_FOUND` | 404 | `scripts.caption.errors.notFound` | Cross-tenant lookup |
| `STRATEGY_NOT_APPROVED` | 422 | `scripts.caption.errors.strategyNotApproved` | No approved strategy or row not `approved` |
| `SLOT_NOT_FOUND` | 422 | `scripts.caption.errors.slotNotFound` | `slotIndex` not on brief |
| `SCRIPT_NOT_FOUND` | 422 | `scripts.caption.errors.scriptNotFound` | Single regen — no script row for slot |
| `SCRIPT_PENDING` | — | `scripts.caption.errors.scriptPending` | Batch skip only (in `skipped[]`, not top-level error) |
| `RATE_LIMITED` | 429 | `scripts.caption.errors.rateLimited` | >5 jobs / 60 min per `client_id` |
| `GENERATION_IN_FLIGHT` | 429 | `scripts.caption.errors.inFlight` | Concurrent batch/regen same scope |
| `PROFILE_INCOMPLETE` | 422 | `scripts.caption.errors.profileIncomplete` | `getBusinessProfileForAgents` `exists: false` |
| `CAPTION_OUTPUT_INVALID` | 422 | `scripts.caption.errors.captionOutputInvalid` | LLM JSON / Zod / IG bounds / HTML |
| `PROVIDER_UNAVAILABLE` | 503 | `scripts.caption.errors.providerUnavailable` | Missing env key / resolve failure |
| `FORBIDDEN_FIELDS` | 400 | `scripts.caption.errors.forbiddenFields` | Smuggled authority/content fields |
| `INTERNAL_ERROR` | 500 | `scripts.caption.errors.internal` | DB/helper load failure |

---

## State transitions

### `neuramark_reel_captions` rows

| Event | Effect |
|-------|--------|
| Batch generate (first time) | INSERT one row per successful script |
| Batch generate (re-run) | UPSERT — replaces caption for each processed script |
| Single-slot regenerate | UPSERT one row for `reel_script_id` |
| Script regenerate (US-5.1) | Caption row **unchanged** — may become **stale** (`stale: true` in DTO) |
| DELETE caption row | **Forbidden** in V1 |

---

## Fixtures (BUILD / FE mocks / tests)

### `generateReelCaptions` — happy (2 scripts, 1 skipped)

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
  "processedCount": 2,
  "captionIds": [
    "c1111111-1111-4111-8111-111111111111",
    "c2222222-2222-4222-8222-222222222222"
  ],
  "skipped": [{ "slotIndex": 2, "code": "SCRIPT_PENDING" }],
  "errors": []
}
```

### `getReelScriptsForWeek` — caption generated

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
      "goal": "trust",
      "formatoPlaybookSlug": "tip-rapido",
      "modalidad": "faceless",
      "targetDurationSec": 30,
      "status": "generated",
      "mustDiscloseNotOwner": false,
      "readability": { "...": "US-5.2" },
      "package": { "...": "US-5.1" },
      "caption": {
        "status": "generated",
        "captionId": "c1111111-1111-4111-8111-111111111111",
        "updatedAt": "2026-01-06T10:00:00.000Z",
        "stale": false,
        "record": {
          "caption": "Antes del primer frío, revisa estos tres puntos en tu calefacción.",
          "hashtags": ["#HVAC", "#Mantenimiento", "#Denver"],
          "keywords": ["Denver", "calefacción", "revisión"],
          "ctaVariants": [
            "Agenda tu revisión hoy.",
            "Guarda este video y comparte con tu vecino."
          ],
          "charCount": 52,
          "hashtagCount": 3,
          "keywordCount": 3,
          "ctaVariantCount": 2,
          "maxCaptionChars": 2200,
          "maxHashtagsConfigured": 15,
          "maxHashtagsHard": 30,
          "hasKeywords": true,
          "hashtagsOverConfiguredMax": false
        }
      }
    }
  ]
}
```

### `regenerateReelCaption` — script not found

```json
{
  "ok": false,
  "error": {
    "code": "SCRIPT_NOT_FOUND",
    "messageKey": "scripts.caption.errors.scriptNotFound"
  }
}
```

### `generateReelCaptions` — invalid LLM output (31 hashtags)

```json
{
  "ok": true,
  "strategyId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "weekStart": "2026-01-05",
  "processedCount": 0,
  "captionIds": [],
  "skipped": [],
  "errors": [
    {
      "slotIndex": 0,
      "code": "CAPTION_OUTPUT_INVALID",
      "fields": { "hashtags": ["TOO_MANY"] }
    }
  ]
}
```

---

## Unit test matrix (frozen)

**File (BUILD):** `lib/reel-captions/reel-captions.test.ts`

| # | Area | Test | Expected |
|---|------|------|----------|
| 1 | Schema | `reelCaptionAgentOutputSchema` accepts 2–4 `ctaVariants` | pass |
| 2 | Schema | Rejects 1 `ctaVariant` | fail parse |
| 3 | Schema | Rejects 5 `ctaVariants` | fail parse |
| 4 | Schema | Rejects caption > 2200 chars | fail parse |
| 5 | Schema | Rejects 31 hashtags | fail parse |
| 6 | Schema | Accepts 16 hashtags (warn flag only in record) | pass + `hashtagsOverConfiguredMax: true` |
| 7 | Schema | Rejects HTML in caption `<script>` | fail parse |
| 8 | Schema | Rejects unknown keys (`.strict()`) | fail parse |
| 9 | Schema | Rejects 11 keywords | fail parse |
| 10 | Normalize | Hashtag `HVAC` → `#HVAC` on persist | stored with `#` |
| 11 | Input | `generateReelCaptionsInputSchema` rejects `caption` text | `FORBIDDEN_FIELDS` |
| 12 | Input | `regenerateReelCaptionInputSchema` requires `slotIndex` | `VALIDATION_ERROR` |
| 13 | Generate | Non-operator | 403, no LLM, no UPSERT |
| 14 | Generate | No approved strategy | `STRATEGY_NOT_APPROVED`, no LLM |
| 15 | Generate | Draft strategy only | `STRATEGY_NOT_APPROVED`, no LLM |
| 16 | Generate | `PROFILE_INCOMPLETE` | no LLM |
| 17 | Generate | Happy batch 2 scripts, 1 slot pending | 2 UPSERTs, 1 `SCRIPT_PENDING` skip |
| 18 | Generate | Slot 0 invalid LLM output | slot in `errors[]`, sibling persists |
| 19 | Generate | Re-run batch | UPSERT refresh |
| 20 | Regen | No script for slot | `SCRIPT_NOT_FOUND`, no LLM |
| 21 | Regen | Happy single slot | 1 UPSERT |
| 22 | Regen | Non-operator | 403 |
| 23 | Read | `getReelScriptsForWeek` includes `caption` on items | DTO present |
| 24 | Read | Pending script → `caption.status: pending` | record null |
| 25 | Read | `stale: true` when script updated after caption | flag set |
| 26 | Helper | `loadReelScriptForCaptionJob` draft parent strategy | null |
| 27 | Helper | `loadReelScriptForCaptionJob` foreign script id | null / NOT_FOUND |
| 28 | Provider | `resolveProvider` called with `llmVariant: "default"` | mock asserts default slug |
| 29 | Rate limit | 6th job in 60 min | `RATE_LIMITED`, no LLM |
| 30 | In-flight | Concurrent batch same strategy | `GENERATION_IN_FLIGHT` |
| 31 | IDOR | Foreign week / wrong tenant | NOT_FOUND / empty |
| 32 | Orchestrator | Five helpers called once per batch | mock call counts |
| 33 | Orchestrator | `invokedBy: "system"` does not call `requireOperator` inside | no auth mock in helper |
| 34 | Zone | Profile with zone → prompt fixture contains zone text | string match |
| 35 | Zone | No zone → keywords may be empty | pass persist |
| 36 | RLS | Migration enables RLS, zero policies | SQL assertion |
| 37 | Bucket | `caption_generate` distinct from `video_script_generate` | separate agent_key |

**Agent tests (BUILD):** `lib/agents/content/generate-reel-caption.test.ts` — schema reject; min 2 CTA variants; hashtag bounds; zone in prompt fixture.

---

## Security (binding summary from SECURITY.md)

1. **Gate:** `requireOperator("handler")` **first** on **`generateReelCaptions`** and **`regenerateReelCaption`**; read via existing **`getReelScriptsForWeek`** gate.
2. **Script ownership:** **`loadReelScriptForCaptionJob`** before every agent invoke and UPSERT; **`SCRIPT_NOT_FOUND`** / **`STRATEGY_NOT_APPROVED`** on failure.
3. **Tenancy:** `client_id` server-resolved only; IDOR → **404**.
4. **Forbidden input:** no `provider_key`, caption/hashtag/keyword/CTA text — **`FORBIDDEN_FIELDS`**.
5. **Schema validation:** Zod **`.strict()`** before persist; per-slot batch errors — **no** invalid rows persisted.
6. **Plain text:** reject HTML-like content; FE plain text only — no `dangerouslySetInnerHTML`.
7. **Provider:** catalog + `resolveProvider({ assetRole: "llm", llmVariant: "default" })`.
8. **Rate limit:** `caption_generate` key; distinct from script bucket.
9. **RLS:** `neuramark_reel_captions` enabled, zero policies.
10. **Agent module:** `import "server-only"`; five-helper pipeline; delimited untrusted prompt data.
11. **System seam:** `generateReelCaptionsForClient({ invokedBy: "system" })` — trusted server only; not in US-6.1 BUILD wiring.
12. **CTA variants:** stored read-only; **no** `selected_cta_index` in US-6.1.

---

## Out of scope (explicit)

| Item | Owner story |
|------|-------------|
| CTA variant **selection** + `selected_cta_index` | US-6.2 |
| Pre-generation budget block | US-7.1 |
| Weekly cycle cron wiring | integrations-engineer (ADR-0001) |
| Cliente caption read (Aprobación package) | US-11.x |
| QA agent consuming caption | US-10.1 |
| Instagram publish | US-12.x |
| Operator inline caption edit | — (regenerate only) |
| Playbook/trend hints in caption prompt | Optional future — not V1 |

---

## FE signoff

- [ ] **Reviewed by FE** — Caption tab on `/operator/scripts` TabView; `generateReelCaptions` / `regenerateReelCaption`; extended list DTO; `scripts.caption.*` i18n; char/hashtag counters from shared constants.

**Reviewed by FE:** _(pending)_
