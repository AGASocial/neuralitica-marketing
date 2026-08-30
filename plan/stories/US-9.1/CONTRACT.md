Reviewed by FE: pending

# API Contract — US-9.1 Assemble final 9:16 Reel

**Story:** US-9.1  
**Status:** Frozen — 2026-08-30  
**Security:** `plan/stories/US-9.1/SECURITY.md` (APPROVE WITH CONDITIONS — reconciled below)  
**Spec review:** `plan/stories/US-9.1/SPEC-REVIEW.md` (GAPS — resolved by this contract)  
**Pattern:** `plan/stories/US-8.4/CONTRACT.md` (poll seam, Operator DTOs, forbidden keys, migration SQL verbatim)  
**Depends on:** US-8.4 ✅ primary video jobs + poller · US-9.3 ✅ voiceover assets · US-8.3 ✅ manual primary · US-8.2/8.6 ✅ SadTalker/MuseTalk baked VO · US-5.1 ✅ `target_duration_sec` + `modalidad` · US-6.1 ✅ (sequencing only) · US-14.5 ✅ `requireOperator()`  
**ADR:** `docs/adr/0003-worker-flyio-ffmpeg.md` — Vercel orchestrator INSERT + enqueue; Fly FFmpeg + status writes  
**Feature branch:** `feature/US-9.1-assemble-reel`  
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
| **A (US-9.1 BUILD — ship first)** | `neuramark_assembled_reels` migration; `assembled_reel` enum + storage CHECK; `createAssemblyJobForReelScript`; Phase A FFmpeg **`reel_v1_basic`** (1080×1920 normalize/mux); Fly worker loop + dev in-process seam; Operator UI + poll; idempotency; duration ± tolerance AC; SEC guards | USER_STORIES § US-9.1 AC rows (9:16, duration tolerance, idempotency, `[SEC]` FFmpeg + SSRF) |
| **B (follow-up BUILD slice — after US-8.5 or explicit PO pull-in)** | Faceless multi-clip B-roll stitch; minimal `cold_open_notes` numeric trim; `broll_beats` metadata consumer; graceful B-roll absence degrade | SPEC §3 S3.M10 partial: B-roll + `editing_hints`; USER_STORIES US-8.5 AC “stitched in assembly” |

**VALIDATION note (binding):** If Phase B is deferred at BUILD time, **`VALIDATION.md`** must document **partial SPEC S3.M10 closure**: no subtitles/logo/cover (US-9.2), no B-roll stitch / full `editing_hints` FX (Phase B), no weekly auto-assemble (ADR-0001 / integrations-engineer).

**Partial narrative closure:** Phase A does **not** satisfy the full USER_STORIES “combine voice, avatar/**B-roll**, template, and timing” sentence — only **primary video + timing** (+ voiceover remux edge). VALIDATION records this explicitly.

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

**Fingerprint (server-only):**

```ts
input_fingerprint = sha256(
  primary_video_asset_id + "|" + (voiceover_asset_id ?? "") + "|" + template_id
).hex(); // 64 lowercase hex chars
```

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
| 6 | **Phase A modalidad gate:** `modalidad = faceless` without completed primary → **`ASSEMBLY_INPUTS_INCOMPLETE`** + `messageKey: scripts.assembly.errors.facelessNoPrimary` |
| 7 | **`remuxVoiceover`:** `false` when primary probe reports audio stream; `true` when **no audio stream** — then **require** voiceover asset or **`ASSEMBLY_INPUTS_INCOMPLETE`** + `scripts.assembly.errors.missingAudio` |

**Phase B (deferred):** resolve multiple `asset_role = broll` jobs — not called in Phase A BUILD.

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

**Phase B stub:** `lib/assembly/ffmpeg/build-broll-concat-args.ts` — implement when US-8.5 lands; same spawn + ownership floors.

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
- **US-8.5** Wan B-roll adapter body (Phase B stitch)
- **US-10.1** QA agent · **US-11.x** approval/publish (Cliente serve widening)
- **Weekly cycle** auto-assemble (integrations-engineer / ADR-0001)
- **Cliente** assemble trigger
- **Multiple templates** / template admin UI
- **Preview vs final dual renditions** — single output asset
- **Assembly spend ledger** (`neuramark_reel_spend_events`) — optional `$0` stub not in Phase A
- **RBAC** beyond `requireOperator()`
- **Live FFmpeg in CI** — args builder unit tests + mocked spawn only

---

## Reviewed by FE

**Reviewed by FE:** pending

---

## Changelog

| Date | Change |
|------|--------|
| 2026-08-30 | Initial freeze — assembly pipeline DDL, orchestrator, worker seam, FFmpeg Phase A graph, DTOs, media serve; resolves SPEC-REVIEW + SECURITY gaps |
