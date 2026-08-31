# QA Report — US-13.1 Record basic post metrics manually

**Story:** US-13.1 — Record basic post metrics manually  
**Branch:** `feature/US-13.1-reel-metrics`  
**Date:** 2026-08-31  
**Reviewer:** qa-engineer  
**Scope:** `lib/metrics/**`, `lib/contracts/reel-metrics.ts`, `components/calendar/ReelMetricsSection.tsx`, calendar DTO delta, migration `20260831070000_neuramark_reel_metrics.sql`

### Verdict: APPROVE WITH CONDITIONS

**Severity counts:** Critical **0** · High **0** · Medium **0** · Low **4**

---

## SECURITY.md condition audit

| # | Condition | Result | Evidence |
|---|-----------|--------|----------|
| 1 | `requireOperator("handler")` first; zero side effects on 403 | **PASS** | `lib/metrics/actions/upsert-reel-metrics.ts:35–43` first `await`; grep test confirms order before forbidden keys / core |
| 2 | Input `{ assembledReelId, views, likes, comments, saves, dms }` `.strict()` + forbidden keys | **PASS** | `lib/contracts/reel-metrics.ts:74–146`; tests for `client_id`, `publish_status`, `slotId` |
| 3 | Tenancy from reel row; Operator cross-tenant allowed | **PASS** | UPSERT sets `client_id: reel.clientId` (`upsert-reel-metrics.ts:146`); cross-tenant test passes |
| 4 | Published-only server gate | **PASS** | `loadPublishedSlotGateForReelScript` join; `NOT_PUBLISHED` when zero published slots |
| 5 | 7-day edit window from latest `published_at` | **PASS** | `reel-metrics-edit-window.ts`; handler returns `EDIT_WINDOW_EXPIRED` |
| 6 | Integer bounds 0 … `REEL_METRICS_MAX_VALUE` | **PASS** | Zod + DB CHECK constraints in migration |
| 7 | No authority/timestamp spoof keys | **PASS** | `FORBIDDEN_REEL_METRICS_AUTHORITY_KEYS` scanned pre-parse |
| 8 | Dedicated mutation surface | **PASS** | `upsertReelMetrics` only; calendar read has no `.upsert(` |
| 9 | Calendar DTO `metrics` + server `editable` | **PASS** | `buildReelMetricsDtoForPublishedReel` in read path |
| 10 | Rate limit 30/60 min via `reel_metrics_upsert` | **PASS** | `check-reel-metrics-upsert-rate-limit.ts`; test for `RATE_LIMITED` |
| 11 | UPSERT full snapshot; server `recorded_at` | **PASS** | Handler sets `recorded_at = now()`; five counters required |
| 12 | Error envelope house pattern | **PASS** | `lib/metrics/errors.ts` + `REEL_METRICS_MESSAGE_KEYS` |
| 13 | DDL: `neuramark_` prefix, UNIQUE, FKs, RLS deny-by-default | **PASS** | Migration matches CONTRACT |
| 14 | Automated security tests minimum list | **PASS WITH GAP** | All cases covered except explicit **expired window on update of existing row** (see Finding #3) |

**Trust boundaries:** No `@supabase` imports in `components/calendar/`. No secrets or service-role exposure in client bundle. No back doors, eval, or unexpected outbound calls in metrics modules.

---

## Findings

### 1. Low — FE defaults `editable` to `true` when metrics snapshot is absent

**File:** `components/calendar/ReelMetricsSection.tsx:71`

**What:** `const editable = metrics?.editable ?? true` enables Save and inputs when `slot.metrics` is `null`/`undefined`.

**Why it matters:** CONTRACT requires BE to emit a non-null metrics snapshot for published slots with `assembledReelId`. If the read path regresses, the Sidebar could briefly show an editable form; server gates still block unauthorized writes.

**Fix direction:** Default to `false` when `metrics` is null (`metrics?.editable === true`), or assert non-null metrics when the section renders.

---

### 2. Low — Rate-limit check fails open on DB error

**File:** `lib/metrics/check-reel-metrics-upsert-rate-limit.ts:37–42`

**What:** On `windowError`, the check returns `{ ok: true }` and allows the mutation.

**Why it matters:** During rate-limit table outages, spam upserts are unbounded. Inherited from US-12.2 `check-calendar-mark-published-rate-limit.ts` — consistent but weakens abuse protection.

**Fix direction:** Align with product policy: fail closed → `RATE_LIMITED` or `INTERNAL_ERROR`, or document accepted residual risk in SECURITY_BASELINE.

---

### 3. Low — CONTRACT security test gap: expired window on **update** of existing row

**File:** `lib/metrics/upsert-reel-metrics.test.ts` (missing case)

**What:** CONTRACT § Security tests requires a distinct case for expired window when a metrics row already exists. Implementation uses one handler path; only a create-path expired test exists (`publishedSlots: old date`, no pre-seeded row, no UPSERT assertion on unchanged row).

**Why it matters:** Test hygiene / contract traceability. Behavior is equivalent — handler rejects before UPSERT regardless of row existence.

**Fix direction:** Add test with `existingMetrics` seeded and assert `upsertCalls.length === 0` + `EDIT_WINDOW_EXPIRED`.

---

### 4. Low — Unused imports in published-slot helper

**File:** `lib/metrics/load-published-slot-for-reel.ts:5–7`

**What:** `computeReelMetricsEditable` and `isWithinReelMetricsEditWindow` are imported but unused (re-exported separately on lines 13–17).

**Why it matters:** Lint noise only; no runtime impact.

**Fix direction:** Remove redundant imports; keep re-export from `./reel-metrics-edit-window`.

---

## Correctness notes (non-findings)

- **Gate order** matches CONTRACT: operator → forbidden keys → Zod → rate limit → reel load → published gate → edit window → UPSERT → record attempt.
- **Ownership:** `client_id` never accepted from request; denormalized from `neuramark_assembled_reels`.
- **Integer-only V1:** Five counters; no free-text injection surface for US-13.2.
- **Orphan metrics:** Write blocked when no live published slot (`NOT_PUBLISHED`); row retained in DB per CONTRACT.
- **Success DTO** hardcodes `editable: true` post-write (`upsert-reel-metrics.ts:177`) — acceptable because write succeeded within window; refresh recomputes.

---

## Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/metrics/upsert-reel-metrics.test.ts lib/calendar/calendar.test.ts` | **37 passed, 0 failed** |
| `npx eslint components/calendar/ReelMetricsSection.tsx lib/metrics lib/contracts/reel-metrics.ts` | **12 problems** — 10× `require()` in test file (project-wide pattern); 2 unused-import warnings in `load-published-slot-for-reel.ts`; **production metrics/FE files clean** |
| `npm run lint` (full project) | **Exit 1** — pre-existing errors outside US-13.1 scope |
| `npm run build` | **Exit 1** — type error in `lib/tts/synthesize-voiceover-for-client-trusted.ts:149` (unrelated to US-13.1) |
| Manual code review | SECURITY.md 14 conditions, CONTRACT gate order, migration DDL, FE/server boundary |
| Back-door grep (`eval`, secrets, hardcoded creds in `lib/metrics/`) | **Clean** |

---

## Conditions for merge (non-blocking)

1. Address Finding #1 (FE `editable` default) before or immediately after merge — low UX risk; server is authoritative.
2. Add Finding #3 test when convenient — contract hygiene.
3. Findings #2 and #4 are optional hardening / cleanup.

---

## What Was Not Covered

- Manual UAT on `/operator/calendar` in browser (Save flow, expired window UI, EN/ES copy).
- Live Supabase integration / migration apply against remote project.
- Rate-limit concurrency under parallel requests.
- Full-project `npm run build` pass (blocked by unrelated TTS type error).
- Performance profiling of N+1 `loadPublishedSlotGateForReelScript` calls per published slot in week load (read-path only; not a security issue).

---

## Summary

US-13.1 implementation satisfies all five acceptance criteria and SECURITY.md binding conditions. Operator-only mutation, published-only gate, edit window, integer bounds, forbidden authority keys, tenancy from reel row, and dedicated Server Action are correctly enforced server-side. No Critical or High issues found. **Approve with conditions** on four Low findings (one FE default, one inherited fail-open rate limit, one missing test case, one lint cleanup).
