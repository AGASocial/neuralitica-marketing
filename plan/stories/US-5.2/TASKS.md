# US-5.2 — Preview script readability for vertical video

**Priority:** P0  
**Depends on:** US-5.1 ✅ `/operator/scripts` · `lib/contracts/reel-script.ts` · `getReelScriptsForWeek` · `neuramark_reel_scripts`  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-5.2 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **nextjs-backend** + **nextjs-frontend** only (`docs/development/AGENT-ROSTER.md`). No content-agents-engineer BUILD slice; no DB migration in default plan.  
**Canonical terms:** **Paquete de guion** · **texto en pantalla** · **locución** · **Operator** · **Formato de Reel**. Avoid CONTEXT _Evitar_ list in product-facing copy.

## Out of scope (do not implement here)

- **Operator inline edit / save** of script fields — US-5.1 regenerate-only; save-time validation is a documented hook only.
- **Blocking** generate/regenerate when warnings present.
- **content-agents-engineer** agent self-check / prompt changes (optional in USER_STORIES BE row — deferred).
- **New DB columns** or migrations for readability flags/scores.
- **New routes** — extend `/operator/scripts` only.
- **Cliente** script readability view (US-11.x).
- **Per-formato playbook overrides** for char limits (global constants V1).
- **Hook / body / CTA / broll** length warnings — AC scoped to on-screen beats + VO vs duration.
- **Assembly subtitle rendering** (US-9.x).

## Scope split

| Concern | Owner |
|---------|--------|
| Readability constants + pure compute helper | **US-5.2** BE |
| Extend `getReelScriptsForWeek` DTO with `readability` | **US-5.2** BE |
| Warning UI on scripts detail panel + row badge | **US-5.2** FE |
| Future save validator hook (export only, no caller) | **US-5.2** BE (document in CONTRACT) |
| Script generation / agent output | **US-5.1** (unchanged) |
| Captions | **US-6.1** |

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| UI surface | Extend **`/operator/scripts`** — `ScriptsPageView` detail panel + list row warning indicator |
| V1 mutability | Scripts **read-only**; warnings are preview-only, never block regenerate |
| DB | **No schema change** — derive from `on_screen_text`, `voiceover_text`, `target_duration_sec` |
| Beat parsing | Split `onScreenText` on `\n`; trim; drop empty → each segment = **beat line** |
| `maxCharsPerBeatLine` | **40** characters (JS `.length` on trimmed segment) |
| `maxLinesPerBeat` | **2** — warn if a beat segment contains >2 non-empty sub-lines when split on `\n` *(V1 generated scripts: typically 1 line per beat; char check is primary)* |
| `maxBeatLinesTotal` | **8** — warn when total beat lines > 8 |
| VO word count | Whitespace-split `voiceoverText`; filter empty tokens → `wordCount` |
| `wordsPerSecondTarget` | **2.5** → `targetWordCount = Math.round(targetDurationSec * 2.5)` |
| VO warn over | `wordCount > targetWordCount * 1.15` |
| VO warn under | `wordCount < targetWordCount * 0.70` |
| Warning UX | **Non-blocking** — PrimeReact `Message` severity warn or inline badge; no toast spam on page load |
| Pending scripts | `readability: null` when `status = pending` or `package = null` |
| DTO attachment | **`readability`** on `reelScriptListItemSchema` when package present |
| FE rule source | Display **server-computed** metrics from list DTO — Client Components do not re-implement limits |
| Future save hook | Export **`assertScriptReadabilityForSave(pkg)`** (or equivalent) returning `{ ok, issues[] }` — **no caller in US-5.2 BUILD** |
| Module placement | **`lib/reel-scripts/compute-script-readability.ts`** (pure); types/constants may live in **`lib/contracts/reel-script-readability.ts`** |
| i18n | EN + ES under `scripts.readability.*` |
| Auth | Reuse US-5.1 operator gates — no new public surfaces |

### Readability DTO sketch (CONTRACT freezes Zod)

```ts
// Lean sketch — CONTRACT owns exact names / strict()
type ReelScriptReadability = {
  onScreen: {
    beatLines: Array<{
      index: number;       // 0-based
      text: string;
      charCount: number;
      lineCount: number;   // sub-lines within beat segment
      warnings: Array<"chars_exceeded" | "lines_exceeded">;
    }>;
    totalBeatLines: number;
    warnings: Array<"too_many_beats" | "beat_chars" | "beat_lines">;
  };
  voiceover: {
    wordCount: number;
    targetWordCount: number;
    targetDurationSec: number;
    wordsPerSecondTarget: number; // 2.5
    status: "ok" | "over" | "under";
  };
  hasWarnings: boolean;
};
```

## Carry-forwards / reuse (do not reinvent)

- Scripts page: `app/(app)/operator/scripts/page.tsx` · `components/scripts/ScriptsPageView.tsx`.
- List read: `getReelScriptsForWeek` · `lib/reel-scripts/list-reel-scripts-for-strategy.ts` (or CONTRACT mapper path).
- Package shape: `reelScriptPackageSchema` in `lib/contracts/reel-script.ts` — `onScreenText`, `voiceoverText`, `targetDurationSec`.
- Example on-screen beats: `"3 checks antes del frío\n✓ Filtro\n✓ Termostato"` (US-5.1 fixtures).
- Operator gate: `requireOperator()` unchanged.
- PrimeReact + existing `ScriptField` pattern for detail panel layout.

---

## FE checklist

Concrete BE consumer: extended `getReelScriptsForWeek` → `items[].readability`.

- [ ] **On-screen field block** in detail panel: list beat lines with char count; **warn styling** when `beatLines[].warnings` includes `chars_exceeded` or `lines_exceeded`.
- [ ] **On-screen aggregate warn** when `onScreen.warnings` includes `too_many_beats`.
- [ ] **Voiceover field block**: show `wordCount`, `targetWordCount`, `targetDurationSec` summary line.
- [ ] **VO warn styling** when `voiceover.status` is `over` or `under`.
- [ ] **List row badge/icon** when `readability.hasWarnings === true` (generated scripts only).
- [ ] **Pending / no package**: hide readability block (no false warnings).
- [ ] **EN + ES strings** in `messages/en.json` / `es.json` (`scripts.readability.*`).
- [ ] **No Supabase in Client Components**; no client-side recompute of limits — render server DTO.
- [ ] **Non-blocking** — regenerate + copy actions unchanged.
- [ ] **Accessibility**: warn text not color-only (icon + message).

---

## BE checklist

Concrete FE consumer: `/operator/scripts` list + detail panel.

- [ ] **`computeScriptReadabilityMetrics(package: ReelScriptPackage): ReelScriptReadability`** — pure function with frozen constants.
- [ ] **Unit tests** `lib/reel-scripts/compute-script-readability.test.ts`: char exceed; many beats; VO over/under/ok; empty lines stripped; unicode length; pending package not called.
- [ ] **Extend list mapper** in `getReelScriptsForWeek` pipeline — attach `readability` when `package !== null`.
- [ ] **Extend Zod** `reelScriptListItemSchema` (+ success schema) with `readability` field — CONTRACT freezes.
- [ ] **Export constants** `REEL_SCRIPT_MAX_CHARS_PER_BEAT_LINE`, `REEL_SCRIPT_WORDS_PER_SECOND_TARGET`, etc. for CONTRACT/docs.
- [ ] **`assertScriptReadabilityForSave`** (or named equivalent) — exported, tested, **uncalled** in V1 (future edit story).
- [ ] **No mutation changes** — `generateReelScripts` / `regenerateReelScriptSlot` unchanged; no save validation wired.
- [ ] **No new DB migration**.
- [ ] **No logging** of full script bodies beyond existing US-5.1 policy.

---

## DB checklist

- [ ] **No migration** — metrics computed at read time.
- [ ] **Do not** add readability columns to `neuramark_reel_scripts` unless CONTRACT documents exception (PO veto: none).

---

## Gates (orchestrator)

- [x] SPEC-REVIEW.md (spec-guardian)
- [x] SECURITY.md (security-architect)
- [x] CONTRACT.md authored (nextjs-backend) — extend US-5.1 read contract; **Reviewed by FE** required before BUILD
- [ ] BUILD (nextjs-backend + nextjs-frontend)
- [ ] VALIDATION.md
- [ ] QA.md

**Status:** CONTRACT (2026-08-30). Frozen constants + DTO in `lib/contracts/reel-script-readability.ts`; `reelScriptListItemSchema` extended. **Next:** FE signoff on CONTRACT → BUILD.

---

## Open questions (for SPEC / SECURITY / CONTRACT)

1. **Char counting** — JS `.length` (UTF-16 code units) vs grapheme cluster count for Spanish accents? **PO lean:** `.length` for V1; document limitation in CONTRACT.
2. **VO tokenization** — Simple whitespace split vs locale hyphenation? **PO lean:** whitespace split; sufficient for Operator preview.
3. **Row badge vs icon-only** — **PO lean:** small PrimeReact `Tag` severity warn on list row when `hasWarnings`.
4. **Separate readability endpoint** — **PO lean:** extend existing `getReelScriptsForWeek` only; no new action.
5. **Agent self-check** — Regenerate prompt nudge when metrics fail? **PO lean:** out of US-5.2 BUILD (content-agents-engineer deferred).

No SPEC amendment assumed in PREP: SPEC §3 already lists "warnings de largo on-screen/VO" on script review. Spec-guardian confirms agent/DB scope stay out.
