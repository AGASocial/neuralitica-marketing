# US-9.1 Phase B-M2 — Assembly poll claim race

**Story ID:** **US-9.1** (same story — **not** a new `US-9.x` ID). Sprint label: **`US-9.1-B-M2`**.  
**Status:** **PREP** (2026-08-31)  
**Branch:** `feature/US-9.1-b-m2-assembly-poll-claim`  
**Source:** [`QA.md`](./QA.md) Finding **Medium #1** · [`QA-PHASE-B.md`](./QA-PHASE-B.md) Finding **Medium #1** (Phase A carry-forward)

**As a** System, **I want** the assembly worker to atomically claim a `queued` job before FFmpeg, **so that** concurrent Fly replicas or dev in-process overlap cannot duplicate assembly spend or orphan `assembled_reel` assets.

---

## Requirement summary

Live code diverges from frozen CONTRACT § Poll runtime:

| File | Gap |
|------|-----|
| `lib/assembly/poll-assembly-jobs.ts:25–30` | Plain Supabase `SELECT id WHERE status = 'queued'` — no atomic claim before `runAssemblyJob` |
| `lib/assembly/apply-assembly-job-update.ts:106–110` | Conditional `.in("status", ["queued", "processing"])` but **does not** inspect rows affected / RETURNING; always returns `idempotent: false` on no error |
| `lib/assembly/run-assembly-job.ts:106–112` | Calls claim then **always** proceeds to fingerprint check / download / FFmpeg even when claim lost |

US-9.2 branding poll (`lib/branding/poll-branding-jobs.ts`, `apply-branding-job-update.ts`, `run-branding-job.ts`) had the **same class of bug** — **US-9.2-B-M2 CLOSED** (`29352f4`) fixes branding; **this sprint fixes assembly only**.

Canonical AC remain [`plan/USER_STORIES.md`](../../USER_STORIES.md) § US-9.1 — **do not** add or uncheck AC.

---

## Scope in

| Area | M2 adds |
|------|---------|
| **Worker / BE** | Atomic `queued` → `processing` claim via conditional `UPDATE … RETURNING`; zero rows → `idempotent: true` |
| **Worker** | `runAssemblyJob` — if claim lost or row already `processing` at entry → **return before** `mkdtemp` / download / FFmpeg |
| **Poll** | Keep batch candidate set **`status = 'queued'`** only — **do not** poll `processing` (CONTRACT diagram currently says `IN ('queued','processing')`; amend to `queued`-only; stale sweeper owns stuck `processing`) |
| **Tests** | Unit test: simulated lost claim → **zero** FFmpeg spawn; optional concurrent-claim test |
| **CONTRACT** | Amend § Poll runtime + `runAssemblyJob` step 1 (atomic claim, idempotent skip, `queued`-only poll predicate) — **nextjs-backend** |
| **SECURITY** | Lean amend: close `[SEC] Worker job claim` AC (mirror US-9.2-B-M2 branding claim pattern for **`status`**) — **security-architect** |
| **Implementers** | **media-pipeline-engineer** (poll + runner) + **nextjs-backend** (applier + CONTRACT + tests). **FE: none.** |
| **DB** | **None** — claim via conditional UPDATE on existing row (RPC optional if implementer prefers; not required in PREP) |

## Scope out

| Topic | Why |
|-------|-----|
| US-9.2 branding poll claim | **CLOSED** US-9.2-B-M2 — separate branch; do not bundle branding changes here |
| `FOR UPDATE SKIP LOCKED` in poll SELECT | Supabase JS client has no first-class SKIP LOCKED; **per-job atomic UPDATE** is the correctness gate (M2-3). Optional raw-SQL batch claim is implementer choice, not PO requirement |
| Mid-`processing` auto-resume | Stale sweeper → `failed` → Operator re-assemble; avoids double FFmpeg without lease columns |
| Enqueue-time audio probe (QA Phase A Medium #2) | Separate follow-up — not M2 |
| Readiness companion on jobs SELECT error (QA-PHASE-B Medium #2) | Separate follow-up — not M2 |
| New USER_STORIES AC / unchecking Phase A/B AC | Out |
| Faceless stitch / fingerprint / broll concat | Closed Phase B — untouched |

---

## PO decisions frozen (2026-08-31) — Phase B-M2

| # | Topic | Decision |
|---|-------|----------|
| **M2-1** | **Story identity** | **Fast-follow of US-9.1** — sprint `US-9.1-B-M2`. Not a new backlog ID. Closes QA Phase A Finding 1 + QA-PHASE-B Medium #1. |
| **M2-2** | **Claim mechanism** | **Conditional UPDATE** on `neuramark_assembled_reels`: `SET status = 'processing', updated_at = now()` **WHERE** `id = $1 AND status = 'queued'`. Use `.select('id')` / `RETURNING` — **zero rows** ⇒ lost race. |
| **M2-3** | **Applier contract** | `applyAssemblyJobUpdate` for `processing` claim: when UPDATE matches **0 rows**, return `{ ok: true, idempotent: true, status: <current or queued> }` — **do not throw**. Terminal / illegal transitions keep existing idempotent behavior. Non-claim transitions (completed/failed) keep existing `.in("status", ["queued", "processing"])` or equivalent. |
| **M2-4** | **Runner gate** | `runAssemblyJob`: after claim attempt, if `idempotent === true` → **return immediately** (no temp dir, no Storage download, no spawn). If initial load shows `status === 'processing'` **before** claim (another worker owns row) → **return** (no resume-from-poll). |
| **M2-5** | **Poll batch** | `pollQueuedAssemblyJobsBatch` selects **`status = 'queued'`** only — **do not** add `processing` to poll SELECT (already true in code; CONTRACT amend must match). Stale `processing` → `markStaleAssemblyJobsFailed` → Operator re-assemble. |
| **M2-6** | **Dev in-process overlap** | `enqueueAssemblyJob` fire-and-forget + Fly poll on same row: atomic claim ensures **one** FFmpeg winner; loser exits silently (log at debug/info optional). |
| **M2-7** | **Auto-chain hook** | `onAssemblyJobCompleted` fires only on **successful** `completed` transition — unchanged; lost claim must **not** trigger branding auto-chain. |
| **M2-8** | **SEC posture** | No new client authority; no new endpoints; claim is worker-only. Integrity / spend control — not IDOR. |
| **M2-9** | **FE** | **None** — Operator panel unchanged; failed-from-stale path already surfaced. |
| **M2-10** | **SPEC** | **No SPEC drift** — hardening of CONTRACT § Poll runtime already frozen. Skip full SPEC-REVIEW (mirror US-9.2-B-M2 M2-10). |
| **M2-11** | **US-9.2 mirror** | Reuse **implementation intent** from **CLOSED** US-9.2-B-M2 (`applyBrandingJobUpdate` processing path, `runBrandingJob` early exit, `queued`-only poll). **Do not** bundle US-9.2 branding code changes in this branch. |

---

## Task breakdown (summary)

See [`TASKS.md`](./TASKS.md) § Phase B-M2 checklist.

| Layer | Work |
|-------|------|
| **BE / worker** | `applyAssemblyJobUpdate` — rows-affected / RETURNING check; `idempotent: true` on lost claim |
| **Worker** | `runAssemblyJob` — early return on lost claim or peer `processing` |
| **Worker** | `poll-assembly-jobs.ts` — confirm `queued`-only candidate set (no `processing`) |
| **BE / tests** | Lost-claim unit test → no FFmpeg spawn |
| **CONTRACT** | Amend § Poll runtime + `runAssemblyJob` step 1 |
| **SECURITY** | Lean amend — `[SEC] Worker job claim` AC |
| **FE / DB** | None |

---

## Dependencies and sequence

1. **US-9.1 Phase A/B** ✅ · **US-9.2-B-M2** ✅ (mirror pattern)  
2. **This PREP** → **SECURITY lean amend** → **CONTRACT amend** (claim semantics + poll predicate) → **BUILD** → **VALIDATION** (lean) → **QA** (lean) → CLOSE M2  

**CONTRACT amendment required** — nextjs-backend authors; PO does not rewrite `CONTRACT.md` in PREP.

---

## VALIDATION note (binding)

- Do **not** check or uncheck USER_STORIES § US-9.1 AC.
- Validate: simulated concurrent / lost claim → **zero** FFmpeg invocations; winner still completes happy path (primary + faceless stitch).
- Re-confirm: stale sweeper still fails stuck `processing`; queued-only poll does not starve legitimate work.
- Record M2 closure of QA Phase A Finding 1 + QA-PHASE-B Medium #1 only.

---

## Gates (Phase B-M2)

- [x] PREP — this file + TASKS Phase B-M2 checklist + README note
- [ ] SECURITY.md lean amend (security-architect — worker claim AC)
- [ ] CONTRACT.md amend (nextjs-backend — atomic claim + poll `queued`-only; FE Reviewed N/A)
- [ ] BUILD (media-pipeline-engineer ∥ nextjs-backend)
- [ ] VALIDATION lean (requirements-validator)
- [ ] QA lean (qa-engineer) — close QA Phase A Medium #1 + QA-PHASE-B Medium #1
- [ ] PO CLOSE M2 — README / TASKS gates (USER_STORIES AC unchanged)

**Status:** **PREP** — next gate SECURITY lean amend.

---

## Open questions

None — QA fix direction + US-9.2-B-M2 closed implementation are binding. Implementer may choose Supabase `.update().select()` vs SQL RPC; PO requires M2-2…M2-5 behavior, not a specific module name.
