# US-9.2 Phase B-M1 — Worker `voiceoverTimingHash` re-check

**Story ID:** **US-9.2** (same story — **not** a new `US-9.x` ID). Sprint label: **`US-9.2-B-M1`**.  
**Status:** CONTRACT frozen / BUILD unblocked  
**Branch:** `feature/US-9.2-b-m1-voiceover-timing-hash`  
**Source:** [`QA-PHASE-B.md`](./QA-PHASE-B.md) Finding **Medium #1**

**As a** System, **I want** the branding worker to re-verify `voiceoverTimingHash` against live script VO before VO-proportional ASS timings, **so that** burn-in timestamps stay consistent with the fingerprint / snapshot frozen at enqueue.

---

## Requirement summary

Phase B ships `voiceoverTimingHash` in `branding_config` + fingerprint, and the worker already re-checks **`subtitleSourceHash`** against live on-screen text before burn-in. It does **not** recompute / compare **`voiceoverTimingHash`** before `computeVoProportionalBeatTimings` from live `voiceoverText`.

If `voiceover_text` changes between enqueue and Fly run, ASS Dialogue timestamps follow the **new** VO while the snapshot hash / fingerprint still describe the **old** partition — fingerprint integrity gap (not injection; VO remains counts-only).

**Fix (QA):** After loading script VO (same path as today’s subtitle-hash guard), `computeVoiceoverTimingHash(voiceoverText)` and **fail** the job (sanitized i18n code) when ≠ `config.voiceoverTimingHash`. Unit test: mismatch → **no** FFmpeg spawn / `branding_status = failed`.

Canonical AC remain [`plan/USER_STORIES.md`](../../USER_STORIES.md) § US-9.2 — **do not** add or uncheck AC. Phase A/B stay closed.

---

## Scope in

| Area | M1 adds |
|------|---------|
| **Worker** | After VO load + subtitle-hash guard (before temp dir / spawn): recompute `computeVoiceoverTimingHash(voiceoverText)`; mismatch → `failBrandingJob` + return. |
| **BE / tests** | New sanitized failure constant (parallel to `BRANDING_FAILURE_SUBTITLE_HASH`); unit test mismatch → no spawn. |
| **CONTRACT** | Amend worker step + fail code (nextjs-backend — **do not** rewrite in PREP). |
| **Implementers** | **media-pipeline-engineer** (worker guard) + **nextjs-backend** (CONTRACT amend + tests). **FE: none.** |
| **DB** | **None.** |

## Scope out

| Topic | Why |
|-------|-----|
| Poll claim race / `FOR UPDATE SKIP LOCKED` | QA M2 / Phase A carry-forward — separate |
| Second font · thumbnail strip · Cliente cover UI | Further defer |
| New USER_STORIES AC / unchecking Phase A/B AC | Out |
| Changing hash formula / fingerprint shape | Already frozen Phase B — reuse `computeVoiceoverTimingHash` |
| Client-supplied hash / timings | Still forbidden |

---

## PO decisions frozen (2026-08-31) — Phase B-M1

| # | Topic | Decision |
|---|-------|----------|
| **M1-1** | **Story identity** | **Fast-follow of US-9.2 Phase B** — sprint `US-9.2-B-M1`. Not a new backlog ID. |
| **M1-2** | **Guard placement** | Same early-fail window as subtitle hash: after script VO load + `subtitleSourceHash` check, **before** `mkdtemp` / ASS write / FFmpeg spawn. |
| **M1-3** | **Compare API** | Reuse existing **`computeVoiceoverTimingHash(voiceoverText)`** (`lib/assembly/compute-vo-proportional-beat-timings.ts`) — same input as enqueue. |
| **M1-4** | **Mismatch behavior** | `failBrandingJob` + sanitized message key; **no** spawn; Operator sees failed branding (re-brand after script settle). |
| **M1-5** | **Fail code** | New constant parallel to `BRANDING_FAILURE_SUBTITLE_HASH`, e.g. `scripts.branding.failure.voiceoverTimingHashMismatch` — **CONTRACT freezes exact string**. |
| **M1-6** | **Legacy Phase A snapshots** | Enforce only when `config.voiceoverTimingHash` is **64-char hex**. Empty / missing (soft-default legacy) → **skip** VO-hash re-check (Phase A rows never stored the hash). |
| **M1-7** | **Empty VO** | Still enforce when hash present — empty VO has a deterministic hash; mismatch still fails. |
| **M1-8** | **SEC posture** | No new client authority; VO still never enters ASS dialogue / argv; fail codes sanitized only. |
| **M1-9** | **FE** | **None** — no new UI; Operator panel need not specially map the new key (generic failed OK; optional i18n later). |
| **M1-10** | **SPEC** | **No SPEC drift** — hardening of Phase B fingerprint integrity already implied by SEC anti-forgery. Skip full SPEC-REVIEW; optional one-line note only if guardian wants it. |

---

## Task breakdown (summary)

See [`TASKS.md`](./TASKS.md) § Phase B-M1 checklist.

| Layer | Work |
|-------|------|
| **Worker** | VO-hash re-check before proportional timings / spawn |
| **BE** | Fail constant + unit test (mismatch → no spawn) |
| **CONTRACT** | Amend worker step + fail code (nextjs-backend) |
| **FE / DB** | None |

---

## Dependencies and sequence

1. **US-9.2 Phase B** ✅ — `voiceoverTimingHash` at enqueue + VO-proportional timings  
2. **This PREP** → **SECURITY lean amend** (integrity AC) → **CONTRACT amend** (worker step + fail code) → **BUILD** → **VALIDATION** (lean) → **QA** (lean) → CLOSE M1  

**Note:** CONTRACT amendment required — nextjs-backend authors; PO does not rewrite `CONTRACT.md` in PREP.

---

## VALIDATION note (binding)

- Do **not** check or uncheck USER_STORIES § US-9.2 AC.
- Validate: live VO ≠ snapshot hash → job **`failed`**, sanitized reason, **zero** FFmpeg invocations in unit test.
- Re-confirm: matching hash still reaches proportional timings path; VO still absent from argv / ASS dialogue.
- Record M1 closure of QA-PHASE-B Medium #1 only.

---

## Gates (Phase B-M1)

- [x] PREP — this file + TASKS Phase B-M1 checklist + README note
- [x] SECURITY.md lean amend (security-architect — integrity re-check; sanitized fail)
- [x] CONTRACT.md amend (nextjs-backend — worker step + fail code; FE Reviewed N/A or waive)
- [ ] BUILD (media-pipeline-engineer ∥ nextjs-backend)
- [ ] VALIDATION lean (requirements-validator)
- [ ] QA lean (qa-engineer — M1 closed)
- [ ] PO CLOSE M1 note

**Next gate:** **BUILD** (media-pipeline-engineer ∥ nextjs-backend) — CONTRACT Phase B-M1 frozen; FE Reviewed N/A.

---

## Open questions

None — QA fix direction + subtitle-hash parallel are binding.
