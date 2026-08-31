# US-8.8 — LTX B-roll adapter (high tier, P1)

**Status:** CLOSED (2026-08-31) — VALIDATION PASS WITH NOTES (7/7 AC; 68/68) · QA initial REJECT H1/M1 fixed `4584573` → re-verdict **APPROVE** · PO AC check-off. Phase A `5aa1392` · Phase B `4835f2d` · retry fix `4584573` · CONTRACT `7b3ff74`.

**As a** System, **I want** short B-roll clips via LTX on FAL when quality tier is high, **so that** faceless Reels can use higher-polish visuals without forcing low-tier Wan.

Ship **server-only FAL LTX `VideoProviderAdapter`** for catalog key **`ltx_broll_high`**: implement **`createLtxBrollHighAdapter`** behind **`FAL_API_KEY`**; wire in **`getProviderRegistry()`** / **`initializeProviderRegistryFromCatalog()`**; implement **`estimateCost`** from catalog **`per_clip`** (**126¢** / ~$1.26); pipe **`createJob` / `getJobStatus` / `fetchAsset`** through US-8.1 normalizers; **`videoAssetRole: broll`**; cover with **mocked-HTTP unit tests only**. **Phase B (same story):** **activate** catalog row; **extend** existing **`createBrollVideoJobs`** orchestrator to accept high-tier LTX (today hardcoded Wan-only); budget + graceful degrade unchanged. **Multi-clip stitch remains US-9.1 Phase B** — this story produces owned clips only. **FE optional preview strip deferred** (no FE AC — same as US-8.5).

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-8.8 (7/7 checked at CLOSE; stitch = US-9.1 Phase B handoff).

**This folder:** [`plan/stories/US-8.8/`](./) — `README.md` · `TASKS.md` (gates: `SECURITY.md` · `CONTRACT.md` · `VALIDATION.md` · `QA.md` — create when story enters sprint).

**Branch:** `feature/US-8.8-ltx-broll-high`

**Depends on:** [US-8.1](../US-8.1/) ✅ `VideoProviderAdapter` · registry · normalizers · [US-7.2](../US-7.2/) ✅ policy routes high + `needsBroll` → active high-tier B-roll · [US-X.4](../US-X.4/) ✅ catalog seed (inactive, 126¢ `per_clip`, `FAL_API_KEY`, `ltx-2.3-pro`) · [US-8.4](../US-8.4/) ✅ job table · poller · retry · [US-8.5](../US-8.5/) ✅ `createBrollVideoJobs` + graceful degrade + Wan adapter pattern · [US-7.1](../US-7.1/) ✅ budget. **Soft:** [US-5.1](../US-5.1/) ✅ `broll_beats` / `modalidad` · [US-9.1](../US-9.1/) Phase B ✅ (stitch consumer). **Pattern refs:** [US-8.5](../US-8.5/) Wan B-roll · [US-8.7](../US-8.7/) catalog activate migration.

**Unblocks:** High-tier faceless B-roll path · US-7.2 AC “B-roll may route to LTX when catalog row is active” · Sprint 8 provider matrix completion.

---

## Scope in

| Area | What US-8.8 BUILD adds |
|------|------------------------|
| **FE** | — (**defer** optional B-roll preview strip; no USER_STORIES FE AC). **Reviewed by FE: N/A**. |
| **BE Phase A** | **`lib/providers/video/ltx-broll-high-adapter.ts`** — real FAL LTX `VideoProviderAdapter` (`providerKey: ltx_broll_high`, `videoAssetRole: broll`); **`lib/contracts/ltx-broll-high.ts`** constants; **`estimateCost`** = catalog **`per_clip`** × clip count = **126¢**/clip; **`createJob` / `getJobStatus` / `fetchAsset`** + US-8.1 normalizers; **mocked-HTTP tests**. |
| **BE Phase B** | **Registry** — register `ltx_broll_high` when catalog row present; **extend `createBrollVideoJobs`** — remove Wan-only guard (`providerKey !== WAN_PROVIDER_KEY \|\| providerTier !== "low"`); accept **`ltx_broll_high` + `high`** from policy; provider-specific prompt/duration helpers; poller/retry parity for LTX B-roll jobs. |
| **DB Phase B** | Migration: set **`ltx_broll_high.active = true`** (seed cost_model unchanged unless CONTRACT corrects). **No** new `video_jobs` columns. |
| **Implementers** | **media-pipeline-engineer** (FAL LTX I/O) + **nextjs-backend** (`CONTRACT.md`, orchestrator extension, activate migration, tests). **Reviewed by FE: N/A**. |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **US-9.1 Phase B** multi-clip stitch | Adapter **produces** clips; assembly **consumes** them (already shipped). |
| **Optional FE B-roll preview / generate strip** | US-8.5 deferred; **no FE AC** — separate follow-up. |
| **Low-tier Wan changes** | US-8.5 ✅ — unchanged; LTX never selected on `provider_tier = low`. |
| **Operator fallback UI** | Unlike HeyGen (US-8.7), LTX is **policy-selected** when tier=`high` — no explicit operator action. |
| **HeyGen / ElevenLabs high-tier** | Other catalog rows; out of scope. |
| **New poller / job DDL** | US-8.4 ✅ — reuse. |
| **Live FAL integration tests** | Mocked HTTP only in CI. |
| **Client-supplied `provider_key` / prompt override** | Server authority only. |

## Canonical terms (CONTEXT)

Use **provider adapter**, **provider key**, **provider tier**, **asset role** (`broll`), **external job id**, **video job status**, **download-and-own**, **graceful degrade**, **needs_broll**.  
_Evitar:_ client-supplied `provider_key`; long-lived third-party `output_url` as canonical; API secrets in catalog rows or responses; blocking primary on B-roll failure; silent high-tier B-roll on low tier.

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-X.4 | Catalog row **`ltx_broll_high`**: `broll` · `high` · **`active = false`** until Phase B · **126¢** `per_clip` · **`FAL_API_KEY`** · `metadata.model: ltx-2.3-pro`. |
| US-8.5 | **`createBrollVideoJobs`** orchestrator, graceful degrade, `asset_role = broll`, reference still resolver — **extend**, do not fork. Today **rejects non-Wan** at L188–190 — Phase B removes that guard for LTX high path only. |
| US-8.7 | **Activate migration pattern** — single-row `UPDATE active = true`; no FE required for B-roll. |
| US-7.2 | Tier floor: **`provider_tier = low` never selects `ltx_broll_high`**; high + active selects cheapest active high-tier B-roll. |
| US-8.1 | **`VideoProviderAdapter`** contract — mirror Wan adapter shape. |

**US-8.8 adds the LTX adapter, activates the high-tier catalog row, and unlocks high-tier B-roll in the existing orchestrator** — not FFmpeg stitch or Operator preview UI.

---

## PO decisions frozen (2026-08-31)

1. **Phased BUILD (single story):** **Phase A** = real **`ltx_broll_high`** adapter + registry hook + estimate + create/status/fetch + mocked HTTP (catalog may stay inactive). **Phase B** = activate catalog + orchestrator unlock for high-tier LTX + registry bootstrap + policy/orchestrator tests. Full USER_STORIES AC closure requires **both phases** + VALIDATION. **Stitch stays US-9.1 Phase B** (handoff only).
2. **Never silent on low:** With **`provider_tier = low`**, policy **must not** resolve `ltx_broll_high`. Activating the row does **not** change low-tier routing (Wan remains default B-roll on low).
3. **`provider_key`:** **`ltx_broll_high`** only (US-X.4 seed — do not rename).
4. **Activate catalog row:** **Yes in Phase B** — migration sets `active = true` so **`provider_tier = high`** + `needsBroll` can select it. Until Phase B, adapter registerable for isolated tests only.
5. **Orchestrator:** **Extend `createBrollVideoJobs`** — do **not** create a parallel orchestrator. Replace Wan-only guard with allowlist `{ siliconflow_wan21_turbo + low, ltx_broll_high + high }`. Generalize prompt builder (provider-specific constants module or shared helper with provider branch).
6. **Clip duration:** Policy window **3–5s**; catalog **`clipDurationSec: 5`**. Adapter clamps requested duration to **≤ 5s** (lean: clamp, mirror Wan).
7. **Cost:** Catalog **`billingUnit: "per_clip"`**, **`unitCostCents: 126`** (~$1.26/clip). `estimateCost` = **126 × clipCount**.
8. **Env var:** **`FAL_API_KEY`** (catalog `envKeyName`). Missing → **`ProviderAdapterError`** `PROVIDER_CONFIG_MISSING` before network I/O.
9. **Graceful degrade:** Same as US-8.5 — failed B-roll **never** blocks talking-head primary.
10. **Multiple clips:** One job per beat (max **8**, align US-8.5 / `clampWanClipCount` or CONTRACT-renamed shared cap). Stitch = US-9.1 ✅ handoff.
11. **Inputs (PO lean — CONTRACT freezes):** LTX **I2V/T2V via FAL** — server-resolved **reference still** + server-authored **prompt** from beat/script (never raw client prompt as sole authority). Exact FAL model id / endpoint frozen in CONTRACT (`ltx-2.3-pro` per seed).
12. **Consent:** B-roll does **not** require avatar consent (not likeness talking-head). Budget (US-7.1) applies per clip.
13. **FE:** **Defer** preview strip. **Reviewed by FE: N/A**.
14. **Tests:** Mocked HTTP only for adapter; orchestrator tests for high-tier select, low-tier never-LTX, cost 126¢, degrade, N clips.
15. **Implementers:** **media-pipeline-engineer** + **nextjs-backend**; CONTRACT before BUILD.

### Phase A vs Phase B recommendation

| Phase | Ship | Closes which AC? |
|-------|------|------------------|
| **A** | Adapter + registry hook + estimate + create/status/fetch + mocked tests | Partial — adapter SEC floors; **not** full USER_STORIES |
| **B** | Activate catalog · orchestrator high-tier unlock · registry bootstrap · policy tests | Remaining AC (high-tier default when needs_broll, tier floor, degrade) — **required for CLOSE** |
| **Out** | US-9.1 stitch / FE preview | Handoff / deferred |

**PO recommendation:** Execute **Phase A then Phase B in this story** (Wan + HeyGen activate pattern). Do **not** merge to main until B + VALIDATION (high-tier routing AC requires active row + orchestrator).

---

## Gates (orchestrator)

- [x] SPEC-REVIEW.md (spec-guardian — cross-cutting vs SPEC §3 S3.M9 Video Provider / B-roll)
- [x] SECURITY.md (security-architect — FAL SSRF, key redaction, tier floor)
- [x] CONTRACT.md (nextjs-backend — freeze FAL endpoints/schemas; **Reviewed by FE: N/A**)
- [x] BUILD Phase A (media-pipeline-engineer + nextjs-backend) — `5aa1392`
- [x] BUILD Phase B (BE orchestrator extension + DB activate) — `4835f2d`
- [x] VALIDATION.md (requirements-validator) — PASS WITH NOTES (7/7 AC)
- [x] QA.md (qa-engineer) — initial REJECT → fix `4584573` → re-verdict APPROVE
- [x] CLOSE — 7/7 AC checked in USER_STORIES.md (product-owner)

**Status:** CLOSED. **Next:** FF-merge `feature/US-8.8-ltx-broll-high` to main; SELECT B-roll Operator generate UI, PLAN F7 cron, or QA follow-ups.

---

## Acceptance criteria mapping

| USER_STORIES § US-8.8 AC | Deliverable | Phase |
|-------------------------|-------------|-------|
| Never silent default when `provider_tier = low` | Tier floor + tests; Wan on low unchanged | A (policy) + B (orchestrator never forces LTX on low) |
| Default B-roll when `provider_tier = high` + `needs_broll` | Activate row + orchestrator accepts LTX high | B |
| Clips max 3–5s; LTX 5s cap | Adapter/orchestrator clamp + catalog metadata | A (+ B create) |
| Estimated cost ~$1.26/clip | Catalog `per_clip` **126¢** + `estimateCost` | A |
| Failed B-roll does not block primary | Reuse US-8.5 degrade (orchestrator unchanged semantics) | B (verify LTX path) |
| Multiple clips may be stitched (US-9.1) | N `broll` jobs produced; stitch handoff | B (produce) / US-9.1 ✅ (stitch) |
| [SEC] US-8.1 contract, server-only keys, budget | Adapter SEC + orchestrator budget | A + B |
