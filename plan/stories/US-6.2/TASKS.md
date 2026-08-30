# US-6.2 — CTA variants for caption testing

**Priority:** P0  
**Depends on:** US-6.1 ✅ `neuramark_reel_captions` · `cta_variants` · Caption tab · `lib/contracts/reel-caption.ts` · US-14.5 ✅  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-6.2 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **nextjs-backend** + **nextjs-frontend** only (`docs/development/AGENT-ROSTER.md`). DB migration under BE. **No content-agents-engineer** BUILD slice.  
**Canonical terms:** **Paquete de guion** · **caption de Instagram** · **variantes CTA** · **Operator** · **Flujo de aprobación**. Avoid CONTEXT _Evitar_ list in product-facing copy.

## Out of scope (do not implement here)

- **Caption generate/regenerate** agent/orchestrator changes — US-6.1 owns; regen may **reset** `selected_cta_index` only.
- **content-agents-engineer** — no prompt/LLM/output schema changes; variants already min 2 in US-6.1.
- **Operator inline CTA edit** — selection from stored variants by index only; no free-text field.
- **Cliente** approval screen, routes, or preview — US-11.1 consumes DTO; no Cliente UI in 6.2.
- **Instagram publish / download export** — US-11.3 / US-12.x; 6.2 prepares `selectedCtaText` on list DTO only.
- **`approvals` table** or approval state machine — US-11.x.
- **Auto-select first variant** on caption generate — default NULL until Operator selects.
- **New Operator nav route** — extend `/operator/scripts` Caption tab only.
- **Mutating stored `caption`** column with selected CTA — preview is derived display only.

## Scope split

| Concern | Owner |
|---------|--------|
| `selected_cta_index` column + migration | **US-6.2** DB/BE |
| `selectReelCaptionCta` Server Action | **US-6.2** BE |
| CTA radio/select + preview-in-context UI | **US-6.2** FE |
| Extend list DTO: `selectedCtaIndex`, `selectedCtaText` | **US-6.2** BE |
| Caption generation + `cta_variants` storage | **US-6.1** (unchanged) |
| Cliente approval package UI | **US-11.1** |
| Export/download with chosen CTA | **US-11.3** |

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| DB column | **`neuramark_reel_captions.selected_cta_index`** — nullable **`integer`**, **0-based** index into `cta_variants` jsonb. **NULL** until Operator selects. |
| Default on generate | **No auto-select** — caption UPSERT (US-6.1) leaves `selected_cta_index` **NULL**. |
| Default on regenerate | **`regenerateReelCaption`** resets **`selected_cta_index` to NULL** when caption row replaced (PO lean: prior selection invalid with new variants). |
| Selection action | **`selectReelCaptionCta({ weekStart, slotIndex, selectedCtaIndex })`** — Server Action; **`requireOperator("handler")`**. |
| Input bounds | **`selectedCtaIndex`:** integer **`0 <= n < cta_variants.length`**; reject out-of-range → **`CTA_INDEX_OUT_OF_BOUNDS`** (CONTRACT freezes exact code). |
| Free-text guard | Request accepts **index only** — no `ctaText`, `caption`, or `ctaVariants` on mutation; resolved text always from stored array (**AC [SEC]**). |
| Tenancy | Same IDOR-safe chain as US-6.1: session `clientId` → approved strategy week → slot → script → caption row. |
| Preview in context | Read-only FE block: append **`selectedCtaText`** to **`caption`** for display (e.g. `caption + "\n\n" + selectedCtaText`); **does not** persist to `caption` column. |
| List DTO | Extend **`reelCaptionSummarySchema`**: **`selectedCtaIndex: number \| null`**, **`selectedCtaText: string \| null`** (server-derived from index + `cta_variants`). |
| Approval handoff | List read exposes fields for **US-11.1** approval package serializer — **no Cliente route in 6.2**; CONTRACT documents consumer seam. |
| UI control | **PrimeReact `SelectButton` or `RadioButton`** group on variant cards (PO lean: radio cards in Caption tab). |
| Select UX | Explicit Operator action on choice → call **`selectReelCaptionCta`**; show unselected hint when `selectedCtaIndex === null`. |
| Module placement | `lib/reel-captions/actions/select-reel-caption-cta.ts`; contract: `lib/contracts/reel-caption.ts`; mapper: `lib/reel-scripts/list-reel-scripts-for-week.ts`. |
| i18n | EN + ES under **`scripts.caption.ctaSelect.*`**. |
| Revalidate | `revalidatePath("/operator/scripts")` after successful select. |
| Implementers | **nextjs-backend** + **nextjs-frontend** only. |

### Caption summary DTO extension sketch (CONTRACT freezes Zod)

```ts
// Lean sketch — CONTRACT owns exact names / strict()
type ReelCaptionSummary = {
  status: "pending" | "generated";
  captionId: string | null;
  record: ReelCaptionRecord | null;
  selectedCtaIndex: number | null;   // NEW — from DB; null = unselected
  selectedCtaText: string | null;    // NEW — server-derived; null when unselected
  updatedAt: string | null;
  stale: boolean;
};

// Preview-in-context (FE-only derived display, not persisted):
function buildCaptionWithCtaPreview(caption: string, selectedCtaText: string | null): string {
  if (!selectedCtaText) return caption;
  return `${caption}\n\n${selectedCtaText}`;
}
```

### Select action input sketch (CONTRACT freezes Zod)

```ts
export const selectReelCaptionCtaInputSchema = z
  .object({
    weekStart: trendWeekStartSchema,
    slotIndex: z.number().int().min(0).max(6),
    selectedCtaIndex: z.number().int().min(0).max(CTA_VARIANT_MAX - 1), // upper bound re-checked vs array length
  })
  .strict();
```

## Carry-forwards / reuse (do not reinvent)

- Scripts page: `app/(app)/operator/scripts/page.tsx` · `components/scripts/ScriptsPageView.tsx`.
- Caption tab variant display: ```991:1013:components/scripts/ScriptsPageView.tsx``` — upgrade to selectable + preview.
- US-6.1 actions pattern: `lib/reel-captions/actions/regenerate-reel-caption.ts` · slot resolution · forbidden keys.
- Caption load/persist: `lib/reel-captions/persist-reel-caption.ts` · `load-reel-script-for-caption-job.ts`.
- List read: `getReelScriptsForWeek` · `lib/reel-scripts/list-reel-scripts-for-week.ts`.
- Contract constants: `CTA_VARIANT_MIN`, `CTA_VARIANT_MAX` from `lib/contracts/reel-caption.ts`.
- Operator gate: `requireOperator()` from `lib/auth/require-user.ts`.
- Forbidden keys: extend `lib/reel-captions/find-forbidden-keys.ts` — allow `selectedCtaIndex` **only** on select action; still forbid on generate/regenerate.
- PrimeReact: `SelectButton`, `RadioButton`, existing Caption tab layout.

---

## FE checklist

Concrete BE consumers: **`selectReelCaptionCta`** · extended **`getReelScriptsForWeek`** → `items[].caption.selectedCtaIndex` · `selectedCtaText`.

- [x] **Replace read-only CTA variant cards** with **radio/select** control bound to `selectedCtaIndex` (one selected at a time).
- [x] **Unselected state:** when `selectedCtaIndex === null`, show hint (e.g. "Select a CTA variant for approval preview"); no preview append.
- [x] **Preview in context block:** read-only plain-text area showing **`buildCaptionWithCtaPreview(caption, selectedCtaText)`** — label distinct from stored caption field.
- [x] **On select:** call **`selectReelCaptionCta({ weekStart, slotIndex, selectedCtaIndex })`**; handle pending/error/success; disable while in-flight.
- [x] **Error state** for `CTA_INDEX_OUT_OF_BOUNDS`, `NOT_FOUND`, `FORBIDDEN_FIELDS`.
- [x] **Regenerate caption:** after regen success, UI reflects cleared selection (`selectedCtaIndex === null`) per PO reset rule.
- [x] **EN + ES strings** in `messages/en.json` / `es.json` (`scripts.caption.ctaSelect.*`).
- [x] **No Supabase in Client Components**; render server DTO; **plain text** — no `dangerouslySetInnerHTML`.
- [x] **No Cliente** route or approval UI in this story.
- [x] **Accessibility:** radio group labeled; selection not color-only.

---

## BE checklist

Concrete FE consumers: Caption tab select + preview; future US-11.1 approval package reads list DTO.

- [x] **Migration** add **`selected_cta_index integer NULL`** to **`neuramark_reel_captions`** (optional CHECK `>= 0` when not null).
- [x] **Extend Zod** in `lib/contracts/reel-caption.ts`: `selectReelCaptionCtaInputSchema`, success/error envelopes, extended `reelCaptionSummarySchema`.
- [x] **`selectReelCaptionCta({ weekStart, slotIndex, selectedCtaIndex })`** Server Action — `requireOperator("handler")`; resolve caption row; validate index vs `cta_variants.length`.
- [x] **[SEC] Bounds check:** reject if `selectedCtaIndex >= cta_variants.length` or `< 0`; no free-text CTA substitution.
- [x] **[SEC] Forbidden fields** on select action — index only; reject `ctaText`, `caption`, `ctaVariants`, `clientId`, etc.
- [x] **UPDATE** helper sets `selected_cta_index`; bump `updated_at`.
- [x] **Extend list mapper** — load `selected_cta_index`; compute **`selectedCtaText`** server-side; attach to `caption` summary.
- [x] **Extend `regenerateReelCaption` UPSERT** — set **`selected_cta_index = NULL`** on caption replace (PO lean).
- [x] **Export helper** (optional, server-only): `resolveSelectedCtaText(ctaVariants, selectedCtaIndex)` for US-11 reuse — CONTRACT may freeze name.
- [x] `revalidatePath("/operator/scripts")` after successful select.
- [x] **Automated tests:** `lib/reel-captions/reel-captions.test.ts` — bounds reject; happy path; tenancy/IDOR; forbidden fields; null default; regen clears selection.

---

## DB checklist

All objects keep `neuramark_` prefix. Migrations via Supabase migrations only.

- [x] **ALTER** **`neuramark_reel_captions`** ADD COLUMN **`selected_cta_index integer NULL`**.
- [x] Optional CHECK: **`selected_cta_index IS NULL OR selected_cta_index >= 0`** (upper bound enforced in BE).
- [ ] **No change** to `cta_variants` column shape (US-6.1 jsonb string[]).
- [ ] **No new tables** (`approvals`, export jobs, etc.).
- [ ] RLS unchanged — deny-by-default; service-role Node only.

---

## Gates (orchestrator)

- [ ] SPEC-REVIEW.md (spec-guardian)
- [ ] SECURITY.md (security-architect — index-only mutation; bounds validation; no free-text substitution)
- [ ] CONTRACT.md authored (nextjs-backend — extend US-6.1; **Reviewed by FE** required before BUILD)
- [ ] BUILD (nextjs-backend + nextjs-frontend)
- [ ] VALIDATION.md
- [ ] QA.md

**Status:** PREP. **Next gate:** spec-guardian SPEC-REVIEW → security-architect SECURITY.md → nextjs-backend CONTRACT.md.

---

## Open questions (for SPEC / SECURITY / CONTRACT)

1. **Select UX — immediate save vs explicit Save button?** **PO lean:** selecting a radio **immediately** calls `selectReelCaptionCta` (one tap); CONTRACT may add debounce if needed.
2. **Preview separator** — `\n\n` between caption and CTA? **PO lean:** double newline; CONTRACT freezes for US-11 export parity.
3. **Error code name** — `CTA_INDEX_OUT_OF_BOUNDS` vs reuse `VALIDATION_ERROR` with field? **PO lean:** dedicated code for Operator messaging.
4. **Batch "select all slot 0"** — **PO lean:** out of scope; per-Reel selection only.
5. **Require selection before downstream QA/approval?** **PO lean:** warn-only in Operator UI for 6.2; hard gate deferred to US-11.1 CONTRACT (approval package may require non-null `selectedCtaIndex`).
6. **DB upper-bound CHECK** — dynamic vs array length? **PO lean:** BE-only bounds check; DB CHECK only `>= 0` when not null (array length not enforceable in static CHECK).

No SPEC amendment assumed in PREP: SPEC §3 Caption Agent already requires CTA variants; US-6.2 adds selection persistence and approval handoff only.
