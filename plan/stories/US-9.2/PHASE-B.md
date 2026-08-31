# US-9.2 Phase B — VO-synced subtitle timing + per-reel coverFrameSec

**Story ID:** **US-9.2** (same story — **not** a new `US-9.x` ID). Sprint label: **`US-9.2-B`**.  
**Status:** CLOSED (2026-08-31) — VALIDATION PASS WITH NOTES `6db2cba` (2/2 deferred; 44/44); QA APPROVE WITH CONDITIONS `02bfa3b` (0 Critical/High). Phase A CLOSED (`92b196a`).  
**Branch:** `feature/US-9.2-phase-b-subtitle-cover`

**As a** System, **I want** subtitle burn-in timed to voiceover pace and an Operator-chosen cover frame second, **so that** on-screen text tracks spoken VO and IG covers pick a useful frame per Reel.

---

## Requirement summary

Phase A ships burn-in subtitles (equal beat split), optional logo, cover @ default **1.0s**, Cliente logo + defaults, Operator subtitle/logo toggles, and **[SEC]** sanitization. Phase B closes the **deferred** polish only:

1. **VO-proportional beat timing** from script `voiceover_text` word partitions (not TTS timestamps).
2. **Per-reel `coverFrameSec` Operator override** on apply/re-brand (numeric, bounded).

Canonical AC remain [`plan/USER_STORIES.md`](../../USER_STORIES.md) § US-9.2 — **all five Phase A AC stay checked**. Phase B **does not add new USER_STORIES checkboxes**; VALIDATION must re-verify **[SEC]** subtitle sanitization + cover bounds against the new timing/override path, and record closure of the Phase A deferrals.

---

## Scope in

| Area | Phase B adds |
|------|----------------|
| **BE** | Load `voiceover_text` with script beats; **`computeVoProportionalBeatTimings()`**; extend `buildAssFromBeats` to accept explicit timings (fallback equal split); allow optional **`coverFrameSec`** on `applyBrandingForAssembly`; merge into `branding_config` snapshot; extend fingerprint when VO/timing changes; clamp cover seek vs duration. |
| **Worker** | Use VO-proportional (or equal fallback) timings in ASS; extract cover at snapshot `coverFrameSec` (already wired — verify override path). |
| **FE** | Operator branding panel: **`InputNumber` cover frame (sec)** seeded from `brandingConfig.coverFrameSec` / client default; pass on Apply / Re-brand. EN/ES (`scripts.branding.coverFrame*`). Subtitle/logo toggles **already exist** — reuse. |
| **DB** | **No new tables/columns** — `assembly_config` + `branding_config` already hold `coverFrameSec`. |
| **Implementers** | **media-pipeline-engineer** (ASS timing + cover clamp) + **nextjs-backend** (resolver, action schema, fingerprint, CONTRACT amend) + **nextjs-frontend** (cover InputNumber + i18n). |

## Scope out

| Topic | Why |
|-------|-----|
| TTS / provider word-level timestamps | CosyVoice2 path has **no** alignment API in V1 — out |
| STT / ASR from VO audio | Phase A scope-out stands |
| Soft subtitle tracks | Burn-in only |
| Custom / second font weight | Further defer (not this PREP slice) |
| Preview thumbnail strip | Further defer |
| Cliente `/profile` coverFrameSec UI | Operator override only; client default stays Zod default **1.0** (no new Ficha control) |
| New story ID | Same **US-9.2** |
| Unchecking Phase A AC | Remain closed |

---

## PO decisions frozen (2026-08-31) — Phase B

| # | Topic | Decision |
|---|-------|----------|
| **B1** | **Story identity** | **Phase B of US-9.2** — sprint `current_story: US-9.2-B`. Not a new backlog ID. |
| **B2** | **Subtitle text source** | Unchanged: sanitized **`on_screen_text`** newline beats only. |
| **B3** | **VO-synced timing source** | **Words-per-beat from `voiceover_text`** on the linked `neuramark_reel_scripts` row. Contiguous whitespace-token partition into `beatCount` buckets (same tokenizer as US-5.2 `countVoiceoverWords`). Beat *i* duration = `(words_i / totalWords) * target_duration_sec`. Cumulative starts/ends cover `[0, target_duration_sec]`. |
| **B4** | **Not timing sources** | **No** TTS timestamps · **No** word-level CosyVoice/ElevenLabs alignment · **No** ASR · **No** separate cue list schema · **No** client-supplied beat timings. |
| **B5** | **Timing fallback** | If VO empty / `totalWords === 0` / `beatCount === 0` → **Phase A equal split** (`target_duration_sec / beatCount`). Empty beats still skip burn-in. |
| **B6** | **Idempotency** | Fingerprint must invalidate when VO-driven timings change: include server **`voiceoverTimingHash`** = sha256 of normalized VO token list (or stable partition lengths + VO hash — CONTRACT freezes exact input). `subtitleSourceHash` remains hash of sanitized **on_screen** beats. |
| **B7** | **`coverFrameSec` storage** | **Already:** client default on **`neuramark_business_profiles.assembly_config.coverFrameSec`**; per-run snapshot on **`neuramark_assembled_reels.branding_config.coverFrameSec`**. No new column. |
| **B8** | **Operator override UI** | **Yes** — PrimeReact **`InputNumber`** (seconds, step **0.1**) on Operator assembly branding panel. Seed from last `brandingConfig.coverFrameSec` else client defaults else **1.0**. Passed as optional **`coverFrameSec`** on Apply / Re-brand. Auto-chain still copies **client defaults only** (no Operator UI on auto-chain). |
| **B9** | **Cliente cover UI** | **No** Phase B Ficha control — defaults remain server Zod (**1.0** unless already set in JSON). |
| **B10** | **Safe bounds** | Zod **`min(0).max(45)`** unchanged (Phase A SECURITY). At extract: clamp seek to **`[0, max(0, durationSec - 0.05)]`** using measured branded file duration when available, else `target_duration_sec`. Out-of-range Operator input → **`VALIDATION_ERROR`** before enqueue. |
| **B11** | **Trigger schema amend** | Phase A forbade `coverFrameSec` on apply. Phase B: allow **optional number** only via strict Zod on **`applyBrandingForAssembly`**. Remove `coverFrameSec` / `cover_frame_sec` from forbidden authority keys for that action (SECURITY amend). Still forbid beat text, asset ids, URLs, fonts, snapshot JSON. |
| **B12** | **Subtitle sanitization [SEC]** | **Unchanged and mandatory** — sanitize → ASS temp file → path-only in argv. Timing math is **numeric-only**; VO text never enters FFmpeg argv or ASS dialogue (ASS dialogue = sanitized on_screen beats only). |
| **B13** | **FE continuity** | Subtitle / logo toggles **already shipped** in Phase A — do not rebuild. Add cover frame control + i18n only. |
| **B14** | **Phase A AC** | All five USER_STORIES AC remain **[x]**. Phase B closes deferred items documented in VALIDATION/CONTRACT; re-verify SEC on new path. |
| **B15** | **Implementers** | **media-pipeline-engineer** + **nextjs-backend** + **nextjs-frontend**. CONTRACT Phase B section + FE Reviewed line before BUILD. |

---

## Algorithm sketch (CONTRACT freezes)

```ts
// Timing only — beats[] already sanitized on_screen lines
function computeVoProportionalBeatTimings(params: {
  beatCount: number;
  targetDurationSec: number;
  voiceoverText: string;
}): AssBeatTiming[] {
  // 1. tokens = voiceoverText.trim().split(/\s+/).filter(Boolean)
  // 2. if tokens.length === 0 || beatCount === 0 → equal split
  // 3. partition tokens into beatCount contiguous buckets (spread remainder)
  // 4. duration_i = (bucket_i.length / tokens.length) * targetDurationSec
  // 5. cumulative start/end; last end === targetDurationSec
}
```

---

## Task breakdown (summary)

See [`TASKS.md`](./TASKS.md) § Phase B checklist.

| Layer | Work |
|-------|------|
| **FE** | Operator `coverFrameSec` InputNumber + wire Apply/Re-brand; EN/ES |
| **BE** | VO load; timing helper; apply schema; forbidden-keys amend; fingerprint; tests |
| **Worker** | `buildAssFromBeats` accept timings; cover seek clamp |
| **DB** | None |

---

## Dependencies and sequence

1. **US-9.2 Phase A** ✅ — branding pipeline, ASS, cover extract, Operator toggles  
2. **US-9.3 Phase A** ✅ — VO audio exists; **timestamps not required** for this timing model  
3. **US-5.1 / US-5.2** ✅ — `voiceover_text` + word tokenizer  
4. **This PREP** → **SPEC-REVIEW** (Phase B) → **SECURITY** amend → **CONTRACT** Phase B + FE Reviewed → **BUILD** → **VALIDATION** → **QA** → CLOSE Phase B  

**Unblocks:** better brand-ready Reels for US-10.1 / US-11.x (same seams; richer timing + cover choice).

---

## Gates (Phase B) — CLOSED 2026-08-31

- [x] SPEC-REVIEW.md amendment (spec-guardian — S3.M10 VO timing + cover override) — `SPEC-REVIEW-PHASE-B.md`
- [x] SECURITY.md amendment (security-architect — numeric cover on trigger; VO text never in argv; sanitizer unchanged)
- [x] CONTRACT.md Phase B section (nextjs-backend) — **Reviewed by FE** before BUILD
- [x] BUILD (media-pipeline-engineer ∥ nextjs-backend ∥ nextjs-frontend) — BE `95419c1` · FE `8f365bf`
- [x] VALIDATION-PHASE-B.md (requirements-validator) — PASS WITH NOTES `6db2cba`
- [x] QA-PHASE-B.md (qa-engineer) — APPROVE WITH CONDITIONS `02bfa3b`

**Phase B CLOSED.** Residual: second font · thumbnail strip · Cliente cover UI · worker VO-hash re-check (QA M1).

---

## Open questions (resolved — PO lean)

| Question | PO default |
|----------|------------|
| TTS timestamps vs VO words? | **VO word partition** — no TTS alignment in V1. |
| Cue list from script? | **No** — reuse `on_screen_text` beats + VO words for duration only. |
| Store cover on script row? | **No** — `branding_config` snapshot + profile `assembly_config` default. |
| Thumbnail strip / second font? | **Out of this Phase B slice** — further defer. |
| Cliente cover picker? | **No** — Operator only. |
| New story ID? | **No** — `US-9.2-B` sprint label. |
