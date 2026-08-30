# API Contract — US-5.2 Preview script readability for vertical video

**Story:** US-5.2  
**Status:** Frozen — 2026-08-30 (awaiting **Reviewed by FE** before BUILD)  
**Security:** `plan/stories/US-5.2/SECURITY.md` (APPROVE WITH CONDITIONS — binding freeze; do not reopen)  
**Spec review:** `plan/stories/US-5.2/SPEC-REVIEW.md` (GAPS — resolved by this contract)  
**Depends on:** US-5.1 ✅ `/operator/scripts` · `lib/contracts/reel-script.ts` · `getReelScriptsForWeek` · `reelScriptPackageSchema`  
**Identity seam:** `requireOperator()` unchanged (US-5.1 / US-14.5)  
**Error envelope style:** unchanged from US-5.1 — readability extends success DTO only; no new error codes

**This document is CONTRACT ONLY.** Zod below is the BUILD sketch for `lib/contracts/reel-script-readability.ts`, extensions to `lib/contracts/reel-script.ts`, `lib/reel-scripts/compute-script-readability.ts`, and `lib/reel-scripts/list-reel-scripts-for-week.ts`.

**Terminology:** **Paquete de guion** · **texto en pantalla** · **locución (VO)** · **Operator** · **Formato de Reel**. Product copy avoids CONTEXT _Evitar_ terms. This story adds **readability warnings** — not US-9.x assembly preview, not US-11 Cliente Aprobación, not burned **subtítulos** (US-6.x / US-9.x).

---

## SPEC-REVIEW blocking gaps closed

| # | Gap | Resolution |
|---|-----|------------|
| 1 | Per-beat max chars undefined | **`REEL_SCRIPT_MAX_CHARS_PER_BEAT_LINE = 40`** — PO frozen (2026-08-30); supersedes SECURITY lean **42** (see [Frozen constants](#frozen-constants)) |
| 2 | Beat parsing rules missing | **`parseOnScreenBeats(onScreenText)`** — split on `\n`, trim each segment, drop empties; max **8** beat lines; each segment = one beat line (US-5.1 newline model) |
| 3 | “Validation on save” vs US-5.1 read-only | **Read-time only in BUILD:** enrich `getReelScriptsForWeek` items with `readability`. Export **`assertScriptReadabilityForSave`** for future Operator edit — **no caller in US-5.2**. Generate/regenerate **unchanged**; no persist gate |
| 4 | VO duration estimate unspecified | **`wordsPerSecondTarget = 2.5`** → `targetWordCount = Math.round(targetDurationSec * 2.5)`; warn when `wordCount > targetWordCount * 1.15` or `wordCount < targetWordCount * 0.70` |
| 5 | Advisory vs blocking | All readability output is **non-blocking** — Operator may view, copy, and regenerate regardless of warnings |
| 6 | Server vs client computation | **Pattern A (server-enriched DTO)** — BE computes in list mapper; FE renders server DTO only (no duplicate business rules in Client Components) |

---

## Overview

An authenticated **Operator** on **`/operator/scripts`** sees **non-blocking warnings** when **texto en pantalla** beat lines exceed configured 9:16 limits and when **locución (VO)** word count diverges from the **target duration** (`targetDurationSec` 15–45).

The server:

1. Reuses **`getReelScriptsForWeek`** — gate, input, and error envelope **unchanged** from US-5.1.
2. After loading each generated **Paquete de guion**, runs pure **`computeScriptReadabilityMetrics(package)`** and attaches **`readability`** to the list item.
3. Sets **`readability: null`** when `status = "pending"` or `package = null`.
4. Exports frozen constants and **`assertScriptReadabilityForSave`** for a future inline-edit story — **not wired in US-5.2 BUILD**.

**No new Server Actions, Route Handlers, DB columns, or agent prompt changes.**

---

## Surfaces

| # | Surface | Kind | New vs reused |
|---|---------|------|---------------|
| 1 | `/operator/scripts` | RSC Operator page | **Extended** — readability warnings in detail panel + list row badge |
| 2 | `getReelScriptsForWeek` | Server Action | **Extended** — `items[].readability` on success |
| 3 | `computeScriptReadabilityMetrics` | Pure helper | **New** — `lib/reel-scripts/compute-script-readability.ts` |
| 4 | `parseOnScreenBeats` | Pure helper | **New** — same module |
| 5 | `assertScriptReadabilityForSave` | Pure helper | **New** — exported, **uncalled** in V1 |
| 6 | Zod + types | `lib/contracts/reel-script-readability.ts` | **New** |
| 7 | List item extension | `lib/contracts/reel-script.ts` | **Extended** — `readability` on `reelScriptListItemSchema` |

**Forbidden surfaces (BUILD veto):**

- New Route Handler or Server Action for readability-only validation.
- Operator script text UPDATE / PATCH / save Server Action.
- Client-supplied threshold overrides on any script action input.
- DB migration or readability persistence columns.
- Cliente script read with warnings (US-11.x).
- Agent self-check LLM pass (content-agents-engineer deferred).
- Blocking generate/regenerate when warnings present.
- Client Component re-implementation of limit formulas (FE displays server DTO only).

---

## Frontend consumers

| Consumer | Route / component | Contract surface |
|----------|-------------------|------------------|
| Scripts page | `app/(app)/operator/scripts/page.tsx` | Initial load: `getReelScriptsForWeek({ weekStart })` — unchanged input |
| Detail panel | `components/scripts/ScriptsPageView.tsx` | Per-beat on-screen char counts + warn styling; VO word count vs target |
| List row | `ScriptsPageView` | PrimeReact `Tag` severity warn when `readability.hasWarnings === true` |
| Pending slots | Detail panel | Hide readability block when `readability === null` |
| i18n | `messages/en.json`, `messages/es.json` | Keys under `scripts.readability.*` |

**FE rule:** Import **types** from `lib/contracts/reel-script-readability.ts` for display logic labels only. **Do not** re-run `computeScriptReadabilityMetrics` in Client Components — render `items[].readability` from the server response.

---

## Frozen constants

Single source of truth: **`lib/contracts/reel-script-readability.ts`** (exported as `REEL_SCRIPT_READABILITY_THRESHOLDS` and named aliases).

| Constant | Value | Rationale |
|----------|-------|-----------|
| `REEL_SCRIPT_MAX_CHARS_PER_BEAT_LINE` | **40** | PO frozen 2026-08-30 for 9:16 on-screen legibility. SECURITY lean was **42**; PO product decision **40** is stricter and binding. Must be ≤ US-5.1 `onScreenText` aggregate max **500**. |
| `REEL_SCRIPT_MAX_LINES_PER_BEAT` | **2** | Reserved for future multi-line beats; V1 newline model yields 1 line per beat — check rarely fires on generated scripts |
| `REEL_SCRIPT_MAX_BEAT_LINES_TOTAL` | **8** | Aligns with `brollBeats` max (US-5.1) |
| `REEL_SCRIPT_WORDS_PER_SECOND_TARGET` | **2.5** | VO pacing estimate for Operator preview |
| `REEL_SCRIPT_VO_WARN_OVER_RATIO` | **1.15** | Warn when `wordCount > targetWordCount * 1.15` (+15%) |
| `REEL_SCRIPT_VO_WARN_UNDER_RATIO` | **0.70** | Warn when `wordCount < targetWordCount * 0.70` (−30%) |

**Char counting:** JavaScript **`.length`** (UTF-16 code units) on trimmed beat text. Grapheme-cluster counting deferred — document limitation for Spanish accents/combined marks.

**Word counting:** Split `voiceoverText` on `/\s+/`, filter empty tokens, **`.length`** of token array. No locale-specific hyphenation in V1.

```ts
export const REEL_SCRIPT_READABILITY_THRESHOLDS = {
  maxCharsPerBeatLine: 40,
  maxLinesPerBeat: 2,
  maxBeatLinesTotal: 8,
  wordsPerSecondTarget: 2.5,
  voWarnOverRatio: 1.15,
  voWarnUnderRatio: 0.70,
} as const;
```

**Client override forbidden:** Extend `findForbiddenReelScriptKeys` with threshold-smuggle keys (BUILD):

`maxCharsPerBeat`, `maxCharsPerBeatLine`, `wordsPerSecond`, `wordsPerSecondTarget`, `thresholds`, `readabilityConfig`, `readability`, `maxBeatLinesTotal`, `maxLinesPerBeat`, `voWarnOverRatio`, `voWarnUnderRatio`.

---

## Pure helpers

**File (BUILD):** `lib/reel-scripts/compute-script-readability.ts`  
**Imports:** `ReelScriptPackage` from `lib/contracts/reel-script`; constants + DTO types from `lib/contracts/reel-script-readability.ts`.

### `parseOnScreenBeats(onScreenText: string): string[]`

| Step | Rule |
|------|------|
| 1 | Split on `\n` (LF; treat `\r\n` as `\n` after normalize or split handles `\r`) |
| 2 | `.trim()` each segment |
| 3 | Drop segments where length === 0 after trim |
| 4 | Return array (no max slice — caller evaluates `too_many_beats`) |

**No client-supplied delimiter or beat array.**

### `computeScriptReadabilityMetrics(pkg: ReelScriptPackage): ReelScriptReadability`

**Input:** Full package — uses `onScreenText`, `voiceoverText`, `targetDurationSec`.

**On-screen evaluation:**

| Check | Condition | Beat warning code | Aggregate warning code |
|-------|-----------|-------------------|------------------------|
| Char per beat | `charCount > maxCharsPerBeatLine` | `chars_exceeded` | `beat_chars` (if any beat fails) |
| Lines per beat | `lineCount > maxLinesPerBeat` where `lineCount` = non-empty sub-lines if segment re-split on `\n` (always **1** for V1 parsed beats) | `lines_exceeded` | `beat_lines` (if any beat fails) |
| Total beats | `beatLines.length > maxBeatLinesTotal` | — | `too_many_beats` |

**Voiceover evaluation:**

```ts
const wordCount = countVoiceoverWords(pkg.voiceoverText);
const targetWordCount = Math.round(
  pkg.targetDurationSec * REEL_SCRIPT_WORDS_PER_SECOND_TARGET,
);
let status: "ok" | "over" | "under" = "ok";
if (wordCount > targetWordCount * REEL_SCRIPT_VO_WARN_OVER_RATIO) status = "over";
else if (wordCount < targetWordCount * REEL_SCRIPT_VO_WARN_UNDER_RATIO) status = "under";
```

**Aggregate:**

```ts
hasWarnings =
  onScreen.warnings.length > 0 ||
  onScreen.beatLines.some((b) => b.warnings.length > 0) ||
  voiceover.status !== "ok";
```

**Side effects:** none — no I/O, no `process.env`, no logging.

### `assertScriptReadabilityForSave(pkg: ReelScriptPackage): AssertScriptReadabilityResult`

**Purpose:** Future Operator inline-edit story — **exported and unit-tested in US-5.2; no caller in BUILD.**

```ts
export type AssertScriptReadabilityResult =
  | { ok: true; metrics: ReelScriptReadability }
  | {
      ok: false;
      metrics: ReelScriptReadability;
      issues: Array<{
        code:
          | "beat_chars_exceeded"
          | "beat_lines_exceeded"
          | "too_many_beats"
          | "voiceover_over"
          | "voiceover_under";
        beatIndex?: number;
        messageKey: string; // i18n key under scripts.readability.*
      }>;
    };
```

| Rule | Detail |
|------|--------|
| `ok: true` | `metrics.hasWarnings === false` |
| `ok: false` | One issue per aggregate/beat/VO failure; includes `messageKey` for future form errors |
| US-5.2 BUILD | **Must not** be called from generate/regenerate or any Server Action |

---

## Zod schemas — `lib/contracts/reel-script-readability.ts`

```ts
import { z } from "zod";

export const onScreenBeatWarningCodeSchema = z.enum([
  "chars_exceeded",
  "lines_exceeded",
]);

export const onScreenAggregateWarningCodeSchema = z.enum([
  "too_many_beats",
  "beat_chars",
  "beat_lines",
]);

export const voiceoverReadabilityStatusSchema = z.enum(["ok", "over", "under"]);

export const reelScriptReadabilityBeatLineSchema = z
  .object({
    index: z.number().int().min(0),
    text: z.string(),
    charCount: z.number().int().min(0),
    lineCount: z.number().int().min(1),
    warnings: z.array(onScreenBeatWarningCodeSchema),
  })
  .strict();

export const reelScriptReadabilityOnScreenSchema = z
  .object({
    beatLines: z.array(reelScriptReadabilityBeatLineSchema),
    totalBeatLines: z.number().int().min(0),
    warnings: z.array(onScreenAggregateWarningCodeSchema),
  })
  .strict();

export const reelScriptReadabilityVoiceoverSchema = z
  .object({
    wordCount: z.number().int().min(0),
    targetWordCount: z.number().int().min(0),
    targetDurationSec: z.number().int().min(15).max(45),
    wordsPerSecondTarget: z.literal(2.5),
    status: voiceoverReadabilityStatusSchema,
  })
  .strict();

export const reelScriptReadabilitySchema = z
  .object({
    onScreen: reelScriptReadabilityOnScreenSchema,
    voiceover: reelScriptReadabilityVoiceoverSchema,
    hasWarnings: z.boolean(),
  })
  .strict();
```

---

## Extended list item — `reelScriptListItemSchema`

**File:** `lib/contracts/reel-script.ts` (BUILD extends US-5.1)

```ts
import { reelScriptReadabilitySchema } from "@/lib/contracts/reel-script-readability";

export const reelScriptListItemSchema = z
  .object({
    // ... existing US-5.1 fields unchanged ...
    readability: reelScriptReadabilitySchema.nullable(),
  })
  .strict();
```

| `status` | `package` | `readability` |
|----------|-----------|---------------|
| `pending` | `null` | **`null`** |
| `generated` | present | **`computeScriptReadabilityMetrics(package)`** |

**Mapper (BUILD):** `lib/reel-scripts/list-reel-scripts-for-week.ts` — after building each generated item, set `readability: computeScriptReadabilityMetrics(script.package)`.

**`getReelScriptsForWeek` action:** **No signature change** — input still `{ weekStart }` strict; gate unchanged.

---

## Server Action — `getReelScriptsForWeek` (extended)

**File:** `lib/reel-scripts/actions/get-reel-scripts-for-week.ts` — **unchanged** action body except downstream mapper output shape.

**Gate:** `requireOperator("handler")` first — **no change**.

**Input:** `getReelScriptsForWeekInputSchema` — `{ weekStart }` only.

**Success shape change:** `items[].readability` added per table above. All other fields unchanged.

---

## Database

**No migration.** Metrics derived at read time from existing columns:

| Column | Usage |
|--------|-------|
| `on_screen_text` | Beat parsing |
| `voiceover_text` | Word count |
| `target_duration_sec` | VO target |

---

## Security (binding — from SECURITY.md)

1. Read gate unchanged — `requireOperator("handler")` first on `getReelScriptsForWeek`.
2. No new persist surface — no script text UPDATE actions.
3. Thresholds server-frozen — client override keys → `FORBIDDEN_FIELDS`.
4. Beat model — newline-split `onScreenText`; no client beat array.
5. Warnings advisory only — US-5.1 `reelScriptPackageSchema` hard bounds unchanged.
6. Plain text UI — warning chrome uses i18n strings + numeric counts only.
7. Tenancy — warnings only on rows from `buildReelScriptListForStrategy` (existing `client_id` scope).
8. Logging — warning codes + counts only — not full script bodies.
9. No agent self-check in US-5.2 BUILD.

---

## i18n keys (BUILD)

Namespace: **`scripts.readability.*`**

| Key | EN (lean) | ES (lean) |
|-----|-----------|-----------|
| `beatCharsExceeded` | Beat {index}: {charCount} chars (max {max}) | Línea {index}: {charCount} caracteres (máx. {max}) |
| `beatLinesExceeded` | Beat {index}: too many lines | Línea {index}: demasiadas líneas |
| `tooManyBeats` | More than {max} on-screen lines | Más de {max} líneas de texto en pantalla |
| `voiceoverOver` | {wordCount} words — target ~{targetWordCount} for {targetDurationSec}s | {wordCount} palabras — objetivo ~{targetWordCount} para {targetDurationSec}s |
| `voiceoverUnder` | {wordCount} words — target ~{targetWordCount} for {targetDurationSec}s | {wordCount} palabras — objetivo ~{targetWordCount} para {targetDurationSec}s |
| `voiceoverOk` | {wordCount} words · target ~{targetWordCount} for {targetDurationSec}s | {wordCount} palabras · objetivo ~{targetWordCount} para {targetDurationSec}s |
| `rowBadge` | Readability warnings | Avisos de legibilidad |

---

## Fixtures

### Generated script — char exceed + VO ok

**Input package (excerpt):**

```json
{
  "onScreenText": "3 checks antes del frío\n✓ Filtro limpio y termostato calibrado para invierno",
  "voiceoverText": "Tres comprobaciones rápidas antes del frío.",
  "targetDurationSec": 15
}
```

**Expected `readability` (abbreviated):**

```json
{
  "onScreen": {
    "beatLines": [
      { "index": 0, "text": "3 checks antes del frío", "charCount": 23, "lineCount": 1, "warnings": [] },
      { "index": 1, "text": "✓ Filtro limpio y termostato calibrado para invierno", "charCount": 52, "lineCount": 1, "warnings": ["chars_exceeded"] }
    ],
    "totalBeatLines": 2,
    "warnings": ["beat_chars"]
  },
  "voiceover": {
    "wordCount": 6,
    "targetWordCount": 38,
    "targetDurationSec": 15,
    "wordsPerSecondTarget": 2.5,
    "status": "under"
  },
  "hasWarnings": true
}
```

### VO over threshold (45s target)

```json
{
  "voiceoverText": "word ".repeat(120).trim(),
  "targetDurationSec": 45
}
```

`targetWordCount = 113`; warn when `wordCount > 129` → `status: "over"`.

### Pending slot

```json
{
  "status": "pending",
  "package": null,
  "readability": null
}
```

---

## Unit test matrix — `lib/reel-scripts/compute-script-readability.test.ts`

| # | Case | Assert |
|---|------|--------|
| 1 | Beat at exactly 40 chars | No `chars_exceeded` |
| 2 | Beat at 41 chars | `chars_exceeded` on beat; `beat_chars` aggregate |
| 3 | Empty lines stripped | `"a\n\nb"` → 2 beats; indices 0, 1 |
| 4 | Whitespace trim | `"  hello  \n world "` → trimmed counts |
| 5 | 9 beat lines | `too_many_beats` aggregate |
| 6 | 8 beat lines | No `too_many_beats` |
| 7 | VO at target | 15s → target 38; 38 words → `status: "ok"` |
| 8 | VO over +15% | 15s, 45 words → `status: "over"` |
| 9 | VO under −30% | 15s, 25 words → `status: "under"` |
| 10 | Unicode emoji in beat | `.length` counts UTF-16 (document behavior) |
| 11 | `hasWarnings` false | All beats ok + VO ok |
| 12 | `assertScriptReadabilityForSave` ok | No issues when metrics clean |
| 13 | `assertScriptReadabilityForSave` fail | Issues array matches warnings |
| 14 | Mapper integration | Generated item has non-null `readability`; pending has `null` |

**Security regression (existing suite):**

| # | Case | Assert |
|---|------|--------|
| S1 | Non-operator `getReelScriptsForWeek` | Still 403 |
| S2 | Smuggled `maxCharsPerBeat` in input | `FORBIDDEN_FIELDS` |
| S3 | No `updateReelScript*` export | Grep / import test |

---

## Out of scope (US-5.2 BUILD)

| Topic | Owner |
|-------|-------|
| Operator inline script edit / save | Future story |
| Blocking generate/regenerate on warnings | Never in V1 |
| Agent self-check / prompt nudge | content-agents-engineer deferred |
| Cliente readability view | US-11.x |
| Per-formato playbook limit overrides | Future |
| Caption char limits | US-6.x |
| Assembly subtitle burn-in | US-9.x |
| DB persistence of warning flags | — |
| 9:16 phone-frame visual preview | — |

---

## Reviewed by FE

<!-- nextjs-frontend: add "Reviewed by FE — YYYY-MM-DD" line here before BUILD -->
