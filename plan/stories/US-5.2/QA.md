# QA Report — US-5.2 Preview script readability for vertical video

**Story:** US-5.2  
**Branch:** `feature/US-5.2-script-readability`  
**Commits reviewed:** `b503241` (BE), `b68d2ee` (FE), `8ba616e` (VALIDATION); implementation base `232326a` (CONTRACT + compute helper)  
**Date:** 2026-08-30  
**Reviewer:** qa-engineer  
**Sources:** `plan/USER_STORIES.md` § US-5.2, `plan/stories/US-5.2/{SECURITY,CONTRACT,VALIDATION,TASKS}.md`, implemented code, automated tests

### Verdict: APPROVE WITH NOTES

**Severity counts:** Critical **0** · High **0** · Medium **0** · Low **3**

**CLOSE recommended:** **yes** — both acceptance criteria are met; `SECURITY.md` binding constraints hold (no new persist surface, server-frozen thresholds with smuggle-key rejection, advisory-only warnings, `requireOperator` unchanged on `getReelScriptsForWeek`); 18/18 story tests pass; findings are hardening/UX notes, not merge blockers.

---

## Findings

### Low

#### L1 — Compute module lacks `server-only` guard

**File:** `lib/reel-scripts/compute-script-readability.ts` (module root)

**What:** `compute-script-readability.ts` is imported only from `list-reel-scripts-for-week.ts` (which has `import "server-only"`), but the compute module itself is not marked `server-only`.

**Why it matters:** CONTRACT Pattern A requires server-side computation; FE correctly renders `items[].readability` from the gated read DTO and does not import the compute helper today. A future client import could duplicate business rules or bundle threshold logic into the client unnecessarily.

**Fix direction:** Add `import "server-only"` at the top of `compute-script-readability.ts` for defense in depth.

---

#### L2 — UTF-16 char counting (documented limitation)

**Files:** `lib/reel-scripts/compute-script-readability.ts:43`, `lib/contracts/reel-script-readability.ts:97` (CONTRACT comment)

**What:** Per-beat char counts use JavaScript `.length` (UTF-16 code units), not grapheme clusters.

**Why it matters:** Spanish text with combining marks or some emoji sequences may warn (or not warn) differently than a human subtitle fit estimate. Test #10 locks emoji UTF-16 behavior.

**Fix direction:** Accept for V1 per CONTRACT; revisit with grapheme-aware counting in a future story if product requires it.

---

#### L3 — Duplicate on-screen text in detail panel

**File:** `components/scripts/ScriptsPageView.tsx:509–517`, `:664`

**What:** Detail panel shows full `onScreenText` via `ScriptField`, then parsed beat lines again in `OnScreenBeatLineMetrics` including `beat.text`.

**Why it matters:** `SECURITY.md` leans toward i18n + numeric counts in warning chrome; script text is already shown in `ScriptField`. Rendering `beat.text` as a React text node is safe (no `dangerouslySetInnerHTML`), but duplicates content. VALIDATION notes this as intentional for per-beat context.

**Fix direction:** Optional UX polish — hide raw `onScreenText` when readability beat breakdown is shown, or show counts-only in the metrics block.

---

## Security Focus Review

| Focus area | Status | Evidence |
|------------|--------|----------|
| No new persist surface | **PASS** | No `updateReelScript*` export in `lib/reel-scripts/actions/*`. `assertScriptReadabilityForSave` exported but uncalled outside tests. Generate/regen actions have no readability imports. Test S3. |
| `requireOperator` unchanged | **PASS** | `getReelScriptsForWeek` still calls `requireOperator("handler")` first (`get-reel-scripts-for-week.ts:39`). Test S1: non-operator → 403. |
| Server-frozen thresholds | **PASS** | Constants in `lib/contracts/reel-script-readability.ts` (40 chars/beat, 2.5 wps, 1.15/0.70 ratios). `find-forbidden-keys.ts:32–43` extends smuggle keys. Shared scanner used by generate/regen/read actions. Test S2. |
| Advisory only — no persist gate | **PASS** | `generate-reel-scripts.ts` / `regenerate-reel-script-slot.ts` unchanged for readability. No agent self-check in `lib/agents/content/*`. |
| Operator-only surface | **PASS** | `/operator/scripts` only; no Cliente readability view. No new Route Handlers. |
| Client/server boundary | **PASS** | `ScriptsPageView` imports **types** from `reel-script-readability.ts` only; RSC page passes server-computed DTO + i18n. No `@supabase` in `components/scripts/*`. No `dangerouslySetInnerHTML` in scripts UI. |
| Tenancy | **PASS** | Readability attached in `buildReelScriptListForStrategy` after tenant-scoped `listReelScriptsForStrategy` (`list-reel-scripts-for-week.ts:18–56`). |
| No DB migration | **PASS** | Metrics derived at read time from existing `neuramark_reel_scripts` columns. |

---

## Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Warn when on-screen text exceeds configured max chars per beat | **PASS** | `computeScriptReadabilityMetrics` flags `chars_exceeded` when `charCount > 40` (`compute-script-readability.ts:47–49`). Mapper attaches on generated items (`list-reel-scripts-for-week.ts:56`). FE `OnScreenBeatLineMetrics` warn styling + `beatCharsExceeded` i18n (`ScriptsPageView.tsx:608–685`). Tests #1–2. |
| Voiceover word count estimate shown vs target duration | **PASS** | `countVoiceoverWords` + `targetWordCount = Math.round(targetDurationSec * 2.5)` with `ok`/`over`/`under` (`compute-script-readability.ts:71–95`). FE `VoiceoverReadabilityMetrics` (`ScriptsPageView.tsx:690–733`). EN/ES keys `scripts.readability.*`. Tests #7–9. |

---

## Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/reel-scripts/compute-script-readability.test.ts` | **18/18 pass** |
| `npm run lint` | **Pre-existing failures** in unrelated `*.test.ts` files (`@typescript-eslint/no-require-imports`); US-5.2 source files clean |
| `npm run build` | **Failed** — `AUTH_DEV_FALLBACK must not be set when NODE_ENV=production` (local `.env` dev flag; same pre-existing condition as US-5.1 QA; not US-5.2 code defect). Compile phase succeeded before page-data collection failed |
| `npx tsc --noEmit` | **Pre-existing errors** in `generate-reel-script.test.ts` and `reel-scripts.test.ts`; no errors in US-5.2 readability modules |

---

## What Was Not Covered

- Manual browser E2E on `/operator/scripts` (expand row, per-beat warnings, VO summary, row badge, EN/ES strings).
- Production deploy with `AUTH_DEV_FALLBACK` unset (expected on Vercel).
- Grapheme-accurate char counting for Spanish copy.
- Full-repo lint/typecheck clean (pre-existing test-file patterns from prior stories).

---

## Recommended Action

**APPROVE WITH NOTES.** Proceed to **CLOSE** — security acceptance criteria from `SECURITY.md` are satisfied; Low findings are defense-in-depth and UX polish only.
