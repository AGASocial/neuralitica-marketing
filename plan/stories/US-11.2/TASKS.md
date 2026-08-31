# US-11.2 — Request controlled revision round

**Priority:** P0  
**Depends on:** US-11.1 ✅ · Soft: US-5.1 script regen · US-6.1 caption regen · US-9.1 assembly · US-9.2 branding · US-10.1 QA · US-4.1 prompt containment  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-11.2 (source of truth — do **not** check off in PREP)  
**Implementers:** **nextjs-backend** (decide extend, migration, router, requeue, operator grant) + **nextjs-frontend** (change-request form, revisions remaining) + **content-agents-engineer** (script/caption prompt context) + **media-pipeline-engineer** (assembly/branding/QA chain hooks). Per `docs/development/AGENT-ROSTER.md` Fase 5.  
**Canonical terms:** **Aprobación** · **pedir cambios** · **ronda de revisión** · **Paquete** · **Cliente** · **Operator** · **Ensamblado**.

**Reference contracts:** [US-11.1 CONTRACT](../US-11.1/CONTRACT.md) · [US-11.1 README](../US-11.1/README.md) · `lib/contracts/approval.ts` · `lib/approvals/decide-approval.ts`

## Out of scope (do not implement here)

- **US-11.3** ready-to-publish list, download/export, webhook stub.
- Unlimited client revision rounds (SPEC max 1 V1).
- Cliente-direct calls to script/caption/assembly/branding Server Actions.
- New `/reels/...` routes — stay on `/approvals/[approvalId]`.
- Decided-history on `/approvals` list.
- RBAC beyond `requireActive()` / `requireOperator()`.

## Scope split

| Concern | Owner |
|---------|--------|
| Extend `decideApproval` + Zod for `request_changes` | **BE** |
| DDL `revision_count`, `change_requests`, `extra_revision_granted` | **DB** + **BE** |
| Atomic revision limit in persist layer | **BE** |
| `routeApprovalChangeRequest` tag → job routing | **BE** + **content-agents-engineer** + **media-pipeline-engineer** |
| `requeueApprovalAfterRevision` completion hook | **BE** + **media-pipeline-engineer** |
| `operatorGrantExtraRevision` | **BE** |
| Change-request form + revisions remaining UI | **FE** |
| Delimited untrusted notes in script/caption prompts | **content-agents-engineer** |
| Assembly/branding/QA re-run enqueue | **media-pipeline-engineer** |

## Implementer routing

| Agent | Owns |
|-------|------|
| **nextjs-backend** | Migration · extend `lib/contracts/approval.ts` · `decide-approval.ts` persist · router · requeue · operator grant · tests |
| **nextjs-frontend** | Request changes form · tag checkboxes · notes · revisions remaining · limit-exceeded state · EN/ES |
| **content-agents-engineer** | Script/caption regen accepts `revisionContext`; delimiter wrapping in prompts |
| **media-pipeline-engineer** | Assembly/branding re-enqueue from router; job-complete → requeue hook; QA re-run when media path |

---

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Branch | **`feature/US-11.2-revision-round`** |
| Mutation surface | **Extend `decideApproval`** — `decision: "request_changes"` + `changeRequest` payload |
| Tags | **`script` \| `caption` \| `assembly` \| `branding`** — ≥1 required |
| Max rounds | **`APPROVAL_MAX_CLIENT_REVISION_ROUNDS = 1`** (env-configurable) |
| Limit enforcement | **Atomic** increment + check in single UPDATE (see README § PO #6) |
| Operator override | **`operatorGrantExtraRevision`** sets `extra_revision_granted = true` (one-shot) |
| Status flow | `pending_client` → `changes_requested` → (pipeline) → `pending_client` |
| Notes length | **0–500** per tag + summary (same cap as US-11.1 feedback) |
| Prompt safety | US-4.1-style delimiters for notes in LLM prompts |
| Rate limit | Reuse **`approval_decide`** |

### DDL sketch (CONTRACT freezes SQL)

```sql
-- ALTER neuramark_approvals (US-11.2)
-- revision_count integer NOT NULL DEFAULT 0 CHECK (revision_count >= 0)
-- change_requests jsonb NOT NULL DEFAULT '[]'::jsonb
-- extra_revision_granted boolean NOT NULL DEFAULT false
-- (optional) CHECK jsonb_typeof(change_requests) = 'array'
```

### Decision / routing sketch

```ts
// decideApproval — extend Phase A schema
decideApproval({
  approvalId: string;
  decision: "approved" | "rejected" | "request_changes";
  clientFeedback?: string;           // reject only (unchanged)
  changeRequest?: {                  // required when decision === "request_changes"
    tags: ("script" | "caption" | "assembly" | "branding")[]; // min 1
    notesByTag?: Partial<Record<... , string>>;
    summary?: string;
  };
});

// After successful request_changes write:
await routeApprovalChangeRequest({ approvalId, assembledReelId, changeRequest });

// Tag expansion (maximal path):
// script     → script → video? → tts → assembly → branding → qa
// assembly   → assembly → branding → qa
// branding   → branding → qa
// caption    → caption only → requeue (no qa re-run)
```

---

## Frontend (nextjs-frontend)

**Consumer:** `/approvals/[approvalId]` — extend `ApprovalPackageView` (or sibling client island).

- [x] Add **Request changes** CTA when `status === "pending_client"` and revisions remaining > 0 (or `extraRevisionGranted` from DTO).
- [x] Change-request panel: **≥1** tag checkbox among `script`, `caption`, `assembly`, `branding` (labels EN/ES `approvals.revision.tags.*`).
- [x] Per-tag optional `InputTextarea` (max 500) + optional overall summary; disable submit until ≥1 tag selected.
- [x] Show **revisions remaining** copy (e.g. `approvals.revision.remaining` with count from package DTO `revisionCount` / `maxRevisionRounds`).
- [x] When limit exceeded (`revisionCount >= max` and no grant): hide Request changes; show operator escalation message (`approvals.revision.limitExceeded`).
- [x] Submit calls **`decideApproval({ approvalId, decision: "request_changes", changeRequest })`** — never send `revision_count`, `status`, gate flags.
- [x] Pending/disabled states during mutation; map **`REVISION_LIMIT_EXCEEDED`**, `INVALID_TRANSITION`, `QA_GATE_NOT_READY`, validation errors.
- [x] Read-only state when `status === "changes_requested"` (waiting for team — no decide CTAs).
- [x] EN/ES strings under `approvals.revision.*` (+ extend error map if new codes).
- [x] Mobile-friendly form layout (consistent with US-11.1 detail).

---

## Backend / API (nextjs-backend)

**Extends:** [US-11.1 CONTRACT](../US-11.1/CONTRACT.md) § `decideApproval` · `lib/approvals/decide-approval.ts` · `lib/approvals/persist-approval.ts`

- [ ] Migration `neuramark_approvals` add `revision_count`, `change_requests`, `extra_revision_granted` (prefix + RLS unchanged).
- [ ] Extend `lib/contracts/approval.ts`: `approvalDecisionSchema` includes **`request_changes`**; `changeRequestSchema`; package DTO adds `revisionCount`, `maxRevisionRounds`, `extraRevisionGranted`, optional `lastChangeRequest`; new error code **`REVISION_LIMIT_EXCEEDED`**.
- [ ] Extend `findForbiddenApprovalKeys` — allow `changeRequest` only on decide; keep blocking body `revision_count`, `change_requests`, `status`.
- [ ] Extend `decideApprovalForClient`: when `request_changes`, validate `changeRequest` (≥1 tag, note lengths); gate re-check; **atomic** persist (status `changes_requested`, increment count, append JSON round, set `decided_at`/`decided_by`, summary → `client_feedback`).
- [ ] Implement **`routeApprovalChangeRequest`** (`import "server-only"`) — resolve `assembled_reel_id` → `reel_script_id`; apply tag expansion; enqueue existing regen/job helpers (no new Cliente endpoints).
- [ ] Implement **`requeueApprovalAfterRevision`** — `changes_requested` → `pending_client`; clear decide fields; `revalidatePath("/approvals")`.
- [ ] Wire requeue hook from caption-complete (caption-only) and from branding/QA-complete (media paths) — coordinate with media-pipeline-engineer.
- [ ] **`operatorGrantExtraRevision`** Server Action: `requireOperator`, scoped load, set `extra_revision_granted = true`, audit reason append.
- [ ] Extend `compose-approval-package.ts` / list DTO with revision fields.
- [ ] Tests: atomic limit (concurrent double-submit); `request_changes` happy path; limit exceeded; forbidden smuggle; gate not ready; tag validation; routing unit tests (expansion table); operator grant consumes on next request.

---

## Database

- [ ] Migration ALTER `neuramark_approvals` with columns per README § PO #5–6.
- [ ] Comment columns: `revision_count` = completed client rounds; `change_requests` = append-only audit array; `extra_revision_granted` = one-shot operator override.
- [ ] No new tables V1 — JSONB array on approval row.
- [ ] RLS remain enable, zero policies (service-role Node only).

---

## content-agents-engineer

**Consumers:** `routeApprovalChangeRequest` → script/caption regen orchestrators (server-only).

- [ ] Extend script regen entrypoint to accept optional **`revisionContext`** `{ approvalId, tags, delimitedNotes }` — not Cliente-callable.
- [ ] Extend caption regen similarly for caption-only path.
- [ ] Wrap all Cliente note text in **`<UNTRUSTED_CLIENT_CHANGE_REQUEST>`** delimiters; explicit non-instruction framing in system prompt (mirror US-4.1 / US-5.1).
- [ ] Reject malformed agent output before persist (existing Zod gates — no relaxation).
- [ ] Do **not** expose revision context fields on Operator UI write paths from browser without operator auth.

---

## media-pipeline-engineer

**Consumers:** `routeApprovalChangeRequest` for `assembly` / `branding` / full script path tail.

- [ ] From router: enqueue **assembly** job when expansion requires (reuse `createAssemblyJobForReelScript` / existing assembly enqueue).
- [ ] From router: enqueue **branding** when expansion requires (reuse `applyBrandingForAssembly` / auto-chain pattern from US-9.2).
- [ ] When media path completes + QA gate ready: call **`requeueApprovalAfterRevision`** (or export hook for BE to register).
- [ ] When **caption-only** path completes: trigger requeue without QA re-run (CONTRACT documents gate behavior).
- [ ] Enqueue **QA re-run** when assembly/branding/script path runs (US-10.1 existing run QA helper).
- [ ] Idempotency: do not double-enqueue if revision already in flight — CONTRACT should define `changes_requested` in-flight guard.

---

## Contract-first checklist (before BUILD)

- [ ] SPEC-REVIEW.md — ALIGNED
- [ ] SECURITY.md — APPROVE (atomic limit, prompt containment, no Cliente job triggers)
- [ ] CONTRACT.md frozen + `lib/contracts/approval.ts` updated
- [x] **Reviewed by FE:** line in CONTRACT.md

---

## Acceptance evidence (for VALIDATION — do not check off in PREP)

- [ ] Client can submit one tagged revision round from `/approvals/[approvalId]`
- [ ] Second round blocked server-side with **`REVISION_LIMIT_EXCEEDED`** unless operator grant
- [ ] Tagged `caption`-only does not enqueue assembly/branding; tagged `script` runs full affected chain
- [ ] Concurrent duplicate requests cannot exceed limit (transaction test)
- [ ] Change notes appear in agent prompts only inside delimiters (code review + test)
- [ ] After pipeline completes, approval returns to `pending_client` for re-review
- [ ] EN/ES revision strings present

---

## Dependencies and sequence

1. **CONTRACT gate** extends US-11.1 decide schema (backward compatible for approve/reject).
2. **DB migration** before persist/router BUILD.
3. **BE decide + persist** before FE form (FE can mock against fixtures).
4. **Router + agents + pipeline** in parallel once CONTRACT frozen.
5. **Operator grant** can land with BE decide (no FE required for AC).

**Blocks:** US-11.3 full state-machine AC wording (already references `changes_requested`) — no hard block on 11.3 BUILD start for approve path.
