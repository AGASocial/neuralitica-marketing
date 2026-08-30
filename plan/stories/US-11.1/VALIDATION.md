# Validation Report — US-11.1

**Story:** US-11.1 — Present Reel package for client approval  
**Phase:** A (package preview + approve / reject + [SEC] gate re-check + IDOR; request-changes = US-11.2; ready-to-publish / download polish = US-11.3)  
**Branch:** `feature/US-11.1-client-approval`  
**Validated against:** `plan/USER_STORIES.md` § US-11.1 · `CONTRACT.md` (FE signoff 2026-08-30) · `SECURITY.md` · BUILD commits BE `d830b0f` / FE `defd9ff`  
**Date:** 2026-08-30  
**Validator:** requirements-validator  
**Do not check off AC in USER_STORIES.md** (PO owns that on PASS).

### Verdict: PASS WITH NOTES

Phase A delivers frozen CONTRACT surfaces, SECURITY floors, Cliente `/approvals` list + package preview, Approve/Reject, `neuramark_approvals` DDL, gate re-check on ensure **and** decide, and `assembled_reel` media serve widen for the owning Cliente. Request-changes UI / `changes_requested` writes are correctly deferred to US-11.2.

**Tests:** `npx tsx --test lib/approvals/approvals.test.ts` → **25/25 pass**, 0 fail. Media US-11.1 cases in `lib/media/media-assets.test.ts` → both **PASS** (own `assembled_reel` 200 + foreign 404). Full media suite **22/23** (1 unrelated pre-existing delete failure — not a US-11.1 AC blocker).

**Phase A binding notes (CONTRACT § Phased BUILD / § USER_STORIES AC amendment):**

- FE owner-table “request changes” → **US-11.2** — not claimed closed.
- Approve may set `status = approved` here; US-11.3 owns ready-to-publish list + download UX.
- Mobile AC validated by responsive layout (`maxWidth`, `playsInline`, flex-wrap) — no device-lab run in this gate.

---

### Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Nothing reaches client without assembly complete + QA resolved | **PASS** | Ensure requires assembly `completed` + branding completed + branded output + `getQaGateStatusForAssembledReel` `ready === true` + selected CTA (`lib/approvals/ensure-approval-package.ts` 85–117). List batch-ensure uses the same orchestrator (`list-get-approvals.ts` 40–53). Tests: ungated ensure → `QA_GATE_NOT_READY`, no insert; CTA null → `CAPTION_CTA_NOT_SELECTED`. |
| Mobile-friendly preview | **PASS WITH NOTES** | Detail package column `maxWidth: 640px`, full-width `<video playsInline>`, flex-wrap CTAs (`ApprovalPackageView.tsx` 200–273, 420–425). List cards flex-wrap (`ApprovalsListView.tsx` 95–103). **Note:** layout evidence only — no physical-device lab. |
| AI disclosure visible when required | **PASS** | Package DTO sets `disclosure.required` from `mustDiscloseNotOwner` (`compose-approval-package.ts` 98–146). FE renders `GenericAvatarDisclosurePreview` `variant="approval"` when required (`ApprovalPackageView.tsx` 337–354). EN/ES `legal.genericAvatarDisclosure`. |
| **[SEC]** Gate re-checked on package create **and** decision; ungated decide rejected | **PASS** | Ensure: `getQaGateStatusForAssembledReel` before INSERT (`ensure-approval-package.ts` 96–98). Decide: same before UPDATE (`decide-approval.ts` 84–89). Tests: ungated ensure / ungated decide → `QA_GATE_NOT_READY`, no write; source purity asserts both call helper and never request flags (`approvals.test.ts`). |
| **[SEC]** Approval lookups scoped to current client; foreign ID → 404 | **PASS** | All loads `.eq("client_id", …)` (`persist-approval.ts` 73–117, 205). Foreign ensure/get/decide → `NOT_FOUND` tests. Media foreign `assembled_reel` → 404 (`media-assets.test.ts` US-11.1 case). |

---

### CONTRACT surfaces

| # | Surface | Status | Evidence |
|---|---------|--------|----------|
| 1 | `ensureApprovalPackageForAssembledReel` | **PASS** | Action `lib/approvals/actions/ensure-approval-package.ts` — `requireActive` first; revalidate list + detail. Orchestrator `ensure-approval-package.ts`. |
| 2 | `ensureApprovalPackageForAssembledReelForClient` | **PASS** | `import "server-only"`; forbidden → Zod → rate limit → scoped assembly → branding → gate → CTA → idempotent INSERT. |
| 3 | `listPendingApprovals` | **PASS** | Action + `listPendingApprovalsForClientUser` — batch-ensure (skip failures) + pending-only list (`list-get-approvals.ts` 35–66). FE: `app/(app)/approvals/page.tsx`. |
| 4 | `getApprovalPackage` | **PASS** | Action + scoped get + compose (`list-get-approvals.ts` 69–119). FE detail page. |
| 5 | `decideApproval` | **PASS** | Action + `decideApprovalForClient` — pending_client → approved\|rejected only; gate re-check; actor from session; never `changes_requested`. |
| 6 | Gate helper import | **PASS** | Ensure + decide + compose import `lib/qa/get-qa-gate-status-for-assembled-reel.ts` — no fork. |
| 7 | Media serve widen | **PASS** | `assembled_reel`: Cliente ownership then Operator (`route.ts` 218–261). `generated_video` / `voiceover` remain Operator-only (source order test). |
| 8 | Zod + types | **PASS** | `lib/contracts/approval.ts` mirrors CONTRACT; FE signoff present. |
| 9 | Migration | **PASS** | `supabase/migrations/20260831030000_neuramark_approvals.sql` — UNIQUE assembled reel, CHECK status incl. reserved `changes_requested`, RLS enable, zero policies, no `revision_count`. |
| 10 | `/approvals` + detail FE | **PASS** | List + detail RSC pages; client islands for video + decide; nav + dashboard CTA → `/approvals`. |

**Forbidden surfaces:** No request-changes control/copy; no Cliente override; no `qaPassed`/`ready` write authority; no public Storage URL in DTO (`mediaPreviewUrl` → `/api/media/assets/{uuid}`); no Route Handler writers for approvals.

---

### SECURITY floors (story + added)

| Floor | Status | Evidence |
|-------|--------|----------|
| `requireActive("handler")` first on Cliente actions | **PASS** | ensure/list/get/decide actions; source ordering tests. Layout also `requireActive("page")`. |
| Gate purity create + decide | **PASS** | Helper called with assembly id only; forbidden-key scan + `.strict()`; tests. |
| Assembly + CTA prerequisites on ensure | **PASS** | Branding / assembly / CTA codes + tests. |
| Pointer-only inputs + forbidden keys | **PASS** | `findForbiddenApprovalKeys` + Zod; smuggle → `FORBIDDEN_FIELDS` test. |
| State machine Phase A | **PASS** | Decision enum `approved`\|`rejected`; `INVALID_TRANSITION` on double-decide; `changes_requested` Zod reject. |
| Tenancy / IDOR 404 | **PASS** | Scoped loads + foreign tests (approval + assembly + media). |
| List / get scoping | **PASS** | Pending-only list by `client_id`; get by id + `client_id`. |
| Media widen `assembled_reel` only | **PASS** | Route branch + approvals source matrix + media US-11.1 cases. **Note:** no dedicated HTTP test that Cliente is denied `generated_video`/`voiceover` (Operator-only path retained + source order asserted). |
| Package `previewUrl` authenticated route | **PASS** | Zod regex + `mediaPreviewUrl`; compose uses branded `outputMediaAssetId`. |
| Feedback 0–500 | **PASS** | Zod + FE cap; test rejects >500. |
| Package DTO minimal | **PASS** | No `storage_key` / cost / LLM in DTO; qaOverrides read-only audit. |
| XSS — no `dangerouslySetInnerHTML` | **PASS** | Caption/hashtags/overrides/feedback as React text / PrimeReact; grep clean under `components/approvals`. |
| No Cliente override / QA authority | **PASS** | Read-only qaOverrides render; decide/ensure only write approvals. |
| DDL + RLS zero policies | **PASS** | Migration + test. |
| Rate limit ensure/decide | **PASS** | `approval_ensure` / `approval_decide`; decide over-limit test → `RATE_LIMITED`. |

---

### Convention Compliance

| Rule | Status | Notes |
|------|--------|-------|
| EN/ES copy | **PASS** | `messages/en.json` + `messages/es.json` `approvals.*` + `header.nav.approvals` + dashboard `approvalsCard`. Soft: ES chip/title keep English “Disclosure” loanword (same as EN key surface). |
| Server Components default; small client islands | **PASS** | Pages RSC; `"use client"` on list/detail interactive views + loading spinner only. |
| PrimeReact-first | **PASS** | `Button`, `Tag`, `Message`, `InputTextarea`, `Toast`, `ProgressSpinner`. |
| Loading / empty / error / pending | **PASS** | `loading.tsx` + `ApprovalsLoading`; list empty/error Messages; detail `ApprovalsErrorState`; decide disabled while pending. |
| Auth / identity | **PASS** | `requireActive` + `getCurrentUser()`; no browser Supabase in approvals FE. |
| Endpoints map to FE consumers | **PASS** | All four actions consumed by `/approvals` surfaces. |
| `neuramark_` prefix | **PASS** | Table/index/function/trigger prefixed. |

---

### Gaps (what blocks PASS)

**None blocking.** Soft notes only:

1. **Mobile AC** — responsive CSS evidence; no device-lab screenshot/run.
2. **Media suite** — `deletes own asset…` fails in `media-assets.test.ts` (pre-existing / unrelated to US-11.1 serve widen). US-11.1 serve cases pass.
3. **Cliente deny of `generated_video`/`voiceover`** — covered by route structure + source assertion; no dedicated Cliente-role HTTP deny case added in this story’s media tests.
4. **Request-changes** — correctly out of Phase A (US-11.2).

---

### Scope Creep

None material. No request-changes writes, no ready-to-publish queue, no Cliente CTA picker, no `generated_video`/`voiceover` widen, no cron/IG publish.

---

### Test counts

| Suite | Result |
|-------|--------|
| `npx tsx --test lib/approvals/approvals.test.ts` | **25 pass / 0 fail** (9 suites) |
| `npx tsx --test lib/media/media-assets.test.ts` (US-11.1 cases) | **2/2 pass** (own serve + foreign 404) |
| Full `media-assets.test.ts` | **22 pass / 1 fail** (unrelated avatar delete — not US-11.1) |

---

### QA blockers

**None.** Soft notes above are non-blocking for QA. Suggested QA focus: gated package preview (video + caption + CTA + disclosure + overrides), Approve/Reject happy path, ungated/foreign error toasts, mobile viewport smoke, EN/ES strings.

---

### Recommended Next Actions (and which agent should take them)

1. **qa-engineer** — Run QA.md against `/approvals` flows; treat media delete flake as out-of-scope unless it regresses serve.
2. **product-owner** — On PASS confirmation after QA, check off US-11.1 AC in `USER_STORIES.md` (validator did **not**).
3. **nextjs-backend** (optional hygiene) — Add Cliente HTTP deny cases for `generated_video`/`voiceover`; fix unrelated avatar-delete test flake.
4. **US-11.2** — Request-changes / `changes_requested` / revision_count when scheduled.
