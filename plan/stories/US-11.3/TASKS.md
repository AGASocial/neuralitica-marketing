# US-11.3 — Approve and mark ready to publish

**Priority:** P0  
**Depends on:** US-11.1 ✅ · US-11.2 ✅ (soft: re-approve after revision loop)  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-11.3 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **nextjs-backend** (list approved, caption export route, media attachment disposition, log hook) + **nextjs-frontend** (`/ready-to-publish` pages, approve confirm dialog, download UX, i18n, dashboard card). Per `docs/development/AGENT-ROSTER.md` Fase 5. **No** content-agents-engineer · **No** media-pipeline-engineer · **No** integrations-engineer.  
**Canonical terms:** **Aprobación** · **listo para publicar** · **Paquete** · **caption de Instagram** · **descarga de respaldo** · **Cliente**.

**Reference contracts:** [US-11.1 CONTRACT](../US-11.1/CONTRACT.md) · [US-11.2 CONTRACT](../US-11.2/CONTRACT.md) · [US-11.3 README](./README.md) · `lib/contracts/approval.ts` · `lib/approvals/decide-approval.ts`

## Out of scope (do not implement here)

- Second approve Server Action or new status writer (`approved` remains US-11.1 `decideApproval`).
- Zip bundle / bulk export.
- HTTP webhook or email send on approve.
- Instagram Graph publish (ADR-0002 / US-12.x).
- Extending `/approvals` list beyond `pending_client`.
- Rejected / changes_requested / pending history lists.
- Operator-ready-to-publish aggregate (US-12.1).
- DDL / new `ready_to_publish` status column.
- QA gate re-check on download for already-approved rows.
- RBAC beyond `requireActive()`.

## Scope split

| Concern | Owner |
|---------|--------|
| `listApprovedApprovals` Server Action + DTO | **BE** |
| Caption export Route Handler (`text/plain`) | **BE** |
| Media route attachment disposition query | **BE** |
| Log-only `approval_ready_to_publish` on approve success | **BE** |
| `/ready-to-publish` list + detail pages | **FE** |
| Approve ConfirmDialog on `/approvals/[approvalId]` | **FE** |
| Post-approve inline download panel | **FE** |
| Dashboard card + header nav | **FE** |
| EN/ES `readyToPublish.*` + approve confirm strings | **FE** |
| State machine regression tests (no new writes) | **BE** |

## Implementer routing

| Agent | Owns |
|-------|------|
| **nextjs-backend** | `listApprovedApprovals` action · persist query · caption export route · media disposition param · optional log hook in `decide-approval.ts` · Zod extensions in `lib/contracts/approval.ts` · security tests |
| **nextjs-frontend** | Ready-to-publish pages · download buttons · ConfirmDialog on approve · post-approve panel · dashboard/header wiring · i18n |

---

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Branch | **`feature/US-11.3-ready-to-publish`** |
| Routes | **`/ready-to-publish`** list + **`/ready-to-publish/[approvalId]`** detail — **not** mixed into `/approvals` |
| List filter | **`status = 'approved'`** only · exclude rejected / pending / changes_requested |
| Download V1 | **Separate** video MP4 (media route attachment) + caption `.txt` (export route) — **no zip** |
| Approve UX | **ConfirmDialog polish** on existing Approve — same `decideApproval` |
| Post-approve | Stay on approval detail + inline download links + link to ready-to-publish detail |
| Webhook/email | **Out** — optional server log only |
| DB | **No migration** |
| Auth | **`requireActive("handler")`** on all surfaces |

### Action / route sketch (CONTRACT freezes names)

```ts
// New Server Action
listApprovedApprovals(): Promise<ListApprovedApprovalsResult>;
// { ok: true, items: ApprovedListItemDto[] } — approved only, decided_at DESC

// Reuse unchanged
getApprovalPackage({ approvalId }) // detail on /ready-to-publish/[approvalId]

// New Route Handler
GET /api/approvals/[approvalId]/caption.txt
// requireActive; load approval scoped; status === 'approved' else 404
// body = effectiveCaption; Content-Disposition: attachment

// Extend existing
GET /api/media/assets/[assetId]?disposition=attachment
// when approved context OR always for owning Cliente assembled_reel — CONTRACT picks rule
// default (no param) stays inline for preview
```

---

## Frontend (nextjs-frontend)

**Consumers:** `/ready-to-publish` · `/ready-to-publish/[approvalId]` · `/approvals/[approvalId]` (confirm + post-approve panel)

- [x] Add **`app/(app)/ready-to-publish/page.tsx`** — RSC; call `listApprovedApprovals`; empty / loading / error states.
- [x] Add **`app/(app)/ready-to-publish/[approvalId]/page.tsx`** — RSC; `getApprovalPackage`; guard redirect/404 if not `approved`.
- [x] Add **`app/(app)/ready-to-publish/layout.tsx`** + loading shells (match `/approvals` pattern).
- [x] Create **`ReadyToPublishListView`** (or extend list pattern from `ApprovalsListView`) — cards with `captionPreview`, `decidedAt`, link to detail.
- [x] Create detail client island or page section: video preview (inline `previewUrl`) + **Download video** (`mediaAttachmentDownloadUrl`) + **Download caption** (`captionExportUrl`).
- [x] **`ApprovalPackageView`**: wrap Approve in **ConfirmDialog** (`approvals.detail.confirmApprove` / cancel copy); no behavior change to `decideApproval` payload.
- [x] After approve success: render **ready-to-publish panel** (download links + link to `/ready-to-publish/[approvalId]`); keep read-only package per US-11.1 post-decide freeze.
- [x] Wire dashboard **`readyToPublishCard`** → `/ready-to-publish` (`messages/en.json` + `es.json`).
- [x] Add header nav **`header.nav.readyToPublish`** (Cliente; EN/ES).
- [x] i18n namespace **`readyToPublish.*`**: list title/subtitle/empty/error, detail title, download video/caption labels, back links, status tag `approved`.
- [x] Mobile-friendly download CTAs (touch targets; same layout patterns as approvals).
- [x] Map export/download errors (404, 401) to user-facing copy — no raw error codes in UI.

---

## Backend / API (nextjs-backend)

**Consumers:** ready-to-publish pages · download buttons · existing approve flow (log hook only)

- [ ] Extend **`lib/contracts/approval.ts`**: `ApprovedListItemDto`, `listApprovedApprovalsInputSchema`, result types, export error codes if needed.
- [ ] Add **`listApprovedApprovalsForClient`** in `lib/approvals/list-get-approvals.ts` (or sibling) — query `WHERE client_id = $session AND status = 'approved' ORDER BY decided_at DESC`.
- [ ] Add **`lib/approvals/actions/list-approved-approvals.ts`** Server Action — `requireActive("handler")` first; empty body `.strict()`.
- [ ] Add persist helper **`listApprovedApprovalsForClient`** in `lib/approvals/persist-approval.ts`.
- [ ] Add **`app/api/approvals/[approvalId]/caption.txt/route.ts`** — auth + tenancy + **`status === 'approved'`** guard; compose caption via existing package composer / `buildEffectiveInstagramCaption`; `Content-Type: text/plain; charset=utf-8`; `Content-Disposition: attachment`; `Cache-Control: private, no-store`.
- [ ] Extend **`app/api/media/assets/[assetId]/route.ts`**: parse `disposition=attachment` (PO lean) → `Content-Disposition: attachment` with sanitized filename; default remains `inline`.
- [ ] Optional: **`approval_ready_to_publish` structured log** in `decideApprovalForClient` on `approved` success — no outbound integrations.
- [ ] **[SEC]** Caption route: foreign `approvalId` → 404; non-approved status → 404; never stream from unscoped assembly/caption tables.
- [ ] **[SEC]** Media attachment: same ownership matrix as US-11.1 — Cliente `assembled_reel` only; no widen to `generated_video` / `voiceover`.
- [ ] **[SEC]** Reaffirm — no new approval status writers; grep closed write surface unchanged except log line.
- [ ] Rate limit caption export — CONTRACT names bucket (`approval_export` lean 30/hour).
- [ ] Unit/integration tests: approved-only list; rejected/pending/changes_requested excluded; caption export 404 for non-approved; attachment disposition header; IDOR 404 cross-client.

---

## Database (DB)

**No migration required** — consume existing `neuramark_approvals.status`, `decided_at`, `decided_by`.

- [ ] Verify index **`neuramark_approvals_client_status_created_idx`** supports `(client_id, status, …)` filter for `approved` list — add migration **only if** CONTRACT/perf review shows gap (PO lean: existing index sufficient with `status = 'approved'` predicate).
- [ ] Document in CONTRACT: no DDL for US-11.3.

---

## Contract-first checklist (before BUILD)

- [ ] `SPEC-REVIEW.md` — ALIGNED
- [ ] `SECURITY.md` — APPROVE (download tenancy + approved-only export)
- [x] `CONTRACT.md` frozen — Zod in `lib/contracts/approval.ts` · **Reviewed by FE: yes**
- [ ] Open questions in README § resolved in CONTRACT

---

## Acceptance criteria traceability (for VALIDATION — do not check off here)

| AC | Evidence expected |
|----|-------------------|
| Approved Reels in ready-to-publish list | `/ready-to-publish` shows `approved` rows only |
| Caption + video downloadable for manual IG | Attachment video + caption `.txt` via authenticated routes |
| Rejected not in publish queue | List query excludes `rejected` (and pending / changes_requested) |
| [SEC] State machine server-side | US-11.1 decide unchanged; tests for invalid transitions |
| [SEC] Download client-scoped authenticated routes | IDOR 404 tests; no static paths |

---

## Dependencies and sequence

1. SPEC-REVIEW → SECURITY → CONTRACT (freeze download routes + DTOs).  
2. BE: list action + caption route + media disposition (parallel with FE once CONTRACT signed).  
3. FE: pages + confirm dialog + dashboard/nav (against frozen types).  
4. VALIDATION → QA → CLOSE (requirements-validator checks USER_STORIES boxes).
