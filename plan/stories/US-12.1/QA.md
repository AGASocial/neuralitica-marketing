# QA Report — US-12.1 Weekly calendar view

**Story:** US-12.1 — Weekly calendar view (Calendario de contenido)  
**Branch:** `feature/US-12.1-weekly-calendar`  
**Date:** 2026-08-30 (re-run after fix commit `79546ab`)  
**Reviewer:** qa-engineer  
**Sources:** `VALIDATION.md` · `CONTRACT.md` · `SECURITY.md` · `lib/calendar/` · `components/calendar/` · `app/(app)/operator/calendar/` · `app/api/media/assets/[assetId]/route.ts`

---

## Verdict: APPROVE WITH CONDITIONS

All US-12.1 blocking defects from the initial gate are resolved. Security controls pass; calendar unit tests pass (18/18). Calendar module type-checks cleanly in production build. Full `npm run build` still fails on a **pre-existing, out-of-scope** TTS type error (`lib/tts/synthesize-voiceover-for-client-trusted.ts:149`) — unchanged from US-11.3 QA; does not block US-12.1 story closure on feature merit.

**Severity counts:** Critical **0** · High **0** · Medium **0** · Low **2**

---

## Findings

### Resolved since initial gate (79546ab)

| Prior severity | File | Issue | Resolution |
|----------------|------|-------|------------|
| **High** | `lib/calendar/errors.ts` | Return-type narrowing caused `next build` failure | Helpers now return `CalendarErrorEnvelope` directly; build passes calendar modules |
| **Medium** | `lib/calendar/get-operator-calendar-for-week.ts:79-80` | DB errors silently returned `[]` | Now throws; action catches → `calendarInternalError()` envelope |
| **Low** | `messages/en.json` | `calendar.sidebar.client` was `"Cliente"` | Fixed to `"Client"` |

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
| DB load failure → INTERNAL_ERROR | **PASS** | `get-operator-calendar-for-week.ts:79-80` throws; action `:53-57` returns `calendarInternalError()` |
| Back doors / hardcoded bypass | **PASS** | None beyond sanctioned `getCurrentUser()` interim user |

---

## Checks run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/calendar/calendar.test.ts` | **18 / 18 pass** (~137 ms) |
| `npm run build` | **FAIL** — pre-existing TTS type error at `lib/tts/synthesize-voiceover-for-client-trusted.ts:149` (`'inserted' is possibly 'null'`); calendar modules compile; **out of scope** (same as US-11.3 QA) |
| `npm run lint` | **FAIL** — repo-wide pre-existing issues; US-12.1 calendar prod files have no unique lint errors |
| Manual grep: Cliente imports of `getOperatorCalendarForWeek` | **None** |
| Manual review: media route Operator/Cliente branches | **Matches CONTRACT** |
| Fix commit review: `79546ab` | **PASS** — errors.ts, DB throw, EN label |

---

## What was not covered

- Browser E2E (Operator grid, sidebar, week navigation, thumbnail load in authenticated session)
- Live Supabase integration / migration apply on remote project
- Load testing sync-on-read under concurrent Operator reads
- Full repo lint/type-check cleanliness (out of US-12.1 scope; pre-existing debt)
- TTS build fix (separate hygiene / US-11.x follow-up)

---

## Closure recommendation

**Close US-12.1 — APPROVE WITH CONDITIONS.**

1. **Story is ready for PO check-off.** All blocking (High/Medium) findings are fixed; security gates and unit tests pass.
2. **Optional hardening (Low, non-blocking):** Add missing CONTRACT security grep/runtime tests listed above in a follow-up or before Cliente calendar work.
3. **Repo hygiene (out of scope):** Fix TTS `inserted` nullability before production deploy of the full app; does not block US-12.1 feature closure.
