## 1. OpenSpec

- [ ] 1.1 `npx -y @fission-ai/openspec@latest validate worker-wake-ping --strict`

## 2. Wake primitives

- [x] 2.1 Add `lib/worker/wake-auth.ts` (Bearer `WORKER_WAKE_SECRET`, timing-safe; reject when unset)
- [x] 2.2 Add `lib/worker/wake-gate.ts` (interruptible sleep, coalesce wakes, onWake listeners; mid-poll → next sleep 0)
- [x] 2.3 Add `lib/worker/wake-http-server.ts` (`POST /wake`, `GET /healthz`)
- [x] 2.4 Add `lib/worker/ping-worker-wake.ts` (`after()` when in Next request; F&F fallback; timeout; skip if unset)
- [x] 2.5 Unit tests: auth, ping client (`after`/fallback), wake gate (incl. mid-poll)

## 3. Wire workers + enqueue

- [x] 3.1 Start HTTP server + wake gate from `worker/{video,assembly,branding}-jobs.ts`
- [x] 3.2 Use wake gate sleep + backoff.reset on wake in the three poll loops
- [x] 3.3 Ping from `enqueue-video-job-poll`, `enqueue-assembly-job`, `enqueue-branding-job` in fly mode
- [x] 3.4 Default `WORKER_IDLE_MAX_INTERVAL_MS` → 600000; update idle-poll tests

## 4. Fly + cron + docs

- [x] 4.1 Update `fly.toml` with per-process `[[services]]`, auto-stop off, min machines running
- [x] 4.2 Public-allowlist `/api/cron/video-jobs`; schedule `*/10 * * * *`; update cron tests/comments
- [x] 4.3 Document env vars (no values) in `docs/governance/OPERATIONS.md` (incl. Fly cross-process URLs)

## 5. Verify

- [ ] 5.1 Unit tests for new worker wake modules + touched idle/cron tests
- [ ] 5.2 `npm run typecheck` on edited surface
