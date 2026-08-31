## Validation Report — US-12.1

**Story:** Weekly calendar view (Calendario de contenido)  
**Branch reviewed:** `feature/US-12.1-weekly-calendar`  
**Date:** 2026-08-30  
**Validator:** requirements-validator  
**Sources:** `plan/USER_STORIES.md` § US-12.1 · `plan/stories/US-12.1/CONTRACT.md` · `plan/stories/US-12.1/TASKS.md` · `plan/stories/US-12.1/SECURITY.md`

### Verdict: PASS WITH NOTES

**AC score:** 5 / 5 (all acceptance criteria satisfied; two low-severity notes below)

**Tests:** `npx tsx --test lib/calendar/calendar.test.ts` → **18 / 18 pass** (7 suites, ~141 ms)

---

### Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Shows gaps when fewer than 3 Reels scheduled | **PASS** | BE computes `gapWarnings` when an approved-strategy client has `scheduledCount < 3` (`lib/calendar/get-operator-calendar-for-week.ts` 261–298). FE renders PrimeReact `Message` per warning (`components/calendar/OperatorCalendarView.tsx` 183–201, 324). EN/ES copy `calendar.page.gapWarning` (`messages/en.json` 1011, `messages/es.json` 1011). Unit test: `missingCount when scheduledCount < 3` (`lib/calendar/calendar.test.ts` 473–539). |
| Click slot opens Reel detail workflow | **PASS** | Slot cards are buttons that set `selectedSlot` (`OperatorCalendarView.tsx` 125–127, 354–360). PrimeReact `Sidebar` shows client, tema, goal, scheduled date, slot index, pipeline status tag, and CTAs (`367–461`). CONTRACT binding note: sidebar satisfies “Reel detail workflow”; deep link to scripts is supplementary (`CONTRACT.md` § Phase A). Optional `highlightSlot` wired on scripts page (`app/(app)/operator/scripts/page.tsx` 48–53, 105; `ScriptsPageView.tsx` 511–518). |
| EN/ES day/month labels | **PASS** | Locale resolved server-side (`app/(app)/operator/calendar/page.tsx` 47–48). Day column headers via `Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric" })` (`OperatorCalendarView.tsx` 93–104, 352). Week range via `formatWeekRange(weekStart, locale)` (216). Sidebar date via `formatScheduledDate` with long weekday + month (80–90, 401). Status/page copy externalized under `calendar.*` in `messages/en.json` and `messages/es.json` (998–1048). |
| Operator-only: endpoint/action rejects non-operator sessions server-side (403) | **PASS** | Page gated by `requireOperator("page")` in `app/(app)/operator/layout.tsx` 14. Server Action calls `requireOperator("handler")` as first await (`lib/calendar/actions/get-operator-calendar-for-week.ts` 36–42). Cliente mock → `FORBIDDEN` with sync not invoked (`calendar.test.ts` 287–322). Static guard: `requireOperator` precedes forbidden-key check and parse (`calendar.test.ts` 418–428). Route accepts only `weekStart` searchParam — no `client_id` (`page.tsx` 12, 49–50). |
| [SEC] Future Cliente calendar = separate endpoint; never operator aggregate + UI filter; never `client_id` on operator endpoint | **PASS** | Contract documents future Cliente action as separate (`lib/contracts/calendar.ts` 4–5). `FORBIDDEN_CALENDAR_AUTHORITY_KEYS` includes `client_id` / `clientId` (40–43); `findForbiddenCalendarKeys` + strict Zod input (83–95). Action rejects smuggled keys → `FORBIDDEN_FIELDS` (`get-operator-calendar-for-week.ts` 44–46; tests 374–415). SECURITY.md Conditions 7–8 reconciled in CONTRACT; grep tests confirm no Cliente queue imports and no `publish_status` UPDATE to `published` (`calendar.test.ts` 587–612). |

---

### Convention Compliance

| Area | Status | Notes |
|------|--------|-------|
| EN + ES user-facing strings | **PASS** | `calendar.*` + `header.nav.calendar` in both locale files. **Note:** `messages/en.json` `calendar.sidebar.client` is `"Cliente"` (Spanish) — should be `"Client"` for English consistency. |
| Server Components default; minimal `"use client"` | **PASS** | RSC page loads data (`page.tsx`); client island `OperatorCalendarView` for week nav, sidebar, grid interaction. |
| PrimeReact-first UI | **PASS** | `Calendar`, `Button`, `Message`, `Sidebar`, `Tag` (`CalendarStatusTag.tsx`). |
| Loading / empty / error states | **PASS** | `loading.tsx` + `CalendarLoading` (`app/(app)/operator/calendar/loading.tsx`); empty week, load error, gap/info messages in view. |
| Auth / Supabase boundaries | **PASS** | No Supabase in client components; identity via `getCurrentUser()` on page; operator gates on layout + action. |
| `neuramark_` DB prefix | **PASS** | Migration `20260831050000_neuramark_content_calendar_slots.sql`; RLS deny-by-default. |
| CONTRACT frozen shapes | **PASS** | Zod + DTOs in `lib/contracts/calendar.ts`; success envelope validated in tests (`getOperatorCalendarForWeekSuccessSchema`). |
| Dependencies (US-11.3, US-4.1) | **PASS** | Uses approved-strategy loader + operator client list; does not import Cliente ready-to-publish queue (grep test). |

---

### Gaps (what blocks PASS)

None. All five USER_STORIES acceptance criteria are met with code and test evidence.

---

### Scope Creep

None identified. Implemented surfaces match CONTRACT Phase A and TASKS.md:

- `/operator/calendar`, sync-on-read, aggregate action, gap UI, sidebar, status colors, operator nav, media-route cross-client `assembled_reel` thumbnail — all specified in CONTRACT/TASKS.
- `highlightSlot` on scripts page is an optional TASKS item, not speculative scope.
- No mark-published UI, drag-and-drop reschedule, or Cliente calendar endpoint (correctly deferred).

---

### Recommended Next Actions

| Priority | Action | Owner |
|----------|--------|-------|
| Low | Fix `messages/en.json` `calendar.sidebar.client` → `"Client"`. | **nextjs-frontend** |
| Low | Add `"test": "tsx --test 'lib/**/*.test.ts'"` (or calendar subset) to `package.json` so CI/docs match house pattern (`npx tsx --test`). | **nextjs-backend** / devops |
| Optional | Remove or wire `calendar.weekdays.*` keys if unused (grid uses `Intl` — AC still met). | **nextjs-frontend** |
| Process | PO may check off AC in `USER_STORIES.md` § US-12.1 after QA gate. | **product-owner** |

---

### Test command (recorded)

```bash
npx tsx --test lib/calendar/calendar.test.ts
```

Result: **18 pass / 0 fail**
