# Validation Report — US-11.3

**Story:** Approve and mark ready to publish  
**Branch:** `feature/US-11.3-ready-to-publish`  
**Gate:** VALIDATION — 2026-08-30  
**Validator:** requirements-validator  
**Contract:** `plan/stories/US-11.3/CONTRACT.md` (frozen 2026-08-30 · FE signoff yes)  
**Tests:** `npx tsx --test lib/approvals/approvals-ready-to-publish.test.ts lib/approvals/approvals.test.ts` → **44/44 pass**, 0 fail (~337 ms). No `npm test` script in `package.json`; repo convention is `tsx --test`.

---

### Verdict: PASS WITH NOTES

**AC score:** 5 / 5 acceptance criteria satisfied (1 [SEC] note on explicit `rejected → approve` regression test coverage — mechanism present, test gap non-blocking).

---

### Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Approved Reels appear in "ready to publish" list | **PASS** | `listApprovedApprovalsForClient` queries `status = 'approved'` scoped to session client, `decided_at DESC` (`lib/approvals/persist-approval.ts:130–157`). Server Action `listApprovedApprovals` → `requireActive("handler")` first (`lib/approvals/actions/list-approved-approvals.ts:18–32`). RSC page `/ready-to-publish` loads action and renders `ReadyToPublishListView` with empty/error states (`app/(app)/ready-to-publish/page.tsx:25–64`; `components/ready-to-publish/ReadyToPublishListView.tsx:65–144`). Layout auth gate (`app/(app)/ready-to-publish/layout.tsx:16`). Dashboard card + header nav wired (`app/(app)/dashboard/page.tsx:124–127`; `components/layout/AppHeader.tsx:43–48`). Tests: approved-only list action + DB filter (`lib/approvals/approvals-ready-to-publish.test.ts` suites `listApprovedApprovals action`, `persist listApprovedApprovalsForClient filters`). |
| Caption + video downloadable for manual IG posting (V1) | **PASS** | **Video:** `mediaAttachmentDownloadUrl` → `/api/media/assets/{id}?disposition=attachment` (`lib/contracts/approval.ts:408–414`). Media route sets `Content-Disposition: attachment` when approved linkage verified (`app/api/media/assets/[assetId]/route.ts:273–311`). **Caption:** `GET /api/approvals/[approvalId]/caption.txt` — auth, tenancy, `status === 'approved'`, body = server-composed `effectiveCaption`, attachment headers (`app/api/approvals/[approvalId]/caption.txt/route.ts:60–123`). FE download panel uses authenticated hrefs only — no storage keys (`components/ready-to-publish/ReadyToPublishDownloadPanel.tsx:31–97`; `buildReadyToPublishDownloadUrls` in `lib/contracts/approval.ts:430+`). Post-approve panel on approval detail when `status === 'approved'` (`components/approvals/ApprovalPackageView.tsx:590–596`). Tests: caption export approved/404/429; attachment with/without approved linkage (`approvals-ready-to-publish.test.ts` suites `GET caption export route`, `media attachment disposition`). |
| Rejected Reels do not appear in publish queue | **PASS** | List query hard-filters `.eq("status", "approved")` — `pending_client`, `rejected`, `changes_requested` never returned (`lib/approvals/persist-approval.ts:142–144`). DTO enforces `status: z.literal("approved")` (`lib/contracts/approval.ts:337–348`). Detail page `notFound()` when package status ≠ `approved` (`app/(app)/ready-to-publish/[approvalId]/page.tsx:66–68`). Test asserts DB filter excludes non-approved fixtures (`approvals-ready-to-publish.test.ts:776–810`). |
| **[SEC] Approval status transitions follow a server-enforced state machine; approving an already-decided or ungated approval is rejected** | **PASS** (note) | **No new writers:** US-11.3 adds list + export only; log hook on approve success does not mutate status (`lib/approvals/decide-approval.ts:212–221`). Source tests: caption route SELECT-only, list action auth-first, no status UPDATE in US-11.3 paths (`approvals-ready-to-publish.test.ts` suite `closed write surface + log hook`). **Inherited decide:** `pending_client` gate at L106; ungated → `QA_GATE_NOT_READY`; double-decide → `INVALID_TRANSITION` (`lib/approvals/decide-approval.ts:106–131`; tests `approvals.test.ts` suites `decideApproval action`). **Note:** Explicit automated `rejected → approve` decide case not in the two run suites (guard is source-present); `changes_requested → INVALID_TRANSITION` covered in `approvals-revision.test.ts` (not re-run this gate). |
| **[SEC] Download/export links serve only assets tied to Reels of the current client, through the authenticated asset route (no direct static paths)** | **PASS** | Caption export: `loadApprovalByIdScoped({ approvalId, clientId: user.id })` + 404 on foreign/non-approved (`caption.txt/route.ts:87–93`). Media: ownership + `requireActive` for Cliente `assembled_reel`; attachment requires `hasApprovedApprovalForOutputAsset` (`app/api/media/assets/[assetId]/route.ts:227–280`; `lib/approvals/persist-approval.ts:163–198`). URL helpers regex-lock to `/api/media/assets/…` and `/api/approvals/…/caption.txt` — no `storage_key` in DTOs (`lib/contracts/approval.ts:352–364,408–422`). IDOR tests: foreign approval caption 404, foreign asset attachment 404 (`approvals-ready-to-publish.test.ts`). |

---

### Convention Compliance

| Rule | Status | Evidence |
|------|--------|----------|
| EN + ES user-facing strings | **PASS** | `readyToPublish.*` namespace + `approvals.detail.confirmApprove*` + `header.nav.readyToPublish` + `dashboard.readyToPublishCard` in `messages/en.json` (e.g. L435+) and `messages/es.json` (mirrored). |
| Server Components default; minimal `"use client"` | **PASS** | List/detail pages RSC (`app/(app)/ready-to-publish/page.tsx`, `[approvalId]/page.tsx`). Client islands: `ReadyToPublishListView`, `ReadyToPublishDetailView`, `ReadyToPublishDownloadPanel`, `ApprovalPackageView` (ConfirmDialog / mutations only). |
| PrimeReact-first UI | **PASS** | `ConfirmDialog`, `Button`, `Message`, `Tag`, `Toast` in approval + ready-to-publish components. |
| Loading / empty / error / pending states | **PASS** | Loading shells (`app/(app)/ready-to-publish/loading.tsx`, `[approvalId]/loading.tsx`). List empty + load error (`ReadyToPublishListView.tsx:65–71`). Detail error mapping (`[approvalId]/page.tsx:106–119`). Approve pending via existing `useTransition` in `ApprovalPackageView`. |
| Auth via Next.js backend; `getCurrentUser()` / `requireActive` | **PASS** | Layout `requireActive("page")`; actions/routes `requireActive("handler")` first. No browser Supabase imports on FE surfaces reviewed. |
| Endpoints serve concrete FE consumer | **PASS** | `listApprovedApprovals` → `/ready-to-publish`; caption route + media attachment → download panel buttons; no speculative APIs. |
| `neuramark_` DB prefix | **PASS** | No DDL for US-11.3; reads `neuramark_approvals` / `neuramark_assembled_reels` (`persist-approval.ts`). |
| CONTRACT frozen shapes | **PASS** | Zod DTOs, URL helpers, rate-limit key `approval_export` in `lib/contracts/approval.ts`; FE consumes `buildReadyToPublishDownloadUrls`. |

---

### Gaps (what blocks PASS)

**None.** All five USER_STORIES § US-11.3 acceptance criteria are implemented with file-level evidence.

---

### Partial Closures / Deferred Items

| Item | Status | Detail |
|------|--------|--------|
| USER_STORIES BE row “optional webhook/email stub” | **Deferred per CONTRACT Phase A** | Log-only `approval_ready_to_publish` on approve success (`decide-approval.ts:212–221`); no outbound HTTP/email — aligned with README § PO #7 and CONTRACT § Non-goals. |
| Zip bundle / bulk export | **Phase B (out of scope)** | Not implemented — correct per CONTRACT. |
| `rejected → approve` automated regression | **Test gap (non-blocking)** | `decide-approval.ts:106` blocks non-`pending_client`; double-decide + ungated covered in `approvals.test.ts`. |
| TASKS.md contract-first checklist (SPEC-REVIEW / SECURITY unchecked) | **Docs exist; TASKS stale** | `SPEC-REVIEW.md`, `SECURITY.md`, `CONTRACT.md` present in story folder; TASKS L134–135 still `[ ]` — update at CLOSE. |
| Live Supabase E2E | **Not exercised** | Validation is code + unit/source tests; no live browser download run in this gate. |

---

### Scope Creep

**None identified.** Implementation matches US-11.3 CONTRACT Phase A: dedicated `/ready-to-publish` queue, separate video + caption downloads, ConfirmDialog polish, post-approve panel, dashboard/nav, i18n, log hook. No second approve writer, no zip/webhook/email, no IG publish, no operator aggregate on Cliente queue, no extension of pending list filter.

---

### Recommended Next Actions

| Priority | Action | Owner |
|----------|--------|-------|
| 1 | **QA gate** — manual smoke: approve → post-approve downloads → `/ready-to-publish` list/detail; cross-client IDOR spot-check. | qa-engineer |
| 2 | Add explicit `rejected → approve` decide regression test to `approvals.test.ts` (optional hardening). | nextjs-backend |
| 3 | Mark TASKS.md SPEC-REVIEW / SECURITY checklist `[x]` at CLOSE. | product-owner |
| 4 | On PASS, product-owner checks USER_STORIES § US-11.3 AC boxes at CLOSE (not in VALIDATION). | product-owner |

---

### Dependency Check

| Dependency | Status |
|------------|--------|
| US-11.1 (`decideApproval`, `getApprovalPackage`, media serve, state machine) | **Satisfied** — reused unchanged; regression suite 25/25 pass. |
| US-11.2 (re-approve after revision → `approved`) | **Satisfied by design** — same `approved` filter eligibility; no US-11.3 fork. |

---

### Test Summary

| Suite | Result |
|-------|--------|
| `lib/approvals/approvals-ready-to-publish.test.ts` | **19 pass / 0 fail** (7 suites) |
| `lib/approvals/approvals.test.ts` (regression) | **25 pass / 0 fail** (8 suites) |
| **Combined** | **44 pass / 0 fail** |
