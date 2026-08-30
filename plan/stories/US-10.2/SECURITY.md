# Security Design Review — US-10.2

**Story:** US-10.2 — Operator override with reason  
**Date:** 2026-08-30  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-10.2 AC + `[SEC]`), `plan/SECURITY_BASELINE.md` (§7 non-overridable legal class, Top 5 #1/#2), `plan/stories/US-10.2/README.md` + `TASKS.md` (PREP `35242f9`), `plan/stories/US-10.1/SECURITY.md` + `CONTRACT.md` (catalog, gate Phase A, US-10.2 consumer obligation), `lib/qa/check-catalog.ts` (`isBlockingCheckKey` / `isOverridableCheckKey`), `lib/qa/get-qa-gate-status-for-assembled-reel.ts`, house override pattern US-8.4 (`neuramark_video_job_retry_overrides`, reason 1–500), US-14.5 `requireOperator`, US-3.2/3.4 blocking set  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.  
**Primary implementers:** **nextjs-backend** (DDL, `overrideQaCheck`, gate extension, DTOs, security tests). **nextjs-frontend** (OperatorQaPanel modal + audit + i18n — presentation only; no override authority). **No** content-agents-engineer · **No** media-pipeline · **No** integrations.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct and closes the US-10.1 → US-10.2 handoff without diluting the legal class: **Operator-only**, **per-check**, **append-only** `neuramark_qa_overrides` with mandatory reason; catalog-enforced **403** on `blocking` (`own_avatar_consent`, `generic_avatar_not_owner`) **even for Operator**; **no** report-level / override-all bypass; report `status` / `checks` remain server-derived from the last QA run (override does **not** rewrite to `passed`); gate helper extended so US-11.1 can treat `passed` **or** `failed` + full overridable coverage as ready — **DB-only**, never request flags. No Cliente override UI or Cliente-callable action. Approval-screen visibility is a **DTO handoff** (VALIDATION note in PREP) — acceptable.

No REDESIGN. No veto of PO freezes #1–#20 in PREP `35242f9`. Orchestrator may proceed to **CONTRACT.md** after freezing the items below.

**Inherited floors (US-10.1 / US-3.4 / US-8.4 / US-14.5 / SECURITY_BASELINE — do not weaken):** `requireOperator()` calls `requireActive()` first; role and `client_id` never from request; foreign UUID → **404** (not 403); RLS deny-by-default; service-role Node only; no `@supabase/supabase-js` in Client Components; check catalog code-only (`lib/qa/check-catalog.ts`); blocking set frozen; Phase A gate purity (no client `qaPassed`); reason constants `OVERRIDE_REASON_MIN_LENGTH` / `OVERRIDE_REASON_MAX_LENGTH` (1–500); interim hardcoded user sanctioned — not a finding.

**This story owns:** `neuramark_qa_overrides` DDL + RLS; `overrideQaCheck` Server Action; catalog import for blocking/overridable authority; append-only INSERT; extend `getQaGateStatusForAssembledReel` readiness + key-list DTO fields; Operator override modal + audit on `OperatorQaPanel`; Operator (+ US-11.1 handoff) override list DTO; security tests for Cliente 403, blocking 403, IDOR 404, forbidden override-all, append-only, gate purity, report status unchanged.

**This story does not own:** QA run / LLM agent / catalog mutation (US-10.1); Cliente Aprobación UI / `neuramark_approvals` writes (US-11.1); DELETE/UPDATE override endpoints; report-level bypass; RBAC beyond `requireOperator()`; auth redesign; reclassifying checks.

**Terminology:** **Veredicto QA** · **Aprobación** · **Ensamblado** · **Operator** · **Cliente** · **disclosure**. Technical names `overrideQaCheck`, `getQaGateStatusForAssembledReel`, `checkKey`, `blocking`, `overridable` are canonical. Do not expose override as a Cliente capability in copy.

---

### Threat Summary (US-10.2–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Override `blocking` (consent / generic-avatar)** | Legal class diluted; likeness misuse (baseline Top 5 #1) | Handler imports `isBlockingCheckKey` / catalog — **403** even for Operator; UI must not offer CTA (non-authoritative) |
| **Override-all / report-level bypass** | Approval-gate open without per-check audit (Top 5 #2) | Input **`{ qaReportId, checkKey, reason }` only**; reject `overrideAll`, `overrides[]`, `ready`, `passed`, `status` |
| **Rewrite report `status` → `passed`** | Hides failures; breaks audit of actual Veredicto QA | Override **INSERT only**; **never** UPDATE `neuramark_qa_reports.status` / `checks` |
| **Cliente calls override** | Unauthorized gate open | `requireOperator("handler")` first → **403**; no Cliente UI |
| **IDOR via `qaReportId`** | Cross-tenant override / leak | Load report `WHERE id = $qaReportId AND client_id = $serverClientId`; foreign → **404**; INSERT same `client_id` |
| **Smuggle severity / `assembledReelId` / `clientId` as write authority** | Soft-pass blocking; tenancy spoof | `.strict()` pointer input; severity from catalog; reel ids denormalized from report row |
| **Gate helper honors request `qaPassed` / override flags** | US-11.1 bypass | Helper remains `import "server-only"`; reads report + overrides ledger only; never accepts HTTP body readiness |
| **Treat `blocked` as overridable via ledger** | Soft-escape legal fails | Gate: `status === 'blocked'` / pending / running / missing → **not ready**; overrides do not clear blocking |
| **UPDATE/DELETE override rows** | Erase audit / reopen without trail | Append-only: **no** UPDATE/DELETE Server Actions or Route Handlers |
| **Empty / whitespace reason** | Undocumented override | Trim → min 1, max 500 (`OVERRIDE_REASON_*`); validation fail |
| **Override non-failed check** | Spurious coverage / future gate confusion | Allow only when report has that `checkKey` with `status === 'fail'` **and** catalog `overridable`; else typed error |
| **XSS via reason on Operator / future Cliente DTO** | Script injection | Plain text / React text nodes / i18n; length-capped; **no** `dangerouslySetInnerHTML` |
| **Spam overrides** | Audit noise / DoS | Light rate limit `agent_key: 'qa_override'` (house pattern); no LLM cost |

**Residual risk accepted:** Operator trust — Operator can override failed **overridable** checks with a documented reason (product intent). Multiple append rows for the same `(qa_report_id, check_key)` allowed; gate treats any row as coverage. Overrides remain after QA re-run if the check still fails (inert if re-run passes). Cliente sees reason text on US-11.1 (plain, capped) — XSS bounded by React text. Hardcoded local Operator until auth universal is sanctioned.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| Check catalog severity map | **Highest** — legal vs overridable | Code (`lib/qa/check-catalog.ts`); **not** request; **not** DB-editable |
| `own_avatar_consent` / `generic_avatar_not_owner` fail outcomes | **Highest** — non-overridable legal | Override path **403**; gate never ready while blocking fails |
| `neuramark_qa_reports.status` / `checks` | **Highest** — Veredicto QA truth | Unchanged by override; only US-10.1 orchestration writes |
| `neuramark_qa_overrides` ledger | **High** — gate input + audit | Append-only INSERT; service-role Node; Operator actor from `getCurrentUser()` |
| Gate helper readiness | **Highest** — US-11.1 publish gate | DB report + ledger only; no request flags |
| Override `reason` text | Medium — audit + future Cliente visibility | Length-capped plain text; XSS via React text only |
| Operator session | High — can open Aprobación path for overridable fails | `requireOperator` + rate limit |

**Boundaries:**

1. **Browser (Operator) → `overrideQaCheck`** — Untrusted: **`{ qaReportId, checkKey, reason }` only**. **`requireOperator("handler")` first**. Catalog decides blocking/overridable. Actor = server user id. No Cliente path.
2. **Browser (Operator) → `OperatorQaPanel` modal / audit** — Presentation only. Hidden CTA is **not** a control; server 403 remains authority for blocking.
3. **Override handler → Postgres** — Parameterized INSERT into `neuramark_qa_overrides`; `client_id` + `assembled_reel_id` denormalized from owned report; **no** UPDATE/DELETE on overrides; **no** UPDATE on report verdict columns.
4. **US-11.1 → `getQaGateStatusForAssembledReel(assembledReelId)`** — Server-only; loads owned assembly + report + overrides; computes `ready` per freeze below. Never accepts client `passed` / `overridden` / `ready`.
5. **Cliente → override** — **No boundary:** no UI, no action, no serializer that accepts Cliente override writes.

---

## Abuse Cases Considered

- *As an Operator, I POST `{ checkKey: "own_avatar_consent", reason: "urgent" }`* → **Blocked:** `isBlockingCheckKey` → **403**.
- *As an Operator, I POST `{ checkKey: "generic_avatar_not_owner", … }`* → **Blocked:** same **403**.
- *As a malicious actor, I POST `{ overrideAll: true }` or `{ overrides: […] }`* → **Blocked:** forbidden keys / `.strict()`; one INSERT = one check.
- *As a malicious actor, I POST `{ qaReportId, checkKey, reason, status: "passed" }` or `{ ready: true }`* → **Blocked:** forbidden; report status untouched.
- *As a Cliente, I call `overrideQaCheck`* → **Blocked:** `requireOperator` → **403**.
- *As a malicious actor, I override `{ qaReportId: "<victim-uuid>" }`* → **Blocked:** report load scoped by server `client_id`; foreign → **404**.
- *As a malicious actor, I POST `{ clientId, assembledReelId, severity: "overridable" }` to reclassify* → **Blocked:** forbidden; severity from catalog; tenancy from report.
- *As a malicious actor, I override a check that is `pass` / `skipped` / missing* → **Blocked:** typed error (only `fail` + overridable).
- *As a malicious actor, I UPDATE/DELETE an override row via an endpoint* → **Blocked:** no such endpoints; append-only.
- *As a malicious actor / US-11.1 caller, I POST `{ qaPassed: true }` or pass override flags into the gate* → **Blocked:** gate helper ignores request body; reads DB only.
- *As a malicious actor, I insert overrides while report is `blocked` and expect `ready`* → **Blocked:** gate requires `status === 'failed'` path (or `passed`); `blocked` never ready via ledger.
- *As a malicious actor, I leave one failed overridable uncovered* → **Blocked:** gate `ready === false` until every failed overridable key has ≥1 override row.
- *As a malicious actor, I inject HTML/script in `reason`* → **Contained:** plain text render; length cap; no HTML sink.
- *As a malicious actor, I spam override INSERTs* → **Blocked:** light `qa_override` rate limit → **429**.
- *As UI, I hide Override on blocking but call the action anyway* → **Blocked:** server catalog 403 (UI non-authoritative).

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-10.2 are binding. Items marked **(added)** are new in this review — paste into the story when the PO next edits USER_STORIES. Do not drop or weaken any existing `[SEC]` line. Do not check boxes in USER_STORIES from this gate.

**Inherited (still binding — do not weaken adjacent paths):**

- [ ] **[SEC] Every operator-only gate lives inside the Server Action / Route Handler itself** as `requireOperator()` on the `getCurrentUser()` result; middleware and UI hiding are convenience only *(US-14.5)*
- [ ] **[SEC] `requireOperator()` runs `requireActive()` first** — inactive operator has no access *(US-14.5)*
- [ ] **[SEC] RLS stays enabled with zero policies** on new `neuramark_*` tables; privileged access via Node service-role only *(US-14.5)*
- [ ] **[SEC] Service-role key is used only from Node server modules** — never Client Components *(US-14.5)*
- [ ] **[SEC] QA verdicts are computed and stored server-side; no endpoint accepts a client-supplied "passed" flag, and the approval gate (US-11.1) reads QA status from the DB, not from the request** *(US-10.1 — still true; override must not become a client-writable passed path)*
- [ ] **[SEC] Checks are classified in the schema as `overridable` vs `blocking` … code/config, not data editable via any endpoint** *(US-10.1)*
- [ ] **[SEC] `generic_avatar_not_owner` is classified `blocking`; import US-3.4 stub — do not fork** *(US-3.4)*
- [ ] **[SEC] Consent enforcement reads the live ledger, never a cached client flag** *(US-3.2 — override must not substitute for live consent)*

**US-10.2 story `[SEC]` (existing in USER_STORIES.md):**

- [ ] **[SEC] The non-overridable set (missing/revoked consent, generic-avatar impersonation) is enforced in the override handler server-side: an override request for a `blocking` check is rejected with 403 even from the Operator, regardless of UI state**
- [ ] **[SEC] `qa_overrides` is append-only (no update/delete endpoint); each row records check key, reason, server-resolved user, and timestamp**
- [ ] **[SEC] Override applies to one specific check on one specific QA report; there is no "override all" or report-level bypass parameter**

**Added in this review (binding for US-10.2 BUILD):**

- [ ] **[SEC] (added) `overrideQaCheck` calls `requireOperator("handler")` as its first await** before validation, rate limit, report load, or INSERT; failure → 401/403, **no side effects**
- [ ] **[SEC] (added) Pointer-only override input:** schema accepts **`{ qaReportId: uuid, checkKey: string, reason: string }` only** (`.strict()`). Reject forbidden fields including: `overrideAll`, `override_all`, `overrides`, `ready`, `passed`, `qaPassed`, `qa_passed`, `status`, `checks`, `severity`, `blocking`, `overridable`, `clientId`, `client_id`, `assembledReelId`, `assembled_reel_id`, `operatorClientId`, `operator_client_id`, `force`, `skipCatalogCheck` → **`FORBIDDEN_FIELDS`**
- [ ] **[SEC] (added) Catalog is authority for overridability:** import `isBlockingCheckKey` / `isOverridableCheckKey` / `isKnownQaCheckKey` from `lib/qa/check-catalog.ts` (or CONTRACT-exact re-exports). **Never** trust request `severity`. Unknown `checkKey` → validation error. Blocking keys → **403** even for Operator
- [ ] **[SEC] (added) Blocking set frozen (unchanged):** `own_avatar_consent`, `generic_avatar_not_owner` → non-overridable. Overridable set: `dangerous_claims`, `tone`, `clarity`, `ai_disclosure`, `cta_presence`
- [ ] **[SEC] (added) Target must be currently failed + overridable:** load report checks server-side; allow INSERT only when that `checkKey` exists with `status === 'fail'` and catalog severity `overridable`. `pass` / `skipped` / missing → typed reject (**`CHECK_NOT_FAILED`** or CONTRACT-exact). Do not invent coverage for non-fails
- [ ] **[SEC] (added) Reason:** after trim, length ∈ **[1, 500]** using house `OVERRIDE_REASON_MIN_LENGTH` / `OVERRIDE_REASON_MAX_LENGTH`; empty/whitespace → validation fail
- [ ] **[SEC] (added) Actor + tenancy:** `operator_client_id` from `getCurrentUser()` after `requireOperator` — never body. Load report `WHERE id = $qaReportId AND client_id = $serverClientId`; foreign → **404**. INSERT denormalizes same `client_id` + `assembled_reel_id` from report
- [ ] **[SEC] (added) Append-only ledger:** table `neuramark_qa_overrides`; **only** INSERT from the override path; **zero** UPDATE/DELETE Server Actions or Route Handlers on override rows. Multiple rows per `(qa_report_id, check_key)` allowed (audit)
- [ ] **[SEC] (added) Report verdict immutable under override:** override path must **not** UPDATE `neuramark_qa_reports.status` or `checks`. `failed` stays `failed` after successful override
- [ ] **[SEC] (added) Gate extension purity:** extend `getQaGateStatusForAssembledReel` in place (`import "server-only"`). **`ready === true` iff** (a) `status === 'passed'`, **or** (b) `status === 'failed'` **and** `hasBlockingFailures === false` **and** every check in `checks` with `status === 'fail'` and catalog severity `overridable` has **≥1** row in `neuramark_qa_overrides` for that `qa_report_id` + `check_key`. **`blocked` / `pending` / `running` / missing → not ready**. Function must **not** accept or honor caller-supplied `passed` / `ready` / override flags from HTTP
- [ ] **[SEC] (added) Gate DTO additions are informational only:** `overriddenCheckKeys` / `uncoveredFailedCheckKeys` (CONTRACT exact names) derived server-side from ledger + checks — never trusted as write input on any mutation
- [ ] **[SEC] (added) No Cliente override:** no Cliente-callable Server Action / Route Handler for override; no Cliente UI control. AC “visible on approval screen” satisfied for US-10.2 by shipping **server DTO / gate payload** for US-11.1 — not by Cliente write authority
- [ ] **[SEC] (added) Rate limit:** reuse `neuramark_agent_rate_limits` with **`agent_key: 'qa_override'`**; over-limit → **`RATE_LIMITED` / 429**, no INSERT. UI debounce is not a control
- [ ] **[SEC] (added) DDL:** `neuramark_` prefix; FK `qa_report_id` → `neuramark_qa_reports` ON DELETE CASCADE; `client_id` NOT NULL; `operator_client_id` NOT NULL; reason CHECK 1–500; RLS **enabled, zero policies**
- [ ] **[SEC] (added) XSS:** override `reason` and labels rendered as plain text / i18n / PrimeReact only — **no** `dangerouslySetInnerHTML`
- [ ] **[SEC] (added) Automated security tests cover at least:** Cliente **403** on override; blocking check keys **403** for Operator; foreign `qaReportId` **404**; empty/whitespace reason reject; `overrideAll` / smuggled `passed`/`status`/`severity`/`clientId` → `FORBIDDEN_FIELDS`; non-fail target reject; successful override does **not** change report `status`; gate `ready` true after full overridable coverage on `failed`; gate `ready` false if one overridable uncovered; gate `ready` false for `blocked` even with override rows; append-only (no update/delete route — grep); rate limit 429; RLS enabled zero policies; catalog import used (not forked severity string)

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Mutation — **Operator + pointer-only** (APPROVE)

| Rule | Detail |
|---|---|
| Action | **`overrideQaCheck({ qaReportId, checkKey, reason })`** (CONTRACT freezes export path) |
| Gate | **`requireOperator("handler")` first** |
| Forbidden | Override-all, verdict fields, tenancy/severity/actor spoof fields |
| Cliente | **No** callable path |

**Condition:** CONTRACT documents `findForbiddenQaOverrideKeys` (mirror US-10.1 / US-8.4 forbidden-key helpers).

#### 2. Catalog enforcement (APPROVE)

| Class | Keys | Override |
|---|---|---|
| `blocking` | `own_avatar_consent`, `generic_avatar_not_owner` | **403** always |
| `overridable` | `dangerous_claims`, `tone`, `clarity`, `ai_disclosure`, `cta_presence` | Allowed only if currently `fail` on report |

**Condition:** Single import from `lib/qa/check-catalog.ts`. No parallel severity map.

#### 3. Append-only ledger + immutable report (APPROVE)

| Rule | Detail |
|---|---|
| Table | `neuramark_qa_overrides` |
| Writes | INSERT only |
| Report | No status/`checks` UPDATE on override |
| Duplicates | Allowed; gate = any row covers |

#### 4. Gate extension (APPROVE — replaces Phase A ready rule)

```ts
// Frozen intent — CONTRACT exact field names
getQaGateStatusForAssembledReel(assembledReelId) →
  {
    ready: boolean;
    status: QaReportStatus | null;
    hasBlockingFailures: boolean;
    hasOverridableFailures: boolean;
    qaReportId: string | null;
    overriddenCheckKeys: string[];      // CONTRACT exact
    uncoveredFailedCheckKeys: string[]; // CONTRACT exact
  }

// ready =
//   status === "passed"
//   || (status === "failed"
//       && !hasBlockingFailures
//       && every failed overridable checkKey has ≥1 override row)
// NEVER accepts client-supplied passed / override flags
// blocked / pending / running / missing → ready false
```

**Condition:** Keep tenancy via `getCurrentUser` + scoped assembly/report loads (US-10.1 pattern). Do not add a browser-facing “set ready” API.

#### 5. Reason + rate limit (APPROVE PO leans)

Mirror US-8.4 / US-7.1: trim 1–500; light `qa_override` rate limit (no LLM — still bind the limit).

#### 6. FE surface (APPROVE)

Extend **`OperatorQaPanel` only**. Blocking rows: locked copy, no CTA. Audit list chronological. EN/ES. No override-all control.

#### 7. US-11.1 handoff (APPROVE)

Ship override list / key fields on Operator + gate DTOs now. Cliente **render** of audit is US-11.1. US-11.1 SECURITY will re-assert gate re-check on package create + decision — out of BUILD here.

#### 8. No new packages

Zod already sanctioned. No browser Supabase. Reuse existing rate-limit + reason constants.

---

### Open questions — SECURITY resolutions

| # | Question (PREP) | Resolution |
|---|---|---|
| 1 | Reject override when check is already `pass` / `skipped`? | **APPROVE Yes** — typed `CHECK_NOT_FAILED` (or CONTRACT-exact); only `fail` + overridable |
| 2 | Expose override `reason` to Cliente on US-11.1? | **APPROVE Yes** — plain text, length-capped; React text only; no Operator-only internals (ids ok if needed). XSS AC binds both surfaces |
| 3 | Rate limit `qa_override`? | **APPROVE light yes** — `agent_key: 'qa_override'`; do not waive |
| 4 | Gate helper tenancy via `getCurrentUser` vs caller `clientId` | **APPROVE keep US-10.1 pattern** for 10.2; server-context overload deferred to US-11.1 if needed |

---

### Vetoes (would block BUILD)

| If implementers… | Verdict |
|---|---|
| Allow override of `blocking` for Operator (soft 200 / skip catalog) | **REJECT** |
| Accept `overrideAll` / multi-key body / report-level bypass | **REJECT** |
| UPDATE `neuramark_qa_reports.status` to `passed` (or mutate `checks`) on override | **REJECT** |
| Ship UPDATE/DELETE override endpoints | **REJECT** |
| Skip `requireOperator` or accept `clientId` / `operatorClientId` from body | **REJECT** |
| Make gate helper honor request `qaPassed` / `ready` / client override flags | **REJECT** |
| Treat `blocked` as ready when override rows exist | **REJECT** |
| Expose Cliente-callable override action or Cliente override UI | **REJECT** |
| Fork catalog severity / hardcode a second blocking map that omits a legal key | **REJECT** |
| Put `@supabase/supabase-js` or service-role in Client Components | **REJECT** |
| Trust UI-only hiding of Override as the control for blocking | **REJECT** (server must 403) |

None of the PO product defaults trigger a redesign veto.

---

## Future-Proofing Notes

- **US-11.1:** Re-check `getQaGateStatusForAssembledReel` at package create **and** decision submit — never request flags. Render override audit from server DTO; IDOR on approval ids remains separate. Soft-amend USER_STORIES Depends-on to include US-10.2 when PO next edits.
- **Multi-tenancy / RLS:** `client_id` + deny-by-default now; additive policies later.
- **Re-run vs overrides:** Append-only history stays; new failed overridable keys after re-run need new overrides; passed checks make prior overrides inert — do not auto-delete.
- **Do not** later add Cliente self-serve override, Operator SQL-less severity toggles, or a “mark QA passed” shortcut that bypasses per-check ledger.
- **Legal class:** Consent + generic-avatar remain forever non-overridable; any future check added as `blocking` inherits 403 without story rewrite if catalog-driven.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-10.2/CONTRACT.md` exists, verify before coding proceeds:

- [ ] `overrideQaCheck` input `.strict()` + forbidden-keys list (includes override-all / verdict / tenancy spoof)
- [ ] `requireOperator("handler")` first; Cliente → 403
- [ ] Catalog import; blocking → 403; unknown key + non-fail target codes
- [ ] Reason trim 1–500 (`OVERRIDE_REASON_*`)
- [ ] `neuramark_qa_overrides` DDL: columns, FKs, CHECK reason, indexes, RLS zero policies, `client_id`
- [ ] Append-only (no update/delete); report status/`checks` immutable under override
- [ ] Tenancy: report load + INSERT; IDOR → 404
- [ ] Gate extension algorithm + `overriddenCheckKeys` / `uncoveredFailedCheckKeys`
- [ ] Operator DTO `overrides[]` (checkKey, reason, createdAt, optional operator display) — minimal
- [ ] Rate limit `qa_override`
- [ ] Non-goals: Cliente override UI, US-11.1 approval writes, catalog CRUD, QA re-run changes
- [ ] Tests listed for all SEC rows above

---

## CONTRACT freeze list (binding summary)

1. **Auth:** `requireOperator("handler")` first on `overrideQaCheck`; Cliente → **403**.  
2. **Input:** `{ qaReportId, checkKey, reason }` only — **no** override-all / verdict / tenancy spoof fields.  
3. **Catalog:** Import `lib/qa/check-catalog.ts`; **403** on `blocking` even for Operator; overridable only when currently `fail`.  
4. **Ledger:** `neuramark_qa_overrides` append-only INSERT; actor from `getCurrentUser()`; reason 1–500.  
5. **Report:** Do **not** UPDATE `status` / `checks` on override.  
6. **Tenancy:** Scoped report load; foreign → **404**; denormalized `client_id` + `assembled_reel_id`.  
7. **Gate:** Ready = `passed` **or** (`failed` ∧ no blocking fails ∧ all failed overridable keys overridden); never `blocked` via ledger; DB-only.  
8. **Cliente:** No override write path; DTO handoff only for US-11.1 visibility.  
9. **Rate limit:** `qa_override`.  
10. **FE:** OperatorQaPanel modal + audit; blocking locked; no HTML sinks.

---

## Recommended action

**APPROVE WITH CONDITIONS.** Proceed to **CONTRACT.md** (nextjs-backend). Binding floors above must appear in CONTRACT before BUILD. FE signoff required after CONTRACT.

**CONTRACT may proceed:** **Yes.**

**Conditions (non-blocking for CONTRACT start):** CONTRACT must freeze forbidden-keys list, blocking 403 + fail-target rules, DDL append-only, gate readiness algorithm + key-list field names, rate-limit key, and explicit non-goals (no Cliente override, no report status rewrite, no override-all).

---

## BUILD vetoes (summary)

1. Soft-pass or override of `blocking` checks (any role).  
2. Override-all / multi-check / report-level bypass parameter.  
3. Rewriting QA report `status`/`checks` on override.  
4. UPDATE/DELETE override endpoints.  
5. Skipping Operator gate, catalog check, or tenancy 404.  
6. Gate helper that trusts request readiness / override flags.  
7. Cliente override UI or Cliente-callable action.  
8. Browser Supabase; forked catalog severity.
