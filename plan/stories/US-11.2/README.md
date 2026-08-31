# US-11.2 — Request controlled revision round

**Status:** CLOSED Phase A (2026-08-30) — VALIDATION PASS WITH NOTES `e4f12fb` (105/105) · QA APPROVE WITH CONDITIONS `84902c8` (0 Critical/High) · 5/5 AC. Operator grant UI + change history → Phase B; ready/download → US-11.3.

**As a** Client, **I want** to request specific changes (not unlimited loops), **so that** I can correct content without scope creep.

Ship **Cliente revision round V1 (Phase A = full US-11.2 BUILD)**: extend Cliente **Aprobación** on `/approvals/[approvalId]` with a **Request changes** flow — tagged areas (`script` / `caption` / `assembly` / `branding`), length-capped notes, **one client revision round per Reel** (configurable server constant), atomic server enforcement, prompt-injection containment when feedback enters agent jobs, and **minimal downstream re-run routing** (only affected pipeline steps). When the round limit is exceeded, the Cliente sees an operator-escalation message; Operators may grant one extra round or complete fixes and requeue manually.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-11.2 (do **not** check off in PREP).

**This folder:** [`plan/stories/US-11.2/`](./) — `README.md` · `TASKS.md`. Next gates: `SPEC-REVIEW.md` · `SECURITY.md` · `CONTRACT.md`.

**Branch:** `feature/US-11.2-revision-round`

**Depends on:** [US-11.1](../US-11.1/) ✅ approve/reject + `neuramark_approvals` + gate re-check + `/approvals` UI · Soft upstream: [US-5.1](../US-5.1/) script regen · [US-6.1](../US-6.1/) caption regen · [US-9.1](../US-9.1/) assembly · [US-9.2](../US-9.2/) branding · [US-10.1](../US-10.1/) QA · [US-4.1](../US-4.1/) prompt-injection pattern.

**Upstream contracts:** [US-11.1 CONTRACT](../US-11.1/CONTRACT.md) · [US-11.1 README](../US-11.1/README.md) (Phase A deferrals) · `lib/contracts/approval.ts` · `lib/approvals/decide-approval.ts`.

**Unblocks:** [US-11.3](../../USER_STORIES.md) ready-to-publish polish (full state machine including `changes_requested` loop) · SPEC SC-3 first-lot revision within 7 days.

---

## Scope in

| Area | What US-11.2 BUILD adds |
|------|-------------------------|
| **FE (Cliente)** | **Request changes** CTA on approval detail when `status = pending_client` and revisions remain; form with **≥1 tag** checkboxes (`script`, `caption`, `assembly`, `branding`); per-tag optional notes + optional overall summary; **revisions remaining** indicator (e.g. “1 revision left” / “0 — contact your team”); disabled/limit-exceeded state + operator-escalation copy; EN/ES `approvals.revision.*`. |
| **BE** | Extend **`decideApproval`** with `decision: "request_changes"` + structured **`changeRequest`** payload; atomic **`revision_count`** increment + limit check; persist append-only **`change_requests`** JSONB; **`routeApprovalChangeRequest`** orchestrator (minimal tag → job routing); **`requeueApprovalAfterRevision`** when routed work completes; gate re-check on submit (same as approve/reject); **[SEC]** prompt-injection containment for notes in script/caption agent prompts (US-4.1 delimiters). |
| **DB** | Migration: `neuramark_approvals.revision_count` INT NOT NULL DEFAULT 0; `change_requests` JSONB NOT NULL DEFAULT `'[]'`; optional `extra_revision_granted` BOOLEAN NOT NULL DEFAULT false (operator one-shot override). |
| **content-agents-engineer** | Pass Cliente change notes into script/caption regenerate prompts as **delimited untrusted data**; no Cliente-triggered agent calls. |
| **media-pipeline-engineer** | Wire assembly/branding re-run enqueue from revision router; completion hook → requeue approval when QA gate ready (or caption-only fast path). |
| **Operator (minimal V1)** | Server Action **`operatorGrantExtraRevision`** (+ optional FE stub on operator scripts detail deferred — SQL/action sufficient for V1). |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **US-11.3** ready-to-publish list, download/export UX, approve confirmation polish | Separate story — approve/reject unchanged from US-11.1. |
| **Unlimited revision loops** | SPEC hard rule: max 1 ronda V1; configurable constant only. |
| **Cliente direct regen buttons** | Cliente requests; system routes — no Cliente calls to script/caption/assembly actions. |
| **New revision round after `rejected`** | Reject semantics unchanged; regen-new-piece prompt remains soft follow-up. |
| **Decided-history list on `/approvals`** | Still pending-only list; `changes_requested` rows leave Cliente queue until requeued. |
| **RBAC beyond `requireActive` / `requireOperator`** | Unchanged. |
| **Weekly cron / Instagram publish** | integrations-engineer / US-12.x. |
| **Full operator revision dashboard** | V1: grant-extra-revision action + existing `/operator/scripts` job surfaces. |

## Canonical terms (CONTEXT)

Use **Aprobación**, **Cliente**, **Operator**, **Ensamblado**, **Paquete**, **pedir cambios**, **ronda de revisión**, **caption de Instagram**, **Veredicto QA**.  
_Evitar:_ “change request ticket”; admin/staff; exposing pipeline job controls as Cliente capabilities.

## What US-11.1 already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-11.1 | `neuramark_approvals` DDL; `decideApproval` approve/reject; gate re-check; `/approvals` list + detail; `ApprovalPackageView` Approve/Reject; `approvalDecisionSchema` = `approved` \| `rejected` only; status enum includes reserved `changes_requested`. |
| US-11.1 SECURITY | Revision limit must be atomic; change text = untrusted prompt fuel; extend decide surface preferred over parallel smuggle path. |
| `lib/contracts/approval.ts` | Forbidden keys already block `revision_count`, `change_requests`, body `status`. |

**US-11.2 adds request-changes decision path, revision accounting, tagged routing, and requeue loop** — not ready-to-publish UX.

---

## Phased BUILD (PO)

| Phase | Scope | Closes |
|-------|-------|--------|
| **A (US-11.2 BUILD — ship all in this story)** | DDL columns · extend `decideApproval` · change-request form FE · atomic revision limit · tagged downstream router · agent/pipeline re-run wiring · auto/manual requeue → `pending_client` · operator grant-extra-revision · [SEC] length cap + delimited prompt injection · EN/ES | USER_STORIES § US-11.2 AC (all five) |
| **B (deferred — not US-11.2)** | Operator UI polish for revision queue · revision history on Cliente detail · env-admin UI for `APPROVAL_MAX_CLIENT_REVISION_ROUNDS` | Backlog / P1 |

**VALIDATION note (binding):** Phase A closes full US-11.2 AC. US-11.1 Phase A deferral of request-changes is satisfied here. Do not require US-11.3 download/ready queue for CLOSE.

---

## Upstream / downstream handoffs

| Direction | Artifact | Rule |
|-----------|----------|------|
| **From US-11.1** | `decideApproval`, `neuramark_approvals`, package DTO, gate re-check | Extend — do not fork second Cliente mutation for same row |
| **From US-11.1** | `client_feedback` column | Reuse for optional **overall summary** on request-changes (reject notes unchanged) |
| **From US-4.1** | Delimited untrusted blocks + Zod before persist | Same pattern for change notes in LLM prompts |
| **From US-5.1 / US-6.1** | `regenerateReelScriptSlot`, `regenerateReelCaption` | Router invokes server-only with **`revisionContext`** (approval id + delimited notes) — not Cliente |
| **From US-9.1 / US-9.2** | Assembly + branding enqueue | Router invokes on `assembly` / `branding` tags |
| **From US-10.1** | QA gate helper | Re-run QA when media path touched; caption-only may skip QA re-run (CONTRACT freezes) |
| **To US-11.3** | Stable loop: `pending_client` ↔ `changes_requested` → `approved` | Publish queue consumes `approved` only |
| **To Operator** | `changes_requested` + job panel | Monitor/fix; `operatorGrantExtraRevision` when limit hit |

---

## PO decisions frozen (2026-08-30)

| # | Topic | Decision |
|---|-------|----------|
| 1 | **`decideApproval` vs new action** | **Extend `decideApproval`** — add third decision value **`request_changes`** (verb) that writes status **`changes_requested`**. Same action surface: auth, rate limit (`approval_decide`), forbidden-key scan, gate re-check. Required companion field **`changeRequest`** (`.strict()`) when `decision === "request_changes"`. **No** separate `requestApprovalChanges` Server Action in V1. |
| 2 | **Taggable fields (V1)** | Four tags matching pipeline slices: **`script`**, **`caption`**, **`assembly`**, **`branding`**. Client must select **≥1**. Stored in `change_requests[].tags`. |
| 3 | **Change-request payload shape** | `changeRequest`: `{ tags: ApprovalChangeTag[], notesByTag?: Partial<Record<ApprovalChangeTag, string>>, summary?: string }`. Per-tag note + summary each **trim, 0–500** (empty → omit). Persist **append-only** round object in `change_requests` JSONB array. |
| 4 | **Downstream routing (minimal V1)** | Server-only **`routeApprovalChangeRequest`** after successful write. **Expansion rules:** `script` → full chain (script regen → video job if applicable → TTS → assembly → branding → QA re-run). `assembly` → assembly → branding → QA. `branding` → branding → QA. `caption` → caption regen only. **Union:** take **maximal** path when multiple tags (e.g. `script`+`caption` = script path). **Never** enqueue steps not implied by expansion. |
| 5 | **`revision_count` / max** | Column **`revision_count`** INT NOT NULL DEFAULT **0**. Server constant **`APPROVAL_MAX_CLIENT_REVISION_ROUNDS = 1`** (env override allowed for staging — CONTRACT names var). Count = **completed client revision rounds** (increment on successful `request_changes`). |
| 6 | **Atomic limit enforcement** | Single transaction: `UPDATE neuramark_approvals SET status='changes_requested', revision_count=revision_count+1, change_requests=…, client_feedback=…, decided_at=now(), decided_by=$session WHERE id=$id AND client_id=$session AND status='pending_client' AND (revision_count < $max OR extra_revision_granted = true) RETURNING *`. On 0 rows → **`REVISION_LIMIT_EXCEEDED`** or **`INVALID_TRANSITION`**. On success with `extra_revision_granted` → set **`extra_revision_granted = false`**. |
| 7 | **Operator override when exceeded** | Operator-only **`operatorGrantExtraRevision({ approvalId, reason })`**: `requireOperator`, tenancy scoped, sets **`extra_revision_granted = true`**, appends operator reason to audit JSON (CONTRACT shape). Client may submit **one** more `request_changes` while `pending_client` after requeue. No Cliente UI to self-serve extra rounds. |
| 8 | **Status transitions (V1)** | **Allowed writes:** `pending_client` → `request_changes` → **`changes_requested`**; **`changes_requested` → `pending_client`** (system/operator requeue only — not Cliente); `pending_client` → `approved` \| `rejected` (US-11.1 unchanged). **Forbidden:** Cliente decide from `changes_requested`; `approved`/`rejected` → anything; double `request_changes` without requeue. |
| 9 | **Requeue to Cliente** | **`requeueApprovalAfterRevision`**: when routed jobs complete (and QA ready if media path), set **`status = pending_client`**, clear **`decided_at` / `decided_by`**, refresh package via ensure. Caption-only path requeues when caption job completes (no QA re-run). |
| 10 | **Gate on request-changes** | Same as approve/reject: **`getQaGateStatusForAssembledReel` → ready** required **before** accepting `request_changes` (Cliente is reviewing a gated package). |
| 11 | **Prompt injection** | All Cliente notes wrapped in **`<UNTRUSTED_CLIENT_CHANGE_REQUEST>…</UNTRUSTED_CLIENT_CHANGE_REQUEST>`** (or CONTRACT alias) in script/caption agent prompts; system instructions outside; validate JSON/schema before job enqueue; never execute notes as instructions. |
| 12 | **List UX** | `/approvals` list remains **`pending_client` only**. After request-changes, item disappears until requeue. Detail readable if deep-linked while `changes_requested` (read-only waiting state). |
| 13 | **Revisions remaining FE** | Display **`max(0, APPROVAL_MAX_CLIENT_REVISION_ROUNDS - revision_count)`** when `pending_client`; when 0 and not `extra_revision_granted`, hide Request changes and show escalation copy. |
| 14 | **Implementers** | **nextjs-backend** (decide extend, migration, router, requeue) + **nextjs-frontend** (form) + **content-agents-engineer** (prompt context) + **media-pipeline-engineer** (assembly/branding/QA chain). |
| 15 | **Rate limit** | Reuse **`approval_decide`** bucket for `request_changes` (same abuse surface as approve/reject). |

---

## Gates (orchestrator)

- [x] PREP — README + TASKS + PO freezes
- [x] SPEC-REVIEW.md (spec-guardian) — ALIGNED `ffe58e5`
- [x] SECURITY.md (security-architect) — APPROVE WITH CONDITIONS `28f93e6`
- [x] CONTRACT.md (nextjs-backend) — Frozen `38d4a1d`; Reviewed by FE: **yes** `237bdea`
- [x] BUILD (nextjs-frontend `9c60ff1` · nextjs-backend `8072392`/`088eafa` · content-agents-engineer `f0e4569` · media-pipeline-engineer `dd90242`)
- [x] VALIDATION.md — **PASS WITH NOTES** `e4f12fb` (105/105)
- [x] QA.md — **APPROVE WITH CONDITIONS** `84902c8` · CLOSE yes
- [x] CLOSE Phase A — 5/5 AC checked; ready/download → US-11.3

**Next:** SELECT **US-11.3** (recommended) or US-8.5.

---

## Open questions (for SECURITY / CONTRACT — not PREP blockers)

| # | Question | PO lean |
|---|----------|---------|
| 1 | Exact Zod name: `request_changes` vs `requestChanges` in JSON? | **`request_changes`** snake in wire to match status vocabulary; camelCase in TS via transform OK if CONTRACT documents. |
| 2 | Video job re-run on script revision when manual upload? | Router reuses existing script→video policy: regen video job if prior job exists; manual upload may need Operator swap — **defer edge case to CONTRACT** with “best-effort regen same modality”. |
| 3 | Invalidate prior QA report on media re-run? | **Yes** — enqueue new QA run when assembly/branding/script path runs; caption-only keeps prior QA if gate still ready. |
| 4 | Show prior change-request history on detail? | **Read-only list of past rounds** on detail — FE Phase A nice-to-have; minimum is current `revision_count` + last round summary in DTO. |
| 5 | `operatorGrantExtraRevision` FE | **Action-only V1** — Operator runs via dev/admin or minimal button on operator assembly panel in BUILD if cheap; not an AC blocker. |

---

## SPEC alignment / blockers for spec-guardian

| Item | Assessment |
|------|------------|
| SPEC “pedir cambios (máx 1 ronda/Reel)” | **Aligned** — atomic `revision_count` + max constant. |
| SPEC “reprocesa solo lo afectado” | **Aligned** — tag routing table § PO #4. |
| SPEC state machine includes `changes_requested` | **Aligned** — US-11.1 reserved enum; US-11.2 first writer. |
| SPEC SC-3 revision within 7 days | **Aligned** — Cliente self-serve one round; operator path for overflow. |
| US-11.1 Phase A deferral | **Closed by this story** — request-changes was explicit deferral. |

**No hard SPEC amendment required** for PREP → SECURITY/CONTRACT unless spec-guardian wants SC-3 measurement hooks.
