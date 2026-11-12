# Design: Worker idle polling backoff

## Context

Three Fly processes loop forever:

| Process | Queue SELECT | Stale SELECT today | Base interval |
|---------|--------------|--------------------|---------------|
| video   | `neuramark_video_jobs` queued/processing | every tick | 5s |
| assembly | `neuramark_assembled_reels` status=queued | every tick | 3s |
| branding | same table, branding_status=queued | every tick | 3s |

Root cause of volume: fixed short sleep with no idle awareness, plus stale sweep coupled to every tick.

## Decisions

### 1. Shared pure backoff helper

`lib/worker/idle-poll-backoff.ts` (no `server-only`) owns:

- `createIdlePollBackoff({ baseIntervalMs, maxIntervalMs, multiplier })` → `afterPoll(hadWork): sleepMs`
- `createStaleSweepGate(intervalMs)` → `shouldSweep()` / `markSwept()`
- Env readers for shared + optional per-pipeline overrides

Backoff sequence after consecutive empty polls `n ≥ 1`:  
`min(base * multiplier^(n-1), maxIntervalMs)`.  
Any `hadWork === true` resets `n` to 0 and returns `baseIntervalMs`.

### 2. Stale sweep cadence

Default `WORKER_STALE_SWEEP_INTERVAL_MS = 300_000` (5 min). First loop iteration still sweeps so recovery is not delayed by a full interval after process start. Claim/lock and `markStale*Failed` implementations stay unchanged; only call frequency changes in Fly loops.

Vercel cron `pollActiveVideoJobsOnceBatch` continues to stale-sweep every cron invocation (already ≤1/min).

### 3. Keep `/api/cron/video-jobs`

Not redundant with Fly:

- Fly is the primary continuous poller, but cron is a **separate deploy plane failover** if the Fly video process crashes or stalls.
- Cron uses single-tick `pollActiveVideoJobsOnceBatch` (fits Vercel `maxDuration`); Fly uses until-terminal batching.
- Cost of cron (~1.4k ticks/day) is negligible vs idle Fly traffic; removing it would weaken vendor status + stale recovery during Fly outages.

Action: leave `vercel.json` schedule; update the handler comment from “IMPLEMENTATION INCOMPLETE” to “failover while Fly is primary”.

### 4. Env knobs (defaults)

| Variable | Default | Role |
|----------|---------|------|
| `WORKER_IDLE_MAX_INTERVAL_MS` | `60000` | Cap idle sleep |
| `WORKER_IDLE_BACKOFF_MULTIPLIER` | `2` | Exponential factor |
| `WORKER_STALE_SWEEP_INTERVAL_MS` | `300000` | Stale sweep period |
| `VIDEO_JOB_IDLE_MAX_INTERVAL_MS` / `ASSEMBLY_*` / `BRANDING_*` | inherit shared | Optional override |
| `VIDEO_JOB_STALE_SWEEP_INTERVAL_MS` / `ASSEMBLY_*` / `BRANDING_*` | inherit shared | Optional override |
| Existing `*_JOB_POLL_INTERVAL_MS` | 5000 / 3000 / 3000 | Base (busy / reset) interval |

### 5. Max detection latency

With defaults, max time from enqueue (during deep idle) to next queue SELECT is **`WORKER_IDLE_MAX_INTERVAL_MS` (60s)**. After work is seen, sleep returns to base immediately.

## Alternatives considered

- **LISTEN/NOTIFY or queue push**: larger ADR-0003 change; out of scope.
- **Remove Vercel cron**: loses failover; not worth the tiny request savings.
- **Only lengthen fixed interval to 60s**: would add 60s latency even when busy; backoff preserves short interval under load.
