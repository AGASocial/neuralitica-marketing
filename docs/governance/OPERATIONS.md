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
- Process groups (one machine each, no public HTTP service):
  - `video` → `node worker/video-jobs.ts` (HeyGen/talking-head job polling)
  - `assembly` → `node worker/assembly-jobs.ts` (FFmpeg assembly)
  - `branding` → `node worker/branding-jobs.ts` (FFmpeg branding/cover)
- Poll modes are set in `fly.toml` `[env]` (`*_JOB_POLL_MODE=fly`); intervals use code defaults unless `*_JOB_POLL_INTERVAL_MS` is set.
- Secrets (set with `fly secrets`, never committed): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `AI_GATEWAY_API_KEY`, `SILICONFLOW_API_KEY`, `SITE_URL`, `NEURAMARK_PROVIDER_ASSET_URL_SECRET`, `NEURAMARK_MEDIA_BACKEND`. Add `HEYGEN_API_KEY`, `FAL_API_KEY`, `REPLICATE_API_TOKEN` when those providers are enabled.

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
