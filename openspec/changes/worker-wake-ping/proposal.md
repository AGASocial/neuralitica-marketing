# Change: Worker wake ping + 10-minute idle backup

## Why

Fly workers already idle-backoff to ~60s (`worker-idle-polling-backoff`), but empty-queue Supabase traffic is still high and enqueue→start latency can be up to that cap. Vercel can notify Fly when work is enqueued so workers poll immediately, then rest much longer (10 minutes) as a safety net. Separately, `/api/cron/video-jobs` is scheduled every minute but never reaches the handler in production because auth middleware redirects unauthenticated Cron to `/login` (same class of bug fixed for automation-reminders).

## What Changes

- Authenticated HTTP wake ping from enqueue paths (video / assembly / branding) to the matching Fly process, scheduled with Next `after()` on Vercel and fire-and-forget outside request scope.
- Minimal HTTP server on each Fly process: `POST /wake` (shared secret) and `GET /healthz`; `fly.toml` gains public HTTP services with auto-stop off / machines always running.
- Interruptible idle sleep: wake resets backoff and drains the queue without concurrent loop runs.
- Default `WORKER_IDLE_MAX_INTERVAL_MS` → **600000** (10 minutes); stale sweep stays at **5 minutes**.
- Fix video-jobs cron reachability (public allowlist + `CRON_SECRET`) and reduce schedule to every 10 minutes as Fly-outage failover (not the primary latency path).
- Document `WORKER_WAKE_SECRET` and per-process wake URLs in `docs/governance/OPERATIONS.md` (names only).

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `reel-production`: wake ping on enqueue, wake HTTP on Fly workers, 10-minute idle backup poll, video-jobs cron reachable and less frequent.

## Impact

- `lib/worker/*` (wake auth, gate, HTTP server, ping client), `worker/*.ts`, `fly.toml`
- Enqueue seams: `enqueue-video-job-poll`, `enqueue-assembly-job`, `enqueue-branding-job`
- Poll loops: interruptible sleep + wake reset
- `lib/auth/public-routes.ts`, `vercel.json`, cron tests
- `docs/governance/OPERATIONS.md`
- Fly + Vercel env configuration (human); Fly image redeploy after merge

## Out of Scope

- LISTEN/NOTIFY or queue redesign (ADR-0003 unchanged)
- Changing claim/lock algorithms
- Making `/api/cron/weekly-cycle` public
- Unrelated refactors; `scripts/tmp/`; commits, push, deploy, prod data
