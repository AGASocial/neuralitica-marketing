# US-15.1 — Weekly cycle cron endpoint and orchestration (Phase A + B)

**Priority:** P0 (PLAN F7)  
**Depends on:** US-4.1 ✅ · US-4.2 ✅ · US-5.1 ✅ · US-6.1 ✅ · US-7.1 ✅ · US-7.2 ✅ · US-8.4 ✅ · US-8.5 ✅ · US-8.7 ✅ · US-8.8 ✅ · US-9.1 ✅ · US-9.2 ✅ · US-9.3 ✅ · US-10.1 ✅ · US-11.1 ✅ · US-14.5 ✅ · US-16.1 ✅ · US-16.2 ✅ · US-2.3 ✅ · US-3.1 ✅  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-15.1 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **integrations-engineer** (orchestration) + **nextjs-backend** (Route Handler, migration, CONTRACT) · **nextjs-frontend** Phase B only · per `docs/development/AGENT-ROSTER.md`  
**Canonical terms:** **Ciclo semanal automatizado** · **weekStart** · **dry-run** · **approval queue**. Avoid CONTEXT _Evitar_ list.

## Out of scope (do not implement here)

- **Instagram Graph publish** — ADR-0002 / Fase 6.
- **New agents, adapters, or FFmpeg worker changes** — reuse existing orchestrators.
- **Onboarding IG connect checklist** — TASKS § Fase 7 onboarding (defer).
- **Operator pause/skip week** — follow-up story.
- **Cliente cycle UI** — System + Operator only.
- **RBAC beyond `requireOperator()`** — SQL-only operator flag unchanged.

## Phase split

| Phase | Goal | Close when |
|-------|------|------------|
| **A** | Cron auth + eligibility + idempotency + dry-run planner | 5 Phase A AC in USER_STORIES checked |
| **B** | Live pipeline + Operator manual trigger + partial failure log | 4 Phase B AC checked |

---

## Phase A — BE checklist

Concrete consumers: **Vercel Cron** · **Operator manual trigger (Phase B)** · internal tests.

### Route Handler + auth

- [x] **`app/api/cron/weekly-cycle/route.ts`** — `GET` or `POST` (CONTRACT freezes); `export const dynamic = "force-dynamic"`; `Cache-Control: no-store`.
- [x] **`CRON_SECRET`** — validate `Authorization: Bearer ${CRON_SECRET}`; missing/wrong → **401**; constant-time compare; never log secret.
- [x] **Vercel Cron config** — `vercel.json` crons entry → `/api/cron/weekly-cycle` (schedule CONTRACT freezes — e.g. weekly Monday UTC).
- [x] **Dry-run precedence** — env `WEEKLY_CYCLE_DRY_RUN=true` and/or query `dryRun=1`; live spend **blocked** when dry-run active.

### Eligibility + week resolution

- [x] **`listEligibleClientsForWeeklyCycle()`** — server-only; query `neuramark_clients.active = true`; for each, `getBusinessProfileForAgents(clientId)` → require `exists && visualModeSummary !== null`; return skip reasons for ineligible.
- [x] **`resolveWeekStartForCycle(referenceDate?)`** — ISO Monday UTC string; shared with strategy/scripts modules (`trendWeekStartSchema`).

### Idempotency ledger

- [x] **Migration `neuramark_weekly_cycle_runs`** — columns: `id`, `client_id`, `week_start`, `status` (`planned`|`running`|`completed`|`failed`|`dry_run`), `mode` (`cron`|`operator`), `step_log` JSONB, `started_at`, `finished_at`, `created_at`; unique index `neuramark_weekly_cycle_runs_client_week_uidx` on `(client_id, week_start)`.
- [x] **`acquireWeeklyCycleRun()`** — insert or return existing; prevent concurrent live runs for same client+week.

### Dry-run orchestrator

- [x] **`lib/orchestration/run-weekly-cycle-for-client.ts`** — `import "server-only"`; params `{ clientId, weekStart, invokedBy: "system", dryRun: boolean }`.
- [x] **Step planner** — ordered steps: `strategy` → `scripts` → `captions` → `primary_video` → `tts` → `broll` → `assembly` → `branding` → `qa` → `approval`; dry-run returns plan JSON only.
- [x] **No spend in dry-run** — assert no calls to LLM adapters, `create*VideoJobs`, assembly/branding enqueue, QA LLM when `dryRun=true`.
- [x] **`runWeeklyCycleBatch()`** — cron entry: loop eligible clients; collect per-client results; aggregate HTTP 200 summary.

### Tests (Phase A)

- [x] Cron auth: valid secret 200; invalid 401; no secret 401.
- [x] Eligibility: active+profile → eligible; missing profile → skipped.
- [x] Idempotency: second acquire same client+week → no duplicate row.
- [x] Dry-run: plan returned; mock spend orchestrators **not** called.
- [x] Forbidden body fields rejected on any future manual route stub.

---

## Phase A — DB checklist

- [x] **`neuramark_weekly_cycle_runs`** table + unique index + RLS/service-role access pattern (server-only writes).
- [x] **No changes** to existing production tables beyond run ledger.

---

## Phase A — FE checklist

- [x] **None** — Phase A is backend-only. Operator UI deferred to Phase B.

---

## Phase B — BE checklist

Concrete consumers: **Operator manual trigger** · **Vercel Cron live mode**.

### Dual-path strategy gate (CONTRACT must freeze)

- [ ] Pick **one:** (A) system path auto-sets strategy `approved` after valid draft generation, or (B) `generateReelScriptsForClient({ invokedBy: "system" })` accepts approved-or-valid-draft. Document in CONTRACT + SECURITY.

### Live step wiring

- [ ] **Strategy** — `generateContentStrategyForClient({ clientId, weekStart, invokedBy: "system" })`.
- [ ] **Scripts** — `generateReelScriptsForClient({ ..., invokedBy: "system", mode: "batch" })` per approved strategy id.
- [ ] **Captions** — `generateReelCaptionsForClient({ ..., invokedBy: "system", mode: "batch" })`.
- [ ] **Primary video** — existing create orchestrators (HeyGen / SadTalker / MuseTalk per policy) with trusted server context.
- [ ] **TTS** — `synthesizeVoiceoverForReelScript` when policy requires.
- [ ] **B-roll** — `createBrollVideoJobs` when faceless + needs_broll.
- [ ] **Assembly / branding / QA** — `createAssemblyJobForReelScript` → poll/wait strategy CONTRACT freezes (async: enqueue + step status `pending_provider` acceptable for CLOSE if jobs enqueue correctly).
- [ ] **Approval queue** — reuse US-11.1 ensure-on-list helper for each completed Reel package.
- [ ] **Partial failure** — catch per-step errors; continue other slots where safe; persist errors on `step_log`; never publish (ADR-0002).

### Operator manual trigger

- [ ] **`triggerWeeklyCycleForClient` Server Action** — `requireOperator("handler")`; body `{ clientId, weekStart? }`; `mode: "operator"` on run row; same orchestrator as cron with `dryRun: false`.
- [ ] **IDOR** — Operator may only trigger for clients they manage (CONTRACT freezes — likely any active client for V1 operator).

---

## Phase B — FE checklist

Concrete consumer: **Operator cycle control page** (minimal).

- [ ] **Route `/operator/cycle`** (or section on `/operator/strategy`) — PrimeReact; client selector; "Dry-run plan" + "Run cycle" buttons.
- [ ] **Display last run** — status, week, step_log summary from server loader.
- [ ] **EN/ES** — `operator.cycle.*` keys in `messages/en.json` / `messages/es.json`.
- [ ] **Loading / error / pending states** — disable buttons while run in flight.

---

## Phase B — DB checklist

- [ ] **Extend `step_log` schema** — per-step `{ step, status, errorCode?, at }` (CONTRACT freezes shape).
- [ ] **No publish columns** — ADR-0002.

---

## Contract-first gates (orchestrator)

### Phase A

- [x] SPEC-REVIEW.md (spec-guardian)
- [x] SECURITY.md (security-architect)
- [x] CONTRACT.md — Phase A freeze (cron auth, ledger DDL, dry-run orchestrator, eligibility) — 2026-08-31
- [x] BUILD Phase A (integrations-engineer + nextjs-backend) — `54bfdbc`, `8828f73`, `2658713`; fixes `4b5449d`, `23d048c`
- [x] VALIDATION.md Phase A — PASS WITH NOTES (`3e3e4ea`)
- [x] QA.md Phase A — APPROVE WITH CONDITIONS; CLOSE allowed (`efc6b75`)
- [x] CLOSE Phase A (product-owner) — 2026-08-31; 5/5 Phase A AC checked

### Phase B

- [ ] CONTRACT.md — mandatory Phase B delta (live wiring, strategy gate, manual trigger, FE props) freezing `INVALID_JSON`, acquire `replan: ALLOWED | BLOCKED`, and runner `RUN_NOT_REPLANNABLE`
- [ ] SECURITY.md — Phase B delta review covering the same additive safety outcomes before live wiring
- [ ] **Reviewed by FE** on Phase B CONTRACT
- [ ] BUILD Phase B
- [ ] VALIDATION.md Phase B
- [ ] QA.md Phase B
- [ ] CLOSE Phase B (product-owner)

---

## Open questions — resolve in CONTRACT / SECURITY

1. **Strategy auto-approve vs draft-bypass** — US-4.2 / ADR-0001 conflict; SECURITY + CONTRACT must freeze before Phase B BUILD.
2. **Async provider completion** — Phase B may enqueue jobs and mark step `pending` vs block until complete (PO lean: **enqueue + step status**, SC-1 verified in integration phase).
3. **Cron schedule** — Monday 06:00 UTC vs per-client timezone (PO lean: **single UTC** for V1).
4. **Manual trigger tenant scope** — V1 Operator triggers any active client vs own-id only (PO lean: **any active client** with operator gate).
5. **Rate limit** — cap clients per cron tick (PO lean: **sequential per client**, no parallel spend burst).

See `CONTRACT.md` after SECURITY gate.
