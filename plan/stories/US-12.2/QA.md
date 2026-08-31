# QA Report — US-12.2 Mark manual publication done

**Story:** US-12.2 — Mark manual publication done  
**Branch:** `feature/US-12.2-mark-published`  
**Reviewer:** qa-engineer  
**Date:** 2026-08-30  
**Scope:** `lib/calendar/` (mark-published action/core, rate limit, sync preserve, DTO mapper), `components/calendar/` (Dialog, Sidebar CTAs, IG links), migration `20260831060000_neuramark_content_calendar_slots_publish_metadata.sql`, `lib/contracts/calendar.ts` (Zod + forbidden keys)

### Verdict: APPROVE

### Findings

| Severity | Location | Issue | Why it matters | Recommended fix |
|----------|----------|-------|----------------|-----------------|
| **Low** | `lib/calendar/check-calendar-mark-published-rate-limit.ts:37-42` | Rate-limit window query errors fail open (`return { ok: true }`). | During `neuramark_agent_rate_limits` outages, an Operator could exceed the 30/60 min cap. Operator + approved-only gates still apply; blast radius is audit noise / DB churn, not publish-gate bypass. | Inherited from `check-approval-rate-limit.ts`. Accept for V1 or align both helpers to fail closed with logging. |
| **Low** | `lib/calendar/mark-calendar-slot-published.ts:129-132` | Omitted `instagramPostUrl` in parsed input is coerced to `null` and written on UPDATE. | Direct Server Action callers (not the Dialog) that re-mark with only `{ slotId, publishedAt }` would clear a stored URL. FE always submits the form field, so the Operator UI path is safe. | Treat `undefined` as “leave unchanged” on re-mark, or document omit-as-clear in CONTRACT; add a core test for preserve-on-omit if semantics change. |
| **Low** | `lib/calendar/mark-calendar-slot-published.ts:85-87` | `markCalendarSlotPublishedCore` trusts caller for Operator role; only the action calls `requireOperator`. | A future server import of core without the handler gate could bypass Operator enforcement. Current codebase has a single consumer (`actions/mark-calendar-slot-published.ts`). | Optional: assert `operator.role === "operator"` in core, or stop exporting core outside tests via a test-only entry. |

**No Critical, High, or Medium findings.**

### Focus-area audit (requested)

| Focus | Result | Evidence |
|-------|--------|----------|
| **Approved-only bypass** | **PASS** | `verifySlotReadyForPublish` requires branded assembly + `approval.status === "approved"` before UPDATE (`mark-calendar-slot-published.ts:41-76`, `111-119`). Non-approved → `NOT_APPROVED`; no assembly → `SLOT_NOT_READY`. Re-mark after revoke tested. FE CTA gated on `pipelineStatus === "approved"` only (UX). |
| **Operator gate** | **PASS** | `requireOperator("handler")` is first `await` in action (`actions/mark-calendar-slot-published.ts:36-44`). Cliente → `FORBIDDEN`, zero UPDATE (test + grep gate order). Page under `/operator/calendar` operator layout. |
| **IG URL XSS / open-redirect** | **PASS** | Write: `calendarInstagramPostUrlSchema` — HTTPS, `hostname === "www.instagram.com"`, path length > 1, max 500 (`lib/contracts/calendar.ts:122-143`). Read: `mapPublishMetadataToDto` re-parses stored URL before DTO emit. FE `href` binds only `slot.instagramPostUrl` from DTO with `target="_blank"` + `rel="noopener noreferrer"` (`OperatorCalendarView.tsx:212-217`, `517-521`); Dialog form value never used as `href`. No `dangerouslySetInnerHTML`. |
| **Forbidden keys** | **PASS** | `FORBIDDEN_MARK_PUBLISHED_AUTHORITY_KEYS` includes `client_id`, `publish_status`, `pipelineStatus`, assembly/approval IDs, cost keys (`lib/contracts/calendar.ts:293-335`). Scanned before Zod; tests for `client_id` and `publish_status`. Input schema `.strict()`. |
| **Sync escalation** | **PASS** | `syncCalendarSlotsForWeek` UPDATE sets only `strategy_id`, `scheduled_date`, `reel_script_id` (`sync-calendar-slots-for-week.ts:163-167`). INSERT defaults `publish_status: "ready"`, `published_at: null`, `instagram_post_url: null`. Grep tests confirm no publish escalation in sync/read paths. |
| **Rate limit** | **PASS** | `calendar_mark_published`, 30 / 60 min per operator `client_id` (`lib/contracts/calendar.ts:385-390`). Checked after auth/forbidden/Zod (in core, before slot load). Recorded only on successful UPDATE (`mark-calendar-slot-published.ts:152`). `RATE_LIMITED` tested. |

### CONTRACT / SECURITY alignment

- Gate order matches frozen `CONTRACT.md`: `requireOperator` → forbidden keys → Zod → rate limit → slot load → bounds → approval re-check → UPDATE → record attempt → DTO from persisted row.
- Sole `publish_status = 'published'` write path is `markCalendarSlotPublished` / core (grep + calendar.test.ts).
- Migration ALTER only on `neuramark_content_calendar_slots`; `neuramark_` prefix compliant.
- No `@supabase/*` or Supabase keys in client calendar components.
- `neuramark_approvals.assembled_reel_id` UNIQUE — `loadApprovalByAssembledReelScoped` `.maybeSingle()` is correct for one row per reel.

### Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/calendar/calendar.test.ts lib/calendar/mark-calendar-slot-published.test.ts` | **39/39 pass** |
| IDE lints on mark-published action/core + calendar components | **No issues** |
| Manual grep: backdoors, `eval`, client Supabase imports, `dangerouslySetInnerHTML` in scope | **Clean** |
| `npm run build` | **Not run** — pre-existing TTS type error outside US-12.2 scope per orchestrator note |

### What Was Not Covered

- Browser E2E / manual Operator calendar flow (Dialog submit, week refresh, published card affordances).
- Remote Supabase migration apply on staging/production.
- Full-repo `npm run build` and type-check (blocked by unrelated TTS error).
- Load testing / concurrent re-mark races (single-row UPDATE is last-write-wins; acceptable V1).
- Instagram URL homograph / IDN edge cases beyond Zod `.url()` + exact hostname match.

### Story closure recommendation

**Yes — recommend CLOSE** after PO checks AC in `USER_STORIES.md`.

Phase A meets all four acceptance criteria and SECURITY `[SEC]` items with server-side enforcement and automated security tests. Low findings are advisory hardening; none block merge or production readiness for the manual mark-published V1 scope.
