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

---

# Binding Phase B Security Delta — Live pipeline + Operator trigger

**Date:** 2026-08-31

**Scope:** Phase B only — live weekly runner, dual-path strategy gate, asynchronous provider/worker handoff, partial failures, Operator manual trigger, and minimal Operator status UI.

**Sources reviewed:** Phase A implementation and tests; this story's README, TASKS, CONTRACT, VALIDATION and QA; ADR-0001/0002/0003; US-4.1/4.2, US-5.1, US-6.1, US-7.1/7.2, US-8.4/8.5/8.7/8.8, US-9.1/9.2/9.3, US-10.1, US-11.1 and US-14.5 contracts/security artifacts.
**Authority:** This delta is additive to the Phase A review above. Phase A constraints remain binding unless this section explicitly narrows a Phase B transition.

## Phase B Verdict: APPROVE WITH CONDITIONS

Phase B may proceed to CONTRACT freeze, but **must not enter BUILD** until the CONTRACT incorporates every required decision below and receives the required FE signoff. There is no security approval for a generic synchronous “run all steps” loop: ADR-0003 requires Vercel to enqueue/dispatch long-running work and durable callbacks/workers to resume the run.

The secure dual-path choice is **strategy auto-approval by the trusted System runner after full draft validation**, with explicit audit metadata. A broad scripts-side “accept any draft when `invokedBy: system`” bypass is **vetoed** because it weakens the existing approved-strategy invariant for every downstream caller and makes malformed/stale drafts easier to consume.

## Binding Phase B Decisions

### 1. Strategy gate: validated System auto-approval only

- The System path calls the existing server-only strategy generator, validates the persisted draft against the current full strategy schema and verifies exact `client_id` + `week_start` ownership, then performs a dedicated conditional transition `draft -> approved` with `approved_by_actor = system` (or equivalent auditable actor field).
- The transition must be compare-and-set/idempotent: it cannot overwrite an Operator-edited or already-approved row, approve a stale week, or approve a draft belonging to another tenant.
- Operator/manual script generation keeps the existing explicit approval requirement. `generateReelScriptsForClient({ invokedBy: "system" })` may consume only the exact strategy id returned by the validated auto-approval step; it must not accept arbitrary drafts.

### 2. Authority and tenant scope

- Every live orchestration module and every callable seam that accepts `invokedBy: "system"` is `import "server-only"`, is not exported from a client-consumed barrel, and has no direct Route Handler or Server Action wrapper other than the weekly runner's trusted entry points.
- The cron path derives target clients exclusively from server-side eligibility. Request body/query cannot select `clientId`, `weekStart`, provider, tier, budget, consent, retry, or live mode.
- `triggerWeeklyCycleForClient` calls `await requireOperator("handler")` as its **first await**, then validates an exact input schema. V1 scope is **any active client** for a verified Operator, resolved by server-side lookup; Cliente sessions are forbidden and nonexistent/inactive targets return a non-enumerating not-found/forbidden envelope.
- Manual `weekStart`, if supported, must be a canonical ISO Monday within a CONTRACT-frozen bounded window. It is never accepted as an arbitrary historical replay key.
- Minimal UI receives only run/status DTOs from server loaders/actions. It never receives service-role credentials, provider secrets, provider raw payloads, prompts, full strategy/profile content, cost-policy internals, or cross-tenant run lists.

### 3. Live activation and rollback

- Live mode is enabled only by a **server environment allowlist/kill switch** (for example `WEEKLY_CYCLE_LIVE_ENABLED=true`) checked at the runner root after authentication and before acquire/spend. Query parameters, request JSON, cookies, local storage, or UI props cannot enable it.
- Rollout starts with an explicit server-side client allowlist or a CONTRACT-frozen maximum clients per cron tick. Sequential processing remains the default; no unbounded `Promise.all` provider burst.
- Disabling the switch prevents **new** live acquisitions/enqueues immediately. It does not mutate or delete existing jobs. In-flight provider/worker callbacks may persist terminal state and owned assets but may not enqueue a new downstream spend step while disabled; the run records `LIVE_DISABLED` / `paused` (exact CONTRACT state).
- Rollback is forward-safe: no downgrade of the Phase A migration, no deletion of audit/step history, and dry-run remains available. Re-enabling resumes only through the same idempotent resume API.

### 4. Eligibility, budget, consent and active rechecks

- Initial cron enumeration is not sufficient authority. Before **each spend-producing step or retry**, server code rechecks: client still active; exact tenant ownership; current cost policy and cumulative budget; provider eligibility; and current consent/assets required for the selected visual mode.
- A client becoming inactive pauses/fails the run before the next enqueue. No new LLM/provider/worker job is created.
- Budget and consent checks occur inside the same trusted job-creation orchestrators used by Operator flows, immediately before provider submission. The weekly runner must not duplicate or bypass those gates.
- `BUDGET_EXCEEDED`, `CONSENT_REQUIRED`/`CONSENT_REVOKED`, `CLIENT_INACTIVE`, `PROVIDER_UNAVAILABLE`, and policy rejection are explicit per-slot step failures visible to Operator in sanitized form. They are never silent skips and never trigger fallback spend without a fresh gate.
- System runs cannot set `budgetOverride`, `retryOverride`, provider keys/tiers, estimates, or consent flags. Overrides remain explicit Operator actions with existing audit requirements and do not cause the weekly runner to auto-resume unless CONTRACT freezes an intentional, idempotent resume action.

### 5. Acquire, idempotency and resume semantics

- The existing unique `(client_id, week_start)` ledger remains the single authority for cron and Operator paths. There is no alternate live ledger or “force run” bypass.
- Phase A outcomes remain additive and exact: malformed JSON returns **`INVALID_JSON`**; acquire returns `replan: "ALLOWED" | "BLOCKED"`; the Phase A planner returns **`RUN_NOT_REPLANNABLE`** when persistence is blocked. Phase B must not collapse these to `INTERNAL_ERROR` at a public/manual boundary or reinterpret `BLOCKED` as permission to start live work.
- CONTRACT must freeze the one-way conversion of an existing `dry_run` row into a live run. Recommended invariant: a compare-and-set transition on the same row from `dry_run` to `running`; `replan: ALLOWED` permits only dry-run plan replacement before that transition. Once any live step is claimed/enqueued, acquire/resume reports `replan: BLOCKED`.
- Each spend or enqueue operation has a stable idempotency key derived from `runId + slot + step + attempt` (and is persisted before/with dispatch). A callback or retry with the same key cannot submit a second provider job or duplicate an assembly/approval record.
- Resume is **state-driven, not caller-directed**: the server loads the run and advances only the next eligible step(s). Clients cannot send `fromStep`, `skipStep`, `markCompleted`, provider job ids, attempt number, or arbitrary step logs.
- `running`/`pending_provider`/`pending_worker` runs return an already-running/resumable outcome; `completed` returns already-completed; terminal `failed` resumes only through a dedicated Operator-authorized action and only failed/retriable slots. It never reruns successful slots.

### 6. Asynchronous provider and assembly handoff

- The cron Route Handler and manual Server Action enqueue/dispatch work and return promptly. They do not poll providers, download media, execute FFmpeg, or wait for the full weekly cycle.
- Provider/worker callbacks or pollers authenticate using their existing HMAC/worker contract, resolve job/run identity from server-side persisted linkage, and use conditional transitions. Callback payload `client_id`, status, asset URL, cost, or next step is untrusted until matched to the stored job.
- A step enters `pending_provider` or `pending_worker` only after durable job linkage is written. The dispatcher uses an outbox/claim token or equivalent retry-safe handoff so a crash between DB write and enqueue is recoverable without duplicate spend.
- Only a successful terminal step may enqueue its direct successor. Assembly completion may enqueue branding; branding completion may enqueue QA; QA pass may ensure approval. No callback can jump directly to approval or publish.
- Stale pending jobs are detected by the existing bounded timeout/sweeper contract and recorded as failures; they are not retried forever by the weekly runner.

### 7. Partial failures and safe observability

- State is tracked per slot and step. A failure in one slot may allow independent slots to continue, but dependent steps for the failed slot remain blocked/skipped with a causal code. The aggregate run is `completed` only when all required slots reached approval; otherwise it is a CONTRACT-frozen partial/failed terminal state.
- `step_log` is append-only or concurrency-safe and uses an allowlisted schema such as `{ slotIndex?, step, status, errorCode?, attempt?, at, jobId? }`. The UI must not accept or write it directly.
- Persist/return only allowlisted error codes. Never persist or expose stack traces, exception messages, Authorization headers, provider request/response bodies, signed URLs, prompt/profile content, env names/values, or secret-bearing webhook data.
- Server logs correlate `runId`, `clientId`, slot, step and opaque job id. Provider errors are normalized before logging. Operator responses use minimal codes and localized copy.

### 8. Retry limits

- Automatic dispatch retry is bounded and only for transient pre-acceptance/handoff failures. CONTRACT must freeze the count, backoff and retryable code allowlist; recommended ceiling is **3 attempts per slot+step**, reusing existing job-attempt limits when stricter.
- Provider regeneration/retry that can spend is never an invisible transport retry: it creates/reuses explicit lineage, rechecks active/budget/consent/policy, uses a new bounded attempt idempotency key, and obeys the existing max-attempt/Operator-override audit contract.
- Validation, consent, budget, inactive-client, auth, policy, and deterministic schema failures are non-retryable. A retry storm or repeated callback cannot advance the run twice.

### 9. Approval boundary and no automatic Instagram publish

- The terminal weekly-cycle operation is an idempotent **ensure approval queue** action for a QA-passed Reel package. It does not approve on behalf of Cliente and does not invoke Instagram Graph create-container, publish-now, scheduled publish, or any generic publish helper.
- ADR-0002 remains downstream and separate: publishing requires the existing Cliente approval state plus its own authorized workflow. Neither `invokedBy: "system"` nor Operator manual cycle is a publish authority.

## Phase B Security Acceptance Criteria

- [ ] **[SEC-B]** CONTRACT freezes validated System strategy auto-approval; arbitrary draft-bypass is absent and Operator path still requires explicit strategy approval.
- [ ] **[SEC-B]** All `invokedBy: "system"` seams are server-only and callable solely from trusted orchestration; no browser-controllable `invokedBy`, live flag, provider, policy, consent, retry, or tenant authority.
- [ ] **[SEC-B]** Manual trigger runs `requireOperator("handler")` first, validates exact input, scopes to a server-resolved active client, and shares the cron ledger/orchestrator.
- [ ] **[SEC-B]** Client active state, tenant ownership, current budget/policy and applicable consent are rechecked immediately before every spend/enqueue and every spending retry.
- [ ] **[SEC-B]** Existing Phase A outcomes remain additive: `INVALID_JSON`; acquire `replan: ALLOWED | BLOCKED`; runner `RUN_NOT_REPLANNABLE`.
- [ ] **[SEC-B]** Live conversion, acquire and resume use conditional state transitions and stable per-step idempotency keys; successful slots are never rerun.
- [ ] **[SEC-B]** Vercel only dispatches/enqueues; durable provider/worker callbacks authenticate, validate persisted job linkage and advance one legal transition at a time.
- [ ] **[SEC-B]** Partial failures are per-slot/per-step, dependency-safe and sanitized; no secrets, raw provider payloads, signed URLs, prompts, profiles or stack traces reach `step_log`, logs or UI.
- [ ] **[SEC-B]** Automatic retries are bounded, backoff-controlled and limited to transient failures; every spending retry rechecks gates and preserves audited lineage.
- [ ] **[SEC-B]** Live mode uses a server-only kill switch plus bounded rollout; disable prevents new spend and resume while allowing safe terminal bookkeeping for in-flight jobs.
- [ ] **[SEC-B]** Weekly cycle terminates at QA-passed approval-queue ensure; no code path invokes Instagram publish or grants approval authority to System/Operator cycle.
- [ ] **[SEC-B]** Operator UI is minimal, EN/ES, server-loaded and tenant-safe; pending state disables duplicate trigger and sanitized status reveals no sensitive internals.

## Required CONTRACT Freeze Before Phase B BUILD

1. Exact strategy auto-approval helper, audit fields, compare-and-set behavior and error codes.
2. Exact live ledger state machine, including `dry_run -> running`, partial terminal state, `pending_provider`/`pending_worker`, pause on kill switch, and legal resume transitions.
3. Exact acquire/live/resume envelopes preserving `INVALID_JSON`, `ALLOWED | BLOCKED`, and `RUN_NOT_REPLANNABLE` additively.
4. Exact per-step idempotency-key storage, dispatcher/outbox recovery rule, callback authentication/linkage and successor transition ownership.
5. Exact active/budget/consent/policy gate order for strategy, scripts, captions, primary video, TTS, B-roll and retry paths.
6. Exact retry ceilings, backoff, transient allowlist, stale timeout and Operator override/resume audit behavior.
7. Exact `step_log` schema, allowlisted error codes, aggregate partial-failure status and minimal Operator DTO/action input.
8. Exact live enable/disable env, rollout allowlist/cap and rollback behavior.

## Phase B BUILD Vetoes

| Verdict | Condition |
|---|---|
| **VETO** | Scripts accept arbitrary `draft` solely because caller supplies `invokedBy: "system"` |
| **VETO** | Any browser input enables live mode or controls `clientId`, provider, policy, consent, retry, step state or System actor |
| **VETO** | Manual trigger omits first-await `requireOperator("handler")`, active-client lookup, or shared idempotency ledger |
| **VETO** | Live work starts when acquire says `replan: BLOCKED`, or Phase A `INVALID_JSON` / `RUN_NOT_REPLANNABLE` semantics are removed |
| **VETO** | Cron/Server Action polls providers, downloads media, executes FFmpeg, or waits for complete assembly |
| **VETO** | Spend/enqueue occurs without fresh active + budget/policy + applicable consent checks |
| **VETO** | Retry is unbounded, reruns successful slots, or duplicates provider/assembly/approval side effects |
| **VETO** | Raw errors, provider payloads, signed URLs, secrets, prompts/profiles or stack traces enter logs, ledger DTOs or UI |
| **VETO** | Weekly cycle calls any Instagram publish surface or bypasses Cliente approval |

## Residual Decisions / Blockers

No additional user choice is required for the security floor. The CONTRACT authors must choose exact state/error names, kill-switch name, rollout cap/allowlist representation, retry/backoff values, stale timeout and callback/outbox mechanism within the constraints above. If product rejects validated System auto-approval and insists on draft-bypass, Phase B returns to **REDESIGN / user decision** because the alternative changes the approved-strategy invariant across stories.
