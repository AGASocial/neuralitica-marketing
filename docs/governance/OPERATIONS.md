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

**Decision:** ACCEPTED architecture; **IMPLEMENTATION INCOMPLETE in this repo**.

- No `fly.toml` or `Dockerfile` found under `neuralitica-marketing` as of 2026-09-10.
- Before redesigning: inventory whether Docker/Fly config lives in another AGA Social repo or private ops.
- Do not treat F7 as OPERATIONALLY VALIDATED for worker SC until a real deploy path is documented here.

## Instagram Graph Publish (ADR-0002)

**In V1 scope (D1).** Not yet implemented — track as product completion after READY, not as out-of-scope.
