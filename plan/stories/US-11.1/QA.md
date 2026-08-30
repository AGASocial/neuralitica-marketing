# QA Report — US-11.1 Present Reel package for client approval

**Branch:** `feature/US-11.1-client-approval`  
**BUILD commits reviewed:** BE `d830b0f` · FE `defd9ff`  
**Validation:** PASS WITH NOTES — `plan/stories/US-11.1/VALIDATION.md` @ `633c6f5` (25/25)  
**CONTRACT:** `plan/stories/US-11.1/CONTRACT.md` (frozen, FE-reviewed)  
**SECURITY:** `plan/stories/US-11.1/SECURITY.md` (APPROVE WITH CONDITIONS)  
**Reviewer:** qa-engineer  
**Date:** 2026-08-30

### Verdict: APPROVE WITH CONDITIONS

Phase A ships Cliente Aprobación: `neuramark_approvals` DDL + RLS zero policies, ensure/list/get/decide Server Actions, gate re-check on **create and decide**, pointer-only inputs (no client `qaPassed` / `ready`), IDOR → **404**, Cliente `assembled_reel` media serve only, Approve/Reject only (no `changes_requested` write), feedback trim **0–500**. `/approvals` list + package preview FE. No Critical, High, or Medium findings.

**Close recommendation (Phase A): YES** — close US-11.1 Phase A. Soft Low follow-ups below are not merge blockers. Request-changes / `changes_requested` remain **US-11.2**. Ready-to-publish list / download polish remain **US-11.3**.

---

## Focus control verification

| Focus control | Status | Evidence |
|---------------|--------|----------|
| **Gate re-check on ensure + decide** | **PASS** | Ensure calls `getQaGateStatusForAssembledReel(assembledReelId)` before INSERT (`lib/approvals/ensure-approval-package.ts:96–98`); decide calls same with `approval.assembledReelId` before UPDATE (`decide-approval.ts:84–89`). `ready !== true` → `QA_GATE_NOT_READY`, no write. Tests: ungated ensure / ungated decide. Source purity: both call helper (`approvals.test.ts`). |
| **IDOR → 404** | **PASS** | Loads scoped `.eq("client_id", …)` (`persist-approval.ts:72–74, 95–97, 117–118, 204–206`). Assembly via `loadAssemblyJobScoped`. Miss → `NOT_FOUND`. Tests: foreign `assembledReelId` / `approvalId` / get. Media foreign `assembled_reel` → 404 (`media-assets.test.ts` US-11.1). |
| **No client `passed` / `ready`** | **PASS** | `FORBIDDEN_APPROVAL_AUTHORITY_KEYS` + `findForbiddenApprovalKeys` + Zod `.strict()` (`lib/contracts/approval.ts:36–152`). Ensure `{ assembledReelId }`; decide `{ approvalId, decision, clientFeedback? }`. Gate helper `import "server-only"`; single string arg; DB-only (`get-qa-gate-status-for-assembled-reel.ts`). FE decide payload has no readiness keys (`ApprovalPackageView.tsx:164–169`). Tests: smuggle → `FORBIDDEN_FIELDS`. |
| **Cliente `assembled_reel` serve only** | **PASS** | Route: Cliente `requireActive` + ownership, then Operator (`route.ts:218–261`). `generated_video` / `voiceover` remain Operator-only (blocks before assembled widen). `previewUrl` = `/api/media/assets/{uuid}` only (`caption-preview.ts:16–17`). `Cache-Control: private, no-store`. Tests: own 200 + foreign 404; source matrix assert. |
| **Approve / reject only** | **PASS** | `approvalDecisionSchema` = `approved` \| `rejected` (`approval.ts:31–32`). Decide never writes `changes_requested`. UPDATE `.eq("status", "pending_client")` (`persist-approval.ts:206`). FE: Approve + Reject only; no request-changes control. Tests: `changes_requested` Zod reject; double-decide → `INVALID_TRANSITION`. |
| **Feedback length 0–500** | **PASS** | Zod trim + max 500 → empty/`undefined` (`approval.ts:109–118`). Orchestrator stores NULL on approve or empty reject (`decide-approval.ts:91–92`). DB CHECK `char_length ≤ 500`. FE `feedbackTooLong` blocks submit; server remains authority. Test: feedback `> 500` → `VALIDATION_ERROR`. |

---

## Findings

### Low

| # | Severity | Location | Issue | Why it matters | Recommended fix |
|---|----------|----------|-------|----------------|-----------------|
| 1 | **Low** | `lib/approvals/check-approval-rate-limit.ts:50–56` · ensure/decide orchestrators | Rate-limit window read errors fail **open**; `recordApprovalAttempt` runs only after successful ensure/decide. Matches house QA override/run pattern. | Transient DB errors briefly waive the soft cap; rejected attempts (ungated, IDOR, validation) do not consume the window. Authenticated Cliente, no LLM. | Accept as house consistency, or fail closed / count attempts earlier in a shared rate-limit hardening story. |
| 2 | **Low** | `components/approvals/ApprovalPackageView.tsx:460` | Textarea `maxLength={APPROVAL_FEEDBACK_MAX_LENGTH + 50}` while counter/submit guard use 500. | Soft UX buffer; client blocks submit when too long; Zod still rejects `> 500`. Not a trust-boundary bypass. | Set `maxLength` to 500 for alignment, or document intentional paste buffer. |
| 3 | **Low** | Media serve tests vs CONTRACT § Security tests | No dedicated HTTP case that Cliente is denied `generated_video` / `voiceover` after the widen. Operator-only branches + source-order assert cover intent; US-11.1 own/foreign `assembled_reel` HTTP cases pass. | Future route edits could accidentally widen those types without a failing Cliente-role assert. | Add Cliente-role deny cases (P1 backlog; VALIDATION already noted). |
| 4 | **Low** | `lib/approvals/approvals.test.ts` (dynamic `require`) | ESLint `@typescript-eslint/no-require-imports` on Server Action mock injection (13 sites). | Lint noise in test slice; established tsx mock pattern (US-10.x). No runtime/security impact. Production approval modules eslint clean. | Accept as test-pattern debt or switch to dynamic `import()` with cache busting. |

### Informational (non-blocking)

| Topic | Status | Notes |
|-------|--------|-------|
| US-11.2 request-changes | **Deferred by design** | No `changes_requested` write; no FE control. Correct Phase A scope. |
| US-11.3 ready/download | **Deferred by design** | Approve may set `approved` here; queue/download UX = US-11.3. |
| Mobile AC | **Layout evidence only** | Responsive `maxWidth` / `playsInline` / flex-wrap — no device-lab (VALIDATION note). |
| Media suite flake | **Out of scope** | `deletes own asset…` fails in `media-assets.test.ts` (pre-existing avatar delete); US-11.1 serve cases pass. |
| Hardcoded local user | **Sanctioned** | `getCurrentUser()` interim per AGENTS.md — not a finding. |
| UI gate disable | **OK** | `gateBlocksApprove` is presentation only; server re-checks gate on decide. |
| XSS | **PASS** | Caption / hashtags / override reasons / feedback as React text / PrimeReact — no `dangerouslySetInnerHTML` under `components/approvals`. |
| Closed write surface | **PASS** | Only ensure INSERT `pending_client` + decide UPDATE approve/reject; zero approval Route Handlers. |

---

## Security control verification (broader)

| Control | Status | Evidence |
|---------|--------|----------|
| `requireActive("handler")` first | **PASS** | ensure/list/get/decide actions; source ordering tests |
| Assembly + branding + CTA on ensure | **PASS** | Orchestrator + tests (`ASSEMBLY_NOT_READY` / `BRANDING_REQUIRED` / `CAPTION_CTA_NOT_SELECTED`) |
| Actor / tenancy from session | **PASS** | `client_id` / `decided_by` from `user.id`; never body |
| Package DTO minimal | **PASS** | Authenticated `previewUrl`; qaOverrides read-only; no `storage_key` / cost / LLM (happy-path assert) |
| DDL + RLS zero policies + `neuramark_` | **PASS** | `20260831030000_neuramark_approvals.sql` + migration test |
| No browser Supabase on approvals FE | **PASS** | Server Actions + contracts only |
| Rate limit keys | **PASS (code)** | `approval_ensure` / `approval_decide`; decide over-limit test |

---

## Checks run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/approvals/approvals.test.ts` | **25 pass / 0 fail** |
| `npx tsx --test lib/media/media-assets.test.ts` | **22 pass / 1 fail** (unrelated avatar delete; US-11.1 serve 2/2 pass) |
| `npx eslint` on approval production modules + `ApprovalPackageView.tsx` | **Clean** (0 issues) |
| `npx tsc --noEmit` | Pre-existing noise in unrelated `*.test.ts` files — not US-11.1 production blockers |
| Manual code review | Gate ensure+decide, forbidden keys, persist scoping, media matrix, FE decide path, migration |

---

## What was not covered

- Live browser / device-lab smoke of `/approvals` (video play, EN/ES, mobile viewport).
- Live Supabase integration against a real multi-tenant DB (tests use mocks + source greps).
- Dedicated Cliente HTTP deny for `generated_video` / `voiceover` (Finding 3).
- Concurrent race load beyond optimistic `pending_client` UPDATE filter (code handles unique race on ensure + null update on decide).

---

## Close recommendation

**YES — CLOSE US-11.1 Phase A.**

PO may check off USER_STORIES § US-11.1 AC (Phase A: approve/reject; request-changes deferred to US-11.2). Soft Low items are backlog hygiene, not merge blockers.
