# Validation Report — US-12.2

**Story:** Mark manual publication done  
**Branch:** `feature/US-12.2-mark-published`  
**Validator:** requirements-validator  
**Date:** 2026-08-30  
**Tests run:** `npx tsx --test lib/calendar/calendar.test.ts lib/calendar/mark-calendar-slot-published.test.ts` — **39/39 pass**

### Verdict: PASS WITH NOTES

### AC score: **4 / 4**

---

## Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Only approved Reels can be marked published | **PASS** | **BE:** `verifySlotReadyForPublish` loads latest approval via assembled reel and requires `approval.status === "approved"` before UPDATE (`lib/calendar/mark-calendar-slot-published.ts` L41–76, L111–119). Non-approved → `NOT_APPROVED`; missing assembly → `SLOT_NOT_READY`. **Tests:** `markCalendarSlotPublishedCore` — non-approved slot → `NOT_APPROVED` with no UPDATE; re-mark after approval revoked → `NOT_APPROVED` without UPDATE (`lib/calendar/mark-calendar-slot-published.test.ts`). **FE:** Mark CTA gated on `pipelineStatus === "approved"` (`components/calendar/OperatorCalendarView.tsx` L318, L539–546). |
| Published date defaults to today, editable | **PASS** | **FE:** `MarkPublishedDialog` initializes `publishedDate` with `localTodayDate()` and resets to today when `publishedAt` is null via `publishedAtDtoToDate` (`components/calendar/MarkPublishedDialog.tsx` L38–58, L69, L75–80). PrimeReact `Calendar` is editable (`L162–175`). Submits `YYYY-MM-DD` to action (`L108`). **BE:** Stores UTC noon anchor (`lib/calendar/operator-local-calendar-date.ts` L18–19; `mark-calendar-slot-published.ts` L126–139). |
| Operator-only: action rejects non-operator sessions server-side (403) | **PASS** | **BE:** `markCalendarSlotPublished` calls `requireOperator("handler")` as first `await` (`lib/calendar/actions/mark-calendar-slot-published.ts` L36–44). Cliente/non-operator → `FORBIDDEN` envelope (`L22–27`, `errors.ts` L42–44). **Test:** Cliente session → `FORBIDDEN` with no UPDATE (`mark-calendar-slot-published.test.ts`); grep asserts `requireOperator` precedes core call. **FE:** Surface lives under `/operator/calendar` (operator layout). |
| **[SEC]** Approved-only enforced server-side in mark-published handler; IG URL validated as `https://www.instagram.com/...`, stored as text, never rendered as raw link without validation | **PASS** | **Approved-only:** Same server join as AC1 — handler re-checks approval on every call including re-mark (`mark-calendar-slot-published.ts` L111–119). **IG URL validation:** `calendarInstagramPostUrlSchema` requires `https:` + `hostname === "www.instagram.com"` + path (`lib/contracts/calendar.ts` L122–143). Input normalized via `markCalendarSlotPublishedInstagramPostUrlInputSchema` (empty → null, L188–192). Invalid URL → `VALIDATION_ERROR` + `calendar.markPublished.errors.invalidIgUrl` (`actions/mark-calendar-slot-published.ts` L53–55; `errors.ts` L74–81). **Storage:** `instagram_post_url` text column in migration (`supabase/migrations/20260831060000_neuramark_content_calendar_slots_publish_metadata.sql` L6); UPDATE writes validated value (`mark-calendar-slot-published.ts` L139–140). **Safe render:** FE `href` binds only `slot.instagramPostUrl` from DTO — card (`OperatorCalendarView.tsx` L212–217) and Sidebar (`L517–521`) with `target="_blank"` + `rel="noopener noreferrer"`. Read mapper re-validates stored URL before DTO emit (`lib/calendar/map-publish-metadata-dto.ts` L28–35). **Tests:** invalid hosts / `javascript:` rejected; valid `https://www.instagram.com/reel/…` accepted and stored. |

---

## Convention Compliance

| Area | Status | Notes |
|------|--------|-------|
| EN + ES user-facing strings | **PASS** | `calendar.markPublished.*` in `messages/en.json` and `messages/es.json` (L1050–1075); wired via `app/(app)/operator/calendar/page.tsx`. |
| PrimeReact-first UI | **PASS** | `Dialog`, `Calendar`, `Button`, `InputText`, `Message`, `Sidebar` in `MarkPublishedDialog.tsx` and `OperatorCalendarView.tsx`. |
| Server/client boundary | **PASS** | Mark mutation and Supabase access server-only; client component limited to Dialog interactivity. No `@supabase/*` in client. |
| Loading / error / pending states | **PASS** | `useTransition` + disabled submit + spinner (`MarkPublishedDialog.tsx` L73, L142–145); server/field errors via `mapMarkPublishedError`. |
| Auth pattern | **PASS** | `requireOperator("handler")` first; identity from server session, not request body. |
| Backend serves concrete FE consumer | **PASS** | `markCalendarSlotPublished` consumed by `/operator/calendar` Sidebar Dialog. |
| `neuramark_` DB prefix | **PASS** | ALTER on `neuramark_content_calendar_slots`; rate limit uses `neuramark_agent_rate_limits`. |
| CONTRACT alignment | **PASS** | Forbidden keys, gate order, error envelope, sync preserve, rate limit, DTO delta match frozen `CONTRACT.md`. |

---

## Dependency Check

| Dependency | Status |
|------------|--------|
| US-12.1 (Operator calendar, slots table, Sidebar, read DTO) | **Satisfied** — CLOSED; US-12.2 extends existing `/operator/calendar` and `neuramark_content_calendar_slots`. |

---

## Contract / Security Tests (minimum list)

All CONTRACT § Security tests present in `lib/calendar/mark-calendar-slot-published.test.ts` and pass:

- Cliente → `FORBIDDEN`, no UPDATE
- Operator happy path → `{ ok: true, pipelineStatus: "published" }`
- Non-approved → `NOT_APPROVED`
- No assembly → `SLOT_NOT_READY`
- `client_id` / `publish_status` in body → `FORBIDDEN_FIELDS`
- Invalid IG URL → `VALIDATION_ERROR` + invalidIgUrl messageKey
- Re-mark overwrite + re-mark after revoke
- Rate limit → `RATE_LIMITED`
- Grep: sync/read do not UPDATE publish metadata; mark action has no Graph imports

---

## Gaps (what blocks PASS)

**None.** All four USER_STORIES acceptance criteria are met with code and test evidence.

---

## Scope Creep

| Item | Assessment |
|------|------------|
| Rate limit (`calendar_mark_published`, 30/60 min) | **In CONTRACT/SECURITY** — not USER_STORIES AC; appropriate hardening, not scope creep. |
| `operator-local-calendar-date.ts`, `map-publish-metadata-dto.ts` | **Supporting modules** for CONTRACT date bounds and safe DTO mapping — justified. |
| Idempotent re-mark / update publish details | **In CONTRACT Phase A** — closes story intent. |

**Not implemented (correctly deferred):** unpublish, Instagram Graph publish (ADR-0002), metrics UI (US-13.1), separate publish route.

---

## Partial Closures / Deferred Items

| Item | Status |
|------|--------|
| Phase B (unpublish, Graph auto-mark, audit) | **Deferred** per CONTRACT — not AC blockers. |
| Sync orphan DELETE of published slots | **Known V1 residual** — hard DELETE preserved; US-13.1 to handle gracefully. |
| `USER_STORIES.md` DB row (missing `published_at` / `instagram_post_url`) | **Doc drift** — implementation and migration correct; PO doc update pending. |
| `README.md` story status still "PREP" | **Doc drift** — BUILD landed; PO should update on CLOSE. |
| `CONTRACT.md` FE signoff checklist boxes | **Process doc** — implementation matches signoff notes; boxes not ticked in doc. |
| E2E / browser verification | **Not run** — unit/security tests only (39/39 pass). |
| Remote migration apply | **Not verified** — DDL file present; runtime DB apply out of validator scope. |

---

## Recommended Next Actions

| Action | Owner |
|--------|-------|
| Run **QA gate** (`qa-engineer`) — security review, manual Operator calendar flow | qa-engineer |
| **CLOSE** — PO checks AC in `USER_STORIES.md` after QA | product-owner |
| Optional: amend `USER_STORIES.md` DB row + README status on CLOSE | product-owner |
| Unblock **US-13.1** metrics on published Reels | next sprint |

---

## Summary

US-12.2 Phase A is **complete** against all four acceptance criteria. Backend enforces approved-only and Operator-only gates server-side; IG URLs are allowlist-validated, stored as text, and rendered only from re-validated DTO values. Frontend ships Dialog, CTAs, published affordances, and EN/ES copy on the existing Operator calendar. **39/39** targeted tests pass. Proceed to QA.
