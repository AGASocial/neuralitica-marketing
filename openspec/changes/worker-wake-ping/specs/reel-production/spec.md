## ADDED Requirements

### Requirement: Fly worker wake HTTP endpoints
Each Fly worker process SHALL expose `POST /wake` authenticated with `WORKER_WAKE_SECRET` (constant-time compare) and `GET /healthz` without secrets. Missing secret MUST reject wake requests.

#### Scenario: Authenticated wake accepted
- **WHEN** `POST /wake` includes a valid Bearer `WORKER_WAKE_SECRET`
- **THEN** the worker signals its poll loop to wake and responds without exposing secrets

#### Scenario: Wake rejected without secret
- **WHEN** `WORKER_WAKE_SECRET` is unset or the Bearer token does not match
- **THEN** `POST /wake` is rejected and the poll loop is not signaled

### Requirement: Fire-and-forget wake ping on enqueue
When the app enqueues a video, assembly, or branding job for Fly, it SHALL schedule an authenticated HTTP wake ping (Next `after()` in request scope; otherwise fire-and-forget). Missing URL/secret MUST skip; ping MUST NOT fail or delay enqueue.

#### Scenario: Ping skipped when unconfigured
- **WHEN** `WORKER_WAKE_SECRET` or the target `WORKER_WAKE_URL_*` is unset
- **THEN** enqueue succeeds and no wake HTTP request is sent

#### Scenario: Ping does not block enqueue
- **WHEN** the wake HTTP request times out or errors
- **THEN** enqueue still succeeds and the error is only logged

#### Scenario: Ping survives serverless response
- **WHEN** enqueue runs inside a Next.js request that returns before the wake fetch finishes
- **THEN** the ping is registered with `after()` so the platform can still send it

### Requirement: Wake drains without concurrent loops
A wake MUST interrupt idle sleep (or force the next sleep to zero if mid-poll), reset idle backoff, and continue the existing single poll loop so the queue drains at the short base interval. Repeated wakes MUST NOT start concurrent loop runs.

#### Scenario: Wake during idle sleep
- **WHEN** the worker is sleeping in idle backoff and receives a valid wake
- **THEN** sleep ends early, backoff resets, and the same loop polls again without a second concurrent loop

#### Scenario: Wake during active poll
- **WHEN** a valid wake arrives while the loop is polling (not sleeping)
- **THEN** backoff resets and the next sleep is at most the base interval (or zero), without starting a second concurrent loop

### Requirement: Ten-minute idle backup poll
Fly worker idle backoff max interval default SHALL be 10 minutes (`WORKER_IDLE_MAX_INTERVAL_MS`, default 600000), still env-overridable. Stale sweeps default to 5 minutes.

#### Scenario: Deep idle backup interval
- **WHEN** a Fly worker has been idle long enough to reach max backoff and no wake arrives
- **THEN** the next queue poll occurs within the configured max idle interval (default 10 minutes)

### Requirement: Video-jobs cron reachable ten-minute failover
`/api/cron/video-jobs` SHALL be middleware-public, authenticated with `CRON_SECRET`, and scheduled about every 10 minutes as failover when the Fly video process is unavailable.

#### Scenario: Cron reaches handler without session
- **WHEN** Vercel Cron calls `/api/cron/video-jobs` with a valid `CRON_SECRET` Bearer and no session cookie
- **THEN** middleware does not redirect to login and the handler can run the single-tick video poll

#### Scenario: Cron schedule is ten minutes
- **WHEN** production cron config is considered
- **THEN** `/api/cron/video-jobs` is scheduled every 10 minutes rather than every minute
