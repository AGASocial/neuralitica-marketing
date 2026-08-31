# QA Report — US-11.2 Request controlled revision round

**Story:** US-11.2 — Request controlled revision round  
**Branch:** `feature/US-11.2-revision-round`  
**Gate:** QA — 2026-08-30  
**Reviewer:** qa-engineer  
**Contract:** `plan/stories/US-11.2/CONTRACT.md` (frozen 2026-08-30)  
**Validation:** `plan/stories/US-11.2/VALIDATION.md` (PASS WITH NOTES)

---

### Verdict: APPROVE WITH CONDITIONS

**Severity counts:** Critical **0** · High **0** · Medium **3** · Low **5**

**Story closure recommendation:** **Yes** — ship Phase A. Atomic revision limit, auth/tenancy, forbidden-key scans, gate re-check, delimiter containment, and closed write surface meet the frozen CONTRACT and SECURITY bar. Medium findings are test-hardening and non-atomic routing metadata — not exploitable round-limit bypasses. Conditions below should land as follow-up hardening, not blockers.

---

### Findings

#### Medium

| # | Location | Issue | Why it matters | Fix direction |
|---|----------|-------|----------------|---------------|
| M1 | `lib/approvals/persist-approval.ts:359–404` · `lib/approvals/route-approval-change-request.ts:43–55` | **Routing idempotency uses read-then-write.** `markRevisionRoutingStarted` loads the row, checks `routingStartedAt`, then UPDATEs `change_requests` without an atomic predicate (unlike `neuramark_update_approval_request_changes`). | Two concurrent server-side router invocations for the same `{ approvalId, round }` could both pass the guard and double-enqueue pipeline steps. Does **not** bypass `revision_count` limit (Cliente cannot re-decide from `changes_requested`). Blast radius: duplicate jobs / cost, not extra revision rounds. | Add conditional UPDATE (e.g. `WHERE … AND NOT (change_requests @> … routingStartedAt …)`) or move `routingStartedAt` set into a single RPC with the persist/router entry. |
| M2 | `lib/approvals/approvals-revision.test.ts` (absent) | **CONTRACT security test #1 not automated:** concurrent double `request_changes` race simulation. | SECURITY.md and CONTRACT § Security tests require proof that only one increment wins under concurrency. Atomic SQL in migration is the binding mitigation; lack of test leaves regression risk if persist layer is refactored to read-then-write. | Add mock/RPC integration test: two parallel `decideApprovalForClient` calls when `revisionsRemaining === 1`; assert exactly one success and one `REVISION_LIMIT_EXCEEDED` or `INVALID_TRANSITION`. |
| M3 | `lib/approvals/check-approval-rate-limit.ts:53–59` | **Rate limit fail-open on DB error** — `windowError` → `{ ok: true }`. Applies to `approval_decide` (includes `request_changes`) and `approval_operator_grant`. | Inherited US-11.1 pattern. Supabase outage or query failure disables abuse throttling for decide/grant paths. | Fail closed (`RATE_LIMITED` or hard error) in production, or document as accepted residual; add test asserting fail-closed when rate table unreachable. |

#### Low

| # | Location | Issue | Why it matters | Fix direction |
|---|----------|-------|----------------|---------------|
| L1 | `lib/approvals/build-revision-context.ts:1–44` | **`import "server-only"` missing** on delimiter builder (sibling modules have it). | Today only imported from server-only callers (`route-approval-change-request.ts`, `revision-pipeline-seams.ts`, regen helpers). Accidental Client Component import would bundle wrap helpers without runtime guard. | Add `import "server-only"` at top of file. |
| L2 | `lib/approvals/actions/operator-grant-extra-revision.ts:27–37` · tests | **Operator grant Cliente → 403 not covered by automated test.** | `requireOperator("handler")` is first await (source-verified). Regression could expose grant to Cliente. | Add action-level test mirroring `approvals.test.ts` decide auth pattern: mock `requireOperator` throw 403 → `FORBIDDEN`. |
| L3 | `lib/approvals/operator-grant-extra-revision.ts:64–70` · tests | **`approval_operator_grant` rate limit not tested** in revision suite. | Decide rate limit tested in `approvals.test.ts`; operator grant key wired but unverified. | Add orchestrator test: mock `checkApprovalRateLimit` → `RATE_LIMITED`, assert no `grantExtraRevision` call. |
| L4 | `supabase/migrations/20260831040000_neuramark_approvals_revision.sql:42–45` · tests | **Grant consume → second round E2E not orchestrator-tested.** | SQL consumes `extra_revision_granted` in same UPDATE as increment; happy path for limit exceeded is tested, not grant-then-requeue-then-second-request. | Add integration/orchestrator test: grant → requeue mock → second `request_changes` succeeds → grant false. |
| L5 | `lib/approvals/decide-approval.ts:153–159` | **Routing errors swallowed after persist success** (CONTRACT-lean default). | Cliente sees success while pipeline may not enqueue; operational stuck `changes_requested` state, not a security bypass. | Accept per CONTRACT or surface soft `REVISION_ROUTING_FAILED` in a future story; ensure operator alerting on `[approvals] revision routing failed` logs. |

---

### Focus-area audit (requested)

| Focus | Result | Evidence |
|-------|--------|----------|
| **Atomic limit bypass** | **Pass** | Single conditional RPC `neuramark_update_approval_request_changes` (`supabase/migrations/20260831040000_neuramark_approvals_revision.sql:29–53`); orchestrator maps 0 rows → `REVISION_LIMIT_EXCEEDED` (`lib/approvals/decide-approval.ts:126–137`); test `approvals-revision.test.ts` "limit exceeded → REVISION_LIMIT_EXCEEDED". |
| **IDOR** | **Pass** | Scoped load `WHERE id AND client_id = session` (`lib/approvals/persist-approval.ts:93–98`); foreign → `NOT_FOUND` (`approvals.test.ts` "foreign approvalId"; `approvals-revision.test.ts` operator foreign grant). |
| **Prompt injection** | **Pass** | Zod 500-cap (`lib/contracts/approval-revision.ts:34–70`); `wrapUntrustedChangeRequestNote` + non-instruction framing (`lib/approvals/build-revision-context.ts:12–14`; `lib/agents/content/revision-prompt-sections.ts:10–11`); agent tests inject delimiters (`generate-reel-script.test.ts`, `generate-reel-caption.test.ts`). |
| **Forbidden keys smuggling** | **Pass** | Top-level + nested scan (`findForbiddenApprovalKeys`, `findForbiddenChangeRequestKeys`); tests for `revision_count`, `extraRevisionGranted`, nested `notesByTag.status` (`approvals-revision.test.ts`). |
| **Cliente calling server-only router** | **Pass** | `routeApprovalChangeRequest` / `requeueApprovalAfterRevision` use `import "server-only"`; not exported as Server Actions; FE calls only `decideApproval` (`components/approvals/ApprovalPackageView.tsx:13`); regen actions hardcode `invokedBy: "operator"` and reject `revisionContext` unless `invokedBy === "revision"` (`lib/reel-scripts/generate-reel-scripts-for-client.ts:115–137`). |
| **Rate limits** | **Pass with note (M3)** | `approval_decide` on all decide paths including `request_changes` (`lib/approvals/decide-approval.ts:90–96`); `approval_operator_grant` on grant (`lib/approvals/operator-grant-extra-revision.ts:64–70`); decide rate limit tested (`approvals.test.ts` "rate limited decide → RATE_LIMITED"). Fail-open on DB error noted as M3. |

---

### Security checklist (CONTRACT § Security tests)

| # | Test | Status |
|---|------|--------|
| 1 | Concurrent double `request_changes` → one increment | **Partial** — atomic SQL present; automated race test missing (M2) |
| 2 | Second round without grant → `REVISION_LIMIT_EXCEEDED` | **Pass** — `approvals-revision.test.ts` |
| 3 | Operator grant → extra round → grant consumed | **Partial** — migration SQL + foreign grant test; full E2E missing (L4) |
| 4 | Smuggled authority keys → `FORBIDDEN_FIELDS` | **Pass** — schema + orchestrator tests |
| 5 | `request_changes` from `changes_requested` → `INVALID_TRANSITION` | **Pass** — `approvals-revision.test.ts` |
| 6 | Gate not ready → no write | **Pass** — `approvals-revision.test.ts` |
| 7 | Notes >500 / empty tags → `VALIDATION_ERROR` | **Pass** — schema tests |
| 8 | `changeRequest` required/forbidden per decision | **Pass** — schema tests |
| 9 | Operator grant Cliente → 403; foreign → 404 | **Partial** — 404 tested; 403 source-only (L2) |
| 10 | Delimiter in script/caption prompts | **Pass** — agent + build-revision-context tests |
| 11 | Rate limits decide + operator grant | **Partial** — decide tested; grant + fail-open noted (L3, M3) |
| 12 | Approve/reject regression | **Pass** — `approvals.test.ts` |
| 13 | Closed write surface grep | **Pass** — `approvals-revision.test.ts` |

---

### Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/approvals/approvals.test.ts lib/approvals/approvals-revision.test.ts lib/approvals/revision/revision-pipeline.test.ts lib/agents/content/build-revision-context.test.ts lib/agents/content/generate-reel-script.test.ts lib/agents/content/generate-reel-caption.test.ts` | **105 pass / 0 fail** (~450 ms) |
| `npm run lint` | **Exit 1** — pre-existing repo-wide issues (operator pages, test `require()` style); no new lint errors in `components/approvals/ApprovalPackageView.tsx` or core revision orchestrators |
| `npx tsc --noEmit` | **Exit 0** on application sources; errors only in unrelated test files (video-jobs, visual-preferences) |
| Manual security review | CONTRACT.md, SECURITY.md, migration SQL, `decide-approval.ts`, `persist-approval.ts`, router/requeue, operator grant, FE mutation surface, regen invoke gates |

---

### What Was Not Covered

- Live Supabase concurrent RPC execution (two real parallel `neuramark_update_approval_request_changes` calls).
- Full pipeline E2E: request_changes → script/caption regen → branding/QA → requeue → second Cliente review in browser.
- Production auth (still hardcoded `getCurrentUser()` — sanctioned, not a finding).
- Operator grant UI (deferred Phase B — action-only V1 acceptable per CONTRACT).
- `npm run build` (not run — scope limited to story test suites per VALIDATION convention).

---

### Conditions for merge (non-blocking)

1. **M2** — Add concurrent double-submit test before next revision-limit refactor.
2. **M1** — Harden `routingStartedAt` write to atomic compare-and-set when media-pipeline load increases.
3. **L1–L4** — Backfill operator-grant auth/rate-limit and grant-consume tests in next backend hygiene pass.
4. **M3** — Track fail-open rate-limit behavior under SECURITY_BASELINE; align with US-11.1 if/when auth lands.

---

### Story closure

| Question | Answer |
|----------|--------|
| Close US-11.2? | **Yes** |
| Blockers? | **None** |
| Product-owner AC checkboxes | PO to check `USER_STORIES.md` § US-11.2 at CLOSE |
| TASKS.md L124 | Mark requeue hook `[x]` — VALIDATION confirms wiring in `generate-reel-captions-for-client.ts` and `on-branding-completed.ts` |
