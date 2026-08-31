# API Contract — US-15.1 Weekly cycle cron endpoint and orchestration

**Story:** US-15.1  
**Status:** Frozen — Phase A — 2026-08-31 · **Phase B:** not frozen (delta section stub only)  
**Security:** `plan/stories/US-15.1/SECURITY.md` (APPROVE WITH CONDITIONS — 16 conditions reconciled below)  
**Spec review:** `plan/stories/US-15.1/SPEC-REVIEW.md` (ALIGNED — Phase B strategy gate deferred)  
**Pattern:** US-5.1 / US-6.1 / US-10.1 `invokedBy: "system"` orchestrators · US-13.2 CONTRACT gate structure · ADR-0001 scheduler  
**Depends on:** US-4.1 ✅ `generateContentStrategyForClient` · US-5.1 ✅ `generateReelScriptsForClient` · US-6.1 ✅ `generateReelCaptionsForClient` · US-8.x ✅ video jobs · US-9.1–9.3 ✅ assembly/branding/TTS · US-10.1 ✅ `runQaForAssembledReelForClient` · US-11.1 ✅ approval ensure · US-2.3 ✅ profile · US-3.1 ✅ visual mode · US-14.5 ✅ auth floors  
**Feature branch:** `feature/US-15.1-weekly-cron`  
**FE signoff Phase A:** N/A (backend-only)

**This document is CONTRACT ONLY.** Zod below is the BUILD sketch for `lib/contracts/weekly-cycle.ts`, server modules under `lib/orchestration/**`, `app/api/cron/weekly-cycle/route.ts`, migration SQL, and `vercel.json`. **Phase A BUILD must not wire live spend orchestrators.**

**Terminology:** **Ciclo semanal automatizado** · **Estrategia semanal** · **cola de Aprobación** · **Cliente** · **Operator** · **Ficha viva** · **Preferencias de producción visual** · **Paquete de guion** · **Ensamblado** · **Veredicto QA**. Technical terms (`dry-run`, `weekStart`, `step_log`, `invokedBy`, `CRON_SECRET`) OK in server logs and Operator diagnostics (Phase B). Do **not** use CONTEXT _Evitar_ terms in product-facing copy.

---

## SPEC-REVIEW gaps closed (Phase A)

| # | Gap | Resolution in this contract |
|---|-----|----------------------------|
| 1 | Phase A idempotency dry-run semantics | § Idempotency — re-plan updates `step_log` on existing `dry_run` row; no duplicate insert |
| 2 | Onboarding “completo” vs IG connect | § Eligibility — profile + visual mode only; IG connect + full checklist = follow-up (documented deferral) |
| 3 | Operator pause/skip | § Non-goals Phase A — follow-up story |
| 4 | Step order / no new agents | § Step planner — frozen ordered list; Phase B wires existing orchestrators only |
| 5 | Async provider (Phase B) | § Phase B stub — not frozen here |

**Deferred to Phase B CONTRACT delta:** dual-path **Estrategia semanal** gate (auto-approve vs draft-bypass), live orchestrator wiring table, Operator manual trigger, `/operator/cycle` FE, partial-failure `step_log` live shape.

---

## SECURITY reconciliation (Phase A — binding)

| # | SECURITY condition | **Frozen in this contract** |
|---|-------------------|----------------------------|
| 1 | Bearer `CRON_SECRET` before any DB/orchestration | § Cron Route Handler — gate order |
| 2 | `crypto.timingSafeEqual` on equal-length digests | § `verifyCronSecret` |
| 3 | Production fail-closed when secret unset | § `verifyCronSecret` → **503** `SERVICE_UNAVAILABLE` |
| 4 | Secret never logged / query / cookie bypass | § Auth · § Logging |
| 5 | Phase A — no manual trigger | § Non-goals Phase A |
| 6 | Session does not bypass cron auth | § Cron Route Handler |
| 7 | Phase A — structural spend block | § Spend guard — no spend module imports |
| 8 | Dry-run tests assert zero spend calls | § Tests |
| 9 | Production Phase A always plan-only | § Dry-run precedence |
| 10 | Server-side client enumeration only | § `listEligibleClientsForWeeklyCycle` |
| 11 | Eligibility predicates | § Eligibility |
| 12 | Unique `(client_id, week_start)` | § Migration |
| 13 | Concurrent acquire transactional | § `acquireWeeklyCycleRun` |
| 14 | `weekStart` server authority only | § `resolveWeekStartForCycle` |
| 15 | `import "server-only"` on orchestration | § Server-only modules |
| 16 | RLS enabled, zero policies on ledger | § Migration |
| 17 | Response minimalism + `no-store` | § HTTP response |
| 18 | Forbidden request fields → **400** | § Forbidden keys |

**Inherited floors (US-14.5 / US-4.1 / US-5.1 / US-6.1 / SECURITY_BASELINE):** downstream orchestrators keep `invokedBy: "system"` callable **only** from `import "server-only"` modules; Operator paths keep `requireOperator("handler")` first; `client_id` never request-authoritative on cron path; provider/LLM keys server-env only; no `@supabase/supabase-js` in Client Components.

---

## Phased BUILD acceptance

| Phase | Scope | Closes |
|-------|-------|--------|
| **A (BUILD now)** | Cron Route Handler + `CRON_SECRET` auth · `vercel.json` cron · `neuramark_weekly_cycle_runs` migration · eligibility · idempotency acquire · dry-run step planner · batch runner · tests · **zero spend** | USER_STORIES § US-15.1 Phase A AC (5 rows) |
| **B (deferred)** | Live pipeline via existing `invokedBy: "system"` orchestrators · strategy gate freeze · Operator manual trigger · minimal FE · partial failure log | USER_STORIES § US-15.1 Phase B AC |

**VALIDATION note (binding):** Phase A must prove spend orchestrators are **not imported** by `run-weekly-cycle-for-client.ts` (grep + unit test). Live wiring is a **BUILD veto** in Phase A.

---

## Overview (Phase A)

Phase A lands the **Ciclo semanal automatizado** trust boundary: Vercel Cron invokes a single Route Handler authenticated by **`CRON_SECRET`**, enumerates eligible **Clientes** server-side, acquires an idempotency row in **`neuramark_weekly_cycle_runs`**, and runs a **dry-run step planner** that returns the ordered pipeline plan per client — **no** LLM, provider, FFmpeg, or budget spend.

**Surfaces (Phase A)**

| # | Surface | Kind | Consumer |
|---|---------|------|----------|
| 1 | `GET /api/cron/weekly-cycle` | Route Handler | Vercel Cron (primary) |
| 2 | `POST /api/cron/weekly-cycle` | Route Handler | Manual ops / tests (alias — same behavior) |
| 3 | `runWeeklyCycleBatch` | `import "server-only"` | Cron route |
| 4 | `runWeeklyCycleForClient` | `import "server-only"` | Batch runner · tests |
| 5 | `planWeeklyCycleSteps` | `import "server-only"` pure planner | Dry-run branch only in Phase A |
| 6 | `listEligibleClientsForWeeklyCycle` | `import "server-only"` | Batch runner |
| 7 | `resolveWeekStartForCycle` | pure fn | Batch + acquire |
| 8 | `acquireWeeklyCycleRun` | `import "server-only"` | Per-client runner |
| 9 | `verifyCronSecret` | `import "server-only"` | Route Handler |
| 10 | Zod + types | `lib/contracts/weekly-cycle.ts` | Route · orchestration · tests |
| 11 | Migration | `neuramark_weekly_cycle_runs` | Ledger |
| 12 | `vercel.json` | deploy config | Vercel Cron schedule |

**Forbidden surfaces (Phase A BUILD veto):**

- Manual trigger Server Action (`triggerWeeklyCycleForClient`) or Operator UI (`/operator/cycle`).
- Live calls to `generateContentStrategyForClient`, `generateReelScriptsForClient`, `generateReelCaptionsForClient`, video-job creators, assembly/branding enqueue, QA agents, TTS, B-roll.
- Request-authoritative `clientId`, `clientIds`, or `weekStart` on cron route.
- Instagram Graph publish (ADR-0002 — permanently out).
- Cliente-facing cycle UI.
- New LLM agents or provider adapters.
- Dynamic `import()` of spend modules behind `dryRun=false` in Phase A.

---

## Frozen decisions (Phase A — do not reopen)

| # | Topic | Freeze |
|---|-------|--------|
| 1 | **HTTP method** | **`GET`** primary (Vercel Cron default). **`POST`** accepted as alias with **identical** auth + batch behavior |
| 2 | **Route path** | **`/api/cron/weekly-cycle`** → `app/api/cron/weekly-cycle/route.ts` |
| 3 | **Auth header** | **`Authorization: Bearer <CRON_SECRET>`** only — no query `?secret=`, no `x-cron-secret`, no cookie |
| 4 | **Secret source** | `process.env.CRON_SECRET` only — never `NEXT_PUBLIC_*` |
| 5 | **Secret compare** | SHA-256 digest both provided token and env secret → `timingSafeEqual` on 32-byte digests (handles variable length safely) |
| 6 | **Production fail-closed** | When `process.env.VERCEL_ENV === "production"` **or** `NODE_ENV === "production"`: empty/missing `CRON_SECRET` → **503** `{ "error": "SERVICE_UNAVAILABLE" }` — **no** batch execution |
| 7 | **Auth failure** | Missing/wrong Bearer → **401** `{ "error": "UNAUTHORIZED" }` — **zero** DB writes |
| 8 | **Phase A spend guard** | **Structural:** `run-weekly-cycle-for-client.ts` imports **only** `plan-weekly-cycle-steps`, ledger, eligibility, contracts — **no** imports from `lib/content-strategy/generate-*`, `lib/reel-scripts/generate-*`, `lib/reel-captions/generate-*`, `lib/assembly/**`, `lib/qa/**`, `lib/providers/**`, `lib/agents/**`, `lib/cost-policy/**` |
| 9 | **Dry-run precedence Phase A** | **Always plan-only** in all environments until Phase B CLOSE: route passes `dryRun: true` hard-coded; `?dryRun=0` and body `dryRun: false` **ignored**; env `WEEKLY_CYCLE_DRY_RUN` may be set `true` (redundant) — never `false` in Phase A prod |
| 10 | **weekStart authority** | **`resolveWeekStartForCycle()`** — ISO Monday UTC via `normalizeToIsoMonday` — **not** from request |
| 11 | **Client enumeration** | **`listEligibleClientsForWeeklyCycle()`** — server query only; cron **ignores** body client targeting |
| 12 | **Eligibility V1** | `neuramark_clients.active = true` AND `getBusinessProfileForAgents(clientId).exists === true` AND `visualModeSummary !== null` |
| 13 | **Ineligible clients** | Skipped with `skipReason` in batch response — **no** ledger row |
| 14 | **Idempotency key** | Unique `(client_id, week_start)` — one row per client per ISO week |
| 15 | **Dry-run re-plan** | Second+ cron tick same client+week: `acquireWeeklyCycleRun` → `ALREADY_EXISTS`; **refresh** `step_log` + `finished_at` on existing `dry_run` row — no second insert |
| 16 | **Processing order** | **Sequential** per eligible client (PO lean — no parallel spend burst) |
| 17 | **Cron schedule** | **`0 6 * * 1`** — Monday **06:00 UTC** in `vercel.json` |
| 18 | **Mode column** | Phase A rows always `mode = 'cron'` |
| 19 | **Cache** | `export const dynamic = "force-dynamic"`; `Cache-Control: no-store` on responses |
| 20 | **Logging** | `runId`, `clientId`, `weekStart`, `status`, step keys — **never** `CRON_SECRET`, Authorization header, full profile/strategy text |
| 21 | **IG connect gate** | **Out** of Phase A eligibility — follow-up story for full onboarding checklist |
| 22 | **CRON_SECRET rotation** | Update Vercel env + redeploy; dual-secret verify **out of scope** V1 |

---

## Cron Route Handler

**File:** `app/api/cron/weekly-cycle/route.ts`

### Gate order (frozen)

1. **`verifyCronSecret(request)`** — failure → **401** or **503** (misconfigured prod); **no** body parse, **no** DB.
2. **`findForbiddenWeeklyCycleCronKeys(body)`** — if request has JSON body with forbidden keys → **400** `{ "error": "FORBIDDEN_FIELDS" }`. Empty body / no body → OK.
3. **`resolveWeekStartForCycle()`** — server `weekStart` (ignore query `weekStart`).
4. **`runWeeklyCycleBatch({ weekStart, mode: "cron", dryRun: true })`** — Phase A hard-coded `dryRun: true`.
5. Return **200** aggregate summary JSON.

### Exports

```ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response>;
export async function POST(request: Request): Promise<Response>;
```

Both methods delegate to shared `handleWeeklyCycleCron(request)`.

### Session rule

Authenticated Operator/Cliente session **without** valid Bearer → **401**. No `requireOperator` shortcut on this route.

---

## `verifyCronSecret`

**File:** `lib/orchestration/verify-cron-secret.ts` (`import "server-only"`)

```ts
import { createHash, timingSafeEqual } from "node:crypto";

export type CronSecretVerifyResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: "UNAUTHORIZED" | "SERVICE_UNAVAILABLE" };

export function verifyCronSecret(request: Request): CronSecretVerifyResult;
```

| Step | Rule |
|------|------|
| 1 | Read `Authorization` header; must match `/^Bearer\s+(\S+)\s*$/i` — else **401** |
| 2 | If production and `!process.env.CRON_SECRET?.trim()` → **503** |
| 3 | If non-production and secret unset → **401** (dev must set `CRON_SECRET` locally) |
| 4 | `digest = createHash("sha256").update(token, "utf8").digest()` for both provided token and env secret |
| 5 | `timingSafeEqual(digestProvided, digestExpected)` — false → **401** |
| 6 | Never log token or secret |

**Ops note:** Generate with `openssl rand -base64 32`; set in Vercel project env as `CRON_SECRET`. Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` automatically when the env var exists.

---

## `vercel.json`

**File:** `vercel.json` (repo root — **new** in Phase A BUILD)

```json
{
  "crons": [
    {
      "path": "/api/cron/weekly-cycle",
      "schedule": "0 6 * * 1"
    }
  ]
}
```

| Field | Value |
|-------|-------|
| `path` | `/api/cron/weekly-cycle` |
| `schedule` | `0 6 * * 1` — every **Monday 06:00 UTC** |
| HTTP method | Vercel invokes **GET** |

**Non-goals:** per-client timezone schedules; multiple cron entries — V1 single UTC window.

---

## Database — `neuramark_weekly_cycle_runs`

**Migration file (BUILD):** `supabase/migrations/20260831110000_neuramark_weekly_cycle_runs.sql`

```sql
-- US-15.1 Phase A: Ciclo semanal automatizado idempotency ledger

CREATE TABLE public.neuramark_weekly_cycle_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL
    REFERENCES public.neuramark_clients(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  status text NOT NULL
    CHECK (status IN ('planned', 'running', 'completed', 'failed', 'dry_run')),
  mode text NOT NULL
    CHECK (mode IN ('cron', 'operator')),
  step_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT neuramark_weekly_cycle_runs_client_week_uidx
    UNIQUE (client_id, week_start),
  CONSTRAINT neuramark_weekly_cycle_runs_step_log_is_array_chk
    CHECK (jsonb_typeof(step_log) = 'array')
);

CREATE INDEX neuramark_weekly_cycle_runs_client_id_idx
  ON public.neuramark_weekly_cycle_runs (client_id);

CREATE INDEX neuramark_weekly_cycle_runs_week_start_idx
  ON public.neuramark_weekly_cycle_runs (week_start DESC);

CREATE INDEX neuramark_weekly_cycle_runs_status_idx
  ON public.neuramark_weekly_cycle_runs (status);

COMMENT ON TABLE public.neuramark_weekly_cycle_runs IS
  'US-15.1: Ciclo semanal automatizado run ledger — idempotent per (client_id, week_start). Phase A dry_run only.';

ALTER TABLE public.neuramark_weekly_cycle_runs ENABLE ROW LEVEL SECURITY;
```

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | Run id returned in HTTP summary |
| `client_id` | `uuid` FK | Tenant scope |
| `week_start` | `date` | ISO Monday canonical week key |
| `status` | `text` CHECK | Phase A uses **`dry_run`** on success; `planned` reserved Phase B transition |
| `mode` | `text` CHECK | Phase A: **`cron`** only |
| `step_log` | `jsonb` array | Dry-run plan steps (§ Step plan shape) |
| `started_at` | `timestamptz` | Set on first plan execution |
| `finished_at` | `timestamptz` | Set after plan written |
| `created_at` | `timestamptz` | Insert time |

**RLS:** enabled, **zero** policies — service-role Node helpers only (matches US-10.1 / US-13.1 pattern).

**Phase A:** no changes to existing production tables beyond this ledger.

---

## `resolveWeekStartForCycle`

**File:** `lib/orchestration/resolve-week-start-for-cycle.ts` (pure — no `server-only` required)

```ts
import { normalizeToIsoMonday } from "@/lib/trend/normalize-week-start";
import { trendWeekStartSchema } from "@/lib/contracts/trend";

/** ISO Monday UTC for the ciclo semanal partition key. */
export function resolveWeekStartForCycle(referenceDate?: Date): string {
  const ref = referenceDate ?? new Date();
  const weekStart = normalizeToIsoMonday(ref);
  return trendWeekStartSchema.parse(weekStart);
}
```

| Rule | Detail |
|------|--------|
| Default `referenceDate` | `new Date()` at invocation time (cron tick “now”) |
| Output | `YYYY-MM-DD` ISO Monday UTC — same convention as Estrategia semanal / guiones / calendar |
| Authority | **Server only** — cron route and tests may pass `referenceDate`; HTTP callers **cannot** |

---

## `listEligibleClientsForWeeklyCycle`

**File:** `lib/orchestration/list-eligible-clients-for-weekly-cycle.ts` (`import "server-only"`)

```ts
export type WeeklyCycleEligibilitySkipReason =
  | "INACTIVE"
  | "PROFILE_MISSING"
  | "VISUAL_MODE_MISSING"
  | "PROFILE_LOAD_FAILED";

export type WeeklyCycleEligibleClient = {
  clientId: string;
};

export type WeeklyCycleIneligibleClient = {
  clientId: string;
  skipReason: WeeklyCycleEligibilitySkipReason;
};

export type ListEligibleClientsForWeeklyCycleResult = {
  eligible: WeeklyCycleEligibleClient[];
  skipped: WeeklyCycleIneligibleClient[];
};

export async function listEligibleClientsForWeeklyCycle(): Promise<ListEligibleClientsForWeeklyCycleResult>;
```

### Algorithm (frozen)

1. Query `neuramark_clients` where `active = true` — select `id` ordered by `created_at ASC`.
2. For each `clientId`:
   - `profile = await getBusinessProfileForAgents(clientId)`
   - If `loadFailed` → `skipped` with `PROFILE_LOAD_FAILED`
   - If `!profile.exists` → `PROFILE_MISSING`
   - If `profile.visualModeSummary === null` → `VISUAL_MODE_MISSING`
   - Else → `eligible`
3. Return both arrays — **no** ledger writes for skipped clients.

**Deferred gate (documented):** Instagram Business connect / full TASKS § F7 onboarding checklist — **not** Phase A predicates.

---

## `acquireWeeklyCycleRun`

**File:** `lib/orchestration/acquire-weekly-cycle-run.ts` (`import "server-only"`)

```ts
export type WeeklyCycleRunMode = "cron" | "operator";

export type AcquireWeeklyCycleRunResult =
  | {
      outcome: "CREATED";
      runId: string;
      status: "dry_run";
      clientId: string;
      weekStart: string;
    }
  | {
      outcome: "ALREADY_EXISTS";
      runId: string;
      status: "planned" | "running" | "completed" | "failed" | "dry_run";
      clientId: string;
      weekStart: string;
    };

export async function acquireWeeklyCycleRun(params: {
  clientId: string;
  weekStart: string;
  mode: WeeklyCycleRunMode;
}): Promise<AcquireWeeklyCycleRunResult>;
```

### Transaction pattern (frozen)

1. `INSERT INTO neuramark_weekly_cycle_runs (client_id, week_start, status, mode, step_log, started_at)`  
   `VALUES ($1, $2, 'dry_run', $3, '[]'::jsonb, now())`  
   `ON CONFLICT (client_id, week_start) DO NOTHING`  
   `RETURNING id, status`.
2. If row returned → **`CREATED`** with `status: 'dry_run'`.
3. Else `SELECT id, status FROM neuramark_weekly_cycle_runs WHERE client_id = $1 AND week_start = $2` → **`ALREADY_EXISTS`**.

**Phase A:** initial insert status is always **`dry_run`** (not `planned`). `running` / `completed` / `failed` appear only after Phase B live wiring.

**Concurrent cron ticks:** unique constraint ensures one row; losers read existing row — **no** duplicate spend path in Phase B when wired to same helper.

---

## Step planner — `planWeeklyCycleSteps`

**File:** `lib/orchestration/plan-weekly-cycle-steps.ts` (`import "server-only"`)

Pure planner — **no** DB, **no** LLM, **no** provider imports.

```ts
export const WEEKLY_CYCLE_STEP_KEYS = [
  "strategy",
  "scripts",
  "captions",
  "primary_video",
  "tts",
  "broll",
  "assembly",
  "branding",
  "qa",
  "approval",
] as const;

export type WeeklyCycleStepKey = (typeof WEEKLY_CYCLE_STEP_KEYS)[number];

export type WeeklyCyclePlanStep = {
  step: WeeklyCycleStepKey;
  /** Phase A: always `planned`. Phase B: pending_provider | running | completed | failed | skipped */
  status: "planned";
  /** Phase B will name orchestrator entrypoint — Phase A documents intent only */
  orchestratorRef: string;
};

export type WeeklyCycleStepPlan = {
  dryRun: true;
  weekStart: string;
  clientId: string;
  invokedBy: "system";
  steps: WeeklyCyclePlanStep[];
};

export function planWeeklyCycleSteps(params: {
  clientId: string;
  weekStart: string;
}): WeeklyCycleStepPlan;
```

### `orchestratorRef` map (frozen intent — Phase B wires these)

| `step` | `orchestratorRef` (BUILD constant string) |
|--------|-------------------------------------------|
| `strategy` | `generateContentStrategyForClient` |
| `scripts` | `generateReelScriptsForClient` |
| `captions` | `generateReelCaptionsForClient` |
| `primary_video` | `createPrimaryVideoJobsForReelScript` (policy resolver) |
| `tts` | `synthesizeVoiceoverForReelScript` |
| `broll` | `createBrollVideoJobs` |
| `assembly` | `createAssemblyJobForReelScript` |
| `branding` | `enqueueBrandingForAssembledReel` |
| `qa` | `runQaForAssembledReelForClient` |
| `approval` | `ensureApprovalQueueEntryForReel` (US-11.1) |

Phase A returns these refs as **strings in JSON only** — **does not import** the modules.

---

## `runWeeklyCycleForClient` (Phase A dry-run branch)

**File:** `lib/orchestration/run-weekly-cycle-for-client.ts` (`import "server-only"`)

```ts
export type RunWeeklyCycleForClientParams = {
  clientId: string;
  weekStart: string;
  invokedBy: "system";
  mode: WeeklyCycleRunMode;
  /** Phase A: must be true — enforced at type + runtime guard */
  dryRun: true;
};

export type RunWeeklyCycleForClientResult =
  | {
      ok: true;
      runId: string;
      weekStart: string;
      clientId: string;
      status: "dry_run";
      acquireOutcome: "CREATED" | "ALREADY_EXISTS";
      plan: WeeklyCycleStepPlan;
    }
  | {
      ok: false;
      error: { code: "INTERNAL_ERROR" };
    };

export async function runWeeklyCycleForClient(
  params: RunWeeklyCycleForClientParams,
): Promise<RunWeeklyCycleForClientResult>;
```

### Algorithm (Phase A — frozen)

1. Runtime assert `params.dryRun === true` — else throw / return `INTERNAL_ERROR` (Phase B guard placeholder).
2. `acquire = await acquireWeeklyCycleRun({ clientId, weekStart, mode })`.
3. `plan = planWeeklyCycleSteps({ clientId, weekStart })`.
4. `UPDATE neuramark_weekly_cycle_runs SET step_log = $plan.steps serialized, status = 'dry_run', finished_at = now(), started_at = COALESCE(started_at, now()) WHERE id = acquire.runId`.
5. Return `{ ok: true, ..., plan }`.

**Spend guard:** file MUST NOT import spend orchestrators (§ Frozen decision #8). Phase B adds `run-weekly-cycle-for-client.live.ts` or conditional compile — **not** Phase A.

---

## `runWeeklyCycleBatch`

**File:** `lib/orchestration/run-weekly-cycle-batch.ts` (`import "server-only"`)

```ts
export type RunWeeklyCycleBatchParams = {
  weekStart: string;
  mode: WeeklyCycleRunMode;
  dryRun: true;
};

export type WeeklyCycleClientBatchItem =
  | {
      clientId: string;
      status: "dry_run";
      runId: string;
      acquireOutcome: "CREATED" | "ALREADY_EXISTS";
      stepCount: number;
    }
  | {
      clientId: string;
      status: "skipped";
      skipReason: WeeklyCycleEligibilitySkipReason;
    }
  | {
      clientId: string;
      status: "failed";
      errorCode: "INTERNAL_ERROR";
    };

export type RunWeeklyCycleBatchResult = {
  weekStart: string;
  dryRun: true;
  eligibleCount: number;
  skippedCount: number;
  processedCount: number;
  failedCount: number;
  clients: WeeklyCycleClientBatchItem[];
};

export async function runWeeklyCycleBatch(
  params: RunWeeklyCycleBatchParams,
): Promise<RunWeeklyCycleBatchResult>;
```

### Algorithm

1. `const { eligible, skipped } = await listEligibleClientsForWeeklyCycle()`.
2. Map `skipped` → batch items with `status: "skipped"`.
3. For each `eligible` **sequentially**: `runWeeklyCycleForClient({ clientId, weekStart, invokedBy: "system", mode, dryRun: true })`.
4. Aggregate counts; collect per-client items.
5. On per-client failure → `status: "failed"` item; **continue** next client (partial batch OK for Phase A).

---

## HTTP response — cron 200 summary

**Production:** minimal JSON — no full `step_log` blobs, no secrets.

```ts
type WeeklyCycleCronHttpResponse = {
  weekStart: string;
  dryRun: true;
  eligibleCount: number;
  skippedCount: number;
  processedCount: number;
  failedCount: number;
  clients: Array<
    | {
        clientId: string;
        status: "dry_run";
        runId: string;
        acquireOutcome: "CREATED" | "ALREADY_EXISTS";
        stepCount: number;
      }
    | {
        clientId: string;
        status: "skipped";
        skipReason: WeeklyCycleEligibilitySkipReason;
      }
    | {
        clientId: string;
        status: "failed";
        errorCode: "INTERNAL_ERROR";
      }
  >;
};
```

| Status | Body |
|--------|------|
| **200** | `WeeklyCycleCronHttpResponse` |
| **401** | `{ "error": "UNAUTHORIZED" }` |
| **400** | `{ "error": "FORBIDDEN_FIELDS" }` |
| **503** | `{ "error": "SERVICE_UNAVAILABLE" }` |

Headers: `Cache-Control: no-store`.

---

## Forbidden request keys (cron route)

**File:** `lib/orchestration/find-forbidden-weekly-cycle-cron-keys.ts`

```ts
export const FORBIDDEN_WEEKLY_CYCLE_CRON_KEYS = [
  "clientId",
  "client_id",
  "clientIds",
  "client_ids",
  "weekStart",
  "week_start",
  "dryRun",
  "dry_run",
  "mode",
  "invokedBy",
  "invoked_by",
  "providerKey",
  "provider_key",
  "secret",
  "cronSecret",
  "CRON_SECRET",
  "role",
  "auth_user_id",
] as const;

export function findForbiddenWeeklyCycleCronKeys(raw: unknown): string[];
```

| Rule | Detail |
|------|--------|
| Empty body | **Allowed** |
| Any forbidden key present (top-level JSON) | **400** `FORBIDDEN_FIELDS` |
| Query `?dryRun=0` | **Ignored** — still dry-run Phase A (not a forbidden key on query; route does not read it for authority) |

---

## TypeScript contracts — `lib/contracts/weekly-cycle.ts` (BUILD sketch)

Reuse:

```ts
import { z } from "zod";
import { agentClientIdSchema } from "@/lib/contracts/profile";
import { trendWeekStartSchema } from "@/lib/contracts/trend";
```

Export Zod mirrors of:

- `weeklyCycleStepKeySchema` — enum from `WEEKLY_CYCLE_STEP_KEYS`
- `weeklyCyclePlanStepSchema`
- `weeklyCycleStepPlanSchema`
- `weeklyCycleEligibilitySkipReasonSchema`
- `weeklyCycleCronHttpResponseSchema`
- `FORBIDDEN_WEEKLY_CYCLE_CRON_KEYS` + finder

---

## Dry-run precedence (Phase A — frozen)

| Source | Phase A behavior |
|--------|------------------|
| Route hard-code | `dryRun: true` always |
| `WEEKLY_CYCLE_DRY_RUN` env | May be `true`; **`false` has no effect** in Phase A |
| Query `?dryRun=1` | Redundant — no-op |
| Query `?dryRun=0` | **Ignored** — remains plan-only |
| JSON body `dryRun` | **Forbidden** → 400 if present |

**Phase B delta (not frozen):** env + Operator manual path may set `dryRun: false` after SECURITY delta.

---

## Tests (Phase A minimum)

| File | Case | Expect |
|------|------|--------|
| `lib/orchestration/verify-cron-secret.test.ts` | Valid Bearer | `{ ok: true }` |
| same | Missing / wrong token | **401** |
| same | Prod without env secret | **503** |
| same | Uses `timingSafeEqual` | grep / mock |
| `app/api/cron/weekly-cycle/route.test.ts` | Valid secret | **200** summary |
| same | No Authorization | **401**, no DB mock calls |
| same | Body `{ clientId: "..." }` | **400** |
| `lib/orchestration/list-eligible-clients-for-weekly-cycle.test.ts` | active + profile + visual | eligible |
| same | missing profile | skipped `PROFILE_MISSING` |
| same | inactive | skipped `INACTIVE` |
| `lib/orchestration/acquire-weekly-cycle-run.test.ts` | First insert | `CREATED` |
| same | Second insert same client+week | `ALREADY_EXISTS` |
| `lib/orchestration/run-weekly-cycle-for-client.test.ts` | Dry-run | plan 10 steps; step_log persisted |
| same | Re-run same week | `ALREADY_EXISTS`; step_log updated |
| same | Spend orchestrators | **not called** (no mocks wired — grep test that file has no spend imports) |
| grep | `run-weekly-cycle-for-client.ts` | no imports from `generate-content-strategy`, `generate-reel-scripts`, `generate-reel-captions`, `lib/assembly`, `lib/qa`, `lib/agents` |
| grep | `lib/orchestration/**` | `import "server-only"` on all modules except pure `resolve-week-start-for-cycle.ts` |

---

## Server-only modules (planned BUILD)

| Module | Purpose |
|--------|---------|
| `lib/contracts/weekly-cycle.ts` | Zod + types + forbidden keys |
| `lib/orchestration/verify-cron-secret.ts` | Bearer validation |
| `lib/orchestration/find-forbidden-weekly-cycle-cron-keys.ts` | Body authority rejection |
| `lib/orchestration/resolve-week-start-for-cycle.ts` | ISO Monday week key |
| `lib/orchestration/list-eligible-clients-for-weekly-cycle.ts` | Eligibility enumeration |
| `lib/orchestration/acquire-weekly-cycle-run.ts` | Idempotency insert |
| `lib/orchestration/plan-weekly-cycle-steps.ts` | Dry-run step planner |
| `lib/orchestration/run-weekly-cycle-for-client.ts` | Per-client Phase A runner |
| `lib/orchestration/run-weekly-cycle-batch.ts` | Cron batch loop |
| `lib/orchestration/persist-weekly-cycle-run-plan.ts` | UPDATE step_log helper |
| `app/api/cron/weekly-cycle/route.ts` | HTTP entry |
| `vercel.json` | Cron schedule |
| `supabase/migrations/20260831110000_neuramark_weekly_cycle_runs.sql` | Ledger DDL |

---

## Handoffs

| Direction | Artifact | Rule |
|-----------|----------|------|
| From US-2.3 | `getBusinessProfileForAgents` | Eligibility `exists` check |
| From US-3.1 | `visualModeSummary` | Eligibility non-null check |
| From US-4.1 / US-5.1 / US-6.1 | `invokedBy: "system"` orchestrators | **Phase B only** — planner documents refs |
| From US-10.1 | `runQaForAssembledReelForClient` | Phase B auto-chain |
| From US-11.1 | approval ensure helper | Phase B terminal step |
| To Phase B | `acquireWeeklyCycleRun` + ledger | Live runs reuse same row + unique key |
| ADR-0001 | This story implements scheduler | Phase A = trust boundary |
| ADR-0002 | No publish | Permanent — planner `approval` ≠ publish |
| ADR-0003 | Vercel enqueues only | Phase B must not FFmpeg poll in route |

---

## Non-goals (Phase A)

- Operator manual trigger Server Action / `/operator/cycle` UI.
- Live LLM / provider / FFmpeg / worker spend.
- Instagram Graph publish.
- Strategy auto-approve vs draft-bypass implementation (Phase B CONTRACT).
- Operator pause/skip semana.
- Cliente-facing cycle status.
- IG Business connect as eligibility gate.
- RBAC beyond existing `requireOperator` (Phase B manual path).
- SC-1..SC-4 end-to-end verification (integration-checker PHASE-7).
- New agents, adapters, or DDL beyond `neuramark_weekly_cycle_runs`.

---

## Phase B stub (not frozen — do not BUILD)

Phase B CONTRACT delta must freeze before BUILD:

1. **Strategy gate** — pick (A) `autoApproveContentStrategyForWeek` after valid draft or (B) system draft bypass in script/caption orchestrators.
2. **Live `runWeeklyCycleForClient`** — `dryRun: false` branch wiring table with exact imports.
3. **`triggerWeeklyCycleForClient`** Server Action — `requireOperator("handler")` first.
4. **`step_log` live shape** — per-step `{ step, status, errorCode?, at }`.
5. **Operator FE** — `/operator/cycle` EN/ES props.
6. **SECURITY delta** appended to `SECURITY.md`.

---

## Security acceptance mapping ([SEC] USER_STORIES Phase A)

| USER_STORIES [SEC] intent | CONTRACT enforcement |
|---------------------------|---------------------|
| Cron Route Handler only HTTP entry for System cycle | § Cron Route Handler — sole `/api/cron/weekly-cycle` |
| Orchestrator modules `server-only` | § Server-only modules |
| Forbidden request fields rejected | § Forbidden keys |
| No `client_id` from untrusted body | § Forbidden keys · server enumeration |
| No browser/Cliente exposure | No FE Phase A; 401 without Bearer |

---

## Key contract decisions (summary)

1. **GET** `/api/cron/weekly-cycle` + **POST** alias; Vercel Cron **Monday 06:00 UTC**.
2. **`Authorization: Bearer ${CRON_SECRET}`** — SHA-256 digest + `timingSafeEqual`; prod missing secret → **503**.
3. **Phase A always dry-run** — structural spend import ban on `run-weekly-cycle-for-client.ts`.
4. **Eligibility:** `active` + Ficha viva + Preferencias de producción visual; IG connect deferred.
5. **`weekStart`:** `resolveWeekStartForCycle()` — ISO Monday UTC; not from request.
6. **Ledger:** `neuramark_weekly_cycle_runs` unique `(client_id, week_start)`; RLS zero policies.
7. **Acquire:** `CREATED` \| `ALREADY_EXISTS`; dry-run re-plan updates `step_log`.
8. **Planner:** 10 ordered steps with `orchestratorRef` strings — no module imports Phase A.
9. **Batch:** sequential per client; skipped ineligible without ledger row.
10. **Phase B:** strategy gate + live wiring + Operator UI — separate CONTRACT freeze.

---

## Reviewed by FE

**Phase A:** N/A — backend-only; no FE signoff required.

**Phase B:** FE signoff required before BUILD (see stub).
