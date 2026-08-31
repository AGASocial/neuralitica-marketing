# US-12.2 — Mark manual publication done

**Priority:** P1  
**Depends on:** US-12.1 ✅ (Operator calendar · `neuramark_content_calendar_slots` · Sidebar · read-only `publish_status`)  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-12.2 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **nextjs-backend** (ALTER migration, `markCalendarSlotPublished`, Zod, approval re-check, sync preserve, DTO delta, tests) + **nextjs-frontend** (Sidebar Dialog, CTA, published affordances, i18n). Per `docs/development/AGENT-ROSTER.md` Phase 5 Operación semanal. **No** content-agents-engineer · **No** media-pipeline-engineer · **No** integrations-engineer.  
**Canonical terms:** **Calendario de contenido** · **Operator** · **publicado** · **Aprobación** · **Reel** · **listo para publicar**.

**Reference:** [US-12.2 README](./README.md) · [US-12.1 CONTRACT](../US-12.1/CONTRACT.md) · `plan/DESIGN_PROMPTS.md` § 10 · `lib/contracts/calendar.ts` · `lib/calendar/*` · `components/calendar/OperatorCalendarView.tsx`

## Out of scope (do not implement here)

- Instagram Graph API publish (ADR-0002).
- Unpublish / revert `publish_status` to `ready`.
- Separate `/operator/calendar/publish` page or route.
- Metrics form / `neuramark_reel_metrics` (US-13.1).
- Extending `getOperatorCalendarForWeek` into a write action.
- `client_id` on mutation input.
- Cliente mark-published or Cliente calendar.
- Drag-and-drop reschedule.
- Approval / QA status mutations.
- RBAC beyond `requireOperator()`.

## Scope split

| Concern | Owner |
|---------|--------|
| ALTER `published_at` + `instagram_post_url` | **DB** / **BE** |
| `markCalendarSlotPublished` Server Action + approved re-check | **BE** |
| IG URL Zod + `publishedAt` validation | **BE** |
| Calendar DTO delta (`publishedAt`, `instagramPostUrl`) | **BE** (+ FE consume) |
| Sync preserve publish metadata on upsert | **BE** |
| Sidebar “Mark published” Dialog + CTA | **FE** |
| Published card violet check + IG link icon | **FE** |
| EN/ES `calendar.markPublished.*` | **FE** |
| `[SEC]` Operator 403 + approved-only + URL validation tests | **BE** |

## Implementer routing

| Agent | Owns |
|-------|------|
| **nextjs-backend** | Migration ALTER · mark action · core helper · Zod in `lib/contracts/calendar.ts` · approval join re-check · sync preserve · read DTO fields · security/unit tests |
| **nextjs-frontend** | Dialog form in `OperatorCalendarView` (or small child) · CTA gating · published display · i18n · week refresh after success |

---

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Branch | **`feature/US-12.2-mark-published`** |
| Action | **`markCalendarSlotPublished`** — new Server Action; not an extension of the read action |
| UI | **Dialog on calendar Sidebar** — date + optional IG URL; no separate page |
| Columns | **ALTER** add `published_at timestamptz NULL`, `instagram_post_url text NULL`; existing `publish_status` unchanged |
| Approved gate | **Re-check** `neuramark_approvals.status = approved` at write via assembled reel |
| Re-mark | **Idempotent overwrite** of date/URL when already published |
| Unpublish | **Out** for V1 |
| Auth | **`requireOperator("handler")`** → 403; input keyed by **`slotId` only** (no `client_id`) |
| `[SEC]` | Approved-only server-side; IG URL `https://www.instagram.com/...` stored as text |

### Action sketch (CONTRACT freezes names)

```ts
// Server Action — Operator only; body strict; NO client_id
markCalendarSlotPublished({
  slotId,
  publishedAt,           // lean YYYY-MM-DD
  instagramPostUrl?,     // optional; "" → null
}): Promise<MarkCalendarSlotPublishedResult>;

// Success lean:
// { ok: true, slot: CalendarSlotDetailDto }  // includes publishedAt, instagramPostUrl, pipelineStatus: "published"

// Error codes (sketch — CONTRACT freezes):
// FORBIDDEN | VALIDATION | NOT_FOUND | NOT_APPROVED | SLOT_NOT_READY | RATE_LIMITED?
```

---

## Contract-first checklist (before BUILD)

- [ ] `SPEC-REVIEW.md` — spec-guardian
- [ ] `SECURITY.md` — security-architect
- [ ] `CONTRACT.md` frozen — Zod in `lib/contracts/calendar.ts` · **Reviewed by FE**
- [ ] Open questions in README § resolved in CONTRACT

---

## Frontend (nextjs-frontend)

**Consumer:** `/operator/calendar` · `components/calendar/OperatorCalendarView.tsx` (Sidebar)

- [x] Add **"Mark published"** button in Sidebar when `pipelineStatus === 'approved'` (and not already handling update mode).
- [x] For `pipelineStatus === 'published'`: show published date + IG link icon (validated URL from DTO); optional **"Update publish details"** opens same Dialog.
- [x] PrimeReact **`Dialog`** form: date input defaulting to **today**, editable; optional Instagram URL field; submit / cancel; pending state on submit.
- [x] Call **`markCalendarSlotPublished`**; on success close Dialog and **refresh** week via `getOperatorCalendarForWeek` (or merge returned slot — match CONTRACT).
- [x] Field + server error display (`notApproved`, validation, forbidden) without leaking internals.
- [x] Published cards: violet status already exists — add check / IG affordance per DESIGN §10.
- [x] i18n EN + ES under **`calendar.markPublished.*`** (and any published display keys).
- [x] Do **not** show Mark published for draft / generating / qa / pending / rejected paths.
- [x] Do **not** add a new route/page for mark-published.

---

## Backend (nextjs-backend)

**Consumers:** Operator calendar Sidebar Dialog (FE above); US-13.1 will read published rows later.

- [ ] Migration **ALTER** `neuramark_content_calendar_slots` add `published_at timestamptz NULL`, `instagram_post_url text NULL` (`neuramark_` naming; RLS unchanged).
- [ ] Zod: `markCalendarSlotPublishedInputSchema` + success/error result schemas in `lib/contracts/calendar.ts`.
- [ ] IG URL schema: optional; when set must be `https://www.instagram.com/...`; max length; normalize empty → null.
- [ ] Implement **`markCalendarSlotPublished`** Server Action: `requireOperator("handler")` first → 403; `.strict()` input; forbid authority keys (`client_id`, etc.).
- [ ] Load slot by `slotId`; 404 if missing.
- [ ] Resolve assembled reel + **re-check** latest approval `approved`; reject otherwise (`NOT_APPROVED` / `SLOT_NOT_READY`).
- [ ] UPDATE `publish_status = 'published'`, `published_at`, `instagram_post_url`; bump `updated_at` via existing trigger.
- [ ] Idempotent re-mark: allow when already published if still approved; overwrite date/URL.
- [ ] **No** unpublish path.
- [ ] Extend calendar read mapping to populate `publishedAt` / `instagramPostUrl` on DTO.
- [ ] Update **`syncCalendarSlotsForWeek`** to preserve `published_at` + `instagram_post_url` (and existing `publish_status`) on upsert.
- [ ] Unit/security tests: non-operator 403; non-approved reject; URL validation; happy path; re-mark; sync preserve; no Graph/integrations imports.

---

## Database (nextjs-backend / migrations)

- [ ] New migration file (timestamp after US-12.1 `20260831050000_…`): ALTER TABLE only — **do not** recreate table.
- [ ] Columns: `published_at timestamptz NULL`, `instagram_post_url text NULL`.
- [ ] Comment on columns noting US-12.2 manual mark + US-13.1 consumer.
- [ ] No new enums; `publish_status` CHECK remains `ready` \| `published`.
- [ ] No RLS policies (deny-by-default / service-role Node only).

---

## Dependencies and sequence

```text
US-12.1 CLOSED
    → PREP (this) → SPEC-REVIEW → SECURITY → CONTRACT (+ FE signoff)
    → BE migration + action + DTO/sync (can land first)
    → FE Dialog against frozen contract (parallel after CONTRACT)
    → VALIDATION → QA → CLOSE
    → unblocks US-13.1
```

| Gate | Owner |
|------|-------|
| SPEC-REVIEW | spec-guardian |
| SECURITY | security-architect |
| CONTRACT | nextjs-backend; FE reviews |
| BUILD BE | nextjs-backend |
| BUILD FE | nextjs-frontend |
| VALIDATION | requirements-validator |
| QA | qa-engineer |
| CLOSE | product-owner (AC check-off only after validator) |

---

## Security checklist (for security-architect — expand in SECURITY.md)

- [ ] `requireOperator` first; Cliente → 403; no side effects before gate.
- [ ] Approved-only enforced in handler (not FE-only).
- [ ] IG URL allowlist validation; stored text; safe link rendering rules.
- [ ] No `client_id` authority in input; slot ownership via server row.
- [ ] DTO allowlist for new fields; no raw unvalidated URL echo from request without persist validation.
- [ ] Rate limit decision recorded.
- [ ] Sync cannot escalate unpublished → published without this action.

---

## Open questions for CONTRACT (from README)

See [README § Open questions](./README.md#open-questions-for-security--contract--not-prep-blockers) — IG host strictness, date storage, future dates, re-mark after approval revoke, return shape, rate limit, empty URL, orphan DELETE vs metrics, column naming (frozen lean: `instagram_post_url`).
