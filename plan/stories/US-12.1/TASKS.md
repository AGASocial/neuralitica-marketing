# US-12.1 — Weekly calendar view

**Priority:** P1  
**Depends on:** US-11.3 ✅ · US-4.1 ✅ · US-4.2 ✅ (approved strategy slots)  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-12.1 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **nextjs-backend** (migration, sync, aggregate action, status derivation, contracts) + **nextjs-frontend** (`/operator/calendar`, grid, sidebar, gap UI, i18n, nav). Per `docs/development/AGENT-ROSTER.md` Phase 5 Operación semanal. **No** content-agents-engineer · **No** media-pipeline-engineer · **No** integrations-engineer.  
**Canonical terms:** **Calendario de contenido** · **Estrategia semanal** · **Operator** · **Cliente** · **Aprobación** · **listo para publicar**.

**Reference:** [US-12.1 README](./README.md) · [US-11.3 CONTRACT](../US-11.3/CONTRACT.md) (Operator ≠ Cliente queue) · `plan/DESIGN_PROMPTS.md` § 10 · `plan/SECURITY_BASELINE.md` § US-12.1 visibility · `lib/trend/normalize-week-start.ts`

## Out of scope (do not implement here)

- Mark published action, IG post URL, `published_at` writes (US-12.2).
- Drag-and-drop reschedule / manual date mutation (Phase B).
- Cliente-facing calendar route or endpoint.
- `client_id` parameter on Operator aggregate action or page.
- Reuse Cliente `listApprovedApprovals` / `/ready-to-publish` for Operator data.
- Instagram Graph publish (ADR-0002).
- Strategy-approve webhook / cron auto-sync (integrations-engineer).
- New approval, QA, or pipeline mutations.
- RBAC beyond `requireOperator()`.

## Scope split

| Concern | Owner |
|---------|--------|
| `neuramark_content_calendar_slots` migration | **DB** / **BE** |
| `syncCalendarSlotsForWeek` idempotent upsert | **BE** |
| Pipeline status derivation helper | **BE** |
| `getOperatorCalendarForWeek` Server Action + DTOs | **BE** |
| `/operator/calendar` page + week grid | **FE** |
| Gap warning UI (&lt;3 slots per client) | **FE** |
| Sidebar detail panel + deep links | **FE** |
| Status color tags + EN/ES labels | **FE** |
| Operator header nav `calendar` | **FE** |
| `[SEC]` operator gate + no client_id param tests | **BE** |

## Implementer routing

| Agent | Owns |
|-------|------|
| **nextjs-backend** | Migration · sync helper · aggregate query joins · Zod contracts · Server Action · status derivation · security tests |
| **nextjs-frontend** | Calendar page/view components · Sidebar · week picker · gap banners · i18n · nav · optional `highlightSlot` on scripts page |

---

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Branch | **`feature/US-12.1-weekly-calendar`** |
| Route | **`/operator/calendar?weekStart=`** |
| Week | ISO Monday UTC — `trendWeekStartSchema` + `normalizeToIsoMonday` |
| Slot source | Table **`neuramark_content_calendar_slots`** + **sync-on-read** from approved strategies; pipeline status **derived** |
| `scheduled_date` | `week_start` + `dayOfWeek`; default Mon/Wed/Fri pattern by `slotIndex` when `dayOfWeek` absent |
| Status colors | `draft` / `generating` / `qa` / `pending` / `approved` / `published` — cascade in README § PO #5 |
| Click behavior | **Sidebar** detail + link to **`/operator/scripts?weekStart=&highlightSlot=`** |
| Drag-and-drop | **Phase B defer** — read-only grid in Phase A |
| Publish writes | **None** — read `publish_status`; default `ready` on insert only |
| Aggregate auth | **`requireOperator("handler")`** — 403 for Cliente |
| `[SEC]` | No `client_id` on Operator aggregate; future Cliente calendar = separate endpoint |

### Action sketch (CONTRACT freezes names)

```ts
// Server Action — Operator only; body: { weekStart } strict; NO client_id
getOperatorCalendarForWeek({ weekStart }): Promise<GetOperatorCalendarForWeekResult>;
// Internally: syncCalendarSlotsForWeek(weekStart) → join pipeline → derive pipelineStatus

// Types (lib/contracts/calendar.ts)
type CalendarPipelineStatus =
  | "draft"
  | "generating"
  | "qa"
  | "pending"
  | "approved"
  | "published";

type CalendarSlotCardDto = {
  slotId: string;
  clientId: string;
  clientDisplayName: string;
  weekStart: string;
  scheduledDate: string; // YYYY-MM-DD
  slotIndex: number;
  tema: string;
  reelScriptId: string | null;
  pipelineStatus: CalendarPipelineStatus;
  approvalId: string | null;
  assembledReelId: string | null;
  thumbnailPreviewUrl: string | null;
};

type ClientGapWarningDto = {
  clientId: string;
  clientDisplayName: string;
  scheduledCount: number; // < 3 triggers warning
  missingCount: number;   // 3 - scheduledCount
};
```

---

## Contract-first checklist (before BUILD)

- [x] `SPEC-REVIEW.md` — GAPS (6 Low closed in CONTRACT)
- [x] `SECURITY.md` — APPROVE WITH CONDITIONS (11 conditions reconciled in CONTRACT)
- [x] `CONTRACT.md` frozen — Zod in `lib/contracts/calendar.ts` · **Reviewed by FE: yes**
- [x] Open questions in README § resolved in CONTRACT

---

## Frontend (nextjs-frontend)

**Consumers:** `/operator/calendar` · `AppHeader` Operator nav · optional `/operator/scripts` highlight

- [ ] Add **`app/(app)/operator/calendar/page.tsx`** — RSC; resolve `weekStart` from searchParams (same helper pattern as strategy/scripts); call `getOperatorCalendarForWeek`; loading via `loading.tsx`.
- [ ] Create **`components/calendar/OperatorCalendarView.tsx`** (Client Component island): week header (range label, prev/next, PrimeReact `Calendar` picker); **7-column grid** Mon–Sun with localized day headers.
- [ ] Render **slot cards** per day: client name, tema, `CalendarStatusTag` (color by `pipelineStatus`), optional thumbnail.
- [ ] Render **gap warning** strip/card per client when `missingCount > 0` (copy: “{n} slot(s) unfilled” — EN/ES).
- [ ] **Sidebar** on card click: summary fields from `CalendarSlotDetailDto`; CTAs “Open in Scripts” + “View strategy” (see README PO #6).
- [ ] Wire **`AppHeader`**: Operator-only link **`header.nav.calendar`** → `/operator/calendar`.
- [ ] i18n **`calendar.*`** in `messages/en.json` + `messages/es.json`: title, subtitle, weekdays, month labels, status labels, gap warning, sidebar CTAs, empty/error/back links.
- [ ] Empty states: no slots for week; load error; forbidden (should not render — layout gates Operator).
- [ ] Optional: extend **`ScriptsPageView`** to read **`highlightSlot`** query → scroll/expand matching row (same `weekStart`).
- [ ] Mobile: stack columns or horizontal scroll for week grid — match existing Operator page responsive patterns.

---

## Backend / API (nextjs-backend)

**Consumers:** `/operator/calendar` page · Sidebar (same payload)

- [ ] Add **`lib/contracts/calendar.ts`**: Zod input `getOperatorCalendarForWeekInputSchema` (`weekStart` only — `.strict()`); DTOs above; error codes (`UNAUTHENTICATED`, `FORBIDDEN`, `VALIDATION_ERROR`, `INTERNAL_ERROR`).
- [ ] Add **`lib/calendar/sync-calendar-slots-for-week.ts`**: for each active client, load latest **approved** strategy for `weekStart`; map slots → `scheduled_date`; upsert `neuramark_content_calendar_slots`; link `reel_script_id` when script row exists; **delete** orphan rows for that client/week not in current brief; set `publish_status = 'ready'` on insert only.
- [ ] Add **`lib/calendar/derive-calendar-pipeline-status.ts`**: cascade rules per README PO #5 using joins to scripts, video jobs, assembly, QA, approvals (reuse existing loaders where possible — do not duplicate QA gate logic).
- [ ] Add **`lib/calendar/get-operator-calendar-for-week.ts`**: orchestrate sync + query + gap computation (`scheduledCount` per client).
- [ ] Add **`lib/calendar/actions/get-operator-calendar-for-week.ts`**: Server Action; **`requireOperator("handler")`** first; reject forbidden body keys (`client_id`, etc.).
- [ ] **[SEC]** Cliente role calling action → **403**; no `client_id` param accepted.
- [ ] **[SEC]** Document in story SECURITY (later): future Cliente calendar = separate action — out of BUILD scope but test that aggregate never accepts client filter.
- [ ] Unit/integration tests: sync idempotency; gap math (&lt;3); status cascade samples (draft → generating → qa → pending → approved → published); operator gate; forbidden fields; orphan slot deletion.

---

## Database (nextjs-backend)

**Consumers:** sync helper · US-12.2 (future publish_status updates)

- [ ] Migration **`neuramark_content_calendar_slots`**:
  - `id` uuid PK default `gen_random_uuid()`
  - `client_id` uuid NOT NULL REFERENCES `neuramark_clients(id)`
  - `week_start` date NOT NULL (ISO Monday)
  - `scheduled_date` date NOT NULL
  - `slot_index` int NOT NULL CHECK (`slot_index` >= 0 AND `slot_index` <= 6)
  - `strategy_id` uuid NOT NULL REFERENCES `neuramark_content_strategies(id)`
  - `reel_script_id` uuid NULL REFERENCES `neuramark_reel_scripts(id)`
  - `publish_status` text NOT NULL DEFAULT `'ready'` CHECK (`publish_status` IN (`'ready'`, `'published'`))
  - `created_at` / `updated_at` timestamptz
  - UNIQUE (`client_id`, `week_start`, `slot_index`)
- [ ] Indexes: `neuramark_content_calendar_slots_week_start_idx`; `neuramark_content_calendar_slots_client_week_idx`; `neuramark_content_calendar_slots_scheduled_date_idx`.
- [ ] RLS: **deny-by-default** (server service role only — same house pattern as peer tables).
- [ ] **No trigger** on strategy approve in US-12.1 — sync-on-read only.

---

## Security acceptance (for SECURITY.md — checklist seed)

- [ ] Operator aggregate Server Action: **`requireOperator("handler")`** — 403 for Cliente.
- [ ] Request schema: **`weekStart` only** — reject `client_id` / extra keys (`FORBIDDEN_FIELDS`).
- [ ] No reuse of Cliente `/ready-to-publish` or `listApprovedApprovals` for Operator calendar data.
- [ ] Future Cliente calendar documented as **separate endpoint** — not in BUILD.
- [ ] Preview/thumbnail URLs: server-built authenticated paths only — never expose `storage_key`.
- [ ] US-12.1 performs **no** `publish_status` update to `published` (defer US-12.2).

---

## Validation hints (for requirements-validator — post-BUILD)

| AC | Evidence |
|----|----------|
| Gaps when &lt;3 Reels scheduled | Gap warning renders for client with 1–2 slots after sync |
| Click slot opens Reel detail workflow | Sidebar opens with summary + pipeline status |
| EN/ES day/month labels | `calendar.*` + `Intl` weekday headers |
| Operator-only 403 | Cliente session → action 403; page layout redirect/forbidden |
| [SEC] Separate endpoint if Cliente calendar later | SECURITY.md + no `client_id` on aggregate; CONTRACT comment |

---

## Dependencies and sequence

1. **SECURITY.md** + **CONTRACT.md** (freeze DTOs, sync rules, status cascade).
2. **DB migration** → sync helper → derive status → Server Action.
3. **FE** page against frozen contract (can stub with fixtures until action lands).
4. **VALIDATION** → **QA** → PO AC check-off.

**Parallelizable after CONTRACT freeze:** BE migration + action || FE grid/sidebar against typed fixtures.
