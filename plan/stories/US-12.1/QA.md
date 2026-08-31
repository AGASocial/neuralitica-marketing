# QA Report — US-12.1 Weekly calendar view

**Story:** US-12.1 — Weekly calendar view (Calendario de contenido)  
**Branch:** `feature/US-12.1-weekly-calendar`  
**Date:** 2026-08-30  
**Reviewer:** qa-engineer  
**Sources:** `VALIDATION.md` · `CONTRACT.md` · `SECURITY.md` · `lib/calendar/` · `components/calendar/` · `app/(app)/operator/calendar/` · `app/api/media/assets/[assetId]/route.ts`

---

## Verdict: BLOCK

Security gates and unit tests pass, but **`npm run build` fails** on a type error in `lib/calendar/errors.ts` (US-12.1 module). Production deploy is blocked until fixed.

---

## Findings

### High — Build fails on calendar error helper return types

**File:** `lib/calendar/errors.ts:18-21`

**What:** `calendarValidationError()` declares a return type narrowed to `code: "VALIDATION_ERROR"`, but it returns `calendarError(...)` whose inferred return uses the full `CalendarErrorCode` union. Next.js production build (`next build`) fails type-checking:

```
Type '"VALIDATION_ERROR" | "FORBIDDEN_FIELDS" | ...' is not assignable to type '"VALIDATION_ERROR"'.
```

**Why it matters:** Vercel deploy and CI build gate cannot pass; story is not production-ready.

**Fix direction:** Narrow `calendarError` with generics per code literal, or inline return objects in each helper so declared return types match (same pattern as peer modules, e.g. reel-scripts errors).

---

### Medium — DB read failures silently return empty calendar

**File:** `lib/calendar/get-operator-calendar-for-week.ts:79-80`

**What:** `loadCalendarSlotRows()` returns `[]` when Supabase returns an error or null data, with no throw and no error flag to the action envelope.

**Why it matters:** Operator may see “empty week” instead of `INTERNAL_ERROR` / load-error UI when Postgres is misconfigured or a query fails. Masks operational incidents; gap warnings and sync stats may also be wrong.

**Fix direction:** Propagate error (throw → action `INTERNAL_ERROR`) or return a discriminated error from core so the page sets `loadFailed=true`.

---

### Low — English sidebar label uses Spanish “Cliente”

**File:** `messages/en.json` (~line 1034, key `calendar.sidebar.client`)

**What:** Value is `"Cliente"` instead of `"Client"`.

**Why it matters:** EN locale inconsistency; noted in VALIDATION.md. Not a security defect.

**Fix direction:** Change to `"Client"` in `messages/en.json`.

---

### Low — Missing CONTRACT security test: Cliente route must not import operator calendar action

**File:** `lib/calendar/calendar.test.ts` (security grep suite)

**What:** SECURITY.md / CONTRACT.md require a grep asserting no Cliente route imports `getOperatorCalendarForWeek`. Manual grep shows only `app/(app)/operator/calendar/page.tsx` imports the action; no automated test encodes this.

**Why it matters:** Future Cliente calendar could accidentally reuse the operator aggregate; regression would not fail CI.

**Fix direction:** Add grep test over `app/(app)/` excluding `operator/` (or explicit allowlist) mirroring existing Cliente-queue import guard.

---

### Low — Missing runtime test: Cliente cross-tenant `assembled_reel` media 404

**File:** `lib/calendar/calendar.test.ts` · `app/api/media/assets/[assetId]/route.ts`

**What:** CONTRACT § Security tests require “Media route Cliente cross-tenant guess → 404 unchanged.” Implementation uses static source grep for Operator cross-client allow only; no mocked route test for Cliente guessing another tenant’s asset UUID.

**Why it matters:** US-12.1 widened Operator `assembled_reel` branch; Cliente ownership regression would be caught only by manual review.

**Fix direction:** Add media-route unit test (or extend existing media tests) asserting Cliente session + foreign `client_id` row → 404.

---

## Security audit summary

| Control | Result | Evidence |
|---------|--------|----------|
| Operator gate — action first `await` | **PASS** | `lib/calendar/actions/get-operator-calendar-for-week.ts:36` before forbidden-key scan, parse, sync |
| Operator gate — page layout | **PASS** | `app/(app)/operator/layout.tsx:14` `requireOperator("page")` |
| Cliente → action 403, no sync | **PASS** | Test: `calendar.test.ts` “Cliente session → FORBIDDEN with no sync” |
| Forbidden `client_id` / `clientId` | **PASS** | `FORBIDDEN_CALENDAR_AUTHORITY_KEYS` + tests; page accepts only `weekStart` searchParam |
| Future Cliente calendar separation | **PASS** | `FUTURE_CLIENT_CALENDAR_ACTION` in contract; no Cliente import of operator action (manual grep) |
| DTO allowlist / denylist | **PASS** | Zod `.strict()` on all DTO schemas; grep test excludes denylist keys; thumbnails via `mediaPreviewUrl()` + regex |
| No Cliente queue reuse | **PASS** | Grep test: no `listApprovedApprovals` / `ready-to-publish` in calendar modules |
| No `publish_status` UPDATE to `published` | **PASS** | Grep test; sync INSERT default `ready` only; UPDATE preserves existing status |
| Operator cross-client `assembled_reel` media | **PASS** | `route.ts:254-255` allows any tenant after `requireOperator`; `generated_video` / `voiceover` still `row.client_id === operator.id` |
| Client bundle — no Supabase / secrets | **PASS** | `OperatorCalendarView.tsx` client island imports types only; no `@supabase` in `components/calendar/` |
| RLS deny-by-default DDL | **PASS** | `supabase/migrations/20260831050000_neuramark_content_calendar_slots.sql` |
| Back doors / hardcoded bypass | **PASS** | None beyond sanctioned `getCurrentUser()` interim user |

---

## Checks run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/calendar/calendar.test.ts` | **18 / 18 pass** (~142 ms) |
| `npm run build` | **FAIL** — type error in `lib/calendar/errors.ts:21` |
| `npm run lint` | **FAIL** — repo-wide pre-existing issues; US-12.1 calendar prod files have no unique lint errors (test file uses `require()` like other house tests) |
| `npx tsc --noEmit` | **Not clean** — pre-existing test/agent TS errors repo-wide; calendar prod modules not singled out beyond build failure above |
| Manual grep: Cliente imports of `getOperatorCalendarForWeek` | **None** |
| Manual review: media route Operator/Cliente branches | **Matches CONTRACT** |

---

## What was not covered

- Browser E2E (Operator grid, sidebar, week navigation, thumbnail load in authenticated session)
- Live Supabase integration / migration apply on remote project
- Load testing sync-on-read under concurrent Operator reads
- Full repo lint/type-check cleanliness (out of US-12.1 scope; pre-existing debt)

---

## Severity counts

| Severity | Count |
|----------|------:|
| Critical | 0 |
| High | 1 |
| Medium | 1 |
| Low | 3 |

---

## Closure recommendation

**Do not close US-12.1 yet.**

1. **Required (blocks merge):** Fix `lib/calendar/errors.ts` return-type narrowing so `npm run build` passes.
2. **Recommended before PO check-off:** Address silent DB empty fallback (Medium); fix EN `calendar.sidebar.client` (Low).
3. **Optional hardening:** Add missing CONTRACT security grep/runtime tests (Low).

After (1) is merged and build is green, re-run QA gate → expect **APPROVE WITH CONDITIONS** on remaining Low/Medium items.
