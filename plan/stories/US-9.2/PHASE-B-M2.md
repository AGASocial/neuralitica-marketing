# US-9.2 Phase B-M2 — Branding poll claim race

**Story ID:** **US-9.2** (same story — **not** a new `US-9.x` ID). Sprint label: **`US-9.2-B-M2`**.  
**Status:** **PREP** (2026-08-31)  
**Branch:** `feature/US-9.2-b-m2-branding-poll-claim`  
**Source:** [`QA.md`](./QA.md) Finding **Medium #1** · [`QA-PHASE-B.md`](./QA-PHASE-B.md) Finding **Medium #2** (Phase A carry-forward)

**As a** System, **I want** the branding worker to atomically claim a `queued` job before FFmpeg, **so that** concurrent Fly replicas or dev in-process overlap cannot duplicate branding spend or orphan `branded-*` / `cover-*` assets.

---

## Requirement summary

Live code diverges from frozen CONTRACT § Poll runtime:

| File | Gap |
|------|-----|
| `lib/branding/poll-branding-jobs.ts:25–31` | Plain Supabase `SELECT id` — no `FOR UPDATE SKIP LOCKED`; includes `processing` in candidate set |
| `lib/branding/apply-branding-job-update.ts:120–153` | Conditional `.eq("branding_status", currentStatus)` but **does not** inspect rows affected; always returns `idempotent: false` on no error |
| `lib/branding/run-branding-job.ts:95–106` | Calls claim then **always** proceeds to download / FFmpeg even when claim lost |

US-9.1 assembly poll (`lib/assembly/poll-assembly-jobs.ts`, `apply-assembly-job-update.ts`, `run-assembly-job.ts:106–112`) has the **same class of bug** — M2 fixes **branding only**; assembly claim is a separate backlog item.

Canonical AC remain [`plan/USER_STORIES.md`](../../USER_STORIES.md) § US-9.2 — **do not** add or uncheck AC.

---

## Scope in

| Area | M2 adds |
|------|---------|
| **Worker / BE** | Atomic `queued` → `processing` claim via conditional `UPDATE … RETURNING`; zero rows → `idempotent: true` |
| **Worker** | `runBrandingJob` — if claim lost or row already `processing` at entry → **return before** `mkdtemp` / download / FFmpeg |
| **Poll** | Narrow batch candidate set to **`branding_status = 'queued'`** only (stale sweeper owns stuck `processing`) |
| **Tests** | Unit test: simulated lost claim → **zero** FFmpeg spawn; optional concurrent-claim test |
| **CONTRACT** | Amend § Poll runtime + `runBrandingJob` step 1 (atomic claim, idempotent skip) — **nextjs-backend** |
| **SECURITY** | Lean amend: worker claim AC (mirror US-9.1 `[SEC] Worker job claim` for branding) — **security-architect** |
| **Implementers** | **media-pipeline-engineer** (poll + runner) + **nextjs-backend** (applier + CONTRACT + tests). **FE: none.** |
| **DB** | **None** — claim via conditional UPDATE on existing row (RPC optional if implementer prefers; not required in PREP) |

## Scope out

| Topic | Why |
|-------|-----|
| US-9.1 assembly poll claim | Same pattern — separate story / sprint |
| `FOR UPDATE SKIP LOCKED` in poll SELECT | Supabase JS client has no first-class SKIP LOCKED; **per-job atomic UPDATE** is the correctness gate (M2-3). Optional raw-SQL batch claim is implementer choice, not PO requirement |
| Mid-`processing` auto-resume | Stale sweeper → `failed` → Operator re-brand; avoids double FFmpeg without lease columns |
| Second font · thumbnail strip · Cliente cover UI | Further defer |
| New USER_STORIES AC / unchecking Phase A/B AC | Out |
| Hash formula / fingerprint / VO-timing guards | Closed M1 — untouched |

---

## PO decisions frozen (2026-08-31) — Phase B-M2

| # | Topic | Decision |
|---|-------|----------|
| **M2-1** | **Story identity** | **Fast-follow of US-9.2** — sprint `US-9.2-B-M2`. Not a new backlog ID. Closes QA Phase A Finding 1 + QA-PHASE-B Medium #2. |
| **M2-2** | **Claim mechanism** | **Conditional UPDATE** on `neuramark_assembled_reels`: `SET branding_status = 'processing', updated_at = now(), pre_branding_output_media_asset_id = …` **WHERE** `id = $1 AND status = 'completed' AND branding_status = 'queued'`. Use `.select('id')` / `RETURNING` — **zero rows** ⇒ lost race. |
| **M2-3** | **Applier contract** | `applyBrandingJobUpdate` for `processing` claim: when UPDATE matches **0 rows**, return `{ ok: true, idempotent: true, brandingStatus: <current or null> }` — **do not throw**. Terminal / illegal transitions keep existing idempotent behavior. |
| **M2-4** | **Runner gate** | `runBrandingJob`: after claim attempt, if `idempotent === true` → **return immediately** (no temp dir, no Storage download, no spawn). If initial load shows `branding_status === 'processing'` **before** claim (another worker owns row) → **return** (no resume-from-poll). |
| **M2-5** | **Poll batch** | `pollQueuedBrandingJobsBatch` selects **`branding_status = 'queued'`** only (drop `processing` from `.in(...)`). Stale `processing` → `markStaleBrandingJobsFailed` → Operator re-brand. |
| **M2-6** | **Dev in-process overlap** | `enqueueBrandingJob` fire-and-forget + Fly poll on same row: atomic claim ensures **one** FFmpeg winner; loser exits silently (log at debug/info optional). |
| **M2-7** | **pre_branding snapshot** | Keep existing M2-2 side effect: on successful claim, copy `output_media_asset_id` → `pre_branding_output_media_asset_id` when not yet set (today's `applyBrandingJobUpdate` behavior). |
| **M2-8** | **SEC posture** | No new client authority; no new endpoints; claim is worker-only. Integrity / spend control — not IDOR. |
| **M2-9** | **FE** | **None** — Operator panel unchanged; failed-from-stale path already surfaced. |
| **M2-10** | **SPEC** | **No SPEC drift** — hardening of CONTRACT § Poll runtime already frozen. Skip full SPEC-REVIEW (mirror M1-10). |
| **M2-11** | **US-9.1 mirror** | Reuse **intent** from US-9.1 CONTRACT § Poll runtime (`UPDATE … WHERE status='queued' RETURNING *`; skip on zero rows). **Do not** bundle US-9.1 assembly code changes in this branch. |

---

## Task breakdown (summary)

See [`TASKS.md`](./TASKS.md) § Phase B-M2 checklist.

| Layer | Work |
|-------|------|
| **BE / worker** | `applyBrandingJobUpdate` — rows-affected / RETURNING check; `idempotent: true` on lost claim |
| **Worker** | `runBrandingJob` — early return on lost claim or peer `processing` |
| **Worker** | `poll-branding-jobs.ts` — `queued`-only candidate set |
| **BE / tests** | Lost-claim unit test → no FFmpeg spawn |
| **CONTRACT** | Amend § Poll runtime + `runBrandingJob` step 1 |
| **SECURITY** | Lean amend — branding worker claim AC |
| **FE / DB** | None |

---

## Dependencies and sequence

1. **US-9.2 Phase A/B** ✅ · **B-M1** ✅  
2. **This PREP** → **SECURITY lean amend** → **CONTRACT amend** (claim semantics + poll predicate) → **BUILD** → **VALIDATION** (lean) → **QA** (lean) → CLOSE M2  

**CONTRACT amendment required** — nextjs-backend authors; PO does not rewrite `CONTRACT.md` in PREP.

---

## VALIDATION note (binding)

- Do **not** check or uncheck USER_STORIES § US-9.2 AC.
- Validate: simulated concurrent / lost claim → **zero** FFmpeg invocations; winner still completes happy path.
- Re-confirm: stale sweeper still fails stuck `processing`; queued-only poll does not starve legitimate work.
- Record M2 closure of QA Phase A Finding 1 + QA-PHASE-B Medium #2 only.

---

## Gates (Phase B-M2)

- [x] PREP — this file + TASKS Phase B-M2 checklist + README note
- [ ] SECURITY.md lean amend (security-architect — worker claim AC)
- [ ] CONTRACT.md amend (nextjs-backend — atomic claim + poll `queued`-only; FE Reviewed N/A)
- [ ] BUILD (media-pipeline-engineer ∥ nextjs-backend)
- [ ] VALIDATION lean (requirements-validator)
- [ ] QA lean (qa-engineer) — Medium #2 CLOSED
- [ ] PO CLOSE M2

---

## Open questions

None — QA fix direction + M1 parallel are binding. Implementer may choose Supabase `.update().select()` vs SQL RPC; PO requires M2-2…M2-5 behavior, not a specific module name.
