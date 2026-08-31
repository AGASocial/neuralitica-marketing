# US-8.9 — Operator B-roll generate UI (P1)

**Status:** PREP (2026-08-31) — story + TASKS frozen; branch `feature/US-8.9-broll-operator-generate-ui`; next SPEC-REVIEW → SECURITY → CONTRACT.

**As an** Operator, **I want** to trigger B-roll clip generation from `/operator/scripts` for faceless Reels, **so that** I can produce Wan (low tier) or LTX (high tier) clips without manual backend calls.

Ship **Operator-only B-roll generate control** on `/operator/scripts`: mirror **`HeygenGenerateControl`** / **`HeygenGenerateConfirmDialog`** (US-8.7) — eligibility via server **`previewBrollVideoJobsEstimate`**, confirm shows cost + clip count + provider label, submit calls existing **`createBrollVideoJobs`** Server Action with **`{ reelScriptId, clientId }` only**. Policy selects **Wan (`siliconflow_wan21_turbo`, low)** or **LTX (`ltx_broll_high`, high)** — no client authority fields. **No new adapter or orchestrator work** — backend orchestrator shipped in US-8.5 / US-8.8.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-8.9 (6 AC — do **not** check off in PREP).

**This folder:** [`plan/stories/US-8.9/`](./) — `README.md` · `TASKS.md` (gates: `SECURITY.md` · `CONTRACT.md` · `VALIDATION.md` · `QA.md` — create when story enters BUILD).

**Branch:** `feature/US-8.9-broll-operator-generate-ui`

**Depends on:** [US-8.5](../US-8.5/) ✅ `createBrollVideoJobs` + Wan adapter + graceful degrade · [US-8.8](../US-8.8/) ✅ LTX high-tier path · [US-8.4](../US-8.4/) ✅ job table + poller + Operator scripts page · [US-8.7](../US-8.7/) ✅ HeyGen generate UI pattern · [US-7.1](../US-7.1/) ✅ budget · [US-7.2](../US-7.2/) ✅ tier routing · [US-5.1](../US-5.1/) ✅ `broll_beats` / faceless modalidad. **Soft:** [US-9.1](../US-9.1/) Phase B ✅ (stitch consumer — no FE change required here).

**Unblocks:** Operator faceless B-roll workflow without manual Server Action calls · closes US-8.5 / US-8.8 deferred optional FE row · idle backlog item from PHASE-7.

---

## Scope in

| Area | What US-8.9 BUILD adds |
|------|------------------------|
| **FE** | **`BrollGenerateConfirmDialog`** + **`BrollGenerateControl`** (or equivalent names) — PrimeReact Dialog/Button; wired into **`ScriptsPageView`** on `/operator/scripts`; EN/ES i18n under `scripts.broll.*`; success toast + refresh (same refresh hooks as HeyGen success). |
| **BE** | **`previewBrollVideoJobsEstimate`** Server Action — operator-gated; reuses policy + estimate logic from orchestrator (no duplicate provider math); extend **`previewBrollVideoJobsEstimateSuccessSchema`** for **`ltx_broll_high`** provider key; **`createBrollVideoJobs`** action unchanged (already operator-gated). |
| **DB** | — (reuse `neuramark_video_jobs`) |
| **Implementers** | **nextjs-frontend** (UI + i18n) + **nextjs-backend** (`CONTRACT.md`, preview action, schema extension, tests). |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **New Wan / LTX adapters** | US-8.5 ✅ · US-8.8 ✅ — already shipped. |
| **`createBrollVideoJobs` orchestrator changes** | Reuse as-is; graceful degrade unchanged. |
| **B-roll job list / status panel for `asset_role = broll`** | Optional follow-up; US-8.4 primary-filtered list acceptable for CLOSE. |
| **Assembly / stitch UI** | US-9.1 ✅ — separate panel. |
| **Client-facing B-roll trigger** | Operator-only (403 for clients). |
| **Manual upload fallback changes** | US-8.3 ✅ — unchanged. |
| **PLAN F7 cron / weekly automation** | Separate backlog item. |

## Canonical terms (CONTEXT)

Use **provider adapter**, **provider key**, **provider tier**, **asset role (`broll`)**, **graceful degrade**, **needs_broll**, **faceless**.  
_Evitar:_ client-supplied `provider_key`; client-computed cost; exposing API keys; blocking primary on B-roll failure.

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-8.5 | **`createBrollVideoJobs`** orchestrator + **`createBrollVideoJobs`** Server Action (narrow body — no client `options`). Preview schemas stubbed in **`video-job.ts`** — **implement preview action here**. |
| US-8.8 | High-tier LTX in orchestrator — preview must return **`ltx_broll_high`** when tier=`high`. |
| US-8.7 | **`HeygenGenerateControl`** pattern — eligibility preview → confirm dialog → mutation → toast. **Copy structure**, not HeyGen-specific fields (no consent/portrait). |
| US-8.4 | Operator scripts page layout; video job refresh after mutation. |
| US-8.5 VALIDATION | **`scripts.broll.failure.referenceStillMissing`** i18n gap noted — **add EN/ES in this story** when surfacing B-roll errors. |

**US-8.9 adds Operator UI + preview action only** — not adapters, migrations, or orchestrator forks.

---

## PO decisions frozen (2026-08-31)

1. **Single-phase BUILD:** FE control + BE preview action + i18n + tests. No Phase A/B split (unlike adapter stories).
2. **Visibility:** Show control when server preview returns **`needsBroll: true`**, eligible provider resolved, and no B-roll jobs **`queued`/`processing`** for the script (server-authoritative; mirror HeyGen `jobInFlight` pattern for broll rows).
3. **Provider display:** Show localized label from resolved **`providerKey`** — **Wan** (low) or **LTX B-roll** (high) via existing display-label helper or i18n keys; never let client pick provider.
4. **Submit payload:** **`{ reelScriptId, clientId }` only** — same as existing Server Action contract.
5. **Partial success:** Orchestrator may return **`skipped`** items with budget/provider reasons — dialog/toast surfaces count created vs skipped (localized); **`skippedNoNeedsBroll`** is silent hide (button not shown).
6. **Preview action:** New **`previewBrollVideoJobsEstimate`** — **`requireOperator`**, same IDOR rules as create (`clientId === operator.id`); returns **`estimatedCostCents`**, **`clipCount`**, **`unitCostCentsPerClip`**, **`providerKey`**, **`needsBroll`**, optional **`blockedReasonKey`**.
7. **Extend preview schema:** **`providerKey`** union **`siliconflow_wan21_turbo | ltx_broll_high`** (today Wan-only optional literal — fix in CONTRACT).
8. **Placement:** On **`ScriptsPageView`** per Reel row — adjacent to **`HeygenGenerateControl`** (after voiceover, before primary video job summary) — only for faceless slots with B-roll beats.
9. **i18n namespace:** **`scripts.broll.generate.*`** (button, title, confirm, cancel, loading, estimated, provider labels, errors, toast).
10. **Implementers:** **nextjs-frontend** + **nextjs-backend**; CONTRACT before BUILD; **Reviewed by FE** required on CONTRACT (FE is primary consumer).

---

## Gates (orchestrator)

- [ ] SPEC-REVIEW.md (spec-guardian — thin FE story vs SPEC §3 Operator flows)
- [ ] SECURITY.md (security-architect — operator gate, no authority smuggling, preview IDOR)
- [ ] CONTRACT.md (nextjs-backend — preview action + extended schema + FE props; **Reviewed by FE**)
- [ ] BUILD (nextjs-frontend + nextjs-backend)
- [ ] VALIDATION.md (requirements-validator)
- [ ] QA.md (qa-engineer)
- [ ] CLOSE — 6/6 AC checked in USER_STORIES.md (product-owner)

**Status:** PREP. **Next:** SPEC-REVIEW on `feature/US-8.9-broll-operator-generate-ui`.

---

## Acceptance criteria mapping

| USER_STORIES § US-8.9 AC | Deliverable |
|--------------------------|-------------|
| Operator control visible when faceless + needs_broll + active provider | Preview eligibility + `BrollGenerateControl` visibility |
| Hidden when ineligible / in-flight | Preview `blockedReasonKey` + broll job status check |
| Confirm dialog: cost, clip count, provider label | `BrollGenerateConfirmDialog` + preview DTO |
| Submit `{ reelScriptId, clientId }` only; toast + refresh; partial skips | Wire `createBrollVideoJobs`; handle success/skipped |
| EN + ES strings | `messages/en.json` · `messages/es.json` |
| [SEC] Operator-only; forbidden fields rejected | Reuse action gates + preview gate; no schema expansion on create |
