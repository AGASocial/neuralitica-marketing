## 1. OpenSpec

- [x] 1.1 `npx -y @fission-ai/openspec@latest validate worker-idle-polling-backoff --strict` *(run locally — shell unavailable in agent session)*

## 2. Shared backoff

- [x] 2.1 Add `lib/worker/idle-poll-backoff.ts` with `createIdlePollBackoff`, `createStaleSweepGate`, shared defaults, and env readers (shared + per-pipeline overrides)
- [x] 2.2 Unit tests in `lib/worker/idle-poll-backoff.test.ts` (reset on work, cap at max, stale gate cadence, env parsing)

## 3. Wire Fly loops

- [x] 3.1 Assembly: optional stale sweep + return processed count; idle backoff in `runAssemblyWorkerLoop`; config readers
- [x] 3.2 Branding: same pattern as assembly
- [x] 3.3 Video: same pattern for `pollActiveVideoJobsBatch` / `runVideoJobWorkerLoop`; leave cron once-batch stale-on-every-tick
- [x] 3.4 Clarify `handle-video-jobs-cron` comment (Fly primary; cron failover); do not change `vercel.json` schedule

## 4. Verify

- [ ] 4.1 Run unit tests for `lib/worker` (+ touched poll config tests if any)
- [ ] 4.2 Typecheck / lint edited files
