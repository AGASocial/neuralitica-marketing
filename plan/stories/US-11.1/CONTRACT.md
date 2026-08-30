# API Contract — US-11.1 Present Reel package for client approval

**Story:** US-11.1  
**Status:** Frozen — 2026-08-30 · Reviewed by FE: yes — 2026-08-30 — nextjs-frontend.  
**Security:** `plan/stories/US-11.1/SECURITY.md` (APPROVE WITH CONDITIONS — reconciled below)  
**Spec review:** `plan/stories/US-11.1/SPEC-REVIEW.md` (ALIGNED — soft gaps closed below)  
**Pattern:** `plan/stories/US-10.2/CONTRACT.md` · `plan/stories/US-10.1/CONTRACT.md` · `plan/stories/US-9.2/CONTRACT.md` (media serve matrix widen)  
**Depends on:** US-10.1 ✅ Veredicto QA + gate helper · US-10.2 ✅ override ledger + gate ready via overrides · US-9.2 ✅ branded `assembled_reel` · US-6.1/US-6.2 ✅ caption + `selected_cta_index` · US-14.5 ✅ `requireActive()` / `requireOperator()`  
**Feature branch:** `feature/US-11.1-client-approval`  
**Error envelope style:** same class as US-10.2 / US-10.1 (`ok: true` vs `{ ok: false, error: { code, fields?, messageKey? } }`)

**This document is CONTRACT ONLY.** Zod mirrors live in `lib/contracts/approval.ts` (committed with this freeze). Server Actions under `lib/approvals/**`, media route widen, and migration SQL are specified here and applied during BUILD. Do **not** implement request-changes / `changes_requested` writes (US-11.2), ready-to-publish list / download polish (US-11.3), Cliente CTA picker, Cliente QA override, Instagram publish, weekly cron, or widen `generated_video` / `voiceover` in this story.

**Terminology:** **Aprobación** · **Paquete** · **Cliente** · **Operator** · **Ensamblado** · **caption de Instagram** · **disclosure** · **Veredicto QA**. Technical enums (`pending_client`, `assembled_reel`, `qaOverrides`, `previewUrl`, `approval_ensure`) OK in code/DB. Do **not** use CONTEXT _Evitar_ terms in Cliente-facing copy. Do **not** expose override as a Cliente capability. Do **not** expose `storage_key`, prompts, provider keys, raw LLM JSON, or spend cents on package DTOs.

**USER_STORIES surface amendment (binding):** Cliente primary routes are **`/approvals`** (list) + **`/approvals/[approvalId]`** (detail) — **not** `/reels/[id]/approve`. Dashboard `approvalsCard` CTA → `/approvals`. Header nav Approvals (EN/ES).

**USER_STORIES AC amendment (binding for VALIDATION):** Phase A closes package preview + **approve / reject** + [SEC] gate re-check + IDOR. FE owner-table “request changes” = **US-11.2**. Approve may set `status = approved` here; US-11.3 owns ready-to-publish list + download UX (no second approve path). DB shorthand `approvals` → canonical **`neuramark_approvals`**.

---

## SPEC-REVIEW gaps closed

| # | Gap | Resolution |
|---|-----|------------|
| 1 | No US-11.1 CONTRACT.md | This document |
| 2 | FE “request changes” on US-11.1 | § Phased BUILD · § Non-goals — Phase A Approve/Reject only; US-11.2 owns writes |
| 3 | Reject → “generate new piece?” | § Non-goals — Phase A records `rejected` + optional feedback only |
| 4 | Cliente CTA picker vs Operator-selected | § Package DTO · § Ensure — display `selectedCtaText`; create fails if CTA null |
| 5 | US-11.3 overlap on `approved` | § `decideApproval` — Phase A owns transition; US-11.3 owns queue/download UX |
| 6 | USER_STORIES DB shorthand `approvals` | § Migration — `neuramark_approvals` + `client_id` / `decided_by` |
| 7 | Weekly cron auto-enqueue | § Non-goals · ensure-on-list — no cron HTTP |
| 8 | Media serve Operator-only for `assembled_reel` | § Media serve matrix — widen owning Cliente only |
| 9 | Exact action / error / DTO names | Frozen throughout this document + `lib/contracts/approval.ts` |

## SECURITY reconciliation (binding)

| Topic | SECURITY condition | **Frozen in this contract** |
|-------|-------------------|----------------------------|
| Auth first | `requireActive("handler")` first on Cliente surfaces | § Surfaces · each action orchestrator step 1 |
| Gate re-check | Create **and** decide call `getQaGateStatusForAssembledReel`; `ready === true` required | § Gate · § `ensureApprovalPackageForAssembledReel` · § `decideApproval` |
| Gate purity | Never honor request `qaPassed` / `ready` / override flags | § Forbidden keys · § Gate |
| Pointer-only ensure | `{ assembledReelId }` `.strict()` | § Ensure request |
| Pointer-only decide | `{ approvalId, decision, clientFeedback? }` `.strict()` | § Decide request |
| Forbidden authority | Reject readiness / tenancy / status spoof | § `FORBIDDEN_APPROVAL_AUTHORITY_KEYS` · § `findForbiddenApprovalKeys` |
| Assembly prereqs | `completed` + `branding_status = completed` + non-null branded output | § Ensure orchestrator |
| CTA required | Non-null `selected_cta_index` else `CAPTION_CTA_NOT_SELECTED` | § Ensure |
| State machine Phase A | `pending_client` → `approved` \| `rejected` only | § State machine · § Decide |
| No `changes_requested` write | Decision enum excludes it | § Decide · § Non-goals |
| Tenancy / IDOR | Scope by server `client_id`; foreign → **404** | § All loads |
| Actor | `decided_by` / `client_id` from `getCurrentUser()` | § Decide · § Ensure INSERT |
| Feedback | Optional trim **0–500**; empty → NULL | § Feedback · Zod |
| Media widen | `assembled_reel` only; Cliente + Operator ownership paths | § Media serve matrix |
| Package DTO minimal | Authenticated `previewUrl`; qaOverrides read-only; no storage/cost/LLM | § Package DTO |
| XSS | Plain text / i18n / PrimeReact — no `dangerouslySetInnerHTML` | § Cliente FE contract |
| Rate limit | `approval_ensure` / `approval_decide` | § Rate limit |
| DDL + RLS | UNIQUE assembled reel; CHECK status; RLS zero policies | § Migration |
| No Cliente override | Audit render only | § Forbidden surfaces · § Non-goals |

---

## Phased BUILD acceptance

| Phase | Scope | Closes |
|-------|-------|--------|
| **A (US-11.1 BUILD — ship first)** | DDL `neuramark_approvals`; ensure/list/get/decide; gate re-check; package DTO; Cliente `assembled_reel` media serve; `/approvals` UI; rate limits; [SEC] IDOR + forbidden fields | USER_STORIES § US-11.1 AC (Phase A: approve/reject; request-changes deferred) |
| **B (US-11.2 — explicit story)** | Request-changes → `changes_requested`; revision_count; feedback routing | USER_STORIES § US-11.2 |
| **C (US-11.3 — explicit story)** | Ready-to-publish list; download/export polish | USER_STORIES § US-11.3 |

**VALIDATION note (binding):** Phase A closes US-11.1 without shipping request-changes or full US-11.3 download/ready queue. Record: gate re-check on create + decide; no client-supplied `qaPassed` / `ready`; media tenancy; CTA required on ensure; `changes_requested` not writable; approve transition may land here.

---

## Overview

US-11.1 ships **Cliente Aprobación V1 (Phase A)**. When a branded **Ensamblado** is QA-gated (`getQaGateStatusForAssembledReel` → `ready`) and caption has a selected CTA, the System **ensures** a `neuramark_approvals` row (`pending_client`); the **Cliente** lists pending packages on **`/approvals`**, previews the **Paquete** (video + caption + CTA + hashtags + disclosure + read-only QA overrides), and **decides** approve or reject — with the same gate re-checked before any status write. Media serve widens **`assembled_reel`** to the owning Cliente.

**Surfaces**

| # | Surface | Kind | Consumer |
|---|---------|------|----------|
| 1 | `ensureApprovalPackageForAssembledReel` | Server Action | `/approvals` list batch-ensure · detail ensure · optional Operator/dev trigger |
| 2 | `ensureApprovalPackageForAssembledReelForClient` | Server-only orchestrator | Action only (no browser HTTP) |
| 3 | `listPendingApprovals` | Server Action | `/approvals` list page |
| 4 | `getApprovalPackage` | Server Action | `/approvals/[approvalId]` detail |
| 5 | `decideApproval` | Server Action | Detail Approve / Reject CTAs |
| 6 | `decideApprovalForClient` | Server-only orchestrator | Action only |
| 7 | `getQaGateStatusForAssembledReel` | Server-only helper (import) | Ensure + decide gate — US-10.2 owned |
| 8 | `GET /api/media/assets/[assetId]` (widen) | Route Handler | Package `<video>` / optional cover poster |
| 9 | Zod + types | `lib/contracts/approval.ts` | FE types · BE validation |
| 10 | Migration | `neuramark_approvals` | Persistence |
| 11 | `/approvals` + `/approvals/[approvalId]` | FE | List + package preview + decide |

**Action name note:** PREP/SECURITY/TASKS use **`ensureApprovalPackageForAssembledReel`**. Conversational shorthand `ensureApprovalPackage` is **not** a second export — BUILD ships the full name above.

**Forbidden surfaces (BUILD veto):**

- Any Server Action / Route Handler that accepts `qaPassed`, `ready`, `passed`, `status` (as write authority), `clientId`, `decidedBy`, override spoof, or gate key lists as write authority.
- Phase A write of `changes_requested` or request-changes form.
- Cliente-callable `overrideQaCheck` / “mark QA passed”.
- Widening `generated_video` / `voiceover` to Cliente.
- Public / static / unauthenticated Storage URL for branded MP4.
- Second approve path for US-11.3.
- Weekly cron HTTP / IG publish / Fly FFmpeg jobs.
- Browser Supabase / `NEXT_PUBLIC_` Supabase keys.
- Cliente CTA picker (`selectReelCaptionCta` from Cliente).

**Why Server Actions:** UI-coupled Cliente mutations under `/approvals`; CSRF via Next.js origin check. Gate helper remains **server-only**. Media preview uses existing authenticated Route Handler (widened).

---

## Migration — `neuramark_approvals`

**Migration file (BUILD):** `supabase/migrations/20260831030000_neuramark_approvals.sql`

```sql
-- US-11.1: Cliente Aprobación package — one row per branded assembled reel

CREATE TABLE public.neuramark_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL
    REFERENCES public.neuramark_clients(id),
  assembled_reel_id uuid NOT NULL
    REFERENCES public.neuramark_assembled_reels(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending_client'
    CHECK (status IN (
      'pending_client',
      'approved',
      'rejected',
      'changes_requested'
    )),
  client_feedback text NULL
    CHECK (
      client_feedback IS NULL
      OR (
        char_length(client_feedback) >= 1
        AND char_length(client_feedback) <= 500
      )
    ),
  decided_at timestamptz NULL,
  decided_by uuid NULL
    REFERENCES public.neuramark_clients(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT neuramark_approvals_assembled_reel_id_uq UNIQUE (assembled_reel_id)
);

CREATE INDEX neuramark_approvals_client_status_created_idx
  ON public.neuramark_approvals (client_id, status, created_at DESC);

COMMENT ON TABLE public.neuramark_approvals IS
  'US-11.1: Cliente Aprobación package; one row per assembled_reel; Phase A writes pending_client|approved|rejected.';
COMMENT ON COLUMN public.neuramark_approvals.status IS
  'pending_client|approved|rejected|changes_requested — changes_requested reserved for US-11.2; never client-writable directly.';
COMMENT ON COLUMN public.neuramark_approvals.client_feedback IS
  'Optional reject notes (Phase A); trim 1–500 when set; empty stores NULL.';
COMMENT ON COLUMN public.neuramark_approvals.decided_by IS
  'Server-resolved actor from getCurrentUser() after requireActive — never from body.';
COMMENT ON COLUMN public.neuramark_approvals.client_id IS
  'Denormalized from owned assembly at INSERT — never from body.';

ALTER TABLE public.neuramark_approvals ENABLE ROW LEVEL SECURITY;
-- Zero policies: service-role Node only (deny-by-default for anon/authenticated).

CREATE OR REPLACE FUNCTION public.neuramark_approvals_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER neuramark_approvals_set_updated_at
  BEFORE UPDATE ON public.neuramark_approvals
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_approvals_set_updated_at();
```

| Rule | Detail |
|------|--------|
| Cardinality | Exactly **one** row per `assembled_reel_id` (UNIQUE) |
| Phase A writes | INSERT `pending_client`; UPDATE to `approved` \| `rejected` only |
| Reserved | `changes_requested` in CHECK for US-11.2 — **no** Phase A mutation writes it |
| No US-11.2 columns | No `revision_count` / `change_requests` JSON in this migration |
| Actor | `decided_by` from session on successful decide; NULL while pending |
| Cascade | Deleting assembly removes approval (`assembled_reel_id` ON DELETE CASCADE) |

---

## State machine (Phase A)

```ts
// Allowed transitions (server-enforced):
//   (insert) → pending_client
//   pending_client → approved
//   pending_client → rejected
//
// Forbidden in Phase A:
//   * → changes_requested
//   approved|rejected|changes_requested → *   (no re-decide)
//   pending_client → pending_client           (no-op update)
```

| From | To (Phase A) | Actor fields |
|------|--------------|--------------|
| _(none)_ | `pending_client` | INSERT: `client_id` from session; `decided_*` NULL |
| `pending_client` | `approved` | `decided_at = now()`, `decided_by = session.id`, clear or keep feedback NULL |
| `pending_client` | `rejected` | same + optional `client_feedback` |
| any other | — | **`INVALID_TRANSITION`** — no write |

**Publish:** Approve ≠ publish. No IG / calendar publish writes here (ADR-0002 / US-12.x re-check `approved` later).

---

## Forbidden request keys

Scan raw input with **`findForbiddenApprovalKeys`** before Zod parse → **`FORBIDDEN_FIELDS`**.

```ts
export const FORBIDDEN_APPROVAL_AUTHORITY_KEYS = [
  "qaPassed",
  "qa_passed",
  "passed",
  "ready",
  "gate",
  "overrides",
  "overrideAll",
  "override_all",
  "qaOverrides",
  "overriddenCheckKeys",
  "uncoveredFailedCheckKeys",
  "hasBlockingFailures",
  "hasOverridableFailures",
  "status",
  "checks",
  "severity",
  "blocking",
  "overridable",
  "clientId",
  "client_id",
  "decidedBy",
  "decided_by",
  "decidedAt",
  "decided_at",
  "operatorClientId",
  "operator_client_id",
  "userId",
  "user_id",
  "force",
  "skipGateCheck",
  "skip_gate_check",
  "previewUrl",
  "storage_key",
  "storageKey",
  "outputMediaAssetId",
  "output_media_asset_id",
  "caption",
  "hashtags",
  "selectedCtaText",
  "selected_cta_index",
  "disclosure",
  "video",
  "costCents",
  "estimatedCostCents",
  "changes_requested",
  "revision_count",
  "change_requests",
] as const;

/** Extra forbidden pointers per surface (union with authority keys in scanner). */
export const FORBIDDEN_APPROVAL_ENSURE_EXTRA_KEYS = [
  "approvalId",
  "approval_id",
] as const;
export const FORBIDDEN_APPROVAL_DECIDE_EXTRA_KEYS = [
  "assembledReelId",
  "assembled_reel_id",
] as const;
export const FORBIDDEN_APPROVAL_GET_EXTRA_KEYS = [
  "assembledReelId",
  "assembled_reel_id",
  "decision",
  "clientFeedback",
] as const;
```

**Path-specific allowed keys (after scan + Zod `.strict()`):**

| Action | Allowed |
|--------|---------|
| Ensure | `assembledReelId` |
| List | _(none — empty object / no body)_ |
| Get | `approvalId` |
| Decide | `approvalId`, `decision` (`approved` \| `rejected`), `clientFeedback?` |

**Note:** `findForbiddenApprovalKeys(input, surface)` unions `FORBIDDEN_APPROVAL_AUTHORITY_KEYS` with the surface extra list. Ensure forbids `approvalId`; decide/get forbid `assembledReelId` (resolve assembly from owned approval row).

---

## Gate — `getQaGateStatusForAssembledReel`

**Import (BUILD):** `lib/qa/get-qa-gate-status-for-assembled-reel.ts` (`import "server-only"`). **Do not fork** readiness rules.

```ts
// ready === true iff US-10.2 rules:
//   (a) status === "passed"
//   OR
//   (b) status === "failed"
//       && hasBlockingFailures === false
//       && every failed overridable check has ≥1 neuramark_qa_overrides row
// blocked | pending | running | missing → ready === false
```

| Hook | Rule |
|------|------|
| Ensure | Call helper with assembly id; `ready !== true` → **`QA_GATE_NOT_READY`**, **no INSERT** |
| Decide | Call again with approval’s `assembled_reel_id`; `ready !== true` → **`QA_GATE_NOT_READY`**, **no UPDATE** |
| Authority | DB report + overrides ledger only — **never** request flags |
| UI | Disabled Approve is **not** a control |

Optional informational `gate` slice on package detail DTO may mirror helper fields for UX copy — **never** as write authority.

---

## Feedback

| Constant | Value |
|----------|-------|
| `APPROVAL_FEEDBACK_MIN_LENGTH` | **0** (empty / omitted OK) |
| `APPROVAL_FEEDBACK_MAX_LENGTH` | **500** |

Trim whitespace. After trim: length `0` → store **`NULL`**; length `1–500` → store text; `> 500` → `VALIDATION_ERROR` on `clientFeedback`. Plain text only.

---

## Rate limit

Reuse `neuramark_agent_rate_limits`:

| Constant | Ensure | Decide |
|----------|--------|--------|
| `agent_key` | **`approval_ensure`** | **`approval_decide`** |
| Window | **60 minutes** rolling | **60 minutes** rolling |
| Max attempts | **30** per `client_id` / window | **30** per `client_id` / window |
| Over-limit | **`RATE_LIMITED`** (429) — no write | same |

Constants in `lib/contracts/approval.ts`: `APPROVAL_ENSURE_AGENT_KEY`, `APPROVAL_DECIDE_AGENT_KEY`, `APPROVAL_RATE_WINDOW_MS`, `APPROVAL_MAX_PER_WINDOW`.

UI debounce is **not** a control.

---

## `ensureApprovalPackageForAssembledReel({ assembledReelId })`

**Kind:** Server Action  
**File (BUILD):** `lib/approvals/actions/ensure-approval-package.ts`  
**Orchestrator (BUILD):** `lib/approvals/ensure-approval-package.ts` (`import "server-only"`) — `ensureApprovalPackageForAssembledReelForClient`  
**Consumer:** `/approvals` (batch on list) · detail hydrate · optional explicit ensure  
**Auth:** `requireActive("handler")` as **first await** — failure → 401/403, **no side effects**.

### Request

```ts
{
  assembledReelId: string; // uuid
} // .strict() only
```

### Success

```ts
{
  ok: true;
  package: ApprovalPackageDto; // full package (status typically pending_client)
  created: boolean; // true if INSERT happened; false if existing row returned
}
```

### Orchestrator steps

| Step | Action |
|------|--------|
| 1 | `requireActive("handler")` first — fail → 401/403, no side effects |
| 2 | Forbidden-key scan → `FORBIDDEN_FIELDS` |
| 3 | Zod `.strict()` → `{ assembledReelId }` |
| 4 | Rate limit `approval_ensure` → `RATE_LIMITED` |
| 5 | Load `neuramark_assembled_reels` **`WHERE id = $assembledReelId AND client_id = $serverClientId`** — miss → **`NOT_FOUND`** (404) |
| 6 | Require `status = 'completed'` **and** `branding_status = 'completed'` **and** non-null branded `output_media_asset_id` — else **`ASSEMBLY_NOT_READY`** / **`BRANDING_REQUIRED`** (prefer distinct codes; no INSERT) |
| 7 | `getQaGateStatusForAssembledReel(assembledReelId)` — `ready !== true` → **`QA_GATE_NOT_READY`** (no INSERT) |
| 8 | Load caption for assembly’s `reel_script_id` scoped by `client_id` — missing caption → **`CAPTION_REQUIRED`**; `selected_cta_index IS NULL` → **`CAPTION_CTA_NOT_SELECTED`** |
| 9 | If approval row exists for `assembled_reel_id` + `client_id` → compose package DTO, `created: false` (idempotent) |
| 10 | Else INSERT `pending_client` with `client_id` from session; compose package DTO, `created: true` |
| 11 | `revalidatePath("/approvals")` (and detail path if known) |
| 12 | Return success |

**Idempotent:** Second ensure returns existing row — does **not** reset `approved` / `rejected` / `changes_requested` to pending. If existing status is not `pending_client`, still return package (read) with `created: false` — decide remains the only writer for transitions. (Optional BUILD: if product wants ensure to refuse already-decided, return `INVALID_TRANSITION` — **frozen lean: return existing package**.)

---

## `listPendingApprovals()`

**Kind:** Server Action  
**File (BUILD):** `lib/approvals/actions/list-pending-approvals.ts`  
**Consumer:** `/approvals` list page  
**Auth:** `requireActive("handler")` first.

### Request

Empty / no body (or `{}` `.strict()`).

### Success

```ts
{
  ok: true;
  items: ApprovalListItemDto[]; // pending_client only; [] OK → empty state
}
```

### Orchestrator steps

| Step | Action |
|------|--------|
| 1 | `requireActive("handler")` |
| 2 | Optional **batch-ensure**: discover current client's assemblies that meet branding + gate + CTA; call ensure orchestrator per id (failures skip that reel — do not fail whole list) |
| 3 | SELECT approvals **`WHERE client_id = $serverClientId AND status = 'pending_client'`** `ORDER BY created_at DESC` |
| 4 | Map to list summaries (no foreign rows) |
| 5 | Return `{ ok: true, items }` |

**Phase A list:** **pending only** — no decided history. Empty array → FE empty state.

---

## `getApprovalPackage({ approvalId })`

**Kind:** Server Action  
**File (BUILD):** `lib/approvals/actions/get-approval-package.ts`  
**Consumer:** `/approvals/[approvalId]` detail  
**Auth:** `requireActive("handler")` first.

### Request

```ts
{
  approvalId: string; // uuid
} // .strict() only
```

### Success

```ts
{
  ok: true;
  package: ApprovalPackageDto;
}
```

### Orchestrator steps

| Step | Action |
|------|--------|
| 1 | `requireActive("handler")` |
| 2 | Forbidden-key scan + Zod |
| 3 | Load approval **`WHERE id = $approvalId AND client_id = $serverClientId`** — miss → **`NOT_FOUND`** (404) |
| 4 | Compose full package DTO (video, caption, hashtags, disclosure, qaOverrides, optional gate) |
| 5 | Return success |

Detail may show non-pending statuses if navigated by id (e.g. after decide) — list still pending-only.

---

## `decideApproval({ approvalId, decision, clientFeedback? })`

**Kind:** Server Action  
**File (BUILD):** `lib/approvals/actions/decide-approval.ts`  
**Orchestrator (BUILD):** `lib/approvals/decide-approval.ts` — `decideApprovalForClient`  
**Consumer:** `/approvals/[approvalId]` Approve / Reject  
**Auth:** `requireActive("handler")` first.

### Request

```ts
{
  approvalId: string; // uuid
  decision: "approved" | "rejected"; // Phase A only — NOT changes_requested
  clientFeedback?: string; // optional; trim 0–500; meaningful mainly on reject
} // .strict() only
```

### Success

```ts
{
  ok: true;
  approvalId: string;
  assembledReelId: string;
  status: "approved" | "rejected";
  decidedAt: string; // ISO
  summary: ApprovalListItemDto; // or minimal summary
}
```

### Orchestrator steps

| Step | Action |
|------|--------|
| 1 | `requireActive("handler")` first — fail → 401/403, no side effects |
| 2 | Forbidden-key scan → `FORBIDDEN_FIELDS` |
| 3 | Zod `.strict()`; feedback trim/length; `decision` ∉ `{ approved, rejected }` → `VALIDATION_ERROR` |
| 4 | Rate limit `approval_decide` → `RATE_LIMITED` |
| 5 | Load approval **`WHERE id = $approvalId AND client_id = $serverClientId`** — miss → **`NOT_FOUND`** |
| 6 | If `status !== 'pending_client'` → **`INVALID_TRANSITION`** (no write) |
| 7 | `getQaGateStatusForAssembledReel(approval.assembled_reel_id)` — `ready !== true` → **`QA_GATE_NOT_READY`** (no write) |
| 8 | UPDATE `status`, `decided_at = now()`, `decided_by = session.id`, `client_feedback` (NULL if empty; set on reject when provided; approve may force NULL) |
| 9 | `revalidatePath("/approvals")` + `revalidatePath("/approvals/[approvalId]")` |
| 10 | Return success summary |

**Forbidden:** writing `changes_requested`; accepting body `status` / `decidedBy`; skipping gate; double-decide.

---

## Package DTO

Server-composed only. Types in `lib/contracts/approval.ts`.

### `ApprovalPackageDto`

```ts
{
  approvalId: string;
  assembledReelId: string;
  status: ApprovalStatus; // pending_client | approved | rejected | changes_requested
  video: {
    assetId: string; // branded output_media_asset_id
    previewUrl: string; // "/api/media/assets/{assetId}" — authenticated route only
  };
  cover?: {
    assetId: string;
    previewUrl: string; // optional poster from cover_media_asset_id
  } | null;
  caption: {
    body: string;
    selectedCtaText: string; // non-empty when package was ensurable
    effectiveCaption: string; // buildEffectiveInstagramCaption({ caption, selectedCtaText, hashtags })
  };
  hashtags: string[];
  disclosure: {
    required: boolean;
    text?: string; // resolved locale line when required (or FE maps messageKey)
    messageKey?: string; // e.g. "legal.genericAvatarDisclosure"
  };
  qaOverrides: ApprovalQaOverrideDto[]; // read-only audit; [] if none
  gate?: {
    ready: boolean;
    status: QaReportStatus | null;
    overriddenCheckKeys: string[];
    uncoveredFailedCheckKeys: string[];
  }; // informational only
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### `ApprovalQaOverrideDto` (Cliente audit — US-10.2 handoff)

```ts
{
  overrideId: string;
  checkKey: string; // catalog key — FE maps scripts.qa.checks.* / qa.checks.*
  reason: string; // plain text ≤500
  createdAt: string; // ISO
}
```

**Omit on Cliente package:** `operatorDisplayName` (optional later); never Operator secrets.

### `ApprovalListItemDto`

```ts
{
  approvalId: string;
  assembledReelId: string;
  status: "pending_client"; // list Phase A
  createdAt: string;
  // Optional teaser fields for cards:
  captionPreview?: string; // truncated body
  hasDisclosure?: boolean;
  overrideCount?: number;
  videoAssetId?: string;
}
```

**Never in any approval DTO:** `storage_key`, prompts, raw LLM JSON, spend/cost fields, service-role material, writable `clientId`, client-supplied gate flags.

**Disclosure authority:** `required === true` when script/assembly lineage indicates `mustDiscloseNotOwner` (or equivalent server-owned rule from US-3.4 / profile visual rules) — **never** from request. Reuse `legal.genericAvatarDisclosure` + `GenericAvatarDisclosurePreview` (`variant: "approval"`).

**Caption composition:** Import `buildEffectiveInstagramCaption` / `resolveSelectedCtaVariant` from `lib/contracts/reel-caption.ts` — never concatenate in FE for authoritative export fields.

---

## Media serve matrix (US-9.2 → US-11.1 widen)

**File (BUILD):** extend `app/api/media/assets/[assetId]/route.ts`

| `asset_type` | Auth after US-11.1 |
|--------------|-------------------|
| `assembled_reel` | **Cliente:** `requireActive("handler")` + `row.client_id === user.id` **or** **Operator:** `requireOperator("handler")` + `row.client_id === operator.id` |
| `generated_video` / `voiceover` | **Operator only** (unchanged — do **not** widen) |
| `client_logo` / `cover_frame` | Unchanged (already Cliente-capable + ownership) |

### Branch order (frozen)

```ts
// assembled_reel:
// 1. Validate assetId uuid
// 2. Load media row (service-role)
// 3. Try requireActive("handler"); if ok && row.client_id === user.id → serve
// 4. Else try requireOperator("handler"); if ok && row.client_id === operator.id → serve
// 5. Else 401/403/404 per house pattern (ownership miss → 404 uniform)
```

| Rule | Detail |
|------|--------|
| `previewUrl` | Always `/api/media/assets/{uuid}` — never Storage public URL, long-lived signed URL in HTML, or `/public` |
| Cache | `Cache-Control: private, no-store` |
| Cover poster | Optional; `cover_frame` already Cliente-scoped |
| Grep test | No public static serve of assembled MP4 |

---

## Cliente FE contract

| Element | Behavior |
|---------|----------|
| Routes | `app/(app)/approvals/page.tsx` + `app/(app)/approvals/[approvalId]/page.tsx` |
| List | Pending cards; **empty** / loading / error; optional batch-ensure on load |
| Detail | `<video src={previewUrl}>`; caption + selected CTA; hashtags; disclosure when `required`; read-only qaOverrides |
| CTAs | **Approve** + **Reject** (optional feedback textarea); **no** request-changes control |
| Pending | Disable decide while action pending; map `QA_GATE_NOT_READY`, `CAPTION_CTA_NOT_SELECTED`, `INVALID_TRANSITION`, 404 |
| Nav | Dashboard `approvalsCard` → `/approvals`; header Approvals EN/ES |
| XSS | React text / i18n / PrimeReact only — **no** `dangerouslySetInnerHTML` |
| Authority | Hidden/disabled buttons are **not** controls; server gate + state machine remain authority |
| Types | Import from `lib/contracts/approval.ts` only — no client-supplied gate flags |

**i18n namespace:** `approvals.*` (+ reuse `legal.genericAvatarDisclosure`, QA check labels).

---

## Error codes

```ts
export const approvalErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "FORBIDDEN_FIELDS",
  "QA_GATE_NOT_READY",
  "ASSEMBLY_NOT_READY",
  "BRANDING_REQUIRED",
  "CAPTION_REQUIRED",
  "CAPTION_CTA_NOT_SELECTED",
  "INVALID_TRANSITION",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
]);
```

| Code | HTTP-ish | When |
|------|----------|------|
| `UNAUTHENTICATED` | 401 | No session |
| `FORBIDDEN` | 403 | Inactive / not allowed |
| `NOT_FOUND` | 404 | Foreign or missing approval / assembly |
| `FORBIDDEN_FIELDS` | 400 | Authority key smuggle |
| `VALIDATION_ERROR` | 400 | Zod / feedback length / bad decision |
| `QA_GATE_NOT_READY` | 409 | Gate `ready !== true` on ensure or decide |
| `ASSEMBLY_NOT_READY` | 409 | Assembly not `completed` |
| `BRANDING_REQUIRED` | 409 | Branding not completed / missing branded output |
| `CAPTION_REQUIRED` | 409 | No caption row for reel |
| `CAPTION_CTA_NOT_SELECTED` | 409 | `selected_cta_index` NULL |
| `INVALID_TRANSITION` | 409 | Not `pending_client` or illegal decision |
| `RATE_LIMITED` | 429 | ensure/decide window exceeded |
| `INTERNAL_ERROR` | 500 | Unexpected |

---

## Fixtures (FE mock)

### Ensure request

```json
{
  "assembledReelId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
}
```

### Ensure success

```json
{
  "ok": true,
  "created": true,
  "package": {
    "approvalId": "11111111-2222-4333-8444-555555555555",
    "assembledReelId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    "status": "pending_client",
    "video": {
      "assetId": "99999999-aaaa-4bbb-8ccc-dddddddddddd",
      "previewUrl": "/api/media/assets/99999999-aaaa-4bbb-8ccc-dddddddddddd"
    },
    "cover": {
      "assetId": "88888888-aaaa-4bbb-8ccc-dddddddddddd",
      "previewUrl": "/api/media/assets/88888888-aaaa-4bbb-8ccc-dddddddddddd"
    },
    "caption": {
      "body": "This week we open early for locals who need a quick win.",
      "selectedCtaText": "Book your free consult today.",
      "effectiveCaption": "This week we open early for locals who need a quick win.\n\nBook your free consult today.\n\n#localbiz #consult"
    },
    "hashtags": ["#localbiz", "#consult"],
    "disclosure": {
      "required": true,
      "messageKey": "legal.genericAvatarDisclosure",
      "text": "This video uses an AI presenter who is not the business owner."
    },
    "qaOverrides": [
      {
        "overrideId": "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
        "checkKey": "tone",
        "reason": "Client-approved soft claim; tone acceptable for local market.",
        "createdAt": "2026-08-30T18:00:00.000Z"
      }
    ],
    "gate": {
      "ready": true,
      "status": "failed",
      "overriddenCheckKeys": ["tone"],
      "uncoveredFailedCheckKeys": []
    },
    "decidedAt": null,
    "createdAt": "2026-08-30T19:00:00.000Z",
    "updatedAt": "2026-08-30T19:00:00.000Z"
  }
}
```

### List success (empty)

```json
{
  "ok": true,
  "items": []
}
```

### Decide request — approve

```json
{
  "approvalId": "11111111-2222-4333-8444-555555555555",
  "decision": "approved"
}
```

### Decide request — reject

```json
{
  "approvalId": "11111111-2222-4333-8444-555555555555",
  "decision": "rejected",
  "clientFeedback": "CTA feels too aggressive for our brand."
}
```

### Decide success

```json
{
  "ok": true,
  "approvalId": "11111111-2222-4333-8444-555555555555",
  "assembledReelId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "status": "approved",
  "decidedAt": "2026-08-30T19:05:00.000Z",
  "summary": {
    "approvalId": "11111111-2222-4333-8444-555555555555",
    "assembledReelId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    "status": "approved",
    "createdAt": "2026-08-30T19:00:00.000Z"
  }
}
```

### Error — ungated decide

```json
{
  "ok": false,
  "error": {
    "code": "QA_GATE_NOT_READY",
    "messageKey": "approvals.errors.qaGateNotReady"
  }
}
```

### Error — CTA missing on ensure

```json
{
  "ok": false,
  "error": {
    "code": "CAPTION_CTA_NOT_SELECTED",
    "messageKey": "approvals.errors.captionCtaNotSelected"
  }
}
```

### Error — qaPassed smuggle

```json
{
  "ok": false,
  "error": {
    "code": "FORBIDDEN_FIELDS",
    "messageKey": "approvals.errors.forbiddenFields",
    "fields": { "qaPassed": ["FORBIDDEN"] }
  }
}
```

### Error — foreign approval

```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "messageKey": "approvals.errors.notFound"
  }
}
```

### Error — double decide

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_TRANSITION",
    "messageKey": "approvals.errors.invalidTransition"
  }
}
```

### Error — changes_requested smuggle

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "messageKey": "approvals.errors.validation",
    "fields": { "decision": ["INVALID"] }
  }
}
```

---

## Closed write surface

**Only** these modules may INSERT/UPDATE `neuramark_approvals` status in Phase A:

- `lib/approvals/ensure-approval-package.ts` — INSERT `pending_client` only
- `lib/approvals/decide-approval.ts` — UPDATE `pending_client` → `approved` \| `rejected` only
- **Zero** Route Handlers write approvals
- **Zero** Cliente override / QA pass writers
- **Zero** Phase A writers of `changes_requested`

Gate readiness remains owned by US-10.1/10.2 modules (read-only import).

---

## Non-goals (explicit)

| Out | Owner / note |
|-----|----------------|
| Request-changes UI / `changes_requested` writes / revision_count | **US-11.2** |
| Ready-to-publish list polish / download-export UX / webhook stub | **US-11.3** |
| Reject → auto “generate new?” prompt | Soft follow-up |
| Cliente CTA variant picker | Defer — Operator US-6.2 |
| Cliente override / mark QA passed | **Forbidden** |
| Widen `generated_video` / `voiceover` | **Forbidden** |
| Weekly cron enqueue | ADR-0001 integrations |
| Instagram publish | ADR-0002 / US-12.x |
| Decided history on `/approvals` list | Phase A pending-only |
| RBAC beyond `requireActive` / `requireOperator` | Unchanged |
| Browser Supabase | Forever out |

---

## Downstream obligations

| Consumer | Obligation |
|----------|------------|
| **US-11.2** | May write `changes_requested` + revision columns; treat feedback as untrusted prompt fuel; do not weaken Phase A decide schema early |
| **US-11.3** | Ready-to-publish list + download via authenticated ownership routes; **no** second approve path — consume `status = approved` from 11.1 |
| **ADR-0002 publish** | Re-check `approved` (+ live consent/QA as required) server-side |
| **nextjs-frontend** | Presentation only; Approve/Reject; no request-changes; no HTML sinks; types from contracts |

---

## Security tests (minimum)

1. Inactive / anon → ensure/list/get/decide → **401/403**, no write  
2. Ungated ensure → **`QA_GATE_NOT_READY`**, no row  
3. Ungated decide → **`QA_GATE_NOT_READY`**, status unchanged  
4. Smuggled `qaPassed` / `ready` / `status` / `clientId` / `decidedBy` → **`FORBIDDEN_FIELDS`**  
5. Foreign `approvalId` / `assembledReelId` → **404**  
6. Cliente own `assembled_reel` media → **200**  
7. Cliente foreign `assembled_reel` → **404**  
8. Cliente `generated_video` / `voiceover` still denied  
9. Double-decide → **`INVALID_TRANSITION`**  
10. `decision: "changes_requested"` rejected (Zod / validation)  
11. Feedback `> 500` → `VALIDATION_ERROR`  
12. CTA null on ensure → **`CAPTION_CTA_NOT_SELECTED`**  
13. Gate helper not passed request flags (unit)  
14. RLS enabled, zero policies on `neuramark_approvals`  
15. Grep — no public static serve of assembled MP4  
16. `requireActive("handler")` is first await on Cliente actions  
17. Rate limit over-limit → **`RATE_LIMITED`**

---

## Module placement (BUILD)

| Module | Path |
|--------|------|
| Contracts | `lib/contracts/approval.ts` |
| Forbidden keys | `lib/approvals/find-forbidden-approval-keys.ts` |
| Ensure orchestrator | `lib/approvals/ensure-approval-package.ts` |
| Decide orchestrator | `lib/approvals/decide-approval.ts` |
| Package composer | `lib/approvals/compose-approval-package.ts` |
| Persist / load | `lib/approvals/persist-approval.ts` (or siblings) |
| Server Actions | `lib/approvals/actions/*.ts` |
| Gate helper | existing `lib/qa/get-qa-gate-status-for-assembled-reel.ts` (import only) |
| Caption helpers | existing `lib/contracts/reel-caption.ts` |
| Media route | `app/api/media/assets/[assetId]/route.ts` (widen) |
| Migration | `supabase/migrations/20260831030000_neuramark_approvals.sql` |
| FE pages | `app/(app)/approvals/**` |

---

## Open decisions frozen here (no longer open)

| # | Topic | Frozen choice |
|---|-------|---------------|
| 1 | Routes | `/approvals` + `/approvals/[approvalId]` |
| 2 | Phase A decisions | Approve + Reject only |
| 3 | Ensure-on-list | Allowed; gate-bound; no Operator “Send” button |
| 4 | Reject feedback | Optional 0–500 |
| 5 | List history | Pending only Phase A |
| 6 | Cliente CTA picker | Out — display Operator selection |
| 7 | Download on approve | Out → US-11.3 |
| 8 | Rate limit | Yes — `approval_ensure` / `approval_decide`, 30 / 60 min |
| 9 | Ensure action name | `ensureApprovalPackageForAssembledReel` |
| 10 | Media branch order | Try Cliente ownership, then Operator ownership |
| 11 | Idempotent ensure on decided row | Return existing package (`created: false`) |
| 12 | Live consent re-check at decide | Rely on QA gate Phase A; publish re-checks later |

---

## Disputes / FE review notes

**Resolved by FE signoff (2026-08-30)** — see § Reviewed by FE. Summary:

1. **List card density** — Cards: `captionPreview` + `createdAt` (+ optional `overrideCount` / `hasDisclosure` when present).  
2. **Ensure timing** — Prefer server batch-ensure inside `listPendingApprovals`.  
3. **Reject feedback UX** — Optional textarea shown when Reject is chosen.  
4. **Post-decide navigation** — Stay on detail read-only; link back to list.  
5. **Decide success `summary.status`** — Confirmed `approved` \| `rejected`; list stays pending-only.

**No open disputes that reopen DDL, gate purity, media matrix, or Phase A decision enum.**

---

## Reviewed by FE

**Reviewed by FE:** yes — 2026-08-30 — nextjs-frontend.

**Verdict:** Accept — Cliente `/approvals` list + `/approvals/[approvalId]` package preview, Approve/Reject, media `previewUrl`, and i18n are implementable against existing App Router shell (`AppHeader` + dashboard cards). No forbidden client authority fields in the FE write path. Types/fixtures in `lib/contracts/approval.ts` match the UI flow.

**FE resolutions (UX disputes — frozen for BUILD):**

| # | Topic | FE choice |
|---|-------|-----------|
| 1 | List card density | **`captionPreview` + `createdAt`** as primary card copy. Render `overrideCount` / `hasDisclosure` as secondary chips when BE includes them. Do **not** ship ids-only cards. |
| 2 | Ensure timing | **Prefer list batch-ensure** inside `listPendingApprovals` (failures skip reel). Detail uses `getApprovalPackage` (optional ensure only if product later needs hydrate-by-assembly). |
| 3 | Reject feedback UX | **Optional** `InputTextarea`; show primarily when user selects **Reject**. Omit/empty → server NULL. Not required to submit reject. |
| 4 | Post-decide navigation | **Stay on detail** in read-only mode (status Tag + decidedAt; decide CTAs hidden). Provide back-link to `/approvals`. Rely on `revalidatePath` for list + detail. |
| 5 | Decide `summary.status` | **Confirmed** — toast / local merge use `approved` \| `rejected` from decide success; Phase A list remains pending-only (item disappears after revalidate). |

**BUILD notes (FE):**

- **Routes:** `app/(app)/approvals/page.tsx` (RSC list) + `app/(app)/approvals/[approvalId]/page.tsx` (RSC detail). Small Client islands for video controls + Approve/Reject form only.
- **Shell / nav:** Wire dashboard `approvalsCard` → `href: "/approvals"` (same pattern as profile/preferences cards). Add `header.nav.approvals` link in `AppHeader` next to Dashboard for **Cliente** (and Operator if useful — not Operator-gated). EN/ES.
- **Server Actions:** `listPendingApprovals` · `getApprovalPackage` · `decideApproval({ approvalId, decision, clientFeedback? })`. Never send `qaPassed` / `ready` / `status` / `clientId` / override keys. Optional explicit `ensureApprovalPackageForAssembledReel` not required for V1 list UX if batch-ensure runs in list.
- **List:** Pending cards → detail; empty / loading / error states. Map error codes via `approvals.errors.*`.
- **Detail:** `<video src={previewUrl}>` (+ optional cover poster); caption body + selected CTA + hashtags; `GenericAvatarDisclosurePreview` `variant: "approval"` when `disclosure.required`; read-only `qaOverrides` (i18n `checkKey`, plain `reason`). Informational `gate` may disable Approve copy-only — **server remains authority**.
- **Decide:** Approve + Reject only; disable while pending; toast `QA_GATE_NOT_READY` / `INVALID_TRANSITION` / `NOT_FOUND` / `RATE_LIMITED`. No request-changes control.
- **Types:** Import from `lib/contracts/approval.ts` only. Reuse `legal.genericAvatarDisclosure` + QA check label keys where present.
- **i18n:** Add `approvals.*` (list/detail titles, CTAs, empty, feedback label, status tags, errors for all `ApprovalErrorCode`s) EN + ES; `header.nav.approvals`.
- **Out of scope:** Request-changes (US-11.2); download/ready queue (US-11.3); Cliente CTA picker; Cliente QA override; HTML sinks.

**Disputes:** None blocking BUILD. Soft BE preference: always populate `captionPreview` on list items for card UX.

---

**Reviewed by FE:** yes — 2026-08-30 — nextjs-frontend.  
**Frozen by:** nextjs-backend — 2026-08-30  
**Zod mirror:** `lib/contracts/approval.ts`
