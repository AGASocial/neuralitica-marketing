# QA Report — US-6.2 CTA variant selection for caption testing

**Story:** US-6.2  
**Branch:** `feature/US-6.2-cta-selection`  
**Commits reviewed:** `146479c` (BE), `f82ba33` (FE), `258773c` (VALIDATION)  
**Date:** 2026-08-29  
**Reviewer:** qa-engineer  
**Sources:** `plan/USER_STORIES.md` § US-6.2, `plan/stories/US-6.2/{SECURITY,CONTRACT,VALIDATION,TASKS}.md`, implemented code, automated tests

### Verdict: APPROVE WITH NOTES

**Severity counts:** Critical **0** · High **0** · Medium **0** · Low **4**

**CLOSE recommended:** **yes** — all in-scope acceptance criteria and CONTRACT/SECURITY binding constraints are met; operator gate, tenancy-scoped load, index-only UPDATE, forbidden-key rejection, regen reset, and plain-text preview align with frozen contract; 49/49 reel-caption tests pass (20 US-6.2 cases). Findings are test-coverage and minor UX polish only, not merge blockers.

---

## Findings

### Low

#### L1 — IDOR / cross-tenant select path not automated

**File:** `lib/reel-captions/reel-captions.test.ts` (CONTRACT matrix #16)

**What:** No integration test asserts that a foreign `weekStart` / `slotIndex` for another tenant resolves to `CAPTION_NOT_FOUND` with no UPDATE.

**Why it matters:** Tenancy chain is implemented correctly in `loadReelCaptionForClient` (`client_id` filter on caption SELECT; strategy/script resolution scoped to server `clientId`), but the CONTRACT security matrix calls for an automated IDOR case. Regression could weaken the chain undetected.

**Fix direction:** Add a mock test where `getApprovedStrategyForWeek` / script list / caption row do not align for the operator's `clientId`; assert `CAPTION_NOT_FOUND` and no `update` payload.

---

#### L2 — Forbidden `caption` key on select lacks integration test

**Files:** `lib/reel-captions/find-forbidden-select-keys.ts:11`, `lib/reel-captions/reel-captions.test.ts` (CONTRACT matrix #12)

**What:** `caption` is in `FORBIDDEN_SELECT_REEL_CAPTION_CTA_KEYS`, but tests only cover smuggled `selectedCtaText` (integration) and `ctaVariants` (unit). No integration test posts `{ caption: "...", selectedCtaIndex: 0 }`.

**Why it matters:** Smuggling caption text alongside index selection is a CONTRACT veto scenario; implementation is correct, coverage is partial.

**Fix direction:** Mirror the `selectedCtaText` smuggling test for `caption` → expect `FORBIDDEN_FIELDS`, no UPDATE.

---

#### L3 — Plain-text preview regression is manual-only

**File:** `components/scripts/ScriptsPageView.tsx` (CONTRACT matrix #23)

**What:** No automated grep/regression test locks absence of `dangerouslySetInnerHTML` on caption/CTA preview paths. Manual grep on `ScriptsPageView.tsx` is clean; preview uses React text nodes / `whiteSpace: "pre-wrap"` (`ScriptsPageView.tsx:1167`).

**Why it matters:** SECURITY.md requires plain-text preview; a future edit could reintroduce HTML rendering without CI catching it.

**Fix direction:** Add a small regression test or lint rule scoped to `components/scripts/` forbidding `dangerouslySetInnerHTML`.

---

#### L4 — Re-selecting active radio triggers redundant persist

**File:** `components/scripts/ScriptsPageView.tsx:1114`

**What:** `RadioButton` `onChange={() => onSelectCta(index)}` fires even when the variant is already selected; no early return in `handleSelectCaptionCta` for unchanged index.

**Why it matters:** Not a security defect (same index, same bounds, idempotent UPDATE), but causes unnecessary Server Action round-trips and toast noise if Operator clicks the selected card again.

**Fix direction:** Guard with `if (caption.selectedCtaIndex === index) return` before calling `selectReelCaptionCta`, or skip `onChange` when `isSelected`.

---

## Security Focus Review

| Focus area | Status | Evidence |
|------------|--------|----------|
| `requireOperator("handler")` first on select | **PASS** | `select-reel-caption-cta.ts:47–54`; test non-operator → 403, no UPDATE |
| Strict input + forbidden keys | **PASS** | `selectReelCaptionCtaInputSchema.strict()`; `findForbiddenSelectReelCaptionCtaKeys` rejects `clientId`, `captionId`, `selectedCtaText`, `ctaVariants`, `caption`, etc. |
| Tenancy-scoped caption load | **PASS** | `loadReelCaptionForClient` → approved strategy + script slot + `getReelCaptionByScriptId({ clientId })`; `updateSelectedCtaIndex` filters `id` + `client_id` |
| Index bounds vs DB array | **PASS** | `selectedCtaIndex >= caption.record.ctaVariants.length` → `CTA_INDEX_OUT_OF_BOUNDS`, no UPDATE (`select-reel-caption-cta.ts:84–86`) |
| UPDATE index column only | **PASS** | `update-selected-cta-index.ts:20`; happy-path test asserts `{ selected_cta_index: 0 }` only, no `caption` key |
| Generate/regen forbid `selectedCtaIndex` | **PASS** | `find-forbidden-keys.ts:20–21`; test `generate still forbids selectedCtaIndex on input` |
| Regen/generate clears selection | **PASS** | `persist-reel-caption.ts:36` UPSERT `selected_cta_index: null`; batch generate + single regen tests |
| Plain-text preview | **PASS** | No `dangerouslySetInnerHTML` in `ScriptsPageView.tsx`; preview via `buildEffectiveInstagramCaption` + DTO `selectedCtaText` |
| No Supabase in client | **PASS** | `components/scripts/*` has no `@supabase` imports |
| No public Route Handler for select | **PASS** | Server Action only: `lib/reel-captions/actions/select-reel-caption-cta.ts` |
| Migration + prefix | **PASS** | `20260830500000_neuramark_reel_captions_selected_cta_index.sql` — nullable integer, non-negative CHECK, `neuramark_` prefix |
| Logging — codes/ids only | **PASS** | Success log at `select-reel-caption-cta.ts:110–116` — no caption/variant bodies |

---

## Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| At least 2 CTA variants per Reel | **PASS (dependency)** | US-6.1 generation enforces `CTA_VARIANT_MIN = 2`; select requires valid caption row with parsed `ctaVariants`. Per CONTRACT AC #1 dependency — not re-tested as generation in 6.2. |
| Selected CTA flows to Approval Flow and final export | **PASS (handoff seam)** | List DTO extended with `selectedCtaIndex`, `selectedCtaText`, effective-length fields via `buildGeneratedReelCaptionSummary` / `buildReelScriptListForStrategy`. Shared helpers `resolveSelectedCtaVariant`, `buildEffectiveInstagramCaption`, `IG_CTA_SEPARATOR` exported for US-11.x. Full approval/export enforcement deferred per CONTRACT. |
| [SEC] Index bounds + no free-text CTA substitution | **PASS** | Bounds vs DB-loaded array; UPDATE index only; forbidden-key scan; tests for OOB, smuggling, happy path. |

---

## CONTRACT Compliance (spot-check)

| Surface | Status |
|---------|--------|
| Migration `selected_cta_index` | **PASS** |
| `selectReelCaptionCta` Server Action flow | **PASS** |
| `loadReelCaptionForClient` / `updateSelectedCtaIndex` | **PASS** |
| Extended `reelCaptionSummarySchema` + helpers | **PASS** |
| List DTO enrichment + OOB drift nulling | **PASS** |
| FE radio/select + preview-in-context + i18n EN/ES | **PASS** |
| `revalidatePath("/operator/scripts")` on success | **PASS** |

---

## Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/reel-captions/reel-captions.test.ts` | **PASS** — 49/49 (20 US-6.2) |
| `npm run lint` | **FAIL (pre-existing)** — repo-wide errors/warnings; US-6.2 touch: unused `copy` in `GeneratingSkeleton` (`ScriptsPageView.tsx:1457`) |
| `npm run build` | **FAIL (pre-existing env)** — `AUTH_DEV_FALLBACK must not be set when NODE_ENV=production` on `/signup`; unrelated to US-6.2 diff; compile step succeeded |
| Manual grep: `dangerouslySetInnerHTML` in `ScriptsPageView.tsx` | **PASS** — no matches |
| Manual grep: `@supabase` in `components/scripts/*` | **PASS** — no matches |
| Contract/security doc cross-check vs `146479c` / `f82ba33` | **PASS** |

---

## What Was Not Covered

- End-to-end browser test of Caption tab radio select + preview (manual UI verification only).
- Production build with auth env correctly configured (blocked by pre-existing `AUTH_DEV_FALLBACK` guard).
- US-11.1 `CAPTION_CTA_NOT_SELECTED` / US-11.3 `EFFECTIVE_CAPTION_TOO_LONG` enforcement (explicitly out of scope).
- IDOR integration test (finding L1).
- Full-repo lint clean (pre-existing debt outside US-6.2).

---

## Recommended Next Actions

| Action | Owner | Priority |
|--------|-------|----------|
| PO check AC boxes in `USER_STORIES.md` § US-6.2 | product-owner | Before CLOSE |
| Optional: IDOR + forbidden-`caption` integration tests | nextjs-backend | Low |
| US-11.1: consume `selectedCtaText` + enforce `CAPTION_CTA_NOT_SELECTED` | nextjs-backend | Future story |
