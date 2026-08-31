# API Contract — US-11.2 Request controlled revision round

**Story:** US-11.2  
**Status:** Frozen — 2026-08-30 · **Reviewed by FE:** pending — nextjs-frontend  
**Extends:** [US-11.1 CONTRACT](../US-11.1/CONTRACT.md) (supersedes Phase A decide enum + package DTO revision fields only)  
**Security:** `plan/stories/US-11.2/SECURITY.md` (APPROVE WITH CONDITIONS — reconciled below)  
**Spec review:** `plan/stories/US-11.2/SPEC-REVIEW.md` (GAPS — all closed below)  
**Pattern:** US-11.1 decide extension · US-4.1 delimiter containment · US-5.1/6.1/9.x/10.x `invokedBy: "revision"` seams  
**Depends on:** US-11.1 ✅ · Soft: US-5.1 script regen · US-6.1 caption regen · US-9.1 assembly · US-9.2 branding · US-10.1 QA · US-4.1 prompt containment  
**Feature branch:** `feature/US-11.2-revision-round`  
**Error envelope style:** same as US-11.1 (`ok: true` vs `{ ok: false, error: { code, fields?, messageKey? } }`)

**This document is CONTRACT ONLY.** Zod mirrors live in `lib/contracts/approval.ts` (extended decide + package DTO) and `lib/contracts/approval-revision.ts` (revision-specific schemas). Server Actions, migration SQL application, router/requeue implementations, and FE are specified here and built in BUILD — **not shipped in this gate commit**.

**Terminology:** **Aprobación** · **pedir cambios** · **ronda de revisión** · **Paquete** · **Cliente** · **Operator** · **Ensamblado** · **Veredicto QA**. Technical enums (`request_changes`, `changes_requested`, `changeRequest`) OK in code/wire JSON. Do **not** use CONTEXT _Evitar_ terms in Cliente-facing copy.

---

## US-11.1 supersession table

| US-11.1 frozen item | US-11.2 change |
|---------------------|----------------|
| `approvalDecisionSchema` = `approved` \| `rejected` | Adds **`request_changes`** (wire verb → status **`changes_requested`**) |
| `decideApproval` request | Adds optional **`changeRequest`** when `decision === "request_changes"`; **`clientFeedback` forbidden** on request_changes |
| Phase A state machine | Adds `pending_client` → `changes_requested`; server requeue → `pending_client` |
| Package DTO | Adds `revisionCount`, `maxRevisionRounds`, `revisionsRemaining`, `extraRevisionGranted`, `lastChangeRequest`, optional `changeRequestHistory` |
| Forbidden keys | Adds `extra_revision_granted`, `extraRevisionGranted`, `revisionCount`; nested scan inside `changeRequest` |
| Error codes | Adds **`REVISION_LIMIT_EXCEEDED`**, **`REVISION_ROUTING_FAILED`** |
| Closed write surface | Adds revision persist, router (no DB write), requeue, operator grant |
| Approve/reject paths | **Unchanged** — backward compatible |

---

## SPEC-REVIEW gaps closed

| # | Gap (severity) | Resolution in this contract |
|---|----------------|----------------------------|
| 1 | Router cannot call Operator Server Actions (Medium) | § Revision invoke matrix — server-only orchestrators with **`invokedBy: "revision"`**; **never** call Operator browser actions from Cliente decide path |
| 2 | Tag expansion table not frozen (Medium) | § Tag routing matrix + `computeRevisionRoutingPlan()` in `lib/contracts/approval-revision.ts` |
| 3 | Caption-only QA / requeue gate underspecified (Medium) | § QA / gate rules — caption-only skips QA re-run; **`requeueApprovalAfterRevision`** requires gate `ready === true` before `pending_client` |
| 4 | Media-path QA invalidation hook placement (Medium) | § Tag routing matrix — media paths enqueue **`qa_rerun`** after branding; requeue only after new report satisfies US-10.2 ready rules |
| 5 | In-flight idempotency not frozen (Medium) | § In-flight guard — idempotency key `{ approvalId, round }`; single router call per round; no Cliente decide from `changes_requested` |
| 6 | US-11.1 extension boundary (Low) | § Supersession table above; same `decideApproval` action surface |
| 7 | Operator override audit shape (Low) | § `operatorGrantExtraRevision` — append `{ kind: "operator_grant", ... }` to `change_requests` JSONB |
| 8 | Gate re-check on request_changes (Low) | § Extended `decideApproval` step 7 — same `getQaGateStatusForAssembledReel` as approve/reject |
| 9 | Atomic revision limit (Low) | § Atomic persist SQL + **`REVISION_LIMIT_EXCEEDED`** |

---

## SECURITY reconciliation (13 conditions)

| # | SECURITY condition | **Frozen in this contract** |
|---|-------------------|----------------------------|
| 1 | Atomic persist — single conditional UPDATE | § Atomic persist SQL |
| 2 | Max rounds authority — server constant | § Constants · `APPROVAL_MAX_CLIENT_REVISION_ROUNDS` |
| 3 | Decide input extension — pointer-only + conditional `changeRequest` | § Extended `decideApproval` request |
| 4 | `changeRequest` schema strict | `lib/contracts/approval-revision.ts` · `changeRequestInputSchema` |
| 5 | Forbidden keys — top-level + one-level nested | § Forbidden keys · `findForbiddenChangeRequestKeys` |
| 6 | Append-only `change_requests` — server-built rounds | § Persisted audit entry shape |
| 7 | State machine — Cliente writes only from `pending_client` | § State machine |
| 8 | Requeue authority — server-only | § `requeueApprovalAfterRevision` |
| 9 | Router authority — server-only | § `routeApprovalChangeRequest` |
| 10 | Operator grant — scoped + audited | § `operatorGrantExtraRevision` |
| 11 | One-shot grant consumption | § Atomic persist SQL — `extra_revision_granted = false` on successful request_changes |
| 12 | Prompt-injection containment | § Prompt safety · `UNTRUSTED_CLIENT_CHANGE_REQUEST_TAG` |
| 13 | Rate limits — decide + operator grant | § Rate limit |

**Inherited US-11.1 [SEC] rows** (gate re-check, IDOR → 404, `requireActive` first, forbidden authority, `approval_decide` rate limit) remain binding on the extended decide surface.

---

## Phased BUILD acceptance

| Phase | Scope | Closes |
|-------|-------|--------|
| **A (US-11.2 BUILD — ship all in this story)** | DDL ALTER · extend `decideApproval` · change-request form FE · atomic revision limit · tagged router · agent/pipeline re-run wiring · requeue → `pending_client` · operator grant · delimited prompt injection · EN/ES | USER_STORIES § US-11.2 AC (all five) |
| **B (deferred — not US-11.2)** | Operator revision queue UI polish · full change-request history on detail · env-admin UI for max rounds | Backlog / P1 |

**VALIDATION note (binding):** Phase A closes full US-11.2 AC. US-11.1 Phase B deferral (request-changes) is satisfied here. US-11.3 download/ready queue not required for CLOSE.

---

## Overview

US-11.2 extends Cliente **Aprobación** on `/approvals/[approvalId]` with **pedir cambios**: tagged areas (`script` / `caption` / `assembly` / `branding`), length-capped notes, **one client revision round per Reel** (configurable server constant), atomic enforcement, prompt-injection containment, minimal downstream re-run routing, and **`changes_requested` ↔ `pending_client`** requeue loop. When the round limit is exceeded, Cliente sees operator-escalation copy; Operators may grant one extra round via **`operatorGrantExtraRevision`**.

**Surfaces**

| # | Surface | Kind | Consumer |
|---|---------|------|----------|
| 1 | `decideApproval` (extended) | Server Action | Detail **Request changes** + existing Approve/Reject |
| 2 | `decideApprovalForClient` (extended) | Server-only orchestrator | Action only |
| 3 | `operatorGrantExtraRevision` | Server Action | Operator (V1 action-only; optional FE stub) |
| 4 | `operatorGrantExtraRevisionForOperator` | Server-only orchestrator | Action only |
| 5 | `routeApprovalChangeRequest` | Server-only orchestrator | Post-persist revision routing — **not** Cliente-exported |
| 6 | `requeueApprovalAfterRevision` | Server-only orchestrator | Pipeline completion hooks — **not** Cliente-exported |
| 7 | `getApprovalPackage` / list (extended DTO) | Server Action | Revisions remaining · waiting state copy |
| 8 | Zod + types | `lib/contracts/approval.ts` · `lib/contracts/approval-revision.ts` | FE types · BE validation |
| 9 | Migration ALTER | `neuramark_approvals` | Revision columns |

**Forbidden surfaces (BUILD veto):**

- Separate Cliente **`requestApprovalChanges`** Server Action.
- Cliente-callable script/caption/assembly/branding regen with `revisionContext`.
- Export of `routeApprovalChangeRequest` / `requeueApprovalAfterRevision` as Cliente Server Actions.
- Client-writable `revision_count`, `change_requests`, `extra_revision_granted`, body `status`.
- Read-then-write revision limit (non-atomic SELECT → UPDATE).
- Raw Cliente notes in LLM system prompts (no delimiters).
- Cliente decide from `changes_requested` or terminal `approved`/`rejected`.
- Unlimited revision loops.

---

## Migration — ALTER `neuramark_approvals`

**Migration file (BUILD):** `supabase/migrations/20260831040000_neuramark_approvals_revision.sql`

```sql
-- US-11.2: controlled revision round columns on neuramark_approvals

ALTER TABLE public.neuramark_approvals
  ADD COLUMN IF NOT EXISTS revision_count integer NOT NULL DEFAULT 0
    CHECK (revision_count >= 0),
  ADD COLUMN IF NOT EXISTS change_requests jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(change_requests) = 'array'),
  ADD COLUMN IF NOT EXISTS extra_revision_granted boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.neuramark_approvals.revision_count IS
  'US-11.2: completed client revision rounds; incremented atomically on successful request_changes.';
COMMENT ON COLUMN public.neuramark_approvals.change_requests IS
  'US-11.2: append-only audit array — client_revision rounds + operator_grant entries; server-built only.';
COMMENT ON COLUMN public.neuramark_approvals.extra_revision_granted IS
  'US-11.2: one-shot operator override; consumed (set false) on next successful request_changes.';
```

| Column | Rule |
|--------|------|
| `revision_count` | **0** at INSERT; increment **only** in atomic request_changes UPDATE |
| `change_requests` | Append-only JSONB array; discriminated by `kind` |
| `extra_revision_granted` | **false** default; set **true** only via operator grant; consumed on next successful request_changes |
| RLS | Unchanged — enabled, zero policies (service-role Node only) |

---

## Constants

| Constant | Value | Detail |
|----------|-------|--------|
| `APPROVAL_MAX_CLIENT_REVISION_ROUNDS_DEFAULT` | **1** | Exposed on DTO as `maxRevisionRounds` |
| Env override | `APPROVAL_MAX_CLIENT_REVISION_ROUNDS` | Staging only — BUILD reads at runtime; **never** from request |
| `APPROVAL_DECIDE_AGENT_KEY` | `approval_decide` | Includes **`request_changes`** |
| `APPROVAL_OPERATOR_GRANT_AGENT_KEY` | `approval_operator_grant` | Operator grant only |
| `APPROVAL_OPERATOR_GRANT_MAX_PER_WINDOW` | **10** / 60 min | Per operator `client_id` |
| `UNTRUSTED_CLIENT_CHANGE_REQUEST_TAG` | `UNTRUSTED_CLIENT_CHANGE_REQUEST` | Shared with content-agents-engineer |
| Note length | **0–500** trim per tag + summary | Empty → omit; same cap as US-11.1 feedback |

---

## State machine (US-11.2)

```ts
// Cliente via decideApproval (from pending_client only):
//   pending_client → approved
//   pending_client → rejected
//   pending_client → changes_requested   (decision: request_changes)
//
// Server-only:
//   changes_requested → pending_client   (requeueApprovalAfterRevision)
//
// Forbidden Cliente writes:
//   changes_requested → *
//   approved|rejected → *
//   double request_changes without requeue
//
// Terminal (immutable):
//   approved, rejected
```

| From | To | Actor | Fields |
|------|-----|-------|--------|
| `pending_client` | `approved` | Cliente decide | US-11.1 unchanged |
| `pending_client` | `rejected` | Cliente decide | US-11.1 unchanged |
| `pending_client` | `changes_requested` | Cliente decide (`request_changes`) | Atomic: `revision_count+1`, append round, `decided_at/by`, `client_feedback` ← summary |
| `changes_requested` | `pending_client` | Server requeue only | Clear `decided_at`, `decided_by`; refresh package |
| any other | — | — | **`INVALID_TRANSITION`** or **`REVISION_LIMIT_EXCEEDED`** |

**List UX:** `/approvals` remains **`pending_client` only**. After request_changes, item leaves list until requeue. Deep-linked detail while `changes_requested` is **read-only waiting** — no decide CTAs.

---

## Forbidden request keys

Extend US-11.1 scan. Call **`findForbiddenApprovalKeys(raw, "decide")`** then **`findForbiddenChangeRequestKeys(raw.changeRequest)`** when present → **`FORBIDDEN_FIELDS`**.

**Added to top-level authority keys:**

```ts
"extra_revision_granted",
"extraRevisionGranted",
"revisionCount",
// revision_count, change_requests, changeRequests already forbidden (US-11.1)
```

**Allowed on decide only:** `changeRequest` (structured companion to `request_changes`).

**Nested scan (one level):** `findForbiddenChangeRequestKeys` in `lib/contracts/approval-revision.ts` — rejects authority keys inside `changeRequest` / `notesByTag`.

**Still forbidden on decide:** `revision_count`, `change_requests`, `status`, `extra_revision_granted`, gate flags, tenancy spoof keys (US-11.1 list).

---

## Extended `decideApproval`

**Kind:** Server Action (extends US-11.1)  
**File (BUILD):** `lib/approvals/actions/decide-approval.ts`  
**Orchestrator (BUILD):** `lib/approvals/decide-approval.ts` — `decideApprovalForClient`  
**Consumer:** `/approvals/[approvalId]` Approve / Reject / **Request changes**  
**Auth:** `requireActive("handler")` first.

### Request

```ts
{
  approvalId: string; // uuid
  decision: "approved" | "rejected" | "request_changes";
  clientFeedback?: string; // reject only — MUST be absent when request_changes
  changeRequest?: {        // REQUIRED when decision === "request_changes"; MUST be absent otherwise
    tags: ("script" | "caption" | "assembly" | "branding")[]; // min 1, deduped
    notesByTag?: Partial<Record<tag, string>>; // keys ⊆ selected tags; 0–500 trim each
    summary?: string;      // 0–500 trim
  };
} // .strict()
```

### Success — approve / reject (unchanged shape)

```ts
{
  ok: true;
  approvalId: string;
  assembledReelId: string;
  status: "approved" | "rejected";
  decidedAt: string;
  summary: ApprovalListItemDto;
}
```

### Success — request_changes

```ts
{
  ok: true;
  approvalId: string;
  assembledReelId: string;
  status: "changes_requested";
  decidedAt: string;
  revisionCount: number;       // after increment
  revisionsRemaining: number;  // max(0, maxRounds - revisionCount) — 0 when exhausted
  summary: ApprovalListItemDto;
}
```

### Orchestrator steps (request_changes path)

| Step | Action |
|------|--------|
| 1 | `requireActive("handler")` first |
| 2 | Top-level forbidden-key scan |
| 3 | Nested `changeRequest` forbidden-key scan (if present) |
| 4 | Zod `.strict()` + conditional `changeRequest` / `clientFeedback` rules |
| 5 | Rate limit **`approval_decide`** |
| 6 | Load approval scoped **`WHERE id AND client_id = session`** — miss → **`NOT_FOUND`** |
| 7 | If `status !== 'pending_client'` → **`INVALID_TRANSITION`** |
| 8 | `getQaGateStatusForAssembledReel` — `ready !== true` → **`QA_GATE_NOT_READY`** |
| 9 | **Atomic persist** (see § Atomic persist) — 0 rows → re-read → **`REVISION_LIMIT_EXCEEDED`** or **`INVALID_TRANSITION`** |
| 10 | `routeApprovalChangeRequest({ approvalId, assembledReelId, clientId, round, changeRequest })` — routing failure logged; row stays `changes_requested` → **`REVISION_ROUTING_FAILED`** optional soft error to Cliente (prefer: success on persist + async routing retry in BUILD — **frozen lean: persist success even if routing throws; log + operator fix**). **CONTRACT BUILD default:** return success after persist; router errors do not roll back status write. |
| 11 | `revalidatePath("/approvals")` + detail path |
| 12 | Return success with `revisionCount`, `revisionsRemaining` |

**Approve/reject steps:** US-11.1 unchanged (steps 1–8 gate + `updateApprovalDecision`).

---

## Atomic persist (request_changes)

**Function (BUILD):** `updateApprovalRequestChanges` in `lib/approvals/persist-approval.ts`

```sql
UPDATE neuramark_approvals
SET
  status = 'changes_requested',
  revision_count = revision_count + 1,
  change_requests = change_requests || $newRound::jsonb,
  client_feedback = $summary,  -- NULL if summary empty/omitted
  decided_at = now(),
  decided_by = $sessionClientId,
  extra_revision_granted = CASE
    WHEN extra_revision_granted THEN false
    ELSE extra_revision_granted
  END
WHERE id = $approvalId
  AND client_id = $sessionClientId
  AND status = 'pending_client'
  AND (
    revision_count < $maxRounds
    OR extra_revision_granted = true
  )
RETURNING *;
```

**Server-built `$newRound` (append-only):**

```ts
{
  kind: "client_revision";
  round: number;           // revision_count AFTER increment (= array length of client rounds)
  tags: ApprovalChangeTag[];
  notesByTag?: Partial<Record<ApprovalChangeTag, string>>;
  summary?: string;
  decidedAt: string;       // ISO
  decidedBy: string;       // session client uuid
}
```

| 0 rows returned | Re-read row | Error |
|-----------------|-------------|-------|
| `revision_count >= maxRounds` and not grant | yes | **`REVISION_LIMIT_EXCEEDED`** |
| other (race, wrong status) | yes | **`INVALID_TRANSITION`** |

**Anti-pattern:** SELECT `revision_count` → IF → UPDATE (**REJECT**).

---

## `operatorGrantExtraRevision`

**Kind:** Server Action  
**File (BUILD):** `lib/approvals/actions/operator-grant-extra-revision.ts`  
**Orchestrator (BUILD):** `lib/approvals/operator-grant-extra-revision.ts`  
**Consumer:** Operator dev/admin or optional assembly panel stub  
**Auth:** `requireOperator("handler")` first.

### Request

```ts
{
  approvalId: string;
  reason: string; // trim 1–500
} // .strict()
```

### Success

```ts
{
  ok: true;
  approvalId: string;
  extraRevisionGranted: true;
  grantedAt: string;
}
```

### Orchestrator steps

| Step | Action |
|------|--------|
| 1 | `requireOperator("handler")` first |
| 2 | Forbidden-key scan (top-level authority keys only) |
| 3 | Zod `.strict()` |
| 4 | Rate limit **`approval_operator_grant`** → **`RATE_LIMITED`** |
| 5 | Load approval **`WHERE id = $approvalId AND client_id = $operator.id`** — miss → **`NOT_FOUND`** (404) |
| 6 | UPDATE `extra_revision_granted = true`; append `{ kind: "operator_grant", grantedAt, grantedBy: operator.id, reason }` to `change_requests` |
| 7 | Return success |

**Does not** increment `revision_count`. Client may submit **one** more `request_changes` while `pending_client` after requeue.

---

## `routeApprovalChangeRequest` (server-only)

**File (BUILD):** `lib/approvals/route-approval-change-request.ts`  
**Import:** `import "server-only"` — **never** exported as Cliente Server Action  
**Invoked:** Immediately after successful request_changes persist (same request lifecycle)

### Params

```ts
{
  approvalId: string;
  assembledReelId: string;
  clientId: string;
  round: number;              // revision_count after increment
  changeRequest: ChangeRequestInput;
}
```

### Tag routing matrix (maximal union — PO freeze #4)

| Selected tag(s) | `pathKind` | Ordered pipeline steps |
|-----------------|------------|------------------------|
| includes **`script`** | `media` | `script_regen` → `video_job`? → `tts` → `assembly` → `branding` → `qa_rerun` |
| includes **`assembly`** (no script) | `media` | `assembly` → `branding` → `qa_rerun` |
| includes **`branding`** only (no script/assembly) | `media` | `branding` → `qa_rerun` |
| **`caption`** only (no script/assembly/branding) | `caption_only` | `caption_regen` |
| **`script` + `caption`** | `media` | **Script path** (maximal) — caption tag notes passed to script agent; separate caption regen **not** enqueued unless caption-only path |

**Union rule:** If multiple tags, take the **maximal** path row above (first matching row top-to-bottom).

**`video_job` policy:** Enqueue video regen **only if** prior `neuramark_video_jobs` row exists for slot (best-effort same modality). Manual-upload slots without prior job: skip video step; Operator may swap asset — **not** a Cliente bypass.

### Revision invoke matrix (server-only entrypoints)

| Step | Callable orchestrator (BUILD extends) | Trust |
|------|--------------------------------------|-------|
| `script_regen` | `generateReelScriptsForClient({ invokedBy: "revision", revisionContext, mode: "slot", ... })` | Router only |
| `caption_regen` | `generateReelCaptionsForClient({ invokedBy: "revision", revisionContext, mode: "slot", ... })` | Router only |
| `assembly` | `createAssemblyJobForReelScript` / assembly enqueue helper (server-only) | Router only |
| `branding` | Branding enqueue helper (US-9.2 auto-chain pattern) | Router only |
| `qa_rerun` | `runQaForAssembledReelForClient({ invokedBy: "revision", ... })` | Router / branding-complete hook |

**Extend upstream invoker enums (BUILD):**

```ts
// lib/contracts/reel-script.ts
export type ReelScriptInvoker = "operator" | "system" | "revision";

// lib/contracts/reel-caption.ts
export type ReelCaptionInvoker = "operator" | "system" | "revision";

// lib/contracts/qa-report.ts
export const qaInvokerSchema = z.enum(["operator", "system", "revision"]);
```

**`revisionContext` shape:** `lib/contracts/approval-revision.ts` · `revisionContextSchema` — built server-side with **`wrapUntrusted(UNTRUSTED_CLIENT_CHANGE_REQUEST_TAG, note)`** per note field.

**Forbidden:** Browser calls to regen actions with `revisionContext`; Operator actions invoked from Cliente decide path.

### In-flight guard

| Rule | Detail |
|------|--------|
| Idempotency key | `{ approvalId, round }` |
| First call | Sets `routingStartedAt` on round entry in `change_requests` |
| Duplicate router call same round | No-op if `routingStartedAt` already set |
| Cliente | Cannot trigger second round while `status = changes_requested` |
| Job failure | Stays `changes_requested` until Operator fix or successful pipeline + requeue |

---

## `requeueApprovalAfterRevision` (server-only)

**File (BUILD):** `lib/approvals/requeue-approval-after-revision.ts`  
**Import:** `import "server-only"`  
**Invoked:** Pipeline completion hooks (caption-only or media+QA path)

### Params

```ts
{
  approvalId: string;
  clientId: string;
  round: number;
  pathKind: "caption_only" | "media";
}
```

### Orchestrator steps

| Step | Action |
|------|--------|
| 1 | Load approval scoped by `approvalId` + `clientId` — miss → return (log) |
| 2 | If `status !== 'changes_requested'` → no-op (idempotent) |
| 3 | **`getQaGateStatusForAssembledReel(assembledReelId)`** — `ready !== true` → **do not requeue** (wait for QA on media path) |
| 4 | UPDATE `status = 'pending_client'`, `decided_at = NULL`, `decided_by = NULL` WHERE `status = 'changes_requested'` |
| 5 | Set `routingCompletedAt` on matching round entry |
| 6 | `revalidatePath("/approvals")` |

### QA / gate rules (frozen)

| Path | QA behavior | Requeue gate |
|------|-------------|--------------|
| **`caption_only`** | **No** QA re-run; prior Veredicto QA may remain | Requeue only if `getQaGateStatusForAssembledReel` → **`ready === true`** (caption hash change alone does not auto-invalidate QA in V1) |
| **`media`** | **Invalidate** stale QA — enqueue `qa_rerun`; gate `ready === false` while QA pending/running | Requeue only after **new** report satisfies US-10.2 ready rules |

**Publish safety:** ADR-0002 publish still re-checks `approved` + live gate — `changes_requested` never publishable.

### Completion hook ownership

| Path | Hook owner | Trigger |
|------|------------|---------|
| `caption_only` | media-pipeline-engineer + BE | Caption regen job `completed` |
| `media` | media-pipeline-engineer + BE | Branding `completed` → QA `passed`/overridable-ready → requeue |

---

## Package DTO extensions

Extend `ApprovalPackageDto` in `lib/contracts/approval.ts`:

**Note:** Revision fields are **optional in Zod until BUILD** compose layer populates them; **required at runtime** after migration lands.

```ts
{
  // ... US-11.1 fields unchanged ...
  revisionCount: number;           // DB revision_count
  maxRevisionRounds: number;         // server constant — never from request
  revisionsRemaining: number;      // max(0, maxRevisionRounds - revisionCount) when pending_client
  extraRevisionGranted: boolean;   // read-only; true = one extra round available on next pending_client
  lastChangeRequest?: {            // latest client_revision round (read-only)
    round: number;
    tags: ApprovalChangeTag[];
    notesByTag?: Partial<Record<ApprovalChangeTag, string>>;
    summary?: string;
    decidedAt: string;
  };
  changeRequestHistory?: LastChangeRequestDto[]; // optional FE nice-to-have — minimum lastChangeRequest
}
```

**FE authority:** Show **revisions remaining** from DTO — never client-compute limit. When `revisionCount >= maxRevisionRounds` and `!extraRevisionGranted` and `status === pending_client` → hide Request changes; show escalation copy.

**Waiting state:** When `status === changes_requested` → read-only detail; i18n `approvals.revision.waiting`.

---

## Prompt safety

| Layer | Control |
|-------|---------|
| Persist | Zod trim + max **500** before storage |
| Delimiter | `UNTRUSTED_CLIENT_CHANGE_REQUEST_TAG` via `wrapUntrusted(tag, payload)` (same pattern as `lib/agents/content/generate-reel-script.ts`) |
| Framing | System prompt: delimited blocks are **data**, not instructions |
| Scope | Script + caption regen only — assembly/branding do **not** take Cliente free-text |
| Output | Existing script/caption Zod gates — no relaxation |

---

## Rate limit

| Key | Surface | Window | Max |
|-----|---------|--------|-----|
| `approval_decide` | approve \| reject \| **request_changes** | 60 min | 30 / `client_id` |
| `approval_operator_grant` | `operatorGrantExtraRevision` | 60 min | 10 / operator `client_id` |

Over-limit → **`RATE_LIMITED`** (429), no write.

---

## Error codes

Extend `approvalErrorCodeSchema`:

```ts
"REVISION_LIMIT_EXCEEDED",  // revision_count >= max and no grant
"REVISION_ROUTING_FAILED",  // optional — routing enqueue hard failure (BUILD lean: log only)
```

| Code | HTTP-ish | When |
|------|----------|------|
| `REVISION_LIMIT_EXCEEDED` | 409 | Atomic UPDATE 0 rows + re-read shows limit exhausted |
| `REVISION_ROUTING_FAILED` | 500 | Reserved — default BUILD returns persist success; use for hard failures if product chooses |
| `INVALID_TRANSITION` | 409 | Not `pending_client`; decide from `changes_requested`; concurrent race |
| `QA_GATE_NOT_READY` | 409 | Gate not ready on request_changes submit |
| `FORBIDDEN_FIELDS` | 400 | Authority / nested smuggle |
| `VALIDATION_ERROR` | 400 | Zod — empty tags, note length, changeRequest required/forbidden |
| _(US-11.1 codes unchanged)_ | | |

**FE i18n keys (BUILD):** `approvals.errors.revisionLimitExceeded` · `approvals.revision.*` · extend error map for new codes.

---

## Closed write surface (US-11.2)

**Only** these modules may UPDATE revision authority columns / `changes_requested` ↔ `pending_client`:

| Module | Writes |
|--------|--------|
| `lib/approvals/persist-approval.ts` — `updateApprovalRequestChanges` | `status`, `revision_count`, `change_requests`, `decided_*`, `client_feedback`, consume grant |
| `lib/approvals/persist-approval.ts` — `updateApprovalDecision` | US-11.1 approve/reject only |
| `lib/approvals/operator-grant-extra-revision.ts` | `extra_revision_granted`, append operator grant audit |
| `lib/approvals/requeue-approval-after-revision.ts` | `changes_requested` → `pending_client`, clear `decided_*`, `routingCompletedAt` |
| `lib/approvals/route-approval-change-request.ts` | **`routingStartedAt` only** on round entry (optional metadata UPDATE) |

**Zero** Route Handlers write revision columns. **Zero** Cliente regen actions accept `revisionContext`.

---

## Fixtures (FE mock)

### Decide — request_changes

```json
{
  "approvalId": "11111111-2222-4333-8444-555555555555",
  "decision": "request_changes",
  "changeRequest": {
    "tags": ["caption", "script"],
    "notesByTag": {
      "script": "Hook feels too salesy — soften opening.",
      "caption": "CTA should mention free consult, not discount."
    },
    "summary": "Overall tone should be warmer for local audience."
  }
}
```

### Decide success — request_changes

```json
{
  "ok": true,
  "approvalId": "11111111-2222-4333-8444-555555555555",
  "assembledReelId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "status": "changes_requested",
  "decidedAt": "2026-08-30T20:00:00.000Z",
  "revisionCount": 1,
  "revisionsRemaining": 0,
  "summary": {
    "approvalId": "11111111-2222-4333-8444-555555555555",
    "assembledReelId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    "status": "changes_requested",
    "createdAt": "2026-08-30T19:00:00.000Z"
  }
}
```

### Error — revision limit exceeded

```json
{
  "ok": false,
  "error": {
    "code": "REVISION_LIMIT_EXCEEDED",
    "messageKey": "approvals.errors.revisionLimitExceeded"
  }
}
```

### Error — changeRequest smuggle

```json
{
  "ok": false,
  "error": {
    "code": "FORBIDDEN_FIELDS",
    "messageKey": "approvals.errors.forbiddenFields",
    "fields": { "changeRequest.revision_count": ["FORBIDDEN"] }
  }
}
```

### Package DTO excerpt (pending with revision fields)

```json
{
  "approvalId": "11111111-2222-4333-8444-555555555555",
  "status": "pending_client",
  "revisionCount": 0,
  "maxRevisionRounds": 1,
  "revisionsRemaining": 1,
  "extraRevisionGranted": false,
  "lastChangeRequest": null
}
```

### Operator grant request

```json
{
  "approvalId": "11111111-2222-4333-8444-555555555555",
  "reason": "Cliente escalated via email — granting one extra revision round."
}
```

---

## Module placement (BUILD)

| Module | Path |
|--------|------|
| Core contracts (extended) | `lib/contracts/approval.ts` |
| Revision contracts | `lib/contracts/approval-revision.ts` |
| Decide orchestrator (extend) | `lib/approvals/decide-approval.ts` |
| Persist (extend) | `lib/approvals/persist-approval.ts` |
| Router | `lib/approvals/route-approval-change-request.ts` |
| Requeue | `lib/approvals/requeue-approval-after-revision.ts` |
| Operator grant action | `lib/approvals/actions/operator-grant-extra-revision.ts` |
| Operator grant orchestrator | `lib/approvals/operator-grant-extra-revision.ts` |
| Package composer (extend) | `lib/approvals/compose-approval-package.ts` |
| Forbidden keys (extend) | `lib/approvals/find-forbidden-approval-keys.ts` |
| Migration | `supabase/migrations/20260831040000_neuramark_approvals_revision.sql` |
| Upstream invoker extend | `lib/contracts/reel-script.ts`, `reel-caption.ts`, `qa-report.ts` |

---

## Security tests (minimum — US-11.2 additions)

1. Concurrent double `request_changes` → only one `revision_count` increment  
2. Second round without grant → **`REVISION_LIMIT_EXCEEDED`**  
3. Operator grant → one extra round → grant consumed on successful request_changes  
4. Smuggled `revision_count` / `extra_revision_granted` / nested forbidden keys → **`FORBIDDEN_FIELDS`**  
5. `request_changes` from `changes_requested` → **`INVALID_TRANSITION`**  
6. Gate not ready on request_changes → no write  
7. Notes > 500 / empty tags → **`VALIDATION_ERROR`**  
8. `changeRequest` required when `request_changes`; forbidden on approve/reject  
9. Operator grant Cliente → 403; foreign grant → 404  
10. Delimiter present in script/caption prompt when revision notes non-empty  
11. Rate limits on decide (includes request_changes) + operator grant  
12. Approve/reject regression unchanged  
13. Grep — closed write surface for revision columns  

---

## Non-goals (explicit)

| Out | Owner |
|-----|-------|
| US-11.3 ready-to-publish / download polish | US-11.3 |
| Unlimited revision loops | Forbidden |
| Cliente-direct regen actions | Forbidden |
| Separate `requestApprovalChanges` action | Forbidden |
| Decided history on `/approvals` list | Unchanged |
| Full operator revision dashboard | Backlog Phase B |

---

## Open items needing FE signoff

1. **Request changes form UX** — tag checkboxes, per-tag notes, optional summary, submit disabled until ≥1 tag.  
2. **Revisions remaining copy** — use `revisionsRemaining` / `maxRevisionRounds` from DTO (`approvals.revision.remaining`).  
3. **Limit exceeded state** — hide Request changes; show `approvals.revision.limitExceeded` escalation.  
4. **`changes_requested` waiting state** — read-only detail; no decide CTAs; `approvals.revision.waiting`.  
5. **Error mapping** — `REVISION_LIMIT_EXCEEDED`, extended validation fields on `changeRequest`.  
6. **Optional `changeRequestHistory`** — minimum AC needs `lastChangeRequest` + counts; full history list is nice-to-have Phase A.  
7. **Operator grant UI** — action-only V1 acceptable; confirm no Cliente exposure of grant flag as self-serve bypass.

---

## Reviewed by FE

**Reviewed by FE:** pending — nextjs-frontend.

---

**Frozen by:** nextjs-backend — 2026-08-30  
**Zod mirrors:** `lib/contracts/approval.ts` · `lib/contracts/approval-revision.ts`
