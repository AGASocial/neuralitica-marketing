# API Contract — US-11.3 Approve and mark ready to publish

**Story:** US-11.3  
**Status:** Frozen — 2026-08-30 · **Reviewed by FE:** yes — 2026-08-30 — nextjs-frontend  
**Extends:** [US-11.1 CONTRACT](../US-11.1/CONTRACT.md) · [US-11.2 CONTRACT](../US-11.2/CONTRACT.md) (read-only consumption of `approved`; no decide/list-pending changes)  
**Security:** `plan/stories/US-11.3/SECURITY.md` (APPROVE WITH CONDITIONS — 12 conditions reconciled below)  
**Spec review:** `plan/stories/US-11.3/SPEC-REVIEW.md` (ALIGNED — 5 Low gaps closed below)  
**Pattern:** US-11.1 package DTO + media serve · US-9.2 authenticated asset route  
**Depends on:** US-11.1 ✅ (`decideApproval`, `getApprovalPackage`, media serve) · US-11.2 ✅ (re-approve → `approved` eligible) · US-14.5 ✅ `requireActive()`  
**Feature branch:** `feature/US-11.3-ready-to-publish`  
**Error envelope style:** Server Actions — same as US-11.1 (`ok: true` vs `{ ok: false, error: { code, fields?, messageKey? } }`). Route Handlers — JSON `{ error: "<CODE>" }` on failure (house media/caption pattern).

**This document is CONTRACT ONLY.** Zod mirrors live in `lib/contracts/approval.ts` (committed with this freeze). Server Actions, Route Handlers, media disposition extension, and optional log hook are specified here and applied during BUILD — **not shipped in this gate commit**.

**Terminology:** **Aprobación** · **listo para publicar** · **Paquete** · **Cliente** · **caption de Instagram** · **Ensamblado** · **descarga de respaldo**. Technical enums (`approved`, `disposition=attachment`, `approval_export`) OK in code/wire. Do **not** use CONTEXT _Evitar_ terms on Cliente surfaces (“publish queue” as primary noun; admin/staff; static Storage URLs; `storage_key` exposure).

---

## US-11.1 / US-11.2 continuity (unchanged surfaces)

| Upstream surface | US-11.3 rule |
|------------------|--------------|
| `decideApproval` | **Unchanged** — sole Cliente writer to `approved`; ConfirmDialog is FE-only polish |
| `listPendingApprovals` | **Frozen** — `pending_client` only; **do not** extend with status filter |
| `getApprovalPackage` | **Reused** on `/ready-to-publish/[approvalId]` and post-approve panel |
| Media inline preview | **Unchanged** — `/api/media/assets/{id}` without query → `Content-Disposition: inline` |
| State machine writes | **Unchanged** — US-11.1 ensure + US-11.1/11.2 decide + US-11.2 requeue only |

---

## SPEC-REVIEW gaps closed (5 Low)

| # | Gap | Resolution in this contract |
|---|-----|----------------------------|
| 1 | USER_STORIES BE row stale (“Status → approved”) | § Overview — approve transition remains US-11.1 `decideApproval`; US-11.3 owns list + export only. VALIDATION maps [SEC] state machine jointly. |
| 2 | Webhook/email stub vs Phase B deferral | § Non-goals · § Log hook — Phase A = structured **log-only** `approval_ready_to_publish`; **no** outbound HTTP/email. |
| 3 | Media attachment approved-context open | § Media attachment — `?disposition=attachment` requires **approved** approval linkage for asset’s assembly; inline default unchanged. |
| 4 | Zip bundle not in V1 | § Non-goals — Phase B zip; V1 = separate video MP4 + caption `.txt`. |
| 5 | No QA gate re-check on download | § Download guards — tenancy + `status = approved` only; **no** `getQaGateStatusForAssembledReel` on export/attachment. ADR-0002 publish re-checks live rules. |

---

## SECURITY reconciliation (12 conditions)

| # | SECURITY condition | **Frozen in this contract** |
|---|-------------------|----------------------------|
| 1 | No second approve writer | § Forbidden surfaces · ConfirmDialog → existing `decideApproval` |
| 2 | State machine regression tests only | § State machine · § Closed write surface |
| 3 | `listApprovedApprovals` auth + filter | § `listApprovedApprovals` |
| 4 | Caption export tenancy + approved gate | § `GET /api/approvals/[approvalId]/caption.txt` |
| 5 | Attachment approved linkage | § Media attachment disposition |
| 6 | `disposition` whitelist + no client filename | § Media query parsing |
| 7 | No gate re-check on download | § Download guards |
| 8 | Non-goals: zip, webhook, Operator queue | § Non-goals |
| 9 | Media matrix unchanged | § Media attachment — `assembled_reel` only for Cliente attachment |
| 10 | Download URL shapes frozen | § Ready-to-publish DTO · URL helpers in `lib/contracts/approval.ts` |
| 11 | Ready-to-publish detail 404 when not approved | § Cliente FE contract |
| 12 | Security tests minimum list | § Security tests |

**Inherited US-11.1 / US-11.2 [SEC] rows** on shared paths (`decideApproval`, `getApprovalPackage`, inline media, IDOR → 404, `requireActive` first) remain binding. US-11.3 adds regression tests; **does not fork** decide orchestrator behavior.

---

## Phased BUILD acceptance

| Phase | Scope | Closes |
|-------|-------|--------|
| **A (US-11.3 BUILD — ship all in this story)** | `listApprovedApprovals` · `/ready-to-publish` list + detail · video attachment download · caption `.txt` export · approve ConfirmDialog on `/approvals/[approvalId]` · post-approve download panel · dashboard card + nav · [SEC] client-scoped downloads + approved-only filter · EN/ES · optional log hook | USER_STORIES § US-11.3 AC (all five) |
| **B (deferred — not US-11.3)** | Zip bundle export · HTTP webhook on approve · email notification · bulk “download all approved” | Backlog / integrations / US-12.x |

**VALIDATION note (binding):** Phase A closes full US-11.3 AC. Approve transition remains US-11.1-owned; US-11.3 must **not** add a second status writer. Rejected / pending / changes_requested must not appear in ready-to-publish list.

---

## Overview

US-11.3 ships **Cliente listo para publicar V1 (Phase A)**. After **Aprobación** (`status = approved` via US-11.1/11.2 `decideApproval`), the **Cliente** lists approved Reels on **`/ready-to-publish`**, opens detail with read-only **Paquete** preview, and downloads **descarga de respaldo** as separate authenticated **video MP4** (attachment disposition) + **caption `.txt`** (export route). Approve confirmation is **ConfirmDialog polish** on existing `/approvals/[approvalId]` — same mutation. Optional structured server log on approve success — no webhook/email.

**No DDL.** Consumes existing `neuramark_approvals.status = 'approved'` and `decided_at`.

**Surfaces**

| # | Surface | Kind | Consumer |
|---|---------|------|----------|
| 1 | `listApprovedApprovals` | Server Action | `/ready-to-publish` list page |
| 2 | `listApprovedApprovalsForClient` | Server-only orchestrator | Action only |
| 3 | `getApprovalPackage` (reuse) | Server Action | `/ready-to-publish/[approvalId]` detail · post-approve panel |
| 4 | `GET /api/approvals/[approvalId]/caption.txt` | Route Handler | Download caption button |
| 5 | `GET /api/media/assets/[assetId]?disposition=attachment` | Route Handler (extend) | Download video button |
| 6 | `decideApproval` (reuse + log hook) | Server Action | ConfirmDialog Approve — **unchanged wire** |
| 7 | Zod + types | `lib/contracts/approval.ts` | FE types · BE validation · download URL helpers |
| 8 | `/ready-to-publish` + `/ready-to-publish/[approvalId]` | FE | List + detail + downloads |
| 9 | Approve ConfirmDialog + post-approve panel | FE | `/approvals/[approvalId]` |

**Forbidden surfaces (BUILD veto):**

- Any new Server Action / Route Handler that **writes** `neuramark_approvals.status` (including a second approve path).
- Extending `listPendingApprovals` with mixed statuses or a `status` filter param.
- Zip bundle / bulk export Route Handler in Phase A.
- Outbound HTTP webhook or email send in approve “stub”.
- Instagram Graph publish / calendar publish writes (ADR-0002 / US-12.x).
- Operator aggregate on `/ready-to-publish` (`requireOperator` on Cliente queue).
- Client-supplied caption body on export route (GET only — no POST).
- Client `filename` / `download=1` / arbitrary `disposition` values affecting headers.
- Widening attachment to `generated_video` / `voiceover` for Cliente.
- Public `/public/**`, long-lived Storage signed URLs, or `storage_key` in DTO download hrefs.
- QA gate re-check (`getQaGateStatusForAssembledReel`) on download handlers for already-approved rows.
- Browser Supabase / `NEXT_PUBLIC_` Supabase keys.

**Why Server Action for list:** UI-coupled Cliente read under `/ready-to-publish`; matches US-11.1 list pattern. **Why Route Handlers for exports:** explicit GET download endpoints for browser `<a download>` / navigation; caption is not a media asset row.

---

## State machine (consumption only — approve stays US-11.1)

US-11.3 **does not** add transitions or status enum values. Full machine (US-11.1 + US-11.2):

```ts
// Writes (unchanged — US-11.3 adds ZERO new writers):
//   (insert) → pending_client                    [ensure — US-11.1]
//   pending_client → approved | rejected         [decide — US-11.1]
//   pending_client → changes_requested           [decide — US-11.2]
//   changes_requested → pending_client           [requeue — US-11.2 server-only]
//
// US-11.3 reads only:
//   status === 'approved'  → ready-to-publish list + export guards
//
// Forbidden (inherited):
//   approved | rejected | changes_requested → * via Cliente decide  [INVALID_TRANSITION]
//   ungated pending_client → approved                              [QA_GATE_NOT_READY]
```

| US-11.3 surface | Status rule |
|-----------------|-------------|
| `listApprovedApprovals` | Query **`status = 'approved'`** only |
| Caption export | Row must be **`approved`** else **404** |
| Media attachment (Cliente) | **`assembled_reel`** + approved approval linking `output_media_asset_id = assetId` else **404** |
| Inline media (no param) | US-11.1 — owning Cliente may preview while `pending_client` |
| `/ready-to-publish/[approvalId]` | RSC calls `getApprovalPackage`; **404/notFound** when `package.status !== 'approved'` |

**Double-approve:** Still **`INVALID_TRANSITION`** via US-11.1 decide — US-11.3 adds regression tests only.

---

## Database

**No migration for US-11.3.**

| Object | Usage |
|--------|-------|
| `neuramark_approvals.status` | Filter `= 'approved'` for list; guard exports |
| `neuramark_approvals.decided_at` | `ORDER BY decided_at DESC` on list |
| `neuramark_approvals.client_id` | Tenancy on all loads |
| `neuramark_approvals.assembled_reel_id` | Join to assembly for attachment guard |
| `neuramark_assembled_reels.output_media_asset_id` | Attachment linkage check |
| Index `neuramark_approvals_client_status_created_idx` | Sufficient for `(client_id, status)` filter — **no new index** unless perf review in BUILD shows gap |

---

## Rate limit

Reuse `neuramark_agent_rate_limits`:

| Constant | Export (caption route) |
|----------|------------------------|
| `agent_key` | **`approval_export`** |
| Window | **60 minutes** rolling (`APPROVAL_RATE_WINDOW_MS`) |
| Max attempts | **30** per `client_id` / window (`APPROVAL_MAX_PER_WINDOW`) |
| Over-limit | **429** JSON `{ error: "RATE_LIMITED" }` — no stream |

Constants in `lib/contracts/approval.ts`: `APPROVAL_EXPORT_AGENT_KEY`.

**Note:** Video attachment reuses media route — **no separate rate bucket** in V1 (same auth + approved guard). Caption export is text-only egress — bucket applies to **`GET /api/approvals/[approvalId]/caption.txt`** only.

---

## `listApprovedApprovals()`

**Kind:** Server Action  
**File (BUILD):** `lib/approvals/actions/list-approved-approvals.ts`  
**Orchestrator (BUILD):** `lib/approvals/list-get-approvals.ts` — `listApprovedApprovalsForClientUser`  
**Persist (BUILD):** `lib/approvals/persist-approval.ts` — `listApprovedApprovalsForClient`  
**Consumer:** `/ready-to-publish` list page  
**Auth:** `requireActive("handler")` as **first await** — failure → 401/403, **no side effects**.

### Request

Empty / no body — `listApprovedApprovalsInputSchema` = `z.object({}).strict()`.

**No** status filter params, pagination params, or foreign keys in request.

### Success

```ts
{
  ok: true;
  items: ApprovedListItemDto[]; // approved only; [] OK → empty state
}
```

### `ApprovedListItemDto`

```ts
{
  approvalId: string;
  assembledReelId: string;
  status: "approved"; // literal — always approved in this action
  decidedAt: string; // ISO — from neuramark_approvals.decided_at
  captionPreview?: string; // truncated body — same helper as pending list
  hasDisclosure?: boolean;
  videoAssetId?: string; // branded output_media_asset_id for card thumbnail link
}
```

**Omit:** `storage_key`, `createdAt` as primary sort key (use `decidedAt`), `overrideCount` (optional later), non-approved statuses.

### Orchestrator steps

| Step | Action |
|------|--------|
| 1 | `requireActive("handler")` first |
| 2 | Zod empty `.strict()` (no forbidden-key scan needed — no input keys) |
| 3 | SELECT **`WHERE client_id = $session AND status = 'approved'`** `ORDER BY decided_at DESC` |
| 4 | Map rows to `ApprovedListItemDto` (caption preview via same compose/teaser path as pending list) |
| 5 | Return `{ ok: true, items }` |

**Exclude:** `pending_client`, `rejected`, `changes_requested`. Empty array → FE dedicated empty state (**not** an error).

**Do not** batch-ensure on this list — approved rows already exist from prior decide.

---

## `getApprovalPackage({ approvalId })` (reuse)

**Unchanged** from US-11.1/US-11.2 CONTRACT.

**Ready-to-publish detail consumer:** `/ready-to-publish/[approvalId]` RSC loads package; if `package.status !== 'approved'` → **`notFound()`** before rendering download CTAs.

**Post-approve panel consumer:** `/approvals/[approvalId]` after successful `decideApproval` with `status: 'approved'` — same package + download hrefs.

---

## Ready-to-publish DTO (download subset)

Full detail uses **`ApprovalPackageDto`** from `getApprovalPackage`. For typed download wiring, contracts expose a **view subset** + URL helpers (BUILD may use helpers directly without a separate Server Action DTO):

### `ReadyToPublishPackageDto`

Subset of `ApprovalPackageDto` for approved detail + download panel:

```ts
{
  approvalId: string;
  assembledReelId: string;
  status: "approved";
  video: { assetId: string; previewUrl: string }; // inline preview
  cover?: { assetId: string; previewUrl: string } | null;
  caption: {
    body: string;
    selectedCtaText: string;
    effectiveCaption: string; // authoritative export text — never FE concat
  };
  hashtags: string[];
  disclosure: ApprovalDisclosureDto;
  decidedAt: string; // non-null for approved
  downloads: {
    videoDownloadUrl: string;   // mediaAttachmentDownloadUrl(video.assetId)
    captionDownloadUrl: string; // captionExportUrl(approvalId)
  };
}
```

**FE rule:** Use `downloads.videoDownloadUrl` / `downloads.captionDownloadUrl` for `<a href>` download CTAs. Use `video.previewUrl` for inline `<video>` preview only.

### URL helpers (`lib/contracts/approval.ts`)

| Helper | Returns |
|--------|---------|
| `mediaAttachmentDownloadUrl(assetId)` | `/api/media/assets/{uuid}?disposition=attachment` |
| `captionExportUrl(approvalId)` | `/api/approvals/{uuid}/caption.txt` |
| `buildCaptionExportFilename(assembledReelId)` | `reel-{first8hex}-caption.txt` (no hyphens in hex slice) |

**Frozen caption filename pattern:** `reel-{assembledReelId.replace(/-/g, "").slice(0, 8)}-caption.txt` — server-only; passed through `sanitizeFilenameForHeader`. **Not** script title slug (avoids PII/special chars in headers).

**Frozen video filename:** `assembled-reel.mp4` (existing media route default) through sanitizer.

---

## `GET /api/approvals/[approvalId]/caption.txt`

**Kind:** Route Handler  
**File (BUILD):** `app/api/approvals/[approvalId]/caption.txt/route.ts`  
**Consumer:** Download caption CTA on ready-to-publish detail + post-approve panel  
**Auth:** `requireActive("handler")` first.

### Request

- **Method:** GET only
- **Path:** `approvalId` UUID segment
- **Body:** none
- **Query:** ignored (no client caption override)

### Success response

| Header | Value |
|--------|-------|
| Status | **200** |
| `Content-Type` | `text/plain; charset=utf-8` |
| `Content-Disposition` | `attachment; filename="{buildCaptionExportFilename(...)}"` |
| `Cache-Control` | `private, no-store` |
| Body | **`effectiveCaption`** from same compose path as package (`buildEffectiveInstagramCaption` via package composer / owned caption rows) |

### Orchestrator steps

| Step | Action |
|------|--------|
| 1 | `requireActive("handler")` first — fail → auth guard response |
| 2 | Validate `approvalId` UUID — invalid → **404** |
| 3 | Rate limit **`approval_export`** → **429** `{ error: "RATE_LIMITED" }` |
| 4 | Load approval **`WHERE id = $approvalId AND client_id = $session`** — miss → **404** |
| 5 | **`status !== 'approved'` → 404** (uniform — no status leak) |
| 6 | Compose caption via **`composeApprovalPackage`** / shared helper — reuse `effectiveCaption`; **never** request body |
| 7 | Stream plain text body; headers above |

### Error responses (Route Handler)

| Condition | Status | Body |
|-----------|--------|------|
| Unauthenticated / inactive | 401/403 | per `authGuardResponse` |
| Invalid UUID / foreign / non-approved | **404** | `{ "error": "NOT_FOUND" }` |
| Rate limited | **429** | `{ "error": "RATE_LIMITED" }` |
| Compose/internal failure | **500** | `{ "error": "INTERNAL_ERROR" }` |

**404 uniformity:** Foreign tenant and non-approved statuses return the same shape — **never** 403 with distinguishing body.

---

## Media route extension — attachment disposition

**File (BUILD):** extend `app/api/media/assets/[assetId]/route.ts`  
**Consumer:** Download video CTA (`mediaAttachmentDownloadUrl`)

### Query parsing (frozen)

| Param | Rule |
|-------|------|
| `disposition` | **Only** exact case-sensitive **`attachment`** triggers attachment mode. Any other value (including `download=1`, `inline`, injected CRLF) → **ignore**; treat as default inline. |
| `filename` / other query keys | **Ignored** for header construction — **never** reflect client query in `Content-Disposition` |

```ts
// Parse from request URL:
const dispositionParam = url.searchParams.get("disposition");
const attachmentMode = dispositionParam === "attachment"; // exact match only
```

### Behavior matrix (`assembled_reel`)

| Mode | Auth | Guard | `Content-Disposition` |
|------|------|-------|------------------------|
| Default (no param / not `attachment`) | US-11.1 — Cliente ownership **or** Operator ownership | None beyond ownership | **`inline`** + sanitized filename |
| **`?disposition=attachment`** (Cliente path) | `requireActive("handler")` + `row.client_id === user.id` | **Approved approval linkage** (below) | **`attachment`** + sanitized filename |
| **`?disposition=attachment`** (Operator path) | `requireOperator` + ownership | **No US-11.3 approved guard** — Operator download out of Cliente story; attachment header allowed for ops workflows (unchanged widen from US-11.1) |

### Approved-approval linkage (Cliente attachment — binding)

After Cliente ownership passes for `assembled_reel`, when `attachmentMode === true`:

```sql
SELECT 1 FROM neuramark_approvals a
JOIN neuramark_assembled_reels ar ON ar.id = a.assembled_reel_id
WHERE a.client_id = $sessionClientId
  AND a.status = 'approved'
  AND ar.output_media_asset_id = $assetId
LIMIT 1;
```

Miss → **404** (includes `pending_client` approval for same asset — blocks download-before-approve).

**Inline preview** without param: **no** approved check (US-11.1 product intent for review).

### Other asset types

| `asset_type` | Attachment param |
|--------------|------------------|
| `assembled_reel` | Cliente: approved guard when `attachment`. Operator: ownership only. |
| `generated_video` / `voiceover` | Operator only — **unchanged**; Cliente still **404** |
| `client_logo` / `cover_frame` / `avatar_reference` | US-11.3 does **not** add attachment semantics — default inline only |

### Download guards (summary)

- **Tenancy:** ownership matrix unchanged from US-11.1  
- **Approved:** required for Cliente **`assembled_reel`** attachment only  
- **No QA gate:** do **not** call `getQaGateStatusForAssembledReel` on download  
- **No static paths:** stream via storage adapter only  

---

## Log hook (optional — Phase A)

**Location (BUILD):** `decideApprovalForClient` success branch when `decision === 'approved'`  
**Kind:** Structured server log only — **no** outbound HTTP/email

```ts
{
  event: "approval_ready_to_publish";
  approvalId: string;
  assembledReelId: string;
  clientId: string;
  decidedAt: string; // ISO
}
```

Fields server-resolved only — **no** user-controlled log payload. integrations-engineer owns real notifications in US-12.x / backlog.

---

## Closed write surface (US-11.3 reaffirmation)

**US-11.3 adds ZERO** INSERT/UPDATE to `neuramark_approvals.status`.

**Only** these modules may write approval status (unchanged from US-11.1 + US-11.2):

- `lib/approvals/ensure-approval-package.ts` — INSERT `pending_client`
- `lib/approvals/decide-approval.ts` — UPDATE from `pending_client`
- `lib/approvals/requeue-approval-after-revision.ts` (US-11.2) — UPDATE `changes_requested` → `pending_client`
- Operator grant paths (US-11.2) — `extra_revision_granted` only

**Zero** Route Handlers write approval status. US-11.3 caption export and list are **SELECT-only**.

BUILD grep + tests must prove no new status writers.

---

## Cliente FE contract

| Element | Behavior |
|---------|----------|
| Routes | `app/(app)/ready-to-publish/page.tsx` (list) · `app/(app)/ready-to-publish/[approvalId]/page.tsx` (detail) |
| List | `listApprovedApprovals`; cards: `captionPreview` + `decidedAt`; link to detail; empty / loading / error |
| Detail | `getApprovalPackage`; guard `status === 'approved'`; inline video via `previewUrl`; download CTAs via `mediaAttachmentDownloadUrl` + `captionExportUrl` |
| Approve polish | **ConfirmDialog** before `decideApproval(…, 'approved')` on `/approvals/[approvalId]` — same payload |
| Post-approve | Stay on detail read-only; inline **listo para publicar** panel with download links + link to `/ready-to-publish/[approvalId]` |
| Nav | Dashboard `readyToPublishCard` → `/ready-to-publish`; header `readyToPublish` EN/ES |
| XSS | React text / i18n only — export body never rendered via `dangerouslySetInnerHTML` |
| Types | Import from `lib/contracts/approval.ts` — `ApprovedListItemDto`, URL helpers, `ReadyToPublishPackageDto` |
| i18n | **`readyToPublish.*`** list/detail/download; extend **`approvals.detail`** for confirm-approve dialog |

**Shared component note:** Reuse read-only package body (`ApprovalPackageView` subcomponent or equivalent); separate page shell for download CTAs — FE choice if props stay contract-typed.

**Terminology (Cliente copy):** prefer **listo para publicar** / **descarga de respaldo** / **caption de Instagram**; avoid “publish queue” as primary noun.

---

## Error codes

### Server Actions (unchanged enum)

US-11.3 list action reuses existing `ApprovalErrorCode` — no new action error codes required.

| Code | When (US-11.3) |
|------|----------------|
| `UNAUTHENTICATED` / `FORBIDDEN` | `requireActive` failure on list |
| `INTERNAL_ERROR` | Unexpected list persist/compose failure |

### Route Handlers (caption export)

| Code | HTTP | When |
|------|------|------|
| `NOT_FOUND` | 404 | Invalid UUID, foreign approval, non-approved status |
| `RATE_LIMITED` | 429 | `approval_export` window exceeded |
| `INTERNAL_ERROR` | 500 | Compose/stream failure |
| `UNAUTHENTICATED` / `FORBIDDEN` | 401/403 | Auth guard (media route uses same house codes) |

Media route continues JSON `{ error: "NOT_FOUND" }` / `{ error: "INTERNAL_ERROR" }` pattern from US-11.1.

---

## Fixtures (FE mock)

### List success

```json
{
  "ok": true,
  "items": [
    {
      "approvalId": "11111111-2222-4333-8444-555555555555",
      "assembledReelId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      "status": "approved",
      "decidedAt": "2026-08-30T19:05:00.000Z",
      "captionPreview": "This week we open early for locals who need a quick win…",
      "hasDisclosure": true,
      "videoAssetId": "99999999-aaaa-4bbb-8ccc-dddddddddddd"
    }
  ]
}
```

### List success (empty)

```json
{
  "ok": true,
  "items": []
}
```

### Ready-to-publish download URLs (FE wiring)

```ts
import {
  mediaAttachmentDownloadUrl,
  captionExportUrl,
} from "@/lib/contracts/approval";

const videoDownloadUrl = mediaAttachmentDownloadUrl("99999999-aaaa-4bbb-8ccc-dddddddddddd");
// → "/api/media/assets/99999999-aaaa-4bbb-8ccc-dddddddddddd?disposition=attachment"

const captionDownloadUrl = captionExportUrl("11111111-2222-4333-8444-555555555555");
// → "/api/approvals/11111111-2222-4333-8444-555555555555/caption.txt"
```

### Caption export success

- **Request:** `GET /api/approvals/11111111-2222-4333-8444-555555555555/caption.txt`
- **Response headers:** `Content-Type: text/plain; charset=utf-8` · `Content-Disposition: attachment; filename="reel-aaaabbbb-caption.txt"`
- **Body:** (plain text effective caption)

```
This week we open early for locals who need a quick win.

Book your free consult today.

#localbiz #consult
```

### Caption export — non-approved (pending)

- **Response:** 404 `{ "error": "NOT_FOUND" }`

### Media attachment — non-approved own asset

- **Request:** `GET /api/media/assets/99999999-aaaa-4bbb-8ccc-dddddddddddd?disposition=attachment` while approval still `pending_client`
- **Response:** 404 `{ "error": "NOT_FOUND" }`

### Media inline — pending (unchanged)

- **Request:** `GET /api/media/assets/99999999-aaaa-4bbb-8ccc-dddddddddddd`
- **Response:** 200 · `Content-Disposition: inline; filename="assembled-reel.mp4"`

---

## Non-goals (explicit)

| Out | Owner / note |
|-----|----------------|
| Second approve Server Action / route | **Forbidden** — US-11.1 `decideApproval` only |
| Zip bundle / bulk export | Phase B / backlog |
| HTTP webhook / email on approve | integrations / US-12.x — log-only optional |
| Instagram Graph publish | ADR-0002 / US-12.x |
| Extend `/approvals` list beyond `pending_client` | Frozen US-11.1/11.2 |
| Rejected / changes_requested history lists | Out |
| Operator ready-to-publish aggregate | US-12.1 |
| DDL / `ready_to_publish` status column | Out |
| QA gate re-check on download | PO #10 — publish re-checks later |
| RBAC beyond `requireActive` | Unchanged |
| `download=1` query alias | Out — **`disposition=attachment`** only |

---

## Downstream obligations

| Consumer | Obligation |
|----------|------------|
| **US-12.1** | Operator calendar may aggregate `approved` rows; **do not** reuse Cliente `/ready-to-publish` with UI-only filter |
| **ADR-0002 publish** | Re-check `status === 'approved'` + live gates server-side before IG container |
| **nextjs-frontend** | ConfirmDialog + download UX; types from contracts; no caption concat for export |

---

## Security tests (minimum)

1. `listApprovedApprovals` excludes `pending_client`, `rejected`, `changes_requested`  
2. Foreign `approvalId` on get/caption → **404**  
3. Caption export non-approved → **404**  
4. Caption cross-client → **404**  
5. Caption rate limit → **429**  
6. Attachment on foreign asset → **404**  
7. Attachment on own asset with **non-approved** approval → **404**  
8. Attachment on **approved** own asset → **200** + `Content-Disposition: attachment`  
9. Inline default without param → **inline** (pending allowed)  
10. Malicious `disposition` values (`attachment; filename=evil`, CRLF) do not alter filename/header  
11. Client `filename` query ignored  
12. Double-approve → **`INVALID_TRANSITION`** (regression)  
13. Grep — no new `neuramark_approvals.status` writers outside closed surface  
14. Grep — no static/public assembled MP4 serve  
15. `requireActive("handler")` first on list action + caption route  
16. ConfirmDialog path — no new approve action in grep  

---

## Module placement (BUILD)

| Module | Path |
|--------|------|
| Contracts (extend) | `lib/contracts/approval.ts` |
| List orchestrator | `lib/approvals/list-get-approvals.ts` |
| Persist query | `lib/approvals/persist-approval.ts` |
| List action | `lib/approvals/actions/list-approved-approvals.ts` |
| Caption export route | `app/api/approvals/[approvalId]/caption.txt/route.ts` |
| Media route (extend) | `app/api/media/assets/[assetId]/route.ts` |
| Log hook | `lib/approvals/decide-approval.ts` (optional) |
| Package composer | `lib/approvals/compose-approval-package.ts` (reuse) |
| FE pages | `app/(app)/ready-to-publish/**` |

---

## Open decisions frozen here

| # | Topic | Frozen choice |
|---|-------|---------------|
| 1 | Ready-to-publish routes | `/ready-to-publish` + `/ready-to-publish/[approvalId]` |
| 2 | List action | **New** `listApprovedApprovals` — do not extend pending list |
| 3 | List filter | `status = 'approved'`, `decided_at DESC`, client-scoped |
| 4 | Video download | `?disposition=attachment` on media route |
| 5 | Caption download | `GET /api/approvals/[approvalId]/caption.txt` |
| 6 | Attachment approved guard | Cliente `assembled_reel` only — join approvals + output asset |
| 7 | Caption filename | `reel-{first8hex}-caption.txt` |
| 8 | Rate limit | `approval_export`, 30 / 60 min, caption route only |
| 9 | Approve UX | ConfirmDialog on existing decide — no new action |
| 10 | Post-approve | Stay on detail + inline download panel |
| 11 | Webhook/email | Out — log-only optional |
| 12 | DDL | None |
| 13 | QA on download | No gate re-check |
| 14 | Zip | Phase B |

---

## Reviewed by FE

**Reviewed by FE:** yes — 2026-08-30 — nextjs-frontend

### FE signoff notes (non-blocking)

- **Signoff:** yes — contract is FE-implementable against existing `/approvals` patterns (`ApprovalsListView`, `ApprovalPackageView`, RSC + Server Actions, `AppShell` layout).
- **Types/helpers:** `ApprovedListItemDto`, `ReadyToPublishPackageDto`, `listApprovedApprovals` result types, and `mediaAttachmentDownloadUrl` / `captionExportUrl` / `buildReadyToPublishDownloadUrls` in `lib/contracts/approval.ts` are sufficient for BUILD; detail pages derive download hrefs via helpers (no separate action DTO required).
- **Approve UX:** add PrimeReact `ConfirmDialog` before existing `decideApproval(…, 'approved')`; reject/request-changes two-step flows unchanged.
- **Post-approve panel:** after `status === 'approved'`, render download CTAs using contract URL helpers + link to `/ready-to-publish/[approvalId]`; stay on `/approvals/[approvalId]`.
- **TASKS.md drift:** FE BUILD must use `mediaAttachmentDownloadUrl(video.assetId)` — not `previewUrl + '?disposition=attachment'` (preview URL regex excludes query string).
- **Export error UX:** caption/video downloads use authenticated GET `<a href>` per contract; 404/401/429 cannot be mapped inline on navigation — acceptable V1; optional fetch-and-blob wrapper is out of scope unless VALIDATION asks.
- **Disputes:** none.

### FE signoff checklist (blocking BUILD)

- [ ] **Routes:** `/ready-to-publish` list + `/ready-to-publish/[approvalId]` detail wired in App Router shell (dashboard card + header nav).
- [ ] **List typing:** `ApprovedListItemDto` cards use `captionPreview` + `decidedAt`; empty state for `items: []`.
- [ ] **Detail guard:** `notFound()` when `getApprovalPackage` returns non-`approved` status.
- [ ] **Download hrefs:** use `mediaAttachmentDownloadUrl(assetId)` and `captionExportUrl(approvalId)` — never FE concat caption for export file.
- [ ] **Preview vs download:** inline `<video src={previewUrl}>`; download button uses attachment URL (different href).
- [ ] **ConfirmDialog:** wraps Approve only; same `decideApproval({ approvalId, decision: 'approved' })` payload.
- [ ] **Post-approve panel:** download links + link to `/ready-to-publish/[approvalId]`; stay on `/approvals/[approvalId]`.
- [ ] **i18n:** `readyToPublish.*` + `approvals.detail.confirmApprove` EN/ES.
- [ ] **Error UX:** map 404/401/429 on export navigation to user copy — no raw `{ error }` codes in UI.
- [ ] **Types:** import only from `lib/contracts/approval.ts` for new DTOs/helpers.

**Disputes:** None recorded at CONTRACT freeze.

---

**Frozen by:** nextjs-backend — 2026-08-30  
**Zod mirror:** `lib/contracts/approval.ts`
