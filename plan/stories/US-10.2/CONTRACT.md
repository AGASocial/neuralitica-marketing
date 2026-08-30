# API Contract — US-10.2 Operator override with reason

**Story:** US-10.2  
**Status:** Frozen — 2026-08-30 · Reviewed by FE: pending  
**Security:** `plan/stories/US-10.2/SECURITY.md` (APPROVE WITH CONDITIONS — reconciled below)  
**Spec review:** `plan/stories/US-10.2/SPEC-REVIEW.md` (ALIGNED — soft gaps closed below)  
**Pattern:** `plan/stories/US-10.1/CONTRACT.md` · `plan/stories/US-8.4/CONTRACT.md` (append-only override + reason 1–500)  
**Depends on:** US-10.1 ✅ Veredicto QA + catalog + `OperatorQaPanel` + gate Phase A · US-3.4 / US-3.2 ✅ blocking keys · US-8.4 ✅ override reason house pattern · US-14.5 ✅ `requireOperator()`  
**Feature branch:** `feature/US-10.2-qa-override`  
**Error envelope style:** same class as US-10.1 / US-8.4 (`ok: true` vs `{ ok: false, error: { code, fields?, messageKey? } }`)

**This document is CONTRACT ONLY.** Zod mirrors live in `lib/contracts/qa-override.ts` (committed with this freeze); additive DTO/gate field extensions are mirrored on `lib/contracts/qa-report.ts` so FE keeps a single import path for panel DTOs. Orchestration under `lib/qa/**`, Server Action, and migration SQL are specified here and applied during BUILD. Do **not** implement Cliente Aprobación UI (US-11.1), catalog mutation, QA re-run/LLM changes, or DELETE/UPDATE override endpoints in this story.

**Terminology:** **Veredicto QA** · **Aprobación** · **Ensamblado** · **Operator** · **Cliente** · **disclosure** · **Consentimiento de avatar**. Technical enums (`checkKey`, `blocking`, `overridable`, `qa_override`, `operator_client_id`) OK in code/DB and Operator diagnostics. Do **not** use CONTEXT _Evitar_ terms in Cliente-facing copy. Do **not** expose override as a Cliente capability. Do **not** expose raw LLM JSON, prompts, provider keys, `storage_key`, or spend cents on Cliente serializers.

**USER_STORIES surface amendment (binding):** Override modal + audit list render on existing **`OperatorQaPanel`** inside `/operator/scripts` expand — **not** a new Operator route. Cliente Aprobación render of overrides is **US-11.1** (this story ships DTO / gate handoff only).

**USER_STORIES AC amendment (binding for VALIDATION):** AC “Overrides visible on approval screen” is **satisfied for US-10.2** by shipping server `overrides[]` + gate key lists for US-11.1 — **not** by building the Cliente approval page here. AC “Cannot override consent/legal blocks” = catalog `blocking` → **403** even for Operator.

**USER_STORIES DB shorthand:** Row lists `qa_overrides` + `user_id`; canonical table is **`neuramark_qa_overrides`** with **`operator_client_id`** (mirror US-8.4) + denormalized `client_id` / `assembled_reel_id`. Amend USER_STORIES when PO next edits.

---

## SPEC-REVIEW gaps closed

| # | Gap | Resolution |
|---|-----|------------|
| 1 | No US-10.2 CONTRACT.md | This document |
| 2 | AC “visible on approval screen” vs no US-11.1 UI | § Phased BUILD · § DTOs · § Non-goals — DTO handoff; Cliente render = US-11.1 |
| 3 | USER_STORIES DB shorthand `qa_overrides` / `user_id` | § Migration — `neuramark_qa_overrides` + `operator_client_id` |
| 4 | US-11.1 Depends omits US-10.2 | § Downstream obligations — soft DEPENDS for PO; gate + DTO frozen here |
| 5 | Gate Phase A `passed`-only vs override coverage | § `getQaGateStatusForAssembledReel` — replaces Phase A ready rule |
| 6 | Rate limit lean | § Rate limit — `agent_key: 'qa_override'` (SECURITY APPROVE) |
| 7 | Reject non-failed targets | § `overrideQaCheck` — `CHECK_NOT_FAILED` |
| 8 | Exact gate DTO field names | § Gate helper — `overriddenCheckKeys` / `uncoveredFailedCheckKeys` required |

## SECURITY reconciliation (binding)

| Topic | SECURITY condition | **Frozen in this contract** |
|-------|-------------------|----------------------------|
| Auth first | `requireOperator("handler")` first await | § `overrideQaCheck` orchestrator step 1 |
| Pointer-only input | `{ qaReportId, checkKey, reason }` `.strict()` | § Request · § Forbidden keys |
| Forbidden authority | Reject override-all / verdict / tenancy spoof | § `FORBIDDEN_QA_OVERRIDE_AUTHORITY_KEYS` · § `findForbiddenQaOverrideKeys` |
| Catalog authority | Import `lib/qa/check-catalog.ts`; never body severity | § Catalog enforcement |
| Blocking set | `own_avatar_consent`, `generic_avatar_not_owner` → **403** even for Operator | § Catalog · § Error codes `CHECK_BLOCKING` |
| Fail target only | INSERT only when check `fail` + overridable | § `CHECK_NOT_FAILED` |
| Reason | Trim 1–500 (`OVERRIDE_REASON_*`) | § Reason · Zod |
| Actor + tenancy | Actor from `getCurrentUser()`; report scoped by server `client_id`; foreign → **404** | § Orchestrator steps |
| Append-only ledger | INSERT only; zero UPDATE/DELETE endpoints | § Migration · § Closed write surface |
| Report immutable | No UPDATE `status` / `checks` on override | § Orchestrator · § Non-goals |
| Gate extension | Ready = `passed` **or** (`failed` ∧ no blocking ∧ all failed overridable overridden); `blocked` never via ledger | § `getQaGateStatusForAssembledReel` |
| Gate DTO keys | `overriddenCheckKeys` / `uncoveredFailedCheckKeys` informational only | § Gate helper |
| No Cliente override | No Cliente-callable action / UI | § Forbidden surfaces · § Non-goals |
| Rate limit | `agent_key: 'qa_override'` → 429 | § Rate limit |
| DDL + RLS | FKs, CHECK reason, indexes, RLS zero policies | § Migration |
| XSS | Plain text / i18n / PrimeReact — no `dangerouslySetInnerHTML` | § Operator FE contract |
| Approval visibility | DTO handoff for US-11.1 | § DTOs · § Phased BUILD |

---

## Phased BUILD acceptance

| Phase | Scope | Closes |
|-------|-------|--------|
| **A (US-10.2 BUILD — ship first)** | DDL `neuramark_qa_overrides`; `overrideQaCheck`; catalog 403 on `blocking`; extend gate helper; Operator modal + audit on `OperatorQaPanel`; `overrides[]` + gate key lists DTO; rate limit; `[SEC]` append-only / per-check / Operator-only | USER_STORIES § US-10.2 AC rows (approval-screen AC via DTO handoff) |
| **B (US-11.1 — soft)** | Cliente Aprobación UI **renders** override audit; re-check gate on package create + decision | USER_STORIES § US-11.1 |

**VALIDATION note (binding):** VALIDATION must **not** claim Cliente approval screen closed. Record: no Cliente override; report `status` not rewritten to `passed`; gate ready when `passed` **or** full overridable coverage on `failed`; blocking always 403.

---

## Overview

US-10.2 ships **per-check Operator override** for failed **overridable** Veredicto QA checks. The Operator submits a non-empty reason for **one** `checkKey` on **one** `qaReportId`; the System INSERTs an append-only audit row into `neuramark_qa_overrides` (actor from session); **rejects** `blocking` checks with **403** even for Operator; **does not** mutate `neuramark_qa_reports.status` / `checks`; extends **`getQaGateStatusForAssembledReel`** so US-11.1 can treat `failed` + full overridable coverage as ready; surfaces override modal + audit on **`OperatorQaPanel`**.

**Surfaces**

| # | Surface | Kind | Consumer |
|---|---------|------|----------|
| 1 | `overrideQaCheck` | Server Action | `/operator/scripts` — `OperatorQaPanel` Override Dialog |
| 2 | `overrideQaCheckForClient` | Server-only orchestrator | Action only (no browser HTTP) |
| 3 | `getQaGateStatusForAssembledReel` | Server-only helper (extend in place) | US-11.1 approval gate (consume only) |
| 4 | Batch overrides on `getQaReportsForAssembledReels` | Server helper | `getReelScriptsForWeek` → `qaByAssembledReelId` detail |
| 5 | Check catalog (import) | Code module | Override 403 + gate coverage — US-10.1 owned |
| 6 | Zod + types | `lib/contracts/qa-override.ts` (+ additive `qa-report.ts`) | FE types · BE validation |
| 7 | Migration | `neuramark_qa_overrides` | Persistence |
| 8 | `/operator/scripts` Override UI | FE | Modal, audit, locked blocking rows |

**Forbidden surfaces (BUILD veto):**

- Any Server Action / Route Handler that accepts `overrideAll`, `overrides[]`, client `passed` / `status` / `checks` / `ready` / `qaPassed`, or severity as write authority.
- UPDATE/DELETE Server Actions or Route Handlers on `neuramark_qa_overrides`.
- UPDATE `neuramark_qa_reports.status` or `checks` from the override path (including rewrite to `passed`).
- Cliente-callable override action or Cliente override UI.
- Report-level / multi-check bypass in a single request.
- Soft-pass of `blocking` for any role.
- Check-catalog CRUD or forked severity map.
- Public Route Handler that sets gate `ready`.
- Browser Supabase / `NEXT_PUBLIC_` Supabase keys.
- Client-supplied `clientId`, `operatorClientId`, `assembledReelId` as write authority (resolve from owned report).
- QA re-run / LLM agent changes (US-10.1).
- US-11.1 `neuramark_approvals` writes.

**Why Server Action:** UI-coupled Operator mutation under `/operator/scripts` Override Dialog; CSRF via Next.js origin check. Gate helper remains **server-only** — not browser HTTP.

---

## Migration — `neuramark_qa_overrides`

**Migration file (BUILD):** `supabase/migrations/20260831020000_neuramark_qa_overrides.sql`

```sql
-- US-10.2: append-only Operator QA check overrides (audit + gate coverage)

CREATE TABLE public.neuramark_qa_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL
    REFERENCES public.neuramark_clients(id),
  qa_report_id uuid NOT NULL
    REFERENCES public.neuramark_qa_reports(id) ON DELETE CASCADE,
  assembled_reel_id uuid NOT NULL
    REFERENCES public.neuramark_assembled_reels(id) ON DELETE CASCADE,
  check_key text NOT NULL,
  reason text NOT NULL
    CHECK (char_length(reason) >= 1 AND char_length(reason) <= 500),
  operator_client_id uuid NOT NULL
    REFERENCES public.neuramark_clients(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX neuramark_qa_overrides_report_check_idx
  ON public.neuramark_qa_overrides (qa_report_id, check_key);

CREATE INDEX neuramark_qa_overrides_client_reel_created_idx
  ON public.neuramark_qa_overrides (client_id, assembled_reel_id, created_at DESC);

COMMENT ON TABLE public.neuramark_qa_overrides IS
  'US-10.2: append-only Operator overrides for failed overridable QA checks; never mutates report status.';
COMMENT ON COLUMN public.neuramark_qa_overrides.check_key IS
  'Must match a known QA catalog checkKey; blocking keys rejected in app layer.';
COMMENT ON COLUMN public.neuramark_qa_overrides.reason IS
  'Operator-documented motivo; trimmed 1–500 chars; plain text.';
COMMENT ON COLUMN public.neuramark_qa_overrides.operator_client_id IS
  'Server-resolved actor from getCurrentUser() after requireOperator — never from body.';

ALTER TABLE public.neuramark_qa_overrides ENABLE ROW LEVEL SECURITY;
-- Zero policies: service-role Node only (deny-by-default for anon/authenticated).
```

| Rule | Detail |
|------|--------|
| Append-only | **Only** INSERT from override path; **zero** UPDATE/DELETE Server Actions / Route Handlers |
| Cardinality | Multiple rows per `(qa_report_id, check_key)` allowed (audit). Gate treats **any** row as coverage for that key |
| Cascade | Deleting QA report removes overrides (`qa_report_id` ON DELETE CASCADE) |
| Denormalized | `client_id` + `assembled_reel_id` copied from owned report at INSERT — never trusted from body |
| Actor | `operator_client_id` from `getCurrentUser().id` after `requireOperator` |
| No updated_at | Append-only ledger — no UPDATE trigger |

**Re-run semantics (US-10.1 UPSERT):** Report `id` typically stable per `assembled_reel_id`. Overrides remain keyed by `qa_report_id` + `check_key`. If re-run still fails an overridable key, prior override rows still cover. If re-run **passes** the check, override rows are **inert** (append-only history — do not auto-delete). New failed overridable keys after re-run need new overrides.

---

## Catalog enforcement

**Import (BUILD):** `lib/qa/check-catalog.ts` — `isBlockingCheckKey` · `isOverridableCheckKey` · `isKnownQaCheckKey` · `severityForCheckKey`.

**Never** trust request `severity` / `blocking` / `overridable`. **Never** fork a second severity map.

| Class | Keys | Override |
|-------|------|----------|
| `blocking` | `own_avatar_consent`, `generic_avatar_not_owner` | **403** always (`CHECK_BLOCKING`) — even for Operator |
| `overridable` | `dangerous_claims`, `tone`, `clarity`, `ai_disclosure`, `cta_presence` | Allowed only if report has that key with `status === 'fail'` |
| Unknown | — | `VALIDATION_ERROR` / fields on `checkKey` |

---

## Forbidden request keys

Scan raw input with **`findForbiddenQaOverrideKeys`** before Zod parse → **`FORBIDDEN_FIELDS`**.

```ts
export const FORBIDDEN_QA_OVERRIDE_AUTHORITY_KEYS = [
  "overrideAll",
  "override_all",
  "overrides",
  "ready",
  "passed",
  "qaPassed",
  "qa_passed",
  "status",
  "checks",
  "severity",
  "blocking",
  "overridable",
  "clientId",
  "client_id",
  "assembledReelId",
  "assembled_reel_id",
  "operatorClientId",
  "operator_client_id",
  "operator_id",
  "userId",
  "user_id",
  "force",
  "skipCatalogCheck",
  "skip_catalog_check",
  "override",
  "reportStatus",
  "report_status",
] as const;
```

**Allowed keys only:** `qaReportId`, `checkKey`, `reason`.

---

## `overrideQaCheck({ qaReportId, checkKey, reason })`

**Kind:** Server Action  
**File (BUILD):** `lib/qa/actions/override-qa-check.ts`  
**Orchestrator (BUILD):** `lib/qa/override-qa-check.ts` (`import "server-only"`) — `overrideQaCheckForClient`  
**Consumer:** `/operator/scripts` — `OperatorQaPanel` Override Dialog  
**Auth:** `requireOperator("handler")` as **first await** — failure → 401/403, **no side effects**, **no INSERT**.

### Request

```ts
{
  qaReportId: string; // uuid
  checkKey: QaCheckKey; // known catalog key
  reason: string; // trim → length ∈ [1, 500]
} // .strict() only
```

### Success

```ts
{
  ok: true;
  qaReportId: string;
  assembledReelId: string;
  checkKey: QaCheckKey;
  overrideId: string;
  status: QaReportStatus; // unchanged from report (still failed|blocked|…)
  overrides: OperatorQaOverrideDto[]; // full chronological list for report after INSERT
  report: OperatorQaReportDetailDto; // includes checks + overrides; status unchanged
}
```

### Error envelope

```ts
{
  ok: false;
  error: {
    code: QaOverrideErrorCode;
    messageKey?: string;
    fields?: Record<string, string[]>;
  };
}
```

### Orchestrator steps (`overrideQaCheckForClient`)

| Step | Action |
|------|--------|
| 1 | `requireOperator("handler")` first — fail → 401/403, no side effects |
| 2 | Forbidden-key scan → `FORBIDDEN_FIELDS` |
| 3 | Zod `.strict()` → `{ qaReportId, checkKey, reason }`; reason trim; length ∉ [1, 500] → `VALIDATION_ERROR` |
| 4 | Rate limit `qa_override` → `RATE_LIMITED` (no INSERT) |
| 5 | Load `neuramark_qa_reports` **`WHERE id = $qaReportId AND client_id = $serverClientId`** — miss → **`NOT_FOUND`** (404) |
| 6 | If `!isKnownQaCheckKey(checkKey)` → `VALIDATION_ERROR` fields |
| 7 | If `isBlockingCheckKey(checkKey)` → **`CHECK_BLOCKING`** (403) — **even for Operator** |
| 8 | Find check in report `checks[]` with matching `checkKey`. Missing **or** `status !== 'fail'` **or** catalog not overridable → **`CHECK_NOT_FAILED`** |
| 9 | INSERT into `neuramark_qa_overrides`: `client_id` + `assembled_reel_id` from report; `operator_client_id` from `getCurrentUser().id`; `check_key`; trimmed `reason`. **Do not** UPDATE report `status` / `checks` / `updated_at` |
| 10 | Load overrides for report (chronological ASC by `created_at`) |
| 11 | `revalidatePath("/operator/scripts")` |
| 12 | Return success DTO — `status` = report status **unchanged** |

**Forbidden in this path:** UPDATE/DELETE overrides; UPDATE report verdict columns; accept multi-key body; invent coverage for `pass` / `skipped`.

---

## Reason

Reuse house constants from `lib/contracts/cost-policy.ts`:

| Constant | Value |
|----------|-------|
| `OVERRIDE_REASON_MIN_LENGTH` | **1** |
| `OVERRIDE_REASON_MAX_LENGTH` | **500** |

Trim whitespace before length check. Empty/whitespace-only → `VALIDATION_ERROR` on `reason`.

---

## Rate limit

Reuse `neuramark_agent_rate_limits`:

| Constant | Value |
|----------|-------|
| `agent_key` | **`qa_override`** |
| Window | **60 minutes** rolling |
| Max attempts | **20** per `client_id` per window (light — no LLM; higher than `qa_run`) |
| Over-limit | **`RATE_LIMITED`** (429) — no INSERT |

Constants in `lib/contracts/qa-override.ts`: `QA_OVERRIDE_AGENT_KEY`, `QA_OVERRIDE_RATE_WINDOW_MS`, `QA_OVERRIDE_MAX_PER_WINDOW`.

UI debounce is **not** a control.

---

## `getQaGateStatusForAssembledReel` (extended)

**File (BUILD):** extend `lib/qa/get-qa-gate-status-for-assembled-reel.ts` in place (`import "server-only"`).

```ts
export async function getQaGateStatusForAssembledReel(
  assembledReelId: string,
): Promise<QaGateStatus>;

// QaGateStatus (US-10.2):
{
  ready: boolean;
  status: QaReportStatus | null; // null if no report row
  hasBlockingFailures: boolean;
  hasOverridableFailures: boolean;
  qaReportId: string | null;
  overriddenCheckKeys: string[];      // required — [] when none / not ready context
  uncoveredFailedCheckKeys: string[]; // required — failed overridable keys lacking ≥1 override
}
```

### Readiness (replaces Phase A)

```ts
// ready === true iff:
//   (a) status === "passed"
//   OR
//   (b) status === "failed"
//       && hasBlockingFailures === false
//       && every check in checks with status === "fail"
//          and catalog severity === "overridable"
//          has ≥1 row in neuramark_qa_overrides for (qa_report_id, check_key)
//
// blocked | pending | running | missing → ready === false
// NEVER accepts / honors caller-supplied passed / ready / override flags from HTTP
```

| Rule | Detail |
|------|--------|
| Tenancy | Keep US-10.1 pattern: `getCurrentUser()` + scoped assembly/report loads; foreign → not ready |
| Catalog | Severity for coverage from `lib/qa/check-catalog.ts` (prefer catalog over stored severity if diverge) |
| `overriddenCheckKeys` | Distinct `check_key` values with ≥1 override row for this `qa_report_id` (informational) |
| `uncoveredFailedCheckKeys` | Failed overridable keys on report lacking coverage; empty when ready via path (a) or (b) |
| `hasOverridableFailures` | Still derived from report checks (fail + overridable) — **not** cleared by overrides |
| Authority | Reads **DB only** (report + ledger). Function must **not** accept `passed` / `ready` / override flags from HTTP |
| Pure helper | Export `computeQaGateReady({ status, checks, overriddenCheckKeys })` in contracts for unit tests |

**Consumer obligation (US-11.1):** Re-check gate on package create **and** decision submit via this helper. Never honor `qaPassed` / client override flags. Render audit from server DTO.

**Deprecate Phase A-only:** `isQaReportReadyPhaseA` remains for legacy tests but gate helper **must not** use it after this story — use `isQaReportReadyWithOverrides` / `computeQaGateReady`.

---

## Batch / DTO extensions

### `OperatorQaOverrideDto`

```ts
{
  overrideId: string;
  checkKey: QaCheckKey;
  reason: string; // plain text, ≤500
  createdAt: string; // ISO
  operatorDisplayName?: string; // optional; from server join — never Operator-only secrets
}
```

### `OperatorQaReportDetailDto` (extend US-10.1)

```ts
{
  qaReportId: string;
  assembledReelId: string;
  status: QaReportStatus;
  checks: QaCheckResult[];
  overrides: OperatorQaOverrideDto[]; // chronological ASC; [] if none — REQUIRED on detail
  createdAt: string;
  updatedAt: string;
}
```

**Week load:** `qaByAssembledReelId` continues to attach **detail** DTO (≤3 Reels/week). BUILD extends `getQaReportsForAssembledReels` to batch-load overrides per report id and attach `overrides[]`. Summary DTO (if used) may omit `overrides` — panel primary path uses detail.

### US-11.1 handoff

| Field | Purpose |
|-------|---------|
| `overrides[]` on detail / approval package (later) | Cliente-readable audit: check label + reason + timestamp |
| Gate `overriddenCheckKeys` / `uncoveredFailedCheckKeys` | Explain readiness without re-query |
| Gate `ready` | Package create + decision re-check |

Cliente **render** of audit = **US-11.1**. Reason is plain text, length-capped; React text only.

**Never in DTO:** raw LLM JSON, prompts, provider keys, `storage_key`, cost cents, service-role material.

---

## Operator QA panel contract (FE)

| Element | Behavior |
|---------|----------|
| Surface | Extend **`OperatorQaPanel`** only — `/operator/scripts` expand |
| Override CTA | Per check with `status === 'fail'` **and** `severity === 'overridable'`: **Override** opens PrimeReact Dialog (mirror `VideoJobRetryLimitOverrideDialog`) |
| Dialog | Reason `InputTextarea`; submit disabled unless trimmed length ∈ [1, 500]; cancel; pending |
| Blocking fails | **No** override CTA; locked / legal non-overridable copy (EN/ES) |
| After success | Merge returned `report` (status unchanged; `overrides` grows); toast |
| Audit list | Chronological `overrides[]` — check label, reason, timestamp; optional operator display |
| Empty / loading / error | Standard Operator patterns; map codes to `scripts.qa.override.errors.*` |
| Override-all | **Absent** — no control; FE may loop N single-check calls only |
| XSS | React text / i18n / PrimeReact only — **no** `dangerouslySetInnerHTML` |
| Authority | Hidden CTA is **not** a control; server 403 remains authority for blocking |

**i18n namespace:** `scripts.qa.override.*` (+ reuse `scripts.qa.checks.*` / `qa.checks.*`).

**Types:** Import override action types from `lib/contracts/qa-override.ts`; panel detail from `lib/contracts/qa-report.ts` (extended).

---

## Error codes

```ts
export const qaOverrideErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "FORBIDDEN_FIELDS",
  "CHECK_BLOCKING",
  "CHECK_NOT_FAILED",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
]);
```

| Code | HTTP-ish | When |
|------|----------|------|
| `UNAUTHENTICATED` | 401 | No session |
| `FORBIDDEN` | 403 | Cliente / inactive Operator |
| `NOT_FOUND` | 404 | Foreign or missing `qaReportId` |
| `FORBIDDEN_FIELDS` | 400 | Authority key smuggle (`overrideAll`, `passed`, …) |
| `VALIDATION_ERROR` | 400 | Zod / reason length / unknown `checkKey` |
| `CHECK_BLOCKING` | 403 | Catalog severity `blocking` — even for Operator |
| `CHECK_NOT_FAILED` | 409 | Check missing, `pass`, `skipped`, or not overridable fail |
| `RATE_LIMITED` | 429 | `qa_override` window exceeded |
| `INTERNAL_ERROR` | 500 | Unexpected |

---

## Fixtures (FE mock)

### Override request

```json
{
  "qaReportId": "ffffffff-0000-4000-8000-333333333333",
  "checkKey": "tone",
  "reason": "Client-approved soft claim; tone acceptable for local market."
}
```

### Success — report stays `failed`

```json
{
  "ok": true,
  "qaReportId": "ffffffff-0000-4000-8000-333333333333",
  "assembledReelId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "checkKey": "tone",
  "overrideId": "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
  "status": "failed",
  "overrides": [
    {
      "overrideId": "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
      "checkKey": "tone",
      "reason": "Client-approved soft claim; tone acceptable for local market.",
      "createdAt": "2026-08-30T18:00:00.000Z",
      "operatorDisplayName": "Gabriel Vega"
    }
  ],
  "report": {
    "qaReportId": "ffffffff-0000-4000-8000-333333333333",
    "assembledReelId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    "status": "failed",
    "checks": [
      {
        "checkKey": "tone",
        "status": "fail",
        "severity": "overridable"
      },
      {
        "checkKey": "clarity",
        "status": "pass",
        "severity": "overridable"
      }
    ],
    "overrides": [
      {
        "overrideId": "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
        "checkKey": "tone",
        "reason": "Client-approved soft claim; tone acceptable for local market.",
        "createdAt": "2026-08-30T18:00:00.000Z",
        "operatorDisplayName": "Gabriel Vega"
      }
    ],
    "createdAt": "2026-08-30T17:00:00.000Z",
    "updatedAt": "2026-08-30T17:05:00.000Z"
  }
}
```

### Error — blocking (consent)

```json
{
  "ok": false,
  "error": {
    "code": "CHECK_BLOCKING",
    "messageKey": "scripts.qa.override.errors.checkBlocking"
  }
}
```

### Error — override-all smuggle

```json
{
  "ok": false,
  "error": {
    "code": "FORBIDDEN_FIELDS",
    "messageKey": "scripts.qa.override.errors.forbiddenFields",
    "fields": { "overrideAll": ["FORBIDDEN"] }
  }
}
```

### Error — Cliente

```json
{
  "ok": false,
  "error": {
    "code": "FORBIDDEN",
    "messageKey": "scripts.qa.override.errors.forbidden"
  }
}
```

### Gate — ready via full overridable coverage

```json
{
  "ready": true,
  "status": "failed",
  "hasBlockingFailures": false,
  "hasOverridableFailures": true,
  "qaReportId": "ffffffff-0000-4000-8000-333333333333",
  "overriddenCheckKeys": ["tone"],
  "uncoveredFailedCheckKeys": []
}
```

### Gate — not ready (one uncovered)

```json
{
  "ready": false,
  "status": "failed",
  "hasBlockingFailures": false,
  "hasOverridableFailures": true,
  "qaReportId": "ffffffff-0000-4000-8000-333333333333",
  "overriddenCheckKeys": [],
  "uncoveredFailedCheckKeys": ["tone", "dangerous_claims"]
}
```

### Gate — `blocked` never ready via ledger

```json
{
  "ready": false,
  "status": "blocked",
  "hasBlockingFailures": true,
  "hasOverridableFailures": false,
  "qaReportId": "ffffffff-0000-4000-8000-444444444444",
  "overriddenCheckKeys": ["tone"],
  "uncoveredFailedCheckKeys": []
}
```

---

## Closed write surface

**Only** these modules may INSERT into `neuramark_qa_overrides`:

- `lib/qa/override-qa-check.ts` (orchestrator) — and tightly coupled helpers it owns under `lib/qa/**`
- **Zero** Route Handlers write overrides
- **Zero** UPDATE/DELETE on override rows from app paths
- **Zero** override-path UPDATE of `neuramark_qa_reports.status` / `checks`

US-10.1 orchestration remains the **sole** writer of report verdicts.

---

## Non-goals (explicit)

| Out | Owner / note |
|-----|----------------|
| Cliente override UI / Cliente-callable override action | **Forbidden** — Operator-only |
| Rewrite report `status` → `passed` (or mutate `checks`) on override | **Forbidden** — ledger separate from Veredicto QA |
| DELETE / UPDATE override endpoints | **Forbidden** — append-only |
| Override-all / multi-check / report-level bypass | **Forbidden** — [SEC] |
| Soft-pass `blocking` for any role | **Forbidden** forever |
| Cliente Aprobación package / `neuramark_approvals` writes | **US-11.1** |
| Cliente approval-screen **render** of overrides | **US-11.1** (DTO shipped here) |
| Catalog / severity CRUD | Never |
| QA re-run / LLM agent changes | **US-10.1** |
| New Operator nav route | Extend `OperatorQaPanel` only |
| Vision / weekly cron / IG publish / Fly FFmpeg | Out of V1 / other ADRs |
| RBAC beyond `requireOperator()` | Unchanged |

---

## Downstream obligations

| Consumer | Obligation |
|----------|------------|
| **US-11.1** | Call extended `getQaGateStatusForAssembledReel`; treat `ready` per this contract; never request `qaPassed`; render override audit from server DTO; IDOR 404 on foreign ids; soft DEPENDS on US-10.2 when PO edits USER_STORIES |
| **nextjs-frontend** | Modal + audit presentation only; no override-all; no HTML sinks; never send forbidden keys |
| **US-10.1 catalog** | Remains sole severity authority; 10.2 imports — does not fork |

---

## Security tests (minimum)

1. Cliente → `overrideQaCheck` → **403**, no INSERT  
2. Operator + `own_avatar_consent` / `generic_avatar_not_owner` → **`CHECK_BLOCKING`** (403), no INSERT  
3. Foreign `qaReportId` → **404**  
4. Empty / whitespace reason → `VALIDATION_ERROR`  
5. `overrideAll` / smuggled `passed` / `status` / `severity` / `clientId` → `FORBIDDEN_FIELDS`  
6. Override `pass` / `skipped` / missing check → `CHECK_NOT_FAILED`  
7. Successful override does **not** change report `status` / `checks`  
8. Gate `ready === true` after full overridable coverage on `failed`  
9. Gate `ready === false` if one overridable uncovered  
10. Gate `ready === false` for `blocked` even with override rows  
11. Append-only — grep: no update/delete override Route Handler / Server Action  
12. Rate limit over-limit → **`RATE_LIMITED`**  
13. RLS enabled, zero policies on `neuramark_qa_overrides`  
14. Catalog import used (not forked severity string)  
15. `requireOperator("handler")` is first await (ordering test / review)

---

## Module placement (BUILD)

| Module | Path |
|--------|------|
| Contracts (override) | `lib/contracts/qa-override.ts` |
| Contracts (DTO/gate extend) | `lib/contracts/qa-report.ts` (additive fields) |
| Forbidden keys | `lib/qa/find-forbidden-qa-override-keys.ts` |
| Orchestrator | `lib/qa/override-qa-check.ts` |
| Server Action | `lib/qa/actions/override-qa-check.ts` |
| Persist / load overrides | `lib/qa/persist-qa-override.ts` (or extend persist-qa-report) |
| Gate helper | `lib/qa/get-qa-gate-status-for-assembled-reel.ts` (extend) |
| Batch attach | `lib/qa/get-qa-reports-for-assembled-reels.ts` (attach `overrides[]`) |
| Catalog | existing `lib/qa/check-catalog.ts` (import only) |
| Migration | `supabase/migrations/20260831020000_neuramark_qa_overrides.sql` |

---

## Open decisions frozen here (no longer open)

| # | Topic | Frozen choice |
|---|-------|---------------|
| 1 | Reject non-failed targets | **Yes** — `CHECK_NOT_FAILED` |
| 2 | Expose reason to Cliente (US-11.1) | **Yes** — plain text, capped; React text |
| 3 | Rate limit | **Yes** — `qa_override`, 20 / 60 min |
| 4 | Gate tenancy | Keep US-10.1 `getCurrentUser` pattern |
| 5 | Gate field names | `overriddenCheckKeys` + `uncoveredFailedCheckKeys` **required** |
| 6 | Detail DTO | `overrides: OperatorQaOverrideDto[]` **required** |
| 7 | Action name | `overrideQaCheck` |
| 8 | Report on override | Status/`checks` **unchanged** |
| 9 | Duplicate overrides | Allowed; any row covers |
| 10 | Cliente override / delete override / rewrite passed | **Out** |

---

## Disputes / FE review notes

**Open until FE signoff.** Soft FE preferences (non-blocking for freeze):

1. **Dialog chrome** — Mirror `VideoJobRetryLimitOverrideDialog` (PrimeReact Dialog + textarea).  
2. **Audit placement** — Below check rows inside `OperatorQaPanel` (chronological).  
3. **Success merge** — Prefer returned `report` DTO over full page reload; `revalidatePath` still runs.  
4. **Blocking UX** — Locked copy only; no disabled Override button that still posts.  
5. **Gate display on Operator panel** — Optional informational “ready for Aprobación” badge from server-derived flags on detail; do **not** call gate helper from the browser.

**No open PO product disputes** after SECURITY APPROVE WITH CONDITIONS. FE signoff freezes UX disputes without reopening DDL, catalog, or gate purity.

---

## Reviewed by FE

**Reviewed by FE:** pending

*(FE fills this section after review. Expected: Accept / Accept with UX notes — panel modal, audit, i18n, types from `qa-override.ts` + extended `qa-report.ts`.)*

---

**Reviewed by FE:** pending  
**Frozen by:** nextjs-backend — 2026-08-30  
**Zod mirror:** `lib/contracts/qa-override.ts` (+ additive `lib/contracts/qa-report.ts`)
