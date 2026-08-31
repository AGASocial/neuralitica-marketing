## Spec Review — US-9.2 Phase B (VO-synced subtitle timing + coverFrameSec)

### Verdict: ALIGNED

Phase B intent — **System** times burn-in **texto en pantalla** beats with **VO-proportional word partitions** from linked **`neuramark_reel_scripts.voiceover_text`** (fallback equal split), and **Operator** may override per-reel **`coverFrameSec`** on Apply / Re-brand (bounded numeric; auto-chain still uses client **`assembly_config`** only) — **aligns** with SPEC §3 **S3.M10** (subtítulos/logo/cover + timing on Fly FFmpeg), closes the intentional Phase A deferrals recorded in VALIDATION/CONTRACT, and advances USER_STORIES § US-9.2 BE owner wording (“on-screen text **+ VO**”) without new AC checkboxes or a new story ID.

**No SPEC veto.** Vision SC-1–SC-4, hard rules (no publish without Aprobación, no human recording), roles, Playbook/Trend separation, modalidades, and ADRs are intact. Remaining work is **SECURITY amend** + **CONTRACT Phase B section** (BUILD gates) — same pattern as Phase A GAPS → frozen contract, not a product-direction block.

**Upstream satisfied:** US-9.2 Phase A ✅ · US-9.3 Phase A ✅ (VO audio exists; timestamps **not** required) · US-5.1 / US-5.2 ✅ (`voiceover_text` + word tokenizer) · US-9.1 ✅ assembled base.

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **High** | **No CONTRACT Phase B section yet.** Timing helper signature, `AssBeatTiming` shape, partition remainder rule, `voiceoverTimingHash` fingerprint input, `applyBrandingForAssembly` optional `coverFrameSec`, seek clamp, and FE DTO seed path are PREP-sketched only. Phase A CONTRACT still freezes trigger as `{ assemblyJobId, subtitlesEnabled?, logoEnabled? }` and fingerprint without VO hash. | SPEC S3.M10; PHASE-B.md B3–B11; CONTRACT § Phased BUILD / trigger / idempotency | Author **CONTRACT.md Phase B** after SECURITY amend; **Reviewed by FE** before BUILD. |
| **High** | **SECURITY.md still Phase-A-forbids `coverFrameSec` on manual trigger.** Trust boundary #2 and forbidden-keys list reject `coverFrameSec` / `cover_frame_sec`; Phase B B11 requires optional numeric only via strict Zod, with VO text never in argv/ASS dialogue. | SECURITY trigger schema; PHASE-B B11–B12; SPEC §6 injection | **SECURITY.md amendment** before CONTRACT: allow optional `coverFrameSec` ∈ `[0, 45]`; keep all other forbidden keys; reaffirm sanitize → ASS path-only; VO used for **numeric timing only**. |
| **Medium** | **CONTRACT Phase A “Phase B” row over-scopes this slice.** Frozen Phase B line still lists **second font weight** + **preview thumbnail strip** alongside VO timing / cover override. PHASE-B.md / TASKS correctly **scope those out** (further defer). Silent mismatch risks BUILD/VALIDATION claiming unfinished S3.M10 polish. | CONTRACT § Phased BUILD; PHASE-B.md scope out; SPEC-REVIEW Phase A Low (S3.M10 partial) | CONTRACT Phase B acceptance = **VO-proportional timing + Operator `coverFrameSec` only**; font/thumbnail remain **further defer** (not US-9.2-B). |
| **Medium** | **VO “sync” is script-word proxy, not A/V alignment.** Durations = `(words_i / totalWords) * target_duration_sec` — not TTS timestamps, not measured audio. Acceptable V1 given CosyVoice2 has no alignment API (B3–B4); VALIDATION must not claim true lip/word sync. | SPEC S3.M10 “timing”; USER_STORIES BE “+ VO”; PHASE-B B3–B5 | CONTRACT + VALIDATION: label **VO-proportional beat timing from `voiceover_text`**; explicit **out**: TTS/ASR word timestamps. |
| **Medium** | **Fingerprint / snapshot fields for VO timing unset at contract level.** B6 requires `voiceoverTimingHash` so VO edits invalidate idempotency; `subtitleSourceHash` stays on sanitized on_screen beats. Exact hash input (normalized tokens vs partition lengths) and whether hash lives inside `branding_config` JSON must freeze. | PHASE-B B6; CONTRACT idempotency; ADR-0003 re-run correctness | CONTRACT: freeze hash input + include in fingerprint; unit test VO change → new fingerprint. |
| **Low** | **Cliente has no Ficha `coverFrameSec` control (B9).** Defaults remain Zod **1.0** / existing JSON. USER_STORIES FE owner row still omits cover picker — Operator-only override is correct for this slice; do not invent Cliente UI. | PHASE-B B8–B9; SPEC §2 Operator vs Cliente | Keep out of scope; auto-chain = client defaults only. |
| **Low** | **USER_STORIES AC unchanged (correct).** Phase B does not add checkboxes; Phase A 5/5 stay **[x]**. VALIDATION must re-verify **[SEC]** sanitization + cover bounds on new path and mark VO-sync / Operator cover deferrals **closed**. | USER_STORIES US-9.2; PHASE-B B14; VALIDATION Phase A deferred table | VALIDATION Phase B section after BUILD. |
| **Info** | **Closes Phase A intentional S3.M10 deferrals** for VO-synced subtitle timing + Operator per-reel cover. Remaining S3.M10 items elsewhere: weekly auto-brand (ADR-0001), further font/thumbnail polish. | SPEC S3.M10; VALIDATION deferred table | VALIDATION records closure of the two Phase B rows only. |
| **Info** | **Vision & hard rules intact.** No publish without Aprobación; no human recording; branding remains pre-QA / pre-Aprobación production. | SPEC §1 SC-1–SC-4 | Operator cover override ≠ publish. |
| **Info** | **ADRs respected.** ASS timing + cover extract stay on **Fly** (ADR-0003); no IG Graph (ADR-0002); no weekly cron brand (ADR-0001). | ADR-0001–0003 | Do not move FFmpeg to Vercel. |
| **Info** | **Roles unchanged.** Cliente: logo + defaults (no new cover UI). Operator: existing toggles + new cover InputNumber. System: load VO server-side; compute timings; clamp seek. | SPEC §2; PHASE-B B8–B9 | — |
| **Info** | **Modalidad / Playbook / Trend untouched.** | SPEC S3.M4–M6 | — |

---

### Checklist (spec-guardian)

| Check | Result |
|-------|--------|
| Vision & SC-1..SC-4 / hard rules | **Pass** — brand-ready Reels; no silent publish; no recording |
| Roles Cliente / Operator / System | **Pass** — Operator cover override; System timing; Cliente defaults only |
| Modalidades visuales | **N/A** — unchanged |
| Playbook vs Trend | **N/A** — unchanged |
| ADR-0001 / 0002 / 0003 | **Pass** — Fly FFmpeg; no IG; no cron in slice |
| NFR (secrets, i18n EN/ES, `neuramark_*`, `client_id`) | **Pass** — no new tables; `scripts.branding.coverFrame*`; VO server-only |
| Out of scope (Stories IG, multicanal, ads, RBAC UI, TTS timestamps, STT, soft subs) | **Pass** — correctly listed out |

---

### TASKS / PHASE-B open questions — resolved against SPEC

| Question | Resolution | SPEC / ADR basis |
|----------|------------|------------------|
| TTS timestamps vs VO words? | **VO word partition** — no TTS alignment in V1 | S3.M10 timing; CosyVoice path; B3–B4 |
| Cue list from script? | **No** — `on_screen_text` beats + VO words for duration only | S3.M6 texto en pantalla |
| Store cover on script row? | **No** — `branding_config` + profile `assembly_config` | S3.M10 cover; existing Phase A DDL |
| Thumbnail strip / second font? | **Out of US-9.2-B** — further defer | PHASE-B scope out; CONTRACT must match |
| Cliente cover picker? | **No** — Operator only | SPEC §2 Operator production tools |
| New story ID? | **No** — `US-9.2-B` sprint label | Same S3.M10 module slice |
| Subtitle text source? | Unchanged: sanitized **`on_screen_text`** | S3.M6; Phase A SECURITY |
| Sanitizer on new path? | **Mandatory unchanged** — VO never in ASS dialogue / argv | SPEC §6; B12 |

**No SPEC.md amendment required.** Phase B completes documented Phase A S3.M10 polish.

---

### Terminology violations (CONTEXT)

**None that block** in PHASE-B.md / README / TASKS Phase B (uses **Ensamblado**, **Paquete de guion**, **texto en pantalla**, **Ficha viva**, **Operator**, **Cliente**).

Product-facing EN/ES for the new control must use:

| Prefer | _Evitar_ |
|--------|----------|
| Cover frame / frame second (Operator label via i18n) | exposing raw `coverFrameSec` as sole user copy without label |
| **texto en pantalla** (ES) | treating VO as on-screen subtitle source |
| Voiceover / VO (timing source, Operator diagnostics OK) | claiming “lip-sync” or “word-aligned audio” in UI |
| **Operator** | admin / staff |
| **Cliente** | prestador / dueño as product role |

Technical identifiers (`voiceover_text`, `coverFrameSec`, `voiceoverTimingHash`, `computeVoProportionalBeatTimings`) OK in code/CONTRACT; map to localized labels in FE. Do **not** expose FFmpeg argv, ASS body, VO raw text, or storage keys in DTOs.

---

### Gaps (non-blocking for SPEC; blocking for later gates)

1. SECURITY.md Phase B amend (numeric `coverFrameSec` on apply; VO never in argv; sanitizer unchanged).
2. CONTRACT.md Phase B section + FE Reviewed (algorithm, hash, schema, clamp, DTO).
3. CONTRACT Phase B scope row narrowed (drop second font / thumbnail from this slice).
4. VALIDATION.md Phase B after BUILD (close deferred VO-sync + Operator cover rows; re-verify [SEC]).

---

### Blockers

| Item | Blocks? | Guidance |
|------|---------|----------|
| SPEC / CONTEXT / ADR veto on Phase B intent | **No** | Proceed |
| SECURITY.md Phase B amendment | **Yes — next gate** | Before CONTRACT freeze |
| CONTRACT.md Phase B + Reviewed by FE | **Yes — BUILD gate** | After SECURITY |
| TTS / ASR / client cue lists | **N/A — out of scope** | Do not pull in |
| New USER_STORIES AC rows | **No** | Do not uncheck Phase A; no new boxes |
| Second font / thumbnail strip | **No — further defer** | Not US-9.2-B |
| Weekly auto-brand cron | **No — out of scope** | ADR-0001 |

**SPEC blockers on intent:** none. **ADR breaches:** none if ASS timing + cover extract stay on Fly and orchestrator stays on Vercel.

**SECURITY can proceed?** **Yes.** Phase B threat delta is bounded: optional numeric cover on Operator trigger; VO loaded server-side for partition math only; sanitizer path unchanged.

**CONTRACT freezes required before BUILD:**

1. **`computeVoProportionalBeatTimings()`** — tokenizer = US-5.2 whitespace tokens; contiguous buckets; remainder spread; fallback equal split; last end === `target_duration_sec`.
2. **`buildAssFromBeats`** accepts explicit timings; dialogue text = sanitized on_screen only.
3. **`applyBrandingForAssembly({ assemblyJobId, subtitlesEnabled?, logoEnabled?, coverFrameSec? })`** — Zod `min(0).max(45)`; out-of-range → `VALIDATION_ERROR`; forbidden keys amended.
4. **`voiceoverTimingHash`** in fingerprint; `subtitleSourceHash` unchanged semantics.
5. Cover seek clamp **`[0, max(0, durationSec - 0.05)]`** (measured branded duration preferred).
6. Operator FE: InputNumber seed + Apply/Re-brand wire; EN/ES `scripts.branding.coverFrame*`.
7. Phase B acceptance boundary: VO timing + Operator cover only; font/thumbnail further defer.

---

### Recommended action

1. Proceed to **security-architect SECURITY.md amendment** (no SPEC veto).
2. Then **nextjs-backend CONTRACT.md Phase B** + **nextjs-frontend Reviewed by FE**.
3. Then BUILD: **media-pipeline-engineer** ∥ **nextjs-backend** ∥ **nextjs-frontend**.
4. VALIDATION Phase B closes Phase A deferred VO-sync + Operator `coverFrameSec` rows; re-verify [SEC]; **do not** uncheck Phase A AC.

Do not check off USER_STORIES acceptance criteria in this gate.
