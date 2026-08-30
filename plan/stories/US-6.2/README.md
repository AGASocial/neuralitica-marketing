# US-6.2 — CTA variants for caption testing

**Status:** CLOSED — VALIDATE PASS WITH NOTES; QA APPROVE WITH NOTES (0 Critical, 0 High, 0 Medium, 4 Low; CLOSE yes). Build BE `146479c` · FE `f82ba33`.

**As an** Operator, **I want** multiple CTA variants with a selectable winner, **so that** the client can pick the best conversion line in Approval Flow.

Ship **CTA variant selection on the existing Operator Scripts Caption tab**: replace read-only CTA variant lines (US-6.1) with **PrimeReact radio/select**; persist **`selected_cta_index`** (0-based index into stored `cta_variants`) via **`selectReelCaptionCta`** Server Action; show **preview in context** — a read-only block that appends the selected variant to the caption body for Operator review without mutating stored `caption` text. Extend **`getReelScriptsForWeek`** list DTO with **`selectedCtaIndex`** + server-derived **`selectedCtaText`** for **US-11.1** Approval package and final export handoff. **No caption regen, no agent changes, no Cliente UI, no publish** in this story.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-6.2 (checked on CLOSE).

**This folder:** [`plan/stories/US-6.2/`](./) — `README.md` · `TASKS.md` · `SPEC-REVIEW.md` · `SECURITY.md` · `CONTRACT.md` · `VALIDATION.md` · `QA.md`.

**Branch:** `feature/US-6.2-cta-selection`

**Depends on:** [US-6.1](../US-6.1/) ✅ `neuramark_reel_captions` · `cta_variants` jsonb (2–4) · Caption tab on `/operator/scripts` · `lib/contracts/reel-caption.ts` · `getReelScriptsForWeek` · [US-14.5](../US-14.5/) ✅ `requireOperator()`.

**Unblocks:** [US-11.1](../../USER_STORIES.md) (Cliente approval package reads `selectedCtaText`) · [US-11.3](../../USER_STORIES.md) (export/download includes chosen CTA line).

---

## Close verdicts

| Gate | Verdict |
|------|---------|
| SPEC-REVIEW | GAPS resolved in CONTRACT |
| SECURITY | APPROVE WITH CONDITIONS |
| CONTRACT | Frozen 2026-08-29; Reviewed by FE (BUILD `f82ba33`) |
| BUILD | BE `146479c` · FE `f82ba33` |
| VALIDATION | PASS WITH NOTES (`258773c`) |
| QA | APPROVE WITH NOTES (0 Critical, 0 High, 0 Medium, 4 Low; CLOSE yes) |

**QA handoff (non-blocking, post-CLOSE):** L1 — IDOR/cross-tenant select path not automated; L2 — forbidden `caption` key on select lacks integration test; L3 — plain-text preview regression manual-only; L4 — re-selecting active radio triggers redundant persist. **Next:** Sprint 4 — **US-7.1** Configure max budget per Reel; downstream **US-11.1** consumes `selectedCtaText`.

---

## Scope in

| Area | What US-6.2 adds |
|------|------------------|
| **FE** | Caption tab: **radio/select** among `record.ctaVariants`; highlight selected; **preview in context** block (caption + selected CTA appended, plain text, read-only); pending-selection empty state when `selectedCtaIndex === null`; save on select via Server Action; EN/ES (`scripts.caption.ctaSelect.*`). |
| **BE** | **`selectReelCaptionCta({ weekStart, slotIndex, selectedCtaIndex })`** Server Action — operator-gated; load caption row; validate index bounds against stored `cta_variants`; UPDATE `selected_cta_index`; extend list mapper with **`selectedCtaIndex`** + **`selectedCtaText`** (derived, never client-supplied); **[SEC]** reject out-of-bounds index; no free-text CTA substitution. |
| **DB** | **`neuramark_reel_captions.selected_cta_index`** — nullable `integer`, 0-based; NULL until Operator selects; no auto-select on caption generate/regenerate. |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **Caption generate/regenerate** | US-6.1 — unchanged; regen clears/resets `selected_cta_index` to NULL (PO lean: selection lost on caption regen). |
| **content-agents-engineer / agent prompt changes** | Variants already generated in US-6.1; no new LLM work. |
| **Operator inline CTA edit** | Selection from stored variants only — no free-text override. |
| **Cliente approval screen / routes** | US-11.1 consumes DTO handoff; no Cliente UI in 6.2. |
| **Instagram publish / export download** | US-11.3 / US-12.x — 6.2 only prepares DTO fields. |
| **Approval Flow state machine** | US-11.x — no `approvals` table changes. |
| **New Operator nav route** | Extend `/operator/scripts` Caption tab only. |
| **Auto-select first variant on generate** | Default NULL until Operator explicitly selects. |

## Canonical terms (CONTEXT)

Use **Paquete de guion**, **caption de Instagram**, **variantes CTA**, **Operator**, **Flujo de aprobación**.  
_Evitar:_ generic "post copy", multichannel CTA, A/B test dashboard.

## What US-6.1 already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-6.1 | `neuramark_reel_captions` · `cta_variants` jsonb (min 2, max 4) · Caption tab read-only variant lines · `reelCaptionRecordSchema` · `getReelScriptsForWeek` → `items[].caption` · `generateReelCaptions` / `regenerateReelCaption`. |
| US-6.1 CONTRACT | `selectedCtaIndex` / `selected_cta_index` **forbidden** on generate/regenerate actions — US-6.2 adds dedicated mutation. |
| US-6.1 FE | `ScriptsPageView` Caption tab — numbered variant cards at ```991:1013:components/scripts/ScriptsPageView.tsx``` — **replace with selectable control + preview block**. |

**US-6.2 adds CTA selection persistence + preview-in-context + approval/export DTO handoff** — no caption generation, no Cliente view.

## PO decisions frozen (2026-08-29)

1. **DB column:** **`selected_cta_index`** on **`neuramark_reel_captions`** — nullable **`integer`**, **0-based** index into persisted **`cta_variants`** jsonb array. **NULL** default; no column value until Operator selects. CHECK optional in migration: `selected_cta_index IS NULL OR selected_cta_index >= 0` (upper bound enforced in BE against array length, not DB alone).
2. **Selection mutation:** **`selectReelCaptionCta({ weekStart, slotIndex, selectedCtaIndex })`** — dedicated Server Action; **`requireOperator("handler")`**; tenancy via session `clientId`; resolve caption via approved strategy week + slot → `reel_script_id` → caption row (same IDOR-safe chain as US-6.1 regenerate).
3. **Default:** **`selected_cta_index = NULL`** after caption generate/regenerate (US-6.1 UPSERT). **No auto-select** of index 0 on generate. Operator must explicitly choose.
4. **Index validation:** **`selectedCtaIndex`** must satisfy **`0 <= selectedCtaIndex < cta_variants.length`** server-side. Reject with **`CTA_INDEX_OUT_OF_BOUNDS`** (or CONTRACT-frozen code). **No** client-supplied CTA text field — index-only mutation; resolved text always from stored array.
5. **Preview in context:** FE shows a **read-only preview block** below caption: **`caption + "\n\n" + selectedCtaText`** (or CONTRACT-frozen separator). **Does not** UPDATE stored `caption` column. Plain text only; same render rules as US-6.1 (no HTML).
6. **List DTO extension:** Extend **`reelCaptionSummarySchema`** (or nested record) with:
   - **`selectedCtaIndex: number | null`** — from DB column.
   - **`selectedCtaText: string | null`** — **server-derived** `cta_variants[selectedCtaIndex]` when index non-null; **null** when unselected. FE never computes from raw variants for export-facing fields.
7. **Approval/export handoff:** **`selectedCtaIndex` + `selectedCtaText`** on list read DTO for downstream **US-11.1** approval package serializer — **document seam in CONTRACT**; no Cliente route or approval table in 6.2 BUILD.
8. **Regenerate behavior:** **`regenerateReelCaption`** (US-6.1) UPSERT replaces caption row — **reset `selected_cta_index` to NULL** on regen (new variants may differ). FE shows "selection cleared" copy when applicable.
9. **UI control:** **PrimeReact `SelectButton` or `RadioButton` group** (PO lean: radio cards matching current variant card layout). One variant selected at a time; selecting triggers Server Action (optimistic optional; CONTRACT decides).
10. **Auth:** `requireOperator("handler")` on **`selectReelCaptionCta`**; reads reuse US-6.1 operator gates. No body `clientId`.
11. **Forbidden fields on select action:** Same US-6.1 forbidden set **plus** reject **`ctaText`**, **`ctaVariants`**, **`caption`** on select payload — index only.
12. **Implementers:** **nextjs-backend** + **nextjs-frontend** only; **no content-agents-engineer**, **no integrations-engineer** in default BUILD plan.
13. **Module placement:** Action: `lib/reel-captions/actions/select-reel-caption-cta.ts`; persist helper extends `lib/reel-captions/persist-reel-caption.ts` or new `update-selected-cta.ts`; contract extensions in `lib/contracts/reel-caption.ts`.
14. **i18n:** EN + ES under **`scripts.caption.ctaSelect.*`** — select label, preview heading, unselected hint, selection saved, index error, cleared-on-regen.
15. **Revalidate:** `revalidatePath("/operator/scripts")` after successful select.

---

## Gates (orchestrator)

- [x] SPEC-REVIEW.md (spec-guardian — 2026-08-29 GAPS resolved in CONTRACT)
- [x] SECURITY.md (security-architect — 2026-08-29 APPROVE WITH CONDITIONS; reconciled in CONTRACT)
- [x] CONTRACT.md (nextjs-backend — 2026-08-29 frozen; **Reviewed by FE** before BUILD)
- [x] BUILD (nextjs-backend + nextjs-frontend)
- [x] VALIDATION.md
- [x] QA.md — APPROVE WITH NOTES (0 Critical, 0 High, 0 Medium, 4 Low; CLOSE yes)

**Status:** CLOSED (2026-08-29). All gates complete; AC checked in `plan/USER_STORIES.md`. **Next:** Sprint 4 — **US-7.1** Configure max budget per Reel.
