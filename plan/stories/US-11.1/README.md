# US-11.1 — Present Reel package for client approval

**Status:** PREP (2026-08-30) — PO decisions frozen; next SPEC-REVIEW → SECURITY → CONTRACT. Do **not** check off AC in `plan/USER_STORIES.md`.

**As a** Client, **I want** to preview video, caption, and CTA together, **so that** I can approve what will represent my business.

Ship **Cliente Aprobación V1 (Phase A)**: gated **paquete** (branded Ensamblado video + caption + hashtags + disclosure + QA override audit) on **`/approvals`**; create `pending_client` rows only when assembly+QA gate ready; **approve** / **reject** decisions with server-side gate re-check; widen **`assembled_reel`** media serve so Cliente can preview. **Request changes** deferred to **US-11.2**. Publish-ready list polish + download export deferred to **US-11.3** (approve → `approved` still lands here so the state machine exists).

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-11.1 (do **not** check off in PREP).

**This folder:** [`plan/stories/US-11.1/`](./) — `README.md` · `TASKS.md`. Next: `SPEC-REVIEW.md` · `SECURITY.md` · `CONTRACT.md` (not created in PREP).

**Branch:** `feature/US-11.1-client-approval`

**Depends on:** [US-10.1](../US-10.1/) ✅ Veredicto QA + gate helper · [US-10.2](../US-10.2/) ✅ override ledger + gate ready via overrides · [US-9.2](../US-9.2/) ✅ branded `assembled_reel` (+ media serve currently Operator-only for video). Soft continuity: [US-6.1](../US-6.1/) / [US-6.2](../US-6.2/) caption + `selectedCtaText` (package create requires CTA selected).

**Upstream contracts:** [US-10.2 CONTRACT](../US-10.2/CONTRACT.md) (`getQaGateStatusForAssembledReel`, override DTO) · [US-10.1 CONTRACT](../US-10.1/CONTRACT.md) · [US-9.2 CONTRACT](../US-9.2/CONTRACT.md) (media serve matrix — **widen** `assembled_reel` here) · [US-6.2](../US-6.2/) (`CAPTION_CTA_NOT_SELECTED` seam).

**Unblocks:** [US-11.2](../../USER_STORIES.md) revision round · [US-11.3](../../USER_STORIES.md) ready-to-publish / download polish · Instagram Publish (ADR-0002) re-check `approved`.

---

## Scope in

| Area | What US-11.1 BUILD adds |
|------|-------------------------|
| **FE (Cliente)** | **`/approvals`** list (empty / pending) + **`/approvals/[approvalId]`** package preview: video player, caption + selected CTA, hashtags, disclosure when required, QA override audit (read-only), **Approve** / **Reject**; mobile-friendly; EN/ES. Dashboard “Pending approvals” card CTA → `/approvals`. |
| **BE** | DDL `neuramark_approvals`; idempotent **ensure/create** package when gate ready; **list** + **get package** (Cliente-scoped); **decide** approve/reject; re-check **`getQaGateStatusForAssembledReel`** on create **and** decide; widen media serve for owned `assembled_reel` (+ cover optional); package DTO with overrides audit. |
| **DB** | **`neuramark_approvals`** lean schema (see PO freezes). RLS deny-by-default. |
| **Implementers** | **nextjs-backend** + **nextjs-frontend** only. **No** content-agents-engineer · **No** media-pipeline · **No** integrations. |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **US-11.2** `changes_requested`, revision_count, change-request form, downstream re-run routing | Soft next — Phase A does **not** write `changes_requested`. |
| **US-11.3** ready-to-publish list polish, download/export UX confirmation, webhook/email stub | Soft next — Phase A may set `status = approved` + `decided_at`; download link optional minimal only if trivial. |
| **Cliente CTA variant picker** | Operator selects via US-6.2; package **displays** `selectedCtaText`. SPEC “elegir variante al aprobar” → Phase B / US-11.3 if product insists. |
| **Reject → “generate new piece?” prompt** | SPEC soft follow-up; Phase A records `rejected` + optional feedback; Operator/system regen later. |
| **Weekly cron auto-enqueue** | integrations-engineer (ADR-0001); Phase A uses ensure-on-list / ensure-on-detail. |
| **Instagram publish** | US-12.x / ADR-0002. |
| **Operator override UI** | US-10.2 — Cliente **renders** audit only. |
| **RBAC** beyond `requireActive` / existing Operator helpers | Unchanged. |

## Canonical terms (CONTEXT)

Use **Aprobación**, **Cliente**, **Operator**, **Ensamblado**, **Paquete**, **caption de Instagram**, **disclosure**, **Veredicto QA**.  
_Evitar:_ “approval decision” as product noun; admin/staff; exposing Operator override as a Cliente capability.

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-9.2 | Branded `neuramark_assembled_reels` (`branding_status = completed`, `output_media_asset_id`); media serve **Operator-only** for `assembled_reel` — **this story widens**. |
| US-10.1 / US-10.2 | `getQaGateStatusForAssembledReel` → `ready` iff `passed` **or** (`failed` ∧ full overridable override coverage); `overrides[]` / key lists for audit render. |
| US-6.1 / US-6.2 | Caption + hashtags + `selectedCtaIndex` / `selectedCtaText`; `buildEffectiveInstagramCaption`; package create **requires** selected CTA. |
| US-5.1 | Script → assembly lineage via `reel_script_id`. |
| Dashboard | Placeholder **approvalsCard** (“Review reels”) — wire to `/approvals`. |

**US-11.1 adds Cliente Aprobación queue + package preview + approve/reject** — not revision loops, not publish.

---

## Phased BUILD (PO)

| Phase | Scope | Closes |
|-------|-------|--------|
| **A (US-11.1 BUILD — ship first)** | DDL `neuramark_approvals` · ensure package when gate ready · `/approvals` list + detail · package DTO (video, caption, hashtags, disclosure, overrides audit) · approve + reject · gate re-check on create + decide · Cliente `assembled_reel` media serve · empty/pending states · [SEC] IDOR 404 · EN/ES | USER_STORIES § US-11.1 AC (Phase A interpretation: approve/reject; request-changes UI deferred) |
| **B (US-11.2 — explicit story)** | Request-changes → `changes_requested`; revision_count; feedback routing | USER_STORIES § US-11.2 |
| **C (US-11.3 — explicit story)** | Ready-to-publish list; download/export; approve confirmation polish | USER_STORIES § US-11.3 |

**VALIDATION note (binding):** Phase A closes US-11.1 without shipping request-changes or full US-11.3 download/ready queue. AC FE phrase “approve/reject/request changes” — **request changes = US-11.2**. Approve may set `approved` here; US-11.3 owns publish-queue UX. VALIDATION must record: gate re-check on create + decide; no client-supplied `qaPassed` / `ready`; media serve tenancy; CTA required for package create.

---

## Upstream / downstream handoffs

| Direction | Artifact | Rule |
|-----------|----------|------|
| **From US-10.2** | `getQaGateStatusForAssembledReel` + override audit fields | Create + decide require `ready === true`; never honor body `qaPassed` / `ready` |
| **From US-9.2** | Branded `output_media_asset_id` (`assembled_reel`) | Preview URL = `/api/media/assets/{id}` after serve widen |
| **From US-6.2** | `selectedCtaIndex` / `selectedCtaText` | Package create fails if CTA null (`CAPTION_CTA_NOT_SELECTED`) |
| **To US-11.2** | Row in `pending_client`; optional `client_feedback` column reuse | Only US-11.2 writes `changes_requested` |
| **To US-11.3 / Publish** | `status = approved` + `decided_at` | Publish re-checks `approved` (ADR-0002) |

---

## PO decisions frozen (2026-08-30)

| # | Topic | Decision |
|---|-------|----------|
| 1 | **Route surface** | **Cliente primary:** **`/approvals`** (list) + **`/approvals/[approvalId]`** (package). **Not** `/reels/[id]/approve` (no Cliente `/reels` tree; assembled vs script ID ambiguity). Dashboard approvals card CTA → `/approvals`. Header nav: add **Approvals** link for Cliente (EN/ES). |
| 2 | **Phase A decisions** | **Approve + Reject only.** Hide request-changes control (no disabled stub that implies write). `changes_requested` remains a **valid DB enum value** for SPEC/US-11.2 but **no Phase A mutation** writes it. |
| 3 | **Approve semantics (vs US-11.3)** | Phase A **`decideApproval(…, 'approved')`** sets `status = approved`, `decided_at`, `decided_by`. US-11.3 adds ready-to-publish list + download/export polish — not a second approve path. |
| 4 | **Reject semantics** | `status = rejected`; optional `clientFeedback` (plain text, length-capped — CONTRACT; PO lean **0–500** trim, empty OK). No auto-regen prompt in Phase A. |
| 5 | **Table** | **`neuramark_approvals`**. One row per **`assembled_reel_id`** (**UNIQUE**). |
| 6 | **DDL columns (lean)** | `id` uuid PK · `client_id` uuid NOT NULL → `neuramark_clients` · `assembled_reel_id` uuid NOT NULL UNIQUE → `neuramark_assembled_reels` · `status` text NOT NULL CHECK (`pending_client` \| `approved` \| `rejected` \| `changes_requested`) DEFAULT `pending_client` · `client_feedback` text NULL · `decided_at` timestamptz NULL · `decided_by` uuid NULL → `neuramark_clients` · `created_at` / `updated_at`. Index `(client_id, status, created_at DESC)`. **No** `revision_count` / `change_requests` JSON here (US-11.2). RLS ENABLE; **zero** policies. |
| 7 | **Package create** | Idempotent **`ensureApprovalPackageForAssembledReel`** (CONTRACT name): require branding complete + gate `ready` + caption with **non-null** `selected_cta_index`; INSERT `pending_client` if missing; if row exists return it. List path may batch-ensure for client’s gated assemblies. |
| 8 | **Gate re-check** | Call **`getQaGateStatusForAssembledReel`** on **create** and on **every decide**. If not ready → typed error (e.g. `QA_GATE_NOT_READY`); **no** status write. Never accept client `qaPassed` / `ready` / `overrides`. |
| 9 | **Assembly prerequisite** | Create also requires assembly `status = completed` **and** `branding_status = completed` with non-null branded `output_media_asset_id` (same bar as US-10.1 QA input). |
| 10 | **Package DTO (frozen shape — CONTRACT Zod)** | Server-owned object for detail (and list summary subset): **`video`**: `{ assetId, previewUrl }` (branded MP4 via authenticated media route); **`caption`**: `{ body, selectedCtaText, effectiveCaption? }` (use `buildEffectiveInstagramCaption`); **`hashtags`**: `string[]`; **`disclosure`**: `{ required: boolean, textKey or text }` when `mustDiscloseNotOwner` / disclosure policy requires visible AI disclosure; **`qaOverrides`**: audit list from US-10.2 shape (`checkKey`, `reason`, `createdAt`, optional display); **`gate`**: informational `{ ready, status, overriddenCheckKeys, … }` optional on detail; **ids**: `approvalId`, `assembledReelId`, `status`, timestamps. **Never:** `storage_key`, prompts, spend, raw LLM JSON, foreign `clientId` write fields. |
| 11 | **List empty / pending** | **Empty:** no `pending_client` for current Cliente → empty state copy (EN/ES). **Pending:** cards/rows for `pending_client` only on default list (decided items out of Phase A primary list — optional “history” deferred). Loading + error states required. |
| 12 | **Media serve widen** | Extend `GET /api/media/assets/[assetId]` for **`assembled_reel`**: allow **`requireActive("handler")`** when `row.client_id === session.id` (same IDOR 404 as logo/cover). Keep Operator path. **Do not** widen `generated_video` / `voiceover` to Cliente. Cover frame already Cliente-scoped — package may use cover as poster. |
| 13 | **Auth** | Cliente surfaces: **`requireActive("handler")`** first. Mutations scoped to `getCurrentUser().id` as `client_id`. Foreign approval/assembled IDs → **404**. Operator-only tooling for enqueue not required Phase A. |
| 14 | **State machine (Phase A writes)** | `pending_client` → `approved` \| `rejected` only. Already-decided → reject transition (typed). `changes_requested` reserved. |
| 15 | **CTA at approve** | Display Operator-selected CTA only; **no** Cliente `selectReelCaptionCta` in Phase A. |
| 16 | **i18n** | `approvals.*` (+ reuse disclosure/QA check labels where safe). Dashboard card already exists — wire href. |
| 17 | **Implementers** | **nextjs-backend** + **nextjs-frontend**. |
| 18 | **USER_STORIES soft notes** | FE owner table lists request-changes — **Phase A defers to US-11.2**. Depends line already lists US-10.2 ✅. |

---

## Gates (orchestrator)

- [x] PREP — README + TASKS + PO freezes (this commit)
- [ ] SPEC-REVIEW.md (spec-guardian)
- [ ] SECURITY.md (security-architect)
- [ ] CONTRACT.md (nextjs-backend) + FE Reviewed by
- [ ] BUILD · VALIDATION · QA · CLOSE

**Next:** SPEC-REVIEW → SECURITY → CONTRACT (no code in PREP).

---

## Open questions (for SECURITY / CONTRACT — not PO blockers)

| # | Question | PO lean |
|---|----------|---------|
| 1 | Ensure-on-list vs explicit Operator “Send to approval”? | **Ensure-on-list/detail** (SPEC auto queue); no Operator send button Phase A. |
| 2 | Reject feedback required? | **Optional** 0–500. |
| 3 | Show decided history on `/approvals`? | **No** Phase A — pending only. |
| 4 | Cliente CTA picker at approve (SPEC)? | **Defer** — Operator selection required upstream. |
| 5 | Minimal download on approve? | **Defer to US-11.3** unless CONTRACT wants preview-only. |

---

## SPEC alignment / blockers for spec-guardian

| Item | Assessment |
|------|------------|
| SPEC S3.M12 Cliente preview paquete; state machine; gate ensamblado+QA | **Aligned** — Phase A preview + gate + `pending_client`→`approved`/`rejected`. |
| SPEC pedir cambios (máx 1 ronda) | **Soft gap / phased** — US-11.2 owns; Phase A hides control. Not a PREP blocker if VALIDATION notes Phase A AC interpretation. |
| SPEC rechazar → preguntar si generar nueva | **Soft gap** — Phase A reject only; regen prompt later. |
| SPEC elegir variante CTA al aprobar | **Soft gap** — Operator selects (US-6.2); Cliente display. Escalate only if product requires Cliente picker in 11.1. |
| SPEC / US-9.2 Operator-only assembled video | **Intentional widen** in this story for Cliente preview — document in CONTRACT + SECURITY. |
| SC-2 no publish without Aprobación | **Aligned** — no publish writes here. |
| CONTEXT **Aprobación** terminology | **Aligned**. |

**No hard SPEC amendment required** for PREP → SECURITY/CONTRACT. Soft gaps are explicit Phase A deferrals to US-11.2 / US-11.3.
