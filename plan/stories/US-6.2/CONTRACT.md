# API Contract — US-6.2 CTA variant selection for caption testing

**Story:** US-6.2  
**Status:** Frozen — 2026-08-29 (awaiting FE signoff)  
**Security:** `plan/stories/US-6.2/SECURITY.md` (APPROVE WITH CONDITIONS — binding freeze; reconciled below)  
**Spec review:** `plan/stories/US-6.2/SPEC-REVIEW.md` (GAPS — resolved by this contract)  
**Depends on:** US-6.1 ✅ `neuramark_reel_captions` · `cta_variants` jsonb (2–4) · Caption tab · `lib/contracts/reel-caption.ts` · `getReelScriptsForWeek` · `regenerateReelCaption` · US-14.5 ✅ `requireOperator()`  
**Identity seam:** `lib/auth/get-current-user.ts` / `requireOperator()` (unchanged)  
**Feature branch:** `feature/US-6.2-cta-selection`  
**Error envelope style:** same class as US-6.1 (`ok: true` vs `{ ok: false, error: { code, fields?, messageKey? } }`)

**This document is CONTRACT ONLY.** Zod below is the BUILD sketch for extensions to `lib/contracts/reel-caption.ts`, new modules under `lib/reel-captions/`, and targeted changes to `lib/reel-scripts/list-reel-scripts-for-week.ts` and `lib/reel-captions/persist-reel-caption.ts`.

**Terminology:** **Paquete de guion** · **caption de Instagram** · **variantes CTA** · **Operator** · **Flujo de aprobación** · **Preview in context**. Technical enums (`selected_cta_index`, `selectReelCaptionCta`) OK in code/DB. Do **not** use CONTEXT _Evitar_ terms in product-facing strings.

**SPEC-REVIEW blocking gaps closed in this contract:**

| # | Gap | Resolution |
|---|-----|------------|
| 1 | Selection actor vs SPEC “elegir variante CTA al aprobar” | **V1 frozen:** **Operator** selects on `/operator/scripts` Caption tab via `selectReelCaptionCta`; persist on select (not at Cliente approval). **Cliente** sees server-derived **`selectedCtaText`** read-only in US-11.1 approval package. Cliente variant picker **out of scope** unless SPEC amended |
| 2 | Effective IG caption for approval/export/publish | Server-only **`buildEffectiveInstagramCaption`** + shared **`IG_CTA_SEPARATOR`** (`"\n\n"`); US-11.1 / US-11.3 / US-12.x **must import** — never concatenate in FE for export/publish |
| 3 | Effective length bound (caption + CTA vs 2200) | **`computeEffectiveCaptionCharCount`** on caption body + separator + selected CTA (hashtags separate). List DTO exposes **`effectiveCaptionCharCount`** + **`effectiveCaptionOverLimit`** (warn when `> IG_CAPTION_MAX_CHARS`). Operator preview **warn-only** in US-6.2; export/publish paths reject with **`EFFECTIVE_CAPTION_TOO_LONG`** (US-11.3 / US-12 — documented seam, not implemented in 6.2 BUILD) |
| 4 | NULL `selected_cta_index` before approval queue | **US-11.1** gate: approval package creation returns **`CAPTION_CTA_NOT_SELECTED`** when caption exists and `selectedCtaIndex === null`. US-6.2 exposes nullable DTO only — **no** `approvals` table changes |
| 5 | Regenerate caption clears `selected_cta_index` | **`persistReelCaption` UPSERT** sets **`selected_cta_index = NULL`** on generate/regenerate content replace; FE **`scripts.caption.ctaSelect.clearedOnRegen`** |
| 6 | `selectReelCaptionCta` contract | Frozen input `{ weekStart, slotIndex, selectedCtaIndex }`; IDOR-safe week→strategy→script→caption chain; bounds vs DB `cta_variants.length`; forbidden keys; error codes; `revalidatePath` |
| 7 | List DTO + migration | **`reelCaptionSummarySchema`** extended with **`selectedCtaIndex`**, **`selectedCtaText`**, effective-length fields; migration **`selected_cta_index integer NULL`** on **`neuramark_reel_captions`** |

**SECURITY reconciliation (binding):**

| Topic | SECURITY condition | **Frozen in this contract** |
|-------|-------------------|----------------------------|
| Gate | `requireOperator("handler")` first on select | **Yes** — first await on `selectReelCaptionCta` |
| Input pointer | `captionId` **or** `{ weekStart, slotIndex }` | **`{ weekStart, slotIndex }` only** — consistency with `regenerateReelCaption`; tenancy reload mandatory |
| Bounds | `0 <= index < cta_variants.length` from DB | **`CTA_INDEX_OUT_OF_BOUNDS`** (422), no UPDATE |
| Free-text guard | Index only — no CTA/caption text | Separate **`findForbiddenSelectReelCaptionCtaKeys`**; **`FORBIDDEN_FIELDS`** |
| Generate/regen | `selectedCtaIndex` stays forbidden | Unchanged on US-6.1 actions |
| UPDATE scope | Index column only | **`UPDATE … SET selected_cta_index = $index`** — never `caption` / `cta_variants` |
| Regen reset | Clear index on content replace | **`selected_cta_index = NULL`** in UPSERT row builder |
| Read DTO | Server-derived `selectedCtaText` | **`resolveSelectedCtaVariant`** helper; FE must not compute export-facing CTA |
| Preview | Plain text only | FE concatenates DTO strings in text nodes — no HTML |
| Downstream | US-11 uses server helper | **`resolveSelectedCtaVariant`** + **`buildEffectiveInstagramCaption`** exported from contract module |

---

## Overview

An authenticated **Operator** selects **one variante CTA** from the **already-persisted** `cta_variants` array (US-6.1) for each Reel on an approved week. The server:

1. Gates **`selectReelCaptionCta`** with `requireOperator("handler")` — 401/403, **no UPDATE** on failure.
2. Resolves **`clientId` server-side only** (V1: `getCurrentUser().id` after operator gate).
3. Resolves caption row via **IDOR-safe chain**: approved strategy for `weekStart` → script for `slotIndex` → `neuramark_reel_captions` by `reel_script_id` + `client_id`.
4. Validates **`selectedCtaIndex`** against **DB-loaded** `cta_variants.length` (0-based integer).
5. **UPDATE** only **`selected_cta_index`** — never client-supplied CTA text or variant arrays.
6. Extends **`getReelScriptsForWeek`** list DTO with **`selectedCtaIndex`**, server-derived **`selectedCtaText`**, and effective-length warn flags for Operator preview.
7. **Regenerate/generate UPSERT** (US-6.1 paths) **reset** `selected_cta_index` to **NULL** when caption content is replaced.

**No caption agent changes, no Cliente UI, no publish, no approval table mutations** in US-6.2.

**Surfaces**

| # | Surface | Kind | New vs reused |
|---|---------|------|---------------|
| 1 | `/operator/scripts` Caption tab | FE TabView panel | **Extended** — radio/select on CTA variants + preview-in-context block |
| 2 | `selectReelCaptionCta` | Server Action | **New** — persist selected index |
| 3 | `getReelScriptsForWeek` | Server Action | **Extended** — `items[].caption.selectedCtaIndex`, `selectedCtaText`, effective-length fields |
| 4 | `resolveSelectedCtaVariant` | Contract helper (shared) | **New** — derive CTA text from index + record |
| 5 | `buildEffectiveInstagramCaption` | Contract helper (shared) | **New** — body + separator + selected CTA (+ optional hashtags for export) |
| 6 | `computeEffectiveCaptionCharCount` | Contract helper (shared) | **New** — warn/export length policy |
| 7 | `loadReelCaptionForClient` | Server-only helper | **New** — tenancy-scoped caption load by week+slot |
| 8 | `updateSelectedCtaIndex` | Server-only helper | **New** — index-only UPDATE |
| 9 | Zod + types | `lib/contracts/reel-caption.ts` | **Extended** |
| 10 | Migration | `neuramark_reel_captions.selected_cta_index` | **New** column |
| 11 | `persistReelCaption` | Server-only helper | **Extended** — reset `selected_cta_index` on content UPSERT |
| 12 | `listReelCaptionsForStrategy` / list mapper | Server-only | **Extended** — map selection fields |

**Forbidden surfaces (BUILD veto):**

- Public Route Handler for CTA select.
- Cliente approval UI or routes (US-11.1).
- Client-supplied `selectedCtaText`, `ctaText`, or `ctaVariants` on any mutation.
- `selectedCtaIndex` on `generateReelCaptions` / `regenerateReelCaption` (remains forbidden).
- Mutating stored `caption` column with selected CTA (preview is derived display only).
- Auto-select index `0` on caption generate/regenerate.
- Operator free-text CTA override or “clear selection” mutation (deselect = regen only in V1).
- Batch “select same index for all Reels” action.

**Why Server Action:** UI-coupled Operator select on Caption tab; same CSRF/origin posture as US-6.1 generate/regenerate.

**Frontend consumers (nextjs-frontend BUILD notes)**

| Consumer | Route / component | Contract surface | FE notes |
|----------|-------------------|------------------|----------|
| Scripts page | `app/(app)/operator/scripts/page.tsx` | `getReelScriptsForWeek({ weekStart })` | Read extended `items[].caption`; no Supabase in client |
| Caption tab CTA select | `ScriptsPageView` ```991:1013:components/scripts/ScriptsPageView.tsx``` | `selectReelCaptionCta({ weekStart, slotIndex, selectedCtaIndex })` | **Replace** read-only variant cards with **PrimeReact `RadioButton` group** (PO lean: radio cards). **Immediate save** on select (one tap — no separate Save button). Bind `value={index}` 0-based. Disable while action pending |
| Preview in context | Same Caption tab panel | DTO: `record.caption`, `selectedCtaText`, `effectiveCaptionOverLimit` | Read-only plain-text block showing **`buildEffectiveInstagramCaption` output mirrored locally** via `IG_CTA_SEPARATOR` import from contract — label distinct from stored caption field. **Warn styling** when `effectiveCaptionOverLimit === true`. **No preview append** when `selectedCtaIndex === null` — show unselected hint |
| Regenerate caption | Existing regen button | `regenerateReelCaption({ weekStart, slotIndex })` | After success, UI reflects **`selectedCtaIndex === null`**; show **`scripts.caption.ctaSelect.clearedOnRegen`** |
| Error toasts | Caption tab | Error codes below | Map `CTA_INDEX_OUT_OF_BOUNDS`, `CAPTION_NOT_FOUND`, `FORBIDDEN_FIELDS`, `VALIDATION_ERROR` |
| i18n | `messages/en.json` / `es.json` | **`scripts.caption.ctaSelect.*`** | `selectLabel`, `previewHeading`, `unselectedHint`, `selectionSaved`, `indexError`, `clearedOnRegen`, `effectiveLengthWarn` |
| Constants | Import from `@/lib/contracts/reel-caption` | `IG_CTA_SEPARATOR`, `IG_CAPTION_MAX_CHARS` | Use shared separator — do not hardcode `"\n\n"` in FE only |
| Accessibility | Radio group | — | `role="radiogroup"` + `aria-labelledby`; selection not color-only |
| Downstream | US-11.1 (not built in 6.2) | `selectedCtaIndex`, `selectedCtaText` on list DTO | Cliente package reads server fields — **do not** recompute `selectedCtaText` from `record.ctaVariants` for export-facing UI |

**Server-only modules (planned BUILD)**

| Module | Purpose |
|--------|---------|
| `lib/reel-captions/actions/select-reel-caption-cta.ts` | `"use server"` `selectReelCaptionCta` |
| `lib/reel-captions/load-reel-caption-for-client.ts` | `import "server-only"` — week+slot → caption row with tenancy |
| `lib/reel-captions/update-selected-cta-index.ts` | `import "server-only"` — index-only UPDATE |
| `lib/reel-captions/find-forbidden-select-keys.ts` | Forbidden-key scan for select action (separate from generate/regen) |
| `lib/contracts/reel-caption.ts` | **Extended** — select schemas, helpers, error codes, summary DTO |
| `lib/reel-captions/persist-reel-caption.ts` | **Extended** — `selected_cta_index: null` on content UPSERT; map column on read |
| `lib/reel-scripts/list-reel-scripts-for-week.ts` | **Extended** — attach selection + effective-length fields |
| `lib/reel-captions/select-reel-caption-cta.test.ts` | Automated tests |

---

## Frozen decisions (from SECURITY.md + SPEC-REVIEW + PO TASKS)

Do not reopen.

| # | Topic | Freeze |
|---|-------|--------|
| 1 | **Selection actor (V1)** | **Operator** selects on Caption tab before queue; **Cliente approves package** including Operator-chosen CTA in US-11.1 — Cliente does **not** pick variant in 6.2 |
| 2 | **Persist timing** | On **Operator select** (`selectReelCaptionCta` success) — **not** deferred to Cliente approval event |
| 3 | **Default on generate/regenerate** | **`selected_cta_index = NULL`** — no auto-select index 0 |
| 4 | **Input pointer** | **`{ weekStart, slotIndex, selectedCtaIndex }` only** — no `captionId` in V1 schema (simplifies forbidden-key surface; week workspace consistency with regen) |
| 5 | **Index validation** | **`0 <= selectedCtaIndex < cta_variants.length`** using **loaded row** array length — not `CTA_VARIANT_MAX` alone |
| 6 | **CTA text authority** | **`selectedCtaText = cta_variants[selectedCtaIndex]`** server-side only — request never carries CTA body |
| 7 | **Preview separator** | **`IG_CTA_SEPARATOR = "\n\n"`** — shared by FE preview and `buildEffectiveInstagramCaption` |
| 8 | **Effective length (6.2)** | **Warn-only** in Operator UI when `effectiveCaptionCharCount > IG_CAPTION_MAX_CHARS`; select action **still succeeds** |
| 9 | **Effective length (export/publish)** | **`buildEffectiveInstagramCaption`** + **`EFFECTIVE_CAPTION_TOO_LONG`** reject at US-11.3 / US-12 — documented seam |
| 10 | **Approval gate owner** | **US-11.1** returns **`CAPTION_CTA_NOT_SELECTED`** when caption generated but index null — 6.2 does not block Operator workflow |
| 11 | **Deselect / clear** | **Out of V1** — only regen clears to NULL; no explicit “unselect” action |
| 12 | **Select UX** | Radio change **immediately** calls Server Action (no debounce in V1) |
| 13 | **revalidatePath** | `revalidatePath("/operator/scripts")` after successful select |
| 14 | **Logging** | `captionId`, `reelScriptId`, `clientId`, `slotIndex`, `selectedCtaIndex`, action, error **codes** — never full caption/variant bodies |
| 15 | **US-6.1 unchanged** | No agent/prompt changes; no `cta_variants` mutation from select path |
| 16 | **QA handoff (non-blocking)** | US-10.1 should treat **`selectedCtaText ?? script.package.cta`** as CTA under test — no QA job in 6.2 BUILD |
| 17 | **AC #1 dependency** | “At least 2 CTA variants” enforced by US-6.1 generation — select returns **`CAPTION_NOT_FOUND`** when no caption row (not a generation re-test) |

### Strip vs reject (select action body)

| Keys | Behavior |
|------|----------|
| `weekStart` | **Accept** — `trendWeekStartSchema` |
| `slotIndex` | **Accept** — integer 0–6 |
| `selectedCtaIndex` | **Accept** — integer ≥ 0 (upper bound re-checked vs loaded array) |
| `clientId`, `client_id`, `captionId`, `caption_id` | **Reject** → `FORBIDDEN_FIELDS` |
| `ctaText`, `selectedCtaText`, `cta`, `ctaVariants`, `cta_variants` | **Reject** → `FORBIDDEN_FIELDS` |
| `caption`, `hashtags`, `keywords` | **Reject** → `FORBIDDEN_FIELDS` |
| `strategyId`, `strategy_id`, `reelScriptId`, `reel_script_id` | **Reject** → `FORBIDDEN_FIELDS` |
| `providerKey`, `provider_key`, `status`, `approved`, script text fields | **Reject** → `FORBIDDEN_FIELDS` |
| Unknown keys | **Reject** → `VALIDATION_ERROR` (`.strict()`) |

**Generate/regenerate forbidden keys unchanged** — `selectedCtaIndex` / `selected_cta_index` remain in `findForbiddenReelCaptionKeys` for US-6.1 actions.

---

## Shared constants and helpers (frozen)

**BUILD:** extend `lib/contracts/reel-caption.ts` — **FE may import** separator, length helpers, and types; Zod parse for select input stays server-side.

```ts
export const IG_CTA_SEPARATOR = "\n\n" as const;

/** Resolve selected CTA plain text from persisted record + index. */
export function resolveSelectedCtaVariant(
  record: ReelCaptionRecord,
  selectedCtaIndex: number | null,
): string | null {
  if (selectedCtaIndex === null) return null;
  if (selectedCtaIndex < 0 || selectedCtaIndex >= record.ctaVariants.length) {
    return null;
  }
  return record.ctaVariants[selectedCtaIndex] ?? null;
}

/** Body + separator + selected CTA — hashtags optional (export/publish seam). */
export function buildEffectiveInstagramCaption(params: {
  caption: string;
  selectedCtaText: string | null;
  hashtags?: string[];
  separator?: string;
}): string {
  const sep = params.separator ?? IG_CTA_SEPARATOR;
  const bodyWithCta =
    params.selectedCtaText != null && params.selectedCtaText.length > 0
      ? `${params.caption}${sep}${params.selectedCtaText}`
      : params.caption;
  if (!params.hashtags?.length) return bodyWithCta;
  const tagLine = params.hashtags.join(" ");
  return `${bodyWithCta}${sep}${tagLine}`;
}

/** Effective IG body length for warn/export policy (caption + separator + CTA only). */
export function computeEffectiveCaptionCharCount(params: {
  caption: string;
  selectedCtaText: string | null;
  separator?: string;
}): number {
  const sep = params.separator ?? IG_CTA_SEPARATOR;
  if (params.selectedCtaText == null || params.selectedCtaText.length === 0) {
    return params.caption.length;
  }
  return params.caption.length + sep.length + params.selectedCtaText.length;
}

export function isEffectiveCaptionOverLimit(charCount: number): boolean {
  return charCount > IG_CAPTION_MAX_CHARS;
}
```

| Policy surface | When over 2200 | Code / UX |
|----------------|----------------|-----------|
| Operator preview (US-6.2) | **Warn only** | `effectiveCaptionOverLimit: true`; i18n `scripts.caption.ctaSelect.effectiveLengthWarn` |
| `selectReelCaptionCta` | **Allow** persist | No error — Operator may select long combo; regen/edit path is regenerate caption |
| Export/download (US-11.3) | **Reject** | `EFFECTIVE_CAPTION_TOO_LONG` |
| Instagram publish (US-12.x) | **Reject** | `EFFECTIVE_CAPTION_TOO_LONG` |

---

## Caption summary DTO extension (frozen)

```ts
export const reelCaptionSummarySchema = z
  .object({
    status: z.enum(["pending", "generated"]),
    captionId: z.string().uuid().nullable(),
    record: reelCaptionRecordSchema.nullable(),
    selectedCtaIndex: z.number().int().min(0).nullable(),
    selectedCtaText: reelCaptionCtaVariantSchema.nullable(),
    effectiveCaptionCharCount: z.number().int().min(0),
    effectiveCaptionOverLimit: z.boolean(),
    updatedAt: z.string().datetime().nullable(),
    stale: z.boolean(),
  })
  .strict();
```

**Pending summary constant (extended):**

```ts
export const PENDING_REEL_CAPTION_SUMMARY: ReelCaptionSummary = {
  status: "pending",
  captionId: null,
  record: null,
  selectedCtaIndex: null,
  selectedCtaText: null,
  effectiveCaptionCharCount: 0,
  effectiveCaptionOverLimit: false,
  updatedAt: null,
  stale: false,
};
```

**Enrichment rules (`buildReelScriptListForStrategy`):**

| Condition | `selectedCtaIndex` | `selectedCtaText` | Effective length |
|-----------|-------------------|-------------------|------------------|
| Pending / no caption row | `null` | `null` | `0`, `false` |
| Generated, index NULL | `null` | `null` | `record.caption.length`, `false` |
| Generated, index set | from DB column | `resolveSelectedCtaVariant(record, index)` | `computeEffectiveCaptionCharCount(...)`, warn flag |

**`reelCaptionRecordSchema` unchanged** — selection metadata lives on **summary**, not inside `record`.

**US-11.1 approval package seam (downstream, not built in 6.2):**

```ts
type ApprovalCaptionHandoff = Pick<
  ReelCaptionSummary,
  "captionId" | "selectedCtaIndex" | "selectedCtaText" | "record"
>;
// US-11.1: reject package when record != null && selectedCtaIndex === null → CAPTION_CTA_NOT_SELECTED
// US-11.1 Cliente UI: show selectedCtaText read-only — not variant picker
// US-11.3 export: buildEffectiveInstagramCaption({ caption, selectedCtaText, hashtags }) server-side
```

---

## Select action schemas (frozen)

```ts
export const selectReelCaptionCtaInputSchema = z
  .object({
    weekStart: trendWeekStartSchema,
    slotIndex: z.number().int().min(0).max(6),
    selectedCtaIndex: z.number().int().min(0).max(CTA_VARIANT_MAX - 1),
  })
  .strict();

export const selectReelCaptionCtaSuccessSchema = z
  .object({
    ok: z.literal(true),
    weekStart: trendWeekStartSchema,
    slotIndex: z.number().int().min(0).max(6),
    captionId: z.string().uuid(),
    reelScriptId: z.string().uuid(),
    selectedCtaIndex: z.number().int().min(0),
    selectedCtaText: reelCaptionCtaVariantSchema,
    effectiveCaptionCharCount: z.number().int().min(0),
    effectiveCaptionOverLimit: z.boolean(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type SelectReelCaptionCtaInput = z.infer<
  typeof selectReelCaptionCtaInputSchema
>;
export type SelectReelCaptionCtaSuccess = z.infer<
  typeof selectReelCaptionCtaSuccessSchema
>;
export type SelectReelCaptionCtaResult =
  | SelectReelCaptionCtaSuccess
  | ReelCaptionMutationError;
```

**Extended error codes:**

```ts
export const reelCaptionErrorCodeSchema = z.enum([
  // ... existing US-6.1 codes ...
  "CTA_INDEX_OUT_OF_BOUNDS",
  "CAPTION_NOT_FOUND",
  "CAPTION_CTA_NOT_SELECTED", // US-11.1 gate — not returned by select in 6.2
  "EFFECTIVE_CAPTION_TOO_LONG", // US-11.3 / US-12 — not returned by select in 6.2
]);
```

| Code | HTTP lean | `messageKey` | When |
|------|-----------|--------------|------|
| `CTA_INDEX_OUT_OF_BOUNDS` | 422 | `scripts.caption.ctaSelect.errors.indexOutOfBounds` | `selectedCtaIndex >= cta_variants.length` after row load |
| `CAPTION_NOT_FOUND` | 404 | `scripts.caption.ctaSelect.errors.captionNotFound` | No caption row for resolved script slot (or cross-tenant) |
| `CAPTION_CTA_NOT_SELECTED` | 422 | `scripts.caption.ctaSelect.errors.notSelected` | **US-11.1 only** — approval package when index null |
| `EFFECTIVE_CAPTION_TOO_LONG` | 422 | `scripts.caption.ctaSelect.errors.effectiveTooLong` | **US-11.3 / US-12 only** — export/publish reject |

All other codes reuse US-6.1 table (`UNAUTHENTICATED`, `FORBIDDEN`, `VALIDATION_ERROR`, `FORBIDDEN_FIELDS`, `STRATEGY_NOT_APPROVED`, `SCRIPT_NOT_FOUND`, `SLOT_NOT_FOUND`, `NOT_FOUND`, `INTERNAL_ERROR`, …).

---

## Server Action — `selectReelCaptionCta` (**new**)

**File (BUILD):** `lib/reel-captions/actions/select-reel-caption-cta.ts`

**Consumer:** Operator Scripts page Caption tab — radio/select among CTA variants.

**Gate:** `await requireOperator("handler")` — **first** await.

**Input:** `selectReelCaptionCtaInputSchema`

**Tenancy:** `clientId = (await requireOperator("handler")).id`

**Flow:**

1. `requireOperator("handler")`
2. `findForbiddenSelectReelCaptionCtaKeys(rawInput)` → `FORBIDDEN_FIELDS`
3. Parse input with `selectReelCaptionCtaInputSchema`
4. `getApprovedStrategyForWeek({ clientId, weekStart })` — null / not approved → `STRATEGY_NOT_APPROVED`
5. `loadReelCaptionForClient({ clientId, weekStart, slotIndex })`:
   - Resolve approved strategy + script row for slot (same chain as US-6.1 regen)
   - SELECT caption WHERE `reel_script_id` AND `client_id`
   - Missing / foreign tenant → **`CAPTION_NOT_FOUND`** (404 uniform — no cross-tenant leak)
6. Parse `cta_variants` via existing record mapper — invalid / `< CTA_VARIANT_MIN` → **`CAPTION_NOT_FOUND`** (treat as not selectable)
7. If `selectedCtaIndex >= ctaVariants.length` → **`CTA_INDEX_OUT_OF_BOUNDS`**, no UPDATE
8. `updateSelectedCtaIndex({ captionId, clientId, selectedCtaIndex })` — UPDATE index column only; bump `updated_at`
9. Compute `selectedCtaText`, `effectiveCaptionCharCount`, `effectiveCaptionOverLimit`
10. `revalidatePath("/operator/scripts")`
11. Return success envelope

**Success response shape:** see `selectReelCaptionCtaSuccessSchema` above.

**Does not:** mutate `caption`, `cta_variants`, hashtags, keywords; call LLM; accept `captionId` pointer.

---

## Server helper — `loadReelCaptionForClient` (**new**)

**File (BUILD):** `lib/reel-captions/load-reel-caption-for-client.ts` (`import "server-only"`)

```ts
export type ReelCaptionForClient = {
  captionId: string;
  reelScriptId: string;
  clientId: string;
  slotIndex: number;
  record: ReelCaptionRecord;
  selectedCtaIndex: number | null;
  updatedAt: string;
};

export async function loadReelCaptionForClient(params: {
  clientId: string;
  weekStart: string;
  slotIndex: number;
}): Promise<ReelCaptionForClient | null> {
  // 1. getApprovedStrategyForWeek / loadApprovedStrategyForScriptJob
  // 2. Resolve script row for slotIndex under clientId + strategyId
  // 3. SELECT neuramark_reel_captions WHERE reel_script_id AND client_id
  // 4. Map row including selected_cta_index column
  // null → CAPTION_NOT_FOUND / SCRIPT_NOT_FOUND / STRATEGY_NOT_APPROVED at action layer
}
```

| Rule | Detail |
|------|--------|
| Tenancy | **Always** `client_id = $serverResolvedClientId` |
| IDOR | Foreign week/slot/script → **null** → action maps to **404** / `CAPTION_NOT_FOUND` |
| Used by | `selectReelCaptionCta`; optional reuse in US-11 serializers |

---

## Server helper — `updateSelectedCtaIndex` (**new**)

**File (BUILD):** `lib/reel-captions/update-selected-cta-index.ts` (`import "server-only"`)

```ts
export async function updateSelectedCtaIndex(params: {
  captionId: string;
  clientId: string;
  selectedCtaIndex: number;
}): Promise<{ ok: true; updatedAt: string } | { ok: false }> {
  // UPDATE neuramark_reel_captions
  // SET selected_cta_index = $index
  // WHERE id = $captionId AND client_id = $clientId
  // Never touch caption / cta_variants / hashtags / keywords
}
```

---

## Server Action — `getReelScriptsForWeek` (**extended**)

**File (BUILD):** `lib/reel-scripts/list-reel-scripts-for-week.ts` (existing — extend mapper)

**Change:** When building `caption` summary from `listReelCaptionsForStrategy` rows:

1. Load `selected_cta_index` from DB row (nullable integer).
2. Set `selectedCtaText = resolveSelectedCtaVariant(record, selectedCtaIndex)`.
3. Set `effectiveCaptionCharCount` / `effectiveCaptionOverLimit` via helpers.
4. If DB index non-null but out of bounds vs current variants (data drift — should not happen post-regen reset), treat as **`selectedCtaIndex: null`, `selectedCtaText: null`** and log internal warning — FE shows unselected state.

**Gate:** unchanged — `requireOperator("handler")` first on action wrapper.

---

## US-6.1 mutation extension — regenerate/generate UPSERT

**File (BUILD):** `lib/reel-captions/persist-reel-caption.ts`

**Change:** `recordToRow` / UPSERT payload **must include**:

```ts
selected_cta_index: null,
```

on every caption **content replace** (generate batch, single regenerate). Selection is wiped when variants change — Operator must re-select.

**`listReelCaptionsForStrategy` / `mapCaptionRow`:** SELECT and map `selected_cta_index` column onto row type used by list builder.

---

## Database

### Migration file name (frozen)

**`supabase/migrations/20260830500000_neuramark_reel_captions_selected_cta_index.sql`**

```sql
-- US-6.2: Operator-selected CTA variant index (0-based into cta_variants jsonb).

ALTER TABLE public.neuramark_reel_captions
  ADD COLUMN selected_cta_index integer NULL;

ALTER TABLE public.neuramark_reel_captions
  ADD CONSTRAINT neuramark_reel_captions_selected_cta_index_nonneg_check
  CHECK (selected_cta_index IS NULL OR selected_cta_index >= 0);

COMMENT ON COLUMN public.neuramark_reel_captions.selected_cta_index IS
  '0-based index into cta_variants jsonb; NULL until Operator selects via selectReelCaptionCta (US-6.2). Upper bound enforced in app layer against jsonb array length.';
```

| Rule | Detail |
|------|--------|
| Upper bound | **App layer only** — `selectedCtaIndex < jsonb_array_length(cta_variants)` on select |
| Default | **NULL** — no DB default other than NULL |
| RLS | **Unchanged** — deny-by-default; service-role Node only |
| No new tables | — |

### Column map (TS ↔ DB)

| TS (summary / row) | DB column | Notes |
|--------------------|-----------|-------|
| `selectedCtaIndex` | `selected_cta_index` | nullable integer; 0-based |
| `selectedCtaText` | — | **Derived** — not stored |
| `effectiveCaptionCharCount` | — | **Derived** |
| `effectiveCaptionOverLimit` | — | **Derived** |

---

## State transitions

### `selected_cta_index` column

| Event | Effect |
|-------|--------|
| Caption generate (first INSERT) | **`NULL`** |
| Caption regenerate UPSERT | **`NULL`** (content replaced) |
| `selectReelCaptionCta` success | Set to validated index |
| Script regenerate (US-5.1) | **Unchanged** — caption row untouched; stale badge may apply |
| Explicit deselect | **Not in V1** — only regen clears |

---

## Fixtures (BUILD / FE mocks / tests)

### `selectReelCaptionCta` — happy

**Request:**

```json
{
  "weekStart": "2026-01-05",
  "slotIndex": 0,
  "selectedCtaIndex": 1
}
```

**Response:**

```json
{
  "ok": true,
  "weekStart": "2026-01-05",
  "slotIndex": 0,
  "captionId": "c1111111-1111-4111-8111-111111111111",
  "reelScriptId": "11111111-1111-4111-8111-111111111111",
  "selectedCtaIndex": 1,
  "selectedCtaText": "Guarda este video y comparte con tu vecino.",
  "effectiveCaptionCharCount": 118,
  "effectiveCaptionOverLimit": false,
  "updatedAt": "2026-01-06T11:30:00.000Z"
}
```

### `selectReelCaptionCta` — index out of bounds

**Request:** `{ "weekStart": "2026-01-05", "slotIndex": 0, "selectedCtaIndex": 3 }` when row has 2 variants (indices 0–1)

**Response:**

```json
{
  "ok": false,
  "error": {
    "code": "CTA_INDEX_OUT_OF_BOUNDS",
    "messageKey": "scripts.caption.ctaSelect.errors.indexOutOfBounds"
  }
}
```

### `selectReelCaptionCta` — forbidden CTA text smuggling

**Request:**

```json
{
  "weekStart": "2026-01-05",
  "slotIndex": 0,
  "selectedCtaIndex": 0,
  "selectedCtaText": "Evil CTA"
}
```

**Response:**

```json
{
  "ok": false,
  "error": {
    "code": "FORBIDDEN_FIELDS",
    "messageKey": "scripts.caption.errors.forbiddenFields"
  }
}
```

### `getReelScriptsForWeek` — caption with selection

```json
{
  "caption": {
    "status": "generated",
    "captionId": "c1111111-1111-4111-8111-111111111111",
    "updatedAt": "2026-01-06T11:30:00.000Z",
    "stale": false,
    "selectedCtaIndex": 1,
    "selectedCtaText": "Guarda este video y comparte con tu vecino.",
    "effectiveCaptionCharCount": 118,
    "effectiveCaptionOverLimit": false,
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
```

### Preview-in-context (FE-only display)

When `selectedCtaIndex === 1` above:

```
Antes del primer frío, revisa estos tres puntos en tu calefacción.

Guarda este video y comparte con tu vecino.
```

(Separator = `IG_CTA_SEPARATOR` = `"\n\n"`.)

### Effective length warn example

Caption 2150 chars + CTA 100 chars → `effectiveCaptionCharCount: 2154`, `effectiveCaptionOverLimit: false`.  
Caption 2150 + CTA 100 with separator → if total **> 2200**, `effectiveCaptionOverLimit: true` — FE warn styling; select still succeeds.

---

## Unit test matrix (frozen)

**File (BUILD):** `lib/reel-captions/select-reel-caption-cta.test.ts`

| # | Area | Test | Expected |
|---|------|------|----------|
| 1 | Schema | `selectReelCaptionCtaInputSchema` accepts valid input | pass |
| 2 | Schema | Rejects unknown keys (`.strict()`) | `VALIDATION_ERROR` |
| 3 | Schema | Rejects float `selectedCtaIndex` | `VALIDATION_ERROR` |
| 4 | Helper | `resolveSelectedCtaVariant` index 1 of 2 | correct string |
| 5 | Helper | `resolveSelectedCtaVariant` null index | null |
| 6 | Helper | `buildEffectiveInstagramCaption` with CTA + hashtags | frozen separator order |
| 7 | Helper | `computeEffectiveCaptionCharCount` includes separator | correct count |
| 8 | Helper | `isEffectiveCaptionOverLimit` at 2201 | true |
| 9 | Select | Non-operator | 403, no UPDATE |
| 10 | Select | Forbidden `selectedCtaText` | `FORBIDDEN_FIELDS` |
| 11 | Select | Forbidden `ctaVariants` | `FORBIDDEN_FIELDS` |
| 12 | Select | Forbidden `caption` | `FORBIDDEN_FIELDS` |
| 13 | Select | No caption row for slot | `CAPTION_NOT_FOUND` |
| 14 | Select | Index 99 with 2 variants | `CTA_INDEX_OUT_OF_BOUNDS` |
| 15 | Select | Happy path index 0 | UPDATE index only; success envelope |
| 16 | Select | Foreign week / IDOR | `CAPTION_NOT_FOUND` / 404 |
| 17 | Select | Draft strategy | `STRATEGY_NOT_APPROVED` |
| 18 | Read | List DTO includes `selectedCtaIndex` + `selectedCtaText` | mapped |
| 19 | Read | Pending caption → null selection fields | defaults |
| 20 | Regen | After regenerate UPSERT → `selected_cta_index` NULL | DB assertion |
| 21 | Generate | Batch generate UPSERT → `selected_cta_index` NULL | DB assertion |
| 22 | Generate/regen | `selectedCtaIndex` on generate input still forbidden | `FORBIDDEN_FIELDS` |
| 23 | Preview | No `dangerouslySetInnerHTML` on caption/CTA in ScriptsPageView | grep/regression |

---

## Security (binding summary from SECURITY.md)

1. **Gate:** `requireOperator("handler")` **first** on **`selectReelCaptionCta`**; 401/403, no UPDATE on failure.
2. **Input:** `.strict()` — **`weekStart`**, **`slotIndex`**, **`selectedCtaIndex`** only; no CTA/caption text — **`FORBIDDEN_FIELDS`** via dedicated forbidden-key scan.
3. **Generate/regen unchanged:** `selectedCtaIndex` remains **forbidden** on US-6.1 mutation schemas.
4. **Tenancy:** `client_id` **server-resolved only**; caption load **always** filters by tenancy; IDOR → **404** / `CAPTION_NOT_FOUND`.
5. **Bounds:** validate **`0 <= selectedCtaIndex < cta_variants.length`** against **DB-loaded** array; else **`CTA_INDEX_OUT_OF_BOUNDS`**, no UPDATE.
6. **No free-text CTA:** resolved string from **`cta_variants[index]`** only.
7. **UPDATE scope:** **`selected_cta_index` column only** on select action.
8. **Regen reset:** caption content UPSERT sets **`selected_cta_index = NULL`**.
9. **Preview:** plain text only — no HTML on caption/CTA preview.
10. **Read DTO:** `selectedCtaIndex` + server `selectedCtaText`; Operator-gated read until US-11 Cliente package.
11. **Downstream:** US-11 / export **must** use **`resolveSelectedCtaVariant`** + **`buildEffectiveInstagramCaption`** — no client-supplied CTA.
12. **RLS:** no new policies on `neuramark_reel_captions`.
13. **Tests:** operator gate, IDOR, OOB index, forbidden smuggling, regen clear, plain-text preview.

---

## Out of scope (explicit)

| Item | Owner story |
|------|-------------|
| Caption generate/regenerate agent changes | US-6.1 (unchanged except UPSERT null reset) |
| Cliente approval package UI | US-11.1 |
| `CAPTION_CTA_NOT_SELECTED` enforcement | US-11.1 |
| Export/download file generation | US-11.3 |
| `EFFECTIVE_CAPTION_TOO_LONG` reject on export/publish | US-11.3 / US-12.x |
| Instagram Graph publish | US-12.x |
| Operator free-text CTA edit | — |
| Cliente variant picker | — (unless SPEC amended) |
| Explicit deselect action | Future |
| Batch select-all-slots | — |
| QA agent job | US-10.1 |
| `approvals` table changes | US-11.x |

---

## FE signoff

- [x] **Reviewed by FE** — Caption tab radio/select + preview-in-context; `selectReelCaptionCta` wired; extended list DTO fields; EN/ES `scripts.caption.ctaSelect.*`; effective-length warn styling; regen clears selection UX.

**Reviewed by FE:** nextjs-frontend — 2026-08-29. Replace read-only CTA cards in `CaptionDetailPanel` with PrimeReact `RadioButton` group (immediate `selectReelCaptionCta` on change; `captionSelectingSlot` in `isBusy`); preview via `buildEffectiveInstagramCaption` + `IG_CTA_SEPARATOR` from contract; warn styling from `effectiveCaptionOverLimit`; regen toast/hint via `clearedOnRegen`; extend `messageForCaptionCode` + `ScriptsPageCopy` / `page.tsx` copy map for `scripts.caption.ctaSelect.*`; no Supabase in client.
