# Validation Report — US-6.2

**Story:** US-6.2 — CTA variants for caption testing  
**Branch:** `feature/US-6.2-cta-selection`  
**Date:** 2026-08-29  
**Validator:** requirements-validator  
**Sources:** `plan/USER_STORIES.md` § US-6.2, `plan/stories/US-6.2/CONTRACT.md`, `plan/stories/US-6.2/SECURITY.md`, `plan/stories/US-6.2/TASKS.md`, implemented code, automated tests

### Verdict: PASS WITH NOTES

**Blockers:** 0  
**Tests:** 49/49 pass (`npx tsx --test lib/reel-captions/reel-captions.test.ts`) — 20 US-6.2 cases in `reel caption CTA selection (US-6.2)` suite

---

## Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| At least 2 CTA variants per Reel | **PASS (dependency)** | Enforced by US-6.1 generation (`CTA_VARIANT_MIN = 2` in `lib/contracts/reel-caption.ts`; agent schema rejects &lt;2). US-6.2 select path requires existing caption row with valid `cta_variants` (`loadReelCaptionForClient` → `mapCaptionRow`). Per CONTRACT § AC #1 dependency — not re-tested as generation in 6.2 BUILD. US-6.1 CLOSED. |
| Selected CTA flows to Approval Flow and final export | **PASS (handoff seam)** | List DTO extended with `selectedCtaIndex`, `selectedCtaText`, `effectiveCaptionCharCount`, `effectiveCaptionOverLimit` via `buildGeneratedReelCaptionSummary` (`lib/reel-captions/persist-reel-caption.ts:130–171`) consumed by `buildReelScriptListForStrategy` (`lib/reel-scripts/list-reel-scripts-for-week.ts:59–66`). Shared helpers `resolveSelectedCtaVariant`, `buildEffectiveInstagramCaption`, `IG_CTA_SEPARATOR` exported from `lib/contracts/reel-caption.ts` for US-11.1/US-11.3. Full approval queue + export enforcement deferred to US-11.x per CONTRACT (documented `CAPTION_CTA_NOT_SELECTED` / `EFFECTIVE_CAPTION_TOO_LONG` seams). |
| [SEC] `selected_cta_index` validated server-side within stored variants array bounds; no free-text CTA substitution | **PASS** | `selectReelCaptionCta` bounds check vs DB-loaded `caption.record.ctaVariants.length` (`lib/reel-captions/actions/select-reel-caption-cta.ts:84–86`). UPDATE writes index only (`lib/reel-captions/update-selected-cta-index.ts:18–24`). Forbidden-key scan rejects `selectedCtaText`, `ctaVariants`, `caption`, etc. (`lib/reel-captions/find-forbidden-select-keys.ts`). Tests: OOB index → `CTA_INDEX_OUT_OF_BOUNDS`; smuggled `selectedCtaText` → `FORBIDDEN_FIELDS`; happy path updates `{ selected_cta_index: 0 }` only (`lib/reel-captions/reel-captions.test.ts`). |

---

## CONTRACT Compliance

| Surface | Status | Evidence |
|---------|--------|----------|
| Migration `selected_cta_index integer NULL` + CHECK ≥ 0 | **PASS** | `supabase/migrations/20260830500000_neuramark_reel_captions_selected_cta_index.sql` matches frozen CONTRACT SQL |
| `selectReelCaptionCta` Server Action | **PASS** | `lib/reel-captions/actions/select-reel-caption-cta.ts` — `requireOperator("handler")` first; forbidden keys; strategy gate; load caption; bounds; index-only UPDATE; `revalidatePath("/operator/scripts")`; success envelope with effective-length fields |
| `loadReelCaptionForClient` | **PASS** | `lib/reel-captions/load-reel-caption-for-client.ts` — approved strategy → script slot → caption with `client_id` filter |
| `updateSelectedCtaIndex` | **PASS** | `lib/reel-captions/update-selected-cta-index.ts` — UPDATE `selected_cta_index` WHERE `id` + `client_id`; `updated_at` via existing `neuramark_reel_captions_set_updated_at` trigger |
| Extended `reelCaptionSummarySchema` + helpers | **PASS** | `lib/contracts/reel-caption.ts:18–245` — `IG_CTA_SEPARATOR`, `resolveSelectedCtaVariant`, `buildEffectiveInstagramCaption`, `computeEffectiveCaptionCharCount`, `isEffectiveCaptionOverLimit`, `selectReelCaptionCtaInputSchema`, extended summary + `PENDING_REEL_CAPTION_SUMMARY` |
| List DTO enrichment | **PASS** | `buildGeneratedReelCaptionSummary` + `list-reel-scripts-for-week.ts:59–66`; OOB drift → null selection + `console.warn` (`persist-reel-caption.ts:140–151`) |
| Regen/generate UPSERT resets selection | **PASS** | `recordToRow` sets `selected_cta_index: null` (`persist-reel-caption.ts:36`); tests for batch generate + single regen |
| Generate/regen still forbid `selectedCtaIndex` | **PASS** | `find-forbidden-keys.ts:21`; test `generate still forbids selectedCtaIndex on input` |
| FE Caption tab radio/select + preview | **PASS** | `components/scripts/ScriptsPageView.tsx` — PrimeReact `RadioButton` group (`role="radiogroup"`, `aria-labelledby`); immediate `selectReelCaptionCta` on change (`1114`, `424–457`); preview via `buildEffectiveInstagramCaption` + DTO `selectedCtaText`; warn styling on `effectiveCaptionOverLimit`; regen toast `clearedOnRegen` |
| i18n EN + ES | **PASS** | `messages/en.json:915–926`, `messages/es.json:915–926`; wired in `app/(app)/operator/scripts/page.tsx:162` |

---

## Convention Compliance

| Check | Status | Evidence |
|-------|--------|----------|
| EN + ES user-facing strings | **PASS** | `scripts.caption.ctaSelect.*` in both locale files |
| Server Components by default; minimal `"use client"` | **PASS** | RSC `page.tsx` loads data/copy; client island `ScriptsPageView` for TabView + select/regen actions |
| PrimeReact-first UI | **PASS** | `RadioButton`, existing `TabView`/`Button`/`Message`/`Tag` |
| Loading / empty / error / pending states | **PASS** | `captionSelectingSlot` in `isBusy`; unselected hint; error banner via `messageForCaptionCode`; pending caption empty state |
| Auth via `requireOperator()` / no Supabase in client | **PASS** | Action gates operator first; no `@supabase` in `components/scripts/*` |
| Backend endpoints map to concrete FE consumers | **PASS** | `selectReelCaptionCta` + extended list DTO → Caption tab only |
| `neuramark_` DB prefix / migrations only | **PASS** | Column + constraint on `neuramark_reel_captions` |

---

## Security Acceptance Criteria (SECURITY.md)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| [SEC] Index bounds + no free-text substitution | **PASS** | See AC row above |
| [SEC] `requireOperator("handler")` first on select | **PASS** | `select-reel-caption-cta.ts:47–54`; test non-operator → 403, no UPDATE |
| [SEC] Strict input + forbidden keys | **PASS** | `.strict()` schema + `findForbiddenSelectReelCaptionCtaKeys` |
| [SEC] Tenancy-scoped caption load | **PASS** | `loadReelCaptionForClient` + `updateSelectedCtaIndex` filter by `client_id` |
| [SEC] UPDATE index column only | **PASS** | `update-selected-cta-index.ts`; happy-path test asserts no `caption` in payload |
| [SEC] Regenerate clears selection | **PASS** | UPSERT null + tests |
| [SEC] Plain-text preview (no HTML) | **PASS** | No `dangerouslySetInnerHTML` in `ScriptsPageView.tsx` (manual grep); preview in text nodes / `pre-wrap` div |
| [SEC] Generate/regen forbid `selectedCtaIndex` | **PASS** | Unchanged US-6.1 forbidden keys |

---

## Dependency Stories

| Dependency | Status | Notes |
|------------|--------|-------|
| US-6.1 Caption generation + `cta_variants` storage | **Satisfied** | CLOSED. Caption tab, `neuramark_reel_captions`, read-only variants until 6.2 |
| US-14.5 Operator gate | **Satisfied** | `requireOperator("handler")` on select action |

---

## Test Results

```
npx tsx --test lib/reel-captions/reel-captions.test.ts

ℹ tests 49
ℹ pass 49
ℹ fail 0
ℹ duration_ms ~167
```

**US-6.2 suite (20 tests):** schema accept/reject; helpers (resolve, build effective caption, char count, over-limit); forbidden smuggling; non-operator 403; `CAPTION_NOT_FOUND`; `CTA_INDEX_OUT_OF_BOUNDS`; happy path index-only UPDATE; `STRATEGY_NOT_APPROVED`; generate/regen UPSERT null reset; generate forbids `selectedCtaIndex`; list summary mapping; pending summary defaults.

**CONTRACT matrix gaps (non-blocking):**

| # | CONTRACT test | Status |
|---|---------------|--------|
| 12 | Forbidden `caption` on select action | Partial — key in forbidden set; no dedicated integration test (only `selectedCtaText` + unit `ctaVariants`) |
| 16 | Foreign week / IDOR → `CAPTION_NOT_FOUND` | **Not automated** — tenancy chain implemented; recommend adding mock test in QA handoff |
| 23 | Grep regression: no `dangerouslySetInnerHTML` on caption/CTA | **Manual only** — grep clean on `ScriptsPageView.tsx` |

---

## Gaps (what blocks PASS)

None. All in-scope acceptance criteria and CONTRACT surfaces are implemented. Notes above are test-coverage improvements, not functional blockers.

---

## Scope Creep

None identified. Correctly excludes: Cliente approval UI (US-11.1), export file generation (US-11.3), publish (US-12.x), caption agent changes, explicit deselect action, batch select-all, `approvals` table mutations.

---

## Recommended Next Actions

| Action | Owner |
|--------|-------|
| PO check AC boxes in `plan/USER_STORIES.md` § US-6.2 | product-owner |
| QA gate (`plan/stories/US-6.2/QA.md`) | qa-engineer |
| Add IDOR + forbidden-`caption` integration tests (optional hardening) | nextjs-backend |
| US-11.1: consume `selectedCtaText` + enforce `CAPTION_CTA_NOT_SELECTED` | nextjs-backend (future) |
