# US-12.2 — Mark manual publication done

**Status:** CLOSED (2026-08-30) — VALIDATION PASS WITH NOTES `ceacf10` (39/39, 4/4 AC) · QA APPROVE `8b3536f` (0 Critical/High) · PO AC check-off. BE `6e0fcf0` · FE `513632e` · DB `f62a1a2`. Metrics → US-13.1.

**As a** Operator, **I want** to mark a Reel as published on Instagram, **so that** the calendar reflects reality.

Ship **Operator mark-published V1 (Phase A)**: from the existing `/operator/calendar` Sidebar, mark an **approved** Reel as published with an editable published date (default today) and optional Instagram post URL; persist `publish_status = published` plus `published_at` / `instagram_post_url` on `neuramark_content_calendar_slots`; enforce **approved-only** and **Operator-only** server-side. Unlocks US-13.1 metrics on published Reels.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-12.2 (do **not** check off in PREP).

**This folder:** [`plan/stories/US-12.2/`](./) — `README.md` · `TASKS.md`. Next gates: `SPEC-REVIEW.md` · `SECURITY.md` · `CONTRACT.md` (not created in PREP).

**Branch:** `feature/US-12.2-mark-published`

**Depends on:** [US-12.1](../US-12.1/) ✅ Operator `/operator/calendar` · `neuramark_content_calendar_slots` with `publish_status` `ready` \| `published` (reads only) · `slotId` / `assembledReelId` / `approvalStatus` in calendar DTO · Sidebar detail workflow.

**Upstream contracts:** [US-12.1 CONTRACT](../US-12.1/CONTRACT.md) · [US-12.1 README](../US-12.1/README.md) · `lib/contracts/calendar.ts` · `lib/calendar/*` · `plan/DESIGN_PROMPTS.md` § 10 · `plan/SECURITY_BASELINE.md` · ADR-0002 (Graph publish later; this story is **manual** mark only).

**Unblocks:** [US-13.1](../../USER_STORIES.md) record basic post metrics (published Reels only) · ADR-0002 Instagram Graph publish (re-check `approved` pattern reused).

---

## Scope in

| Area | What US-12.2 BUILD adds |
|------|-------------------------|
| **FE (Operator)** | **"Mark published"** CTA on calendar Sidebar for slots with `pipelineStatus === approved` (and not yet published); **Dialog** (PrimeReact) with `publishedAt` date (default today, editable) + optional IG post URL; success → refresh week grid / violet **published** card + IG link affordance; hide/disable CTA when not approved or already published (re-mark update path — see PO #5); EN/ES `calendar.markPublished.*`; loading / error / field validation states. |
| **BE** | **New** Server Action **`markCalendarSlotPublished`** — `requireOperator("handler")` first → 403 for non-operator; Zod input (`slotId`, `publishedAt`, optional `instagramPostUrl`); **re-check** latest approval `status = approved` at write time (join slot → assembled reel → `neuramark_approvals`); UPDATE `publish_status = published`, `published_at`, `instagram_post_url`; validate IG URL as `https://www.instagram.com/...`; extend calendar read DTO with published fields for display; preserve new columns across sync upsert. |
| **DB** | **ALTER** `neuramark_content_calendar_slots`: add **`published_at`** (`timestamptz` NULL) + **`instagram_post_url`** (`text` NULL); existing `publish_status` CHECK unchanged (`ready` \| `published`). RLS deny-by-default unchanged. |
| **Implementers** | **nextjs-backend** + **nextjs-frontend** only. **No** content-agents-engineer · **No** media-pipeline-engineer · **No** integrations-engineer (Graph publish = ADR-0002). |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **Instagram Graph API publish** | ADR-0002 / integrations-engineer — this story is **manual** bookkeeping only |
| **Unpublish / revert to `ready`** | Phase B defer — V1 has no undo; metrics (US-13.1) assume published is sticky |
| **Separate mark-published page / route** | DESIGN §10 + US-12.1 Sidebar — dialog on calendar only |
| **Cliente calendar or Cliente mark-published** | Operator-only; future Cliente calendar = separate endpoint |
| **`client_id` on mutation input** | Forbidden — authority from `slotId` + server joins; Operator aggregate pattern |
| **Drag-and-drop reschedule** | US-12.1 Phase B |
| **Metrics form / `neuramark_reel_metrics`** | US-13.1 (consumes published slots) |
| **Extending `getOperatorCalendarForWeek` as a write action** | Read stays read; new dedicated mutation |
| **New approval / QA / pipeline mutations** | Re-check approval only; do not change approval status |
| **RBAC beyond `requireOperator()`** | Unchanged |

## Canonical terms (CONTEXT)

Use **Calendario de contenido**, **Operator**, **Cliente**, **Reel**, **Aprobación**, **publicado**, **listo para publicar**, **Ensamblado**.  
_Evitar:_ “publish queue” as primary noun on Operator surfaces; admin/staff; rendering unvalidated IG URLs as raw `href`; exposing storage keys; client-supplied `client_id` as authority.

## What US-12.1 already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-12.1 | `/operator/calendar` week grid + Sidebar; `getOperatorCalendarForWeek`; `syncCalendarSlotsForWeek` (preserves existing `publish_status` on upsert); `deriveCalendarPipelineStatus` (`published` cascade first); `CalendarSlotDetailDto` with `slotId`, `assembledReelId`, `approvalStatus`, `pipelineStatus` |
| DB | `neuramark_content_calendar_slots` with `publish_status` `ready` \| `published` — **no** `published_at` / `instagram_post_url` yet |
| Auth | `app/(app)/operator/layout.tsx` → `requireOperator("page")`; calendar read action uses `requireOperator("handler")` |
| DESIGN §10 | Grid + Sidebar shipped; **Mark published dialog** deferred to this story |

**US-12.2 adds the write path + dialog + publish metadata columns** — not a new calendar page, not Graph publish, not metrics.

---

## Phased BUILD (PO)

| Phase | Scope | Closes |
|-------|-------|--------|
| **A (US-12.2 BUILD — ship all in this story)** | ALTER add `published_at` + `instagram_post_url` · `markCalendarSlotPublished` Server Action · approved-only re-check · IG URL Zod validation · Sidebar Dialog CTA · DTO fields for published display (violet check + IG icon) · sync preserve new columns · [SEC] Operator 403 + approved-only · EN/ES | USER_STORIES § US-12.2 AC (all four) |
| **B (deferred — not US-12.2)** | Unpublish / revert to `ready` · edit-published history audit · Instagram Graph publish (ADR-0002) · auto-mark on Graph success | Backlog / US-13.x / integrations |

**VALIDATION note (binding):** Phase A closes full US-12.2 AC. FE CTA visibility is UX only — VALIDATION must prove non-approved and non-operator paths fail in the handler. Idempotent **re-mark** (already `published`) may update `published_at` / URL; **unpublish** must not exist in Phase A.

---

## Upstream / downstream handoffs

| Direction | Artifact | Rule |
|-----------|----------|------|
| **From US-12.1** | `slotId`, calendar Sidebar, `publish_status` column, sync preserve | Mutation keys off `slotId`; sync must not wipe publish metadata |
| **From US-11.x** | `neuramark_approvals.status = approved` via assembled reel | Write-time re-check — same hard rule as ADR-0002 |
| **To US-13.1** | `publish_status = published` + `assembledReelId` / slot identity | Metrics only on published Reels |
| **To ADR-0002** | Manual mark pattern + approved re-check | Graph adapter reuses approved-only guard; may later set same columns |

---

## PO decisions frozen (2026-08-30)

| # | Topic | Decision |
|---|-------|----------|
| 1 | **Mutation surface** | **New** Server Action **`markCalendarSlotPublished`** under `lib/calendar/actions/` (sibling to read action). **Do not** overload `getOperatorCalendarForWeek`. Optional thin core helper `markCalendarSlotPublishedCore` for tests. |
| 2 | **UI surface** | **Dialog on calendar Sidebar** (PrimeReact `Dialog` — not a separate page/route). CTA **"Mark published"** visible when `pipelineStatus === 'approved'`. For already-`published` slots: show published date + IG link; optional **"Update publish details"** opens same Dialog (idempotent re-mark). No ConfirmDialog-only path without fields — date + URL need a form Dialog. |
| 3 | **DB columns** | **ALTER** existing table (columns **not** present in US-12.1 migration): **`published_at timestamptz NULL`**, **`instagram_post_url text NULL`**. When marking: set `publish_status = 'published'`, set both fields (`instagram_post_url` null if omitted). Index optional — CONTRACT decides; lean no extra index V1. |
| 4 | **Approved-only re-check** | At write time: load slot by `slotId` → resolve assembled reel (same join path as calendar read: script → assembly/branding) → load latest `neuramark_approvals` for that `assembled_reel_id` → require **`status = 'approved'`**. Missing assembly, missing approval, or non-approved → structured error (e.g. `NOT_APPROVED` / `SLOT_NOT_READY`). FE gate is insufficient alone. |
| 5 | **Idempotent re-mark / unpublish** | **Re-mark IN for V1:** if slot already `published`, same action overwrites `published_at` and `instagram_post_url` (and keeps `published`). **Unpublish OUT for V1:** no transition back to `ready`; no clear-URL-only without staying published. |
| 6 | **`publishedAt` UX** | FE date defaults to **today** (Operator local calendar day); editable. Stored as **`timestamptz`**. CONTRACT freezes date-only input shape (`YYYY-MM-DD`) vs full ISO; lean **date string** in → store UTC noon for that date (avoid TZ flip surprises). Reject future dates beyond a sane bound if SECURITY requires — lean allow today ± small window; CONTRACT freezes. |
| 7 | **IG URL validation** | Optional. When present: must match **`https://www.instagram.com/...`** (HTTPS only, host `www.instagram.com`, path required). Stored as **text**. FE may render as link only after server-validated value returned in DTO — never trust raw user input for `href` without re-validation on read or store-time-only + DTO allowlist. Max length — CONTRACT (lean 500). |
| 8 | **Auth / authority** | **`requireOperator("handler")` first** — zero side effects on 403. Input: **`slotId`** (+ publish fields) **strict**; **forbid** `client_id` / `clientId`. Slot’s `client_id` resolved server-side from row. |
| 9 | **Calendar read DTO delta** | Extend `CalendarSlotDetailDto` (and card if needed) with **`publishedAt: string \| null`**, **`instagramPostUrl: string \| null`** so published cards show violet check + IG icon (DESIGN §10). `pipelineStatus = published` already derived from `publish_status`. |
| 10 | **Sync interaction** | `syncCalendarSlotsForWeek` must **preserve** `publish_status`, `published_at`, and `instagram_post_url` on upsert (same as today’s publish_status preserve). Orphan DELETE still removes published rows if strategy slot gone — document as known V1 behavior. |
| 11 | **Post-mutation UX** | On success: close Dialog; **re-fetch** `getOperatorCalendarForWeek` for current week (or return updated slot DTO and merge — CONTRACT picks; lean return updated slot + FE refresh week). Toast/inline success via existing patterns. |
| 12 | **i18n** | Extend **`calendar.*`**: markPublished CTA, Dialog title/labels, date/URL fields, errors (`notApproved`, `forbidden`, validation), published badge / update CTA. EN + ES. |
| 13 | **Implementers** | **nextjs-backend** (migration ALTER, action, Zod, approval join, sync preserve, tests) + **nextjs-frontend** (Dialog, CTA, i18n, published card affordances). |
| 14 | **US-13.1 handoff** | Published slot + `assembledReelId` is the gate for metrics; do **not** create metrics tables/UI here. |
| 15 | **Rejected / pending** | Cannot mark published. Rejected approvals fail server re-check. Pending / changes_requested fail. No CTA for those statuses. |

---

## Gates (orchestrator)

- [x] PREP — README + TASKS + PO freezes
- [x] SPEC-REVIEW.md (spec-guardian)
- [x] SECURITY.md (security-architect)
- [x] CONTRACT.md (nextjs-backend) — Reviewed by FE
- [x] BUILD (nextjs-backend + nextjs-frontend)
- [x] VALIDATION.md
- [x] QA.md
- [x] CLOSE — 4/4 AC checked in USER_STORIES.md (product-owner)

**Next:** SPEC-REVIEW → SECURITY → CONTRACT (freeze Zod + ALTER + error codes) → BUILD.

---

## Open questions (for SECURITY / CONTRACT — not PREP blockers)

| # | Question | PO lean |
|---|----------|---------|
| 1 | Exact Zod name for IG URL regex / allow `instagram.com` without `www`? | **Require `https://www.instagram.com/`** prefix per USER_STORIES AC; reject bare `instagram.com` and mobile `m.` hosts V1 |
| 2 | `publishedAt` input: date-only vs timestamptz? | **Date-only `YYYY-MM-DD`** in action input; store timestamptz at UTC noon |
| 3 | Future-dated `publishedAt` allowed? | **Allow up to today + 1 day** (timezone skew); reject further future — SECURITY may tighten to ≤ today |
| 4 | Re-mark when approval later revoked/rejected? | **Re-check approved on every write** including re-mark — if no longer approved, reject update (published row stays as-is) |
| 5 | Return shape: full week vs single slot? | **`{ ok: true, slot: CalendarSlotDetailDto }`** + FE calls existing week refresh |
| 6 | Rate limit on mark action? | **Operator write bucket** or **30/min** — SECURITY picks; lean modest limit |
| 7 | Empty string URL vs omit? | Treat `""` / whitespace as **null** (optional cleared on re-mark) |
| 8 | Sync orphan DELETE of published slots | **Keep hard DELETE** from US-12.1; note metrics orphan risk for US-13.1 CONTRACT |
| 9 | Display IG link: `target=_blank` + `rel=noopener noreferrer`? | **Yes** — FE hardening; URL already validated at store |
| 10 | Column name `instagram_post_url` vs `instagram_permalink`? | **`instagram_post_url`** (matches USER_STORIES “URL” wording) |

---

## SPEC alignment / blockers for spec-guardian

| Item | Assessment |
|------|------------|
| Manual mark published on calendar | **ALIGNED** with SPEC §3 Content Calendar “estados hasta published” + DESIGN §10 dialog |
| No publish without approval | **ALIGNED** — server re-check; roadmap hard rule |
| Operator-only calendar mutation | **ALIGNED** with SPEC §2 Operator surfaces + SECURITY_BASELINE |
| SPEC P2 module vs USER_STORIES P1 | **FLAG** (same as US-12.1) — sprint source of truth; no scope reduction |
| Graph / ADR-0002 | **OUT** — manual only; no ADR breach if Graph stays deferred |
