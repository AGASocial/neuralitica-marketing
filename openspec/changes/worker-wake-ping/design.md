# Design: Worker wake ping

## Context

Three Fly process groups (`video`, `assembly`, `branding`) on app `neuralitica-marketing-worker` poll Supabase with exponential idle backoff (current default max 60s). Enqueue from Vercel is a DB insert only in `fly` mode — workers discover work on the next poll. `fly.toml` has no HTTP service today. Vercel Cron hits `/api/cron/video-jobs` every minute but middleware requires a session cookie, so Cron never reaches `verifyCronSecret` / the poller (302 → `/login`).

## Decisions

### 1. Public HTTPS per process group via distinct external ports

Vercel is not on Fly’s private network, so wakes must use public HTTPS + shared secret.

**Choice:** each process group keeps its own machine and exposes the same internal HTTP server on port `8080`, published on **different external ports**:

| Process   | External HTTPS | Example wake URL |
|-----------|----------------|------------------|
| video     | 443            | `https://neuralitica-marketing-worker.fly.dev/wake` |
| assembly  | 8443           | `https://neuralitica-marketing-worker.fly.dev:8443/wake` |
| branding  | 8444           | `https://neuralitica-marketing-worker.fly.dev:8444/wake` |

Configured in `fly.toml` with three `[[services]]` blocks (`processes = ["video"|"assembly"|"branding"]`), `auto_stop_machines = "off"`, `min_machines_running = 1` (or equivalent so loops are not killed). Internal listen port = `PORT` / 8080.

**Why not one shared LB URL:** Fly would load-balance across all process groups; a video wake could hit an assembly machine and be ignored until the 10-minute backup poll.

**Why not Fly private / flycast:** unreachable from Vercel.

**Why not a fourth “router” process:** more moving parts for little gain versus port-per-group.

Vercel env (full URLs, including `/wake`):

- `WORKER_WAKE_URL_VIDEO`
- `WORKER_WAKE_URL_ASSEMBLY`
- `WORKER_WAKE_URL_BRANDING`
- `WORKER_WAKE_SECRET` (same value on Fly)

If URL or secret is missing, the client **skips** the ping (no throw). If secret is missing on the worker, `/wake` rejects all requests (503 in production-like envs / 401 otherwise), matching cron-secret posture.

### 2. Scheduled ping from enqueue seams (after + fallback)

After a successful enqueue path that previously no-op’d in `fly` mode, call `pingWorkerWake(target)`:

- Short timeout (default **1500 ms**, `WORKER_WAKE_TIMEOUT_MS`)
- Never awaited by the caller; errors only logged
- Must not change enqueue success/failure
- Inside a Next.js request: enqueue modules pass `scheduleWorkerWakeWithAfter` (`after()` from `next/server`) so Vercel/Fluid does not freeze the work after the HTTP response is sent
- Outside request scope (Fly workers, unit tests without Next): `after` throws → `scheduleWorkerWakeTask` falls back to fire-and-forget; `pingWorkerWake` itself never imports `next/server`
- Injectable `schedule` / fetch / env for unit tests
- `in_process` mode still runs local poll/run; ping is skipped unless URLs+secret are set

Cross-process note: assembly completion on Fly can enqueue branding; video completion can enqueue assembly (and weekly-cycle resume may create more video jobs). Those Fly processes need the matching `WORKER_WAKE_URL_*` (app-wide secrets), not only Vercel.

### 3. Wake gate: single loop, interruptible sleep

`createWorkerWakeGate()`:

- `sleep(ms)` — timer that resolves early on `wake()`; if a wake arrived while **not** sleeping (mid-poll), the next `sleep` resolves immediately (0)
- `wake()` — invokes registered listeners (e.g. `backoff.reset()`) then interrupts sleep **or** sets pending-immediate-poll
- Repeated wakes coalesce; they never start a second poll loop

HTTP `POST /wake` (Bearer secret, timing-safe compare via SHA-256 digests like `verifyCronSecret`) calls `gate.wake()` and returns **204**. `GET /healthz` returns `{"ok":true}` with no secrets.

After wake, existing loop semantics drain work at the short base interval (or immediately after a mid-poll wake) until empty polls back off again.

### 4. Idle backup poll = 10 minutes; stale sweep = 5 minutes

- Change `WORKER_IDLE_MAX_INTERVAL_MS_DEFAULT` from `60_000` → **`600_000`**
- Keep `WORKER_STALE_SWEEP_INTERVAL_MS_DEFAULT` at **`300_000` (5 min)** so stuck in-flight jobs are still swept about twice per idle window; under deep idle the loop only runs every 10 min so stale effectively runs on those ticks (≥5 min elapsed)

Max enqueue→detect latency without a successful wake: **~10 minutes**. With wake: next poll ASAP after interrupt.

### 5. Vercel `/api/cron/video-jobs` — root cause and decision

**Root cause:** `isPublicPath("/api/cron/video-jobs") === false`, so middleware redirects Cron (no auth cookie) to login. Handler + `CRON_SECRET` never run → no Supabase traffic, no route runtime logs.

**Decision:**

1. Add `/api/cron/video-jobs` to the public allowlist (auth remains `Authorization: Bearer $CRON_SECRET`).
2. Change `vercel.json` schedule from `* * * * *` to **`*/10 * * * *`** (every 10 minutes).

Rationale: wake + Fly 10-minute backup own steady-state latency and idle cost. Cron stays as a **cross-plane failover** if the Fly video process is down, aligned to the same 10-minute bound — not a per-minute primary poller. `weekly-cycle` stays non-public (paid/orchestration surface).

## Alternatives considered

- **Path-based routing on one port:** still needs sticky routing to the right process group; ports are simpler and explicit in env URLs.
- **Remove video-jobs cron entirely:** loses Vercel-plane failover during Fly outages; keeping a 10-minute tick is cheap insurance.
- **Fix cron to every minute only:** unnecessary once wake + 10-minute Fly backup exist; would reintroduce noise without improving happy-path latency.

## Security

- Shared secret never logged; compare digests with `timingSafeEqual`
- Healthz exposes no config
- Wake does not accept job payloads (signal only) — claims/locks unchanged
