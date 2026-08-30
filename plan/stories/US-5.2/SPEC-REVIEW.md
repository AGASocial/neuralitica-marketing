## Spec Review — US-5.2

### Verdict: GAPS

US-5.2 intent — **Operator** sees **texto en pantalla** per-beat length warnings and **voiceover** word-count vs **target duration** on the existing `/operator/scripts` **Paquete de guion** read surface, so on-screen copy stays readable on **9:16 Reels** — is **directionally aligned** with SPEC §3 **Video Script Agent** (“warnings de largo on-screen/VO”), SPEC §1 SC-1 (3 Reels/semana without human recording), frozen US-5.1 **Paquete de guion** shape (`onScreenText` newline-separated beats, `voiceoverText`, `targetDurationSec` 15–45), US-5.1 CONTRACT out-of-scope handoff (warnings deferred here), and `ScriptsPageView.tsx` expand-row detail panel (hook/body/CTA/on-screen/VO — no warnings yet).

**Gaps** sit between `plan/USER_STORIES.md` § US-5.2 acceptance criteria / owner table and what can be implemented without inventing thresholds, beat semantics, or a nonexistent Operator “save” path. Until USER_STORIES (or frozen CONTRACT) closes them, FE/BE risk divergent magic numbers, warnings on the wrong surface, or scope creep into inline edit / blocking persist.

**Upstream dependency satisfied:** US-5.1 ✅ CLOSED — `reelScriptPackageSchema`, `GetReelScriptsForWeekSuccess`, Operator scripts page, generate/regenerate-only (no inline edit).

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **High** | **Per-beat max chars undefined.** AC: “Warn when on-screen text exceeds **configured** max chars per beat.” No numeric limit in USER_STORIES, US-5.1 CONTRACT (only aggregate `onScreenText` ≤ 500), DESIGN_PROMPTS (“per-beat max”), or codebase. | SPEC §3 Video Script (warnings); US-5.1 CONTRACT § Paquete de guion (`onScreenText` newline beats) | Freeze shared constant e.g. `ON_SCREEN_MAX_CHARS_PER_BEAT` (and optional `ON_SCREEN_MAX_LINES_PER_BEAT`) in CONTRACT `lib/contracts/reel-script-readability.ts`; document 9:16 subtitle rationale; FE + BE import same module. |
| **High** | **Beat parsing rules missing.** US-5.1 PO lean: single `onScreenText` string, **newlines = beat lines**. US-5.2 must define: split on `\n`, trim per line, skip empty lines?, max beat count?, warn per line vs per logical beat when a beat wraps. | US-5.1 TASKS.md PO decision #7; US-5.1 CONTRACT L244 | CONTRACT: `parseOnScreenBeats(onScreenText): string[]` — trim, drop empties, max beats (e.g. 8 aligned to `brollBeats` cap); warn when **any** beat exceeds char limit; optional secondary warn when beat count > N. |
| **High** | **BE “validation rules on save” contradicts frozen US-5.1.** USER_STORIES BE row: “Validation rules on save.” US-5.1 CONTRACT + SECURITY: **Operator inline script edit out of scope** — regenerate only; no PATCH/save Server Action. Scripts change only via LLM generate/regenerate persist. | US-5.1 CONTRACT § Out of scope; SPEC §3 Video Script “Fuera V1: edición libre larga del guion por Cliente” | Replace “on save” with: **(A)** advisory warnings on read DTO (computed server-side in `getReelScriptsForWeek` or shared pure fn consumed by FE); **(B)** optional **persist-time advisory flags** on generate/regenerate (log/metadata only — **do not block** UPSERT unless PO explicitly adds hard reject); **no** Operator edit/save endpoint. |
| **Medium** | **Voiceover duration estimate unspecified.** AC: “Voiceover word count estimate shown vs target duration.” No WPM, locale split (EN/ES), word tokenizer, or warn threshold. DESIGN_PROMPTS shows “~38s of 45s target” but not formula. | SPEC §3 Video Script (VO warnings); SPEC §6 i18n EN/ES | CONTRACT: `estimateVoiceoverDurationSec(text, locale)` — freeze WPM (e.g. 150 EN / 140 ES lean), word count rule, display `~{estimate}s of {targetDurationSec}s target`; warn when estimate > `targetDurationSec` (or > 110% — pick one). |
| **Medium** | **Advisory vs blocking behavior unset.** SPEC says “warnings,” not gates. US-5.1 Zod already hard-blocks aggregate max lengths at persist. Per-beat overage is currently **allowed** at persist. | SPEC §3 Video Script; US-5.1 [SEC] schema validation | CONTRACT: US-5.2 warnings are **non-blocking** for Operator workflow (PrimeReact `Message`/`Tag` severity warn); regenerate remains remediation. Optional agent self-check = prompt hint only, not persist gate, unless PO adds explicit AC. |
| **Medium** | **FE owner table “line warnings” vs AC.** Owner FE: “Character/**line** warnings”; AC only mentions chars per beat. Unclear if multi-line beats or line-count limits apply. | USER_STORIES § US-5.2 | Align AC with DESIGN_PROMPTS: **char-per-beat** primary; drop “line” or add explicit max-lines-per-beat AC if product wants it. |
| **Low** | **Story title “Preview … vertical video” vs AC.** Title implies 9:16 visual preview; AC + DESIGN_PROMPTS §6 = field-level readability metrics only (no phone frame / mock Reel). | DESIGN_PROMPTS.md §6 | Scope note in CONTRACT: **readability warnings**, not US-9.x assembly preview or US-11 Aprobación video player. Rename story title optional (PO). |
| **Low** | **Cliente warnings deferred.** SPEC §3: “Operator/**Cliente**: ver guiones” incl. warnings. US-5.1 FE = Operator-only; Cliente read → US-11 **Aprobación**. | SPEC §3 Video Script; US-5.1 SPEC-REVIEW L26 | US-5.2 BUILD = Operator `/operator/scripts` only; reuse shared readability helpers when US-11 shows **Paquete de guion** text. |
| **Low** | **i18n not in AC.** NFR §6 EN/ES; warning strings need keys (beat over limit, VO over duration, aggregate labels). | SPEC §6 i18n | Add AC or CONTRACT: EN/ES keys under `scripts.readability.*` (or extend existing `scripts` namespace). |
| **Info** | **No DB migration — aligned.** USER_STORIES DB: — ; warnings derived from existing columns. | US-5.1 CONTRACT DB shape | Keep computed flags in read DTO or pure FE+shared module; optional `readability_warnings jsonb` **out of scope** unless PO wants audit trail. |
| **Info** | **Out of scope held:** inline Operator edit, caption char count (US-6.1), cost/budget (US-7.1), video/assembly/FFmpeg (US-8.x/US-9.x), Cliente Aprobación package (US-11), cron (ADR-0001), multicanal, Stories, ads, RBAC UI. | SPEC §1; US-5.1 CONTRACT § Out of scope | US-5.2 = readability UX on existing script read + optional generate-time hints only. |
| **Info** | **ADRs respected.** No Fly worker, no IG publish, no new external integration. | ADR-0001–0003 | Warnings live in Next.js app layer / shared contracts. |

---

### Current implementation baseline (`ScriptsPageView.tsx`)

| Area | US-5.1 shipped | US-5.2 gap |
|------|----------------|------------|
| `onScreenText` display | `ScriptField` with `preserveWhitespace` | No per-beat split, char count, or warn UI |
| `voiceoverText` display | Plain text + copy | No word count or duration estimate |
| `targetDurationSec` | Column + row field | Not compared to VO estimate |
| Edit/save | None (regenerate only) | Confirms no save hook exists — warnings must attach to **read** or **generate response** |

Extension point: `ScriptDetailPanel` → enhance `ScriptField` for `onScreenText` / `voiceoverText` or add `ReadabilityHints` subcomponent; keep `"use client"` boundary; no Supabase in client.

---

### Terminology violations (CONTEXT)

| Location | Issue | Prefer |
|----------|-------|--------|
| Story goal “subtitles fit 9:16 Reels” | Conflates **texto en pantalla** (script field) with **subtítulos** burned in assembly (US-9.2) | Goal copy: “on-screen text readable on 9:16 Reels” / ES: **texto en pantalla** legible en Reels 9:16 |
| “script” in Operator workspace | Acceptable EN chrome; domain entity = **Paquete de guion** | ES product strings: **Paquete de guion** / **texto en pantalla** / **locución (VO)** |
| BE “validation on save” | Implies editable form | **Validación al persistir (generación/regeneración)** or **avisos en lectura** |

No _Evitar_ role synonyms (admin, prestador, etc.) in US-5.2 story text.

---

### Blocking gaps (must close before CONTRACT freeze)

| # | Gap | Blocks |
|---|-----|--------|
| 1 | Freeze **`maxCharsPerBeat`** (+ optional max beats/lines) shared FE/BE | AC “configured max”; consistent warnings |
| 2 | Freeze **`parseOnScreenBeats`** semantics for newline-separated `onScreenText` | Per-beat warnings; false positives/negatives |
| 3 | Reconcile **“validation on save”** with **regenerate-only** US-5.1 — define read-time vs persist-time advisory paths | BE scope; no phantom save API |
| 4 | Freeze **VO duration estimate** formula (WPM, locale, warn threshold vs `targetDurationSec`) | Second AC; EN/ES parity |

---

### Recommended action

1. **Amend `plan/USER_STORIES.md` § US-5.2** (or document overrides in CONTRACT with PO signoff):
   - Numeric per-beat char limit + beat parsing rule.
   - VO estimate formula and warn condition.
   - Replace “validation on save” with read-time warnings + optional non-blocking persist-time flags on generate/regenerate.
   - Explicit: warnings advisory; Operator remediates via regenerate.
2. Proceed to **CONTRACT.md** with frozen `lib/contracts/reel-script-readability.ts` (pure functions + constants) consumed by FE `ScriptsPageView` and optionally BE read DTO / agent prompt hint.
3. **SECURITY.md** — likely minimal (no new secrets, no Cliente route); confirm warnings expose no cross-tenant data (reuse US-5.1 tenancy).
4. **Out of scope for CONTRACT unless PO amends SPEC:** 9:16 visual mock, Cliente Aprobación warnings, blocking persist on over-limit beats, inline edit.

---

### Spec alignment summary

| Checklist item | Status |
|----------------|--------|
| Vision SC-1..SC-4 | ✅ Supports readable Reels; no publish/approval change |
| Roles (Operator vs Cliente) | ✅ Operator BUILD; Cliente deferred US-11 |
| Modalidades / playbook / trend | ✅ No change |
| Playbook vs Trend | ✅ Not conflated |
| ADR-0001/0002/0003 | ✅ No breach |
| NFR i18n, server-only, `neuramark_`, multi-tenant | ✅ No new DB; reuse US-5.1 read path |
| Out of scope v1 | ✅ Held |
