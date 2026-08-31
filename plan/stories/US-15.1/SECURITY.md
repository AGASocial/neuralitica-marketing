# Security Design Review — US-15.1 (Phase A)

**Story:** US-15.1 — Weekly cycle cron endpoint and orchestration (Phase A + B)  
**Scope:** **Phase A only** — cron Route Handler, `CRON_SECRET` auth, eligibility, idempotency ledger, dry-run step planner. Phase B live pipeline + Operator manual trigger reviewed at Phase B CONTRACT delta.  
**Date:** 2026-08-31  
**Reviewer:** security-architect  
**Branch:** `feature/US-15.1-weekly-cron`  
**Sources:** `plan/USER_STORIES.md` (US-15.1 Phase A AC + `[SEC]`), `plan/stories/US-15.1/README.md`, `plan/stories/US-15.1/TASKS.md`, `docs/adr/0001-ciclo-semanal-automatizado.md`, `docs/adr/0002-publicacion-reels-instagram-api.md`, `plan/stories/US-4.1/SECURITY.md`, `plan/stories/US-5.1/SECURITY.md`, `plan/stories/US-6.1/CONTRACT.md` (dual-path seam), `plan/stories/US-14.5/SECURITY.md` (`requireActive` / `requireOperator` floor), `plan/stories/US-9.1/SECURITY.md` (orchestrator reuse — no bypass path), `plan/stories/US-11.1/SECURITY.md` (approval gate), `plan/SECURITY_BASELINE.md`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.

---

## Verdict: APPROVE WITH CONDITIONS

Phase A is the correct trust-boundary slice: a **single server-only HTTP entry** (`/api/cron/weekly-cycle`) authenticated by **`CRON_SECRET`**, enumerating **eligible clients server-side**, persisting an **idempotency ledger**, and executing a **dry-run step planner with zero spend side effects**. No Cliente or Operator browser trigger ships in Phase A — correct reduction of attack surface before live automation exists.

No REDESIGN. Orchestrator may proceed to **CONTRACT.md (Phase A freeze)** after the conditions below are frozen. Phase B requires a **SECURITY delta** before live spend wiring.

**Inherited floors (US-4.1 / US-5.1 / US-6.1 / US-7.x / US-14.5 / US-X.4 — do not weaken):** downstream orchestrators keep `invokedBy: "system"` callable **only** from `import "server-only"` modules; Operator paths keep `requireOperator("handler")` first; `client_id` is never request-authoritative on cron path; inactive clients consume no spend (`requireActive` floor on all product routes — cron eligibility adds explicit `active = true` filter); provider/LLM keys stay server-env only; RLS deny-by-default on new `neuramark_*` tables; no `@supabase/supabase-js` in Client Components.

**Phase A owns:** `app/api/cron/weekly-cycle/route.ts`; `lib/orchestration/**` weekly runner (plan-only branch); `neuramark_weekly_cycle_runs` migration; eligibility helper; idempotency acquire helper; dry-run spend guard; cron auth tests; ledger/idempotency/dry-run security tests.

**Phase A does not own:** Operator manual trigger Server Action (Phase B); live calls to `generateContentStrategyForClient` / scripts / captions / video / assembly / QA (Phase B); Operator FE (`/operator/cycle`); strategy auto-approve vs draft-bypass gate (Phase B CONTRACT + SECURITY delta); Instagram publish (ADR-0002 — permanently out).

**Terminology:** **Ciclo semanal automatizado** · **weekStart** (ISO Monday UTC) · **dry-run** · **approval queue**. Technical names `runWeeklyCycleBatch`, `runWeeklyCycleForClient`, `acquireWeeklyCycleRun`, `listEligibleClientsForWeeklyCycle` are CONTRACT placeholders.

---

### Threat Summary (US-15.1 Phase A)

| Threat | Impact | Mitigation in Phase A |
|---|---|---|
| **Unauthenticated cron invocation triggers batch work or future spend** | Anonymous actor drives system automation | Route Handler validates `Authorization: Bearer ${CRON_SECRET}` **before** any DB read or orchestration; missing/invalid → **401**, **no side effects** |
| **CRON_SECRET leaked via logs, responses, or client bundle** | Full system automation authority | Secret read from `process.env.CRON_SECRET` only; **never** logged, echoed, or returned; env var **not** prefixed `NEXT_PUBLIC_`; constant-time compare |
| **Timing attack on secret compare** | Offline brute force aided by early exit | `crypto.timingSafeEqual` (or equivalent) on equal-length buffers; normalize Bearer token extraction once |
| **Browser / Cliente / Operator session triggers cron without secret** | UI or session bypass of spend guard | Phase A: **no** manual trigger Server Action, **no** FE link, **no** session-based bypass on cron route — secret required even for authenticated Operator |
| **Attacker with CRON_SECRET triggers live LLM/provider spend in Phase A** | Financial abuse before Phase B review | Phase A BUILD **hard-blocks live spend** at orchestrator root (`dryRun` enforced true in production Phase A **or** compile-time exclusion of spend imports); `?dryRun=0` / body flags **cannot** enable spend until Phase B SECURITY sign-off |
| **Attacker supplies `clientId` list via request body** | Cross-tenant targeting, skip eligibility | Phase A cron **ignores** client targeting from body; enumerates eligible clients **server-side only**; forbidden authority keys → **400** |
| **Duplicate cron tick creates duplicate jobs / spend (Phase B)** | 2× weekly cost per client | Unique index `(client_id, week_start)` + `acquireWeeklyCycleRun()` insert-or-return-existing; concurrent ticks → one winner, others read existing row |
| **Inactive or incomplete-onboarding client enqueued** | Spend on non-product-ready tenant | Eligibility query: `active = true` AND profile exists AND `visualModeSummary !== null`; skips logged with reason, **no ledger row** or **`dry_run` plan-only row** per CONTRACT |
| **Dry-run calls spend orchestrators anyway** | Silent budget burn during "plan only" | `dryRun=true` branch **must not** import/call LLM adapters, `create*VideoJobs`, assembly/branding enqueue, QA LLM, TTS, B-roll; tests assert mocks uncalled |
| **Orchestrator imported from Client Component** | Expose internal automation API | All orchestration modules `import "server-only"`; cron route and batch runner not re-exported to `"use client"` trees |
| **RLS policy exposing run ledger to `authenticated`** | Cross-tenant run history leak | RLS **enabled, zero policies** on `neuramark_weekly_cycle_runs`; service-role Node writes only |
| **Missing `CRON_SECRET` in production** | Accidental open cron endpoint | Production (`NODE_ENV=production` or Vercel prod): unset/empty `CRON_SECRET` → **503** or **401** fail-closed, **no** batch execution |

**Residual risk accepted (Phase A):** `CRON_SECRET` is a single shared bearer — compromise grants automation authority equivalent to Vercel Cron. Mitigation: high-entropy rotation, Vercel env scoping, monitoring on cron 401 rate. Phase B adds Operator gate on manual path; cron remains secret-gated. Sequential per-client processing (PO lean) limits burst — not a substitute for budget gates in Phase B.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| `CRON_SECRET` | **Critical** — full System automation authority | Vercel env only; compared in Route Handler; never client-visible |
| `neuramark_weekly_cycle_runs` | Medium — operational audit, future spend correlation | Service-role Node; scoped by `client_id`; no browser read in Phase A |
| Eligible client enumeration | High — defines automation blast radius | Server query only; `active` + onboarding predicates |
| `weekStart` | Medium — partition / idempotency key | Server-resolved ISO Monday UTC via `resolveWeekStartForCycle()` — **not** request authority in Phase A |
| Downstream orchestrators (Phase B) | Critical — LLM + provider spend | **Not invoked in Phase A BUILD**; dry-run returns plan JSON only |
| Operator session | High (Phase B) | **Out of Phase A BUILD** — no manual trigger surface |

**Boundaries:**

1. **Vercel Cron → `GET/POST /api/cron/weekly-cycle`** — Semi-trusted scheduler + **untrusted network**. Trust established **only** via `Authorization: Bearer` secret. No cookie/session auth on this route.
2. **Route Handler → eligibility + acquire + dry-run orchestrator** — After auth, all client IDs from DB enumeration, never body.
3. **Dry-run orchestrator → Postgres ledger** — Insert/update run row + plan JSON in `step_log`; **no** calls across boundary to LLM/providers/FFmpeg/worker enqueue.
4. **Browser / Operator / Cliente → cron route** — **Untrusted.** No Phase A UI consumer; direct browser calls get **401** without valid secret.

---

## Abuse Cases Considered

- *As an anonymous actor, I GET `/api/cron/weekly-cycle` without Authorization* → **Blocked:** **401**, no DB writes, no enumeration.
- *As an anonymous actor, I guess Bearer tokens* → **Blocked:** constant-time compare; generic **401**; optional rate limit at edge (Vercel) — not required Phase A but recommended in CONTRACT.
- *As a Cliente with a valid session, I invoke the cron route* → **Blocked:** session **does not** bypass secret requirement; **401** without Bearer.
- *As an Operator, I use a future manual trigger in Phase A* → **Blocked:** Phase A ships **no** `triggerWeeklyCycleForClient` Server Action and **no** Operator UI — only cron route exists.
- *As an attacker with CRON_SECRET, I POST `{ clientId: "<victim>" }` to run one tenant* → **Blocked (Phase A):** body client targeting **rejected or ignored**; batch enumerates eligible set server-side only.
- *As an attacker with CRON_SECRET, I POST `{ dryRun: false }` to burn budget in Phase A* → **Blocked:** Phase A orchestrator **hard-blocks spend** regardless of query/body; live branch unreachable until Phase B.
- *As an attacker with CRON_SECRET, I call `?dryRun=1` repeatedly* → **Contained:** dry-run replans without spend; idempotency returns existing row for same client+week (CONTRACT freezes whether dry-run updates ledger or read-only re-plan).
- *As Vercel Cron double-firing, I create two run rows for same client+week* → **Blocked:** unique `(client_id, week_start)` + acquire helper; second tick gets existing row, **no duplicate enqueue** (Phase B spend applies same guard).
- *As a malicious Operator (future), I import `runWeeklyCycleForClient` in a Client Component* → **Blocked:** `import "server-only"` on orchestration modules.
- *As a malicious actor, I read other clients' run history via Supabase anon key* → **Blocked:** RLS enabled, zero policies; no Phase A client API exposes ledger.
- *As inactive client, I get enqueued when cron runs* → **Blocked:** eligibility filter excludes `active = false`.
- *As client missing profile/visual mode, I trigger agent failures/spend* → **Blocked:** skipped with logged reason before orchestrator entry.

**Phase B preview (not Phase A AC):** *As Cliente, I call manual live cycle* → **Must be blocked in Phase B:** `requireOperator("handler")` first. *As System cron, I publish to Instagram* → **Permanently blocked:** ADR-0002.

---

## Security Acceptance Criteria

Story `[SEC]` from `plan/USER_STORIES.md` → US-15.1 Phase A is binding. Items marked **(added)** are new in this review — paste into USER_STORIES when the PO next edits the story.

**Existing story `[SEC]` (Phase A — USER_STORIES.md):**

- [ ] **[SEC] Cron Route Handler is the only HTTP entry for System cycle; orchestrator modules are `server-only`; forbidden request fields rejected; no `client_id` from untrusted body without operator gate on manual path** *(USER_STORIES US-15.1 Phase A)*

**Added in this review — Phase A binding:**

- [ ] **[SEC] (added) Cron auth — secret required:** `app/api/cron/weekly-cycle/route.ts` validates `Authorization: Bearer <token>` against `process.env.CRON_SECRET` as the **first** check before parsing body or querying clients; missing header, wrong scheme, empty token, or mismatch → **401** with minimal JSON (`{ "error": "UNAUTHORIZED" }` or CONTRACT exact); **no** DB writes, **no** orchestration on failure
- [ ] **[SEC] (added) Cron auth — constant-time compare:** secret verification uses `crypto.timingSafeEqual` on buffers of **equal length** (hash both to fixed length if lengths differ, or reject malformed token length before compare per CONTRACT); **never** use `===` on raw secrets
- [ ] **[SEC] (added) Cron auth — fail-closed production:** when `CRON_SECRET` is unset or empty in production deployment, route returns **503** or **401** (CONTRACT freezes) and **never** executes batch — no dev-default secret in production builds
- [ ] **[SEC] (added) Cron auth — secret hygiene:** `CRON_SECRET` is **never** logged (including debug), **never** returned in HTTP responses, **never** accepted via query string (`?secret=`), cookie, or `x-cron-secret` header bypass — **Bearer Authorization only**
- [ ] **[SEC] (added) Phase A — no browser/manual trigger:** Phase A BUILD ships **no** Server Action, **no** Route Handler other than cron, and **no** FE control that invokes weekly cycle; Operator manual trigger is **deferred to Phase B**
- [ ] **[SEC] (added) Phase A — session does not bypass cron auth:** authenticated Operator/Cliente session **without** valid Bearer secret receives **401** on cron route — no `requireOperator` shortcut on this path
- [ ] **[SEC] (added) Phase A — hard-block live spend:** `runWeeklyCycleForClient` / `runWeeklyCycleBatch` in Phase A **cannot** invoke LLM adapters, `generateContentStrategyForClient`, `generateReelScriptsForClient`, `generateReelCaptionsForClient`, video-job creators, TTS, B-roll, assembly/branding enqueue, or QA agents — even if `dryRun=false` in query/env; spend wiring is **Phase B only** after SECURITY delta
- [ ] **[SEC] (added) Dry-run spend guard — testable:** when `dryRun=true`, orchestrator returns structured step plan only; unit/integration tests **mock or spy** spend modules and assert **zero calls**; CI failure if spend import path reachable without Phase B flag/guard
- [ ] **[SEC] (added) Dry-run precedence — production Phase A:** until Phase B CLOSE, production cron runs with dry-run enforced (`WEEKLY_CYCLE_DRY_RUN=true` or hard-coded Phase A guard); query `?dryRun=0` **cannot** disable production dry-run in Phase A
- [ ] **[SEC] (added) Client targeting — server enumeration only:** cron batch loads clients via `listEligibleClientsForWeeklyCycle()`; request body/query **must not** supply authoritative `clientId`, `client_id`, `clientIds`, or `weekStart` for cross-tenant targeting in Phase A — presence of forbidden keys → **400 `FORBIDDEN_FIELDS`** (empty body acceptable)
- [ ] **[SEC] (added) Eligibility — inactive excluded:** enumeration query filters `neuramark_clients.active = true`; inactive clients are **never** passed to orchestrator
- [ ] **[SEC] (added) Eligibility — onboarding gate:** client must have business profile (`getBusinessProfileForAgents` → `exists: true`) and `visualModeSummary !== null`; ineligible clients skipped with structured reason in batch response — **no** ledger row implying live run unless CONTRACT defines skip-only-without-row
- [ ] **[SEC] (added) Idempotency — unique ledger key:** migration creates `neuramark_weekly_cycle_runs` with unique index on `(client_id, week_start)`; duplicate insert attempts handled without second side effect
- [ ] **[SEC] (added) Idempotency — concurrent acquire:** `acquireWeeklyCycleRun()` uses INSERT + unique-violation catch (or equivalent transactional pattern) so concurrent cron invocations for same client+week produce **one** row; subsequent callers receive existing row status (`ALREADY_RUNNING` / `ALREADY_COMPLETED` / `dry_run` per CONTRACT) — **no** duplicate plan rows that imply double execution
- [ ] **[SEC] (added) Idempotency — week key authority:** `weekStart` computed only via `resolveWeekStartForCycle(referenceDate?)` server helper (ISO Monday UTC); cron route does **not** accept caller-supplied `weekStart` in Phase A
- [ ] **[SEC] (added) Orchestrator boundary:** all modules under `lib/orchestration/**` include `import "server-only"`; not exported to Client Components or public barrels consumed by `"use client"` trees
- [ ] **[SEC] (added) Ledger RLS:** `neuramark_weekly_cycle_runs` has RLS **enabled** with **zero** named policies; reads/writes via service-role Node helpers only in Phase A
- [ ] **[SEC] (added) Response minimalism:** cron HTTP 200 summary exposes aggregate counts and per-client `{ clientId, status, skipReason? }` — **no** internal secrets, env names, stack traces, or full `step_log` PII blobs in production JSON (detailed logs server-side only)
- [ ] **[SEC] (added) Cache / CDN:** route exports `dynamic = "force-dynamic"` and sets `Cache-Control: no-store` so cron responses are not cached at edge
- [ ] **[SEC] (added) Logging redaction:** structured logs include run id, client id, week_start, status, step names — **never** `CRON_SECRET`, Authorization header values, or full profile/strategy text

**Deferred to Phase B SECURITY delta (not Phase A validator scope):**

- [ ] **[SEC] Operator manual trigger:** `triggerWeeklyCycleForClient` calls `requireOperator("handler")` as **first** await; `clientId` validated UUID + active-client existence; shares idempotency ledger with cron; `mode: "operator"` on row
- [ ] **[SEC] System live path:** `invokedBy: "system"` spend calls only from orchestrator after Phase B guard; never from browser-exposed handlers
- [ ] **[SEC] ADR-0002:** System path never publishes to Instagram; never bypasses Cliente approval gate
- [ ] **[SEC] Budget blocks:** policy/budget failures surface as run step failures, not silent skip (Phase B)
- [ ] **[SEC] Strategy gate:** dual-path auto-approve vs draft-bypass frozen in CONTRACT before Phase B BUILD (US-4.2 / US-5.1 reconciliation)

---

## Design Concerns and Required Changes

### 1. Phase A must hard-block spend — not rely on dry-run flag alone (REQUIRED)

**Concern:** If Phase A wires imports to live orchestrators behind a `dryRun` boolean, a single bug or malicious `?dryRun=0` could burn budget before Phase B review.

**Required:** Phase A BUILD uses **structural separation** — plan-only code path with **no imports** of spend modules, **or** a compile-time/feature flag (`PHASE_A_PLAN_ONLY`) enforced in production until Phase B CLOSE. CONTRACT documents which pattern is chosen. Tests prove spend modules are unreachable.

### 2. CRON_SECRET compare and production fail-closed (REQUIRED)

**Concern:** String `===` compare leaks timing; missing env in prod could fall through to open route.

**Required:** `timingSafeEqual`; production fail-closed when unset. CONTRACT recommends ≥32 bytes cryptographically random secret (`openssl rand -base64 32`).

### 3. No manual/browser trigger in Phase A (REQUIRED)

**Concern:** Partial manual path would expose live-run surface without `requireOperator` review.

**Required:** Phase A CLOSE gate verifies **absence** of `triggerWeeklyCycleForClient` and `/operator/cycle` routes. Cron route is the **sole** HTTP entry.

### 4. Idempotency under concurrent cron (REQUIRED)

**Concern:** Vercel Cron retry or overlapping deploys may double-fire.

**Required:** DB unique constraint + transactional acquire; document return shape for duplicate tick. Phase B live spend **must** reuse same acquire — no second path.

### 5. Forbidden request fields on cron route (REQUIRED)

**Concern:** Future body params for Operator convenience could introduce `clientId` authority early.

**Required:** Phase A rejects forbidden authority keys even if ignored. CONTRACT lists frozen forbidden set mirroring US-5.1 (`clientId`, `client_id`, `providerKey`, `dryRun` only if precedence frozen, etc.).

### 6. dryRun query vs env precedence (CONTRACT must freeze)

**Concern:** Ambiguous precedence could enable spend in prod if env says live and query says dry-run (or vice versa).

**Required for Phase A:** PO lean accepted — **production Phase A always dry-run** regardless of query. CONTRACT documents precedence for Phase B; SECURITY delta re-evaluates before live enablement.

---

## Future-Proofing Notes

- **ADR-0001 alignment:** Phase A establishes scheduler trust boundary; Phase B wires existing `invokedBy: "system"` orchestrators **through the same** `runWeeklyCycleForClient` entry — **no alternate bypass** cron handlers (matches US-9.1 SECURITY orchestrator reuse rule).
- **ADR-0002:** Publish remains out forever; cron and Operator manual path stop at approval queue (US-11.1 ensure pattern).
- **US-14.5:** Inactive clients already blocked on product routes; cron eligibility adds explicit filter so System actor never selects them.
- **Multi-tenancy:** Ledger carries `client_id` FK; enumeration never trusts request scope — ready for RLS tenant policies later without schema rework.
- **Phase B manual trigger:** Must use `requireOperator("handler")` + validated `clientId`; V1 Operator-any-active-client is acceptable **with operator gate**, not for cron.
- **Strategy approval gate:** US-4.2 / US-5.1 conflict unresolved — **must** be frozen in Phase B CONTRACT + SECURITY delta before live strategy/scripts spend.
- **CRON_SECRET rotation:** Support dual-secret verify is out of scope V1; document operational rotation (update Vercel env + redeploy) in CONTRACT ops note.

---

## CONTRACT.md Checklist (Phase A — pre-BUILD)

When `plan/stories/US-15.1/CONTRACT.md` exists, spot-check before BUILD:

- [ ] HTTP method frozen (`GET` vs `POST`) — Vercel Cron compatible
- [ ] Auth header format: `Authorization: Bearer ${CRON_SECRET}` only
- [ ] Production fail-closed when `CRON_SECRET` missing
- [ ] Phase A spend block mechanism frozen (structural vs flag)
- [ ] `WEEKLY_CYCLE_DRY_RUN` / `?dryRun=1` precedence — Phase A production always plan-only
- [ ] Forbidden request fields list frozen
- [ ] `neuramark_weekly_cycle_runs` DDL + status enum + unique index frozen
- [ ] `acquireWeeklyCycleRun` return codes: `CREATED`, `ALREADY_EXISTS`, `CONFLICT` (CONTRACT exact)
- [ ] Eligibility predicates frozen (active + profile + visual mode)
- [ ] `resolveWeekStartForCycle` shared with strategy/scripts modules
- [ ] Step plan JSON shape (ordered steps list) — no provider keys in plan output
- [ ] Cron schedule in `vercel.json` frozen (PO lean: Monday UTC)
- [ ] Explicit **non-goals Phase A:** manual trigger, live orchestrators, FE, Instagram publish
- [ ] Error codes: 401 unauthorized, 400 forbidden fields, 503 misconfigured secret

---

## BUILD vetoes (Phase A summary)

| Verdict | Condition |
|---|---|
| **VETO (do not BUILD Phase A)** | Cron route executes batch without Bearer secret validation |
| **VETO** | String equality (`===`) on `CRON_SECRET` without constant-time compare |
| **VETO** | Phase A code path can call LLM/provider/FFmpeg/worker enqueue (even behind flag) |
| **VETO** | Manual trigger Server Action or Operator UI ships in Phase A |
| **VETO** | Request body `clientId` selects run target on cron route |
| **VETO** | `CRON_SECRET` logged or returned in response |
| **VETO** | Missing unique `(client_id, week_start)` on ledger |
| **VETO** | Orchestration module importable from Client Components (no `server-only`) |
| **APPROVE WITH CONDITIONS** | All Phase A `[SEC]` criteria above satisfied; CONTRACT frozen; tests cover auth, idempotency, dry-run zero-spend |

---

## Phase B preview — conditions before live BUILD

1. **SECURITY delta** document appended to this file (or `SECURITY-PHASE-B.md`) covering live spend, manual trigger, strategy gate, partial failure, budget surfacing.
2. **`requireOperator("handler")`** on manual path — first await.
3. **Reuse acquire/idempotency** for live runs — no duplicate spend on retry.
4. **Approval gate** — Reels reach queue; no auto-approve publish.
5. **Sequential client processing** retained unless CONTRACT adds explicit concurrency cap with budget policy review.
