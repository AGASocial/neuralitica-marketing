# Validation Report — US-11.2

**Story:** Request controlled revision round  
**Branch:** `feature/US-11.2-revision-round`  
**Gate:** VALIDATION — 2026-08-30  
**Validator:** requirements-validator  
**Contract:** `plan/stories/US-11.2/CONTRACT.md` (frozen 2026-08-30)  
**Tests:** `npx tsx --test lib/approvals/approvals.test.ts lib/approvals/approvals-revision.test.ts lib/approvals/revision/revision-pipeline.test.ts lib/agents/content/build-revision-context.test.ts lib/agents/content/generate-reel-script.test.ts lib/agents/content/generate-reel-caption.test.ts` → **105/105 pass**, 0 fail (~442 ms). No `npm test` script in `package.json`; repo convention is `tsx --test`.

---

### Verdict: PASS WITH NOTES

**AC score:** 5 / 5 acceptance criteria satisfied (2 with non-blocking test-coverage notes on [SEC] concurrent race simulation).

---

### Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| V1 max 1 client revision round per Reel (configurable) | **PASS** | Server default `APPROVAL_MAX_CLIENT_REVISION_ROUNDS_DEFAULT = 1` (`lib/contracts/approval-revision.ts:16`); env override via `getMaxRevisionRounds()` (`lib/approvals/get-max-revision-rounds.ts:11–22`). Atomic increment in `neuramark_update_approval_request_changes` RPC (`supabase/migrations/20260831040000_neuramark_approvals_revision.sql:18–54`). Package DTO exposes `revisionCount`, `maxRevisionRounds`, `revisionsRemaining` (`lib/approvals/compose-approval-package.ts:123–173`). FE displays remaining copy from DTO (`components/approvals/ApprovalPackageView.tsx:219–228,568–572`). |
| Exceeded limit requires operator intervention | **PASS** | Second round blocked with `REVISION_LIMIT_EXCEEDED` when `revisionCount >= max` and no grant (`lib/approvals/decide-approval.ts:126–136`; test `approvals-revision.test.ts` "limit exceeded → REVISION_LIMIT_EXCEEDED"). Operator path: `operatorGrantExtraRevision` Server Action with `requireOperator("handler")` first (`lib/approvals/actions/operator-grant-extra-revision.ts:27–37`) → sets `extra_revision_granted` via RPC (`persist-approval.ts:318–356`; migration `neuramark_grant_extra_revision`). FE hides Request changes and shows escalation copy (`ApprovalPackageView.tsx:227–229,588`; i18n `approvals.revision.limitExceeded` EN/ES `messages/en.json:404`, `messages/es.json:404`). Grant consumed atomically on next successful request_changes (`migration:42–45`). |
| Change request triggers only affected downstream steps | **PASS** | Tag expansion frozen in `computeRevisionRoutingPlan()` (`lib/contracts/approval-revision.ts:331–371`): script → full media chain; assembly/branding → shortened media; caption-only → `caption_regen` only. Unit tests: `approvals-revision.test.ts` (routing plan suite), `revision-pipeline.test.ts:18–47`. Router enqueues first step only via `routeApprovalChangeRequest` + `enqueueRevisionPipelineStep` (`lib/approvals/route-approval-change-request.ts:57–83`). Requeue hooks: caption-only → `requeueApprovalAfterRevision` in `generate-reel-captions-for-client.ts:487–494`; media → `tryRequeueAfterRevisionForAssembledReel` from `onBrandingCompleted` after QA (`lib/qa/on-branding-completed.ts:44–48`). Idempotency: `routingStartedAt` guard (`route-approval-change-request.ts:47–49`). |
| **[SEC] Revision limit enforced server-side atomically; concurrent/replayed requests cannot exceed limit** | **PASS** (note) | **Mechanism:** single conditional UPDATE in `neuramark_update_approval_request_changes` — increment + limit predicate + status guard in one statement; no read-then-write (`migration:29–53`; `persist-approval.ts:249–307` calls RPC). **Orchestrator:** 0-row UPDATE → re-read → `REVISION_LIMIT_EXCEEDED` vs `INVALID_TRANSITION` (`decide-approval.ts:126–137`). **Tests:** limit-exceeded path, migration asserts RPC exists (`approvals-revision.test.ts:271–282,353–416`), closed write surface grep (`632–644`). **Note:** CONTRACT security test #1 (concurrent double `request_changes` race simulation) is **not** implemented as an automated test; atomic SQL pattern is the binding mitigation and is present in migration + persist layer. Recommend QA add concurrent mock/RPC test in a follow-up — not a story AC blocker. |
| **[SEC] Change-request text validated (length cap) and treated as data in agent prompts (US-4.1 delimiters)** | **PASS** | Zod: `APPROVAL_CHANGE_NOTE_MAX_LENGTH = 500`, trim, ≥1 tag, `.strict()`, notesByTag keys ⊆ tags (`lib/contracts/approval-revision.ts:34–70`; `decideApprovalInputSchema` conditional rules in `lib/contracts/approval.ts`). Tests: empty tags, note >500, smuggled nested keys (`approvals-revision.test.ts` schema + forbidden suites). Delimiters: `UNTRUSTED_CLIENT_CHANGE_REQUEST_TAG` + `wrapUntrustedChangeRequestNote()` (`build-revision-context.ts:12–14,16–43`; `build-revision-context.test.ts`). Script/caption agents inject delimited revision context (`generate-reel-script.test.ts` "inject delimited revision context"; `generate-reel-caption.test.ts` same). Nested forbidden-key scan (`findForbiddenChangeRequestKeys` in `approval-revision.ts`; test `approvals-revision.test.ts:562–583`). |

---

### Convention Compliance

| Rule | Status | Evidence |
|------|--------|----------|
| EN + ES user-facing strings | **PASS** | `messages/en.json` and `messages/es.json` → `approvals.revision.*` (tags, remaining, waiting, limitExceeded, toast) + `approvals.errors.revisionLimitExceeded` (lines ~385–422). |
| Server Components default; minimal `"use client"` | **PASS** | Detail page RSC; `ApprovalPackageView.tsx` client island for form/mutation only (`"use client"` L1). |
| PrimeReact-first UI | **PASS** | `Checkbox`, `InputTextarea`, `Button`, `Message`, `Tag`, `Toast` in `ApprovalPackageView.tsx`. |
| Loading / empty / error / pending states | **PASS** | `pending` via `useTransition`; error map includes `REVISION_LIMIT_EXCEEDED`; waiting state for `changes_requested` (`ApprovalPackageView.tsx:391,329`; gate-disabled Request changes when `!gate.ready`). |
| Auth via Next.js backend; `getCurrentUser()` / `requireActive` | **PASS** | `decideApproval` action uses `requireActive("handler")` (US-11.1 pattern); operator grant uses `requireOperator("handler")`. No browser Supabase. |
| Endpoints serve concrete FE consumer | **PASS** | Extended `decideApproval` consumed by `/approvals/[approvalId]`; package DTO extended for revisions remaining. No speculative Cliente regen actions. |
| `neuramark_` DB prefix | **PASS** | Migration `20260831040000_neuramark_approvals_revision.sql`; RPCs `neuramark_update_approval_request_changes`, `neuramark_grant_extra_revision`, `neuramark_requeue_approval_after_revision`. |

---

### Gaps (what blocks PASS)

**None.** All five USER_STORIES § US-11.2 acceptance criteria are implemented with file-level evidence. Notes below are non-blocking.

---

### Partial Closures / Deferred Items

| Item | Status | Detail |
|------|--------|--------|
| TASKS.md BE checkbox "Wire requeue hook from caption-complete / branding/QA-complete" | **Implemented; TASKS stale** | Hooks exist: caption path `generate-reel-captions-for-client.ts:487–494`; media path `on-branding-completed.ts:44–48` + `try-requeue-after-revision.ts`. `revision-pipeline.test.ts` source-grep confirms wiring. TASKS.md L124 still `[ ]` — update at CLOSE. |
| Concurrent double-submit automated test | **Deferred test gap** | Atomic RPC satisfies [SEC] mechanism; no simulated race test in suite. |
| Operator grant → consume → second round E2E | **Partial test coverage** | Grant RPC + consume-in-UPDATE in migration; foreign grant → NOT_FOUND tested; full grant→requeue→request_changes→consume flow not orchestrator-tested. |
| Operator grant Cliente → 403 | **Source-only** | `requireOperator` on action; not covered by dedicated test in revision suite. |
| `changeRequestHistory` list UI | **Deferred Phase B** | Per CONTRACT — minimum `lastChangeRequest` + counts shipped (`compose-approval-package.ts:130–174`). |
| Operator grant UI | **Deferred Phase B** | Action-only V1 per CONTRACT; acceptable for AC. |
| Live Supabase E2E | **Not exercised** | Validation is code + unit/source tests; no live DB concurrent RPC run in this gate. |

---

### Scope Creep

**None identified.** Implementation stays within US-11.2 CONTRACT: extends `decideApproval`, revision columns, server-only router/requeue, operator grant, FE change-request form. No US-11.3 ready-to-publish/download, no unlimited loops, no separate Cliente regen actions, no Cliente-callable router/requeue exports.

---

### Recommended Next Actions

| Priority | Action | Owner |
|----------|--------|-------|
| 1 | **QA gate** — run security regression checklist from CONTRACT § Security tests (concurrent limit, grant consumption, operator 403). | qa-engineer |
| 2 | Add concurrent double `request_changes` mock test (two parallel decides, assert one increment). | nextjs-backend |
| 3 | Mark TASKS.md L124 requeue hook checkbox `[x]` at CLOSE. | product-owner |
| 4 | On PASS, product-owner checks USER_STORIES § US-11.2 AC boxes at CLOSE (not in VALIDATION). | product-owner |

---

### Test Summary

| Suite | Result |
|-------|--------|
| `lib/approvals/approvals.test.ts` | pass (US-11.1 regression + gate) |
| `lib/approvals/approvals-revision.test.ts` | pass (schema, orchestrator, migration, forbidden keys) |
| `lib/approvals/revision/revision-pipeline.test.ts` | pass (routing plan + pipeline wiring grep) |
| `lib/agents/content/build-revision-context.test.ts` | pass (delimiters) |
| `lib/agents/content/generate-reel-script.test.ts` | pass (revision prompt injection) |
| `lib/agents/content/generate-reel-caption.test.ts` | pass (revision prompt injection) |
| **Total** | **105 pass / 0 fail** |
