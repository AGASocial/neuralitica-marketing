# US-5.2 — Preview script readability for vertical video

**Status:** CONTRACT — frozen 2026-08-30. Awaiting **Reviewed by FE** → BUILD.

**As an** Operator, **I want** on-screen text length validated, **so that** subtitles fit 9:16 Reels.

Ship **readability preview on the existing Operator Scripts workspace**: extend `/operator/scripts` to show **non-blocking warnings** when on-screen text beats exceed configured char/line limits for 9:16 Reels, and display **voiceover word-count estimate vs `target_duration_sec`**. Server computes metrics via a shared **readability helper** attached to `getReelScriptsForWeek` list items — **no new DB columns**, **no script edit/save path in V1** (US-5.1 scripts remain read-only; helper is reusable when edit lands). **nextjs-backend + nextjs-frontend only** — no agent prompt changes, no content-agents-engineer BUILD slice.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-5.2 (do **not** check off in PREP).

**This folder:** [`plan/stories/US-5.2/`](./) — `README.md` · `TASKS.md` *(CONTRACT, SECURITY, etc. — next gates)*.

**Depends on:** [US-5.1](../US-5.1/) ✅ `/operator/scripts` · `lib/contracts/reel-script.ts` · `getReelScriptsForWeek` · `onScreenText` newline-separated beats · `targetDurationSec` 15–45.

**Unblocks:** [US-6.1](../../USER_STORIES.md) (Operator reviews scripts before captions) · [US-9.1](../../USER_STORIES.md) (assembly/subtitles consume on-screen text with known limits).

---

## Scope in

| Area | What US-5.2 adds |
|------|------------------|
| **FE** | Extend `/operator/scripts` detail panel: per-beat on-screen char/line warnings; VO word count vs duration target; row-level warning badge when any metric fails; non-blocking PrimeReact warn styling; EN/ES copy. |
| **BE** | Pure **`computeScriptReadabilityMetrics`** helper + Zod DTO; wire into **`getReelScriptsForWeek`** list mapper; export same helper for **future save validation** when scripts become editable; unit tests. **No mutation validation in V1.** |
| **DB** | — *(metrics derived at read time from existing columns)* |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **Operator inline script edit / save** | US-5.1 regenerate-only; save validation hook documented, not implemented. |
| **Blocking generate/regenerate on warnings** | Preview-only; Operator may regenerate manually. |
| **content-agents-engineer / agent self-check pass** | USER_STORIES BE row mentions optional agent pass; V1 BUILD is FE+BE only per PO slice. |
| **New DB columns** for readability flags | Computed on read; no persistence unless CONTRACT proves necessary. |
| **New routes** | Extend existing `/operator/scripts` only. |
| **Cliente script view** | US-11.x Approval package. |
| **Playbook-per-format limit overrides** | Global constants in V1; formato-specific limits deferred. |
| **B-roll beat / hook / body readability** | AC scoped to on-screen text + VO vs duration only. |
| **Assembly subtitle burn-in** | US-9.x. |

## Canonical terms (CONTEXT)

Use **Paquete de guion**, **texto en pantalla**, **locución / VO**, **Operator**, **Formato de Reel**.  
_Evitar:_ generic "subtitle validator", "caption linter".

## What US-5.1 already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-5.1 | `/operator/scripts` · `ScriptsPageView` · `getReelScriptsForWeek` · `reelScriptListItemSchema` · `onScreenText` max 500 chars total · newline-separated beat lines · `voiceoverText` · `targetDurationSec`. |
| US-5.1 CONTRACT | Read-only scripts; no client script fields on mutations; list DTO includes full `package` when `status = generated`. |

**US-5.2 adds computed readability metrics + warning UI** — no agent, no captions, no assembly.

## PO decisions frozen (2026-08-30)

1. **Surface:** Extend **`/operator/scripts`** only — detail panel + optional list-row badge; no new Operator nav item.
2. **V1 read-only:** Scripts remain **non-editable** (regenerate-only from US-5.1). Readability is **preview/warn**, never blocks view or regenerate.
3. **No DB changes:** Metrics computed at read time from `on_screen_text`, `voiceover_text`, `target_duration_sec` on `neuramark_reel_scripts`. **No new columns** unless CONTRACT documents a hard requirement (PO veto: none expected).
4. **Shared helper:** **`lib/reel-scripts/compute-script-readability.ts`** (or CONTRACT path) — **pure functions** importable by BE list mapper and future save validator; constants exported for FE type parity. FE may **re-display server-computed metrics only** (no duplicate business rules in Client Components).
5. **On-screen beat parsing:** Split `onScreenText` on `\n`; trim segments; drop empty lines; each segment = **one beat line** (carry-forward US-5.1 newline=beat model).
6. **On-screen limits (9:16 Reels, global V1):**
   - **`maxCharsPerBeatLine` = 40** — warn when any beat line `.length` exceeds 40.
   - **`maxLinesPerBeat` = 2** — reserved for future multi-line beats; V1 newline model yields 1 line per beat, so this applies when a segment contains embedded `\n` after edit lands; for generated scripts today, char limit is the active check.
   - **`maxBeatLinesTotal` = 8** — warn when beat line count exceeds 8 (aligns with optional `brollBeats` max).
7. **Warning severity:** **Non-blocking** — `warn` level only; scripts with warnings remain copyable and regeneratable.
8. **Voiceover word count:**
   - Count words: split `voiceoverText` on whitespace; filter empty tokens; **`.length` of tokens** (lean; CONTRACT may refine locale-aware tokenization).
   - **Target rate:** **`wordsPerSecondTarget` = 2.5** → `targetWordCount = Math.round(targetDurationSec * 2.5)`.
   - **Display:** show `wordCount`, `targetWordCount`, and `targetDurationSec` (e.g. "42 words · target ~38 for 15s").
   - **Warn when over:** `wordCount > targetWordCount * 1.15` (+15%).
   - **Warn when under:** `wordCount < targetWordCount * 0.70` (−30%) — informational warn, same UI treatment.
9. **List DTO extension:** Add **`readability`** object on each `reelScriptListItem` when `package !== null`; `null` when `status = pending`. Shape frozen in TASKS.md for CONTRACT — includes per-beat breakdown + VO summary + aggregate `hasWarnings`.
10. **BE consumer:** **`getReelScriptsForWeek`** — compute metrics in server list mapper after loading package fields; **no new Server Action** unless CONTRACT prefers separate endpoint (PO lean: extend existing read).
11. **Future save validation (document only):** When Operator edit lands, reuse **`computeScriptReadabilityMetrics`** + optional **`assertScriptReadabilityForSave`** returning typed errors — **not implemented in US-5.2 BUILD**.
12. **Auth:** Unchanged — `requireOperator("page")` on route; read action already operator-gated.
13. **i18n:** EN + ES strings under `scripts.readability.*` — beat char exceed, VO over/under, aggregate badge, empty/pending omit metrics.
14. **Implementers:** **nextjs-backend** + **nextjs-frontend** only; **no content-agents-engineer**, **no DB migration** in default BUILD plan.
15. **Constants location:** Export limits from helper module (or `lib/contracts/reel-script-readability.ts` for types/constants only); CONTRACT freezes exact names and Zod schemas.

---

## Gates (orchestrator)

- [x] SPEC-REVIEW.md (spec-guardian — readability vs SPEC §3 warnings line; no agent/DB creep)
- [x] SECURITY.md (security-architect — read-only preview; no new attack surface on mutations)
- [x] CONTRACT.md (nextjs-backend) — extend US-5.1 list DTO; freeze constants; **Reviewed by FE** before BUILD
- [ ] BUILD (nextjs-backend + nextjs-frontend)
- [ ] VALIDATION.md
- [ ] QA.md

**Next gate:** nextjs-frontend FE signoff on CONTRACT → BUILD.
