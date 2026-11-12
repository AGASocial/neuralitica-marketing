# Operations — what is actually deployed

## Vercel (app)

- Project: `agasocial/neuralitica-marketing`
- Production URL: https://marketing.neuraliti.ca
- Project ID: `prj_mJTX80AbZLY6NyIZbFvW6WiPxc8o`

## Supabase (database)

- Project: `lrnhrzpwgyhkruwxeppw` (“De Todo un Poco”)
- Linked via `supabase link` for CLI
- Neuramark schema reconciled 2026-09-10 (see migration `20260910120000_neuramark_schema_reconcile_forward.sql`)

## Fly.io / FFmpeg worker (ADR-0003)

**Status (2026-11-03):** deployed. App `neuralitica-marketing-worker`, org `personal` (byagasocial@gmail.com), region `iad`.

- Config: `Dockerfile` (Node 24 bookworm-slim + FFmpeg; runs `worker/*.ts` with `tsx` and `--conditions=react-server`) and `fly.toml` at repo root.
- Process groups (one machine each; public HTTPS for authenticated wake pings only):
  - `video` → `node worker/video-jobs.ts` (HeyGen/talking-head job polling) — HTTPS `:443`
  - `assembly` → `node worker/assembly-jobs.ts` (FFmpeg assembly) — HTTPS `:8443`
  - `branding` → `node worker/branding-jobs.ts` (FFmpeg branding/cover) — HTTPS `:8444`
- Each process serves `POST /wake` (Bearer `WORKER_WAKE_SECRET`) and `GET /healthz` (no secrets). Machines stay running (`auto_stop_machines = "off"`, `min_machines_running = 1`).
- Poll modes are set in `fly.toml` `[env]` (`*_JOB_POLL_MODE=fly`); idle backup default is 10 minutes (`WORKER_IDLE_MAX_INTERVAL_MS`) unless overridden; base intervals use `*_JOB_POLL_INTERVAL_MS`.
- Secrets (set with `fly secrets`, never committed): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `AI_GATEWAY_API_KEY`, `SILICONFLOW_API_KEY`, `SITE_URL`, `NEURAMARK_PROVIDER_ASSET_URL_SECRET`, `NEURAMARK_MEDIA_BACKEND`, `WORKER_WAKE_SECRET`. Add `HEYGEN_API_KEY`, `FAL_API_KEY`, `REPLICATE_API_TOKEN` when those providers are enabled.

### Worker wake ping (Vercel ↔ Fly)

When enqueue seams create video / assembly / branding work they schedule `POST /wake` to the matching process (Next `after()` on Vercel request paths; fire-and-forget outside request scope, including Fly). Configure **the same** `WORKER_WAKE_SECRET` on Fly and Vercel. Set full wake URLs (include `/wake`) wherever a process may enqueue work for **another** process group:

| Variable | Where | Form (example shape, not a real secret) |
|----------|-------|----------------------------------------|
| `WORKER_WAKE_SECRET` | Fly + Vercel | long random shared secret |
| `WORKER_WAKE_URL_VIDEO` | Vercel; Fly if a worker enqueues more video work (e.g. weekly-cycle resume) | `https://neuralitica-marketing-worker.fly.dev/wake` |
| `WORKER_WAKE_URL_ASSEMBLY` | Vercel; Fly **video** (b-roll complete → assembly) | `https://neuralitica-marketing-worker.fly.dev:8443/wake` |
| `WORKER_WAKE_URL_BRANDING` | Vercel; Fly **assembly** (assembly complete → branding) | `https://neuralitica-marketing-worker.fly.dev:8444/wake` |
| `WORKER_WAKE_TIMEOUT_MS` | Vercel / Fly (optional) | milliseconds; default `1500` |

If secret or URL is unset, the caller skips the ping (enqueue still succeeds). `/api/cron/video-jobs` remains a 10-minute Vercel failover (middleware-public + `CRON_SECRET`) when the Fly video process is down.

Deploy / operate:

```bash
fly auth whoami                     # byagasocial@gmail.com
fly deploy -a neuralitica-marketing-worker --remote-only --ha=false
fly status -a neuralitica-marketing-worker
fly logs -a neuralitica-marketing-worker   # expect "[worker] <group> job poll loop started"
# update secrets without echoing values:
grep -E '^(KEY1|KEY2)=' .env | fly secrets import -a neuralitica-marketing-worker
```

The worker deploys independently of Vercel: redeploy Fly after merging changes under `lib/` or `worker/` that the loops use.

## Instagram Graph Publish (ADR-0002)

**In V1 scope (D1).** Not yet implemented — track as product completion after READY, not as out-of-scope.
