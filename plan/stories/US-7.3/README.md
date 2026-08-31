# US-7.3 — Track actual cost per generation job

**Status:** Phase A **CLOSED** (2026-08-29). **Phase B PREP** (2026-08-31) — sprint **`US-7.3-B`**. Freeze: [`PHASE-B.md`](./PHASE-B.md).

**As an** Operator, **I want** real API cost recorded per Reel, **so that** we learn true unit economics.

**Phase A (CLOSED):** server-side actual-cost persistence on the spend ledger for **LLM** jobs + Operator **`/operator/scripts`** estimated vs actual (slot + weekly sum). VALIDATION PASS WITH NOTES (4/4 AC Phase A); QA APPROVE WITH NOTES after H1 fix `f60579d`. BE `030d85f` · FE `02b399b`/`ddca524` · fix `f60579d`.

**Phase B (this sprint):** video / TTS / B-roll **actual backfill** on the same ledger; job-level cost on the **existing** Operator video panel (not a new `/operator/production` route). Upstream US-8.x / US-9.3 / US-7.4 Phase A **CLOSED**. **CONTRACT Phase B amendment required** — do not rewrite Phase A CONTRACT.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-7.3 (Phase A **checked** — do **not** uncheck; Phase B adds **no** new checkboxes).

**This folder:** [`plan/stories/US-7.3/`](./) — `README.md` · `TASKS.md` · [`PHASE-B.md`](./PHASE-B.md) · `SPEC-REVIEW.md` · `SECURITY.md` · `CONTRACT.md` · `VALIDATION.md` · `QA.md`.

**Branch:** `feature/US-7.3-phase-b-spend-backfill` (Phase A historical: `feature/US-7.3-actual-cost`)

**Depends on:** [US-7.2](../US-7.2/) ✅ · [US-7.1](../US-7.1/) ✅ · [US-5.1](../US-5.1/) ✅ · [US-14.5](../US-14.5/) ✅ · [US-8.4](../../USER_STORIES.md) ✅ · [US-8.2](../../USER_STORIES.md) / [US-8.6](../../USER_STORIES.md) / [US-8.7](../../USER_STORIES.md) ✅ · [US-8.5](../US-8.5/) ✅ · [US-8.3](../../USER_STORIES.md) ✅ · [US-9.3](../../USER_STORIES.md) ✅ · [US-7.4](../US-7.4/) Phase A ✅ (consumer — **do not reopen BUILD**).

**Unblocks:** full per-Reel economics on existing US-7.4 roll-up (automatic component lines).

**Implementers (Phase B):** **media-pipeline-engineer** + **nextjs-backend** + thin **nextjs-frontend**.

---

## Scope in (Phase A — historical)

See original tables below this file’s Phase A section in git history, or [`CONTRACT.md`](./CONTRACT.md). Phase A: LLM sync actuals + `/operator/scripts` cost column/footer.

## Scope in (Phase B)

See [`PHASE-B.md`](./PHASE-B.md) — duration on video `async_update`, TTS trusted `duration_sec`, Operator poll cost refresh, tests. **No new route. No new tables.**

## Scope out (Phase B)

`/operator/production` · B-roll clip strip · TTS panel chip · migrate TTS to `finalizeGenerationCost` · fail-row actuals · `ltx_broll_high` · assembly/branding spend · US-7.4 query rewrite · budget gate on actuals · Cliente cost · new USER_STORIES AC.

## Canonical terms (CONTEXT)

Use **Operator**, **Reel**, **Paquete de guion**, **coste real**, **coste estimado**, **evento de gasto**.  
_Evitar:_ exposing raw provider pricing or budget caps to Cliente; client-editable cost fields.

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-7.3 Phase A | `finalizeGenerationCost`, weekly/slot cost on `/operator/scripts`, forbidden keys |
| US-8.4 | Poller already calls `async_update` on complete; `OperatorVideoJobSummaryPanel` already renders `job.cost` |
| US-8.2/8.6/8.7/8.5 | Create-path estimate-only `recordReelSpendEvent` + `spend_event_id` |
| US-8.3 | Manual `finalizeGenerationCost` actual 0 |
| US-9.3 | TTS `recordReelSpendEvent` with actual at success |
| US-7.4 Phase A | Roll-up by `asset_role` — auto-picks new rows |

---

## PO decisions frozen

- **Phase A (2026-08-29):** see historical list in this README (LLM-first, spend ledger canonical, Operator `/operator/scripts`, estimate-only gate).
- **Phase B (2026-08-31):** [`PHASE-B.md`](./PHASE-B.md) **B1–B18**.

---

## Gates (orchestrator)

### Phase A — CLOSED 2026-08-29
- [x] SPEC-REVIEW.md · SECURITY.md · CONTRACT.md · BUILD · VALIDATION.md · QA.md

### Phase B — PREP
- [x] PREP — [`PHASE-B.md`](./PHASE-B.md) + TASKS Phase B checklist
- [ ] SPEC-REVIEW.md amendment
- [ ] SECURITY.md amendment
- [ ] CONTRACT.md Phase B + Reviewed by FE
- [ ] BUILD (media-pipeline-engineer ∥ nextjs-backend ∥ thin nextjs-frontend)
- [ ] VALIDATION Phase B
- [ ] QA Phase B

**Next:** spec-guardian **SPEC-REVIEW** (Phase B).
