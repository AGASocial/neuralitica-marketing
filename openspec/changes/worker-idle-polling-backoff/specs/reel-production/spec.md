## ADDED Requirements

### Requirement: Fly worker idle poll backoff
When `*_JOB_POLL_MODE=fly`, video, assembly, and branding worker loops SHALL sleep with exponential idle backoff after consecutive empty queue polls, capped by a configurable max interval (default 60 seconds).

#### Scenario: Empty queue backs off
- **WHEN** a Fly worker queue poll returns no runnable jobs for consecutive ticks
- **THEN** the sleep before the next queue poll increases exponentially up to the configured max idle interval (default 60s)

### Requirement: Fly worker idle backoff reset on work
When a Fly worker queue poll finds work, the next sleep SHALL reset immediately to the short base `*_JOB_POLL_INTERVAL_MS` (not the idle-capped interval).

#### Scenario: Work resets to base interval
- **WHEN** a Fly worker queue poll finds at least one runnable job
- **THEN** the next sleep uses the short base `*_JOB_POLL_INTERVAL_MS` (not the idle-capped interval)

### Requirement: Fly worker stale sweep cadence
Stale-job sweeps SHALL run on a separate configurable interval (default 5 minutes), including once near process start, not on every queue poll tick. Claim/lock and stale-mark semantics MUST remain unchanged.

#### Scenario: Stale sweep less frequent than queue poll
- **WHEN** the Fly worker loop is running
- **THEN** `markStale*Failed` runs at the stale-sweep interval (default 5 minutes, including once near process start), not on every queue tick

### Requirement: Fly worker idle backoff helper and latency
Shared idle backoff logic MUST live in a pure helper with unit tests. With defaults, max idle detection latency is the configured max idle interval (60s).

#### Scenario: Max idle detection latency
- **WHEN** the Fly worker has been idle long enough to reach the max backoff
- **THEN** a newly enqueued job is detected within the configured max idle interval (default 60s)

### Requirement: Vercel video-jobs cron remains failover
`/api/cron/video-jobs` SHALL remain scheduled as a Vercel failover for vendor status polling and video stale sweep if the Fly video process is unavailable.

#### Scenario: Vercel video-jobs cron remains failover
- **WHEN** production scheduling is considered
- **THEN** `/api/cron/video-jobs` remains scheduled as a Vercel failover for vendor status polling and video stale sweep if the Fly video process is unavailable
