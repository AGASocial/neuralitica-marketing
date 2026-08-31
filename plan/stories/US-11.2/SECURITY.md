# Security Design Review — US-11.2

**Story:** US-11.2 — Request controlled revision round  
**Date:** 2026-08-30  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-11.2 AC + `[SEC]`), `plan/SECURITY_BASELINE.md` (§8 prompt-injection, Top 5 #2 approval-gate bypass), `plan/stories/US-11.2/README.md` + `TASKS.md` (PREP 2026-08-30), `plan/stories/US-11.1/SECURITY.md` + `CONTRACT.md`, `plan/stories/US-4.1/SECURITY.md` (delimiter pattern), `lib/approvals/decide-approval.ts`, `lib/approvals/persist-approval.ts`, `lib/contracts/approval.ts`, `lib/agents/content/generate-reel-script.ts` (`wrapUntrusted`)  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.  
**Primary implementers:** **nextjs-backend** (DDL, extend `decideApproval`, atomic persist, router, requeue, operator grant, security tests). **nextjs-frontend** (change-request form, revisions remaining — presentation only). **content-agents-engineer** (delimited notes in script/caption regen prompts). **media-pipeline-engineer** (assembly/branding/QA enqueue + completion → requeue hook). **No** integrations · **No** Cliente-direct regen actions.

---

## Verdict: APPROVE WITH CONDITIONS

The story correctly extends US-11.1’s closed **`decideApproval`** surface instead of opening a parallel Cliente mutation — preserving **`requireActive`**, gate re-check, forbidden-key scan, IDOR → **404**, and **`approval_decide`** rate limiting. Atomic **`revision_count`** increment + limit check in a single conditional UPDATE closes the concurrent round-bypass class. Change-request text is explicitly **untrusted prompt fuel** with US-4.1-style delimiters before any LLM call. Downstream routing stays **server-only** (`routeApprovalChangeRequest`, `requeueApprovalAfterRevision`); Cliente never enqueues script/caption/assembly/branding jobs.

No **REDESIGN**. No veto of PO freezes #1–#15 in PREP README. Orchestrator may proceed to **CONTRACT.md** after freezing the items below.

**Inherited floors (US-11.1 / US-4.1 / US-10.1 / US-14.5 / SECURITY_BASELINE — do not weaken):** `requireActive("handler")` first on Cliente decide; gate helper DB-only on create **and** decide; forbidden authority keys at decide top level; foreign `approvalId` → **404**; RLS deny-by-default; service-role Node only; no browser Supabase; interim hardcoded user sanctioned — not a finding.

**This story owns:** DDL columns `revision_count`, `change_requests`, `extra_revision_granted`; extend `decideApproval` with `request_changes` + `changeRequest`; atomic limit persist; `REVISION_LIMIT_EXCEEDED`; `operatorGrantExtraRevision`; server-only router + requeue; package DTO revision fields; prompt-injection containment for Cliente notes in script/caption agents; security tests for atomic limit, IDOR, forbidden smuggle, prompt delimiters, operator grant, rate limits.

**This story does not own:** US-11.3 ready-to-publish / download polish; unlimited revision loops; Cliente-direct regen Server Actions; decided-history list; RBAC beyond `requireActive` / `requireOperator`; auth redesign; new Cliente HTTP routes beyond extended decide.

**Terminology:** **Aprobación** · **pedir cambios** · **ronda de revisión** · **Paquete** · **Cliente** · **Operator** · **Ensamblado**. Technical names `request_changes`, `changes_requested`, `revision_count`, `changeRequest`, `routeApprovalChangeRequest` are canonical. Do not expose pipeline job controls as Cliente capabilities.

---

### Threat Summary (US-11.2–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Read-then-write revision limit (TOCTOU)** | Concurrent/replayed `request_changes` exceeds V1 max rounds | Single conditional UPDATE: increment + status write only when `status = pending_client` AND `(revision_count < max OR extra_revision_granted)`; 0 rows → typed error; concurrent test required |
| **Client-supplied `revision_count` / `extra_revision_granted` / `change_requests`** | Forge unlimited rounds or pre-fill audit | Top-level forbidden keys (US-11.1 list + `extra_revision_granted`); server appends `change_requests` round object; count from DB only |
| **Parallel `requestApprovalChanges` Server Action** | Split abuse surface; skip shared rate limit / gate | **Extend `decideApproval` only** — no second Cliente mutation for same row (PO freeze #1) |
| **IDOR on `decideApproval` / `operatorGrantExtraRevision`** | Cross-tenant change request or operator grant | Cliente decide: load `WHERE id AND client_id = session.id`; Operator grant: `requireOperator` + load approval by id scoped to **`operator.id` as `client_id`** (house pattern); foreign → **404** |
| **Decide from `changes_requested` or skip requeue** | Double pipeline trigger / stale package review | State machine: Cliente decide only from `pending_client`; `changes_requested` → `pending_client` **server-only** via `requeueApprovalAfterRevision` |
| **Prompt injection via change notes** | Cliente steers script/caption agents (“ignore instructions”, exfil, harmful content) | Trim + length cap before persist; wrap in **`<UNTRUSTED_CLIENT_CHANGE_REQUEST>`** with non-instruction framing; agent output still Zod-gated; notes never executed as instructions |
| **Oversized change text** | Storage / token DoS / prompt bloat | Per-tag + summary: trim, **0–500** each (empty → omit); reject over-max at Zod |
| **Cliente triggers assembly/script/caption jobs directly** | Scope creep; bypass revision accounting | Router invokes existing **server-only** orchestrators with `revisionContext` — **no** new Cliente-callable regen endpoints |
| **Smuggle routing flags in `changeRequest`** | Enqueue QA bypass or full pipeline from caption-only tag | Tags enum + `.strict()` payload; expansion table computed **server-side** only; union = maximal path per PO #4 |
| **Operator grant without audit / spam** | Undocumented extra rounds | Grant requires `reason` trim **1–500**; append operator audit entry; dedicated rate-limit key |
| **Self-serve extra rounds via `extra_revision_granted` in body** | Unlimited Cliente revisions | Field server-writable only via `operatorGrantExtraRevision`; one-shot consumed on next successful `request_changes` |
| **Skip gate on request-changes** | Ungated package re-enters revision loop | Same `getQaGateStatusForAssembledReel` re-check as approve/reject before UPDATE |
| **XSS via change notes on detail** | Script on `/approvals` | Plain text / React text / PrimeReact only — **no** `dangerouslySetInnerHTML` |
| **Spam `request_changes`** | Noise / pipeline cost | Reuse **`approval_decide`** rate limit (PO #15); UI debounce not a control |

**Residual risk accepted:** Cliente may request one tagged revision round per Reel (product intent); operator may grant one extra via audited action. Caption-only path may skip QA re-run when gate still ready (PO #9) — media path must invalidate/re-run QA. Semantic prompt-injection inside delimiters is bounded by schema + delimiter layer (same residual as US-4.1/6.1). Hardcoded local user until auth universal is sanctioned.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| `neuramark_approvals.revision_count` | **Highest** — round limit authority | Server increment in conditional UPDATE only; never from request |
| `neuramark_approvals.change_requests` | **High** — audit + prompt source | Append-only server-built rounds; Cliente supplies tags + notes only |
| `neuramark_approvals.extra_revision_granted` | **High** — one-shot override | Operator grant action only; consumed on successful `request_changes` |
| `neuramark_approvals.status` (`changes_requested`) | **Highest** — pipeline gate | Cliente write: `pending_client` → `changes_requested` via decide only; requeue server-only |
| Change-request note text | **High** — LLM prompt fuel (untrusted) | Length-capped; delimited in agents; validated before job enqueue |
| Gate readiness | **Highest** — same as US-11.1 | DB-only helper on decide; never request flags |
| Operator grant `reason` | Medium — audit | Trim 1–500; plain text; operator actor from session |

**Boundaries:**

1. **Browser (Cliente) → `decideApproval` with `request_changes`** — Untrusted: `approvalId`, `decision`, `changeRequest` (strict shape). **`requireActive("handler")` first**. Gate + tenancy + atomic limit server-side.
2. **Browser (Cliente) → change-request form** — Presentation only; hidden/disabled Request changes is **not** a control.
3. **Browser (Operator) → `operatorGrantExtraRevision`** — Untrusted: `{ approvalId, reason }` only. **`requireOperator("handler")` first**. No Cliente path.
4. **`decideApprovalForClient` → `routeApprovalChangeRequest`** — Trusted server import after successful persist; **not** exported as Cliente Server Action.
5. **Pipeline completion → `requeueApprovalAfterRevision`** — Trusted server hook only; Cliente cannot invoke.
6. **Router → script/caption/assembly/branding orchestrators** — Server-only; `revisionContext` built from persisted round + delimited notes — never from raw HTTP beyond decide.

---

## Abuse Cases Considered

- *As a malicious Cliente, I POST two concurrent `request_changes` when one round remains* → **Blocked:** only one UPDATE succeeds with `revision_count < max`; second gets **`REVISION_LIMIT_EXCEEDED`** or **`INVALID_TRANSITION`** after re-read — never count = 2.
- *As a malicious Cliente, I POST `{ revision_count: 0, extra_revision_granted: true }`* → **Blocked:** top-level **`FORBIDDEN_FIELDS`**.
- *As a malicious Cliente, I POST `{ changeRequest: { tags: ["script"], revision_count: 0 } }`* → **Blocked:** nested forbidden-key scan or Zod `.strict()` rejection.
- *As a malicious Cliente, I POST `{ decision: "request_changes", changeRequest: { tags: [] } }`* → **Blocked:** validation — **≥1** tag required.
- *As a malicious Cliente, I POST 600-char notes* → **Blocked:** Zod max **500** per field after trim.
- *As a malicious Cliente, I PUT injection text in notes* → **Contained:** delimited untrusted block in LLM prompts; system instructions outside; output schema unchanged.
- *As a malicious Cliente, I decide on `{ approvalId: "<victim>" }`* → **Blocked:** scoped load → **404**.
- *As a malicious Cliente, I POST `request_changes` while `status = changes_requested`* → **Blocked:** **`INVALID_TRANSITION`**.
- *As a malicious Cliente, I call `operatorGrantExtraRevision`* → **Blocked:** **`requireOperator`** → 403.
- *As a malicious Cliente, I call `regenerateReelScriptSlot` with forged `revisionContext`* → **Out of scope / blocked:** regen actions remain Operator/server-router callers only; revision context not accepted from browser on those actions in this story.
- *As a malicious Cliente, I POST `{ qaPassed: true }` on decide* → **Blocked:** inherited US-11.1 forbidden keys.
- *As a malicious Cliente, I request `caption` tag but smuggle `{ enqueueAssembly: true }`* → **Blocked:** strict `changeRequest`; routing from tags only.
- *As an Operator, I grant extra revision on foreign `approvalId`* → **Blocked:** load scoped by operator tenancy → **404**.
- *As a malicious actor, I spam operator grants* → **Bounded:** dedicated rate-limit key (see criteria).

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-11.2 are binding. Items marked **(added)** extend the story for testable enforcement. Do not drop or weaken US-11.1 `[SEC]` rows.

**Inherited (US-11.1 — still binding on extended decide):**

- [ ] **[SEC] Gate re-checked on decide** — `getQaGateStatusForAssembledReel` → `ready === true` before any status write including `request_changes`; ungated → **`QA_GATE_NOT_READY`**
- [ ] **[SEC] Approval lookups scoped to current client** — foreign `approvalId` → **404**
- [ ] **[SEC] `requireActive("handler")` first** on Cliente `decideApproval`
- [ ] **[SEC] Forbidden authority keys** — no client `qaPassed` / `ready` / `status` / `decidedBy` / `clientId` smuggle on decide
- [ ] **[SEC] Rate limit `approval_decide`** — includes `request_changes` attempts

**US-11.2 story `[SEC]` (USER_STORIES.md):**

- [ ] **[SEC] Revision limit enforced server-side atomically (increment + check in one transaction); concurrent or replayed change requests cannot exceed the round limit**
- [ ] **[SEC] Change-request text validated (length cap) and treated as data through the pipeline — including when injected into agent prompts (same prompt-injection containment as US-4.1)**

**Added in this review (binding for US-11.2 BUILD):**

- [ ] **[SEC] (added) Atomic persist — single conditional UPDATE:** `UPDATE neuramark_approvals SET status = 'changes_requested', revision_count = revision_count + 1, change_requests = change_requests || $newRound::jsonb, client_feedback = $summary, decided_at = now(), decided_by = $session, extra_revision_granted = CASE WHEN extra_revision_granted THEN false ELSE extra_revision_granted END WHERE id = $id AND client_id = $session AND status = 'pending_client' AND (revision_count < $max OR extra_revision_granted = true) RETURNING *`. **No** read-count-then-write. On 0 rows: re-read row; if `revision_count >= max` and not grant → **`REVISION_LIMIT_EXCEEDED`**; else **`INVALID_TRANSITION`**
- [ ] **[SEC] (added) Max rounds authority:** `APPROVAL_MAX_CLIENT_REVISION_ROUNDS` server constant (default **1**; env override for staging only — CONTRACT names var). DTO exposes `maxRevisionRounds` from server constant — never from request
- [ ] **[SEC] (added) Decide input extension — pointer-only:** `{ approvalId, decision: 'approved' | 'rejected' | 'request_changes', clientFeedback?, changeRequest? }` `.strict()`. When `decision === 'request_changes'`: `changeRequest` **required**; when `approved` \| `rejected`: `changeRequest` **must be absent** (validation error if present)
- [ ] **[SEC] (added) `changeRequest` schema (strict):** `{ tags: ('script'|'caption'|'assembly'|'branding')[], notesByTag?: Partial<Record<tag, string>>, summary?: string }` — **≥1** unique tag; `notesByTag` keys ⊆ selected tags; each note + `summary`: trim, length **0–500** (empty → omit). Reject unknown tags, duplicate-only empty tags, nested objects, arrays in notes
- [ ] **[SEC] (added) Forbidden keys — extend top-level decide scan:** add **`extra_revision_granted`**, **`extraRevisionGranted`**, **`changeRequest` nested authority scan** (recurse one level: reject any key matching `FORBIDDEN_APPROVAL_AUTHORITY_KEYS` inside `changeRequest` / `notesByTag`). Top-level **`change_requests`**, **`revision_count`**, **`revisionCount`**, **`status`**, **`changes_requested`** remain forbidden. **`changeRequest` allowed** only as structured companion to `request_changes`
- [ ] **[SEC] (added) Append-only `change_requests`:** server constructs round object `{ round: revision_count after increment, tags, notesByTag, summary, decidedAt, decidedBy }` — Cliente never sends round index, timestamps, or actor ids inside `changeRequest`
- [ ] **[SEC] (added) State machine (Cliente writes):** `pending_client` → `request_changes` → **`changes_requested`**; `pending_client` → `approved` \| `rejected` (US-11.1 unchanged). **Forbidden Cliente writes:** from `changes_requested`; from `approved` / `rejected`; double `request_changes` without requeue
- [ ] **[SEC] (added) Requeue authority:** `requeueApprovalAfterRevision` is **`import "server-only"`** — sets `changes_requested` → `pending_client`, clears `decided_at` / `decided_by`; **no** Cliente Server Action export
- [ ] **[SEC] (added) Router authority:** `routeApprovalChangeRequest` is **`import "server-only"`** — invoked only after successful `request_changes` persist; resolves `assembled_reel_id` from owned approval row; tag expansion per PO #4; **never** accepts Cliente HTTP
- [ ] **[SEC] (added) Operator grant — `operatorGrantExtraRevision({ approvalId, reason })`:** `requireOperator("handler")` first; input `.strict()` `{ approvalId, reason }` only; `reason` trim **1–500**; load approval **`WHERE id = $approvalId AND client_id = $operator.id`** — miss → **404**; UPDATE `extra_revision_granted = true` + append operator audit entry (CONTRACT shape); **no** increment of `revision_count` on grant; Cliente cannot read grant as self-serve flag to bypass UI
- [ ] **[SEC] (added) One-shot grant consumption:** on successful `request_changes` when `extra_revision_granted` was true, persist layer sets **`extra_revision_granted = false`** in same atomic UPDATE as increment
- [ ] **[SEC] (added) Prompt-injection containment:** export/use constant **`UNTRUSTED_CLIENT_CHANGE_REQUEST`** tag (or CONTRACT alias); wrap all Cliente note text via same `wrapUntrusted(tag, payload)` pattern as `lib/agents/content/generate-reel-script.ts`; system/developer instructions **outside** delimiters state content is untrusted data, not instructions; pass delimited blob in server-built `revisionContext` only — **never** concatenate raw notes into system prompt
- [ ] **[SEC] (added) Agent path hygiene:** script/caption regen entrypoints accept optional **`revisionContext`** from router only; malformed agent output still rejected before persist (no relaxation); grep/tests assert delimiter presence when revision notes non-empty
- [ ] **[SEC] (added) Rate limit — operator grant:** new key **`approval_operator_grant`** (CONTRACT exact) — reuse `neuramark_agent_rate_limits` table; default **10 / 60 min** per operator `client_id`; over-limit → **429**, no write. **`request_changes` reuses `approval_decide`** — do not waive
- [ ] **[SEC] (added) In-flight guard:** when `status = 'changes_requested'`, router/pipeline must not double-enqueue duplicate revision jobs for same approval (CONTRACT defines idempotency — e.g. skip router if already in-flight unless explicit operator retry story)
- [ ] **[SEC] (added) Package DTO revision fields (read-only):** `revisionCount`, `maxRevisionRounds`, `extraRevisionGranted`, optional `lastChangeRequest` / history slice — **no** writable grant flag; computed server-side
- [ ] **[SEC] (added) XSS:** change-request notes, summary, operator grant reason rendered as plain text only
- [ ] **[SEC] (added) DDL:** ALTER `neuramark_approvals` add `revision_count integer NOT NULL DEFAULT 0 CHECK (revision_count >= 0)`, `change_requests jsonb NOT NULL DEFAULT '[]'::jsonb`, `extra_revision_granted boolean NOT NULL DEFAULT false`; optional `CHECK (jsonb_typeof(change_requests) = 'array')`; RLS unchanged (enabled, zero policies)
- [ ] **[SEC] (added) Closed write surface for revision columns:** only `decide-approval` persist (request_changes), `operatorGrantExtraRevision`, and `requeueApprovalAfterRevision` may UPDATE `revision_count` / `change_requests` / `extra_revision_granted` / `changes_requested` ↔ `pending_client` transitions — grep test
- [ ] **[SEC] (added) Automated security tests cover at least:** concurrent double `request_changes` → only one increment; limit exceeded → **`REVISION_LIMIT_EXCEEDED`**; grant → one extra round → grant consumed; smuggled `revision_count` / `extra_revision_granted` / nested forbidden keys → **`FORBIDDEN_FIELDS`**; foreign `approvalId` → **404**; `request_changes` from `changes_requested` → **`INVALID_TRANSITION`**; gate not ready → no write; notes >500 rejected; `changeRequest` required/forbidden per decision; operator grant Cliente → 403; operator foreign grant → **404**; delimiter in script/caption prompt builder when notes present; rate limits on decide + operator grant; approve/reject paths unchanged (regression)

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Single decide surface — extend, do not fork (APPROVE — PO #1)

| Rule | Detail |
|---|---|
| Mutation | **`decideApproval`** adds `decision: "request_changes"` |
| Forbidden | Separate `requestApprovalChanges` Cliente Server Action in V1 |
| Shared controls | Same auth, gate re-check, forbidden scan, **`approval_decide`** rate limit |

#### 2. Atomic revision limit (APPROVE — PO #6)

| Rule | Detail |
|---|---|
| Pattern | One conditional UPDATE with increment + limit predicate |
| Anti-pattern | SELECT count → IF → UPDATE ( **REJECT** ) |
| Errors | **`REVISION_LIMIT_EXCEEDED`** vs **`INVALID_TRANSITION`** per re-read rule |
| Constant | `APPROVAL_MAX_CLIENT_REVISION_ROUNDS = 1` (env override documented) |

#### 3. `changeRequest` validation + forbidden keys (APPROVE — PO #3)

| Field | Rule |
|---|---|
| `tags` | Enum **≥1**; server dedupe |
| Notes | Per-tag + `summary`: trim **0–500** |
| `client_feedback` | Optional overall `summary` copied on request_changes (reject path unchanged) |
| Scan | Top-level + **one-level nested** forbidden authority keys inside `changeRequest` |

#### 4. State machine (APPROVE — PO #8–9)

```ts
// Cliente via decideApproval:
//   pending_client → approved | rejected | changes_requested (via request_changes)
//
// Server-only:
//   changes_requested → pending_client (requeueApprovalAfterRevision)
//
// Forbidden Cliente:
//   changes_requested → *
//   approved|rejected → *
```

#### 5. Operator one-shot grant (APPROVE — PO #7)

| Rule | Detail |
|---|---|
| Auth | `requireOperator("handler")` first |
| Input | `{ approvalId, reason }` strict; reason **1–500** |
| Tenancy | Load approval scoped to **`operator.id`** as `client_id` (house Operator pattern) |
| Effect | `extra_revision_granted = true` + audit append; consumed on next successful `request_changes` |
| UI | Cliente cannot self-grant; no Cliente endpoint sets grant flag |

#### 6. Prompt-injection containment (APPROVE — PO #11, US-4.1)

| Layer | Control |
|---|---|
| Persist | Zod length + trim before storage |
| Prompt | `<UNTRUSTED_CLIENT_CHANGE_REQUEST>…</UNTRUSTED_CLIENT_CHANGE_REQUEST>` via `wrapUntrusted` |
| Framing | System text: delimited blocks are **data**, not instructions |
| Output | Existing script/caption Zod gates — reject before persist |
| Anti-pattern | “Sanitize” meaning, execute notes, or place notes in system role |

#### 7. Downstream routing — server-only (APPROVE — PO #4)

| Module | Rule |
|---|---|
| `routeApprovalChangeRequest` | `import "server-only"`; tag → maximal expansion table |
| Cliente | **No** calls to script/caption/assembly/branding actions |
| `revisionContext` | Built server-side from persisted round + delimited notes |

#### 8. Rate limits (APPROVE WITH CONDITIONS — PO #15)

| Key | Surface |
|---|---|
| `approval_decide` | `approved` \| `rejected` \| **`request_changes`** |
| **`approval_operator_grant`** | **`operatorGrantExtraRevision` only** (added) |

**Condition:** CONTRACT freezes operator-grant limits; may tune numbers but must keep server enforcement.

#### 9. Gate re-check (APPROVE — PO #10)

Same hook as US-11.1 decide — **`QA_GATE_NOT_READY`** blocks `request_changes` write.

#### 10. List / detail UX security (APPROVE — PO #12–13)

| Rule | Detail |
|---|---|
| List | `pending_client` only — item leaves list after request_changes |
| Detail | `changes_requested` deep-link **read-only** — no decide CTAs |
| FE authority | Revisions remaining from DTO — not client-computed |

---

### Open questions — SECURITY resolutions

| # | Question (PREP) | Resolution |
|---|---|---|
| 1 | Wire name `request_changes` vs camelCase | **APPROVE `request_changes`** on wire; TS camelCase via transform OK if CONTRACT documents |
| 2 | Manual upload video on script revision | **APPROVE** “best-effort same modality” in CONTRACT — not a security bypass; no Cliente upload path added |
| 3 | Invalidate QA on media re-run | **APPROVE** new QA when assembly/branding/script path; caption-only may retain prior QA if gate still ready — publish must still re-check at ADR-0002 |
| 4 | Prior change-request history on detail | **APPROVE** read-only DTO slice; minimum `revisionCount` + last round — no Cliente edit of history |
| 5 | Operator grant FE | **APPROVE** action-only V1 — security tests cover action without FE |
| 6 | Nested forbidden-key scan depth | **APPROVE one level** into `changeRequest` / `notesByTag` — sufficient for authority smuggle; deep arbitrary JSON rejected by `.strict()` |

---

### Vetoes (would block BUILD)

| If implementers… | Verdict |
|---|---|
| Enforce revision limit with read-then-write (non-atomic) | **REJECT** |
| Accept client-writable `revision_count`, `change_requests`, `extra_revision_granted`, or body `status` | **REJECT** |
| Add separate Cliente Server Action for request-changes bypassing shared decide controls | **REJECT** |
| Skip gate re-check on `request_changes` | **REJECT** |
| Pass raw Cliente notes into LLM system prompt without delimiters | **REJECT** |
| Export `routeApprovalChangeRequest` or `requeueApprovalAfterRevision` as Cliente Server Actions | **REJECT** |
| Allow Cliente decide from `changes_requested` or without requeue | **REJECT** |
| Allow Cliente to call script/caption/assembly regen with `revisionContext` from browser | **REJECT** |
| Operator grant without `requireOperator` or with foreign approval → non-404 | **REJECT** |
| Skip rate limit on `operatorGrantExtraRevision` | **REJECT** |
| Weaken US-11.1 approve/reject forbidden keys or IDOR → 403 leak | **REJECT** |

None of the PO product defaults trigger a redesign veto.

---

## Future-Proofing Notes

- **US-11.3:** Publish queue still consumes `approved` only; revision loop must not create second approve path or unauthenticated download.
- **Multi-tenant Operator:** When Operator manages multiple clients, extend grant/load resolution via **server-side validated client context** — not raw POST `clientId` — without weakening 404 uniformity.
- **Env max rounds:** Staging override must not ship to production unintentionally; CONTRACT documents env var name + default **1**.
- **Do not** add Cliente-visible “force requeue”, pipeline cancel, or job-priority controls without a new SECURITY story.
- **Do not** store undelimited change notes in prompts, embeddings, or operator notifications without delimiter review.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-11.2/CONTRACT.md` is authored, verify before BUILD:

- [ ] Extended `decideApproval` schema + `changeRequestSchema` + `REVISION_LIMIT_EXCEEDED`
- [ ] Atomic UPDATE SQL / persist function signature frozen
- [ ] `APPROVAL_MAX_CLIENT_REVISION_ROUNDS` constant + env override name
- [ ] Forbidden keys + nested scan for `changeRequest`
- [ ] State machine + requeue + router server-only exports
- [ ] `operatorGrantExtraRevision` input, audit append, tenancy, rate key **`approval_operator_grant`**
- [ ] `UNTRUSTED_CLIENT_CHANGE_REQUEST` delimiter constant + `revisionContext` shape
- [ ] Tag expansion table (maximal union)
- [ ] Package DTO revision fields
- [ ] DDL ALTER migration
- [ ] Error codes + FE message keys
- [ ] Security test list from criteria above
- [ ] Non-goals: separate request-changes action, Cliente regen, unlimited rounds
- [ ] **Reviewed by FE** line before BUILD
- [ ] US-11.1 approve/reject backward compatibility preserved

---

## CONTRACT freeze list (binding summary)

1. **Decide surface:** extend `decideApproval` — `request_changes` + strict `changeRequest`; no parallel Cliente mutation.  
2. **Atomic limit:** single conditional UPDATE increment + check; **`REVISION_LIMIT_EXCEEDED`**.  
3. **Forbidden keys:** top-level + nested scan; server append-only `change_requests`.  
4. **Auth:** `requireActive` on decide; `requireOperator` on grant; IDOR → **404**.  
5. **Gate:** re-check on `request_changes` — DB-only helper.  
6. **Rate limits:** `approval_decide` includes request_changes; **`approval_operator_grant`** for operator grant.  
7. **Prompt safety:** `<UNTRUSTED_CLIENT_CHANGE_REQUEST>` + `wrapUntrusted`; notes never instructions.  
8. **Routing:** server-only router + requeue; no Cliente job triggers.  
9. **State machine:** Cliente only `pending_client` → `changes_requested`; requeue server-only.  
10. **Operator grant:** one-shot `extra_revision_granted` + audited reason.  
11. **DDL:** `revision_count`, `change_requests`, `extra_revision_granted`.  
12. **Tests:** concurrent limit, smuggle, IDOR, delimiters, grant, regression on approve/reject.

---

## Recommended action

**APPROVE WITH CONDITIONS.** Proceed to **CONTRACT.md** (nextjs-backend). Binding floors above must appear in CONTRACT before BUILD. FE signoff required after CONTRACT.

**CONTRACT may proceed:** **Yes.**

**Conditions (non-blocking for CONTRACT start):** CONTRACT must freeze atomic UPDATE, extended decide schema, nested forbidden-key scan, delimiter constant, operator-grant rate key, server-only router/requeue, state machine, DDL, and explicit BUILD vetoes.

---

## BUILD vetoes (summary)

1. Non-atomic revision limit enforcement.  
2. Client-writable revision authority fields.  
3. Parallel Cliente request-changes action outside `decideApproval`.  
4. Undelimited Cliente notes in LLM prompts.  
5. Cliente-callable router, requeue, or regen with revision context.  
6. Cliente decide from `changes_requested`.  
7. Operator grant without auth, audit, rate limit, or IDOR-safe 404.  
8. Skipping gate re-check on `request_changes`.
