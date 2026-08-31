# US-11.3 — Approve and mark ready to publish

**Status:** PREP (2026-08-30) — README + TASKS + PO freezes. Next gates: `SPEC-REVIEW.md` · `SECURITY.md` · `CONTRACT.md`.

**As a** Client, **I want** to approve a Reel, **so that** my team knows it can be posted to Instagram.

Ship **Cliente ready-to-publish V1 (Phase A = full US-11.3 BUILD)**: dedicated **`/ready-to-publish`** queue for **`status = approved`** Reels; **separate video + caption downloads** for manual Instagram posting; **approve confirmation polish** on existing `/approvals/[approvalId]` (no second approve path); server-side publish-queue filter excludes rejected / pending / changes_requested. Optional webhook/email stub **out** for V1.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-11.3 (do **not** check off in PREP).

**This folder:** [`plan/stories/US-11.3/`](./) — `README.md` · `TASKS.md`. Next: `SPEC-REVIEW.md` · `SECURITY.md` · `CONTRACT.md` (not created in PREP).

**Branch:** `feature/US-11.3-ready-to-publish`

**Depends on:** [US-11.1](../US-11.1/) ✅ `decideApproval` approve/reject + `status = approved` + gate re-check + `/approvals` + Cliente `assembled_reel` media serve · [US-11.2](../US-11.2/) ✅ revision loop (`changes_requested` → requeue → re-approve path)

**Upstream contracts:** [US-11.1 CONTRACT](../US-11.1/CONTRACT.md) · [US-11.2 CONTRACT](../US-11.2/CONTRACT.md) · `lib/contracts/approval.ts` · `lib/approvals/decide-approval.ts` · `app/api/media/assets/[assetId]/route.ts`

**Unblocks:** [US-12.1](../../USER_STORIES.md) weekly calendar (approved Reels surface) · [US-12.2](../../USER_STORIES.md) mark manual publication · ADR-0002 Instagram publish (re-check `approved`)

---

## Scope in

| Area | What US-11.3 BUILD adds |
|------|-------------------------|
| **FE (Cliente)** | **`/ready-to-publish`** list (approved only) + **`/ready-to-publish/[approvalId]`** detail with **Download video** + **Download caption** CTAs; empty / loading / error; **Approve ConfirmDialog polish** on existing `/approvals/[approvalId]` (`ApprovalPackageView`); post-approve inline success + link to ready-to-publish detail; dashboard **readyToPublishCard** + header nav; EN/ES `readyToPublish.*`. |
| **BE** | **`listApprovedApprovals`** Server Action (`status = approved`, client-scoped, `decided_at DESC`); reuse **`getApprovalPackage`** for approved detail; **caption export** Route Handler (authenticated, client-scoped, `text/plain`); extend media serve with **attachment disposition** query for video download; verify **[SEC]** state machine unchanged (no new status writes); structured **log-only** `approval_ready_to_publish` event on approve (no HTTP webhook / no email V1). |
| **DB** | **No DDL** — consume existing `neuramark_approvals.status = 'approved'` + `decided_at`. |
| **Implementers** | **nextjs-backend** + **nextjs-frontend** only. **No** content-agents-engineer · **No** media-pipeline-engineer · **No** integrations-engineer (webhook/email deferred). |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **Second approve path** | US-11.1 `decideApproval(…, 'approved')` remains sole writer — US-11.3 adds UX only |
| **Zip bundle download** | V1 = separate video MP4 + caption `.txt`; zip stub → Phase B / backlog |
| **Webhook / email notification** | integrations-engineer / US-12.x — V1 log-only hook optional |
| **Instagram Graph publish** | ADR-0002 / US-12.x |
| **Extend `/approvals` list to mixed statuses** | Frozen US-11.1/11.2: `/approvals` = **`pending_client` only** |
| **Decided rejected / changes_requested history lists** | Out — rejected excluded from publish queue per AC |
| **Operator publish queue** | US-12.1 operator calendar — Cliente queue is `/ready-to-publish` |
| **RBAC beyond `requireActive`** | Unchanged |
| **New approval status values** | Enum frozen — no `ready_to_publish` column |

## Canonical terms (CONTEXT)

Use **Aprobación**, **Cliente**, **listo para publicar**, **Paquete**, **caption de Instagram**, **Ensamblado**, **descarga de respaldo**.  
_Evitar:_ “publish queue” as a product noun on Cliente surfaces; admin/staff; exposing storage keys or direct static URLs.

## What US-11.1 / US-11.2 already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-11.1 | `decideApproval` → `approved` + `decided_at` + `decided_by`; gate re-check; `getApprovalPackage`; `/approvals` pending list; `ApprovalPackageView` Approve/Reject/Request changes; media `previewUrl` = `/api/media/assets/{id}` inline |
| US-11.2 | Full revision loop; `changes_requested` leaves Cliente pending list until requeue; re-approve lands in `approved` via same `decideApproval` |
| Media route | Cliente-owned `assembled_reel` serve with `Content-Disposition: inline` — **US-11.3 adds attachment mode for download** |
| State machine | `pending_client` → `approved` \| `rejected` \| `changes_requested` enforced in `decide-approval.ts` — **US-11.3 verifies + tests, no new transitions** |

**US-11.3 adds ready-to-publish Cliente queue + manual download UX + approve confirmation polish** — not approve mutation, not revision loop, not IG publish.

---

## Phased BUILD (PO)

| Phase | Scope | Closes |
|-------|-------|--------|
| **A (US-11.3 BUILD — ship all in this story)** | `listApprovedApprovals` · `/ready-to-publish` list + detail · video attachment download · caption `.txt` export route · approve ConfirmDialog on `/approvals/[approvalId]` · post-approve download/link UX · dashboard card + nav · [SEC] client-scoped downloads + approved-only filter · EN/ES | USER_STORIES § US-11.3 AC (all five) |
| **B (deferred — not US-11.3)** | Zip bundle export · HTTP webhook on approve · email notification · bulk “download all approved” | Backlog / integrations / US-12.x |

**VALIDATION note (binding):** Phase A closes full US-11.3 AC. Approve transition remains US-11.1-owned; US-11.3 must not add a second status writer. Rejected / pending / changes_requested must not appear in ready-to-publish list.

---

## Upstream / downstream handoffs

| Direction | Artifact | Rule |
|-----------|----------|------|
| **From US-11.1** | `decideApproval`, `getApprovalPackage`, `ApprovalPackageDto.caption.effectiveCaption`, `video.previewUrl` | Reuse — no fork |
| **From US-11.1** | Media serve `/api/media/assets/[assetId]` | Add attachment disposition param; same ownership matrix |
| **From US-11.2** | Re-approve after revision → `approved` | Same queue eligibility as first-time approve |
| **To US-12.1** | Stable `approved` rows with `decided_at` | Operator calendar may aggregate; Cliente queue = `/ready-to-publish` |
| **To ADR-0002 publish** | Re-check `status = approved` server-side before IG container | Download UX does not imply publish |

---

## PO decisions frozen (2026-08-30)

| # | Topic | Decision |
|---|-------|----------|
| 1 | **Ready-to-publish route** | **Dedicated `/ready-to-publish`** (list) + **`/ready-to-publish/[approvalId]`** (detail + downloads). **Do not** extend `/approvals` list — frozen pending-only per US-11.1/11.2. Dashboard new **`readyToPublishCard`** → `/ready-to-publish`. Header nav **`readyToPublish`** (EN/ES) for Cliente. |
| 2 | **List filter** | **`status = 'approved'` only**, scoped to `getCurrentUser().id` as `client_id`, **`ORDER BY decided_at DESC`**. **Exclude:** `pending_client`, `rejected`, `changes_requested`. Empty array → dedicated empty state (not an error). |
| 3 | **Download format (V1)** | **Separate downloads** — **not** zip. **Video:** same authenticated media route with **`?disposition=attachment`** (CONTRACT may alias `download=1`) → `Content-Disposition: attachment; filename="…"`. **Caption:** new Route Handler **`GET /api/approvals/[approvalId]/caption.txt`** → `text/plain; charset=utf-8` body = server-composed **`effectiveCaption`** (from `buildEffectiveInstagramCaption` — never FE concat). **No** zip stub in Phase A. |
| 4 | **Approve confirmation** | **Polish existing US-11.1 Approve** on `/approvals/[approvalId]` — add **PrimeReact ConfirmDialog** before `decideApproval(…, 'approved')`. **No** new approve Server Action or route. Reject / request-changes flows unchanged. |
| 5 | **Post-approve UX** | After successful approve: **stay on `/approvals/[approvalId]`** (read-only, per US-11.1 FE freeze) + show **inline “Ready to publish” panel** with download links + link to **`/ready-to-publish/[approvalId]`**. Optional toast mentions ready-to-publish. **Do not** auto-redirect away from detail. |
| 6 | **Ready-to-publish detail** | Reuse **`getApprovalPackage`** + read-only package render (video preview + caption display) + prominent **Download video** / **Download caption** buttons. Hide decide CTAs when `status !== 'pending_client'`. |
| 7 | **Webhook / email stub** | **OUT for V1.** Optional: structured **server log** event `approval_ready_to_publish` on successful approve (no outbound HTTP, no email). integrations-engineer owns real notifications later. |
| 8 | **State machine [SEC]** | **No new writes** — US-11.3 consumes `approved` only. CONTRACT + SECURITY reaffirm US-11.1 `decideApproval` state machine; add tests that download/export handlers **reject non-approved** approval rows (404). Double-approve remains **`INVALID_TRANSITION`**. |
| 9 | **Download auth [SEC]** | All downloads via **authenticated routes** with **client tenancy** — foreign `approvalId` / `assetId` → **404**. Never expose `storage_key` or public Storage URLs. Caption export requires **`status = approved`** (404 otherwise). Video download requires owning Cliente + `assembled_reel` asset linked to approved approval. |
| 10 | **Gate re-check on download** | **No QA gate re-check** on download for approved items — Cliente already decided; publish (US-12.x / ADR-0002) re-checks live rules. Prevent download only via tenancy + approved status. |
| 11 | **List DTO** | New **`ApprovedListItemDto`** (or CONTRACT-named equivalent): `approvalId`, `assembledReelId`, `decidedAt`, `captionPreview?`, `videoAssetId?`, `hasDisclosure?`. Mirror pending list card density from US-11.1. |
| 12 | **i18n namespace** | **`readyToPublish.*`** for list/detail/download copy; extend **`approvals.detail`** for confirm-approve dialog strings. EN + ES. |
| 13 | **Implementers** | **nextjs-backend** (list action, caption route, media disposition, log hook) + **nextjs-frontend** (pages, confirm dialog, download UX, nav/card). |
| 14 | **Rate limit** | Caption export: reuse **`approval_get`**-class limit or new **`approval_export`** bucket — **CONTRACT decides**; lean **30/hour per client** same window as ensure/decide. |
| 15 | **DB changes** | **None** — `approved` status + timestamps already exist from US-11.1. |

---

## Gates (orchestrator)

- [x] PREP — README + TASKS + PO freezes
- [ ] SPEC-REVIEW.md (spec-guardian)
- [ ] SECURITY.md (security-architect)
- [ ] CONTRACT.md (nextjs-backend) — Reviewed by FE
- [ ] BUILD (nextjs-backend + nextjs-frontend)
- [ ] VALIDATION.md
- [ ] QA.md
- [ ] CLOSE — check AC in USER_STORIES.md (requirements-validator only)

**Next after PREP:** SPEC-REVIEW → SECURITY → CONTRACT (contract-first freeze before BUILD).

---

## Open questions (for SECURITY / CONTRACT — not PREP blockers)

| # | Question | PO lean |
|---|----------|---------|
| 1 | Query param: `disposition=attachment` vs `download=1`? | **`disposition=attachment`** — explicit; default remains inline preview. |
| 2 | Caption filename pattern? | **`reel-{assembledReelId.slice(0,8)}-caption.txt`** or human slug from script title if available — CONTRACT picks one. |
| 3 | Reuse `ApprovalPackageView` vs new `ReadyToPublishDetailView`? | **Shared read-only subcomponent** for package body; separate page shell for download CTAs — FE choice if props stay typed from contracts. |
| 4 | `listApprovedApprovals` vs extend list action with filter? | **New action** `listApprovedApprovals()` — keeps US-11.1 list contract frozen. |
| 5 | Log hook on approve — where? | **`decideApprovalForClient`** success branch when `decision === 'approved'` — single choke point. |
| 6 | Include `changes_requested` that never re-approved? | **No** — only terminal **`approved`**. |
| 7 | Operator access to Cliente ready-to-publish list? | **Out** — Operator uses US-12.1; this route is Cliente `requireActive` only. |

---

## SPEC alignment / blockers for spec-guardian

| Item | Assessment |
|------|------------|
| SPEC Cliente “descarga de respaldo” after approval | **Aligned** — separate video + caption download V1. |
| SPEC “rechazados fuera de publish queue” | **Aligned** — list filter `approved` only. |
| SPEC state machine / no publish without Aprobación | **Aligned** — consume `approved`; no publish writes here. |
| US-11.1 deferral ready-to-publish / download | **Closed by this story** — explicit Phase C deferral from US-11.1 README. |
| US-11.1 “no second approve path” | **Aligned** — confirm dialog only; same `decideApproval`. |

**No hard SPEC amendment required** for PREP → SECURITY/CONTRACT unless spec-guardian wants “descarga de respaldo” zip explicitly deferred in SPEC text.
