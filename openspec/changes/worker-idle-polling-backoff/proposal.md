# Change: Worker idle polling backoff

## Why

Fly workers (`neuralitica-marketing-worker`: video, assembly, branding) poll Supabase on a fixed short interval (`*_JOB_POLL_MODE=fly`). In idle periods they generate ~145k requests/day (~4.4M/month projected); >99% of polls return `[]`. Assembly and branding also run a stale-job SELECT on every tick (~3s), doubling empty-queue traffic.

## What Changes

- Shared idle backoff for Fly worker loops: after consecutive empty queue polls, exponentially increase sleep up to a configurable max (~60s); any non-empty poll resets immediately to the short base interval.
- Run stale-job sweeps on a separate, much longer interval than the queue poll (defaults measured in minutes), without changing claim/lock or stale recovery semantics.
- Env-configurable defaults (`WORKER_*` shared + optional per-pipeline overrides); pure unit tests for the backoff helper.
- Review `/api/cron/video-jobs` (Vercel every minute): **keep** as Fly failover for vendor status + stale sweep when the Fly video process is down; document why it is not removed. Optionally clarify the outdated “IMPLEMENTATION INCOMPLETE” comment.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `reel-production`: Fly worker poll loops SHALL apply idle exponential backoff and decouple stale sweeps from every queue tick; document max idle detection latency and env knobs.

## Impact

- `lib/worker/idle-poll-backoff.ts` (+ tests)
- `lib/video-jobs/poll-video-job-until-terminal.ts`, `lib/assembly/poll-assembly-jobs.ts`, `lib/branding/poll-branding-jobs.ts`
- Config readers/constants for idle max / multiplier / stale-sweep interval
- Cron comment clarity in `lib/video-jobs/handle-video-jobs-cron.ts` (no schedule change unless proven redundant — it is not)
- Fly worker image redeploy after merge (shared lib)

## Out of Scope

- Push/notify / LISTEN-NOTIFY replacement for polling (ADR-0003 unchanged)
- Changing claim/lock algorithms or stale timeout thresholds
- Removing Vercel `/api/cron/video-jobs` failover
- Unrelated refactors; `scripts/tmp/`

## Latency note (defaults)

With base intervals 3s (assembly/branding) / 5s (video), multiplier `2`, max idle `60_000` ms: after a quiet period the worker sleeps at most **60s** between empty polls, so a newly enqueued job is detected within **≤ ~60s** (then the loop resets to the short base interval).
