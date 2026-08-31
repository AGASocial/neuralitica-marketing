Reviewed by FE (Phase A): yes — 2026-08-30 — nextjs-frontend.  
Reviewed by FE (Phase B): **approved** — 2026-08-31 — nextjs-frontend (Assemble enablement + faceless readiness DTO).  
Reviewed by FE (Phase B-M2): **N/A — no FE surface** (PO M2-9 waiver; BUILD unblocked).

# API Contract — US-9.1 Assemble final 9:16 Reel

**Story:** US-9.1  
**Status:** Phase A frozen — 2026-08-30 (Reviewed by FE). **Phase B amendment frozen — 2026-08-31** (Reviewed by FE — approved). **Phase B-M2 section frozen — 2026-08-31** (FE Reviewed **N/A** — BUILD unblocked).  
**Security:** `plan/stories/US-9.1/SECURITY.md` (Phase A + Phase B APPROVE WITH CONDITIONS — 10 Phase B conditions reconciled below)  
**Spec review:** `plan/stories/US-9.1/SPEC-REVIEW.md` (Phase A) · `plan/stories/US-9.1/SPEC-REVIEW-PHASE-B.md` (Phase B GAPS — resolved by § Phase B)  
**Pattern:** `plan/stories/US-8.4/CONTRACT.md` (poll seam, Operator DTOs, forbidden keys, migration SQL verbatim)  
**Depends on:** US-8.4 ✅ primary video jobs + poller · US-9.3 ✅ voiceover assets · US-8.3 ✅ manual primary · US-8.2/8.6 ✅ SadTalker/MuseTalk baked VO · US-5.1 ✅ `target_duration_sec` + `modalidad` · US-6.1 ✅ (sequencing only) · US-14.5 ✅ `requireOperator()` · **US-8.5 ✅** owned `asset_role = broll` (Phase B hard)  
**ADR:** `docs/adr/0003-worker-flyio-ffmpeg.md` — Vercel orchestrator INSERT + enqueue; Fly FFmpeg + status writes  
**Feature branch (Phase A):** `feature/US-9.1-assemble-reel`  
**Feature branch (Phase B):** `feature/US-9.1-phase-b-broll-stitch`  
**Feature branch (Phase B-M2):** `feature/US-9.1-b-m2-assembly-poll-claim` · sprint `US-9.1-B-M2`  
**Error envelope style:** same class as US-8.4 / US-9.3 (`ok: true` vs `{ ok: false, error: { code, fields?, messageKey? } }`)

**This document is CONTRACT ONLY.** Zod mirrors live in `lib/contracts/assembly-job.ts` (BUILD stubs committed with this freeze). Extensions to `lib/contracts/reel-script.ts` (`assemblyByReelScriptId` on week load) and `lib/contracts/media-assets.ts` (`assembled_reel` type + storage regex) are specified here and applied during BUILD.

**Terminology:** **Ensamblado** · **Job de generación** (upstream video) · **Paquete de guion** · **Modalidad de producción** · **download-and-own** · **Reel 9:16** · **Operator**. Technical enums (`assembled_reel`, `reel_v1_basic`, `queued`, `input_fingerprint`) OK in code/Operator diagnostics. Do **not** use CONTEXT _Evitar_ terms in product-facing strings. Do **not** expose FFmpeg command strings, `storage_key`, or temp paths in UI or API DTOs.

**USER_STORIES surface amendment (binding):** Assembly status badges, **Assemble Reel** / **Re-assemble** actions, and preview player render on **`/operator/scripts`** expand row (same pattern as video job + voiceover panels) — **not** a new route. Cliente assemble controls are **out of scope** for US-9.1 BUILD.

---

## SPEC-REVIEW blocking gaps closed

| # | Gap | Resolution |
|---|-----|------------|
| 1 | No US-9.1 CONTRACT.md | This document |
| 2 | Fly worker poll / enqueue seam unspecified | § Poll runtime — `ASSEMBLY_JOB_POLL_MODE`; `worker/assembly-jobs.ts`; `enqueueAssemblyJob` dev seam |
| 3 | FFmpeg filter graph not frozen | § `buildReelV1BasicArgs()` — Phase A 1080×1920 normalize; trim/pad rules; golden unit tests |
| 4 | `assembled_reel` media serve allowlist unset | § Media serve route — extend `GET /api/media/assets/[assetId]` for `assembled_reel` Operator ownership |
| 5 | S3.M10 partial closure undocumented | § Phased BUILD acceptance + VALIDATION note requirement |
| 6 | Story persona vs Phase A scope | § Phased BUILD — Phase A talking-head + manual-primary only; faceless/B-roll Phase B |
| 7 | Orchestrator tenancy + trigger input not frozen | § `createAssemblyJobForReelScript` step table; § Forbidden request keys |
| 8 | Idempotency unique constraint vs re-assemble UX | § Idempotency policy — partial unique index; in-flight return; failed retry semantics |
| 9 | Voice / TTS mux semantics unclear | § Audio rules — primary MP4 audio canonical; voiceover remux edge only |
| 10 | USER_STORIES DB shorthand (`preview_url` / `final_url`) | § DDL — `output_media_asset_id` only; no URL columns |
| 11 | Assembly spend ledger deferred | § Out of scope — no `neuramark_reel_spend_events` in Phase A |

## SECURITY reconciliation (binding)

| Topic | SECURITY condition | **Frozen in this contract** |
|-------|-------------------|----------------------------|
| Trigger input | `{ reelScriptId }` only | § `assembleReelForScript` · § Forbidden request keys |
| Operator gate | `requireOperator("handler")` first | § Orchestrator step 1 · § GET poll · § media serve |
| Script tenancy | `(reelScriptId, client_id)` → 404 | § Orchestrator step 2 |
| Client asset/template override | Reject forbidden keys | § `findForbiddenAssemblyKeys` |
| FFmpeg injection | Args array, no user text Phase A | § `buildReelV1BasicArgs` · § `runAssemblyJob` spawn |
| SSRF | No HTTP fetch at assembly | § Worker Storage SDK only |
| Asset ownership | Verify before enqueue + worker run | § `resolveAssemblyInputs` · § Worker claim |
| `storage_key` regex | Validated before I/O | § Migration CHECK · § `ASSEMBLED_REEL_STORAGE_KEY_REGEX` |
| Status write authority | Worker modules only | § `applyAssemblyJobUpdate` — sole writer |
| IDOR poll GET | `(jobId, client_id)` → 404 | § `GET /api/assembly-jobs/[jobId]` |
| IDOR media serve | Operator + ownership | § Media serve route |
| Idempotency fingerprint | Server-computed only | § Idempotency policy |
| Stale timeout worker-only | Not client-triggered | § Stale-job policy |
| Worker tenancy re-check | Asset `client_id` === job `client_id` | § `runAssemblyJob` pre-download |
| Worker auth | Service-role Storage SDK — not M1 HMAC | § Worker auth note |
| DTO exposure | No paths, keys, ffmpeg argv | § `OperatorAssemblyJobDto` |
| ADR-0003 | No Vercel FFmpeg | § Poll runtime matrix |

---

## Phased BUILD acceptance

| Phase | Scope | Closes |
|-------|-------|--------|
| **A (US-9.1 BUILD — ✅ shipped)** | `neuramark_assembled_reels` migration; `assembled_reel` enum + storage CHECK; `createAssemblyJobForReelScript`; Phase A FFmpeg **`reel_v1_basic`** (1080×1920 normalize/mux); Fly worker loop + dev in-process seam; Operator UI + poll; idempotency; duration ± tolerance AC; SEC guards | USER_STORIES § US-9.1 AC rows (9:16, duration tolerance, idempotency, `[SEC]` FFmpeg + SSRF) |
| **B (US-9.1-B — ✅ shipped)** | Faceless multi-clip B-roll stitch via `build-broll-concat-args`; persist ordered `broll_asset_ids`; fingerprint + `path_tag`; voiceover mux; numeric `cold_open_notes` trim; zero-broll degrade; FE Assemble enablement | SPEC §3 S3.M10 B-roll stitch handoff from US-8.5; same 5 USER_STORIES AC re-validated on stitch path — **no new checkboxes** |
| **B-M2 (US-9.1-B-M2 — this amendment → BUILD next)** | Atomic **`queued` → `processing`** claim via conditional UPDATE + RETURNING; **`idempotent: true`** on lost race; **`runAssemblyJob`** early return before temp / download / FFmpeg; poll batch **`status = 'queued'`** only. **No** FE · **No** DB · **No** new USER_STORIES AC | Closes QA Phase A Finding 1 + QA-PHASE-B Medium #1 — see § Phase B-M2 |

**VALIDATION note (Phase B — binding):** Phase B closes faceless B-roll stitch + optional numeric cold-open. **Residual S3.M10 (document, do not SPEC-amend):** full rewind FX / free-text `editing_hints`; weekly auto-assemble (ADR-0001). Subtitles/logo/cover remain US-9.2 ✅. Do **not** uncheck Phase A AC.

**Partial narrative closure (historical Phase A):** Phase A alone did **not** satisfy “combine voice, avatar/**B-roll**, template, and timing” — Phase B closes the B-roll stitch gap for **faceless** only.

---

## Overview

US-9.1 ships **FFmpeg assembly orchestration + Operator status surfaces** for Instagram-ready **9:16** Reels. Operator triggers **`assembleReelForScript({ reelScriptId })`** on `/operator/scripts`. Vercel resolves inputs, INSERTs **`neuramark_assembled_reels`** (`status = queued`), enqueues worker poll. Fly worker (or dev in-process) downloads owned **`media_assets`**, runs **`buildReelV1BasicArgs()`** via **`spawn('ffmpeg', args, { shell: false })`**, uploads **`assembled_reel`** output, UPDATEs job row.

**Surfaces**

| # | Surface | Kind | Consumer |
|---|---------|------|----------|
| 1 | `createAssemblyJobForReelScript` | Server helper | `assembleReelForScript` · future cron (integrations-engineer) |
| 2 | `assembleReelForScript` | Server Action | `/operator/scripts` — **Assemble Reel** / **Re-assemble** |
| 3 | `getAssemblyJobsForReelScripts` | Server helper | `getReelScriptsForWeek` batch attach |
| 4 | `GET /api/assembly-jobs/[jobId]` | Route Handler | Optional interval poll from expand row |
| 5 | `GET /api/media/assets/[assetId]` (extended) | Route Handler | Operator preview player for `assembled_reel` |
| 6 | `applyAssemblyJobUpdate` | Server helper | Worker + stale sweeper — sole status writer |
| 7 | `runAssemblyJob` | Server helper | Fly worker + dev in-process |
| 8 | `markStaleAssemblyJobsFailed` | Server helper | Fly worker pre-tick |
| 9 | `enqueueAssemblyJob` | Server helper | Dev in-process fire-and-forget |
| 10 | `/operator/scripts` assembly panel | FE | Status badge + preview + assemble actions |

**Forbidden surfaces (BUILD veto):**

- Any Route Handler / Server Action that UPDATEs `neuramark_assembled_reels.status` from request JSON.
- Client-supplied `primaryVideoAssetId`, `voiceoverAssetId`, `templateId`, URLs, `status`, `outputMediaAssetId`, `inputFingerprint`, `scriptUpdatedAt`, `force`, `skipIdempotency`.
- FFmpeg `spawn` / `exec` on Vercel Route Handlers or Server Actions.
- HTTP(S) `fetch` of asset bytes in `lib/assembly/**`.
- Canonical third-party URLs persisted as assembly output (use `output_media_asset_id` only).
- Cliente assemble trigger or Cliente serve of `assembled_reel` in V1.

---

## Migration — `neuramark_assembled_reels` + `assembled_reel` enum

**Migration file (BUILD):** `supabase/migrations/*_neuramark_assembled_reels.sql`

```sql
-- US-9.1: assembly jobs + assembled_reel media type

ALTER TYPE public.neuramark_media_asset_type ADD VALUE IF NOT EXISTS 'assembled_reel';

CREATE TABLE public.neuramark_assembled_reels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.neuramark_clients(id) ON DELETE CASCADE,
  reel_script_id uuid NOT NULL REFERENCES public.neuramark_reel_scripts(id) ON DELETE CASCADE,
  template_id text NOT NULL CHECK (template_id IN ('reel_v1_basic')),
  status text NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  primary_video_asset_id uuid NOT NULL REFERENCES public.neuramark_media_assets(id),
  voiceover_asset_id uuid REFERENCES public.neuramark_media_assets(id),
  output_media_asset_id uuid REFERENCES public.neuramark_media_assets(id),
  script_updated_at timestamptz NOT NULL,
  input_fingerprint text NOT NULL CHECK (char_length(input_fingerprint) = 64),
  target_duration_sec numeric(8, 2) NOT NULL CHECK (target_duration_sec > 0),
  actual_duration_sec numeric(8, 2) CHECK (actual_duration_sec IS NULL OR actual_duration_sec > 0),
  failure_reason text CHECK (failure_reason IS NULL OR char_length(failure_reason) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX neuramark_assembled_reels_client_reel_idx
  ON public.neuramark_assembled_reels (client_id, reel_script_id);

CREATE INDEX neuramark_assembled_reels_status_updated_idx
  ON public.neuramark_assembled_reels (status, updated_at);

CREATE UNIQUE INDEX neuramark_assembled_reels_idempotency_completed_uq
  ON public.neuramark_assembled_reels (client_id, reel_script_id, script_updated_at, input_fingerprint)
  WHERE status = 'completed';

COMMENT ON TABLE public.neuramark_assembled_reels IS
  'FFmpeg assembly jobs (US-9.1). Output via output_media_asset_id — no preview_url/final_url columns.';
```

**Extend `neuramark_media_assets.storage_key` CHECK (same migration):**

```sql
ALTER TABLE public.neuramark_media_assets
  DROP CONSTRAINT IF EXISTS neuramark_media_assets_storage_key_relative_chk;

ALTER TABLE public.neuramark_media_assets
  ADD CONSTRAINT neuramark_media_assets_storage_key_relative_chk
  CHECK (
    storage_key !~ '^/' AND
    storage_key !~ '\\' AND
    storage_key !~ '\.\.' AND
    (
      -- US-3.3 / US-8.3 legacy: single UUID + ext at repo root
      storage_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|mp4|mov)$'
      OR
      -- US-9.3 voiceover: neuramark/{clientId}/{reelScriptId}/{uuid}.mp3|wav|m4a
      storage_key ~ '^neuramark/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(mp3|wav|m4a)$'
      OR
      -- US-9.1 assembled reel: neuramark/{clientId}/{reelScriptId}/assembled-{uuid}.mp4
      storage_key ~ '^neuramark/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/assembled-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp4$'
    )
  );
```

| Column | Rule |
|--------|------|
| `client_id` | **NOT NULL** — every read/write filters tenant |
| `template_id` | Server constant **`reel_v1_basic`** only in V1 — no request override |
| `primary_video_asset_id` | Latest completed primary video job `output_media_asset_id` — server-resolved |
| `voiceover_asset_id` | Latest script-linked **`voiceover`** asset when present — fingerprint + remux edge |
| `output_media_asset_id` | Set on **`completed`** only — FK to `assembled_reel` row |
| `script_updated_at` | Copy of `neuramark_reel_scripts.updated_at` at enqueue — idempotency component |
| `input_fingerprint` | Server `sha256` hex — § Idempotency policy |
| **`preview_url` / `final_url`** | **Forbidden** — download-and-own via `output_media_asset_id` |
| RLS | Deny-by-default; service-role Node + Fly worker only |

**Trigger:** `neuramark_set_updated_at` on UPDATE (same pattern as other `neuramark_*` tables).

**Contract mirror (`lib/contracts/media-assets.ts` BUILD):**

```ts
export const MEDIA_ASSET_TYPE_ASSEMBLED_REEL = "assembled_reel" as const;

/** US-9.1 assembled output keys */
export const ASSEMBLED_REEL_STORAGE_KEY_REGEX =
  /^neuramark\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/assembled-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp4$/;
```

**Output storage key generation (server-only):**

`neuramark/{clientId}/{reelScriptId}/assembled-{uuid}.mp4`

---

## Idempotency policy

**Key triple (per tenant):** `(reel_script_id, script_updated_at, input_fingerprint)`

**Fingerprint (server-only) — Phase A formula (talking-head / primary path):**

```ts
input_fingerprint = sha256(
  primary_video_asset_id + "|" + (voiceover_asset_id ?? "") + "|" + template_id + "|" + "" + "|" + "primary"
).hex(); // 64 lowercase hex chars
```

**Phase B extension (binding — all paths use the same five-part formula):** see § Phase B — Fingerprint + `path_tag`. Empty ordered-broll segment + `path_tag = "primary"` keeps Phase A idempotency buckets stable when no broll ids are persisted.

| Scenario | Behavior |
|----------|----------|
| Completed row exists for triple | Return `{ ok: true, jobId, status: "completed", idempotent: true, outputMediaAssetId }` — **no** new INSERT, **no** FFmpeg |
| `queued` / `processing` row exists for triple | Return `{ ok: true, jobId, status, idempotent: true, inFlight: true }` — **no** duplicate INSERT (concurrent Operator clicks) |
| Prior row **`failed`** for same triple | **Allow** new INSERT — Operator **Re-assemble** after fixing upstream inputs |
| Script `updated_at` changed | New triple → new assembly allowed even if fingerprint unchanged |
| Partial unique index violation on concurrent complete | Loser treats as idempotent read of winner's completed row |

**Client cannot supply:** `inputFingerprint`, `scriptUpdatedAt`, `force`, `skipIdempotency`.

---

## `createAssemblyJobForReelScript()`

**File:** `lib/assembly/create-assembly-job-for-reel-script.ts` (`import "server-only"`)

```ts
export async function createAssemblyJobForReelScript(input: {
  reelScriptId: string;
}): Promise<CreateAssemblyJobForReelScriptResult>;
```

| Step | Action |
|------|--------|
| 1 | `requireOperator("handler")` — resolve `clientId` from session |
| 2 | Load script `WHERE id = $reelScriptId AND client_id = $clientId` — missing → **`NOT_FOUND`** (404 envelope) |
| 3 | Read `target_duration_sec`, `updated_at` → `scriptUpdatedAt`, `modalidad` server-side |
| 4 | **`resolveAssemblyInputs({ clientId, reelScriptId, modalidad })`** — § Input resolution |
| 5 | If inputs incomplete → **`ASSEMBLY_INPUTS_INCOMPLETE`** (no INSERT) |
| 6 | Compute `input_fingerprint` + `template_id = 'reel_v1_basic'` |
| 7 | Idempotency check — § Idempotency policy |
| 8 | INSERT `neuramark_assembled_reels` (`status = queued`, FKs, `script_updated_at`, fingerprint, `target_duration_sec`) |
| 9 | `enqueueAssemblyJob(assemblyJobId)` — § Poll runtime |
| 10 | Return `{ ok: true, jobId, status: "queued", idempotent: false }` |

**Thin Server Action wrapper:**

**File:** `lib/assembly/actions/assemble-reel-for-script.ts` (`"use server"`)

```ts
export async function assembleReelForScript(
  input: AssembleReelForScriptRequest, // { reelScriptId: uuid } strict
): Promise<AssembleReelForScriptResult>;
```

Scan raw input with **`findForbiddenAssemblyKeys`** before Zod parse → **`FORBIDDEN_FIELDS`**.

---

## `resolveAssemblyInputs()`

**File:** `lib/assembly/resolve-assembly-inputs.ts` (`import "server-only"`)

```ts
export async function resolveAssemblyInputs(input: {
  clientId: string;
  reelScriptId: string;
  modalidad: ReelScriptModalidad;
}): Promise<
  | { ok: true; primaryVideoAssetId: string; voiceoverAssetId: string | null; remuxVoiceover: boolean }
  | { ok: false; code: "ASSEMBLY_INPUTS_INCOMPLETE"; messageKey: string }
>;
```

| Step | Action |
|------|--------|
| 1 | Latest **completed** primary video job for `(client_id, reel_script_id, asset_role = 'primary')` ordered by `created_at DESC` |
| 2 | Require `output_media_asset_id IS NOT NULL` and job `status = completed` |
| 3 | Verify primary asset row `WHERE id = $1 AND client_id = $clientId` |
| 4 | Latest **`voiceover`** asset for script (metadata `reelScriptId` match or job lineage — same rule as US-9.3 batch map) when present |
| 5 | Verify voiceover asset ownership when set |
| 6 | **Phase A modalidad gate (superseded for faceless by Phase B):** `modalidad = faceless` without completed primary **and** without completed broll → **`ASSEMBLY_INPUTS_INCOMPLETE`** + faceless messageKey — see § Phase B degrade |
| 7 | **`remuxVoiceover`:** `false` when primary probe reports audio stream; `true` when **no audio stream** — then **require** voiceover asset or **`ASSEMBLY_INPUTS_INCOMPLETE`** + `scripts.assembly.errors.missingAudio` |

**Phase B:** faceless resolve + broll ordering + path selection — § Phase B — `resolveAssemblyInputs` extension.

---

## Audio rules (US-9.3 handoff)

| Path | Canonical audio | `voiceover_asset_id` on assembly row | FFmpeg inputs |
|------|-----------------|--------------------------------------|---------------|
| Talking-head (`own_avatar`, `generic_avatar`) — SadTalker/MuseTalk primary | **Primary MP4 audio track** (VO pre-baked per US-9.3 → US-8.4) | Latest script voiceover when present — **fingerprint only** | Single `-i primary.mp4` when probe has audio |
| Manual primary (`provider_key = manual`) with audio | Primary MP4 audio | Voiceover FK when present — fingerprint | Single `-i primary.mp4` |
| Manual primary **without** audio stream | **Remux latest voiceover** | Required — fingerprint + mux | `-i primary.mp4 -i voiceover.{mp3,wav,m4a}` + map voiceover to AAC |

**Probe:** `lib/assembly/probe-media-streams.ts` — detect audio stream presence (extend mp4box/ffprobe pattern; unit-test fixtures).

**Forbidden:** Double-mux voiceover when primary already has audio. Passing script `voiceover_text` or notes into FFmpeg args.

---

## `applyAssemblyJobUpdate` — sole status writer

**File:** `lib/assembly/apply-assembly-job-update.ts` (`import "server-only"`)

```ts
export async function applyAssemblyJobUpdate(input: {
  assemblyJobId: string;
  patch: AssemblyJobStatusPatch;
  source: "worker" | "stale_sweeper";
}): Promise<ApplyAssemblyJobUpdateResult>;
```

**Allowed transitions (sticky terminal):**

| From | To |
|------|-----|
| `queued` | `processing`, `failed` |
| `processing` | `completed`, `failed` |
| `completed` | *(none — idempotent no-op)* |
| `failed` | *(none — re-assemble creates **new** row)* |

**Behavior:**

1. Load job row (service-role).
2. If current status is terminal → return `{ ok: true, idempotent: true }`.
3. On first transition to **`processing`:** set `updated_at`.
4. On **`completed`:** require `output_media_asset_id`, `actual_duration_sec`; guard at-most-once complete.
5. On **`failed`:** persist `failure_reason` = sanitized code/message only (max 2000).
6. UPDATE `status`, `output_media_asset_id`, `actual_duration_sec`, `failure_reason`, `updated_at`.

**Only invokers:** `runAssemblyJob`, `markStaleAssemblyJobsFailed`. **Zero** browser-callable paths.

---

## Poll runtime — Fly worker vs dev in-process

**Env:**

| Variable | Default | Purpose |
|----------|---------|---------|
| `ASSEMBLY_JOB_POLL_MODE` | `fly` in production | `in_process` \| `fly` |
| `ASSEMBLY_JOB_POLL_INTERVAL_MS` | `3000` | Delay between worker batch ticks |
| `NEURAMARK_ASSEMBLY_STALE_TIMEOUT_MIN` | `30` | Stale sweeper threshold (minutes) |
| `NEURAMARK_ASSEMBLY_DURATION_TOLERANCE_SEC` | `2` | Output duration vs `target_duration_sec` |

### Production (ADR-0003) — `ASSEMBLY_JOB_POLL_MODE=fly`

```
┌─────────────┐  assembleReelForScript / createAssemblyJob…  ┌───────────────────────┐
│ Vercel App  │ ─────────────────────────────────────────► │ neuramark_assembled   │
│             │  INSERT status=queued                      │ _reels                │
└─────────────┘                                              └──────────┬────────────┘
                                                                        │
                                                                        │ worker loop:
                                                                        │ SELECT … WHERE status IN ('queued','processing')
                                                                        │ FOR UPDATE SKIP LOCKED
                                                                        ▼
                                                               ┌───────────────────────┐
                                                               │ Fly.io worker         │
                                                               │ worker/assembly-jobs  │
                                                               │ runAssemblyJob + stale│
                                                               └───────────────────────┘
```

| Rule | Detail |
|------|--------|
| Enqueue | **No separate queue table in V1** — Fly worker long-polls `neuramark_assembled_reels` where `status IN ('queued','processing')` ordered by `updated_at` |
| Create on Vercel | After INSERT, return immediately — **do not** block HTTP on FFmpeg |
| Worker env | `SUPABASE_SERVICE_ROLE`, Storage bucket, FFmpeg binary on Fly image |
| Stale sweep | `markStaleAssemblyJobsFailed()` each worker tick **before** job claim |
| Region | Deploy **`iad`** (SPEC §6) — document in worker README / fly.toml |

### Dev — `ASSEMBLY_JOB_POLL_MODE=in_process`

**File:** `lib/assembly/enqueue-assembly-job.ts` (mirror `lib/video-jobs/enqueue-video-job-poll.ts`)

| Rule | Detail |
|------|--------|
| Trigger | After successful INSERT, `void runAssemblyJob(assemblyJobId)` — fire-and-forget async in Node |
| Scope | Local / preview only when Fly worker absent |
| Guard | Must **not** `await` unbounded FFmpeg inside Route Handler chain on Vercel serverless |
| Security | Same ownership, spawn, and Storage rules as Fly — **not** a bypass |

### Worker entry

**File:** `worker/assembly-jobs.ts` (mirror `worker/video-jobs.ts`)

```ts
// ASSEMBLY_JOB_POLL_MODE=fly → runAssemblyWorkerLoop()
// else → one-shot batch for local smoke
```

**ADR-0003 runtime matrix:**

| Method | Runtime |
|--------|---------|
| `createAssemblyJobForReelScript` / `assembleReelForScript` | Vercel |
| FFmpeg `spawn` | Fly worker (prod) · dev in-process |
| Storage download/upload | Fly worker (prod) · dev in-process |
| `markStaleAssemblyJobsFailed` | Fly worker loop |
| `GET /api/assembly-jobs/[jobId]` | Vercel |

**Worker auth note:** Assembly worker uses **service-role Storage SDK** — **does not** use M1 `/api/media/provider-assets` HMAC URLs (external vendor pattern only).

---

## Stale-job policy

**File:** `lib/assembly/mark-stale-assembly-jobs-failed.ts` (`import "server-only"`)

```ts
export async function markStaleAssemblyJobsFailed(): Promise<{ markedCount: number }>;
```

| Rule | Detail |
|------|--------|
| Predicate | `status IN ('queued','processing') AND updated_at < now() - (NEURAMARK_ASSEMBLY_STALE_TIMEOUT_MIN * interval '1 minute')` |
| Action | `applyAssemblyJobUpdate` → `failed` + `failure_reason` = i18n key **`scripts.assembly.failure.staleTimeout`** |
| Authority | Worker loop only — **not** client-callable |

---

## `runAssemblyJob()`

**File:** `lib/assembly/run-assembly-job.ts` (`import "server-only"`)

| Step | Action |
|------|--------|
| 1 | Claim row: transition `queued` → `processing` via `applyAssemblyJobUpdate` (or claim in same transaction with `FOR UPDATE SKIP LOCKED`) |
| 2 | Re-load job + script context |
| 3 | Re-verify `primary_video_asset_id` (+ `voiceover_asset_id` if set) **`client_id === job.client_id`** — mismatch → `failed` sanitized, **no** spawn |
| 4 | Create temp dir **`/tmp/neuramark-assembly/{assemblyJobId}/`** |
| 5 | Download inputs via **`getMediaStorage()`** to fixed basenames: `primary.mp4`, optional `voiceover.{ext}` |
| 6 | Probe primary duration + audio stream presence |
| 7 | `buildReelV1BasicArgs({ ... })` → `string[]` |
| 8 | `spawn('ffmpeg', args, { shell: false })` — await exit code 0 |
| 9 | Probe output duration — must satisfy **`abs(actual - target) <= NEURAMARK_ASSEMBLY_DURATION_TOLERANCE_SEC`** |
| 10 | Upload to server-generated `storage_key` → `insertAssembledReelMediaAsset()` |
| 11 | `applyAssemblyJobUpdate` → `completed` with `output_media_asset_id`, `actual_duration_sec` |
| 12 | `finally`: delete temp tree; do not log full stderr / storage keys in production |

**On failure:** `applyAssemblyJobUpdate` → `failed` + sanitized `failure_reason` (FFmpeg non-zero, probe fail, duration out of tolerance, storage error).

---

## `buildReelV1BasicArgs()` — Phase A filter graph

**File:** `lib/assembly/ffmpeg/build-reel-v1-basic-args.ts` (pure — no spawn)

```ts
export function buildReelV1BasicArgs(input: {
  localPrimaryPath: string;
  localOutputPath: string;
  localVoiceoverPath?: string;
  remuxVoiceover: boolean;
  primaryDurationSec: number;
  targetDurationSec: number;
  toleranceSec: number;
}): string[];
```

**Frozen constants (Phase A):**

| Constant | Value |
|----------|-------|
| Output size | **1080×1920** (9:16) |
| Video codec | **libx264** (`-preset veryfast`, `-crf 23`) |
| Audio codec | **aac** (`-b:a 128k`) |
| Pixel format | **yuv420p** |
| Video filter (base) | `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920` |

**Duration rules:**

| Condition | Behavior |
|-----------|----------|
| `primaryDurationSec > targetDurationSec + toleranceSec` | Trim: `-t {targetDurationSec}` on output (after filters) |
| `primaryDurationSec < targetDurationSec - toleranceSec` | Pad video: `tpad=stop_mode=add:stop_duration={padSec}`; pad audio: `apad=pad_dur={padSec}` where `padSec = targetDurationSec - primaryDurationSec` |
| Within tolerance band | No trim/pad beyond filter graph normalize |

**Input mapping:**

| `remuxVoiceover` | Args pattern |
|------------------|--------------|
| `false` | `-i {localPrimaryPath}` — map `0:v:0` + `0:a:0?` (optional audio) |
| `true` | `-i {localPrimaryPath} -i {localVoiceoverPath}` — video from 0, audio from 1 |

**Phase A forbidden in args:** `-drawtext`, subtitle file paths, script text, dynamic filenames from user input, shell metacharacters.

**Example snapshot (trim path, audio in primary):**

```json
[
  "-y",
  "-i", "/tmp/neuramark-assembly/{jobId}/primary.mp4",
  "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "128k",
  "-t", "30",
  "/tmp/neuramark-assembly/{jobId}/output.mp4"
]
```

Unit tests: golden snapshots for trim, pad, remux, and no-audio edge cases.

**Phase B:** `lib/assembly/ffmpeg/build-broll-concat-args.ts` — § Phase B — `buildBrollConcatArgs()` (concat demuxer; same spawn + ownership floors).

---

## `insertAssembledReelMediaAsset()`

**File:** `lib/assembly/insert-assembled-reel-media-asset.ts` (`import "server-only"`)

Mirror `insert-generated-video-media-asset.ts` / `insert-voiceover-media-asset.ts`.

| Field | Value |
|-------|-------|
| `asset_type` | `assembled_reel` |
| `storage_key` | `neuramark/{clientId}/{reelScriptId}/assembled-{uuid}.mp4` |
| `metadata` | `assembledReelAssetMetadataSchema` — `detectedMime: video/mp4`, `sizeBytes`, `durationSec`, `width: 1080`, `height: 1920`, `source: "assembly_ffmpeg"`, `templateId: "reel_v1_basic"`, `assemblyJobId` |

**Forbidden in metadata:** FFmpeg argv, stderr, raw storage paths.

---

## `GET /api/assembly-jobs/[jobId]`

**File:** `app/api/assembly-jobs/[jobId]/route.ts`  
**Method:** **GET only**

| Rule | Detail |
|------|--------|
| Auth | `requireOperator("handler")` first |
| Scope | `WHERE id = $1 AND client_id = $2` — operator session `clientId` |
| Foreign/missing | **404** generic envelope |
| Response | `operatorAssemblyJobStatusDtoSchema` |

**DTO fields:** `jobId`, `reelScriptId`, `status`, `templateId`, `targetDurationSec`, `actualDurationSec`, `outputMediaAssetId`, `failureReason`, `idempotent` N/A on poll, `createdAt`, `updatedAt`, `canReassemble` (derived — true when terminal failed or script/inputs changed since last complete).

**Forbidden in DTO:** `storage_key`, `ffmpegArgs`, temp paths, `input_fingerprint` (optional omit — diagnostics only if included in batch map, never from poll alone), stderr.

---

## Batch assembly on scripts week load

**File:** `lib/assembly/get-assembly-jobs-for-reel-scripts.ts`  
**Called from:** `getReelScriptsForWeek` after `requireOperator`

**Extend** `getReelScriptsForWeekSuccessSchema`:

```ts
assemblyByReelScriptId: operatorAssemblyJobsByReelMapSchema;
// Record<reelScriptId, OperatorAssemblyJobDto | null>
```

**Selection rule per `reelScriptId`:** latest assembly row by `created_at DESC` for `(client_id, reel_script_id)`.

**FE (`/operator/scripts`):**

| Element | Source |
|---------|--------|
| Expand row assembly panel | `assemblyByReelScriptId[scriptId]` |
| Status badge | `status` |
| **Assemble Reel** | enabled when primary video job `completed` (UI convenience) |
| **Re-assemble** | when script changed or prior `failed` — confirm dialog |
| Preview `<video>` | `/api/media/assets/{outputMediaAssetId}` when `completed` |
| Optional poll | 5s `GET /api/assembly-jobs/[jobId]` while `queued`/`processing` |

**i18n:** `scripts.assembly.*` — EN + ES per TASKS.

---

## `OperatorAssemblyJobDto`

**Schema:** `operatorAssemblyJobDtoSchema` in `lib/contracts/assembly-job.ts`

```ts
{
  jobId: string;                    // uuid
  reelScriptId: string;             // uuid
  status: "queued" | "processing" | "completed" | "failed";
  templateId: "reel_v1_basic";
  targetDurationSec: number;
  actualDurationSec: number | null;
  outputMediaAssetId: string | null;
  failureReason: string | null;     // sanitized
  canAssemble: boolean;             // server-derived — inputs complete + no in-flight blocking UX
  canReassemble: boolean;
  createdAt: string;                // ISO datetime
  updatedAt: string;
}
```

**No cost fields** — assembly spend ledger out of scope (US-7.3 Phase B).

**Preview URL (FE-derived):** when `outputMediaAssetId` set → `/api/media/assets/{uuid}` — not stored on DTO as absolute third-party URL.

---

## Media serve route — `assembled_reel`

**File:** `app/api/media/assets/[assetId]/route.ts` (extend existing)

Add branch for `asset_type === MEDIA_ASSET_TYPE_ASSEMBLED_REEL`:

| Rule | Detail |
|------|--------|
| Auth | `requireOperator("handler")` |
| Ownership | `row.client_id === operator.id` else **404** |
| MIME | `video/mp4` from metadata |
| Headers | `Cache-Control: private, no-store`; sanitized `Content-Disposition` |
| Cliente | **Not** served in US-9.1 V1 — US-11.1 may widen later (additive auth change) |

Confirm existing **`generated_video`** + **`voiceover`** Operator branches unchanged.

---

## Forbidden request keys

**File:** `lib/assembly/find-forbidden-assembly-keys.ts`

Reject with **`FORBIDDEN_FIELDS`**:

```ts
export const FORBIDDEN_ASSEMBLY_AUTHORITY_KEYS = [
  "primaryVideoAssetId",
  "primary_video_asset_id",
  "voiceoverAssetId",
  "voiceover_asset_id",
  "templateId",
  "template_id",
  "clientId",
  "client_id",
  "status",
  "outputMediaAssetId",
  "output_media_asset_id",
  "inputFingerprint",
  "input_fingerprint",
  "scriptUpdatedAt",
  "script_updated_at",
  "force",
  "skipIdempotency",
  "skip_idempotency",
  "outputUrl",
  "output_url",
  "previewUrl",
  "preview_url",
  "finalUrl",
  "final_url",
  // any http(s) URL keys
  "primaryVideoUrl",
  "voiceoverUrl",
  "assetUrl",
] as const;
```

---

## Error codes

`assemblyJobErrorCodeSchema`:

| Code | When |
|------|------|
| `UNAUTHENTICATED` | No session |
| `FORBIDDEN` | Non-operator |
| `NOT_FOUND` | Foreign script or job id (404) |
| `VALIDATION_ERROR` | Zod / field errors |
| `FORBIDDEN_FIELDS` | Rejected authority keys |
| `ASSEMBLY_INPUTS_INCOMPLETE` | Missing primary, faceless Phase A block, missing voiceover for no-audio primary |
| `ASSEMBLY_IN_PROGRESS` | *(reserved — prefer idempotent in-flight return; use only if PO opts into explicit error)* |
| `INTERNAL_ERROR` | Unexpected |

---

## `lib/contracts/assembly-job.ts` mirror (BUILD)

**New file** — FE imports types/constants only.

| Export | Purpose |
|--------|---------|
| `ASSEMBLY_TEMPLATE_REEL_V1_BASIC` | `"reel_v1_basic"` |
| `assemblyJobStatusSchema` | `queued` \| `processing` \| `completed` \| `failed` |
| `assembleReelForScriptRequestSchema` | `{ reelScriptId: uuid }` strict |
| `assembleReelForScriptSuccessSchema` | `{ ok: true, jobId, status, idempotent, outputMediaAssetId?, inFlight? }` |
| `assemblyJobErrorCodeSchema` | § Error codes |
| `assemblyJobMutationErrorSchema` | standard envelope |
| `operatorAssemblyJobDtoSchema` | § OperatorAssemblyJobDto |
| `operatorAssemblyJobStatusDtoSchema` | poll route subset |
| `operatorAssemblyJobsByReelMapSchema` | batch map |
| `FORBIDDEN_ASSEMBLY_AUTHORITY_KEYS` | § Forbidden keys |
| `assembledReelAssetMetadataSchema` | output media metadata |
| Env defaults | `NEURAMARK_ASSEMBLY_DURATION_TOLERANCE_SEC_DEFAULT = 2`, `NEURAMARK_ASSEMBLY_STALE_TIMEOUT_MIN_DEFAULT = 30`, `ASSEMBLY_JOB_POLL_INTERVAL_MS_DEFAULT = 3000` |

**Extend** `lib/contracts/reel-script.ts`:

```ts
assemblyByReelScriptId: operatorAssemblyJobsByReelMapSchema;
```

---

## Fixtures (mock payloads)

### Assemble success (new job)

```json
{
  "ok": true,
  "jobId": "c3d4e5f6-a7b8-9012-cdef-123456789abc",
  "status": "queued",
  "idempotent": false
}
```

### Assemble idempotent (completed exists)

```json
{
  "ok": true,
  "jobId": "c3d4e5f6-a7b8-9012-cdef-123456789abc",
  "status": "completed",
  "idempotent": true,
  "outputMediaAssetId": "d4e5f6a7-b8c9-0123-def0-23456789abcd"
}
```

### Inputs incomplete (faceless Phase A)

```json
{
  "ok": false,
  "error": {
    "code": "ASSEMBLY_INPUTS_INCOMPLETE",
    "messageKey": "scripts.assembly.errors.facelessNoPrimary"
  }
}
```

### Operator week batch snippet

```json
{
  "assemblyByReelScriptId": {
    "f47ac10b-58cc-4372-a567-0e02b2c3d479": {
      "jobId": "c3d4e5f6-a7b8-9012-cdef-123456789abc",
      "reelScriptId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "status": "completed",
      "templateId": "reel_v1_basic",
      "targetDurationSec": 30,
      "actualDurationSec": 29.8,
      "outputMediaAssetId": "d4e5f6a7-b8c9-0123-def0-23456789abcd",
      "failureReason": null,
      "canAssemble": false,
      "canReassemble": true,
      "createdAt": "2026-08-30T15:00:00.000Z",
      "updatedAt": "2026-08-30T15:02:00.000Z"
    }
  }
}
```

### GET `/api/assembly-jobs/[jobId]` (processing)

```json
{
  "jobId": "c3d4e5f6-a7b8-9012-cdef-123456789abc",
  "reelScriptId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "status": "processing",
  "templateId": "reel_v1_basic",
  "targetDurationSec": 30,
  "actualDurationSec": null,
  "outputMediaAssetId": null,
  "failureReason": null,
  "canReassemble": false,
  "createdAt": "2026-08-30T15:00:00.000Z",
  "updatedAt": "2026-08-30T15:00:05.000Z"
}
```

---

## Security test matrix (BUILD)

| Test | Expect |
|------|--------|
| Forbidden `primaryVideoAssetId` on assemble | `FORBIDDEN_FIELDS` |
| Cliente `assembleReelForScript` | `403` |
| Foreign `reelScriptId` | `404` |
| Foreign assembly job GET | `404` |
| Foreign `assembled_reel` media serve | `404` |
| `buildReelV1BasicArgs` golden snapshots | no shell metacharacters |
| Mocked spawn receives `string[]`, `shell: false` | pass |
| Grep: no `UPDATE neuramark_assembled_reels` outside `lib/assembly/**` | pass |
| Grep: no `fetch(` for asset download in `lib/assembly/**` | pass |
| Worker cross-tenant asset ids | `failed` without spawn |

---

## Out of scope (explicit)

- **US-9.2** subtitles, logo, cover (second FFmpeg pass on assembled base)
- **US-8.5** Wan B-roll adapter / `createBrollVideoJobs` body (consume owned clips only)
- **Talking-head B-roll overlays** — Phase B stitch is **faceless-only**
- **Full rewind FX / free-text `editing_hints`** — residual S3.M10 after Phase B
- **US-10.1** QA agent · **US-11.x** approval/publish (Cliente serve widening)
- **Weekly cycle** auto-assemble (integrations-engineer / ADR-0001)
- **Cliente** assemble trigger
- **Multiple templates** / template admin UI
- **Preview vs final dual renditions** — single output asset
- **Assembly spend ledger** (`neuramark_reel_spend_events`) — optional `$0` stub not in Phase A
- **RBAC** beyond `requireOperator()`
- **Live FFmpeg in CI** — args builder unit tests + mocked spawn only
- **SiliconFlow CDN fetch at assembly** — owned Storage keys only
- **New assemble Route Handler / story ID** — same US-9.1; same `{ reelScriptId }` trigger

---

## Reviewed by FE (Phase A)

**Reviewed by FE** — 2026-08-30 (nextjs-frontend)

Assembly panel on `/operator/scripts` expand row is implementable against this contract:

- **Surface:** Same `ReelDetailPanel` placement as `OperatorVideoJobSummaryPanel` / `OperatorVoiceoverPanel` — no new route.
- **Batch load:** `assemblyByReelScriptId` mirrors `videoJobsByReelScriptId`; null entry + completed primary video job gates initial **Assemble Reel**.
- **Mutate:** `assembleReelForScript({ reelScriptId })` only — no forbidden authority keys from FE.
- **Poll:** Client interval poll via `GET /api/assembly-jobs/[jobId]` while `queued`/`processing`; merge polled fields into batch DTO (preserve `canAssemble` when omitted from poll subset); use `ASSEMBLY_JOB_POLL_INTERVAL_MS_DEFAULT` (3000 ms), not the §562 “5s” prose.
- **Preview:** `<video src="/api/media/assets/{outputMediaAssetId}">` when `completed` — same authenticated serve pattern as voiceover `<audio>`.
- **Errors:** Map `ASSEMBLY_INPUTS_INCOMPLETE` + `messageKey` (`facelessNoPrimary`, `missingAudio`); resolve `failureReason` i18n keys (e.g. `scripts.assembly.failure.staleTimeout`) like video job stale timeout.
- **Re-assemble:** Confirm dialog before mutate when `canReassemble`; follow `VideoJobRetryConfirmDialog` pattern (i18n keys to add at BUILD).
- **i18n:** `scripts.assembly.*` EN + ES — TASKS baseline keys plus CONTRACT `messageKey` / `failureReason` keys.
- **Out of scope:** No Cliente routes, cost fields, or FFmpeg details in UI.

---

# Phase B — Faceless B-roll stitch (frozen 2026-08-31)

**Sprint label:** `US-9.1-B`  
**Sources:** `PHASE-B.md` B1–B14 · `SPEC-REVIEW-PHASE-B.md` · `SECURITY.md` Phase B (10 conditions) · US-8.5 CONTRACT § US-9.1 Phase B handoff  
**Phase A floors remain binding** — Phase B extends; does not weaken spawn, SSRF, Operator gate, IDOR, or DTO closure.  
**Reviewed by FE (Phase B):** **approved** — 2026-08-31 — nextjs-frontend.

### SECURITY Phase B reconciliation (10 conditions)

| # | Condition | Frozen here |
|---|-----------|-------------|
| 1 | Anti–shell-injection | § `buildBrollConcatArgs` · spawn `shell: false` |
| 2 | Anti–filtergraph-text-injection | Argv = temp paths + numerics only |
| 3 | Anti–multi-clip-IDOR | Ownership on every broll + voiceover |
| 4 | Anti–client-path/URL-authority | Extended `FORBIDDEN_FIELDS` · `{ reelScriptId }` only |
| 5 | Anti–SSRF-at-stitch | Storage SDK only — no CDN/`fetch(` |
| 6 | Anti–cold-open-string-passthrough | § `parseColdOpenTrimSec` |
| 7 | Anti–degrade-secret-leak | Sanitized messageKeys only |
| 8 | Anti–Cliente-trigger | `requireOperator("handler")` first (re-assert) |
| 9 | Anti–modality-confused-deputy | Faceless-only stitch; talking-head ignores broll |
| 10 | Anti–fingerprint-forgery | Server-only fingerprint + `path_tag` |

---

## Phase B — DDL delta (lineage for clip-set determinism)

**Choice (binding — Option A):** **Persist ordered broll media asset ids on the assembly row at enqueue.** Worker **replays those ids only** — does **not** re-resolve completed broll jobs at run time (avoids late Wan completion changing the stitch set / fingerprint skew).

**Migration file (BUILD):** `supabase/migrations/*_neuramark_assembled_reels_phase_b_broll.sql`

```sql
-- US-9.1 Phase B: nullable primary for stitch-only + persisted broll clip set

ALTER TABLE public.neuramark_assembled_reels
  ALTER COLUMN primary_video_asset_id DROP NOT NULL;

ALTER TABLE public.neuramark_assembled_reels
  ADD COLUMN IF NOT EXISTS broll_asset_ids uuid[] NULL;

ALTER TABLE public.neuramark_assembled_reels
  ADD COLUMN IF NOT EXISTS assembly_path_tag text NOT NULL DEFAULT 'primary'
  CHECK (assembly_path_tag IN ('primary', 'broll_stitch'));

-- Path consistency: primary path requires primary FK; stitch path requires 1..8 broll ids
ALTER TABLE public.neuramark_assembled_reels
  DROP CONSTRAINT IF EXISTS neuramark_assembled_reels_path_inputs_chk;

ALTER TABLE public.neuramark_assembled_reels
  ADD CONSTRAINT neuramark_assembled_reels_path_inputs_chk
  CHECK (
    (
      assembly_path_tag = 'primary'
      AND primary_video_asset_id IS NOT NULL
      AND (broll_asset_ids IS NULL OR cardinality(broll_asset_ids) = 0)
    )
    OR
    (
      assembly_path_tag = 'broll_stitch'
      AND broll_asset_ids IS NOT NULL
      AND cardinality(broll_asset_ids) BETWEEN 1 AND 8
    )
  );

COMMENT ON COLUMN public.neuramark_assembled_reels.broll_asset_ids IS
  'US-9.1 Phase B: ordered owned broll media asset ids frozen at enqueue (created_at ASC, max 8). Worker replay source.';
COMMENT ON COLUMN public.neuramark_assembled_reels.assembly_path_tag IS
  'US-9.1 Phase B: server path — primary | broll_stitch. Mirrors fingerprint path_tag; not client-writable.';
```

| Column | Rule |
|--------|------|
| `primary_video_asset_id` | **Nullable** after Phase B. Required when `assembly_path_tag = 'primary'`. Null allowed on stitch-only faceless (no manual primary). |
| `broll_asset_ids` | Ordered uuid[] — **server-written at enqueue**; max **8**; worker download order = array order |
| `assembly_path_tag` | Exact enum strings **`primary`** \| **`broll_stitch`** — server-only |

**No other new tables.** Output remains `asset_type = assembled_reel` (downstream US-9.2/10.1/11.1 unchanged).

---

## Phase B — Fingerprint + `path_tag`

**Exact strings (frozen):**

| Constant | Value |
|----------|-------|
| `ASSEMBLY_PATH_TAG_PRIMARY` | `"primary"` |
| `ASSEMBLY_PATH_TAG_BROLL_STITCH` | `"broll_stitch"` |
| Delimiter | `"\|"` (ASCII pipe) between the five segments |
| Broll-id join | `","` (comma) between ordered uuids — **empty string** when no broll ids |

**Formula (server-only — all assembly paths):**

```ts
input_fingerprint = sha256(
  (primary_video_asset_id ?? "") + "|" +
  (voiceover_asset_id ?? "") + "|" +
  template_id + "|" +                    // always "reel_v1_basic"
  ordered_broll_asset_ids.join(",") + "|" + // "" when primary path
  path_tag                                 // "primary" | "broll_stitch"
).hex(); // 64 lowercase hex
```

| Path | `path_tag` | `ordered_broll_asset_ids` | Primary FK |
|------|------------|---------------------------|------------|
| Talking-head / manual primary / faceless **degrade** | `primary` | `[]` | required |
| Faceless stitch (≥1 completed broll) | `broll_stitch` | 1..8 ids in resolve order | optional (null if none) |

**Client cannot supply** `path_tag`, `assembly_path_tag`, `broll_asset_ids`, or `input_fingerprint`.

---

## Phase B — `resolveAssemblyInputs` extension

**File:** `lib/assembly/resolve-assembly-inputs.ts` (extend)

**Extended success shape:**

```ts
| {
    ok: true;
    pathTag: "primary" | "broll_stitch";
    primaryVideoAssetId: string | null;
    brollAssetIds: string[];           // ordered; length 0..8
    voiceoverAssetId: string | null;
    remuxVoiceover: boolean;
    coldOpenTrimSec: number | null;    // from parseColdOpenTrimSec; null = skip
  }
```

### Resolve rules (binding)

| # | Rule |
|---|------|
| R1 | Load script `modalidad` server-side (already in orchestrator). |
| R2 | **Talking-head** (`own_avatar` \| `generic_avatar`): **always** Phase A primary path — **ignore** all broll jobs/assets even if present. `pathTag = "primary"`. |
| R3 | **Faceless** (`modalidad === "faceless"`): query completed `neuramark_video_jobs` for `(client_id, reel_script_id, asset_role = 'broll', status = 'completed', output_media_asset_id IS NOT NULL)` ordered by **`created_at ASC`**, take first **8**. |
| R4 | For each candidate: verify `media_assets` row `WHERE id = output_media_asset_id AND client_id = $clientId`. Skip / fail-closed any mismatch (do not include foreign ids). |
| R5 | **Never wait** for `queued` / `failed` / `processing` broll jobs. Partial completed subsets stitch as-is. |
| R6 | Align count with `brollBeats.length` for **metadata/fingerprint diagnostics only** when beats exist — **never** parse beat text into FFmpeg. |
| R7 | If faceless **and** `brollAssetIds.length >= 1` → `pathTag = "broll_stitch"`; set voiceover per § Faceless voiceover rules; parse cold-open. |
| R8 | If faceless **and** zero completed broll → **degrade** (§ Degrade rules). |
| R9 | Failed/queued Wan jobs **never** block assembly (product + SEC degrade hygiene). |

### Degrade rules (zero completed broll)

| Condition | Result |
|-----------|--------|
| Faceless + 0 broll + completed owned **primary** (e.g. manual US-8.3) | `pathTag = "primary"` — Phase A normalize path (`buildReelV1BasicArgs`) |
| Faceless + 0 broll + **no** primary | `ASSEMBLY_INPUTS_INCOMPLETE` + `messageKey: scripts.assembly.errors.facelessWaitingForClips` |
| Talking-head + missing primary | Unchanged Phase A incomplete (`missing primary` / existing keys) |

**Operator-visible errors:** sanitized codes + i18n keys only — **no** vendor bodies, Bearer tokens, argv, temp paths, `storage_key`, or CDN URLs (US-8.5 degrade parity).

---

## Phase B — Faceless voiceover rules

| Path | Voiceover required? | `voiceover_asset_id` | FFmpeg |
|------|---------------------|----------------------|--------|
| `broll_stitch` | **Always required** — Wan/broll clips are not relied on for VO; stitch path always muxes latest owned script **`voiceover`** | Required FK — fingerprint + mux | After concat/normalize video: remux voiceover → AAC (same codecs as Phase A) |
| `broll_stitch` missing voiceover | **`ASSEMBLY_INPUTS_INCOMPLETE`** + `scripts.assembly.errors.facelessMissingVoiceover` — no INSERT | — | — |
| Faceless **degrade** → `primary` | Phase A audio table (probe primary; remux only if no audio stream) | Per Phase A | `buildReelV1BasicArgs` |
| Talking-head | Phase A (baked primary audio canonical) | Fingerprint / remux edge only | Phase A |

**Forbidden:** Double-mux when degrade-primary already has audio. Passing `voiceover_text` / notes into argv. Assuming concat video audio is usable for faceless VO.

---

## Phase B — `parseColdOpenTrimSec`

**File:** `lib/assembly/parse-cold-open-trim-sec.ts` (pure)

```ts
export function parseColdOpenTrimSec(input: {
  coldOpenNotes: string | null | undefined;
  targetDurationSec: number;
}): number | null;
```

| Rule | Detail |
|------|--------|
| Source | Script `cold_open_notes` only (server-loaded) |
| Accept regex | Full-string match **`/^\d{1,2}$/`** after trim (0–99 digits only) |
| Bounds | Integer `n` with **`0 <= n <= min(30, floor(targetDurationSec))`**. `0` → treat as **skip** (`null`) |
| Unparsable / out of bounds / empty | Return **`null`** — **skip trim** (never fail-open into argv) |
| Into builder | Pass **number** `coldOpenTrimSec` only — **never** raw notes string |
| Out of scope | Rewind FX, free-text filters, playbook/trend text in argv |

---

## Phase B — `buildBrollConcatArgs()` seam

**File:** `lib/assembly/ffmpeg/build-broll-concat-args.ts` (pure — **no** spawn)

**Approach (frozen):** FFmpeg **concat demuxer** (`-f concat -safe 0 -i {concatListPath}`) over server-written `concat.txt`, then same **1080×1920** normalize + duration trim/pad + voiceover mux as Phase A codecs. **Not** `filter_complex` concat in V1 Phase B (demuxer keeps argv free of per-clip filter text).

```ts
export function buildBrollConcatArgs(input: {
  localConcatListPath: string;   // .../concat.txt inside job temp dir
  localClipPaths: string[];      // broll-0.mp4 … broll-(n-1).mp4 — length 1..8
  localVoiceoverPath: string;
  localOutputPath: string;
  targetDurationSec: number;
  toleranceSec: number;
  coldOpenTrimSec: number | null;
}): string[];
```

**Temp basename scheme** under `/tmp/neuramark-assembly/{assemblyJobId}/`:

| File | Role |
|------|------|
| `broll-0.mp4` … `broll-7.mp4` | Downloaded owned clips (array order) |
| `concat.txt` | Server-written demuxer list — lines `file '{absolutePath}'` for each clip only |
| `voiceover.{mp3\|wav\|m4a}` | Owned voiceover |
| `output.mp4` | Final assembled output |

**Worker writes `concat.txt`** before spawn — contents = absolute paths to `broll-N.mp4` in the same temp dir only. Builder receives `localConcatListPath` + numerics; it does **not** invent paths from asset ids.

**Frozen constants:** same as Phase A — 1080×1920, libx264 (`veryfast`/`crf 23`), aac `128k`, yuv420p, scale+crop filter.

**Duration:** after concat, apply trim/pad so `abs(actual - target) <= NEURAMARK_ASSEMBLY_DURATION_TOLERANCE_SEC` (default **2**).

**Cold-open:** when `coldOpenTrimSec != null`, apply lead skip as numeric `-ss {coldOpenTrimSec}` on the concat input (or equivalent numeric-only placement) — **never** interpolate notes.

**Forbidden in argv:** `brollBeats`, raw `cold_open_notes`, Operator text, `storage_key`, original filenames, any `http(s):` URL, shell metacharacters from user input.

**Spawn (worker only):** `spawn('ffmpeg', args, { shell: false })` — same Phase A vetoes (`exec` / shell string = REJECT).

**Example snapshot (2 clips, trim to 30s, cold-open 2s):**

```json
[
  "-y",
  "-ss", "2",
  "-f", "concat",
  "-safe", "0",
  "-i", "/tmp/neuramark-assembly/{jobId}/concat.txt",
  "-i", "/tmp/neuramark-assembly/{jobId}/voiceover.mp3",
  "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
  "-map", "0:v:0", "-map", "1:a:0",
  "-c:a", "aac", "-b:a", "128k",
  "-t", "30",
  "/tmp/neuramark-assembly/{jobId}/output.mp4"
]
```

---

## Phase B — `runAssemblyJob` faceless branch

| Step | Action |
|------|--------|
| 1 | Claim `queued` → `processing` (unchanged) |
| 2 | Read `assembly_path_tag` + `broll_asset_ids` + FKs from **job row** (enqueue snapshot) |
| 3 | If `assembly_path_tag = 'primary'` → existing Phase A path (`buildReelV1BasicArgs`) |
| 4 | If `broll_stitch`: for **each** id in `broll_asset_ids` (+ voiceover): `WHERE id AND client_id = job.client_id` — any miss → `failed` sanitized, **no** spawn |
| 5 | Download clips in array order to `broll-N.mp4`; write `concat.txt`; download voiceover |
| 6 | `buildBrollConcatArgs({...})` → `spawn(..., { shell: false })` |
| 7 | Probe duration vs tolerance → upload `assembled_reel` → `completed` |
| 8 | `finally` delete temp tree; no CDN/`fetch(`; do not log argv/stderr/keys |

**Clip-set determinism:** worker **must not** re-query broll jobs to expand/shrink the set. Optional defensive check: recompute fingerprint from row FKs + `broll_asset_ids` + `assembly_path_tag`; if ≠ stored `input_fingerprint` → `failed` + `scripts.assembly.failure.fingerprintMismatch` (corruption guard — not the primary race fix).

---

## Phase B — Orchestrator INSERT deltas

`createAssemblyJobForReelScript` after resolve:

| Field | Stitch path | Primary / degrade path |
|-------|-------------|------------------------|
| `assembly_path_tag` | `broll_stitch` | `primary` |
| `broll_asset_ids` | ordered uuid[] (1..8) | `NULL` or `{}` |
| `primary_video_asset_id` | nullable | required |
| `voiceover_asset_id` | required | per Phase A |
| `input_fingerprint` | five-part formula | five-part with empty broll + `primary` |
| Trigger | still `{ reelScriptId }` only | same |

---

## Phase B — Forbidden request keys (extend)

Append to `FORBIDDEN_ASSEMBLY_AUTHORITY_KEYS`:

```ts
  "brollAssetIds",
  "broll_asset_ids",
  "clipPaths",
  "clip_paths",
  "clipUrls",
  "clip_urls",
  "concatList",
  "concat_list",
  "concatListPath",
  "concat_list_path",
  "ffmpegArgs",
  "ffmpeg_args",
  "pathTag",
  "path_tag",
  "assemblyPathTag",
  "assembly_path_tag",
  "coldOpenTrimSec",
  "cold_open_trim_sec",
```

Trigger schema remains **`{ reelScriptId: uuid }` only**.

---

## Phase B — Error codes + messageKeys

| Code | messageKey (examples) | When |
|------|----------------------|------|
| `ASSEMBLY_INPUTS_INCOMPLETE` | `scripts.assembly.errors.facelessWaitingForClips` | Faceless + 0 broll + no primary |
| `ASSEMBLY_INPUTS_INCOMPLETE` | `scripts.assembly.errors.facelessMissingVoiceover` | Stitch path without owned voiceover |
| `ASSEMBLY_INPUTS_INCOMPLETE` | `scripts.assembly.errors.facelessNoPrimary` | *(legacy Phase A key — prefer waiting/missing keys above for faceless)* |
| `ASSEMBLY_INPUTS_INCOMPLETE` | `scripts.assembly.errors.missingAudio` | Primary degrade remux edge without VO |
| `FORBIDDEN_FIELDS` | — | Extended broll/path/URL keys |
| *(job failed)* | `scripts.assembly.failure.fingerprintMismatch` | Row fingerprint ≠ recomputed from persisted FKs |
| *(job failed)* | `scripts.assembly.failure.staleTimeout` | Unchanged |
| *(job failed)* | `scripts.assembly.failure.ffmpeg` / duration / ownership | Sanitized — no argv/vendor |

No new top-level error code required beyond Phase A set unless BUILD needs `ASSEMBLY_CLIP_SET_INVALID` — prefer `failed` + sanitized `failure_reason` key for worker-side clip ownership failures.

---

## Phase B — Zod / contract mirror deltas (`lib/contracts/assembly-job.ts`)

| Export | Change |
|--------|--------|
| `ASSEMBLY_PATH_TAG_PRIMARY` / `ASSEMBLY_PATH_TAG_BROLL_STITCH` | Exact string constants |
| `assemblyPathTagSchema` | `z.enum(["primary", "broll_stitch"])` |
| `resolveAssemblyInputs` success type | Add `pathTag`, `brollAssetIds`, `coldOpenTrimSec`; `primaryVideoAssetId` nullable |
| `operatorAssemblyJobDtoSchema` | Add optional readiness: `assemblyPathTag?`, `canAssemble` semantics (§ FE); **do not** expose full `brollAssetIds` list in poll DTO by default (ids optional omit — prefer boolean readiness) |
| `FORBIDDEN_ASSEMBLY_AUTHORITY_KEYS` | Extended list above |
| `assemblyJobErrorCodeSchema` | Unchanged codes; new messageKeys documented |
| Week-batch / DTO | `canAssemble: true` when server resolve would succeed for current script (faceless stitch **or** primary/degrade) |

**FE readiness (server-authoritative):**

```ts
// On OperatorAssemblyJobDto / batch null-entry companion fields (BUILD may attach on script DTO):
canAssemble: boolean; // true when faceless+(≥1 broll + voiceover) OR primary inputs complete
// FE must NOT invent asset ids; enable Assemble when canAssemble === true (or equivalent batch flag).
```

Prefer deriving `canAssemble` in `getAssemblyJobsForReelScripts` / week load via lightweight readiness helper that mirrors resolve gates **without** INSERT.

---

## Phase B — FE enablement (thin)

| Element | Rule |
|---------|------|
| **Assemble Reel** | Enable for `modalidad === faceless` when server signals inputs complete (≥1 completed owned broll **+** voiceover, **or** completed primary for degrade) — today gated on primary only |
| Preview | **Reuse** existing assembled preview player — **no** B-roll strip / stitch preview UI |
| Trigger | Still `assembleReelForScript({ reelScriptId })` only |
| i18n | EN+ES for `facelessWaitingForClips`, `facelessMissingVoiceover` (prefer **Video sin rostro** / **Ensamblado** in copy — CONTEXT) |
| Out | No client-supplied clip lists; no Cliente UI |

---

## Phase B — Fixtures

### Faceless stitch enqueue success

```json
{
  "ok": true,
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "queued",
  "idempotent": false
}
```

*(Row internals — not FE DTO: `assembly_path_tag=broll_stitch`, `broll_asset_ids=[…]`, voiceover set.)*

### Faceless waiting for clips

```json
{
  "ok": false,
  "error": {
    "code": "ASSEMBLY_INPUTS_INCOMPLETE",
    "messageKey": "scripts.assembly.errors.facelessWaitingForClips"
  }
}
```

### Faceless missing voiceover

```json
{
  "ok": false,
  "error": {
    "code": "ASSEMBLY_INPUTS_INCOMPLETE",
    "messageKey": "scripts.assembly.errors.facelessMissingVoiceover"
  }
}
```

### Batch readiness (faceless ready)

```json
{
  "assemblyByReelScriptId": {
    "f47ac10b-58cc-4372-a567-0e02b2c3d479": {
      "jobId": null,
      "reelScriptId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "status": null,
      "templateId": "reel_v1_basic",
      "targetDurationSec": 30,
      "actualDurationSec": null,
      "outputMediaAssetId": null,
      "failureReason": null,
      "canAssemble": true,
      "canReassemble": false,
      "createdAt": null,
      "updatedAt": null
    }
  }
}
```

*(Exact null-job shape at BUILD may use a readiness-only companion field on the script row if `OperatorAssemblyJobDto` requires `jobId` — FE Reviewed line must confirm.)*

---

## Phase B — Test files (BUILD)

| File | Covers |
|------|--------|
| `lib/assembly/ffmpeg/build-broll-concat-args.test.ts` | Golden argv: 1/3/8 clips; cold-open present/absent; trim/pad; **no** beat/notes strings in argv |
| `lib/assembly/parse-cold-open-trim-sec.test.ts` | Regex accept/reject; bounds vs target; metacharacter notes → `null` |
| `lib/assembly/resolve-assembly-inputs.phase-b.test.ts` | Faceless order `created_at ASC`; cap 8; talking-head ignores broll; zero→degrade/incomplete; ownership fail-closed; voiceover required on stitch |
| `lib/assembly/create-assembly-job-for-reel-script.phase-b.test.ts` | Fingerprint includes ordered ids + `path_tag`; persists `broll_asset_ids`; forbidden broll keys; Cliente 403 |
| `lib/assembly/run-assembly-job.phase-b.test.ts` | Uses persisted ids only; cross-tenant clip → failed no spawn; mocked spawn array + `shell: false`; degrade branch calls Phase A builder |
| `lib/assembly/find-forbidden-assembly-keys.test.ts` | Extended Phase B keys |
| Grep / security | No `fetch(` in `lib/assembly/**`; no `exec(`; degrade fixtures lack CDN/argv/key substrings |

---

## Phase B — Security test matrix (additive)

| Test | Expect |
|------|--------|
| Forbidden `brollAssetIds` / `clipPaths` / `path_tag` | `FORBIDDEN_FIELDS` |
| Cliente assemble | `403` |
| Cross-tenant broll asset on row | `failed` / incomplete — no spawn |
| `buildBrollConcatArgs` + malicious `cold_open_notes` fixture | notes string absent from argv |
| Mocked spawn | `string[]`, `shell: false` |
| Talking-head + present broll | Phase A builder only — no concat |
| Degrade/incomplete messages | no vendor/CDN/argv/`storage_key` |
| Grep no `fetch(` downloads in `lib/assembly/**` | pass |
| Fingerprint changes when broll ordered set changes | new idempotency bucket |

---

## Phase B — Acceptance mapping (for validator)

Same USER_STORIES § US-9.1 AC (do **not** add checkboxes):

| AC | Phase B proof |
|----|---------------|
| 9:16 output | concat → scale/crop 1080×1920 |
| Duration ± tolerance | post-stitch trim/pad + `NEURAMARK_ASSEMBLY_DURATION_TOLERANCE_SEC` |
| Idempotency | fingerprint includes ordered broll ids + `path_tag`; persisted clip set |
| `[SEC]` args-array | `build-broll-concat-args` + spawn |
| `[SEC]` no assembly-time URL fetch | Storage SDK multi-clip only |

**Residual (VALIDATION Phase B note):** rewind FX + weekly auto-assemble still open.

---

## Reviewed by FE (Phase B)

**Reviewed by FE:** **approved** — 2026-08-31 (nextjs-frontend)

Phase B assembly on `/operator/scripts` is implementable against this amendment:

- **Surface:** Same `OperatorAssemblyPanel` on expand row — **no new route**, no B-roll strip / stitch preview UI.
- **Assemble enablement:** FE BUILD must stop treating primary-completed as the sole gate for faceless. Enable **Assemble Reel** when server `canAssemble === true` (faceless stitch = ≥1 owned broll + voiceover, **or** primary degrade). Keep `assembleReelForScript({ reelScriptId })` only — never send clip lists / asset ids.
- **Preview:** Reuse existing `<video src="/api/media/assets/{outputMediaAssetId}">` when `completed` — same authenticated serve as Phase A.
- **i18n (landed at signoff):** EN+ES `scripts.assembly.errors.facelessWaitingForClips`, `facelessMissingVoiceover`; `scripts.assembly.failure.fingerprintMismatch`. Prefer **Video sin rostro** / **Ensamblado** in ES product copy.
- **Out of scope:** No Cliente routes; no FFmpeg / `broll_asset_ids` / `path_tag` in UI.

### FE BUILD constraints (binding for thin FE slice)

| # | Constraint |
|---|------------|
| 1 | **Server-authoritative readiness.** Today `OperatorAssemblyPanel` uses `canAssembleInitial = job === null && hasPrimaryVideo` (Phase A). Phase B FE must prefer `job?.canAssemble === true` and **not** invent readiness from client-side broll/video job maps. |
| 2 | **No-job readiness shape.** Fixture with `jobId: null` does **not** match current `operatorAssemblyJobDtoSchema` (`jobId` uuid required). **BE must ship one of:** (a) companion `assemblyReadinessByReelScriptId` / script-row `canAssemble` when map entry is `null`, **or** (b) nullable-job readiness DTO Zod that FE can parse. FE will not guess clip completeness. |
| 3 | **Talking-head fallback.** Primary-only local gate may remain as convenience **only** when `modalidad !== faceless` **or** until readiness DTO lands — never block faceless stitch when server says `canAssemble`. |
| 4 | **Poll merge.** Continue preserving `canAssemble` when merging `GET /api/assembly-jobs/[jobId]` (poll omits it). |
| 5 | **Optional DTO:** `assemblyPathTag?` on batch DTO is display-optional — FE does not require it for enablement. |

Signoff checklist:

- [x] Enable **Assemble** when faceless + server `canAssemble` (broll+VO or primary degrade) — not primary-only (**FE BUILD**)
- [x] No client asset ids / clip lists on mutate
- [x] Reuse existing preview; map new `messageKey`s EN+ES (**i18n landed at signoff**)
- [x] Confirm readiness DTO shape (batch null-job vs companion flag) — **prefer companion / nullable readiness; see constraint #2**

---

# Phase B-M2 — Atomic assembly claim + queued-only poll

**Status:** Frozen — 2026-08-31 (spec-guardian) · **Reviewed by FE: N/A — no FE surface** (PO M2-9 waiver) · **BUILD unblocked** (no FE signoff required)  
**Sprint:** `US-9.1-B-M2` · branch `feature/US-9.1-b-m2-assembly-poll-claim`  
**Sources:** `PHASE-B-M2.md` (M2-1…M2-11) · `SECURITY.md` Phase B-M2 (lean amend — worker claim AC) · QA Phase A Finding 1 · QA-PHASE-B Medium #1  
**DB:** **None** — claim via conditional UPDATE on existing `neuramark_assembled_reels` row (optional SQL RPC at implementer discretion; not required).  
**FE:** **None** — Operator panel unchanged; stale-`processing` → `failed` path already surfaced.  
**Phase A/B floors:** Remain binding. This section **amends** `applyAssemblyJobUpdate`, `pollQueuedAssemblyJobsBatch`, and `runAssemblyJob` step 1 — does **not** rewrite fingerprint, broll concat, resolve rules, or DTO shapes.

**Acceptance boundary (narrow — binding):** Close assembly poll claim race — exactly one worker may proceed from `queued` to FFmpeg per row; concurrent Fly replicas or dev in-process + poll overlap exit silently on lost claim. **Do not** add or uncheck USER_STORIES § US-9.1 AC. **Do not** bundle US-9.2 branding poll claim (CLOSED US-9.2-B-M2 — mirror pattern only).

---

## Phase B-M2 — SECURITY reconciliation (lean)

| # | Condition | Frozen here |
|---|-----------|-------------|
| 1 | Claim is **worker-only** — no new client authority, endpoints, or DTO fields | § Out of scope · § Claim mechanism |
| 2 | Integrity / spend control — prevents duplicate FFmpeg and orphaned `assembled_reel` assets | § Runner gate · § Poll batch |
| 3 | Lost claim returns **`idempotent: true`** — **no throw**; loser must not download or spawn | § Applier contract |
| 4 | Stale `processing` remains worker-only via `markStaleAssemblyJobsFailed` — no mid-`processing` auto-resume from poll | § Poll batch · § Stale policy |
| 5 | `onAssemblyJobCompleted` fires only on **successful** `completed` transition — lost claim must **not** trigger branding auto-chain | § Runner gate · M2-7 |

---

## Phase B-M2 — Claim mechanism (frozen)

**File (BUILD):** `lib/assembly/apply-assembly-job-update.ts` (extend existing applier)

**Intent:** Per-job atomic claim via conditional UPDATE — not batch `FOR UPDATE SKIP LOCKED` on SELECT (Supabase JS has no first-class SKIP LOCKED; per-row UPDATE is the correctness gate). Mirror **CLOSED** US-9.2-B-M2 branding claim pattern for **`status`** (not `branding_status`).

**SQL semantics (binding):**

```sql
UPDATE neuramark_assembled_reels
SET
  status = 'processing',
  updated_at = now()
WHERE
  id = $assemblyJobId
  AND status = 'queued'
RETURNING id;
```

**Supabase JS equivalent (binding behavior, not module name):**

```ts
const { data, error } = await supabase
  .from("neuramark_assembled_reels")
  .update({
    status: "processing",
    updated_at: new Date().toISOString(),
  })
  .eq("id", assemblyJobId)
  .eq("status", "queued")
  .select("id");

// data.length === 0 ⇒ lost race (another worker claimed first)
```

| Rule | Detail |
|------|--------|
| Predicate | **`status = 'queued'`** only — only `queued` rows are claimable |
| Zero rows | Lost race — **do not throw**; return idempotent success (§ Applier contract) |
| Optional RPC | Implementer may use raw SQL / RPC instead of Supabase `.update().select()` — PO requires M2-2…M2-5 behavior, not a specific module |

---

## Phase B-M2 — `applyAssemblyJobUpdate` amend (processing claim)

**File (BUILD):** `lib/assembly/apply-assembly-job-update.ts`

**Amends** § `applyAssemblyJobUpdate` — sole status writer (Phase A). Terminal / illegal transitions keep existing idempotent behavior.

### Step table — `processing` claim patch

| Step | Action |
|------|--------|
| 1 | Load job row (service-role) — unchanged |
| 2 | If current status is terminal (`completed` \| `failed`) → return `{ ok: true, idempotent: true, status: <current> }` — unchanged |
| 3 | If transition `queued` → `processing` is not allowed from loaded status → return `{ ok: true, idempotent: true, status: <current> }` — unchanged |
| 4 | Issue conditional UPDATE: `SET status = 'processing', updated_at = now()` **WHERE** `id = $assemblyJobId AND status = 'queued'` with `.select("id")` (RETURNING) |
| 5 | If UPDATE returns **≥ 1 row** → `{ ok: true, jobId, status: "processing", idempotent: false }` |
| 6 | If UPDATE returns **0 rows** (lost race — peer claimed, row already `processing` / terminal, or status changed) → re-load row (optional) → `{ ok: true, jobId, status: <current or "queued">, idempotent: true }` — **do not throw** |
| 7 | Supabase / DB error → throw (unchanged) |

### Rows-affected contract (binding)

When `patch.status === "processing"`:

| Outcome | Return shape |
|---------|--------------|
| UPDATE matches **≥ 1 row** | `{ ok: true, jobId, status: "processing", idempotent: false }` |
| UPDATE matches **0 rows** (lost race) | `{ ok: true, jobId, status: <current from re-load or queued>, idempotent: true }` — **do not throw** |
| Supabase / DB error | Throw (unchanged) |

**Binding fix:** Current implementation issues `.in("status", ["queued", "processing"])` but **does not** inspect rows affected and always returns `idempotent: false` on no error. BUILD **must** use `.eq("status", "queued").select("id")` for the claim path and treat **zero returned rows** as lost claim.

**Other patches (`completed`, `failed`):** Unchanged — still use `.in("status", ["queued", "processing"])` or equivalent conditional on prior status; terminal no-op remains `idempotent: true`. **`onAssemblyJobCompleted`** fires only when `completed` patch succeeds with **≥ 1 row** updated (M2-7).

**Only invokers:** Unchanged — `runAssemblyJob`, `markStaleAssemblyJobsFailed`. **Zero** browser-callable paths.

---

## Phase B-M2 — Poll batch amend (`queued`-only)

**File (BUILD):** `lib/assembly/poll-assembly-jobs.ts`

**Amends** § Poll runtime — Fly worker vs dev in-process. Supersedes illustrative diagram prose `status IN ('queued','processing')` on worker SELECT.

### `pollQueuedAssemblyJobsBatch` step table (frozen)

| Step | Action |
|------|--------|
| 1 | If Supabase not configured → return (unchanged) |
| 2 | `markStaleAssemblyJobsFailed()` — **before** batch SELECT (unchanged) |
| 3 | SELECT candidate ids: **`status = 'queued'`** only — **not** `.in(["queued", "processing"])` |
| 4 | Order by `updated_at ASC`, limit batch size (default 5) |
| 5 | For each id: `await runAssemblyJob(jobId)` — try/catch per row (unchanged) |

### Predicate (frozen)

```ts
// Candidate set — queued ONLY
.from(ASSEMBLY_JOBS_TABLE)
.select("id")
.eq("status", "queued")   // NOT .in(["queued", "processing"])
.order("updated_at", { ascending: true })
.limit(limit);
```

| Rule | Detail |
|------|--------|
| Candidate set | **`status = 'queued'`** only — drop `processing` from poll predicate |
| Stuck `processing` | Owned by **`markStaleAssemblyJobsFailed()`** each tick **before** batch SELECT — stale → `failed` → Operator **Re-assemble** |
| No mid-`processing` resume | Poll must **not** re-enter `runAssemblyJob` for rows already `processing` (avoids double FFmpeg without lease columns) |
| Per-row claim | Correctness gate is **`runAssemblyJob` → `applyAssemblyJobUpdate` processing claim** (§ Claim mechanism), not SELECT locking |
| Dev overlap | `enqueueAssemblyJob` fire-and-forget + Fly poll on same row: atomic claim ensures **one** FFmpeg winner; loser exits silently (optional debug/info log) |

**Stale sweep (re-assert):** `markStaleAssemblyJobsFailed()` runs each tick before poll — unchanged threshold `NEURAMARK_ASSEMBLY_STALE_TIMEOUT_MIN` (default 30).

**Worker loop (unchanged):** `runAssemblyWorkerLoop()` → `pollQueuedAssemblyJobsBatch()` → sleep `ASSEMBLY_JOB_POLL_INTERVAL_MS`.

---

## Phase B-M2 — `runAssemblyJob` step 1 amend (runner gate)

**File (BUILD):** `lib/assembly/run-assembly-job.ts`

**Amends** § `runAssemblyJob()` step 1 and placement **before** fingerprint recompute / `mkdtemp` / download / spawn (primary + broll_stitch paths).

### Step sequence (binding)

| Step | Action |
|------|--------|
| 0 | Load job; if missing or terminal (`completed` \| `failed`) → **return** |
| **1a** | If `status === 'processing'` **at entry** (before claim attempt) → **return immediately** — another worker owns the row; **no** resume-from-poll |
| **1b** | If `status === 'queued'` → `applyAssemblyJobUpdate({ patch: { status: "processing" }, source: "worker" })` |
| **1c** | If claim result `idempotent === true` → **return immediately** — lost race; **zero** `mkdtemp`, Storage download, or FFmpeg spawn |
| 2 | Re-load job; if missing or terminal → **return** |
| 3 | Defensive fingerprint recompute from persisted FKs — unchanged (§ Phase B faceless branch) |
| 4+ | Branch `assembly_path_tag` → `runPrimaryPath` \| `runBrollStitchPath` — unchanged |

```ts
// Pseudocode — exact helper structure free at BUILD
const job = await loadAssemblyJobByIdUnscoped(assemblyJobId);
if (!job || isTerminalAssemblyJobStatus(job.status)) return;

if (job.status === "processing") {
  return; // peer worker — no resume
}

if (job.status === "queued") {
  const claim = await applyAssemblyJobUpdate({
    assemblyJobId: job.id,
    patch: { status: "processing" },
    source: "worker",
  });
  if (claim.idempotent) {
    return; // lost race — silent exit
  }
}

const activeJob = await loadAssemblyJobByIdUnscoped(assemblyJobId);
// ... fingerprint guard, mkdtemp, download, spawn ...
```

| Rule | Detail |
|------|--------|
| Lost claim | **Silent exit** — optional `console.debug` / info log; **no** `failed` status (not an error — expected concurrency) |
| Winner | Exactly one worker proceeds to FFmpeg for a given `queued` → `processing` transition |
| Fingerprint guard | Remains **after** successful claim, **before** `mkdtemp` (unchanged) |
| Auto-chain | `onAssemblyJobCompleted` only on successful `completed` patch — lost claim must **not** fire branding enqueue (M2-7) |

---

## Phase B-M2 — Unit test fixture requirement (BUILD)

**File (BUILD):** `lib/assembly/run-assembly-job.test.ts` or `run-assembly-job.phase-b.test.ts` (extend)

| Fixture | Expect |
|---------|--------|
| Simulated lost claim — `applyAssemblyJobUpdate` returns `{ idempotent: true }` for `processing` patch | **`runAssemblyJob` returns** without `mkdtemp`, Storage download, or FFmpeg spawn |
| Simulated entry with `status === 'processing'` before claim | **Return** without spawn (peer owns row) |
| Happy path — claim returns `{ idempotent: false, status: "processing" }` | Proceeds to existing success path (primary + broll_stitch) |
| Optional concurrent-claim / double-call | Exactly **one** spawn winner per row |

**File (BUILD):** `lib/assembly/apply-assembly-job-update.test.ts` (extend or create)

| Fixture | Expect |
|---------|--------|
| `processing` patch when row already `processing` / not `queued` | `{ ok: true, idempotent: true }` — zero rows updated |
| `processing` patch when row `queued` | `{ ok: true, idempotent: false, status: "processing" }` |

---

## Phase B-M2 — Out of scope (explicit)

| Topic | Why |
|-------|-----|
| US-9.2 branding poll claim | **CLOSED** US-9.2-B-M2 — separate branch; do not bundle branding changes here (M2-11) |
| Batch `FOR UPDATE SKIP LOCKED` on poll SELECT | Optional implementer choice; per-job UPDATE is the PO-required gate (M2-3) |
| Mid-`processing` auto-resume from poll | Stale sweeper → `failed` → Operator re-assemble |
| Enqueue-time audio probe (QA Phase A Medium #2) | Separate follow-up — not M2 |
| Readiness companion on jobs SELECT error (QA-PHASE-B Medium #2) | Separate follow-up — not M2 |
| New USER_STORIES AC / unchecking Phase A/B AC | Out |
| Faceless stitch / fingerprint / broll concat | Closed Phase B — untouched |
| New endpoints / DTOs / FE | M2-8 / M2-9 |

---

## Phase B-M2 — Acceptance mapping (for validator)

Same USER_STORIES § US-9.1 AC (do **not** uncheck Phase A/B; **no** new checkboxes):

| QA finding | Phase B-M2 proof |
|------------|------------------|
| QA Phase A Finding 1 (poll claim race) | Lost claim → **zero** FFmpeg; winner completes happy path (primary + faceless stitch) |
| QA-PHASE-B Medium #1 (carry-forward) | Poll `queued`-only; atomic claim; `idempotent` skip on 0 rows |
| Stale sweeper regression | Stuck `processing` still → `failed`; queued-only poll does not starve legitimate work |
| Auto-chain regression | Lost claim does **not** invoke `onAssemblyJobCompleted` |

---

## Phase B-M2 — Reviewed by FE

**Reviewed by FE: N/A — no FE surface** (PO M2-9).

**Waiver:** Phase B-M2 hardens worker claim + poll predicate only. No DTO, Server Action, Route Handler, or UI change. FE signoff **not required**. Contract frozen; **BUILD unblocked**.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-08-31 | **Phase B-M2 freeze** — atomic `queued`→`processing` claim via conditional UPDATE + RETURNING; `idempotent: true` on lost race; `runAssemblyJob` early return before temp/download/spawn; poll `queued`-only; FE Reviewed N/A; BUILD unblocked |
| 2026-08-31 | **Reviewed by FE (Phase B)** — approved; i18n messageKeys; FE BUILD constraints on `canAssemble` readiness DTO |
| 2026-08-31 | **Phase B freeze** — faceless broll resolve (ASC, max 8); persist `broll_asset_ids` + `assembly_path_tag`; fingerprint five-part + `path_tag`; `buildBrollConcatArgs` concat demuxer; degrade/voiceover/cold-open bounds; Zod/test/FE readiness; SECURITY 10 conditions. FE Phase B review **pending** |
| 2026-08-30 | Reviewed by FE — nextjs-frontend signoff; BUILD unblocked for FE slice |
| 2026-08-30 | Initial freeze — assembly pipeline DDL, orchestrator, worker seam, FFmpeg Phase A graph, DTOs, media serve; resolves SPEC-REVIEW + SECURITY gaps |
