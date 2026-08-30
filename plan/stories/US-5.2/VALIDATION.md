# Validation Report — US-5.2

**Story:** US-5.2 — Preview script readability for vertical video  
**Branch:** `feature/US-5.2-script-readability`  
**Builds:** BE `b503241` · FE `b68d2ee`  
**Date:** 2026-08-30  
**Validator:** requirements-validator  
**Sources:** `plan/USER_STORIES.md` § US-5.2, `plan/stories/US-5.2/CONTRACT.md`, `plan/stories/US-5.2/SECURITY.md`, `plan/stories/US-5.2/TASKS.md`, implemented code, automated tests

### Verdict: PASS WITH NOTES

**Blockers:** 0  
**Tests:** 18/18 pass (`npx tsx --test lib/reel-scripts/compute-script-readability.test.ts`)

---

## Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Warn when on-screen text exceeds configured max chars per beat | **PASS** | BE: `computeScriptReadabilityMetrics` flags `chars_exceeded` when `charCount > REEL_SCRIPT_MAX_CHARS_PER_BEAT_LINE` (40) per parsed beat (`lib/reel-scripts/compute-script-readability.ts:47–49`, `lib/contracts/reel-script-readability.ts:9`). Mapper attaches metrics on generated items (`lib/reel-scripts/list-reel-scripts-for-week.ts:56`). FE: `OnScreenBeatLineMetrics` renders warn border, icon, and `beatCharsExceeded` message when `beat.warnings` includes `chars_exceeded` (`components/scripts/ScriptsPageView.tsx:608–685`). Tests #1–2, #3–4. |
| Voiceover word count estimate shown vs target duration | **PASS** | BE: `countVoiceoverWords` + `targetWordCount = Math.round(targetDurationSec * 2.5)` with `status` `ok`/`over`/`under` (`lib/reel-scripts/compute-script-readability.ts:71–95`). FE: `VoiceoverReadabilityMetrics` shows summary with `wordCount`, `targetWordCount`, `targetDurationSec` via i18n templates (`ScriptsPageView.tsx:690–733`). Warn `Message` when `status !== "ok"`. Tests #7–9. |

---

## Convention Compliance

| Check | Status | Evidence |
|-------|--------|----------|
| EN + ES user-facing strings | **PASS** | `messages/en.json:850–857`, `messages/es.json:850–857` — all `scripts.readability.*` keys from CONTRACT. Wired in RSC page (`app/(app)/operator/scripts/page.tsx:113–122`). |
| Server Components by default; minimal `"use client"` | **PASS** | RSC `page.tsx` loads data via `getReelScriptsForWeek`. Client island `ScriptsPageView` for interactivity only. Readability metrics rendered from server DTO — no client recompute. |
| PrimeReact-first UI | **PASS** | `Message`, `Tag` for warnings; existing `DataTable`/`Button` patterns unchanged (`ScriptsPageView.tsx`). |
| Loading / empty / error / pending states | **PASS** | Pending slots: `readability: null`, detail panel hides metrics block (`list-reel-scripts-for-week.ts:40`, `ScriptsPageView.tsx:474–479`, `512–517`). Existing US-5.1 load/error/generating states retained. |
| Auth via `requireOperator()` / no Supabase in client | **PASS** | Operator layout unchanged. `getReelScriptsForWeek` gate unchanged. No `@supabase` in `components/scripts/*`. Test S1: non-operator → 403. |
| Backend endpoints map to concrete FE consumers | **PASS** | Extended `getReelScriptsForWeek` success DTO only — no new actions/routes. FE consumes `items[].readability` on `/operator/scripts`. |
| `neuramark_` DB prefix / no migration | **PASS** | No new migration. Metrics derived at read time from existing `neuramark_reel_scripts` columns per CONTRACT. |
| CONTRACT frozen shapes | **PASS** | Zod in `lib/contracts/reel-script-readability.ts`; `reelScriptListItemSchema.readability` nullable (`lib/contracts/reel-script.ts:68–69`). Constants match CONTRACT (40 chars, 2.5 wps, 1.15/0.70 ratios). |

---

## Security Acceptance Criteria (SECURITY.md)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| No new script persist surface | **PASS** | No `updateReelScript*` Server Action. `assertScriptReadabilityForSave` exported but uncalled outside tests. Test S3. |
| Read gate unchanged | **PASS** | `requireOperator("handler")` on `getReelScriptsForWeek`. Test S1. |
| Thresholds server-frozen; client override forbidden | **PASS** | `find-forbidden-keys.ts:32–43` extends smuggle key set. Test S2: `maxCharsPerBeat` → `FORBIDDEN_FIELDS`. |
| Warnings advisory only — no persist gate | **PASS** | Generate/regenerate actions unchanged; readability not consulted before UPSERT. |
| Pure helpers — no I/O | **PASS** | `compute-script-readability.ts` has no fetch/DB/logging of script bodies. |
| Operator-only surface | **PASS** | `/operator/scripts` only; no Cliente readability view. |
| No agent self-check in BUILD | **PASS** | No changes to `generate-reel-script.ts` prompts or agent pipeline. |

---

## Dependency Stories

| Dependency | Status | Notes |
|------------|--------|-------|
| US-5.1 Reel script package per slot | **Satisfied** | CLOSED. `getReelScriptsForWeek`, `reelScriptPackageSchema`, `/operator/scripts` read surface in place. |

---

## Test Results

```
npx tsx --test lib/reel-scripts/compute-script-readability.test.ts

ℹ tests 18
ℹ pass 18
ℹ fail 0
```

Coverage: pure compute (11), save hook (2), mapper integration (1), security regression (3), VO helper (1).

---

## Gaps (what blocks PASS)

None.

---

## Scope Creep

None identified. Correctly absent: inline script edit/save, blocking generate/regenerate, new DB columns, Cliente warnings, agent self-check, separate readability endpoint.

---

## Notes (non-blocking)

1. **UTF-16 char counting:** CONTRACT documents `.length` (UTF-16 code units) limitation for accents/combined marks; test #10 locks emoji behavior.
2. **USER_STORIES BE row** lists "optional agent self-check pass" — PO/TASKS/CONTRACT explicitly defer to content-agents-engineer; not a validation gap.
3. **Dual on-screen display:** Detail panel shows raw `onScreenText` field plus parsed beat metrics below — intentional; warnings attach to parsed beats per CONTRACT.
4. **VO `under` alongside char warnings:** Expected when word count is below −30% threshold even if beats also fail; `hasWarnings` aggregates both.

---

## Recommended Next Actions

| Action | Owner |
|--------|-------|
| Run **QA** gate (`plan/stories/US-5.2/QA.md`) | qa-engineer |
| PO checks AC boxes in `plan/USER_STORIES.md` on CLOSE | product-owner |
| Mark BUILD gate complete in `plan/stories/US-5.2/TASKS.md` | master-orchestrator |
